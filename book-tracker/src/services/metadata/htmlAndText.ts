import { extractIsbnsFromText, parseIsbn } from '../../utils/isbn';

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z0-9]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[entity] ?? full;
  });
}

/**
 * Converts HTML into clean structured lines where table cells in the same row are separated by `\t`
 * and block boundaries / table rows become `\n`. Inline spans are unwrapped without inserting breaks.
 */
export function htmlToStructuredLines(html: string): string[] {
  if (!html) return [];
  let normalized = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Source formatting newlines/tabs in HTML are whitespace, not line breaks
    .replace(/[\r\n\t]+/g, ' ');

  // Convert each HTML <tr>...</tr> row cleanly so inner <div>/<p> tags inside <td> don't split cells across lines
  normalized = normalized.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_full, rowHtml: string) => {
    const cells: string[] = [];
    for (const cellMatch of rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      const cellText = decodeHtmlEntities(cellMatch[1].replace(/<[^>]+>/g, ' '))
        .replace(/[ \u00A0]+/g, ' ')
        .trim();
      if (cellText) cells.push(cellText);
    }
    return cells.length > 0 ? `\n${cells.join('\t')}\n` : '\n';
  });

  const cleaned = normalized
    .replace(/<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6]|\/dd|\/dt)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  const decoded = decodeHtmlEntities(cleaned);
  return decoded
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[ \u00A0]+/g, ' ')
        .replace(/\s*\t\s*/g, '\t')
        .trim()
    )
    .filter(Boolean);
}

export function stripHtmlToText(html: string): string {
  return htmlToStructuredLines(html)
    .map((line) => line.replace(/\t+/g, ' '))
    .join('\n');
}

export interface VietnameseSpecs {
  title?: string;
  authors: string[];
  translators: string[];
  illustrators: string[];
  publishers: string[];
  publishingPartner?: string;
  pageCount: number | null;
  publishedYear: number | null;
  publishedDate?: string;
  language?: string;
  genres: string[];
  isbns: string[];
  format?: 'paperback' | 'hardcover';
}

function splitContributors(raw: string): string[] {
  return raw
    .split(/[,;&/]+|\bvà\b/i)
    .map((s) => s.replace(/^[\s:–-]+|[\s.,;]+$/g, '').trim())
    .filter((s) => s.length >= 2 && !/^(nhiều tác giả|đang cập nhật|n\/a|-+)$/i.test(s));
}

function addUnique(target: string[], items: string[]): void {
  const seen = new Set(target.map((x) => x.toLocaleLowerCase('vi')));
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('vi');
    if (!seen.has(key)) {
      seen.add(key);
      target.push(trimmed);
    }
  }
}

function parseYearFromText(text: string): { year: number | null; date?: string } {
  const fullDate = text.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*((?:19|20)\d{2})/);
  if (fullDate) {
    const year = Number(fullDate[3]);
    return { year, date: `${fullDate[3]}-${fullDate[2].padStart(2, '0')}-${fullDate[1].padStart(2, '0')}` };
  }
  const yearOnly = text.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), date: yearOnly[1] };
  }
  return { year: null };
}

function normalizeLanguageLabel(val: string): string | undefined {
  const lower = val.toLocaleLowerCase('vi').trim();
  if (!lower) return undefined;
  if (lower.includes('tiếng việt') || lower === 'vi' || lower === 'vie' || lower.includes('vietnam')) return 'vi';
  if (lower.includes('tiếng anh') || lower === 'en' || lower === 'eng' || lower.includes('english')) return 'en';
  if (lower.includes('tiếng nhật') || lower === 'ja' || lower === 'jpn' || lower.includes('japan')) return 'ja';
  if (lower.includes('tiếng hàn') || lower === 'ko' || lower === 'kor' || lower.includes('korean')) return 'ko';
  if (lower.includes('tiếng trung') || lower === 'zh' || lower === 'zho' || lower.includes('chinese')) return 'zh';
  return undefined;
}

/**
 * Parses Vietnamese book specification blocks/tables (Hikaru, Gooda, ADCBook, Kim Đồng, Nhã Nam, IPM, etc.)
 */
export function extractVietnameseBookSpecs(htmlOrText: string): VietnameseSpecs {
  const rawLines = htmlOrText.includes('<') ? htmlToStructuredLines(htmlOrText) : htmlOrText.split(/\r?\n/);
  const INLINE_LABEL_SPLIT =
    /(?=\b(?:Nhà phát hành|Nhà xuất bản|NXB liên kết|Nhà cung cấp|Tác giả\/\s*Dịch giả|Tác giả|Dịch giả|Minh họa|Họa sĩ|Hình thức bìa|Định dạng|Số trang|Kích thước|Trọng lượng|Mã sản phẩm|ISBN|Năm xuất bản|Ngày phát hành|Phát hành|Ngôn ngữ|Thể loại)\s*:)/gi;
  const lines = rawLines.flatMap((line) =>
    line.includes('\t')
      ? [line]
      : line
          .split(INLINE_LABEL_SPLIT)
          .map((seg) => seg.trim())
          .filter(Boolean)
  );
  const specs: VietnameseSpecs = {
    authors: [],
    translators: [],
    illustrators: [],
    publishers: [],
    pageCount: null,
    publishedYear: null,
    genres: [],
    isbns: [],
  };

  for (const found of extractIsbnsFromText(lines.join('\n'))) {
    if (found.isbn13 && !specs.isbns.includes(found.isbn13)) {
      specs.isbns.push(found.isbn13);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Case A: "Label\tValue" from table rows; Case B: "Label: Value"
    let label = '';
    let value = '';
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      const inlineKvs = parts.filter((p) => /^[^:]{2,45}:\s*\S/.test(p));
      if (inlineKvs.length > 0 && inlineKvs.length >= Math.ceil(parts.length / 2)) {
        for (const p of parts) {
          const kv = p.match(/^([^:]{2,45}):\s*(.+)$/);
          if (kv) applyKeyValue(specs, kv[1], kv[2]);
        }
        continue;
      } else if (parts.length >= 2) {
        for (let col = 0; col + 1 < parts.length; col += 2) {
          applyKeyValue(specs, parts[col], parts[col + 1]);
        }
        continue;
      } else if (parts.length === 1) {
        const kv = parts[0].match(/^([^:]{2,45}):\s*(.+)$/);
        if (kv) {
          label = kv[1];
          value = kv[2];
        }
      }
    } else {
      const kv = line.match(/^([^:]{2,45}):\s*(.*)$/);
      if (kv) {
        label = kv[1];
        value = kv[2];
        // If value is empty and next line looks like a value (no colon and not separator), consume next line
        if (
          !value &&
          i + 1 < lines.length &&
          !lines[i + 1].includes(':') &&
          !/^[\s|\-–—•.,;/\\]+$/.test(lines[i + 1])
        ) {
          value = lines[i + 1].replace(/\t+/g, ' ').trim();
          i++;
        }
      }
    }

    if (label && value) {
      applyKeyValue(specs, label, value);
    }
  }

  return specs;
}

function applyKeyValue(specs: VietnameseSpecs, rawLabel: string, rawValue: string): void {
  const label = rawLabel.replace(/:$/, '').trim().toLocaleLowerCase('vi');
  const value = rawValue.replace(/\s+/g, ' ').trim();
  if (!value || value.length < 2 || /^[\s:|\-–—•.,;/\\]+$/.test(value) || /^đang cập nhật$/i.test(value)) {
    return;
  }

  if (label === 'tác giả' || label === 'author' || label === 'tác giả/ dịch giả') {
    addUnique(specs.authors, splitContributors(value));
  } else if (label === 'dịch giả' || label === 'người dịch' || label === 'biên dịch' || label === 'translator') {
    addUnique(specs.translators, splitContributors(value));
  } else if (label === 'minh họa' || label === 'họa sĩ' || label === 'illustrator') {
    addUnique(specs.illustrators, splitContributors(value));
  } else if (label === 'nxb liên kết' || label === 'nhà xuất bản liên kết') {
    if (!specs.publishingPartner) specs.publishingPartner = value;
    addUnique(specs.publishers, [value]);
  } else if (
    label === 'nhà xuất bản' ||
    label === 'nxb' ||
    label === 'publisher'
  ) {
    addUnique(specs.publishers, [value]);
  } else if (
    label === 'nhà phát hành' ||
    label === 'công ty phát hành' ||
    label === 'đơn vị phát hành' ||
    label === 'phát hành' ||
    label === 'thương hiệu'
  ) {
    // Distinguish "Phát hành: 15/07/2022" (release date) from publisher/distributor name
    const dateParsed = parseYearFromText(value);
    if (dateParsed.year && /^\d/.test(value)) {
      if (!specs.publishedYear) specs.publishedYear = dateParsed.year;
      if (!specs.publishedDate && dateParsed.date) specs.publishedDate = dateParsed.date;
    } else if (!/^(vui lòng|liên hệ)/i.test(value)) {
      addUnique(specs.publishers, [value]);
    }
  } else if (label === 'số trang' || label === 'pages') {
    const m = value.match(/\d{1,5}/);
    if (m && !specs.pageCount) {
      const n = Number(m[0]);
      if (n > 0 && n < 20000) specs.pageCount = n;
    }
  } else if (label === 'năm xuất bản' || label === 'ngày phát hành' || label === 'năm phát hành') {
    const dateParsed = parseYearFromText(value);
    if (dateParsed.year && !specs.publishedYear) specs.publishedYear = dateParsed.year;
    if (dateParsed.date && !specs.publishedDate) specs.publishedDate = dateParsed.date;
  } else if (label === 'ngôn ngữ' || label === 'language') {
    const lang = normalizeLanguageLabel(value);
    if (lang && !specs.language) specs.language = lang;
  } else if (label === 'thể loại' || label === 'danh mục' || label === 'genre') {
    addUnique(specs.genres, splitContributors(value));
  } else if (label === 'hình thức bìa' || label === 'định dạng' || label === 'loại bìa') {
    const lower = value.toLocaleLowerCase('vi');
    if (lower.includes('bìa cứng') || lower.includes('hardcover')) specs.format = 'hardcover';
    else if (lower.includes('bìa mềm') || lower.includes('bìa rời') || lower.includes('paperback')) {
      specs.format = 'paperback';
    }
  } else if (label === 'isbn' || label === 'mã sản phẩm' || label === 'sku' || label === 'mã vạch') {
    for (const found of extractIsbnsFromText(value)) {
      if (found.isbn13 && !specs.isbns.includes(found.isbn13)) {
        specs.isbns.push(found.isbn13);
      }
    }
    const direct = parseIsbn(value);
    if (direct.isValid && direct.isbn13 && !specs.isbns.includes(direct.isbn13)) {
      specs.isbns.push(direct.isbn13);
    }
  }
}

export interface JsonLdBookData {
  title?: string;
  authors: string[];
  publishers: string[];
  isbns: string[];
  pageCount: number | null;
  publishedDate?: string;
  publishedYear: number | null;
  coverUrl?: string;
  description?: string;
}

export function extractJsonLdBooks(html: string): JsonLdBookData[] {
  const results: JsonLdBookData[] = [];
  const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of items) {
        if (!obj || typeof obj !== 'object') continue;
        const type = String(obj['@type'] ?? '').toLowerCase();
        if (!type.includes('book') && !type.includes('product')) continue;

        const isbns: string[] = [];
        for (const field of [obj.isbn, obj.gtin13, obj.gtin, obj.sku, obj.mpn]) {
          if (typeof field === 'string') {
            const p = parseIsbn(field);
            if (p.isValid && p.isbn13 && !isbns.includes(p.isbn13)) isbns.push(p.isbn13);
          }
        }

        const authors: string[] = [];
        const rawAuthors = Array.isArray(obj.author) ? obj.author : obj.author ? [obj.author] : [];
        for (const a of rawAuthors) {
          if (typeof a === 'string') addUnique(authors, [a]);
          else if (a && typeof a === 'object' && typeof a.name === 'string') addUnique(authors, [a.name]);
        }

        const publishers: string[] = [];
        const rawPub = obj.publisher ?? obj.brand;
        if (typeof rawPub === 'string') addUnique(publishers, [rawPub]);
        else if (rawPub && typeof rawPub === 'object' && typeof rawPub.name === 'string') {
          addUnique(publishers, [rawPub.name]);
        }

        const rawImage = Array.isArray(obj.image) ? obj.image[0] : obj.image;
        const coverUrl =
          typeof rawImage === 'string'
            ? rawImage
            : rawImage && typeof rawImage === 'object' && typeof rawImage.url === 'string'
              ? rawImage.url
              : undefined;

        const pubDate = typeof obj.datePublished === 'string' ? obj.datePublished : undefined;
        const yearMatch = pubDate?.match(/(19|20)\d{2}/);

        results.push({
          title: typeof obj.name === 'string' ? decodeHtmlEntities(obj.name).trim() : undefined,
          authors,
          publishers,
          isbns,
          pageCount: typeof obj.numberOfPages === 'number' ? obj.numberOfPages : null,
          publishedDate: pubDate,
          publishedYear: yearMatch ? Number(yearMatch[0]) : null,
          coverUrl: coverUrl?.replace(/^http:\/\//i, 'https://'),
          description: typeof obj.description === 'string' ? stripHtmlToText(obj.description) : undefined,
        });
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }
  return results;
}
