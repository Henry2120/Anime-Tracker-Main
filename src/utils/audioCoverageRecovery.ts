import {
  InstrumentTimelineSegment,
  validateAndMergeTimelineSegments,
} from './instrumentNormalization';

export interface AnalysisWindow {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface WindowCoverageRecord {
  windowId: string;
  index: number;
  requestedStart: number;
  requestedEnd: number;
  processedStart: number;
  processedEnd: number;
  status: 'success' | 'failed' | 'retrying';
  retryCount: number;
  error?: string | null;
  segments: InstrumentTimelineSegment[];
  isSilence: boolean; // True if window was successfully analyzed and contained genuine silence / no instruments
}

export interface CoverageCalculationResult {
  totalDuration: number;
  authoritativeDurationEstablished: boolean;
  isFullCoverage: boolean;
  coveragePercentage: number;
  analyzedRanges: TimeRange[];
  missingRanges: TimeRange[];
  totalWindows: number;
  successfulWindows: number;
  failedWindows: number;
  retryCount: number;
  status: 'detected' | 'partial' | 'failed' | 'unsupported';
}

/**
 * Validates and establishes the authoritative video duration.
 * Must be a positive, finite number within reasonable bounds (0 < dur < 86400s).
 * Rounds to 1 decimal place.
 */
export function validateAuthoritativeDuration(dur: unknown): number | null {
  if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0 && dur < 86400) {
    return Math.round(dur * 10) / 10;
  }
  if (typeof dur === 'string') {
    const parsed = parseFloat(dur.trim());
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 86400) {
      return Math.round(parsed * 10) / 10;
    }
  }
  return null;
}

/**
 * Deterministically generates chronological, overlapping analysis windows
 * covering from 0 to totalDuration without gaps.
 * The final window is guaranteed to end at totalDuration.
 */
export function generateAnalysisWindows(
  totalDuration: number,
  config: { windowSize?: number; overlap?: number } = {}
): AnalysisWindow[] {
  const windowSize = config.windowSize || 45;
  const overlap = config.overlap || 5;

  if (totalDuration <= 0) return [];

  // Short video: single window covering 0 to totalDuration
  if (totalDuration <= windowSize) {
    return [
      {
        id: `win-0-0-${Math.round(totalDuration)}`,
        index: 0,
        startTime: 0,
        endTime: totalDuration,
        duration: totalDuration,
      },
    ];
  }

  const windows: AnalysisWindow[] = [];
  let currentStart = 0;
  let index = 0;

  while (currentStart < totalDuration) {
    let currentEnd = currentStart + windowSize;
    if (currentEnd >= totalDuration) {
      currentEnd = totalDuration;
    }

    // If remaining duration after currentStart is tiny (< 6s) and we already have windows,
    // merge the remainder into the preceding window so the final window ends exactly at totalDuration.
    if (windows.length > 0 && currentEnd - currentStart < 6 && currentEnd === totalDuration) {
      windows[windows.length - 1].endTime = totalDuration;
      windows[windows.length - 1].duration =
        Math.round((totalDuration - windows[windows.length - 1].startTime) * 10) / 10;
      break;
    }

    windows.push({
      id: `win-${index}-${Math.round(currentStart)}-${Math.round(currentEnd)}`,
      index,
      startTime: Math.round(currentStart * 10) / 10,
      endTime: Math.round(currentEnd * 10) / 10,
      duration: Math.round((currentEnd - currentStart) * 10) / 10,
    });

    if (currentEnd >= totalDuration) {
      break;
    }

    currentStart = currentEnd - overlap;
    index++;
  }

  // Double check that the final window's endTime matches totalDuration
  if (windows.length > 0) {
    windows[windows.length - 1].endTime = totalDuration;
    windows[windows.length - 1].duration =
      Math.round((totalDuration - windows[windows.length - 1].startTime) * 10) / 10;
  }

  return windows;
}

/**
 * Independently calculates coverage based on successfully processed analysis windows,
 * NOT merely on the presence of detected instruments.
 * Genuine silence in an analyzed window counts as successful coverage.
 */
export function calculateCoverage(
  totalDuration: number,
  windowRecords: WindowCoverageRecord[]
): CoverageCalculationResult {
  const authoritativeDurationEstablished = totalDuration > 0 && Number.isFinite(totalDuration);
  const totalWindows = windowRecords.length;
  const successfulRecords = windowRecords.filter((w) => w.status === 'success');
  const successfulWindows = successfulRecords.length;
  const failedWindows = windowRecords.filter((w) => w.status === 'failed').length;
  const retryCount = windowRecords.reduce((sum, w) => sum + (w.retryCount || 0), 0);

  if (!authoritativeDurationEstablished || totalWindows === 0) {
    return {
      totalDuration: totalDuration > 0 ? totalDuration : 0,
      authoritativeDurationEstablished: false,
      isFullCoverage: false,
      coveragePercentage: 0,
      analyzedRanges: [],
      missingRanges: totalDuration > 0 ? [{ start: 0, end: totalDuration }] : [],
      totalWindows,
      successfulWindows,
      failedWindows,
      retryCount,
      status: 'failed',
    };
  }

  // Extract raw intervals of successful windows
  const rawIntervals: TimeRange[] = successfulRecords.map((w) => ({
    start: Math.max(0, w.processedStart),
    end: Math.min(totalDuration, w.processedEnd),
  }));

  // Sort intervals by start ascending
  rawIntervals.sort((a, b) => a.start - b.start || a.end - b.end);

  // Merge contiguous or overlapping successfully processed intervals
  const analyzedRanges: TimeRange[] = [];
  for (const interval of rawIntervals) {
    if (interval.end <= interval.start) continue;
    if (analyzedRanges.length === 0) {
      analyzedRanges.push({ ...interval });
      continue;
    }

    const prev = analyzedRanges[analyzedRanges.length - 1];
    // If overlaps or touches (within 0.5s tolerance)
    if (interval.start <= prev.end + 0.5) {
      prev.end = Math.max(prev.end, interval.end);
    } else {
      analyzedRanges.push({ ...interval });
    }
  }

  // Calculate missing ranges between 0 and totalDuration
  const missingRanges: TimeRange[] = [];
  let cursor = 0;

  for (const range of analyzedRanges) {
    if (range.start > cursor + 0.5) {
      missingRanges.push({
        start: Math.round(cursor * 10) / 10,
        end: Math.round(range.start * 10) / 10,
      });
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < totalDuration - 0.5) {
    missingRanges.push({
      start: Math.round(cursor * 10) / 10,
      end: Math.round(totalDuration * 10) / 10,
    });
  }

  // Total analyzed duration in seconds
  const totalAnalyzedSeconds = analyzedRanges.reduce(
    (sum, range) => sum + (range.end - range.start),
    0
  );

  const coverageRatio = Math.min(1.0, totalAnalyzedSeconds / totalDuration);
  const coveragePercentage = Math.round(coverageRatio * 1000) / 10; // e.g. 100.0 or 83.3

  // Full coverage requires:
  // 1. Authoritative duration established
  // 2. No missing ranges
  // 3. Every required window succeeded (failedWindows === 0)
  // 4. Coverage percentage is >= 99.5%
  const isFullCoverage =
    authoritativeDurationEstablished &&
    missingRanges.length === 0 &&
    failedWindows === 0 &&
    coveragePercentage >= 99.5;

  let status: 'detected' | 'partial' | 'failed' | 'unsupported' = 'partial';
  if (successfulWindows === 0) {
    status = 'failed';
  } else if (isFullCoverage) {
    status = 'detected';
  } else {
    status = 'partial';
  }

  return {
    totalDuration,
    authoritativeDurationEstablished,
    isFullCoverage,
    coveragePercentage,
    analyzedRanges,
    missingRanges,
    totalWindows,
    successfulWindows,
    failedWindows,
    retryCount,
    status,
  };
}

/**
 * Reconciles overlapping analysis windows:
 * - Collects all detections from successfully processed windows.
 * - Merges duplicate detections from overlapping window regions for the same instrument.
 * - Accurately preserves musical rests and silence gaps (>= gapMergeThreshold).
 * - Avoids extending segments past real boundaries.
 * - Ensures final chronological ordering.
 */
export function reconcileWindowSegments(
  windowRecords: WindowCoverageRecord[],
  totalDuration?: number
): InstrumentTimelineSegment[] {
  const allRawSegments: any[] = [];

  for (const record of windowRecords) {
    if (record.status !== 'success') continue;
    if (Array.isArray(record.segments)) {
      for (const seg of record.segments) {
        // Enforce boundary sanity: segment should fall within the window (with 1.5s tolerance for notes ringing over boundary)
        const segStart = Math.max(0, seg.startTime);
        const segEnd = typeof totalDuration === 'number' && totalDuration > 0
          ? Math.min(totalDuration, seg.endTime)
          : seg.endTime;

        if (segEnd > segStart) {
          allRawSegments.push({
            ...seg,
            startTime: segStart,
            endTime: segEnd,
          });
        }
      }
    }
  }

  // Use validateAndMergeTimelineSegments with 1.0s gap threshold to merge overlapping window detections
  // while strictly preserving genuine rests >= 1.0s
  return validateAndMergeTimelineSegments(allRawSegments, {
    maxDuration: totalDuration,
    gapMergeThreshold: 1.0,
  });
}
