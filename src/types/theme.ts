export type AppTheme = 'light' | 'dark' | 'sakura';

export interface ThemeOption {
  id: AppTheme;
  name: string;
  nativeName: string;
  icon: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    name: 'Light',
    nativeName: '白 (Haku)',
    icon: '☀',
    description: 'Clean, high-contrast Japanese editorial paper aesthetic',
  },
  {
    id: 'dark',
    name: 'Dark',
    nativeName: '墨 (Sumi)',
    icon: '☾',
    description: 'Deep charcoal twilight canvas with balanced lavender accents',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    nativeName: '桜 (Sakura)',
    icon: '🌸',
    description: 'Light aesthetic with gentle falling cherry blossom petals',
  },
];
