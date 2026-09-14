import type {
  MalListItem,
  MalAnimeNode,
  ReleaseCalendarItem,
  AnimeAiringState,
  AnimeCompletionInfo,
} from '../types';

// In-memory cache for loaded release calendar items
let memoryCachedCalendarItems: ReleaseCalendarItem[] = [];

/**
 * Stores loaded calendar items into shared memory cache.
 * Avoids any redundant network requests across components.
 */
export function setCachedCalendarItems(items: ReleaseCalendarItem[]): void {
  if (Array.isArray(items) && items.length > 0) {
    memoryCachedCalendarItems = items;
  }
}

/**
 * Retrieves cached calendar items.
 */
export function getCachedCalendarItems(): ReleaseCalendarItem[] {
  return memoryCachedCalendarItems;
}

/**
 * Visual styling configuration for each airing state.
 */
function getBadgeStyles(state: AnimeAiringState): {
  stateLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
} {
  switch (state) {
    case 'completed':
      return {
        stateLabel: 'Season Complete',
        badgeBg: 'bg-[#7567C7]/15',
        badgeText: 'text-[#7567C7] dark:text-[#C5BEF7]',
        badgeBorder: 'border-[#7567C7]/30',
        dotColor: 'bg-[#7567C7]',
      };
    case 'airing':
      return {
        stateLabel: 'Airing',
        badgeBg: 'bg-emerald-500/15',
        badgeText: 'text-emerald-600 dark:text-emerald-400',
        badgeBorder: 'border-emerald-500/30',
        dotColor: 'bg-emerald-500',
      };
    case 'delayed':
      return {
        stateLabel: 'Delayed',
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-600 dark:text-amber-400',
        badgeBorder: 'border-amber-500/30',
        dotColor: 'bg-amber-500',
      };
    case 'returning':
      return {
        stateLabel: 'Returning',
        badgeBg: 'bg-orange-500/15',
        badgeText: 'text-orange-600 dark:text-orange-400',
        badgeBorder: 'border-orange-500/30',
        dotColor: 'bg-orange-500',
      };
    case 'unknown':
    default:
      return {
        stateLabel: 'Unknown',
        badgeBg: 'bg-[#77747D]/15',
        badgeText: 'text-[#77747D] dark:text-[#A4A1AA]',
        badgeBorder: 'border-[#77747D]/30',
        dotColor: 'bg-[#77747D]',
      };
  }
}

/**
 * Single source of truth function for determining an anime's broadcast airing & completion state.
 *
 * Reuses existing MAL metadata and Release Calendar schedules without introducing any secondary
 * data fetching or hard-coded assumptions about episode lengths (12, 13, 24, etc.).
 *
 * Broadcast state (anime completion) is kept strictly separate from personal user watching progress.
 */
export function getAnimeAiringState(
  item: MalListItem | MalAnimeNode | { node: MalAnimeNode; list_status?: any } | null | undefined,
  calendarItems?: ReleaseCalendarItem[],
  refTimeMs: number = Date.now()
): AnimeCompletionInfo {
  // Safe fallback for null/undefined or malformed records
  if (!item) {
    const styles = getBadgeStyles('unknown');
    return {
      state: 'unknown',
      ...styles,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired: null,
      totalEpisodes: null,
      userWatchedEpisodes: 0,
      reason: 'No anime item provided',
    };
  }

  const node: MalAnimeNode = ('node' in item && item.node) ? item.node : (item as MalAnimeNode);
  const listStatus = ('list_status' in item && item.list_status) ? item.list_status : undefined;

  if (!node || !node.id) {
    const styles = getBadgeStyles('unknown');
    return {
      state: 'unknown',
      ...styles,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired: null,
      totalEpisodes: null,
      userWatchedEpisodes: 0,
      reason: 'Missing anime node metadata',
    };
  }

  const nowSec = Math.floor(refTimeMs / 1000);
  const todayDateStr = new Date(refTimeMs).toISOString().slice(0, 10);

  const totalEpisodes =
    typeof node.num_episodes === 'number' && node.num_episodes > 0 ? node.num_episodes : null;
  const userWatchedEpisodes =
    typeof listStatus?.num_episodes_watched === 'number' ? listStatus.num_episodes_watched : 0;
  const normalizedMalStatus = (node.status || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

  // Match calendar items for this anime
  const effectiveCalendar =
    calendarItems && calendarItems.length > 0 ? calendarItems : getCachedCalendarItems();
  const animeCalendar = effectiveCalendar.filter((c) => c.malId === node.id);

  // Past (aired) and future (scheduled upcoming) calendar items
  const pastCalendarEps = animeCalendar.filter((c) => c.airingAt <= nowSec + 3600);
  const futureCalendarEps = animeCalendar.filter((c) => c.airingAt > nowSec + 3600);

  const maxAiredCalendarEp =
    pastCalendarEps.length > 0 ? Math.max(...pastCalendarEps.map((c) => c.episode || 0)) : null;
  const nextAiringAt =
    futureCalendarEps.length > 0 ? Math.min(...futureCalendarEps.map((c) => c.airingAt)) : null;

  let episodesAired: number | null = maxAiredCalendarEp;
  if (normalizedMalStatus === 'finished_airing' && totalEpisodes !== null) {
    episodesAired = totalEpisodes;
  }

  // 1. Check Split-Cour / Returning anime
  // Check if calendar has a scheduled return after a notable hiatus (> 35 days, e.g. next season)
  const isCalendarReturning = Boolean(
    nextAiringAt && nextAiringAt - nowSec > 35 * 86400
  );

  // Check if MAL metadata explicitly indicates a split cour or second cour
  const titleAndDesc = `${node.title || ''} ${node.alternative_titles?.en || ''} ${node.synopsis || ''}`.toLowerCase();
  const hasSplitCourMetadata =
    titleAndDesc.includes('split-cour') ||
    titleAndDesc.includes('split cour') ||
    titleAndDesc.includes('2nd cour') ||
    titleAndDesc.includes('second cour') ||
    titleAndDesc.includes('part 2') ||
    titleAndDesc.includes('part ii') ||
    titleAndDesc.includes('cour 2');

  if (isCalendarReturning) {
    const styles = getBadgeStyles('returning');
    const userProgressComplete =
      totalEpisodes !== null
        ? userWatchedEpisodes >= totalEpisodes
        : episodesAired !== null && episodesAired > 0
        ? userWatchedEpisodes >= episodesAired
        : listStatus?.status === 'completed';

    return {
      state: 'returning',
      ...styles,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      reason: 'Scheduled to return in a future broadcast cour',
    };
  }

  // 2. Check Airing state (Calendar has an upcoming scheduled episode in the near schedule)
  // If another episode is scheduled within standard broadcasting range (<= 35 days), it is actively airing
  if (futureCalendarEps.length > 0) {
    const styles = getBadgeStyles('airing');
    const userProgressComplete =
      totalEpisodes !== null
        ? userWatchedEpisodes >= totalEpisodes
        : episodesAired !== null && episodesAired > 0
        ? userWatchedEpisodes >= episodesAired
        : false;

    return {
      state: 'airing',
      ...styles,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      reason: 'Upcoming episode scheduled on release calendar',
    };
  }

  // 3. Check Returning state for finished first-cour with announced sequel/part 2
  if (hasSplitCourMetadata && (normalizedMalStatus === 'finished_airing' || (totalEpisodes && episodesAired && episodesAired >= totalEpisodes))) {
    // If the title explicitly says "Part 1" / "Cour 1" or synopsis confirms returning next season
    if (titleAndDesc.includes('part 1') || titleAndDesc.includes('cour 1') || titleAndDesc.includes('part i')) {
      const styles = getBadgeStyles('returning');
      const userProgressComplete =
        totalEpisodes !== null
          ? userWatchedEpisodes >= totalEpisodes
          : episodesAired !== null && episodesAired > 0
          ? userWatchedEpisodes >= episodesAired
          : listStatus?.status === 'completed';

      return {
        state: 'returning',
        ...styles,
        isCompleted: false,
        isReadyToSummarize: false,
        userProgressComplete,
        episodesAired,
        totalEpisodes,
        userWatchedEpisodes,
        reason: 'Finished initial cour; returning in an upcoming cour',
      };
    }
  }

  // 4. Check Completed state
  // A. MAL officially reports finished_airing
  if (normalizedMalStatus === 'finished_airing') {
    const styles = getBadgeStyles('completed');
    const userProgressComplete =
      totalEpisodes !== null
        ? userWatchedEpisodes >= totalEpisodes
        : episodesAired !== null && episodesAired > 0
        ? userWatchedEpisodes >= episodesAired
        : listStatus?.status === 'completed';

    return {
      state: 'completed',
      ...styles,
      isCompleted: true,
      isReadyToSummarize: userProgressComplete,
      userProgressComplete,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      reason: 'MAL officially indicates finished airing',
    };
  }

  // B. End date has occurred in the past with no future scheduled episodes
  if (node.end_date && node.end_date <= todayDateStr && futureCalendarEps.length === 0) {
    if (totalEpisodes === null || (episodesAired !== null && episodesAired >= totalEpisodes) || totalEpisodes <= 1) {
      const styles = getBadgeStyles('completed');
      const userProgressComplete =
        totalEpisodes !== null
          ? userWatchedEpisodes >= totalEpisodes
          : episodesAired !== null && episodesAired > 0
          ? userWatchedEpisodes >= episodesAired
          : listStatus?.status === 'completed';

      return {
        state: 'completed',
        ...styles,
        isCompleted: true,
        isReadyToSummarize: userProgressComplete,
        userProgressComplete,
        episodesAired,
        totalEpisodes,
        userWatchedEpisodes,
        reason: 'Broadcast end date passed and no future episodes scheduled',
      };
    }
  }

  // C. Reached known total episodes and final episode aired at least 24 hours ago
  if (
    totalEpisodes !== null &&
    episodesAired !== null &&
    episodesAired >= totalEpisodes &&
    futureCalendarEps.length === 0
  ) {
    const styles = getBadgeStyles('completed');
    const userProgressComplete = userWatchedEpisodes >= totalEpisodes;

    return {
      state: 'completed',
      ...styles,
      isCompleted: true,
      isReadyToSummarize: userProgressComplete,
      userProgressComplete,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      reason: 'Reached total episode count with no further scheduled episodes',
    };
  }

  // 5. Check Delayed state
  // If MAL reports currently_airing, but the anime has not finished, and there is no upcoming episode in the calendar
  if (normalizedMalStatus === 'currently_airing') {
    const styles = getBadgeStyles('delayed');
    const userProgressComplete =
      totalEpisodes !== null ? userWatchedEpisodes >= totalEpisodes : false;

    return {
      state: 'delayed',
      ...styles,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      reason: 'Currently airing on MAL but temporarily has no upcoming episode scheduled',
    };
  }

  // 6. Unknown fallback
  const styles = getBadgeStyles('unknown');
  const userProgressComplete =
    totalEpisodes !== null
      ? userWatchedEpisodes >= totalEpisodes
      : listStatus?.status === 'completed';

  return {
    state: 'unknown',
    ...styles,
    isCompleted: false,
    isReadyToSummarize: false,
    userProgressComplete,
    episodesAired,
    totalEpisodes,
    userWatchedEpisodes,
    reason: 'Airing status cannot be determined reliably from available data',
  };
}

/**
 * Summary metrics for seasonal completion.
 */
export interface SeasonCompletionStats {
  total: number;
  finishedCount: number;
  readyToSummarizeCount: number;
  airingCount: number;
  delayedCount: number;
  returningCount: number;
  unknownCount: number;
}

/**
 * Calculates aggregate season completion statistics for a list of anime items.
 */
export function getSeasonCompletionStats(
  items: (MalListItem | { node: MalAnimeNode; list_status?: any })[],
  calendarItems?: ReleaseCalendarItem[]
): SeasonCompletionStats {
  let finishedCount = 0;
  let readyToSummarizeCount = 0;
  let airingCount = 0;
  let delayedCount = 0;
  let returningCount = 0;
  let unknownCount = 0;

  for (const item of items) {
    const info = getAnimeAiringState(item, calendarItems);
    if (info.isCompleted) finishedCount++;
    if (info.isReadyToSummarize) readyToSummarizeCount++;
    if (info.state === 'airing') airingCount++;
    else if (info.state === 'delayed') delayedCount++;
    else if (info.state === 'returning') returningCount++;
    else if (info.state === 'unknown') unknownCount++;
  }

  return {
    total: items.length,
    finishedCount,
    readyToSummarizeCount,
    airingCount,
    delayedCount,
    returningCount,
    unknownCount,
  };
}
