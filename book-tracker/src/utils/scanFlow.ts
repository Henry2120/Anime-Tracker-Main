import type {
  MetadataCandidate,
  MetadataLookupResult,
  ProviderStatusReport,
} from '../types/domain';

export type AddBookModalTab = 'scan' | 'isbn' | 'search' | 'manual';

export interface ScanLookupUiState {
  tab: AddBookModalTab;
  cameraActive: boolean;
  cameraError: string | null;
  scannedIsbn: string | null;
  scanAttempted: boolean;
  isbnInput: string;
  loadingLookup: boolean;
  hasSearched: boolean;
  candidates: MetadataCandidate[];
  providerStatuses: ProviderStatusReport[];
  selectedCandidate: MetadataCandidate | null;
}

export function createInitialScanLookupState(
  initialTab: AddBookModalTab = 'isbn'
): ScanLookupUiState {
  return {
    tab: initialTab,
    cameraActive: false,
    cameraError: null,
    scannedIsbn: null,
    scanAttempted: false,
    isbnInput: '',
    loadingLookup: false,
    hasSearched: false,
    candidates: [],
    providerStatuses: [],
    selectedCandidate: null,
  };
}

/**
 * Transitions state after live camera or photo upload decodes an ISBN barcode.
 * Strictly keeps `tab` on `'scan'`, stops camera, and records decoded ISBN.
 */
export function transitionOnBarcodeDecoded(
  state: ScanLookupUiState,
  isbn: string
): ScanLookupUiState {
  return {
    ...state,
    tab: 'scan',
    cameraActive: false,
    cameraError: null,
    scannedIsbn: isbn,
    scanAttempted: true,
    isbnInput: isbn,
  };
}

export function transitionOnBarcodeNotDetected(
  state: ScanLookupUiState,
  message: string
): ScanLookupUiState {
  return {
    ...state,
    tab: 'scan',
    cameraActive: false,
    scanAttempted: true,
    cameraError: message,
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
    providerStatuses: result.providerStatuses,
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
    scanAttempted: false,
    candidates: [],
    providerStatuses: [],
    hasSearched: false,
    cameraError: null,
  };
}
