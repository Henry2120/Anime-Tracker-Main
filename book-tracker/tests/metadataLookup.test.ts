import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanVietnameseTitle,
  extractLabeledSpecsFromHtmlOrText,
  mergeAndRankCandidates,
  normalizeLanguageCode,
  parseHaravanProduct,
  parseOpenBdRecord,
  parseSapoProduct,
  parseTikiProduct,
} from '../src/services/metadata/normalizer';
import { lookupMetadataByIsbnDetailed } from '../src/services/metadataService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Metadata normalization & Vietnamese multi-provider pipeline', () => {
  it('parses ADCBook Sapo JSON + HTML accurately for 9786042243568', () => {
    const adcProduct = {
      id: 57188029,
      name: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp Tập 2 Tặng Kèm Postcard',
      alias: 'lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd',
      url: '/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd',
      vendor: 'Nhà xuất bản Kim Đồng',
      product_type: 'Light Novel',
      tags: [
        'nxb_Nhà xuất bản Kim Đồng',
        'Sách Tiếng Việt',
        'bia_Bìa mềm',
        'Văn Học',
        'combo_Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp',
        'tacgia_Takata',
        'tacgia_Tom Osabe',
        'tacgia_Azuri Hyuga',
        'sotrang_404',
      ],
      variants: [
        {
          id: 158520038,
          barcode: '9786042243568',
          sku: '9786042243568',
          featured_image: {
            src: 'https://bizweb.dktcdn.net/100/567/082/products/9786042243568.jpg',
          },
        },
      ],
      content: '<p><strong>Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp - Tập 2</strong></p><p>Light novel</p>',
    };
    const adcHtml = '<script>var x={"published_on":"2025-07-11T00:00:01"};</script>';

    const parsed = parseSapoProduct({
      provider: 'adcbook',
      baseUrl: 'https://adcbook.net.vn',
      product: adcProduct,
      html: adcHtml,
      queryIsbn: '9786042243568',
    });

    expect(parsed.matchQuality).toBe('exact_isbn');
    expect(parsed.isbn13).toBe('9786042243568');
    expect(parsed.isbn10).toBe('604224356X');
    expect(parsed.title).toBe('Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp Tập 2');
    expect(parsed.editionName).toBe('Tặng Kèm Postcard');
    expect(parsed.volumeNumber).toBe('2');
    expect(parsed.authors).toEqual(['Takata', 'Tom Osabe', 'Azuri Hyuga']);
    expect(parsed.publishers).toEqual(['Nhà xuất bản Kim Đồng']);
    expect(parsed.publishedYear).toBe(2025);
    expect(parsed.language).toBe('vi');
    expect(parsed.pageCount).toBe(404);
    expect(parsed.format).toBe('paperback');
    expect(parsed.seriesName).toBe('Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp');
    expect(parsed.sourceUrl).toBe(
      'https://adcbook.net.vn/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2-light-novel-kd'
    );
  });

  it('separates explicitly labeled illustrators and translators out of authors', () => {
    const htmlSpecs = `
      <ul>
        <li>Tác giả: Takata</li>
        <li>Minh họa: Tom Osabe, Azuri Hyuga</li>
        <li>Dịch giả: Thế Đăng</li>
        <li>Nhà xuất bản: Nhà xuất bản Kim Đồng</li>
        <li>Số trang: 404</li>
        <li>Định dạng: Bìa mềm</li>
        <li>Năm xuất bản: 2025</li>
      </ul>
    `;
    const specs = extractLabeledSpecsFromHtmlOrText(htmlSpecs);
    expect(specs.authors).toEqual(['Takata']);
    expect(specs.illustrators).toEqual(['Tom Osabe', 'Azuri Hyuga']);
    expect(specs.translators).toEqual(['Thế Đăng']);
    expect(specs.publishers).toEqual(['Nhà xuất bản Kim Đồng']);
    expect(specs.pageCount).toBe(404);
    expect(specs.format).toBe('paperback');
    expect(specs.publishedYear).toBe(2025);

    const openbd = parseOpenBdRecord(
      {
        summary: {
          isbn: '9784041026199',
          title: 'Demo Light Novel',
          publisher: 'KADOKAWA',
          pubdate: '20240115',
          author: 'Author Name',
        },
        onix: {
          DescriptiveDetail: {
            Contributor: [
              { ContributorRole: ['A01'], PersonName: { content: 'Takata' } },
              { ContributorRole: ['A12'], PersonName: { content: 'Tom Osabe' } },
              { ContributorRole: ['B06'], PersonName: { content: 'Thế Đăng' } },
            ],
          },
        },
      },
      '9784041026199'
    );
    expect(openbd?.authors).toEqual(['Takata']);
    expect(openbd?.illustrators).toEqual(['Tom Osabe']);
    expect(openbd?.translators).toEqual(['Thế Đăng']);
  });

  it('parses Haravan (IPM) and Tiki structured records cleanly and normalizes ISO-639-2 languages', () => {
    expect(normalizeLanguageCode('vie')).toBe('vi');
    expect(normalizeLanguageCode('jpn')).toBe('ja');
    expect(normalizeLanguageCode(undefined, { isbn13: '9786042243568' })).toBe('vi');

    const cleaned = cleanVietnameseTitle('Sách - Làm Bạn Với Cô Nàng Tập 2 Tặng Kèm Postcard');
    expect(cleaned.title).toBe('Làm Bạn Với Cô Nàng Tập 2');
    expect(cleaned.editionName).toBe('Tặng Kèm Postcard');
    expect(cleaned.volumeNumber).toBe('2');

    const ipm = parseHaravanProduct({
      provider: 'ipm',
      baseUrl: 'https://ipm.vn',
      product: {
        id: 1001,
        handle: 'yamada-lv999-10',
        title: 'Tình Yêu Lv.999 Của Yamada Và Tôi - 10',
        tags: 'tacgia_MASHIRO,hinhthuc_Bìa mềm,namxb_2026,nhaxb_Hà Nội',
        variants: [{ barcode: '9786044497716', sku: '9786044497716' }],
      },
      queryIsbn: '9786044497716',
    });
    expect(ipm.matchQuality).toBe('exact_isbn');
    expect(ipm.publishers).toContain('Hà Nội');
    expect(ipm.publishedYear).toBe(2026);
    expect(ipm.language).toBe('vi');

    const tiki = parseTikiProduct(
      {
        id: 279831370,
        name: 'Sách - Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp - Tập 2',
        url_path: 'sach-lam-ban-tap-2-p279831370.html',
        authors: [{ name: ' Nhiều tác giả' }],
        specifications: [
          {
            attributes: [
              { code: 'manufacturer', value: 'Nhà Xuất Bản Kim Đồng' },
              { code: 'book_cover', value: 'Bìa mềm' },
              { code: 'number_of_page', value: '404' },
              { code: 'translator', value: 'Thế Đăng' },
            ],
          },
        ],
      },
      '9786042243568'
    );
    expect(tiki?.authors).toEqual([]);
    expect(tiki?.translators).toEqual(['Thế Đăng']);
    expect(tiki?.pageCount).toBe(404);
    expect(tiki?.matchQuality).toBe('approximate');
  });

  it('deduplicates, supplements missing fields, ranks exact matches first, and tracks conflicts', () => {
    const merged = mergeAndRankCandidates(
      [
        {
          externalId: 'approx-1',
          provider: 'nxb_kim_dong',
          verified: false,
          title: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp Tập 2',
          authors: ['Takata'],
          illustrators: ['Tom Osabe'],
          translators: ['Thế Đăng'],
          publishers: ['Nhà xuất bản Kim Đồng'],
          publishedYear: 2025,
          pageCount: 380,
          language: 'vi',
          genres: [],
          isbn13: null,
          isbn10: null,
          matchQuality: 'approximate',
          rawPayload: {},
        },
        {
          externalId: 'exact-1',
          provider: 'adcbook',
          verified: false,
          title: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp Tập 2',
          authors: ['Takata'],
          illustrators: [],
          translators: [],
          publishers: ['Nhà xuất bản Kim Đồng'],
          publishedYear: null,
          pageCount: 404,
          language: 'vi',
          genres: ['Light Novel'],
          isbn13: '9786042243568',
          isbn10: '604224356X',
          sourceUrl: 'https://adcbook.net.vn/lam-ban-2',
          matchQuality: 'exact_isbn',
          matchedIsbn: '9786042243568',
          rawPayload: {},
        },
      ],
      '9786042243568'
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].matchQuality).toBe('exact_isbn');
    expect(merged[0].pageCount).toBe(404); // Preserved exact-ISBN page count!
    expect(merged[0].illustrators).toEqual(['Tom Osabe']); // Supplemented missing field
    expect(merged[0].translators).toEqual(['Thế Đăng']); // Supplemented missing field
    expect(merged[0].contributingProviders).toEqual(['adcbook', 'nxb_kim_dong']);
    expect(merged[0].fieldConflicts?.pageCount).toHaveLength(2); // Conflict visibly recorded!
  });

  it('queries all providers concurrently, isolates errors, and handles valid unknown ISBN cleanly', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('googleapis.com')) {
        return new Response('quota exceeded', { status: 429 });
      }
      if (url.includes('adcbook.net.vn/search')) {
        return new Response(
          JSON.stringify({
            results_total: 1,
            results: [{ url: '/test-book-vn', title: 'Test VN Book' }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('adcbook.net.vn/test-book-vn.json')) {
        return new Response(
          JSON.stringify({
            id: 42,
            name: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp Tập 2',
            vendor: 'Nhà xuất bản Kim Đồng',
            tags: ['tacgia_Takata', 'sotrang_404', 'bia_Bìa mềm', 'Sách Tiếng Việt'],
            variants: [{ barcode: '9786042243568', sku: '9786042243568' }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('adcbook.net.vn/test-book-vn')) {
        return new Response('<html><script>"published_on":"2025-07-11T00:00:01"</script></html>', {
          status: 200,
        });
      }
      if (url.includes('openlibrary.org')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify({ results_total: 0, results: [] }), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const res = await lookupMetadataByIsbnDetailed('9786042243568');
    expect(res.isValidIsbn).toBe(true);
    expect(res.hasExactIsbnMatch).toBe(true);
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].provider).toBe('adcbook');
    expect(res.candidates[0].publishedYear).toBe(2025);
    expect(res.candidates[0].pageCount).toBe(404);
    expect(res.candidates[0].language).toBe('vi');

    const googleStatus = res.providerStatuses.find((s) => s.provider === 'google_books');
    expect(googleStatus?.status).toBe('error');

    // Now test a valid ISBN with 0 matches across all providers
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ results_total: 0, results: [] }), { status: 200 }))
    );
    const emptyRes = await lookupMetadataByIsbnDetailed('9791090636071');
    expect(emptyRes.isValidIsbn).toBe(true);
    expect(emptyRes.normalizedIsbn13).toBe('9791090636071');
    expect(emptyRes.normalizedIsbn10).toBeNull();
    expect(emptyRes.candidates).toEqual([]);
    expect(emptyRes.hasExactIsbnMatch).toBe(false);
  });
});
