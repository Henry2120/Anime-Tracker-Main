import React, { useMemo, useState } from 'react';
import {
  BookMarked,
  FolderPlus,
  LayoutGrid,
  List,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { saveShelf, softDeleteEntity } from '../services/libraryService';
import type { Loan, Shelf } from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface LibraryViewProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  loans: Loan[];
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
}

type SortKey = 'recent' | 'title' | 'author' | 'year' | 'pages';
type OwnershipFilter = 'all' | 'owned' | 'wishlist' | 'loans' | 'unowned';

export function LibraryView({
  books,
  shelves,
  loans,
  onOpenBook,
  onOpenAddBook,
}: LibraryViewProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showShelfModal, setShowShelfModal] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');

  const allGenres = useMemo(() => {
    const s = new Set<string>();
    books.forEach((b) => b.work.genres.forEach((g) => s.add(g)));
    return Array.from(s).sort();
  }, [books]);

  const allLanguages = useMemo(() => {
    const s = new Set<string>();
    books.forEach((b) => b.editions.forEach((e) => s.add(e.language.toUpperCase())));
    return Array.from(s).sort();
  }, [books]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = books.filter((b) => {
      if (ownershipFilter === 'owned' && b.ownedCopiesCount === 0) return false;
      if (ownershipFilter === 'wishlist' && b.wishlistCopiesCount === 0) return false;
      if (ownershipFilter === 'loans' && b.activeLoansCount === 0) return false;
      if (ownershipFilter === 'unowned' && b.ownedCopiesCount > 0) return false;
      if (shelfFilter !== 'all' && !b.shelfIds.includes(shelfFilter)) return false;
      if (genreFilter !== 'all' && !b.work.genres.includes(genreFilter)) return false;
      if (
        languageFilter !== 'all' &&
        !b.editions.some((e) => e.language.toUpperCase() === languageFilter)
      ) {
        return false;
      }
      if (statusFilter !== 'all' && (b.activeCycle?.status ?? 'none') !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        b.work.title,
        b.work.originalTitle ?? '',
        ...b.work.authors,
        ...b.editions.flatMap((e) => [e.title, ...e.publishers]),
        ...b.isbns.map((i) => i.isbn13),
        ...b.copies.map((c) => c.shelfLocation ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    list.sort((a, b) => {
      if (sortBy === 'title') return a.work.title.localeCompare(b.work.title);
      if (sortBy === 'author')
        return (a.work.authors[0] ?? '').localeCompare(b.work.authors[0] ?? '');
      if (sortBy === 'year')
        return (b.primaryEdition.publishedYear ?? 0) - (a.primaryEdition.publishedYear ?? 0);
      if (sortBy === 'pages')
        return (b.primaryEdition.pageCount ?? 0) - (a.primaryEdition.pageCount ?? 0);
      return b.work.createdAt.localeCompare(a.work.createdAt);
    });
    return list;
  }, [
    books,
    search,
    ownershipFilter,
    shelfFilter,
    genreFilter,
    languageFilter,
    statusFilter,
    sortBy,
  ]);

  const activeLoansList = loans.filter(
    (l) => !l.deletedAt && (l.status === 'active' || l.status === 'overdue')
  );

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelfName.trim()) return;
    await saveShelf({ name: newShelfName });
    setNewShelfName('');
  };

  return (
    <div className="space-y-4">
      {/* Search, Sort & View Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="w-full min-h-[44px] rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="min-h-[44px] rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium"
        >
          <option value="recent">Sort: Recently Added</option>
          <option value="title">Sort: Title A–Z</option>
          <option value="author">Sort: Author</option>
          <option value="year">Sort: Published Year</option>
          <option value="pages">Sort: Page Count</option>
        </select>

        <div className="inline-flex rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            title={t('library.gridView')}
            className={`min-h-[34px] min-w-[36px] flex items-center justify-center rounded-lg ${
              viewMode === 'grid'
                ? 'bg-stone-900 text-white dark:bg-[#C2410C]'
                : 'text-stone-500'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            title={t('library.listView')}
            className={`min-h-[34px] min-w-[36px] flex items-center justify-center rounded-lg ${
              viewMode === 'list'
                ? 'bg-stone-900 text-white dark:bg-[#C2410C]'
                : 'text-stone-500'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowShelfModal((v) => !v)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <FolderPlus className="h-4 w-4 text-[#C2410C]" />
          {t('library.manageShelves')}
        </button>
      </div>

      {/* Multi-Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={ownershipFilter}
          onChange={(e) => setOwnershipFilter(e.target.value as OwnershipFilter)}
          className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">Ownership: All</option>
          <option value="owned">Owned Only</option>
          <option value="wishlist">Wishlist</option>
          <option value="loans">With Active Loans ({activeLoansList.length})</option>
          <option value="unowned">0 Owned Copies (Borrowed / Tracked)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">Reading Status: All</option>
          <option value="currently_reading">Currently Reading</option>
          <option value="want_to_read">Want to Read</option>
          <option value="finished">Finished</option>
          <option value="on_hold">On Hold</option>
          <option value="abandoned">Abandoned</option>
        </select>

        <select
          value={shelfFilter}
          onChange={(e) => setShelfFilter(e.target.value)}
          className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">Shelf: All</option>
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {allGenres.length > 0 && (
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
          >
            <option value="all">Genre: All</option>
            {allGenres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}

        {allLanguages.length > 0 && (
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium"
          >
            <option value="all">Language: All</option>
            {allLanguages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}

        <span className="ml-auto text-xs font-mono tabular-nums text-stone-500">
          {filtered.length} / {books.length} works
        </span>
      </div>

      {/* Inline Custom Shelf Manager */}
      {showShelfModal && (
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('library.shelves')}</h3>
            <button
              type="button"
              onClick={() => setShowShelfModal(false)}
              className="text-xs text-stone-500 hover:text-stone-900"
            >
              Done
            </button>
          </div>
          <form onSubmit={handleCreateShelf} className="flex gap-2">
            <input
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              placeholder="New shelf name (e.g. Manga Cabinet, Sci-Fi Favorites)..."
              className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white"
            >
              Create Shelf
            </button>
          </form>
          {shelves.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {shelves.map((s) => (
                <div
                  key={s.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-slate-700 px-2.5 py-1 text-xs"
                >
                  <BookMarked className="h-3.5 w-3.5 text-[#C2410C]" />
                  <span>{s.name}</span>
                  <button
                    type="button"
                    onClick={() => softDeleteEntity('shelves', s.id)}
                    className="text-stone-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-10 text-center space-y-3">
          <p className="font-editorial text-base font-semibold">
            {books.length === 0 ? t('library.emptyTitle') : 'No matching books found'}
          </p>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {books.length === 0
              ? t('library.emptyBody')
              : 'Try clearing a filter or searching by a different title, author, or ISBN.'}
          </p>
          {books.length === 0 && (
            <button
              type="button"
              onClick={onOpenAddBook}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              {t('action.addBook')}
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((b) => (
            <button
              key={b.work.id}
              type="button"
              onClick={() => onOpenBook(b.work.id)}
              className="group flex flex-col rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left transition-colors hover:border-[#C2410C]"
            >
              <CoverImage
                title={b.work.title}
                author={b.work.authors[0]}
                edition={b.primaryEdition}
              />
              <div className="mt-2.5 space-y-1">
                <p className="font-semibold text-xs leading-snug line-clamp-2 group-hover:text-[#C2410C]">
                  {b.work.title}
                </p>
                <p className="text-[11px] text-stone-500 truncate">
                  {b.work.authors.join(', ') || 'Unknown Author'}
                </p>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-stone-500 pt-0.5">
                  <span>{b.ownedCopiesCount} owned</span>
                  <span>{b.activeCycle?.status.replace(/_/g, ' ') || 'untracked'}</span>
                </div>
                {b.activeLoansCount > 0 && (
                  <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    <Users className="h-3 w-3" />
                    {b.activeLoansCount} active loan
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 dark:border-slate-800 text-[11px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Title &amp; Author</th>
                <th className="px-3 py-3">Edition / Publisher</th>
                <th className="px-3 py-3 text-right">Copies</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3">Reading</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
              {filtered.map((b) => {
                const firstOwned = b.copies.find((c) => c.purchasePrice != null);
                return (
                  <tr
                    key={b.work.id}
                    onClick={() => onOpenBook(b.work.id)}
                    className="cursor-pointer hover:bg-stone-50 dark:hover:bg-slate-800/60"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-stone-900 dark:text-slate-100">
                        {b.work.title}
                      </p>
                      <p className="text-stone-500">
                        {b.work.authors.join(', ') || 'Unknown Author'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-stone-500">
                      {b.primaryEdition.publishers.join(', ') || b.primaryEdition.format}
                      {b.isbns[0] && (
                        <span className="block font-mono text-[10px]">{b.isbns[0].isbn13}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {b.ownedCopiesCount}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {firstOwned
                        ? formatCurrency(firstOwned.purchasePrice, firstOwned.currency)
                        : '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px]">
                      {b.activeCycle?.status.replace(/_/g, ' ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
