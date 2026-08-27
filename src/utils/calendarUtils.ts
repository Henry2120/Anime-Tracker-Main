import type { ReleaseCalendarItem, DaySchedule } from '../types';

export interface TimezoneOption {
  id: string;
  label: string;
  group: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: 'local', label: 'Browser / Local Time', group: 'Default' },
  { id: 'UTC', label: 'UTC (Universal Time)', group: 'Universal' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)', group: 'Asia & Pacific' },
  { id: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh / Bangkok (ICT, UTC+7)', group: 'Asia & Pacific' },
  { id: 'Asia/Singapore', label: 'Singapore / Manila / HK (SGT, UTC+8)', group: 'Asia & Pacific' },
  { id: 'Asia/Seoul', label: 'Seoul (KST, UTC+9)', group: 'Asia & Pacific' },
  { id: 'Asia/Kolkata', label: 'Kolkata / Mumbai (IST, UTC+5:30)', group: 'Asia & Pacific' },
  { id: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)', group: 'Middle East' },
  { id: 'Australia/Sydney', label: 'Sydney / Melbourne (AEST, UTC+10)', group: 'Asia & Pacific' },
  { id: 'Pacific/Auckland', label: 'Auckland (NZST, UTC+12)', group: 'Asia & Pacific' },
  { id: 'America/Los_Angeles', label: 'Los Angeles / Pacific (PT, UTC-7/8)', group: 'Americas' },
  { id: 'America/Denver', label: 'Denver / Mountain (MT, UTC-6/7)', group: 'Americas' },
  { id: 'America/Chicago', label: 'Chicago / Central (CT, UTC-5/6)', group: 'Americas' },
  { id: 'America/New_York', label: 'New York / Eastern (ET, UTC-4/5)', group: 'Americas' },
  { id: 'America/Sao_Paulo', label: 'São Paulo (BRT, UTC-3)', group: 'Americas' },
  { id: 'Europe/London', label: 'London / Dublin (GMT/BST, UTC+0/1)', group: 'Europe' },
  { id: 'Europe/Paris', label: 'Paris / Berlin / Rome (CET, UTC+1/2)', group: 'Europe' },
  { id: 'Europe/Athens', label: 'Athens / Helsinki / Cairo (EET, UTC+2/3)', group: 'Europe' },
];

/**
 * Resolves 'local' to the browser's IANA timezone
 */
export function getResolvedTimezone(tzInput: string): string {
  if (!tzInput || tzInput === 'local') {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
  return tzInput;
}

/**
 * Calculates the 7 calendar days (Monday to Sunday) for the given reference timestamp & week offset in the specified timezone
 */
export function getWeekScheduleSlots(
  referenceTimestampMs: number,
  timeZoneInput: string,
  weekOffset: number = 0
): {
  days: DaySchedule[];
  weekLabel: string;
  fetchStartSec: number;
  fetchEndSec: number;
  resolvedTimezone: string;
} {
  const resolvedTimezone = getResolvedTimezone(timeZoneInput);
  const now = new Date(referenceTimestampMs);

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });

  const parts = tzFormatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDayIndex = weekdays.indexOf(partMap.weekday);
  const diffToMonday = (currentDayIndex + 6) % 7;

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);

  const baseUtc = Date.UTC(year, month - 1, day);
  const mondayUtc = baseUtc - diffToMonday * 86400000 + weekOffset * 7 * 86400000;

  const days: DaySchedule[] = [];
  const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(mondayUtc + i * 86400000);
    const dYear = dayUtc.getUTCFullYear();
    const dMonth = String(dayUtc.getUTCMonth() + 1).padStart(2, '0');
    const dDay = String(dayUtc.getUTCDate()).padStart(2, '0');
    const dateKey = `${dYear}-${dMonth}-${dDay}`;

    days.push({
      dateKey,
      weekday: dayNames[i],
      dayNum: parseInt(dDay, 10).toString(),
      monthName: dayUtc.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      year: dYear,
      items: [],
    });
  }

  const firstDay = days[0];
  const lastDay = days[6];
  const weekLabel = `${firstDay.dayNum} ${firstDay.monthName} – ${lastDay.dayNum} ${lastDay.monthName} ${lastDay.year}`;

  // Broad buffer around the week in seconds to ensure all timezone overlaps are captured
  const fetchStartSec = Math.floor((mondayUtc - 86400000 * 2) / 1000);
  const fetchEndSec = Math.floor((mondayUtc + 86400000 * 9) / 1000);

  return {
    days,
    weekLabel,
    fetchStartSec,
    fetchEndSec,
    resolvedTimezone,
  };
}

/**
 * Normalizes title according to user request:
 * if (english title exists and is not empty) use English title
 * else use Japanese/native title (with fallback to userPreferred or romaji)
 */
export function getAnimeDisplayTitle(titleObj?: {
  english?: string | null;
  native?: string | null;
  romaji?: string | null;
  userPreferred?: string | null;
}): string {
  if (!titleObj) return 'Unknown Title';
  if (titleObj.english && titleObj.english.trim().length > 0) {
    return titleObj.english.trim();
  }
  if (titleObj.native && titleObj.native.trim().length > 0) {
    return titleObj.native.trim();
  }
  if (titleObj.userPreferred && titleObj.userPreferred.trim().length > 0) {
    return titleObj.userPreferred.trim();
  }
  if (titleObj.romaji && titleObj.romaji.trim().length > 0) {
    return titleObj.romaji.trim();
  }
  return 'Unknown Title';
}

/**
 * Checks if an airing schedule item is upcoming (scheduled in the future relative to current time).
 * Uses physical UTC airing timestamp vs current time, regardless of client timezone.
 */
export function isAiringUpcoming(
  airingAtSec?: number | null,
  currentTimestampMs: number = Date.now()
): boolean {
  if (!airingAtSec || typeof airingAtSec !== 'number') return false;
  return airingAtSec * 1000 > currentTimestampMs;
}

/**
 * Generates a concise human-readable relative countdown string for upcoming releases (e.g. 'in 3h 24m', 'in 45m', 'in 2d').
 */
export function getUpcomingCountdown(
  airingAtSec?: number | null,
  currentTimestampMs: number = Date.now()
): string | null {
  if (!airingAtSec || typeof airingAtSec !== 'number') return null;
  const diffMs = airingAtSec * 1000 - currentTimestampMs;
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `in ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `in ${minutes}m`;
  }
  return 'in <1m';
}

/**
 * Distributes raw release schedule items into day columns based on the selected timezone
 * and flags items currently in the user's MAL 'watching' list as well as upcoming status.
 */
export function populateDaySchedules(
  items: ReleaseCalendarItem[],
  days: DaySchedule[],
  timeZoneInput: string,
  watchingMalIds: Set<number>,
  currentTimestampMs: number = Date.now()
): DaySchedule[] {
  const resolvedTimezone = getResolvedTimezone(timeZoneInput);

  // Clone day schedule slots
  const resultDays: DaySchedule[] = days.map((d) => ({
    ...d,
    items: [],
  }));

  const dayMap = new Map<string, DaySchedule>();
  for (const day of resultDays) {
    dayMap.set(day.dateKey, day);
  }

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  for (const item of items) {
    if (!item.airingAt) continue;

    const itemDate = new Date(item.airingAt * 1000);
    const parts = timeFormatter.formatToParts(itemDate);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const dateKey = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const formattedTime = `${partMap.hour}:${partMap.minute} ${partMap.dayPeriod || ''}`.trim();

    const targetDay = dayMap.get(dateKey);
    if (targetDay) {
      const itemMalId = item.malId ? Number(item.malId) : null;
      const isWatching = Boolean(itemMalId && watchingMalIds.has(itemMalId));
      const displayTitle = getAnimeDisplayTitle(item.title);
      targetDay.items.push({
        ...item,
        displayTitle,
        formattedTime,
        isWatching,
        isUpcoming: false,
        countdown: null,
      });
    }
  }

  // Sort items inside each day chronologically by airingAt
  for (const day of resultDays) {
    day.items.sort((a, b) => a.airingAt - b.airingAt);
  }

  return resultDays;
}

/**
 * Calculates a single DaySchedule slot for TODAY in the specified timezone
 */
export function getTodayScheduleSlot(
  referenceTimestampMs: number,
  timeZoneInput: string
): DaySchedule {
  const resolvedTimezone = getResolvedTimezone(timeZoneInput);
  const now = new Date(referenceTimestampMs);

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = tzFormatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const weekdayUpper = (partMap.weekday || 'TODAY').toUpperCase();
  const dYear = parseInt(partMap.year, 10);
  const dMonth = partMap.month;
  const dDay = partMap.day;
  const dateKey = `${dYear}-${dMonth}-${dDay}`;

  // Month short name
  const monthDate = new Date(Date.UTC(dYear, parseInt(dMonth, 10) - 1, parseInt(dDay, 10)));
  const monthName = monthDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

  return {
    dateKey,
    weekday: weekdayUpper,
    dayNum: parseInt(dDay, 10).toString(),
    monthName,
    year: dYear,
    items: [],
  };
}

/**
 * Checks if a release item has a usable English title in normalized metadata.
 * A title counts as usable when it exists, is not empty, and is not just whitespace.
 */
export function hasEnglishTitle(item: {
  hasEnglishTitle?: boolean;
  titleEnglish?: string | null;
  title?: { english?: string | null };
}): boolean {
  if (typeof item.hasEnglishTitle === 'boolean') {
    return item.hasEnglishTitle;
  }
  if (typeof item.titleEnglish === 'string' && item.titleEnglish.trim().length > 0) {
    return true;
  }
  if (typeof item.title?.english === 'string' && item.title.english.trim().length > 0) {
    return true;
  }
  return false;
}

/**
 * Checks if a release item is a known long-running anime (total known episodes >= 27).
 * Unknown episode counts (null, undefined, 0, "?") are treated as NOT long-running (kept visible).
 */
export function isLongRunning(item: {
  totalEpisodes?: number | null;
}): boolean {
  const episodes = item.totalEpisodes;
  if (episodes === null || episodes === undefined) {
    return false;
  }
  if (typeof episodes === 'number' && episodes > 0) {
    return episodes >= 27;
  }
  return false;
}

/**
 * Determines if a release item should be hidden under the 'hideLongRunning' filter.
 * Rule:
 * - If anime is NOT long-running (episodes < 27 or unknown) -> KEEP (return false)
 * - If anime IS long-running (episodes >= 27) AND user IS watching -> KEEP (return false) (Watching OVERRIDES long-running)
 * - If anime IS long-running (episodes >= 27) AND user is NOT watching -> HIDE (return true)
 */
export function shouldHideLongRunning(item: {
  totalEpisodes?: number | null;
  isWatching?: boolean;
}): boolean {
  if (item.isWatching) {
    return false;
  }
  return isLongRunning(item);
}

/**
 * Checks if a release calendar item matches a search query across titles and MAL ID
 */
export function matchesReleaseSearch(
  item: {
    title?: { english?: string; native?: string; romaji?: string; userPreferred?: string };
    displayTitle?: string;
    malId?: number | null;
    studio?: string | null;
  },
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchableValues = [
    item.displayTitle,
    item.title?.english,
    item.title?.native,
    item.title?.romaji,
    item.title?.userPreferred,
    item.malId !== null && item.malId !== undefined ? String(item.malId) : '',
    item.studio,
  ];

  return searchableValues.some(
    (val) => Boolean(val) && val!.toLowerCase().includes(normalizedQuery)
  );
}

/**
 * Composable filter function for calendar items
 */
export function filterCalendarItems<
  T extends ReleaseCalendarItem & { isWatching?: boolean; displayTitle?: string }
>(
  items: T[],
  filters: {
    watchingOnly?: boolean;
    hideWithoutEnglishTitle?: boolean;
    hideLongRunning?: boolean;
    searchTerm?: string;
  }
): T[] {
  const trimmedSearch = filters.searchTerm?.trim().toLowerCase() || '';

  return items.filter((item) => {
    // 1. Personal: Watching Only
    if (filters.watchingOnly && !item.isWatching) {
      return false;
    }

    // 2. Content: Hide titles without English title (Watching does NOT override this)
    if (filters.hideWithoutEnglishTitle && !hasEnglishTitle(item)) {
      return false;
    }

    // 3. Content: Hide long-running anime (episodes >= 27, but Watching OVERRIDES this)
    if (filters.hideLongRunning && shouldHideLongRunning(item)) {
      return false;
    }

    // 4. Keyword Search
    if (trimmedSearch && !matchesReleaseSearch(item, trimmedSearch)) {
      return false;
    }

    return true;
  });
}
