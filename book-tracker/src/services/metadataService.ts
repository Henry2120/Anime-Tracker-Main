import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type {
  MetadataCandidate,
  MetadataLookupResult,
  MetadataRecord,
  ProviderStatusReport,
} from '../types/domain';
import { parseIsbn } from '../utils/isbn';
import {
  classifyCandidateMatch,
  mergeAndEnrichCandidates,
  runProvidersWithIsolation,
  type MetadataProviderAdapter,
  type ProviderExecutionContext,
} from './metadata/pipeline';
import {
  adcbookProvider,
  ALL_METADATA_PROVIDERS,
  fahasaProvider,
  goodaProvider,
  googleBooksProvider,
  hcmLibraryProvider,
  hikaruProvider,
  ipmProvider,
  nhaNamProvider,
  nlvOpacProvider,
  nxbKimDongProvider,
  openBdProvider,
  openLibraryProvider,
  tikiProvider,
} from './metadata/providers';

export {
  adcbookProvider,
  ALL_METADATA_PROVIDERS,
  fahasaProvider,
  goodaProvider,
  googleBooksProvider,
  hcmLibraryProvider,
  hikaruProvider,
  ipmProvider,
  nhaNamProvider,
  nlvOpacProvider,
  nxbKimDongProvider,
  openBdProvider,
  openLibraryProvider,
  tikiProvider,
};

export interface LookupOptions {
  fetchFn?: typeof fetch;
  adapters?: MetadataProviderAdapter[];
  timeoutMs?: number;
  googleBooksApiKey?: string;
  preferEdgeFunction?: boolean;
}

function isBrowserDomEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function splitBrowserAdapters(adapters: MetadataProviderAdapter[]): {
  runnable: MetadataProviderAdapter[];
  corsBlockedReports: ProviderStatusReport[];
} {
  if (!isBrowserDomEnvironment()) {
    return { runnable: adapters, corsBlockedReports: [] };
  }
  const runnable: MetadataProviderAdapter[] = [];
  const corsBlockedReports: ProviderStatusReport[] = [];
  for (const adapter of adapters) {
    if (adapter.supportsDirectBrowserCors) {
      runnable.push(adapter);
    } else {
      corsBlockedReports.push({
        provider: adapter.name,
        label: adapter.label,
        status: adapter.name === 'fahasa' ? 'unsupported' : 'requires_configuration',
        candidateCount: 0,
        exactMatchCount: 0,
        message:
          adapter.name === 'fahasa'
            ? 'Protected by anti-bot challenge; unavailable directly from browser'
            : 'Requires Edge Function / server proxy (browser CORS restricted)',
      });
    }
  }
  return { runnable, corsBlockedReports };
}

export async function lookupMetadataWithReportByIsbn(
  rawIsbn: string,
  options: LookupOptions = {}
): Promise<MetadataLookupResult> {
  const parsed = parseIsbn(rawIsbn);
  const queryIsbn = parsed.isbn13 || rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!queryIsbn) {
    return { candidates: [], providerStatuses: [], queriedIsbn: null, exactMatchCount: 0 };
  }

  // Prefer server-side Supabase Edge Function when configured & online (no browser CORS limits)
  if (options.preferEdgeFunction !== false) {
    const supabase = getSupabaseClient();
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const { data, error } = await supabase.functions.invoke('book-lookup', {
          body: { isbn: queryIsbn },
        });
        if (!error && Array.isArray(data?.candidates)) {
          const normalized = mergeAndEnrichCandidates(
            (data.candidates as MetadataCandidate[]).map(
              (c) => classifyCandidateMatch(c, parsed.isbn13 || queryIsbn).candidate
            ),
            parsed.isbn13 || queryIsbn
          );
          const providerStatuses = Array.isArray(data.providerStatuses)
            ? (data.providerStatuses as ProviderStatusReport[])
            : [];
          if (normalized.length > 0 || providerStatuses.length > 0) {
            return {
              candidates: normalized,
              providerStatuses,
              queriedIsbn: parsed.isbn13 || queryIsbn,
              exactMatchCount: normalized.filter((c) => c.matchConfidence === 'exact_isbn').length,
            };
          }
        }
      } catch {
        // Fall through cleanly to direct CORS-compatible provider calls
      }
    }
  }

  const adapters = options.adapters ?? ALL_METADATA_PROVIDERS;
  const { runnable, corsBlockedReports } = options.fetchFn
    ? { runnable: adapters, corsBlockedReports: [] }
    : splitBrowserAdapters(adapters);

  const ctx: ProviderExecutionContext = {
    fetchFn: options.fetchFn ?? fetch,
    timeoutMs: options.timeoutMs ?? 7000,
    googleBooksApiKey: options.googleBooksApiKey,
  };

  const result = await runProvidersWithIsolation({
    mode: 'isbn',
    input: parsed.isbn13 || queryIsbn,
    adapters: runnable,
    ctx,
  });

  return {
    ...result,
    providerStatuses: [...result.providerStatuses, ...corsBlockedReports],
  };
}

export async function searchMetadataWithReportByQuery(
  query: string,
  options: LookupOptions = {}
): Promise<MetadataLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { candidates: [], providerStatuses: [], queriedIsbn: null, exactMatchCount: 0 };
  }

  if (options.preferEdgeFunction !== false) {
    const supabase = getSupabaseClient();
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const { data, error } = await supabase.functions.invoke('book-lookup', {
          body: { query: trimmed },
        });
        if (!error && Array.isArray(data?.candidates)) {
          const candidates = mergeAndEnrichCandidates(data.candidates as MetadataCandidate[], null);
          const providerStatuses = Array.isArray(data.providerStatuses)
            ? (data.providerStatuses as ProviderStatusReport[])
            : [];
          if (candidates.length > 0 || providerStatuses.length > 0) {
            return {
              candidates,
              providerStatuses,
              queriedIsbn: null,
              exactMatchCount: 0,
            };
          }
        }
      } catch {
        // Fall through cleanly
      }
    }
  }

  const adapters = options.adapters ?? ALL_METADATA_PROVIDERS;
  const { runnable, corsBlockedReports } = options.fetchFn
    ? { runnable: adapters, corsBlockedReports: [] }
    : splitBrowserAdapters(adapters);

  const ctx: ProviderExecutionContext = {
    fetchFn: options.fetchFn ?? fetch,
    timeoutMs: options.timeoutMs ?? 7000,
    googleBooksApiKey: options.googleBooksApiKey,
  };

  const result = await runProvidersWithIsolation({
    mode: 'query',
    input: trimmed,
    adapters: runnable,
    ctx,
  });

  return {
    ...result,
    providerStatuses: [...result.providerStatuses, ...corsBlockedReports],
  };
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
