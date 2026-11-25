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
      entityType: 'reading_cycles',
      entityId: 'rc-1',
      localRecord: { id: 'rc-1', workId: 'w-1', editionId: 'e-1', status: 'finished', version: 2 },
      remoteRecord: { id: 'rc-1', workId: 'w-1', editionId: 'e-1', status: 'on_hold', version: 3 },
      localChangedFields: ['status'],
      remoteChangedFields: ['status'],
    });
    expect(conflictingFields).toEqual(['status']);

    await db.sync_conflicts.put({
      id: 'c-1',
      entityType: 'reading_cycles',
      entityId: 'rc-1',
      entityLabel: 'Test Book Reading Cycle',
      localSnapshot: {
        id: 'rc-1',
        workId: 'w-1',
        editionId: 'e-1',
        cycleNumber: 1,
        isActive: true,
        status: 'finished',
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        version: 2,
      },
      remoteSnapshot: {
        id: 'rc-1',
        workId: 'w-1',
        editionId: 'e-1',
        cycleNumber: 1,
        isActive: true,
        status: 'on_hold',
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        version: 3,
      },
      conflictingFields: ['status'],
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
    });

    await resolveConflict({
      conflictId: 'c-1',
      resolution: 'keep_local',
    });

    const updatedCycle = await db.reading_cycles.get('rc-1');
    expect(updatedCycle?.status).toBe('finished');
    const conflict = await db.sync_conflicts.get('c-1');
    expect(conflict?.resolution).toBe('keep_local');
    expect(conflict?.resolvedAt).toBeTruthy();
  });
});
