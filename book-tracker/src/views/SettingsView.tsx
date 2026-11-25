import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookMarked,
  Cloud,
  Download,
  HardDrive,
  Laptop,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Upload,
} from 'lucide-react';
import { db } from '../db/dexie';
import { useI18n } from '../i18n/useI18n';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import {
  applyBackupRestore,
  exportCollectionCsv,
  exportFullBackupJson,
  exportJournalCsv,
  previewBackupImport,
  triggerCloudBackupSnapshot,
  triggerFileDownload,
  type ImportPreviewSummary,
} from '../services/backupService';
import {
  deleteBothBookTrackerData,
  deleteCloudBookTrackerData,
  deleteLocalBookTrackerData,
  type BothDeleteResult,
  type CloudDeleteResult,
  type DeleteScope,
  type LocalDeleteResult,
} from '../services/dataManagementService';
import { registerOrRefreshDevices, revokeDevice, runSyncCycle } from '../sync/syncEngine';
import type {
  AppSettings,
  BackupRecord,
  CurrencyCode,
  DeviceRecord,
  SupportedLocale,
  SyncConflict,
  SyncOperation,
} from '../types/domain';
import { CURRENCY_OPTIONS } from '../utils/currency';

interface SettingsViewProps {
  settings: AppSettings;
  pendingOps: SyncOperation[];
  conflicts: SyncConflict[];
  devices: DeviceRecord[];
  backupRecords: BackupRecord[];
  onOpenConflicts: () => void;
}

type OfficeStation = 'all' | 'cabinets' | 'cloud' | 'devices' | 'ledger' | 'vault';

export function SettingsView({
  settings,
  pendingOps,
  conflicts,
  devices,
  backupRecords,
  onOpenConflicts,
}: SettingsViewProps) {
  const { t } = useI18n();
  const [station, setStation] = useState<OfficeStation>('all');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [importPreview, setImportPreview] = useState<ImportPreviewSummary | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  // Configurable Book Tracker data deletion state
  const [deleteScope, setDeleteScope] = useState<DeleteScope>('local_only');
  const [confirmStepOpen, setConfirmStepOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    ok: boolean;
    message: string;
    localClearedCount?: number;
    cloudClearedCount?: number;
    storageDeletedCount?: number;
    errors: string[];
  } | null>(null);

  const supabaseConfigured = isSupabaseConfigured();

  const updateSettings = async (patch: Partial<AppSettings>) => {
    await db.app_settings.put({ ...settings, ...patch });
  };

  const handleAuth = async (mode: 'signin' | 'signup') => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setAuthMsg(null);
    const res =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (res.error) {
      setAuthMsg(res.error.message);
      return;
    }
    if (res.data.user) {
      await updateSettings({
        userId: res.data.user.id,
        userEmail: res.data.user.email ?? email,
      });
      await registerOrRefreshDevices(res.data.user.id);
      setAuthMsg(
        mode === 'signup'
          ? 'Account created. Check email if confirmation is enabled.'
          : 'Signed in successfully.'
      );
    }
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    await updateSettings({ userId: null, userEmail: null });
    setAuthMsg('Signed out (local offline library preserved).');
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await runSyncCycle({ manualTrigger: true });
      setSyncMsg(
        `Sync status: ${res.status} · pushed ${res.pushedCount}, pulled ${res.pulledCount}` +
          (res.cursorReset ? ' (full resync completed)' : '') +
          (res.message ? ` — ${res.message}` : '')
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupMsg(null);
    try {
      const text = await file.text();
      const preview = await previewBackupImport(text);
      setImportPreview(preview);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Invalid backup JSON file.');
    }
  };

  const handleQuickBackup = async () => {
    const { filename, json } = await exportFullBackupJson();
    triggerFileDownload(filename, json, 'application/json');
    setBackupMsg(`Exported full lossless JSON backup: ${filename}`);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setDeleteFeedback(null);
    try {
      if (deleteScope === 'local_only') {
        const res: LocalDeleteResult = await deleteLocalBookTrackerData();
        setDeleteFeedback({
          ok: res.ok,
          message: res.ok
            ? 'Cleared all local Book Tracker data cleanly.'
            : 'Local deletion encountered an error.',
          localClearedCount: res.clearedTables.length,
          errors: res.error ? [res.error] : [],
        });
      } else if (deleteScope === 'cloud_only') {
        const res: CloudDeleteResult = await deleteCloudBookTrackerData();
        setDeleteFeedback({
          ok: res.ok,
          message: res.ok
            ? 'Deleted your Cloud Book Tracker records and paused auto-reupload.'
            : 'Cloud deletion reported issues.',
          cloudClearedCount: res.deletedTables.length,
          storageDeletedCount: res.deletedStorageObjects,
          errors: res.error ? [res.error] : [],
        });
      } else {
        const res: BothDeleteResult = await deleteBothBookTrackerData();
        const errs = [res.cloud.error, res.local.error].filter((e): e is string => Boolean(e));
        setDeleteFeedback({
          ok: res.ok,
          message: res.ok
            ? 'Erased both Local and Cloud Book Tracker data cleanly.'
            : res.partialFailure
              ? 'Partial deletion completed — check details below.'
              : 'Deletion failed on both local and cloud targets.',
          localClearedCount: res.local.ok ? res.local.clearedTables.length : undefined,
          cloudClearedCount: res.cloud.ok ? res.cloud.deletedTables.length : undefined,
          storageDeletedCount: res.cloud.deletedStorageObjects,
          errors: errs,
        });
      }
      setConfirmStepOpen(false);
      setConfirmChecked(false);
    } finally {
      setDeleting(false);
    }
  };

  const scopeNeedsCloud = deleteScope === 'cloud_only' || deleteScope === 'both';
  const cloudReadyForDelete = supabaseConfigured && Boolean(settings.userId);
  const showSection = (id: Exclude<OfficeStation, 'all'>) =>
    station === 'all' || station === id;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* The Archive Office & Interactive Furniture Stations */}
      <section className="archive-walnut-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-archive-display text-[11px] uppercase tracking-[0.18em] text-[#B49A67]">
              The Archive Office · Registry, Ledgers &amp; Sealed Iron Vault
            </p>
            <h2 className="font-archive-display text-xl font-bold text-[#F4EFE6]">
              {t('nav.settings')}
            </h2>
          </div>
          {station !== 'all' && (
            <button
              type="button"
              onClick={() => setStation('all')}
              className="min-h-[36px] rounded-lg border border-[#B49A67]/40 bg-[#0B1120]/70 px-3 text-xs font-semibold text-[#D6BD8A]"
            >
              Show Entire Office
            </button>
          )}
        </div>

        {/* Interactive Room Objects Directory */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-left">
          {(
            [
              ['cabinets', 'Archive Cabinets', 'Language & currency', Sliders],
              ['cloud', 'Cloud Astrolabe', 'Sync & conflicts', Cloud],
              ['devices', 'Key Drawer', `${devices.length} registered`, Laptop],
              ['ledger', 'Backup Ledger', 'JSON & CSV export', BookMarked],
              ['vault', 'Sealed Iron Vault', 'Data erasure', ShieldAlert],
            ] as const
          ).map(([id, title, sub, Icon]) => {
            const active = station === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStation((prev) => (prev === id ? 'all' : id))}
                className={`rounded-2xl border p-3 transition-all min-h-[78px] flex flex-col justify-between ${
                  active
                    ? 'border-[#D6BD8A] bg-[#392A24] shadow-[0_0_16px_rgba(214,189,138,0.22)]'
                    : id === 'vault'
                      ? 'border-red-500/35 bg-[#0B1120]/75 hover:border-red-400/70'
                      : 'border-[#B49A67]/25 bg-[#0B1120]/75 hover:border-[#B49A67]/60'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    id === 'vault' ? 'text-red-400' : 'text-[#D6BD8A]'
                  }`}
                />
                <div className="mt-1.5">
                  <span className="block font-archive-display text-xs font-bold text-[#F4EFE6]">
                    {title}
                  </span>
                  <span className="block text-[10px] text-[#AEB9C9] truncate">{sub}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Preferences (Archive Cabinets) */}
      {showSection('cabinets') && (
        <section className="archive-panel rounded-2xl p-5 space-y-4">
          <h2 className="font-archive-display text-base font-semibold flex items-center gap-2 text-[#F4EFE6]">
            <Archive className="h-4.5 w-4.5 text-[#B49A67]" />
            {t('settings.preferences')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#AEB9C9] mb-1">
                Language / Ngôn ngữ
              </label>
              <select
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value as SupportedLocale })}
                className="archive-input w-full rounded-xl border px-3 py-2 text-xs font-medium"
              >
                <option value="en">English (EN)</option>
                <option value="vi">Tiếng Việt (VI)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#AEB9C9] mb-1">
                Default Currency
              </label>
              <select
                value={settings.defaultCurrency}
                onChange={(e) =>
                  updateSettings({ defaultCurrency: e.target.value as CurrencyCode })
                }
                className="archive-input w-full rounded-xl border px-3 py-2 text-xs font-medium"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#B49A67]/20 pt-3">
            <div>
              <p className="text-xs font-semibold text-[#F4EFE6]">{t('settings.aiAssist')}</p>
              <p className="text-[11px] text-[#AEB9C9]">
                Disabled by default. When enabled, only runs when you explicitly click AI Assist on a cover photo.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.aiCoverAssistOptIn}
              onChange={(e) => updateSettings({ aiCoverAssistOptIn: e.target.checked })}
              className="h-4 w-4 accent-[#B49A67]"
            />
          </div>
        </section>
      )}

      {/* Cloud Sync & Supabase Auth (Cloud Astrolabe) */}
      {showSection('cloud') && (
        <section className="archive-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-archive-display text-base font-semibold flex items-center gap-2 text-[#F4EFE6]">
              <Cloud className="h-5 w-5 text-[#7797C9]" />
              {t('settings.account')}
            </h2>
            <div className="flex items-center gap-2">
              {conflicts.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenConflicts}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#B49A67]/40 bg-[#392A24] px-3 py-1.5 text-xs font-semibold text-[#D6BD8A]"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Resolve Conflicts ({conflicts.length})
                </button>
              )}
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 py-2 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {t('action.syncNow')}
              </button>
            </div>
          </div>

          {settings.cloudSyncPausedAfterWipe && (
            <div className="rounded-xl border border-[#B49A67]/45 bg-[#392A24]/70 px-3 py-2 text-xs text-[#D6BD8A]">
              Automatic background cloud sync is paused following your recent cloud wipe so local data is not silently re-uploaded. Click &ldquo;{t('action.syncNow')}&rdquo; when you want to resume cloud synchronization.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-[#B49A67]/20 bg-[#0B1120]/70 p-3">
              <span className="text-[#AEB9C9]">Outbox Queue</span>
              <p className="mt-1 font-mono font-semibold tabular-nums text-[#F4EFE6]">
                {pendingOps.length} pending operations
              </p>
            </div>
            <div className="rounded-xl border border-[#B49A67]/20 bg-[#0B1120]/70 p-3">
              <span className="text-[#AEB9C9]">Server Cursor</span>
              <p className="mt-1 font-mono font-semibold tabular-nums text-[#F4EFE6]">
                seq #{settings.lastSyncedSeq}
              </p>
            </div>
            <div className="rounded-xl border border-[#B49A67]/20 bg-[#0B1120]/70 p-3">
              <span className="text-[#AEB9C9]">Last Synced</span>
              <p className="mt-1 font-mono font-semibold text-[#F4EFE6]">
                {settings.lastSyncedAt ? new Date(settings.lastSyncedAt).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>

          {syncMsg && (
            <p className="rounded-lg bg-[#0B1120] border border-[#B49A67]/25 px-3 py-2 text-xs font-mono text-[#D6BD8A]">
              {syncMsg}
            </p>
          )}

          {!supabaseConfigured ? (
            <div className="rounded-xl border border-dashed border-[#B49A67]/35 bg-[#0B1120]/50 p-4 text-xs text-[#AEB9C9] space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-[#F4EFE6]">
                <HardDrive className="h-4 w-4 text-[#B49A67]" />
                Running in Local-First Offline Mode
              </p>
              <p>
                To enable multi-device Supabase cloud sync, configure{' '}
                <code className="font-mono text-[#D6BD8A]">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-[#D6BD8A]">VITE_SUPABASE_ANON_KEY</code>.
              </p>
            </div>
          ) : settings.userEmail ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs">
              <span className="font-medium text-[#ECE6D8]">
                Signed in as <strong className="text-[#D6BD8A]">{settings.userEmail}</strong>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-lg border border-[#B49A67]/35 px-3 py-1.5 font-semibold text-[#D6BD8A]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="archive-input rounded-xl border px-3 py-2 text-xs"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="archive-input rounded-xl border px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAuth('signin')}
                  className="flex-1 rounded-xl bg-[#B49A67] px-3 py-2 text-xs font-semibold text-[#0B1120]"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => handleAuth('signup')}
                  className="flex-1 rounded-xl border border-[#B49A67]/35 px-3 py-2 text-xs font-semibold text-[#D6BD8A]"
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}
          {authMsg && <p className="text-xs text-[#D6BD8A]">{authMsg}</p>}
        </section>
      )}

      {/* Devices Management (Key Drawer) */}
      {showSection('devices') && (
        <section className="archive-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-archive-display text-base font-semibold flex items-center gap-2 text-[#F4EFE6]">
            <Laptop className="h-5 w-5 text-[#B49A67]" />
            {t('settings.devices')} ({devices.length})
          </h2>
          <div className="divide-y divide-[#B49A67]/20">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <p className="font-semibold text-[#F4EFE6]">
                    {d.deviceName} {d.isCurrent ? '(This Device)' : ''}
                  </p>
                  <p className="text-[#AEB9C9] font-mono">
                    {d.platform} · seq #{d.lastSyncedSeq} · {new Date(d.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {d.revokedAt ? (
                  <span className="font-mono text-red-400">Revoked</span>
                ) : (
                  !d.isCurrent && (
                    <button
                      type="button"
                      onClick={() => revokeDevice(d.id)}
                      className="rounded-lg border border-red-400/50 px-2.5 py-1 text-red-300 font-semibold"
                    >
                      Revoke
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Backups & Portability (Bound Backup Ledger) */}
      {showSection('ledger') && (
        <section className="archive-panel rounded-2xl p-5 space-y-4">
          <h2 className="font-archive-display text-base font-semibold flex items-center gap-2 text-[#F4EFE6]">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            {t('settings.backups')}
          </h2>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleQuickBackup}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 py-2 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
            >
              <Download className="h-3.5 w-3.5" />
              Export Full JSON
            </button>

            <button
              type="button"
              onClick={async () => {
                const { filename, csv } = await exportCollectionCsv();
                triggerFileDownload(filename, csv, 'text/csv;charset=utf-8');
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#B49A67]/35 bg-[#0B1120]/70 px-3 py-2 text-xs font-semibold text-[#ECE6D8]"
            >
              CSV: Physical Collection
            </button>

            <button
              type="button"
              onClick={async () => {
                const { filename, csv } = await exportJournalCsv();
                triggerFileDownload(filename, csv, 'text/csv;charset=utf-8');
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#B49A67]/35 bg-[#0B1120]/70 px-3 py-2 text-xs font-semibold text-[#ECE6D8]"
            >
              CSV: Journal &amp; Quotes
            </button>

            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#B49A67]/60 bg-[#392A24]/70 px-3 py-2 text-xs font-semibold text-[#D6BD8A]">
              <Upload className="h-3.5 w-3.5" />
              Import / Restore JSON
              <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
            </label>

            {supabaseConfigured && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const rec = await triggerCloudBackupSnapshot();
                    setBackupMsg(`Created cloud snapshot: ${rec?.filename}`);
                  } catch (err) {
                    setBackupMsg(err instanceof Error ? err.message : 'Cloud snapshot failed');
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#B49A67]/35 bg-[#0B1120]/70 px-3 py-2 text-xs font-semibold text-[#ECE6D8]"
              >
                Cloud Snapshot
              </button>
            )}
          </div>

          {backupMsg && <p className="text-xs text-emerald-300">{backupMsg}</p>}

          {importPreview && (
            <div className="rounded-xl border border-[#B49A67]/45 bg-[#392A24]/60 p-4 space-y-3 text-xs">
              <p className="font-semibold text-[#F4EFE6]">
                Import Preview ({importPreview.payload.exportedAt})
              </p>
              <p className="font-mono text-[#AEB9C9]">
                Works: {importPreview.counts.works} ({importPreview.newWorkCount} new,{' '}
                {importPreview.duplicateWorkCount} existing UUIDs) · Duplicate ISBNs:{' '}
                {importPreview.duplicateIsbnCount} · Cycles: {importPreview.counts.reading_cycles}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await applyBackupRestore(importPreview, 'merge_keep_existing');
                    setBackupMsg(`Merged ${res.importedRecords} new records safely.`);
                    setImportPreview(null);
                  }}
                  className="rounded-lg bg-[#141E30] border border-[#B49A67]/40 px-3 py-1.5 font-semibold text-[#F4EFE6]"
                >
                  Merge (Keep Existing)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await applyBackupRestore(importPreview, 'merge_overwrite_duplicates');
                    setBackupMsg(`Restored & updated ${res.importedRecords} records.`);
                    setImportPreview(null);
                  }}
                  className="rounded-lg bg-[#B49A67] px-3 py-1.5 font-semibold text-[#0B1120]"
                >
                  Merge (Overwrite Duplicates)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await applyBackupRestore(importPreview, 'replace_all');
                    setBackupMsg(`Full restore replaced local DB (${res.importedRecords} records).`);
                    setImportPreview(null);
                  }}
                  className="rounded-lg border border-red-400/60 px-3 py-1.5 font-semibold text-red-300"
                >
                  Replace All Local Data
                </button>
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="rounded-lg border border-[#B49A67]/30 px-3 py-1.5 text-[#AEB9C9]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {backupRecords.length > 0 && (
            <div className="space-y-1 border-t border-[#B49A67]/20 pt-3">
              <p className="text-xs font-semibold text-[#AEB9C9]">Recent Backup Records</p>
              {backupRecords.slice(0, 5).map((r) => (
                <div key={r.id} className="flex justify-between text-[11px] font-mono text-[#AEB9C9]">
                  <span className="truncate pr-2">{r.filename}</span>
                  <span className="shrink-0">{Math.round(r.byteSize / 1024)} KB</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Configurable Book Tracker Data Deletion (Sealed Iron Vault) */}
      {showSection('vault') && (
        <section className="archive-panel rounded-2xl border-red-500/40 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-archive-display text-base font-semibold flex items-center gap-2 text-red-300">
                <Trash2 className="h-5 w-5" />
                {t('settings.dataManagement')}
              </h2>
              <p className="text-xs text-[#AEB9C9]">
                Permanently erase Book Tracker data on this device, in your Supabase cloud account, or both. Anime Tracker, 3D Viewer, Music Lab, MAL authentication, and AniVerse themes remain completely untouched.
              </p>
            </div>
            <button
              type="button"
              onClick={handleQuickBackup}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#B49A67]/35 bg-[#0B1120]/70 px-3 py-1.5 text-xs font-semibold text-[#D6BD8A] shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Download Backup First
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {(
              [
                {
                  id: 'local_only',
                  title: 'Delete Local Data Only',
                  desc: 'Clears local IndexedDB library, covers, reading history, sync queue, and lookup cache on this browser.',
                },
                {
                  id: 'cloud_only',
                  title: 'Delete Cloud Data Only',
                  desc: 'Deletes your Book Tracker records & cover/backup storage files in Supabase while keeping local data and pausing auto-reupload.',
                },
                {
                  id: 'both',
                  title: 'Delete Local & Cloud Data',
                  desc: 'Performs a complete wipe of Book Tracker data on both this device and your signed-in cloud account.',
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setDeleteScope(opt.id);
                  setConfirmStepOpen(false);
                  setConfirmChecked(false);
                }}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  deleteScope === opt.id
                    ? 'border-red-400 bg-red-950/40'
                    : 'border-[#B49A67]/25 bg-[#0B1120]/60 hover:border-[#B49A67]/50'
                }`}
              >
                <p className="font-semibold text-[#F4EFE6]">{opt.title}</p>
                <p className="mt-1 text-[11px] text-[#AEB9C9]">{opt.desc}</p>
              </button>
            ))}
          </div>

          {scopeNeedsCloud && !cloudReadyForDelete && (
            <p className="rounded-lg border border-[#B49A67]/40 bg-[#392A24]/60 px-3 py-2 text-xs text-[#D6BD8A]">
              {!supabaseConfigured
                ? 'Cloud sync is not configured in this environment, so cloud deletion is unavailable.'
                : 'Sign in above to enable Cloud Book Tracker deletion.'}
            </p>
          )}

          {!confirmStepOpen ? (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={scopeNeedsCloud && !cloudReadyForDelete}
                onClick={() => setConfirmStepOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Continue to Confirm ({deleteScope.replace('_', ' ')})
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-red-400/50 bg-red-950/40 p-4 space-y-3 text-xs">
              <p className="font-semibold text-red-200 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Confirm Permanent Deletion ({deleteScope.replace('_', ' ')})
              </p>
              <label className="flex items-start gap-2 cursor-pointer text-[#ECE6D8]">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 accent-red-500"
                />
                <span>
                  I understand this permanently deletes my selected Book Tracker records and cannot be undone without a JSON backup.
                </span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmStepOpen(false);
                    setConfirmChecked(false);
                  }}
                  className="rounded-lg border border-[#B49A67]/30 px-3 py-1.5 font-medium text-[#AEB9C9]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!confirmChecked || deleting}
                  onClick={handleConfirmDelete}
                  className="rounded-lg bg-red-600 px-4 py-1.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete Book Tracker Data'}
                </button>
              </div>
            </div>
          )}

          {deleteFeedback && (
            <div
              className={`rounded-xl border p-3 text-xs space-y-1 ${
                deleteFeedback.ok
                  ? 'border-emerald-400/40 bg-emerald-950/40 text-emerald-200'
                  : 'border-[#B49A67]/40 bg-[#392A24]/60 text-[#D6BD8A]'
              }`}
            >
              <p className="font-semibold">{deleteFeedback.message}</p>
              {deleteFeedback.localClearedCount !== undefined && (
                <p className="font-mono text-[11px]">
                  Local tables cleared: {deleteFeedback.localClearedCount}
                </p>
              )}
              {deleteFeedback.cloudClearedCount !== undefined && (
                <p className="font-mono text-[11px]">
                  Cloud tables cleared: {deleteFeedback.cloudClearedCount} · Storage files deleted:{' '}
                  {deleteFeedback.storageDeletedCount ?? 0}
                </p>
              )}
              {deleteFeedback.errors.length > 0 && (
                <ul className="list-disc pl-4 text-red-300">
                  {deleteFeedback.errors.map((er, i) => (
                    <li key={i}>{er}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
