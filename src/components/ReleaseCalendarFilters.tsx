import React, { useState, useRef, useEffect } from 'react';
import {
  Filter,
  Search,
  X,
  Star,
  LayoutGrid,
  ChevronDown,
  RotateCcw,
  Check,
  Calendar,
  Languages,
  Clock9,
} from 'lucide-react';

interface ReleaseCalendarFiltersProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  watchingOnly: boolean;
  onSelectWatchingOnly: (watchingOnly: boolean) => void;
  hideWithoutEnglishTitle: boolean;
  onToggleHideWithoutEnglishTitle: (hide: boolean) => void;
  hideLongRunning: boolean;
  onToggleHideLongRunning: (hide: boolean) => void;
  showOnlyToday: boolean;
  onToggleShowOnlyToday: (showToday: boolean) => void;
  totalReleases: number;
  watchingCount: number;
  filteredCount: number;
  isLoggedIn: boolean;
}

export function ReleaseCalendarFilters({
  searchTerm,
  onSearchTermChange,
  watchingOnly,
  onSelectWatchingOnly,
  hideWithoutEnglishTitle,
  onToggleHideWithoutEnglishTitle,
  hideLongRunning,
  onToggleHideLongRunning,
  showOnlyToday,
  onToggleShowOnlyToday,
  totalReleases,
  watchingCount,
  filteredCount,
  isLoggedIn,
}: ReleaseCalendarFiltersProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Count user-selected active filters (distinguishing user-selected filters from default content filters)
  const userActiveFiltersCount =
    (watchingOnly ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0) +
    (showOnlyToday ? 1 : 0);

  const hasUserActiveFilters = userActiveFiltersCount > 0;

  // Determine if filter settings differ from default configuration
  const isModifiedFromDefault =
    hasUserActiveFilters ||
    !hideWithoutEnglishTitle ||
    !hideLongRunning;

  // Handle clicking outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleClearFilters = () => {
    onSearchTermChange('');
    onSelectWatchingOnly(false);
    onToggleHideWithoutEnglishTitle(true);
    onToggleHideLongRunning(true);
    onToggleShowOnlyToday(false);
  };

  return (
    <div
      ref={containerRef}
      id="release-calendar-filters-container"
      className="relative z-30"
    >
      {/* Trigger Button & Active Filters Indicator */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          id="calendar-filter-dropdown-btn"
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all select-none cursor-pointer shadow-md ${
            hasUserActiveFilters
              ? 'bg-indigo-600 border border-indigo-400 text-white shadow-indigo-950/50 ring-2 ring-indigo-500/30'
              : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700'
          }`}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          <Filter className={`h-3.5 w-3.5 ${hasUserActiveFilters ? 'text-white' : 'text-indigo-400'}`} />
          <span>Filter</span>

          {/* User-Selected Active Filter Count Marker (e.g. • 1, • 2) */}
          {hasUserActiveFilters && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-white text-indigo-950 text-[10px] font-black leading-none">
              • {userActiveFiltersCount}
            </span>
          )}

          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-white' : 'text-slate-400'
            }`}
          />
        </button>

        {/* Quick Active Status Indicator Tags when closed */}
        {hasUserActiveFilters && !isOpen && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300 bg-slate-900/80 border border-slate-800/80 px-2.5 py-1.5 rounded-xl backdrop-blur-xs">
            <span className="text-[11px] text-slate-400 hidden sm:inline">Active:</span>

            {showOnlyToday && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-md">
                <Calendar className="h-2.5 w-2.5" />
                Today Only
              </span>
            )}

            {watchingOnly && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                Watching Only
              </span>
            )}

            {searchTerm.trim() && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-md max-w-[140px] truncate">
                "{searchTerm.trim()}"
              </span>
            )}

            <span className="text-slate-500 text-[11px] ml-0.5">({filteredCount} releases)</span>
            <button
              type="button"
              onClick={handleClearFilters}
              title="Reset to default filters"
              className="text-slate-400 hover:text-white ml-1 p-0.5 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          id="calendar-filter-dropdown-panel"
          className="absolute left-0 top-full mt-2 w-84 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-900/98 p-3.5 shadow-2xl backdrop-blur-md text-white animate-in fade-in zoom-in-95 duration-150"
        >
          {/* 1. Keyword Search Section */}
          <div className="mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1.5">
              Search
            </span>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                <Search className="h-3.5 w-3.5" />
              </div>
              <input
                ref={searchInputRef}
                id="calendar-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                placeholder="Search anime title or MAL ID..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchTermChange('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="h-px bg-slate-800 mb-3" />

          {/* 2. PERSONAL Section */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1">
              Personal
            </span>

            {/* All Releases Option */}
            <button
              id="filter-opt-all"
              type="button"
              onClick={() => onSelectWatchingOnly(false)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                !watchingOnly
                  ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full flex items-center justify-center border ${
                    !watchingOnly
                      ? 'border-indigo-400 bg-indigo-600 text-white'
                      : 'border-slate-600 bg-slate-950'
                  }`}
                >
                  {!watchingOnly && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-slate-400" />
                  <span>All Releases</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                {totalReleases}
              </span>
            </button>

            {/* Watching Only Option */}
            <button
              id="filter-opt-watching"
              type="button"
              onClick={() => {
                if (isLoggedIn && (watchingCount > 0 || watchingOnly)) {
                  onSelectWatchingOnly(true);
                }
              }}
              disabled={!isLoggedIn || (watchingCount === 0 && !watchingOnly)}
              title={
                !isLoggedIn
                  ? 'Log in to MyAnimeList to filter by watching anime'
                  : watchingCount === 0
                  ? 'No anime in your MAL Watching list are scheduled for this period'
                  : 'Show only anime currently in your MAL Watching list'
              }
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all select-none ${
                watchingOnly
                  ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/40 cursor-pointer'
                  : isLoggedIn && watchingCount > 0
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed opacity-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full flex items-center justify-center border ${
                    watchingOnly
                      ? 'border-emerald-400 bg-emerald-600 text-white'
                      : 'border-slate-600 bg-slate-950'
                  }`}
                >
                  {watchingOnly && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Star
                    className={`h-3.5 w-3.5 ${
                      watchingOnly
                        ? 'text-amber-300 fill-amber-300'
                        : isLoggedIn && watchingCount > 0
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-600'
                    }`}
                  />
                  <span>Watching Only</span>
                </div>
              </div>
              {isLoggedIn ? (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    watchingOnly
                      ? 'text-emerald-300 bg-emerald-950/80 border-emerald-800'
                      : 'text-slate-400 bg-slate-950 border-slate-800'
                  }`}
                >
                  {watchingCount}
                </span>
              ) : (
                <span className="text-[9px] text-slate-500 italic">Requires MAL</span>
              )}
            </button>
          </div>

          <div className="h-px bg-slate-800 mb-3" />

          {/* 3. CONTENT Section */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1">
              Content
            </span>

            {/* Option A: Hide titles without English title */}
            <button
              id="filter-opt-hide-no-english"
              type="button"
              onClick={() => onToggleHideWithoutEnglishTitle(!hideWithoutEnglishTitle)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                hideWithoutEnglishTitle
                  ? 'bg-sky-600/20 text-sky-200 border border-sky-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                    hideWithoutEnglishTitle
                      ? 'border-sky-400 bg-sky-600 text-white'
                      : 'border-slate-600 bg-slate-950'
                  }`}
                >
                  {hideWithoutEnglishTitle && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Languages className={`h-3.5 w-3.5 ${hideWithoutEnglishTitle ? 'text-sky-300' : 'text-slate-400'}`} />
                  <span>Hide titles without English title</span>
                </div>
              </div>
            </button>

            {/* Option B: Hide long-running anime */}
            <button
              id="filter-opt-hide-long-running"
              type="button"
              onClick={() => onToggleHideLongRunning(!hideLongRunning)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                hideLongRunning
                  ? 'bg-amber-600/20 text-amber-200 border border-amber-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                    hideLongRunning
                      ? 'border-amber-400 bg-amber-600 text-white'
                      : 'border-slate-600 bg-slate-950'
                  }`}
                >
                  {hideLongRunning && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock9 className={`h-3.5 w-3.5 ${hideLongRunning ? 'text-amber-300' : 'text-slate-400'}`} />
                  <span>Hide long-running anime</span>
                </div>
              </div>
            </button>
          </div>

          <div className="h-px bg-slate-800 mb-3" />

          {/* 4. DISPLAY Section */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1 mb-1">
              Display
            </span>

            {/* Option: Show Only Today */}
            <button
              id="filter-opt-show-today"
              type="button"
              onClick={() => onToggleShowOnlyToday(!showOnlyToday)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                showOnlyToday
                  ? 'bg-cyan-600/20 text-cyan-200 border border-cyan-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                    showOnlyToday
                      ? 'border-cyan-400 bg-cyan-600 text-white'
                      : 'border-slate-600 bg-slate-950'
                  }`}
                >
                  {showOnlyToday && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className={`h-3.5 w-3.5 ${showOnlyToday ? 'text-cyan-300' : 'text-slate-400'}`} />
                  <span>Show Only Today</span>
                </div>
              </div>
            </button>
          </div>

          {/* 5. Footer / Status & Clear Button */}
          <div className="h-px bg-slate-800 mb-2.5" />
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-slate-400">
              <strong className="text-white">{filteredCount}</strong> matching releases
            </span>

            {isModifiedFromDefault && (
              <button
                id="calendar-clear-filters-btn"
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 px-2 py-1 rounded transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Defaults</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
