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
 * 2. Spring 2026:
 *    - Has finish_date: Must be between April 1, 2026 and June 30, 2026 (inclusive). Older/backlog titles completed in this window qualify.
 *    - No finish_date: Qualifies if anime is a Spring 2026 debut anime.
 *    - Summer 2026 anime or future releases never qualify.
 * 3. Summer 2026:
 *    - If the anime's debut season IS Summer 2026, it belongs to that season.
 *    - If older/backlog: finish_date >= earliestFirstEpisodeAiringDate, excluding Spring 2026 carryovers.
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

  const targetSeasonLower = targetSeason.trim().toLowerCase();
  const finishDate = parseDateToComparable(listStatus.finish_date);

  // Spring 2026 bounded completion
  if (targetYear === 2026 && targetSeasonLower === 'spring') {
    const springStart = earliestFirstEpisodeAiringDate && earliestFirstEpisodeAiringDate < '2026-04-01'
      ? earliestFirstEpisodeAiringDate
      : '2026-04-01';
    const springEnd = '2026-06-30';

    // 1. If finish date is specified:
    if (finishDate) {
      // Must be between April 1, 2026 and June 30, 2026 (strictly finished within Spring)
      if (finishDate < springStart || finishDate > springEnd) {
        return false;
      }
      // Future season leakage prevention (Summer 2026 titles cannot be Spring completed)
      const isSummerAnime = isAnimeInSeason(item.node, 2026, 'summer');
      if (isSummerAnime) {
        return false;
      }
      return true;
    }

    // 2. If no finish date is specified, only include if it was an actual Spring 2026 debut anime
    return isAnimeInSeason(item.node, 2026, 'spring', targetCatalogueIds);
  }

  // Summer 2026 (and general default behavior)
  // 2. If the anime itself debuted in the target season (e.g. Summer 2026), it is a seasonal completed anime
  const isCurrentSeasonDebut = isAnimeInSeason(
    item.node,
    targetYear,
    targetSeason,
    targetCatalogueIds
  );

  if (isCurrentSeasonDebut) {
    return true;
  }

  // 3. For backlog/older anime completed during the season: Airing boundary date must be established
  if (!earliestFirstEpisodeAiringDate) return false;

  // 4. Must have a valid finish date
  if (!finishDate) return false;

  // 5. finish_date must be on or after the earliest first-episode airing date boundary (inclusive)
  if (finishDate < earliestFirstEpisodeAiringDate) return false;

  // 6. CRITICAL: Previous season exclusion (Spring 2026 carryovers finished during Summer are excluded)
  const prevSeason = getPreviousSeason(targetYear, targetSeason);
  const isPreviousSeasonAnime = isAnimeInSeason(
    item.node,
    prevSeason.year,
    prevSeason.season,
    prevSeasonCatalogueIds
  );

  if (isPreviousSeasonAnime) {
    // Exclude previous season titles even if finished after the boundary date
    return false;
  }

  return true;
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

/**
 * Fallback to check an individual anime on Jikan if missing from the seasonal catalogue
 */
export async function fetchJikanAnimeInfo(malId: number): Promise<JikanAnimeResponse | null> {
  try {
    const res = await fetch(`/api/jikan/anime/${malId}`);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
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
    const nowSec = Math.floor(Date.now() / 1000);
    // Broad window covering Summer 2026 / active season schedules
    const s = startSec ?? Math.min(nowSec - 30 * 86400, 1782864000);
    const e = endSec ?? Math.max(nowSec + 30 * 86400, 1790812800);

    const res = await fetch(`/api/release-calendar?start=${s}&end=${e}`);
    if (!res.ok) {
      const fallbackRes = await fetch(`/api/release-calendar`);
      if (!fallbackRes.ok) return [];
      const fallbackData = await fallbackRes.json();
      if (!Array.isArray(fallbackData.data)) return [];
      return fallbackData.data
        .map((item: any) => (item.malId ? Number(item.malId) : null))
        .filter((id: any): id is number => typeof id === 'number' && !isNaN(id));
    }

    const data = await res.json();
    if (!Array.isArray(data.data)) return [];

    const malIds: number[] = [];
    for (const item of data.data) {
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

  // 1. Watching items that strictly belong to this season
  for (const item of watchingItems) {
    const node = item?.node || item;
    if (!node?.id) continue;
    if (isAnimeInSeason(node, year, normSeason, seasonCatalogueIds)) {
      if (!seenIds.has(node.id)) {
        seenIds.add(node.id);
        const original = userMalMap ? userMalMap.get(node.id) : null;
        items.push(original || (item as T));
      }
    }
  }

  // 2. Completed items belonging to or completed during this season
  for (const item of completedItems) {
    const node = item?.node || item;
    if (!node?.id) continue;
    // Strict boundary checks between seasons to avoid leakage
    if (normSeason === 'summer' && isAnimeSpring2026(node)) continue;
    if (normSeason === 'spring' && isAnimeSummer2026(node)) continue;
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      const original = userMalMap ? userMalMap.get(node.id) : null;
      items.push(original || (item as T));
    }
  }

  // 3. All other items in the user's MAL list whose start_season matches the target season (PTW, On Hold, Dropped, etc.)
  for (const rawItem of malList) {
    const item = rawItem as any;
    const node = item?.node || item;
    if (!node?.id) continue;
    if (seenIds.has(node.id)) continue;
    if (isAnimeInSeason(node, year, normSeason, seasonCatalogueIds)) {
      seenIds.add(node.id);
      items.push(rawItem);
    }
  }

  return items;
}

