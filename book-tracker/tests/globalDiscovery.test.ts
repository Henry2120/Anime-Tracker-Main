import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/dexie';
import { createBookBundle } from '../src/services/libraryService';
import {
  mergeCandidateIntoDraft,
  partitionAndMergeCandidates,
  type ManualDraftFields,
} from '../src/services/metadata/pipeline';
import {
  bnfFranceProvider,
  britishLibraryProvider,
  crossrefProvider,
  ndlJapanProvider,
  nlcChinaProvider,
  nlKoreaProvider,
  openBdProvider,
  openLibraryProvider,
  parseBnfSruDublinCoreXml,
  parseNdlOpenSearchXml,
  taiwanNclProvider,
} from '../src/services/metadata/providers';
import {
  clearMetadataLookupCache,
  lookupMetadataWithReportByIsbn,
  searchMetadataWithReportByQuery,
} from '../src/services/metadataService';
import type { MetadataCandidate } from '../src/types/domain';
import { parseIsbn } from '../src/utils/isbn';

afterEach(async () => {
  clearMetadataLookupCache();
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((t) => t.clear()));
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function textResponse(body: string, status = 200, contentType = 'application/xml; charset=utf-8'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

const SAMPLE_NDL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcndl="http://ndl.go.jp/dcndl/terms/">
  <channel>
    <item>
      <title>僕のヒーローアカデミア 24</title>
      <link>https://ndlsearch.ndl.go.jp/books/R100000002-I029770492</link>
      <author>堀越, 耕平,原作・漫画,</author>
      <description><![CDATA[<p>堀越耕平 漫画</p>]]></description>
      <dc:title>僕のヒーローアカデミア</dc:title>
      <dcndl:volume>24</dcndl:volume>
      <dcndl:seriesTitle>ジャンプコミックス</dcndl:seriesTitle>
      <dc:creator>堀越, 耕平</dc:creator>
      <dc:publisher>集英社</dc:publisher>
      <dcterms:issued>2019.8</dcterms:issued>
      <dc:identifier>9784088820200</dc:identifier>
      <dc:extent>192p</dc:extent>
      <dcndl:genre>マンガ</dcndl:genre>
    </item>
  </channel>
</rss>`;

const SAMPLE_BNF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <srw:records>
    <srw:record>
      <srw:recordData>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
          <dc:identifier>https://catalogue.bnf.fr/ark:/12148/cb41046738k</dc:identifier>
          <dc:title>Le petit prince / Antoine de Saint-Exupéry</dc:title>
          <dc:creator>Saint-Exupéry, Antoine de (1900-1944)</dc:creator>
          <dc:publisher>Gallimard (Paris)</dc:publisher>
          <dc:date>2007</dc:date>
          <dc:format>1 vol. (97 p.)</dc:format>
          <dc:identifier>ISBN 978-2-07-061275-8</dc:identifier>
          <dc:language>fre</dc:language>
        </oai_dc:dc>
      </srw:recordData>
    </srw:record>
  </srw:records>
</srw:searchRetrieveResponse>`;

describe('Global Book Metadata Discovery Engine', () => {
  it('resolves translated editions via Open Library (/isbn + /api/books), preserving originalTitle & translator', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('openlibrary.org/api/books')) {
        return jsonResponse({
          'ISBN:9780140449136': {
            title: 'Crime and Punishment',
            authors: [{ name: 'Fyodor Dostoyevsky' }],
            publishers: [{ name: 'Penguin Classics' }],
            publish_date: '2003',
            number_of_pages: 656,
            subjects: [{ name: 'Russian fiction' }],
            cover: { large: 'https://covers.openlibrary.org/b/id/9001-L.jpg' },
          },
        });
      }
      if (url.includes('openlibrary.org/isbn/9780140449136.json')) {
        return jsonResponse({
          key: '/books/OL123M',
          title: 'Crime and Punishment',
          work_titles: ['Prestuplenie i nakazanie'],
          by_statement: 'translated by David McDuff.',
          languages: [{ key: '/languages/eng' }],
          physical_format: 'Paperback',
          edition_name: 'Penguin Classics Edition',
        });
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('0-14-044913-2', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [openLibraryProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const book = res.exactMatches![0];
    expect(book.isbn13).toBe('9780140449136');
    expect(book.isbn10).toBe('0140449132');
    expect(book.title).toBe('Crime and Punishment');
    expect(book.originalTitle).toBe('Prestuplenie i nakazanie');
    expect(book.translators).toEqual(['David McDuff']);
    expect(book.format).toBe('paperback');
    expect(book.language).toBe('en');
    expect(book.editionName).toBe('Penguin Classics Edition');
    expect(book.fieldProvenance?.title?.trust).toBe('verified');
    expect(book.fieldProvenance?.originalTitle?.provider).toBe('open_library');
  });

  it('parses CrossRef academic books with editors and DOI provenance', async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        message: {
          items: [
            {
              DOI: '10.1007/978-3-030-12345-6',
              ISBN: ['9783030123451'],
              title: ['Distributed Systems Engineering'],
              author: [{ given: 'Ada', family: 'Lovelace' }],
              editor: [{ given: 'Grace', family: 'Hopper' }],
              publisher: 'Springer International Publishing',
              issued: { 'date-parts': [[2023]] },
              language: 'en',
              URL: 'https://doi.org/10.1007/978-3-030-12345-6',
            },
          ],
        },
      })
    ) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9783030123451', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [crossrefProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const book = res.exactMatches![0];
    expect(book.provider).toBe('crossref');
    expect(book.authors).toEqual(['Ada Lovelace']);
    expect(book.editors).toEqual(['Grace Hopper']);
    expect(book.contributors).toEqual(
      expect.arrayContaining([
        { name: 'Ada Lovelace', role: 'author' },
        { name: 'Grace Hopper', role: 'editor' },
      ])
    );
  });

  it('resolves Japanese manga via NDL Japan + openBD with series, volume, and role preservation', async () => {
    const ndlParsed = parseNdlOpenSearchXml(SAMPLE_NDL_XML, '9784088820200');
    expect(ndlParsed).toHaveLength(1);
    expect(ndlParsed[0].title).toBe('僕のヒーローアカデミア 24');
    expect(ndlParsed[0].seriesName).toBe('ジャンプコミックス');
    expect(ndlParsed[0].volumeNumber).toBe('24');
    expect(ndlParsed[0].language).toBe('ja');
    expect(ndlParsed[0].pageCount).toBe(192);
    expect(ndlParsed[0].illustrators).toEqual(['堀越耕平']);

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('ndlsearch.ndl.go.jp')) return textResponse(SAMPLE_NDL_XML);
      if (url.includes('api.openbd.jp')) {
        return jsonResponse([
          {
            summary: {
              isbn: '9784088820200',
              title: '僕のヒーローアカデミア 24',
              publisher: '集英社',
              pubdate: '20190802',
              author: '堀越耕平',
              cover: 'https://cover.openbd.jp/9784088820200.jpg',
            },
          },
        ]);
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const res = await lookupMetadataWithReportByIsbn('9784088820200', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [ndlJapanProvider, openBdProvider],
    });

    expect(res.exactMatchCount).toBe(1);
    const merged = res.exactMatches![0];
    expect(merged.sources).toEqual(expect.arrayContaining(['ndl_japan', 'openbd']));
    expect(merged.coverUrl).toBe('https://cover.openbd.jp/9784088820200.jpg');
    expect(merged.fieldProvenance?.title?.provider).toBe('ndl_japan');
    expect(merged.fieldProvenance?.coverUrl?.provider).toBe('openbd');
  });

  it('preserves Hangul & CJK scripts for Korean & Chinese editions and reports unavailable catalogues honestly', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('9788936434120')) {
        if (url.includes('/api/books')) {
          return jsonResponse({
            'ISBN:9788936434120': {
              title: '소년이 온다',
              authors: [{ name: '한강' }],
              publishers: [{ name: '창비' }],
              publish_date: '2014',
              number_of_pages: 215,
            },
          });
        }
        return jsonResponse({
          key: '/books/OLkr',
          title: '소년이 온다',
          languages: [{ key: '/languages/kor' }],
        });
      }
      if (url.includes('9787536692930')) {
        if (url.includes('/api/books')) {
          return jsonResponse({
            'ISBN:9787536692930': {
              title: '三体',
              authors: [{ name: '刘慈欣' }],
              publishers: [{ name: '重庆出版社' }],
              publish_date: '2008',
              number_of_pages: 302,
            },
          });
        }
        return jsonResponse({
          key: '/books/OLcn',
          title: '三体',
          languages: [{ key: '/languages/chi' }],
        });
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const krRes = await lookupMetadataWithReportByIsbn('9788936434120', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [openLibraryProvider, nlKoreaProvider],
    });
    expect(krRes.exactMatches![0].title).toBe('소년이 온다');
    expect(krRes.exactMatches![0].language).toBe('ko');
    expect(krRes.providerStatuses.find((s) => s.provider === 'nl_korea')?.status).toBe('api_key_required');

    const cnRes = await lookupMetadataWithReportByIsbn('9787536692930', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      forceAllProviders: true,
      adapters: [openLibraryProvider, taiwanNclProvider, nlcChinaProvider, britishLibraryProvider],
    });
    expect(cnRes.exactMatches![0].title).toBe('三体');
    expect(cnRes.exactMatches![0].authors).toEqual(['刘慈欣']);
    expect(cnRes.exactMatches![0].language).toBe('zh');
    expect(cnRes.providerStatuses.find((s) => s.provider === 'taiwan_ncl')?.status).toBe('unsupported_interface');
    expect(cnRes.providerStatuses.find((s) => s.provider === 'nlc_china')?.status).toBe('unsupported_interface');
    expect(cnRes.providerStatuses.find((s) => s.provider === 'british_library')?.status).toBe('unsupported_interface');
  });

  it('parses French catalogue records via BnF SRU Dublin Core XML', async () => {
    const parsed = parseBnfSruDublinCoreXml(SAMPLE_BNF_XML, '9782070612758');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Le petit prince');
    expect(parsed[0].authors).toEqual(['Saint-Exupéry, Antoine de']);
    expect(parsed[0].publishers).toEqual(['Gallimard']);
    expect(parsed[0].publishedYear).toBe(2007);
    expect(parsed[0].pageCount).toBe(97);
    expect(parsed[0].language).toBe('fr');

    const mockFetch = vi.fn(async () => textResponse(SAMPLE_BNF_XML)) as unknown as typeof fetch;
    const res = await lookupMetadataWithReportByIsbn('9782070612758', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [bnfFranceProvider],
    });
    expect(res.exactMatchCount).toBe(1);
    expect(res.exactMatches![0].provider).toBe('bnf_france');
  });

  it('never merges distinct editions with the same title/author across different languages, formats, or years', () => {
    const jaEdition: MetadataCandidate = {
      externalId: 'ed-ja',
      provider: 'ndl_japan',
      verified: false,
      matchConfidence: 'title_match',
      title: 'Norwegian Wood',
      authors: ['Haruki Murakami'],
      translators: [],
      publishers: ['Kodansha'],
      publishedYear: 1987,
      language: 'ja',
      format: 'paperback',
      genres: [],
      rawPayload: {},
    };
    const enHardcover: MetadataCandidate = {
      externalId: 'ed-en',
      provider: 'open_library',
      verified: false,
      matchConfidence: 'title_match',
      title: 'Norwegian Wood',
      authors: ['Haruki Murakami'],
      translators: ['Jay Rubin'],
      publishers: ['Vintage International'],
      publishedYear: 2024,
      language: 'en',
      format: 'hardcover',
      genres: [],
      rawPayload: {},
    };
    const viPaperback: MetadataCandidate = {
      externalId: 'ed-vi',
      provider: 'nha_nam',
      verified: false,
      matchConfidence: 'title_match',
      title: 'Norwegian Wood',
      authors: ['Haruki Murakami'],
      translators: ['Trịnh Lữ'],
      publishers: ['Nhã Nam'],
      publishedYear: 2021,
      language: 'vi',
      format: 'paperback',
      genres: [],
      rawPayload: {},
    };

    const partitioned = partitionAndMergeCandidates([jaEdition, enHardcover, viPaperback], null);
    expect(partitioned.workMatches).toHaveLength(3);
  });

  it('demotes same-ISBN candidates with completely unrelated titles into possibleEditionMatches with contradiction alert', () => {
    const bookA: MetadataCandidate = {
      externalId: '1',
      provider: 'open_library',
      verified: false,
      matchConfidence: 'exact_isbn',
      title: 'Quantum Mechanics Volume 1',
      authors: ['Claude Cohen-Tannoudji'],
      translators: [],
      publishers: ['Wiley'],
      language: 'en',
      genres: [],
      isbn13: '9780471164333',
      rawPayload: {},
    };
    const bookB: MetadataCandidate = {
      externalId: '2',
      provider: 'google_books',
      verified: false,
      matchConfidence: 'exact_isbn',
      title: 'Cooking Recipes of Tuscany',
      authors: ['Mario Rossi'],
      translators: [],
      publishers: ['Roma Press'],
      language: 'en',
      genres: [],
      isbn13: '9780471164333',
      rawPayload: {},
    };

    const res = partitionAndMergeCandidates([bookA, bookB], '9780471164333');
    expect(res.exactMatches).toHaveLength(0);
    expect(res.possibleEditionMatches).toHaveLength(1);
    expect(res.possibleEditionMatches[0].contradictions?.[0]).toContain('Title mismatch');
    expect(res.possibleEditionMatches[0].editionMatchLevel).toBe('possible_edition');
  });

  it('supports books without ISBNs via keyword search, rejects invalid ISBNs, and persists works/editions with provenance', async () => {
    expect(parseIsbn('9780140449139').isValid).toBe(false);

    const mockFetch = vi.fn(async () =>
      jsonResponse({
        docs: [
          {
            key: '/works/OL99W',
            title: 'Indie Poetry Zine Issue 4',
            author_name: ['Minh Anh'],
            first_publish_year: 2024,
            language: ['vie'],
          },
        ],
      })
    ) as unknown as typeof fetch;

    const searchRes = await searchMetadataWithReportByQuery('Indie Poetry Zine', {
      fetchFn: mockFetch,
      preferEdgeFunction: false,
      adapters: [openLibraryProvider],
    });
    expect(searchRes.workMatches).toHaveLength(1);
    expect(searchRes.workMatches![0].isbn13).toBeNull();

    const bundle = await createBookBundle({
      work: {
        title: 'Indie Poetry Zine Issue 4',
        authors: ['Minh Anh'],
        genres: ['Poetry'],
        metadataSource: 'open_library',
        fieldProvenance: { title: { provider: 'open_library', trust: 'approximate' } },
      },
      edition: {
        title: 'Indie Poetry Zine Issue 4',
        language: 'vi',
        format: 'paperback',
        metadataSource: 'manual',
        fieldProvenance: { title: { provider: 'manual', trust: 'manual' } },
      },
      createCopy: true,
      copy: {
        ownershipStatus: 'owned',
        format: 'paperback',
        condition: 'new',
        acquisitionMethod: 'purchased',
      },
    });

    const savedWork = await db.works.get(bundle.work.id);
    const savedEd = await db.editions.get(bundle.edition.id);
    const savedIsbns = await db.edition_isbns.toArray();
    expect(savedWork?.fieldProvenance?.title?.provider).toBe('open_library');
    expect(savedEd?.fieldProvenance?.title?.trust).toBe('manual');
    expect(savedIsbns).toHaveLength(0);
  });

  it('implements staged short-circuiting, manual provenance protection, and partial retryFailedOnly caching', async () => {
    // 1. Short-circuit Stage 2 when Stage 1 produces sufficiently verified exact edition
    const mockStagedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('ndlsearch')) return textResponse(SAMPLE_NDL_XML);
      if (url.includes('openbd')) {
        return jsonResponse([
          {
            summary: {
              isbn: '9784088820200',
              title: '僕のヒーローアカデミア 24',
              publisher: '集英社',
              pubdate: '20190802',
              author: '堀越耕平',
              cover: 'https://cover.openbd.jp/9784088820200.jpg',
            },
          },
        ]);
      }
      if (url.includes('catalogue.bnf.fr')) {
        throw new Error('Stage 2 BnF should not be called when Stage 1 succeeded!');
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const stagedRes = await lookupMetadataWithReportByIsbn('9784088820200', {
      fetchFn: mockStagedFetch,
      preferEdgeFunction: false,
      adapters: [ndlJapanProvider, openBdProvider, bnfFranceProvider],
    });
    expect(stagedRes.stagesExecuted).toEqual(['stage1']);
    expect(stagedRes.providerStatuses.find((s) => s.provider === 'bnf_france')).toBeUndefined();

    // 2. Partial retry of failed providers only (`retryFailedOnly: true`)
    let callPhase = 1;
    let ndlCalls = 0;
    const mockRetryFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('ndlsearch')) {
        ndlCalls++;
        return textResponse(SAMPLE_NDL_XML);
      }
      if (url.includes('openbd')) {
        if (callPhase === 1) throw new DOMException('Aborted', 'AbortError');
        return jsonResponse([
          {
            summary: {
              isbn: '9784088820200',
              title: '僕のヒーローアカデミア 24',
              publisher: '集英社',
              pubdate: '20190802',
              author: '堀越耕平',
              cover: 'https://cover.openbd.jp/9784088820200.jpg',
            },
          },
        ]);
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    clearMetadataLookupCache();
    const initial = await lookupMetadataWithReportByIsbn('9784088820200', {
      fetchFn: mockRetryFetch,
      preferEdgeFunction: false,
      useCache: true,
      adapters: [ndlJapanProvider, openBdProvider],
    });
    expect(initial.providerStatuses.find((s) => s.provider === 'openbd')?.status).toBe('timeout');
    expect(initial.exactMatches![0].coverUrl).toBeUndefined();
    expect(ndlCalls).toBe(1);

    callPhase = 2;
    const retried = await lookupMetadataWithReportByIsbn('9784088820200', {
      fetchFn: mockRetryFetch,
      preferEdgeFunction: false,
      retryFailedOnly: true,
      adapters: [ndlJapanProvider, openBdProvider],
    });
    // NDL was NOT re-queried; openBD WAS retried and filled in the cover cleanly
    expect(ndlCalls).toBe(1);
    expect(retried.providerStatuses.find((s) => s.provider === 'openbd')?.status).toBe('exact_match');
    expect(retried.exactMatches![0].coverUrl).toBe('https://cover.openbd.jp/9784088820200.jpg');
    expect(retried.exactMatches![0].fieldProvenance?.coverUrl?.provider).toBe('openbd');

    // 3. Manual draft edit protection sets 'manual' trust provenance
    const current: ManualDraftFields = {
      title: 'Custom Edition Title',
      originalTitle: '',
      authorsText: '',
      translatorsText: '',
      illustratorsText: '',
      publishersText: '',
      publishingPartner: '',
      genresText: '',
      language: 'ja',
      pageCount: '',
      publishedYear: '',
      seriesName: '',
      volumeNumber: '',
      coverUrl: '',
      description: '',
      isbnInput: '',
    };
    const draft = mergeCandidateIntoDraft(current, retried.exactMatches![0], ['title']);
    expect(draft.title).toBe('Custom Edition Title');
    expect(draft.fieldProvenance?.title).toEqual({ provider: 'manual', trust: 'manual' });
    expect(draft.fieldProvenance?.coverUrl?.provider).toBe('openbd');
  });
});
