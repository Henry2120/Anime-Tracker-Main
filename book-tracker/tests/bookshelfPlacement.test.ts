import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/dexie';
import type { EnrichedBookRecord } from '../src/hooks/useLibraryData';
import {
  assignBookToShelfPosition,
  createBookBundle,
  savePhysicalCopy,
  saveShelf,
} from '../src/services/libraryService';
import type { PhysicalCopy, Shelf } from '../src/types/domain';
import {
  countCopiesOnShelfPosition,
  getBookShelfPositions,
  getBooksForShelfPosition,
  normalizeBookshelfPosition,
} from '../src/utils/bookshelfPlacement';

async function clearAllTables() {
  await Promise.all([
    db.works.clear(),
    db.editions.clear(),
    db.edition_isbns.clear(),
    db.physical_copies.clear(),
    db.shelves.clear(),
    db.shelf_items.clear(),
    db.reading_cycles.clear(),
    db.sync_operations.clear(),
  ]);
}

async function buildSnapshotFromDb(): Promise<{
  books: EnrichedBookRecord[];
  shelves: Shelf[];
}> {
  const [works, editions, isbns, copies, shelves, shelfItems] = await Promise.all([
    db.works.filter((w) => !w.deletedAt).toArray(),
    db.editions.filter((e) => !e.deletedAt).toArray(),
    db.edition_isbns.filter((i) => !i.deletedAt).toArray(),
    db.physical_copies.filter((c) => !c.deletedAt).toArray(),
    db.shelves.filter((s) => !s.deletedAt).sortBy('sortOrder'),
    db.shelf_items.filter((si) => !si.deletedAt).toArray(),
  ]);

  const books: EnrichedBookRecord[] = works.map((work) => {
    const workEditions = editions.filter((e) => e.workId === work.id);
    const workCopies = copies.filter((c) => c.workId === work.id);
    const primaryEdition = workEditions[0];
    const editionIds = new Set(workEditions.map((e) => e.id));
    return {
      work,
      editions: workEditions,
      primaryEdition,
      isbns: isbns.filter((i) => editionIds.has(i.editionId)),
      copies: workCopies,
      ownedCopiesCount: workCopies.filter((c) => c.ownershipStatus === 'owned').length,
      wishlistCopiesCount: workCopies.filter((c) => c.ownershipStatus === 'wishlist').length,
      cycles: [],
      activeCycle: undefined,
      reviews: [],
      journalEntries: [],
      shelfIds: shelfItems.filter((si) => si.workId === work.id).map((si) => si.shelfId),
      latestRating: null,
    };
  });

  return { books, shelves };
}

describe('First-Person Library Physical Bookshelf Placement', () => {
  afterEach(async () => {
    await clearAllTables();
  });

  it('normalizes shelf position strings cleanly without altering custom locations', () => {
    expect(normalizeBookshelfPosition('left')).toBe('left');
    expect(normalizeBookshelfPosition('Left Bookshelf')).toBe('left');
    expect(normalizeBookshelfPosition('CENTER')).toBe('middle');
    expect(normalizeBookshelfPosition('Right Shelf')).toBe('right');
    expect(normalizeBookshelfPosition('Case A / Row 2')).toBeNull();
  });

  it('persists newly registered book to chosen left/middle/right shelf and supports multi-copy placement without duplicate works', async () => {
    const created = await createBookBundle({
      work: {
        title: 'Số Đỏ',
        authors: ['Vũ Trọng Phụng'],
        genres: ['Classic'],
      },
      edition: {
        title: 'Số Đỏ (Bản Kỷ Niệm)',
        language: 'vi',
        format: 'hardcover',
      },
      createCopy: true,
      copy: {
        ownershipStatus: 'owned',
        format: 'hardcover',
        condition: 'new',
        acquisitionMethod: 'purchased',
        shelfPosition: 'left',
        shelfLocation: 'left',
      },
    });

    // Add second physical copy of the SAME Work/Edition on the right bookshelf
    await savePhysicalCopy({
      workId: created.work.id,
      editionId: created.edition.id,
      ownershipStatus: 'owned',
      format: 'paperback',
      condition: 'like_new',
      acquisitionMethod: 'gift',
      currency: 'USD',
      shelfPosition: 'right',
      shelfLocation: 'right',
    });

    const snapshot = await buildSnapshotFromDb();
    expect(snapshot.books).toHaveLength(1);
    expect(snapshot.books[0].copies).toHaveLength(2);

    const positions = getBookShelfPositions(snapshot.books[0], snapshot.shelves);
    expect(positions).toEqual(['left', 'right']);
    expect(getBooksForShelfPosition(snapshot.books, snapshot.shelves, 'left')).toHaveLength(1);
    expect(getBooksForShelfPosition(snapshot.books, snapshot.shelves, 'middle')).toHaveLength(0);
    expect(getBooksForShelfPosition(snapshot.books, snapshot.shelves, 'right')).toHaveLength(1);
    expect(countCopiesOnShelfPosition(snapshot.books[0], 'left')).toBe(1);
    expect(countCopiesOnShelfPosition(snapshot.books[0], 'right')).toBe(1);
  });

  it('moves both physical-copy books and 0-copy works across left, middle, and right shelves persistently', async () => {
    const withCopy = await createBookBundle({
      work: {
        title: 'Dế Mèn Phiêu Lưu Ký',
        authors: ['Tô Hoài'],
        genres: ['Children'],
      },
      edition: {
        title: 'Dế Mèn Phiêu Lưu Ký',
        language: 'vi',
        format: 'paperback',
      },
      createCopy: true,
      copy: {
        ownershipStatus: 'owned',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
        shelfPosition: 'middle',
      },
    });

    const zeroCopy = await createBookBundle({
      work: {
        title: 'Digital Light Novel',
        authors: ['Author A'],
        genres: ['Fantasy'],
      },
      edition: {
        title: 'Digital Light Novel Vol 1',
        language: 'ja',
        format: 'ebook',
      },
      createCopy: false,
    });

    await assignBookToShelfPosition({
      workId: withCopy.work.id,
      editionId: withCopy.edition.id,
      position: 'right',
    });

    await assignBookToShelfPosition({
      workId: zeroCopy.work.id,
      editionId: zeroCopy.edition.id,
      position: 'left',
    });

    const snap1 = await buildSnapshotFromDb();
    expect(getBooksForShelfPosition(snap1.books, snap1.shelves, 'right').map((b) => b.work.id)).toEqual([
      withCopy.work.id,
    ]);
    expect(getBooksForShelfPosition(snap1.books, snap1.shelves, 'left').map((b) => b.work.id)).toEqual([
      zeroCopy.work.id,
    ]);

    // Move zero-copy work again from left -> middle and verify wing shelf item doesn't leave it stuck on left
    await assignBookToShelfPosition({
      workId: zeroCopy.work.id,
      editionId: zeroCopy.edition.id,
      position: 'middle',
    });

    const snap2 = await buildSnapshotFromDb();
    expect(getBooksForShelfPosition(snap2.books, snap2.shelves, 'left')).toHaveLength(0);
    expect(getBooksForShelfPosition(snap2.books, snap2.shelves, 'middle').map((b) => b.work.id)).toEqual([
      zeroCopy.work.id,
    ]);

    // Custom shelf mapping also respects explicit shelf position
    const customShelf = await saveShelf({ name: 'Special Folios', position: 'left' });
    expect(customShelf.position).toBe('left');
    const copyList: PhysicalCopy[] = await db.physical_copies.toArray();
    expect(copyList.find((c) => c.workId === withCopy.work.id)?.shelfPosition).toBe('right');
  });
});
