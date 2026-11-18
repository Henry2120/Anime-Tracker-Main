import type { Edition, ReadingCycle, Work } from '../types/domain';

export interface DiscoveryRelations {
  otherEditionsOfWork: Edition[];
  sameAuthorWorks: Work[];
  samePublisherWorks: Work[];
  similarGenreWorks: Work[];
}

export function computeLocalDiscoveryRelations(params: {
  targetWork: Work;
  targetEditionId?: string;
  allWorks: Work[];
  allEditions: Edition[];
}): DiscoveryRelations {
  const activeWorks = params.allWorks.filter((w) => !w.deletedAt && w.id !== params.targetWork.id);
  const activeEditions = params.allEditions.filter((e) => !e.deletedAt);

  const otherEditionsOfWork = activeEditions.filter(
    (e) => e.workId === params.targetWork.id && e.id !== params.targetEditionId
  );

  const targetAuthors = new Set(params.targetWork.authors.map((a) => a.toLowerCase().trim()));
  const sameAuthorWorks = activeWorks.filter((w) =>
    w.authors.some((a) => targetAuthors.has(a.toLowerCase().trim()))
  );

  const targetPublishers = new Set(
    activeEditions
      .filter((e) => e.workId === params.targetWork.id)
      .flatMap((e) => e.publishers.map((p) => p.toLowerCase().trim()))
  );
  const samePublisherWorkIds = new Set(
    activeEditions
      .filter(
        (e) =>
          e.workId !== params.targetWork.id &&
          e.publishers.some((p) => targetPublishers.has(p.toLowerCase().trim()))
      )
      .map((e) => e.workId)
  );
  const samePublisherWorks = activeWorks.filter((w) => samePublisherWorkIds.has(w.id));

  const targetGenres = new Set(params.targetWork.genres.map((g) => g.toLowerCase().trim()));
  const similarGenreWorks = activeWorks.filter(
    (w) =>
      w.genres.some((g) => targetGenres.has(g.toLowerCase().trim())) &&
      !sameAuthorWorks.some((sa) => sa.id === w.id)
  );

  return {
    otherEditionsOfWork,
    sameAuthorWorks,
    samePublisherWorks,
    similarGenreWorks: similarGenreWorks.slice(0, 8),
  };
}

export function buildReadingHistoryRecommendations(params: {
  works: Work[];
  cycles: ReadingCycle[];
}): Work[] {
  const activeWorks = params.works.filter((w) => !w.deletedAt);
  const activeCycles = params.cycles.filter((c) => !c.deletedAt);

  const finishedGenres = new Map<string, number>();
  const finishedAuthors = new Map<string, number>();
  const startedWorkIds = new Set(activeCycles.map((c) => c.workId));

  for (const c of activeCycles) {
    if (c.status !== 'finished') continue;
    const w = activeWorks.find((x) => x.id === c.workId);
    if (!w) continue;
    for (const g of w.genres) {
      finishedGenres.set(g.toLowerCase(), (finishedGenres.get(g.toLowerCase()) ?? 0) + 1);
    }
    for (const a of w.authors) {
      finishedAuthors.set(a.toLowerCase(), (finishedAuthors.get(a.toLowerCase()) ?? 0) + 2);
    }
  }

  return activeWorks
    .filter((w) => !startedWorkIds.has(w.id))
    .map((w) => {
      let score = 0;
      for (const g of w.genres) score += finishedGenres.get(g.toLowerCase()) ?? 0;
      for (const a of w.authors) score += finishedAuthors.get(a.toLowerCase()) ?? 0;
      return { work: w, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.work);
}
