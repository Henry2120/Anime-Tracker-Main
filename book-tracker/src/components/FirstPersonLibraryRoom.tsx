import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  ListFilter,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import type { BookshelfPosition, Shelf } from '../types/domain';
import {
  BOOKSHELF_META,
  BOOKSHELF_POSITIONS,
  getBooksForShelfPosition,
} from '../utils/bookshelfPlacement';
import type { RegisteredBookPlacementEvent } from './AddBookModal';
import type { SceneCameraViewpoint } from '../scene/LibraryCameraRig';
import type { Selected3DBookState } from '../scene/MidnightArchive3DCanvas';
import {
  DEFAULT_CUSTOM_THEME,
  type AppTheme,
  type CustomThemeConfig,
  type RainIntensityLevel,
} from '../../../src/types/theme';
import {
  loadQualityPreference,
  probeWebGLCapabilities,
  resolveQualitySettings,
  saveQualityPreference,
  type ArchiveQualityPreference,
} from '../scene/qualityConfig';
import {
  SceneCanvasErrorBoundary,
  WebGLErrorFallback,
} from '../scene/WebGLErrorFallback';

export type RoomCameraViewpoint = SceneCameraViewpoint;

const LazyMidnightArchive3DCanvas = lazy(
  () => import('../scene/MidnightArchive3DCanvas')
);

interface FirstPersonLibraryRoomProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  viewpoint: RoomCameraViewpoint;
  inspectShelf: BookshelfPosition;
  selected3DBook: Selected3DBookState | null;
  lanternWarmth: boolean;
  activeTheme?: AppTheme;
  customThemeConfig?: CustomThemeConfig;
  rainIntensity?: RainIntensityLevel;
  onToggleLantern: () => void;
  onSelectBookshelf: (position: BookshelfPosition) => void;
  onReturnToLibrary: () => void;
  onOpenComputer: () => void;
  onQuickAddBook: (mode: 'single' | 'batch', shelf?: BookshelfPosition) => void;
  onInspect3DBook: (
    book: EnrichedBookRecord,
    shelf: BookshelfPosition,
    worldPos: [number, number, number]
  ) => void;
  onOpenBookFolio: (workId: string) => void;
  floatingPlacement: RegisteredBookPlacementEvent | null;
  onCompleteFloatingPlacement: () => void;
  onInspectShelfAfterPlacement: (position: BookshelfPosition) => void;
  useFallbackShelfModal?: (pos: BookshelfPosition) => void;
}

export function FirstPersonLibraryRoom({
  books,
  shelves,
  viewpoint,
  inspectShelf,
  selected3DBook,
  lanternWarmth,
  activeTheme = 'dark',
  customThemeConfig = DEFAULT_CUSTOM_THEME,
  rainIntensity = 0,
  onToggleLantern,
  onSelectBookshelf,
  onReturnToLibrary,
  onOpenComputer,
  onQuickAddBook,
  onInspect3DBook,
  onOpenBookFolio,
  floatingPlacement,
  onCompleteFloatingPlacement,
  onInspectShelfAfterPlacement,
  useFallbackShelfModal,
}: FirstPersonLibraryRoomProps) {
  const { t } = useI18n();
  const [qualityPref, setQualityPref] = useState<ArchiveQualityPreference>(() =>
    loadQualityPreference()
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [contextLost, setContextLost] = useState(false);
  const [hoveredBookInfo, setHoveredBookInfo] = useState<{
    book: EnrichedBookRecord;
    shelf: BookshelfPosition;
  } | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [shelfIndexOpen, setShelfIndexOpen] = useState(false);
  const [shelfQuery, setShelfQuery] = useState('');
  const [settledPlacementNotice, setSettledPlacementNotice] =
    useState<RegisteredBookPlacementEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setHoveredBookInfo(null);
    if (
      viewpoint !== 'shelf_left' &&
      viewpoint !== 'shelf_middle' &&
      viewpoint !== 'shelf_right'
    ) {
      setShelfIndexOpen(false);
      setShelfQuery('');
    }
  }, [viewpoint]);

  const quality = useMemo(
    () => resolveQualitySettings(qualityPref, viewportWidth),
    [qualityPref, viewportWidth]
  );

  const webglAvailable = useMemo(() => probeWebGLCapabilities().available, []);

  const handleChangeQuality = (next: ArchiveQualityPreference) => {
    setQualityPref(next);
    saveQualityPreference(next);
  };

  const handleFlightComplete = useCallback(() => {
    if (floatingPlacement) {
      setSettledPlacementNotice(floatingPlacement);
    }
    onCompleteFloatingPlacement();
  }, [floatingPlacement, onCompleteFloatingPlacement]);

  useEffect(() => {
    if (!settledPlacementNotice) return;
    const timer = window.setTimeout(() => {
      setSettledPlacementNotice(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [settledPlacementNotice]);

  const activeShelfPos: BookshelfPosition | null =
    viewpoint === 'shelf_left'
      ? 'left'
      : viewpoint === 'shelf_middle'
        ? 'middle'
        : viewpoint === 'shelf_right'
          ? 'right'
          : null;

  const focusedShelfBooks = useMemo(() => {
    if (!activeShelfPos) return [];
    const list = getBooksForShelfPosition(books, shelves, activeShelfPos);
    const q = shelfQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) =>
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
  }, [activeShelfPos, books, shelves, shelfQuery]);

  const fallbackNode = (
    <WebGLErrorFallback
      books={books}
      shelves={shelves}
      reason={
        contextLost
          ? 'WebGL rendering context was paused by the device. Use lightweight mode below or reload the page.'
          : undefined
      }
      onSelectBookshelf={(pos) =>
        useFallbackShelfModal ? useFallbackShelfModal(pos) : onSelectBookshelf(pos)
      }
      onOpenComputer={onOpenComputer}
      onQuickAdd={(mode) => onQuickAddBook(mode, 'middle')}
    />
  );

  if (!webglAvailable || contextLost) {
    return fallbackNode;
  }

  return (
    <div className="relative h-[calc(100vh-52px)] min-h-[520px] w-full overflow-hidden bg-[#080d18]">
      {/* Single Persistent Three.js / React Three Fiber 3D Library Canvas */}
      <SceneCanvasErrorBoundary fallback={fallbackNode}>
        <Suspense
          fallback={
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#080d18] text-[#AEB9C9]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B49A67]/25 border-t-[#D6BD8A]" />
              <span className="font-archive-display text-xs tracking-wider text-[#D6BD8A]">
                Loading Library Room...
              </span>
            </div>
          }
        >
          <LazyMidnightArchive3DCanvas
            books={books}
            shelves={shelves}
            viewpoint={viewpoint}
            inspectShelf={inspectShelf}
            selected3DBook={selected3DBook}
            lanternWarmth={lanternWarmth}
            activeTheme={activeTheme}
            customThemeConfig={customThemeConfig}
            rainIntensity={rainIntensity}
            quality={quality}
            floatingPlacement={floatingPlacement}
            onSelectBookshelf={onSelectBookshelf}
            onOpenComputer={onOpenComputer}
            onToggleLantern={onToggleLantern}
            onHoverBook={setHoveredBookInfo}
            onSelectBook={onInspect3DBook}
            onCompleteFloatingPlacement={handleFlightComplete}
            onContextLostChange={setContextLost}
          />
        </Suspense>
      </SceneCanvasErrorBoundary>

      {/* ====================================================================
          ROOM VIEWPORT BOTTOM DOCK (Unobstructed Center 3D Scene, Solid Surface)
         ==================================================================== */}
      {viewpoint === 'room' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex flex-col items-center gap-1.5 px-3">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="pointer-events-auto inline-flex min-h-[28px] items-center gap-1 rounded-t-lg border border-b-0 border-[#B49A67]/40 bg-[#0B1120]/90 px-3 text-[11px] font-medium text-[#D6BD8A] hover:bg-[#141E30]"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Library Navigation</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#B49A67]/40 bg-[#0B1120]/92 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.82)]">
              <div className="flex flex-wrap items-center gap-1.5">
                {BOOKSHELF_POSITIONS.map((pos) => {
                  const count = getBooksForShelfPosition(books, shelves, pos).length;
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => onSelectBookshelf(pos)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#B49A67]/30 bg-[#141E30] px-2.5 text-xs font-medium text-[#ECE6D8] hover:border-[#D6BD8A] hover:text-[#D6BD8A]"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-[#B49A67]" />
                      <span>{BOOKSHELF_META[pos].shortLabel}</span>
                      <span className="font-mono text-[10px] text-[#AEB9C9] tabular-nums">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <span aria-hidden="true" className="hidden sm:inline-block h-5 w-px bg-[#B49A67]/25" />

              <button
                type="button"
                onClick={onOpenComputer}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Desk Computer</span>
              </button>

              <label className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-[#B49A67]/25 bg-[#101827] px-2.5 py-1 text-[11px] text-[#AEB9C9]">
                <SlidersHorizontal className="h-3 w-3 text-[#B49A67]" />
                <select
                  aria-label="3D Graphics Quality"
                  value={qualityPref}
                  onChange={(e) =>
                    handleChangeQuality(e.target.value as ArchiveQualityPreference)
                  }
                  className="bg-transparent text-[11px] font-medium text-[#F4EFE6] outline-none"
                >
                  <option value="auto" className="bg-[#0B1120]">
                    Quality: Auto ({quality.tier})
                  </option>
                  <option value="high" className="bg-[#0B1120]">
                    High
                  </option>
                  <option value="balanced" className="bg-[#0B1120]">
                    Balanced
                  </option>
                  <option value="performance" className="bg-[#0B1120]">
                    Performance
                  </option>
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          FOCUSED 3D BOOKSHELF HUD (Keeps 3D Bookcase & Books Center-Stage)
         ==================================================================== */}
      {activeShelfPos && (
        <>
          {/* Hover Tooltip for Single Hovered 3D Book Spine (1 DOM node total) */}
          {hoveredBookInfo && hoveredBookInfo.shelf === activeShelfPos && (
            <div className="pointer-events-none fixed left-1/2 bottom-24 z-20 -translate-x-1/2 rounded-xl border border-[#D6BD8A]/70 bg-[#0B1120]/94 px-4 py-2 text-center shadow-2xl">
              <p className="font-editorial text-sm font-bold text-[#F4EFE6]">
                {hoveredBookInfo.book.work.title}
              </p>
              <p className="text-[11px] text-[#AEB9C9]">
                {hoveredBookInfo.book.work.authors.join(', ') || 'Unknown Author'} · Click spine to inspect
              </p>
            </div>
          )}

          {/* Optional Searchable Shelf Index Drawer for Large Collections */}
          {shelfIndexOpen && (
            <div className="fixed right-3 top-16 bottom-24 z-25 flex w-[min(360px,92vw)] flex-col overflow-hidden rounded-2xl border border-[#B49A67]/45 bg-[#0B1120]/95 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#B49A67]/25 px-3.5 py-2.5">
                <span className="font-archive-display text-xs font-bold text-[#D6BD8A]">
                  {BOOKSHELF_META[activeShelfPos].label} ({focusedShelfBooks.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShelfIndexOpen(false)}
                  aria-label="Close shelf list"
                  className="rounded-lg p-1 text-[#AEB9C9] hover:text-[#F4EFE6]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2.5 border-b border-[#B49A67]/20">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#AEB9C9]" />
                  <input
                    value={shelfQuery}
                    onChange={(e) => setShelfQuery(e.target.value)}
                    placeholder="Filter books on this shelf..."
                    className="archive-input w-full min-h-[36px] rounded-lg border pl-8 pr-3 text-xs"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[#B49A67]/15">
                {focusedShelfBooks.length === 0 ? (
                  <p className="p-6 text-center text-xs text-[#AEB9C9]">
                    No volumes on this shelf yet.
                  </p>
                ) : (
                  focusedShelfBooks.map((b) => (
                    <button
                      key={b.work.id}
                      type="button"
                      onClick={() => onOpenBookFolio(b.work.id)}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-[#141E30]"
                    >
                      <div className="min-w-0">
                        <p className="font-editorial text-xs font-bold text-[#F4EFE6] truncate">
                          {b.work.title}
                        </p>
                        <p className="text-[11px] text-[#AEB9C9] truncate">
                          {b.work.authors.join(', ') || 'Unknown Author'}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-[#D6BD8A] shrink-0">
                        Inspect
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Slim Shelf Controls Dock */}
          <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-3">
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#B49A67]/45 bg-[#0B1120]/94 px-3 py-2 shadow-2xl">
              <button
                type="button"
                onClick={onReturnToLibrary}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D6BD8A]/55 bg-[#392A24] px-3 text-xs font-semibold text-[#F4EFE6] hover:bg-[#4A352D]"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#D6BD8A]" />
                <span>{t('room.returnLibrary')}</span>
              </button>

              <div className="inline-flex items-center gap-1 rounded-xl border border-[#B49A67]/25 bg-[#101827] p-1">
                <Compass className="ml-1 hidden h-3.5 w-3.5 text-[#B49A67] sm:inline" />
                {BOOKSHELF_POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => onSelectBookshelf(pos)}
                    className={`min-h-[30px] rounded-lg px-2 text-xs font-semibold ${
                      pos === activeShelfPos
                        ? 'bg-[#B49A67] text-[#0B1120]'
                        : 'text-[#AEB9C9] hover:text-[#F4EFE6]'
                    }`}
                  >
                    {BOOKSHELF_META[pos].shortLabel.replace(' Shelf', '')}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShelfIndexOpen((v) => !v)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#B49A67]/35 bg-[#141E30] px-3 text-xs font-semibold text-[#ECE6D8] hover:border-[#D6BD8A]"
              >
                <ListFilter className="h-3.5 w-3.5 text-[#D6BD8A]" />
                <span>
                  Shelf Index ({getBooksForShelfPosition(books, shelves, activeShelfPos).length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => onQuickAddBook('single', activeShelfPos)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Here</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ====================================================================
          NEWLY REGISTERED BOOK FLIGHT / SETTLED NOTICE
         ==================================================================== */}
      {floatingPlacement && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-16 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-[#D6BD8A]/65 bg-[#0B1120]/92 px-4 py-2 text-xs text-[#F4EFE6] shadow-xl"
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#D6BD8A]" />
            Shelving <strong>&ldquo;{floatingPlacement.title}&rdquo;</strong> onto{' '}
            <strong className="text-[#D6BD8A]">
              {BOOKSHELF_META[floatingPlacement.targetShelf].label}
            </strong>
            ...
          </span>
        </div>
      )}

      {!floatingPlacement && settledPlacementNotice && viewpoint === 'room' && (
        <div className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-[#D6BD8A]/65 bg-[#0B1120]/96 px-4 py-2.5 text-xs shadow-2xl">
          <span className="text-[#F4EFE6]">
            Placed <strong>&ldquo;{settledPlacementNotice.title}&rdquo;</strong> onto{' '}
            <strong className="text-[#D6BD8A]">
              {BOOKSHELF_META[settledPlacementNotice.targetShelf].label}
            </strong>
            .
          </span>
          <button
            type="button"
            onClick={() => {
              const shelf = settledPlacementNotice.targetShelf;
              setSettledPlacementNotice(null);
              onInspectShelfAfterPlacement(shelf);
            }}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#B49A67] px-3 font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Inspect Shelf
          </button>
          <button
            type="button"
            onClick={() => setSettledPlacementNotice(null)}
            className="text-[#AEB9C9] hover:text-[#F4EFE6]"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
