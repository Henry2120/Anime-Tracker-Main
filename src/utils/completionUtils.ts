import type {
  MalListItem,
  MalAnimeNode,
  ReleaseCalendarItem,
  AnimeAiringState,
  AnimeCompletionInfo,
} from '../types';
import { getResolvedTimezone } from './calendarUtils';

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

// Standard episode broadcast runtime window in seconds (30 minutes)
const EPISODE_BROADCAST_WINDOW_SEC = 1800;

/**
 * Formats a unix timestamp in seconds to a YYYY-MM-DD date key in the specified timezone
 */
function getDateKeyInTz(epochSec: number, tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date(epochSec * 1000));
    const m: Record<string, string> = {};
    for (const p of parts) m[p.type] = p.value;
    return `${m.year}-${m.month}-${m.day}`;
  } catch {
    return new Date(epochSec * 1000).toISOString().slice(0, 10);
  }
}

/**
 * Formats a unix timestamp in seconds to a short date string (e.g. 'Sep 18') in the specified timezone
 */
function formatShortDateInTz(epochSec: number, tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
    });
    return formatter.format(new Date(epochSec * 1000));
  } catch {
    const d = new Date(epochSec * 1000);
    return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
  }
}

/**
 * Formats a unix timestamp in seconds to a 24-hour time string (e.g. '23:30') in the specified timezone
 */
function formatTimeInTz(epochSec: number, tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(new Date(epochSec * 1000));
  } catch {
    const d = new Date(epochSec * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Visual styling configuration for each airing state.
 */
export function getBadgeStyles(state: AnimeAiringState): {
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
    case 'final_episode_today':
      return {
        stateLabel: 'Final Episode Today',
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-600 dark:text-amber-400',
        badgeBorder: 'border-amber-500/30',
        dotColor: 'bg-amber-500',
      };
    case 'final_episode':
      return {
        stateLabel: 'Final Episode',
        badgeBg: 'bg-[#7567C7]/15',
        badgeText: 'text-[#7567C7] dark:text-[#C5BEF7]',
        badgeBorder: 'border-[#7567C7]/30',
        dotColor: 'bg-[#7567C7]',
      };
    case 'airing':
      return {
        stateLabel: 'Airing Now',
        badgeBg: 'bg-emerald-500/15',
        badgeText: 'text-emerald-600 dark:text-emerald-400',
        badgeBorder: 'border-emerald-500/30',
        dotColor: 'bg-emerald-500 animate-pulse',
      };
    case 'scheduled':
      return {
        stateLabel: 'Scheduled',
        badgeBg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
        badgeText: 'text-indigo-600 dark:text-indigo-400',
        badgeBorder: 'border-indigo-500/25',
        dotColor: 'bg-indigo-500',
      };
    case 'ongoing':
      return {
        stateLabel: 'Ongoing',
        badgeBg: 'bg-blue-500/15',
        badgeText: 'text-blue-600 dark:text-blue-400',
        badgeBorder: 'border-blue-500/30',
        dotColor: 'bg-blue-500',
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
        badgeBg: 'bg-cyan-500/15',
        badgeText: 'text-cyan-600 dark:text-cyan-400',
        badgeBorder: 'border-cyan-500/30',
        dotColor: 'bg-cyan-500',
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
 * Distinguishes:
 * - 'airing': Episode is currently broadcasting live within its scheduled broadcast window right now.
 * - 'scheduled': Anime has a confirmed upcoming episode, but it is not currently broadcasting.
 * - 'ongoing': MAL confirms the anime is currently airing, but there is currently no confirmed upcoming calendar episode.
 * - 'final_episode': Next confirmed episode is reliably known to be the final episode (future date).
 * - 'final_episode_today': Final episode is scheduled for today and has not finished broadcasting.
 * - 'completed': Final episode broadcast has finished or MAL officially indicates finished airing.
 * - 'returning': Cour has finished but reliable data indicates the anime will return in a future cour/season.
 * - 'delayed': Actual reliable evidence of delay exists (not used as fallback for currently_airing).
 * - 'unknown': Data is insufficient to determine state reliably.
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
      nextEpisodeNumber: null,
      nextEpisodeAiringAt: null,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
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
      nextEpisodeNumber: null,
      nextEpisodeAiringAt: null,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
      reason: 'Missing anime node metadata',
    };
  }

  const nowSec = Math.floor(refTimeMs / 1000);
  const userTz = getResolvedTimezone('local');
  const todayDateKey = getDateKeyInTz(nowSec, userTz);

  // Match calendar items for this anime
  const effectiveCalendar =
    calendarItems && calendarItems.length > 0 ? calendarItems : getCachedCalendarItems();
  const animeCalendar = effectiveCalendar
    .filter((c) => c.malId === node.id)
    .sort((a, b) => a.airingAt - b.airingAt);

  // Derive total episodes: MAL node or calendar metadata
  let totalEpisodes: number | null =
    typeof node.num_episodes === 'number' && node.num_episodes > 0 ? node.num_episodes : null;
  if (totalEpisodes === null) {
    const calWithTotal = animeCalendar.find(
      (c) => typeof c.totalEpisodes === 'number' && c.totalEpisodes > 0
    );
    if (calWithTotal && calWithTotal.totalEpisodes) {
      totalEpisodes = calWithTotal.totalEpisodes;
    }
  }

  const userWatchedEpisodes =
    typeof listStatus?.num_episodes_watched === 'number' ? listStatus.num_episodes_watched : 0;
  const normalizedMalStatus = (node.status || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

  // Categorize episodes by broadcast status
  const pastCalendarEps = animeCalendar.filter(
    (c) => c.airingAt + EPISODE_BROADCAST_WINDOW_SEC <= nowSec
  );
  const liveCalendarEps = animeCalendar.filter(
    (c) => nowSec >= c.airingAt && nowSec < c.airingAt + EPISODE_BROADCAST_WINDOW_SEC
  );
  const futureCalendarEps = animeCalendar.filter((c) => c.airingAt > nowSec);

  const isBroadcastingNow = liveCalendarEps.length > 0;
  const nextEp = isBroadcastingNow
    ? liveCalendarEps[0]
    : futureCalendarEps.length > 0
    ? futureCalendarEps[0]
    : null;

  const maxAiredCalendarEp =
    pastCalendarEps.length > 0 ? Math.max(...pastCalendarEps.map((c) => c.episode || 0)) : null;

  let episodesAired: number | null = maxAiredCalendarEp;
  if (normalizedMalStatus === 'finished_airing' && totalEpisodes !== null) {
    episodesAired = totalEpisodes;
  }

  // Next episode details
  const nextEpisodeNumber = nextEp?.episode ?? null;
  const nextEpisodeAiringAt = nextEp?.airingAt ?? null;
  const nextEpDateKey = nextEp ? getDateKeyInTz(nextEp.airingAt, userTz) : null;
  const isNextEpToday = Boolean(nextEp && nextEpDateKey === todayDateKey);
  const formattedNextAirDate = nextEp ? formatShortDateInTz(nextEp.airingAt, userTz) : null;
  const formattedNextAirTime = nextEp ? formatTimeInTz(nextEp.airingAt, userTz) : null;

  // Final Episode Check - STRICTLY EVIDENCE-BASED (NO GUESSING)
  // Only true if totalEpisodes is confirmed (>0) AND next episode equals totalEpisodes
  // AND no calendar schedule exists with episode > totalEpisodes
  const hasSubsequentEpisodes =
    totalEpisodes !== null &&
    animeCalendar.some((c) => typeof c.episode === 'number' && c.episode > totalEpisodes);

  const isFinalEpisode = Boolean(
    nextEp &&
    typeof nextEp.episode === 'number' &&
    totalEpisodes !== null &&
    totalEpisodes > 0 &&
    nextEp.episode === totalEpisodes &&
    !hasSubsequentEpisodes &&
    normalizedMalStatus !== 'finished_airing'
  );

  const isFinalEpisodeToday = Boolean(isFinalEpisode && isNextEpToday);

  // 1. Check Split-Cour / Returning anime
  // Check if calendar has a scheduled return after a notable hiatus (> 35 days, e.g. next season)
  const isCalendarReturning = Boolean(
    nextEp && nextEp.airingAt - nowSec > 35 * 86400
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
      nextEpisodeNumber,
      nextEpisodeAiringAt,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Scheduled to return in a future broadcast cour',
    };
  }

  // 2. Check Completed state (Broadcast run finished)
  // A. MAL officially reports finished_airing
  const isMalFinished = normalizedMalStatus === 'finished_airing';

  // B. Final episode has aired and its broadcast window has passed
  const isFinalEpisodeAired = Boolean(
    totalEpisodes !== null &&
    ((isFinalEpisode && nextEp && nextEp.airingAt + EPISODE_BROADCAST_WINDOW_SEC <= nowSec) ||
     (pastCalendarEps.some((c) => c.episode === totalEpisodes) && futureCalendarEps.length === 0 && !isBroadcastingNow))
  );

  // C. Reached total episodes in past calendar and no future episodes exist
  const isTotalEpisodesAired = Boolean(
    totalEpisodes !== null &&
    episodesAired !== null &&
    episodesAired >= totalEpisodes &&
    futureCalendarEps.length === 0 &&
    !isBroadcastingNow
  );

  // D. End date has occurred in the past with no future scheduled episodes
  const isEndDatePassed = Boolean(
    node.end_date &&
    node.end_date <= todayDateKey &&
    futureCalendarEps.length === 0 &&
    !isBroadcastingNow &&
    (totalEpisodes === null || (episodesAired !== null && episodesAired >= totalEpisodes) || totalEpisodes <= 1)
  );

  if (isMalFinished || isFinalEpisodeAired || isTotalEpisodesAired || isEndDatePassed) {
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
      stateLabel: 'Season Complete',
      isCompleted: true,
      isReadyToSummarize: Boolean(userProgressComplete),
      userProgressComplete: Boolean(userProgressComplete),
      episodesAired: totalEpisodes || episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber: null,
      nextEpisodeAiringAt: null,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
      reason: isMalFinished
        ? 'MAL officially indicates finished airing'
        : isFinalEpisodeAired || isTotalEpisodesAired
        ? 'Final episode broadcast run has completed'
        : 'Broadcast end date has passed',
    };
  }

  // 3. Check Split-Cour first-half completion with announced return
  if (
    hasSplitCourMetadata &&
    (titleAndDesc.includes('part 1') || titleAndDesc.includes('cour 1') || titleAndDesc.includes('part i')) &&
    totalEpisodes !== null &&
    episodesAired !== null &&
    episodesAired >= totalEpisodes
  ) {
    const styles = getBadgeStyles('returning');
    const userProgressComplete = userWatchedEpisodes >= totalEpisodes;

    return {
      state: 'returning',
      ...styles,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber,
      nextEpisodeAiringAt,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Finished initial cour; returning in an upcoming cour',
    };
  }

  // 4. Final Episode Today (Scheduled for today, before or during broadcast)
  if (isFinalEpisode && isNextEpToday) {
    if (isBroadcastingNow) {
      const styles = getBadgeStyles('airing');
      return {
        state: 'airing',
        ...styles,
        stateLabel: 'Final Episode — Airing Now',
        isCompleted: false,
        isReadyToSummarize: false,
        userProgressComplete: false,
        episodesAired,
        totalEpisodes,
        userWatchedEpisodes,
        nextEpisodeNumber,
        nextEpisodeAiringAt,
        isFinalEpisode: true,
        isFinalEpisodeToday: true,
        formattedNextAirDate,
        formattedNextAirTime,
        reason: 'Final episode is currently broadcasting live',
      };
    }

    const styles = getBadgeStyles('final_episode_today');
    const stateLabel = formattedNextAirTime
      ? `Final Episode — Today at ${formattedNextAirTime}`
      : 'Final Episode Today';

    return {
      state: 'final_episode_today',
      ...styles,
      stateLabel,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber,
      nextEpisodeAiringAt,
      isFinalEpisode: true,
      isFinalEpisodeToday: true,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Final episode scheduled for broadcast today',
    };
  }

  // 5. Final Episode (Scheduled on an upcoming date after today)
  if (isFinalEpisode && !isNextEpToday) {
    const styles = getBadgeStyles('final_episode');
    const stateLabel = formattedNextAirDate
      ? `Final Episode — ${formattedNextAirDate}`
      : 'Final Episode';

    return {
      state: 'final_episode',
      ...styles,
      stateLabel,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber,
      nextEpisodeAiringAt,
      isFinalEpisode: true,
      isFinalEpisodeToday: false,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: `Final episode scheduled for ${formattedNextAirDate || 'upcoming date'}`,
    };
  }

  // 6. Actively Airing (Episode is currently broadcasting live within its scheduled window)
  if (isBroadcastingNow) {
    const styles = getBadgeStyles('airing');
    return {
      state: 'airing',
      ...styles,
      stateLabel: 'Airing Now',
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber,
      nextEpisodeAiringAt,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Episode is currently within its scheduled broadcast window',
    };
  }

  // 7. Scheduled (Normal continuing anime with upcoming episode)
  if (nextEp !== null) {
    const styles = getBadgeStyles('scheduled');
    const stateLabel = isNextEpToday
      ? formattedNextAirTime
        ? `Next episode: Today at ${formattedNextAirTime}`
        : 'Next episode: Today'
      : formattedNextAirDate
      ? `Next episode: ${formattedNextAirDate}`
      : 'Scheduled';

    return {
      state: 'scheduled',
      ...styles,
      stateLabel,
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber,
      nextEpisodeAiringAt,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: `Upcoming episode scheduled on ${formattedNextAirDate || 'release calendar'}`,
    };
  }

  // 8. Ongoing (MAL confirms the anime is currently airing, but there is currently no confirmed upcoming calendar episode)
  if (normalizedMalStatus === 'currently_airing') {
    const styles = getBadgeStyles('ongoing');
    return {
      state: 'ongoing',
      ...styles,
      stateLabel: 'Ongoing',
      isCompleted: false,
      isReadyToSummarize: false,
      userProgressComplete: false,
      episodesAired,
      totalEpisodes,
      userWatchedEpisodes,
      nextEpisodeNumber: null,
      nextEpisodeAiringAt: null,
      isFinalEpisode: false,
      isFinalEpisodeToday: false,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
      reason: 'MAL confirms anime is currently airing, but no confirmed upcoming calendar episode',
    };
  }

  // 9. Unknown fallback
  const styles = getBadgeStyles('unknown');
  const userProgressComplete =
    totalEpisodes !== null
      ? userWatchedEpisodes >= totalEpisodes
      : listStatus?.status === 'completed';

  return {
    state: 'unknown',
    ...styles,
    stateLabel: 'Unknown',
    isCompleted: false,
    isReadyToSummarize: false,
    userProgressComplete: Boolean(userProgressComplete),
    episodesAired,
    totalEpisodes,
    userWatchedEpisodes,
    nextEpisodeNumber: null,
    nextEpisodeAiringAt: null,
    isFinalEpisode: false,
    isFinalEpisodeToday: false,
    formattedNextAirDate: null,
    formattedNextAirTime: null,
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
  finalEpisodeUpcomingCount: number;
  finalEpisodeTodayCount: number;
  scheduledCount: number;
  ongoingCount: number;
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
  let finalEpisodeUpcomingCount = 0;
  let finalEpisodeTodayCount = 0;
  let scheduledCount = 0;
  let ongoingCount = 0;
  let delayedCount = 0;
  let returningCount = 0;
  let unknownCount = 0;

  for (const item of items) {
    const info = getAnimeAiringState(item, calendarItems);
    if (info.isCompleted) finishedCount++;
    if (info.isReadyToSummarize) readyToSummarizeCount++;

    if (info.state === 'airing') {
      airingCount++;
      if (info.isFinalEpisodeToday) {
        finalEpisodeTodayCount++;
      }
    } else if (info.state === 'final_episode_today') {
      finalEpisodeTodayCount++;
    } else if (info.state === 'final_episode') {
      finalEpisodeUpcomingCount++;
    } else if (info.state === 'scheduled') {
      scheduledCount++;
    } else if (info.state === 'ongoing') {
      ongoingCount++;
    } else if (info.state === 'delayed') {
      delayedCount++;
    } else if (info.state === 'returning') {
      returningCount++;
    } else if (info.state === 'unknown') {
      unknownCount++;
    }
  }

  return {
    total: items.length,
    finishedCount,
    readyToSummarizeCount,
    airingCount,
    finalEpisodeUpcomingCount,
    finalEpisodeTodayCount,
    scheduledCount,
    ongoingCount,
    delayedCount,
    returningCount,
    unknownCount,
  };
}
