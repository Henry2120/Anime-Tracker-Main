import { MalListItem } from '../types';

export const STATUS_COLORS: Record<string, string> = {
  completed: '#3b82f6', // Blue
  watching: '#10b981', // Emerald
  plan_to_watch: '#8b5cf6', // Violet
  on_hold: '#f59e0b', // Amber
  dropped: '#f43f5e', // Rose
};

export const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  watching: 'Watching',
  plan_to_watch: 'Plan to Watch',
  on_hold: 'On Hold',
  dropped: 'Dropped',
};

export const GENRE_PALETTE = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#84cc16', // Lime
  '#06b6d4', // Cyan
  '#d946ef', // Fuchsia
  '#eab308', // Yellow
  '#a855f7', // Purple
  '#64748b', // Slate
  '#0284c7', // Sky
  '#16a34a', // Green
];

// Reusable calculation helper for statistics
export function computeAnimeStats(
  items: MalListItem[],
  options?: {
    customGenreItems?: Array<{ node?: any; list_status?: any }>;
    genreOnlyWatching?: boolean;
  }
) {
  const totalAnime = items.length;

  let watchingCount = 0;
  let completedCount = 0;
  let ptwCount = 0;
  let onHoldCount = 0;
  let droppedCount = 0;
  let otherCount = 0;
  let totalEpisodesWatched = 0;

  let ratedCount = 0;
  let scoreSum = 0;

  const scoreDistribution: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
    10: 0,
  };

  const genreMap = new Map<string, number>();

  for (const item of items) {
    const status = item.list_status?.status;
    if (status === 'watching') watchingCount++;
    else if (status === 'completed') completedCount++;
    else if (status === 'plan_to_watch') ptwCount++;
    else if (status === 'on_hold') onHoldCount++;
    else if (status === 'dropped') droppedCount++;
    else otherCount++;

    const watched = Number(item.list_status?.num_episodes_watched);
    if (!isNaN(watched) && watched > 0) {
      totalEpisodesWatched += watched;
    }

    const score = Number(item.list_status?.score);
    if (!isNaN(score) && score > 0) {
      ratedCount++;
      scoreSum += score;
      const roundedScore = Math.min(10, Math.max(1, Math.round(score)));
      scoreDistribution[roundedScore] = (scoreDistribution[roundedScore] || 0) + 1;
    }
  }

  // Genre distribution calculation:
  // Strictly compute genres ONLY for currently-watching anime when options specify customGenreItems or genreOnlyWatching.
  const rawGenreItems: Array<{ node?: any; list_status?: any }> = options?.customGenreItems
    ? options.customGenreItems
    : options?.genreOnlyWatching
    ? items.filter((item) => item.list_status?.status === 'watching')
    : items;

  // Filter so that non-watching anime never contribute genres to the watching chart
  const genreItems = options?.customGenreItems || options?.genreOnlyWatching
    ? rawGenreItems.filter((item) => item.list_status?.status === 'watching')
    : rawGenreItems;

  for (const item of genreItems) {
    const genres = item.node?.genres;
    if (Array.isArray(genres)) {
      const seenGenres = new Set<string>();
      for (const g of genres) {
        if (g?.name && typeof g.name === 'string' && !seenGenres.has(g.name)) {
          seenGenres.add(g.name);
          genreMap.set(g.name, (genreMap.get(g.name) || 0) + 1);
        }
      }
    }
  }

  const avgScore = ratedCount > 0 ? (scoreSum / ratedCount).toFixed(1) : null;

  let maxFreq = 0;
  let mostCommonScore: number | null = null;
  for (let s = 10; s >= 1; s--) {
    if (scoreDistribution[s] > maxFreq) {
      maxFreq = scoreDistribution[s];
      mostCommonScore = s;
    }
  }

  const statusChartData = [
    { name: 'Completed', key: 'completed', value: completedCount, color: STATUS_COLORS.completed },
    { name: 'Watching', key: 'watching', value: watchingCount, color: STATUS_COLORS.watching },
    { name: 'Plan to Watch', key: 'plan_to_watch', value: ptwCount, color: STATUS_COLORS.plan_to_watch },
    { name: 'On Hold', key: 'on_hold', value: onHoldCount, color: STATUS_COLORS.on_hold },
    { name: 'Dropped', key: 'dropped', value: droppedCount, color: STATUS_COLORS.dropped },
  ].filter((entry) => entry.value > 0);

  const scoreChartData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => ({
    score: `${score}★`,
    scoreNum: score,
    count: scoreDistribution[score] || 0,
  }));

  const allGenresList = Array.from(genreMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const totalGenreInstances = allGenresList.reduce((acc, g) => acc + g.count, 0);

  const genreChartData = allGenresList.map((g, idx) => ({
    name: g.name,
    count: g.count,
    value: g.count,
    color: GENRE_PALETTE[idx % GENRE_PALETTE.length],
    percentage: totalGenreInstances > 0 ? Math.round((g.count / totalGenreInstances) * 100) : 0,
  }));

  const topGenres = allGenresList.slice(0, 10);

  // Watching progress items
  const watchingList = items
    .filter((item) => item.list_status?.status === 'watching')
    .map((item) => {
      const watched = Number(item.list_status?.num_episodes_watched) || 0;
      const total = Number(item.node?.num_episodes) || 0;
      const hasTotal = total > 0;
      const progressPercent = hasTotal ? Math.min(100, Math.round((watched / total) * 100)) : null;

      return {
        item,
        watched,
        total,
        hasTotal,
        progressPercent,
      };
    });

  // Calculate overall watching progress percentage for this dataset
  let watchingKnownWatchedSum = 0;
  let watchingKnownTotalSum = 0;
  for (const w of watchingList) {
    if (w.hasTotal) {
      watchingKnownWatchedSum += w.watched;
      watchingKnownTotalSum += w.total;
    }
  }
  const overallWatchingProgress =
    watchingKnownTotalSum > 0
      ? {
          watched: watchingKnownWatchedSum,
          total: watchingKnownTotalSum,
          percent: Math.min(100, Math.round((watchingKnownWatchedSum / watchingKnownTotalSum) * 100)),
        }
      : null;

  watchingList.sort((a, b) => {
    if (a.progressPercent !== null && b.progressPercent !== null) {
      if (b.progressPercent !== a.progressPercent) {
        return b.progressPercent - a.progressPercent;
      }
    } else if (a.progressPercent !== null) {
      return -1;
    } else if (b.progressPercent !== null) {
      return 1;
    }

    if (b.watched !== a.watched) {
      return b.watched - a.watched;
    }
    return (a.item.node?.title || '').localeCompare(b.item.node?.title || '');
  });

  // Top rated items (rated > 0)
  const topRated = items
    .filter((item) => {
      const score = Number(item.list_status?.score);
      return !isNaN(score) && score > 0;
    })
    .sort((a, b) => {
      const scoreA = Number(a.list_status.score) || 0;
      const scoreB = Number(b.list_status.score) || 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return (a.node?.title || '').localeCompare(b.node?.title || '');
    });

  return {
    totalAnime,
    watchingCount,
    completedCount,
    ptwCount,
    onHoldCount,
    droppedCount,
    otherCount,
    totalEpisodesWatched,
    ratedCount,
    avgScore,
    mostCommonScore,
    maxFreq,
    statusChartData,
    scoreChartData,
    topGenres,
    genreChartData,
    totalGenreInstances,
    watchingList,
    overallWatchingProgress,
    topRated,
  };
}
