import {
  InstrumentTimelineSegment,
  parseTimelineSegments,
  isVoiceInstrument,
} from '../../utils/instrumentNormalization';
import { YAMNET_VOCAL_CATEGORY, YamnetTargetInstrumentName } from '../../utils/yamnetLabelMap';
import {
  PerformerMappingEntry,
  getPerformerForInstrument,
  mapInstrumentNameToPerformerTarget,
} from './performerRegistry';

export interface TimeRange {
  start: number;
  end: number;
}

export interface AiAnalysisCompletionCheck {
  isComplete: boolean;
  completionStatus: 'ready' | 'incomplete' | 'failed';
  completionReason: string | null;
  duration: number;
  coveragePercentage: number;
  totalWindows: number;
  successfulWindows: number;
  failedWindows: number;
  missingRanges: TimeRange[];
}

export interface AiConcertRosterEntry {
  key: string;
  instrumentName: YamnetTargetInstrumentName;
  sourceLabels: string[];
  mapping: PerformerMappingEntry;
  segmentCount: number;
  firstStartTime: number;
  lastEndTime: number;
  totalActiveSeconds: number;
  assetVerified: boolean;
}

export interface AiDetectedInstrumentSummary {
  name: string;
  family: string;
  isVocals: boolean;
  mappedTarget: YamnetTargetInstrumentName | null;
  characterName: string | null;
  segmentCount: number;
  firstStartTime: number;
  lastEndTime: number;
}

export interface AiConcertPerformancePlan {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  isComplete: boolean;
  completionStatus: 'ready' | 'incomplete' | 'failed';
  completionReason: string | null;
  coveragePercentage: number;
  totalWindows: number;
  successfulWindows: number;
  failedWindows: number;
  missingRanges: TimeRange[];
  segments: InstrumentTimelineSegment[];
  detectedInstruments: AiDetectedInstrumentSummary[];
  roster: AiConcertRosterEntry[];
  unmappedInstruments: string[];
  vocalsDetected: boolean;
  vocalSegmentsCount: number;
  analysisSummary: string;
  fromCache: boolean;
  generatedAt: number;
}

/**
 * Formats seconds as MM:SS for crisp tabular UI rendering.
 */
export function formatConcertTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Strictly validates whether a backend or cached AI analysis covers the entire song
 * without failed windows or missing coverage ranges.
 * Never falsely marks incomplete or failed analyses as complete.
 */
export function validateAiAnalysisCompletion(data: any): AiAnalysisCompletionCheck {
  if (!data || data.success !== true) {
    return {
      isComplete: false,
      completionStatus: 'failed',
      completionReason:
        typeof data?.error === 'string' && data.error.trim()
          ? data.error.trim()
          : 'AI audio analysis did not succeed.',
      duration: 0,
      coveragePercentage: 0,
      totalWindows: 0,
      successfulWindows: 0,
      failedWindows: 0,
      missingRanges: [],
    };
  }

  const coverage = data.coverage;
  if (!coverage || typeof coverage !== 'object') {
    return {
      isComplete: false,
      completionStatus: 'incomplete',
      completionReason: 'Missing coverage metadata from AI analysis response.',
      duration: 0,
      coveragePercentage: 0,
      totalWindows: 0,
      successfulWindows: 0,
      failedWindows: 0,
      missingRanges: [],
    };
  }

  const duration =
    typeof coverage.totalDuration === 'number' && Number.isFinite(coverage.totalDuration)
      ? Math.max(0, coverage.totalDuration)
      : 0;
  const totalWindows = typeof coverage.totalWindows === 'number' ? coverage.totalWindows : 0;
  const successfulWindows =
    typeof coverage.successfulWindows === 'number' ? coverage.successfulWindows : 0;
  const failedWindows = typeof coverage.failedWindows === 'number' ? coverage.failedWindows : 0;
  const missingRanges: TimeRange[] = Array.isArray(coverage.missingRanges)
    ? coverage.missingRanges
        .filter(
          (r: any) =>
            r &&
            typeof r.start === 'number' &&
            typeof r.end === 'number' &&
            Number.isFinite(r.start) &&
            Number.isFinite(r.end) &&
            r.end > r.start
        )
        .map((r: any) => ({ start: r.start, end: r.end }))
    : [];

  const coveragePercentage =
    typeof coverage.coveragePercentage === 'number' && Number.isFinite(coverage.coveragePercentage)
      ? Math.round(coverage.coveragePercentage)
      : 0;

  const hasAuthoritativeDuration =
    coverage.authoritativeDurationEstablished !== false && duration > 0;

  const isStatusBad =
    data.status === 'error' ||
    data.status === 'failed' ||
    data.status === 'partial' ||
    data.status === 'missing_api_key' ||
    data.status === 'duration_unavailable';

  const isComplete =
    hasAuthoritativeDuration &&
    !isStatusBad &&
    totalWindows > 0 &&
    successfulWindows === totalWindows &&
    failedWindows === 0 &&
    missingRanges.length === 0 &&
    coverage.isFullCoverage === true;

  if (!isComplete) {
    const reasons: string[] = [];
    if (!hasAuthoritativeDuration) {
      reasons.push('authoritative video duration was not established');
    }
    if (failedWindows > 0) {
      reasons.push(`${failedWindows} of ${totalWindows} analysis window(s) failed`);
    }
    if (missingRanges.length > 0) {
      const formatted = missingRanges
        .slice(0, 3)
        .map((r) => `${formatConcertTimestamp(r.start)}–${formatConcertTimestamp(r.end)}`)
        .join(', ');
      reasons.push(`unresolved ranges: ${formatted}`);
    }
    if (coverage.isFullCoverage !== true && reasons.length === 0) {
      reasons.push(`partial track coverage (${coveragePercentage}%)`);
    }
    return {
      isComplete: false,
      completionStatus: 'incomplete',
      completionReason:
        reasons.length > 0
          ? `Incomplete track analysis: ${reasons.join('; ')}.`
          : 'Track analysis did not achieve full coverage.',
      duration,
      coveragePercentage,
      totalWindows,
      successfulWindows,
      failedWindows,
      missingRanges,
    };
  }

  return {
    isComplete: true,
    completionStatus: 'ready',
    completionReason: null,
    duration,
    coveragePercentage: Math.max(100, coveragePercentage),
    totalWindows,
    successfulWindows,
    failedWindows: 0,
    missingRanges: [],
  };
}

/**
 * Builds a complete AI-directed concert performance plan from a backend or cached AI analysis result.
 * Scans EVERY segment across the full duration [0..duration] (including late-entering instruments)
 * to generate the full upfront stage roster, while keeping Vocals strictly independent.
 */
export function buildAiConcertPerformancePlan(
  rawData: any,
  options: { videoIdOverride?: string; fromCache?: boolean } = {}
): AiConcertPerformancePlan {
  const completion = validateAiAnalysisCompletion(rawData);
  const videoId = (options.videoIdOverride || rawData?.videoId || '').trim();
  const title =
    typeof rawData?.title === 'string' && rawData.title.trim()
      ? rawData.title.trim()
      : `YouTube Track (${videoId || 'Unknown'})`;
  const artist = typeof rawData?.artist === 'string' ? rawData.artist.trim() : '';

  const segments = parseTimelineSegments(rawData?.instrumentSegments || [], {
    maxDuration: completion.duration > 0 ? completion.duration : undefined,
    gapMergeThreshold: 1.0,
  });

  const rosterMap = new Map<YamnetTargetInstrumentName, AiConcertRosterEntry>();
  const summaryMap = new Map<string, AiDetectedInstrumentSummary>();
  const unmappedSet = new Set<string>();
  let vocalsDetected = false;
  let vocalSegmentsCount = 0;

  for (const seg of segments) {
    const isVoice =
      Boolean(seg.isVoice) ||
      isVoiceInstrument(seg.instrumentName) ||
      seg.instrumentName.trim().toLowerCase() === YAMNET_VOCAL_CATEGORY.canonicalName.toLowerCase();

    const mappedTarget = isVoice
      ? null
      : mapInstrumentNameToPerformerTarget(seg.instrumentName, false, { allowAiAliases: true });
    const mapping = mappedTarget ? getPerformerForInstrument(mappedTarget) : null;

    if (isVoice) {
      vocalsDetected = true;
      vocalSegmentsCount += 1;
    }

    const summaryKey = seg.instrumentName.trim().toLowerCase();
    const existingSummary = summaryMap.get(summaryKey);
    if (existingSummary) {
      existingSummary.segmentCount += 1;
      existingSummary.firstStartTime = Math.min(existingSummary.firstStartTime, seg.startTime);
      existingSummary.lastEndTime = Math.max(existingSummary.lastEndTime, seg.endTime);
    } else {
      summaryMap.set(summaryKey, {
        name: seg.instrumentName,
        family: seg.family,
        isVocals: isVoice,
        mappedTarget,
        characterName: mapping ? mapping.characterName : null,
        segmentCount: 1,
        firstStartTime: seg.startTime,
        lastEndTime: seg.endTime,
      });
    }

    if (isVoice) {
      continue;
    }

    if (!mappedTarget || !mapping) {
      unmappedSet.add(seg.instrumentName);
      continue;
    }

    const spanSec = Math.max(0, seg.endTime - seg.startTime);
    const existingRoster = rosterMap.get(mappedTarget);
    if (existingRoster) {
      existingRoster.segmentCount += 1;
      existingRoster.firstStartTime = Math.min(existingRoster.firstStartTime, seg.startTime);
      existingRoster.lastEndTime = Math.max(existingRoster.lastEndTime, seg.endTime);
      existingRoster.totalActiveSeconds =
        Math.round((existingRoster.totalActiveSeconds + spanSec) * 10) / 10;
      if (!existingRoster.sourceLabels.includes(seg.instrumentName)) {
        existingRoster.sourceLabels.push(seg.instrumentName);
      }
    } else {
      rosterMap.set(mappedTarget, {
        key: `inst:${mapping.instrumentName.toLowerCase()}`,
        instrumentName: mappedTarget,
        sourceLabels: [seg.instrumentName],
        mapping,
        segmentCount: 1,
        firstStartTime: seg.startTime,
        lastEndTime: seg.endTime,
        totalActiveSeconds: Math.round(spanSec * 10) / 10,
        assetVerified:
          mapping.hasVerifiedInstrumentProp &&
          mapping.verificationStatus === 'verified' &&
          Boolean(mapping.url) &&
          Boolean(mapping.playingClip) &&
          Boolean(mapping.idleClip),
      });
    }
  }

  const roster = Array.from(rosterMap.values()).sort(
    (a, b) => a.firstStartTime - b.firstStartTime || a.instrumentName.localeCompare(b.instrumentName)
  );

  const detectedInstruments = Array.from(summaryMap.values()).sort(
    (a, b) => a.firstStartTime - b.firstStartTime || a.name.localeCompare(b.name)
  );

  return {
    videoId,
    title,
    artist,
    duration: completion.duration,
    isComplete: completion.isComplete,
    completionStatus: completion.completionStatus,
    completionReason: completion.completionReason,
    coveragePercentage: completion.coveragePercentage,
    totalWindows: completion.totalWindows,
    successfulWindows: completion.successfulWindows,
    failedWindows: completion.failedWindows,
    missingRanges: completion.missingRanges,
    segments,
    detectedInstruments,
    roster,
    unmappedInstruments: Array.from(unmappedSet).sort(),
    vocalsDetected,
    vocalSegmentsCount,
    analysisSummary:
      typeof rawData?.analysisSummary === 'string' ? rawData.analysisSummary : '',
    fromCache: Boolean(options.fromCache),
    generatedAt: Date.now(),
  };
}
