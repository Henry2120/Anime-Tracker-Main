import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookHeart,
  BookOpen,
  Bookmark,
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
import { LibraryView } from './views/LibraryView';
import {
  CurrentlyReadingView,
  ReadingHistoryView,
  WantToReadView,
} from './views/ReadingAndWishlistViews';
import { ReadingJournalView } from './views/ReadingJournalView';
import { SettingsView } from './views/SettingsView';
import { StatisticsView } from './views/StatisticsView';

type NavTab =
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

  if (!settings) {
    return (
      <div className="midnight-archive-shell archive-backdrop flex min-h-screen items-center justify-center text-sm text-[#AEB9C9]">
        Opening The Midnight Archive...
      </div>
    );
  }

  const navItems: { id: NavTab; label: string; icon: typeof Home }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: Home },
    { id: 'library', label: t('nav.library'), icon: Library },
    { id: 'reading', label: t('nav.reading'), icon: BookOpen },
    { id: 'wishlist', label: t('nav.wishlist'), icon: Bookmark },
    { id: 'history', label: t('nav.history'), icon: History },
    { id: 'journal', label: t('nav.journal'), icon: Quote },
    { id: 'stats', label: t('nav.stats'), icon: BarChart3 },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  const selectedBook =
    snapshot.books.find((b) => b.work.id === selectedWorkId) ?? null;

  const openAddBook = (mode: 'single' | 'batch' = 'single') => {
    setAddModalMode(mode);
    setAddOpen(true);
  };

  const navigateToRoom = (tab: NavTab, options?: { libraryMode?: 'shelves' | 'catalog' }) => {
    if (options?.libraryMode) {
      setLibraryViewMode(options.libraryMode);
    }
    setActiveTab(tab);
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

  const currentNavLabel =
    activeTab === 'library' && libraryViewMode === 'catalog'
      ? `${t('nav.library')} · ${t('nav.catalog')}`
      : navItems.find((n) => n.id === activeTab)?.label ?? 'The Midnight Archive';

  return (
    <div
      className={`midnight-archive-shell min-h-screen flex flex-col lg:flex-row relative z-20 ${
        embedded ? 'archive-backdrop-embedded' : 'archive-backdrop'
      } text-[#F4EFE6]`}
    >
      <ArchiveAtmosphere />

      {/* Desktop Walnut & Navy Wing Rail */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:z-30 border-r border-[#B49A67]/25 bg-[#0B1120]/95 backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-[#B49A67]/20 px-5 py-4 bg-gradient-to-b from-[#392A24]/45 to-transparent">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#B49A67]/50 bg-[#392A24] text-[#D6BD8A] font-archive-display font-bold text-lg shadow-inner">
            M
          </div>
          <div className="min-w-0">
            <p className="font-archive-display text-xs font-bold leading-tight text-[#F4EFE6] truncate">
              Midnight Archive
            </p>
            <p className="text-[11px] text-[#B49A67] truncate">AniVerse Sanctuary</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id && !(item.id === 'library' && libraryViewMode === 'catalog');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  navigateToRoom(item.id, item.id === 'library' ? { libraryMode: 'shelves' } : undefined)
                }
                className={`flex w-full min-h-[42px] items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-all ${
                  active
                    ? 'border border-[#B49A67]/45 bg-[#392A24]/80 text-[#D6BD8A] font-semibold shadow-sm'
                    : 'border border-transparent text-[#AEB9C9] hover:bg-[#141E30]/90 hover:text-[#F4EFE6]'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#B49A67]' : ''}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Fast Catalog View Shortcut */}
          <button
            type="button"
            onClick={() => navigateToRoom('library', { libraryMode: 'catalog' })}
            className={`flex w-full min-h-[40px] items-center gap-3 rounded-xl px-3.5 text-xs font-medium transition-all ${
              activeTab === 'library' && libraryViewMode === 'catalog'
                ? 'border border-[#7797C9]/45 bg-[#141E30] text-[#7797C9] font-semibold'
                : 'border border-transparent text-[#AEB9C9]/80 hover:bg-[#141E30]/70 hover:text-[#F4EFE6]'
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('nav.catalog')}</span>
          </button>
        </nav>

        <div className="border-t border-[#B49A67]/20 p-4 space-y-2.5 text-xs bg-[#090E1A]/80">
          {!isOnline && (
            <div className="flex items-center gap-1.5 text-[#D6BD8A] font-medium">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>{t('status.offline')}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[#AEB9C9] font-mono tabular-nums text-[11px]">
            <span>
              {snapshot.pendingOps.length > 0
                ? `${snapshot.pendingOps.length} ${t('status.pendingOps')}`
                : isSupabaseConfigured()
                  ? t('status.synced')
                  : t('status.localMode')}
            </span>
            <span className="text-[#B49A67]">{snapshot.books.length} vols</span>
          </div>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen relative z-10 min-w-0">
        {/* Sticky Architectural Top Bar */}
        <header className="sticky top-0 z-30 flex min-h-[58px] items-center justify-between gap-2 border-b border-[#B49A67]/25 bg-[#0B1120]/88 backdrop-blur-md px-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menu"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-lg text-[#ECE6D8] hover:bg-[#141E30]"
            >
              <Menu className="h-5 w-5" />
            </button>
            {worldSwitcher && (
              <div className="shrink-0 flex items-center gap-2">
                {worldSwitcher}
                <span
                  aria-hidden="true"
                  className="hidden sm:inline-block h-5 w-px bg-[#B49A67]/25"
                />
              </div>
            )}
            <div className="flex items-center gap-2 min-w-0">
              {activeTab !== 'dashboard' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="hidden md:inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#B49A67]/35 bg-[#392A24]/60 px-2.5 text-[11px] font-semibold text-[#D6BD8A] hover:bg-[#392A24]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t('nav.returnHall')}
                </button>
              )}
              <h1 className="font-archive-display text-sm sm:text-base font-semibold tracking-wide truncate text-[#F4EFE6]">
                {currentNavLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {snapshot.unresolvedConflicts.length > 0 && (
              <button
                type="button"
                onClick={() => setConflictsOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#B49A67]/40 bg-[#392A24] px-2.5 text-xs font-semibold text-[#D6BD8A]"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="tabular-nums">{snapshot.unresolvedConflicts.length}</span>
              </button>
            )}

            {!embedded && <PWAInstallPrompt />}

            <button
              type="button"
              onClick={toggleLocale}
              className="min-h-[40px] rounded-lg border border-[#B49A67]/35 bg-[#101827] px-2.5 text-xs font-mono font-semibold text-[#D6BD8A] hover:border-[#B49A67]"
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
                className="hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#B49A67]/35 bg-[#101827] px-3 text-xs font-semibold text-[#ECE6D8] hover:border-[#B49A67]"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-[#B49A67] ${syncing ? 'animate-spin' : ''}`} />
                <span className="whitespace-nowrap">{t('action.syncNow')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openAddBook('batch')}
              className="hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#141E30] px-3 py-2 text-xs font-semibold text-[#AEB9C9] hover:border-[#7797C9] hover:text-[#F4EFE6] whitespace-nowrap shrink-0"
              title="Scan or enter multiple books at once"
            >
              <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
              <span>{t('action.batchScan')}</span>
            </button>

            <button
              type="button"
              onClick={() => openAddBook('single')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D6BD8A]/50 bg-[#B49A67] px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#0B1120] hover:bg-[#D6BD8A] whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>{t('action.addBook')}</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-3.5 sm:p-4 lg:p-6 pb-24 lg:pb-8 max-w-7xl w-full mx-auto min-w-0">
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

          <div key={`${activeTab}-${libraryViewMode}`} className="animate-archive-room">
            {activeTab === 'dashboard' && (
              <DashboardView
                books={snapshot.books}
                works={snapshot.works}
                editions={snapshot.editions}
                copies={snapshot.physicalCopies}
                cycles={snapshot.cycles}
                shelves={snapshot.shelves}
                settings={settings}
                onOpenBook={(id) => setSelectedWorkId(id)}
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
                onChangeViewMode={setLibraryViewMode}
                onOpenBook={(id) => setSelectedWorkId(id)}
                onOpenAddBook={() => openAddBook('single')}
                onOpenBatchScan={() => openAddBook('batch')}
              />
            )}

            {activeTab === 'reading' && (
              <CurrentlyReadingView
                books={snapshot.books}
                onOpenBook={(id) => setSelectedWorkId(id)}
              />
            )}

            {activeTab === 'wishlist' && (
              <WantToReadView
                books={snapshot.books}
                onOpenBook={(id) => setSelectedWorkId(id)}
              />
            )}

            {activeTab === 'history' && (
              <ReadingHistoryView
                books={snapshot.books}
                onOpenBook={(id) => setSelectedWorkId(id)}
              />
            )}

            {activeTab === 'journal' && (
              <ReadingJournalView
                works={snapshot.works}
                reviews={snapshot.reviews}
                entries={snapshot.journalEntries}
                onOpenBook={(id) => setSelectedWorkId(id)}
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
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Wing Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 items-center border-t border-[#B49A67]/25 bg-[#0B1120]/95 backdrop-blur-md pb-safe h-16">
        {(
          [
            ['dashboard', t('nav.dashboard'), Home],
            ['library', t('nav.library'), Library],
            ['reading', t('nav.reading'), BookHeart],
            ['settings', t('nav.settings'), Settings],
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
              <Icon className="h-5 w-5" />
              <span className="mt-0.5 text-[10px] font-medium tracking-tight truncate max-w-[78px]">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Drawer for Full Wing Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/70 backdrop-blur-xs">
          <div className="w-72 border-r border-[#B49A67]/30 bg-[#0B1120] h-full p-4 flex flex-col justify-between shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#B49A67]/25 pb-3">
                <span className="font-archive-display font-bold text-sm text-[#D6BD8A]">
                  The Midnight Archive
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
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
            <p className="text-[11px] text-[#AEB9C9] font-mono">
              {isOnline ? t('status.online') : t('status.offline')}
            </p>
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
        onCreated={(workId) => setSelectedWorkId(workId)}
        onCreatedBatch={(workIds) => {
          if (workIds.length === 1) {
            setSelectedWorkId(workIds[0]);
          } else {
            navigateToRoom('library', { libraryMode: 'shelves' });
          }
        }}
      />

      <BookDetailModal
        book={selectedBook}
        allWorks={snapshot.works}
        allEditions={snapshot.editions}
        shelves={snapshot.shelves}
        defaultCurrency={settings.defaultCurrency}
        onClose={() => setSelectedWorkId(null)}
        onSelectWork={(workId) => setSelectedWorkId(workId)}
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
