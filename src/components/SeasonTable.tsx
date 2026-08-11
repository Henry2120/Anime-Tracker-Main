import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  ExternalLink,
  MessageSquare,
  Edit2,
  Check,
  X,
  Info,
  Tv,
  Layers,
  Sparkles,
} from 'lucide-react';
import { MalListItem, SeasonalAnimeItem } from '../types';

interface SeasonTableItem {
  node: {
    id: number;
    title: string;
    main_picture?: {
      medium?: string;
      large?: string;
    };
    num_episodes?: number;
    synopsis?: string;
    mean?: number;
    status?: string;
    media_type?: string;
    start_season?: {
      year?: number;
      season?: string;
    };
    alternative_titles?: {
      synonyms?: string[];
      en?: string;
      ja?: string;
    };
  };
  list_status?: {
    status?: string;
    score?: number;
    num_episodes_watched?: number;
    comments?: string;
    tags?: string[];
  };
  isSplitCour?: boolean;
}

interface SeasonTableProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  items: SeasonTableItem[];
  badgeText: string;
  badgeBg: string;
  badgeTextClass: string;
  isSplitCourSection?: boolean;
  customUserNotes: Record<number, string>;
  onSaveCustomNote: (animeId: number, note: string) => void;
}

export const SeasonTable: React.FC<SeasonTableProps> = ({
  title,
  subtitle,
  icon,
  items,
  badgeText,
  badgeBg,
  badgeTextClass,
  isSplitCourSection = false,
  customUserNotes,
  onSaveCustomNote,
}) => {
  const [activeNoteModal, setActiveNoteModal] = useState<{
    animeId: number;
    title: string;
    fullText: string;
    isEditing: boolean;
  } | null>(null);

  const [editingText, setEditingText] = useState<string>('');

  const handleOpenNoteModal = (animeId: number, animeTitle: string, initialNote: string) => {
    setActiveNoteModal({
      animeId,
      title: animeTitle,
      fullText: initialNote,
      isEditing: false,
    });
    setEditingText(initialNote);
  };

  const handleSaveNote = () => {
    if (!activeNoteModal) return;
    onSaveCustomNote(activeNoteModal.animeId, editingText.trim());
    setActiveNoteModal({
      ...activeNoteModal,
      fullText: editingText.trim(),
      isEditing: false,
    });
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-indigo-100/80 shadow-xl overflow-hidden mb-8">
      {/* Table Header Section */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-white/10 text-yellow-400 backdrop-blur-md">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg sm:text-xl font-black tracking-tight">{title}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${badgeBg} ${badgeTextClass}`}>
                {items.length} Anime
              </span>
            </div>
            {subtitle && (
              <p className="text-slate-300 text-xs font-medium mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50/80 border-b border-indigo-100 text-slate-500 font-extrabold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-4 text-center w-12">#</th>
              <th className="py-3.5 px-3 w-16">Image</th>
              <th className="py-3.5 px-4 min-w-[200px]">Anime Title</th>
              <th className="py-3.5 px-4 text-center w-24">Score</th>
              <th className="py-3.5 px-4 text-center w-32">Status</th>
              <th className="py-3.5 px-4 text-center w-28">Episodes</th>
              <th className="py-3.5 px-4 min-w-[220px]">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-50/70 text-slate-700 text-xs font-semibold">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 font-bold text-sm bg-slate-50/30">
                  No anime found in this category.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const animeId = item.node.id;
                const titleStr = item.node.title;
                const imgUrl = item.node.main_picture?.medium || item.node.main_picture?.large;
                const score = item.list_status?.score && item.list_status.score > 0 ? item.list_status.score : null;
                const watchedEps = item.list_status?.num_episodes_watched ?? 0;
                const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : '?';

                // Note source priority: Custom Local Note > MAL Comments > Synopsis snippet
                const malComment = item.list_status?.comments?.trim();
                const localNote = customUserNotes[animeId]?.trim();
                const displayNote = localNote || malComment || '';
                const truncatedNote = displayNote.length > 50 ? `${displayNote.slice(0, 50)}...` : displayNote;

                return (
                  <tr
                    key={animeId}
                    className="hover:bg-indigo-50/40 transition-colors duration-150 group"
                  >
                    {/* Row Number */}
                    <td className="py-3 px-4 text-center font-extrabold text-slate-400 group-hover:text-indigo-600">
                      {idx + 1}
                    </td>

                    {/* Image Thumbnail */}
                    <td className="py-2.5 px-3">
                      <div className="h-14 w-10 overflow-hidden rounded-xl bg-indigo-100 shadow-xs border border-indigo-100/60 shrink-0">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={titleStr}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-indigo-50 text-indigo-300 font-bold text-[10px]">
                            N/A
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Anime Title */}
                    <td className="py-3 px-4 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://myanimelist.net/anime/${animeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1 leading-snug line-clamp-2"
                          title={`View ${titleStr} on MyAnimeList`}
                        >
                          <span>{titleStr}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 shrink-0" />
                        </a>
                      </div>
                      {item.node.alternative_titles?.en && item.node.alternative_titles.en !== titleStr && (
                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5 line-clamp-1">
                          {item.node.alternative_titles.en}
                        </span>
                      )}
                    </td>

                    {/* Score */}
                    <td className="py-3 px-4 text-center">
                      {score !== null ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-100/80 text-yellow-900 font-black text-xs">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          <span>{score}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-extrabold text-sm">-</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-black tracking-wide ${badgeBg} ${badgeTextClass}`}>
                        {badgeText}
                      </span>
                    </td>

                    {/* Episodes */}
                    <td className="py-3 px-4 text-center font-extrabold text-indigo-900">
                      <span className="bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-100">
                        {watchedEps} / {totalEps}
                      </span>
                    </td>

                    {/* Notes */}
                    <td className="py-3 px-4">
                      {displayNote ? (
                        <div
                          onClick={() => handleOpenNoteModal(animeId, titleStr, displayNote)}
                          className="group/note cursor-pointer relative bg-slate-50 hover:bg-indigo-100/60 p-2 rounded-xl border border-indigo-100/80 transition-all flex items-start gap-1.5"
                          title="Click to view or edit full note"
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" />
                          <span className="text-[11px] text-slate-600 group-hover/note:text-slate-900 font-medium leading-tight line-clamp-2">
                            {truncatedNote}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenNoteModal(animeId, titleStr, '')}
                          className="text-[11px] text-slate-400 hover:text-indigo-600 font-semibold flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-3 w-3 text-slate-300" />
                          <span>Add note</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Full Note View / Edit Modal */}
      <AnimatePresence>
        {activeNoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border-2 border-indigo-100 max-w-lg w-full p-6 text-slate-800"
            >
              <div className="flex items-center justify-between pb-3 border-b border-indigo-100 mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-indigo-600" />
                  <h4 className="font-extrabold text-base text-slate-900 line-clamp-1">
                    Notes for {activeNoteModal.title}
                  </h4>
                </div>
                <button
                  onClick={() => setActiveNoteModal(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {activeNoteModal.isEditing ? (
                <div className="space-y-4">
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    placeholder="Type your personal note for this anime..."
                    rows={4}
                    className="w-full p-3.5 rounded-2xl border-2 border-indigo-200 focus:border-indigo-600 focus:ring-0 text-xs font-medium text-slate-800 leading-relaxed outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setActiveNoteModal({ ...activeNoteModal, isEditing: false })}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Check className="h-4 w-4" />
                      <span>Save Note</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {activeNoteModal.fullText || (
                      <span className="text-slate-400 italic">No note added yet.</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">
                      Stored in local preferences & MAL
                    </span>
                    <button
                      onClick={() => setActiveNoteModal({ ...activeNoteModal, isEditing: true })}
                      className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Edit Note</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
