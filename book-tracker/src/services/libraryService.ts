import { createUuid, db } from '../db/dexie';
import type {
  AcquisitionMethod,
  BookFormat,
  CopyCondition,
  CurrencyCode,
  Edition,
  EditionIsbn,
  JournalEntry,
  JournalEntryType,
  Loan,
  LoanDirection,
  MetadataProviderName,
  OwnershipStatus,
  PhysicalCopy,
  ReadingCycle,
  ReadingProgress,
  ReadingSession,
  ReadingStatus,
  Review,
  Shelf,
  ShelfItem,
  SyncEntityType,
  SyncOperation,
  Work,
} from '../types/domain';
import { parseIsbn } from '../utils/isbn';
import { calculatePercentage, getLocalDateString } from '../utils/statsCalculator';

function nowIso(): string {
  return new Date().toISOString();
}

async function enqueueSyncOp(
  entityType: SyncEntityType,
  entityId: string,
  operation: 'upsert' | 'delete',
  payload: Record<string, unknown>,
  changedFields: string[],
  baseVersion: number
): Promise<void> {
  const op: SyncOperation = {
    opId: createUuid(),
    entityType,
    entityId,
    operation,
    payload,
    changedFields,
    baseVersion,
    createdAt: nowIso(),
    retryCount: 0,
    lastError: null,
    status: 'pending',
  };
  await db.sync_operations.put(op);
}

export interface CreateBookBundleInput {
  workId?: string; // if linking a new edition/copy to an existing Work
  work: {
    title: string;
    originalTitle?: string;
    subtitle?: string;
    authors: string[];
    illustrators?: string[];
    genres: string[];
    tags?: string[];
    description?: string;
    originalLanguage?: string;
    firstPublishedYear?: number | null;
    seriesName?: string;
    seriesIndex?: string;
    metadataSource?: MetadataProviderName;
    metadataVerified?: boolean;
  };
  edition: {
    title: string;
    subtitle?: string;
    editionName?: string;
    translationTitle?: string;
    translators?: string[];
    illustrators?: string[];
    publishers?: string[];
    publishedDate?: string;
    publishedYear?: number | null;
    language: string;
    format: BookFormat;
    pageCount?: number | null;
    seriesName?: string;
    volumeNumber?: string;
    coverUrl?: string;
    coverBlobKey?: string;
    description?: string;
    metadataSource?: MetadataProviderName;
    metadataVerified?: boolean;
  };
  isbnInput?: string;
  createCopy?: boolean;
  copy?: {
    ownershipStatus: OwnershipStatus;
    format: BookFormat;
    condition: CopyCondition;
    acquisitionMethod: AcquisitionMethod;
    purchaseDate?: string;
    purchasePrice?: number | null;
    currency?: CurrencyCode;
    seller?: string;
    shelfLocation?: string;
    copyLabel?: string;
    notes?: string;
  };
  initialReadingStatus?: ReadingStatus;
  shelfIds?: string[];
}

export async function createBookBundle(input: CreateBookBundleInput): Promise<{
  work: Work;
  edition: Edition;
  copy?: PhysicalCopy;
  cycle?: ReadingCycle;
}> {
  const ts = nowIso();
  return db.transaction(
    'rw',
    [
      db.works,
      db.editions,
      db.edition_isbns,
      db.physical_copies,
      db.reading_cycles,
      db.reading_progress,
      db.shelf_items,
      db.sync_operations,
    ],
    async () => {
      let work: Work;
      if (input.workId) {
        const existing = await db.works.get(input.workId);
        if (!existing) throw new Error('Target Work not found');
        work = existing;
      } else {
        work = {
          id: createUuid(),
          title: input.work.title.trim() || 'Untitled Book',
          originalTitle: input.work.originalTitle?.trim() || undefined,
          subtitle: input.work.subtitle?.trim() || undefined,
          authors: input.work.authors.filter(Boolean),
          illustrators: (input.work.illustrators ?? []).filter(Boolean),
          genres: input.work.genres.filter(Boolean),
          tags: (input.work.tags ?? []).filter(Boolean),
          description: input.work.description?.trim() || undefined,
          originalLanguage: input.work.originalLanguage || undefined,
          firstPublishedYear: input.work.firstPublishedYear ?? null,
          seriesName: input.work.seriesName?.trim() || undefined,
          seriesIndex: input.work.seriesIndex?.trim() || undefined,
          metadataSource: input.work.metadataSource ?? 'manual',
          metadataVerified: input.work.metadataVerified ?? true,
          userVerifiedFields: ['title', 'authors'],
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.works.put(work);
        await enqueueSyncOp(
          'works',
          work.id,
          'upsert',
          work as unknown as Record<string, unknown>,
          Object.keys(work),
          0
        );
      }

      const edition: Edition = {
        id: createUuid(),
        workId: work.id,
        title: (input.edition.title || work.title).trim(),
        subtitle: input.edition.subtitle?.trim() || undefined,
        editionName: input.edition.editionName?.trim() || undefined,
        translationTitle: input.edition.translationTitle?.trim() || undefined,
        translators: (input.edition.translators ?? []).filter(Boolean),
        illustrators: (input.edition.illustrators ?? []).filter(Boolean),
        publishers: (input.edition.publishers ?? []).filter(Boolean),
        publishedDate: input.edition.publishedDate?.trim() || undefined,
        publishedYear: input.edition.publishedYear ?? null,
        language: input.edition.language || 'vi',
        format: input.edition.format || 'paperback',
        pageCount: input.edition.pageCount ?? null,
        seriesName: input.edition.seriesName?.trim() || undefined,
        volumeNumber: input.edition.volumeNumber?.trim() || undefined,
        coverUrl: input.edition.coverUrl?.trim() || undefined,
        coverBlobKey: input.edition.coverBlobKey || undefined,
        description: input.edition.description?.trim() || undefined,
        metadataSource: input.edition.metadataSource ?? 'manual',
        metadataVerified: input.edition.metadataVerified ?? true,
        userVerifiedFields: ['title', 'language', 'format'],
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        version: 1,
      };
      await db.editions.put(edition);
      await enqueueSyncOp(
        'editions',
        edition.id,
        'upsert',
        edition as unknown as Record<string, unknown>,
        Object.keys(edition),
        0
      );

      if (input.isbnInput?.trim()) {
        const parsed = parseIsbn(input.isbnInput.trim());
        if (parsed.isValid && parsed.isbn13) {
          const isbnRow: EditionIsbn = {
            id: createUuid(),
            editionId: edition.id,
            isbn13: parsed.isbn13,
            isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
            prefixGroup: parsed.prefixGroup,
            isPrimary: true,
            createdAt: ts,
            updatedAt: ts,
            deletedAt: null,
            version: 1,
          };
          await db.edition_isbns.put(isbnRow);
          await enqueueSyncOp(
            'edition_isbns',
            isbnRow.id,
            'upsert',
            isbnRow as unknown as Record<string, unknown>,
            Object.keys(isbnRow),
            0
          );
        }
      }

      let createdCopy: PhysicalCopy | undefined;
      if (input.createCopy !== false && input.copy) {
        createdCopy = {
          id: createUuid(),
          editionId: edition.id,
          workId: work.id,
          ownershipStatus: input.copy.ownershipStatus,
          format: input.copy.format,
          condition: input.copy.condition,
          acquisitionMethod: input.copy.acquisitionMethod,
          purchaseDate: input.copy.purchaseDate || undefined,
          purchasePrice: input.copy.purchasePrice ?? null,
          currency: input.copy.currency ?? 'VND',
          seller: input.copy.seller?.trim() || undefined,
          shelfLocation: input.copy.shelfLocation?.trim() || undefined,
          copyLabel: input.copy.copyLabel?.trim() || undefined,
          notes: input.copy.notes?.trim() || undefined,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.physical_copies.put(createdCopy);
        await enqueueSyncOp(
          'physical_copies',
          createdCopy.id,
          'upsert',
          createdCopy as unknown as Record<string, unknown>,
          Object.keys(createdCopy),
          0
        );
      }

      let createdCycle: ReadingCycle | undefined;
      if (input.initialReadingStatus) {
        const status = input.initialReadingStatus;
        createdCycle = {
          id: createUuid(),
          workId: work.id,
          editionId: edition.id,
          cycleNumber: 1,
          status,
          startedAt: status === 'currently_reading' || status === 'finished' ? getLocalDateString() : null,
          finishedAt: status === 'finished' ? getLocalDateString() : null,
          targetFinishDate: null,
          dailyPageGoal: null,
          isActive: true,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.reading_cycles.put(createdCycle);
        await enqueueSyncOp(
          'reading_cycles',
          createdCycle.id,
          'upsert',
          createdCycle as unknown as Record<string, unknown>,
          Object.keys(createdCycle),
          0
        );

        const totalPages = edition.pageCount ?? 0;
        const currentPage = status === 'finished' ? totalPages : 0;
        const progress: ReadingProgress = {
          id: createUuid(),
          cycleId: createdCycle.id,
          workId: work.id,
          editionId: edition.id,
          currentPage,
          totalPages,
          percentage: calculatePercentage(currentPage, totalPages),
          lastRewoundAt: null,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.reading_progress.put(progress);
        await enqueueSyncOp(
          'reading_progress',
          progress.id,
          'upsert',
          progress as unknown as Record<string, unknown>,
          Object.keys(progress),
          0
        );
      }

      for (const shelfId of input.shelfIds ?? []) {
        const item: ShelfItem = {
          id: createUuid(),
          shelfId,
          workId: work.id,
          editionId: edition.id,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.shelf_items.put(item);
        await enqueueSyncOp(
          'shelf_items',
          item.id,
          'upsert',
          item as unknown as Record<string, unknown>,
          Object.keys(item),
          0
        );
      }

      return { work, edition, copy: createdCopy, cycle: createdCycle };
    }
  );
}

export async function updateWork(
  workId: string,
  patch: Partial<Work>
): Promise<Work> {
  return db.transaction('rw', [db.works, db.sync_operations], async () => {
    const existing = await db.works.get(workId);
    if (!existing) throw new Error('Work not found');
    const changedFields = Object.keys(patch);
    const verified = new Set([...(existing.userVerifiedFields ?? []), ...changedFields]);
    const updated: Work = {
      ...existing,
      ...patch,
      metadataVerified: true,
      userVerifiedFields: Array.from(verified),
      updatedAt: nowIso(),
      version: existing.version + 1,
    };
    await db.works.put(updated);
    await enqueueSyncOp(
      'works',
      updated.id,
      'upsert',
      updated as unknown as Record<string, unknown>,
      changedFields,
      existing.version
    );
    return updated;
  });
}

export async function updateEdition(
  editionId: string,
  patch: Partial<Edition>
): Promise<Edition> {
  return db.transaction('rw', [db.editions, db.sync_operations], async () => {
    const existing = await db.editions.get(editionId);
    if (!existing) throw new Error('Edition not found');
    const changedFields = Object.keys(patch);
    const verified = new Set([...(existing.userVerifiedFields ?? []), ...changedFields]);
    const updated: Edition = {
      ...existing,
      ...patch,
      metadataVerified: true,
      userVerifiedFields: Array.from(verified),
      updatedAt: nowIso(),
      version: existing.version + 1,
    };
    await db.editions.put(updated);
    await enqueueSyncOp(
      'editions',
      updated.id,
      'upsert',
      updated as unknown as Record<string, unknown>,
      changedFields,
      existing.version
    );
    return updated;
  });
}

export async function upsertEditionIsbn(
  editionId: string,
  rawIsbn: string
): Promise<EditionIsbn> {
  const parsed = parseIsbn(rawIsbn);
  if (!parsed.isValid || !parsed.isbn13) {
    throw new Error('Invalid ISBN-10 or ISBN-13 check digit');
  }
  const ts = nowIso();
  const row: EditionIsbn = {
    id: createUuid(),
    editionId,
    isbn13: parsed.isbn13,
    isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
    prefixGroup: parsed.prefixGroup,
    isPrimary: true,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    version: 1,
  };
  await db.transaction('rw', [db.edition_isbns, db.sync_operations], async () => {
    await db.edition_isbns.put(row);
    await enqueueSyncOp(
      'edition_isbns',
      row.id,
      'upsert',
      row as unknown as Record<string, unknown>,
      Object.keys(row),
      0
    );
  });
  return row;
}

export async function savePhysicalCopy(
  input: Omit<PhysicalCopy, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'> & {
    id?: string;
  }
): Promise<PhysicalCopy> {
  const ts = nowIso();
  return db.transaction('rw', [db.physical_copies, db.sync_operations], async () => {
    const existing = input.id ? await db.physical_copies.get(input.id) : undefined;
    const row: PhysicalCopy = existing
      ? {
          ...existing,
          ...input,
          updatedAt: ts,
          version: existing.version + 1,
        }
      : {
          ...input,
          id: input.id ?? createUuid(),
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
    await db.physical_copies.put(row);
    await enqueueSyncOp(
      'physical_copies',
      row.id,
      'upsert',
      row as unknown as Record<string, unknown>,
      Object.keys(input),
      existing?.version ?? 0
    );
    return row;
  });
}

export async function softDeleteEntity(
  entityType: SyncEntityType,
  entityId: string
): Promise<void> {
  const ts = nowIso();
  const table = db.table(entityType);
  await db.transaction('rw', [table, db.sync_operations], async () => {
    const existing = await table.get(entityId);
    if (!existing) return;
    const updated = {
      ...existing,
      deletedAt: ts,
      updatedAt: ts,
      version: (existing.version ?? 1) + 1,
    };
    await table.put(updated);
    await enqueueSyncOp(entityType, entityId, 'delete', updated, ['deletedAt'], existing.version ?? 1);
  });
}

export async function restoreSoftDeletedEntity(
  entityType: SyncEntityType,
  entityId: string
): Promise<void> {
  const ts = nowIso();
  const table = db.table(entityType);
  await db.transaction('rw', [table, db.sync_operations], async () => {
    const existing = await table.get(entityId);
    if (!existing) return;
    const updated = {
      ...existing,
      deletedAt: null,
      updatedAt: ts,
      version: (existing.version ?? 1) + 1,
    };
    await table.put(updated);
    await enqueueSyncOp(entityType, entityId, 'upsert', updated, ['deletedAt'], existing.version ?? 1);
  });
}

export async function saveLoan(
  input: Omit<Loan, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'> & {
    id?: string;
    direction: LoanDirection;
  }
): Promise<Loan> {
  const ts = nowIso();
  return db.transaction('rw', [db.loans, db.sync_operations], async () => {
    const existing = input.id ? await db.loans.get(input.id) : undefined;
    const row: Loan = existing
      ? { ...existing, ...input, updatedAt: ts, version: existing.version + 1 }
      : {
          ...input,
          id: input.id ?? createUuid(),
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
    await db.loans.put(row);
    await enqueueSyncOp(
      'loans',
      row.id,
      'upsert',
      row as unknown as Record<string, unknown>,
      Object.keys(input),
      existing?.version ?? 0
    );
    return row;
  });
}

export async function saveShelf(
  input: { id?: string; name: string; description?: string; color?: string }
): Promise<Shelf> {
  const ts = nowIso();
  return db.transaction('rw', [db.shelves, db.sync_operations], async () => {
    const existing = input.id ? await db.shelves.get(input.id) : undefined;
    const count = await db.shelves.count();
    const row: Shelf = existing
      ? {
          ...existing,
          name: input.name.trim(),
          description: input.description?.trim(),
          color: input.color ?? existing.color,
          updatedAt: ts,
          version: existing.version + 1,
        }
      : {
          id: createUuid(),
          name: input.name.trim(),
          description: input.description?.trim(),
          color: input.color ?? '#C2410C',
          sortOrder: count,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
    await db.shelves.put(row);
    await enqueueSyncOp(
      'shelves',
      row.id,
      'upsert',
      row as unknown as Record<string, unknown>,
      ['name', 'description', 'color'],
      existing?.version ?? 0
    );
    return row;
  });
}

export async function toggleWorkOnShelf(
  shelfId: string,
  workId: string,
  editionId?: string | null
): Promise<boolean> {
  const ts = nowIso();
  return db.transaction('rw', [db.shelf_items, db.sync_operations], async () => {
    const existing = await db.shelf_items
      .where('shelfId')
      .equals(shelfId)
      .filter((i) => i.workId === workId && !i.deletedAt)
      .first();

    if (existing) {
      const updated: ShelfItem = {
        ...existing,
        deletedAt: ts,
        updatedAt: ts,
        version: existing.version + 1,
      };
      await db.shelf_items.put(updated);
      await enqueueSyncOp('shelf_items', updated.id, 'delete', updated as unknown as Record<string, unknown>, ['deletedAt'], existing.version);
      return false;
    }

    const row: ShelfItem = {
      id: createUuid(),
      shelfId,
      workId,
      editionId: editionId ?? null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      version: 1,
    };
    await db.shelf_items.put(row);
    await enqueueSyncOp('shelf_items', row.id, 'upsert', row as unknown as Record<string, unknown>, Object.keys(row), 0);
    return true;
  });
}

export async function startReadingCycle(params: {
  workId: string;
  editionId: string;
  status?: ReadingStatus;
  totalPages?: number | null;
  startedAt?: string | null;
}): Promise<{ cycle: ReadingCycle; progress: ReadingProgress }> {
  const ts = nowIso();
  return db.transaction(
    'rw',
    [db.reading_cycles, db.reading_progress, db.editions, db.sync_operations],
    async () => {
      const existingCycles = await db.reading_cycles
        .where('workId')
        .equals(params.workId)
        .filter((c) => !c.deletedAt)
        .toArray();

      // Deactivate previous active cycle without deleting it
      for (const prev of existingCycles) {
        if (prev.isActive) {
          const updatedPrev: ReadingCycle = {
            ...prev,
            isActive: false,
            updatedAt: ts,
            version: prev.version + 1,
          };
          await db.reading_cycles.put(updatedPrev);
          await enqueueSyncOp(
            'reading_cycles',
            updatedPrev.id,
            'upsert',
            updatedPrev as unknown as Record<string, unknown>,
            ['isActive'],
            prev.version
          );
        }
      }

      const maxNum = existingCycles.reduce((m, c) => Math.max(m, c.cycleNumber), 0);
      const status = params.status ?? 'currently_reading';
      const edition = await db.editions.get(params.editionId);
      const totalPages = params.totalPages ?? edition?.pageCount ?? 0;

      const cycle: ReadingCycle = {
        id: createUuid(),
        workId: params.workId,
        editionId: params.editionId,
        cycleNumber: maxNum + 1,
        status,
        startedAt:
          params.startedAt !== undefined
            ? params.startedAt
            : status === 'currently_reading' || status === 'finished'
              ? getLocalDateString()
              : null,
        finishedAt: status === 'finished' ? getLocalDateString() : null,
        targetFinishDate: null,
        dailyPageGoal: null,
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        version: 1,
      };
      await db.reading_cycles.put(cycle);
      await enqueueSyncOp(
        'reading_cycles',
        cycle.id,
        'upsert',
        cycle as unknown as Record<string, unknown>,
        Object.keys(cycle),
        0
      );

      const initialPage = status === 'finished' ? totalPages : 0;
      const progress: ReadingProgress = {
        id: createUuid(),
        cycleId: cycle.id,
        workId: params.workId,
        editionId: params.editionId,
        currentPage: initialPage,
        totalPages,
        percentage: calculatePercentage(initialPage, totalPages),
        lastRewoundAt: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        version: 1,
      };
      await db.reading_progress.put(progress);
      await enqueueSyncOp(
        'reading_progress',
        progress.id,
        'upsert',
        progress as unknown as Record<string, unknown>,
        Object.keys(progress),
        0
      );

      return { cycle, progress };
    }
  );
}

export async function switchActiveCycle(workId: string, cycleId: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', [db.reading_cycles, db.sync_operations], async () => {
    const cycles = await db.reading_cycles
      .where('workId')
      .equals(workId)
      .filter((c) => !c.deletedAt)
      .toArray();
    for (const c of cycles) {
      const shouldBeActive = c.id === cycleId;
      if (c.isActive !== shouldBeActive) {
        const updated: ReadingCycle = {
          ...c,
          isActive: shouldBeActive,
          updatedAt: ts,
          version: c.version + 1,
        };
        await db.reading_cycles.put(updated);
        await enqueueSyncOp(
          'reading_cycles',
          updated.id,
          'upsert',
          updated as unknown as Record<string, unknown>,
          ['isActive'],
          c.version
        );
      }
    }
  });
}

export async function updateCycleStatus(
  cycleId: string,
  status: ReadingStatus,
  dates?: { startedAt?: string | null; finishedAt?: string | null }
): Promise<ReadingCycle> {
  const ts = nowIso();
  return db.transaction('rw', [db.reading_cycles, db.sync_operations], async () => {
    const existing = await db.reading_cycles.get(cycleId);
    if (!existing) throw new Error('Reading cycle not found');
    const startedAt =
      dates?.startedAt !== undefined
        ? dates.startedAt
        : status === 'currently_reading' && !existing.startedAt
          ? getLocalDateString()
          : existing.startedAt;
    const finishedAt =
      dates?.finishedAt !== undefined
        ? dates.finishedAt
        : status === 'finished'
          ? existing.finishedAt || getLocalDateString()
          : status === 'currently_reading'
            ? null
            : existing.finishedAt;

    const updated: ReadingCycle = {
      ...existing,
      status,
      startedAt,
      finishedAt,
      updatedAt: ts,
      version: existing.version + 1,
    };
    await db.reading_cycles.put(updated);
    await enqueueSyncOp(
      'reading_cycles',
      updated.id,
      'upsert',
      updated as unknown as Record<string, unknown>,
      ['status', 'startedAt', 'finishedAt'],
      existing.version
    );
    return updated;
  });
}

/**
 * Updates currentPage & totalPages for a cycle.
 * Explicitly allows INTENTIONAL REWINDS (currentPage < previous currentPage),
 * recording lastRewoundAt so sync & UI preserve the lower page number cleanly.
 */
export async function updateCycleProgress(params: {
  cycleId: string;
  currentPage: number;
  totalPages?: number;
  markFinishedIfComplete?: boolean;
}): Promise<ReadingProgress> {
  const ts = nowIso();
  return db.transaction(
    'rw',
    [db.reading_progress, db.reading_cycles, db.editions, db.sync_operations],
    async () => {
      const cycle = await db.reading_cycles.get(params.cycleId);
      if (!cycle) throw new Error('Cycle not found');

      let existing = await db.reading_progress
        .where('cycleId')
        .equals(params.cycleId)
        .filter((p) => !p.deletedAt)
        .first();

      const edition = await db.editions.get(cycle.editionId);
      const totalPages = Math.max(
        0,
        params.totalPages ?? existing?.totalPages ?? edition?.pageCount ?? 0
      );
      const clampedCurrent = Math.max(
        0,
        totalPages > 0 ? Math.min(params.currentPage, totalPages) : params.currentPage
      );
      const isRewind = existing ? clampedCurrent < existing.currentPage : false;

      if (!existing) {
        const created: ReadingProgress = {
          id: createUuid(),
          cycleId: cycle.id,
          workId: cycle.workId,
          editionId: cycle.editionId,
          currentPage: clampedCurrent,
          totalPages,
          percentage: calculatePercentage(clampedCurrent, totalPages),
          lastRewoundAt: null,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.reading_progress.put(created);
        await enqueueSyncOp(
          'reading_progress',
          created.id,
          'upsert',
          created as unknown as Record<string, unknown>,
          Object.keys(created),
          0
        );
        existing = created;
      } else {
        const updated: ReadingProgress = {
          ...existing,
          currentPage: clampedCurrent,
          totalPages,
          percentage: calculatePercentage(clampedCurrent, totalPages),
          lastRewoundAt: isRewind ? ts : existing.lastRewoundAt,
          updatedAt: ts,
          version: existing.version + 1,
        };
        await db.reading_progress.put(updated);
        await enqueueSyncOp(
          'reading_progress',
          updated.id,
          'upsert',
          updated as unknown as Record<string, unknown>,
          ['currentPage', 'totalPages', 'percentage', 'lastRewoundAt'],
          existing.version
        );
        existing = updated;
      }

      if (params.markFinishedIfComplete && totalPages > 0 && clampedCurrent >= totalPages && cycle.status !== 'finished') {
        const finishedCycle: ReadingCycle = {
          ...cycle,
          status: 'finished',
          finishedAt: cycle.finishedAt || getLocalDateString(),
          updatedAt: ts,
          version: cycle.version + 1,
        };
        await db.reading_cycles.put(finishedCycle);
        await enqueueSyncOp(
          'reading_cycles',
          finishedCycle.id,
          'upsert',
          finishedCycle as unknown as Record<string, unknown>,
          ['status', 'finishedAt'],
          cycle.version
        );
      }

      return existing;
    }
  );
}

export async function logOrUpdateReadingSession(params: {
  id?: string;
  cycleId: string;
  sessionDate: string;
  durationMinutes: number;
  startPage: number;
  endPage: number;
  startedAt?: string | null;
  endedAt?: string | null;
  notes?: string;
  syncProgressToEndPage?: boolean;
}): Promise<ReadingSession> {
  const ts = nowIso();
  const pagesRead = Math.max(0, params.endPage - params.startPage);

  const session = await db.transaction(
    'rw',
    [db.reading_sessions, db.reading_cycles, db.sync_operations],
    async () => {
      const cycle = await db.reading_cycles.get(params.cycleId);
      if (!cycle) throw new Error('Reading cycle not found');

      const existing = params.id ? await db.reading_sessions.get(params.id) : undefined;
      const row: ReadingSession = existing
        ? {
            ...existing,
            sessionDate: params.sessionDate,
            durationMinutes: Math.max(0, params.durationMinutes),
            startPage: Math.max(0, params.startPage),
            endPage: Math.max(0, params.endPage),
            pagesRead,
            startedAt: params.startedAt ?? existing.startedAt,
            endedAt: params.endedAt ?? existing.endedAt,
            notes: params.notes,
            updatedAt: ts,
            version: existing.version + 1,
          }
        : {
            id: createUuid(),
            cycleId: cycle.id,
            workId: cycle.workId,
            editionId: cycle.editionId,
            sessionDate: params.sessionDate || getLocalDateString(),
            startedAt: params.startedAt ?? null,
            endedAt: params.endedAt ?? null,
            durationMinutes: Math.max(0, params.durationMinutes),
            startPage: Math.max(0, params.startPage),
            endPage: Math.max(0, params.endPage),
            pagesRead,
            notes: params.notes?.trim() || undefined,
            createdAt: ts,
            updatedAt: ts,
            deletedAt: null,
            version: 1,
          };
      await db.reading_sessions.put(row);
      await enqueueSyncOp(
        'reading_sessions',
        row.id,
        'upsert',
        row as unknown as Record<string, unknown>,
        Object.keys(row),
        existing?.version ?? 0
      );
      return row;
    }
  );

  if (params.syncProgressToEndPage !== false) {
    await updateCycleProgress({
      cycleId: params.cycleId,
      currentPage: params.endPage,
      markFinishedIfComplete: true,
    });
  }
  return session;
}

export async function saveReview(input: {
  id?: string;
  workId: string;
  editionId?: string | null;
  cycleId?: string | null;
  rating: number | null;
  headline?: string;
  body: string;
  hasSpoilers: boolean;
}): Promise<Review> {
  const ts = nowIso();
  return db.transaction('rw', [db.reviews, db.sync_operations], async () => {
    const existing = input.id ? await db.reviews.get(input.id) : undefined;
    const row: Review = existing
      ? {
          ...existing,
          ...input,
          updatedAt: ts,
          version: existing.version + 1,
        }
      : {
          id: createUuid(),
          workId: input.workId,
          editionId: input.editionId ?? null,
          cycleId: input.cycleId ?? null,
          rating: input.rating,
          headline: input.headline?.trim() || undefined,
          body: input.body,
          hasSpoilers: input.hasSpoilers,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
    await db.reviews.put(row);
    await enqueueSyncOp(
      'reviews',
      row.id,
      'upsert',
      row as unknown as Record<string, unknown>,
      Object.keys(input),
      existing?.version ?? 0
    );
    return row;
  });
}

/**
 * Deletes ONLY the Review record. Reading cycles, progress, and sessions remain completely intact.
 */
export async function deleteReviewOnly(reviewId: string): Promise<void> {
  await softDeleteEntity('reviews', reviewId);
}

export async function saveJournalEntry(input: {
  id?: string;
  workId: string;
  editionId?: string | null;
  cycleId?: string | null;
  entryType: JournalEntryType;
  title?: string;
  content: string;
  quoteText?: string;
  characterName?: string;
  pageNumber?: number | null;
  chapterLabel?: string;
  hasSpoilers: boolean;
  tags?: string[];
}): Promise<JournalEntry> {
  const ts = nowIso();
  return db.transaction('rw', [db.journal_entries, db.sync_operations], async () => {
    const existing = input.id ? await db.journal_entries.get(input.id) : undefined;
    const row: JournalEntry = existing
      ? {
          ...existing,
          ...input,
          tags: input.tags ?? existing.tags,
          updatedAt: ts,
          version: existing.version + 1,
        }
      : {
          id: createUuid(),
          workId: input.workId,
          editionId: input.editionId ?? null,
          cycleId: input.cycleId ?? null,
          entryType: input.entryType,
          title: input.title?.trim() || undefined,
          content: input.content,
          quoteText: input.quoteText?.trim() || undefined,
          characterName: input.characterName?.trim() || undefined,
          pageNumber: input.pageNumber ?? null,
          chapterLabel: input.chapterLabel?.trim() || undefined,
          hasSpoilers: input.hasSpoilers,
          tags: input.tags ?? [],
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
    await db.journal_entries.put(row);
    await enqueueSyncOp(
      'journal_entries',
      row.id,
      'upsert',
      row as unknown as Record<string, unknown>,
      Object.keys(input),
      existing?.version ?? 0
    );
    return row;
  });
}
