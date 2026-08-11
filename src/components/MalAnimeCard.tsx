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
      whileHover={{ y: -5 }}
      className="group flex flex-col overflow-hidden rounded-3xl bg-white p-3 shadow-xl border-2 border-indigo-100 relative transition-all duration-300 hover:border-indigo-300"
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-indigo-100 mb-3">
        {/* Status Badge */}
        <div
          className={`absolute top-3 left-3 z-10 flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide shadow-xs ${statusInfo.bg} ${statusInfo.text}`}
        >
          {statusInfo.label}
        </div>

        {/* User Score Badge */}
        {item.list_status.score > 0 ? (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-1 text-xs font-black text-slate-900 shadow-sm">
            <Star className="h-3.5 w-3.5 fill-current text-slate-900" />
            <span>{item.list_status.score}/10</span>
          </div>
        ) : (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
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
          <div className="flex h-full w-full flex-col items-center justify-center bg-indigo-50 text-indigo-300 p-4 text-center">
            <ImageOff className="h-8 w-8 mb-2 stroke-1" />
            <span className="text-xs font-bold">Image unavailable</span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col justify-between px-1 pb-1">
        <div>
          <h3
            className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors"
            title={item.node.title}
          >
            {item.node.title}
          </h3>
        </div>

        <div className="mt-3 space-y-2 border-t border-indigo-50 pt-2.5 text-xs">
          {/* Episode Progress */}
          <div className="flex items-center justify-between text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-700">
              <Tv className="h-3.5 w-3.5 text-indigo-500" />
              <span>Progress:</span>
            </div>
            <span className="font-extrabold text-indigo-700">
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
