import React, { useState, useEffect } from 'react';
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
import { decodeHtmlEntities } from '../utils/htmlUtils';

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
  customNotes?: Record<number, string>;
  onSaveNote?: (animeId: number, note: string) => void;
}

const statusBadgeStyles: Record<string, { label: string; bg: string; text: string }> = {
  watching: { label: 'Watching', bg: 'bg-[#6D9B7C]/15 border-[#6D9B7C]/30', text: 'text-[#6D9B7C]' },
  completed: { label: 'Completed', bg: 'bg-[#7567C7]/15 border-[#7567C7]/30', text: 'text-[#7567C7]' },
  plan_to_watch: { label: 'Plan to Watch', bg: 'bg-[#7567C7]/15 border-[#7567C7]/30', text: 'text-[#7567C7]' },
  on_hold: { label: 'On Hold', bg: 'bg-[#C69A55]/15 border-[#C69A55]/30', text: 'text-[#C69A55]' },
  dropped: { label: 'Dropped', bg: 'bg-[#D6A0AF]/20 border-[#D6A0AF]/40', text: 'text-[#C77B82]' },
  currently_airing: { label: 'Currently Airing', bg: 'bg-[#6D9B7C]/15 border-[#6D9B7C]/30', text: 'text-[#6D9B7C]' },
  finished_airing: { label: 'Finished Airing', bg: 'bg-[#7567C7]/15 border-[#7567C7]/30', text: 'text-[#7567C7]' },
};

export const AnimeDetailModal: React.FC<AnimeDetailModalProps> = ({
  anime,
  isOpen,
  onClose,
  customNote = '',
  customNotes,
  onSaveNote,
}) => {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(customNote);

  const animeId = anime ? (anime.malId || anime.id) : null;
  const currentCustomNote = customNote || (animeId && customNotes ? customNotes[animeId] : '') || '';
  const decodedMalComment = anime?.comment ? decodeHtmlEntities(anime.comment) : '';
  const effectiveNote = noteText || currentCustomNote || decodedMalComment || '';

  useEffect(() => {
    setIsEditingNote(false);
    setNoteText(currentCustomNote);
  }, [animeId, currentCustomNote, isOpen]);

  if (!isOpen || !anime) return null;
  const displayTitle = anime.titleEnglish || anime.title;
  const subtitle = anime.title !== displayTitle ? anime.title : anime.titleNative || anime.titleRomaji;

  const currentStatusKey = (anime.status || '').toLowerCase().replace(/\s+/g, '_');
  const statusStyle = statusBadgeStyles[currentStatusKey] || {
    label: anime.status || 'Anime Details',
    bg: 'bg-[#F0EDFA] border-[#7567C7]/20',
    text: 'text-[#7567C7]',
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#25242A]/40 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white rounded-2xl shadow-xl border border-[#E7E3DF] max-w-2xl w-full overflow-hidden text-[#25242A] my-8 max-h-[90vh] flex flex-col"
        >
          {/* Header Banner */}
          <div className="relative bg-[#F7F5F2] border-b border-[#E7E3DF] text-[#25242A] p-5 sm:p-6 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white hover:bg-[#F0EDFA] border border-[#E7E3DF] text-[#77747D] hover:text-[#25242A] transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
              {anime.mediaType && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-[#7567C7] border border-[#E7E3DF] uppercase tracking-wider">
                  {anime.mediaType}
                </span>
              )}
            </div>

            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#25242A] pr-8 leading-tight">
              {displayTitle}
            </h3>

            {subtitle && (
              <p className="text-xs sm:text-sm text-[#77747D] font-medium mt-1 truncate">
                {subtitle}
              </p>
            )}
          </div>

          {/* Scrollable Content Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
            {/* Top Grid: Poster & Key Statistics */}
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Poster Image */}
              <div className="w-32 sm:w-40 aspect-[3/4] rounded-xl overflow-hidden bg-[#F7F5F2] border border-[#E7E3DF] shrink-0 shadow-2xs mx-auto sm:mx-0">
                {anime.imageUrl ? (
                  <img
                    src={anime.imageUrl}
                    alt={displayTitle}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#77747D] p-4 text-center">
                    <Film className="h-8 w-8 mb-1" />
                    <span className="text-[10px] font-bold">No Image</span>
                  </div>
                )}
              </div>

              {/* Stats & Metadata Columns */}
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* MAL Score */}
                  <div className="p-2.5 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#C69A55]/15 text-[#C69A55]">
                      <Star className="h-4 w-4 fill-current" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] block leading-none">
                        MAL Score
                      </span>
                      <span className="text-base font-bold text-[#25242A]">
                        {anime.score ? anime.score.toFixed(2) : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* User Score */}
                  <div className="p-2.5 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#7567C7] text-white">
                      <Star className="h-4 w-4 fill-current" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7567C7] block leading-none">
                        Your Score
                      </span>
                      <span className="text-base font-bold text-[#25242A]">
                        {anime.userScore && anime.userScore > 0 ? `${anime.userScore}/10` : 'Unrated'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Episode Progress Box */}
                <div className="p-3 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#25242A]">
                    <div className="flex items-center gap-1.5">
                      <Tv className="h-3.5 w-3.5 text-[#7567C7]" />
                      <span>Episode Progress:</span>
                    </div>
                    <span className="font-bold text-[#7567C7]">
                      {watchedEpisodes} / {totalEpisodes || '?'} eps
                    </span>
                  </div>

                  {progressPercent !== null && (
                    <div className="w-full h-2 bg-[#E7E3DF] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#7567C7] rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Quick Info Attributes */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[#77747D] pt-1">
                  {anime.season && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Sparkles className="h-3.5 w-3.5 text-[#C69A55] shrink-0" />
                      <span className="font-semibold">Season:</span>
                      <span className="capitalize font-bold text-[#25242A]">
                        {anime.season.season} {anime.season.year}
                      </span>
                    </div>
                  )}

                  {anime.studio && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Film className="h-3.5 w-3.5 text-[#7567C7] shrink-0" />
                      <span className="font-semibold">Studio:</span>
                      <span className="font-bold text-[#25242A] truncate">{anime.studio}</span>
                    </div>
                  )}

                  {anime.source && (
                    <div className="flex items-center gap-1.5 truncate">
                      <BookOpen className="h-3.5 w-3.5 text-[#7567C7] shrink-0" />
                      <span className="font-semibold">Source:</span>
                      <span className="capitalize font-bold text-[#25242A]">{anime.source.replace(/_/g, ' ')}</span>
                    </div>
                  )}

                  {anime.broadcast?.day_of_the_week && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock className="h-3.5 w-3.5 text-[#6D9B7C] shrink-0" />
                      <span className="font-semibold">Broadcast:</span>
                      <span className="capitalize font-bold text-[#25242A]">
                        {anime.broadcast.day_of_the_week} {anime.broadcast.start_time || ''}
                      </span>
                    </div>
                  )}

                  {anime.startDate && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="h-3.5 w-3.5 text-[#77747D] shrink-0" />
                      <span className="font-semibold">Aired:</span>
                      <span className="font-bold text-[#25242A]">{anime.startDate}</span>
                    </div>
                  )}

                  {anime.finishDate && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="h-3.5 w-3.5 text-[#7567C7] shrink-0" />
                      <span className="font-semibold">Finished:</span>
                      <span className="font-bold text-[#25242A]">{anime.finishDate}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Genres Chips */}
            {genreList.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#25242A] uppercase tracking-wider">
                  <Tag className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Genres</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {genreList.map((genre) => (
                    <span
                      key={genre}
                      className="px-3 py-1 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 text-[#7567C7] text-xs font-semibold"
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
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#25242A] uppercase tracking-wider">
                  <Info className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Synopsis</span>
                </div>
                <div className="p-4 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] text-xs leading-relaxed text-[#25242A] max-h-48 overflow-y-auto whitespace-pre-line">
                  {anime.synopsis}
                </div>
              </div>
            )}

            {/* User Personal Notes */}
            <div className="space-y-2 pt-2 border-t border-[#E7E3DF]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#25242A] uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Personal Note</span>
                </div>
                {!isEditingNote && onSaveNote && (
                  <button
                    onClick={() => {
                      setNoteText(effectiveNote);
                      setIsEditingNote(true);
                    }}
                    className="text-xs font-semibold text-[#7567C7] hover:underline flex items-center gap-1 cursor-pointer"
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
                    className="w-full p-3 rounded-xl border border-[#E7E3DF] focus:border-[#7567C7] focus:bg-white bg-[#F7F5F2] text-xs text-[#25242A] outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingNote(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-[#E7E3DF] text-[#77747D] text-xs font-semibold hover:bg-[#F7F5F2] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className="px-3.5 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 text-xs text-[#25242A] leading-relaxed">
                  {effectiveNote ? (
                    <p className="whitespace-pre-line">{effectiveNote}</p>
                  ) : (
                    <p className="text-[#77747D] italic">No notes recorded for this anime.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-[#F7F5F2] border-t border-[#E7E3DF] flex items-center justify-between shrink-0">
            {animeId ? (
              <a
                href={`https://myanimelist.net/anime/${animeId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7567C7] hover:underline"
              >
                <span>View on MyAnimeList</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <div />
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[#25242A] hover:bg-[#38363F] text-white font-semibold text-xs shadow-2xs cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
