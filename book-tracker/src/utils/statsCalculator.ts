import type {
  Edition,
  PhysicalCopy,
  ReadingCycle,
  ReadingProgress,
  ReadingSession,
  Work,
} from '../types/domain';

export interface CycleMetrics {
  cycleId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  totalSessionPages: number;
  totalMinutes: number;
  pagesPerHour: number;
  sessionCount: number;
  estimatedMinutesRemaining: number | null;
}

export interface LibraryStatsSummary {
  totalWorks: number;
  totalEditions: number;
  ownedCopiesCount: number;
  wishlistCopiesCount: number;
  currentlyReadingCount: number;
  finishedCyclesCount: number;
  finishedUniqueWorksCount: number;
  totalPagesReadAllTime: number;
  totalMinutesReadAllTime: number;
  averagePagesPerHour: number;
  currentDailyStreak: number;
  longestDailyStreak: number;
  pagesReadToday: number;
  booksFinishedThisYear: number;
  pagesReadThisMonth: number;
  monthlyPagesSeries: { month: string; pages: number; booksFinished: number }[];
  genreBreakdown: { name: string; count: number }[];
  languageBreakdown: { name: string; count: number }[];
  authorBreakdown: { name: string; count: number }[];
  collectionSpendByCurrency: Record<string, number>;
}

export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftLocalDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return getLocalDateString(dt);
}

export function calculatePercentage(currentPage: number, totalPages: number): number {
  if (!totalPages || totalPages <= 0) return 0;
  const clamped = Math.max(0, Math.min(currentPage, totalPages));
  return Math.round((clamped / totalPages) * 1000) / 10;
}

/**
 * Recomputes cycle metrics from the authoritative ReadingProgress (which explicitly
 * allows intentional rewinds) and the cycle's non-deleted ReadingSessions.
 */
export function calculateCycleMetrics(
  cycle: ReadingCycle,
  progress: ReadingProgress | undefined,
  edition: Edition | undefined,
  sessions: ReadingSession[]
): CycleMetrics {
  const activeSessions = sessions
    .filter((s) => !s.deletedAt && s.cycleId === cycle.id)
    .sort((a, b) => (a.sessionDate + (a.createdAt || '')).localeCompare(b.sessionDate + (b.createdAt || '')));

  const totalPages = progress?.totalPages || edition?.pageCount || 0;
  const currentPage = progress ? Math.max(0, progress.currentPage) : 0;
  const percentage = calculatePercentage(currentPage, totalPages);

  const totalSessionPages = activeSessions.reduce((sum, s) => sum + Math.max(0, s.pagesRead), 0);
  const totalMinutes = activeSessions.reduce((sum, s) => sum + Math.max(0, s.durationMinutes), 0);
  const pagesPerHour =
    totalMinutes > 0 ? Math.round((totalSessionPages / (totalMinutes / 60)) * 10) / 10 : 0;

  let estimatedMinutesRemaining: number | null = null;
  if (totalPages > currentPage && pagesPerHour > 0) {
    estimatedMinutesRemaining = Math.round(((totalPages - currentPage) / pagesPerHour) * 60);
  }

  return {
    cycleId: cycle.id,
    currentPage,
    totalPages,
    percentage,
    totalSessionPages,
    totalMinutes,
    pagesPerHour,
    sessionCount: activeSessions.length,
    estimatedMinutesRemaining,
  };
}

export function calculateStreaks(
  sessions: ReadingSession[],
  today: string = getLocalDateString()
): { currentStreak: number; longestStreak: number } {
  const activeDates = new Set<string>();
  for (const s of sessions) {
    if (!s.deletedAt && (s.pagesRead > 0 || s.durationMinutes > 0) && /^\d{4}-\d{2}-\d{2}$/.test(s.sessionDate)) {
      activeDates.add(s.sessionDate);
    }
  }
  if (activeDates.size === 0) return { currentStreak: 0, longestStreak: 0 };

  // Longest streak
  const sortedDates = Array.from(activeDates).sort();
  let longestStreak = 1;
  let running = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    if (shiftLocalDateString(sortedDates[i - 1], 1) === sortedDates[i]) {
      running++;
      if (running > longestStreak) longestStreak = running;
    } else {
      running = 1;
    }
  }

  // Current streak (today or yesterday counts as active streak)
  let currentStreak = 0;
  let cursor = activeDates.has(today) ? today : shiftLocalDateString(today, -1);
  if (activeDates.has(cursor)) {
    while (activeDates.has(cursor)) {
      currentStreak++;
      cursor = shiftLocalDateString(cursor, -1);
    }
  }

  return { currentStreak, longestStreak };
}

export function computeLibraryStatistics(params: {
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  sessions: ReadingSession[];
  now?: Date;
}): LibraryStatsSummary {
  const now = params.now ?? new Date();
  const today = getLocalDateString(now);
  const currentYear = String(now.getFullYear());
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const activeWorks = params.works.filter((w) => !w.deletedAt);
  const activeEditions = params.editions.filter((e) => !e.deletedAt);
  const activeCopies = params.copies.filter((c) => !c.deletedAt);
  const activeCycles = params.cycles.filter((c) => !c.deletedAt);
  const activeSessions = params.sessions.filter((s) => !s.deletedAt);

  const ownedCopiesCount = activeCopies.filter((c) => c.ownershipStatus === 'owned').length;
  const wishlistCopiesCount = activeCopies.filter((c) => c.ownershipStatus === 'wishlist').length;

  const currentlyReadingCount = activeCycles.filter((c) => c.status === 'currently_reading').length;
  const finishedCycles = activeCycles.filter((c) => c.status === 'finished');
  const finishedUniqueWorksCount = new Set(finishedCycles.map((c) => c.workId)).size;

  const totalPagesReadAllTime = activeSessions.reduce((acc, s) => acc + Math.max(0, s.pagesRead), 0);
  const totalMinutesReadAllTime = activeSessions.reduce((acc, s) => acc + Math.max(0, s.durationMinutes), 0);
  const averagePagesPerHour =
    totalMinutesReadAllTime > 0
      ? Math.round((totalPagesReadAllTime / (totalMinutesReadAllTime / 60)) * 10) / 10
      : 0;

  const { currentStreak, longestStreak } = calculateStreaks(activeSessions, today);

  const pagesReadToday = activeSessions
    .filter((s) => s.sessionDate === today)
    .reduce((acc, s) => acc + Math.max(0, s.pagesRead), 0);

  const pagesReadThisMonth = activeSessions
    .filter((s) => s.sessionDate.startsWith(currentMonth))
    .reduce((acc, s) => acc + Math.max(0, s.pagesRead), 0);

  const booksFinishedThisYear = finishedCycles.filter((c) =>
    (c.finishedAt || '').startsWith(currentYear)
  ).length;

  // Last 12 months series
  const monthlyMap = new Map<string, { pages: number; booksFinished: number }>();
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, { pages: 0, booksFinished: 0 });
  }
  for (const s of activeSessions) {
    const monthKey = s.sessionDate.slice(0, 7);
    const bucket = monthlyMap.get(monthKey);
    if (bucket) bucket.pages += Math.max(0, s.pagesRead);
  }
  for (const c of finishedCycles) {
    const monthKey = (c.finishedAt || '').slice(0, 7);
    const bucket = monthlyMap.get(monthKey);
    if (bucket) bucket.booksFinished += 1;
  }
  const monthlyPagesSeries = Array.from(monthlyMap.entries()).map(([month, v]) => ({
    month,
    pages: v.pages,
    booksFinished: v.booksFinished,
  }));

  const countMap = (items: string[]) => {
    const m = new Map<string, number>();
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      m.set(trimmed, (m.get(trimmed) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  };

  const genreBreakdown = countMap(activeWorks.flatMap((w) => w.genres));
  const authorBreakdown = countMap(activeWorks.flatMap((w) => w.authors));
  const languageBreakdown = countMap(activeEditions.map((e) => e.language.toUpperCase()));

  const collectionSpendByCurrency: Record<string, number> = {};
  for (const c of activeCopies) {
    if (c.ownershipStatus === 'owned' && c.purchasePrice != null && c.purchasePrice > 0) {
      collectionSpendByCurrency[c.currency] =
        (collectionSpendByCurrency[c.currency] ?? 0) + c.purchasePrice;
    }
  }

  return {
    totalWorks: activeWorks.length,
    totalEditions: activeEditions.length,
    ownedCopiesCount,
    wishlistCopiesCount,
    currentlyReadingCount,
    finishedCyclesCount: finishedCycles.length,
    finishedUniqueWorksCount,
    totalPagesReadAllTime,
    totalMinutesReadAllTime,
    averagePagesPerHour,
    currentDailyStreak: currentStreak,
    longestDailyStreak: longestStreak,
    pagesReadToday,
    booksFinishedThisYear,
    pagesReadThisMonth,
    monthlyPagesSeries,
    genreBreakdown,
    languageBreakdown,
    authorBreakdown,
    collectionSpendByCurrency,
  };
}
