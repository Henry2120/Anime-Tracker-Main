import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  LogOut,
  ExternalLink,
  Flame,
  Tv,
  ChevronDown,
  Filter,
  ArrowUpDown,
  Sun,
  Calendar,
  CalendarDays,
  PlayCircle,
} from 'lucide-react';
import { Anime, JikanApiResponse, MalUser, MalListItem, SeasonalAnimeItem } from './types';
import { AnimeCard } from './components/AnimeCard';
import { MalAnimeCard } from './components/MalAnimeCard';
import { SeasonalAnimeCard } from './components/SeasonalAnimeCard';
import { SeasonTable } from './components/SeasonTable';
import { SeasonDiagnosticsPanel } from './components/SeasonDiagnosticsPanel';
import {
  fetchJikanSeasonCatalogue,
  fetchJikanAnimeInfo,
  JikanSeasonalAnime,
} from './utils/seasonUtils';

export default function App() {
  // Navigation tab state ('top' | 'mal' | 'season')
  const [activeTab, setActiveTab] = useState<'top' | 'mal' | 'season'>('top');

  // Jikan State
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);

  // MAL Auth & List State
  const [malUser, setMalUser] = useState<MalUser | null>(null);
  const [malList, setMalList] = useState<MalListItem[]>([]);
  const [malLoading, setMalLoading] = useState<boolean>(false);
  const [malError, setMalError] = useState<string | null>(null);
  const [malConfigured, setMalConfigured] = useState<boolean>(true);
  const [malFilterStatus, setMalFilterStatus] = useState<string>('all');
  const [malSortOption, setMalSortOption] = useState<string>('title_asc');

  // Seasonal Catalogue State (for general seasonal catalogue browsing)
  const [seasonalList, setSeasonalList] = useState<SeasonalAnimeItem[]>([]);
  const [seasonalLoading, setSeasonalLoading] = useState<boolean>(false);
  const [seasonalError, setSeasonalError] = useState<string | null>(null);

  // Jikan Summer 2026 Seasonal State (Authoritative source of truth for MY SEASON)
  const [jikanSummer2026List, setJikanSummer2026List] = useState<JikanSeasonalAnime[]>([]);
  const [jikanSeasonLoading, setJikanSeasonLoading] = useState<boolean>(false);
  const [fallbackSummer2026Ids, setFallbackSummer2026Ids] = useState<Set<number>>(new Set());

  // Local user notes stored in localStorage
  const [customUserNotes, setCustomUserNotes] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem('season_custom_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleSaveCustomNote = (animeId: number, note: string) => {
    setCustomUserNotes((prev) => {
      const updated = { ...prev, [animeId]: note };
      try {
        localStorage.setItem('season_custom_notes', JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  };

  // User MAL Map for quick lookup
  const userMalMap = useMemo(() => {
    const map = new Map<number, MalListItem>();
    for (const item of malList) {
      if (item.node?.id) {
        map.set(item.node.id, item);
      }
    }
    return map;
  }, [malList]);

  // Primary Set of MAL IDs from Jikan Summer 2026 seasonal catalogue
  const jikanSummer2026Ids = useMemo(() => {
    const ids = new Set<number>();
    for (const item of jikanSummer2026List) {
      if (item?.mal_id) {
        ids.add(item.mal_id);
      }
    }
    return ids;
  }, [jikanSummer2026List]);

  // Combined Set of Summer 2026 IDs: Jikan seasonal catalogue + individual Jikan fallback
  const allSummer2026Ids = useMemo(() => {
    const combined = new Set<number>(jikanSummer2026Ids);
    for (const id of fallbackSummer2026Ids) {
      combined.add(id);
    }
    return combined;
  }, [jikanSummer2026Ids, fallbackSummer2026Ids]);

  // Build Currently Watching items for MY SEASON:
  // Strictly: Jikan Summer 2026 anime INTERSECT My MAL anime with status "watching"
  const currentlyWatchingItems = useMemo(() => {
    const items: Array<{
      node: any;
      list_status?: any;
    }> = [];
    const seenIds = new Set<number>();

    for (const item of malList) {
      if (!item?.node?.id) continue;
      // Accept strictly status === 'watching'
      if (item.list_status?.status !== 'watching') continue;

      // Check if MAL ID belongs to the Summer 2026 Jikan set
      if (!allSummer2026Ids.has(item.node.id)) continue;

      if (!seenIds.has(item.node.id)) {
        seenIds.add(item.node.id);
        items.push({
          node: item.node,
          list_status: item.list_status || { status: 'watching', score: 0, num_episodes_watched: 0 },
        });
      }
    }

    return items;
  }, [malList, allSummer2026Ids]);

  // Fetch Jikan Summer 2026 seasonal catalogue
  const loadJikanSeasonalCatalogue = async () => {
    setJikanSeasonLoading(true);
    try {
      const data = await fetchJikanSeasonCatalogue(2026, 'summer');
      setJikanSummer2026List(data);
    } catch (err) {
      console.error('Error fetching Jikan Summer 2026 seasonal catalogue:', err);
    } finally {
      setJikanSeasonLoading(false);
    }
  };

  // Targeted Fallback: For watching anime not found in the primary Jikan seasonal set,
  // query individual Jikan metadata (/v4/anime/{mal_id})
  useEffect(() => {
    if (!malList || malList.length === 0) return;
    if (jikanSeasonLoading) return;

    const watchingMissing = malList.filter((item) => {
      if (item.list_status?.status !== 'watching') return false;
      const animeId = item.node?.id;
      if (!animeId) return false;
      if (jikanSummer2026Ids.has(animeId)) return false;
      if (fallbackSummer2026Ids.has(animeId)) return false;
      return true;
    });

    if (watchingMissing.length === 0) return;

    let isMounted = true;
    const runFallbackLookups = async () => {
      for (const item of watchingMissing) {
        if (!isMounted) break;
        const animeId = item.node.id;
        const info = await fetchJikanAnimeInfo(animeId);
        if (info && info.is_summer_2026 && isMounted) {
          setFallbackSummer2026Ids((prev) => {
            const next = new Set(prev);
            next.add(animeId);
            return next;
          });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    };

    runFallbackLookups();
    return () => {
      isMounted = false;
    };
  }, [malList, jikanSummer2026Ids, fallbackSummer2026Ids, jikanSeasonLoading]);

  // Diagnostic logging specifically for MAL ID 61126
  useEffect(() => {
    const item61126 = malList.find((i) => i?.node?.id === 61126);
    if (item61126) {
      console.log('[MY SEASON 61126]', {
        inMalList: true,
        malStatus: item61126.list_status?.status,
        inJikanSeason: jikanSummer2026Ids.has(61126),
        fallbackJikanYear: 2026,
        fallbackJikanSeason: 'summer',
        finalIncluded: currentlyWatchingItems.some((i) => i?.node?.id === 61126),
      });
    }
  }, [malList, jikanSummer2026Ids, fallbackSummer2026Ids, currentlyWatchingItems]);

  // Log MY SEASON render input
  useEffect(() => {
    if (activeTab === 'season') {
      console.log('[MY SEASON RENDER INPUT]', {
        count: currentlyWatchingItems.length,
        uniqueIdCount: new Set(currentlyWatchingItems.map((item) => item.node?.id)).size,
        ids: currentlyWatchingItems.map((item) => item.node?.id),
        titles: currentlyWatchingItems.map((item) => item.node?.title),
      });
    }
  }, [activeTab, currentlyWatchingItems]);

  // Check MAL Auth Status and load catalogues on Mount
  useEffect(() => {
    checkMalConfig();
    checkMalAuth();
    loadJikanSeasonalCatalogue();
    fetchSeasonalList(2026, 'summer');

    // Listen for OAuth success message from popup window
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MAL_OAUTH_SUCCESS') {
        checkMalAuth();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fetch seasonal list whenever season tab is selected if not already populated
  useEffect(() => {
    if (activeTab === 'season' && seasonalList.length === 0 && !seasonalLoading) {
      fetchSeasonalList(2026, 'summer');
    }
  }, [activeTab, seasonalList.length, seasonalLoading]);

  const checkMalConfig = async () => {
    try {
      const res = await fetch('/api/mal/config');
      if (res.ok) {
        const data = await res.json();
        setMalConfigured(data.configured);
      }
    } catch {
      // Ignore
    }
  };

  const checkMalAuth = async () => {
    try {
      const res = await fetch('/api/mal/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setMalUser(data.user);
          fetchMalList();
        } else {
          setMalUser(null);
          setMalList([]);
        }
      }
    } catch (err) {
      console.error('Error checking MAL authentication:', err);
    }
  };

  const fetchMalList = async () => {
    setMalLoading(true);
    setMalError(null);
    try {
      const res = await fetch('/api/mal/animelist');
      if (!res.ok) {
        if (res.status === 401) {
          setMalUser(null);
          setMalList([]);
          throw new Error('MyAnimeList session expired. Please connect again.');
        }
        throw new Error(`Failed to fetch MyAnimeList (${res.status})`);
      }
      const data = await res.json();
      setMalList(data.data || []);
    } catch (err: any) {
      console.error('Error fetching MAL anime list:', err);
      setMalError(err.message || 'Failed to load MyAnimeList');
    } finally {
      setMalLoading(false);
    }
  };

  // Fetch Seasonal Anime List from MAL (Summer 2026)
  const fetchSeasonalList = async (year = 2026, season = 'summer') => {
    setSeasonalLoading(true);
    setSeasonalError(null);
    try {
      const res = await fetch(`/api/mal/season/${year}/${season}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch seasonal anime (${res.status})`);
      }
      const data = await res.json();
      setSeasonalList(data.data || []);
    } catch (err: any) {
      console.error('Error fetching seasonal list:', err);
      setSeasonalError(err.message || 'Failed to load seasonal anime list.');
    } finally {
      setSeasonalLoading(false);
    }
  };

  const handleConnectMal = () => {
    if (!malConfigured) {
      setMalError('MAL_CLIENT_ID is not configured in environment variables.');
      return;
    }
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      '/api/mal/login',
      'mal_oauth',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );

    // Fallback polling if popup closed
    if (popup) {
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          checkMalAuth();
        }
      }, 1000);
    }
  };

  const handleDisconnectMal = async () => {
    try {
      await fetch('/api/mal/logout', { method: 'POST' });
    } catch {
      // Ignore
    } finally {
      setMalUser(null);
      setMalList([]);
    }
  };

  // Jikan Fetch Function
  const fetchTopAnime = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://api.jikan.moe/v4/top/anime');

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error(`Failed to load anime data (${response.status})`);
      }

      const json: JikanApiResponse = await response.json();

      if (!json.data || !Array.isArray(json.data)) {
        throw new Error('Invalid response received from the anime service.');
      }

      // Display the first 10 anime
      const topTen = json.data.slice(0, 10);
      setAnimeList(topTen);
      setHasLoaded(true);
    } catch (err: any) {
      console.error('Error fetching top anime:', err);
      setError(err.message || 'An unexpected error occurred while fetching anime.');
    } finally {
      setLoading(false);
    }
  };

  // Filtered and sorted MAL list
  const filteredMalList = malList
    .filter((item) => {
      if (malFilterStatus === 'all') return true;
      return item.list_status?.status === malFilterStatus;
    })
    .sort((a, b) => {
      if (malSortOption === 'title_asc') {
        const titleA = (a.node?.title || '').toLowerCase();
        const titleB = (b.node?.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
      }
      if (malSortOption === 'title_desc') {
        const titleA = (a.node?.title || '').toLowerCase();
        const titleB = (b.node?.title || '').toLowerCase();
        return titleB.localeCompare(titleA);
      }
      if (malSortOption === 'score_desc') {
        const scoreA = typeof a.list_status?.score === 'number' && !isNaN(a.list_status.score) ? a.list_status.score : 0;
        const scoreB = typeof b.list_status?.score === 'number' && !isNaN(b.list_status.score) ? b.list_status.score : 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return (a.node?.title || '').localeCompare(b.node?.title || '');
      }
      if (malSortOption === 'score_asc') {
        const scoreA = typeof a.list_status?.score === 'number' && !isNaN(a.list_status.score) ? a.list_status.score : 0;
        const scoreB = typeof b.list_status?.score === 'number' && !isNaN(b.list_status.score) ? b.list_status.score : 0;
        if (scoreA !== scoreB) {
          return scoreA - scoreB;
        }
        return (a.node?.title || '').localeCompare(b.node?.title || '');
      }
      return 0;
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50 text-slate-800 font-sans antialiased p-4 sm:p-8 flex flex-col justify-between">
      <div className="max-w-7xl w-full mx-auto">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-6 border-b border-indigo-100/60 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center text-white font-black italic shadow-xs">
                A
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-indigo-900">
                ANITRACK
              </h1>
            </div>
            <p className="text-slate-500 font-medium text-sm sm:text-base">
              Discover top anime and sync your MyAnimeList
            </p>
          </div>

          {/* Top Right Action & Auth Indicator */}
          <div className="flex items-center gap-3">
            {malUser ? (
              <div className="flex items-center gap-3 bg-white border-2 border-indigo-100 rounded-2xl p-1.5 pr-4 shadow-sm">
                {malUser.picture ? (
                  <img
                    src={malUser.picture}
                    alt={malUser.name}
                    className="w-8 h-8 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-xs">
                    {malUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left">
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> Connected
                  </div>
                  <div className="text-xs font-black text-slate-900 leading-none">
                    {malUser.name}
                  </div>
                </div>
                <button
                  onClick={handleDisconnectMal}
                  title="Disconnect MyAnimeList"
                  className="ml-2 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectMal}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold py-3 px-5 rounded-2xl border-2 border-indigo-200/80 transition-all flex items-center gap-2 text-xs sm:text-sm cursor-pointer"
              >
                <ExternalLink className="h-4 w-4 text-indigo-600" />
                <span>Connect MyAnimeList</span>
              </button>
            )}

            {/* Load Anime Button for Jikan */}
            <button
              id="load-anime-btn"
              onClick={fetchTopAnime}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-7 rounded-2xl shadow-[0_4px_0_0_rgba(49,46,129,1)] active:translate-y-[2px] active:shadow-[0_2px_0_0_rgba(49,46,129,1)] transition-all flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none cursor-pointer tracking-wide text-xs sm:text-sm shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>LOADING</span>
                </>
              ) : hasLoaded ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>RELOAD ANIME</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-yellow-300 fill-yellow-300" />
                  <span>LOAD ANIME</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 mb-8 border-b-2 border-indigo-100 pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('top')}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs sm:text-sm tracking-wide transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'top'
                ? 'bg-indigo-900 text-white shadow-md'
                : 'bg-white text-slate-600 border border-indigo-100 hover:bg-indigo-50'
            }`}
          >
            <Flame className="h-4 w-4" />
            <span>TOP 10 ANIME</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('mal');
              if (malUser && malList.length === 0 && !malLoading) {
                fetchMalList();
              }
            }}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs sm:text-sm tracking-wide transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'mal'
                ? 'bg-indigo-900 text-white shadow-md'
                : 'bg-white text-slate-600 border border-indigo-100 hover:bg-indigo-50'
            }`}
          >
            <Tv className="h-4 w-4" />
            <span>MY MAL LIST</span>
            {malUser && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-pink-500 text-white text-[10px] font-black">
                {malList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('season');
              if (seasonalList.length === 0 && !seasonalLoading) {
                fetchSeasonalList(2026, 'summer');
              }
            }}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs sm:text-sm tracking-wide transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'season'
                ? 'bg-indigo-900 text-white shadow-md'
                : 'bg-white text-slate-600 border border-indigo-100 hover:bg-indigo-50'
            }`}
          >
            <Sun className="h-4 w-4 text-amber-500" />
            <span>MY SEASON</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
              Summer 2026
            </span>
          </button>
        </div>

        {/* TAB 1: TOP 10 ANIME (JIKAN) */}
        {activeTab === 'top' && (
          <div>
            {/* Error Alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-xl mx-auto mb-10 p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-900 flex items-start gap-3 shadow-md"
              >
                <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-bold mb-1">Failed to fetch anime</p>
                  <p className="text-rose-600">{error}</p>
                  <button
                    onClick={fetchTopAnime}
                    className="mt-3 text-xs font-bold underline text-rose-800 hover:text-rose-950 cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              </motion.div>
            )}

            {/* Loading Skeleton Grid */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-3xl p-3 shadow-xl border-2 border-indigo-100 flex flex-col animate-pulse"
                  >
                    <div className="w-full aspect-[3/4] bg-indigo-100 rounded-2xl mb-4" />
                    <div className="h-4 bg-indigo-100 rounded-md w-5/6 mb-2" />
                    <div className="h-3 bg-indigo-50 rounded-md w-1/2 mb-4" />
                    <div className="mt-auto pt-3 border-t border-indigo-50 flex justify-between">
                      <div className="h-3 bg-indigo-100 rounded-md w-1/3" />
                      <div className="h-3 bg-indigo-100 rounded-md w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty / Initial State */}
            {!loading && !hasLoaded && !error && (
              <div className="text-center py-20 px-6 max-w-md mx-auto bg-white rounded-3xl border-2 border-indigo-100 shadow-xl my-8">
                <div className="w-14 h-14 rounded-2xl bg-pink-100 border-2 border-pink-200 flex items-center justify-center mx-auto mb-4 text-pink-600 shadow-xs">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-black text-indigo-900 mb-2">Ready to Discover Anime</h3>
                <p className="text-slate-500 text-sm font-medium mb-6 leading-relaxed">
                  Click the "LOAD ANIME" button above to fetch and view the top 10 ranked anime series.
                </p>
              </div>
            )}

            {/* Anime Cards Grid */}
            {!loading && hasLoaded && animeList.length > 0 && (
              <AnimatePresence>
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b-2 border-indigo-100 pb-4">
                    <h2 className="text-lg font-black text-indigo-900 flex items-center gap-2.5">
                      TOP 10 RANKED ANIME
                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                        {animeList.length} ITEMS
                      </span>
                    </h2>
                    <span className="text-xs font-bold text-slate-400">JIKAN V4 API</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                    {animeList.map((anime, index) => (
                      <AnimeCard key={anime.mal_id} anime={anime} rank={index + 1} />
                    ))}
                  </div>
                </div>
              </AnimatePresence>
            )}
          </div>
        )}

        {/* TAB 2: MY MAL LIST */}
        {activeTab === 'mal' && (
          <div>
            {!malUser ? (
              <div className="text-center py-16 px-6 max-w-lg mx-auto bg-white rounded-3xl border-2 border-indigo-100 shadow-xl my-6">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mx-auto mb-5 text-indigo-600 shadow-xs">
                  <Tv className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-black text-indigo-900 mb-2">Connect Your MyAnimeList</h3>
                <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
                  Authenticate with MyAnimeList to view your watched anime list, episode progress, scores, and watch status.
                </p>

                <button
                  onClick={handleConnectMal}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-4 px-8 rounded-2xl shadow-[0_4px_0_0_rgba(49,46,129,1)] active:translate-y-[2px] active:shadow-[0_2px_0_0_rgba(49,46,129,1)] transition-all inline-flex items-center gap-2.5 cursor-pointer text-base"
                >
                  <ExternalLink className="h-5 w-5" />
                  <span>Connect MyAnimeList Account</span>
                </button>

                {!malConfigured && (
                  <p className="mt-4 text-xs font-bold text-rose-500">
                    Note: <code>MAL_CLIENT_ID</code> is required in environment variables/secrets.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* User Info Bar & Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white border-2 border-indigo-100 rounded-3xl p-5 shadow-lg gap-4">
                  <div className="flex items-center gap-4">
                    {malUser.picture ? (
                      <img
                        src={malUser.picture}
                        alt={malUser.name}
                        className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg">
                        {malUser.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        {malUser.name}'s Anime List
                      </h3>
                      <p className="text-xs font-semibold text-slate-400">
                        {malList.length} anime series retrieved from MyAnimeList
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={fetchMalList}
                      disabled={malLoading}
                      className="p-2.5 rounded-xl border border-indigo-100 hover:bg-indigo-50 text-indigo-700 transition-colors cursor-pointer"
                      title="Refresh List"
                    >
                      <RefreshCw className={`h-4 w-4 ${malLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={handleDisconnectMal}
                      className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>

                {/* Status & Sort Filter Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Status Filter Dropdown */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="mal-status-filter" className="text-xs font-black text-indigo-900 tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                      <Filter className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Status:</span>
                    </label>
                    <div className="relative inline-block w-48 sm:w-56">
                      <select
                        id="mal-status-filter"
                        value={malFilterStatus}
                        onChange={(e) => setMalFilterStatus(e.target.value)}
                        className="w-full appearance-none bg-white border-2 border-indigo-100 text-slate-800 text-xs sm:text-sm font-extrabold rounded-2xl py-2.5 pl-4 pr-10 shadow-xs hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="watching">Watching</option>
                        <option value="completed">Completed</option>
                        <option value="plan_to_watch">Plan to Watch</option>
                        <option value="on_hold">On Hold</option>
                        <option value="dropped">Dropped</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-indigo-600">
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-3">
                    <label htmlFor="mal-sort-option" className="text-xs font-black text-indigo-900 tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                      <ArrowUpDown className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Sort:</span>
                    </label>
                    <div className="relative inline-block w-52 sm:w-60">
                      <select
                        id="mal-sort-option"
                        value={malSortOption}
                        onChange={(e) => setMalSortOption(e.target.value)}
                        className="w-full appearance-none bg-white border-2 border-indigo-100 text-slate-800 text-xs sm:text-sm font-extrabold rounded-2xl py-2.5 pl-4 pr-10 shadow-xs hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        <option value="title_asc">A to Z</option>
                        <option value="title_desc">Z to A</option>
                        <option value="score_desc">Score (Highest to Lowest)</option>
                        <option value="score_asc">Score (Lowest to Highest)</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-indigo-600">
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {malError && (
                  <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-900 text-sm font-bold flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
                    <span>{malError}</span>
                  </div>
                )}

                {/* Loading State */}
                {malLoading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="bg-white rounded-3xl p-3 shadow-xl border-2 border-indigo-100 flex flex-col animate-pulse"
                      >
                        <div className="w-full aspect-[3/4] bg-indigo-100 rounded-2xl mb-4" />
                        <div className="h-4 bg-indigo-100 rounded-md w-5/6 mb-2" />
                        <div className="h-3 bg-indigo-50 rounded-md w-1/2 mb-4" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Anime Cards Grid */}
                {!malLoading && filteredMalList.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                    {filteredMalList.map((item, index) => (
                      <MalAnimeCard key={item.node.id} item={item} index={index} />
                    ))}
                  </div>
                )}

                {/* Empty Filter State */}
                {!malLoading && filteredMalList.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-3xl border-2 border-indigo-100 shadow-md">
                    <p className="text-slate-500 font-bold text-sm">
                      No anime found in status "{malFilterStatus.replace(/_/g, ' ')}".
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MY SEASON (SUMMER 2026) */}
        {activeTab === 'season' && (
          <div className="space-y-8">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-500 via-indigo-600 to-pink-600 text-white p-6 sm:p-8 rounded-3xl shadow-xl">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sun className="h-6 w-6 text-yellow-300 fill-yellow-300 animate-pulse" />
                  <span className="text-xs font-black tracking-widest uppercase bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                    Focused Seasonal Dashboard
                  </span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                  MY SEASON — Summer 2026
                </h2>
                <p className="text-white/80 font-medium text-xs sm:text-sm mt-1">
                  A compact dashboard of anime you are currently watching during Summer 2026.
                </p>
                {malUser && (
                  <div className="mt-3 inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold text-white border border-white/20">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Authenticated MAL account: <span className="underline font-black">{malUser.name}</span></span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!malUser && (
                  <button
                    onClick={handleConnectMal}
                    className="bg-white text-indigo-900 hover:bg-slate-100 font-extrabold py-2.5 px-4 rounded-2xl shadow-md transition-all flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                    <span>Connect MAL</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    if (malUser) fetchMalList();
                    loadJikanSeasonalCatalogue();
                    fetchSeasonalList(2026, 'summer');
                  }}
                  disabled={seasonalLoading || malLoading || jikanSeasonLoading}
                  className="bg-white/20 hover:bg-white/30 text-white font-bold py-2.5 px-4 rounded-2xl backdrop-blur-md transition-all flex items-center gap-2 text-xs cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${seasonalLoading || malLoading || jikanSeasonLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh Data</span>
                </button>
              </div>
            </div>

            {/* Notice if MAL is not connected */}
            {!malUser && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 text-amber-900 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-extrabold text-sm text-amber-900">Connect MyAnimeList to view your live watching progress</p>
                    <p className="text-amber-700 font-medium mt-0.5">
                      Log in to sync your MAL scores, episode progress, and personal notes directly into these seasonal tables.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleConnectMal}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  Connect MAL Now
                </button>
              </div>
            )}

            {/* CURRENTLY WATCHING */}
            <SeasonTable
              title="Currently Watching"
              subtitle="Anime from your MyAnimeList account that are airing in Summer 2026."
              icon={<PlayCircle className="h-6 w-6 text-emerald-400" />}
              items={currentlyWatchingItems}
              badgeText="Watching"
              badgeBg="bg-emerald-100"
              badgeTextClass="text-emerald-800"
              customUserNotes={customUserNotes}
              onSaveCustomNote={handleSaveCustomNote}
            />

            {/* TEMPORARY MY SEASON DIAGNOSTICS PANEL */}
            <SeasonDiagnosticsPanel
              malList={malList}
              currentlyWatchingItems={currentlyWatchingItems}
              jikanSummer2026Ids={jikanSummer2026Ids}
              fallbackSummer2026Ids={fallbackSummer2026Ids}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-12 max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between border-t-2 border-indigo-100/80 pt-6 text-xs font-bold text-slate-400 gap-4">
        <div className="flex gap-4 text-indigo-300 font-extrabold tracking-wider">
          <span>TOP ANIME</span>
          <span>•</span>
          <span>MYANIMELIST OAUTH</span>
        </div>
        <div className="tracking-wider">DATA PROVIDED BY JIKAN V4 & MYANIMELIST V2 API</div>
      </footer>
    </div>
  );
}
