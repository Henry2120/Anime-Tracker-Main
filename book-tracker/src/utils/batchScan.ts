import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type {
  BookFormat,
  BookIdentifierType,
  CurrencyCode,
  MetadataCandidate,
  OwnershipStatus,
  ProviderStatusReport,
  VerificationStatus,
} from '../types/domain';
import { parseBookIdentifier } from './isbn';

export type BatchQueueStatus =
  | 'captured'
  | 'searching'
  | 'match_found'
  | 'no_match'
  | 'invalid'
  | 'duplicate'
  | 'error';

export type BatchDuplicateAction = 'add_copy' | 'skip' | 'create_new';
export type BatchSourceKind = 'live_camera' | 'multi_photo' | 'bulk_text';

export interface BatchDraftMetadata {
  title: string;
  originalTitle: string;
  authorsText: string;
  translatorsText: string;
  illustratorsText: string;
  publishersText: string;
  publishingPartner: string;
  distributorText: string;
  genresText: string;
  language: string;
  format: BookFormat;
  pageCount: string;
  publishedYear: string;
  editionName: string;
  seriesName: string;
  volumeNumber: string;
  coverUrl: string;
  description: string;
  ownershipStatus: OwnershipStatus;
  purchasePrice: string;
  currency: CurrencyCode;
  shelfIds: string[];
  notes: string;
}

export interface BatchDuplicateCollectionMatch {
  workId: string;
  editionId: string;
  title: string;
  authors: string[];
  ownedCopiesCount: number;
  wishlistCopiesCount: number;
}

export interface BatchQueueItem {
  id: string;
  rawInput: string;
  normalizedId: string | null;
  identifierType: BookIdentifierType;
  isIsbn: boolean;
  isbn10: string | null;
  ean13: string | null;
  formatLabel: string | null;
  source: BatchSourceKind;
  capturedAt: string;
  status: BatchQueueStatus;
  isValid: boolean;
  checksumError: string | null;
  candidates: MetadataCandidate[];
  approximateMatches: MetadataCandidate[];
  selectedCandidate: MetadataCandidate | null;
  providerStatuses: ProviderStatusReport[];
  verificationStatus?: VerificationStatus;
  verificationMessage?: string;
  lookupError: string | null;
  draft: BatchDraftMetadata;
  coverFile: File | null;
  coverPreviewUrl: string | null;
  duplicateInBatch: boolean;
  duplicateInCollection: BatchDuplicateCollectionMatch | null;
  duplicateAction: BatchDuplicateAction;
  selected: boolean;
  savingState: 'idle' | 'saving' | 'saved' | 'failed';
  saveError: string | null;
  savedWorkId: string | null;
}

export interface BulkParsedEntry {
  index: number;
  rawToken: string;
  normalizedId: string | null;
  identifierType: BookIdentifierType;
  isIsbn: boolean;
  isbn10: string | null;
  ean13: string | null;
  isValid: boolean;
  errorReason: string | null;
  isDuplicateInInput: boolean;
}

export interface BulkParseResult {
  entries: BulkParsedEntry[];
  totalTokens: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

function makeBatchItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Splits multi-line, comma-separated, or semicolon-separated ISBN/EAN text cleanly,
 * preserving leading zeros (e.g. 0140449132) and evaluating each token independently
 * without mutating check digits or merging adjacent lines.
 */
export function parseBulkIdentifierText(rawText: string): BulkParseResult {
  const tokens = rawText
    .split(/[\r\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seenValid = new Set<string>();
  const entries: BulkParsedEntry[] = tokens.map((token, index) => {
    const parsed = parseBookIdentifier(token);
    if (!parsed.isValid || !parsed.normalizedId) {
      return {
        index,
        rawToken: token,
        normalizedId: null,
        identifierType: 'invalid',
        isIsbn: false,
        isbn10: null,
        ean13: null,
        isValid: false,
        errorReason: parsed.errorReason ?? 'Invalid ISBN-10, ISBN-13, or EAN-13 identifier',
        isDuplicateInInput: false,
      };
    }

    const dupKey = parsed.normalizedId;
    const isDuplicateInInput = seenValid.has(dupKey);
    seenValid.add(dupKey);

    return {
      index,
      rawToken: token,
      normalizedId: parsed.normalizedId,
      identifierType: parsed.identifierType,
      isIsbn: parsed.isIsbn,
      isbn10: parsed.isbn10,
      ean13: parsed.ean13,
      isValid: true,
      errorReason: null,
      isDuplicateInInput,
    };
  });

  return {
    entries,
    totalTokens: entries.length,
    validCount: entries.filter((e) => e.isValid).length,
    invalidCount: entries.filter((e) => !e.isValid).length,
    duplicateCount: entries.filter((e) => e.isDuplicateInInput).length,
  };
}

/**
 * Matches a normalized identifier (ISBN-13, converted ISBN-10, or EAN-13) against existing
 * collection records so duplicate barcode scans surface helpful Copy/Skip warnings.
 */
export function findExistingBookByIdentifier(
  normalizedId: string | null,
  books: EnrichedBookRecord[],
  isbn10?: string | null
): BatchDuplicateCollectionMatch | null {
  if (!normalizedId && !isbn10) return null;
  const targets = new Set(
    [normalizedId, isbn10]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.replace(/[^0-9X]/gi, '').toUpperCase())
  );

  for (const book of books) {
    const matched = book.isbns.some((i) => {
      const candidates = [i.isbn13, i.isbn10, i.ean13]
        .filter((v): v is string => Boolean(v))
        .map((v) => v.replace(/[^0-9X]/gi, '').toUpperCase());
      return candidates.some((id) => targets.has(id));
    });
    if (matched) {
      return {
        workId: book.work.id,
        editionId: book.primaryEdition.id,
        title: book.work.title,
        authors: book.work.authors,
        ownedCopiesCount: book.ownedCopiesCount,
        wishlistCopiesCount: book.wishlistCopiesCount,
      };
    }
  }
  return null;
}

/**
 * Suppresses accidental consecutive camera frames holding the same barcode in view,
 * while permitting an intentional re-scan once `cooldownMs` has elapsed or another code was scanned.
 */
export function shouldSuppressConsecutiveFrame(
  recentFrames: Map<string, number>,
  normalizedId: string,
  nowMs: number,
  options?: { lastBarcodeId?: string | null; cooldownMs?: number }
): boolean {
  const cooldownMs = options?.cooldownMs ?? 2000;
  const lastSeenAt = recentFrames.get(normalizedId);
  if (lastSeenAt === undefined) {
    recentFrames.set(normalizedId, nowMs);
    return false;
  }
  // If user held the exact same barcode continuously without scanning anything else,
  // suppress repeats for a longer consecutive-hold window; if they moved to another book or waited past cooldown, allow.
  const threshold = options?.lastBarcodeId === normalizedId ? cooldownMs : Math.min(800, cooldownMs);
  if (nowMs - lastSeenAt < threshold) {
    recentFrames.set(normalizedId, nowMs);
    return true;
  }
  recentFrames.set(normalizedId, nowMs);
  return false;
}

export function createEmptyBatchDraft(defaultCurrency: CurrencyCode): BatchDraftMetadata {
  return {
    title: '',
    originalTitle: '',
    authorsText: '',
    translatorsText: '',
    illustratorsText: '',
    publishersText: '',
    publishingPartner: '',
    distributorText: '',
    genresText: '',
    language: 'vi',
    format: 'paperback',
    pageCount: '',
    publishedYear: '',
    editionName: '',
    seriesName: '',
    volumeNumber: '',
    coverUrl: '',
    description: '',
    ownershipStatus: 'owned',
    purchasePrice: '',
    currency: defaultCurrency,
    shelfIds: [],
    notes: '',
  };
}

export function candidateToBatchDraft(
  candidate: MetadataCandidate,
  currentDraft: BatchDraftMetadata
): BatchDraftMetadata {
  return {
    ...currentDraft,
    title: candidate.title || currentDraft.title,
    originalTitle: candidate.originalTitle ?? currentDraft.originalTitle,
    authorsText: candidate.authors.length ? candidate.authors.join(', ') : currentDraft.authorsText,
    translatorsText: candidate.translators.length
      ? candidate.translators.join(', ')
      : currentDraft.translatorsText,
    illustratorsText: candidate.illustrators?.length
      ? candidate.illustrators.join(', ')
      : currentDraft.illustratorsText,
    publishersText: candidate.publishers.length
      ? candidate.publishers.join(', ')
      : currentDraft.publishersText,
    publishingPartner: candidate.publishingPartner ?? currentDraft.publishingPartner,
    distributorText: candidate.distributor ?? currentDraft.distributorText,
    genresText: candidate.genres.length ? candidate.genres.join(', ') : currentDraft.genresText,
    language:
      candidate.language && candidate.language !== 'und'
        ? candidate.language
        : currentDraft.language,
    format: candidate.format ?? currentDraft.format,
    pageCount: candidate.pageCount ? String(candidate.pageCount) : currentDraft.pageCount,
    publishedYear: candidate.publishedYear
      ? String(candidate.publishedYear)
      : currentDraft.publishedYear,
    editionName: candidate.editionName ?? currentDraft.editionName,
    seriesName: candidate.seriesName ?? currentDraft.seriesName,
    volumeNumber: candidate.volumeNumber ?? currentDraft.volumeNumber,
    coverUrl: candidate.coverUrl ?? currentDraft.coverUrl,
    description: candidate.description ?? currentDraft.description,
  };
}

export function createBatchQueueItem(params: {
  rawInput: string;
  formatLabel?: string | null;
  source: BatchSourceKind;
  defaultCurrency: CurrencyCode;
  existingQueue: BatchQueueItem[];
  existingBooks: EnrichedBookRecord[];
}): BatchQueueItem {
  const parsed = parseBookIdentifier(params.rawInput);
  const id = makeBatchItemId();
  const capturedAt = new Date().toISOString();

  if (!parsed.isValid || !parsed.normalizedId) {
    return {
      id,
      rawInput: params.rawInput,
      normalizedId: null,
      identifierType: 'invalid',
      isIsbn: false,
      isbn10: null,
      ean13: null,
      formatLabel: params.formatLabel ?? null,
      source: params.source,
      capturedAt,
      status: 'invalid',
      isValid: false,
      checksumError: parsed.errorReason ?? 'Invalid ISBN/EAN-13 check digit',
      candidates: [],
      approximateMatches: [],
      selectedCandidate: null,
      providerStatuses: [],
      lookupError: null,
      draft: createEmptyBatchDraft(params.defaultCurrency),
      coverFile: null,
      coverPreviewUrl: null,
      duplicateInBatch: false,
      duplicateInCollection: null,
      duplicateAction: 'skip',
      selected: false,
      savingState: 'idle',
      saveError: null,
      savedWorkId: null,
    };
  }

  const duplicateInBatch = params.existingQueue.some(
    (item) => item.isValid && item.normalizedId === parsed.normalizedId
  );
  const duplicateInCollection = findExistingBookByIdentifier(
    parsed.normalizedId,
    params.existingBooks,
    parsed.isbn10
  );
  const hasDuplicate = duplicateInBatch || Boolean(duplicateInCollection);

  return {
    id,
    rawInput: params.rawInput,
    normalizedId: parsed.normalizedId,
    identifierType: parsed.identifierType,
    isIsbn: parsed.isIsbn,
    isbn10: parsed.isbn10,
    ean13: parsed.ean13,
    formatLabel: params.formatLabel ?? (parsed.identifierType === 'isbn10' ? 'ISBN-10' : 'EAN-13'),
    source: params.source,
    capturedAt,
    status: hasDuplicate ? 'duplicate' : 'captured',
    isValid: true,
    checksumError: null,
    candidates: [],
    approximateMatches: [],
    selectedCandidate: null,
    providerStatuses: [],
    lookupError: null,
    draft: createEmptyBatchDraft(params.defaultCurrency),
    coverFile: null,
    coverPreviewUrl: null,
    duplicateInBatch,
    duplicateInCollection,
    duplicateAction: duplicateInCollection ? 'add_copy' : hasDuplicate ? 'skip' : 'create_new',
    selected: !duplicateInBatch,
    savingState: 'idle',
    saveError: null,
    savedWorkId: null,
  };
}

/**
 * Executes an async worker across items using a bounded concurrency pool so live
 * barcode capture stays responsive while metadata providers resolve in parallel.
 */
export async function runBoundedConcurrency<T>(
  items: T[],
  concurrencyLimit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const limit = Math.max(1, Math.floor(concurrencyLimit));
  let cursor = 0;

  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
}

export function applyBatchLookupSuccess(
  item: BatchQueueItem,
  result: {
    candidates: MetadataCandidate[];
    possibleEditionMatches?: MetadataCandidate[];
    relatedEditions?: MetadataCandidate[];
    workMatches?: MetadataCandidate[];
    approximateMatches?: MetadataCandidate[];
    providerStatuses: ProviderStatusReport[];
    verificationStatus?: VerificationStatus;
    verificationMessage?: string;
  }
): BatchQueueItem {
  const approx = [
    ...(result.possibleEditionMatches ?? []),
    ...(result.workMatches ?? []),
    ...(result.relatedEditions ?? []),
    ...(result.approximateMatches ?? []),
  ].filter(
    (c, idx, arr) =>
      !result.candidates.some((ex) => ex.provider === c.provider && ex.externalId === c.externalId) &&
      arr.findIndex((other) => other.provider === c.provider && other.externalId === c.externalId) === idx
  );

  const primary = result.candidates[0] ?? approx[0] ?? null;
  const hasDuplicate = item.duplicateInBatch || Boolean(item.duplicateInCollection);

  const nextStatus: BatchQueueStatus = hasDuplicate
    ? 'duplicate'
    : result.candidates.length > 0 || approx.length > 0
      ? 'match_found'
      : 'no_match';

  return {
    ...item,
    status: nextStatus,
    candidates: result.candidates,
    approximateMatches: approx,
    selectedCandidate: primary,
    providerStatuses: result.providerStatuses,
    verificationStatus: result.verificationStatus,
    verificationMessage: result.verificationMessage,
    lookupError: null,
    draft: primary ? candidateToBatchDraft(primary, item.draft) : item.draft,
  };
}

export function applyBatchLookupFailure(item: BatchQueueItem, message: string): BatchQueueItem {
  return {
    ...item,
    status: item.duplicateInBatch || item.duplicateInCollection ? 'duplicate' : 'error',
    lookupError: message,
  };
}

export function canRegisterBatchItem(item: BatchQueueItem): boolean {
  if (!item.isValid || !item.normalizedId) return false;
  if (item.savingState === 'saved') return false;
  if ((item.duplicateInBatch || item.duplicateInCollection) && item.duplicateAction === 'skip') {
    return false;
  }
  if (item.duplicateInCollection && item.duplicateAction === 'add_copy') {
    return true;
  }
  return item.draft.title.trim().length > 0;
}
