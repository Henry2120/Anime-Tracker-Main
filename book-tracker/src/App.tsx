import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookHeart,
  BookOpen,
  Bookmark,
  History,
  Home,
  Library,
  Menu,
  Plus,
  Quote,
  RefreshCw,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import { AddBookModal } from './components/AddBookModal';
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
  const [addOpen, setAddOpen] = useState(false);
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
    const theme = settings?.theme ?? 'light';
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
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] dark:bg-slate-950 text-sm text-stone-500">
        Loading AniVerse Book Tracker...
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

  const currentNavLabel = navItems.find((n) => n.id === activeTab)?.label ?? 'Book Tracker';

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row relative z-20 ${
        embedded ? 'bg-transparent' : 'bg-[#FAF9F6] dark:bg-slate-950'
      } text-stone-900 dark:text-slate-100`}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:z-30 border-r border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-stone-200 dark:border-slate-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C2410C] text-white font-editorial font-bold text-lg">
            B
          </div>
          <div className="min-w-0">
            <p className="font-editorial text-sm font-bold leading-tight truncate">
              Book Tracker
            </p>
            <p className="text-[11px] text-stone-500 truncate">AniVerse Edition</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full min-h-[42px] items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-[#C2410C] font-semibold'
                    : 'text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 dark:border-slate-800 p-4 space-y-2 text-xs">
          {!isOnline && (
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>{t('status.offline')}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-stone-500 font-mono tabular-nums">
            <span>
              {snapshot.pendingOps.length > 0
                ? `${snapshot.pendingOps.length} ${t('status.pendingOps')}`
                : isSupabaseConfigured()
                  ? t('status.synced')
                  : t('status.localMode')}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Sticky Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-stone-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 lg:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menu"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-stone-700 dark:text-slate-200"
            >
              <Menu className="h-5 w-5" />
            </button>
            {worldSwitcher && (
              <div className="shrink-0 flex items-center gap-2">
                {worldSwitcher}
                <span
                  aria-hidden="true"
                  className="hidden sm:inline-block h-5 w-px bg-stone-200 dark:bg-slate-800"
                />
              </div>
            )}
            <h1 className="font-editorial text-base lg:text-lg font-semibold truncate">
              {currentNavLabel}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {snapshot.unresolvedConflicts.length > 0 && (
              <button
                type="button"
                onClick={() => setConflictsOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 px-2.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="tabular-nums">{snapshot.unresolvedConflicts.length}</span>
              </button>
            )}

            {!embedded && <PWAInstallPrompt />}

            <button
              type="button"
              onClick={toggleLocale}
              className="min-h-[40px] rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-mono font-semibold"
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
                className="hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span className="whitespace-nowrap">{t('action.syncNow')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#C2410C] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#9A3412] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>{t('action.addBook')}</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          {undoToast && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-stone-300 dark:border-slate-700 bg-stone-900 text-white px-4 py-2.5 text-xs">
              <span>Deleted &ldquo;{undoToast.title}&rdquo;.</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await restoreSoftDeletedEntity('works', undoToast.workId);
                    setUndoToast(null);
                  }}
                  className="font-semibold text-amber-400 hover:underline"
                >
                  Undo
                </button>
                <button type="button" onClick={() => setUndoToast(null)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              books={snapshot.books}
              works={snapshot.works}
              editions={snapshot.editions}
              copies={snapshot.physicalCopies}
              cycles={snapshot.cycles}
              settings={settings}
              onOpenBook={(id) => setSelectedWorkId(id)}
              onOpenAddBook={() => setAddOpen(true)}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              books={snapshot.books}
              shelves={snapshot.shelves}
              onOpenBook={(id) => setSelectedWorkId(id)}
              onOpenAddBook={() => setAddOpen(true)}
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
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 items-center border-t border-stone-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe h-16">
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
              onClick={() => setActiveTab(id)}
              className={`flex min-h-[44px] flex-col items-center justify-center py-1 ${
                active ? 'text-[#C2410C]' : 'text-stone-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5 text-[10px] font-medium tracking-tight truncate max-w-[76px]">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Drawer for Full 8-Section Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs">
          <div className="w-72 bg-white dark:bg-slate-900 h-full p-4 flex flex-col justify-between shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-800 pb-3">
                <span className="font-editorial font-bold">AniVerse Book Tracker</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-stone-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                        activeTab === item.id
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-[#C2410C] font-semibold'
                          : 'text-stone-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-stone-500 font-mono">
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
        shelves={snapshot.shelves}
        defaultCurrency={settings.defaultCurrency}
        aiCoverAssistOptIn={settings.aiCoverAssistOptIn}
        onCreated={(workId) => setSelectedWorkId(workId)}
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
