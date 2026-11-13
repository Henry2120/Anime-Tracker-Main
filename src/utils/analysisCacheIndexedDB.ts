/**
 * Durable client-side cache for full-track instrument analysis using browser IndexedDB.
 * Ensures analysis results persist across Cloud Run container restarts, tab refreshes,
 * and navigation while strictly enforcing configuration version invalidation.
 */

import { TAXONOMY_VERSION, ANALYSIS_SCHEMA_VERSION, InstrumentTimelineSegment } from './instrumentNormalization';

export const CURRENT_MODEL_ID = 'gemini-3.1-flash-lite';
export const INSTRUCTION_VERSION = 'v6-accuracy-first-hybrid';

export interface AnalysisCacheMetadata {
  videoId: string;
  duration: number;
  modelId: string;
  instructionVersion: string;
  taxonomyVersion: string;
  schemaVersion: string;
}

export interface CachedAnalysisRecord {
  cacheKey: string;
  videoId: string;
  duration: number;
  metadata: AnalysisCacheMetadata;
  analysisResult: {
    success: boolean;
    status: string;
    videoId: string;
    title: string;
    artist: string;
    analysisSummary: string;
    coverage: any;
    instrumentSegments: InstrumentTimelineSegment[];
    allDetectedInstruments: Array<{ name: string; family: string; role?: string; description?: string }>;
    source: string;
    cacheVersion: string;
  };
  cachedAt: number; // Unix timestamp ms
}

const DB_NAME = 'AniVerse_MusicAnalysis_DB';
const DB_VERSION = 2;
const STORE_NAME = 'full_track_analyses';
const YAMNET_STORE_NAME = 'yamnet_live_analyses';

export const YAMNET_CACHE_ENGINE = 'yamnet' as const;
export const YAMNET_MODEL_VERSION = 'mediapipe-yamnet-float32-v1';
export const YAMNET_SCHEMA_VERSION = 'v1-local-yamnet';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        store.createIndex('videoId', 'videoId', { unique: false });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(YAMNET_STORE_NAME)) {
        const yamnetStore = db.createObjectStore(YAMNET_STORE_NAME, { keyPath: 'cacheKey' });
        yamnetStore.createIndex('videoId', 'videoId', { unique: false });
        yamnetStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

/**
 * Builds a deterministic, version-pinned cache key.
 * Changing the model, taxonomy, instructions, duration, or schema produces a new key.
 */
export function buildAnalysisCacheKey(params: {
  videoId: string;
  duration: number;
  modelId?: string;
  instructionVersion?: string;
  taxonomyVersion?: string;
  schemaVersion?: string;
}): string {
  const cleanId = params.videoId.trim();
  const durRounded = Math.round((params.duration || 0) * 10) / 10;
  const mId = params.modelId || CURRENT_MODEL_ID;
  const iVer = params.instructionVersion || INSTRUCTION_VERSION;
  const tVer = params.taxonomyVersion || TAXONOMY_VERSION;
  const sVer = params.schemaVersion || ANALYSIS_SCHEMA_VERSION;

  return `${cleanId}__dur${durRounded}__m_${mId}__inst_${iVer}__tax_${tVer}__sch_${sVer}`;
}

/**
 * Retrieves a cached full-track analysis from IndexedDB if the key and config match.
 */
export async function getCachedAnalysisFromDB(params: {
  videoId: string;
  duration: number;
  modelId?: string;
}): Promise<CachedAnalysisRecord | null> {
  try {
    const db = await openDatabase();
    const cacheKey = buildAnalysisCacheKey(params);

    return new Promise<CachedAnalysisRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const record = request.result as CachedAnalysisRecord | undefined;
        if (!record) return resolve(null);

        // Verify configuration matches current version
        if (
          record.metadata.taxonomyVersion !== TAXONOMY_VERSION ||
          record.metadata.schemaVersion !== ANALYSIS_SCHEMA_VERSION
        ) {
          return resolve(null);
        }

        resolve(record);
      };

      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[IndexedDB Cache] Read skipped or failed:', err);
    return null;
  }
}

/**
 * Saves a full-track analysis result into IndexedDB.
 */
export async function saveAnalysisToDB(
  params: { videoId: string; duration: number; modelId?: string },
  analysisResult: any
): Promise<void> {
  try {
    const db = await openDatabase();
    const cacheKey = buildAnalysisCacheKey(params);
    const metadata: AnalysisCacheMetadata = {
      videoId: params.videoId.trim(),
      duration: Math.round((params.duration || 0) * 10) / 10,
      modelId: params.modelId || CURRENT_MODEL_ID,
      instructionVersion: INSTRUCTION_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
    };

    const record: CachedAnalysisRecord = {
      cacheKey,
      videoId: metadata.videoId,
      duration: metadata.duration,
      metadata,
      analysisResult,
      cachedAt: Date.now(),
    };

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to save to IndexedDB.'));
    });
  } catch (err) {
    console.warn('[IndexedDB Cache] Write skipped or failed:', err);
  }
}

/**
 * Clears cached analysis for a specific video to allow explicit rerun.
 */
export async function clearCachedAnalysisFromDB(videoId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const cleanId = videoId.trim();

    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('videoId');
      const request = index.openCursor(IDBKeyRange.only(cleanId));

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[IndexedDB Cache] Invalidation failed:', err);
  }
}

// ============================================================================
// DEDICATED LOCAL YAMNET LIVE DETECTION CACHE (SEPARATE FROM GEMINI CACHE)
// ============================================================================

export interface YamnetCaptureRange {
  start: number;
  end: number;
}

export interface CachedYamnetAnalysisRecord {
  cacheKey: string;
  videoId: string;
  engine: 'yamnet';
  modelVersion: string;
  schemaVersion: string;
  taxonomyVersion: string;
  duration: number;
  capturedRanges: YamnetCaptureRange[];
  totalCapturedSeconds: number;
  isCompleteCapture: boolean;
  instrumentSegments: InstrumentTimelineSegment[];
  allDetectedInstruments: Array<{ name: string; family: string; role?: string; description?: string }>;
  cachedAt: number;
}

/**
 * Normalizes a YouTube video ID and builds a deterministic version-pinned cache key
 * exclusively for local YAMNet live detection results.
 */
export function buildYamnetCacheKey(params: {
  videoId: string;
  modelVersion?: string;
  schemaVersion?: string;
}): string {
  const cleanId = params.videoId.trim();
  const mVer = params.modelVersion || YAMNET_MODEL_VERSION;
  const sVer = params.schemaVersion || YAMNET_SCHEMA_VERSION;
  return `${cleanId}__eng_${YAMNET_CACHE_ENGINE}__m_${mVer}__sch_${sVer}`;
}

/**
 * Merges overlapping or contiguous captured playback intervals so partial vs complete
 * YAMNet capture coverage is accurately tracked across sessions.
 */
export function mergeYamnetCaptureRanges(
  ranges: YamnetCaptureRange[],
  gapTolerance: number = 0.5
): YamnetCaptureRange[] {
  const valid = ranges
    .filter(
      (r) =>
        typeof r?.start === 'number' &&
        typeof r?.end === 'number' &&
        Number.isFinite(r.start) &&
        Number.isFinite(r.end) &&
        r.end > r.start
    )
    .map((r) => ({
      start: Math.max(0, Math.round(r.start * 10) / 10),
      end: Math.round(r.end * 10) / 10,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: YamnetCaptureRange[] = [];
  for (const r of valid) {
    if (merged.length === 0) {
      merged.push({ ...r });
      continue;
    }
    const prev = merged[merged.length - 1];
    if (r.start <= prev.end + gapTolerance) {
      prev.end = Math.max(prev.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * Retrieves cached local YAMNet analysis for a normalized YouTube video ID.
 */
export async function getCachedYamnetAnalysisFromDB(
  videoId: string
): Promise<CachedYamnetAnalysisRecord | null> {
  try {
    const db = await openDatabase();
    const cacheKey = buildYamnetCacheKey({ videoId });

    return new Promise<CachedYamnetAnalysisRecord | null>((resolve) => {
      const tx = db.transaction(YAMNET_STORE_NAME, 'readonly');
      const store = tx.objectStore(YAMNET_STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const record = request.result as CachedYamnetAnalysisRecord | undefined;
        if (!record) return resolve(null);
        if (
          record.engine !== YAMNET_CACHE_ENGINE ||
          record.modelVersion !== YAMNET_MODEL_VERSION ||
          record.schemaVersion !== YAMNET_SCHEMA_VERSION
        ) {
          return resolve(null);
        }
        resolve(record);
      };

      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[YAMNet IndexedDB Cache] Read skipped or failed:', err);
    return null;
  }
}

/**
 * Persists local YAMNet live detection results into the dedicated yamnet_live_analyses store.
 * Never touches or overwrites full_track_analyses (Gemini).
 */
export async function saveYamnetAnalysisToDB(params: {
  videoId: string;
  duration: number;
  capturedRanges: YamnetCaptureRange[];
  instrumentSegments: InstrumentTimelineSegment[];
  allDetectedInstruments: Array<{ name: string; family: string; role?: string; description?: string }>;
}): Promise<CachedYamnetAnalysisRecord | null> {
  try {
    const db = await openDatabase();
    const cleanId = params.videoId.trim();
    const cacheKey = buildYamnetCacheKey({ videoId: cleanId });
    const mergedRanges = mergeYamnetCaptureRanges(params.capturedRanges);
    const totalCapturedSeconds =
      Math.round(mergedRanges.reduce((sum, r) => sum + (r.end - r.start), 0) * 10) / 10;
    const validDuration =
      typeof params.duration === 'number' && Number.isFinite(params.duration) && params.duration > 0
        ? Math.round(params.duration * 10) / 10
        : 0;
    const isCompleteCapture =
      validDuration > 0 && totalCapturedSeconds >= validDuration * 0.92;

    const record: CachedYamnetAnalysisRecord = {
      cacheKey,
      videoId: cleanId,
      engine: YAMNET_CACHE_ENGINE,
      modelVersion: YAMNET_MODEL_VERSION,
      schemaVersion: YAMNET_SCHEMA_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
      duration: validDuration,
      capturedRanges: mergedRanges,
      totalCapturedSeconds,
      isCompleteCapture,
      instrumentSegments: params.instrumentSegments,
      allDetectedInstruments: params.allDetectedInstruments,
      cachedAt: Date.now(),
    };

    return new Promise<CachedYamnetAnalysisRecord | null>((resolve, reject) => {
      const tx = db.transaction(YAMNET_STORE_NAME, 'readwrite');
      const store = tx.objectStore(YAMNET_STORE_NAME);
      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () =>
        reject(request.error || new Error('Failed to save YAMNet analysis to IndexedDB.'));
    });
  } catch (err) {
    console.warn('[YAMNet IndexedDB Cache] Write skipped or failed:', err);
    return null;
  }
}

/**
 * Clears cached YAMNet analysis for a specific video ID.
 */
export async function clearCachedYamnetAnalysisFromDB(videoId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const cleanId = videoId.trim();

    return new Promise<void>((resolve) => {
      const tx = db.transaction(YAMNET_STORE_NAME, 'readwrite');
      const store = tx.objectStore(YAMNET_STORE_NAME);
      const index = store.index('videoId');
      const request = index.openCursor(IDBKeyRange.only(cleanId));

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[YAMNet IndexedDB Cache] Invalidation failed:', err);
  }
}

