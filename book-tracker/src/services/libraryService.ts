import { createUuid, db } from '../db/dexie';
import type {
  AcquisitionMethod,
  BookFormat,
  BookshelfPosition,
  ContributorCredit,
  CopyCondition,
  CurrencyCode,
  Edition,
  EditionIsbn,
  FieldProvenanceEntry,
  JournalEntry,
  JournalEntryType,
  MetadataProviderName,
  OwnershipStatus,
  PhysicalCopy,
  ReadingCycle,
  ReadingStatus,
  Review,
  Shelf,
  ShelfItem,
  SyncEntityType,
  SyncOperation,
  Work,
} from '../types/domain';
import { normalizeBookshelfPosition } from '../utils/bookshelfPlacement';
import { parseBookIdentifier } from '../utils/isbn';
import { getLocalDateString } from '../utils/statsCalculator';

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
    fieldProvenance?: Record<string, FieldProvenanceEntry>;
  };
  edition: {
    title: string;
    subtitle?: string;
    editionName?: string;
    translationTitle?: string;
    translators?: string[];
    illustrators?: string[];
    editors?: string[];
    contributors?: ContributorCredit[];
    publishers?: string[];
    publishingPartner?: string;
    distributor?: string;
    publishedDate?: string;
    publishedYear?: number | null;
    language: string;
    format: BookFormat;
    pageCount?: number | null;
    seriesName?: string;
    volumeNumber?: string;
    coverUrl?: string;
    coverBlobKey?: string;
    coverStoragePath?: string;
    description?: string;
    metadataSource?: MetadataProviderName;
    metadataVerified?: boolean;
    fieldProvenance?: Record<string, FieldProvenanceEntry>;
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
    shelfPosition?: BookshelfPosition;
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
          illustrators: input.work.illustrators?.filter(Boolean),
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
          fieldProvenance: input.work.fieldProvenance,
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
        editors: (input.edition.editors ?? []).filter(Boolean),
        contributors: input.edition.contributors,
        publishers: (input.edition.publishers ?? []).filter(Boolean),
        publishingPartner: input.edition.publishingPartner?.trim() || undefined,
        distributor: input.edition.distributor?.trim() || undefined,
        publishedDate: input.edition.publishedDate?.trim() || undefined,
        publishedYear: input.edition.publishedYear ?? null,
        language: input.edition.language || 'und',
        format: input.edition.format || 'paperback',
        pageCount: input.edition.pageCount ?? null,
        seriesName: input.edition.seriesName?.trim() || undefined,
        volumeNumber: input.edition.volumeNumber?.trim() || undefined,
        coverUrl: input.edition.coverUrl?.trim() || undefined,
        coverBlobKey: input.edition.coverBlobKey || undefined,
        coverStoragePath: input.edition.coverStoragePath || undefined,
        description: input.edition.description?.trim() || undefined,
        metadataSource: input.edition.metadataSource ?? 'manual',
        metadataVerified: input.edition.metadataVerified ?? true,
        userVerifiedFields: ['title', 'language', 'format'],
        fieldProvenance: input.edition.fieldProvenance,
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
        const parsed = parseBookIdentifier(input.isbnInput.trim());
        if (parsed.isValid && parsed.normalizedId) {
          const isbnRow: EditionIsbn = {
            id: createUuid(),
            editionId: edition.id,
            isbn13: parsed.normalizedId,
            isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
            ean13: parsed.ean13,
            identifierType: parsed.identifierType,
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
          shelfLocation:
            input.copy.shelfLocation?.trim() ||
            input.copy.shelfPosition ||
            undefined,
          shelfPosition: input.copy.shelfPosition,
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
  const parsed = parseBookIdentifier(rawIsbn);
  if (!parsed.isValid || !parsed.normalizedId) {
    throw new Error(parsed.errorReason ?? 'Invalid ISBN-10, ISBN-13, or EAN-13 check digit');
  }
  const ts = nowIso();
  const row: EditionIsbn = {
    id: createUuid(),
    editionId,
    isbn13: parsed.normalizedId,
    isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
    ean13: parsed.ean13,
    identifierType: parsed.identifierType,
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

export async function saveShelf(
  input: {
    id?: string;
    name: string;
    description?: string;
    color?: string;
    position?: BookshelfPosition;
  }
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
          position: input.position ?? existing.position,
          updatedAt: ts,
          version: existing.version + 1,
        }
      : {
          id: createUuid(),
          name: input.name.trim(),
          description: input.description?.trim(),
          color: input.color ?? '#C2410C',
          sortOrder: count,
          position: input.position,
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
      ['name', 'description', 'color', 'position'],
      existing?.version ?? 0
    );
    return row;
  });
}

const WING_SHELF_TITLES: Record<BookshelfPosition, string> = {
  left: 'Left Bookshelf',
  middle: 'Middle Bookshelf',
  right: 'Right Bookshelf',
};

/**
 * Moves or assigns a physical copy (or a 0-copy Work via a wing Shelf) to a physical
 * library bookshelf ('left' | 'middle' | 'right') and persists to IndexedDB + sync queue.
 */
export async function assignBookToShelfPosition(params: {
  workId: string;
  editionId?: string | null;
  copyId?: string;
  position: BookshelfPosition;
}): Promise<void> {
  const ts = nowIso();
  await db.transaction(
    'rw',
    [db.physical_copies, db.shelves, db.shelf_items, db.sync_operations],
    async () => {
      const workCopies = await db.physical_copies
        .where('workId')
        .equals(params.workId)
        .filter((c) => !c.deletedAt)
        .toArray();

      const targetCopy = params.copyId
        ? workCopies.find((c) => c.id === params.copyId)
        : workCopies.find(
            (c) =>
              c.ownershipStatus !== 'sold' &&
              c.ownershipStatus !== 'given_away' &&
              c.ownershipStatus !== 'lost'
          ) ?? workCopies[0];

      if (targetCopy) {
        const shouldReplaceLocation =
          !targetCopy.shelfLocation ||
          Boolean(normalizeBookshelfPosition(targetCopy.shelfLocation));
        const updated: PhysicalCopy = {
          ...targetCopy,
          shelfPosition: params.position,
          shelfLocation: shouldReplaceLocation
            ? params.position
            : targetCopy.shelfLocation,
          updatedAt: ts,
          version: targetCopy.version + 1,
        };
        await db.physical_copies.put(updated);
        await enqueueSyncOp(
          'physical_copies',
          updated.id,
          'upsert',
          updated as unknown as Record<string, unknown>,
          ['shelfPosition', 'shelfLocation'],
          targetCopy.version
        );
        return;
      }

      // If the work currently has 0 physical copies, assign via a canonical wing shelf
      const activeShelves = await db.shelves
        .filter((s) => !s.deletedAt)
        .toArray();
      let targetShelf = activeShelves.find(
        (s) =>
          s.position === params.position ||
          normalizeBookshelfPosition(s.name) === params.position
      );
      if (!targetShelf) {
        targetShelf = {
          id: createUuid(),
          name: WING_SHELF_TITLES[params.position],
          color: '#B49A67',
          sortOrder: activeShelves.length,
          position: params.position,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.shelves.put(targetShelf);
        await enqueueSyncOp(
          'shelves',
          targetShelf.id,
          'upsert',
          targetShelf as unknown as Record<string, unknown>,
          ['name', 'color', 'position'],
          0
        );
      }

      // Remove existing wing shelf items for this work so moving shelves is clean
      const wingShelfIds = new Set(
        activeShelves
          .filter((s) => s.position || normalizeBookshelfPosition(s.name))
          .map((s) => s.id)
      );
      const existingItems = await db.shelf_items
        .where('workId')
        .equals(params.workId)
        .filter((si) => !si.deletedAt && wingShelfIds.has(si.shelfId))
        .toArray();

      let alreadyOnTarget = false;
      for (const item of existingItems) {
        if (item.shelfId === targetShelf.id) {
          alreadyOnTarget = true;
          continue;
        }
        const deletedItem: ShelfItem = {
          ...item,
          deletedAt: ts,
          updatedAt: ts,
          version: item.version + 1,
        };
        await db.shelf_items.put(deletedItem);
        await enqueueSyncOp(
          'shelf_items',
          deletedItem.id,
          'delete',
          deletedItem as unknown as Record<string, unknown>,
          ['deletedAt'],
          item.version
        );
      }

      if (!alreadyOnTarget) {
        const newItem: ShelfItem = {
          id: createUuid(),
          shelfId: targetShelf.id,
          workId: params.workId,
          editionId: params.editionId ?? null,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          version: 1,
        };
        await db.shelf_items.put(newItem);
        await enqueueSyncOp(
          'shelf_items',
          newItem.id,
          'upsert',
          newItem as unknown as Record<string, unknown>,
          Object.keys(newItem),
          0
        );
      }
    }
  );
}

export async function deleteShelf(shelfId: string): Promise<void> {
  const ts = nowIso();
  await db.transaction('rw', [db.shelves, db.shelf_items, db.sync_operations], async () => {
    const shelf = await db.shelves.get(shelfId);
    if (shelf && !shelf.deletedAt) {
      const updatedShelf: Shelf = {
        ...shelf,
        deletedAt: ts,
        updatedAt: ts,
        version: shelf.version + 1,
      };
      await db.shelves.put(updatedShelf);
      await enqueueSyncOp(
        'shelves',
        shelf.id,
        'delete',
        updatedShelf as unknown as Record<string, unknown>,
        ['deletedAt'],
        shelf.version
      );
    }

    const items = await db.shelf_items
      .where('shelfId')
      .equals(shelfId)
      .filter((i) => !i.deletedAt)
      .toArray();
    for (const item of items) {
      const updatedItem: ShelfItem = {
        ...item,
        deletedAt: ts,
        updatedAt: ts,
        version: item.version + 1,
      };
      await db.shelf_items.put(updatedItem);
      await enqueueSyncOp(
        'shelf_items',
        item.id,
        'delete',
        updatedItem as unknown as Record<string, unknown>,
        ['deletedAt'],
        item.version
      );
    }
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
  startedAt?: string | null;
}): Promise<{ cycle: ReadingCycle }> {
  const ts = nowIso();
  return db.transaction(
    'rw',
    [db.reading_cycles, db.sync_operations],
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

      return { cycle };
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
 * Deletes ONLY the Review record. Reading cycles and journal notes remain completely intact.
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
