import type {
  MatchConfidence,
  MetadataCandidate,
  MetadataConflict,
  MetadataLookupResult,
  MetadataProviderName,
  ProviderLookupStatusCode,
  ProviderStatusReport,
} from '../../types/domain';
import { extractIsbnsFromText, isbn13ToIsbn10, normalizeIsbnTo13 } from '../../utils/isbn';

export interface ProviderExecutionContext {
  fetchFn: typeof fetch;
  googleBooksApiKey?: string;
  timeoutMs: number;
}

export interface MetadataProviderAdapter {
  name: MetadataProviderName;
  label: string;
  supportsDirectBrowserCors: boolean;
  lookupByIsbn(isbn13: string, ctx: ProviderExecutionContext): Promise<MetadataCandidate[]>;
  search(query: string, ctx: ProviderExecutionContext): Promise<MetadataCandidate[]>;
}

export class ProviderStatusError extends Error {
  readonly statusCode: ProviderLookupStatusCode;
  constructor(statusCode: ProviderLookupStatusCode, message: string) {
    super(message);
    this.name = 'ProviderStatusError';
    this.statusCode = statusCode;
  }
}

export const PROVIDER_PRIORITY: Record<MetadataProviderName, number> = {
  hcm_library: 100,
  nlv_opac: 98,
  nxb_kim_dong: 92,
  nha_nam: 90,
  ipm: 88,
  amak: 86,
  adcbook: 84,
  gooda: 82,
  hikaru: 80,
  phuong_nam: 76,
  google_books: 72,
  open_library: 70,
  openbd: 68,
  tiki: 55,
  fahasa: 50,
  ocr_local: 30,
  ai_assist: 20,
  manual: 10,
};

function normalizeTextKey(input: string): string {
  return input
    .toLocaleLowerCase('vi')
    .replace(/\bnxb\b/g, 'nhà xuất bản')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isAllCaps(s: string): boolean {
  return s === s.toLocaleUpperCase('vi') && s !== s.toLocaleLowerCase('vi');
}

function addUniqueStrings(target: string[], incoming: string[] | undefined): void {
  if (!incoming?.length) return;
  const indexByKey = new Map<string, number>();
  target.forEach((existing, i) => {
    indexByKey.set(normalizeTextKey(existing), i);
  });
  for (const item of incoming) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = normalizeTextKey(trimmed);
    const existingIdx = indexByKey.get(key);
    if (existingIdx === undefined) {
      indexByKey.set(key, target.length);
      target.push(trimmed);
    } else {
      const current = target[existingIdx];
      if ((isAllCaps(current) && !isAllCaps(trimmed)) || (!isAllCaps(trimmed) && trimmed.length > current.length + 3)) {
        target[existingIdx] = trimmed;
      }
    }
  }
}

/**
 * Collects every valid normalized ISBN-13 present on a MetadataCandidate.
 */
export function collectCandidateIsbns(candidate: MetadataCandidate): string[] {
  const out: string[] = [];
  const add = (val: string | null | undefined) => {
    const norm = normalizeIsbnTo13(val);
    if (norm && !out.includes(norm)) out.push(norm);
  };

  add(candidate.isbn13);
  add(candidate.isbn10);
  for (const m of candidate.matchedIsbns ?? []) add(m);

  if (out.length === 0 && candidate.rawPayload) {
    try {
      const serialized = JSON.stringify(candidate.rawPayload);
      for (const found of extractIsbnsFromText(serialized)) {
        if (found.isbn13 && !out.includes(found.isbn13)) out.push(found.isbn13);
      }
    } catch {
      // Ignore non-serializable rawPayload
    }
  }
  return out;
}

/**
 * Classifies a candidate strictly against a requested ISBN (when performing ISBN lookup)
 * or marks as 'title_match' for keyword search.
 */
export function classifyCandidateMatch(
  candidate: MetadataCandidate,
  requestedIsbn: string | null
): {
  candidate: MetadataCandidate;
  confidence: MatchConfidence;
  candidateIsbns: string[];
  hasConflictingIsbn: boolean;
} {
  const candidateIsbns = collectCandidateIsbns(candidate);
  const normReq = normalizeIsbnTo13(requestedIsbn);

  if (!normReq) {
    return {
      candidate: {
        ...candidate,
        matchedIsbns: candidateIsbns,
        matchConfidence: candidate.matchConfidence ?? 'title_match',
      },
      confidence: candidate.matchConfidence ?? 'title_match',
      candidateIsbns,
      hasConflictingIsbn: false,
    };
  }

  const exactMatch = candidateIsbns.includes(normReq);
  if (exactMatch) {
    return {
      candidate: {
        ...candidate,
        isbn13: normReq,
        isbn10: normReq.startsWith('978') ? isbn13ToIsbn10(normReq) : null,
        matchedIsbns: candidateIsbns,
        matchConfidence: 'exact_isbn',
      },
      confidence: 'exact_isbn',
      candidateIsbns,
      hasConflictingIsbn: false,
    };
  }

  const hasConflictingIsbn = candidateIsbns.length > 0;
  return {
    candidate: {
      ...candidate,
      matchedIsbns: candidateIsbns,
      matchConfidence: 'unverified_isbn',
    },
    confidence: 'unverified_isbn',
    candidateIsbns,
    hasConflictingIsbn,
  };
}

function mergeTwoCandidates(
  primary: MetadataCandidate,
  secondary: MetadataCandidate
): MetadataCandidate {
  const conflicts: MetadataConflict[] = [...(primary.conflicts ?? [])];
  const recordConflict = (
    field: MetadataConflict['field'],
    valA: string | null | undefined,
    valB: string | null | undefined,
    providerB: MetadataProviderName
  ) => {
    if (!valA || !valB) return;
    if (normalizeTextKey(valA) === normalizeTextKey(valB)) return;
    const existing = conflicts.find((c) => c.field === field);
    if (existing) {
      if (!existing.values.some((v) => v.provider === providerB && normalizeTextKey(v.value) === normalizeTextKey(valB))) {
        existing.values.push({ provider: providerB, value: valB });
      }
    } else {
      conflicts.push({
        field,
        values: [
          { provider: primary.provider, value: valA },
          { provider: providerB, value: valB },
        ],
      });
    }
  };

  // Detect meaningful disagreements before supplementing missing values
  recordConflict('title', primary.title, secondary.title, secondary.provider);
  if (primary.pageCount && secondary.pageCount && primary.pageCount !== secondary.pageCount) {
    recordConflict(
      'pageCount',
      String(primary.pageCount),
      String(secondary.pageCount),
      secondary.provider
    );
  }
  if (
    primary.publishedYear &&
    secondary.publishedYear &&
    primary.publishedYear !== secondary.publishedYear
  ) {
    recordConflict(
      'publishedYear',
      String(primary.publishedYear),
      String(secondary.publishedYear),
      secondary.provider
    );
  }

  const authors = [...primary.authors];
  addUniqueStrings(authors, secondary.authors);

  const translators = [...primary.translators];
  addUniqueStrings(translators, secondary.translators);

  const illustrators = [...(primary.illustrators ?? [])];
  addUniqueStrings(illustrators, secondary.illustrators);

  const publishers = [...primary.publishers];
  addUniqueStrings(publishers, secondary.publishers);

  const genres = [...primary.genres];
  addUniqueStrings(genres, secondary.genres);

  const matchedIsbns = [...(primary.matchedIsbns ?? [])];
  for (const code of secondary.matchedIsbns ?? []) {
    if (!matchedIsbns.includes(code)) matchedIsbns.push(code);
  }

  const sources = new Set<MetadataProviderName>([
    ...(primary.sources ?? [primary.provider]),
    ...(secondary.sources ?? [secondary.provider]),
  ]);

  const description =
    primary.description && primary.description.length >= (secondary.description?.length ?? 0)
      ? primary.description
      : secondary.description || primary.description;

  // Prefer fuller title only if primary was placeholder
  const title =
    primary.title && primary.title !== 'Untitled'
      ? primary.title
      : secondary.title || primary.title;

  return {
    ...primary,
    title,
    subtitle: primary.subtitle || secondary.subtitle,
    originalTitle: primary.originalTitle || secondary.originalTitle,
    authors,
    translators,
    illustrators,
    publishers,
    publishingPartner: primary.publishingPartner || secondary.publishingPartner,
    publishedDate: primary.publishedDate || secondary.publishedDate,
    publishedYear: primary.publishedYear ?? secondary.publishedYear ?? null,
    language:
      primary.language && primary.language !== 'en'
        ? primary.language
        : secondary.language || primary.language,
    format: primary.format || secondary.format,
    pageCount: primary.pageCount ?? secondary.pageCount ?? null,
    genres,
    description,
    isbn13: primary.isbn13 || secondary.isbn13 || null,
    isbn10: primary.isbn10 || secondary.isbn10 || null,
    matchedIsbns,
    coverUrl: primary.coverUrl || secondary.coverUrl,
    seriesName: primary.seriesName || secondary.seriesName,
    volumeNumber: primary.volumeNumber || secondary.volumeNumber,
    sourceUrl: primary.sourceUrl || secondary.sourceUrl,
    sources: Array.from(sources),
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    rawPayload: {
      ...primary.rawPayload,
      mergedFrom: Array.from(sources),
    },
  };
}

function completenessScore(c: MetadataCandidate): number {
  let score = (PROVIDER_PRIORITY[c.provider] ?? 50) * 10;
  if (c.matchConfidence === 'exact_isbn') score += 5000;
  else if (c.matchConfidence === 'title_match') score += 1000;
  if (c.authors.length) score += 4;
  if (c.translators.length) score += 3;
  if (c.illustrators?.length) score += 2;
  if (c.publishers.length) score += 3;
  if (c.pageCount) score += 3;
  if (c.publishedYear) score += 2;
  if (c.coverUrl) score += 3;
  if (c.description) score += 1;
  return score;
}

/**
 * Deduplicates and merges candidates by normalized ISBN-13 (exact matches) or
 * normalized title+author, preserving conflicts and supplementing missing fields.
 */
export function mergeAndEnrichCandidates(
  candidates: MetadataCandidate[],
  requestedIsbn: string | null = null
): MetadataCandidate[] {
  const exactByIsbn = new Map<string, MetadataCandidate[]>();
  const otherByKey = new Map<string, MetadataCandidate[]>();

  for (const raw of candidates) {
    const classified = classifyCandidateMatch(raw, requestedIsbn);
    const cand = classified.candidate;

    // During strict ISBN lookup, discard candidates that belong to a DIFFERENT valid ISBN
    if (requestedIsbn && classified.hasConflictingIsbn) {
      continue;
    }

    if (cand.matchConfidence === 'exact_isbn' && cand.isbn13) {
      const group = exactByIsbn.get(cand.isbn13) ?? [];
      group.push(cand);
      exactByIsbn.set(cand.isbn13, group);
    } else {
      const key =
        cand.isbn13 ||
        `${normalizeTextKey(cand.title)}::${normalizeTextKey(cand.authors[0] ?? '')}`;
      const group = otherByKey.get(key) ?? [];
      group.push(cand);
      otherByKey.set(key, group);
    }
  }

  const mergeGroup = (group: MetadataCandidate[]): MetadataCandidate => {
    const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
    let acc: MetadataCandidate = {
      ...sorted[0],
      sources: sorted[0].sources ?? [sorted[0].provider],
    };
    for (let i = 1; i < sorted.length; i++) {
      acc = mergeTwoCandidates(acc, sorted[i]);
    }
    return acc;
  };

  const mergedExact = Array.from(exactByIsbn.values()).map(mergeGroup);
  const mergedOther = Array.from(otherByKey.values()).map(mergeGroup);

  // If we have exact ISBN matches during an ISBN lookup, keep only exact matches
  // (never pollute confirmed ISBN results with unverified/wrong title guesses).
  const finalList =
    requestedIsbn && mergedExact.length > 0
      ? mergedExact
      : [...mergedExact, ...mergedOther];

  return finalList.sort((a, b) => completenessScore(b) - completenessScore(a));
}

function classifyProviderError(err: unknown, adapter: MetadataProviderAdapter): {
  status: ProviderLookupStatusCode;
  message: string;
} {
  if (err instanceof ProviderStatusError) {
    return { status: err.statusCode, message: err.message };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('abort') || lower.includes('timeout')) {
    return { status: 'temporarily_unavailable', message: 'Request timed out' };
  }
  if (!adapter.supportsDirectBrowserCors && typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('cors')) {
      return {
        status: 'requires_configuration',
        message: 'Requires server/Edge Function proxy (CORS restricted in direct browser mode)',
      };
    }
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('api key')) {
    return { status: 'requires_configuration', message: msg };
  }
  if (lower.includes('403') || lower.includes('cloudflare') || lower.includes('protected')) {
    return { status: 'unsupported', message: msg };
  }
  return { status: 'temporarily_unavailable', message: msg || 'Provider request failed' };
}

export async function runProvidersWithIsolation(params: {
  mode: 'isbn' | 'query';
  input: string;
  adapters: MetadataProviderAdapter[];
  ctx: ProviderExecutionContext;
}): Promise<MetadataLookupResult> {
  const normIsbn = params.mode === 'isbn' ? normalizeIsbnTo13(params.input) : null;
  const rawResults: MetadataCandidate[] = [];

  const settled = await Promise.all(
    params.adapters.map(async (adapter): Promise<ProviderStatusReport> => {
      try {
        const list =
          params.mode === 'isbn'
            ? await adapter.lookupByIsbn(normIsbn ?? params.input, params.ctx)
            : await adapter.search(params.input, params.ctx);

        let exactCount = 0;
        const accepted: MetadataCandidate[] = [];
        for (const item of list) {
          const classified = classifyCandidateMatch(item, normIsbn);
          if (normIsbn && classified.hasConflictingIsbn) {
            continue;
          }
          if (classified.confidence === 'exact_isbn') exactCount++;
          accepted.push(classified.candidate);
        }

        rawResults.push(...accepted);
        return {
          provider: adapter.name,
          label: adapter.label,
          status: accepted.length > 0 ? 'matched' : 'no_match',
          candidateCount: accepted.length,
          exactMatchCount: exactCount,
        };
      } catch (err) {
        const info = classifyProviderError(err, adapter);
        return {
          provider: adapter.name,
          label: adapter.label,
          status: info.status,
          candidateCount: 0,
          exactMatchCount: 0,
          message: info.message,
        };
      }
    })
  );

  const candidates = mergeAndEnrichCandidates(rawResults, normIsbn);
  const exactMatchCount = candidates.filter((c) => c.matchConfidence === 'exact_isbn').length;

  return {
    candidates,
    providerStatuses: settled,
    queriedIsbn: normIsbn,
    exactMatchCount,
  };
}

export interface ManualDraftFields {
  title: string;
  originalTitle: string;
  authorsText: string;
  translatorsText: string;
  illustratorsText: string;
  publishersText: string;
  publishingPartner: string;
  genresText: string;
  language: string;
  pageCount: string;
  publishedYear: string;
  seriesName: string;
  volumeNumber: string;
  coverUrl: string;
  description: string;
  isbnInput: string;
}

/**
 * Applies a selected MetadataCandidate into a manual draft WITHOUT overwriting
 * any field the user has already manually edited/verified (unless empty).
 */
export function mergeCandidateIntoDraft(
  current: ManualDraftFields,
  cand: MetadataCandidate,
  userEditedFields: Iterable<keyof ManualDraftFields> = []
): ManualDraftFields {
  const edited = new Set(userEditedFields);
  const pickString = (
    field: keyof ManualDraftFields,
    incoming: string | undefined | null
  ): string => {
    const existingVal = current[field].trim();
    if (edited.has(field) && existingVal) return current[field];
    return incoming?.trim() || current[field];
  };

  return {
    title: pickString('title', cand.title),
    originalTitle: pickString('originalTitle', cand.originalTitle),
    authorsText: pickString('authorsText', cand.authors.join(', ')),
    translatorsText: pickString('translatorsText', cand.translators.join(', ')),
    illustratorsText: pickString('illustratorsText', (cand.illustrators ?? []).join(', ')),
    publishersText: pickString('publishersText', cand.publishers.join(', ')),
    publishingPartner: pickString('publishingPartner', cand.publishingPartner),
    genresText: pickString('genresText', cand.genres.join(', ')),
    language: pickString('language', cand.language || 'vi'),
    pageCount: pickString('pageCount', cand.pageCount ? String(cand.pageCount) : ''),
    publishedYear: pickString('publishedYear', cand.publishedYear ? String(cand.publishedYear) : ''),
    seriesName: pickString('seriesName', cand.seriesName),
    volumeNumber: pickString('volumeNumber', cand.volumeNumber),
    coverUrl: pickString('coverUrl', cand.coverUrl),
    description: pickString('description', cand.description),
    isbnInput: pickString('isbnInput', cand.isbn13 || cand.isbn10 || ''),
  };
}
