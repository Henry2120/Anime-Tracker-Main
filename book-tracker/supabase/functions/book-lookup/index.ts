// Supabase Edge Function: book-lookup
// Server-side multi-provider bibliographic metadata aggregation for Vietnamese & international books.
// Runs without browser CORS limits across:
//   - Thư viện KHTH TP.HCM (MARC21 + bibliographic OPAC)
//   - Vietnamese publishers & retailers (ADCBook, Gooda, Hikaru, NXB Kim Đồng, Nhã Nam, IPM, Tiki)
//   - International APIs (Google Books w/ optional GOOGLE_BOOKS_API_KEY, Open Library, openBD)
//   - Honest status reporting for NLV OPAC (503) & Fahasa (Cloudflare 403)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MatchConfidence = 'exact_isbn' | 'unverified_isbn' | 'title_match';
type ProviderStatusCode =
  | 'matched'
  | 'no_match'
  | 'temporarily_unavailable'
  | 'unsupported'
  | 'requires_configuration';

interface ProviderStatusReport {
  provider: string;
  label: string;
  status: ProviderStatusCode;
  candidateCount: number;
  exactMatchCount: number;
  message?: string;
}

interface Candidate {
  externalId: string;
  provider: string;
  sources?: string[];
  verified: boolean;
  matchConfidence: MatchConfidence;
  matchedIsbns: string[];
  title: string;
  subtitle?: string;
  authors: string[];
  translators: string[];
  illustrators?: string[];
  publishers: string[];
  publishingPartner?: string;
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
  sourceUrl?: string;
  conflicts?: Array<{ field: string; values: Array<{ provider: string; value: string }> }>;
  rawPayload: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// ISBN Helpers
// ----------------------------------------------------------------------------
function stripIsbn(input: string): string {
  return input.toUpperCase().replace(/[^0-9X]/g, '');
}

function isbn13Check(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(first12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  return String(mod === 0 ? 0 : 10 - mod);
}

function isbn10Check(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? 'X' : String(rem);
}

function normalizeIsbnTo13(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = stripIsbn(raw);
  if (/^(978|979)\d{10}$/.test(clean) && isbn13Check(clean.slice(0, 12)) === clean[12]) {
    return clean;
  }
  if (/^\d{9}[\dX]$/.test(clean) && isbn10Check(clean.slice(0, 9)) === clean[9]) {
    const first12 = `978${clean.slice(0, 9)}`;
    return `${first12}${isbn13Check(first12)}`;
  }
  return null;
}

function isbn13To10(isbn13: string): string | null {
  if (!isbn13.startsWith('978') || isbn13.length !== 13) return null;
  const body = isbn13.slice(3, 12);
  return `${body}${isbn10Check(body)}`;
}

function extractIsbnsFromText(text: string): string[] {
  const matches =
    text.match(/(?:97[89][-\s]?(?:\d[-\s]?){9}\d)|(?:\b\d{9}[\dXx]\b)|(?:(?:\d[-\s]?){9}[\dXx])/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    const norm = normalizeIsbnTo13(m);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}

function vnSearchForms(isbn13: string): string[] {
  const forms = [isbn13];
  if (isbn13.startsWith('978604') && isbn13.length === 13) {
    const r = isbn13.slice(6, 12);
    const c = isbn13[12];
    forms.push(
      `978-604-${r[0]}-${r.slice(1)}-${c}`,
      `978-604-${r.slice(0, 2)}-${r.slice(2)}-${c}`,
      `978-604-${r.slice(0, 3)}-${r.slice(3)}-${c}`,
      `978-604-${r.slice(0, 4)}-${r.slice(4)}-${c}`
    );
  }
  return forms;
}

// ----------------------------------------------------------------------------
// HTML / Vietnamese Spec / MARC21 Parsers
// ----------------------------------------------------------------------------
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
};

function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z0-9]+);/g, (full, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) {
      const code = Number.parseInt(e.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (e.startsWith('#')) {
      const code = Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return ENTITIES[e] ?? full;
  });
}

function htmlLines(html: string): string[] {
  let normalized = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[\r\n\t]+/g, ' ');

  normalized = normalized.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_full, rowHtml: string) => {
    const cells: string[] = [];
    for (const cellMatch of rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      const cellText = decodeHtml(cellMatch[1].replace(/<[^>]+>/g, ' '))
        .replace(/[ \u00A0]+/g, ' ')
        .trim();
      if (cellText) cells.push(cellText);
    }
    return cells.length > 0 ? `\n${cells.join('\t')}\n` : '\n';
  });

  const cleaned = normalized
    .replace(/<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6]|\/dd|\/dt)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtml(cleaned)
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \u00A0]+/g, ' ').replace(/\s*\t\s*/g, '\t').trim())
    .filter(Boolean);
}

function normalizeUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  const t = u.trim();
  if (!t) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  return t.replace(/^http:\/\//i, 'https://');
}

function addUnique(list: string[], vals: string[]): void {
  const seen = new Set(list.map((x) => x.toLocaleLowerCase('vi')));
  for (const v of vals) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLocaleLowerCase('vi');
    if (!seen.has(k)) {
      seen.add(k);
      list.push(t);
    }
  }
}

function extractVnSpecs(html: string) {
  const INLINE_LABEL_SPLIT =
    /(?=\b(?:Nhà phát hành|Nhà xuất bản|NXB liên kết|Nhà cung cấp|Tác giả\/\s*Dịch giả|Tác giả|Dịch giả|Minh họa|Họa sĩ|Hình thức bìa|Định dạng|Số trang|Kích thước|Trọng lượng|Mã sản phẩm|ISBN|Năm xuất bản|Ngày phát hành|Phát hành|Ngôn ngữ|Thể loại)\s*:)/gi;
  const lines = htmlLines(html).flatMap((line) =>
    line.includes('\t')
      ? [line]
      : line
          .split(INLINE_LABEL_SPLIT)
          .map((seg) => seg.trim())
          .filter(Boolean)
  );
  const authors: string[] = [];
  const translators: string[] = [];
  const illustrators: string[] = [];
  const publishers: string[] = [];
  const genres: string[] = [];
  const isbns = extractIsbnsFromText(lines.join('\n'));
  let publishingPartner: string | undefined;
  let pageCount: number | null = null;
  let publishedYear: number | null = null;
  let language: string | undefined;
  let format: string | undefined;

  const applyKV = (rawK: string, rawV: string) => {
    const k = rawK.replace(/:$/, '').trim().toLocaleLowerCase('vi');
    const v = rawV.replace(/\s+/g, ' ').trim();
    if (!v || v.length < 2 || /^[\s:|\-–—•.,;/\\]+$/.test(v) || /^đang cập nhật$/i.test(v)) return;
    const splitNames = v.split(/[,;&/]+|\bvà\b/i).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (k === 'tác giả' || k === 'tác giả/ dịch giả') addUnique(authors, splitNames);
    else if (k === 'dịch giả' || k === 'người dịch') addUnique(translators, splitNames);
    else if (k === 'minh họa' || k === 'họa sĩ') addUnique(illustrators, splitNames);
    else if (k === 'nxb liên kết') {
      publishingPartner = publishingPartner || v;
      addUnique(publishers, [v]);
    } else if (k === 'nhà xuất bản' || k === 'nxb') addUnique(publishers, [v]);
    else if (k === 'nhà phát hành' || k === 'phát hành' || k === 'thương hiệu') {
      const yr = v.match(/\b((?:19|20)\d{2})\b/);
      if (yr && /^\d/.test(v)) publishedYear = publishedYear ?? Number(yr[1]);
      else addUnique(publishers, [v]);
    } else if (k === 'số trang') {
      const m = v.match(/\d{1,5}/);
      if (m && !pageCount) pageCount = Number(m[0]);
    } else if (k === 'ngày phát hành' || k === 'năm xuất bản') {
      const yr = v.match(/\b((?:19|20)\d{2})\b/);
      if (yr && !publishedYear) publishedYear = Number(yr[1]);
    } else if (k === 'ngôn ngữ') {
      if (v.toLocaleLowerCase('vi').includes('tiếng việt')) language = 'vi';
    } else if (k === 'thể loại') addUnique(genres, splitNames);
    else if (k === 'hình thức bìa' || k === 'định dạng') {
      if (v.toLocaleLowerCase('vi').includes('bìa cứng')) format = 'hardcover';
      else if (v.toLocaleLowerCase('vi').includes('bìa')) format = 'paperback';
    } else if (k === 'isbn' || k === 'mã sản phẩm') {
      for (const code of extractIsbnsFromText(v)) {
        if (!isbns.includes(code)) isbns.push(code);
      }
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      const inlineKvs = parts.filter((p) => /^[^:]{2,45}:\s*\S/.test(p));
      if (inlineKvs.length > 0 && inlineKvs.length >= Math.ceil(parts.length / 2)) {
        for (const p of parts) {
          const kv = p.match(/^([^:]{2,45}):\s*(.+)$/);
          if (kv) applyKV(kv[1], kv[2]);
        }
      } else {
        for (let c = 0; c + 1 < parts.length; c += 2) applyKV(parts[c], parts[c + 1]);
      }
    } else {
      const kv = line.match(/^([^:]{2,45}):\s*(.*)$/);
      if (kv) {
        let val = kv[2];
        if (!val && i + 1 < lines.length && !lines[i + 1].includes(':') && !/^[\s|\-–—•.,;/\\]+$/.test(lines[i + 1])) {
          val = lines[++i];
        }
        applyKV(kv[1], val);
      }
    }
  }
  return { authors, translators, illustrators, publishers, publishingPartner, pageCount, publishedYear, language, format, genres, isbns };
}

function parseMarc21(html: string) {
  const lines = htmlLines(html).map((l) => l.replace(/\t+/g, ' '));
  const authors: string[] = [];
  const translators: string[] = [];
  const illustrators: string[] = [];
  const publishers: string[] = [];
  const subjects: string[] = [];
  const isbns: string[] = [];
  let title = '';
  let subtitle: string | undefined;
  let publishedYear: number | null = null;
  let pageCount: number | null = null;
  let language = 'vi';
  let description: string | undefined;
  let coverPath: string | undefined;
  let stmtResp = '';

  const fields: Array<{ tag: string; raw: string; subs: Record<string, string[]> }> = [];
  for (const line of lines) {
    const m = line.replace(/\s+/g, ' ').trim().match(/^(Ldr|\d{3})\s+([_0-9a-zA-Z]{2})?\s*(.*)$/);
    if (!m) continue;
    const raw = m[3] || '';
    const subs: Record<string, string[]> = {};
    const parts = raw.split(/\$([a-z0-9])/i);
    for (let i = 1; i + 1 < parts.length; i += 2) {
      const k = parts[i].toLowerCase();
      if (!subs[k]) subs[k] = [];
      subs[k].push(parts[i + 1].trim());
    }
    fields.push({ tag: m[1], raw, subs });
  }

  const f245 = fields.find((f) => f.tag === '245');
  stmtResp = f245?.subs.c?.[0] ?? '';
  for (const seg of stmtResp.split(';')) {
    const s = seg.trim();
    if (/\b(?:dịch|dịch giả|biên dịch)\b/i.test(s)) {
      const n = s.replace(/\b(?:dịch giả|biên dịch|dịch)\b/gi, '').replace(/[/:;,]+$/, '').trim();
      if (n) addUnique(translators, [n]);
    } else if (/\b(?:minh họa|họa sĩ)\b/i.test(s)) {
      const n = s.replace(/\b(?:minh họa|họa sĩ)\b/gi, '').replace(/[/:;,]+$/, '').trim();
      if (n) addUnique(illustrators, [n]);
    }
  }

  const normName = (raw: string) => {
    const c = raw.replace(/\s*[/:;,]+\s*$/, '').trim();
    const parts = c.split(',').map((p) => p.trim());
    if (parts.length !== 2) return c;
    const ff = `${parts[0]} ${parts[1]}`;
    const gf = `${parts[1]} ${parts[0]}`;
    if (stmtResp.toLocaleLowerCase('vi').includes(ff.toLocaleLowerCase('vi'))) return ff;
    return gf;
  };

  for (const f of fields) {
    if (f.tag === '020') {
      for (const a of f.subs.a ?? [f.raw]) {
        for (const c of extractIsbnsFromText(a)) if (!isbns.includes(c)) isbns.push(c);
      }
    } else if (f.tag === '041') {
      const code = (f.subs.a?.[0] ?? f.raw).toLowerCase().slice(0, 3);
      if (code === 'vie') language = 'vi';
      else if (code === 'eng') language = 'en';
      else if (code === 'jpn') language = 'ja';
    } else if (f.tag === '100') {
      for (const a of f.subs.a ?? []) addUnique(authors, [normName(a)]);
    } else if (f.tag === '245') {
      if (f.subs.a?.[0]) title = f.subs.a[0].replace(/\s*[/:;,]+\s*$/, '').trim();
      if (f.subs.b?.[0]) subtitle = f.subs.b[0].replace(/\s*[/:;,]+\s*$/, '').trim();
    } else if (f.tag === '260' || f.tag === '264') {
      for (const b of f.subs.b ?? []) addUnique(publishers, [b.replace(/\s*[/:;,]+\s*$/, '').trim()]);
      const y = f.subs.c?.[0]?.match(/(19|20)\d{2}/);
      if (y) publishedYear = Number(y[0]);
    } else if (f.tag === '300') {
      const m = (f.subs.a?.[0] ?? f.raw).match(/(\d{1,5})/);
      if (m) pageCount = Number(m[1]);
    } else if (f.tag === '520') {
      description = f.subs.a?.[0]?.trim();
    } else if (f.tag === '650') {
      for (const a of f.subs.a ?? []) addUnique(subjects, [a.replace(/\s*[/:;,]+\s*$/, '').trim()]);
    } else if (f.tag === '700') {
      const rawN = f.subs.a?.[0];
      if (!rawN) continue;
      const n = normName(rawN);
      const rel = [...(f.subs.e ?? []), ...(f.subs['4'] ?? [])].join(' ').toLowerCase();
      if (/trl|dịch/.test(rel) || translators.some((t) => t.toLowerCase() === n.toLowerCase())) {
        addUnique(translators, [n]);
      } else if (/ill|minh họa/.test(rel) || illustrators.some((il) => il.toLowerCase() === n.toLowerCase())) {
        addUnique(illustrators, [n]);
      } else {
        addUnique(authors, [n]);
      }
    } else if (f.tag === '907') {
      const v = f.raw.trim();
      if (v.startsWith('/')) coverPath = v;
    }
  }
  return title ? { title, subtitle, authors, translators, illustrators, publishers, publishedYear, pageCount, language, subjects, description, isbns, coverPath } : null;
}

async function fTimeout(url: string, ms = 7000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { isbn, query } = (await req.json()) as { isbn?: string; query?: string };
    const cleanIsbn = normalizeIsbnTo13(isbn ?? '') || '';
    const q = (query ?? '').trim();

    if (!cleanIsbn && !q) {
      return new Response(
        JSON.stringify({ candidates: [], providerStatuses: [], queriedIsbn: null, exactMatchCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candidates: Candidate[] = [];
    const statuses: ProviderStatusReport[] = [];

    const runProvider = async (
      provider: string,
      label: string,
      fn: () => Promise<Candidate[]>
    ) => {
      try {
        const res = await fn();
        candidates.push(...res);
        statuses.push({
          provider,
          label,
          status: res.length > 0 ? 'matched' : 'no_match',
          candidateCount: res.length,
          exactMatchCount: res.filter((c) => c.matchConfidence === 'exact_isbn').length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status: ProviderStatusCode = /429|403|api key/i.test(msg)
          ? /cloudflare|fahasa/i.test(msg)
            ? 'unsupported'
            : 'requires_configuration'
          : 'temporarily_unavailable';
        statuses.push({ provider, label, status, candidateCount: 0, exactMatchCount: 0, message: msg });
      }
    };

    const runSapo = (provider: string, label: string, baseUrl: string) =>
      runProvider(provider, label, async () => {
        const searchTerms = cleanIsbn ? vnSearchForms(cleanIsbn).slice(0, 4) : [q];
        const urls = new Set<string>();
        for (const term of searchTerms) {
          const r = await fTimeout(`${baseUrl}/search?q=${encodeURIComponent(term)}&view=json`);
          if (!r.ok) continue;
          const txt = await r.text();
          try {
            const j = JSON.parse(txt);
            const list = Array.isArray(j.results) ? j.results : Object.values(j);
            for (const item of list as Array<{ url?: string }>) {
              if (item?.url && !String(item.url).includes('${')) urls.add(String(item.url));
            }
          } catch {
            // ignore
          }
          if (urls.size > 0) break;
        }
        const out: Candidate[] = [];
        for (const u of Array.from(urls).slice(0, 4)) {
          const full = u.startsWith('http') ? u : `${baseUrl}${u}`;
          const [jRes, hRes] = await Promise.all([
            fTimeout(`${full.split('?')[0]}.json`).catch(() => null),
            fTimeout(full.split('?')[0]).catch(() => null),
          ]);
          const jData = jRes?.ok ? await jRes.json().catch(() => null) : null;
          const prod = jData?.product ?? jData;
          const html = hRes?.ok ? await hRes.text() : '';
          const specs = extractVnSpecs(html);
          const contentSpecs = prod?.content ? extractVnSpecs(prod.content) : null;
          const variantIds = (prod?.variants ?? []).flatMap((v: { sku?: string; barcode?: string }) => [v.sku ?? '', v.barcode ?? '']);
          const allIsbns = Array.from(new Set([...extractIsbnsFromText(variantIds.join(' ')), ...specs.isbns, ...(contentSpecs?.isbns ?? [])]));
          if (cleanIsbn && !allIsbns.includes(cleanIsbn)) continue;
          const title = prod?.name || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
          if (!title) continue;
          const pubs: string[] = [];
          if (prod?.vendor) addUnique(pubs, [prod.vendor]);
          addUnique(pubs, specs.publishers);
          addUnique(pubs, contentSpecs?.publishers ?? []);
          const targetIsbn = cleanIsbn || allIsbns[0] || null;
          out.push({
            externalId: String(prod?.id || full),
            provider,
            verified: false,
            matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
            matchedIsbns: allIsbns,
            title,
            authors: specs.authors.length ? specs.authors : contentSpecs?.authors ?? [],
            translators: specs.translators.length ? specs.translators : contentSpecs?.translators ?? [],
            illustrators: specs.illustrators.length ? specs.illustrators : contentSpecs?.illustrators ?? [],
            publishers: pubs,
            publishingPartner: specs.publishingPartner || contentSpecs?.publishingPartner,
            publishedYear: specs.publishedYear ?? contentSpecs?.publishedYear ?? null,
            language: specs.language || 'vi',
            format: specs.format,
            pageCount: specs.pageCount ?? contentSpecs?.pageCount ?? null,
            genres: specs.genres,
            isbn13: targetIsbn,
            isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
            coverUrl: normalizeUrl(prod?.featured_image?.src || prod?.featured_image || html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]),
            sourceUrl: full,
            rawPayload: { product: prod, specs },
          });
        }
        return out;
      });

    const runHaravan = (provider: string, label: string, baseUrl: string) =>
      runProvider(provider, label, async () => {
        const terms = cleanIsbn ? vnSearchForms(cleanIsbn).slice(0, 4) : [q];
        const htmls = await Promise.all(
          terms.map((t) => fTimeout(`${baseUrl}/search?type=product&q=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.text() : '')).catch(() => ''))
        );
        const slugs = Array.from(
          new Set(
            htmls.flatMap((h) =>
              [...h.matchAll(/href=["'](?:https?:\/\/[^"'\s]+)?(\/products\/[^"'?#]+)["']/gi)].map(
                (m) => m[1]
              )
            )
          )
        ).slice(0, 5);
        const out: Candidate[] = [];
        for (const slug of slugs) {
          const r = await fTimeout(`${baseUrl}${slug}.json`).catch(() => null);
          if (!r?.ok) continue;
          const data = await r.json();
          const prod = data.product;
          if (!prod?.title) continue;
          const specs = extractVnSpecs(prod.body_html ?? '');
          const variantIds = (prod.variants ?? []).flatMap((v: { sku?: string; barcode?: string }) => [v.sku ?? '', v.barcode ?? '']);
          const allIsbns = Array.from(new Set([...extractIsbnsFromText(variantIds.join(' ')), ...specs.isbns]));
          if (cleanIsbn && !allIsbns.includes(cleanIsbn)) continue;
          const tags: string[] = Array.isArray(prod.tags) ? prod.tags : String(prod.tags ?? '').split(',');
          const authors = [...specs.authors];
          const translators = [...specs.translators];
          const illustrators = [...specs.illustrators];
          for (const tag of tags) {
            const t = tag.trim();
            if (/^tacgia_/i.test(t)) addUnique(authors, [t.slice(7)]);
            else if (/^dichgia_/i.test(t)) addUnique(translators, [t.slice(8)]);
            else if (/^hoasi_/i.test(t)) addUnique(illustrators, [t.slice(6)]);
          }
          const pubs: string[] = [];
          if (prod.vendor) addUnique(pubs, [prod.vendor]);
          addUnique(pubs, specs.publishers);
          const targetIsbn = cleanIsbn || allIsbns[0] || null;
          out.push({
            externalId: String(prod.id || slug),
            provider,
            verified: false,
            matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
            matchedIsbns: allIsbns,
            title: prod.title,
            authors,
            translators,
            illustrators,
            publishers: pubs,
            publishedYear: specs.publishedYear,
            language: specs.language || 'vi',
            format: specs.format,
            pageCount: specs.pageCount,
            genres: specs.genres,
            isbn13: targetIsbn,
            isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
            coverUrl: normalizeUrl(prod.image?.src || prod.images?.[0]?.src),
            sourceUrl: `${baseUrl}${slug}`,
            rawPayload: data,
          });
        }
        return out;
      });

    await Promise.all([
      runProvider('hcm_library', 'Thư viện KHTH TP.HCM', async () => {
        const searchField = cleanIsbn ? 'ISBN' : 'FullText';
        const term = cleanIsbn || q;
        const r = await fTimeout(
          `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=${searchField}%3A%25${encodeURIComponent(term)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`
        );
        if (!r.ok) return [];
        const html = await r.text();
        const ids = Array.from(new Set([...html.matchAll(/ItemDetail\/(\d+)/gi)].map((m) => m[1]))).slice(0, 4);
        const out: Candidate[] = [];
        for (const id of ids) {
          const dRes = await fTimeout(`https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/${id}`);
          if (!dRes.ok) continue;
          const dHtml = await dRes.text();
          const marcSection = dHtml.match(/<div[^>]+id=["']divMARC21["'][\s\S]*?<\/div>\s*(?:<\/div>|<script)/i)?.[0] ?? dHtml;
          const marc = parseMarc21(marcSection);
          if (!marc) continue;
          if (cleanIsbn && !marc.isbns.includes(cleanIsbn)) continue;
          const targetIsbn = cleanIsbn || marc.isbns[0] || null;
          const coverUrl = marc.coverPath
            ? `https://phucvu.thuvientphcm.gov.vn${marc.coverPath.startsWith('/Upload') ? marc.coverPath : `/Upload${marc.coverPath}`}`
            : undefined;
          out.push({
            externalId: id,
            provider: 'hcm_library',
            verified: false,
            matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
            matchedIsbns: marc.isbns,
            title: marc.title,
            subtitle: marc.subtitle,
            authors: marc.authors,
            translators: marc.translators,
            illustrators: marc.illustrators,
            publishers: marc.publishers,
            publishedYear: marc.publishedYear,
            language: marc.language,
            pageCount: marc.pageCount,
            genres: marc.subjects,
            description: marc.description,
            isbn13: targetIsbn,
            isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
            coverUrl: normalizeUrl(coverUrl),
            sourceUrl: `https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/${id}`,
            rawPayload: { itemId: id, marc },
          });
        }
        return out;
      }),
      runSapo('adcbook', 'ADCBook', 'https://adcbook.net.vn'),
      runSapo('gooda', 'Gooda.vn', 'https://gooda.vn'),
      runHaravan('hikaru', 'Hikaru Books', 'https://hikaru.vn'),
      runSapo('nxb_kim_dong', 'NXB Kim Đồng', 'https://nxbkimdong.com.vn'),
      runSapo('nha_nam', 'Nhã Nam', 'https://nhanam.vn'),
      runHaravan('ipm', 'IPM', 'https://ipm.vn'),
      runProvider('google_books', 'Google Books', async () => {
        const googleKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
        const gbUrl = new URL('https://www.googleapis.com/books/v1/volumes');
        gbUrl.searchParams.set('q', cleanIsbn ? `isbn:${cleanIsbn}` : q);
        gbUrl.searchParams.set('maxResults', '8');
        if (googleKey) gbUrl.searchParams.set('key', googleKey);
        const res = await fTimeout(gbUrl.toString());
        if (res.status === 429 || res.status === 403) {
          throw new Error(`HTTP ${res.status}: configure GOOGLE_BOOKS_API_KEY`);
        }
        if (!res.ok) return [];
        const data = await res.json();
        const out: Candidate[] = [];
        for (const item of data.items ?? []) {
          const info = item.volumeInfo ?? {};
          const ids: Array<{ type: string; identifier: string }> = info.industryIdentifiers ?? [];
          const allIsbns = extractIsbnsFromText(ids.map((x) => x.identifier).join(' '));
          if (cleanIsbn && !allIsbns.includes(cleanIsbn)) continue;
          const targetIsbn = cleanIsbn || allIsbns[0] || null;
          out.push({
            externalId: item.id,
            provider: 'google_books',
            verified: false,
            matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
            matchedIsbns: allIsbns,
            title: info.title ?? 'Untitled',
            subtitle: info.subtitle,
            authors: info.authors ?? [],
            translators: [],
            publishers: info.publisher ? [info.publisher] : [],
            publishedDate: info.publishedDate,
            publishedYear: info.publishedDate ? Number(String(info.publishedDate).slice(0, 4)) || null : null,
            language: info.language ?? 'en',
            pageCount: info.pageCount ?? null,
            genres: info.categories ?? [],
            description: info.description,
            isbn13: targetIsbn,
            isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
            coverUrl: normalizeUrl(info.imageLinks?.thumbnail),
            rawPayload: item,
          });
        }
        return out;
      }),
      runProvider('open_library', 'Open Library', async () => {
        if (!cleanIsbn) {
          const r = await fTimeout(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`);
          if (!r.ok) return [];
          const d = await r.json();
          return (d.docs ?? []).map((doc: Record<string, unknown>) => ({
            externalId: String(doc.key ?? doc.title),
            provider: 'open_library',
            verified: false,
            matchConfidence: 'title_match' as const,
            matchedIsbns: extractIsbnsFromText(((doc.isbn as string[]) ?? []).join(' ')),
            title: String(doc.title ?? 'Untitled'),
            authors: (doc.author_name as string[]) ?? [],
            translators: [],
            publishers: ((doc.publisher as string[]) ?? []).slice(0, 2),
            publishedYear: (doc.first_publish_year as number) ?? null,
            language: (doc.language as string[])?.[0] ?? 'en',
            pageCount: (doc.number_of_pages_median as number) ?? null,
            genres: ((doc.subject as string[]) ?? []).slice(0, 5),
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
            rawPayload: doc,
          }));
        }
        const r = await fTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
        if (!r.ok) return [];
        const d = await r.json();
        const entry = d[`ISBN:${cleanIsbn}`];
        if (!entry) return [];
        return [{
          externalId: entry.key ?? `ol-${cleanIsbn}`,
          provider: 'open_library',
          verified: false,
          matchConfidence: 'exact_isbn',
          matchedIsbns: [cleanIsbn],
          title: entry.title ?? 'Untitled',
          authors: (entry.authors ?? []).map((a: { name: string }) => a.name),
          translators: [],
          publishers: (entry.publishers ?? []).map((p: { name: string }) => p.name),
          publishedYear: entry.publish_date ? Number(String(entry.publish_date).match(/\d{4}/)?.[0]) || null : null,
          language: 'en',
          pageCount: entry.number_of_pages ?? null,
          genres: (entry.subjects ?? []).slice(0, 6).map((s: { name: string }) => s.name),
          isbn13: cleanIsbn,
          isbn10: isbn13To10(cleanIsbn),
          coverUrl: normalizeUrl(entry.cover?.large ?? entry.cover?.medium),
          rawPayload: entry,
        }];
      }),
      runProvider('nlv_opac', 'Thư viện Quốc gia VN', async () => {
        const r = await fTimeout(`https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(cleanIsbn || q)}`);
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
        return [];
      }),
      runProvider('fahasa', 'Fahasa', async () => {
        const r = await fTimeout(`https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(cleanIsbn || q)}`);
        if (r.status === 403 || r.status === 503) throw new Error('Cloudflare HTTP 403');
        return [];
      }),
    ]);

    const EDGE_PRIORITY: Record<string, number> = {
      hcm_library: 100,
      nlv_opac: 98,
      nxb_kim_dong: 92,
      nha_nam: 90,
      ipm: 88,
      adcbook: 84,
      gooda: 82,
      hikaru: 80,
      google_books: 72,
      open_library: 70,
      tiki: 55,
    };
    const sortedCandidates = [...candidates].sort(
      (a, b) => (EDGE_PRIORITY[b.provider] ?? 50) - (EDGE_PRIORITY[a.provider] ?? 50)
    );

    // Merge exact ISBN matches by isbn13
    const byIsbn = new Map<string, Candidate>();
    const nonExact: Candidate[] = [];
    for (const c of sortedCandidates) {
      if (cleanIsbn && c.matchConfidence === 'exact_isbn' && c.isbn13) {
        const prev = byIsbn.get(c.isbn13);
        if (!prev) {
          byIsbn.set(c.isbn13, { ...c, sources: [c.provider] });
        } else {
          const conflicts = [...(prev.conflicts ?? [])];
          if (prev.pageCount && c.pageCount && prev.pageCount !== c.pageCount) {
            conflicts.push({
              field: 'pageCount',
              values: [
                { provider: prev.provider, value: String(prev.pageCount) },
                { provider: c.provider, value: String(c.pageCount) },
              ],
            });
          }
          addUnique(prev.authors, c.authors);
          addUnique(prev.translators, c.translators);
          const ill = [...(prev.illustrators ?? [])];
          addUnique(ill, c.illustrators ?? []);
          addUnique(prev.publishers, c.publishers);
          addUnique(prev.genres, c.genres);
          prev.illustrators = ill;
          prev.publishingPartner = prev.publishingPartner || c.publishingPartner;
          prev.pageCount = prev.pageCount ?? c.pageCount ?? null;
          prev.publishedYear = prev.publishedYear ?? c.publishedYear ?? null;
          prev.coverUrl = prev.coverUrl || c.coverUrl;
          prev.description = prev.description || c.description;
          prev.sources = Array.from(new Set([...(prev.sources ?? [prev.provider]), c.provider]));
          if (conflicts.length) prev.conflicts = conflicts;
        }
      } else {
        nonExact.push({ ...c, sources: [c.provider] });
      }
    }

    const merged = cleanIsbn && byIsbn.size > 0 ? Array.from(byIsbn.values()) : [...Array.from(byIsbn.values()), ...nonExact];
    return new Response(
      JSON.stringify({
        candidates: merged,
        providerStatuses: statuses,
        queriedIsbn: cleanIsbn || null,
        exactMatchCount: merged.filter((c) => c.matchConfidence === 'exact_isbn').length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), candidates: [], providerStatuses: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
