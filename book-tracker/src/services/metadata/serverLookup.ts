import type {
  MetadataLookupResult,
  MetadataProviderName,
  ProviderStatusReport,
} from '../../types/domain';
import { parseIsbn } from '../../utils/isbn';
import {
  getIsbnRegionalAffinity,
  isSufficientlyVerifiedEdition,
  partitionAndMergeCandidates,
  runProvidersWithIsolation,
  type MetadataProviderAdapter,
  type ProviderExecutionContext,
} from './pipeline';
import { ALL_METADATA_PROVIDERS } from './providers';

export interface ServerBookLookupRequest {
  isbn?: string;
  query?: string;
  forceAllProviders?: boolean;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  adapters?: MetadataProviderAdapter[];
}

function partitionStageAdapters(
  adapters: MetadataProviderAdapter[],
  affinity: string
): {
  stage1: MetadataProviderAdapter[];
  stage2: MetadataProviderAdapter[];
} {
  const stage1: MetadataProviderAdapter[] = [];
  const stage2: MetadataProviderAdapter[] = [];

  for (const adapter of adapters) {
    const isTier1 = adapter.tier === 'tier1_international';
    const matchesAffinity =
      affinity === 'global' ||
      adapter.region === 'global' ||
      adapter.region === affinity ||
      (affinity === 'en' && adapter.region === 'us') ||
      (affinity === 'en' && adapter.region === 'uk');

    if (isTier1 || matchesAffinity) {
      stage1.push(adapter);
    } else {
      stage2.push(adapter);
    }
  }

  return stage1.length > 0 ? { stage1, stage2 } : { stage1: adapters, stage2: [] };
}

function mergeStageResults(
  stage1: MetadataLookupResult,
  stage2: MetadataLookupResult,
  normIsbn: string | null
): MetadataLookupResult {
  const combinedRaw = [
    ...(stage1.exactMatches ?? []),
    ...(stage1.possibleEditionMatches ?? []),
    ...(stage1.relatedEditions ?? []),
    ...(stage1.workMatches ?? []),
    ...(stage2.exactMatches ?? []),
    ...(stage2.possibleEditionMatches ?? []),
    ...(stage2.relatedEditions ?? []),
    ...(stage2.workMatches ?? []),
  ];
  const partitioned = partitionAndMergeCandidates(combinedRaw, normIsbn);
  const statusMap = new Map<MetadataProviderName, ProviderStatusReport>();
  for (const s of stage1.providerStatuses) statusMap.set(s.provider, s);
  for (const s of stage2.providerStatuses) statusMap.set(s.provider, s);

  return {
    candidates: partitioned.primaryCandidates,
    exactMatches: partitioned.exactMatches,
    possibleEditionMatches: partitioned.possibleEditionMatches,
    relatedEditions: partitioned.relatedEditions,
    workMatches: partitioned.workMatches,
    approximateMatches: partitioned.approximateMatches,
    providerStatuses: Array.from(statusMap.values()),
    queriedIsbn: normIsbn,
    exactMatchCount: partitioned.exactMatches.length,
    stagesExecuted: Array.from(
      new Set([...(stage1.stagesExecuted ?? ['stage1']), ...(stage2.stagesExecuted ?? ['stage2'])])
    ),
    fromCache: false,
  };
}

/**
 * Executes the Book Tracker metadata discovery pipeline on the Node.js server
 * without browser CORS limitations (enabling authoritative national libraries
 * such as Ho Chi Minh City General Sciences Library and Vietnamese catalogues).
 */
export async function executeServerBookLookup(
  request: ServerBookLookupRequest
): Promise<MetadataLookupResult> {
  const env = typeof process !== 'undefined' ? process.env : {};
  const ctx: ProviderExecutionContext = {
    fetchFn: request.fetchFn ?? fetch,
    timeoutMs: request.timeoutMs ?? 8000,
    googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY || undefined,
    isbndbApiKey: env.ISBNDB_API_KEY || undefined,
    worldcatToken: env.WORLDCAT_TOKEN || undefined,
    nlkApiKey: env.NLK_API_KEY || undefined,
  };

  const adapters = request.adapters ?? ALL_METADATA_PROVIDERS;

  const rawIsbn = request.isbn?.trim();
  if (rawIsbn) {
    const parsed = parseIsbn(rawIsbn);
    const queryIsbn = parsed.isbn13 || rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!queryIsbn) {
      return {
        candidates: [],
        exactMatches: [],
        possibleEditionMatches: [],
        relatedEditions: [],
        workMatches: [],
        approximateMatches: [],
        providerStatuses: [],
        queriedIsbn: null,
        exactMatchCount: 0,
        stagesExecuted: ['server_proxy'],
        fromCache: false,
      };
    }

    const affinity = getIsbnRegionalAffinity(queryIsbn);
    const { stage1, stage2 } = request.forceAllProviders
      ? { stage1: adapters, stage2: [] as MetadataProviderAdapter[] }
      : partitionStageAdapters(adapters, affinity);

    const stage1Result = await runProvidersWithIsolation({
      mode: 'isbn',
      input: queryIsbn,
      adapters: stage1,
      ctx,
    });
    stage1Result.stagesExecuted = ['server_stage1'];

    let combined = stage1Result;
    const shouldRunStage2 =
      stage2.length > 0 &&
      (request.forceAllProviders === true ||
        !isSufficientlyVerifiedEdition(stage1Result.exactMatches ?? []));

    if (shouldRunStage2) {
      const stage2Result = await runProvidersWithIsolation({
        mode: 'isbn',
        input: queryIsbn,
        adapters: stage2,
        ctx,
      });
      stage2Result.stagesExecuted = ['server_stage2'];
      combined = mergeStageResults(stage1Result, stage2Result, parsed.isbn13 ?? queryIsbn);
    }

    return {
      candidates:
        combined.exactMatchCount > 0
          ? combined.exactMatches ?? combined.candidates
          : [],
      exactMatches: combined.exactMatches ?? [],
      possibleEditionMatches: combined.possibleEditionMatches ?? [],
      relatedEditions: combined.relatedEditions ?? [],
      workMatches: combined.workMatches ?? [],
      approximateMatches: combined.approximateMatches ?? [],
      providerStatuses: combined.providerStatuses,
      queriedIsbn: parsed.isbn13 ?? queryIsbn,
      exactMatchCount: combined.exactMatchCount,
      stagesExecuted: combined.stagesExecuted ?? ['server_stage1'],
      fromCache: false,
    };
  }

  const rawQuery = request.query?.trim();
  if (rawQuery) {
    const result = await runProvidersWithIsolation({
      mode: 'query',
      input: rawQuery,
      adapters,
      ctx,
    });
    return {
      ...result,
      stagesExecuted: ['server_query'],
      fromCache: false,
    };
  }

  return {
    candidates: [],
    exactMatches: [],
    possibleEditionMatches: [],
    relatedEditions: [],
    workMatches: [],
    approximateMatches: [],
    providerStatuses: [],
    queriedIsbn: null,
    exactMatchCount: 0,
    stagesExecuted: [],
    fromCache: false,
  };
}
