import React, { useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Download,
  HardDrive,
  Laptop,
  LogOut,
  RefreshCw,
  ShieldCheck,
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

export function SettingsView({
  settings,
  pendingOps,
  conflicts,
  devices,
  backupRecords,
  onOpenConflicts,
}: SettingsViewProps) {
  const { t } = useI18n();
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Preferences */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="font-editorial text-lg font-semibold">{t('settings.preferences')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Language / Ngôn ngữ</label>
            <select
              value={settings.language}
              onChange={(e) => updateSettings({ language: e.target.value as SupportedLocale })}
              className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium"
            >
              <option value="en">English (EN)</option>
              <option value="vi">Tiếng Việt (VI)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Default Currency</label>
            <select
              value={settings.defaultCurrency}
              onChange={(e) =>
                updateSettings({ defaultCurrency: e.target.value as CurrencyCode })
              }
              className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 dark:border-slate-800 pt-3">
          <div>
            <p className="text-xs font-semibold">{t('settings.aiAssist')}</p>
            <p className="text-[11px] text-stone-500">
              Disabled by default. When enabled, only runs when you explicitly click AI Assist on a cover photo.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.aiCoverAssistOptIn}
            onChange={(e) => updateSettings({ aiCoverAssistOptIn: e.target.checked })}
            className="h-4 w-4 accent-[#C2410C]"
          />
        </div>
      </section>

      {/* Cloud Sync & Supabase Auth */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
            <Cloud className="h-5 w-5 text-[#C2410C]" />
            {t('settings.account')}
          </h2>
          <div className="flex items-center gap-2">
            {conflicts.length > 0 && (
              <button
                type="button"
                onClick={onOpenConflicts}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Resolve Conflicts ({conflicts.length})
              </button>
            )}
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 dark:bg-[#C2410C] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {t('action.syncNow')}
            </button>
          </div>
        </div>

        {settings.cloudSyncPausedAfterWipe && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Automatic background cloud sync is paused following your recent cloud wipe so local data is not silently re-uploaded. Click &ldquo;{t('action.syncNow')}&rdquo; when you want to resume cloud synchronization.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-stone-100 dark:border-slate-800 p-3">
            <span className="text-stone-500">Outbox Queue</span>
            <p className="mt-1 font-mono font-semibold tabular-nums">
              {pendingOps.length} pending operations
            </p>
          </div>
          <div className="rounded-xl border border-stone-100 dark:border-slate-800 p-3">
            <span className="text-stone-500">Server Cursor</span>
            <p className="mt-1 font-mono font-semibold tabular-nums">
              seq #{settings.lastSyncedSeq}
            </p>
          </div>
          <div className="rounded-xl border border-stone-100 dark:border-slate-800 p-3">
            <span className="text-stone-500">Last Synced</span>
            <p className="mt-1 font-mono font-semibold">
              {settings.lastSyncedAt ? new Date(settings.lastSyncedAt).toLocaleString() : 'Never'}
            </p>
          </div>
        </div>

        {syncMsg && (
          <p className="rounded-lg bg-stone-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono">
            {syncMsg}
          </p>
        )}

        {!supabaseConfigured ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-slate-700 p-4 text-xs text-stone-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-[#C2410C]" />
              Running in Local-First Offline Mode
            </p>
            <p>
              To enable multi-device Supabase cloud sync, configure <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
            </p>
          </div>
        ) : settings.userEmail ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs">
            <span className="font-medium">
              Signed in as <strong>{settings.userEmail}</strong>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 font-semibold"
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
              className="rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleAuth('signin')}
                className="flex-1 rounded-xl bg-[#C2410C] px-3 py-2 text-xs font-semibold text-white"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleAuth('signup')}
                className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold"
              >
                Sign Up
              </button>
            </div>
          </div>
        )}
        {authMsg && <p className="text-xs text-[#C2410C]">{authMsg}</p>}
      </section>

      {/* Devices Management */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
          <Laptop className="h-5 w-5 text-[#C2410C]" />
          {t('settings.devices')} ({devices.length})
        </h2>
        <div className="divide-y divide-stone-100 dark:divide-slate-800">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2.5 text-xs">
              <div>
                <p className="font-semibold">
                  {d.deviceName} {d.isCurrent ? '(This Device)' : ''}
                </p>
                <p className="text-stone-500 font-mono">
                  {d.platform} · seq #{d.lastSyncedSeq} · {new Date(d.lastSeenAt).toLocaleString()}
                </p>
              </div>
              {d.revokedAt ? (
                <span className="font-mono text-red-600">Revoked</span>
              ) : (
                !d.isCurrent && (
                  <button
                    type="button"
                    onClick={() => revokeDevice(d.id)}
                    className="rounded-lg border border-red-300 px-2.5 py-1 text-red-600 font-semibold"
                  >
                    Revoke
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Backups & Portability */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="font-editorial text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          {t('settings.backups')}
        </h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleQuickBackup}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-stone-900 dark:bg-[#C2410C] px-3.5 py-2 text-xs font-semibold text-white"
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
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold"
          >
            CSV: Physical Collection
          </button>

          <button
            type="button"
            onClick={async () => {
              const { filename, csv } = await exportJournalCsv();
              triggerFileDownload(filename, csv, 'text/csv;charset=utf-8');
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold"
          >
            CSV: Journal &amp; Quotes
          </button>

          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#C2410C] px-3 py-2 text-xs font-semibold text-[#C2410C]">
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
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold"
            >
              Cloud Snapshot
            </button>
          )}
        </div>

        {backupMsg && <p className="text-xs text-emerald-700 dark:text-emerald-400">{backupMsg}</p>}

        {/* Validated Import Preview & Duplicate Check */}
        {importPreview && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-3 text-xs">
            <p className="font-semibold">
              Import Preview ({importPreview.payload.exportedAt})
            </p>
            <p className="font-mono">
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
                className="rounded-lg bg-stone-900 px-3 py-1.5 font-semibold text-white"
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
                className="rounded-lg bg-[#C2410C] px-3 py-1.5 font-semibold text-white"
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
                className="rounded-lg border border-red-400 px-3 py-1.5 font-semibold text-red-700"
              >
                Replace All Local Data
              </button>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="rounded-lg border border-stone-300 px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Backup Records History */}
        {backupRecords.length > 0 && (
          <div className="space-y-1 border-t border-stone-100 dark:border-slate-800 pt-3">
            <p className="text-xs font-semibold text-stone-500">Recent Backup Records</p>
            {backupRecords.slice(0, 5).map((r) => (
              <div key={r.id} className="flex justify-between text-[11px] font-mono text-stone-600 dark:text-slate-400">
                <span className="truncate pr-2">{r.filename}</span>
                <span className="shrink-0">{Math.round(r.byteSize / 1024)} KB</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Configurable Book Tracker Data Deletion */}
      <section className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-editorial text-lg font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
              {t('settings.dataManagement')}
            </h2>
            <p className="text-xs text-stone-600 dark:text-slate-400">
              Permanently erase Book Tracker data on this device, in your Supabase cloud account, or both. Anime Tracker, 3D Viewer, Music Lab, MAL authentication, and AniVerse themes remain completely untouched.
            </p>
          </div>
          <button
            type="button"
            onClick={handleQuickBackup}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800 shrink-0"
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
                  ? 'border-red-500 bg-red-50/70 dark:bg-red-950/30'
                  : 'border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700'
              }`}
            >
              <p className="font-semibold text-stone-900 dark:text-slate-100">{opt.title}</p>
              <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">{opt.desc}</p>
            </button>
          ))}
        </div>

        {scopeNeedsCloud && !cloudReadyForDelete && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
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
          <div className="rounded-xl border border-red-300 bg-red-50/80 dark:bg-red-950/40 p-4 space-y-3 text-xs">
            <p className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Confirm Permanent Deletion ({deleteScope.replace('_', ' ')})
            </p>
            <label className="flex items-start gap-2 cursor-pointer text-stone-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 accent-red-600"
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
                className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 font-medium"
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
                ? 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                : 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
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
              <ul className="list-disc pl-4 text-red-700 dark:text-red-300">
                {deleteFeedback.errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
