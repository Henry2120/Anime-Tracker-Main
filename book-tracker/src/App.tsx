import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Flame,
  WifiOff,
  X,
} from 'lucide-react';
import './midnightArchive.css';
import {
  AddBookModal,
  type RegisteredBookPlacementEvent,
} from './components/AddBookModal';
import {
  ArchiveComputerModal,
  type ComputerTab,
} from './components/ArchiveComputerModal';
import { BookDetailModal } from './components/BookDetailModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import {
  FirstPersonLibraryRoom,
  type RoomCameraViewpoint,
} from './components/FirstPersonLibraryRoom';
import { PhysicalBookshelfView } from './components/PhysicalBookshelfView';
import { PWAInstallPrompt } from './components/PWAInstallBanner';
import type { EnrichedBookRecord } from './hooks/useLibraryData';
import type { Selected3DBookState } from './scene/MidnightArchive3DCanvas';
import { db } from './db/dexie';
import { useLibrarySnapshot } from './hooks/useLibraryData';
import { I18nProvider, useI18n } from './i18n/useI18n';
import { isSupabaseConfigured } from './lib/supabase';
import { restoreSoftDeletedEntity } from './services/libraryService';
import { runSyncCycle } from './sync/syncEngine';
import type { BookshelfPosition } from './types/domain';
import { BOOKSHELF_META } from './utils/bookshelfPlacement';
import type { ShelfBucketKey } from './views/LibraryView';

export type NavTab =
  | 'dashboard'
  | 'library'
  | 'reading'
  | 'wishlist'
  | 'history'
  | 'journal'
  | 'stats'
  | 'settings';

export interface BookTrackerAppProps {
  worldSwitcher?: ReactNode;
  embedded?: boolean;
}

export function App({
  worldSwitcher,
  embedded = false,
}: BookTrackerAppProps = {}) {
  const snapshot = useLibrarySnapshot();
  const locale = snapshot.settings?.language ?? 'en';

  return (
    <I18nProvider locale={locale}>
      <AppShell
        snapshot={snapshot}
        worldSwitcher={worldSwitcher}
        embedded={embedded}
      />
    </I18nProvider>
  );
}

function viewpointToShelfPosition(
  vp: RoomCameraViewpoint
): BookshelfPosition | null {
  if (vp === 'shelf_left') return 'left';
  if (vp === 'shelf_middle') return 'middle';
  if (vp === 'shelf_right') return 'right';
  return null;
}

function shelfPositionToViewpoint(
  pos: BookshelfPosition
): RoomCameraViewpoint {
  if (pos === 'left') return 'shelf_left';
  if (pos === 'right') return 'shelf_right';
  return 'shelf_middle';
}

function AppShell({
  snapshot,
  worldSwitcher,
  embedded,
}: {
  snapshot: ReturnType<typeof useLibrarySnapshot>;
  worldSwitcher?: ReactNode;
  embedded: boolean;
}) {
  const { t } = useI18n();
  const [viewpoint, setViewpoint] = useState<RoomCameraViewpoint>('room');
  const [inspectShelf, setInspectShelf] = useState<BookshelfPosition>('middle');
  const [selected3DBook, setSelected3DBook] = useState<Selected3DBookState | null>(null);
  const [fallbackShelfPos, setFallbackShelfPos] = useState<BookshelfPosition | null>(null);
  const [computerTab, setComputerTab] = useState<ComputerTab>('library');
  const [libraryViewMode, setLibraryViewMode] = useState<'shelves' | 'catalog'>('shelves');
  const [selectedShelfKey, setSelectedShelfKey] =
    useState<ShelfBucketKey>('__all__');
  const [lanternWarmth, setLanternWarmth] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addModalMode, setAddModalMode] = useState<'single' | 'batch'>('single');
  const [addShelfTarget, setAddShelfTarget] =
    useState<BookshelfPosition>('middle');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [floatingPlacement, setFloatingPlacement] =
    useState<RegisteredBookPlacementEvent | null>(null);

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [undoToast, setUndoToast] = useState<{
    workId: string;
    title: string;
  } | null>(null);

  const settings = snapshot.settings;

  useEffect(() => {
    if (embedded) return;
    const theme = settings?.theme ?? 'dark';
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
  }, [embedded, settings?.theme]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (isSupabaseConfigured()) {
        void runSyncCycle();
      }
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Browser Back support across Room -> Shelf/Computer -> Open Folio without mutating ?world=books
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    const onPopState = (ev: PopStateEvent) => {
      const state = ev.state as {
        archiveViewpoint?: RoomCameraViewpoint;
        archiveComputerTab?: ComputerTab;
        archiveWorkId?: string | null;
      } | null;

      if (!state || !state.archiveViewpoint) {
        setSelectedWorkId(null);
        setSelected3DBook(null);
        setFallbackShelfPos(null);
        setViewpoint('room');
        return;
      }

      setSelectedWorkId(state.archiveWorkId ?? null);
      if (!state.archiveWorkId) {
        setSelected3DBook(null);
      }
      setViewpoint(state.archiveViewpoint);
      if (state.archiveComputerTab) {
        setComputerTab(state.archiveComputerTab);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const pushArchiveHistory = useCallback(
    (next: {
      viewpoint: RoomCameraViewpoint;
      computerTab: ComputerTab;
      workId: string | null;
    }) => {
      if (typeof window === 'undefined' || !window.history) return;
      try {
        window.history.pushState(
          {
            ...(typeof window.history.state === 'object' &&
            window.history.state !== null
              ? window.history.state
              : {}),
            archiveViewpoint: next.viewpoint,
            archiveComputerTab: next.computerTab,
            archiveWorkId: next.workId,
          },
          '',
          window.location.href
        );
      } catch {
        // Ignore restricted history contexts
      }
    },
    []
  );

  const navigateViewpoint = useCallback(
    (
      nextViewpoint: RoomCameraViewpoint,
      options?: { computerTab?: ComputerTab; shelf?: BookshelfPosition }
    ) => {
      const nextTab = options?.computerTab ?? computerTab;
      if (options?.computerTab) setComputerTab(options.computerTab);
      if (options?.shelf) setInspectShelf(options.shelf);
      if (nextViewpoint !== 'inspect_book') {
        setSelected3DBook(null);
      }
      setFallbackShelfPos(null);
      setViewpoint(nextViewpoint);
      pushArchiveHistory({
        viewpoint: nextViewpoint,
        computerTab: nextTab,
        workId: null,
      });
    },
    [computerTab, pushArchiveHistory]
  );

  const handleCompleteFloatingPlacement = useCallback(() => {
    setFloatingPlacement(null);
  }, []);

  if (!settings) {
    return (
      <div className="midnight-archive-shell archive-backdrop flex min-h-screen items-center justify-center text-sm text-[#AEB9C9]">
        Entering The Midnight Archive...
      </div>
    );
  }

  const selectedBook =
    snapshot.books.find((b) => b.work.id === selectedWorkId) ?? null;

  const activeShelfPos =
    viewpointToShelfPosition(viewpoint) ??
    (viewpoint === 'inspect_book' ? inspectShelf : null);

  const openAddBook = (
    mode: 'single' | 'batch' = 'single',
    shelfOverride?: BookshelfPosition
  ) => {
    setAddShelfTarget(shelfOverride ?? activeShelfPos ?? 'middle');
    setAddModalMode(mode);
    setAddOpen(true);
  };

  const handleSelectBookshelf = (pos: BookshelfPosition) => {
    setInspectShelf(pos);
    navigateViewpoint(shelfPositionToViewpoint(pos), { shelf: pos });
  };

  const handleInspect3DBook = (
    book: EnrichedBookRecord,
    shelf: BookshelfPosition,
    worldPos: [number, number, number]
  ) => {
    setInspectShelf(shelf);
    setSelected3DBook({ book, shelf, worldPos });
    setSelectedWorkId(book.work.id);
    setViewpoint('inspect_book');
    pushArchiveHistory({
      viewpoint: 'inspect_book',
      computerTab,
      workId: book.work.id,
    });
  };

  const handleOpenBook = (workId: string) => {
    setSelected3DBook(null);
    setSelectedWorkId(workId);
    pushArchiveHistory({
      viewpoint,
      computerTab,
      workId,
    });
  };

  const handleCloseBook = () => {
    const was3DInspect = viewpoint === 'inspect_book';
    setSelectedWorkId(null);
    setSelected3DBook(null);
    if (was3DInspect) {
      setViewpoint(shelfPositionToViewpoint(inspectShelf));
    }
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    try {
      await runSyncCycle({ manualTrigger: true });
    } finally {
      setSyncing(false);
    }
  };

  const toggleLocale = async () => {
    await db.app_settings.put({
      ...settings,
      language: settings.language === 'en' ? 'vi' : 'en',
    });
  };

  const handleBookRegistered = (
    _workId: string,
    placement?: RegisteredBookPlacementEvent
  ) => {
    if (!placement) return;
    setAddOpen(false);
    setSelectedWorkId(null);
    setSelected3DBook(null);
    setFallbackShelfPos(null);
    setViewpoint('room');
    setFloatingPlacement(placement);
  };

  const handleBatchRegistered = (
    _workIds: string[],
    placements?: RegisteredBookPlacementEvent[]
  ) => {
    if (!placements || placements.length === 0) return;
    const latest = placements[placements.length - 1];
    setAddOpen(false);
    setSelectedWorkId(null);
    setSelected3DBook(null);
    setFallbackShelfPos(null);
    setViewpoint('room');
    setFloatingPlacement(latest);
  };

  const viewpointLabel =
    viewpoint === 'computer'
      ? 'Desk Workstation'
      : viewpoint === 'inspect_book' && selectedBook
        ? selectedBook.work.title
        : activeShelfPos
          ? BOOKSHELF_META[activeShelfPos].label
          : 'The Midnight Archive';

  return (
    <div
      className={`midnight-archive-shell min-h-screen flex flex-col relative z-20 ${
        embedded ? 'archive-backdrop-embedded' : 'archive-backdrop'
      } text-[#F4EFE6]`}
    >
      {/* Minimal Ambient Top Utility Strip (Solid Dark Background, No Blur Over WebGL) */}
      <header className="sticky top-0 z-30 flex min-h-[52px] items-center justify-between gap-3 border-b border-[#B49A67]/20 bg-[#0B1120]/96 px-3 sm:px-5 lg:px-8">
        <div className="flex items-center gap-2.5 min-w-0">
          {worldSwitcher && (
            <div className="shrink-0 flex items-center gap-2">
              {worldSwitcher}
              <span
                aria-hidden="true"
                className="hidden sm:inline-block h-4 w-px bg-[#B49A67]/30"
              />
            </div>
          )}

          {viewpoint !== 'room' ? (
            <button
              type="button"
              onClick={() => navigateViewpoint('room')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D6BD8A]/50 bg-[#392A24]/80 px-3 text-xs font-semibold text-[#F4EFE6] hover:bg-[#4A352D] whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#D6BD8A]" />
              <span>{t('room.returnLibrary')}</span>
            </button>
          ) : (
            <span className="font-archive-display text-sm sm:text-base font-bold text-[#F4EFE6] truncate">
              The Midnight Archive
            </span>
          )}

          {viewpoint !== 'room' && (
            <h1 className="hidden sm:block font-archive-display text-xs sm:text-sm font-semibold tracking-wide truncate text-[#D6BD8A]">
              {viewpointLabel}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isOnline && (
            <span
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#B49A67]/30 bg-[#141E30] px-2 text-[11px] font-medium text-[#D6BD8A]"
              title={t('status.offline')}
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('status.offline')}</span>
            </span>
          )}

          {snapshot.unresolvedConflicts.length > 0 && (
            <button
              type="button"
              onClick={() => setConflictsOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#B49A67]/40 bg-[#392A24] px-2.5 text-xs font-semibold text-[#D6BD8A]"
              title="Sync Conflicts"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="tabular-nums">
                {snapshot.unresolvedConflicts.length}
              </span>
            </button>
          )}

          {!embedded && <PWAInstallPrompt />}

          <button
            type="button"
            onClick={() => setLanternWarmth((v) => !v)}
            aria-pressed={lanternWarmth}
            title={
              lanternWarmth
                ? 'Switch to Cool Moonlight'
                : 'Light Warm Candlelight'
            }
            className={`inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border transition-colors ${
              lanternWarmth
                ? 'border-[#B49A67]/55 bg-[#392A24]/75 text-[#D6BD8A]'
                : 'border-[#7797C9]/40 bg-[#101827] text-[#7797C9]'
            }`}
          >
            <Flame className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={toggleLocale}
            className="min-h-[36px] rounded-lg border border-[#B49A67]/35 bg-[#101827] px-2.5 text-xs font-mono font-semibold text-[#D6BD8A] hover:border-[#B49A67]"
            title="Switch Language EN / VI"
          >
            {settings.language.toUpperCase()}
          </button>
        </div>
      </header>

      {/* Main First-Person Library Space */}
      <main className="relative z-10 flex flex-1 flex-col min-w-0">
        {undoToast && (
          <div className="mx-auto mt-3 flex w-full max-w-4xl items-center justify-between rounded-xl border border-[#B49A67]/45 bg-[#141E30] text-[#F4EFE6] px-4 py-2.5 text-xs shadow-lg">
            <span>Removed &ldquo;{undoToast.title}&rdquo; from the archive.</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  await restoreSoftDeletedEntity('works', undoToast.workId);
                  setUndoToast(null);
                }}
                className="font-semibold text-[#D6BD8A] hover:underline"
              >
                Restore Volume
              </button>
              <button type="button" onClick={() => setUndoToast(null)}>
                <X className="h-3.5 w-3.5 text-[#AEB9C9]" />
              </button>
            </div>
          </div>
        )}

        {/* Real Three.js / R3F First-Person 3D Midnight Archive Room */}
        <FirstPersonLibraryRoom
          books={snapshot.books}
          shelves={snapshot.shelves}
          viewpoint={viewpoint}
          inspectShelf={inspectShelf}
          selected3DBook={selected3DBook}
          lanternWarmth={lanternWarmth}
          onToggleLantern={() => setLanternWarmth((v) => !v)}
          onSelectBookshelf={handleSelectBookshelf}
          onReturnToLibrary={() => navigateViewpoint('room')}
          onOpenComputer={() => navigateViewpoint('computer')}
          onQuickAddBook={(mode, shelf) => openAddBook(mode, shelf)}
          onInspect3DBook={handleInspect3DBook}
          onOpenBookFolio={handleOpenBook}
          floatingPlacement={floatingPlacement}
          onCompleteFloatingPlacement={handleCompleteFloatingPlacement}
          onInspectShelfAfterPlacement={(pos) => {
            setFloatingPlacement(null);
            handleSelectBookshelf(pos);
          }}
          useFallbackShelfModal={(pos) => setFallbackShelfPos(pos)}
        />

        {/* Lightweight 2D Bookshelf Modal ONLY When WebGL Is Unavailable / Context Lost */}
        {fallbackShelfPos && (
          <div className="fixed inset-0 top-[52px] z-30 overflow-y-auto bg-[#060912]/88 p-3 sm:p-6">
            <PhysicalBookshelfView
              position={fallbackShelfPos}
              books={snapshot.books}
              shelves={snapshot.shelves}
              onReturnToLibrary={() => setFallbackShelfPos(null)}
              onSwitchShelf={(pos) => setFallbackShelfPos(pos)}
              onOpenComputer={() => {
                setFallbackShelfPos(null);
                navigateViewpoint('computer');
              }}
              onAddBookToShelf={(pos) => openAddBook('single', pos)}
              onOpenBook={handleOpenBook}
            />
          </div>
        )}

        {/* Desk Computer Monitor Screen Framing (Surrounded by Live 3D Desk & Library) */}
        {viewpoint === 'computer' && (
          <div className="pointer-events-none fixed inset-0 top-[52px] z-30 flex items-center justify-center overflow-y-auto p-2 sm:p-5 md:p-8">
            <div className="pointer-events-auto w-full flex justify-center">
              <ArchiveComputerModal
                open
                activeTab={computerTab}
                onChangeTab={(tab) => {
                  setComputerTab(tab);
                  pushArchiveHistory({
                    viewpoint: 'computer',
                    computerTab: tab,
                    workId: null,
                  });
                }}
                libraryViewMode={libraryViewMode}
                onChangeLibraryViewMode={setLibraryViewMode}
                selectedShelfKey={selectedShelfKey}
                onChangeShelfKey={setSelectedShelfKey}
                books={snapshot.books}
                works={snapshot.works}
                editions={snapshot.editions}
                copies={snapshot.physicalCopies}
                cycles={snapshot.cycles}
                shelves={snapshot.shelves}
                reviews={snapshot.reviews}
                journalEntries={snapshot.journalEntries}
                settings={settings}
                pendingOps={snapshot.pendingOps}
                unresolvedConflicts={snapshot.unresolvedConflicts}
                devices={snapshot.devices}
                backupRecords={snapshot.backupRecords}
                isOnline={isOnline}
                syncing={syncing}
                onTriggerSync={handleTriggerSync}
                onToggleLocale={toggleLocale}
                onOpenConflicts={() => setConflictsOpen(true)}
                onOpenBook={handleOpenBook}
                onOpenAddBook={(mode) => openAddBook(mode)}
                onCloseToLibrary={() => navigateViewpoint('room')}
              />
            </div>
          </div>
        )}
      </main>

      {/* Registration Modal (Single & Batch) */}
      <AddBookModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingWorks={snapshot.works}
        existingBooks={snapshot.books}
        shelves={snapshot.shelves}
        defaultCurrency={settings.defaultCurrency}
        aiCoverAssistOptIn={settings.aiCoverAssistOptIn}
        initialMode={addModalMode}
        defaultShelfPosition={addShelfTarget}
        onCreated={handleBookRegistered}
        onCreatedBatch={handleBatchRegistered}
      />

      {/* Open Ancient Archive Folio Modal */}
      <BookDetailModal
        book={selectedBook}
        allWorks={snapshot.works}
        allEditions={snapshot.editions}
        shelves={snapshot.shelves}
        defaultCurrency={settings.defaultCurrency}
        inspecting3DBook={viewpoint === 'inspect_book' && selected3DBook !== null}
        onClose={handleCloseBook}
        onSelectWork={handleOpenBook}
        onDeletedWork={(workId, title) => setUndoToast({ workId, title })}
      />

      {/* Sync Conflicts Modal */}
      <ConflictResolutionModal
        conflicts={snapshot.unresolvedConflicts}
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
      />
    </div>
  );
}
export default App;
