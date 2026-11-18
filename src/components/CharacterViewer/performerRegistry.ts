import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { isVoiceInstrument } from '../../utils/instrumentNormalization';
import {
  YamnetTargetInstrumentName,
  YAMNET_TARGET_CATALOG,
  YAMNET_VOCAL_CATEGORY,
} from '../../utils/yamnetLabelMap';
import { CharacterAnimationInfo } from './types';

export type PerformerVerificationStatus = 'verified' | 'partial' | 'unverified';

export interface PerformerMappingEntry {
  instrumentName: YamnetTargetInstrumentName;
  characterId: string;
  alternateCharacterIds: string[];
  characterName: string;
  filename: string;
  url: string;
  idleClip: string;
  idleFallbacks: string[];
  playingClip: string;
  playingFallbacks: string[];
  loopMode: 'repeat' | 'subclip_loop';
  hasVerifiedInstrumentProp: boolean;
  stageFootprintWidth: number;
  verificationStatus: PerformerVerificationStatus;
  verificationNotes: string;
}

const RAW_BASE = 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/';

/**
 * Authoritative 17-Instrument -> Blue Archive Performer Registry.
 * Every filename, URL, instrument mesh/node, and idle/playing clip name below
 * was inspected against the live GLB headers in Henry2120/BlueArchiveModels.
 *
 * CRITICAL: 'Vocals' is deliberately excluded. Vocals stays an independent detection
 * category and never triggers or occupies a 3D performer slot.
 */
export const INSTRUMENT_PERFORMER_REGISTRY: readonly PerformerMappingEntry[] = [
  {
    instrumentName: 'Electric Piano',
    characterId: 'airi-band-1',
    alternateCharacterIds: ['airi-band', 'airi-band-3'],
    characterName: 'Airi (Band)',
    filename: 'Airi (Band).glb',
    url: `${RAW_BASE}Airi%20(Band).glb`,
    idleClip: 'NonWeapon_Idle',
    idleFallbacks: ['Cafe_Idle', 'Formation_Idle', 'Normal_Idle'],
    playingClip: 'NonWeapon_Keyboard',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.5,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; meshes include CH0251_Instrument_Mesh; clips NonWeapon_Idle (8.0s) & NonWeapon_Keyboard (8.0s).',
  },
  {
    instrumentName: 'Bass Guitar',
    characterId: 'kazusa-band-108',
    alternateCharacterIds: ['kazusa-band', 'kazusa-band-92'],
    characterName: 'Kazusa (Band)',
    filename: 'Kazusa (Band).glb',
    url: `${RAW_BASE}Kazusa%20(Band).glb`,
    idleClip: 'NonWeapon_Idle',
    idleFallbacks: ['Cafe_Idle', 'Formation_Idle', 'Normal_Idle'],
    playingClip: 'NonWeapon_Bass',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.4,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; meshes include Bass/Amp/Mike; clips NonWeapon_Idle (1.6s) & NonWeapon_Bass (8.3s).',
  },
  {
    instrumentName: 'Drum Kit',
    characterId: 'natsu-band-no-weapon-183',
    alternateCharacterIds: ['natsu-band-no-weapon', 'natsu-band-no-weapon-166', 'natsu-band', 'natsu-band-184', 'natsu-band-167'],
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    url: `${RAW_BASE}Natsu%20(Band)%20(No%20Weapon).glb`,
    idleClip: 'Idle',
    idleFallbacks: ['Cafe_Idle', 'Formation_Idle'],
    playingClip: 'Drum',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.85,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; dedicated weapon-free drum kit rig (my_event067_banddrumset) with Idle (5.3s) & Drum (7.8s).',
  },
  {
    instrumentName: 'Electric Guitar',
    characterId: 'yoshimi-band-276',
    alternateCharacterIds: ['yoshimi-band', 'yoshimi-band-280'],
    characterName: 'Yoshimi (Band)',
    filename: 'Yoshimi (Band).glb',
    url: `${RAW_BASE}Yoshimi%20(Band).glb`,
    idleClip: 'NonWeapon_Idle',
    idleFallbacks: ['Cafe_Idle', 'Formation_Idle', 'Normal_Idle'],
    playingClip: 'NonWeapon_Guitar',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.45,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; meshes include CH0220_Guitar_Outline/Amp/Mike; clips NonWeapon_Idle (4.0s) & NonWeapon_Guitar (10.0s).',
  },
  {
    instrumentName: 'Piano',
    characterId: 'hina-dress-with-piano-296',
    alternateCharacterIds: ['hina-dress-with-piano'],
    characterName: 'Hina (Dress) with Piano',
    filename: 'Hina_Dress_with_Piano.glb',
    url: `${RAW_BASE}Hina_Dress_with_Piano.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Cutin',
    playingFallbacks: [],
    loopMode: 'subclip_loop',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.85,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Piano_Switch & Mesh_0 piano rig; Cafe_Idle (8.0s) & Exs_Cutin (12.0s -> Exs_Cutin_PianoLoop subclip).',
  },
  {
    instrumentName: 'Grand Piano',
    characterId: 'hinata-grand-piano',
    alternateCharacterIds: [],
    characterName: 'Hinata (Grand Piano)',
    filename: 'Hinata_Grand_Piano_Exs_Grand_Piano.glb',
    url: `${RAW_BASE}Hinata_Grand_Piano_Exs_Grand_Piano.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Grand_Piano',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.95,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; 88-key Grand_Piano & Grand_Piano_Bench; Cafe_Idle (3.2s) & Exs_Grand_Piano (15.0s).',
  },
  {
    instrumentName: 'Shamisen',
    characterId: 'akari-new-year-shamisen-303',
    alternateCharacterIds: ['akari-new-year-shamisen'],
    characterName: 'Akari (New Year) with Shamisen',
    filename: 'Akari_New_Year_Shamisen.glb',
    url: `${RAW_BASE}Akari_New_Year_Shamisen.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'SM019601_Normal_Idle'],
    playingClip: 'Exs_Shamisen',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.4,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Shamisen/Stool/Bachi nodes; Cafe_Idle (4.0s) & Exs_Shamisen (8.0s).',
  },
  {
    instrumentName: 'Saxophone',
    characterId: 'ako-dress-sax-297',
    alternateCharacterIds: ['ako-dress-sax'],
    characterName: 'Ako (Dress) with Saxophone',
    filename: 'Ako_Dress_Sax.glb',
    url: `${RAW_BASE}Ako_Dress_Sax.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Saxophone',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.35,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Saxophone alto node; Cafe_Idle (6.0s) & Exs_Saxophone (8.0s).',
  },
  {
    instrumentName: 'Erhu',
    characterId: 'kisaki-erhu',
    alternateCharacterIds: [],
    characterName: 'Kisaki (Erhu)',
    filename: 'Kisaki_Erhu_Exs_Erhu.glb',
    url: `${RAW_BASE}Kisaki_Erhu_Exs_Erhu.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Erhu',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.4,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Erhu & Erhu_Bow + chair; Cafe_Idle (4.0s) & Exs_Erhu (16.0s).',
  },
  {
    instrumentName: 'Flute',
    characterId: 'maki-camping-flute-305',
    alternateCharacterIds: ['maki-camping-flute'],
    characterName: 'Maki (Camping) with Flute',
    filename: 'Maki_Camping_Flute.glb',
    url: `${RAW_BASE}Maki_Camping_Flute.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Flute',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.35,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Flute nodes attached to Bip001 Head; Cafe_Idle (10.0s) & Exs_Flute (8.0s).',
  },
  {
    instrumentName: 'Trumpet',
    characterId: 'nodoka-trumpet-302',
    alternateCharacterIds: ['nodoka-trumpet'],
    characterName: 'Nodoka with Trumpet',
    filename: 'Nodoka_Trumpet.glb',
    url: `${RAW_BASE}Nodoka_Trumpet.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle'],
    playingClip: 'Exs_Trumpet',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.35,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Trumpet node attached to Bip001 Head; Cafe_Idle (2.7s) & Exs_Trumpet (8.0s).',
  },
  {
    instrumentName: 'Harp',
    characterId: 'saori-dress-harp',
    alternateCharacterIds: [],
    characterName: 'Saori (Dress) with Harp',
    filename: 'Saori_Dress_Harp_Exs_Harp (1).glb',
    url: `${RAW_BASE}Saori_Dress_Harp_Exs_Harp%20(1).glb`,
    idleClip: 'Formation_Idle',
    idleFallbacks: ['Formation_Idle_Random', 'Normal_Idle'],
    playingClip: 'Exs_Harp',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.75,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; 47-string Concert_Harp; Formation_Idle (4.0s, no Cafe_Idle in model) & Exs_Harp (16.0s).',
  },
  {
    instrumentName: 'Violin',
    characterId: 'shiroko-violin-297',
    alternateCharacterIds: ['shiroko-violin', 'shiroko_violin'],
    characterName: 'Shiroko (Violin)',
    filename: 'Shiroko_Violin.glb',
    url: `${RAW_BASE}Shiroko_Violin.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Violin',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.35,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Violin_Visibility & Bow_Visibility nodes; Cafe_Idle (1.7s) & Exs_Violin (10.0s).',
  },
  {
    instrumentName: 'Cello',
    characterId: 'yuzu-cello-298',
    alternateCharacterIds: ['yuzu-cello'],
    characterName: 'Yuzu with Cello',
    filename: 'Yuzu_Cello.glb',
    url: `${RAW_BASE}Yuzu_Cello.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Cello',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.5,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Cello & Bow nodes; Cafe_Idle (1.3s) & Exs_Cello (8.0s).',
  },
  {
    instrumentName: 'Vibraphone',
    characterId: 'wakamo-swimsuit-vibraphone-299',
    alternateCharacterIds: ['wakamo-swimsuit-vibraphone'],
    characterName: 'Wakamo (Swimsuit) with Vibraphone',
    filename: 'Wakamo_Swimsuit_Vibraphone.glb',
    url: `${RAW_BASE}Wakamo_Swimsuit_Vibraphone.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Vibraphone',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.8,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Vibraphone + 4 Mallets; Cafe_Idle (8.0s) & Exs_Vibraphone (8.0s).',
  },
  {
    instrumentName: 'Handpan',
    characterId: 'yuuka-handpan',
    alternateCharacterIds: [],
    characterName: 'Yuuka (Handpan)',
    filename: 'Yuuka_Handpan_Exs_Handpan.glb',
    url: `${RAW_BASE}Yuuka_Handpan_Exs_Handpan.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Handpan',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.45,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; Handpan/Stand/Stool nodes; Cafe_Idle (3.2s) & Exs_Handpan (19.2s).',
  },
  {
    instrumentName: 'Synthesizer',
    characterId: 'saori-synthesizer',
    alternateCharacterIds: [],
    characterName: 'Saori (Synthesizer)',
    filename: 'Saori_Synthesizer_Exs_Synthesizer.glb',
    url: `${RAW_BASE}Saori_Synthesizer_Exs_Synthesizer.glb`,
    idleClip: 'Cafe_Idle',
    idleFallbacks: ['Formation_Idle', 'Normal_Idle'],
    playingClip: 'Exs_Synthesizer',
    playingFallbacks: [],
    loopMode: 'repeat',
    hasVerifiedInstrumentProp: true,
    stageFootprintWidth: 1.55,
    verificationStatus: 'verified',
    verificationNotes: 'Verified HTTP 200; 61-key Synthesizer & Stand nodes; Cafe_Idle (9.6s) & Exs_Synthesizer (15.0s).',
  },
] as const;

const BY_INSTRUMENT_MAP = new Map<string, PerformerMappingEntry>(
  INSTRUMENT_PERFORMER_REGISTRY.map((entry) => [entry.instrumentName.toLowerCase(), entry])
);

const BY_CHARACTER_ID_MAP = new Map<string, PerformerMappingEntry>();
const BY_FILENAME_MAP = new Map<string, PerformerMappingEntry>();

for (const entry of INSTRUMENT_PERFORMER_REGISTRY) {
  BY_CHARACTER_ID_MAP.set(entry.characterId.toLowerCase(), entry);
  for (const altId of entry.alternateCharacterIds) {
    if (!BY_CHARACTER_ID_MAP.has(altId.toLowerCase())) {
      BY_CHARACTER_ID_MAP.set(altId.toLowerCase(), entry);
    }
  }
  BY_FILENAME_MAP.set(entry.filename.toLowerCase(), entry);
}

/**
 * Returns true strictly for the 17 instrument categories assignable to 3D performers.
 * Returns false for 'Vocals' and unknown labels.
 */
export function isAssignableInstrument(name: string | null | undefined): name is YamnetTargetInstrumentName {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  if (normalized === YAMNET_VOCAL_CATEGORY.canonicalName.toLowerCase()) {
    return false;
  }
  return YAMNET_TARGET_CATALOG.some((inst) => inst.canonicalName.toLowerCase() === normalized);
}

/**
 * Looks up the authoritative Blue Archive performer for a canonical YAMNet instrument.
 */
export function getPerformerForInstrument(
  instrumentName: string | null | undefined
): PerformerMappingEntry | null {
  if (!isAssignableInstrument(instrumentName)) return null;
  return BY_INSTRUMENT_MAP.get(instrumentName.trim().toLowerCase()) || null;
}

/**
 * Resolves a character manifest entry (or characterId/filename) back to its mapped YAMNet instrument.
 */
export function resolvePerformerMapping(
  charOrIdOrFilename:
    | { id?: string; characterId?: string; filename?: string; manifestEntry?: CharacterManifestEntry }
    | string
    | null
    | undefined
): PerformerMappingEntry | null {
  if (!charOrIdOrFilename) return null;

  if (typeof charOrIdOrFilename === 'string') {
    const key = charOrIdOrFilename.trim().toLowerCase();
    return BY_CHARACTER_ID_MAP.get(key) || BY_FILENAME_MAP.get(key) || null;
  }

  const entry = charOrIdOrFilename.manifestEntry || charOrIdOrFilename;
  const filename = ('filename' in entry ? entry.filename : '')?.trim().toLowerCase();
  if (filename && BY_FILENAME_MAP.has(filename)) {
    return BY_FILENAME_MAP.get(filename)!;
  }

  const charId =
    ('characterId' in charOrIdOrFilename ? charOrIdOrFilename.characterId : undefined) ||
    ('id' in entry ? entry.id : undefined);
  if (charId && BY_CHARACTER_ID_MAP.has(charId.trim().toLowerCase())) {
    return BY_CHARACTER_ID_MAP.get(charId.trim().toLowerCase())!;
  }

  return null;
}

/**
 * Converts a PerformerMappingEntry into a CharacterManifestEntry compatible with useCharacterLoader.
 */
export function toCharacterManifestEntry(mapping: PerformerMappingEntry): CharacterManifestEntry {
  return {
    id: mapping.characterId,
    name: mapping.characterName,
    filename: mapping.filename,
    url: mapping.url,
  };
}

const AI_FULL_TRACK_STAGE_ALIASES: Record<string, YamnetTargetInstrumentName> = {
  'drum machine': 'Drum Kit',
  'snare drum': 'Drum Kit',
  'bass drum': 'Drum Kit',
  toms: 'Drum Kit',
  cymbals: 'Drum Kit',
  'hi-hat': 'Drum Kit',
  'synth pads': 'Synthesizer',
  arpeggiator: 'Synthesizer',
  'electronic bass': 'Synthesizer',
  organ: 'Synthesizer',
  marimba: 'Vibraphone',
  xylophone: 'Vibraphone',
  glockenspiel: 'Vibraphone',
  piccolo: 'Flute',
};

/**
 * Maps an instrument label from either YAMNet or AI Full-Track Analysis to one of the
 * 17 assignable 3D performer categories, or null if vocal/unassignable.
 * Keeps Vocals strictly unassignable (never spawns a 3D performer).
 */
export function mapInstrumentNameToPerformerTarget(
  instrumentName: string | null | undefined,
  isVoice?: boolean,
  options: { allowAiAliases?: boolean } = {}
): YamnetTargetInstrumentName | null {
  if (!instrumentName) return null;
  if (isVoice || isVoiceInstrument(instrumentName)) return null;

  const trimmed = instrumentName.trim();
  const lower = trimmed.toLowerCase();
  if (lower === YAMNET_VOCAL_CATEGORY.canonicalName.toLowerCase()) {
    return null;
  }

  const direct = YAMNET_TARGET_CATALOG.find(
    (inst) => inst.canonicalName.toLowerCase() === lower
  );
  if (direct) return direct.canonicalName;

  if (options.allowAiAliases) {
    return AI_FULL_TRACK_STAGE_ALIASES[lower] || null;
  }

  return null;
}

/**
 * Resolves the best available animation clip name on a loaded GLB instance given a target
 * clip name and ordered fallbacks. Never substitutes arbitrary clip[0] unless explicitly allowed.
 */
export function resolvePerformerClipName(
  availableAnimations: Array<Pick<CharacterAnimationInfo, 'name'>>,
  preferredClip: string,
  fallbacks: string[] = [],
  options: { allowArbitraryFirstClipFallback?: boolean } = {}
): string | null {
  if (!availableAnimations || availableAnimations.length === 0) {
    return null;
  }

  const candidates = [preferredClip, ...fallbacks];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const exact = availableAnimations.find((a) => a.name === candidate);
    if (exact) return exact.name;
    const lower = candidate.toLowerCase();
    const ci = availableAnimations.find((a) => a.name.toLowerCase() === lower);
    if (ci) return ci.name;
  }

  return options.allowArbitraryFirstClipFallback ? availableAnimations[0]?.name || null : null;
}

export interface PerformerClipResolution {
  clipName: string | null;
  isMissingExpected: boolean;
  expectedClip: string;
  availableNames: string[];
  diagnosticMessage: string | null;
}

/**
 * Strictly resolves the dedicated playing or idle clip for a mapped performer.
 * Never silently substitutes an unrelated clip (like Cafe_Reaction or clip[0]) if the
 * dedicated playing action is missing; instead returns clear diagnostic details.
 */
export function resolvePerformerActionClip(
  availableAnimations: Array<Pick<CharacterAnimationInfo, 'name'>>,
  mapping: PerformerMappingEntry,
  targetState: 'playing' | 'idle'
): PerformerClipResolution {
  const availableNames = (availableAnimations || []).map((a) => a.name);

  if (targetState === 'playing') {
    const candidates =
      mapping.playingClip === 'Exs_Cutin'
        ? ['Exs_Cutin', 'Exs_Cutin_PianoLoop', ...mapping.playingFallbacks]
        : [mapping.playingClip, ...mapping.playingFallbacks];

    const matched = resolvePerformerClipName(
      availableAnimations,
      candidates[0],
      candidates.slice(1),
      { allowArbitraryFirstClipFallback: false }
    );

    if (matched) {
      return {
        clipName: matched,
        isMissingExpected: false,
        expectedClip: mapping.playingClip,
        availableNames,
        diagnosticMessage: null,
      };
    }

    return {
      clipName: null,
      isMissingExpected: true,
      expectedClip: mapping.playingClip,
      availableNames,
      diagnosticMessage: `Missing expected playing clip "${mapping.playingClip}" on ${mapping.characterName} (${mapping.filename}). Available clips: [${availableNames.slice(0, 8).join(', ')}${availableNames.length > 8 ? ', ...' : ''}]`,
    };
  }

  const matchedIdle = resolvePerformerClipName(
    availableAnimations,
    mapping.idleClip,
    mapping.idleFallbacks,
    { allowArbitraryFirstClipFallback: false }
  );

  if (matchedIdle) {
    return {
      clipName: matchedIdle,
      isMissingExpected: false,
      expectedClip: mapping.idleClip,
      availableNames,
      diagnosticMessage: null,
    };
  }

  return {
    clipName: null,
    isMissingExpected: true,
    expectedClip: mapping.idleClip,
    availableNames,
    diagnosticMessage: `Missing expected idle clip "${mapping.idleClip}" on ${mapping.characterName} (${mapping.filename}). Available clips: [${availableNames.slice(0, 8).join(', ')}${availableNames.length > 8 ? ', ...' : ''}]`,
  };
}

