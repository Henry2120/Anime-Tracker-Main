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
  currentVersion: 'v3.0',
  tagline: 'Your anime. Your season. Your story.',
  history: [
    {
      version: 'v3.0',
      date: 'September 2026',
      changes: [
        'Added Two-Way MyAnimeList Management: Edit watch status, episode progress, scores, start/finish dates, rewatching, and notes directly in AniVerse.',
        'Real-time MyAnimeList synchronization powered by secure OAuth 2.0 PKCE with MAL as the single source of truth.',
        'Added Quick Episode increment (+1) shortcuts across My List, My Season, and detail views.',
        'Added comprehensive MAL Entry Editor with status pills, rating breakdown, date pickers, and live sync feedback.',
        'Direct MAL Comments sync for storing personal thoughts and watch logs without maintaining external spreadsheets.',
        'AniVerse is now a complete two-way MyAnimeList viewer, analytics engine, and list manager.',
        'Removed Herobrine.',
      ],
    },
    {
      version: 'v2.3',
      date: 'September 2026',
      changes: [
        'Added a complete Dark Mode experience across AniVerse.',
        'Improved dark-mode coverage across the entire application, including layouts, containers, borders, navigation, calendar areas, and page backgrounds.',
        'Added the new MAL profile menu with profile information, connection status, tracked-anime count, MyAnimeList access, and logout controls.',
        'Improved responsive navigation and overall interface consistency.',
        'Refined the dark-theme layout to eliminate unwanted light/white areas and ensure the dark canvas properly covers the application.',
      ],
    },
    {
      version: 'v2.2',
      date: 'September 2026',
      changes: [
        'Improved Release Calendar reliability with MyAnimeList broadcast data as a fallback when AniList data is unavailable or incomplete.',
        'Improved episode scheduling and broadcast-date handling.',
        'Added caching and fallback mechanisms for more reliable release information.',
        'Improved seasonal data reliability and Summer 2026 tracking.',
        'Fixed an anime that was somehow airing at 25:00.',
      ],
    },
    {
      version: 'v2.1',
      date: 'September 2026',
      changes: [
        'Added Season Review, a personalized Summer 2026 season recap.',
        'Added Anime of the Season rankings and podium.',
        'Added favorites and biggest disappointment sections.',
        'Added season awards and watching-style insights.',
        'Added biggest surprise and final season verdict.',
        'Improved personalized seasonal statistics and analysis based on the user\'s MAL activity.',
        'The Summer 2026 season has been successfully contained.',
      ],
    },
    {
      version: 'v2.0',
      date: 'August 30, 2026',
      changes: [
        'Added the AniVerse product demo video to the homepage.',
        'The demo video narrator was prevented from breaking the fourth wall.',
      ],
    },
    {
      version: 'v1.0',
      date: 'August 2026',
      changes: [
        'Initial AniVerse release with MyAnimeList integration, MY SEASON, Release Calendar, Statistics, AI Insights, and the original landing page.',
      ],
    },
  ],
};
