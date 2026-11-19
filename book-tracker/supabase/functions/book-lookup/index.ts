// Supabase Edge Function: book-lookup
// Server-side multi-provider bibliographic metadata discovery engine for global & regional editions.
// Runs without browser CORS limits using staged orchestration:
//   - Tier 1 International: Open Library (/isbn/{isbn}.json + /api/books), Google Books, CrossRef, WorldCat, ISBNdb
//   - Tier 2 National/Regional: NDL Japan, openBD, BnF France SRU, HCM Library MARC21, NL Korea, LoC US,
//     plus transparent unsupported_interface reporting for NLV OPAC, British Library, Taiwan NCL, NLC China
//   - Tier 3 Publishers/Stores: ADCBook, Gooda, Hikaru, Phương Nam, NXB Kim Đồng, Nhã Nam, IPM, Amak, Tiki, Fahasa

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProviderTier = 'tier1_international' | 'tier2_national' | 'tier3_publisher';
type MatchConfidence = 'exact_isbn' | 'approximate_match' | 'unverified_isbn' | 'title_match';
type EditionMatchLevel = 'exact_edition' | 'possible_edition' | 'related_edition' | 'work_match';
type ProviderStatusCode =
  | 'exact_match'
  | 'approximate_match'
  | 'no_match'
  | 'timeout'
  | 'access_denied'
  | 'api_key_required'
  | 'proxy_required'
  | 'not_implemented'
  | 'unsupported_interface'
  | 'upstream_error';

interface ProviderStatusReport {
  provider: string;
  label: string;
  tier: ProviderTier;
  region: string;
  status: ProviderStatusCode;
  candidateCount: number;
  exactMatchCount: number;
  message?: string;
}

interface Candidate {
  externalId: string;
  provider: string;
  sources?: string[];
  tier?: ProviderTier;
  verified: boolean;
  matchConfidence: MatchConfidence;
  editionMatchLevel?: EditionMatchLevel;
  matchedIsbns: string[];
  title: string;
  originalTitle?: string;
  translationTitle?: string;
  subtitle?: string;
  editionName?: string;
  authors: string[];
  translators: string[];
  illustrators?: string[];
  editors?: string[];
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
  volumeNumber?: string;
  sourceUrl?: string;
  conflicts?: Array<{ field: string; values: Array<{ provider: string; value: string }> }>;
  contradictions?: string[];
  fieldProvenance?: Record<string, { provider: string; trust: 'verified' | 'approximate' }>;
  rawPayload: Record<string, unknown>;
}

const EDGE_PRIORITY: Record<string, number> = {
  hcm_library: 100,
  ndl_japan: 99,
  bnf_france: 98,
  nlv_opac: 97,
  loc_us: 96,
  nl_korea: 95,
  british_library: 94,
  taiwan_ncl: 93,
  nlc_china: 93,
  nxb_kim_dong: 92,
  nha_nam: 90,
  ipm: 88,
  amak: 86,
  adcbook: 84,
  gooda: 82,
  hikaru: 80,
  phuong_nam: 78,
  open_library: 76,
  google_books: 75,
  worldcat: 74,
  isbndb: 73,
  openbd: 71,
  crossref: 68,
  tiki: 55,
  fahasa: 50,
};

// ----------------------------------------------------------------------------
// ISBN & Language Helpers
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

const ISO_LANG: Record<string, string> = {
  en: 'en', eng: 'en', english: 'en',
  vi: 'vi', vie: 'vi', vietnamese: 'vi',
  ja: 'ja', jp: 'ja', jpn: 'ja', japanese: 'ja',
  ko: 'ko', kor: 'ko', korean: 'ko',
  zh: 'zh', chi: 'zh', zho: 'zh', cmn: 'zh', chinese: 'zh',
  fr: 'fr', fre: 'fr', fra: 'fr', french: 'fr',
  de: 'de', ger: 'de', deu: 'de', german: 'de',
  es: 'es', spa: 'es', it: 'it', ita: 'it', pt: 'pt', por: 'pt', ru: 'ru', rus: 'ru',
};

function normLang(raw?: string | null, isbn13?: string | null): string {
  if (raw) {
    const c = raw.replace(/^\/languages\//i, '').trim().toLowerCase();
    if (ISO_LANG[c]) return ISO_LANG[c];
    if (/^[a-z]{2}(-[a-z0-9]{2,8})?$/i.test(c)) return c;
  }
  if (isbn13?.startsWith('978604')) return 'vi';
  if (isbn13?.startsWith('9784')) return 'ja';
  if (isbn13?.startsWith('97889')) return 'ko';
  if (isbn13?.startsWith('9787')) return 'zh';
  if (isbn13?.startsWith('978957') || isbn13?.startsWith('978986')) return 'zh-Hant';
  if (isbn13?.startsWith('9782')) return 'fr';
  if (isbn13?.startsWith('9783')) return 'de';
  return 'und';
}

function getAffinity(isbn13: string): string {
  if (isbn13.startsWith('978604')) return 'vi';
  if (isbn13.startsWith('9784')) return 'jp';
  if (isbn13.startsWith('97889')) return 'kr';
  if (isbn13.startsWith('9787')) return 'cn';
  if (isbn13.startsWith('978957') || isbn13.startsWith('978986')) return 'tw';
  if (isbn13.startsWith('9782')) return 'fr';
  if (isbn13.startsWith('9783')) return 'de';
  if (isbn13.startsWith('9780') || isbn13.startsWith('9781')) return 'en';
  return 'global';
}

// ----------------------------------------------------------------------------
// HTML / XML / MARC21 Parsers
// ----------------------------------------------------------------------------
const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—',
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

function extractXmlTags(block: string, tagName: string): string[] {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  const out: string[] = [];
  for (const m of block.matchAll(re)) {
    const inner = m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
    const cleaned = decodeHtml(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (cleaned) out.push(cleaned);
  }
  return out;
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
  const seen = new Set(list.map((x) => x.toLocaleLowerCase()));
  for (const v of vals) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLocaleLowerCase();
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
      language = normLang(code);
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

async function fTimeout(url: string, init?: RequestInit, ms = 7000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function normKey(s: string): string {
  return s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function shareTitleTokens(a: string, b: string): boolean {
  const tokA = new Set(normKey(a).split(' ').filter((w) => w.length >= 2));
  const tokB = new Set(normKey(b).split(' ').filter((w) => w.length >= 2));
  if (tokA.size === 0 || tokB.size === 0) return true;
  for (const w of tokA) if (tokB.has(w)) return true;
  return false;
}

function buildProv(c: Candidate): Record<string, { provider: string; trust: 'verified' | 'approximate' }> {
  const trust = c.matchConfidence === 'exact_isbn' ? 'verified' : 'approximate';
  const out: Record<string, { provider: string; trust: 'verified' | 'approximate' }> = {};
  if (c.title && c.title !== 'Untitled') out.title = { provider: c.provider, trust };
  if (c.originalTitle) out.originalTitle = { provider: c.provider, trust };
  if (c.authors.length) out.authors = { provider: c.provider, trust };
  if (c.translators.length) out.translators = { provider: c.provider, trust };
  if (c.illustrators?.length) out.illustrators = { provider: c.provider, trust };
  if (c.editors?.length) out.editors = { provider: c.provider, trust };
  if (c.publishers.length) out.publishers = { provider: c.provider, trust };
  if (c.pageCount) out.pageCount = { provider: c.provider, trust };
  if (c.publishedYear) out.publishedYear = { provider: c.provider, trust };
  if (c.coverUrl) out.coverUrl = { provider: c.provider, trust };
  if (c.language && c.language !== 'und') out.language = { provider: c.provider, trust };
  return out;
}

function isSufficientEdge(exacts: Candidate[]): boolean {
  const best = exacts.find((c) => c.matchConfidence === 'exact_isbn' && (!c.contradictions || c.contradictions.length === 0));
  if (!best || !best.title || best.title === 'Untitled' || best.authors.length === 0) return false;
  let score = 0;
  if (best.publishers.length) score++;
  if (best.publishedYear) score++;
  if (best.pageCount) score++;
  if (best.coverUrl) score++;
  if (best.language && best.language !== 'und') score++;
  return score >= 2;
}

function mergeCandidatesEdge(rawList: Candidate[], cleanIsbn: string) {
  const sorted = [...rawList].sort((a, b) => (EDGE_PRIORITY[b.provider] ?? 50) - (EDGE_PRIORITY[a.provider] ?? 50));
  const byIsbn = new Map<string, Candidate>();
  const possibleOrWork: Candidate[] = [];

  for (const c of sorted) {
    if (cleanIsbn && c.matchConfidence === 'exact_isbn' && c.isbn13) {
      const prev = byIsbn.get(c.isbn13);
      if (!prev) {
        byIsbn.set(c.isbn13, {
          ...c,
          sources: [c.provider],
          editionMatchLevel: 'exact_edition',
          fieldProvenance: buildProv(c),
        });
      } else {
        const conflicts = [...(prev.conflicts ?? [])];
        const contradictions = [...(prev.contradictions ?? [])];
        if (prev.title && c.title && !shareTitleTokens(prev.title, c.title)) {
          contradictions.push(`Title mismatch (${prev.title} [${prev.provider}] vs ${c.title} [${c.provider}])`);
        }
        if (prev.pageCount && c.pageCount && prev.pageCount !== c.pageCount) {
          conflicts.push({
            field: 'pageCount',
            values: [
              { provider: prev.provider, value: String(prev.pageCount) },
              { provider: c.provider, value: String(c.pageCount) },
            ],
          });
        }
        const secProv = buildProv(c);
        const mergedProv = { ...(prev.fieldProvenance ?? {}) };
        for (const [f, entry] of Object.entries(secProv)) {
          if (!mergedProv[f]) mergedProv[f] = entry;
        }
        addUnique(prev.authors, c.authors);
        addUnique(prev.translators, c.translators);
        const ill = [...(prev.illustrators ?? [])];
        addUnique(ill, c.illustrators ?? []);
        const eds = [...(prev.editors ?? [])];
        addUnique(eds, c.editors ?? []);
        addUnique(prev.publishers, c.publishers);
        addUnique(prev.genres, c.genres);
        prev.illustrators = ill;
        prev.editors = eds;
        prev.originalTitle = prev.originalTitle || c.originalTitle;
        prev.publishingPartner = prev.publishingPartner || c.publishingPartner;
        prev.pageCount = prev.pageCount ?? c.pageCount ?? null;
        prev.publishedYear = prev.publishedYear ?? c.publishedYear ?? null;
        if (prev.language === 'und' && c.language && c.language !== 'und') prev.language = c.language;
        prev.coverUrl = prev.coverUrl || c.coverUrl;
        prev.description = prev.description || c.description;
        prev.sources = Array.from(new Set([...(prev.sources ?? [prev.provider]), c.provider]));
        prev.fieldProvenance = mergedProv;
        if (conflicts.length) prev.conflicts = conflicts;
        if (contradictions.length) {
          prev.contradictions = contradictions;
          prev.editionMatchLevel = 'possible_edition';
        }
      }
    } else {
      possibleOrWork.push({
        ...c,
        sources: [c.provider],
        editionMatchLevel: cleanIsbn ? 'possible_edition' : 'work_match',
        fieldProvenance: buildProv(c),
      });
    }
  }

  const exactMatches: Candidate[] = [];
  const possibleEditionMatches: Candidate[] = [];
  for (const c of byIsbn.values()) {
    if (c.contradictions && c.contradictions.length > 0) possibleEditionMatches.push(c);
    else exactMatches.push(c);
  }
  const workMatches = cleanIsbn ? [] : possibleOrWork;
  if (cleanIsbn) possibleEditionMatches.push(...possibleOrWork);
  const approximateMatches = [...possibleEditionMatches, ...workMatches];
  const merged = cleanIsbn && exactMatches.length > 0 ? exactMatches : [...exactMatches, ...approximateMatches];

  return { merged, exactMatches, possibleEditionMatches, workMatches, approximateMatches };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { isbn, query, forceAllProviders } = (await req.json()) as {
      isbn?: string;
      query?: string;
      forceAllProviders?: boolean;
    };
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

    class EdgeProviderError extends Error {
      readonly status: ProviderStatusCode;
      constructor(status: ProviderStatusCode, message: string) {
        super(message);
        this.status = status;
      }
    }

    interface ProviderTask {
      provider: string;
      label: string;
      tier: ProviderTier;
      region: string;
      run: () => Promise<Candidate[]>;
    }

    const executeTask = async (task: ProviderTask) => {
      try {
        const res = await task.run();
        candidates.push(...res);
        const exactCount = res.filter((c) => c.matchConfidence === 'exact_isbn').length;
        statuses.push({
          provider: task.provider,
          label: task.label,
          tier: task.tier,
          region: task.region,
          status: exactCount > 0 ? 'exact_match' : res.length > 0 ? 'approximate_match' : 'no_match',
          candidateCount: res.length,
          exactMatchCount: exactCount,
        });
      } catch (err) {
        if (err instanceof EdgeProviderError) {
          statuses.push({
            provider: task.provider,
            label: task.label,
            tier: task.tier,
            region: task.region,
            status: err.status,
            candidateCount: 0,
            exactMatchCount: 0,
            message: err.message,
          });
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        const status: ProviderStatusCode =
          lower.includes('abort') || lower.includes('timeout')
            ? 'timeout'
            : /429|api key|quota/i.test(msg)
              ? 'api_key_required'
              : /403|cloudflare|denied/i.test(msg)
                ? 'access_denied'
                : 'upstream_error';
        statuses.push({
          provider: task.provider,
          label: task.label,
          tier: task.tier,
          region: task.region,
          status,
          candidateCount: 0,
          exactMatchCount: 0,
          message: msg,
        });
      }
    };

    const makeSapoTask = (provider: string, label: string, region: string, baseUrl: string): ProviderTask => ({
      provider,
      label,
      tier: 'tier3_publisher',
      region,
      run: async () => {
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
            tier: 'tier3_publisher',
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
      },
    });

    const makeHaravanTask = (provider: string, label: string, region: string, baseUrl: string): ProviderTask => ({
      provider,
      label,
      tier: 'tier3_publisher',
      region,
      run: async () => {
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
            tier: 'tier3_publisher',
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
      },
    });

    const ALL_TASKS: ProviderTask[] = [
      // Tier 1 International
      {
        provider: 'open_library',
        label: 'Open Library',
        tier: 'tier1_international',
        region: 'global',
        run: async () => {
          if (!cleanIsbn) {
            const r = await fTimeout(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`);
            if (!r.ok) return [];
            const d = await r.json();
            return (d.docs ?? []).map((doc: Record<string, unknown>) => ({
              externalId: String(doc.key ?? doc.title),
              provider: 'open_library',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: 'title_match' as const,
              matchedIsbns: extractIsbnsFromText(((doc.isbn as string[]) ?? []).join(' ')),
              title: String(doc.title ?? 'Untitled'),
              authors: (doc.author_name as string[]) ?? [],
              translators: [],
              publishers: ((doc.publisher as string[]) ?? []).slice(0, 2),
              publishedYear: (doc.first_publish_year as number) ?? null,
              language: normLang((doc.language as string[])?.[0]),
              pageCount: (doc.number_of_pages_median as number) ?? null,
              genres: ((doc.subject as string[]) ?? []).slice(0, 5),
              coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
              rawPayload: doc,
            }));
          }

          const [booksRes, edRes] = await Promise.all([
            fTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`).catch(() => null),
            fTimeout(`https://openlibrary.org/isbn/${cleanIsbn}.json`).catch(() => null),
          ]);
          const booksData = booksRes?.ok ? await booksRes.json().catch(() => null) : null;
          const entry = booksData?.[`ISBN:${cleanIsbn}`];
          const edJson = edRes?.ok ? await edRes.json().catch(() => null) : null;

          const edLang = Array.isArray(edJson?.languages) && edJson.languages[0]?.key
            ? normLang(String(edJson.languages[0].key), cleanIsbn)
            : normLang(undefined, cleanIsbn);
          const edOrig = Array.isArray(edJson?.work_titles) && edJson.work_titles[0] ? String(edJson.work_titles[0]) : undefined;
          const translators: string[] = [];
          if (typeof edJson?.by_statement === 'string') {
            const tm = edJson.by_statement.match(/translat(?:ed|ion)\s+(?:from[^;]+?\s+)?by\s+([^;.]+)/i);
            if (tm?.[1]) translators.push(tm[1].trim());
          }
          if (!entry && !edJson?.title) return [];
          const title = entry?.title || edJson?.title || 'Untitled';
          const pubs = (entry?.publishers ?? []).map((p: { name: string }) => p.name);
          if (pubs.length === 0 && Array.isArray(edJson?.publishers)) {
            pubs.push(...edJson.publishers.map(String));
          }
          const pubDate = entry?.publish_date || edJson?.publish_date;
          const edCoverId = Array.isArray(edJson?.covers) ? edJson.covers.find((x: unknown) => typeof x === 'number' && x > 0) : null;

          return [{
            externalId: entry?.key || edJson?.key || `ol-${cleanIsbn}`,
            provider: 'open_library',
            tier: 'tier1_international',
            verified: false,
            matchConfidence: 'exact_isbn',
            matchedIsbns: [cleanIsbn],
            title,
            originalTitle: edOrig,
            editionName: typeof edJson?.edition_name === 'string' ? edJson.edition_name : undefined,
            authors: (entry?.authors ?? []).map((a: { name: string }) => a.name),
            translators,
            publishers: pubs,
            publishedYear: pubDate ? Number(String(pubDate).match(/\d{4}/)?.[0]) || null : null,
            language: edLang === 'und' ? 'en' : edLang,
            pageCount: entry?.number_of_pages ?? edJson?.number_of_pages ?? null,
            genres: (entry?.subjects ?? []).slice(0, 6).map((s: { name: string }) => s.name),
            isbn13: cleanIsbn,
            isbn10: isbn13To10(cleanIsbn),
            coverUrl: normalizeUrl(entry?.cover?.large ?? entry?.cover?.medium ?? (edCoverId ? `https://covers.openlibrary.org/b/id/${edCoverId}-L.jpg` : undefined)),
            rawPayload: { entry, edJson },
          }];
        },
      },
      {
        provider: 'google_books',
        label: 'Google Books',
        tier: 'tier1_international',
        region: 'global',
        run: async () => {
          const googleKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
          const gbUrl = new URL('https://www.googleapis.com/books/v1/volumes');
          gbUrl.searchParams.set('q', cleanIsbn ? `isbn:${cleanIsbn}` : q);
          gbUrl.searchParams.set('maxResults', '8');
          if (googleKey) gbUrl.searchParams.set('key', googleKey);
          const res = await fTimeout(gbUrl.toString());
          if (res.status === 429 || res.status === 403 || res.status === 401) {
            throw new EdgeProviderError('api_key_required', `HTTP ${res.status}: configure GOOGLE_BOOKS_API_KEY`);
          }
          if (!res.ok) throw new EdgeProviderError('upstream_error', `Google Books HTTP ${res.status}`);
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
              tier: 'tier1_international',
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
              language: normLang(info.language, targetIsbn),
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
        },
      },
      {
        provider: 'crossref',
        label: 'CrossRef Works',
        tier: 'tier1_international',
        region: 'global',
        run: async () => {
          const url = cleanIsbn
            ? `https://api.crossref.org/works?filter=isbn:${encodeURIComponent(cleanIsbn)}&rows=4`
            : `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&filter=type:monograph,type:book,type:edited-book&rows=6`;
          const res = await fTimeout(url);
          if (res.status === 429) throw new EdgeProviderError('upstream_error', 'CrossRef rate limited (HTTP 429)');
          if (!res.ok) return [];
          const data = await res.json();
          const out: Candidate[] = [];
          for (const item of data.message?.items ?? []) {
            const title = Array.isArray(item.title) ? String(item.title[0] ?? '').trim() : '';
            if (!title) continue;
            const isbns = extractIsbnsFromText(Array.isArray(item.ISBN) ? item.ISBN.join(' ') : '');
            if (cleanIsbn && isbns.length > 0 && !isbns.includes(cleanIsbn)) continue;
            const fmtP = (p: { given?: string; family?: string; name?: string }) => p.name?.trim() || [p.given, p.family].filter(Boolean).join(' ').trim();
            const targetIsbn = cleanIsbn || isbns[0] || null;
            out.push({
              externalId: String(item.DOI ?? title),
              provider: 'crossref',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: isbns,
              title,
              authors: Array.isArray(item.author) ? item.author.map(fmtP).filter(Boolean) : [],
              translators: [],
              editors: Array.isArray(item.editor) ? item.editor.map(fmtP).filter(Boolean) : [],
              publishers: typeof item.publisher === 'string' ? [item.publisher] : [],
              publishedYear: item.issued?.['date-parts']?.[0]?.[0] ?? null,
              language: normLang(item.language, targetIsbn),
              genres: Array.isArray(item.subject) ? item.subject.slice(0, 6) : [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              sourceUrl: typeof item.URL === 'string' ? item.URL : undefined,
              rawPayload: item,
            });
          }
          return out;
        },
      },
      {
        provider: 'isbndb',
        label: 'ISBNdb API',
        tier: 'tier1_international',
        region: 'global',
        run: async () => {
          const key = Deno.env.get('ISBNDB_API_KEY');
          if (!key) throw new EdgeProviderError('api_key_required', 'Configure ISBNDB_API_KEY in Edge Function secrets');
          const url = cleanIsbn
            ? `https://api2.isbndb.com/book/${encodeURIComponent(cleanIsbn)}`
            : `https://api2.isbndb.com/books/${encodeURIComponent(q)}?pageSize=6`;
          const res = await fTimeout(url, { headers: { Authorization: key } });
          if (res.status === 404) return [];
          if (!res.ok) throw new EdgeProviderError('upstream_error', `ISBNdb HTTP ${res.status}`);
          const d = await res.json();
          const list = cleanIsbn ? (d.book ? [d.book] : []) : (d.books ?? []);
          return list.map((b: Record<string, unknown>) => {
            const targetIsbn = cleanIsbn || normalizeIsbnTo13(String(b.isbn13 || b.isbn || '')) || null;
            return {
              externalId: String(b.isbn13 || b.isbn || b.title),
              provider: 'isbndb',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: targetIsbn ? [targetIsbn] : [],
              title: String(b.title_long || b.title || 'Untitled'),
              editionName: typeof b.edition === 'string' ? b.edition : undefined,
              authors: Array.isArray(b.authors) ? b.authors.map(String) : [],
              translators: [],
              publishers: typeof b.publisher === 'string' ? [b.publisher] : [],
              publishedYear: b.date_published ? Number(String(b.date_published).match(/\d{4}/)?.[0]) || null : null,
              language: normLang(typeof b.language === 'string' ? b.language : undefined, targetIsbn),
              pageCount: typeof b.pages === 'number' ? b.pages : null,
              genres: Array.isArray(b.subjects) ? b.subjects.slice(0, 6).map(String) : [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              coverUrl: normalizeUrl(typeof b.image === 'string' ? b.image : undefined),
              rawPayload: b,
            };
          });
        },
      },
      {
        provider: 'worldcat',
        label: 'OCLC WorldCat',
        tier: 'tier1_international',
        region: 'global',
        run: async () => {
          const cid = Deno.env.get('WORLDCAT_CLIENT_ID');
          const csec = Deno.env.get('WORLDCAT_CLIENT_SECRET');
          if (!cid || !csec) {
            throw new EdgeProviderError('api_key_required', 'Configure WORLDCAT_CLIENT_ID / WORLDCAT_CLIENT_SECRET');
          }
          const tokRes = await fTimeout('https://oauth.oclc.org/token', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${btoa(`${cid}:${csec}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials&scope=wcapi',
          });
          if (!tokRes.ok) throw new EdgeProviderError('api_key_required', `OCLC OAuth HTTP ${tokRes.status}`);
          const tokData = await tokRes.json();
          const token = tokData.access_token;
          const qStr = cleanIsbn ? `bn:${cleanIsbn}` : q;
          const res = await fTimeout(`https://americas.discovery.api.oclc.org/worldcat/search/v2/bibs?q=${encodeURIComponent(qStr)}&limit=5`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.bibRecords ?? []).map((rec: Record<string, unknown>) => {
            const id = rec.identifier as { isbns?: string[]; oclcNumber?: string } | undefined;
            const isbns = extractIsbnsFromText((id?.isbns ?? []).join(' '));
            const titleObj = rec.title as { mainTitles?: Array<{ text?: string }> } | undefined;
            const targetIsbn = cleanIsbn || isbns[0] || null;
            return {
              externalId: String(id?.oclcNumber ?? titleObj?.mainTitles?.[0]?.text ?? 'wc'),
              provider: 'worldcat',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: isbns,
              title: titleObj?.mainTitles?.[0]?.text ?? 'Untitled',
              authors: [],
              translators: [],
              publishers: [],
              language: normLang(undefined, targetIsbn),
              genres: [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              sourceUrl: id?.oclcNumber ? `https://www.worldcat.org/oclc/${id.oclcNumber}` : undefined,
              rawPayload: rec,
            };
          });
        },
      },

      // Tier 2 National / Regional Libraries
      {
        provider: 'ndl_japan',
        label: 'National Diet Library (JP)',
        tier: 'tier2_national',
        region: 'jp',
        run: async () => {
          const url = cleanIsbn
            ? `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${encodeURIComponent(cleanIsbn)}&cnt=5`
            : `https://ndlsearch.ndl.go.jp/api/opensearch?any=${encodeURIComponent(q)}&cnt=8`;
          const res = await fTimeout(url);
          if (!res.ok) return [];
          const xml = await res.text();
          const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
          const out: Candidate[] = [];
          for (const itemXml of items) {
            const title = extractXmlTags(itemXml, 'dc:title')[0] || extractXmlTags(itemXml, 'title')[0];
            if (!title) continue;
            const isbns = extractIsbnsFromText(extractXmlTags(itemXml, 'dc:identifier').join(' '));
            if (cleanIsbn && isbns.length > 0 && !isbns.includes(cleanIsbn)) continue;
            const vol = extractXmlTags(itemXml, 'dcndl:volume')[0];
            const seriesName = extractXmlTags(itemXml, 'dcndl:seriesTitle')[0];
            const publishers = extractXmlTags(itemXml, 'dc:publisher');
            const issued = extractXmlTags(itemXml, 'dcterms:issued')[0] || extractXmlTags(itemXml, 'dc:date')[0];
            const extent = extractXmlTags(itemXml, 'dc:extent')[0];
            const genres = extractXmlTags(itemXml, 'dcndl:genre');
            const link = extractXmlTags(itemXml, 'link')[0];
            const creators = extractXmlTags(itemXml, 'dc:creator').map((n) => n.replace(/,\s*/g, ' ').trim());
            const pagesMatch = extent?.match(/(\d{1,5})\s*p/i);
            const targetIsbn = cleanIsbn || isbns[0] || null;
            out.push({
              externalId: link || `ndl-${targetIsbn || title}`,
              provider: 'ndl_japan',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: isbns,
              title: vol && !title.includes(vol) ? `${title} ${vol}` : title,
              authors: creators,
              translators: [],
              publishers,
              publishedDate: issued,
              publishedYear: issued ? Number(issued.match(/(19|20)\d{2}/)?.[0]) || null : null,
              language: 'ja',
              pageCount: pagesMatch ? Number(pagesMatch[1]) : null,
              genres,
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              seriesName,
              volumeNumber: vol,
              sourceUrl: normalizeUrl(link),
              rawPayload: { title, isbns, link, vol, seriesName },
            });
          }
          return out;
        },
      },
      {
        provider: 'openbd',
        label: 'openBD (JP)',
        tier: 'tier2_national',
        region: 'jp',
        run: async () => {
          if (!cleanIsbn || !cleanIsbn.startsWith('9784')) return [];
          const res = await fTimeout(`https://api.openbd.jp/v1/get?isbn=${cleanIsbn}`);
          if (!res.ok) return [];
          const arr = await res.json();
          const summary = arr?.[0]?.summary;
          if (!summary) return [];
          return [{
            externalId: `openbd-${cleanIsbn}`,
            provider: 'openbd',
            tier: 'tier2_national',
            verified: false,
            matchConfidence: 'exact_isbn',
            matchedIsbns: [cleanIsbn],
            title: summary.title || 'Untitled',
            authors: summary.author ? [summary.author] : [],
            translators: [],
            publishers: summary.publisher ? [summary.publisher] : [],
            publishedYear: summary.pubdate ? Number(String(summary.pubdate).slice(0, 4)) || null : null,
            language: 'ja',
            genres: [],
            isbn13: cleanIsbn,
            isbn10: isbn13To10(cleanIsbn),
            coverUrl: normalizeUrl(summary.cover),
            seriesName: summary.series || undefined,
            volumeNumber: summary.volume || undefined,
            rawPayload: arr[0],
          }];
        },
      },
      {
        provider: 'bnf_france',
        label: 'BnF France (SRU)',
        tier: 'tier2_national',
        region: 'fr',
        run: async () => {
          const sruQ = cleanIsbn ? `bib.isbn adj "${cleanIsbn}"` : `bib.anywhere all "${q.replace(/"/g, ' ')}"`;
          const res = await fTimeout(`https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(sruQ)}&recordSchema=dublincore&maximumRecords=5`);
          if (!res.ok) return [];
          const xml = await res.text();
          const records = [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/gi)].map((m) => m[1]);
          const out: Candidate[] = [];
          for (const recXml of records) {
            const rawTitle = extractXmlTags(recXml, 'dc:title')[0];
            if (!rawTitle) continue;
            const title = rawTitle.split(/\s+\/\s+/)[0].trim();
            const ids = extractXmlTags(recXml, 'dc:identifier');
            const isbns = extractIsbnsFromText(ids.join(' '));
            if (cleanIsbn && isbns.length > 0 && !isbns.includes(cleanIsbn)) continue;
            const targetIsbn = cleanIsbn || isbns[0] || null;
            const dateStr = extractXmlTags(recXml, 'dc:date')[0];
            const fmtStr = extractXmlTags(recXml, 'dc:format')[0];
            const langStr = extractXmlTags(recXml, 'dc:language')[0];
            const pagesMatch = fmtStr?.match(/(\d{1,5})\s*p/i);
            const arkUrl = ids.find((i) => i.includes('catalogue.bnf.fr'));
            out.push({
              externalId: arkUrl || `bnf-${targetIsbn || title}`,
              provider: 'bnf_france',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: isbns,
              title,
              authors: extractXmlTags(recXml, 'dc:creator').map((c) => c.replace(/\s*\(\d{4}-?\d{0,4}\).*$/, '').trim()),
              translators: [],
              publishers: extractXmlTags(recXml, 'dc:publisher').map((p) => p.replace(/\s*\([^)]+\)\s*$/, '').trim()),
              publishedYear: dateStr ? Number(dateStr.match(/(19|20)\d{2}/)?.[0]) || null : null,
              language: normLang(langStr, targetIsbn),
              pageCount: pagesMatch ? Number(pagesMatch[1]) : null,
              genres: [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              sourceUrl: normalizeUrl(arkUrl),
              rawPayload: { title, ids },
            });
          }
          return out;
        },
      },
      {
        provider: 'hcm_library',
        label: 'Thư viện KHTH TP.HCM',
        tier: 'tier2_national',
        region: 'vi',
        run: async () => {
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
              tier: 'tier2_national',
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
        },
      },
      {
        provider: 'nl_korea',
        label: 'National Library of Korea',
        tier: 'tier2_national',
        region: 'kr',
        run: async () => {
          const key = Deno.env.get('NLK_API_KEY');
          if (!key) throw new EdgeProviderError('api_key_required', 'Configure NLK_API_KEY in Edge Function secrets');
          const param = cleanIsbn ? `isbn=${encodeURIComponent(cleanIsbn)}` : `title=${encodeURIComponent(q)}`;
          const res = await fTimeout(`https://www.nl.go.kr/seoji/SearchApi.do?cert_key=${encodeURIComponent(key)}&result_style=json&page_no=1&page_size=5&${param}`);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.docs ?? []).map((d: Record<string, unknown>) => {
            const targetIsbn = cleanIsbn || normalizeIsbnTo13(String(d.EA_ISBN || '')) || null;
            return {
              externalId: String(d.EA_ISBN || d.TITLE),
              provider: 'nl_korea',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: targetIsbn ? [targetIsbn] : [],
              title: String(d.TITLE || 'Untitled'),
              authors: d.AUTHOR ? [String(d.AUTHOR)] : [],
              translators: [],
              publishers: d.PUBLISHER ? [String(d.PUBLISHER)] : [],
              publishedYear: d.PUBLISH_PREDATE ? Number(String(d.PUBLISH_PREDATE).slice(0, 4)) || null : null,
              language: 'ko',
              pageCount: d.PAGE ? Number(String(d.PAGE).match(/\d+/)?.[0]) || null : null,
              genres: d.SUBJECT ? [String(d.SUBJECT)] : [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              rawPayload: d,
            };
          });
        },
      },
      {
        provider: 'loc_us',
        label: 'Library of Congress (US)',
        tier: 'tier2_national',
        region: 'us',
        run: async () => {
          const res = await fTimeout(`https://www.loc.gov/books/?q=${encodeURIComponent(cleanIsbn || q)}&fo=json&c=5`);
          if (res.status === 403) throw new EdgeProviderError('access_denied', 'Library of Congress protected by Cloudflare (HTTP 403)');
          if (!res.ok) return [];
          const json = await res.json();
          const out: Candidate[] = [];
          for (const r of json.results ?? []) {
            const isbns = extractIsbnsFromText(JSON.stringify(r.isbn ?? r.item ?? {}));
            if (cleanIsbn && !isbns.includes(cleanIsbn)) continue;
            const title = typeof r.title === 'string' ? r.title.trim() : '';
            if (!title) continue;
            const targetIsbn = cleanIsbn || isbns[0] || null;
            out.push({
              externalId: String(r.id || title),
              provider: 'loc_us',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbn ? 'exact_isbn' : 'title_match',
              matchedIsbns: isbns,
              title,
              authors: Array.isArray(r.contributor) ? r.contributor.map(String) : [],
              translators: [],
              publishers: [],
              publishedYear: typeof r.date === 'string' ? Number(r.date.match(/(19|20)\d{2}/)?.[0]) || null : null,
              language: normLang(Array.isArray(r.language) ? String(r.language[0]) : undefined, targetIsbn),
              genres: Array.isArray(r.subject) ? r.subject.slice(0, 6).map(String) : [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              sourceUrl: normalizeUrl(r.url),
              rawPayload: r,
            });
          }
          return out;
        },
      },
      {
        provider: 'nlv_opac',
        label: 'Thư viện Quốc gia VN',
        tier: 'tier2_national',
        region: 'vi',
        run: async () => {
          const r = await fTimeout(`https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(cleanIsbn || q)}`);
          if (r.status >= 500) throw new EdgeProviderError('upstream_error', `NLV OPAC HTTP ${r.status}`);
          throw new EdgeProviderError('unsupported_interface', 'NLV OPAC uses a dynamic client-side search widget without a public ISBN query API');
        },
      },
      {
        provider: 'british_library',
        label: 'British Library (UK)',
        tier: 'tier2_national',
        region: 'uk',
        run: async () => {
          throw new EdgeProviderError('unsupported_interface', 'British Library public unauthenticated ISBN REST/SRU API is unavailable');
        },
      },
      {
        provider: 'taiwan_ncl',
        label: 'National Central Library (TW)',
        tier: 'tier2_national',
        region: 'tw',
        run: async () => {
          throw new EdgeProviderError('unsupported_interface', 'Taiwan NCL ISBNNet has no open unauthenticated REST/SRU API');
        },
      },
      {
        provider: 'nlc_china',
        label: 'National Library of China',
        tier: 'tier2_national',
        region: 'cn',
        run: async () => {
          throw new EdgeProviderError('unsupported_interface', 'National Library of China OPAC has no open unauthenticated REST/SRU API');
        },
      },

      // Tier 3 Regional Publishers & Retailers
      makeSapoTask('adcbook', 'ADCBook', 'vi', 'https://adcbook.net.vn'),
      makeSapoTask('gooda', 'Gooda.vn', 'vi', 'https://gooda.vn'),
      makeHaravanTask('hikaru', 'Hikaru Books', 'vi', 'https://hikaru.vn'),
      makeSapoTask('nxb_kim_dong', 'NXB Kim Đồng', 'vi', 'https://nxbkimdong.com.vn'),
      makeSapoTask('nha_nam', 'Nhã Nam', 'vi', 'https://nhanam.vn'),
      makeHaravanTask('ipm', 'IPM', 'vi', 'https://ipm.vn'),
      makeHaravanTask('phuong_nam', 'Nhà sách Phương Nam', 'vi', 'https://nhasachphuongnam.com'),
      {
        provider: 'tiki',
        label: 'Tiki Books',
        tier: 'tier3_publisher',
        region: 'vi',
        run: async () => {
          if (!cleanIsbn) {
            const r = await fTimeout(`https://tiki.vn/api/v2/products?limit=6&q=${encodeURIComponent(q)}`);
            if (r.status === 403) throw new EdgeProviderError('access_denied', 'Tiki HTTP 403');
            if (!r.ok) throw new EdgeProviderError('upstream_error', `Tiki HTTP ${r.status}`);
            const d = await r.json();
            return (d.data ?? []).filter((x: { name?: string }) => Boolean(x.name)).map((x: { id?: number; name?: string; author_name?: string; thumbnail_url?: string; url_path?: string }) => ({
              externalId: String(x.id ?? ''),
              provider: 'tiki',
              tier: 'tier3_publisher' as const,
              verified: false,
              matchConfidence: 'title_match' as const,
              matchedIsbns: [],
              title: x.name!,
              authors: x.author_name ? [x.author_name] : [],
              translators: [],
              publishers: [],
              language: 'vi',
              genres: [],
              coverUrl: normalizeUrl(x.thumbnail_url),
              sourceUrl: x.url_path ? `https://tiki.vn/${x.url_path.replace(/^\//, '')}` : undefined,
              rawPayload: x as unknown as Record<string, unknown>,
            }));
          }
          const r = await fTimeout(`https://tiki.vn/api/v2/products?limit=5&q=${encodeURIComponent(cleanIsbn)}`);
          if (r.status === 403) throw new EdgeProviderError('access_denied', 'Tiki HTTP 403');
          if (!r.ok) throw new EdgeProviderError('upstream_error', `Tiki HTTP ${r.status}`);
          const json = await r.json();
          const ids = (json.data ?? []).map((d: { id?: number }) => d.id).filter(Boolean).slice(0, 3);
          const out: Candidate[] = [];
          for (const id of ids) {
            const dRes = await fTimeout(`https://tiki.vn/api/v2/products/${id}`).catch(() => null);
            if (!dRes?.ok) continue;
            const det = await dRes.json();
            const attrs = (det.specifications ?? []).flatMap((s: { attributes?: Array<{ value?: string }> }) => s.attributes ?? []);
            const allIsbns = extractIsbnsFromText([det.sku ?? '', ...attrs.map((a: { value?: string }) => a.value ?? ''), det.description ?? ''].join(' '));
            if (!allIsbns.includes(cleanIsbn)) continue;
            out.push({
              externalId: String(det.id),
              provider: 'tiki',
              tier: 'tier3_publisher',
              verified: false,
              matchConfidence: 'exact_isbn',
              matchedIsbns: allIsbns,
              title: det.name,
              authors: (det.authors ?? []).map((a: { name?: string }) => a.name).filter(Boolean),
              translators: [],
              publishers: [],
              language: 'vi',
              genres: [],
              isbn13: cleanIsbn,
              isbn10: isbn13To10(cleanIsbn),
              coverUrl: normalizeUrl(det.thumbnail_url),
              sourceUrl: det.url_path ? `https://tiki.vn/${String(det.url_path).replace(/^\//, '')}` : undefined,
              rawPayload: det,
            });
          }
          return out;
        },
      },
      {
        provider: 'fahasa',
        label: 'Fahasa',
        tier: 'tier3_publisher',
        region: 'vi',
        run: async () => {
          const r = await fTimeout(`https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(cleanIsbn || q)}`);
          if (r.status === 403 || r.status === 503) throw new EdgeProviderError('access_denied', 'Cloudflare anti-bot challenge (HTTP 403)');
          throw new EdgeProviderError('unsupported_interface', 'Fahasa endpoint requires interactive session');
        },
      },
    ];

    const stagesExecuted: string[] = [];
    if (!cleanIsbn || forceAllProviders) {
      await Promise.all(ALL_TASKS.map(executeTask));
      stagesExecuted.push(cleanIsbn ? 'stage1' : 'query');
    } else {
      const affinity = getAffinity(cleanIsbn);
      const stage1 = ALL_TASKS.filter(
        (t) =>
          t.tier === 'tier1_international' ||
          t.region === affinity ||
          (affinity === 'en' && (t.region === 'us' || t.region === 'uk'))
      );
      const stage2 = ALL_TASKS.filter((t) => !stage1.includes(t));

      await Promise.all(stage1.map(executeTask));
      stagesExecuted.push('stage1');

      const s1Merged = mergeCandidatesEdge(candidates, cleanIsbn);
      if (stage2.length > 0 && !isSufficientEdge(s1Merged.exactMatches)) {
        await Promise.all(stage2.map(executeTask));
        stagesExecuted.push('stage2');
      }
    }

    const { merged, exactMatches, possibleEditionMatches, workMatches, approximateMatches } =
      mergeCandidatesEdge(candidates, cleanIsbn);

    return new Response(
      JSON.stringify({
        candidates: merged,
        exactMatches,
        possibleEditionMatches,
        relatedEditions: [],
        workMatches,
        approximateMatches,
        providerStatuses: statuses,
        queriedIsbn: cleanIsbn || null,
        exactMatchCount: exactMatches.length,
        stagesExecuted,
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
