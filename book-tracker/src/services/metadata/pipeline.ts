import type {
  BookIdentifierType,
  ContributorCredit,
  FieldProvenanceEntry,
  MatchConfidence,
  MetadataCandidate,
  MetadataConflict,
  MetadataLookupResult,
  MetadataProviderName,
  MetadataTrustLevel,
  ProviderLookupStatusCode,
  ProviderStatusReport,
  ProviderTier,
  VerificationStatus,
} from '../../types/domain';
import {
  extractBookIdentifiersFromText,
  isbn13ToIsbn10,
  normalizeBookIdentifier,
  parseBookIdentifier,
} from '../../utils/isbn';
import { foldVietnameseDiacritics } from './htmlAndText';

export interface ProviderExecutionContext {
  fetchFn: typeof fetch;
  googleBooksApiKey?: string;
  isbndbApiKey?: string;
  worldcatToken?: string;
  nlkApiKey?: string;
  timeoutMs: number;
}

export interface MetadataProviderAdapter {
  name: MetadataProviderName;
  label: string;
  tier?: ProviderTier;
  region?: string;
  requiresApiKey?: boolean;
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
  // Tier 2 National Libraries & Authoritative Registries + Official Publishers
  hcm_library: 100,
  ndl_japan: 99,
  bnf_france: 98,
  nlv_opac: 97,
  loc_us: 96,
  nl_korea: 95,
  british_library: 94,
  taiwan_ncl: 93,
  nlc_china: 93,
  // Tier 3 Official Publishers & Verifiable Regional Catalogues
  nxb_kim_dong: 92,
  nha_nam: 90,
  first_news: 89,
  ipm: 88,
  amak: 86,
  nxb_tre: 85,
  adcbook: 84,
  gooda: 82,
  hikaru: 80,
  phuong_nam: 78,
  // Tier 1 Global Bibliographic Databases
  open_library: 76,
  google_books: 75,
  worldcat: 74,
  isbndb: 73,
  openbd: 71,
  crossref: 68,
  // Commercial Aggregators / Fallbacks
  tiki: 55,
  fahasa: 50,
  ocr_local: 30,
  ai_assist: 20,
  manual: 10,
};

const ISO_LANGUAGE_MAP: Record<string, string> = {
  en: 'en',
  eng: 'en',
  english: 'en',
  vi: 'vi',
  vie: 'vi',
  vietnamese: 'vi',
  'tiếng việt': 'vi',
  ja: 'ja',
  jp: 'ja',
  jpn: 'ja',
  japanese: 'ja',
  日本語: 'ja',
  ko: 'ko',
  kor: 'ko',
  korean: 'ko',
  한국어: 'ko',
  zh: 'zh',
  chi: 'zh',
  zho: 'zh',
  cmn: 'zh',
  chinese: 'zh',
  中文: 'zh',
  'zh-hant': 'zh-Hant',
  'zh-tw': 'zh-Hant',
  'zh-cn': 'zh-Hans',
  fr: 'fr',
  fre: 'fr',
  fra: 'fr',
  french: 'fr',
  de: 'de',
  ger: 'de',
  deu: 'de',
  german: 'de',
  es: 'es',
  spa: 'es',
  spanish: 'es',
  it: 'it',
  ita: 'it',
  pt: 'pt',
  por: 'pt',
  ru: 'ru',
  rus: 'ru',
  th: 'th',
  tha: 'th',
  id: 'id',
  ind: 'id',
};

/**
 * Normalizes OpenLibrary `/languages/eng`, MARC ISO-639-2 (`jpn`, `kor`, `vie`),
 * or human language labels into compact BCP-47 tags without biasing toward English or Vietnamese.
 */
export function normalizeLanguageCode(
  raw?: string | null,
  fallbackHints?: { isbn13?: string | null }
): string {
  if (raw) {
    const cleaned = raw
      .replace(/^\/languages\//i, '')
      .trim()
      .toLowerCase();
    if (ISO_LANGUAGE_MAP[cleaned]) return ISO_LANGUAGE_MAP[cleaned];
    if (/^[a-z]{2}(-[a-z0-9]{2,8})?$/i.test(cleaned)) return cleaned;
  }
  const isbn = fallbackHints?.isbn13 ?? '';
  if (isbn.startsWith('978604') || isbn.startsWith('978632') || isbn.startsWith('893')) return 'vi';
  if (isbn.startsWith('9784')) return 'ja';
  if (isbn.startsWith('97889')) return 'ko';
  if (isbn.startsWith('9787')) return 'zh';
  if (isbn.startsWith('978957') || isbn.startsWith('978986')) return 'zh-Hant';
  if (isbn.startsWith('9782')) return 'fr';
  if (isbn.startsWith('9783')) return 'de';
  return 'und';
}

export function getIsbnRegionalAffinity(isbn13: string): string {
  if (isbn13.startsWith('978604') || isbn13.startsWith('978632') || isbn13.startsWith('893')) return 'vi';
  if (isbn13.startsWith('9784')) return 'jp';
  if (isbn13.startsWith('97889')) return 'kr';
  if (isbn13.startsWith('9787')) return 'cn';
  if (isbn13.startsWith('978957') || isbn13.startsWith('978986')) return 'tw';
  if (isbn13.startsWith('9782')) return 'fr';
  if (isbn13.startsWith('9783')) return 'de';
  if (isbn13.startsWith('9780') || isbn13.startsWith('9781')) return 'en';
  return 'global';
}

function normalizeTextKey(input: string): string {
  return input
    .toLocaleLowerCase()
    .replace(/\bnxb\b/gi, 'nhà xuất bản')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isAllCaps(s: string): boolean {
  return s === s.toLocaleUpperCase() && s !== s.toLocaleLowerCase();
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
      if (
        (isAllCaps(current) && !isAllCaps(trimmed)) ||
        (!isAllCaps(trimmed) && trimmed.length > current.length + 3)
      ) {
        target[existingIdx] = trimmed;
      }
    }
  }
}

export function buildStructuredContributors(c: {
  authors?: string[];
  illustrators?: string[];
  translators?: string[];
  editors?: string[];
  contributors?: ContributorCredit[];
}): ContributorCredit[] {
  const out: ContributorCredit[] = [];
  const seen = new Set<string>();
  const push = (name: string, role: ContributorCredit['role']) => {
    const t = name.trim();
    if (!t) return;
    const k = `${role}:${normalizeTextKey(t)}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ name: t, role });
    }
  };
  for (const existing of c.contributors ?? []) push(existing.name, existing.role);
  for (const a of c.authors ?? []) push(a, 'author');
  for (const il of c.illustrators ?? []) push(il, 'illustrator');
  for (const tr of c.translators ?? []) push(tr, 'translator');
  for (const ed of c.editors ?? []) push(ed, 'editor');
  return out;
}

export function buildInitialProvenance(
  cand: MetadataCandidate,
  trust?: MetadataTrustLevel
): Record<string, FieldProvenanceEntry> {
  const effectiveTrust: MetadataTrustLevel =
    trust ?? (cand.matchConfidence === 'exact_isbn' ? 'verified' : 'approximate');
  const existing = { ...(cand.fieldProvenance ?? {}) };
  const stamp = (field: string, present: boolean) => {
    if (present && !existing[field]) {
      existing[field] = { provider: cand.provider, trust: effectiveTrust };
    }
  };
  stamp('title', Boolean(cand.title && cand.title !== 'Untitled'));
  stamp('originalTitle', Boolean(cand.originalTitle));
  stamp('translationTitle', Boolean(cand.translationTitle));
  stamp('authors', (cand.authors?.length ?? 0) > 0);
  stamp('translators', (cand.translators?.length ?? 0) > 0);
  stamp('illustrators', Boolean(cand.illustrators?.length));
  stamp('editors', Boolean(cand.editors?.length));
  stamp('publishers', (cand.publishers?.length ?? 0) > 0);
  stamp('publishingPartner', Boolean(cand.publishingPartner));
  stamp('distributor', Boolean(cand.distributor));
  stamp('publishedYear', Boolean(cand.publishedYear));
  stamp('language', Boolean(cand.language && cand.language !== 'und'));
  stamp('format', Boolean(cand.format));
  stamp('pageCount', Boolean(cand.pageCount));
  stamp('genres', (cand.genres?.length ?? 0) > 0);
  stamp('coverUrl', Boolean(cand.coverUrl));
  stamp('description', Boolean(cand.description));
  stamp('isbn13', Boolean(cand.isbn13));
  stamp('ean13', Boolean(cand.ean13));
  return existing;
}

/**
 * Collects every valid normalized ISBN-13 and GS1 EAN-13 (e.g. Vietnamese 893* codes)
 * present on a MetadataCandidate.
 */
export function collectCandidateIsbns(candidate: MetadataCandidate): string[] {
  const out: string[] = [];
  const add = (val: string | null | undefined) => {
    const norm = normalizeBookIdentifier(val);
    if (norm && !out.includes(norm)) out.push(norm);
  };

  add(candidate.isbn13);
  add(candidate.isbn10);
  add(candidate.ean13);
  for (const m of candidate.matchedIdentifiers ?? []) add(m);
  for (const m of candidate.matchedIsbns ?? []) add(m);

  if (out.length === 0 && candidate.rawPayload) {
    try {
      const serialized = JSON.stringify(candidate.rawPayload);
      for (const found of extractBookIdentifiersFromText(serialized)) {
        if (found.normalizedId && !out.includes(found.normalizedId)) {
          out.push(found.normalizedId);
        }
      }
    } catch {
      // Ignore non-serializable rawPayload
    }
  }
  return out;
}

export const collectCandidateIdentifiers = collectCandidateIsbns;

/**
 * Classifies a candidate strictly against a requested ISBN/EAN-13 (when performing identifier lookup)
 * or marks as 'title_match' / 'approximate_match' for keyword search.
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
  const candidateIds = collectCandidateIsbns(candidate);
  const candidateIsbnsOnly = candidateIds.filter((c) => c.startsWith('978') || c.startsWith('979'));
  const parsedReq = requestedIsbn ? parseBookIdentifier(requestedIsbn) : null;
  const normReq = parsedReq?.isValid ? parsedReq.normalizedId : null;
  const contributors = buildStructuredContributors(candidate);

  if (!normReq || !parsedReq) {
    const conf = candidate.matchConfidence ?? 'title_match';
    const enriched: MetadataCandidate = {
      ...candidate,
      contributors,
      matchedIsbns: candidateIsbnsOnly,
      matchedIdentifiers: candidateIds,
      ean13: candidate.ean13 || candidate.isbn13 || null,
      identifierType:
        candidate.identifierType ??
        (candidate.isbn13 ? 'isbn13' : candidate.ean13 ? 'ean13' : undefined),
      matchConfidence: conf,
      editionMatchLevel:
        candidate.editionMatchLevel ?? (conf === 'exact_isbn' ? 'exact_edition' : 'work_match'),
    };
    enriched.fieldProvenance = buildInitialProvenance(enriched);
    return {
      candidate: enriched,
      confidence: conf,
      candidateIsbns: candidateIds,
      hasConflictingIsbn: false,
    };
  }

  const exactMatch = candidateIds.includes(normReq);
  if (exactMatch) {
    const isIsbnTarget = parsedReq.isIsbn;
    const enriched: MetadataCandidate = {
      ...candidate,
      contributors,
      isbn13: isIsbnTarget ? normReq : null,
      isbn10: isIsbnTarget && normReq.startsWith('978') ? isbn13ToIsbn10(normReq) : null,
      ean13: normReq,
      identifierType: parsedReq.identifierType === 'ean13' ? 'ean13' : 'isbn13',
      matchedIsbns: candidateIsbnsOnly,
      matchedIdentifiers: candidateIds,
      matchConfidence: 'exact_isbn',
      editionMatchLevel: 'exact_edition',
      mismatchReason: undefined,
    };
    enriched.fieldProvenance = buildInitialProvenance(enriched, 'verified');
    return {
      candidate: enriched,
      confidence: 'exact_isbn',
      candidateIsbns: candidateIds,
      hasConflictingIsbn: false,
    };
  }

  const hasConflictingIsbn = candidateIds.length > 0;
  const conf: MatchConfidence =
    candidate.matchConfidence === 'approximate_match' || candidate.matchConfidence === 'title_match'
      ? candidate.matchConfidence
      : 'unverified_isbn';
  const enriched: MetadataCandidate = {
    ...candidate,
    contributors,
    matchedIsbns: candidateIsbnsOnly,
    matchedIdentifiers: candidateIds,
    matchConfidence: conf,
    editionMatchLevel: hasConflictingIsbn ? 'related_edition' : 'possible_edition',
    mismatchReason: hasConflictingIsbn
      ? `Source identifier (${candidateIds[0]}) does not match requested ${normReq}`
      : `Source record did not contain verifiable identifier ${normReq}`,
  };
  enriched.fieldProvenance = buildInitialProvenance(enriched, 'approximate');
  return {
    candidate: enriched,
    confidence: conf,
    candidateIsbns: candidateIds,
    hasConflictingIsbn,
  };
}

function titlesShareTokens(a: string, b: string): boolean {
  const tokA = new Set(normalizeTextKey(a).split(' ').filter((w) => w.length >= 2));
  const tokB = new Set(normalizeTextKey(b).split(' ').filter((w) => w.length >= 2));
  if (tokA.size === 0 || tokB.size === 0) return true;
  for (const w of tokA) {
    if (tokB.has(w)) return true;
  }
  return false;
}

function mergeTwoCandidates(
  primary: MetadataCandidate,
  secondary: MetadataCandidate
): MetadataCandidate {
  const conflicts: MetadataConflict[] = [...(primary.conflicts ?? [])];
  const contradictions: string[] = [...(primary.contradictions ?? [])];
  const secTrust: MetadataTrustLevel =
    secondary.matchConfidence === 'exact_isbn' ? 'verified' : 'approximate';

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
      if (
        !existing.values.some(
          (v) => v.provider === providerB && normalizeTextKey(v.value) === normalizeTextKey(valB)
        )
      ) {
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

  recordConflict('title', primary.title, secondary.title, secondary.provider);
  if (
    primary.title &&
    secondary.title &&
    primary.title !== 'Untitled' &&
    secondary.title !== 'Untitled' &&
    !titlesShareTokens(primary.title, secondary.title)
  ) {
    contradictions.push(
      `Title mismatch for same ISBN (${primary.title} [${primary.provider}] vs ${secondary.title} [${secondary.provider}])`
    );
  }
  if (
    primary.language &&
    secondary.language &&
    primary.language !== 'und' &&
    secondary.language !== 'und' &&
    primary.language.split('-')[0] !== secondary.language.split('-')[0]
  ) {
    recordConflict('language', primary.language, secondary.language, secondary.provider);
  }
  if (primary.format && secondary.format && primary.format !== secondary.format) {
    recordConflict('format', primary.format, secondary.format, secondary.provider);
  }
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
  recordConflict('distributor', primary.distributor, secondary.distributor, secondary.provider);
  recordConflict(
    'publishingPartner',
    primary.publishingPartner,
    secondary.publishingPartner,
    secondary.provider
  );

  const authors = [...primary.authors];
  addUniqueStrings(authors, secondary.authors);

  const translators = [...primary.translators];
  addUniqueStrings(translators, secondary.translators);

  const illustrators = [...(primary.illustrators ?? [])];
  addUniqueStrings(illustrators, secondary.illustrators);

  const editors = [...(primary.editors ?? [])];
  addUniqueStrings(editors, secondary.editors);

  const publishers = [...primary.publishers];
  addUniqueStrings(publishers, secondary.publishers);

  const genres = [...primary.genres];
  addUniqueStrings(genres, secondary.genres);

  const matchedIsbns = [...(primary.matchedIsbns ?? [])];
  for (const code of secondary.matchedIsbns ?? []) {
    if (!matchedIsbns.includes(code)) matchedIsbns.push(code);
  }

  const matchedIdentifiers = [...(primary.matchedIdentifiers ?? [])];
  for (const code of secondary.matchedIdentifiers ?? []) {
    if (!matchedIdentifiers.includes(code)) matchedIdentifiers.push(code);
  }

  const sources = new Set<MetadataProviderName>([
    ...(primary.sources ?? [primary.provider]),
    ...(secondary.sources ?? [secondary.provider]),
  ]);

  const provenance: Record<string, FieldProvenanceEntry> = {
    ...buildInitialProvenance(primary),
  };
  const secProv = buildInitialProvenance(secondary, secTrust);
  const takeProvIfFilled = (field: string, hadPrimary: boolean, hasMerged: boolean) => {
    if (!hadPrimary && hasMerged && !provenance[field]) {
      provenance[field] = secProv[field] ?? { provider: secondary.provider, trust: secTrust };
    }
  };

  const title =
    primary.title && primary.title !== 'Untitled'
      ? primary.title
      : secondary.title || primary.title;
  takeProvIfFilled('title', Boolean(primary.title && primary.title !== 'Untitled'), Boolean(title && title !== 'Untitled'));
  takeProvIfFilled('originalTitle', Boolean(primary.originalTitle), Boolean(primary.originalTitle || secondary.originalTitle));
  takeProvIfFilled('translationTitle', Boolean(primary.translationTitle), Boolean(primary.translationTitle || secondary.translationTitle));
  takeProvIfFilled('authors', primary.authors.length > 0, authors.length > 0);
  takeProvIfFilled('translators', primary.translators.length > 0, translators.length > 0);
  takeProvIfFilled('illustrators', Boolean(primary.illustrators?.length), illustrators.length > 0);
  takeProvIfFilled('editors', Boolean(primary.editors?.length), editors.length > 0);
  takeProvIfFilled('publishers', primary.publishers.length > 0, publishers.length > 0);
  takeProvIfFilled('publishingPartner', Boolean(primary.publishingPartner), Boolean(primary.publishingPartner || secondary.publishingPartner));
  takeProvIfFilled('distributor', Boolean(primary.distributor), Boolean(primary.distributor || secondary.distributor));
  takeProvIfFilled('publishedYear', Boolean(primary.publishedYear), Boolean(primary.publishedYear ?? secondary.publishedYear));
  takeProvIfFilled('language', Boolean(primary.language && primary.language !== 'und'), Boolean((primary.language && primary.language !== 'und') || secondary.language));
  takeProvIfFilled('format', Boolean(primary.format), Boolean(primary.format || secondary.format));
  takeProvIfFilled('pageCount', Boolean(primary.pageCount), Boolean(primary.pageCount ?? secondary.pageCount));
  takeProvIfFilled('coverUrl', Boolean(primary.coverUrl), Boolean(primary.coverUrl || secondary.coverUrl));
  takeProvIfFilled('description', Boolean(primary.description), Boolean(primary.description || secondary.description));
  takeProvIfFilled('isbn13', Boolean(primary.isbn13), Boolean(primary.isbn13 || secondary.isbn13));
  takeProvIfFilled('ean13', Boolean(primary.ean13), Boolean(primary.ean13 || secondary.ean13));

  const description =
    primary.description && primary.description.length >= (secondary.description?.length ?? 0)
      ? primary.description
      : secondary.description || primary.description;

  const language =
    primary.language && primary.language !== 'und'
      ? primary.language
      : secondary.language || primary.language;

  const contributors = buildStructuredContributors({
    authors,
    illustrators,
    translators,
    editors,
    contributors: [...(primary.contributors ?? []), ...(secondary.contributors ?? [])],
  });

  return {
    ...primary,
    title,
    subtitle: primary.subtitle || secondary.subtitle,
    originalTitle: primary.originalTitle || secondary.originalTitle,
    translationTitle: primary.translationTitle || secondary.translationTitle,
    editionName: primary.editionName || secondary.editionName,
    authors,
    translators,
    illustrators,
    editors,
    contributors,
    publishers,
    publishingPartner: primary.publishingPartner || secondary.publishingPartner,
    distributor: primary.distributor || secondary.distributor,
    publishedDate: primary.publishedDate || secondary.publishedDate,
    publishedYear: primary.publishedYear ?? secondary.publishedYear ?? null,
    language,
    format: primary.format || secondary.format,
    pageCount: primary.pageCount ?? secondary.pageCount ?? null,
    genres,
    description,
    isbn13: primary.isbn13 || secondary.isbn13 || null,
    isbn10: primary.isbn10 || secondary.isbn10 || null,
    ean13: primary.ean13 || secondary.ean13 || primary.isbn13 || secondary.isbn13 || null,
    identifierType: primary.identifierType || secondary.identifierType,
    matchedIsbns,
    matchedIdentifiers,
    coverUrl: primary.coverUrl || secondary.coverUrl,
    seriesName: primary.seriesName || secondary.seriesName,
    volumeNumber: primary.volumeNumber || secondary.volumeNumber,
    sourceUrl: primary.sourceUrl || secondary.sourceUrl,
    retrievedAt: primary.retrievedAt || secondary.retrievedAt,
    sources: Array.from(sources),
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    contradictions: contradictions.length > 0 ? contradictions : undefined,
    editionMatchLevel:
      contradictions.length > 0
        ? 'possible_edition'
        : primary.editionMatchLevel ?? 'exact_edition',
    fieldProvenance: provenance,
    rawPayload: {
      ...primary.rawPayload,
      mergedFrom: Array.from(sources),
    },
  };
}

function buildEditionIdentityKey(c: MetadataCandidate): string {
  const idKey = c.isbn13 || c.ean13;
  if (idKey) return `id:${idKey}`;
  // Never merge distinct editions just because title/authors match — differentiate by language, format, publisher, year, volume
  return [
    normalizeTextKey(c.title),
    normalizeTextKey(c.authors[0] ?? ''),
    (c.language || 'und').toLowerCase(),
    c.format || 'unknown',
    normalizeTextKey(c.publishers[0] ?? ''),
    String(c.publishedYear ?? ''),
    c.volumeNumber ?? '',
  ].join('::');
}

function completenessScore(c: MetadataCandidate): number {
  let score = (PROVIDER_PRIORITY[c.provider] ?? 50) * 10;
  if (c.matchConfidence === 'exact_isbn') score += 5000;
  else if (c.matchConfidence === 'approximate_match' || c.matchConfidence === 'title_match') {
    score += 1000;
  }
  if (c.editionMatchLevel === 'possible_edition') score -= 500;
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
 * Checks whether an exact-ISBN candidate already carries enough verified fields
 * to avoid unnecessary Stage 2 downstream provider requests.
 */
export function isSufficientlyVerifiedEdition(candidates: MetadataCandidate[]): boolean {
  const best = candidates.find((c) => c.matchConfidence === 'exact_isbn');
  if (!best || !best.title || best.title === 'Untitled' || best.authors.length === 0) {
    return false;
  }
  let supportingFields = 0;
  if (best.publishers.length > 0) supportingFields++;
  if (best.publishedYear) supportingFields++;
  if (best.pageCount) supportingFields++;
  if (best.coverUrl) supportingFields++;
  if (best.language && best.language !== 'und') supportingFields++;
  return supportingFields >= 2;
}

export function computeQueryRelevanceScore(
  cand: Pick<MetadataCandidate, 'title' | 'originalTitle' | 'subtitle' | 'authors'>,
  searchQuery?: string | null
): number {
  const rawQ = (searchQuery ?? '').trim();
  if (!rawQ) return 0;

  const fold = (s: string) =>
    foldVietnameseDiacritics(s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();

  const qFolded = fold(rawQ);
  if (!qFolded) return 0;

  const qTokens = qFolded.split(/\s+/).filter((t) => t.length >= 2);
  const titleFolded = fold(`${cand.title ?? ''} ${cand.originalTitle ?? ''} ${cand.subtitle ?? ''}`);
  const fullFolded = fold(`${titleFolded} ${(cand.authors ?? []).join(' ')}`);

  if (!fullFolded) return 0;

  let score = 0;
  if (titleFolded === qFolded) score += 100;
  else if (titleFolded.includes(qFolded)) score += 60;
  else if (fullFolded.includes(qFolded)) score += 45;

  const checkTokens = qTokens.length > 0 ? qTokens : [qFolded];
  let matchedCount = 0;
  for (const tok of checkTokens) {
    if (fullFolded.includes(tok)) matchedCount++;
  }
  if (matchedCount === 0) return 0;

  score += Math.round((matchedCount / checkTokens.length) * 40);
  if (matchedCount === checkTokens.length) score += 20;
  return score;
}

/**
 * Separates and merges exact edition matches apart from possible editions,
 * related editions, and work-level keyword matches. Conflicting different-ISBN
 * items during ISBN lookup are demoted to `relatedEditions` (or excluded from `exactMatches`).
 */
export function partitionAndMergeCandidates(
  candidates: MetadataCandidate[],
  requestedIsbn: string | null = null,
  searchQuery: string | null = null
): {
  exactMatches: MetadataCandidate[];
  possibleEditionMatches: MetadataCandidate[];
  relatedEditions: MetadataCandidate[];
  workMatches: MetadataCandidate[];
  approximateMatches: MetadataCandidate[];
  primaryCandidates: MetadataCandidate[];
} {
  const exactByIsbn = new Map<string, MetadataCandidate[]>();
  const relatedByKey = new Map<string, MetadataCandidate[]>();
  const possibleOrWorkByKey = new Map<string, MetadataCandidate[]>();

  for (const raw of candidates) {
    const classified = classifyCandidateMatch(raw, requestedIsbn);
    const cand = classified.candidate;

    if (requestedIsbn && classified.hasConflictingIsbn) {
      const rKey = buildEditionIdentityKey(cand);
      const grp = relatedByKey.get(rKey) ?? [];
      grp.push({ ...cand, editionMatchLevel: 'related_edition' });
      relatedByKey.set(rKey, grp);
      continue;
    }

    if (cand.matchConfidence === 'exact_isbn' && (cand.isbn13 || cand.ean13)) {
      const exactKey = cand.isbn13 || cand.ean13!;
      const group = exactByIsbn.get(exactKey) ?? [];
      group.push(cand);
      exactByIsbn.set(exactKey, group);
    } else {
      const key = buildEditionIdentityKey(cand);
      const group = possibleOrWorkByKey.get(key) ?? [];
      group.push(cand);
      possibleOrWorkByKey.set(key, group);
    }
  }

  const mergeGroup = (group: MetadataCandidate[]): MetadataCandidate => {
    const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
    let acc: MetadataCandidate = {
      ...sorted[0],
      sources: sorted[0].sources ?? [sorted[0].provider],
      fieldProvenance: buildInitialProvenance(sorted[0]),
    };
    for (let i = 1; i < sorted.length; i++) {
      acc = mergeTwoCandidates(acc, sorted[i]);
    }
    return acc;
  };

  const mergedExactRaw = Array.from(exactByIsbn.values())
    .map(mergeGroup)
    .sort((a, b) => completenessScore(b) - completenessScore(a));

  const exactMatches: MetadataCandidate[] = [];
  const possibleEditionMatches: MetadataCandidate[] = [];

  for (const item of mergedExactRaw) {
    if (item.contradictions && item.contradictions.length > 0) {
      possibleEditionMatches.push({
        ...item,
        editionMatchLevel: 'possible_edition',
      });
    } else {
      exactMatches.push({
        ...item,
        editionMatchLevel: 'exact_edition',
      });
    }
  }

  let workMatches: MetadataCandidate[] = [];
  for (const group of possibleOrWorkByKey.values()) {
    const m = mergeGroup(group);
    if (requestedIsbn) {
      possibleEditionMatches.push({
        ...m,
        editionMatchLevel: 'possible_edition',
      });
    } else {
      workMatches.push({
        ...m,
        editionMatchLevel: m.isbn13 ? 'possible_edition' : 'work_match',
      });
    }
  }

  const activeQuery = !requestedIsbn ? searchQuery?.trim() || null : null;
  if (activeQuery && workMatches.length > 0) {
    const scored = workMatches.map((item) => ({
      item,
      relevance: computeQueryRelevanceScore(item, activeQuery),
    }));
    const hasRelevant = scored.some((entry) => entry.relevance > 0);
    const filtered = hasRelevant ? scored.filter((entry) => entry.relevance > 0) : scored;
    filtered.sort(
      (a, b) =>
        b.relevance * 1000 +
        completenessScore(b.item) -
        (a.relevance * 1000 + completenessScore(a.item))
    );
    workMatches = filtered.map((entry) => entry.item);
  }

  const relatedEditions = Array.from(relatedByKey.values())
    .map(mergeGroup)
    .sort((a, b) => completenessScore(b) - completenessScore(a));

  const approximateMatches = [...possibleEditionMatches, ...workMatches, ...relatedEditions].sort(
    (a, b) =>
      activeQuery
        ? computeQueryRelevanceScore(b, activeQuery) * 1000 +
          completenessScore(b) -
          (computeQueryRelevanceScore(a, activeQuery) * 1000 + completenessScore(a))
        : completenessScore(b) - completenessScore(a)
  );

  const primaryCandidates =
    requestedIsbn && exactMatches.length > 0
      ? exactMatches
      : requestedIsbn
        ? [...exactMatches, ...possibleEditionMatches]
        : [...exactMatches, ...workMatches, ...possibleEditionMatches];

  return {
    exactMatches,
    possibleEditionMatches,
    relatedEditions,
    workMatches,
    approximateMatches,
    primaryCandidates,
  };
}

/**
 * Deduplicates and merges candidates by normalized ISBN-13 (for exact editions) or
 * full edition identity tuple (title + author + language + format + publisher + year + volume),
 * preserving conflicts and field-level provenance.
 */
export function mergeAndEnrichCandidates(
  candidates: MetadataCandidate[],
  requestedIsbn: string | null = null,
  searchQuery: string | null = null
): MetadataCandidate[] {
  return partitionAndMergeCandidates(candidates, requestedIsbn, searchQuery).primaryCandidates;
}

export function classifyProviderError(
  err: unknown,
  adapter: Pick<MetadataProviderAdapter, 'supportsDirectBrowserCors'> & { name?: MetadataProviderName }
): {
  status: ProviderLookupStatusCode;
  message: string;
} {
  if (err instanceof ProviderStatusError) {
    return { status: err.statusCode, message: err.message };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('abort') || lower.includes('timeout')) {
    return { status: 'timeout', message: 'Request timed out' };
  }
  if (!adapter.supportsDirectBrowserCors && typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('cors')) {
      return {
        status: 'proxy_required',
        message: 'Requires Edge Function / server proxy (CORS restricted in browser)',
      };
    }
  }
  if (
    lower.includes('api key') ||
    lower.includes('quota') ||
    (lower.includes('429') && adapter.name === 'google_books')
  ) {
    return { status: 'api_key_required', message: msg };
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return { status: 'upstream_error', message: msg };
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('cloudflare') ||
    lower.includes('access denied') ||
    lower.includes('captcha')
  ) {
    return { status: 'access_denied', message: msg };
  }
  return { status: 'upstream_error', message: msg || 'Provider request failed' };
}

export function deriveVerificationOutcome(params: {
  mode: 'isbn' | 'query';
  parsedIdentifier: ReturnType<typeof parseBookIdentifier> | null;
  exactMatches: MetadataCandidate[];
  possibleEditionMatches: MetadataCandidate[];
  identityMismatches: MetadataCandidate[];
  providerStatuses: ProviderStatusReport[];
}): {
  verificationStatus: VerificationStatus;
  verificationMessage: string;
} {
  const {
    mode,
    parsedIdentifier,
    exactMatches,
    possibleEditionMatches,
    identityMismatches,
    providerStatuses,
  } = params;

  if (mode === 'isbn' && parsedIdentifier && !parsedIdentifier.isValid) {
    return {
      verificationStatus: 'invalid_identifier',
      verificationMessage: parsedIdentifier.errorReason ?? 'Invalid ISBN-10, ISBN-13, or EAN-13 check digit.',
    };
  }

  if (exactMatches.length > 0) {
    return {
      verificationStatus: 'verified_match',
      verificationMessage:
        parsedIdentifier?.identifierType === 'ean13'
          ? `Exact GS1 EAN-13 match verified across ${exactMatches[0].sources?.length ?? 1} source(s).`
          : `Exact ISBN match verified across ${exactMatches[0].sources?.length ?? 1} source(s).`,
    };
  }

  if (possibleEditionMatches.some((c) => (c.contradictions?.length ?? 0) > 0)) {
    return {
      verificationStatus: 'conflicting_records',
      verificationMessage: 'Providers returned contradictory book titles for the same identifier.',
    };
  }

  if (identityMismatches.length > 0) {
    return {
      verificationStatus: 'identity_mismatch',
      verificationMessage: `Returned source record(s) carry a different identifier (${identityMismatches[0].isbn13 || identityMismatches[0].ean13 || 'mismatch'}) and were rejected from exact matches.`,
    };
  }

  const degraded = providerStatuses.some((s) =>
    ['timeout', 'access_denied', 'upstream_error', 'api_key_required', 'proxy_required'].includes(s.status)
  );
  if (possibleEditionMatches.length > 0 || degraded) {
    const idLabel =
      parsedIdentifier?.identifierType === 'ean13' ? 'valid EAN-13 barcode' : 'valid identifier';
    return {
      verificationStatus: 'valid_identifier_unconfirmed',
      verificationMessage: degraded
        ? `Check digit is valid (${idLabel}), but one or more upstream sources could not be verified.`
        : `Check digit is valid (${idLabel}), with only unverified candidate records found.`,
    };
  }

  return {
    verificationStatus: 'not_found',
    verificationMessage:
      parsedIdentifier?.isValid
        ? `Identifier check digit is valid (${parsedIdentifier.identifierType.toUpperCase()}), but no matching bibliographic record was found across queried catalogues.`
        : 'No matching records found.',
  };
}

export async function runProvidersWithIsolation(params: {
  mode: 'isbn' | 'query';
  input: string;
  adapters: MetadataProviderAdapter[];
  ctx: ProviderExecutionContext;
}): Promise<MetadataLookupResult> {
  const retrievedAt = new Date().toISOString();
  const parsedInput = params.mode === 'isbn' ? parseBookIdentifier(params.input) : null;
  const normId = parsedInput?.isValid ? parsedInput.normalizedId : null;
  const identifierType: BookIdentifierType | undefined =
    params.mode === 'isbn' ? parsedInput?.identifierType ?? 'invalid' : undefined;

  if (params.mode === 'isbn' && (!parsedInput || !parsedInput.isValid || !normId)) {
    return {
      candidates: [],
      exactMatches: [],
      possibleEditionMatches: [],
      relatedEditions: [],
      workMatches: [],
      approximateMatches: [],
      identityMismatches: [],
      providerStatuses: [],
      queriedIsbn: null,
      rawIdentifier: params.input,
      normalizedIdentifier: null,
      identifierType: 'invalid',
      verificationStatus: 'invalid_identifier',
      verificationMessage: parsedInput?.errorReason ?? 'Invalid ISBN or EAN-13 identifier.',
      retrievedAt,
      exactMatchCount: 0,
    };
  }

  const rawResults: MetadataCandidate[] = [];
  const rawMismatchResults: MetadataCandidate[] = [];

  const settled = await Promise.all(
    params.adapters.map(async (adapter): Promise<ProviderStatusReport> => {
      try {
        const list =
          params.mode === 'isbn'
            ? await adapter.lookupByIsbn(normId ?? params.input, params.ctx)
            : await adapter.search(params.input, params.ctx);

        let exactCount = 0;
        const accepted: MetadataCandidate[] = [];
        for (const item of list) {
          const itemWithTimestamp: MetadataCandidate = {
            ...item,
            retrievedAt: item.retrievedAt ?? retrievedAt,
          };
          const classified = classifyCandidateMatch(itemWithTimestamp, normId);
          if (normId && classified.hasConflictingIsbn) {
            rawMismatchResults.push(classified.candidate);
            continue;
          }
          if (classified.confidence === 'exact_isbn') exactCount++;
          accepted.push(classified.candidate);
        }

        rawResults.push(...accepted);

        const status: ProviderLookupStatusCode =
          exactCount > 0
            ? 'exact_match'
            : accepted.length > 0
              ? 'approximate_match'
              : 'no_match';

        return {
          provider: adapter.name,
          label: adapter.label,
          tier: adapter.tier,
          region: adapter.region,
          status,
          candidateCount: accepted.length,
          exactMatchCount: exactCount,
          message:
            accepted.length === 0 && rawMismatchResults.some((m) => m.provider === adapter.name)
              ? 'Returned record(s) with non-matching identifier rejected'
              : undefined,
        };
      } catch (err) {
        const info = classifyProviderError(err, adapter);
        return {
          provider: adapter.name,
          label: adapter.label,
          tier: adapter.tier,
          region: adapter.region,
          status: info.status,
          candidateCount: 0,
          exactMatchCount: 0,
          message: info.message,
        };
      }
    })
  );

  const partitioned = partitionAndMergeCandidates(
    rawResults,
    normId,
    params.mode === 'query' ? params.input : null
  );
  const mismatchPartitioned =
    rawMismatchResults.length > 0
      ? partitionAndMergeCandidates(rawMismatchResults, normId)
      : null;
  const identityMismatches = mismatchPartitioned?.relatedEditions ?? [];

  const outcome = deriveVerificationOutcome({
    mode: params.mode,
    parsedIdentifier: parsedInput,
    exactMatches: partitioned.exactMatches,
    possibleEditionMatches: partitioned.possibleEditionMatches,
    identityMismatches,
    providerStatuses: settled,
  });

  return {
    candidates: partitioned.primaryCandidates,
    exactMatches: partitioned.exactMatches,
    possibleEditionMatches: partitioned.possibleEditionMatches,
    relatedEditions: partitioned.relatedEditions,
    workMatches: partitioned.workMatches,
    approximateMatches: partitioned.approximateMatches,
    identityMismatches,
    providerStatuses: settled,
    queriedIsbn: normId,
    rawIdentifier: params.input,
    normalizedIdentifier: normId,
    identifierType,
    verificationStatus: outcome.verificationStatus,
    verificationMessage: outcome.verificationMessage,
    retrievedAt,
    exactMatchCount: partitioned.exactMatches.length,
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
  distributorText?: string;
  genresText: string;
  language: string;
  pageCount: string;
  publishedYear: string;
  seriesName: string;
  volumeNumber: string;
  coverUrl: string;
  description: string;
  isbnInput: string;
  fieldProvenance?: Record<string, FieldProvenanceEntry>;
}

/**
 * Applies a selected MetadataCandidate into a manual draft WITHOUT overwriting
 * any field the user has already manually edited/verified (unless empty),
 * and retains field-level provenance per populated field.
 */
export function mergeCandidateIntoDraft(
  current: ManualDraftFields,
  cand: MetadataCandidate,
  userEditedFields: Iterable<keyof ManualDraftFields> = [],
  options?: { replaceUnedited?: boolean }
): ManualDraftFields {
  const edited = new Set(userEditedFields);
  const nextProvenance: Record<string, FieldProvenanceEntry> = {
    ...(current.fieldProvenance ?? {}),
  };
  const candProv = buildInitialProvenance(cand);
  const replaceUnedited = options?.replaceUnedited === true;

  const pickString = (
    field: Exclude<keyof ManualDraftFields, 'fieldProvenance'>,
    provKey: string,
    incoming: string | undefined | null
  ): string => {
    const existingVal = (current[field] ?? '').trim();
    if (edited.has(field) && existingVal) {
      nextProvenance[provKey] = { provider: 'manual', trust: 'manual' };
      return current[field] ?? '';
    }
    const cleanIncoming = incoming?.trim();
    if (cleanIncoming) {
      nextProvenance[provKey] = candProv[provKey] ?? {
        provider: cand.provider,
        trust: cand.matchConfidence === 'exact_isbn' ? 'verified' : 'approximate',
      };
      return cleanIncoming;
    }
    if (replaceUnedited && field !== 'isbnInput' && field !== 'language') {
      delete nextProvenance[provKey];
      return '';
    }
    return current[field] ?? '';
  };

  return {
    title: pickString('title', 'title', cand.title),
    originalTitle: pickString('originalTitle', 'originalTitle', cand.originalTitle),
    authorsText: pickString('authorsText', 'authors', cand.authors.join(', ')),
    translatorsText: pickString('translatorsText', 'translators', cand.translators.join(', ')),
    illustratorsText: pickString('illustratorsText', 'illustrators', (cand.illustrators ?? []).join(', ')),
    publishersText: pickString('publishersText', 'publishers', cand.publishers.join(', ')),
    publishingPartner: pickString('publishingPartner', 'publishingPartner', cand.publishingPartner),
    distributorText: pickString('distributorText', 'distributor', cand.distributor),
    genresText: pickString('genresText', 'genres', cand.genres.join(', ')),
    language: pickString('language', 'language', cand.language && cand.language !== 'und' ? cand.language : ''),
    pageCount: pickString('pageCount', 'pageCount', cand.pageCount ? String(cand.pageCount) : ''),
    publishedYear: pickString('publishedYear', 'publishedYear', cand.publishedYear ? String(cand.publishedYear) : ''),
    seriesName: pickString('seriesName', 'seriesName', cand.seriesName),
    volumeNumber: pickString('volumeNumber', 'volumeNumber', cand.volumeNumber),
    coverUrl: pickString('coverUrl', 'coverUrl', cand.coverUrl),
    description: pickString('description', 'description', cand.description),
    isbnInput: pickString('isbnInput', 'isbn13', cand.isbn13 || cand.ean13 || cand.isbn10 || ''),
    fieldProvenance: nextProvenance,
  };
}
