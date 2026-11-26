import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Compass,
  LampDesk,
  Monitor,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { assignBookToShelfPosition } from '../services/libraryService';
import type { BookshelfPosition, Shelf } from '../types/domain';
import {
  BOOKSHELF_META,
  BOOKSHELF_POSITIONS,
  countCopiesOnShelfPosition,
  getBooksForShelfPosition,
} from '../utils/bookshelfPlacement';
import { getDeterministicBookSpineStyle } from '../utils/bookSpine';
import { CoverImage } from './CoverImage';

interface PhysicalBookshelfViewProps {
  position: BookshelfPosition;
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  onReturnToLibrary: () => void;
  onSwitchShelf: (position: BookshelfPosition) => void;
  onOpenComputer: () => void;
  onAddBookToShelf: (position: BookshelfPosition) => void;
  onOpenBook: (workId: string) => void;
}

export function PhysicalBookshelfView({
  position,
  books,
  shelves,
  onReturnToLibrary,
  onSwitchShelf,
  onOpenComputer,
  onAddBookToShelf,
  onOpenBook,
}: PhysicalBookshelfViewProps) {
  const { t } = useI18n();
  const [displayMode, setDisplayMode] = useState<'spines' | 'covers'>('spines');
  const [query, setQuery] = useState('');
  const [inspectedWorkId, setInspectedWorkId] = useState<string | null>(null);
  const [pullingWorkId, setPullingWorkId] = useState<string | null>(null);
  const pullTimerRef = useRef<number | null>(null);

  const meta = BOOKSHELF_META[position];

  useEffect(() => {
    setQuery('');
    setInspectedWorkId(null);
  }, [position]);

  useEffect(() => {
    return () => {
      if (pullTimerRef.current !== null) {
        window.clearTimeout(pullTimerRef.current);
      }
    };
  }, []);

  const shelfBooks = useMemo(
    () => getBooksForShelfPosition(books, shelves, position),
    [books, shelves, position]
  );

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shelfBooks;
    return shelfBooks.filter((b) =>
      [
        b.work.title,
        b.work.originalTitle ?? '',
        b.work.authors.join(' '),
        b.isbns.map((i) => `${i.isbn13} ${i.isbn10 ?? ''}`).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [shelfBooks, query]);

  const rows = useMemo(() => {
    const perRow = displayMode === 'spines' ? 11 : 6;
    const chunks: EnrichedBookRecord[][] = [];
    for (let i = 0; i < filteredBooks.length; i += perRow) {
      chunks.push(filteredBooks.slice(i, i + perRow));
    }
    return chunks;
  }, [filteredBooks, displayMode]);

  const inspectedBook =
    filteredBooks.find((b) => b.work.id === inspectedWorkId) ??
    filteredBooks[0] ??
    null;

  const handlePullAndOpen = (workId: string) => {
    setInspectedWorkId(workId);
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      onOpenBook(workId);
      return;
    }

    if (pullTimerRef.current !== null) {
      window.clearTimeout(pullTimerRef.current);
    }
    setPullingWorkId(workId);
    pullTimerRef.current = window.setTimeout(() => {
      setPullingWorkId(null);
      pullTimerRef.current = null;
      onOpenBook(workId);
    }, 170);
  };

  return (
    <div className="archive-transition-zoom-shelf mx-auto w-full max-w-6xl space-y-4">
      {/* Top Library Navigation & Shelf Turning Strip */}
      <div className="archive-panel flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReturnToLibrary}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#D6BD8A]/55 bg-[#392A24] px-3.5 text-xs font-semibold text-[#F4EFE6] hover:bg-[#4A352D] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-[#D6BD8A]" />
            <span>{t('room.returnLibrary')}</span>
          </button>

          <div
            role="group"
            aria-label="Turn toward another library bookshelf"
            className="inline-flex items-center gap-1 rounded-xl border border-[#B49A67]/25 bg-[#0B1120] p-1"
          >
            <Compass className="ml-1.5 mr-0.5 hidden h-3.5 w-3.5 text-[#B49A67] sm:inline" />
            {BOOKSHELF_POSITIONS.map((pos) => {
              const active = pos === position;
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => onSwitchShelf(pos)}
                  className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#B49A67] text-[#0B1120]'
                      : 'text-[#AEB9C9] hover:text-[#F4EFE6]'
                  }`}
                >
                  {BOOKSHELF_META[pos].shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenComputer}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#101827] px-3 text-xs font-semibold text-[#AEB9C9] hover:border-[#7797C9] hover:text-[#F4EFE6] whitespace-nowrap shrink-0"
          >
            <Monitor className="h-3.5 w-3.5 text-[#7797C9]" />
            Desk Computer
          </button>
          <button
            type="button"
            onClick={() => onAddBookToShelf(position)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Book Here
          </button>
        </div>
      </div>

      {/* Physical Dark Walnut Bookcase Frame */}
      <section
        aria-label={meta.label}
        className="archive-bookcase-frame relative overflow-hidden rounded-3xl p-4 sm:p-6 space-y-5"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 -top-12 h-32 w-96 -translate-x-1/2 rounded-full bg-[#D6BD8A]/14 blur-2xl"
        />

        {/* Bookcase Crown Header */}
        <div className="relative z-10 flex flex-col gap-3 border-b border-[#B49A67]/30 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 font-archive-display text-[11px] uppercase tracking-[0.18em] text-[#B49A67]">
              <LampDesk className="h-3.5 w-3.5" />
              {meta.subtitle}
            </p>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-archive-display text-xl font-bold text-[#F4EFE6]">
                {meta.label}
              </h2>
              <span className="font-mono text-xs text-[#D6BD8A] tabular-nums">
                {shelfBooks.length} volume{shelfBooks.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#AEB9C9]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter this shelf..."
                className="archive-input w-full min-h-[36px] rounded-lg border pl-8 pr-3 text-xs"
              />
            </div>

            <div className="inline-flex rounded-lg border border-[#B49A67]/30 bg-[#0B1120]/85 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDisplayMode('spines')}
                className={`min-h-[32px] rounded-md px-3 font-semibold ${
                  displayMode === 'spines'
                    ? 'bg-[#B49A67] text-[#0B1120]'
                    : 'text-[#AEB9C9]'
                }`}
              >
                Spines
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('covers')}
                className={`min-h-[32px] rounded-md px-3 font-semibold ${
                  displayMode === 'covers'
                    ? 'bg-[#B49A67] text-[#0B1120]'
                    : 'text-[#AEB9C9]'
                }`}
              >
                Covers
              </button>
            </div>
          </div>
        </div>

        {/* Physical Books on Walnut Shelf Ledges */}
        {filteredBooks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#B49A67]/35 bg-[#0B1120]/65 p-10 text-center space-y-3">
            <p className="text-sm text-[#AEB9C9]">
              {shelfBooks.length === 0
                ? `${meta.label} is currently waiting for its first volume.`
                : 'No books on this shelf match that filter.'}
            </p>
            <button
              type="button"
              onClick={() => onAddBookToShelf(position)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
            >
              <Plus className="h-4 w-4" />
              Register a Book onto {meta.label}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="archive-shelf-alcove rounded-xl pt-3">
                {displayMode === 'spines' ? (
                  <div className="flex flex-wrap items-end gap-1.5 sm:gap-2 px-3 sm:px-4 pt-3 min-h-[224px]">
                    <div
                      aria-hidden="true"
                      className="hidden sm:block h-28 w-2.5 rounded-t-sm bg-gradient-to-b from-[#B49A67] to-[#5C4720] opacity-75 shadow"
                    />
                    {row.map((b) => {
                      const spine = getDeterministicBookSpineStyle({
                        workId: b.work.id,
                        pageCount: b.primaryEdition.pageCount,
                        format: b.primaryEdition.format,
                      });
                      const isSelected = inspectedBook?.work.id === b.work.id;
                      const isPulling = pullingWorkId === b.work.id;
                      const isReading = b.activeCycle?.status === 'currently_reading';

                      return (
                        <button
                          key={b.work.id}
                          type="button"
                          onMouseEnter={() => setInspectedWorkId(b.work.id)}
                          onFocus={() => setInspectedWorkId(b.work.id)}
                          onClick={() => handlePullAndOpen(b.work.id)}
                          title={`${b.work.title} — ${b.work.authors[0] || 'Unknown Author'}`}
                          aria-label={`Open ${b.work.title} from ${meta.label}`}
                          className={`archive-spine-item group relative flex flex-col items-center justify-between rounded-t-sm px-1 py-2.5 text-center select-none ${
                            isPulling
                              ? 'archive-spine-pulling ring-2 ring-[#D6BD8A]'
                              : isSelected
                                ? 'ring-2 ring-[#D6BD8A]/85 -translate-y-1.5'
                                : ''
                          }`}
                          style={{
                            background: spine.leatherBg,
                            width: `${spine.widthPx}px`,
                            height: `${spine.heightPx}px`,
                          }}
                        >
                          <div className="w-full space-y-1.5">
                            <div
                              className="h-1 w-full rounded-full opacity-85"
                              style={{ backgroundColor: spine.accentBand }}
                            />
                            <div
                              className="h-[3px] w-full rounded-full"
                              style={{
                                backgroundColor: spine.ribShadow,
                                boxShadow: '0 1px 0 rgba(255,255,255,0.16)',
                              }}
                            />
                            {spine.bandingVariant !== 'classic' && (
                              <div
                                className="mx-auto h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: spine.foilColor }}
                              />
                            )}
                          </div>

                          <span
                            className="font-editorial text-[11px] font-semibold leading-tight tracking-wide line-clamp-2 overflow-hidden"
                            style={{
                              color: spine.foilColor,
                              writingMode: 'vertical-rl',
                              textOrientation: 'mixed',
                              maxHeight: `${spine.heightPx - 68}px`,
                            }}
                          >
                            {b.work.title}
                          </span>

                          <div className="w-full space-y-1.5 flex flex-col items-center">
                            {isReading && (
                              <Sparkles className="h-3 w-3 text-[#7797C9]" />
                            )}
                            <div
                              className="h-[3px] w-full rounded-full"
                              style={{
                                backgroundColor: spine.ribShadow,
                                boxShadow: '0 1px 0 rgba(255,255,255,0.16)',
                              }}
                            />
                            <div
                              className="h-1 w-full rounded-full opacity-80"
                              style={{ backgroundColor: spine.accentBand }}
                            />
                          </div>
                        </button>
                      );
                    })}
                    <div
                      aria-hidden="true"
                      className="hidden sm:block h-24 w-2.5 rounded-t-sm bg-gradient-to-b from-[#B49A67] to-[#5C4720] opacity-75 shadow"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 px-3 sm:px-4 pt-3 pb-2">
                    {row.map((b) => (
                      <button
                        key={b.work.id}
                        type="button"
                        onMouseEnter={() => setInspectedWorkId(b.work.id)}
                        onClick={() => handlePullAndOpen(b.work.id)}
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

                <div className="archive-shelf-ledge rounded-b-md" />
              </div>
            ))}
          </div>
        )}

        {/* Permanent Touch-Friendly Oak Lectern Preview & Quick Shelf Assignment */}
        {inspectedBook && (
          <div className="archive-panel rounded-2xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-[#B49A67]/45">
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
                  Volume Selected on {meta.label}
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
                  <span>
                    {countCopiesOnShelfPosition(inspectedBook, position) ||
                      inspectedBook.ownedCopiesCount}{' '}
                    cop{inspectedBook.ownedCopiesCount === 1 ? 'y' : 'ies'}
                  </span>
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

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              <div className="inline-flex items-center gap-1 rounded-xl border border-[#B49A67]/30 bg-[#0B1120] p-1 text-[11px]">
                <span className="px-1.5 text-[#AEB9C9]">Move:</span>
                {BOOKSHELF_POSITIONS.map((dest) => (
                  <button
                    key={dest}
                    type="button"
                    disabled={dest === position}
                    onClick={() =>
                      assignBookToShelfPosition({
                        workId: inspectedBook.work.id,
                        editionId: inspectedBook.primaryEdition.id,
                        position: dest,
                      })
                    }
                    className={`min-h-[30px] rounded-lg px-2 font-semibold transition-colors ${
                      dest === position
                        ? 'bg-[#392A24] text-[#D6BD8A]'
                        : 'text-[#AEB9C9] hover:bg-[#141E30] hover:text-[#F4EFE6]'
                    }`}
                  >
                    {BOOKSHELF_META[dest].shortLabel.replace(' Shelf', '')}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handlePullAndOpen(inspectedBook.work.id)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Pull &amp; Open Folio
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
