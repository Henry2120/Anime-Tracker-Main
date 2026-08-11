import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Tv, ImageOff } from 'lucide-react';
import { Anime } from '../types';

interface AnimeCardProps {
  anime: Anime;
  rank: number;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({ anime, rank }) => {
  const [imageError, setImageError] = useState(false);

  const imageUrl =
    anime.images.webp?.large_image_url ||
    anime.images.jpg.large_image_url ||
    anime.images.jpg.image_url;

  const displayTitle = anime.title_english || anime.title;

  return (
    <motion.div
      id={`anime-card-${anime.mal_id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (rank - 1) * 0.05 }}
      whileHover={{ y: -6 }}
      className="group flex flex-col overflow-hidden rounded-3xl bg-white p-3 shadow-xl border-2 border-indigo-100 relative transition-all duration-300 hover:border-indigo-300"
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-indigo-100 mb-3">
        {/* Rank Badge */}
        <div className="absolute top-3 left-3 z-10 flex items-center justify-center rounded-full bg-indigo-950/80 px-2.5 py-1 text-xs font-black text-white backdrop-blur-md shadow-sm">
          #{rank}
        </div>

        {/* Score Badge */}
        {anime.score !== null && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-1 text-xs font-black text-slate-900 shadow-sm">
            <Star className="h-3.5 w-3.5 fill-current text-slate-900" />
            <span>{anime.score.toFixed(2)}</span>
          </div>
        )}

        {!imageError && imageUrl ? (
          <img
            src={imageUrl}
            alt={displayTitle}
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

        {/* Subtle overlay gradient at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col justify-between px-1 pb-1">
        <div>
          <h3
            className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors"
            title={displayTitle}
          >
            {displayTitle}
          </h3>
          {anime.title_english && anime.title !== anime.title_english && (
            <p className="mt-0.5 text-xs text-slate-400 line-clamp-1 italic">
              {anime.title}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-indigo-50 pt-2.5 text-[10px] uppercase tracking-widest font-bold text-slate-400">
          <div className="flex items-center gap-1 text-slate-500">
            <Tv className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              {anime.episodes ? `${anime.episodes} Ep${anime.episodes > 1 ? 's' : ''}` : 'Unknown'}
            </span>
          </div>

          {anime.type && (
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-600">
              {anime.type}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};
