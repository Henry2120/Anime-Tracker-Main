import { describe, expect, it } from 'vitest';
import {
  extractJsonLdBooks,
  extractVietnameseBookSpecs,
} from '../src/services/metadata/htmlAndText';
import { parseMarc21Record } from '../src/services/metadata/marc21';
import {
  classifyCandidateMatch,
  mergeAndEnrichCandidates,
  mergeCandidateIntoDraft,
  type ManualDraftFields,
} from '../src/services/metadata/pipeline';
import {
  adcbookProvider,
  ALL_METADATA_PROVIDERS,
  fahasaProvider,
  goodaProvider,
  googleBooksProvider,
  hcmLibraryProvider,
  hikaruProvider,
  nlvOpacProvider,
  openLibraryProvider,
  tikiProvider,
} from '../src/services/metadata/providers';
import {
  lookupMetadataWithReportByIsbn,
  searchMetadataWithReportByQuery,
} from '../src/services/metadataService';
import type { MetadataCandidate } from '../src/types/domain';
import { generateSearchIsbnForms, normalizeIsbnTo13 } from '../src/utils/isbn';

type MockRouteHandler = (url: string) => Response | Promise<Response>;

function createMockFetch(routes: Array<[string | RegExp, MockRouteHandler]>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    for (const [pattern, handler] of routes) {
      const matched = typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url);
      if (matched) {
        return handler(url);
      }
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;
}

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

// ============================================================================
// Reusable Fixtures Based on Real Vietnamese Catalogue Structures
// ============================================================================

const TEST1_ADCBOOK_JSON = {
  id: 37512676,
  name: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp - Tập 2 (Light Novel)',
  alias: 'lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd',
  vendor: 'NXB Kim Đồng',
  featured_image: { src: 'https://bizweb.dktcdn.net/100/363/455/products/lam-ban-tap-2.jpg' },
  variants: [{ sku: '9786042243568', barcode: '9786042243568' }],
  content: '<p>Câu chuyện tiếp nối về Maki và Asanagi.</p>',
};

const TEST1_ADCBOOK_HTML = `
<html>
  <head><meta property="og:image" content="https://bizweb.dktcdn.net/100/363/455/products/lam-ban-tap-2.jpg" /></head>
  <body>
    <h1>Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp – Tập 2</h1>
    <table>
      <tr><td>Tác giả/ Dịch giả</td><td>Takata, Tom Osabe, Azuri Hyuga</td></tr>
      <tr><td>Nhà xuất bản</td><td>Nhà xuất bản Kim Đồng</td></tr>
      <tr><td>Số trang</td><td>404</td></tr>
      <tr><td>Ngôn ngữ</td><td>Tiếng Việt</td></tr>
    </table>
  </body>
</html>
`;

const TEST1_HIKARU_SEARCH_HTML = `
<html><body>
  <a href="/products/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2">Tập 2</a>
  <a href="/products/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-3">Tập 3 (Wrong Vol)</a>
</body></html>
`;

const TEST1_HIKARU_JSON = {
  product: {
    id: 1054002,
    title: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp - Tập 2',
    handle: 'lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2',
    vendor: 'NXB KIM ĐỒNG',
    tags: ['tacgia_Takata', 'dichgia_Thế Đăng', 'hoasi_Azuri Hyuga', 'hoasi_Tom Osabe', 'Light Novel'],
    image: { src: 'https://product.hstatic.net/1000237375/product/lam-ban-2.jpg' },
    variants: [{ sku: '978-604-2-24356-8', barcode: '' }],
    body_html: `
      <table>
        <tr><td>Định Dạng:</td><td>Bìa Rời</td><td>Số Trang:</td><td>396</td></tr>
        <tr><td>Năm Xuất Bản:</td><td>2024</td><td>Ngôn Ngữ:</td><td>Tiếng Việt</td></tr>
      </table>
    `,
  },
};

const TEST1_HIKARU_WRONG_VOLUME_JSON = {
  product: {
    id: 1054003,
    title: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp - Tập 3',
    handle: 'lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-3',
    vendor: 'NXB KIM ĐỒNG',
    variants: [{ sku: '978-604-2-99999-8', barcode: '' }],
    body_html: '<p>Tập 3 ISBN khác: 9786042999998</p>',
  },
};

const TEST2_GOODA_JSON = {
  id: 882101,
  name: 'Cô nàng Otaku nhà tôi – Tập 1',
  alias: 'co-nang-otaku-nha-toi-tap-1',
  vendor: 'Amak Books',
  variants: [{ sku: 'AMAK-882101', barcode: '' }],
  content: '<p>Tác phẩm hài hước lãng mạn về cô bạn cùng bàn otaku.</p>',
};

const TEST2_GOODA_HTML = `
<html>
  <head>
    <meta property="og:image" content="https://gooda.vn/upload/co-nang-otaku-1.jpg" />
    <script type="application/ld+json">
      {"@type":"Book","name":"Cô nàng Otaku nhà tôi – Tập 1","isbn":"978-604-359-029-6","numberOfPages":384}
    </script>
  </head>
  <body>
    <h1>Cô nàng Otaku nhà tôi – Tập 1</h1>
    <ul class="specs">
      <li>Tác giả: Rin Murakami</li>
      <li>Minh họa: Mako Tatekawa</li>
      <li>Dịch giả: KPS</li>
      <li>Số trang: 384 trang</li>
      <li>ISBN: 978-604-359-029-6</li>
      <li>NXB liên kết: NXB Hà Nội</li>
      <li>Phát hành: 15<span>/07/2022</span></li>
    </ul>
  </body>
</html>
`;

const TEST2_HIKARU_JSON = {
  product: {
    id: 991201,
    title: 'Cô Nàng Otaku Nhà Tôi - Tập 1',
    handle: 'co-nang-otaku-nha-toi-tap-1',
    vendor: 'Amak Books',
    tags: ['tacgia_Rin Murakami', 'hoasi_Mako Tatekawa', 'Light Novel'],
    image: { src: 'https://hikaru.vn/cdn/otaku-1.jpg' },
    variants: [{ sku: '9786043590296', barcode: '9786043590296' }],
    body_html: '<p>Số Trang: 384</p><p>Phát hành: 15/07/2022</p>',
  },
};

const TEST3_HCM_SEARCH_HTML = `
<html><body>
  <div class="result-item">
    <a href="/Item/ItemDetail/840485">Dũng cảm để trưởng thành</a>
  </div>
</body></html>
`;

const TEST3_HCM_DETAIL_HTML = `
<html><body>
  <img src="/Upload/ImageCover/2026/6/12/VV_5269.png" alt="Cover" />
  <div id="divMARC21">
    <table>
      <tr><td>001</td><td></td><td>000840485</td></tr>
      <tr><td>020</td><td>##</td><td>$a9786044777986</td></tr>
      <tr><td>041</td><td>0#</td><td>$avie$hkor</td></tr>
      <tr><td>100</td><td>1#</td><td>$aChoi, Seoyoung</td></tr>
      <tr><td>245</td><td>10</td><td>$aDũng cảm để trưởng thành /$cChoi Seoyoung ; Sun Tzô dịch</td></tr>
      <tr><td>260</td><td>##</td><td>$aHà Nội :$bVăn học,$c2024</td></tr>
      <tr><td>300</td><td>##</td><td>$a216 tr. ;$c21 cm</td></tr>
      <tr><td>520</td><td>##</td><td>$aCuốn sách truyền cảm hứng về sự tự tin và trưởng thành.</td></tr>
      <tr><td>650</td><td>#4</td><td>$aKỹ năng sống</td></tr>
      <tr><td>650</td><td>#4</td><td>$aTâm lý học</td></tr>
      <tr><td>700</td><td>1#</td><td>$aSun Tzô</td></tr>
      <tr><td>907</td><td></td><td>/ImageCover/2026/6/12/VV_5269.png</td></tr>
    </table>
  </div>
</body></html>
`;

describe('Vietnamese ISBN helpers & hyphenation generation', () => {
  it('generates Vietnamese 978-604-* hyphenated variants alongside raw ISBN-13/10', () => {
    const forms = generateSearchIsbnForms('9786042243568');
    expect(forms).toContain('9786042243568');
    expect(forms).toContain('978-604-2-24356-8');
    expect(forms).toContain('604224356X');
  });

  it('normalizes hyphenated ISBN-13 and valid ISBN-10 to normalized ISBN-13', () => {
    expect(normalizeIsbnTo13('978-604-359-029-6')).toBe('9786043590296');
    expect(normalizeIsbnTo13('0-14-044913-2')).toBe('9780140449136');
    expect(normalizeIsbnTo13('9786044777980')).toBeNull();
  });
});

describe('MARC21 & Vietnamese HTML spec extraction', () => {
  it('parses MARC21 HTML table with relator roles, diacritics, and cover path', () => {
    const parsed = parseMarc21Record(TEST3_HCM_DETAIL_HTML);
    expect(parsed).not.toBeNull();
    expect(parsed!.isbns).toEqual(['9786044777986']);
    expect(parsed!.title).toBe('Dũng cảm để trưởng thành');
    expect(parsed!.authors).toEqual(['Choi Seoyoung']);
    expect(parsed!.translators).toEqual(['Sun Tzô']);
    expect(parsed!.publishers).toEqual(['Văn học']);
    expect(parsed!.publishedYear).toBe(2024);
    expect(parsed!.pageCount).toBe(216);
    expect(parsed!.language).toBe('vi');
    expect(parsed!.subjects).toEqual(['Kỹ năng sống', 'Tâm lý học']);
    expect(parsed!.coverPath).toBe('/ImageCover/2026/6/12/VV_5269.png');
  });

  it('parses inline broken spans in Sapo release dates without splitting the date', () => {
    const specs = extractVietnameseBookSpecs(TEST2_GOODA_HTML);
    expect(specs.authors).toEqual(['Rin Murakami']);
    expect(specs.illustrators).toEqual(['Mako Tatekawa']);
    expect(specs.translators).toEqual(['KPS']);
    expect(specs.publishingPartner).toBe('NXB Hà Nội');
    expect(specs.publishers).toContain('NXB Hà Nội');
    expect(specs.pageCount).toBe(384);
    expect(specs.publishedYear).toBe(2022);
    expect(specs.publishedDate).toBe('2022-07-15');
    expect(specs.isbns).toContain('9786043590296');
  });

  it('extracts ISBN, pages, and title from JSON-LD Book block', () => {
    const ld = extractJsonLdBooks(TEST2_GOODA_HTML);
    expect(ld).toHaveLength(1);
    expect(ld[0].isbns).toEqual(['9786043590296']);
    expect(ld[0].pageCount).toBe(384);
    expect(ld[0].title).toBe('Cô nàng Otaku nhà tôi – Tập 1');
  });
});

describe('Mandatory Vietnamese ISBN Regression Acceptance Tests', () => {
  it('Test 1 (9786042243568): merges ADCBook + Hikaru with translator Thế Đăng, NXB Kim Đồng, 404p, and preserves 396p conflict', async () => {
    const mockFetch = createMockFetch([
      [
        'https://adcbook.net.vn/search',
        () =>
          jsonResponse({
            results: [{ url: '/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd' }],
          }),
      ],
      [
        'https://adcbook.net.vn/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd.json',
        () => jsonResponse(TEST1_ADCBOOK_JSON),
      ],
      [
        'https://adcbook.net.vn/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd',
        () => htmlResponse(TEST1_ADCBOOK_HTML),
      ],
      ['https://hikaru.vn/search', () => htmlResponse(TEST1_HIKARU_SEARCH_HTML)],
      [
        'https://hikaru.vn/products/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2.json',
        () => jsonResponse(TEST1_HIKARU_JSON),
      ],
      [
        'https://hikaru.vn/products/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-3.json',
        () => jsonResponse(TEST1_HIKARU_WRONG_VOLUME_JSON),
      ],
      ['https://www.fahasa.com/', () => htmlResponse('Forbidden', 403)],
      ['https://opac.nlv.gov.vn/', () => htmlResponse('Service Unavailable', 503)],
      ['https://www.googleapis.com/', () => jsonResponse({ error: { code: 429 } }, 429)],
      ['https://tiki.vn/api/v2/products?limit=5', () => jsonResponse({ data: [{ id: 111 }] })],
      [
        'https://tiki.vn/api/v2/products/111',
        () => jsonResponse({ id: 111, name: 'Bút bi Thiên Long', sku: 'TL-027', specifications: [] }),
      ],
      ['https://openlibrary.org/', () => jsonResponse({ docs: [] })],
    ]);

    const res = await lookupMetadataWithReportByIsbn('9786042243568', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [
        adcbookProvider,
        hikaruProvider,
        tikiProvider,
        googleBooksProvider,
        openLibraryProvider,
        nlvOpacProvider,
        fahasaProvider,
      ],
    });

    expect(res.exactMatchCount).toBe(1);
    expect(res.candidates).toHaveLength(1);

    const book = res.candidates[0];
    expect(book.matchConfidence).toBe('exact_isbn');
    expect(book.isbn13).toBe('9786042243568');
    expect(book.title).toContain('Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp');
    expect(book.title).toContain('Tập 2');
    expect(book.authors).toContain('Takata');
    expect(book.translators).toEqual(['Thế Đăng']);
    expect(book.publishers.some((p) => p.includes('Kim Đồng'))).toBe(true);
    expect(book.pageCount).toBe(404);
    expect(book.language).toBe('vi');
    expect(book.sources).toEqual(expect.arrayContaining(['adcbook', 'hikaru']));
    // Page count conflict (404 vs 396) is preserved for transparency
    expect(book.conflicts?.some((c) => c.field === 'pageCount')).toBe(true);

    // Unrelated Tiki stationery & Hikaru wrong-volume candidate never leak in
    const tikiStatus = res.providerStatuses.find((s) => s.provider === 'tiki');
    expect(tikiStatus?.status).toBe('no_match');
  });

  it('Test 2 (9786043590296): merges Gooda + Hikaru with Rin Murakami, Mako Tatekawa, KPS, Amak Books / NXB Hà Nội, 384p, 2022', async () => {
    const mockFetch = createMockFetch([
      [
        'https://gooda.vn/search',
        () => jsonResponse({ '882101': { url: '/co-nang-otaku-nha-toi-tap-1', title: 'Cô nàng Otaku nhà tôi – Tập 1' } }),
      ],
      ['https://gooda.vn/co-nang-otaku-nha-toi-tap-1.json', () => jsonResponse(TEST2_GOODA_JSON)],
      ['https://gooda.vn/co-nang-otaku-nha-toi-tap-1', () => htmlResponse(TEST2_GOODA_HTML)],
      [
        'https://hikaru.vn/search',
        () => htmlResponse('<a href="/products/co-nang-otaku-nha-toi-tap-1">Tập 1</a>'),
      ],
      ['https://hikaru.vn/products/co-nang-otaku-nha-toi-tap-1.json', () => jsonResponse(TEST2_HIKARU_JSON)],
      ['https://', () => jsonResponse({ docs: [], data: [], results: [] })],
    ]);

    const res = await lookupMetadataWithReportByIsbn('9786043590296', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [goodaProvider, hikaruProvider, openLibraryProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const book = res.candidates[0];
    expect(book.matchConfidence).toBe('exact_isbn');
    expect(book.isbn13).toBe('9786043590296');
    expect(book.title).toBe('Cô nàng Otaku nhà tôi – Tập 1');
    expect(book.authors).toEqual(['Rin Murakami']);
    expect(book.illustrators).toEqual(['Mako Tatekawa']);
    expect(book.translators).toEqual(['KPS']);
    expect(book.publishers).toEqual(expect.arrayContaining(['Amak Books', 'NXB Hà Nội']));
    expect(book.publishingPartner).toBe('NXB Hà Nội');
    expect(book.pageCount).toBe(384);
    expect(book.publishedYear).toBe(2022);
    expect(book.language).toBe('vi');
    expect(book.sources).toEqual(expect.arrayContaining(['gooda', 'hikaru']));
  });

  it('Test 3 (9786044777986): resolves HCM Library MARC21 record with Choi Seoyoung, Sun Tzô translator, Văn học, 216p, 2024, and /Upload/ImageCover URL', async () => {
    const mockFetch = createMockFetch([
      ['https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced', () => htmlResponse(TEST3_HCM_SEARCH_HTML)],
      ['https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/840485', () => htmlResponse(TEST3_HCM_DETAIL_HTML)],
      ['https://', () => jsonResponse({ docs: [], data: [], results: [] })],
    ]);

    const res = await lookupMetadataWithReportByIsbn('9786044777986', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [hcmLibraryProvider, goodaProvider, openLibraryProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const book = res.candidates[0];
    expect(book.provider).toBe('hcm_library');
    expect(book.matchConfidence).toBe('exact_isbn');
    expect(book.isbn13).toBe('9786044777986');
    expect(book.title).toBe('Dũng cảm để trưởng thành');
    expect(book.authors).toEqual(['Choi Seoyoung']);
    expect(book.translators).toEqual(['Sun Tzô']);
    expect(book.publishers).toEqual(['Văn học']);
    expect(book.pageCount).toBe(216);
    expect(book.publishedYear).toBe(2024);
    expect(book.language).toBe('vi');
    expect(book.genres).toEqual(['Kỹ năng sống', 'Tâm lý học']);
    expect(book.coverUrl).toBe('https://phucvu.thuvientphcm.gov.vn/Upload/ImageCover/2026/6/12/VV_5269.png');
    expect(book.sourceUrl).toBe('https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/840485');
  });
});

describe('Strict verification, error isolation & manual-draft preservation', () => {
  it('classifies exact_isbn vs unverified_isbn vs rejects conflicting ISBNs', () => {
    const exactCand: MetadataCandidate = {
      externalId: '1',
      provider: 'gooda',
      verified: false,
      title: 'Book A',
      authors: ['Author A'],
      translators: [],
      publishers: [],
      language: 'vi',
      genres: [],
      isbn13: '9786043590296',
      rawPayload: {},
    };
    const noIsbnCand: MetadataCandidate = {
      ...exactCand,
      externalId: '2',
      provider: 'tiki',
      isbn13: null,
      rawPayload: {},
    };
    const wrongIsbnCand: MetadataCandidate = {
      ...exactCand,
      externalId: '3',
      provider: 'tiki',
      isbn13: '9780140449136',
      rawPayload: {},
    };

    expect(classifyCandidateMatch(exactCand, '9786043590296').confidence).toBe('exact_isbn');
    expect(classifyCandidateMatch(noIsbnCand, '9786043590296').confidence).toBe('unverified_isbn');
    expect(classifyCandidateMatch(wrongIsbnCand, '9786043590296').hasConflictingIsbn).toBe(true);

    // Merging discards the wrong-ISBN candidate and drops unverified when an exact match exists
    const merged = mergeAndEnrichCandidates([exactCand, noIsbnCand, wrongIsbnCand], '9786043590296');
    expect(merged).toHaveLength(1);
    expect(merged[0].matchConfidence).toBe('exact_isbn');
  });

  it('isolates timeouts, HTTP 403, HTTP 503, and HTTP 429 without halting other providers', async () => {
    const failingThenSucceedingFetch = createMockFetch([
      ['https://www.fahasa.com/', () => htmlResponse('Cloudflare', 403)],
      ['https://opac.nlv.gov.vn/', () => htmlResponse('503', 503)],
      ['https://www.googleapis.com/', () => jsonResponse({}, 429)],
      [
        'https://openlibrary.org/',
        () => {
          throw new DOMException('Aborted', 'AbortError');
        },
      ],
      [
        'https://gooda.vn/search',
        () => jsonResponse({ '882101': { url: '/co-nang-otaku-nha-toi-tap-1' } }),
      ],
      ['https://gooda.vn/co-nang-otaku-nha-toi-tap-1.json', () => jsonResponse(TEST2_GOODA_JSON)],
      ['https://gooda.vn/co-nang-otaku-nha-toi-tap-1', () => htmlResponse(TEST2_GOODA_HTML)],
    ]);

    const res = await lookupMetadataWithReportByIsbn('9786043590296', {
      fetchFn: failingThenSucceedingFetch,
      preferEdgeFunction: false,
      adapters: ALL_METADATA_PROVIDERS,
    });

    expect(res.exactMatchCount).toBe(1);
    expect(res.candidates[0].title).toBe('Cô nàng Otaku nhà tôi – Tập 1');

    const byId = Object.fromEntries(res.providerStatuses.map((s) => [s.provider, s.status]));
    expect(byId.gooda).toBe('matched');
    expect(byId.fahasa).toBe('unsupported');
    expect(byId.nlv_opac).toBe('temporarily_unavailable');
    expect(byId.google_books).toBe('requires_configuration');
    expect(byId.open_library).toBe('temporarily_unavailable');
  });

  it('supports keyword search with Vietnamese Unicode diacritics preserved', async () => {
    const mockFetch = createMockFetch([
      ['https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced', () => htmlResponse(TEST3_HCM_SEARCH_HTML)],
      ['https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/840485', () => htmlResponse(TEST3_HCM_DETAIL_HTML)],
      ['https://', () => jsonResponse({ data: [], docs: [], results: [] })],
    ]);

    const res = await searchMetadataWithReportByQuery('Dũng cảm để trưởng thành', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [hcmLibraryProvider, openLibraryProvider],
    });

    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].title).toBe('Dũng cảm để trưởng thành');
    expect(res.candidates[0].translators).toEqual(['Sun Tzô']);
    expect(res.candidates[0].matchConfidence).toBe('title_match');
  });

  it('never overwrites user-edited manual draft fields when selecting a candidate', () => {
    const current: ManualDraftFields = {
      title: 'Tựa đề đã chỉnh sửa tay',
      originalTitle: '',
      authorsText: '',
      translatorsText: 'Dịch giả tự nhập',
      illustratorsText: '',
      publishersText: '',
      publishingPartner: '',
      genresText: '',
      language: 'vi',
      pageCount: '410',
      publishedYear: '',
      seriesName: '',
      volumeNumber: '',
      coverUrl: '',
      description: '',
      isbnInput: '9786042243568',
    };

    const candidate: MetadataCandidate = {
      externalId: '1',
      provider: 'adcbook',
      verified: false,
      matchConfidence: 'exact_isbn',
      title: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp – Tập 2',
      authors: ['Takata'],
      translators: ['Thế Đăng'],
      illustrators: ['Azuri Hyuga'],
      publishers: ['Nhà xuất bản Kim Đồng'],
      language: 'vi',
      pageCount: 404,
      publishedYear: 2024,
      genres: ['Light Novel'],
      isbn13: '9786042243568',
      rawPayload: {},
    };

    const next = mergeCandidateIntoDraft(current, candidate, ['title', 'translatorsText', 'pageCount']);
    // User-edited non-empty fields are strictly preserved
    expect(next.title).toBe('Tựa đề đã chỉnh sửa tay');
    expect(next.translatorsText).toBe('Dịch giả tự nhập');
    expect(next.pageCount).toBe('410');
    // Unedited empty fields are filled in from the candidate
    expect(next.authorsText).toBe('Takata');
    expect(next.illustratorsText).toBe('Azuri Hyuga');
    expect(next.publishersText).toBe('Nhà xuất bản Kim Đồng');
    expect(next.publishedYear).toBe('2024');
  });
});
