import { describe, expect, it } from 'vitest';
import {
  extractIsbnsFromText,
  isbn10ToIsbn13,
  isbn13ToIsbn10,
  isValidIsbn10,
  isValidIsbn13,
  parseIsbn,
} from '../src/utils/isbn';

describe('ISBN validation & strict 978 vs 979 conversion', () => {
  it('validates and converts 978 ISBN-13 <-> ISBN-10 accurately', () => {
    const isbn13 = '9780140449136';
    expect(isValidIsbn13(isbn13)).toBe(true);
    const isbn10 = isbn13ToIsbn10(isbn13);
    expect(isbn10).toBe('0140449132');
    expect(isValidIsbn10(isbn10!)).toBe(true);
    expect(isbn10ToIsbn13(isbn10!)).toBe(isbn13);
  });

  it('handles ISBN-10 ending with X check digit', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('043942089X')).toBe(true);
    expect(isbn10ToIsbn13('043942089X')).toBe('9780439420891');
  });

  it('STRICTLY refuses to convert 979-* ISBN-13 into ISBN-10', () => {
    // 979-10-90636-07-1 (valid 979 ISBN-13)
    const isbn979 = '9791090636071';
    expect(isValidIsbn13(isbn979)).toBe(true);
    expect(isbn13ToIsbn10(isbn979)).toBeNull();

    const parsed = parseIsbn(isbn979);
    expect(parsed.isValid).toBe(true);
    expect(parsed.prefixGroup).toBe('979');
    expect(parsed.isbn13).toBe(isbn979);
    expect(parsed.isbn10).toBeNull();
  });

  it('rejects invalid check digits', () => {
    expect(isValidIsbn13('9780140449130')).toBe(false);
    expect(parseIsbn('9780140449130').isValid).toBe(false);
  });

  it('validates and normalizes critical Vietnamese test ISBN 9786042243568 with hyphens or spaces', () => {
    expect(isValidIsbn13('9786042243568')).toBe(true);
    expect(isValidIsbn13('978-604-224-356-8')).toBe(true);
    expect(isValidIsbn13('978 604 224 356 8')).toBe(true);

    const parsed = parseIsbn('978-604-224-356-8');
    expect(parsed.isValid).toBe(true);
    expect(parsed.isbn13).toBe('9786042243568');
    expect(parsed.prefixGroup).toBe('978');
    expect(parsed.isbn10).toBe('604224356X');
    expect(isValidIsbn10('604224356X')).toBe(true);
    expect(isbn10ToIsbn13('604224356X')).toBe('9786042243568');
  });

  it('extracts valid formatted ISBNs from OCR text', () => {
    const ocr = 'First Vietnamese Edition\nISBN 978-0-14-044913-6\nAlso 979-10-90636-07-1 and 978 604 224 356 8';
    const found = extractIsbnsFromText(ocr);
    expect(found.map((f) => f.isbn13)).toEqual([
      '9780140449136',
      '9791090636071',
      '9786042243568',
    ]);
    expect(found[1].isbn10).toBeNull();
  });
});
