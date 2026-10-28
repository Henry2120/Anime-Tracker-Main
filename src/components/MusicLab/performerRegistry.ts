import { DetectedInstrument, PerformerMapping, PerformerAssignment } from '../../types/musicLab';
import { getCharacterById } from '../../data/blueArchiveCharacters';

/**
 * Extensible Performer Registry for Music Lab
 * Maps audibly detected instruments to available 3D character models and performance animations.
 *
 * Requirements strictly followed:
 * - Only assign a performer when a compatible character, instrument, and performance animation are available.
 * - Do not display unrelated characters or invent an instrument assignment just to fill the stage.
 * - Support instruments beyond a fixed list of piano, drums, bass, and electric guitar (e.g. cello, violin, vocals).
 */
export const REGISTERED_PERFORMER_MAPPINGS: PerformerMapping[] = [
  // 1. PIANO
  {
    instrumentKey: 'piano',
    displayInstrumentName: 'Grand Piano',
    characterId: 'hina-dress-with-piano-296',
    characterName: 'Hina (Dress with Piano)',
    modelFilename: 'Hina_Dress_with_Piano.glb',
    modelUrl: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Hina_Dress_with_Piano.glb',
    performanceAnimation: 'Exs_Cutin',
    idleAnimation: 'Cafe_Idle',
    notes: 'Acoustic grand piano solo performer with built-in grand piano model and cut-in playing animation',
  },
  // 2. VIOLIN
  {
    instrumentKey: 'violin',
    displayInstrumentName: 'Violin',
    characterId: 'violinist-performer',
    characterName: 'Violinist',
    modelFilename: 'violinist.glb',
    modelUrl: '/music-lab/musicians/violinist.glb',
    performanceAnimation: 'playing',
    idleAnimation: 'idle',
    notes: 'Acoustic violin virtuoso with modeled violin and bow, featuring dedicated playing and idle animations',
  },
  // 3. CELLO
  {
    instrumentKey: 'cello',
    displayInstrumentName: 'Cello',
    characterId: 'cellist-performer',
    characterName: 'Cellist',
    modelFilename: 'cellist.glb',
    modelUrl: '/music-lab/musicians/cellist.glb',
    performanceAnimation: 'playing',
    idleAnimation: 'idle',
    notes: 'Acoustic cello chamber musician seated with cello and bow, featuring dedicated playing and idle animations',
  },
  // 4. ELECTRIC GUITAR / GUITAR
  {
    instrumentKey: 'electric guitar',
    displayInstrumentName: 'Electric Guitar',
    characterId: 'yoshimi-band-276',
    characterName: 'Yoshimi (Band)',
    modelFilename: 'Yoshimi (Band).glb',
    modelUrl: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Yoshimi%20(Band).glb',
    performanceAnimation: 'Cafe_Reaction',
    idleAnimation: 'Cafe_Idle',
    notes: 'Lead guitar performer from After-School Sweets Club Band',
  },
  // 5. BASS / ELECTRIC BASS
  {
    instrumentKey: 'bass',
    displayInstrumentName: 'Electric Bass',
    characterId: 'kazusa-band-108',
    characterName: 'Kazusa (Band)',
    modelFilename: 'Kazusa (Band).glb',
    modelUrl: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Kazusa%20(Band).glb',
    performanceAnimation: 'Cafe_Reaction',
    idleAnimation: 'Cafe_Idle',
    notes: 'Electric bass performer from After-School Sweets Club Band',
  },
  // 6. DRUMS / DRUM KIT / PERCUSSION
  {
    instrumentKey: 'drums',
    displayInstrumentName: 'Drums',
    characterId: 'natsu-band-184',
    characterName: 'Natsu (Band)',
    modelFilename: 'Natsu (Band).glb',
    modelUrl: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Natsu%20(Band).glb',
    performanceAnimation: 'Cafe_Reaction',
    idleAnimation: 'Cafe_Idle',
    notes: 'Drum kit / percussion performer from After-School Sweets Club Band',
  },
  // 7. VOCALS / LEAD VOCALS
  {
    instrumentKey: 'vocals',
    displayInstrumentName: 'Vocals',
    characterId: 'airi-band-1',
    characterName: 'Airi (Band)',
    modelFilename: 'Airi (Band).glb',
    modelUrl: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Airi%20(Band).glb',
    performanceAnimation: 'Cafe_Reaction',
    idleAnimation: 'Cafe_Idle',
    notes: 'Lead vocalist from After-School Sweets Club Band',
  },
];

/**
 * Normalized instrument alias matching
 */
const INSTRUMENT_ALIASES: Record<string, string> = {
  // Piano aliases
  piano: 'piano',
  pianoforte: 'piano',
  grand_piano: 'piano',
  'grand piano': 'piano',
  'acoustic piano': 'piano',
  upright_piano: 'piano',
  'upright piano': 'piano',
  keyboard: 'piano',
  keyboards: 'piano',

  // Violin aliases
  violin: 'violin',
  violins: 'violin',
  fiddle: 'violin',
  'electric violin': 'violin',
  first_violin: 'violin',
  second_violin: 'violin',

  // Cello aliases
  cello: 'cello',
  cellos: 'cello',
  violoncello: 'cello',
  'cello quartet': 'cello',
  'acoustic cello': 'cello',

  // Guitar aliases
  'electric guitar': 'electric guitar',
  guitar: 'electric guitar',
  guitars: 'electric guitar',
  'lead guitar': 'electric guitar',
  'rhythm guitar': 'electric guitar',
  'acoustic guitar': 'electric guitar',

  // Bass aliases
  bass: 'bass',
  'bass guitar': 'bass',
  'electric bass': 'bass',
  double_bass: 'bass',
  'double bass': 'bass',
  contrabass: 'bass',
  synth_bass: 'bass',
  'synth bass': 'bass',

  // Drums aliases
  drums: 'drums',
  drum: 'drums',
  'drum kit': 'drums',
  drumkit: 'drums',
  percussion: 'drums',
  'electronic drums': 'drums',
  snare: 'drums',
  cymbals: 'drums',

  // Vocals aliases
  vocals: 'vocals',
  vocal: 'vocals',
  singing: 'vocals',
  voice: 'vocals',
  'lead vocals': 'vocals',
  chorus: 'vocals',
  choir: 'vocals',
};

/**
 * Resolves a raw instrument name from analysis to a canonical instrument key
 */
export function resolveInstrumentKey(rawName: string): string | null {
  if (!rawName) return null;
  const clean = rawName.trim().toLowerCase().replace(/[-_]+/g, ' ');

  if (INSTRUMENT_ALIASES[clean]) {
    return INSTRUMENT_ALIASES[clean];
  }

  // Check substring containment
  for (const [alias, key] of Object.entries(INSTRUMENT_ALIASES)) {
    if (clean.includes(alias)) {
      return key;
    }
  }

  return null;
}

/**
 * Finds a registered performer mapping for a given instrument
 */
export function findPerformerForInstrument(instrumentName: string): PerformerMapping | null {
  const key = resolveInstrumentKey(instrumentName);
  if (!key) return null;

  return REGISTERED_PERFORMER_MAPPINGS.find((p) => p.instrumentKey === key) || null;
}

/**
 * Checks if a 3D performer model is available for an instrument
 */
export function isPerformerAvailableForInstrument(instrumentName: string): boolean {
  return findPerformerForInstrument(instrumentName) !== null;
}

/**
 * Assigns available 3D performers to audibly detected instruments.
 * Strict compliance:
 * - Only assign when a compatible character, instrument, and animation are available.
 * - Does NOT populate generic ensembles on failure or unmapped instruments.
 * - Returns both assigned performers and unmapped instruments.
 */
export function assignPerformersFromInstruments(
  instruments: DetectedInstrument[],
  maxPerformers: number = 10
): {
  assignedPerformers: PerformerAssignment[];
  unmappedInstruments: DetectedInstrument[];
} {
  if (!Array.isArray(instruments) || instruments.length === 0) {
    return { assignedPerformers: [], unmappedInstruments: [] };
  }

  // Filter instruments with reasonable confidence (>= 0.40)
  const validInstruments = instruments.filter(
    (inst) => typeof inst.name === 'string' && inst.name.trim() !== '' && (inst.confidence === undefined || inst.confidence >= 0.40)
  );

  // Sort by priority: solo/lead first, then by confidence descending
  const sorted = [...validInstruments].sort((a, b) => {
    const aLead = a.role === 'solo' || a.role === 'lead' ? 2 : 1;
    const bLead = b.role === 'solo' || b.role === 'lead' ? 2 : 1;
    if (aLead !== bLead) return bLead - aLead;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const assigned: PerformerAssignment[] = [];
  const unmapped: DetectedInstrument[] = [];
  const usedCharacterIds = new Set<string>();

  for (const inst of sorted) {
    if (assigned.length >= maxPerformers) break;

    const mapping = findPerformerForInstrument(inst.name);

    if (!mapping) {
      unmapped.push(inst);
      continue;
    }

    if (usedCharacterIds.has(mapping.characterId)) {
      // Performer already assigned on stage for another slot
      continue;
    }

    usedCharacterIds.add(mapping.characterId);

    // Verify manifest entry exists
    const manifestEntry = getCharacterById(mapping.characterId);
    const finalUrl = manifestEntry?.url || mapping.modelUrl;
    const finalName = manifestEntry?.name || mapping.characterName;

    assigned.push({
      slotIndex: assigned.length,
      instrumentName: mapping.displayInstrumentName,
      confidence: inst.confidence ?? 0.90,
      role: inst.role,
      characterId: mapping.characterId,
      characterName: finalName,
      modelUrl: finalUrl,
      modelFilename: mapping.modelFilename,
      performanceAnimation: mapping.performanceAnimation,
      idleAnimation: mapping.idleAnimation,
    });
  }

  return {
    assignedPerformers: assigned,
    unmappedInstruments: unmapped,
  };
}
