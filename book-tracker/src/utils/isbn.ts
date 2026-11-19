/**
 * Strict ISBN-10 and ISBN-13 normalization, check-digit validation, and conversion helpers.
 *
 * CRITICAL RULE:
 * Only ISBN-13 codes starting with "978" have a valid ISBN-10 representation.
 * ISBN-13 codes starting with "979" MUST NEVER be converted into ISBN-10.
 */

export interface ParsedIsbn {
  raw: string;
  isbn13: string | null;
  isbn10: string | null;
  prefixGroup: '978' | '979' | 'other';
  isValid: boolean;
}

export function stripIsbn(input: string): string {
  return input.toUpperCase().replace(/[^0-9X]/g, '');
}

export function computeIsbn13CheckDigit(first12: string): string {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('ISBN-13 prefix must be exactly 12 digits');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const mod = sum % 10;
  return String(mod === 0 ? 0 : 10 - mod);
}

export function isValidIsbn13(input: string): boolean {
  const clean = stripIsbn(input);
  if (!/^\d{13}$/.test(clean)) return false;
  if (!clean.startsWith('978') && !clean.startsWith('979')) return false;
  return computeIsbn13CheckDigit(clean.slice(0, 12)) === clean[12];
}

export function computeIsbn10CheckDigit(first9: string): string {
  if (!/^\d{9}$/.test(first9)) {
    throw new Error('ISBN-10 prefix must be exactly 9 digits');
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(first9[i]) * (10 - i);
  }
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

export function isValidIsbn10(input: string): boolean {
  const clean = stripIsbn(input);
  if (!/^\d{9}[\dX]$/.test(clean)) return false;
  return computeIsbn10CheckDigit(clean.slice(0, 9)) === clean[9];
}

export function isbn10ToIsbn13(isbn10: string): string | null {
  const clean = stripIsbn(isbn10);
  if (!isValidIsbn10(clean)) return null;
  const first12 = `978${clean.slice(0, 9)}`;
  return `${first12}${computeIsbn13CheckDigit(first12)}`;
}

/**
 * Strictly converts ONLY 978-prefixed ISBN-13 into ISBN-10.
 * Always returns null for 979-* ISBN-13 codes or invalid ISBN-13 strings.
 */
export function isbn13ToIsbn10(isbn13: string): string | null {
  const clean = stripIsbn(isbn13);
  if (!isValidIsbn13(clean)) return null;
  if (!clean.startsWith('978')) {
    return null;
  }
  const body9 = clean.slice(3, 12);
  return `${body9}${computeIsbn10CheckDigit(body9)}`;
}

export function parseIsbn(input: string): ParsedIsbn {
  const clean = stripIsbn(input);
  if (clean.length === 13 && isValidIsbn13(clean)) {
    const prefixGroup: '978' | '979' | 'other' = clean.startsWith('978')
      ? '978'
      : clean.startsWith('979')
        ? '979'
        : 'other';
    return {
      raw: input,
      isbn13: clean,
      isbn10: isbn13ToIsbn10(clean),
      prefixGroup,
      isValid: true,
    };
  }
  if (clean.length === 10 && isValidIsbn10(clean)) {
    const isbn13 = isbn10ToIsbn13(clean);
    return {
      raw: input,
      isbn13,
      isbn10: clean,
      prefixGroup: '978',
      isValid: true,
    };
  }
  return {
    raw: input,
    isbn13: null,
    isbn10: null,
    prefixGroup: 'other',
    isValid: false,
  };
}

export function formatIsbn13(isbn13: string): string {
  const clean = stripIsbn(isbn13);
  if (clean.length !== 13) return isbn13;
  return `${clean.slice(0, 3)}-${clean.slice(3, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12)}`;
}

export function extractIsbnsFromText(text: string): ParsedIsbn[] {
  const matches =
    text.match(/(?:97[89][-\s]?(?:\d[-\s]?){9}\d)|(?:\b\d{9}[\dXx]\b)|(?:(?:\d[-\s]?){9}[\dXx])/g) ?? [];
  const seen = new Set<string>();
  const results: ParsedIsbn[] = [];
  for (const candidate of matches) {
    const parsed = parseIsbn(candidate);
    if (parsed.isValid && parsed.isbn13 && !seen.has(parsed.isbn13)) {
      seen.add(parsed.isbn13);
      results.push(parsed);
    }
  }
  return results;
}

export function normalizeIsbnTo13(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseIsbn(input);
  return parsed.isValid ? parsed.isbn13 : null;
}

export function isbnsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeIsbnTo13(a);
  const nb = normalizeIsbnTo13(b);
  return Boolean(na && nb && na === nb);
}

/**
 * Generates normalized ISBN-13 plus likely hyphenated forms used by Vietnamese publishers
 * (group 604 uses 1- to 4-digit registrant codes, e.g., 978-604-2-..., 978-604-359-..., 978-604-477-...).
 */
export function generateSearchIsbnForms(rawIsbn: string): string[] {
  const parsed = parseIsbn(rawIsbn);
  const clean13 = parsed.isbn13 || stripIsbn(rawIsbn);
  if (!clean13) return [];

  const forms = new Set<string>([clean13]);
  if (clean13.length === 13 && clean13.startsWith('978604')) {
    const rest = clean13.slice(6, 12);
    const check = clean13[12];
    forms.add(`978-604-${rest[0]}-${rest.slice(1)}-${check}`);
    forms.add(`978-604-${rest.slice(0, 2)}-${rest.slice(2)}-${check}`);
    forms.add(`978-604-${rest.slice(0, 3)}-${rest.slice(3)}-${check}`);
    forms.add(`978-604-${rest.slice(0, 4)}-${rest.slice(4)}-${check}`);
  } else if (clean13.length === 13) {
    forms.add(formatIsbn13(clean13));
  }
  if (parsed.isbn10) {
    forms.add(parsed.isbn10);
  }
  return Array.from(forms);
}

