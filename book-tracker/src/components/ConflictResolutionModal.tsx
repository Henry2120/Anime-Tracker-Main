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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="archive-modal archive-panel flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#B49A67]/40 bg-[#0B1120] text-[#F4EFE6] shadow-2xl">
        <div className="archive-walnut-panel flex items-center justify-between border-b border-[#B49A67]/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#D6BD8A]" />
            <h2 className="font-editorial text-lg font-semibold text-[#F4EFE6]">
              Sync Conflict Resolution ({conflicts.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#AEB9C9] hover:bg-[#0B1120]/60 hover:text-[#F4EFE6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {conflicts.length === 0 ? (
            <p className="text-sm text-[#AEB9C9] py-8 text-center">
              All sync conflicts are resolved.
            </p>
          ) : (
            conflicts.map((c) => (
              <div
                key={c.id}
                className="archive-panel rounded-xl border border-[#B49A67]/40 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#F4EFE6]">{c.entityLabel}</p>
                    <p className="text-xs text-[#AEB9C9] font-mono">
                      {c.entityType} · Detected {new Date(c.detectedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleResolve(c, 'keep_local')}
                      className="rounded-lg border border-[#B49A67]/35 bg-[#0B1120]/70 px-3 py-1.5 text-xs font-semibold text-[#F4EFE6] hover:border-[#D6BD8A]"
                    >
                      Keep Local
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleResolve(c, 'keep_remote')}
                      className="rounded-lg border border-[#B49A67]/35 bg-[#0B1120]/70 px-3 py-1.5 text-xs font-semibold text-[#F4EFE6] hover:border-[#D6BD8A]"
                    >
                      Keep Remote
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleResolve(c, 'merged')}
                      className="rounded-lg bg-[#B49A67] px-3 py-1.5 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
                    >
                      Save Merged
                    </button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-[#B49A67]/20 pt-3">
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
                              ? 'border-[#D6BD8A] bg-[#B49A67]/15 text-[#F4EFE6]'
                              : 'border-[#B49A67]/25 bg-[#0B1120]/60 text-[#AEB9C9]'
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase text-[#D6BD8A]">
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
                              ? 'border-[#D6BD8A] bg-[#B49A67]/15 text-[#F4EFE6]'
                              : 'border-[#B49A67]/25 bg-[#0B1120]/60 text-[#AEB9C9]'
                          }`}
                        >
                          <p className="font-mono text-[10px] uppercase text-[#D6BD8A]">
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
