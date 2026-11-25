import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flashlight,
  ImagePlus,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SwitchCamera,
  Trash2,
  Upload,
} from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { sanitizeCoverUrl, saveLocalCoverBlob } from '../services/covers';
import { createBookBundle, savePhysicalCopy } from '../services/libraryService';
import { buildStructuredContributors } from '../services/metadata/pipeline';
import { lookupMetadataWithReportByIsbn, recordProviderMetadata } from '../services/metadataService';
import {
  detectAllBarcodesFromImageFileDetailed,
  getCameraTrackTorchSupport,
  listVideoInputDevices,
  mapCameraErrorMessage,
  openCameraStreamWithFallback,
  scanVideoFrameForMultipleBarcodes,
  setCameraTrackTorch,
  type MultiBarcodeScanAttemptResult,
} from '../services/scannerAndOcr';
import type {
  BookFormat,
  CurrencyCode,
  OwnershipStatus,
  Shelf,
} from '../types/domain';
import {
  applyBatchLookupFailure,
  applyBatchLookupSuccess,
  canRegisterBatchItem,
  candidateToBatchDraft,
  createBatchQueueItem,
  parseBulkIdentifierText,
  shouldSuppressConsecutiveFrame,
  type BatchQueueItem,
  type BatchQueueStatus,
  type BatchSourceKind,
} from '../utils/batchScan';
import { formatBookIdentifier } from '../utils/isbn';
import { createSequentialDecodeRunner } from '../utils/scanFlow';

export type BatchInputMethod = 'camera' | 'photo' | 'text';
export type BatchStep = 'capture' | 'review';

interface BatchScannerWorkspaceProps {
  existingBooks: EnrichedBookRecord[];
  shelves: Shelf[];
  defaultCurrency: CurrencyCode;
  active: boolean;
  onRegisteredBatch?: (createdWorkIds: string[]) => void;
  onClose?: () => void;
}

const LOOKUP_CONCURRENCY = 3;

function statusBadgeMeta(status: BatchQueueStatus, savingState: BatchQueueItem['savingState']) {
  if (savingState === 'saved') {
    return {
      label: 'Saved',
      cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
    };
  }
  if (savingState === 'failed') {
    return {
      label: 'Save Failed',
      cls: 'bg-rose-950/80 text-rose-300 border-rose-500/40',
    };
  }
  switch (status) {
    case 'captured':
      return { label: 'Captured', cls: 'bg-slate-800 text-slate-200 border-slate-600/50' };
    case 'searching':
      return { label: 'Searching', cls: 'bg-sky-950/80 text-sky-300 border-sky-500/40' };
    case 'match_found':
      return { label: 'Match Found', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' };
    case 'no_match':
      return { label: 'No Match', cls: 'bg-amber-950/80 text-amber-300 border-amber-500/40' };
    case 'duplicate':
      return { label: 'Duplicate', cls: 'bg-violet-950/80 text-violet-300 border-violet-500/40' };
    case 'invalid':
      return { label: 'Invalid', cls: 'bg-rose-950/80 text-rose-300 border-rose-500/40' };
    case 'error':
      return { label: 'Error', cls: 'bg-rose-950/80 text-rose-300 border-rose-500/40' };
  }
}

export function BatchScannerWorkspace({
  existingBooks,
  shelves,
  defaultCurrency,
  active,
  onRegisteredBatch,
  onClose,
}: BatchScannerWorkspaceProps) {
  const [step, setStep] = useState<BatchStep>('capture');
  const [inputMethod, setInputMethod] = useState<BatchInputMethod>('camera');
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const queueRef = useRef<BatchQueueItem[]>([]);
  queueRef.current = queue;

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const decodeRunnerRef = useRef(createSequentialDecodeRunner());
  const recentFramesRef = useRef<Map<string, number>>(new Map());
  const lastFrameCodeRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [cameraStatus, setCameraStatus] = useState<'idle' | 'active' | 'paused'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [captureBanner, setCaptureBanner] = useState<{
    id: string;
    message: string;
    tone: 'success' | 'warning' | 'error';
  } | null>(null);

  // Multi-photo state
  const [photoBusy, setPhotoBusy] = useState(false);
  const [lastPhotoReport, setLastPhotoReport] = useState<MultiBarcodeScanAttemptResult | null>(null);

  // Bulk text entry state
  const [bulkText, setBulkText] = useState('');
  const parsedBulk = useMemo(() => parseBulkIdentifierText(bulkText), [bulkText]);

  // Bounded concurrency lookup queue refs
  const lookupPendingIdsRef = useRef<string[]>([]);
  const lookupActiveCountRef = useRef(0);
  const lookupInFlightSetRef = useRef<Set<string>>(new Set());

  // Batch save feedback
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSaveSummary, setBatchSaveSummary] = useState<{
    savedCount: number;
    failedCount: number;
    skippedCount: number;
  } | null>(null);

  // Track object URLs for clean revoke on unmount
  const createdObjectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCameraStream();
      for (const u of createdObjectUrlsRef.current) {
        URL.revokeObjectURL(u);
      }
      createdObjectUrlsRef.current = [];
    };
  }, []);

  const stopCameraStream = () => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchSupported(false);
    setTorchEnabled(false);
  };

  useEffect(() => {
    if (!active || step !== 'capture' || inputMethod !== 'camera') {
      stopCameraStream();
      setCameraStatus((prev) => (prev === 'active' ? 'paused' : prev));
    }
  }, [active, step, inputMethod]);

  const pumpLookupQueue = () => {
    while (
      lookupActiveCountRef.current < LOOKUP_CONCURRENCY &&
      lookupPendingIdsRef.current.length > 0
    ) {
      const nextId = lookupPendingIdsRef.current.shift()!;
      if (lookupInFlightSetRef.current.has(nextId)) continue;

      const currentItem = queueRef.current.find((it) => it.id === nextId);
      if (!currentItem || !currentItem.isValid || !currentItem.normalizedId) continue;

      lookupInFlightSetRef.current.add(nextId);
      lookupActiveCountRef.current += 1;

      setQueue((prev) =>
        prev.map((it) =>
          it.id === nextId ? { ...it, status: 'searching', lookupError: null } : it
        )
      );

      const identifier = currentItem.normalizedId;
      void lookupMetadataWithReportByIsbn(identifier)
        .then((res) => {
          if (!mountedRef.current) return;
          setQueue((prev) =>
            prev.map((it) => (it.id === nextId ? applyBatchLookupSuccess(it, res) : it))
          );
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          const msg = err instanceof Error ? err.message : 'Metadata lookup failed';
          setQueue((prev) =>
            prev.map((it) => (it.id === nextId ? applyBatchLookupFailure(it, msg) : it))
          );
        })
        .finally(() => {
          lookupInFlightSetRef.current.delete(nextId);
          lookupActiveCountRef.current = Math.max(0, lookupActiveCountRef.current - 1);
          if (mountedRef.current) {
            pumpLookupQueue();
          }
        });
    }
  };

  const enqueueLookups = (itemIds: string[]) => {
    for (const id of itemIds) {
      if (!lookupPendingIdsRef.current.includes(id) && !lookupInFlightSetRef.current.has(id)) {
        lookupPendingIdsRef.current.push(id);
      }
    }
    pumpLookupQueue();
  };

  const appendCapturedBarcodes = (
    entries: Array<{ rawInput: string; formatLabel?: string | null; source: BatchSourceKind }>
  ) => {
    if (entries.length === 0) return;

    const newlyAdded: BatchQueueItem[] = [];
    setQueue((prev) => {
      const runningQueue = [...prev];
      for (const entry of entries) {
        const item = createBatchQueueItem({
          rawInput: entry.rawInput,
          formatLabel: entry.formatLabel,
          source: entry.source,
          defaultCurrency,
          existingQueue: runningQueue,
          existingBooks,
        });
        runningQueue.push(item);
        newlyAdded.push(item);
      }
      return runningQueue;
    });

    const validIds = newlyAdded.filter((i) => i.isValid).map((i) => i.id);
    if (validIds.length > 0) {
      window.setTimeout(() => {
        if (mountedRef.current) enqueueLookups(validIds);
      }, 0);
    }

    const latest = newlyAdded[newlyAdded.length - 1];
    if (latest) {
      if (!latest.isValid) {
        setCaptureBanner({
          id: latest.id,
          tone: 'error',
          message: `Invalid barcode "${latest.rawInput}": ${latest.checksumError}`,
        });
      } else if (latest.duplicateInCollection || latest.duplicateInBatch) {
        setCaptureBanner({
          id: latest.id,
          tone: 'warning',
          message: `Duplicate detected: ${formatBookIdentifier(latest.normalizedId!)} (${
            latest.duplicateInCollection
              ? `already in library as "${latest.duplicateInCollection.title}"`
              : 'already in current batch'
          })`,
        });
      } else {
        setCaptureBanner({
          id: latest.id,
          tone: 'success',
          message: `Captured ${formatBookIdentifier(latest.normalizedId!)} (${latest.identifierType.toUpperCase()})`,
        });
      }
    }
  };

  const startOrResumeCamera = async (overrideDeviceId?: string) => {
    setCameraError(null);
    stopCameraStream();
    try {
      const targetDevice = overrideDeviceId ?? (selectedDeviceId || undefined);
      const { stream } = await openCameraStreamWithFallback(targetDevice);
      if (!mountedRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;
      setTorchSupported(getCameraTrackTorchSupport(stream));
      setTorchEnabled(false);

      const devices = await listVideoInputDevices();
      if (mountedRef.current && devices.length > 0) {
        setCameraDevices(devices);
        const activeTrackDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
        if (activeTrackDeviceId) setSelectedDeviceId(activeTrackDeviceId);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus('active');
    } catch (err) {
      setCameraError(mapCameraErrorMessage(err));
      setCameraStatus('idle');
    }
  };

  const pauseCamera = () => {
    stopCameraStream();
    setCameraStatus('paused');
  };

  const handleFinishScanning = () => {
    stopCameraStream();
    setCameraStatus('idle');
    setStep('review');
  };

  const handleClearQueue = () => {
    lookupPendingIdsRef.current = [];
    recentFramesRef.current.clear();
    lastFrameCodeRef.current = null;
    setQueue([]);
    setLastPhotoReport(null);
    setCaptureBanner(null);
    setBatchSaveSummary(null);
  };

  // Continuous live multi-frame barcode scan loop
  useEffect(() => {
    if (!active || step !== 'capture' || inputMethod !== 'camera' || cameraStatus !== 'active') {
      return;
    }

    let cancelled = false;
    let frameIndex = 0;
    let lastCompletedAt = 0;

    if (!scratchCanvasRef.current) {
      scratchCanvasRef.current = document.createElement('canvas');
    }

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const now = performance.now();

      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !decodeRunnerRef.current.isBusy() &&
        now - lastCompletedAt >= 120
      ) {
        const currentFrame = frameIndex++;
        void decodeRunnerRef.current
          .run(async () =>
            scanVideoFrameForMultipleBarcodes(video, scratchCanvasRef.current!, {
              frameIndex: currentFrame,
            })
          )
          .then((attempt) => {
            lastCompletedAt = performance.now();
            if (!attempt || cancelled) return;
            const nowWall = Date.now();
            const toCapture: Array<{
              rawInput: string;
              formatLabel?: string | null;
              source: BatchSourceKind;
            }> = [];

            for (const item of attempt.validItems) {
              if (!item.normalizedId) continue;
              const suppress = shouldSuppressConsecutiveFrame(
                recentFramesRef.current,
                item.normalizedId,
                nowWall,
                { lastBarcodeId: lastFrameCodeRef.current, cooldownMs: 2200 }
              );
              lastFrameCodeRef.current = item.normalizedId;
              if (!suppress) {
                toCapture.push({
                  rawInput: item.rawValue,
                  formatLabel: item.format,
                  source: 'live_camera',
                });
              }
            }

            if (toCapture.length > 0) {
              appendCapturedBarcodes(toCapture);
            }
          });
      }

      if (!cancelled) {
        rafIdRef.current = window.requestAnimationFrame(tick);
      }
    };

    rafIdRef.current = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [active, step, inputMethod, cameraStatus]);

  const handleMultiBarcodePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setPhotoBusy(true);
    setCaptureBanner(null);
    try {
      for (const file of files) {
        const report = await detectAllBarcodesFromImageFileDetailed(file);
        if (!mountedRef.current) return;
        setLastPhotoReport(report);
        const toAdd = report.allItems.map((sym) => ({
          rawInput: sym.rawValue,
          formatLabel: sym.format,
          source: 'multi_photo' as const,
        }));
        if (toAdd.length > 0) {
          appendCapturedBarcodes(toAdd);
        }
      }
    } finally {
      if (mountedRef.current) setPhotoBusy(false);
    }
  };

  const handleQueueBulkText = () => {
    if (parsedBulk.entries.length === 0) return;
    appendCapturedBarcodes(
      parsedBulk.entries.map((entry) => ({
        rawInput: entry.rawToken,
        formatLabel: entry.identifierType === 'invalid' ? 'Text' : entry.identifierType.toUpperCase(),
        source: 'bulk_text',
      }))
    );
    setBulkText('');
  };

  const handleFixInvalidItem = (id: string, correctedRaw: string) => {
    const created = createBatchQueueItem({
      rawInput: correctedRaw,
      formatLabel: 'Manual Fix',
      source: 'bulk_text',
      defaultCurrency,
      existingQueue: queueRef.current.filter((it) => it.id !== id),
      existingBooks,
    });
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...created, id } : it)));
    if (created.isValid) {
      enqueueLookups([id]);
    }
  };

  const handleRetryLookup = (itemId: string) => {
    const item = queueRef.current.find((it) => it.id === itemId);
    if (!item || !item.isValid || !item.normalizedId) return;
    setQueue((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, status: 'searching', lookupError: null } : it
      )
    );
    void lookupMetadataWithReportByIsbn(item.normalizedId, { bypassCache: true })
      .then((res) => {
        if (!mountedRef.current) return;
        setQueue((prev) =>
          prev.map((it) => (it.id === itemId ? applyBatchLookupSuccess(it, res) : it))
        );
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Lookup failed';
        setQueue((prev) =>
          prev.map((it) => (it.id === itemId ? applyBatchLookupFailure(it, msg) : it))
        );
      });
  };

  const updateItemDraft = (itemId: string, patch: Partial<BatchQueueItem['draft']>) => {
    setQueue((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, draft: { ...it.draft, ...patch } } : it))
    );
  };

  const handleCoverUpload = (itemId: string, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    createdObjectUrlsRef.current.push(url);
    setQueue((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, coverFile: file, coverPreviewUrl: url } : it
      )
    );
  };

  const registerItems = async (targetItems: BatchQueueItem[]) => {
    if (targetItems.length === 0) return;
    setBatchSaving(true);
    setBatchSaveSummary(null);
    let savedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const savedWorkIds: string[] = [];

    for (const item of targetItems) {
      if (!canRegisterBatchItem(item)) {
        skippedCount++;
        continue;
      }

      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, savingState: 'saving', saveError: null } : it
        )
      );

      try {
        if (item.duplicateInCollection && item.duplicateAction === 'add_copy') {
          const copy = await savePhysicalCopy({
            workId: item.duplicateInCollection.workId,
            editionId: item.duplicateInCollection.editionId,
            ownershipStatus: item.draft.ownershipStatus,
            format: item.draft.format,
            condition: 'new',
            acquisitionMethod: 'purchased',
            purchasePrice: item.draft.purchasePrice ? Number(item.draft.purchasePrice) : null,
            currency: item.draft.currency,
            notes: item.draft.notes.trim() || undefined,
          });
          savedCount++;
          savedWorkIds.push(copy.workId);
          setQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    savingState: 'saved',
                    selected: false,
                    saveError: null,
                    savedWorkId: copy.workId,
                  }
                : it
            )
          );
          continue;
        }

        const authors = item.draft.authorsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const translators = item.draft.translatorsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const illustrators = item.draft.illustratorsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const publishers = item.draft.publishersText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const genres = item.draft.genresText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const bundle = await createBookBundle({
          work: {
            title: item.draft.title.trim(),
            originalTitle: item.draft.originalTitle.trim() || undefined,
            authors,
            illustrators,
            genres,
            description: item.draft.description.trim() || undefined,
            originalLanguage: item.draft.language || undefined,
            firstPublishedYear: item.draft.publishedYear
              ? Number(item.draft.publishedYear) || null
              : null,
            seriesName: item.draft.seriesName.trim() || undefined,
            seriesIndex: item.draft.volumeNumber.trim() || undefined,
            metadataSource: item.selectedCandidate?.provider ?? 'manual',
            metadataVerified: Boolean(item.selectedCandidate),
          },
          edition: {
            title: item.draft.title.trim(),
            editionName: item.draft.editionName.trim() || undefined,
            translators,
            illustrators,
            contributors: buildStructuredContributors({
              authors,
              illustrators,
              translators,
            }),
            publishers,
            publishingPartner: item.draft.publishingPartner.trim() || undefined,
            distributor: item.draft.distributorText.trim() || undefined,
            publishedYear: item.draft.publishedYear
              ? Number(item.draft.publishedYear) || null
              : null,
            language: item.draft.language || 'und',
            format: item.draft.format,
            pageCount: item.draft.pageCount ? Number(item.draft.pageCount) || null : null,
            seriesName: item.draft.seriesName.trim() || undefined,
            volumeNumber: item.draft.volumeNumber.trim() || undefined,
            coverUrl: sanitizeCoverUrl(item.draft.coverUrl) ?? undefined,
            description: item.draft.description.trim() || undefined,
            metadataSource: item.selectedCandidate?.provider ?? 'manual',
            metadataVerified: Boolean(item.selectedCandidate),
          },
          isbnInput: item.normalizedId ?? undefined,
          createCopy: true,
          copy: {
            ownershipStatus: item.draft.ownershipStatus,
            format: item.draft.format,
            condition: 'new',
            acquisitionMethod: 'purchased',
            purchasePrice: item.draft.purchasePrice ? Number(item.draft.purchasePrice) : null,
            currency: item.draft.currency,
            notes: item.draft.notes.trim() || undefined,
          },
          initialReadingStatus: 'want_to_read',
          shelfIds: item.draft.shelfIds,
        });

        if (item.coverFile) {
          await saveLocalCoverBlob(bundle.edition.id, item.coverFile);
        }
        if (item.selectedCandidate) {
          await recordProviderMetadata({
            workId: bundle.work.id,
            editionId: bundle.edition.id,
            candidate: item.selectedCandidate,
          });
        }

        savedCount++;
        savedWorkIds.push(bundle.work.id);
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  savingState: 'saved',
                  selected: false,
                  saveError: null,
                  savedWorkId: bundle.work.id,
                }
              : it
          )
        );
      } catch (err) {
        failedCount++;
        const msg = err instanceof Error ? err.message : 'Failed to register book';
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, savingState: 'failed', saveError: msg } : it
          )
        );
      }
    }

    setBatchSaving(false);
    setBatchSaveSummary({ savedCount, failedCount, skippedCount });
    if (savedWorkIds.length > 0) {
      onRegisteredBatch?.(savedWorkIds);
    }
  };

  const selectedItems = queue.filter((i) => i.selected && i.savingState !== 'saved');
  const allValidItems = queue.filter((i) => canRegisterBatchItem(i));
  const queueStats = {
    total: queue.length,
    valid: queue.filter((i) => i.isValid).length,
    matches: queue.filter((i) => i.status === 'match_found').length,
    noMatch: queue.filter((i) => i.status === 'no_match').length,
    duplicates: queue.filter((i) => i.status === 'duplicate').length,
    invalid: queue.filter((i) => !i.isValid || i.status === 'error').length,
    saved: queue.filter((i) => i.savingState === 'saved').length,
  };

  return (
    <div className="space-y-4">
      {/* Sub-step bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#B49A67]/25 bg-[#0B1120]/80 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#B49A67]" />
          <span className="text-xs font-semibold text-[#ECE6D8]">
            {step === 'capture'
              ? 'Batch Capture — Live Camera, Multi-Barcode Photo, or Bulk ISBN/EAN'
              : 'Batch Review & Registration'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#AEB9C9]">
          <span>{queueStats.total} queued</span>
          <span>·</span>
          <span className="text-emerald-300">{queueStats.matches} matched</span>
          {queueStats.noMatch > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-300">{queueStats.noMatch} manual needed</span>
            </>
          )}
          {queueStats.duplicates > 0 && (
            <>
              <span>·</span>
              <span className="text-violet-300">{queueStats.duplicates} duplicate</span>
            </>
          )}
        </div>
      </div>

      {step === 'capture' ? (
        <div className="space-y-4">
          {/* Method Switcher */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[#B49A67]/25 bg-[#0B1120]/70 p-1">
            {(
              [
                ['camera', 'Live Continuous Camera', Camera],
                ['photo', 'Multi-Barcode Photo', ImagePlus],
                ['text', 'Bulk ISBN / EAN Text', FileText],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setInputMethod(id)}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                  inputMethod === id
                    ? 'bg-[#B49A67] text-[#0B1120]'
                    : 'text-[#AEB9C9] hover:bg-[#101827]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* Method A: Live Continuous Camera */}
          {inputMethod === 'camera' && (
            <div className="space-y-3">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#B49A67]/30 bg-[#050811] flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

                {cameraStatus === 'active' && (
                  <>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
                      <div className="relative h-36 w-72 sm:w-96 rounded-xl border-2 border-dashed border-[#B49A67]/90 shadow-[0_0_0_9999px_rgba(6,10,20,0.28)]" />
                      <span className="mt-3 rounded-md bg-[#0B1120]/85 px-2.5 py-1 text-[11px] font-medium text-[#ECE6D8] border border-[#B49A67]/30">
                        Continuous capture active — hold each book barcode briefly in view
                      </span>
                    </div>

                    <div className="absolute top-2.5 right-2.5 flex flex-wrap items-center gap-1.5">
                      {cameraDevices.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const curIdx = cameraDevices.findIndex(
                              (d) => d.deviceId === selectedDeviceId
                            );
                            const nextDev = cameraDevices[(curIdx + 1) % cameraDevices.length];
                            if (nextDev) {
                              setSelectedDeviceId(nextDev.deviceId);
                              void startOrResumeCamera(nextDev.deviceId);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#0B1120]/80 border border-[#B49A67]/40 px-2.5 py-1.5 text-xs font-semibold text-[#ECE6D8]"
                        >
                          <SwitchCamera className="h-3.5 w-3.5" />
                          Switch Camera
                        </button>
                      )}
                      {torchSupported && (
                        <button
                          type="button"
                          onClick={async () => {
                            const next = !torchEnabled;
                            if (await setCameraTrackTorch(streamRef.current, next)) {
                              setTorchEnabled(next);
                            }
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            torchEnabled
                              ? 'bg-[#B49A67] text-[#0B1120]'
                              : 'bg-[#0B1120]/80 text-[#ECE6D8] border border-[#B49A67]/40'
                          }`}
                        >
                          <Flashlight className="h-3.5 w-3.5" />
                          {torchEnabled ? 'Torch On' : 'Torch'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={pauseCamera}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0B1120]/85 border border-[#B49A67]/40 px-2.5 py-1.5 text-xs font-semibold text-[#ECE6D8]"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </button>
                    </div>
                  </>
                )}

                {cameraStatus !== 'active' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                    <Camera className="h-10 w-10 text-[#B49A67]" />
                    <p className="text-xs sm:text-sm text-[#ECE6D8] max-w-md">
                      {cameraStatus === 'paused'
                        ? `Scanner paused (${queue.length} item(s) in queue). Resume scanning or proceed to review.`
                        : 'Scan a whole stack of books back-to-back. Camera stays open while online metadata resolves in the background.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void startOrResumeCamera()}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-4 py-2 text-xs sm:text-sm font-semibold text-[#0B1120] hover:bg-[#C6AD7B]"
                      >
                        <Play className="h-4 w-4" />
                        {cameraStatus === 'paused' ? 'Resume Camera' : 'Start Continuous Scan'}
                      </button>
                      {cameraDevices.length > 1 && (
                        <select
                          value={selectedDeviceId}
                          onChange={(e) => setSelectedDeviceId(e.target.value)}
                          className="min-h-[42px] rounded-xl border border-[#B49A67]/40 bg-[#101827] px-3 text-xs text-[#ECE6D8]"
                        >
                          {cameraDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="rounded-lg border border-amber-500/50 bg-amber-950/60 px-3 py-2 text-xs text-amber-200">
                  {cameraError}
                </p>
              )}
            </div>
          )}

          {/* Method B: Multiple Barcodes from One Photograph */}
          {inputMethod === 'photo' && (
            <div className="space-y-3 rounded-xl border border-[#B49A67]/30 bg-[#101827]/90 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#ECE6D8]">
                    Multi-Barcode Photo Recognition
                  </p>
                  <p className="text-xs text-[#AEB9C9]">
                    Upload one or more photos showing multiple book back covers side-by-side. All valid ISBN-10, ISBN-13, and EAN-13 (including 893*) barcodes are extracted together.
                  </p>
                </div>
                <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#B49A67] px-4 py-2 text-xs font-semibold text-[#0B1120] hover:bg-[#C6AD7B] shrink-0">
                  {photoBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {photoBusy ? 'Scanning Image...' : 'Choose Photo(s)'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={photoBusy}
                    onChange={handleMultiBarcodePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {lastPhotoReport && (
                <div className="rounded-xl border border-[#B49A67]/25 bg-[#0B1120]/80 p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                    <span className="text-[#ECE6D8]">
                      Last Photo: {lastPhotoReport.allItems.length} unique symbol(s) ·{' '}
                      <span className="text-emerald-300">{lastPhotoReport.validCount} valid</span> ·{' '}
                      <span className="text-rose-300">{lastPhotoReport.invalidCount} invalid</span>
                    </span>
                    <span className="text-[#AEB9C9]">{lastPhotoReport.durationMs}ms</span>
                  </div>
                  {lastPhotoReport.blurryGuidance && (
                    <p className="text-amber-300">{lastPhotoReport.blurryGuidance}</p>
                  )}
                  {lastPhotoReport.invalidItems.length > 0 && (
                    <p className="text-rose-300">
                      Ignored/invalid symbols:{' '}
                      {lastPhotoReport.invalidItems
                        .map((i) => `${i.rawValue} (${i.checksumError})`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Method C: Bulk ISBN / EAN Text Entry */}
          {inputMethod === 'text' && (
            <div className="space-y-3 rounded-xl border border-[#B49A67]/30 bg-[#101827]/90 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#ECE6D8]">
                  Bulk ISBN-10 / ISBN-13 / EAN-13 Text Entry
                </p>
                <p className="text-xs text-[#AEB9C9]">
                  Paste one identifier per line or separate with commas/semicolons. Leading zeros and GS1 893 retail barcodes are preserved untouched. Works offline.
                </p>
              </div>
              <textarea
                rows={5}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'9786043590296\n8935082600287\n0140449132, 9786042243568'}
                className="w-full rounded-xl border border-[#B49A67]/30 bg-[#0B1120] p-3 text-xs font-mono text-[#ECE6D8] placeholder:text-[#AEB9C9]/40"
              />
              {parsedBulk.totalTokens > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap gap-3 font-mono">
                    <span className="text-[#ECE6D8]">{parsedBulk.totalTokens} entered</span>
                    <span className="text-emerald-300">{parsedBulk.validCount} valid</span>
                    {parsedBulk.invalidCount > 0 && (
                      <span className="text-rose-300">{parsedBulk.invalidCount} invalid</span>
                    )}
                    {parsedBulk.duplicateCount > 0 && (
                      <span className="text-violet-300">{parsedBulk.duplicateCount} duplicates</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleQueueBulkText}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] hover:bg-[#C6AD7B]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to Batch Queue
                  </button>
                </div>
              )}
            </div>
          )}

          {captureBanner && (
            <div
              className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                captureBanner.tone === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                  : captureBanner.tone === 'warning'
                    ? 'border-violet-500/40 bg-violet-950/60 text-violet-200'
                    : 'border-rose-500/40 bg-rose-950/60 text-rose-200'
              }`}
            >
              {captureBanner.message}
            </div>
          )}

          {/* Live Batch Queue Strip */}
          <div className="rounded-xl border border-[#B49A67]/25 bg-[#101827]/90 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#ECE6D8]">
                Captured Batch Queue ({queue.length})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {queue.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#B49A67]/30 px-2.5 text-xs font-medium text-[#AEB9C9] hover:text-[#ECE6D8]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear Queue
                  </button>
                )}
                <button
                  type="button"
                  disabled={queue.length === 0}
                  onClick={handleFinishScanning}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#C6AD7B] disabled:opacity-40"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Finish Scanning &amp; Review ({queue.length})
                </button>
              </div>
            </div>

            {queue.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#AEB9C9]">
                No books captured yet. Scan barcodes with the camera, upload a multi-book photo, or paste ISBNs above.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {queue.map((item) => {
                  const badge = statusBadgeMeta(item.status, item.savingState);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#B49A67]/20 bg-[#0B1120]/80 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <span className="font-mono font-semibold text-[#ECE6D8]">
                            {item.normalizedId
                              ? formatBookIdentifier(item.normalizedId)
                              : item.rawInput}
                          </span>
                          <span className="text-[10px] uppercase font-mono text-[#AEB9C9]">
                            {item.identifierType}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-[#AEB9C9]">
                          {item.isValid
                            ? item.draft.title ||
                              (item.duplicateInCollection
                                ? `Matches library book: ${item.duplicateInCollection.title}`
                                : item.status === 'searching'
                                  ? 'Resolving metadata across catalogs...'
                                  : item.status === 'no_match'
                                    ? 'No online catalog match — manual metadata editable in Review'
                                    : 'Ready for review')
                            : item.checksumError}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.isValid && (item.status === 'no_match' || item.status === 'error') && (
                          <button
                            type="button"
                            onClick={() => handleRetryLookup(item.id)}
                            title="Retry lookup"
                            className="rounded-lg border border-[#B49A67]/30 p-1.5 text-[#AEB9C9] hover:text-[#ECE6D8]"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setQueue((prev) => prev.filter((it) => it.id !== item.id))
                          }
                          title="Remove from queue"
                          className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-950/50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Step 2: Batch Review & Registration */
        <div className="space-y-4">
          {/* Batch Review Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#B49A67]/30 bg-[#101827]/90 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStep('capture')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#B49A67]/40 px-3 text-xs font-semibold text-[#ECE6D8] hover:bg-[#0B1120]"
              >
                <Camera className="h-3.5 w-3.5" />
                Return to Scanner
              </button>
              <button
                type="button"
                onClick={() =>
                  setQueue((prev) => {
                    const allChecked = prev
                      .filter((it) => it.savingState !== 'saved')
                      .every((it) => it.selected);
                    return prev.map((it) =>
                      it.savingState === 'saved' ? it : { ...it, selected: !allChecked }
                    );
                  })
                }
                className="min-h-[38px] rounded-lg border border-[#B49A67]/30 px-2.5 text-xs text-[#AEB9C9]"
              >
                Toggle All
              </button>
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setQueue((prev) =>
                      prev.filter((it) => !(it.selected && it.savingState !== 'saved'))
                    )
                  }
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 text-xs font-semibold text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Selected ({selectedItems.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={batchSaving || selectedItems.filter(canRegisterBatchItem).length === 0}
                onClick={() => void registerItems(selectedItems)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#B49A67] px-3.5 text-xs font-semibold text-[#B49A67] hover:bg-[#B49A67]/15 disabled:opacity-40"
              >
                {batchSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Add Selected to Library ({selectedItems.filter(canRegisterBatchItem).length})
              </button>
              <button
                type="button"
                disabled={batchSaving || allValidItems.length === 0}
                onClick={() => void registerItems(allValidItems)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#C6AD7B] disabled:opacity-40"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Add All Valid to Library ({allValidItems.length})
              </button>
            </div>
          </div>

          {batchSaveSummary && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-3.5 py-2.5 text-xs text-emerald-200">
              <span>
                Batch registration completed: {batchSaveSummary.savedCount} saved
                {batchSaveSummary.failedCount > 0
                  ? `, ${batchSaveSummary.failedCount} failed (preserved below for retry)`
                  : ''}
                {batchSaveSummary.skippedCount > 0
                  ? `, ${batchSaveSummary.skippedCount} skipped/incomplete`
                  : ''}
                .
              </span>
              {batchSaveSummary.savedCount > 0 && batchSaveSummary.failedCount === 0 && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-950"
                >
                  Done &amp; Return to Archive
                </button>
              )}
            </div>
          )}

          {/* Review Item Cards */}
          <div className="space-y-3">
            {queue.map((item) => {
              const badge = statusBadgeMeta(item.status, item.savingState);
              const allCandidates = [...item.candidates, ...item.approximateMatches];
              const previewCover =
                item.coverPreviewUrl || sanitizeCoverUrl(item.draft.coverUrl);

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#B49A67]/25 bg-[#101827]/95 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B49A67]/15 pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        disabled={item.savingState === 'saved'}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((it) =>
                              it.id === item.id ? { ...it, selected: e.target.checked } : it
                            )
                          )
                        }
                        className="h-4 w-4 accent-[#B49A67]"
                      />
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#ECE6D8]">
                        {item.normalizedId ? formatBookIdentifier(item.normalizedId) : item.rawInput}
                      </span>
                      <span className="rounded bg-[#0B1120] px-1.5 py-0.5 text-[10px] font-mono text-[#AEB9C9] uppercase">
                        {item.identifierType}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.isValid && item.savingState !== 'saved' && (
                        <button
                          type="button"
                          onClick={() => handleRetryLookup(item.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#B49A67]/30 px-2 py-1 text-[11px] font-medium text-[#AEB9C9] hover:text-[#ECE6D8]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry Lookup
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setQueue((prev) => prev.filter((it) => it.id !== item.id))
                        }
                        className="rounded-lg p-1 text-rose-400 hover:bg-rose-950/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Invalid Identifier inline fix */}
                  {!item.isValid && (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 space-y-2 text-xs">
                      <p className="text-rose-200">{item.checksumError}</p>
                      <div className="flex gap-2">
                        <input
                          defaultValue={item.rawInput}
                          id={`fix-${item.id}`}
                          placeholder="Enter corrected 10 or 13 digit ISBN/EAN"
                          className="flex-1 rounded-lg border border-rose-500/40 bg-[#0B1120] px-3 py-1.5 font-mono text-xs text-[#ECE6D8]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(
                              `fix-${item.id}`
                            ) as HTMLInputElement | null;
                            if (el?.value) handleFixInvalidItem(item.id, el.value);
                          }}
                          className="rounded-lg bg-[#B49A67] px-3 py-1.5 text-xs font-semibold text-[#0B1120]"
                        >
                          Re-validate &amp; Lookup
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Duplicate Warning & Resolution */}
                  {item.isValid && (item.duplicateInCollection || item.duplicateInBatch) && (
                    <div className="rounded-lg border border-violet-500/40 bg-violet-950/40 p-3 text-xs space-y-2">
                      <div className="flex items-start gap-2 text-violet-200">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          {item.duplicateInCollection ? (
                            <p>
                              Matches existing library volume{' '}
                              <strong>&ldquo;{item.duplicateInCollection.title}&rdquo;</strong> (
                              {item.duplicateInCollection.ownedCopiesCount} owned copy/copies).
                            </p>
                          ) : (
                            <p>
                              This identifier already appears earlier in this batch scan session.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.duplicateInCollection && (
                          <button
                            type="button"
                            onClick={() =>
                              setQueue((prev) =>
                                prev.map((it) =>
                                  it.id === item.id
                                    ? {
                                        ...it,
                                        duplicateAction: 'add_copy',
                                        selected: true,
                                      }
                                    : it
                                )
                              )
                            }
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                              item.duplicateAction === 'add_copy'
                                ? 'border-[#B49A67] bg-[#B49A67] text-[#0B1120]'
                                : 'border-violet-400/40 text-violet-200'
                            }`}
                          >
                            Add Another Physical Copy
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setQueue((prev) =>
                              prev.map((it) =>
                                it.id === item.id
                                  ? {
                                      ...it,
                                      duplicateAction: 'create_new',
                                      selected: true,
                                    }
                                  : it
                              )
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                            item.duplicateAction === 'create_new'
                              ? 'border-[#B49A67] bg-[#B49A67] text-[#0B1120]'
                              : 'border-violet-400/40 text-violet-200'
                          }`}
                        >
                          Register Separately
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQueue((prev) =>
                              prev.map((it) =>
                                it.id === item.id
                                  ? {
                                      ...it,
                                      duplicateAction: 'skip',
                                      selected: false,
                                    }
                                  : it
                              )
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                            item.duplicateAction === 'skip'
                              ? 'border-slate-400 bg-slate-700 text-white'
                              : 'border-violet-400/40 text-violet-200'
                          }`}
                        >
                          Skip Duplicate
                        </button>
                      </div>
                    </div>
                  )}

                  {item.saveError && (
                    <p className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200">
                      Save failed: {item.saveError}
                    </p>
                  )}

                  {/* Editable Metadata Spread (skipped visually when user chose Add Physical Copy) */}
                  {item.isValid &&
                    !(item.duplicateInCollection && item.duplicateAction === 'add_copy') &&
                    item.duplicateAction !== 'skip' && (
                      <div className="flex flex-col sm:flex-row gap-3.5">
                        <div className="w-20 shrink-0 space-y-1.5">
                          {previewCover ? (
                            <img
                              src={previewCover}
                              alt={item.draft.title || 'Book cover'}
                              className="h-28 w-20 rounded-lg object-cover border border-[#B49A67]/30"
                            />
                          ) : (
                            <div className="h-28 w-20 rounded-lg border border-dashed border-[#B49A67]/30 bg-[#0B1120] flex items-center justify-center text-[#AEB9C9]/40">
                              <ImagePlus className="h-5 w-5" />
                            </div>
                          )}
                          <label className="block cursor-pointer rounded border border-[#B49A67]/30 py-1 text-center text-[10px] font-semibold text-[#AEB9C9] hover:text-[#ECE6D8]">
                            Cover
                            <input
                              type="file"
                              accept="image/*"
                              disabled={item.savingState === 'saved'}
                              onChange={(e) =>
                                handleCoverUpload(item.id, e.target.files?.[0] ?? null)
                              }
                              className="hidden"
                            />
                          </label>
                        </div>

                        <div className="flex-1 space-y-2.5 text-xs">
                          {allCandidates.length > 1 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-[#AEB9C9]">
                                Switch Metadata Match:
                              </span>
                              <select
                                value={item.selectedCandidate?.externalId ?? ''}
                                disabled={item.savingState === 'saved'}
                                onChange={(e) => {
                                  const nextCand = allCandidates.find(
                                    (c) => c.externalId === e.target.value
                                  );
                                  if (!nextCand) return;
                                  setQueue((prev) =>
                                    prev.map((it) =>
                                      it.id === item.id
                                        ? {
                                            ...it,
                                            selectedCandidate: nextCand,
                                            draft: candidateToBatchDraft(nextCand, it.draft),
                                          }
                                        : it
                                    )
                                  );
                                }}
                                className="rounded-lg border border-[#B49A67]/30 bg-[#0B1120] px-2.5 py-1 text-xs text-[#ECE6D8]"
                              >
                                {allCandidates.map((c) => (
                                  <option
                                    key={`${c.provider}-${c.externalId}`}
                                    value={c.externalId}
                                  >
                                    [{c.provider}] {c.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-[#AEB9C9] mb-1">
                                Title * {item.status === 'no_match' ? '(Enter manually — ID preserved)' : ''}
                              </label>
                              <input
                                value={item.draft.title}
                                disabled={item.savingState === 'saved'}
                                onChange={(e) =>
                                  updateItemDraft(item.id, { title: e.target.value })
                                }
                                placeholder="Book title required to register"
                                className="w-full rounded-lg border border-[#B49A67]/30 bg-[#0B1120] px-2.5 py-1.5 text-xs text-[#ECE6D8]"
                              />
                            </div>
                            <input
                              value={item.draft.authorsText}
                              disabled={item.savingState === 'saved'}
                              onChange={(e) =>
                                updateItemDraft(item.id, { authorsText: e.target.value })
                              }
                              placeholder="Authors (comma-separated)"
                              className="rounded-lg border border-[#B49A67]/25 bg-[#0B1120] px-2.5 py-1.5 text-xs text-[#ECE6D8]"
                            />
                            <input
                              value={item.draft.publishersText}
                              disabled={item.savingState === 'saved'}
                              onChange={(e) =>
                                updateItemDraft(item.id, { publishersText: e.target.value })
                              }
                              placeholder="Publishers"
                              className="rounded-lg border border-[#B49A67]/25 bg-[#0B1120] px-2.5 py-1.5 text-xs text-[#ECE6D8]"
                            />
                            <div className="grid grid-cols-3 gap-1.5">
                              <select
                                value={item.draft.format}
                                disabled={item.savingState === 'saved'}
                                onChange={(e) =>
                                  updateItemDraft(item.id, {
                                    format: e.target.value as BookFormat,
                                  })
                                }
                                className="rounded-lg border border-[#B49A67]/25 bg-[#0B1120] px-2 py-1.5 text-xs text-[#ECE6D8]"
                              >
                                <option value="paperback">Paperback</option>
                                <option value="hardcover">Hardcover</option>
                                <option value="bunko">Bunko</option>
                                <option value="tankobon">Tankobon</option>
                                <option value="box_set">Box Set</option>
                                <option value="ebook">E-book</option>
                              </select>
                              <select
                                value={item.draft.ownershipStatus}
                                disabled={item.savingState === 'saved'}
                                onChange={(e) =>
                                  updateItemDraft(item.id, {
                                    ownershipStatus: e.target.value as OwnershipStatus,
                                  })
                                }
                                className="rounded-lg border border-[#B49A67]/25 bg-[#0B1120] px-2 py-1.5 text-xs text-[#ECE6D8]"
                              >
                                <option value="owned">Owned</option>
                                <option value="wishlist">Wishlist</option>
                              </select>
                              <input
                                type="number"
                                value={item.draft.publishedYear}
                                disabled={item.savingState === 'saved'}
                                onChange={(e) =>
                                  updateItemDraft(item.id, { publishedYear: e.target.value })
                                }
                                placeholder="Year"
                                className="rounded-lg border border-[#B49A67]/25 bg-[#0B1120] px-2 py-1.5 text-xs font-mono text-[#ECE6D8]"
                              />
                            </div>
                            <input
                              value={item.draft.translatorsText}
                              disabled={item.savingState === 'saved'}
                              onChange={(e) =>
                                updateItemDraft(item.id, { translatorsText: e.target.value })
                              }
                              placeholder="Translators (optional)"
                              className="rounded-lg border border-[#B49A67]/25 bg-[#0B1120] px-2.5 py-1.5 text-xs text-[#ECE6D8]"
                            />
                          </div>

                          {shelves.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-[#AEB9C9]">Shelves:</span>
                              {shelves.map((s) => {
                                const assigned = item.draft.shelfIds.includes(s.id);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    disabled={item.savingState === 'saved'}
                                    onClick={() =>
                                      updateItemDraft(item.id, {
                                        shelfIds: assigned
                                          ? item.draft.shelfIds.filter((sid) => sid !== s.id)
                                          : [...item.draft.shelfIds, s.id],
                                      })
                                    }
                                    className={`rounded border px-2 py-0.5 text-[11px] ${
                                      assigned
                                        ? 'border-[#B49A67] bg-[#B49A67]/20 text-[#D8C9A7]'
                                        : 'border-[#B49A67]/20 text-[#AEB9C9]'
                                    }`}
                                  >
                                    {assigned ? '✓ ' : '+ '}
                                    {s.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
