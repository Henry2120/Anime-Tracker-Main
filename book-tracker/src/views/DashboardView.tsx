import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clock,
  Compass,
  Feather,
  Flame,
  Globe,
  History,
  KeyRound,
  Layers,
  Library,
  Pause,
  Plus,
  ScanBarcode,
  Search,
} from 'lucide-react';
import type { NavTab } from '../App';
import type { ArchiveTransitionKind } from '../components/ArchiveTransitionStage';
import { CoverImage } from '../components/CoverImage';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { updateCycleStatus } from '../services/libraryService';
import type {
  AppSettings,
  CurrencyCode,
  Edition,
  PhysicalCopy,
  ReadingCycle,
  Shelf,
  Work,
} from '../types/domain';
import { getDeterministicBookSpineStyle } from '../utils/bookSpine';
import { formatCurrency } from '../utils/currency';
import { computeLibraryStatistics } from '../utils/statsCalculator';
import type { ShelfBucketKey } from './LibraryView';

interface DashboardViewProps {
  books: EnrichedBookRecord[];
  works: Work[];
  editions: Edition[];
  copies: PhysicalCopy[];
  cycles: ReadingCycle[];
  shelves: Shelf[];
  settings: AppSettings;
  lanternWarmth: boolean;
  onToggleLantern: () => void;
  onOpenBook: (workId: string) => void;
  onOpenAddBook: () => void;
  onOpenBatchScan: () => void;
  onNavigate: (
    tab: NavTab,
    options?: {
      libraryMode?: 'shelves' | 'catalog';
      shelfKey?: ShelfBucketKey;
      searchQuery?: string;
      transition?: ArchiveTransitionKind;
    }
  ) => void;
}

function formatHallClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DashboardView({
  books,
  works,
  editions,
  copies,
  cycles,
  shelves,
  lanternWarmth,
  onToggleLantern,
  onOpenBook,
  onOpenAddBook,
  onOpenBatchScan,
  onNavigate,
}: DashboardViewProps) {
  const { t } = useI18n();
  const [deskQuery, setDeskQuery] = useState('');
  const [orreryOpen, setOrreryOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const stats = useMemo(
    () =>
      computeLibraryStatistics({
        works,
        editions,
        copies,
        cycles,
      }),
    [works, editions, copies, cycles]
  );

  const currentlyReading = useMemo(
    () => books.filter((b) => b.activeCycle?.status === 'currently_reading'),
    [books]
  );

  const wishlistCount = useMemo(
    () =>
      books.filter(
        (b) =>
          b.wishlistCopiesCount > 0 ||
          (b.activeCycle?.status === 'want_to_read' && b.ownedCopiesCount === 0)
      ).length,
    [books]
  );

  const manuscriptCount = useMemo(
    () =>
      books.reduce(
        (acc, b) => acc + b.reviews.length + b.journalEntries.length,
        0
      ),
    [books]
  );

  const sortedRecent = useMemo(
    () =>
      [...books].sort((a, b) => b.work.createdAt.localeCompare(a.work.createdAt)),
    [books]
  );

  const floatingBook = currentlyReading[0] ?? sortedRecent[0] ?? null;
  const archwaySpines = sortedRecent.slice(0, 11);
  const totalSpendEntries = Object.entries(stats.collectionSpendByCurrency);

  const deskMatches = useMemo(() => {
    const q = deskQuery.trim().toLowerCase();
    if (!q) return sortedRecent.slice(0, 4);
    return books
      .filter((b) => {
        const hay = [
          b.work.title,
          b.work.authors.join(' '),
          b.isbns.map((i) => `${i.isbn13} ${i.isbn10 ?? ''}`).join(' '),
          b.work.genres.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 5);
  }, [books, deskQuery, sortedRecent]);

  return (
    <div className="space-y-6">
      {/* =====================================================================
          STAGE 1: THE GRAND HALL — EXPLORABLE GOTHIC ARCHITECTURAL SCENE
         ===================================================================== */}
      <section className="archive-walnut-panel relative overflow-hidden rounded-3xl border border-[#B49A67]/40 p-4 sm:p-6 lg:p-8 shadow-2xl">
        {/* Vaulted Upper Architecture & Hanging Interactive Objects */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#B49A67]/25 pb-4">
          {/* Interactive Hanging Brass Lantern (Left) */}
          <button
            type="button"
            onClick={onToggleLantern}
            aria-pressed={lanternWarmth}
            className="group inline-flex min-h-[44px] items-center gap-2.5 rounded-2xl border border-[#B49A67]/35 bg-[#0B1120]/75 px-3.5 py-2 text-left hover:border-[#D6BD8A]"
          >
            <span
              className={`animate-archive-lantern inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                lanternWarmth
                  ? 'border-[#D6BD8A] bg-[#392A24] text-[#D6BD8A] shadow-[0_0_16px_rgba(214,189,138,0.45)]'
                  : 'border-[#7797C9]/50 bg-[#101827] text-[#7797C9]'
              }`}
            >
              <Flame className={`h-4 w-4 ${lanternWarmth ? 'animate-archive-candle' : ''}`} />
            </span>
            <div>
              <span className="block font-archive-display text-[11px] font-semibold text-[#F4EFE6]">
                {lanternWarmth ? 'Lanterns Lit' : 'Moonlit Watch'}
              </span>
              <span className="block text-[10px] text-[#AEB9C9]">
                Toggle hall lighting
              </span>
            </div>
          </button>

          {/* Upper Mezzanine Walkways + Pendulum Wall Clock */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Pendulum Archive Wall Clock */}
            <div
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-[#B49A67]/30 bg-[#0B1120]/80 px-3.5 py-1.5"
              aria-label={`Archive Hall Clock ${formatHallClock(now)}`}
            >
              <Clock className="h-4 w-4 text-[#B49A67]" />
              <div className="leading-tight">
                <span className="block font-mono text-sm font-bold tabular-nums text-[#F4EFE6]">
                  {formatHallClock(now)}
                </span>
                <span className="block text-[9px] uppercase tracking-widest text-[#AEB9C9]">
                  Hall Clock
                </span>
              </div>
            </div>

            {/* Upper Gallery -> Reading Chronicles */}
            <button
              type="button"
              onClick={() => onNavigate('history', { transition: 'enter-wing' })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-[#776B9C]/45 bg-[#101827]/85 px-3.5 py-2 text-xs font-semibold text-[#ECE6D8] hover:border-[#D6BD8A]"
            >
              <History className="h-4 w-4 text-[#9D8EC4]" />
              <span className="font-archive-display">Upper Gallery</span>
              <span className="rounded bg-[#0B1120] px-1.5 py-0.5 font-mono text-[10px] text-[#B49A67] tabular-nums">
                {stats.finishedCyclesCount}
              </span>
            </button>

            {/* Spiral Staircase -> Royal Observatory */}
            <button
              type="button"
              onClick={() => onNavigate('stats', { transition: 'enter-wing' })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-[#7797C9]/45 bg-[#101827]/85 px-3.5 py-2 text-xs font-semibold text-[#ECE6D8] hover:border-[#D6BD8A]"
            >
              <BarChart3 className="h-4 w-4 text-[#7797C9]" />
              <span className="font-archive-display">Observatory Stairs</span>
            </button>

            {/* Interactive Magical Orrery Globe (Shows Live Collection Ledger Popover) */}
            <button
              type="button"
              onClick={() => setOrreryOpen((v) => !v)}
              aria-expanded={orreryOpen}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                orreryOpen
                  ? 'border-[#D6BD8A] bg-[#392A24] text-[#D6BD8A]'
                  : 'border-[#B49A67]/40 bg-[#141E30]/90 text-[#D6BD8A] hover:border-[#D6BD8A]'
              }`}
            >
              <Globe className="h-4 w-4 text-[#7797C9]" />
              <span className="font-archive-display">Orrery Ledger</span>
            </button>
          </div>
        </div>

        {/* Orrery Globe Inspection Drawer (Replaces SaaS KPI Row with Interactive Object Inspection) */}
        {orreryOpen && (
          <div className="relative z-10 mt-4 rounded-2xl border border-[#7797C9]/45 bg-[#0B1120]/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex flex-wrap items-center gap-5 text-xs">
              <div>
                <span className="text-[#AEB9C9]">Owned Volumes</span>
                <p className="font-mono text-lg font-bold tabular-nums text-[#F4EFE6]">
                  {stats.ownedCopiesCount} copies
                </p>
              </div>
              <div className="h-8 w-px bg-[#B49A67]/25 hidden sm:block" />
              <div>
                <span className="text-[#AEB9C9]">Cataloged Works</span>
                <p className="font-mono text-lg font-bold tabular-nums text-[#D6BD8A]">
                  {stats.totalWorks} works · {stats.totalEditions} ed.
                </p>
              </div>
              <div className="h-8 w-px bg-[#B49A67]/25 hidden sm:block" />
              <div>
                <span className="text-[#AEB9C9]">Tracked Investment</span>
                <p className="font-mono text-base font-bold tabular-nums text-[#F4EFE6]">
                  {totalSpendEntries.length > 0
                    ? totalSpendEntries
                        .map(([cur, amt]) => formatCurrency(amt, cur as CurrencyCode))
                        .join(' · ')
                    : '—'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stats', { transition: 'enter-wing' })}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] shrink-0"
            >
              Ascend to Royal Observatory
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Central Hall Architectural Elevation: Floating Tome + Stone Wing Archways */}
        <div className="relative z-10 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* LEFT WALL: Enchanted Floating Book Beneath the Rose Moonbeam */}
          <div className="lg:col-span-3 flex flex-col justify-between rounded-2xl border border-[#7797C9]/30 bg-gradient-to-b from-[#141E30]/90 via-[#0F1727]/95 to-[#0B1120]/95 p-4 text-center relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none mx-auto mb-2 h-16 w-16 rounded-full border border-[#7797C9]/40 bg-[#7797C9]/10 flex items-center justify-center"
            >
              <Compass className="h-6 w-6 text-[#7797C9]/80" />
            </div>

            {floatingBook ? (
              <button
                type="button"
                onClick={() => onOpenBook(floatingBook.work.id)}
                className="group mx-auto flex flex-col items-center gap-2.5 focus:outline-none"
              >
                <div className="animate-archive-float w-24 sm:w-28 rounded-lg border border-[#D6BD8A]/55 p-1 bg-[#141E30]/90 shadow-[0_18px_36px_rgba(119,151,201,0.28)] group-hover:scale-105 transition-transform">
                  <CoverImage
                    title={floatingBook.work.title}
                    author={floatingBook.work.authors[0]}
                    edition={floatingBook.primaryEdition}
                  />
                </div>
                <span className="archive-brass-plaque rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {currentlyReading[0] ? 'Active Floating Tome' : 'Latest Volume'}
                </span>
                <p className="font-editorial text-sm font-semibold text-[#F4EFE6] line-clamp-2 group-hover:text-[#D6BD8A]">
                  {floatingBook.work.title}
                </p>
              </button>
            ) : (
              <div className="space-y-3 py-4">
                <p className="font-editorial text-sm text-[#AEB9C9]">
                  The moonlight pedestal awaits your first registered volume.
                </p>
                <button
                  type="button"
                  onClick={onOpenAddBook}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120]"
                >
                  <Plus className="h-4 w-4" />
                  {t('action.addBook')}
                </button>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-[#B49A67]/20 flex items-center justify-center gap-2 text-[11px] text-[#AEB9C9]">
              <span className="font-mono tabular-nums">{stats.ownedCopiesCount} owned</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{shelves.length} shelves</span>
            </div>
          </div>

          {/* CENTER ARCH: The Grand Stacks Bookcase Doorway (Clickable Walnut Shelves & Real Spines) */}
          <div className="lg:col-span-5 archive-stone-arch p-5 sm:p-6 flex flex-col justify-between">
            <div className="text-center space-y-1.5">
              <span className="archive-brass-plaque inline-block rounded-md px-3 py-0.5 font-archive-display text-[10px] font-bold uppercase tracking-[0.2em]">
                North Archway · Grand Stacks
              </span>
              <h2 className="font-archive-display text-lg sm:text-xl font-bold text-[#F4EFE6]">
                Floor-to-Ceiling Bookcases
              </h2>
              <p className="text-xs text-[#AEB9C9]">
                Step directly into the walnut stacks or open a shelf aisle
              </p>
            </div>

            {/* Interactive Miniature Real Book Spines Seated on Hall Arch Ledge */}
            <div className="my-4">
              {archwaySpines.length > 0 ? (
                <div className="rounded-xl border border-[#B49A67]/30 bg-[#0B1120]/75 px-3 pt-4 pb-0">
                  <div className="flex items-end justify-center gap-1 overflow-hidden h-[118px]">
                    {archwaySpines.map((b) => {
                      const spine = getDeterministicBookSpineStyle({
                        workId: b.work.id,
                        pageCount: b.primaryEdition.pageCount,
                        format: b.primaryEdition.format,
                      });
                      const scaledH = Math.round(spine.heightPx * 0.5);
                      return (
                        <button
                          key={b.work.id}
                          type="button"
                          onClick={() => onOpenBook(b.work.id)}
                          title={`${b.work.title} — Open Folio`}
                          aria-label={`Pull ${b.work.title}`}
                          className="archive-spine-item rounded-t-sm px-0.5 py-1.5 flex flex-col items-center justify-between shrink-0"
                          style={{
                            background: spine.leatherBg,
                            width: `${Math.max(20, Math.round(spine.widthPx * 0.55))}px`,
                            height: `${scaledH}px`,
                          }}
                        >
                          <span
                            className="h-0.5 w-full rounded-full opacity-80"
                            style={{ backgroundColor: spine.accentBand }}
                          />
                          <span
                            className="text-[8px] font-semibold leading-none overflow-hidden"
                            style={{
                              color: spine.foilColor,
                              writingMode: 'vertical-rl',
                              maxHeight: `${scaledH - 22}px`,
                            }}
                          >
                            {b.work.title}
                          </span>
                          <span
                            className="h-0.5 w-full rounded-full opacity-70"
                            style={{ backgroundColor: spine.accentBand }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="archive-shelf-ledge rounded-b" />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#B49A67]/35 bg-[#0B1120]/60 p-6 text-center text-xs text-[#AEB9C9]">
                  Empty walnut alcove — catalog books to fill the Grand Stacks.
                </div>
              )}
            </div>

            {/* Direct Shelf Aisle Shortcuts & Enter Grand Stacks */}
            <div className="space-y-2.5">
              {shelves.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {shelves.slice(0, 4).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        onNavigate('library', {
                          libraryMode: 'shelves',
                          shelfKey: s.id,
                          transition: 'zoom-shelf',
                        })
                      }
                      className="min-h-[34px] rounded-lg border border-[#B49A67]/35 bg-[#392A24]/75 px-2.5 text-[11px] font-semibold text-[#D6BD8A] hover:border-[#D6BD8A]"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onNavigate('library', {
                      libraryMode: 'shelves',
                      shelfKey: '__all__',
                      transition: 'zoom-shelf',
                    })
                  }
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
                >
                  <Library className="h-4 w-4" />
                  Enter Grand Stacks ({books.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onNavigate('library', {
                      libraryMode: 'catalog',
                      transition: 'enter-wing',
                    })
                  }
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#101827] px-3 text-xs font-semibold text-[#7797C9] hover:text-[#F4EFE6]"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Catalog
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT WALL: Three Side Wing Archways (Acquisitions, Scholar's Study, Vault Office) */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => onNavigate('wishlist', { transition: 'enter-wing' })}
              className="archive-stone-arch flex items-center justify-between gap-3 px-5 py-4 text-left min-h-[82px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#B49A67]/40 bg-[#0B1120] text-[#D6BD8A]">
                  <Bookmark className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <span className="block font-archive-display text-sm font-bold text-[#F4EFE6]">
                    Acquisitions Wing
                  </span>
                  <span className="block text-[11px] text-[#AEB9C9] truncate">
                    Online discovery &amp; wishlist ledger
                  </span>
                </div>
              </div>
              <span className="archive-brass-plaque rounded px-2 py-0.5 font-mono text-[11px] font-bold shrink-0 tabular-nums">
                {wishlistCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('journal', { transition: 'enter-wing' })}
              className="archive-stone-arch flex items-center justify-between gap-3 px-5 py-4 text-left min-h-[82px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#B49A67]/40 bg-[#0B1120] text-[#D6BD8A]">
                  <Feather className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <span className="block font-archive-display text-sm font-bold text-[#F4EFE6]">
                    Scholar&apos;s Study Alcove
                  </span>
                  <span className="block text-[11px] text-[#AEB9C9] truncate">
                    Reviews, quotes &amp; parchment marginalia
                  </span>
                </div>
              </div>
              <span className="archive-brass-plaque rounded px-2 py-0.5 font-mono text-[11px] font-bold shrink-0 tabular-nums">
                {manuscriptCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('settings', { transition: 'enter-wing' })}
              className="archive-stone-arch flex items-center justify-between gap-3 px-5 py-4 text-left min-h-[82px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#B49A67]/40 bg-[#0B1120] text-[#AEB9C9]">
                  <KeyRound className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <span className="block font-archive-display text-sm font-bold text-[#F4EFE6]">
                    Archive Office &amp; Vault
                  </span>
                  <span className="block text-[11px] text-[#AEB9C9] truncate">
                    Cloud sync, backups &amp; data registry
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#B49A67] shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================================
          FOREGROUND OAK FURNITURE: CATALOGUE DESK + READING LECTERN
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Oak Catalogue Search & Batch Desk */}
        <section className="lg:col-span-7 archive-panel rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-archive-display text-[10px] uppercase tracking-[0.2em] text-[#B49A67]">
                Foreground Furniture · Oak Catalogue Desk
              </p>
              <h3 className="font-archive-display text-base sm:text-lg font-bold text-[#F4EFE6]">
                Index Search &amp; Rapid Intake
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenBatchScan}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#7797C9]/45 bg-[#141E30] px-3 text-xs font-semibold text-[#AEB9C9] hover:text-[#F4EFE6]"
              >
                <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
                {t('action.batchScan')}
              </button>
              <button
                type="button"
                onClick={onOpenAddBook}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
              >
                <Plus className="h-4 w-4" />
                {t('action.addBook')}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-[#AEB9C9]" />
              <input
                value={deskQuery}
                onChange={(e) => setDeskQuery(e.target.value)}
                placeholder="Consult desk index by title, author, ISBN-13, or 893 EAN..."
                className="archive-input w-full min-h-[44px] rounded-xl border pl-10 pr-4 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                onNavigate('library', {
                  libraryMode: 'shelves',
                  searchQuery: deskQuery,
                  transition: 'zoom-shelf',
                })
              }
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#B49A67]/40 bg-[#392A24]/70 px-4 text-xs font-semibold text-[#D6BD8A] hover:bg-[#392A24] shrink-0"
            >
              Locate on Shelves
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {deskMatches.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#B49A67]/30 bg-[#0B1120]/60 p-4 text-xs text-[#AEB9C9]">
              No matching volumes on the desk index. Check Acquisitions Wing to discover new books online.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {deskMatches.map((b) => (
                <button
                  key={b.work.id}
                  type="button"
                  onClick={() => onOpenBook(b.work.id)}
                  className="flex items-center gap-3 rounded-xl border border-[#B49A67]/25 bg-[#0B1120]/75 p-2.5 text-left hover:border-[#D6BD8A]/65 transition-colors"
                >
                  <div className="w-10 shrink-0">
                    <CoverImage
                      title={b.work.title}
                      author={b.work.authors[0]}
                      edition={b.primaryEdition}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-editorial text-sm font-semibold text-[#F4EFE6] truncate">
                      {b.work.title}
                    </p>
                    <p className="text-[11px] text-[#AEB9C9] truncate">
                      {b.work.authors.join(', ') || 'Unknown Author'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Foreground Reading Lectern */}
        <section className="lg:col-span-5 archive-panel rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-archive-display text-[10px] uppercase tracking-[0.2em] text-[#B49A67]">
                Candlelit Reading Lectern
              </p>
              <h3 className="font-archive-display text-base sm:text-lg font-bold text-[#F4EFE6]">
                {t('nav.reading')} ({currentlyReading.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reading', { transition: 'enter-wing' })}
              className="text-xs font-semibold text-[#7797C9] hover:text-[#D6BD8A]"
            >
              Open Desks →
            </button>
          </div>

          {currentlyReading.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#B49A67]/30 bg-[#0B1120]/60 p-6 text-center space-y-2">
              <BookOpen className="mx-auto h-6 w-6 text-[#B49A67]/75" />
              <p className="text-xs text-[#AEB9C9]">
                Your reading lectern is clear tonight.
              </p>
              <button
                type="button"
                onClick={() =>
                  onNavigate('library', {
                    libraryMode: 'shelves',
                    transition: 'zoom-shelf',
                  })
                }
                className="text-xs font-semibold text-[#D6BD8A] hover:underline"
              >
                Pull a volume from The Grand Stacks →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {currentlyReading.slice(0, 3).map((b) => {
                const cycle = b.activeCycle!;
                const edition =
                  b.editions.find((e) => e.id === cycle.editionId) ?? b.primaryEdition;
                return (
                  <div
                    key={b.work.id}
                    className="rounded-2xl border border-[#B49A67]/25 bg-[#0B1120]/80 p-3 flex gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenBook(b.work.id)}
                      className="w-14 shrink-0 text-left"
                    >
                      <CoverImage
                        title={b.work.title}
                        author={b.work.authors[0]}
                        edition={edition}
                      />
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenBook(b.work.id)}
                          className="text-left font-editorial text-sm font-semibold text-[#F4EFE6] line-clamp-1 hover:text-[#D6BD8A]"
                        >
                          {b.work.title}
                        </button>
                        <p className="text-[11px] text-[#AEB9C9] truncate">
                          Cycle #{cycle.cycleNumber}
                          {cycle.startedAt ? ` · Started ${cycle.startedAt}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateCycleStatus(cycle.id, 'finished')}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-600"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Finish
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCycleStatus(cycle.id, 'on_hold')}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#B49A67]/30 px-2.5 text-[11px] font-medium text-[#AEB9C9] hover:bg-[#141E30]"
                        >
                          <Pause className="h-3 w-3" />
                          Pause
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenBook(b.work.id)}
                          className="min-h-[34px] rounded-lg border border-[#B49A67]/35 px-2.5 text-[11px] font-semibold text-[#D6BD8A]"
                        >
                          Folio
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
