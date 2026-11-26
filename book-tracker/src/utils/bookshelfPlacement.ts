import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type { BookshelfPosition, PhysicalCopy, Shelf } from '../types/domain';

export const BOOKSHELF_POSITIONS: readonly BookshelfPosition[] = [
  'left',
  'middle',
  'right',
] as const;

export interface BookshelfMeta {
  position: BookshelfPosition;
  label: string;
  shortLabel: string;
  subtitle: string;
}

export const BOOKSHELF_META: Record<BookshelfPosition, BookshelfMeta> = {
  left: {
    position: 'left',
    label: 'Left Bookshelf',
    shortLabel: 'Left Shelf',
    subtitle: 'West Walnut Stacks',
  },
  middle: {
    position: 'middle',
    label: 'Middle Bookshelf',
    shortLabel: 'Middle Shelf',
    subtitle: 'Center Alcove Behind Desk',
  },
  right: {
    position: 'right',
    label: 'Right Bookshelf',
    shortLabel: 'Right Shelf',
    subtitle: 'East Moonlit Stacks',
  },
};

export function normalizeBookshelfPosition(
  raw?: string | null
): BookshelfPosition | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (
    v === 'left' ||
    v === 'left shelf' ||
    v === 'left bookshelf' ||
    v === 'west' ||
    v === 'west wing'
  ) {
    return 'left';
  }
  if (
    v === 'middle' ||
    v === 'center' ||
    v === 'middle shelf' ||
    v === 'middle bookshelf' ||
    v === 'center alcove'
  ) {
    return 'middle';
  }
  if (
    v === 'right' ||
    v === 'right shelf' ||
    v === 'right bookshelf' ||
    v === 'east' ||
    v === 'east wing'
  ) {
    return 'right';
  }
  return null;
}

export function getShelfPositionForShelf(shelf: Shelf): BookshelfPosition {
  if (shelf.position) return shelf.position;
  const fromName = normalizeBookshelfPosition(shelf.name);
  if (fromName) return fromName;
  const idx = Math.abs(Math.floor(shelf.sortOrder || 0)) % 3;
  return BOOKSHELF_POSITIONS[idx];
}

export function getCopyBookshelfPosition(
  copy: Pick<PhysicalCopy, 'shelfPosition' | 'shelfLocation'>
): BookshelfPosition | null {
  if (copy.shelfPosition) return copy.shelfPosition;
  return normalizeBookshelfPosition(copy.shelfLocation);
}

/**
 * Resolves every physical bookshelf ('left' | 'middle' | 'right') where a book
 * currently resides based on real persisted PhysicalCopy and Shelf/ShelfItem records.
 * Supports multiple physical copies of the same Work placed across distinct shelves.
 */
export function getBookShelfPositions(
  book: EnrichedBookRecord,
  shelves: Shelf[]
): BookshelfPosition[] {
  const positions = new Set<BookshelfPosition>();

  const activeCopies = book.copies.filter(
    (c) =>
      c.ownershipStatus !== 'sold' &&
      c.ownershipStatus !== 'given_away' &&
      c.ownershipStatus !== 'lost'
  );
  const copiesToInspect = activeCopies.length > 0 ? activeCopies : book.copies;

  for (const copy of copiesToInspect) {
    const pos = getCopyBookshelfPosition(copy);
    if (pos) positions.add(pos);
  }

  for (const shelfId of book.shelfIds) {
    const shelf = shelves.find((s) => s.id === shelfId);
    if (shelf) {
      positions.add(getShelfPositionForShelf(shelf));
    }
  }

  if (positions.size === 0) {
    positions.add('middle');
  }

  return BOOKSHELF_POSITIONS.filter((pos) => positions.has(pos));
}

export function getPrimaryBookshelfPosition(
  book: EnrichedBookRecord,
  shelves: Shelf[]
): BookshelfPosition {
  return getBookShelfPositions(book, shelves)[0] ?? 'middle';
}

export function getBooksForShelfPosition(
  books: EnrichedBookRecord[],
  shelves: Shelf[],
  position: BookshelfPosition
): EnrichedBookRecord[] {
  return books.filter((book) => getBookShelfPositions(book, shelves).includes(position));
}

export function countCopiesOnShelfPosition(
  book: EnrichedBookRecord,
  position: BookshelfPosition
): number {
  const activeCopies = book.copies.filter(
    (c) =>
      c.ownershipStatus !== 'sold' &&
      c.ownershipStatus !== 'given_away' &&
      c.ownershipStatus !== 'lost'
  );
  if (activeCopies.length === 0) return 0;
  return activeCopies.filter((c) => {
    const resolved = getCopyBookshelfPosition(c) ?? 'middle';
    return resolved === position;
  }).length;
}
