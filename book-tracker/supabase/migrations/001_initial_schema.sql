-- AniVerse Book Tracker — Complete PostgreSQL / Supabase Migration
-- Includes Work -> Edition -> PhysicalCopy model, Reading Cycles, Journal,
-- Monotonic Sync Changelog, Idempotent Sync Outbox Ledger, Tombstones, Conflicts,
-- Devices, Backups, and Private Cover/Backup Storage Buckets.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Works (abstract intellectual work)
CREATE TABLE IF NOT EXISTS public.works (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_title TEXT,
  subtitle TEXT,
  authors TEXT[] NOT NULL DEFAULT '{}',
  genres TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  original_language TEXT,
  first_published_year INTEGER,
  series_name TEXT,
  series_index TEXT,
  metadata_source TEXT NOT NULL DEFAULT 'manual',
  metadata_verified BOOLEAN NOT NULL DEFAULT FALSE,
  user_verified_fields TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. Editions (specific translation/publisher/format edition of a Work)
CREATE TABLE IF NOT EXISTS public.editions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  edition_name TEXT,
  translation_title TEXT,
  translators TEXT[] NOT NULL DEFAULT '{}',
  publishers TEXT[] NOT NULL DEFAULT '{}',
  published_date TEXT,
  published_year INTEGER,
  language TEXT NOT NULL DEFAULT 'vi',
  format TEXT NOT NULL DEFAULT 'paperback',
  page_count INTEGER,
  series_name TEXT,
  volume_number TEXT,
  cover_url TEXT,
  cover_storage_path TEXT,
  description TEXT,
  metadata_source TEXT NOT NULL DEFAULT 'manual',
  metadata_verified BOOLEAN NOT NULL DEFAULT FALSE,
  user_verified_fields TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. Edition ISBNs (supports multiple ISBNs per edition; 979 ISBNs never store fabricated ISBN-10)
CREATE TABLE IF NOT EXISTS public.edition_isbns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  isbn13 TEXT NOT NULL,
  isbn10 TEXT,
  prefix_group TEXT NOT NULL CHECK (prefix_group IN ('978', '979', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_no_isbn10_for_979 CHECK (NOT (prefix_group = '979' AND isbn10 IS NOT NULL))
);

-- 4. Physical Copies (each physical book owned/wishlisted/sold has its own row)
CREATE TABLE IF NOT EXISTS public.physical_copies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  ownership_status TEXT NOT NULL DEFAULT 'owned',
  format TEXT NOT NULL DEFAULT 'paperback',
  condition TEXT NOT NULL DEFAULT 'new',
  acquisition_method TEXT NOT NULL DEFAULT 'purchased',
  purchase_date TEXT,
  purchase_price NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'VND',
  seller TEXT,
  shelf_location TEXT,
  copy_label TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 5. Loans (lent physical copies OR borrowed books even with 0 owned copies)
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID REFERENCES public.editions(id) ON DELETE SET NULL,
  physical_copy_id UUID REFERENCES public.physical_copies(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('lent', 'borrowed')),
  person_name TEXT NOT NULL,
  person_contact TEXT,
  loan_date TEXT NOT NULL,
  due_date TEXT,
  returned_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 6. Custom Shelves
CREATE TABLE IF NOT EXISTS public.shelves (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#C2410C',
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.shelf_items (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shelf_id UUID NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID REFERENCES public.editions(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 7. Reading Cycles (preserves multiple re-reads cleanly)
CREATE TABLE IF NOT EXISTS public.reading_cycles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'want_to_read',
  started_at TEXT,
  finished_at TEXT,
  target_finish_date TEXT,
  daily_page_goal INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 8. Reading Progress (explicitly supports intentional page rewinds)
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.reading_cycles(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  current_page INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  percentage NUMERIC(5, 1) NOT NULL DEFAULT 0,
  last_rewound_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 9. Reading Sessions (editable logs recalculating cycle & streak stats)
CREATE TABLE IF NOT EXISTS public.reading_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.reading_cycles(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  start_page INTEGER NOT NULL DEFAULT 0,
  end_page INTEGER NOT NULL DEFAULT 0,
  pages_read INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 10. Reviews (deleting a review never cascades to reading_cycles or reading_sessions)
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID REFERENCES public.editions(id) ON DELETE SET NULL,
  cycle_id UUID REFERENCES public.reading_cycles(id) ON DELETE SET NULL,
  rating NUMERIC(2, 1),
  headline TEXT,
  body TEXT NOT NULL DEFAULT '',
  has_spoilers BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 11. Journal Entries (notes, quotes, character notes, reflections)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_id UUID REFERENCES public.editions(id) ON DELETE SET NULL,
  cycle_id UUID REFERENCES public.reading_cycles(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('note', 'quote', 'character', 'reflection')),
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  quote_text TEXT,
  character_name TEXT,
  page_number INTEGER,
  chapter_label TEXT,
  has_spoilers BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 12. External Provider Metadata Audit Records
CREATE TABLE IF NOT EXISTS public.metadata_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  edition_id UUID REFERENCES public.editions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  isbn13 TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Offline-First Sync Infrastructure (Monotonic Changelog + Idempotent Ops + Tombstones + Conflicts)
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_seq BIGINT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.processed_sync_ops (
  op_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_changes (
  seq BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload JSONB NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  server_version INTEGER NOT NULL DEFAULT 1,
  device_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_user_seq ON public.sync_changes (user_id, seq);

CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  local_snapshot JSONB NOT NULL,
  remote_snapshot JSONB NOT NULL,
  conflicting_fields TEXT[] NOT NULL DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS public.backup_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT,
  entity_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  includes_cover_manifest BOOLEAN NOT NULL DEFAULT FALSE,
  byte_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- Enable Row Level Security on every table
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'works','editions','edition_isbns','physical_copies','loans',
    'shelves','shelf_items','reading_cycles','reading_progress','reading_sessions',
    'reviews','journal_entries','metadata_records','devices','processed_sync_ops',
    'sync_changes','sync_tombstones','sync_conflicts','backup_records'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "owner_all_%I" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "owner_all_%I" ON public.%I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);', tbl, tbl);
  END LOOP;
END $$;

-- Private Storage buckets for covers & cloud backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', FALSE), ('book-backups', 'book-backups', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "owner_book_covers_rw" ON storage.objects;
CREATE POLICY "owner_book_covers_rw" ON storage.objects
  FOR ALL USING (
    bucket_id IN ('book-covers', 'book-backups')
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id IN ('book-covers', 'book-backups')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Monotonic cursor pull RPC with expired-cursor detection
CREATE OR REPLACE FUNCTION public.sync_pull_since(p_since_seq BIGINT, p_limit INTEGER DEFAULT 250)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_min_seq BIGINT;
  v_max_seq BIGINT;
  v_changes JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT MIN(seq), COALESCE(MAX(seq), 0)
    INTO v_min_seq, v_max_seq
  FROM public.sync_changes
  WHERE user_id = v_uid;

  IF p_since_seq > 0 AND v_min_seq IS NOT NULL AND p_since_seq < (v_min_seq - 1) THEN
    RETURN jsonb_build_object(
      'cursor_expired', TRUE,
      'latest_seq', v_max_seq,
      'changes', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.seq), '[]'::jsonb)
    INTO v_changes
  FROM (
    SELECT seq, entity_type, entity_id, operation, payload, changed_fields, server_version, device_id, created_at
    FROM public.sync_changes
    WHERE user_id = v_uid AND seq > p_since_seq
    ORDER BY seq ASC
    LIMIT p_limit
  ) c;

  RETURN jsonb_build_object(
    'cursor_expired', FALSE,
    'latest_seq', v_max_seq,
    'changes', v_changes
  );
END;
$$;
