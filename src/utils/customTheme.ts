import { CustomThemeConfig, DEFAULT_CUSTOM_THEME, RainIntensityLevel } from '../types/theme';

const STORAGE_CUSTOM_THEME_KEY = 'aniverse_custom_theme_config';
const STORAGE_RAIN_INTENSITY_KEY = 'aniverse_rain_intensity_level';

/**
 * Loads saved custom theme configuration from localStorage with robust fallback.
 */
export function loadCustomTheme(): CustomThemeConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CUSTOM_THEME };
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_THEME_KEY);
    if (!raw) return { ...DEFAULT_CUSTOM_THEME };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CUSTOM_THEME,
      ...parsed,
    };
  } catch (err) {
    console.warn('[CustomTheme] Failed to load custom theme from localStorage:', err);
    return { ...DEFAULT_CUSTOM_THEME };
  }
}

/**
 * Saves custom theme configuration to localStorage.
 */
export function saveCustomTheme(config: CustomThemeConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_CUSTOM_THEME_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[CustomTheme] Failed to persist custom theme to localStorage:', err);
  }
}

/**
 * Applies custom theme CSS variables to document root.
 */
export function applyCustomThemeToDOM(config: CustomThemeConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.style.setProperty('--custom-canvas', config.pageBg);
  root.style.setProperty('--custom-card', config.cardBg);
  root.style.setProperty('--custom-accent', config.primary);
  root.style.setProperty('--custom-accent-secondary', config.secondary);
  root.style.setProperty('--custom-text', config.textColor);
  root.style.setProperty('--custom-muted-text', config.mutedTextColor);
  root.style.setProperty('--custom-border', config.borderColor);
  root.style.setProperty('--custom-gradient-start', config.bgGradientStart);
  root.style.setProperty('--custom-gradient-end', config.bgGradientEnd);
  root.style.setProperty('--custom-gradient-dir', config.gradientDir);

  const pageBgValue = config.useGradient
    ? `linear-gradient(${config.gradientDir}, ${config.bgGradientStart}, ${config.bgGradientEnd})`
    : config.pageBg;
  root.style.setProperty('--custom-page-bg', pageBgValue);
}

/**
 * Loads rain intensity from localStorage (0 = Off, 1 = Light, 2 = Moderate, 3 = Heavy, 4 = Rainstorm).
 */
export function loadRainIntensity(): RainIntensityLevel {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(STORAGE_RAIN_INTENSITY_KEY);
    if (raw === null) return 0;
    const num = parseInt(raw, 10);
    if (num >= 0 && num <= 4) return num as RainIntensityLevel;
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Saves rain intensity level to localStorage.
 */
export function saveRainIntensity(level: RainIntensityLevel): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_RAIN_INTENSITY_KEY, String(level));
  } catch (err) {
    console.warn('[RainIntensity] Failed to persist rain intensity to localStorage:', err);
  }
}
