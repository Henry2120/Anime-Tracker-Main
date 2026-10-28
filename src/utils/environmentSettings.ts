/**
 * User Settings for the Music-Reactive Environment in AniVerse.
 * Controls whether Hina Piano music playback triggers the special starry sky and ground changes.
 */

export const STORAGE_MUSIC_REACTIVE_ENV_KEY = 'aniverse_music_reactive_env_enabled';
export const MUSIC_REACTIVE_ENV_EVENT = 'aniverse_music_reactive_env_changed';

/**
 * Loads the Music-Reactive Environment setting from localStorage.
 * Default is ON (true) for new and existing users who have no saved value.
 */
export function loadMusicReactiveEnvSetting(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const raw = localStorage.getItem(STORAGE_MUSIC_REACTIVE_ENV_KEY);
    // Missing value is safely treated as ON
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

/**
 * Saves the Music-Reactive Environment setting to localStorage and dispatches a sync event.
 */
export function saveMusicReactiveEnvSetting(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_MUSIC_REACTIVE_ENV_KEY, String(enabled));
    window.dispatchEvent(
      new CustomEvent(MUSIC_REACTIVE_ENV_EVENT, { detail: { enabled } })
    );
  } catch (err) {
    console.warn('[MusicReactiveEnv] Failed to persist setting to localStorage:', err);
  }
}
