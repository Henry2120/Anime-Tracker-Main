import { InstrumentFamily } from './instrumentNormalization';

// ============================================================================
// 1. AUTHORITATIVE CLOSED-SET 17-INSTRUMENT YAMNET TAXONOMY
// ============================================================================

export const YAMNET_TARGET_CATALOG = [
  { id: 'electric-piano', canonicalName: 'Electric Piano', family: 'Keyboards' },
  { id: 'bass-guitar', canonicalName: 'Bass Guitar', family: 'Strings' },
  { id: 'drum-kit', canonicalName: 'Drum Kit', family: 'Percussion' },
  { id: 'electric-guitar', canonicalName: 'Electric Guitar', family: 'Strings' },
  { id: 'piano', canonicalName: 'Piano', family: 'Keyboards' },
  { id: 'grand-piano', canonicalName: 'Grand Piano', family: 'Keyboards' },
  { id: 'shamisen', canonicalName: 'Shamisen', family: 'Strings' },
  { id: 'saxophone', canonicalName: 'Saxophone', family: 'Woodwinds' },
  { id: 'erhu', canonicalName: 'Erhu', family: 'Strings' },
  { id: 'flute', canonicalName: 'Flute', family: 'Woodwinds' },
  { id: 'trumpet', canonicalName: 'Trumpet', family: 'Brass' },
  { id: 'harp', canonicalName: 'Harp', family: 'Strings' },
  { id: 'violin', canonicalName: 'Violin', family: 'Strings' },
  { id: 'cello', canonicalName: 'Cello', family: 'Strings' },
  { id: 'vibraphone', canonicalName: 'Vibraphone', family: 'Percussion' },
  { id: 'handpan', canonicalName: 'Handpan', family: 'Percussion' },
  { id: 'synthesizer', canonicalName: 'Synthesizer', family: 'Keyboards' },
] as const;

export type YamnetTargetInstrument = (typeof YAMNET_TARGET_CATALOG)[number];
export type YamnetTargetInstrumentId = YamnetTargetInstrument['id'];
export type YamnetTargetInstrumentName = YamnetTargetInstrument['canonicalName'];
export type ClassificationMode = 'exact' | 'inferred' | 'best_match';

export const YAMNET_TARGET_NAMES: readonly YamnetTargetInstrumentName[] =
  YAMNET_TARGET_CATALOG.map((item) => item.canonicalName);

export const YAMNET_TARGET_BY_ID = new Map<YamnetTargetInstrumentId, YamnetTargetInstrument>(
  YAMNET_TARGET_CATALOG.map((item) => [item.id, item])
);

export const YAMNET_TARGET_BY_NAME = new Map<YamnetTargetInstrumentName, YamnetTargetInstrument>(
  YAMNET_TARGET_CATALOG.map((item) => [item.canonicalName, item])
);

export function isSupportedYamnetInstrument(name: string): name is YamnetTargetInstrumentName {
  return YAMNET_TARGET_BY_NAME.has(name as YamnetTargetInstrumentName);
}

// ============================================================================
// 1B. 18TH CATEGORY: UNIFIED VOCALS (INDEPENDENT MULTI-LABEL VOCAL PATH)
// ============================================================================

export const YAMNET_VOCAL_CATEGORY = {
  id: 'vocals',
  canonicalName: 'Vocals',
  family: 'Voice & Electronic',
  isVoice: true,
} as const;

export type YamnetVocalCategory = typeof YAMNET_VOCAL_CATEGORY;
export type YamnetOutputCategoryName = YamnetTargetInstrumentName | 'Vocals';

export const YAMNET_ALL_TARGET_NAMES: readonly YamnetOutputCategoryName[] = [
  ...YAMNET_TARGET_NAMES,
  YAMNET_VOCAL_CATEGORY.canonicalName,
];

export function isSupportedYamnetCategory(name: string): name is YamnetOutputCategoryName {
  return name === YAMNET_VOCAL_CATEGORY.canonicalName || isSupportedYamnetInstrument(name);
}

// ============================================================================
// 2. LIGHTWEIGHT ACOUSTIC FEATURE EXTRACTION (16 kHz PCM)
// ============================================================================

export interface AcousticFrameFeatures {
  rms: number;
  peak: number;
  crestFactor: number;
  zeroCrossingRate: number;
  spectralCentroidHz: number;
  lowBandRatio: number; // 40–250 Hz (Bass Guitar, Kick, Cello, Piano low end)
  lowMidRatio: number; // 250–900 Hz (Cello, Piano mid, Harp body, Handpan)
  highMidRatio: number; // 900–3200 Hz (Erhu, Violin, Saxophone, Electric Guitar, Trumpet)
  highBandRatio: number; // 3200–8000 Hz (Violin brilliance, Flute overtones, Cymbals, Shamisen transient)
}

const FFT_SIZE = 512;
const HANN_WINDOW = (() => {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  return w;
})();

function computeMagnitudeSpectrum512(slice: Float32Array, re: Float32Array, im: Float32Array): void {
  for (let i = 0; i < FFT_SIZE; i++) {
    re[i] = slice[i] * HANN_WINDOW[i];
    im[i] = 0;
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < FFT_SIZE; i++) {
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
    }
    let m = FFT_SIZE >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Iterative Cooley-Tukey radix-2 FFT
  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    for (let start = 0; start < FFT_SIZE; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = k * angleStep;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const idx1 = start + k;
        const idx2 = idx1 + half;
        const tre = cos * re[idx2] - sin * im[idx2];
        const tim = sin * re[idx2] + cos * im[idx2];
        re[idx2] = re[idx1] - tre;
        im[idx2] = im[idx1] + tim;
        re[idx1] += tre;
        im[idx1] += tim;
      }
    }
  }
}

/**
 * Extracts fast spectral and temporal envelope characteristics from a 16 kHz mono Float32 frame
 * to assist Stage B disambiguation of broad AudioSet categories (e.g., Bass Guitar vs Electric Guitar,
 * Cello vs Violin vs Erhu, Piano vs Synthesizer).
 */
export function extractAcousticFrameFeatures(samples16k: Float32Array): AcousticFrameFeatures {
  if (!samples16k || samples16k.length === 0) {
    return {
      rms: 0,
      peak: 0,
      crestFactor: 0,
      zeroCrossingRate: 0,
      spectralCentroidHz: 0,
      lowBandRatio: 0,
      lowMidRatio: 0,
      highMidRatio: 0,
      highBandRatio: 0,
    };
  }

  let sumSq = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let prevSample = samples16k[0];

  for (let i = 0; i < samples16k.length; i++) {
    const s = samples16k[i];
    const abs = Math.abs(s);
    sumSq += s * s;
    if (abs > peak) peak = abs;
    if (i > 0 && ((s >= 0 && prevSample < 0) || (s < 0 && prevSample >= 0))) {
      zeroCrossings++;
    }
    prevSample = s;
  }

  const rms = Math.sqrt(sumSq / samples16k.length);
  const crestFactor = rms > 1e-6 ? peak / rms : 0;
  const zeroCrossingRate = samples16k.length > 1 ? zeroCrossings / (samples16k.length - 1) : 0;

  if (rms <= 1e-6 || samples16k.length < FFT_SIZE) {
    return {
      rms,
      peak,
      crestFactor,
      zeroCrossingRate,
      spectralCentroidHz: 0,
      lowBandRatio: 0,
      lowMidRatio: 0,
      highMidRatio: 0,
      highBandRatio: 0,
    };
  }

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const slice = new Float32Array(FFT_SIZE);
  const halfBins = FFT_SIZE >> 1;
  const binHz = 16000 / FFT_SIZE; // 31.25 Hz per bin
  const avgMag = new Float32Array(halfBins);

  const offsets =
    samples16k.length >= FFT_SIZE * 3
      ? [0, Math.floor((samples16k.length - FFT_SIZE) / 2), samples16k.length - FFT_SIZE]
      : [0];

  for (const offset of offsets) {
    slice.set(samples16k.subarray(offset, offset + FFT_SIZE));
    computeMagnitudeSpectrum512(slice, re, im);
    for (let k = 1; k < halfBins; k++) {
      avgMag[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]) / offsets.length;
    }
  }

  let totalEnergy = 0;
  let weightedFreqSum = 0;
  let lowEnergy = 0;
  let lowMidEnergy = 0;
  let highMidEnergy = 0;
  let highEnergy = 0;

  for (let k = 1; k < halfBins; k++) {
    const freq = k * binHz;
    const power = avgMag[k] * avgMag[k];
    totalEnergy += power;
    weightedFreqSum += freq * power;
    if (freq >= 40 && freq < 250) lowEnergy += power;
    else if (freq >= 250 && freq < 900) lowMidEnergy += power;
    else if (freq >= 900 && freq < 3200) highMidEnergy += power;
    else if (freq >= 3200) highEnergy += power;
  }

  const safeTotal = totalEnergy > 1e-12 ? totalEnergy : 1;

  return {
    rms,
    peak,
    crestFactor,
    zeroCrossingRate,
    spectralCentroidHz: totalEnergy > 1e-12 ? weightedFreqSum / safeTotal : 0,
    lowBandRatio: lowEnergy / safeTotal,
    lowMidRatio: lowMidEnergy / safeTotal,
    highMidRatio: highMidEnergy / safeTotal,
    highBandRatio: highEnergy / safeTotal,
  };
}

// ============================================================================
// 3. STAGE A -> STAGE B CLOSED-SET EVIDENCE RULES & CANDIDATE SELECTION
// ============================================================================

export interface RawAudioSetPrediction {
  categoryName: string;
  displayName?: string;
  score: number;
}

export interface TemporalCandidateHistoryItem {
  emaScore: number;
  consecutiveFrames: number;
  framesSinceLastSeen: number;
  lastMode: ClassificationMode;
}

export type TemporalHistoryLookup = Map<YamnetTargetInstrumentName, TemporalCandidateHistoryItem>;

export interface ClosedSetCandidateDecision {
  instrument: YamnetTargetInstrument;
  family: InstrumentFamily;
  classificationMode: ClassificationMode;
  isFallback: boolean;
  originalModelClass: string;
  rawScore: number;
  evidenceScore: number;
  classificationConfidence: number; // Honest 0..100
  selectionEvidence: string;
  candidatePool?: YamnetTargetInstrumentName[];
  influencedByTemporalHistory: boolean;
  coEvidenceLabels: string[];
}

export type AudioSetCategoryRole =
  | 'exact_instrument'
  | 'related_instrument'
  | 'broad_instrument'
  | 'music_context'
  | 'vocal'
  | 'speech'
  | 'silence'
  | 'noise'
  | 'other';

export interface FrameEvidenceAnalysis {
  isSilence: boolean;
  isSpeechDominant: boolean;
  isNonMusicalNoise: boolean;
  isMusicalAudio: boolean;
  hasInstrumentEvidence: boolean;
  hasBareMusicOnly: boolean;
  silenceOrNonMusicalReason: string | null;
  topRawCategories: Array<{
    categoryName: string;
    score: number;
    role: AudioSetCategoryRole;
  }>;
  musicContextScore: number;
  decisions: ClosedSetCandidateDecision[];
}

const SILENCE_LABELS = new Set(['silence']);

const SPEECH_LABELS = new Set([
  'speech',
  'child speech, kid speaking',
  'narration, monologue',
  'conversation',
  'babbling',
  'speech synthesizer',
  'children shouting',
  'screaming',
  'whispering',
  'chatter',
  'hubbub, speech noise, speech babble',
  'rapping', // Treated as rhythmic spoken speech unless accompanied by actual Singing/Choir
]);

// Verified singing / musical vocal labels present in public/yamnet/yamnet.tflite
// (yamnet_label_list.txt lines 24-32, 233, 249-250)
const EXACT_VOCAL_SINGING_LABELS = new Set([
  'singing',
  'choir',
  'child singing',
  'synthetic singing',
  'vocal music',
  'a capella',
]);

const INFERRED_VOCAL_SINGING_LABELS = new Set([
  'opera',
  'yodeling',
  'humming',
  'chant',
  'mantra',
]);

const VOCAL_NON_INSTRUMENT_LABELS = new Set([
  ...EXACT_VOCAL_SINGING_LABELS,
  ...INFERRED_VOCAL_SINGING_LABELS,
  'rapping',
]);

const ENVIRONMENTAL_NOISE_LABELS = new Set([
  'noise',
  'white noise',
  'pink noise',
  'static',
  'mains hum',
  'traffic noise, roadway noise',
  'engine',
  'vehicle',
  'siren',
  'rain',
  'wind',
  'thunder',
  'water',
  'applause',
  'laughter',
  'crying, sobbing',
  'cough',
  'sneeze',
  'snoring',
  'animal',
  'dog',
  'cat',
  'bird',
  'hammer',
  'sawing',
  'power tool',
  'alarm',
  'telephone',
  'typing',
  'tick',
]);

const MUSIC_CONTEXT_LABELS = new Set([
  'music',
  'pop music',
  'rock music',
  'heavy metal',
  'punk rock',
  'grunge',
  'progressive rock',
  'psychedelic rock',
  'blues',
  'jazz',
  'classical music',
  'electronic music',
  'techno',
  'house music',
  'trance music',
  'dubstep',
  'electronica',
  'ambient music',
  'new-age music',
  'soundtrack music',
  'theme music',
  'video game music',
  'folk music',
  'traditional music',
  'music of asia',
  'music of bollywood',
  'music of latin america',
  'music of africa',
  'country',
  'bluegrass',
  'soul music',
  'funk',
  'disco',
  'hip hop music',
  'rhythm and blues',
  'gospel music',
  'reggae',
  'ska',
  'opera',
  'musical',
  'lullaby',
  'background music',
]);

interface AudioSetMappingRule {
  mode: ClassificationMode;
  candidates: readonly YamnetTargetInstrumentName[];
  groupKey: string; // Prevents splitting a single ambiguous prediction into multiple redundant tracks
  description: string;
}

const AUDIOSET_INSTRUMENT_RULES = new Map<string, AudioSetMappingRule>([
  // TIER 1 — EXACT AUDIOSET INSTRUMENT MATCHES
  [
    'violin, fiddle',
    {
      mode: 'exact',
      candidates: ['Violin'],
      groupKey: 'bowed-violin',
      description: 'Exact AudioSet "Violin, fiddle" detection',
    },
  ],
  [
    'cello',
    {
      mode: 'exact',
      candidates: ['Cello'],
      groupKey: 'bowed-cello',
      description: 'Exact AudioSet "Cello" detection',
    },
  ],
  [
    'electric piano',
    {
      mode: 'exact',
      candidates: ['Electric Piano'],
      groupKey: 'keys-epiano',
      description: 'Exact AudioSet "Electric piano" detection',
    },
  ],
  [
    'bass guitar',
    {
      mode: 'exact',
      candidates: ['Bass Guitar'],
      groupKey: 'plucked-bass',
      description: 'Exact AudioSet "Bass guitar" detection',
    },
  ],
  [
    'drum kit',
    {
      mode: 'exact',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Exact AudioSet "Drum kit" detection',
    },
  ],
  [
    'electric guitar',
    {
      mode: 'exact',
      candidates: ['Electric Guitar'],
      groupKey: 'plucked-eguitar',
      description: 'Exact AudioSet "Electric guitar" detection',
    },
  ],
  [
    'piano',
    {
      mode: 'exact',
      candidates: ['Piano', 'Grand Piano'],
      groupKey: 'keys-acoustic-piano',
      description: 'Exact AudioSet "Piano" (Piano vs Grand Piano comparison)',
    },
  ],
  [
    'synthesizer',
    {
      mode: 'exact',
      candidates: ['Synthesizer'],
      groupKey: 'keys-synth',
      description: 'Exact AudioSet "Synthesizer" detection',
    },
  ],
  [
    'flute',
    {
      mode: 'exact',
      candidates: ['Flute'],
      groupKey: 'wind-flute',
      description: 'Exact AudioSet "Flute" detection',
    },
  ],
  [
    'saxophone',
    {
      mode: 'exact',
      candidates: ['Saxophone'],
      groupKey: 'wind-sax',
      description: 'Exact AudioSet "Saxophone" detection',
    },
  ],
  [
    'trumpet',
    {
      mode: 'exact',
      candidates: ['Trumpet'],
      groupKey: 'brass-trumpet',
      description: 'Exact AudioSet "Trumpet" detection',
    },
  ],
  [
    'harp',
    {
      mode: 'exact',
      candidates: ['Harp'],
      groupKey: 'plucked-harp',
      description: 'Exact AudioSet "Harp" detection',
    },
  ],
  [
    'vibraphone',
    {
      mode: 'exact',
      candidates: ['Vibraphone'],
      groupKey: 'perc-vibes',
      description: 'Exact AudioSet "Vibraphone" detection',
    },
  ],

  // TIER 2 — CLOSELY RELATED / ACOUSTIC COUSIN INSTRUMENTS (INFERRED)
  [
    'double bass',
    {
      mode: 'inferred',
      candidates: ['Cello', 'Bass Guitar'],
      groupKey: 'low-strings',
      description: 'AudioSet "Double bass" mapped to Cello/Bass Guitar by context',
    },
  ],
  [
    'acoustic guitar',
    {
      mode: 'inferred',
      candidates: ['Electric Guitar', 'Harp', 'Shamisen'],
      groupKey: 'plucked-strings',
      description: 'Closely related AudioSet "Acoustic guitar" resolved to closest plucked class',
    },
  ],
  [
    'steel guitar, slide guitar',
    {
      mode: 'inferred',
      candidates: ['Electric Guitar'],
      groupKey: 'plucked-eguitar',
      description: 'Closely related AudioSet "Steel guitar, slide guitar"',
    },
  ],
  [
    'tapping (guitar technique)',
    {
      mode: 'inferred',
      candidates: ['Electric Guitar', 'Bass Guitar'],
      groupKey: 'plucked-eguitar',
      description: 'Closely related AudioSet guitar technique',
    },
  ],
  [
    'banjo',
    {
      mode: 'inferred',
      candidates: ['Shamisen', 'Harp', 'Electric Guitar'],
      groupKey: 'plucked-strings',
      description: 'Short-decay crisp plucked AudioSet "Banjo" compared against Shamisen/Harp',
    },
  ],
  [
    'mandolin',
    {
      mode: 'inferred',
      candidates: ['Shamisen', 'Harp', 'Electric Guitar'],
      groupKey: 'plucked-strings',
      description: 'Picked lute AudioSet "Mandolin"',
    },
  ],
  [
    'ukulele',
    {
      mode: 'inferred',
      candidates: ['Harp', 'Shamisen', 'Electric Guitar'],
      groupKey: 'plucked-strings',
      description: 'Nylon plucked AudioSet "Ukulele"',
    },
  ],
  [
    'sitar',
    {
      mode: 'inferred',
      candidates: ['Shamisen', 'Erhu', 'Harp'],
      groupKey: 'plucked-strings',
      description: 'Traditional plucked AudioSet "Sitar"',
    },
  ],
  [
    'zither',
    {
      mode: 'inferred',
      candidates: ['Harp', 'Shamisen'],
      groupKey: 'plucked-strings',
      description: 'Traditional plucked AudioSet "Zither"',
    },
  ],
  [
    'harpsichord',
    {
      mode: 'inferred',
      candidates: ['Grand Piano', 'Piano', 'Harp'],
      groupKey: 'keys-acoustic-piano',
      description: 'Plucked keyboard AudioSet "Harpsichord"',
    },
  ],
  [
    'organ',
    {
      mode: 'inferred',
      candidates: ['Electric Piano', 'Synthesizer', 'Grand Piano'],
      groupKey: 'keys-general',
      description: 'Sustained keyboard AudioSet "Organ"',
    },
  ],
  [
    'electronic organ',
    {
      mode: 'inferred',
      candidates: ['Synthesizer', 'Electric Piano'],
      groupKey: 'keys-general',
      description: 'Electronic keyboard AudioSet "Electronic organ"',
    },
  ],
  [
    'hammond organ',
    {
      mode: 'inferred',
      candidates: ['Electric Piano', 'Synthesizer'],
      groupKey: 'keys-epiano',
      description: 'Electromechanical keyboard AudioSet "Hammond organ"',
    },
  ],
  [
    'theremin',
    {
      mode: 'inferred',
      candidates: ['Synthesizer', 'Erhu'],
      groupKey: 'keys-synth',
      description: 'Continuous pitch electronic AudioSet "Theremin"',
    },
  ],
  [
    'sampler',
    {
      mode: 'inferred',
      candidates: ['Synthesizer'],
      groupKey: 'keys-synth',
      description: 'Electronic AudioSet "Sampler"',
    },
  ],
  [
    'accordion',
    {
      mode: 'inferred',
      candidates: ['Synthesizer', 'Saxophone'],
      groupKey: 'winds-or-synth',
      description: 'Free-reed AudioSet "Accordion"',
    },
  ],
  [
    'harmonica',
    {
      mode: 'inferred',
      candidates: ['Saxophone', 'Flute'],
      groupKey: 'woodwinds-general',
      description: 'Free-reed wind AudioSet "Harmonica"',
    },
  ],
  [
    'clarinet',
    {
      mode: 'inferred',
      candidates: ['Flute', 'Saxophone'],
      groupKey: 'woodwinds-general',
      description: 'Single-reed woodwind AudioSet "Clarinet"',
    },
  ],
  [
    'oboe',
    {
      mode: 'inferred',
      candidates: ['Flute', 'Saxophone', 'Erhu'],
      groupKey: 'woodwinds-general',
      description: 'Expressive nasal woodwind AudioSet "Oboe"',
    },
  ],
  [
    'bassoon',
    {
      mode: 'inferred',
      candidates: ['Saxophone', 'Cello'],
      groupKey: 'woodwinds-general',
      description: 'Low-register woodwind AudioSet "Bassoon"',
    },
  ],
  [
    'bagpipes',
    {
      mode: 'inferred',
      candidates: ['Flute', 'Saxophone'],
      groupKey: 'woodwinds-general',
      description: 'Continuous reed wind AudioSet "Bagpipes"',
    },
  ],
  [
    'french horn',
    {
      mode: 'inferred',
      candidates: ['Trumpet', 'Saxophone'],
      groupKey: 'brass-general',
      description: 'Brass AudioSet "French horn"',
    },
  ],
  [
    'trombone',
    {
      mode: 'inferred',
      candidates: ['Trumpet', 'Saxophone'],
      groupKey: 'brass-general',
      description: 'Low brass AudioSet "Trombone"',
    },
  ],
  [
    'drum machine',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Electronic drum pattern AudioSet "Drum machine"',
    },
  ],
  [
    'drum',
    {
      mode: 'inferred',
      candidates: ['Drum Kit', 'Handpan'],
      groupKey: 'perc-general',
      description: 'Percussive AudioSet "Drum"',
    },
  ],
  [
    'snare drum',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Kit percussion AudioSet "Snare drum"',
    },
  ],
  [
    'bass drum',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Kit percussion AudioSet "Bass drum"',
    },
  ],
  [
    'drum roll',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Kit percussion AudioSet "Drum roll"',
    },
  ],
  [
    'cymbal',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Kit percussion AudioSet "Cymbal"',
    },
  ],
  [
    'hi-hat',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Kit percussion AudioSet "Hi-hat"',
    },
  ],
  [
    'tambourine',
    {
      mode: 'inferred',
      candidates: ['Drum Kit'],
      groupKey: 'perc-drumkit',
      description: 'Percussion AudioSet "Tambourine"',
    },
  ],
  [
    'timpani',
    {
      mode: 'inferred',
      candidates: ['Drum Kit', 'Handpan'],
      groupKey: 'perc-general',
      description: 'Tuned drum AudioSet "Timpani"',
    },
  ],
  [
    'tabla',
    {
      mode: 'inferred',
      candidates: ['Handpan', 'Drum Kit'],
      groupKey: 'perc-general',
      description: 'Hand-struck tonal drum AudioSet "Tabla"',
    },
  ],
  [
    'marimba, xylophone',
    {
      mode: 'inferred',
      candidates: ['Vibraphone', 'Handpan'],
      groupKey: 'perc-mallet',
      description: 'Mallet percussion AudioSet "Marimba, xylophone" (possible Vibraphone/Handpan match)',
    },
  ],
  [
    'glockenspiel',
    {
      mode: 'inferred',
      candidates: ['Vibraphone', 'Handpan'],
      groupKey: 'perc-mallet',
      description: 'Metallic mallet AudioSet "Glockenspiel"',
    },
  ],
  [
    'tubular bells',
    {
      mode: 'inferred',
      candidates: ['Vibraphone', 'Handpan'],
      groupKey: 'perc-mallet',
      description: 'Resonant metallic percussion AudioSet "Tubular bells"',
    },
  ],
  [
    'gong',
    {
      mode: 'inferred',
      candidates: ['Handpan', 'Drum Kit'],
      groupKey: 'perc-general',
      description: 'Metallic resonant percussion AudioSet "Gong"',
    },
  ],
  [
    'cowbell',
    {
      mode: 'inferred',
      candidates: ['Drum Kit', 'Vibraphone'],
      groupKey: 'perc-general',
      description: 'Metallic percussion AudioSet "Cowbell"',
    },
  ],
  [
    'singing bowl',
    {
      mode: 'inferred',
      candidates: ['Handpan', 'Vibraphone'],
      groupKey: 'perc-resonant',
      description: 'Resonant harmonic metal AudioSet "Singing bowl" inferred to Handpan/Vibraphone',
    },
  ],
  [
    'steelpan',
    {
      mode: 'inferred',
      candidates: ['Handpan', 'Vibraphone'],
      groupKey: 'perc-resonant',
      description: 'Harmonic steel drum AudioSet "Steelpan" inferred to Handpan/Vibraphone',
    },
  ],

  // TIER 3 — BROAD / AMBIGUOUS INSTRUMENT FAMILY CATEGORIES (BEST-MATCH FALLBACK)
  [
    'bowed string instrument',
    {
      mode: 'best_match',
      candidates: ['Violin', 'Cello', 'Erhu'],
      groupKey: 'broad-bowed-strings',
      description: 'Broad AudioSet "Bowed string instrument" resolved among Violin/Cello/Erhu',
    },
  ],
  [
    'plucked string instrument',
    {
      mode: 'best_match',
      candidates: ['Bass Guitar', 'Electric Guitar', 'Shamisen', 'Harp'],
      groupKey: 'broad-plucked-strings',
      description:
        'Broad AudioSet "Plucked string instrument" resolved among Bass Guitar/Electric Guitar/Shamisen/Harp',
    },
  ],
  [
    'guitar',
    {
      mode: 'best_match',
      candidates: ['Electric Guitar', 'Bass Guitar', 'Shamisen'],
      groupKey: 'broad-guitar',
      description: 'Broad AudioSet "Guitar" resolved between Electric Guitar and Bass Guitar',
    },
  ],
  [
    'keyboard (musical)',
    {
      mode: 'best_match',
      candidates: ['Piano', 'Grand Piano', 'Electric Piano', 'Synthesizer'],
      groupKey: 'broad-keyboard',
      description:
        'Broad AudioSet "Keyboard (musical)" resolved among Piano/Grand Piano/Electric Piano/Synthesizer',
    },
  ],
  [
    'percussion',
    {
      mode: 'best_match',
      candidates: ['Drum Kit', 'Vibraphone', 'Handpan'],
      groupKey: 'broad-percussion',
      description: 'Broad AudioSet "Percussion" resolved among Drum Kit/Vibraphone/Handpan',
    },
  ],
  [
    'bell',
    {
      mode: 'best_match',
      candidates: ['Vibraphone', 'Handpan', 'Electric Piano'],
      groupKey: 'broad-percussion',
      description: 'Broad AudioSet "Bell" resolved among tonal percussion/chime classes',
    },
  ],
  [
    'wind instrument, woodwind instrument',
    {
      mode: 'best_match',
      candidates: ['Flute', 'Saxophone'],
      groupKey: 'broad-woodwind',
      description: 'Broad AudioSet "Wind instrument, woodwind instrument" resolved between Flute/Saxophone',
    },
  ],
  [
    'brass instrument',
    {
      mode: 'best_match',
      candidates: ['Trumpet', 'Saxophone'],
      groupKey: 'broad-brass',
      description: 'Broad AudioSet "Brass instrument" resolved to Trumpet/Saxophone',
    },
  ],
  [
    'orchestra',
    {
      mode: 'best_match',
      candidates: ['Violin', 'Cello', 'Grand Piano', 'Harp', 'Flute', 'Trumpet'],
      groupKey: 'broad-orchestra',
      description: 'Broad AudioSet "Orchestra" resolved via co-evidence, acoustic cues, and continuity',
    },
  ],
  [
    'musical instrument',
    {
      mode: 'best_match',
      candidates: YAMNET_TARGET_NAMES,
      groupKey: 'broad-generic-instrument',
      description: 'Generic AudioSet "Musical instrument" resolved to closest supported instrument',
    },
  ],
]);

// Sub-candidate scoring families for contextual tie-breaking
const BOWED_FAMILY: YamnetTargetInstrumentName[] = ['Violin', 'Cello', 'Erhu'];
const PLUCKED_FAMILY: YamnetTargetInstrumentName[] = [
  'Electric Guitar',
  'Bass Guitar',
  'Shamisen',
  'Harp',
];
const KEYBOARD_FAMILY: YamnetTargetInstrumentName[] = [
  'Piano',
  'Grand Piano',
  'Electric Piano',
  'Synthesizer',
];
const PERCUSSION_FAMILY: YamnetTargetInstrumentName[] = ['Drum Kit', 'Vibraphone', 'Handpan'];
const WIND_BRASS_FAMILY: YamnetTargetInstrumentName[] = ['Flute', 'Saxophone', 'Trumpet'];

export function getInstrumentAmbiguityFamily(name: YamnetTargetInstrumentName): string {
  if (BOWED_FAMILY.includes(name)) return 'bowed';
  if (PLUCKED_FAMILY.includes(name)) return 'plucked';
  if (KEYBOARD_FAMILY.includes(name)) return 'keyboard';
  if (PERCUSSION_FAMILY.includes(name)) return 'percussion';
  if (WIND_BRASS_FAMILY.includes(name)) return 'wind_brass';
  return 'other';
}

export function classifyAudioSetCategoryRole(categoryName: string): AudioSetCategoryRole {
  const lower = (categoryName || '').trim().toLowerCase();
  if (!lower) return 'other';
  const rule = AUDIOSET_INSTRUMENT_RULES.get(lower);
  if (rule) {
    if (rule.mode === 'exact') return 'exact_instrument';
    if (rule.mode === 'inferred') return 'related_instrument';
    return 'broad_instrument';
  }
  if (SILENCE_LABELS.has(lower)) return 'silence';
  if (SPEECH_LABELS.has(lower)) return 'speech';
  if (VOCAL_NON_INSTRUMENT_LABELS.has(lower)) return 'vocal';
  if (ENVIRONMENTAL_NOISE_LABELS.has(lower)) return 'noise';
  if (MUSIC_CONTEXT_LABELS.has(lower)) return 'music_context';
  return 'other';
}

/**
 * Legacy single-label check helper preserved for quick inspections.
 */
export function isAudioSetSilenceOrSpeech(categoryName: string): 'silence' | 'speech' | null {
  const lower = (categoryName || '').trim().toLowerCase();
  if (SILENCE_LABELS.has(lower)) return 'silence';
  if (SPEECH_LABELS.has(lower)) return 'speech';
  return null;
}

/**
 * Quick deterministic single-label lookup into the 17-class closed-set catalogue,
 * or null if the AudioSet label carries no instrument evidence (Silence, Speech, bare Music, Noise).
 */
export function mapAudioSetLabelToInstrument(
  categoryName: string,
  displayName?: string
): {
  target: YamnetTargetInstrument;
  classificationMode: ClassificationMode;
  isFallback: boolean;
  originalModelClass: string;
} | null {
  const candidates = [categoryName, displayName].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  );

  for (const raw of candidates) {
    const clean = raw.trim();
    const rule = AUDIOSET_INSTRUMENT_RULES.get(clean.toLowerCase());
    if (rule && rule.candidates.length > 0) {
      const target = YAMNET_TARGET_BY_NAME.get(rule.candidates[0])!;
      return {
        target,
        classificationMode: rule.mode,
        isFallback: rule.mode === 'best_match',
        originalModelClass: clean,
      };
    }
  }
  return null;
}

// ============================================================================
// 4. STAGE B CLOSED-SET MULTI-EVIDENCE RESOLVER
// ============================================================================

function computeCandidateContextualScore(params: {
  candidate: YamnetTargetInstrumentName;
  ruleMode: ClassificationMode;
  candidateIndex: number;
  rawScoresByLabel: Map<string, number>;
  temporalHistory?: TemporalHistoryLookup;
  acoustic?: AcousticFrameFeatures;
}): {
  bonus: number;
  reasons: string[];
  influencedByHistory: boolean;
  coEvidenceLabels: string[];
} {
  const { candidate, ruleMode, candidateIndex, rawScoresByLabel, temporalHistory, acoustic } = params;
  let bonus = 0;
  const reasons: string[] = [];
  const coEvidenceLabels: string[] = [];
  let influencedByHistory = false;

  // Preserve slight default ordering preference for primary listed candidates
  bonus -= candidateIndex * 0.015;

  // 1. Direct & Related AudioSet Co-Evidence inside the same frame
  const scoreOf = (label: string) => rawScoresByLabel.get(label.toLowerCase()) ?? 0;

  if (candidate === 'Violin') {
    const v = scoreOf('violin, fiddle');
    if (v > 0) {
      bonus += 0.6 + v;
      coEvidenceLabels.push('Violin, fiddle');
      reasons.push('co-occurring Violin, fiddle evidence');
    }
  } else if (candidate === 'Cello') {
    const c = scoreOf('cello') + scoreOf('double bass') * 0.7;
    if (c > 0) {
      bonus += 0.55 + c;
      if (scoreOf('cello') > 0) coEvidenceLabels.push('Cello');
      if (scoreOf('double bass') > 0) coEvidenceLabels.push('Double bass');
      reasons.push('co-occurring low bowed string evidence');
    }
  } else if (candidate === 'Erhu') {
    const folk = scoreOf('traditional music') + scoreOf('music of asia') + scoreOf('folk music');
    if (folk > 0.05) {
      bonus += 0.22 + folk * 0.4;
      reasons.push('traditional/Asian modal bowed evidence');
    }
  } else if (candidate === 'Bass Guitar') {
    const b = scoreOf('bass guitar') + scoreOf('double bass') * 0.45;
    if (b > 0) {
      bonus += 0.6 + b;
      if (scoreOf('bass guitar') > 0) coEvidenceLabels.push('Bass guitar');
      reasons.push('co-occurring Bass guitar evidence');
    }
    const funk = scoreOf('funk') + scoreOf('hip hop music');
    if (funk > 0.1) {
      bonus += 0.15 * funk;
      reasons.push('groove/bass genre context');
    }
  } else if (candidate === 'Electric Guitar') {
    const eg =
      scoreOf('electric guitar') +
      scoreOf('steel guitar, slide guitar') * 0.8 +
      scoreOf('tapping (guitar technique)') * 0.8;
    if (eg > 0) {
      bonus += 0.6 + eg;
      if (scoreOf('electric guitar') > 0) coEvidenceLabels.push('Electric guitar');
      reasons.push('co-occurring Electric guitar evidence');
    }
    const rock = scoreOf('rock music') + scoreOf('heavy metal') + scoreOf('punk rock');
    if (rock > 0.08) {
      bonus += 0.14 + rock * 0.2;
      reasons.push('rock/metal context cue');
    }
  } else if (candidate === 'Shamisen') {
    const asia =
      scoreOf('traditional music') +
      scoreOf('music of asia') +
      scoreOf('banjo') * 0.5 +
      scoreOf('mandolin') * 0.4;
    if (asia > 0.08) {
      bonus += 0.24 + asia * 0.4;
      reasons.push('traditional sharp-plucked context');
    }
  } else if (candidate === 'Harp') {
    const h = scoreOf('harp');
    if (h > 0) {
      bonus += 0.65 + h;
      coEvidenceLabels.push('Harp');
      reasons.push('co-occurring Harp evidence');
    }
    const gentle = scoreOf('classical music') + scoreOf('lullaby') + scoreOf('new-age music');
    if (gentle > 0.1) {
      bonus += 0.1 + gentle * 0.18;
    }
  } else if (candidate === 'Piano' || candidate === 'Grand Piano') {
    const p = scoreOf('piano');
    const anyKey = p + scoreOf('keyboard (musical)') + scoreOf('harpsichord');
    const cl = scoreOf('classical music') + scoreOf('orchestra');
    if (candidate === 'Piano' && p > 0) {
      bonus += 0.5 + p;
      coEvidenceLabels.push('Piano');
    }
    if (candidate === 'Grand Piano') {
      if (p > 0 && cl > 0.18) {
        bonus += 0.52 + p + cl * 0.25;
        reasons.push('classical/orchestral acoustic grand piano cues');
      } else if (anyKey > 0 && cl > 0.25) {
        bonus += 0.18 + cl * 0.2;
        reasons.push('classical/concert keyboard cue');
      }
    }
  } else if (candidate === 'Electric Piano') {
    const ep = scoreOf('electric piano') + scoreOf('hammond organ') * 0.6;
    if (ep > 0) {
      bonus += 0.6 + ep;
      if (scoreOf('electric piano') > 0) coEvidenceLabels.push('Electric piano');
      reasons.push('co-occurring Electric piano evidence');
    }
    const jazz = scoreOf('jazz') + scoreOf('soul music') + scoreOf('rhythm and blues');
    if (jazz > 0.1) {
      bonus += 0.14 + jazz * 0.22;
      reasons.push('jazz/soul electric keyboard cue');
    }
  } else if (candidate === 'Synthesizer') {
    const sy =
      scoreOf('synthesizer') + scoreOf('electronic organ') * 0.6 + scoreOf('sampler') * 0.6;
    if (sy > 0) {
      bonus += 0.6 + sy;
      if (scoreOf('synthesizer') > 0) coEvidenceLabels.push('Synthesizer');
      reasons.push('co-occurring Synthesizer evidence');
    }
    const edm =
      scoreOf('electronic music') +
      scoreOf('techno') +
      scoreOf('electronica') +
      scoreOf('video game music') +
      scoreOf('ambient music');
    if (edm > 0.1) {
      bonus += 0.22 + edm * 0.28;
      reasons.push('electronic/synth context cue');
    }
  } else if (candidate === 'Drum Kit') {
    const d =
      scoreOf('drum kit') +
      scoreOf('snare drum') * 0.7 +
      scoreOf('bass drum') * 0.7 +
      scoreOf('cymbal') * 0.6 +
      scoreOf('hi-hat') * 0.6 +
      scoreOf('drum machine') * 0.6;
    if (d > 0) {
      bonus += 0.55 + d;
      reasons.push('co-occurring kit/percussion cues');
    }
    const beat = scoreOf('rock music') + scoreOf('pop music') + scoreOf('hip hop music');
    if (beat > 0.12) {
      bonus += 0.12 + beat * 0.15;
    }
  } else if (candidate === 'Vibraphone') {
    const v = scoreOf('vibraphone') + scoreOf('marimba, xylophone') * 0.55 + scoreOf('glockenspiel') * 0.45;
    if (v > 0) {
      bonus += 0.5 + v;
      reasons.push('co-occurring mallet/vibraphone cues');
    }
    if (scoreOf('jazz') > 0.12) {
      bonus += 0.16;
      reasons.push('jazz vibraphone cue');
    }
  } else if (candidate === 'Handpan') {
    const hp = scoreOf('singing bowl') * 0.6 + scoreOf('steelpan') * 0.6;
    if (hp > 0) {
      bonus += 0.45 + hp;
      reasons.push('resonant harmonic metal percussion cue');
    }
    const amb = scoreOf('new-age music') + scoreOf('ambient music') + scoreOf('meditation');
    if (amb > 0.12) {
      bonus += 0.18 + amb * 0.2;
      reasons.push('ambient/harmonic percussion context');
    }
  } else if (candidate === 'Flute') {
    const fl = scoreOf('flute') + scoreOf('clarinet') * 0.35 + scoreOf('oboe') * 0.35;
    if (fl > 0) {
      bonus += 0.55 + fl;
      reasons.push('co-occurring Flute/woodwind cue');
    }
  } else if (candidate === 'Saxophone') {
    const sx = scoreOf('saxophone') + scoreOf('jazz') * 0.25 + scoreOf('soul music') * 0.2;
    if (sx > 0) {
      bonus += 0.5 + sx;
      reasons.push('co-occurring Saxophone/jazz cue');
    }
  } else if (candidate === 'Trumpet') {
    const tr = scoreOf('trumpet') + scoreOf('french horn') * 0.4 + scoreOf('trombone') * 0.4;
    if (tr > 0) {
      bonus += 0.55 + tr;
      reasons.push('co-occurring Trumpet/brass cue');
    }
  }

  // 2. Acoustic PCM Features Tie-Breaker (when live PCM audio is provided)
  if (acoustic && acoustic.rms > 0.002) {
    if (candidate === 'Bass Guitar' && acoustic.lowBandRatio >= 0.38 && acoustic.spectralCentroidHz < 700) {
      bonus += 0.24;
      reasons.push(`low-frequency energy (${Math.round(acoustic.lowBandRatio * 100)}% <250Hz)`);
    } else if (
      candidate === 'Electric Guitar' &&
      acoustic.highMidRatio >= 0.24 &&
      acoustic.lowBandRatio < 0.35
    ) {
      bonus += 0.16;
      reasons.push(`mid-high harmonic focus (${Math.round(acoustic.spectralCentroidHz)}Hz centroid)`);
    } else if (candidate === 'Cello' && acoustic.lowBandRatio >= 0.26 && acoustic.spectralCentroidHz < 950) {
      bonus += 0.22;
      reasons.push(`warm low-register resonance (${Math.round(acoustic.spectralCentroidHz)}Hz)`);
    } else if (candidate === 'Violin' && acoustic.spectralCentroidHz >= 1350 && acoustic.highBandRatio >= 0.12) {
      bonus += 0.2;
      reasons.push(`bright high-register bowed centroid (${Math.round(acoustic.spectralCentroidHz)}Hz)`);
    } else if (
      candidate === 'Erhu' &&
      acoustic.spectralCentroidHz >= 850 &&
      acoustic.spectralCentroidHz <= 1700 &&
      acoustic.highMidRatio >= 0.34
    ) {
      bonus += 0.14;
      reasons.push('focused vocal-mid bowed formant profile');
    } else if (candidate === 'Shamisen' && acoustic.crestFactor >= 4.8 && acoustic.lowBandRatio < 0.18) {
      bonus += 0.18;
      reasons.push(`sharp dry pluck transient (crest=${acoustic.crestFactor.toFixed(1)})`);
    } else if (candidate === 'Synthesizer' && acoustic.crestFactor > 0 && acoustic.crestFactor < 2.6) {
      bonus += 0.18;
      reasons.push('sustained electronic envelope');
    } else if (
      (candidate === 'Piano' || candidate === 'Grand Piano') &&
      acoustic.crestFactor >= 3.0 &&
      acoustic.lowMidRatio >= 0.25
    ) {
      bonus += candidate === 'Grand Piano' && acoustic.lowBandRatio >= 0.22 ? 0.18 : 0.14;
      reasons.push('percussive hammer-string resonance');
    } else if (candidate === 'Drum Kit' && (acoustic.lowBandRatio >= 0.28 || acoustic.zeroCrossingRate >= 0.16)) {
      bonus += 0.18;
      reasons.push('broadband kick/transient percussive spectrum');
    }
  }

  // 3. Temporal Continuity / Family-Internal Hysteresis
  // For exact "Piano", allow Grand Piano continuity to gently win only when Grand Piano was recently active
  // so Piano vs Grand Piano stays stable; for inferred & best_match, apply full stability hysteresis.
  if (temporalHistory) {
    const hist = temporalHistory.get(candidate);
    if (hist && hist.framesSinceLastSeen <= 4) {
      const recencyDecay = Math.pow(0.75, hist.framesSinceLastSeen);
      const stabilityWeight =
        ruleMode === 'best_match'
          ? 0.36
          : ruleMode === 'inferred'
          ? 0.28
          : candidate === 'Grand Piano'
          ? 0.22
          : 0.1;
      const continuityBonus =
        stabilityWeight * recencyDecay * Math.min(1, 0.45 + hist.emaScore * 0.8 + hist.consecutiveFrames * 0.08);
      if (continuityBonus > 0.04) {
        bonus += continuityBonus;
        influencedByHistory = true;
        reasons.push(`temporal continuity (${hist.consecutiveFrames}f)`);
      }
    }
  }

  return {
    bonus,
    reasons,
    influencedByHistory,
    coEvidenceLabels,
  };
}

/**
 * Stage B Resolver: converts a frame of raw YAMNet AudioSet categories (plus optional PCM acoustic cues
 * and temporal tracking history) into closed-set decisions over ONLY the 17 supported instruments.
 *
 * Guarantees:
 * - Zero outputs outside the 17-class YAMNET_TARGET_CATALOG.
 * - Multi-instrument preservation (independent audio categories keep independent instruments).
 * - Broad categories resolved transparently to best match with honest lower confidence & isFallback=true.
 * - Silence, speech, and environmental noise never fabricate instrument predictions.
 * - Bare "Music" / genre predictions alone (cold start without instrument cues) do not fabricate instruments.
 */
export function resolveAudioSetToClosedSet17(params: {
  categories: RawAudioSetPrediction[];
  temporalHistory?: TemporalHistoryLookup;
  acousticFeatures?: AcousticFrameFeatures;
  inputRms?: number;
  maxInstruments?: number;
}): FrameEvidenceAnalysis {
  const {
    categories,
    temporalHistory,
    acousticFeatures,
    inputRms,
    maxInstruments = 5,
  } = params;

  const effectiveRms = typeof inputRms === 'number' ? inputRms : acousticFeatures?.rms;

  const topRawCategories = categories.slice(0, 10).map((c) => {
    const name = (c.categoryName || c.displayName || 'Unknown').trim();
    return {
      categoryName: name,
      score: typeof c.score === 'number' && Number.isFinite(c.score) ? c.score : 0,
      role: classifyAudioSetCategoryRole(name),
    };
  });

  // 1. Hardware / digital silence guard
  if (typeof effectiveRms === 'number' && effectiveRms <= 0.0008) {
    return {
      isSilence: true,
      isSpeechDominant: false,
      isNonMusicalNoise: false,
      isMusicalAudio: false,
      hasInstrumentEvidence: false,
      hasBareMusicOnly: false,
      silenceOrNonMusicalReason: `Low/zero waveform RMS (${effectiveRms.toFixed(5)})`,
      topRawCategories,
      musicContextScore: 0,
      decisions: [],
    };
  }

  const rawScoresByLabel = new Map<string, number>();
  let silenceScore = 0;
  let speechScore = 0;
  let noiseScore = 0;
  let musicContextScore = 0;
  let vocalScore = 0;
  let maxInstrumentRuleScore = 0;

  interface TriggeredRule {
    originalLabel: string;
    rawScore: number;
    rule: AudioSetMappingRule;
  }
  const triggeredRules: TriggeredRule[] = [];

  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    const cat = categories[catIdx];
    const cleanName = (cat.categoryName || cat.displayName || '').trim();
    if (!cleanName) continue;
    const score = typeof cat.score === 'number' && Number.isFinite(cat.score) ? cat.score : 0;
    const lower = cleanName.toLowerCase();
    rawScoresByLabel.set(lower, Math.max(rawScoresByLabel.get(lower) ?? 0, score));

    const rule = AUDIOSET_INSTRUMENT_RULES.get(lower);
    if (rule) {
      // With maxResults=521, accept top-20 categories unthresholded AND any additional
      // instrument rule with meaningful signal >= 0.015 while suppressing < 0.015 sigmoid tails.
      if (catIdx < 20 || score >= 0.015) {
        triggeredRules.push({ originalLabel: cleanName, rawScore: score, rule });
        if (score > maxInstrumentRuleScore) maxInstrumentRuleScore = score;
      }
      continue;
    }

    if (SILENCE_LABELS.has(lower)) silenceScore = Math.max(silenceScore, score);
    else if (SPEECH_LABELS.has(lower)) speechScore = Math.max(speechScore, score);
    else if (ENVIRONMENTAL_NOISE_LABELS.has(lower)) noiseScore = Math.max(noiseScore, score);
    else if (VOCAL_NON_INSTRUMENT_LABELS.has(lower)) vocalScore = Math.max(vocalScore, score);
    else if (MUSIC_CONTEXT_LABELS.has(lower)) musicContextScore = Math.max(musicContextScore, score);
  }

  const hasInstrumentEvidence = triggeredRules.length > 0;
  const isMusicalAudio = hasInstrumentEvidence || musicContextScore >= 0.2;

  // 2. Explicit AudioSet Silence / Speech / Noise non-musical guards
  if (silenceScore >= 0.35 && !hasInstrumentEvidence && musicContextScore < 0.15) {
    return {
      isSilence: true,
      isSpeechDominant: false,
      isNonMusicalNoise: false,
      isMusicalAudio: false,
      hasInstrumentEvidence: false,
      hasBareMusicOnly: false,
      silenceOrNonMusicalReason: `AudioSet Silence dominant (${(silenceScore * 100).toFixed(1)}%)`,
      topRawCategories,
      musicContextScore,
      decisions: [],
    };
  }

  if (speechScore >= 0.25 && maxInstrumentRuleScore < 0.06 && musicContextScore < 0.25) {
    return {
      isSilence: false,
      isSpeechDominant: true,
      isNonMusicalNoise: false,
      isMusicalAudio: false,
      hasInstrumentEvidence: false,
      hasBareMusicOnly: false,
      silenceOrNonMusicalReason: `Speech-only audio dominant (${(speechScore * 100).toFixed(1)}%)`,
      topRawCategories,
      musicContextScore,
      decisions: [],
    };
  }

  if (noiseScore >= 0.3 && maxInstrumentRuleScore < 0.06 && musicContextScore < 0.25) {
    return {
      isSilence: false,
      isSpeechDominant: false,
      isNonMusicalNoise: true,
      isMusicalAudio: false,
      hasInstrumentEvidence: false,
      hasBareMusicOnly: false,
      silenceOrNonMusicalReason: `Environmental non-musical noise dominant (${(noiseScore * 100).toFixed(1)}%)`,
      topRawCategories,
      musicContextScore,
      decisions: [],
    };
  }

  // Vocals without instrument evidence -> do not emit fake instrument highlights
  if (vocalScore >= 0.25 && !hasInstrumentEvidence && musicContextScore < 0.35) {
    return {
      isSilence: false,
      isSpeechDominant: false,
      isNonMusicalNoise: false,
      isMusicalAudio: true,
      hasInstrumentEvidence: false,
      hasBareMusicOnly: false,
      silenceOrNonMusicalReason: `Vocal-only segment (${(vocalScore * 100).toFixed(1)}%) with zero instrument evidence`,
      topRawCategories,
      musicContextScore,
      decisions: [],
    };
  }

  // 3. No instrument tags at all (possibly bare "Music" genre only) -> do not fabricate on Stage B
  if (!hasInstrumentEvidence) {
    return {
      isSilence: false,
      isSpeechDominant: false,
      isNonMusicalNoise: false,
      isMusicalAudio,
      hasInstrumentEvidence: false,
      hasBareMusicOnly: musicContextScore >= 0.2,
      silenceOrNonMusicalReason:
        musicContextScore >= 0.2
          ? `Generic music context (${(musicContextScore * 100).toFixed(1)}%) without direct instrument evidence`
          : 'No musical instrument evidence in frame',
      topRawCategories,
      musicContextScore,
      decisions: [],
    };
  }

  // 4. Resolve each triggered AudioSet rule to its best closed-set candidate
  // Process exact rules first so their chosen targets reinforce broad rules in the same frame!
  const sortedRules = [...triggeredRules].sort((a, b) => {
    const modeRank = (m: ClassificationMode) => (m === 'exact' ? 3 : m === 'inferred' ? 2 : 1);
    return modeRank(b.rule.mode) - modeRank(a.rule.mode) || b.rawScore - a.rawScore;
  });

  const decisionByInstrument = new Map<YamnetTargetInstrumentName, ClosedSetCandidateDecision>();
  const resolvedGroupWinner = new Map<string, YamnetTargetInstrumentName>();

  for (const item of sortedRules) {
    const { originalLabel, rawScore, rule } = item;

    // Evaluate all candidates allowed for this rule
    let bestCandidate: YamnetTargetInstrumentName = rule.candidates[0];
    let bestScore = -Infinity;
    let bestReasons: string[] = [];
    let bestInfluenced = false;
    let bestCoEvidence: string[] = [];

    // If an exact/inferred rule already selected an instrument in the exact same ambiguity group,
    // check if we already settled that group (e.g., Piano vs Keyboard (musical))
    const existingGroupWinner = resolvedGroupWinner.get(rule.groupKey);
    if (existingGroupWinner && rule.candidates.includes(existingGroupWinner)) {
      bestCandidate = existingGroupWinner;
    }

    rule.candidates.forEach((candidateName, idx) => {
      const ctx = computeCandidateContextualScore({
        candidate: candidateName,
        ruleMode: rule.mode,
        candidateIndex: idx,
        rawScoresByLabel,
        temporalHistory,
        acoustic: acousticFeatures,
      });

      // Exact single-candidate rule gets priority weight cleanly
      let candidateScore = rawScore + ctx.bonus;
      if (decisionByInstrument.has(candidateName) && rule.mode !== 'exact') {
        // Co-evidence agreement with an already triggered rule in the same frame
        candidateScore += 0.25;
        ctx.reasons.push('reinforced by same-frame detection');
      }

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestCandidate = candidateName;
        bestReasons = ctx.reasons;
        bestInfluenced = ctx.influencedByHistory;
        bestCoEvidence = ctx.coEvidenceLabels;
      }
    });

    const target = YAMNET_TARGET_BY_NAME.get(bestCandidate);
    if (!target) continue; // Closed-set structural safeguard

    resolvedGroupWinner.set(rule.groupKey, target.canonicalName);

    // Determine effective mode:
    // AudioSet "Piano" stays 'exact' when resolving to 'Piano', and 'inferred' if contextualized to 'Grand Piano'
    let effectiveMode: ClassificationMode = rule.mode;
    if (originalLabel.toLowerCase() === 'piano' && target.canonicalName === 'Grand Piano') {
      effectiveMode = 'inferred';
    }
    const isFallback = effectiveMode === 'best_match';

    // Honest confidence calculation distinct from raw AudioSet probability
    let classificationConfidence: number;
    if (effectiveMode === 'exact') {
      classificationConfidence = Math.round(Math.max(1, Math.min(99, rawScore * 100)));
    } else if (effectiveMode === 'inferred') {
      const bonusBoost = Math.min(0.12, Math.max(0, bestScore - rawScore) * 0.15);
      classificationConfidence = Math.round(
        Math.max(1, Math.min(74, (rawScore + bonusBoost) * 78))
      );
    } else {
      // Best-match fallback MUST stay honestly marked as lower-confidence / uncertain
      const coBoost = Math.min(0.15, Math.max(0, bestScore - rawScore) * 0.2);
      classificationConfidence = Math.round(
        Math.max(1, Math.min(54, (rawScore + coBoost) * 58))
      );
    }

    const reasonText =
      bestReasons.length > 0
        ? `${rule.description} (${bestReasons.join('; ')})`
        : rule.description;

    const candidatePool =
      rule.candidates.length > 1 && rule.candidates.length <= 6
        ? [...rule.candidates]
        : undefined;

    const candidateDecision: ClosedSetCandidateDecision = {
      instrument: target,
      family: target.family,
      classificationMode: effectiveMode,
      isFallback,
      originalModelClass: originalLabel,
      rawScore,
      evidenceScore: Math.max(0, bestScore),
      classificationConfidence,
      selectionEvidence: reasonText,
      candidatePool,
      influencedByTemporalHistory: bestInfluenced,
      coEvidenceLabels: bestCoEvidence,
    };

    // Deduplicate same canonical instrument per frame, keeping highest mode rank / rawScore
    const prev = decisionByInstrument.get(target.canonicalName);
    if (!prev) {
      decisionByInstrument.set(target.canonicalName, candidateDecision);
    } else {
      const rank = (m: ClassificationMode) => (m === 'exact' ? 3 : m === 'inferred' ? 2 : 1);
      const prevRank = rank(prev.classificationMode);
      const currRank = rank(candidateDecision.classificationMode);
      if (currRank > prevRank || (currRank === prevRank && candidateDecision.rawScore > prev.rawScore)) {
        candidateDecision.coEvidenceLabels = Array.from(
          new Set([
            ...candidateDecision.coEvidenceLabels,
            prev.originalModelClass,
            ...prev.coEvidenceLabels,
          ])
        );
        decisionByInstrument.set(target.canonicalName, candidateDecision);
      } else {
        prev.coEvidenceLabels = Array.from(
          new Set([
            ...prev.coEvidenceLabels,
            candidateDecision.originalModelClass,
            ...candidateDecision.coEvidenceLabels,
          ])
        );
      }
    }
  }

  // Final closed-set check and multi-instrument ranking
  const finalDecisions = Array.from(decisionByInstrument.values())
    .filter((d) => isSupportedYamnetInstrument(d.instrument.canonicalName))
    .sort((a, b) => b.evidenceScore - a.evidenceScore || b.rawScore - a.rawScore)
    .slice(0, maxInstruments);

  return {
    isSilence: false,
    isSpeechDominant: false,
    isNonMusicalNoise: false,
    isMusicalAudio: true,
    hasInstrumentEvidence: true,
    hasBareMusicOnly: false,
    silenceOrNonMusicalReason: null,
    topRawCategories,
    musicContextScore,
    decisions: finalDecisions,
  };
}

// ============================================================================
// 5. INDEPENDENT VOCAL EVALUATION PATH (18TH UNIFIED CATEGORY: "Vocals")
// ============================================================================

export interface VocalTemporalHistoryHint {
  emaScore: number;
  activeConsecutiveFrames: number;
  framesSinceVocalEvidence: number;
}

export interface VocalFrameEvaluation {
  hasVocalEvidence: boolean;
  isSilence: boolean;
  isSpeechWithoutSinging: boolean;
  isMusicalContext: boolean;
  classificationMode: 'exact' | 'inferred';
  originalModelClass: string;
  matchedLabels: Array<{ label: string; score: number; tier: 'exact' | 'inferred' }>;
  rawScore: number;
  combinedEvidenceScore: number;
  classificationConfidence: number; // Honest 0..100 estimate
  speechScore: number;
  selectionEvidence: string;
  blockedReason: string | null;
}

const MIN_COLD_EXACT_VOCAL_SCORE = 0.018;
const MIN_CONTINUED_EXACT_VOCAL_SCORE = 0.012;
const MIN_INFERRED_VOCAL_SCORE = 0.05;

/**
 * Evaluates singing/vocal evidence independently across ALL returned AudioSet categories
 * so loud accompanying instruments (Piano, Drum Kit, Violin, Guitar) never suppress singing.
 * Keeps ordinary speech (Speech, Narration, Conversation) distinct from Vocals.
 */
export function evaluateVocalsIndependently(params: {
  categories: RawAudioSetPrediction[];
  vocalHistory?: VocalTemporalHistoryHint;
  acousticFeatures?: AcousticFrameFeatures;
  inputRms?: number;
}): VocalFrameEvaluation {
  const { categories, vocalHistory, acousticFeatures, inputRms } = params;
  const effectiveRms = typeof inputRms === 'number' ? inputRms : acousticFeatures?.rms;

  if (typeof effectiveRms === 'number' && effectiveRms <= 0.0008) {
    return {
      hasVocalEvidence: false,
      isSilence: true,
      isSpeechWithoutSinging: false,
      isMusicalContext: false,
      classificationMode: 'exact',
      originalModelClass: '',
      matchedLabels: [],
      rawScore: 0,
      combinedEvidenceScore: 0,
      classificationConfidence: 0,
      speechScore: 0,
      selectionEvidence: 'Silence (low/zero RMS)',
      blockedReason: `silence_rms (${effectiveRms.toFixed(5)})`,
    };
  }

  let silenceScore = 0;
  let speechScore = 0;
  let musicScore = 0;
  let rappingScore = 0;

  const exactHits: Array<{ label: string; score: number; tier: 'exact' }> = [];
  const inferredHits: Array<{ label: string; score: number; tier: 'inferred' }> = [];

  for (const cat of categories) {
    const clean = (cat.categoryName || cat.displayName || '').trim();
    if (!clean) continue;
    const score = typeof cat.score === 'number' && Number.isFinite(cat.score) ? cat.score : 0;
    const lower = clean.toLowerCase();

    if (SILENCE_LABELS.has(lower)) {
      silenceScore = Math.max(silenceScore, score);
    } else if (EXACT_VOCAL_SINGING_LABELS.has(lower)) {
      exactHits.push({ label: clean, score, tier: 'exact' });
    } else if (INFERRED_VOCAL_SINGING_LABELS.has(lower)) {
      inferredHits.push({ label: clean, score, tier: 'inferred' });
    } else if (lower === 'rapping') {
      rappingScore = Math.max(rappingScore, score);
      speechScore = Math.max(speechScore, score * 0.65);
    } else if (SPEECH_LABELS.has(lower)) {
      speechScore = Math.max(speechScore, score);
    } else if (MUSIC_CONTEXT_LABELS.has(lower) || AUDIOSET_INSTRUMENT_RULES.has(lower)) {
      musicScore = Math.max(musicScore, score);
    }
  }

  exactHits.sort((a, b) => b.score - a.score);
  inferredHits.sort((a, b) => b.score - a.score);

  const isContinuedVocals = Boolean(
    vocalHistory &&
      vocalHistory.framesSinceVocalEvidence <= 2 &&
      (vocalHistory.activeConsecutiveFrames >= 1 || vocalHistory.emaScore >= 0.03)
  );

  const exactMinFloor = isContinuedVocals
    ? MIN_CONTINUED_EXACT_VOCAL_SCORE
    : MIN_COLD_EXACT_VOCAL_SCORE;

  const usableExact = exactHits.filter((h) => h.score >= exactMinFloor);
  const usableInferred = inferredHits.filter((h) => h.score >= MIN_INFERRED_VOCAL_SCORE);

  const bestExact = usableExact[0];
  const bestInferred = usableInferred[0];
  const isMusicalContext = musicScore >= 0.15 || usableExact.length > 0 || usableInferred.length > 0;

  if (silenceScore >= 0.35 && !bestExact && !bestInferred && musicScore < 0.15) {
    return {
      hasVocalEvidence: false,
      isSilence: true,
      isSpeechWithoutSinging: false,
      isMusicalContext: false,
      classificationMode: 'exact',
      originalModelClass: '',
      matchedLabels: [],
      rawScore: 0,
      combinedEvidenceScore: 0,
      classificationConfidence: 0,
      speechScore,
      selectionEvidence: 'AudioSet Silence dominant',
      blockedReason: `audioset_silence (${(silenceScore * 100).toFixed(1)}%)`,
    };
  }

  // No usable singing or vocal-musical prediction above noise floor
  if (!bestExact && !bestInferred) {
    const speechDom = speechScore >= 0.2;
    return {
      hasVocalEvidence: false,
      isSilence: false,
      isSpeechWithoutSinging: speechDom,
      isMusicalContext,
      classificationMode: 'exact',
      originalModelClass: '',
      matchedLabels: [],
      rawScore: exactHits[0]?.score ?? inferredHits[0]?.score ?? 0,
      combinedEvidenceScore: 0,
      classificationConfidence: 0,
      speechScore,
      selectionEvidence: speechDom
        ? `Speech-only voice detected (${(speechScore * 100).toFixed(1)}%), distinct from singing`
        : 'No usable singing/vocal AudioSet label in frame',
      blockedReason: speechDom ? 'speech_without_singing' : 'no_vocal_evidence',
    };
  }

  // Speech vs Singing disambiguation guard:
  // Ordinary dialogue / narration over background music often has high Speech (~0.7) and either zero
  // singing score or negligible background singing bleed (<0.08 while Speech >= 2.5x Singing).
  if (speechScore >= 0.25) {
    if (!bestExact) {
      return {
        hasVocalEvidence: false,
        isSilence: false,
        isSpeechWithoutSinging: true,
        isMusicalContext,
        classificationMode: 'inferred',
        originalModelClass: bestInferred?.label || '',
        matchedLabels: usableInferred,
        rawScore: bestInferred?.score ?? 0,
        combinedEvidenceScore: 0,
        classificationConfidence: 0,
        speechScore,
        selectionEvidence: `Speech dominant (${(speechScore * 100).toFixed(1)}%) over non-exact cue "${bestInferred?.label}"`,
        blockedReason: 'speech_dominant_over_inferred_cue',
      };
    }

    if (
      speechScore >= bestExact.score * 2.5 &&
      bestExact.score < 0.08 &&
      !isContinuedVocals
    ) {
      return {
        hasVocalEvidence: false,
        isSilence: false,
        isSpeechWithoutSinging: true,
        isMusicalContext,
        classificationMode: 'exact',
        originalModelClass: bestExact.label,
        matchedLabels: usableExact,
        rawScore: bestExact.score,
        combinedEvidenceScore: 0,
        classificationConfidence: 0,
        speechScore,
        selectionEvidence: `Speech dominant (${(speechScore * 100).toFixed(1)}%) over incidental vocal trace (${(bestExact.score * 100).toFixed(1)}%)`,
        blockedReason: 'speech_dominant_over_vocal_trace',
      };
    }
  }

  // Build unified Vocals decision merging all active singing hits (e.g., Singing + Choir)
  const matchedLabels = [...usableExact, ...usableInferred];
  const primary = bestExact || bestInferred!;
  const classificationMode: 'exact' | 'inferred' = bestExact ? 'exact' : 'inferred';

  // Co-occurring vocal categories (e.g. lead Singing + backing Choir + Vocal music) reinforce confidence cleanly
  const secondaryBoost = matchedLabels
    .slice(1, 4)
    .reduce((sum, item) => sum + item.score * 0.3, 0);
  const rappingSynergy = bestExact && rappingScore >= 0.2 ? rappingScore * 0.15 : 0;

  // Mild acoustic energy sanity guard: if pure deep sub-bass (>85% energy <250Hz) and tiny singing trace (<0.03), skip cold start
  if (
    acousticFeatures &&
    acousticFeatures.rms > 0.002 &&
    acousticFeatures.lowBandRatio > 0.88 &&
    primary.score < 0.03 &&
    !isContinuedVocals
  ) {
    return {
      hasVocalEvidence: false,
      isSilence: false,
      isSpeechWithoutSinging: false,
      isMusicalContext,
      classificationMode,
      originalModelClass: primary.label,
      matchedLabels,
      rawScore: primary.score,
      combinedEvidenceScore: 0,
      classificationConfidence: 0,
      speechScore,
      selectionEvidence: 'Pure sub-bass spectrum inconsistent with cold singing trace',
      blockedReason: 'sub_bass_spectrum_mismatch',
    };
  }

  const combinedEvidenceScore = Math.min(0.99, primary.score + secondaryBoost + rappingSynergy);
  const rawPct = Math.round(primary.score * 1000) / 10;

  const classificationConfidence =
    classificationMode === 'exact'
      ? Math.round(Math.max(1, Math.min(99, combinedEvidenceScore * 100)))
      : Math.round(Math.max(1, Math.min(74, combinedEvidenceScore * 78)));

  const topLabelsDesc = matchedLabels
    .slice(0, 3)
    .map((m) => `${m.label} (${(m.score * 100).toFixed(1)}%)`)
    .join(' + ');

  return {
    hasVocalEvidence: true,
    isSilence: false,
    isSpeechWithoutSinging: false,
    isMusicalContext,
    classificationMode,
    originalModelClass: matchedLabels.slice(0, 3).map((m) => m.label).join(', '),
    matchedLabels,
    rawScore: primary.score,
    combinedEvidenceScore,
    classificationConfidence,
    speechScore,
    selectionEvidence: `Independent AudioSet vocal detection [${topLabelsDesc}] (raw peak ${rawPct.toFixed(1)}%)`,
    blockedReason: null,
  };
}

