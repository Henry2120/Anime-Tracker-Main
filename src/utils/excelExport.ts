import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { MalListItem, MalUser } from '../types';
import { computeAnimeStats } from '../components/StatusDashboard';
import { parseSeasonFromDate } from './seasonUtils';

export type ExportMode = 'season' | 'all' | 'full';

export interface ExportAniVerseOptions {
  mode: ExportMode;
  year: number;
  season: string; // 'spring' | 'summer' | 'fall' | 'winter'
  malList: MalListItem[];
  seasonAnimeList: MalListItem[];
  customUserNotes?: Record<number, string>;
  malUser?: MalUser | null;
}

/**
 * Capitalizes string e.g. "summer" -> "Summer"
 */
function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Selects anime title following AniVerse single source of truth:
 * Prefers English title if available, otherwise native/romaji/title.
 */
export function getAnimeDisplayTitle(itemOrNode: any): string {
  const node = itemOrNode?.node || itemOrNode;
  if (!node) return 'Untitled Anime';
  if (node.alternative_titles?.en && typeof node.alternative_titles.en === 'string' && node.alternative_titles.en.trim()) {
    return node.alternative_titles.en.trim();
  }
  if (node.title && typeof node.title === 'string' && node.title.trim()) {
    return node.title.trim();
  }
  if (node.alternative_titles?.ja && typeof node.alternative_titles.ja === 'string' && node.alternative_titles.ja.trim()) {
    return node.alternative_titles.ja.trim();
  }
  return 'Untitled Anime';
}

/**
 * Maps MAL status code to human readable label
 */
export function formatStatus(rawStatus?: string | null): string {
  if (!rawStatus) return '';
  switch (rawStatus.toLowerCase()) {
    case 'watching':
      return 'Watching';
    case 'completed':
      return 'Completed';
    case 'on_hold':
      return 'On Hold';
    case 'dropped':
      return 'Dropped';
    case 'plan_to_watch':
      return 'Plan to Watch';
    default:
      return rawStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Returns color styling for status cell
 */
function getStatusCellStyle(status: string): { bg: string; text: string } {
  switch (status.toLowerCase()) {
    case 'completed':
      return { bg: 'FFEBF3FE', text: 'FF1E40AF' }; // Soft blue
    case 'watching':
      return { bg: 'FFECFDF5', text: 'FF065F46' }; // Soft green
    case 'plan to watch':
      return { bg: 'FFF5F3FF', text: 'FF5B21B6' }; // Soft purple
    case 'on hold':
      return { bg: 'FFFFFBEB', text: 'FF92400E' }; // Soft amber
    case 'dropped':
      return { bg: 'FFFFF1F2', text: 'FF9F1239' }; // Soft rose
    default:
      return { bg: 'FFF7F5F2', text: 'FF374151' };
  }
}

/**
 * Formats rewatch value from MAL API
 */
export function formatRewatchValue(val: any): string {
  if (val === undefined || val === null || val === '' || val === 0 || val === '0') {
    return '';
  }
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  switch (num) {
    case 1:
      return 'Very Low';
    case 2:
      return 'Low';
    case 3:
      return 'Medium';
    case 4:
      return 'High';
    case 5:
      return 'Very High';
    default:
      return String(val);
  }
}

/**
 * Formats debut season
 */
export function formatStartSeason(node: any): string {
  if (!node) return '';
  if (node.start_season && typeof node.start_season === 'object') {
    const s = node.start_season.season;
    const y = node.start_season.year;
    if (s && y) {
      return `${capitalize(s)} ${y}`;
    }
  }
  const rawDate = node.start_date || node.aired?.from;
  if (rawDate) {
    const parsed = parseSeasonFromDate(rawDate);
    if (parsed && parsed.season && parsed.year) {
      return `${capitalize(parsed.season)} ${parsed.year}`;
    }
  }
  return '';
}

/**
 * Formats genres into a clean tag-like/capsule representation
 * e.g. "[ Action ]  [ Fantasy ]  [ Romance ]"
 */
export function formatGenreTags(node: any): string {
  if (!node?.genres || !Array.isArray(node.genres) || node.genres.length === 0) {
    return '';
  }
  return node.genres
    .map((g: any) => {
      const name = typeof g === 'string' ? g : g?.name;
      return name ? `[ ${name} ]` : '';
    })
    .filter(Boolean)
    .join('  ');
}

/**
 * Cleans and decodes Notes:
 * - Converts HTML line breaks (<br>, <br/>, <br />, &lt;br&gt;, &lt;br/&gt;, &lt;br /&gt;) to actual newlines (\n)
 * - Decodes HTML entities (&#039;, &apos;, &amp;, &lt;, &gt;, &quot;, &nbsp;, numeric entities, etc.)
 * - Strips any residual raw HTML tags
 * - Preserves paragraphs and formatting without truncation
 */
export function sanitizeAndDecodeNotes(rawText?: string | null): string {
  if (!rawText) return '';
  let str = String(rawText);

  // 1. Convert any encoded or raw <br> variants into \n
  str = str.replace(/(?:&lt;|<)\s*br\s*\/?\s*(?:&gt;|>)(?:\r?\n)?/gi, '\n');

  // Convert <p> and </p> tags into newlines
  str = str.replace(/(?:&lt;|<)\s*\/p\s*(?:&gt;|>)/gi, '\n');
  str = str.replace(/(?:&lt;|<)\s*p\s*(?:&gt;|>)/gi, '');

  // 2. Strip any remaining actual raw HTML tags (e.g. <span style="...">, <b>, </b>)
  str = str.replace(/<[^>]*>/g, '');

  // 3. Decode standard HTML entities
  const entityMap: Record<string, string> = {
    '&quot;': '"',
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&#039;': "'",
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
  };

  for (const [entity, replacement] of Object.entries(entityMap)) {
    str = str.split(entity).join(replacement);
  }

  // Handle any remaining numeric entities &#123; or &#x1a;
  str = str.replace(/&#(\d+);/g, (_, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return '';
    }
  });
  str = str.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return '';
    }
  });

  // Decode &amp; last to prevent double decoding
  str = str.split('&amp;').join('&');

  // Normalize Windows \r\n to \n
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Clean excessive consecutive newlines (max 2 newlines for paragraph breaks)
  str = str.replace(/\n{3,}/g, '\n\n');

  return str.trim();
}

/**
 * Generates the standardized filename according to requirement specifications
 */
export function generateExportFilename(mode: ExportMode, season: string, year: number): string {
  const capSeason = capitalize(season);
  switch (mode) {
    case 'season':
      return `AniVerse_${capSeason}_${year}.xlsx`;
    case 'all':
      return `AniVerse_All_Anime.xlsx`;
    case 'full':
      return `AniVerse_Full_Report_${capSeason}_${year}.xlsx`;
  }
}

/**
 * Returns Japanese seasonal motif details
 */
function getSeasonalMotif(season: string, isAllAnime: boolean) {
  if (isAllAnime) {
    return {
      kanji: '全',
      romaji: 'Zen Archive',
      symbol: '🌌',
      label: 'Lifetime Anime Catalog',
      accentColor: 'FF56499E',
      lightAccent: 'FFF0EDFA',
    };
  }
  switch (season.toLowerCase()) {
    case 'spring':
      return {
        kanji: '春',
        romaji: 'Haru',
        symbol: '🌸',
        label: 'Spring Seasonal Broadcast',
        accentColor: 'FFD946EF',
        lightAccent: 'FFFDF4FF',
      };
    case 'summer':
      return {
        kanji: '夏',
        romaji: 'Natsu',
        symbol: '☀️',
        label: 'Summer Seasonal Broadcast',
        accentColor: 'FF0284C7',
        lightAccent: 'FFF0F9FF',
      };
    case 'fall':
    case 'autumn':
      return {
        kanji: '秋',
        romaji: 'Aki',
        symbol: '🍁',
        label: 'Autumn Seasonal Broadcast',
        accentColor: 'FFEA580C',
        lightAccent: 'FFFFF7ED',
      };
    case 'winter':
    default:
      return {
        kanji: '冬',
        romaji: 'Fuyu',
        symbol: '❄️',
        label: 'Winter Seasonal Broadcast',
        accentColor: 'FF2563EB',
        lightAccent: 'FFEFF6FF',
      };
  }
}

/**
 * Creates the ✨ Welcome Dashboard sheet
 */
function buildWelcomeSheet(
  workbook: ExcelJS.Workbook,
  options: ExportAniVerseOptions,
  stats: ReturnType<typeof computeAnimeStats>,
  datasetTitle: string,
  isAllAnimeMode: boolean
) {
  const ws = workbook.addWorksheet('✨ Welcome', {
    properties: { tabColor: { argb: 'FF56499E' } },
    views: [{ showGridLines: true }],
  });

  // Balanced column layout
  ws.getColumn(1).width = 4;   // Margin A
  ws.getColumn(2).width = 24;  // B
  ws.getColumn(3).width = 24;  // C
  ws.getColumn(4).width = 24;  // D
  ws.getColumn(5).width = 24;  // E
  ws.getColumn(6).width = 24;  // F
  ws.getColumn(7).width = 4;   // Margin G

  const motif = getSeasonalMotif(options.season, isAllAnimeMode);

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 1: ANIVERSE HEADER & SEASONAL ATMOSPHERE
  // ═════════════════════════════════════════════════════════════════════

  // Decorative Micro-Bar (Row 2)
  ws.mergeCells('B2:F2');
  const decoBar = ws.getCell('B2');
  decoBar.value = `${motif.symbol}  ───  ANIVERSE  •  アニバース  •  PERSONAL ANIME COMPANION  ───  ${motif.symbol}`;
  decoBar.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFC5BEF7' } };
  decoBar.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF25223D' } };
  decoBar.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 22;

  // Main Hero Title Banner (B3:F4)
  ws.mergeCells('B3:F4');
  const bannerCell = ws.getCell('B3');
  bannerCell.value = isAllAnimeMode
    ? 'ANIVERSE — COMPLETE ANIME ARCHIVE'
    : `ANIVERSE — ${datasetTitle.toUpperCase()} REPORT`;
  bannerCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  bannerCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 24;

  // Seasonal Atmosphere Ribbon (B5:F5)
  ws.mergeCells('B5:F5');
  const subCell = ws.getCell('B5');
  subCell.value = `${motif.symbol}  ${motif.kanji} • ${motif.romaji} (${motif.label})  |  MAL Source of Truth  |  Verified AniVerse Export`;
  subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF3D3560' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: motif.lightAccent } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  subCell.border = {
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
  ws.getRow(5).height = 22;

  // Spacer row 6
  ws.getRow(6).height = 12;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 2: SEASON & CATALOG INFORMATION
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B7:F7');
  const seasonInfoSec = ws.getCell('B7');
  seasonInfoSec.value = 'SEASON & CATALOG INFORMATION';
  seasonInfoSec.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  seasonInfoSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  seasonInfoSec.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  seasonInfoSec.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(7).height = 22;

  const infoLabels = ['Broadcast Period', 'Calendar Year', 'Export Date', 'MAL Profile', 'Total Anime'];
  const infoHeaderRow = ws.getRow(8);
  infoHeaderRow.height = 20;
  infoLabels.forEach((label, idx) => {
    const colLetter = String.fromCharCode(66 + idx); // B, C, D, E, F
    const cell = ws.getCell(`${colLetter}8`);
    cell.value = label;
    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF6B7280' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });

  const exportDateStr = new Date().toISOString().split('T')[0];
  const infoValues = [
    isAllAnimeMode ? 'All Seasons' : `${motif.symbol} ${capitalize(options.season)}`,
    isAllAnimeMode ? 'Lifetime Archive' : options.year.toString(),
    exportDateStr,
    options.malUser?.name || 'MAL User',
    stats.totalAnime.toString(),
  ];

  const infoValueRow = ws.getRow(9);
  infoValueRow.height = 26;
  infoValues.forEach((val, idx) => {
    const colLetter = String.fromCharCode(66 + idx);
    const cell = ws.getCell(`${colLetter}9`);
    cell.value = val;
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });

  // Spacer row 10
  ws.getRow(10).height = 14;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 3: KEY PERFORMANCE INDICATORS
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B11:F11');
  const kpiSec = ws.getCell('B11');
  kpiSec.value = 'KEY PERFORMANCE INDICATORS';
  kpiSec.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  kpiSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  kpiSec.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  kpiSec.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(11).height = 22;

  const drawCard = (
    cellPosVal: string,
    cellPosLbl: string,
    value: string | number,
    label: string,
    colorHex: string,
    bgHex: string
  ) => {
    const valCell = ws.getCell(cellPosVal);
    valCell.value = value;
    valCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: colorHex } };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
    valCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valCell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    const lblCell = ws.getCell(cellPosLbl);
    lblCell.value = label;
    lblCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF4B5563' } };
    lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
    lblCell.alignment = { horizontal: 'center', vertical: 'middle' };
    lblCell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  };

  // Row 12-13: Status distribution KPI Cards
  ws.getRow(12).height = 32;
  ws.getRow(13).height = 20;
  drawCard('B12', 'B13', stats.totalAnime, 'Total Anime', 'FF56499E', 'FFF5F3FF');
  drawCard('C12', 'C13', stats.completedCount, 'Completed', 'FF1E40AF', 'FFEBF3FE');
  drawCard('D12', 'D13', stats.watchingCount, 'Watching', 'FF065F46', 'FFECFDF5');
  drawCard('E12', 'E13', stats.onHoldCount, 'On Hold', 'FF92400E', 'FFFFFBEB');
  drawCard('F12', 'F13', stats.droppedCount, 'Dropped', 'FF9F1239', 'FFFFF1F2');

  // Spacer row 14
  ws.getRow(14).height = 10;

  // Row 15-16: Progress & Score KPI Cards
  ws.getRow(15).height = 32;
  ws.getRow(16).height = 20;
  const completionPct = stats.totalAnime > 0 ? Math.round((stats.completedCount / stats.totalAnime) * 100) + '%' : '0%';
  drawCard('B15', 'B16', stats.ptwCount, 'Plan to Watch', 'FF5B21B6', 'FFF5F3FF');
  drawCard('C15', 'C16', stats.totalEpisodesWatched, 'Episodes Watched', 'FF0D9488', 'FFF0FDFA');
  drawCard('D15', 'D16', stats.avgScore ? `${stats.avgScore} ★` : '—', 'Average Score', 'FFD97706', 'FFFFFBEB');
  drawCard('E15', 'E16', `${stats.ratedCount} / ${stats.totalAnime}`, 'Rated Anime', 'FF4F46E5', 'FFEEF2FF');
  drawCard('F15', 'F16', completionPct, 'Completion Rate', 'FF059669', 'FFECFDF5');

  // Spacer row 17
  ws.getRow(17).height = 14;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 4: WORKBOOK STRUCTURE & NAVIGATION
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B18:F18');
  const guideHeader = ws.getCell('B18');
  guideHeader.value = 'WORKBOOK STRUCTURE & NAVIGATION';
  guideHeader.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  guideHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  guideHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  guideHeader.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(18).height = 22;

  const sheetsInfo = [
    {
      tab: '✨ Welcome',
      desc: 'High-level dashboard overview, season summary cards, and quick navigation index.',
    },
    {
      tab: '📺 Anime List',
      desc: 'Main anime tracking table with tag-like genres, status badges, episode progress, score, and personal notes.',
    },
    {
      tab: '📊 Statistics',
      desc: 'Visual analytics dashboard with native Excel charts (Score & Status distributions, Top Genres doughnut chart, Genre Breakdown table, and Supporting Data Matrices).',
    },
  ];

  if (options.mode === 'full') {
    sheetsInfo.push({
      tab: '📚 All Anime',
      desc: 'Complete, unfiltered MAL lifetime anime archive across all broadcast seasons.',
    });
  }

  const tableHeaderRow = ws.getRow(19);
  tableHeaderRow.height = 22;
  const tabCell = ws.getCell('B19');
  tabCell.value = 'Worksheet';
  tabCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  tabCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  tabCell.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.mergeCells('C19:F19');
  const descHeader = ws.getCell('C19');
  descHeader.value = 'Description & Features';
  descHeader.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  descHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  descHeader.alignment = { vertical: 'middle', horizontal: 'left' };

  sheetsInfo.forEach((item, idx) => {
    const rowIdx = 20 + idx;
    const row = ws.getRow(rowIdx);
    row.height = 24;

    const tCell = ws.getCell(`B${rowIdx}`);
    tCell.value = item.tab;
    tCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1F2937' } };
    tCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF' },
    };
    tCell.alignment = { vertical: 'middle', horizontal: 'center' };
    tCell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    ws.mergeCells(`C${rowIdx}:F${rowIdx}`);
    const dCell = ws.getCell(`C${rowIdx}`);
    dCell.value = item.desc;
    dCell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF4B5563' } };
    dCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF' },
    };
    dCell.alignment = { vertical: 'middle', horizontal: 'left' };
    dCell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });
}

/**
 * Creates an Anime List table worksheet (used for 📺 Anime List and 📚 All Anime)
 * Exact visible columns requested:
 * 1. #
 * 2. Anime
 * 3. Status
 * 4. Total Episodes
 * 5. Episodes Watched
 * 6. Score
 * 7. End Date
 * 8. Genres (tag-like format e.g. [ Action ]  [ Fantasy ])
 * 9. Rewatch Value
 * 10. Notes
 * (For 📚 All Anime archive: Start Season is included)
 * NO Start Date and NO MAL ID anywhere!
 */
function buildAnimeListSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  items: MalListItem[],
  customUserNotes: Record<number, string> = {},
  isAllAnimeArchive: boolean = false
) {
  const ws = workbook.addWorksheet(sheetName, {
    properties: {
      tabColor: { argb: isAllAnimeArchive ? 'FF4B5563' : 'FF7567C7' },
    },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
  });

  // Define simplified columns according to user specification
  const baseColumns: any[] = [
    { header: '#', key: 'seq', width: 6 },
    { header: 'Anime', key: 'title', width: 38 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Total Episodes', key: 'total_episodes', width: 15 },
    { header: 'Episodes Watched', key: 'episodes_watched', width: 18 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'End Date', key: 'end_date', width: 14 },
  ];

  if (isAllAnimeArchive) {
    baseColumns.push({ header: 'Start Season', key: 'start_season', width: 16 });
  }

  baseColumns.push(
    { header: 'Genres', key: 'genres', width: 34 },
    { header: 'Rewatch Value', key: 'rewatch_value', width: 16 },
    { header: 'Notes', key: 'notes', width: 36 }
  );

  ws.columns = baseColumns;

  // Style Header Row
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: isAllAnimeArchive ? 'FF374151' : 'FF56499E' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  headerRow.eachCell((cell) => {
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF1F2937' } },
      right: { style: 'thin', color: { argb: 'FF6B7280' } },
    };
  });

  // AutoFilter
  const lastColLetter = String.fromCharCode(64 + baseColumns.length);
  ws.autoFilter = `A1:${lastColLetter}${Math.max(2, items.length + 1)}`;

  // Populate Data Rows
  items.forEach((item, index) => {
    const node = item.node || (item as any);
    const listStatus = (item.list_status || {}) as any;
    const animeId = node.id || 0;

    const title = getAnimeDisplayTitle(item);
    const rawStatus = listStatus.status || '';
    const formattedStatusStr = formatStatus(rawStatus);

    const totalEpisodes = typeof node.num_episodes === 'number' && node.num_episodes > 0
      ? node.num_episodes
      : '';

    const watched = typeof listStatus.num_episodes_watched === 'number'
      ? listStatus.num_episodes_watched
      : 0;

    const scoreVal = typeof listStatus.score === 'number' && listStatus.score > 0
      ? listStatus.score
      : '';

    const endDate = listStatus.finish_date || listStatus.end_date || '';
    const genreTags = formatGenreTags(node);
    const rewatch = formatRewatchValue(listStatus.rewatch_value ?? listStatus.num_times_rewatched);

    // Note priority: custom note -> MAL comments -> empty, cleaned and decoded
    const rawNote = customUserNotes[animeId] || listStatus.comments || '';
    const noteText = sanitizeAndDecodeNotes(rawNote);

    const rowData: Record<string, any> = {
      seq: index + 1,
      title,
      status: formattedStatusStr,
      total_episodes: totalEpisodes,
      episodes_watched: watched,
      score: scoreVal,
      end_date: endDate,
      genres: genreTags,
      rewatch_value: rewatch,
      notes: noteText,
    };

    if (isAllAnimeArchive) {
      rowData.start_season = formatStartSeason(node);
    }

    const row = ws.addRow(rowData);
    
    // Estimate row height based on note length and explicit line breaks so multiline notes are legible
    const noteLines = (noteText.match(/\n/g) || []).length + 1;
    const estimatedWrapped = Math.max(noteLines, Math.ceil(noteText.length / 38));
    row.height = Math.max(24, Math.min(120, estimatedWrapped * 17 + 7));

    const isEven = index % 2 === 0;
    const defaultBg = isEven ? 'FFFFFFFF' : 'FFF9F8F6';

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1F2937' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: defaultBg } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFF3F4F6' } },
      };

      const colKey = baseColumns[colNumber - 1]?.key;

      if (['seq', 'total_episodes', 'episodes_watched', 'score', 'end_date', 'rewatch_value', 'start_season'].includes(colKey)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'notes') {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      } else if (colKey === 'genres') {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      // Status pill styling
      if (colKey === 'status' && formattedStatusStr) {
        const { bg, text } = getStatusCellStyle(formattedStatusStr);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: text } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Score styling
      if (colKey === 'score' && typeof scoreVal === 'number') {
        cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFD97706' } };
      }

      // Genres tag styling (soft lavender color for readability)
      if (colKey === 'genres' && genreTags) {
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF56499E' } };
      }
    });
  });
}

/**
 * Creates the 📊 Statistics worksheet with KPI cards, space for native Excel charts,
 * and supporting data matrices (including the Genre Breakdown Table).
 */
function buildStatisticsSheet(
  workbook: ExcelJS.Workbook,
  stats: ReturnType<typeof computeAnimeStats>,
  datasetTitle: string,
  items: MalListItem[]
) {
  const ws = workbook.addWorksheet('📊 Statistics', {
    properties: { tabColor: { argb: 'FF56499E' } },
    views: [{ showGridLines: true }],
  });

  // Balanced column widths for clean dashboard alignment
  ws.getColumn(1).width = 3;   // A (Margin)
  ws.getColumn(2).width = 13;  // B
  ws.getColumn(3).width = 13;  // C
  ws.getColumn(4).width = 13;  // D
  ws.getColumn(5).width = 13;  // E
  ws.getColumn(6).width = 13;  // F
  ws.getColumn(7).width = 13;  // G
  ws.getColumn(8).width = 13;  // H
  ws.getColumn(9).width = 4;   // I (Divider)
  ws.getColumn(10).width = 15; // J (Genre Name)
  ws.getColumn(11).width = 13; // K
  ws.getColumn(12).width = 13; // L
  ws.getColumn(13).width = 13; // M (Genre Count)
  ws.getColumn(14).width = 13; // N
  ws.getColumn(15).width = 13; // O (Genre %)
  ws.getColumn(16).width = 13; // P
  ws.getColumn(17).width = 3;  // Q (Margin)

  // 1. Dashboard Title Banner (B2:P2)
  ws.mergeCells('B2:P2');
  const banner = ws.getCell('B2');
  banner.value = `📊 ANIVERSE ANALYTICS DASHBOARD — ${datasetTitle.toUpperCase()}`;
  banner.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  banner.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 26;

  // Subtitle Banner (B3:P3)
  ws.mergeCells('B3:P3');
  const subBanner = ws.getCell('B3');
  subBanner.value = 'Native Excel analytics visualizations, distributions, and supporting catalog matrices';
  subBanner.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF3D3560' } };
  subBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
  subBanner.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(3).height = 18;

  // Spacer row 4
  ws.getRow(4).height = 12;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 1: OVERVIEW & HEADLINE METRICS
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B5:P5');
  const sec1 = ws.getCell('B5');
  sec1.value = '1. OVERVIEW & HEADLINE METRICS';
  sec1.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  sec1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sec1.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(5).height = 22;

  const drawKpi = (
    startCol: string,
    endCol: string,
    val: string | number,
    label: string,
    colorHex: string,
    bgHex: string
  ) => {
    ws.mergeCells(`${startCol}6:${endCol}6`);
    const valCell = ws.getCell(`${startCol}6`);
    valCell.value = val;
    valCell.font = { name: 'Segoe UI', size: 17, bold: true, color: { argb: colorHex } };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
    valCell.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells(`${startCol}7:${endCol}7`);
    const lblCell = ws.getCell(`${startCol}7`);
    lblCell.value = label;
    lblCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF4B5563' } };
    lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
    lblCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const startIdx = startCol.charCodeAt(0) - 64;
    const endIdx = endCol.charCodeAt(0) - 64;
    for (let c = startIdx; c <= endIdx; c++) {
      const colL = String.fromCharCode(64 + c);
      ws.getCell(`${colL}6`).border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      ws.getCell(`${colL}7`).border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    }
    ws.getCell(`${startCol}6`).border = { ...ws.getCell(`${startCol}6`).border, left: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    ws.getCell(`${startCol}7`).border = { ...ws.getCell(`${startCol}7`).border, left: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    ws.getCell(`${endCol}6`).border = { ...ws.getCell(`${endCol}6`).border, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    ws.getCell(`${endCol}7`).border = { ...ws.getCell(`${endCol}7`).border, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
  };

  ws.getRow(6).height = 28;
  ws.getRow(7).height = 20;

  drawKpi('B', 'D', stats.totalAnime, 'Total Anime', 'FF56499E', 'FFF5F3FF');
  drawKpi('E', 'G', stats.completedCount, 'Completed', 'FF1E40AF', 'FFEBF3FE');
  drawKpi('H', 'J', stats.watchingCount, 'Watching', 'FF065F46', 'FFECFDF5');
  drawKpi('K', 'M', stats.totalEpisodesWatched, 'Episodes Watched', 'FF0D9488', 'FFF0FDFA');
  drawKpi('N', 'P', stats.avgScore ? `${stats.avgScore} ★` : '—', 'Average Score', 'FFD97706', 'FFFFFBEB');

  // Spacer row 8
  ws.getRow(8).height = 16;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 2: SCORE & WATCH STATUS DISTRIBUTIONS (NATIVE CHARTS)
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B9:P9');
  const sec2 = ws.getCell('B9');
  sec2.value = '2. SCORE & WATCH STATUS DISTRIBUTIONS';
  sec2.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  sec2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sec2.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(9).height = 22;

  // Spacer row 10
  ws.getRow(10).height = 10;

  // Chart 1 (Score Distribution) occupies Cols B to H, Rows 11 to 28
  // Chart 2 (Watch Status Distribution) occupies Cols J to P, Rows 11 to 28
  // (Col I is the separator between them)
  for (let r = 11; r <= 28; r++) {
    ws.getRow(r).height = 20;
  }

  // Spacer row 29
  ws.getRow(29).height = 18;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 3: GENRE DISTRIBUTION & BREAKDOWN
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B30:P30');
  const sec3 = ws.getCell('B30');
  sec3.value = '3. GENRE DISTRIBUTION & BREAKDOWN';
  sec3.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  sec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  sec3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sec3.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(30).height = 22;

  // Spacer row 31
  ws.getRow(31).height = 10;

  // Chart 3 (Top Genres Doughnut) occupies Cols B to I, Rows 32 to 50
  // Genre Breakdown Table occupies Cols J to P, Rows 32 to 48
  const gTableHeadRow = ws.getRow(32);
  gTableHeadRow.height = 24;

  ws.mergeCells('J32:L32');
  const gH1 = ws.getCell('J32');
  gH1.value = 'Genre';
  gH1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  gH1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  gH1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells('M32:N32');
  const gH2 = ws.getCell('M32');
  gH2.value = 'Anime Count';
  gH2.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  gH2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  gH2.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.mergeCells('O32:P32');
  const gH3 = ws.getCell('O32');
  gH3.value = 'Catalog Share';
  gH3.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  gH3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  gH3.alignment = { vertical: 'middle', horizontal: 'center' };

  [gH1, gH2, gH3].forEach((c) => {
    c.border = { bottom: { style: 'medium', color: { argb: 'FF3D3560' } } };
  });

  const genresList = stats.genreChartData || [];
  const topGenres = genresList.slice(0, 14); // show up to top 14 genres
  const totalGenreSum = stats.totalGenreInstances || genresList.reduce((acc, g) => acc + g.count, 0);

  if (topGenres.length === 0) {
    const rIdx = 33;
    ws.mergeCells(`J${rIdx}:L${rIdx}`);
    ws.getCell(`J${rIdx}`).value = 'No genre data';
    ws.mergeCells(`M${rIdx}:N${rIdx}`);
    ws.getCell(`M${rIdx}`).value = 0;
    ws.mergeCells(`O${rIdx}:P${rIdx}`);
    ws.getCell(`O${rIdx}`).value = '0.0%';
    ['J', 'M', 'O'].forEach((colL) => {
      ws.getCell(`${colL}${rIdx}`).font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF6B7280' } };
      ws.getCell(`${colL}${rIdx}`).border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    });
  } else {
    topGenres.forEach((g, idx) => {
      const rIdx = 33 + idx;
      const row = ws.getRow(rIdx);
      row.height = 20;

      const pct = totalGenreSum > 0 ? g.count / totalGenreSum : 0;

      ws.mergeCells(`J${rIdx}:L${rIdx}`);
      const cName = ws.getCell(`J${rIdx}`);
      cName.value = g.name;
      cName.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1F2937' } };
      cName.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      ws.mergeCells(`M${rIdx}:N${rIdx}`);
      const cCount = ws.getCell(`M${rIdx}`);
      cCount.value = g.count;
      cCount.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1F2937' } };
      cCount.alignment = { vertical: 'middle', horizontal: 'center' };

      ws.mergeCells(`O${rIdx}:P${rIdx}`);
      const cPct = ws.getCell(`O${rIdx}`);
      cPct.value = pct;
      cPct.numFmt = '0.0%';
      cPct.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF4B5563' } };
      cPct.alignment = { vertical: 'middle', horizontal: 'center' };

      const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB';
      [cName, cCount, cPct].forEach((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });
  }

  // Spacer row 51
  ws.getRow(51).height = 20;

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 4: SUPPORTING DATA MATRICES (SOURCE FOR CHARTS)
  // ═════════════════════════════════════════════════════════════════════
  ws.mergeCells('B52:P52');
  const sec4 = ws.getCell('B52');
  sec4.value = '4. SUPPORTING DATA MATRICES (SOURCE FOR NATIVE EXCEL VISUALIZATIONS)';
  sec4.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF3D3560' } };
  sec4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBE6F7' } };
  sec4.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sec4.border = {
    top: { style: 'thin', color: { argb: 'FFD8CEF6' } },
    bottom: { style: 'thin', color: { argb: 'FFD8CEF6' } },
  };
  ws.getRow(52).height = 22;

  ws.mergeCells('B53:P53');
  const sec4Sub = ws.getCell('B53');
  sec4Sub.value = 'Clean data tables dynamically linked to chart series above (reorganized hierarchically)';
  sec4Sub.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  sec4Sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
  sec4Sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(53).height = 18;

  // Spacer row 54
  ws.getRow(54).height = 10;

  // ── ROW 1 OF MATRICES: SCORE MATRIX (B-E) & WATCH STATUS MATRIX (H-L) ──
  // Table A: Score Distribution Data (Cols B-E, Rows 55-65)
  ws.mergeCells('B55:C55');
  const scHead1 = ws.getCell('B55');
  scHead1.value = 'Score Rating';
  scHead1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  scHead1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  scHead1.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.mergeCells('D55:E55');
  const scHead2 = ws.getCell('D55');
  scHead2.value = 'Anime Count';
  scHead2.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  scHead2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  scHead2.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getRow(55).height = 22;

  const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  scores.forEach((s, idx) => {
    const rIdx = 56 + idx;
    const count = stats.scoreChartData.find((d) => d.scoreNum === s)?.count || 0;

    ws.mergeCells(`B${rIdx}:C${rIdx}`);
    const c1 = ws.getCell(`B${rIdx}`);
    c1.value = `${s}★`;
    c1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFD97706' } };
    c1.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells(`D${rIdx}:E${rIdx}`);
    const c2 = ws.getCell(`D${rIdx}`);
    c2.value = count;
    c2.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1F2937' } };
    c2.alignment = { vertical: 'middle', horizontal: 'center' };

    const bg = idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
    [c1, c2].forEach((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      c.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
    ws.getRow(rIdx).height = 20;
  });

  // Table B: Watch Status Distribution Data (Cols H-L, Rows 55-60)
  ws.mergeCells('H55:J55');
  const stHead1 = ws.getCell('H55');
  stHead1.value = 'Watch Status';
  stHead1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  stHead1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  stHead1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells('K55:L55');
  const stHead2 = ws.getCell('K55');
  stHead2.value = 'Anime Count';
  stHead2.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  stHead2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  stHead2.alignment = { vertical: 'middle', horizontal: 'center' };

  const statusEntries = [
    { label: 'Completed', count: stats.completedCount },
    { label: 'Watching', count: stats.watchingCount },
    { label: 'Plan to Watch', count: stats.ptwCount },
    { label: 'On Hold', count: stats.onHoldCount },
    { label: 'Dropped', count: stats.droppedCount },
  ];

  statusEntries.forEach((st, idx) => {
    const rIdx = 56 + idx;

    ws.mergeCells(`H${rIdx}:J${rIdx}`);
    const c1 = ws.getCell(`H${rIdx}`);
    c1.value = st.label;
    c1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1F2937' } };
    c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    ws.mergeCells(`K${rIdx}:L${rIdx}`);
    const c2 = ws.getCell(`K${rIdx}`);
    c2.value = st.count;
    c2.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1F2937' } };
    c2.alignment = { vertical: 'middle', horizontal: 'center' };

    const bg = idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
    [c1, c2].forEach((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      c.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  // Spacer row 66
  ws.getRow(66).height = 14;

  // ── ROW 2 OF MATRICES: EPISODES MATRIX (Cols B-E, Rows 67-69) ──
  // STRICTLY MOVED BELOW Table A and Table B as requested
  const totalAvailableEpisodes = items.reduce((sum, it) => {
    const ep = Number(it.node?.num_episodes);
    return sum + (ep > 0 ? ep : 0);
  }, 0);

  ws.mergeCells('B67:C67');
  const epHead1 = ws.getCell('B67');
  epHead1.value = 'Episode Metric';
  epHead1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  epHead1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  epHead1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  ws.mergeCells('D67:E67');
  const epHead2 = ws.getCell('D67');
  epHead2.value = 'Episodes';
  epHead2.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  epHead2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56499E' } };
  epHead2.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getRow(67).height = 22;

  const episodeRows = [
    { label: 'Episodes Watched', count: stats.totalEpisodesWatched },
    { label: 'Total Episodes', count: Math.max(stats.totalEpisodesWatched, totalAvailableEpisodes) },
  ];

  episodeRows.forEach((ep, idx) => {
    const rIdx = 68 + idx;

    ws.mergeCells(`B${rIdx}:C${rIdx}`);
    const c1 = ws.getCell(`B${rIdx}`);
    c1.value = ep.label;
    c1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1F2937' } };
    c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    ws.mergeCells(`D${rIdx}:E${rIdx}`);
    const c2 = ws.getCell(`D${rIdx}`);
    c2.value = ep.count;
    c2.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1F2937' } };
    c2.alignment = { vertical: 'middle', horizontal: 'center' };

    const bg = idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
    [c1, c2].forEach((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      c.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
    ws.getRow(rIdx).height = 20;
  });
}

/**
 * OpenXML Bar/Column Chart XML Generator
 */
function makeOpenXmlBarChart(opts: {
  title: string;
  seriesName: string;
  xTitle?: string;
  yTitle?: string;
  catRef: string;
  catValues: (string | number)[];
  valRef: string;
  valValues: number[];
  colorHex?: string;
}): string {
  const catItems = opts.catValues.length > 0 ? opts.catValues : ['No Data'];
  const valItems = opts.valValues.length > 0 ? opts.valValues : [0];
  const barColor = opts.colorHex || '56499E';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr b="1" sz="1100"/></a:pPr><a:r><a:rPr b="1" sz="1100"/><a:t>${opts.title}</a:t></a:r></a:p>
        </c:rich>
      </c:tx>
      <c:layout/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>${opts.seriesName}</c:v></c:tx>
          <c:spPr>
            <a:solidFill><a:srgbClr val="${barColor}"/></a:solidFill>
            <a:ln w="9525"><a:solidFill><a:srgbClr val="3D3560"/></a:solidFill></a:ln>
          </c:spPr>
          <c:cat>
            <c:strRef>
              <c:f>${opts.catRef}</c:f>
              <c:strCache>
                <c:ptCount val="${catItems.length}"/>
                ${catItems.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}
              </c:strCache>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:f>${opts.valRef}</c:f>
              <c:numCache>
                <c:formatCode>General</c:formatCode>
                <c:ptCount val="${valItems.length}"/>
                ${valItems.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}
              </c:numCache>
            </c:numRef>
          </c:val>
        </c:ser>
        <c:gapWidth val="120"/>
        <c:axId val="10001"/>
        <c:axId val="10002"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="10001"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        ${opts.xTitle ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${opts.xTitle}</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>` : ''}
        <c:tickMarkSkip val="1"/>
        <c:lblSkip val="1"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="10002"/>
        <c:crosses val="autoZero"/>
        <c:auto val="0"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="10002"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        ${opts.yTitle ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${opts.yTitle}</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>` : ''}
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="10001"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="tr"/><c:layout/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
  <c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>
</c:chartSpace>`;
}

/**
 * OpenXML Doughnut/Pie Chart XML Generator
 */
function makeOpenXmlDoughnutChart(opts: {
  title: string;
  seriesName: string;
  catRef: string;
  catValues: (string | number)[];
  valRef: string;
  valValues: number[];
}): string {
  const catItems = opts.catValues.length > 0 ? opts.catValues : ['No Data'];
  const valItems = opts.valValues.length > 0 ? opts.valValues : [1];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr b="1" sz="1100"/></a:pPr><a:r><a:rPr b="1" sz="1100"/><a:t>${opts.title}</a:t></a:r></a:p>
        </c:rich>
      </c:tx>
      <c:layout/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:doughnutChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>${opts.seriesName}</c:v></c:tx>
          <c:cat>
            <c:strRef>
              <c:f>${opts.catRef}</c:f>
              <c:strCache>
                <c:ptCount val="${catItems.length}"/>
                ${catItems.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}
              </c:strCache>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:f>${opts.valRef}</c:f>
              <c:numCache>
                <c:formatCode>General</c:formatCode>
                <c:ptCount val="${valItems.length}"/>
                ${valItems.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}
              </c:numCache>
            </c:numRef>
          </c:val>
        </c:ser>
        <c:holeSize val="55"/>
      </c:doughnutChart>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/><c:layout/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
  <c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>
</c:chartSpace>`;
}

/**
 * Injects genuine OpenXML charts and drawings into the .xlsx zip container for 📊 Statistics
 */
async function injectNativeExcelCharts(
  baseBuffer: ArrayBuffer,
  stats: ReturnType<typeof computeAnimeStats>,
  items: MalListItem[]
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(baseBuffer);

  // 1. Identify which sheet XML file corresponds to 📊 Statistics
  const wbXml = await zip.file('xl/workbook.xml')?.async('text');
  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text');

  if (!wbXml || !wbRelsXml) {
    console.warn('Could not read workbook structure for chart injection');
    return baseBuffer;
  }

  const sheetMatch = wbXml.match(/<sheet[^>]+name="📊 Statistics"[^>]+r:id="([^"]+)"/);
  if (!sheetMatch) {
    console.warn('Statistics worksheet not found in workbook manifest');
    return baseBuffer;
  }

  const rId = sheetMatch[1];
  const relMatch = wbRelsXml.match(new RegExp(`<Relationship[^>]+Id="${rId}"[^>]+Target="([^"]+)"`));
  if (!relMatch) {
    console.warn('Relationship target for Statistics sheet not found');
    return baseBuffer;
  }

  const sheetTarget = relMatch[1]; // e.g. "worksheets/sheet3.xml"
  const sheetFilePath = 'xl/' + sheetTarget;
  const sheetFileName = sheetTarget.split('/').pop();

  let sheetXml = await zip.file(sheetFilePath)?.async('text');
  if (!sheetXml) return baseBuffer;

  // 2. Attach drawing relationship to the Statistics sheet XML
  // In OpenXML, <drawing r:id="rIdDrawing1"/> must be placed immediately before </worksheet>
  if (!sheetXml.includes('<drawing')) {
    sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rIdDrawing1"/></worksheet>');
    zip.file(sheetFilePath, sheetXml);
  }

  // 3. Create or update sheet rels file
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFileName}.rels`;
  const sheetRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
  zip.file(sheetRelsPath, sheetRelsXml);

  // 4. Create drawing1.xml containing twoCellAnchor frames for the 3 charts:
  // - Chart 1: Score Distribution (Cols B to H, Rows 11 to 28) -> col 1 to 8, row 10 to 28
  // - Chart 2: Watch Status Distribution (Cols J to P, Rows 11 to 28) -> col 9 to 16, row 10 to 28
  // - Chart 3: Top Genres Distribution (Cols B to I, Rows 32 to 50) -> col 1 to 8, row 31 to 50
  const chartAnchors = [
    { id: 1, colFrom: 1, rowFrom: 10, colTo: 8, rowTo: 28 },
    { id: 2, colFrom: 9, rowFrom: 10, colTo: 16, rowTo: 28 },
    { id: 3, colFrom: 1, rowFrom: 31, colTo: 8, rowTo: 50 },
  ];

  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${chartAnchors.map((a) => `  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${a.colFrom}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.rowFrom}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${a.colTo}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.rowTo}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr><xdr:cNvPr id="${a.id + 1}" name="Chart ${a.id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${a.id}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`).join('\n')}
</xdr:wsDr>`;
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  // 5. Create drawing rels connecting drawing1 to chart1..chart3
  const drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart3.xml"/>
</Relationships>`;
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml);

  // 6. Build Chart 1: Score Distribution (Column Chart)
  // Data source: Table A in Rows 56 to 65 (Cols B & D)
  const scoreCatValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => `${s}★`);
  const scoreValValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
    (s) => stats.scoreChartData.find((d) => d.scoreNum === s)?.count || 0
  );
  zip.file('xl/charts/chart1.xml', makeOpenXmlBarChart({
    title: 'Score Rating Distribution (1★ - 10★)',
    seriesName: 'Anime Count',
    yTitle: 'Number of Anime',
    catRef: "'📊 Statistics'!$B$56:$B$65",
    catValues: scoreCatValues,
    valRef: "'📊 Statistics'!$D$56:$D$65",
    valValues: scoreValValues,
    colorHex: '56499E',
  }));

  // 7. Build Chart 2: Watch Status Distribution (Column Chart)
  // Data source: Table B in Rows 56 to 60 (Cols H & K)
  const statusLabels = ['Completed', 'Watching', 'Plan to Watch', 'On Hold', 'Dropped'];
  const statusCounts = [
    stats.completedCount,
    stats.watchingCount,
    stats.ptwCount,
    stats.onHoldCount,
    stats.droppedCount,
  ];
  zip.file('xl/charts/chart2.xml', makeOpenXmlBarChart({
    title: 'Watch Status Distribution',
    seriesName: 'Anime Count',
    yTitle: 'Number of Anime',
    catRef: "'📊 Statistics'!$H$56:$H$60",
    catValues: statusLabels,
    valRef: "'📊 Statistics'!$K$56:$K$60",
    valValues: statusCounts,
    colorHex: '7567C7',
  }));

  // 8. Build Chart 3: Genre Distribution (Doughnut Chart)
  // Data source: Genre Breakdown Table in Rows 33 to lastGenreRow (Cols J & M)
  const topGenres = (stats.genreChartData || []).slice(0, 14);
  const genreLabels = topGenres.length > 0 ? topGenres.map((g) => g.name) : ['No Genres'];
  const genreCounts = topGenres.length > 0 ? topGenres.map((g) => g.count) : [0];
  const lastGenreRow = Math.max(33, 32 + (topGenres.length || 1));

  zip.file('xl/charts/chart3.xml', makeOpenXmlDoughnutChart({
    title: 'Top Genres Distribution',
    seriesName: 'Anime Count',
    catRef: `'📊 Statistics'!$J$33:$J$${lastGenreRow}`,
    catValues: genreLabels,
    valRef: `'📊 Statistics'!$M$33:$M$${lastGenreRow}`,
    valValues: genreCounts,
  }));

  // 9. Register drawing & chart parts in [Content_Types].xml
  let ctXml = await zip.file('[Content_Types].xml')?.async('text');
  if (ctXml) {
    const ctOverrides = [
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>',
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
      '<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
      '<Override PartName="/xl/charts/chart3.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
    ].join('');
    if (!ctXml.includes('drawing1.xml')) {
      ctXml = ctXml.replace('</Types>', `${ctOverrides}</Types>`);
      zip.file('[Content_Types].xml', ctXml);
    }
  }

  // Generate the final package
  const finalZipBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return finalZipBuffer;
}

/**
 * Triggers client-side download of a generated file buffer
 */
export function triggerExcelDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Master Export function: Orchestrates the creation of the complete .xlsx workbook
 */
export async function exportAniVerseToExcel(options: ExportAniVerseOptions): Promise<{ filename: string; size: number }> {
  const { mode, year, season, malList, seasonAnimeList, customUserNotes = {} } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AniVerse';
  workbook.lastModifiedBy = options.malUser?.name || 'AniVerse User';
  workbook.created = new Date();
  workbook.modified = new Date();

  const seasonTitle = `${capitalize(season)} ${year}`;

  // 1. Current Season Export
  if (mode === 'season') {
    const seasonStats = computeAnimeStats(seasonAnimeList);

    // Sheet 1: ✨ Welcome
    buildWelcomeSheet(workbook, options, seasonStats, seasonTitle, false);

    // Sheet 2: 📺 Anime List
    buildAnimeListSheet(workbook, '📺 Anime List', seasonAnimeList, customUserNotes, false);

    // Sheet 3: 📊 Statistics (visual analytics dashboard)
    buildStatisticsSheet(workbook, seasonStats, seasonTitle, seasonAnimeList);
  }
  // 2. All Anime Export (Entire MAL List)
  else if (mode === 'all') {
    const allStats = computeAnimeStats(malList);

    // Sheet 1: ✨ Welcome
    buildWelcomeSheet(workbook, options, allStats, 'Lifetime Archive', true);

    // Sheet 2: 📺 Anime List (Complete catalogue)
    buildAnimeListSheet(workbook, '📺 Anime List', malList, customUserNotes, true);

    // Sheet 3: 📊 Statistics
    buildStatisticsSheet(workbook, allStats, 'Complete Lifetime Archive', malList);
  }
  // 3. Full AniVerse Report (Season Dashboard + Season Anime List + Statistics + 📚 All Anime)
  else if (mode === 'full') {
    const seasonStats = computeAnimeStats(seasonAnimeList);

    // Sheet 1: ✨ Welcome
    buildWelcomeSheet(workbook, options, seasonStats, seasonTitle, false);

    // Sheet 2: 📺 Anime List (Current season)
    buildAnimeListSheet(workbook, '📺 Anime List', seasonAnimeList, customUserNotes, false);

    // Sheet 3: 📊 Statistics (Current season)
    buildStatisticsSheet(workbook, seasonStats, seasonTitle, seasonAnimeList);

    // Sheet 4: 📚 All Anime (Unfiltered MAL Lifetime Archive)
    buildAnimeListSheet(workbook, '📚 All Anime', malList, customUserNotes, true);
  }

  const filename = generateExportFilename(mode, season, year);
  const baseBuffer = await workbook.xlsx.writeBuffer();

  // Inject real native Excel charts into 📊 Statistics sheet
  const activeStats = (mode === 'all')
    ? computeAnimeStats(malList)
    : computeAnimeStats(seasonAnimeList);
  const activeItems = (mode === 'all') ? malList : seasonAnimeList;

  const finalBuffer = await injectNativeExcelCharts(baseBuffer as ArrayBuffer, activeStats, activeItems);
  triggerExcelDownload(finalBuffer, filename);

  return { filename, size: finalBuffer.byteLength };
}
