import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { prepareZXingModule as prepareReaderModule } from 'zxing-wasm/reader';
import {
  decodeBarcodeFromRawImageData,
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

describe('Barcode Scanner & EAN-13 Decoding Pipeline', () => {
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

  it('prioritizes valid EAN-13 and rejects invalid check digits', () => {
    expect(
      extractValidIsbnFromBarcodeValues([
        { rawValue: '1234567890123', format: 'ean_13' }, // invalid ISBN
        { rawValue: '9786042243568', format: 'ean_13' },
      ])
    ).toBe('9786042243568');

    expect(
      extractValidIsbnFromBarcodeValues([{ rawValue: '9791090636071', format: 'ean_13' }])
    ).toBe('9791090636071');

    expect(
      extractValidIsbnFromBarcodeValues([{ rawValue: '9786042243560', format: 'ean_13' }])
    ).toBeNull();
  });

  it('decodes generated EAN-13 barcode for 9786042243568 across normal, rotated, low-contrast, and inverted images', async () => {
    const generated = await writeBarcode('9786042243568', {
      format: 'EAN-13',
      withQuietZones: true,
    });
    expect(generated.error).toBe('');
    const { data, width, height } = generated.symbol;

    // 1. Standard crisp EAN-13
    const normalImg = buildRgbaBarcodeImageData(data, width, height);
    expect(await decodeBarcodeFromRawImageData(normalImg)).toBe('9786042243568');

    // 2. Rotated 90 degrees
    const rotatedImg = rotateImageData90(normalImg);
    expect(await decodeBarcodeFromRawImageData(rotatedImg)).toBe('9786042243568');

    // 3. Low-contrast dimly-lit image (dark gray 90 on light gray 185)
    const lowContrastImg = buildRgbaBarcodeImageData(data, width, height, { fg: 90, bg: 185 });
    expect(await decodeBarcodeFromRawImageData(lowContrastImg)).toBe('9786042243568');

    // 4. Inverted white bars on dark background
    const invertedImg = buildRgbaBarcodeImageData(data, width, height, { fg: 245, bg: 20 });
    expect(await decodeBarcodeFromRawImageData(invertedImg)).toBe('9786042243568');
  });

  it('maps camera permission and device errors cleanly', () => {
    expect(mapCameraErrorMessage({ name: 'NotAllowedError' })).toContain('permission was denied');
    expect(mapCameraErrorMessage({ name: 'NotFoundError' })).toContain('No camera');
    expect(mapCameraErrorMessage({ name: 'NotReadableError' })).toContain('in use');
  });
});
