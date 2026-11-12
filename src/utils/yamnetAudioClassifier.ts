/**
 * Browser-side Pretrained YAMNet (AudioSet) Audio Classifier using MediaPipe Tasks Audio.
 * 100% local, client-side execution. Zero server inference, zero Gemini API calls.
 */

import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';
import { InstrumentFamily, InstrumentTimelineSegment } from './instrumentNormalization';

export interface YamnetDetection {
  categoryName: string;
  score: number;
  canonicalName: string;
  family: InstrumentFamily;
  isVoice: boolean;
}

export interface YamnetWindowResult {
  startTime: number;
  endTime: number;
  detections: YamnetDetection[];
  rawTopCategories: Array<{ categoryName: string; score: number }>;
  isSilence: boolean;
  isMusic: boolean;
}

export type YamnetModelStatus =
  | 'unloaded'
  | 'loading'
  | 'ready'
  | 'error';

/**
 * Mapping table from standard YAMNet / AudioSet 521 classes to canonical instruments.
 * Preserves the original model category internally.
 */
export const YAMNET_INSTRUMENT_MAP: Record<
  string,
  { canonicalName: string; family: InstrumentFamily; isVoice?: boolean }
> = {
  // Keyboards
  'Piano': { canonicalName: 'Piano', family: 'Keyboards' },
  'Electric piano': { canonicalName: 'Electric Piano', family: 'Keyboards' },
  'Organ': { canonicalName: 'Organ', family: 'Keyboards' },
  'Electronic organ': { canonicalName: 'Organ', family: 'Keyboards' },
  'Hammond organ': { canonicalName: 'Organ', family: 'Keyboards' },
  'Harpsichord': { canonicalName: 'Harpsichord', family: 'Keyboards' },
  'Accordion': { canonicalName: 'Accordion', family: 'Keyboards' },
  'Celesta': { canonicalName: 'Celesta', family: 'Keyboards' },

  // Strings
  'Violin, fiddle': { canonicalName: 'Violin', family: 'Strings' },
  'Cello': { canonicalName: 'Cello', family: 'Strings' },
  'Double bass': { canonicalName: 'Double Bass', family: 'Strings' },
  'Bowed string instrument': { canonicalName: 'Unresolved String Section', family: 'Strings' },
  'String section': { canonicalName: 'Unresolved String Section', family: 'Strings' },
  'Guitar': { canonicalName: 'Acoustic Guitar', family: 'Strings' },
  'Acoustic guitar': { canonicalName: 'Acoustic Guitar', family: 'Strings' },
  'Electric guitar': { canonicalName: 'Electric Guitar', family: 'Strings' },
  'Bass guitar': { canonicalName: 'Bass Guitar', family: 'Strings' },
  'Steel guitar, slide guitar': { canonicalName: 'Acoustic Guitar', family: 'Strings' },
  'Tapping (guitar technique)': { canonicalName: 'Electric Guitar', family: 'Strings' },
  'Plucked string instrument': { canonicalName: 'Acoustic Guitar', family: 'Strings' },
  'Harp': { canonicalName: 'Harp', family: 'Strings' },

  // Woodwinds
  'Flute': { canonicalName: 'Flute', family: 'Woodwinds' },
  'Saxophone': { canonicalName: 'Saxophone', family: 'Woodwinds' },
  'Clarinet': { canonicalName: 'Clarinet', family: 'Woodwinds' },
  'Oboe': { canonicalName: 'Oboe', family: 'Woodwinds' },
  'Bassoon': { canonicalName: 'Bassoon', family: 'Woodwinds' },
  'Wind instrument, woodwind instrument': { canonicalName: 'Unresolved Woodwind Section', family: 'Woodwinds' },
  'Harmonica': { canonicalName: 'Harmonica', family: 'Woodwinds' },

  // Brass
  'Trumpet': { canonicalName: 'Trumpet', family: 'Brass' },
  'Trombone': { canonicalName: 'Trombone', family: 'Brass' },
  'French horn': { canonicalName: 'French Horn', family: 'Brass' },
  'Brass instrument': { canonicalName: 'Unresolved Brass Section', family: 'Brass' },

  // Percussion
  'Drum kit': { canonicalName: 'Drum Kit', family: 'Percussion' },
  'Drum machine': { canonicalName: 'Drum Machine', family: 'Percussion' },
  'Drum': { canonicalName: 'Drum Kit', family: 'Percussion' },
  'Snare drum': { canonicalName: 'Snare Drum', family: 'Percussion' },
  'Bass drum': { canonicalName: 'Bass Drum', family: 'Percussion' },
  'Drum roll': { canonicalName: 'Drum Kit', family: 'Percussion' },
  'Timpani': { canonicalName: 'Timpani', family: 'Percussion' },
  'Cymbal': { canonicalName: 'Cymbals', family: 'Percussion' },
  'Crash cymbal': { canonicalName: 'Cymbals', family: 'Percussion' },
  'Hi-hat': { canonicalName: 'Drum Kit', family: 'Percussion' },
  'Tambourine': { canonicalName: 'Tambourine', family: 'Percussion' },
  'Cowbell': { canonicalName: 'Cowbell', family: 'Percussion' },
  'Gong': { canonicalName: 'Gong', family: 'Percussion' },
  'Tubular bells': { canonicalName: 'Tubular Bells', family: 'Percussion' },
  'Marimba, xylophone': { canonicalName: 'Marimba', family: 'Percussion' },
  'Vibraphone': { canonicalName: 'Vibraphone', family: 'Percussion' },
  'Mallet percussion': { canonicalName: 'Xylophone', family: 'Percussion' },
  'Glockenspiel': { canonicalName: 'Glockenspiel', family: 'Percussion' },
  'Percussion': { canonicalName: 'Drum Kit', family: 'Percussion' },

  // Voice & Electronic
  'Synthesizer': { canonicalName: 'Synthesizer', family: 'Voice & Electronic' },
  'Singing': { canonicalName: 'Unclassified Voice', family: 'Voice & Electronic', isVoice: true },
  'Choir': { canonicalName: 'Mixed Choir', family: 'Voice & Electronic', isVoice: true },
  'Child singing': { canonicalName: 'Unclassified Voice', family: 'Voice & Electronic', isVoice: true },
  'Synthetic singing': { canonicalName: 'Synthesizer', family: 'Voice & Electronic' },
  'Yodeling': { canonicalName: 'Unclassified Voice', family: 'Voice & Electronic', isVoice: true },
  'Chant': { canonicalName: 'Mixed Choir', family: 'Voice & Electronic', isVoice: true },
  'Vocal music': { canonicalName: 'Unclassified Voice', family: 'Voice & Electronic', isVoice: true },

  // Traditional & World
  'Banjo': { canonicalName: 'Banjo', family: 'Traditional & World' },
  'Mandolin': { canonicalName: 'Mandolin', family: 'Traditional & World' },
  'Ukulele': { canonicalName: 'Ukulele', family: 'Traditional & World' },
  'Sitar': { canonicalName: 'Sitar', family: 'Traditional & World' },
  'Tabla': { canonicalName: 'Tabla', family: 'Traditional & World' },
  'Bagpipes': { canonicalName: 'Bagpipes', family: 'Traditional & World' },
};

/**
 * Singleton AudioClassifier manager for browser YAMNet.
 */
class YamnetClassifierService {
  private static instance: YamnetClassifierService | null = null;
  private classifier: AudioClassifier | null = null;
  private status: YamnetModelStatus = 'unloaded';
  private loadingPromise: Promise<AudioClassifier> | null = null;
  private loadError: string | null = null;

  public static readonly MODEL_SIZE_BYTES = 4126810; // ~3.9 MB
  public static readonly MODEL_PATH = '/models/yamnet.tflite';
  public static readonly WASM_PATH = '/mediapipe/wasm';
  public static readonly CDN_WASM_FALLBACK = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@1.2.3/wasm';

  public static getInstance(): YamnetClassifierService {
    if (!YamnetClassifierService.instance) {
      YamnetClassifierService.instance = new YamnetClassifierService();
    }
    return YamnetClassifierService.instance;
  }

  public getStatus(): YamnetModelStatus {
    return this.status;
  }

  public getLoadError(): string | null {
    return this.loadError;
  }

  /**
   * Initializes the MediaPipe AudioClassifier with YAMNet.
   * Loads from local same-origin static assets first, falling back to public CDN if necessary.
   */
  public async loadModel(): Promise<AudioClassifier> {
    if (this.classifier) {
      return this.classifier;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.status = 'loading';
    this.loadError = null;

    this.loadingPromise = (async () => {
      try {
        console.log('[YAMNet Audio] Initializing MediaPipe Wasm fileset from:', YamnetClassifierService.WASM_PATH);
        let wasmFileset;
        try {
          wasmFileset = await FilesetResolver.forAudioTasks(YamnetClassifierService.WASM_PATH);
        } catch (wasmErr) {
          console.warn('[YAMNet Audio] Local wasm failed, falling back to CDN:', wasmErr);
          wasmFileset = await FilesetResolver.forAudioTasks(YamnetClassifierService.CDN_WASM_FALLBACK);
        }

        console.log('[YAMNet Audio] Loading YAMNet TFLite model from:', YamnetClassifierService.MODEL_PATH);
        const classifier = await AudioClassifier.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath: YamnetClassifierService.MODEL_PATH,
          },
          maxResults: 15,
          scoreThreshold: 0.05,
        });

        this.classifier = classifier;
        this.status = 'ready';
        console.log('[YAMNet Audio] Model initialized and ready for browser-local classification.');
        return classifier;
      } catch (err: any) {
        console.error('[YAMNet Audio] Model load failed:', err);
        this.status = 'error';
        this.loadError = err?.message || 'Failed to initialize local YAMNet audio classifier';
        throw err;
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Classifies a mono PCM Float32Array audio window.
   */
  public async classifyChunk(
    audioSamples: Float32Array,
    sampleRate: number,
    startTime: number,
    endTime: number
  ): Promise<YamnetWindowResult> {
    const classifier = await this.loadModel();

    // Ensure audio contains non-zero signal
    let sumSquares = 0;
    for (let i = 0; i < audioSamples.length; i++) {
      sumSquares += audioSamples[i] * audioSamples[i];
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, audioSamples.length));
    const isSilence = rms < 0.005; // -46dB threshold

    if (isSilence) {
      return {
        startTime,
        endTime,
        detections: [],
        rawTopCategories: [{ categoryName: 'Silence', score: 0.99 }],
        isSilence: true,
        isMusic: false,
      };
    }

    // Run inference synchronously in Wasm
    const resultList = classifier.classify(audioSamples, sampleRate);
    const classifications = resultList[0]?.classifications[0]?.categories || [];

    const rawTop = classifications.slice(0, 8).map((c) => ({
      categoryName: c.categoryName,
      score: c.score,
    }));

    const isMusic = classifications.some(
      (c) =>
        (c.categoryName.toLowerCase().includes('music') ||
          YAMNET_INSTRUMENT_MAP[c.categoryName]) &&
        c.score > 0.1
    );

    // Filter instrument matches
    const detections: YamnetDetection[] = [];
    const seenInstruments = new Set<string>();

    for (const cat of classifications) {
      const mapped = YAMNET_INSTRUMENT_MAP[cat.categoryName];
      if (mapped) {
        // Minimum score threshold for individual instrument recognition
        if (cat.score >= 0.08 && !seenInstruments.has(mapped.canonicalName)) {
          seenInstruments.add(mapped.canonicalName);
          detections.push({
            categoryName: cat.categoryName,
            score: cat.score,
            canonicalName: mapped.canonicalName,
            family: mapped.family,
            isVoice: Boolean(mapped.isVoice),
          });
        }
      }
    }

    return {
      startTime,
      endTime,
      detections,
      rawTopCategories: rawTop,
      isSilence: false,
      isMusic,
    };
  }

  /**
   * Resamples an arbitrary audio buffer to 16,000 Hz mono PCM.
   */
  public static async resampleTo16kMono(
    audioBuffer: AudioBuffer
  ): Promise<Float32Array> {
    const targetSampleRate = 16000;
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const originalRate = audioBuffer.sampleRate;

    // Mixdown to mono first if stereo/multi-channel
    const mono = new Float32Array(length);
    for (let c = 0; c < numChannels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        mono[i] += channelData[i] / numChannels;
      }
    }

    if (originalRate === targetSampleRate) {
      return mono;
    }

    // Use OfflineAudioContext for high-fidelity browser resampling
    const targetLength = Math.round((length * targetSampleRate) / originalRate);
    const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
      1,
      targetLength,
      targetSampleRate
    );

    const sourceBuffer = offlineCtx.createBuffer(1, length, originalRate);
    sourceBuffer.copyToChannel(mono, 0);

    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer.getChannelData(0);
  }

  /**
   * Releases WebAssembly memory and closes the classifier.
   */
  public release(): void {
    if (this.classifier) {
      try {
        this.classifier.close();
      } catch (e) {
        console.warn('[YAMNet Audio] Error closing classifier:', e);
      }
      this.classifier = null;
      this.status = 'unloaded';
    }
  }
}

export const yamnetService = YamnetClassifierService.getInstance();

/**
 * Aggregates windowed YAMNet detections into continuous chronological timeline segments.
 * Eliminates transient false positives, bridges micro-gaps, and preserves genuine rests.
 */
export function aggregateYamnetDetections(
  windowResults: YamnetWindowResult[],
  totalDuration?: number
): {
  segments: InstrumentTimelineSegment[];
  detectedInstruments: Array<{ name: string; family: InstrumentFamily }>;
} {
  // 1. Group consecutive window hits by canonical instrument name
  const instrumentOccurrences = new Map<
    string,
    Array<{ start: number; end: number; score: number; family: InstrumentFamily; isVoice: boolean; rawCategory: string }>
  >();

  windowResults.forEach((win) => {
    win.detections.forEach((det) => {
      if (!instrumentOccurrences.has(det.canonicalName)) {
        instrumentOccurrences.set(det.canonicalName, []);
      }
      instrumentOccurrences.get(det.canonicalName)!.push({
        start: win.startTime,
        end: win.endTime,
        score: det.score,
        family: det.family,
        isVoice: det.isVoice,
        rawCategory: det.categoryName,
      });
    });
  });

  const mergedSegments: InstrumentTimelineSegment[] = [];
  const detectedInstrumentsMap = new Map<string, { name: string; family: InstrumentFamily }>();
  let segmentIdCounter = 0;

  instrumentOccurrences.forEach((hits, instName) => {
    if (hits.length === 0) return;

    // Sort chronologically
    hits.sort((a, b) => a.start - b.start);

    const mergedForInst: Array<{
      start: number;
      end: number;
      maxScore: number;
      family: InstrumentFamily;
      isVoice: boolean;
      hitCount: number;
      rawCategory: string;
    }> = [];

    hits.forEach((hit) => {
      if (mergedForInst.length === 0) {
        mergedForInst.push({
          start: hit.start,
          end: hit.end,
          maxScore: hit.score,
          family: hit.family,
          isVoice: hit.isVoice,
          hitCount: 1,
          rawCategory: hit.rawCategory,
        });
        return;
      }

      const prev = mergedForInst[mergedForInst.length - 1];
      // Bridge contiguous windows or gaps < 1.0s
      if (hit.start <= prev.end + 1.0) {
        prev.end = Math.max(prev.end, hit.end);
        prev.maxScore = Math.max(prev.maxScore, hit.score);
        prev.hitCount++;
      } else {
        // Genuine musical silence/rest >= 1.0s
        mergedForInst.push({
          start: hit.start,
          end: hit.end,
          maxScore: hit.score,
          family: hit.family,
          isVoice: hit.isVoice,
          hitCount: 1,
          rawCategory: hit.rawCategory,
        });
      }
    });

    mergedForInst.forEach((m) => {
      const duration = m.end - m.start;
      // Filter isolated single-window noise with low confidence
      if (m.hitCount === 1 && m.maxScore < 0.15 && duration < 1.2) {
        return;
      }

      const roundedStart = Math.max(0, Math.round(m.start * 10) / 10);
      let roundedEnd = Math.max(roundedStart + 0.5, Math.round(m.end * 10) / 10);
      if (typeof totalDuration === 'number' && totalDuration > 0) {
        roundedEnd = Math.min(totalDuration, roundedEnd);
      }

      if (roundedEnd > roundedStart) {
        const confidencePct = Math.min(99, Math.max(35, Math.round(m.maxScore * 100)));
        mergedSegments.push({
          id: `yamnet-seg-${segmentIdCounter++}-${instName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          instrumentName: instName,
          family: m.family,
          startTime: roundedStart,
          endTime: roundedEnd,
          confidence: confidencePct,
          audibility: confidencePct > 60 ? 'audible' : 'suspected',
          status: 'confirmed',
          isVoice: m.isVoice,
          evidence: `YAMNet AudioSet classification (${m.rawCategory})`,
        });

        detectedInstrumentsMap.set(instName, {
          name: instName,
          family: m.family,
        });
      }
    });
  });

  // Sort overall timeline chronologically by startTime
  mergedSegments.sort((a, b) => a.startTime - b.startTime || b.endTime - a.endTime);

  return {
    segments: mergedSegments,
    detectedInstruments: Array.from(detectedInstrumentsMap.values()),
  };
}
