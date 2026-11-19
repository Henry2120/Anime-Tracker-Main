import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type {
  MetadataCandidate,
  MetadataLookupResult,
  MetadataProviderName,
  MetadataRecord,
  ProviderLookupStatus,
} from '../types/domain';
import { parseIsbn } from '../utils/isbn';
import {
  dedupeStrings,
  extractYear,
  mergeAndRankCandidates,
  normalizeLanguageCode,
  normalizeUrl,
  parseOpenBdRecord,
} from './metadata/normalizer';
import {
  adcbookProvider,
  ipmProvider,
  type MetadataProviderAdapter,
  nhaNamProvider,
  nxbKimDongProvider,
} from './metadata/vietnameseProviders';

const PROVIDER_TIMEOUT_MS = 7000;

export const googleBooksProvider: MetadataProviderAdapter = {
  name: 'google_books',
  async lookupByIsbn(isbn) {
    return this.search(`isbn:${isbn}`, isbn);
  },
  async search(query: string, queryIsbn?: string) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '10');
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      items?: Array<{ id: string; volumeInfo?: Record<string, unknown> }>;
    };
    return (json.items ?? []).map((item) => {
      const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
      const ids =
        (info.industryIdentifiers as Array<{ type: string; identifier: string }> | undefined) ?? [];
      const raw13 = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? '';
      const raw10 = ids.find((x) => x.type === 'ISBN_10')?.identifier ?? '';
      const parsed = parseIsbn(raw13 || raw10);
      const imageLinks = info.imageLinks as
        | { thumbnail?: string; smallThumbnail?: string }
        | undefined;
      const pubDate = typeof info.publishedDate === 'string' ? info.publishedDate : undefined;
      const publishers = typeof info.publisher === 'string' ? [info.publisher] : [];
      const title = String(info.title ?? 'Untitled');
      const sourceUrl =
        typeof info.infoLink === 'string'
          ? normalizeUrl(info.infoLink)
          : `https://books.google.com/books?id=${encodeURIComponent(item.id)}`;

      const isbn13 = parsed.isValid ? parsed.isbn13 : null;
      const parsedQuery = queryIsbn ? parseIsbn(queryIsbn) : null;
      const isExact = Boolean(parsedQuery?.isbn13 && isbn13 && parsedQuery.isbn13 === isbn13);

      return {
        externalId: item.id,
        provider: 'google_books',
        verified: false,
        title,
        subtitle: typeof info.subtitle === 'string' ? info.subtitle : undefined,
        authors: Array.isArray(info.authors) ? dedupeStrings(info.authors.map(String)) : [],
        illustrators: [],
        translators: [],
        publishers: dedupeStrings(publishers),
        publishedDate: pubDate,
        publishedYear: extractYear(pubDate),
        language: normalizeLanguageCode(typeof info.language === 'string' ? info.language : undefined, {
          title,
          publisher: publishers[0],
          isbn13,
        }),
        pageCount: typeof info.pageCount === 'number' ? info.pageCount : null,
        genres: Array.isArray(info.categories) ? dedupeStrings(info.categories.map(String)) : [],
        description: typeof info.description === 'string' ? info.description : undefined,
        isbn13,
        isbn10: parsed.isValid && parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: normalizeUrl(imageLinks?.thumbnail || imageLinks?.smallThumbnail),
        sourceUrl,
        matchQuality: queryIsbn ? (isExact ? 'exact_isbn' : 'approximate') : 'title_search',
        matchedIsbn: isExact ? isbn13 : null,
        contributingProviders: ['google_books'],
        sourceUrls: sourceUrl ? [{ provider: 'google_books', url: sourceUrl }] : undefined,
        rawPayload: item as unknown as Record<string, unknown>,
      };
    });
  },
} as MetadataProviderAdapter & {
  search: (query: string, queryIsbn?: string) => Promise<MetadataCandidate[]>;
};

export const openLibraryProvider: MetadataProviderAdapter = {
  name: 'open_library',
  async lookupByIsbn(isbn) {
    const clean = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`,
      { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, Record<string, unknown>>;
    const entry = data[`ISBN:${clean}`];
    if (!entry) return [];

    const parsed = parseIsbn(clean);
    const cover = entry.cover as { large?: string; medium?: string } | undefined;
    const pubDate = typeof entry.publish_date === 'string' ? entry.publish_date : undefined;
    const publishers = Array.isArray(entry.publishers)
      ? dedupeStrings((entry.publishers as Array<{ name: string }>).map((p) => p.name))
      : [];
    const title = String(entry.title ?? 'Untitled');
    const sourceUrl =
      typeof entry.url === 'string'
        ? normalizeUrl(entry.url)
        : `https://openlibrary.org/isbn/${clean}`;

    return [
      {
        externalId: String(entry.key ?? `ol-${clean}`),
        provider: 'open_library',
        verified: false,
        title,
        subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
        authors: Array.isArray(entry.authors)
          ? dedupeStrings((entry.authors as Array<{ name: string }>).map((a) => a.name))
          : [],
        illustrators: [],
        translators: [],
        publishers,
        publishedDate: pubDate,
        publishedYear: extractYear(pubDate),
        language: normalizeLanguageCode(undefined, {
          title,
          publisher: publishers[0],
          isbn13: parsed.isbn13,
        }),
        pageCount: typeof entry.number_of_pages === 'number' ? entry.number_of_pages : null,
        genres: Array.isArray(entry.subjects)
          ? dedupeStrings((entry.subjects as Array<{ name: string }>).slice(0, 6).map((s) => s.name))
          : [],
        isbn13: parsed.isbn13,
        isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: normalizeUrl(cover?.large || cover?.medium),
        sourceUrl,
        matchQuality: parsed.isValid ? 'exact_isbn' : 'approximate',
        matchedIsbn: parsed.isValid ? parsed.isbn13 : null,
        contributingProviders: ['open_library'],
        sourceUrls: sourceUrl ? [{ provider: 'open_library', url: sourceUrl }] : undefined,
        rawPayload: entry,
      },
    ];
  },
  async search(query) {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`,
      { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { docs?: Array<Record<string, unknown>> };
    return (data.docs ?? []).map((doc) => {
      const isbns = Array.isArray(doc.isbn) ? doc.isbn.map(String) : [];
      const bestIsbn = isbns.find((x) => x.length === 13) ?? isbns[0] ?? '';
      const parsed = parseIsbn(bestIsbn);
      const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
      const publishers = Array.isArray(doc.publisher)
        ? dedupeStrings(doc.publisher.slice(0, 2).map(String))
        : [];
      const title = String(doc.title ?? 'Untitled');
      const rawLang =
        Array.isArray(doc.language) && doc.language[0] ? String(doc.language[0]) : undefined;
      const key = typeof doc.key === 'string' ? doc.key : '';
      const sourceUrl = key ? `https://openlibrary.org${key}` : undefined;

      return {
        externalId: key || createUuid(),
        provider: 'open_library',
        verified: false,
        title,
        authors: Array.isArray(doc.author_name) ? dedupeStrings(doc.author_name.map(String)) : [],
        illustrators: [],
        translators: [],
        publishers,
        publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        language: normalizeLanguageCode(rawLang, {
          title,
          publisher: publishers[0],
          isbn13: parsed.isbn13,
        }),
        pageCount:
          typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
        genres: Array.isArray(doc.subject)
          ? dedupeStrings(doc.subject.slice(0, 6).map(String))
          : [],
        isbn13: parsed.isValid ? parsed.isbn13 : null,
        isbn10: parsed.isValid && parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
        sourceUrl,
        matchQuality: 'title_search',
        matchedIsbn: null,
        contributingProviders: ['open_library'],
        sourceUrls: sourceUrl ? [{ provider: 'open_library', url: sourceUrl }] : undefined,
        rawPayload: doc,
      };
    });
  },
};

export const openBdProvider: MetadataProviderAdapter = {
  name: 'openbd',
  async lookupByIsbn(isbn) {
    const parsed = parseIsbn(isbn);
    if (!parsed.isbn13 || !parsed.isbn13.startsWith('9784')) return [];
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${parsed.isbn13}`, {
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()) as Array<Record<string, unknown> | null>;
    const item = arr?.[0];
    if (!item) return [];
    const cand = parseOpenBdRecord(item, parsed.isbn13);
    return cand ? [cand] : [];
  },
  async search() {
    return [];
  },
};

const DIRECT_PROVIDERS: MetadataProviderAdapter[] = [
  adcbookProvider,
  nxbKimDongProvider,
  nhaNamProvider,
  ipmProvider,
  googleBooksProvider,
  openLibraryProvider,
  openBdProvider,
];

function isApplicableForIsbn(providerName: MetadataProviderName, isbn13: string | null): boolean {
  if (providerName === 'openbd') {
    return Boolean(isbn13 && isbn13.startsWith('9784'));
  }
  return true;
}

async function runDirectProviders(params: {
  mode: 'isbn' | 'query';
  term: string;
  isbn13: string | null;
  skipProviders?: Set<MetadataProviderName>;
}): Promise<{ candidates: MetadataCandidate[]; statuses: ProviderLookupStatus[] }> {
  const statuses: ProviderLookupStatus[] = [];
  const allCandidates: MetadataCandidate[] = [];

  const tasks = DIRECT_PROVIDERS.map(async (provider) => {
    if (params.skipProviders?.has(provider.name)) return;
    if (params.mode === 'isbn' && !isApplicableForIsbn(provider.name, params.isbn13)) {
      statuses.push({
        provider: provider.name,
        status: 'skipped',
        candidateCount: 0,
        message: 'Only applies to 978-4-* Japanese ISBNs',
      });
      return;
    }
    if (params.mode === 'query' && provider.name === 'openbd') {
      statuses.push({
        provider: provider.name,
        status: 'skipped',
        candidateCount: 0,
        message: 'ISBN-only provider',
      });
      return;
    }

    const started = Date.now();
    try {
      const hits =
        params.mode === 'isbn'
          ? await provider.lookupByIsbn(params.term)
          : await provider.search(params.term);
      allCandidates.push(...hits);
      statuses.push({
        provider: provider.name,
        status: hits.length > 0 ? 'matched' : 'no_match',
        candidateCount: hits.length,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      statuses.push({
        provider: provider.name,
        status: 'error',
        candidateCount: 0,
        durationMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Request failed',
      });
    }
  });

  await Promise.allSettled(tasks);
  return { candidates: allCandidates, statuses };
}

export async function lookupMetadataByIsbnDetailed(
  rawIsbn: string
): Promise<MetadataLookupResult> {
  const parsed = parseIsbn(rawIsbn);
  const cleanDigits = rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  const queryIsbn = parsed.isbn13 || cleanDigits;

  if (!queryIsbn) {
    return {
      query: rawIsbn,
      normalizedIsbn13: null,
      normalizedIsbn10: null,
      isValidIsbn: false,
      candidates: [],
      providerStatuses: [],
      hasExactIsbnMatch: false,
    };
  }

  const combinedCandidates: MetadataCandidate[] = [];
  const statusMap = new Map<MetadataProviderName, ProviderLookupStatus>();
  const completedInEdge = new Set<MetadataProviderName>();

  // 1. Query Supabase Edge Function when configured (covers server-side providers like Tiki + keyed Google Books/ISBNdb)
  const supabase = getSupabaseClient();
  if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase.functions.invoke('book-lookup', {
        body: { isbn: queryIsbn },
      });
      if (!error && data) {
        if (Array.isArray(data.candidates)) {
          combinedCandidates.push(...(data.candidates as MetadataCandidate[]));
        }
        if (Array.isArray(data.providerStatuses)) {
          for (const st of data.providerStatuses as ProviderLookupStatus[]) {
            statusMap.set(st.provider, st);
            if (st.status === 'matched' || st.status === 'no_match' || st.status === 'skipped') {
              completedInEdge.add(st.provider);
            }
          }
        }
      }
    } catch {
      // Non-fatal: continue with direct providers below
    }
  }

  // 2. Always run ALL remaining applicable direct providers concurrently (never short-circuit on partial hits)
  const direct = await runDirectProviders({
    mode: 'isbn',
    term: queryIsbn,
    isbn13: parsed.isbn13 ?? (queryIsbn.length === 13 ? queryIsbn : null),
    skipProviders: completedInEdge,
  });

  combinedCandidates.push(...direct.candidates);
  for (const st of direct.statuses) {
    statusMap.set(st.provider, st);
  }

  const merged = mergeAndRankCandidates(combinedCandidates, queryIsbn);
  const hasExactIsbnMatch = merged.some((c) => c.matchQuality === 'exact_isbn');

  return {
    query: rawIsbn,
    normalizedIsbn13: parsed.isbn13,
    normalizedIsbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
    isValidIsbn: parsed.isValid,
    candidates: merged,
    providerStatuses: Array.from(statusMap.values()),
    hasExactIsbnMatch,
  };
}

export async function searchMetadataByQueryDetailed(
  query: string
): Promise<MetadataLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query,
      candidates: [],
      providerStatuses: [],
      hasExactIsbnMatch: false,
    };
  }

  const parsedAsIsbn = parseIsbn(trimmed);
  if (parsedAsIsbn.isValid) {
    return lookupMetadataByIsbnDetailed(trimmed);
  }

  const combinedCandidates: MetadataCandidate[] = [];
  const statusMap = new Map<MetadataProviderName, ProviderLookupStatus>();
  const completedInEdge = new Set<MetadataProviderName>();

  const supabase = getSupabaseClient();
  if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase.functions.invoke('book-lookup', {
        body: { query: trimmed },
      });
      if (!error && data) {
        if (Array.isArray(data.candidates)) {
          combinedCandidates.push(...(data.candidates as MetadataCandidate[]));
        }
        if (Array.isArray(data.providerStatuses)) {
          for (const st of data.providerStatuses as ProviderLookupStatus[]) {
            statusMap.set(st.provider, st);
            if (st.status === 'matched' || st.status === 'no_match' || st.status === 'skipped') {
              completedInEdge.add(st.provider);
            }
          }
        }
      }
    } catch {
      // Non-fatal fallback
    }
  }

  const direct = await runDirectProviders({
    mode: 'query',
    term: trimmed,
    isbn13: null,
    skipProviders: completedInEdge,
  });

  combinedCandidates.push(...direct.candidates);
  for (const st of direct.statuses) {
    statusMap.set(st.provider, st);
  }

  const merged = mergeAndRankCandidates(combinedCandidates);
  return {
    query: trimmed,
    candidates: merged,
    providerStatuses: Array.from(statusMap.values()),
    hasExactIsbnMatch: false,
  };
}

export async function lookupMetadataByIsbn(rawIsbn: string): Promise<MetadataCandidate[]> {
  const res = await lookupMetadataByIsbnDetailed(rawIsbn);
  return res.candidates;
}

export async function searchMetadataByQuery(query: string): Promise<MetadataCandidate[]> {
  const res = await searchMetadataByQueryDetailed(query);
  return res.candidates;
}

export async function recordProviderMetadata(params: {
  workId?: string | null;
  editionId?: string | null;
  candidate: MetadataCandidate;
}): Promise<void> {
  const rec: MetadataRecord = {
    id: createUuid(),
    workId: params.workId ?? null,
    editionId: params.editionId ?? null,
    provider: params.candidate.provider,
    externalId: params.candidate.externalId,
    isbn13: params.candidate.isbn13 ?? null,
    rawPayload: params.candidate.rawPayload,
    fetchedAt: new Date().toISOString(),
  };
  await db.metadata_records.put(rec);
}
