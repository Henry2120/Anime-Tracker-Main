import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type {
  MetadataCandidate,
  MetadataLookupResult,
  MetadataProviderName,
  MetadataRecord,
  ProviderStatusReport,
} from '../types/domain';
import { parseIsbn } from '../utils/isbn';
import {
  classifyCandidateMatch,
  getIsbnRegionalAffinity,
  isSufficientlyVerifiedEdition,
  partitionAndMergeCandidates,
  runProvidersWithIsolation,
  type MetadataProviderAdapter,
  type ProviderExecutionContext,
} from './metadata/pipeline';
import {
  adcbookProvider,
  ALL_METADATA_PROVIDERS,
  amakProvider,
  bnfFranceProvider,
  britishLibraryProvider,
  crossrefProvider,
  fahasaProvider,
  goodaProvider,
  googleBooksProvider,
  hcmLibraryProvider,
  hikaruProvider,
  ipmProvider,
  isbndbProvider,
  locUsProvider,
  ndlJapanProvider,
  nhaNamProvider,
  nlcChinaProvider,
  nlKoreaProvider,
  nlvOpacProvider,
  nxbKimDongProvider,
  openBdProvider,
  openLibraryProvider,
  phuongNamProvider,
  taiwanNclProvider,
  tikiProvider,
  worldcatProvider,
} from './metadata/providers';

export {
  adcbookProvider,
  ALL_METADATA_PROVIDERS,
  amakProvider,
  bnfFranceProvider,
  britishLibraryProvider,
  crossrefProvider,
  fahasaProvider,
  goodaProvider,
  googleBooksProvider,
  hcmLibraryProvider,
  hikaruProvider,
  ipmProvider,
  isbndbProvider,
  locUsProvider,
  ndlJapanProvider,
  nhaNamProvider,
  nlcChinaProvider,
  nlKoreaProvider,
  nlvOpacProvider,
  nxbKimDongProvider,
  openBdProvider,
  openLibraryProvider,
  phuongNamProvider,
  taiwanNclProvider,
  tikiProvider,
  worldcatProvider,
};

export interface LookupOptions {
  fetchFn?: typeof fetch;
  adapters?: MetadataProviderAdapter[];
  timeoutMs?: number;
  googleBooksApiKey?: string;
  isbndbApiKey?: string;
  worldcatToken?: string;
  nlkApiKey?: string;
  preferServerProxy?: boolean;
  preferEdgeFunction?: boolean;
  bypassCache?: boolean;
  retryFailedOnly?: boolean;
  forceAllProviders?: boolean;
  useCache?: boolean;
  cacheTtlMs?: number;
  negativeCacheTtlMs?: number;
  fallbackTitleQuery?: string;
}

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_NEGATIVE_CACHE_TTL_MS = 90 * 1000;

interface CacheEntry {
  expiresAt: number;
  cachedAt: string;
  result: MetadataLookupResult;
}

const lookupCache = new Map<string, CacheEntry>();

export function clearMetadataLookupCache(): void {
  lookupCache.clear();
}

function getCachedResult(key: string): MetadataLookupResult | null {
  const entry = lookupCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    lookupCache.delete(key);
    return null;
  }
  return {
    ...entry.result,
    fromCache: true,
    cachedAt: entry.cachedAt,
  };
}

function setCachedResult(key: string, result: MetadataLookupResult, ttlMs: number): void {
  if (ttlMs <= 0) return;
  lookupCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    cachedAt: new Date().toISOString(),
    result: {
      ...result,
      fromCache: false,
    },
  });
}

function resolveCacheTtl(result: MetadataLookupResult, options: LookupOptions): number {
  const hasMatches =
    result.exactMatchCount > 0 ||
    result.candidates.length > 0 ||
    (result.approximateMatches?.length ?? 0) > 0;
  if (hasMatches) {
    return options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }
  return options.negativeCacheTtlMs ?? DEFAULT_NEGATIVE_CACHE_TTL_MS;
}

function isBrowserDomEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function canUseSameOriginLookupProxy(): boolean {
  if (!isBrowserDomEnvironment()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const protocol = window.location?.protocol;
  return protocol === 'http:' || protocol === 'https:';
}

async function fetchSameOriginBookLookup(
  payload: { isbn?: string; query?: string; forceAllProviders?: boolean },
  timeoutMs: number
): Promise<Record<string, unknown> | null> {
  if (!canUseSameOriginLookupProxy()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs + 5000, 12000));
  try {
    const response = await fetch('/api/book-tracker/lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = (await response.json()) as Record<string, unknown>;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function hasCredentialForAdapter(name: MetadataProviderName, ctx: ProviderExecutionContext): boolean {
  if (name === 'worldcat') return Boolean(ctx.worldcatToken);
  if (name === 'isbndb') return Boolean(ctx.isbndbApiKey);
  if (name === 'nl_korea') return Boolean(ctx.nlkApiKey);
  return true;
}

function splitBrowserAdapters(
  adapters: MetadataProviderAdapter[],
  ctx: ProviderExecutionContext
): {
  runnable: MetadataProviderAdapter[];
  blockedReports: ProviderStatusReport[];
} {
  if (!isBrowserDomEnvironment()) {
    return { runnable: adapters, blockedReports: [] };
  }
  const runnable: MetadataProviderAdapter[] = [];
  const blockedReports: ProviderStatusReport[] = [];

  for (const adapter of adapters) {
    if (adapter.supportsDirectBrowserCors) {
      runnable.push(adapter);
      continue;
    }

    let status: ProviderStatusReport['status'] = 'proxy_required';
    let message = 'Requires Edge Function / server proxy (CORS restricted in browser)';

    if (adapter.name === 'fahasa') {
      status = 'access_denied';
      message = 'Protected by anti-bot challenge; unavailable directly from browser';
    } else if (
      adapter.name === 'nlv_opac' ||
      adapter.name === 'british_library' ||
      adapter.name === 'taiwan_ncl' ||
      adapter.name === 'nlc_china'
    ) {
      status = 'unsupported_interface';
      message = `${adapter.label} has no public unauthenticated ISBN REST/SRU API`;
    } else if (adapter.requiresApiKey && !hasCredentialForAdapter(adapter.name, ctx)) {
      status = 'api_key_required';
      message = `${adapter.label} requires API credentials configured server-side`;
    }

    blockedReports.push({
      provider: adapter.name,
      label: adapter.label,
      tier: adapter.tier,
      region: adapter.region,
      status,
      candidateCount: 0,
      exactMatchCount: 0,
      message,
    });
  }
  return { runnable, blockedReports };
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

function normalizeEdgePayload(
  rawCandidates: MetadataCandidate[],
  providerStatuses: ProviderStatusReport[],
  targetIsbn: string | null,
  extra?: {
    possibleEditionMatches?: MetadataCandidate[];
    relatedEditions?: MetadataCandidate[];
    workMatches?: MetadataCandidate[];
    approximateMatches?: MetadataCandidate[];
    stagesExecuted?: string[];
  }
): MetadataLookupResult {
  const allRaw = [
    ...rawCandidates,
    ...(extra?.possibleEditionMatches ?? []),
    ...(extra?.relatedEditions ?? []),
    ...(extra?.workMatches ?? []),
  ];
  const classified = allRaw.map((c) => classifyCandidateMatch(c, targetIsbn).candidate);
  const partitioned = partitionAndMergeCandidates(classified, targetIsbn);
  const fallbackApprox = (extra?.approximateMatches ?? []).map((c) => ({
    ...classifyCandidateMatch(c, null).candidate,
    matchConfidence: 'approximate_match' as const,
  }));

  return {
    candidates: partitioned.primaryCandidates,
    exactMatches: partitioned.exactMatches,
    possibleEditionMatches: partitioned.possibleEditionMatches,
    relatedEditions: partitioned.relatedEditions,
    workMatches: partitioned.workMatches,
    approximateMatches:
      partitioned.approximateMatches.length > 0 ? partitioned.approximateMatches : fallbackApprox,
    providerStatuses,
    queriedIsbn: targetIsbn,
    exactMatchCount: partitioned.exactMatches.length,
    stagesExecuted: extra?.stagesExecuted,
    fromCache: false,
  };
}

function mergeTwoStageResults(
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

export async function lookupMetadataWithReportByIsbn(
  rawIsbn: string,
  options: LookupOptions = {}
): Promise<MetadataLookupResult> {
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
      fromCache: false,
    };
  }

  const normalizedKey = parsed.isbn13 || queryIsbn;
  const isCustomHarness = Boolean(options.fetchFn || options.adapters);
  const shouldUseCache =
    options.bypassCache !== true &&
    !options.retryFailedOnly &&
    (options.useCache === true || (!isCustomHarness && options.useCache !== false));
  const cacheKey = `isbn:${normalizedKey}`;

  const cachedEntry = getCachedResult(cacheKey);
  if (shouldUseCache && cachedEntry) {
    return cachedEntry;
  }

  const ctx: ProviderExecutionContext = {
    fetchFn: options.fetchFn ?? fetch,
    timeoutMs: options.timeoutMs ?? 7000,
    googleBooksApiKey: options.googleBooksApiKey,
    isbndbApiKey: options.isbndbApiKey,
    worldcatToken: options.worldcatToken,
    nlkApiKey: options.nlkApiKey,
  };

  const allAdapters = options.adapters ?? ALL_METADATA_PROVIDERS;

  // Partial retry of failed providers only, preserving already-cached valid candidates & statuses
  if (options.retryFailedOnly && cachedEntry) {
    const retryableStatuses = new Set(['timeout', 'upstream_error', 'api_key_required']);
    const failedNames = new Set(
      cachedEntry.providerStatuses
        .filter((s) => retryableStatuses.has(s.status))
        .map((s) => s.provider)
    );

    if (failedNames.size === 0) {
      return cachedEntry;
    }

    const adaptersToRetry = allAdapters.filter((a) => failedNames.has(a.name));
    const { runnable, blockedReports } = options.fetchFn
      ? { runnable: adaptersToRetry, blockedReports: [] }
      : splitBrowserAdapters(adaptersToRetry, ctx);

    const retryResult = await runProvidersWithIsolation({
      mode: 'isbn',
      input: normalizedKey,
      adapters: runnable,
      ctx,
    });
    const combinedRetry: MetadataLookupResult = {
      ...retryResult,
      providerStatuses: [...retryResult.providerStatuses, ...blockedReports],
      stagesExecuted: ['retry_failed'],
    };

    const merged = mergeTwoStageResults(cachedEntry, combinedRetry, parsed.isbn13);
    if (options.useCache !== false) {
      setCachedResult(cacheKey, merged, resolveCacheTtl(merged, options));
    }
    return merged;
  }

  // Prefer same-origin AniVerse Express server proxy when running in browser (no CORS limits)
  if (!isCustomHarness && options.preferServerProxy !== false) {
    const proxyData = await fetchSameOriginBookLookup(
      { isbn: normalizedKey, forceAllProviders: options.forceAllProviders },
      ctx.timeoutMs
    );
    if (proxyData && Array.isArray(proxyData.candidates)) {
      const proxyRes = normalizeEdgePayload(
        proxyData.candidates as MetadataCandidate[],
        Array.isArray(proxyData.providerStatuses)
          ? (proxyData.providerStatuses as ProviderStatusReport[])
          : [],
        parsed.isbn13 ?? normalizedKey,
        {
          possibleEditionMatches: Array.isArray(proxyData.possibleEditionMatches)
            ? (proxyData.possibleEditionMatches as MetadataCandidate[])
            : undefined,
          relatedEditions: Array.isArray(proxyData.relatedEditions)
            ? (proxyData.relatedEditions as MetadataCandidate[])
            : undefined,
          workMatches: Array.isArray(proxyData.workMatches)
            ? (proxyData.workMatches as MetadataCandidate[])
            : undefined,
          approximateMatches: Array.isArray(proxyData.approximateMatches)
            ? (proxyData.approximateMatches as MetadataCandidate[])
            : undefined,
          stagesExecuted: Array.isArray(proxyData.stagesExecuted)
            ? (proxyData.stagesExecuted as string[])
            : ['server_proxy'],
        }
      );
      if (proxyRes.candidates.length > 0 || proxyRes.providerStatuses.length > 0) {
        if (shouldUseCache || options.useCache === true) {
          setCachedResult(cacheKey, proxyRes, resolveCacheTtl(proxyRes, options));
        }
        return proxyRes;
      }
    }
  }

  // Fallback to server-side Supabase Edge Function when configured & online (no browser CORS limits)
  if (options.preferEdgeFunction !== false) {
    const supabase = getSupabaseClient();
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const { data, error } = await supabase.functions.invoke('book-lookup', {
          body: { isbn: normalizedKey, forceAllProviders: options.forceAllProviders },
        });
        if (!error && Array.isArray(data?.candidates)) {
          const edgeRes = normalizeEdgePayload(
            data.candidates as MetadataCandidate[],
            Array.isArray(data.providerStatuses)
              ? (data.providerStatuses as ProviderStatusReport[])
              : [],
            parsed.isbn13 ?? normalizedKey,
            {
              possibleEditionMatches: Array.isArray(data.possibleEditionMatches)
                ? (data.possibleEditionMatches as MetadataCandidate[])
                : undefined,
              relatedEditions: Array.isArray(data.relatedEditions)
                ? (data.relatedEditions as MetadataCandidate[])
                : undefined,
              workMatches: Array.isArray(data.workMatches)
                ? (data.workMatches as MetadataCandidate[])
                : undefined,
              approximateMatches: Array.isArray(data.approximateMatches)
                ? (data.approximateMatches as MetadataCandidate[])
                : undefined,
              stagesExecuted: Array.isArray(data.stagesExecuted)
                ? (data.stagesExecuted as string[])
                : ['edge'],
            }
          );
          if (edgeRes.candidates.length > 0 || edgeRes.providerStatuses.length > 0) {
            if (shouldUseCache || options.useCache === true) {
              setCachedResult(cacheKey, edgeRes, resolveCacheTtl(edgeRes, options));
            }
            return edgeRes;
          }
        }
      } catch {
        // Fall through cleanly to direct CORS-compatible provider calls
      }
    }
  }

  const { runnable, blockedReports } = options.fetchFn
    ? { runnable: allAdapters, blockedReports: [] }
    : splitBrowserAdapters(allAdapters, ctx);

  const affinity = getIsbnRegionalAffinity(normalizedKey);
  const { stage1, stage2 } = options.forceAllProviders
    ? { stage1: runnable, stage2: [] as MetadataProviderAdapter[] }
    : partitionStageAdapters(runnable, affinity);

  const stage1Result = await runProvidersWithIsolation({
    mode: 'isbn',
    input: normalizedKey,
    adapters: stage1,
    ctx,
  });
  stage1Result.stagesExecuted = ['stage1'];

  let combinedResult = stage1Result;
  const shouldRunStage2 =
    stage2.length > 0 &&
    (options.forceAllProviders === true ||
      !isSufficientlyVerifiedEdition(stage1Result.exactMatches ?? []));

  if (shouldRunStage2) {
    const stage2Result = await runProvidersWithIsolation({
      mode: 'isbn',
      input: normalizedKey,
      adapters: stage2,
      ctx,
    });
    stage2Result.stagesExecuted = ['stage2'];
    combinedResult = mergeTwoStageResults(stage1Result, stage2Result, parsed.isbn13 ?? normalizedKey);
  }

  let approximateMatches = combinedResult.approximateMatches ?? [];
  let possibleEditionMatches = combinedResult.possibleEditionMatches ?? [];
  let workMatches = combinedResult.workMatches ?? [];

  // Controlled title fallback ONLY when no exact ISBN matches exist and a real fallback title was given
  if (
    combinedResult.exactMatchCount === 0 &&
    approximateMatches.length === 0 &&
    options.fallbackTitleQuery?.trim()
  ) {
    const fallbackSearch = await runProvidersWithIsolation({
      mode: 'query',
      input: options.fallbackTitleQuery.trim(),
      adapters: stage1,
      ctx,
    });
    approximateMatches = fallbackSearch.candidates.map((c) => ({
      ...c,
      matchConfidence: 'approximate_match' as const,
      editionMatchLevel: 'possible_edition' as const,
    }));
    possibleEditionMatches = approximateMatches;
    workMatches = approximateMatches;
  }

  // Merge blocked browser reports without hiding executed statuses
  const executedSet = new Set(combinedResult.providerStatuses.map((s) => s.provider));
  const mergedStatuses = [
    ...combinedResult.providerStatuses,
    ...blockedReports.filter((b) => !executedSet.has(b.provider)),
  ];

  const finalResult: MetadataLookupResult = {
    candidates:
      combinedResult.exactMatchCount > 0
        ? combinedResult.exactMatches ?? combinedResult.candidates
        : [],
    exactMatches: combinedResult.exactMatches ?? [],
    possibleEditionMatches,
    relatedEditions: combinedResult.relatedEditions ?? [],
    workMatches,
    approximateMatches,
    providerStatuses: mergedStatuses,
    queriedIsbn: parsed.isbn13 ?? normalizedKey,
    exactMatchCount: combinedResult.exactMatchCount,
    stagesExecuted: combinedResult.stagesExecuted ?? ['stage1'],
    fromCache: false,
  };

  if (shouldUseCache || options.useCache === true) {
    setCachedResult(cacheKey, finalResult, resolveCacheTtl(finalResult, options));
  }

  return finalResult;
}

export async function searchMetadataWithReportByQuery(
  query: string,
  options: LookupOptions = {}
): Promise<MetadataLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) {
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
      fromCache: false,
    };
  }

  const isCustomHarness = Boolean(options.fetchFn || options.adapters);
  const shouldUseCache =
    options.bypassCache !== true &&
    (options.useCache === true || (!isCustomHarness && options.useCache !== false));
  const cacheKey = `query:${trimmed.toLocaleLowerCase()}`;

  if (shouldUseCache) {
    const cached = getCachedResult(cacheKey);
    if (cached) return cached;
  }

  if (!isCustomHarness && options.preferServerProxy !== false) {
    const proxyData = await fetchSameOriginBookLookup(
      { query: trimmed },
      options.timeoutMs ?? 7000
    );
    if (proxyData && Array.isArray(proxyData.candidates)) {
      const proxyRes = normalizeEdgePayload(
        proxyData.candidates as MetadataCandidate[],
        Array.isArray(proxyData.providerStatuses)
          ? (proxyData.providerStatuses as ProviderStatusReport[])
          : [],
        null,
        {
          workMatches: Array.isArray(proxyData.workMatches)
            ? (proxyData.workMatches as MetadataCandidate[])
            : undefined,
          stagesExecuted: Array.isArray(proxyData.stagesExecuted)
            ? (proxyData.stagesExecuted as string[])
            : ['server_proxy'],
        }
      );
      if (proxyRes.candidates.length > 0 || proxyRes.providerStatuses.length > 0) {
        if (shouldUseCache || options.useCache === true) {
          setCachedResult(cacheKey, proxyRes, resolveCacheTtl(proxyRes, options));
        }
        return proxyRes;
      }
    }
  }

  if (options.preferEdgeFunction !== false) {
    const supabase = getSupabaseClient();
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const { data, error } = await supabase.functions.invoke('book-lookup', {
          body: { query: trimmed },
        });
        if (!error && Array.isArray(data?.candidates)) {
          const edgeRes = normalizeEdgePayload(
            data.candidates as MetadataCandidate[],
            Array.isArray(data.providerStatuses)
              ? (data.providerStatuses as ProviderStatusReport[])
              : [],
            null,
            {
              workMatches: Array.isArray(data.workMatches)
                ? (data.workMatches as MetadataCandidate[])
                : undefined,
              stagesExecuted: Array.isArray(data.stagesExecuted)
                ? (data.stagesExecuted as string[])
                : ['edge'],
            }
          );
          if (edgeRes.candidates.length > 0 || edgeRes.providerStatuses.length > 0) {
            if (shouldUseCache || options.useCache === true) {
              setCachedResult(cacheKey, edgeRes, resolveCacheTtl(edgeRes, options));
            }
            return edgeRes;
          }
        }
      } catch {
        // Fall through cleanly
      }
    }
  }

  const ctx: ProviderExecutionContext = {
    fetchFn: options.fetchFn ?? fetch,
    timeoutMs: options.timeoutMs ?? 7000,
    googleBooksApiKey: options.googleBooksApiKey,
    isbndbApiKey: options.isbndbApiKey,
    worldcatToken: options.worldcatToken,
    nlkApiKey: options.nlkApiKey,
  };

  const adapters = options.adapters ?? ALL_METADATA_PROVIDERS;
  const { runnable, blockedReports } = options.fetchFn
    ? { runnable: adapters, blockedReports: [] }
    : splitBrowserAdapters(adapters, ctx);

  const result = await runProvidersWithIsolation({
    mode: 'query',
    input: trimmed,
    adapters: runnable,
    ctx,
  });

  const finalResult: MetadataLookupResult = {
    ...result,
    providerStatuses: [...result.providerStatuses, ...blockedReports],
    stagesExecuted: ['query'],
    fromCache: false,
  };

  if (shouldUseCache || options.useCache === true) {
    setCachedResult(cacheKey, finalResult, resolveCacheTtl(finalResult, options));
  }

  return finalResult;
}

export async function lookupMetadataByIsbn(rawIsbn: string): Promise<MetadataCandidate[]> {
  const res = await lookupMetadataWithReportByIsbn(rawIsbn);
  return res.candidates;
}

export async function searchMetadataByQuery(query: string): Promise<MetadataCandidate[]> {
  const res = await searchMetadataWithReportByQuery(query);
  return res.candidates;
}

export async function recordProviderMetadata(params: {
  workId?: string | null;
  editionId?: string | null;
  candidate: MetadataCandidate;
}): Promise<void> {
  const rec: MetadataRecord = {
    id: createUuid(),
    workId: params.workId ?? null,
    editionId: params.editionId ?? null,
    provider: params.candidate.provider,
    externalId: params.candidate.externalId,
    isbn13: params.candidate.isbn13 ?? null,
    rawPayload: params.candidate.rawPayload,
    fetchedAt: new Date().toISOString(),
  };
  await db.metadata_records.put(rec);
}
