import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const supabaseMockState = vi.hoisted(() => ({
  client: null as unknown,
  configured: false,
}));

vi.mock('../src/lib/supabase', () => ({
  getSupabaseClient: () => supabaseMockState.client,
  isSupabaseConfigured: () => supabaseMockState.configured,
}));

import { db, ensureAppSettings } from '../src/db/dexie';
import {
  isSafeImageUrl,
  resolveEditionCoverSources,
  sanitizeCoverUrl,
  saveLocalCoverBlob,
} from '../src/services/covers';
import {
  deleteBothBookTrackerData,
  deleteCloudBookTrackerData,
  deleteLocalBookTrackerData,
} from '../src/services/dataManagementService';
import { createBookBundle } from '../src/services/libraryService';
import {
  extractVietnameseBookSpecs,
  foldVietnameseDiacritics,
  stripSiteChromeHtml,
} from '../src/services/metadata/htmlAndText';
import {
  computeQueryRelevanceScore,
  mergeCandidateIntoDraft,
  runProvidersWithIsolation,
  type ManualDraftFields,
  type MetadataProviderAdapter,
} from '../src/services/metadata/pipeline';
import { firstNewsProvider, hikaruProvider, nlvOpacProvider } from '../src/services/metadata/providers';
import {
  clearMetadataLookupCache,
  lookupMetadataWithReportByIsbn,
  searchMetadataWithReportByQuery,
} from '../src/services/metadataService';
import { runSyncCycle } from '../src/sync/syncEngine';
import type { MetadataCandidate } from '../src/types/domain';

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    const methods = {
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(String(key), String(value));
      },
    };
    const proxy = new Proxy(methods as unknown as Storage, {
      get(_target, prop) {
        if (prop === 'length') return store.size;
        if (prop in methods) return methods[prop as keyof typeof methods];
        return store.get(String(prop));
      },
      ownKeys() {
        return Array.from(store.keys());
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (store.has(String(prop))) {
          return { enumerable: true, configurable: true, value: store.get(String(prop)) };
        }
        return undefined;
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: proxy,
    });
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const HTVPD_PRODUCT_HTML = `
<html>
  <head>
    <meta property="og:title" content="Hành Trình Về Phương Đông (Ấn bản đặc biệt)" />
    <meta property="og:image" content="https://cdn.firstnews.vn/covers/hanh-trinh-ve-phuong-dong.jpg" />
  </head>
  <body>
    <header><nav><a href="/products/san-pham-khac-khong-lien-quan">Menu Noise</a></nav></header>
    <main>
      <h1>Hành Trình Về Phương Đông</h1>
      <div class="product-specs">
        <p>Tác giả: Baird T. Spalding</p>
        <p>Biên dịch: Nguyên Phong</p>
        <p>Nhà xuất bản: NXB Tổng Hợp TP.HCM</p>
        <p>Nhà phát hành: First News - Trí Việt</p>
        <p>Số trang: 368</p>
        <p>Năm xuất bản: 2021</p>
        <p>Quy cách in: Bìa cứng</p>
        <p>ISBN: 978-604-77-7192-9</p>
        <p>Mã vạch: 8935086848203</p>
      </div>
    </main>
    <footer><a href="/products/footer-noise">Footer Noise</a></footer>
  </body>
</html>
`;

afterEach(async () => {
  clearMetadataLookupCache();
  vi.restoreAllMocks();
  supabaseMockState.client = null;
  supabaseMockState.configured = false;
  globalThis.localStorage?.clear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('Vietnamese metadata discovery fixes: First News, Haravan chrome stripping, Biên dịch & diacritic relevance', () => {
  it('parses Biên dịch and Quy cách in (Bìa cứng) cleanly and strips header/nav/footer chrome HTML', () => {
    const cleaned = stripSiteChromeHtml(HTVPD_PRODUCT_HTML);
    expect(cleaned).not.toContain('san-pham-khac-khong-lien-quan');
    expect(cleaned).not.toContain('footer-noise');

    const specs = extractVietnameseBookSpecs(HTVPD_PRODUCT_HTML);
    expect(specs.authors).toEqual(['Baird T. Spalding']);
    expect(specs.translators).toEqual(['Nguyên Phong']);
    expect(specs.publishers).toContain('NXB Tổng Hợp TP.HCM');
    expect(specs.distributor).toBe('First News - Trí Việt');
    expect(specs.format).toBe('hardcover');
    expect(specs.pageCount).toBe(368);
    expect(specs.publishedYear).toBe(2021);
    expect(specs.identifiers).toEqual(expect.arrayContaining(['9786047771929', '8935086848203']));
  });

  it('resolves 8935086848203 (EAN-13) and 9786047771929 (ISBN-13) for Hành Trình Về Phương Đông via first_news', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('firstnews.vn/tim-kiem') || url.includes('firstnews.vn/search')) {
        return htmlResponse(`
          <html><body>
            <header><a href="/wrong-header-link-p999.html">Wrong Header</a></header>
            <div class="search-results">
              <a href="/hanh-trinh-ve-phuong-dong-bia-cung-p48203.html">Hành Trình Về Phương Đông</a>
            </div>
          </body></html>
        `);
      }
      if (url.includes('firstnews.vn/hanh-trinh-ve-phuong-dong-bia-cung-p48203.html')) {
        return htmlResponse(HTVPD_PRODUCT_HTML);
      }
      return htmlResponse('Not Found', 404);
    }) as unknown as typeof fetch;

    const eanRes = await lookupMetadataWithReportByIsbn('8935086848203', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [firstNewsProvider],
    });
    expect(eanRes.identifierType).toBe('ean13');
    expect(eanRes.verificationStatus).toBe('verified_match');
    expect(eanRes.candidates).toHaveLength(1);
    expect(eanRes.candidates[0].title).toContain('Hành Trình Về Phương Đông');
    expect(eanRes.candidates[0].translators).toEqual(['Nguyên Phong']);
    expect(eanRes.candidates[0].format).toBe('hardcover');
    expect(eanRes.candidates[0].ean13).toBe('8935086848203');

    clearMetadataLookupCache();
    const isbnRes = await lookupMetadataWithReportByIsbn('9786047771929', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [firstNewsProvider],
    });
    expect(isbnRes.identifierType).toBe('isbn13');
    expect(isbnRes.verificationStatus).toBe('verified_match');
    expect(isbnRes.candidates).toHaveLength(1);
    expect(isbnRes.candidates[0].isbn13).toBe('9786047771929');
  });

  it('rejects unrelated book when looking up 8935086848203, ignores Haravan header nav links, and surfaces pipeline identityMismatch when emitted', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('hikaru.vn/search')) {
        return htmlResponse(`
          <html><body>
            <header><nav><a href="/products/muon-kiep-nhan-sinh">Menu Book</a></nav></header>
            <div class="product-grid"><a href="/products/cuon-sach-sai-ma">Wrong Barcode Book</a></div>
          </body></html>
        `);
      }
      if (url.includes('hikaru.vn/products/cuon-sach-sai-ma.json')) {
        return jsonResponse({
          product: {
            id: 222,
            title: 'Cuốn Sách Khác Hoàn Toàn',
            variants: [{ sku: '9780140449136', barcode: '9780140449136' }],
            body_html: '<p>ISBN: 9780140449136</p>',
          },
        });
      }
      if (url.includes('hikaru.vn/products/muon-kiep-nhan-sinh.json')) {
        throw new Error('Header navigation link must have been stripped and never fetched!');
      }
      return htmlResponse('Not found', 404);
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('8935086848203', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [hikaruProvider],
    });
    expect(res.candidates).toHaveLength(0);
    expect(res.verificationStatus).toBe('not_found');
    expect(
      (mockFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([u]) =>
        String(u).includes('muon-kiep-nhan-sinh')
      )
    ).toBe(false);

    // Pipeline-level strict identity mismatch rejection when an adapter returns a wrong ISBN
    const conflictingAdapter: MetadataProviderAdapter = {
      name: 'google_books',
      label: 'Mock Wrong ID',
      supportsDirectBrowserCors: true,
      async lookupByIsbn() {
        return [
          {
            externalId: 'wrong-1',
            provider: 'google_books',
            verified: false,
            title: 'Unrelated Wrong Book',
            authors: ['Other Author'],
            translators: [],
            publishers: ['Other Pub'],
            language: 'en',
            genres: [],
            isbn13: '9780140449136',
            matchedIsbns: ['9780140449136'],
            matchedIdentifiers: ['9780140449136'],
            rawPayload: {},
          },
        ];
      },
      async search() {
        return [];
      },
    };
    const pipeRes = await runProvidersWithIsolation({
      mode: 'isbn',
      input: '8935086848203',
      adapters: [conflictingAdapter],
      ctx: { fetchFn: mockFetch, timeoutMs: 5000 },
    });
    expect(pipeRes.candidates).toHaveLength(0);
    expect(pipeRes.verificationStatus).toBe('identity_mismatch');
    expect(pipeRes.identityMismatches).toHaveLength(1);
  });

  it('ranks keyword search results using diacritic-folded Unicode NFD relevance and filters zero-relevance noise', async () => {
    expect(foldVietnameseDiacritics('Hành Trình Về Phương Đông')).toBe('Hanh Trinh Ve Phuong Dong');
    expect(
      computeQueryRelevanceScore(
        { title: 'Hành Trình Về Phương Đông', authors: [] },
        'Hanh trinh ve phuong dong'
      )
    ).toBeGreaterThanOrEqual(100);
    expect(
      computeQueryRelevanceScore(
        { title: 'Bút Bi Thiên Long Xanh', authors: [] },
        'Hành Trình Về Phương Đông'
      )
    ).toBe(0);

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('firstnews.vn/tim-kiem')) {
        return htmlResponse(`
          <main>
            <a href="/san-pham/but-bi-khuyen-mai">Bút Bi Khuyến Mãi</a>
            <a href="/san-pham/hanh-trinh-ve-phuong-dong">Hành Trình Về Phương Đông</a>
          </main>
        `);
      }
      if (url.includes('firstnews.vn/san-pham/but-bi-khuyen-mai')) {
        return htmlResponse('<html><body><h1>Bút Bi Khuyến Mãi</h1></body></html>');
      }
      if (url.includes('firstnews.vn/san-pham/hanh-trinh-ve-phuong-dong')) {
        return htmlResponse(HTVPD_PRODUCT_HTML);
      }
      return htmlResponse('Not found', 404);
    }) as unknown as typeof fetch;

    const searchRes = await searchMetadataWithReportByQuery('Hanh trinh ve phuong dong', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [firstNewsProvider, nlvOpacProvider],
    });
    expect(searchRes.candidates).toHaveLength(1);
    expect(searchRes.candidates[0].title).toContain('Hành Trình Về Phương Đông');
  });
});

describe('Cover URL safety, sequential fallback order, orphan cleanup & candidate switching', () => {
  it('validates safe cover URLs and builds ordered local -> storage -> remote fallback chain', async () => {
    expect(isSafeImageUrl('https://cdn.example.com/cover.jpg')).toBe(true);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(sanitizeCoverUrl('   javascript:alert(1)  ')).toBeUndefined();
    expect(sanitizeCoverUrl(' https://cdn.example.com/a.jpg ')).toBe('https://cdn.example.com/a.jpg');

    supabaseMockState.configured = true;
    supabaseMockState.client = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: { signedUrl: 'https://signed.supabase.co/cover.jpg' },
            error: null,
          }),
        }),
      },
    };

    const { edition } = await createBookBundle({
      work: { title: 'Cover Chain Book', authors: ['Author'], genres: [] },
      edition: {
        title: 'Cover Chain Book',
        language: 'vi',
        format: 'paperback',
        coverUrl: 'https://cdn.example.com/remote-cover.jpg',
        coverStoragePath: 'user-1/covers/ed.jpg',
      },
      createCopy: false,
    });

    // Save cover twice -> previous asset for editionId must be removed
    await saveLocalCoverBlob(edition.id, new Blob(['first-image'], { type: 'image/jpeg' }));
    await saveLocalCoverBlob(edition.id, new Blob(['second-image'], { type: 'image/jpeg' }));

    const assets = await db.cover_assets
      .where('editionId')
      .equals(edition.id)
      .filter((a) => !a.deletedAt)
      .toArray();
    expect(assets).toHaveLength(1);

    const updatedEdition = (await db.editions.get(edition.id))!;
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-local-cover');

    const sources = await resolveEditionCoverSources(updatedEdition);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(sources[0]).toEqual({ src: 'blob:mock-local-cover', isObjectUrl: true });
    expect(sources[1]).toEqual({ src: 'https://signed.supabase.co/cover.jpg', isObjectUrl: false });
    expect(sources[2]).toEqual({ src: 'https://cdn.example.com/remote-cover.jpg', isObjectUrl: false });
  });

  it('replaces unedited coverUrl (including clearing when absent) on candidate switch while protecting userEditedFields', () => {
    const draftAfterCandidateA: ManualDraftFields = {
      title: 'Title From A',
      originalTitle: '',
      authorsText: 'Author A',
      translatorsText: '',
      illustratorsText: '',
      publishersText: 'Publisher A',
      publishingPartner: '',
      genresText: '',
      language: 'vi',
      pageCount: '320',
      publishedYear: '2020',
      seriesName: '',
      volumeNumber: '',
      coverUrl: 'https://cdn.example.com/cover-from-a.jpg',
      description: 'Description A',
      isbnInput: '9786047771929',
    };

    const candidateBWithoutCover: MetadataCandidate = {
      externalId: 'b-1',
      provider: 'first_news',
      verified: false,
      title: 'Title From B',
      authors: ['Author B'],
      translators: ['Nguyên Phong'],
      publishers: ['NXB Tổng Hợp TP.HCM'],
      language: 'vi',
      genres: [],
      coverUrl: undefined,
      isbn13: '9786047771929',
      rawPayload: {},
    };

    // Title was manually edited by user; coverUrl was NOT manually edited
    const next = mergeCandidateIntoDraft(
      draftAfterCandidateA,
      candidateBWithoutCover,
      ['title'],
      { replaceUnedited: true }
    );
    expect(next.title).toBe('Title From A');
    expect(next.authorsText).toBe('Author B');
    expect(next.translatorsText).toBe('Nguyên Phong');
    expect(next.coverUrl).toBe('');
    expect(next.pageCount).toBe('');
  });
});

describe('Scoped Book Tracker deletion & anti-reupload guard', () => {
  it('deleteLocalBookTrackerData clears all Book Tracker stores & lookup cache without touching AniVerse/MAL localStorage', async () => {
    localStorage.setItem('mal_access_token', 'keep-me-intact');
    localStorage.setItem('aniverse_theme', 'sakura');
    localStorage.setItem('book_tracker_metadata_cache_v1', JSON.stringify({ stale: true }));

    await createBookBundle({
      work: { title: 'Temp Book', authors: ['Temp'], genres: [] },
      edition: { title: 'Temp Book', language: 'vi', format: 'paperback' },
      createCopy: true,
      copy: {
        ownershipStatus: 'owned',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
      },
      initialReadingStatus: 'currently_reading',
    });

    const res = await deleteLocalBookTrackerData();
    expect(res.ok).toBe(true);
    expect(res.clearedTables.length).toBeGreaterThanOrEqual(10);
    expect(await db.works.count()).toBe(0);
    expect(await db.physical_copies.count()).toBe(0);
    expect(await db.reading_cycles.count()).toBe(0);
    expect(localStorage.getItem('mal_access_token')).toBe('keep-me-intact');
    expect(localStorage.getItem('aniverse_theme')).toBe('sakura');
    expect(localStorage.getItem('book_tracker_metadata_cache_v1')).toBeNull();
  });

  it('deleteCloudBookTrackerData enforces user_id scope, sets anti-reupload pause guard, and pauses auto-sync until manual sync', async () => {
    const eqCalls: Array<{ table: string; col: string; val: string }> = [];
    const removedStoragePaths: Array<{ bucket: string; paths: string[] }> = [];

    supabaseMockState.configured = true;
    supabaseMockState.client = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-abc' } }, error: null })),
      },
      functions: {
        invoke: vi.fn(async () => ({
          data: null,
          error: { message: 'Mock RPC stop after guard cleared' },
        })),
      },
      from: (table: string) => ({
        delete: () => ({
          eq: async (col: string, val: string) => {
            eqCalls.push({ table, col, val });
            return { error: null };
          },
        }),
      }),
      storage: {
        from: (bucket: string) => ({
          list: async (prefix: string) => {
            if (prefix === 'user-abc') {
              return { data: [{ name: 'cover1.jpg', id: 'id1' }], error: null };
            }
            return { data: [], error: null };
          },
          remove: async (paths: string[]) => {
            removedStoragePaths.push({ bucket, paths });
            return { error: null };
          },
        }),
      },
    };

    await ensureAppSettings();
    const res = await deleteCloudBookTrackerData();
    expect(res.ok).toBe(true);
    expect(res.deletedTables.length).toBeGreaterThanOrEqual(10);
    expect(eqCalls.length).toBeGreaterThanOrEqual(10);
    expect(eqCalls.every((c) => c.col === 'user_id' && c.val === 'user-abc')).toBe(true);
    expect(removedStoragePaths.some((r) => r.bucket === 'book-covers')).toBe(true);
    expect(localStorage.getItem('book_tracker_cloud_wiped')).toBe('1');

    // Automatic background sync must remain paused after wipe
    const autoSyncRes = await runSyncCycle();
    expect(autoSyncRes.status).toBe('paused_after_wipe');

    // Manual sync clears the wipe guard
    const manualSyncRes = await runSyncCycle({ manualTrigger: true });
    expect(manualSyncRes.status).not.toBe('paused_after_wipe');
    expect(localStorage.getItem('book_tracker_cloud_wiped')).toBeNull();
  });

  it('deleteBothBookTrackerData reports partial failure cleanly when signed out / cloud unavailable', async () => {
    supabaseMockState.configured = false;
    supabaseMockState.client = null;

    await createBookBundle({
      work: { title: 'Partial Test', authors: ['Tester'], genres: [] },
      edition: { title: 'Partial Test', language: 'vi', format: 'paperback' },
      createCopy: false,
    });

    const res = await deleteBothBookTrackerData();
    expect(res.local.ok).toBe(true);
    expect(res.cloud.ok).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.partialFailure).toBe(true);
    expect(res.cloud.error).toBeTruthy();
    expect(await db.works.count()).toBe(0);
  });
});
