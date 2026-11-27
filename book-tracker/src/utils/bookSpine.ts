import type { BookFormat } from '../types/domain';

export interface DeterministicSpineStyle {
  leatherBg: string;
  leatherHex: string;
  accentBand: string;
  foilColor: string;
  ribShadow: string;
  heightPx: number;
  widthPx: number;
  bandingVariant: 'classic' | 'cathedral' | 'astronomy';
}

interface SpinePalette {
  leatherBg: string;
  leatherHex: string;
  accentBand: string;
  foilColor: string;
  ribShadow: string;
}

const LEATHER_PALETTES: SpinePalette[] = [
  {
    leatherBg: 'linear-gradient(135deg, #542029 0%, #3A131A 60%, #260B10 100%)',
    leatherHex: '#4f1e27',
    accentBand: '#B49A67',
    foilColor: '#EAD8AC',
    ribShadow: 'rgba(18, 4, 7, 0.72)',
  },
  {
    leatherBg: 'linear-gradient(135deg, #1E324F 0%, #142238 60%, #0C1524 100%)',
    leatherHex: '#203657',
    accentBand: '#9BB5DC',
    foilColor: '#E5ECF7',
    ribShadow: 'rgba(5, 10, 20, 0.72)',
  },
  {
    leatherBg: 'linear-gradient(135deg, #213B30 0%, #162820 60%, #0D1914 100%)',
    leatherHex: '#224034',
    accentBand: '#B49A67',
    foilColor: '#EFE0B9',
    ribShadow: 'rgba(6, 15, 11, 0.72)',
  },
  {
    leatherBg: 'linear-gradient(135deg, #3D2746 0%, #2A1931 60%, #1A0F20 100%)',
    leatherHex: '#41294b',
    accentBand: '#9D8EC4',
    foilColor: '#EBE4F7',
    ribShadow: 'rgba(14, 7, 19, 0.72)',
  },
  {
    leatherBg: 'linear-gradient(135deg, #4E3122 0%, #372116 60%, #24140D 100%)',
    leatherHex: '#523424',
    accentBand: '#C9AE79',
    foilColor: '#F3E5C2',
    ribShadow: 'rgba(20, 10, 5, 0.72)',
  },
  {
    leatherBg: 'linear-gradient(135deg, #273042 0%, #1A212E 60%, #10151F 100%)',
    leatherHex: '#293448',
    accentBand: '#AEB9C9',
    foilColor: '#E8EDF5',
    ribShadow: 'rgba(8, 12, 19, 0.72)',
  },
];

const BANDING_VARIANTS: Array<DeterministicSpineStyle['bandingVariant']> = [
  'classic',
  'cathedral',
  'astronomy',
];

/**
 * Computes a stable 32-bit FNV-1a hash from an arbitrary string identifier.
 * Used exclusively to produce deterministic shelf spine appearances per Work ID.
 */
export function hashStringDeterministic(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Generates deterministic, stable visual properties for a leather-bound book spine
 * from the real book record so shelves never flicker or invent random decorative books.
 */
export function getDeterministicBookSpineStyle(params: {
  workId: string;
  pageCount?: number | null;
  format?: BookFormat;
}): DeterministicSpineStyle {
  const hash = hashStringDeterministic(params.workId);
  const palette = LEATHER_PALETTES[hash % LEATHER_PALETTES.length];
  const bandingVariant = BANDING_VARIANTS[(hash >>> 4) % BANDING_VARIANTS.length];

  const baseHeight =
    params.format === 'bunko'
      ? 172
      : params.format === 'hardcover' || params.format === 'box_set'
        ? 214
        : 194;
  const heightVariance = ((hash >>> 8) % 18) - 8;
  const heightPx = Math.max(168, Math.min(228, baseHeight + heightVariance));

  const pages = params.pageCount && params.pageCount > 0 ? params.pageCount : 240;
  const computedWidth = Math.round(38 + Math.min(22, pages / 38));
  const widthPx = Math.max(38, Math.min(60, computedWidth));

  return {
    leatherBg: palette.leatherBg,
    leatherHex: palette.leatherHex,
    accentBand: palette.accentBand,
    foilColor: palette.foilColor,
    ribShadow: palette.ribShadow,
    heightPx,
    widthPx,
    bandingVariant,
  };
}
