import React, { useMemo, useState } from 'react';
import { FolderPlus, Plus, Search } from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { saveShelf } from '../services/libraryService';
import type { BookFormat, Shelf } from '../types/domain';

interface LibraryViewProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
}

export function LibraryView({
  books,
  shelves,
  onOpenBook,
  onOpenAddBook,
}: LibraryViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'wishlist'>('all');
  const [formatFilter, setFormatFilter] = useState<BookFormat | 'all'>('all');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [newShelfName, setNewShelfName] = useState('');
  const [showShelfInput, setShowShelfInput] = useState(false);

  const languages = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.editions.forEach((e) => set.add(e.language.toUpperCase())));
    return Array.from(set).sort();
  }, [books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (ownershipFilter === 'owned' && b.ownedCopiesCount === 0) return false;
      if (ownershipFilter === 'wishlist' && b.wishlistCopiesCount === 0) return false;
      if (shelfFilter !== 'all' && !b.shelfIds.includes(shelfFilter)) return false;
      if (formatFilter !== 'all' && !b.editions.some((e) => e.format === formatFilter)) return false;
      if (langFilter !== 'all' && !b.editions.some((e) => e.language.toUpperCase() === langFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        b.work.title,
        b.work.originalTitle ?? '',
        b.work.authors.join(' '),
        b.editions.map((e) => e.publishers.join(' ')).join(' '),
        b.isbns.map((i) => `${i.isbn13} ${i.isbn10 ?? ''}`).join(' '),
        b.work.genres.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [books, query, ownershipFilter, formatFilter, langFilter, shelfFilter]);

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelfName.trim()) return;
    await saveShelf({ name: newShelfName.trim() });
    setNewShelfName('');
    setShowShelfInput(false);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowShelfInput((v) => !v)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold"
          >
            <FolderPlus className="h-4 w-4" />
            New Shelf
          </button>
          <button
            type="button"
            onClick={onOpenAddBook}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#C2410C] px-4 text-xs font-semibold text-white hover:bg-[#9A3412]"
          >
            <Plus className="h-4 w-4" />
            {t('action.addBook')}
          </button>
        </div>
      </div>

      {showShelfInput && (
        <form onSubmit={handleCreateShelf} className="flex gap-2">
          <input
            value={newShelfName}
            onChange={(e) => setNewShelfName(e.target.value)}
            placeholder="Shelf name (e.g. Vietnamese Classics, Manga)..."
            className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            className="rounded-xl bg-stone-900 dark:bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white"
          >
            Create
          </button>
        </form>
      )}

      {/* Facet Filters & Custom Shelves */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'owned', 'wishlist'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setOwnershipFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${
              ownershipFilter === f
                ? 'border-[#C2410C] bg-[#C2410C] text-white'
                : 'border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-stone-600 dark:text-slate-300'
            }`}
          >
            {f}
          </button>
        ))}

        <select
          value={shelfFilter}
          onChange={(e) => setShelfFilter(e.target.value)}
          className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">All Shelves</option>
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>
              Shelf: {s.name}
            </option>
          ))}
        </select>

        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value as BookFormat | 'all')}
          className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">All Formats</option>
          <option value="paperback">Paperback</option>
          <option value="hardcover">Hardcover</option>
          <option value="bunko">Bunko</option>
          <option value="tankobon">Tankobon</option>
          <option value="box_set">Box Set</option>
          <option value="ebook">E-book</option>
        </select>

        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">All Languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Book Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 p-10 text-center text-sm text-stone-500">
          {t('library.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((b) => (
            <button
              key={b.work.id}
              type="button"
              onClick={() => onOpenBook(b.work.id)}
              className="group flex flex-col rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left transition-all hover:border-[#C2410C] hover:shadow-md"
            >
              <CoverImage
                title={b.work.title}
                author={b.work.authors[0]}
                edition={b.primaryEdition}
              />
              <div className="mt-2.5 space-y-1 flex-1">
                <h3 className="font-editorial text-sm font-semibold line-clamp-2 group-hover:text-[#C2410C]">
                  {b.work.title}
                </h3>
                <p className="text-xs text-stone-500 truncate">
                  {b.work.authors.join(', ') || 'Unknown Author'}
                </p>
              </div>
              <div className="mt-2 pt-2 border-t border-stone-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-stone-500">
                <span>
                  {b.ownedCopiesCount > 0 ? `${b.ownedCopiesCount} owned` : '0 owned'}
                </span>
                {b.activeCycle && (
                  <span className="text-[#C2410C] capitalize">
                    {b.activeCycle.status.replace('_', ' ')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
