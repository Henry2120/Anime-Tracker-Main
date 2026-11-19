import type { BookFormat, MetadataCandidate, MetadataProviderName } from '../../types/domain';
import {
  extractIsbnsFromText,
  generateSearchIsbnForms,
  isbn13ToIsbn10,
  normalizeIsbnTo13,
  parseIsbn,
} from '../../utils/isbn';
import {
  decodeHtmlEntities,
  extractJsonLdBooks,
  extractVietnameseBookSpecs,
  stripHtmlToText,
} from './htmlAndText';
import { parseMarc21Record } from './marc21';
import {
  ProviderStatusError,
  type MetadataProviderAdapter,
  type ProviderExecutionContext,
} from './pipeline';

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed.replace(/^http:\/\//i, 'https://');
}

async function fetchWithTimeout(
  ctx: ProviderExecutionContext,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    return await ctx.fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function collectValidIsbns(values: Array<string | null | undefined>, freeText?: string): string[] {
  const out: string[] = [];
  const push = (isbn13: string | null | undefined) => {
    if (isbn13 && !out.includes(isbn13)) out.push(isbn13);
  };
  for (const val of values) {
    if (!val) continue;
    const direct = normalizeIsbnTo13(val);
    if (direct) push(direct);
    for (const found of extractIsbnsFromText(val)) push(found.isbn13);
  }
  if (freeText) {
    for (const found of extractIsbnsFromText(freeText)) push(found.isbn13);
  }
  return out;
}

function detectFormatFromText(text: string): BookFormat | undefined {
  const lower = text.toLocaleLowerCase('vi');
  if (lower.includes('bìa cứng') || lower.includes('hardcover')) return 'hardcover';
  if (lower.includes('bìa mềm') || lower.includes('bìa rời') || lower.includes('paperback')) return 'paperback';
  return undefined;
}

// ============================================================================
// 1. Thư viện Khoa học Tổng hợp TP.HCM (MARC21 + OPAC)
// ============================================================================
export const hcmLibraryProvider: MetadataProviderAdapter = {
  name: 'hcm_library',
  label: 'Thư viện KHTH TP.HCM',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const urls = [
      `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=ISBN%3A%25${encodeURIComponent(isbn13)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`,
      `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=FullText%3A%25${encodeURIComponent(isbn13)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`,
    ];

    const detailIds = new Set<string>();
    for (const searchUrl of urls) {
      const res = await fetchWithTimeout(ctx, searchUrl);
      if (res.status >= 500) {
        throw new ProviderStatusError('temporarily_unavailable', `HCM Library HTTP ${res.status}`);
      }
      if (!res.ok) continue;
      const html = await res.text();
      for (const m of html.matchAll(/ItemDetail\/(\d+)/gi)) {
        detailIds.add(m[1]);
      }
      if (detailIds.size > 0) break;
    }

    if (detailIds.size === 0) return [];
    const candidates: MetadataCandidate[] = [];
    for (const id of Array.from(detailIds).slice(0, 4)) {
      const detailUrl = `https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/${id}`;
      const detRes = await fetchWithTimeout(ctx, detailUrl);
      if (!detRes.ok) continue;
      const detHtml = await detRes.text();
      const marcSection = detHtml.match(/<div[^>]+id=["']divMARC21["'][\s\S]*?<\/div>\s*(?:<\/div>|<script)/i)?.[0] ?? detHtml;
      const marc = parseMarc21Record(marcSection);
      if (!marc) continue;

      const htmlCoverMatch = detHtml.match(/(?:https?:\/\/phucvu\.thuvientphcm\.gov\.vn)?(\/Upload\/ImageCover\/[^"'\s<>]+)/i);
      const coverUrl = htmlCoverMatch
        ? `https://phucvu.thuvientphcm.gov.vn${htmlCoverMatch[1]}`
        : marc.coverPath
          ? `https://phucvu.thuvientphcm.gov.vn${marc.coverPath.startsWith('/Upload') ? marc.coverPath : `/Upload${marc.coverPath}`}`
          : undefined;

      const matchedIsbns = collectValidIsbns(marc.isbns);
      if (!matchedIsbns.includes(isbn13)) continue;

      candidates.push({
        externalId: marc.controlNumber || id,
        provider: 'hcm_library',
        verified: false,
        matchConfidence: 'exact_isbn',
        matchedIsbns,
        title: marc.title,
        subtitle: marc.subtitle,
        authors: marc.authors,
        translators: marc.translators,
        illustrators: marc.illustrators,
        publishers: marc.publishers,
        publishedYear: marc.publishedYear,
        publishedDate: marc.publishedYear ? String(marc.publishedYear) : undefined,
        language: marc.language,
        pageCount: marc.pageCount,
        genres: marc.subjects,
        description: marc.description,
        isbn13,
        isbn10: isbn13.startsWith('978') ? isbn13ToIsbn10(isbn13) : null,
        coverUrl: normalizeUrl(coverUrl),
        sourceUrl: detailUrl,
        rawPayload: { itemId: id, marc },
      });
    }
    return candidates;
  },

  async search(query, ctx) {
    const searchUrl = `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=FullText%3A%25${encodeURIComponent(query)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`;
    const res = await fetchWithTimeout(ctx, searchUrl);
    if (!res.ok) return [];
    const html = await res.text();
    const detailIds = Array.from(new Set([...html.matchAll(/ItemDetail\/(\d+)/gi)].map((m) => m[1]))).slice(0, 4);
    const out: MetadataCandidate[] = [];
    for (const id of detailIds) {
      const detailUrl = `https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/${id}`;
      const detRes = await fetchWithTimeout(ctx, detailUrl);
      if (!detRes.ok) continue;
      const detHtml = await detRes.text();
      const marcSection = detHtml.match(/<div[^>]+id=["']divMARC21["'][\s\S]*?<\/div>\s*(?:<\/div>|<script)/i)?.[0] ?? detHtml;
      const marc = parseMarc21Record(marcSection);
      if (!marc) continue;
      const firstIsbn = marc.isbns[0] ?? null;
      const coverUrl = marc.coverPath
        ? `https://phucvu.thuvientphcm.gov.vn${marc.coverPath.startsWith('/Upload') ? marc.coverPath : `/Upload${marc.coverPath}`}`
        : undefined;
      out.push({
        externalId: marc.controlNumber || id,
        provider: 'hcm_library',
        verified: false,
        matchConfidence: 'title_match',
        matchedIsbns: marc.isbns,
        title: marc.title,
        subtitle: marc.subtitle,
        authors: marc.authors,
        translators: marc.translators,
        illustrators: marc.illustrators,
        publishers: marc.publishers,
        publishedYear: marc.publishedYear,
        language: marc.language,
        pageCount: marc.pageCount,
        genres: marc.subjects,
        description: marc.description,
        isbn13: firstIsbn,
        isbn10: firstIsbn?.startsWith('978') ? isbn13ToIsbn10(firstIsbn) : null,
        coverUrl: normalizeUrl(coverUrl),
        sourceUrl: detailUrl,
        rawPayload: { itemId: id, marc },
      });
    }
    return out;
  },
};

// ============================================================================
// 2. Sapo / Bizweb Store Factory (ADCBook, Gooda, NXB Kim Đồng, Nhã Nam)
// ============================================================================
interface SapoSearchEntry {
  url?: string;
  title?: string;
  thumb?: string;
  thumbnail?: string;
}

function extractSapoSearchEntries(rawText: string, baseUrl: string): SapoSearchEntry[] {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (Array.isArray(parsed.results)) {
        return parsed.results as SapoSearchEntry[];
      }
      // Gooda-style dictionary keyed by numeric product ID
      const entries: SapoSearchEntry[] = [];
      for (const val of Object.values(parsed)) {
        if (val && typeof val === 'object' && 'url' in val) {
          entries.push(val as SapoSearchEntry);
        }
      }
      if (entries.length > 0) return entries;
    } catch {
      // Fallback to HTML scraping below
    }
  }

  // Fallback HTML product links
  const domainHost = new URL(baseUrl).host.replace(/\./g, '\\.');
  const urls = new Set<string>();
  const re = new RegExp(`href=["'](?:https?://${domainHost})?(/[^"'?#\\s]+)["']`, 'gi');
  for (const m of rawText.matchAll(re)) {
    const p = m[1];
    if (
      p.length > 4 &&
      !/^\/(?:search|cart|account|collections|blogs|pages|tin-tuc|lien-he|gio-hang)/i.test(p) &&
      !/\.(css|js|png|jpg|svg|ico)$/i.test(p)
    ) {
      urls.add(p);
    }
  }
  return Array.from(urls).slice(0, 5).map((u) => ({ url: u }));
}

interface SapoProductJson {
  id?: number | string;
  name?: string;
  title?: string;
  alias?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  summary?: string;
  content?: string;
  featured_image?: string | { src?: string };
  images?: Array<string | { src?: string }>;
  variants?: Array<{ sku?: string; barcode?: string; title?: string }>;
  url?: string;
}

function createSapoStoreProvider(config: {
  name: MetadataProviderName;
  label: string;
  baseUrl: string;
  supportsDirectBrowserCors?: boolean;
  defaultPublishers?: string[];
}): MetadataProviderAdapter {
  const fetchProductCandidate = async (
    pathOrUrl: string,
    ctx: ProviderExecutionContext,
    expectedIsbn: string | null
  ): Promise<MetadataCandidate | null> => {
    const productUrl = pathOrUrl.startsWith('http') ? pathOrUrl : `${config.baseUrl}${pathOrUrl}`;
    const cleanPathUrl = productUrl.split('?')[0].replace(/\/$/, '');
    const jsonUrl = cleanPathUrl.endsWith('.json') ? cleanPathUrl : `${cleanPathUrl}.json`;

    const [jsonRes, htmlRes] = await Promise.all([
      fetchWithTimeout(ctx, jsonUrl).catch(() => null),
      fetchWithTimeout(ctx, cleanPathUrl).catch(() => null),
    ]);

    let prodJson: SapoProductJson | null = null;
    if (jsonRes && jsonRes.ok) {
      try {
        const parsed = (await jsonRes.json()) as SapoProductJson & { product?: SapoProductJson };
        prodJson = parsed.product ?? parsed;
      } catch {
        prodJson = null;
      }
    }

    const html = htmlRes && htmlRes.ok ? await htmlRes.text() : '';
    if (!prodJson && !html) return null;

    const htmlSpecs = extractVietnameseBookSpecs(html);
    const contentSpecs = prodJson?.content ? extractVietnameseBookSpecs(prodJson.content) : null;
    const ldBooks = html ? extractJsonLdBooks(html) : [];
    const ld = ldBooks[0];

    const variantIds = (prodJson?.variants ?? []).flatMap((v) => [v.sku, v.barcode]);
    const allIsbns = collectValidIsbns(
      [
        ...variantIds,
        ...htmlSpecs.isbns,
        ...(contentSpecs?.isbns ?? []),
        ...(ld?.isbns ?? []),
      ],
      `${prodJson?.summary ?? ''} ${prodJson?.content ?? ''}`
    );

    if (expectedIsbn && !allIsbns.includes(expectedIsbn)) {
      return null;
    }

    const titleFromHtml = decodeHtmlEntities(
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') ?? ''
    ).trim();
    const title = prodJson?.name?.trim() || prodJson?.title?.trim() || ld?.title || titleFromHtml;
    if (!title) return null;

    const authors = [...htmlSpecs.authors];
    for (const a of [...(contentSpecs?.authors ?? []), ...(ld?.authors ?? [])]) {
      if (a && !authors.some((x) => x.toLocaleLowerCase('vi') === a.toLocaleLowerCase('vi'))) {
        authors.push(a);
      }
    }

    const translators = [...htmlSpecs.translators];
    for (const tr of contentSpecs?.translators ?? []) {
      if (tr && !translators.some((x) => x.toLocaleLowerCase('vi') === tr.toLocaleLowerCase('vi'))) {
        translators.push(tr);
      }
    }

    const illustrators = [...htmlSpecs.illustrators];
    for (const il of contentSpecs?.illustrators ?? []) {
      if (il && !illustrators.some((x) => x.toLocaleLowerCase('vi') === il.toLocaleLowerCase('vi'))) {
        illustrators.push(il);
      }
    }

    const publishers: string[] = [];
    const pushPub = (p?: string | null) => {
      const cleaned = p?.trim();
      if (!cleaned) return;
      if (!publishers.some((x) => x.toLocaleLowerCase('vi') === cleaned.toLocaleLowerCase('vi'))) {
        publishers.push(cleaned);
      }
    };
    if (prodJson?.vendor) pushPub(prodJson.vendor);
    for (const p of htmlSpecs.publishers) pushPub(p);
    for (const p of contentSpecs?.publishers ?? []) pushPub(p);
    for (const p of ld?.publishers ?? []) pushPub(p);
    if (publishers.length === 0 && config.defaultPublishers) {
      for (const p of config.defaultPublishers) pushPub(p);
    }

    const ogImg = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const featImg =
      typeof prodJson?.featured_image === 'string'
        ? prodJson.featured_image
        : prodJson?.featured_image?.src;
    const firstImg = prodJson?.images?.[0];
    const firstImgUrl = typeof firstImg === 'string' ? firstImg : firstImg?.src;

    const descriptionRaw = prodJson?.content || prodJson?.summary || ld?.description || '';
    const description = descriptionRaw ? stripHtmlToText(descriptionRaw).slice(0, 1500) : undefined;

    const targetIsbn = expectedIsbn || allIsbns[0] || null;
    return {
      externalId: String(prodJson?.id || prodJson?.alias || cleanPathUrl),
      provider: config.name,
      verified: false,
      matchConfidence: expectedIsbn ? 'exact_isbn' : 'title_match',
      matchedIsbns: allIsbns,
      title,
      authors,
      translators,
      illustrators,
      publishers,
      publishingPartner: htmlSpecs.publishingPartner || contentSpecs?.publishingPartner,
      publishedDate: htmlSpecs.publishedDate || contentSpecs?.publishedDate || ld?.publishedDate,
      publishedYear: htmlSpecs.publishedYear ?? contentSpecs?.publishedYear ?? ld?.publishedYear ?? null,
      language: htmlSpecs.language || contentSpecs?.language || 'vi',
      format: htmlSpecs.format || contentSpecs?.format || detectFormatFromText(html),
      pageCount: htmlSpecs.pageCount ?? contentSpecs?.pageCount ?? ld?.pageCount ?? null,
      genres: htmlSpecs.genres.length > 0 ? htmlSpecs.genres : contentSpecs?.genres ?? [],
      description,
      isbn13: targetIsbn,
      isbn10: targetIsbn?.startsWith('978') ? isbn13ToIsbn10(targetIsbn) : null,
      coverUrl: normalizeUrl(featImg || firstImgUrl || ogImg || ld?.coverUrl),
      sourceUrl: cleanPathUrl,
      rawPayload: {
        product: prodJson ?? undefined,
        htmlSpecs,
      },
    };
  };

  return {
    name: config.name,
    label: config.label,
    supportsDirectBrowserCors: config.supportsDirectBrowserCors ?? true,

    async lookupByIsbn(isbn13, ctx) {
      const forms = generateSearchIsbnForms(isbn13);
      const discoveredUrls = new Set<string>();

      for (const form of forms.slice(0, 4)) {
        const res = await fetchWithTimeout(
          ctx,
          `${config.baseUrl}/search?q=${encodeURIComponent(form)}&view=json`
        );
        if (!res.ok) continue;
        const body = await res.text();
        const entries = extractSapoSearchEntries(body, config.baseUrl);
        for (const e of entries) {
          if (e.url && !e.url.includes('${')) discoveredUrls.add(e.url);
        }
        if (discoveredUrls.size > 0) break;
      }

      if (discoveredUrls.size === 0) return [];
      const fetched = await Promise.all(
        Array.from(discoveredUrls)
          .slice(0, 4)
          .map((u) => fetchProductCandidate(u, ctx, isbn13).catch(() => null))
      );
      return fetched.filter((x): x is MetadataCandidate => x !== null);
    },

    async search(query, ctx) {
      const res = await fetchWithTimeout(
        ctx,
        `${config.baseUrl}/search?q=${encodeURIComponent(query)}&view=json`
      );
      if (!res.ok) return [];
      const body = await res.text();
      const entries = extractSapoSearchEntries(body, config.baseUrl).slice(0, 4);
      const fetched = await Promise.all(
        entries
          .filter((e) => e.url && !e.url.includes('${'))
          .map((e) => fetchProductCandidate(e.url!, ctx, null).catch(() => null))
      );
      return fetched.filter((x): x is MetadataCandidate => x !== null);
    },
  };
}

export const adcbookProvider = createSapoStoreProvider({
  name: 'adcbook',
  label: 'ADCBook',
  baseUrl: 'https://adcbook.net.vn',
});

export const goodaProvider = createSapoStoreProvider({
  name: 'gooda',
  label: 'Gooda.vn',
  baseUrl: 'https://gooda.vn',
});

export const nxbKimDongProvider = createSapoStoreProvider({
  name: 'nxb_kim_dong',
  label: 'NXB Kim Đồng',
  baseUrl: 'https://nxbkimdong.com.vn',
  defaultPublishers: ['Nhà xuất bản Kim Đồng'],
});

export const nhaNamProvider = createSapoStoreProvider({
  name: 'nha_nam',
  label: 'Nhã Nam',
  baseUrl: 'https://nhanam.vn',
  defaultPublishers: ['Nhã Nam'],
});

// ============================================================================
// 3. Haravan Store Factory (Hikaru, IPM)
// ============================================================================
interface HaravanProductJson {
  product?: {
    id?: number | string;
    title?: string;
    handle?: string;
    vendor?: string;
    product_type?: string;
    tags?: string | string[];
    body_html?: string;
    image?: { src?: string } | null;
    images?: Array<{ src?: string }>;
    variants?: Array<{ sku?: string; barcode?: string; title?: string }>;
  };
}

function parseHaravanPrefixedTags(tagsRaw: string | string[] | undefined): {
  authors: string[];
  translators: string[];
  illustrators: string[];
  seriesName?: string;
  genres: string[];
} {
  const tagsList = Array.isArray(tagsRaw)
    ? tagsRaw
    : typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

  const authors: string[] = [];
  const translators: string[] = [];
  const illustrators: string[] = [];
  const genres: string[] = [];
  let seriesName: string | undefined;

  for (const tag of tagsList) {
    const t = tag.trim();
    const lower = t.toLocaleLowerCase('vi');
    if (lower.startsWith('tacgia_')) {
      const name = t.slice(7).trim();
      if (name && !authors.includes(name)) authors.push(name);
    } else if (lower.startsWith('dichgia_')) {
      const name = t.slice(8).trim();
      if (name && !translators.includes(name)) translators.push(name);
    } else if (lower.startsWith('hoasi_')) {
      const name = t.slice(6).trim();
      if (name && !illustrators.includes(name)) illustrators.push(name);
    } else if (lower.startsWith('series_')) {
      seriesName = t.slice(7).trim();
    } else if (/^(light novel|manga|comic|tiểu thuyết|truyện tranh|tản văn|kỹ năng)$/i.test(t)) {
      if (!genres.includes(t)) genres.push(t);
    }
  }
  return { authors, translators, illustrators, seriesName, genres };
}

function createHaravanStoreProvider(config: {
  name: MetadataProviderName;
  label: string;
  baseUrl: string;
  supportsDirectBrowserCors?: boolean;
}): MetadataProviderAdapter {
  const fetchProductBySlugPath = async (
    path: string,
    ctx: ProviderExecutionContext,
    expectedIsbn: string | null
  ): Promise<MetadataCandidate | null> => {
    const cleanPath = path.split('?')[0];
    const jsonUrl = cleanPath.endsWith('.json')
      ? `${config.baseUrl}${cleanPath}`
      : `${config.baseUrl}${cleanPath}.json`;

    const res = await fetchWithTimeout(ctx, jsonUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as HaravanProductJson;
    const prod = data.product;
    if (!prod?.title) return null;

    const bodySpecs = extractVietnameseBookSpecs(prod.body_html ?? '');
    const variantIds = (prod.variants ?? []).flatMap((v) => [v.sku, v.barcode]);
    const allIsbns = collectValidIsbns(
      [...variantIds, ...bodySpecs.isbns],
      prod.body_html ?? ''
    );

    if (expectedIsbn && !allIsbns.includes(expectedIsbn)) {
      return null;
    }

    const parsedTags = parseHaravanPrefixedTags(prod.tags);
    const authors = [...parsedTags.authors];
    for (const a of bodySpecs.authors) {
      if (!authors.some((x) => x.toLocaleLowerCase('vi') === a.toLocaleLowerCase('vi'))) authors.push(a);
    }
    const translators = [...parsedTags.translators];
    for (const tr of bodySpecs.translators) {
      if (!translators.some((x) => x.toLocaleLowerCase('vi') === tr.toLocaleLowerCase('vi'))) {
        translators.push(tr);
      }
    }
    const illustrators = [...parsedTags.illustrators];
    for (const il of bodySpecs.illustrators) {
      if (!illustrators.some((x) => x.toLocaleLowerCase('vi') === il.toLocaleLowerCase('vi'))) {
        illustrators.push(il);
      }
    }

    const publishers: string[] = [];
    if (prod.vendor?.trim()) publishers.push(prod.vendor.trim());
    for (const p of bodySpecs.publishers) {
      if (!publishers.some((x) => x.toLocaleLowerCase('vi') === p.toLocaleLowerCase('vi'))) {
        publishers.push(p);
      }
    }

    const genres = [...parsedTags.genres];
    for (const g of bodySpecs.genres) {
      if (!genres.some((x) => x.toLocaleLowerCase('vi') === g.toLocaleLowerCase('vi'))) genres.push(g);
    }

    const targetIsbn = expectedIsbn || allIsbns[0] || null;
    const coverUrl = prod.image?.src || prod.images?.[0]?.src;

    return {
      externalId: String(prod.id || prod.handle || cleanPath),
      provider: config.name,
      verified: false,
      matchConfidence: expectedIsbn ? 'exact_isbn' : 'title_match',
      matchedIsbns: allIsbns,
      title: prod.title.trim(),
      authors,
      translators,
      illustrators,
      publishers,
      publishingPartner: bodySpecs.publishingPartner,
      publishedDate: bodySpecs.publishedDate,
      publishedYear: bodySpecs.publishedYear,
      language: bodySpecs.language || 'vi',
      format: bodySpecs.format || detectFormatFromText(prod.body_html ?? ''),
      pageCount: bodySpecs.pageCount,
      genres,
      description: prod.body_html ? stripHtmlToText(prod.body_html).slice(0, 1500) : undefined,
      isbn13: targetIsbn,
      isbn10: targetIsbn?.startsWith('978') ? isbn13ToIsbn10(targetIsbn) : null,
      coverUrl: normalizeUrl(coverUrl),
      seriesName: parsedTags.seriesName,
      sourceUrl: `${config.baseUrl}${cleanPath}`,
      rawPayload: data as unknown as Record<string, unknown>,
    };
  };

  const searchSlugs = async (query: string, ctx: ProviderExecutionContext): Promise<string[]> => {
    const res = await fetchWithTimeout(
      ctx,
      `${config.baseUrl}/search?type=product&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const html = await res.text();
    return Array.from(
      new Set(
        [...html.matchAll(/href=["'](?:https?:\/\/[^"'\s]+)?(\/products\/[^"'?#]+)["']/gi)].map(
          (m) => m[1]
        )
      )
    );
  };

  return {
    name: config.name,
    label: config.label,
    supportsDirectBrowserCors: config.supportsDirectBrowserCors ?? true,

    async lookupByIsbn(isbn13, ctx) {
      const forms = generateSearchIsbnForms(isbn13).slice(0, 4);
      const settled = await Promise.allSettled(forms.map((f) => searchSlugs(f, ctx)));
      const fulfilled = settled.filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled');
      if (fulfilled.length === 0) {
        const rejected = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (rejected) throw rejected.reason;
      }
      const uniqueSlugs = Array.from(new Set(fulfilled.flatMap((r) => r.value))).slice(0, 6);
      if (uniqueSlugs.length === 0) return [];

      const fetched = await Promise.all(
        uniqueSlugs.map((slug) => fetchProductBySlugPath(slug, ctx, isbn13).catch(() => null))
      );
      return fetched.filter((x): x is MetadataCandidate => x !== null);
    },

    async search(query, ctx) {
      const slugs = (await searchSlugs(query, ctx)).slice(0, 4);
      const fetched = await Promise.all(
        slugs.map((slug) => fetchProductBySlugPath(slug, ctx, null).catch(() => null))
      );
      return fetched.filter((x): x is MetadataCandidate => x !== null);
    },
  };
}

export const hikaruProvider = createHaravanStoreProvider({
  name: 'hikaru',
  label: 'Hikaru Books',
  baseUrl: 'https://hikaru.vn',
});

export const ipmProvider = createHaravanStoreProvider({
  name: 'ipm',
  label: 'IPM',
  baseUrl: 'https://ipm.vn',
});

// ============================================================================
// 4. Tiki Books (API v2 + Strict Detail ISBN Verification)
// ============================================================================
interface TikiProductDetail {
  id?: number;
  name?: string;
  sku?: string;
  short_description?: string;
  description?: string;
  thumbnail_url?: string;
  url_path?: string;
  authors?: Array<{ name?: string }>;
  specifications?: Array<{
    name?: string;
    attributes?: Array<{ code?: string; name?: string; value?: string }>;
  }>;
}

export const tikiProvider: MetadataProviderAdapter = {
  name: 'tiki',
  label: 'Tiki Books',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    // Query clean ISBN without hyphens so Tiki does not split on '-' into unrelated keyword noise
    const res = await fetchWithTimeout(
      ctx,
      `https://tiki.vn/api/v2/products?limit=5&q=${encodeURIComponent(isbn13)}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Array<{ id?: number }> };
    const ids = (json.data ?? []).map((d) => d.id).filter((id): id is number => Boolean(id)).slice(0, 3);
    if (ids.length === 0) return [];

    const details = await Promise.all(
      ids.map(async (id) => {
        const dRes = await fetchWithTimeout(ctx, `https://tiki.vn/api/v2/products/${id}`).catch(() => null);
        if (!dRes || !dRes.ok) return null;
        return (await dRes.json()) as TikiProductDetail;
      })
    );

    const out: MetadataCandidate[] = [];
    for (const det of details) {
      if (!det?.name) continue;
      const specAttrs = (det.specifications ?? []).flatMap((s) => s.attributes ?? []);
      const specText = specAttrs.map((a) => `${a.name ?? ''}: ${a.value ?? ''}`).join('\n');
      const allIsbns = collectValidIsbns(
        [det.sku, ...specAttrs.map((a) => a.value)],
        `${det.name}\n${specText}\n${det.short_description ?? ''}\n${det.description ?? ''}`
      );
      if (!allIsbns.includes(isbn13)) continue;

      const getAttr = (codes: string[]) =>
        specAttrs.find((a) => codes.includes(a.code ?? '') || codes.includes((a.name ?? '').toLowerCase()))?.value;

      const pagesStr = getAttr(['number_of_page', 'số trang']);
      const pubName = getAttr(['manufacturer', 'publisher_vn', 'nhà xuất bản', 'công ty phát hành']);
      const translator = getAttr(['dich_gia', 'dịch giả']);
      out.push({
        externalId: String(det.id),
        provider: 'tiki',
        verified: false,
        matchConfidence: 'exact_isbn',
        matchedIsbns: allIsbns,
        title: det.name,
        authors: (det.authors ?? []).map((a) => a.name).filter((x): x is string => Boolean(x)),
        translators: translator ? [translator] : [],
        publishers: pubName ? [pubName] : [],
        language: 'vi',
        pageCount: pagesStr ? Number(pagesStr.match(/\d+/)?.[0]) || null : null,
        genres: [],
        description: det.short_description ? stripHtmlToText(det.short_description) : undefined,
        isbn13,
        isbn10: isbn13.startsWith('978') ? isbn13ToIsbn10(isbn13) : null,
        coverUrl: normalizeUrl(det.thumbnail_url),
        sourceUrl: det.url_path ? `https://tiki.vn/${det.url_path.replace(/^\//, '')}` : undefined,
        rawPayload: det as unknown as Record<string, unknown>,
      });
    }
    return out;
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://tiki.vn/api/v2/products?limit=6&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{
        id?: number;
        name?: string;
        author_name?: string;
        thumbnail_url?: string;
        url_path?: string;
      }>;
    };
    return (json.data ?? [])
      .filter((d) => Boolean(d.name))
      .map((d) => ({
        externalId: String(d.id ?? ''),
        provider: 'tiki',
        verified: false,
        matchConfidence: 'title_match',
        title: d.name!,
        authors: d.author_name ? [d.author_name] : [],
        translators: [],
        publishers: [],
        language: 'vi',
        genres: [],
        coverUrl: normalizeUrl(d.thumbnail_url),
        sourceUrl: d.url_path ? `https://tiki.vn/${d.url_path.replace(/^\//, '')}` : undefined,
        rawPayload: d as unknown as Record<string, unknown>,
      }));
  },
};

// ============================================================================
// 5. International Providers (Google Books, Open Library, openBD)
// ============================================================================
export const googleBooksProvider: MetadataProviderAdapter = {
  name: 'google_books',
  label: 'Google Books',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    return this.search(`isbn:${isbn13}`, ctx);
  },

  async search(query, ctx) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '8');
    if (ctx.googleBooksApiKey) {
      url.searchParams.set('key', ctx.googleBooksApiKey);
    }

    const res = await fetchWithTimeout(ctx, url.toString());
    if (res.status === 429 || res.status === 403) {
      throw new ProviderStatusError(
        'requires_configuration',
        `Google Books HTTP ${res.status} (configure GOOGLE_BOOKS_API_KEY in Edge Function)`
      );
    }
    if (!res.ok) {
      throw new ProviderStatusError('temporarily_unavailable', `Google Books HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      items?: Array<{ id: string; volumeInfo?: Record<string, unknown> }>;
    };

    return (json.items ?? []).map((item) => {
      const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
      const ids = (info.industryIdentifiers as Array<{ type: string; identifier: string }> | undefined) ?? [];
      const raw13 = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? '';
      const raw10 = ids.find((x) => x.type === 'ISBN_10')?.identifier ?? '';
      const parsed = parseIsbn(raw13 || raw10);
      const allIsbns = collectValidIsbns(ids.map((x) => x.identifier));
      const imageLinks = info.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
      const pubDate = typeof info.publishedDate === 'string' ? info.publishedDate : undefined;

      return {
        externalId: item.id,
        provider: 'google_books',
        verified: false,
        matchedIsbns: allIsbns,
        title: String(info.title ?? 'Untitled'),
        subtitle: typeof info.subtitle === 'string' ? info.subtitle : undefined,
        authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
        translators: [],
        publishers: typeof info.publisher === 'string' ? [info.publisher] : [],
        publishedDate: pubDate,
        publishedYear: pubDate ? Number(pubDate.slice(0, 4)) || null : null,
        language: typeof info.language === 'string' ? info.language : 'en',
        pageCount: typeof info.pageCount === 'number' ? info.pageCount : null,
        genres: Array.isArray(info.categories) ? info.categories.map(String) : [],
        description: typeof info.description === 'string' ? info.description : undefined,
        isbn13: parsed.isbn13,
        isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: normalizeUrl(imageLinks?.thumbnail || imageLinks?.smallThumbnail),
        sourceUrl: typeof info.infoLink === 'string' ? info.infoLink : undefined,
        rawPayload: item as unknown as Record<string, unknown>,
      };
    });
  },
};

export const openLibraryProvider: MetadataProviderAdapter = {
  name: 'open_library',
  label: 'Open Library',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const clean = isbn13.replace(/[^0-9Xx]/g, '').toUpperCase();
    const [bibSettled, searchSettled] = await Promise.allSettled([
      fetchWithTimeout(
        ctx,
        `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
      ),
      fetchWithTimeout(
        ctx,
        `https://openlibrary.org/search.json?isbn=${encodeURIComponent(clean)}&limit=3`
      ),
    ]);
    if (bibSettled.status === 'rejected' && searchSettled.status === 'rejected') {
      throw bibSettled.reason;
    }
    const bibRes = bibSettled.status === 'fulfilled' ? bibSettled.value : null;
    const searchRes = searchSettled.status === 'fulfilled' ? searchSettled.value : null;

    const out: MetadataCandidate[] = [];
    if (bibRes && bibRes.ok) {
      const data = (await bibRes.json()) as Record<string, Record<string, unknown>>;
      const entry = data[`ISBN:${clean}`];
      if (entry) {
        const parsed = parseIsbn(clean);
        const cover = entry.cover as { large?: string; medium?: string } | undefined;
        const pubDate = typeof entry.publish_date === 'string' ? entry.publish_date : undefined;
        out.push({
          externalId: String(entry.key ?? `ol-${clean}`),
          provider: 'open_library',
          verified: false,
          matchConfidence: 'exact_isbn',
          matchedIsbns: parsed.isbn13 ? [parsed.isbn13] : [],
          title: String(entry.title ?? 'Untitled'),
          subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
          authors: Array.isArray(entry.authors)
            ? (entry.authors as Array<{ name: string }>).map((a) => a.name)
            : [],
          translators: [],
          publishers: Array.isArray(entry.publishers)
            ? (entry.publishers as Array<{ name: string }>).map((p) => p.name)
            : [],
          publishedDate: pubDate,
          publishedYear: pubDate ? Number(pubDate.match(/\d{4}/)?.[0]) || null : null,
          language: 'en',
          pageCount: typeof entry.number_of_pages === 'number' ? entry.number_of_pages : null,
          genres: Array.isArray(entry.subjects)
            ? (entry.subjects as Array<{ name: string }>).slice(0, 6).map((s) => s.name)
            : [],
          isbn13: parsed.isbn13,
          isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
          coverUrl: normalizeUrl(cover?.large || cover?.medium),
          sourceUrl: typeof entry.url === 'string' ? entry.url : undefined,
          rawPayload: entry,
        });
      }
    }

    if (out.length === 0 && searchRes && searchRes.ok) {
      const sData = (await searchRes.json()) as { docs?: Array<Record<string, unknown>> };
      for (const doc of sData.docs ?? []) {
        const isbns = collectValidIsbns(Array.isArray(doc.isbn) ? doc.isbn.map(String) : []);
        if (!isbns.includes(clean)) continue;
        const parsed = parseIsbn(clean);
        const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
        out.push({
          externalId: String(doc.key ?? `ol-${clean}`),
          provider: 'open_library',
          verified: false,
          matchConfidence: 'exact_isbn',
          matchedIsbns: isbns,
          title: String(doc.title ?? 'Untitled'),
          authors: Array.isArray(doc.author_name) ? doc.author_name.map(String) : [],
          translators: [],
          publishers: Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : [],
          publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
          language: Array.isArray(doc.language) && doc.language[0] ? String(doc.language[0]) : 'en',
          pageCount: typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
          genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 6).map(String) : [],
          isbn13: parsed.isbn13,
          isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
          coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
          sourceUrl: doc.key ? `https://openlibrary.org${String(doc.key)}` : undefined,
          rawPayload: doc,
        });
      }
    }
    return out;
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { docs?: Array<Record<string, unknown>> };
    return (data.docs ?? []).map((doc) => {
      const isbns = collectValidIsbns(Array.isArray(doc.isbn) ? doc.isbn.map(String) : []);
      const bestIsbn = isbns[0] ?? '';
      const parsed = parseIsbn(bestIsbn);
      const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
      return {
        externalId: String(doc.key ?? doc.title ?? 'ol-doc'),
        provider: 'open_library',
        verified: false,
        matchConfidence: 'title_match',
        matchedIsbns: isbns,
        title: String(doc.title ?? 'Untitled'),
        authors: Array.isArray(doc.author_name) ? doc.author_name.map(String) : [],
        translators: [],
        publishers: Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : [],
        publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        language: Array.isArray(doc.language) && doc.language[0] ? String(doc.language[0]) : 'en',
        pageCount: typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
        genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 6).map(String) : [],
        isbn13: parsed.isbn13,
        isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
        sourceUrl: doc.key ? `https://openlibrary.org${String(doc.key)}` : undefined,
        rawPayload: doc,
      };
    });
  },
};

export const openBdProvider: MetadataProviderAdapter = {
  name: 'openbd',
  label: 'openBD (JP)',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsed = parseIsbn(isbn13);
    if (!parsed.isbn13 || !parsed.isbn13.startsWith('9784')) return [];
    const res = await fetchWithTimeout(ctx, `https://api.openbd.jp/v1/get?isbn=${parsed.isbn13}`);
    if (!res.ok) return [];
    const arr = (await res.json()) as Array<{ summary?: Record<string, string> } | null>;
    const summary = arr?.[0]?.summary;
    if (!summary) return [];

    return [
      {
        externalId: `openbd-${parsed.isbn13}`,
        provider: 'openbd',
        verified: false,
        matchConfidence: 'exact_isbn',
        matchedIsbns: [parsed.isbn13],
        title: summary.title || 'Untitled',
        authors: summary.author ? [summary.author] : [],
        translators: [],
        publishers: summary.publisher ? [summary.publisher] : [],
        publishedDate: summary.pubdate || undefined,
        publishedYear: summary.pubdate ? Number(summary.pubdate.slice(0, 4)) || null : null,
        language: 'ja',
        genres: [],
        isbn13: parsed.isbn13,
        isbn10: parsed.isbn10,
        coverUrl: normalizeUrl(summary.cover),
        seriesName: summary.series || undefined,
        volumeNumber: summary.volume || undefined,
        rawPayload: arr[0] as unknown as Record<string, unknown>,
      },
    ];
  },

  async search() {
    return [];
  },
};

// ============================================================================
// 6. Status-Transparent Protected / Unavailable Catalogues (NLV OPAC, Fahasa)
// ============================================================================
export const nlvOpacProvider: MetadataProviderAdapter = {
  name: 'nlv_opac',
  label: 'Thư viện Quốc gia VN',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(isbn13)}`
    );
    if (res.status >= 500) {
      throw new ProviderStatusError(
        'temporarily_unavailable',
        `NLV OPAC unavailable (HTTP ${res.status})`
      );
    }
    if (!res.ok) {
      throw new ProviderStatusError('temporarily_unavailable', `NLV OPAC HTTP ${res.status}`);
    }
    return [];
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(query)}`
    );
    if (res.status >= 500) {
      throw new ProviderStatusError(
        'temporarily_unavailable',
        `NLV OPAC unavailable (HTTP ${res.status})`
      );
    }
    return [];
  },
};

export const fahasaProvider: MetadataProviderAdapter = {
  name: 'fahasa',
  label: 'Fahasa',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(isbn13)}`
    );
    if (res.status === 403 || res.status === 503) {
      throw new ProviderStatusError(
        'unsupported',
        'Protected by Cloudflare anti-bot challenge (HTTP 403)'
      );
    }
    return [];
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(query)}`
    );
    if (res.status === 403 || res.status === 503) {
      throw new ProviderStatusError(
        'unsupported',
        'Protected by Cloudflare anti-bot challenge (HTTP 403)'
      );
    }
    return [];
  },
};

export const ALL_METADATA_PROVIDERS: MetadataProviderAdapter[] = [
  hcmLibraryProvider,
  adcbookProvider,
  goodaProvider,
  hikaruProvider,
  nxbKimDongProvider,
  nhaNamProvider,
  ipmProvider,
  tikiProvider,
  googleBooksProvider,
  openLibraryProvider,
  openBdProvider,
  nlvOpacProvider,
  fahasaProvider,
];
