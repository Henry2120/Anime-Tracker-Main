// Supabase Edge Function: sync
// Handles idempotent batch sync_push (by opId) and monotonic cursor sync_pull_since
// with field-level merge, conflict snapshot recording, and tombstone deletions.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_TABLES = new Set([
  'works',
  'editions',
  'edition_isbns',
  'physical_copies',
  'shelves',
  'shelf_items',
  'reading_cycles',
  'reviews',
  'journal_entries',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const deviceId = body.deviceId as string;

    // Check if device has been revoked
    if (deviceId) {
      const { data: dev } = await supabase
        .from('devices')
        .select('revoked_at')
        .eq('id', deviceId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (dev?.revoked_at) {
        return new Response(JSON.stringify({ error: 'Device revoked', deviceRevoked: true }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const operations = Array.isArray(body.operations) ? body.operations : [];
    const ackedOpIds: string[] = [];
    const conflicts: Record<string, unknown>[] = [];

    for (const op of operations) {
      if (!ALLOWED_TABLES.has(op.entityType)) continue;

      // Idempotency check
      const { data: existingOp } = await supabase
        .from('processed_sync_ops')
        .select('op_id')
        .eq('op_id', op.opId)
        .maybeSingle();

      if (existingOp) {
        ackedOpIds.push(op.opId);
        continue;
      }

      const { data: remoteRow } = await supabase
        .from(op.entityType)
        .select('*')
        .eq('id', op.entityId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (remoteRow && remoteRow.version > op.baseVersion && op.operation === 'upsert') {
        const conflictingFields = (op.changedFields ?? []).filter(
          (f: string) => JSON.stringify(remoteRow[f]) !== JSON.stringify(op.payload?.[f])
        );

        if (conflictingFields.length > 0) {
          const conflictId = crypto.randomUUID();
          const conflictRecord = {
            id: conflictId,
            user_id: user.id,
            entity_type: op.entityType,
            entity_id: op.entityId,
            local_snapshot: op.payload,
            remote_snapshot: remoteRow,
            conflicting_fields: conflictingFields,
          };
          await supabase.from('sync_conflicts').insert(conflictRecord);
          conflicts.push(conflictRecord);
          ackedOpIds.push(op.opId);
          continue;
        }
      }

      const nextVersion = (remoteRow?.version ?? 0) + 1;
      const mergedPayload =
        op.operation === 'delete'
          ? { ...(remoteRow ?? op.payload), deleted_at: new Date().toISOString(), version: nextVersion }
          : { ...op.payload, user_id: user.id, version: nextVersion };

      await supabase.from(op.entityType).upsert(mergedPayload, { onConflict: 'id' });

      if (op.operation === 'delete') {
        await supabase.from('sync_tombstones').upsert(
          {
            user_id: user.id,
            entity_type: op.entityType,
            entity_id: op.entityId,
            deleted_at: mergedPayload.deleted_at,
          },
          { onConflict: 'user_id,entity_type,entity_id' }
        );
      }

      await supabase.from('sync_changes').insert({
        user_id: user.id,
        entity_type: op.entityType,
        entity_id: op.entityId,
        operation: op.operation,
        payload: mergedPayload,
        changed_fields: op.changedFields ?? [],
        server_version: nextVersion,
        device_id: deviceId || null,
      });

      await supabase.from('processed_sync_ops').insert({
        op_id: op.opId,
        user_id: user.id,
        device_id: deviceId || crypto.randomUUID(),
        entity_type: op.entityType,
        entity_id: op.entityId,
      });

      ackedOpIds.push(op.opId);
    }

    const sinceSeq = Number(body.sinceSeq ?? 0);
    const { data: pullResult } = await supabase.rpc('sync_pull_since', {
      p_since_seq: sinceSeq,
      p_limit: 500,
    });

    if (deviceId) {
      await supabase
        .from('devices')
        .update({
          last_seen_at: new Date().toISOString(),
          last_synced_seq: pullResult?.latest_seq ?? sinceSeq,
        })
        .eq('id', deviceId)
        .eq('user_id', user.id);
    }

    return new Response(
      JSON.stringify({
        ackedOpIds,
        conflicts,
        pull: pullResult ?? { cursor_expired: false, latest_seq: sinceSeq, changes: [] },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
