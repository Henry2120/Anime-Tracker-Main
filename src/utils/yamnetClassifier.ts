import type { AudioClassifier, AudioClassifierResult } from '@mediapipe/tasks-audio';
import {
  InstrumentTimelineSegment,
  InstrumentFamily,
  validateAndMergeTimelineSegments,
} from './instrumentNormalization';
import {
  mapAudioSetLabelToInstrument,
  isAudioSetSilenceOrSpeech,
} from './yamnetLabelMap';

export const YAMNET_MODEL_PATH = '/yamnet/yamnet.tflite';
export const YAMNET_WASM_BASE_PATH = '/yamnet/wasm';
export const YAMNET_MODEL_VERSION = 'mediapipe-yamnet-float32-v1';

export interface YamnetCategoryPrediction {
  originalModelClass: string;
  canonicalName: string;
  family: InstrumentFamily;
  isVoice: boolean;
  isBroaderClass: boolean;
  rawScore: number; // Original score in [0, 1] preserved without minimum cutoff
  smoothedScore: number; // Exponential moving average across consecutive frames
}

export interface YamnetFrameResult {
  playbackStart: number;
  playbackEnd: number;
  predictions: YamnetCategoryPrediction[];
  rawTopCategories: Array<{ categoryName: string; score: number }>;
  isSilence: boolean;
  isSpeechDominant: boolean;
  segments: InstrumentTimelineSegment[];
}

// Singleton MediaPipe AudioClassifier instance reused across capture sessions
let classifierInstance: AudioClassifier | null = null;
let classifierInitPromise: Promise<AudioClassifier> | null = null;

/**
 * Initializes and returns the singleton browser-side MediaPipe AudioClassifier
 * using locally hosted WASM binaries (/yamnet/wasm) and YAMNet TFLite model (/yamnet/yamnet.tflite).
 * Does NOT apply any minimum scoreThreshold cutoff so lower-confidence predictions remain inspectable.
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

      const classifier = await AudioClassifier.createFromOptions(audioFileset, {
        baseOptions: {
          modelAssetPath: YAMNET_MODEL_PATH,
        },
        // Retrieve top-15 categories per frame with NO arbitrary scoreThreshold filtering
        maxResults: 15,
      });

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

/**
 * Stateful temporal smoother & duplicate suppressor for continuous YAMNet frames.
 * Combines short-window EMA smoothing and single-frame transient suppression WITHOUT
 * enforcing any hard-coded minimum-confidence cutoff.
 */
export class YamnetTemporalTracker {
  // EMA score per canonical instrument name
  private smoothedScores = new Map<string, number>();
  // Consecutive or recent observation counter to dampen single-frame flicker
  private recentPresenceCount = new Map<string, number>();
  private lastSeenInstruments = new Set<string>();
  private readonly emaAlpha = 0.6;
  private readonly maxClassesPerFrame = 5;

  public reset(): void {
    this.smoothedScores.clear();
    this.recentPresenceCount.clear();
    this.lastSeenInstruments.clear();
  }

  /**
   * Processes raw AudioClassifierResult categories for a [playbackStart, playbackEnd] interval
   * and converts them into normalized, smoothed AniVerse timeline segments.
   */
  public processCategories(params: {
    categories: Array<{ categoryName: string; displayName?: string; score: number }>;
    playbackStart: number;
    playbackEnd: number;
    inputRms?: number;
  }): YamnetFrameResult {
    const { categories, playbackStart, playbackEnd, inputRms } = params;

    const rawTopCategories = categories.slice(0, 8).map((c) => ({
      categoryName: c.categoryName || c.displayName || 'Unknown',
      score: typeof c.score === 'number' ? c.score : 0,
    }));

    const topCategory = rawTopCategories[0];
    const topKind = topCategory ? isAudioSetSilenceOrSpeech(topCategory.categoryName) : null;

    // Digital silence guard (zero audio waveform RMS or top AudioSet Silence with no instruments)
    if (typeof inputRms === 'number' && inputRms === 0) {
      this.decayUnseen(new Set());
      return {
        playbackStart,
        playbackEnd,
        predictions: [],
        rawTopCategories,
        isSilence: true,
        isSpeechDominant: false,
        segments: [],
      };
    }

    // Deduplicate mapped canonical instruments within the same frame, retaining highest rawScore
    const frameMap = new Map<string, YamnetCategoryPrediction>();

    for (const cat of categories) {
      const mapped = mapAudioSetLabelToInstrument(cat.categoryName, cat.displayName);
      if (!mapped) continue;

      const rawScore = typeof cat.score === 'number' && Number.isFinite(cat.score) ? cat.score : 0;
      const existing = frameMap.get(mapped.canonicalName);

      if (!existing || rawScore > existing.rawScore) {
        const prevSmoothed = this.smoothedScores.get(mapped.canonicalName) ?? rawScore;
        const smoothedScore = this.emaAlpha * rawScore + (1 - this.emaAlpha) * prevSmoothed;

        frameMap.set(mapped.canonicalName, {
          originalModelClass: mapped.originalModelClass,
          canonicalName: mapped.canonicalName,
          family: mapped.family,
          isVoice: mapped.isVoice,
          isBroaderClass: mapped.isBroaderClass,
          rawScore,
          smoothedScore,
        });
      }
    }

    const currentNames = new Set(frameMap.keys());
    this.decayUnseen(currentNames);

    frameMap.forEach((pred, name) => {
      this.smoothedScores.set(name, pred.smoothedScore);
      const prevCount = this.recentPresenceCount.get(name) ?? 0;
      this.recentPresenceCount.set(name, prevCount + 1);
    });

    // Rank by smoothed score descending (retaining original rawScore without threshold removal)
    const ranked = Array.from(frameMap.values()).sort(
      (a, b) => b.smoothedScore - a.smoothedScore || b.rawScore - a.rawScore
    );

    const topPredictions = ranked.slice(0, this.maxClassesPerFrame);
    const isSilence = topKind === 'silence' && topPredictions.length === 0;
    const isSpeechDominant = topKind === 'speech' && topPredictions.length === 0;

    // Convert predictions into timeline segments.
    // To suppress isolated 1-frame classification flicker without dropping genuine instruments:
    // - If an instrument is rank #1 in the frame OR was present in the previous frame (>=2 frames),
    //   emit it immediately as confirmed; otherwise emit rank #2..#5 with at least 2 observations
    //   or provisional status if solo-frame secondary.
    const rawSegments: InstrumentTimelineSegment[] = topPredictions.map((pred, idx) => {
      const obsCount = this.recentPresenceCount.get(pred.canonicalName) ?? 1;
      const status: 'confirmed' | 'provisional' =
        idx === 0 || obsCount >= 2 ? 'confirmed' : 'provisional';

      const pct = Math.round(pred.rawScore * 1000) / 10;
      const evidenceParts = [`AudioSet "${pred.originalModelClass}" (${pct.toFixed(1)}%)`];
      if (pred.isBroaderClass) {
        evidenceParts.push('broader AudioSet class');
      }

      return {
        id: `yamnet-${pred.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.round(playbackStart * 10)}`,
        instrumentName: pred.canonicalName,
        family: pred.family,
        startTime: Math.max(0, Math.round(playbackStart * 10) / 10),
        endTime: Math.max(Math.round((playbackStart + 0.3) * 10) / 10, Math.round(playbackEnd * 10) / 10),
        confidence: Math.round(pred.rawScore * 100),
        audibility: status === 'confirmed' ? 'audible' : 'suspected',
        status,
        isVoice: pred.isVoice,
        evidence: evidenceParts.join(' • '),
        source: 'yamnet',
        originalModelClass: pred.originalModelClass,
        rawScore: pred.rawScore,
      };
    });

    this.lastSeenInstruments = currentNames;

    return {
      playbackStart,
      playbackEnd,
      predictions: topPredictions,
      rawTopCategories,
      isSilence,
      isSpeechDominant,
      segments: rawSegments,
    };
  }

  private decayUnseen(seenNames: Set<string>): void {
    for (const [name, prevScore] of this.smoothedScores.entries()) {
      if (!seenNames.has(name)) {
        const decayed = prevScore * (1 - this.emaAlpha);
        if (decayed < 1e-4) {
          this.smoothedScores.delete(name);
          this.recentPresenceCount.delete(name);
        } else {
          this.smoothedScores.set(name, decayed);
          // Reset consecutive presence count when absent for a frame
          if (!this.lastSeenInstruments.has(name)) {
            this.recentPresenceCount.delete(name);
          }
        }
      }
    }
  }
}

/**
 * Classifies a 16 kHz mono Float32Array PCM frame locally in the browser using YAMNet.
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
  });
}

/**
 * Merges accumulated YAMNet segments without collapsing genuine rests (>= 1.2s).
 */
export function mergeYamnetTimelineSegments(
  segments: InstrumentTimelineSegment[],
  maxDuration?: number
): InstrumentTimelineSegment[] {
  return validateAndMergeTimelineSegments(segments, {
    maxDuration,
    gapMergeThreshold: 1.2,
  });
}
