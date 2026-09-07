import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  Tv,
  CheckCircle2,
  Clock,
  Film,
  Star,
  Layers,
  Sparkles,
  TrendingUp,
  UserCheck,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sun,
  Flame,
  Percent,
  Compass,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { MalListItem, MalUser } from '../types';
import { AnimeDetailModal, AnimeDetailData } from './AnimeDetailModal';
import { decodeHtmlEntities } from '../utils/htmlUtils';

interface StatusDashboardProps {
  malList: MalListItem[];
  summer2026List: MalListItem[];
  watchingSummer2026List?: Array<{ node?: any; list_status?: any }>;
  currentSeasonName?: string;
  earliestStartDate?: string | null;
  earliestAiringDate?: string | null;
  malUser: MalUser | null;
  malLoading: boolean;
  malError: string | null;
  customUserNotes?: Record<number, string>;
  onSaveCustomNote?: (animeId: number, note: string) => void;
  onConnectMal: () => void;
  onRefreshMal: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#3b82f6', // Blue
  watching: '#10b981', // Emerald
  plan_to_watch: '#8b5cf6', // Violet
  on_hold: '#f59e0b', // Amber
  dropped: '#f43f5e', // Rose
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  watching: 'Watching',
  plan_to_watch: 'Plan to Watch',
  on_hold: 'On Hold',
  dropped: 'Dropped',
};

const GENRE_PALETTE = [
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

export function StatusDashboard({
  malList,
  summer2026List,
  watchingSummer2026List,
  currentSeasonName = 'SUMMER 2026',
  earliestStartDate,
  earliestAiringDate,
  malUser,
  malLoading,
  malError,
  customUserNotes = {},
  onSaveCustomNote,
  onConnectMal,
  onRefreshMal,
}: StatusDashboardProps) {
  const [showAllSeasonalWatching, setShowAllSeasonalWatching] = useState<boolean>(false);
  const [showAllOverallWatching, setShowAllOverallWatching] = useState<boolean>(false);
  const [selectedAnimeForModal, setSelectedAnimeForModal] = useState<AnimeDetailData | null>(null);
  const [selectedGenreModal, setSelectedGenreModal] = useState<{
    genre: string;
    source: 'seasonal' | 'overall';
    color?: string;
  } | null>(null);

  // Escape key handler to close the genre modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedGenreModal) {
        setSelectedGenreModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGenreModal]);

  // Gemini Insights state
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiData, setGeminiData] = useState<{
    summaryHeadline: string;
    insights: (string | { category: string; insight: string })[];
  } | null>(null);

  const effectiveAiringDate = earliestAiringDate || earliestStartDate;

  const handleOpenAnimeModal = useCallback((item: MalListItem) => {
    const modalData: AnimeDetailData = {
      id: item.node.id,
      malId: item.node.id,
      title: item.node.title,
      titleEnglish: (item.node as any).alternative_titles?.en,
      titleNative: (item.node as any).alternative_titles?.ja,
      imageUrl: item.node.main_picture?.large || item.node.main_picture?.medium,
      score: item.node.mean,
      userScore: item.list_status?.score,
      episodes: item.node.num_episodes,
      episodesWatched: item.list_status?.num_episodes_watched,
      status: item.list_status?.status || item.node.status,
      mediaType: item.node.media_type,
      startDate: item.node.start_date,
      endDate: item.node.end_date,
      broadcast: item.node.broadcast,
      season: item.node.start_season,
      genres: item.node.genres,
      synopsis: item.node.synopsis,
      comment: item.list_status?.comments ? decodeHtmlEntities(item.list_status.comments) : undefined,
      finishDate: item.list_status?.finish_date,
    };
    setSelectedAnimeForModal(modalData);
  }, []);

  // 1. Summer 2026 Seasonal Statistics (genres computed strictly and exclusively for currently-watching Summer 2026 anime)
  const seasonalStats = useMemo(() => {
    const watchingItems = watchingSummer2026List || summer2026List.filter((item) => item.list_status?.status === 'watching');
    return computeAnimeStats(summer2026List, { customGenreItems: watchingItems });
  }, [summer2026List, watchingSummer2026List]);

  // Dataset Composition & Deduplication Audit
  const seasonalAudit = useMemo(() => {
    let watchingCount = 0;
    let completedCount = 0;
    let otherCount = 0;

    for (const item of summer2026List) {
      if (item.list_status?.status === 'watching') {
        watchingCount++;
      } else if (item.list_status?.status === 'completed') {
        completedCount++;
      } else {
        otherCount++;
      }
    }

    const uniqueIdCount = new Set(summer2026List.map((i) => i.node?.id)).size;

    return {
      total: summer2026List.length,
      uniqueIdCount,
      watchingCount,
      completedCount,
      otherCount,
    };
  }, [summer2026List]);

  // 2. Complete Overall Statistics
  const overallStats = useMemo(() => {
    return computeAnimeStats(malList);
  }, [malList]);

  // Anime list matching the currently selected genre in the interactive modal
  const genreModalAnimeList = useMemo(() => {
    if (!selectedGenreModal) return [];
    const targetGenre = selectedGenreModal.genre.toLowerCase();
    const sourceList = selectedGenreModal.source === 'seasonal'
      ? ((watchingSummer2026List && watchingSummer2026List.length > 0)
          ? watchingSummer2026List
          : summer2026List.filter((item) => item.list_status?.status === 'watching'))
      : malList;

    const matches: MalListItem[] = [];
    const seenIds = new Set<number>();

    for (const item of sourceList) {
      if (!item?.node?.id || seenIds.has(item.node.id)) continue;
      const genres = item.node.genres;
      if (Array.isArray(genres)) {
        const hasGenre = genres.some((g: any) => g?.name && g.name.toLowerCase() === targetGenre);
        if (hasGenre) {
          seenIds.add(item.node.id);
          matches.push(item as MalListItem);
        }
      }
    }

    // Sort by score descending, then title
    return matches.sort((a, b) => {
      const scoreA = Number(a.list_status?.score) || Number(a.node?.mean) || 0;
      const scoreB = Number(b.list_status?.score) || Number(b.node?.mean) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.node?.title || '').localeCompare(b.node?.title || '');
    });
  }, [selectedGenreModal, watchingSummer2026List, summer2026List, malList]);

  // Gemini Insights Analysis Handler
  const handleAnalyzeWatching = useCallback(async () => {
    setGeminiLoading(true);
    setGeminiError(null);

    try {
      const statsPayload = {
        overall: {
          totalAnime: overallStats.totalAnime,
          completedCount: overallStats.completedCount,
          watchingCount: overallStats.watchingCount,
          planToWatchCount: overallStats.ptwCount,
          onHoldCount: overallStats.onHoldCount,
          droppedCount: overallStats.droppedCount,
          totalEpisodesWatched: overallStats.totalEpisodesWatched,
          averageScore: overallStats.avgScore,
          mostCommonScore: overallStats.mostCommonScore,
          topGenres: overallStats.topGenres.map((g) => ({ genre: g.name, count: g.count })),
          currentlyWatchingTitles: overallStats.watchingList.slice(0, 10).map((w) => w.item.node?.title).filter(Boolean),
          topRatedTitles: overallStats.topRated.slice(0, 5).map((t) => ({ title: t.node?.title, score: t.list_status?.score })).filter((t) => t.title),
        },
        currentSeason: {
          seasonName: currentSeasonName,
          totalAnimeTracked: seasonalStats.totalAnime,
          watchingCount: seasonalStats.watchingCount,
          completedCount: seasonalStats.completedCount,
          totalEpisodesWatched: seasonalStats.totalEpisodesWatched,
          averageScore: seasonalStats.avgScore,
        },
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = sessionStorage.getItem('mal_session_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-mal-session'] = token;
      }

      const res = await fetch('/api/gemini/insights', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ statsData: statsPayload }),
      });

      if (!res.ok) {
        setGeminiError('Gemini Insights is currently unavailable.');
        return;
      }

      const data = await res.json();
      if (data && data.available) {
        setGeminiData({
          summaryHeadline: data.summaryHeadline || 'Your Anime Journey',
          insights: Array.isArray(data.insights) ? data.insights : [data.insights],
        });
      } else {
        setGeminiError(data?.message || 'Gemini Insights is currently unavailable.');
      }
    } catch (err) {
      console.error('[GEMINI INSIGHTS] Request error:', err);
      setGeminiError('Gemini Insights is currently unavailable.');
    } finally {
      setGeminiLoading(false);
    }
  }, [overallStats, seasonalStats, currentSeasonName]);

  // Not connected state
  if (!malUser && !malLoading) {
    return (
      <div className="space-y-6">
        {/* Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-600 text-white p-6 sm:p-8 rounded-3xl shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-6 w-6 text-emerald-300" />
              <span className="text-xs font-black tracking-widest uppercase bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                Personal Analytics
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">STATUS DASHBOARD</h2>
            <p className="text-white/80 font-medium text-xs sm:text-sm mt-1">
              Connect your MyAnimeList account to unlock your seasonal and overall anime statistics.
            </p>
          </div>
        </div>

        {/* Connect MAL Prompt */}
        <div className="text-center py-16 px-6 max-w-lg mx-auto bg-white rounded-3xl border-2 border-indigo-100 shadow-xl my-6">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mx-auto mb-5 text-indigo-600 shadow-xs">
            <BarChart3 className="h-8 w-8 text-indigo-600" />
          </div>
          <h3 className="text-xl font-black text-indigo-900 mb-2">No MAL Anime Data Available Yet</h3>
          <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
            Connect your MyAnimeList account to view your Summer 2026 season breakdown and lifetime anime stats.
          </p>

          <button
            id="status-connect-mal-btn"
            onClick={onConnectMal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-4 px-8 rounded-2xl shadow-[0_4px_0_0_rgba(49,46,129,1)] active:translate-y-[2px] active:shadow-[0_2px_0_0_rgba(49,46,129,1)] transition-all inline-flex items-center gap-2.5 cursor-pointer text-base"
          >
            <ExternalLink className="h-5 w-5" />
            <span>Connect MyAnimeList Account</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* 1. Main Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E7E3DF] p-6 sm:p-8 rounded-2xl shadow-2xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0EDFA] text-[#7567C7] text-xs font-bold tracking-widest uppercase mb-2">
            <BarChart3 className="h-3.5 w-3.5 text-[#6D9B7C]" />
            <span>STATS & ANALYTICS</span>
          </div>
          <h2 className="text-3xl font-bold text-[#25242A]">STATS</h2>
          <p className="text-[#77747D] text-xs sm:text-sm mt-1">
            Visual summary of your seasonal progress and complete anime history.
          </p>
          {malUser && (
            <div className="mt-3 inline-flex items-center gap-2 bg-[#F7F5F2] border border-[#E7E3DF] px-3 py-1.5 rounded-xl text-xs font-semibold text-[#25242A]">
              <UserCheck className="h-3.5 w-3.5 text-[#6D9B7C]" />
              <span>
                MAL Account: <span className="font-bold text-[#7567C7]">{malUser.name}</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="status-refresh-btn"
            onClick={onRefreshMal}
            disabled={malLoading}
            className="bg-[#F7F5F2] hover:bg-white text-[#25242A] border border-[#E7E3DF] font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 text-xs cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`h-4 w-4 text-[#7567C7] ${malLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Stats</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {malError && (
        <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-900 text-sm font-bold flex items-center gap-2">
          <span>{malError}</span>
        </div>
      )}

      {/* Loading Skeletons */}
      {malLoading && (
        <div className="space-y-8">
          <div className="bg-emerald-950/20 rounded-3xl p-6 border-2 border-emerald-200/50 space-y-4">
            <div className="h-8 bg-emerald-200/30 rounded-xl w-48 animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm animate-pulse h-28" />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 border-2 border-indigo-100 space-y-4">
            <div className="h-8 bg-indigo-100 rounded-xl w-48 animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-slate-100 rounded-2xl p-4 border border-slate-200 shadow-sm animate-pulse h-28" />
              ))}
            </div>
          </div>
        </div>
      )}

      {!malLoading && malList.length === 0 && (
        <div className="text-center py-16 px-6 max-w-md mx-auto bg-white rounded-3xl border-2 border-indigo-100 shadow-md my-8">
          <p className="text-slate-500 font-bold text-sm">
            Your MyAnimeList is currently empty. Add anime on MyAnimeList to view your stats here!
          </p>
        </div>
      )}

      {!malLoading && malList.length > 0 && (
        <>
          {/* GEMINI INSIGHTS CARD */}
          {malUser && (
            <div className="bg-[#F0EDFA] text-[#25242A] rounded-2xl p-6 sm:p-8 border border-[#7567C7]/30 shadow-2xs space-y-5 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#7567C7]/20 pb-5 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="h-5 w-5 text-[#7567C7] animate-pulse" />
                    <span className="text-[11px] font-bold tracking-widest uppercase bg-[#7567C7]/15 text-[#7567C7] border border-[#7567C7]/30 px-3 py-0.5 rounded-full">
                      GEMINI INSIGHT
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#25242A]">
                    Your Anime Journey
                  </h3>
                </div>

                <button
                  onClick={handleAnalyzeWatching}
                  disabled={geminiLoading}
                  className="bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold px-6 py-3 rounded-xl shadow-2xs transition-all flex items-center gap-2 text-sm cursor-pointer self-start sm:self-auto shrink-0 active:scale-95 disabled:opacity-60"
                >
                  <Sparkles className={`h-4 w-4 ${geminiLoading ? 'animate-spin' : ''}`} />
                  <span>{geminiLoading ? 'Analyzing...' : geminiData ? 'Re-analyze Watching' : '✨ Analyze My Watching'}</span>
                </button>
              </div>

              <div className="relative z-10">
                {geminiLoading && (
                  <div className="py-8 text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#7567C7]/10 text-[#7567C7] animate-bounce">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-[#7567C7]">
                      Analyzing your anime watching patterns with Gemini...
                    </p>
                  </div>
                )}

                {!geminiLoading && geminiError && (
                  <div className="p-4 rounded-xl bg-[#D6A0AF]/15 border border-[#D6A0AF]/40 text-[#C77B82] text-sm font-bold flex items-center gap-2">
                    <span>{geminiError}</span>
                  </div>
                )}

                {!geminiLoading && !geminiError && geminiData && (
                  <div className="space-y-4">
                    <p className="text-base sm:text-lg font-bold text-[#7567C7] italic border-l-4 border-[#7567C7] pl-4 py-1">
                      "{geminiData.summaryHeadline}"
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {geminiData.insights.map((item, idx) => {
                        const category = typeof item === 'object' && item !== null ? item.category : null;
                        const text = typeof item === 'object' && item !== null ? item.insight : item;
                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-xl bg-white border border-[#E7E3DF] text-xs sm:text-sm font-normal text-[#25242A] leading-relaxed flex items-start gap-3 shadow-2xs hover:border-[#7567C7]/40 transition-colors"
                          >
                            <div className="p-1.5 rounded-lg bg-[#7567C7]/10 text-[#7567C7] shrink-0 mt-0.5">
                              <Sparkles className="h-4 w-4" />
                            </div>
                            <div>
                              {category && (
                                <div className="text-[10px] font-bold uppercase tracking-wider text-[#7567C7] mb-0.5">
                                  ✦ {category}
                                </div>
                              )}
                              <div>{text}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!geminiLoading && !geminiError && !geminiData && (
                  <div className="py-4">
                    <p className="text-[#25242A] text-sm sm:text-base font-normal italic border-l-4 border-[#7567C7] pl-4 py-1 leading-relaxed">
                      "{seasonalStats.totalAnime > 0
                        ? `You watched ${seasonalStats.totalAnime} anime this season, with an average score of ${seasonalStats.avgScore || 'N/A'}/10. ${overallStats.topGenres[0] ? `${overallStats.topGenres[0].name} and ${overallStats.topGenres[1]?.name || 'Action'} are among your most watched genres.` : ''}`
                        : overallStats.totalAnime > 0
                        ? `You have ${overallStats.totalAnime} total anime in your list with an average score of ${overallStats.avgScore || 'N/A'}/10.`
                        : 'Click Analyze My Watching to generate personalized insights about your viewing habits!'}"
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#7567C7]/20 flex items-center justify-between text-[11px] font-semibold text-[#77747D] relative z-10">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#C69A55]" />
                  <span>Powered by Gemini</span>
                </div>
                <span>AI Analytics Engine</span>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 1: SUMMER 2026 SEASONAL DASHBOARD (FIRST / VISUALLY PROMINENT)     */}
          {/* ========================================================================= */}
          <section id="status-summer-2026-section" className="space-y-6">
            {/* Seasonal Section Header Banner */}
            <div className="bg-white text-[#25242A] p-5 sm:p-6 rounded-2xl border border-[#E7E3DF] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-[#6D9B7C]/15 text-[#6D9B7C] rounded-xl border border-[#6D9B7C]/30 shrink-0">
                  <Sun className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest bg-[#6D9B7C]/15 text-[#6D9B7C] border border-[#6D9B7C]/30 px-2.5 py-0.5 rounded-md">
                      ✦ CURRENT SEASON
                    </span>
                    <span className="text-xs font-semibold text-[#77747D]">
                      Active Broadcast Window
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#25242A] mt-1">
                    {currentSeasonName}
                  </h3>
                  <p className="text-[#77747D] font-normal text-xs mt-0.5">
                    Your personal anime tracker and completion analytics for this season.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-[#F7F5F2] px-4 py-2 rounded-xl border border-[#E7E3DF] shrink-0">
                <Flame className="h-4 w-4 text-[#C69A55]" />
                <div className="text-right sm:text-left">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-[#77747D] block">
                    Seasonal Library
                  </span>
                  <span className="text-sm font-bold text-[#25242A]">
                    {seasonalStats.totalAnime} Anime Tracked
                  </span>
                </div>
              </div>
            </div>

            {/* Seasonal Dataset Composition & Scope Info Card */}
            <div className="bg-[#F7F5F2] rounded-xl p-4 sm:p-5 border border-[#E7E3DF] text-xs text-[#77747D] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#6D9B7C]/15 text-[#6D9B7C] border border-[#6D9B7C]/30 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h5 className="font-bold text-[#25242A] text-xs sm:text-sm">Summer 2026 Dataset Scope</h5>
                  <p className="text-[11px] text-[#77747D] mt-0.5">
                    {effectiveAiringDate
                      ? `Includes currently watching Summer 2026 anime + anime completed on or after the earliest 1st-episode airing date (${effectiveAiringDate}), excluding Spring 2026 titles.`
                      : 'Includes currently watching Summer 2026 anime + anime completed on or after your earliest Summer 2026 anime broadcast date.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold shrink-0">
                <span className="px-2.5 py-1 rounded-lg bg-[#6D9B7C]/15 text-[#6D9B7C] border border-[#6D9B7C]/30">
                  {seasonalAudit.watchingCount} Watching
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#7567C7]/15 text-[#7567C7] border border-[#7567C7]/30">
                  {seasonalAudit.completedCount} Completed in Season
                </span>
                {seasonalAudit.otherCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#C69A55]/15 text-[#C69A55] border border-[#C69A55]/30">
                    {seasonalAudit.otherCount} Other
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
                  {seasonalAudit.total} Total Unique Anime
                </span>
              </div>
            </div>

            {seasonalStats.totalAnime === 0 ? (
              <div className="bg-emerald-50/50 rounded-3xl p-8 border-2 border-dashed border-emerald-200 text-center">
                <Sun className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                <h4 className="text-base font-black text-emerald-950">No {currentSeasonName} Anime Added Yet</h4>
                <p className="text-xs font-bold text-slate-500 mt-1 max-w-md mx-auto">
                  Add {currentSeasonName} anime to your MyAnimeList to unlock your seasonal statistics, charts, and episode progress!
                </p>
              </div>
            ) : (
              <>
                {/* Seasonal Overview Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {/* Watching */}
                  <div className="bg-white rounded-2xl p-4 border-2 border-emerald-200 shadow-md flex flex-col justify-between hover:border-emerald-400 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                        Watching
                      </span>
                      <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                        <Film className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
                        {seasonalStats.watchingCount}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">active this season</p>
                    </div>
                  </div>

                  {/* Completed */}
                  <div className="bg-white rounded-2xl p-4 border-2 border-blue-100 shadow-md flex flex-col justify-between hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-700">
                        Completed
                      </span>
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-2xl sm:text-3xl font-black text-blue-700 tracking-tight">
                        {seasonalStats.completedCount}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">finished season series</p>
                    </div>
                  </div>

                  {/* Plan to Watch */}
                  <div className="bg-white rounded-2xl p-4 border-2 border-purple-100 shadow-md flex flex-col justify-between hover:border-purple-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-purple-700">
                        Plan to Watch
                      </span>
                      <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                        <Clock className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-2xl sm:text-3xl font-black text-purple-700 tracking-tight">
                        {seasonalStats.ptwCount}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">in queue this season</p>
                    </div>
                  </div>

                  {/* Episodes Watched */}
                  <div className="bg-white rounded-2xl p-4 border-2 border-amber-100 shadow-md flex flex-col justify-between hover:border-amber-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                        Episodes Watched
                      </span>
                      <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                        <Layers className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-2xl sm:text-3xl font-black text-amber-900 tracking-tight">
                        {seasonalStats.totalEpisodesWatched.toLocaleString()}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">recorded seasonal eps</p>
                    </div>
                  </div>

                  {/* Average Score */}
                  <div className="bg-white rounded-2xl p-4 border-2 border-pink-100 shadow-md flex flex-col justify-between hover:border-pink-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-pink-700">
                        Average Score
                      </span>
                      <div className="p-1.5 rounded-lg bg-pink-50 text-pink-600">
                        <Star className="h-4 w-4 fill-pink-500 text-pink-500" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-black text-pink-700 tracking-tight">
                          {seasonalStats.avgScore ? seasonalStats.avgScore : '—'}
                        </span>
                        {seasonalStats.avgScore && <span className="text-sm font-black text-pink-500">★</span>}
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {seasonalStats.ratedCount} rated
                      </p>
                    </div>
                  </div>

                  {/* Overall Season Progress */}
                  <div className="bg-white rounded-2xl p-4 border-2 border-emerald-200 shadow-md flex flex-col justify-between hover:border-emerald-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
                        Season Progress
                      </span>
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                        <Percent className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-black text-emerald-800 tracking-tight">
                          {seasonalStats.overallWatchingProgress
                            ? `${seasonalStats.overallWatchingProgress.percent}%`
                            : '—'}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {seasonalStats.overallWatchingProgress
                          ? `${seasonalStats.overallWatchingProgress.watched} / ${seasonalStats.overallWatchingProgress.total} eps`
                          : 'unknown total eps'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Seasonal Charts: Status Distribution & Score Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Status Donut Chart */}
                  <div className="bg-white dark:bg-[#1E1D24] rounded-3xl p-6 sm:p-7 border-2 border-emerald-100 dark:border-[#2E2C37] shadow-lg flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-emerald-50 dark:border-[#2E2C37]">
                      <div>
                        <h4 className="text-lg font-black text-slate-900 dark:text-[#F4F2F7] flex items-center gap-2">
                          <Sun className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          {currentSeasonName} Status Distribution
                        </h4>
                        <p className="text-xs font-semibold text-slate-500 dark:text-[#9E9AA6] mt-0.5">
                          Status breakdown for your {currentSeasonName} anime
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                      <div className="sm:col-span-7 h-56 w-full relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={seasonalStats.statusChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {seasonalStats.statusChartData.map((entry) => (
                                <Cell key={entry.key} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              formatter={(value: any, name: any) => [
                                `${value} anime (${Math.round(((Number(value) || 0) / (seasonalStats.totalAnime || 1)) * 100)}%)`,
                                name,
                              ]}
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '12px',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-2xl font-black text-emerald-950 dark:text-[#F4F2F7] tracking-tight">
                            {seasonalStats.totalAnime}
                          </span>
                          <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            SEASONAL
                          </span>
                        </div>
                      </div>

                      <div className="sm:col-span-5 space-y-1.5">
                        {[
                          { key: 'completed', label: 'Completed', count: seasonalStats.completedCount, color: STATUS_COLORS.completed },
                          { key: 'watching', label: 'Watching', count: seasonalStats.watchingCount, color: STATUS_COLORS.watching },
                          { key: 'plan_to_watch', label: 'Plan to Watch', count: seasonalStats.ptwCount, color: STATUS_COLORS.plan_to_watch },
                          { key: 'on_hold', label: 'On Hold', count: seasonalStats.onHoldCount, color: STATUS_COLORS.on_hold },
                          { key: 'dropped', label: 'Dropped', count: seasonalStats.droppedCount, color: STATUS_COLORS.dropped },
                        ].map((status) => {
                          const percent =
                            seasonalStats.totalAnime > 0
                              ? Math.round((status.count / seasonalStats.totalAnime) * 100)
                              : 0;
                          return (
                            <div
                              key={status.key}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#26252F] border border-slate-100 dark:border-[#363442] text-xs font-bold transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: status.color }} />
                                <span className="text-slate-700 dark:text-[#E2DEED] font-extrabold">{status.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-900 dark:text-white font-black">{status.count}</span>
                                <span className="text-[10px] text-slate-400 dark:text-[#9E9AA6] w-8 text-right font-bold">{percent}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Seasonal Score Distribution Bar Chart */}
                  <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-emerald-100 shadow-lg flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-emerald-50">
                      <div>
                        <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                          <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                          {currentSeasonName} Score Distribution
                        </h4>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                          Ratings given to {currentSeasonName} anime
                        </p>
                      </div>
                      {seasonalStats.mostCommonScore !== null && seasonalStats.maxFreq > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
                          Most common: <span className="font-black text-amber-950">{seasonalStats.mostCommonScore}★</span>
                        </span>
                      )}
                    </div>

                    {seasonalStats.ratedCount === 0 ? (
                      <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Star className="h-7 w-7 text-slate-300 mb-2" />
                        <p className="text-xs font-bold text-slate-500">No scored {currentSeasonName} anime recorded yet.</p>
                      </div>
                    ) : (
                      <div className="h-56 w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={seasonalStats.scoreChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="score"
                              tickLine={false}
                              axisLine={{ stroke: '#e2e8f0' }}
                              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                            />
                            <YAxis
                              allowDecimals={false}
                              tickLine={false}
                              axisLine={{ stroke: '#e2e8f0' }}
                              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                            />
                            <RechartsTooltip
                              formatter={(value: any, name: any, props: any) => [
                                `${value} anime rated ${props?.payload?.scoreNum || ''}★`,
                                'Count',
                              ]}
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '12px',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                              }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {seasonalStats.scoreChartData.map((entry) => (
                                <Cell
                                  key={`seasonal-cell-${entry.scoreNum}`}
                                  fill={
                                    entry.scoreNum === seasonalStats.mostCommonScore
                                      ? '#10b981'
                                      : entry.scoreNum >= 8
                                      ? '#6366f1'
                                      : '#94a3b8'
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seasonal Watching Progress Section */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-emerald-100 shadow-xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-emerald-100">
                    <div>
                      <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Film className="h-6 w-6 text-emerald-600" />
                        {currentSeasonName} Watching Progress
                      </h4>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">
                        Episode completion for your active {currentSeasonName} anime ({seasonalStats.watchingList.length} total)
                      </p>
                    </div>

                    {seasonalStats.watchingList.length > 10 && (
                      <button
                        onClick={() => setShowAllSeasonalWatching(!showAllSeasonalWatching)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs transition-colors cursor-pointer self-start sm:self-auto border border-emerald-200"
                      >
                        <span>{showAllSeasonalWatching ? 'Show Top 10' : `Show All (${seasonalStats.watchingList.length})`}</span>
                        {showAllSeasonalWatching ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {seasonalStats.watchingList.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-sm font-bold text-slate-500">
                        No {currentSeasonName} anime currently marked as "Watching" in your MyAnimeList.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(showAllSeasonalWatching
                        ? seasonalStats.watchingList
                        : seasonalStats.watchingList.slice(0, 10)
                      ).map(({ item, watched, total, hasTotal, progressPercent }) => {
                        const poster =
                          item.node?.main_picture?.medium ||
                          item.node?.main_picture?.large ||
                          '';
                        const title = item.node?.title || 'Unknown Title';

                        return (
                          <div
                            key={`seasonal-watch-${item.node?.id}`}
                            onClick={() => handleOpenAnimeModal(item)}
                            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition-all shadow-xs cursor-pointer group"
                          >
                            <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-200 shrink-0 shadow-xs border border-slate-300 group-hover:scale-105 transition-transform">
                              {poster ? (
                                <img
                                  src={poster}
                                  alt={title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <Film className="h-5 w-5" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <h5 className="font-extrabold text-sm text-slate-900 truncate group-hover:text-emerald-700 transition-colors" title={title}>
                                  {title}
                                </h5>
                                {hasTotal && progressPercent !== null ? (
                                  <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                                    {progressPercent}%
                                  </span>
                                ) : null}
                              </div>

                              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden mb-1.5 shadow-inner">
                                {hasTotal && progressPercent !== null ? (
                                  <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                ) : (
                                  <div className="h-full bg-emerald-500/60 rounded-full w-full animate-pulse" />
                                )}
                              </div>

                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                                {hasTotal ? (
                                  <span>
                                    <span className="text-slate-900 font-extrabold">{watched}</span> / {total} episodes
                                  </span>
                                ) : (
                                  <span className="text-slate-700">
                                    <span className="font-black text-slate-900">{watched}</span> episodes watched (total TBA)
                                  </span>
                                )}

                                {item.list_status?.score && item.list_status.score > 0 ? (
                                  <span className="text-amber-600 font-extrabold">★ {item.list_status.score}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Seasonal Top Genres & Top Rated This Season */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Genres (Summer 2026) - PIE CHART */}
                  <div className="bg-white dark:bg-[#1E1D24] rounded-3xl p-6 sm:p-7 border-2 border-emerald-100 dark:border-[#2E2C37] shadow-xl space-y-4 flex flex-col justify-between">
                    <div className="border-b border-emerald-50 dark:border-[#2E2C37] pb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-black text-slate-900 dark:text-[#F4F2F7] flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          {currentSeasonName} Top Genres
                        </h4>
                        <p className="text-xs font-semibold text-slate-500 dark:text-[#9E9AA6] mt-0.5">
                          Genre distribution among your currently watching {currentSeasonName} anime
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hidden sm:inline">
                          Click genre to view
                        </span>
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
                          {seasonalStats.genreChartData.length} Genres
                        </span>
                      </div>
                    </div>

                    {seasonalStats.genreChartData.length === 0 ? (
                      <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50 dark:bg-[#26252F] rounded-2xl border border-dashed border-slate-200 dark:border-[#363442]">
                        <p className="text-xs font-bold text-slate-500 dark:text-[#9E9AA6]">No genres found for your currently watching {currentSeasonName} anime.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1">
                        <div className="sm:col-span-6 h-56 w-full relative flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={seasonalStats.genreChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={42}
                                outerRadius={76}
                                paddingAngle={2}
                                dataKey="value"
                                cursor="pointer"
                                onClick={(entry: any) => {
                                  if (entry && entry.name) {
                                    setSelectedGenreModal({
                                      genre: entry.name,
                                      source: 'seasonal',
                                      color: entry.color,
                                    });
                                  }
                                }}
                              >
                                {seasonalStats.genreChartData.map((entry) => (
                                  <Cell
                                    key={`seasonal-pie-${entry.name}`}
                                    fill={entry.color}
                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                  />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                formatter={(value: any, name: any) => [
                                  `${value} watching anime (${Math.round(((Number(value) || 0) / (seasonalStats.totalGenreInstances || 1)) * 100)}%) — Click to view`,
                                  name,
                                ]}
                                contentStyle={{
                                  backgroundColor: '#1E1D24',
                                  border: '1px solid #363442',
                                  borderRadius: '12px',
                                  color: '#F4F2F7',
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xl font-black text-slate-900 dark:text-[#F4F2F7] tracking-tight">
                              {seasonalStats.genreChartData.length}
                            </span>
                            <span className="text-[9px] font-extrabold text-slate-400 dark:text-[#9E9AA6] uppercase tracking-wider">
                              GENRES
                            </span>
                          </div>
                        </div>

                        <div className="sm:col-span-6 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {seasonalStats.genreChartData.map((genre) => (
                            <div
                              key={`seasonal-legend-${genre.name}`}
                              onClick={() =>
                                setSelectedGenreModal({
                                  genre: genre.name,
                                  source: 'seasonal',
                                  color: genre.color,
                                })
                              }
                              title={`Click to view ${genre.name} anime`}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#26252F] hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 border border-slate-100 dark:border-[#363442] hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all text-xs font-bold cursor-pointer hover:translate-x-0.5 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs group-hover:scale-125 transition-transform"
                                  style={{ backgroundColor: genre.color }}
                                />
                                <span className="text-slate-700 dark:text-[#E2DEED] font-extrabold truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400" title={genre.name}>
                                  {genre.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-900 dark:text-white font-black">{genre.count}</span>
                                <span className="text-[10px] text-slate-400 dark:text-[#9E9AA6] w-8 text-right font-bold">{genre.percentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top Rated This Season */}
                  <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-emerald-100 shadow-xl space-y-4 flex flex-col justify-between">
                    <div className="border-b border-emerald-50 pb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                          <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                          Top Rated This Season
                        </h4>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                          Your highest rated anime for {currentSeasonName}
                        </p>
                      </div>
                      <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                        Top {Math.min(5, seasonalStats.topRated.length)}
                      </span>
                    </div>

                    {seasonalStats.topRated.length === 0 ? (
                      <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Star className="h-7 w-7 text-slate-300 mb-2" />
                        <p className="text-xs font-bold text-slate-500">No scored {currentSeasonName} anime found.</p>
                        <p className="text-[11px] text-slate-400 mt-1">Rate anime on MAL to populate this leaderboard.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {seasonalStats.topRated.slice(0, 5).map((item, idx) => {
                          const poster =
                            item.node?.main_picture?.medium ||
                            item.node?.main_picture?.large ||
                            '';
                          const title = item.node?.title || 'Unknown Title';
                          const score = item.list_status?.score;
                          const statusKey = item.list_status?.status || '';
                          const statusLabel = STATUS_LABELS[statusKey] || statusKey;

                          return (
                            <div
                              key={`seasonal-top-${item.node?.id || idx}`}
                              onClick={() => handleOpenAnimeModal(item)}
                              className="flex items-center gap-3 p-2 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-amber-50/40 hover:border-amber-200 transition-all shadow-xs cursor-pointer group"
                            >
                              <span
                                className={`w-5 text-center text-xs font-black shrink-0 ${
                                  idx === 0
                                    ? 'text-amber-500 text-sm'
                                    : idx === 1
                                    ? 'text-slate-500'
                                    : idx === 2
                                    ? 'text-amber-700'
                                    : 'text-slate-400 font-bold'
                                }`}
                              >
                                {String(idx + 1).padStart(2, '0')}
                              </span>

                              <div className="w-8 h-11 rounded-lg overflow-hidden bg-slate-200 shrink-0 border border-slate-300 group-hover:scale-105 transition-transform">
                                {poster ? (
                                  <img
                                    src={poster}
                                    alt={title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <Tv className="h-3 w-3" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h5 className="font-extrabold text-xs text-slate-900 truncate group-hover:text-amber-700 transition-colors" title={title}>
                                  {title}
                                </h5>
                                <span className="text-[10px] font-bold text-slate-400">{statusLabel}</span>
                              </div>

                              <div className="shrink-0 flex items-center gap-1 bg-amber-400 text-slate-950 px-2 py-0.5 rounded-xl shadow-xs border border-amber-300">
                                <Star className="h-3 w-3 fill-slate-950" />
                                <span className="text-xs font-black">{score}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ========================================================================= */}
          {/* SECTION DIVIDER: CLEAR SEPARATION BETWEEN SEASONAL AND OVERALL LIBRARY    */}
          {/* ========================================================================= */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t-2 border-indigo-200/80" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-indigo-50/90 text-indigo-950 font-black px-6 py-2 rounded-full border-2 border-indigo-200 shadow-sm text-xs sm:text-sm tracking-wider flex items-center gap-2">
                <Compass className="h-4 w-4 text-indigo-600" />
                OVERALL ANIME LIBRARY
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 2: OVERALL ANIME DASHBOARD (COMPLETE LIFETIME LIBRARY)            */}
          {/* ========================================================================= */}
          <section id="status-overall-section" className="space-y-6">
            {/* Overall Section Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-indigo-100 pb-3">
              <div>
                <h3 className="text-2xl font-black text-indigo-950 flex items-center gap-2">
                  <Layers className="h-6 w-6 text-indigo-600" />
                  Overall Anime Library
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5">
                  Lifetime statistics across all {overallStats.totalAnime} anime in your MyAnimeList
                </p>
              </div>
            </div>

            {/* Overall Overview Statistics Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Total Anime */}
              <div className="bg-white rounded-2xl p-4 border-2 border-indigo-100 shadow-md flex flex-col justify-between hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Total Anime
                  </span>
                  <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Tv className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl sm:text-3xl font-black text-indigo-950 tracking-tight">
                    {overallStats.totalAnime}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">in your library</p>
                </div>
              </div>

              {/* Watching */}
              <div className="bg-white rounded-2xl p-4 border-2 border-emerald-100 shadow-md flex flex-col justify-between hover:border-emerald-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                    Watching
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <Film className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
                    {overallStats.watchingCount}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">currently active</p>
                </div>
              </div>

              {/* Completed */}
              <div className="bg-white rounded-2xl p-4 border-2 border-blue-100 shadow-md flex flex-col justify-between hover:border-blue-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-700">
                    Completed
                  </span>
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl sm:text-3xl font-black text-blue-700 tracking-tight">
                    {overallStats.completedCount}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">finished series</p>
                </div>
              </div>

              {/* Plan to Watch */}
              <div className="bg-white rounded-2xl p-4 border-2 border-purple-100 shadow-md flex flex-col justify-between hover:border-purple-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-purple-700">
                    Plan to Watch
                  </span>
                  <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl sm:text-3xl font-black text-purple-700 tracking-tight">
                    {overallStats.ptwCount}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">in queue</p>
                </div>
              </div>

              {/* Episodes Watched */}
              <div className="bg-white rounded-2xl p-4 border-2 border-amber-100 shadow-md flex flex-col justify-between hover:border-amber-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                    Episodes Watched
                  </span>
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl sm:text-3xl font-black text-amber-900 tracking-tight">
                    {overallStats.totalEpisodesWatched.toLocaleString()}
                  </span>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">total recorded eps</p>
                </div>
              </div>

              {/* Average Score */}
              <div className="bg-white rounded-2xl p-4 border-2 border-pink-100 shadow-md flex flex-col justify-between hover:border-pink-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-pink-700">
                    Average Score
                  </span>
                  <div className="p-1.5 rounded-lg bg-pink-50 text-pink-600">
                    <Star className="h-4 w-4 fill-pink-500 text-pink-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl sm:text-3xl font-black text-pink-700 tracking-tight">
                      {overallStats.avgScore ? overallStats.avgScore : '—'}
                    </span>
                    {overallStats.avgScore && <span className="text-sm font-black text-pink-500">★</span>}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {overallStats.ratedCount} rated ({overallStats.totalAnime - overallStats.ratedCount} unrated)
                  </p>
                </div>
              </div>
            </div>

            {/* Overall Visual Charts Row (Donut Chart & Score Distribution) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Distribution Donut Chart */}
              <div className="bg-white dark:bg-[#1E1D24] rounded-3xl p-6 sm:p-7 border-2 border-indigo-100 dark:border-[#2E2C37] shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-50 dark:border-[#2E2C37]">
                  <div>
                    <h4 className="text-lg font-black text-indigo-950 dark:text-[#F4F2F7] flex items-center gap-2">
                      <Tv className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      Anime Status Distribution
                    </h4>
                    <p className="text-xs font-semibold text-slate-500 dark:text-[#9E9AA6] mt-0.5">
                      Breakdown of your library across all MAL watch statuses
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  {/* Donut Chart Container */}
                  <div className="sm:col-span-7 h-60 w-full relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={overallStats.statusChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {overallStats.statusChartData.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: any, name: any) => [
                            `${value} anime (${Math.round(((Number(value) || 0) / (overallStats.totalAnime || 1)) * 100)}%)`,
                            name,
                          ]}
                          contentStyle={{
                            backgroundColor: '#1E1D24',
                            border: '1px solid #363442',
                            borderRadius: '12px',
                            color: '#F4F2F7',
                            fontWeight: 600,
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-indigo-950 dark:text-[#F4F2F7] tracking-tight">
                        {overallStats.totalAnime}
                      </span>
                      <span className="text-[10px] font-extrabold text-slate-400 dark:text-[#9E9AA6] uppercase tracking-wider">
                        TOTAL
                      </span>
                    </div>
                  </div>

                  {/* Status Breakdown Legend & Counts */}
                  <div className="sm:col-span-5 space-y-2">
                    {[
                      { key: 'completed', label: 'Completed', count: overallStats.completedCount, color: STATUS_COLORS.completed },
                      { key: 'watching', label: 'Watching', count: overallStats.watchingCount, color: STATUS_COLORS.watching },
                      { key: 'plan_to_watch', label: 'Plan to Watch', count: overallStats.ptwCount, color: STATUS_COLORS.plan_to_watch },
                      { key: 'on_hold', label: 'On Hold', count: overallStats.onHoldCount, color: STATUS_COLORS.on_hold },
                      { key: 'dropped', label: 'Dropped', count: overallStats.droppedCount, color: STATUS_COLORS.dropped },
                    ].map((status) => {
                      const percent =
                        overallStats.totalAnime > 0
                          ? Math.round((status.count / overallStats.totalAnime) * 100)
                          : 0;
                      return (
                        <div
                          key={status.key}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#26252F] border border-slate-100 dark:border-[#363442] hover:bg-slate-100/80 dark:hover:bg-[#2F2E3A] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: status.color }} />
                            <span className="text-xs font-bold text-slate-700 dark:text-[#E2DEED]">{status.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-indigo-950 dark:text-white">{status.count}</span>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-[#9E9AA6] w-8 text-right">{percent}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Score Distribution Bar Chart */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-indigo-100 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-50">
                  <div>
                    <h4 className="text-lg font-black text-indigo-950 flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                      Score Distribution
                    </h4>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      Ratings (1–10) given across your rated anime
                    </p>
                  </div>
                  {overallStats.mostCommonScore !== null && overallStats.maxFreq > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">
                      Most common: <span className="font-black text-amber-950">{overallStats.mostCommonScore}★</span>
                    </span>
                  )}
                </div>

                {overallStats.ratedCount === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Star className="h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-500">No scored anime recorded yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Rate anime on MAL to populate your score chart.</p>
                  </div>
                ) : (
                  <div className="h-60 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overallStats.scoreChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="score"
                          tickLine={false}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                        />
                        <RechartsTooltip
                          formatter={(value: any, name: any, props: any) => [
                            `${value} anime rated ${props?.payload?.scoreNum || ''}★`,
                            'Count',
                          ]}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #E7E3DF',
                            borderRadius: '12px',
                            color: '#25242A',
                            fontWeight: 600,
                            fontSize: '12px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {overallStats.scoreChartData.map((entry) => (
                            <Cell
                              key={`cell-${entry.scoreNum}`}
                              fill={
                                entry.scoreNum === overallStats.mostCommonScore
                                  ? '#f59e0b'
                                  : entry.scoreNum >= 8
                                  ? '#6366f1'
                                  : entry.scoreNum >= 5
                                  ? '#3b82f6'
                                  : '#94a3b8'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Overall Currently Watching Progress Section */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-indigo-100 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-indigo-100">
                <div>
                  <h4 className="text-xl font-black text-indigo-950 flex items-center gap-2">
                    <Film className="h-6 w-6 text-emerald-600" />
                    Currently Watching Progress (All Library)
                  </h4>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Episode completion for all active series in your library ({overallStats.watchingList.length} total)
                  </p>
                </div>

                {overallStats.watchingList.length > 10 && (
                  <button
                    onClick={() => setShowAllOverallWatching(!showAllOverallWatching)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs transition-colors cursor-pointer self-start sm:self-auto border border-indigo-200"
                  >
                    <span>{showAllOverallWatching ? 'Show Top 10' : `Show All (${overallStats.watchingList.length})`}</span>
                    {showAllOverallWatching ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {overallStats.watchingList.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-sm font-bold text-slate-500">
                    No anime currently marked as "Watching" in your MyAnimeList.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(showAllOverallWatching ? overallStats.watchingList : overallStats.watchingList.slice(0, 10)).map(
                    ({ item, watched, total, hasTotal, progressPercent }) => {
                      const poster =
                        item.node?.main_picture?.medium ||
                        item.node?.main_picture?.large ||
                        '';
                      const title = item.node?.title || 'Unknown Title';

                      return (
                        <div
                          key={`overall-watch-${item.node?.id}`}
                          onClick={() => handleOpenAnimeModal(item)}
                          className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all shadow-xs cursor-pointer group"
                        >
                          <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-200 shrink-0 shadow-xs border border-slate-300 group-hover:scale-105 transition-transform">
                            {poster ? (
                              <img
                                src={poster}
                                alt={title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Film className="h-5 w-5" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <h5 className="font-extrabold text-sm text-slate-900 truncate group-hover:text-indigo-700 transition-colors" title={title}>
                                {title}
                              </h5>
                              {hasTotal && progressPercent !== null ? (
                                <span className="text-xs font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                                  {progressPercent}%
                                </span>
                              ) : null}
                            </div>

                            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden mb-1.5 shadow-inner">
                              {hasTotal && progressPercent !== null ? (
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-full transition-all duration-500"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              ) : (
                                <div className="h-full bg-emerald-500/60 rounded-full w-full animate-pulse" />
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                              {hasTotal ? (
                                <span>
                                  <span className="text-slate-900 font-extrabold">{watched}</span> / {total} episodes
                                </span>
                              ) : (
                                <span className="text-slate-700">
                                  <span className="font-black text-slate-900">{watched}</span> episodes watched (total TBA)
                                </span>
                              )}

                              {item.list_status?.score && item.list_status.score > 0 ? (
                                <span className="text-amber-600 font-extrabold">★ {item.list_status.score}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* Overall Bottom Row: Top Genres & Top Rated Anime */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Genres (All Library) - PIE CHART */}
              <div className="bg-white dark:bg-[#1E1D24] rounded-3xl p-6 sm:p-7 border-2 border-indigo-100 dark:border-[#2E2C37] shadow-xl space-y-4 flex flex-col justify-between">
                <div className="border-b border-indigo-50 dark:border-[#2E2C37] pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-black text-indigo-950 dark:text-[#F4F2F7] flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      Top Genres (All Library)
                    </h4>
                    <p className="text-xs font-semibold text-slate-500 dark:text-[#9E9AA6] mt-0.5">
                      Your complete anime genre distribution
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hidden sm:inline">
                      Click genre to view
                    </span>
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300">
                      {overallStats.genreChartData.length} Genres
                    </span>
                  </div>
                </div>

                {overallStats.genreChartData.length === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center text-center p-6 bg-slate-50 dark:bg-[#26252F] rounded-2xl border border-dashed border-slate-200 dark:border-[#363442]">
                    <p className="text-xs font-bold text-slate-500 dark:text-[#9E9AA6]">No genre data found in your list.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1">
                    <div className="sm:col-span-6 h-60 w-full relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={overallStats.genreChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            cursor="pointer"
                            onClick={(entry: any) => {
                              if (entry && entry.name) {
                                setSelectedGenreModal({
                                  genre: entry.name,
                                  source: 'overall',
                                  color: entry.color,
                                });
                              }
                            }}
                          >
                            {overallStats.genreChartData.map((entry) => (
                              <Cell
                                key={`overall-pie-${entry.name}`}
                                fill={entry.color}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value: any, name: any) => [
                              `${value} anime (${Math.round(((Number(value) || 0) / (overallStats.totalGenreInstances || 1)) * 100)}%) — Click to view`,
                              name,
                            ]}
                            contentStyle={{
                              backgroundColor: '#1E1D24',
                              border: '1px solid #363442',
                              borderRadius: '12px',
                              color: '#F4F2F7',
                              fontWeight: 600,
                              fontSize: '12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-black text-indigo-950 dark:text-[#F4F2F7] tracking-tight">
                          {overallStats.genreChartData.length}
                        </span>
                        <span className="text-[9px] font-extrabold text-slate-400 dark:text-[#9E9AA6] uppercase tracking-wider">
                          GENRES
                        </span>
                      </div>
                    </div>

                    <div className="sm:col-span-6 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {overallStats.genreChartData.map((genre) => (
                        <div
                          key={`overall-legend-${genre.name}`}
                          onClick={() =>
                            setSelectedGenreModal({
                              genre: genre.name,
                              source: 'overall',
                              color: genre.color,
                            })
                          }
                          title={`Click to view ${genre.name} anime`}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#26252F] hover:bg-purple-50/70 dark:hover:bg-purple-950/40 border border-slate-100 dark:border-[#363442] hover:border-purple-300 dark:hover:border-purple-700/60 transition-all text-xs font-bold cursor-pointer hover:translate-x-0.5 group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs group-hover:scale-125 transition-transform"
                              style={{ backgroundColor: genre.color }}
                            />
                            <span className="text-slate-700 dark:text-[#E2DEED] font-extrabold truncate group-hover:text-purple-700 dark:group-hover:text-purple-400" title={genre.name}>
                              {genre.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-indigo-950 dark:text-white font-black">{genre.count}</span>
                            <span className="text-[10px] text-slate-400 dark:text-[#9E9AA6] w-8 text-right font-bold">{genre.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Top Rated Anime Leaderboard */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-indigo-100 shadow-xl space-y-4 flex flex-col justify-between">
                <div className="border-b border-indigo-50 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-black text-indigo-950 flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                      Top Rated Anime (All Library)
                    </h4>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      Your personal highest-rated anime on MyAnimeList
                    </p>
                  </div>
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                    Top {Math.min(10, overallStats.topRated.length)}
                  </span>
                </div>

                {overallStats.topRated.length === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Star className="h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-500">No rated anime found.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Rate anime on MAL to see your top list here.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {overallStats.topRated.slice(0, 10).map((item, idx) => {
                      const poster =
                        item.node?.main_picture?.medium ||
                        item.node?.main_picture?.large ||
                        '';
                      const title = item.node?.title || 'Unknown Title';
                      const score = item.list_status?.score;
                      const statusKey = item.list_status?.status || '';
                      const statusLabel = STATUS_LABELS[statusKey] || statusKey;

                      return (
                        <div
                          key={`overall-top-${item.node?.id || idx}`}
                          onClick={() => handleOpenAnimeModal(item)}
                          className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 border border-slate-200/90 hover:bg-amber-50/40 hover:border-amber-200 transition-all shadow-xs cursor-pointer group"
                        >
                          <span
                            className={`w-6 text-center text-xs font-black shrink-0 ${
                              idx === 0
                                ? 'text-amber-500 text-sm'
                                : idx === 1
                                ? 'text-slate-500'
                                : idx === 2
                                ? 'text-amber-700'
                                : 'text-slate-400 font-bold'
                            }`}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          <div className="w-9 h-12 rounded-lg overflow-hidden bg-slate-200 shrink-0 border border-slate-300 group-hover:scale-105 transition-transform">
                            {poster ? (
                              <img
                                src={poster}
                                alt={title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Tv className="h-3.5 w-3.5" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h5 className="font-extrabold text-xs text-slate-900 truncate group-hover:text-amber-700 transition-colors" title={title}>
                              {title}
                            </h5>
                            <span className="text-[10px] font-bold text-slate-400">{statusLabel}</span>
                          </div>

                          <div className="shrink-0 flex items-center gap-1 bg-amber-400 text-slate-950 px-2.5 py-1 rounded-xl shadow-xs border border-amber-300">
                            <Star className="h-3.5 w-3.5 fill-slate-950" />
                            <span className="text-xs font-black">{score}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Interactive Genre Anime List Modal */}
      {selectedGenreModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={() => setSelectedGenreModal(null)}
        >
          <div
            className="bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-[#25242A] dark:text-[#F4F2F7] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-[#E7E3DF] dark:border-[#2E2C37] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs shrink-0"
                  style={{ backgroundColor: selectedGenreModal.color || '#7567C7' }}
                >
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      {selectedGenreModal.genre}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F0EDFA] dark:bg-[#2A2542] text-[#7567C7] dark:text-[#B9B0F2]">
                      {genreModalAnimeList.length} Anime
                    </span>
                  </div>
                  <p className="text-xs text-[#77747D] dark:text-[#9E9AA6] mt-0.5">
                    {selectedGenreModal.source === 'seasonal'
                      ? `${currentSeasonName} watching anime in this genre`
                      : 'All anime in your MyAnimeList library in this genre'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedGenreModal(null)}
                className="p-2 rounded-xl text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white hover:bg-[#F7F5F2] dark:hover:bg-[#26252F] transition-colors cursor-pointer"
                title="Close dialog (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Anime List */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
              {genreModalAnimeList.length === 0 ? (
                <div className="py-12 text-center text-[#77747D] dark:text-[#9E9AA6] space-y-2">
                  <Film className="h-8 w-8 mx-auto text-[#77747D]/50" />
                  <p className="text-sm font-semibold">No anime found matching this genre.</p>
                </div>
              ) : (
                genreModalAnimeList.map((item) => {
                  const animeId = item.node.id;
                  const title = item.node.title;
                  const poster = item.node.main_picture?.medium || item.node.main_picture?.large;
                  const score = item.list_status?.score && item.list_status.score > 0
                    ? item.list_status.score
                    : (item.node.mean || null);
                  const status = item.list_status?.status;
                  const statusColor = status ? STATUS_COLORS[status] || '#7567C7' : '#7567C7';
                  const statusLabel = status ? STATUS_LABELS[status] || status : 'Tracked';
                  const epsWatched = item.list_status?.num_episodes_watched ?? 0;
                  const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : '?';

                  return (
                    <div
                      key={`genre-modal-anime-${animeId}`}
                      onClick={() => handleOpenAnimeModal(item)}
                      className="flex items-center gap-3.5 p-3 rounded-2xl bg-[#F7F5F2] dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#363442] hover:border-[#7567C7]/50 dark:hover:border-[#7567C7]/50 transition-all cursor-pointer group"
                    >
                      <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-[#E7E3DF] dark:border-[#363442] group-hover:scale-105 transition-transform">
                        {poster ? (
                          <img
                            src={poster}
                            alt={title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Film className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4
                            className="font-bold text-sm text-[#25242A] dark:text-[#F4F2F7] truncate group-hover:text-[#7567C7] dark:group-hover:text-[#A294EE] transition-colors"
                            title={title}
                          >
                            {title}
                          </h4>
                          {score && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 text-xs font-bold shrink-0">
                              <Star className="h-3 w-3 fill-current" />
                              <span>{score}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold"
                            style={{
                              backgroundColor: `${statusColor}1A`,
                              color: statusColor,
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                            {statusLabel}
                          </span>

                          <span className="text-[#77747D] dark:text-[#9E9AA6] text-[11px] font-medium">
                            {epsWatched} / {totalEps} eps
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#F7F5F2] dark:bg-[#181720] border-t border-[#E7E3DF] dark:border-[#2E2C37] flex items-center justify-between text-xs text-[#77747D] dark:text-[#9E9AA6] shrink-0">
              <span>Click any anime to view full details</span>
              <button
                onClick={() => setSelectedGenreModal(null)}
                className="px-4 py-1.5 rounded-xl bg-white dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#363442] text-[#25242A] dark:text-[#F4F2F7] font-semibold hover:bg-slate-50 dark:hover:bg-[#2E2D3B] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anime Detail Modal */}
      <AnimeDetailModal
        anime={selectedAnimeForModal}
        isOpen={!!selectedAnimeForModal}
        onClose={() => setSelectedAnimeForModal(null)}
        customNotes={customUserNotes}
        onSaveNote={onSaveCustomNote}
      />
    </div>
  );
}
