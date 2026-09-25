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
 * Merges two arrays of calendar items deterministically by unique item ID / schedule key.
 */
export function mergeCalendarItems(
  existing: ReleaseCalendarItem[],
  incoming: ReleaseCalendarItem[]
): ReleaseCalendarItem[] {
  if (!Array.isArray(existing) || existing.length === 0) {
    return Array.isArray(incoming) ? [...incoming].sort((a, b) => a.airingAt - b.airingAt) : [];
  }
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return [...existing].sort((a, b) => a.airingAt - b.airingAt);
  }

  const map = new Map<string | number, ReleaseCalendarItem>();
  for (const item of existing) {
    if (!item) continue;
    const key = item.id || `${item.malId ?? item.anilistId ?? 'u'}_${item.episode ?? 'x'}_${item.airingAt}`;
    map.set(key, item);
  }
  for (const item of incoming) {
    if (!item) continue;
    const key = item.id || `${item.malId ?? item.anilistId ?? 'u'}_${item.episode ?? 'x'}_${item.airingAt}`;
    map.set(key, item);
  }

  return Array.from(map.values()).sort((a, b) => a.airingAt - b.airingAt);
}

/**
 * Stores loaded calendar items into shared memory cache by merging with existing items.
 * Avoids any redundant network requests across components while preserving previously loaded weeks.
 */
export function setCachedCalendarItems(items: ReleaseCalendarItem[]): void {
  if (Array.isArray(items) && items.length > 0) {
    memoryCachedCalendarItems = mergeCalendarItems(memoryCachedCalendarItems, items);
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
 * Calculates the number of calendar days between two YYYY-MM-DD date keys in the same timezone.
 * Uses UTC date values to prevent any daylight-saving-time fractional shifts.
 */
export function getCalendarDaysDifference(fromDateKey: string, toDateKey: string): number {
  try {
    const [y1, m1, d1] = fromDateKey.split('-').map(Number);
    const [y2, m2, d2] = toDateKey.split('-').map(Number);
    if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Formats the number of calendar days until the final episode for presentation.
 * Returns null if days is null, undefined, or negative.
 * Returns 'Today' for 0 days.
 * Returns '1 day left' for 1 day.
 * Returns 'X days left' for X > 1.
 */
export function formatDaysUntilFinal(days: number | null | undefined): string | null {
  if (days === null || days === undefined || days < 0) return null;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
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
        badgeBg: 'bg-sky-500/15',
        badgeText: 'text-sky-600 dark:text-sky-400',
        badgeBorder: 'border-sky-500/30',
        dotColor: 'bg-sky-500',
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
 * Strict title normalization for safe matching between MAL and Release Calendar datasets.
 * Converts to NFKC, standardizes case, strips punctuation and non-alphanumeric symbols,
 * and normalizes season/part ordinal numbers.
 */
export function normalizeTitleForMatching(title: string): string {
  if (!title || typeof title !== 'string') return '';
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[【】\[\]\(\)「」『』]/g, ' ')
    .replace(/[:\-–—_·/\\|~]/g, ' ')
    .replace(/['"`!?,.*+^$#@]/g, '')
    .replace(/\bpart\s+ii\b/g, 'part 2')
    .replace(/\bpart\s+iii\b/g, 'part 3')
    .replace(/\bpart\s+iv\b/g, 'part 4')
    .replace(/\bpart\s+i\b/g, 'part 1')
    .replace(/\bseason\s+ii\b/g, 'season 2')
    .replace(/\bseason\s+iii\b/g, 'season 3')
    .replace(/\bseason\s+iv\b/g, 'season 4')
    .replace(/\bseason\s+i\b/g, 'season 1')
    .replace(/\b1st\s+season\b/g, 'season 1')
    .replace(/\b2nd\s+season\b/g, 'season 2')
    .replace(/\b3rd\s+season\b/g, 'season 3')
    .replace(/\b4th\s+season\b/g, 'season 4')
    .replace(/\b5th\s+season\b/g, 'season 5')
    .replace(/\b2nd\s+cour\b/g, 'cour 2')
    .replace(/\b1st\s+cour\b/g, 'cour 1')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SeasonPartDescriptor {
  season: number | null;
  part: number | null;
  cour: number | null;
  isFinal: boolean;
}

export function extractSeasonPartDescriptor(normalizedTitle: string): SeasonPartDescriptor {
  const sMatch =
    normalizedTitle.match(/\bseason\s*([0-9]+)\b/) ||
    normalizedTitle.match(/\bs([0-9]+)\b/);
  const pMatch = normalizedTitle.match(/\bpart\s*([0-9]+)\b/);
  const cMatch = normalizedTitle.match(/\bcour\s*([0-9]+)\b/);
  const isFinal = /\b(final\s+season|the\s+final\s+season|kanketsu\s*hen)\b/.test(
    normalizedTitle
  );

  return {
    season: sMatch ? parseInt(sMatch[1], 10) : null,
    part: pMatch ? parseInt(pMatch[1], 10) : null,
    cour: cMatch ? parseInt(cMatch[1], 10) : null,
    isFinal,
  };
}

export function areSeasonDescriptorsCompatible(
  d1: SeasonPartDescriptor,
  d2: SeasonPartDescriptor
): boolean {
  if (d1.season !== d2.season) return false;
  if (d1.part !== d2.part) return false;
  if (d1.cour !== d2.cour) return false;
  if (d1.isFinal !== d2.isFinal) return false;
  return true;
}

export interface ResolvedCalendarEpisodesResult {
  episodes: ReleaseCalendarItem[];
  method: 'malId' | 'externalId' | 'title' | 'none';
  exactMalMatchesCount?: number;
  externalMatchesCount?: number;
  titleMatchesCount?: number;
}

export interface CalendarAnimeGroup {
  anilistId: number | null;
  malId: number | null;
  items: ReleaseCalendarItem[];
  rawTitles: Set<string>;
}

interface CalendarIndexedData {
  calendarRef: ReleaseCalendarItem[];
  malIdMap: Map<number, ReleaseCalendarItem[]>;
  anilistIdMap: Map<number, ReleaseCalendarItem[]>;
  groupsMap: Map<string, CalendarAnimeGroup>;
}

let cachedCalendarIndex: CalendarIndexedData | null = null;

function getIndexedCalendarData(effectiveCalendar: ReleaseCalendarItem[]): CalendarIndexedData {
  if (cachedCalendarIndex && cachedCalendarIndex.calendarRef === effectiveCalendar) {
    return cachedCalendarIndex;
  }

  const malIdMap = new Map<number, ReleaseCalendarItem[]>();
  const anilistIdMap = new Map<number, ReleaseCalendarItem[]>();
  const groupsMap = new Map<string, CalendarAnimeGroup>();

  for (const c of effectiveCalendar) {
    if (!c) continue;
    // Index by malId
    if (c.malId !== null && c.malId !== undefined) {
      const parsedMalId = Number(c.malId);
      if (!isNaN(parsedMalId) && parsedMalId > 0) {
        let list = malIdMap.get(parsedMalId);
        if (!list) {
          list = [];
          malIdMap.set(parsedMalId, list);
        }
        list.push(c);
      }
    }

    // Index by anilistId
    if (c.anilistId) {
      const parsedAniId = Number(c.anilistId);
      if (!isNaN(parsedAniId) && parsedAniId > 0) {
        let list = anilistIdMap.get(parsedAniId);
        if (!list) {
          list = [];
          anilistIdMap.set(parsedAniId, list);
        }
        list.push(c);
      }
    }

    // Group for title fallback matching
    const groupKey = c.anilistId
      ? `anilist_${c.anilistId}`
      : c.malId
      ? `mal_${c.malId}`
      : `title_${normalizeTitleForMatching(c.title?.romaji || c.title?.english || c.displayTitle || '')}`;

    let group = groupsMap.get(groupKey);
    if (!group) {
      group = {
        anilistId: c.anilistId || null,
        malId: c.malId || null,
        items: [],
        rawTitles: new Set<string>(),
      };
      groupsMap.set(groupKey, group);
    }
    group.items.push(c);
    if (c.title?.romaji) group.rawTitles.add(c.title.romaji);
    if (c.title?.english) group.rawTitles.add(c.title.english);
    if (c.title?.native) group.rawTitles.add(c.title.native);
    if (c.title?.userPreferred) group.rawTitles.add(c.title.userPreferred);
    if (c.titleEnglish) group.rawTitles.add(c.titleEnglish);
    if (c.titleRomaji) group.rawTitles.add(c.titleRomaji);
    if (c.titleNative) group.rawTitles.add(c.titleNative);
    if (c.displayTitle) group.rawTitles.add(c.displayTitle);
  }

  // Pre-sort indexed lists once by airingAt
  for (const list of malIdMap.values()) {
    list.sort((a, b) => a.airingAt - b.airingAt);
  }
  for (const list of anilistIdMap.values()) {
    list.sort((a, b) => a.airingAt - b.airingAt);
  }

  cachedCalendarIndex = {
    calendarRef: effectiveCalendar,
    malIdMap,
    anilistIdMap,
    groupsMap,
  };

  return cachedCalendarIndex;
}

/**
 * Resolves calendar episodes for an anime:
 * 1. Exact MAL-ID matching (FIRST/PREFERRED method)
 * 2. External ID fallback (e.g. AniList ID if available on node/item)
 * 3. Safe title matching against grouped calendar records with season/part verification
 * Returns ALL episodes of the resolved anime.
 */
export function resolveAnimeCalendarEpisodes(
  node: MalAnimeNode,
  effectiveCalendar: ReleaseCalendarItem[],
  itemRaw?: any
): ResolvedCalendarEpisodesResult {
  if (!node || !Array.isArray(effectiveCalendar) || effectiveCalendar.length === 0) {
    return { episodes: [], method: 'none', exactMalMatchesCount: 0, externalMatchesCount: 0, titleMatchesCount: 0 };
  }

  const indexed = getIndexedCalendarData(effectiveCalendar);

  // 1. Primary / Preferred: Exact MAL-ID match (O(1))
  if (typeof node.id === 'number' && node.id > 0) {
    const malMatches = indexed.malIdMap.get(node.id);
    if (malMatches && malMatches.length > 0) {
      return {
        episodes: malMatches,
        method: 'malId',
        exactMalMatchesCount: malMatches.length,
        externalMatchesCount: 0,
        titleMatchesCount: 0,
      };
    }
  }

  // 2. Safe Fallback: External ID (e.g. AniList ID) (O(1))
  const candidateAnilistId =
    (node as any)?.anilistId ??
    (node as any)?.anilist_id ??
    (node as any)?.idAniList ??
    itemRaw?.anilistId ??
    itemRaw?.anilist_id;

  if (typeof candidateAnilistId === 'number' && candidateAnilistId > 0) {
    const anilistMatches = indexed.anilistIdMap.get(candidateAnilistId);
    if (anilistMatches && anilistMatches.length > 0) {
      return {
        episodes: anilistMatches,
        method: 'externalId',
        exactMalMatchesCount: 0,
        externalMatchesCount: anilistMatches.length,
        titleMatchesCount: 0,
      };
    }
  }

  // 3. Safe Fallback: Title matching against pre-grouped calendar anime
  const groupsMap = indexed.groupsMap;

  // Candidate titles for node
  const nodeRawTitles = new Set<string>();
  if (node.title) nodeRawTitles.add(node.title);
  if (node.alternative_titles?.en) nodeRawTitles.add(node.alternative_titles.en);
  if (node.alternative_titles?.ja) nodeRawTitles.add(node.alternative_titles.ja);
  if (Array.isArray(node.alternative_titles?.synonyms)) {
    for (const syn of node.alternative_titles.synonyms) {
      if (syn && typeof syn === 'string') nodeRawTitles.add(syn);
    }
  }
  if (itemRaw?.title && typeof itemRaw.title === 'string') nodeRawTitles.add(itemRaw.title);
  if (itemRaw?.englishTitle && typeof itemRaw.englishTitle === 'string') nodeRawTitles.add(itemRaw.englishTitle);
  if (itemRaw?.japaneseTitle && typeof itemRaw.japaneseTitle === 'string') nodeRawTitles.add(itemRaw.japaneseTitle);

  // Pass 1: Exact Normalized Title Match
  const pass1Matches: CalendarAnimeGroup[] = [];
  for (const group of groupsMap.values()) {
    let matched = false;
    for (const rawNodeTitle of nodeRawTitles) {
      const normNode = normalizeTitleForMatching(rawNodeTitle);
      if (normNode.length < 3) continue;
      const descNode = extractSeasonPartDescriptor(normNode);

      for (const rawCalTitle of group.rawTitles) {
        const normCal = normalizeTitleForMatching(rawCalTitle);
        if (normCal.length < 3) continue;
        const descCal = extractSeasonPartDescriptor(normCal);

        const isExactMatch = normNode === normCal;
        const compactNode = normNode.replace(/\s+/g, '');
        const compactCal = normCal.replace(/\s+/g, '');
        const isCompactMatch = compactNode.length >= 8 && compactNode === compactCal;

        if (areSeasonDescriptorsCompatible(descNode, descCal) && (isExactMatch || isCompactMatch)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) {
      pass1Matches.push(group);
    }
  }

  if (pass1Matches.length === 1) {
    return {
      episodes: pass1Matches[0].items.sort((a, b) => a.airingAt - b.airingAt),
      method: 'title',
      exactMalMatchesCount: 0,
      externalMatchesCount: 0,
      titleMatchesCount: pass1Matches[0].items.length,
    };
  }

  // Pass 2: Strict Subtitle Segment Equality (e.g., "Makeine: Too Many Losing Heroines!" vs "Too Many Losing Heroines!")
  if (pass1Matches.length === 0) {
    const pass2Matches: CalendarAnimeGroup[] = [];
    for (const group of groupsMap.values()) {
      let matched = false;
      for (const rawNodeTitle of nodeRawTitles) {
        const nodeSegments = rawNodeTitle
          .split(/[:\-–—~]/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 8 && s.split(/\s+/).length >= 2);

        for (const rawCalTitle of group.rawTitles) {
          const calSegments = rawCalTitle
            .split(/[:\-–—~]/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 8 && s.split(/\s+/).length >= 2);

          const normCal = normalizeTitleForMatching(rawCalTitle);
          const descCal = extractSeasonPartDescriptor(normCal);
          for (const seg of nodeSegments) {
            const normSeg = normalizeTitleForMatching(seg);
            const descSeg = extractSeasonPartDescriptor(normSeg);
            if (
              areSeasonDescriptorsCompatible(descSeg, descCal) &&
              normSeg.length >= 8 &&
              normSeg === normCal
            ) {
              matched = true;
              break;
            }
          }
          if (matched) break;

          const normNode = normalizeTitleForMatching(rawNodeTitle);
          const descNode = extractSeasonPartDescriptor(normNode);
          for (const seg of calSegments) {
            const normSeg = normalizeTitleForMatching(seg);
            const descSeg = extractSeasonPartDescriptor(normSeg);
            if (
              areSeasonDescriptorsCompatible(descNode, descSeg) &&
              normSeg.length >= 8 &&
              normSeg === normNode
            ) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (matched) break;
      }
      if (matched) {
        pass2Matches.push(group);
      }
    }

    if (pass2Matches.length === 1) {
      return {
        episodes: pass2Matches[0].items.sort((a, b) => a.airingAt - b.airingAt),
        method: 'title',
        exactMalMatchesCount: 0,
        externalMatchesCount: 0,
        titleMatchesCount: pass2Matches[0].items.length,
      };
    }
  }

  return { episodes: [], method: 'none', exactMalMatchesCount: 0, externalMatchesCount: 0, titleMatchesCount: 0 };
}

/**
 * Diagnostic logger for development / debugging (behind __ANIVERSE_DEBUG__ or DEBUG_COMPLETION flag)
 */
function logCompletionDiagnostic(
  node: MalAnimeNode,
  resolution: ResolvedCalendarEpisodesResult,
  calendarDatasetSize: number,
  futureCalendarEps: ReleaseCalendarItem[],
  nextEp: ReleaseCalendarItem | null,
  totalEpisodes: number | null,
  hasSubsequentEpisodes: boolean,
  isFinalEpisode: boolean,
  finalState: AnimeAiringState
): void {
  if (
    typeof window !== 'undefined' &&
    Boolean((window as any).__ANIVERSE_DEBUG__ || (window as any).DEBUG_COMPLETION)
  ) {
    const lines = [
      `=== [AniVerse AiringState Diagnostic] ===`,
      `MAL title: ${node.title ?? 'unknown'}`,
      `MAL ID: ${node.id ?? 'unknown'}`,
      `MAL total episodes: ${node.num_episodes ?? 'unknown'}`,
      `MAL status: ${node.status ?? 'unknown'}`,
      `calendar dataset size: ${calendarDatasetSize}`,
      `exact MAL-ID matches: ${resolution.exactMalMatchesCount ?? 0}`,
      `external-ID matches: ${resolution.externalMatchesCount ?? 0}`,
      `title matches: ${resolution.titleMatchesCount ?? 0}`,
      `resolved match method: ${resolution.method}`,
      `all resolved calendar episode numbers: [${resolution.episodes.map((c) => c.episode).join(', ')}]`,
      `all resolved calendar airing timestamps: [${resolution.episodes.map((c) => c.airingAt).join(', ')}]`,
      `future episode numbers: [${futureCalendarEps.map((c) => c.episode).join(', ')}]`,
      `next episode number: ${nextEp?.episode ?? 'null'}`,
      `next episode airing timestamp: ${nextEp?.airingAt ?? 'null'}`,
      `totalEpisodes: ${totalEpisodes ?? 'null'}`,
      `hasSubsequentEpisodes: ${hasSubsequentEpisodes}`,
      `isFinalEpisode: ${isFinalEpisode}`,
      `final state selected: ${finalState}`,
      `=========================================`,
    ];
    console.debug(lines.join('\n'));
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
      daysUntilFinalEpisode: null,
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
      reason: 'Missing anime node metadata',
    };
  }

  const nowSec = Math.floor(refTimeMs / 1000);
  const userTz = getResolvedTimezone('local');
  const todayDateKey = getDateKeyInTz(nowSec, userTz);

  // Match calendar items for this anime:
  // 1. Exact MAL-ID matching (FIRST/PREFERRED method)
  // 2. Safe external ID fallback (e.g. AniList ID)
  // 3. Safe title matching against grouped calendar records with season/part verification
  const effectiveCalendar =
    calendarItems && calendarItems.length > 0 ? calendarItems : getCachedCalendarItems();
  const resolution = resolveAnimeCalendarEpisodes(
    node,
    effectiveCalendar,
    item
  );
  const animeCalendar = resolution.episodes;

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
  const daysUntilNextEpisode =
    nextEpDateKey && todayDateKey ? getCalendarDaysDifference(todayDateKey, nextEpDateKey) : null;
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

  // Helper to trigger comprehensive diagnostics and return final state
  const finish = (info: AnimeCompletionInfo): AnimeCompletionInfo => {
    logCompletionDiagnostic(
      node,
      resolution,
      effectiveCalendar.length,
      futureCalendarEps,
      nextEp,
      totalEpisodes,
      hasSubsequentEpisodes,
      info.isFinalEpisode,
      info.state
    );
    return info;
  };

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

    return finish({
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Scheduled to return in a future broadcast cour',
    });
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

    return finish({
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
      reason: isMalFinished
        ? 'MAL officially indicates finished airing'
        : isFinalEpisodeAired || isTotalEpisodesAired
        ? 'Final episode broadcast run has completed'
        : 'Broadcast end date has passed',
    });
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

    return finish({
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Finished initial cour; returning in an upcoming cour',
    });
  }

  // 4. Final Episode Today (Scheduled for today, before or during broadcast)
  if (isFinalEpisode && isNextEpToday) {
    if (isBroadcastingNow) {
      const styles = getBadgeStyles('airing');
      return finish({
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
        daysUntilFinalEpisode: 0,
        formattedNextAirDate,
        formattedNextAirTime,
        reason: 'Final episode is currently broadcasting live',
      });
    }

    const styles = getBadgeStyles('final_episode_today');
    const stateLabel = formattedNextAirTime
      ? `Final Episode — Today at ${formattedNextAirTime}`
      : 'Final Episode Today';

    return finish({
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
      daysUntilFinalEpisode: 0,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Final episode scheduled for broadcast today',
    });
  }

  // 5. Final Episode (Scheduled on an upcoming date after today)
  if (isFinalEpisode && !isNextEpToday) {
    const daysUntilFinalEpisode =
      typeof daysUntilNextEpisode === 'number' && daysUntilNextEpisode > 0
        ? daysUntilNextEpisode
        : null;

    let daysText = '';
    if (daysUntilFinalEpisode !== null) {
      daysText = ` · ${daysUntilFinalEpisode} ${daysUntilFinalEpisode === 1 ? 'day' : 'days'} left`;
    }

    const styles = getBadgeStyles('final_episode');
    const stateLabel = formattedNextAirDate
      ? `Final Episode — ${formattedNextAirDate}${daysText}`
      : daysText
      ? `Final Episode${daysText}`
      : 'Final Episode';

    return finish({
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
      daysUntilFinalEpisode,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: `Final episode scheduled for ${formattedNextAirDate || 'upcoming date'}${
        daysUntilFinalEpisode !== null
          ? ` (${daysUntilFinalEpisode} ${daysUntilFinalEpisode === 1 ? 'day' : 'days'} left)`
          : ''
      }`,
    });
  }

  // 6. Actively Airing (Episode is currently broadcasting live within its scheduled window)
  if (isBroadcastingNow) {
    const styles = getBadgeStyles('airing');
    return finish({
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: 'Episode is currently within its scheduled broadcast window',
    });
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

    return finish({
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate,
      formattedNextAirTime,
      reason: `Upcoming episode scheduled on ${formattedNextAirDate || 'release calendar'}`,
    });
  }

  // 8. Ongoing (MAL confirms the anime is currently airing, but there is currently no confirmed upcoming calendar episode)
  if (normalizedMalStatus === 'currently_airing') {
    const styles = getBadgeStyles('ongoing');
    return finish({
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
      daysUntilFinalEpisode: null,
      formattedNextAirDate: null,
      formattedNextAirTime: null,
      reason: 'MAL confirms anime is currently airing, but no confirmed upcoming calendar episode',
    });
  }

  // 9. Unknown fallback
  const styles = getBadgeStyles('unknown');
  const userProgressComplete =
    totalEpisodes !== null
      ? userWatchedEpisodes >= totalEpisodes
      : listStatus?.status === 'completed';

  return finish({
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
    daysUntilFinalEpisode: null,
    formattedNextAirDate: null,
    formattedNextAirTime: null,
    reason: 'Airing status cannot be determined reliably from available data',
  });
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
