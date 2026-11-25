import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookHeart,
  BookOpen,
  Bookmark,
  Flame,
  History,
  Home,
  Layers,
  Library,
  Menu,
  Plus,
  Quote,
  RefreshCw,
  ScanBarcode,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import './midnightArchive.css';
import { AddBookModal } from './components/AddBookModal';
import { ArchiveAtmosphere } from './components/ArchiveAtmosphere';
import {
  ArchiveTransitionStage,
  type ArchiveTransitionKind,
} from './components/ArchiveTransitionStage';
import { BookDetailModal } from './components/BookDetailModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { PWAInstallPrompt } from './components/PWAInstallBanner';
import { db } from './db/dexie';
import { useLibrarySnapshot } from './hooks/useLibraryData';
import { I18nProvider, useI18n } from './i18n/useI18n';
import { isSupabaseConfigured } from './lib/supabase';
import { restoreSoftDeletedEntity } from './services/libraryService';
import { runSyncCycle } from './sync/syncEngine';
import { DashboardView } from './views/DashboardView';
import { LibraryView, type ShelfBucketKey } from './views/LibraryView';
import {
  CurrentlyReadingView,
  ReadingHistoryView,
  WantToReadView,
} from './views/ReadingAndWishlistViews';
import { ReadingJournalView } from './views/ReadingJournalView';
import { SettingsView } from './views/SettingsView';
import { StatisticsView } from './views/StatisticsView';

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

export function App({ worldSwitcher, embedded = false }: BookTrackerAppProps = {}) {
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
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [libraryViewMode, setLibraryViewMode] = useState<'shelves' | 'catalog'>('shelves');
  const [selectedShelfKey, setSelectedShelfKey] = useState<ShelfBucketKey>('__all__');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [transitionKind, setTransitionKind] = useState<ArchiveTransitionKind>('enter-wing');
  const [lanternWarmth, setLanternWarmth] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addModalMode, setAddModalMode] = useState<'single' | 'batch'>('single');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [undoToast, setUndoToast] = useState<{ workId: string; title: string } | null>(null);

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

  // Browser Back support across Archive rooms & open folios without mutating URL query (?world=books)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    const onPopState = (ev: PopStateEvent) => {
      const state = ev.state as {
        archiveTab?: NavTab;
        archiveLibraryMode?: 'shelves' | 'catalog';
        archiveShelfKey?: ShelfBucketKey;
        archiveWorkId?: string | null;
      } | null;

      if (!state || !state.archiveTab) {
        setTransitionKind('step-back');
        setSelectedWorkId(null);
        setActiveTab('dashboard');
        return;
      }

      setTransitionKind(state.archiveTab === 'dashboard' ? 'step-back' : 'enter-wing');
      setSelectedWorkId(state.archiveWorkId ?? null);
      setActiveTab(state.archiveTab);
      if (state.archiveLibraryMode) setLibraryViewMode(state.archiveLibraryMode);
      if (state.archiveShelfKey) setSelectedShelfKey(state.archiveShelfKey);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const pushArchiveHistory = useCallback(
    (next: {
      tab: NavTab;
      libraryMode: 'shelves' | 'catalog';
      shelfKey: ShelfBucketKey;
      workId: string | null;
    }) => {
      if (typeof window === 'undefined' || !window.history) return;
      try {
        window.history.pushState(
          {
            ...(typeof window.history.state === 'object' && window.history.state !== null
              ? window.history.state
              : {}),
            archiveTab: next.tab,
            archiveLibraryMode: next.libraryMode,
            archiveShelfKey: next.shelfKey,
            archiveWorkId: next.workId,
          },
          '',
          window.location.href
        );
      } catch {
        // Ignore restricted history API contexts
      }
    },
    []
  );

  if (!settings) {
    return (
      <div className="midnight-archive-shell archive-backdrop flex min-h-screen items-center justify-center text-sm text-[#AEB9C9]">
        Opening The Midnight Archive...
      </div>
    );
  }

  const navItems: { id: NavTab; label: string; shortLabel: string; icon: typeof Home }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), shortLabel: 'Grand Hall', icon: Home },
    { id: 'library', label: t('nav.library'), shortLabel: 'Stacks', icon: Library },
    { id: 'wishlist', label: t('nav.wishlist'), shortLabel: 'Acquisitions', icon: Bookmark },
    { id: 'reading', label: t('nav.reading'), shortLabel: 'Reading', icon: BookOpen },
    { id: 'journal', label: t('nav.journal'), shortLabel: 'Study', icon: Quote },
    { id: 'history', label: t('nav.history'), shortLabel: 'Chronicles', icon: History },
    { id: 'stats', label: t('nav.stats'), shortLabel: 'Observatory', icon: BarChart3 },
    { id: 'settings', label: t('nav.settings'), shortLabel: 'Office', icon: Settings },
  ];

  const desktopWingLinks = navItems.filter((item) =>
    ['dashboard', 'library', 'wishlist', 'journal', 'settings'].includes(item.id)
  );

  const selectedBook =
    snapshot.books.find((b) => b.work.id === selectedWorkId) ?? null;

  const openAddBook = (mode: 'single' | 'batch' = 'single') => {
    setAddModalMode(mode);
    setAddOpen(true);
  };

  const navigateToRoom = (
    tab: NavTab,
    options?: {
      libraryMode?: 'shelves' | 'catalog';
      shelfKey?: ShelfBucketKey;
      searchQuery?: string;
      transition?: ArchiveTransitionKind;
    }
  ) => {
    const nextLibraryMode = options?.libraryMode ?? libraryViewMode;
    const nextShelfKey = options?.shelfKey ?? selectedShelfKey;

    if (options?.libraryMode) setLibraryViewMode(options.libraryMode);
    if (options?.shelfKey) setSelectedShelfKey(options.shelfKey);
    if (typeof options?.searchQuery === 'string') setLibrarySearchQuery(options.searchQuery);

    const inferredTransition: ArchiveTransitionKind =
      options?.transition ??
      (tab === 'dashboard'
        ? 'step-back'
        : tab === 'library'
          ? 'zoom-shelf'
          : 'enter-wing');

    setTransitionKind(inferredTransition);
    setActiveTab(tab);
    pushArchiveHistory({
      tab,
      libraryMode: nextLibraryMode,
      shelfKey: nextShelfKey,
      workId: null,
    });
  };

  const handleOpenBook = (workId: string) => {
    setSelectedWorkId(workId);
    pushArchiveHistory({
      tab: activeTab,
      libraryMode: libraryViewMode,
      shelfKey: selectedShelfKey,
      workId,
    });
  };

  const handleCloseBook = () => {
    setSelectedWorkId(null);
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

  const activeShelfTitle =
    selectedShelfKey === '__all__'
      ? 'All Volumes'
      : selectedShelfKey === '__unshelved__'
        ? 'Uncataloged Shelf'
        : snapshot.shelves.find((s) => s.id === selectedShelfKey)?.name ?? 'Shelf';

  const currentNavLabel =
    activeTab === 'library'
      ? libraryViewMode === 'catalog'
        ? `${t('nav.library')} · ${t('nav.catalog')}`
        : `${t('nav.library')} · ${activeShelfTitle}`
      : navItems.find((n) => n.id === activeTab)?.label ?? 'The Midnight Archive';

  return (
    <div
      className={`midnight-archive-shell min-h-screen flex flex-col relative z-20 ${
        embedded ? 'archive-backdrop-embedded' : 'archive-backdrop'
      } text-[#F4EFE6]`}
    >
      <ArchiveAtmosphere lanternWarmth={lanternWarmth} />

      {/* Three-Zone Architectural Top Beam (Full-Canvas Immersion — Zero Admin Sidebar) */}
      <header className="sticky top-0 z-30 flex min-h-[56px] items-center justify-between gap-4 border-b border-[#B49A67]/25 bg-[#0B1120]/88 backdrop-blur-md px-3 sm:px-5 lg:px-8">
        {/* Zone 1: Brand + WorldSwitcher + Room Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Library Wings Directory"
            className="lg:hidden min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-lg text-[#ECE6D8] hover:bg-[#141E30]"
          >
            <Menu className="h-5 w-5" />
          </button>

          {worldSwitcher && (
            <div className="shrink-0 flex items-center gap-2">
              {worldSwitcher}
              <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-[#B49A67]/30" />
            </div>
          )}

          {activeTab !== 'dashboard' ? (
            <button
              type="button"
              onClick={() => navigateToRoom('dashboard', { transition: 'step-back' })}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#B49A67]/35 bg-[#392A24]/60 px-2.5 text-xs font-semibold text-[#D6BD8A] hover:bg-[#392A24] whitespace-nowrap shrink-0"
              title={t('nav.returnHall')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('nav.returnHall')}</span>
              <span className="sm:hidden">Hall</span>
            </button>
          ) : (
            <span className="font-archive-display text-sm sm:text-base font-bold text-[#F4EFE6] whitespace-nowrap shrink-0">
              The Midnight Archive
            </span>
          )}

          {activeTab !== 'dashboard' && (
            <h1 className="font-archive-display text-xs sm:text-sm font-semibold tracking-wide truncate text-[#F4EFE6]">
              {currentNavLabel}
            </h1>
          )}
        </div>

        {/* Zone 2: Clean Architectural Wing Links (Desktop) */}
        <nav
          aria-label="Library Wings"
          className="hidden lg:flex items-center gap-5 text-xs font-medium text-[#AEB9C9]"
        >
          {desktopWingLinks.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  navigateToRoom(
                    item.id,
                    item.id === 'library' ? { libraryMode: 'shelves' } : undefined
                  )
                }
                className={`relative py-2 whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-[#D6BD8A] font-semibold' : 'hover:text-[#F4EFE6]'
                }`}
              >
                {item.shortLabel}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-[#B49A67] rounded-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Practical Library Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isOnline && (
            <span
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#B49A67]/30 bg-[#141E30] px-2 text-[11px] font-medium text-[#D6BD8A]"
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
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#B49A67]/40 bg-[#392A24] px-2.5 text-xs font-semibold text-[#D6BD8A]"
              title="Sync Conflicts"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="tabular-nums">{snapshot.unresolvedConflicts.length}</span>
            </button>
          )}

          {!embedded && <PWAInstallPrompt />}

          <button
            type="button"
            onClick={() => setLanternWarmth((v) => !v)}
            aria-pressed={lanternWarmth}
            title={lanternWarmth ? 'Switch to Cool Moonlight' : 'Light Warm Candlelight'}
            className={`hidden sm:inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border transition-colors ${
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
            className="min-h-[38px] rounded-lg border border-[#B49A67]/35 bg-[#101827] px-2.5 text-xs font-mono font-semibold text-[#D6BD8A] hover:border-[#B49A67]"
            title="Switch Language EN / VI"
          >
            {settings.language.toUpperCase()}
          </button>

          {isSupabaseConfigured() && (
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={syncing}
              aria-label={t('action.syncNow')}
              className="hidden md:inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#B49A67]/35 bg-[#101827] px-3 text-xs font-semibold text-[#ECE6D8] hover:border-[#B49A67]"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#B49A67] ${syncing ? 'animate-spin' : ''}`} />
              <span className="whitespace-nowrap">{t('action.syncNow')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openAddBook('batch')}
            className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#141E30] px-3 text-xs font-semibold text-[#AEB9C9] hover:border-[#7797C9] hover:text-[#F4EFE6] whitespace-nowrap shrink-0"
            title="Scan or enter multiple books at once"
          >
            <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
            <span>{t('action.batchScan')}</span>
          </button>

          <button
            type="button"
            onClick={() => openAddBook('single')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D6BD8A]/50 bg-[#B49A67] px-3 sm:px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] whitespace-nowrap shrink-0 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>{t('action.addBook')}</span>
          </button>
        </div>
      </header>

      {/* Main Architectural Viewport */}
      <main className="flex-1 p-3.5 sm:p-5 lg:p-7 pb-24 lg:pb-10 max-w-7xl w-full mx-auto relative z-10 min-w-0">
        {undoToast && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[#B49A67]/45 bg-[#141E30] text-[#F4EFE6] px-4 py-2.5 text-xs shadow-lg">
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

        <ArchiveTransitionStage
          transitionKey={`${activeTab}-${libraryViewMode}`}
          kind={transitionKind}
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              books={snapshot.books}
              works={snapshot.works}
              editions={snapshot.editions}
              copies={snapshot.physicalCopies}
              cycles={snapshot.cycles}
              shelves={snapshot.shelves}
              settings={settings}
              lanternWarmth={lanternWarmth}
              onToggleLantern={() => setLanternWarmth((v) => !v)}
              onOpenBook={handleOpenBook}
              onOpenAddBook={() => openAddBook('single')}
              onOpenBatchScan={() => openAddBook('batch')}
              onNavigate={(tab, options) => navigateToRoom(tab, options)}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              books={snapshot.books}
              shelves={snapshot.shelves}
              viewMode={libraryViewMode}
              selectedShelfKey={selectedShelfKey}
              initialQuery={librarySearchQuery}
              onChangeShelfKey={setSelectedShelfKey}
              onChangeViewMode={setLibraryViewMode}
              onOpenBook={handleOpenBook}
              onOpenAddBook={() => openAddBook('single')}
              onOpenBatchScan={() => openAddBook('batch')}
            />
          )}

          {activeTab === 'reading' && (
            <CurrentlyReadingView
              books={snapshot.books}
              onOpenBook={handleOpenBook}
            />
          )}

          {activeTab === 'wishlist' && (
            <WantToReadView
              books={snapshot.books}
              onOpenBook={handleOpenBook}
            />
          )}

          {activeTab === 'history' && (
            <ReadingHistoryView
              books={snapshot.books}
              onOpenBook={handleOpenBook}
            />
          )}

          {activeTab === 'journal' && (
            <ReadingJournalView
              works={snapshot.works}
              reviews={snapshot.reviews}
              entries={snapshot.journalEntries}
              onOpenBook={handleOpenBook}
            />
          )}

          {activeTab === 'stats' && (
            <StatisticsView
              works={snapshot.works}
              editions={snapshot.editions}
              copies={snapshot.physicalCopies}
              cycles={snapshot.cycles}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              pendingOps={snapshot.pendingOps}
              conflicts={snapshot.unresolvedConflicts}
              devices={snapshot.devices}
              backupRecords={snapshot.backupRecords}
              onOpenConflicts={() => setConflictsOpen(true)}
            />
          )}
        </ArchiveTransitionStage>
      </main>

      {/* Mobile Compact Bottom Wing Dock (<= 15% viewport height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 items-center border-t border-[#B49A67]/25 bg-[#0B1120]/95 backdrop-blur-md pb-safe h-15">
        {(
          [
            ['dashboard', 'Hall', Home],
            ['library', 'Stacks', Library],
            ['wishlist', 'Acquire', Bookmark],
            ['journal', 'Study', BookHeart],
            ['settings', 'Office', Settings],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigateToRoom(id)}
              className={`flex min-h-[44px] flex-col items-center justify-center py-1 ${
                active ? 'text-[#D6BD8A]' : 'text-[#AEB9C9]'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              <span className="mt-0.5 text-[10px] font-medium tracking-tight truncate max-w-[66px]">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Mobile & Accessibility Full Wing Directory Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/75 backdrop-blur-xs">
          <div className="w-72 border-r border-[#B49A67]/30 bg-[#0B1120] h-full p-4 flex flex-col justify-between shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#B49A67]/25 pb-3">
                <span className="font-archive-display font-bold text-sm text-[#D6BD8A]">
                  The Midnight Archive
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close Directory"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#AEB9C9]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        navigateToRoom(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                        active
                          ? 'border border-[#B49A67]/40 bg-[#392A24] text-[#D6BD8A] font-semibold'
                          : 'text-[#AEB9C9]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    navigateToRoom('library', { libraryMode: 'catalog' });
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#7797C9]"
                >
                  <Layers className="h-4 w-4" />
                  {t('nav.catalog')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAddBook('batch');
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#D6BD8A]"
                >
                  <ScanBarcode className="h-4 w-4" />
                  {t('action.batchScan')}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#AEB9C9] font-mono">
              <span>{isOnline ? t('status.online') : t('status.offline')}</span>
              <button
                type="button"
                onClick={() => setLanternWarmth((v) => !v)}
                className="inline-flex items-center gap-1 text-[#D6BD8A]"
              >
                <Flame className="h-3.5 w-3.5" />
                {lanternWarmth ? 'Candlelit' : 'Moonlit'}
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Modals */}
      <AddBookModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingWorks={snapshot.works}
        existingBooks={snapshot.books}
        shelves={snapshot.shelves}
        defaultCurrency={settings.defaultCurrency}
        aiCoverAssistOptIn={settings.aiCoverAssistOptIn}
        initialMode={addModalMode}
        onCreated={handleOpenBook}
        onCreatedBatch={(workIds) => {
          if (workIds.length === 1) {
            handleOpenBook(workIds[0]);
          } else {
            navigateToRoom('library', { libraryMode: 'shelves', transition: 'zoom-shelf' });
          }
        }}
      />

      <BookDetailModal
        book={selectedBook}
        allWorks={snapshot.works}
        allEditions={snapshot.editions}
        shelves={snapshot.shelves}
        defaultCurrency={settings.defaultCurrency}
        onClose={handleCloseBook}
        onSelectWork={handleOpenBook}
        onDeletedWork={(workId, title) => setUndoToast({ workId, title })}
      />

      <ConflictResolutionModal
        conflicts={snapshot.unresolvedConflicts}
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
      />
    </div>
  );
}
export default App;
