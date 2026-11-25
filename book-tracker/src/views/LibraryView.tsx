import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Edit3,
  FolderPlus,
  Layers,
  Library,
  Plus,
  ScanBarcode,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { deleteShelf, saveShelf } from '../services/libraryService';
import type { BookFormat, Shelf } from '../types/domain';
import { getDeterministicBookSpineStyle } from '../utils/bookSpine';

interface LibraryViewProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  viewMode: 'shelves' | 'catalog';
  onChangeViewMode: (mode: 'shelves' | 'catalog') => void;
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
  onOpenBatchScan: () => void;
}

type ShelfBucketKey = '__all__' | '__unshelved__' | string;

export function LibraryView({
  books,
  shelves,
  viewMode,
  onChangeViewMode,
  onOpenBook,
  onOpenAddBook,
  onOpenBatchScan,
}: LibraryViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'wishlist'>('all');
  const [formatFilter, setFormatFilter] = useState<BookFormat | 'all'>('all');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');

  // Visual Bookshelves aisle state
  const [selectedShelfKey, setSelectedShelfKey] = useState<ShelfBucketKey>('__all__');
  const [aisleDisplay, setAisleDisplay] = useState<'spines' | 'covers'>('spines');
  const [inspectedWorkId, setInspectedWorkId] = useState<string | null>(null);

  // Shelf CRUD UI state
  const [showShelfInput, setShowShelfInput] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');
  const [renamingShelfId, setRenamingShelfId] = useState<string | null>(null);
  const [renameShelfText, setRenameShelfText] = useState('');
  const [confirmDeleteShelfId, setConfirmDeleteShelfId] = useState<string | null>(null);

  const languages = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.editions.forEach((e) => set.add(e.language.toUpperCase())));
    return Array.from(set).sort();
  }, [books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (ownershipFilter === 'owned' && b.ownedCopiesCount === 0) return false;
      if (ownershipFilter === 'wishlist' && b.wishlistCopiesCount === 0) return false;
      if (shelfFilter !== 'all' && !b.shelfIds.includes(shelfFilter)) return false;
      if (formatFilter !== 'all' && !b.editions.some((e) => e.format === formatFilter)) return false;
      if (langFilter !== 'all' && !b.editions.some((e) => e.language.toUpperCase() === langFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        b.work.title,
        b.work.originalTitle ?? '',
        b.work.authors.join(' '),
        b.editions.map((e) => e.publishers.join(' ')).join(' '),
        b.isbns.map((i) => `${i.isbn13} ${i.isbn10 ?? ''}`).join(' '),
        b.work.genres.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [books, query, ownershipFilter, formatFilter, langFilter, shelfFilter]);

  // Books displayed inside the active Visual Bookshelf aisle
  const aisleBooks = useMemo(() => {
    const base = filtered;
    if (selectedShelfKey === '__all__') return base;
    if (selectedShelfKey === '__unshelved__') {
      return base.filter((b) => b.shelfIds.length === 0);
    }
    return base.filter((b) => b.shelfIds.includes(selectedShelfKey));
  }, [filtered, selectedShelfKey]);

  // Chunk books into balanced walnut shelf rows (10-12 spines per ledge)
  const shelfRows = useMemo(() => {
    const chunkSize = aisleDisplay === 'spines' ? 11 : 6;
    const rows: EnrichedBookRecord[][] = [];
    for (let i = 0; i < aisleBooks.length; i += chunkSize) {
      rows.push(aisleBooks.slice(i, i + chunkSize));
    }
    return rows;
  }, [aisleBooks, aisleDisplay]);

  const inspectedBook =
    aisleBooks.find((b) => b.work.id === inspectedWorkId) ?? aisleBooks[0] ?? null;

  const activeShelfObj = shelves.find((s) => s.id === selectedShelfKey) ?? null;

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelfName.trim()) return;
    const created = await saveShelf({ name: newShelfName.trim() });
    setNewShelfName('');
    setShowShelfInput(false);
    setSelectedShelfKey(created.id);
  };

  const handleRenameShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingShelfId || !renameShelfText.trim()) return;
    await saveShelf({ id: renamingShelfId, name: renameShelfText.trim() });
    setRenamingShelfId(null);
    setRenameShelfText('');
  };

  const handleDeleteShelf = async (shelfId: string) => {
    await deleteShelf(shelfId);
    if (selectedShelfKey === shelfId) {
      setSelectedShelfKey('__all__');
    }
    setConfirmDeleteShelfId(null);
  };

  return (
    <div className="space-y-5">
      {/* Grand Stacks Top Control Bar */}
      <div className="archive-panel rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-[#AEB9C9]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="archive-input w-full min-h-[42px] rounded-xl border pl-10 pr-4 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Primary View Mode Toggle: Visual Bookshelves vs Catalog View */}
            <div className="inline-flex rounded-xl border border-[#B49A67]/35 bg-[#0B1120] p-1">
              <button
                type="button"
                onClick={() => onChangeViewMode('shelves')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  viewMode === 'shelves'
                    ? 'bg-[#392A24] text-[#D6BD8A] border border-[#B49A67]/40'
                    : 'text-[#AEB9C9] hover:text-[#F4EFE6]'
                }`}
              >
                <Library className="h-3.5 w-3.5" />
                {t('library.shelvesView')}
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('catalog')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  viewMode === 'catalog'
                    ? 'bg-[#141E30] text-[#7797C9] border border-[#7797C9]/45'
                    : 'text-[#AEB9C9] hover:text-[#F4EFE6]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {t('library.catalogView')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowShelfInput((v) => !v)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#B49A67]/35 bg-[#101827] px-3 text-xs font-semibold text-[#D6BD8A] hover:border-[#B49A67]"
            >
              <FolderPlus className="h-4 w-4" />
              New Shelf
            </button>

            <button
              type="button"
              onClick={onOpenBatchScan}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#7797C9]/40 bg-[#141E30] px-3 text-xs font-semibold text-[#AEB9C9] hover:text-[#F4EFE6]"
            >
              <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
              {t('action.batchScan')}
            </button>

            <button
              type="button"
              onClick={onOpenAddBook}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
            >
              <Plus className="h-4 w-4" />
              {t('action.addBook')}
            </button>
          </div>
        </div>

        {showShelfInput && (
          <form onSubmit={handleCreateShelf} className="flex flex-wrap gap-2 pt-1">
            <input
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              placeholder="Shelf name (e.g. Vietnamese Classics, Folklore, Light Novels)..."
              className="archive-input flex-1 min-w-[200px] min-h-[40px] rounded-xl border px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="min-h-[40px] rounded-xl bg-[#B49A67] px-4 py-2 text-xs font-semibold text-[#0B1120]"
            >
              Create Shelf
            </button>
          </form>
        )}

        {/* Facet Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(['all', 'owned', 'wishlist'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setOwnershipFilter(f)}
              className={`min-h-[34px] rounded-lg border px-3 py-1 text-xs font-semibold capitalize ${
                ownershipFilter === f
                  ? 'border-[#B49A67] bg-[#392A24] text-[#D6BD8A]'
                  : 'border-[#B49A67]/20 bg-[#0B1120]/70 text-[#AEB9C9] hover:text-[#F4EFE6]'
              }`}
            >
              {f}
            </button>
          ))}

          {viewMode === 'catalog' && (
            <select
              value={shelfFilter}
              onChange={(e) => setShelfFilter(e.target.value)}
              className="archive-input min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-medium"
            >
              <option value="all">All Shelves</option>
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  Shelf: {s.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value as BookFormat | 'all')}
            className="archive-input min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-medium"
          >
            <option value="all">All Formats</option>
            <option value="paperback">Paperback</option>
            <option value="hardcover">Hardcover</option>
            <option value="bunko">Bunko</option>
            <option value="tankobon">Tankobon</option>
            <option value="box_set">Box Set</option>
            <option value="ebook">E-book</option>
          </select>

          <select
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value)}
            className="archive-input min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-medium"
          >
            <option value="all">All Languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <span className="ml-auto font-mono text-[11px] text-[#AEB9C9] tabular-nums">
            {viewMode === 'shelves' ? aisleBooks.length : filtered.length} volume(s)
          </span>
        </div>
      </div>

      {/* MODE 1: VISUAL BOOKSHELVES & SHELF AISLE */}
      {viewMode === 'shelves' && (
        <div className="space-y-5">
          {/* Interactive Dark Walnut Bookcases Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                {
                  key: '__all__',
                  label: 'All Volumes',
                  count: filtered.length,
                },
                ...shelves.map((s) => ({
                  key: s.id,
                  label: s.name,
                  count: filtered.filter((b) => b.shelfIds.includes(s.id)).length,
                })),
                {
                  key: '__unshelved__',
                  label: 'Uncataloged Shelf',
                  count: filtered.filter((b) => b.shelfIds.length === 0).length,
                },
              ] as Array<{ key: ShelfBucketKey; label: string; count: number }>
            ).map((bucket) => {
              const active = selectedShelfKey === bucket.key;
              return (
                <button
                  key={bucket.key}
                  type="button"
                  onClick={() => {
                    setSelectedShelfKey(bucket.key);
                    setRenamingShelfId(null);
                    setConfirmDeleteShelfId(null);
                  }}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'archive-walnut-panel border-[#D6BD8A]/70 text-[#F4EFE6] shadow-md'
                      : 'border-[#B49A67]/25 bg-[#0B1120]/80 text-[#AEB9C9] hover:border-[#B49A67]/50 hover:text-[#F4EFE6]'
                  }`}
                >
                  <span className="font-archive-display">{bucket.label}</span>
                  <span className="rounded bg-[#0B1120]/75 px-1.5 py-0.5 font-mono text-[10px] text-[#B49A67]">
                    {bucket.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Shelf Header & Management Controls */}
          <section className="archive-walnut-panel rounded-3xl p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B49A67]/25 pb-3.5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-archive-display text-[11px] uppercase tracking-[0.18em] text-[#B49A67]">
                  Grand Stacks · Shelf Aisle
                </p>
                {renamingShelfId && activeShelfObj && renamingShelfId === activeShelfObj.id ? (
                  <form onSubmit={handleRenameShelf} className="flex items-center gap-2 pt-1">
                    <input
                      value={renameShelfText}
                      onChange={(e) => setRenameShelfText(e.target.value)}
                      className="archive-input rounded-lg border px-2.5 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-[#B49A67] px-2.5 text-xs font-semibold text-[#0B1120]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingShelfId(null)}
                      className="min-h-[30px] px-2 text-xs text-[#AEB9C9]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <h2 className="font-archive-display text-lg sm:text-xl font-bold text-[#F4EFE6] truncate">
                    {selectedShelfKey === '__all__'
                      ? 'Complete Archive Stacks'
                      : selectedShelfKey === '__unshelved__'
                        ? 'Uncataloged Volumes'
                        : activeShelfObj?.name ?? 'Shelf'}
                  </h2>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Spine vs Cover display inside shelf */}
                <div className="inline-flex rounded-lg border border-[#B49A67]/30 bg-[#0B1120]/80 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAisleDisplay('spines')}
                    className={`min-h-[30px] rounded-md px-2.5 font-semibold ${
                      aisleDisplay === 'spines'
                        ? 'bg-[#B49A67] text-[#0B1120]'
                        : 'text-[#AEB9C9]'
                    }`}
                  >
                    Spines
                  </button>
                  <button
                    type="button"
                    onClick={() => setAisleDisplay('covers')}
                    className={`min-h-[30px] rounded-md px-2.5 font-semibold ${
                      aisleDisplay === 'covers'
                        ? 'bg-[#B49A67] text-[#0B1120]'
                        : 'text-[#AEB9C9]'
                    }`}
                  >
                    Covers
                  </button>
                </div>

                {activeShelfObj && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingShelfId(activeShelfObj.id);
                        setRenameShelfText(activeShelfObj.name);
                      }}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#B49A67]/30 bg-[#0B1120]/70 px-2.5 text-xs text-[#D6BD8A]"
                      title="Rename Shelf"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    {confirmDeleteShelfId === activeShelfObj.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteShelf(activeShelfObj.id)}
                          className="min-h-[32px] rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white"
                        >
                          Confirm Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteShelfId(null)}
                          className="min-h-[32px] rounded-lg border border-[#B49A67]/30 px-2 text-xs text-[#AEB9C9]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteShelfId(activeShelfObj.id)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-red-400/35 bg-[#0B1120]/70 px-2.5 text-xs text-red-300 hover:bg-red-950/50"
                        title="Delete Shelf (keeps all books)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Shelf
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bookcase Rows + Walnut Ledges */}
            {aisleBooks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#B49A67]/35 bg-[#0B1120]/60 p-10 text-center space-y-2">
                <p className="text-sm text-[#AEB9C9]">{t('library.empty')}</p>
                <button
                  type="button"
                  onClick={onOpenAddBook}
                  className="text-xs font-semibold text-[#D6BD8A] hover:underline"
                >
                  Catalog a volume onto this shelf →
                </button>
              </div>
            ) : (
              <div className="space-y-7">
                {shelfRows.map((row, rowIdx) => (
                  <div key={rowIdx} className="space-y-0">
                    {aisleDisplay === 'spines' ? (
                      <div className="flex flex-wrap items-end gap-1.5 sm:gap-2 px-2 pt-4 min-h-[220px]">
                        {row.map((b) => {
                          const spine = getDeterministicBookSpineStyle({
                            workId: b.work.id,
                            pageCount: b.primaryEdition.pageCount,
                            format: b.primaryEdition.format,
                          });
                          const isSelected = inspectedBook?.work.id === b.work.id;
                          const isReading = b.activeCycle?.status === 'currently_reading';

                          return (
                            <button
                              key={b.work.id}
                              type="button"
                              onMouseEnter={() => setInspectedWorkId(b.work.id)}
                              onFocus={() => setInspectedWorkId(b.work.id)}
                              onClick={() => {
                                if (inspectedWorkId === b.work.id) {
                                  onOpenBook(b.work.id);
                                } else {
                                  setInspectedWorkId(b.work.id);
                                }
                              }}
                              title={`${b.work.title} — ${b.work.authors[0] || 'Unknown Author'}`}
                              aria-label={`${b.work.title} by ${b.work.authors[0] || 'Unknown Author'}`}
                              className={`archive-spine-item relative flex flex-col items-center justify-between rounded-t-sm px-1 py-2.5 text-center select-none ${
                                isSelected ? 'ring-2 ring-[#D6BD8A] -translate-y-2' : ''
                              }`}
                              style={{
                                background: spine.leatherBg,
                                width: `${spine.widthPx}px`,
                                height: `${spine.heightPx}px`,
                              }}
                            >
                              {/* Top Gold / Moonlit Banding */}
                              <div className="w-full space-y-1">
                                <div
                                  className="h-1 w-full rounded-full opacity-80"
                                  style={{ backgroundColor: spine.accentBand }}
                                />
                                {spine.bandingVariant !== 'classic' && (
                                  <div
                                    className="mx-auto h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: spine.foilColor }}
                                  />
                                )}
                              </div>

                              {/* Vertical Foil Title */}
                              <span
                                className="font-editorial text-[11px] font-semibold leading-tight tracking-wide line-clamp-2 overflow-hidden"
                                style={{
                                  color: spine.foilColor,
                                  writingMode: 'vertical-rl',
                                  textOrientation: 'mixed',
                                  maxHeight: `${spine.heightPx - 56}px`,
                                }}
                              >
                                {b.work.title}
                              </span>

                              {/* Bottom Banding + Active Reading Sparkle */}
                              <div className="w-full space-y-1 flex flex-col items-center">
                                {isReading && (
                                  <Sparkles className="h-3 w-3 text-[#7797C9]" />
                                )}
                                <div
                                  className="h-1 w-full rounded-full opacity-75"
                                  style={{ backgroundColor: spine.accentBand }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 px-2 pt-2">
                        {row.map((b) => (
                          <button
                            key={b.work.id}
                            type="button"
                            onMouseEnter={() => setInspectedWorkId(b.work.id)}
                            onClick={() => onOpenBook(b.work.id)}
                            className="group text-left space-y-1.5 transition-transform hover:-translate-y-1.5"
                          >
                            <CoverImage
                              title={b.work.title}
                              author={b.work.authors[0]}
                              edition={b.primaryEdition}
                            />
                            <p className="font-editorial text-xs font-semibold text-[#ECE6D8] line-clamp-1 group-hover:text-[#D6BD8A]">
                              {b.work.title}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Carved Walnut Ledge */}
                    <div className="archive-shelf-ledge rounded-b-md" />
                  </div>
                ))}
              </div>
            )}

            {/* Inspected Volume Lectern Drawer */}
            {inspectedBook && (
              <div className="archive-panel rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-[#B49A67]/40">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 shrink-0">
                    <CoverImage
                      title={inspectedBook.work.title}
                      author={inspectedBook.work.authors[0]}
                      edition={inspectedBook.primaryEdition}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-[#B49A67]">
                      Volume on Lectern
                    </p>
                    <h3 className="font-editorial text-base font-bold text-[#F4EFE6] truncate">
                      {inspectedBook.work.title}
                    </h3>
                    <p className="text-xs text-[#AEB9C9] truncate">
                      {inspectedBook.work.authors.join(', ') || 'Unknown Author'}
                      {inspectedBook.primaryEdition.publishers[0]
                        ? ` · ${inspectedBook.primaryEdition.publishers[0]}`
                        : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#AEB9C9]">
                      <span>{inspectedBook.ownedCopiesCount} owned</span>
                      {inspectedBook.isbns[0] && (
                        <span>· ID {inspectedBook.isbns[0].isbn13}</span>
                      )}
                      {inspectedBook.activeCycle && (
                        <span className="rounded bg-[#141E30] border border-[#7797C9]/40 px-2 py-0.5 text-[#7797C9] capitalize">
                          {inspectedBook.activeCycle.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenBook(inspectedBook.work.id)}
                  className="inline-flex min-h-[40px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] shrink-0"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Open Archive Folio
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* MODE 2: CATALOG VIEW (FAST SEARCH / GRID) */}
      {viewMode === 'catalog' && (
        <>
          {filtered.length === 0 ? (
            <div className="archive-panel rounded-2xl border-dashed p-10 text-center text-sm text-[#AEB9C9]">
              {t('library.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((b) => (
                <button
                  key={b.work.id}
                  type="button"
                  onClick={() => onOpenBook(b.work.id)}
                  className="archive-panel group flex flex-col rounded-2xl p-3 text-left transition-all hover:border-[#D6BD8A]/70 hover:-translate-y-0.5"
                >
                  <CoverImage
                    title={b.work.title}
                    author={b.work.authors[0]}
                    edition={b.primaryEdition}
                  />
                  <div className="mt-2.5 space-y-1 flex-1">
                    <h3 className="font-editorial text-sm font-semibold text-[#F4EFE6] line-clamp-2 group-hover:text-[#D6BD8A]">
                      {b.work.title}
                    </h3>
                    <p className="text-xs text-[#AEB9C9] truncate">
                      {b.work.authors.join(', ') || 'Unknown Author'}
                    </p>
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#B49A67]/20 flex items-center justify-between text-[11px] font-mono text-[#AEB9C9]">
                    <span>
                      {b.ownedCopiesCount > 0 ? `${b.ownedCopiesCount} owned` : '0 owned'}
                    </span>
                    {b.activeCycle && (
                      <span className="text-[#D6BD8A] capitalize">
                        {b.activeCycle.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
