import { useEffect, useState, type CSSProperties } from 'react';
import { BookOpen, Flame, Sparkles } from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type { BookshelfPosition, Shelf } from '../types/domain';
import {
  BOOKSHELF_META,
  getBooksForShelfPosition,
} from '../utils/bookshelfPlacement';
import { getDeterministicBookSpineStyle } from '../utils/bookSpine';
import type { RegisteredBookPlacementEvent } from './AddBookModal';
import { CoverImage } from './CoverImage';

export type RoomCameraViewpoint =
  | 'room'
  | 'computer'
  | 'shelf_left'
  | 'shelf_middle'
  | 'shelf_right';

interface FirstPersonLibraryRoomProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  viewpoint: RoomCameraViewpoint;
  lanternWarmth: boolean;
  onToggleLantern: () => void;
  onSelectBookshelf: (position: BookshelfPosition) => void;
  onOpenComputer: () => void;
  floatingPlacement: RegisteredBookPlacementEvent | null;
  onCompleteFloatingPlacement: () => void;
  onInspectShelfAfterPlacement: (position: BookshelfPosition) => void;
}

const SHELF_TIER_COUNT = 4;
const MAX_SPINES_PER_TIER = 9;

function PhysicalRoomBookcase({
  position,
  books,
  highlighted,
  lanternWarmth,
  className,
  onClick,
}: {
  position: BookshelfPosition;
  books: EnrichedBookRecord[];
  highlighted: boolean;
  lanternWarmth: boolean;
  className: string;
  onClick: () => void;
}) {
  const meta = BOOKSHELF_META[position];
  const tiers = Array.from({ length: SHELF_TIER_COUNT }, (_, tierIdx) =>
    books.slice(
      tierIdx * MAX_SPINES_PER_TIER,
      (tierIdx + 1) * MAX_SPINES_PER_TIER
    )
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Inspect ${meta.label} (${books.length} ${
        books.length === 1 ? 'volume' : 'volumes'
      })`}
      className={`archive-room-bookcase group absolute flex flex-col justify-between p-1.5 sm:p-2.5 text-left focus-visible:outline-2 focus-visible:outline-[#D6BD8A] focus-visible:outline-offset-2 ${className} ${
        highlighted ? 'archive-shelf-wing-target-glow' : ''
      }`}
    >
      {/* Carved Walnut Crown Cornice & Engraved Brass Library Plate */}
      <div className="relative flex flex-col items-center">
        <div
          aria-hidden="true"
          className="h-2 sm:h-3 w-[104%] -mt-1 rounded-t-sm border border-[#B49A67]/45 bg-gradient-to-b from-[#4B3429] via-[#31211A] to-[#1D130E] shadow-md"
        />
        <div className="mt-1 flex w-full items-center justify-between gap-1 px-1">
          <span className="archive-brass-plaque rounded-[3px] px-1.5 sm:px-2 py-0.5 font-archive-display text-[9px] sm:text-[10px] font-bold tracking-wider truncate">
            {meta.shortLabel.replace(' Shelf', ' Stacks')}
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] text-[#D6BD8A]/85 tabular-nums shrink-0">
            {books.length}
          </span>
        </div>
      </div>

      {/* Warm Sconce Wash on Hover / Moonlit Rim */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-2 top-8 h-24 rounded-full blur-xl transition-opacity duration-300 ${
          lanternWarmth
            ? 'bg-[#D6BD8A]/12 opacity-60 group-hover:opacity-100'
            : 'bg-[#7797C9]/14 opacity-50 group-hover:opacity-100'
        }`}
      />

      {/* Four Physical Recessed Walnut Shelf Bays */}
      <div className="relative z-10 my-1.5 flex flex-1 flex-col justify-between gap-1.5 sm:gap-2">
        {tiers.map((tierBooks, tierIdx) => (
          <div
            key={tierIdx}
            className="archive-shelf-alcove flex flex-1 flex-col justify-end rounded-[3px] px-1 sm:px-1.5 pt-1.5"
          >
            <div className="flex items-end gap-[2px] sm:gap-[3px] h-11 sm:h-14 md:h-[64px] overflow-hidden">
              {tierBooks.map((book) => {
                const spine = getDeterministicBookSpineStyle({
                  workId: book.work.id,
                  pageCount: book.primaryEdition.pageCount,
                  format: book.primaryEdition.format,
                });
                const scaledHeight = Math.max(
                  30,
                  Math.min(58, Math.round((spine.heightPx / 228) * 58))
                );
                const scaledWidth = Math.max(
                  10,
                  Math.round(spine.widthPx * 0.31)
                );

                return (
                  <span
                    key={book.work.id}
                    title={book.work.title}
                    className="inline-flex shrink-0 flex-col items-center justify-between rounded-t-[2px] border-x border-t border-[#D6BD8A]/28 py-1 px-[1px] shadow-[inset_2px_0_4px_rgba(255,255,255,0.14),inset_-3px_0_5px_rgba(0,0,0,0.55)] overflow-hidden"
                    style={{
                      background: spine.leatherBg,
                      width: `${scaledWidth}px`,
                      height: `${scaledHeight}px`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="h-[1px] w-full opacity-75"
                      style={{ backgroundColor: spine.accentBand }}
                    />
                    <span
                      className="text-[6px] sm:text-[7px] font-semibold tracking-tight leading-none truncate opacity-85"
                      style={{
                        color: spine.foilColor,
                        writingMode: 'vertical-rl',
                        maxHeight: `${scaledHeight - 10}px`,
                      }}
                    >
                      {book.work.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-[1px] w-full opacity-75"
                      style={{ backgroundColor: spine.accentBand }}
                    />
                  </span>
                );
              })}

              {/* Small brass bookend on occupied shelves */}
              {tierBooks.length > 0 && tierBooks.length < MAX_SPINES_PER_TIER && (
                <span
                  aria-hidden="true"
                  className="ml-0.5 h-6 w-1 shrink-0 rounded-t-[1px] bg-gradient-to-b from-[#C7AC76] to-[#6B5226] opacity-75"
                />
              )}
            </div>
            {/* Beveled Walnut Shelf Plank */}
            <div
              aria-hidden="true"
              className="h-1.5 sm:h-2 w-full rounded-b-[2px] border-t border-[#D6BD8A]/35 bg-gradient-to-b from-[#553D32] via-[#392820] to-[#1D130E] shadow-[0_6px_12px_rgba(0,0,0,0.8)]"
            />
          </div>
        ))}
      </div>

      {/* Plinth Baseboard */}
      <div
        aria-hidden="true"
        className="h-2 sm:h-3 w-full border-t border-[#B49A67]/25 bg-gradient-to-b from-[#2A1D17] to-[#100A08]"
      />
    </button>
  );
}

export function FirstPersonLibraryRoom({
  books,
  shelves,
  viewpoint,
  lanternWarmth,
  onToggleLantern,
  onSelectBookshelf,
  onOpenComputer,
  floatingPlacement,
  onCompleteFloatingPlacement,
  onInspectShelfAfterPlacement,
}: FirstPersonLibraryRoomProps) {
  const [flightPhase, setFlightPhase] = useState<'appear' | 'travel' | 'settle'>(
    'appear'
  );

  const leftBooks = getBooksForShelfPosition(books, shelves, 'left');
  const middleBooks = getBooksForShelfPosition(books, shelves, 'middle');
  const rightBooks = getBooksForShelfPosition(books, shelves, 'right');

  useEffect(() => {
    if (!floatingPlacement) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      setFlightPhase('settle');
      const doneTimer = window.setTimeout(onCompleteFloatingPlacement, 2600);
      return () => window.clearTimeout(doneTimer);
    }

    setFlightPhase('appear');
    const travelTimer = window.setTimeout(() => {
      setFlightPhase('travel');
    }, 320);
    const settleTimer = window.setTimeout(() => {
      setFlightPhase('settle');
    }, 1450);
    const doneTimer = window.setTimeout(() => {
      onCompleteFloatingPlacement();
    }, 3400);

    return () => {
      window.clearTimeout(travelTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(doneTimer);
    };
  }, [floatingPlacement, onCompleteFloatingPlacement]);

  const highlightedShelf = floatingPlacement ? floatingPlacement.targetShelf : null;

  const floatingTransform = !floatingPlacement
    ? ''
    : flightPhase === 'appear'
      ? 'translate3d(-50%, 6px, 0) scale(1.04) rotate(0deg)'
      : flightPhase === 'travel'
        ? floatingPlacement.targetShelf === 'left'
          ? 'translate3d(calc(-50% - 32vw), -26vh, 0) scale(0.74) rotate(-8deg)'
          : floatingPlacement.targetShelf === 'right'
            ? 'translate3d(calc(-50% + 32vw), -26vh, 0) scale(0.74) rotate(8deg)'
            : 'translate3d(-50%, -36vh, 0) scale(0.76) rotate(0deg)'
        : floatingPlacement.targetShelf === 'left'
          ? 'translate3d(calc(-50% - 34vw), -24vh, 0) scale(0.58) rotate(0deg)'
          : floatingPlacement.targetShelf === 'right'
            ? 'translate3d(calc(-50% + 34vw), -24vh, 0) scale(0.58) rotate(0deg)'
            : 'translate3d(-50%, -35vh, 0) scale(0.6) rotate(0deg)';

  const deskLightingVars = {
    '--desk-lamp-glow': lanternWarmth
      ? 'rgba(242, 198, 121, 0.28)'
      : 'rgba(119, 151, 201, 0.24)',
  } as CSSProperties;

  return (
    <div className="archive-room-stage relative h-[calc(100vh-52px)] min-h-[540px] w-full select-none">
      {/* Unified First-Person Room Camera */}
      <div
        className={`archive-room-camera archive-room-camera-${viewpoint} relative h-full w-full`}
      >
        {/* Back Stone Wall, Gothic Lancet Moonlight Window & Wainscoting */}
        <div
          aria-hidden="true"
          className="archive-back-wall pointer-events-none absolute inset-0"
        >
          <svg
            viewBox="0 0 1200 760"
            preserveAspectRatio="xMidYMid slice"
            className="h-full w-full opacity-65"
          >
            <defs>
              <linearGradient id="roomLancetGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#93B7ED" stopOpacity="0.48" />
                <stop offset="65%" stopColor="#5D73A6" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#090E1B" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="roomMoonShaft" x1="0.3" y1="0" x2="0.7" y2="1">
                <stop offset="0%" stopColor="#9BC0F5" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#090E1B" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Diagonal Moonlight Casting Into the Library */}
            <polygon
              points="475,70 725,70 960,760 360,760"
              fill="url(#roomMoonShaft)"
            />

            {/* Gothic Arched Window Behind Upper Center */}
            <path
              d="M465 360 L465 160 Q465 55 600 18 Q735 55 735 160 L735 360 Z"
              fill="url(#roomLancetGlow)"
              stroke="rgba(180,154,103,0.42)"
              strokeWidth="2.5"
            />
            <line
              x1="600"
              y1="24"
              x2="600"
              y2="360"
              stroke="rgba(19,27,46,0.85)"
              strokeWidth="4"
            />
            <circle
              cx="600"
              cy="128"
              r="42"
              fill="none"
              stroke="rgba(180,154,103,0.34)"
              strokeWidth="2"
            />

            {/* Side Wall Perspective Lines & Stone Moldings */}
            <line
              x1="0"
              y1="30"
              x2="310"
              y2="115"
              stroke="rgba(180,154,103,0.22)"
              strokeWidth="2"
            />
            <line
              x1="1200"
              y1="30"
              x2="890"
              y2="115"
              stroke="rgba(180,154,103,0.22)"
              strokeWidth="2"
            />
            <line
              x1="310"
              y1="115"
              x2="890"
              y2="115"
              stroke="rgba(180,154,103,0.18)"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        {/* Vaulted Upper Ceiling & Hanging Brass Lantern */}
        <div
          aria-hidden="true"
          className="archive-ceiling-vault pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[16%] justify-center"
        >
          <div className="animate-archive-lantern flex flex-col items-center">
            <div className="h-5 sm:h-7 w-[2px] bg-gradient-to-b from-[#B49A67] to-[#6E5629]" />
            <div
              className={`rounded-b-xl border border-[#B49A67]/65 bg-[#221712] px-2.5 py-1.5 ${
                lanternWarmth
                  ? 'shadow-[0_0_28px_rgba(242,198,121,0.5)]'
                  : 'shadow-[0_0_28px_rgba(119,151,201,0.45)]'
              }`}
            >
              <Flame
                className={`animate-archive-candle h-4 w-4 ${
                  lanternWarmth ? 'text-[#F2C679]' : 'text-[#89ACE3]'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Receding Herringbone Wood Floor Plane + Midnight Runner Rug */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[42%] overflow-hidden flex justify-center"
        >
          <div className="archive-floor-plane relative h-full w-[136%]">
            <div className="archive-floor-runner mx-auto h-full w-[28%]" />
          </div>
        </div>

        {/* THREE PHYSICAL BOOKCASES INSIDE CONTINUOUS ROOM SPACE */}
        {/* 1. Middle Bookshelf — Center Alcove standing directly behind the desk */}
        <PhysicalRoomBookcase
          position="middle"
          books={middleBooks}
          highlighted={highlightedShelf === 'middle'}
          lanternWarmth={lanternWarmth}
          className="archive-room-bookcase-middle left-1/2 top-[11%] bottom-[24%] z-10 w-[39%] sm:w-[33%] md:w-[30%] max-w-[420px]"
          onClick={() => onSelectBookshelf('middle')}
        />

        {/* 2. Left Bookshelf — West Walnut Stacks angled along the left wall */}
        <PhysicalRoomBookcase
          position="left"
          books={leftBooks}
          highlighted={highlightedShelf === 'left'}
          lanternWarmth={lanternWarmth}
          className="archive-room-bookcase-left left-[1%] sm:left-[2%] top-[5%] bottom-[11%] z-20 w-[28%] sm:w-[27%] md:w-[25%] max-w-[350px]"
          onClick={() => onSelectBookshelf('left')}
        />

        {/* 3. Right Bookshelf — East Moonlit Stacks angled along the right wall */}
        <PhysicalRoomBookcase
          position="right"
          books={rightBooks}
          highlighted={highlightedShelf === 'right'}
          lanternWarmth={lanternWarmth}
          className="archive-room-bookcase-right right-[1%] sm:right-[2%] top-[5%] bottom-[11%] z-20 w-[28%] sm:w-[27%] md:w-[25%] max-w-[350px]"
          onClick={() => onSelectBookshelf('right')}
        />

        {/* FOREGROUND SUBSTANTIAL WOODEN DESK & PHYSICAL COMPUTER WORKSTATION */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center"
          style={deskLightingVars}
        >
          <div className="pointer-events-auto relative w-[98%] max-w-[1040px]">
            {/* Physical Objects Sitting ON the Desktop Plane (Above the Desk Edge) */}
            <div className="relative z-20 mx-auto -mb-3 sm:-mb-4 flex w-[92%] items-end justify-between px-2 sm:px-6">
              {/* Desk Left: Physical Brass Banker Lamp + Inkwell */}
              <div className="flex items-end gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={onToggleLantern}
                  aria-pressed={lanternWarmth}
                  aria-label={
                    lanternWarmth
                      ? 'Banker desk lamp glowing warm amber; click to switch to moonlight'
                      : 'Banker desk lamp dimmed to moonlight; click to light warm lamp'
                  }
                  className="group relative flex min-h-[48px] min-w-[44px] flex-col items-center focus-visible:outline-2 focus-visible:outline-[#D6BD8A] rounded-lg"
                >
                  {/* Shade & Light Cone */}
                  <div
                    className={`h-5 sm:h-6 w-11 sm:w-14 rounded-t-full border transition-all ${
                      lanternWarmth
                        ? 'border-[#E6C98F] bg-gradient-to-b from-[#2A6F55] to-[#184434] shadow-[0_12px_28px_rgba(242,198,121,0.58)]'
                        : 'border-[#89ACE3]/80 bg-gradient-to-b from-[#22324F] to-[#131C30] shadow-[0_10px_24px_rgba(119,151,201,0.45)]'
                    }`}
                  />
                  {/* Curved Brass Stem & Weighted Base */}
                  <div
                    aria-hidden="true"
                    className="h-9 sm:h-11 w-1.5 bg-gradient-to-r from-[#D6BD8A] to-[#7D6234]"
                  />
                  <div
                    aria-hidden="true"
                    className="h-2 sm:h-2.5 w-9 sm:w-11 rounded-t-md border border-[#D6BD8A]/60 bg-gradient-to-b from-[#B49A67] to-[#5E4720] shadow-md"
                  />
                </button>

                {/* Turned Walnut Pen Cup & Brass Inkwell */}
                <div
                  aria-hidden="true"
                  className="hidden sm:flex items-end gap-2 pb-0.5"
                >
                  <div className="h-6 w-5 rounded-t-sm border border-[#B49A67]/40 bg-gradient-to-b from-[#3A271E] to-[#1E130E] shadow" />
                  <div className="h-4 w-4 rounded-t-full border border-[#D6BD8A]/50 bg-gradient-to-b from-[#B49A67] to-[#5C441D] shadow" />
                </div>
              </div>

              {/* Desk Center: Physical Desktop Computer Monitor & Stand */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={onOpenComputer}
                  aria-label="Open Library Computer Workstation to search catalog, scan barcodes, and add books"
                  className="archive-physical-monitor group relative flex w-[176px] sm:w-[260px] md:w-[310px] flex-col rounded-xl p-1.5 sm:p-2 focus-visible:outline-2 focus-visible:outline-[#D6BD8A] focus-visible:outline-offset-4"
                >
                  {/* Glass Terminal Display */}
                  <div className="archive-physical-screen relative flex h-[86px] sm:h-[118px] md:h-[132px] w-full flex-col justify-between overflow-hidden rounded-lg border border-[#7797C9]/30 p-2 sm:p-3 text-left">
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono text-[#7797C9]/90">
                      <span className="truncate">archive://midnight.local</span>
                      <span className="text-[#D6BD8A] opacity-85 group-hover:opacity-100">
                        Enter
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-archive-display text-[11px] sm:text-xs font-bold tracking-wider text-[#F4EFE6]">
                        <span>Archive Terminal</span>
                      </div>
                      <div className="h-[1px] w-16 bg-gradient-to-r from-[#D6BD8A]/65 to-transparent" />
                      <p className="font-mono text-[9px] sm:text-[10px] text-[#AEB9C9]/80 truncate">
                        {books.length} {books.length === 1 ? 'volume' : 'volumes'} indexed
                      </p>
                    </div>
                  </div>

                  {/* Brushed Brass Chin Plate */}
                  <div className="mt-1 flex items-center justify-center">
                    <span className="h-1 w-8 rounded-full bg-[#B49A67]/50" />
                  </div>
                </button>

                {/* Sculpted Monitor Neck & Foot */}
                <div
                  aria-hidden="true"
                  className="h-3 sm:h-4 w-7 sm:w-9 border-x border-[#B49A67]/40 bg-gradient-to-b from-[#2A201B] to-[#17110E]"
                />
                <div
                  aria-hidden="true"
                  className="h-2 w-20 sm:w-28 rounded-t-md border border-[#B49A67]/40 bg-gradient-to-b from-[#3E3026] to-[#1D1511] shadow-md"
                />
              </div>

              {/* Desk Right: Small Stack of Antique Reference Books */}
              <div
                aria-hidden="true"
                className="hidden sm:flex flex-col items-end pb-0.5"
              >
                <div className="h-3.5 w-20 rounded-l-sm border border-[#D6BD8A]/45 bg-gradient-to-r from-[#4E2228] to-[#34161A] shadow" />
                <div className="h-4 w-24 rounded-l-sm border border-[#D6BD8A]/45 bg-gradient-to-r from-[#1D3B32] to-[#11241E] shadow-md" />
              </div>
            </div>

            {/* Receding Wooden Tabletop Surface + Leather Blotter + Physical Keyboard */}
            <div className="archive-desk-surface relative rounded-t-[26px] sm:rounded-t-[36px] px-4 sm:px-10 pt-5 pb-3 sm:pt-6 sm:pb-4">
              {/* Stitched Leather Reading Blotter Centered on Desktop */}
              <div className="archive-desk-blotter relative mx-auto flex max-w-[460px] items-center justify-center gap-4 rounded-lg px-4 py-2 sm:py-2.5">
                {/* Small Parchment Folio Corner Resting on Blotter Left */}
                <div
                  aria-hidden="true"
                  className="hidden sm:block h-8 w-11 -rotate-6 rounded-[2px] border border-[#9E814D]/60 bg-gradient-to-br from-[#E2D4B3] to-[#C6B186] shadow"
                />

                {/* Physical Mechanical Keyboard Directly in Front of Monitor */}
                <button
                  type="button"
                  onClick={onOpenComputer}
                  tabIndex={-1}
                  aria-label="Desk keyboard — click to sit at computer"
                  className="archive-physical-keyboard flex h-8 sm:h-9 w-[170px] sm:w-[235px] flex-col justify-center gap-1 rounded-md px-2 py-1"
                >
                  <span
                    aria-hidden="true"
                    className="block h-1.5 w-full rounded-[1px] bg-[repeating-linear-gradient(90deg,#3D312B_0px,#3D312B_8px,#17110E_8px,#17110E_10px)]"
                  />
                  <span
                    aria-hidden="true"
                    className="block h-1.5 w-[94%] mx-auto rounded-[1px] bg-[repeating-linear-gradient(90deg,#3D312B_0px,#3D312B_9px,#17110E_9px,#17110E_11px)]"
                  />
                  <span
                    aria-hidden="true"
                    className="block h-1.5 w-[72%] mx-auto rounded-[1px] bg-[#483A33]"
                  />
                </button>

                {/* Sculpted Mouse Resting to Right of Keyboard */}
                <div
                  aria-hidden="true"
                  className="hidden sm:block h-6 w-4 rounded-full border border-[#B49A67]/40 bg-gradient-to-b from-[#2E241E] to-[#16100D] shadow"
                />
              </div>
            </div>

            {/* Thick Carved Front Edge Lip & Shadowed Knee Apron */}
            <div
              aria-hidden="true"
              className="archive-desk-front-lip h-3 sm:h-4 w-full"
            />
            <div
              aria-hidden="true"
              className="archive-desk-apron h-3 sm:h-5 w-full"
            />
          </div>
        </div>
      </div>

      {/* Physical Newly Registered Book Floating From Computer Monitor Into Target Shelf */}
      {floatingPlacement && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-40"
        >
          <div
            className="archive-floating-book pointer-events-auto absolute left-1/2 bottom-[22%] flex w-56 flex-col items-center gap-2 rounded-2xl border-2 border-[#D6BD8A]/85 bg-[#141E30]/96 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.92),0_0_32px_rgba(214,189,138,0.45)]"
            style={{
              transform: floatingTransform,
              opacity: flightPhase === 'settle' ? 0.96 : 1,
            }}
          >
            <div className="flex items-center gap-2.5 w-full">
              <div className="w-12 shrink-0 overflow-hidden rounded border border-[#D6BD8A]/50">
                <CoverImage
                  title={floatingPlacement.title}
                  author={floatingPlacement.author}
                  edition={floatingPlacement.edition}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#D6BD8A]">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  Shelving Volume
                </p>
                <p className="font-editorial text-xs font-bold text-[#F4EFE6] line-clamp-2">
                  {floatingPlacement.title}
                </p>
                <p className="text-[10px] text-[#AEB9C9] truncate">
                  → {BOOKSHELF_META[floatingPlacement.targetShelf].label}
                </p>
              </div>
            </div>
          </div>

          {flightPhase === 'settle' && (
            <div className="pointer-events-auto fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap items-center gap-3 rounded-2xl border border-[#D6BD8A]/65 bg-[#0B1120]/95 px-4 py-2.5 text-xs shadow-2xl">
              <span className="text-[#F4EFE6]">
                Placed <strong>&ldquo;{floatingPlacement.title}&rdquo;</strong> onto{' '}
                <strong className="text-[#D6BD8A]">
                  {BOOKSHELF_META[floatingPlacement.targetShelf].label}
                </strong>
                .
              </span>
              <button
                type="button"
                onClick={() =>
                  onInspectShelfAfterPlacement(floatingPlacement.targetShelf)
                }
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#B49A67] px-3 font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Inspect Shelf
              </button>
              <button
                type="button"
                onClick={onCompleteFloatingPlacement}
                className="text-[#AEB9C9] hover:text-[#F4EFE6]"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
