export interface VersionEntry {
  version: string;
  title?: string;
  date: string;
  description: string;
  easterEgg?: string;
  changes?: string[];
}

export interface AppVersionInfo {
  currentVersion: string;
  tagline: string;
  history: VersionEntry[];
}

export const APP_VERSION_INFO: AppVersionInfo = {
  currentVersion: 'v3.1',
  tagline: 'Your anime. Your season. Your story.',
  history: [
    {
      version: 'v3.3',
      title: 'MAL Sync & Reliability',
      date: 'Upcoming',
      description:
        'Improved MAL synchronization and reliability. Strengthened synchronization, API error handling, duplicate protection, and recovery from temporary MAL issues.',
      easterEgg: 'MAL has been informed that AniVerse is watching.',
    },
    {
      version: 'v3.2',
      title: 'MAL Management Polish',
      date: 'September 2026',
      description:
        'Improved MAL management experience. Refined search, adding, editing, loading states, empty states, and overall interaction quality.',
      easterEgg: 'The buttons have been instructed to behave normally.',
    },
    {
      version: 'v3.1',
      title: 'MAL Anime Search & Add',
      date: 'September 2026',
      description:
        'Added MAL Anime Search & Add. Search the MyAnimeList catalogue directly from MY LIST and add anime that are not currently in your collection.',
      easterEgg: 'Some anime were missing because nobody had invited them.',
    },
    {
      version: 'v3.0',
      title: 'MAL List Management',
      date: 'September 2026',
      description:
        'Added MAL List Management. AniVerse can now manage your MyAnimeList entries directly, including status, episodes, scores, dates, priority, notes, and completion.',
      easterEgg: 'AniVerse now has permission to touch your anime.',
    },
    {
      version: 'v2.3',
      title: 'Dark Mode Experience',
      date: 'September 2026',
      description:
        'Added a complete Dark Mode experience across layouts, navigation, and calendar areas, plus the new MAL profile menu.',
      easterEgg: 'Dark Mode has been contained within the viewport.',
    },
    {
      version: 'v2.2',
      title: 'Release Calendar Reliability',
      date: 'September 2026',
      description:
        'Improved Release Calendar reliability with MyAnimeList broadcast data fallback, episode scheduling, and release caching.',
      easterEgg: 'Fixed an anime that was somehow airing at 25:00.',
    },
    {
      version: 'v2.1',
      title: 'Season Review',
      date: 'September 2026',
      description:
        'Added Season Review, a personalized Summer 2026 season recap with Anime of the Season rankings, awards, and watching-style insights.',
      easterEgg: 'The Summer 2026 season has been successfully contained.',
    },
    {
      version: 'v2.0',
      title: 'Product Showcase',
      date: 'August 30, 2026',
      description:
        'Added the AniVerse product demo video and interactive feature walkthrough to the homepage.',
      easterEgg: 'The demo video narrator was prevented from breaking the fourth wall.',
    },
    {
      version: 'v1.0',
      title: 'Initial Release',
      date: 'August 2026',
      description:
        'Initial AniVerse launch with MyAnimeList integration, MY SEASON tracking, Release Calendar, Statistics, and AI Insights.',
    },
  ],
};
