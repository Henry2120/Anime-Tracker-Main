export type AppTheme =
  | 'light'
  | 'dark'
  | 'sakura'
  | 'rain'
  | 'sunny'
  | 'cloudy'
  | 'starlight'
  | 'autumn'
  | 'snow';

export interface ThemeOption {
  id: AppTheme;
  name: string;
  nativeName: string;
  icon: string;
  description: string;
  category: 'classic' | 'weather';
  colors: {
    canvas: string;
    card: string;
    accent: string;
    border: string;
    text: string;
  };
}

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
];

export function isDarkThemeFamily(theme: AppTheme): boolean {
  return theme === 'dark' || theme === 'rain' || theme === 'starlight' || theme === 'snow';
}
