import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule as prepareReaderModule } from 'zxing-wasm/reader';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import type { EnrichedBookRecord } from '../src/hooks/useLibraryData';
import {
  decodeAllBarcodesFromRawImageDataDetailed,
  evaluateMultiBarcodeDetections,
} from '../src/services/scannerAndOcr';
import {
  applyBatchLookupFailure,
  applyBatchLookupSuccess,
  canRegisterBatchItem,
  createBatchQueueItem,
  findExistingBookByIdentifier,
  parseBulkIdentifierText,
  runBoundedConcurrency,
  shouldSuppressConsecutiveFrame,
} from '../src/utils/batchScan';
import { getDeterministicBookSpineStyle, hashStringDeterministic } from '../src/utils/bookSpine';

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
  opts?: { scaleX?: number; scaleY?: number; quietZone?: number }
): ImageData {
  const scaleX = opts?.scaleX ?? 3;
  const scaleY = opts?.scaleY ?? 2;
  const quiet = opts?.quietZone ?? 20;

  const width = matW * scaleX + quiet * 2;
  const height = matH * scaleY + quiet * 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(255);

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

function buildMultiBarcodeCompositeFrame(barcodes: Array<{ img: ImageData; x: number; y: number }>, frameW: number, frameH: number): ImageData {
  const data = new Uint8ClampedArray(frameW * frameH * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 242;
    data[i + 1] = 240;
    data[i + 2] = 235;
    data[i + 3] = 255;
  }

  for (const item of barcodes) {
    for (let by = 0; by < item.img.height; by++) {
      const dy = item.y + by;
      if (dy < 0 || dy >= frameH) continue;
      for (let bx = 0; bx < item.img.width; bx++) {
        const dx = item.x + bx;
        if (dx < 0 || dx >= frameW) continue;
        const sIdx = (by * item.img.width + bx) * 4;
        const dIdx = (dy * frameW + dx) * 4;
        data[dIdx] = item.img.data[sIdx];
        data[dIdx + 1] = item.img.data[sIdx + 1];
        data[dIdx + 2] = item.img.data[sIdx + 2];
        data[dIdx + 3] = 255;
      }
    }
  }
  return new ImageData(data, frameW, frameH);
}

function makeMockExistingBook(workId: string, title: string, ids: { isbn13?: string; isbn10?: string; ean13?: string }): EnrichedBookRecord {
  const normalizedEan = ids.ean13 ?? ids.isbn13 ?? '9780140449136';
  const prefixGroup: '978' | '979' | 'other' = normalizedEan.startsWith('978')
    ? '978'
    : normalizedEan.startsWith('979')
      ? '979'
      : 'other';

  return {
    work: {
      id: workId,
      title,
      authors: ['Test Author'],
      illustrators: [],
      genres: [],
      tags: [],
      metadataSource: 'manual',
      metadataVerified: true,
      userVerifiedFields: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
    },
    primaryEdition: {
      id: `ed-${workId}`,
      workId,
      title,
      translators: [],
      illustrators: [],
      publishers: [],
      language: 'vi',
      format: 'paperback',
      metadataSource: 'manual',
      metadataVerified: true,
      userVerifiedFields: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
    },
    editions: [],
    isbns: [
      {
        id: `isbn-${workId}`,
        editionId: `ed-${workId}`,
        isbn13: ids.isbn13 ?? ids.ean13 ?? '9780140449136',
        isbn10: ids.isbn10 ?? null,
        ean13: ids.ean13 ?? null,
        identifierType: ids.ean13?.startsWith('893') ? 'ean13' : 'isbn13',
        prefixGroup,
        isPrimary: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
        version: 1,
      },
    ],
    copies: [],
    ownedCopiesCount: 1,
    wishlistCopiesCount: 0,
    cycles: [],
    activeCycle: undefined,
    reviews: [],
    journalEntries: [],
    shelfIds: [],
    latestRating: null,
  };
}

describe('Batch Barcode Scanner & Midnight Archive Spine Engine', () => {
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

  it('evaluates multiple barcodes independently, preserving valid ISBNs + 893 EAN-13 alongside invalid codes and deduplicating', () => {
    const evalRes = evaluateMultiBarcodeDetections([
      { rawValue: '9780140449136', format: 'EAN-13', region: 'top-left' },
      { rawValue: '8935082600287', format: 'EAN-13', region: 'top-center' },
      { rawValue: '0140449132', format: 'CODE-128', region: 'mid-right' }, // duplicates 9780140449136 once normalized
      { rawValue: '8935082600289', format: 'EAN-13', region: 'bottom-left' }, // invalid check digit
      { rawValue: '9786042243568', format: 'EAN-13', region: 'bottom-right' },
    ]);

    expect(evalRes.validCount).toBe(3);
    expect(evalRes.invalidCount).toBe(1);
    expect(evalRes.duplicateDroppedCount).toBe(1);
    expect(evalRes.validItems.map((v) => v.normalizedId)).toEqual([
      '9780140449136',
      '8935082600287',
      '9786042243568',
    ]);
    expect(evalRes.validItems[1].identifierType).toBe('ean13');
    expect(evalRes.validItems[1].isIsbn).toBe(false);
    expect(evalRes.invalidItems[0].rawValue).toBe('8935082600289');
    expect(evalRes.invalidItems[0].checksumError).toContain('Invalid EAN-13 check digit');
  });

  it('decodes multiple real side-by-side EAN-13 barcodes from a single composite image without dropping the 893 code', async () => {
    const leftBarcode = await writeBarcode('9780140449136', { format: 'EAN-13', withQuietZones: true });
    const rightBarcode = await writeBarcode('8935082600287', { format: 'EAN-13', withQuietZones: true });
    expect(leftBarcode.error).toBe('');
    expect(rightBarcode.error).toBe('');

    const leftImg = buildRgbaBarcodeImageData(leftBarcode.symbol.data, leftBarcode.symbol.width, leftBarcode.symbol.height, { scaleX: 2, scaleY: 2, quietZone: 14 });
    const rightImg = buildRgbaBarcodeImageData(rightBarcode.symbol.data, rightBarcode.symbol.width, rightBarcode.symbol.height, { scaleX: 2, scaleY: 2, quietZone: 14 });

    const frame = buildMultiBarcodeCompositeFrame(
      [
        { img: leftImg, x: 40, y: 80 },
        { img: rightImg, x: 520, y: 360 },
      ],
      960,
      640
    );

    const decoded = await decodeAllBarcodesFromRawImageDataDetailed(frame);
    const ids = decoded.validItems.map((v) => v.normalizedId);
    expect(ids).toContain('9780140449136');
    expect(ids).toContain('8935082600287');
    expect(decoded.validCount).toBe(2);
  });

  it('parses bulk ISBN/EAN text cleanly across newlines, commas, and semicolons while preserving leading zeros and rejecting corrupted checksums', () => {
    const bulk = parseBulkIdentifierText(
      '0140449132\n8935082600287, 978-604-2-24356-8; 9780140449139\n8935082600287'
    );

    expect(bulk.totalTokens).toBe(5);
    expect(bulk.validCount).toBe(4);
    expect(bulk.invalidCount).toBe(1);
    expect(bulk.duplicateCount).toBe(1);

    // Leading-zero ISBN-10 converted accurately without stripping zero
    expect(bulk.entries[0].isbn10).toBe('0140449132');
    expect(bulk.entries[0].normalizedId).toBe('9780140449136');
    expect(bulk.entries[0].identifierType).toBe('isbn10');

    // Vietnamese 893 EAN-13 kept intact as ean13
    expect(bulk.entries[1].normalizedId).toBe('8935082600287');
    expect(bulk.entries[1].identifierType).toBe('ean13');
    expect(bulk.entries[1].isIsbn).toBe(false);

    // Corrupted check digit flagged without mutating
    expect(bulk.entries[3].isValid).toBe(false);
    expect(bulk.entries[3].rawToken).toBe('9780140449139');
    expect(bulk.entries[3].normalizedId).toBeNull();

    // Second 8935082600287 flagged as duplicate in input
    expect(bulk.entries[4].isDuplicateInInput).toBe(true);
  });

  it('manages queue deduplication, consecutive-frame debounce, bounded lookup concurrency, and Vietnamese 893 manual fallback', async () => {
    const existingBooks = [
      makeMockExistingBook('w-existing', 'Existing Chronicle', { isbn13: '9786042243568', isbn10: '604224356X' }),
    ];

    // Collection duplicate detection matches existing work and defaults to add_copy
    expect(findExistingBookByIdentifier('9786042243568', existingBooks)?.workId).toBe('w-existing');
    const dupItem = createBatchQueueItem({
      rawInput: '9786042243568',
      source: 'live_camera',
      defaultCurrency: 'VND',
      existingQueue: [],
      existingBooks,
    });
    expect(dupItem.status).toBe('duplicate');
    expect(dupItem.duplicateInCollection?.workId).toBe('w-existing');
    expect(dupItem.duplicateAction).toBe('add_copy');
    expect(canRegisterBatchItem(dupItem)).toBe(true);

    // Intra-batch duplicate defaults to skip & unselected
    const first893 = createBatchQueueItem({
      rawInput: '8935082600287',
      source: 'multi_photo',
      defaultCurrency: 'VND',
      existingQueue: [dupItem],
      existingBooks,
    });
    const second893 = createBatchQueueItem({
      rawInput: '8935082600287',
      source: 'bulk_text',
      defaultCurrency: 'VND',
      existingQueue: [dupItem, first893],
      existingBooks,
    });
    expect(second893.duplicateInBatch).toBe(true);
    expect(second893.duplicateAction).toBe('skip');
    expect(second893.selected).toBe(false);
    expect(canRegisterBatchItem(second893)).toBe(false);

    // Vietnamese 893 no_match preserves identifier and allows manual metadata registration
    const unresolved893 = applyBatchLookupSuccess(first893, {
      candidates: [],
      providerStatuses: [],
      verificationStatus: 'not_found',
      verificationMessage: 'No online catalog match',
    });
    expect(unresolved893.status).toBe('no_match');
    expect(unresolved893.normalizedId).toBe('8935082600287');
    expect(unresolved893.identifierType).toBe('ean13');
    expect(canRegisterBatchItem(unresolved893)).toBe(false);
    const manuallyCompleted = {
      ...unresolved893,
      draft: { ...unresolved893.draft, title: 'Dế Mèn Phiêu Lưu Ký' },
    };
    expect(canRegisterBatchItem(manuallyCompleted)).toBe(true);

    const errored = applyBatchLookupFailure(first893, 'Offline');
    expect(errored.status).toBe('error');
    expect(errored.lookupError).toBe('Offline');

    // Consecutive-frame debounce suppresses same held code within cooldown, allows different code or after cooldown
    const recentFrames = new Map<string, number>();
    expect(shouldSuppressConsecutiveFrame(recentFrames, '8935082600287', 1000, { lastBarcodeId: null })).toBe(false);
    expect(shouldSuppressConsecutiveFrame(recentFrames, '8935082600287', 1500, { lastBarcodeId: '8935082600287', cooldownMs: 2000 })).toBe(true);
    expect(shouldSuppressConsecutiveFrame(recentFrames, '9780140449136', 1600, { lastBarcodeId: '8935082600287', cooldownMs: 2000 })).toBe(false);
    expect(shouldSuppressConsecutiveFrame(recentFrames, '8935082600287', 5000, { lastBarcodeId: '9780140449136', cooldownMs: 2000 })).toBe(false);

    // Bounded concurrency pool never exceeds limit
    let active = 0;
    let peak = 0;
    const workItems = [1, 2, 3, 4, 5, 6, 7];
    await runBoundedConcurrency(workItems, 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('computes deterministic leather book spines per Work ID without random flicker', () => {
    expect(hashStringDeterministic('work-alpha')).toBe(hashStringDeterministic('work-alpha'));

    const spineA1 = getDeterministicBookSpineStyle({
      workId: 'work-alpha',
      pageCount: 380,
      format: 'hardcover',
    });
    const spineA2 = getDeterministicBookSpineStyle({
      workId: 'work-alpha',
      pageCount: 380,
      format: 'hardcover',
    });
    const spineBunko = getDeterministicBookSpineStyle({
      workId: 'work-alpha',
      pageCount: 160,
      format: 'bunko',
    });

    expect(spineA1).toEqual(spineA2);
    expect(spineA1.heightPx).toBeGreaterThan(spineBunko.heightPx);
    expect(spineA1.widthPx).toBeGreaterThan(spineBunko.widthPx);
    expect(spineA1.heightPx).toBeGreaterThanOrEqual(168);
    expect(spineA1.heightPx).toBeLessThanOrEqual(228);
  });
});
