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
type BookIdentifierType = 'isbn13' | 'isbn10' | 'ean13' | 'invalid';
type VerificationStatus =
  | 'verified_match'
  | 'valid_identifier_unconfirmed'
  | 'conflicting_records'
  | 'identity_mismatch'
  | 'not_found'
  | 'invalid_identifier';
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
  matchedIdentifiers?: string[];
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
  distributor?: string;
  publishedDate?: string;
  publishedYear?: number | null;
  language: string;
  format?: string;
  pageCount?: number | null;
  genres: string[];
  description?: string;
  isbn13?: string | null;
  isbn10?: string | null;
  ean13?: string | null;
  identifierType?: BookIdentifierType;
  coverUrl?: string;
  seriesName?: string;
  volumeNumber?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  mismatchReason?: string;
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
  first_news: 89,
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
// ISBN, EAN-13 & Language Helpers
// ----------------------------------------------------------------------------
function stripIsbn(input: string): string {
  return input
    .trim()
    .replace(/^(?:ISBN(?:-1[03])?|EAN(?:-13)?|BARCODE)[:\s#-]*/i, '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');
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

function isbn13To10(isbn13: string): string | null {
  if (!isbn13.startsWith('978') || isbn13.length !== 13) return null;
  const body = isbn13.slice(3, 12);
  return `${body}${isbn10Check(body)}`;
}

interface ParsedIdentifier {
  raw: string;
  normalizedId: string | null;
  identifierType: BookIdentifierType;
  isValid: boolean;
  isIsbn: boolean;
  isbn13: string | null;
  isbn10: string | null;
  ean13: string | null;
  prefixGroup: '978' | '979' | '893' | 'gs1_ean13' | null;
  errorReason: string | null;
}

function parseBookIdentifier(raw?: string | null): ParsedIdentifier {
  const input = raw ?? '';
  const clean = stripIsbn(input);
  if (!clean) {
    return {
      raw: input,
      normalizedId: null,
      identifierType: 'invalid',
      isValid: false,
      isIsbn: false,
      isbn13: null,
      isbn10: null,
      ean13: null,
      prefixGroup: null,
      errorReason: 'Identifier is empty.',
    };
  }
  if (/^\d{13}$/.test(clean)) {
    const expected = isbn13Check(clean.slice(0, 12));
    if (expected !== clean[12]) {
      return {
        raw: input,
        normalizedId: null,
        identifierType: 'invalid',
        isValid: false,
        isIsbn: false,
        isbn13: null,
        isbn10: null,
        ean13: null,
        prefixGroup: null,
        errorReason: `Invalid 13-digit check digit (got ${clean[12]}, expected ${expected}).`,
      };
    }
    if (clean.startsWith('978') || clean.startsWith('979')) {
      const pg = clean.startsWith('978') ? '978' : '979';
      return {
        raw: input,
        normalizedId: clean,
        identifierType: 'isbn13',
        isValid: true,
        isIsbn: true,
        isbn13: clean,
        isbn10: pg === '978' ? isbn13To10(clean) : null,
        ean13: clean,
        prefixGroup: pg,
        errorReason: null,
      };
    }
    return {
      raw: input,
      normalizedId: clean,
      identifierType: 'ean13',
      isValid: true,
      isIsbn: false,
      isbn13: null,
      isbn10: null,
      ean13: clean,
      prefixGroup: clean.startsWith('893') ? '893' : 'gs1_ean13',
      errorReason: null,
    };
  }
  if (/^\d{9}[\dX]$/.test(clean)) {
    const expected = isbn10Check(clean.slice(0, 9));
    if (expected !== clean[9]) {
      return {
        raw: input,
        normalizedId: null,
        identifierType: 'invalid',
        isValid: false,
        isIsbn: false,
        isbn13: null,
        isbn10: null,
        ean13: null,
        prefixGroup: null,
        errorReason: `Invalid ISBN-10 check digit (got ${clean[9]}, expected ${expected}).`,
      };
    }
    const first12 = `978${clean.slice(0, 9)}`;
    const isbn13 = `${first12}${isbn13Check(first12)}`;
    return {
      raw: input,
      normalizedId: isbn13,
      identifierType: 'isbn10',
      isValid: true,
      isIsbn: true,
      isbn13,
      isbn10: clean,
      ean13: isbn13,
      prefixGroup: '978',
      errorReason: null,
    };
  }
  return {
    raw: input,
    normalizedId: null,
    identifierType: 'invalid',
    isValid: false,
    isIsbn: false,
    isbn13: null,
    isbn10: null,
    ean13: null,
    prefixGroup: null,
    errorReason: 'Identifier must be a valid 10-digit ISBN-10, 13-digit ISBN-13, or 13-digit EAN-13.',
  };
}

function normalizeIsbnTo13(raw?: string | null): string | null {
  const parsed = parseBookIdentifier(raw);
  return parsed.isValid && parsed.isIsbn ? parsed.isbn13 : null;
}

function extractBookIdentifiersFromText(text: string, includeAllEan13 = false): string[] {
  const matches =
    text.match(
      includeAllEan13
        ? /(?:\d[-\s]?){12}\d|(?:\b\d{9}[\dXx]\b)|(?:(?:\d[-\s]?){9}[\dXx])/g
        : /(?:(?:97[89]|893)[-\s]?(?:\d[-\s]?){9}\d)|(?:\b\d{9}[\dXx]\b)|(?:(?:\d[-\s]?){9}[\dXx])/g
    ) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    const parsed = parseBookIdentifier(m);
    if (parsed.isValid && parsed.normalizedId && !out.includes(parsed.normalizedId)) {
      out.push(parsed.normalizedId);
    }
  }
  return out;
}

function collectValidIdentifiers(
  values: Array<string | null | undefined>,
  fallbackText?: string,
  includeAllEan13InValues = false
): string[] {
  const out: string[] = [];
  const pushId = (id: string | null) => {
    if (id && !out.includes(id)) out.push(id);
  };
  for (const val of values) {
    if (!val) continue;
    const direct = parseBookIdentifier(val);
    if (direct.isValid && direct.normalizedId) {
      if (direct.isIsbn || includeAllEan13InValues || direct.normalizedId.startsWith('893')) {
        pushId(direct.normalizedId);
      }
    }
    for (const id of extractBookIdentifiersFromText(val, includeAllEan13InValues)) {
      pushId(id);
    }
  }
  if (fallbackText) {
    for (const id of extractBookIdentifiersFromText(fallbackText, false)) {
      pushId(id);
    }
  }
  return out;
}

function extractIsbnsFromText(text: string): string[] {
  return extractBookIdentifiersFromText(text, false).filter(
    (id) => id.startsWith('978') || id.startsWith('979')
  );
}

function vnSearchForms(id13: string): string[] {
  const forms = [id13];
  const prefix = id13.startsWith('978604')
    ? '978-604'
    : id13.startsWith('978632')
      ? '978-632'
      : null;
  if (prefix && id13.length === 13) {
    const r = id13.slice(6, 12);
    const c = id13[12];
    forms.push(
      `${prefix}-${r[0]}-${r.slice(1)}-${c}`,
      `${prefix}-${r.slice(0, 2)}-${r.slice(2)}-${c}`,
      `${prefix}-${r.slice(0, 3)}-${r.slice(3)}-${c}`,
      `${prefix}-${r.slice(0, 4)}-${r.slice(4)}-${c}`
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

function normLang(raw?: string | null, id13?: string | null): string {
  if (raw) {
    const c = raw.replace(/^\/languages\//i, '').trim().toLowerCase();
    if (ISO_LANG[c]) return ISO_LANG[c];
    if (/^[a-z]{2}(-[a-z0-9]{2,8})?$/i.test(c)) return c;
  }
  if (id13?.startsWith('978604') || id13?.startsWith('978632') || id13?.startsWith('893')) return 'vi';
  if (id13?.startsWith('9784')) return 'ja';
  if (id13?.startsWith('97889')) return 'ko';
  if (id13?.startsWith('9787')) return 'zh';
  if (id13?.startsWith('978957') || id13?.startsWith('978986')) return 'zh-Hant';
  if (id13?.startsWith('9782')) return 'fr';
  if (id13?.startsWith('9783')) return 'de';
  return 'und';
}

function getAffinity(id13: string): string {
  if (id13.startsWith('978604') || id13.startsWith('978632') || id13.startsWith('893')) return 'vi';
  if (id13.startsWith('9784')) return 'jp';
  if (id13.startsWith('97889')) return 'kr';
  if (id13.startsWith('9787')) return 'cn';
  if (id13.startsWith('978957') || id13.startsWith('978986')) return 'tw';
  if (id13.startsWith('9782')) return 'fr';
  if (id13.startsWith('9783')) return 'de';
  if (id13.startsWith('9780') || id13.startsWith('9781')) return 'en';
  return 'global';
}

class EdgeProviderError extends Error {
  readonly status: ProviderStatusCode;
  constructor(status: ProviderStatusCode, message: string) {
    super(message);
    this.status = status;
  }
}

function isHtmlChallengeBody(body: string): boolean {
  const sample = body.slice(0, 3000);
  return (
    /cf-browser-verification|just a moment\.\.\.|challenge-platform|_cf_chl|enable javascript and cookies|access denied|attention required!\s*\|\s*cloudflare|captcha-delivery|hcaptcha/i.test(
      sample
    )
  );
}

function assertCleanResponse(res: Response, label: string): void {
  if (res.status === 401 || res.status === 403) {
    throw new EdgeProviderError('access_denied', `${label} HTTP ${res.status}`);
  }
  if (res.status === 429) {
    throw new EdgeProviderError('upstream_error', `${label} rate limited (HTTP 429)`);
  }
  if (res.status >= 500) {
    throw new EdgeProviderError('upstream_error', `${label} HTTP ${res.status}`);
  }
}

function assertCleanTextBody(body: string, label: string): void {
  if (isHtmlChallengeBody(body)) {
    throw new EdgeProviderError('access_denied', `${label} returned an anti-bot or Cloudflare challenge`);
  }
}

async function safeReadJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (isHtmlChallengeBody(text)) {
    throw new EdgeProviderError('access_denied', `${label} returned an HTML challenge instead of JSON`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new EdgeProviderError('upstream_error', `${label} returned malformed JSON`);
  }
}

async function safeReadXml(res: Response, label: string): Promise<string> {
  const text = await res.text();
  if (isHtmlChallengeBody(text)) {
    throw new EdgeProviderError('access_denied', `${label} returned an HTML challenge instead of XML`);
  }
  if (/^\s*<!DOCTYPE\s+html\b/i.test(text) && !/<(?:recordData|feed|rss|searchRetrieveResponse)\b/i.test(text)) {
    throw new EdgeProviderError('upstream_error', `${label} returned HTML instead of bibliographic XML`);
  }
  return text;
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

function stripSiteChromeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, ' ');
}

function foldVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function extractVnSpecs(html: string) {
  const INLINE_LABEL_SPLIT =
    /(?=\b(?:Nhà phát hành|Công ty phát hành|Đơn vị phát hành|Nhà xuất bản|NXB liên kết|Nhà cung cấp|Tác giả\/\s*Dịch giả|Tác giả|Dịch giả|Biên dịch|Người dịch|Minh họa|Họa sĩ|Hình thức bìa|Quy cách in|Định dạng|Số trang|Kích thước|Trọng lượng|Mã sản phẩm|Mã vạch|Barcode|EAN(?:-13)?|SKU|ISBN|Năm xuất bản|Ngày phát hành|Phát hành|Ngôn ngữ|Thể loại)\s*:)/gi;
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
  const identifiers = extractBookIdentifiersFromText(lines.join('\n'), false);
  let publishingPartner: string | undefined;
  let distributor: string | undefined;
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
    else if (k === 'dịch giả' || k === 'người dịch' || k === 'biên dịch') addUnique(translators, splitNames);
    else if (k === 'minh họa' || k === 'họa sĩ') addUnique(illustrators, splitNames);
    else if (k === 'nxb liên kết') {
      publishingPartner = publishingPartner || v;
      addUnique(publishers, [v]);
    } else if (k === 'nhà xuất bản' || k === 'nxb') {
      addUnique(publishers, [v]);
    } else if (
      k === 'nhà phát hành' ||
      k === 'công ty phát hành' ||
      k === 'đơn vị phát hành' ||
      k === 'phát hành'
    ) {
      const yr = v.match(/\b((?:19|20)\d{2})\b/);
      if (yr && /^\d/.test(v)) publishedYear = publishedYear ?? Number(yr[1]);
      else distributor = distributor || v;
    } else if (k === 'thương hiệu') {
      addUnique(publishers, [v]);
    } else if (k === 'số trang') {
      const m = v.match(/\d{1,5}/);
      if (m && !pageCount) pageCount = Number(m[0]);
    } else if (k === 'ngày phát hành' || k === 'năm xuất bản') {
      const yr = v.match(/\b((?:19|20)\d{2})\b/);
      if (yr && !publishedYear) publishedYear = Number(yr[1]);
    } else if (k === 'ngôn ngữ') {
      if (v.toLocaleLowerCase('vi').includes('tiếng việt')) language = 'vi';
    } else if (k === 'thể loại') addUnique(genres, splitNames);
    else if (k === 'hình thức bìa' || k === 'quy cách in' || k === 'định dạng') {
      if (v.toLocaleLowerCase('vi').includes('bìa cứng')) format = 'hardcover';
      else if (v.toLocaleLowerCase('vi').includes('bìa')) format = 'paperback';
    } else if (/^(?:isbn|mã sản phẩm|mã vạch|barcode|ean(?:-13)?|sku)$/i.test(k)) {
      for (const code of extractBookIdentifiersFromText(v, true)) {
        if (!identifiers.includes(code)) identifiers.push(code);
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
  const isbns = identifiers.filter((id) => id.startsWith('978') || id.startsWith('979'));
  return {
    authors,
    translators,
    illustrators,
    publishers,
    publishingPartner,
    distributor,
    pageCount,
    publishedYear,
    language,
    format,
    genres,
    isbns,
    identifiers,
  };
}

function parseMarc21(html: string) {
  const lines = htmlLines(html).map((l) => l.replace(/\t+/g, ' '));
  const authors: string[] = [];
  const translators: string[] = [];
  const illustrators: string[] = [];
  const publishers: string[] = [];
  const subjects: string[] = [];
  const identifiers: string[] = [];
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
        for (const c of extractBookIdentifiersFromText(a, true)) {
          if (!identifiers.includes(c)) identifiers.push(c);
        }
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
  const isbns = identifiers.filter((id) => id.startsWith('978') || id.startsWith('979'));
  return title ? { title, subtitle, authors, translators, illustrators, publishers, publishedYear, pageCount, language, subjects, description, isbns, identifiers, coverPath } : null;
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
  if (c.publishingPartner) out.publishingPartner = { provider: c.provider, trust };
  if (c.distributor) out.distributor = { provider: c.provider, trust };
  if (c.pageCount) out.pageCount = { provider: c.provider, trust };
  if (c.publishedYear) out.publishedYear = { provider: c.provider, trust };
  if (c.coverUrl) out.coverUrl = { provider: c.provider, trust };
  if (c.language && c.language !== 'und') out.language = { provider: c.provider, trust };
  if (c.isbn13) out.isbn13 = { provider: c.provider, trust };
  if (c.ean13) out.ean13 = { provider: c.provider, trust };
  return out;
}

function isSufficientlyVerifiedEdge(exacts: Candidate[]): boolean {
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

function isSufficientEdge(exacts: Candidate[]): boolean {
  return isSufficientlyVerifiedEdge(exacts);
}

function collectCandidateIdsEdge(c: Candidate): string[] {
  return collectValidIdentifiers([
    c.isbn13,
    c.ean13,
    c.isbn10,
    ...(c.matchedIsbns ?? []),
    ...(c.matchedIdentifiers ?? []),
  ], undefined, true);
}

function computeQueryRelevanceEdge(c: Candidate, searchQuery = ''): number {
  const rawQ = searchQuery.trim();
  if (!rawQ) return 0;
  const fold = (s: string) =>
    foldVietnameseDiacritics(s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const qFolded = fold(rawQ);
  if (!qFolded) return 0;
  const qTokens = qFolded.split(/\s+/).filter((t) => t.length >= 2);
  const titleFolded = fold(`${c.title ?? ''} ${c.originalTitle ?? ''} ${c.subtitle ?? ''}`);
  const fullFolded = fold(`${titleFolded} ${(c.authors ?? []).join(' ')}`);
  if (!fullFolded) return 0;
  let score = 0;
  if (titleFolded === qFolded) score += 100;
  else if (titleFolded.includes(qFolded)) score += 60;
  else if (fullFolded.includes(qFolded)) score += 45;
  const checkTokens = qTokens.length > 0 ? qTokens : [qFolded];
  let matched = 0;
  for (const tok of checkTokens) if (fullFolded.includes(tok)) matched++;
  if (matched === 0) return 0;
  score += Math.round((matched / checkTokens.length) * 40);
  if (matched === checkTokens.length) score += 20;
  return score;
}

function mergeCandidatesEdge(rawList: Candidate[], targetId: string, searchQuery = '') {
  const sorted = [...rawList].sort((a, b) => (EDGE_PRIORITY[b.provider] ?? 50) - (EDGE_PRIORITY[a.provider] ?? 50));
  const byId = new Map<string, Candidate>();
  const possibleOrWork: Candidate[] = [];
  const identityMismatches: Candidate[] = [];

  for (const c of sorted) {
    const ids = collectCandidateIdsEdge(c);
    if (targetId && ids.length > 0 && !ids.includes(targetId)) {
      identityMismatches.push({
        ...c,
        matchConfidence: 'unverified_isbn',
        editionMatchLevel: 'related_edition',
        mismatchReason: `Returned record carries identifier ${ids[0]} instead of ${targetId}`,
        fieldProvenance: buildProv({ ...c, matchConfidence: 'unverified_isbn' }),
      });
      continue;
    }

    const primaryId = c.isbn13 || c.ean13 || ids[0] || '';
    const isExact = Boolean(targetId && ids.includes(targetId) && c.matchConfidence !== 'unverified_isbn' && c.matchConfidence !== 'approximate_match' && c.matchConfidence !== 'title_match');
    if (targetId && isExact && primaryId) {
      const prev = byId.get(primaryId);
      if (!prev) {
        byId.set(primaryId, {
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
        if (prev.distributor && c.distributor && normKey(prev.distributor) !== normKey(c.distributor)) {
          conflicts.push({
            field: 'distributor',
            values: [
              { provider: prev.provider, value: prev.distributor },
              { provider: c.provider, value: c.distributor },
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
        prev.distributor = prev.distributor || c.distributor;
        prev.pageCount = prev.pageCount ?? c.pageCount ?? null;
        prev.publishedYear = prev.publishedYear ?? c.publishedYear ?? null;
        if (prev.language === 'und' && c.language && c.language !== 'und') prev.language = c.language;
        prev.coverUrl = prev.coverUrl || c.coverUrl;
        prev.description = prev.description || c.description;
        prev.isbn13 = prev.isbn13 || c.isbn13 || null;
        prev.isbn10 = prev.isbn10 || c.isbn10 || null;
        prev.ean13 = prev.ean13 || c.ean13 || prev.isbn13 || null;
        prev.identifierType = prev.identifierType || c.identifierType;
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
        editionMatchLevel: targetId ? 'possible_edition' : 'work_match',
        fieldProvenance: buildProv(c),
      });
    }
  }

  const exactMatches: Candidate[] = [];
  const possibleEditionMatches: Candidate[] = [];
  for (const c of byId.values()) {
    if (c.contradictions && c.contradictions.length > 0) possibleEditionMatches.push(c);
    else exactMatches.push(c);
  }
  let workMatches = targetId ? [] : possibleOrWork;
  if (!targetId && searchQuery.trim() && workMatches.length > 0) {
    const scored = workMatches.map((item) => ({
      item,
      rel: computeQueryRelevanceEdge(item, searchQuery),
    }));
    const hasPos = scored.some((s) => s.rel > 0);
    const filtered = hasPos ? scored.filter((s) => s.rel > 0) : scored;
    filtered.sort(
      (a, b) =>
        b.rel * 1000 + (EDGE_PRIORITY[b.item.provider] ?? 50) - (a.rel * 1000 + (EDGE_PRIORITY[a.item.provider] ?? 50))
    );
    workMatches = filtered.map((s) => s.item);
  }
  if (targetId) possibleEditionMatches.push(...possibleOrWork);
  const approximateMatches = [...possibleEditionMatches, ...workMatches];
  const merged = targetId && exactMatches.length > 0 ? exactMatches : [...exactMatches, ...approximateMatches];

  return { merged, exactMatches, possibleEditionMatches, workMatches, approximateMatches, identityMismatches };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const retrievedAt = new Date().toISOString();
    const { isbn, query, forceAllProviders } = (await req.json()) as {
      isbn?: string;
      query?: string;
      forceAllProviders?: boolean;
    };
    const rawIdentifier = (isbn ?? '').trim();
    const parsedInput = rawIdentifier ? parseBookIdentifier(rawIdentifier) : null;
    const cleanId = parsedInput?.isValid && parsedInput.normalizedId ? parsedInput.normalizedId : '';
    const cleanIsbnOnly = parsedInput?.isValid && parsedInput.isIsbn && parsedInput.isbn13 ? parsedInput.isbn13 : '';
    const q = (query ?? '').trim();

    if (rawIdentifier && (!parsedInput || !parsedInput.isValid || !cleanId)) {
      return new Response(
        JSON.stringify({
          candidates: [],
          exactMatches: [],
          possibleEditionMatches: [],
          relatedEditions: [],
          workMatches: [],
          approximateMatches: [],
          identityMismatches: [],
          providerStatuses: [],
          queriedIsbn: null,
          rawIdentifier,
          normalizedIdentifier: null,
          identifierType: 'invalid',
          verificationStatus: 'invalid_identifier',
          verificationMessage: parsedInput?.errorReason ?? 'Invalid ISBN-10, ISBN-13, or EAN-13 identifier.',
          retrievedAt,
          exactMatchCount: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!cleanId && !q) {
      return new Response(
        JSON.stringify({
          candidates: [],
          providerStatuses: [],
          queriedIsbn: null,
          exactMatchCount: 0,
          verificationStatus: 'not_found',
          verificationMessage: 'No identifier or search query provided.',
          retrievedAt,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candidates: Candidate[] = [];
    const statuses: ProviderStatusReport[] = [];

    interface ProviderTask {
      provider: string;
      label: string;
      tier: ProviderTier;
      region: string;
      run: () => Promise<Candidate[]>;
    }

    const executeTask = async (task: ProviderTask) => {
      try {
        const res = (await task.run()).map((item) => ({
          ...item,
          retrievedAt: item.retrievedAt ?? retrievedAt,
        }));
        const accepted: Candidate[] = [];
        let rejectedMismatch = false;
        for (const item of res) {
          const ids = collectCandidateIdsEdge(item);
          if (cleanId && ids.length > 0 && !ids.includes(cleanId)) {
            candidates.push({
              ...item,
              matchConfidence: 'unverified_isbn',
              mismatchReason: `Returned record carries ${ids[0]} instead of ${cleanId}`,
            });
            rejectedMismatch = true;
            continue;
          }
          accepted.push(item);
        }
        candidates.push(...accepted);
        const exactCount = accepted.filter((c) => c.matchConfidence === 'exact_isbn').length;
        statuses.push({
          provider: task.provider,
          label: task.label,
          tier: task.tier,
          region: task.region,
          status: exactCount > 0 ? 'exact_match' : accepted.length > 0 ? 'approximate_match' : 'no_match',
          candidateCount: accepted.length,
          exactMatchCount: exactCount,
          message:
            accepted.length === 0 && rejectedMismatch
              ? 'Returned record(s) with non-matching identifier rejected'
              : undefined,
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
            : lower.includes('api key') || lower.includes('quota') || (lower.includes('429') && task.provider === 'google_books')
              ? 'api_key_required'
              : lower.includes('429') || lower.includes('rate limit')
                ? 'upstream_error'
                : /401|403|cloudflare|denied|captcha/i.test(msg)
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
        const searchTerms = cleanId ? vnSearchForms(cleanId).slice(0, 4) : [q];
        const settled = await Promise.allSettled(
          searchTerms.map(async (term) => {
            const r = await fTimeout(`${baseUrl}/search?q=${encodeURIComponent(term)}&view=json`);
            assertCleanResponse(r, label);
            if (!r.ok) return [] as string[];
            const j = await safeReadJson<Record<string, unknown>>(r, label);
            const list = Array.isArray(j.results) ? j.results : Object.values(j);
            return (list as Array<{ url?: string }>)
              .map((item) => item?.url)
              .filter((u): u is string => Boolean(u) && !String(u).includes('${'));
          })
        );
        const fulfilled = settled.filter((s): s is PromiseFulfilledResult<string[]> => s.status === 'fulfilled');
        if (fulfilled.length === 0) {
          const rej = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
          if (rej) throw rej.reason;
        }
        const urls = Array.from(new Set(fulfilled.flatMap((s) => s.value)));
        const out: Candidate[] = [];
        for (const u of urls.slice(0, 4)) {
          const full = u.startsWith('http') ? u : `${baseUrl}${u}`;
          const [jRes, hRes] = await Promise.all([
            fTimeout(`${full.split('?')[0]}.json`).catch(() => null),
            fTimeout(full.split('?')[0]).catch(() => null),
          ]);
          const jData = jRes?.ok ? await safeReadJson<{ product?: Record<string, unknown> }>(jRes, label).catch(() => null) : null;
          const prod = (jData?.product ?? jData) as Record<string, unknown> | null;
          const html = hRes?.ok ? await hRes.text() : '';
          if (html) assertCleanTextBody(html, label);
          const specs = extractVnSpecs(html);
          const contentSpecs = typeof prod?.content === 'string' ? extractVnSpecs(prod.content) : null;
          const variants = Array.isArray(prod?.variants) ? (prod.variants as Array<{ sku?: string; barcode?: string }>) : [];
          const variantIds = variants.flatMap((v) => [v.sku ?? '', v.barcode ?? '']);
          const allIds = collectValidIdentifiers(
            [...variantIds, ...specs.identifiers, ...(contentSpecs?.identifiers ?? [])],
            undefined,
            true
          );
          if (cleanId && !allIds.includes(cleanId)) continue;
          const title = (typeof prod?.name === 'string' ? prod.name : '') || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
          if (!title) continue;
          let distributor = specs.distributor || contentSpecs?.distributor;
          const explicitPubs: string[] = [];
          addUnique(explicitPubs, specs.publishers);
          addUnique(explicitPubs, contentSpecs?.publishers ?? []);
          const rawTags = Array.isArray(prod?.tags) ? prod.tags.map(String) : typeof prod?.tags === 'string' ? prod.tags.split(',') : [];
          for (const rawTag of rawTags) {
            const t = rawTag.trim();
            if (/^nxb_/i.test(t)) addUnique(explicitPubs, [t.slice(4)]);
            else if (/^nph_/i.test(t) && !distributor) distributor = t.slice(4);
          }
          const pubs: string[] = [...explicitPubs];
          const vendor = typeof prod?.vendor === 'string' ? prod.vendor.trim() : '';
          if (vendor && (!distributor || normKey(vendor) !== normKey(distributor) || pubs.length === 0)) {
            addUnique(pubs, [vendor]);
          }
          const targetId = cleanId || allIds[0] || '';
          const parsedTarget = targetId ? parseBookIdentifier(targetId) : null;
          const featured = prod?.featured_image as { src?: string } | string | undefined;
          const featUrl = typeof featured === 'string' ? featured : featured?.src;
          out.push({
            externalId: String(prod?.id || full),
            provider,
            tier: 'tier3_publisher',
            verified: false,
            matchConfidence: cleanId ? 'exact_isbn' : 'title_match',
            matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
            matchedIdentifiers: allIds,
            title,
            authors: specs.authors.length ? specs.authors : contentSpecs?.authors ?? [],
            translators: specs.translators.length ? specs.translators : contentSpecs?.translators ?? [],
            illustrators: specs.illustrators.length ? specs.illustrators : contentSpecs?.illustrators ?? [],
            publishers: pubs,
            publishingPartner: specs.publishingPartner || contentSpecs?.publishingPartner,
            distributor,
            publishedYear: specs.publishedYear ?? contentSpecs?.publishedYear ?? null,
            language: specs.language || normLang(undefined, targetId) || 'vi',
            format: specs.format,
            pageCount: specs.pageCount ?? contentSpecs?.pageCount ?? null,
            genres: specs.genres,
            isbn13: parsedTarget?.isIsbn ? parsedTarget.isbn13 : null,
            isbn10: parsedTarget?.prefixGroup === '978' ? parsedTarget.isbn10 : null,
            ean13: parsedTarget?.ean13 ?? (targetId || null),
            identifierType: parsedTarget?.identifierType,
            coverUrl: normalizeUrl(featUrl || html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]),
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
        const terms = cleanId ? vnSearchForms(cleanId).slice(0, 4) : [q];
        const settled = await Promise.allSettled(
          terms.map(async (t) => {
            const r = await fTimeout(`${baseUrl}/search?type=product&q=${encodeURIComponent(t)}`);
            assertCleanResponse(r, label);
            if (!r.ok) return '';
            const txt = await r.text();
            assertCleanTextBody(txt, label);
            return txt;
          })
        );
        const fulfilled = settled.filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled');
        if (fulfilled.length === 0) {
          const rej = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
          if (rej) throw rej.reason;
        }
        const rawSlugs = Array.from(
          new Set(
            fulfilled
              .map((s) => stripSiteChromeHtml(s.value))
              .flatMap((h) =>
                [...h.matchAll(/href=["'](?:https?:\/\/[^"'\s]+)?(\/products\/[^"'?#]+)["']/gi)].map(
                  (m) => m[1]
                )
              )
          )
        );
        const termTokens = foldVietnameseDiacritics(terms.join(' '))
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 2);
        const slugs = (termTokens.length > 0
          ? rawSlugs.sort((a, b) => {
              const sA = termTokens.reduce((n, t) => n + (a.toLowerCase().includes(t) ? 1 : 0), 0);
              const sB = termTokens.reduce((n, t) => n + (b.toLowerCase().includes(t) ? 1 : 0), 0);
              return sB - sA;
            })
          : rawSlugs
        ).slice(0, 5);
        const out: Candidate[] = [];
        for (const slug of slugs) {
          const r = await fTimeout(`${baseUrl}${slug}.json`).catch(() => null);
          if (!r?.ok) continue;
          const data = await safeReadJson<{ product?: Record<string, unknown> }>(r, label).catch(() => null);
          const prod = data?.product as Record<string, unknown> | undefined;
          if (typeof prod?.title !== 'string' || !prod.title) continue;
          const specs = extractVnSpecs(typeof prod.body_html === 'string' ? prod.body_html : '');
          const variants = Array.isArray(prod.variants) ? (prod.variants as Array<{ sku?: string; barcode?: string }>) : [];
          const variantIds = variants.flatMap((v) => [v.sku ?? '', v.barcode ?? '']);
          const allIds = collectValidIdentifiers([...variantIds, ...specs.identifiers], undefined, true);
          if (cleanId && !allIds.includes(cleanId)) continue;
          const tags: string[] = Array.isArray(prod.tags) ? prod.tags.map(String) : String(prod.tags ?? '').split(',');
          const authors = [...specs.authors];
          const translators = [...specs.translators];
          const illustrators = [...specs.illustrators];
          for (const tag of tags) {
            const t = tag.trim();
            if (/^tacgia_/i.test(t)) addUnique(authors, [t.slice(7)]);
            else if (/^dichgia_/i.test(t)) addUnique(translators, [t.slice(8)]);
            else if (/^hoasi_/i.test(t)) addUnique(illustrators, [t.slice(6)]);
          }
          const pubs: string[] = [...specs.publishers];
          const vendor = typeof prod.vendor === 'string' ? prod.vendor.trim() : '';
          if (vendor && (!specs.distributor || normKey(vendor) !== normKey(specs.distributor) || pubs.length === 0)) {
            addUnique(pubs, [vendor]);
          }
          const targetId = cleanId || allIds[0] || '';
          const parsedTarget = targetId ? parseBookIdentifier(targetId) : null;
          const img = prod.image as { src?: string } | undefined;
          const imgs = prod.images as Array<{ src?: string }> | undefined;
          out.push({
            externalId: String(prod.id || slug),
            provider,
            tier: 'tier3_publisher',
            verified: false,
            matchConfidence: cleanId ? 'exact_isbn' : 'title_match',
            matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
            matchedIdentifiers: allIds,
            title: prod.title,
            authors,
            translators,
            illustrators,
            publishers: pubs,
            publishingPartner: specs.publishingPartner,
            distributor: specs.distributor,
            publishedYear: specs.publishedYear,
            language: specs.language || normLang(undefined, targetId) || 'vi',
            format: specs.format,
            pageCount: specs.pageCount,
            genres: specs.genres,
            isbn13: parsedTarget?.isIsbn ? parsedTarget.isbn13 : null,
            isbn10: parsedTarget?.prefixGroup === '978' ? parsedTarget.isbn10 : null,
            ean13: parsedTarget?.ean13 ?? (targetId || null),
            identifierType: parsedTarget?.identifierType,
            coverUrl: normalizeUrl(img?.src || imgs?.[0]?.src),
            sourceUrl: `${baseUrl}${slug}`,
            rawPayload: data ?? {},
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
          if (!cleanId) {
            const r = await fTimeout(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`);
            assertCleanResponse(r, 'Open Library');
            if (!r.ok) return [];
            const d = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(r, 'Open Library');
            return (d.docs ?? []).map((doc) => {
              const isbns = extractIsbnsFromText(((doc.isbn as string[]) ?? []).join(' '));
              const best = isbns[0] || null;
              return {
                externalId: String(doc.key ?? doc.title),
                provider: 'open_library',
                tier: 'tier1_international',
                verified: false,
                matchConfidence: 'title_match' as const,
                matchedIsbns: isbns,
                matchedIdentifiers: isbns,
                title: String(doc.title ?? 'Untitled'),
                authors: (doc.author_name as string[]) ?? [],
                translators: [],
                publishers: ((doc.publisher as string[]) ?? []).slice(0, 2),
                publishedYear: (doc.first_publish_year as number) ?? null,
                language: normLang((doc.language as string[])?.[0], best),
                pageCount: (doc.number_of_pages_median as number) ?? null,
                genres: ((doc.subject as string[]) ?? []).slice(0, 5),
                isbn13: best,
                isbn10: best?.startsWith('978') ? isbn13To10(best) : null,
                ean13: best,
                coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
                rawPayload: doc,
              };
            });
          }
          if (!cleanIsbnOnly) return [];

          const [booksRes, edRes, searchRes] = await Promise.all([
            fTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbnOnly}&format=json&jscmd=data`).catch(() => null),
            fTimeout(`https://openlibrary.org/isbn/${cleanIsbnOnly}.json`).catch(() => null),
            fTimeout(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(cleanIsbnOnly)}&limit=3`).catch(() => null),
          ]);
          const booksData = booksRes?.ok ? await safeReadJson<Record<string, Record<string, unknown>>>(booksRes, 'Open Library').catch(() => null) : null;
          const entry = booksData?.[`ISBN:${cleanIsbnOnly}`] as Record<string, unknown> | undefined;
          const edJson = edRes?.ok ? await safeReadJson<Record<string, unknown>>(edRes, 'Open Library').catch(() => null) : null;

          const edLang = Array.isArray(edJson?.languages) && (edJson.languages[0] as { key?: string } | undefined)?.key
            ? normLang(String((edJson.languages[0] as { key?: string }).key), cleanIsbnOnly)
            : normLang(undefined, cleanIsbnOnly);
          const edOrig = Array.isArray(edJson?.work_titles) && edJson.work_titles[0] ? String(edJson.work_titles[0]) : undefined;
          const translators: string[] = [];
          if (typeof edJson?.by_statement === 'string') {
            const tm = edJson.by_statement.match(/translat(?:ed|ion)\s+(?:from[^;]+?\s+)?by\s+([^;.]+)/i);
            if (tm?.[1]) translators.push(tm[1].trim());
          }
          if (entry || edJson?.title) {
            const entryIdentifiers = entry?.identifiers as { isbn_13?: string[]; isbn_10?: string[] } | undefined;
            const explicitIsbns = collectValidIdentifiers([
              ...(entryIdentifiers?.isbn_13 ?? []),
              ...(entryIdentifiers?.isbn_10 ?? []),
              ...(Array.isArray(edJson?.isbn_13) ? edJson.isbn_13.map(String) : []),
              ...(Array.isArray(edJson?.isbn_10) ? edJson.isbn_10.map(String) : []),
            ]);
            const conflicting = explicitIsbns.length > 0 && !explicitIsbns.includes(cleanIsbnOnly);
            const resolved = conflicting ? explicitIsbns[0] : cleanIsbnOnly;
            const title = String(entry?.title || edJson?.title || 'Untitled');
            const pubs = Array.isArray(entry?.publishers)
              ? (entry.publishers as Array<{ name: string }>).map((p) => p.name)
              : Array.isArray(edJson?.publishers)
                ? edJson.publishers.map(String)
                : [];
            const pubDate = (typeof entry?.publish_date === 'string' ? entry.publish_date : undefined) || (typeof edJson?.publish_date === 'string' ? edJson.publish_date : undefined);
            const edCoverId = Array.isArray(edJson?.covers) ? edJson.covers.find((x: unknown) => typeof x === 'number' && x > 0) : null;
            const cover = entry?.cover as { large?: string; medium?: string } | undefined;
            return [{
              externalId: String(entry?.key || edJson?.key || `ol-${cleanIsbnOnly}`),
              provider: 'open_library',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: conflicting ? 'unverified_isbn' : 'exact_isbn',
              matchedIsbns: explicitIsbns.length > 0 ? explicitIsbns : [cleanIsbnOnly],
              matchedIdentifiers: explicitIsbns.length > 0 ? explicitIsbns : [cleanIsbnOnly],
              title,
              originalTitle: edOrig,
              editionName: typeof edJson?.edition_name === 'string' ? edJson.edition_name : undefined,
              authors: Array.isArray(entry?.authors) ? (entry.authors as Array<{ name: string }>).map((a) => a.name) : [],
              translators,
              publishers: pubs,
              publishedYear: pubDate ? Number(String(pubDate).match(/\d{4}/)?.[0]) || null : null,
              language: edLang === 'und' ? 'en' : edLang,
              pageCount: (typeof entry?.number_of_pages === 'number' ? entry.number_of_pages : undefined) ?? (typeof edJson?.number_of_pages === 'number' ? edJson.number_of_pages : null),
              genres: Array.isArray(entry?.subjects) ? (entry.subjects as Array<{ name: string }>).slice(0, 6).map((s) => s.name) : [],
              isbn13: resolved,
              isbn10: resolved.startsWith('978') ? isbn13To10(resolved) : null,
              ean13: resolved,
              identifierType: 'isbn13',
              coverUrl: normalizeUrl(cover?.large ?? cover?.medium ?? (edCoverId ? `https://covers.openlibrary.org/b/id/${edCoverId}-L.jpg` : undefined)),
              rawPayload: { entry, edJson },
            }];
          }
          if (searchRes?.ok) {
            const sData = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(searchRes, 'Open Library').catch(() => null);
            return (sData?.docs ?? []).map((doc) => {
              const isbns = collectValidIdentifiers(Array.isArray(doc.isbn) ? doc.isbn.map(String) : []);
              const exact = isbns.includes(cleanIsbnOnly);
              const resolved = exact ? cleanIsbnOnly : (isbns[0] || null);
              return {
                externalId: String(doc.key ?? `ol-${cleanIsbnOnly}`),
                provider: 'open_library',
                tier: 'tier1_international',
                verified: false,
                matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
                matchedIsbns: isbns,
                matchedIdentifiers: isbns,
                title: String(doc.title ?? 'Untitled'),
                authors: Array.isArray(doc.author_name) ? doc.author_name.map(String) : [],
                translators: [],
                publishers: Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : [],
                publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
                language: normLang(Array.isArray(doc.language) ? String(doc.language[0]) : undefined, resolved),
                pageCount: typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
                genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 6).map(String) : [],
                isbn13: resolved,
                isbn10: resolved?.startsWith('978') ? isbn13To10(resolved) : null,
                ean13: resolved,
                coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
                rawPayload: doc,
              };
            });
          }
          return [];
        },
      },
      {
        provider: 'google_books',
        label: 'Google Books',
        tier: 'tier1_international',
        region: 'global',
        run: async () => {
          if (cleanId && !cleanIsbnOnly) return [];
          const googleKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');
          const gbUrl = new URL('https://www.googleapis.com/books/v1/volumes');
          gbUrl.searchParams.set('q', cleanIsbnOnly ? `isbn:${cleanIsbnOnly}` : q);
          gbUrl.searchParams.set('maxResults', '8');
          if (googleKey) gbUrl.searchParams.set('key', googleKey);
          const res = await fTimeout(gbUrl.toString());
          if (res.status === 429 || res.status === 403 || res.status === 401) {
            throw new EdgeProviderError('api_key_required', `HTTP ${res.status}: configure GOOGLE_BOOKS_API_KEY`);
          }
          if (!res.ok) throw new EdgeProviderError('upstream_error', `Google Books HTTP ${res.status}`);
          const data = await safeReadJson<{ items?: Array<Record<string, unknown>> }>(res, 'Google Books');
          const out: Candidate[] = [];
          for (const item of data.items ?? []) {
            const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
            const ids = (info.industryIdentifiers as Array<{ type: string; identifier: string }> | undefined) ?? [];
            const allIsbns = collectValidIdentifiers(ids.map((x) => x.identifier));
            const exact = Boolean(cleanIsbnOnly && allIsbns.includes(cleanIsbnOnly));
            const targetIsbn = exact ? cleanIsbnOnly : (allIsbns[0] || null);
            const imgLinks = info.imageLinks as { thumbnail?: string } | undefined;
            const pubDate = typeof info.publishedDate === 'string' ? info.publishedDate : undefined;
            out.push({
              externalId: String(item.id),
              provider: 'google_books',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: allIsbns,
              matchedIdentifiers: allIsbns,
              title: String(info.title ?? 'Untitled'),
              subtitle: typeof info.subtitle === 'string' ? info.subtitle : undefined,
              authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
              translators: [],
              publishers: typeof info.publisher === 'string' ? [info.publisher] : [],
              publishedDate: pubDate,
              publishedYear: pubDate ? Number(pubDate.slice(0, 4)) || null : null,
              language: normLang(typeof info.language === 'string' ? info.language : undefined, targetIsbn),
              pageCount: typeof info.pageCount === 'number' ? info.pageCount : null,
              genres: Array.isArray(info.categories) ? info.categories.map(String) : [],
              description: typeof info.description === 'string' ? info.description : undefined,
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              ean13: targetIsbn,
              coverUrl: normalizeUrl(imgLinks?.thumbnail),
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
          if (cleanId && !cleanIsbnOnly) return [];
          const url = cleanIsbnOnly
            ? `https://api.crossref.org/works?filter=isbn:${encodeURIComponent(cleanIsbnOnly)}&rows=4`
            : `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&filter=type:monograph,type:book,type:edited-book&rows=6`;
          const res = await fTimeout(url);
          assertCleanResponse(res, 'CrossRef Works');
          if (!res.ok) return [];
          const data = await safeReadJson<{ message?: { items?: Array<Record<string, unknown>> } }>(res, 'CrossRef Works');
          const out: Candidate[] = [];
          for (const item of data.message?.items ?? []) {
            const title = Array.isArray(item.title) ? String(item.title[0] ?? '').trim() : '';
            if (!title) continue;
            const isbns = collectValidIdentifiers(Array.isArray(item.ISBN) ? item.ISBN.map(String) : []);
            const exact = Boolean(cleanIsbnOnly && isbns.includes(cleanIsbnOnly));
            const fmtP = (p: { given?: string; family?: string; name?: string }) => p.name?.trim() || [p.given, p.family].filter(Boolean).join(' ').trim();
            const targetIsbn = exact ? cleanIsbnOnly : (isbns[0] || null);
            out.push({
              externalId: String(item.DOI ?? title),
              provider: 'crossref',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: isbns,
              matchedIdentifiers: isbns,
              title,
              authors: Array.isArray(item.author) ? item.author.map(fmtP).filter(Boolean) : [],
              translators: [],
              editors: Array.isArray(item.editor) ? item.editor.map(fmtP).filter(Boolean) : [],
              publishers: typeof item.publisher === 'string' ? [item.publisher] : [],
              publishedYear: (item.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]?.[0] ?? null,
              language: normLang(typeof item.language === 'string' ? item.language : undefined, targetIsbn),
              genres: Array.isArray(item.subject) ? item.subject.slice(0, 6).map(String) : [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              ean13: targetIsbn,
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
          if (cleanId && !cleanIsbnOnly) return [];
          const key = Deno.env.get('ISBNDB_API_KEY');
          if (!key) throw new EdgeProviderError('api_key_required', 'Configure ISBNDB_API_KEY in Edge Function secrets');
          const url = cleanIsbnOnly
            ? `https://api2.isbndb.com/book/${encodeURIComponent(cleanIsbnOnly)}`
            : `https://api2.isbndb.com/books/${encodeURIComponent(q)}?pageSize=6`;
          const res = await fTimeout(url, { headers: { Authorization: key } });
          if (res.status === 404) return [];
          assertCleanResponse(res, 'ISBNdb API');
          if (!res.ok) throw new EdgeProviderError('upstream_error', `ISBNdb HTTP ${res.status}`);
          const d = await safeReadJson<{ book?: Record<string, unknown>; books?: Array<Record<string, unknown>> }>(res, 'ISBNdb API');
          const list = cleanIsbnOnly ? (d.book ? [d.book] : []) : (d.books ?? []);
          return list.map((b) => {
            const isbns = collectValidIdentifiers([typeof b.isbn13 === 'string' ? b.isbn13 : '', typeof b.isbn === 'string' ? b.isbn : '']);
            const exact = Boolean(cleanIsbnOnly && isbns.includes(cleanIsbnOnly));
            const targetIsbn = exact ? cleanIsbnOnly : (isbns[0] || null);
            return {
              externalId: String(b.isbn13 || b.isbn || b.title),
              provider: 'isbndb',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: isbns,
              matchedIdentifiers: isbns,
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
              ean13: targetIsbn,
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
          if (cleanId && !cleanIsbnOnly) return [];
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
          const tokData = await safeReadJson<{ access_token?: string }>(tokRes, 'OCLC OAuth');
          const token = tokData.access_token;
          const qStr = cleanIsbnOnly ? `bn:${cleanIsbnOnly}` : q;
          const res = await fTimeout(`https://americas.discovery.api.oclc.org/worldcat/search/v2/bibs?q=${encodeURIComponent(qStr)}&limit=5`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          assertCleanResponse(res, 'OCLC WorldCat');
          if (!res.ok) return [];
          const data = await safeReadJson<{ bibRecords?: Array<Record<string, unknown>> }>(res, 'OCLC WorldCat');
          return (data.bibRecords ?? []).map((rec) => {
            const id = rec.identifier as { isbns?: string[]; oclcNumber?: string } | undefined;
            const isbns = collectValidIdentifiers(id?.isbns ?? []);
            const exact = Boolean(cleanIsbnOnly && isbns.includes(cleanIsbnOnly));
            const titleObj = rec.title as { mainTitles?: Array<{ text?: string }> } | undefined;
            const targetIsbn = exact ? cleanIsbnOnly : (isbns[0] || null);
            return {
              externalId: String(id?.oclcNumber ?? titleObj?.mainTitles?.[0]?.text ?? 'wc'),
              provider: 'worldcat',
              tier: 'tier1_international',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: isbns,
              matchedIdentifiers: isbns,
              title: titleObj?.mainTitles?.[0]?.text ?? 'Untitled',
              authors: [],
              translators: [],
              publishers: [],
              language: normLang(undefined, targetIsbn),
              genres: [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              ean13: targetIsbn,
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
          if (cleanId && !cleanIsbnOnly) return [];
          const url = cleanIsbnOnly
            ? `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${encodeURIComponent(cleanIsbnOnly)}&cnt=5`
            : `https://ndlsearch.ndl.go.jp/api/opensearch?any=${encodeURIComponent(q)}&cnt=8`;
          const res = await fTimeout(url);
          assertCleanResponse(res, 'National Diet Library');
          if (!res.ok) return [];
          const xml = await safeReadXml(res, 'National Diet Library');
          const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
          const out: Candidate[] = [];
          for (const itemXml of items) {
            const title = extractXmlTags(itemXml, 'dc:title')[0] || extractXmlTags(itemXml, 'title')[0];
            if (!title) continue;
            const isbns = collectValidIdentifiers(extractXmlTags(itemXml, 'dc:identifier'));
            const exact = Boolean(cleanIsbnOnly && isbns.includes(cleanIsbnOnly));
            const vol = extractXmlTags(itemXml, 'dcndl:volume')[0];
            const seriesName = extractXmlTags(itemXml, 'dcndl:seriesTitle')[0];
            const publishers = extractXmlTags(itemXml, 'dc:publisher');
            const issued = extractXmlTags(itemXml, 'dcterms:issued')[0] || extractXmlTags(itemXml, 'dc:date')[0];
            const extent = extractXmlTags(itemXml, 'dc:extent')[0];
            const genres = extractXmlTags(itemXml, 'dcndl:genre');
            const link = extractXmlTags(itemXml, 'link')[0];
            const creators = extractXmlTags(itemXml, 'dc:creator').map((n) => n.replace(/,\s*/g, ' ').trim());
            const pagesMatch = extent?.match(/(\d{1,5})\s*p/i);
            const targetIsbn = exact ? cleanIsbnOnly : (isbns[0] || null);
            out.push({
              externalId: link || `ndl-${targetIsbn || title}`,
              provider: 'ndl_japan',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: isbns,
              matchedIdentifiers: isbns,
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
              ean13: targetIsbn,
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
          if (!cleanIsbnOnly || !cleanIsbnOnly.startsWith('9784')) return [];
          const res = await fTimeout(`https://api.openbd.jp/v1/get?isbn=${cleanIsbnOnly}`);
          assertCleanResponse(res, 'openBD');
          if (!res.ok) return [];
          const arr = await safeReadJson<Array<{ summary?: Record<string, unknown> } | null>>(res, 'openBD');
          const summary = arr?.[0]?.summary;
          if (!summary) return [];
          const summaryIsbn = normalizeIsbnTo13(String(summary.isbn || ''));
          const exact = !summaryIsbn || summaryIsbn === cleanIsbnOnly;
          const resolved = exact ? cleanIsbnOnly : summaryIsbn;
          return [{
            externalId: `openbd-${resolved}`,
            provider: 'openbd',
            tier: 'tier2_national',
            verified: false,
            matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
            matchedIsbns: [resolved],
            matchedIdentifiers: [resolved],
            title: String(summary.title || 'Untitled'),
            authors: summary.author ? [String(summary.author)] : [],
            translators: [],
            publishers: summary.publisher ? [String(summary.publisher)] : [],
            publishedYear: summary.pubdate ? Number(String(summary.pubdate).slice(0, 4)) || null : null,
            language: 'ja',
            genres: [],
            isbn13: resolved,
            isbn10: isbn13To10(resolved),
            ean13: resolved,
            coverUrl: normalizeUrl(typeof summary.cover === 'string' ? summary.cover : undefined),
            seriesName: typeof summary.series === 'string' ? summary.series : undefined,
            volumeNumber: typeof summary.volume === 'string' ? summary.volume : undefined,
            rawPayload: arr[0] as Record<string, unknown>,
          }];
        },
      },
      {
        provider: 'bnf_france',
        label: 'BnF France (SRU)',
        tier: 'tier2_national',
        region: 'fr',
        run: async () => {
          if (cleanId && !cleanIsbnOnly) return [];
          const sruQ = cleanIsbnOnly ? `bib.isbn adj "${cleanIsbnOnly}"` : `bib.anywhere all "${q.replace(/"/g, ' ')}"`;
          const res = await fTimeout(`https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(sruQ)}&recordSchema=dublincore&maximumRecords=5`);
          assertCleanResponse(res, 'BnF France');
          if (!res.ok) return [];
          const xml = await safeReadXml(res, 'BnF France');
          const records = [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/gi)].map((m) => m[1]);
          const out: Candidate[] = [];
          for (const recXml of records) {
            const rawTitle = extractXmlTags(recXml, 'dc:title')[0];
            if (!rawTitle) continue;
            const title = rawTitle.split(/\s+\/\s+/)[0].trim();
            const ids = extractXmlTags(recXml, 'dc:identifier');
            const isbns = collectValidIdentifiers(ids);
            const exact = Boolean(cleanIsbnOnly && isbns.includes(cleanIsbnOnly));
            const targetIsbn = exact ? cleanIsbnOnly : (isbns[0] || null);
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
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: isbns,
              matchedIdentifiers: isbns,
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
              ean13: targetIsbn,
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
          const searchField = cleanIsbnOnly ? 'ISBN' : 'FullText';
          const term = cleanId || q;
          const r = await fTimeout(
            `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=${searchField}%3A%25${encodeURIComponent(term)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`
          );
          assertCleanResponse(r, 'HCM Library');
          if (!r.ok) return [];
          const html = await r.text();
          assertCleanTextBody(html, 'HCM Library');
          const ids = Array.from(new Set([...html.matchAll(/ItemDetail\/(\d+)/gi)].map((m) => m[1]))).slice(0, 4);
          const out: Candidate[] = [];
          for (const id of ids) {
            const dRes = await fTimeout(`https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/${id}`);
            if (!dRes.ok) continue;
            const dHtml = await dRes.text();
            const marcSection = dHtml.match(/<div[^>]+id=["']divMARC21["'][\s\S]*?<\/div>\s*(?:<\/div>|<script)/i)?.[0] ?? dHtml;
            const marc = parseMarc21(marcSection);
            if (!marc) continue;
            const exact = Boolean(cleanId && marc.identifiers.includes(cleanId));
            const targetId = exact ? cleanId : (marc.identifiers[0] || null);
            const parsedTarget = targetId ? parseBookIdentifier(targetId) : null;
            const coverUrl = marc.coverPath
              ? `https://phucvu.thuvientphcm.gov.vn${marc.coverPath.startsWith('/Upload') ? marc.coverPath : `/Upload${marc.coverPath}`}`
              : undefined;
            out.push({
              externalId: id,
              provider: 'hcm_library',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanId ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: marc.isbns,
              matchedIdentifiers: marc.identifiers,
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
              isbn13: parsedTarget?.isIsbn ? parsedTarget.isbn13 : null,
              isbn10: parsedTarget?.prefixGroup === '978' ? parsedTarget.isbn10 : null,
              ean13: parsedTarget?.ean13 ?? targetId,
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
          if (cleanId && !cleanIsbnOnly) return [];
          const key = Deno.env.get('NLK_API_KEY');
          if (!key) throw new EdgeProviderError('api_key_required', 'Configure NLK_API_KEY in Edge Function secrets');
          const param = cleanIsbnOnly ? `isbn=${encodeURIComponent(cleanIsbnOnly)}` : `title=${encodeURIComponent(q)}`;
          const res = await fTimeout(`https://www.nl.go.kr/seoji/SearchApi.do?cert_key=${encodeURIComponent(key)}&result_style=json&page_no=1&page_size=5&${param}`);
          assertCleanResponse(res, 'National Library of Korea');
          if (!res.ok) return [];
          const data = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(res, 'National Library of Korea');
          return (data.docs ?? []).map((d) => {
            const docIsbns = collectValidIdentifiers([String(d.EA_ISBN || '')]);
            const exact = Boolean(cleanIsbnOnly && docIsbns.includes(cleanIsbnOnly));
            const targetIsbn = exact ? cleanIsbnOnly : (docIsbns[0] || null);
            return {
              externalId: String(d.EA_ISBN || d.TITLE),
              provider: 'nl_korea',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: docIsbns,
              matchedIdentifiers: docIsbns,
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
              ean13: targetIsbn,
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
          if (cleanId && !cleanIsbnOnly) return [];
          const res = await fTimeout(`https://www.loc.gov/books/?q=${encodeURIComponent(cleanIsbnOnly || q)}&fo=json&c=5`);
          assertCleanResponse(res, 'Library of Congress');
          if (!res.ok) return [];
          const json = await safeReadJson<{ results?: Array<Record<string, unknown>> }>(res, 'Library of Congress');
          const out: Candidate[] = [];
          for (const r of json.results ?? []) {
            const isbns = collectValidIdentifiers([JSON.stringify(r.isbn ?? r.item ?? {})]);
            const exact = Boolean(cleanIsbnOnly && isbns.includes(cleanIsbnOnly));
            const title = typeof r.title === 'string' ? r.title.trim() : '';
            if (!title) continue;
            const targetIsbn = exact ? cleanIsbnOnly : (isbns[0] || null);
            out.push({
              externalId: String(r.id || title),
              provider: 'loc_us',
              tier: 'tier2_national',
              verified: false,
              matchConfidence: cleanIsbnOnly ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
              matchedIsbns: isbns,
              matchedIdentifiers: isbns,
              title,
              authors: Array.isArray(r.contributor) ? r.contributor.map(String) : [],
              translators: [],
              publishers: [],
              publishedYear: typeof r.date === 'string' ? Number(r.date.match(/(19|20)\d{2}/)?.[0]) || null : null,
              language: normLang(Array.isArray(r.language) ? String(r.language[0]) : undefined, targetIsbn),
              genres: Array.isArray(r.subject) ? r.subject.slice(0, 6).map(String) : [],
              isbn13: targetIsbn,
              isbn10: targetIsbn?.startsWith('978') ? isbn13To10(targetIsbn) : null,
              ean13: targetIsbn,
              sourceUrl: normalizeUrl(typeof r.url === 'string' ? r.url : undefined),
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
          const r = await fTimeout(`https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(cleanId || q)}`);
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
        provider: 'first_news',
        label: 'First News - Trí Việt',
        tier: 'tier3_publisher',
        region: 'vi',
        run: async () => {
          const searchTerms = cleanId ? vnSearchForms(cleanId).slice(0, 3) : [q];
          const extractUrls = (html: string, term: string) => {
            const body = stripSiteChromeHtml(html);
            const raw = Array.from(
              new Set(
                [...body.matchAll(/href=["']((?:https?:\/\/firstnews\.vn)?\/[^"'?#\s]+-p\d+\.html)["']/gi)].map(
                  (m) => (m[1].startsWith('http') ? m[1] : `https://firstnews.vn${m[1]}`)
                )
              )
            );
            const toks = foldVietnameseDiacritics(term)
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((t) => t.length >= 2);
            if (!toks.length) return raw;
            return raw.sort((a, b) => {
              const sA = toks.reduce((n, t) => n + (a.toLowerCase().includes(t) ? 1 : 0), 0);
              const sB = toks.reduce((n, t) => n + (b.toLowerCase().includes(t) ? 1 : 0), 0);
              return sB - sA;
            });
          };
          const settled = await Promise.allSettled(
            searchTerms.map(async (term) => {
              const r = await fTimeout(`https://firstnews.vn/tim-kiem?keyword=${encodeURIComponent(term)}`);
              assertCleanResponse(r, 'First News - Trí Việt');
              if (!r.ok) return [] as string[];
              const h = await r.text();
              assertCleanTextBody(h, 'First News - Trí Việt');
              return extractUrls(h, term);
            })
          );
          const fulfilled = settled.filter((s): s is PromiseFulfilledResult<string[]> => s.status === 'fulfilled');
          if (fulfilled.length === 0) {
            const rej = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
            if (rej) throw rej.reason;
          }
          const urls = Array.from(new Set(fulfilled.flatMap((s) => s.value))).slice(0, 4);
          const out: Candidate[] = [];
          for (const u of urls) {
            const det = await fTimeout(u).catch(() => null);
            if (!det?.ok) continue;
            const dHtml = await det.text();
            assertCleanTextBody(dHtml, 'First News - Trí Việt');
            const bodyHtml = stripSiteChromeHtml(dHtml);
            const specs = extractVnSpecs(bodyHtml);
            const allIds = collectValidIdentifiers(specs.identifiers, bodyHtml, true);
            if (cleanId && !allIds.includes(cleanId)) continue;
            const ogTitle = dHtml.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? dHtml.match(/content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
            const metaTitle = dHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
            const h1 = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '');
            const cleanT = (s?: string | null) => decodeHtml(s ?? '').replace(/\s*[-|]\s*First News.*$/i, '').trim();
            const h1Clean = cleanT(h1);
            const title = cleanT(ogTitle) || cleanT(metaTitle) || (!/khuyến\s*mại/i.test(h1Clean) ? h1Clean : '');
            if (!title) continue;
            const targetId = cleanId || allIds[0] || '';
            const parsedTarget = targetId ? parseBookIdentifier(targetId) : null;
            out.push({
              externalId: u,
              provider: 'first_news',
              tier: 'tier3_publisher',
              verified: false,
              matchConfidence: cleanId ? 'exact_isbn' : 'title_match',
              matchedIsbns: allIds.filter((x) => x.startsWith('978') || x.startsWith('979')),
              matchedIdentifiers: allIds,
              title,
              authors: specs.authors,
              translators: specs.translators,
              illustrators: specs.illustrators,
              publishers: specs.publishers.length ? specs.publishers : ['First News - Trí Việt'],
              publishingPartner: specs.publishingPartner,
              distributor: specs.distributor || 'First News - Trí Việt',
              publishedYear: specs.publishedYear,
              language: specs.language || normLang(undefined, targetId) || 'vi',
              format: specs.format,
              pageCount: specs.pageCount,
              genres: specs.genres,
              isbn13: parsedTarget?.isIsbn ? parsedTarget.isbn13 : null,
              isbn10: parsedTarget?.prefixGroup === '978' ? parsedTarget.isbn10 : null,
              ean13: parsedTarget?.ean13 ?? (targetId || null),
              identifierType: parsedTarget?.identifierType,
              coverUrl: normalizeUrl(dHtml.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]),
              sourceUrl: u,
              rawPayload: { url: u, specs },
            });
          }
          return out;
        },
      },
      {
        provider: 'amak',
        label: 'Amak Books',
        tier: 'tier3_publisher',
        region: 'vi',
        run: async () => {
          const forms = cleanId ? vnSearchForms(cleanId).slice(0, 3) : [q];
          const settled = await Promise.allSettled(
            forms.map(async (f) => {
              const r = await fTimeout(`https://amak.vn/?s=${encodeURIComponent(f)}`);
              assertCleanResponse(r, 'Amak Books');
              if (!r.ok) return [] as string[];
              const h = await r.text();
              assertCleanTextBody(h, 'Amak Books');
              return [...h.matchAll(/href=["'](https:\/\/amak\.vn\/book\/[^"'?#]+)["']/gi)].map((m) => m[1]);
            })
          );
          const fulfilled = settled.filter((s): s is PromiseFulfilledResult<string[]> => s.status === 'fulfilled');
          if (fulfilled.length === 0) {
            const rej = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
            if (rej) throw rej.reason;
          }
          const urls = Array.from(new Set(fulfilled.flatMap((s) => s.value))).slice(0, 4);
          const out: Candidate[] = [];
          for (const u of urls) {
            const det = await fTimeout(u).catch(() => null);
            if (!det?.ok) continue;
            const dHtml = await det.text();
            assertCleanTextBody(dHtml, 'Amak Books');
            const specs = extractVnSpecs(dHtml);
            const allIds = specs.identifiers;
            if (cleanId && !allIds.includes(cleanId)) continue;
            const title = decodeHtml(dHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') ?? '').trim();
            if (!title) continue;
            const targetId = cleanId || allIds[0] || '';
            const parsedTarget = targetId ? parseBookIdentifier(targetId) : null;
            out.push({
              externalId: u,
              provider: 'amak',
              tier: 'tier3_publisher',
              verified: false,
              matchConfidence: cleanId ? 'exact_isbn' : 'title_match',
              matchedIsbns: specs.isbns,
              matchedIdentifiers: allIds,
              title,
              authors: specs.authors,
              translators: specs.translators,
              illustrators: specs.illustrators,
              publishers: specs.publishers.length ? specs.publishers : ['Amak Books'],
              publishingPartner: specs.publishingPartner,
              distributor: specs.distributor,
              publishedYear: specs.publishedYear,
              language: specs.language || normLang(undefined, targetId) || 'vi',
              format: specs.format,
              pageCount: specs.pageCount,
              genres: specs.genres,
              isbn13: parsedTarget?.isIsbn ? parsedTarget.isbn13 : null,
              isbn10: parsedTarget?.prefixGroup === '978' ? parsedTarget.isbn10 : null,
              ean13: parsedTarget?.ean13 ?? (targetId || null),
              identifierType: parsedTarget?.identifierType,
              coverUrl: normalizeUrl(dHtml.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]),
              sourceUrl: u,
              rawPayload: { url: u, specs },
            });
          }
          return out;
        },
      },
      {
        provider: 'tiki',
        label: 'Tiki Books',
        tier: 'tier3_publisher',
        region: 'vi',
        run: async () => {
          if (!cleanId) {
            const r = await fTimeout(`https://tiki.vn/api/v2/products?limit=6&q=${encodeURIComponent(q)}`);
            assertCleanResponse(r, 'Tiki Books');
            if (!r.ok) throw new EdgeProviderError('upstream_error', `Tiki HTTP ${r.status}`);
            const d = await safeReadJson<{ data?: Array<{ id?: number; name?: string; author_name?: string; thumbnail_url?: string; url_path?: string }> }>(r, 'Tiki Books');
            return (d.data ?? []).filter((x) => Boolean(x.name)).map((x) => ({
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
          const r = await fTimeout(`https://tiki.vn/api/v2/products?limit=5&q=${encodeURIComponent(cleanId)}`);
          assertCleanResponse(r, 'Tiki Books');
          if (!r.ok) throw new EdgeProviderError('upstream_error', `Tiki HTTP ${r.status}`);
          const json = await safeReadJson<{ data?: Array<{ id?: number }> }>(r, 'Tiki Books');
          const ids = (json.data ?? []).map((d) => d.id).filter(Boolean).slice(0, 3);
          const out: Candidate[] = [];
          for (const id of ids) {
            const dRes = await fTimeout(`https://tiki.vn/api/v2/products/${id}`).catch(() => null);
            if (!dRes?.ok) continue;
            const det = await safeReadJson<Record<string, unknown>>(dRes, 'Tiki Books').catch(() => null);
            if (!det) continue;
            const attrs = ((det.specifications as Array<{ attributes?: Array<{ code?: string; name?: string; value?: string }> }> | undefined) ?? []).flatMap((s) => s.attributes ?? []);
            const allIds = collectValidIdentifiers(
              [String(det.sku ?? ''), ...attrs.map((a) => a.value ?? '')],
              `${String(det.name ?? '')}\n${attrs.map((a) => `${a.name ?? ''}: ${a.value ?? ''}`).join('\n')}\n${String(det.description ?? '')}`,
              true
            );
            if (!allIds.includes(cleanId)) continue;
            const getAttr = (codes: string[]) => attrs.find((a) => codes.includes(a.code ?? '') || codes.includes((a.name ?? '').toLowerCase()))?.value;
            const pubVal = getAttr(['publisher_vn', 'nhà xuất bản']);
            const distVal = getAttr(['manufacturer', 'issuing_house', 'công ty phát hành', 'nhà phát hành']);
            const parsedTarget = parseBookIdentifier(cleanId);
            out.push({
              externalId: String(det.id),
              provider: 'tiki',
              tier: 'tier3_publisher',
              verified: false,
              matchConfidence: 'exact_isbn',
              matchedIsbns: allIds.filter((x) => x.startsWith('978') || x.startsWith('979')),
              matchedIdentifiers: allIds,
              title: String(det.name ?? 'Untitled'),
              authors: Array.isArray(det.authors) ? (det.authors as Array<{ name?: string }>).map((a) => a.name).filter((x): x is string => Boolean(x)) : [],
              translators: [],
              publishers: pubVal ? [pubVal] : distVal ? [distVal] : [],
              distributor: distVal && pubVal ? distVal : undefined,
              language: 'vi',
              genres: [],
              isbn13: parsedTarget.isIsbn ? parsedTarget.isbn13 : null,
              isbn10: parsedTarget.prefixGroup === '978' ? parsedTarget.isbn10 : null,
              ean13: parsedTarget.ean13 ?? cleanId,
              identifierType: parsedTarget.identifierType,
              coverUrl: normalizeUrl(typeof det.thumbnail_url === 'string' ? det.thumbnail_url : undefined),
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
          const r = await fTimeout(`https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(cleanId || q)}`);
          if (r.status === 403 || r.status === 503) throw new EdgeProviderError('access_denied', 'Cloudflare anti-bot challenge (HTTP 403)');
          const txt = await r.text().catch(() => '');
          if (txt) assertCleanTextBody(txt, 'Fahasa');
          throw new EdgeProviderError('unsupported_interface', 'Fahasa endpoint requires interactive session');
        },
      },
    ];

    const stagesExecuted: string[] = [];
    if (!cleanId || forceAllProviders) {
      await Promise.all(ALL_TASKS.map(executeTask));
      stagesExecuted.push(cleanId ? 'stage1' : 'query');
    } else {
      const affinity = getAffinity(cleanId);
      const stage1 = ALL_TASKS.filter(
        (t) =>
          t.tier === 'tier1_international' ||
          t.region === affinity ||
          (affinity === 'en' && (t.region === 'us' || t.region === 'uk'))
      );
      const stage2 = ALL_TASKS.filter((t) => !stage1.includes(t));

      await Promise.all(stage1.map(executeTask));
      stagesExecuted.push('stage1');

      const s1Merged = mergeCandidatesEdge(candidates, cleanId);
      if (stage2.length > 0 && !isSufficientEdge(s1Merged.exactMatches)) {
        await Promise.all(stage2.map(executeTask));
        stagesExecuted.push('stage2');
      }
    }

    const { merged, exactMatches, possibleEditionMatches, workMatches, approximateMatches, identityMismatches } =
      mergeCandidatesEdge(candidates, cleanId, cleanId ? '' : q);

    const degraded = statuses.some((s) =>
      ['timeout', 'access_denied', 'upstream_error', 'api_key_required', 'proxy_required'].includes(s.status)
    );
    let verificationStatus: VerificationStatus = 'not_found';
    let verificationMessage = 'No matching records found.';
    if (exactMatches.length > 0) {
      verificationStatus = 'verified_match';
      verificationMessage =
        parsedInput?.identifierType === 'ean13'
          ? `Exact GS1 EAN-13 match verified across ${exactMatches[0].sources?.length ?? 1} source(s).`
          : `Exact ISBN match verified across ${exactMatches[0].sources?.length ?? 1} source(s).`;
    } else if (possibleEditionMatches.some((c) => (c.contradictions?.length ?? 0) > 0)) {
      verificationStatus = 'conflicting_records';
      verificationMessage = 'Providers returned contradictory book titles for the same identifier.';
    } else if (identityMismatches.length > 0) {
      verificationStatus = 'identity_mismatch';
      verificationMessage = `Returned source record(s) carry a different identifier (${identityMismatches[0].isbn13 || identityMismatches[0].ean13 || 'mismatch'}) and were rejected.`;
    } else if (possibleEditionMatches.length > 0 || degraded) {
      verificationStatus = 'valid_identifier_unconfirmed';
      verificationMessage = 'Identifier check digit is valid, but upstream sources could not verify a full match.';
    } else if (parsedInput?.isValid) {
      verificationStatus = 'not_found';
      verificationMessage = `Identifier check digit is valid (${parsedInput.identifierType.toUpperCase()}), but no matching bibliographic record was found.`;
    }

    return new Response(
      JSON.stringify({
        candidates: merged,
        exactMatches,
        possibleEditionMatches,
        relatedEditions: [],
        workMatches,
        approximateMatches,
        identityMismatches,
        providerStatuses: statuses,
        queriedIsbn: cleanId || null,
        rawIdentifier: rawIdentifier || q || undefined,
        normalizedIdentifier: cleanId || null,
        identifierType: parsedInput?.identifierType,
        verificationStatus,
        verificationMessage,
        retrievedAt,
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
