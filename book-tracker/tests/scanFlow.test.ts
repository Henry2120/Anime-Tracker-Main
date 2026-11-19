import { describe, expect, it } from 'vitest';
import type { MetadataCandidate, MetadataLookupResult } from '../src/types/domain';
import {
  createInitialScanLookupState,
  transitionOnBarcodeDecoded,
  transitionOnBarcodeNotDetected,
  transitionOnClearScan,
  transitionOnLookupCompleted,
  transitionOnSelectCandidate,
} from '../src/utils/scanFlow';

const SINGLE_CANDIDATE: MetadataCandidate = {
  externalId: 'gooda-882101',
  provider: 'gooda',
  verified: false,
  matchConfidence: 'exact_isbn',
  matchedIsbns: ['9786043590296'],
  title: 'Cô nàng Otaku nhà tôi – Tập 1',
  authors: ['Rin Murakami'],
  translators: ['KPS'],
  illustrators: ['Mako Tatekawa'],
  publishers: ['Amak Books', 'NXB Hà Nội'],
  language: 'vi',
  pageCount: 384,
  publishedYear: 2022,
  genres: [],
  isbn13: '9786043590296',
  rawPayload: {},
};

describe('Same-screen barcode scanner flow', () => {
  it('keeps user on scan tab for live camera detection and stops camera immediately', () => {
    const started = {
      ...createInitialScanLookupState('scan'),
      cameraActive: true,
    };
    const afterDecode = transitionOnBarcodeDecoded(started, '9786043590296');
    expect(afterDecode.tab).toBe('scan');
    expect(afterDecode.cameraActive).toBe(false);
    expect(afterDecode.scannedIsbn).toBe('9786043590296');
    expect(afterDecode.scanAttempted).toBe(true);
    expect(afterDecode.isbnInput).toBe('9786043590296');
  });

  it('keeps user on scan tab even when 1 exact candidate is returned (no auto-switch to manual or isbn)', () => {
    const decoded = transitionOnBarcodeDecoded(
      createInitialScanLookupState('scan'),
      '9786043590296'
    );
    const result: MetadataLookupResult = {
      candidates: [SINGLE_CANDIDATE],
      providerStatuses: [
        {
          provider: 'gooda',
          label: 'Gooda.vn',
          status: 'matched',
          candidateCount: 1,
          exactMatchCount: 1,
        },
      ],
      queriedIsbn: '9786043590296',
      exactMatchCount: 1,
    };

    const afterLookup = transitionOnLookupCompleted(decoded, result);
    expect(afterLookup.tab).toBe('scan');
    expect(afterLookup.scannedIsbn).toBe('9786043590296');
    expect(afterLookup.candidates).toHaveLength(1);
    expect(afterLookup.hasSearched).toBe(true);
    expect(afterLookup.selectedCandidate).toBeNull();
  });

  it('keeps user on scan tab when 0 candidates are found so retry / manual actions stay inline', () => {
    const decoded = transitionOnBarcodeDecoded(
      createInitialScanLookupState('scan'),
      '9786044777986'
    );
    const afterEmpty = transitionOnLookupCompleted(decoded, {
      candidates: [],
      providerStatuses: [],
      queriedIsbn: '9786044777986',
      exactMatchCount: 0,
    });
    expect(afterEmpty.tab).toBe('scan');
    expect(afterEmpty.scannedIsbn).toBe('9786044777986');
    expect(afterEmpty.candidates).toHaveLength(0);
    expect(afterEmpty.hasSearched).toBe(true);
  });

  it('keeps user on scan tab when uploaded image fails barcode detection', () => {
    const state = transitionOnBarcodeNotDetected(
      createInitialScanLookupState('scan'),
      'No valid ISBN-13/10 barcode detected'
    );
    expect(state.tab).toBe('scan');
    expect(state.scanAttempted).toBe(true);
    expect(state.scannedIsbn).toBeNull();
    expect(state.cameraError).toContain('No valid ISBN');
  });

  it('moves to manual tab ONLY when user explicitly selects a candidate, and clears cleanly on reset', () => {
    const afterLookup = transitionOnLookupCompleted(
      transitionOnBarcodeDecoded(createInitialScanLookupState('scan'), '9786043590296'),
      {
        candidates: [SINGLE_CANDIDATE],
        providerStatuses: [],
        queriedIsbn: '9786043590296',
        exactMatchCount: 1,
      }
    );
    const selected = transitionOnSelectCandidate(afterLookup, SINGLE_CANDIDATE);
    expect(selected.tab).toBe('manual');
    expect(selected.selectedCandidate?.isbn13).toBe('9786043590296');

    const cleared = transitionOnClearScan(afterLookup);
    expect(cleared.tab).toBe('scan');
    expect(cleared.scannedIsbn).toBeNull();
    expect(cleared.candidates).toHaveLength(0);
    expect(cleared.hasSearched).toBe(false);
  });
});
