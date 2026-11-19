// Supabase Edge Function: book-lookup
// Concurrent server-side metadata aggregation across Vietnamese and global providers:
// ADCBook, NXB Kim Dong, Nha Nam, IPM, Tiki Books, Google Books, Open Library, openBD, and optional ISBNdb.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEOUT_MS = 7000;

type MatchQuality = 'exact_isbn' | 'approximate' | 'title_search';

interface Candidate {
  externalId: string;
  provider: string;
  verified: boolean;
  title: string;
  originalTitle?: string;
  subtitle?: string;
  editionName?: string;
  authors: string[];
  illustrators: string[];
  translators: string[];
  publishers: string[];
  publishedDate?: string;
  publishedYear?: number | null;
  language: string;
  format?: string;
  pageCount?: number | null;
  genres: string[];
  description?: string;
  isbn13?: string | null;
  isbn10?: string | null;
  coverUrl?: string;
  seriesName?: string;
  volumeNumber?: string;
  sourceUrl?: string;
  matchQuality: MatchQuality;
  matchedIsbn?: string | null;
  contributingProviders?: string[];
  sourceUrls?: Array<{ provider: string; url: string }>;
  rawPayload: Record<string, unknown>;
}

interface ProviderStatus {
  provider: string;
  status: 'matched' | 'no_match' | 'error' | 'skipped';
  candidateCount: number;
  durationMs?: number;
  message?: string;
}

function stripIsbn(input: string): string {
  return input.toUpperCase().replace(/[^0-9X]/g, '');
}

function isValidIsbn13(input: string): boolean {
  const clean = stripIsbn(input);
  if (!/^\d{13}$/.test(clean)) return false;
  if (!clean.startsWith('978') && !clean.startsWith('979')) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(clean[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return String(check) === clean[12];
}

function isValidIsbn10(input: string): boolean {
  const clean = stripIsbn(input);
  if (!/^\d{9}[\dX]$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(clean[i]) * (10 - i);
  }
  const rem = (11 - (sum % 11)) % 11;
  return (rem === 10 ? 'X' : String(rem)) === clean[9];
}

function isbn13ToIsbn10(isbn13: string): string | null {
  const clean = stripIsbn(isbn13);
  if (!isValidIsbn13(clean) || !clean.startsWith('978')) return null;
  const body = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * (10 - i);
  const rem = (11 - (sum % 11)) % 11;
  return `${body}${rem === 10 ? 'X' : String(rem)}`;
}

function isbn10ToIsbn13(isbn10: string): string | null {
  const clean = stripIsbn(isbn10);
  if (!isValidIsbn10(clean)) return null;
  const first12 = `978${clean.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return `${first12}${(10 - (sum % 10)) % 10}`;
}

function parseIsbn(raw: string): { isValid: boolean; isbn13: string | null; isbn10: string | null; prefixGroup: '978' | '979' | 'other' } {
  const clean = stripIsbn(raw);
  if (clean.length === 13 && isValidIsbn13(clean)) {
    const prefixGroup = clean.startsWith('978') ? '978' : clean.startsWith('979') ? '979' : 'other';
    return { isValid: true, isbn13: clean, isbn10: isbn13ToIsbn10(clean), prefixGroup };
  }
  if (clean.length === 10 && isValidIsbn10(clean)) {
    return { isValid: true, isbn13: isbn10ToIsbn13(clean), isbn10: clean, prefixGroup: '978' };
  }
  return { isValid: false, isbn13: null, isbn10: null, prefixGroup: 'other' };
}

function decodeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html?: string | null): string {
  if (!html) return '';
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const t = url.trim();
  if (!t) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  return t.replace(/^http:\/\//i, 'https://');
}

function dedupe(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const c = (item ?? '').replace(/\s+/g, ' ').trim();
    if (!c) continue;
    const k = c.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function extractYear(raw?: string | number | null): number | null {
  if (typeof raw === 'number') return raw >= 1400 && raw <= 2100 ? raw : null;
  if (!raw) return null;
  const m = String(raw).match(/(?:^|[^\d])(19\d{2}|20\d{2})(?:[^\d]|$)/);
  return m ? Number(m[1]) : null;
}

function normalizeLang(raw?: string | null, hints?: { title?: string; publisher?: string; isbn13?: string | null; tags?: string[] }): string {
  const c = (raw ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    vi: 'vi', vie: 'vi', vietnamese: 'vi',
    en: 'en', eng: 'en', english: 'en',
    ja: 'ja', jpn: 'ja', japanese: 'ja',
    fr: 'fr', fra: 'fr', fre: 'fr',
    ko: 'ko', kor: 'ko',
    zh: 'zh', zho: 'zh', chi: 'zh',
  };
  if (c && map[c]) return map[c];
  if (c && /^[a-z]{2}$/.test(c)) return c;
  const text = [hints?.title ?? '', hints?.publisher ?? '', ...(hints?.tags ?? [])].join(' ').toLowerCase();
  if (
    text.includes('tiếng việt') ||
    text.includes('nhà xuất bản') ||
    /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(text) ||
    (hints?.isbn13 && (hints.isbn13.startsWith('978604') || hints.isbn13.startsWith('978632')))
  ) {
    return 'vi';
  }
  return 'en';
}

function normalizeFormat(raw?: string | null): string | undefined {
  const s = (raw ?? '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('cứng') || s.includes('hardcover')) return 'hardcover';
  if (s.includes('mềm') || s.includes('paperback')) return 'paperback';
  if (s.includes('box')) return 'box_set';
  if (s.includes('ebook')) return 'ebook';
  return undefined;
}

function cleanViTitle(raw: string): { title: string; editionName?: string; volumeNumber?: string } {
  let title = decodeHtml(raw).replace(/\s+/g, ' ').trim();
  const notes: string[] = [];
  for (const re of [
    /\s*[-–|]?\s*(Tặng\s+Kèm\s+[^()[\]]+)$/i,
    /\s*[-–|]?\s*(Kèm\s+(?:Postcard|Bookmark|Poster|Card|Standee|Quà)[^()[\]]*)$/i,
    /\s*\((Bản\s+(?:giới\s+hạn|đặc\s+biệt|thường)|Tái\s+bản[^)]*|TB\s*[\d.,]+)\)\s*$/i,
  ]) {
    const m = title.match(re);
    if (m?.[1]) {
      notes.push(m[1].trim());
      title = title.slice(0, m.index).trim();
    }
  }
  title = title.replace(/^(Sách\s*[-–:]\s*|\(Tập\s*lẻ\)\s*)/i, '').trim();
  const vol = title.match(/(?:\bTập|\bVol\.?)\s*0*(\d+)\b/i);
  return {
    title: title || raw.trim(),
    editionName: notes.length ? notes.join(' · ') : undefined,
    volumeNumber: vol ? vol[1] : undefined,
  };
}

function parseSapoItem(params: {
  provider: string;
  baseUrl: string;
  product: Record<string, unknown>;
  html?: string;
  queryIsbn?: string;
}): Candidate {
  const { provider, baseUrl, product, html, queryIsbn } = params;
  const parsedQ = queryIsbn ? parseIsbn(queryIsbn) : null;
  const tagsRaw = Array.isArray(product.tags)
    ? (product.tags as string[])
    : typeof product.tags === 'string'
      ? product.tags.split(',').map((s) => s.trim())
      : [];
  const variants = (Array.isArray(product.variants) ? product.variants : []) as Array<{
    barcode?: string | null;
    sku?: string | null;
    featured_image?: { src?: string } | null;
  }>;

  let matchedIsbn13: string | null = null;
  let matchedIsbn10: string | null = null;
  let matchedImg: string | undefined;

  for (const v of variants) {
    const p = parseIsbn(v.barcode || v.sku || '');
    if (p.isValid && p.isbn13) {
      if (parsedQ?.isbn13 && p.isbn13 === parsedQ.isbn13) {
        matchedIsbn13 = p.isbn13;
        matchedIsbn10 = p.prefixGroup === '978' ? p.isbn10 : null;
        matchedImg = v.featured_image?.src;
        break;
      }
      if (!matchedIsbn13) {
        matchedIsbn13 = p.isbn13;
        matchedIsbn10 = p.prefixGroup === '978' ? p.isbn10 : null;
        matchedImg = v.featured_image?.src;
      }
    }
  }

  const authors: string[] = [];
  const illustrators: string[] = [];
  const translators: string[] = [];
  const publishers: string[] = [];
  const genres: string[] = [];
  let pageCount: number | null = null;
  let publishedYear: number | null = null;
  let publishedDate: string | undefined;
  let format: string | undefined;
  let seriesName: string | undefined;

  if (typeof product.product_type === 'string' && !/^khác$/i.test(product.product_type.trim())) {
    genres.push(product.product_type.trim());
  }

  for (const rawT of tagsRaw) {
    const t = decodeHtml(rawT).trim();
    if (!t) continue;
    if (t.startsWith('tacgia_')) authors.push(t.slice(7).trim());
    else if (/^Tác giả\s+/i.test(t)) authors.push(t.replace(/^Tác giả\s+/i, '').trim());
    else if (t.startsWith('minhhoa_') || t.startsWith('hoasi_')) illustrators.push(t.replace(/^(minhhoa_|hoasi_)/i, '').trim());
    else if (/^(Minh họa|Họa sĩ)\s+/i.test(t)) illustrators.push(t.replace(/^(Minh họa|Họa sĩ)\s+/i, '').trim());
    else if (t.startsWith('dichgia_')) translators.push(t.slice(8).trim());
    else if (/^Dịch giả\s+/i.test(t)) translators.push(t.replace(/^Dịch giả\s+/i, '').trim());
    else if (t.startsWith('nxb_') || t.startsWith('nhaxb_')) publishers.push(t.replace(/^(nxb_|nhaxb_)/i, '').trim());
    else if (t.startsWith('sotrang_') || /^Số trang\s+\d+/i.test(t)) {
      const n = Number(t.replace(/[^\d]/g, ''));
      if (n > 0) pageCount = n;
    } else if (t.startsWith('bia_') || t.startsWith('hinhthuc_')) {
      format = normalizeFormat(t) ?? format;
    } else if (t.startsWith('namxb_') || /^Sách phát hành\s+\d{4}/i.test(t)) {
      publishedYear = extractYear(t) ?? publishedYear;
    } else if (t.startsWith('combo_')) {
      seriesName = t.slice(6).trim();
    }
  }

  if (html) {
    const pubOn = html.match(/"published_on"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (pubOn) {
      publishedDate = pubOn[1];
      publishedYear = publishedYear ?? extractYear(pubOn[1]);
    }
    const kw = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
    if (kw) {
      for (const part of kw[1].split(',').map((s) => decodeHtml(s.trim()))) {
        if (/^Tác giả\s+/i.test(part)) authors.push(part.replace(/^Tác giả\s+/i, '').trim());
        else if (/^Dịch giả\s+/i.test(part)) translators.push(part.replace(/^Dịch giả\s+/i, '').trim());
        else if (/^Số trang\s+\d+/i.test(part) && !pageCount) pageCount = Number(part.replace(/[^\d]/g, '')) || null;
        else if (/^Sách phát hành\s+\d{4}/i.test(part) && !publishedYear) publishedYear = extractYear(part);
      }
    }
  }

  if (typeof product.published_on === 'string' || typeof product.published_at === 'string') {
    const d = String(product.published_on || product.published_at);
    publishedDate = publishedDate || d.slice(0, 10);
    publishedYear = publishedYear || extractYear(d);
  }

  const vendor = typeof product.vendor === 'string' && !/^khác$/i.test(product.vendor.trim()) ? product.vendor.trim() : undefined;
  const finalPubs = dedupe([...publishers, vendor]);
  const rawTitle = String(product.name || product.title || 'Untitled');
  const cleaned = cleanViTitle(rawTitle);
  const path = typeof product.url === 'string' ? product.url : typeof product.handle === 'string' ? `/products/${product.handle}` : '';
  const sourceUrl = path ? `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}` : baseUrl;

  const isExact = Boolean(parsedQ?.isbn13 && matchedIsbn13 && parsedQ.isbn13 === matchedIsbn13);
  const featured =
    matchedImg ||
    (typeof product.featured_image === 'string' ? product.featured_image : (product.featured_image as { src?: string } | undefined)?.src) ||
    (product.image as { src?: string } | undefined)?.src;

  return {
    externalId: String(product.id ?? sourceUrl),
    provider,
    verified: false,
    title: cleaned.title,
    editionName: cleaned.editionName,
    authors: dedupe(authors),
    illustrators: dedupe(illustrators),
    translators: dedupe(translators),
    publishers: finalPubs,
    publishedDate,
    publishedYear,
    language: normalizeLang(undefined, { title: cleaned.title, publisher: finalPubs[0], isbn13: matchedIsbn13, tags: tagsRaw }),
    format: format ?? 'paperback',
    pageCount,
    genres: dedupe(genres),
    description: stripHtml(String(product.content ?? product.body_html ?? '')) || undefined,
    isbn13: matchedIsbn13,
    isbn10: matchedIsbn10,
    coverUrl: normalizeUrl(featured),
    seriesName,
    volumeNumber: cleaned.volumeNumber,
    sourceUrl,
    matchQuality: queryIsbn ? (isExact ? 'exact_isbn' : 'approximate') : 'title_search',
    matchedIsbn: isExact ? matchedIsbn13 : null,
    contributingProviders: [provider],
    sourceUrls: [{ provider, url: sourceUrl }],
    rawPayload: product,
  };
}

async function querySapoProvider(provider: string, baseUrl: string, query: string, queryIsbn?: string, fetchHtml = true): Promise<Candidate[]> {
  const sRes = await fetch(`${baseUrl}/search?q=${encodeURIComponent(query)}&view=json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!sRes.ok) throw new Error(`HTTP ${sRes.status}`);
  const sJson = (await sRes.json()) as { results?: Array<{ url?: string }> };
  const hits = (sJson.results ?? []).filter((r) => Boolean(r.url)).slice(0, queryIsbn ? 3 : 4);
  if (!hits.length) return [];

  const settled = await Promise.allSettled(
    hits.map(async (h) => {
      const path = String(h.url).split('?')[0];
      const jRes = await fetch(`${baseUrl}${path}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!jRes.ok) return null;
      const prod = (await jRes.json()) as Record<string, unknown>;
      let html: string | undefined;
      if (fetchHtml && (!prod.published_on || queryIsbn)) {
        try {
          const pRes = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
          if (pRes.ok) html = await pRes.text();
        } catch { /* ignore */ }
      }
      return parseSapoItem({ provider, baseUrl, product: prod, html, queryIsbn });
    })
  );
  return settled.filter((r): r is PromiseFulfilledResult<Candidate | null> => r.status === 'fulfilled').map((r) => r.value).filter((x): x is Candidate => Boolean(x));
}

async function queryIpmProvider(query: string, queryIsbn?: string): Promise<Candidate[]> {
  const res = await fetch(`https://ipm.vn/search?type=product&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const links = Array.from(new Set(Array.from(html.matchAll(/href=["'](\/products\/[^"'?#]+)["']/gi)).map((m) => m[1]))).slice(0, 4);
  const settled = await Promise.allSettled(
    links.map(async (path) => {
      const pRes = await fetch(`https://ipm.vn${path}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!pRes.ok) return null;
      const data = (await pRes.json()) as { product?: Record<string, unknown> };
      if (!data.product) return null;
      return parseSapoItem({ provider: 'ipm', baseUrl: 'https://ipm.vn', product: data.product, queryIsbn });
    })
  );
  return settled.filter((r): r is PromiseFulfilledResult<Candidate | null> => r.status === 'fulfilled').map((r) => r.value).filter((x): x is Candidate => Boolean(x));
}

async function queryTikiProvider(query: string, queryIsbn?: string): Promise<Candidate[]> {
  const res = await fetch(`https://tiki.vn/api/v2/products?limit=6&q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id?: number }> };
  const ids = (data.data ?? []).map((x) => x.id).filter((id): id is number => Boolean(id)).slice(0, 3);
  if (!ids.length) return [];

  const parsedQ = queryIsbn ? parseIsbn(queryIsbn) : null;
  const settled = await Promise.allSettled(
    ids.map(async (id) => {
      const dRes = await fetch(`https://tiki.vn/api/v2/products/${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!dRes.ok) return null;
      const detail = (await dRes.json()) as Record<string, unknown>;
      const rawName = String(detail.name ?? '');
      if (!rawName) return null;
      const cleaned = cleanViTitle(rawName);
      const specs = Array.isArray(detail.specifications) ? detail.specifications : [];
      const publishers: string[] = [];
      const translators: string[] = [];
      let pageCount: number | null = null;
      let publishedYear: number | null = null;
      let format: string | undefined;
      let isbn13: string | null = null;
      let isbn10: string | null = null;

      for (const g of specs as Array<{ attributes?: Array<{ code?: string; name?: string; value?: string }> }>) {
        for (const a of g.attributes ?? []) {
          const code = (a.code ?? '').toLowerCase();
          const val = stripHtml(a.value ?? '');
          if (!val) continue;
          if (code === 'manufacturer' || code === 'publisher_vn') publishers.push(val);
          else if (code === 'book_cover') format = normalizeFormat(val) ?? format;
          else if (code === 'number_of_page') pageCount = Number(val.replace(/[^\d]/g, '')) || pageCount;
          else if (code === 'publication_date') publishedYear = publishedYear ?? extractYear(val);
          else if (code === 'translator') translators.push(val);
          else if (code === 'isbn') {
            const p = parseIsbn(val);
            if (p.isValid && p.isbn13) {
              isbn13 = p.isbn13;
              isbn10 = p.prefixGroup === '978' ? p.isbn10 : null;
            }
          }
        }
      }

      const authors = Array.isArray(detail.authors)
        ? dedupe((detail.authors as Array<{ name?: string }>).map((a) => a.name)).filter((a) => !/nhiều tác giả/i.test(a))
        : [];
      const urlPath = typeof detail.url_path === 'string' ? detail.url_path : '';
      const sourceUrl = urlPath ? `https://tiki.vn/${urlPath.replace(/^\//, '')}` : 'https://tiki.vn/';
      const isExact = Boolean(parsedQ?.isbn13 && isbn13 && parsedQ.isbn13 === isbn13);

      const cand: Candidate = {
        externalId: String(detail.id ?? sourceUrl),
        provider: 'tiki_books',
        verified: false,
        title: cleaned.title,
        editionName: cleaned.editionName,
        authors,
        illustrators: [],
        translators: dedupe(translators),
        publishers: dedupe(publishers),
        publishedYear,
        language: normalizeLang(undefined, { title: cleaned.title, publisher: publishers[0], isbn13 }),
        format: format ?? 'paperback',
        pageCount,
        genres: [],
        description: stripHtml(String(detail.description ?? detail.short_description ?? '')) || undefined,
        isbn13,
        isbn10,
        coverUrl: normalizeUrl(typeof detail.thumbnail_url === 'string' ? detail.thumbnail_url : undefined),
        volumeNumber: cleaned.volumeNumber,
        sourceUrl,
        matchQuality: queryIsbn ? (isExact ? 'exact_isbn' : 'approximate') : 'title_search',
        matchedIsbn: isExact ? isbn13 : null,
        contributingProviders: ['tiki_books'],
        sourceUrls: [{ provider: 'tiki_books', url: sourceUrl }],
        rawPayload: detail,
      };
      return cand;
    })
  );
  return settled.filter((r): r is PromiseFulfilledResult<Candidate | null> => r.status === 'fulfilled').map((r) => r.value).filter((x): x is Candidate => Boolean(x));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { isbn, query } = (await req.json()) as { isbn?: string; query?: string };
    const cleanIsbn = (isbn ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
    const q = (query ?? '').trim();

    if (!cleanIsbn && !q) {
      return new Response(JSON.stringify({ candidates: [], providerStatuses: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedIsbn = cleanIsbn ? parseIsbn(cleanIsbn) : null;
    const queryIsbn = parsedIsbn?.isbn13 ?? (cleanIsbn || undefined);
    const searchTerm = queryIsbn || q;

    const googleKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
    const isbndbKey = Deno.env.get('ISBNDB_API_KEY');

    const providers: Array<{ name: string; run: () => Promise<Candidate[]> }> = [
      {
        name: 'adcbook',
        run: () => querySapoProvider('adcbook', 'https://adcbook.net.vn', searchTerm, queryIsbn, true),
      },
      {
        name: 'nxb_kim_dong',
        run: () => querySapoProvider('nxb_kim_dong', 'https://nxbkimdong.com.vn', searchTerm, queryIsbn, false),
      },
      {
        name: 'nha_nam',
        run: () => querySapoProvider('nha_nam', 'https://nhanam.vn', searchTerm, queryIsbn, true),
      },
      {
        name: 'ipm',
        run: () => queryIpmProvider(searchTerm, queryIsbn),
      },
      {
        name: 'tiki_books',
        run: () => queryTikiProvider(searchTerm, queryIsbn),
      },
      {
        name: 'google_books',
        run: async () => {
          const gbUrl = new URL('https://www.googleapis.com/books/v1/volumes');
          gbUrl.searchParams.set('q', queryIsbn ? `isbn:${queryIsbn}` : q);
          gbUrl.searchParams.set('maxResults', '8');
          if (googleKey) gbUrl.searchParams.set('key', googleKey);
          const res = await fetch(gbUrl.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const out: Candidate[] = [];
          for (const item of data.items ?? []) {
            const info = item.volumeInfo ?? {};
            const ids = info.industryIdentifiers ?? [];
            const raw13 = ids.find((x: { type: string }) => x.type === 'ISBN_13')?.identifier ?? '';
            const raw10 = ids.find((x: { type: string }) => x.type === 'ISBN_10')?.identifier ?? '';
            const p = parseIsbn(raw13 || raw10);
            const isExact = Boolean(queryIsbn && p.isbn13 && queryIsbn === p.isbn13);
            const sourceUrl = normalizeUrl(info.infoLink) ?? `https://books.google.com/books?id=${item.id}`;
            out.push({
              externalId: item.id,
              provider: 'google_books',
              verified: false,
              title: info.title ?? 'Untitled',
              subtitle: info.subtitle,
              authors: dedupe(info.authors ?? []),
              illustrators: [],
              translators: [],
              publishers: info.publisher ? [info.publisher] : [],
              publishedDate: info.publishedDate,
              publishedYear: extractYear(info.publishedDate),
              language: normalizeLang(info.language, { title: info.title, publisher: info.publisher, isbn13: p.isbn13 }),
              pageCount: info.pageCount ?? null,
              genres: dedupe(info.categories ?? []),
              description: info.description,
              isbn13: p.isValid ? p.isbn13 : null,
              isbn10: p.isValid && p.prefixGroup === '978' ? p.isbn10 : null,
              coverUrl: normalizeUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
              sourceUrl,
              matchQuality: queryIsbn ? (isExact ? 'exact_isbn' : 'approximate') : 'title_search',
              matchedIsbn: isExact ? p.isbn13 : null,
              contributingProviders: ['google_books'],
              sourceUrls: [{ provider: 'google_books', url: sourceUrl }],
              rawPayload: item,
            });
          }
          return out;
        },
      },
      {
        name: 'open_library',
        run: async () => {
          if (queryIsbn) {
            const res = await fetch(
              `https://openlibrary.org/api/books?bibkeys=ISBN:${queryIsbn}&format=json&jscmd=data`,
              { signal: AbortSignal.timeout(TIMEOUT_MS) }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const entry = data[`ISBN:${queryIsbn}`];
            if (!entry) return [];
            const p = parseIsbn(queryIsbn);
            const publishers = dedupe((entry.publishers ?? []).map((x: { name: string }) => x.name));
            const sourceUrl = normalizeUrl(entry.url) ?? `https://openlibrary.org/isbn/${queryIsbn}`;
            return [
              {
                externalId: entry.key ?? `ol-${queryIsbn}`,
                provider: 'open_library',
                verified: false,
                title: entry.title ?? 'Untitled',
                subtitle: entry.subtitle,
                authors: dedupe((entry.authors ?? []).map((a: { name: string }) => a.name)),
                illustrators: [],
                translators: [],
                publishers,
                publishedDate: entry.publish_date,
                publishedYear: extractYear(entry.publish_date),
                language: normalizeLang(undefined, { title: entry.title, publisher: publishers[0], isbn13: p.isbn13 }),
                pageCount: entry.number_of_pages ?? null,
                genres: dedupe((entry.subjects ?? []).slice(0, 6).map((s: { name: string }) => s.name)),
                isbn13: p.isValid ? p.isbn13 : null,
                isbn10: p.isValid && p.prefixGroup === '978' ? p.isbn10 : null,
                coverUrl: normalizeUrl(entry.cover?.large ?? entry.cover?.medium),
                sourceUrl,
                matchQuality: p.isValid ? 'exact_isbn' : 'approximate',
                matchedIsbn: p.isValid ? p.isbn13 : null,
                contributingProviders: ['open_library'],
                sourceUrls: [{ provider: 'open_library', url: sourceUrl }],
                rawPayload: entry,
              },
            ];
          }
          const res = await fetch(
            `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`,
            { signal: AbortSignal.timeout(TIMEOUT_MS) }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return (data.docs ?? []).map((doc: Record<string, unknown>) => {
            const isbns = Array.isArray(doc.isbn) ? doc.isbn.map(String) : [];
            const bestIsbn = isbns.find((x) => x.length === 13) ?? isbns[0] ?? '';
            const p = parseIsbn(bestIsbn);
            const publishers = dedupe(Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : []);
            const key = typeof doc.key === 'string' ? doc.key : '';
            const sourceUrl = key ? `https://openlibrary.org${key}` : 'https://openlibrary.org/';
            return {
              externalId: key || crypto.randomUUID(),
              provider: 'open_library',
              verified: false,
              title: String(doc.title ?? 'Untitled'),
              authors: dedupe(Array.isArray(doc.author_name) ? doc.author_name.map(String) : []),
              illustrators: [],
              translators: [],
              publishers,
              publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
              language: normalizeLang(Array.isArray(doc.language) ? String(doc.language[0] ?? '') : undefined, {
                title: String(doc.title ?? ''),
                publisher: publishers[0],
                isbn13: p.isbn13,
              }),
              pageCount: typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
              genres: dedupe(Array.isArray(doc.subject) ? doc.subject.slice(0, 5).map(String) : []),
              isbn13: p.isValid ? p.isbn13 : null,
              isbn10: p.isValid && p.prefixGroup === '978' ? p.isbn10 : null,
              coverUrl: typeof doc.cover_i === 'number' ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
              sourceUrl,
              matchQuality: 'title_search' as MatchQuality,
              matchedIsbn: null,
              contributingProviders: ['open_library'],
              sourceUrls: [{ provider: 'open_library', url: sourceUrl }],
              rawPayload: doc,
            };
          });
        },
      },
    ];

    if (queryIsbn && queryIsbn.startsWith('9784')) {
      providers.push({
        name: 'openbd',
        run: async () => {
          const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${queryIsbn}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arr = await res.json();
          const item = arr?.[0];
          if (!item?.summary) return [];
          const p = parseIsbn(queryIsbn);
          const authors: string[] = [];
          const illustrators: string[] = [];
          const translators: string[] = [];
          for (const c of item?.onix?.DescriptiveDetail?.Contributor ?? []) {
            const n = c?.PersonName?.content?.trim();
            if (!n) continue;
            const roles: string[] = c?.ContributorRole ?? [];
            if (roles.some((r) => r === 'A12' || r === 'A07')) illustrators.push(n);
            else if (roles.includes('B06')) translators.push(n);
            else authors.push(n);
          }
          if (!authors.length && !illustrators.length && item.summary.author) authors.push(item.summary.author);
          return [
            {
              externalId: `openbd-${queryIsbn}`,
              provider: 'openbd',
              verified: false,
              title: item.summary.title ?? 'Untitled',
              authors: dedupe(authors),
              illustrators: dedupe(illustrators),
              translators: dedupe(translators),
              publishers: item.summary.publisher ? [item.summary.publisher] : [],
              publishedDate: item.summary.pubdate,
              publishedYear: extractYear(item.summary.pubdate),
              language: 'ja',
              genres: [],
              isbn13: p.isbn13,
              isbn10: p.prefixGroup === '978' ? p.isbn10 : null,
              coverUrl: normalizeUrl(item.summary.cover),
              seriesName: item.summary.series || undefined,
              volumeNumber: item.summary.volume || undefined,
              sourceUrl: 'https://openbd.jp/',
              matchQuality: 'exact_isbn',
              matchedIsbn: p.isbn13,
              contributingProviders: ['openbd'],
              sourceUrls: [{ provider: 'openbd', url: 'https://openbd.jp/' }],
              rawPayload: item,
            },
          ];
        },
      });
    }

    if (isbndbKey && queryIsbn) {
      providers.push({
        name: 'isbndb',
        run: async () => {
          const res = await fetch(`https://api2.isbndb.com/book/${queryIsbn}`, {
            headers: { Authorization: isbndbKey },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) {
            if (res.status === 404) return [];
            throw new Error(`HTTP ${res.status}`);
          }
          const json = await res.json();
          const b = json?.book;
          if (!b) return [];
          const p = parseIsbn(b.isbn13 || b.isbn || queryIsbn);
          return [
            {
              externalId: `isbndb-${p.isbn13 ?? queryIsbn}`,
              provider: 'isbndb',
              verified: false,
              title: b.title ?? 'Untitled',
              authors: dedupe(b.authors ?? []),
              illustrators: [],
              translators: [],
              publishers: b.publisher ? [b.publisher] : [],
              publishedDate: b.date_published,
              publishedYear: extractYear(b.date_published),
              language: normalizeLang(b.language, { title: b.title, publisher: b.publisher, isbn13: p.isbn13 }),
              format: normalizeFormat(b.binding),
              pageCount: typeof b.pages === 'number' ? b.pages : null,
              genres: dedupe(b.subjects ?? []),
              description: stripHtml(b.synopsis),
              isbn13: p.isbn13,
              isbn10: p.prefixGroup === '978' ? p.isbn10 : null,
              coverUrl: normalizeUrl(b.image),
              sourceUrl: `https://isbndb.com/book/${p.isbn13 ?? queryIsbn}`,
              matchQuality: p.isbn13 === queryIsbn ? 'exact_isbn' : 'approximate',
              matchedIsbn: p.isbn13 === queryIsbn ? p.isbn13 : null,
              contributingProviders: ['isbndb'],
              sourceUrls: [{ provider: 'isbndb', url: `https://isbndb.com/book/${p.isbn13 ?? queryIsbn}` }],
              rawPayload: json,
            },
          ];
        },
      });
    }

    const candidates: Candidate[] = [];
    const providerStatuses: ProviderStatus[] = [];

    await Promise.allSettled(
      providers.map(async (p) => {
        const started = Date.now();
        try {
          const hits = await p.run();
          candidates.push(...hits);
          providerStatuses.push({
            provider: p.name,
            status: hits.length > 0 ? 'matched' : 'no_match',
            candidateCount: hits.length,
            durationMs: Date.now() - started,
          });
        } catch (err) {
          providerStatuses.push({
            provider: p.name,
            status: 'error',
            candidateCount: 0,
            durationMs: Date.now() - started,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    // Sort exact ISBN matches first
    candidates.sort((a, b) => {
      const rank = (m: MatchQuality) => (m === 'exact_isbn' ? 2 : m === 'approximate' ? 1 : 0);
      return rank(b.matchQuality) - rank(a.matchQuality);
    });

    return new Response(JSON.stringify({ candidates, providerStatuses }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), candidates: [], providerStatuses: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
