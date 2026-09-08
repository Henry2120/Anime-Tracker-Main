import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Star,
  Tv,
  Film,
  Calendar,
  Check,
  Plus,
  Loader2,
  ImageOff,
  Sparkles,
  Info,
  Edit2,
} from 'lucide-react';
import { MalAnimeNode, MalListItem } from '../types';

interface MalCatalogueSearchCardProps {
  node: MalAnimeNode;
  isInList: boolean;
  existingItem?: MalListItem;
  isAdding: boolean;
  onAdd: (node: MalAnimeNode) => void;
  onSelect?: (node: MalAnimeNode) => void;
  onEdit?: (node: MalAnimeNode) => void;
}

export const MalCatalogueSearchCard: React.FC<MalCatalogueSearchCardProps> = ({
  node,
  isInList,
  existingItem,
  isAdding,
  onAdd,
  onSelect,
  onEdit,
}) => {
  const [imageError, setImageError] = useState(false);

  const imageUrl = node.main_picture?.large || node.main_picture?.medium;
  const secondaryTitle =
    node.alternative_titles?.en && node.alternative_titles.en !== node.title
      ? node.alternative_titles.en
      : node.alternative_titles?.ja && node.alternative_titles.ja !== node.title
      ? node.alternative_titles.ja
      : null;

  const mediaTypeLabel = node.media_type
    ? node.media_type.toUpperCase()
    : 'ANIME';

  const seasonLabel = node.start_season?.season && node.start_season?.year
    ? `${node.start_season.season.charAt(0).toUpperCase() + node.start_season.season.slice(1)} ${node.start_season.year}`
    : node.start_date
    ? node.start_date.split('-')[0]
    : null;

  const scoreFormatted =
    typeof node.mean === 'number' && !isNaN(node.mean) && node.mean > 0
      ? node.mean.toFixed(2)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex flex-col sm:flex-row items-stretch gap-4 p-3.5 rounded-2xl bg-white dark:bg-[#1C1A24] border transition-all duration-200 shadow-2xs ${
        isInList
          ? 'border-[#6D9B7C]/40 hover:border-[#6D9B7C] bg-[#6D9B7C]/[0.02]'
          : 'border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]'
      }`}
    >
      {/* Thumbnail */}
      <div
        onClick={() => onSelect?.(node)}
        className="relative w-full sm:w-24 md:w-28 aspect-[3/4] sm:aspect-auto sm:h-36 shrink-0 overflow-hidden rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] cursor-pointer"
        title={`View details for ${node.title}`}
      >
        {!imageError && imageUrl ? (
          <img
            src={imageUrl}
            alt={node.title}
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[#F0EDFA] dark:bg-[#25232F] text-[#7567C7] p-2 text-center">
            <ImageOff className="h-6 w-6 mb-1 stroke-1" />
            <span className="text-[10px] font-medium">No image</span>
          </div>
        )}

        {/* Media Type Badge Overlay */}
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-[#25242A]/80 backdrop-blur-xs text-[10px] font-bold text-white uppercase tracking-wider">
          {mediaTypeLabel}
        </div>
      </div>

      {/* Info & Details */}
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4
                onClick={() => onSelect?.(node)}
                className="font-bold text-[#25242A] dark:text-[#EAE8F0] text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-[#7567C7] transition-colors cursor-pointer"
                title={node.title}
              >
                {node.title}
              </h4>
              {secondaryTitle && (
                <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] line-clamp-1 mt-0.5">
                  {secondaryTitle}
                </p>
              )}
            </div>

            {/* Score */}
            {scoreFormatted ? (
              <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg bg-[#C69A55]/10 border border-[#C69A55]/20 text-[#C69A55] text-xs font-bold">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>{scoreFormatted}</span>
              </div>
            ) : (
              <span className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] shrink-0 font-medium">
                Unrated
              </span>
            )}
          </div>

          {/* Metadata Chips */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#77747D] dark:text-[#A4A1AA]">
            <span className="flex items-center gap-1 font-medium bg-[#F7F5F2] dark:bg-[#25232F] px-2 py-0.5 rounded-md border border-[#E7E3DF] dark:border-[#2E2C37]">
              <Tv className="h-3 w-3 text-[#7567C7]" />
              <span>{node.num_episodes ? `${node.num_episodes} eps` : 'Episodes TBA'}</span>
            </span>

            {seasonLabel && (
              <span className="flex items-center gap-1 font-medium bg-[#F7F5F2] dark:bg-[#25232F] px-2 py-0.5 rounded-md border border-[#E7E3DF] dark:border-[#2E2C37]">
                <Calendar className="h-3 w-3 text-[#C69A55]" />
                <span>{seasonLabel}</span>
              </span>
            )}

            {node.status && (
              <span className="capitalize font-medium text-[11px] px-2 py-0.5 rounded-md bg-[#7567C7]/10 text-[#7567C7]">
                {node.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* Synopsis preview */}
          {node.synopsis && (
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] line-clamp-2 mt-2 leading-relaxed">
              {node.synopsis}
            </p>
          )}
        </div>

        {/* Action Button Row */}
        <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-[#E7E3DF] dark:border-[#2E2C37]">
          <button
            type="button"
            onClick={() => onSelect?.(node)}
            className="text-xs font-semibold text-[#7567C7] hover:text-[#6355B5] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            <span>Details</span>
          </button>

          <div className="flex items-center gap-2">
            {isInList ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#6D9B7C]/15 border border-[#6D9B7C]/30 text-[#6D9B7C] text-xs font-bold">
                  <Check className="h-3.5 w-3.5" />
                  <span>Already in My List</span>
                </div>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(node)}
                    className="p-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#F0EDFA] text-[#7567C7] transition-colors cursor-pointer"
                    title="Edit in My List"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAdd(node)}
                disabled={isAdding}
                className="px-4 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6355B5] text-white font-semibold text-xs shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>+ Add to My List</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
