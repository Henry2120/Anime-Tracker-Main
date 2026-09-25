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
  currentVersion: 'v4.8',
  tagline: 'Your anime. Your season. Your story.',
  history: [
    {
      version: 'v4.8',
      title: 'Fall 2026 Season Support',
      date: 'September 2026',
      description:
        'Added Fall 2026 to MY SEASON with the same seasonal tracking, episode, airing, and calendar functionality used by previous seasons.',
      changes: [
        'Added Fall 2026 to the SeasonSelector alongside Spring 2026 and Summer 2026.',
        'Connected Fall 2026 seasonal catalogue and fallback metadata pipeline via Jikan API.',
        'Integrated Fall 2026 Watching, Completed, and Season Completion metrics with existing Release Calendar indexing.',
        'Enabled Excel Export and Season Review for Fall 2026.',
      ],
    },
    {
      version: 'v4.7',
      title: 'Performance & Progressive Calendar Engine',
      date: 'September 2026',
      description:
        'Comprehensive performance optimization pass across AniVerse. Implemented progressive Release Calendar row rendering with IntersectionObserver, deferred background enrichment, React transitions for non-urgent updates, memoized seasonal table and calendar cards, dynamic 7-week rolling calendar window, image decoding optimizations, and instant data/image reuse on MY SEASON tab switching.',
      changes: [
        'Added progressive Release Calendar row rendering using IntersectionObserver with subtle staggered card animations.',
        'Reduced initial calendar DOM footprint by rendering an initial 4-row batch with automatic progressive reveal on scroll.',
        'Dynamic 7-week calendar rolling-window data handling with improved merging and coverage.',
        'Optimized MY SEASON with instant first-paint architecture and cached state reuse on tab revisits.',
        'Eliminated image reload flash and lazy-load layout stutter across seasonal table views using eager async image decoding.',
        'Extracted and memoized SeasonTableRow and CalendarPosterCard components to prevent cascade re-renders.',
        'Added deferred task scheduler (scheduleDeferredTask) with requestIdleCallback and requestAnimationFrame fallbacks for non-critical background enrichment.',
        'Wrapped secondary seasonal data loading and fallback state updates in React.startTransition.',
        'Optimized airing and completion state detection with indexed O(1) calendar lookups.',
        'Refactored AniList API request pipeline with deduplicated queries, bounded concurrency, and memory caching.',
      ],
      easterEgg: 'The calendar now loads faster than anime characters can power up.',
    },
    {
      version: 'v4.6',
      title: 'Top 500 Celebration Easter Egg',
      date: 'September 2026',
      description:
        'Added a hidden interactive celebration Easter egg to commemorate AniVerse being selected in the Top 500 of the AI Riser Vietnam 2026 contest.',
      changes: [
        'Added a hidden smartphone-style dialer to the homepage as a temporary Easter egg.',
        'Added a secret number sequence that triggers the Top 500 celebration experience.',
        'Added a small in-phone manual/help system accessible through *0#, allowing users to discover how the dialer works without revealing the celebration number.',
        'Added subtle hints to encourage visitors to experiment with the phone without explicitly revealing the secret sequence.',
        'Added a full-screen celebratory transformation with Sakura-inspired visual effects and achievement messaging.',
        'Added the AI Riser Vietnam 2026 Top 500 certificate as part of the celebration.',
        'Kept the entire feature isolated behind the existing temporary frontend feature flag.',
      ],
      easterEgg: 'Some numbers have a story behind them.',
    },
    {
      version: 'v4.5',
      title: 'Expanded Release Calendar & Card Display Toggles',
      date: 'September 2026',
      description:
        'Substantially expanded the Release Calendar layout into a spacious, full-width weekly dashboard with larger 7-day columns, taller poster proportions (aspect-[3/4.5]), and dedicated Card Display toggles (Time, Title, Episode, Studio) inside the Filter menu.',
      changes: [
        'Expanded calendar container to use available desktop viewport with streamlined 40–60px outer margins.',
        'Widened 7-day schedule columns naturally using responsive repeat(7, minmax(0, 1fr)) grid layout.',
        'Slightly extended anime poster cards vertically to an elegant aspect-[3/4.5] ratio while maintaining balanced artwork framing.',
        'Added dedicated Display toggles in the Filter menu for Time (default ON), Title (default ON), Episode (default OFF), and Studio (default OFF) with local preference persistence.',
        'Engineered structurally stable anime card positioning where Time, Title, Episode, and Studio toggles preserve exact card geometry, row heights, and separator alignment without layout jumps.',
        'Added days-remaining countdown for confirmed upcoming final episodes in MY SEASON (e.g., "Final Episode — Sep 26 · 7 days left") based on scheduled broadcast timestamps regardless of user watch progress.',
        'Preserved existing mobile and tablet responsive layouts without horizontal overflow.',
      ],
      easterEgg: 'More space for more anime. Exactly how it should be.',
    },
    {
      version: 'v4.4',
      title: 'Anime Completion Detection',
      date: 'September 2026',
      description:
        'Added intelligent anime airing-status detection so AniVerse can identify upcoming final episodes and completed seasonal anime, distinguishing between live broadcasts, scheduled episodes, ongoing runs, and returning split-cours.',
      changes: [
        'Added reusable airing/completion-state detection with strict live "Airing Now" and "Scheduled" separation.',
        'Replaced false "Delayed" fallbacks with a neutral "Ongoing" status when MAL confirms airing without an upcoming calendar date.',
        'Added reliable final-episode detection when supported by available broadcast data.',
        'Added Final Episode / Final Episode Today indicators with exact broadcast times when known.',
        'Updated visual cues: bright blue for Ongoing and bright cyan for Returning continuation.',
        'Kept broadcast completion separate from the user\'s personal watch progress.',
      ],
      easterEgg:
        '12 episodes? 13? 24? AniVerse has stopped guessing.',
    },
    {
      version: 'v4.3',
      title: 'Season Navigation & Data Polish',
      date: 'September 2026',
      description:
        'Improved Excel chart output and introduced streamlined season selection across MY SEASON and Season Review.',
      changes: [
        'Removed unnecessary Number of Anime and Top Genre Distribution charts from the Excel export.',
        'Added scalable season selection to MY SEASON.',
        'Added the same streamlined season selection experience to Season Review.',
      ],
      easterEgg:
        'There are now enough seasons that clicking \'next\' started to feel like a full-time job.',
    },
    {
      version: 'v4.2',
      title: 'Personal Data Export',
      date: 'September 2026',
      description:
        'Added the Excel export capability. AniVerse can now export the user\'s anime-tracking data into spreadsheet format so the information can be kept, analyzed, or used outside AniVerse.',
      easterEgg: 'Finally, your anime addiction can be opened in Excel.',
    },
    {
      version: 'v4.1',
      title: 'Seasonal Archive & Historical Viewing',
      date: 'September 2026',
      description:
        'Expanded seasonal tracking so users can move between supported 2026 seasons and view the anime associated with the selected season. Includes historical season selection, viewing anime from the selected season, currently-watching and completed anime for that season, keeping season-specific data separated so anime from another season do not incorrectly appear, and historical release-calendar viewing for older periods.',
      easterEgg: 'Time travel is finally supported, but only for anime release dates.',
    },
    {
      version: 'v4.0',
      title: 'Anime Details & Discovery',
      date: 'September 2026',
      description:
        'Enhanced anime information and discovery. Users can open anime details from relevant anime views to see title information, images, scores, episode progress, status, dates, synopsis, genres, season information, studio/source information when available, and personal notes/comments when available. Also adds the ability to discover/search anime from the MyAnimeList catalogue and add titles to the user\'s list.',
      easterEgg: 'AniVerse now knows more about the anime than the person watching it.',
    },
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
