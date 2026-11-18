import type { CurrencyCode, Edition, PhysicalCopy, ReadingCycle, ReadingSession, Work } from '../types/domain';
import { formatCurrency } from '../utils/currency';
import { computeLibraryStatistics } from '../utils/statsCalculator';

interface StatisticsViewProps {
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  sessions: ReadingSession[];
}

export function StatisticsView({
  works,
  editions,
  copies,
  cycles,
  sessions,
}: StatisticsViewProps) {
  const stats = computeLibraryStatistics({ works, editions, copies, cycles, sessions });
  const maxMonthPages = Math.max(1, ...stats.monthlyPagesSeries.map((m) => m.pages));

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Pages Read" value={stats.totalPagesReadAllTime.toLocaleString()} />
        <StatCard
          label="Total Reading Time"
          value={`${Math.round((stats.totalMinutesReadAllTime / 60) * 10) / 10} hrs`}
        />
        <StatCard label="Average Speed" value={`${stats.averagePagesPerHour} p/hr`} />
        <StatCard
          label="Finished Cycles / Works"
          value={`${stats.finishedCyclesCount} / ${stats.finishedUniqueWorksCount}`}
        />
      </div>

      {/* Monthly Pages Read Chart (Pure SVG / Flexbox) */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-editorial text-base font-semibold">Monthly Pages Read (Last 12 Months)</h3>
          <span className="font-mono text-xs tabular-nums text-stone-500">
            This month: {stats.pagesReadThisMonth} pages
          </span>
        </div>
        <div className="grid grid-cols-12 gap-2 items-end h-44 pt-4">
          {stats.monthlyPagesSeries.map((m) => {
            const pct = Math.max(4, Math.round((m.pages / maxMonthPages) * 100));
            return (
              <div key={m.month} className="flex flex-col items-center justify-end h-full gap-1.5">
                <span className="font-mono text-[10px] tabular-nums text-stone-500">
                  {m.pages > 0 ? m.pages : ''}
                </span>
                <div className="w-full max-w-[28px] flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md bg-[#C2410C]/85 transition-all"
                    style={{ height: `${m.pages === 0 ? 3 : pct}%` }}
                    title={`${m.month}: ${m.pages} pages, ${m.booksFinished} books finished`}
                  />
                </div>
                <span className="font-mono text-[10px] text-stone-500">{m.month.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Distributions & Spend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownCard title="Genre Distribution" items={stats.genreBreakdown} />
        <BreakdownCard title="Top Authors" items={stats.authorBreakdown} />
        <BreakdownCard title="Edition Languages" items={stats.languageBreakdown} />

        <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="font-editorial text-base font-semibold">
            Physical Collection Investment (Owned)
          </h3>
          {Object.keys(stats.collectionSpendByCurrency).length === 0 ? (
            <p className="text-xs text-stone-500">No purchase prices recorded on owned copies yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(stats.collectionSpendByCurrency).map(([cur, total]) => (
                <div
                  key={cur}
                  className="flex items-center justify-between border-b border-stone-100 dark:border-slate-800 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-stone-500">{cur}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatCurrency(total, cur as CurrencyCode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
      <h3 className="font-editorial text-base font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-stone-500">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.name} className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="font-medium truncate pr-2">{item.name}</span>
                <span className="font-mono tabular-nums text-stone-500">{item.count}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-stone-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-stone-800 dark:bg-[#C2410C]"
                  style={{ width: `${Math.round((item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
