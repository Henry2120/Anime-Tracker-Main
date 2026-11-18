import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/dexie';
import { mergeOrDetectConflict, resolveConflict } from '../src/sync/syncEngine';

describe('Offline sync field-level merge & conflict preservation', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('auto-merges independent non-overlapping field changes without conflict', () => {
    const { merged, conflictingFields } = mergeOrDetectConflict({
      entityType: 'works',
      entityId: 'w-1',
      localRecord: {
        id: 'w-1',
        title: 'Local Title Fix',
        genres: ['Classic'],
        version: 2,
      },
      remoteRecord: {
        id: 'w-1',
        title: 'Original Title',
        genres: ['Classic', 'Philosophy'],
        version: 2,
      },
      localChangedFields: ['title'],
      remoteChangedFields: ['genres'],
    });

    expect(conflictingFields).toEqual([]);
    expect(merged.title).toBe('Local Title Fix');
    expect(merged.genres).toEqual(['Classic', 'Philosophy']);
    expect(merged.version).toBe(3);
  });

  it('flags overlapping edits and resolves via keep_local / merged without data loss', async () => {
    const { conflictingFields } = mergeOrDetectConflict({
      entityType: 'reading_progress',
      entityId: 'p-1',
      localRecord: { id: 'p-1', currentPage: 90, totalPages: 300, version: 2 },
      remoteRecord: { id: 'p-1', currentPage: 150, totalPages: 300, version: 3 },
      localChangedFields: ['currentPage'],
      remoteChangedFields: ['currentPage'],
    });
    expect(conflictingFields).toEqual(['currentPage']);

    await db.sync_conflicts.put({
      id: 'c-1',
      entityType: 'reading_progress',
      entityId: 'p-1',
      entityLabel: 'Test Book Progress',
      localSnapshot: { id: 'p-1', currentPage: 90, totalPages: 300, version: 2 },
      remoteSnapshot: { id: 'p-1', currentPage: 150, totalPages: 300, version: 3 },
      conflictingFields: ['currentPage'],
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
    });

    await resolveConflict({
      conflictId: 'c-1',
      resolution: 'keep_local',
    });

    const updatedProgress = await db.reading_progress.get('p-1');
    expect(updatedProgress?.currentPage).toBe(90);
    const conflict = await db.sync_conflicts.get('c-1');
    expect(conflict?.resolution).toBe('keep_local');
    expect(conflict?.resolvedAt).toBeTruthy();
  });
});
