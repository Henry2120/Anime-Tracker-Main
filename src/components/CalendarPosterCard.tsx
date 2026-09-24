import React from 'react';
import { Clock, Film } from 'lucide-react';
import type { ReleaseCalendarItem } from '../types';
import { getAnimeDisplayTitle } from '../utils/calendarUtils';

interface CalendarPosterCardProps {
  item: ReleaseCalendarItem;
  showTime: boolean;
  showTitle: boolean;
  showEpisode: boolean;
  showStudio: boolean;
  onOpenModal: (item: ReleaseCalendarItem) => void;
}

export const CalendarPosterCard = React.memo(function CalendarPosterCard({
  item,
  showTime,
  showTitle,
  showEpisode,
  showStudio,
  onOpenModal,
}: CalendarPosterCardProps) {
  const titleToDisplay = item.displayTitle || getAnimeDisplayTitle(item.title);

  return (
    <div
      onClick={() => onOpenModal(item)}
      className={`relative group w-full aspect-[3/4.5] overflow-hidden bg-slate-900 transition-all duration-200 cursor-pointer select-none ${
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
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
          <Film className="h-8 w-8" />
        </div>
      )}

      {/* Release Time Pill + UPCOMING Badge (Top Overlay - independently positioned) */}
      <div className="absolute top-0 inset-x-0 z-10 p-2 sm:p-2.5 flex items-center justify-between gap-1.5 pointer-events-none">
        {showTime && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/85 text-white text-[11px] sm:text-xs font-black tracking-tight backdrop-blur-xs shadow-md border border-white/10">
            <Clock className="h-3 w-3 text-indigo-400" />
            {item.formattedTime}
          </span>
        )}

        {item.isUpcoming && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-400 text-indigo-950 text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-md backdrop-blur-xs border border-amber-300 ml-auto">
            UPCOMING
          </span>
        )}
      </div>

      {/* Gradient Overlay & Metadata (Lower Portion - independently anchored to bottom) */}
      <div
        className={`absolute bottom-0 inset-x-0 z-10 pt-16 pb-3 sm:pb-3.5 px-3 sm:px-3.5 bg-gradient-to-t ${
          item.isWatching
            ? 'from-black via-black/90 via-55%'
            : 'from-black via-black/85 via-50%'
        } to-transparent flex flex-col justify-end pointer-events-none`}
      >
        {/* Title: English when available, Japanese/Native fallback, Large, Bold, White */}
        {showTitle && (
          <h4
            title={titleToDisplay}
            className={`text-xs sm:text-[13.5px] md:text-sm font-black leading-snug line-clamp-2 mb-1.5 drop-shadow-md transition-colors ${
              item.isWatching
                ? 'text-white group-hover:text-emerald-300'
                : 'text-white group-hover:text-indigo-300'
            }`}
          >
            {titleToDisplay}
          </h4>
        )}

        {/* Episode Info + Optional Countdown */}
        {(showEpisode || (item.isUpcoming && item.countdown)) && (
          <div className="text-[11px] sm:text-xs font-extrabold leading-tight flex items-center justify-between gap-1">
            {showEpisode && (
              <span className={item.isWatching ? 'text-emerald-300' : 'text-indigo-300'}>
                {item.episode !== null ? `Episode ${item.episode}` : 'New Episode'}
              </span>
            )}
            {item.isUpcoming && item.countdown && (
              <span className="text-[10px] sm:text-[11px] font-bold text-amber-300/90 truncate ml-auto">
                {item.countdown}
              </span>
            )}
          </div>
        )}

        {/* Studio Info (Subtle) */}
        {showStudio && item.studio && (
          <div
            title={`Studio: ${item.studio}`}
            className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate mt-0.5"
          >
            {item.studio}
          </div>
        )}
      </div>
    </div>
  );
});
