import { describe, expect, it } from 'vitest';
import type { MetadataCandidate, MetadataLookupResult } from '../src/types/domain';
import {
  createInitialScanLookupState,
  createSequentialDecodeRunner,
  transitionOnBarcodeDecoded,
  transitionOnBarcodeNotDetected,
  transitionOnClearScan,
  transitionOnInvalidChecksumFrame,
  transitionOnLookupCompleted,
  transitionOnLookupFailed,
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

describe('Same-screen barcode scanner flow & decoupling', () => {
  it('keeps user on scan tab for live camera detection and stops camera immediately', () => {
    const started = {
      ...createInitialScanLookupState('scan'),
      cameraActive: true,
    };
    const afterDecode = transitionOnBarcodeDecoded(started, '9786043590296', {
      rawValue: '9786043590296',
      format: 'EAN-13',
    });
    expect(afterDecode.tab).toBe('scan');
    expect(afterDecode.cameraActive).toBe(false);
    expect(afterDecode.scannedIsbn).toBe('9786043590296');
    expect(afterDecode.decodedFormat).toBe('EAN-13');
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
      exactMatches: [SINGLE_CANDIDATE],
      approximateMatches: [],
      providerStatuses: [
        {
          provider: 'gooda',
          label: 'Gooda.vn',
          status: 'exact_match',
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

  it('preserves decoded ISBN strictly when lookup returns 0 matches or fails completely', () => {
    const decoded = transitionOnBarcodeDecoded(
      createInitialScanLookupState('scan'),
      '9786044777986'
    );
    const afterEmpty = transitionOnLookupCompleted(decoded, {
      candidates: [],
      exactMatches: [],
      approximateMatches: [],
      providerStatuses: [],
      queriedIsbn: '9786044777986',
      exactMatchCount: 0,
    });
    expect(afterEmpty.tab).toBe('scan');
    expect(afterEmpty.scannedIsbn).toBe('9786044777986');
    expect(afterEmpty.candidates).toHaveLength(0);
    expect(afterEmpty.hasSearched).toBe(true);

    const afterFailed = transitionOnLookupFailed(decoded);
    expect(afterFailed.tab).toBe('scan');
    expect(afterFailed.scannedIsbn).toBe('9786044777986');
    expect(afterFailed.loadingLookup).toBe(false);
    expect(afterFailed.hasSearched).toBe(true);
  });

  it('records invalid-checksum frame diagnostics without accepting it as a decoded ISBN', () => {
    const base = {
      ...createInitialScanLookupState('scan'),
      cameraActive: true,
    };
    const invalid = transitionOnInvalidChecksumFrame(base, {
      validIsbn13: null,
      isbn10: null,
      rawValue: '9786044777980',
      format: 'EAN-13',
      isValidIsbn: false,
      checksumError: 'Invalid ISBN-13 check digit in "9786044777980" (got 0, expected 6)',
      decoderUsed: 'zxing',
      matchedRegion: null,
      regionsExamined: ['full_frame'],
      nativeSupported: false,
      zxingStatus: 'ready',
      zxingError: null,
      durationMs: 12,
      error: null,
    });
    expect(invalid.cameraActive).toBe(true);
    expect(invalid.scannedIsbn).toBeNull();
    expect(invalid.decodedRawValue).toBe('9786044777980');
    expect(invalid.decodedChecksumError).toContain('expected 6');
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

  it('prevents overlapping async decodes and resets in-flight lock inside finally', async () => {
    const runner = createSequentialDecodeRunner();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const p1 = runner.run(async () => {
      await firstGate;
      return 'first';
    });
    expect(runner.isBusy()).toBe(true);

    // Concurrent attempt must be skipped cleanly
    const skipped = await runner.run(async () => 'second');
    expect(skipped).toBeNull();

    releaseFirst();
    expect(await p1).toBe('first');
    expect(runner.isBusy()).toBe(false);

    // Even when a task rejects, lock must be released in finally
    await expect(
      runner.run(async () => {
        throw new Error('decode failed');
      })
    ).rejects.toThrow('decode failed');
    expect(runner.isBusy()).toBe(false);
  });
});
