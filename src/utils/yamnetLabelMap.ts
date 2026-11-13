import { InstrumentFamily } from './instrumentNormalization';

export interface YamnetMappedInstrument {
  canonicalName: string;
  family: InstrumentFamily;
  id: string;
  isVoice: boolean;
  isBroaderClass: boolean;
  originalModelClass: string;
}

/**
 * Exact mapping from YAMNet's real AudioSet labels (verified in public/yamnet/yamnet.tflite
 * yamnet_label_list.txt) to AniVerse instrument/vocal classes.
 *
 * Strictly grounded in actual AudioSet classes:
 * - Unsupported instruments (such as Erhu or Handpan) are NOT fabricated.
 * - Broader AudioSet classes (e.g. "Bowed string instrument", "Brass instrument",
 *   "Wind instrument, woodwind instrument", "Guitar", "Keyboard (musical)")
 *   preserve the distinction from exact solo instruments while retaining originalModelClass.
 * - Generic non-instrument classes ("Music", "Pop music", "Speech", etc.) are NOT mapped
 *   as instruments so they never create false instrument highlights.
 */
const AUDIOSET_TO_ANIVERSE_MAP: Record<
  string,
  Omit<YamnetMappedInstrument, 'originalModelClass'>
> = {
  // Strings — Exact bowed & plucked
  'Violin, fiddle': {
    id: 'violin',
    canonicalName: 'Violin',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  Cello: {
    id: 'cello',
    canonicalName: 'Cello',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  'Double bass': {
    id: 'double-bass',
    canonicalName: 'Double Bass',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  'Bowed string instrument': {
    id: 'unresolved-string-section',
    canonicalName: 'Unresolved String Section',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: true,
  },
  Harp: {
    id: 'harp',
    canonicalName: 'Harp',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  'Acoustic guitar': {
    id: 'acoustic-guitar',
    canonicalName: 'Acoustic Guitar',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  'Electric guitar': {
    id: 'electric-guitar',
    canonicalName: 'Electric Guitar',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  'Steel guitar, slide guitar': {
    id: 'electric-guitar',
    canonicalName: 'Electric Guitar',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: true,
  },
  'Tapping (guitar technique)': {
    id: 'electric-guitar',
    canonicalName: 'Electric Guitar',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: true,
  },
  'Bass guitar': {
    id: 'bass-guitar',
    canonicalName: 'Bass Guitar',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  Guitar: {
    id: 'guitar-general',
    canonicalName: 'Guitar (AudioSet)',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: true,
  },
  'Plucked string instrument': {
    id: 'plucked-strings-general',
    canonicalName: 'Plucked Strings (AudioSet)',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: true,
  },
  Banjo: {
    id: 'banjo',
    canonicalName: 'Banjo',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  Mandolin: {
    id: 'mandolin',
    canonicalName: 'Mandolin',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },
  Ukulele: {
    id: 'ukulele',
    canonicalName: 'Ukulele',
    family: 'Strings',
    isVoice: false,
    isBroaderClass: false,
  },

  // Keyboards
  Piano: {
    id: 'piano',
    canonicalName: 'Piano',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  'Electric piano': {
    id: 'electric-piano',
    canonicalName: 'Electric Piano',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  Organ: {
    id: 'organ',
    canonicalName: 'Organ',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  'Electronic organ': {
    id: 'organ',
    canonicalName: 'Organ',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: true,
  },
  'Hammond organ': {
    id: 'organ',
    canonicalName: 'Organ',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  Synthesizer: {
    id: 'synthesizer',
    canonicalName: 'Synthesizer',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  Harpsichord: {
    id: 'harpsichord',
    canonicalName: 'Harpsichord',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  Accordion: {
    id: 'accordion',
    canonicalName: 'Accordion',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: false,
  },
  'Keyboard (musical)': {
    id: 'keyboard-general',
    canonicalName: 'Keyboard (AudioSet)',
    family: 'Keyboards',
    isVoice: false,
    isBroaderClass: true,
  },

  // Woodwinds
  Flute: {
    id: 'flute',
    canonicalName: 'Flute',
    family: 'Woodwinds',
    isVoice: false,
    isBroaderClass: false,
  },
  Saxophone: {
    id: 'saxophone',
    canonicalName: 'Saxophone',
    family: 'Woodwinds',
    isVoice: false,
    isBroaderClass: false,
  },
  Clarinet: {
    id: 'clarinet',
    canonicalName: 'Clarinet',
    family: 'Woodwinds',
    isVoice: false,
    isBroaderClass: false,
  },
  Harmonica: {
    id: 'harmonica',
    canonicalName: 'Harmonica',
    family: 'Woodwinds',
    isVoice: false,
    isBroaderClass: false,
  },
  Bagpipes: {
    id: 'bagpipes',
    canonicalName: 'Bagpipes',
    family: 'Woodwinds',
    isVoice: false,
    isBroaderClass: false,
  },
  'Wind instrument, woodwind instrument': {
    id: 'unresolved-woodwind-section',
    canonicalName: 'Unresolved Woodwind Section',
    family: 'Woodwinds',
    isVoice: false,
    isBroaderClass: true,
  },

  // Brass
  Trumpet: {
    id: 'trumpet',
    canonicalName: 'Trumpet',
    family: 'Brass',
    isVoice: false,
    isBroaderClass: false,
  },
  'French horn': {
    id: 'french-horn',
    canonicalName: 'French Horn',
    family: 'Brass',
    isVoice: false,
    isBroaderClass: false,
  },
  Trombone: {
    id: 'trombone',
    canonicalName: 'Trombone',
    family: 'Brass',
    isVoice: false,
    isBroaderClass: false,
  },
  'Brass instrument': {
    id: 'unresolved-brass-section',
    canonicalName: 'Unresolved Brass Section',
    family: 'Brass',
    isVoice: false,
    isBroaderClass: true,
  },

  // Percussion
  'Drum kit': {
    id: 'drum-kit',
    canonicalName: 'Drum Kit',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  'Drum machine': {
    id: 'drum-machine',
    canonicalName: 'Drum Machine',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  Drum: {
    id: 'drum-kit',
    canonicalName: 'Drum Kit',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: true,
  },
  'Drum roll': {
    id: 'snare-drum',
    canonicalName: 'Snare Drum',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: true,
  },
  'Snare drum': {
    id: 'snare-drum',
    canonicalName: 'Snare Drum',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  'Bass drum': {
    id: 'bass-drum',
    canonicalName: 'Bass Drum',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  Timpani: {
    id: 'timpani',
    canonicalName: 'Timpani',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  Cymbal: {
    id: 'cymbals',
    canonicalName: 'Cymbals',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  Tambourine: {
    id: 'tambourine',
    canonicalName: 'Tambourine',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  'Marimba, xylophone': {
    id: 'marimba',
    canonicalName: 'Marimba',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: true,
  },
  Vibraphone: {
    id: 'vibraphone',
    canonicalName: 'Vibraphone',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: false,
  },
  Gong: {
    id: 'orchestral-percussion',
    canonicalName: 'Orchestral Percussion',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: true,
  },
  'Tubular bells': {
    id: 'orchestral-percussion',
    canonicalName: 'Orchestral Percussion',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: true,
  },
  Cowbell: {
    id: 'percussion-cowbell',
    canonicalName: 'Orchestral Percussion',
    family: 'Percussion',
    isVoice: false,
    isBroaderClass: true,
  },

  // Traditional & World (only classes genuinely in AudioSet)
  Sitar: {
    id: 'sitar',
    canonicalName: 'Sitar',
    family: 'Traditional & World',
    isVoice: false,
    isBroaderClass: false,
  },
  Tabla: {
    id: 'tabla',
    canonicalName: 'Tabla',
    family: 'Traditional & World',
    isVoice: false,
    isBroaderClass: false,
  },
  'Singing bowl': {
    id: 'singing-bowl',
    canonicalName: 'Singing Bowl (AudioSet)',
    family: 'Traditional & World',
    isVoice: false,
    isBroaderClass: false,
  },

  // Voice (Musical singing / Choir)
  Singing: {
    id: 'unclassified-voice',
    canonicalName: 'Unclassified Voice',
    family: 'Voice & Electronic',
    isVoice: true,
    isBroaderClass: true,
  },
  'Child singing': {
    id: 'unclassified-voice',
    canonicalName: 'Unclassified Voice',
    family: 'Voice & Electronic',
    isVoice: true,
    isBroaderClass: true,
  },
  Choir: {
    id: 'mixed-choir',
    canonicalName: 'Mixed Choir',
    family: 'Voice & Electronic',
    isVoice: true,
    isBroaderClass: true,
  },
  'Synthetic singing': {
    id: 'unclassified-voice',
    canonicalName: 'Unclassified Voice',
    family: 'Voice & Electronic',
    isVoice: true,
    isBroaderClass: true,
  },

  // Broad orchestral fallback
  Orchestra: {
    id: 'unidentified-instrument',
    canonicalName: 'Orchestra (AudioSet)',
    family: 'Other',
    isVoice: false,
    isBroaderClass: true,
  },
};

/**
 * Case-insensitive lookup index built from AUDIOSET_TO_ANIVERSE_MAP.
 */
const LOWER_MAP = new Map<string, { label: string; entry: Omit<YamnetMappedInstrument, 'originalModelClass'> }>();
Object.entries(AUDIOSET_TO_ANIVERSE_MAP).forEach(([label, entry]) => {
  LOWER_MAP.set(label.toLowerCase(), { label, entry });
});

/**
 * Maps a raw AudioSet category label emitted by YAMNet into an AniVerse instrument/voice mapping,
 * or returns null if the AudioSet class is not an instrument/musical vocal class (e.g. genre tag, noise, speech).
 */
export function mapAudioSetLabelToInstrument(
  categoryName: string,
  displayName?: string
): YamnetMappedInstrument | null {
  const candidates = [categoryName, displayName].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  );

  for (const raw of candidates) {
    const clean = raw.trim();
    const match = LOWER_MAP.get(clean.toLowerCase());
    if (match) {
      return {
        ...match.entry,
        originalModelClass: clean,
      };
    }
  }

  return null;
}

/**
 * Returns true if the AudioSet label is a non-instrument speech / silence label.
 */
export function isAudioSetSilenceOrSpeech(categoryName: string): 'silence' | 'speech' | null {
  const lower = (categoryName || '').trim().toLowerCase();
  if (lower === 'silence') return 'silence';
  if (
    lower === 'speech' ||
    lower === 'child speech, kid speaking' ||
    lower === 'narration, monologue' ||
    lower === 'conversation'
  ) {
    return 'speech';
  }
  return null;
}
