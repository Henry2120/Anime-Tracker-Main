/**
 * Safe, centralized instrument name extraction, normalization, and alias mapping.
 * Prevents "instName.toLowerCase is not a function" crashes and validates all incoming data shapes.
 */

export interface NormalizedDetectedInstrument {
  rawName: string;
  normalizedName: string;
  categoryId: string;
  categoryName: string;
  confidence: number; // 0..100
  role?: string;
  notes?: string;
  source: 'gemini_audio' | 'track_metadata' | 'catalog' | 'oembed';
  evidence?: string;
}

/**
 * Standard alias mapping for musical instruments.
 * Maps synonyms/variants to canonical names while preserving distinct instruments.
 */
const INSTRUMENT_ALIAS_MAP: Record<string, { canonical: string; categoryId: string; categoryName: string }> = {
  // Keys
  piano: { canonical: 'Piano', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },
  'grand piano': { canonical: 'Grand Piano', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },
  'electric piano': { canonical: 'Electric Piano', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },
  'upright piano': { canonical: 'Upright Piano', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },
  keyboard: { canonical: 'Keyboard', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },
  keyboards: { canonical: 'Keyboard', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },
  pianoforte: { canonical: 'Piano', categoryId: 'piano-keyboard', categoryName: 'Piano / Keyboard' },

  // Strings
  guitar: { canonical: 'Guitar', categoryId: 'guitar', categoryName: 'Guitar' },
  'electric guitar': { canonical: 'Electric Guitar', categoryId: 'guitar', categoryName: 'Guitar' },
  'acoustic guitar': { canonical: 'Acoustic Guitar', categoryId: 'guitar', categoryName: 'Guitar' },
  'classical guitar': { canonical: 'Classical Guitar', categoryId: 'guitar', categoryName: 'Guitar' },
  'lead guitar': { canonical: 'Lead Guitar', categoryId: 'guitar', categoryName: 'Guitar' },
  'rhythm guitar': { canonical: 'Rhythm Guitar', categoryId: 'guitar', categoryName: 'Guitar' },

  bass: { canonical: 'Bass Guitar', categoryId: 'bass-guitar', categoryName: 'Bass Guitar' },
  'bass guitar': { canonical: 'Bass Guitar', categoryId: 'bass-guitar', categoryName: 'Bass Guitar' },
  'electric bass': { canonical: 'Electric Bass', categoryId: 'bass-guitar', categoryName: 'Bass Guitar' },
  'slap bass': { canonical: 'Bass Guitar', categoryId: 'bass-guitar', categoryName: 'Bass Guitar' },

  violin: { canonical: 'Violin', categoryId: 'violin', categoryName: 'Violin' },
  fiddle: { canonical: 'Violin', categoryId: 'violin', categoryName: 'Violin' },
  'electric violin': { canonical: 'Electric Violin', categoryId: 'violin', categoryName: 'Violin' },

  viola: { canonical: 'Viola', categoryId: 'viola', categoryName: 'Viola' },
  cello: { canonical: 'Cello', categoryId: 'cello', categoryName: 'Cello' },
  cellos: { canonical: 'Cello', categoryId: 'cello', categoryName: 'Cello' },
  violoncello: { canonical: 'Cello', categoryId: 'cello', categoryName: 'Cello' },

  'double bass': { canonical: 'Double Bass', categoryId: 'double-bass', categoryName: 'Double Bass' },
  contrabass: { canonical: 'Double Bass', categoryId: 'double-bass', categoryName: 'Double Bass' },
  'upright bass': { canonical: 'Double Bass', categoryId: 'double-bass', categoryName: 'Double Bass' },

  harp: { canonical: 'Harp', categoryId: 'harp', categoryName: 'Harp' },

  // Percussion
  drums: { canonical: 'Drums', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  drum: { canonical: 'Drums', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  drumkit: { canonical: 'Drum Kit', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  'drum kit': { canonical: 'Drum Kit', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  percussion: { canonical: 'Percussion', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  timpani: { canonical: 'Timpani', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  cymbals: { canonical: 'Cymbals', categoryId: 'drums-percussion', categoryName: 'Drums / Percussion' },
  vibraphone: { canonical: 'Vibraphone', categoryId: 'other-unclassified', categoryName: 'Other / Unclassified' },
  marimba: { canonical: 'Marimba', categoryId: 'other-unclassified', categoryName: 'Other / Unclassified' },

  // Woodwinds
  flute: { canonical: 'Flute', categoryId: 'flute', categoryName: 'Flute' },
  piccolo: { canonical: 'Flute', categoryId: 'flute', categoryName: 'Flute' },
  clarinet: { canonical: 'Clarinet', categoryId: 'clarinet', categoryName: 'Clarinet' },
  oboe: { canonical: 'Oboe', categoryId: 'oboe', categoryName: 'Oboe' },
  bassoon: { canonical: 'Bassoon', categoryId: 'bassoon', categoryName: 'Bassoon' },
  saxophone: { canonical: 'Saxophone', categoryId: 'saxophone', categoryName: 'Saxophone' },
  sax: { canonical: 'Saxophone', categoryId: 'saxophone', categoryName: 'Saxophone' },
  'alto sax': { canonical: 'Alto Saxophone', categoryId: 'saxophone', categoryName: 'Saxophone' },
  'tenor sax': { canonical: 'Tenor Saxophone', categoryId: 'saxophone', categoryName: 'Saxophone' },

  // Brass
  trumpet: { canonical: 'Trumpet', categoryId: 'trumpet', categoryName: 'Brass' },
  'french horn': { canonical: 'French Horn', categoryId: 'french-horn', categoryName: 'French Horn' },
  horn: { canonical: 'French Horn', categoryId: 'french-horn', categoryName: 'French Horn' },
  trombone: { canonical: 'Trombone', categoryId: 'trombone', categoryName: 'Trombone' },
  tuba: { canonical: 'Tuba', categoryId: 'tuba', categoryName: 'Tuba' },

  // Electronic & Voice
  synthesizer: { canonical: 'Synthesizer', categoryId: 'synthesizer', categoryName: 'Synthesizer' },
  synth: { canonical: 'Synthesizer', categoryId: 'synthesizer', categoryName: 'Synthesizer' },
  vocals: { canonical: 'Vocals', categoryId: 'other-unclassified', categoryName: 'Other / Unclassified' },
  vocal: { canonical: 'Vocals', categoryId: 'other-unclassified', categoryName: 'Other / Unclassified' },
  voice: { canonical: 'Vocals', categoryId: 'other-unclassified', categoryName: 'Other / Unclassified' },
  shamisen: { canonical: 'Shamisen', categoryId: 'other-unclassified', categoryName: 'Other / Unclassified' },
};

/**
 * Safely extracts a raw string name from unknown data (string, object, or other).
 * Returns null if no valid name can be extracted. Never returns "[object Object]".
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
    const candidateFields = ['name', 'instrument', 'label', 'instrumentName', 'id', 'title'];
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
 * Safely extracts a confidence number (0..100) from an instrument record or defaults to standard value.
 */
export function extractInstrumentConfidence(item: unknown, defaultConfidence = 85): number {
  if (typeof item === 'object' && item !== null) {
    const rawConf = (item as any).confidence;
    if (typeof rawConf === 'number' && !isNaN(rawConf)) {
      // Normalize 0..1 scale to 0..100
      return rawConf <= 1 ? Math.round(rawConf * 100) : Math.min(100, Math.round(rawConf));
    }
  }
  return defaultConfidence;
}

/**
 * Normalizes an instrument name and returns matched metadata or a safe fallback.
 */
export function resolveInstrumentMetadata(
  item: unknown,
  source: 'gemini_audio' | 'track_metadata' | 'catalog' | 'oembed' = 'gemini_audio'
): NormalizedDetectedInstrument | null {
  const rawName = extractRawInstrumentName(item);
  if (!rawName) return null;

  const lower = rawName.toLowerCase();
  const confidence = extractInstrumentConfidence(item);
  const role = typeof item === 'object' && item !== null ? String((item as any).role || '') : undefined;
  const notes = typeof item === 'object' && item !== null ? String((item as any).notes || '') : undefined;

  // Direct alias match
  if (INSTRUMENT_ALIAS_MAP[lower]) {
    const mapped = INSTRUMENT_ALIAS_MAP[lower];
    return {
      rawName,
      normalizedName: mapped.canonical,
      categoryId: mapped.categoryId,
      categoryName: mapped.categoryName,
      confidence,
      role,
      notes,
      source,
      evidence: rawName,
    };
  }

  // Partial match against alias keys
  for (const [key, mapped] of Object.entries(INSTRUMENT_ALIAS_MAP)) {
    if (lower.includes(key) || key.includes(lower)) {
      return {
        rawName,
        normalizedName: mapped.canonical,
        categoryId: mapped.categoryId,
        categoryName: mapped.categoryName,
        confidence,
        role,
        notes,
        source,
        evidence: rawName,
      };
    }
  }

  // Capitalize raw name for display in other/unclassified category
  const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  return {
    rawName,
    normalizedName: capitalized,
    categoryId: 'other-unclassified',
    categoryName: 'Other / Unclassified',
    confidence,
    role,
    notes,
    source,
    evidence: rawName,
  };
}

/**
 * Safely parses any array or container of detected instruments into normalized records.
 * Never throws regardless of unexpected backend data schemas.
 */
export function parseDetectedInstruments(
  rawList: unknown,
  source: 'gemini_audio' | 'track_metadata' | 'catalog' | 'oembed' = 'gemini_audio'
): NormalizedDetectedInstrument[] {
  if (!rawList) return [];

  let itemsToProcess: unknown[] = [];
  if (Array.isArray(rawList)) {
    itemsToProcess = rawList;
  } else if (typeof rawList === 'object') {
    const obj = rawList as Record<string, unknown>;
    if (Array.isArray(obj.detectedInstruments)) {
      itemsToProcess = obj.detectedInstruments;
    } else if (Array.isArray(obj.instruments)) {
      itemsToProcess = obj.instruments;
    }
  }

  const results: NormalizedDetectedInstrument[] = [];
  const seenCategories = new Set<string>();

  for (const item of itemsToProcess) {
    const resolved = resolveInstrumentMetadata(item, source);
    if (resolved && !seenCategories.has(resolved.categoryId + ':' + resolved.normalizedName)) {
      seenCategories.add(resolved.categoryId + ':' + resolved.normalizedName);
      results.push(resolved);
    }
  }

  return results;
}
