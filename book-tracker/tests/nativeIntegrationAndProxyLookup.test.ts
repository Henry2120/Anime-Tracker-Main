import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMetadataLookupCache,
  lookupMetadataWithReportByIsbn,
} from '../src/services/metadataService';
import { executeServerBookLookup } from '../src/services/metadata/serverLookup';
import {
  ACTIVE_WORLD_STORAGE_KEY,
  persistAppMode,
  resolveInitialAppMode,
  retireLegacyBookTrackerServiceWorker,
} from '../../src/utils/worldMode';

describe('Native AniVerse Book Tracker Integration & Server Proxy Lookup', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearMetadataLookupCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    globalThis.fetch = originalFetch;
  });

  it('persists and restores active world mode under dedicated storage key', () => {
    const store = new Map<string, string>();
    const storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
    };

    expect(resolveInitialAppMode({ location: { pathname: '/', search: '', hash: '' }, storage })).toBe('anime');

    persistAppMode('books', storage);
    expect(store.get(ACTIVE_WORLD_STORAGE_KEY)).toBe('books');
    expect(resolveInitialAppMode({ location: { pathname: '/', search: '', hash: '' }, storage })).toBe('books');

    persistAppMode('music', storage);
    expect(resolveInitialAppMode({ location: { pathname: '/', search: '', hash: '' }, storage })).toBe('music');
  });

  it('handles legacy /book-tracker redirect handoff (?world=books) and cleans URL back to /', () => {
    const store = new Map<string, string>();
    const storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
    };
    const replaceState = vi.fn();

    const mode = resolveInitialAppMode({
      location: { pathname: '/', search: '?world=books', hash: '' },
      history: { replaceState },
      storage,
    });

    expect(mode).toBe('books');
    expect(store.get(ACTIVE_WORLD_STORAGE_KEY)).toBe('books');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('safely unregisters only obsolete /book-tracker/ service workers and Book Tracker caches', async () => {
    const unregisterBookSw = vi.fn().mockResolvedValue(true);
    const unregisterRootSw = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        location: { origin: 'https://aniverse.example', protocol: 'https:' },
        caches: {
          keys: vi.fn().mockResolvedValue([
            'workbox-precache-v2-https://aniverse.example/book-tracker/',
            'book-tracker-runtime-v1',
            'unrelated-app-cache',
          ]),
          delete: deleteCache,
        },
      },
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        onLine: true,
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([
            { scope: 'https://aniverse.example/book-tracker/', unregister: unregisterBookSw },
            { scope: 'https://aniverse.example/', unregister: unregisterRootSw },
          ]),
        },
      },
    });

    const result = await retireLegacyBookTrackerServiceWorker();

    expect(unregisterBookSw).toHaveBeenCalledTimes(1);
    expect(unregisterRootSw).not.toHaveBeenCalled();
    expect(result.unregisteredScopes).toEqual(['https://aniverse.example/book-tracker/']);
    expect(result.deletedCaches).toEqual([
      'workbox-precache-v2-https://aniverse.example/book-tracker/',
      'book-tracker-runtime-v1',
    ]);
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-app-cache');
  });

  it('routes browser ISBN lookup for 9786044777986 through same-origin /api/book-tracker/lookup proxy so non-CORS hcm_library succeeds', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        location: { origin: 'http://localhost:3000', protocol: 'http:' },
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {},
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { onLine: true },
    });

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/book-tracker/lookup') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { isbn?: string };
        expect(body.isbn).toBe('9786044777986');
        return new Response(
          JSON.stringify({
            candidates: [
              {
                provider: 'hcm_library',
                externalId: 'hcm-9786044777986',
                title: 'Dũng cảm để trưởng thành',
                authors: ['Choi Seoyoung'],
                translators: ['Sun Tzô'],
                publishers: ['Văn học'],
                genres: [],
                verified: true,
                publishedYear: 2024,
                pageCount: 216,
                language: 'vi',
                isbn13: '9786044777986',
                matchConfidence: 'exact_isbn',
                rawPayload: {},
              },
            ],
            providerStatuses: [
              {
                provider: 'hcm_library',
                label: 'HCMC General Sciences Library',
                status: 'exact_match',
                candidateCount: 1,
                exactMatchCount: 1,
              },
            ],
            stagesExecuted: ['server_stage1'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected direct fetch to ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await lookupMetadataWithReportByIsbn('9786044777986');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.exactMatchCount).toBe(1);
    expect(result.candidates[0]?.title).toBe('Dũng cảm để trưởng thành');
    expect(result.candidates[0]?.isbn13).toBe('9786044777986');
    expect(result.providerStatuses.some((s) => s.provider === 'hcm_library' && s.status === 'exact_match')).toBe(true);
  });

  it('executeServerBookLookup runs non-CORS providers server-side without browser blocking', async () => {
    const res = await executeServerBookLookup({
      isbn: '9786044777986',
      adapters: [
        {
          name: 'hcm_library',
          label: 'HCMC General Sciences Library',
          tier: 'tier2_national',
          region: 'vn',
          supportsDirectBrowserCors: false,
          lookupByIsbn: async (isbn13) => [
            {
              provider: 'hcm_library',
              externalId: 'test-1',
              title: 'Dũng cảm để trưởng thành',
              authors: ['Choi Seoyoung'],
              translators: ['Sun Tzô'],
              publishers: ['Văn học'],
              genres: [],
              verified: true,
              isbn13,
              pageCount: 216,
              language: 'vi',
              matchConfidence: 'exact_isbn',
              rawPayload: {},
            },
          ],
          search: async () => [],
        },
      ],
    });

    expect(res.exactMatchCount).toBe(1);
    expect(res.exactMatches?.[0]?.title).toBe('Dũng cảm để trưởng thành');
    expect(res.providerStatuses[0]?.status).toBe('exact_match');
  });
});
