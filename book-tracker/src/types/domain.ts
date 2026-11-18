export type OwnershipStatus =
  | 'owned'
  | 'wishlist'
  | 'ordered'
  | 'sold'
  | 'given_away'
  | 'lost';

export type BookFormat =
  | 'paperback'
  | 'hardcover'
  | 'bunko'
  | 'tankobon'
  | 'box_set'
  | 'ebook'
  | 'audiobook'
  | 'other';

export type CopyCondition =
  | 'new'
  | 'like_new'
  | 'very_good'
  | 'good'
  | 'fair'
  | 'poor';

export type AcquisitionMethod =
  | 'purchased'
  | 'gift'
  | 'exchange'
  | 'review_copy'
  | 'inherited'
  | 'other';

export type ReadingStatus =
  | 'want_to_read'
  | 'currently_reading'
  | 'finished'
  | 'on_hold'
  | 'abandoned';

export type LoanDirection = 'lent' | 'borrowed';
export type LoanStatus = 'active' | 'returned' | 'overdue' | 'lost';

export type JournalEntryType = 'note' | 'quote' | 'character' | 'reflection';

export type MetadataProviderName =
  | 'manual'
  | 'google_books'
  | 'open_library'
  | 'openbd'
  | 'ocr_local'
  | 'ai_assist';

export type CurrencyCode = 'VND' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'KRW' | 'CNY';

export type SupportedLocale = 'en' | 'vi';

export type SyncEntityType =
  | 'works'
  | 'editions'
  | 'edition_isbns'
  | 'physical_copies'
  | 'loans'
  | 'shelves'
  | 'shelf_items'
  | 'reading_cycles'
  | 'reading_progress'
  | 'reading_sessions'
  | 'reviews'
  | 'journal_entries';

export interface BaseEntity {
  id: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Work extends BaseEntity {
  title: string;
  originalTitle?: string;
  subtitle?: string;
  authors: string[];
  genres: string[];
  tags: string[];
  description?: string;
  originalLanguage?: string;
  firstPublishedYear?: number | null;
  seriesName?: string;
  seriesIndex?: string;
  metadataSource: MetadataProviderName;
  metadataVerified: boolean;
  userVerifiedFields: string[];
}

export interface Edition extends BaseEntity {
  workId: string;
  title: string;
  subtitle?: string;
  editionName?: string;
  translationTitle?: string;
  translators: string[];
  publishers: string[];
  publishedDate?: string;
  publishedYear?: number | null;
  language: string;
  format: BookFormat;
  pageCount?: number | null;
  seriesName?: string;
  volumeNumber?: string;
  coverUrl?: string;
  coverStoragePath?: string;
  coverBlobKey?: string;
  description?: string;
  metadataSource: MetadataProviderName;
  metadataVerified: boolean;
  userVerifiedFields: string[];
}

export interface EditionIsbn extends BaseEntity {
  editionId: string;
  isbn13: string;
  isbn10: string | null;
  prefixGroup: '978' | '979' | 'other';
  isPrimary: boolean;
}

export interface PhysicalCopy extends BaseEntity {
  editionId: string;
  workId: string;
  ownershipStatus: OwnershipStatus;
  format: BookFormat;
  condition: CopyCondition;
  acquisitionMethod: AcquisitionMethod;
  purchaseDate?: string;
  purchasePrice?: number | null;
  currency: CurrencyCode;
  seller?: string;
  shelfLocation?: string;
  copyLabel?: string;
  notes?: string;
}

export interface Loan extends BaseEntity {
  workId: string;
  editionId?: string | null;
  physicalCopyId?: string | null;
  direction: LoanDirection;
  personName: string;
  personContact?: string;
  loanDate: string;
  dueDate?: string;
  returnedDate?: string;
  status: LoanStatus;
  notes?: string;
}

export interface Shelf extends BaseEntity {
  name: string;
  description?: string;
  color: string;
  sortOrder: number;
}

export interface ShelfItem extends BaseEntity {
  shelfId: string;
  workId: string;
  editionId?: string | null;
}

export interface ReadingCycle extends BaseEntity {
  workId: string;
  editionId: string;
  cycleNumber: number;
  status: ReadingStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  targetFinishDate?: string | null;
  dailyPageGoal?: number | null;
  isActive: boolean;
}

export interface ReadingProgress extends BaseEntity {
  cycleId: string;
  workId: string;
  editionId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastRewoundAt?: string | null;
}

export interface ReadingSession extends BaseEntity {
  cycleId: string;
  workId: string;
  editionId: string;
  sessionDate: string; // YYYY-MM-DD local date
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes: number;
  startPage: number;
  endPage: number;
  pagesRead: number;
  notes?: string;
}

export interface Review extends BaseEntity {
  workId: string;
  editionId?: string | null;
  cycleId?: string | null;
  rating: number | null; // 0.5 - 5.0
  headline?: string;
  body: string;
  hasSpoilers: boolean;
}

export interface JournalEntry extends BaseEntity {
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
  tags: string[];
}

export interface MetadataRecord {
  id: string;
  workId?: string | null;
  editionId?: string | null;
  provider: MetadataProviderName;
  externalId: string;
  isbn13?: string | null;
  rawPayload: Record<string, unknown>;
  fetchedAt: string;
}

export interface CoverAsset {
  id: string;
  editionId: string;
  storagePath?: string;
  localBlob?: Blob;
  mimeType: string;
  byteSize: number;
  sha256?: string;
  syncStatus: 'local_only' | 'pending_upload' | 'synced';
  updatedAt: string;
}

export interface SyncOperation {
  opId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  changedFields: string[];
  baseVersion: number;
  createdAt: string;
  retryCount: number;
  lastError?: string | null;
  status: 'pending' | 'in_flight' | 'failed';
}

export interface SyncConflict {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  entityLabel: string;
  localSnapshot: Record<string, unknown>;
  remoteSnapshot: Record<string, unknown>;
  conflictingFields: string[];
  detectedAt: string;
  resolvedAt?: string | null;
  resolution?: 'keep_local' | 'keep_remote' | 'merged' | null;
}

export interface DeviceRecord {
  id: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  lastSeenAt: string;
  lastSyncedSeq: number;
  revokedAt?: string | null;
  isCurrent: boolean;
}

export interface BackupRecord {
  id: string;
  backupType: 'json_full' | 'csv_collection' | 'csv_sessions' | 'csv_journal' | 'cloud_snapshot';
  filename: string;
  entityCounts: Record<string, number>;
  includesCoverManifest: boolean;
  byteSize: number;
  createdAt: string;
  notes?: string;
}

export interface AppSettings {
  id: 'default';
  language: SupportedLocale;
  defaultCurrency: CurrencyCode;
  dailyPageGoal: number;
  yearlyBookGoal: number;
  theme: 'light' | 'dark' | 'system';
  lastSyncedSeq: number;
  lastSyncedAt?: string | null;
  aiCoverAssistOptIn: boolean;
  userId?: string | null;
  userEmail?: string | null;
  deviceId: string;
}

export interface MetadataCandidate {
  externalId: string;
  provider: MetadataProviderName;
  verified: boolean;
  title: string;
  originalTitle?: string;
  subtitle?: string;
  authors: string[];
  translators: string[];
  publishers: string[];
  publishedDate?: string;
  publishedYear?: number | null;
  language: string;
  format?: BookFormat;
  pageCount?: number | null;
  genres: string[];
  description?: string;
  isbn13?: string | null;
  isbn10?: string | null;
  coverUrl?: string;
  seriesName?: string;
  volumeNumber?: string;
  rawPayload: Record<string, unknown>;
}
