/**
 * Strict ISBN-10, ISBN-13, and GS1 EAN-13 normalization, check-digit validation, and conversion helpers.
 *
 * CRITICAL RULES:
 * 1. Only ISBN-13 codes starting with "978" have a valid ISBN-10 representation.
 * 2. ISBN-13 codes starting with "979" MUST NEVER be converted into ISBN-10.
 * 3. Non-ISBN EAN-13 retail/publisher barcodes (e.g. Vietnamese "893*") MUST NEVER
 *    be converted to ISBN-10 or mislabeled as ISBNs, and leading zeros are always preserved.
 * 4. Digits are NEVER mutated to force check-digit validity.
 */

import type { BookIdentifierType } from '../types/domain';

export interface ParsedIsbn {
  raw: string;
  isbn13: string | null;
  isbn10: string | null;
  prefixGroup: '978' | '979' | 'other';
  isValid: boolean;
}

export interface ParsedBookIdentifier {
  raw: string;
  normalizedId: string | null;
  ean13: string | null;
  isbn13: string | null;
  isbn10: string | null;
  identifierType: BookIdentifierType;
  prefixGroup: '978' | '979' | 'other';
  isValid: boolean;
  isIsbn: boolean;
  errorReason: string | null;
}

export function stripIsbn(input: string): string {
  return input
    .trim()
    .replace(/^(?:ISBN(?:-1[03])?|EAN(?:-13)?|BARCODE)\s*[:#]?\s*/i, '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');
}

export function computeEan13CheckDigit(first12: string): string {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('EAN-13 prefix must be exactly 12 digits');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const mod = sum % 10;
  return String(mod === 0 ? 0 : 10 - mod);
}

export function computeIsbn13CheckDigit(first12: string): string {
  return computeEan13CheckDigit(first12);
}

export function isValidEan13(input: string): boolean {
  const clean = stripIsbn(input);
  if (!/^\d{13}$/.test(clean)) return false;
  return computeEan13CheckDigit(clean.slice(0, 12)) === clean[12];
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
 * Always returns null for 979-* ISBN-13 codes, non-ISBN EAN-13 codes, or invalid strings.
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

/**
 * Parses and validates ISBN-13 (978/979), ISBN-10, and GS1 EAN-13 (e.g. Vietnamese 893* book barcodes).
 * Preserves leading zeros and never coerces non-ISBN EAN-13 into ISBN-10 or fake ISBN-13.
 */
export function parseBookIdentifier(input: string): ParsedBookIdentifier {
  const clean = stripIsbn(input);
  if (!clean) {
    return {
      raw: input,
      normalizedId: null,
      ean13: null,
      isbn13: null,
      isbn10: null,
      identifierType: 'invalid',
      prefixGroup: 'other',
      isValid: false,
      isIsbn: false,
      errorReason: 'Identifier is empty',
    };
  }

  if (clean.length === 13 && /^\d{13}$/.test(clean)) {
    const expected = computeEan13CheckDigit(clean.slice(0, 12));
    if (expected !== clean[12]) {
      return {
        raw: input,
        normalizedId: null,
        ean13: null,
        isbn13: null,
        isbn10: null,
        identifierType: 'invalid',
        prefixGroup: clean.startsWith('978') ? '978' : clean.startsWith('979') ? '979' : 'other',
        isValid: false,
        isIsbn: false,
        errorReason: `Invalid EAN-13/ISBN-13 check digit in "${clean}" (got ${clean[12]}, expected ${expected})`,
      };
    }

    if (clean.startsWith('978') || clean.startsWith('979')) {
      const prefixGroup: '978' | '979' = clean.startsWith('978') ? '978' : '979';
      return {
        raw: input,
        normalizedId: clean,
        ean13: clean,
        isbn13: clean,
        isbn10: prefixGroup === '978' ? isbn13ToIsbn10(clean) : null,
        identifierType: 'isbn13',
        prefixGroup,
        isValid: true,
        isIsbn: true,
        errorReason: null,
      };
    }

    return {
      raw: input,
      normalizedId: clean,
      ean13: clean,
      isbn13: null,
      isbn10: null,
      identifierType: 'ean13',
      prefixGroup: 'other',
      isValid: true,
      isIsbn: false,
      errorReason: null,
    };
  }

  if (clean.length === 10 && /^\d{9}[\dX]$/.test(clean)) {
    const expected = computeIsbn10CheckDigit(clean.slice(0, 9));
    if (expected !== clean[9]) {
      return {
        raw: input,
        normalizedId: null,
        ean13: null,
        isbn13: null,
        isbn10: null,
        identifierType: 'invalid',
        prefixGroup: 'other',
        isValid: false,
        isIsbn: false,
        errorReason: `Invalid ISBN-10 check digit in "${clean}" (got ${clean[9]}, expected ${expected})`,
      };
    }
    const isbn13 = isbn10ToIsbn13(clean);
    return {
      raw: input,
      normalizedId: isbn13,
      ean13: isbn13,
      isbn13,
      isbn10: clean,
      identifierType: 'isbn10',
      prefixGroup: '978',
      isValid: true,
      isIsbn: true,
      errorReason: null,
    };
  }

  return {
    raw: input,
    normalizedId: null,
    ean13: null,
    isbn13: null,
    isbn10: null,
    identifierType: 'invalid',
    prefixGroup: 'other',
    isValid: false,
    isIsbn: false,
    errorReason: `Identifier "${clean}" must be a valid 10-digit ISBN or 13-digit ISBN/EAN-13 (got ${clean.length} characters)`,
  };
}

export function normalizeBookIdentifier(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseBookIdentifier(input);
  return parsed.isValid ? parsed.normalizedId : null;
}

export function formatIsbn13(isbn13: string): string {
  const clean = stripIsbn(isbn13);
  if (clean.length !== 13) return isbn13;
  if (!clean.startsWith('978') && !clean.startsWith('979')) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12)}`;
}

export function formatBookIdentifier(code: string): string {
  const clean = stripIsbn(code);
  if (clean.length === 13 && (clean.startsWith('978') || clean.startsWith('979'))) {
    return formatIsbn13(clean);
  }
  return clean || code;
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

/**
 * Extracts valid book identifiers from arbitrary text or structured SKU/barcode fields.
 * Supports ISBN-13 (978/979), ISBN-10, and Vietnamese GS1 893* EAN-13 codes by default;
 * when `includeAllEan13` is true (e.g. inside explicit SKU/barcode/GTIN fields), accepts any valid 13-digit GS1 EAN-13.
 */
export function extractBookIdentifiersFromText(
  text: string,
  options?: { includeAllEan13?: boolean }
): ParsedBookIdentifier[] {
  if (!text) return [];
  const pattern = options?.includeAllEan13
    ? /(?:\b\d(?:[-\s]?\d){12}\b)|(?:\b\d{9}[\dXx]\b)|(?:(?:\d[-\s]?){9}[\dXx])/g
    : /(?:(?:97[89]|893)[-\s]?(?:\d[-\s]?){9}\d)|(?:\b\d{9}[\dXx]\b)|(?:(?:\d[-\s]?){9}[\dXx])/g;
  const matches = text.match(pattern) ?? [];
  const seen = new Set<string>();
  const results: ParsedBookIdentifier[] = [];
  for (const candidate of matches) {
    const parsed = parseBookIdentifier(candidate);
    if (!parsed.isValid || !parsed.normalizedId) continue;
    if (!options?.includeAllEan13 && !parsed.isIsbn && !parsed.normalizedId.startsWith('893')) {
      continue;
    }
    if (!seen.has(parsed.normalizedId)) {
      seen.add(parsed.normalizedId);
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
  const na = normalizeBookIdentifier(a);
  const nb = normalizeBookIdentifier(b);
  return Boolean(na && nb && na === nb);
}

/**
 * Generates normalized identifier plus likely hyphenated forms used by Vietnamese publishers
 * (groups 978-604 and 978-632 use 1- to 4-digit registrant codes, e.g. 978-604-2-..., 978-632-621-...).
 * Non-ISBN GS1 EAN-13 codes (e.g. 893*) are NEVER hyphenated or converted to ISBN-10.
 */
export function generateSearchIsbnForms(rawId: string): string[] {
  const parsed = parseBookIdentifier(rawId);
  const clean13 = parsed.normalizedId || stripIsbn(rawId);
  if (!clean13) return [];

  const forms = new Set<string>([clean13]);
  if (clean13.length === 13 && (clean13.startsWith('978604') || clean13.startsWith('978632'))) {
    const group = clean13.slice(3, 6);
    const rest = clean13.slice(6, 12);
    const check = clean13[12];
    forms.add(`978-${group}-${rest[0]}-${rest.slice(1)}-${check}`);
    forms.add(`978-${group}-${rest.slice(0, 2)}-${rest.slice(2)}-${check}`);
    forms.add(`978-${group}-${rest.slice(0, 3)}-${rest.slice(3)}-${check}`);
    forms.add(`978-${group}-${rest.slice(0, 4)}-${rest.slice(4)}-${check}`);
  } else if (clean13.length === 13 && (clean13.startsWith('978') || clean13.startsWith('979'))) {
    forms.add(formatIsbn13(clean13));
  }
  if (parsed.isbn10) {
    forms.add(parsed.isbn10);
  }
  return Array.from(forms);
}

