/**
 * Centralized, typed character musical role metadata registry.
 * Maps specific character variants to their performance role / instrument badge.
 *
 * NOTE: Strictly decoupled from real-time audio detection. Never use these tags
 * as audio detection inputs.
 */

export interface CharacterRole {
  roleTag: string; // e.g. "Grand Piano", "Electric Piano", "Bass"
  category: 'Keys' | 'Strings' | 'Woodwinds' | 'Brass' | 'Percussion' | 'Vocal / Dance';
  iconType?: 'piano' | 'guitar' | 'bass' | 'drums' | 'wind' | 'brass' | 'strings' | 'vocal';
  colorClass: string; // Tailwind color styling for badge
}

export interface CharacterRoleEntry {
  matchFilenames: string[];
  matchIds?: string[];
  matchNames?: string[];
  role: CharacterRole;
}

export const CHARACTER_ROLE_REGISTRY: CharacterRoleEntry[] = [
  // Keys
  {
    matchFilenames: ['Airi (Band).glb'],
    matchIds: ['airi-band', 'airi-band-3'],
    matchNames: ['Airi (Band)'],
    role: {
      roleTag: 'Electric Piano',
      category: 'Keys',
      iconType: 'piano',
      colorClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    },
  },
  {
    matchFilenames: ['Hina_Dress_with_Piano.glb'],
    matchIds: ['hina-dress-with-piano', 'hina-dress-with-piano-296'],
    matchNames: ['Hina (Dress) with Piano', 'Hina (Dress)'],
    role: {
      roleTag: 'Grand Piano',
      category: 'Keys',
      iconType: 'piano',
      colorClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    },
  },
  // Strings
  {
    matchFilenames: ['Kazusa (Band).glb'],
    matchIds: ['kazusa-band', 'kazusa-band-92'],
    matchNames: ['Kazusa (Band)'],
    role: {
      roleTag: 'Bass',
      category: 'Strings',
      iconType: 'bass',
      colorClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    },
  },
  {
    matchFilenames: ['Yoshimi (Band).glb'],
    matchIds: ['yoshimi-band', 'yoshimi-band-280'],
    matchNames: ['Yoshimi (Band)'],
    role: {
      roleTag: 'Electric Guitar',
      category: 'Strings',
      iconType: 'guitar',
      colorClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    },
  },
  {
    matchFilenames: ['Yuzu_Cello.glb'],
    matchIds: ['yuzu-cello', 'yuzu-cello-298'],
    matchNames: ['Yuzu with Cello', 'Yuzu (Cello)'],
    role: {
      roleTag: 'Cello',
      category: 'Strings',
      iconType: 'strings',
      colorClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
    },
  },
  {
    matchFilenames: ['Shiroko_Terror_Violin.glb'],
    matchIds: ['shiroko-terror-violin', 'shiroko_terror_violin'],
    matchNames: ['Shiroko Terror with Violin', 'Shiroko Terror (Violin)', 'ShirokoTerror'],
    role: {
      roleTag: 'Violin',
      category: 'Strings',
      iconType: 'strings',
      colorClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    },
  },
  {
    matchFilenames: ['Shiroko_Violin.glb'],
    matchIds: ['shiroko-violin', 'shiroko_violin'],
    matchNames: ['Shiroko with Violin', 'Shiroko (Violin)'],
    role: {
      roleTag: 'Violin',
      category: 'Strings',
      iconType: 'strings',
      colorClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    },
  },
  {
    matchFilenames: ['Akari_New_Year_Shamisen.glb'],
    matchIds: ['akari-new-year-shamisen', 'akari-new-year-shamisen-303'],
    matchNames: ['Akari (New Year) with Shamisen', 'Akari (Shamisen)'],
    role: {
      roleTag: 'Shamisen',
      category: 'Strings',
      iconType: 'strings',
      colorClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
    },
  },
  // Percussion
  {
    matchFilenames: ['Natsu (Band).glb', 'Natsu (Band) (No Weapon).glb'],
    matchIds: ['natsu-band', 'natsu-band-167', 'natsu-band-no-weapon-166'],
    matchNames: ['Natsu (Band)', 'Natsu (Band) (No Weapon)'],
    role: {
      roleTag: 'Drums',
      category: 'Percussion',
      iconType: 'drums',
      colorClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    },
  },
  {
    matchFilenames: [
      'Wakamo_Swimsuit_Vibraphone.glb',
      'Wakamo_Swimsuit_Vibraphone_Mask_On.glb',
    ],
    matchIds: [
      'wakamo-swimsuit-vibraphone',
      'wakamo-swimsuit-vibraphone-299',
      'wakamo-swimsuit-vibraphone-mask-on',
      'wakamo-swimsuit-vibraphone-mask-on-300',
    ],
    matchNames: [
      'Wakamo (Swimsuit) with Vibraphone',
      'Wakamo (Swimsuit) with Vibraphone — Mask On',
      'Wakaso (Swimsuit) with Vibraphone', // alias resolution
    ],
    role: {
      roleTag: 'Vibraphone',
      category: 'Percussion',
      iconType: 'drums',
      colorClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
    },
  },
  // Woodwinds & Brass
  {
    matchFilenames: ['Ako_Dress_Sax.glb'],
    matchIds: ['ako-dress-sax', 'ako-dress-sax-297'],
    matchNames: ['Ako (Dress) with Saxophone', 'Ako (Saxophone)'],
    role: {
      roleTag: 'Saxophone',
      category: 'Woodwinds',
      iconType: 'wind',
      colorClass: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
    },
  },
  {
    matchFilenames: ['Maki_Camping_Flute.glb'],
    matchIds: ['maki-camping-flute', 'maki-camping-flute-305'],
    matchNames: ['Maki (Camping) with Flute', 'MakiCamp (Flute)'],
    role: {
      roleTag: 'Flute',
      category: 'Woodwinds',
      iconType: 'wind',
      colorClass: 'bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30',
    },
  },
  {
    matchFilenames: ['Fuuka_FrenchHorn.glb'],
    matchIds: ['fuuka-french-horn', 'fuuka-french-horn-301'],
    matchNames: ['Fuuka with French Horn', 'Fuuka (French Horn)'],
    role: {
      roleTag: 'French Horn',
      category: 'Brass',
      iconType: 'brass',
      colorClass: 'bg-amber-600/15 text-amber-800 dark:text-amber-200 border-amber-600/30',
    },
  },
  {
    matchFilenames: ['Nodoka_Trumpet.glb'],
    matchIds: ['nodoka-trumpet', 'nodoka-trumpet-302'],
    matchNames: ['Nodoka with Trumpet', 'Nodoka (Trumpet)'],
    role: {
      roleTag: 'Trumpet',
      category: 'Brass',
      iconType: 'brass',
      colorClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
    },
  },
  // Vocal / Dancer
  {
    matchFilenames: ['Hatsune Miku.glb'],
    matchIds: ['hatsune-miku', 'hatsune-miku-45'],
    matchNames: ['Hatsune Miku'],
    role: {
      roleTag: 'Vocal / Dancer',
      category: 'Vocal / Dance',
      iconType: 'vocal',
      colorClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    },
  },
  {
    matchFilenames: ['Mari (Idol).glb'],
    matchIds: ['mari-idol', 'mari-idol-128'],
    matchNames: ['Mari (Idol)'],
    role: {
      roleTag: 'Vocal / Dancer',
      category: 'Vocal / Dance',
      iconType: 'vocal',
      colorClass: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
    },
  },
  {
    matchFilenames: ['Mine (Idol).glb'],
    matchIds: ['mine-idol', 'mine-idol-145'],
    matchNames: ['Mine (Idol)'],
    role: {
      roleTag: 'Vocal / Dancer',
      category: 'Vocal / Dance',
      iconType: 'vocal',
      colorClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
    },
  },
  {
    matchFilenames: ['Sakurako (Idol).glb'],
    matchIds: ['sakurako-idol', 'sakurako-idol-210'],
    matchNames: ['Sakurako (Idol)'],
    role: {
      roleTag: 'Vocal / Dancer',
      category: 'Vocal / Dance',
      iconType: 'vocal',
      colorClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    },
  },
];

/**
 * Resolves a character's musical role tag based on exact filename, ID, or canonical name.
 * Handles the "Wakaso" alias and variant matching without loose substring collisions.
 */
export function getCharacterRole(
  charOrQuery: { id?: string; filename?: string; name?: string; displayName?: string } | string | null | undefined
): CharacterRole | null {
  if (!charOrQuery) return null;

  const targetFilename =
    typeof charOrQuery === 'string'
      ? charOrQuery.toLowerCase().trim()
      : (charOrQuery.filename || '').toLowerCase().trim();

  const targetId =
    typeof charOrQuery === 'string'
      ? charOrQuery.toLowerCase().trim()
      : (charOrQuery.id || '').toLowerCase().trim();

  const targetName =
    typeof charOrQuery === 'string'
      ? charOrQuery.toLowerCase().trim()
      : (charOrQuery.displayName || charOrQuery.name || '').toLowerCase().trim();

  // Alias normalization: "wakaso" -> "wakamo"
  const normalizedName = targetName.replace(/\bwakaso\b/gi, 'wakamo');

  for (const entry of CHARACTER_ROLE_REGISTRY) {
    // 1. Exact filename match (most precise)
    if (targetFilename && entry.matchFilenames.some((fn) => fn.toLowerCase() === targetFilename)) {
      return entry.role;
    }

    // 2. Normalized ID match
    if (targetId && entry.matchIds?.some((id) => id.toLowerCase() === targetId)) {
      return entry.role;
    }

    // 3. Normalized Name match
    if (normalizedName && entry.matchNames?.some((n) => n.toLowerCase() === normalizedName)) {
      return entry.role;
    }
  }

  return null;
}
