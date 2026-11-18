import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/dexie';
import {
  applyBackupRestore,
  exportCollectionCsv,
  exportFullBackupJson,
  previewBackupImport,
} from '../src/services/backupService';
import { createBookBundle, saveJournalEntry } from '../src/services/libraryService';

describe('Lossless JSON backup, CSV exports, duplicate detection & restore', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('exports full lossless JSON, detects duplicates, and restores cleanly after wipe', async () => {
    const { work, edition, cycle } = await createBookBundle({
      work: { title: 'Số Đỏ', authors: ['Vũ Trọng Phụng'], genres: ['Satire'] },
      edition: { title: 'Số Đỏ (Ấn bản kỷ niệm)', language: 'vi', format: 'hardcover', pageCount: 240 },
      isbnInput: '9791090636071', // 979 ISBN must preserve isbn10 === null
      copy: {
        ownershipStatus: 'owned',
        format: 'hardcover',
        condition: 'new',
        acquisitionMethod: 'purchased',
        purchasePrice: 150000,
        currency: 'VND',
      },
      initialReadingStatus: 'currently_reading',
    });

    await saveJournalEntry({
      workId: work.id,
      editionId: edition.id,
      cycleId: cycle!.id,
      entryType: 'quote',
      quoteText: 'Xuân Tóc Đỏ',
      content: 'Classic quote',
      pageNumber: 42,
      hasSpoilers: false,
    });

    const { json } = await exportFullBackupJson();
    const csvRes = await exportCollectionCsv();
    expect(csvRes.csv.startsWith('\uFEFF')).toBe(true);
    expect(csvRes.csv).toContain('9791090636071');
    expect(csvRes.csv).toContain('150000');

    // Preview while data still exists -> detects duplicates
    const dupPreview = await previewBackupImport(json);
    expect(dupPreview.duplicateWorkCount).toBe(1);
    expect(dupPreview.duplicateIsbnCount).toBe(1);

    // Wipe DB and restore
    await Promise.all(db.tables.map((t) => t.clear()));
    const cleanPreview = await previewBackupImport(json);
    expect(cleanPreview.newWorkCount).toBe(1);

    const res = await applyBackupRestore(cleanPreview, 'replace_all');
    expect(res.importedRecords).toBeGreaterThanOrEqual(5);

    const restoredWork = await db.works.get(work.id);
    expect(restoredWork?.title).toBe('Số Đỏ');
    const restoredIsbn = await db.edition_isbns.where('editionId').equals(edition.id).first();
    expect(restoredIsbn?.isbn13).toBe('9791090636071');
    expect(restoredIsbn?.isbn10).toBeNull();
  });
});
