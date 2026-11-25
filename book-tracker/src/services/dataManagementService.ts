import { db, ensureAppSettings } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import { clearMetadataLookupCache } from './metadataService';

export type DeleteScope = 'local_only' | 'cloud_only' | 'both';

export interface LocalDeleteResult {
  ok: boolean;
  clearedTables: string[];
  error?: string;
}

export interface CloudDeleteResult {
  ok: boolean;
  deletedTables: string[];
  deletedStorageObjects: number;
  failedTargets: string[];
  error?: string;
}

export interface BothDeleteResult {
  ok: boolean;
  partialFailure: boolean;
  local: LocalDeleteResult;
  cloud: CloudDeleteResult;
}

const BOOK_TRACKER_CLOUD_TABLES = [
  'sync_conflicts',
  'sync_changes',
  'sync_tombstones',
  'processed_sync_ops',
  'backup_records',
  'metadata_records',
  'devices',
  'journal_entries',
  'reviews',
  'reading_cycles',
  'shelf_items',
  'physical_copies',
  'shelves',
  'edition_isbns',
  'editions',
  'works',
] as const;

const BOOK_TRACKER_STORAGE_BUCKETS = ['book-covers', 'book-backups'] as const;

/**
 * Clears all local Book Tracker IndexedDB stores and Book Tracker lookup caches,
 * re-seeding clean Book Tracker settings without touching Anime Tracker / MAL / theme localStorage.
 */
export async function deleteLocalBookTrackerData(): Promise<LocalDeleteResult> {
  const clearedTables: string[] = [];
  try {
    const tables = [
      db.works,
      db.editions,
      db.edition_isbns,
      db.physical_copies,
      db.shelves,
      db.shelf_items,
      db.reading_cycles,
      db.reviews,
      db.journal_entries,
      db.metadata_records,
      db.cover_assets,
      db.sync_operations,
      db.sync_conflicts,
      db.devices,
      db.backup_records,
      db.app_settings,
    ];

    await db.transaction('rw', tables, async () => {
      for (const tbl of tables) {
        await tbl.clear();
        clearedTables.push(tbl.name);
      }
    });

    clearMetadataLookupCache();
    if (typeof localStorage !== 'undefined') {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('book_tracker_')) {
          localStorage.removeItem(key);
        }
      }
      localStorage.removeItem('book_tracker_cloud_wiped');
    }
    await ensureAppSettings();

    return { ok: true, clearedTables };
  } catch (err) {
    return {
      ok: false,
      clearedTables,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function emptyUserBucketPrefix(
  bucket: string,
  userId: string
): Promise<{ deletedCount: number; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { deletedCount: 0, error: 'Supabase not configured.' };

  let deletedCount = 0;
  try {
    let offset = 0;
    while (true) {
      const { data: items, error: listErr } = await supabase.storage
        .from(bucket)
        .list(userId, { limit: 100, offset });
      if (listErr) {
        return { deletedCount, error: `${bucket}: ${listErr.message}` };
      }
      if (!items || items.length === 0) break;

      const filePaths = items
        .filter((item) => item.name)
        .map((item) => `${userId}/${item.name}`);

      if (filePaths.length === 0) break;

      const { error: rmErr } = await supabase.storage.from(bucket).remove(filePaths);
      if (rmErr) {
        return { deletedCount, error: `${bucket}: ${rmErr.message}` };
      }
      deletedCount += filePaths.length;

      if (items.length < 100) break;
      // Since deleted items shift remaining list indices, keep offset at 0 cleanly
      offset = 0;
    }
    return { deletedCount };
  } catch (err) {
    return {
      deletedCount,
      error: `${bucket}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Deletes only the authenticated user's Book Tracker database rows & storage files
 * in Supabase, resetting local sync state and pausing auto-sync so local books
 * are not silently re-uploaded.
 */
export async function deleteCloudBookTrackerData(): Promise<CloudDeleteResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      deletedTables: [],
      deletedStorageObjects: 0,
      failedTargets: ['supabase'],
      error: 'Supabase cloud storage is not configured in this environment.',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      deletedTables: [],
      deletedStorageObjects: 0,
      failedTargets: ['network'],
      error: 'Cannot delete cloud data while offline. Connect to the internet and retry.',
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      deletedTables: [],
      deletedStorageObjects: 0,
      failedTargets: ['auth'],
      error: 'You must be signed in to delete your cloud Book Tracker data.',
    };
  }

  const deletedTables: string[] = [];
  const failedTargets: string[] = [];
  const errors: string[] = [];
  let deletedStorageObjects = 0;

  for (const bucket of BOOK_TRACKER_STORAGE_BUCKETS) {
    const res = await emptyUserBucketPrefix(bucket, user.id);
    deletedStorageObjects += res.deletedCount;
    if (res.error) {
      failedTargets.push(`storage:${bucket}`);
      errors.push(res.error);
    }
  }

  for (const table of BOOK_TRACKER_CLOUD_TABLES) {
    try {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id);
      if (error) {
        failedTargets.push(table);
        errors.push(`${table}: ${error.message}`);
      } else {
        deletedTables.push(table);
      }
    } catch (err) {
      failedTargets.push(table);
      errors.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const ok = failedTargets.length === 0;
  if (ok) {
    const settings = await ensureAppSettings();
    await db.transaction('rw', [db.sync_operations, db.sync_conflicts, db.app_settings], async () => {
      await db.sync_operations.clear();
      await db.sync_conflicts.clear();
      await db.app_settings.put({
        ...settings,
        lastSyncedSeq: 0,
        lastSyncedAt: null,
        cloudSyncPausedAfterWipe: true,
      });
    });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('book_tracker_cloud_wiped', '1');
    }
  }

  return {
    ok,
    deletedTables,
    deletedStorageObjects,
    failedTargets,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

/**
 * Deletes both cloud and local Book Tracker data independently and reports
 * partial failure details if either target cannot be cleared.
 */
export async function deleteBothBookTrackerData(): Promise<BothDeleteResult> {
  const cloud = await deleteCloudBookTrackerData();
  const local = await deleteLocalBookTrackerData();

  if (cloud.ok && local.ok && typeof localStorage !== 'undefined') {
    // Both wiped cleanly — no local data remains to upload, so pause guard can stay clear
    localStorage.removeItem('book_tracker_cloud_wiped');
    const settings = await ensureAppSettings();
    if (settings.cloudSyncPausedAfterWipe) {
      await db.app_settings.put({ ...settings, cloudSyncPausedAfterWipe: false });
    }
  }

  return {
    ok: cloud.ok && local.ok,
    partialFailure: cloud.ok !== local.ok,
    local,
    cloud,
  };
}
