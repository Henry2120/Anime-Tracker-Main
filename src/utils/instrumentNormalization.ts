/**
 * Safe, centralized instrument taxonomy, normalization, and alias mapping.
 * Covers all standard acoustic, orchestral, traditional, world, electronic, and vocal instruments.
 */

export type InstrumentFamily =
  | 'Strings'
  | 'Woodwinds'
  | 'Brass'
  | 'Keyboards'
  | 'Percussion'
  | 'Traditional & World'
  | 'Voice & Electronic'
  | 'Other';

export interface CanonicalInstrument {
  id: string;
  canonicalName: string;
  family: InstrumentFamily;
  aliases: string[];
  description: string;
}

export interface InstrumentTimelineSegment {
  id: string;
  instrumentName: string;
  family: InstrumentFamily;
  startTime: number; // in seconds
  endTime: number; // in seconds
  confidence: number; // 0..1 or 0..100
  audibility: 'audible' | 'suspected' | 'uncertain';
  evidence?: string;
}

export interface NormalizedDetectedInstrument {
  rawName: string;
  normalizedName: string;
  family: InstrumentFamily;
  confidence: number; // 0..100
  role?: string;
  description?: string;
  evidence?: string;
}

/**
 * Master catalog of canonical musical instruments grouped by family.
 */
export const MASTER_INSTRUMENT_CATALOG: CanonicalInstrument[] = [
  // =========================================================================
  // 1. STRINGS
  // =========================================================================
  {
    id: 'violin',
    canonicalName: 'Violin',
    family: 'Strings',
    aliases: ['violin', 'fiddle', 'violins', 'electric violin', 'first violin', 'second violin'],
    description: 'Bowed high-register orchestral string with expressive vibrato and brilliance',
  },
  {
    id: 'viola',
    canonicalName: 'Viola',
    family: 'Strings',
    aliases: ['viola', 'violas'],
    description: 'Warm, mellow alto-register bowed orchestral string',
  },
  {
    id: 'cello',
    canonicalName: 'Cello',
    family: 'Strings',
    aliases: ['cello', 'cellos', 'violoncello'],
    description: 'Deep, resonant tenor/bass bowed string with rich cantabile tone',
  },
  {
    id: 'double-bass',
    canonicalName: 'Double Bass',
    family: 'Strings',
    aliases: ['double bass', 'contrabass', 'upright bass', 'standup bass', 'string bass', 'acoustic bass'],
    description: 'Lowest and largest bowed or plucked orchestral string',
  },
  {
    id: 'harp',
    canonicalName: 'Harp',
    family: 'Strings',
    aliases: ['harp', 'harps', 'pedal harp', 'celtic harp', 'concert harp'],
    description: 'Multi-string plucked acoustic orchestral harp with sweeping glissandi',
  },
  {
    id: 'classical-guitar',
    canonicalName: 'Classical Guitar',
    family: 'Strings',
    aliases: ['classical guitar', 'nylon guitar', 'spanish guitar', 'flamenco guitar'],
    description: 'Nylon-string acoustic guitar with soft, mellow fingerpicked tone',
  },
  {
    id: 'acoustic-guitar',
    canonicalName: 'Acoustic Guitar',
    family: 'Strings',
    aliases: ['acoustic guitar', 'steel-string guitar', 'folk guitar', 'dreadnought'],
    description: 'Steel-string plucked acoustic guitar with bright resonance and strumming',
  },
  {
    id: 'electric-guitar',
    canonicalName: 'Electric Guitar',
    family: 'Strings',
    aliases: ['electric guitar', 'lead guitar', 'rhythm guitar', 'clean guitar', 'distorted guitar', 'overdrive guitar'],
    description: 'Solid-body electric guitar with electromagnetic pickups and amplification',
  },
  {
    id: 'bass-guitar',
    canonicalName: 'Bass Guitar',
    family: 'Strings',
    aliases: ['bass guitar', 'electric bass', 'bass', 'slap bass', 'fretless bass', '4-string bass'],
    description: 'Electric bass guitar providing low-frequency rhythmic and harmonic foundation',
  },
  {
    id: 'banjo',
    canonicalName: 'Banjo',
    family: 'Strings',
    aliases: ['banjo', '5-string banjo', 'tenor banjo'],
    description: 'Plucked string instrument with a circular membrane drum resonator',
  },
  {
    id: 'mandolin',
    canonicalName: 'Mandolin',
    family: 'Strings',
    aliases: ['mandolin', 'mandolins', 'flat-top mandolin', 'bluegrass mandolin'],
    description: 'High-pitched paired-course plucked lute with rapid tremolo picking',
  },
  {
    id: 'ukulele',
    canonicalName: 'Ukulele',
    family: 'Strings',
    aliases: ['ukulele', 'uke', 'soprano ukulele', 'concert ukulele', 'tenor ukulele'],
    description: 'Small four-string plucked Hawaiian lute with cheerful, light timbre',
  },

  // =========================================================================
  // 2. WOODWINDS
  // =========================================================================
  {
    id: 'flute',
    canonicalName: 'Flute',
    family: 'Woodwinds',
    aliases: ['flute', 'concert flute', 'silver flute', 'transverse flute'],
    description: 'Side-blown edge-tone woodwind with bright, agile, airy acoustics',
  },
  {
    id: 'piccolo',
    canonicalName: 'Piccolo',
    family: 'Woodwinds',
    aliases: ['piccolo', 'ottavino'],
    description: 'Half-size flute pitched an octave higher with penetrating high register',
  },
  {
    id: 'recorder',
    canonicalName: 'Recorder',
    family: 'Woodwinds',
    aliases: ['recorder', 'blockflote', 'soprano recorder', 'alto recorder'],
    description: 'Internal duct flute with clear, whistle-like breathy harmonics',
  },
  {
    id: 'clarinet',
    canonicalName: 'Clarinet',
    family: 'Woodwinds',
    aliases: ['clarinet', 'bb clarinet', 'soprano clarinet'],
    description: 'Single-reed cylindrical woodwind with wide dynamic range and warm tone',
  },
  {
    id: 'bass-clarinet',
    canonicalName: 'Bass Clarinet',
    family: 'Woodwinds',
    aliases: ['bass clarinet'],
    description: 'Low-pitched single-reed woodwind with deep, woody resonance',
  },
  {
    id: 'oboe',
    canonicalName: 'Oboe',
    family: 'Woodwinds',
    aliases: ['oboe', 'oboes', 'hautbois'],
    description: 'Double-reed conical woodwind with piercing, expressive, plaintive tone',
  },
  {
    id: 'english-horn',
    canonicalName: 'English Horn',
    family: 'Woodwinds',
    aliases: ['english horn', 'cor anglais'],
    description: 'Tenor oboe with bulb-shaped bell and melancholic timbre',
  },
  {
    id: 'bassoon',
    canonicalName: 'Bassoon',
    family: 'Woodwinds',
    aliases: ['bassoon', 'bassoons', 'fagotto'],
    description: 'Deep double-reed low orchestral woodwind with dry, staccato articulation',
  },
  {
    id: 'contrabassoon',
    canonicalName: 'Contrabassoon',
    family: 'Woodwinds',
    aliases: ['contrabassoon', 'double bassoon', 'contrafagotto'],
    description: 'Lowest orchestral woodwind playing an octave below the bassoon',
  },
  {
    id: 'saxophone',
    canonicalName: 'Saxophone',
    family: 'Woodwinds',
    aliases: ['saxophone', 'sax', 'alto sax', 'tenor sax', 'baritone sax', 'soprano sax', 'alto saxophone', 'tenor saxophone'],
    description: 'Single-reed conical brass-bodied woodwind with soulful, reedy dynamics',
  },

  // =========================================================================
  // 3. BRASS
  // =========================================================================
  {
    id: 'trumpet',
    canonicalName: 'Trumpet',
    family: 'Brass',
    aliases: ['trumpet', 'trumpets', 'bb trumpet', 'piccolo trumpet'],
    description: 'Highest brass instrument with brilliant, piercing, heroic fanfare voice',
  },
  {
    id: 'cornet',
    canonicalName: 'Cornet',
    family: 'Brass',
    aliases: ['cornet', 'cornets'],
    description: 'Conical-bore brass instrument similar to trumpet but rounder and mellower',
  },
  {
    id: 'flugelhorn',
    canonicalName: 'Flugelhorn',
    family: 'Brass',
    aliases: ['flugelhorn', 'fluegelhorn'],
    description: 'Conical brass instrument with dark, velvety, lyrical jazz/brass tone',
  },
  {
    id: 'french-horn',
    canonicalName: 'French Horn',
    family: 'Brass',
    aliases: ['french horn', 'horn', 'horns', 'waldhorn'],
    description: 'Coiled brass instrument with wide bell and noble, cinematic, warm resonance',
  },
  {
    id: 'trombone',
    canonicalName: 'Trombone',
    family: 'Brass',
    aliases: ['trombone', 'tenor trombone', 'trombones'],
    description: 'Slide-operated brass instrument with rich mid-low brass projection and glissandi',
  },
  {
    id: 'bass-trombone',
    canonicalName: 'Bass Trombone',
    family: 'Brass',
    aliases: ['bass trombone'],
    description: 'Larger-bore trombone with extra valves for powerful sub-bass brass punches',
  },
  {
    id: 'euphonium',
    canonicalName: 'Euphonium',
    family: 'Brass',
    aliases: ['euphonium', 'baritone horn'],
    description: 'Tenor-register conical brass horn with rich, singing cantabile timbre',
  },
  {
    id: 'tuba',
    canonicalName: 'Tuba',
    family: 'Brass',
    aliases: ['tuba', 'tubas', 'bass tuba', 'contrabass tuba', 'sousaphone'],
    description: 'Deepest and largest orchestral brass instrument anchoring the bass section',
  },

  // =========================================================================
  // 4. KEYBOARDS
  // =========================================================================
  {
    id: 'piano',
    canonicalName: 'Piano',
    family: 'Keyboards',
    aliases: ['piano', 'pianoforte', 'upright piano', 'acoustic piano'],
    description: 'Acoustic keyboard instrument with hammers striking steel strings',
  },
  {
    id: 'grand-piano',
    canonicalName: 'Grand Piano',
    family: 'Keyboards',
    aliases: ['grand piano', 'concert grand', 'baby grand', 'steinway'],
    description: 'Horizontal grand acoustic piano with expansive dynamic range and sustain',
  },
  {
    id: 'electric-piano',
    canonicalName: 'Electric Piano',
    family: 'Keyboards',
    aliases: ['electric piano', 'rhodes', 'wurlitzer', 'epiano', 'fender rhodes', 'clavinova'],
    description: 'Electromechanical keyboard with metallic tines, bell-like chimes, and vibrato',
  },
  {
    id: 'organ',
    canonicalName: 'Organ',
    family: 'Keyboards',
    aliases: ['organ', 'hammond', 'hammond organ', 'electronic organ', 'b3 organ'],
    description: 'Keyboard instrument producing continuous sustained tones via tonewheels or electronics',
  },
  {
    id: 'pipe-organ',
    canonicalName: 'Pipe Organ',
    family: 'Keyboards',
    aliases: ['pipe organ', 'cathedral organ', 'church organ'],
    description: 'Monumental acoustic pipe organ driven by pressurized air columns',
  },
  {
    id: 'harpsichord',
    canonicalName: 'Harpsichord',
    family: 'Keyboards',
    aliases: ['harpsichord', 'cembalo', 'clavecin', 'virginal'],
    description: 'Baroque keyboard where strings are plucked by plectra with bright, crisp attack',
  },
  {
    id: 'synthesizer',
    canonicalName: 'Synthesizer',
    family: 'Keyboards',
    aliases: ['synthesizer', 'synth', 'keyboards', 'digital synth', 'analog synth', 'moog', 'synth lead', 'synth keys'],
    description: 'Electronic sound synthesizer generating analog or digital audio waveforms',
  },
  {
    id: 'accordion',
    canonicalName: 'Accordion',
    family: 'Keyboards',
    aliases: ['accordion', 'bellows', 'squeezebox', 'concertina', 'bandoneon'],
    description: 'Free-reed keyboard instrument operated by hand-pumped bellows',
  },

  // =========================================================================
  // 5. PERCUSSION
  // =========================================================================
  {
    id: 'drum-kit',
    canonicalName: 'Drum Kit',
    family: 'Percussion',
    aliases: ['drum kit', 'drums', 'drumkit', 'acoustic drums', 'rock drums', 'trap set'],
    description: 'Combined kit of kick drum, snare drum, toms, hi-hat, and cymbals',
  },
  {
    id: 'snare-drum',
    canonicalName: 'Snare Drum',
    family: 'Percussion',
    aliases: ['snare', 'snare drum', 'side drum'],
    description: 'Crisp percussive drum with wire snares stretched across the bottom head',
  },
  {
    id: 'bass-drum',
    canonicalName: 'Bass Drum',
    family: 'Percussion',
    aliases: ['bass drum', 'kick drum', 'kick', 'gran cassa'],
    description: 'Large cylindrical drum producing a deep, punchy low-frequency thump',
  },
  {
    id: 'toms',
    canonicalName: 'Toms',
    family: 'Percussion',
    aliases: ['toms', 'tom-toms', 'floor tom', 'rack tom'],
    description: 'Cylindrical tuned drums without snares used for fills and rhythmic rolls',
  },
  {
    id: 'cymbals',
    canonicalName: 'Cymbals',
    family: 'Percussion',
    aliases: ['cymbals', 'crash cymbal', 'ride cymbal', 'splash cymbal', 'china cymbal'],
    description: 'Convex bronze alloy plates producing explosive or shimmering metallic wash',
  },
  {
    id: 'hi-hat',
    canonicalName: 'Hi-Hat',
    family: 'Percussion',
    aliases: ['hi-hat', 'hi hat', 'hihat', 'hats'],
    description: 'Pair of cymbals mounted on a pedal stand providing continuous rhythmic pulse',
  },
  {
    id: 'tambourine',
    canonicalName: 'Tambourine',
    family: 'Percussion',
    aliases: ['tambourine', 'jingles'],
    description: 'Hand drum with pairs of metal jingles that clatter when shaken or struck',
  },
  {
    id: 'triangle',
    canonicalName: 'Triangle',
    family: 'Percussion',
    aliases: ['triangle'],
    description: 'Steel rod bent into a triangle producing clear, shimmering, bell-like overtones',
  },
  {
    id: 'timpani',
    canonicalName: 'Timpani',
    family: 'Percussion',
    aliases: ['timpani', 'kettledrums', 'timp'],
    description: 'Large copper kettledrums with foot pedals providing tuned orchestral thunder',
  },
  {
    id: 'xylophone',
    canonicalName: 'Xylophone',
    family: 'Percussion',
    aliases: ['xylophone'],
    description: 'Tuned wooden bars struck with hard mallets producing dry, bright, woody pitch',
  },
  {
    id: 'marimba',
    canonicalName: 'Marimba',
    family: 'Percussion',
    aliases: ['marimba'],
    description: 'Tuned rosewood bars over resonator pipes producing warm, mellow acoustic resonance',
  },
  {
    id: 'vibraphone',
    canonicalName: 'Vibraphone',
    family: 'Percussion',
    aliases: ['vibraphone', 'vibes'],
    description: 'Tuned metal bars with motor-driven rotating vanes creating pulsating tremolo',
  },
  {
    id: 'glockenspiel',
    canonicalName: 'Glockenspiel',
    family: 'Percussion',
    aliases: ['glockenspiel', 'bells', 'orchestral bells'],
    description: 'Tuned steel plates struck with hard mallets producing high crystalline chimes',
  },

  // =========================================================================
  // 6. TRADITIONAL AND WORLD INSTRUMENTS
  // =========================================================================
  {
    id: 'shamisen',
    canonicalName: 'Shamisen',
    family: 'Traditional & World',
    aliases: ['shamisen', 'sangen', 'tsugaru shamisen'],
    description: 'Traditional Japanese three-stringed plucked lute played with a large bachi plectrum',
  },
  {
    id: 'koto',
    canonicalName: 'Koto',
    family: 'Traditional & World',
    aliases: ['koto', 'japanese koto', '13-string koto'],
    description: 'Traditional Japanese 13-string zither with movable bridges and delicate plucking',
  },
  {
    id: 'erhu',
    canonicalName: 'Erhu',
    family: 'Traditional & World',
    aliases: ['erhu', 'chinese violin', 'nanhu'],
    description: 'Two-stringed bowed Chinese musical instrument with expressive vocal-like timbre',
  },
  {
    id: 'pipa',
    canonicalName: 'Pipa',
    family: 'Traditional & World',
    aliases: ['pipa', 'chinese lute'],
    description: 'Four-stringed plucked Chinese lute with pear-shaped wooden body and rapid roll picking',
  },
  {
    id: 'guzheng',
    canonicalName: 'Guzheng',
    family: 'Traditional & World',
    aliases: ['guzheng', 'zheng', 'chinese zither'],
    description: 'Traditional Chinese plucked zither with 21 strings and expansive pitch bends',
  },
  {
    id: 'shakuhachi',
    canonicalName: 'Shakuhachi',
    family: 'Traditional & World',
    aliases: ['shakuhachi', 'bamboo flute'],
    description: 'Traditional Japanese end-blown bamboo flute known for breathy, meditative tones',
  },
  {
    id: 'sitar',
    canonicalName: 'Sitar',
    family: 'Traditional & World',
    aliases: ['sitar'],
    description: 'Plucked Indian stringed instrument with sympathetic strings and microtonal bends',
  },
  {
    id: 'tabla',
    canonicalName: 'Tabla',
    family: 'Traditional & World',
    aliases: ['tabla', 'dayan', 'bayan'],
    description: 'Pair of hand drums from the Indian subcontinent producing distinctive tonal modulations',
  },
  {
    id: 'steelpan',
    canonicalName: 'Steelpan',
    family: 'Traditional & World',
    aliases: ['steelpan', 'steel drum', 'pan'],
    description: 'Trinidadian acoustic percussion instrument made from 55-gallon industrial oil drums',
  },

  // =========================================================================
  // 7. VOICE AND ELECTRONIC SOUNDS
  // =========================================================================
  {
    id: 'lead-vocals',
    canonicalName: 'Lead Vocals',
    family: 'Voice & Electronic',
    aliases: ['lead vocals', 'vocals', 'vocal', 'voice', 'singing', 'male vocals', 'female vocals'],
    description: 'Primary human singing voice carrying the melody and lyrics',
  },
  {
    id: 'backing-vocals',
    canonicalName: 'Backing Vocals',
    family: 'Voice & Electronic',
    aliases: ['backing vocals', 'backup vocals', 'harmony vocals', 'background vocals', 'harmonies'],
    description: 'Harmonizing vocal layers supporting the lead singer',
  },
  {
    id: 'choir',
    canonicalName: 'Choir',
    family: 'Voice & Electronic',
    aliases: ['choir', 'chorus', 'vocal ensemble', 'choral'],
    description: 'Large ensemble of singers producing lush multi-part choral harmonies',
  },
  {
    id: 'electronic-bass',
    canonicalName: 'Electronic Bass',
    family: 'Voice & Electronic',
    aliases: ['electronic bass', 'synth bass', 'sub-bass', '808', '808 bass', 'reese bass', 'acid bass'],
    description: 'Synthesized deep low-frequency bass waveforms, sub-bass, or 808 glide notes',
  },
  {
    id: 'synth-pads',
    canonicalName: 'Synth Pads',
    family: 'Voice & Electronic',
    aliases: ['pads', 'synth pad', 'ambient pad', 'string pad', 'warm pad'],
    description: 'Sustained electronic ambient chords and atmospheric harmonic textures',
  },
  {
    id: 'arpeggiator',
    canonicalName: 'Arpeggiator',
    family: 'Voice & Electronic',
    aliases: ['arpeggiator', 'synth arp', 'sequenced synth', 'synth plucks'],
    description: 'Rapid rhythmic step-sequenced electronic note patterns and cycling motifs',
  },
];

/**
 * Fast lookup map for normalizing arbitrary strings to canonical metadata.
 */
const ALIAS_LOOKUP_MAP = new Map<string, CanonicalInstrument>();

// Initialize lookup map
MASTER_INSTRUMENT_CATALOG.forEach((item) => {
  ALIAS_LOOKUP_MAP.set(item.canonicalName.toLowerCase(), item);
  item.aliases.forEach((alias) => {
    ALIAS_LOOKUP_MAP.set(alias.toLowerCase(), item);
  });
});

/**
 * Safely extracts a raw string name from unknown data.
 */
export function extractRawInstrumentName(item: unknown): string | null {
  if (item === null || item === undefined) return null;

  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed === '[object Object]') return null;
    return trimmed;
  }

  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const candidateFields = ['name', 'instrument', 'instrumentName', 'label', 'id', 'title'];
    for (const key of candidateFields) {
      const val = obj[key];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.length > 0 && trimmed !== '[object Object]') {
          return trimmed;
        }
      }
    }
  }

  return null;
}

/**
 * Normalizes any instrument string or object into a canonical instrument name and family.
 */
export function normalizeInstrument(input: unknown): {
  canonicalName: string;
  family: InstrumentFamily;
  id: string;
} {
  const raw = extractRawInstrumentName(input);
  if (!raw) {
    return {
      canonicalName: 'Unknown Instrument',
      family: 'Other',
      id: 'unknown',
    };
  }

  const lower = raw.toLowerCase().trim();

  // 1. Direct match in alias map
  if (ALIAS_LOOKUP_MAP.has(lower)) {
    const found = ALIAS_LOOKUP_MAP.get(lower)!;
    return {
      canonicalName: found.canonicalName,
      family: found.family,
      id: found.id,
    };
  }

  // 2. Partial match against aliases
  for (const [alias, item] of ALIAS_LOOKUP_MAP.entries()) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return {
        canonicalName: item.canonicalName,
        family: item.family,
        id: item.id,
      };
    }
  }

  // 3. Fallback: capitalize raw name
  const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1);
  return {
    canonicalName: capitalized,
    family: 'Other',
    id: lower.replace(/[^a-z0-9]+/g, '-'),
  };
}

/**
 * Resolves full instrument metadata for catalog views and timelines.
 */
export function resolveInstrumentMetadata(item: unknown): NormalizedDetectedInstrument | null {
  const raw = extractRawInstrumentName(item);
  if (!raw) return null;

  const normalized = normalizeInstrument(item);
  let confidence = 85;
  let role: string | undefined;
  let description: string | undefined;
  let evidence: string | undefined;

  if (typeof item === 'object' && item !== null) {
    const obj = item as any;
    if (typeof obj.confidence === 'number') {
      confidence = obj.confidence <= 1 ? Math.round(obj.confidence * 100) : Math.min(100, Math.round(obj.confidence));
    }
    role = typeof obj.role === 'string' ? obj.role : undefined;
    description = typeof obj.description === 'string' ? obj.description : undefined;
    evidence = typeof obj.evidence === 'string' ? obj.evidence : obj.notes;
  }

  return {
    rawName: raw,
    normalizedName: normalized.canonicalName,
    family: normalized.family,
    confidence,
    role,
    description,
    evidence,
  };
}

/**
 * Parses and validates an array of timeline segments from the backend.
 */
export function parseTimelineSegments(rawSegments: unknown): InstrumentTimelineSegment[] {
  if (!Array.isArray(rawSegments)) return [];

  const segments: InstrumentTimelineSegment[] = [];

  rawSegments.forEach((seg, index) => {
    if (typeof seg !== 'object' || seg === null) return;

    const rawName = extractRawInstrumentName(seg);
    if (!rawName) return;

    const normalized = normalizeInstrument(rawName);
    const startTime = typeof seg.startTime === 'number' && !isNaN(seg.startTime) ? Math.max(0, seg.startTime) : 0;
    const endTime = typeof seg.endTime === 'number' && !isNaN(seg.endTime) ? Math.max(startTime, seg.endTime) : startTime + 10;
    const rawConf = typeof seg.confidence === 'number' && !isNaN(seg.confidence) ? seg.confidence : 0.85;
    const confidence = rawConf <= 1 ? Math.round(rawConf * 100) : Math.min(100, Math.round(rawConf));
    const audibility = seg.audibility === 'suspected' || seg.audibility === 'uncertain' ? seg.audibility : 'audible';
    const evidence = typeof seg.evidence === 'string' ? seg.evidence.trim() : undefined;

    segments.push({
      id: `seg-${index}-${normalized.id}-${Math.round(startTime)}`,
      instrumentName: normalized.canonicalName,
      family: normalized.family,
      startTime,
      endTime,
      confidence,
      audibility,
      evidence,
    });
  });

  return segments.sort((a, b) => a.startTime - b.startTime);
}
