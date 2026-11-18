import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureAppSettings } from '../db/dexie';
import type {
  AppSettings,
  BackupRecord,
  DeviceRecord,
  Edition,
  EditionIsbn,
  JournalEntry,
  Loan,
  PhysicalCopy,
  ReadingCycle,
  ReadingProgress,
  ReadingSession,
  Review,
  Shelf,
  ShelfItem,
  SyncConflict,
  SyncOperation,
  Work,
} from '../types/domain';

export interface EnrichedBookRecord {
  work: Work;
  editions: Edition[];
  primaryEdition: Edition;
  isbns: EditionIsbn[];
  copies: PhysicalCopy[];
  ownedCopiesCount: number;
  wishlistCopiesCount: number;
  loans: Loan[];
  activeLoansCount: number;
  cycles: ReadingCycle[];
  activeCycle: ReadingCycle | undefined;
  activeProgress: ReadingProgress | undefined;
  sessions: ReadingSession[];
  reviews: Review[];
  journalEntries: JournalEntry[];
  shelfIds: string[];
  latestRating: number | null;
}

export function useLibrarySnapshot() {
  const settings = useLiveQuery(async () => ensureAppSettings(), []);
  const works = useLiveQuery(() => db.works.filter((w) => !w.deletedAt).toArray(), []) ?? [];
  const editions = useLiveQuery(() => db.editions.filter((e) => !e.deletedAt).toArray(), []) ?? [];
  const editionIsbns =
    useLiveQuery(() => db.edition_isbns.filter((i) => !i.deletedAt).toArray(), []) ?? [];
  const physicalCopies =
    useLiveQuery(() => db.physical_copies.filter((c) => !c.deletedAt).toArray(), []) ?? [];
  const loans = useLiveQuery(() => db.loans.filter((l) => !l.deletedAt).toArray(), []) ?? [];
  const shelves =
    useLiveQuery(
      () => db.shelves.filter((s) => !s.deletedAt).sortBy('sortOrder'),
      []
    ) ?? [];
  const shelfItems =
    useLiveQuery(() => db.shelf_items.filter((i) => !i.deletedAt).toArray(), []) ?? [];
  const cycles =
    useLiveQuery(() => db.reading_cycles.filter((c) => !c.deletedAt).toArray(), []) ?? [];
  const progressList =
    useLiveQuery(() => db.reading_progress.filter((p) => !p.deletedAt).toArray(), []) ?? [];
  const sessions =
    useLiveQuery(() => db.reading_sessions.filter((s) => !s.deletedAt).toArray(), []) ?? [];
  const reviews = useLiveQuery(() => db.reviews.filter((r) => !r.deletedAt).toArray(), []) ?? [];
  const journalEntries =
    useLiveQuery(() => db.journal_entries.filter((j) => !j.deletedAt).toArray(), []) ?? [];
  const pendingOps = useLiveQuery(() => db.sync_operations.toArray(), []) ?? [];
  const unresolvedConflicts =
    useLiveQuery(() => db.sync_conflicts.filter((c) => !c.resolvedAt).toArray(), []) ?? [];
  const devices = useLiveQuery(() => db.devices.toArray(), []) ?? [];
  const backupRecords =
    useLiveQuery(() => db.backup_records.orderBy('createdAt').reverse().toArray(), []) ?? [];

  const books: EnrichedBookRecord[] = works.map((work) => {
    const workEditions = editions.filter((e) => e.workId === work.id);
    const workCopies = physicalCopies.filter((c) => c.workId === work.id);
    const workCycles = cycles
      .filter((c) => c.workId === work.id)
      .sort((a, b) => b.cycleNumber - a.cycleNumber);
    const activeCycle = workCycles.find((c) => c.isActive) ?? workCycles[0];
    const activeProgress = activeCycle
      ? progressList.find((p) => p.cycleId === activeCycle.id)
      : undefined;

    const primaryEdition =
      (activeCycle && workEditions.find((e) => e.id === activeCycle.editionId)) ||
      (workCopies[0] && workEditions.find((e) => e.id === workCopies[0].editionId)) ||
      workEditions[0] || {
        id: work.id,
        workId: work.id,
        title: work.title,
        translators: [],
        publishers: [],
        language: work.originalLanguage || 'vi',
        format: 'paperback',
        metadataSource: work.metadataSource,
        metadataVerified: work.metadataVerified,
        userVerifiedFields: [],
        createdAt: work.createdAt,
        updatedAt: work.updatedAt,
        deletedAt: null,
        version: 1,
      };

    const editionIds = new Set(workEditions.map((e) => e.id));
    const isbns = editionIsbns.filter((i) => editionIds.has(i.editionId));
    const workLoans = loans.filter((l) => l.workId === work.id);
    const workSessions = sessions
      .filter((s) => s.workId === work.id)
      .sort((a, b) => (b.sessionDate + b.createdAt).localeCompare(a.sessionDate + a.createdAt));
    const workReviews = reviews
      .filter((r) => r.workId === work.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const workJournal = journalEntries
      .filter((j) => j.workId === work.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const workShelfIds = shelfItems
      .filter((si) => si.workId === work.id)
      .map((si) => si.shelfId);

    const latestRated = workReviews.find((r) => r.rating != null);

    return {
      work,
      editions: workEditions,
      primaryEdition,
      isbns,
      copies: workCopies,
      ownedCopiesCount: workCopies.filter((c) => c.ownershipStatus === 'owned').length,
      wishlistCopiesCount: workCopies.filter((c) => c.ownershipStatus === 'wishlist').length,
      loans: workLoans,
      activeLoansCount: workLoans.filter((l) => l.status === 'active' || l.status === 'overdue').length,
      cycles: workCycles,
      activeCycle,
      activeProgress,
      sessions: workSessions,
      reviews: workReviews,
      journalEntries: workJournal,
      shelfIds: workShelfIds,
      latestRating: latestRated?.rating ?? null,
    };
  });

  return {
    settings: settings as AppSettings | undefined,
    books,
    works,
    editions,
    editionIsbns,
    physicalCopies,
    loans,
    shelves: shelves as Shelf[],
    shelfItems: shelfItems as ShelfItem[],
    cycles,
    progressList,
    sessions,
    reviews,
    journalEntries,
    pendingOps: pendingOps as SyncOperation[],
    unresolvedConflicts: unresolvedConflicts as SyncConflict[],
    devices: devices as DeviceRecord[],
    backupRecords: backupRecords as BackupRecord[],
  };
}
