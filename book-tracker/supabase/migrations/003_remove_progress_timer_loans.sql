-- Migration 003: Remove reading progress, reading sessions/timer, and physical book loan tables

drop table if exists public.reading_sessions cascade;
drop table if exists public.reading_progress cascade;
drop table if exists public.loans cascade;

alter table if exists public.reading_cycles
  drop column if exists daily_page_goal;

delete from public.sync_tombstones
  where entity_type in ('loans', 'reading_progress', 'reading_sessions');

delete from public.sync_conflicts
  where entity_type in ('loans', 'reading_progress', 'reading_sessions');

delete from public.sync_changes
  where entity_type in ('loans', 'reading_progress', 'reading_sessions');

delete from public.processed_sync_ops
  where entity_type in ('loans', 'reading_progress', 'reading_sessions');
