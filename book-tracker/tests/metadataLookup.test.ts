import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractVietnameseBookSpecs } from '../src/services/metadata/htmlAndText';
import {
  adcbookProvider,
  amakProvider,
  openBdProvider,
  phuongNamProvider,
  tikiProvider,
} from '../src/services/metadata/providers';
import {
  clearMetadataLookupCache,
  lookupMetadataWithReportByIsbn,
} from '../src/services/metadataService';

afterEach(() => {
  clearMetadataLookupCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

describe('Metadata providers, ONIX roles, TTL cache & controlled fallback', () => {
  it('parses Sapo (ADCBook) prefixed tags (sotrang_, tacgia_, bia_) and published_on JSON year', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('adcbook.net.vn/search')) {
        return jsonResponse({
          results_total: 1,
          results: [
            {
              url: '/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2',
              title: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp – Tập 2',
            },
          ],
        });
      }
      if (url.includes('adcbook.net.vn/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2.json')) {
        return jsonResponse({
          id: 57188029,
          name: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp – Tập 2',
          alias: 'lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2',
          vendor: 'Nhà xuất bản Kim Đồng',
          tags: [
            'nxb_Nhà xuất bản Kim Đồng',
            'bia_Bìa mềm',
            'tacgia_Takata',
            'dichgia_Thế Đăng',
            'hoasi_Tom Osabe',
            'sotrang_404',
          ],
          variants: [{ sku: '9786042243568', barcode: '9786042243568' }],
        });
      }
      if (url.includes('adcbook.net.vn/lam-ban-voi-co-nang-de-thuong-nhi-lop-tap-2')) {
        return htmlResponse('<html><script>var p={"published_on":"2025-07-11T00:00:01"};</script></html>');
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9786042243568', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [adcbookProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const book = res.exactMatches![0];
    expect(book.authors).toEqual(['Takata']);
    expect(book.translators).toEqual(['Thế Đăng']);
    expect(book.illustrators).toEqual(['Tom Osabe']);
    expect(book.pageCount).toBe(404);
    expect(book.format).toBe('paperback');
    expect(book.publishedYear).toBe(2025);
    expect(book.isbn13).toBe('9786042243568');
    expect(book.isbn10).toBe('604224356X');
  });

  it('extracts OpenBD ONIX contributor roles (A01 author, A12 illustrator, B06 translator)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        {
          summary: {
            isbn: '9784041026199',
            title: 'Demo Light Novel',
            publisher: 'KADOKAWA',
            pubdate: '20240115',
            author: 'Fallback Author',
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
      ])
    ) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9784041026199', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [openBdProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const book = res.exactMatches![0];
    expect(book.authors).toEqual(['Takata']);
    expect(book.illustrators).toEqual(['Tom Osabe']);
    expect(book.translators).toEqual(['Thế Đăng']);
    expect(book.publishedYear).toBe(2024);
    expect(book.language).toBe('ja');
  });

  it('parses Haravan Phuong Nam and WordPress Amak book pages accurately', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('nhasachphuongnam.com/search')) {
        return htmlResponse('<a href="/products/dung-cam-de-truong-thanh">Dũng cảm để trưởng thành</a>');
      }
      if (url.includes('nhasachphuongnam.com/products/dung-cam-de-truong-thanh.json')) {
        return jsonResponse({
          product: {
            id: 222111,
            title: 'Dũng Cảm Để Trưởng Thành',
            handle: 'dung-cam-de-truong-thanh',
            vendor: 'Nhà xuất bản Văn Học',
            tags: ['tacgia_Choi Seoyoung', 'dichgia_Sun Tzô', 'sotrang_216', 'namxb_2024'],
            variants: [{ sku: '9786044777986', barcode: '9786044777986' }],
            body_html: '<p>Dũng cảm để trưởng thành</p>',
          },
        });
      }
      if (url.includes('amak.vn/?s=')) {
        return htmlResponse('<a href="https://amak.vn/book/co-nang-otaku-nha-toi-tap-1/">Otaku 1</a>');
      }
      if (url.includes('amak.vn/book/co-nang-otaku-nha-toi-tap-1/')) {
        return htmlResponse(`
          <html>
            <head><meta property="og:image" content="https://amak.vn/wp-content/uploads/otaku-1.jpg" /></head>
            <body>
              <h1>Cô nàng Otaku nhà tôi – Tập 1</h1>
              <ul>
                <li>Tác giả: Rin Murakami</li>
                <li>Minh họa: Mako Tatekawa</li>
                <li>Dịch giả: KPS</li>
                <li>Số trang: 384 trang</li>
                <li>ISBN: 978-604-359-029-6</li>
                <li>Nhà xuất bản: NXB Hà Nội</li>
                <li>Năm xuất bản: 2022</li>
              </ul>
            </body>
          </html>
        `);
      }
      return htmlResponse('Not found', 404);
    }) as unknown as typeof fetch;

    const pnRes = await lookupMetadataWithReportByIsbn('9786044777986', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [phuongNamProvider],
    });
    expect(pnRes.exactMatchCount).toBe(1);
    expect(pnRes.exactMatches![0].provider).toBe('phuong_nam');
    expect(pnRes.exactMatches![0].authors).toEqual(['Choi Seoyoung']);
    expect(pnRes.exactMatches![0].translators).toEqual(['Sun Tzô']);
    expect(pnRes.exactMatches![0].pageCount).toBe(216);
    expect(pnRes.exactMatches![0].publishedYear).toBe(2024);

    const amakRes = await lookupMetadataWithReportByIsbn('9786043590296', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [amakProvider],
    });
    expect(amakRes.exactMatchCount).toBe(1);
    expect(amakRes.exactMatches![0].provider).toBe('amak');
    expect(amakRes.exactMatches![0].illustrators).toEqual(['Mako Tatekawa']);
    expect(amakRes.exactMatches![0].translators).toEqual(['KPS']);
    expect(amakRes.exactMatches![0].pageCount).toBe(384);
  });

  it('caches lookup results with TTL and bypasses cache cleanly on Retry', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls++;
      const url = String(input);
      if (url.includes('openbd')) {
        return jsonResponse([
          {
            summary: {
              isbn: '9784041026199',
              title: 'Cached Title',
              publisher: 'Kadokawa',
              pubdate: '20240101',
              author: 'Tester',
            },
          },
        ]);
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const first = await lookupMetadataWithReportByIsbn('9784041026199', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [openBdProvider],
      useCache: true,
    });
    expect(first.fromCache).toBe(false);
    expect(calls).toBe(1);

    const second = await lookupMetadataWithReportByIsbn('9784041026199', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [openBdProvider],
      useCache: true,
    });
    expect(second.fromCache).toBe(true);
    expect(calls).toBe(1);

    const retried = await lookupMetadataWithReportByIsbn('9784041026199', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [openBdProvider],
      bypassCache: true,
    });
    expect(retried.fromCache).toBe(false);
    expect(calls).toBe(2);
  });

  it('routes fallbackTitleQuery hits exclusively to approximateMatches and never exactMatches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('tiki.vn/api/v2/products?limit=5')) {
        return jsonResponse({ data: [] });
      }
      if (url.includes('tiki.vn/api/v2/products?limit=6')) {
        return jsonResponse({
          data: [
            {
              id: 777,
              name: 'Dũng cảm để trưởng thành (Bản tái bản)',
              author_name: 'Choi Seoyoung',
              url_path: 'dung-cam-de-truong-thanh-p777.html',
            },
          ],
        });
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9786044777986', {
      fetchFn: fetchMock,
      preferEdgeFunction: false,
      adapters: [tikiProvider],
      fallbackTitleQuery: 'Dũng cảm để trưởng thành',
    });

    expect(res.exactMatchCount).toBe(0);
    expect(res.exactMatches).toHaveLength(0);
    expect(res.candidates).toHaveLength(0);
    expect(res.approximateMatches).toHaveLength(1);
    expect(res.approximateMatches![0].matchConfidence).toBe('approximate_match');
    expect(res.approximateMatches![0].title).toContain('Dũng cảm để trưởng thành');
  });

  it('extracts labeled specs cleanly from Vietnamese catalogue HTML', () => {
    const specs = extractVietnameseBookSpecs(`
      <ul>
        <li>Tác giả: Takata</li>
        <li>Minh họa: Tom Osabe, Azuri Hyuga</li>
        <li>Dịch giả: Thế Đăng</li>
        <li>Nhà xuất bản: Nhà xuất bản Kim Đồng</li>
        <li>Số trang: 404</li>
        <li>Năm xuất bản: 2025</li>
      </ul>
    `);
    expect(specs.authors).toEqual(['Takata']);
    expect(specs.illustrators).toEqual(['Tom Osabe', 'Azuri Hyuga']);
    expect(specs.translators).toEqual(['Thế Đăng']);
    expect(specs.pageCount).toBe(404);
    expect(specs.publishedYear).toBe(2025);
  });
});
