import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Tv, Calendar, ImageOff } from 'lucide-react';
import { MalListItem } from '../types';

interface MalAnimeCardProps {
  item: MalListItem;
  index: number;
}

const statusBadgeStyles: Record<string, { label: string; bg: string; text: string }> = {
  watching: { label: 'Watching', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  completed: { label: 'Completed', bg: 'bg-indigo-100', text: 'text-indigo-800' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-amber-100', text: 'text-amber-800' },
  on_hold: { label: 'On Hold', bg: 'bg-purple-100', text: 'text-purple-800' },
  dropped: { label: 'Dropped', bg: 'bg-rose-100', text: 'text-rose-800' },
};

export const MalAnimeCard: React.FC<MalAnimeCardProps> = ({ item, index }) => {
  const [imageError, setImageError] = useState(false);

  const imageUrl = item.node.main_picture?.large || item.node.main_picture?.medium;
  const statusInfo = statusBadgeStyles[item.list_status.status] || {
    label: item.list_status.status.replace(/_/g, ' '),
    bg: 'bg-slate-100',
    text: 'text-slate-700',
  };

  const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : '?';

  return (
    <motion.div
      id={`mal-card-${item.node.id}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      whileHover={{ y: -4 }}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white p-3 shadow-2xs border border-[#E7E3DF] relative transition-all duration-200 hover:border-[#7567C7] hover:shadow-md"
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#F7F5F2] mb-3">
        {/* Status Badge */}
        <div
          className={`absolute top-2.5 left-2.5 z-10 flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide shadow-2xs ${statusInfo.bg} ${statusInfo.text}`}
        >
          {statusInfo.label}
        </div>

        {/* User Score Badge */}
        {item.list_status.score > 0 ? (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/80 px-2 py-0.5 text-xs font-bold text-[#C69A55] shadow-2xs backdrop-blur-md">
            <Star className="h-3 w-3 fill-current text-[#C69A55]" />
            <span>{item.list_status.score}/10</span>
          </div>
        ) : (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
            Unrated
          </div>
        )}

        {!imageError && imageUrl ? (
          <img
            src={imageUrl}
            alt={item.node.title}
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#F0EDFA] text-[#7567C7] p-4 text-center">
            <ImageOff className="h-8 w-8 mb-2 stroke-1" />
            <span className="text-xs font-medium">Image unavailable</span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col justify-between px-1 pb-1">
        <div>
          <h3
            className="font-bold text-[#25242A] text-sm leading-snug line-clamp-2 group-hover:text-[#7567C7] transition-colors"
            title={item.node.title}
          >
            {item.node.title}
          </h3>
        </div>

        <div className="mt-3 space-y-2 border-t border-[#E7E3DF] pt-2 text-xs">
          {/* Episode Progress */}
          <div className="flex items-center justify-between text-[#77747D]">
            <div className="flex items-center gap-1.5 font-medium text-[11px]">
              <Tv className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Progress:</span>
            </div>
            <span className="font-semibold text-[#25242A]">
              {item.list_status.num_episodes_watched} / {totalEps} eps
            </span>
          </div>

          {/* Start / Finish Dates if available */}
          {(item.list_status.start_date || item.list_status.finish_date) && (
            <div className="flex flex-col gap-0.5 pt-1 text-[10px] text-slate-400 font-medium">
              {item.list_status.start_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span>Start: {item.list_status.start_date}</span>
                </div>
              )}
              {item.list_status.finish_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span>Finish: {item.list_status.finish_date}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
