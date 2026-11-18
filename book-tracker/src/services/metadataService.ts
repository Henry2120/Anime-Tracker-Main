import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type { MetadataCandidate, MetadataProviderName, MetadataRecord } from '../types/domain';
import { parseIsbn } from '../utils/isbn';

export interface MetadataProvider {
  name: MetadataProviderName;
  lookupByIsbn(isbn13Or10: string): Promise<MetadataCandidate[]>;
  search(query: string): Promise<MetadataCandidate[]>;
}

function normalizeCoverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:\/\//i, 'https://');
}

export const googleBooksProvider: MetadataProvider = {
  name: 'google_books',
  async lookupByIsbn(isbn) {
    return this.search(`isbn:${isbn}`);
  },
  async search(query) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '10');
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: Array<{ id: string; volumeInfo?: Record<string, unknown> }> };
    return (json.items ?? []).map((item) => {
      const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
      const ids = (info.industryIdentifiers as Array<{ type: string; identifier: string }> | undefined) ?? [];
      const raw13 = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? '';
      const raw10 = ids.find((x) => x.type === 'ISBN_10')?.identifier ?? '';
      const parsed = parseIsbn(raw13 || raw10);
      const imageLinks = info.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
      const pubDate = typeof info.publishedDate === 'string' ? info.publishedDate : undefined;

      return {
        externalId: item.id,
        provider: 'google_books',
        verified: false,
        title: String(info.title ?? 'Untitled'),
        subtitle: typeof info.subtitle === 'string' ? info.subtitle : undefined,
        authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
        translators: [],
        publishers: typeof info.publisher === 'string' ? [info.publisher] : [],
        publishedDate: pubDate,
        publishedYear: pubDate ? Number(pubDate.slice(0, 4)) || null : null,
        language: typeof info.language === 'string' ? info.language : 'en',
        pageCount: typeof info.pageCount === 'number' ? info.pageCount : null,
        genres: Array.isArray(info.categories) ? info.categories.map(String) : [],
        description: typeof info.description === 'string' ? info.description : undefined,
        isbn13: parsed.isbn13,
        isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: normalizeCoverUrl(imageLinks?.thumbnail || imageLinks?.smallThumbnail),
        rawPayload: item as unknown as Record<string, unknown>,
      };
    });
  },
};

export const openLibraryProvider: MetadataProvider = {
  name: 'open_library',
  async lookupByIsbn(isbn) {
    const clean = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, Record<string, unknown>>;
    const entry = data[`ISBN:${clean}`];
    if (!entry) return [];

    const parsed = parseIsbn(clean);
    const cover = entry.cover as { large?: string; medium?: string } | undefined;
    const pubDate = typeof entry.publish_date === 'string' ? entry.publish_date : undefined;

    return [
      {
        externalId: String(entry.key ?? `ol-${clean}`),
        provider: 'open_library',
        verified: false,
        title: String(entry.title ?? 'Untitled'),
        subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
        authors: Array.isArray(entry.authors)
          ? (entry.authors as Array<{ name: string }>).map((a) => a.name)
          : [],
        translators: [],
        publishers: Array.isArray(entry.publishers)
          ? (entry.publishers as Array<{ name: string }>).map((p) => p.name)
          : [],
        publishedDate: pubDate,
        publishedYear: pubDate ? Number(pubDate.match(/\d{4}/)?.[0]) || null : null,
        language: 'en',
        pageCount: typeof entry.number_of_pages === 'number' ? entry.number_of_pages : null,
        genres: Array.isArray(entry.subjects)
          ? (entry.subjects as Array<{ name: string }>).slice(0, 6).map((s) => s.name)
          : [],
        isbn13: parsed.isbn13,
        isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: normalizeCoverUrl(cover?.large || cover?.medium),
        rawPayload: entry,
      },
    ];
  },
  async search(query) {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { docs?: Array<Record<string, unknown>> };
    return (data.docs ?? []).map((doc) => {
      const isbns = Array.isArray(doc.isbn) ? doc.isbn.map(String) : [];
      const bestIsbn = isbns.find((x) => x.length === 13) ?? isbns[0] ?? '';
      const parsed = parseIsbn(bestIsbn);
      const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
      return {
        externalId: String(doc.key ?? createUuid()),
        provider: 'open_library',
        verified: false,
        title: String(doc.title ?? 'Untitled'),
        authors: Array.isArray(doc.author_name) ? doc.author_name.map(String) : [],
        translators: [],
        publishers: Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : [],
        publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        language: Array.isArray(doc.language) && doc.language[0] ? String(doc.language[0]) : 'en',
        pageCount:
          typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
        genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 6).map(String) : [],
        isbn13: parsed.isbn13,
        isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
        rawPayload: doc,
      };
    });
  },
};

export const openBdProvider: MetadataProvider = {
  name: 'openbd',
  async lookupByIsbn(isbn) {
    const parsed = parseIsbn(isbn);
    if (!parsed.isbn13 || !parsed.isbn13.startsWith('9784')) return [];
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${parsed.isbn13}`);
    if (!res.ok) return [];
    const arr = (await res.json()) as Array<{ summary?: Record<string, string> } | null>;
    const summary = arr?.[0]?.summary;
    if (!summary) return [];

    return [
      {
        externalId: `openbd-${parsed.isbn13}`,
        provider: 'openbd',
        verified: false,
        title: summary.title || 'Untitled',
        authors: summary.author ? [summary.author] : [],
        translators: [],
        publishers: summary.publisher ? [summary.publisher] : [],
        publishedDate: summary.pubdate || undefined,
        publishedYear: summary.pubdate ? Number(summary.pubdate.slice(0, 4)) || null : null,
        language: 'ja',
        genres: [],
        isbn13: parsed.isbn13,
        isbn10: parsed.isbn10,
        coverUrl: normalizeCoverUrl(summary.cover),
        seriesName: summary.series || undefined,
        volumeNumber: summary.volume || undefined,
        rawPayload: arr[0] as unknown as Record<string, unknown>,
      },
    ];
  },
  async search() {
    return [];
  },
};

const PROVIDERS: MetadataProvider[] = [googleBooksProvider, openLibraryProvider, openBdProvider];

export async function lookupMetadataByIsbn(rawIsbn: string): Promise<MetadataCandidate[]> {
  const parsed = parseIsbn(rawIsbn);
  const queryIsbn = parsed.isbn13 || rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!queryIsbn) return [];

  // Prefer server-side Supabase Edge Function if configured and online
  const supabase = getSupabaseClient();
  if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase.functions.invoke('book-lookup', {
        body: { isbn: queryIsbn },
      });
      if (!error && Array.isArray(data?.candidates) && data.candidates.length > 0) {
        return data.candidates as MetadataCandidate[];
      }
    } catch {
      // Fallback to direct provider calls
    }
  }

  const settled = await Promise.allSettled(PROVIDERS.map((p) => p.lookupByIsbn(queryIsbn)));
  const merged: MetadataCandidate[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') merged.push(...res.value);
  }
  return merged;
}

export async function searchMetadataByQuery(query: string): Promise<MetadataCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = getSupabaseClient();
  if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase.functions.invoke('book-lookup', {
        body: { query: trimmed },
      });
      if (!error && Array.isArray(data?.candidates) && data.candidates.length > 0) {
        return data.candidates as MetadataCandidate[];
      }
    } catch {
      // Fallback
    }
  }

  const settled = await Promise.allSettled(PROVIDERS.map((p) => p.search(trimmed)));
  const merged: MetadataCandidate[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') merged.push(...res.value);
  }
  return merged;
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
