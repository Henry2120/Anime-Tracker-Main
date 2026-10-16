import { AppTheme } from '../types/theme';

export interface WeatherData {
  theme: AppTheme;
  conditionText: string;
  temp?: number;
  isDay: boolean;
  timestamp: number;
  locationLabel?: string;
}

const WEATHER_CACHE_KEY = 'aniverse_weather_cache';
const WEATHER_CACHE_TTL = 20 * 60 * 1000; // 20 minutes

/**
 * Maps WMO standard weather code to one of our AniVerse themes
 */
export function mapWeatherCodeToTheme(
  weatherCode: number,
  isDay: boolean
): { theme: AppTheme; conditionText: string } {
  // Clear sky
  if (weatherCode === 0 || weatherCode === 1) {
    return {
      theme: isDay ? 'sunny' : 'starlight',
      conditionText: isDay ? 'Clear Sky' : 'Starry Night',
    };
  }

  // Fog or Overcast / Cloudy
  if (weatherCode === 2 || weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
    return {
      theme: 'cloudy',
      conditionText: weatherCode >= 45 ? 'Misty / Fog' : 'Overcast',
    };
  }

  // Rain, Drizzle, Rain showers, Thunderstorms
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    (weatherCode >= 95 && weatherCode <= 99)
  ) {
    return {
      theme: 'rain',
      conditionText: weatherCode >= 95 ? 'Thunderstorm' : 'Rainy Weather',
    };
  }

  // Snow, Snow grains, Snow showers
  if (
    (weatherCode >= 71 && weatherCode <= 77) ||
    (weatherCode >= 85 && weatherCode <= 86)
  ) {
    return {
      theme: 'snow',
      conditionText: 'Snowfall',
    };
  }

  // Default fallback based on day/night
  return {
    theme: isDay ? 'sunny' : 'starlight',
    conditionText: isDay ? 'Daytime' : 'Nighttime',
  };
}

/**
 * Gets cached weather data if still valid
 */
export function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed: WeatherData = JSON.parse(raw);
    if (Date.now() - parsed.timestamp < WEATHER_CACHE_TTL) {
      return parsed;
    }
  } catch {
    // Ignore parse or storage errors
  }
  return null;
}

/**
 * Saves weather data to localStorage cache
 */
export function setCachedWeather(data: WeatherData): void {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Fetches current weather for given coordinates via internal API or direct Open-Meteo
 */
export async function fetchLiveWeather(lat: number, lon: number): Promise<WeatherData> {
  // Check memory/local cache first
  const cached = getCachedWeather();
  if (cached) {
    return cached;
  }

  try {
    // Primary: fetch through local backend proxy
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const result: WeatherData = {
          theme: data.theme,
          conditionText: data.conditionText,
          temp: data.temp,
          isDay: data.isDay,
          timestamp: Date.now(),
        };
        setCachedWeather(result);
        return result;
      }
    }
  } catch (err) {
    console.warn('[LiveWeather] Backend proxy attempt failed, trying direct Open-Meteo:', err);
  }

  // Fallback: direct browser fetch to Open-Meteo (CORS-friendly public API)
  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const response = await fetch(openMeteoUrl);
  if (!response.ok) {
    throw new Error(`Weather service responded with status ${response.status}`);
  }

  const json: any = await response.json();
  const current = json.current || {};
  const weatherCode = current.weather_code ?? 0;
  const isDay = current.is_day === 1;
  const temp = current.temperature_2m;

  const { theme, conditionText } = mapWeatherCodeToTheme(weatherCode, isDay);
  const result: WeatherData = {
    theme,
    conditionText,
    temp,
    isDay,
    timestamp: Date.now(),
  };

  setCachedWeather(result);
  return result;
}

/**
 * Request user geolocation with reasonable timeout
 */
export function requestUserCoordinates(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      return reject(new Error('Geolocation is not supported by your browser.'));
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        let msg = 'Failed to retrieve location.';
        if (err.code === 1) msg = 'Location access denied.';
        else if (err.code === 2) msg = 'Location position unavailable.';
        else if (err.code === 3) msg = 'Location request timed out.';
        reject(new Error(msg));
      },
      {
        timeout: 10000,
        maximumAge: 15 * 60 * 1000,
        enableHighAccuracy: false,
      }
    );
  });
}
