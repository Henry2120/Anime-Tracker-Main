import { Compass, Sparkles } from 'lucide-react';
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
      {/* Domed Royal Observatory Dome Header with Celestial Astrolabe Ring */}
      <section className="archive-walnut-panel relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-[#7797C9]/30 flex items-center justify-center"
        >
          <div className="h-28 w-28 rounded-full border border-[#B49A67]/40 flex items-center justify-center">
            <Compass className="h-8 w-8 text-[#7797C9]/55" />
          </div>
        </div>
        <div className="relative z-10 space-y-1">
          <p className="font-archive-display text-[11px] uppercase tracking-[0.2em] text-[#B49A67] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#7797C9]" />
            Domed Royal Observatory · Celestial Astrolabe
          </p>
          <h2 className="font-archive-display text-xl sm:text-2xl font-bold text-[#F4EFE6]">
            {t('nav.stats')}
          </h2>
          <p className="text-xs text-[#AEB9C9]">
            Constellation ledger of your completed volumes, reading cycles, languages, and physical editions.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="archive-panel rounded-2xl p-4">
          <span className="text-xs text-[#AEB9C9]">Finished Works</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {stats.finishedUniqueWorksCount}
          </p>
        </div>
        <div className="archive-panel rounded-2xl p-4">
          <span className="text-xs text-[#AEB9C9]">Finished Cycles</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {stats.finishedCyclesCount}
          </p>
        </div>
        <div className="archive-panel rounded-2xl p-4">
          <span className="text-xs text-[#AEB9C9]">Currently Reading</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#7797C9]">
            {stats.currentlyReadingCount}
          </p>
        </div>
        <div className="archive-panel rounded-2xl p-4">
          <span className="text-xs text-[#AEB9C9]">Owned Physical Copies</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#D6BD8A]">
            {stats.ownedCopiesCount}
          </p>
        </div>
        <div className="col-span-2 lg:col-span-1 archive-panel rounded-2xl p-4">
          <span className="text-xs text-[#AEB9C9]">Wishlist Items</span>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#F4EFE6]">
            {stats.wishlistCopiesCount}
          </p>
        </div>
      </div>

      {/* Monthly Books Finished Observatory Chart */}
      <section className="archive-panel rounded-2xl p-5 space-y-4">
        <h3 className="font-archive-display text-base font-semibold text-[#F4EFE6]">
          Monthly Volumes Completed (Last 12 Months)
        </h3>
        <div className="grid grid-cols-12 gap-2 items-end h-44 pt-4">
          {stats.monthlyFinishedSeries.map((m) => {
            const pct = Math.round((m.booksFinished / maxMonthFinished) * 100);
            return (
              <div key={m.month} className="flex flex-col items-center justify-end h-full gap-1">
                <span className="text-[10px] font-mono text-[#D6BD8A]">
                  {m.booksFinished > 0 ? m.booksFinished : ''}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-[#B49A67] to-[#7797C9] transition-all min-h-[3px]"
                    style={{ height: `${Math.max(4, pct)}%` }}
                    title={`${m.month}: ${m.booksFinished} book(s) finished`}
                  />
                </div>
                <span className="text-[9px] font-mono text-[#AEB9C9]">
                  {m.month.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="archive-panel rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B49A67]">
            Top Genres
          </h3>
          {stats.genreBreakdown.length === 0 ? (
            <p className="text-xs text-[#AEB9C9]">No genres cataloged yet.</p>
          ) : (
            stats.genreBreakdown.map((g) => (
              <div key={g.name} className="flex justify-between text-xs text-[#ECE6D8]">
                <span>{g.name}</span>
                <span className="font-mono font-semibold text-[#D6BD8A]">{g.count}</span>
              </div>
            ))
          )}
        </section>

        <section className="archive-panel rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B49A67]">
            Top Authors
          </h3>
          {stats.authorBreakdown.length === 0 ? (
            <p className="text-xs text-[#AEB9C9]">No authors cataloged yet.</p>
          ) : (
            stats.authorBreakdown.map((a) => (
              <div key={a.name} className="flex justify-between text-xs text-[#ECE6D8]">
                <span className="truncate pr-2">{a.name}</span>
                <span className="font-mono font-semibold text-[#D6BD8A]">{a.count}</span>
              </div>
            ))
          )}
        </section>

        <section className="archive-panel rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B49A67]">
            Collection Value &amp; Languages
          </h3>
          {Object.entries(stats.collectionSpendByCurrency).map(([cur, amt]) => (
            <div key={cur} className="flex justify-between text-xs text-[#ECE6D8]">
              <span>Investment ({cur})</span>
              <span className="font-mono font-semibold text-[#D6BD8A]">
                {formatCurrency(amt, cur as CurrencyCode)}
              </span>
            </div>
          ))}
          <div className="border-t border-[#B49A67]/20 pt-2 space-y-1">
            {stats.languageBreakdown.map((lang) => (
              <div key={lang.name} className="flex justify-between text-xs text-[#AEB9C9]">
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
