import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Tv, Calendar, ImageOff, Plus, Edit2, MessageSquare } from 'lucide-react';
import { MalListItem } from '../types';

interface MalAnimeCardProps {
  item: MalListItem;
  index: number;
  onEdit?: (item: MalListItem) => void;
  onQuickIncrement?: (item: MalListItem) => void;
}

const statusBadgeStyles: Record<string, { label: string; bg: string; text: string }> = {
  watching: { label: 'Watching', bg: 'bg-[#6D9B7C]/15 border-[#6D9B7C]/30', text: 'text-[#6D9B7C]' },
  completed: { label: 'Completed', bg: 'bg-[#7567C7]/15 border-[#7567C7]/30', text: 'text-[#7567C7]' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-[#C69A55]/15 border-[#C69A55]/30', text: 'text-[#C69A55]' },
  on_hold: { label: 'On Hold', bg: 'bg-[#8F8A99]/15 border-[#8F8A99]/30', text: 'text-[#8F8A99]' },
  dropped: { label: 'Dropped', bg: 'bg-[#D6A0AF]/20 border-[#D6A0AF]/40', text: 'text-[#C77B82]' },
};

export const MalAnimeCard: React.FC<MalAnimeCardProps> = ({ item, index, onEdit, onQuickIncrement }) => {
  const [imageError, setImageError] = useState(false);

  const imageUrl = item.node.main_picture?.large || item.node.main_picture?.medium;
  const statusInfo = statusBadgeStyles[item.list_status.status] || {
    label: item.list_status.status.replace(/_/g, ' '),
    bg: 'bg-slate-100 dark:bg-[#25232F] border-slate-200 dark:border-[#2E2C37]',
    text: 'text-slate-700 dark:text-[#A4A1AA]',
  };

  const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : null;
  const watchedEps = item.list_status.num_episodes_watched || 0;
  const canIncrement = totalEps === null || watchedEps < totalEps;

  return (
    <motion.div
      id={`mal-card-${item.node.id}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      whileHover={{ y: -4 }}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#1C1A24] p-3 shadow-2xs border border-[#E7E3DF] dark:border-[#2E2C37] relative transition-all duration-200 hover:border-[#7567C7] hover:shadow-md"
    >
      {/* Thumbnail Container */}
      <div
        onClick={() => onEdit?.(item)}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] mb-3 cursor-pointer"
      >
        {/* Status Badge */}
        <div
          className={`absolute top-2.5 left-2.5 z-10 flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide border shadow-2xs ${statusInfo.bg} ${statusInfo.text}`}
        >
          {statusInfo.label}
        </div>

        {/* User Score Badge */}
        {item.list_status.score > 0 ? (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/85 px-2 py-0.5 text-xs font-bold text-[#C69A55] shadow-2xs backdrop-blur-md">
            <Star className="h-3 w-3 fill-current text-[#C69A55]" />
            <span>{item.list_status.score}/10</span>
          </div>
        ) : (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/65 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
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
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#F0EDFA] dark:bg-[#25232F] text-[#7567C7] p-4 text-center">
            <ImageOff className="h-8 w-8 mb-2 stroke-1" />
            <span className="text-xs font-medium">Image unavailable</span>
          </div>
        )}

        {/* Hover overlay with edit prompt */}
        <div className="absolute inset-0 bg-[#25242A]/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-[#1C1A24]/90 text-xs font-bold text-[#25242A] dark:text-[#EAE8F0] shadow-sm flex items-center gap-1.5 backdrop-blur-xs">
            <Edit2 className="h-3.5 w-3.5 text-[#7567C7]" />
            Edit on MAL
          </span>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col justify-between px-1 pb-1">
        <div>
          <h3
            onClick={() => onEdit?.(item)}
            className="font-bold text-[#25242A] dark:text-[#EAE8F0] text-sm leading-snug line-clamp-2 group-hover:text-[#7567C7] transition-colors cursor-pointer"
            title={item.node.title}
          >
            {item.node.title}
          </h3>
        </div>

        <div className="mt-3 space-y-2 border-t border-[#E7E3DF] dark:border-[#2E2C37] pt-2 text-xs">
          {/* Episode Progress & Quick Increment */}
          <div className="flex items-center justify-between text-[#77747D] dark:text-[#A4A1AA]">
            <div className="flex items-center gap-1.5 font-medium text-[11px]">
              <Tv className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Progress:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#25242A] dark:text-[#EAE8F0]">
                {watchedEps} / {totalEps || '?'} eps
              </span>
              {onQuickIncrement && canIncrement && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickIncrement(item);
                  }}
                  className="p-1 rounded-lg bg-[#F0EDFA] dark:bg-[#25232F] hover:bg-[#7567C7] text-[#7567C7] hover:text-white transition-colors cursor-pointer shadow-2xs"
                  title="Watched +1 Episode"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* MAL Notes Preview if present */}
          {item.list_status.comments && (
            <div className="flex items-start gap-1 text-[11px] text-[#77747D] dark:text-[#A4A1AA] pt-0.5 line-clamp-1 italic">
              <MessageSquare className="h-3 w-3 text-[#7567C7] shrink-0 mt-0.5" />
              <span className="truncate">{item.list_status.comments}</span>
            </div>
          )}

          {/* Start / Finish Dates if available */}
          {(item.list_status.start_date || item.list_status.finish_date) && (
            <div className="flex flex-col gap-0.5 pt-0.5 text-[10px] text-[#77747D] dark:text-[#A4A1AA] font-medium">
              {item.list_status.start_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-[#7567C7]" />
                  <span>Start: {item.list_status.start_date}</span>
                </div>
              )}
              {item.list_status.finish_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-[#6D9B7C]" />
                  <span>Finish: {item.list_status.finish_date}</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Edit Entry Button */}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="w-full mt-2 py-1.5 px-3 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] border border-[#E7E3DF] dark:border-[#2E2C37] text-[11px] font-bold text-[#7567C7] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit MAL Entry</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

