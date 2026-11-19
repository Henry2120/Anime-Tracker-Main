import { getSupabaseClient } from '../lib/supabase';
import type { MetadataCandidate } from '../types/domain';
import { extractIsbnsFromText, parseIsbn } from '../utils/isbn';

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

async function getZxingReader() {
  if (!zxingModulePromise) {
    zxingModulePromise = import('zxing-wasm/reader');
  }
  const mod = await zxingModulePromise;
  if (!zxingPrepared) {
    zxingPrepared = true;
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (isBrowser) {
      const base = (import.meta.env?.BASE_URL as string | undefined) || '/';
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      mod.prepareZXingModule({
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
  return mod;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function extractValidIsbnFromBarcodeValues(
  entries: Array<{ rawValue?: string; text?: string; format?: string }>
): string | null {
  // Prioritize EAN-13 entries first
  const sorted = [...entries].sort((a, b) => {
    const aEan13 = (a.format ?? '').toLowerCase().includes('13') ? 1 : 0;
    const bEan13 = (b.format ?? '').toLowerCase().includes('13') ? 1 : 0;
    return bEan13 - aEan13;
  });

  for (const item of sorted) {
    const raw = (item.rawValue ?? item.text ?? '').trim();
    if (!raw) continue;
    const parsed = parseIsbn(raw);
    if (parsed.isValid && parsed.isbn13) {
      return parsed.isbn13;
    }
  }
  return null;
}

async function detectWithNativeDetector(source: ImageBitmapSource): Promise<string | null> {
  if (typeof window === 'undefined' || !window.BarcodeDetector) return null;
  try {
    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'],
    });
    const results = await detector.detect(source);
    return extractValidIsbnFromBarcodeValues(results);
  } catch {
    return null;
  }
}

async function detectWithZxingInput(
  input: Blob | Uint8Array | ImageData,
  opts?: { binarizer?: 'LocalAverage' | 'GlobalHistogram'; minLineCount?: number }
): Promise<string | null> {
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
      maxNumberOfSymbols: 4,
    });
    return extractValidIsbnFromBarcodeValues(results);
  } catch {
    return null;
  }
}

function buildInvertedImageData(imageData: ImageData): ImageData {
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

/**
 * Pure helper for decoding an EAN-13/ISBN barcode directly from raw ImageData
 * (supports headless/Node Vitest testing as well as canvas frame scans).
 */
export async function decodeBarcodeFromRawImageData(imageData: ImageData): Promise<string | null> {
  const first = await detectWithZxingInput(imageData, {
    binarizer: 'LocalAverage',
    minLineCount: 2,
  });
  if (first) return first;

  const globalHit = await detectWithZxingInput(imageData, {
    binarizer: 'GlobalHistogram',
    minLineCount: 1,
  });
  if (globalHit) return globalHit;

  const inverted = buildInvertedImageData(imageData);
  return detectWithZxingInput(inverted, {
    binarizer: 'LocalAverage',
    minLineCount: 1,
  });
}

function drawRegionToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  crop: { sx: number; sy: number; sw: number; sh: number },
  targetCanvas: HTMLCanvasElement,
  maxDim = 1400
): ImageData | null {
  const scale = Math.min(1, maxDim / Math.max(crop.sw, crop.sh));
  const dstW = Math.max(1, Math.round(crop.sw * scale));
  const dstH = Math.max(1, Math.round(crop.sh * scale));
  if (dstW <= 0 || dstH <= 0 || srcW <= 0 || srcH <= 0) return null;

  targetCanvas.width = dstW;
  targetCanvas.height = dstH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dstW, dstH);
  return ctx.getImageData(0, 0, dstW, dstH);
}

function buildContrastEnhancedImageData(imageData: ImageData): ImageData {
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
    // Slight S-curve contrast boost while preserving gray transitions for subpixel ZXing edges
    const boosted = stretched < 110 ? Math.max(0, stretched - 25) : stretched > 145 ? Math.min(255, stretched + 25) : stretched;
    out[i] = boosted;
    out[i + 1] = boosted;
    out[i + 2] = boosted;
    out[i + 3] = 255;
  }

  return new ImageData(out, width, height);
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
 * Multi-pass barcode decoder for still image uploads (handles high/low res,
 * tilted photos, uneven lighting, low contrast, and surrounding book cover text).
 */
export async function detectBarcodeFromImageFile(file: Blob): Promise<string | null> {
  // Pass 1: Direct blob detection (fast path for crisp photos)
  const nativeDirect = await detectWithNativeDetector(file);
  if (nativeDirect) return nativeDirect;

  const zxingDirect = await detectWithZxingInput(file, { binarizer: 'LocalAverage', minLineCount: 2 });
  if (zxingDirect) return zxingDirect;

  const decoded = await decodeImageElementOrBitmap(file);
  if (!decoded) return null;

  const { source, width, height, cleanup } = decoded;
  try {
    const workCanvas = document.createElement('canvas');
    const rotCanvas = document.createElement('canvas');

    // Pass 2: Scaled full image + GlobalHistogram
    const fullImgData = drawRegionToCanvas(
      source,
      width,
      height,
      { sx: 0, sy: 0, sw: width, sh: height },
      workCanvas,
      1600
    );
    if (fullImgData) {
      const zGlobal = await detectWithZxingInput(fullImgData, {
        binarizer: 'GlobalHistogram',
        minLineCount: 1,
      });
      if (zGlobal) return zGlobal;
    }

    await yieldToUi();

    // Pass 3: Focused region crops (center band, bottom half, top half — cuts cover clutter)
    const crops = [
      { sx: width * 0.08, sy: height * 0.25, sw: width * 0.84, sh: height * 0.5 },
      { sx: width * 0.05, sy: height * 0.5, sw: width * 0.9, sh: height * 0.45 },
      { sx: width * 0.05, sy: height * 0.05, sw: width * 0.9, sh: height * 0.45 },
    ];
    for (const crop of crops) {
      const cropData = drawRegionToCanvas(source, width, height, crop, workCanvas, 1400);
      if (!cropData) continue;
      const hit =
        (await detectWithNativeDetector(workCanvas)) ||
        (await decodeBarcodeFromRawImageData(cropData));
      if (hit) return hit;

      // Contrast-boosted pass on the cropped region
      const contrastData = buildContrastEnhancedImageData(cropData);
      const contrastHit = await decodeBarcodeFromRawImageData(contrastData);
      if (contrastHit) return contrastHit;

      await yieldToUi();
    }

    // Pass 4: Contrast-enhanced full image + slight skew & orthogonal rotations
    const baseData = drawRegionToCanvas(
      source,
      width,
      height,
      { sx: 0, sy: 0, sw: width, sh: height },
      workCanvas,
      1200
    );
    if (baseData) {
      const enhanced = buildContrastEnhancedImageData(baseData);
      const enhancedHit = await decodeBarcodeFromRawImageData(enhanced);
      if (enhancedHit) return enhancedHit;

      // Handle slight smartphone tilts (-12, +12, -6, +6) and 90/180/270
      for (const angle of [-12, 12, -6, 6, 90, 270, 180]) {
        await yieldToUi();
        const rotData = drawRotatedCanvas(workCanvas, angle, rotCanvas);
        if (!rotData) continue;
        const rotHit =
          (await detectWithNativeDetector(rotCanvas)) ||
          (await decodeBarcodeFromRawImageData(rotData));
        if (rotHit) return rotHit;
      }
    }
  } finally {
    cleanup();
  }

  return null;
}

/**
 * Scans a single video frame around the visible target framing reticle (center crop)
 * with periodic full-frame support, using native BarcodeDetector or zxing-wasm ImageData.
 */
export async function scanVideoFrameForBarcode(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement,
  options?: { fullFrame?: boolean }
): Promise<string | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;

  const crop = options?.fullFrame
    ? { sx: 0, sy: 0, sw: vw, sh: vh }
    : {
        sx: Math.round(vw * 0.1),
        sy: Math.round(vh * 0.24),
        sw: Math.round(vw * 0.8),
        sh: Math.round(vh * 0.52),
      };

  const imgData = drawRegionToCanvas(video, vw, vh, crop, scratchCanvas, 1000);
  if (!imgData) return null;

  const nativeHit = await detectWithNativeDetector(scratchCanvas);
  if (nativeHit) return nativeHit;

  return detectWithZxingInput(imgData, {
    binarizer: 'LocalAverage',
    minLineCount: 2,
  });
}

/**
 * Unified entry point for still Blob/File, HTMLCanvasElement, or HTMLVideoElement frames.
 */
export async function detectBarcodeFromImageSource(
  source: Blob | File | HTMLVideoElement | HTMLCanvasElement
): Promise<string | null> {
  if (source instanceof Blob) {
    return detectBarcodeFromImageFile(source);
  }
  if (source instanceof HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    return scanVideoFrameForBarcode(source, canvas, { fullFrame: false });
  }
  if (source instanceof HTMLCanvasElement) {
    const nativeHit = await detectWithNativeDetector(source);
    if (nativeHit) return nativeHit;
    const ctx = source.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, source.width, source.height);
      return decodeBarcodeFromRawImageData(imgData);
    }
  }
  return null;
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

    const isbns = extractIsbnsFromText(text)
      .map((x) => x.isbn13)
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
