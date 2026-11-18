import { getSupabaseClient } from '../lib/supabase';
import type { MetadataCandidate } from '../types/domain';
import { extractIsbnsFromText, parseIsbn } from '../utils/isbn';

export interface OcrExtractionResult {
  rawText: string;
  detectedIsbns: string[];
  candidateTitle?: string;
  candidateAuthor?: string;
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
async function getZxingReader() {
  if (!zxingModulePromise) {
    zxingModulePromise = import('zxing-wasm/reader');
  }
  return zxingModulePromise;
}

/**
 * Decodes an ISBN barcode from a still Blob/File or ImageData/Canvas frame.
 * Uses native BarcodeDetector when available and falls back seamlessly to zxing-wasm
 * (critical for iOS Safari, Firefox, and older mobile browsers).
 */
export async function detectBarcodeFromImageSource(
  source: Blob | File | HTMLVideoElement | HTMLCanvasElement
): Promise<string | null> {
  // 1. Try native BarcodeDetector first when supported
  if (typeof window !== 'undefined' && window.BarcodeDetector) {
    try {
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'],
      });
      const results = await detector.detect(source);
      for (const r of results) {
        if (r.rawValue) {
          const parsed = parseIsbn(r.rawValue);
          if (parsed.isValid && parsed.isbn13) return parsed.isbn13;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Fallback via zxing-wasm
  try {
    const { readBarcodes } = await getZxingReader();
    let blob: Blob | null = null;
    if (source instanceof Blob) {
      blob = source;
    } else if (source instanceof HTMLCanvasElement) {
      blob = await new Promise<Blob | null>((resolve) =>
        source.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      );
    } else if (source instanceof HTMLVideoElement && source.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0);
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
        );
      }
    }

    if (!blob) return null;
    const results = await readBarcodes(blob, {
      tryHarder: true,
      formats: ['EAN-13', 'EAN-8', 'UPC-A', 'Code128'],
      maxNumberOfSymbols: 3,
    });
    for (const r of results) {
      if (r.text) {
        const parsed = parseIsbn(r.text);
        if (parsed.isValid && parsed.isbn13) return parsed.isbn13;
      }
    }
  } catch {
    // Non-fatal scan miss
  }
  return null;
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
