import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BackupRecord,
  CoverAsset,
  DeviceRecord,
  Edition,
  EditionIsbn,
  JournalEntry,
  Loan,
  MetadataRecord,
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

export class BookTrackerDB extends Dexie {
  works!: Table<Work, string>;
  editions!: Table<Edition, string>;
  edition_isbns!: Table<EditionIsbn, string>;
  physical_copies!: Table<PhysicalCopy, string>;
  loans!: Table<Loan, string>;
  shelves!: Table<Shelf, string>;
  shelf_items!: Table<ShelfItem, string>;
  reading_cycles!: Table<ReadingCycle, string>;
  reading_progress!: Table<ReadingProgress, string>;
  reading_sessions!: Table<ReadingSession, string>;
  reviews!: Table<Review, string>;
  journal_entries!: Table<JournalEntry, string>;
  metadata_records!: Table<MetadataRecord, string>;
  cover_assets!: Table<CoverAsset, string>;
  sync_operations!: Table<SyncOperation, string>;
  sync_conflicts!: Table<SyncConflict, string>;
  devices!: Table<DeviceRecord, string>;
  backup_records!: Table<BackupRecord, string>;
  app_settings!: Table<AppSettings, string>;

  constructor(name = 'AniVerseBookTrackerDB') {
    super(name);
    this.version(1).stores({
      works: 'id, title, updatedAt, deletedAt, *authors, *genres, *tags',
      editions: 'id, workId, title, language, format, updatedAt, deletedAt, *publishers',
      edition_isbns: 'id, editionId, isbn13, isbn10, deletedAt',
      physical_copies: 'id, editionId, workId, ownershipStatus, format, shelfLocation, updatedAt, deletedAt',
      loans: 'id, workId, editionId, physicalCopyId, direction, status, updatedAt, deletedAt',
      shelves: 'id, name, sortOrder, deletedAt',
      shelf_items: 'id, shelfId, workId, editionId, deletedAt',
      reading_cycles: 'id, workId, editionId, status, isActive, cycleNumber, updatedAt, deletedAt',
      reading_progress: 'id, cycleId, workId, editionId, updatedAt, deletedAt',
      reading_sessions: 'id, cycleId, workId, editionId, sessionDate, updatedAt, deletedAt',
      reviews: 'id, workId, editionId, cycleId, updatedAt, deletedAt',
      journal_entries: 'id, workId, editionId, cycleId, entryType, updatedAt, deletedAt',
      metadata_records: 'id, workId, editionId, provider, isbn13, fetchedAt',
      cover_assets: 'id, editionId, syncStatus, updatedAt',
      sync_operations: 'opId, entityType, entityId, status, createdAt',
      sync_conflicts: 'id, entityType, entityId, resolvedAt, detectedAt',
      devices: 'id, isCurrent, revokedAt, lastSeenAt',
      backup_records: 'id, backupType, createdAt',
      app_settings: 'id',
    });
  }
}

export const db = new BookTrackerDB();

export function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function ensureAppSettings(): Promise<AppSettings> {
  const existing = await db.app_settings.get('default');
  if (existing) return existing;

  const deviceId = createUuid();
  const initial: AppSettings = {
    id: 'default',
    language: 'en',
    defaultCurrency: 'VND',
    dailyPageGoal: 25,
    yearlyBookGoal: 24,
    theme: 'light',
    lastSyncedSeq: 0,
    lastSyncedAt: null,
    aiCoverAssistOptIn: false,
    userId: null,
    userEmail: null,
    deviceId,
  };
  await db.app_settings.put(initial);

  const platform =
    typeof navigator !== 'undefined' ? navigator.platform || 'Web' : 'Node';
  const device: DeviceRecord = {
    id: deviceId,
    deviceName:
      typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
        ? 'Mobile Browser'
        : 'Desktop Browser',
    platform,
    appVersion: '1.0.0',
    lastSeenAt: new Date().toISOString(),
    lastSyncedSeq: 0,
    revokedAt: null,
    isCurrent: true,
  };
  await db.devices.put(device);
  return initial;
}
