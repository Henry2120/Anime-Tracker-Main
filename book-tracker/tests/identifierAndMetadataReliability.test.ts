import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareZXingModule as prepareReaderModule } from 'zxing-wasm/reader';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { db } from '../src/db/dexie';
import { createBookBundle } from '../src/services/libraryService';
import { extractVietnameseBookSpecs } from '../src/services/metadata/htmlAndText';
import {
  adcbookProvider,
  bnfFranceProvider,
  crossrefProvider,
  goodaProvider,
  hikaruProvider,
  ndlJapanProvider,
  nhaNamProvider,
  openBdProvider,
  openLibraryProvider,
} from '../src/services/metadata/providers';
import { executeServerBookLookup } from '../src/services/metadata/serverLookup';
import {
  clearMetadataLookupCache,
  lookupMetadataWithReportByIsbn,
} from '../src/services/metadataService';
import {
  decodeBarcodeFromRawImageDataDetailed,
  evaluateBarcodeDetections,
  extractValidIdentifierFromBarcodeValues,
} from '../src/services/scannerAndOcr';
import {
  formatBookIdentifier,
  generateSearchIsbnForms,
  isbn13ToIsbn10,
  isValidEan13,
  isValidIsbn13,
  normalizeBookIdentifier,
  parseBookIdentifier,
} from '../src/utils/isbn';
import {
  createInitialScanLookupState,
  transitionOnBarcodeDecoded,
  transitionOnLookupCompleted,
} from '../src/utils/scanFlow';

class NodeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace = 'srgb' as const;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as unknown as { ImageData: typeof NodeImageData }).ImageData = NodeImageData;
}

function buildRgbaBarcodeImageData(
  matrix: Uint8ClampedArray | Uint8Array,
  matW: number,
  matH: number,
  scaleX = 3,
  scaleY = 2,
  quiet = 24
): ImageData {
  const width = matW * scaleX + quiet * 2;
  const height = matH * scaleY + quiet * 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  for (let my = 0; my < matH; my++) {
    for (let mx = 0; mx < matW; mx++) {
      if (matrix[my * matW + mx] !== 0) continue;
      for (let sy = 0; sy < scaleY; sy++) {
        for (let sx = 0; sx < scaleX; sx++) {
          const px = quiet + mx * scaleX + sx;
          const py = quiet + my * scaleY + sy;
          const idx = (py * width + px) * 4;
          rgba[idx] = 0;
          rgba[idx + 1] = 0;
          rgba[idx + 2] = 0;
          rgba[idx + 3] = 255;
        }
      }
    }
  }
  return new ImageData(rgba, width, height);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

afterEach(async () => {
  clearMetadataLookupCache();
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('Identifier Normalization & Strict Validation Rules', () => {
  it('validates all mandatory ISBN-13, 978-632, and Vietnamese 893 GS1 EAN-13 identifiers cleanly', () => {
    // Valid Vietnamese ISBN-13s (978-604 & 978-632)
    for (const code of ['9786043590296', '9786042243568', '9786044777986', '9786043912173', '9786326216318']) {
      const p = parseBookIdentifier(code);
      expect(p.isValid).toBe(true);
      expect(p.isIsbn).toBe(true);
      expect(p.identifierType).toBe('isbn13');
      expect(p.normalizedId).toBe(code);
      expect(p.isbn13).toBe(code);
      expect(p.ean13).toBe(code);
      expect(isValidIsbn13(code)).toBe(true);
      expect(isValidEan13(code)).toBe(true);
    }

    // Valid Vietnamese non-ISBN GS1 EAN-13 barcode (8935235220423)
    const ean = parseBookIdentifier('EAN-13: 8935235220423');
    expect(ean.isValid).toBe(true);
    expect(ean.isIsbn).toBe(false);
    expect(ean.identifierType).toBe('ean13');
    expect(ean.normalizedId).toBe('8935235220423');
    expect(ean.ean13).toBe('8935235220423');
    expect(ean.isbn13).toBeNull();
    expect(ean.isbn10).toBeNull();
    expect(isValidEan13('8935235220423')).toBe(true);
    expect(isValidIsbn13('8935235220423')).toBe(false);
    expect(isbn13ToIsbn10('8935235220423')).toBeNull();
    expect(formatBookIdentifier('8935235220423')).toBe('8935235220423');
  });

  it('preserves leading zeros on ISBN-10 and generates 978-632 hyphenated forms without inventing ISBN-10 for 893/979', () => {
    const p10 = parseBookIdentifier('ISBN-10: 0-14-044913-2');
    expect(p10.isValid).toBe(true);
    expect(p10.identifierType).toBe('isbn10');
    expect(p10.isbn10).toBe('0140449132');
    expect(p10.isbn13).toBe('9780140449136');

    expect(generateSearchIsbnForms('9786326216318')).toContain('978-632-621-631-8');
    expect(generateSearchIsbnForms('8935235220423')).toEqual(['8935235220423']);
    expect(isbn13ToIsbn10('9791090636071')).toBeNull();
  });

  it('rejects bad check digits without ever mutating digits', () => {
    const bad978 = parseBookIdentifier('9786326216319');
    expect(bad978.isValid).toBe(false);
    expect(bad978.identifierType).toBe('invalid');
    expect(bad978.normalizedId).toBeNull();
    expect(bad978.errorReason).toContain('expected 8');

    const bad893 = parseBookIdentifier('8935235220420');
    expect(bad893.isValid).toBe(false);
    expect(bad893.identifierType).toBe('invalid');
    expect(bad893.errorReason).toContain('expected 3');
    expect(normalizeBookIdentifier('8935235220420')).toBeNull();
  });
});

describe('Scanner EAN-13 (893*) Decoding & Multi-Barcode Priority', () => {
  beforeAll(async () => {
    const readerWasm = await readFile(
      resolve(__dirname, '../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')
    );
    const writerWasm = await readFile(
      resolve(__dirname, '../node_modules/zxing-wasm/dist/writer/zxing_writer.wasm')
    );
    await prepareReaderModule({
      overrides: { wasmBinary: readerWasm.buffer as ArrayBuffer },
      fireImmediately: true,
    });
    await prepareZXingModule({
      overrides: { wasmBinary: writerWasm.buffer as ArrayBuffer },
      fireImmediately: true,
    });
  });

  it('decodes real generated EAN-13 barcode for 8935235220423 without coercing it to an ISBN', async () => {
    const generated = await writeBarcode('8935235220423', {
      format: 'EAN-13',
      withQuietZones: true,
    });
    expect(generated.error).toBe('');
    const img = buildRgbaBarcodeImageData(
      generated.symbol.data,
      generated.symbol.width,
      generated.symbol.height
    );
    const res = await decodeBarcodeFromRawImageDataDetailed(img);

    expect(res.isValidIdentifier).toBe(true);
    expect(res.identifierType).toBe('ean13');
    expect(res.validIdentifier).toBe('8935235220423');
    expect(res.ean13).toBe('8935235220423');
    expect(res.validIsbn13).toBeNull();
    expect(res.isbn10).toBeNull();
    expect(res.isValidIsbn).toBe(false);
  });

  it('prioritizes ISBN barcodes ahead of non-ISBN 893* EAN-13 barcodes in multi-barcode frames', () => {
    const pickedFromMulti = extractValidIdentifierFromBarcodeValues([
      { rawValue: '8935235220423', format: 'ean_13' },
      { rawValue: '9786043590296', format: 'ean_13' },
    ]);
    expect(pickedFromMulti).toBe('9786043590296');

    const evalMulti = evaluateBarcodeDetections([
      { rawValue: '8935235220423', format: 'ean_13' },
      { rawValue: '9786043590296', format: 'ean_13' },
    ]);
    expect(evalMulti.identifierType).toBe('isbn13');
    expect(evalMulti.validIsbn13).toBe('9786043590296');

    const evalOnlyEan = evaluateBarcodeDetections([{ rawValue: '8935235220423', format: 'ean_13' }]);
    expect(evalOnlyEan.isValidIdentifier).toBe(true);
    expect(evalOnlyEan.identifierType).toBe('ean13');
    expect(evalOnlyEan.validIdentifier).toBe('8935235220423');
    expect(evalOnlyEan.validIsbn13).toBeNull();
  });

  it('preserves ean13 identifierType and verificationOutcome in scanFlow without switching tabs', () => {
    const state = transitionOnBarcodeDecoded(
      createInitialScanLookupState('scan'),
      '8935235220423',
      { format: 'EAN-13', identifierType: 'ean13' }
    );
    expect(state.tab).toBe('scan');
    expect(state.scannedIdentifierType).toBe('ean13');

    const completed = transitionOnLookupCompleted(state, {
      candidates: [],
      identityMismatches: [],
      providerStatuses: [],
      queriedIsbn: '8935235220423',
      identifierType: 'ean13',
      verificationStatus: 'not_found',
      verificationMessage: 'Valid EAN-13 barcode, no matching record.',
      retrievedAt: '2026-11-24T12:00:00.000Z',
      exactMatchCount: 0,
    });
    expect(completed.tab).toBe('scan');
    expect(completed.verificationStatus).toBe('not_found');
    expect(completed.retrievedAt).toBe('2026-11-24T12:00:00.000Z');
  });
});

describe('Vietnamese Book Barcode Lookup, Distributor Separation, Identity Mismatch Rejection & Honesty', () => {
  it('8935235220423: resolves Giết Con Chim Nhại with Nhà xuất bản Văn Học vs distributor Nhã Nam and persists ean13 cleanly', async () => {
    const htmlSpecs = extractVietnameseBookSpecs(`
      <table>
        <tr><td>Tác giả</td><td>Harper Lee</td></tr>
        <tr><td>Dịch giả</td><td>Huỳnh Kim Oanh, Phạm Viêm Phương</td></tr>
        <tr><td>Nhà xuất bản</td><td>Nhà xuất bản Văn Học</td></tr>
        <tr><td>Nhà phát hành</td><td>Nhã Nam</td></tr>
        <tr><td>Số trang</td><td>416</td></tr>
        <tr><td>Năm xuất bản</td><td>2020</td></tr>
        <tr><td>Mã hàng</td><td>8935235220423</td></tr>
      </table>
    `);
    expect(htmlSpecs.publishers).toEqual(['Nhà xuất bản Văn Học']);
    expect(htmlSpecs.distributor).toBe('Nhã Nam');
    expect(htmlSpecs.identifiers).toContain('8935235220423');

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('adcbook.net.vn/search')) {
        return jsonResponse({ results: [{ url: '/giet-con-chim-nhai-tai-ban' }] });
      }
      if (url.includes('adcbook.net.vn/giet-con-chim-nhai-tai-ban.json')) {
        return jsonResponse({
          id: 901234,
          name: 'Giết Con Chim Nhại (Tái Bản)',
          alias: 'giet-con-chim-nhai-tai-ban',
          vendor: 'Nhã Nam',
          tags: ['tacgia_Harper Lee', 'sotrang_416'],
          variants: [{ sku: '8935235220423', barcode: '8935235220423' }],
          content: '<p>Tác phẩm kinh điển về công lý và lòng nhân ái.</p>',
        });
      }
      if (url.includes('adcbook.net.vn/giet-con-chim-nhai-tai-ban')) {
        return htmlResponse(`
          <html><body>
            <h1>Giết Con Chim Nhại</h1>
            <table>
              <tr><td>Tác giả</td><td>Harper Lee</td></tr>
              <tr><td>Nhà xuất bản</td><td>Nhà xuất bản Văn Học</td></tr>
              <tr><td>Nhà phát hành</td><td>Nhã Nam</td></tr>
              <tr><td>Số trang</td><td>416</td></tr>
            </table>
          </body></html>
        `);
      }
      return htmlResponse('Not found', 404);
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('8935235220423', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [adcbookProvider, nhaNamProvider, openLibraryProvider],
    });

    expect(res.identifierType).toBe('ean13');
    expect(res.verificationStatus).toBe('verified_match');
    expect(res.exactMatchCount).toBe(1);

    const book = res.exactMatches![0];
    expect(book.title).toContain('Giết Con Chim Nhại');
    expect(book.authors).toEqual(['Harper Lee']);
    expect(book.publishers).toEqual(['Nhà xuất bản Văn Học']);
    expect(book.distributor).toBe('Nhã Nam');
    expect(book.ean13).toBe('8935235220423');
    expect(book.isbn13).toBeNull();
    expect(book.isbn10).toBeNull();
    expect(book.identifierType).toBe('ean13');
    expect(book.language).toBe('vi');

    // OpenLibrary does not search non-ISBN GS1 893* codes
    expect(res.providerStatuses.find((s) => s.provider === 'open_library')?.status).toBe('no_match');

    // Persist into Dexie and verify ean13 + distributor without fake ISBN fields
    const bundle = await createBookBundle({
      work: {
        title: book.title,
        authors: book.authors,
        genres: book.genres,
        originalLanguage: 'en',
        metadataSource: book.provider,
      },
      edition: {
        title: book.title,
        publishers: book.publishers,
        distributor: book.distributor,
        language: book.language,
        format: 'paperback',
        pageCount: book.pageCount,
        metadataSource: book.provider,
      },
      isbnInput: book.ean13 ?? undefined,
      createCopy: true,
      copy: {
        ownershipStatus: 'owned',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
      },
    });

    const savedEd = await db.editions.get(bundle.edition.id);
    const savedIsbns = await db.edition_isbns.toArray();
    expect(savedEd?.distributor).toBe('Nhã Nam');
    expect(savedEd?.publishers).toEqual(['Nhà xuất bản Văn Học']);
    expect(savedIsbns).toHaveLength(1);
    expect(savedIsbns[0].ean13).toBe('8935235220423');
    expect(savedIsbns[0].identifierType).toBe('ean13');
    expect(savedIsbns[0].prefixGroup).toBe('other');
    expect(savedIsbns[0].isbn10).toBeNull();
  });

  it('9786043912173: rejects Giết Con Chim Nhại or mismatched-ISBN records into identityMismatches', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('gooda.vn/search')) {
        return jsonResponse({ '555': { url: '/giet-con-chim-nhai-wrong-id' } });
      }
      if (url.includes('gooda.vn/giet-con-chim-nhai-wrong-id.json')) {
        return jsonResponse({
          id: 555,
          name: 'Giết Con Chim Nhại',
          vendor: 'Nhã Nam',
          variants: [{ sku: '8935235220423', barcode: '8935235220423' }],
        });
      }
      if (url.includes('gooda.vn/giet-con-chim-nhai-wrong-id')) {
        return htmlResponse('<html><body><p>ISBN: 8935235220423</p></body></html>');
      }
      if (url.includes('openlibrary.org/search.json')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/OL123W',
              title: 'Mismatched Book Entry',
              author_name: ['Someone Else'],
              isbn: ['9780140449136'],
            },
          ],
        });
      }
      return htmlResponse('Not found', 404);
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9786043912173', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [goodaProvider, openLibraryProvider],
    });

    expect(res.exactMatchCount).toBe(0);
    expect(res.exactMatches).toHaveLength(0);
    expect(res.candidates).toHaveLength(0);
    expect(res.verificationStatus).toBe('identity_mismatch');
    expect(res.identityMismatches?.length).toBeGreaterThanOrEqual(1);
    expect(res.identityMismatches?.[0].mismatchReason).toContain('does not match requested 9786043912173');
  });

  it('enforces exact-identifier checking across NDL, OpenBD, BnF, and CrossRef (never trusts query blindly)', async () => {
    const ndlWrongXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel><item>
          <title>Wrong NDL Volume</title>
          <dc:identifier>9784088820224</dc:identifier>
        </item></channel>
      </rss>`;
    const bnfWrongXml = `<?xml version="1.0" encoding="UTF-8"?>
      <srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <srw:records><srw:record><srw:recordData>
          <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
            <dc:title>Wrong BnF Book</dc:title>
            <dc:identifier>ISBN 978-2-07-061275-8</dc:identifier>
          </oai_dc:dc>
        </srw:recordData></srw:record></srw:records>
      </srw:searchRetrieveResponse>`;

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('ndlsearch.ndl.go.jp')) return htmlResponse(ndlWrongXml);
      if (url.includes('api.openbd.jp')) {
        return jsonResponse([
          { summary: { isbn: '9784088820217', title: 'Wrong OpenBD Book', author: 'A' } },
        ]);
      }
      if (url.includes('catalogue.bnf.fr')) return htmlResponse(bnfWrongXml);
      if (url.includes('api.crossref.org')) {
        return jsonResponse({
          message: {
            items: [{ DOI: '10.1/wrong', ISBN: ['9780140449136'], title: ['Wrong CrossRef Book'] }],
          },
        });
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9784088820200', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      forceAllProviders: true,
      adapters: [ndlJapanProvider, openBdProvider, bnfFranceProvider, crossrefProvider],
    });

    expect(res.exactMatchCount).toBe(0);
    expect(res.candidates).toHaveLength(0);
    expect(res.verificationStatus).toBe('identity_mismatch');
    expect(res.identityMismatches).toHaveLength(4);
  });

  it('9786326216318: validates 978-632 prefix honestly as not_found without fabricating metadata', async () => {
    const emptyFetch = vi.fn(async () => jsonResponse({ docs: [], results: [] })) as unknown as typeof fetch;
    const res = await lookupMetadataWithReportByIsbn('9786326216318', {
      fetchFn: emptyFetch,
      preferEdgeFunction: false,
      adapters: [goodaProvider, hikaruProvider, openLibraryProvider],
    });

    expect(res.identifierType).toBe('isbn13');
    expect(res.normalizedIdentifier).toBe('9786326216318');
    expect(res.exactMatchCount).toBe(0);
    expect(res.candidates).toHaveLength(0);
    expect(res.verificationStatus).toBe('not_found');
    expect(res.verificationMessage).toContain('ISBN13');
    expect(res.retrievedAt).toBeTruthy();
  });

  it('rejects Cloudflare/bot HTML challenges, HTTP 429 rate-limits, and malformed JSON cleanly', async () => {
    const trickyFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('gooda.vn')) {
        return htmlResponse('<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>', 200);
      }
      if (url.includes('adcbook.net.vn/search')) {
        return jsonResponse({ results: [{ url: '/bad-json' }] });
      }
      if (url.includes('adcbook.net.vn/bad-json.json')) {
        return new Response('<html>Oops not json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
      if (url.includes('adcbook.net.vn/bad-json')) {
        return htmlResponse('Not found', 404);
      }
      if (url.includes('api.crossref.org')) {
        return jsonResponse({ error: 'slow down' }, 429);
      }
      if (url.includes('openlibrary.org')) {
        return jsonResponse({}, 200);
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const res = await executeServerBookLookup({
      isbn: '9786326216318',
      fetchFn: trickyFetch,
      adapters: [goodaProvider, adcbookProvider, crossrefProvider, openLibraryProvider],
    });

    const byId = Object.fromEntries(res.providerStatuses.map((s) => [s.provider, s.status]));
    expect(byId.gooda).toBe('access_denied');
    expect(byId.adcbook).toBe('upstream_error');
    expect(byId.crossref).toBe('upstream_error');
    expect(byId.open_library).toBe('no_match');
    expect(res.verificationStatus).toBe('valid_identifier_unconfirmed');
  });

  it('short-circuits invalid identifiers before making any network requests', async () => {
    const spyFetch = vi.fn(async () => {
      throw new Error('Should not have called fetch for invalid identifier!');
    }) as unknown as typeof fetch;

    const res = await executeServerBookLookup({
      isbn: '9786326216319',
      fetchFn: spyFetch,
    });

    expect(spyFetch).not.toHaveBeenCalled();
    expect(res.verificationStatus).toBe('invalid_identifier');
    expect(res.identifierType).toBe('invalid');
    expect(res.candidates).toHaveLength(0);
  });
});
