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
  exportReadingSessionsCsv,
  previewBackupImport,
  triggerCloudBackupSnapshot,
  triggerFileDownload,
  type ImportPreviewSummary,
} from '../services/backupService';
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
      const res = await runSyncCycle();
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Preferences & Goals */}
      <section className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="font-editorial text-lg font-semibold">{t('settings.preferences')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <div>
            <label className="block text-xs font-semibold mb-1">Daily Page Goal</label>
            <input
              type="number"
              min={1}
              value={settings.dailyPageGoal}
              onChange={(e) =>
                updateSettings({ dailyPageGoal: Math.max(1, Number(e.target.value) || 25) })
              }
              className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Yearly Book Goal</label>
            <input
              type="number"
              min={1}
              value={settings.yearlyBookGoal}
              onChange={(e) =>
                updateSettings({ yearlyBookGoal: Math.max(1, Number(e.target.value) || 24) })
              }
              className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
            />
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
              To enable multi-device Supabase cloud sync, set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono">book-tracker/.env</code> and run{' '}
              <code className="font-mono">supabase/migrations/001_initial_schema.sql</code>.
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
            onClick={async () => {
              const { filename, json } = await exportFullBackupJson();
              triggerFileDownload(filename, json, 'application/json');
              setBackupMsg(`Exported full lossless JSON backup: ${filename}`);
            }}
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
              const { filename, csv } = await exportReadingSessionsCsv();
              triggerFileDownload(filename, csv, 'text/csv;charset=utf-8');
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold"
          >
            CSV: Reading Sessions
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
              {importPreview.duplicateIsbnCount} · Sessions: {importPreview.counts.reading_sessions}
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
    </div>
  );
}
