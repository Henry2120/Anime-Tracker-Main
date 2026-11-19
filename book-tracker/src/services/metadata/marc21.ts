import { extractIsbnsFromText, parseIsbn } from '../../utils/isbn';
import { decodeHtmlEntities, htmlToStructuredLines } from './htmlAndText';

export interface Marc21Field {
  tag: string;
  indicators: string;
  rawValue: string;
  subfields: Record<string, string[]>;
}

export interface ParsedMarc21Record {
  controlNumber?: string;
  isbns: string[];
  title: string;
  subtitle?: string;
  authors: string[];
  translators: string[];
  illustrators: string[];
  publishers: string[];
  publishedYear: number | null;
  language: string;
  pageCount: number | null;
  subjects: string[];
  description?: string;
  coverPath?: string;
  fields: Marc21Field[];
}

const MARC_LANG_MAP: Record<string, string> = {
  vie: 'vi',
  vi: 'vi',
  eng: 'en',
  en: 'en',
  jpn: 'ja',
  ja: 'ja',
  kor: 'ko',
  ko: 'ko',
  chi: 'zh',
  zho: 'zh',
  zh: 'zh',
  fre: 'fr',
  fra: 'fr',
  fr: 'fr',
  ger: 'de',
  deu: 'de',
};

function parseSubfields(rawValue: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const parts = rawValue.split(/\$([a-z0-9])/i);
  if (parts.length <= 1) {
    return out;
  }
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const code = parts[i].toLowerCase();
    const val = parts[i + 1].trim();
    if (!val) continue;
    if (!out[code]) out[code] = [];
    out[code].push(val);
  }
  return out;
}

function cleanMarcTrailingPunctuation(value: string): string {
  return value.replace(/\s*[/:;,]+\s*$/, '').trim();
}

function normalizeMarcPersonalName(rawName: string, statementOfResponsibility?: string): string {
  const cleaned = cleanMarcTrailingPunctuation(rawName).replace(/\s+/g, ' ');
  if (!cleaned.includes(',')) return cleaned;
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return cleaned;
  const [family, given] = parts;
  const familyFirst = `${family} ${given}`;
  const givenFirst = `${given} ${family}`;
  if (statementOfResponsibility) {
    const lowerResp = statementOfResponsibility.toLocaleLowerCase('vi');
    if (lowerResp.includes(familyFirst.toLocaleLowerCase('vi'))) return familyFirst;
    if (lowerResp.includes(givenFirst.toLocaleLowerCase('vi'))) return givenFirst;
  }
  return givenFirst;
}

function addUniqueName(list: string[], name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = trimmed.toLocaleLowerCase('vi');
  if (!list.some((x) => x.toLocaleLowerCase('vi') === key)) {
    list.push(trimmed);
  }
}

interface ResponsibilityRoles {
  translators: string[];
  illustrators: string[];
}

function parse245ResponsibilityRoles(stmt: string): ResponsibilityRoles {
  const roles: ResponsibilityRoles = { translators: [], illustrators: [] };
  if (!stmt) return roles;
  const segments = stmt.split(/[;]+/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const lower = seg.toLocaleLowerCase('vi');
    if (/\b(?:dịch|dịch giả|biên dịch|người dịch|chuyển ngữ)\b/i.test(lower)) {
      const cleaned = seg
        .replace(/^(?:dịch giả|biên dịch|người dịch|dịch)\s*:?\s*/i, '')
        .replace(/\b(?:dịch giả|biên dịch|người dịch|dịch)\b\s*$/i, '')
        .trim();
      for (const name of cleaned.split(/[,&]+|\bvà\b/i)) {
        addUniqueName(roles.translators, cleanMarcTrailingPunctuation(name));
      }
    } else if (/\b(?:minh họa|họa sĩ|tranh)\b/i.test(lower)) {
      const cleaned = seg
        .replace(/^(?:minh họa|họa sĩ|tranh)\s*:?\s*/i, '')
        .replace(/\b(?:minh họa|họa sĩ|tranh)\b\s*$/i, '')
        .trim();
      for (const name of cleaned.split(/[,&]+|\bvà\b/i)) {
        addUniqueName(roles.illustrators, cleanMarcTrailingPunctuation(name));
      }
    }
  }
  return roles;
}

/**
 * Parses MARC21 lines from either raw MARC21 tagged text or an HTML modal/table (e.g., `#divMARC21`).
 */
export function parseMarc21Record(htmlOrText: string): ParsedMarc21Record | null {
  const isHtml = /<[^>]+>/.test(htmlOrText);
  const rawLines = isHtml
    ? htmlToStructuredLines(htmlOrText).map((l) => l.replace(/\t+/g, ' '))
    : decodeHtmlEntities(htmlOrText)
        .split(/\r?\n/)
        .map((l) => l.replace(/\u00A0/g, ' ').trim())
        .filter(Boolean);

  const fields: Marc21Field[] = [];
  for (const line of rawLines) {
    const normalized = line.replace(/\s+/g, ' ').trim();
    const m = normalized.match(/^(Ldr|\d{3})\s+([_0-9a-zA-Z]{2})?\s*(.*)$/);
    if (!m) continue;
    const tag = m[1];
    // Handle cases where indicator is omitted for control fields (001, 907, Ldr)
    let indicators = m[2] ?? '';
    let rawValue = m[3] ?? '';
    if (indicators && rawValue === '' && !tag.startsWith('0') && !rawValue.includes('$')) {
      rawValue = indicators;
      indicators = '';
    } else if (/^(Ldr|00\d|9\d\d)$/.test(tag) && indicators && !rawValue.startsWith('$')) {
      rawValue = `${indicators} ${rawValue}`.trim();
      indicators = '';
    }
    fields.push({
      tag,
      indicators,
      rawValue: rawValue.trim(),
      subfields: parseSubfields(rawValue),
    });
  }

  if (fields.length === 0) return null;

  const isbns: string[] = [];
  const f245 = fields.find((f) => f.tag === '245');
  const statement245c = f245?.subfields.c?.[0] ?? '';
  const respRoles = parse245ResponsibilityRoles(statement245c);

  let controlNumber: string | undefined;
  let title = '';
  let subtitle: string | undefined;
  const authors: string[] = [];
  const translators: string[] = [...respRoles.translators];
  const illustrators: string[] = [...respRoles.illustrators];
  const publishers: string[] = [];
  let publishedYear: number | null = null;
  let language = 'vi';
  let pageCount: number | null = null;
  const subjects: string[] = [];
  let description: string | undefined;
  let coverPath: string | undefined;

  for (const field of fields) {
    if (field.tag === '001') {
      controlNumber = field.rawValue.trim();
    } else if (field.tag === '020') {
      const aVals = field.subfields.a ?? [field.rawValue];
      for (const v of aVals) {
        for (const parsed of extractIsbnsFromText(v)) {
          if (parsed.isbn13 && !isbns.includes(parsed.isbn13)) isbns.push(parsed.isbn13);
        }
        const single = parseIsbn(v.replace(/\([^)]*\)/g, ''));
        if (single.isValid && single.isbn13 && !isbns.includes(single.isbn13)) {
          isbns.push(single.isbn13);
        }
      }
    } else if (field.tag === '041') {
      const code = (field.subfields.a?.[0] ?? field.rawValue).trim().toLowerCase().slice(0, 3);
      if (MARC_LANG_MAP[code]) language = MARC_LANG_MAP[code];
    } else if (field.tag === '100') {
      for (const a of field.subfields.a ?? []) {
        addUniqueName(authors, normalizeMarcPersonalName(a, statement245c));
      }
    } else if (field.tag === '245') {
      if (field.subfields.a?.[0]) {
        title = cleanMarcTrailingPunctuation(field.subfields.a[0]);
      }
      if (field.subfields.b?.[0]) {
        subtitle = cleanMarcTrailingPunctuation(field.subfields.b[0]);
      }
    } else if (field.tag === '260' || field.tag === '264') {
      for (const b of field.subfields.b ?? []) {
        const pub = cleanMarcTrailingPunctuation(b).replace(/^\[|\]$/g, '').trim();
        if (pub) addUniqueName(publishers, [pub][0]);
      }
      const c = field.subfields.c?.[0];
      if (c && !publishedYear) {
        const y = c.match(/(19|20)\d{2}/);
        if (y) publishedYear = Number(y[0]);
      }
    } else if (field.tag === '300') {
      const a = field.subfields.a?.[0] ?? field.rawValue;
      const pMatch = a.match(/(\d{1,5})\s*(?:tr|trang|p|pages|leaf|leaves)/i) ?? a.match(/^(\d{1,5})\b/);
      if (pMatch && !pageCount) {
        pageCount = Number(pMatch[1]);
      }
    } else if (field.tag === '520') {
      const a = field.subfields.a?.[0];
      if (a && !description) description = a.trim();
    } else if (field.tag === '650') {
      for (const a of field.subfields.a ?? []) {
        const subj = cleanMarcTrailingPunctuation(a);
        if (subj) addUniqueName(subjects, subj);
      }
    } else if (field.tag === '700') {
      const rawName = field.subfields.a?.[0];
      if (!rawName) continue;
      const name = normalizeMarcPersonalName(rawName, statement245c);
      const relatorText = [...(field.subfields.e ?? []), ...(field.subfields['4'] ?? [])]
        .join(' ')
        .toLocaleLowerCase('vi');

      if (/\b(?:trl|dịch|dịch giả|biên dịch|translator)\b/i.test(relatorText)) {
        addUniqueName(translators, name);
      } else if (/\b(?:ill|minh họa|họa sĩ|illustrator)\b/i.test(relatorText)) {
        addUniqueName(illustrators, name);
      } else if (translators.some((t) => t.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
        addUniqueName(translators, name);
      } else if (illustrators.some((ill) => ill.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
        addUniqueName(illustrators, name);
      } else if (/\b(?:aut|tác giả|author)\b/i.test(relatorText) || authors.length === 0) {
        addUniqueName(authors, name);
      } else {
        // Unlabeled 700 entry when 100 already exists -> keep as additional contributor / author only if not translator
        addUniqueName(authors, name);
      }
    } else if (field.tag === '907') {
      const val = field.rawValue.trim();
      if (val.startsWith('/')) coverPath = val;
    }
  }

  if (!title && isbns.length === 0) return null;

  return {
    controlNumber,
    isbns,
    title: title || 'Untitled',
    subtitle,
    authors,
    translators,
    illustrators,
    publishers,
    publishedYear,
    language,
    pageCount,
    subjects,
    description,
    coverPath,
    fields,
  };
}
