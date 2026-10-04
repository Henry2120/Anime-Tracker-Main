/**
 * Global Application Feature Flags
 *
 * MUSIC_LAB_ENABLED:
 * Set to false to completely isolate and disable Music Lab during Anime Tracker debugging/development.
 * When false:
 * - Music Lab navigation, switcher options, and promotional UI are hidden.
 * - Heavy 3D, WebGL, Web Audio, VRM, and Three.js dependencies are NOT initialized or downloaded.
 * - Bundle chunks remain strictly separated and dormant.
 *
 * To re-enable Music Lab later, simply set this flag to `true`.
 */
export const MUSIC_LAB_ENABLED = false;
