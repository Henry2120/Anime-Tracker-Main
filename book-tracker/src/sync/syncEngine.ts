import { createUuid, db, ensureAppSettings } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type {
  DeviceRecord,
  SyncConflict,
  SyncEntityType,
  SyncOperation,
} from '../types/domain';
import { uploadPendingCoversToSupabase } from '../services/covers';

const ENTITY_ORDER: SyncEntityType[] = [
  'works',
  'editions',
  'edition_isbns',
  'shelves',
  'physical_copies',
  'loans',
  'shelf_items',
  'reading_cycles',
  'reading_progress',
  'reading_sessions',
  'reviews',
  'journal_entries',
];

export interface SyncRunSummary {
  status: 'synced' | 'offline' | 'unconfigured' | 'unauthenticated' | 'conflicts' | 'error';
  pushedCount: number;
  pulledCount: number;
  conflictsCount: number;
  cursorReset: boolean;
  message?: string;
}

const META_FIELDS = new Set(['updatedAt', 'createdAt', 'version', 'userId']);

/**
 * Pure field-level merge detector.
 * - Independent fields edited on local vs remote auto-merge cleanly.
 * - Overlapping changed fields create a SyncConflict preserving both snapshots.
 */
export function mergeOrDetectConflict(params: {
  entityType: SyncEntityType;
  entityId: string;
  localRecord: Record<string, unknown>;
  remoteRecord: Record<string, unknown>;
  localChangedFields: string[];
  remoteChangedFields: string[];
}): {
  merged: Record<string, unknown>;
  conflictingFields: string[];
} {
  const localSet = new Set(params.localChangedFields.filter((f) => !META_FIELDS.has(f)));
  const remoteSet = new Set(params.remoteChangedFields.filter((f) => !META_FIELDS.has(f)));
  const conflictingFields: string[] = [];

  for (const field of localSet) {
    if (
      remoteSet.has(field) &&
      JSON.stringify(params.localRecord[field]) !== JSON.stringify(params.remoteRecord[field])
    ) {
      conflictingFields.push(field);
    }
  }

  const merged: Record<string, unknown> = { ...params.remoteRecord };
  for (const field of localSet) {
    if (!conflictingFields.includes(field)) {
      merged[field] = params.localRecord[field];
    }
  }
  merged.version = Math.max(
    Number(params.localRecord.version ?? 1),
    Number(params.remoteRecord.version ?? 1)
  ) + 1;
  merged.updatedAt = new Date().toISOString();

  return { merged, conflictingFields };
}

function sortOperationsByDependency(ops: SyncOperation[]): SyncOperation[] {
  const rank = new Map(ENTITY_ORDER.map((t, i) => [t, i]));
  return [...ops].sort((a, b) => {
    const rDiff = (rank.get(a.entityType) ?? 99) - (rank.get(b.entityType) ?? 99);
    if (rDiff !== 0) return rDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

async function applyRemoteChanges(
  changes: Array<{
    seq: number;
    entity_type: SyncEntityType;
    entity_id: string;
    operation: 'upsert' | 'delete';
    payload: Record<string, unknown>;
    changed_fields?: string[];
  }>
): Promise<{ applied: number; conflictsCreated: number }> {
  let applied = 0;
  let conflictsCreated = 0;

  for (const ch of changes) {
    if (!ENTITY_ORDER.includes(ch.entity_type)) continue;
    const table = db.table(ch.entity_type);
    const pendingLocalOp = await db.sync_operations
      .where('entityId')
      .equals(ch.entity_id)
      .filter((op) => op.status !== 'in_flight')
      .first();

    const localExisting = (await table.get(ch.entity_id)) as Record<string, unknown> | undefined;

    if (pendingLocalOp && localExisting) {
      const { merged, conflictingFields } = mergeOrDetectConflict({
        entityType: ch.entity_type,
        entityId: ch.entity_id,
        localRecord: localExisting,
        remoteRecord: ch.payload,
        localChangedFields: pendingLocalOp.changedFields,
        remoteChangedFields: ch.changed_fields ?? Object.keys(ch.payload),
      });

      if (conflictingFields.length > 0) {
        const label = String(
          localExisting.title ||
            ch.payload.title ||
            localExisting.name ||
            ch.entity_type
        );
        const conflict: SyncConflict = {
          id: createUuid(),
          entityType: ch.entity_type,
          entityId: ch.entity_id,
          entityLabel: label,
          localSnapshot: localExisting,
          remoteSnapshot: ch.payload,
          conflictingFields,
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
          resolution: null,
        };
        await db.sync_conflicts.put(conflict);
        conflictsCreated++;
        continue;
      }
      await table.put(merged);
      applied++;
      continue;
    }

    await table.put(ch.payload);
    applied++;
  }

  return { applied, conflictsCreated };
}

async function performFullResync(
  userId: string
): Promise<{ pulledCount: number; latestSeq: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { pulledCount: 0, latestSeq: 0 };

  let pulledCount = 0;
  for (const entityType of ENTITY_ORDER) {
    const { data, error } = await supabase
      .from(entityType)
      .select('*')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) {
      const table = db.table(entityType);
      for (const row of data) {
        await table.put(row);
        pulledCount++;
      }
    }
  }

  const { data: pullMeta } = await supabase.rpc('sync_pull_since', {
    p_since_seq: 0,
    p_limit: 1,
  });

  return {
    pulledCount,
    latestSeq: Number(pullMeta?.latest_seq ?? 0),
  };
}

export async function runSyncCycle(): Promise<SyncRunSummary> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      status: 'unconfigured',
      pushedCount: 0,
      pulledCount: 0,
      conflictsCount: 0,
      cursorReset: false,
      message: 'Supabase not configured — running safely in local-first IndexedDB mode.',
    };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'offline',
      pushedCount: 0,
      pulledCount: 0,
      conflictsCount: 0,
      cursorReset: false,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: 'unauthenticated',
      pushedCount: 0,
      pulledCount: 0,
      conflictsCount: 0,
      cursorReset: false,
    };
  }

  const settings = await ensureAppSettings();

  try {
    // Upload pending local cover images first
    await uploadPendingCoversToSupabase(user.id);

    const pendingOps = sortOperationsByDependency(
      await db.sync_operations.toArray()
    );

    const { data, error } = await supabase.functions.invoke('sync', {
      body: {
        deviceId: settings.deviceId,
        sinceSeq: settings.lastSyncedSeq,
        operations: pendingOps.map((op) => ({
          opId: op.opId,
          entityType: op.entityType,
          entityId: op.entityId,
          operation: op.operation,
          payload: op.payload,
          changedFields: op.changedFields,
          baseVersion: op.baseVersion,
        })),
      },
    });

    if (error) {
      for (const op of pendingOps) {
        await db.sync_operations.put({
          ...op,
          retryCount: op.retryCount + 1,
          lastError: error.message,
          status: 'failed',
        });
      }
      return {
        status: 'error',
        pushedCount: 0,
        pulledCount: 0,
        conflictsCount: 0,
        cursorReset: false,
        message: error.message,
      };
    }

    const ackedOpIds: string[] = Array.isArray(data?.ackedOpIds) ? data.ackedOpIds : [];
    for (const opId of ackedOpIds) {
      await db.sync_operations.delete(opId);
    }

    let conflictsCount = 0;
    if (Array.isArray(data?.conflicts)) {
      for (const c of data.conflicts) {
        const conflict: SyncConflict = {
          id: c.id ?? createUuid(),
          entityType: c.entity_type,
          entityId: c.entity_id,
          entityLabel: String(
            c.local_snapshot?.title || c.local_snapshot?.name || c.entity_type
          ),
          localSnapshot: c.local_snapshot,
          remoteSnapshot: c.remote_snapshot,
          conflictingFields: c.conflicting_fields ?? [],
          detectedAt: c.detected_at ?? new Date().toISOString(),
          resolvedAt: null,
          resolution: null,
        };
        await db.sync_conflicts.put(conflict);
        conflictsCount++;
      }
    }

    let pulledCount = 0;
    let cursorReset = false;
    let latestSeq = settings.lastSyncedSeq;

    if (data?.pull?.cursor_expired) {
      cursorReset = true;
      const resync = await performFullResync(user.id);
      pulledCount = resync.pulledCount;
      latestSeq = resync.latestSeq;
    } else if (Array.isArray(data?.pull?.changes)) {
      const appliedRes = await applyRemoteChanges(data.pull.changes);
      pulledCount = appliedRes.applied;
      conflictsCount += appliedRes.conflictsCreated;
      latestSeq = Number(data.pull.latest_seq ?? settings.lastSyncedSeq);
    }

    const now = new Date().toISOString();
    await db.app_settings.put({
      ...settings,
      userId: user.id,
      userEmail: user.email ?? null,
      lastSyncedSeq: latestSeq,
      lastSyncedAt: now,
    });

    const curDev = await db.devices.get(settings.deviceId);
    if (curDev) {
      await db.devices.put({
        ...curDev,
        lastSeenAt: now,
        lastSyncedSeq: latestSeq,
      });
    }

    const unresolvedTotal = await db.sync_conflicts
      .filter((c) => !c.resolvedAt)
      .count();

    return {
      status: unresolvedTotal > 0 ? 'conflicts' : 'synced',
      pushedCount: ackedOpIds.length,
      pulledCount,
      conflictsCount: unresolvedTotal,
      cursorReset,
    };
  } catch (err) {
    return {
      status: 'error',
      pushedCount: 0,
      pulledCount: 0,
      conflictsCount: 0,
      cursorReset: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function resolveConflict(params: {
  conflictId: string;
  resolution: 'keep_local' | 'keep_remote' | 'merged';
  mergedPayload?: Record<string, unknown>;
}): Promise<void> {
  const conflict = await db.sync_conflicts.get(params.conflictId);
  if (!conflict) return;

  const chosen =
    params.resolution === 'keep_local'
      ? { ...conflict.localSnapshot }
      : params.resolution === 'keep_remote'
        ? { ...conflict.remoteSnapshot }
        : { ...(params.mergedPayload ?? conflict.localSnapshot) };

  const baseVersion = Math.max(
    Number(conflict.localSnapshot.version ?? 1),
    Number(conflict.remoteSnapshot.version ?? 1)
  );
  const nextRecord: Record<string, unknown> = {
    ...chosen,
    version: baseVersion + 1,
    updatedAt: new Date().toISOString(),
  };

  const table = db.table(conflict.entityType);
  await db.transaction('rw', [table, db.sync_conflicts, db.sync_operations], async () => {
    await table.put(nextRecord);
    await db.sync_conflicts.put({
      ...conflict,
      resolvedAt: new Date().toISOString(),
      resolution: params.resolution,
    });
    if (params.resolution !== 'keep_remote') {
      await db.sync_operations.put({
        opId: createUuid(),
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        operation: 'upsert',
        payload: nextRecord,
        changedFields: conflict.conflictingFields,
        baseVersion,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
      });
    }
  });
}

export async function registerOrRefreshDevices(userId: string): Promise<DeviceRecord[]> {
  const settings = await ensureAppSettings();
  const cur = (await db.devices.get(settings.deviceId)) ?? {
    id: settings.deviceId,
    deviceName:
      typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
        ? 'Mobile Browser'
        : 'Desktop Browser',
    platform: typeof navigator !== 'undefined' ? navigator.platform || 'Web' : 'Web',
    appVersion: '1.0.0',
    lastSeenAt: new Date().toISOString(),
    lastSyncedSeq: settings.lastSyncedSeq,
    revokedAt: null,
    isCurrent: true,
  };
  await db.devices.put(cur);

  const supabase = getSupabaseClient();
  if (supabase && (typeof navigator === 'undefined' || navigator.onLine)) {
    await supabase.from('devices').upsert({
      id: cur.id,
      user_id: userId,
      device_name: cur.deviceName,
      platform: cur.platform,
      app_version: cur.appVersion,
      last_seen_at: cur.lastSeenAt,
      last_synced_seq: cur.lastSyncedSeq,
    });

    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });

    if (Array.isArray(data)) {
      for (const row of data) {
        await db.devices.put({
          id: row.id,
          deviceName: row.device_name,
          platform: row.platform,
          appVersion: row.app_version,
          lastSeenAt: row.last_seen_at,
          lastSyncedSeq: row.last_synced_seq,
          revokedAt: row.revoked_at,
          isCurrent: row.id === settings.deviceId,
        });
      }
    }
  }
  return db.devices.toArray();
}

export async function revokeDevice(deviceId: string): Promise<void> {
  const existing = await db.devices.get(deviceId);
  const now = new Date().toISOString();
  if (existing) {
    await db.devices.put({ ...existing, revokedAt: now });
  }
  const supabase = getSupabaseClient();
  if (supabase && (typeof navigator === 'undefined' || navigator.onLine)) {
    await supabase.from('devices').update({ revoked_at: now }).eq('id', deviceId);
  }
}
