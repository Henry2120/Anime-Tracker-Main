import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/dexie';
import {
  createBookBundle,
  deleteReviewOnly,
  logOrUpdateReadingSession,
  saveLoan,
  saveReview,
  startReadingCycle,
  updateCycleProgress,
} from '../src/services/libraryService';
import { calculateCycleMetrics, calculateStreaks } from '../src/utils/statsCalculator';

describe('Reading cycles, intentional rewind, session edits, loans, and safe review deletion', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('preserves multiple reading cycles, intentional progress rewinds, and recalculates edited sessions', async () => {
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

    // Advance to page 200
    await updateCycleProgress({ cycleId: cycle1!.id, currentPage: 200, totalPages: 520 });
    let prog = await db.reading_progress.where('cycleId').equals(cycle1!.id).first();
    expect(prog?.currentPage).toBe(200);
    expect(prog?.lastRewoundAt).toBeNull();

    // Intentional rewind back to page 135
    await updateCycleProgress({ cycleId: cycle1!.id, currentPage: 135, totalPages: 520 });
    prog = await db.reading_progress.where('cycleId').equals(cycle1!.id).first();
    expect(prog?.currentPage).toBe(135);
    expect(prog?.lastRewoundAt).toBeTruthy();

    // Log session and edit it
    const session = await logOrUpdateReadingSession({
      cycleId: cycle1!.id,
      sessionDate: '2026-05-01',
      durationMinutes: 60,
      startPage: 135,
      endPage: 195,
      syncProgressToEndPage: false,
    });
    expect(session.pagesRead).toBe(60);

    await logOrUpdateReadingSession({
      id: session.id,
      cycleId: cycle1!.id,
      sessionDate: '2026-05-01',
      durationMinutes: 30,
      startPage: 135,
      endPage: 195,
      syncProgressToEndPage: false,
    });

    const sessions = await db.reading_sessions.where('cycleId').equals(cycle1!.id).toArray();
    const metrics = calculateCycleMetrics(cycle1!, prog, edition, sessions);
    expect(metrics.pagesPerHour).toBe(120);

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
  });

  it('tracks borrowed books with 0 owned copies and deletes reviews without deleting reading history', async () => {
    const { work, edition, cycle } = await createBookBundle({
      work: { title: 'Dune', authors: ['Frank Herbert'], genres: ['Sci-Fi'] },
      edition: { title: 'Dune', language: 'en', format: 'hardcover', pageCount: 650 },
      createCopy: false,
      initialReadingStatus: 'finished',
    });

    const ownedCount = await db.physical_copies.where('workId').equals(work.id).count();
    expect(ownedCount).toBe(0);

    const loan = await saveLoan({
      workId: work.id,
      editionId: edition.id,
      direction: 'borrowed',
      personName: 'Minh',
      loanDate: '2026-05-02',
      status: 'active',
    });
    expect(loan.direction).toBe('borrowed');

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

  it('computes daily reading streaks accurately', () => {
    const streaks = calculateStreaks(
      [
        {
          id: '1',
          cycleId: 'c1',
          workId: 'w1',
          editionId: 'e1',
          sessionDate: '2026-05-08',
          durationMinutes: 20,
          startPage: 0,
          endPage: 20,
          pagesRead: 20,
          createdAt: '',
          updatedAt: '',
          deletedAt: null,
          version: 1,
        },
        {
          id: '2',
          cycleId: 'c1',
          workId: 'w1',
          editionId: 'e1',
          sessionDate: '2026-05-09',
          durationMinutes: 25,
          startPage: 20,
          endPage: 45,
          pagesRead: 25,
          createdAt: '',
          updatedAt: '',
          deletedAt: null,
          version: 1,
        },
        {
          id: '3',
          cycleId: 'c1',
          workId: 'w1',
          editionId: 'e1',
          sessionDate: '2026-05-10',
          durationMinutes: 15,
          startPage: 45,
          endPage: 60,
          pagesRead: 15,
          createdAt: '',
          updatedAt: '',
          deletedAt: null,
          version: 1,
        },
      ],
      '2026-05-10'
    );
    expect(streaks).toEqual({ currentStreak: 3, longestStreak: 3 });
  });
});
