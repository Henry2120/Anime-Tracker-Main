import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Edit3,
  Eye,
  EyeOff,
  Layers,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { saveLocalCoverBlob } from '../services/covers';
import { computeLocalDiscoveryRelations } from '../services/discoveryService';
import {
  deleteReviewOnly,
  saveJournalEntry,
  savePhysicalCopy,
  saveReview,
  softDeleteEntity,
  startReadingCycle,
  switchActiveCycle,
  toggleWorkOnShelf,
  updateCycleStatus,
  updateEdition,
  updateWork,
  upsertEditionIsbn,
} from '../services/libraryService';
import type {
  AcquisitionMethod,
  BookFormat,
  CopyCondition,
  CurrencyCode,
  Edition,
  JournalEntryType,
  OwnershipStatus,
  ReadingStatus,
  Shelf,
  Work,
} from '../types/domain';
import { CURRENCY_OPTIONS, formatCurrency } from '../utils/currency';
import { CoverImage } from './CoverImage';

interface BookDetailModalProps {
  book: EnrichedBookRecord | null;
  allWorks: Work[];
  allEditions: Edition[];
  shelves: Shelf[];
  defaultCurrency: CurrencyCode;
  onClose: () => void;
  onSelectWork?: (workId: string) => void;
  onDeletedWork?: (workId: string, title: string) => void;
}

type DetailTab = 'reading' | 'copies' | 'journal' | 'discovery';

export function BookDetailModal({
  book,
  allWorks,
  allEditions,
  shelves,
  defaultCurrency,
  onClose,
  onSelectWork,
  onDeletedWork,
}: BookDetailModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DetailTab>('reading');
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Add copy form state
  const [showAddCopy, setShowAddCopy] = useState(false);
  const [copyEditionId, setCopyEditionId] = useState('');
  const [copyOwnership, setCopyOwnership] = useState<OwnershipStatus>('owned');
  const [copyFormat, setCopyFormat] = useState<BookFormat>('paperback');
  const [copyCondition, setCopyCondition] = useState<CopyCondition>('new');
  const [copyAcq, setCopyAcq] = useState<AcquisitionMethod>('purchased');
  const [copyPrice, setCopyPrice] = useState('');
  const [copyCurrency, setCopyCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [copySeller, setCopySeller] = useState('');
  const [copyLocation, setCopyLocation] = useState('');
  const [copyDate, setCopyDate] = useState('');
  const [copyNotes, setCopyNotes] = useState('');

  // Review & Journal state
  const [reviewRating, setReviewRating] = useState('5');
  const [reviewHeadline, setReviewHeadline] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSpoilers, setReviewSpoilers] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  const [entryType, setEntryType] = useState<JournalEntryType>('note');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [entryQuote, setEntryQuote] = useState('');
  const [entryCharacter, setEntryCharacter] = useState('');
  const [entryPage, setEntryPage] = useState('');
  const [entrySpoilers, setEntrySpoilers] = useState(false);

  // Edit Work / Edition metadata state
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthors, setMetaAuthors] = useState('');
  const [metaIllustrators, setMetaIllustrators] = useState('');
  const [metaTranslators, setMetaTranslators] = useState('');
  const [metaGenres, setMetaGenres] = useState('');
  const [metaPages, setMetaPages] = useState('');
  const [metaPublisher, setMetaPublisher] = useState('');
  const [newIsbn, setNewIsbn] = useState('');

  useEffect(() => {
    if (!book) return;
    setClosing(false);
    setCopyEditionId(book.primaryEdition.id);
    setCopyCurrency(defaultCurrency);
    setMetaTitle(book.work.title);
    setMetaAuthors(book.work.authors.join(', '));
    setMetaIllustrators(
      (book.work.illustrators ?? book.primaryEdition.illustrators ?? []).join(', ')
    );
    setMetaTranslators(book.primaryEdition.translators.join(', '));
    setMetaGenres(book.work.genres.join(', '));
    setMetaPages(book.primaryEdition.pageCount ? String(book.primaryEdition.pageCount) : '');
    setMetaPublisher(book.primaryEdition.publishers.join(', '));
  }, [book?.work.id, book?.activeCycle?.id, defaultCurrency]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const triggerFolioClose = () => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      onClose();
      return;
    }
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 160);
  };

  useEffect(() => {
    if (!book) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerFolioClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book?.work.id, closing]);

  if (!book) return null;

  const activeCycle = book.activeCycle;
  const activeEdition =
    (activeCycle && book.editions.find((e) => e.id === activeCycle.editionId)) ||
    book.primaryEdition;

  const discovery = computeLocalDiscoveryRelations({
    targetWork: book.work,
    targetEditionId: activeEdition.id,
    allWorks,
    allEditions,
  });

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await saveLocalCoverBlob(activeEdition.id, file);
  };

  const handleSaveCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePhysicalCopy({
      workId: book.work.id,
      editionId: copyEditionId || activeEdition.id,
      ownershipStatus: copyOwnership,
      format: copyFormat,
      condition: copyCondition,
      acquisitionMethod: copyAcq,
      purchaseDate: copyDate || undefined,
      purchasePrice: copyPrice ? Number(copyPrice) : null,
      currency: copyCurrency,
      seller: copySeller || undefined,
      shelfLocation: copyLocation || undefined,
      notes: copyNotes || undefined,
    });
    setShowAddCopy(false);
    setCopyPrice('');
    setCopySeller('');
    setCopyLocation('');
    setCopyNotes('');
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveReview({
      workId: book.work.id,
      editionId: activeEdition.id,
      cycleId: activeCycle?.id ?? null,
      rating: reviewRating ? Number(reviewRating) : null,
      headline: reviewHeadline,
      body: reviewBody,
      hasSpoilers: reviewSpoilers,
    });
    setReviewHeadline('');
    setReviewBody('');
  };

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveJournalEntry({
      workId: book.work.id,
      editionId: activeEdition.id,
      cycleId: activeCycle?.id ?? null,
      entryType,
      title: entryTitle,
      content: entryContent,
      quoteText: entryQuote,
      characterName: entryCharacter,
      pageNumber: entryPage ? Number(entryPage) : null,
      hasSpoilers: entrySpoilers,
    });
    setEntryTitle('');
    setEntryContent('');
    setEntryQuote('');
    setEntryCharacter('');
    setEntryPage('');
  };

  const handleSaveMetadataEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const illustrators = metaIllustrators
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const translators = metaTranslators
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await updateWork(book.work.id, {
      title: metaTitle.trim() || book.work.title,
      authors: metaAuthors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      illustrators,
      genres: metaGenres
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    await updateEdition(activeEdition.id, {
      illustrators,
      translators,
      pageCount: metaPages ? Number(metaPages) || null : null,
      publishers: metaPublisher
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (newIsbn.trim()) {
      await upsertEditionIsbn(activeEdition.id, newIsbn.trim());
      setNewIsbn('');
    }
    setEditingMeta(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerFolioClose();
      }}
    >
      {/* Physical Open Leather-Bound Ancient Folio Spread */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Open Folio: ${book.work.title}`}
        className={`archive-modal archive-walnut-panel flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border-2 border-[#B49A67]/50 text-[#F4EFE6] shadow-[0_28px_72px_rgba(0,0,0,0.92)] ${
          closing ? 'archive-folio-closing' : 'archive-folio-spread'
        }`}
      >
        {/* Top Carved Spine Crown Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[#B49A67]/30 bg-[#1B120D]/90 px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Bookmark className="h-4 w-4 text-[#D6BD8A] shrink-0" />
            <span className="font-archive-display text-[11px] uppercase tracking-[0.2em] text-[#D6BD8A] truncate">
              Open Ancient Archive Folio · Accession Spread
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditingMeta((v) => !v)}
              title="Edit Work Metadata"
              className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border transition-colors ${
                editingMeta
                  ? 'border-[#D6BD8A] bg-[#392A24] text-[#D6BD8A]'
                  : 'border-transparent text-[#AEB9C9] hover:border-[#B49A67]/30 hover:text-[#D6BD8A]'
              }`}
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Delete Book"
              onClick={async () => {
                await softDeleteEntity('works', book.work.id);
                onDeletedWork?.(book.work.id, book.work.title);
                onClose();
              }}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-transparent text-rose-400 hover:border-rose-400/30 hover:bg-rose-950/40 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={triggerFolioClose}
              aria-label="Close Folio and Return to Shelf"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-transparent text-[#AEB9C9] hover:border-[#B49A67]/30 hover:text-[#F4EFE6] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Inline Metadata Editor */}
        {editingMeta && (
          <form
            onSubmit={handleSaveMetadataEdit}
            className="border-b border-[#B49A67]/25 bg-[#11192B] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Title"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <input
              value={metaAuthors}
              onChange={(e) => setMetaAuthors(e.target.value)}
              placeholder="Authors (comma-separated)"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <input
              value={metaIllustrators}
              onChange={(e) => setMetaIllustrators(e.target.value)}
              placeholder="Illustrators (comma-separated)"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <input
              value={metaTranslators}
              onChange={(e) => setMetaTranslators(e.target.value)}
              placeholder="Translators (comma-separated)"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <input
              value={metaGenres}
              onChange={(e) => setMetaGenres(e.target.value)}
              placeholder="Genres (comma-separated)"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <input
              value={metaPublisher}
              onChange={(e) => setMetaPublisher(e.target.value)}
              placeholder="Publishers"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <input
              type="number"
              value={metaPages}
              onChange={(e) => setMetaPages(e.target.value)}
              placeholder="Page count"
              className="archive-input rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs"
            />
            <div className="flex gap-2 sm:col-span-2">
              <input
                value={newIsbn}
                onChange={(e) => setNewIsbn(e.target.value)}
                placeholder="Add ISBN-13 / ISBN-10 / EAN-13"
                className="archive-input flex-1 rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-xs font-mono"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-[#B49A67] px-3 py-1.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          </form>
        )}

        {/* Two-Page Book Spread Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 relative bg-[#0B1120]/96">
          {/* Central Book Binding Crease Line (Desktop) */}
          <div
            aria-hidden="true"
            className="hidden lg:block pointer-events-none absolute inset-y-0 left-[33.333%] w-8 -translate-x-1/2 archive-folio-gutter z-10"
          />

          {/* LEFT FOLIO PAGE: Illumination Plate, Accession Ledger & Shelf Bookmarks */}
          <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#B49A67]/25 bg-gradient-to-br from-[#141D30]/95 via-[#0E1626] to-[#0B1120] p-5 space-y-4">
            <div className="flex lg:flex-col items-start lg:items-center gap-4 lg:text-center">
              <div className="relative w-24 sm:w-28 lg:w-36 shrink-0">
                <div className="overflow-hidden rounded-lg border border-[#B49A67]/45 shadow-xl">
                  <CoverImage
                    title={book.work.title}
                    author={book.work.authors[0]}
                    edition={activeEdition}
                  />
                </div>
                <label className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-[#B49A67]/35 bg-[#0B1120]/80 py-1 text-[10px] font-medium text-[#D6BD8A] hover:bg-[#141E30] transition-colors">
                  <Upload className="h-3 w-3" />
                  Replace Cover
                  <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </label>
              </div>

              <div className="min-w-0 space-y-1.5">
                <h2 className="font-editorial text-xl sm:text-2xl font-bold text-[#F4EFE6] leading-tight">
                  {book.work.title}
                </h2>
                <p className="text-sm text-[#D6BD8A]">
                  {book.work.authors.join(', ') || 'Unknown Author'}
                </p>

                {((book.work.illustrators && book.work.illustrators.length > 0) ||
                  (activeEdition.illustrators && activeEdition.illustrators.length > 0) ||
                  activeEdition.translators.length > 0) && (
                  <p className="text-xs text-[#AEB9C9]">
                    {((book.work.illustrators?.length
                      ? book.work.illustrators
                      : activeEdition.illustrators) ?? []).length > 0 && (
                      <span>
                        Illus.{' '}
                        {(
                          (book.work.illustrators?.length
                            ? book.work.illustrators
                            : activeEdition.illustrators) ?? []
                        ).join(', ')}
                      </span>
                    )}
                    {((book.work.illustrators?.length
                      ? book.work.illustrators
                      : activeEdition.illustrators) ?? []).length > 0 &&
                      activeEdition.translators.length > 0 && <span> · </span>}
                    {activeEdition.translators.length > 0 && (
                      <span>Trans. {activeEdition.translators.join(', ')}</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Folio Colophon Stamp */}
            <div className="rounded-xl border border-[#B49A67]/25 bg-[#0B1120]/70 p-3 space-y-1.5 text-xs font-mono text-[#AEB9C9]">
              <div className="flex justify-between">
                <span>Owned Copies</span>
                <span className="font-bold text-[#F4EFE6]">{book.ownedCopiesCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Cataloged Editions</span>
                <span className="font-bold text-[#F4EFE6]">{book.editions.length}</span>
              </div>
              {book.isbns[0] && (
                <div className="flex justify-between">
                  <span>Registry ID</span>
                  <span className="font-bold text-[#D6BD8A]">{book.isbns[0].isbn13}</span>
                </div>
              )}
              {book.latestRating != null && (
                <div className="flex justify-between">
                  <span>Latest Seal</span>
                  <span className="inline-flex items-center gap-1 text-[#D6BD8A] font-bold">
                    <Star className="h-3.5 w-3.5 fill-[#D6BD8A] text-[#D6BD8A]" />
                    {book.latestRating}
                  </span>
                </div>
              )}
            </div>

            {/* Shelf Placement Ribbons */}
            {shelves.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-archive-display uppercase tracking-widest text-[#B49A67]">
                  Shelf Assignments
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {shelves.map((s) => {
                    const active = book.shelfIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleWorkOnShelf(s.id, book.work.id, activeEdition.id)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? 'border-[#D6BD8A] bg-[#B49A67]/25 text-[#D6BD8A]'
                            : 'border-[#B49A67]/25 bg-[#0B1120]/70 text-[#AEB9C9] hover:border-[#B49A67]/60'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>

          {/* RIGHT FOLIO PAGE: Woven Ribbon Tabs + Page-Turning Chapters */}
          <div className="lg:col-span-8 flex flex-col min-w-0">
            {/* Bookmark Ribbon Tabs */}
            <div className="flex overflow-x-auto border-b border-[#B49A67]/30 bg-[#101827] px-3 sm:px-5 pt-2 gap-1.5">
              {(
                [
                  ['reading', t('book.readingCycles'), BookOpen],
                  ['copies', `${t('book.physicalCopies')} (${book.copies.length})`, Layers],
                  [
                    'journal',
                    `${t('book.journal')} (${book.reviews.length + book.journalEntries.length})`,
                    Quote,
                  ],
                  ['discovery', t('book.discovery'), RefreshCw],
                ] as const
              ).map(([id, label, Icon]) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`flex min-h-[42px] items-center gap-1.5 rounded-t-xl border-x border-t px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? 'border-[#B49A67]/50 bg-[#0B1120] text-[#D6BD8A] -mb-px pb-2.5'
                        : 'border-transparent text-[#AEB9C9] hover:text-[#F4EFE6]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Active Folio Page Leaf */}
            <div key={tab} className="animate-folio-page-turn flex-1 p-5 space-y-5">
              {tab === 'reading' && (
                <div className="space-y-5">
                  <div className="archive-panel rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#D6BD8A]">
                          Reading Cycles
                        </span>
                        {book.cycles.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => switchActiveCycle(book.work.id, c.id)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              c.id === activeCycle?.id
                                ? 'border-[#D6BD8A] bg-[#B49A67]/20 text-[#D6BD8A]'
                                : 'border-[#B49A67]/25 bg-[#0B1120]/60 text-[#AEB9C9] hover:border-[#B49A67]/50'
                            }`}
                          >
                            Cycle #{c.cycleNumber} ({c.status.replace('_', ' ')})
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          startReadingCycle({
                            workId: book.work.id,
                            editionId: activeEdition.id,
                            status: 'currently_reading',
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-[#B49A67] px-3 py-1.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {book.cycles.length > 0 ? t('book.reread') : t('book.startNewCycle')}
                      </button>
                    </div>

                    {activeCycle ? (
                      <div className="space-y-4 pt-3 border-t border-[#B49A67]/20">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                              Cycle Status
                            </label>
                            <select
                              value={activeCycle.status}
                              onChange={(e) =>
                                updateCycleStatus(activeCycle.id, e.target.value as ReadingStatus)
                              }
                              className="archive-input w-full rounded-lg border px-3 py-2 text-xs font-medium"
                            >
                              <option value="want_to_read">Want to Read</option>
                              <option value="currently_reading">Currently Reading</option>
                              <option value="finished">Finished</option>
                              <option value="on_hold">On Hold</option>
                              <option value="abandoned">Abandoned</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                              Started
                            </label>
                            <input
                              type="date"
                              value={activeCycle.startedAt ?? ''}
                              onChange={(e) =>
                                updateCycleStatus(activeCycle.id, activeCycle.status, {
                                  startedAt: e.target.value || null,
                                })
                              }
                              className="archive-input w-full rounded-lg border px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                              Finished
                            </label>
                            <input
                              type="date"
                              value={activeCycle.finishedAt ?? ''}
                              onChange={(e) =>
                                updateCycleStatus(activeCycle.id, activeCycle.status, {
                                  finishedAt: e.target.value || null,
                                })
                              }
                              className="archive-input w-full rounded-lg border px-3 py-2 text-xs"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-[#AEB9C9]">{t('book.trackCycleHint')}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-[#AEB9C9]">
                        No reading cycle started yet. Click &ldquo;{t('book.startNewCycle')}&rdquo; to begin tracking.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {tab === 'copies' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#F4EFE6]">
                      Editions ({book.editions.length}) &amp; Physical Copies ({book.copies.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowAddCopy((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#B49A67] px-3 py-1.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('book.addCopy')}
                    </button>
                  </div>

                  {showAddCopy && (
                    <form
                      onSubmit={handleSaveCopy}
                      className="archive-panel rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
                    >
                      <div>
                        <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                          Edition
                        </label>
                        <select
                          value={copyEditionId}
                          onChange={(e) => setCopyEditionId(e.target.value)}
                          className="archive-input w-full rounded-lg border px-2.5 py-2 text-xs"
                        >
                          {book.editions.map((ed) => (
                            <option key={ed.id} value={ed.id}>
                              {ed.editionName || ed.title} ({ed.language.toUpperCase()})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                          Ownership Status
                        </label>
                        <select
                          value={copyOwnership}
                          onChange={(e) => setCopyOwnership(e.target.value as OwnershipStatus)}
                          className="archive-input w-full rounded-lg border px-2.5 py-2 text-xs"
                        >
                          <option value="owned">Owned</option>
                          <option value="wishlist">Wishlist</option>
                          <option value="ordered">Ordered</option>
                          <option value="sold">Sold</option>
                          <option value="given_away">Given Away</option>
                          <option value="lost">Lost</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                          Format
                        </label>
                        <select
                          value={copyFormat}
                          onChange={(e) => setCopyFormat(e.target.value as BookFormat)}
                          className="archive-input w-full rounded-lg border px-2.5 py-2 text-xs"
                        >
                          <option value="paperback">Paperback</option>
                          <option value="hardcover">Hardcover</option>
                          <option value="bunko">Bunko</option>
                          <option value="tankobon">Tankobon</option>
                          <option value="box_set">Box Set</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                          Condition
                        </label>
                        <select
                          value={copyCondition}
                          onChange={(e) => setCopyCondition(e.target.value as CopyCondition)}
                          className="archive-input w-full rounded-lg border px-2.5 py-2 text-xs"
                        >
                          <option value="new">New</option>
                          <option value="like_new">Like New</option>
                          <option value="very_good">Very Good</option>
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="poor">Poor</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                          Acquisition
                        </label>
                        <select
                          value={copyAcq}
                          onChange={(e) => setCopyAcq(e.target.value as AcquisitionMethod)}
                          className="archive-input w-full rounded-lg border px-2.5 py-2 text-xs"
                        >
                          <option value="purchased">Purchased</option>
                          <option value="gift">Gift</option>
                          <option value="exchange">Exchange</option>
                          <option value="review_copy">Review Copy</option>
                          <option value="inherited">Inherited</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#D6BD8A] mb-1">
                          Price
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={copyPrice}
                            onChange={(e) => setCopyPrice(e.target.value)}
                            className="archive-input flex-1 min-w-0 rounded-lg border px-2.5 py-2 text-xs font-mono"
                          />
                          <select
                            value={copyCurrency}
                            onChange={(e) => setCopyCurrency(e.target.value as CurrencyCode)}
                            className="archive-input w-20 rounded-lg border px-1.5 py-2 text-xs font-mono"
                          >
                            {CURRENCY_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <input
                        value={copySeller}
                        onChange={(e) => setCopySeller(e.target.value)}
                        placeholder="Seller / Shop"
                        className="archive-input rounded-lg border px-2.5 py-2 text-xs"
                      />
                      <input
                        value={copyLocation}
                        onChange={(e) => setCopyLocation(e.target.value)}
                        placeholder="Shelf Location"
                        className="archive-input rounded-lg border px-2.5 py-2 text-xs"
                      />
                      <input
                        type="date"
                        value={copyDate}
                        onChange={(e) => setCopyDate(e.target.value)}
                        className="archive-input rounded-lg border px-2.5 py-2 text-xs"
                      />
                      <div className="sm:col-span-2">
                        <input
                          value={copyNotes}
                          onChange={(e) => setCopyNotes(e.target.value)}
                          placeholder="Notes (obi, signed, dust jacket...)"
                          className="archive-input w-full rounded-lg border px-2.5 py-2 text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg bg-[#B49A67] px-4 py-2 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] transition-colors"
                      >
                        Save Copy
                      </button>
                    </form>
                  )}

                  {book.copies.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#B49A67]/30 bg-[#101827]/70 p-6 text-center text-xs text-[#AEB9C9]">
                      0 physical copies recorded. You can still track reading cycles and journal notes for this book.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {book.copies.map((c, idx) => {
                        const ed = book.editions.find((e) => e.id === c.editionId);
                        return (
                          <div
                            key={c.id}
                            className="archive-panel flex items-start justify-between gap-3 rounded-xl p-3.5 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-[#F4EFE6]">
                                  Copy #{idx + 1} · {c.ownershipStatus.replace('_', ' ')}
                                </span>
                                <span className="font-mono text-[#AEB9C9]">
                                  {c.format} · {c.condition.replace('_', ' ')}
                                </span>
                                {c.purchasePrice != null && (
                                  <span className="font-mono font-semibold text-[#D6BD8A]">
                                    {formatCurrency(c.purchasePrice, c.currency)}
                                  </span>
                                )}
                              </div>
                              <p className="text-[#AEB9C9]">
                                {ed?.editionName || ed?.publishers.join(', ') || ed?.title}
                                {c.seller ? ` · Seller: ${c.seller}` : ''}
                                {c.shelfLocation ? ` · Shelf: ${c.shelfLocation}` : ''}
                                {c.purchaseDate ? ` · ${c.purchaseDate}` : ''}
                              </p>
                              {c.notes && <p className="text-[#F4EFE6]/85">{c.notes}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => softDeleteEntity('physical_copies', c.id)}
                              className="p-1.5 text-rose-400 hover:text-rose-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {tab === 'journal' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleSaveReview}
                    className="archive-panel rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#D6BD8A]">
                        {t('journal.addReview')}
                      </span>
                      <span className="text-[11px] text-[#AEB9C9]">
                        {t('journal.deleteReviewSafe')}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={reviewRating}
                        onChange={(e) => setReviewRating(e.target.value)}
                        className="archive-input rounded-lg border px-2.5 py-2 text-xs"
                      >
                        {['5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1', '0.5'].map(
                          (v) => (
                            <option key={v} value={v}>
                              {v} / 5 Stars
                            </option>
                          )
                        )}
                      </select>
                      <input
                        value={reviewHeadline}
                        onChange={(e) => setReviewHeadline(e.target.value)}
                        placeholder="Review headline"
                        className="archive-input sm:col-span-2 rounded-lg border px-3 py-2 text-xs"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      placeholder="Write your thoughts..."
                      className="archive-input w-full rounded-lg border px-3 py-2 text-xs"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#AEB9C9]">
                        <input
                          type="checkbox"
                          checked={reviewSpoilers}
                          onChange={(e) => setReviewSpoilers(e.target.checked)}
                        />
                        Spoiler warning
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg bg-[#B49A67] px-4 py-1.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] transition-colors"
                      >
                        Save Review
                      </button>
                    </div>
                  </form>

                  <form
                    onSubmit={handleSaveJournal}
                    className="archive-panel rounded-xl p-4 space-y-3"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <select
                        value={entryType}
                        onChange={(e) => setEntryType(e.target.value as JournalEntryType)}
                        className="archive-input rounded-lg border px-2.5 py-2 text-xs"
                      >
                        <option value="note">Reading Note</option>
                        <option value="quote">Favourite Quote</option>
                        <option value="character">Favourite Character</option>
                        <option value="reflection">Personal Reflection</option>
                      </select>
                      <input
                        type="number"
                        value={entryPage}
                        onChange={(e) => setEntryPage(e.target.value)}
                        placeholder="Page #"
                        className="archive-input rounded-lg border px-2.5 py-2 text-xs font-mono"
                      />
                      {entryType === 'character' ? (
                        <input
                          value={entryCharacter}
                          onChange={(e) => setEntryCharacter(e.target.value)}
                          placeholder="Character name"
                          className="archive-input col-span-2 rounded-lg border px-2.5 py-2 text-xs"
                        />
                      ) : (
                        <input
                          value={entryTitle}
                          onChange={(e) => setEntryTitle(e.target.value)}
                          placeholder="Title / Chapter"
                          className="archive-input col-span-2 rounded-lg border px-2.5 py-2 text-xs"
                        />
                      )}
                    </div>
                    {entryType === 'quote' && (
                      <textarea
                        rows={2}
                        value={entryQuote}
                        onChange={(e) => setEntryQuote(e.target.value)}
                        placeholder="Exact passage or quote..."
                        className="archive-input w-full rounded-lg border px-3 py-2 text-xs italic"
                      />
                    )}
                    <textarea
                      rows={2}
                      value={entryContent}
                      onChange={(e) => setEntryContent(e.target.value)}
                      placeholder="Commentary, note, or reflection..."
                      className="archive-input w-full rounded-lg border px-3 py-2 text-xs"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#AEB9C9]">
                        <input
                          type="checkbox"
                          checked={entrySpoilers}
                          onChange={(e) => setEntrySpoilers(e.target.checked)}
                        />
                        Spoiler warning
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg border border-[#B49A67]/50 bg-[#1B2740] px-4 py-1.5 text-xs font-semibold text-[#D6BD8A] hover:bg-[#243354] transition-colors"
                      >
                        Add Journal Entry
                      </button>
                    </div>
                  </form>

                  {/* Saved Reviews & Entries (Aged Parchment Folios) */}
                  <div className="space-y-2.5">
                    {book.reviews.map((r) => {
                      const hidden = r.hasSpoilers && !revealedIds[r.id];
                      return (
                        <div
                          key={r.id}
                          className="archive-parchment-sheet rounded-xl p-4 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-[#6F4314]">
                                ★ {r.rating ?? '—'}
                              </span>
                              <span className="font-editorial text-sm font-semibold archive-parchment-ink">
                                {r.headline || 'Review'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {r.hasSpoilers && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedIds((p) => ({ ...p, [r.id]: !p[r.id] }))
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-[#6F4314]/35 px-2 py-0.5 text-[11px] font-medium text-[#5A3410] hover:bg-[#5A3410]/10"
                                >
                                  {hidden ? (
                                    <Eye className="h-3.5 w-3.5" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  )}
                                  {hidden ? 'Unseal' : 'Seal'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteReviewOnly(r.id)}
                                className="p-1 text-[#8B2318] hover:text-[#65130B]"
                                title="Delete Review Only (preserves reading history)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {hidden ? (
                            <p className="italic text-[#5A442C]">{t('journal.spoilerWarning')}</p>
                          ) : (
                            <p className="archive-parchment-ink whitespace-pre-wrap">{r.body}</p>
                          )}
                        </div>
                      );
                    })}

                    {book.journalEntries.map((j) => {
                      const hidden = j.hasSpoilers && !revealedIds[j.id];
                      return (
                        <div
                          key={j.id}
                          className="archive-parchment-sheet rounded-xl p-4 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono uppercase text-[11px] text-[#6F4314] font-semibold">
                              {j.entryType}
                              {j.pageNumber != null ? ` · p.${j.pageNumber}` : ''}
                              {j.characterName ? ` · ${j.characterName}` : ''}
                            </span>
                            <div className="flex items-center gap-2">
                              {j.hasSpoilers && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedIds((p) => ({ ...p, [j.id]: !p[j.id] }))
                                  }
                                  className="rounded border border-[#6F4314]/35 px-2 py-0.5 text-[11px] font-medium text-[#5A3410] hover:bg-[#5A3410]/10"
                                >
                                  {hidden ? 'Unseal' : 'Seal'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => softDeleteEntity('journal_entries', j.id)}
                                className="p-1 text-[#8B2318] hover:text-[#65130B]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {hidden ? (
                            <p className="italic text-[#5A442C]">{t('journal.spoilerWarning')}</p>
                          ) : (
                            <>
                              {j.quoteText && (
                                <blockquote className="border-l-2 border-[#6F4314] pl-3 italic archive-parchment-ink">
                                  &ldquo;{j.quoteText}&rdquo;
                                </blockquote>
                              )}
                              {j.content && (
                                <p className="archive-parchment-ink whitespace-pre-wrap">
                                  {j.content}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'discovery' && (
                <div className="space-y-4">
                  <div className="archive-panel rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[#D6BD8A]">
                      Other Editions of this Work ({discovery.otherEditionsOfWork.length})
                    </h4>
                    {discovery.otherEditionsOfWork.length === 0 ? (
                      <p className="text-xs text-[#AEB9C9]">
                        Only one edition cataloged for this Work so far.
                      </p>
                    ) : (
                      discovery.otherEditionsOfWork.map((ed) => (
                        <div key={ed.id} className="text-xs border-t border-[#B49A67]/20 pt-2">
                          <p className="font-semibold text-[#F4EFE6]">
                            {ed.editionName || ed.title}
                          </p>
                          <p className="text-[#AEB9C9]">
                            {ed.language.toUpperCase()} · {ed.format} ·{' '}
                            {ed.publishers.join(', ') || 'Unknown Publisher'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {(
                    [
                      ['Same Author in Your Library', discovery.sameAuthorWorks],
                      ['Same Publisher', discovery.samePublisherWorks],
                      ['Similar Genre', discovery.similarGenreWorks],
                    ] as const
                  ).map(([heading, list]) => (
                    <div key={heading} className="archive-panel rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#D6BD8A]">
                        {heading} ({list.length})
                      </h4>
                      {list.length === 0 ? (
                        <p className="text-xs text-[#AEB9C9]">No matches in your library yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {list.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => onSelectWork?.(w.id)}
                              className="rounded-lg border border-[#B49A67]/30 bg-[#0B1120]/70 px-3 py-1.5 text-xs font-medium text-[#F4EFE6] hover:border-[#D6BD8A] hover:text-[#D6BD8A] transition-colors"
                            >
                              {w.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
