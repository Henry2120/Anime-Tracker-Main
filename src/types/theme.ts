export type AppTheme =
  | 'light'
  | 'dark'
  | 'sakura'
  | 'rain'
  | 'sunny'
  | 'cloudy'
  | 'starlight'
  | 'autumn'
  | 'snow'
  | 'custom';

export interface ThemeOption {
  id: AppTheme;
  name: string;
  nativeName: string;
  icon: string;
  description: string;
  category: 'classic' | 'weather' | 'custom';
  colors: {
    canvas: string;
    card: string;
    accent: string;
    border: string;
    text: string;
  };
}

export interface CustomThemeConfig {
  primary: string; // Accent color (buttons, active states, badges)
  secondary: string; // Secondary accent (highlights, tags)
  pageBg: string; // Canvas page background
  cardBg: string; // Card, modal, panel surfaces
  textColor: string; // Main headings and body text
  mutedTextColor: string; // Secondary, subtext, labels
  borderColor: string; // Borders, dividers, outlines
  bgGradientStart: string; // Gradient start color
  bgGradientEnd: string; // Gradient end color
  gradientDir: string; // e.g. 'to bottom', 'to bottom right', 'to right'
  useGradient: boolean; // Solid color or gradient
}

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  primary: '#7567C7',
  secondary: '#38BDF8',
  pageBg: '#F7F5F2',
  cardBg: '#FFFFFF',
  textColor: '#25242A',
  mutedTextColor: '#77747D',
  borderColor: '#E7E3DF',
  bgGradientStart: '#F7F5F2',
  bgGradientEnd: '#EDE8F5',
  gradientDir: 'to bottom',
  useGradient: false,
};

export interface PresetPalette {
  id: string;
  name: string;
  category: 'solid' | 'gradient';
  description: string;
  colors: CustomThemeConfig;
}

export const PRESET_PALETTES: PresetPalette[] = [
  // COOL TONES
  {
    id: 'cyber-indigo',
    name: 'Cyber Indigo',
    category: 'solid',
    description: 'Deep midnight navy with vivid cyan & electric indigo accents',
    colors: {
      primary: '#6366F1',
      secondary: '#06B6D4',
      pageBg: '#0B0F19',
      cardBg: '#131B2E',
      textColor: '#F8FAFC',
      mutedTextColor: '#94A3B8',
      borderColor: '#1E293B',
      bgGradientStart: '#0B0F19',
      bgGradientEnd: '#1E1B4B',
      gradientDir: 'to bottom',
      useGradient: false,
    },
  },
  {
    id: 'royal-lavender',
    name: 'Royal Lavender',
    category: 'solid',
    description: 'Soft twilight purple with refined lavender cards',
    colors: {
      primary: '#8B5CF6',
      secondary: '#C084FC',
      pageBg: '#18122B',
      cardBg: '#21193E',
      textColor: '#F5F3FF',
      mutedTextColor: '#A78BFA',
      borderColor: '#392C6E',
      bgGradientStart: '#18122B',
      bgGradientEnd: '#311042',
      gradientDir: 'to bottom right',
      useGradient: false,
    },
  },
  // WARM TONES
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    category: 'solid',
    description: 'Warm golden amber and terracotta sunset aesthetic',
    colors: {
      primary: '#D97706',
      secondary: '#EA580C',
      pageBg: '#FFFBEB',
      cardBg: '#FFFFFF',
      textColor: '#451A03',
      mutedTextColor: '#92400E',
      borderColor: '#FDE68A',
      bgGradientStart: '#FFFBEB',
      bgGradientEnd: '#FEF3C7',
      gradientDir: 'to bottom',
      useGradient: false,
    },
  },
  {
    id: 'rose-crimson',
    name: 'Rose Crimson',
    category: 'solid',
    description: 'Delicate dark ruby canvas with coral-pink highlights',
    colors: {
      primary: '#E11D48',
      secondary: '#FB7185',
      pageBg: '#1A0C11',
      cardBg: '#261219',
      textColor: '#FFF1F2',
      mutedTextColor: '#FDA4AF',
      borderColor: '#4C1D2C',
      bgGradientStart: '#1A0C11',
      bgGradientEnd: '#370A1A',
      gradientDir: 'to bottom right',
      useGradient: false,
    },
  },
  // NATURAL TONES
  {
    id: 'emerald-forest',
    name: 'Emerald Forest',
    category: 'solid',
    description: 'Serene deep pine green with lush jade card accents',
    colors: {
      primary: '#059669',
      secondary: '#10B981',
      pageBg: '#061A12',
      cardBg: '#0B291D',
      textColor: '#ECFDF5',
      mutedTextColor: '#6EE7B7',
      borderColor: '#134E35',
      bgGradientStart: '#061A12',
      bgGradientEnd: '#064E3B',
      gradientDir: 'to bottom',
      useGradient: false,
    },
  },
  {
    id: 'matcha-mint',
    name: 'Matcha Mint',
    category: 'solid',
    description: 'Earthy light matcha green on soothing ivory paper',
    colors: {
      primary: '#15803D',
      secondary: '#22C55E',
      pageBg: '#F4F9F5',
      cardBg: '#FFFFFF',
      textColor: '#14532D',
      mutedTextColor: '#4ADE80',
      borderColor: '#DCFCE7',
      bgGradientStart: '#F4F9F5',
      bgGradientEnd: '#DCFCE7',
      gradientDir: 'to bottom right',
      useGradient: false,
    },
  },
  // NEUTRAL TONES
  {
    id: 'monochrome-obsidian',
    name: 'Monochrome Obsidian',
    category: 'solid',
    description: 'Pure high-contrast minimalist grayscale and charcoal',
    colors: {
      primary: '#E2E8F0',
      secondary: '#94A3B8',
      pageBg: '#09090B',
      cardBg: '#18181B',
      textColor: '#FAFAFA',
      mutedTextColor: '#A1A1AA',
      borderColor: '#27272A',
      bgGradientStart: '#09090B',
      bgGradientEnd: '#18181B',
      gradientDir: 'to bottom',
      useGradient: false,
    },
  },
  {
    id: 'nordic-slate',
    name: 'Nordic Slate',
    category: 'solid',
    description: 'Calm Scandinavian silver and steel blue paper aesthetic',
    colors: {
      primary: '#475569',
      secondary: '#0284C7',
      pageBg: '#F1F5F9',
      cardBg: '#FFFFFF',
      textColor: '#0F172A',
      mutedTextColor: '#64748B',
      borderColor: '#CBD5E1',
      bgGradientStart: '#F1F5F9',
      bgGradientEnd: '#E2E8F0',
      gradientDir: 'to bottom',
      useGradient: false,
    },
  },
  // GRADIENT PALETTES
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    category: 'gradient',
    description: 'Shifting teal, emerald, and indigo atmospheric gradient',
    colors: {
      primary: '#10B981',
      secondary: '#38BDF8',
      pageBg: '#031720',
      cardBg: '#0B2330',
      textColor: '#F0FDFA',
      mutedTextColor: '#5EEAD4',
      borderColor: '#134E5E',
      bgGradientStart: '#041E28',
      bgGradientEnd: '#132A46',
      gradientDir: 'to bottom right',
      useGradient: true,
    },
  },
  {
    id: 'sunset-radiance',
    name: 'Sunset Radiance',
    category: 'gradient',
    description: 'Vibrant dusk gradient from violet to rose and warm peach',
    colors: {
      primary: '#F43F5E',
      secondary: '#FB923C',
      pageBg: '#1F1128',
      cardBg: '#2A1838',
      textColor: '#FFF1F2',
      mutedTextColor: '#FDA4AF',
      borderColor: '#4A2563',
      bgGradientStart: '#2A123D',
      bgGradientEnd: '#431429',
      gradientDir: 'to bottom right',
      useGradient: true,
    },
  },
  {
    id: 'vaporwave-glow',
    name: 'Vaporwave Glow',
    category: 'gradient',
    description: '80s retro neon cyan and magenta gradient palette',
    colors: {
      primary: '#D946EF',
      secondary: '#06B6D4',
      pageBg: '#12072B',
      cardBg: '#1C0D3F',
      textColor: '#FDF4FF',
      mutedTextColor: '#F0ABFC',
      borderColor: '#3B1A6E',
      bgGradientStart: '#140830',
      bgGradientEnd: '#2D0A4E',
      gradientDir: 'to bottom right',
      useGradient: true,
    },
  },
  {
    id: 'strawberry-milk',
    name: 'Strawberry Milk',
    category: 'gradient',
    description: 'Subtle pastel pink to soft vanilla cream gradient',
    colors: {
      primary: '#EC4899',
      secondary: '#F472B6',
      pageBg: '#FDF2F8',
      cardBg: '#FFFFFF',
      textColor: '#831843',
      mutedTextColor: '#DB2777',
      borderColor: '#FCE7F3',
      bgGradientStart: '#FDF2F8',
      bgGradientEnd: '#FFF7ED',
      gradientDir: 'to bottom right',
      useGradient: true,
    },
  },
];

// Rain Intensity Settings
export type RainIntensityLevel = 0 | 1 | 2 | 3 | 4;

export interface RainIntensityMeta {
  level: RainIntensityLevel;
  label: string;
  sublabel: string;
  description: string;
}

export const RAIN_INTENSITY_LEVELS: RainIntensityMeta[] = [
  {
    level: 0,
    label: 'Off',
    sublabel: '無 (Nashi)',
    description: 'No rain particles or wind',
  },
  {
    level: 1,
    label: 'Light Rain',
    sublabel: '小雨 (Kosame)',
    description: 'Sparse, gentle raindrops',
  },
  {
    level: 2,
    label: 'Moderate Rain',
    sublabel: '雨 (Ame)',
    description: 'Clearly visible, steady rainfall',
  },
  {
    level: 3,
    label: 'Heavy Rain',
    sublabel: '大雨 (Ooame)',
    description: 'Dense rainfall with stronger visual presence',
  },
  {
    level: 4,
    label: 'Rainstorm',
    sublabel: '嵐 (Arashi)',
    description: 'Dense rainfall combined with wind gusts & blown rain',
  },
];

export const THEME_OPTIONS: ThemeOption[] = [
  // CLASSIC THEMES
  {
    id: 'light',
    name: 'Light',
    nativeName: '白 (Haku)',
    icon: '☀',
    description: 'Clean, high-contrast Japanese editorial paper aesthetic',
    category: 'classic',
    colors: {
      canvas: '#F7F5F2',
      card: '#FFFFFF',
      accent: '#7567C7',
      border: '#E7E3DF',
      text: '#25242A',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    nativeName: '墨 (Sumi)',
    icon: '☾',
    description: 'Deep charcoal twilight canvas with balanced lavender accents',
    category: 'classic',
    colors: {
      canvas: '#141318',
      card: '#1E1D24',
      accent: '#7567C7',
      border: '#2E2C37',
      text: '#F4F2F7',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    nativeName: '桜 (Sakura)',
    icon: '🌸',
    description: 'Light aesthetic with gentle falling cherry blossom petals',
    category: 'classic',
    colors: {
      canvas: '#FDF5F7',
      card: '#FFFFFF',
      accent: '#E06D8A',
      border: '#F8D7E0',
      text: '#25242A',
    },
  },

  // WEATHER & ATMOSPHERIC THEMES
  {
    id: 'rain',
    name: 'Rain',
    nativeName: '雨 (Ame)',
    icon: '🌧️',
    description: 'Rainy Night — deep navy, blue-gray, cool cyan accents, gentle rain',
    category: 'weather',
    colors: {
      canvas: '#0C1222',
      card: '#131D31',
      accent: '#38BDF8',
      border: '#1E2E4A',
      text: '#F1F5F9',
    },
  },
  {
    id: 'sunny',
    name: 'Sunny',
    nativeName: '晴 (Hare)',
    icon: '☀️',
    description: 'Clear Sky — bright airy sky blue, pale blue, warm white, golden accents',
    category: 'weather',
    colors: {
      canvas: '#F0F7FF',
      card: '#FFFFFF',
      accent: '#0284C7',
      border: '#D8E6F5',
      text: '#0F172A',
    },
  },
  {
    id: 'cloudy',
    name: 'Cloudy',
    nativeName: '曇 (Kumori)',
    icon: '☁️',
    description: 'Overcast — muted blue-gray, silver, calm desaturated cool gradients',
    category: 'weather',
    colors: {
      canvas: '#ECEFF3',
      card: '#F8FAFC',
      accent: '#64748B',
      border: '#D7DDE5',
      text: '#1E293B',
    },
  },
  {
    id: 'starlight',
    name: 'Starlight',
    nativeName: '星 (Hoshi)',
    icon: '✨',
    description: 'Cosmic Night — deep indigo, midnight blue, violet accents, subtle stars',
    category: 'weather',
    colors: {
      canvas: '#090A1A',
      card: '#11122B',
      accent: '#A78BFA',
      border: '#222452',
      text: '#F3F4F6',
    },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    nativeName: '秋 (Aki)',
    icon: '🍁',
    description: 'Maple Sunset — warm amber, burnt orange, brown, gentle falling leaves',
    category: 'weather',
    colors: {
      canvas: '#FBF6EE',
      card: '#FFFFFF',
      accent: '#D97706',
      border: '#EDE2D0',
      text: '#291E16',
    },
  },
  {
    id: 'snow',
    name: 'Snow',
    nativeName: '雪 (Yuki)',
    icon: '❄️',
    description: 'Winter Night — icy blue, silver, cool white, midnight blue, soft snowfall',
    category: 'weather',
    colors: {
      canvas: '#0A111E',
      card: '#111C2E',
      accent: '#7DD3FC',
      border: '#1E314F',
      text: '#F0F9FF',
    },
  },

  // CUSTOM THEME
  {
    id: 'custom',
    name: 'Custom',
    nativeName: '自分色 (Custom)',
    icon: '🎨',
    description: 'Custom palette & gradients — personalized colors, panels, and borders',
    category: 'custom',
    colors: {
      canvas: '#F7F5F2',
      card: '#FFFFFF',
      accent: '#7567C7',
      border: '#E7E3DF',
      text: '#25242A',
    },
  },
];

/**
 * Validates a standard 6-digit hex color format (#RRGGBB).
 */
export function isHexColorValid(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6})$/.test(hex.trim());
}

/**
 * Computes luminance of hex color to determine whether it is perceived as dark or light.
 */
export function getHexLuminance(hex: string): number {
  if (!isHexColorValid(hex)) return 128;
  const clean = hex.trim().replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function isDarkThemeFamily(theme: AppTheme, customPageBg?: string): boolean {
  if (theme === 'custom') {
    if (customPageBg) {
      return getHexLuminance(customPageBg) < 130;
    }
    return false;
  }
  return theme === 'dark' || theme === 'rain' || theme === 'starlight' || theme === 'snow';
}
