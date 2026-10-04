import type { ReleaseCalendarItem } from '../types';
import { setCachedCalendarItems } from './completionUtils';

export interface JikanSeasonalAnime {
  mal_id: number;
  title: string;
  images?: any;
  score?: number;
  episodes?: number;
  season?: string;
  year?: number;
  aired?: any;
}

export interface JikanSeasonResponse {
  year: number;
  season: string;
  data: JikanSeasonalAnime[];
}

export interface JikanAnimeResponse {
  mal_id: number;
  title?: string;
  year?: number;
  season?: string;
  start_date?: string;
  is_summer_2026: boolean;
}

/**
 * Returns standard MAL season name for a given month (1-12)
 */
export function getSeasonFromMonth(month: number): 'winter' | 'spring' | 'summer' | 'fall' {
  if (month >= 1 && month <= 3) return 'winter';
  if (month >= 4 && month <= 6) return 'spring';
  if (month >= 7 && month <= 9) return 'summer';
  return 'fall';
}

/**
 * Parses date string (e.g. "2026-06-18" or "2026-07") into year and season
 */
export function parseSeasonFromDate(dateStr?: string | null): { year: number; season: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})(?:[-/](\d{1,2}))?/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (!isNaN(year) && year >= 1900 && year <= 2100) {
      if (match[2]) {
        const month = parseInt(match[2], 10);
        if (!isNaN(month) && month >= 1 && month <= 12) {
          return { year, season: getSeasonFromMonth(month) };
        }
      }
      return { year, season: 'unknown' };
    }
  }
  return null;
}

/**
 * Normalizes any MAL/ISO date string to a comparable standard YYYY-MM-DD string.
 * Returns null if missing or invalid.
 */
export function parseDateToComparable(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);
  if (!match) return null;
  const year = match[1];
  const month = match[2] ? match[2].padStart(2, '0') : '01';
  const day = match[3] ? match[3].padStart(2, '0') : '01';
  return `${year}-${month}-${day}`;
}

/**
 * Returns the immediately preceding seasonal period for any target year and season.
 * E.g. (2026, 'summer') -> { year: 2026, season: 'spring' }
 * E.g. (2026, 'winter') -> { year: 2025, season: 'fall' }
 */
export function getPreviousSeason(year: number, season: string): { year: number; season: string } {
  const norm = season.toLowerCase();
  switch (norm) {
    case 'winter':
      return { year: year - 1, season: 'fall' };
    case 'spring':
      return { year: year, season: 'winter' };
    case 'summer':
      return { year: year, season: 'spring' };
    case 'fall':
      return { year: year, season: 'summer' };
    default:
      return { year: year, season: 'spring' };
  }
}

export interface SeasonPeriod {
  year: number;
  season: 'winter' | 'spring' | 'summer' | 'fall';
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  prevSeasonYear: number;
  prevSeason: string;
}

/**
 * Identifies whether a MAL database entry is explicitly a promotional video / character teaser / commercial
 * rather than a legitimate anime work (TV series, movie, OVA, ONA, special, animated short, etc.).
 *
 * Excluded examples:
 * - Character Teasers / Character PVs (e.g. "Genshin Impact: Character Teasers", "Yuanshen: Juese PVs")
 * - Character Anecdotes (e.g. "Genshin Impact: Character Anecdotes", "Yuanshen: Juese Yiwen")
 * - Promotional Videos / Teasers / CMs (e.g. "Promotional Video", "Teaser PV", "Web CM", "Official Trailer")
 *
 * Preserved examples:
 * - Animated Shorts (e.g. "Genshin Impact: Animated Shorts", "Yuanshen: Donghua Duanpian")
 * - TV, ONA, OVA, Movie, Special, Short narrative anime works.
 */
export function isPromotionalOrVideoOnlyEntry(itemOrNode: any): boolean {
  if (!itemOrNode) return false;
  const node = itemOrNode.node || itemOrNode;

  // 1. Explicit MAL media type indicating non-narrative promotional / commercial
  const mediaType = (node.media_type || node.type || '').toLowerCase();
  if (mediaType === 'pv' || mediaType === 'cm') {
    return true;
  }

  // Collect all available title strings
  const titles: string[] = [];
  if (typeof node.title === 'string') titles.push(node.title);
  if (node.alternative_titles) {
    if (typeof node.alternative_titles.en === 'string') titles.push(node.alternative_titles.en);
    if (typeof node.alternative_titles.ja === 'string') titles.push(node.alternative_titles.ja);
    if (Array.isArray(node.alternative_titles.synonyms)) {
      for (const s of node.alternative_titles.synonyms) {
        if (typeof s === 'string') titles.push(s);
      }
    }
  }

  // 2. Strong promotional video / character teaser patterns
  // Specifically matches character teasers, character PV collections, character anecdotes, promotional PVs, trailers, CMs
  const promoPattern = /\b(?:character\s+(?:teaser|pv)s?|character\s+anecdotes?|juese\s+(?:pv|pvs|yiwen)|promotional\s+(?:video|pv)s?|official\s+trailer|main\s+trailer|teaser\s+trailer|web\s+cm|animated\s+cm)\b/i;

  for (const t of titles) {
    if (promoPattern.test(t)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the exact calendar boundary date range and metadata for any seasonal period.
 * Summer 2026: 2026-07-01 to 2026-09-30
 * Fall 2026: 2026-10-01 to 2026-12-31
 * Spring 2026: 2026-04-01 to 2026-06-30
 * Winter 2026: 2026-01-01 to 2026-03-31
 */
export function getSeasonPeriod(year: number, season: string): SeasonPeriod {
  const normSeason = (season || 'summer').trim().toLowerCase() as 'winter' | 'spring' | 'summer' | 'fall';
  const prev = getPreviousSeason(year, normSeason);
  switch (normSeason) {
    case 'winter':
      return {
        year,
        season: 'winter',
        startDate: `${year}-01-01`,
        endDate: `${year}-03-31`,
        prevSeasonYear: prev.year,
        prevSeason: prev.season,
      };
    case 'spring':
      return {
        year,
        season: 'spring',
        startDate: `${year}-04-01`,
        endDate: `${year}-06-30`,
        prevSeasonYear: prev.year,
        prevSeason: prev.season,
      };
    case 'summer':
      return {
        year,
        season: 'summer',
        startDate: `${year}-07-01`,
        endDate: `${year}-09-30`,
        prevSeasonYear: prev.year,
        prevSeason: prev.season,
      };
    case 'fall':
    default:
      return {
        year,
        season: 'fall',
        startDate: `${year}-10-01`,
        endDate: `${year}-12-31`,
        prevSeasonYear: prev.year,
        prevSeason: prev.season,
      };
  }
}

/**
 * Checks whether an anime node belongs to a specific broadcast debut season (e.g. Summer 2026, Spring 2026).
 * Priority Order:
 * 1. MAL start_season metadata (authoritative)
 * 2. Verified Jikan seasonal debut catalogue IDs / individual Jikan fallback IDs
 * 3. Parsed season from anime's broadcast start date (node.start_date, node.aired.from)
 */
export function isAnimeInSeason(
  node?: any,
  targetYear: number = 2026,
  targetSeason: string = 'summer',
  jikanSeasonIds?: Set<number>
): boolean {
  if (!node) return false;

  const targetSeasonLower = targetSeason.trim().toLowerCase();

  // 1. Authoritative MAL start_season metadata (e.g. { year: 2026, season: "summer" })
  if (node.start_season && typeof node.start_season === 'object') {
    const year = Number(node.start_season.year);
    const season =
      typeof node.start_season.season === 'string'
        ? node.start_season.season.trim().toLowerCase()
        : '';
    if (!isNaN(year) && season) {
      return year === targetYear && season === targetSeasonLower;
    }
  }

  // 2. Fallback for missing start_season: check verified Jikan seasonal debut catalogue / fallback IDs
  if (node.id && jikanSeasonIds && jikanSeasonIds.has(node.id)) {
    return true;
  }

  // 3. Fallback: Check if broadcast start_date provides valid seasonal debut info
  const startDateStr = node.start_date || node.aired?.from || node.release_date;
  if (startDateStr) {
    const parsed = parseSeasonFromDate(startDateStr);
    if (parsed && parsed.year === targetYear && parsed.season.toLowerCase() === targetSeasonLower) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a MAL anime node strictly belongs to Summer 2026
 * Formula: start_season.year === 2026 && start_season.season === "summer" (with fallbacks)
 */
export function isAnimeSummer2026(node?: any, jikanSummerIds?: Set<number>): boolean {
  return isAnimeInSeason(node, 2026, 'summer', jikanSummerIds);
}

/**
 * Checks if a MAL anime node strictly belongs to Spring 2026
 * Formula: start_season.year === 2026 && start_season.season === "spring" (with fallbacks)
 */
export function isAnimeSpring2026(node?: any, jikanSpringIds?: Set<number>): boolean {
  return isAnimeInSeason(node, 2026, 'spring', jikanSpringIds);
}

/**
 * Checks if a MAL anime node strictly belongs to Fall 2026
 * Formula: start_season.year === 2026 && start_season.season === "fall" (with fallbacks)
 */
export function isAnimeFall2026(node?: any, jikanFallIds?: Set<number>): boolean {
  return isAnimeInSeason(node, 2026, 'fall', jikanFallIds);
}

/**
 * Extracts the anime's actual first-episode airing date / broadcast start date (NOT personal user start date).
 * Checks node.start_date, node.aired.from, node.release_date.
 */
export function getAnimeFirstEpisodeAiringDate(itemOrNode?: any): string | null {
  if (!itemOrNode) return null;
  const node = itemOrNode.node || itemOrNode;
  const rawDate = node.start_date || node.aired?.from || node.release_date || itemOrNode.start_date;
  return parseDateToComparable(rawDate);
}

/**
 * Step 2: Among currently-watching anime of the target season, finds the anime whose FIRST EPISODE AIRED EARLIEST.
 * Uses the anime's actual airing/start date (node.start_date) — NOT personal MAL list_status.start_date.
 * Returns null if no valid airing dates are found (does not invent fallback dates).
 */
export function getEarliestFirstEpisodeAiringDate(
  watchingAnimeList: Array<{ node?: any; list_status?: any } | any>
): string | null {
  if (!Array.isArray(watchingAnimeList) || watchingAnimeList.length === 0) {
    return null;
  }

  let earliest: string | null = null;

  for (const item of watchingAnimeList) {
    const airingDate = getAnimeFirstEpisodeAiringDate(item);
    if (!airingDate) continue;

    if (!earliest || airingDate < earliest) {
      earliest = airingDate;
    }
  }

  return earliest;
}

/**
 * Alias for backward compatibility if referenced elsewhere
 */
export const getEarliestPersonalStartDate = getEarliestFirstEpisodeAiringDate;

/**
 * Determines whether a completed anime belongs to the target seasonal tracking period:
 * 1. MAL list_status.status must be 'completed'
 * 2. If finish_date is specified (e.g. '2026-09-29'):
 *    - Must fall within the target season calendar boundary [startDate, endDate] inclusive
 *      (e.g., Summer 2026: 2026-07-01 through 2026-09-30; Fall 2026: 2026-10-01 through 2026-12-31).
 *    - An anime does NOT need to have a debut in the target season to qualify if completed in this window
 *      (e.g., Spring 2026 anime or older backlog anime finished in Summer 2026 belongs to Summer 2026 completed).
 * 3. If finish_date is not specified:
 *    - Qualifies if the anime itself debuted in the target season (isAnimeInSeason).
 */
export function isAnimeCompletedInSeason(
  item: any,
  targetYear: number = 2026,
  targetSeason: string = 'summer',
  earliestFirstEpisodeAiringDate: string | null = null,
  targetCatalogueIds?: Set<number>,
  prevSeasonCatalogueIds?: Set<number>
): boolean {
  if (!item) return false;
  const listStatus = item.list_status || item;
  if (!listStatus) return false;

  // 1. Must have completed status
  if (listStatus.status !== 'completed') return false;

  const node = item.node || item;
  if (!node?.id) return false;

  // 2. Exclude explicitly promotional / video-only database entries
  if (isPromotionalOrVideoOnlyEntry(node)) {
    return false;
  }

  const normSeason = targetSeason.trim().toLowerCase();
  const period = getSeasonPeriod(targetYear, normSeason);
  const finishDate = parseDateToComparable(listStatus.finish_date);

  // 3. If finish date is specified:
  // Must fall strictly within the seasonal window [startDate, endDate] inclusive
  if (finishDate) {
    return finishDate >= period.startDate && finishDate <= period.endDate;
  }

  // 4. If no finish date is specified, only include if the anime itself debuted in this target season
  return isAnimeInSeason(node, targetYear, normSeason, targetCatalogueIds);
}

/**
 * Determines whether a currently-watching anime belongs to or carries over into the target season.
 *
 * Rules:
 * 1. Promotional / Video-Only database entries are excluded.
 * 2. MAL list_status.status must strictly be 'watching'.
 * 3. Target Season Debut:
 *    - An anime that debuted in the target season (e.g. Fall 2026 debut) and has status 'watching'
 *      is INCLUDED (regardless of watched episode count, e.g. 0/? or 0/12).
 * 4. Future Debut Exclusion:
 *    - An anime debuting in a future season (e.g. Winter 2027 when target is Fall 2026) cannot appear in an earlier season.
 * 5. Previous Season Airing Continuity (e.g., Spring/Summer 2026 shows for Fall 2026):
 *    - An older anime ONLY carries over if it was airing during Summer 2026 AND is STILL AIRING during Fall 2026.
 *    - If an older anime's airing has ALREADY ENDED (e.g. finished airing in September or end_date <= 2026-09-30),
 *      it MUST NOT carry over into Fall 2026 simply because the user has unwatched episodes.
 *      It remains associated with its original season.
 */
export function isAnimeWatchingInSeason(
  item: any,
  targetYear: number = 2026,
  targetSeason: string = 'summer',
  targetCatalogueIds?: Set<number>,
  calendarAiringIds?: Set<number>
): boolean {
  if (!item) return false;
  const listStatus = item.list_status || item;
  if (!listStatus || listStatus.status !== 'watching') return false;

  const node = item.node || item;
  if (!node?.id) return false;

  // 1. Exclude explicitly promotional / video-only database entries
  if (isPromotionalOrVideoOnlyEntry(node)) {
    return false;
  }

  const normSeason = targetSeason.trim().toLowerCase();
  const period = getSeasonPeriod(targetYear, normSeason);

  // 2. Current season debut
  const isCurrentSeason = isAnimeInSeason(node, targetYear, normSeason, targetCatalogueIds);
  if (isCurrentSeason) {
    return true;
  }

  // 3. Prevent future-season anime from appearing in past/earlier seasons
  const startDateStr = node.start_date || node.aired?.from || node.release_date;
  if (startDateStr) {
    const compDate = parseDateToComparable(startDateStr);
    if (compDate && compDate > period.endDate) {
      return false;
    }
  }

  if (node.start_season && typeof node.start_season === 'object') {
    const sYear = Number(node.start_season.year);
    const sSeason = typeof node.start_season.season === 'string' ? node.start_season.season.toLowerCase() : '';
    if (sYear > targetYear) return false;
    if (sYear === targetYear) {
      const seasonOrder = { winter: 1, spring: 2, summer: 3, fall: 4 };
      const currOrder = seasonOrder[normSeason as keyof typeof seasonOrder] || 0;
      const animeOrder = seasonOrder[sSeason as keyof typeof seasonOrder] || 0;
      if (animeOrder > currOrder) return false;
    }
  }

  // 4. Airing Continuity for Previous-Season Shows (e.g. Summer/Spring shows for Fall 2026):
  // Check if broadcast airing has ALREADY ENDED before the start of the target season:
  const endDateStr = node.end_date || node.aired?.to;
  const compEndDate = parseDateToComparable(endDateStr);

  // If the anime's broadcast ended before the start of the target season (e.g. before 2026-10-01 for Fall 2026):
  // -> Airing ended! Unwatched episodes must NOT carry it over.
  if (compEndDate && compEndDate < period.startDate) {
    return false;
  }

  const isFinishedAiring =
    node.status === 'finished_airing' ||
    node.status === 'Finished Airing' ||
    item.status === 'finished_airing';

  // If MAL marks it as finished_airing:
  // - If compEndDate is known and on/after period.startDate, it aired into this season.
  // - If compEndDate is missing or before period.startDate, it finished airing in an earlier season.
  if (isFinishedAiring) {
    if (compEndDate && compEndDate >= period.startDate) {
      return true;
    }
    return false;
  }

  // 5. If it is currently airing during the target season:
  // (marked as currently_airing and not ended before target season)
  const isCurrentlyAiring =
    node.status === 'currently_airing' ||
    node.status === 'Currently Airing' ||
    node.status === 'airing' ||
    item.status === 'currently_airing';

  const isOnReleaseCalendar = calendarAiringIds ? calendarAiringIds.has(node.id) : false;

  if (isCurrentlyAiring || isOnReleaseCalendar) {
    return true;
  }

  return false;
}

/**
 * Convenience wrapper for Summer 2026 completed anime check
 */
export function isCompletedDuringSummer2026(
  item: any,
  earliestFirstEpisodeAiringDate: string | null = null,
  summerIds?: Set<number>,
  springIds?: Set<number>
): boolean {
  return isAnimeCompletedInSeason(
    item,
    2026,
    'summer',
    earliestFirstEpisodeAiringDate,
    summerIds,
    springIds
  );
}

/**
 * Convenience wrapper for Spring 2026 completed anime check
 */
export function isCompletedDuringSpring2026(
  item: any,
  earliestFirstEpisodeAiringDate: string | null = null,
  springIds?: Set<number>,
  winterIds?: Set<number>
): boolean {
  return isAnimeCompletedInSeason(
    item,
    2026,
    'spring',
    earliestFirstEpisodeAiringDate,
    springIds,
    winterIds
  );
}

/**
 * Convenience wrapper for Fall 2026 completed anime check
 */
export function isCompletedDuringFall2026(
  item: any,
  earliestFirstEpisodeAiringDate: string | null = null,
  fallIds?: Set<number>,
  summerIds?: Set<number>
): boolean {
  return isAnimeCompletedInSeason(
    item,
    2026,
    'fall',
    earliestFirstEpisodeAiringDate,
    fallIds,
    summerIds
  );
}

/**
 * Fetches the complete paginated seasonal anime list from Jikan via the backend proxy
 */
export async function fetchJikanSeasonCatalogue(
  year: number = 2026,
  season: string = 'summer'
): Promise<JikanSeasonalAnime[]> {
  try {
    const res = await fetch(`/api/jikan/season/${year}/${season}`);
    if (!res.ok) {
      return [];
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    const data: JikanSeasonResponse = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    console.warn(`Could not load Jikan seasonal catalogue:`, err);
    return [];
  }
}

// Session cache for Jikan fallback queries
const jikanInfoCache = new Map<number, JikanAnimeResponse | null>();
const jikanInfoInFlight = new Map<number, Promise<JikanAnimeResponse | null>>();

/**
 * Fallback to check an individual anime on Jikan if missing from the seasonal catalogue.
 * Utilizes in-memory session cache and in-flight request deduplication.
 */
export async function fetchJikanAnimeInfo(malId: number): Promise<JikanAnimeResponse | null> {
  if (jikanInfoCache.has(malId)) {
    return jikanInfoCache.get(malId) ?? null;
  }
  if (jikanInfoInFlight.has(malId)) {
    return jikanInfoInFlight.get(malId)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`/api/jikan/anime/${malId}`);
      if (!res.ok) {
        jikanInfoCache.set(malId, null);
        return null;
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        jikanInfoCache.set(malId, null);
        return null;
      }
      const data: JikanAnimeResponse = await res.json();
      jikanInfoCache.set(malId, data);
      return data;
    } catch {
      jikanInfoCache.set(malId, null);
      return null;
    } finally {
      jikanInfoInFlight.delete(malId);
    }
  })();

  jikanInfoInFlight.set(malId, promise);
  return promise;
}

export function isJikanAnimeInfoCached(malId: number): boolean {
  return jikanInfoCache.has(malId);
}

/**
 * Fetches release calendar items for the seasonal window and caches them in memory.
 */
export async function fetchCalendarSeasonItems(
  startSec?: number,
  endSec?: number
): Promise<ReleaseCalendarItem[]> {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    // Request a focused 7-week window around the current date: 3 weeks in the past to catch recently aired episodes,
    // and 4 weeks in the future to catch upcoming and final episodes without pagination truncation.
    const s = startSec ?? (nowSec - 21 * 86400);
    const e = endSec ?? (nowSec + 28 * 86400);

    const res = await fetch(`/api/release-calendar?start=${s}&end=${e}`);
    if (!res.ok) {
      const fallbackRes = await fetch(`/api/release-calendar`);
      if (!fallbackRes.ok) return [];
      const fallbackData = await fallbackRes.json();
      const items: ReleaseCalendarItem[] = Array.isArray(fallbackData.data) ? fallbackData.data : [];
      if (items.length > 0) {
        setCachedCalendarItems(items);
      }
      return items;
    }

    const data = await res.json();
    const items: ReleaseCalendarItem[] = Array.isArray(data.data) ? data.data : [];
    if (items.length > 0) {
      setCachedCalendarItems(items);
    }
    return items;
  } catch (err) {
    console.warn('Could not fetch calendar seasonal items:', err);
    return [];
  }
}

/**
 * Fetches release calendar data and extracts all MAL IDs airing during the target season window.
 * This serves as an additional fallback for seasonal detection in MY SEASON when MAL/Jikan metadata is missing or vague.
 */
export async function fetchCalendarSeasonReleases(
  startSec?: number,
  endSec?: number
): Promise<number[]> {
  try {
    const items = await fetchCalendarSeasonItems(startSec, endSec);
    const malIds: number[] = [];
    for (const item of items) {
      if (item.malId) {
        const parsed = Number(item.malId);
        if (!isNaN(parsed) && parsed > 0) {
          malIds.push(parsed);
        }
      }
    }
    return malIds;
  } catch (err) {
    console.warn('Could not fetch calendar seasonal releases fallback:', err);
    return [];
  }
}

/**
 * Generic, single-source-of-truth compiler for an anime season dataset.
 * Respects strict season membership:
 * - Season membership is based on the anime's MAL start_season matching the selected year and season.
 * - An anime that originally started in Spring 2026 but continued airing during Summer 2026 remains a Spring 2026 anime.
 * - Debut anime of the target season across all statuses (watching, completed, PTW, on hold, dropped) are included.
 * - Completed anime belonging to the target season are included without cross-season leakage.
 */
export function getAnimeForSelectedSeason<T = any>({
  malList,
  year = 2026,
  season = 'summer',
  watchingItems = [],
  completedItems = [],
  seasonCatalogueIds,
  userMalMap,
}: {
  malList: T[];
  year?: number;
  season?: string;
  watchingItems?: Array<{ node?: any; list_status?: any } | any>;
  completedItems?: Array<{ node?: any; list_status?: any } | any>;
  seasonCatalogueIds?: Set<number>;
  userMalMap?: Map<number, T>;
}): T[] {
  const items: T[] = [];
  const seenIds = new Set<number>();
  const normSeason = (season || 'summer').trim().toLowerCase();

  // 1. Watching items that belong to or are carried over into this season
  for (const item of watchingItems) {
    const node = item?.node || item;
    if (!node?.id) continue;
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      const original = userMalMap ? userMalMap.get(node.id) : null;
      items.push(original || (item as T));
    }
  }

  // 2. Completed items belonging to or completed during this season
  for (const item of completedItems) {
    const node = item?.node || item;
    if (!node?.id) continue;
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      const original = userMalMap ? userMalMap.get(node.id) : null;
      items.push(original || (item as T));
    }
  }

  // 3. All other items in the user's MAL list whose debut season matches the target season (PTW, On Hold, Dropped, etc.)
  for (const rawItem of malList) {
    const item = rawItem as any;
    const node = item?.node || item;
    if (!node?.id) continue;
    if (seenIds.has(node.id)) continue;
    if (isPromotionalOrVideoOnlyEntry(node)) continue;
    if (isAnimeInSeason(node, year, normSeason, seasonCatalogueIds)) {
      seenIds.add(node.id);
      items.push(rawItem);
    }
  }

  return items;
}

export interface AppSeason {
  id: 'spring' | 'summer' | 'fall';
  season: 'spring' | 'summer' | 'fall';
  year: number;
  label: string;
  shortLabel: string;
  seasonLabelJa: string;
}

export const SUPPORTED_SEASONS: AppSeason[] = [
  {
    id: 'spring',
    season: 'spring',
    year: 2026,
    label: 'Spring 2026',
    shortLabel: 'Spring 26',
    seasonLabelJa: '春',
  },
  {
    id: 'summer',
    season: 'summer',
    year: 2026,
    label: 'Summer 2026',
    shortLabel: 'Summer 26',
    seasonLabelJa: '夏',
  },
  {
    id: 'fall',
    season: 'fall',
    year: 2026,
    label: 'Fall 2026',
    shortLabel: 'Fall 26',
    seasonLabelJa: '秋',
  },
];

