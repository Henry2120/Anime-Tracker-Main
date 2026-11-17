import type { AudioClassifier, AudioClassifierResult } from '@mediapipe/tasks-audio';
import {
  InstrumentTimelineSegment,
  InstrumentFamily,
  validateAndMergeTimelineSegments,
} from './instrumentNormalization';
import {
  YAMNET_TARGET_BY_NAME,
  YAMNET_VOCAL_CATEGORY,
  YamnetTargetInstrumentName,
  YamnetOutputCategoryName,
  ClassificationMode,
  AudioSetCategoryRole,
  RawAudioSetPrediction,
  TemporalHistoryLookup,
  ClosedSetCandidateDecision,
  AcousticFrameFeatures,
  VocalFrameEvaluation,
  VocalTemporalHistoryHint,
  extractAcousticFrameFeatures,
  resolveAudioSetToClosedSet17,
  evaluateVocalsIndependently,
  isSupportedYamnetInstrument,
  isSupportedYamnetCategory,
} from './yamnetLabelMap';

export const YAMNET_MODEL_PATH = '/yamnet/yamnet.tflite';
export const YAMNET_WASM_BASE_PATH = '/yamnet/wasm';
export const YAMNET_MODEL_VERSION = 'mediapipe-yamnet-float32-v1';

export interface YamnetCategoryPrediction {
  originalModelClass: string;
  canonicalName: YamnetOutputCategoryName;
  family: InstrumentFamily;
  isVoice: boolean;
  classificationMode: ClassificationMode;
  isFallback: boolean;
  isBroaderClass: boolean; // Kept for compatibility; true when inferred/best_match from broad class
  rawScore: number; // Original AudioSet score in [0, 1] preserved without minimum cutoff
  smoothedScore: number; // Exponential moving average across consecutive frames
  classificationConfidence: number; // Honest 0..100 confidence distinct from rawScore
  selectionEvidence: string;
  influencedByTemporalHistory: boolean;
}

export interface YamnetFrameDiagnostics {
  playbackStart: number;
  playbackEnd: number;
  topRawPredictions: Array<{
    categoryName: string;
    score: number;
    role: AudioSetCategoryRole;
  }>;
  selectedInstruments: Array<{
    instrument: YamnetTargetInstrumentName;
    classificationMode: ClassificationMode;
    isFallback: boolean;
    originalModelClass: string;
    rawScore: number;
    classificationConfidence: number;
    selectionEvidence: string;
    influencedByTemporalHistory: boolean;
    candidatePool?: YamnetTargetInstrumentName[];
  }>;
  vocalPrediction: YamnetCategoryPrediction | null;
  vocalEvaluation: {
    hasVocalEvidence: boolean;
    isSpeechWithoutSinging: boolean;
    speechScore: number;
    blockedReason: string | null;
    bridgedByHoldover: boolean;
    matchedLabels: Array<{ label: string; score: number; tier: 'exact' | 'inferred' }>;
  };
  isSilence: boolean;
  isSpeechDominant: boolean;
  isNonMusicalNoise: boolean;
  isMusicalAudio: boolean;
  bridgedByContinuity: boolean;
  silenceOrNonMusicalReason: string | null;
  emittedSegmentCount: number;
}

export interface YamnetFrameResult {
  playbackStart: number;
  playbackEnd: number;
  predictions: YamnetCategoryPrediction[];
  vocalPrediction: YamnetCategoryPrediction | null;
  rawTopCategories: Array<{ categoryName: string; score: number }>;
  isSilence: boolean;
  isSpeechDominant: boolean;
  isNonMusicalNoise: boolean;
  bridgedByContinuity: boolean;
  segments: InstrumentTimelineSegment[];
  diagnostics: YamnetFrameDiagnostics;
}

// Singleton MediaPipe AudioClassifier instance reused across capture sessions
let classifierInstance: AudioClassifier | null = null;
let classifierInitPromise: Promise<AudioClassifier> | null = null;

/**
 * Initializes and returns the singleton browser-side MediaPipe AudioClassifier
 * using locally hosted WASM binaries (/yamnet/wasm) and YAMNet TFLite model (/yamnet/yamnet.tflite).
 * Requests all 521 AudioSet categories (with clean fallback if runtime limits maxResults) so
 * quiet singing buried below loud instruments (beyond top-15) remains inspectable by Stage B.
 */
export async function getOrInitializeYamnetClassifier(): Promise<AudioClassifier> {
  if (classifierInstance) {
    return classifierInstance;
  }

  if (classifierInitPromise) {
    return classifierInitPromise;
  }

  classifierInitPromise = (async () => {
    try {
      const { AudioClassifier, FilesetResolver } = await import('@mediapipe/tasks-audio');
      const audioFileset = await FilesetResolver.forAudioTasks(YAMNET_WASM_BASE_PATH);

      const candidateMaxResults = [521, 128, 64];
      let classifier: AudioClassifier | null = null;
      let lastError: unknown = null;

      for (const maxRes of candidateMaxResults) {
        try {
          classifier = await AudioClassifier.createFromOptions(audioFileset, {
            baseOptions: {
              modelAssetPath: YAMNET_MODEL_PATH,
            },
            // Retrieve full AudioSet logits per frame with NO arbitrary scoreThreshold filtering
            maxResults: maxRes,
          });
          break;
        } catch (optErr) {
          lastError = optErr;
        }
      }

      if (!classifier) {
        throw lastError || new Error('Failed to initialize MediaPipe AudioClassifier');
      }

      classifier.setDefaultSampleRate(16000);
      classifierInstance = classifier;
      return classifier;
    } catch (err) {
      classifierInitPromise = null;
      throw err;
    }
  })();

  return classifierInitPromise;
}

/**
 * Releases the cached classifier instance (primarily for explicit cleanup / testing).
 */
export function disposeYamnetClassifier(): void {
  if (classifierInstance) {
    try {
      classifierInstance.close();
    } catch {}
    classifierInstance = null;
  }
  classifierInitPromise = null;
}

interface TemporalInstrumentState {
  emaScore: number;
  consecutiveFrames: number;
  framesSinceLastSeen: number;
  lastMode: ClassificationMode;
  lastOriginalClass: string;
  lastRawScore: number;
  family: InstrumentFamily;
}

/**
 * Dedicated, independent temporal tracker for the unified 18th category ("Vocals").
 *
 * Ensures singing phrases stay smooth across brief syllable/breath dips (up to 2 frames)
 * while decaying immediately on genuine silence or speech-dominant spoken dialogue,
 * completely decoupled from active instrument scores so loud instruments never suppress Vocals.
 */
export class VocalTemporalTracker {
  private emaScore = 0;
  private activeConsecutiveFrames = 0;
  private framesSinceVocalEvidence = 999;
  private holdoverRemaining = 0;
  private lastMode: 'exact' | 'inferred' = 'exact';
  private lastOriginalClass = '';
  private lastRawScore = 0;

  private readonly emaAlpha = 0.55;
  private readonly maxHoldoverFrames = 2;

  public reset(): void {
    this.emaScore = 0;
    this.activeConsecutiveFrames = 0;
    this.framesSinceVocalEvidence = 999;
    this.holdoverRemaining = 0;
    this.lastMode = 'exact';
    this.lastOriginalClass = '';
    this.lastRawScore = 0;
  }

  public evaluateFrame(params: {
    categories: RawAudioSetPrediction[];
    acousticFeatures?: AcousticFrameFeatures;
    inputRms?: number;
  }): {
    prediction: YamnetCategoryPrediction | null;
    evaluation: VocalFrameEvaluation;
    bridgedByHoldover: boolean;
    activeConsecutiveFrames: number;
  } {
    const { categories, acousticFeatures, inputRms } = params;

    const historyHint: VocalTemporalHistoryHint | undefined =
      this.framesSinceVocalEvidence <= 4
        ? {
            emaScore: this.emaScore,
            activeConsecutiveFrames: this.activeConsecutiveFrames,
            framesSinceVocalEvidence: this.framesSinceVocalEvidence,
          }
        : undefined;

    const evaluation = evaluateVocalsIndependently({
      categories,
      vocalHistory: historyHint,
      acousticFeatures,
      inputRms,
    });

    // Silence or speech-dominant non-singing dialogue -> stop vocal holdover immediately
    if (evaluation.isSilence || evaluation.isSpeechWithoutSinging) {
      this.holdoverRemaining = 0;
      this.emaScore = this.emaScore * 0.25;
      this.activeConsecutiveFrames = 0;
      this.framesSinceVocalEvidence = Math.min(999, this.framesSinceVocalEvidence + 1);
      if (this.emaScore < 1e-4) this.emaScore = 0;

      return {
        prediction: null,
        evaluation,
        bridgedByHoldover: false,
        activeConsecutiveFrames: 0,
      };
    }

    if (evaluation.hasVocalEvidence) {
      const prevEma = this.framesSinceVocalEvidence <= 2 ? this.emaScore : evaluation.rawScore;
      this.emaScore = this.emaAlpha * evaluation.rawScore + (1 - this.emaAlpha) * prevEma;
      const continued = this.framesSinceVocalEvidence <= 1;
      this.activeConsecutiveFrames = continued ? this.activeConsecutiveFrames + 1 : 1;
      this.framesSinceVocalEvidence = 0;
      this.holdoverRemaining = this.maxHoldoverFrames;
      this.lastMode = evaluation.classificationMode;
      this.lastOriginalClass = evaluation.originalModelClass;
      this.lastRawScore = evaluation.rawScore;

      const prediction: YamnetCategoryPrediction = {
        originalModelClass: evaluation.originalModelClass,
        canonicalName: YAMNET_VOCAL_CATEGORY.canonicalName,
        family: YAMNET_VOCAL_CATEGORY.family,
        isVoice: true,
        classificationMode: evaluation.classificationMode,
        isFallback: false,
        isBroaderClass: evaluation.classificationMode !== 'exact',
        rawScore: evaluation.rawScore,
        smoothedScore: this.emaScore,
        classificationConfidence: evaluation.classificationConfidence,
        selectionEvidence: evaluation.selectionEvidence,
        influencedByTemporalHistory: continued && evaluation.rawScore < 0.025,
      };

      return {
        prediction,
        evaluation,
        bridgedByHoldover: false,
        activeConsecutiveFrames: this.activeConsecutiveFrames,
      };
    }

    // Brief vocal phrase/breath pause during continuing music -> bounded holdover
    this.framesSinceVocalEvidence += 1;
    if (
      evaluation.isMusicalContext &&
      this.holdoverRemaining > 0 &&
      this.framesSinceVocalEvidence <= this.maxHoldoverFrames &&
      this.emaScore >= 0.025 &&
      this.activeConsecutiveFrames >= 1
    ) {
      const bridgeStep = this.maxHoldoverFrames - this.holdoverRemaining + 1;
      this.holdoverRemaining -= 1;
      const decayFactor = Math.pow(0.65, bridgeStep);
      this.emaScore = this.emaScore * 0.72;
      const heldRaw = Math.round(this.lastRawScore * decayFactor * 1000) / 1000;
      const heldConf = Math.round(Math.max(12, Math.min(48, this.emaScore * 60 * decayFactor)));

      const prediction: YamnetCategoryPrediction = {
        originalModelClass: `${this.lastOriginalClass} (phrase holdover)`,
        canonicalName: YAMNET_VOCAL_CATEGORY.canonicalName,
        family: YAMNET_VOCAL_CATEGORY.family,
        isVoice: true,
        classificationMode: 'inferred',
        isFallback: false,
        isBroaderClass: true,
        rawScore: heldRaw,
        smoothedScore: this.emaScore,
        classificationConfidence: heldConf,
        selectionEvidence: `Vocal phrase continuity holdover (${bridgeStep}/${this.maxHoldoverFrames}) across brief breath/syllable dip (prior "${this.lastOriginalClass}")`,
        influencedByTemporalHistory: true,
      };

      return {
        prediction,
        evaluation,
        bridgedByHoldover: true,
        activeConsecutiveFrames: this.activeConsecutiveFrames,
      };
    }

    // Holdover exhausted or non-musical gap -> age cleanly
    this.holdoverRemaining = 0;
    this.emaScore = this.emaScore * (1 - this.emaAlpha);
    if (this.framesSinceVocalEvidence >= 2) {
      this.activeConsecutiveFrames = 0;
    }
    if (this.framesSinceVocalEvidence > 4 || this.emaScore < 1e-4) {
      this.emaScore = 0;
      this.activeConsecutiveFrames = 0;
    }

    return {
      prediction: null,
      evaluation,
      bridgedByHoldover: false,
      activeConsecutiveFrames: 0,
    };
  }
}

/**
 * Stateful Stage B temporal tracker and continuity engine for the 18-category multi-label system:
 * - Closed-set 17 instruments tracked with EMA smoothing, family hysteresis, and continuity bridge.
 * - Independent 18th "Vocals" track via VocalTemporalTracker that coexists in the same frame
 *   without ever being suppressed by strong instrument scores or evicting active instruments.
 */
export class YamnetTemporalTracker {
  private history = new Map<YamnetTargetInstrumentName, TemporalInstrumentState>();
  private vocalTracker = new VocalTemporalTracker();
  private consecutiveBridgeFrames = 0;

  private readonly emaAlpha = 0.58;
  private readonly maxClassesPerFrame = 5; // Instrument slots only; Vocals runs in its own independent lane
  private readonly maxBridgeFrames = 2;

  public reset(): void {
    this.history.clear();
    this.vocalTracker.reset();
    this.consecutiveBridgeFrames = 0;
  }

  private buildHistoryLookup(): TemporalHistoryLookup {
    const lookup: TemporalHistoryLookup = new Map();
    for (const [name, st] of this.history.entries()) {
      lookup.set(name, {
        emaScore: st.emaScore,
        consecutiveFrames: st.consecutiveFrames,
        framesSinceLastSeen: st.framesSinceLastSeen,
        lastMode: st.lastMode,
      });
    }
    return lookup;
  }

  /**
   * Processes raw Stage A AudioSet predictions (+ optional PCM acoustic features) into
   * closed-set 17-instrument + independent Vocals Stage B decisions, timeline segments, and diagnostics.
   */
  public processCategories(params: {
    categories: RawAudioSetPrediction[];
    playbackStart: number;
    playbackEnd: number;
    inputRms?: number;
    samples16k?: Float32Array;
  }): YamnetFrameResult {
    const { categories, playbackStart, playbackEnd, inputRms, samples16k } = params;

    const acousticFeatures: AcousticFrameFeatures | undefined =
      samples16k && samples16k.length > 0 ? extractAcousticFrameFeatures(samples16k) : undefined;

    const effectiveRms = typeof inputRms === 'number' ? inputRms : acousticFeatures?.rms;
    const temporalLookup = this.buildHistoryLookup();

    // Parallel Stage B evaluation: Instruments (17-class) AND Vocals (18th independent lane)
    const evidence = resolveAudioSetToClosedSet17({
      categories,
      temporalHistory: temporalLookup,
      acousticFeatures,
      inputRms: effectiveRms,
      maxInstruments: this.maxClassesPerFrame,
    });

    const vocalOutcome = this.vocalTracker.evaluateFrame({
      categories,
      acousticFeatures,
      inputRms: effectiveRms,
    });

    const rawTopCategories = evidence.topRawCategories.slice(0, 8).map((c) => ({
      categoryName: c.categoryName,
      score: c.score,
    }));

    const startSec = Math.max(0, Math.round(playbackStart * 10) / 10);
    const endSec = Math.max(
      Math.round((playbackStart + 0.3) * 10) / 10,
      Math.round(playbackEnd * 10) / 10
    );

    const vocalPred = vocalOutcome.prediction;
    const isHardNonMusicalStop =
      evidence.isSilence ||
      ((evidence.isSpeechDominant || evidence.isNonMusicalNoise) && !vocalPred);

    // Handle Silence / Speech-only / Environmental Noise immediately when no singing vocals exist
    if (isHardNonMusicalStop) {
      this.consecutiveBridgeFrames = 0;
      this.ageAllStates(true);

      const reason = evidence.silenceOrNonMusicalReason || 'Non-musical or silent frame';
      return {
        playbackStart: startSec,
        playbackEnd: endSec,
        predictions: [],
        vocalPrediction: null,
        rawTopCategories,
        isSilence: evidence.isSilence,
        isSpeechDominant: evidence.isSpeechDominant,
        isNonMusicalNoise: evidence.isNonMusicalNoise,
        bridgedByContinuity: false,
        segments: [],
        diagnostics: {
          playbackStart: startSec,
          playbackEnd: endSec,
          topRawPredictions: evidence.topRawCategories,
          selectedInstruments: [],
          vocalPrediction: null,
          vocalEvaluation: {
            hasVocalEvidence: vocalOutcome.evaluation.hasVocalEvidence,
            isSpeechWithoutSinging: vocalOutcome.evaluation.isSpeechWithoutSinging,
            speechScore: vocalOutcome.evaluation.speechScore,
            blockedReason: vocalOutcome.evaluation.blockedReason,
            bridgedByHoldover: vocalOutcome.bridgedByHoldover,
            matchedLabels: vocalOutcome.evaluation.matchedLabels,
          },
          isSilence: evidence.isSilence,
          isSpeechDominant: evidence.isSpeechDominant,
          isNonMusicalNoise: evidence.isNonMusicalNoise,
          isMusicalAudio: evidence.isMusicalAudio,
          bridgedByContinuity: false,
          silenceOrNonMusicalReason: reason,
          emittedSegmentCount: 0,
        },
      };
    }

    let finalDecisions: ClosedSetCandidateDecision[] = [...evidence.decisions];
    let bridgedByContinuity = false;

    // Bounded temporal continuity bridge for instruments (up to 2 ambiguous "Music" frames)
    if (
      finalDecisions.length === 0 &&
      evidence.hasBareMusicOnly &&
      evidence.musicContextScore >= 0.2 &&
      this.consecutiveBridgeFrames < this.maxBridgeFrames
    ) {
      const bridgeCandidates = Array.from(this.history.entries())
        .filter(([, st]) => st.framesSinceLastSeen <= 2 && st.emaScore >= 0.03)
        .sort((a, b) => b[1].emaScore - a[1].emaScore || b[1].consecutiveFrames - a[1].consecutiveFrames)
        .slice(0, 2);

      if (bridgeCandidates.length > 0) {
        bridgedByContinuity = true;
        this.consecutiveBridgeFrames += 1;
        const decayFactor = Math.pow(0.65, this.consecutiveBridgeFrames);

        finalDecisions = bridgeCandidates
          .map(([instName, st]) => {
            const target = YAMNET_TARGET_BY_NAME.get(instName);
            if (!target) return null;
            const bridgedConfidence = Math.round(
              Math.max(10, Math.min(35, st.emaScore * 45 * decayFactor))
            );
            return {
              instrument: target,
              family: target.family,
              classificationMode: 'best_match' as const,
              isFallback: true,
              originalModelClass: `Music (${st.lastOriginalClass} continuity)`,
              rawScore: Math.round(st.lastRawScore * decayFactor * 1000) / 1000,
              evidenceScore: st.emaScore * decayFactor,
              classificationConfidence: bridgedConfidence,
              selectionEvidence: `Temporal continuity bridge (${this.consecutiveBridgeFrames}/${this.maxBridgeFrames}) during ambiguous Music frame (prior ${st.lastOriginalClass})`,
              influencedByTemporalHistory: true,
              coEvidenceLabels: ['Music'],
            };
          })
          .filter((d): d is NonNullable<typeof d> => d !== null);
      } else {
        this.consecutiveBridgeFrames = 0;
      }
    } else if (finalDecisions.length > 0) {
      this.consecutiveBridgeFrames = 0;
    } else {
      // No instrument tags & bridge unavailable/exhausted (e.g., vocal-only singing or cold bare music)
      this.ageAllStates(false);
    }

    // Update tracker EMA & recency counters for all observed / bridged instruments
    const seenNames = new Set<YamnetTargetInstrumentName>();
    const predictions: YamnetCategoryPrediction[] = [];

    for (const d of finalDecisions) {
      const name = d.instrument.canonicalName;
      if (!isSupportedYamnetInstrument(name)) continue;
      seenNames.add(name);

      const prev = this.history.get(name);
      const prevEma = prev ? prev.emaScore : d.rawScore;
      const smoothedScore = bridgedByContinuity
        ? prevEma * 0.72
        : this.emaAlpha * d.rawScore + (1 - this.emaAlpha) * prevEma;
      const consecutiveFrames = prev && prev.framesSinceLastSeen <= 1 ? prev.consecutiveFrames + 1 : 1;

      this.history.set(name, {
        emaScore: smoothedScore,
        consecutiveFrames,
        framesSinceLastSeen: bridgedByContinuity ? (prev?.framesSinceLastSeen ?? 0) + 1 : 0,
        lastMode: d.classificationMode,
        lastOriginalClass: d.originalModelClass,
        lastRawScore: d.rawScore,
        family: d.family,
      });

      predictions.push({
        originalModelClass: d.originalModelClass,
        canonicalName: name,
        family: d.family,
        isVoice: false,
        classificationMode: d.classificationMode,
        isFallback: d.isFallback,
        isBroaderClass: d.classificationMode !== 'exact',
        rawScore: d.rawScore,
        smoothedScore,
        classificationConfidence: d.classificationConfidence,
        selectionEvidence: d.selectionEvidence,
        influencedByTemporalHistory: d.influencedByTemporalHistory,
      });
    }

    // Age unseen instruments in history cleanly
    for (const [name, st] of this.history.entries()) {
      if (!seenNames.has(name)) {
        const nextAge = st.framesSinceLastSeen + 1;
        const decayedEma = st.emaScore * (1 - this.emaAlpha);
        if (nextAge > 5 || decayedEma < 1e-4) {
          this.history.delete(name);
        } else {
          this.history.set(name, {
            ...st,
            emaScore: decayedEma,
            framesSinceLastSeen: nextAge,
            consecutiveFrames: nextAge >= 2 ? 0 : st.consecutiveFrames,
          });
        }
      }
    }

    // Add independent Vocals prediction alongside instrument predictions (never suppressed by maxClassesPerFrame)
    if (vocalPred) {
      predictions.push(vocalPred);
    }

    predictions.sort(
      (a, b) =>
        b.smoothedScore - a.smoothedScore ||
        b.classificationConfidence - a.classificationConfidence ||
        b.rawScore - a.rawScore
    );

    const segments: InstrumentTimelineSegment[] = predictions.map((pred, idx) => {
      if (pred.isVoice) {
        const obsCount = vocalOutcome.activeConsecutiveFrames;
        const isHoldover = vocalOutcome.bridgedByHoldover;
        const isWeakTransientVocal =
          !isHoldover && obsCount < 2 && pred.rawScore < 0.04;

        const status: 'confirmed' | 'provisional' =
          isHoldover || pred.classificationMode !== 'exact' || isWeakTransientVocal
            ? 'provisional'
            : 'confirmed';

        const audibility: 'audible' | 'suspected' | 'uncertain' = isHoldover
          ? 'uncertain'
          : pred.classificationMode === 'inferred' || status === 'provisional'
          ? 'suspected'
          : 'audible';

        const modeTag = isHoldover
          ? 'phrase holdover'
          : pred.classificationMode === 'exact'
          ? 'exact'
          : 'inferred';
        const pctRaw = (Math.round(pred.rawScore * 1000) / 10).toFixed(1);
        const evidenceSummary = `AudioSet "${pred.originalModelClass}" (${pctRaw}% raw) → Vocals [${modeTag}, ${pred.classificationConfidence}% est.]`;

        return {
          id: `yamnet-vocals-${Math.round(playbackStart * 10)}`,
          instrumentName: YAMNET_VOCAL_CATEGORY.canonicalName,
          family: YAMNET_VOCAL_CATEGORY.family,
          startTime: startSec,
          endTime: endSec,
          confidence: pred.classificationConfidence,
          audibility,
          status,
          isVoice: true,
          evidence: evidenceSummary,
          source: 'yamnet',
          originalModelClass: pred.originalModelClass,
          rawScore: pred.rawScore,
          classificationMode: pred.classificationMode,
          selectedInstrument: YAMNET_VOCAL_CATEGORY.canonicalName,
          selectionEvidence: pred.selectionEvidence,
          isFallback: false,
          classificationConfidence: pred.classificationConfidence,
        };
      }

      const instName = pred.canonicalName as YamnetTargetInstrumentName;
      const state = this.history.get(instName);
      const obsCount = state?.consecutiveFrames ?? 1;

      const isFallback = pred.isFallback;
      const isWeakTransientSecondary =
        !isFallback && idx > 0 && obsCount < 2 && pred.rawScore < 0.08;

      const status: 'confirmed' | 'provisional' =
        isFallback || isWeakTransientSecondary ? 'provisional' : 'confirmed';

      const audibility: 'audible' | 'suspected' | 'uncertain' = isFallback
        ? 'uncertain'
        : pred.classificationMode === 'inferred' || status === 'provisional'
        ? 'suspected'
        : 'audible';

      const modeTag =
        pred.classificationMode === 'exact'
          ? 'exact'
          : pred.classificationMode === 'inferred'
          ? 'inferred'
          : 'best-match fallback';

      const pctRaw = (Math.round(pred.rawScore * 1000) / 10).toFixed(1);
      const evidenceSummary = `AudioSet "${pred.originalModelClass}" (${pctRaw}% raw) → ${pred.canonicalName} [${modeTag}, ${pred.classificationConfidence}% est.]`;

      return {
        id: `yamnet-${pred.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.round(playbackStart * 10)}`,
        instrumentName: pred.canonicalName,
        family: pred.family,
        startTime: startSec,
        endTime: endSec,
        confidence: pred.classificationConfidence,
        audibility,
        status,
        isVoice: false,
        evidence: evidenceSummary,
        source: 'yamnet',
        originalModelClass: pred.originalModelClass,
        rawScore: pred.rawScore,
        classificationMode: pred.classificationMode,
        selectedInstrument: pred.canonicalName,
        selectionEvidence: pred.selectionEvidence,
        isFallback: pred.isFallback,
        classificationConfidence: pred.classificationConfidence,
      };
    });

    const diagnostics: YamnetFrameDiagnostics = {
      playbackStart: startSec,
      playbackEnd: endSec,
      topRawPredictions: evidence.topRawCategories,
      selectedInstruments: finalDecisions.map((d) => ({
        instrument: d.instrument.canonicalName,
        classificationMode: d.classificationMode,
        isFallback: d.isFallback,
        originalModelClass: d.originalModelClass,
        rawScore: d.rawScore,
        classificationConfidence: d.classificationConfidence,
        selectionEvidence: d.selectionEvidence,
        influencedByTemporalHistory: d.influencedByTemporalHistory,
        ...(d.candidatePool ? { candidatePool: d.candidatePool } : {}),
      })),
      vocalPrediction: vocalPred,
      vocalEvaluation: {
        hasVocalEvidence: vocalOutcome.evaluation.hasVocalEvidence,
        isSpeechWithoutSinging: vocalOutcome.evaluation.isSpeechWithoutSinging,
        speechScore: vocalOutcome.evaluation.speechScore,
        blockedReason: vocalOutcome.evaluation.blockedReason,
        bridgedByHoldover: vocalOutcome.bridgedByHoldover,
        matchedLabels: vocalOutcome.evaluation.matchedLabels,
      },
      isSilence: evidence.isSilence,
      isSpeechDominant: evidence.isSpeechDominant,
      isNonMusicalNoise: evidence.isNonMusicalNoise,
      isMusicalAudio: evidence.isMusicalAudio || Boolean(vocalPred),
      bridgedByContinuity,
      silenceOrNonMusicalReason: vocalPred ? null : evidence.silenceOrNonMusicalReason,
      emittedSegmentCount: segments.length,
    };

    return {
      playbackStart: startSec,
      playbackEnd: endSec,
      predictions,
      vocalPrediction: vocalPred,
      rawTopCategories,
      isSilence: evidence.isSilence,
      isSpeechDominant: evidence.isSpeechDominant,
      isNonMusicalNoise: evidence.isNonMusicalNoise,
      bridgedByContinuity,
      segments,
      diagnostics,
    };
  }

  private ageAllStates(isHardStop: boolean): void {
    const decay = isHardStop ? 0.25 : 1 - this.emaAlpha;
    for (const [name, st] of this.history.entries()) {
      const nextAge = st.framesSinceLastSeen + 1;
      const nextEma = st.emaScore * decay;
      if (nextAge > 4 || nextEma < 1e-4) {
        this.history.delete(name);
      } else {
        this.history.set(name, {
          ...st,
          emaScore: nextEma,
          framesSinceLastSeen: nextAge,
          consecutiveFrames: 0,
        });
      }
    }
  }
}

/**
 * Classifies a 16 kHz mono Float32Array PCM frame locally in the browser using Stage A (YAMNet)
 * followed by Stage B closed-set 17-instrument resolution + independent Vocals evaluation.
 */
export function classifyPcmFrameLocally(params: {
  classifier: AudioClassifier;
  samples16k: Float32Array;
  playbackStart: number;
  playbackEnd: number;
  tracker: YamnetTemporalTracker;
  inputRms?: number;
}): YamnetFrameResult {
  const { classifier, samples16k, playbackStart, playbackEnd, tracker, inputRms } = params;

  const results: AudioClassifierResult[] = classifier.classify(samples16k, 16000);
  const categories = results?.[0]?.classifications?.[0]?.categories || [];

  return tracker.processCategories({
    categories,
    playbackStart,
    playbackEnd,
    inputRms,
    samples16k,
  });
}

/**
 * Merges accumulated YAMNet segments without collapsing genuine rests (>= 1.2s),
 * preserving exact/inferred/best_match diagnostics and filtering strictly to the 18 supported
 * categories (17 closed-set instruments + unified Vocals).
 */
export function mergeYamnetTimelineSegments(
  segments: InstrumentTimelineSegment[],
  maxDuration?: number
): InstrumentTimelineSegment[] {
  const closedSetOnly = segments.filter((s) => isSupportedYamnetCategory(s.instrumentName));
  return validateAndMergeTimelineSegments(closedSetOnly, {
    maxDuration,
    gapMergeThreshold: 1.2,
  });
}
