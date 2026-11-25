import { getSupabaseClient } from '../lib/supabase';
import type { BookIdentifierType, MetadataCandidate } from '../types/domain';
import {
  computeEan13CheckDigit,
  computeIsbn10CheckDigit,
  extractBookIdentifiersFromText,
  parseBookIdentifier,
  stripIsbn,
} from '../utils/isbn';

export interface OcrExtractionResult {
  rawText: string;
  detectedIsbns: string[];
  candidateTitle?: string;
  candidateAuthor?: string;
}

export type ScannerUiState =
  | 'idle'
  | 'initializing'
  | 'searching'
  | 'decoded'
  | 'decoded_not_found'
  | 'no_barcode_detected'
  | 'permission_error';

export type ZxingModuleStatus = 'uninitialized' | 'loading' | 'ready' | 'error';

export interface BarcodeEvaluationResult {
  validIsbn13: string | null;
  validIdentifier?: string | null;
  ean13?: string | null;
  isbn10: string | null;
  identifierType?: BookIdentifierType;
  rawValue: string | null;
  format: string | null;
  isValidIsbn: boolean;
  isValidIdentifier?: boolean;
  checksumError: string | null;
}

export interface BarcodeScanAttemptResult extends BarcodeEvaluationResult {
  decoderUsed: 'native' | 'zxing' | null;
  matchedRegion: string | null;
  regionsExamined: string[];
  nativeSupported: boolean;
  zxingStatus: ZxingModuleStatus;
  zxingError: string | null;
  durationMs: number;
  error: string | null;
}

export interface ScannerCapabilities {
  nativeSupported: boolean;
  zxingStatus: ZxingModuleStatus;
  zxingError: string | null;
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string; format?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): NativeBarcodeDetector;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

let zxingModulePromise: Promise<typeof import('zxing-wasm/reader')> | null = null;
let zxingPrepared = false;
let zxingStatus: ZxingModuleStatus = 'uninitialized';
let zxingLastError: string | null = null;

export function isNativeBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function';
}

export function getScannerCapabilities(): ScannerCapabilities {
  return {
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
  };
}

async function getZxingReader() {
  if (!zxingModulePromise) {
    zxingStatus = 'loading';
    zxingLastError = null;
    zxingModulePromise = import('zxing-wasm/reader');
  }
  try {
    const mod = await zxingModulePromise;
    if (!zxingPrepared) {
      zxingPrepared = true;
      const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
      if (isBrowser) {
        const base = (import.meta.env?.BASE_URL as string | undefined) || '/';
        const normalizedBase = base.endsWith('/') ? base : `${base}/`;
        await mod.prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) => {
              if (path.endsWith('.wasm')) {
                return `${normalizedBase}wasm/${path}`;
              }
              return `${prefix}${path}`;
            },
          },
          fireImmediately: true,
        });
      }
    }
    zxingStatus = 'ready';
    zxingLastError = null;
    return mod;
  } catch (err) {
    zxingStatus = 'error';
    zxingLastError = err instanceof Error ? err.message : 'Failed to initialize ZXing WASM decoder';
    zxingPrepared = false;
    zxingModulePromise = null;
    throw err;
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function explainInvalidIsbn(raw: string, format: string | null): string {
  const clean = stripIsbn(raw);
  if (/^\d{13}$/.test(clean)) {
    const expected = computeEan13CheckDigit(clean.slice(0, 12));
    if (clean[12] !== expected) {
      const label = clean.startsWith('978') || clean.startsWith('979') ? 'ISBN-13' : 'EAN-13';
      return `Invalid ${label} check digit in "${clean}" (got ${clean[12]}, expected ${expected})`;
    }
    return `Decoded ${format || 'EAN-13'} "${clean}" check digit is valid`;
  }
  if (/^\d{9}[\dX]$/.test(clean)) {
    const expected = computeIsbn10CheckDigit(clean.slice(0, 9));
    return `Invalid ISBN-10 check digit in "${clean}" (got ${clean[9]}, expected ${expected})`;
  }
  return `Decoded ${format || 'barcode'} "${raw}" is not a valid 10- or 13-digit ISBN/EAN-13`;
}

/**
 * Inspects decoded barcode candidates, prioritizes EAN-13 / ISBN-13 / ISBN-10 / GS1 EAN-13,
 * validates check digits strictly without digit mutation, and preserves diagnostics.
 */
export function evaluateBarcodeDetections(
  entries: Array<{ rawValue?: string; text?: string; format?: string }>
): BarcodeEvaluationResult {
  const sorted = [...entries].sort((a, b) => {
    const aFmt = (a.format ?? '').toLowerCase();
    const bFmt = (b.format ?? '').toLowerCase();
    const aScore = aFmt.includes('13') ? 3 : aFmt.includes('upc') ? 2 : aFmt.includes('128') ? 1 : 0;
    const bScore = bFmt.includes('13') ? 3 : bFmt.includes('upc') ? 2 : bFmt.includes('128') ? 1 : 0;
    return bScore - aScore;
  });

  let fallbackRaw: string | null = null;
  let fallbackFmt: string | null = null;
  let firstValidEanEntry: {
    parsed: ReturnType<typeof parseBookIdentifier>;
    raw: string;
    fmt: string | null;
  } | null = null;

  for (const item of sorted) {
    const raw = (item.rawValue ?? item.text ?? '').trim();
    if (!raw) continue;
    const fmt = item.format?.trim() || null;
    if (!fallbackRaw) {
      fallbackRaw = raw;
      fallbackFmt = fmt;
    }
    const parsed = parseBookIdentifier(raw);
    if (parsed.isValid && parsed.isIsbn && parsed.isbn13) {
      return {
        validIsbn13: parsed.isbn13,
        validIdentifier: parsed.normalizedId,
        ean13: parsed.ean13,
        isbn10: parsed.isbn10,
        identifierType: parsed.identifierType,
        rawValue: raw,
        format: fmt || 'EAN-13',
        isValidIsbn: true,
        isValidIdentifier: true,
        checksumError: null,
      };
    }
    if (parsed.isValid && !firstValidEanEntry) {
      firstValidEanEntry = { parsed, raw, fmt };
    }
  }

  if (firstValidEanEntry) {
    const { parsed, raw, fmt } = firstValidEanEntry;
    return {
      validIsbn13: null,
      validIdentifier: parsed.normalizedId,
      ean13: parsed.ean13,
      isbn10: null,
      identifierType: parsed.identifierType,
      rawValue: raw,
      format: fmt || 'EAN-13',
      isValidIsbn: false,
      isValidIdentifier: true,
      checksumError: null,
    };
  }

  return {
    validIsbn13: null,
    validIdentifier: null,
    ean13: null,
    isbn10: null,
    identifierType: 'invalid',
    rawValue: fallbackRaw,
    format: fallbackFmt,
    isValidIsbn: false,
    isValidIdentifier: false,
    checksumError: fallbackRaw ? explainInvalidIsbn(fallbackRaw, fallbackFmt) : null,
  };
}

export interface MultiBarcodeDetectedItem {
  rawValue: string;
  normalizedId: string | null;
  identifierType: BookIdentifierType;
  isIsbn: boolean;
  isbn13: string | null;
  isbn10: string | null;
  ean13: string | null;
  format: string | null;
  isValid: boolean;
  checksumError: string | null;
  region?: string | null;
}

export interface MultiBarcodeEvaluationResult {
  allItems: MultiBarcodeDetectedItem[];
  validItems: MultiBarcodeDetectedItem[];
  invalidItems: MultiBarcodeDetectedItem[];
  rawCount: number;
  validCount: number;
  invalidCount: number;
  duplicateDroppedCount: number;
}

export interface MultiBarcodeScanAttemptResult extends MultiBarcodeEvaluationResult {
  decodersUsed: Array<'native' | 'zxing'>;
  regionsExamined: string[];
  nativeSupported: boolean;
  zxingStatus: ZxingModuleStatus;
  zxingError: string | null;
  durationMs: number;
  error: string | null;
  blurryGuidance: string | null;
}

/**
 * Evaluates every decoded barcode symbol independently without stopping after the first match.
 * - Preserves valid ISBN-10, ISBN-13 (978/979), and GS1 EAN-13 (e.g. 893... retail barcodes)
 * - Reports invalid checksums/non-book symbols separately without discarding valid siblings
 * - Deduplicates repeated detections within the same frame/image
 */
export function evaluateMultiBarcodeDetections(
  entries: Array<{ rawValue?: string; text?: string; format?: string; region?: string | null }>
): MultiBarcodeEvaluationResult {
  const allItems: MultiBarcodeDetectedItem[] = [];
  const seenKeys = new Set<string>();
  let duplicateDroppedCount = 0;

  for (const item of entries) {
    const raw = (item.rawValue ?? item.text ?? '').trim();
    if (!raw) continue;
    const fmt = item.format?.trim() || null;
    const parsed = parseBookIdentifier(raw);

    const dedupeKey = parsed.isValid && parsed.normalizedId
      ? `valid:${parsed.normalizedId}`
      : `invalid:${stripIsbn(raw) || raw}`;

    if (seenKeys.has(dedupeKey)) {
      duplicateDroppedCount++;
      continue;
    }
    seenKeys.add(dedupeKey);

    if (parsed.isValid && parsed.normalizedId) {
      allItems.push({
        rawValue: raw,
        normalizedId: parsed.normalizedId,
        identifierType: parsed.identifierType,
        isIsbn: parsed.isIsbn,
        isbn13: parsed.isbn13,
        isbn10: parsed.isbn10,
        ean13: parsed.ean13,
        format: fmt || 'EAN-13',
        isValid: true,
        checksumError: null,
        region: item.region ?? null,
      });
    } else {
      allItems.push({
        rawValue: raw,
        normalizedId: null,
        identifierType: 'invalid',
        isIsbn: false,
        isbn13: null,
        isbn10: null,
        ean13: null,
        format: fmt,
        isValid: false,
        checksumError: explainInvalidIsbn(raw, fmt),
        region: item.region ?? null,
      });
    }
  }

  const validItems = allItems.filter((i) => i.isValid);
  const invalidItems = allItems.filter((i) => !i.isValid);

  return {
    allItems,
    validItems,
    invalidItems,
    rawCount: allItems.length + duplicateDroppedCount,
    validCount: validItems.length,
    invalidCount: invalidItems.length,
    duplicateDroppedCount,
  };
}

export function extractValidIsbnFromBarcodeValues(
  entries: Array<{ rawValue?: string; text?: string; format?: string }>
): string | null {
  return evaluateBarcodeDetections(entries).validIsbn13;
}

export function extractValidIdentifierFromBarcodeValues(
  entries: Array<{ rawValue?: string; text?: string; format?: string }>
): string | null {
  const res = evaluateBarcodeDetections(entries);
  return res.validIdentifier ?? res.validIsbn13;
}

async function detectRawWithNativeDetector(source: ImageBitmapSource): Promise<{
  rawEntries: Array<{ rawValue?: string; format?: string }>;
  error: string | null;
}> {
  if (!isNativeBarcodeDetectorSupported() || !window.BarcodeDetector) {
    return { rawEntries: [], error: null };
  }
  try {
    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'],
    });
    const results = await detector.detect(source);
    return { rawEntries: results, error: null };
  } catch (err) {
    return {
      rawEntries: [],
      error: err instanceof Error ? err.message : 'Native BarcodeDetector error',
    };
  }
}

async function detectWithNativeDetector(source: ImageBitmapSource): Promise<{
  evalResult: BarcodeEvaluationResult;
  error: string | null;
}> {
  const { rawEntries, error } = await detectRawWithNativeDetector(source);
  return { evalResult: evaluateBarcodeDetections(rawEntries), error };
}

async function detectRawWithZxingInput(
  input: Blob | Uint8Array | ImageData,
  opts?: { binarizer?: 'LocalAverage' | 'GlobalHistogram'; minLineCount?: number; maxSymbols?: number }
): Promise<{
  rawEntries: Array<{ rawValue?: string; text?: string; format?: string }>;
  error: string | null;
}> {
  try {
    const { readBarcodes } = await getZxingReader();
    const results = await readBarcodes(input, {
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      eanAddOnSymbol: 'Ignore',
      formats: ['EAN-13', 'EAN-8', 'UPC-A', 'Code128'],
      binarizer: opts?.binarizer ?? 'LocalAverage',
      minLineCount: opts?.minLineCount ?? 2,
      maxNumberOfSymbols: opts?.maxSymbols ?? 24,
    });
    return { rawEntries: results, error: null };
  } catch (err) {
    return {
      rawEntries: [],
      error: err instanceof Error ? err.message : 'ZXing decode failed',
    };
  }
}

async function detectWithZxingInput(
  input: Blob | Uint8Array | ImageData,
  opts?: { binarizer?: 'LocalAverage' | 'GlobalHistogram'; minLineCount?: number }
): Promise<{
  evalResult: BarcodeEvaluationResult;
  error: string | null;
}> {
  const { rawEntries, error } = await detectRawWithZxingInput(input, opts);
  return { evalResult: evaluateBarcodeDetections(rawEntries), error };
}

// ============================================================================
// Pure ImageData Pixel Preprocessing (Quiet-Zone Padding, Upscale, Contrast, Rotate)
// ============================================================================

export function addQuietZonePadding(imageData: ImageData, padPx = 24): ImageData {
  const { width, height, data } = imageData;
  const newW = width + padPx * 2;
  const newH = height + padPx * 2;
  const out = new Uint8ClampedArray(newW * newH * 4);
  out.fill(255);

  for (let y = 0; y < height; y++) {
    const srcStart = y * width * 4;
    const dstStart = ((y + padPx) * newW + padPx) * 4;
    out.set(data.subarray(srcStart, srcStart + width * 4), dstStart);
  }
  return new ImageData(out, newW, newH);
}

export function cropImageData(
  imageData: ImageData,
  rect: { xRatio: number; yRatio: number; wRatio: number; hRatio: number },
  quietZonePad = 24
): ImageData {
  const { width, height, data } = imageData;
  const sx = Math.max(0, Math.min(width - 1, Math.floor(width * rect.xRatio)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(height * rect.yRatio)));
  const sw = Math.max(1, Math.min(width - sx, Math.ceil(width * rect.wRatio)));
  const sh = Math.max(1, Math.min(height - sy, Math.ceil(height * rect.hRatio)));

  const dstW = sw + quietZonePad * 2;
  const dstH = sh + quietZonePad * 2;
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  out.fill(255);

  for (let y = 0; y < sh; y++) {
    const srcStart = ((sy + y) * width + sx) * 4;
    const dstStart = ((y + quietZonePad) * dstW + quietZonePad) * 4;
    out.set(data.subarray(srcStart, srcStart + sw * 4), dstStart);
  }
  return new ImageData(out, dstW, dstH);
}

export function upscaleImageData2x(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const newW = width * 2;
  const newH = height * 2;
  const out = new Uint8ClampedArray(newW * newH * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sIdx = (y * width + x) * 4;
      const r = data[sIdx];
      const g = data[sIdx + 1];
      const b = data[sIdx + 2];
      const a = data[sIdx + 3];
      const dx = x * 2;
      const dy = y * 2;
      const d0 = (dy * newW + dx) * 4;
      const d1 = d0 + 4;
      const d2 = ((dy + 1) * newW + dx) * 4;
      const d3 = d2 + 4;
      out[d0] = out[d1] = out[d2] = out[d3] = r;
      out[d0 + 1] = out[d1 + 1] = out[d2 + 1] = out[d3 + 1] = g;
      out[d0 + 2] = out[d1 + 2] = out[d2 + 2] = out[d3 + 2] = b;
      out[d0 + 3] = out[d1 + 3] = out[d2 + 3] = out[d3 + 3] = a;
    }
  }
  return new ImageData(out, newW, newH);
}

export function buildInvertedImageData(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = 255 - data[i];
    out[i + 1] = 255 - data[i + 1];
    out[i + 2] = 255 - data[i + 2];
    out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

export function buildContrastEnhancedImageData(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const out = new Uint8ClampedArray(data.length);
  const range = Math.max(16, maxLum - minLum);

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const stretched = Math.max(0, Math.min(255, Math.round(((gray[p] - minLum) * 255) / range)));
    const boosted =
      stretched < 110
        ? Math.max(0, stretched - 25)
        : stretched > 145
          ? Math.min(255, stretched + 25)
          : stretched;
    out[i] = boosted;
    out[i + 1] = boosted;
    out[i + 2] = boosted;
    out[i + 3] = 255;
  }

  return new ImageData(out, width, height);
}

export function rotateImageData90Cw(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const newW = height;
  const newH = width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sIdx = (y * width + x) * 4;
      const nx = height - 1 - y;
      const ny = x;
      const dIdx = (ny * newW + nx) * 4;
      out[dIdx] = data[sIdx];
      out[dIdx + 1] = data[sIdx + 1];
      out[dIdx + 2] = data[sIdx + 2];
      out[dIdx + 3] = data[sIdx + 3];
    }
  }
  return new ImageData(out, newW, newH);
}

interface ScanRegionDef {
  id: string;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
}

const MULTI_SCAN_REGIONS: ScanRegionDef[] = [
  { id: 'center_band', xRatio: 0.08, yRatio: 0.22, wRatio: 0.84, hRatio: 0.56 },
  { id: 'lower_half', xRatio: 0, yRatio: 0.45, wRatio: 1, hRatio: 0.55 },
  { id: 'upper_half', xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 0.55 },
  { id: 'left_band', xRatio: 0, yRatio: 0.08, wRatio: 0.58, hRatio: 0.84 },
  { id: 'right_band', xRatio: 0.42, yRatio: 0.08, wRatio: 0.58, hRatio: 0.84 },
  { id: 'bottom_left', xRatio: 0, yRatio: 0.48, wRatio: 0.6, hRatio: 0.52 },
  { id: 'bottom_right', xRatio: 0.4, yRatio: 0.48, wRatio: 0.6, hRatio: 0.52 },
];

/**
 * Pure multi-region, multi-scale, multi-binarizer decoder operating directly on lossless ImageData.
 * Works identically in browser canvas flows and headless Vitest suites.
 */
export async function decodeBarcodeFromRawImageDataDetailed(
  imageData: ImageData,
  options?: { regionSubset?: string[]; skipHeavyPasses?: boolean }
): Promise<BarcodeScanAttemptResult> {
  const start = nowMs();
  const regionsExamined: string[] = [];
  let lastRawHit: BarcodeEvaluationResult | null = null;
  let lastError: string | null = null;

  const tryCandidate = async (
    regionName: string,
    img: ImageData,
    binarizer: 'LocalAverage' | 'GlobalHistogram',
    minLineCount: number
  ): Promise<BarcodeScanAttemptResult | null> => {
    if (!regionsExamined.includes(regionName)) regionsExamined.push(regionName);
    const { evalResult, error } = await detectWithZxingInput(img, { binarizer, minLineCount });
    if (error && !lastError) lastError = error;
    if (evalResult.rawValue && !lastRawHit) {
      lastRawHit = evalResult;
    }
    if (evalResult.validIdentifier ?? evalResult.validIsbn13) {
      return {
        ...evalResult,
        decoderUsed: 'zxing',
        matchedRegion: regionName,
        regionsExamined,
        nativeSupported: isNativeBarcodeDetectorSupported(),
        zxingStatus,
        zxingError: zxingLastError,
        durationMs: Math.round(nowMs() - start),
        error: lastError,
      };
    }
    return null;
  };

  // 1. Full frame lossless pass (LocalAverage -> padded full frame if bars touch edges -> GlobalHistogram)
  const fullHit = await tryCandidate('full_frame', imageData, 'LocalAverage', 2);
  if (fullHit) return fullHit;

  const paddedFull = addQuietZonePadding(imageData, 24);
  const fullPaddedHit = await tryCandidate('full_frame_padded', paddedFull, 'LocalAverage', 1);
  if (fullPaddedHit) return fullPaddedHit;

  // Upscale small/low-res full frame so narrow EAN-13 bars meet ZXing's minimum module width
  if (imageData.width < 560 || imageData.height < 220) {
    const upscaled = upscaleImageData2x(paddedFull);
    const upHit =
      (await tryCandidate('full_frame_upscaled', upscaled, 'LocalAverage', 1)) ||
      (await tryCandidate('full_frame_upscaled', upscaled, 'GlobalHistogram', 1));
    if (upHit) return upHit;
  }

  const fullGlobalHit = await tryCandidate('full_frame', paddedFull, 'GlobalHistogram', 1);
  if (fullGlobalHit) return fullGlobalHit;

  // 2. Multi-region crops with quiet-zone padding (and upscaling when small)
  const regionList = options?.regionSubset
    ? MULTI_SCAN_REGIONS.filter((r) => options.regionSubset!.includes(r.id))
    : MULTI_SCAN_REGIONS;

  for (const region of regionList) {
    const cropped = cropImageData(imageData, region, 24);
    const prepared = cropped.width < 520 ? upscaleImageData2x(cropped) : cropped;
    const hit = await tryCandidate(region.id, prepared, 'LocalAverage', 1);
    if (hit) return hit;
  }

  // 3. Contrast-enhanced, GlobalHistogram, inverted, & explicit 90° rotated fallback
  if (!options?.skipHeavyPasses) {
    await yieldToUi();
    const contrastFull = buildContrastEnhancedImageData(paddedFull);
    const contrastHit =
      (await tryCandidate('full_frame_contrast', contrastFull, 'LocalAverage', 1)) ||
      (await tryCandidate('full_frame_contrast', contrastFull, 'GlobalHistogram', 1));
    if (contrastHit) return contrastHit;

    // Regional contrast + GlobalHistogram on lower_half & center_band (most common book barcode zones)
    for (const rId of ['lower_half', 'center_band']) {
      const def = MULTI_SCAN_REGIONS.find((r) => r.id === rId);
      if (!def) continue;
      const cropped = cropImageData(imageData, def, 24);
      const contrastCrop = buildContrastEnhancedImageData(
        cropped.width < 520 ? upscaleImageData2x(cropped) : cropped
      );
      const cropHit =
        (await tryCandidate(`${rId}_contrast`, contrastCrop, 'LocalAverage', 1)) ||
        (await tryCandidate(`${rId}_contrast`, contrastCrop, 'GlobalHistogram', 1));
      if (cropHit) return cropHit;
    }

    const invertedFull = buildInvertedImageData(paddedFull);
    const invHit = await tryCandidate('full_frame_inverted', invertedFull, 'LocalAverage', 1);
    if (invHit) return invHit;

    // Explicit 90-degree rotation pass (in case narrow vertical barcode sits in dense cover art)
    const rotated = rotateImageData90Cw(paddedFull);
    const rotHit = await tryCandidate('full_frame_rotated_90', rotated, 'LocalAverage', 1);
    if (rotHit) return rotHit;
  }

  return {
    ...(lastRawHit ?? {
      validIsbn13: null,
      isbn10: null,
      rawValue: null,
      format: null,
      isValidIsbn: false,
      checksumError: null,
    }),
    decoderUsed: lastRawHit ? 'zxing' : null,
    matchedRegion: null,
    regionsExamined,
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: Math.round(nowMs() - start),
    error: lastError,
  };
}

export async function decodeBarcodeFromRawImageData(imageData: ImageData): Promise<string | null> {
  const res = await decodeBarcodeFromRawImageDataDetailed(imageData);
  return res.validIdentifier ?? res.validIsbn13;
}

const MULTI_TILE_GRID_REGIONS: ScanRegionDef[] = [
  { id: 'upper_half', xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 0.55 },
  { id: 'lower_half', xRatio: 0, yRatio: 0.45, wRatio: 1, hRatio: 0.55 },
  { id: 'left_half', xRatio: 0, yRatio: 0, wRatio: 0.56, hRatio: 1 },
  { id: 'right_half', xRatio: 0.44, yRatio: 0, wRatio: 0.56, hRatio: 1 },
  { id: 'top_left', xRatio: 0, yRatio: 0, wRatio: 0.56, hRatio: 0.56 },
  { id: 'top_right', xRatio: 0.44, yRatio: 0, wRatio: 0.56, hRatio: 0.56 },
  { id: 'bottom_left', xRatio: 0, yRatio: 0.44, wRatio: 0.56, hRatio: 0.56 },
  { id: 'bottom_right', xRatio: 0.44, yRatio: 0.44, wRatio: 0.56, hRatio: 0.56 },
  { id: 'center_band', xRatio: 0.12, yRatio: 0.22, wRatio: 0.76, hRatio: 0.56 },
];

/**
 * Collects ALL readable barcodes from raw ImageData (full frame + grid quadrants/halves +
 * contrast/upscaled fallbacks) without stopping after the first valid symbol.
 */
export async function decodeAllBarcodesFromRawImageDataDetailed(
  imageData: ImageData,
  options?: { skipHeavyTilePasses?: boolean }
): Promise<MultiBarcodeScanAttemptResult> {
  const start = nowMs();
  const regionsExamined: string[] = [];
  const decodersUsed = new Set<'native' | 'zxing'>();
  const rawCollected: Array<{ rawValue?: string; text?: string; format?: string; region?: string | null }> = [];
  let lastError: string | null = null;

  const scanPass = async (
    regionName: string,
    img: ImageData,
    binarizer: 'LocalAverage' | 'GlobalHistogram',
    minLineCount: number
  ) => {
    if (!regionsExamined.includes(regionName)) regionsExamined.push(regionName);
    const { rawEntries, error } = await detectRawWithZxingInput(img, {
      binarizer,
      minLineCount,
      maxSymbols: 32,
    });
    if (error && !lastError) lastError = error;
    if (rawEntries.length > 0) {
      decodersUsed.add('zxing');
      for (const entry of rawEntries) {
        rawCollected.push({ ...entry, region: regionName });
      }
    }
  };

  // Full-frame passes first (both unpadded and quiet-zone-padded)
  await scanPass('full_frame', imageData, 'LocalAverage', 2);
  const paddedFull = addQuietZonePadding(imageData, 24);
  await scanPass('full_frame_padded', paddedFull, 'LocalAverage', 1);
  await scanPass('full_frame_global', paddedFull, 'GlobalHistogram', 1);

  if (imageData.width < 680 || imageData.height < 360) {
    const upscaled = upscaleImageData2x(paddedFull);
    await scanPass('full_frame_upscaled', upscaled, 'LocalAverage', 1);
  }

  // Always examine multi-region tiles for multi-book photos so smaller/clustered barcodes
  // sitting outside ZXing's primary full-frame pass are also discovered.
  if (!options?.skipHeavyTilePasses) {
    for (const region of MULTI_TILE_GRID_REGIONS) {
      await yieldToUi();
      const cropped = cropImageData(imageData, region, 24);
      const prepared = cropped.width < 520 ? upscaleImageData2x(cropped) : cropped;
      await scanPass(region.id, prepared, 'LocalAverage', 1);
    }

    // Contrast & 90-degree rotated full pass for glare/vertical spines/low-contrast photos
    await yieldToUi();
    const contrastFull = buildContrastEnhancedImageData(paddedFull);
    await scanPass('full_frame_contrast', contrastFull, 'LocalAverage', 1);
    const rotated = rotateImageData90Cw(paddedFull);
    await scanPass('full_frame_rotated_90', rotated, 'LocalAverage', 1);
  }

  const evalRes = evaluateMultiBarcodeDetections(rawCollected);
  const blurryGuidance =
    evalRes.validCount === 0
      ? evalRes.invalidCount > 0
        ? `Detected ${evalRes.invalidCount} partial or unreadable barcode symbol(s) (${evalRes.invalidItems
            .map((i) => i.rawValue)
            .slice(0, 3)
            .join(', ')}), but no valid ISBN/EAN-13 check digits matched. Hold closer or use sharper lighting.`
        : 'No readable barcodes were found in this image. Ensure each book barcode is evenly lit, sharp, and not cropped at the edges.'
      : null;

  return {
    ...evalRes,
    decodersUsed: Array.from(decodersUsed),
    regionsExamined,
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: Math.round(nowMs() - start),
    error: lastError,
    blurryGuidance,
  };
}

// ============================================================================
// Canvas Drawing & Uploaded Photo / Live Camera Entry Points
// ============================================================================

function drawRegionToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  crop: { sx: number; sy: number; sw: number; sh: number },
  targetCanvas: HTMLCanvasElement,
  maxDim = 1600
): ImageData | null {
  const scale = Math.min(1, maxDim / Math.max(crop.sw, crop.sh));
  const dstW = Math.max(1, Math.round(crop.sw * scale));
  const dstH = Math.max(1, Math.round(crop.sh * scale));
  if (dstW <= 0 || dstH <= 0 || srcW <= 0 || srcH <= 0) return null;

  targetCanvas.width = dstW;
  targetCanvas.height = dstH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dstW, dstH);
  return ctx.getImageData(0, 0, dstW, dstH);
}

function drawRotatedCanvas(
  sourceCanvas: HTMLCanvasElement,
  angleDeg: number,
  targetCanvas: HTMLCanvasElement
): ImageData | null {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return null;

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const newW = Math.round(w * cos + h * sin);
  const newH = Math.round(w * sin + h * cos);

  targetCanvas.width = newW;
  targetCanvas.height = newH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, newW, newH);
  ctx.save();
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(sourceCanvas, -w / 2, -h / 2);
  ctx.restore();
  return ctx.getImageData(0, 0, newW, newH);
}

async function decodeImageElementOrBitmap(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
} | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement
    }
  }

  if (typeof Image === 'undefined') return null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load image'));
      el.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

/**
 * Multi-region, multi-pass barcode decoder for uploaded barcode photos.
 * Uses the same lossless multi-region + preprocessing pipeline as live camera frames,
 * plus skewed/orthogonal rotation fallbacks.
 */
export async function detectBarcodeFromImageFileDetailed(
  file: Blob
): Promise<BarcodeScanAttemptResult> {
  const start = nowMs();
  const regionsExamined: string[] = [];
  let lastRawHit: BarcodeEvaluationResult | null = null;
  let lastError: string | null = null;

  // Fast path: Native BarcodeDetector on direct Blob
  if (isNativeBarcodeDetectorSupported()) {
    regionsExamined.push('native_blob');
    const nativeDirect = await detectWithNativeDetector(file);
    if (nativeDirect.error) lastError = nativeDirect.error;
    if (nativeDirect.evalResult.rawValue) lastRawHit = nativeDirect.evalResult;
    if (nativeDirect.evalResult.validIdentifier ?? nativeDirect.evalResult.validIsbn13) {
      return {
        ...nativeDirect.evalResult,
        decoderUsed: 'native',
        matchedRegion: 'native_blob',
        regionsExamined,
        nativeSupported: true,
        zxingStatus,
        zxingError: zxingLastError,
        durationMs: Math.round(nowMs() - start),
        error: lastError,
      };
    }
  }

  // Decode Blob directly via canvas/ImageData (shared lossless pipeline)
  const decoded = await decodeImageElementOrBitmap(file);
  if (!decoded) {
    // Fallback to passing raw Blob directly to ZXing if DOM image decode unavailable
    const zDirect = await detectWithZxingInput(file, { binarizer: 'LocalAverage', minLineCount: 1 });
    return {
      ...zDirect.evalResult,
      decoderUsed: zDirect.evalResult.rawValue ? 'zxing' : null,
      matchedRegion: (zDirect.evalResult.validIdentifier ?? zDirect.evalResult.validIsbn13) ? 'blob_direct' : null,
      regionsExamined: [...regionsExamined, 'blob_direct'],
      nativeSupported: isNativeBarcodeDetectorSupported(),
      zxingStatus,
      zxingError: zxingLastError,
      durationMs: Math.round(nowMs() - start),
      error: zDirect.error ?? 'Could not decode image file into canvas',
    };
  }

  const { source, width, height, cleanup } = decoded;
  try {
    const workCanvas = document.createElement('canvas');
    const rotCanvas = document.createElement('canvas');

    const fullImgData = drawRegionToCanvas(
      source,
      width,
      height,
      { sx: 0, sy: 0, sw: width, sh: height },
      workCanvas,
      1800
    );

    if (fullImgData) {
      const nativeFull = await detectWithNativeDetector(workCanvas);
      if (nativeFull.evalResult.validIdentifier ?? nativeFull.evalResult.validIsbn13) {
        return {
          ...nativeFull.evalResult,
          decoderUsed: 'native',
          matchedRegion: 'full_frame_native',
          regionsExamined: [...regionsExamined, 'full_frame_native'],
          nativeSupported: isNativeBarcodeDetectorSupported(),
          zxingStatus,
          zxingError: zxingLastError,
          durationMs: Math.round(nowMs() - start),
          error: lastError,
        };
      }

      const zRes = await decodeBarcodeFromRawImageDataDetailed(fullImgData);
      for (const r of zRes.regionsExamined) {
        if (!regionsExamined.includes(r)) regionsExamined.push(r);
      }
      if (zRes.rawValue && !lastRawHit) lastRawHit = zRes;
      if (zRes.error && !lastError) lastError = zRes.error;
      if (zRes.validIdentifier ?? zRes.validIsbn13) {
        return {
          ...zRes,
          regionsExamined,
          durationMs: Math.round(nowMs() - start),
        };
      }
    }

    // Skewed phone-angle rotations (-12, +12, -6, +6, 90, 270, 180)
    const rotSourceData = drawRegionToCanvas(
      source,
      width,
      height,
      { sx: 0, sy: 0, sw: width, sh: height },
      workCanvas,
      1200
    );
    if (rotSourceData) {
      for (const angle of [-12, 12, -6, 6, 90, 270, 180]) {
        await yieldToUi();
        const rotData = drawRotatedCanvas(workCanvas, angle, rotCanvas);
        if (!rotData) continue;
        const rotLabel = `rotated_${angle}`;
        regionsExamined.push(rotLabel);

        const nativeRot = await detectWithNativeDetector(rotCanvas);
        if (nativeRot.evalResult.validIdentifier ?? nativeRot.evalResult.validIsbn13) {
          return {
            ...nativeRot.evalResult,
            decoderUsed: 'native',
            matchedRegion: rotLabel,
            regionsExamined,
            nativeSupported: isNativeBarcodeDetectorSupported(),
            zxingStatus,
            zxingError: zxingLastError,
            durationMs: Math.round(nowMs() - start),
            error: lastError,
          };
        }

        const zRot = await decodeBarcodeFromRawImageDataDetailed(rotData, {
          regionSubset: ['center_band', 'lower_half'],
          skipHeavyPasses: true,
        });
        if (zRot.rawValue && !lastRawHit) lastRawHit = zRot;
        if (zRot.validIdentifier ?? zRot.validIsbn13) {
          return {
            ...zRot,
            matchedRegion: `${rotLabel}:${zRot.matchedRegion}`,
            regionsExamined,
            durationMs: Math.round(nowMs() - start),
          };
        }
      }
    }
  } finally {
    cleanup();
  }

  return {
    ...(lastRawHit ?? {
      validIsbn13: null,
      isbn10: null,
      rawValue: null,
      format: null,
      isValidIsbn: false,
      checksumError: null,
    }),
    decoderUsed: lastRawHit ? 'zxing' : null,
    matchedRegion: null,
    regionsExamined,
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: Math.round(nowMs() - start),
    error: lastError,
  };
}

export async function detectBarcodeFromImageFile(file: Blob): Promise<string | null> {
  const res = await detectBarcodeFromImageFileDetailed(file);
  return res.validIdentifier ?? res.validIsbn13;
}

/**
 * Multi-symbol decoder for uploaded photos containing 1 to 10+ books in a single frame.
 * Combines Native BarcodeDetector + full-frame & tiled ZXing passes, deduplicates per image,
 * and returns all valid identifiers separately from any invalid/unreadable symbols.
 */
export async function detectAllBarcodesFromImageFileDetailed(
  file: Blob
): Promise<MultiBarcodeScanAttemptResult> {
  const start = nowMs();
  const regionsExamined: string[] = [];
  const decodersUsed = new Set<'native' | 'zxing'>();
  const rawCollected: Array<{ rawValue?: string; text?: string; format?: string; region?: string | null }> = [];
  let lastError: string | null = null;

  if (isNativeBarcodeDetectorSupported()) {
    regionsExamined.push('native_blob');
    const nativeDirect = await detectRawWithNativeDetector(file);
    if (nativeDirect.error) lastError = nativeDirect.error;
    if (nativeDirect.rawEntries.length > 0) {
      decodersUsed.add('native');
      nativeDirect.rawEntries.forEach((e) => rawCollected.push({ ...e, region: 'native_blob' }));
    }
  }

  const decoded = await decodeImageElementOrBitmap(file);
  if (!decoded) {
    const zDirect = await detectRawWithZxingInput(file, {
      binarizer: 'LocalAverage',
      minLineCount: 1,
      maxSymbols: 32,
    });
    if (zDirect.error && !lastError) lastError = zDirect.error;
    if (zDirect.rawEntries.length > 0) {
      decodersUsed.add('zxing');
      zDirect.rawEntries.forEach((e) => rawCollected.push({ ...e, region: 'blob_direct' }));
    }
    const evalRes = evaluateMultiBarcodeDetections(rawCollected);
    return {
      ...evalRes,
      decodersUsed: Array.from(decodersUsed),
      regionsExamined: [...regionsExamined, 'blob_direct'],
      nativeSupported: isNativeBarcodeDetectorSupported(),
      zxingStatus,
      zxingError: zxingLastError,
      durationMs: Math.round(nowMs() - start),
      error: lastError,
      blurryGuidance:
        evalRes.validCount === 0
          ? 'Could not decode image file clearly. Try a higher-resolution photo or Bulk ISBN text entry.'
          : null,
    };
  }

  const { source, width, height, cleanup } = decoded;
  try {
    const workCanvas = document.createElement('canvas');
    const fullImgData = drawRegionToCanvas(
      source,
      width,
      height,
      { sx: 0, sy: 0, sw: width, sh: height },
      workCanvas,
      2000
    );

    if (fullImgData) {
      if (isNativeBarcodeDetectorSupported()) {
        regionsExamined.push('full_frame_native');
        const nativeFull = await detectRawWithNativeDetector(workCanvas);
        if (nativeFull.error && !lastError) lastError = nativeFull.error;
        if (nativeFull.rawEntries.length > 0) {
          decodersUsed.add('native');
          nativeFull.rawEntries.forEach((e) => rawCollected.push({ ...e, region: 'full_frame_native' }));
        }
      }

      const zMulti = await decodeAllBarcodesFromRawImageDataDetailed(fullImgData);
      zMulti.decodersUsed.forEach((d) => decodersUsed.add(d));
      zMulti.regionsExamined.forEach((r) => {
        if (!regionsExamined.includes(r)) regionsExamined.push(r);
      });
      if (zMulti.error && !lastError) lastError = zMulti.error;
      for (const item of zMulti.allItems) {
        rawCollected.push({
          rawValue: item.rawValue,
          format: item.format ?? undefined,
          region: item.region,
        });
      }
    }

    // If native + tiled passes found 0 symbols, also check 90-deg native rotation
    if (rawCollected.length === 0 && isNativeBarcodeDetectorSupported()) {
      const rotCanvas = document.createElement('canvas');
      if (drawRotatedCanvas(workCanvas, 90, rotCanvas)) {
        regionsExamined.push('native_rotated_90');
        const nativeRot = await detectRawWithNativeDetector(rotCanvas);
        if (nativeRot.rawEntries.length > 0) {
          decodersUsed.add('native');
          nativeRot.rawEntries.forEach((e) => rawCollected.push({ ...e, region: 'native_rotated_90' }));
        }
      }
    }
  } finally {
    cleanup();
  }

  const evalRes = evaluateMultiBarcodeDetections(rawCollected);
  const blurryGuidance =
    evalRes.validCount === 0
      ? evalRes.invalidCount > 0
        ? `Found ${evalRes.invalidCount} partial/invalid barcode(s) (${evalRes.invalidItems
            .map((i) => i.rawValue)
            .slice(0, 3)
            .join(', ')}), none with valid check digits. Try closer framing or sharper focus.`
        : 'No barcodes could be read from this photograph. Move closer so bars are crisp and evenly lit, or enter ISBNs via Bulk Text.'
      : null;

  return {
    ...evalRes,
    decodersUsed: Array.from(decodersUsed),
    regionsExamined,
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: Math.round(nowMs() - start),
    error: lastError,
    blurryGuidance,
  };
}

/**
 * Scans a live video frame across full frame + multiple overlapping regions (center, lower back-cover,
 * upper, edges) with lossless ImageData + quiet-zone padding + Native/ZXing fallback.
 * Never restricts detection solely to the center reticle.
 */
export async function scanVideoFrameForBarcodeDetailed(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement,
  options?: { frameIndex?: number; fullPass?: boolean }
): Promise<BarcodeScanAttemptResult> {
  const start = nowMs();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) {
    return {
      validIsbn13: null,
      isbn10: null,
      rawValue: null,
      format: null,
      isValidIsbn: false,
      checksumError: null,
      decoderUsed: null,
      matchedRegion: null,
      regionsExamined: [],
      nativeSupported: isNativeBarcodeDetectorSupported(),
      zxingStatus,
      zxingError: zxingLastError,
      durationMs: 0,
      error: null,
    };
  }

  const regionsExamined: string[] = [];
  const fullImgData = drawRegionToCanvas(
    video,
    vw,
    vh,
    { sx: 0, sy: 0, sw: vw, sh: vh },
    scratchCanvas,
    1400
  );
  if (!fullImgData) {
    return {
      validIsbn13: null,
      isbn10: null,
      rawValue: null,
      format: null,
      isValidIsbn: false,
      checksumError: null,
      decoderUsed: null,
      matchedRegion: null,
      regionsExamined: [],
      nativeSupported: isNativeBarcodeDetectorSupported(),
      zxingStatus,
      zxingError: zxingLastError,
      durationMs: Math.round(nowMs() - start),
      error: 'Unable to acquire 2D canvas context',
    };
  }

  let lastRawHit: BarcodeEvaluationResult | null = null;
  let lastError: string | null = null;

  // 1. Fast native detector on full frame
  if (isNativeBarcodeDetectorSupported()) {
    regionsExamined.push('native_full_frame');
    const nativeHit = await detectWithNativeDetector(scratchCanvas);
    if (nativeHit.error) lastError = nativeHit.error;
    if (nativeHit.evalResult.rawValue) lastRawHit = nativeHit.evalResult;
    if (nativeHit.evalResult.validIdentifier ?? nativeHit.evalResult.validIsbn13) {
      return {
        ...nativeHit.evalResult,
        decoderUsed: 'native',
        matchedRegion: 'native_full_frame',
        regionsExamined,
        nativeSupported: true,
        zxingStatus,
        zxingError: zxingLastError,
        durationMs: Math.round(nowMs() - start),
        error: lastError,
      };
    }
  }

  // 2. Rotate secondary crops smoothly across live frames so every frame scans full + lower + center
  //    plus alternating edge/corner/contrast/rotation passes without overloading CPU.
  const idx = options?.frameIndex;
  const fullPass = options?.fullPass ?? idx === undefined;
  const subset = fullPass
    ? undefined
    : idx! % 3 === 0
      ? ['center_band', 'lower_half', 'upper_half']
      : idx! % 3 === 1
        ? ['center_band', 'lower_half', 'left_band', 'right_band']
        : ['center_band', 'lower_half', 'bottom_left', 'bottom_right'];

  const zRes = await decodeBarcodeFromRawImageDataDetailed(fullImgData, {
    regionSubset: subset,
    skipHeavyPasses: !fullPass && idx! % 2 === 1,
  });

  for (const r of zRes.regionsExamined) {
    if (!regionsExamined.includes(r)) regionsExamined.push(r);
  }
  if (zRes.rawValue && !lastRawHit) lastRawHit = zRes;
  if (zRes.error && !lastError) lastError = zRes.error;

  if (zRes.validIdentifier ?? zRes.validIsbn13) {
    return {
      ...zRes,
      regionsExamined,
      durationMs: Math.round(nowMs() - start),
    };
  }

  // 3. Explicit 90° native fallback when rotated barcodes miss on native-only frames
  if (isNativeBarcodeDetectorSupported() && (fullPass || (idx ?? 0) % 3 === 2)) {
    const rotCanvas = document.createElement('canvas');
    if (drawRotatedCanvas(scratchCanvas, 90, rotCanvas)) {
      regionsExamined.push('native_rotated_90');
      const nativeRot = await detectWithNativeDetector(rotCanvas);
      if (nativeRot.evalResult.validIdentifier ?? nativeRot.evalResult.validIsbn13) {
        return {
          ...nativeRot.evalResult,
          decoderUsed: 'native',
          matchedRegion: 'native_rotated_90',
          regionsExamined,
          nativeSupported: true,
          zxingStatus,
          zxingError: zxingLastError,
          durationMs: Math.round(nowMs() - start),
          error: lastError,
        };
      }
    }
  }

  return {
    ...(lastRawHit ?? {
      validIsbn13: null,
      isbn10: null,
      rawValue: null,
      format: null,
      isValidIsbn: false,
      checksumError: null,
    }),
    decoderUsed: lastRawHit ? zRes.decoderUsed ?? 'zxing' : null,
    matchedRegion: null,
    regionsExamined,
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: Math.round(nowMs() - start),
    error: lastError,
  };
}

export async function scanVideoFrameForBarcode(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement,
  options?: { fullFrame?: boolean; frameIndex?: number; fullPass?: boolean }
): Promise<string | null> {
  const res = await scanVideoFrameForBarcodeDetailed(video, scratchCanvas, {
    frameIndex: options?.frameIndex,
    fullPass: options?.fullPass ?? options?.fullFrame,
  });
  return res.validIdentifier ?? res.validIsbn13;
}

/**
 * Unified detailed entry point for still Blob/File, HTMLCanvasElement, or HTMLVideoElement frames.
 */
export async function detectBarcodeFromImageSourceDetailed(
  source: Blob | File | HTMLVideoElement | HTMLCanvasElement,
  scratchCanvas?: HTMLCanvasElement
): Promise<BarcodeScanAttemptResult> {
  if (source instanceof Blob) {
    return detectBarcodeFromImageFileDetailed(source);
  }
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    const canvas = scratchCanvas ?? document.createElement('canvas');
    return scanVideoFrameForBarcodeDetailed(source, canvas, { fullPass: true });
  }
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    const start = nowMs();
    const nativeHit = await detectWithNativeDetector(source);
    if (nativeHit.evalResult.validIdentifier ?? nativeHit.evalResult.validIsbn13) {
      return {
        ...nativeHit.evalResult,
        decoderUsed: 'native',
        matchedRegion: 'native_canvas',
        regionsExamined: ['native_canvas'],
        nativeSupported: true,
        zxingStatus,
        zxingError: zxingLastError,
        durationMs: Math.round(nowMs() - start),
        error: nativeHit.error,
      };
    }
    const ctx = source.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, source.width, source.height);
      return decodeBarcodeFromRawImageDataDetailed(imgData);
    }
  }
  return {
    validIsbn13: null,
    isbn10: null,
    rawValue: null,
    format: null,
    isValidIsbn: false,
    checksumError: null,
    decoderUsed: null,
    matchedRegion: null,
    regionsExamined: [],
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: 0,
    error: 'Unsupported image source',
  };
}

export async function detectBarcodeFromImageSource(
  source: Blob | File | HTMLVideoElement | HTMLCanvasElement
): Promise<string | null> {
  const res = await detectBarcodeFromImageSourceDetailed(source);
  return res.validIdentifier ?? res.validIsbn13;
}

export async function scanVideoFrameForMultipleBarcodes(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement,
  options?: { frameIndex?: number }
): Promise<MultiBarcodeScanAttemptResult> {
  const start = nowMs();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) {
    return {
      allItems: [],
      validItems: [],
      invalidItems: [],
      rawCount: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateDroppedCount: 0,
      decodersUsed: [],
      regionsExamined: [],
      nativeSupported: isNativeBarcodeDetectorSupported(),
      zxingStatus,
      zxingError: zxingLastError,
      durationMs: 0,
      error: null,
      blurryGuidance: null,
    };
  }

  const regionsExamined: string[] = [];
  const decodersUsed = new Set<'native' | 'zxing'>();
  const rawCollected: Array<{ rawValue?: string; text?: string; format?: string; region?: string | null }> = [];
  let lastError: string | null = null;

  const fullImgData = drawRegionToCanvas(
    video,
    vw,
    vh,
    { sx: 0, sy: 0, sw: vw, sh: vh },
    scratchCanvas,
    1400
  );
  if (!fullImgData) {
    return {
      allItems: [],
      validItems: [],
      invalidItems: [],
      rawCount: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateDroppedCount: 0,
      decodersUsed: [],
      regionsExamined: [],
      nativeSupported: isNativeBarcodeDetectorSupported(),
      zxingStatus,
      zxingError: zxingLastError,
      durationMs: Math.round(nowMs() - start),
      error: 'Unable to acquire 2D canvas context',
      blurryGuidance: null,
    };
  }

  if (isNativeBarcodeDetectorSupported()) {
    regionsExamined.push('native_full_frame');
    const nativeHit = await detectRawWithNativeDetector(scratchCanvas);
    if (nativeHit.error) lastError = nativeHit.error;
    if (nativeHit.rawEntries.length > 0) {
      decodersUsed.add('native');
      nativeHit.rawEntries.forEach((e) => rawCollected.push({ ...e, region: 'native_full_frame' }));
    }
  }

  // Keep live camera frame processing smooth: alternate full frame with lightweight regional bands
  const idx = options?.frameIndex ?? 0;
  const zRes = await decodeAllBarcodesFromRawImageDataDetailed(fullImgData, {
    skipHeavyTilePasses: idx % 3 !== 0,
  });
  zRes.decodersUsed.forEach((d) => decodersUsed.add(d));
  zRes.regionsExamined.forEach((r) => {
    if (!regionsExamined.includes(r)) regionsExamined.push(r);
  });
  if (zRes.error && !lastError) lastError = zRes.error;
  for (const item of zRes.allItems) {
    rawCollected.push({
      rawValue: item.rawValue,
      format: item.format ?? undefined,
      region: item.region,
    });
  }

  const evalRes = evaluateMultiBarcodeDetections(rawCollected);
  return {
    ...evalRes,
    decodersUsed: Array.from(decodersUsed),
    regionsExamined,
    nativeSupported: isNativeBarcodeDetectorSupported(),
    zxingStatus,
    zxingError: zxingLastError,
    durationMs: Math.round(nowMs() - start),
    error: lastError,
    blurryGuidance: null,
  };
}

export async function listVideoInputDevices(): Promise<Array<{ deviceId: string; label: string }>> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${idx + 1}`,
      }));
  } catch {
    return [];
  }
}

export async function openCameraStreamWithFallback(preferredDeviceId?: string): Promise<{
  stream: MediaStream;
  profile: string;
}> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is unavailable in this browser. Upload a barcode photo instead.');
  }

  const profiles: Array<{ name: string; constraints: MediaStreamConstraints }> = [];

  if (preferredDeviceId) {
    profiles.push(
      {
        name: 'selected-device-1080p',
        constraints: {
          video: {
            deviceId: { exact: preferredDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
      },
      {
        name: 'selected-device-basic',
        constraints: {
          video: { deviceId: { exact: preferredDeviceId } },
          audio: false,
        },
      }
    );
  }

  profiles.push(
    {
      name: 'environment-1080p',
      constraints: {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
    },
    {
      name: 'environment-720p',
      constraints: {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
    },
    {
      name: 'environment-basic',
      constraints: {
        video: { facingMode: 'environment' },
        audio: false,
      },
    },
    {
      name: 'default-camera',
      constraints: {
        video: true,
        audio: false,
      },
    }
  );

  let lastErr: unknown;
  for (const prof of profiles) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(prof.constraints);
      return { stream, profile: prof.name };
    } catch (err) {
      lastErr = err;
      const errName = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      // If user denied permission or hardware absent, don't keep prompting
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'NotFoundError') {
        throw err;
      }
    }
  }
  throw lastErr;
}

export function getCameraTrackTorchSupport(stream: MediaStream | null): boolean {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== 'function') return false;
  try {
    const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    return Boolean(caps.torch);
  } catch {
    return false;
  }
}

export async function setCameraTrackTorch(stream: MediaStream | null, enabled: boolean): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.applyConstraints !== 'function') return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: enabled } as MediaTrackConstraintSet & { torch?: boolean }],
    });
    return true;
  } catch {
    return false;
  }
}

export function mapCameraErrorMessage(err: unknown): string {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Camera scanning requires a secure HTTPS connection. Upload a barcode photo instead.';
  }
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name: string }).name);
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera permission was denied. Allow camera access in browser settings or upload a barcode photo.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was detected on this device. Upload a barcode photo or enter ISBN manually.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Camera is currently in use by another application. Close other camera apps or upload a photo.';
    }
    if (name === 'OverconstrainedError') {
      return 'Rear camera constraints could not be matched. Try uploading a barcode photo instead.';
    }
  }
  return err instanceof Error
    ? err.message
    : 'Could not start camera scanner. Check permissions or upload a barcode photo.';
}

/**
 * Runs local OCR entirely on-device inside Tesseract.js Web Worker on a front-cover image.
 */
export async function runLocalCoverOcr(imageFile: File | Blob): Promise<OcrExtractionResult> {
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng+vie');
  try {
    const {
      data: { text },
    } = await worker.recognize(imageFile);

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 2);

    const isbns = extractBookIdentifiersFromText(text)
      .map((x) => x.normalizedId)
      .filter((x): x is string => Boolean(x));

    return {
      rawText: text.trim(),
      detectedIsbns: isbns,
      candidateTitle: lines[0] ?? undefined,
      candidateAuthor: lines[1] ?? undefined,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Strictly opt-in manual-trigger cover AI recognition via Supabase Edge Function.
 * Never runs automatically.
 */
export async function requestCoverAiAssist(
  imageFile: File | Blob,
  userOptedIn: boolean
): Promise<MetadataCandidate> {
  if (!userOptedIn) {
    throw new Error('Enable Cover AI Recognition in Settings before running AI assist.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Please use local OCR or manual entry.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cover AI recognition requires an active internet connection.');
  }

  const buffer = await imageFile.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke('cover-ai-assist', {
    body: {
      imageBase64: base64,
      mimeType: imageFile.type || 'image/jpeg',
      explicitUserTrigger: true,
    },
  });

  if (error || !data?.candidate) {
    throw new Error(error?.message || data?.error || 'AI cover recognition failed');
  }
  return data.candidate as MetadataCandidate;
}
