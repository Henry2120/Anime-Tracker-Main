import type {
  Edition,
  PhysicalCopy,
  ReadingCycle,
  Work,
} from '../types/domain';

export interface LibraryStatsSummary {
  totalWorks: number;
  totalEditions: number;
  ownedCopiesCount: number;
  wishlistCopiesCount: number;
  currentlyReadingCount: number;
  finishedCyclesCount: number;
  finishedUniqueWorksCount: number;
  booksFinishedThisYear: number;
  monthlyFinishedSeries: { month: string; booksFinished: number }[];
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

export function computeLibraryStatistics(params: {
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  now?: Date;
}): LibraryStatsSummary {
  const now = params.now ?? new Date();
  const currentYear = String(now.getFullYear());

  const activeWorks = params.works.filter((w) => !w.deletedAt);
  const activeEditions = params.editions.filter((e) => !e.deletedAt);
  const activeCopies = params.copies.filter((c) => !c.deletedAt);
  const activeCycles = params.cycles.filter((c) => !c.deletedAt);

  const ownedCopiesCount = activeCopies.filter((c) => c.ownershipStatus === 'owned').length;
  const wishlistCopiesCount = activeCopies.filter((c) => c.ownershipStatus === 'wishlist').length;

  const currentlyReadingCount = activeCycles.filter((c) => c.status === 'currently_reading').length;
  const finishedCycles = activeCycles.filter((c) => c.status === 'finished');
  const finishedUniqueWorksCount = new Set(finishedCycles.map((c) => c.workId)).size;

  const booksFinishedThisYear = finishedCycles.filter((c) =>
    (c.finishedAt || '').startsWith(currentYear)
  ).length;

  // Last 12 months finished books series
  const monthlyMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, 0);
  }
  for (const c of finishedCycles) {
    const monthKey = (c.finishedAt || '').slice(0, 7);
    if (monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + 1);
    }
  }
  const monthlyFinishedSeries = Array.from(monthlyMap.entries()).map(([month, booksFinished]) => ({
    month,
    booksFinished,
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
    booksFinishedThisYear,
    monthlyFinishedSeries,
    genreBreakdown,
    languageBreakdown,
    authorBreakdown,
    collectionSpendByCurrency,
  };
}
