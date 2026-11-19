import { createServer } from 'vite';

const TEST_ISBNS = [
  {
    isbn: '9786042243568',
    expected: 'Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp – Tập 2 (Takata / Thế Đăng / Kim Đồng / 404p / vi)',
  },
  {
    isbn: '9786043590296',
    expected:
      'Cô nàng Otaku nhà tôi – Tập 1 (Rin Murakami / Mako Tatekawa / KPS / Amak Books / NXB Hà Nội / 384p / 2022 / vi)',
  },
  {
    isbn: '9786044777986',
    expected: 'Dũng cảm để trưởng thành (Choi Seoyoung / Sun Tzô / Văn học / 216p / 2024 / vi)',
  },
];

const server = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { lookupMetadataWithReportByIsbn } = await server.ssrLoadModule(
    '/src/services/metadataService.ts'
  );

  for (const item of TEST_ISBNS) {
    console.log('\n====================================================================');
    console.log(`ISBN: ${item.isbn}`);
    console.log(`Expected: ${item.expected}`);
    const result = await lookupMetadataWithReportByIsbn(item.isbn, {
      preferEdgeFunction: false,
      timeoutMs: 12000,
    });

    console.log(`Exact matches: ${result.exactMatchCount} | Total candidates: ${result.candidates.length}`);
    console.log('Provider statuses:');
    for (const st of result.providerStatuses) {
      console.log(
        `  - ${st.provider.padEnd(14)} | ${st.status.padEnd(23)} | candidates=${st.candidateCount} exact=${st.exactMatchCount}${st.message ? ` (${st.message})` : ''}`
      );
    }

    for (const c of result.candidates) {
      console.log('\nMerged Candidate:');
      console.log({
        confidence: c.matchConfidence,
        sources: c.sources ?? [c.provider],
        title: c.title,
        authors: c.authors,
        translators: c.translators,
        illustrators: c.illustrators,
        publishers: c.publishers,
        publishingPartner: c.publishingPartner,
        pageCount: c.pageCount,
        publishedYear: c.publishedYear,
        language: c.language,
        isbn13: c.isbn13,
        coverUrl: c.coverUrl,
        sourceUrl: c.sourceUrl,
        conflicts: c.conflicts,
      });
    }
  }
} finally {
  await server.close();
}
