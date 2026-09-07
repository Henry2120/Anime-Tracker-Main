import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Star,
  Tv,
  Calendar,
  Sparkles,
  Check,
  Trash2,
  RotateCcw,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Film,
  Plus,
  Minus,
  MessageSquare,
  Flame,
  Bookmark,
} from 'lucide-react';
import { MalListItem, MalAnimeNode, MalUpdateStatusPayload } from '../types';
import { decodeHtmlEntities } from '../utils/htmlUtils';

export interface EditableAnimeData {
  id: number;
  title: string;
  titleEnglish?: string | null;
  titleNative?: string | null;
  imageUrl?: string | null;
  totalEpisodes?: number | null;
  mediaType?: string | null;
  season?: { year?: number; season?: string } | null;
  meanScore?: number | null;
  // Current MAL status if in list
  currentStatus?: {
    status?: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch' | string;
    score?: number;
    num_episodes_watched?: number;
    is_rewatching?: boolean;
    start_date?: string;
    finish_date?: string;
    comments?: string;
    priority?: number;
    num_times_rewatched?: number;
  } | null;
}

interface EditMalEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  anime: EditableAnimeData | null;
  onSave: (animeId: number, payload: MalUpdateStatusPayload) => Promise<{ success: boolean; error?: string }>;
  onDelete?: (animeId: number) => Promise<{ success: boolean; error?: string }>;
}

const SCORE_LABELS: Record<number, string> = {
  0: 'Unrated (0)',
  1: '(1) Appalling',
  2: '(2) Horrible',
  3: '(3) Very Bad',
  4: '(4) Bad',
  5: '(5) Average',
  6: '(6) Fine',
  7: '(7) Good',
  8: '(8) Very Good',
  9: '(9) Great',
  10: '(10) Masterpiece',
};

const STATUS_CONFIG: Record<
  string,
  { label: string; activeClass: string; bg: string; text: string; icon: any }
> = {
  watching: {
    label: 'Watching',
    activeClass: 'bg-[#6D9B7C] text-white ring-2 ring-[#6D9B7C]/40 border-transparent',
    bg: 'bg-[#6D9B7C]/10 hover:bg-[#6D9B7C]/20 border-[#6D9B7C]/30',
    text: 'text-[#6D9B7C]',
    icon: Tv,
  },
  completed: {
    label: 'Completed',
    activeClass: 'bg-[#7567C7] text-white ring-2 ring-[#7567C7]/40 border-transparent',
    bg: 'bg-[#7567C7]/10 hover:bg-[#7567C7]/20 border-[#7567C7]/30',
    text: 'text-[#7567C7]',
    icon: Check,
  },
  plan_to_watch: {
    label: 'Plan to Watch',
    activeClass: 'bg-[#C69A55] text-white ring-2 ring-[#C69A55]/40 border-transparent',
    bg: 'bg-[#C69A55]/10 hover:bg-[#C69A55]/20 border-[#C69A55]/30',
    text: 'text-[#C69A55]',
    icon: Bookmark,
  },
  on_hold: {
    label: 'On Hold',
    activeClass: 'bg-[#8F8A99] text-white ring-2 ring-[#8F8A99]/40 border-transparent',
    bg: 'bg-[#8F8A99]/10 hover:bg-[#8F8A99]/20 border-[#8F8A99]/30',
    text: 'text-[#8F8A99]',
    icon: RotateCcw,
  },
  dropped: {
    label: 'Dropped',
    activeClass: 'bg-[#C77B82] text-white ring-2 ring-[#C77B82]/40 border-transparent',
    bg: 'bg-[#D6A0AF]/15 hover:bg-[#D6A0AF]/25 border-[#D6A0AF]/40',
    text: 'text-[#C77B82]',
    icon: Trash2,
  },
};

export const EditMalEntryModal: React.FC<EditMalEntryModalProps> = ({
  isOpen,
  onClose,
  anime,
  onSave,
  onDelete,
}) => {
  const [status, setStatus] = useState<'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch'>('watching');
  const [score, setScore] = useState<number>(0);
  const [episodesWatched, setEpisodesWatched] = useState<number>(0);
  const [isRewatching, setIsRewatching] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [finishDate, setFinishDate] = useState<string>('');
  const [comments, setComments] = useState<string>('');
  const [priority, setPriority] = useState<number>(0);
  const [numTimesRewatched, setNumTimesRewatched] = useState<number>(0);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Initialize state from current anime MAL status
  useEffect(() => {
    if (!anime) return;
    const cur = anime.currentStatus;
    const normalizedStatus = (cur?.status?.toLowerCase() || 'watching') as any;
    const validStatuses = ['watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'];
    setStatus(validStatuses.includes(normalizedStatus) ? normalizedStatus : 'watching');
    setScore(typeof cur?.score === 'number' ? cur.score : 0);
    setEpisodesWatched(typeof cur?.num_episodes_watched === 'number' ? cur.num_episodes_watched : 0);
    setIsRewatching(Boolean(cur?.is_rewatching));
    setStartDate(cur?.start_date || '');
    setFinishDate(cur?.finish_date || '');
    setComments(cur?.comments ? decodeHtmlEntities(cur.comments) : '');
    setPriority(typeof cur?.priority === 'number' ? cur.priority : 0);
    setNumTimesRewatched(typeof cur?.num_times_rewatched === 'number' ? cur.num_times_rewatched : 0);
    setSyncStatus('idle');
    setErrorMessage(null);
    setConfirmDelete(false);
  }, [anime, isOpen]);

  if (!isOpen || !anime) return null;

  const totalEpisodes = anime.totalEpisodes && anime.totalEpisodes > 0 ? anime.totalEpisodes : null;
  const displayTitle = anime.titleEnglish || anime.title;
  const isExistingEntry = Boolean(anime.currentStatus);

  const handleStatusSelect = (newStatus: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch') => {
    setStatus(newStatus);
    const todayStr = new Date().toISOString().split('T')[0];

    // Auto-fill dates and episode counts logically
    if (newStatus === 'completed') {
      if (totalEpisodes && episodesWatched < totalEpisodes) {
        setEpisodesWatched(totalEpisodes);
      }
      if (!finishDate) {
        setFinishDate(todayStr);
      }
    } else if (newStatus === 'watching') {
      if (!startDate) {
        setStartDate(todayStr);
      }
    }
  };

  const handleEpisodeChange = (delta: number) => {
    const nextVal = Math.max(0, episodesWatched + delta);
    if (totalEpisodes && nextVal > totalEpisodes) {
      setEpisodesWatched(totalEpisodes);
      if (nextVal >= totalEpisodes && status === 'watching') {
        setStatus('completed');
        if (!finishDate) setFinishDate(new Date().toISOString().split('T')[0]);
      }
    } else {
      setEpisodesWatched(nextVal);
      if (totalEpisodes && nextVal === totalEpisodes && status === 'watching') {
        setStatus('completed');
        if (!finishDate) setFinishDate(new Date().toISOString().split('T')[0]);
      }
    }
  };

  const handleSetMaxEpisodes = () => {
    if (totalEpisodes) {
      setEpisodesWatched(totalEpisodes);
      setStatus('completed');
      if (!finishDate) setFinishDate(new Date().toISOString().split('T')[0]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSyncStatus('idle');

    const payload: MalUpdateStatusPayload = {
      status,
      score,
      num_watched_episodes: episodesWatched,
      is_rewatching: isRewatching,
      start_date: startDate.trim(),
      finish_date: finishDate.trim(),
      comments: comments.trim(),
      priority,
      num_times_rewatched: numTimesRewatched,
    };

    const result = await onSave(anime.id, payload);
    setIsSaving(false);

    if (result.success) {
      setSyncStatus('success');
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      setSyncStatus('error');
      setErrorMessage(result.error || 'Failed to sync with MyAnimeList. Please check your connection.');
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);
    const result = await onDelete(anime.id);
    setIsDeleting(false);

    if (result.success) {
      setSyncStatus('success');
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      setSyncStatus('error');
      setErrorMessage(result.error || 'Failed to remove entry from MyAnimeList.');
    }
  };

  const setTodayDate = (field: 'start' | 'finish') => {
    const today = new Date().toISOString().split('T')[0];
    if (field === 'start') setStartDate(today);
    else setFinishDate(today);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#25242A]/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white dark:bg-[#1C1A24] rounded-2xl shadow-2xl border border-[#E7E3DF] dark:border-[#2E2C37] max-w-xl w-full overflow-hidden text-[#25242A] dark:text-[#EAE8F0] my-6 max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="relative bg-[#F7F5F2] dark:bg-[#25232F] border-b border-[#E7E3DF] dark:border-[#2E2C37] p-4 sm:p-5 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white dark:bg-[#1C1A24] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] border border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D] hover:text-[#25242A] dark:hover:text-[#EAE8F0] transition-colors cursor-pointer"
              title="Close editor"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3.5 pr-8">
              {/* Poster Thumbnail */}
              <div className="w-14 sm:w-16 aspect-[3/4] rounded-xl overflow-hidden bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] shrink-0 shadow-2xs">
                {anime.imageUrl ? (
                  <img
                    src={anime.imageUrl}
                    alt={displayTitle}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#77747D]">
                    <Film className="h-5 w-5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#7567C7]/15 text-[#7567C7] border border-[#7567C7]/30">
                    <Sparkles className="h-3 w-3" />
                    MAL Management
                  </span>
                  {anime.mediaType && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-white dark:bg-[#1C1A24] text-[#77747D] border border-[#E7E3DF] dark:border-[#2E2C37]">
                      {anime.mediaType}
                    </span>
                  )}
                </div>

                <h3 className="text-base sm:text-lg font-bold text-[#25242A] dark:text-[#EAE8F0] truncate leading-tight">
                  {displayTitle}
                </h3>
                {anime.titleNative && (
                  <p className="text-xs text-[#77747D] font-normal truncate mt-0.5">
                    {anime.titleNative}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sync Status Feedback Banner */}
          {syncStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-[#6D9B7C]/15 border-b border-[#6D9B7C]/30 px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-[#6D9B7C]"
            >
              <Check className="h-4 w-4 shrink-0" />
              <span>✓ Synced with MyAnimeList</span>
            </motion.div>
          )}

          {syncStatus === 'error' && errorMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-[#D6A0AF]/20 border-b border-[#D6A0AF]/40 px-4 py-2.5 flex items-center gap-2 text-xs font-semibold text-[#C77B82]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1 leading-snug">{errorMessage}</span>
            </motion.div>
          )}

          {/* Scrollable Form Content */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 text-xs">
            {/* 1. Status Selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA] mb-2">
                Watch Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  const isSelected = status === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleStatusSelect(key as any)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? config.activeClass
                          : `bg-white dark:bg-[#25232F] ${config.bg} ${config.text}`
                      }`}
                    >
                      <Icon className="h-4 w-4 mb-1" />
                      <span className="text-[11px] leading-tight text-center whitespace-nowrap">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Episode Progress & Score (2 Columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Episodes Watched */}
              <div className="p-3.5 rounded-2xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-[#25242A] dark:text-[#EAE8F0]">
                    <Tv className="h-4 w-4 text-[#7567C7]" />
                    <span>Episodes Watched</span>
                  </div>
                  <span className="text-[11px] text-[#77747D]">
                    Total: {totalEpisodes ? `${totalEpisodes} eps` : 'Unknown'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEpisodeChange(-1)}
                    disabled={episodesWatched <= 0}
                    className="p-2 rounded-xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[#25242A] dark:text-[#EAE8F0] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] disabled:opacity-40 transition-colors cursor-pointer"
                    title="Decrement episode"
                  >
                    <Minus className="h-4 w-4" />
                  </button>

                  <input
                    type="number"
                    min="0"
                    max={totalEpisodes || 9999}
                    value={episodesWatched}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setEpisodesWatched(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="w-full text-center py-2 px-3 rounded-xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-sm font-extrabold text-[#25242A] dark:text-[#EAE8F0] focus:border-[#7567C7] outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => handleEpisodeChange(1)}
                    disabled={totalEpisodes !== null && episodesWatched >= totalEpisodes}
                    className="p-2 rounded-xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[#25242A] dark:text-[#EAE8F0] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] disabled:opacity-40 transition-colors cursor-pointer"
                    title="Increment episode"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick actions for episodes */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleEpisodeChange(1)}
                    className="flex-1 py-1 px-2 rounded-lg bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[10px] font-bold text-[#7567C7] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] cursor-pointer"
                  >
                    +1 Ep
                  </button>
                  {totalEpisodes && (
                    <button
                      type="button"
                      onClick={handleSetMaxEpisodes}
                      className="flex-1 py-1 px-2 rounded-lg bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[10px] font-bold text-[#6D9B7C] hover:bg-[#6D9B7C]/15 cursor-pointer"
                    >
                      All ({totalEpisodes})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEpisodesWatched(0)}
                    className="py-1 px-2 rounded-lg bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-[10px] font-medium text-[#77747D] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E] cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Your Score */}
              <div className="p-3.5 rounded-2xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-[#25242A] dark:text-[#EAE8F0]">
                    <Star className="h-4 w-4 text-[#C69A55] fill-current" />
                    <span>Your Rating</span>
                  </div>
                  <span className="text-[11px] font-bold text-[#C69A55]">
                    {SCORE_LABELS[score] || 'Unrated'}
                  </span>
                </div>

                <select
                  value={score}
                  onChange={(e) => setScore(parseInt(e.target.value, 10))}
                  className="w-full py-2 px-3 rounded-xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs font-bold text-[#25242A] dark:text-[#EAE8F0] focus:border-[#7567C7] outline-none cursor-pointer"
                >
                  <option value={0}>0 - Select Rating (Unrated)</option>
                  <option value={10}>10 - (10) Masterpiece</option>
                  <option value={9}>9 - (9) Great</option>
                  <option value={8}>8 - (8) Very Good</option>
                  <option value={7}>7 - (7) Good</option>
                  <option value={6}>6 - (6) Fine</option>
                  <option value={5}>5 - (5) Average</option>
                  <option value={4}>4 - (4) Bad</option>
                  <option value={3}>3 - (3) Very Bad</option>
                  <option value={2}>2 - (2) Horrible</option>
                  <option value={1}>1 - (1) Appalling</option>
                </select>

                {/* Score Quick Chips */}
                <div className="flex flex-wrap gap-1 pt-1 justify-between">
                  {[0, 6, 7, 8, 9, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScore(s)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        score === s
                          ? 'bg-[#C69A55] text-white border-[#C69A55]'
                          : 'bg-white dark:bg-[#1C1A24] border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D] hover:bg-[#F0EDFA] dark:hover:bg-[#32303E]'
                      }`}
                    >
                      {s === 0 ? 'Clear' : `★ ${s}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Dates (Start / Finish) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-[#7567C7]" />
                    <span>Start Date</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTodayDate('start')}
                    className="text-[10px] font-bold text-[#7567C7] hover:underline cursor-pointer"
                  >
                    Set Today
                  </button>
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs text-[#25242A] dark:text-[#EAE8F0] focus:border-[#7567C7] outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-[#6D9B7C]" />
                    <span>Finish Date</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTodayDate('finish')}
                    className="text-[10px] font-bold text-[#6D9B7C] hover:underline cursor-pointer"
                  >
                    Set Today
                  </button>
                </div>
                <input
                  type="date"
                  value={finishDate}
                  onChange={(e) => setFinishDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs text-[#25242A] dark:text-[#EAE8F0] focus:border-[#7567C7] outline-none"
                />
              </div>
            </div>

            {/* 4. Rewatching & Priority */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37]">
              {/* Rewatching checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isRewatching}
                  onChange={(e) => setIsRewatching(e.target.checked)}
                  className="h-4 w-4 rounded text-[#7567C7] focus:ring-[#7567C7] border-gray-300"
                />
                <span className="font-semibold text-[#25242A] dark:text-[#EAE8F0] flex items-center gap-1">
                  <RotateCcw className="h-3.5 w-3.5 text-[#7567C7]" />
                  Currently Rewatching
                </span>
              </label>

              {/* Priority Pills */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D]">Priority:</span>
                {[
                  { val: 0, label: 'Low' },
                  { val: 1, label: 'Medium' },
                  { val: 2, label: 'High' },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setPriority(p.val)}
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                      priority === p.val
                        ? 'bg-[#7567C7] text-white border-[#7567C7]'
                        : 'bg-white dark:bg-[#1C1A24] border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Personal Note / MAL Comments */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Personal Notes (Synced with MAL)</span>
                </label>
                <span className="text-[10px] text-[#77747D]">
                  Stored directly in your MyAnimeList comments
                </span>
              </div>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add your thoughts, watch logs, season impressions, or episode comments..."
                rows={3}
                className="w-full p-3 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs text-[#25242A] dark:text-[#EAE8F0] focus:border-[#7567C7] focus:bg-white dark:focus:bg-[#1C1A24] outline-none leading-relaxed"
              />
            </div>

            {/* 6. Danger Zone: Delete from List (if already exists) */}
            {isExistingEntry && onDelete && (
              <div className="pt-2 border-t border-[#E7E3DF] dark:border-[#2E2C37]">
                {confirmDelete ? (
                  <div className="p-3 rounded-xl bg-[#D6A0AF]/20 border border-[#D6A0AF]/40 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-[#C77B82]">
                      Remove from your MyAnimeList entirely?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-1 rounded-lg border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1C1A24] text-xs font-semibold text-[#77747D] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-3 py-1 rounded-lg bg-[#C77B82] text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
                        <span>Confirm Delete</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs font-semibold text-[#C77B82] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove from MyAnimeList</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-[#F7F5F2] dark:bg-[#25232F] border-t border-[#E7E3DF] dark:border-[#2E2C37] flex items-center justify-between shrink-0">
            <a
              href={`https://myanimelist.net/anime/${anime.id}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7567C7] hover:underline"
            >
              <span>View on MAL</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isDeleting}
                className="px-4 py-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1C1A24] hover:bg-[#F7F5F2] dark:hover:bg-[#32303E] text-[#77747D] dark:text-[#A4A1AA] font-semibold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isDeleting}
                className="px-5 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving to MAL...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{isExistingEntry ? 'Save to MyAnimeList' : 'Add to MyAnimeList'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
