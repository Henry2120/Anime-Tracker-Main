import type { MetadataCandidate, MetadataProviderName } from '../../types/domain';
import {
  type HaravanProductRaw,
  parseHaravanProduct,
  parseSapoProduct,
  type SapoProductRaw,
} from './normalizer';

const DEFAULT_TIMEOUT_MS = 7000;

export interface MetadataProviderAdapter {
  name: MetadataProviderName;
  lookupByIsbn(isbn13Or10: string): Promise<MetadataCandidate[]>;
  search(query: string): Promise<MetadataCandidate[]>;
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json, text/html, */*' },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface SapoSearchResponse {
  results_total?: number;
  results?: Array<{
    title?: string;
    url?: string;
    thumb?: string;
    id?: number | string;
  }>;
}

function createSapoProvider(config: {
  name: MetadataProviderName;
  baseUrl: string;
  fetchHtmlForEnrichment?: boolean;
}): MetadataProviderAdapter {
  const { name, baseUrl, fetchHtmlForEnrichment = true } = config;

  async function runQuery(query: string, queryIsbn?: string, maxHits = 4): Promise<MetadataCandidate[]> {
    const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&view=json`;
    const searchJson = await fetchJsonWithTimeout<SapoSearchResponse>(searchUrl);
    const hits = (searchJson?.results ?? []).filter((r) => Boolean(r.url)).slice(0, maxHits);
    if (hits.length === 0) return [];

    const settled = await Promise.allSettled(
      hits.map(async (hit) => {
        const cleanPath = (hit.url ?? '').split('?')[0];
        const jsonUrl = `${baseUrl}${cleanPath}.json`;
        const product = await fetchJsonWithTimeout<SapoProductRaw>(jsonUrl);
        if (!product) return null;

        let html: string | undefined;
        const needsEnrichment =
          fetchHtmlForEnrichment &&
          (!product.published_on || queryIsbn != null);
        if (needsEnrichment) {
          try {
            const pageRes = await fetchTextWithTimeout(`${baseUrl}${cleanPath}`, 5500);
            if (pageRes.ok) html = pageRes.text;
          } catch {
            // Non-fatal: JSON alone still yields core fields
          }
        }

        return parseSapoProduct({
          provider: name,
          baseUrl,
          product,
          html,
          queryIsbn,
        });
      })
    );

    const out: MetadataCandidate[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        out.push(r.value);
      }
    }
    return out;
  }

  return {
    name,
    async lookupByIsbn(isbn) {
      return runQuery(isbn, isbn, 3);
    },
    async search(query) {
      return runQuery(query, undefined, 5);
    },
  };
}

export const adcbookProvider = createSapoProvider({
  name: 'adcbook',
  baseUrl: 'https://adcbook.net.vn',
  fetchHtmlForEnrichment: true,
});

export const nxbKimDongProvider = createSapoProvider({
  name: 'nxb_kim_dong',
  baseUrl: 'https://nxbkimdong.com.vn',
  fetchHtmlForEnrichment: false,
});

export const nhaNamProvider = createSapoProvider({
  name: 'nha_nam',
  baseUrl: 'https://nhanam.vn',
  fetchHtmlForEnrichment: true,
});

export const ipmProvider: MetadataProviderAdapter = {
  name: 'ipm',
  async lookupByIsbn(isbn) {
    return queryHaravanStore('ipm', 'https://ipm.vn', isbn, isbn, 3);
  },
  async search(query) {
    return queryHaravanStore('ipm', 'https://ipm.vn', query, undefined, 4);
  },
};

async function queryHaravanStore(
  provider: MetadataProviderName,
  baseUrl: string,
  query: string,
  queryIsbn?: string,
  maxHits = 4
): Promise<MetadataCandidate[]> {
  const res = await fetchTextWithTimeout(
    `${baseUrl}/search?type=product&q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const links = Array.from(
    new Set(
      Array.from(res.text.matchAll(/href=["'](\/products\/[^"'?#]+)["']/gi)).map((m) => m[1])
    )
  ).slice(0, maxHits);

  if (links.length === 0) return [];

  const settled = await Promise.allSettled(
    links.map(async (path) => {
      const data = await fetchJsonWithTimeout<{ product?: HaravanProductRaw }>(
        `${baseUrl}${path}.json`
      );
      if (!data?.product) return null;
      return parseHaravanProduct({
        provider,
        baseUrl,
        product: data.product,
        queryIsbn,
      });
    })
  );

  const out: MetadataCandidate[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out;
}
