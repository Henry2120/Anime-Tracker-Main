import { useState } from 'react';
import { Eye, EyeOff, Quote, Search, Star, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { deleteReviewOnly, softDeleteEntity } from '../services/libraryService';
import type { JournalEntry, Review, Work } from '../types/domain';

interface ReadingJournalViewProps {
  works: Work[];
  reviews: Review[];
  entries: JournalEntry[];
  onOpenBook: (workId: string) => void;
}

export function ReadingJournalView({
  works,
  reviews,
  entries,
  onOpenBook,
}: ReadingJournalViewProps) {
  const { t } = useI18n();
  const [filterType, setFilterType] = useState<'all' | 'review' | 'quote' | 'note' | 'character' | 'reflection'>('all');
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const workMap = new Map(works.map((w) => [w.id, w]));
  const q = query.trim().toLowerCase();

  const filteredReviews = reviews
    .filter((r) => !r.deletedAt)
    .filter(() => filterType === 'all' || filterType === 'review')
    .filter((r) => {
      if (!q) return true;
      const w = workMap.get(r.workId);
      return `${w?.title ?? ''} ${r.headline ?? ''} ${r.body}`.toLowerCase().includes(q);
    });

  const filteredEntries = entries
    .filter((e) => !e.deletedAt)
    .filter((e) => filterType === 'all' || filterType === e.entryType)
    .filter((e) => {
      if (!q) return true;
      const w = workMap.get(e.workId);
      return `${w?.title ?? ''} ${e.title ?? ''} ${e.quoteText ?? ''} ${e.characterName ?? ''} ${e.content}`
        .toLowerCase()
        .includes(q);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reviews, quotes, characters, notes..."
            className="w-full min-h-[44px] rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="min-h-[44px] rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
        >
          <option value="all">All Journal Items</option>
          <option value="review">Reviews</option>
          <option value="quote">Favourite Quotes</option>
          <option value="note">Reading Notes</option>
          <option value="character">Favourite Characters</option>
          <option value="reflection">Reflections</option>
        </select>
      </div>

      {filteredReviews.length === 0 && filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <Quote className="mx-auto h-8 w-8 text-stone-400 mb-2" />
          <p className="font-editorial text-base font-semibold">Your Reading Journal is empty</p>
          <p className="text-xs text-stone-500 mt-1">
            Open any book to save ratings, spoiler-protected reviews, quotes with page numbers, or character notes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((r) => {
            const w = workMap.get(r.workId);
            const isHidden = r.hasSpoilers && !revealed[r.id];
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenBook(r.workId)}
                    className="font-semibold text-sm hover:text-[#C2410C] text-left"
                  >
                    {w?.title ?? 'Book'}
                  </button>
                  <div className="flex items-center gap-2 text-xs">
                    {r.rating != null && (
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-amber-500" />
                        {r.rating}
                      </span>
                    )}
                    {r.hasSpoilers && (
                      <button
                        type="button"
                        onClick={() => setRevealed((p) => ({ ...p, [r.id]: !p[r.id] }))}
                        className="inline-flex items-center gap-1 text-amber-700"
                      >
                        {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {isHidden ? 'Reveal' : 'Hide'}
                      </button>
                    )}
                    <button
                      type="button"
                      title={t('journal.deleteReviewSafe')}
                      onClick={() => deleteReviewOnly(r.id)}
                      className="p-1 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {r.headline && <p className="text-xs font-semibold">{r.headline}</p>}
                {isHidden ? (
                  <p className="text-xs italic text-stone-500">{t('journal.spoilerWarning')}</p>
                ) : (
                  <p className="text-xs text-stone-700 dark:text-slate-300 whitespace-pre-wrap">
                    {r.body}
                  </p>
                )}
              </div>
            );
          })}

          {filteredEntries.map((j) => {
            const w = workMap.get(j.workId);
            const isHidden = j.hasSpoilers && !revealed[j.id];
            return (
              <div
                key={j.id}
                className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenBook(j.workId)}
                      className="font-semibold text-sm hover:text-[#C2410C]"
                    >
                      {w?.title ?? 'Book'}
                    </button>
                    <span className="font-mono text-[11px] uppercase text-[#C2410C]">
                      {j.entryType}
                      {j.pageNumber != null ? ` · p.${j.pageNumber}` : ''}
                      {j.characterName ? ` · ${j.characterName}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {j.hasSpoilers && (
                      <button
                        type="button"
                        onClick={() => setRevealed((p) => ({ ...p, [j.id]: !p[j.id] }))}
                        className="text-amber-700"
                      >
                        {isHidden ? 'Reveal' : 'Hide'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => softDeleteEntity('journal_entries', j.id)}
                      className="p-1 text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {isHidden ? (
                  <p className="text-xs italic text-stone-500">{t('journal.spoilerWarning')}</p>
                ) : (
                  <>
                    {j.quoteText && (
                      <blockquote className="border-l-2 border-[#C2410C] pl-3 text-xs italic text-stone-800 dark:text-slate-200">
                        &ldquo;{j.quoteText}&rdquo;
                      </blockquote>
                    )}
                    {j.content && (
                      <p className="text-xs text-stone-700 dark:text-slate-300 whitespace-pre-wrap">
                        {j.content}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
