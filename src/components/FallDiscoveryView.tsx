import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Flame,
  Search,
  Filter,
  BookmarkPlus,
  Edit2,
  Star,
  Tv,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpDown,
  RefreshCw,
  X,
  ChevronRight,
  Info,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import { MalListItem, MalUser } from '../types';
import { JikanSeasonalAnime } from '../utils/seasonUtils';
import {
  buildUserProfile,
  calculateAnimeRecommendation,
  RecommendationMatch,
} from '../utils/recommendationUtils';

interface FallDiscoveryViewProps {
  fallCatalogue: JikanSeasonalAnime[];
  loading: boolean;
  malList: MalListItem[];
  malUser: MalUser | null;
  userMalMap: Map<number, MalListItem>;
  addingAnimeId: number | null;
  onAddToList: (item: any) => void;
  onEditAnime: (item: any) => void;
  onSelectAnime: (item: any) => void;
  onRefreshCatalogue: () => void;
}

type DiscoveryTab = 'recommended' | 'sequels' | 'anticipated' | 'all';

export const FallDiscoveryView: React.FC<FallDiscoveryViewProps> = ({
  fallCatalogue,
  loading,
  malList,
  malUser,
  userMalMap,
  addingAnimeId,
  onAddToList,
  onEditAnime,
  onSelectAnime,
  onRefreshCatalogue,
}) => {
  const [activeTab, setActiveTab] = useState<DiscoveryTab>('recommended');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'match' | 'score' | 'title'>('match');

  // Compute User Taste Profile from their MAL List
  const userProfileData = useMemo(() => {
    return buildUserProfile(malList);
  }, [malList]);

  // Compute Recommendation Scores for all Fall 2026 titles
  const allScoredAnime = useMemo(() => {
    return fallCatalogue.map((anime) =>
      calculateAnimeRecommendation(anime, userProfileData, userMalMap)
    );
  }, [fallCatalogue, userProfileData, userMalMap]);

  // Extract all available genres for filtering
  const availableGenres = useMemo(() => {
    const genresSet = new Set<string>();
    for (const item of fallCatalogue) {
      const gList = (item as any).genres;
      if (Array.isArray(gList)) {
        for (const g of gList) {
          if (g?.name) genresSet.add(g.name.trim());
        }
      }
    }
    return Array.from(genresSet).sort();
  }, [fallCatalogue]);

  // Filter and Sort Recommendations based on current controls
  const filteredAndSortedItems = useMemo(() => {
    let result = [...allScoredAnime];

    // 1. Tab Filtering
    if (activeTab === 'sequels') {
      result = result.filter((item) => item.isFranchiseSequel);
    } else if (activeTab === 'anticipated') {
      result = result.filter((item) => {
        const score = item.anime.score || (item.anime as any).mean || 0;
        return score >= 7.8 || item.matchScore >= 85;
      });
    } else if (activeTab === 'recommended') {
      // Top matches: high match score or franchise sequels
      result = result.filter((item) => item.matchScore >= 70 || item.isFranchiseSequel);
    }

    // 2. Search Query Filtering
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        const title = (item.anime.title || '').toLowerCase();
        const engTitle = ((item.anime as any).title_english || '').toLowerCase();
        const studio = (item.matchedStudio || (item.anime as any).studio || '').toLowerCase();
        const synopsis = ((item.anime as any).synopsis || '').toLowerCase();
        return (
          title.includes(q) ||
          engTitle.includes(q) ||
          studio.includes(q) ||
          synopsis.includes(q)
        );
      });
    }

    // 3. Genre Filtering
    if (selectedGenre !== 'all') {
      result = result.filter((item) => {
        const gList = (item.anime as any).genres;
        if (Array.isArray(gList)) {
          return gList.some((g: any) => g?.name?.toLowerCase() === selectedGenre.toLowerCase());
        }
        return false;
      });
    }

    // 4. Sorting
    result.sort((a, b) => {
      if (sortBy === 'match') {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return ((b.anime.score || 0) as number) - ((a.anime.score || 0) as number);
      }
      if (sortBy === 'score') {
        const scoreA = a.anime.score || (a.anime as any).mean || 0;
        const scoreB = b.anime.score || (b.anime as any).mean || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return b.matchScore - a.matchScore;
      }
      if (sortBy === 'title') {
        return (a.anime.title || '').localeCompare(b.anime.title || '');
      }
      return 0;
    });

    return result;
  }, [allScoredAnime, activeTab, searchQuery, selectedGenre, sortBy]);

  return (
    <div className="space-y-6">
      {/* Fall 2026 Header & Taste Profile Overview */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#231F2A] via-[#1E1B24] to-[#2B1B1F] border border-[#E07A5F]/30 p-6 sm:p-8 text-white shadow-lg">
        {/* Subtle decorative background elements */}
        <div className="pointer-events-none absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-[#E07A5F]/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 -mb-12 w-48 h-48 rounded-full bg-[#E5B869]/10 blur-2xl" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E07A5F]/20 border border-[#E07A5F]/40 text-[#FFA987] text-xs font-bold tracking-wider uppercase mb-2">
                <Flame className="h-3.5 w-3.5 text-[#E07A5F]" />
                <span>🍂 Fall 2026 Discovery & Recommendations</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FDF8EE]">
                Explore Upcoming Fall 2026 Releases
              </h3>
              <p className="text-xs sm:text-sm text-[#D1CCD9] mt-1 max-w-2xl leading-relaxed">
                Personalized anime discovery dynamically powered by your MyAnimeList watch history, favorite genres, top-rated studios, and franchise sequel tracking.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={onRefreshCatalogue}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
                title="Refresh Fall 2026 Catalogue"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Catalogue</span>
              </button>
            </div>
          </div>

          {/* User Taste Profile Chips */}
          {malList.length > 0 && userProfileData.profile.topGenres.length > 0 && (
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#FFA987] font-bold flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-[#E5B869]" />
                  <span>Taste Profile:</span>
                </span>
                <span className="text-[#D1CCD9]">Top Genres:</span>
                {userProfileData.profile.topGenres.slice(0, 4).map((g) => (
                  <span
                    key={g.name}
                    className="px-2.5 py-0.5 rounded-full bg-white/10 text-white font-medium text-[11px] border border-white/15"
                  >
                    {g.name}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[#D1CCD9] text-[11px]">
                <span>{fallCatalogue.length} Fall 2026 Titles Loaded</span>
                <span>•</span>
                <span>{allScoredAnime.filter((a) => a.isFranchiseSequel).length} Returning Franchises</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Discovery Navigation & Controls */}
      <div className="space-y-4">
        {/* Top Segmented Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-2xl p-4 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1.5 bg-[#F7F5F2] dark:bg-[#25232F] p-1 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37]">
            {[
              { id: 'recommended', label: '🔥 For You', count: allScoredAnime.filter((a) => a.matchScore >= 70 || a.isFranchiseSequel).length },
              { id: 'sequels', label: '🌟 Returning & Sequels', count: allScoredAnime.filter((a) => a.isFranchiseSequel).length },
              { id: 'anticipated', label: '✨ High Anticipation', count: allScoredAnime.filter((a) => (a.anime.score || 0) >= 7.8 || a.matchScore >= 85).length },
              { id: 'all', label: '📚 All Fall 2026', count: fallCatalogue.length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as DiscoveryTab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-[#1C1A24] text-[#7567C7] dark:text-[#C5BEF7] font-bold shadow-2xs'
                    : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-[#EAE8F0]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-[#2E2C37] font-bold opacity-80">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <label htmlFor="fall-sort-option" className="text-xs font-bold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3 text-[#7567C7]" />
              <span>Sort:</span>
            </label>
            <select
              id="fall-sort-option"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-white dark:hover:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[#25242A] dark:text-[#EAE8F0] text-xs font-medium rounded-xl py-1.5 pl-3 pr-7 shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#7567C7] transition-all cursor-pointer"
            >
              <option value="match">Highest Match %</option>
              <option value="score">Highest MAL Score</option>
              <option value="title">Title (A to Z)</option>
            </select>
          </div>
        </div>

        {/* Search Bar and Genre Filter Pills */}
        <div className="bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-2xl p-4 shadow-2xs space-y-3">
          {/* Search Input */}
          <div className="relative flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#77747D] dark:text-[#A4A1AA]">
              <Search className="h-4 w-4 text-[#7567C7]" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Fall 2026 anime by title, studio, or genre..."
              className="w-full rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] py-2.5 pl-10 pr-9 text-xs text-[#25242A] dark:text-[#EAE8F0] placeholder-[#77747D] dark:placeholder-[#A4A1AA] shadow-2xs focus:border-[#7567C7] focus:outline-none focus:ring-1 focus:ring-[#7567C7] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#77747D] hover:text-[#25242A] dark:hover:text-[#EAE8F0] cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Genre Quick Filter Chips */}
          {availableGenres.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-[11px] font-bold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Filter className="h-3 w-3 text-[#7567C7]" />
                <span>Genre:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedGenre('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                  selectedGenre === 'all'
                    ? 'bg-[#7567C7] text-white'
                    : 'bg-[#F7F5F2] dark:bg-[#25232F] text-[#77747D] dark:text-[#A4A1AA] hover:bg-[#EFECE8] dark:hover:bg-[#2D2B38]'
                }`}
              >
                All
              </button>
              {availableGenres.map((g) => {
                const isSelected = selectedGenre.toLowerCase() === g.toLowerCase();
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGenre(isSelected ? 'all' : g)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#7567C7] text-white font-bold'
                        : 'bg-[#F7F5F2] dark:bg-[#25232F] text-[#25242A] dark:text-[#EAE8F0] hover:bg-[#EFECE8] dark:hover:bg-[#2D2B38]'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results Count Header */}
      <div className="flex items-center justify-between px-1">
        <h4 className="text-sm font-bold text-[#25242A] dark:text-[#EAE8F0] flex items-center gap-2">
          <span>Fall 2026 Titles</span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#E07A5F]/15 text-[#E07A5F] text-[11px] font-bold">
            {filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'anime' : 'anime'}
          </span>
        </h4>

        <span className="text-xs text-[#77747D] dark:text-[#A4A1AA]">
          Showing {activeTab === 'recommended' ? 'Top Recommended' : activeTab === 'sequels' ? 'Franchise Sequels' : activeTab === 'anticipated' ? 'Highly Anticipated' : 'All Releases'}
        </span>
      </div>

      {/* Loading Skeleton */}
      {loading && fallCatalogue.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] p-4 space-y-4"
            >
              <div className="aspect-[3/4] w-full rounded-xl bg-slate-200 dark:bg-[#25232F]" />
              <div className="h-4 w-3/4 rounded-md bg-slate-200 dark:bg-[#25232F]" />
              <div className="h-3 w-1/2 rounded-md bg-slate-200 dark:bg-[#25232F]" />
            </div>
          ))}
        </div>
      )}

      {/* Discovery Cards Grid */}
      {!loading && filteredAndSortedItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredAndSortedItems.map((item, index) => {
            const anime = item.anime;
            const animeNode = anime as any;
            const userListItem = item.userMalItem;
            const imageUrl =
              anime.images?.jpg?.large_image_url ||
              anime.images?.webp?.large_image_url ||
              anime.images?.jpg?.image_url ||
              animeNode.main_picture?.large ||
              animeNode.main_picture?.medium;

            const meanScore = anime.score || animeNode.mean || animeNode.score;
            const isAdding = addingAnimeId === anime.mal_id;

            return (
              <motion.div
                key={anime.mal_id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.25) }}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/50 p-3.5 shadow-2xs hover:shadow-md transition-all duration-200"
              >
                <div>
                  {/* Poster Thumbnail */}
                  <div
                    onClick={() => onSelectAnime(anime)}
                    className="relative aspect-[3/4.2] w-full overflow-hidden rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] mb-3 cursor-pointer"
                  >
                    {/* Match Score Badge */}
                    <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs backdrop-blur-md border border-white/10">
                      <Sparkles className="h-3 w-3 text-[#E5B869]" />
                      <span className={item.matchScore >= 85 ? 'text-emerald-400 font-extrabold' : 'text-[#E5B869]'}>
                        {item.matchScore}% Match
                      </span>
                    </div>

                    {/* MAL Mean Score */}
                    {meanScore && (
                      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/90 px-2 py-0.5 text-xs font-bold text-[#C69A55] shadow-2xs backdrop-blur-md border border-white/10">
                        <Star className="h-3 w-3 fill-current text-[#C69A55]" />
                        <span>{typeof meanScore === 'number' ? meanScore.toFixed(1) : meanScore}</span>
                      </div>
                    )}

                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={anime.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[#77747D]">
                        No Image
                      </div>
                    )}

                    {/* Franchise Sequel Badge Overlay */}
                    {item.isFranchiseSequel && (
                      <div className="absolute bottom-2 left-2 right-2 z-10 px-2.5 py-1 rounded-lg bg-[#7567C7]/95 text-white text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                        <Sparkles className="h-3 w-3 text-amber-300 shrink-0" />
                        <span className="truncate">Franchise Sequel</span>
                      </div>
                    )}
                  </div>

                  {/* Title & Info */}
                  <div className="space-y-1.5 px-0.5">
                    <h5
                      onClick={() => onSelectAnime(anime)}
                      className="font-bold text-[#25242A] dark:text-[#EAE8F0] text-sm leading-snug line-clamp-2 group-hover:text-[#7567C7] transition-colors cursor-pointer"
                      title={anime.title}
                    >
                      {anime.title}
                    </h5>

                    {/* Studio / Media Type */}
                    <div className="flex items-center gap-2 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex-wrap">
                      {item.matchedStudio && (
                        <span className="font-semibold text-[#7567C7] dark:text-[#C5BEF7]">
                          {item.matchedStudio}
                        </span>
                      )}
                      {anime.episodes && (
                        <span>• {anime.episodes} eps</span>
                      )}
                      {(animeNode.media_type || animeNode.type) && (
                        <span>• {(animeNode.media_type || animeNode.type).toUpperCase()}</span>
                      )}
                    </div>

                    {/* Match Reason Tag */}
                    {item.matchReasons.length > 0 && (
                      <div className="pt-1">
                        <div className="px-2.5 py-1 rounded-lg bg-[#F0EDFA] dark:bg-[#25232F] text-[#7567C7] dark:text-[#C5BEF7] text-[11px] font-medium line-clamp-1 border border-[#7567C7]/20">
                          {item.matchReasons[0]}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions: MAL Sync Status & Buttons */}
                <div className="mt-3 pt-2.5 border-t border-[#E7E3DF] dark:border-[#2E2C37] space-y-2">
                  {userListItem ? (
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6D9B7C]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="capitalize">{userListItem.list_status?.status?.replace(/_/g, ' ') || 'In List'}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => onEditAnime(userListItem)}
                        className="px-2.5 py-1 rounded-lg bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#F0EDFA] text-[#7567C7] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37]"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit on MAL</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isAdding}
                      onClick={() => onAddToList(anime)}
                      className="w-full py-2 px-3 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      {isAdding ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Adding to MAL...</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="h-3.5 w-3.5" />
                          <span>Add to My List (Plan to Watch)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredAndSortedItems.length === 0 && (
        <div className="text-center py-16 px-4 bg-white dark:bg-[#1C1A24] rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37] space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F0EDFA] dark:bg-[#25232F] flex items-center justify-center text-[#7567C7] mx-auto">
            <Compass className="h-6 w-6" />
          </div>
          <h4 className="text-base font-bold text-[#25242A] dark:text-[#EAE8F0]">
            No Fall 2026 anime found matching your criteria
          </h4>
          <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] max-w-md mx-auto">
            {searchQuery
              ? `No releases match "${searchQuery}". Try clearing search or selecting a different genre.`
              : 'Try selecting "All Fall 2026" or clearing genre filters.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedGenre('all');
              setActiveTab('all');
            }}
            className="px-4 py-2 rounded-xl bg-[#7567C7] text-white text-xs font-bold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
