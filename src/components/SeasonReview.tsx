import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Trophy,
  Crown,
  Sparkles,
  Heart,
  Skull,
  Flame,
  Award,
  ChevronLeft,
  ChevronRight,
  Star,
  CheckCircle2,
  Tv,
  Film,
  Zap,
  TrendingUp,
  Clock,
  Compass,
  Smile,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { MalListItem, MalUser } from '../types';
import { AppTheme } from '../types/theme';
import { decodeHtmlEntities } from '../utils/htmlUtils';
import { AnimeDetailModal, AnimeDetailData } from './AnimeDetailModal';

export interface SeasonReviewProps {
  malList: MalListItem[];
  summer2026List: MalListItem[];
  watchingSummer2026List?: Array<{ node?: any; list_status?: any }>;
  completedSummer2026List?: MalListItem[];
  customUserNotes?: Record<number, string>;
  malUser: MalUser | null;
  onSaveCustomNote?: (animeId: number, note: string) => void;
  onConnectMal?: () => void;
  theme?: AppTheme;
}

export const SeasonReview: React.FC<SeasonReviewProps> = ({
  malList,
  summer2026List,
  watchingSummer2026List = [],
  completedSummer2026List = [],
  customUserNotes = {},
  malUser,
  onSaveCustomNote,
  onConnectMal,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';
  const isLight = !isDark && !isSakura;

  const [selectedSeason, setSelectedSeason] = useState<'summer-2026'>('summer-2026');
  const [selectedAnimeModal, setSelectedAnimeModal] = useState<AnimeDetailData | null>(null);

  // 1. Season Dataset Compilation
  // We prioritize the Summer 2026 items. If the user only has a few Summer 2026 items,
  // we combine them with user's active watching list so the review is full and rewarding.
  const seasonAnime = useMemo(() => {
    const list: MalListItem[] = [];
    const seen = new Set<number>();

    // Add all summer 2026 titles
    for (const item of summer2026List) {
      if (item?.node?.id && !seen.has(item.node.id)) {
        seen.add(item.node.id);
        list.push(item);
      }
    }

    // Add completed in season
    for (const item of completedSummer2026List) {
      if (item?.node?.id && !seen.has(item.node.id)) {
        seen.add(item.node.id);
        list.push(item);
      }
    }

    // If summer 2026 items are less than 3, supplement with watching items from general list
    if (list.length < 3) {
      for (const item of malList) {
        if (item?.node?.id && !seen.has(item.node.id) && (item.list_status?.status === 'watching' || item.list_status?.status === 'completed')) {
          seen.add(item.node.id);
          list.push(item);
          if (list.length >= 8) break;
        }
      }
    }

    return list;
  }, [summer2026List, completedSummer2026List, malList]);

  // 2. High-level Season Metrics
  const metrics = useMemo(() => {
    const watchedItems = seasonAnime.filter(
      (item) =>
        item.list_status?.status === 'watching' ||
        item.list_status?.status === 'completed' ||
        (item.list_status?.num_episodes_watched || 0) > 0
    );

    const totalEpisodes = seasonAnime.reduce(
      (sum, item) => sum + (item.list_status?.num_episodes_watched || 0),
      0
    );

    const completedItems = seasonAnime.filter(
      (item) => item.list_status?.status === 'completed'
    );

    const scoredItems = seasonAnime.filter(
      (item) => (item.list_status?.score || 0) > 0
    );

    const avgScore =
      scoredItems.length > 0
        ? scoredItems.reduce((acc, curr) => acc + (curr.list_status?.score || 0), 0) /
          scoredItems.length
        : seasonAnime.reduce((acc, curr) => acc + (curr.node?.mean || 0), 0) /
            (seasonAnime.filter((i) => (i.node?.mean || 0) > 0).length || 1);

    return {
      animeWatched: watchedItems.length || seasonAnime.length,
      episodesWatched: totalEpisodes,
      completedCount: completedItems.length,
      averageScore: avgScore > 0 ? avgScore.toFixed(1) : '8.0',
      hasScoredItems: scoredItems.length > 0,
      scoredCount: scoredItems.length,
    };
  }, [seasonAnime]);

  // 3. Podium Ranking (#1, #2, #3 Anime of the Season)
  const podium = useMemo(() => {
    if (seasonAnime.length === 0) return { first: null, second: null, third: null, allRanked: [] };

    // Sort by:
    // 1. User Score (descending)
    // 2. Num episodes watched (descending)
    // 3. MAL community score (node.mean descending)
    const sorted = [...seasonAnime].sort((a, b) => {
      const scoreA = a.list_status?.score || 0;
      const scoreB = b.list_status?.score || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;

      const epsA = a.list_status?.num_episodes_watched || 0;
      const epsB = b.list_status?.num_episodes_watched || 0;
      if (epsB !== epsA) return epsB - epsA;

      const meanA = a.node?.mean || 0;
      const meanB = b.node?.mean || 0;
      return meanB - meanA;
    });

    return {
      first: sorted[0] || null,
      second: sorted[1] || null,
      third: sorted[2] || null,
      allRanked: sorted,
    };
  }, [seasonAnime]);

  // 4. Favorites & Highlights
  const favorites = useMemo(() => {
    if (seasonAnime.length === 0) return { highestRated: null, mostWatched: null, rewatchable: null };

    // Highest rated anime by user
    const rated = seasonAnime.filter((i) => (i.list_status?.score || 0) > 0);
    const highestRated = rated.length > 0
      ? [...rated].sort((a, b) => (b.list_status?.score || 0) - (a.list_status?.score || 0))[0]
      : podium.first;

    // Most episodes watched
    const mostWatched = [...seasonAnime].sort(
      (a, b) => (b.list_status?.num_episodes_watched || 0) - (a.list_status?.num_episodes_watched || 0)
    )[0];

    // Most rewatchable / Masterpiece (completed with highest score or top community score)
    const completedOrHigh = seasonAnime.filter(
      (i) => i.list_status?.status === 'completed' || (i.list_status?.score || 0) >= 8
    );
    const rewatchable =
      completedOrHigh.length > 0
        ? [...completedOrHigh].sort((a, b) => (b.list_status?.score || 0) - (a.list_status?.score || 0))[0]
        : podium.second || podium.first;

    return { highestRated, mostWatched, rewatchable };
  }, [seasonAnime, podium]);

  // 5. Biggest Disappointments
  const disappointments = useMemo(() => {
    // Look for lowest scored anime (score > 0)
    const scored = seasonAnime.filter((i) => (i.list_status?.score || 0) > 0);
    const droppedOrHold = seasonAnime.filter(
      (i) => i.list_status?.status === 'dropped' || i.list_status?.status === 'on_hold'
    );

    let candidates: MalListItem[] = [];

    if (scored.length > 0) {
      // Sort ascending by score
      const sortedByScoreAsc = [...scored].sort(
        (a, b) => (a.list_status?.score || 0) - (b.list_status?.score || 0)
      );

      // Take bottom items if score is <= 7, or if user is generally a high rater, the lowest scored one
      candidates = sortedByScoreAsc.slice(0, 3);
    } else if (droppedOrHold.length > 0) {
      candidates = droppedOrHold.slice(0, 3);
    }

    const primary = candidates[0] || null;
    const isActuallyLow = primary ? (primary.list_status?.score || 0) <= 6.5 : false;

    return {
      primary,
      others: candidates.slice(1),
      isActuallyLow,
      hasLowScores: candidates.length > 0 && (primary?.list_status?.score || 0) > 0,
      lowestScore: primary?.list_status?.score || null,
    };
  }, [seasonAnime]);

  // 6. Season Awards (Reliably Calculated from Existing Data)
  const seasonAwards = useMemo(() => {
    const awards: Array<{
      id: string;
      title: string;
      icon: any;
      anime: MalListItem;
      badge: string;
      reason: string;
      gradient: string;
    }> = [];

    if (seasonAnime.length === 0) return awards;

    // Award 1: Anime of the Season
    if (podium.first) {
      const scoreText = podium.first.list_status?.score
        ? `Personal Rating: ★ ${podium.first.list_status.score}`
        : `Community Rating: ★ ${podium.first.node.mean || '8.5'}`;
      awards.push({
        id: 'aots',
        title: 'ANIME OF THE SEASON',
        icon: Crown,
        anime: podium.first,
        badge: '👑 Grand Prize',
        reason: scoreText,
        gradient: 'from-[#E5B869]/20 to-[#9B6E28]/10 border-[#E5B869]/40',
      });
    }

    // Award 2: Marathon Champion (Most Episodes Logged)
    const sortedByEps = [...seasonAnime].sort(
      (a, b) => (b.list_status?.num_episodes_watched || 0) - (a.list_status?.num_episodes_watched || 0)
    );
    if (sortedByEps[0] && (sortedByEps[0].list_status?.num_episodes_watched || 0) > 0) {
      awards.push({
        id: 'marathon',
        title: 'MARATHON CHAMPION',
        icon: Zap,
        anime: sortedByEps[0],
        badge: '⚡ Most Episodes',
        reason: `${sortedByEps[0].list_status?.num_episodes_watched} episodes completed this season`,
        gradient: 'from-[#8B7BF5]/20 to-[#5C4BC4]/10 border-[#8B7BF5]/40',
      });
    }

    // Award 3: Perfectionist's Pick (Highest Rated Completed Anime)
    const completedList = seasonAnime.filter((i) => i.list_status?.status === 'completed');
    if (completedList.length > 0) {
      const bestCompleted = [...completedList].sort(
        (a, b) => (b.list_status?.score || 0) - (a.list_status?.score || 0)
      )[0];
      if (bestCompleted && bestCompleted.node.id !== podium.first?.node.id) {
        awards.push({
          id: 'perfectionist',
          title: "PERFECTIONIST'S PICK",
          icon: CheckCircle2,
          anime: bestCompleted,
          badge: '🎯 Carried To Finish',
          reason: bestCompleted.list_status?.score
            ? `Rated ★ ${bestCompleted.list_status.score} upon completion`
            : 'Watched to the very last credit roll',
          gradient: 'from-[#6D9B7C]/20 to-[#3C644B]/10 border-[#6D9B7C]/40',
        });
      }
    }

    // Award 4: Community Darling (Highest Global MAL Mean in your list)
    const sortedByMean = [...seasonAnime].sort((a, b) => (b.node?.mean || 0) - (a.node?.mean || 0));
    if (sortedByMean[0] && (sortedByMean[0].node?.mean || 0) > 0) {
      const darling = sortedByMean[0];
      if (darling.node.id !== podium.first?.node.id) {
        awards.push({
          id: 'darling',
          title: 'COMMUNITY DARLING',
          icon: Sparkles,
          anime: darling,
          badge: '🌟 MAL Consensus',
          reason: `Global MAL Community Score of ★ ${darling.node.mean?.toFixed(2)}`,
          gradient: 'from-[#C69A55]/20 to-[#7A5A28]/10 border-[#C69A55]/40',
        });
      }
    }

    // Award 5: Backlog Burden or Dropped title
    const dropped = seasonAnime.find((i) => i.list_status?.status === 'dropped');
    const onHold = seasonAnime.find((i) => i.list_status?.status === 'on_hold');
    const burden = dropped || onHold;
    if (burden) {
      awards.push({
        id: 'burden',
        title: burden.list_status?.status === 'dropped' ? 'THE MERCY DROP' : 'FROZEN IN TIME',
        icon: Skull,
        anime: burden,
        badge: burden.list_status?.status === 'dropped' ? '💀 Dropped' : '⏳ On Hold',
        reason: `Halted after ${burden.list_status?.num_episodes_watched || 0} episodes`,
        gradient: 'from-[#E06D75]/20 to-[#7A2830]/10 border-[#E06D75]/40',
      });
    }

    return awards;
  }, [seasonAnime, podium]);

  // 7. Watching Style & Genre Breakdown
  const watchingStyle = useMemo(() => {
    const genreCounts: Record<string, number> = {};

    for (const item of seasonAnime) {
      if (item.node?.genres) {
        for (const g of item.node.genres) {
          genreCounts[g.name] = (genreCounts[g.name] || 0) + 1;
        }
      }
    }

    const sortedGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const topGenre = sortedGenres[0]?.[0] || 'Action';
    const topCount = sortedGenres[0]?.[1] || 0;
    const secondGenre = sortedGenres[1]?.[0];

    // Data-driven editorial statement
    let statement = '';
    if (topCount > 0 && secondGenre) {
      statement = `You clearly had an appetite for ${topGenre} and ${secondGenre} this season, making up the backbone of your anime journey.`;
    } else if (topCount > 0) {
      statement = `You leaned decisively into ${topGenre} this season, showing focused taste and dedication.`;
    } else {
      statement = 'A balanced, eclectic mix of genres defined your viewing pattern this season.';
    }

    return {
      genres: sortedGenres,
      statement,
      topGenre,
    };
  }, [seasonAnime]);

  // 8. Biggest Surprise (User Score > MAL Community Mean)
  const biggestSurprise = useMemo(() => {
    const scoredWithMean = seasonAnime.filter(
      (i) => (i.list_status?.score || 0) > 0 && (i.node?.mean || 0) > 0
    );

    if (scoredWithMean.length === 0) return null;

    // Compute differential: userScore - MAL mean
    const diffList = scoredWithMean.map((item) => {
      const userScore = item.list_status?.score || 0;
      const malMean = item.node?.mean || 0;
      const diff = userScore - malMean;
      return { item, userScore, malMean, diff };
    });

    diffList.sort((a, b) => b.diff - a.diff);

    const topCandidate = diffList[0];
    if (topCandidate && topCandidate.diff >= 0.3) {
      return topCandidate;
    }

    return null;
  }, [seasonAnime]);

  // 9. Final Season Verdict
  const finalVerdict = useMemo(() => {
    const scoreNum = parseFloat(metrics.averageScore);
    let editorialVerdict = '';

    if (scoreNum >= 8.5) {
      editorialVerdict = 'A golden season of peak entertainment. Your choices consistently hit the mark.';
    } else if (scoreNum >= 7.8) {
      editorialVerdict = 'A surprisingly strong and satisfying season with standout highlights.';
    } else if (scoreNum >= 7.0) {
      editorialVerdict = 'A balanced, enjoyable season with steady watches and faithful weekly routines.';
    } else {
      editorialVerdict = 'An adventurous, exploratory season of testing new waters and expanding tastes.';
    }

    return {
      editorialVerdict,
      averageScore: metrics.averageScore,
      favoriteAnime: podium.first?.node.title || 'None recorded',
      biggestDisappointment: disappointments.primary?.node.title || 'No major disappointments',
      topGenre: watchingStyle.topGenre,
      champion: podium.first?.node.title || 'N/A',
    };
  }, [metrics, podium, disappointments, watchingStyle]);

  // Helper to open anime modal
  const handleOpenAnimeModal = (item: MalListItem) => {
    const modalData: AnimeDetailData = {
      id: item.node.id,
      malId: item.node.id,
      title: item.node.title,
      titleEnglish: item.node.alternative_titles?.en,
      titleNative: item.node.alternative_titles?.ja,
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
    setSelectedAnimeModal(modalData);
  };

  // Helper to retrieve note or decoded comment
  const getDisplayNote = (item: MalListItem | null) => {
    if (!item) return '';
    const custom = customUserNotes[item.node.id]?.trim();
    if (custom) return custom;
    const rawComment = item.list_status?.comments?.trim();
    if (rawComment) return decodeHtmlEntities(rawComment);
    return '';
  };

  return (
    <div
      className={`w-full max-w-6xl mx-auto space-y-16 pb-16 transition-colors duration-200 ${
        isDark ? 'text-[#F3F2F6]' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
      }`}
    >
      {/* ========================================================================= */}
      {/* 1. HERO — "YOUR SEASON" */}
      {/* ========================================================================= */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className={`relative overflow-hidden rounded-3xl p-8 sm:p-12 md:p-16 border transition-colors ${
          isDark
            ? 'bg-linear-to-b from-[#1E1B33] via-[#161426] to-[#0F0E1A] border-[#2D2A4A] shadow-2xl'
            : isSakura
            ? 'bg-linear-to-b from-[#FFF5F7] via-[#FDF0F3] to-[#FCE7ED] border-[#F2CDD9] shadow-md'
            : 'bg-linear-to-b from-[#FAF8F5] via-[#F4EFEA] to-[#ECE5DC] border-[#E2DDD5] shadow-md'
        }`}
      >
        {/* Subtle Ambient Background Accents */}
        <div
          className={`absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
            isDark ? 'bg-[#7567C7]/20' : isSakura ? 'bg-[#E06D9B]/15' : 'bg-[#7567C7]/8'
          }`}
        />
        <div
          className={`absolute bottom-0 left-1/4 -mb-20 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
            isDark ? 'bg-[#C69A55]/15' : isSakura ? 'bg-[#C69A55]/12' : 'bg-[#C69A55]/10'
          }`}
        />

        <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto">
          {/* Seasonal Japanese Tag */}
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase border transition-colors ${
              isDark
                ? 'bg-[#7567C7]/15 border-[#7567C7]/30 text-[#D8D2FF]'
                : isSakura
                ? 'bg-white/90 border-[#F2CDD9] text-[#A63A68] shadow-2xs'
                : 'bg-white/90 border-[#E2DDD5] text-[#5B4EAE] shadow-2xs'
            }`}
          >
            <Trophy className="h-3.5 w-3.5 text-[#E5B869]" />
            <span>SUMMER 2026 • 2026年 夏アニメ総括</span>
          </div>

          <h1
            className={`text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight uppercase font-sans ${
              isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
            }`}
          >
            Your Season in Anime
          </h1>

          <p
            className={`text-base sm:text-lg max-w-xl ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#7A617A]' : 'text-[#6B6675]'
            }`}
          >
            A personal yearbook celebrating what you watched, loved, dropped, and rated throughout Summer 2026.
          </p>

          {/* Metric Badges Introduction Grid */}
          <div
            className={`w-full grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 pt-6 mt-4 border-t ${
              isDark ? 'border-[#2D2A4A]/80' : isSakura ? 'border-[#F2CDD9]' : 'border-[#E2DDD5]'
            }`}
          >
            <div
              className={`rounded-2xl p-4 sm:p-5 flex flex-col items-center border transition-colors ${
                isDark
                  ? 'bg-[#1A1829]/80 border-[#2D2A4A]'
                  : isSakura
                  ? 'bg-white/90 border-[#F2CDD9] shadow-xs'
                  : 'bg-white border-[#E2DDD5] shadow-xs'
              }`}
            >
              <span
                className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                {metrics.animeWatched}
              </span>
              <span
                className={`text-[11px] sm:text-xs font-bold tracking-wider uppercase mt-1 ${
                  isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                }`}
              >
                Anime Watched
              </span>
            </div>

            <div
              className={`rounded-2xl p-4 sm:p-5 flex flex-col items-center border transition-colors ${
                isDark
                  ? 'bg-[#1A1829]/80 border-[#2D2A4A]'
                  : isSakura
                  ? 'bg-white/90 border-[#F2CDD9] shadow-xs'
                  : 'bg-white border-[#E2DDD5] shadow-xs'
              }`}
            >
              <span
                className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                {metrics.episodesWatched}
              </span>
              <span
                className={`text-[11px] sm:text-xs font-bold tracking-wider uppercase mt-1 ${
                  isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                }`}
              >
                Episodes Logged
              </span>
            </div>

            <div
              className={`rounded-2xl p-4 sm:p-5 flex flex-col items-center border transition-colors ${
                isDark
                  ? 'bg-[#1A1829]/80 border-[#2D2A4A]'
                  : isSakura
                  ? 'bg-white/90 border-[#F2CDD9] shadow-xs'
                  : 'bg-white border-[#E2DDD5] shadow-xs'
              }`}
            >
              <span
                className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                {metrics.completedCount}
              </span>
              <span
                className={`text-[11px] sm:text-xs font-bold tracking-wider uppercase mt-1 ${
                  isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                }`}
              >
                Completed
              </span>
            </div>

            <div
              className={`rounded-2xl p-4 sm:p-5 flex flex-col items-center border transition-colors ${
                isDark
                  ? 'bg-[#1A1829]/80 border-[#2D2A4A]'
                  : isSakura
                  ? 'bg-white/90 border-[#F2CDD9] shadow-xs'
                  : 'bg-white border-[#E2DDD5] shadow-xs'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Star
                  className={`h-5 w-5 ${
                    isDark
                      ? 'text-[#E5B869] fill-[#E5B869]'
                      : isSakura
                      ? 'text-[#D49E50] fill-[#D49E50]'
                      : 'text-[#C69A55] fill-[#C69A55]'
                  }`}
                />
                <span
                  className={`text-3xl sm:text-4xl font-black tracking-tight ${
                    isDark ? 'text-[#E5B869]' : isSakura ? 'text-[#D49E50]' : 'text-[#C69A55]'
                  }`}
                >
                  {metrics.averageScore}
                </span>
              </div>
              <span
                className={`text-[11px] sm:text-xs font-bold tracking-wider uppercase mt-1 ${
                  isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                }`}
              >
                Average Score
              </span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ========================================================================= */}
      {/* 2. 🏆 ANIME OF THE SEASON — CEREMONY PODIUM */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <div
            className={`inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase ${
              isDark ? 'text-[#E5B869]' : isSakura ? 'text-[#D49E50]' : 'text-[#C69A55]'
            }`}
          >
            <Crown className="h-4 w-4" />
            <span>The Hall of Fame • 2026年 夏アニメ表彰</span>
          </div>
          <h2
            className={`text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight ${
              isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
            }`}
          >
            Anime of the Season
          </h2>
          <p
            className={`text-sm max-w-lg mx-auto ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
            }`}
          >
            Your definitive podium. Ranked strictly by your scores, progress, and devotion.
          </p>
        </div>

        {podium.allRanked.length === 0 ? (
          <div
            className={`rounded-3xl p-12 text-center border ${
              isDark
                ? 'bg-[#161426] border-[#2D2A4A] text-[#AEA8C9]'
                : isSakura
                ? 'bg-white/90 border-[#F2D0DB] text-[#8C6D8C] shadow-xs'
                : 'bg-white border-[#E7E3DF] text-[#77747D] shadow-xs'
            }`}
          >
            Connect your MyAnimeList account to unlock your personal podium.
          </div>
        ) : (
          <div className="relative pt-6 pb-2">
            {/* CEREMONY LAYOUT: #1 AS CENTERPIECE, #2 & #3 SECONDARY */}
            <div className="flex flex-col items-center">
              {/* CENTERPIECE #1 GRAND CHAMPION */}
              {podium.first && (
                <div className="w-full max-w-xl mx-auto">
                  <motion.div
                    whileHover={{ y: -4 }}
                    onClick={() => handleOpenAnimeModal(podium.first!)}
                    className={`relative cursor-pointer rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center transition-all ${
                      isDark
                        ? 'bg-linear-to-b from-[#28213B] via-[#1E1A33] to-[#151326] border-2 border-[#E5B869] shadow-[0_0_40px_rgba(229,184,105,0.25)]'
                        : isSakura
                        ? 'bg-linear-to-b from-[#FFFDF9] via-[#FDF5F7] to-[#FCEEF3] border-2 border-[#D49E50] shadow-[0_12px_36px_rgba(212,158,80,0.18)]'
                        : 'bg-linear-to-b from-[#FFFDF9] via-[#FAF6EE] to-[#F5EEE0] border-2 border-[#C69A55] shadow-[0_12px_36px_rgba(198,154,85,0.18)]'
                    }`}
                  >
                    {/* Golden Laurel / Champion Crown Pill */}
                    <div className="absolute -top-4 px-5 py-1.5 rounded-full bg-linear-to-r from-[#E5B869] via-[#F6DE95] to-[#C69A55] text-[#1E180B] text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-2">
                      <Crown className="h-4 w-4 fill-[#1E180B]" />
                      <span>🏆 1ST PLACE • ANIME OF THE SEASON</span>
                    </div>

                    {/* Large Featured Image */}
                    <div className="relative w-48 h-68 sm:w-56 sm:h-80 rounded-2xl overflow-hidden shadow-2xl mb-4 mt-2 border-2 border-[#E5B869]/60 group">
                      <img
                        src={
                          podium.first.node.main_picture?.large ||
                          podium.first.node.main_picture?.medium
                        }
                        alt={podium.first.node.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-3">
                        <span className="text-xs font-bold text-white bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs">
                          Inspect Anime Details
                        </span>
                      </div>
                    </div>

                    {/* Large Bold Title */}
                    <h3
                      className={`text-lg sm:text-2xl font-black max-w-md line-clamp-2 ${
                        isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                      }`}
                    >
                      {podium.first.node.title}
                    </h3>

                    {/* Score & Progress Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
                      <div className="flex items-center gap-1.5 bg-[#E5B869]/15 border border-[#E5B869]/40 px-3.5 py-1 rounded-xl text-sm font-black text-[#C69A55] dark:text-[#E5B869]">
                        <Star className="h-4 w-4 fill-[#E5B869] text-[#E5B869]" />
                        <span>
                          {podium.first.list_status?.score
                            ? `★ ${podium.first.list_status.score}.0`
                            : `★ ${podium.first.node.mean ? podium.first.node.mean.toFixed(1) : '8.8'}`}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-3 py-1 rounded-xl border ${
                          isDark
                            ? 'bg-[#25223A] text-[#AEA8C9] border-[#37325C]'
                            : isSakura
                            ? 'bg-white text-[#8C6D8C] border-[#F2D0DB]'
                            : 'bg-white text-[#77747D] border-[#E7E3DF]'
                        }`}
                      >
                        {podium.first.list_status?.num_episodes_watched || 0} episodes logged
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-xl ${
                          isDark
                            ? 'text-[#D8D2FF] bg-[#7567C7]/20'
                            : isSakura
                            ? 'text-[#E06D9B] bg-[#E06D9B]/10'
                            : 'text-[#7567C7] bg-[#7567C7]/10'
                        }`}
                      >
                        {podium.first.list_status?.status === 'completed'
                          ? '✓ Finished Season'
                          : 'Currently Watching'}
                      </span>
                    </div>

                    {/* User Note / Quote if present */}
                    {getDisplayNote(podium.first) && (
                      <p
                        className={`text-xs italic mt-4 line-clamp-2 px-4 py-2 rounded-xl w-full max-w-md ${
                          isDark
                            ? 'bg-[#25223A]/70 text-[#D8D2FF]/90 border border-[#3A355A]'
                            : isSakura
                            ? 'bg-white/90 text-[#7A587A] border border-[#F2D0DB]'
                            : 'bg-white/90 text-[#5B5566] border border-[#E2DDD5]'
                        }`}
                      >
                        "{getDisplayNote(podium.first)}"
                      </p>
                    )}

                    {/* Elegant Gold Plinth Plaque */}
                    <div
                      className={`mt-5 w-full max-w-md py-2 px-4 rounded-xl border flex items-center justify-between text-xs font-bold ${
                        isDark
                          ? 'bg-[#E5B869]/10 border-[#E5B869]/30 text-[#E5B869]'
                          : isSakura
                          ? 'bg-[#D49E50]/10 border-[#D49E50]/30 text-[#9E6E24]'
                          : 'bg-[#C69A55]/10 border-[#C69A55]/30 text-[#8E6418]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Crown className="h-3.5 w-3.5" />
                        <span>GOLD LAUREL WINNER</span>
                      </span>
                      <span className="text-[11px] font-semibold opacity-80 tracking-wider uppercase">
                        Summer 2026 Champion
                      </span>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* SECONDARY ROW: #2 SILVER AND #3 BRONZE */}
              <div className="w-full max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
                {/* #2 SILVER */}
                {podium.second ? (
                  <motion.div
                    whileHover={{ y: -3 }}
                    onClick={() => handleOpenAnimeModal(podium.second!)}
                    className={`cursor-pointer rounded-2xl p-5 flex flex-col items-center text-center transition-all ${
                      isDark
                        ? 'bg-linear-to-b from-[#1C1A2B] to-[#151424] border border-[#A4A9B8]/40 shadow-lg hover:border-[#A4A9B8]'
                        : isSakura
                        ? 'bg-linear-to-b from-white to-[#FAF7F9] border border-[#BAC0CD] shadow-xs hover:border-[#94A3B8]'
                        : 'bg-linear-to-b from-white to-[#F7F8FA] border border-[#BAC0CD] shadow-xs hover:border-[#94A3B8]'
                    }`}
                  >
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#94A3B8]/20 border border-[#94A3B8]/40 text-[#475569] dark:text-[#E2E8F0] text-xs font-black uppercase mb-3.5">
                      <span>🥈 #2 SILVER RUNNER-UP</span>
                    </div>

                    <div className="relative w-36 h-50 sm:w-40 sm:h-56 rounded-xl overflow-hidden shadow-md mb-3 border border-[#94A3B8]/30 group">
                      <img
                        src={
                          podium.second.node.main_picture?.large ||
                          podium.second.node.main_picture?.medium
                        }
                        alt={podium.second.node.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    <h3
                      className={`text-sm sm:text-base font-bold line-clamp-2 min-h-10 ${
                        isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                      }`}
                    >
                      {podium.second.node.title}
                    </h3>

                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-[#94A3B8]/15 px-2.5 py-1 rounded-lg text-xs font-bold text-[#475569] dark:text-[#E2E8F0]">
                        <Star className="h-3.5 w-3.5 text-[#E5B869] fill-[#E5B869]" />
                        <span>
                          {podium.second.list_status?.score
                            ? `★ ${podium.second.list_status.score}`
                            : `★ ${podium.second.node.mean || '—'}`}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] ${
                          isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                        }`}
                      >
                        {podium.second.list_status?.num_episodes_watched || 0} eps
                      </span>
                    </div>

                    {/* Silver Plaque Accent */}
                    <div
                      className={`mt-4 w-full py-1.5 px-3 rounded-lg border text-[11px] font-bold text-center ${
                        isDark
                          ? 'bg-[#94A3B8]/10 border-[#94A3B8]/25 text-[#CBD5E1]'
                          : isSakura
                          ? 'bg-[#94A3B8]/10 border-[#94A3B8]/30 text-[#475569]'
                          : 'bg-[#94A3B8]/10 border-[#94A3B8]/30 text-[#475569]'
                      }`}
                    >
                      SILVER MEDALIST
                    </div>
                  </motion.div>
                ) : (
                  <div
                    className={`rounded-2xl border border-dashed p-8 flex items-center justify-center text-xs ${
                      isDark ? 'border-[#2D2A4A] text-[#77747D]' : 'border-[#E7E3DF] text-[#9B97A2]'
                    }`}
                  >
                    No #2 Runner-up recorded
                  </div>
                )}

                {/* #3 BRONZE */}
                {podium.third ? (
                  <motion.div
                    whileHover={{ y: -3 }}
                    onClick={() => handleOpenAnimeModal(podium.third!)}
                    className={`cursor-pointer rounded-2xl p-5 flex flex-col items-center text-center transition-all ${
                      isDark
                        ? 'bg-linear-to-b from-[#1F1722] to-[#15121D] border border-[#CD7F32]/40 shadow-lg hover:border-[#CD7F32]'
                        : isSakura
                        ? 'bg-linear-to-b from-white to-[#FDF6F7] border border-[#D9A87E] shadow-xs hover:border-[#CD7F32]'
                        : 'bg-linear-to-b from-white to-[#FDF8F5] border border-[#D9A87E] shadow-xs hover:border-[#CD7F32]'
                    }`}
                  >
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#CD7F32]/20 border border-[#CD7F32]/40 text-[#9A531C] dark:text-[#F5C296] text-xs font-black uppercase mb-3.5">
                      <span>🥉 #3 BRONZE PODIUM</span>
                    </div>

                    <div className="relative w-36 h-50 sm:w-40 sm:h-56 rounded-xl overflow-hidden shadow-md mb-3 border border-[#CD7F32]/30 group">
                      <img
                        src={
                          podium.third.node.main_picture?.large ||
                          podium.third.node.main_picture?.medium
                        }
                        alt={podium.third.node.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    <h3
                      className={`text-sm sm:text-base font-bold line-clamp-2 min-h-10 ${
                        isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                      }`}
                    >
                      {podium.third.node.title}
                    </h3>

                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-[#CD7F32]/15 px-2.5 py-1 rounded-lg text-xs font-bold text-[#9A531C] dark:text-[#F5C296]">
                        <Star className="h-3.5 w-3.5 text-[#E5B869] fill-[#E5B869]" />
                        <span>
                          {podium.third.list_status?.score
                            ? `★ ${podium.third.list_status.score}`
                            : `★ ${podium.third.node.mean || '—'}`}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] ${
                          isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                        }`}
                      >
                        {podium.third.list_status?.num_episodes_watched || 0} eps
                      </span>
                    </div>

                    {/* Bronze Plaque Accent */}
                    <div
                      className={`mt-4 w-full py-1.5 px-3 rounded-lg border text-[11px] font-bold text-center ${
                        isDark
                          ? 'bg-[#CD7F32]/10 border-[#CD7F32]/25 text-[#F5C296]'
                          : isSakura
                          ? 'bg-[#CD7F32]/10 border-[#CD7F32]/30 text-[#9A531C]'
                          : 'bg-[#CD7F32]/10 border-[#CD7F32]/30 text-[#9A531C]'
                      }`}
                    >
                      BRONZE MEDALIST
                    </div>
                  </motion.div>
                ) : (
                  <div
                    className={`rounded-2xl border border-dashed p-8 flex items-center justify-center text-xs ${
                      isDark ? 'border-[#2D2A4A] text-[#77747D]' : 'border-[#E7E3DF] text-[#9B97A2]'
                    }`}
                  >
                    No #3 Podium recorded
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 3. 💖 YOUR FAVORITES */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 ${
            isDark ? 'border-[#2D2A4A]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
          }`}
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-[#E06D9B] uppercase">
              <Heart className="h-3.5 w-3.5 fill-[#E06D9B]" />
              <span>Highlights & Devotion</span>
            </div>
            <h2
              className={`text-2xl font-bold tracking-tight mt-1 ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              Your Seasonal Favorites
            </h2>
          </div>
          <span
            className={`text-xs ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
            }`}
          >
            Derived from your ratings, completions, and progress
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Highest Rated */}
          {favorites.highestRated && (
            <motion.div
              whileHover={{ y: -3 }}
              onClick={() => handleOpenAnimeModal(favorites.highestRated!)}
              className={`cursor-pointer rounded-2xl p-5 flex gap-4 transition-all border ${
                isDark
                  ? 'bg-[#181628] hover:bg-[#1E1B33] border-[#37325C]'
                  : isSakura
                  ? 'bg-white hover:bg-[#FFF5F8] border-[#F2D0DB] shadow-xs'
                  : 'bg-white hover:bg-[#FAF8F5] border-[#E7E3DF] shadow-xs'
              }`}
            >
              <img
                src={
                  favorites.highestRated.node.main_picture?.large ||
                  favorites.highestRated.node.main_picture?.medium
                }
                alt={favorites.highestRated.node.title}
                className={`w-20 h-28 rounded-xl object-cover shrink-0 border ${
                  isDark ? 'border-[#37325C]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
                }`}
              />
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#E5B869]/15 text-[#E5B869] text-[10px] font-black tracking-wider uppercase mb-1">
                    Highest Rated
                  </span>
                  <h4
                    className={`text-sm font-bold line-clamp-2 leading-snug ${
                      isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                    }`}
                  >
                    {favorites.highestRated.node.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#E5B869]">
                    <Star className="h-3.5 w-3.5 fill-[#E5B869]" />
                    <span>
                      {favorites.highestRated.list_status?.score
                        ? `★ ${favorites.highestRated.list_status.score}`
                        : `★ ${favorites.highestRated.node.mean || '—'}`}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] ${
                      isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                    }`}
                  >
                    {favorites.highestRated.list_status?.num_episodes_watched || 0} eps watched
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Card 2: Most Devoted / Most Watched */}
          {favorites.mostWatched && (
            <motion.div
              whileHover={{ y: -3 }}
              onClick={() => handleOpenAnimeModal(favorites.mostWatched!)}
              className={`cursor-pointer rounded-2xl p-5 flex gap-4 transition-all border ${
                isDark
                  ? 'bg-[#181628] hover:bg-[#1E1B33] border-[#37325C]'
                  : isSakura
                  ? 'bg-white hover:bg-[#FFF5F8] border-[#F2D0DB] shadow-xs'
                  : 'bg-white hover:bg-[#FAF8F5] border-[#E7E3DF] shadow-xs'
              }`}
            >
              <img
                src={
                  favorites.mostWatched.node.main_picture?.large ||
                  favorites.mostWatched.node.main_picture?.medium
                }
                alt={favorites.mostWatched.node.title}
                className={`w-20 h-28 rounded-xl object-cover shrink-0 border ${
                  isDark ? 'border-[#37325C]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
                }`}
              />
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#7567C7]/20 text-[#D8D2FF] text-[10px] font-black tracking-wider uppercase mb-1">
                    Most Watched
                  </span>
                  <h4
                    className={`text-sm font-bold line-clamp-2 leading-snug ${
                      isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                    }`}
                  >
                    {favorites.mostWatched.node.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <span
                    className={`text-xs font-bold ${
                      isDark ? 'text-[#8B7BF5]' : isSakura ? 'text-[#E06D9B]' : 'text-[#7567C7]'
                    }`}
                  >
                    {favorites.mostWatched.list_status?.num_episodes_watched || 0} Episodes
                  </span>
                  <span
                    className={`text-[11px] ${
                      isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                    }`}
                  >
                    Status: {favorites.mostWatched.list_status?.status || 'Watching'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Card 3: Rewatchable / Perfection */}
          {favorites.rewatchable && (
            <motion.div
              whileHover={{ y: -3 }}
              onClick={() => handleOpenAnimeModal(favorites.rewatchable!)}
              className={`cursor-pointer rounded-2xl p-5 flex gap-4 transition-all border ${
                isDark
                  ? 'bg-[#181628] hover:bg-[#1E1B33] border-[#37325C]'
                  : isSakura
                  ? 'bg-white hover:bg-[#FFF5F8] border-[#F2D0DB] shadow-xs'
                  : 'bg-white hover:bg-[#FAF8F5] border-[#E7E3DF] shadow-xs'
              }`}
            >
              <img
                src={
                  favorites.rewatchable.node.main_picture?.large ||
                  favorites.rewatchable.node.main_picture?.medium
                }
                alt={favorites.rewatchable.node.title}
                className={`w-20 h-28 rounded-xl object-cover shrink-0 border ${
                  isDark ? 'border-[#37325C]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
                }`}
              />
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#6D9B7C]/20 text-[#A2D2B0] text-[10px] font-black tracking-wider uppercase mb-1">
                    Standout Craft
                  </span>
                  <h4
                    className={`text-sm font-bold line-clamp-2 leading-snug ${
                      isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                    }`}
                  >
                    {favorites.rewatchable.node.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#6D9B7C]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Quality Pick</span>
                  </div>
                  <span
                    className={`text-[11px] ${
                      isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                    }`}
                  >
                    MAL Mean: ★ {favorites.rewatchable.node.mean || '—'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. 💀 BIGGEST DISAPPOINTMENTS */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 ${
            isDark ? 'border-[#2D2A4A]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
          }`}
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-[#E06D75] uppercase">
              <Skull className="h-3.5 w-3.5" />
              <span>Editorial Lowlight</span>
            </div>
            <h2
              className={`text-2xl font-bold tracking-tight mt-1 ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              Biggest Disappointments
            </h2>
          </div>
          <span
            className={`text-xs ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
            }`}
          >
            The series that fell short of expectations
          </span>
        </div>

        {disappointments.primary ? (
          <div
            className={`border rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-center md:items-start shadow-xl transition-all ${
              isDark
                ? 'bg-linear-to-r from-[#20151C] via-[#1A131B] to-[#16121D] border-[#4D242C]'
                : isSakura
                ? 'bg-linear-to-r from-[#FFF4F6] via-[#FDF0F3] to-[#FAEEF1] border-[#ECC0CC] shadow-xs'
                : 'bg-linear-to-r from-[#FFF5F5] via-[#FFF0F2] to-[#FAF0F0] border-[#F0C2C5] shadow-xs'
            }`}
          >
            <div
              onClick={() => handleOpenAnimeModal(disappointments.primary!)}
              className="cursor-pointer shrink-0 relative w-36 h-48 sm:w-44 sm:h-60 rounded-2xl overflow-hidden border border-[#E06D75]/40 shadow-lg group"
            >
              <img
                src={
                  disappointments.primary.node.main_picture?.large ||
                  disappointments.primary.node.main_picture?.medium
                }
                alt={disappointments.primary.node.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-bold text-white bg-black/60 px-3 py-1 rounded-full">
                  View Details
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E06D75]/15 border border-[#E06D75]/30 text-[#E06D75] text-xs font-bold tracking-wide">
                <span>💀 BIGGEST DISAPPOINTMENT</span>
              </div>

              <h3
                className={`text-xl sm:text-2xl font-extrabold ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                {disappointments.primary.node.title}
              </h3>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                {disappointments.primary.list_status?.score ? (
                  <div className="flex items-center gap-1.5 bg-[#E06D75]/20 px-3 py-1 rounded-xl text-sm font-bold text-[#E06D75]">
                    <Star className="h-4 w-4 fill-[#E06D75]" />
                    <span>Your Score: ★ {disappointments.primary.list_status.score}</span>
                  </div>
                ) : (
                  <div
                    className={`px-3 py-1 rounded-xl text-xs font-medium border ${
                      isDark
                        ? 'bg-[#2D2A4A] text-[#AEA8C9] border-[#37325C]'
                        : isSakura
                        ? 'bg-white text-[#8C6D8C] border-[#F2D0DB]'
                        : 'bg-white text-[#77747D] border-[#E7E3DF]'
                    }`}
                  >
                    Status: {disappointments.primary.list_status?.status || 'Dropped'}
                  </div>
                )}

                <span
                  className={`text-xs ${
                    isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                  }`}
                >
                  Progress: {disappointments.primary.list_status?.num_episodes_watched || 0} of{' '}
                  {disappointments.primary.node.num_episodes || '?'} episodes
                </span>
              </div>

              {/* Show User Note / Decoded Comment if available */}
              {getDisplayNote(disappointments.primary) ? (
                <div
                  className={`p-4 rounded-xl border text-sm italic ${
                    isDark
                      ? 'bg-[#140E14] border-[#4D242C] text-[#FFCDD2]'
                      : isSakura
                      ? 'bg-white/90 border-[#ECC0CC] text-[#A62847]'
                      : 'bg-white/90 border-[#F0C2C5] text-[#A62837]'
                  }`}
                >
                  "{getDisplayNote(disappointments.primary)}"
                </div>
              ) : (
                <p
                  className={`text-sm ${
                    isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                  }`}
                >
                  {disappointments.isActuallyLow
                    ? 'Scored noticeably lower than the rest of your season watchlist. Some journeys just aren’t meant to be.'
                    : 'Your lowest scored title this season, though still watched with patience.'}
                </p>
              )}

              {/* Secondary Disappointments Podium */}
              {disappointments.others.length > 0 && (
                <div
                  className={`pt-4 border-t ${
                    isDark ? 'border-[#4D242C]/60' : isSakura ? 'border-[#ECC0CC]' : 'border-[#F0C2C5]'
                  }`}
                >
                  <div className="text-xs font-bold text-[#E06D75] uppercase tracking-wider mb-2">
                    Runner-up Lowlights:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {disappointments.others.map((item) => (
                      <button
                        key={item.node.id}
                        onClick={() => handleOpenAnimeModal(item)}
                        className={`px-3 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                          isDark
                            ? 'bg-[#20151C] hover:bg-[#2D1B26] border-[#4D242C] text-white'
                            : isSakura
                            ? 'bg-white hover:bg-[#FDF0F3] border-[#ECC0CC] text-[#3B2D3B]'
                            : 'bg-white hover:bg-[#FFF0F0] border-[#F0C2C5] text-[#25242A]'
                        }`}
                      >
                        {item.node.title} (
                        {item.list_status?.score ? `★ ${item.list_status.score}` : item.list_status?.status}
                        )
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`rounded-3xl p-8 text-center space-y-2 border ${
              isDark
                ? 'bg-[#181628] border-[#37325C]'
                : isSakura
                ? 'bg-white/95 border-[#F2D0DB] shadow-xs'
                : 'bg-white border-[#E7E3DF] shadow-xs'
            }`}
          >
            <div className="inline-flex p-3 rounded-full bg-[#6D9B7C]/20 text-[#6D9B7C] mb-2">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3
              className={`text-lg font-bold ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              No Catastrophes Found!
            </h3>
            <p
              className={`text-sm max-w-md mx-auto ${
                isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
              }`}
            >
              You did not assign any low scores or drop any anime this season. Either Summer 2026 was consistently high quality or your curation was immaculate!
            </p>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 5. 🏅 SEASON AWARDS */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 ${
            isDark ? 'border-[#2D2A4A]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
          }`}
        >
          <div>
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase ${
                isDark ? 'text-[#E5B869]' : isSakura ? 'text-[#D49E50]' : 'text-[#C69A55]'
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              <span>Yearbook Honours</span>
            </div>
            <h2
              className={`text-2xl font-bold tracking-tight mt-1 ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              Season Awards
            </h2>
          </div>
          <span
            className={`text-xs ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
            }`}
          >
            Calculated reliably from your watch data and scores
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {seasonAwards.map((award) => {
            const Icon = award.icon;
            return (
              <motion.div
                key={award.id}
                whileHover={{ y: -4 }}
                onClick={() => handleOpenAnimeModal(award.anime)}
                className={`cursor-pointer bg-linear-to-b ${award.gradient} border rounded-2xl p-5 flex flex-col justify-between shadow-xs transition-all ${
                  isDark
                    ? 'bg-[#161426] border-white/10'
                    : isSakura
                    ? 'bg-white border-[#F2D0DB]'
                    : 'bg-white border-[#E7E3DF]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md flex items-center gap-1 ${
                        isDark
                          ? 'bg-white/10 text-white'
                          : isSakura
                          ? 'bg-[#FDF0F3] text-[#3B2D3B] border border-[#F2D0DB]'
                          : 'bg-[#F4F1EC] text-[#25242A] border border-[#E7E3DF]'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{award.title}</span>
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        isDark ? 'text-[#D8D2FF]' : isSakura ? 'text-[#E06D9B]' : 'text-[#7567C7]'
                      }`}
                    >
                      {award.badge}
                    </span>
                  </div>

                  <div className="flex gap-3.5 mt-2">
                    <img
                      src={
                        award.anime.node.main_picture?.large ||
                        award.anime.node.main_picture?.medium
                      }
                      alt={award.anime.node.title}
                      className={`w-16 h-22 rounded-xl object-cover shrink-0 border ${
                        isDark ? 'border-white/10' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
                      }`}
                    />
                    <div className="flex-1 overflow-hidden">
                      <h4
                        className={`text-sm font-bold line-clamp-2 leading-snug ${
                          isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                        }`}
                      >
                        {award.anime.node.title}
                      </h4>
                      <p
                        className={`text-xs mt-1.5 leading-relaxed ${
                          isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#7A617A]' : 'text-[#6B6675]'
                        }`}
                      >
                        {award.reason}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] ${
                    isDark
                      ? 'border-white/10 text-[#AEA8C9]'
                      : isSakura
                      ? 'border-[#F2D0DB] text-[#8C6D8C]'
                      : 'border-[#E7E3DF] text-[#77747D]'
                  }`}
                >
                  <span>Status: {award.anime.list_status?.status || 'Watching'}</span>
                  <span
                    className={`font-medium ${
                      isDark ? 'text-white/80' : isSakura ? 'text-[#E06D9B]' : 'text-[#7567C7]'
                    }`}
                  >
                    Click to inspect →
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. 📊 YOUR WATCHING STYLE */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 ${
            isDark ? 'border-[#2D2A4A]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
          }`}
        >
          <div>
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase ${
                isDark ? 'text-[#8B7BF5]' : isSakura ? 'text-[#E06D9B]' : 'text-[#7567C7]'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Habits & Palette</span>
            </div>
            <h2
              className={`text-2xl font-bold tracking-tight mt-1 ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              Your Watching Style
            </h2>
          </div>
          <span
            className={`text-xs ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
            }`}
          >
            A thematic portrait of your Summer 2026 journey
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Genre Bars Card */}
          <div
            className={`border rounded-3xl p-6 sm:p-8 space-y-6 ${
              isDark
                ? 'bg-[#181628] border-[#2D2A4A]'
                : isSakura
                ? 'bg-white border-[#F2D0DB] shadow-xs'
                : 'bg-white border-[#E7E3DF] shadow-xs'
            }`}
          >
            <div>
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                }`}
              >
                Dominant Genres
              </span>
              <h3
                className={`text-xl font-extrabold mt-1 ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                Where Your Time Went
              </h3>
            </div>

            <div className="space-y-4">
              {watchingStyle.genres.map(([genreName, count], idx) => {
                const maxCount = watchingStyle.genres[0]?.[1] || 1;
                const percentage = Math.round((count / maxCount) * 100);
                return (
                  <div key={genreName} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span
                        className={`uppercase tracking-wider ${
                          isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                        }`}
                      >
                        {genreName}
                      </span>
                      <span
                        className={
                          isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                        }
                      >
                        {count} Titles
                      </span>
                    </div>
                    <div
                      className={`w-full h-3 rounded-full overflow-hidden ${
                        isDark ? 'bg-[#25233B]' : isSakura ? 'bg-[#F6E6EB]' : 'bg-[#ECE8E1]'
                      }`}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1 }}
                        className={`h-full rounded-full ${
                          idx === 0
                            ? 'bg-linear-to-r from-[#E5B869] to-[#C69A55]'
                            : idx === 1
                            ? 'bg-linear-to-r from-[#8B7BF5] to-[#7567C7]'
                            : 'bg-linear-to-r from-[#6D9B7C] to-[#558263]'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Editorial Takeaway Card */}
          <div
            className={`border rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6 ${
              isDark
                ? 'bg-linear-to-br from-[#1E1B33] to-[#151326] border-[#2D2A4A]'
                : isSakura
                ? 'bg-linear-to-br from-[#FFF5F8] to-[#FBE8EE] border-[#F2CDD9] shadow-xs'
                : 'bg-linear-to-br from-[#FAF7F2] to-[#F3EDE4] border-[#E2DDD5] shadow-xs'
            }`}
          >
            <div>
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 ${
                  isDark
                    ? 'bg-[#8B7BF5]/20 text-[#D8D2FF]'
                    : isSakura
                    ? 'bg-[#E06D9B]/15 text-[#A63A68]'
                    : 'bg-[#7567C7]/15 text-[#5B4EAE]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#E5B869]" />
                <span>Editorial Observation</span>
              </div>
              <h3
                className={`text-xl sm:text-2xl font-bold leading-snug ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                "{watchingStyle.statement}"
              </h3>
            </div>

            <div
              className={`pt-6 border-t grid grid-cols-2 gap-4 ${
                isDark ? 'border-[#2D2A4A]' : isSakura ? 'border-[#F2CDD9]' : 'border-[#E2DDD5]'
              }`}
            >
              <div>
                <span
                  className={`text-xs uppercase tracking-wider block ${
                    isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                  }`}
                >
                  Completion Rate
                </span>
                <span
                  className={`text-2xl font-black mt-1 block ${
                    isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                  }`}
                >
                  {metrics.animeWatched > 0
                    ? Math.round((metrics.completedCount / metrics.animeWatched) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div>
                <span
                  className={`text-xs uppercase tracking-wider block ${
                    isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
                  }`}
                >
                  Pacing
                </span>
                <span
                  className={`text-sm font-bold mt-1.5 block ${
                    isDark ? 'text-[#E5B869]' : isSakura ? 'text-[#D49E50]' : 'text-[#C69A55]'
                  }`}
                >
                  {metrics.episodesWatched > 50 ? '⚡ Rapid Weekly Tracker' : '🌱 Selective & Steady'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. 🌟 SEASON SURPRISE */}
      {/* ========================================================================= */}
      {biggestSurprise && (
        <section className="space-y-6">
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 ${
              isDark ? 'border-[#2D2A4A]' : isSakura ? 'border-[#F2D0DB]' : 'border-[#E7E3DF]'
            }`}
          >
            <div>
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase ${
                  isDark ? 'text-[#E5B869]' : isSakura ? 'text-[#D49E50]' : 'text-[#C69A55]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>The Underdog Champion</span>
              </div>
              <h2
                className={`text-2xl font-bold tracking-tight mt-1 ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                Biggest Surprise
              </h2>
            </div>
            <span
              className={`text-xs ${
                isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
              }`}
            >
              The show that blew away the global consensus for you
            </span>
          </div>

          <div
            onClick={() => handleOpenAnimeModal(biggestSurprise.item)}
            className={`cursor-pointer border-2 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-center transition-all ${
              isDark
                ? 'bg-linear-to-r from-[#201D38] via-[#1B1830] to-[#151326] border-[#E5B869]/50 hover:border-[#E5B869] shadow-xl'
                : isSakura
                ? 'bg-linear-to-r from-[#FFF9FA] via-[#FDF3F6] to-[#FCEAEF] border-[#D49E50]/70 hover:border-[#D49E50] shadow-sm'
                : 'bg-linear-to-r from-[#FFFDF9] via-[#FAF6ED] to-[#F5EFE4] border-[#C69A55]/70 hover:border-[#C69A55] shadow-sm'
            }`}
          >
            <img
              src={
                biggestSurprise.item.node.main_picture?.large ||
                biggestSurprise.item.node.main_picture?.medium
              }
              alt={biggestSurprise.item.node.title}
              className={`w-32 h-44 sm:w-40 sm:h-56 rounded-2xl object-cover shrink-0 border shadow-md ${
                isDark ? 'border-[#E5B869]/40' : isSakura ? 'border-[#D49E50]/40' : 'border-[#C69A55]/40'
              }`}
            />
            <div className="space-y-3 flex-1 text-center md:text-left">
              <span
                className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase inline-block ${
                  isDark
                    ? 'bg-[#E5B869]/20 text-[#E5B869]'
                    : isSakura
                    ? 'bg-[#D49E50]/15 text-[#9E6E24]'
                    : 'bg-[#C69A55]/15 text-[#8E6418]'
                }`}
              >
                🌟 Surpassed Expectations (+{biggestSurprise.diff.toFixed(1)})
              </span>
              <h3
                className={`text-2xl font-extrabold ${
                  isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
                }`}
              >
                {biggestSurprise.item.node.title}
              </h3>
              <p
                className={`text-sm leading-relaxed ${
                  isDark ? 'text-[#D8D2FF]' : isSakura ? 'text-[#6E556E]' : 'text-[#5B5566]'
                }`}
              >
                You appreciated this series significantly more than the global anime community. While MAL users averaged a score of{' '}
                <span className={`font-bold ${isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'}`}>
                  ★ {biggestSurprise.malMean.toFixed(1)}
                </span>, you awarded it a glowing{' '}
                <span className={`font-bold ${isDark ? 'text-[#E5B869]' : isSakura ? 'text-[#D49E50]' : 'text-[#C69A55]'}`}>
                  ★ {biggestSurprise.userScore.toFixed(1)}
                </span>.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
                <div
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    isDark
                      ? 'bg-[#2D2A4A] text-white border-transparent'
                      : isSakura
                      ? 'bg-white text-[#3B2D3B] border-[#F2D0DB] shadow-2xs'
                      : 'bg-white text-[#25242A] border-[#E2DDD5] shadow-2xs'
                  }`}
                >
                  Your Score: ★ {biggestSurprise.userScore}
                </div>
                <div
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    isDark
                      ? 'bg-[#2D2A4A] text-[#AEA8C9] border-transparent'
                      : isSakura
                      ? 'bg-white text-[#8C6D8C] border-[#F2D0DB] shadow-2xs'
                      : 'bg-white text-[#77747D] border-[#E2DDD5] shadow-2xs'
                  }`}
                >
                  MAL Community: ★ {biggestSurprise.malMean.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 8. FINAL SEASON VERDICT */}
      {/* ========================================================================= */}
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className={`relative overflow-hidden rounded-3xl p-8 sm:p-12 md:p-16 text-center space-y-8 border-2 transition-all ${
          isDark
            ? 'bg-linear-to-b from-[#241F3B] via-[#1B172E] to-[#12101F] border-[#E5B869]/70 shadow-[0_0_50px_rgba(229,184,105,0.15)]'
            : isSakura
            ? 'bg-linear-to-b from-[#FFF9FA] via-[#FDF2F5] to-[#FCE5EC] border-[#D49E50] shadow-xl'
            : 'bg-linear-to-b from-[#FFFDF9] via-[#FAF5EA] to-[#F2E9D8] border-[#C69A55] shadow-xl'
        }`}
      >
        <div className="space-y-3">
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase border ${
              isDark
                ? 'bg-[#E5B869]/20 border-[#E5B869]/50 text-[#E5B869]'
                : isSakura
                ? 'bg-[#D49E50]/15 border-[#D49E50]/40 text-[#9E6E24]'
                : 'bg-[#C69A55]/15 border-[#C69A55]/40 text-[#8E6418]'
            }`}
          >
            <Trophy className="h-4 w-4" />
            <span>SUMMER 2026 • FINAL VERDICT</span>
          </div>
          <h2
            className={`text-3xl sm:text-5xl font-black tracking-tight uppercase ${
              isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
            }`}
          >
            Your Final Verdict
          </h2>
        </div>

        {/* Big Cinematic Score */}
        <div className="flex flex-col items-center justify-center">
          <div
            className={`text-6xl sm:text-8xl font-black text-transparent bg-clip-text tracking-tight ${
              isDark
                ? 'bg-linear-to-b from-[#FFF0C2] via-[#E5B869] to-[#996E24]'
                : isSakura
                ? 'bg-linear-to-b from-[#D49E50] via-[#B87D2B] to-[#7A5016]'
                : 'bg-linear-to-b from-[#C69A55] via-[#A87930] to-[#785317]'
            }`}
          >
            ★ {finalVerdict.averageScore}
          </div>
          <span
            className={`text-xs font-bold uppercase tracking-widest mt-2 ${
              isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
            }`}
          >
            Average Season Score Out of 10
          </span>
        </div>

        {/* Cinematic Headline */}
        <p
          className={`text-lg sm:text-2xl font-bold italic max-w-xl mx-auto leading-relaxed ${
            isDark ? 'text-[#D8D2FF]' : isSakura ? 'text-[#614761]' : 'text-[#4D4559]'
          }`}
        >
          "{finalVerdict.editorialVerdict}"
        </p>

        {/* Final Yearbook Recap Table */}
        <div
          className={`grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 border-t max-w-3xl mx-auto text-left ${
            isDark ? 'border-[#3B345C]' : isSakura ? 'border-[#F2CDD9]' : 'border-[#E2DDD5]'
          }`}
        >
          <div
            className={`p-4 rounded-xl border ${
              isDark
                ? 'bg-[#181528]/80 border-[#3B345C]'
                : isSakura
                ? 'bg-white/90 border-[#F2CDD9] shadow-2xs'
                : 'bg-white/90 border-[#E2DDD5] shadow-2xs'
            }`}
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-wider block ${
                isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
              }`}
            >
              Anime of the Season
            </span>
            <span
              className={`text-xs sm:text-sm font-bold mt-1 line-clamp-1 block ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              {finalVerdict.champion}
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border ${
              isDark
                ? 'bg-[#181528]/80 border-[#3B345C]'
                : isSakura
                ? 'bg-white/90 border-[#F2CDD9] shadow-2xs'
                : 'bg-white/90 border-[#E2DDD5] shadow-2xs'
            }`}
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-wider block ${
                isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
              }`}
            >
              Personal Favorite
            </span>
            <span
              className={`text-xs sm:text-sm font-bold mt-1 line-clamp-1 block ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              {finalVerdict.favoriteAnime}
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border ${
              isDark
                ? 'bg-[#181528]/80 border-[#3B345C]'
                : isSakura
                ? 'bg-white/90 border-[#F2CDD9] shadow-2xs'
                : 'bg-white/90 border-[#E2DDD5] shadow-2xs'
            }`}
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-wider block ${
                isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
              }`}
            >
              Disappointment
            </span>
            <span
              className={`text-xs sm:text-sm font-bold mt-1 line-clamp-1 block ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              {finalVerdict.biggestDisappointment}
            </span>
          </div>

          <div
            className={`p-4 rounded-xl border ${
              isDark
                ? 'bg-[#181528]/80 border-[#3B345C]'
                : isSakura
                ? 'bg-white/90 border-[#F2CDD9] shadow-2xs'
                : 'bg-white/90 border-[#E2DDD5] shadow-2xs'
            }`}
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-wider block ${
                isDark ? 'text-[#AEA8C9]' : isSakura ? 'text-[#8C6D8C]' : 'text-[#77747D]'
              }`}
            >
              Dominant Genre
            </span>
            <span
              className={`text-xs sm:text-sm font-bold mt-1 line-clamp-1 block ${
                isDark ? 'text-white' : isSakura ? 'text-[#3B2D3B]' : 'text-[#25242A]'
              }`}
            >
              {finalVerdict.topGenre}
            </span>
          </div>
        </div>
      </motion.section>

      {/* ========================================================================= */}
      {/* 9. SEASON NAVIGATION (Bottom) */}
      {/* ========================================================================= */}
      <div
        className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t text-xs font-semibold ${
          isDark
            ? 'border-[#2D2A4A] text-[#AEA8C9]'
            : isSakura
            ? 'border-[#F2D0DB] text-[#8C6D8C]'
            : 'border-[#E7E3DF] text-[#77747D]'
        }`}
      >
        <button
          disabled
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-not-allowed opacity-60 ${
            isDark
              ? 'bg-[#181628] border-[#2D2A4A] text-[#636077]'
              : isSakura
              ? 'bg-white/60 border-[#F2D0DB] text-[#A88BA8]'
              : 'bg-[#F5F2EB] border-[#E7E3DF] text-[#9B97A2]'
          }`}
          title="Past seasons will be available in future updates"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>SPRING 2026 (Archive)</span>
        </button>

        <div
          className={`flex items-center gap-2 border px-4 py-2 rounded-xl font-bold ${
            isDark
              ? 'bg-[#1E1B33] border-[#E5B869]/50 text-white'
              : isSakura
              ? 'bg-white border-[#D49E50] text-[#3B2D3B] shadow-2xs'
              : 'bg-white border-[#C69A55] text-[#25242A] shadow-2xs'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              isDark ? 'bg-[#E5B869]' : isSakura ? 'bg-[#D49E50]' : 'bg-[#C69A55]'
            }`}
          />
          <span>SUMMER 2026 (ACTIVE)</span>
        </div>

        <button
          disabled
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-not-allowed opacity-60 ${
            isDark
              ? 'bg-[#181628] border-[#2D2A4A] text-[#636077]'
              : isSakura
              ? 'bg-white/60 border-[#F2D0DB] text-[#A88BA8]'
              : 'bg-[#F5F2EB] border-[#E7E3DF] text-[#9B97A2]'
          }`}
          title="Upcoming seasons will unlock upon release"
        >
          <span>FALL 2026 (Upcoming)</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ANIME DETAIL MODAL */}
      <AnimeDetailModal
        anime={selectedAnimeModal}
        isOpen={selectedAnimeModal !== null}
        onClose={() => setSelectedAnimeModal(null)}
        customNotes={customUserNotes}
        onSaveNote={onSaveCustomNote}
      />
    </div>
  );
};
