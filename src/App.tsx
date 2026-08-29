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
} from 'lucide-react';
import { MalUser, MalListItem, SeasonalAnimeItem } from './types';
import { MalAnimeCard } from './components/MalAnimeCard';
import { SeasonTable } from './components/SeasonTable';
import { ReleaseCalendar } from './components/ReleaseCalendar';
import { StatusDashboard } from './components/StatusDashboard';
import { GeminiInsightsView } from './components/GeminiInsightsView';
import { WelcomePage } from './components/WelcomePage';
import {
  fetchJikanSeasonCatalogue,
  fetchJikanAnimeInfo,
  fetchCalendarSeasonReleases,
  isAnimeSummer2026,
  isCompletedDuringSummer2026,
  getEarliestFirstEpisodeAiringDate,
  JikanSeasonalAnime,
} from './utils/seasonUtils';

export default function App() {
  // Navigation tab state ('season' | 'mal' | 'calendar' | 'status' | 'gemini')
  const [activeTab, setActiveTab] = useState<'season' | 'mal' | 'calendar' | 'status' | 'gemini'>('season');

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

  // Jikan Summer 2026 Seasonal State (Authoritative source of truth for MY SEASON)
  const [jikanSummer2026List, setJikanSummer2026List] = useState<JikanSeasonalAnime[]>([]);
  const [jikanSeasonLoading, setJikanSeasonLoading] = useState<boolean>(false);
  const [fallbackSummer2026Ids, setFallbackSummer2026Ids] = useState<Set<number>>(new Set());

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

  // Combined Set of verified Summer 2026 IDs: Jikan seasonal catalogue + individual Jikan fallback
  // NOTE: Ongoing airing calendars are strictly excluded from season debut classification.
  const allSummer2026Ids = useMemo(() => {
    const combined = new Set<number>(jikanSummer2026Ids);
    for (const id of fallbackSummer2026Ids) {
      combined.add(id);
    }
    return combined;
  }, [jikanSummer2026Ids, fallbackSummer2026Ids]);

  // Step 1: Currently Watching items (Independent from Summer 2026 debut classification)
  // An anime is included in Currently Watching when:
  // 1. MAL list_status.status === 'watching'
  // AND
  // 2. It has an active matching entry on the Release Calendar (calendarSummer2026Ids.has(item.node.id))
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

      // 2. Must be actively represented on the Release Calendar
      const isOnReleaseCalendar = calendarSummer2026Ids.has(item.node.id);
      if (!isOnReleaseCalendar) continue;

      if (!seenIds.has(item.node.id)) {
        seenIds.add(item.node.id);
        items.push({
          node: item.node,
          list_status: item.list_status || { status: 'watching', score: 0, num_episodes_watched: 0 },
        });
      }
    }

    return items;
  }, [malList, calendarSummer2026Ids]);

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

  // Complete list of MAL anime classified as Summer 2026 across all statuses (for STATUS seasonal dashboard)
  // Combines currently watching seasonal anime + anime completed in season + other Summer 2026 titles without duplicates
  const summer2026MalList = useMemo(() => {
    const items: MalListItem[] = [];
    const seenIds = new Set<number>();

    // 1. Add all currently watching items
    for (const item of currentlyWatchingItems) {
      if (item?.node?.id && !seenIds.has(item.node.id)) {
        seenIds.add(item.node.id);
        const original = userMalMap.get(item.node.id);
        items.push(original || (item as MalListItem));
      }
    }

    // 2. Add all completed items during the season
    for (const item of completedSummer2026Items) {
      if (item?.node?.id && !seenIds.has(item.node.id)) {
        seenIds.add(item.node.id);
        const original = userMalMap.get(item.node.id);
        items.push(original || (item as MalListItem));
      }
    }

    // 3. Include any other Summer 2026 anime in the user's MAL list (e.g. plan to watch, on hold, dropped)
    for (const item of malList) {
      if (!item?.node?.id) continue;
      if (seenIds.has(item.node.id)) continue;
      const isSummer = isAnimeSummer2026(item.node, allSummer2026Ids);
      if (isSummer) {
        seenIds.add(item.node.id);
        items.push(item);
      }
    }

    return items;
  }, [malList, currentlyWatchingItems, completedSummer2026Items, allSummer2026Ids, userMalMap]);

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

  // Check MAL Auth Status and load catalogues on Mount
  useEffect(() => {
    checkMalConfig();
    checkMalAuth();
    loadJikanSeasonalCatalogue();
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
    <div className="min-h-screen bg-[#F7F5F2] text-[#25242A] font-sans antialiased flex flex-col justify-between">
      {/* MINIMAL TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E7E3DF] shadow-2xs px-4 sm:px-8 py-3">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
          {/* BRAND */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('season')}>
            <span className="text-[#7567C7] text-lg font-bold">✦</span>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#25242A] flex items-center gap-2">
              <span>ANIME TRACKER</span>
              <span className="text-[11px] font-medium text-[#77747D] tracking-wider hidden md:inline-block">
                アニメトラッカー
              </span>
            </h1>
          </div>

          {/* DESKTOP TOP NAV TABS */}
          {malUser && (
            <nav className="hidden md:flex items-center gap-1.5 bg-[#F7F5F2] p-1 rounded-2xl border border-[#E7E3DF]">
              <button
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
                <span>SEASON</span>
              </button>

              <button
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
                <span>RELEASES</span>
              </button>

              <button
                id="status-tab-btn"
                onClick={() => {
                  setActiveTab('status');
                  if (malUser && malList.length === 0 && !malLoading) {
                    fetchMalList();
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'status'
                    ? 'bg-white text-[#7567C7] shadow-2xs'
                    : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                }`}
              >
                <BarChart3 className="h-4 w-4 text-[#6D9B7C]" />
                <span>STATS</span>
              </button>

              <button
                id="gemini-tab-btn"
                onClick={() => {
                  setActiveTab('gemini');
                  if (malUser && malList.length === 0 && !malLoading) {
                    fetchMalList();
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'gemini'
                    ? 'bg-white text-[#7567C7] shadow-2xs border border-[#7567C7]/30'
                    : 'text-[#77747D] hover:text-[#25242A] hover:bg-white/60'
                }`}
              >
                <Sparkles className="h-4 w-4 text-[#C69A55]" />
                <span>✨ GEMINI</span>
              </button>
            </nav>
          )}

          {/* RIGHT ACTION / USER PROFILE */}
          <div className="flex items-center gap-3">
            {malUser ? (
              <div className="flex items-center gap-3 bg-white border border-[#E7E3DF] rounded-xl px-3 py-1.5 shadow-2xs">
                {malUser.picture ? (
                  <img
                    src={malUser.picture}
                    alt={malUser.name}
                    className="w-7 h-7 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-[#F0EDFA] flex items-center justify-center text-[#7567C7] font-bold text-xs">
                    {malUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#25242A] leading-none flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6D9B7C]" />
                    {malUser.name}
                  </div>
                </div>
                <button
                  onClick={handleDisconnectMal}
                  title="Disconnect MyAnimeList"
                  className="ml-1 text-[#77747D] hover:text-[#C77B82] transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
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
          <div className="flex md:hidden items-center gap-1.5 mt-3 pt-2 border-t border-[#E7E3DF] overflow-x-auto">
            <button
              onClick={() => setActiveTab('season')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all duration-200 ${
                activeTab === 'season' ? 'bg-[#F0EDFA] text-[#7567C7]' : 'text-[#77747D]'
              }`}
            >
              SEASON
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
          />
        )}

        {/* LOGGED IN EXPERIENCE: TRACKER DASHBOARD */}
        {malUser && activeTab === 'mal' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white border border-[#E7E3DF] rounded-2xl p-6 shadow-2xs gap-4">
              <div className="flex items-center gap-4">
                {malUser.picture ? (
                  <img
                    src={malUser.picture}
                    alt={malUser.name}
                    className="w-12 h-12 rounded-xl object-cover border border-[#E7E3DF]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#F0EDFA] flex items-center justify-center text-[#7567C7] font-bold text-lg">
                    {malUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#25242A]">
                    MY LIST
                  </h3>
                  <p className="text-xs text-[#77747D] mt-0.5">
                    {malList.length} anime series retrieved from MyAnimeList
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchMalList}
                  disabled={malLoading}
                  className="p-2.5 rounded-xl border border-[#E7E3DF] hover:bg-[#F7F5F2] text-[#25242A] transition-colors cursor-pointer shadow-2xs"
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

            {/* Filter Controls with Secondary Segmented Control System */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-[#E7E3DF] rounded-2xl p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs font-bold text-[#77747D] tracking-wider uppercase flex items-center gap-1.5 shrink-0 px-1">
                  <Filter className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Status:</span>
                </span>
                <div className="flex flex-wrap items-center gap-1 bg-[#F7F5F2] p-1 rounded-xl border border-[#E7E3DF]">
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
                          ? 'bg-white text-[#7567C7] font-semibold shadow-2xs'
                          : 'text-[#77747D] hover:text-[#25242A]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 self-end lg:self-auto">
                <label htmlFor="mal-sort-option" className="text-xs font-bold text-[#77747D] tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Sort:</span>
                </label>
                <div className="relative inline-block w-48">
                  <select
                    id="mal-sort-option"
                    value={malSortOption}
                    onChange={(e) => setMalSortOption(e.target.value)}
                    className="w-full appearance-none bg-[#F7F5F2] hover:bg-white border border-[#E7E3DF] text-[#25242A] text-xs font-medium rounded-xl py-2 pl-3 pr-8 shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#7567C7] transition-all cursor-pointer"
                  >
                    <option value="title_asc">A to Z</option>
                    <option value="title_desc">Z to A</option>
                    <option value="score_desc">Score (Highest to Lowest)</option>
                    <option value="score_asc">Score (Lowest to Highest)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-[#77747D]">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Anime Cards Grid */}
            {!malLoading && filteredMalList.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {filteredMalList.map((item, index) => (
                  <MalAnimeCard key={item.node.id} item={item} index={index} />
                ))}
              </div>
            )}

            {!malLoading && filteredMalList.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E7E3DF]">
                <p className="text-[#77747D] font-medium text-sm">
                  No anime found in status "{malFilterStatus.replace(/_/g, ' ')}".
                </p>
              </div>
            )}
          </div>
        )}

        {/* LOGGED IN TAB 2: MY SEASON */}
        {malUser && activeTab === 'season' && (
          <div className="space-y-8">
            {/* Header Banner */}
            <div className="bg-white border border-[#E7E3DF] rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0EDFA] text-[#7567C7] text-xs font-bold tracking-widest uppercase mb-2">
                    <Sun className="h-3.5 w-3.5 text-[#C69A55]" />
                    <span>SUMMER 2026</span>
                  </div>
                  <h2 className="text-3xl font-bold text-[#25242A]">
                    Your season, at a glance.
                  </h2>
                  <p className="text-sm text-[#77747D] mt-1">
                    Everything you're watching and completing this season.
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (malUser) fetchMalList();
                    loadJikanSeasonalCatalogue();
                    fetchSeasonalList(2026, 'summer');
                    loadCalendarSeasonalReleases();
                  }}
                  disabled={seasonalLoading || malLoading || jikanSeasonLoading}
                  className="px-4 py-2 rounded-xl bg-white border border-[#E7E3DF] hover:bg-slate-50 text-[#25242A] font-medium text-xs transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${seasonalLoading || malLoading || jikanSeasonLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh Data</span>
                </button>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#E7E3DF]">
                <div>
                  <div className="text-2xl font-bold text-[#25242A]">{currentlyWatchingItems.length}</div>
                  <div className="text-xs font-semibold text-[#77747D] uppercase tracking-wider">WATCHING</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#25242A]">{completedSummer2026Items.length}</div>
                  <div className="text-xs font-semibold text-[#77747D] uppercase tracking-wider">COMPLETED</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#25242A]">
                    {malList.length > 0
                      ? (malList.reduce((acc, curr) => acc + (curr.list_status?.score || 0), 0) / (malList.filter(i => i.list_status?.score > 0).length || 1)).toFixed(1)
                      : '—'}
                  </div>
                  <div className="text-xs font-semibold text-[#77747D] uppercase tracking-wider">AVG SCORE</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#25242A]">{allSummer2026Ids.size}</div>
                  <div className="text-xs font-semibold text-[#77747D] uppercase tracking-wider">SEASON RELEASES</div>
                </div>
              </div>
            </div>

            {/* CURRENTLY WATCHING */}
            <SeasonTable
              title="Currently Watching"
              subtitle="Anime from your MyAnimeList account that are airing in Summer 2026."
              icon={<PlayCircle className="h-5 w-5 text-[#6D9B7C]" />}
              items={currentlyWatchingItems}
              badgeText="Watching"
              badgeBg="bg-[#F0EDFA]"
              badgeTextClass="text-[#7567C7]"
              customUserNotes={customUserNotes}
              onSaveCustomNote={handleSaveCustomNote}
            />

            {/* COMPLETED DURING SUMMER 2026 */}
            <SeasonTable
              title="Completed During Summer 2026"
              subtitle="Anime completed during the Summer 2026 season."
              icon={<CheckCircle2 className="h-5 w-5 text-[#7567C7]" />}
              items={completedSummer2026Items}
              badgeText="Completed in Season"
              badgeBg="bg-[#F0EDFA]"
              badgeTextClass="text-[#7567C7]"
              customUserNotes={customUserNotes}
              onSaveCustomNote={handleSaveCustomNote}
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
            />
          </div>
        )}

        {/* LOGGED IN TAB 4: STATISTICS */}
        {malUser && activeTab === 'status' && (
          <div>
            <StatusDashboard
              malList={malList}
              summer2026List={summer2026MalList}
              watchingSummer2026List={currentlyWatchingItems}
              currentSeasonName="SUMMER 2026"
              earliestAiringDate={earliestSummer2026AiringDate}
              malUser={malUser}
              malLoading={malLoading}
              malError={malError}
              onConnectMal={handleConnectMal}
              onRefreshMal={fetchMalList}
            />
          </div>
        )}

        {/* LOGGED IN TAB 5: AI INSIGHTS */}
        {malUser && activeTab === 'gemini' && (
          <div>
            <GeminiInsightsView
              malList={malList}
              summer2026List={summer2026MalList}
              watchingSummer2026List={currentlyWatchingItems}
              currentSeasonName="SUMMER 2026"
              malUser={malUser}
              malLoading={malLoading}
              onConnectMal={handleConnectMal}
            />
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full bg-white border-t border-[#E7E3DF] py-6 px-4 sm:px-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-[#77747D] gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#7567C7] font-bold">✦ ANIME TRACKER</span>
            <span>•</span>
            <span>Personal Japanese Editorial Tracker</span>
          </div>
          <div>DATA SYNCED WITH MYANIMELIST & JIKAN API</div>
        </div>
      </footer>
    </div>
  );
}
