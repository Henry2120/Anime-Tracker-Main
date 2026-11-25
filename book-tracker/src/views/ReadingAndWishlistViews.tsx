import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  WifiOff,
  X,
} from 'lucide-react';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { saveLocalCoverBlob, sanitizeCoverUrl } from '../services/covers';
import { createBookBundle, startReadingCycle, updateCycleStatus } from '../services/libraryService';
import { foldVietnameseDiacritics } from '../services/metadata/htmlAndText';
import { buildStructuredContributors } from '../services/metadata/pipeline';
import {
  lookupMetadataWithReportByIsbn,
  recordProviderMetadata,
  searchMetadataWithReportByQuery,
} from '../services/metadataService';
import type {
  BookFormat,
  MetadataCandidate,
  ProviderStatusReport,
} from '../types/domain';
import { parseBookIdentifier } from '../utils/isbn';

function normalizeCompareText(value: string): string {
  return foldVietnameseDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkDuplicateInCollection(
  candidate: MetadataCandidate,
  books: EnrichedBookRecord[]
): {
  inLibrary: boolean;
  inWishlist: boolean;
  matchingBook: EnrichedBookRecord | null;
} {
  const candIds = new Set(
    [candidate.isbn13, candidate.ean13]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.replace(/[^0-9X]/gi, '').toUpperCase())
  );
  const candTitle = normalizeCompareText(candidate.title);
  const candFirstAuthor = normalizeCompareText(candidate.authors[0] ?? '');

  for (const book of books) {
    const bookIds = book.isbns
      .flatMap((i) => [i.isbn13, i.ean13])
      .filter((v): v is string => Boolean(v))
      .map((v) => v.replace(/[^0-9X]/gi, '').toUpperCase());

    const idMatch = bookIds.some((id) => candIds.has(id));
    const titleMatch = candTitle.length > 0 && normalizeCompareText(book.work.title) === candTitle;
    const authorMatch =
      !candFirstAuthor ||
      book.work.authors.length === 0 ||
      book.work.authors.some((a) => normalizeCompareText(a) === candFirstAuthor);

    if (idMatch || (titleMatch && authorMatch)) {
      const inLibrary = book.ownedCopiesCount > 0;
      const inWishlist =
        book.wishlistCopiesCount > 0 || book.activeCycle?.status === 'want_to_read';
      return { inLibrary, inWishlist, matchingBook: book };
    }
  }

  return { inLibrary: false, inWishlist: false, matchingBook: null };
}

export function CurrentlyReadingView({
  books,
  onOpenBook,
}: {
  books: EnrichedBookRecord[];
  onOpenBook: (workId: string) => void;
}) {
  const reading = books.filter((b) => b.activeCycle?.status === 'currently_reading');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-editorial text-xl font-semibold">
          Currently Reading ({reading.length})
        </h2>
      </div>

      {reading.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 p-10 text-center text-sm text-stone-500">
          No books currently reading. Start one from your Library or Wishlist.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {reading.map((b) => {
            const cycle = b.activeCycle!;
            const edition =
              b.editions.find((e) => e.id === cycle.editionId) ?? b.primaryEdition;

            return (
              <div
                key={b.work.id}
                className="flex gap-4 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <div className="w-24 shrink-0">
                  <CoverImage
                    title={b.work.title}
                    author={b.work.authors[0]}
                    edition={edition}
                  />
                </div>
                <div className="flex-1 flex flex-col justify-between min-w-0 space-y-3">
                  <div>
                    <h3 className="font-editorial font-semibold text-base line-clamp-2">
                      {b.work.title}
                    </h3>
                    <p className="text-xs text-stone-500">
                      {b.work.authors.join(', ') || 'Unknown Author'} · Cycle #{cycle.cycleNumber}
                    </p>
                    {cycle.startedAt && (
                      <p className="mt-1 text-xs font-mono text-stone-500">
                        Started {cycle.startedAt}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateCycleStatus(cycle.id, 'finished')}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Finish Book
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCycleStatus(cycle.id, 'on_hold')}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-3 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBook(b.work.id)}
                      className="min-h-[36px] rounded-lg border border-stone-300 dark:border-slate-700 px-3 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-slate-800"
                    >
                      Details →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const { t } = useI18n();
  const wishlist = books.filter(
    (b) => b.wishlistCopiesCount > 0 || b.activeCycle?.status === 'want_to_read'
  );

  // Embedded Online Book Discovery state (scoped to Wishlist additions)
  const searchSeqRef = useRef(0);
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [exactResults, setExactResults] = useState<MetadataCandidate[]>([]);
  const [approxResults, setApproxResults] = useState<MetadataCandidate[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatusReport[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidate | null>(null);

  // Editable preview draft before saving strictly to Wishlist
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAuthors, setDraftAuthors] = useState('');
  const [draftTranslators, setDraftTranslators] = useState('');
  const [draftPublishers, setDraftPublishers] = useState('');
  const [draftLanguage, setDraftLanguage] = useState('vi');
  const [draftFormat, setDraftFormat] = useState<BookFormat>('paperback');
  const [draftYear, setDraftYear] = useState('');
  const [draftPages, setDraftPages] = useState('');
  const [draftIsbn, setDraftIsbn] = useState('');
  const [draftCoverUrl, setDraftCoverUrl] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftCoverFile, setDraftCoverFile] = useState<File | null>(null);
  const [draftCoverPreview, setDraftCoverPreview] = useState<string | null>(null);
  const [savingWishlist, setSavingWishlist] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const resetPreviewDraft = () => {
    setSelectedCandidate(null);
    setDraftTitle('');
    setDraftAuthors('');
    setDraftTranslators('');
    setDraftPublishers('');
    setDraftLanguage('vi');
    setDraftFormat('paperback');
    setDraftYear('');
    setDraftPages('');
    setDraftIsbn('');
    setDraftCoverUrl('');
    setDraftDescription('');
    setDraftNotes('');
    setDraftCoverFile(null);
    if (draftCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(draftCoverPreview);
    }
    setDraftCoverPreview(null);
  };

  const handleSelectCandidate = (cand: MetadataCandidate) => {
    setSelectedCandidate(cand);
    setSaveMessage(null);
    setDraftTitle(cand.title);
    setDraftAuthors(cand.authors.join(', '));
    setDraftTranslators(cand.translators.join(', '));
    setDraftPublishers(cand.publishers.join(', '));
    setDraftLanguage(cand.language && cand.language !== 'und' ? cand.language : 'vi');
    setDraftFormat(cand.format ?? 'paperback');
    setDraftYear(cand.publishedYear ? String(cand.publishedYear) : '');
    setDraftPages(cand.pageCount ? String(cand.pageCount) : '');
    setDraftIsbn(cand.isbn13 ?? cand.ean13 ?? cand.isbn10 ?? '');
    setDraftCoverUrl(sanitizeCoverUrl(cand.coverUrl) ?? '');
    setDraftDescription(cand.description ?? '');
    setDraftNotes('');
  };

  const handleDiscoverSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;

    setOfflineError(null);
    setSearchError(null);
    setSaveMessage(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOfflineError(t('wishlist.offlineNotice'));
      return;
    }

    const seq = ++searchSeqRef.current;
    setSearching(true);
    setHasSearched(true);

    try {
      const parsedId = parseBookIdentifier(trimmed);
      if (parsedId.isValid) {
        const res = await lookupMetadataWithReportByIsbn(trimmed);
        if (seq !== searchSeqRef.current) return;
        setExactResults(res.candidates);
        setApproxResults(
          [
            ...(res.possibleEditionMatches ?? []),
            ...(res.approximateMatches ?? []),
            ...(res.relatedEditions ?? []),
          ].filter(
            (item) =>
              !res.candidates.some(
                (c) => c.provider === item.provider && c.externalId === item.externalId
              )
          )
        );
        setProviderStatuses(res.providerStatuses);
      } else {
        const res = await searchMetadataWithReportByQuery(trimmed);
        if (seq !== searchSeqRef.current) return;
        setExactResults(res.candidates);
        setApproxResults(res.workMatches ?? res.approximateMatches ?? []);
        setProviderStatuses(res.providerStatuses);
      }
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      setSearchError(err instanceof Error ? err.message : 'Book search failed.');
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  };

  const handleUploadDraftCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (draftCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(draftCoverPreview);
    }
    setDraftCoverFile(file);
    setDraftCoverPreview(URL.createObjectURL(file));
  };

  const handleSaveToWishlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    setSavingWishlist(true);
    setSearchError(null);
    try {
      const authors = draftAuthors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const translators = draftTranslators
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const publishers = draftPublishers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const safeUrl = sanitizeCoverUrl(draftCoverUrl) ?? undefined;

      const bundle = await createBookBundle({
        work: {
          title: draftTitle.trim(),
          originalTitle: selectedCandidate?.originalTitle,
          authors,
          illustrators: selectedCandidate?.illustrators,
          genres: selectedCandidate?.genres ?? [],
          description: draftDescription.trim() || undefined,
          originalLanguage: draftLanguage || undefined,
          firstPublishedYear: draftYear ? Number(draftYear) || null : null,
          seriesName: selectedCandidate?.seriesName,
          seriesIndex: selectedCandidate?.volumeNumber,
          metadataSource: selectedCandidate?.provider ?? 'manual',
          metadataVerified: Boolean(selectedCandidate),
        },
        edition: {
          title: draftTitle.trim(),
          translators,
          illustrators: selectedCandidate?.illustrators,
          contributors: buildStructuredContributors({
            authors,
            illustrators: selectedCandidate?.illustrators,
            translators,
            editors: selectedCandidate?.editors,
          }),
          publishers,
          publishedYear: draftYear ? Number(draftYear) || null : null,
          language: draftLanguage || 'und',
          format: draftFormat,
          pageCount: draftPages ? Number(draftPages) || null : null,
          coverUrl: safeUrl,
          description: draftDescription.trim() || undefined,
          metadataSource: selectedCandidate?.provider ?? 'manual',
          metadataVerified: Boolean(selectedCandidate),
        },
        isbnInput: draftIsbn.trim() || undefined,
        createCopy: true,
        copy: {
          ownershipStatus: 'wishlist',
          format: draftFormat,
          condition: 'new',
          acquisitionMethod: 'purchased',
          notes: draftNotes.trim() || undefined,
        },
        initialReadingStatus: 'want_to_read',
      });

      if (draftCoverFile) {
        await saveLocalCoverBlob(bundle.edition.id, draftCoverFile);
      }
      if (selectedCandidate) {
        await recordProviderMetadata({
          workId: bundle.work.id,
          editionId: bundle.edition.id,
          candidate: selectedCandidate,
        });
      }

      setSaveMessage(`Added "${bundle.work.title}" to your Wishlist.`);
      resetPreviewDraft();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to save to wishlist.');
    } finally {
      setSavingWishlist(false);
    }
  };

  const combinedResults = useMemo(() => {
    const seen = new Set<string>();
    const list: MetadataCandidate[] = [];
    for (const item of [...exactResults, ...approxResults]) {
      const k = `${item.provider}:${item.externalId}`;
      if (!seen.has(k)) {
        seen.add(k);
        list.push(item);
      }
    }
    return list;
  }, [exactResults, approxResults]);

  const draftDuplicate = selectedCandidate
    ? checkDuplicateInCollection(
        {
          ...selectedCandidate,
          title: draftTitle || selectedCandidate.title,
          authors: draftAuthors
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          isbn13: draftIsbn || selectedCandidate.isbn13,
        },
        books
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Embedded Online Book Discovery & Wishlist Adder */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
            <Search className="h-4 w-4 text-[#C2410C]" />
            {t('wishlist.discoverTitle')}
          </h2>
          <p className="text-xs text-stone-500">{t('wishlist.discoverSubtitle')}</p>
        </div>

        <form onSubmit={handleDiscoverSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('wishlist.searchPlaceholder')}
              className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchInput.trim()}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t('wishlist.searchButton')}
          </button>
        </form>

        {offlineError && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>{offlineError}</span>
          </div>
        )}

        {searchError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {saveMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* Selected Candidate Inline Preview & Edit Before Saving to Wishlist */}
        {selectedCandidate && (
          <form
            onSubmit={handleSaveToWishlist}
            className="rounded-xl border-2 border-[#C2410C]/40 bg-amber-50/40 dark:bg-slate-950/70 p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                  Review &amp; Edit Before Adding to Wishlist
                </h3>
                <p className="text-[11px] font-mono text-stone-500">
                  Source: {(selectedCandidate.sources ?? [selectedCandidate.provider]).join(' + ')}
                </p>
              </div>
              <button
                type="button"
                onClick={resetPreviewDraft}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-200/60 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {draftDuplicate && (draftDuplicate.inLibrary || draftDuplicate.inWishlist) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-100/70 dark:bg-amber-950/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <span>
                  {draftDuplicate.inLibrary && draftDuplicate.inWishlist
                    ? 'Already in your Library and Wishlist.'
                    : draftDuplicate.inLibrary
                      ? 'This title/identifier is already in your Owned Library.'
                      : 'This title/identifier is already in your Wishlist.'}
                </span>
                {draftDuplicate.matchingBook && (
                  <button
                    type="button"
                    onClick={() => onOpenBook(draftDuplicate.matchingBook!.work.id)}
                    className="font-semibold underline"
                  >
                    Open Existing Book
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-24 shrink-0 space-y-1.5">
                {draftCoverPreview || sanitizeCoverUrl(draftCoverUrl) ? (
                  <img
                    src={draftCoverPreview || sanitizeCoverUrl(draftCoverUrl)!}
                    alt={draftTitle || 'Cover preview'}
                    className="w-24 h-36 rounded-lg object-cover border border-stone-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-24 h-36 rounded-lg border border-dashed border-stone-300 dark:border-slate-700 flex items-center justify-center text-stone-400">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                )}
                <label className="block cursor-pointer rounded-md border border-stone-300 dark:border-slate-700 py-1 text-center text-[10px] font-semibold hover:bg-white dark:hover:bg-slate-800">
                  Upload Cover
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadDraftCover}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-semibold mb-1">Title *</label>
                  <input
                    required
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Authors</label>
                  <input
                    value={draftAuthors}
                    onChange={(e) => setDraftAuthors(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Translators</label>
                  <input
                    value={draftTranslators}
                    onChange={(e) => setDraftTranslators(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Publishers</label>
                  <input
                    value={draftPublishers}
                    onChange={(e) => setDraftPublishers(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">ISBN-13 / EAN-13</label>
                  <input
                    value={draftIsbn}
                    onChange={(e) => setDraftIsbn(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-semibold mb-1">Format</label>
                    <select
                      value={draftFormat}
                      onChange={(e) => setDraftFormat(e.target.value as BookFormat)}
                      className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
                    >
                      <option value="paperback">Paperback</option>
                      <option value="hardcover">Hardcover</option>
                      <option value="bunko">Bunko</option>
                      <option value="tankobon">Tankobon</option>
                      <option value="ebook">E-book</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Year</label>
                    <input
                      type="number"
                      value={draftYear}
                      onChange={(e) => setDraftYear(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Pages</label>
                    <input
                      type="number"
                      value={draftPages}
                      onChange={(e) => setDraftPages(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Wishlist Note (optional)</label>
                  <input
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Target edition, gift idea, bookstore..."
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetPreviewDraft}
                className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingWishlist || !draftTitle.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {savingWishlist ? 'Adding...' : t('wishlist.addToWishlist')}
              </button>
            </div>
          </form>
        )}

        {/* Search Results List */}
        {hasSearched && !searching && (
          <div className="space-y-2.5">
            {providerStatuses.length > 0 && (
              <p className="text-[11px] font-mono text-stone-500">
                Checked {providerStatuses.length} providers · Found {combinedResults.length} candidate(s)
              </p>
            )}
            {combinedResults.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 dark:border-slate-700 p-4 text-center text-xs text-stone-500">
                No matching books found online for &ldquo;{searchInput.trim()}&rdquo;. Try an ISBN-13, EAN-13, or different title/author keywords.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {combinedResults.slice(0, 12).map((c) => {
                  const dup = checkDuplicateInCollection(c, books);
                  const safeThumb = sanitizeCoverUrl(c.coverUrl);
                  return (
                    <div
                      key={`${c.provider}-${c.externalId}`}
                      className="flex gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-950/60 p-3"
                    >
                      {safeThumb ? (
                        <img
                          src={safeThumb}
                          alt={c.title}
                          className="h-20 w-14 rounded object-cover border border-stone-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="h-20 w-14 rounded bg-stone-200 dark:bg-slate-800 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-stone-200 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-stone-700 dark:text-slate-300">
                            {(c.sources ?? [c.provider]).join(' + ')}
                          </span>
                          {dup.inLibrary && (
                            <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                              In Library
                            </span>
                          )}
                          {dup.inWishlist && (
                            <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                              In Wishlist
                            </span>
                          )}
                          {c.sourceUrl && sanitizeCoverUrl(c.sourceUrl) && (
                            <a
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-[10px] text-[#C2410C] hover:underline"
                            >
                              Source <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-stone-900 dark:text-slate-100 line-clamp-1">
                          {c.title}
                        </p>
                        <p className="text-xs text-stone-500 truncate">
                          {c.authors.join(', ') || 'Unknown Author'}
                          {c.publishers.length > 0 ? ` · ${c.publishers[0]}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSelectCandidate(c)}
                            className="rounded-lg bg-[#C2410C] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#9A3412]"
                          >
                            Preview &amp; Add to Wishlist
                          </button>
                          {dup.matchingBook && (
                            <button
                              type="button"
                              onClick={() => onOpenBook(dup.matchingBook!.work.id)}
                              className="text-xs font-semibold text-stone-600 dark:text-slate-300 hover:underline"
                            >
                              Open Existing
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Saved Wishlist Books */}
      <section className="space-y-4">
        <h2 className="font-editorial text-xl font-semibold">
          {t('nav.wishlist')} ({wishlist.length})
        </h2>
        {wishlist.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 p-10 text-center text-sm text-stone-500">
            Your wishlist is empty. Search above to discover books or add items via + Add Book.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wishlist.map((b) => (
              <div
                key={b.work.id}
                className="flex gap-3.5 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <div className="w-16 shrink-0">
                  <CoverImage
                    title={b.work.title}
                    author={b.work.authors[0]}
                    edition={b.primaryEdition}
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <h3 className="font-editorial font-semibold text-sm line-clamp-2">
                      {b.work.title}
                    </h3>
                    <p className="text-xs text-stone-500 truncate">
                      {b.work.authors.join(', ') || 'Unknown Author'}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-2">
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
                      className="inline-flex items-center gap-1 rounded-lg bg-[#C2410C] px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      <Play className="h-3 w-3" />
                      Start Reading
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBook(b.work.id)}
                      className="rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ReadingHistoryView({
  books,
  onOpenBook,
}: {
  books: EnrichedBookRecord[];
  onOpenBook: (workId: string) => void;
}) {
  const allCycles = books
    .flatMap((b) =>
      b.cycles.map((c) => ({
        cycle: c,
        book: b,
        edition: b.editions.find((e) => e.id === c.editionId) ?? b.primaryEdition,
      }))
    )
    .sort((a, b) =>
      (b.cycle.finishedAt ?? b.cycle.startedAt ?? b.cycle.updatedAt).localeCompare(
        a.cycle.finishedAt ?? a.cycle.startedAt ?? a.cycle.updatedAt
      )
    );

  return (
    <div className="space-y-6">
      <h2 className="font-editorial text-xl font-semibold">
        Reading History &amp; Re-Reads ({allCycles.length} cycles)
      </h2>

      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Completed &amp; Past Reading Cycles
        </h3>
        {allCycles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 p-8 text-center text-sm text-stone-500">
            No reading cycles logged yet. Start reading any book in your Library or Wishlist to record history here.
          </div>
        ) : (
          allCycles.map(({ cycle, book, edition }) => (
            <div
              key={cycle.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <BookOpen className="h-4 w-4 text-[#C2410C] shrink-0" />
                <div className="min-w-0">
                  <p className="font-editorial font-semibold text-sm truncate">
                    {book.work.title}{' '}
                    <span className="font-mono text-xs text-stone-500">
                      (Cycle #{cycle.cycleNumber})
                    </span>
                  </p>
                  <p className="text-stone-500">
                    {cycle.status.replace('_', ' ')}
                    {cycle.startedAt ? ` · Started ${cycle.startedAt}` : ''}
                    {cycle.finishedAt ? ` · Finished ${cycle.finishedAt}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    startReadingCycle({
                      workId: book.work.id,
                      editionId: edition.id,
                      status: 'currently_reading',
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1 font-semibold hover:bg-stone-50 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-read
                </button>
                <button
                  type="button"
                  onClick={() => onOpenBook(book.work.id)}
                  className="rounded-lg bg-stone-900 dark:bg-slate-800 px-2.5 py-1 font-semibold text-white"
                >
                  Open
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
