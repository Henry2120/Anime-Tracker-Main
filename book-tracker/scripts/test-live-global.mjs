import { createServer } from 'vite';

const TEST_ISBNS = [
  // Mandatory Vietnamese regressions
  { isbn: '9786042243568', label: 'VN Test 1: Làm Bạn Với Cô Nàng Dễ Thương Nhì Lớp – Tập 2' },
  { isbn: '9786043590296', label: 'VN Test 2: Cô nàng Otaku nhà tôi – Tập 1' },
  { isbn: '9786044777986', label: 'VN Test 3: Dũng cảm để trưởng thành' },
  // Global multilingual live checks
  { isbn: '9780140449136', label: 'Global EN/RU translation: Crime and Punishment (Penguin)' },
  { isbn: '9784088820200', label: 'Global JP Manga: 僕のヒーローアカデミア 24 (NDL + openBD)' },
  { isbn: '9788936434120', label: 'Global KR Fiction: 소년이 온다 (Han Kang)' },
  { isbn: '9787536692930', label: 'Global CN Sci-Fi: 三体 (Liu Cixin)' },
  { isbn: '9782070612758', label: 'Global FR Fiction: Le petit prince (BnF SRU)' },
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
    console.log(`${item.label} | ISBN: ${item.isbn}`);
    const result = await lookupMetadataWithReportByIsbn(item.isbn, {
      preferEdgeFunction: false,
      timeoutMs: 12000,
    });

    console.log(
      `Stages: ${(result.stagesExecuted ?? []).join(' -> ')} | Exact: ${result.exactMatchCount} | Possible: ${(result.possibleEditionMatches ?? []).length}`
    );
    const activeHits = result.providerStatuses.filter((s) => s.candidateCount > 0);
    for (const st of activeHits) {
      console.log(`  [HIT] ${st.provider}: status=${st.status} count=${st.candidateCount}`);
    }
    const unavailable = result.providerStatuses.filter(
      (s) => s.status !== 'exact_match' && s.status !== 'approximate_match' && s.status !== 'no_match'
    );
    if (unavailable.length > 0) {
      console.log(
        '  [UNAVAILABLE]',
        unavailable.map((u) => `${u.provider}=${u.status}`).join(', ')
      );
    }

    const best = result.exactMatches?.[0] ?? result.candidates?.[0];
    if (best) {
      console.log({
        title: best.title,
        originalTitle: best.originalTitle,
        authors: best.authors,
        translators: best.translators,
        illustrators: best.illustrators,
        publishers: best.publishers,
        language: best.language,
        pageCount: best.pageCount,
        publishedYear: best.publishedYear,
        sources: best.sources,
        provenanceFields: Object.keys(best.fieldProvenance ?? {}),
      });
    } else {
      console.log('No exact match resolved live.');
    }
  }
} finally {
  await server.close();
}
