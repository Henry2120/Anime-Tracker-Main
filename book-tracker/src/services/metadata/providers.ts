import type { BookFormat, ContributorCredit, MetadataCandidate, MetadataProviderName } from '../../types/domain';
import {
  extractBookIdentifiersFromText,
  generateSearchIsbnForms,
  isbn13ToIsbn10,
  normalizeBookIdentifier,
  normalizeIsbnTo13,
  parseBookIdentifier,
  parseIsbn,
} from '../../utils/isbn';
import {
  decodeHtmlEntities,
  extractJsonLdBooks,
  extractVietnameseBookSpecs,
  foldVietnameseDiacritics,
  stripHtmlToText,
  stripSiteChromeHtml,
} from './htmlAndText';
import { parseMarc21Record } from './marc21';
import {
  normalizeLanguageCode,
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

function assertCleanHttpResponse(res: Response, providerLabel: string): void {
  if (res.status === 401 || res.status === 403) {
    throw new ProviderStatusError('access_denied', `${providerLabel} HTTP ${res.status} (access denied)`);
  }
  if (res.status === 429) {
    throw new ProviderStatusError('upstream_error', `${providerLabel} HTTP 429 (rate limited)`);
  }
  if (res.status >= 500) {
    throw new ProviderStatusError('upstream_error', `${providerLabel} HTTP ${res.status}`);
  }
}

function isHtmlChallengeBody(text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 6000).toLowerCase();
  if (
    head.includes('cf-browser-verification') ||
    head.includes('__cf_chl_opt') ||
    head.includes('challenge-platform') ||
    head.includes('/cdn-cgi/challenge-platform') ||
    head.includes('just a moment...') ||
    head.includes('attention required! | cloudflare') ||
    head.includes('g-recaptcha') ||
    head.includes('h-captcha') ||
    head.includes('enable javascript and cookies to continue')
  ) {
    return true;
  }
  return false;
}

function assertCleanTextBody(text: string, providerLabel: string): void {
  if (isHtmlChallengeBody(text)) {
    throw new ProviderStatusError(
      'access_denied',
      `${providerLabel} blocked by anti-bot / Cloudflare challenge page`
    );
  }
}

async function safeReadJson<T>(res: Response, providerLabel: string): Promise<T> {
  const raw = await res.text();
  assertCleanTextBody(raw, providerLabel);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ProviderStatusError(
      'upstream_error',
      `${providerLabel} returned malformed JSON or unexpected HTML`
    );
  }
}

async function safeReadXml(res: Response, providerLabel: string): Promise<string> {
  const xml = await res.text();
  assertCleanTextBody(xml, providerLabel);
  if (/^\s*<!doctype\s+html\b|^\s*<html\b/i.test(xml)) {
    throw new ProviderStatusError('upstream_error', `${providerLabel} returned HTML instead of XML`);
  }
  return xml;
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
    for (const found of extractBookIdentifiersFromText(val)) {
      if (found.isIsbn) push(found.isbn13);
    }
  }
  if (freeText) {
    for (const found of extractBookIdentifiersFromText(freeText)) {
      if (found.isIsbn) push(found.isbn13);
    }
  }
  return out;
}

function collectValidIdentifiers(
  values: Array<string | null | undefined>,
  freeText?: string,
  options?: { includeAllEan13InValues?: boolean }
): string[] {
  const out: string[] = [];
  const push = (id: string | null | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  for (const val of values) {
    if (!val) continue;
    const direct = normalizeBookIdentifier(val);
    if (direct) push(direct);
    for (const found of extractBookIdentifiersFromText(val, {
      includeAllEan13: options?.includeAllEan13InValues,
    })) {
      push(found.normalizedId);
    }
  }
  if (freeText) {
    for (const found of extractBookIdentifiersFromText(freeText)) {
      push(found.normalizedId);
    }
  }
  return out;
}

function detectFormatFromText(text: string): BookFormat | undefined {
  const lower = text.toLocaleLowerCase('vi');
  if (lower.includes('bìa cứng') || lower.includes('hardcover')) return 'hardcover';
  if (lower.includes('bìa mềm') || lower.includes('bìa rời') || lower.includes('paperback')) return 'paperback';
  return undefined;
}

function parsePrefixedStoreTags(tagsRaw: string | string[] | undefined): {
  authors: string[];
  translators: string[];
  illustrators: string[];
  publishers: string[];
  distributor?: string;
  seriesName?: string;
  pageCount: number | null;
  publishedYear: number | null;
  format?: BookFormat;
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
  const publishers: string[] = [];
  let distributor: string | undefined;
  const genres: string[] = [];
  let seriesName: string | undefined;
  let pageCount: number | null = null;
  let publishedYear: number | null = null;
  let format: BookFormat | undefined;

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
    } else if (lower.startsWith('minhhoa_')) {
      const name = t.slice(8).trim();
      if (name && !illustrators.includes(name)) illustrators.push(name);
    } else if (lower.startsWith('nhaxb_') || lower.startsWith('nxb_')) {
      const name = t.slice(t.indexOf('_') + 1).trim();
      if (name && !publishers.includes(name)) publishers.push(name);
    } else if (lower.startsWith('nph_') || lower.startsWith('phathanh_')) {
      const name = t.slice(t.indexOf('_') + 1).trim();
      if (name && !distributor) distributor = name;
    } else if (lower.startsWith('sotrang_')) {
      const num = Number(t.slice(8).replace(/\D/g, ''));
      if (Number.isFinite(num) && num > 0 && num < 20000) pageCount = num;
    } else if (lower.startsWith('namxb_')) {
      const yr = Number(t.slice(6).match(/(19|20)\d{2}/)?.[0]);
      if (Number.isFinite(yr)) publishedYear = yr;
    } else if (lower.startsWith('bia_') || lower.startsWith('hinhthuc_')) {
      format = detectFormatFromText(t.slice(t.indexOf('_') + 1)) ?? format;
    } else if (lower.startsWith('series_') || lower.startsWith('combo_')) {
      seriesName = seriesName || t.slice(t.indexOf('_') + 1).trim();
    } else if (/^(light novel|manga|comic|tiểu thuyết|truyện tranh|tản văn|kỹ năng|văn học)$/i.test(t)) {
      if (!genres.includes(t)) genres.push(t);
    }
  }

  return {
    authors,
    translators,
    illustrators,
    publishers,
    distributor,
    seriesName,
    pageCount,
    publishedYear,
    format,
    genres,
  };
}

// ============================================================================
// 1. Thư viện Khoa học Tổng hợp TP.HCM (MARC21 + OPAC)
// ============================================================================
export const hcmLibraryProvider: MetadataProviderAdapter = {
  name: 'hcm_library',
  label: 'Thư viện KHTH TP.HCM',
  tier: 'tier2_national',
  region: 'vi',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const urls = [
      `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=ISBN%3A%25${encodeURIComponent(isbn13)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`,
      `https://phucvu.thuvientphcm.gov.vn/Item/SearchAdvanced?SearchText=FullText%3A%25${encodeURIComponent(isbn13)}%25%3A%7CItemTypeIds%3A-1%3AINTERSECT&DocType=-1`,
    ];

    const detailIds = new Set<string>();
    for (const searchUrl of urls) {
      const res = await fetchWithTimeout(ctx, searchUrl);
      assertCleanHttpResponse(res, 'HCM Library');
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
      const marcSection =
        detHtml.match(/<div[^>]+id=["']divMARC21["'][\s\S]*?<\/div>\s*(?:<\/div>|<script)/i)?.[0] ?? detHtml;
      const marc = parseMarc21Record(marcSection);
      if (!marc) continue;

      const htmlCoverMatch = detHtml.match(
        /(?:https?:\/\/phucvu\.thuvientphcm\.gov\.vn)?(\/Upload\/ImageCover\/[^"'\s<>]+)/i
      );
      const coverUrl = htmlCoverMatch
        ? `https://phucvu.thuvientphcm.gov.vn${htmlCoverMatch[1]}`
        : marc.coverPath
          ? `https://phucvu.thuvientphcm.gov.vn${marc.coverPath.startsWith('/Upload') ? marc.coverPath : `/Upload${marc.coverPath}`}`
          : undefined;

      const matchedIds = collectValidIdentifiers(marc.isbns);
      if (!matchedIds.includes(isbn13)) continue;
      const isIsbn = isbn13.startsWith('978') || isbn13.startsWith('979');

      candidates.push({
        externalId: marc.controlNumber || id,
        provider: 'hcm_library',
        verified: false,
        matchConfidence: 'exact_isbn',
        matchedIsbns: matchedIds.filter((x) => x.startsWith('978') || x.startsWith('979')),
        matchedIdentifiers: matchedIds,
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
        isbn13: isIsbn ? isbn13 : null,
        isbn10: isIsbn && isbn13.startsWith('978') ? isbn13ToIsbn10(isbn13) : null,
        ean13: isbn13,
        identifierType: isIsbn ? 'isbn13' : 'ean13',
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
    assertCleanHttpResponse(res, 'HCM Library');
    if (!res.ok) return [];
    const html = await res.text();
    const detailIds = Array.from(new Set([...html.matchAll(/ItemDetail\/(\d+)/gi)].map((m) => m[1]))).slice(
      0,
      4
    );
    const out: MetadataCandidate[] = [];
    for (const id of detailIds) {
      const detailUrl = `https://phucvu.thuvientphcm.gov.vn/Item/ItemDetail/${id}`;
      const detRes = await fetchWithTimeout(ctx, detailUrl);
      if (!detRes.ok) continue;
      const detHtml = await detRes.text();
      const marcSection =
        detHtml.match(/<div[^>]+id=["']divMARC21["'][\s\S]*?<\/div>\s*(?:<\/div>|<script)/i)?.[0] ?? detHtml;
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
  return Array.from(urls)
    .slice(0, 5)
    .map((u) => ({ url: u }));
}

interface SapoProductJson {
  id?: number | string;
  name?: string;
  title?: string;
  alias?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  published_on?: string;
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
    expectedId: string | null
  ): Promise<MetadataCandidate | null> => {
    const productUrl = pathOrUrl.startsWith('http') ? pathOrUrl : `${config.baseUrl}${pathOrUrl}`;
    const cleanPathUrl = productUrl.split('?')[0].replace(/\/$/, '');
    const jsonUrl = cleanPathUrl.endsWith('.json') ? cleanPathUrl : `${cleanPathUrl}.json`;

    const [jsonRes, htmlRes] = await Promise.all([
      fetchWithTimeout(ctx, jsonUrl).catch(() => null),
      fetchWithTimeout(ctx, cleanPathUrl).catch(() => null),
    ]);

    if (jsonRes && jsonRes.status !== 404) assertCleanHttpResponse(jsonRes, config.label);
    if (htmlRes && htmlRes.status !== 404) assertCleanHttpResponse(htmlRes, config.label);

    let prodJson: SapoProductJson | null = null;
    if (jsonRes && jsonRes.ok) {
      const parsed = await safeReadJson<SapoProductJson & { product?: SapoProductJson }>(
        jsonRes,
        config.label
      );
      prodJson = parsed.product ?? parsed;
    }

    let html = '';
    if (htmlRes && htmlRes.ok) {
      html = await htmlRes.text();
      assertCleanTextBody(html, config.label);
    }
    if (!prodJson && !html) return null;

    const htmlSpecs = extractVietnameseBookSpecs(html);
    const contentSpecs = prodJson?.content ? extractVietnameseBookSpecs(prodJson.content) : null;
    const ldBooks = html ? extractJsonLdBooks(html) : [];
    const ld = ldBooks[0];
    const tagData = parsePrefixedStoreTags(prodJson?.tags);

    const variantIds = (prodJson?.variants ?? []).flatMap((v) => [v.sku, v.barcode]);
    const allIds = collectValidIdentifiers(
      [
        ...variantIds,
        ...htmlSpecs.identifiers,
        ...(contentSpecs?.identifiers ?? []),
        ...(ld?.identifiers ?? []),
      ],
      `${prodJson?.summary ?? ''} ${prodJson?.content ?? ''}`,
      { includeAllEan13InValues: true }
    );

    if (expectedId && !allIds.includes(expectedId)) {
      return null;
    }

    const titleFromHtml = decodeHtmlEntities(
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') ?? ''
    ).trim();
    const title = prodJson?.name?.trim() || prodJson?.title?.trim() || ld?.title || titleFromHtml;
    if (!title) return null;

    const authors = [...htmlSpecs.authors];
    for (const a of [...(contentSpecs?.authors ?? []), ...(ld?.authors ?? []), ...tagData.authors]) {
      if (a && !authors.some((x) => x.toLocaleLowerCase('vi') === a.toLocaleLowerCase('vi'))) {
        authors.push(a);
      }
    }

    const translators = [...htmlSpecs.translators];
    for (const tr of [...(contentSpecs?.translators ?? []), ...tagData.translators]) {
      if (tr && !translators.some((x) => x.toLocaleLowerCase('vi') === tr.toLocaleLowerCase('vi'))) {
        translators.push(tr);
      }
    }

    const illustrators = [...htmlSpecs.illustrators];
    for (const il of [...(contentSpecs?.illustrators ?? []), ...tagData.illustrators]) {
      if (il && !illustrators.some((x) => x.toLocaleLowerCase('vi') === il.toLocaleLowerCase('vi'))) {
        illustrators.push(il);
      }
    }

    const distributor =
      htmlSpecs.distributor || contentSpecs?.distributor || tagData.distributor || undefined;

    const publishers: string[] = [];
    const pushPub = (p?: string | null) => {
      const cleaned = p?.trim();
      if (!cleaned) return;
      if (!publishers.some((x) => x.toLocaleLowerCase('vi') === cleaned.toLocaleLowerCase('vi'))) {
        publishers.push(cleaned);
      }
    };
    for (const p of htmlSpecs.publishers) pushPub(p);
    for (const p of contentSpecs?.publishers ?? []) pushPub(p);
    for (const p of ld?.publishers ?? []) pushPub(p);
    for (const p of tagData.publishers) pushPub(p);
    if (prodJson?.vendor) {
      const vendorMatchesDistributor =
        Boolean(distributor) &&
        prodJson.vendor.trim().toLocaleLowerCase('vi') === distributor!.trim().toLocaleLowerCase('vi');
      if (!vendorMatchesDistributor || publishers.length === 0) {
        if (!vendorMatchesDistributor) pushPub(prodJson.vendor);
      }
    }
    if (publishers.length === 0 && config.defaultPublishers) {
      for (const p of config.defaultPublishers) pushPub(p);
    }

    const publishedOnYear =
      prodJson?.published_on?.match(/(19|20)\d{2}/)?.[0] ??
      html.match(/"published_on"\s*:\s*"((?:19|20)\d{2})/i)?.[1];

    const ogImg = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const featImg =
      typeof prodJson?.featured_image === 'string'
        ? prodJson.featured_image
        : prodJson?.featured_image?.src;
    const firstImg = prodJson?.images?.[0];
    const firstImgUrl = typeof firstImg === 'string' ? firstImg : firstImg?.src;

    const descriptionRaw = prodJson?.content || prodJson?.summary || ld?.description || '';
    const description = descriptionRaw ? stripHtmlToText(descriptionRaw).slice(0, 1500) : undefined;

    const targetId = expectedId || allIds[0] || null;
    const targetParsed = targetId ? parseBookIdentifier(targetId) : null;
    return {
      externalId: String(prodJson?.id || prodJson?.alias || cleanPathUrl),
      provider: config.name,
      verified: false,
      matchConfidence: expectedId ? 'exact_isbn' : 'title_match',
      matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
      matchedIdentifiers: allIds,
      title,
      authors,
      translators,
      illustrators,
      publishers,
      publishingPartner: htmlSpecs.publishingPartner || contentSpecs?.publishingPartner,
      distributor,
      publishedDate: htmlSpecs.publishedDate || contentSpecs?.publishedDate || ld?.publishedDate,
      publishedYear:
        htmlSpecs.publishedYear ??
        contentSpecs?.publishedYear ??
        ld?.publishedYear ??
        tagData.publishedYear ??
        (publishedOnYear ? Number(publishedOnYear) : null),
      language: htmlSpecs.language || contentSpecs?.language || 'vi',
      format:
        htmlSpecs.format || contentSpecs?.format || tagData.format || detectFormatFromText(html),
      pageCount: htmlSpecs.pageCount ?? contentSpecs?.pageCount ?? ld?.pageCount ?? tagData.pageCount ?? null,
      genres:
        htmlSpecs.genres.length > 0
          ? htmlSpecs.genres
          : (contentSpecs?.genres.length ? contentSpecs.genres : tagData.genres),
      description,
      isbn13: targetParsed?.isIsbn ? targetParsed.isbn13 : null,
      isbn10: targetParsed?.prefixGroup === '978' ? targetParsed.isbn10 : null,
      ean13: targetParsed?.ean13 ?? targetId,
      identifierType: targetParsed?.identifierType,
      coverUrl: normalizeUrl(featImg || firstImgUrl || ogImg || ld?.coverUrl),
      seriesName: tagData.seriesName,
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
    tier: 'tier3_publisher',
    region: 'vi',
    supportsDirectBrowserCors: config.supportsDirectBrowserCors ?? true,

    async lookupByIsbn(isbn13, ctx) {
      const forms = generateSearchIsbnForms(isbn13).slice(0, 4);
      const settled = await Promise.allSettled(
        forms.map(async (form) => {
          const res = await fetchWithTimeout(
            ctx,
            `${config.baseUrl}/search?q=${encodeURIComponent(form)}&view=json`
          );
          assertCleanHttpResponse(res, config.label);
          if (!res.ok) return [] as string[];
          const body = await res.text();
          assertCleanTextBody(body, config.label);
          return extractSapoSearchEntries(body, config.baseUrl)
            .map((e) => e.url)
            .filter((u): u is string => Boolean(u && !u.includes('${')));
        })
      );

      const fulfilled = settled.filter(
        (r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled'
      );
      if (fulfilled.length === 0) {
        const rejected = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (rejected) throw rejected.reason;
        throw new ProviderStatusError('upstream_error', `${config.label} search failed`);
      }

      const discoveredUrls = Array.from(new Set(fulfilled.flatMap((r) => r.value))).slice(0, 4);
      if (discoveredUrls.length === 0) return [];

      const detailSettled = await Promise.allSettled(
        discoveredUrls.map((u) => fetchProductCandidate(u, ctx, isbn13))
      );
      const out = detailSettled
        .filter((r): r is PromiseFulfilledResult<MetadataCandidate | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((x): x is MetadataCandidate => x !== null);
      if (out.length === 0 && detailSettled.every((r) => r.status === 'rejected')) {
        throw (detailSettled[0] as PromiseRejectedResult).reason;
      }
      return out;
    },

    async search(query, ctx) {
      const fetchEntries = async (term: string) => {
        const res = await fetchWithTimeout(
          ctx,
          `${config.baseUrl}/search?q=${encodeURIComponent(term)}&view=json`
        );
        assertCleanHttpResponse(res, config.label);
        if (!res.ok) {
          throw new ProviderStatusError('upstream_error', `${config.label} HTTP ${res.status}`);
        }
        const body = await res.text();
        assertCleanTextBody(body, config.label);
        return extractSapoSearchEntries(body, config.baseUrl);
      };

      let entries = (await fetchEntries(query)).slice(0, 4);
      if (entries.length === 0) {
        const folded = foldVietnameseDiacritics(query).trim();
        if (folded && folded.toLowerCase() !== query.trim().toLowerCase()) {
          entries = (await fetchEntries(folded)).slice(0, 4);
        }
      }
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
// 3. Haravan Store Factory (Hikaru, IPM, Phương Nam)
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

function createHaravanStoreProvider(config: {
  name: MetadataProviderName;
  label: string;
  baseUrl: string;
  supportsDirectBrowserCors?: boolean;
  defaultPublishers?: string[];
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
    if (res.status === 404) return null;
    assertCleanHttpResponse(res, config.label);
    if (!res.ok) return null;
    const data = await safeReadJson<HaravanProductJson>(res, config.label);
    const prod = data.product;
    if (!prod?.title) return null;

    const bodySpecs = extractVietnameseBookSpecs(prod.body_html ?? '');
    const parsedTags = parsePrefixedStoreTags(prod.tags);
    const variantIds = (prod.variants ?? []).flatMap((v) => [v.sku, v.barcode]);
    const allIds = collectValidIdentifiers(
      [...variantIds, ...bodySpecs.identifiers],
      prod.body_html ?? '',
      { includeAllEan13InValues: true }
    );

    if (expectedIsbn && !allIds.includes(expectedIsbn)) {
      return null;
    }

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

    const distributor = bodySpecs.distributor || parsedTags.distributor || undefined;
    const publishers: string[] = [];
    for (const p of [...bodySpecs.publishers, ...parsedTags.publishers]) {
      if (!publishers.some((x) => x.toLocaleLowerCase('vi') === p.toLocaleLowerCase('vi'))) {
        publishers.push(p);
      }
    }
    if (prod.vendor?.trim()) {
      const vendorMatchesDistributor =
        Boolean(distributor) &&
        prod.vendor.trim().toLocaleLowerCase('vi') === distributor!.trim().toLocaleLowerCase('vi');
      if (!vendorMatchesDistributor && !publishers.some((x) => x.toLocaleLowerCase('vi') === prod.vendor!.trim().toLocaleLowerCase('vi'))) {
        publishers.push(prod.vendor.trim());
      }
    }
    if (publishers.length === 0 && config.defaultPublishers) {
      publishers.push(...config.defaultPublishers);
    }

    const genres = [...parsedTags.genres];
    for (const g of bodySpecs.genres) {
      if (!genres.some((x) => x.toLocaleLowerCase('vi') === g.toLocaleLowerCase('vi'))) genres.push(g);
    }

    const targetId = expectedIsbn || allIds[0] || null;
    const targetParsed = targetId ? parseBookIdentifier(targetId) : null;
    const coverUrl = prod.image?.src || prod.images?.[0]?.src;

    return {
      externalId: String(prod.id || prod.handle || cleanPath),
      provider: config.name,
      verified: false,
      matchConfidence: expectedIsbn ? 'exact_isbn' : 'title_match',
      matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
      matchedIdentifiers: allIds,
      title: prod.title.trim(),
      authors,
      translators,
      illustrators,
      publishers,
      publishingPartner: bodySpecs.publishingPartner,
      distributor,
      publishedDate: bodySpecs.publishedDate,
      publishedYear: bodySpecs.publishedYear ?? parsedTags.publishedYear,
      language: bodySpecs.language || 'vi',
      format: bodySpecs.format || parsedTags.format || detectFormatFromText(prod.body_html ?? ''),
      pageCount: bodySpecs.pageCount ?? parsedTags.pageCount,
      genres,
      description: prod.body_html ? stripHtmlToText(prod.body_html).slice(0, 1500) : undefined,
      isbn13: targetParsed?.isIsbn ? targetParsed.isbn13 : null,
      isbn10: targetParsed?.prefixGroup === '978' ? targetParsed.isbn10 : null,
      ean13: targetParsed?.ean13 ?? targetId,
      identifierType: targetParsed?.identifierType,
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
    assertCleanHttpResponse(res, config.label);
    if (!res.ok) return [];
    const html = await res.text();
    assertCleanTextBody(html, config.label);
    const bodyHtml = stripSiteChromeHtml(html);
    const rawSlugs = Array.from(
      new Set(
        [...bodyHtml.matchAll(/href=["'](?:https?:\/\/[^"'\s]+)?(\/products\/[^"'?#]+)["']/gi)].map(
          (m) => m[1]
        )
      )
    );
    const queryTokens = foldVietnameseDiacritics(query)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2);
    if (queryTokens.length === 0) return rawSlugs;
    return rawSlugs.sort((a, b) => {
      const scoreSlug = (slug: string) => {
        const lower = slug.toLowerCase();
        return queryTokens.reduce((sum, tok) => sum + (lower.includes(tok) ? 1 : 0), 0);
      };
      return scoreSlug(b) - scoreSlug(a);
    });
  };

  return {
    name: config.name,
    label: config.label,
    tier: 'tier3_publisher',
    region: 'vi',
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

export const phuongNamProvider = createHaravanStoreProvider({
  name: 'phuong_nam',
  label: 'Nhà sách Phương Nam',
  baseUrl: 'https://nhasachphuongnam.com',
  supportsDirectBrowserCors: true,
  defaultPublishers: ['Nhà sách Phương Nam'],
});

// ============================================================================
// 3b. First News - Trí Việt (https://firstnews.vn)
// ============================================================================
function extractFirstNewsProductUrls(html: string, term: string): string[] {
  const bodyHtml = stripSiteChromeHtml(html);
  const rawUrls = Array.from(
    new Set(
      [
        ...bodyHtml.matchAll(
          /href=["']((?:https?:\/\/firstnews\.vn)?\/(?:[^"'?#\s]+-p\d+\.html|san-pham\/[^"'?#\s]+))["']/gi
        ),
      ].map((m) => (m[1].startsWith('http') ? m[1] : `https://firstnews.vn${m[1]}`))
    )
  );
  const tokens = foldVietnameseDiacritics(term)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return rawUrls;
  return rawUrls.sort((a, b) => {
    const score = (u: string) =>
      tokens.reduce((sum, tok) => sum + (u.toLowerCase().includes(tok) ? 1 : 0), 0);
    return score(b) - score(a);
  });
}

async function fetchFirstNewsProductCandidate(
  productUrl: string,
  ctx: ProviderExecutionContext,
  expectedId: string | null
): Promise<MetadataCandidate | null> {
  const res = await fetchWithTimeout(ctx, productUrl);
  if (res.status === 404) return null;
  assertCleanHttpResponse(res, 'First News - Trí Việt');
  if (!res.ok) return null;
  const html = await res.text();
  assertCleanTextBody(html, 'First News - Trí Việt');

  const bodyHtml = stripSiteChromeHtml(html);
  const specs = extractVietnameseBookSpecs(bodyHtml);
  const ldBooks = extractJsonLdBooks(html);
  const ld = ldBooks[0];

  const allIds = collectValidIdentifiers(
    [...specs.identifiers, ...(ld?.identifiers ?? []), ...(ld?.isbns ?? [])],
    bodyHtml,
    { includeAllEan13InValues: true }
  );

  if (expectedId && !allIds.includes(expectedId)) {
    return null;
  }

  const ogTitleRaw =
    html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  const metaTitleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawHeading = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '');
  const cleanTitleCandidate = (raw?: string | null) =>
    decodeHtmlEntities(raw ?? '')
      .replace(/\s*[-|]\s*First News.*$/i, '')
      .trim();

  const h1Clean = cleanTitleCandidate(rawHeading);
  const title =
    cleanTitleCandidate(ogTitleRaw) ||
    cleanTitleCandidate(ld?.title) ||
    cleanTitleCandidate(metaTitleTag) ||
    (!/khuyến\s*mại/i.test(h1Clean) ? h1Clean : '');
  if (!title) return null;

  const ogImg =
    html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

  const targetId = expectedId || allIds[0] || null;
  const targetParsed = targetId ? parseBookIdentifier(targetId) : null;

  const publishers = specs.publishers.length > 0 ? specs.publishers : ld?.publishers ?? [];
  const distributor = specs.distributor || 'First News - Trí Việt';

  return {
    externalId: productUrl,
    provider: 'first_news',
    tier: 'tier3_publisher',
    verified: false,
    matchConfidence: expectedId ? 'exact_isbn' : 'title_match',
    matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
    matchedIdentifiers: allIds,
    title,
    authors: specs.authors.length > 0 ? specs.authors : ld?.authors ?? [],
    translators: specs.translators,
    illustrators: specs.illustrators,
    publishers: publishers.length > 0 ? publishers : ['First News - Trí Việt'],
    publishingPartner: specs.publishingPartner,
    distributor,
    publishedDate: specs.publishedDate || ld?.publishedDate,
    publishedYear: specs.publishedYear ?? ld?.publishedYear ?? null,
    language: specs.language || normalizeLanguageCode(undefined, { isbn13: targetId }) || 'vi',
    format: specs.format || detectFormatFromText(bodyHtml),
    pageCount: specs.pageCount ?? ld?.pageCount ?? null,
    genres: specs.genres,
    description: ld?.description,
    isbn13: targetParsed?.isIsbn ? targetParsed.isbn13 : null,
    isbn10: targetParsed?.prefixGroup === '978' ? targetParsed.isbn10 : null,
    ean13: targetParsed?.ean13 ?? targetId,
    identifierType: targetParsed?.identifierType,
    coverUrl: normalizeUrl(ogImg || ld?.coverUrl),
    sourceUrl: productUrl,
    rawPayload: { specs, url: productUrl },
  };
}

export const firstNewsProvider: MetadataProviderAdapter = {
  name: 'first_news',
  label: 'First News - Trí Việt',
  tier: 'tier3_publisher',
  region: 'vi',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const forms = generateSearchIsbnForms(isbn13).slice(0, 3);
    const settled = await Promise.allSettled(
      forms.map(async (form) => {
        const res = await fetchWithTimeout(
          ctx,
          `https://firstnews.vn/tim-kiem?keyword=${encodeURIComponent(form)}`
        );
        assertCleanHttpResponse(res, 'First News - Trí Việt');
        if (!res.ok) return [] as string[];
        const html = await res.text();
        assertCleanTextBody(html, 'First News - Trí Việt');
        return extractFirstNewsProductUrls(html, form);
      })
    );

    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled'
    );
    if (fulfilled.length === 0) {
      const rejected = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejected) throw rejected.reason;
    }

    const urls = Array.from(new Set(fulfilled.flatMap((r) => r.value))).slice(0, 4);
    const fetched = await Promise.all(
      urls.map((u) => fetchFirstNewsProductCandidate(u, ctx, isbn13).catch(() => null))
    );
    return fetched.filter((x): x is MetadataCandidate => x !== null);
  },

  async search(query, ctx) {
    const searchUrls = async (term: string) => {
      const res = await fetchWithTimeout(
        ctx,
        `https://firstnews.vn/tim-kiem?keyword=${encodeURIComponent(term)}`
      );
      assertCleanHttpResponse(res, 'First News - Trí Việt');
      if (!res.ok) return [] as string[];
      const html = await res.text();
      assertCleanTextBody(html, 'First News - Trí Việt');
      return extractFirstNewsProductUrls(html, term);
    };

    let urls = await searchUrls(query);
    if (urls.length === 0) {
      const folded = foldVietnameseDiacritics(query).trim();
      if (folded && folded.toLowerCase() !== query.trim().toLowerCase()) {
        urls = await searchUrls(folded);
      }
    }
    const fetched = await Promise.all(
      urls.slice(0, 4).map((u) => fetchFirstNewsProductCandidate(u, ctx, null).catch(() => null))
    );
    return fetched.filter((x): x is MetadataCandidate => x !== null);
  },
};

// ============================================================================
// 4. Amak Books (WordPress /book/<slug>/ Catalogue — proxy/server mode)
// ============================================================================
export const amakProvider: MetadataProviderAdapter = {
  name: 'amak',
  label: 'Amak Books',
  tier: 'tier3_publisher',
  region: 'vi',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const forms = generateSearchIsbnForms(isbn13).slice(0, 3);
    const allSettled = await Promise.allSettled(
      forms.map(async (form) => {
        const res = await fetchWithTimeout(ctx, `https://amak.vn/?s=${encodeURIComponent(form)}`);
        assertCleanHttpResponse(res, 'Amak Books');
        if (!res.ok) return [] as string[];
        const html = await res.text();
        assertCleanTextBody(html, 'Amak Books');
        return [...html.matchAll(/href=["'](https:\/\/amak\.vn\/book\/[^"'?#]+)["']/gi)].map(
          (m) => m[1]
        );
      })
    );
    const fulfilled = allSettled.filter(
      (r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled'
    );
    if (fulfilled.length === 0) {
      const rej = allSettled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rej) throw rej.reason;
    }
    const urls = Array.from(new Set(fulfilled.flatMap((r) => r.value)));
    if (urls.length === 0) return [];

    const out: MetadataCandidate[] = [];
    for (const url of urls.slice(0, 4)) {
      const det = await fetchWithTimeout(ctx, url).catch(() => null);
      if (!det || !det.ok) continue;
      const html = await det.text();
      assertCleanTextBody(html, 'Amak Books');
      const specs = extractVietnameseBookSpecs(html);
      const ld = extractJsonLdBooks(html)[0];
      const allIds = collectValidIdentifiers([...specs.identifiers, ...(ld?.identifiers ?? [])]);
      if (!allIds.includes(isbn13)) continue;
      const title =
        decodeHtmlEntities(
          html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') ?? ''
        ).trim() || ld?.title;
      if (!title) continue;
      const ogImg = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
      const parsedId = parseBookIdentifier(isbn13);
      out.push({
        externalId: url,
        provider: 'amak',
        verified: false,
        matchConfidence: 'exact_isbn',
        matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
        matchedIdentifiers: allIds,
        title,
        authors: specs.authors.length ? specs.authors : ld?.authors ?? [],
        translators: specs.translators,
        illustrators: specs.illustrators,
        publishers: specs.publishers.length ? specs.publishers : ['Amak Books'],
        publishingPartner: specs.publishingPartner,
        distributor: specs.distributor,
        publishedDate: specs.publishedDate,
        publishedYear: specs.publishedYear ?? ld?.publishedYear ?? null,
        language: specs.language || 'vi',
        format: specs.format || detectFormatFromText(html),
        pageCount: specs.pageCount ?? ld?.pageCount ?? null,
        genres: specs.genres,
        isbn13: parsedId.isIsbn ? parsedId.isbn13 : null,
        isbn10: parsedId.prefixGroup === '978' ? parsedId.isbn10 : null,
        ean13: parsedId.ean13 ?? isbn13,
        identifierType: parsedId.identifierType,
        coverUrl: normalizeUrl(ogImg || ld?.coverUrl),
        sourceUrl: url,
        rawPayload: { url, specs },
      });
    }
    return out;
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(ctx, `https://amak.vn/?s=${encodeURIComponent(query)}`);
    assertCleanHttpResponse(res, 'Amak Books');
    if (!res.ok) return [];
    const html = await res.text();
    const urls = Array.from(
      new Set([...html.matchAll(/href=["'](https:\/\/amak\.vn\/book\/[^"'?#]+)["']/gi)].map((m) => m[1]))
    ).slice(0, 4);
    const out: MetadataCandidate[] = [];
    for (const url of urls) {
      const det = await fetchWithTimeout(ctx, url).catch(() => null);
      if (!det || !det.ok) continue;
      const dHtml = await det.text();
      const specs = extractVietnameseBookSpecs(dHtml);
      const ld = extractJsonLdBooks(dHtml)[0];
      const title =
        decodeHtmlEntities(
          dHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') ?? ''
        ).trim() || ld?.title;
      if (!title) continue;
      const ogImg = dHtml.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
      const firstIsbn = specs.isbns[0] || ld?.isbns[0] || null;
      out.push({
        externalId: url,
        provider: 'amak',
        verified: false,
        matchConfidence: 'title_match',
        matchedIsbns: specs.isbns,
        title,
        authors: specs.authors.length ? specs.authors : ld?.authors ?? [],
        translators: specs.translators,
        illustrators: specs.illustrators,
        publishers: specs.publishers.length ? specs.publishers : ['Amak Books'],
        publishingPartner: specs.publishingPartner,
        publishedYear: specs.publishedYear ?? ld?.publishedYear ?? null,
        language: specs.language || 'vi',
        format: specs.format || detectFormatFromText(dHtml),
        pageCount: specs.pageCount ?? ld?.pageCount ?? null,
        genres: specs.genres,
        isbn13: firstIsbn,
        isbn10: firstIsbn?.startsWith('978') ? isbn13ToIsbn10(firstIsbn) : null,
        coverUrl: normalizeUrl(ogImg || ld?.coverUrl),
        sourceUrl: url,
        rawPayload: { url, specs },
      });
    }
    return out;
  },
};

// ============================================================================
// 5. Tiki Books (API v2 — requires proxy/Edge Function due to missing browser CORS)
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
  tier: 'tier3_publisher',
  region: 'vi',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://tiki.vn/api/v2/products?limit=5&q=${encodeURIComponent(isbn13)}`
    );
    assertCleanHttpResponse(res, 'Tiki Books');
    if (!res.ok) return [];
    const json = await safeReadJson<{ data?: Array<{ id?: number }> }>(res, 'Tiki Books');
    const ids = (json.data ?? [])
      .map((d) => d.id)
      .filter((id): id is number => Boolean(id))
      .slice(0, 3);
    if (ids.length === 0) return [];

    const details = await Promise.all(
      ids.map(async (id) => {
        const dRes = await fetchWithTimeout(ctx, `https://tiki.vn/api/v2/products/${id}`).catch(() => null);
        if (!dRes || !dRes.ok) return null;
        return await safeReadJson<TikiProductDetail>(dRes, 'Tiki Books').catch(() => null);
      })
    );

    const parsedTarget = parseBookIdentifier(isbn13);
    const out: MetadataCandidate[] = [];
    for (const det of details) {
      if (!det?.name) continue;
      const specAttrs = (det.specifications ?? []).flatMap((s) => s.attributes ?? []);
      const specText = specAttrs.map((a) => `${a.name ?? ''}: ${a.value ?? ''}`).join('\n');
      const allIds = collectValidIdentifiers(
        [det.sku, ...specAttrs.map((a) => a.value)],
        `${det.name}\n${specText}\n${det.short_description ?? ''}\n${det.description ?? ''}`,
        { includeAllEan13InValues: true }
      );
      if (!allIds.includes(isbn13)) continue;

      const getAttr = (codes: string[]) =>
        specAttrs.find((a) => codes.includes(a.code ?? '') || codes.includes((a.name ?? '').toLowerCase()))
          ?.value;

      const pagesStr = getAttr(['number_of_page', 'số trang']);
      const publisherVal = getAttr(['publisher_vn', 'nhà xuất bản']);
      const distributorVal = getAttr(['manufacturer', 'issuing_house', 'công ty phát hành', 'nhà phát hành']);
      const publishers = publisherVal
        ? [publisherVal]
        : distributorVal
          ? [distributorVal]
          : [];
      const translator = getAttr(['dich_gia', 'dịch giả', 'translator']);
      out.push({
        externalId: String(det.id),
        provider: 'tiki',
        verified: false,
        matchConfidence: 'exact_isbn',
        matchedIsbns: allIds.filter((id) => id.startsWith('978') || id.startsWith('979')),
        matchedIdentifiers: allIds,
        title: det.name,
        authors: (det.authors ?? []).map((a) => a.name).filter((x): x is string => Boolean(x)),
        translators: translator ? [translator] : [],
        publishers,
        distributor: distributorVal && publisherVal ? distributorVal : undefined,
        language: 'vi',
        pageCount: pagesStr ? Number(pagesStr.match(/\d+/)?.[0]) || null : null,
        genres: [],
        description: det.short_description ? stripHtmlToText(det.short_description) : undefined,
        isbn13: parsedTarget.isIsbn ? parsedTarget.isbn13 : null,
        isbn10: parsedTarget.prefixGroup === '978' ? parsedTarget.isbn10 : null,
        ean13: parsedTarget.ean13 ?? isbn13,
        identifierType: parsedTarget.identifierType,
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
    assertCleanHttpResponse(res, 'Tiki Books');
    if (!res.ok) return [];
    const json = await safeReadJson<{
      data?: Array<{
        id?: number;
        name?: string;
        author_name?: string;
        thumbnail_url?: string;
        url_path?: string;
      }>;
    }>(res, 'Tiki Books');
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
// 6. International Providers (Google Books, Open Library, openBD)
// ============================================================================
export const googleBooksProvider: MetadataProviderAdapter = {
  name: 'google_books',
  label: 'Google Books',
  tier: 'tier1_international',
  region: 'global',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    const items = await this.search(`isbn:${parsedTarget.isbn13}`, ctx);
    return items.map((c) => {
      const ids = c.matchedIdentifiers ?? c.matchedIsbns ?? [];
      const exact = ids.includes(parsedTarget.isbn13!);
      return {
        ...c,
        matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
      };
    });
  },

  async search(query, ctx) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '8');
    if (ctx.googleBooksApiKey) {
      url.searchParams.set('key', ctx.googleBooksApiKey);
    }

    const res = await fetchWithTimeout(ctx, url.toString());
    if (res.status === 429) {
      throw new ProviderStatusError(
        'api_key_required',
        'Google Books quota exhausted (HTTP 429) — configure GOOGLE_BOOKS_API_KEY'
      );
    }
    if (res.status === 401 || res.status === 403) {
      const bodyText = await res.text().catch(() => '');
      if (/key|quota|limit/i.test(bodyText) || !ctx.googleBooksApiKey) {
        throw new ProviderStatusError(
          'api_key_required',
          `Google Books HTTP ${res.status} — API key missing or quota restricted`
        );
      }
      throw new ProviderStatusError('access_denied', `Google Books HTTP ${res.status}`);
    }
    if (!res.ok) {
      throw new ProviderStatusError('upstream_error', `Google Books HTTP ${res.status}`);
    }

    const json = await safeReadJson<{
      items?: Array<{ id: string; volumeInfo?: Record<string, unknown> }>;
    }>(res, 'Google Books');

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
        matchedIdentifiers: allIsbns,
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
        ean13: parsed.isbn13,
        identifierType: parsed.isbn13 ? 'isbn13' : undefined,
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
  tier: 'tier1_international',
  region: 'global',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    const clean = parsedTarget.isbn13;
    const [editionSettled, bibSettled, searchSettled] = await Promise.allSettled([
      fetchWithTimeout(ctx, `https://openlibrary.org/isbn/${encodeURIComponent(clean)}.json`),
      fetchWithTimeout(
        ctx,
        `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
      ),
      fetchWithTimeout(
        ctx,
        `https://openlibrary.org/search.json?isbn=${encodeURIComponent(clean)}&limit=3`
      ),
    ]);
    if (
      editionSettled.status === 'rejected' &&
      bibSettled.status === 'rejected' &&
      searchSettled.status === 'rejected'
    ) {
      throw bibSettled.reason;
    }
    const edRes = editionSettled.status === 'fulfilled' ? editionSettled.value : null;
    const bibRes = bibSettled.status === 'fulfilled' ? bibSettled.value : null;
    const searchRes = searchSettled.status === 'fulfilled' ? searchSettled.value : null;

    if (edRes && edRes.status !== 404) assertCleanHttpResponse(edRes, 'Open Library');
    if (bibRes) assertCleanHttpResponse(bibRes, 'Open Library');
    if (searchRes) assertCleanHttpResponse(searchRes, 'Open Library');

    const edJson =
      edRes && edRes.ok ? await safeReadJson<Record<string, unknown>>(edRes, 'Open Library') : null;
    const parsed = parsedTarget;

    // Extract rich multilingual / edition fields from /isbn/{isbn}.json when available
    const edLangKey = Array.isArray(edJson?.languages)
      ? (edJson!.languages[0] as { key?: string } | undefined)?.key
      : undefined;
    const edLang = normalizeLanguageCode(edLangKey, { isbn13: parsed.isbn13 });
    const edOriginalTitle =
      Array.isArray(edJson?.work_titles) && typeof edJson!.work_titles[0] === 'string'
        ? String(edJson!.work_titles[0]).replace(/\.$/, '').trim()
        : undefined;
    const edEditionName = typeof edJson?.edition_name === 'string' ? edJson.edition_name.trim() : undefined;
    const edFormat = typeof edJson?.physical_format === 'string'
      ? detectFormatFromText(edJson.physical_format)
      : undefined;
    const edPages = typeof edJson?.number_of_pages === 'number' ? edJson.number_of_pages : null;
    const edPublishers = Array.isArray(edJson?.publishers) ? edJson!.publishers.map(String) : [];
    const edCoverId = Array.isArray(edJson?.covers) && typeof edJson!.covers[0] === 'number'
      ? edJson!.covers[0]
      : null;

    const edExplicitIsbns = collectValidIsbns([
      ...(Array.isArray(edJson?.isbn_13) ? edJson!.isbn_13.map(String) : []),
      ...(Array.isArray(edJson?.isbn_10) ? edJson!.isbn_10.map(String) : []),
    ]);

    // Extract translator from by_statement or contributions when explicitly stated
    const olTranslators: string[] = [];
    const byStmt = typeof edJson?.by_statement === 'string' ? edJson.by_statement : '';
    const transMatch = byStmt.match(/translat(?:ed|ion)[^;.]*?\bby\s+([^.;]+)/i);
    if (transMatch?.[1]) {
      olTranslators.push(transMatch[1].trim());
    }

    const out: MetadataCandidate[] = [];
    if (bibRes && bibRes.ok) {
      const data = await safeReadJson<Record<string, Record<string, unknown>>>(bibRes, 'Open Library');
      const entry = data[`ISBN:${clean}`];
      if (entry) {
        const entryIdentifiers = entry.identifiers as
          | { isbn_13?: string[]; isbn_10?: string[] }
          | undefined;
        const entryExplicitIsbns = collectValidIsbns([
          ...(Array.isArray(entryIdentifiers?.isbn_13) ? entryIdentifiers!.isbn_13.map(String) : []),
          ...(Array.isArray(entryIdentifiers?.isbn_10) ? entryIdentifiers!.isbn_10.map(String) : []),
        ]);
        const explicitIsbns = Array.from(new Set([...entryExplicitIsbns, ...edExplicitIsbns]));
        const hasConflictingExplicit = explicitIsbns.length > 0 && !explicitIsbns.includes(clean);
        const exact = !hasConflictingExplicit;
        const resolvedIsbn = exact ? parsed.isbn13 : explicitIsbns[0];
        const resolvedParsed = parseIsbn(resolvedIsbn ?? '');

        const cover = entry.cover as { large?: string; medium?: string } | undefined;
        const pubDate =
          (typeof entry.publish_date === 'string' ? entry.publish_date : undefined) ??
          (typeof edJson?.publish_date === 'string' ? edJson.publish_date : undefined);
        const rawLang =
          edLang !== 'und'
            ? edLang
            : normalizeLanguageCode(undefined, { isbn13: resolvedParsed.isbn13 });
        const publishers = Array.isArray(entry.publishers) && entry.publishers.length > 0
          ? (entry.publishers as Array<{ name: string }>).map((p) => p.name)
          : edPublishers;

        out.push({
          externalId: String(entry.key ?? edJson?.key ?? `ol-${clean}`),
          provider: 'open_library',
          tier: 'tier1_international',
          verified: false,
          matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
          matchedIsbns: explicitIsbns.length > 0 ? explicitIsbns : resolvedParsed.isbn13 ? [resolvedParsed.isbn13] : [],
          matchedIdentifiers: explicitIsbns.length > 0 ? explicitIsbns : resolvedParsed.isbn13 ? [resolvedParsed.isbn13] : [],
          title: String(entry.title ?? edJson?.title ?? 'Untitled'),
          originalTitle: edOriginalTitle,
          subtitle:
            (typeof entry.subtitle === 'string' ? entry.subtitle : undefined) ??
            (typeof edJson?.subtitle === 'string' ? edJson.subtitle : undefined),
          editionName: edEditionName,
          authors: Array.isArray(entry.authors)
            ? (entry.authors as Array<{ name: string }>).map((a) => a.name)
            : [],
          translators: olTranslators,
          publishers,
          publishedDate: pubDate,
          publishedYear: pubDate ? Number(pubDate.match(/\d{4}/)?.[0]) || null : null,
          language: rawLang === 'und' ? 'en' : rawLang,
          format: edFormat,
          pageCount:
            typeof entry.number_of_pages === 'number' ? entry.number_of_pages : edPages,
          genres: Array.isArray(entry.subjects)
            ? (entry.subjects as Array<{ name: string }>).slice(0, 6).map((s) => s.name)
            : [],
          isbn13: resolvedParsed.isbn13,
          isbn10: resolvedParsed.prefixGroup === '978' ? resolvedParsed.isbn10 : null,
          ean13: resolvedParsed.isbn13,
          identifierType: resolvedParsed.isbn13 ? 'isbn13' : undefined,
          coverUrl: normalizeUrl(
            cover?.large ||
              cover?.medium ||
              (edCoverId ? `https://covers.openlibrary.org/b/id/${edCoverId}-L.jpg` : undefined)
          ),
          sourceUrl:
            typeof entry.url === 'string'
              ? entry.url
              : edJson?.key
                ? `https://openlibrary.org${String(edJson.key)}`
                : undefined,
          rawPayload: edJson ? { ...entry, editionJson: edJson } : entry,
        });
      }
    }

    if (out.length === 0 && edJson?.title) {
      const hasConflictingExplicit = edExplicitIsbns.length > 0 && !edExplicitIsbns.includes(clean);
      const exact = !hasConflictingExplicit;
      const resolvedIsbn = exact ? parsed.isbn13 : edExplicitIsbns[0];
      const resolvedParsed = parseIsbn(resolvedIsbn ?? '');
      const pubDate = typeof edJson.publish_date === 'string' ? edJson.publish_date : undefined;
      out.push({
        externalId: String(edJson.key ?? `ol-${clean}`),
        provider: 'open_library',
        tier: 'tier1_international',
        verified: false,
        matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
        matchedIsbns: edExplicitIsbns.length > 0 ? edExplicitIsbns : resolvedParsed.isbn13 ? [resolvedParsed.isbn13] : [],
        matchedIdentifiers: edExplicitIsbns.length > 0 ? edExplicitIsbns : resolvedParsed.isbn13 ? [resolvedParsed.isbn13] : [],
        title: String(edJson.title),
        originalTitle: edOriginalTitle,
        subtitle: typeof edJson.subtitle === 'string' ? edJson.subtitle : undefined,
        editionName: edEditionName,
        authors: [],
        translators: olTranslators,
        publishers: edPublishers,
        publishedDate: pubDate,
        publishedYear: pubDate ? Number(pubDate.match(/\d{4}/)?.[0]) || null : null,
        language: edLang === 'und' ? 'en' : edLang,
        format: edFormat,
        pageCount: edPages,
        genres: [],
        isbn13: resolvedParsed.isbn13,
        isbn10: resolvedParsed.prefixGroup === '978' ? resolvedParsed.isbn10 : null,
        ean13: resolvedParsed.isbn13,
        identifierType: resolvedParsed.isbn13 ? 'isbn13' : undefined,
        coverUrl: edCoverId ? `https://covers.openlibrary.org/b/id/${edCoverId}-L.jpg` : undefined,
        sourceUrl: edJson.key ? `https://openlibrary.org${String(edJson.key)}` : undefined,
        rawPayload: edJson,
      });
    }

    if (out.length === 0 && searchRes && searchRes.ok) {
      const sData = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(searchRes, 'Open Library');
      for (const doc of sData.docs ?? []) {
        const isbns = collectValidIsbns(Array.isArray(doc.isbn) ? doc.isbn.map(String) : []);
        const exact = isbns.includes(clean);
        const docParsed = parseIsbn(exact ? clean : isbns[0] ?? '');
        const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
        const lang = normalizeLanguageCode(
          Array.isArray(doc.language) && doc.language[0] ? String(doc.language[0]) : undefined,
          { isbn13: docParsed.isbn13 }
        );
        out.push({
          externalId: String(doc.key ?? `ol-${clean}`),
          provider: 'open_library',
          tier: 'tier1_international',
          verified: false,
          matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
          matchedIsbns: isbns,
          matchedIdentifiers: isbns,
          title: String(doc.title ?? 'Untitled'),
          authors: Array.isArray(doc.author_name) ? doc.author_name.map(String) : [],
          translators: [],
          publishers: Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : [],
          publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
          language: lang === 'und' ? 'en' : lang,
          pageCount: typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
          genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 6).map(String) : [],
          isbn13: docParsed.isbn13,
          isbn10: docParsed.prefixGroup === '978' ? docParsed.isbn10 : null,
          ean13: docParsed.isbn13,
          identifierType: docParsed.isbn13 ? 'isbn13' : undefined,
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
    assertCleanHttpResponse(res, 'Open Library');
    if (!res.ok) return [];
    const data = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(res, 'Open Library');
    return (data.docs ?? []).map((doc) => {
      const isbns = collectValidIsbns(Array.isArray(doc.isbn) ? doc.isbn.map(String) : []);
      const bestIsbn = isbns[0] ?? '';
      const parsed = parseIsbn(bestIsbn);
      const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
      const lang = normalizeLanguageCode(
        Array.isArray(doc.language) && doc.language[0] ? String(doc.language[0]) : undefined,
        { isbn13: parsed.isbn13 }
      );
      return {
        externalId: String(doc.key ?? doc.title ?? 'ol-doc'),
        provider: 'open_library',
        tier: 'tier1_international',
        verified: false,
        matchConfidence: 'title_match',
        matchedIsbns: isbns,
        title: String(doc.title ?? 'Untitled'),
        authors: Array.isArray(doc.author_name) ? doc.author_name.map(String) : [],
        translators: [],
        publishers: Array.isArray(doc.publisher) ? doc.publisher.slice(0, 2).map(String) : [],
        publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        language: lang === 'und' ? 'en' : lang,
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

export const crossrefProvider: MetadataProviderAdapter = {
  name: 'crossref',
  label: 'CrossRef Works',
  tier: 'tier1_international',
  region: 'global',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    const res = await fetchWithTimeout(
      ctx,
      `https://api.crossref.org/works?filter=isbn:${encodeURIComponent(parsedTarget.isbn13)}&rows=4`
    );
    if (res.status === 429) {
      throw new ProviderStatusError('upstream_error', 'CrossRef rate limited (HTTP 429)');
    }
    assertCleanHttpResponse(res, 'CrossRef Works');
    if (!res.ok) return [];
    const data = await safeReadJson<{
      message?: { items?: Array<Record<string, unknown>> };
    }>(res, 'CrossRef Works');
    return parseCrossRefItems(data.message?.items ?? [], parsedTarget.isbn13);
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&filter=type:monograph,type:book,type:edited-book&rows=6`
    );
    if (res.status === 429) {
      throw new ProviderStatusError('upstream_error', 'CrossRef rate limited (HTTP 429)');
    }
    assertCleanHttpResponse(res, 'CrossRef Works');
    if (!res.ok) return [];
    const data = await safeReadJson<{
      message?: { items?: Array<Record<string, unknown>> };
    }>(res, 'CrossRef Works');
    return parseCrossRefItems(data.message?.items ?? [], null);
  },
};

function parseCrossRefItems(
  items: Array<Record<string, unknown>>,
  targetIsbn: string | null
): MetadataCandidate[] {
  const out: MetadataCandidate[] = [];
  for (const item of items) {
    const rawTitles = Array.isArray(item.title) ? item.title.map(String) : [];
    const title = rawTitles[0]?.trim();
    if (!title) continue;
    const isbns = collectValidIsbns(Array.isArray(item.ISBN) ? item.ISBN.map(String) : []);
    const exact = Boolean(targetIsbn && isbns.includes(targetIsbn));
    const bestIsbn = exact ? targetIsbn! : isbns[0] || '';
    const parsed = parseIsbn(bestIsbn);

    const authorsRaw = Array.isArray(item.author) ? (item.author as Array<{ given?: string; family?: string; name?: string }>) : [];
    const editorsRaw = Array.isArray(item.editor) ? (item.editor as Array<{ given?: string; family?: string; name?: string }>) : [];
    const fmtPerson = (p: { given?: string; family?: string; name?: string }) =>
      p.name?.trim() || [p.given, p.family].filter(Boolean).join(' ').trim();

    const authors = authorsRaw.map(fmtPerson).filter(Boolean);
    const editors = editorsRaw.map(fmtPerson).filter(Boolean);
    const issued = (item.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]?.[0];
    const origTitles = Array.isArray(item['original-title']) ? item['original-title'].map(String) : [];

    out.push({
      externalId: String(item.DOI ?? title),
      provider: 'crossref',
      tier: 'tier1_international',
      verified: false,
      matchConfidence: targetIsbn ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
      matchedIsbns: isbns,
      matchedIdentifiers: isbns,
      title,
      originalTitle: origTitles[0]?.trim() || undefined,
      authors,
      translators: [],
      editors,
      publishers: typeof item.publisher === 'string' ? [item.publisher] : [],
      publishedYear: typeof issued === 'number' ? issued : null,
      language: normalizeLanguageCode(typeof item.language === 'string' ? item.language : undefined, {
        isbn13: parsed.isbn13,
      }),
      genres: Array.isArray(item.subject) ? item.subject.slice(0, 6).map(String) : [],
      description: typeof item.abstract === 'string' ? stripHtmlToText(item.abstract) : undefined,
      isbn13: parsed.isbn13,
      isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
      ean13: parsed.isbn13,
      identifierType: parsed.isbn13 ? 'isbn13' : undefined,
      sourceUrl: typeof item.URL === 'string' ? item.URL : undefined,
      rawPayload: item,
    });
  }
  return out;
}

export const worldcatProvider: MetadataProviderAdapter = {
  name: 'worldcat',
  label: 'OCLC WorldCat',
  tier: 'tier1_international',
  region: 'global',
  requiresApiKey: true,
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    if (!ctx.worldcatToken) {
      throw new ProviderStatusError(
        'api_key_required',
        'WorldCat Search API v2 requires institutional OCLC WSKey credentials (WORLDCAT_CLIENT_ID / WORLDCAT_CLIENT_SECRET)'
      );
    }
    const res = await fetchWithTimeout(
      ctx,
      `https://americas.discovery.api.oclc.org/worldcat/search/v2/bibs?q=bn:${encodeURIComponent(parsedTarget.isbn13)}&limit=5`,
      { headers: { Authorization: `Bearer ${ctx.worldcatToken}`, Accept: 'application/json' } }
    );
    assertCleanHttpResponse(res, 'OCLC WorldCat');
    if (!res.ok) return [];
    const data = await safeReadJson<{ bibRecords?: Array<Record<string, unknown>> }>(res, 'OCLC WorldCat');
    return parseWorldCatRecords(data.bibRecords ?? [], parsedTarget.isbn13);
  },

  async search(query, ctx) {
    if (!ctx.worldcatToken) {
      throw new ProviderStatusError(
        'api_key_required',
        'WorldCat Search API v2 requires institutional OCLC WSKey credentials'
      );
    }
    const res = await fetchWithTimeout(
      ctx,
      `https://americas.discovery.api.oclc.org/worldcat/search/v2/bibs?q=${encodeURIComponent(query)}&limit=6`,
      { headers: { Authorization: `Bearer ${ctx.worldcatToken}`, Accept: 'application/json' } }
    );
    assertCleanHttpResponse(res, 'OCLC WorldCat');
    if (!res.ok) return [];
    const data = await safeReadJson<{ bibRecords?: Array<Record<string, unknown>> }>(res, 'OCLC WorldCat');
    return parseWorldCatRecords(data.bibRecords ?? [], null);
  },
};

function parseWorldCatRecords(
  records: Array<Record<string, unknown>>,
  targetIsbn: string | null
): MetadataCandidate[] {
  const out: MetadataCandidate[] = [];
  for (const rec of records) {
    const id = rec.identifier as { isbns?: string[]; oclcNumber?: string } | undefined;
    const isbns = collectValidIsbns(id?.isbns ?? []);
    const exact = Boolean(targetIsbn && isbns.includes(targetIsbn));
    const titleObj = rec.title as { mainTitles?: Array<{ text?: string }> } | undefined;
    const title = titleObj?.mainTitles?.[0]?.text?.trim();
    if (!title) continue;
    const creator = rec.contributor as {
      creators?: Array<{ firstName?: { text?: string }; secondName?: { text?: string } }>;
    } | undefined;
    const authors = (creator?.creators ?? [])
      .map((c) => [c.firstName?.text, c.secondName?.text].filter(Boolean).join(' ').trim())
      .filter(Boolean);
    const dateObj = rec.date as { publicationDate?: string } | undefined;
    const pubObj = rec.publisher as { publisherName?: { text?: string } } | undefined;
    const langObj = rec.language as { itemLanguage?: string } | undefined;
    const bestIsbn = exact ? targetIsbn! : isbns[0] || '';
    const parsed = parseIsbn(bestIsbn);

    out.push({
      externalId: String(id?.oclcNumber ?? title),
      provider: 'worldcat',
      tier: 'tier1_international',
      verified: false,
      matchConfidence: targetIsbn ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
      matchedIsbns: isbns,
      matchedIdentifiers: isbns,
      title,
      authors,
      translators: [],
      publishers: pubObj?.publisherName?.text ? [pubObj.publisherName.text] : [],
      publishedYear: dateObj?.publicationDate
        ? Number(dateObj.publicationDate.match(/\d{4}/)?.[0]) || null
        : null,
      language: normalizeLanguageCode(langObj?.itemLanguage, { isbn13: parsed.isbn13 }),
      genres: [],
      isbn13: parsed.isbn13,
      isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
      ean13: parsed.isbn13,
      identifierType: parsed.isbn13 ? 'isbn13' : undefined,
      sourceUrl: id?.oclcNumber ? `https://www.worldcat.org/oclc/${id.oclcNumber}` : undefined,
      rawPayload: rec,
    });
  }
  return out;
}

export const isbndbProvider: MetadataProviderAdapter = {
  name: 'isbndb',
  label: 'ISBNdb API',
  tier: 'tier1_international',
  region: 'global',
  requiresApiKey: true,
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    if (!ctx.isbndbApiKey) {
      throw new ProviderStatusError(
        'api_key_required',
        'ISBNdb requires an API key (configure ISBNDB_API_KEY in Edge Function secrets)'
      );
    }
    const res = await fetchWithTimeout(ctx, `https://api2.isbndb.com/book/${encodeURIComponent(parsedTarget.isbn13)}`, {
      headers: { Authorization: ctx.isbndbApiKey },
    });
    if (res.status === 404) return [];
    assertCleanHttpResponse(res, 'ISBNdb API');
    if (!res.ok) return [];
    const data = await safeReadJson<{ book?: Record<string, unknown> }>(res, 'ISBNdb API');
    return data.book ? [parseIsbndbBook(data.book, parsedTarget.isbn13)] : [];
  },

  async search(query, ctx) {
    if (!ctx.isbndbApiKey) {
      throw new ProviderStatusError('api_key_required', 'ISBNdb requires ISBNDB_API_KEY');
    }
    const res = await fetchWithTimeout(
      ctx,
      `https://api2.isbndb.com/books/${encodeURIComponent(query)}?pageSize=6`,
      { headers: { Authorization: ctx.isbndbApiKey } }
    );
    if (res.status === 404) return [];
    assertCleanHttpResponse(res, 'ISBNdb API');
    if (!res.ok) return [];
    const data = await safeReadJson<{ books?: Array<Record<string, unknown>> }>(res, 'ISBNdb API');
    return (data.books ?? []).map((b) => parseIsbndbBook(b, null));
  },
};

function parseIsbndbBook(b: Record<string, unknown>, targetIsbn: string | null): MetadataCandidate {
  const isbns = collectValidIsbns([
    typeof b.isbn13 === 'string' ? b.isbn13 : undefined,
    typeof b.isbn === 'string' ? b.isbn : undefined,
  ]);
  const exact = Boolean(targetIsbn && isbns.includes(targetIsbn));
  const bestIsbn = exact ? targetIsbn! : isbns[0] || '';
  const parsed = parseIsbn(bestIsbn);
  const pubDate = typeof b.date_published === 'string' ? b.date_published : undefined;
  return {
    externalId: String(b.isbn13 || b.isbn || b.title),
    provider: 'isbndb',
    tier: 'tier1_international',
    verified: false,
    matchConfidence: targetIsbn ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
    matchedIsbns: isbns,
    matchedIdentifiers: isbns,
    title: String(b.title_long || b.title || 'Untitled'),
    editionName: typeof b.edition === 'string' ? b.edition : undefined,
    authors: Array.isArray(b.authors) ? b.authors.map(String) : [],
    translators: [],
    publishers: typeof b.publisher === 'string' ? [b.publisher] : [],
    publishedDate: pubDate,
    publishedYear: pubDate ? Number(pubDate.match(/\d{4}/)?.[0]) || null : null,
    language: normalizeLanguageCode(typeof b.language === 'string' ? b.language : undefined, {
      isbn13: parsed.isbn13,
    }),
    format: typeof b.binding === 'string' ? detectFormatFromText(b.binding) : undefined,
    pageCount: typeof b.pages === 'number' ? b.pages : null,
    genres: Array.isArray(b.subjects) ? b.subjects.slice(0, 6).map(String) : [],
    description: typeof b.synopsis === 'string' ? stripHtmlToText(b.synopsis) : undefined,
    isbn13: parsed.isbn13,
    isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
    ean13: parsed.isbn13,
    identifierType: parsed.isbn13 ? 'isbn13' : undefined,
    coverUrl: normalizeUrl(typeof b.image === 'string' ? b.image : undefined),
    rawPayload: b,
  };
}

// ============================================================================
// National Diet Library (JP) + openBD (JP)
// ============================================================================
function extractXmlTags(block: string, tagName: string): string[] {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  const out: string[] = [];
  for (const m of block.matchAll(re)) {
    const inner = m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
    const cleaned = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (cleaned) out.push(cleaned);
  }
  return out;
}

export function parseNdlOpenSearchXml(xml: string, targetIsbn: string | null): MetadataCandidate[] {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const out: MetadataCandidate[] = [];
  for (const itemXml of items) {
    const titles = extractXmlTags(itemXml, 'dc:title');
    const title = titles[0] || extractXmlTags(itemXml, 'title')[0];
    if (!title) continue;

    const rawIsbns = extractXmlTags(itemXml, 'dc:identifier');
    const isbns = collectValidIsbns(rawIsbns);
    const exact = Boolean(targetIsbn && isbns.includes(targetIsbn));

    const volume = extractXmlTags(itemXml, 'dcndl:volume')[0];
    const seriesName = extractXmlTags(itemXml, 'dcndl:seriesTitle')[0];
    const publishers = extractXmlTags(itemXml, 'dc:publisher');
    const issued = extractXmlTags(itemXml, 'dcterms:issued')[0] || extractXmlTags(itemXml, 'dc:date')[0];
    const extent = extractXmlTags(itemXml, 'dc:extent')[0];
    const genres = extractXmlTags(itemXml, 'dcndl:genre');
    const link = extractXmlTags(itemXml, 'link')[0] || extractXmlTags(itemXml, 'guid')[0];

    const creatorsRaw = extractXmlTags(itemXml, 'dc:creator').map((name) =>
      name.replace(/,\s*/g, ' ').trim()
    );
    const descCdataRaw = itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '';
    const descCdata = descCdataRaw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const authorTag = extractXmlTags(itemXml, 'author')[0] ?? '';

    const authors: string[] = [];
    const illustrators: string[] = [];
    const translators: string[] = [];
    const respHint = `${authorTag}; ${descCdata}`;

    // Parse Japanese responsibility roles: e.g. 平尾友秀 原作,依田瑞稀 漫画 / Name 訳
    for (const seg of respHint.split(/[,、;]/)) {
      const s = seg.trim();
      if (!s) continue;
      const transM = s.match(/^(.+?)\s*(?:共?訳|翻訳|監訳)$/);
      if (transM?.[1]) {
        const cleanName = transM[1].replace(/^責任表示[：:]\s*/, '').trim();
        if (cleanName && !/^(?:原作|著|編|監修|イラスト|漫画)[・･]?$/.test(cleanName) && !translators.includes(cleanName)) {
          translators.push(cleanName);
        }
        continue;
      }
      const illM = s.match(/^(.+?)\s*(?:漫画|画|イラスト|作画)$/);
      if (illM?.[1]) {
        const cleanName = illM[1].replace(/^責任表示[：:]\s*/, '').trim();
        if (cleanName && !/^(?:原作|著|編|監修|イラスト|漫画)[・･]?$/.test(cleanName) && !illustrators.includes(cleanName)) {
          illustrators.push(cleanName);
        }
      }
    }

    for (const cr of creatorsRaw) {
      if (
        !translators.some((t) => t.replace(/\s+/g, '') === cr.replace(/\s+/g, '')) &&
        !illustrators.some((il) => il.replace(/\s+/g, '') === cr.replace(/\s+/g, ''))
      ) {
        authors.push(cr);
      }
    }
    if (authors.length === 0 && illustrators.length === 0 && creatorsRaw.length > 0) {
      authors.push(...creatorsRaw);
    }

    const bestIsbn = exact ? targetIsbn! : isbns[0] || '';
    const parsed = parseIsbn(bestIsbn);
    const pagesMatch = extent?.match(/(\d{1,5})\s*p/i);
    const fullTitle = volume && !title.includes(volume) ? `${title} ${volume}` : title;
    const contributors: ContributorCredit[] = [
      ...authors.map((name) => ({ name, role: 'author' as const })),
      ...illustrators.map((name) => ({ name, role: 'illustrator' as const })),
      ...translators.map((name) => ({ name, role: 'translator' as const })),
    ];

    out.push({
      externalId: link || `ndl-${bestIsbn || fullTitle}`,
      provider: 'ndl_japan',
      tier: 'tier2_national',
      verified: false,
      matchConfidence: targetIsbn ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
      matchedIsbns: isbns,
      matchedIdentifiers: isbns,
      title: fullTitle,
      authors: authors.length > 0 ? authors : creatorsRaw,
      translators,
      illustrators,
      contributors,
      publishers,
      publishedDate: issued,
      publishedYear: issued ? Number(issued.match(/(19|20)\d{2}/)?.[0]) || null : null,
      language: 'ja',
      pageCount: pagesMatch ? Number(pagesMatch[1]) : null,
      genres,
      isbn13: parsed.isbn13,
      isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
      ean13: parsed.isbn13,
      identifierType: parsed.isbn13 ? 'isbn13' : undefined,
      seriesName,
      volumeNumber: volume,
      sourceUrl: normalizeUrl(link),
      rawPayload: { title: fullTitle, isbns, link, volume, seriesName },
    });
  }
  return out;
}

export const ndlJapanProvider: MetadataProviderAdapter = {
  name: 'ndl_japan',
  label: 'National Diet Library (JP)',
  tier: 'tier2_national',
  region: 'jp',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    const res = await fetchWithTimeout(
      ctx,
      `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${encodeURIComponent(parsedTarget.isbn13)}&cnt=5`
    );
    assertCleanHttpResponse(res, 'National Diet Library (JP)');
    if (!res.ok) return [];
    const xml = await safeReadXml(res, 'National Diet Library (JP)');
    return parseNdlOpenSearchXml(xml, parsedTarget.isbn13);
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://ndlsearch.ndl.go.jp/api/opensearch?any=${encodeURIComponent(query)}&cnt=8`
    );
    assertCleanHttpResponse(res, 'National Diet Library (JP)');
    if (!res.ok) return [];
    const xml = await safeReadXml(res, 'National Diet Library (JP)');
    return parseNdlOpenSearchXml(xml, null);
  },
};

export const openBdProvider: MetadataProviderAdapter = {
  name: 'openbd',
  label: 'openBD (JP)',
  tier: 'tier2_national',
  region: 'jp',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsed = parseIsbn(isbn13);
    if (!parsed.isbn13 || !parsed.isbn13.startsWith('9784')) return [];
    const res = await fetchWithTimeout(ctx, `https://api.openbd.jp/v1/get?isbn=${parsed.isbn13}`);
    assertCleanHttpResponse(res, 'openBD');
    if (!res.ok) return [];
    const arr = await safeReadJson<Array<{
      summary?: Record<string, string>;
      onix?: {
        DescriptiveDetail?: {
          Contributor?: Array<{ ContributorRole?: string[]; PersonName?: { content?: string } }>;
        };
      };
    } | null>>(res, 'openBD');
    const entry = arr?.[0];
    const summary = entry?.summary;
    if (!summary) return [];

    const summaryIsbn = summary.isbn ? normalizeIsbnTo13(summary.isbn) : null;
    const exact = Boolean(summaryIsbn && summaryIsbn === parsed.isbn13);
    const resolvedParsed = parseIsbn(summaryIsbn ?? '');

    const contributorsRaw = entry?.onix?.DescriptiveDetail?.Contributor ?? [];
    const authors: string[] = [];
    const illustrators: string[] = [];
    const translators: string[] = [];
    for (const c of contributorsRaw) {
      const name = c.PersonName?.content?.trim();
      if (!name) continue;
      const roles = c.ContributorRole ?? [];
      if (roles.includes('B06')) translators.push(name);
      else if (roles.includes('A12')) illustrators.push(name);
      else authors.push(name);
    }
    if (authors.length === 0 && summary.author) {
      authors.push(summary.author);
    }

    return [
      {
        externalId: `openbd-${summaryIsbn || parsed.isbn13}`,
        provider: 'openbd',
        tier: 'tier2_national',
        verified: false,
        matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
        matchedIsbns: summaryIsbn ? [summaryIsbn] : [],
        matchedIdentifiers: summaryIsbn ? [summaryIsbn] : [],
        title: summary.title || 'Untitled',
        authors,
        translators,
        illustrators,
        publishers: summary.publisher ? [summary.publisher] : [],
        publishedDate: summary.pubdate || undefined,
        publishedYear: summary.pubdate ? Number(summary.pubdate.slice(0, 4)) || null : null,
        language: 'ja',
        genres: [],
        isbn13: resolvedParsed.isbn13,
        isbn10: resolvedParsed.prefixGroup === '978' ? resolvedParsed.isbn10 : null,
        ean13: resolvedParsed.isbn13,
        identifierType: resolvedParsed.isbn13 ? 'isbn13' : undefined,
        coverUrl: normalizeUrl(summary.cover),
        seriesName: summary.series || undefined,
        volumeNumber: summary.volume || undefined,
        rawPayload: entry as unknown as Record<string, unknown>,
      },
    ];
  },

  async search() {
    return [];
  },
};

export function parseBnfSruDublinCoreXml(xml: string, targetIsbn: string | null): MetadataCandidate[] {
  const records = [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/gi)].map((m) => m[1]);
  const out: MetadataCandidate[] = [];
  for (const recXml of records) {
    const rawTitle = extractXmlTags(recXml, 'dc:title')[0];
    if (!rawTitle) continue;
    const title = rawTitle.split(/\s+\/\s+/)[0].trim();
    const ids = extractXmlTags(recXml, 'dc:identifier');
    const isbns = collectValidIsbns(ids);
    const exact = Boolean(targetIsbn && isbns.includes(targetIsbn));

    const creators = extractXmlTags(recXml, 'dc:creator').map((c) =>
      c.replace(/\s*\(\d{4}-?\d{0,4}\).*$/, '').trim()
    );
    const publishers = extractXmlTags(recXml, 'dc:publisher').map((p) =>
      p.replace(/\s*\([^)]+\)\s*$/, '').trim()
    );
    const dateStr = extractXmlTags(recXml, 'dc:date')[0];
    const fmtStr = extractXmlTags(recXml, 'dc:format')[0];
    const langStr = extractXmlTags(recXml, 'dc:language')[0];
    const arkUrl = ids.find((i) => i.includes('catalogue.bnf.fr'));
    const bestIsbn = exact ? targetIsbn! : isbns[0] || '';
    const parsed = parseIsbn(bestIsbn);
    const pagesMatch = fmtStr?.match(/(\d{1,5})\s*p/i);

    out.push({
      externalId: arkUrl || `bnf-${bestIsbn || title}`,
      provider: 'bnf_france',
      tier: 'tier2_national',
      verified: false,
      matchConfidence: targetIsbn ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
      matchedIsbns: isbns,
      matchedIdentifiers: isbns,
      title,
      authors: creators,
      translators: [],
      publishers,
      publishedDate: dateStr,
      publishedYear: dateStr ? Number(dateStr.match(/(19|20)\d{2}/)?.[0]) || null : null,
      language: normalizeLanguageCode(langStr, { isbn13: parsed.isbn13 }),
      pageCount: pagesMatch ? Number(pagesMatch[1]) : null,
      genres: [],
      isbn13: parsed.isbn13,
      isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
      ean13: parsed.isbn13,
      identifierType: parsed.isbn13 ? 'isbn13' : undefined,
      sourceUrl: normalizeUrl(arkUrl),
      rawPayload: { title, ids, dateStr, fmtStr, langStr },
    });
  }
  return out;
}

export const bnfFranceProvider: MetadataProviderAdapter = {
  name: 'bnf_france',
  label: 'BnF France (SRU)',
  tier: 'tier2_national',
  region: 'fr',
  supportsDirectBrowserCors: true,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    const q = `bib.isbn adj "${parsedTarget.isbn13}"`;
    const res = await fetchWithTimeout(
      ctx,
      `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(q)}&recordSchema=dublincore&maximumRecords=4`
    );
    assertCleanHttpResponse(res, 'BnF France');
    if (!res.ok) return [];
    const xml = await safeReadXml(res, 'BnF France');
    return parseBnfSruDublinCoreXml(xml, parsedTarget.isbn13);
  },

  async search(query, ctx) {
    const q = `bib.anywhere all "${query.replace(/"/g, ' ')}"`;
    const res = await fetchWithTimeout(
      ctx,
      `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(q)}&recordSchema=dublincore&maximumRecords=6`
    );
    assertCleanHttpResponse(res, 'BnF France');
    if (!res.ok) return [];
    const xml = await safeReadXml(res, 'BnF France');
    return parseBnfSruDublinCoreXml(xml, null);
  },
};

export const nlKoreaProvider: MetadataProviderAdapter = {
  name: 'nl_korea',
  label: 'National Library of Korea',
  tier: 'tier2_national',
  region: 'kr',
  requiresApiKey: true,
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    if (!ctx.nlkApiKey) {
      throw new ProviderStatusError(
        'api_key_required',
        'National Library of Korea Seoji API requires NLK_API_KEY (cert_key)'
      );
    }
    const res = await fetchWithTimeout(
      ctx,
      `https://www.nl.go.kr/seoji/SearchApi.do?cert_key=${encodeURIComponent(ctx.nlkApiKey)}&result_style=json&page_no=1&page_size=5&isbn=${encodeURIComponent(parsedTarget.isbn13)}`
    );
    assertCleanHttpResponse(res, 'National Library of Korea');
    if (!res.ok) return [];
    const data = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(res, 'National Library of Korea');
    return (data.docs ?? []).map((d) => {
      const isbns = collectValidIsbns([String(d.EA_ISBN || ''), String(d.SET_ISBN || '')]);
      const exact = isbns.includes(parsedTarget.isbn13!);
      const resolvedParsed = parseIsbn(exact ? parsedTarget.isbn13! : isbns[0] || '');
      return {
        externalId: String(d.EA_ISBN || d.TITLE || parsedTarget.isbn13),
        provider: 'nl_korea',
        tier: 'tier2_national',
        verified: false,
        matchConfidence: exact ? 'exact_isbn' : 'unverified_isbn',
        matchedIsbns: isbns,
        matchedIdentifiers: isbns,
        title: String(d.TITLE || 'Untitled'),
        authors: d.AUTHOR ? [String(d.AUTHOR)] : [],
        translators: [],
        publishers: d.PUBLISHER ? [String(d.PUBLISHER)] : [],
        publishedYear: d.PUBLISH_PREDATE ? Number(String(d.PUBLISH_PREDATE).slice(0, 4)) || null : null,
        language: 'ko',
        pageCount: d.PAGE ? Number(String(d.PAGE).match(/\d+/)?.[0]) || null : null,
        genres: d.SUBJECT ? [String(d.SUBJECT)] : [],
        isbn13: resolvedParsed.isbn13,
        isbn10: resolvedParsed.prefixGroup === '978' ? resolvedParsed.isbn10 : null,
        ean13: resolvedParsed.isbn13,
        identifierType: resolvedParsed.isbn13 ? 'isbn13' : undefined,
        rawPayload: d,
      };
    });
  },

  async search(query, ctx) {
    if (!ctx.nlkApiKey) {
      throw new ProviderStatusError('api_key_required', 'National Library of Korea requires NLK_API_KEY');
    }
    const res = await fetchWithTimeout(
      ctx,
      `https://www.nl.go.kr/seoji/SearchApi.do?cert_key=${encodeURIComponent(ctx.nlkApiKey)}&result_style=json&page_no=1&page_size=6&title=${encodeURIComponent(query)}`
    );
    assertCleanHttpResponse(res, 'National Library of Korea');
    if (!res.ok) return [];
    const data = await safeReadJson<{ docs?: Array<Record<string, unknown>> }>(res, 'National Library of Korea');
    return (data.docs ?? []).map((d) => {
      const isbns = collectValidIsbns([String(d.EA_ISBN || '')]);
      const parsed = parseIsbn(isbns[0] || '');
      return {
        externalId: String(d.EA_ISBN || d.TITLE || 'nlk'),
        provider: 'nl_korea',
        tier: 'tier2_national',
        verified: false,
        matchConfidence: 'title_match',
        matchedIsbns: isbns,
        matchedIdentifiers: isbns,
        title: String(d.TITLE || 'Untitled'),
        authors: d.AUTHOR ? [String(d.AUTHOR)] : [],
        translators: [],
        publishers: d.PUBLISHER ? [String(d.PUBLISHER)] : [],
        publishedYear: d.PUBLISH_PREDATE ? Number(String(d.PUBLISH_PREDATE).slice(0, 4)) || null : null,
        language: 'ko',
        pageCount: d.PAGE ? Number(String(d.PAGE).match(/\d+/)?.[0]) || null : null,
        genres: d.SUBJECT ? [String(d.SUBJECT)] : [],
        isbn13: parsed.isbn13,
        isbn10: parsed.isbn10,
        ean13: parsed.isbn13,
        identifierType: parsed.isbn13 ? 'isbn13' : undefined,
        rawPayload: d,
      };
    });
  },
};

export const locUsProvider: MetadataProviderAdapter = {
  name: 'loc_us',
  label: 'Library of Congress (US)',
  tier: 'tier2_national',
  region: 'us',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const parsedTarget = parseIsbn(isbn13);
    if (!parsedTarget.isValid || !parsedTarget.isbn13) return [];
    const res = await fetchWithTimeout(
      ctx,
      `https://www.loc.gov/books/?q=${encodeURIComponent(parsedTarget.isbn13)}&fo=json`
    );
    assertCleanHttpResponse(res, 'Library of Congress');
    if (!res.ok) return [];
    const json = await safeReadJson<{ results?: Array<Record<string, unknown>> }>(res, 'Library of Congress');
    return parseLocResults(json.results ?? [], parsedTarget.isbn13);
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://www.loc.gov/books/?q=${encodeURIComponent(query)}&fo=json&c=6`
    );
    assertCleanHttpResponse(res, 'Library of Congress');
    if (!res.ok) return [];
    const json = await safeReadJson<{ results?: Array<Record<string, unknown>> }>(res, 'Library of Congress');
    return parseLocResults(json.results ?? [], null);
  },
};

function parseLocResults(
  items: Array<Record<string, unknown>>,
  targetIsbn: string | null
): MetadataCandidate[] {
  const out: MetadataCandidate[] = [];
  for (const r of items) {
    const isbns = collectValidIsbns(Array.isArray(r.isbn) ? r.isbn.map(String) : [], JSON.stringify(r.item ?? {}));
    const exact = Boolean(targetIsbn && isbns.includes(targetIsbn));
    const title = typeof r.title === 'string' ? r.title.replace(/\s*\/\s*$/, '').trim() : '';
    if (!title) continue;
    const bestIsbn = exact ? targetIsbn! : isbns[0] || '';
    const parsed = parseIsbn(bestIsbn);
    out.push({
      externalId: String(r.id || title),
      provider: 'loc_us',
      tier: 'tier2_national',
      verified: false,
      matchConfidence: targetIsbn ? (exact ? 'exact_isbn' : 'unverified_isbn') : 'title_match',
      matchedIsbns: isbns,
      matchedIdentifiers: isbns,
      title,
      authors: Array.isArray(r.contributor) ? r.contributor.map(String) : [],
      translators: [],
      publishers: Array.isArray(r.location) ? r.location.map(String) : [],
      publishedYear: typeof r.date === 'string' ? Number(r.date.match(/(19|20)\d{2}/)?.[0]) || null : null,
      language: normalizeLanguageCode(Array.isArray(r.language) ? String(r.language[0]) : undefined, {
        isbn13: parsed.isbn13,
      }),
      genres: Array.isArray(r.subject) ? r.subject.slice(0, 6).map(String) : [],
      isbn13: parsed.isbn13,
      isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
      ean13: parsed.isbn13,
      identifierType: parsed.isbn13 ? 'isbn13' : undefined,
      sourceUrl: typeof r.url === 'string' ? normalizeUrl(r.url) : undefined,
      rawPayload: r,
    });
  }
  return out;
}

// ============================================================================
// 7. Honest Status Reporting for Unqueryable / Protected Catalogues
// ============================================================================
export const nlvOpacProvider: MetadataProviderAdapter = {
  name: 'nlv_opac',
  label: 'Thư viện Quốc gia VN',
  tier: 'tier2_national',
  region: 'vi',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(isbn13)}`
    );
    assertCleanHttpResponse(res, 'NLV OPAC');
    const html = await res.text().catch(() => '');
    if (html.includes('khong-tim-thay-tai-nguyen-yeu-cau') || !html.includes('MARC')) {
      throw new ProviderStatusError(
        'unsupported_interface',
        'NLV OPAC relies on a dynamic client-side widget without a public ISBN query API'
      );
    }
    throw new ProviderStatusError(
      'not_implemented',
      'NLV OPAC parser has not been integrated for this page layout'
    );
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://opac.nlv.gov.vn/Search/Search?SearchKey=${encodeURIComponent(query)}`
    );
    assertCleanHttpResponse(res, 'NLV OPAC');
    throw new ProviderStatusError(
      'unsupported_interface',
      'NLV OPAC relies on a dynamic client-side widget without a public keyword query API'
    );
  },
};

export const britishLibraryProvider: MetadataProviderAdapter = {
  name: 'british_library',
  label: 'British Library (UK)',
  tier: 'tier2_national',
  region: 'uk',
  supportsDirectBrowserCors: false,

  async lookupByIsbn() {
    throw new ProviderStatusError(
      'unsupported_interface',
      'British Library public unauthenticated ISBN REST/SRU endpoint is unavailable'
    );
  },
  async search() {
    throw new ProviderStatusError(
      'unsupported_interface',
      'British Library public unauthenticated search API is unavailable'
    );
  },
};

export const taiwanNclProvider: MetadataProviderAdapter = {
  name: 'taiwan_ncl',
  label: 'National Central Library (TW)',
  tier: 'tier2_national',
  region: 'tw',
  supportsDirectBrowserCors: false,

  async lookupByIsbn() {
    throw new ProviderStatusError(
      'unsupported_interface',
      'Taiwan NCL ISBNNet uses a session-bound web form without an open JSON/SRU API'
    );
  },
  async search() {
    throw new ProviderStatusError(
      'unsupported_interface',
      'Taiwan NCL ISBNNet has no open unauthenticated API'
    );
  },
};

export const nlcChinaProvider: MetadataProviderAdapter = {
  name: 'nlc_china',
  label: 'National Library of China',
  tier: 'tier2_national',
  region: 'cn',
  supportsDirectBrowserCors: false,

  async lookupByIsbn() {
    throw new ProviderStatusError(
      'unsupported_interface',
      'National Library of China OPAC provides no public unauthenticated ISBN REST/SRU API'
    );
  },
  async search() {
    throw new ProviderStatusError(
      'unsupported_interface',
      'National Library of China OPAC provides no public unauthenticated search API'
    );
  },
};

export const fahasaProvider: MetadataProviderAdapter = {
  name: 'fahasa',
  label: 'Fahasa',
  tier: 'tier3_publisher',
  region: 'vi',
  supportsDirectBrowserCors: false,

  async lookupByIsbn(isbn13, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(isbn13)}`
    );
    if (res.status === 403 || res.status === 503) {
      throw new ProviderStatusError(
        'access_denied',
        'Protected by Cloudflare anti-bot challenge (HTTP 403)'
      );
    }
    assertCleanHttpResponse(res, 'Fahasa');
    throw new ProviderStatusError('unsupported_interface', 'Fahasa endpoint requires interactive session');
  },

  async search(query, ctx) {
    const res = await fetchWithTimeout(
      ctx,
      `https://www.fahasa.com/fahasa_catalog/product/search?q=${encodeURIComponent(query)}`
    );
    if (res.status === 403 || res.status === 503) {
      throw new ProviderStatusError(
        'access_denied',
        'Protected by Cloudflare anti-bot challenge (HTTP 403)'
      );
    }
    assertCleanHttpResponse(res, 'Fahasa');
    throw new ProviderStatusError('unsupported_interface', 'Fahasa endpoint requires interactive session');
  },
};

export const ALL_METADATA_PROVIDERS: MetadataProviderAdapter[] = [
  // Tier 1: Global Bibliographic Databases
  openLibraryProvider,
  googleBooksProvider,
  crossrefProvider,
  worldcatProvider,
  isbndbProvider,
  // Tier 2: National & Regional Catalogues
  ndlJapanProvider,
  openBdProvider,
  bnfFranceProvider,
  hcmLibraryProvider,
  nlKoreaProvider,
  locUsProvider,
  nlvOpacProvider,
  britishLibraryProvider,
  taiwanNclProvider,
  nlcChinaProvider,
  // Tier 3: Official Publishers & Regional Stores
  adcbookProvider,
  goodaProvider,
  hikaruProvider,
  phuongNamProvider,
  firstNewsProvider,
  nxbKimDongProvider,
  nhaNamProvider,
  ipmProvider,
  amakProvider,
  tikiProvider,
  fahasaProvider,
];
