import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { resolveConflict } from '../sync/syncEngine';
import type { SyncConflict } from '../types/domain';

interface ConflictResolutionModalProps {
  conflicts: SyncConflict[];
  open: boolean;
  onClose: () => void;
}

export function ConflictResolutionModal({
  conflicts,
  open,
  onClose,
}: ConflictResolutionModalProps) {
  const [selectedFields, setSelectedFields] = useState<Record<string, 'local' | 'remote'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!open) return null;

  const handleResolve = async (
    conflict: SyncConflict,
    mode: 'keep_local' | 'keep_remote' | 'merged'
  ) => {
    setBusyId(conflict.id);
    try {
      if (mode === 'merged') {
        const mergedPayload: Record<string, unknown> = { ...conflict.remoteSnapshot };
        for (const field of conflict.conflictingFields) {
          const choice = selectedFields[`${conflict.id}:${field}`] ?? 'local';
          mergedPayload[field] =
            choice === 'local'
              ? conflict.localSnapshot[field]
              : conflict.remoteSnapshot[field];
        }
        await resolveConflict({
          conflictId: conflict.id,
          resolution: 'merged',
          mergedPayload,
        });
      } else {
        await resolveConflict({ conflictId: conflict.id, resolution: mode });
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="font-editorial text-lg font-semibold">
              Sync Conflict Resolution ({conflicts.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-stone-200/60 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {conflicts.length === 0 ? (
            <p className="text-sm text-stone-500 py-8 text-center">
              All sync conflicts are resolved.
            </p>
          ) : (
            conflicts.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{c.entityLabel}</p>
                    <p className="text-xs text-stone-500 font-mono">
                      {c.entityType} · Detected {new Date(c.detectedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleResolve(c, 'keep_local')}
                      className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800"
                    >
                      Keep Local
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleResolve(c, 'keep_remote')}
                      className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800"
                    >
                      Keep Remote
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleResolve(c, 'merged')}
                      className="rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
                    >
                      Save Merged
                    </button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-stone-100 dark:border-slate-800 pt-3">
                  {c.conflictingFields.map((field) => {
                    const key = `${c.id}:${field}`;
                    const picked = selectedFields[key] ?? 'local';
                    return (
                      <div key={field} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedFields((p) => ({ ...p, [key]: 'local' }))}
                          className={`rounded-lg border p-2.5 text-left ${
                            picked === 'local'
                              ? 'border-[#C2410C] bg-amber-50/70 dark:bg-amber-950/30'
                              : 'border-stone-200 dark:border-slate-800'
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase text-stone-500">
                            Local · {field}
                          </p>
                          <p className="mt-1 font-medium break-words">
                            {JSON.stringify(c.localSnapshot[field])}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFields((p) => ({ ...p, [key]: 'remote' }))}
                          className={`rounded-lg border p-2.5 text-left ${
                            picked === 'remote'
                              ? 'border-[#C2410C] bg-amber-50/70 dark:bg-amber-950/30'
                              : 'border-stone-200 dark:border-slate-800'
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase text-stone-500">
                            Remote · {field}
                          </p>
                          <p className="mt-1 font-medium break-words">
                            {JSON.stringify(c.remoteSnapshot[field])}
                          </p>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
