import { ArrowRight, BookOpen, Flame, Layers, Plus, Sparkles, Users } from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { buildReadingHistoryRecommendations } from '../services/discoveryService';
import { updateCycleProgress } from '../services/libraryService';
import type {
  AppSettings,
  Edition,
  Loan,
  PhysicalCopy,
  ReadingCycle,
  ReadingSession,
  Work,
} from '../types/domain';
import { calculateCycleMetrics, computeLibraryStatistics } from '../utils/statsCalculator';

interface DashboardViewProps {
  books: EnrichedBookRecord[];
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  sessions: ReadingSession[];
  loans: Loan[];
  settings: AppSettings;
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
  onNavigate: (tab: 'library' | 'reading' | 'stats') => void;
}

export function DashboardView({
  books,
  works,
  editions,
  copies,
  cycles,
  sessions,
  loans,
  settings,
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
    sessions,
  });

  const currentlyReading = books.filter(
    (b) => b.activeCycle?.status === 'currently_reading'
  );
  const activeLoans = loans.filter(
    (l) => !l.deletedAt && (l.status === 'active' || l.status === 'overdue')
  );
  const recentSessions = [...sessions]
    .filter((s) => !s.deletedAt)
    .sort((a, b) => (b.sessionDate + b.createdAt).localeCompare(a.sessionDate + a.createdAt))
    .slice(0, 6);

  const recommendations = buildReadingHistoryRecommendations({ works, cycles });
  const dailyPct = Math.min(
    100,
    Math.round((stats.pagesReadToday / Math.max(1, settings.dailyPageGoal)) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Top KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>{t('dashboard.todayPages')}</span>
            <BookOpen className="h-4 w-4 text-[#C2410C]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {stats.pagesReadToday}
            <span className="text-sm font-normal text-stone-500"> / {settings.dailyPageGoal}</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
            <div className="h-full bg-[#C2410C]" style={{ width: `${dailyPct}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>{t('dashboard.streak')}</span>
            <Flame className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {stats.currentDailyStreak}{' '}
            <span className="text-sm font-normal text-stone-500">{t('dashboard.days')}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500 font-mono tabular-nums">
            Best: {stats.longestDailyStreak}d
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>{t('dashboard.ownedBooks')}</span>
            <Layers className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {stats.ownedCopiesCount}
          </p>
          <p className="mt-1 text-xs text-stone-500 font-mono tabular-nums">
            {stats.totalWorks} works · {stats.totalEditions} editions
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>{t('dashboard.booksYear')}</span>
            <Users className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {stats.booksFinishedThisYear}
            <span className="text-sm font-normal text-stone-500"> / {settings.yearlyBookGoal}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500 font-mono tabular-nums">
            {activeLoans.length} active loans
          </p>
        </div>
      </div>

      {/* Currently Reading Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-lg font-semibold">{t('dashboard.currentlyReading')}</h2>
          <button
            type="button"
            onClick={() => onNavigate('reading')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#C2410C] hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {currentlyReading.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 p-8 text-center space-y-3">
            <p className="font-editorial text-base font-semibold">{t('library.emptyTitle')}</p>
            <p className="text-xs text-stone-500 max-w-md mx-auto">{t('library.emptyBody')}</p>
            <button
              type="button"
              onClick={onOpenAddBook}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9A3412]"
            >
              <Plus className="h-4 w-4" />
              {t('action.addBook')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {currentlyReading.map((b) => {
              const cycle = b.activeCycle!;
              const ed = b.editions.find((e) => e.id === cycle.editionId) ?? b.primaryEdition;
              const m = calculateCycleMetrics(cycle, b.activeProgress, ed, b.sessions);
              return (
                <div
                  key={b.work.id}
                  className="flex gap-3.5 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
                >
                  <button
                    type="button"
                    onClick={() => onOpenBook(b.work.id)}
                    className="w-16 shrink-0 text-left"
                  >
                    <CoverImage
                      title={b.work.title}
                      author={b.work.authors[0]}
                      edition={ed}
                    />
                  </button>
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div onClick={() => onOpenBook(b.work.id)} className="cursor-pointer">
                      <p className="font-semibold text-sm truncate">{b.work.title}</p>
                      <p className="text-xs text-stone-500 truncate">
                        {b.work.authors.join(', ') || 'Unknown'} · Cycle #{cycle.cycleNumber}
                      </p>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                        <span>
                          {m.currentPage} / {m.totalPages || '?'} p
                        </span>
                        <span className="font-semibold text-[#C2410C]">{m.percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                        <div className="h-full bg-[#C2410C]" style={{ width: `${m.percentage}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateCycleProgress({
                              cycleId: cycle.id,
                              currentPage: m.currentPage + 10,
                              totalPages: m.totalPages,
                              markFinishedIfComplete: true,
                            })
                          }
                          className="rounded-lg border border-stone-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold hover:border-[#C2410C]"
                        >
                          +10p
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenBook(b.work.id)}
                          className="text-xs font-semibold text-[#C2410C] hover:underline"
                        >
                          Log / Rewind →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-Column Bottom Row: Recent Sessions & Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <h3 className="font-editorial text-base font-semibold">{t('dashboard.recentActivity')}</h3>
          {recentSessions.length === 0 ? (
            <p className="text-xs text-stone-500 py-4">No reading sessions logged yet.</p>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-slate-800">
              {recentSessions.map((s) => {
                const w = works.find((x) => x.id === s.workId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenBook(s.workId)}
                    className="flex w-full items-center justify-between py-2.5 text-left text-xs hover:bg-stone-50 dark:hover:bg-slate-800/50 px-1 rounded"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{w?.title ?? 'Book'}</p>
                      <p className="text-stone-500 font-mono">{s.sessionDate}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                        +{s.pagesRead}p
                      </p>
                      <p className="text-stone-500">{s.durationMinutes}m</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-editorial text-base font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#C2410C]" />
              {t('dashboard.discoverFromLibrary')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="text-xs font-semibold text-[#C2410C] hover:underline"
            >
              Browse shelves
            </button>
          </div>
          {recommendations.length === 0 ? (
            <p className="text-xs text-stone-500 py-4">
              Finish books or add genres to get tailored next-read picks from your unread shelves.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recommendations.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onOpenBook(w.id)}
                  className="rounded-xl border border-stone-200 dark:border-slate-800 p-3 text-left hover:border-[#C2410C]"
                >
                  <p className="font-semibold text-xs truncate">{w.title}</p>
                  <p className="text-[11px] text-stone-500 truncate">
                    {w.authors.join(', ') || 'Unknown Author'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
