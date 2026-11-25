import { useI18n } from '../i18n/useI18n';
import type {
  CurrencyCode,
  Edition,
  PhysicalCopy,
  ReadingCycle,
  Work,
} from '../types/domain';
import { formatCurrency } from '../utils/currency';
import { computeLibraryStatistics } from '../utils/statsCalculator';

interface StatisticsViewProps {
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
}

export function StatisticsView({
  works,
  editions,
  copies,
  cycles,
}: StatisticsViewProps) {
  const { t } = useI18n();
  const stats = computeLibraryStatistics({ works, editions, copies, cycles });
  const maxMonthFinished = Math.max(
    1,
    ...stats.monthlyFinishedSeries.map((m) => m.booksFinished)
  );

  return (
    <div className="space-y-6">
      <h2 className="font-editorial text-xl font-semibold">{t('nav.stats')}</h2>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-stone-500">Finished Works</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {stats.finishedUniqueWorksCount}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-stone-500">Finished Cycles</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {stats.finishedCyclesCount}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-stone-500">Currently Reading</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {stats.currentlyReadingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-stone-500">Owned Physical Copies</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {stats.ownedCopiesCount}
          </p>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-stone-500">Wishlist Items</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {stats.wishlistCopiesCount}
          </p>
        </div>
      </div>

      {/* Monthly Books Finished Bar Chart */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="font-editorial text-base font-semibold">
          Monthly Books Finished (Last 12 Months)
        </h3>
        <div className="grid grid-cols-12 gap-2 items-end h-44 pt-4">
          {stats.monthlyFinishedSeries.map((m) => {
            const pct = Math.round((m.booksFinished / maxMonthFinished) * 100);
            return (
              <div key={m.month} className="flex flex-col items-center justify-end h-full gap-1">
                <span className="text-[10px] font-mono text-stone-500">
                  {m.booksFinished > 0 ? m.booksFinished : ''}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md bg-[#C2410C]/85 transition-all min-h-[3px]"
                    style={{ height: `${Math.max(4, pct)}%` }}
                    title={`${m.month}: ${m.booksFinished} book(s) finished`}
                  />
                </div>
                <span className="text-[9px] font-mono text-stone-500">
                  {m.month.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Top Genres
          </h3>
          {stats.genreBreakdown.length === 0 ? (
            <p className="text-xs text-stone-500">No genres cataloged yet.</p>
          ) : (
            stats.genreBreakdown.map((g) => (
              <div key={g.name} className="flex justify-between text-xs">
                <span>{g.name}</span>
                <span className="font-mono font-semibold">{g.count}</span>
              </div>
            ))
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Top Authors
          </h3>
          {stats.authorBreakdown.length === 0 ? (
            <p className="text-xs text-stone-500">No authors cataloged yet.</p>
          ) : (
            stats.authorBreakdown.map((a) => (
              <div key={a.name} className="flex justify-between text-xs">
                <span className="truncate pr-2">{a.name}</span>
                <span className="font-mono font-semibold">{a.count}</span>
              </div>
            ))
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Collection Value &amp; Languages
          </h3>
          {Object.entries(stats.collectionSpendByCurrency).map(([cur, amt]) => (
            <div key={cur} className="flex justify-between text-xs">
              <span>Investment ({cur})</span>
              <span className="font-mono font-semibold">{formatCurrency(amt, cur as CurrencyCode)}</span>
            </div>
          ))}
          <div className="border-t border-stone-100 dark:border-slate-800 pt-2 space-y-1">
            {stats.languageBreakdown.map((lang) => (
              <div key={lang.name} className="flex justify-between text-xs">
                <span className="uppercase font-mono">{lang.name}</span>
                <span className="font-mono">{lang.count} ed.</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
