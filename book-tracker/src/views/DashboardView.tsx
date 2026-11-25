import {
  BookHeart,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Coins,
  Library,
  Pause,
  Plus,
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
  settings: AppSettings;
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
  onNavigate: (
    tab: 'library' | 'reading' | 'wishlist' | 'history' | 'journal' | 'stats' | 'settings'
  ) => void;
}

export function DashboardView({
  books,
  works,
  editions,
  copies,
  cycles,
  onOpenBook,
  onOpenAddBook,
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
    (b) => b.wishlistCopiesCount > 0 || b.activeCycle?.status === 'want_to_read'
  ).length;
  const totalSpendEntries = Object.entries(stats.collectionSpendByCurrency);

  return (
    <div className="space-y-6">
      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('library')}
          className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left hover:border-[#C2410C] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>{t('dash.ownedCopies')}</span>
            <Library className="h-4 w-4 text-[#C2410C]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-stone-900 dark:text-slate-100">
            {stats.ownedCopiesCount}
          </p>
          <p className="mt-1 text-xs text-stone-500 tabular-nums">
            {stats.totalWorks} works · {stats.totalEditions} editions
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reading')}
          className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left hover:border-[#C2410C] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>{t('nav.reading')}</span>
            <BookOpen className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-stone-900 dark:text-slate-100">
            {currentlyReading.length}
          </p>
          <p className="mt-1 text-xs text-stone-500">Active cycles</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left hover:border-[#C2410C] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>{t('dash.booksFinished')}</span>
            <BookHeart className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-stone-900 dark:text-slate-100">
            {stats.finishedUniqueWorksCount}
          </p>
          <p className="mt-1 text-xs text-stone-500 tabular-nums">
            {stats.finishedCyclesCount} finished cycle(s)
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('wishlist')}
          className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left hover:border-[#C2410C] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>{t('nav.wishlist')}</span>
            <Bookmark className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-stone-900 dark:text-slate-100">
            {wishlistCount}
          </p>
          <p className="mt-1 text-xs text-stone-500">Want to read &amp; discover</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('stats')}
          className="col-span-2 lg:col-span-1 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left hover:border-[#C2410C] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            <span>{t('dash.collectionValue')}</span>
            <Coins className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-lg sm:text-xl font-bold tabular-nums text-stone-900 dark:text-slate-100 truncate">
            {totalSpendEntries.length > 0
              ? formatCurrency(totalSpendEntries[0][1], totalSpendEntries[0][0] as CurrencyCode)
              : '—'}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {totalSpendEntries.length > 1
              ? `+${totalSpendEntries.length - 1} other currency`
              : 'Tracked physical value'}
          </p>
        </button>
      </div>

      {/* Currently Reading */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-lg font-semibold text-stone-900 dark:text-slate-100">
            {t('nav.reading')}
          </h2>
          <button
            type="button"
            onClick={onOpenAddBook}
            className="inline-flex items-center gap-1 rounded-xl bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('action.addBook')}
          </button>
        </div>

        {currentlyReading.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-8 text-center space-y-2">
            <p className="text-sm text-stone-600 dark:text-slate-400">
              No active books in progress right now.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="text-xs font-semibold text-[#C2410C] hover:underline"
            >
              Pick a book from your Library or start a re-read →
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
                  className="flex gap-3.5 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs"
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
                        className="text-left font-editorial font-semibold text-sm text-stone-900 dark:text-slate-100 line-clamp-2 hover:text-[#C2410C]"
                      >
                        {b.work.title}
                      </button>
                      <p className="text-xs text-stone-500 truncate mt-0.5">
                        {b.work.authors.join(', ') || 'Unknown Author'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono text-stone-600 dark:text-slate-300">
                        <span className="rounded bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 font-semibold text-[#C2410C]">
                          Reading · Cycle #{cycle.cycleNumber}
                        </span>
                        {cycle.startedAt && (
                          <span className="text-stone-500">Started {cycle.startedAt}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateCycleStatus(cycle.id, 'finished')}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Finish
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCycleStatus(cycle.id, 'on_hold')}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenBook(b.work.id)}
                        className="min-h-[34px] rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Discovery & Shelf Overview */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-editorial text-base font-semibold">
            Shelf Discovery &amp; Highlights
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('wishlist')}
            className="text-xs font-semibold text-[#C2410C] hover:underline"
          >
            Search &amp; Add Books to Wishlist →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-stone-50 dark:bg-slate-950/60 p-3">
            <span className="text-stone-500">Top Genre</span>
            <p className="mt-1 font-semibold text-sm">
              {stats.genreBreakdown[0]?.name ?? 'Catalog more books'}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 dark:bg-slate-950/60 p-3">
            <span className="text-stone-500">Top Author</span>
            <p className="mt-1 font-semibold text-sm">
              {stats.authorBreakdown[0]?.name ?? '—'}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 dark:bg-slate-950/60 p-3">
            <span className="text-stone-500">Collection Investment</span>
            <p className="mt-1 font-mono font-semibold text-sm">
              {totalSpendEntries.length > 0
                ? totalSpendEntries.map(([cur, amt]) => formatCurrency(amt, cur as CurrencyCode)).join(' · ')
                : 'No purchase prices recorded'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
