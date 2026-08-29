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
      <div className="bg-white border border-[#E7E3DF] rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Day & Date Info */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 flex flex-col items-center justify-center text-center shrink-0">
              <span className="text-[10px] font-bold uppercase text-[#7567C7] leading-none">
                {todaySchedule.weekday}
              </span>
              <span className="text-base font-bold text-[#25242A] leading-tight">
                {todaySchedule.dayNum}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base sm:text-lg font-bold text-[#25242A] tracking-tight">
                  {todaySchedule.weekday}, {todaySchedule.dayNum} {todaySchedule.monthName} {todaySchedule.year}
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#C69A55]/15 text-[#C69A55] text-[10px] font-bold tracking-wider uppercase border border-[#C69A55]/30">
                  <Sparkles className="h-3 w-3" />
                  TODAY
                </span>
              </div>
              <p className="text-xs text-[#77747D] flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-[#7567C7]" />
                <span>Times shown in <strong>{timezoneLabel}</strong></span>
              </p>
            </div>
          </div>

          {/* Today Count & Filter Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] text-xs font-semibold text-[#77747D]">
              <Film className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>
                <strong className="text-[#25242A]">{items.length}</strong> {items.length === 1 ? 'Release' : 'Releases'} Today
              </span>
            </div>

            {hideWithoutEnglishTitle && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 text-[11px] font-semibold text-[#7567C7]">
                <Languages className="h-3 w-3" />
                English Titles
              </span>
            )}

            {hideLongRunning && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#C69A55]/15 border border-[#C69A55]/30 text-[11px] font-semibold text-[#C69A55]">
                <Clock9 className="h-3 w-3" />
                &lt; 27 Eps
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Detailed Single-Day Releases Grid / List */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-[#E7E3DF] bg-white p-12 text-center text-[#77747D] shadow-2xs">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-[#77747D]/60" />
          <h4 className="text-sm sm:text-base font-bold text-[#25242A] mb-1">
            {searchTerm.trim()
              ? `No anime releases matching "${searchTerm.trim()}" for today.`
              : watchingOnly
              ? 'No watched anime scheduled to air today.'
              : `No anime releases scheduled for today (${todaySchedule.weekday}, ${todaySchedule.dayNum} ${todaySchedule.monthName} ${todaySchedule.year}).`}
          </h4>
          <p className="text-xs text-[#77747D] max-w-md mx-auto mb-4">
            {hasActiveFilter
              ? 'Try adjusting your content filters or keyword search to see more releases for today.'
              : `Check other days in the weekly calendar or switch timezones (${timezoneLabel}).`}
          </p>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
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
                className={`relative rounded-2xl overflow-hidden border p-3.5 sm:p-4 flex gap-3.5 transition-all duration-200 cursor-pointer ${
                  item.isWatching
                    ? 'bg-white border-[#6D9B7C] shadow-2xs ring-1 ring-[#6D9B7C]/40 hover:ring-2'
                    : 'bg-white border-[#E7E3DF] hover:border-[#7567C7]/40 hover:bg-[#F7F5F2]/40 shadow-2xs'
                }`}
              >
                {/* Prominent Large Poster */}
                <div className="w-24 sm:w-28 md:w-32 aspect-[3/4] rounded-xl overflow-hidden bg-[#F7F5F2] border border-[#E7E3DF] shrink-0 relative group">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={titleToDisplay}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#77747D]">
                      <Film className="h-6 w-6" />
                    </div>
                  )}

                  {/* Watching Badge Overlay on Poster */}
                  {item.isWatching && (
                    <div className="absolute top-1 left-1">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#6D9B7C] text-white text-[9px] font-bold uppercase tracking-wider shadow-2xs">
                        <Star className="h-2.5 w-2.5 fill-current text-[#C69A55]" />
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F0EDFA] border border-[#7567C7]/20 text-[#7567C7] text-[11px] font-bold tracking-tight">
                        <Clock className="h-3 w-3 text-[#7567C7]" />
                        {item.formattedTime}
                      </span>

                      {/* UPCOMING Badge */}
                      {item.isUpcoming && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[#C69A55]/15 text-[#C69A55] text-[10px] font-bold uppercase tracking-wider border border-[#C69A55]/30">
                          UPCOMING
                        </span>
                      )}

                      {/* Episode Badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                          item.isWatching
                            ? 'bg-[#6D9B7C]/15 text-[#6D9B7C] border border-[#6D9B7C]/30'
                            : 'bg-[#F7F5F2] text-[#25242A] border border-[#E7E3DF]'
                        }`}
                      >
                        {item.episode !== null ? `Episode ${item.episode}` : 'New Episode'}
                      </span>

                      {/* Countdown Badge if Upcoming */}
                      {item.isUpcoming && item.countdown && (
                        <span className="text-[10px] font-bold text-[#C69A55] bg-[#C69A55]/10 px-1.5 py-0.5 rounded-lg border border-[#C69A55]/30">
                          {item.countdown}
                        </span>
                      )}

                      {/* Total Episodes (if known) */}
                      {item.totalEpisodes && (
                        <span className="text-[10px] font-medium text-[#77747D] bg-[#F7F5F2] px-1.5 py-0.5 rounded-lg border border-[#E7E3DF]">
                          {item.totalEpisodes} eps
                        </span>
                      )}

                      {/* Format Badge (TV, Movie, ONA, etc.) */}
                      {item.format && (
                        <span className="text-[10px] font-medium text-[#77747D] bg-[#F7F5F2] px-1.5 py-0.5 rounded-lg border border-[#E7E3DF]">
                          {item.format}
                        </span>
                      )}
                    </div>

                    {/* Anime Title */}
                    <h4
                      title={titleToDisplay}
                      className={`text-sm sm:text-base font-bold leading-snug line-clamp-2 transition-colors ${
                        item.isWatching ? 'text-[#25242A] hover:text-[#6D9B7C]' : 'text-[#25242A] hover:text-[#7567C7]'
                      }`}
                    >
                      {titleToDisplay}
                    </h4>

                    {/* Secondary Native / Romaji title */}
                    {secondaryTitle && (
                      <p className="text-xs text-[#77747D] truncate mt-0.5" title={secondaryTitle}>
                        {secondaryTitle}
                      </p>
                    )}
                  </div>

                  {/* Bottom Row: Studio & External Link */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#E7E3DF]">
                    <div className="text-xs text-[#77747D] truncate flex items-center gap-1">
                      <Film className="h-3 w-3 text-[#77747D] shrink-0" />
                      <span className="truncate">{item.studio || 'Studio TBA'}</span>
                    </div>

                    {item.malId && (
                      <a
                        href={`https://myanimelist.net/anime/${item.malId}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7567C7] hover:underline shrink-0"
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
