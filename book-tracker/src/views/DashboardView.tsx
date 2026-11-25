import {
  BarChart3,
  BookHeart,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Coins,
  Compass,
  Feather,
  History,
  Layers,
  Library,
  Pause,
  Plus,
  ScanBarcode,
  Settings,
} from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { updateCycleStatus } from '../services/libraryService';
import type {
  AppSettings,
  CurrencyCode,
  Edition,
  PhysicalCopy,
  ReadingCycle,
  Shelf,
  Work,
} from '../types/domain';
import { formatCurrency } from '../utils/currency';
import { computeLibraryStatistics } from '../utils/statsCalculator';

interface DashboardViewProps {
  books: EnrichedBookRecord[];
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  shelves: Shelf[];
  settings: AppSettings;
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
  onOpenBatchScan: () => void;
  onNavigate: (
    tab: 'library' | 'reading' | 'wishlist' | 'history' | 'journal' | 'stats' | 'settings',
    options?: { libraryMode?: 'shelves' | 'catalog' }
  ) => void;
}

export function DashboardView({
  books,
  works,
  editions,
  copies,
  cycles,
  shelves,
  onOpenBook,
  onOpenAddBook,
  onOpenBatchScan,
  onNavigate,
}: DashboardViewProps) {
  const { t } = useI18n();
  const stats = computeLibraryStatistics({
    works,
    editions,
    copies,
    cycles,
  });

  const currentlyReading = books.filter((b) => b.activeCycle?.status === 'currently_reading');
  const wishlistCount = books.filter(
    (b) =>
      b.wishlistCopiesCount > 0 ||
      (b.activeCycle?.status === 'want_to_read' && b.ownedCopiesCount === 0)
  ).length;
  const recentVolumes = [...books]
    .sort((a, b) => b.work.createdAt.localeCompare(a.work.createdAt))
    .slice(0, 6);
  const totalSpendEntries = Object.entries(stats.collectionSpendByCurrency);

  return (
    <div className="space-y-6">
      {/* The Grand Hall — Moonlit Architectural Vestibule */}
      <section className="archive-walnut-panel relative overflow-hidden rounded-3xl p-5 sm:p-7">
        {/* Subtle Moonlit Lancet Arch Decorative Motif */}
        <svg
          aria-hidden="true"
          viewBox="0 0 360 220"
          className="pointer-events-none absolute -right-8 -top-6 h-56 w-80 opacity-20"
        >
          <path
            d="M70 210 L70 105 Q180 12 290 105 L290 210"
            fill="none"
            stroke="#B49A67"
            strokeWidth="1.5"
          />
          <circle cx="180" cy="84" r="38" fill="none" stroke="#7797C9" strokeWidth="1.2" />
          <path d="M180 34 L180 134 M130 84 L230 84" stroke="#B49A67" strokeOpacity="0.45" strokeWidth="0.8" />
        </svg>

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="animate-archive-float hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#B49A67]/50 bg-gradient-to-br from-[#141E30] via-[#101827] to-[#241914] shadow-xl">
              <BookOpen className="h-7 w-7 text-[#D6BD8A]" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <p className="font-archive-display text-[11px] uppercase tracking-[0.2em] text-[#B49A67]">
                The Midnight Archive · Sanctuary Wing
              </p>
              <h2 className="font-archive-display text-xl sm:text-2xl font-bold text-[#F4EFE6] leading-tight">
                Welcome to The Grand Hall
              </h2>
              <p className="text-xs sm:text-sm text-[#AEB9C9] max-w-2xl leading-relaxed">
                Navigate by wing from candlelit bookshelves to acquisitions, chronicle your editions, or scan stacks of volumes directly into your archive ledger.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('library', { libraryMode: 'shelves' })}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#B49A67]/40 bg-[#101827]/90 px-3.5 text-xs font-semibold text-[#D6BD8A] hover:border-[#D6BD8A]"
            >
              <Library className="h-4 w-4" />
              Enter Grand Stacks
            </button>
            <button
              type="button"
              onClick={onOpenBatchScan}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#141E30] px-3.5 text-xs font-semibold text-[#AEB9C9] hover:border-[#7797C9] hover:text-[#F4EFE6]"
            >
              <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
              {t('action.batchScan')}
            </button>
            <button
              type="button"
              onClick={onOpenAddBook}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
            >
              <Plus className="h-4 w-4" />
              {t('action.addBook')}
            </button>
          </div>
        </div>
      </section>

      {/* Archival Ledger Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('library', { libraryMode: 'shelves' })}
          className="archive-panel rounded-2xl p-4 text-left hover:border-[#D6BD8A]/65 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#AEB9C9]">
            <span>{t('dash.ownedCopies')}</span>
            <Library className="h-4 w-4 text-[#B49A67]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {stats.ownedCopiesCount}
          </p>
          <p className="mt-1 text-xs text-[#AEB9C9]/80 tabular-nums">
            {stats.totalWorks} works · {stats.totalEditions} editions
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reading')}
          className="archive-panel rounded-2xl p-4 text-left hover:border-[#7797C9]/70 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#AEB9C9]">
            <span>{t('nav.reading')}</span>
            <BookOpen className="h-4 w-4 text-[#7797C9]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {currentlyReading.length}
          </p>
          <p className="mt-1 text-xs text-[#AEB9C9]/80">Active reading cycles</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className="archive-panel rounded-2xl p-4 text-left hover:border-[#B49A67]/65 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#AEB9C9]">
            <span>{t('dash.booksFinished')}</span>
            <BookHeart className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {stats.finishedUniqueWorksCount}
          </p>
          <p className="mt-1 text-xs text-[#AEB9C9]/80 tabular-nums">
            {stats.finishedCyclesCount} finished cycle(s)
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('wishlist')}
          className="archive-panel rounded-2xl p-4 text-left hover:border-[#B49A67]/65 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#AEB9C9]">
            <span>{t('nav.wishlist')}</span>
            <Bookmark className="h-4 w-4 text-[#D6BD8A]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {wishlistCount}
          </p>
          <p className="mt-1 text-xs text-[#AEB9C9]/80">Wishlist &amp; online discovery</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('stats')}
          className="col-span-2 lg:col-span-1 archive-panel rounded-2xl p-4 text-left hover:border-[#B49A67]/65 transition-all"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#AEB9C9]">
            <span>{t('dash.collectionValue')}</span>
            <Coins className="h-4 w-4 text-[#B49A67]" />
          </div>
          <p className="mt-2 font-mono text-lg sm:text-xl font-bold tabular-nums text-[#F4EFE6] truncate">
            {totalSpendEntries.length > 0
              ? formatCurrency(totalSpendEntries[0][1], totalSpendEntries[0][0] as CurrencyCode)
              : '—'}
          </p>
          <p className="mt-1 text-xs text-[#AEB9C9]/80">
            {totalSpendEntries.length > 1
              ? `+${totalSpendEntries.length - 1} other currency`
              : 'Tracked physical value'}
          </p>
        </button>
      </div>

      {/* Interactive Gothic Wing Portals */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-archive-display text-base sm:text-lg font-semibold text-[#F4EFE6] flex items-center gap-2">
            <Compass className="h-4 w-4 text-[#B49A67]" />
            Archive Wings &amp; Interactive Portals
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('library', { libraryMode: 'catalog' })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#7797C9] hover:text-[#D6BD8A]"
          >
            <Layers className="h-3.5 w-3.5" />
            Open Fast {t('nav.catalog')} →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(
            [
              {
                title: t('nav.library'),
                sub: `${shelves.length} shelves · ${books.length} vols`,
                icon: Library,
                accent: '#B49A67',
                action: () => onNavigate('library', { libraryMode: 'shelves' }),
              },
              {
                title: t('nav.wishlist'),
                sub: `${wishlistCount} sought · Discover`,
                icon: Bookmark,
                accent: '#7797C9',
                action: () => onNavigate('wishlist'),
              },
              {
                title: t('nav.journal'),
                sub: 'Reviews & Parchment Notes',
                icon: Feather,
                accent: '#D6BD8A',
                action: () => onNavigate('journal'),
              },
              {
                title: t('nav.history'),
                sub: `${stats.finishedCyclesCount} completed cycles`,
                icon: History,
                accent: '#776B9C',
                action: () => onNavigate('history'),
              },
              {
                title: t('nav.stats'),
                sub: 'Charts & Breakdowns',
                icon: BarChart3,
                accent: '#7797C9',
                action: () => onNavigate('stats'),
              },
              {
                title: t('nav.settings'),
                sub: 'Vault, Sync & Backups',
                icon: Settings,
                accent: '#AEB9C9',
                action: () => onNavigate('settings'),
              },
            ] as const
          ).map((portal) => {
            const Icon = portal.icon;
            return (
              <button
                key={portal.title}
                type="button"
                onClick={portal.action}
                className="archive-gothic-portal flex flex-col items-center justify-end px-3 pb-4 pt-6 text-center min-h-[144px] group"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#B49A67]/40 bg-[#0B1120]/80 group-hover:scale-105 transition-transform"
                  style={{ color: portal.accent }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-archive-display text-xs font-semibold text-[#F4EFE6] leading-snug">
                  {portal.title}
                </span>
                <span className="mt-1 text-[10px] text-[#AEB9C9] line-clamp-1">
                  {portal.sub}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Currently Reading Wing */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-archive-display text-base sm:text-lg font-semibold text-[#F4EFE6]">
            {t('nav.reading')}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('reading')}
            className="text-xs font-semibold text-[#D6BD8A] hover:underline"
          >
            View All Active →
          </button>
        </div>

        {currentlyReading.length === 0 ? (
          <div className="archive-panel rounded-2xl border-dashed p-8 text-center space-y-2">
            <p className="text-sm text-[#AEB9C9]">
              Your reading lectern is clear right now.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('library', { libraryMode: 'shelves' })}
              className="text-xs font-semibold text-[#D6BD8A] hover:underline"
            >
              Draw a volume from The Grand Stacks →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {currentlyReading.map((b) => {
              const cycle = b.activeCycle!;
              const edition =
                b.editions.find((e) => e.id === cycle.editionId) ?? b.primaryEdition;
              return (
                <div
                  key={b.work.id}
                  className="archive-panel flex gap-3.5 rounded-2xl p-4"
                >
                  <button
                    type="button"
                    onClick={() => onOpenBook(b.work.id)}
                    className="w-20 shrink-0 text-left"
                  >
                    <CoverImage
                      title={b.work.title}
                      author={b.work.authors[0]}
                      edition={edition}
                    />
                  </button>
                  <div className="flex flex-1 flex-col justify-between min-w-0">
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenBook(b.work.id)}
                        className="text-left font-editorial font-semibold text-base text-[#F4EFE6] line-clamp-2 hover:text-[#D6BD8A]"
                      >
                        {b.work.title}
                      </button>
                      <p className="text-xs text-[#AEB9C9] truncate mt-0.5">
                        {b.work.authors.join(', ') || 'Unknown Author'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#AEB9C9]">
                        <span className="rounded border border-[#7797C9]/40 bg-[#141E30] px-2 py-0.5 font-semibold text-[#7797C9]">
                          Reading · Cycle #{cycle.cycleNumber}
                        </span>
                        {cycle.startedAt && (
                          <span className="text-[#AEB9C9]/75">Started {cycle.startedAt}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateCycleStatus(cycle.id, 'finished')}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-600"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Finish
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCycleStatus(cycle.id, 'on_hold')}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#B49A67]/30 px-2.5 text-xs font-medium text-[#AEB9C9] hover:bg-[#141E30]"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenBook(b.work.id)}
                        className="min-h-[36px] rounded-lg border border-[#B49A67]/30 px-2.5 text-xs font-medium text-[#D6BD8A] hover:bg-[#392A24]/60"
                      >
                        Open Folio
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently Cataloged & Collection Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 archive-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-archive-display text-sm sm:text-base font-semibold text-[#F4EFE6]">
              Recently Cataloged Volumes
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('library', { libraryMode: 'shelves' })}
              className="text-xs font-semibold text-[#D6BD8A] hover:underline"
            >
              Browse All →
            </button>
          </div>
          {recentVolumes.length === 0 ? (
            <p className="text-xs text-[#AEB9C9] py-4">
              No books cataloged yet. Use Add Book or Batch Scan to register your first volumes.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {recentVolumes.map((b) => (
                <button
                  key={b.work.id}
                  type="button"
                  onClick={() => onOpenBook(b.work.id)}
                  className="group text-left space-y-1.5"
                >
                  <div className="transition-transform group-hover:-translate-y-1">
                    <CoverImage
                      title={b.work.title}
                      author={b.work.authors[0]}
                      edition={b.primaryEdition}
                    />
                  </div>
                  <p className="text-[11px] font-medium text-[#ECE6D8] line-clamp-1 group-hover:text-[#D6BD8A]">
                    {b.work.title}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="archive-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-archive-display text-sm sm:text-base font-semibold text-[#F4EFE6]">
              Ledger Highlights
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('wishlist')}
              className="text-xs font-semibold text-[#7797C9] hover:underline"
            >
              Acquisitions →
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="rounded-xl border border-[#B49A67]/20 bg-[#0B1120]/75 p-3">
              <span className="text-[#AEB9C9]">Leading Genre</span>
              <p className="mt-1 font-semibold text-sm text-[#F4EFE6]">
                {stats.genreBreakdown[0]?.name ?? 'Catalog more books'}
              </p>
            </div>
            <div className="rounded-xl border border-[#B49A67]/20 bg-[#0B1120]/75 p-3">
              <span className="text-[#AEB9C9]">Most Collected Author</span>
              <p className="mt-1 font-semibold text-sm text-[#F4EFE6]">
                {stats.authorBreakdown[0]?.name ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-[#B49A67]/20 bg-[#0B1120]/75 p-3">
              <span className="text-[#AEB9C9]">Collection Investment</span>
              <p className="mt-1 font-mono font-semibold text-sm text-[#D6BD8A]">
                {totalSpendEntries.length > 0
                  ? totalSpendEntries
                      .map(([cur, amt]) => formatCurrency(amt, cur as CurrencyCode))
                      .join(' · ')
                  : 'No purchase prices recorded'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
