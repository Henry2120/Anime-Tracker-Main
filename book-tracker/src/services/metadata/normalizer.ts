import type {
  BookFormat,
  MetadataCandidate,
  MetadataMatchQuality,
  MetadataProviderName,
  ProviderSourceLink,
} from '../../types/domain';
import { parseIsbn } from '../../utils/isbn';

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|ndash|mdash);/gi, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m);
}

export function stripHtml(html?: string | null): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<(td|th)[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed.replace(/^http:\/\//i, 'https://');
}

export function normalizeLanguageCode(
  rawLang?: string | null,
  hints?: { title?: string; publisher?: string; isbn13?: string | null; tags?: string[] }
): string {
  const code = (rawLang ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    vi: 'vi',
    vie: 'vi',
    vn: 'vi',
    vietnamese: 'vi',
    'tiếng việt': 'vi',
    en: 'en',
    eng: 'en',
    english: 'en',
    ja: 'ja',
    jpn: 'ja',
    jp: 'ja',
    japanese: 'ja',
    fr: 'fr',
    fra: 'fr',
    fre: 'fr',
    french: 'fr',
    ko: 'ko',
    kor: 'ko',
    korean: 'ko',
    zh: 'zh',
    zho: 'zh',
    chi: 'zh',
    chinese: 'zh',
    de: 'de',
    deu: 'de',
    ger: 'de',
    german: 'de',
  };
  if (code && map[code]) return map[code];
  if (code && /^[a-z]{2}(-[a-z]{2})?$/i.test(code) && code !== 'un' && code !== 'xx') {
    return code.slice(0, 2).toLowerCase();
  }

  const combined = [
    hints?.title ?? '',
    hints?.publisher ?? '',
    ...(hints?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  if (
    combined.includes('tiếng việt') ||
    combined.includes('nhà xuất bản') ||
    combined.includes('nxb ') ||
    /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(combined) ||
    (hints?.isbn13 && (hints.isbn13.startsWith('978604') || hints.isbn13.startsWith('978632')))
  ) {
    return 'vi';
  }
  return 'en';
}

export function normalizeBookFormat(raw?: string | null): BookFormat | undefined {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (s.includes('bìa cứng') || s.includes('hardcover') || s.includes('hardback')) return 'hardcover';
  if (s.includes('bìa mềm') || s.includes('paperback') || s.includes('softcover')) return 'paperback';
  if (s.includes('box set') || s.includes('boxset') || s.includes('hộp')) return 'box_set';
  if (s.includes('bunko')) return 'bunko';
  if (s.includes('tankobon')) return 'tankobon';
  if (s.includes('ebook') || s.includes('e-book') || s.includes('kindle')) return 'ebook';
  if (s.includes('audio')) return 'audiobook';
  return undefined;
}

export function extractYear(raw?: string | number | null): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw >= 1400 && raw <= 2100 ? raw : null;
  }
  if (!raw) return null;
  const m = String(raw).match(/(?:^|[^\d])(19\d{2}|20\d{2})(?:[^\d]|$)/);
  return m ? Number(m[1]) : null;
}

export function dedupeStrings(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = (item ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}

function splitPeopleList(raw: string): string[] {
  const cleaned = raw
    .replace(/\(\s*(tác giả|author|minh họa|họa sĩ|illustrator|dịch giả|translator)\s*\)/gi, '')
    .trim();
  if (!cleaned) return [];
  if (/nhiều tác giả/i.test(cleaned)) return [];
  return dedupeStrings(
    cleaned
      .split(/[,;/\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && !/^và$/i.test(s))
  );
}

export function cleanVietnameseTitle(rawTitle: string): {
  title: string;
  editionName?: string;
  volumeNumber?: string;
} {
  let title = decodeHtmlEntities(rawTitle).replace(/\s+/g, ' ').trim();
  const editionNotes: string[] = [];

  // Extract trailing retail promo tags like "Tặng Kèm Postcard", "Tặng Kèm Bookmark"
  const promoPatterns = [
    /\s*[-–|]?\s*(Tặng\s+Kèm\s+[^()[\]]+)$/i,
    /\s*[-–|]?\s*(Kèm\s+(?:Postcard|Bookmark|Poster|Card|Standee|Quà)[^()[\]]*)$/i,
    /\s*\((Bản\s+(?:giới\s+hạn|đặc\s+biệt|thường)|Tái\s+bản[^)]*|TB\s*[\d.,]+)\)\s*$/i,
    /\s*\[(Bản\s+(?:giới\s+hạn|đặc\s+biệt|thường))\]\s*$/i,
  ];
  for (const re of promoPatterns) {
    const m = title.match(re);
    if (m && m[1]) {
      editionNotes.push(m[1].trim());
      title = title.slice(0, m.index).trim();
    }
  }

  // Strip prefix like "Sách - " or "(Tập lẻ) "
  title = title.replace(/^(Sách\s*[-–:]\s*|\(Tập\s*lẻ\)\s*)/i, '').trim();

  // Extract volume number if recognizable
  const volMatch = title.match(/(?:\bTập|\bVol\.?)\s*0*(\d+)\b/i);
  const volumeNumber = volMatch ? volMatch[1] : undefined;

  return {
    title: title || rawTitle.trim(),
    editionName: editionNotes.length > 0 ? editionNotes.join(' · ') : undefined,
    volumeNumber,
  };
}

export interface ExtractedMetadataSpecs {
  authors: string[];
  illustrators: string[];
  translators: string[];
  publishers: string[];
  pageCount: number | null;
  publishedYear: number | null;
  publishedDate?: string;
  format?: BookFormat;
  seriesName?: string;
  isbns: string[];
}

export function extractLabeledSpecsFromHtmlOrText(htmlOrText: string): ExtractedMetadataSpecs {
  const result: ExtractedMetadataSpecs = {
    authors: [],
    illustrators: [],
    translators: [],
    publishers: [],
    pageCount: null,
    publishedYear: null,
    isbns: [],
  };
  if (!htmlOrText) return result;

  // Parse <tr><th>label</th><td>value</td></tr> tables when HTML is passed
  const tableRows = htmlOrText.matchAll(/<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<\/tr>/gi);
  const lines: string[] = [];
  for (const row of tableRows) {
    const label = stripHtml(row[1]).replace(/:$/, '').trim();
    const val = stripHtml(row[2]).replace(/\s*,\s*$/, '').trim();
    if (label && val) lines.push(`${label}: ${val}`);
  }

  const plain = stripHtml(htmlOrText);
  for (const line of plain.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }

  for (const line of lines) {
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase().trim();
    const val = m[2].trim();
    if (!val) continue;

    if (
      (key.includes('minh họa') || key.includes('họa sĩ') || key.includes('tranh')) &&
      !key.includes('tác giả')
    ) {
      result.illustrators.push(...splitPeopleList(val));
    } else if (key.includes('dịch giả') || key.includes('người dịch') || key.includes('chuyển ngữ')) {
      if (key.includes('tác giả') && (key.includes('/') || key.includes('dịch giả'))) {
        // Ambiguous combined column like "Tác giả/ Dịch giả: A, B" -> keep under authors cleanly unless separated
        result.authors.push(...splitPeopleList(val));
      } else {
        result.translators.push(...splitPeopleList(val));
      }
    } else if (key.includes('tác giả') || key === 'author' || key === 'authors') {
      result.authors.push(...splitPeopleList(val));
    } else if (key.includes('nhà xuất bản') || key === 'nxb' || key === 'publisher') {
      result.publishers.push(...dedupeStrings(val.split(/[,;]+/)));
    } else if (key.includes('số trang') || key === 'pages' || key === 'page count') {
      const num = val.match(/\d+/);
      if (num) {
        const n = Number(num[0]);
        if (n > 0 && n < 20000) result.pageCount = n;
      }
    } else if (key.includes('định dạng') || key.includes('hình thức bìa') || key.includes('loại bìa')) {
      const fmt = normalizeBookFormat(val);
      if (fmt) result.format = fmt;
    } else if (key.includes('bộ sách') || key.includes('series')) {
      result.seriesName = val;
    } else if (key.includes('năm xuất bản') || key.includes('phát hành') || key.includes('ngày xuất bản')) {
      const yr = extractYear(val);
      if (yr) result.publishedYear = yr;
      const iso = val.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (iso) result.publishedDate = iso[1];
    } else if (key.includes('isbn') || key.includes('mã sản phẩm')) {
      const parsed = parseIsbn(val);
      if (parsed.isValid && parsed.isbn13) result.isbns.push(parsed.isbn13);
    }
  }

  result.authors = dedupeStrings(result.authors);
  result.illustrators = dedupeStrings(result.illustrators);
  result.translators = dedupeStrings(result.translators);
  result.publishers = dedupeStrings(result.publishers);
  result.isbns = dedupeStrings(result.isbns);
  return result;
}

export interface SapoProductRaw {
  id?: number | string;
  name?: string;
  title?: string;
  alias?: string;
  url?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  content?: string;
  summary?: string;
  featured_image?: string | { src?: string };
  images?: Array<string | { src?: string }>;
  published_on?: string;
  variants?: Array<{
    id?: number | string;
    title?: string;
    barcode?: string | null;
    sku?: string | null;
    featured_image?: { src?: string } | null;
  }>;
}

export function parseSapoProduct(params: {
  provider: MetadataProviderName;
  baseUrl: string;
  product: SapoProductRaw;
  html?: string;
  queryIsbn?: string;
}): MetadataCandidate {
  const { provider, baseUrl, product, html, queryIsbn } = params;
  const rawTags = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === 'string'
      ? product.tags.split(',').map((t) => t.trim())
      : [];

  const parsedQuery = queryIsbn ? parseIsbn(queryIsbn) : null;
  const variants = product.variants ?? [];

  // Select best matching variant if ISBN was searched
  let matchedVariant = variants[0];
  let matchedIsbn13: string | null = null;
  let matchedIsbn10: string | null = null;

  for (const v of variants) {
    const p = parseIsbn(v.barcode || v.sku || '');
    if (p.isValid && p.isbn13) {
      if (parsedQuery?.isbn13 && p.isbn13 === parsedQuery.isbn13) {
        matchedVariant = v;
        matchedIsbn13 = p.isbn13;
        matchedIsbn10 = p.prefixGroup === '978' ? p.isbn10 : null;
        break;
      }
      if (!matchedIsbn13) {
        matchedVariant = v;
        matchedIsbn13 = p.isbn13;
        matchedIsbn10 = p.prefixGroup === '978' ? p.isbn10 : null;
      }
    }
  }

  const authors: string[] = [];
  const illustrators: string[] = [];
  const translators: string[] = [];
  const publishers: string[] = [];
  const genres: string[] = [];
  let pageCount: number | null = null;
  let publishedYear: number | null = null;
  let publishedDate: string | undefined;
  let format: BookFormat | undefined;
  let seriesName: string | undefined;

  if (product.product_type && !/^khác$/i.test(product.product_type.trim())) {
    genres.push(product.product_type.trim());
  }

  for (const tag of rawTags) {
    const t = decodeHtmlEntities(tag).trim();
    if (!t) continue;

    if (t.startsWith('tacgia_')) {
      authors.push(...splitPeopleList(t.slice(7)));
    } else if (/^Tác giả\s+/i.test(t)) {
      authors.push(...splitPeopleList(t.replace(/^Tác giả\s+/i, '')));
    } else if (t.startsWith('minhhoa_') || t.startsWith('hoasi_')) {
      illustrators.push(...splitPeopleList(t.replace(/^(minhhoa_|hoasi_)/i, '')));
    } else if (/^(Minh họa|Họa sĩ)\s+/i.test(t)) {
      illustrators.push(...splitPeopleList(t.replace(/^(Minh họa|Họa sĩ)\s+/i, '')));
    } else if (t.startsWith('dichgia_')) {
      translators.push(...splitPeopleList(t.slice(8)));
    } else if (/^Dịch giả\s+/i.test(t)) {
      translators.push(...splitPeopleList(t.replace(/^Dịch giả\s+/i, '')));
    } else if (t.startsWith('nxb_')) {
      publishers.push(t.slice(4).trim());
    } else if (t.startsWith('sotrang_')) {
      const n = Number(t.slice(8).replace(/[^\d]/g, ''));
      if (n > 0) pageCount = n;
    } else if (/^Số trang\s+\d+/i.test(t)) {
      const n = Number(t.replace(/[^\d]/g, ''));
      if (n > 0) pageCount = n;
    } else if (t.startsWith('bia_') || t.startsWith('hinhthuc_')) {
      const fmt = normalizeBookFormat(t.replace(/^(bia_|hinhthuc_)/i, ''));
      if (fmt) format = fmt;
    } else if (t.startsWith('namxb_') || /^Sách phát hành\s+\d{4}/i.test(t)) {
      const yr = extractYear(t);
      if (yr) publishedYear = yr;
    } else if (t.startsWith('combo_')) {
      seriesName = t.slice(6).trim();
    } else if (/^(Văn Học|Light Novel|Manga|Comic|Tiểu Thuyết|Kỹ Năng|Lịch Sử|Khoa Học|Kinh Tế|Thiếu Nhi)$/i.test(t)) {
      genres.push(t);
    }
  }

  // Parse HTML keywords meta, published_on, spec table, and content
  if (html) {
    const kwMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
    if (kwMatch) {
      for (const part of kwMatch[1].split(',').map((s) => decodeHtmlEntities(s.trim()))) {
        if (/^Tác giả\s+/i.test(part)) authors.push(...splitPeopleList(part.replace(/^Tác giả\s+/i, '')));
        else if (/^(Minh họa|Họa sĩ)\s+/i.test(part)) illustrators.push(...splitPeopleList(part.replace(/^(Minh họa|Họa sĩ)\s+/i, '')));
        else if (/^Dịch giả\s+/i.test(part)) translators.push(...splitPeopleList(part.replace(/^Dịch giả\s+/i, '')));
        else if (/^Số trang\s+\d+/i.test(part) && !pageCount) {
          const n = Number(part.replace(/[^\d]/g, ''));
          if (n > 0) pageCount = n;
        } else if (/^Sách phát hành\s+\d{4}/i.test(part) && !publishedYear) {
          publishedYear = extractYear(part);
        }
      }
    }

    const pubOnMatch = html.match(/"published_on"\s*:\s*"(\d{4}-\d{2}-\d{2})[^"]*"/);
    if (pubOnMatch) {
      publishedDate = pubOnMatch[1];
      if (!publishedYear) publishedYear = extractYear(pubOnMatch[1]);
    }
  }

  if (product.published_on) {
    publishedDate = publishedDate || product.published_on.slice(0, 10);
    publishedYear = publishedYear || extractYear(product.published_on);
  }

  const contentSpecs = extractLabeledSpecsFromHtmlOrText(
    [product.content ?? '', html ?? ''].filter(Boolean).join('\n')
  );
  // Note: Only trust HTML/content authors if tags didn't already list them OR if combined
  const finalAuthors = authors.length > 0 ? dedupeStrings(authors) : contentSpecs.authors;
  const finalIllustrators = dedupeStrings([...illustrators, ...contentSpecs.illustrators]).filter(
    // Ensure explicitly identified illustrators are removed from authors if both appeared
    (ill) => Boolean(ill)
  );
  const illustratorKeys = new Set(finalIllustrators.map((x) => x.toLowerCase()));
  const cleanedAuthors = finalAuthors.filter((a) => !illustratorKeys.has(a.toLowerCase()));

  const finalTranslators = dedupeStrings([...translators, ...contentSpecs.translators]);
  const finalPublishers = dedupeStrings([
    ...publishers,
    ...contentSpecs.publishers,
    product.vendor && !/^khác$/i.test(product.vendor.trim()) ? product.vendor.trim() : undefined,
  ]);
  const finalPageCount = pageCount ?? contentSpecs.pageCount;
  const finalYear = publishedYear ?? contentSpecs.publishedYear;
  const finalDate = publishedDate ?? contentSpecs.publishedDate;
  const finalFormat = format ?? contentSpecs.format ?? 'paperback';
  const finalSeries = seriesName ?? contentSpecs.seriesName;

  if (!matchedIsbn13 && contentSpecs.isbns[0]) {
    const parsedFromHtml = parseIsbn(contentSpecs.isbns[0]);
    if (parsedFromHtml.isValid && parsedFromHtml.isbn13) {
      matchedIsbn13 = parsedFromHtml.isbn13;
      matchedIsbn10 = parsedFromHtml.prefixGroup === '978' ? parsedFromHtml.isbn10 : null;
    }
  }

  const rawTitle = product.name || product.title || 'Untitled';
  const cleanedTitle = cleanVietnameseTitle(rawTitle);
  const contentText = stripHtml(product.content || product.summary);

  const rawFeatured =
    matchedVariant?.featured_image?.src ||
    (typeof product.featured_image === 'string'
      ? product.featured_image
      : product.featured_image?.src) ||
    (typeof product.images?.[0] === 'string' ? product.images[0] : product.images?.[0]?.src);

  const productPath = product.url || (product.alias ? `/${product.alias}` : '');
  const sourceUrl = productPath
    ? productPath.startsWith('http')
      ? productPath
      : `${baseUrl.replace(/\/$/, '')}${productPath.startsWith('/') ? '' : '/'}${productPath}`
    : baseUrl;

  const language = normalizeLanguageCode(undefined, {
    title: cleanedTitle.title,
    publisher: finalPublishers[0],
    isbn13: matchedIsbn13,
    tags: rawTags,
  });

  const isExact = Boolean(
    parsedQuery?.isbn13 &&
      matchedIsbn13 &&
      parsedQuery.isbn13 === matchedIsbn13
  );

  return {
    externalId: String(product.id ?? product.alias ?? sourceUrl),
    provider,
    verified: false,
    title: cleanedTitle.title,
    editionName: cleanedTitle.editionName,
    authors: cleanedAuthors,
    illustrators: finalIllustrators,
    translators: finalTranslators,
    publishers: finalPublishers,
    publishedDate: finalDate,
    publishedYear: finalYear,
    language,
    format: finalFormat,
    pageCount: finalPageCount,
    genres: dedupeStrings(genres),
    description: contentText || undefined,
    isbn13: matchedIsbn13,
    isbn10: matchedIsbn10,
    coverUrl: normalizeUrl(rawFeatured),
    seriesName: finalSeries,
    volumeNumber: cleanedTitle.volumeNumber,
    sourceUrl,
    matchQuality: queryIsbn ? (isExact ? 'exact_isbn' : 'approximate') : 'title_search',
    matchedIsbn: isExact ? matchedIsbn13 : null,
    contributingProviders: [provider],
    sourceUrls: [{ provider, url: sourceUrl }],
    rawPayload: product as unknown as Record<string, unknown>,
  };
}

export interface HaravanProductRaw {
  id?: number | string;
  handle?: string;
  title?: string;
  vendor?: string;
  product_type?: string;
  published_at?: string;
  tags?: string | string[];
  body_html?: string;
  image?: { src?: string } | null;
  images?: Array<{ src?: string }>;
  variants?: Array<{
    barcode?: string | null;
    sku?: string | null;
    title?: string;
  }>;
}

export function parseHaravanProduct(params: {
  provider: MetadataProviderName;
  baseUrl: string;
  product: HaravanProductRaw;
  queryIsbn?: string;
}): MetadataCandidate {
  const { provider, baseUrl, product, queryIsbn } = params;
  const sapoEquivalent: SapoProductRaw = {
    id: product.id,
    name: product.title,
    alias: product.handle ? `products/${product.handle}` : undefined,
    url: product.handle ? `/products/${product.handle}` : undefined,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: typeof product.tags === 'string'
      ? product.tags.split(',').map((t) => t.trim())
      : product.tags,
    content: product.body_html,
    published_on: product.published_at,
    featured_image: product.image?.src || product.images?.[0]?.src,
    variants: product.variants?.map((v) => ({
      title: v.title,
      barcode: v.barcode,
      sku: v.sku,
    })),
  };

  // Haravan uses `nhaxb_...` instead of `nxb_...` in many Vietnamese stores (e.g., IPM)
  const cand = parseSapoProduct({
    provider,
    baseUrl,
    product: sapoEquivalent,
    queryIsbn,
  });

  const tags = Array.isArray(sapoEquivalent.tags) ? sapoEquivalent.tags : [];
  const extraPublishers: string[] = [];
  for (const t of tags) {
    if (t.startsWith('nhaxb_')) extraPublishers.push(t.slice(6).trim());
  }
  if (extraPublishers.length > 0) {
    cand.publishers = dedupeStrings([...cand.publishers, ...extraPublishers]);
  }
  return cand;
}

export function parseOpenBdRecord(item: Record<string, unknown>, queryIsbn: string): MetadataCandidate | null {
  const summary = item.summary as Record<string, string> | undefined;
  if (!summary) return null;

  const parsed = parseIsbn(summary.isbn || queryIsbn);
  const authors: string[] = [];
  const illustrators: string[] = [];
  const translators: string[] = [];

  // Parse ONIX contributors if available (A01=Author, A12/A07=Illustrator, B06=Translator)
  try {
    const onix = item.onix as {
      DescriptiveDetail?: {
        Contributor?: Array<{
          ContributorRole?: string[];
          PersonName?: { content?: string };
        }>;
      };
    } | undefined;
    for (const c of onix?.DescriptiveDetail?.Contributor ?? []) {
      const name = c.PersonName?.content?.trim();
      if (!name) continue;
      const roles = c.ContributorRole ?? [];
      if (roles.some((r) => r === 'A12' || r === 'A07')) {
        illustrators.push(name);
      } else if (roles.includes('B06')) {
        translators.push(name);
      } else {
        authors.push(name);
      }
    }
  } catch {
    // Fallback to summary.author
  }

  if (authors.length === 0 && illustrators.length === 0 && summary.author) {
    authors.push(summary.author);
  }

  const isExact = Boolean(parsed.isValid && parsed.isbn13);
  const sourceUrl = parsed.isbn13 ? `https://openbd.jp/` : undefined;

  return {
    externalId: `openbd-${parsed.isbn13 || queryIsbn}`,
    provider: 'openbd',
    verified: false,
    title: summary.title || 'Untitled',
    authors: dedupeStrings(authors),
    illustrators: dedupeStrings(illustrators),
    translators: dedupeStrings(translators),
    publishers: summary.publisher ? [summary.publisher] : [],
    publishedDate: summary.pubdate || undefined,
    publishedYear: extractYear(summary.pubdate),
    language: 'ja',
    pageCount: null,
    genres: [],
    isbn13: parsed.isbn13,
    isbn10: parsed.prefixGroup === '978' ? parsed.isbn10 : null,
    coverUrl: normalizeUrl(summary.cover),
    seriesName: summary.series || undefined,
    volumeNumber: summary.volume || undefined,
    sourceUrl,
    matchQuality: isExact ? 'exact_isbn' : 'approximate',
    matchedIsbn: isExact ? parsed.isbn13 : null,
    contributingProviders: ['openbd'],
    sourceUrls: sourceUrl ? [{ provider: 'openbd', url: sourceUrl }] : undefined,
    rawPayload: item,
  };
}

export function parseTikiProduct(detail: Record<string, unknown>, queryIsbn?: string): MetadataCandidate | null {
  const name = typeof detail.name === 'string' ? detail.name.trim() : '';
  if (!name) return null;

  const parsedQuery = queryIsbn ? parseIsbn(queryIsbn) : null;
  const cleanedTitle = cleanVietnameseTitle(name);

  const specs: Array<{ attributes?: Array<{ code?: string; name?: string; value?: string }> }> =
    Array.isArray(detail.specifications) ? detail.specifications : [];

  const publishers: string[] = [];
  const translators: string[] = [];
  const illustrators: string[] = [];
  let pageCount: number | null = null;
  let publishedYear: number | null = null;
  let publishedDate: string | undefined;
  let format: BookFormat | undefined;
  let isbn13: string | null = null;
  let isbn10: string | null = null;

  for (const group of specs) {
    for (const attr of group.attributes ?? []) {
      const code = (attr.code ?? '').toLowerCase();
      const label = (attr.name ?? '').toLowerCase();
      const val = stripHtml(attr.value ?? '');
      if (!val) continue;

      if (code === 'manufacturer' || code === 'publisher_vn' || label.includes('nhà xuất bản')) {
        publishers.push(val);
      } else if (code === 'book_cover' || label.includes('loại bìa')) {
        format = normalizeBookFormat(val) ?? format;
      } else if (code === 'number_of_page' || label.includes('số trang')) {
        const n = Number(val.replace(/[^\d]/g, ''));
        if (n > 0) pageCount = n;
      } else if (code === 'publication_date' || label.includes('ngày xuất bản') || label.includes('năm xuất bản')) {
        publishedYear = publishedYear || extractYear(val);
        const iso = val.match(/\b\d{4}-\d{2}-\d{2}\b/);
        if (iso) publishedDate = iso[0];
      } else if (code === 'translator' || label.includes('dịch giả')) {
        translators.push(...splitPeopleList(val));
      } else if (label.includes('họa sĩ') || label.includes('minh họa')) {
        illustrators.push(...splitPeopleList(val));
      } else if (code === 'isbn' || label.includes('isbn')) {
        const p = parseIsbn(val);
        if (p.isValid && p.isbn13) {
          isbn13 = p.isbn13;
          isbn10 = p.prefixGroup === '978' ? p.isbn10 : null;
        }
      }
    }
  }

  const rawAuthors = Array.isArray(detail.authors)
    ? (detail.authors as Array<{ name?: string }>).map((a) => a.name ?? '').filter(Boolean)
    : [];
  const authors = dedupeStrings(rawAuthors).filter((a) => !/nhiều tác giả/i.test(a));

  const desc = stripHtml(typeof detail.description === 'string' ? detail.description : typeof detail.short_description === 'string' ? detail.short_description : '');
  const specFromDesc = extractLabeledSpecsFromHtmlOrText(typeof detail.description === 'string' ? detail.description : '');

  const finalAuthors = authors.length > 0 ? authors : specFromDesc.authors;
  const finalIllustrators = dedupeStrings([...illustrators, ...specFromDesc.illustrators]);
  const finalTranslators = dedupeStrings([...translators, ...specFromDesc.translators]);
  const finalPublishers = dedupeStrings([...publishers, ...specFromDesc.publishers]);

  const urlPath = typeof detail.url_path === 'string' ? detail.url_path : '';
  const sourceUrl = urlPath ? `https://tiki.vn/${urlPath.replace(/^\//, '')}` : `https://tiki.vn/`;
  const thumb = typeof detail.thumbnail_url === 'string' ? normalizeUrl(detail.thumbnail_url) : undefined;

  const isExact = Boolean(parsedQuery?.isbn13 && isbn13 && parsedQuery.isbn13 === isbn13);

  return {
    externalId: String(detail.id ?? sourceUrl),
    provider: 'tiki_books',
    verified: false,
    title: cleanedTitle.title,
    editionName: cleanedTitle.editionName,
    authors: finalAuthors,
    illustrators: finalIllustrators,
    translators: finalTranslators,
    publishers: finalPublishers,
    publishedDate,
    publishedYear: publishedYear ?? specFromDesc.publishedYear,
    language: normalizeLanguageCode(undefined, {
      title: cleanedTitle.title,
      publisher: finalPublishers[0],
      isbn13,
    }),
    format: format ?? specFromDesc.format ?? 'paperback',
    pageCount: pageCount ?? specFromDesc.pageCount,
    genres: [],
    description: desc || undefined,
    isbn13,
    isbn10,
    coverUrl: thumb,
    volumeNumber: cleanedTitle.volumeNumber,
    sourceUrl,
    matchQuality: queryIsbn ? (isExact ? 'exact_isbn' : 'approximate') : 'title_search',
    matchedIsbn: isExact ? isbn13 : null,
    contributingProviders: ['tiki_books'],
    sourceUrls: [{ provider: 'tiki_books', url: sourceUrl }],
    rawPayload: detail,
  };
}

function normalizeComparisonTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function candidateRichnessScore(c: MetadataCandidate): number {
  let score = 0;
  if (c.matchQuality === 'exact_isbn') score += 100;
  else if (c.matchQuality === 'approximate') score += 20;
  if (c.title && c.title !== 'Untitled') score += 10;
  if (c.authors.length > 0) score += 12;
  if (c.illustrators.length > 0) score += 5;
  if (c.translators.length > 0) score += 5;
  if (c.publishers.length > 0) score += 8;
  if (c.publishedYear) score += 6;
  if (c.pageCount) score += 6;
  if (c.coverUrl) score += 6;
  if (c.description) score += 4;
  if (c.isbn13) score += 10;
  if (c.language && c.language !== 'en') score += 2;
  return score;
}

/**
 * Re-evaluates matchQuality against an explicit ISBN query, deduplicates same-edition candidates,
 * preserves source provenance + conflicting field values, and supplements missing fields cleanly.
 */
export function mergeAndRankCandidates(
  rawCandidates: MetadataCandidate[],
  queryIsbn?: string
): MetadataCandidate[] {
  const parsedQuery = queryIsbn ? parseIsbn(queryIsbn) : null;

  // Normalize matchQuality strictly against queryIsbn
  const normalized = rawCandidates.map((c) => {
    const parsedCand = parseIsbn(c.isbn13 || c.isbn10 || '');
    const cleanIsbn13 = parsedCand.isValid ? parsedCand.isbn13 : c.isbn13 ?? null;
    const cleanIsbn10 =
      parsedCand.isValid && parsedCand.prefixGroup === '978' ? parsedCand.isbn10 : null;

    let matchQuality: MetadataMatchQuality = c.matchQuality ?? (queryIsbn ? 'approximate' : 'title_search');
    let matchedIsbn = c.matchedIsbn ?? null;

    if (parsedQuery?.isValid && parsedQuery.isbn13) {
      if (cleanIsbn13 && cleanIsbn13 === parsedQuery.isbn13) {
        matchQuality = 'exact_isbn';
        matchedIsbn = cleanIsbn13;
      } else {
        matchQuality = 'approximate';
        matchedIsbn = null;
      }
    }

    return {
      ...c,
      illustrators: dedupeStrings(c.illustrators ?? []),
      translators: dedupeStrings(c.translators ?? []),
      authors: dedupeStrings(c.authors ?? []),
      publishers: dedupeStrings(c.publishers ?? []),
      genres: dedupeStrings(c.genres ?? []),
      isbn13: cleanIsbn13,
      isbn10: cleanIsbn10,
      coverUrl: normalizeUrl(c.coverUrl),
      matchQuality,
      matchedIsbn,
      contributingProviders: c.contributingProviders ?? [c.provider],
      sourceUrls:
        c.sourceUrls ?? (c.sourceUrl ? [{ provider: c.provider, url: c.sourceUrl }] : []),
    };
  });

  // Sort best/richest candidates first before grouping so the richest exact match anchors each group
  normalized.sort((a, b) => candidateRichnessScore(b) - candidateRichnessScore(a));

  const groups: MetadataCandidate[] = [];

  for (const cand of normalized) {
    const candNormTitle = normalizeComparisonTitle(cand.title);
    const matchGroup = groups.find((g) => {
      // Never merge two records that carry DIFFERENT valid ISBN-13s
      if (g.isbn13 && cand.isbn13 && g.isbn13 !== cand.isbn13) return false;
      if (g.isbn13 && cand.isbn13 && g.isbn13 === cand.isbn13) return true;
      // Same normalized title & not conflicting ISBNs
      if (candNormTitle && normalizeComparisonTitle(g.title) === candNormTitle) {
        // Require same provider+id or overlapping author/publisher to avoid accidental homonym merges
        if (g.provider === cand.provider && g.externalId === cand.externalId) return true;
        const gAuthors = new Set(g.authors.map((x) => x.toLowerCase()));
        const sharesAuthor = cand.authors.some((a) => gAuthors.has(a.toLowerCase()));
        const gPubs = new Set(g.publishers.map((x) => x.toLowerCase()));
        const sharesPub = cand.publishers.some((p) => gPubs.has(p.toLowerCase()));
        return sharesAuthor || sharesPub;
      }
      return false;
    });

    if (!matchGroup) {
      groups.push({ ...cand, fieldConflicts: cand.fieldConflicts ? { ...cand.fieldConflicts } : {} });
      continue;
    }

    // Merge provenance
    const providers = new Set<MetadataProviderName>([
      ...(matchGroup.contributingProviders ?? [matchGroup.provider]),
      ...(cand.contributingProviders ?? [cand.provider]),
    ]);
    matchGroup.contributingProviders = Array.from(providers);

    const seenUrls = new Set((matchGroup.sourceUrls ?? []).map((s) => `${s.provider}|${s.url}`));
    const mergedUrls: ProviderSourceLink[] = [...(matchGroup.sourceUrls ?? [])];
    for (const link of cand.sourceUrls ?? []) {
      const k = `${link.provider}|${link.url}`;
      if (!seenUrls.has(k)) {
        seenUrls.add(k);
        mergedUrls.push(link);
      }
    }
    matchGroup.sourceUrls = mergedUrls;
    if (!matchGroup.sourceUrl && cand.sourceUrl) matchGroup.sourceUrl = cand.sourceUrl;

    // Track field conflicts without silently hiding discrepancies
    const conflicts = (matchGroup.fieldConflicts ??= {});
    const recordConflict = (field: string, primaryVal: string, secondaryVal: string) => {
      if (!primaryVal || !secondaryVal) return;
      if (primaryVal.toLowerCase() === secondaryVal.toLowerCase()) return;
      const list = (conflicts[field] ??= [{ provider: matchGroup.provider, value: primaryVal }]);
      if (!list.some((x) => x.provider === cand.provider && x.value === secondaryVal)) {
        list.push({ provider: cand.provider, value: secondaryVal });
      }
    };

    if (matchGroup.pageCount && cand.pageCount && matchGroup.pageCount !== cand.pageCount) {
      recordConflict('pageCount', String(matchGroup.pageCount), String(cand.pageCount));
    }
    if (matchGroup.publishedYear && cand.publishedYear && matchGroup.publishedYear !== cand.publishedYear) {
      recordConflict('publishedYear', String(matchGroup.publishedYear), String(cand.publishedYear));
    }
    if (matchGroup.title && cand.title && normalizeComparisonTitle(matchGroup.title) !== normalizeComparisonTitle(cand.title)) {
      recordConflict('title', matchGroup.title, cand.title);
    }

    // Supplement missing fields cleanly
    // Guard: don't overwrite exact ISBN attributes with non-exact approximate attributes
    const candCanSupplyNumericEditionFacts =
      matchGroup.matchQuality !== 'exact_isbn' || cand.matchQuality === 'exact_isbn';

    if (matchGroup.authors.length === 0 && cand.authors.length > 0) matchGroup.authors = cand.authors;
    if (cand.illustrators.length > 0) {
      matchGroup.illustrators = dedupeStrings([...matchGroup.illustrators, ...cand.illustrators]);
    }
    if (cand.translators.length > 0) {
      matchGroup.translators = dedupeStrings([...matchGroup.translators, ...cand.translators]);
    }
    if (matchGroup.publishers.length === 0 && cand.publishers.length > 0) {
      matchGroup.publishers = cand.publishers;
    }
    if (!matchGroup.publishedYear && cand.publishedYear && candCanSupplyNumericEditionFacts) {
      matchGroup.publishedYear = cand.publishedYear;
    }
    if (!matchGroup.publishedDate && cand.publishedDate && candCanSupplyNumericEditionFacts) {
      matchGroup.publishedDate = cand.publishedDate;
    }
    if (!matchGroup.pageCount && cand.pageCount && candCanSupplyNumericEditionFacts) {
      matchGroup.pageCount = cand.pageCount;
    }
    if (!matchGroup.coverUrl && cand.coverUrl) matchGroup.coverUrl = cand.coverUrl;
    if (!matchGroup.description && cand.description) matchGroup.description = cand.description;
    if (!matchGroup.seriesName && cand.seriesName) matchGroup.seriesName = cand.seriesName;
    if (!matchGroup.volumeNumber && cand.volumeNumber) matchGroup.volumeNumber = cand.volumeNumber;
    if (!matchGroup.format && cand.format) matchGroup.format = cand.format;
    if (!matchGroup.editionName && cand.editionName) matchGroup.editionName = cand.editionName;
    if ((!matchGroup.language || matchGroup.language === 'en') && cand.language && cand.language !== 'en') {
      matchGroup.language = cand.language;
    }
    matchGroup.genres = dedupeStrings([...matchGroup.genres, ...cand.genres]).slice(0, 8);
  }

  return groups.sort((a, b) => candidateRichnessScore(b) - candidateRichnessScore(a));
}
