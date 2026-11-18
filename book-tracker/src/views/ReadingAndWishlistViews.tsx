import { useState } from 'react';
import { BookOpen, CheckCircle2, Edit3, Play, RotateCcw, Trash2 } from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import {
  logOrUpdateReadingSession,
  softDeleteEntity,
  startReadingCycle,
  updateCycleProgress,
  updateCycleStatus,
} from '../services/libraryService';
import type { ReadingSession } from '../types/domain';
import { calculateCycleMetrics } from '../utils/statsCalculator';

export function CurrentlyReadingView({
  books,
  onOpenBook,
}: {
  books: EnrichedBookRecord[];
  onOpenBook: (workId: string) => void;
}) {
  const active = books.filter((b) => b.activeCycle?.status === 'currently_reading');
  const [quickPages, setQuickPages] = useState<Record<string, string>>({});

  if (active.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-stone-400 mb-2" />
        <p className="font-editorial text-base font-semibold">No books currently in progress</p>
        <p className="text-xs text-stone-500 mt-1">
          Start a reading cycle from any book in My Library or Want to Read.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {active.map((b) => {
        const cycle = b.activeCycle!;
        const ed = b.editions.find((e) => e.id === cycle.editionId) ?? b.primaryEdition;
        const m = calculateCycleMetrics(cycle, b.activeProgress, ed, b.sessions);
        const pageVal = quickPages[cycle.id] ?? String(m.currentPage);

        return (
          <div
            key={b.work.id}
            className="flex gap-4 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <button
              type="button"
              onClick={() => onOpenBook(b.work.id)}
              className="w-20 shrink-0 text-left"
            >
              <CoverImage title={b.work.title} author={b.work.authors[0]} edition={ed} />
            </button>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div onClick={() => onOpenBook(b.work.id)} className="cursor-pointer min-w-0">
                  <h3 className="font-semibold text-sm truncate">{b.work.title}</h3>
                  <p className="text-xs text-stone-500 truncate">
                    {b.work.authors.join(', ')} · Cycle #{cycle.cycleNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateCycleProgress({
                      cycleId: cycle.id,
                      currentPage: m.totalPages || m.currentPage,
                      totalPages: m.totalPages,
                      markFinishedIfComplete: true,
                    }).then(() => updateCycleStatus(cycle.id, 'finished'))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shrink-0"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Finish
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono tabular-nums">
                  <span>
                    p.{m.currentPage} / {m.totalPages || '?'}
                  </span>
                  <span className="font-semibold text-[#C2410C]">{m.percentage}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                  <div className="h-full bg-[#C2410C]" style={{ width: `${m.percentage}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={pageVal}
                  onChange={(e) => setQuickPages((p) => ({ ...p, [cycle.id]: e.target.value }))}
                  className="w-24 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateCycleProgress({
                      cycleId: cycle.id,
                      currentPage: Number(pageVal) || 0,
                      totalPages: m.totalPages,
                      markFinishedIfComplete: true,
                    })
                  }
                  className="rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Update Page
                </button>
                <button
                  type="button"
                  onClick={() => onOpenBook(b.work.id)}
                  className="ml-auto text-xs font-semibold text-stone-600 dark:text-slate-300 hover:text-[#C2410C]"
                >
                  Timer &amp; Notes →
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WantToReadView({
  books,
  onOpenBook,
}: {
  books: EnrichedBookRecord[];
  onOpenBook: (workId: string) => void;
}) {
  const queue = books.filter(
    (b) =>
      b.activeCycle?.status === 'want_to_read' ||
      (!b.activeCycle && b.wishlistCopiesCount > 0)
  );

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
        <p className="font-editorial text-base font-semibold">Want-to-Read queue is empty</p>
        <p className="text-xs text-stone-500 mt-1">
          Add books to your wishlist or set their status to Want to Read.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {queue.map((b) => (
        <div
          key={b.work.id}
          className="flex items-center gap-3 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5"
        >
          <button
            type="button"
            onClick={() => onOpenBook(b.work.id)}
            className="w-14 shrink-0"
          >
            <CoverImage
              title={b.work.title}
              author={b.work.authors[0]}
              edition={b.primaryEdition}
            />
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <button
              type="button"
              onClick={() => onOpenBook(b.work.id)}
              className="font-semibold text-sm truncate block text-left w-full hover:text-[#C2410C]"
            >
              {b.work.title}
            </button>
            <p className="text-xs text-stone-500 truncate">
              {b.work.authors.join(', ')} · {b.ownedCopiesCount > 0 ? 'Owned' : 'Wishlist'}
            </p>
            <button
              type="button"
              onClick={() =>
                b.activeCycle
                  ? updateCycleStatus(b.activeCycle.id, 'currently_reading')
                  : startReadingCycle({
                      workId: b.work.id,
                      editionId: b.primaryEdition.id,
                      status: 'currently_reading',
                    })
              }
              className="inline-flex items-center gap-1 rounded-lg bg-stone-900 dark:bg-[#C2410C] px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              <Play className="h-3 w-3" />
              Start Reading
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReadingHistoryView({
  books,
  sessions,
  onOpenBook,
}: {
  books: EnrichedBookRecord[];
  sessions: ReadingSession[];
  onOpenBook: (workId: string) => void;
}) {
  const [editing, setEditing] = useState<ReadingSession | null>(null);
  const [editStart, setEditStart] = useState('0');
  const [editEnd, setEditEnd] = useState('0');
  const [editMins, setEditMins] = useState('0');

  const completedBooks = books.filter((b) =>
    b.cycles.some((c) => c.status === 'finished' || c.status === 'on_hold' || c.status === 'abandoned')
  );

  const sortedSessions = [...sessions]
    .filter((s) => !s.deletedAt)
    .sort((a, b) => (b.sessionDate + b.createdAt).localeCompare(a.sessionDate + a.createdAt));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-editorial text-lg font-semibold">Completed &amp; Past Reading Cycles</h2>
        {completedBooks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 p-6 text-center text-xs text-stone-500">
            Finished, paused, or abandoned reading cycles appear here, preserving every re-read separately.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completedBooks.map((b) => (
              <div
                key={b.work.id}
                className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenBook(b.work.id)}
                    className="text-left min-w-0"
                  >
                    <p className="font-semibold text-sm truncate hover:text-[#C2410C]">
                      {b.work.title}
                    </p>
                    <p className="text-xs text-stone-500 truncate">{b.work.authors.join(', ')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startReadingCycle({
                        workId: b.work.id,
                        editionId: b.primaryEdition.id,
                        status: 'currently_reading',
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold hover:border-[#C2410C] shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Re-read
                  </button>
                </div>
                <div className="space-y-1 border-t border-stone-100 dark:border-slate-800 pt-2 text-xs">
                  {b.cycles.map((c) => (
                    <div key={c.id} className="flex items-center justify-between font-mono">
                      <span>
                        Cycle #{c.cycleNumber} · {c.status.replace('_', ' ')}
                      </span>
                      <span className="text-stone-500">
                        {c.startedAt ?? '?'} → {c.finishedAt ?? 'ongoing'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-editorial text-lg font-semibold">
          Editable Reading Sessions Log ({sortedSessions.length})
        </h2>

        {editing && (
          <div className="rounded-xl border border-[#C2410C] bg-white dark:bg-slate-900 p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] text-stone-500">Start Page</label>
              <input
                type="number"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className="w-24 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-stone-500">End Page</label>
              <input
                type="number"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className="w-24 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-stone-500">Minutes</label>
              <input
                type="number"
                value={editMins}
                onChange={(e) => setEditMins(e.target.value)}
                className="w-24 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                await logOrUpdateReadingSession({
                  id: editing.id,
                  cycleId: editing.cycleId,
                  sessionDate: editing.sessionDate,
                  startPage: Number(editStart) || 0,
                  endPage: Number(editEnd) || 0,
                  durationMinutes: Number(editMins) || 0,
                  notes: editing.notes,
                  syncProgressToEndPage: false,
                });
                setEditing(null);
              }}
              className="rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save &amp; Recalculate Stats
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 dark:border-slate-800 text-[11px] uppercase text-stone-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-3 py-3">Book</th>
                <th className="px-3 py-3 text-right">Pages</th>
                <th className="px-3 py-3 text-right">Duration</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
              {sortedSessions.map((s) => {
                const book = books.find((b) => b.work.id === s.workId);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-mono">{s.sessionDate}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onOpenBook(s.workId)}
                        className="font-medium hover:text-[#C2410C] text-left"
                      >
                        {book?.work.title ?? 'Book'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {s.startPage} → {s.endPage} ({s.pagesRead}p)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {s.durationMinutes}m
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(s);
                          setEditStart(String(s.startPage));
                          setEditEnd(String(s.endPage));
                          setEditMins(String(s.durationMinutes));
                        }}
                        className="p-1 text-stone-500 hover:text-stone-900"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => softDeleteEntity('reading_sessions', s.id)}
                        className="p-1 text-red-500 hover:text-red-700 ml-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
