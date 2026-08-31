export interface VersionEntry {
  version: string;
  date: string;
  changes: string[];
}

export interface AppVersionInfo {
  currentVersion: string;
  tagline: string;
  history: VersionEntry[];
}

export const APP_VERSION_INFO: AppVersionInfo = {
  currentVersion: 'v2.0',
  tagline: 'Your anime. Your season. Your story.',
  history: [
    {
      version: 'v2.0',
      date: 'August 30, 2026',
      changes: [
        'Added the AniVerse product demo video to the homepage.',
      ],
    },
    {
      version: 'v1.0',
      date: 'August 2026',
      changes: [
        'Initial AniVerse release with MAL integration, MY SEASON, Release Calendar, Statistics, AI Insights, and the original landing page.',
      ],
    },
  ],
};
