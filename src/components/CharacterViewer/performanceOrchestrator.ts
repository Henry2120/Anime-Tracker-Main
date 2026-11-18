import { InstrumentTimelineSegment, isSegmentActiveAtTime } from '../../utils/instrumentNormalization';
import { YAMNET_VOCAL_CATEGORY, YamnetTargetInstrumentName } from '../../utils/yamnetLabelMap';
import {
  PerformerMappingEntry,
  getPerformerForInstrument,
  mapInstrumentNameToPerformerTarget,
  resolvePerformerMapping,
} from './performerRegistry';

export type PerformanceMode = 'automatic' | 'manual';

export type DetectionSourceMode = 'yamnet' | 'ai_full_track' | 'hybrid';

export type ActivePerformerAudioSource = 'yamnet' | 'ai_full_track' | 'both';

export type PerformerOrigin = 'auto' | 'manual';

export type PerformerLifecycleState =
  | 'loading'
  | 'idle'
  | 'playing'
  | 'grace_waiting'
  | 'error';

export interface StagedPerformerRecord {
  key: string; // Canonical key (instrumentName for mapped performers, or instanceId/characterId for unmapped manual chars)
  characterId: string;
  characterName: string;
  instrumentName: YamnetTargetInstrumentName | null;
  origin: PerformerOrigin;
  lifecycle: PerformerLifecycleState;
  instanceId: string | null;
  lastDetectedAtMs: number | null;
  graceDeadlineMs: number | null;
  activeSource?: ActivePerformerAudioSource | null;
  confidence?: number;
  errorMessage?: string;
  errorTimestampMs?: number;
}

export interface OrchestratorState {
  mode: PerformanceMode;
  detectionSource: DetectionSourceMode;
  videoId: string | null;
  lastPlaybackTime: number;
  lastUpdatedAtMs?: number;
  performers: Record<string, StagedPerformerRecord>;
}

export interface OrchestratorLoadRequest {
  key: string;
  mapping: PerformerMappingEntry;
  initialState: 'idle' | 'playing';
}

export interface OrchestratorAnimationDirective {
  instanceId: string;
  key: string;
  targetState: 'idle' | 'playing';
  mapping: PerformerMappingEntry | null;
}

export interface OrchestratorStepInput {
  state: OrchestratorState;
  mode: PerformanceMode;
  detectionSource?: DetectionSourceMode;
  videoId: string | null;
  currentTime: number;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  segments: InstrumentTimelineSegment[];
  aiSegments?: InstrumentTimelineSegment[];
  gracePeriodMs: number;
  nowMs: number;
  errorCooldownMs?: number;
}

export interface OrchestratorStepResult {
  nextState: OrchestratorState;
  activeInstruments: YamnetTargetInstrumentName[];
  activeVocals: boolean;
  sourceByInstrument: Partial<Record<YamnetTargetInstrumentName, ActivePerformerAudioSource>>;
  loadRequests: OrchestratorLoadRequest[];
  removeInstanceIds: string[];
  animationDirectives: OrchestratorAnimationDirective[];
  reconciledVideoSwitch: boolean;
  reconciledModeSwitch: boolean;
  reconciledSourceSwitch: boolean;
  reconciledSeek: boolean;
}

export function createInitialOrchestratorState(
  mode: PerformanceMode = 'automatic',
  videoId: string | null = null,
  detectionSource: DetectionSourceMode = 'yamnet'
): OrchestratorState {
  return {
    mode,
    detectionSource,
    videoId,
    lastPlaybackTime: 0,
    performers: {},
  };
}

/**
 * Computes active assignable instruments and independent Vocals flag at currentTime.
 * Vocals is NEVER included in activeInstruments.
 */
export function evaluateActiveAudioCategories(
  segments: InstrumentTimelineSegment[],
  currentTime: number,
  options: { allowAiAliases?: boolean } = {}
): {
  activeInstruments: YamnetTargetInstrumentName[];
  activeVocals: boolean;
  confidenceByInstrument: Partial<Record<YamnetTargetInstrumentName, number>>;
} {
  const activeSet = new Set<YamnetTargetInstrumentName>();
  const confidenceByInstrument: Partial<Record<YamnetTargetInstrumentName, number>> = {};
  let activeVocals = false;

  if (!Array.isArray(segments) || segments.length === 0) {
    return { activeInstruments: [], activeVocals: false, confidenceByInstrument };
  }

  for (const seg of segments) {
    if (!isSegmentActiveAtTime(seg, currentTime)) continue;

    if (
      seg.isVoice ||
      seg.instrumentName.trim().toLowerCase() === YAMNET_VOCAL_CATEGORY.canonicalName.toLowerCase()
    ) {
      activeVocals = true;
      continue;
    }

    const mapped = mapInstrumentNameToPerformerTarget(seg.instrumentName, seg.isVoice, options);
    if (mapped) {
      activeSet.add(mapped);
      const conf = typeof seg.confidence === 'number' ? seg.confidence : 0;
      const prev = confidenceByInstrument[mapped] ?? -1;
      if (conf > prev) {
        confidenceByInstrument[mapped] = conf;
      }
    }
  }

  return {
    activeInstruments: Array.from(activeSet),
    activeVocals,
    confidenceByInstrument,
  };
}

/**
 * Combines timestamped detections according to the selected DetectionSourceMode:
 * - 'yamnet': Live YAMNet detections only
 * - 'ai_full_track': Reused AI Full-Track Analysis segments only
 * - 'hybrid': Union of both (if either detects an instrument at currentTime, it is active)
 */
export function evaluateCombinedAudioSources(params: {
  sourceMode: DetectionSourceMode;
  yamnetSegments: InstrumentTimelineSegment[];
  aiSegments: InstrumentTimelineSegment[];
  currentTime: number;
}): {
  activeInstruments: YamnetTargetInstrumentName[];
  activeVocals: boolean;
  confidenceByInstrument: Partial<Record<YamnetTargetInstrumentName, number>>;
  sourceByInstrument: Partial<Record<YamnetTargetInstrumentName, ActivePerformerAudioSource>>;
} {
  const { sourceMode, yamnetSegments, aiSegments, currentTime } = params;

  if (sourceMode === 'yamnet') {
    const y = evaluateActiveAudioCategories(yamnetSegments, currentTime, { allowAiAliases: false });
    const sourceByInstrument: Partial<Record<YamnetTargetInstrumentName, ActivePerformerAudioSource>> = {};
    for (const inst of y.activeInstruments) {
      sourceByInstrument[inst] = 'yamnet';
    }
    return { ...y, sourceByInstrument };
  }

  if (sourceMode === 'ai_full_track') {
    const a = evaluateActiveAudioCategories(aiSegments, currentTime, { allowAiAliases: true });
    const sourceByInstrument: Partial<Record<YamnetTargetInstrumentName, ActivePerformerAudioSource>> = {};
    for (const inst of a.activeInstruments) {
      sourceByInstrument[inst] = 'ai_full_track';
    }
    return { ...a, sourceByInstrument };
  }

  // Hybrid: union across Live YAMNet and AI Full-Track Analysis
  const y = evaluateActiveAudioCategories(yamnetSegments, currentTime, { allowAiAliases: false });
  const a = evaluateActiveAudioCategories(aiSegments, currentTime, { allowAiAliases: true });

  const yamnetSet = new Set(y.activeInstruments);
  const aiSet = new Set(a.activeInstruments);
  const unionSet = new Set<YamnetTargetInstrumentName>([...y.activeInstruments, ...a.activeInstruments]);

  const confidenceByInstrument: Partial<Record<YamnetTargetInstrumentName, number>> = {};
  const sourceByInstrument: Partial<Record<YamnetTargetInstrumentName, ActivePerformerAudioSource>> = {};

  for (const inst of unionSet) {
    const yConf = y.confidenceByInstrument[inst] ?? -1;
    const aConf = a.confidenceByInstrument[inst] ?? -1;
    if (Math.max(yConf, aConf) >= 0) {
      confidenceByInstrument[inst] = Math.max(yConf, aConf);
    }
    const inY = yamnetSet.has(inst);
    const inA = aiSet.has(inst);
    sourceByInstrument[inst] = inY && inA ? 'both' : inY ? 'yamnet' : 'ai_full_track';
  }

  return {
    activeInstruments: Array.from(unionSet),
    activeVocals: y.activeVocals || a.activeVocals,
    confidenceByInstrument,
    sourceByInstrument,
  };
}

/**
 * Builds canonical deduplication key for a performer so duplicate character or instrument
 * instances cannot exist on stage at the same time.
 */
export function buildPerformerKey(
  mapping: PerformerMappingEntry | null,
  characterId: string,
  instanceId?: string | null
): string {
  if (mapping) {
    return `inst:${mapping.instrumentName.toLowerCase()}`;
  }
  return `char:${characterId.toLowerCase()}${instanceId ? `:${instanceId}` : ''}`;
}

/**
 * Pure deterministic orchestrator step.
 * - Performers remain persistently on stage once added in both Automatic and Manual modes.
 * - Never removes performers on silence, pauses, stops, seeks, or grace expiration.
 * - Cross-track video switches clean up previously auto-staged performers so stale song casts don't linger.
 * - Grace / Hold window is used strictly as anti-flicker animation smoothing before returning to idle.
 */
export function stepPerformanceOrchestrator(
  input: OrchestratorStepInput
): OrchestratorStepResult {
  const {
    state,
    mode,
    detectionSource = 'yamnet',
    videoId,
    currentTime,
    isPlaying,
    isPaused,
    isStopped,
    segments,
    aiSegments = [],
    gracePeriodMs,
    nowMs,
    errorCooldownMs = 15000,
  } = input;

  const safeGraceMs = Math.max(0, Number.isFinite(gracePeriodMs) ? gracePeriodMs : 1000);
  const nextPerformers: Record<string, StagedPerformerRecord> = {};
  const loadRequests: OrchestratorLoadRequest[] = [];
  const removeInstanceIds: string[] = [];
  const animationDirectives: OrchestratorAnimationDirective[] = [];

  const videoChanged =
    Boolean(state.videoId) && Boolean(videoId) && state.videoId !== videoId;
  const modeChanged = state.mode !== mode;
  const sourceChanged = (state.detectionSource || 'yamnet') !== detectionSource;
  const hasPreviousTick = state.lastUpdatedAtMs !== undefined;
  const dtWallSec = hasPreviousTick
    ? Math.max(0, (nowMs - state.lastUpdatedAtMs!) / 1000)
    : 0;
  const maxExpectedForwardDelta = Math.max(1.5, dtWallSec * 2.5 + 1.2);
  const forwardDelta = currentTime - state.lastPlaybackTime;
  const isSeekJump =
    hasPreviousTick &&
    !videoChanged &&
    (forwardDelta > maxExpectedForwardDelta || currentTime < state.lastPlaybackTime - 0.6);

  // Clone current records (handling video switch and mode transition cleanly)
  for (const [key, rec] of Object.entries(state.performers)) {
    if (videoChanged && rec.origin === 'auto') {
      if (rec.instanceId) {
        removeInstanceIds.push(rec.instanceId);
      }
      continue;
    }

    const cloned: StagedPerformerRecord = { ...rec };

    if (videoChanged && rec.origin === 'manual') {
      cloned.lifecycle = cloned.instanceId ? 'idle' : cloned.lifecycle;
      cloned.graceDeadlineMs = null;
      cloned.activeSource = null;
    }

    if (modeChanged) {
      if (state.mode === 'automatic' && mode === 'manual') {
        // Auto -> Manual: preserve currently staged performers as manual
        cloned.origin = 'manual';
        cloned.graceDeadlineMs = null;
        if (cloned.lifecycle === 'grace_waiting') {
          cloned.lifecycle = cloned.instanceId ? 'playing' : 'loading';
        }
      } else if (state.mode === 'manual' && mode === 'automatic') {
        // Manual -> Auto: preserve loaded models without reload & allow new auto spawns
        cloned.origin = 'auto';
        cloned.graceDeadlineMs = null;
      }
    }

    nextPerformers[key] = cloned;
  }

  const { activeInstruments, activeVocals, confidenceByInstrument, sourceByInstrument } =
    evaluateCombinedAudioSources({
      sourceMode: detectionSource,
      yamnetSegments: segments,
      aiSegments,
      currentTime,
    });

  const activeInstrumentSet = new Set<YamnetTargetInstrumentName>(activeInstruments);

  // When paused or stopped, characters do not actively play instruments
  const effectiveActiveForPlaying = isPlaying
    ? activeInstrumentSet
    : new Set<YamnetTargetInstrumentName>();

  // 1. Update existing staged performers (presence is persistent; only animation state changes)
  for (const [key, rec] of Object.entries(nextPerformers)) {
    const shouldPlayNow =
      isPlaying && rec.instrumentName !== null && effectiveActiveForPlaying.has(rec.instrumentName);
    const mapping = rec.instrumentName ? getPerformerForInstrument(rec.instrumentName) : null;

    if (rec.lifecycle === 'error') {
      // Allow retry after cooldown in Automatic mode only when instrument becomes active again
      if (
        mode === 'automatic' &&
        shouldPlayNow &&
        mapping &&
        rec.errorTimestampMs !== undefined &&
        nowMs - rec.errorTimestampMs >= errorCooldownMs
      ) {
        rec.lifecycle = 'loading';
        rec.errorMessage = undefined;
        rec.graceDeadlineMs = null;
        rec.activeSource = rec.instrumentName ? sourceByInstrument[rec.instrumentName] ?? null : null;
        loadRequests.push({
          key,
          mapping,
          initialState: 'playing',
        });
      }
      continue;
    }

    if (rec.lifecycle === 'loading') {
      // Loading already in flight — keep slot reserved to prevent duplicate downloads
      if (shouldPlayNow && rec.instrumentName) {
        rec.lastDetectedAtMs = nowMs;
        rec.graceDeadlineMs = null;
        rec.activeSource = sourceByInstrument[rec.instrumentName] ?? null;
      }
      continue;
    }

    // Loaded performer on stage — ALWAYS stays on stage until manual remove/Clear/video switch
    if (shouldPlayNow) {
      rec.lifecycle = 'playing';
      rec.lastDetectedAtMs = nowMs;
      rec.graceDeadlineMs = null;
      if (rec.instrumentName) {
        rec.confidence = confidenceByInstrument[rec.instrumentName];
        rec.activeSource = sourceByInstrument[rec.instrumentName] ?? null;
      }
      if (rec.instanceId) {
        animationDirectives.push({
          instanceId: rec.instanceId,
          key,
          targetState: 'playing',
          mapping,
        });
      }
      continue;
    }

    // Instrument not actively detected OR playback paused/stopped
    if (!isPlaying || isPaused || isStopped || isSeekJump || sourceChanged || safeGraceMs === 0) {
      // Immediately settle to idle when playback is paused/stopped, seeked, source switched, or smoothing is 0ms
      rec.lifecycle = 'idle';
      rec.graceDeadlineMs = null;
      rec.activeSource = null;
      if (rec.instanceId) {
        animationDirectives.push({
          instanceId: rec.instanceId,
          key,
          targetState: 'idle',
          mapping,
        });
      }
      continue;
    }

    // Continuous playback smoothing / anti-flicker hold: brief dropouts hold playing animation, then settle cleanly to idle
    const wasPlayingOrHolding =
      rec.lifecycle === 'playing' || rec.lifecycle === 'grace_waiting';

    if (wasPlayingOrHolding) {
      if (rec.lifecycle === 'playing' || rec.graceDeadlineMs === null) {
        rec.lifecycle = 'grace_waiting';
        rec.graceDeadlineMs = nowMs + safeGraceMs;
        if (rec.instanceId) {
          animationDirectives.push({
            instanceId: rec.instanceId,
            key,
            targetState: 'playing',
            mapping,
          });
        }
      } else if (nowMs < rec.graceDeadlineMs) {
        if (rec.instanceId) {
          animationDirectives.push({
            instanceId: rec.instanceId,
            key,
            targetState: 'playing',
            mapping,
          });
        }
      } else {
        // Hold window expired -> transition smoothly back to idle, NEVER remove performer from stage
        rec.lifecycle = 'idle';
        rec.graceDeadlineMs = null;
        rec.activeSource = null;
        if (rec.instanceId) {
          animationDirectives.push({
            instanceId: rec.instanceId,
            key,
            targetState: 'idle',
            mapping,
          });
        }
      }
    } else {
      rec.lifecycle = 'idle';
      rec.graceDeadlineMs = null;
      rec.activeSource = null;
      if (rec.instanceId) {
        animationDirectives.push({
          instanceId: rec.instanceId,
          key,
          targetState: 'idle',
          mapping,
        });
      }
    }
  }

  // 2. Automatic mode: spawn newly detected active instruments that are not staged yet
  if (mode === 'automatic' && isPlaying) {
    for (const instName of activeInstruments) {
      const mapping = getPerformerForInstrument(instName);
      if (!mapping) continue;

      const key = buildPerformerKey(mapping, mapping.characterId);
      const existing = nextPerformers[key];

      // Also check if another performer with the same characterId is already staged
      const alreadyHasSameCharacter = Object.values(nextPerformers).some(
        (p) =>
          p.characterId.toLowerCase() === mapping.characterId.toLowerCase() ||
          mapping.alternateCharacterIds.some(
            (alt) => alt.toLowerCase() === p.characterId.toLowerCase()
          )
      );

      if (existing || alreadyHasSameCharacter) {
        continue;
      }

      nextPerformers[key] = {
        key,
        characterId: mapping.characterId,
        characterName: mapping.characterName,
        instrumentName: instName,
        origin: 'auto',
        lifecycle: 'loading',
        instanceId: null,
        lastDetectedAtMs: nowMs,
        graceDeadlineMs: null,
        activeSource: sourceByInstrument[instName] ?? null,
        confidence: confidenceByInstrument[instName],
      };

      loadRequests.push({
        key,
        mapping,
        initialState: 'playing',
      });
    }
  }

  return {
    nextState: {
      mode,
      detectionSource,
      videoId,
      lastPlaybackTime: currentTime,
      lastUpdatedAtMs: nowMs,
      performers: nextPerformers,
    },
    activeInstruments,
    activeVocals,
    sourceByInstrument,
    loadRequests,
    removeInstanceIds: Array.from(new Set(removeInstanceIds)),
    animationDirectives,
    reconciledVideoSwitch: videoChanged,
    reconciledModeSwitch: modeChanged,
    reconciledSourceSwitch: sourceChanged,
    reconciledSeek: isSeekJump,
  };
}

/**
 * Registers a manually staged or completed auto-loaded character instance into the orchestrator state
 * without allowing duplicate character or instrument entries.
 */
export function registerLoadedPerformer(
  state: OrchestratorState,
  params: {
    instanceId: string;
    characterId: string;
    characterName: string;
    filename?: string;
    origin: PerformerOrigin;
    nowMs: number;
    isPlayingNow?: boolean;
  }
): OrchestratorState {
  const mapping = resolvePerformerMapping({
    id: params.characterId,
    filename: params.filename,
  });
  const key = buildPerformerKey(mapping, params.characterId, mapping ? undefined : params.instanceId);

  const prev = state.performers[key];
  const nextRecord: StagedPerformerRecord = {
    key,
    characterId: params.characterId,
    characterName: params.characterName,
    instrumentName: mapping ? mapping.instrumentName : null,
    origin: prev ? prev.origin : params.origin,
    lifecycle: params.isPlayingNow ? 'playing' : 'idle',
    instanceId: params.instanceId,
    lastDetectedAtMs: prev?.lastDetectedAtMs ?? params.nowMs,
    graceDeadlineMs: null,
    activeSource: params.isPlayingNow ? prev?.activeSource ?? null : null,
    confidence: prev?.confidence,
  };

  return {
    ...state,
    performers: {
      ...state.performers,
      [key]: nextRecord,
    },
  };
}

/**
 * Records a GLB load failure cleanly for one performer so other performers remain unaffected.
 */
export function markPerformerLoadFailed(
  state: OrchestratorState,
  key: string,
  errorMessage: string,
  nowMs: number
): OrchestratorState {
  const existing = state.performers[key];
  if (!existing) return state;

  return {
    ...state,
    performers: {
      ...state.performers,
      [key]: {
        ...existing,
        lifecycle: 'error',
        instanceId: null,
        errorMessage,
        errorTimestampMs: nowMs,
        graceDeadlineMs: null,
      },
    },
  };
}

/**
 * Checks whether adding a character manually would duplicate an already-staged character/instrument.
 */
export function findDuplicateStagedPerformer(
  state: OrchestratorState,
  candidate: { id?: string; filename?: string }
): StagedPerformerRecord | null {
  const candidateMapping = resolvePerformerMapping(candidate);
  const candidateId = (candidate.id || '').trim().toLowerCase();

  for (const rec of Object.values(state.performers)) {
    if (candidateMapping && rec.instrumentName === candidateMapping.instrumentName) {
      return rec;
    }
    if (candidateId && rec.characterId.toLowerCase() === candidateId) {
      return rec;
    }
    if (
      candidateMapping &&
      candidateMapping.alternateCharacterIds.some(
        (alt) => alt.toLowerCase() === rec.characterId.toLowerCase()
      )
    ) {
      return rec;
    }
  }
  return null;
}

/**
 * Removes a performer from orchestrator state by instanceId (used when user removes single model).
 */
export function removePerformerByInstanceId(
  state: OrchestratorState,
  instanceId: string
): OrchestratorState {
  const nextPerformers: Record<string, StagedPerformerRecord> = {};
  for (const [k, v] of Object.entries(state.performers)) {
    if (v.instanceId !== instanceId) {
      nextPerformers[k] = v;
    }
  }
  return {
    ...state,
    performers: nextPerformers,
  };
}
