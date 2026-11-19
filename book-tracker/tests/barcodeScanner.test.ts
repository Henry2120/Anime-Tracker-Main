import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { prepareZXingModule as prepareReaderModule } from 'zxing-wasm/reader';
import {
  decodeBarcodeFromRawImageData,
  decodeBarcodeFromRawImageDataDetailed,
  detectBarcodeFromImageSourceDetailed,
  evaluateBarcodeDetections,
  extractValidIsbnFromBarcodeValues,
  mapCameraErrorMessage,
} from '../src/services/scannerAndOcr';

// Minimal ImageData polyfill for Node Vitest environment
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
  opts?: { scaleX?: number; scaleY?: number; quietZone?: number; fg?: number; bg?: number }
): ImageData {
  const scaleX = opts?.scaleX ?? 3;
  const scaleY = opts?.scaleY ?? 2;
  const quiet = opts?.quietZone ?? 24;
  const fg = opts?.fg ?? 0;
  const bg = opts?.bg ?? 255;

  const width = matW * scaleX + quiet * 2;
  const height = matH * scaleY + quiet * 2;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bg;
    rgba[i + 1] = bg;
    rgba[i + 2] = bg;
    rgba[i + 3] = 255;
  }

  for (let my = 0; my < matH; my++) {
    for (let mx = 0; mx < matW; mx++) {
      const bit = matrix[my * matW + mx];
      // zxing BarcodeSymbol uses 0 for black bar, 255 for white space
      if (bit !== 0) continue;
      for (let sy = 0; sy < scaleY; sy++) {
        for (let sx = 0; sx < scaleX; sx++) {
          const px = quiet + mx * scaleX + sx;
          const py = quiet + my * scaleY + sy;
          const idx = (py * width + px) * 4;
          rgba[idx] = fg;
          rgba[idx + 1] = fg;
          rgba[idx + 2] = fg;
          rgba[idx + 3] = 255;
        }
      }
    }
  }

  return new ImageData(rgba, width, height);
}

/**
 * Composites a generated barcode bitmap onto a cluttered full-frame book cover/back-cover canvas
 * at a specified (x, y) position so multi-region, upscaling, and quiet-zone padding are genuinely exercised.
 */
function buildCompositeCoverFrame(
  barcode: ImageData,
  frameW: number,
  frameH: number,
  placeX: number,
  placeY: number
): ImageData {
  const data = new Uint8ClampedArray(frameW * frameH * 4);
  // Textured pastel/noisy background simulating printed back-cover clutter
  for (let y = 0; y < frameH; y++) {
    for (let x = 0; x < frameW; x++) {
      const idx = (y * frameW + x) * 4;
      const stripe = ((x + y) % 19 === 0) ? 160 : 230;
      const block = (x > 30 && x < frameW - 30 && y > 30 && y < 120 && (x % 7 < 3)) ? 80 : stripe;
      data[idx] = block;
      data[idx + 1] = Math.min(255, block + 6);
      data[idx + 2] = Math.max(0, block - 10);
      data[idx + 3] = 255;
    }
  }

  // Blit barcode at target location
  for (let by = 0; by < barcode.height; by++) {
    const dy = placeY + by;
    if (dy < 0 || dy >= frameH) continue;
    for (let bx = 0; bx < barcode.width; bx++) {
      const dx = placeX + bx;
      if (dx < 0 || dx >= frameW) continue;
      const sIdx = (by * barcode.width + bx) * 4;
      const dIdx = (dy * frameW + dx) * 4;
      data[dIdx] = barcode.data[sIdx];
      data[dIdx + 1] = barcode.data[sIdx + 1];
      data[dIdx + 2] = barcode.data[sIdx + 2];
      data[dIdx + 3] = 255;
    }
  }

  return new ImageData(data, frameW, frameH);
}

function rotateImageData90(src: ImageData): ImageData {
  const dst = new Uint8ClampedArray(src.data.length);
  const newW = src.height;
  const newH = src.width;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const sIdx = (y * src.width + x) * 4;
      const nx = src.height - 1 - y;
      const ny = x;
      const dIdx = (ny * newW + nx) * 4;
      dst[dIdx] = src.data[sIdx];
      dst[dIdx + 1] = src.data[sIdx + 1];
      dst[dIdx + 2] = src.data[sIdx + 2];
      dst[dIdx + 3] = src.data[sIdx + 3];
    }
  }
  return new ImageData(dst, newW, newH);
}

describe('Barcode Scanner & Real EAN-13 Decoding Pipeline', () => {
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

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).HTMLCanvasElement;
  });

  it('prioritizes valid EAN-13, rejects invalid check digits, and explains checksum errors', () => {
    expect(
      extractValidIsbnFromBarcodeValues([
        { rawValue: '1234567890123', format: 'ean_13' },
        { rawValue: '9786042243568', format: 'ean_13' },
      ])
    ).toBe('9786042243568');

    expect(
      extractValidIsbnFromBarcodeValues([{ rawValue: '9791090636071', format: 'ean_13' }])
    ).toBe('9791090636071');

    const bad = evaluateBarcodeDetections([{ rawValue: '9786044777980', format: 'EAN-13' }]);
    expect(bad.isValidIsbn).toBe(false);
    expect(bad.validIsbn13).toBeNull();
    expect(bad.rawValue).toBe('9786044777980');
    expect(bad.checksumError).toContain('expected 6');
  });

  it('decodes real generated EAN-13 barcodes for all three mandatory test ISBNs across layout & lighting challenges', async () => {
    const isbns = ['9786042243568', '9786043590296', '9786044777986'];

    for (const isbn of isbns) {
      const generated = await writeBarcode(isbn, {
        format: 'EAN-13',
        withQuietZones: true,
      });
      expect(generated.error).toBe('');
      const { data, width, height } = generated.symbol;

      // 1. Crisp standard full-frame barcode
      const normalImg = buildRgbaBarcodeImageData(data, width, height);
      const normalRes = await decodeBarcodeFromRawImageDataDetailed(normalImg);
      expect(normalRes.validIsbn13).toBe(isbn);
      expect(normalRes.decoderUsed).toBe('zxing');

      // 2. Bottom back-cover placement on textured cluttered frame (outside central reticle)
      const smallBackBarcode = buildRgbaBarcodeImageData(data, width, height, { scaleX: 2, scaleY: 2, quietZone: 12 });
      const bottomFrame = buildCompositeCoverFrame(smallBackBarcode, 960, 720, 620, 540);
      const bottomRes = await decodeBarcodeFromRawImageDataDetailed(bottomFrame);
      expect(bottomRes.validIsbn13).toBe(isbn);

      // 3. Zero-quiet-zone near-edge barcode (requires padding helper)
      const noQuiet = buildRgbaBarcodeImageData(data, width, height, { scaleX: 2, scaleY: 2, quietZone: 0 });
      expect(await decodeBarcodeFromRawImageData(noQuiet)).toBe(isbn);

      // 4. Low-resolution narrow-bar barcode (scaleX=1 -> upscaling helper)
      const tiny = buildRgbaBarcodeImageData(data, width, height, { scaleX: 1, scaleY: 1, quietZone: 6 });
      expect(await decodeBarcodeFromRawImageData(tiny)).toBe(isbn);
    }
  });

  it('decodes rotated, low-contrast, and inverted barcodes reliably for 9786044777986', async () => {
    const generated = await writeBarcode('9786044777986', {
      format: 'EAN-13',
      withQuietZones: true,
    });
    const { data, width, height } = generated.symbol;
    const base = buildRgbaBarcodeImageData(data, width, height);

    // Rotated 90 degrees vertical
    const rotated = rotateImageData90(base);
    expect(await decodeBarcodeFromRawImageData(rotated)).toBe('9786044777986');

    // Low contrast dark gray on mid-gray
    const lowContrast = buildRgbaBarcodeImageData(data, width, height, { fg: 90, bg: 185 });
    expect(await decodeBarcodeFromRawImageData(lowContrast)).toBe('9786044777986');

    // Inverted dark-mode barcode
    const inverted = buildRgbaBarcodeImageData(data, width, height, { fg: 245, bg: 20 });
    expect(await decodeBarcodeFromRawImageData(inverted)).toBe('9786044777986');
  });

  it('uses Native BarcodeDetector fast-path on canvas when browser supports it (mocked)', async () => {
    class MockCanvas {}
    class MockBarcodeDetector {
      async detect() {
        return [{ rawValue: '9786044777986', format: 'ean_13' }];
      }
    }
    (globalThis as Record<string, unknown>).HTMLCanvasElement = MockCanvas;
    (globalThis as Record<string, unknown>).window = {
      BarcodeDetector: MockBarcodeDetector,
    };

    const canvas = new MockCanvas() as unknown as HTMLCanvasElement;
    const res = await detectBarcodeFromImageSourceDetailed(canvas);
    expect(res.validIsbn13).toBe('9786044777986');
    expect(res.decoderUsed).toBe('native');
    expect(res.nativeSupported).toBe(true);
  });

  it('maps camera permission and device errors cleanly', () => {
    expect(mapCameraErrorMessage({ name: 'NotAllowedError' })).toContain('permission was denied');
    expect(mapCameraErrorMessage({ name: 'NotFoundError' })).toContain('No camera');
    expect(mapCameraErrorMessage({ name: 'NotReadableError' })).toContain('in use');
  });
});
