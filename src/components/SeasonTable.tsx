import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  ExternalLink,
  MessageSquare,
  Edit2,
  Check,
  X,
  Plus,
} from 'lucide-react';
import { decodeHtmlEntities } from '../utils/htmlUtils';

export interface SeasonTableItem {
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
}

interface SeasonTableProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  items: SeasonTableItem[];
  badgeText: string;
  badgeBg: string;
  badgeTextClass: string;
  customUserNotes: Record<number, string>;
  onSaveCustomNote: (animeId: number, note: string) => void;
  onSelectAnime?: (item: SeasonTableItem) => void;
  onEditAnime?: (item: SeasonTableItem) => void;
  onQuickIncrement?: (item: SeasonTableItem) => void;
}

export const SeasonTable: React.FC<SeasonTableProps> = ({
  title,
  subtitle,
  icon,
  items,
  badgeText,
  badgeBg,
  badgeTextClass,
  customUserNotes,
  onSaveCustomNote,
  onSelectAnime,
  onEditAnime,
  onQuickIncrement,
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
    <div className="bg-white dark:bg-[#1E1D24] rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xs overflow-hidden mb-8">
      {/* Table Header Section */}
      <div className="p-5 sm:p-6 bg-white dark:bg-[#1E1D24] border-b border-[#E7E3DF] dark:border-[#2E2C37] text-[#25242A] dark:text-[#F4F2F7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#F0EDFA] dark:bg-[#2E2C37] text-[#7567C7]">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-[#25242A] dark:text-[#F4F2F7]">{title}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badgeBg} ${badgeTextClass}`}>
                {items.length} Anime
              </span>
            </div>
            {subtitle && (
              <p className="text-[#77747D] dark:text-[#9E9AA6] text-xs mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-[#F7F5F2] dark:bg-[#26252F] border-b border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D] dark:text-[#9E9AA6] font-bold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-4 text-center w-12">#</th>
              <th className="py-3.5 px-3 w-16">Image</th>
              <th className="py-3.5 px-4 min-w-[200px]">Anime Title</th>
              <th className="py-3.5 px-4 text-center w-24">Score</th>
              <th className="py-3.5 px-4 text-center w-32">Status</th>
              <th className="py-3.5 px-4 text-center w-32">Episodes</th>
              <th className="py-3.5 px-4 min-w-[200px]">Notes</th>
              <th className="py-3.5 px-4 text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E3DF] dark:divide-[#2E2C37] text-[#25242A] dark:text-[#F4F2F7] text-xs font-semibold">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[#77747D] font-medium text-sm bg-[#F7F5F2]/40 dark:bg-[#26252F]/40">
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
                const totalEps = item.node.num_episodes && item.node.num_episodes > 0 ? item.node.num_episodes : null;
                const canIncrement = totalEps === null || watchedEps < totalEps;

                // Note source priority: Custom Local Note > MAL Comments > Synopsis snippet
                const rawMalComment = item.list_status?.comments?.trim();
                const malComment = rawMalComment ? decodeHtmlEntities(rawMalComment) : '';
                const localNote = customUserNotes[animeId]?.trim();
                const displayNote = localNote || malComment || '';
                const truncatedNote = displayNote.length > 50 ? `${displayNote.slice(0, 50)}...` : displayNote;

                return (
                  <tr
                    key={animeId}
                    id={`season-row-${animeId}`}
                    data-season-row={animeId}
                    className="hover:bg-[#F0EDFA]/50 dark:hover:bg-[#2E2C37]/40 transition-colors duration-150 group"
                  >
                    {/* Row Number */}
                    <td className="py-3 px-4 text-center font-bold text-[#77747D] group-hover:text-[#7567C7]">
                      {idx + 1}
                    </td>

                    {/* Image Thumbnail */}
                    <td className="py-2.5 px-3">
                      <div
                        onClick={() => (onSelectAnime ? onSelectAnime(item) : onEditAnime?.(item))}
                        className="h-14 w-10 overflow-hidden rounded-lg bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] shrink-0 cursor-pointer shadow-2xs hover:opacity-90 hover:ring-2 hover:ring-[#7567C7]/50 transition-all"
                        title={`View details for ${titleStr}`}
                      >
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={titleStr}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-[#F0EDFA] dark:bg-[#25232F] text-[#7567C7] font-bold text-[10px]">
                            N/A
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Anime Title */}
                    <td className="py-3 px-4 font-bold text-[#25242A] dark:text-[#F4F2F7] group-hover:text-[#7567C7] transition-colors">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => (onSelectAnime ? onSelectAnime(item) : onEditAnime?.(item))}
                          className="hover:underline hover:text-[#7567C7] text-left leading-snug line-clamp-2 cursor-pointer font-bold text-[#25242A] dark:text-[#F4F2F7] transition-colors"
                          title={`View details for ${titleStr}`}
                        >
                          {titleStr}
                        </button>
                        <a
                          href={`https://myanimelist.net/anime/${animeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#77747D] hover:text-[#7567C7] shrink-0"
                          title={`View on MyAnimeList`}
                        >
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </div>
                      {item.node.alternative_titles?.en && item.node.alternative_titles.en !== titleStr && (
                        <span className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] font-normal block mt-0.5 line-clamp-1">
                          {item.node.alternative_titles.en}
                        </span>
                      )}
                    </td>

                    {/* Score */}
                    <td className="py-3 px-4 text-center">
                      {score !== null ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#25242A]/85 text-[#C69A55] font-bold text-xs backdrop-blur-md">
                          <Star className="h-3 w-3 fill-current text-[#C69A55]" />
                          <span>{score}</span>
                        </div>
                      ) : (
                        <span className="text-[#77747D] font-bold text-sm">-</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        const rawStatus = item.list_status?.status;
                        let badgeClass = `${badgeBg} ${badgeTextClass}`;
                        let label = badgeText;

                        if (rawStatus === 'watching') {
                          badgeClass = 'bg-[#6D9B7C]/15 text-[#6D9B7C] border border-[#6D9B7C]/30';
                          label = 'Watching';
                        } else if (rawStatus === 'plan_to_watch') {
                          badgeClass = 'bg-[#C69A55]/15 text-[#C69A55] border border-[#C69A55]/30';
                          label = 'Plan to Watch';
                        } else if (rawStatus === 'completed') {
                          badgeClass = 'bg-[#7567C7]/20 text-[#7567C7] border border-[#7567C7]/40';
                          label = 'Completed';
                        } else if (rawStatus === 'on_hold') {
                          badgeClass = 'bg-[#8F8A99]/15 text-[#8F8A99] border border-[#8F8A99]/30';
                          label = 'On Hold';
                        } else if (rawStatus === 'dropped') {
                          badgeClass = 'bg-[#D6A0AF]/20 text-[#C77B82] border border-[#D6A0AF]/40';
                          label = 'Dropped';
                        } else if (rawStatus) {
                          label = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).replace(/_/g, ' ');
                        }

                        return (
                          <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wide ${badgeClass}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Episodes */}
                    <td className="py-3 px-4 text-center font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      <div className="inline-flex items-center gap-1.5 bg-[#F7F5F2] dark:bg-[#25232F] px-2.5 py-1 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37]">
                        <span>{watchedEps} / {totalEps || '?'}</span>
                        {onQuickIncrement && canIncrement && (
                          <button
                            type="button"
                            onClick={() => onQuickIncrement(item)}
                            className="p-0.5 rounded-md hover:bg-[#7567C7] text-[#7567C7] hover:text-white transition-colors cursor-pointer"
                            title="Watched +1 Episode"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Notes */}
                    <td className="py-3 px-4">
                      {displayNote ? (
                        <div
                          onClick={() => handleOpenNoteModal(animeId, titleStr, displayNote)}
                          className="group/note cursor-pointer relative bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#F0EDFA] dark:hover:bg-[#2E2C37] p-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] transition-all flex items-start gap-1.5"
                          title="Click to view or edit full note"
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-[#7567C7] mt-0.5 shrink-0" />
                          <span className="text-[11px] text-[#25242A] dark:text-[#F4F2F7] group-hover/note:text-[#7567C7] font-medium leading-tight line-clamp-2">
                            {truncatedNote}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenNoteModal(animeId, titleStr, '')}
                          className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] hover:text-[#7567C7] font-medium flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-[#F0EDFA] dark:hover:bg-[#25232F] transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-3 w-3 text-[#77747D]" />
                          <span>Add note</span>
                        </button>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onEditAnime?.(item)}
                        className="px-2.5 py-1 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#7567C7] text-[#7567C7] hover:text-white border border-[#E7E3DF] dark:border-[#2E2C37] text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer mx-auto"
                        title="Edit on MAL"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#25242A]/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1C1A24] rounded-2xl shadow-2xl border border-[#E7E3DF] dark:border-[#2E2C37] max-w-lg w-full p-6 text-[#25242A] dark:text-[#EAE8F0]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E7E3DF] dark:border-[#2E2C37] mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-[#7567C7]" />
                  <h4 className="font-bold text-base text-[#25242A] dark:text-[#EAE8F0] line-clamp-1">
                    Notes for {activeNoteModal.title}
                  </h4>
                </div>
                <button
                  onClick={() => setActiveNoteModal(null)}
                  className="p-1.5 rounded-full text-[#77747D] hover:text-[#25242A] dark:hover:text-[#EAE8F0] hover:bg-[#F7F5F2] dark:hover:bg-[#25232F] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {activeNoteModal.isEditing ? (
                <div className="space-y-4">
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    placeholder="Type your personal note for this anime..."
                    rows={4}
                    className="w-full p-3.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-[#F7F5F2] dark:bg-[#25232F] focus:border-[#7567C7] text-xs font-medium text-[#25242A] dark:text-[#EAE8F0] leading-relaxed outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setActiveNoteModal({ ...activeNoteModal, isEditing: false })}
                      className="px-4 py-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D] font-bold text-xs hover:bg-[#F7F5F2] dark:hover:bg-[#25232F] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className="px-4 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Check className="h-4 w-4" />
                      <span>Save Note</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#F7F5F2] dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs leading-relaxed text-[#25242A] dark:text-[#EAE8F0] whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {activeNoteModal.fullText || (
                      <span className="text-[#77747D] italic">No note added yet.</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#77747D] font-medium">
                      Synced with MAL and local notes
                    </span>
                    <button
                      onClick={() => setActiveNoteModal({ ...activeNoteModal, isEditing: true })}
                      className="px-4 py-2 rounded-xl bg-[#F0EDFA] dark:bg-[#25232F] hover:bg-[#7567C7] text-[#7567C7] hover:text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
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
