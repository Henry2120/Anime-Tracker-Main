import { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  RefreshCw,
  UserCheck,
  LogOut,
  ExternalLink,
  Tv,
  ChevronDown,
  Filter,
  ArrowUpDown,
  Sun,
  CalendarDays,
  PlayCircle,
  BarChart3,
  CheckCircle2,
  Sparkles,
  Info,
  Home,
  Trophy,
  User,
  Search,
  X,
  BookOpen,
  FileSpreadsheet,
} from 'lucide-react';
import { MalUser, MalListItem, SeasonalAnimeItem, MalUpdateStatusPayload, MalAnimeNode } from './types';
import { AppTheme } from './types/theme';
import { MalAnimeCard } from './components/MalAnimeCard';
import { MalCatalogueSearchResults } from './components/MalCatalogueSearchResults';
import { SeasonTable } from './components/SeasonTable';
import { ReleaseCalendar } from './components/ReleaseCalendar';
import { StatusDashboard } from './components/StatusDashboard';
import { GeminiInsightsView } from './components/GeminiInsightsView';
import { SeasonReview } from './components/SeasonReview';
import { WelcomePage } from './components/WelcomePage';
import { AboutModal } from './components/AboutModal';
import { ExcelExportModal } from './components/ExcelExportModal';
import { EditMalEntryModal, EditableAnimeData } from './components/EditMalEntryModal';
import { AnimeDetailModal, AnimeDetailData } from './components/AnimeDetailModal';
import { AppearanceSelector } from './components/AppearanceSelector';
import { SakuraPetalsCanvas } from './components/SakuraPetalsCanvas';
import { APP_VERSION_INFO } from './config/version';
import {
  fetchJikanSeasonCatalogue,
  fetchJikanAnimeInfo,
  fetchCalendarSeasonReleases,
  isAnimeSummer2026,
  isAnimeSpring2026,
  isAnimeInSeason,
  isCompletedDuringSummer2026,
  isCompletedDuringSpring2026,
  getEarliestFirstEpisodeAiringDate,
  getAnimeForSelectedSeason,
  JikanSeasonalAnime,
} from './utils/seasonUtils';

export default function App() {
  // Navigation tab state ('home' | 'season' | 'mal' | 'calendar' | 'status' | 'gemini' | 'review')
  const [activeTab, setActiveTab] = useState<'home' | 'season' | 'mal' | 'calendar' | 'status' | 'gemini' | 'review'>('season');
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isExcelExportModalOpen, setIsExcelExportModalOpen] = useState(false);

  // Appearance / Theme State ('light' | 'dark' | 'sakura')
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('aniverse_appearance') || localStorage.getItem('aniverse_theme');
      if (saved === 'dark' || saved === 'sakura' || saved === 'light') {
        return saved as AppTheme;
      }
    } catch {
      // Storage access blocked or unavailable
    }
    return 'light';
  });

  // Insights dropdown navigation state
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const insightsMenuRef = useRef<HTMLDivElement>(null);

  // Profile dropdown menu state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (insightsMenuRef.current && !insightsMenuRef.current.contains(event.target as Node)) {
        setIsInsightsOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInsightsOpen(false);
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('aniverse_appearance', newTheme);
      localStorage.setItem('aniverse_theme', newTheme);
    } catch {
      // Ignore storage errors
    }
  };

  // MAL Auth & List State
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('mal_session_token') || null;
    } catch {
      return null;
    }
  });
  const [malUser, setMalUser] = useState<MalUser | null>(null);
  const [malList, setMalList] = useState<MalListItem[]>([]);
  const [malLoading, setMalLoading] = useState<boolean>(false);
  const [malError, setMalError] = useState<string | null>(null);
  const [malConfigured, setMalConfigured] = useState<boolean>(true);
  const [malFilterStatus, setMalFilterStatus] = useState<string>('all');
  const [malSortOption, setMalSortOption] = useState<string>('title_asc');
  const [malSearchQuery, setMalSearchQuery] = useState<string>('');
  const [malCatalogueResults, setMalCatalogueResults] = useState<Array<{ node: MalAnimeNode }>>([]);
  const [malCatalogueLoading, setMalCatalogueLoading] = useState<boolean>(false);
  const [addingAnimeId, setAddingAnimeId] = useState<number | null>(null);
  const catalogueSearchGenRef = useRef<number>(0);

  // Race-condition safety refs for MAL Auth
  const authRequestGenRef = useRef<number>(0);
  const oauthSuccessReceivedRef = useRef<boolean>(false);
  const popupTimerRef = useRef<any>(null);

  const getAuthHeaders = (token?: string | null): Record<string, string> => {
    const t = token !== undefined ? token : sessionToken;
    if (t) {
      return {
        Authorization: `Bearer ${t}`,
        'x-mal-session': t,
      };
    }
    return {};
  };

  // Seasonal Catalogue State (for general seasonal catalogue browsing)
  const [seasonalList, setSeasonalList] = useState<SeasonalAnimeItem[]>([]);
  const [seasonalLoading, setSeasonalLoading] = useState<boolean>(false);
  const [seasonalError, setSeasonalError] = useState<string | null>(null);

  // Selected Season state for MY SEASON view ('spring' | 'summer', default 'summer')
  const [selectedSeason, setSelectedSeason] = useState<'spring' | 'summer'>('summer');

  // Jikan Summer 2026 Seasonal State (Authoritative source of truth for MY SEASON)
  const [jikanSummer2026List, setJikanSummer2026List] = useState<JikanSeasonalAnime[]>([]);
  const [jikanSeasonLoading, setJikanSeasonLoading] = useState<boolean>(false);
  const [fallbackSummer2026Ids, setFallbackSummer2026Ids] = useState<Set<number>>(new Set());

  // Jikan Spring 2026 Seasonal State
  const [jikanSpring2026List, setJikanSpring2026List] = useState<JikanSeasonalAnime[]>([]);
  const [jikanSpringLoading, setJikanSpringLoading] = useState<boolean>(false);
  const [fallbackSpring2026Ids, setFallbackSpring2026Ids] = useState<Set<number>>(new Set());

  // Release Calendar Summer 2026 Fallback State
  const [calendarSummer2026Ids, setCalendarSummer2026Ids] = useState<Set<number>>(new Set());

  // Local user notes stored in localStorage
  const [customUserNotes, setCustomUserNotes] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem('season_custom_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Modal and toast state for MAL Two-Way Management
  const [editingMalAnime, setEditingMalAnime] = useState<EditableAnimeData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedDetailAnime, setSelectedDetailAnime] = useState<AnimeDetailData | null>(null);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showSyncToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setSyncToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setSyncToast(null);
    }, 4000);
  };

  const handleSaveCustomNote = async (animeId: number, note: string) => {
    const trimmed = note.trim();
    // 1. Optimistic local update
    setCustomUserNotes((prev) => {
      const updated = { ...prev, [animeId]: trimmed };
      try {
        localStorage.setItem('season_custom_notes', JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });

    // 2. Sync to MyAnimeList if connected
    if (malUser) {
      showSyncToast('Saving note to MyAnimeList...');
      try {
        const res = await fetch(`/api/mal/anime/${animeId}/status`, {
          method: 'PATCH',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ comments: trimmed }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showSyncToast('✓ Saved note to MyAnimeList', 'success');
          // Update in-memory malList
          setMalList((prev) =>
            prev.map((item) =>
              item.node.id === animeId
                ? {
                    ...item,
                    list_status: {
                      ...item.list_status,
                      comments: trimmed,
                      updated_at: new Date().toISOString(),
                    },
                  }
                : item
            )
          );
        } else {
          showSyncToast(data.error || 'Failed to save note to MyAnimeList', 'error');
        }
      } catch (err: any) {
        console.error('Failed to sync note to MAL:', err);
        showSyncToast('Failed to save note to MyAnimeList', 'error');
      }
    }
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

  // Open the Anime Detail modal
  const handleOpenDetailModal = (target: any) => {
    if (!target) return;
    const rawId = target.id || target.malId || target.mal_id || target.node?.id;
    const animeId = rawId ? Number(rawId) : undefined;
    const existingMalEntry = animeId ? userMalMap.get(animeId) : undefined;

    const title = target.title || target.node?.title || existingMalEntry?.node?.title || 'Anime Details';
    const titleEnglish = target.titleEnglish || target.title_english || target.node?.alternative_titles?.en || existingMalEntry?.node?.alternative_titles?.en || null;
    const titleNative = target.titleNative || target.title_japanese || target.node?.alternative_titles?.ja || existingMalEntry?.node?.alternative_titles?.ja || null;
    const imageUrl =
      target.imageUrl ||
      target.images?.jpg?.large_image_url ||
      target.images?.webp?.large_image_url ||
      target.node?.main_picture?.large ||
      target.node?.main_picture?.medium ||
      existingMalEntry?.node?.main_picture?.large ||
      existingMalEntry?.node?.main_picture?.medium ||
      null;

    const detailData: AnimeDetailData = {
      id: animeId,
      malId: animeId,
      title,
      titleEnglish,
      titleNative,
      imageUrl,
      score: target.score || target.node?.mean || existingMalEntry?.node?.mean || null,
      userScore: typeof target.userScore === 'number' ? target.userScore : existingMalEntry?.list_status?.score,
      episodes: target.episodes || target.totalEpisodes || target.node?.num_episodes || existingMalEntry?.node?.num_episodes || null,
      episodesWatched: typeof target.episodesWatched === 'number' ? target.episodesWatched : existingMalEntry?.list_status?.num_episodes_watched,
      status: target.status || existingMalEntry?.list_status?.status || target.node?.status,
      mediaType: target.mediaType || target.media_type || target.type || target.node?.media_type || existingMalEntry?.node?.media_type,
      startDate: target.startDate || target.aired?.from || existingMalEntry?.list_status?.start_date,
      finishDate: target.finishDate || target.aired?.to || existingMalEntry?.list_status?.finish_date,
      synopsis: target.synopsis || target.node?.synopsis,
      comment: target.comment || existingMalEntry?.list_status?.comments || (animeId ? customUserNotes[animeId] : ''),
      genres: target.genres || target.node?.genres,
      season: target.season || (target.node?.start_season ? { season: target.node.start_season.season, year: target.node.start_season.year } : null),
      studio: target.studio || (Array.isArray(target.studios) ? target.studios.map((s: any) => s.name).join(', ') : null),
      source: target.source || target.node?.source,
      broadcast: target.broadcast || target.node?.broadcast,
    };

    setSelectedDetailAnime(detailData);
  };

  // Open the MAL Edit modal for any anime item (from List, Season, Calendar, or Detail modal)
  const handleOpenEditModal = (target: any) => {
    if (!target) return;

    const rawId = target.id || target.malId || target.mal_id || target.node?.id;
    if (!rawId) return;

    const animeId = Number(rawId);
    const existingMalEntry = userMalMap.get(animeId);

    const title = target.title || target.node?.title || existingMalEntry?.node?.title || 'Anime Details';
    const titleEnglish = target.titleEnglish || target.title_english || target.node?.alternative_titles?.en || existingMalEntry?.node?.alternative_titles?.en || null;
    const titleNative = target.titleNative || target.title_japanese || target.node?.alternative_titles?.ja || existingMalEntry?.node?.alternative_titles?.ja || null;

    const imageUrl =
      target.imageUrl ||
      target.images?.jpg?.large_image_url ||
      target.images?.webp?.large_image_url ||
      target.node?.main_picture?.large ||
      target.node?.main_picture?.medium ||
      existingMalEntry?.node?.main_picture?.large ||
      existingMalEntry?.node?.main_picture?.medium ||
      null;

    const totalEpisodes =
      target.episodes ||
      target.totalEpisodes ||
      target.node?.num_episodes ||
      existingMalEntry?.node?.num_episodes ||
      null;

    const mediaType =
      target.mediaType ||
      target.media_type ||
      target.type ||
      target.node?.media_type ||
      existingMalEntry?.node?.media_type ||
      null;

    const meanScore =
      target.meanScore ||
      target.score ||
      target.node?.mean ||
      existingMalEntry?.node?.mean ||
      null;

    // Determine current MAL status if in user's list
    const currentStatus = existingMalEntry?.list_status || target.list_status || target.currentStatus || (target.userScore !== undefined || target.episodesWatched !== undefined ? {
      status: target.status || 'plan_to_watch',
      score: target.userScore || 0,
      num_episodes_watched: target.episodesWatched || 0,
      comments: target.comment || customUserNotes[animeId] || '',
    } : null);

    const editableData: EditableAnimeData = {
      id: animeId,
      title,
      titleEnglish,
      titleNative,
      imageUrl,
      totalEpisodes,
      mediaType,
      meanScore,
      currentStatus: currentStatus ? {
        status: currentStatus.status || 'plan_to_watch',
        score: currentStatus.score || 0,
        num_episodes_watched: currentStatus.num_episodes_watched || 0,
        is_rewatching: currentStatus.is_rewatching || false,
        start_date: currentStatus.start_date || '',
        finish_date: currentStatus.finish_date || '',
        comments: currentStatus.comments || customUserNotes[animeId] || '',
        priority: currentStatus.priority || 0,
        num_times_rewatched: currentStatus.num_times_rewatched || 0,
      } : null,
    };

    setEditingMalAnime(editableData);
    setIsEditModalOpen(true);
  };

  // Real-time Save handler to update MyAnimeList entry
  const handleSaveMalStatus = async (animeId: number, payload: MalUpdateStatusPayload): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/mal/anime/${animeId}/status`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg = data.error || data.details || `Failed to update MyAnimeList (${res.status})`;
        showSyncToast(errorMsg, 'error');
        return { success: false, error: errorMsg };
      }

      // Optimistic update for immediate visual feedback
      setMalList((prev) => {
        const index = prev.findIndex((item) => item.node.id === animeId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            list_status: {
              ...updated[index].list_status,
              ...(payload.status ? { status: payload.status } : {}),
              ...(payload.score !== undefined ? { score: payload.score } : {}),
              ...(payload.num_watched_episodes !== undefined ? { num_episodes_watched: payload.num_watched_episodes } : {}),
              ...(payload.is_rewatching !== undefined ? { is_rewatching: payload.is_rewatching } : {}),
              ...(payload.start_date !== undefined ? { start_date: payload.start_date } : {}),
              ...(payload.finish_date !== undefined ? { finish_date: payload.finish_date } : {}),
              ...(payload.comments !== undefined ? { comments: payload.comments } : {}),
              updated_at: new Date().toISOString(),
            },
          };
          return updated;
        } else if (editingMalAnime) {
          // If was not in list before (e.g. added from seasonal catalogue)
          const newItem: MalListItem = {
            node: {
              id: animeId,
              title: editingMalAnime.title,
              main_picture: editingMalAnime.imageUrl ? { large: editingMalAnime.imageUrl, medium: editingMalAnime.imageUrl } : undefined,
              alternative_titles: {
                en: editingMalAnime.titleEnglish || undefined,
                ja: editingMalAnime.titleNative || undefined,
              },
              num_episodes: editingMalAnime.totalEpisodes || undefined,
              media_type: editingMalAnime.mediaType || undefined,
              mean: editingMalAnime.meanScore || undefined,
            },
            list_status: {
              status: payload.status || 'plan_to_watch',
              score: payload.score || 0,
              num_episodes_watched: payload.num_watched_episodes || 0,
              is_rewatching: payload.is_rewatching || false,
              start_date: payload.start_date || '',
              finish_date: payload.finish_date || '',
              comments: payload.comments || '',
              updated_at: new Date().toISOString(),
            },
          };
          return [newItem, ...prev];
        }
        return prev;
      });

      // Synchronize comments with local note cache
      if (payload.comments !== undefined) {
        handleSaveCustomNote(animeId, payload.comments);
      }

      showSyncToast('✓ Synced with MyAnimeList', 'success');

      // Refresh data from MAL in background
      setTimeout(() => {
        fetchMalList();
      }, 500);

      return { success: true };
    } catch (err: any) {
      console.error('Error saving MAL status:', err);
      const errorMsg = err.message || 'Failed to communicate with MyAnimeList';
      showSyncToast(errorMsg, 'error');
      return { success: false, error: errorMsg };
    }
  };

  // Delete handler to remove an entry from MAL
  const handleDeleteMalStatus = async (animeId: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/mal/anime/${animeId}/status`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `Failed to remove anime from list (${res.status})`;
        showSyncToast(errorMsg, 'error');
        return { success: false, error: errorMsg };
      }

      // Optimistic removal
      setMalList((prev) => prev.filter((item) => item.node.id !== animeId));
      showSyncToast('✓ Removed from MyAnimeList', 'success');

      setTimeout(() => {
        fetchMalList();
      }, 500);

      return { success: true };
    } catch (err: any) {
      console.error('Error deleting anime from MAL list:', err);
      const errorMsg = err.message || 'Failed to remove from MyAnimeList';
      showSyncToast(errorMsg, 'error');
      return { success: false, error: errorMsg };
    }
  };

  // Add a new anime from the MAL catalogue to the user's list (defaulting to Plan to Watch)
  const handleAddCatalogueAnime = async (node: MalAnimeNode) => {
    if (!node?.id) return;
    const animeId = node.id;
    setAddingAnimeId(animeId);

    try {
      const payload: MalUpdateStatusPayload = {
        status: 'plan_to_watch',
        score: 0,
        num_watched_episodes: 0,
      };

      const res = await fetch(`/api/mal/anime/${animeId}/status`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `Failed to add anime to MyAnimeList (${res.status})`;
        showSyncToast(errorMsg, 'error');
        return;
      }

      // Optimistic update of local malList
      const newItem: MalListItem = {
        node,
        list_status: {
          status: 'plan_to_watch',
          score: 0,
          num_episodes_watched: 0,
          is_rewatching: false,
          start_date: '',
          finish_date: '',
          comments: '',
          updated_at: new Date().toISOString(),
        },
      };

      setMalList((prev) => {
        const exists = prev.some((item) => item.node.id === animeId);
        if (exists) return prev;
        return [newItem, ...prev];
      });

      showSyncToast(`✓ Added "${node.title}" to My List (Plan to Watch)`, 'success');

      // Refresh in background
      setTimeout(() => {
        fetchMalList();
      }, 500);
    } catch (err: any) {
      console.error('Error adding catalogue anime to MAL:', err);
      showSyncToast(err.message || 'Failed to add anime to MyAnimeList', 'error');
    } finally {
      setAddingAnimeId(null);
    }
  };

  // Quick increment (+1 episode) handler
  const handleQuickIncrement = async (target: any) => {
    const rawId = target?.id || target?.malId || target?.mal_id || target?.node?.id;
    if (!rawId) return;
    const animeId = Number(rawId);

    const existingMalEntry = userMalMap.get(animeId);
    const currentWatched =
      typeof target?.list_status?.num_episodes_watched === 'number'
        ? target.list_status.num_episodes_watched
        : typeof target?.episodesWatched === 'number'
        ? target.episodesWatched
        : existingMalEntry?.list_status?.num_episodes_watched || 0;

    const totalEpisodes =
      target?.totalEpisodes ||
      target?.episodes ||
      target?.node?.num_episodes ||
      existingMalEntry?.node?.num_episodes ||
      null;

    const nextWatched = currentWatched + 1;
    const autoCompleted = totalEpisodes && nextWatched >= totalEpisodes;

    const payload: MalUpdateStatusPayload = {
      num_watched_episodes: nextWatched,
      ...(autoCompleted ? { status: 'completed' } : existingMalEntry?.list_status?.status ? {} : { status: 'watching' }),
    };

    await handleSaveMalStatus(animeId, payload);
  };

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

  // Combined Set of verified Summer 2026 IDs: Jikan seasonal catalogue + individual Jikan fallback
  // NOTE: Ongoing airing calendars are strictly excluded from season debut classification.
  const allSummer2026Ids = useMemo(() => {
    const combined = new Set<number>(jikanSummer2026Ids);
    for (const id of fallbackSummer2026Ids) {
      combined.add(id);
    }
    return combined;
  }, [jikanSummer2026Ids, fallbackSummer2026Ids]);

  // Primary Set of MAL IDs from Jikan Spring 2026 seasonal catalogue
  const jikanSpring2026Ids = useMemo(() => {
    const ids = new Set<number>();
    for (const item of jikanSpring2026List) {
      if (item?.mal_id) {
        ids.add(item.mal_id);
      }
    }
    return ids;
  }, [jikanSpring2026List]);

  // Combined Set of verified Spring 2026 IDs
  const allSpring2026Ids = useMemo(() => {
    const combined = new Set<number>(jikanSpring2026Ids);
    for (const id of fallbackSpring2026Ids) {
      combined.add(id);
    }
    return combined;
  }, [jikanSpring2026Ids, fallbackSpring2026Ids]);

  // Step 1: Currently Watching items (Summer 2026 debuts + active ongoing carryovers)
  // An anime is included in Currently Watching when:
  // 1. MAL list_status.status === 'watching'
  // AND
  // 2. Either:
  //    - It is a Summer 2026 debut anime (via MAL start_season, seasonal catalogue, or fallback)
  //      -> Included regardless of adult/NSFW classification, rating, genre, media type, or Jikan/calendar visibility.
  //    OR
  //    - It is an active carryover currently airing on the Summer 2026 Release Calendar.
  const currentlyWatchingItems = useMemo(() => {
    const items: Array<{
      node: any;
      list_status?: any;
    }> = [];
    const seenIds = new Set<number>();

    for (const item of malList) {
      if (!item?.node?.id) continue;
      // 1. MAL watching status is the first condition
      if (item.list_status?.status !== 'watching') continue;

      // 2. Must be either a Summer 2026 anime OR an active carryover on the Release Calendar
      const isSummerAnime = isAnimeSummer2026(item.node, allSummer2026Ids);
      const isOnReleaseCalendar = calendarSummer2026Ids.has(item.node.id);

      if (!isSummerAnime && !isOnReleaseCalendar) continue;

      if (!seenIds.has(item.node.id)) {
        seenIds.add(item.node.id);
        items.push({
          node: item.node,
          list_status: item.list_status || { status: 'watching', score: 0, num_episodes_watched: 0 },
        });
      }
    }

    return items;
  }, [malList, allSummer2026Ids, calendarSummer2026Ids]);

  // Spring 2026 Currently Watching items
  // An anime is included in Spring 2026 Currently Watching when:
  // 1. MAL list_status.status === 'watching'
  // 2. Belongs to Spring 2026 (via MAL start_season, seasonal catalogue, or fallback)
  // 3. Strict boundary: Summer 2026 anime MUST NOT leak into Spring 2026
  const currentlyWatchingSpring2026Items = useMemo(() => {
    const items: Array<{
      node: any;
      list_status?: any;
    }> = [];
    const seenIds = new Set<number>();

    for (const item of malList) {
      if (!item?.node?.id) continue;
      if (item.list_status?.status !== 'watching') continue;

      // Must be a Spring 2026 anime
      const isSpringAnime = isAnimeSpring2026(item.node, allSpring2026Ids);
      if (!isSpringAnime) continue;

      // Future season leakage prevention
      const isSummerAnime = isAnimeSummer2026(item.node, allSummer2026Ids);
      if (isSummerAnime) continue;

      if (!seenIds.has(item.node.id)) {
        seenIds.add(item.node.id);
        items.push({
          node: item.node,
          list_status: item.list_status || { status: 'watching', score: 0, num_episodes_watched: 0 },
        });
      }
    }

    return items;
  }, [malList, allSpring2026Ids, allSummer2026Ids]);

  // Step 2: Seasonal start boundary for Summer 2026:
  // Earliest first-episode airing date among the user's currently-watching Summer 2026 anime.
  // Uses actual broadcast/airing start date (node.start_date) of Summer 2026 anime, NOT personal MAL list_status.start_date.
  // Note: Older-season carryovers (e.g. Winter/Spring 2026) are excluded from setting the Summer boundary.
  const earliestSummer2026AiringDate = useMemo(() => {
    const summer2026WatchingItems = malList.filter(
      (item) => item.list_status?.status === 'watching' && isAnimeSummer2026(item.node, allSummer2026Ids)
    );
    return getEarliestFirstEpisodeAiringDate(summer2026WatchingItems);
  }, [malList, allSummer2026Ids]);

  // Spring 2026 Earliest First Episode Airing Date
  const earliestSpring2026AiringDate = useMemo(() => {
    const spring2026WatchingItems = malList.filter(
      (item) => item.list_status?.status === 'watching' && isAnimeSpring2026(item.node, allSpring2026Ids)
    );
    return getEarliestFirstEpisodeAiringDate(spring2026WatchingItems);
  }, [malList, allSpring2026Ids]);

  // Step 3: Anime completed during Summer 2026:
  // 1. MAL status === 'completed'
  // 2. Has a valid completion/finish date (list_status.finish_date)
  // 3. finish_date >= earliestSummer2026AiringDate (inclusive boundary comparison)
  // 4. Excludes anime from the immediately preceding season (Spring 2026)
  const completedSummer2026Items = useMemo(() => {
    if (!earliestSummer2026AiringDate) {
      return [];
    }

    const items: Array<{
      node: any;
      list_status?: any;
    }> = [];
    const seenIds = new Set<number>();

    for (const item of malList) {
      if (!item?.node?.id) continue;
      if (isCompletedDuringSummer2026(item, earliestSummer2026AiringDate, allSummer2026Ids)) {
        if (!seenIds.has(item.node.id)) {
          seenIds.add(item.node.id);
          items.push({
            node: item.node,
            list_status: item.list_status || { status: 'completed', score: 0, num_episodes_watched: 0 },
          });
        }
      }
    }

    // Sort by finish date descending (most recently completed first)
    items.sort((a, b) => {
      const dateA = a.list_status?.finish_date || '';
      const dateB = b.list_status?.finish_date || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      return (b.list_status?.score || 0) - (a.list_status?.score || 0);
    });

    return items;
  }, [malList, earliestSummer2026AiringDate, allSummer2026Ids]);

  // Anime completed during Spring 2026:
  // 1. MAL status === 'completed'
  // 2. finish_date between 2026-04-01 and 2026-06-30 (inclusive) or Spring 2026 debut
  // 3. Allows Winter 2026 / backlog completions in May/Spring
  // 4. Excludes Summer 2026 anime and completions outside Spring window
  const completedSpring2026Items = useMemo(() => {
    const items: Array<{
      node: any;
      list_status?: any;
    }> = [];
    const seenIds = new Set<number>();

    for (const item of malList) {
      if (!item?.node?.id) continue;
      if (isCompletedDuringSpring2026(item, earliestSpring2026AiringDate, allSpring2026Ids)) {
        if (!seenIds.has(item.node.id)) {
          seenIds.add(item.node.id);
          items.push({
            node: item.node,
            list_status: item.list_status || { status: 'completed', score: 0, num_episodes_watched: 0 },
          });
        }
      }
    }

    // Sort by finish date descending (most recently completed first)
    items.sort((a, b) => {
      const dateA = a.list_status?.finish_date || '';
      const dateB = b.list_status?.finish_date || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      return (b.list_status?.score || 0) - (a.list_status?.score || 0);
    });

    return items;
  }, [malList, earliestSpring2026AiringDate, allSpring2026Ids]);

  // Active season calculations for MY SEASON tab
  const activeWatchingItems = selectedSeason === 'spring' ? currentlyWatchingSpring2026Items : currentlyWatchingItems;
  const activeCompletedItems = selectedSeason === 'spring' ? completedSpring2026Items : completedSummer2026Items;
  const activeSeasonLabel = selectedSeason === 'spring' ? 'SPRING 2026' : 'SUMMER 2026';
  const activeSeasonTotalReleases = selectedSeason === 'spring' ? allSpring2026Ids.size : allSummer2026Ids.size;

  // Single Source of Truth for Season-Aware Insights:
  // 1. Watching list strictly belonging to the currently selected season (excludes cross-season carryovers)
  const activeSeasonWatchingList = useMemo(() => {
    const catalogueIds = selectedSeason === 'spring' ? allSpring2026Ids : allSummer2026Ids;
    return activeWatchingItems.filter((item) =>
      isAnimeInSeason(item?.node || item, 2026, selectedSeason, catalogueIds)
    );
  }, [activeWatchingItems, selectedSeason, allSpring2026Ids, allSummer2026Ids]);

  // 2. Complete list of MAL anime for the currently selected season across all statuses
  const activeSeasonMalList = useMemo(() => {
    const catalogueIds = selectedSeason === 'spring' ? allSpring2026Ids : allSummer2026Ids;
    return getAnimeForSelectedSeason<MalListItem>({
      malList,
      year: 2026,
      season: selectedSeason,
      watchingItems: activeSeasonWatchingList,
      completedItems: activeCompletedItems,
      seasonCatalogueIds: catalogueIds,
      userMalMap,
    });
  }, [
    malList,
    selectedSeason,
    activeSeasonWatchingList,
    activeCompletedItems,
    allSpring2026Ids,
    allSummer2026Ids,
    userMalMap,
  ]);

  // 3. Earliest first episode broadcast date for the selected season
  const activeSeasonEarliestAiringDate = useMemo(() => {
    return selectedSeason === 'spring'
      ? earliestSpring2026AiringDate
      : earliestSummer2026AiringDate;
  }, [selectedSeason, earliestSpring2026AiringDate, earliestSummer2026AiringDate]);

  // Complete list of MAL anime classified as Summer 2026 across all statuses (for backward compatibility)
  const summer2026MalList = useMemo(() => {
    if (selectedSeason === 'summer') return activeSeasonMalList;
    return getAnimeForSelectedSeason<MalListItem>({
      malList,
      year: 2026,
      season: 'summer',
      watchingItems: currentlyWatchingItems.filter((i) => isAnimeSummer2026(i?.node || i, allSummer2026Ids)),
      completedItems: completedSummer2026Items,
      seasonCatalogueIds: allSummer2026Ids,
      userMalMap,
    });
  }, [selectedSeason, activeSeasonMalList, malList, currentlyWatchingItems, completedSummer2026Items, allSummer2026Ids, userMalMap]);

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

  // Fetch Jikan Spring 2026 seasonal catalogue
  const loadJikanSpringCatalogue = async () => {
    setJikanSpringLoading(true);
    try {
      const data = await fetchJikanSeasonCatalogue(2026, 'spring');
      setJikanSpring2026List(data);
    } catch (err) {
      console.error('Error fetching Jikan Spring 2026 seasonal catalogue:', err);
    } finally {
      setJikanSpringLoading(false);
    }
  };

  // Fetch Release Calendar releases for Summer 2026 season window
  const loadCalendarSeasonalReleases = async () => {
    try {
      const malIds = await fetchCalendarSeasonReleases();
      if (malIds.length > 0) {
        setCalendarSummer2026Ids((prev) => {
          const next = new Set(prev);
          for (const id of malIds) next.add(id);
          return next;
        });
      }
    } catch (err) {
      console.error('Error fetching calendar seasonal releases fallback:', err);
    }
  };

  // Callback to merge IDs whenever the ReleaseCalendar loads/updates schedule data
  const handleCalendarItemsLoaded = (malIds: number[]) => {
    if (!Array.isArray(malIds) || malIds.length === 0) return;
    setCalendarSummer2026Ids((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of malIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  // Targeted Fallback: For anime without clear start_season in MAL metadata,
  // query individual Jikan metadata (/v4/anime/{mal_id}) to verify seasonal placement
  useEffect(() => {
    if (!malList || malList.length === 0) return;
    if (jikanSeasonLoading || jikanSpringLoading) return;

    const itemsNeedingLookup = malList.filter((item) => {
      const animeId = item.node?.id;
      if (!animeId) return false;
      // If node.start_season is already defined on MAL, MAL is authoritative! No need to query Jikan.
      if (item.node?.start_season && typeof item.node.start_season === 'object') {
        const year = Number(item.node.start_season.year);
        const season = item.node.start_season.season;
        if (!isNaN(year) && season) return false;
      }
      if (jikanSummer2026Ids.has(animeId) || jikanSpring2026Ids.has(animeId)) return false;
      if (fallbackSummer2026Ids.has(animeId) || fallbackSpring2026Ids.has(animeId)) return false;
      return true;
    });

    if (itemsNeedingLookup.length === 0) return;

    let isMounted = true;
    const runFallbackLookups = async () => {
      for (const item of itemsNeedingLookup) {
        if (!isMounted) break;
        const animeId = item.node.id;
        const info = await fetchJikanAnimeInfo(animeId);
        if (info && isMounted) {
          if (info.is_summer_2026 || (info.year === 2026 && info.season?.toLowerCase() === 'summer')) {
            setFallbackSummer2026Ids((prev) => {
              const next = new Set(prev);
              next.add(animeId);
              return next;
            });
          } else if (info.year === 2026 && info.season?.toLowerCase() === 'spring') {
            setFallbackSpring2026Ids((prev) => {
              const next = new Set(prev);
              next.add(animeId);
              return next;
            });
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    };

    runFallbackLookups();
    return () => {
      isMounted = false;
    };
  }, [
    malList,
    jikanSummer2026Ids,
    jikanSpring2026Ids,
    fallbackSummer2026Ids,
    fallbackSpring2026Ids,
    jikanSeasonLoading,
    jikanSpringLoading,
  ]);

  // Check MAL Auth Status and load catalogues on Mount
  useEffect(() => {
    checkMalConfig();
    checkMalAuth();
    loadJikanSeasonalCatalogue();
    loadJikanSpringCatalogue();
    fetchSeasonalList(2026, 'summer');
    loadCalendarSeasonalReleases();

    // Listen for OAuth success message with one-time ticket from popup window
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MAL_OAUTH_SUCCESS') {
        console.log('[MAL OAUTH] OAuth success message received | ticket_present:', Boolean(event.data?.ticket));
        oauthSuccessReceivedRef.current = true;
        if (popupTimerRef.current) {
          clearInterval(popupTimerRef.current);
          popupTimerRef.current = null;
        }
        if (event.data?.ticket) {
          exchangeHandoffTicket(event.data.ticket);
        } else {
          checkMalAuth();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (popupTimerRef.current) {
        clearInterval(popupTimerRef.current);
        popupTimerRef.current = null;
      }
    };
  }, []);

  // Fetch seasonal list whenever season tab is selected if not already populated
  useEffect(() => {
    if (activeTab === 'season' && seasonalList.length === 0 && !seasonalLoading) {
      fetchSeasonalList(2026, 'summer');
    }
  }, [activeTab, seasonalList.length, seasonalLoading]);

  // Debounced MAL Catalogue Search
  useEffect(() => {
    const trimmed = malSearchQuery.trim();
    if (trimmed.length < 2) {
      setMalCatalogueResults([]);
      setMalCatalogueLoading(false);
      return;
    }

    const currentGen = ++catalogueSearchGenRef.current;
    setMalCatalogueLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mal/search?q=${encodeURIComponent(trimmed)}&limit=20`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });

        if (currentGen !== catalogueSearchGenRef.current) return;

        if (res.ok) {
          const json = await res.json();
          setMalCatalogueResults(Array.isArray(json.data) ? json.data : []);
        } else {
          setMalCatalogueResults([]);
        }
      } catch (err) {
        if (currentGen === catalogueSearchGenRef.current) {
          console.error('Error searching MAL catalogue:', err);
          setMalCatalogueResults([]);
        }
      } finally {
        if (currentGen === catalogueSearchGenRef.current) {
          setMalCatalogueLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [malSearchQuery]);

  // Ensure Gemini tab is not active if user is logged out
  useEffect(() => {
    if (!malUser && activeTab === 'gemini') {
      setActiveTab('season');
    }
  }, [malUser, activeTab]);

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

  const exchangeHandoffTicket = async (ticket: string) => {
    oauthSuccessReceivedRef.current = true;
    if (popupTimerRef.current) {
      clearInterval(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    const handoffGen = ++authRequestGenRef.current;
    console.log('[MAL OAUTH] Exchanging handoff ticket... | gen:', handoffGen);
    try {
      const res = await fetch('/api/mal/session/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
        credentials: 'include',
      });
      if (handoffGen !== authRequestGenRef.current) {
        console.log('[MAL OAUTH] Stale handoff ticket exchange ignored | gen:', handoffGen, '| currentGen:', authRequestGenRef.current);
        return;
      }
      if (!res.ok) {
        console.error('[MAL OAUTH] Ticket exchange failed with status:', res.status);
        checkMalAuth();
        return;
      }
      const data = await res.json();
      if (handoffGen !== authRequestGenRef.current) return;
      if (data.success && data.sessionToken) {
        console.log('[MAL OAUTH] Ticket exchange successful, saving session token');
        setSessionToken(data.sessionToken);
        try {
          sessionStorage.setItem('mal_session_token', data.sessionToken);
        } catch {}
        checkMalAuth(data.sessionToken);
      } else {
        checkMalAuth();
      }
    } catch (err) {
      if (handoffGen !== authRequestGenRef.current) return;
      console.error('[MAL OAUTH] Error during ticket exchange:', err);
      checkMalAuth();
    }
  };

  const checkMalAuth = async (tokenOverride?: string | null) => {
    const currentGen = ++authRequestGenRef.current;
    const token = tokenOverride !== undefined ? tokenOverride : sessionToken;
    console.log('[MAL AUTH] /api/mal/me request made | gen:', currentGen, '| token_attached:', Boolean(token));
    try {
      const res = await fetch('/api/mal/me', {
        credentials: 'include',
        headers: getAuthHeaders(token),
      });
      console.log('[MAL AUTH] /api/mal/me response status:', res.status, '| gen:', currentGen);
      if (currentGen !== authRequestGenRef.current) {
        console.log('[MAL AUTH] Stale checkMalAuth response ignored | gen:', currentGen, '| currentGen:', authRequestGenRef.current);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        console.log('[MAL AUTH] /api/mal/me response authenticated:', data.authenticated, '| gen:', currentGen);
        if (currentGen !== authRequestGenRef.current) return;
        if (data.authenticated && data.user) {
          setMalUser(data.user);
          fetchMalList(token);
        } else {
          setMalUser(null);
          setMalList([]);
          if (token) {
            setSessionToken(null);
            try { sessionStorage.removeItem('mal_session_token'); } catch {}
          }
        }
      }
    } catch (err) {
      if (currentGen !== authRequestGenRef.current) return;
      console.error('Error checking MAL authentication:', err);
    }
  };

  const fetchMalList = async (tokenOverride?: string | null) => {
    const currentGen = authRequestGenRef.current;
    const token = tokenOverride !== undefined ? tokenOverride : sessionToken;
    console.log('[MAL LIST] MAL list reload triggered | token_attached:', Boolean(token));
    setMalLoading(true);
    setMalError(null);
    try {
      const res = await fetch('/api/mal/animelist', {
        credentials: 'include',
        headers: getAuthHeaders(token),
      });
      if (currentGen !== authRequestGenRef.current) {
        console.log('[MAL LIST] Stale fetchMalList response ignored | gen:', currentGen);
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          setMalUser(null);
          setMalList([]);
          setSessionToken(null);
          try { sessionStorage.removeItem('mal_session_token'); } catch {}
          throw new Error('MyAnimeList session expired. Please connect again.');
        }
        throw new Error(`Failed to fetch MyAnimeList (${res.status})`);
      }
      const data = await res.json();
      if (currentGen !== authRequestGenRef.current) return;
      setMalList(data.data || []);
    } catch (err: any) {
      if (currentGen !== authRequestGenRef.current) return;
      console.error('Error fetching MAL anime list:', err);
      setMalError(err.message || 'Failed to load MyAnimeList');
    } finally {
      if (currentGen === authRequestGenRef.current) {
        setMalLoading(false);
      }
    }
  };

  // Fetch Seasonal Anime List from MAL (Summer 2026)
  const fetchSeasonalList = async (year = 2026, season = 'summer') => {
    setSeasonalLoading(true);
    setSeasonalError(null);
    try {
      const res = await fetch(`/api/mal/season/${year}/${season}`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
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
    console.log('[MAL OAUTH] OAuth popup opened');
    if (!malConfigured) {
      setMalError('MAL_CLIENT_ID is not configured in environment variables.');
      return;
    }

    oauthSuccessReceivedRef.current = false;
    authRequestGenRef.current++; // Invalidate any pre-login auth checks

    if (popupTimerRef.current) {
      clearInterval(popupTimerRef.current);
      popupTimerRef.current = null;
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

    // Fallback polling if popup closed manually without OAuth postMessage
    if (popup) {
      popupTimerRef.current = setInterval(() => {
        if (popup.closed) {
          if (popupTimerRef.current) {
            clearInterval(popupTimerRef.current);
            popupTimerRef.current = null;
          }
          if (!oauthSuccessReceivedRef.current) {
            console.log('[MAL OAUTH] Popup closed without OAuth success postMessage, checking auth fallback');
            checkMalAuth();
          } else {
            console.log('[MAL OAUTH] Popup closed after OAuth success already handled');
          }
        }
      }, 1000);
    }
  };

  const handleDisconnectMal = async () => {
    oauthSuccessReceivedRef.current = false;
    authRequestGenRef.current++;
    if (popupTimerRef.current) {
      clearInterval(popupTimerRef.current);
      popupTimerRef.current = null;
    }
    try {
      await fetch('/api/mal/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
    } catch {
      // Ignore
    } finally {
      setMalUser(null);
      setMalList([]);
      setSessionToken(null);
      try {
        sessionStorage.removeItem('mal_session_token');
      } catch {}
    }
  };

  // Filtered and sorted MAL list
  const filteredMalList = useMemo(() => {
    const query = malSearchQuery.trim().toLowerCase();

    return malList
      .filter((item) => {
        // Status filter
        if (malFilterStatus !== 'all' && item.list_status?.status !== malFilterStatus) {
          return false;
        }

        // Local search query filter
        if (query.length > 0) {
          const title = (item.node?.title || '').toLowerCase();
          const titleEn = (item.node?.alternative_titles?.en || '').toLowerCase();
          const titleJa = (item.node?.alternative_titles?.ja || '').toLowerCase();
          const synonyms = (item.node?.alternative_titles?.synonyms || []).map((s) => s.toLowerCase());

          const matchesTitle =
            title.includes(query) ||
            titleEn.includes(query) ||
            titleJa.includes(query) ||
            synonyms.some((s) => s.includes(query));

          if (!matchesTitle) return false;
        }

        return true;
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
  }, [malList, malFilterStatus, malSortOption, malSearchQuery]);

  const isEffectiveDark = malUser !== null && theme === 'dark';
  const isEffectiveSakura = malUser !== null && theme === 'sakura';

  useEffect(() => {
    if (isEffectiveDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isEffectiveDark]);

  return (
    <div className={`w-full min-w-full min-h-screen flex-1 ${isEffectiveDark ? 'dark bg-[#141318] text-[#F4F2F7]' : 'bg-[#F7F5F2] text-[#25242A]'} font-sans antialiased flex flex-col justify-between relative`}>
      {/* SAKURA PETALS CANVAS (SHOWN ONLY IN SAKURA MODE WHEN LOGGED IN) */}
      {isEffectiveSakura && <SakuraPetalsCanvas />}

      {/* MINIMAL TOP NAVIGATION BAR */}
      <header className="w-full sticky top-0 z-40 bg-white dark:bg-[#1E1D24] border-b border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xs px-4 sm:px-8 py-3">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
          {/* BRAND */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('home')}>
            <span className="text-[#7567C7] text-lg font-bold">✦</span>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
              <span>AniVerse</span>
              <span className="text-[11px] font-medium text-[#77747D] dark:text-[#9E9AA6] tracking-wider hidden md:inline-block">
                アニバース
              </span>
            </h1>
          </div>

          {/* DESKTOP TOP NAV TABS */}
          {malUser && (
            <nav className="hidden md:flex items-center gap-1.5 bg-[#F7F5F2] dark:bg-[#26252F] p-1 rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37]">
              <button
                id="home-tab-btn"
                onClick={() => setActiveTab('home')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'home'
                    ? 'bg-white text-[#7567C7] shadow-2xs'
                    : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                }`}
              >
                <Home className="h-4 w-4 text-[#7567C7]" />
                <span>HOME</span>
              </button>

              <button
                id="season-tab-btn"
                onClick={() => {
                  setActiveTab('season');
                  if (seasonalList.length === 0 && !seasonalLoading) {
                    fetchSeasonalList(2026, 'summer');
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'season'
                    ? 'bg-white text-[#7567C7] shadow-2xs'
                    : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                }`}
              >
                <Sun className="h-4 w-4 text-[#C69A55]" />
                <span>MY SEASON</span>
              </button>

              <button
                id="mal-tab-btn"
                onClick={() => {
                  setActiveTab('mal');
                  if (malUser && malList.length === 0 && !malLoading) {
                    fetchMalList();
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'mal'
                    ? 'bg-white text-[#7567C7] shadow-2xs'
                    : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                }`}
              >
                <Tv className="h-4 w-4" />
                <span>MY LIST</span>
                {malList.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#7567C7]/10 text-[#7567C7] text-[10px] font-bold">
                    {malList.length}
                  </span>
                )}
              </button>

              <button
                id="release-calendar-tab-btn"
                onClick={() => setActiveTab('calendar')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'calendar'
                    ? 'bg-white text-[#7567C7] shadow-2xs'
                    : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                }`}
              >
                <CalendarDays className="h-4 w-4 text-[#7567C7]" />
                <span>RELEASE CALENDAR</span>
              </button>

              {/* INSIGHTS COMPACT DROPDOWN GROUP */}
              <div className="relative" ref={insightsMenuRef}>
                <button
                  id="insights-dropdown-btn"
                  onClick={() => setIsInsightsOpen((prev) => !prev)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'status' || activeTab === 'gemini' || activeTab === 'review'
                      ? 'bg-white text-[#7567C7] shadow-2xs border border-[#7567C7]/30'
                      : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                  }`}
                >
                  {activeTab === 'status' ? (
                    <>
                      <BarChart3 className="h-4 w-4 text-[#6D9B7C]" />
                      <span>STATISTICS</span>
                    </>
                  ) : activeTab === 'gemini' ? (
                    <>
                      <Sparkles className="h-4 w-4 text-[#C69A55]" />
                      <span>AI INSIGHTS</span>
                    </>
                  ) : activeTab === 'review' ? (
                    <>
                      <Trophy className="h-4 w-4 text-[#E5B869]" />
                      <span>SEASON REVIEW</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-[#7567C7]" />
                      <span>INSIGHTS</span>
                    </>
                  )}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      isInsightsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isInsightsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1C192E] rounded-2xl shadow-xl border border-[#E7E3DF] dark:border-[#2D2A4A] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      id="dropdown-opt-stats"
                      onClick={() => {
                        setActiveTab('status');
                        setIsInsightsOpen(false);
                        if (malUser && malList.length === 0 && !malLoading) {
                          fetchMalList();
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                        activeTab === 'status'
                          ? 'bg-[#F0EDFA] text-[#7567C7] dark:bg-[#7567C7]/20 dark:text-[#D8D2FF]'
                          : 'text-[#77747D] dark:text-[#AEA8C9] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D] hover:text-[#25242A] dark:hover:text-white'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-[#6D9B7C]/15 text-[#6D9B7C] shrink-0">
                        <BarChart3 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold">Statistics</div>
                        <div className="text-[10px] text-[#77747D] dark:text-[#AEA8C9]/80 font-normal">Score curves & charts</div>
                      </div>
                    </button>

                    <button
                      id="dropdown-opt-gemini"
                      onClick={() => {
                        setActiveTab('gemini');
                        setIsInsightsOpen(false);
                        if (malUser && malList.length === 0 && !malLoading) {
                          fetchMalList();
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer mt-1 ${
                        activeTab === 'gemini'
                          ? 'bg-[#F0EDFA] text-[#7567C7] dark:bg-[#7567C7]/20 dark:text-[#D8D2FF]'
                          : 'text-[#77747D] dark:text-[#AEA8C9] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D] hover:text-[#25242A] dark:hover:text-white'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-[#C69A55]/15 text-[#C69A55] shrink-0">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold">AI Insights</div>
                        <div className="text-[10px] text-[#77747D] dark:text-[#AEA8C9]/80 font-normal">Gemini season analysis</div>
                      </div>
                    </button>

                    <button
                      id="dropdown-opt-review"
                      onClick={() => {
                        setActiveTab('review');
                        setIsInsightsOpen(false);
                        if (malUser && malList.length === 0 && !malLoading) {
                          fetchMalList();
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer mt-1 ${
                        activeTab === 'review'
                          ? 'bg-[#FDF8EE] text-[#C69A55] dark:bg-[#C69A55]/20 dark:text-[#F5D78E]'
                          : 'text-[#77747D] dark:text-[#AEA8C9] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D] hover:text-[#25242A] dark:hover:text-white'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-[#E5B869]/15 text-[#E5B869] shrink-0">
                        <Trophy className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold">Season Review</div>
                        <div className="text-[10px] text-[#77747D] dark:text-[#AEA8C9]/80 font-normal">Yearbook & awards podium</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </nav>
          )}

          {/* RIGHT ACTION / USER PROFILE */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* THEME / APPEARANCE SELECTOR (AUTHENTICATED ONLY) */}
            {malUser && (
              <AppearanceSelector
                currentTheme={theme}
                onThemeChange={handleThemeChange}
              />
            )}

            <button
              onClick={() => setIsAboutModalOpen(true)}
              title="About AniVerse & Version Info"
              className="px-2.5 py-1.5 rounded-xl text-[#77747D] hover:text-[#7567C7] hover:bg-[#F0EDFA]/60 border border-transparent hover:border-[#E7E3DF] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            >
              <Info className="h-4 w-4 text-[#7567C7]" />
              <span className="hidden sm:inline">About</span>
            </button>

            {malUser && (
              <button
                id="excel-export-header-button"
                type="button"
                onClick={() => setIsExcelExportModalOpen(true)}
                title="Export Anime Data to Excel (.xlsx)"
                className="px-2.5 py-1.5 rounded-xl text-[#77747D] hover:text-[#7567C7] hover:bg-[#F0EDFA]/60 border border-transparent hover:border-[#E7E3DF] dark:hover:border-[#2E2C37] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#7567C7]" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            {malUser ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  id="user-profile-menu-button"
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  aria-expanded={isProfileOpen}
                  aria-haspopup="true"
                  title="Account menu"
                  className="flex items-center gap-2 sm:gap-2.5 bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-xl px-2.5 py-1.5 shadow-2xs hover:border-[#7567C7]/50 dark:hover:border-[#7567C7]/50 transition-colors cursor-pointer"
                >
                  {malUser.picture ? (
                    <img
                      src={malUser.picture}
                      alt={malUser.name}
                      className="w-7 h-7 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-[#F0EDFA] dark:bg-[#2A2542] flex items-center justify-center text-[#7567C7] dark:text-[#B9B0F2] font-bold text-xs">
                      {malUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] leading-none flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6D9B7C]" />
                      {malUser.name}
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-[#77747D] dark:text-[#9E9AA6] transition-transform duration-200 ${
                      isProfileOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#1C192E] rounded-2xl shadow-xl border border-[#E7E3DF] dark:border-[#2D2A4A] p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* User header card */}
                    <div className="p-2.5 rounded-xl bg-[#F7F5F2] dark:bg-[#25223D] flex items-center gap-3">
                      {malUser.picture ? (
                        <img
                          src={malUser.picture}
                          alt={malUser.name}
                          className="w-10 h-10 rounded-xl object-cover border border-[#E7E3DF] dark:border-[#3A3656]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-[#F0EDFA] dark:bg-[#342D59] flex items-center justify-center text-[#7567C7] dark:text-[#D8D2FF] font-black text-base border border-[#E7E3DF] dark:border-[#3A3656]">
                          {malUser.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-[#25242A] dark:text-[#F4F2F7] truncate" title={malUser.name}>
                          {malUser.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#6D9B7C] animate-pulse" />
                          <span className="text-[10px] font-semibold text-[#6D9B7C]">Connected to MAL</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats Pill */}
                    {malList.length > 0 && (
                      <div className="mt-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#201D35] border border-slate-100 dark:border-[#2E2A4D] flex items-center justify-between text-xs">
                        <span className="text-[#77747D] dark:text-[#AEA8C9] font-medium text-[11px]">Tracked Anime</span>
                        <span className="font-black text-[#7567C7] dark:text-[#D8D2FF]">{malList.length}</span>
                      </div>
                    )}

                    {/* Menu links */}
                    <div className="mt-2 space-y-1">
                      <button
                        onClick={() => {
                          setActiveTab('mal');
                          setIsProfileOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-[#77747D] dark:text-[#AEA8C9] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer flex items-center gap-2.5"
                      >
                        <Tv className="h-4 w-4 text-[#7567C7]" />
                        <span>My Anime List</span>
                      </button>

                      <button
                        id="profile-export-excel-button"
                        onClick={() => {
                          setIsProfileOpen(false);
                          setIsExcelExportModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-[#77747D] dark:text-[#AEA8C9] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer flex items-center gap-2.5"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-[#7567C7]" />
                        <span>Export to Excel (.xlsx)</span>
                      </button>

                      <a
                        href={`https://myanimelist.net/profile/${encodeURIComponent(malUser.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsProfileOpen(false)}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-[#77747D] dark:text-[#AEA8C9] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <User className="h-4 w-4 text-[#6D9B7C]" />
                          <span>View on MyAnimeList</span>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-[#77747D]/70" />
                      </a>
                    </div>

                    <div className="my-1.5 border-t border-[#E7E3DF] dark:border-[#2D2A4A]" />

                    {/* Disconnect / Logout Button */}
                    <button
                      id="profile-logout-button"
                      onClick={() => {
                        setIsProfileOpen(false);
                        handleDisconnectMal();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[#C77B82] hover:bg-[#C77B82]/10 dark:hover:bg-[#C77B82]/20 transition-colors cursor-pointer flex items-center gap-2.5"
                    >
                      <LogOut className="h-4 w-4 text-[#C77B82]" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleConnectMal}
                className="bg-[#7567C7] hover:bg-[#6455b8] text-white font-medium py-2 px-4 rounded-xl transition-all flex items-center gap-2 text-xs sm:text-sm cursor-pointer shadow-2xs"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Connect MyAnimeList</span>
              </button>
            )}
          </div>
        </div>

        {/* MOBILE SECONDARY NAV ROW WHEN LOGGED IN */}
        {malUser && (
          <div className="flex md:hidden items-center gap-1.5 mt-3 pt-2 border-t border-[#E7E3DF] dark:border-[#2E2C37] overflow-x-auto">
            <button
              onClick={() => setActiveTab('home')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'home' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              <span>HOME</span>
            </button>
            <button
              onClick={() => setActiveTab('season')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 ${
                activeTab === 'season' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              MY SEASON
            </button>
            <button
              onClick={() => setActiveTab('mal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'mal' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              <span>MY LIST</span>
              {malList.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#7567C7]/10 text-[#7567C7] text-[10px] font-bold">
                  {malList.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 ${
                activeTab === 'calendar' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              RELEASES
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 ${
                activeTab === 'status' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              STATS
            </button>
            <button
              onClick={() => setActiveTab('gemini')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 ${
                activeTab === 'gemini' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              ✨ GEMINI
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'review' ? 'bg-[#FDF8EE] text-[#C69A55] font-bold' : 'text-[#77747D]'
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-[#E5B869]" />
              <span>REVIEW</span>
            </button>
          </div>
        )}
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 flex-1">
        {/* LOGGED OUT EXPERIENCE: WELCOME PAGE */}
        {!malUser && (
          <WelcomePage
            onConnectMal={handleConnectMal}
            seasonalSampleList={jikanSummer2026List}
            isAuthenticated={false}
          />
        )}

        {/* LOGGED IN EXPERIENCE: HOME / WELCOME PAGE */}
        {malUser && activeTab === 'home' && (
          <WelcomePage
            onConnectMal={() => setActiveTab('season')}
            seasonalSampleList={jikanSummer2026List}
            isAuthenticated={true}
          />
        )}

        {/* LOGGED IN EXPERIENCE: TRACKER DASHBOARD */}
        {malUser && activeTab === 'mal' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-2xl p-6 shadow-2xs gap-4">
              <div className="flex items-center gap-4">
                {malUser.picture ? (
                  <img
                    src={malUser.picture}
                    alt={malUser.name}
                    className="w-12 h-12 rounded-xl object-cover border border-[#E7E3DF] dark:border-[#2E2C37]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#F0EDFA] dark:bg-[#25232F] flex items-center justify-center text-[#7567C7] font-bold text-lg">
                    {malUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#25242A] dark:text-[#EAE8F0]">
                    MY LIST
                  </h3>
                  <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-0.5">
                    {malList.length} anime series retrieved from MyAnimeList
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchMalList}
                  disabled={malLoading}
                  className="p-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-[#F7F5F2] dark:hover:bg-[#25232F] text-[#25242A] dark:text-[#EAE8F0] transition-colors cursor-pointer shadow-2xs"
                  title="Refresh List"
                >
                  <RefreshCw className={`h-4 w-4 ${malLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleDisconnectMal}
                  className="px-4 py-2 rounded-xl bg-[#D6A0AF]/15 hover:bg-[#D6A0AF]/25 text-[#C77B82] font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>

            {/* Anime Search Bar */}
            <div className="relative w-full">
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#77747D] dark:text-[#A4A1AA]">
                  <Search className="h-4 w-4 text-[#7567C7]" />
                </div>
                <input
                  type="text"
                  value={malSearchQuery}
                  onChange={(e) => setMalSearchQuery(e.target.value)}
                  placeholder="Search anime in your list or discover new titles on MyAnimeList..."
                  className="w-full rounded-2xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] py-3.5 pl-11 pr-10 text-sm text-[#25242A] dark:text-[#EAE8F0] placeholder-[#77747D] dark:placeholder-[#A4A1AA] shadow-2xs focus:border-[#7567C7] focus:outline-none focus:ring-2 focus:ring-[#7567C7]/20 transition-all"
                />
                {malSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMalSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#77747D] hover:text-[#25242A] dark:hover:text-[#EAE8F0] transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Controls with Secondary Segmented Control System */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-2xl p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs font-bold text-[#77747D] dark:text-[#A4A1AA] tracking-wider uppercase flex items-center gap-1.5 shrink-0 px-1">
                  <Filter className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Status:</span>
                </span>
                <div className="flex flex-wrap items-center gap-1 bg-[#F7F5F2] dark:bg-[#25232F] p-1 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37]">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'watching', label: 'Watching' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'plan_to_watch', label: 'Plan to Watch' },
                    { id: 'on_hold', label: 'On Hold' },
                    { id: 'dropped', label: 'Dropped' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setMalFilterStatus(st.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                        malFilterStatus === st.id
                          ? 'bg-white dark:bg-[#1C1A24] text-[#7567C7] font-semibold shadow-2xs'
                          : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-[#EAE8F0]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 self-end lg:self-auto">
                <label htmlFor="mal-sort-option" className="text-xs font-bold text-[#77747D] dark:text-[#A4A1AA] tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Sort:</span>
                </label>
                <div className="relative inline-block w-48">
                  <select
                    id="mal-sort-option"
                    value={malSortOption}
                    onChange={(e) => setMalSortOption(e.target.value)}
                    className="w-full appearance-none bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-white dark:hover:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[#25242A] dark:text-[#EAE8F0] text-xs font-medium rounded-xl py-2 pl-3 pr-8 shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#7567C7] transition-all cursor-pointer"
                  >
                    <option value="title_asc">A to Z</option>
                    <option value="title_desc">Z to A</option>
                    <option value="score_desc">Score (Highest to Lowest)</option>
                    <option value="score_asc">Score (Lowest to Highest)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-[#77747D] dark:text-[#A4A1AA]">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* In-List Results Header when searching */}
            {malSearchQuery.trim().length >= 2 && (
              <div className="flex items-center justify-between px-1">
                <h4 className="text-sm font-bold text-[#25242A] dark:text-[#EAE8F0] flex items-center gap-2">
                  <span>My List Matches</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#6D9B7C]/15 text-[#6D9B7C] text-[11px] font-bold">
                    {filteredMalList.length} {filteredMalList.length === 1 ? 'anime' : 'anime'}
                  </span>
                </h4>
              </div>
            )}

            {/* Anime Cards Grid for user's list */}
            {!malLoading && filteredMalList.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {filteredMalList.map((item, index) => (
                  <MalAnimeCard
                    key={item.node.id}
                    item={item}
                    index={index}
                    onSelect={handleOpenDetailModal}
                    onEdit={handleOpenEditModal}
                    onQuickIncrement={handleQuickIncrement}
                  />
                ))}
              </div>
            )}

            {/* In-List Empty State */}
            {!malLoading && filteredMalList.length === 0 && (
              <div className="text-center py-12 px-4 bg-white dark:bg-[#1C1A24] rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37]">
                <p className="text-[#77747D] dark:text-[#A4A1AA] font-medium text-sm">
                  {malSearchQuery.trim().length >= 2
                    ? `No anime in your list matches "${malSearchQuery.trim()}". Check catalogue search below.`
                    : `No anime found in status "${malFilterStatus.replace(/_/g, ' ')}".`}
                </p>
              </div>
            )}

            {/* Global MAL Catalogue Search Results */}
            {malSearchQuery.trim().length >= 2 && (
              <MalCatalogueSearchResults
                query={malSearchQuery}
                results={malCatalogueResults}
                loading={malCatalogueLoading}
                userMalMap={userMalMap}
                addingAnimeId={addingAnimeId}
                onAdd={handleAddCatalogueAnime}
                onSelect={handleOpenDetailModal}
                onEdit={handleOpenEditModal}
              />
            )}
          </div>
        )}

        {/* LOGGED IN TAB 2: MY SEASON */}
        {malUser && activeTab === 'season' && (
          <div className="space-y-8">
            {/* Header Banner */}
            <div className="bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0EDFA] dark:bg-[#25232F] text-[#7567C7] text-xs font-bold tracking-widest uppercase">
                      {selectedSeason === 'spring' ? (
                        <Sparkles className="h-3.5 w-3.5 text-[#6D9B7C]" />
                      ) : (
                        <Sun className="h-3.5 w-3.5 text-[#C69A55]" />
                      )}
                      <span>{activeSeasonLabel}</span>
                    </div>

                    {/* Minimal Season Selector */}
                    <div
                      id="season-selector-control"
                      className="inline-flex items-center gap-1 bg-[#F7F5F2] dark:bg-[#25232F] p-1 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37]"
                    >
                      <button
                        id="season-btn-spring-2026"
                        type="button"
                        onClick={() => {
                          setSelectedSeason('spring');
                          if (jikanSpring2026List.length === 0 && !jikanSpringLoading) {
                            loadJikanSpringCatalogue();
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          selectedSeason === 'spring'
                            ? 'bg-white dark:bg-[#1C1A24] text-[#7567C7] shadow-2xs'
                            : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-[#EAE8F0]'
                        }`}
                      >
                        Spring 2026
                      </button>
                      <button
                        id="season-btn-summer-2026"
                        type="button"
                        onClick={() => setSelectedSeason('summer')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          selectedSeason === 'summer'
                            ? 'bg-white dark:bg-[#1C1A24] text-[#7567C7] shadow-2xs'
                            : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-[#EAE8F0]'
                        }`}
                      >
                        Summer 2026
                      </button>
                    </div>
                  </div>

                  <h2 className="text-3xl font-bold text-[#25242A] dark:text-[#EAE8F0]">
                    Your season, at a glance.
                  </h2>
                  <p className="text-sm text-[#77747D] dark:text-[#A4A1AA] mt-1">
                    Everything you're watching and completing this season.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    id="season-export-excel-button"
                    type="button"
                    onClick={() => setIsExcelExportModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#25232F] hover:bg-[#F0EDFA] dark:hover:bg-[#2E2C37] text-[#7567C7] border border-[#E7E3DF] dark:border-[#2E2C37] font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title={`Export ${activeSeasonLabel} to Excel`}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#7567C7]" />
                    <span>Export Season</span>
                  </button>

                  <button
                    id="season-refresh-data-button"
                    onClick={() => {
                      if (malUser) fetchMalList();
                      loadJikanSeasonalCatalogue();
                      loadJikanSpringCatalogue();
                      fetchSeasonalList(2026, selectedSeason);
                      loadCalendarSeasonalReleases();
                    }}
                    disabled={seasonalLoading || malLoading || jikanSeasonLoading || jikanSpringLoading}
                    className="px-4 py-2 rounded-xl bg-white dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-slate-50 dark:hover:bg-[#2E2C37] text-[#25242A] dark:text-[#EAE8F0] font-medium text-xs transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${seasonalLoading || malLoading || jikanSeasonLoading || jikanSpringLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Data</span>
                  </button>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#E7E3DF] dark:border-[#2E2C37]">
                <div>
                  <div className="text-2xl font-bold text-[#25242A] dark:text-[#EAE8F0]">{activeWatchingItems.length}</div>
                  <div className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider">WATCHING</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#25242A] dark:text-[#EAE8F0]">{activeCompletedItems.length}</div>
                  <div className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider">COMPLETED</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#25242A] dark:text-[#EAE8F0]">
                    {malList.length > 0
                      ? (malList.reduce((acc, curr) => acc + (curr.list_status?.score || 0), 0) / (malList.filter(i => i.list_status?.score > 0).length || 1)).toFixed(1)
                      : '—'}
                  </div>
                  <div className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider">AVG SCORE</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#25242A] dark:text-[#EAE8F0]">{activeSeasonTotalReleases}</div>
                  <div className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider">SEASON RELEASES</div>
                </div>
              </div>
            </div>

            {/* CURRENTLY WATCHING */}
            <SeasonTable
              title="Currently Watching"
              subtitle={
                selectedSeason === 'spring'
                  ? 'Anime from your MyAnimeList account that aired in Spring 2026.'
                  : 'Anime from your MyAnimeList account that are airing in Summer 2026.'
              }
              icon={<PlayCircle className="h-5 w-5 text-[#6D9B7C]" />}
              items={activeWatchingItems}
              badgeText="Watching"
              badgeBg="bg-[#F0EDFA]"
              badgeTextClass="text-[#7567C7]"
              customUserNotes={customUserNotes}
              onSaveCustomNote={handleSaveCustomNote}
              onSelectAnime={handleOpenDetailModal}
              onEditAnime={handleOpenEditModal}
              onQuickIncrement={handleQuickIncrement}
            />

            {/* COMPLETED DURING SEASON */}
            <SeasonTable
              title={
                selectedSeason === 'spring'
                  ? 'Completed During Spring 2026'
                  : 'Completed During Summer 2026'
              }
              subtitle={
                selectedSeason === 'spring'
                  ? 'Anime completed during the Spring 2026 season (Apr 1 – Jun 30, 2026).'
                  : 'Anime completed during the Summer 2026 season.'
              }
              icon={<CheckCircle2 className="h-5 w-5 text-[#7567C7]" />}
              items={activeCompletedItems}
              badgeText="Completed in Season"
              badgeBg="bg-[#F0EDFA]"
              badgeTextClass="text-[#7567C7]"
              customUserNotes={customUserNotes}
              onSaveCustomNote={handleSaveCustomNote}
              onSelectAnime={handleOpenDetailModal}
              onEditAnime={handleOpenEditModal}
              onQuickIncrement={handleQuickIncrement}
            />
          </div>
        )}

        {/* LOGGED IN TAB 3: RELEASE CALENDAR */}
        {malUser && activeTab === 'calendar' && (
          <div>
            <ReleaseCalendar
              malList={malList}
              malLoading={malLoading}
              onCalendarItemsLoaded={handleCalendarItemsLoaded}
              onOpenMalEditor={handleOpenEditModal}
            />
          </div>
        )}

        {/* LOGGED IN TAB 4: STATISTICS */}
        {malUser && activeTab === 'status' && (
          <div>
            <StatusDashboard
              malList={malList}
              seasonalList={activeSeasonMalList}
              summer2026List={activeSeasonMalList}
              watchingSeasonList={activeSeasonWatchingList}
              watchingSummer2026List={activeSeasonWatchingList}
              currentSeasonName={activeSeasonLabel}
              selectedSeason={selectedSeason}
              onSeasonChange={(s) => {
                setSelectedSeason(s);
                if (s === 'spring' && jikanSpring2026List.length === 0 && !jikanSpringLoading) {
                  loadJikanSpringCatalogue();
                }
              }}
              earliestAiringDate={activeSeasonEarliestAiringDate}
              malUser={malUser}
              malLoading={malLoading}
              malError={malError}
              onConnectMal={handleConnectMal}
              onRefreshMal={fetchMalList}
              onExportExcel={() => setIsExcelExportModalOpen(true)}
            />
          </div>
        )}

        {/* LOGGED IN TAB 5: AI INSIGHTS */}
        {malUser && activeTab === 'gemini' && (
          <div>
            <GeminiInsightsView
              malList={malList}
              seasonalList={activeSeasonMalList}
              summer2026List={activeSeasonMalList}
              watchingSeasonList={activeSeasonWatchingList}
              watchingSummer2026List={activeSeasonWatchingList}
              currentSeasonName={activeSeasonLabel}
              selectedSeason={selectedSeason}
              onSeasonChange={(s) => {
                setSelectedSeason(s);
                if (s === 'spring' && jikanSpring2026List.length === 0 && !jikanSpringLoading) {
                  loadJikanSpringCatalogue();
                }
              }}
              malUser={malUser}
              malLoading={malLoading}
              onConnectMal={handleConnectMal}
            />
          </div>
        )}

        {/* LOGGED IN TAB 6: SEASON REVIEW */}
        {malUser && activeTab === 'review' && (
          <div>
            <SeasonReview
              malList={malList}
              seasonalList={activeSeasonMalList}
              summer2026List={activeSeasonMalList}
              watchingSeasonList={activeSeasonWatchingList}
              watchingSummer2026List={activeSeasonWatchingList}
              completedSeasonList={activeCompletedItems}
              completedSummer2026List={activeCompletedItems}
              currentSeasonName={activeSeasonLabel}
              selectedSeason={selectedSeason}
              onSeasonChange={(s) => {
                setSelectedSeason(s);
                if (s === 'spring' && jikanSpring2026List.length === 0 && !jikanSpringLoading) {
                  loadJikanSpringCatalogue();
                }
              }}
              customUserNotes={customUserNotes}
              malUser={malUser}
              onSaveCustomNote={handleSaveCustomNote}
              onConnectMal={handleConnectMal}
              theme={theme}
            />
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full bg-white dark:bg-[#1E1D24] border-t border-[#E7E3DF] dark:border-[#2E2C37] py-6 px-4 sm:px-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-[#77747D] dark:text-[#9E9AA6] gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#7567C7] font-bold">✦ AniVerse</span>
            <span>•</span>
            <span>Personal Japanese Editorial Tracker</span>
            <span>•</span>
            <button
              onClick={() => setIsAboutModalOpen(true)}
              className="text-[#7567C7] hover:underline font-semibold cursor-pointer"
            >
              About {APP_VERSION_INFO.currentVersion}
            </button>
          </div>
          <div>DATA SYNCED WITH MYANIMELIST & JIKAN API</div>
        </div>
      </footer>

      {/* ABOUT / VERSION MODAL */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      {/* PROFESSIONAL EXCEL EXPORT MODAL */}
      <ExcelExportModal
        isOpen={isExcelExportModalOpen}
        onClose={() => setIsExcelExportModalOpen(false)}
        year={2026}
        season={selectedSeason}
        onSeasonChange={(newSeason) => {
          setSelectedSeason(newSeason);
          if (newSeason === 'spring' && jikanSpring2026List.length === 0 && !jikanSpringLoading) {
            loadJikanSpringCatalogue();
          }
        }}
        malList={malList}
        seasonAnimeList={activeSeasonMalList}
        customUserNotes={customUserNotes}
        malUser={malUser}
        onSuccessToast={(msg) => showSyncToast(msg, 'success')}
      />

      {/* TWO-WAY MAL ENTRY EDIT MODAL */}
      <EditMalEntryModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingMalAnime(null);
        }}
        anime={editingMalAnime}
        onSave={handleSaveMalStatus}
        onDelete={handleDeleteMalStatus}
      />

      {/* ANIME DETAIL MODAL */}
      <AnimeDetailModal
        isOpen={Boolean(selectedDetailAnime)}
        onClose={() => setSelectedDetailAnime(null)}
        anime={selectedDetailAnime}
        customNotes={customUserNotes}
        onSaveNote={handleSaveCustomNote}
        onOpenMalEditor={handleOpenEditModal}
      />

      {/* FLOATING SYNC TOAST NOTIFICATION */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border backdrop-blur-md ${
              syncToast.type === 'success'
                ? 'bg-[#1C1A24]/90 text-white border-[#6D9B7C]/40 shadow-[#6D9B7C]/10'
                : 'bg-[#1C1A24]/90 text-[#E78B90] border-[#C77B82]/40 shadow-[#C77B82]/10'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                syncToast.type === 'success' ? 'bg-[#6D9B7C]' : 'bg-[#C77B82]'
              }`}
            />
            <span>{syncToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
