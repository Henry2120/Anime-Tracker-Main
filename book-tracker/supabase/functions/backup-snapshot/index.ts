// Supabase Edge Function: backup-snapshot
// Separates logical database JSON export from Storage cover asset manifest
// and stores an encrypted-at-rest private snapshot in the `book-backups` bucket.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TABLES = [
  'works',
  'editions',
  'edition_isbns',
  'physical_copies',
  'shelves',
  'shelf_items',
  'reading_cycles',
  'reviews',
  'journal_entries',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

    const dataDump: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    for (const tbl of TABLES) {
      const { data } = await supabase.from(tbl).select('*').eq('user_id', user.id);
      dataDump[tbl] = data ?? [];
      counts[tbl] = (data ?? []).length;
    }

    const { data: coverFiles } = await supabase.storage.from('book-covers').list(user.id);
    const snapshot = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      userId: user.id,
      tables: dataDump,
      coverStorageManifest: (coverFiles ?? []).map((f) => ({
        name: f.name,
        path: `${user.id}/${f.name}`,
        updatedAt: f.updated_at,
      })),
    };

    const jsonString = JSON.stringify(snapshot, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `aniverse-book-tracker-cloud-${timestamp}.json`;
    const storagePath = `${user.id}/${filename}`;

    await supabase.storage
      .from('book-backups')
      .upload(storagePath, new Blob([jsonString], { type: 'application/json' }), { upsert: true });

    const record = {
      id: crypto.randomUUID(),
      user_id: user.id,
      backup_type: 'cloud_snapshot',
      filename,
      storage_path: storagePath,
      entity_counts: counts,
      includes_cover_manifest: true,
      byte_size: jsonString.length,
      notes: 'Automated/manual cloud DB snapshot separated from book-covers storage bucket',
    };
    await supabase.from('backup_records').insert(record);

    return new Response(JSON.stringify({ record }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
