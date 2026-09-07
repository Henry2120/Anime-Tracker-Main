import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Tv, ImageOff, Plus, Edit2, BookmarkPlus, CheckCircle2 } from 'lucide-react';
import { SeasonalAnimeItem, MalListItem } from '../types';

interface SeasonalAnimeCardProps {
  item: SeasonalAnimeItem;
  userListItem?: MalListItem;
  index: number;
  onTogglePersonal?: (animeId: number) => void;
  isPersonal?: boolean;
  onEdit?: (item: SeasonalAnimeItem, userListItem?: MalListItem) => void;
  onQuickIncrement?: (item: SeasonalAnimeItem, userListItem: MalListItem) => void;
  onAddToList?: (item: SeasonalAnimeItem) => void;
}

const statusBadgeStyles: Record<string, { label: string; bg: string; text: string }> = {
  watching: { label: 'Watching', bg: 'bg-[#6D9B7C]/15 border-[#6D9B7C]/30', text: 'text-[#6D9B7C]' },
  completed: { label: 'Completed', bg: 'bg-[#7567C7]/15 border-[#7567C7]/30', text: 'text-[#7567C7]' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-[#C69A55]/15 border-[#C69A55]/30', text: 'text-[#C69A55]' },
  on_hold: { label: 'On Hold', bg: 'bg-[#8F8A99]/15 border-[#8F8A99]/30', text: 'text-[#8F8A99]' },
  dropped: { label: 'Dropped', bg: 'bg-[#D6A0AF]/20 border-[#D6A0AF]/40', text: 'text-[#C77B82]' },
  not_added: { label: 'Not in MAL List', bg: 'bg-slate-100 dark:bg-[#25232F] border-slate-200 dark:border-[#2E2C37]', text: 'text-slate-600 dark:text-[#A4A1AA]' },
};

export const SeasonalAnimeCard: React.FC<SeasonalAnimeCardProps> = ({
  item,
  userListItem,
  index,
  onTogglePersonal,
  isPersonal = false,
  onEdit,
  onQuickIncrement,
  onAddToList,
}) => {
  const [imageError, setImageError] = useState(false);

  const imageUrl = item.node.main_picture?.large || item.node.main_picture?.medium;
  const userStatus = userListItem?.list_status?.status || 'not_added';
  const statusInfo = statusBadgeStyles[userStatus] || statusBadgeStyles.not_added;

  const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : null;
  const watchedEps = userListItem?.list_status?.num_episodes_watched || 0;
  const canIncrement = userListItem && (totalEps === null || watchedEps < totalEps);

  return (
    <motion.div
      id={`seasonal-card-${item.node.id}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.3) }}
      whileHover={{ y: -4 }}
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#1C1A24] p-3 shadow-2xs border transition-all duration-200 hover:shadow-md ${
        userListItem
          ? 'border-[#7567C7]/40 hover:border-[#7567C7]'
          : 'border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#77747D]/50'
      }`}
    >
      {/* Thumbnail Container */}
      <div
        onClick={() => {
          if (userListItem && onEdit) {
            onEdit(item, userListItem);
          } else if (onAddToList) {
            onAddToList(item);
          } else if (onEdit) {
            onEdit(item);
          }
        }}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] mb-3 cursor-pointer"
      >
        {/* User MAL Status Badge */}
        <div
          className={`absolute top-2.5 left-2.5 z-10 flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide border shadow-2xs ${statusInfo.bg} ${statusInfo.text}`}
        >
          {statusInfo.label}
        </div>

        {/* MAL Mean Rating or User Score */}
        {userListItem && userListItem.list_status?.score > 0 ? (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/85 px-2 py-0.5 text-xs font-bold text-[#C69A55] shadow-2xs backdrop-blur-md" title="Your Score">
            <Star className="h-3 w-3 fill-current text-[#C69A55]" />
            <span>{userListItem.list_status.score}/10</span>
          </div>
        ) : item.node.mean ? (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-[#25242A]/85 px-2 py-0.5 text-xs font-bold text-[#C69A55] shadow-2xs backdrop-blur-md" title="MAL Mean Score">
            <Star className="h-3 w-3 fill-current text-[#C69A55]" />
            <span>{item.node.mean.toFixed(1)}</span>
          </div>
        ) : null}

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

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-[#25242A]/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-[#1C1A24]/90 text-xs font-bold text-[#25242A] dark:text-[#EAE8F0] shadow-sm flex items-center gap-1.5 backdrop-blur-xs">
            {userListItem ? (
              <>
                <Edit2 className="h-3.5 w-3.5 text-[#7567C7]" />
                Edit on MAL
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5 text-[#7567C7]" />
                Add to MAL
              </>
            )}
          </span>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col justify-between px-1 pb-1">
        <div>
          <h3
            onClick={() => {
              if (userListItem && onEdit) onEdit(item, userListItem);
              else if (onAddToList) onAddToList(item);
              else if (onEdit) onEdit(item);
            }}
            className="font-bold text-[#25242A] dark:text-[#EAE8F0] text-sm leading-snug line-clamp-2 group-hover:text-[#7567C7] transition-colors cursor-pointer"
            title={item.node.title}
          >
            {item.node.title}
          </h3>
        </div>

        <div className="mt-3 space-y-2 border-t border-[#E7E3DF] dark:border-[#2E2C37] pt-2 text-xs">
          {/* Episodes Info / User Progress */}
          <div className="flex items-center justify-between text-[#77747D] dark:text-[#A4A1AA]">
            <div className="flex items-center gap-1.5 font-medium text-[11px]">
              <Tv className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>{userListItem ? 'Progress:' : 'Episodes:'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#25242A] dark:text-[#EAE8F0]">
                {userListItem
                  ? `${watchedEps} / ${totalEps || '?'} eps`
                  : `${totalEps || '?'} eps`}
              </span>
              {userListItem && onQuickIncrement && canIncrement && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickIncrement(item, userListItem);
                  }}
                  className="p-1 rounded-lg bg-[#F0EDFA] dark:bg-[#25232F] hover:bg-[#7567C7] text-[#7567C7] hover:text-white transition-colors cursor-pointer shadow-2xs"
                  title="Watched +1 Episode"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Action Button: Edit on MAL or Add to MAL */}
          {userListItem ? (
            onEdit && (
              <button
                type="button"
                onClick={() => onEdit(item, userListItem)}
                className="w-full mt-2 py-1.5 px-3 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] border border-[#E7E3DF] dark:border-[#2E2C37] text-[11px] font-bold text-[#7567C7] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit2 className="h-3 w-3" />
                <span>Edit MAL Entry</span>
              </button>
            )
          ) : (
            onAddToList && (
              <button
                type="button"
                onClick={() => onAddToList(item)}
                className="w-full mt-2 py-1.5 px-3 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span>Add to MyAnimeList</span>
              </button>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
};

