import {
  InstrumentTimelineSegment,
  validateAndMergeTimelineSegments,
} from './instrumentNormalization';

export type AudioAssessment =
  | 'instrumental_music'
  | 'silence'
  | 'non_instrument_audio'
  | 'uncertain';

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
  audioAssessment: AudioAssessment;
  isSilence: boolean; // Strictly true only if explicitly confirmed silence / rest
  needsRecovery?: boolean; // True if audioAssessment was instrumental_music/uncertain but 0 segments were returned
}

export interface CoverageCalculationResult {
  totalDuration: number;
  authoritativeDurationEstablished: boolean;
  isFullCoverage: boolean;
  coveragePercentage: number;
  analyzedRanges: TimeRange[];
  missingRanges: TimeRange[];
  confirmedSilentRanges: TimeRange[];
  nonInstrumentRanges: TimeRange[];
  uncertainRanges: TimeRange[];
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
 * Converts clip-relative timestamps returned by Gemini (starting at 0.0s for the clip)
 * to absolute video timestamps by adding the window's startTime.
 * Validates against clip boundaries and total video duration.
 */
export function convertClipRelativeSegments(
  clipSegments: Array<{
    instrumentName: string;
    family: string;
    startTime: number;
    endTime: number;
    evidence?: string;
    confidence?: number;
    audibility?: string;
  }>,
  windowStart: number,
  clipDuration: number,
  videoDuration: number
): InstrumentTimelineSegment[] {
  const results: InstrumentTimelineSegment[] = [];

  for (const raw of clipSegments) {
    if (typeof raw.startTime !== 'number' || typeof raw.endTime !== 'number') continue;
    if (isNaN(raw.startTime) || isNaN(raw.endTime)) continue;

    // Validate clip-relative timestamps: must fall within clip duration [0, clipDuration]
    const clipStart = Math.max(0, Math.min(clipDuration, raw.startTime));
    const clipEnd = Math.max(0, Math.min(clipDuration, raw.endTime));
    if (clipEnd <= clipStart) continue;

    // Convert to absolute video timestamps
    const absStart = Math.round((windowStart + clipStart) * 10) / 10;
    const absEnd = Math.round((windowStart + clipEnd) * 10) / 10;

    // Validate resulting absolute timestamps against full video duration
    const boundedStart = Math.max(0, Math.min(videoDuration, absStart));
    const boundedEnd = Math.max(0, Math.min(videoDuration, absEnd));
    if (boundedEnd <= boundedStart) continue;

    results.push({
      id: `seg-${Math.round(boundedStart * 10)}-${Math.round(boundedEnd * 10)}-${raw.instrumentName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      instrumentName: raw.instrumentName,
      family: raw.family as any,
      startTime: boundedStart,
      endTime: boundedEnd,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 90,
      audibility: (raw.audibility as any) || 'audible',
      evidence: raw.evidence,
    });
  }

  return results;
}

/**
 * Calculates uncovered gaps across the timeline where no instrument has been detected.
 * Returns intervals of at least minGapSeconds length.
 */
export function findUncoveredGaps(
  segments: InstrumentTimelineSegment[],
  totalDuration: number,
  minGapSeconds: number = 1.5
): TimeRange[] {
  if (totalDuration <= 0) return [];
  if (segments.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  // Compute union of all detected instrument intervals
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  const unionRanges: TimeRange[] = [];

  for (const seg of sorted) {
    if (unionRanges.length === 0) {
      unionRanges.push({ start: seg.startTime, end: seg.endTime });
      continue;
    }
    const prev = unionRanges[unionRanges.length - 1];
    if (seg.startTime <= prev.end + 0.2) {
      prev.end = Math.max(prev.end, seg.endTime);
    } else {
      unionRanges.push({ start: seg.startTime, end: seg.endTime });
    }
  }

  const gaps: TimeRange[] = [];
  let cursor = 0;

  for (const r of unionRanges) {
    if (r.start - cursor >= minGapSeconds) {
      gaps.push({
        start: Math.round(cursor * 10) / 10,
        end: Math.round(r.start * 10) / 10,
      });
    }
    cursor = Math.max(cursor, r.end);
  }

  if (totalDuration - cursor >= minGapSeconds) {
    gaps.push({
      start: Math.round(cursor * 10) / 10,
      end: Math.round(totalDuration * 10) / 10,
    });
  }

  return gaps;
}

/**
 * Checks whether an interval is already substantially covered by confirmed silence ranges.
 */
export function isRangeConfirmedSilent(
  range: TimeRange,
  confirmedSilentRanges: TimeRange[]
): boolean {
  for (const s of confirmedSilentRanges) {
    const overlapStart = Math.max(range.start, s.start);
    const overlapEnd = Math.min(range.end, s.end);
    if (overlapEnd > overlapStart) {
      const overlapDur = overlapEnd - overlapStart;
      const rangeDur = range.end - range.start;
      if (rangeDur > 0 && overlapDur / rangeDur >= 0.75) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Independently calculates coverage based on successfully processed analysis windows,
 * distinguishing audio coverage from instrument detection coverage.
 * Confirmed silence, non-instrument audio, and uncertain ranges are tracked separately.
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
      confirmedSilentRanges: [],
      nonInstrumentRanges: [],
      uncertainRanges: [],
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
    if (interval.start <= prev.end + 0.5) {
      prev.end = Math.max(prev.end, interval.end);
    } else {
      analyzedRanges.push({ ...interval });
    }
  }

  // Calculate missing window ranges between 0 and totalDuration
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

  // Confirmed silent ranges (explicit silence assessments)
  const confirmedSilentRanges: TimeRange[] = successfulRecords
    .filter((w) => w.audioAssessment === 'silence' || w.isSilence)
    .map((w) => ({ start: w.requestedStart, end: w.requestedEnd }));

  // Non-instrument ranges (speech, ambient sound)
  const nonInstrumentRanges: TimeRange[] = successfulRecords
    .filter((w) => w.audioAssessment === 'non_instrument_audio')
    .map((w) => ({ start: w.requestedStart, end: w.requestedEnd }));

  // Uncertain ranges requiring review
  const uncertainRanges: TimeRange[] = successfulRecords
    .filter((w) => w.audioAssessment === 'uncertain' || w.needsRecovery)
    .map((w) => ({ start: w.requestedStart, end: w.requestedEnd }));

  // Total analyzed duration in seconds
  const totalAnalyzedSeconds = analyzedRanges.reduce(
    (sum, range) => sum + (range.end - range.start),
    0
  );

  const coverageRatio = Math.min(1.0, totalAnalyzedSeconds / totalDuration);
  const coveragePercentage = Math.round(coverageRatio * 1000) / 10;

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
    confirmedSilentRanges,
    nonInstrumentRanges,
    uncertainRanges,
    totalWindows,
    successfulWindows,
    failedWindows,
    retryCount,
    status,
  };
}

/**
 * Reconciles overlapping analysis windows:
 * - Collects all detections from successfully processed windows and recovered intervals.
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
        const segStart = Math.max(0, seg.startTime);
        const segEnd =
          typeof totalDuration === 'number' && totalDuration > 0
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
