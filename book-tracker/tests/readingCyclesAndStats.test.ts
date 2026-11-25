import 'fake-indexeddb/auto';
import { liveQuery } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureAppSettings } from '../src/db/dexie';
import {
  createBookBundle,
  deleteReviewOnly,
  saveReview,
  startReadingCycle,
  switchActiveCycle,
  updateCycleStatus,
} from '../src/services/libraryService';
import { computeLibraryStatistics } from '../src/utils/statsCalculator';

describe('Reading cycles, re-reads, stats, and safe review deletion', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('reads app_settings cleanly via read-only liveQuery after ensureAppSettings()', async () => {
    const seeded = await ensureAppSettings();
    expect(seeded.id).toBe('default');
    expect(seeded.defaultCurrency).toBe('VND');

    const observed = await new Promise((resolve, reject) => {
      const sub = liveQuery(() => db.app_settings.get('default')).subscribe({
        next: (val) => {
          if (val) {
            sub.unsubscribe();
            resolve(val);
          }
        },
        error: (err) => {
          sub.unsubscribe();
          reject(err);
        },
      });
    });
    expect((observed as { defaultCurrency: string }).defaultCurrency).toBe('VND');
  });

  it('preserves multiple reading cycles, cycle status transitions, re-reads, and active cycle switching', async () => {
    const { work, edition, cycle: cycle1 } = await createBookBundle({
      work: { title: 'Kafka on the Shore', authors: ['Haruki Murakami'], genres: ['Fiction'] },
      edition: { title: 'Kafka bên bờ biển', language: 'vi', format: 'paperback', pageCount: 520 },
      copy: {
        ownershipStatus: 'owned',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
        purchasePrice: 185000,
        currency: 'VND',
      },
      initialReadingStatus: 'currently_reading',
    });

    expect(cycle1).toBeDefined();

    // Finish first reading cycle with explicit finished date
    await updateCycleStatus(cycle1!.id, 'finished', {
      startedAt: '2026-04-01',
      finishedAt: '2026-05-01',
    });
    const finishedC1 = await db.reading_cycles.get(cycle1!.id);
    expect(finishedC1?.status).toBe('finished');
    expect(finishedC1?.finishedAt).toBe('2026-05-01');

    // Start a second reading cycle (re-read) without deleting cycle 1
    const { cycle: cycle2 } = await startReadingCycle({
      workId: work.id,
      editionId: edition.id,
      status: 'currently_reading',
    });
    expect(cycle2.cycleNumber).toBe(2);

    const allCycles = await db.reading_cycles.where('workId').equals(work.id).toArray();
    expect(allCycles).toHaveLength(2);
    expect(allCycles.find((c) => c.id === cycle1!.id)?.isActive).toBe(false);
    expect(allCycles.find((c) => c.id === cycle2.id)?.isActive).toBe(true);

    // Switching active cycle keeps both cycles intact
    await switchActiveCycle(work.id, cycle1!.id);
    const updatedCycles = await db.reading_cycles.where('workId').equals(work.id).toArray();
    expect(updatedCycles.find((c) => c.id === cycle1!.id)?.isActive).toBe(true);
    expect(updatedCycles.find((c) => c.id === cycle2.id)?.isActive).toBe(false);
  });

  it('tracks works with 0 copies and deletes reviews without deleting reading history', async () => {
    const { work, edition, cycle } = await createBookBundle({
      work: { title: 'Dune', authors: ['Frank Herbert'], genres: ['Sci-Fi'] },
      edition: { title: 'Dune', language: 'en', format: 'hardcover', pageCount: 650 },
      createCopy: false,
      initialReadingStatus: 'finished',
    });

    const ownedCount = await db.physical_copies.where('workId').equals(work.id).count();
    expect(ownedCount).toBe(0);

    const review = await saveReview({
      workId: work.id,
      editionId: edition.id,
      cycleId: cycle!.id,
      rating: 5,
      body: 'Masterpiece.',
      hasSpoilers: false,
    });

    await deleteReviewOnly(review.id);

    const softDeletedReview = await db.reviews.get(review.id);
    expect(softDeletedReview?.deletedAt).toBeTruthy();

    const survivingCycles = await db.reading_cycles
      .where('workId')
      .equals(work.id)
      .filter((c) => !c.deletedAt)
      .toArray();
    expect(survivingCycles).toHaveLength(1);
  });

  it('computes finished books, monthly finished series, owned copies, and wishlist counts accurately', async () => {
    await createBookBundle({
      work: { title: 'Book A', authors: ['Author A'], genres: ['Philosophy'] },
      edition: { title: 'Book A', language: 'vi', format: 'paperback', pageCount: 300 },
      copy: {
        ownershipStatus: 'owned',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
        purchasePrice: 120000,
        currency: 'VND',
      },
      initialReadingStatus: 'finished',
    });

    await createBookBundle({
      work: { title: 'Book B', authors: ['Author B'], genres: ['History'] },
      edition: { title: 'Book B', language: 'en', format: 'paperback', pageCount: 250 },
      copy: {
        ownershipStatus: 'wishlist',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
      },
      initialReadingStatus: 'want_to_read',
    });

    const [works, editions, copies, cycles] = await Promise.all([
      db.works.toArray(),
      db.editions.toArray(),
      db.physical_copies.toArray(),
      db.reading_cycles.toArray(),
    ]);

    const stats = computeLibraryStatistics({ works, editions, copies, cycles });
    expect(stats.finishedUniqueWorksCount).toBe(1);
    expect(stats.finishedCyclesCount).toBe(1);
    expect(stats.ownedCopiesCount).toBe(1);
    expect(stats.wishlistCopiesCount).toBe(1);
    expect(stats.collectionSpendByCurrency.VND).toBe(120000);
    expect(stats.monthlyFinishedSeries).toHaveLength(12);
    expect(stats.monthlyFinishedSeries.reduce((s, m) => s + m.booksFinished, 0)).toBe(1);
  });
});
