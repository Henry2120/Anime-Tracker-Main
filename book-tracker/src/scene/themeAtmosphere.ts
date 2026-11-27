import {
  DEFAULT_CUSTOM_THEME,
  getHexLuminance,
  isHexColorValid,
  type AppTheme,
  type CustomThemeConfig,
  type RainIntensityLevel,
} from '../../../src/types/theme';

export type WindowWeatherMode =
  | 'none'
  | 'petals'
  | 'rain'
  | 'stars'
  | 'leaves'
  | 'snow';

export interface SceneAtmosphereProfile {
  theme: AppTheme;
  isDaylight: boolean;
  roomBg: string;
  fogColor: string;
  fogDensity: number;
  skyTop: string;
  skyBottom: string;
  horizonGlow: string;
  celestialBody: 'sun' | 'moon' | 'stars' | 'none';
  celestialColor: string;
  silhouetteColor: string;
  glassTint: string;
  glassOpacity: number;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  dirLightColor: string;
  dirLightIntensity: number;
  shaftColor: string;
  shaftOpacity: number;
  envIntensity: number;
  weatherMode: WindowWeatherMode;
  effectiveRainIntensity: RainIntensityLevel;
  particlePrimary: string;
  particleSecondary: string;
  accentHex: string;
  lampColor: string;
  lampIntensity: number;
}

function safeHex(hex: string | undefined, fallback: string): string {
  if (hex && isHexColorValid(hex)) return hex;
  return fallback;
}

export function resolveSceneAtmosphere(params: {
  theme: AppTheme;
  customConfig?: CustomThemeConfig;
  rainIntensity?: RainIntensityLevel;
  lanternWarmth: boolean;
}): SceneAtmosphereProfile {
  const {
    theme,
    customConfig = DEFAULT_CUSTOM_THEME,
    rainIntensity = 0,
    lanternWarmth,
  } = params;

  const lampColor = lanternWarmth ? '#f3bd69' : '#80a6e0';
  const baseLampIntensity = lanternWarmth ? 2.85 : 1.18;

  const effectiveRain: RainIntensityLevel =
    rainIntensity > 0
      ? rainIntensity
      : theme === 'rain'
        ? 2
        : 0;

  let profile: SceneAtmosphereProfile;

  switch (theme) {
    case 'light':
      profile = {
        theme,
        isDaylight: true,
        roomBg: '#1c2432',
        fogColor: '#253143',
        fogDensity: 0.026,
        skyTop: '#7cb8e8',
        skyBottom: '#f2f7fc',
        horizonGlow: '#fff4d6',
        celestialBody: 'sun',
        celestialColor: '#fff8de',
        silhouetteColor: '#3e5368',
        glassTint: '#d8ecff',
        glassOpacity: 0.14,
        hemiSkyColor: '#dcecff',
        hemiGroundColor: '#593d2b',
        hemiIntensity: 1.18,
        dirLightColor: '#fff5e4',
        dirLightIntensity: 1.95,
        shaftColor: '#fff3d4',
        shaftOpacity: 0.055,
        envIntensity: 0.44,
        weatherMode: 'none',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#f6dfab',
        particleSecondary: '#ffffff',
        accentHex: '#7567c7',
        lampColor,
        lampIntensity: baseLampIntensity * 0.86,
      };
      break;

    case 'sakura':
      profile = {
        theme,
        isDaylight: true,
        roomBg: '#191422',
        fogColor: '#261f33',
        fogDensity: 0.032,
        skyTop: '#b7cbed',
        skyBottom: '#fce2ea',
        horizonGlow: '#ffdce8',
        celestialBody: 'sun',
        celestialColor: '#fff3f6',
        silhouetteColor: '#4c3a4c',
        glassTint: '#fce4ec',
        glassOpacity: 0.14,
        hemiSkyColor: '#f7d8e4',
        hemiGroundColor: '#4b3328',
        hemiIntensity: 1.12,
        dirLightColor: '#ffe7ee',
        dirLightIntensity: 1.82,
        shaftColor: '#ffd4e3',
        shaftOpacity: 0.052,
        envIntensity: 0.41,
        weatherMode: 'petals',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#ffb7cf',
        particleSecondary: '#ffeef4',
        accentHex: '#e06d8a',
        lampColor,
        lampIntensity: baseLampIntensity * 0.92,
      };
      break;

    case 'rain':
      profile = {
        theme,
        isDaylight: false,
        roomBg: '#070d19',
        fogColor: '#0b1426',
        fogDensity: 0.048,
        skyTop: '#071122',
        skyBottom: '#1c2f4a',
        horizonGlow: '#38bdf8',
        celestialBody: 'none',
        celestialColor: '#7dd3fc',
        silhouetteColor: '#0a1322',
        glassTint: '#7dd3fc',
        glassOpacity: 0.18,
        hemiSkyColor: '#6ea8d6',
        hemiGroundColor: '#261812',
        hemiIntensity: 0.88,
        dirLightColor: '#88c6f2',
        dirLightIntensity: 1.32,
        shaftColor: '#5db4e8',
        shaftOpacity: 0.038,
        envIntensity: 0.34,
        weatherMode: 'rain',
        effectiveRainIntensity: effectiveRain || 2,
        particlePrimary: '#7dd3fc',
        particleSecondary: '#bae6fd',
        accentHex: '#38bdf8',
        lampColor,
        lampIntensity: baseLampIntensity * 1.08,
      };
      break;

    case 'sunny':
      profile = {
        theme,
        isDaylight: true,
        roomBg: '#1c2a3a',
        fogColor: '#273a4e',
        fogDensity: 0.022,
        skyTop: '#3e97df',
        skyBottom: '#dff2ff',
        horizonGlow: '#fff4c2',
        celestialBody: 'sun',
        celestialColor: '#fff7d1',
        silhouetteColor: '#375873',
        glassTint: '#e0f4ff',
        glassOpacity: 0.13,
        hemiSkyColor: '#cdeaff',
        hemiGroundColor: '#61432a',
        hemiIntensity: 1.24,
        dirLightColor: '#fff2cc',
        dirLightIntensity: 2.18,
        shaftColor: '#ffeaa8',
        shaftOpacity: 0.068,
        envIntensity: 0.46,
        weatherMode: 'none',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#ffe8a3',
        particleSecondary: '#ffffff',
        accentHex: '#0284c7',
        lampColor,
        lampIntensity: baseLampIntensity * 0.82,
      };
      break;

    case 'cloudy':
      profile = {
        theme,
        isDaylight: true,
        roomBg: '#181e28',
        fogColor: '#242c39',
        fogDensity: 0.034,
        skyTop: '#64748b',
        skyBottom: '#cbd5e1',
        horizonGlow: '#e2e8f0',
        celestialBody: 'none',
        celestialColor: '#e2e8f0',
        silhouetteColor: '#3c4859',
        glassTint: '#cbd5e1',
        glassOpacity: 0.16,
        hemiSkyColor: '#b7c4d4',
        hemiGroundColor: '#3e2f26',
        hemiIntensity: 1.06,
        dirLightColor: '#d9e3f0',
        dirLightIntensity: 1.42,
        shaftColor: '#cdd9e8',
        shaftOpacity: 0.036,
        envIntensity: 0.36,
        weatherMode: 'none',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#cbd5e1',
        particleSecondary: '#94a3b8',
        accentHex: '#64748b',
        lampColor,
        lampIntensity: baseLampIntensity,
      };
      break;

    case 'starlight':
      profile = {
        theme,
        isDaylight: false,
        roomBg: '#060714',
        fogColor: '#090a1d',
        fogDensity: 0.044,
        skyTop: '#050615',
        skyBottom: '#1c1d45',
        horizonGlow: '#7c6cf0',
        celestialBody: 'stars',
        celestialColor: '#e9d5ff',
        silhouetteColor: '#090a1c',
        glassTint: '#a78bfa',
        glassOpacity: 0.15,
        hemiSkyColor: '#908ce8',
        hemiGroundColor: '#251916',
        hemiIntensity: 0.9,
        dirLightColor: '#b8b3ff',
        dirLightIntensity: 1.42,
        shaftColor: '#9f96f5',
        shaftOpacity: 0.048,
        envIntensity: 0.36,
        weatherMode: 'stars',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#c4b5fd',
        particleSecondary: '#f3e8ff',
        accentHex: '#a78bfa',
        lampColor,
        lampIntensity: baseLampIntensity * 1.05,
      };
      break;

    case 'autumn':
      profile = {
        theme,
        isDaylight: true,
        roomBg: '#181112',
        fogColor: '#261a18',
        fogDensity: 0.032,
        skyTop: '#563956',
        skyBottom: '#f2a154',
        horizonGlow: '#ffd089',
        celestialBody: 'sun',
        celestialColor: '#ffe0a3',
        silhouetteColor: '#3e2318',
        glassTint: '#fed7aa',
        glassOpacity: 0.15,
        hemiSkyColor: '#f0b884',
        hemiGroundColor: '#4c2b19',
        hemiIntensity: 1.08,
        dirLightColor: '#ffcb88',
        dirLightIntensity: 1.85,
        shaftColor: '#ffc278',
        shaftOpacity: 0.06,
        envIntensity: 0.4,
        weatherMode: 'leaves',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#f59e0b',
        particleSecondary: '#ea580c',
        accentHex: '#d97706',
        lampColor,
        lampIntensity: baseLampIntensity * 0.95,
      };
      break;

    case 'snow':
      profile = {
        theme,
        isDaylight: false,
        roomBg: '#09111e',
        fogColor: '#0d182b',
        fogDensity: 0.04,
        skyTop: '#0d1b33',
        skyBottom: '#5a7ea6',
        horizonGlow: '#d6f0ff',
        celestialBody: 'moon',
        celestialColor: '#e0f2fe',
        silhouetteColor: '#13243b',
        glassTint: '#bae6fd',
        glassOpacity: 0.16,
        hemiSkyColor: '#a8d3f5',
        hemiGroundColor: '#2d2424',
        hemiIntensity: 1.02,
        dirLightColor: '#cfe9ff',
        dirLightIntensity: 1.62,
        shaftColor: '#bde3ff',
        shaftOpacity: 0.05,
        envIntensity: 0.39,
        weatherMode: 'snow',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#f0f9ff',
        particleSecondary: '#bae6fd',
        accentHex: '#7dd3fc',
        lampColor,
        lampIntensity: baseLampIntensity * 1.04,
      };
      break;

    case 'custom': {
      const pageBg = safeHex(customConfig.pageBg, '#141318');
      const startHex = customConfig.useGradient
        ? safeHex(customConfig.bgGradientStart, pageBg)
        : pageBg;
      const endHex = customConfig.useGradient
        ? safeHex(customConfig.bgGradientEnd, '#2a2244')
        : safeHex(customConfig.cardBg, '#262434');
      const primary = safeHex(customConfig.primary, '#7567c7');
      const secondary = safeHex(customConfig.secondary, '#38bdf8');
      const lum = getHexLuminance(pageBg);
      const isDaylight = lum >= 130;

      profile = {
        theme,
        isDaylight,
        roomBg: isDaylight ? '#1b2230' : '#080c17',
        fogColor: isDaylight ? '#232c3d' : '#0b101d',
        fogDensity: isDaylight ? 0.03 : 0.044,
        skyTop: startHex,
        skyBottom: endHex,
        horizonGlow: secondary,
        celestialBody: isDaylight ? 'sun' : 'moon',
        celestialColor: isDaylight ? '#fff6e0' : '#dbeafe',
        silhouetteColor: isDaylight ? '#364354' : '#0c111e',
        glassTint: secondary,
        glassOpacity: 0.15,
        hemiSkyColor: isDaylight ? '#dbe8fa' : secondary,
        hemiGroundColor: isDaylight ? '#4d3526' : '#2a1b13',
        hemiIntensity: isDaylight ? 1.12 : 0.94,
        dirLightColor: isDaylight ? '#fff1db' : '#b7cdf2',
        dirLightIntensity: isDaylight ? 1.82 : 1.48,
        shaftColor: primary,
        shaftOpacity: 0.046,
        envIntensity: isDaylight ? 0.42 : 0.36,
        weatherMode: 'none',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: primary,
        particleSecondary: secondary,
        accentHex: primary,
        lampColor,
        lampIntensity: baseLampIntensity,
      };
      break;
    }

    case 'dark':
    default:
      profile = {
        theme: 'dark',
        isDaylight: false,
        roomBg: '#080d18',
        fogColor: '#0b1120',
        fogDensity: 0.044,
        skyTop: '#0a1224',
        skyBottom: '#1c2b48',
        horizonGlow: '#7797c9',
        celestialBody: 'moon',
        celestialColor: '#dceaff',
        silhouetteColor: '#0b1220',
        glassTint: '#8eb3ec',
        glassOpacity: 0.15,
        hemiSkyColor: '#8eb3ec',
        hemiGroundColor: '#2c1c13',
        hemiIntensity: 0.94,
        dirLightColor: '#9dc0f5',
        dirLightIntensity: lanternWarmth ? 1.4 : 1.78,
        shaftColor: '#8bb1eb',
        shaftOpacity: 0.044,
        envIntensity: 0.36,
        weatherMode: 'none',
        effectiveRainIntensity: effectiveRain,
        particlePrimary: '#d6bd8a',
        particleSecondary: '#88aee8',
        accentHex: '#7567c7',
        lampColor,
        lampIntensity: baseLampIntensity,
      };
      break;
  }

  // Independent rain intensity slider overrides exterior rain when active (> 0)
  if (effectiveRain > 0) {
    profile = {
      ...profile,
      weatherMode: 'rain',
      effectiveRainIntensity: effectiveRain,
      skyTop: '#0a1426',
      skyBottom: '#203452',
      glassTint: '#7dd3fc',
      glassOpacity: 0.17 + effectiveRain * 0.015,
      dirLightColor: '#8dc6ef',
      dirLightIntensity: Math.min(profile.dirLightIntensity, 1.38),
      shaftOpacity: 0.036,
      particlePrimary: '#7dd3fc',
      particleSecondary: '#e0f2fe',
    };
  }

  return profile;
}
