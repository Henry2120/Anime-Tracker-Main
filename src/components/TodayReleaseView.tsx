import React from 'react';
import {
  Clock,
  Film,
  Calendar,
  Star,
  ExternalLink,
  Sparkles,
  Languages,
  Clock9,
} from 'lucide-react';
import type { DaySchedule, ReleaseCalendarItem } from '../types';
import { getAnimeDisplayTitle } from '../utils/calendarUtils';

interface TodayReleaseViewProps {
  todaySchedule: DaySchedule;
  items: (ReleaseCalendarItem & {
    formattedTime: string;
    isWatching: boolean;
    displayTitle: string;
  })[];
  timezoneLabel: string;
  searchTerm: string;
  watchingOnly: boolean;
  hideWithoutEnglishTitle: boolean;
  hideLongRunning: boolean;
  onClearFilters: () => void;
  onSelectAnime?: (item: ReleaseCalendarItem) => void;
}

export function TodayReleaseView({
  todaySchedule,
  items,
  timezoneLabel,
  searchTerm,
  watchingOnly,
  hideWithoutEnglishTitle,
  hideLongRunning,
  onClearFilters,
  onSelectAnime,
}: TodayReleaseViewProps) {
  const hasActiveFilter = Boolean(
    searchTerm.trim() || watchingOnly || hideWithoutEnglishTitle || hideLongRunning
  );

  return (
    <div id="today-release-view-container" className="w-full space-y-4">
      {/* 1. Dedicated Single-Day Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Day & Date Info */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex flex-col items-center justify-center text-center shadow-inner shrink-0">
              <span className="text-[10px] font-black uppercase text-indigo-300 leading-none">
                {todaySchedule.weekday}
              </span>
              <span className="text-base font-black text-white leading-tight">
                {todaySchedule.dayNum}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {todaySchedule.weekday}, {todaySchedule.dayNum} {todaySchedule.monthName} {todaySchedule.year}
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-indigo-950 text-[10px] font-black tracking-wider uppercase shadow-xs">
                  <Sparkles className="h-3 w-3" />
                  TODAY
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-indigo-400" />
                <span>Times shown in <strong>{timezoneLabel}</strong></span>
              </p>
            </div>
          </div>

          {/* Today Count & Filter Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-xs font-bold text-slate-200">
              <Film className="h-3.5 w-3.5 text-indigo-400" />
              <span>
                <strong className="text-white">{items.length}</strong> {items.length === 1 ? 'Release' : 'Releases'} Today
              </span>
            </div>

            {hideWithoutEnglishTitle && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-950/70 border border-sky-800 text-[11px] font-bold text-sky-300">
                <Languages className="h-3 w-3" />
                English Titles
              </span>
            )}

            {hideLongRunning && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-950/70 border border-amber-800 text-[11px] font-bold text-amber-300">
                <Clock9 className="h-3 w-3" />
                &lt; 27 Eps
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Detailed Single-Day Releases Grid / List */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-12 text-center text-slate-400 shadow-xl">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-600" />
          <h4 className="text-sm sm:text-base font-bold text-white mb-1">
            {searchTerm.trim()
              ? `No anime releases matching "${searchTerm.trim()}" for today.`
              : watchingOnly
              ? 'No watched anime scheduled to air today.'
              : `No anime releases scheduled for today (${todaySchedule.weekday}, ${todaySchedule.dayNum} ${todaySchedule.monthName} ${todaySchedule.year}).`}
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            {hasActiveFilter
              ? 'Try adjusting your content filters or keyword search to see more releases for today.'
              : `Check other days in the weekly calendar or switch timezones (${timezoneLabel}).`}
          </p>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-md"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {items.map((item) => {
            const titleToDisplay = item.displayTitle || getAnimeDisplayTitle(item.title);
            const secondaryTitle =
              item.title?.native && item.title.native !== titleToDisplay
                ? item.title.native
                : item.title?.romaji && item.title.romaji !== titleToDisplay
                ? item.title.romaji
                : null;

            return (
              <div
                key={`today-item-${item.id}-${item.airingAt}`}
                onClick={() => onSelectAnime?.(item)}
                className={`relative rounded-xl overflow-hidden border p-3.5 sm:p-4 flex gap-3.5 transition-all duration-200 cursor-pointer ${
                  item.isWatching
                    ? 'bg-slate-900/95 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/40 hover:ring-2'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-900 shadow-md hover:ring-1 hover:ring-indigo-400/50'
                }`}
              >
                {/* Prominent Large Poster */}
                <div className="w-24 sm:w-28 md:w-32 aspect-[3/4] rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0 shadow-md relative group">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={titleToDisplay}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Film className="h-6 w-6" />
                    </div>
                  )}

                  {/* Watching Badge Overlay on Poster */}
                  {item.isWatching && (
                    <div className="absolute top-1 left-1">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600/95 text-white text-[9px] font-black uppercase tracking-wider shadow-md">
                        <Star className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                        Watching
                      </span>
                    </div>
                  )}
                </div>

                {/* Release Details & Metadata */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    {/* Top Row: Time Pill & Episode Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800/80 text-indigo-200 text-[11px] font-black tracking-tight shadow-xs">
                        <Clock className="h-3 w-3 text-indigo-400" />
                        {item.formattedTime}
                      </span>

                      {/* UPCOMING Badge */}
                      {item.isUpcoming && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-400 text-indigo-950 text-[10px] font-black uppercase tracking-wider shadow-xs border border-amber-300">
                          UPCOMING
                        </span>
                      )}

                      {/* Episode Badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${
                          item.isWatching
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : 'bg-slate-800 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {item.episode !== null ? `Episode ${item.episode}` : 'New Episode'}
                      </span>

                      {/* Countdown Badge if Upcoming */}
                      {item.isUpcoming && item.countdown && (
                        <span className="text-[10px] font-extrabold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/80">
                          {item.countdown}
                        </span>
                      )}

                      {/* Total Episodes (if known) */}
                      {item.totalEpisodes && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.totalEpisodes} eps
                        </span>
                      )}

                      {/* Format Badge (TV, Movie, ONA, etc.) */}
                      {item.format && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.format}
                        </span>
                      )}
                    </div>

                    {/* Anime Title: English when available, Japanese/Native fallback */}
                    <h4
                      title={titleToDisplay}
                      className={`text-sm sm:text-base font-black leading-snug line-clamp-2 transition-colors ${
                        item.isWatching ? 'text-white hover:text-emerald-300' : 'text-white hover:text-indigo-300'
                      }`}
                    >
                      {titleToDisplay}
                    </h4>

                    {/* Secondary Native / Romaji title */}
                    {secondaryTitle && (
                      <p className="text-xs text-slate-400 truncate mt-0.5" title={secondaryTitle}>
                        {secondaryTitle}
                      </p>
                    )}
                  </div>

                  {/* Bottom Row: Studio & External Link */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-800/80">
                    <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                      <Film className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate">{item.studio || 'Studio TBA'}</span>
                    </div>

                    {item.malId && (
                      <a
                        href={`https://myanimelist.net/anime/${item.malId}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline shrink-0"
                      >
                        <span>MAL #{item.malId}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
