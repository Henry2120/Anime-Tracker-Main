import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Star,
  Tv,
  Calendar,
  Clock,
  Film,
  ExternalLink,
  Tag,
  BookOpen,
  MessageSquare,
  Edit2,
  Check,
  Sparkles,
  Info,
} from 'lucide-react';
import { MalListItem } from '../types';

export interface AnimeDetailData {
  id?: number;
  malId?: number | null;
  title: string;
  titleEnglish?: string | null;
  titleNative?: string | null;
  titleRomaji?: string | null;
  imageUrl?: string | null;
  score?: number | null;
  userScore?: number | null;
  episodes?: number | null;
  episodesWatched?: number | null;
  status?: string | null;
  mediaType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  broadcast?: {
    day_of_the_week?: string;
    start_time?: string;
  } | null;
  season?: {
    year?: number;
    season?: string;
  } | null;
  studio?: string | null;
  source?: string | null;
  genres?: Array<{ id?: number; name: string }> | string[];
  synopsis?: string | null;
  comment?: string | null;
  finishDate?: string | null;
}

interface AnimeDetailModalProps {
  anime: AnimeDetailData | null;
  isOpen: boolean;
  onClose: () => void;
  customNote?: string;
  onSaveNote?: (animeId: number, note: string) => void;
}

const statusBadgeStyles: Record<string, { label: string; bg: string; text: string }> = {
  watching: { label: 'Watching', bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-900' },
  completed: { label: 'Completed', bg: 'bg-blue-100 border-blue-300', text: 'text-blue-900' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-purple-100 border-purple-300', text: 'text-purple-900' },
  on_hold: { label: 'On Hold', bg: 'bg-amber-100 border-amber-300', text: 'text-amber-900' },
  dropped: { label: 'Dropped', bg: 'bg-rose-100 border-rose-300', text: 'text-rose-900' },
  currently_airing: { label: 'Currently Airing', bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-900' },
  finished_airing: { label: 'Finished Airing', bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-900' },
};

export const AnimeDetailModal: React.FC<AnimeDetailModalProps> = ({
  anime,
  isOpen,
  onClose,
  customNote = '',
  onSaveNote,
}) => {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(customNote);

  if (!isOpen || !anime) return null;

  const animeId = anime.malId || anime.id;
  const displayTitle = anime.titleEnglish || anime.title;
  const subtitle = anime.title !== displayTitle ? anime.title : anime.titleNative || anime.titleRomaji;

  const currentStatusKey = (anime.status || '').toLowerCase().replace(/\s+/g, '_');
  const statusStyle = statusBadgeStyles[currentStatusKey] || {
    label: anime.status || 'Anime Details',
    bg: 'bg-indigo-100 border-indigo-200',
    text: 'text-indigo-900',
  };

  const totalEpisodes = anime.episodes && anime.episodes > 0 ? anime.episodes : null;
  const watchedEpisodes = typeof anime.episodesWatched === 'number' ? anime.episodesWatched : 0;
  const hasProgress = totalEpisodes !== null && watchedEpisodes > 0;
  const progressPercent = totalEpisodes ? Math.min(100, Math.round((watchedEpisodes / totalEpisodes) * 100)) : null;

  const genreList: string[] = Array.isArray(anime.genres)
    ? anime.genres.map((g) => (typeof g === 'string' ? g : g.name)).filter(Boolean)
    : [];

  const handleSaveNote = () => {
    if (animeId && onSaveNote) {
      onSaveNote(animeId, noteText.trim());
    }
    setIsEditingNote(false);
  };

  const effectiveNote = noteText || customNote || anime.comment || '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white rounded-3xl shadow-2xl border-2 border-indigo-100 max-w-2xl w-full overflow-hidden text-slate-800 my-8 max-h-[90vh] flex flex-col"
        >
          {/* Header Banner */}
          <div className="relative bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 sm:p-6 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
              {anime.mediaType && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-white/15 text-indigo-200 uppercase tracking-wider">
                  {anime.mediaType}
                </span>
              )}
            </div>

            <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white pr-8 leading-tight">
              {displayTitle}
            </h3>

            {subtitle && (
              <p className="text-xs sm:text-sm text-indigo-200/80 font-medium mt-1 truncate">
                {subtitle}
              </p>
            )}
          </div>

          {/* Scrollable Content Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
            {/* Top Grid: Poster & Key Statistics */}
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Poster Image */}
              <div className="w-32 sm:w-40 aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border-2 border-indigo-100 shrink-0 shadow-md mx-auto sm:mx-0">
                {anime.imageUrl ? (
                  <img
                    src={anime.imageUrl}
                    alt={displayTitle}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <Film className="h-8 w-8 mb-1" />
                    <span className="text-[10px] font-bold">No Image</span>
                  </div>
                )}
              </div>

              {/* Stats & Metadata Columns */}
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* MAL Score */}
                  <div className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-400 text-slate-950 font-black">
                      <Star className="h-4 w-4 fill-slate-950" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block leading-none">
                        MAL Score
                      </span>
                      <span className="text-base font-black text-amber-950">
                        {anime.score ? anime.score.toFixed(2) : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* User Score */}
                  <div className="p-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-600 text-white font-black">
                      <Star className="h-4 w-4 fill-white" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block leading-none">
                        Your Score
                      </span>
                      <span className="text-base font-black text-indigo-950">
                        {anime.userScore && anime.userScore > 0 ? `${anime.userScore}/10` : 'Unrated'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Episode Progress Box */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Tv className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Episode Progress:</span>
                    </div>
                    <span className="font-extrabold text-indigo-950">
                      {watchedEpisodes} / {totalEpisodes || '?'} eps
                    </span>
                  </div>

                  {progressPercent !== null && (
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Quick Info Attributes */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 pt-1">
                  {anime.season && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="font-bold">Season:</span>
                      <span className="capitalize font-semibold text-slate-900">
                        {anime.season.season} {anime.season.year}
                      </span>
                    </div>
                  )}

                  {anime.studio && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Film className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="font-bold">Studio:</span>
                      <span className="font-semibold text-slate-900 truncate">{anime.studio}</span>
                    </div>
                  )}

                  {anime.source && (
                    <div className="flex items-center gap-1.5 truncate">
                      <BookOpen className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                      <span className="font-bold">Source:</span>
                      <span className="capitalize font-semibold text-slate-900">{anime.source.replace(/_/g, ' ')}</span>
                    </div>
                  )}

                  {anime.broadcast?.day_of_the_week && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-bold">Broadcast:</span>
                      <span className="capitalize font-semibold text-slate-900">
                        {anime.broadcast.day_of_the_week} {anime.broadcast.start_time || ''}
                      </span>
                    </div>
                  )}

                  {anime.startDate && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-bold">Aired:</span>
                      <span className="font-semibold text-slate-900">{anime.startDate}</span>
                    </div>
                  )}

                  {anime.finishDate && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="font-bold">Finished:</span>
                      <span className="font-semibold text-slate-900">{anime.finishDate}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Genres Chips */}
            {genreList.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase tracking-wider">
                  <Tag className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Genres</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {genreList.map((genre) => (
                    <span
                      key={genre}
                      className="px-3 py-1 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-800 text-xs font-bold"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Synopsis */}
            {anime.synopsis && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase tracking-wider">
                  <Info className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Synopsis</span>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs leading-relaxed text-slate-700 max-h-48 overflow-y-auto whitespace-pre-line">
                  {anime.synopsis}
                </div>
              </div>
            )}

            {/* User Personal Notes */}
            <div className="space-y-2 pt-2 border-t border-indigo-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Personal Note</span>
                </div>
                {!isEditingNote && onSaveNote && (
                  <button
                    onClick={() => {
                      setNoteText(effectiveNote);
                      setIsEditingNote(true);
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>{effectiveNote ? 'Edit Note' : 'Add Note'}</span>
                  </button>
                )}
              </div>

              {isEditingNote ? (
                <div className="space-y-3">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add personal thoughts, watch history, or season notes..."
                    rows={3}
                    className="w-full p-3 rounded-2xl border-2 border-indigo-200 focus:border-indigo-600 text-xs text-slate-800 outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingNote(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                  {effectiveNote ? (
                    <p className="whitespace-pre-line">{effectiveNote}</p>
                  ) : (
                    <p className="text-slate-400 italic">No notes recorded for this anime.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-indigo-100 flex items-center justify-between shrink-0">
            {animeId ? (
              <a
                href={`https://myanimelist.net/anime/${animeId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-700 hover:text-indigo-900 hover:underline"
              >
                <span>View on MyAnimeList</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <div />
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-bold text-xs shadow-sm cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
