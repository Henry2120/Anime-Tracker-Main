import { useEffect } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bookmark,
  History,
  Library,
  Monitor,
  Plus,
  Quote,
  RefreshCw,
  ScanBarcode,
  Settings,
  WifiOff,
} from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { isSupabaseConfigured } from '../lib/supabase';
import type {
  AppSettings,
  BackupRecord,
  DeviceRecord,
  Edition,
  JournalEntry,
  PhysicalCopy,
  ReadingCycle,
  Review,
  Shelf,
  SyncConflict,
  SyncOperation,
  Work,
} from '../types/domain';
import { LibraryView, type ShelfBucketKey } from '../views/LibraryView';
import {
  CurrentlyReadingView,
  ReadingHistoryView,
  WantToReadView,
} from '../views/ReadingAndWishlistViews';
import { ReadingJournalView } from '../views/ReadingJournalView';
import { SettingsView } from '../views/SettingsView';
import { StatisticsView } from '../views/StatisticsView';

export type ComputerTab =
  | 'library'
  | 'wishlist'
  | 'reading'
  | 'history'
  | 'journal'
  | 'stats'
  | 'settings';

interface ArchiveComputerModalProps {
  open: boolean;
  activeTab: ComputerTab;
  onChangeTab: (tab: ComputerTab) => void;
  libraryViewMode: 'shelves' | 'catalog';
  onChangeLibraryViewMode: (mode: 'shelves' | 'catalog') => void;
  selectedShelfKey: ShelfBucketKey;
  onChangeShelfKey: (key: ShelfBucketKey) => void;
  books: EnrichedBookRecord[];
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  shelves: Shelf[];
  reviews: Review[];
  journalEntries: JournalEntry[];
  settings: AppSettings;
  pendingOps: SyncOperation[];
  unresolvedConflicts: SyncConflict[];
  devices: DeviceRecord[];
  backupRecords: BackupRecord[];
  isOnline: boolean;
  syncing: boolean;
  onTriggerSync: () => void;
  onToggleLocale: () => void;
  onOpenConflicts: () => void;
  onOpenBook: (workId: string) => void;
  onOpenAddBook: (mode: 'single' | 'batch') => void;
  onCloseToLibrary: () => void;
}

export function ArchiveComputerModal({
  open,
  activeTab,
  onChangeTab,
  libraryViewMode,
  onChangeLibraryViewMode,
  selectedShelfKey,
  onChangeShelfKey,
  books,
  works,
  editions,
  copies,
  cycles,
  shelves,
  reviews,
  journalEntries,
  settings,
  pendingOps,
  unresolvedConflicts,
  devices,
  backupRecords,
  isOnline,
  syncing,
  onTriggerSync,
  onToggleLocale,
  onOpenConflicts,
  onOpenBook,
  onOpenAddBook,
  onCloseToLibrary,
}: ArchiveComputerModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseToLibrary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCloseToLibrary]);

  if (!open) return null;

  const tabs: { id: ComputerTab; label: string; icon: typeof Library }[] = [
    { id: 'library', label: 'Catalog & Shelves', icon: Library },
    { id: 'wishlist', label: 'Wishlist & Lookup', icon: Bookmark },
    { id: 'reading', label: 'Currently Reading', icon: BookOpen },
    { id: 'history', label: 'History', icon: History },
    { id: 'journal', label: 'Journal & Reviews', icon: Quote },
    { id: 'stats', label: 'Statistics', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Vault', icon: Settings },
  ];

  return (
    <div
      className="archive-transition-zoom-shelf mx-auto flex w-full max-w-[960px] flex-col overflow-hidden rounded-[22px] border-[5px] border-[#241812] bg-[#0A101D] ring-1 ring-[#D6BD8A]/55 shadow-[0_28px_80px_rgba(0,0,0,0.92)]"
      role="region"
      aria-label="Midnight Archive Desk Computer"
    >
      {/* Monitor Top Bezel & Workstation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#B49A67]/30 bg-[#1B130F] px-3.5 sm:px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onCloseToLibrary}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D6BD8A]/60 bg-[#392A24] px-3 text-xs font-semibold text-[#F4EFE6] hover:bg-[#4A352D] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#D6BD8A]" />
            <span>{t('room.returnLibrary')}</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <Monitor className="h-4 w-4 text-[#7797C9] shrink-0" />
            <span className="font-archive-display text-xs sm:text-sm font-bold text-[#F4EFE6] truncate">
              Archive Workstation Terminal
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {!isOnline && (
            <span
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#B49A67]/30 bg-[#141E30] px-2 text-[11px] font-medium text-[#D6BD8A]"
              title={t('status.offline')}
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('status.offline')}</span>
            </span>
          )}

          {unresolvedConflicts.length > 0 && (
            <button
              type="button"
              onClick={onOpenConflicts}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#B49A67]/40 bg-[#392A24] px-2.5 text-xs font-semibold text-[#D6BD8A]"
              title="Resolve Sync Conflicts"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="tabular-nums">{unresolvedConflicts.length}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleLocale}
            className="min-h-[36px] rounded-lg border border-[#B49A67]/35 bg-[#101827] px-2.5 text-xs font-mono font-semibold text-[#D6BD8A] hover:border-[#B49A67]"
            title="Switch Language EN / VI"
          >
            {settings.language.toUpperCase()}
          </button>

          {isSupabaseConfigured() && (
            <button
              type="button"
              onClick={onTriggerSync}
              disabled={syncing}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#B49A67]/35 bg-[#101827] px-2.5 text-xs font-semibold text-[#ECE6D8] hover:border-[#B49A67]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#B49A67] ${syncing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">{t('action.syncNow')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenAddBook('batch')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#141E30] px-3 text-xs font-semibold text-[#AEB9C9] hover:border-[#7797C9] hover:text-[#F4EFE6] whitespace-nowrap shrink-0"
          >
            <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
            <span>{t('action.batchScan')}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenAddBook('single')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{t('action.addBook')}</span>
          </button>
        </div>
      </div>

      {/* Computer OS Tab Strip */}
      <nav
        aria-label="Computer Archive Programs"
        className="flex overflow-x-auto gap-1 border-b border-[#B49A67]/25 bg-[#0F172A] px-3 pt-2"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-t-xl border-x border-t px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'border-[#B49A67]/45 bg-[#0B1120] text-[#D6BD8A] -mb-px pb-2'
                  : 'border-transparent text-[#AEB9C9] hover:text-[#F4EFE6]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Monitor Screen Content Area */}
      <div className="min-h-[54vh] max-h-[calc(100vh-225px)] overflow-y-auto bg-[#0B1120] p-4 sm:p-5">
        {activeTab === 'library' && (
          <LibraryView
            books={books}
            shelves={shelves}
            viewMode={libraryViewMode}
            selectedShelfKey={selectedShelfKey}
            onChangeShelfKey={onChangeShelfKey}
            onChangeViewMode={onChangeLibraryViewMode}
            onOpenBook={onOpenBook}
            onOpenAddBook={() => onOpenAddBook('single')}
            onOpenBatchScan={() => onOpenAddBook('batch')}
          />
        )}

        {activeTab === 'wishlist' && (
          <WantToReadView books={books} onOpenBook={onOpenBook} />
        )}

        {activeTab === 'reading' && (
          <CurrentlyReadingView books={books} onOpenBook={onOpenBook} />
        )}

        {activeTab === 'history' && (
          <ReadingHistoryView books={books} onOpenBook={onOpenBook} />
        )}

        {activeTab === 'journal' && (
          <ReadingJournalView
            works={works}
            reviews={reviews}
            entries={journalEntries}
            onOpenBook={onOpenBook}
          />
        )}

        {activeTab === 'stats' && (
          <StatisticsView
            works={works}
            editions={editions}
            copies={copies}
            cycles={cycles}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            pendingOps={pendingOps}
            conflicts={unresolvedConflicts}
            devices={devices}
            backupRecords={backupRecords}
            onOpenConflicts={onOpenConflicts}
          />
        )}
      </div>

      {/* Desk Monitor Chin */}
      <div className="flex items-center justify-between border-t border-[#B49A67]/20 bg-[#140E0B] px-5 py-1.5 text-[10px] font-mono text-[#AEB9C9]/70">
        <span>LOCAL-FIRST ARCHIVE WORKSTATION · ESC TO STEP BACK</span>
        <span className="tabular-nums">{books.length} works indexed</span>
      </div>
    </div>
  );
}
