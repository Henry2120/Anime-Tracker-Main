import { useState } from 'react';
import {
  BookOpen,
  Eye,
  EyeOff,
  Feather,
  Quote,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
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
  const [filterType, setFilterType] = useState<
    'all' | 'review' | 'quote' | 'note' | 'character' | 'reflection'
  >('all');
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [selectedDeskWorkId, setSelectedDeskWorkId] = useState<string>(works[0]?.id ?? '');

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

  const activeWorkToOpen = selectedDeskWorkId || works[0]?.id || '';

  return (
    <div className="space-y-5">
      {/* The Scholar's Study — Candlelit Oak Writing Desk */}
      <section className="archive-walnut-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-archive-display text-[11px] uppercase tracking-[0.18em] text-[#B49A67]">
              The Scholar&apos;s Study · Candlelit Oak Writing Desk
            </p>
            <h2 className="font-archive-display text-xl font-bold text-[#F4EFE6] flex items-center gap-2">
              <Feather className="h-4.5 w-4.5 text-[#D6BD8A]" />
              Reviews, Marginalia &amp; Quotations
            </h2>
          </div>
          <span className="archive-brass-plaque rounded px-2.5 py-0.5 font-mono text-xs font-bold">
            {filteredReviews.length + filteredEntries.length} manuscript(s)
          </span>
        </div>

        {/* Desk Quick Tome Selector: Draw a Volume to Inscribe Notes */}
        {works.length > 0 && (
          <div className="rounded-2xl border border-[#B49A67]/30 bg-[#0B1120]/70 p-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="text-xs font-semibold text-[#D6BD8A] whitespace-nowrap">
              Inscribe in Folio:
            </span>
            <select
              value={activeWorkToOpen}
              onChange={(e) => setSelectedDeskWorkId(e.target.value)}
              className="archive-input flex-1 min-h-[38px] rounded-xl border px-3 text-xs"
            >
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => activeWorkToOpen && onOpenBook(activeWorkToOpen)}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Open Volume Folio
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#AEB9C9]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reviews, quotes, characters, notes..."
              className="archive-input w-full min-h-[44px] rounded-xl border pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="archive-input min-h-[44px] rounded-xl border px-3 text-xs font-semibold"
          >
            <option value="all">All Manuscripts</option>
            <option value="review">Reviews</option>
            <option value="quote">Favourite Quotes</option>
            <option value="note">Reading Notes</option>
            <option value="character">Favourite Characters</option>
            <option value="reflection">Reflections</option>
          </select>
        </div>
      </section>

      {filteredReviews.length === 0 && filteredEntries.length === 0 ? (
        <div className="archive-panel rounded-2xl border-dashed p-10 text-center">
          <Quote className="mx-auto h-8 w-8 text-[#B49A67] mb-2" />
          <p className="font-archive-display text-base font-semibold text-[#F4EFE6]">
            The Scholar&apos;s Desk is Clean
          </p>
          <p className="text-xs text-[#AEB9C9] mt-1">
            Select a volume above or open any book in The Grand Stacks to inscribe ratings, spoiler-sealed reviews, page quotes, or character notes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReviews.map((r) => {
            const w = workMap.get(r.workId);
            const isHidden = r.hasSpoilers && !revealed[r.id];
            return (
              <article
                key={r.id}
                className="archive-parchment-sheet rounded-2xl p-5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2 border-b border-[#8A6C3C]/30 pb-2">
                  <button
                    type="button"
                    onClick={() => onOpenBook(r.workId)}
                    className="archive-parchment-ink font-editorial font-bold text-base hover:underline text-left"
                  >
                    {w?.title ?? 'Book'}
                  </button>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {r.rating != null && (
                      <span className="inline-flex items-center gap-1 rounded bg-[#241B12]/10 px-2 py-0.5 font-mono font-bold text-[#6F4812]">
                        <Star className="h-3.5 w-3.5 fill-[#B47B2B] text-[#B47B2B]" />
                        {r.rating}
                      </span>
                    )}
                    {r.hasSpoilers && (
                      <button
                        type="button"
                        onClick={() => setRevealed((p) => ({ ...p, [r.id]: !p[r.id] }))}
                        className="inline-flex items-center gap-1 font-semibold text-[#6F4812] hover:underline"
                      >
                        {isHidden ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                        {isHidden ? 'Unseal' : 'Seal'}
                      </button>
                    )}
                    <button
                      type="button"
                      title={t('journal.deleteReviewSafe')}
                      onClick={() => deleteReviewOnly(r.id)}
                      className="p-1 text-[#8B2323] hover:text-[#631515]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {r.headline && (
                  <p className="archive-parchment-ink text-xs font-bold uppercase tracking-wide">
                    {r.headline}
                  </p>
                )}
                {isHidden ? (
                  <p className="text-xs italic text-[#5B452A] bg-[#241B12]/10 rounded-lg px-3 py-2">
                    {t('journal.spoilerWarning')}
                  </p>
                ) : (
                  <p className="archive-parchment-ink text-xs leading-relaxed whitespace-pre-wrap">
                    {r.body}
                  </p>
                )}
              </article>
            );
          })}

          {filteredEntries.map((j) => {
            const w = workMap.get(j.workId);
            const isHidden = j.hasSpoilers && !revealed[j.id];
            return (
              <article
                key={j.id}
                className="archive-parchment-sheet rounded-2xl p-5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2 border-b border-[#8A6C3C]/30 pb-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenBook(j.workId)}
                      className="archive-parchment-ink font-editorial font-bold text-base hover:underline text-left"
                    >
                      {w?.title ?? 'Book'}
                    </button>
                    <span className="font-mono text-[10px] uppercase font-bold rounded bg-[#241B12]/12 px-2 py-0.5 text-[#5A3D17]">
                      {j.entryType}
                      {j.pageNumber != null ? ` · p.${j.pageNumber}` : ''}
                      {j.characterName ? ` · ${j.characterName}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {j.hasSpoilers && (
                      <button
                        type="button"
                        onClick={() => setRevealed((p) => ({ ...p, [j.id]: !p[j.id] }))}
                        className="font-semibold text-[#6F4812] hover:underline"
                      >
                        {isHidden ? 'Unseal' : 'Seal'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => softDeleteEntity('journal_entries', j.id)}
                      className="p-1 text-[#8B2323] hover:text-[#631515]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {isHidden ? (
                  <p className="text-xs italic text-[#5B452A] bg-[#241B12]/10 rounded-lg px-3 py-2">
                    {t('journal.spoilerWarning')}
                  </p>
                ) : (
                  <>
                    {j.quoteText && (
                      <blockquote className="border-l-2 border-[#7A5423] pl-3 font-editorial text-sm italic text-[#241B12]">
                        &ldquo;{j.quoteText}&rdquo;
                      </blockquote>
                    )}
                    {j.content && (
                      <p className="archive-parchment-ink text-xs leading-relaxed whitespace-pre-wrap">
                        {j.content}
                      </p>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
