import type { ReleaseCalendarItem } from '../types';
import { setCachedCalendarItems } from './completionUtils';

// Module-level persistent cache keyed by exact date range '${startSec}_${endSec}'
const calendarDateRangeCache = new Map<string, ReleaseCalendarItem[]>();

// In-flight Promise deduplication map to prevent multiple identical concurrent requests
const calendarInFlightPromises = new Map<string, Promise<ReleaseCalendarItem[]>>();

/**
 * Returns cached calendar items for an exact date range if already loaded into memory.
 */
export function getCachedCalendarRange(
  startSec: number,
  endSec: number
): ReleaseCalendarItem[] | undefined {
  const cacheKey = `${startSec}_${endSec}`;
  return calendarDateRangeCache.get(cacheKey);
}

/**
 * Stores items for an exact date range into the global memory cache.
 */
export function setCachedCalendarRange(
  startSec: number,
  endSec: number,
  items: ReleaseCalendarItem[]
): void {
  const cacheKey = `${startSec}_${endSec}`;
  calendarDateRangeCache.set(cacheKey, items);
  setCachedCalendarItems(items);
}

/**
 * Fetches calendar items for the specified date range.
 * - Reuses cached results immediately if present and bypassCache is false.
 * - Deduplicates concurrent requests for the exact same date range by returning the active Promise.
 * - Caches successful responses for instant reuse when switching tabs or navigating weeks.
 */
export async function fetchCalendarDateRange(
  startSec: number,
  endSec: number,
  bypassCache: boolean = false
): Promise<ReleaseCalendarItem[]> {
  const cacheKey = `${startSec}_${endSec}`;

  if (!bypassCache) {
    const cached = calendarDateRangeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = calendarInFlightPromises.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const requestPromise = (async () => {
    try {
      const res = await fetch(`/api/release-calendar?start=${startSec}&end=${endSec}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      const items: ReleaseCalendarItem[] = Array.isArray(data.data) ? data.data : [];

      calendarDateRangeCache.set(cacheKey, items);
      setCachedCalendarItems(items);
      return items;
    } finally {
      calendarInFlightPromises.delete(cacheKey);
    }
  })();

  calendarInFlightPromises.set(cacheKey, requestPromise);
  return requestPromise;
}
