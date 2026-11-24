import type { BarcodeScanAttemptResult } from '../services/scannerAndOcr';
import type {
  BookIdentifierType,
  MetadataCandidate,
  MetadataLookupResult,
  ProviderStatusReport,
  VerificationStatus,
} from '../types/domain';

export type AddBookModalTab = 'scan' | 'isbn' | 'search' | 'manual';

export interface ScanLookupUiState {
  tab: AddBookModalTab;
  cameraActive: boolean;
  cameraError: string | null;
  scannedIsbn: string | null;
  scannedIdentifierType?: BookIdentifierType;
  decodedRawValue: string | null;
  decodedFormat: string | null;
  decodedChecksumError: string | null;
  scanAttempted: boolean;
  isbnInput: string;
  loadingLookup: boolean;
  hasSearched: boolean;
  candidates: MetadataCandidate[];
  possibleEditionMatches: MetadataCandidate[];
  relatedEditions: MetadataCandidate[];
  workMatches: MetadataCandidate[];
  approximateMatches: MetadataCandidate[];
  identityMismatches: MetadataCandidate[];
  providerStatuses: ProviderStatusReport[];
  stagesExecuted: string[];
  verificationStatus?: VerificationStatus;
  verificationMessage?: string;
  retrievedAt?: string;
  selectedCandidate: MetadataCandidate | null;
  lookupFromCache: boolean;
  lastAttemptDiagnostics: BarcodeScanAttemptResult | null;
}

export function createInitialScanLookupState(
  initialTab: AddBookModalTab = 'isbn'
): ScanLookupUiState {
  return {
    tab: initialTab,
    cameraActive: false,
    cameraError: null,
    scannedIsbn: null,
    scannedIdentifierType: undefined,
    decodedRawValue: null,
    decodedFormat: null,
    decodedChecksumError: null,
    scanAttempted: false,
    isbnInput: '',
    loadingLookup: false,
    hasSearched: false,
    candidates: [],
    possibleEditionMatches: [],
    relatedEditions: [],
    workMatches: [],
    approximateMatches: [],
    identityMismatches: [],
    providerStatuses: [],
    stagesExecuted: [],
    verificationStatus: undefined,
    verificationMessage: undefined,
    retrievedAt: undefined,
    selectedCandidate: null,
    lookupFromCache: false,
    lastAttemptDiagnostics: null,
  };
}

/**
 * Transitions state after live camera or photo upload decodes a book identifier barcode.
 * Strictly keeps `tab` on `'scan'`, stops camera, and records decoded ID & format
 * independently of metadata lookup.
 */
export function transitionOnBarcodeDecoded(
  state: ScanLookupUiState,
  isbn: string,
  meta?: {
    rawValue?: string | null;
    format?: string | null;
    identifierType?: BookIdentifierType;
    diagnostics?: BarcodeScanAttemptResult | null;
  }
): ScanLookupUiState {
  return {
    ...state,
    tab: 'scan',
    cameraActive: false,
    cameraError: null,
    scannedIsbn: isbn,
    scannedIdentifierType: meta?.identifierType ?? meta?.diagnostics?.identifierType,
    decodedRawValue: meta?.rawValue ?? isbn,
    decodedFormat: meta?.format ?? 'EAN-13',
    decodedChecksumError: null,
    scanAttempted: true,
    isbnInput: isbn,
    lastAttemptDiagnostics: meta?.diagnostics ?? state.lastAttemptDiagnostics,
  };
}

export function transitionOnBarcodeNotDetected(
  state: ScanLookupUiState,
  message: string,
  diagnostics?: BarcodeScanAttemptResult | null
): ScanLookupUiState {
  return {
    ...state,
    tab: 'scan',
    cameraActive: false,
    scanAttempted: true,
    cameraError: message,
    decodedRawValue: diagnostics?.rawValue ?? null,
    decodedFormat: diagnostics?.format ?? null,
    decodedChecksumError: diagnostics?.checksumError ?? null,
    lastAttemptDiagnostics: diagnostics ?? state.lastAttemptDiagnostics,
  };
}

/**
 * Records a live-frame invalid-checksum detection in diagnostics without halting the camera
 * or accepting invalid digits as an identifier.
 */
export function transitionOnInvalidChecksumFrame(
  state: ScanLookupUiState,
  diagnostics: BarcodeScanAttemptResult
): ScanLookupUiState {
  return {
    ...state,
    decodedRawValue: diagnostics.rawValue,
    decodedFormat: diagnostics.format,
    decodedChecksumError: diagnostics.checksumError,
    lastAttemptDiagnostics: diagnostics,
  };
}

/**
 * Applies lookup results WITHOUT changing tabs (even when 1 or 0 candidates match).
 */
export function transitionOnLookupCompleted(
  state: ScanLookupUiState,
  result: MetadataLookupResult
): ScanLookupUiState {
  return {
    ...state,
    loadingLookup: false,
    hasSearched: true,
    candidates: result.candidates,
    possibleEditionMatches: result.possibleEditionMatches ?? [],
    relatedEditions: result.relatedEditions ?? [],
    workMatches: result.workMatches ?? [],
    approximateMatches: result.approximateMatches ?? [],
    identityMismatches: result.identityMismatches ?? [],
    providerStatuses: result.providerStatuses,
    stagesExecuted: result.stagesExecuted ?? [],
    verificationStatus: result.verificationStatus,
    verificationMessage: result.verificationMessage,
    retrievedAt: result.retrievedAt,
    lookupFromCache: Boolean(result.fromCache),
  };
}

/**
 * Handles lookup error/rejection while strictly preserving the decoded ID & manual fallback options.
 */
export function transitionOnLookupFailed(state: ScanLookupUiState): ScanLookupUiState {
  return {
    ...state,
    loadingLookup: false,
    hasSearched: true,
  };
}

/**
 * Explicit user choice to pick a candidate for editing in Manual mode.
 */
export function transitionOnSelectCandidate(
  state: ScanLookupUiState,
  candidate: MetadataCandidate
): ScanLookupUiState {
  return {
    ...state,
    selectedCandidate: candidate,
    tab: 'manual',
  };
}

export function transitionOnClearScan(state: ScanLookupUiState): ScanLookupUiState {
  return {
    ...state,
    tab: 'scan',
    scannedIsbn: null,
    scannedIdentifierType: undefined,
    decodedRawValue: null,
    decodedFormat: null,
    decodedChecksumError: null,
    scanAttempted: false,
    candidates: [],
    possibleEditionMatches: [],
    relatedEditions: [],
    workMatches: [],
    approximateMatches: [],
    identityMismatches: [],
    providerStatuses: [],
    stagesExecuted: [],
    verificationStatus: undefined,
    verificationMessage: undefined,
    retrievedAt: undefined,
    hasSearched: false,
    cameraError: null,
    lookupFromCache: false,
  };
}

/**
 * Ensures at most one async decode job executes at a time, releasing the lock in `finally`.
 */
export function createSequentialDecodeRunner() {
  let inFlight = false;
  return {
    isBusy: () => inFlight,
    run: async <T>(task: () => Promise<T>): Promise<T | null> => {
      if (inFlight) return null;
      inFlight = true;
      try {
        return await task();
      } finally {
        inFlight = false;
      }
    },
  };
}

