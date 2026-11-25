import { z } from 'zod';
import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type {
  BackupRecord,
  Edition,
  EditionIsbn,
  JournalEntry,
  PhysicalCopy,
  Review,
  Work,
} from '../types/domain';

export const BackupTablesSchema = z.object({
  works: z.array(z.record(z.unknown())).default([]),
  editions: z.array(z.record(z.unknown())).default([]),
  edition_isbns: z.array(z.record(z.unknown())).default([]),
  physical_copies: z.array(z.record(z.unknown())).default([]),
  shelves: z.array(z.record(z.unknown())).default([]),
  shelf_items: z.array(z.record(z.unknown())).default([]),
  reading_cycles: z.array(z.record(z.unknown())).default([]),
  reviews: z.array(z.record(z.unknown())).default([]),
  journal_entries: z.array(z.record(z.unknown())).default([]),
  // Tolerate legacy fields from older backup files during import (ignored cleanly on restore)
  loans: z.array(z.record(z.unknown())).optional(),
  reading_progress: z.array(z.record(z.unknown())).optional(),
  reading_sessions: z.array(z.record(z.unknown())).optional(),
});

export const FullBackupSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.string().default('AniVerse Book Tracker'),
  exportedAt: z.string(),
  tables: BackupTablesSchema,
  coverManifest: z
    .array(
      z.object({
        editionId: z.string(),
        storagePath: z.string().optional(),
        mimeType: z.string(),
        byteSize: z.number(),
      })
    )
    .default([]),
});

export type FullBackupPayload = z.infer<typeof FullBackupSchema>;

export interface ImportPreviewSummary {
  payload: FullBackupPayload;
  counts: Record<string, number>;
  duplicateWorkCount: number;
  duplicateIsbnCount: number;
  newWorkCount: number;
}

export async function exportFullBackupJson(): Promise<{
  filename: string;
  json: string;
  record: BackupRecord;
}> {
  const [
    works,
    editions,
    edition_isbns,
    physical_copies,
    shelves,
    shelf_items,
    reading_cycles,
    reviews,
    journal_entries,
    coverAssets,
  ] = await Promise.all([
    db.works.toArray(),
    db.editions.toArray(),
    db.edition_isbns.toArray(),
    db.physical_copies.toArray(),
    db.shelves.toArray(),
    db.shelf_items.toArray(),
    db.reading_cycles.toArray(),
    db.reviews.toArray(),
    db.journal_entries.toArray(),
    db.cover_assets.toArray(),
  ]);

  const tables = {
    works,
    editions,
    edition_isbns,
    physical_copies,
    shelves,
    shelf_items,
    reading_cycles,
    reviews,
    journal_entries,
  };

  const payload: FullBackupPayload = {
    schemaVersion: 1,
    app: 'AniVerse Book Tracker',
    exportedAt: new Date().toISOString(),
    tables: tables as unknown as FullBackupPayload['tables'],
    coverManifest: coverAssets.map((c) => ({
      editionId: c.editionId,
      storagePath: c.storagePath,
      mimeType: c.mimeType,
      byteSize: c.byteSize,
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `aniverse-book-tracker-backup-${stamp}.json`;

  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(tables)) {
    counts[k] = v.length;
  }

  const record: BackupRecord = {
    id: createUuid(),
    backupType: 'json_full',
    filename,
    entityCounts: counts,
    includesCoverManifest: true,
    byteSize: new Blob([json]).size,
    createdAt: new Date().toISOString(),
    notes: 'Full lossless local JSON backup (DB rows + cover asset manifest)',
  };
  await db.backup_records.put(record);
  return { filename, json, record };
}

export async function previewBackupImport(rawJsonText: string): Promise<ImportPreviewSummary> {
  const parsedRaw = JSON.parse(rawJsonText);
  const payload = FullBackupSchema.parse(parsedRaw);

  const existingWorkIds = new Set((await db.works.toArray()).map((w) => w.id));
  const existingIsbn13s = new Set(
    (await db.edition_isbns.toArray())
      .filter((i) => !i.deletedAt)
      .map((i) => i.isbn13)
  );

  let duplicateWorkCount = 0;
  let newWorkCount = 0;
  for (const w of payload.tables.works) {
    if (existingWorkIds.has(String(w.id))) duplicateWorkCount++;
    else newWorkCount++;
  }

  let duplicateIsbnCount = 0;
  for (const isbnRow of payload.tables.edition_isbns) {
    if (existingIsbn13s.has(String(isbnRow.isbn13))) duplicateIsbnCount++;
  }

  const counts: Record<string, number> = {};
  for (const [k, arr] of Object.entries(payload.tables)) {
    if (k === 'loans' || k === 'reading_progress' || k === 'reading_sessions') continue;
    if (Array.isArray(arr)) counts[k] = arr.length;
  }

  return {
    payload,
    counts,
    duplicateWorkCount,
    duplicateIsbnCount,
    newWorkCount,
  };
}

export async function applyBackupRestore(
  preview: ImportPreviewSummary,
  mode: 'merge_keep_existing' | 'merge_overwrite_duplicates' | 'replace_all'
): Promise<{ importedRecords: number }> {
  const { tables } = preview.payload;
  const tableOrder = [
    'works',
    'editions',
    'edition_isbns',
    'shelves',
    'physical_copies',
    'shelf_items',
    'reading_cycles',
    'reviews',
    'journal_entries',
  ] as const;

  let importedRecords = 0;
  await db.transaction(
    'rw',
    tableOrder.map((name) => db.table(name)),
    async () => {
      if (mode === 'replace_all') {
        for (const name of tableOrder) {
          await db.table(name).clear();
        }
      }

      for (const name of tableOrder) {
        const tbl = db.table(name);
        const rows = tables[name] as Array<Record<string, unknown>>;
        for (const row of rows) {
          const id = String(row.id || createUuid());
          const normalized = { ...row, id };
          if (mode === 'merge_keep_existing') {
            const exists = await tbl.get(id);
            if (exists) continue;
          }
          await tbl.put(normalized);
          importedRecords++;
        }
      }
    }
  );

  return { importedRecords };
}

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvWithBom(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function exportCollectionCsv(): Promise<{ filename: string; csv: string }> {
  const [works, editions, isbns, copies] = await Promise.all([
    db.works.filter((w) => !w.deletedAt).toArray(),
    db.editions.filter((e) => !e.deletedAt).toArray(),
    db.edition_isbns.filter((i) => !i.deletedAt).toArray(),
    db.physical_copies.filter((c) => !c.deletedAt).toArray(),
  ]);

  const workMap = new Map<string, Work>(works.map((w) => [w.id, w]));
  const editionMap = new Map<string, Edition>(editions.map((e) => [e.id, e]));
  const isbnMap = new Map<string, EditionIsbn>();
  for (const i of isbns) {
    if (!isbnMap.has(i.editionId) || i.isPrimary) isbnMap.set(i.editionId, i);
  }

  const headers = [
    'Copy ID',
    'Title',
    'Original Title',
    'Authors',
    'Edition',
    'Translators',
    'Publishers',
    'Language',
    'Format',
    'ISBN-13',
    'ISBN-10',
    'Pages',
    'Ownership Status',
    'Condition',
    'Acquisition Method',
    'Purchase Date',
    'Purchase Price',
    'Currency',
    'Seller',
    'Shelf Location',
    'Notes',
  ];

  const rows: unknown[][] = [];
  if (copies.length > 0) {
    for (const c of copies as PhysicalCopy[]) {
      const ed = editionMap.get(c.editionId);
      const w = workMap.get(c.workId);
      const isbn = isbnMap.get(c.editionId);
      rows.push([
        c.id,
        ed?.title ?? w?.title ?? '',
        w?.originalTitle ?? '',
        (w?.authors ?? []).join('; '),
        ed?.editionName ?? ed?.translationTitle ?? '',
        (ed?.translators ?? []).join('; '),
        (ed?.publishers ?? []).join('; '),
        ed?.language ?? '',
        c.format,
        isbn?.isbn13 ?? '',
        isbn?.isbn10 ?? '',
        ed?.pageCount ?? '',
        c.ownershipStatus,
        c.condition,
        c.acquisitionMethod,
        c.purchaseDate ?? '',
        c.purchasePrice ?? '',
        c.currency,
        c.seller ?? '',
        c.shelfLocation ?? '',
        c.notes ?? '',
      ]);
    }
  }

  const csv = buildCsvWithBom(headers, rows);
  const filename = `aniverse-book-collection-${new Date().toISOString().slice(0, 10)}.csv`;
  await db.backup_records.put({
    id: createUuid(),
    backupType: 'csv_collection',
    filename,
    entityCounts: { physical_copies: rows.length },
    includesCoverManifest: false,
    byteSize: new Blob([csv]).size,
    createdAt: new Date().toISOString(),
  });
  return { filename, csv };
}

export async function exportJournalCsv(): Promise<{ filename: string; csv: string }> {
  const [works, reviews, entries] = await Promise.all([
    db.works.toArray(),
    db.reviews.filter((r) => !r.deletedAt).toArray(),
    db.journal_entries.filter((j) => !j.deletedAt).toArray(),
  ]);
  const workMap = new Map<string, Work>(works.map((w) => [w.id, w]));

  const headers = [
    'Record Kind',
    'Book Title',
    'Page',
    'Rating',
    'Title / Character',
    'Quote',
    'Content',
    'Spoiler',
    'Created At',
  ];

  const rows: unknown[][] = [
    ...(reviews as Review[]).map((r) => [
      'review',
      workMap.get(r.workId)?.title ?? '',
      '',
      r.rating ?? '',
      r.headline ?? '',
      '',
      r.body,
      r.hasSpoilers ? 'yes' : 'no',
      r.createdAt,
    ]),
    ...(entries as JournalEntry[]).map((j) => [
      j.entryType,
      workMap.get(j.workId)?.title ?? '',
      j.pageNumber ?? '',
      '',
      j.characterName ?? j.title ?? '',
      j.quoteText ?? '',
      j.content,
      j.hasSpoilers ? 'yes' : 'no',
      j.createdAt,
    ]),
  ];

  const csv = buildCsvWithBom(headers, rows);
  const filename = `aniverse-reading-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  await db.backup_records.put({
    id: createUuid(),
    backupType: 'csv_journal',
    filename,
    entityCounts: { reviews: reviews.length, journal_entries: entries.length },
    includesCoverManifest: false,
    byteSize: new Blob([csv]).size,
    createdAt: new Date().toISOString(),
  });
  return { filename, csv };
}

export async function triggerCloudBackupSnapshot(): Promise<BackupRecord | null> {
  const supabase = getSupabaseClient();
  if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    throw new Error('Online Supabase connection required for cloud snapshot.');
  }
  const { data, error } = await supabase.functions.invoke('backup-snapshot', { body: {} });
  if (error || !data?.record) {
    throw new Error(error?.message || 'Cloud snapshot failed');
  }
  const record: BackupRecord = {
    id: data.record.id,
    backupType: 'cloud_snapshot',
    filename: data.record.filename,
    entityCounts: data.record.entity_counts ?? {},
    includesCoverManifest: Boolean(data.record.includes_cover_manifest),
    byteSize: Number(data.record.byte_size ?? 0),
    createdAt: data.record.created_at ?? new Date().toISOString(),
    notes: data.record.notes,
  };
  await db.backup_records.put(record);
  return record;
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
