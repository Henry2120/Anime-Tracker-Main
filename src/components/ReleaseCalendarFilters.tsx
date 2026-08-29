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
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all select-none cursor-pointer shadow-2xs border ${
            hasUserActiveFilters
              ? 'bg-[#7567C7] border-[#7567C7] text-white'
              : 'bg-white border-[#E7E3DF] text-[#25242A] hover:bg-[#F7F5F2]'
          }`}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          <Filter className={`h-3.5 w-3.5 ${hasUserActiveFilters ? 'text-white' : 'text-[#7567C7]'}`} />
          <span>Filter</span>

          {/* User-Selected Active Filter Count Marker */}
          {hasUserActiveFilters && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-white text-[#7567C7] text-[10px] font-bold leading-none">
              • {userActiveFiltersCount}
            </span>
          )}

          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-current' : 'text-[#77747D]'
            }`}
          />
        </button>

        {/* Quick Active Status Indicator Tags when closed */}
        {hasUserActiveFilters && !isOpen && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#25242A] bg-white border border-[#E7E3DF] px-3 py-1.5 rounded-xl shadow-2xs">
            <span className="text-[11px] text-[#77747D] hidden sm:inline">Active:</span>

            {showOnlyToday && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7567C7] bg-[#F0EDFA] border border-[#7567C7]/20 px-2 py-0.5 rounded-md">
                <Calendar className="h-2.5 w-2.5" />
                Today Only
              </span>
            )}

            {watchingOnly && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6D9B7C] bg-[#6D9B7C]/15 border border-[#6D9B7C]/30 px-2 py-0.5 rounded-md">
                <Star className="h-2.5 w-2.5 fill-current text-[#C69A55]" />
                Watching Only
              </span>
            )}

            {searchTerm.trim() && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7567C7] bg-[#F0EDFA] border border-[#7567C7]/20 px-2 py-0.5 rounded-md max-w-[140px] truncate">
                "{searchTerm.trim()}"
              </span>
            )}

            <span className="text-[#77747D] text-[11px] ml-0.5">({filteredCount} releases)</span>
            <button
              type="button"
              onClick={handleClearFilters}
              title="Reset to default filters"
              className="text-[#77747D] hover:text-[#25242A] ml-1 p-0.5 hover:bg-[#F7F5F2] rounded transition-colors cursor-pointer"
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
          className="absolute left-0 top-full mt-2 w-84 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#E7E3DF] bg-white p-4 shadow-xl text-[#25242A] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* 1. Keyword Search Section */}
          <div className="mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block px-1 mb-1.5">
              Search
            </span>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#77747D]">
                <Search className="h-3.5 w-3.5" />
              </div>
              <input
                ref={searchInputRef}
                id="calendar-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                placeholder="Search anime title or MAL ID..."
                className="w-full bg-[#F7F5F2] border border-[#E7E3DF] rounded-xl pl-8 pr-7 py-2 text-xs text-[#25242A] placeholder-[#77747D] focus:outline-none focus:ring-1 focus:ring-[#7567C7] focus:bg-white transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchTermChange('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-[#77747D] hover:text-[#25242A] transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="h-px bg-[#E7E3DF] mb-3" />

          {/* 2. PERSONAL Section */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block px-1 mb-1">
              Personal
            </span>

            {/* All Releases Option */}
            <button
              id="filter-opt-all"
              type="button"
              onClick={() => onSelectWatchingOnly(false)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
                !watchingOnly
                  ? 'bg-[#F0EDFA] text-[#7567C7] font-semibold border border-[#7567C7]/20'
                  : 'text-[#77747D] hover:bg-[#F7F5F2] hover:text-[#25242A]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full flex items-center justify-center border ${
                    !watchingOnly
                      ? 'border-[#7567C7] bg-[#7567C7] text-white'
                      : 'border-[#E7E3DF] bg-white'
                  }`}
                >
                  {!watchingOnly && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-[#77747D]" />
                  <span>All Releases</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[#77747D] bg-[#F7F5F2] px-1.5 py-0.5 rounded border border-[#E7E3DF]">
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
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all select-none ${
                watchingOnly
                  ? 'bg-[#6D9B7C]/15 text-[#6D9B7C] font-semibold border border-[#6D9B7C]/30 cursor-pointer'
                  : isLoggedIn && watchingCount > 0
                  ? 'text-[#77747D] hover:bg-[#F7F5F2] hover:text-[#25242A] cursor-pointer'
                  : 'text-[#77747D]/50 cursor-not-allowed opacity-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full flex items-center justify-center border ${
                    watchingOnly
                      ? 'border-[#6D9B7C] bg-[#6D9B7C] text-white'
                      : 'border-[#E7E3DF] bg-white'
                  }`}
                >
                  {watchingOnly && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Star
                    className={`h-3.5 w-3.5 ${
                      watchingOnly
                        ? 'text-[#C69A55] fill-current'
                        : isLoggedIn && watchingCount > 0
                        ? 'text-[#C69A55]'
                        : 'text-[#77747D]'
                    }`}
                  />
                  <span>Watching Only</span>
                </div>
              </div>
              {isLoggedIn ? (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    watchingOnly
                      ? 'text-[#6D9B7C] bg-[#6D9B7C]/10 border-[#6D9B7C]/30'
                      : 'text-[#77747D] bg-[#F7F5F2] border-[#E7E3DF]'
                  }`}
                >
                  {watchingCount}
                </span>
              ) : (
                <span className="text-[9px] text-[#77747D] italic">Requires MAL</span>
              )}
            </button>
          </div>

          <div className="h-px bg-[#E7E3DF] mb-3" />

          {/* 3. CONTENT Section */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block px-1 mb-1">
              Content
            </span>

            {/* Option A: Hide titles without English title */}
            <button
              id="filter-opt-hide-no-english"
              type="button"
              onClick={() => onToggleHideWithoutEnglishTitle(!hideWithoutEnglishTitle)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
                hideWithoutEnglishTitle
                  ? 'bg-[#F0EDFA] text-[#7567C7] font-semibold border border-[#7567C7]/20'
                  : 'text-[#77747D] hover:bg-[#F7F5F2] hover:text-[#25242A]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                    hideWithoutEnglishTitle
                      ? 'border-[#7567C7] bg-[#7567C7] text-white'
                      : 'border-[#E7E3DF] bg-white'
                  }`}
                >
                  {hideWithoutEnglishTitle && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Languages className={`h-3.5 w-3.5 ${hideWithoutEnglishTitle ? 'text-[#7567C7]' : 'text-[#77747D]'}`} />
                  <span>Hide titles without English title</span>
                </div>
              </div>
            </button>

            {/* Option B: Hide long-running anime */}
            <button
              id="filter-opt-hide-long-running"
              type="button"
              onClick={() => onToggleHideLongRunning(!hideLongRunning)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
                hideLongRunning
                  ? 'bg-[#C69A55]/15 text-[#C69A55] font-semibold border border-[#C69A55]/30'
                  : 'text-[#77747D] hover:bg-[#F7F5F2] hover:text-[#25242A]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                    hideLongRunning
                      ? 'border-[#C69A55] bg-[#C69A55] text-white'
                      : 'border-[#E7E3DF] bg-white'
                  }`}
                >
                  {hideLongRunning && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock9 className={`h-3.5 w-3.5 ${hideLongRunning ? 'text-[#C69A55]' : 'text-[#77747D]'}`} />
                  <span>Hide long-running anime</span>
                </div>
              </div>
            </button>
          </div>

          <div className="h-px bg-[#E7E3DF] mb-3" />

          {/* 4. DISPLAY Section */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block px-1 mb-1">
              Display
            </span>

            {/* Option: Show Only Today */}
            <button
              id="filter-opt-show-today"
              type="button"
              onClick={() => onToggleShowOnlyToday(!showOnlyToday)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
                showOnlyToday
                  ? 'bg-[#F0EDFA] text-[#7567C7] font-semibold border border-[#7567C7]/20'
                  : 'text-[#77747D] hover:bg-[#F7F5F2] hover:text-[#25242A]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                    showOnlyToday
                      ? 'border-[#7567C7] bg-[#7567C7] text-white'
                      : 'border-[#E7E3DF] bg-white'
                  }`}
                >
                  {showOnlyToday && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className={`h-3.5 w-3.5 ${showOnlyToday ? 'text-[#7567C7]' : 'text-[#77747D]'}`} />
                  <span>Show Only Today</span>
                </div>
              </div>
            </button>
          </div>

          {/* 5. Footer / Status & Clear Button */}
          <div className="h-px bg-[#E7E3DF] mb-2.5" />
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-[#77747D]">
              <strong className="text-[#25242A]">{filteredCount}</strong> matching releases
            </span>

            {isModifiedFromDefault && (
              <button
                id="calendar-clear-filters-btn"
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C77B82] hover:bg-[#D6A0AF]/15 px-2 py-1 rounded-lg transition-colors cursor-pointer"
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
