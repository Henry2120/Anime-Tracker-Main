import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Tv, ImageOff, PlusCircle, CheckCircle2 } from 'lucide-react';
import { SeasonalAnimeItem, MalListItem } from '../types';

interface SeasonalAnimeCardProps {
  item: SeasonalAnimeItem;
  userListItem?: MalListItem;
  index: number;
  onTogglePersonal?: (animeId: number) => void;
  isPersonal?: boolean;
}

const statusBadgeStyles: Record<string, { label: string; bg: string; text: string }> = {
  watching: { label: 'Watching', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  completed: { label: 'Completed', bg: 'bg-indigo-100', text: 'text-indigo-800' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-amber-100', text: 'text-amber-800' },
  on_hold: { label: 'On Hold', bg: 'bg-purple-100', text: 'text-purple-800' },
  dropped: { label: 'Dropped', bg: 'bg-rose-100', text: 'text-rose-800' },
  not_added: { label: 'Not Added', bg: 'bg-slate-100', text: 'text-slate-600' },
};

export const SeasonalAnimeCard: React.FC<SeasonalAnimeCardProps> = ({
  item,
  userListItem,
  index,
  onTogglePersonal,
  isPersonal = false,
}) => {
  const [imageError, setImageError] = useState(false);

  const imageUrl = item.node.main_picture?.large || item.node.main_picture?.medium;
  const userStatus = userListItem?.list_status?.status || 'not_added';
  const statusInfo = statusBadgeStyles[userStatus] || statusBadgeStyles.not_added;

  const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : '?';

  return (
    <motion.div
      id={`seasonal-card-${item.node.id}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.3) }}
      whileHover={{ y: -5 }}
      className={`group flex flex-col overflow-hidden rounded-3xl bg-white p-3 shadow-xl border-2 transition-all duration-300 ${
        userListItem
          ? 'border-indigo-100 hover:border-indigo-300'
          : 'border-slate-100 hover:border-slate-300'
      }`}
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-indigo-100 mb-3">
        {/* User MAL Status Badge */}
        <div
          className={`absolute top-3 left-3 z-10 flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide shadow-xs ${statusInfo.bg} ${statusInfo.text}`}
        >
          {statusInfo.label}
        </div>

        {/* MAL Mean Rating or User Score */}
        {userListItem && userListItem.list_status?.score > 0 ? (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-1 text-xs font-black text-slate-900 shadow-sm" title="Your Score">
            <Star className="h-3.5 w-3.5 fill-current text-slate-900" />
            <span>{userListItem.list_status.score}/10</span>
          </div>
        ) : item.node.mean ? (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-black text-yellow-300 shadow-sm backdrop-blur-md" title="MAL Mean Score">
            <Star className="h-3.5 w-3.5 fill-current text-yellow-300" />
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
          {/* Episodes Info / User Progress */}
          <div className="flex items-center justify-between text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-700">
              <Tv className="h-3.5 w-3.5 text-indigo-500" />
              <span>{userListItem ? 'Progress:' : 'Episodes:'}</span>
            </div>
            <span className="font-extrabold text-indigo-700">
              {userListItem
                ? `${userListItem.list_status.num_episodes_watched} / ${totalEps} eps`
                : `${totalEps} eps`}
            </span>
          </div>

          {/* Toggle Manual Personal Activity Button */}
          {onTogglePersonal && (
            <button
              onClick={() => onTogglePersonal(item.node.id)}
              className={`w-full mt-2 py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isPersonal
                  ? 'bg-pink-100 text-pink-800 hover:bg-pink-200'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {isPersonal ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-pink-600" />
                  <span>In My Summer 2026</span>
                </>
              ) : (
                <>
                  <PlusCircle className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Add to My Summer 2026</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
