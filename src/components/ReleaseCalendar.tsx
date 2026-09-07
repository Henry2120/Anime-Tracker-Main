import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Clock,
  AlertCircle,
  RefreshCw,
  Loader2,
  Film,
  CalendarDays,
  Star,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type { MalListItem, ReleaseCalendarItem } from '../types';
import { ReleaseCalendarFilters } from './ReleaseCalendarFilters';
import { TodayReleaseView } from './TodayReleaseView';
import { AnimeDetailModal, AnimeDetailData } from './AnimeDetailModal';
import { decodeHtmlEntities } from '../utils/htmlUtils';
import {
  TIMEZONE_OPTIONS,
  getResolvedTimezone,
  getWeekScheduleSlots,
  getTodayScheduleSlot,
  populateDaySchedules,
  getAnimeDisplayTitle,
  filterCalendarItems,
  getUpcomingCountdown,
} from '../utils/calendarUtils';

interface ReleaseCalendarProps {
  malList: MalListItem[];
  malLoading: boolean;
  onCalendarItemsLoaded?: (malIds: number[]) => void;
  customUserNotes?: Record<number, string>;
  onSaveCustomNote?: (animeId: number, note: string) => void;
  onOpenMalEditor?: (anime: AnimeDetailData) => void;
}

export function ReleaseCalendar({
  malList,
  malLoading,
  onCalendarItemsLoaded,
  customUserNotes = {},
  onSaveCustomNote,
  onOpenMalEditor,
}: ReleaseCalendarProps) {
  const shouldReduceMotion = useReducedMotion();

  // Calendar View & Navigation State
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Asia/Tokyo');

  // Filter States (Default content cleaning filters ON)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [watchingOnly, setWatchingOnly] = useState<boolean>(false);
  const [hideWithoutEnglishTitle, setHideWithoutEnglishTitle] = useState<boolean>(true);
  const [hideLongRunning, setHideLongRunning] = useState<boolean>(true);
  const [showOnlyToday, setShowOnlyToday] = useState<boolean>(false);

  // Modal State
  const [selectedAnimeForModal, setSelectedAnimeForModal] = useState<AnimeDetailData | null>(null);

  // Data & Fetch State
  const [rawItems, setRawItems] = useState<ReleaseCalendarItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Live reference timestamp (updates periodically so upcoming transitions naturally)
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Compute target week slots & query parameters
  const weekInfo = useMemo(() => {
    return getWeekScheduleSlots(currentTime, selectedTimezone, weekOffset);
  }, [currentTime, selectedTimezone, weekOffset]);

  // Set of user's MAL anime IDs with status === 'watching'
  const watchingMalIds = useMemo(() => {
    const ids = new Set<number>();
    if (!Array.isArray(malList)) return ids;
    for (const item of malList) {
      if (item?.list_status?.status === 'watching' && item.node?.id) {
        ids.add(Number(item.node.id));
      }
    }
    return ids;
  }, [malList]);

  // Fetch release schedule from backend endpoint covering week + today buffer
  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const todayStartSec = Math.floor((Date.now() - 86400000 * 2) / 1000);
      const todayEndSec = Math.floor((Date.now() + 86400000 * 2) / 1000);
      const queryStartSec = Math.min(weekInfo.fetchStartSec, todayStartSec);
      const queryEndSec = Math.max(weekInfo.fetchEndSec, todayEndSec);

      const res = await fetch(
        `/api/release-calendar?start=${queryStartSec}&end=${queryEndSec}`
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Server responded with status ${res.status}`
        );
      }

      const data = await res.json();
      const items: ReleaseCalendarItem[] = Array.isArray(data.data) ? data.data : [];
      setRawItems(items);

      if (onCalendarItemsLoaded && items.length > 0) {
        const malIds = items
          .map((i) => (i.malId ? Number(i.malId) : null))
          .filter((id): id is number => typeof id === 'number' && !isNaN(id) && id > 0);
        if (malIds.length > 0) {
          onCalendarItemsLoaded(malIds);
        }
      }
    } catch (err: any) {
      console.error('Failed to load release calendar:', err);
      setError(err.message || 'Unable to load the release schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [weekInfo, onCalendarItemsLoaded]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // 1. Compute 7 Days of the Week
  const populatedDays = useMemo(() => {
    return populateDaySchedules(
      rawItems,
      weekInfo.days,
      selectedTimezone,
      watchingMalIds,
      currentTime
    );
  }, [rawItems, weekInfo.days, selectedTimezone, watchingMalIds, currentTime]);

  // Derived week days based on Personal, Content & Search filters
  const displayedDays = useMemo(() => {
    const isFiltering =
      watchingOnly ||
      hideWithoutEnglishTitle ||
      hideLongRunning ||
      Boolean(searchTerm.trim());

    if (!isFiltering) return populatedDays;

    return populatedDays.map((day) => ({
      ...day,
      items: filterCalendarItems(day.items, {
        watchingOnly,
        hideWithoutEnglishTitle,
        hideLongRunning,
        searchTerm,
      }),
    }));
  }, [populatedDays, watchingOnly, hideWithoutEnglishTitle, hideLongRunning, searchTerm]);

  // 2. Compute Single-Day Slot for Today in the active timezone
  const todaySlot = useMemo(() => {
    return getTodayScheduleSlot(currentTime, selectedTimezone);
  }, [currentTime, selectedTimezone]);

  const populatedTodayDay = useMemo(() => {
    const [day] = populateDaySchedules(
      rawItems,
      [todaySlot],
      selectedTimezone,
      watchingMalIds,
      currentTime
    );
    return day || todaySlot;
  }, [rawItems, todaySlot, selectedTimezone, watchingMalIds, currentTime]);

  const displayedTodayItems = useMemo(() => {
    return filterCalendarItems(populatedTodayDay.items, {
      watchingOnly,
      hideWithoutEnglishTitle,
      hideLongRunning,
      searchTerm,
    });
  }, [populatedTodayDay, watchingOnly, hideWithoutEnglishTitle, hideLongRunning, searchTerm]);

  // Identify ONLY the single nearest upcoming anime release across the currently displayed calendar schedule (Week View)
  const nearestWeeklyUpcomingKey = useMemo(() => {
    let minAiringAt = Infinity;
    let nearestKey: string | null = null;

    for (const day of displayedDays) {
      for (const item of day.items) {
        if (item.airingAt && typeof item.airingAt === 'number') {
          const airingMs = item.airingAt * 1000;
          if (airingMs > currentTime && item.airingAt < minAiringAt) {
            minAiringAt = item.airingAt;
            nearestKey = `${item.id}-${item.airingAt}`;
          }
        }
      }
    }

    return nearestKey;
  }, [displayedDays, currentTime]);

  const displayedDaysWithUpcoming = useMemo(() => {
    return displayedDays.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const itemKey = `${item.id}-${item.airingAt}`;
        const isNearest = itemKey === nearestWeeklyUpcomingKey;
        return {
          ...item,
          isUpcoming: isNearest,
          countdown: isNearest ? getUpcomingCountdown(item.airingAt, currentTime) : null,
        };
      }),
    }));
  }, [displayedDays, nearestWeeklyUpcomingKey, currentTime]);

  // Identify ONLY the single nearest upcoming anime release for Today View
  const nearestTodayUpcomingKey = useMemo(() => {
    let minAiringAt = Infinity;
    let nearestKey: string | null = null;

    for (const item of displayedTodayItems) {
      if (item.airingAt && typeof item.airingAt === 'number') {
        const airingMs = item.airingAt * 1000;
        if (airingMs > currentTime && item.airingAt < minAiringAt) {
          minAiringAt = item.airingAt;
          nearestKey = `${item.id}-${item.airingAt}`;
        }
      }
    }

    return nearestKey;
  }, [displayedTodayItems, currentTime]);

  const displayedTodayItemsWithUpcoming = useMemo(() => {
    return displayedTodayItems.map((item) => {
      const itemKey = `${item.id}-${item.airingAt}`;
      const isNearest = itemKey === nearestTodayUpcomingKey;
      return {
        ...item,
        isUpcoming: isNearest,
        countdown: isNearest ? getUpcomingCountdown(item.airingAt, currentTime) : null,
      };
    });
  }, [displayedTodayItems, nearestTodayUpcomingKey, currentTime]);

  // Check today's date key in the active timezone
  const todayDateKey = useMemo(() => {
    const tz = getResolvedTimezone(selectedTimezone);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const m: Record<string, string> = {};
    for (const p of parts) m[p.type] = p.value;
    return `${m.year}-${m.month}-${m.day}`;
  }, [selectedTimezone]);

  // Statistics
  const totalWeeklyReleases = useMemo(() => {
    return populatedDays.reduce((acc, day) => acc + day.items.length, 0);
  }, [populatedDays]);

  const totalWeeklyWatchingReleases = useMemo(() => {
    return populatedDays.reduce(
      (acc, day) => acc + day.items.filter((item) => item.isWatching).length,
      0
    );
  }, [populatedDays]);

  const totalWeeklyFilteredReleases = useMemo(() => {
    return displayedDays.reduce((acc, day) => acc + day.items.length, 0);
  }, [displayedDays]);

  const totalTodayReleases = useMemo(() => {
    return populatedTodayDay.items.length;
  }, [populatedTodayDay]);

  const totalTodayWatchingReleases = useMemo(() => {
    return populatedTodayDay.items.filter((item) => item.isWatching).length;
  }, [populatedTodayDay]);

  const activeReleasesCount = showOnlyToday ? totalTodayReleases : totalWeeklyReleases;
  const activeWatchingCount = showOnlyToday ? totalTodayWatchingReleases : totalWeeklyWatchingReleases;
  const activeFilteredCount = showOnlyToday ? displayedTodayItems.length : totalWeeklyFilteredReleases;

  // Compute Busiest Day of the target week
  const busiestDayInfo = useMemo(() => {
    if (!displayedDays || displayedDays.length === 0) return null;
    let maxDay = displayedDays[0];
    for (const day of displayedDays) {
      if (day.items.length > maxDay.items.length) {
        maxDay = day;
      }
    }
    if (!maxDay || maxDay.items.length === 0) return null;
    return {
      weekday: maxDay.weekday,
      dayNum: maxDay.dayNum,
      monthName: maxDay.monthName,
      count: maxDay.items.length,
    };
  }, [displayedDays]);

  const handleOpenModal = useCallback((item: ReleaseCalendarItem) => {
    const matchedMal = malList.find((m) => m.node.id === Number(item.malId));
    const modalData: AnimeDetailData = {
      id: item.id,
      malId: item.malId ? Number(item.malId) : null,
      title: item.title.english || item.title.romaji || item.title.native || 'Anime Details',
      titleEnglish: item.title.english,
      titleNative: item.title.native,
      titleRomaji: item.title.romaji,
      imageUrl: item.imageUrl || matchedMal?.node.main_picture?.large || matchedMal?.node.main_picture?.medium,
      score: matchedMal?.node.mean,
      userScore: matchedMal?.list_status?.score,
      episodes: item.totalEpisodes || matchedMal?.node.num_episodes,
      episodesWatched: matchedMal?.list_status?.num_episodes_watched,
      status: matchedMal?.list_status?.status || (item.isUpcoming ? 'currently_airing' : 'currently_airing'),
      mediaType: item.format || matchedMal?.node.media_type,
      startDate: matchedMal?.node.start_date,
      endDate: matchedMal?.node.end_date,
      broadcast: matchedMal?.node.broadcast,
      season: matchedMal?.node.start_season,
      studio: item.studio,
      source: matchedMal?.node.source,
      genres: matchedMal?.node.genres,
      synopsis: matchedMal?.node.synopsis,
      comment: matchedMal?.list_status?.comments ? decodeHtmlEntities(matchedMal.list_status.comments) : undefined,
      finishDate: matchedMal?.list_status?.finish_date,
    };
    setSelectedAnimeForModal(modalData);
  }, [malList]);

  // Calculate maximum number of releases on any single day to construct aligned rows
  const maxRows = useMemo(() => {
    const counts = displayedDays.map((d) => d.items.length);
    return Math.max(...counts, 0);
  }, [displayedDays]);

  const rowIndices = useMemo(() => {
    return Array.from({ length: maxRows }, (_, i) => i);
  }, [maxRows]);

  const selectedTzLabel = useMemo(() => {
    const opt = TIMEZONE_OPTIONS.find((t) => t.id === selectedTimezone);
    return opt ? opt.label : getResolvedTimezone(selectedTimezone);
  }, [selectedTimezone]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setWatchingOnly(false);
    setHideWithoutEnglishTitle(true);
    setHideLongRunning(true);
    setShowOnlyToday(false);
  };

  return (
    <div className="w-full space-y-6">
      {/* PAGE HEADER */}
      <div className="bg-white border border-[#E7E3DF] rounded-2xl p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0EDFA] text-[#7567C7] text-xs font-bold tracking-widest uppercase mb-2">
            <CalendarDays className="h-3.5 w-3.5 text-[#7567C7]" />
            <span>AIRING SCHEDULE</span>
          </div>
          <h2 className="text-3xl font-bold text-[#25242A]">
            RELEASES
          </h2>
          <p className="text-sm text-[#77747D] mt-1">
            Weekly broadcast schedule and episode release times.
          </p>
        </div>
      </div>

      {/* Calendar Controls & Navigation Bar */}
      <div className="bg-white border border-[#E7E3DF] rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 text-[#25242A]">
        {/* Week Navigation Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-xl bg-[#F7F5F2] p-1 border border-[#E7E3DF]">
            <button
              id="cal-prev-week-btn"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              title="Previous Week"
              className="p-1.5 rounded-lg hover:bg-white text-[#77747D] hover:text-[#25242A] transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="px-3 py-1 text-center min-w-[150px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7567C7] block leading-tight">
                {showOnlyToday ? 'Target Week' : 'Week'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#25242A]">
                {weekInfo.weekLabel}
              </span>
            </div>

            <button
              id="cal-next-week-btn"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              title="Next Week"
              className="p-1.5 rounded-lg hover:bg-white text-[#77747D] hover:text-[#25242A] transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {weekOffset !== 0 && (
            <button
              id="cal-current-week-btn"
              onClick={() => setWeekOffset(0)}
              className="bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Current Week</span>
            </button>
          )}

          {showOnlyToday && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 text-[#7567C7] text-xs font-semibold">
              <Calendar className="h-3.5 w-3.5" />
              <span>Showing Today</span>
            </div>
          )}
        </div>

        {/* Timezone Selector & Quick Stats */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Timezone Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#F7F5F2] border border-[#E7E3DF] rounded-xl px-3 py-1.5">
            <Globe className="h-3.5 w-3.5 text-[#7567C7] shrink-0" />
            <label
              htmlFor="timezone-select"
              className="text-[10px] font-bold uppercase text-[#77747D] hidden sm:inline"
            >
              TZ:
            </label>
            <select
              id="timezone-select"
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#25242A] focus:outline-none cursor-pointer pr-1"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.id} value={tz.id} className="bg-white text-[#25242A]">
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Total Releases Count Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] text-xs font-semibold text-[#77747D]">
            <Film className="h-3.5 w-3.5 text-[#7567C7]" />
            <span>
              <strong className="text-[#25242A]">{activeReleasesCount}</strong> {showOnlyToday ? 'today' : 'releases'}
            </span>
          </div>

          {/* User Watching Filter Toggle Button */}
          <button
            id="cal-watching-filter-btn"
            type="button"
            onClick={() => {
              if (activeWatchingCount > 0 || watchingOnly) {
                setWatchingOnly((prev) => !prev);
              }
            }}
            disabled={activeWatchingCount === 0 && !watchingOnly}
            title={
              activeWatchingCount === 0
                ? 'No watched anime scheduled for this period'
                : watchingOnly
                ? 'Click to show all releases'
                : 'Click to filter calendar to only your watched anime'
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all select-none ${
              watchingOnly
                ? 'bg-[#6D9B7C] border border-[#6D9B7C] text-white shadow-2xs ring-1 ring-[#6D9B7C]/40 cursor-pointer'
                : activeWatchingCount > 0
                ? 'bg-[#6D9B7C]/15 border border-[#6D9B7C]/30 text-[#6D9B7C] hover:bg-[#6D9B7C]/25 cursor-pointer'
                : 'bg-[#F7F5F2] border border-[#E7E3DF] text-[#77747D]/50 cursor-not-allowed opacity-60'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${watchingOnly ? 'text-[#C69A55] fill-current' : 'text-[#C69A55] fill-current'}`} />
            <span>
              <strong className={watchingOnly ? 'text-white' : 'text-[#25242A]'}>{activeWatchingCount}</strong> Watching
            </span>
            {watchingOnly && (
              <span className="ml-1 px-1.5 py-0.2 rounded-md bg-white/20 text-[10px] uppercase tracking-wider font-bold text-white">
                ONLY
              </span>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchSchedule}
            disabled={loading}
            title="Refresh Schedule"
            className="p-2 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] text-[#77747D] hover:text-[#25242A] hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* COMPACT ANALYTICS SECTION */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Releases Today */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#E7E3DF] flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block mb-0.5">
              Releases Today
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#25242A]">{totalTodayReleases}</span>
              {totalTodayWatchingReleases > 0 && (
                <span className="text-[10px] font-semibold text-[#6D9B7C]">
                  ({totalTodayWatchingReleases} watching)
                </span>
              )}
            </div>
          </div>
          <div className="h-9 w-9 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 flex items-center justify-center text-[#7567C7]">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        {/* Releases This Week */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#E7E3DF] flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block mb-0.5">
              Releases This Week
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#25242A]">{totalWeeklyReleases}</span>
              {searchTerm.trim() || watchingOnly || hideWithoutEnglishTitle || hideLongRunning ? (
                <span className="text-[10px] font-semibold text-[#7567C7]">
                  ({totalWeeklyFilteredReleases} shown)
                </span>
              ) : null}
            </div>
          </div>
          <div className="h-9 w-9 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 flex items-center justify-center text-[#7567C7]">
            <Calendar className="h-4 w-4" />
          </div>
        </div>

        {/* Watching This Week */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#E7E3DF] flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block mb-0.5">
              Watching This Week
            </span>
            <span className="text-xl font-bold text-[#6D9B7C]">{totalWeeklyWatchingReleases}</span>
          </div>
          <div className="h-9 w-9 rounded-xl bg-[#6D9B7C]/15 border border-[#6D9B7C]/30 flex items-center justify-center text-[#6D9B7C]">
            <Star className="h-4 w-4 fill-current" />
          </div>
        </div>

        {/* Busiest Day */}
        <div className="p-3.5 rounded-2xl bg-white border border-[#E7E3DF] flex items-center justify-between shadow-2xs">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block mb-0.5">
              Busiest Day
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#C69A55] truncate block">
              {busiestDayInfo ? `${busiestDayInfo.weekday} (${busiestDayInfo.count} eps)` : 'None'}
            </span>
          </div>
          <div className="h-9 w-9 rounded-xl bg-[#C69A55]/15 border border-[#C69A55]/30 flex items-center justify-center text-[#C69A55] shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* DEDICATED CALENDAR FILTER & DISPLAY CONTROLS */}
      <ReleaseCalendarFilters
        searchTerm={searchTerm}
        onSearchTermChange={(val) => setSearchTerm(val)}
        watchingOnly={watchingOnly}
        onSelectWatchingOnly={(val) => setWatchingOnly(val)}
        hideWithoutEnglishTitle={hideWithoutEnglishTitle}
        onToggleHideWithoutEnglishTitle={(val) => setHideWithoutEnglishTitle(val)}
        hideLongRunning={hideLongRunning}
        onToggleHideLongRunning={(val) => setHideLongRunning(val)}
        showOnlyToday={showOnlyToday}
        onToggleShowOnlyToday={(val) => setShowOnlyToday(val)}
        totalReleases={activeReleasesCount}
        watchingCount={activeWatchingCount}
        filteredCount={activeFilteredCount}
        isLoggedIn={Array.isArray(malList) && malList.length > 0}
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="bg-white border border-[#E7E3DF] rounded-2xl p-16 text-center shadow-2xs">
          <Loader2 className="h-10 w-10 text-[#7567C7] animate-spin mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#25242A] mb-1">
            Loading Airing Schedule...
          </h3>
          <p className="text-xs text-[#77747D]">
            Aligning broadcasts in {getResolvedTimezone(selectedTimezone)}
          </p>
        </div>
      )}

      {/* Error Overlay */}
      {error && !loading && (
        <div className="bg-[#D6A0AF]/15 border border-[#D6A0AF]/40 rounded-2xl p-5 text-[#25242A] shadow-2xs flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#C77B82] shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-sm mb-0.5">Schedule Error</h4>
            <p className="text-xs text-[#77747D] mb-3">{error}</p>
            <button
              onClick={fetchSchedule}
              className="bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold text-xs px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* VIEW RENDER: Either Single-Day Today View OR Continuous 7-Day Wall */}
      {!loading && !error && (
        showOnlyToday ? (
          <TodayReleaseView
            todaySchedule={populatedTodayDay}
            items={displayedTodayItemsWithUpcoming}
            timezoneLabel={selectedTzLabel}
            searchTerm={searchTerm}
            watchingOnly={watchingOnly}
            hideWithoutEnglishTitle={hideWithoutEnglishTitle}
            hideLongRunning={hideLongRunning}
            onClearFilters={handleClearAllFilters}
            onSelectAnime={handleOpenModal}
          />
        ) : (
          <div className="w-full overflow-x-auto pb-4">
            <div className="min-w-[1050px] rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] overflow-hidden shadow-2xs">
              {/* 1. Day Column Headers: Seamless horizontal row */}
              <div className="grid grid-cols-7 divide-x divide-[#E7E3DF] dark:divide-[#2E2C37] bg-[#F7F5F2] dark:bg-[#26252F] border-b border-[#E7E3DF] dark:border-[#2E2C37]">
                {displayedDaysWithUpcoming.map((day) => {
                  const isToday = day.dateKey === todayDateKey;
                  return (
                    <div
                      key={day.dateKey}
                      className={`px-2.5 py-2.5 text-center flex flex-col justify-center transition-colors ${
                        isToday
                          ? 'bg-[#F0EDFA] dark:bg-[#2A2542] text-[#25242A] dark:text-[#F4F2F7]'
                          : 'bg-[#F7F5F2] dark:bg-[#26252F] text-[#25242A] dark:text-[#F4F2F7]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-[11px] font-bold tracking-wider uppercase ${
                            isToday ? 'text-[#C69A55]' : 'text-[#7567C7]'
                          }`}
                        >
                          {day.weekday}
                        </span>

                        {isToday && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#C69A55]/20 text-[#C69A55] border border-[#C69A55]/30 text-[9px] font-bold tracking-wider uppercase">
                            TODAY
                          </span>
                        )}

                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                            isToday
                              ? 'bg-[#7567C7] text-white'
                              : 'bg-white dark:bg-[#1E1D24] text-[#77747D] dark:text-[#9E9AA6] border border-[#E7E3DF] dark:border-[#2E2C37]'
                          }`}
                        >
                          {day.items.length}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-center gap-1.5">
                        <span className="text-base font-bold leading-none text-[#25242A] tracking-tight">
                          {day.dayNum}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#77747D]">
                          {day.monthName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. Aligned Anime Releases Grid (Seamless Continuous Poster Grid) */}
              {maxRows === 0 ? (
                <div className="p-12 text-center text-[#77747D] bg-white dark:bg-[#1E1D24]">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 text-[#77747D]/50" />
                  <p className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] mb-1">
                    {searchTerm.trim()
                      ? `No anime releases found for "${searchTerm.trim()}".`
                      : watchingOnly
                      ? 'No watched anime scheduled to air this week.'
                      : hideWithoutEnglishTitle || hideLongRunning
                      ? 'No anime releases match the current content filters for this week.'
                      : 'No anime releases found for this week.'}
                  </p>
                  {(watchingOnly || searchTerm.trim() || hideWithoutEnglishTitle || hideLongRunning) && (
                    <button
                      onClick={handleClearAllFilters}
                      className="mt-3 bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold text-xs px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-[#181724] dark:bg-[#141318] overflow-hidden">
                  {rowIndices.map((rowIndex) => (
                    <div
                      key={`row-${rowIndex}`}
                      className="grid grid-cols-7 gap-0 p-0 m-0"
                    >
                      {displayedDaysWithUpcoming.map((day, dayIndex) => {
                        const item = day.items[rowIndex];
                        const isToday = day.dateKey === todayDateKey;
                        const titleToDisplay = item
                          ? item.displayTitle || getAnimeDisplayTitle(item.title)
                          : '';

                        if (!item) {
                          // Seamless empty slot to maintain continuous grid without gaps or white boxes
                          return (
                            <div
                              key={`empty-${day.dateKey}-${rowIndex}`}
                              className={`w-full aspect-[3/4.2] ${
                                isToday
                                  ? 'bg-[#211F2F]/80'
                                  : 'bg-[#14131C]/90'
                              } transition-colors`}
                            />
                          );
                        }

                        return (
                          <motion.div
                            key={`${day.dateKey}-${item.id}-${item.airingAt}`}
                            onClick={() => handleOpenModal(item)}
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.15 }}
                            transition={
                              shouldReduceMotion
                                ? { duration: 0 }
                                : {
                                    duration: 0.45,
                                    delay: Math.min((rowIndex * 0.05) + (dayIndex * 0.02), 0.35),
                                    ease: [0.25, 0.1, 0.25, 1.0],
                                  }
                            }
                            className={`relative group w-full aspect-[3/4.2] overflow-hidden bg-slate-900 flex flex-col justify-between transition-all duration-200 cursor-pointer ${
                              item.isWatching
                                ? 'ring-2 ring-inset ring-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.35)] z-10'
                                : 'hover:z-10 hover:ring-1 hover:ring-inset hover:ring-indigo-400/80'
                            }`}
                          >
                            {/* Artwork Background Image (fills 100% of the tile) */}
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={titleToDisplay}
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                                <Film className="h-8 w-8" />
                              </div>
                            )}

                            {/* Release Time Pill + UPCOMING Badge (Top Overlay) */}
                            <div className="relative z-10 p-1.5 sm:p-2 flex flex-wrap items-center justify-between gap-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/85 text-white text-[10px] sm:text-[11px] font-black tracking-tight backdrop-blur-xs shadow-md border border-white/10">
                                <Clock className="h-2.5 w-2.5 text-indigo-400" />
                                {item.formattedTime}
                              </span>

                              {item.isUpcoming && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-400 text-indigo-950 text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-xs border border-amber-300">
                                  UPCOMING
                                </span>
                              )}
                            </div>

                            {/* Gradient Overlay & Metadata (Lower Portion) */}
                            <div
                              className={`relative z-10 pt-12 pb-2.5 px-2.5 bg-gradient-to-t ${
                                item.isWatching
                                  ? 'from-black via-black/90 via-55%'
                                  : 'from-black via-black/85 via-50%'
                              } to-transparent flex flex-col justify-end`}
                            >
                              {/* Title: English when available, Japanese/Native fallback, Large, Bold, White */}
                              <h4
                                title={titleToDisplay}
                                className={`text-xs sm:text-[13px] font-black leading-snug line-clamp-3 mb-1 drop-shadow-md transition-colors ${
                                  item.isWatching
                                    ? 'text-white group-hover:text-emerald-300'
                                    : 'text-white group-hover:text-indigo-300'
                                }`}
                              >
                                {titleToDisplay}
                              </h4>

                              {/* Episode Info + Optional Countdown */}
                              <div className="text-[10px] sm:text-[11px] font-extrabold leading-tight flex items-center justify-between gap-1">
                                <span className={item.isWatching ? 'text-emerald-300' : 'text-indigo-300'}>
                                  {item.episode !== null ? `Episode ${item.episode}` : 'New Episode'}
                                </span>
                                {item.isUpcoming && item.countdown && (
                                  <span className="text-[9px] font-bold text-amber-300/90 truncate">
                                    {item.countdown}
                                  </span>
                                )}
                              </div>

                              {/* Studio Info (Subtle) */}
                              {item.studio && (
                                <div
                                  title={`Studio: ${item.studio}`}
                                  className="text-[9px] sm:text-[10px] text-slate-400 font-medium truncate mt-0.5"
                                >
                                  {item.studio}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Anime Detail Modal */}
      {selectedAnimeForModal && (
        <AnimeDetailModal
          anime={selectedAnimeForModal}
          isOpen={Boolean(selectedAnimeForModal)}
          onClose={() => setSelectedAnimeForModal(null)}
          customNote={selectedAnimeForModal.malId ? customUserNotes[selectedAnimeForModal.malId] : ''}
          onSaveNote={onSaveCustomNote}
          onOpenMalEditor={onOpenMalEditor}
        />
      )}
    </div>
  );
}
