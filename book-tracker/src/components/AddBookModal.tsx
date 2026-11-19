import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSearch,
  Flashlight,
  ImagePlus,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { saveLocalCoverBlob } from '../services/covers';
import { createBookBundle } from '../services/libraryService';
import {
  buildStructuredContributors,
  mergeCandidateIntoDraft,
  type ManualDraftFields,
} from '../services/metadata/pipeline';
import {
  lookupMetadataWithReportByIsbn,
  recordProviderMetadata,
  searchMetadataWithReportByQuery,
} from '../services/metadataService';
import {
  detectBarcodeFromImageSourceDetailed,
  getCameraTrackTorchSupport,
  getScannerCapabilities,
  mapCameraErrorMessage,
  openCameraStreamWithFallback,
  requestCoverAiAssist,
  runLocalCoverOcr,
  scanVideoFrameForBarcodeDetailed,
  setCameraTrackTorch,
  type BarcodeScanAttemptResult,
} from '../services/scannerAndOcr';
import type {
  AcquisitionMethod,
  BookFormat,
  CopyCondition,
  CurrencyCode,
  FieldProvenanceEntry,
  MetadataCandidate,
  OwnershipStatus,
  ProviderStatusReport,
  ReadingStatus,
  Shelf,
  Work,
} from '../types/domain';
import { CURRENCY_OPTIONS } from '../utils/currency';
import { formatIsbn13, parseIsbn } from '../utils/isbn';
import {
  createInitialScanLookupState,
  createSequentialDecodeRunner,
  transitionOnBarcodeDecoded,
  transitionOnBarcodeNotDetected,
  transitionOnClearScan,
  transitionOnInvalidChecksumFrame,
  transitionOnLookupCompleted,
  transitionOnLookupFailed,
  transitionOnSelectCandidate,
  type AddBookModalTab,
  type ScanLookupUiState,
} from '../utils/scanFlow';

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  existingWorks: Work[];
  shelves: Shelf[];
  defaultCurrency: CurrencyCode;
  aiCoverAssistOptIn: boolean;
  onCreated?: (workId: string) => void;
}

export function AddBookModal({
  open,
  onClose,
  existingWorks,
  shelves,
  defaultCurrency,
  aiCoverAssistOptIn,
  onCreated,
}: AddBookModalProps) {
  const { t } = useI18n();

  // Scanner & lookup state (managed via tested scanFlow transitions)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const decodeRunnerRef = useRef(createSequentialDecodeRunner());
  const scanDetectedRef = useRef(false);
  const lastSubmittedIsbnRef = useRef<string | null>(null);
  const [scanUi, setScanUi] = useState<ScanLookupUiState>(() => createInitialScanLookupState('isbn'));
  const [searchQuery, setSearchQuery] = useState('');
  const [cameraResolution, setCameraResolution] = useState<string | null>(null);
  const [cameraProfile, setCameraProfile] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanModeLabel, setScanModeLabel] = useState<'camera' | 'upload'>('camera');
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null);
  const [copiedIsbn, setCopiedIsbn] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const {
    tab,
    cameraActive,
    cameraError,
    scannedIsbn,
    decodedRawValue,
    decodedFormat,
    decodedChecksumError,
    scanAttempted,
    isbnInput,
    loadingLookup,
    hasSearched,
    candidates,
    possibleEditionMatches,
    relatedEditions,
    workMatches,
    approximateMatches,
    providerStatuses,
    stagesExecuted,
    selectedCandidate,
    lookupFromCache,
    lastAttemptDiagnostics,
  } = scanUi;

  const setTab = (nextTab: AddBookModalTab) =>
    setScanUi((prev) => ({ ...prev, tab: nextTab }));
  const setIsbnInput = (val: string) =>
    setScanUi((prev) => ({ ...prev, isbnInput: val }));

  // OCR / Cover state
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);

  // Editable Work / Edition / Copy / Reading form
  const [linkToWorkId, setLinkToWorkId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [translatorsText, setTranslatorsText] = useState('');
  const [illustratorsText, setIllustratorsText] = useState('');
  const [publishersText, setPublishersText] = useState('');
  const [publishingPartner, setPublishingPartner] = useState('');
  const [genresText, setGenresText] = useState('');
  const [language, setLanguage] = useState('vi');
  const [format, setFormat] = useState<BookFormat>('paperback');
  const [pageCount, setPageCount] = useState('');
  const [publishedYear, setPublishedYear] = useState('');
  const [editionName, setEditionName] = useState('');
  const [seriesName, setSeriesName] = useState('');
  const [volumeNumber, setVolumeNumber] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [description, setDescription] = useState('');
  const [editorsText, setEditorsText] = useState('');
  const [userEditedFields, setUserEditedFields] = useState<Set<keyof ManualDraftFields>>(new Set());
  const [fieldProvenance, setFieldProvenance] = useState<Record<string, FieldProvenanceEntry>>({});

  // Physical Copy section
  const [trackCopy, setTrackCopy] = useState(true);
  const [ownershipStatus, setOwnershipStatus] = useState<OwnershipStatus>('owned');
  const [condition, setCondition] = useState<CopyCondition>('new');
  const [acquisitionMethod, setAcquisitionMethod] = useState<AcquisitionMethod>('purchased');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [seller, setSeller] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [copyNotes, setCopyNotes] = useState('');

  const [initialReadingStatus, setInitialReadingStatus] = useState<ReadingStatus | ''>('want_to_read');
  const [selectedShelves, setSelectedShelves] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);

  const markUserEdited = (
    field: Exclude<keyof ManualDraftFields, 'fieldProvenance'>,
    provKey?: string
  ) => {
    setUserEditedFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    const key = provKey ?? field.replace(/Text$/, '').replace(/^isbnInput$/, 'isbn13');
    setFieldProvenance((prev) => ({
      ...prev,
      [key]: { provider: 'manual', trust: 'manual' },
    }));
  };

  const stopCamera = () => {
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
    setCameraResolution(null);
    setScanUi((prev) => (prev.cameraActive ? { ...prev, cameraActive: false } : prev));
  };

  useEffect(() => {
    if (!open || tab !== 'scan') {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, tab]);

  const handleIsbnLookup = async (
    overrideIsbn?: string,
    lookupOpts?: { bypassCache?: boolean; retryFailedOnly?: boolean }
  ) => {
    const raw = (overrideIsbn ?? isbnInput).trim();
    if (!raw) return;
    setScanUi((prev) => ({ ...prev, loadingLookup: true, hasSearched: true }));
    setErrorMsg(null);
    try {
      const res = await lookupMetadataWithReportByIsbn(raw, {
        bypassCache: lookupOpts?.bypassCache,
        retryFailedOnly: lookupOpts?.retryFailedOnly,
      });
      setScanUi((prev) => transitionOnLookupCompleted(prev, res));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lookup failed');
      setScanUi((prev) => transitionOnLookupFailed(prev));
    }
  };

  useEffect(() => {
    if (!cameraActive) return;
    scanDetectedRef.current = false;
    let cancelled = false;
    let frameIndex = 0;
    let lastCompletedAt = 0;

    if (!scratchCanvasRef.current) {
      scratchCanvasRef.current = document.createElement('canvas');
    }

    const tick = () => {
      if (cancelled || scanDetectedRef.current) return;
      const video = videoRef.current;
      const now = performance.now();

      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !decodeRunnerRef.current.isBusy() &&
        now - lastCompletedAt >= 70
      ) {
        const currentFrame = frameIndex++;
        setCameraResolution(`${video.videoWidth} × ${video.videoHeight}`);

        void decodeRunnerRef.current
          .run(async () => {
            return scanVideoFrameForBarcodeDetailed(video, scratchCanvasRef.current!, {
              frameIndex: currentFrame,
            });
          })
          .then((attempt) => {
            lastCompletedAt = performance.now();
            if (!attempt || cancelled || scanDetectedRef.current) return;
            setLastAttemptAt(new Date().toLocaleTimeString());

            if (attempt.validIsbn13) {
              scanDetectedRef.current = true;
              const decodedIsbn = attempt.validIsbn13;
              stopCamera();
              setScanUi((prev) =>
                transitionOnBarcodeDecoded(prev, decodedIsbn, {
                  rawValue: attempt.rawValue,
                  format: attempt.format,
                  diagnostics: attempt,
                })
              );
              if (lastSubmittedIsbnRef.current !== decodedIsbn) {
                lastSubmittedIsbnRef.current = decodedIsbn;
                void handleIsbnLookup(decodedIsbn);
              }
            } else if (attempt.rawValue && attempt.checksumError) {
              setScanUi((prev) => transitionOnInvalidChecksumFrame(prev, attempt));
            } else {
              setScanUi((prev) => ({ ...prev, lastAttemptDiagnostics: attempt }));
            }
          });
      }

      if (!cancelled && !scanDetectedRef.current) {
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
  }, [cameraActive]);

  if (!open) return null;

  const startCamera = async () => {
    setScanUi((prev) => ({
      ...prev,
      cameraError: null,
      decodedChecksumError: null,
    }));
    setScanModeLabel('camera');
    scanDetectedRef.current = false;
    lastSubmittedIsbnRef.current = null;
    try {
      const { stream, profile } = await openCameraStreamWithFallback();
      streamRef.current = stream;
      setCameraProfile(profile);
      setTorchSupported(getCameraTrackTorchSupport(stream));
      setTorchEnabled(false);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
          setCameraResolution(`${videoRef.current.videoWidth} × ${videoRef.current.videoHeight}`);
        }
      }
      setScanUi((prev) => ({ ...prev, cameraActive: true }));
    } catch (err) {
      setScanUi((prev) => ({
        ...prev,
        cameraError: mapCameraErrorMessage(err),
      }));
    }
  };

  const toggleTorch = async () => {
    const next = !torchEnabled;
    const ok = await setCameraTrackTorch(streamRef.current, next);
    if (ok) setTorchEnabled(next);
  };

  const handleCopyScannedIsbn = async () => {
    if (!scannedIsbn) return;
    try {
      await navigator.clipboard.writeText(scannedIsbn);
      setCopiedIsbn(true);
      window.setTimeout(() => setCopiedIsbn(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted iframe
    }
  };

  const clearScanResult = () => {
    lastSubmittedIsbnRef.current = null;
    setCopiedIsbn(false);
    setScanUi((prev) => transitionOnClearScan(prev));
  };

  const applyCandidateToForm = (cand: MetadataCandidate) => {
    setScanUi((prev) => transitionOnSelectCandidate(prev, cand));
    const merged = mergeCandidateIntoDraft(
      {
        title,
        originalTitle,
        authorsText,
        translatorsText,
        illustratorsText,
        publishersText,
        publishingPartner,
        genresText,
        language,
        pageCount,
        publishedYear,
        seriesName,
        volumeNumber,
        coverUrl,
        description,
        isbnInput,
        fieldProvenance,
      },
      cand,
      userEditedFields
    );
    setTitle(merged.title);
    setOriginalTitle(merged.originalTitle);
    setAuthorsText(merged.authorsText);
    setTranslatorsText(merged.translatorsText);
    setIllustratorsText(merged.illustratorsText);
    if (cand.editors?.length && !editorsText.trim()) setEditorsText(cand.editors.join(', '));
    setPublishersText(merged.publishersText);
    setPublishingPartner(merged.publishingPartner);
    setGenresText(merged.genresText);
    setLanguage(merged.language);
    if (cand.editionName && !editionName.trim()) setEditionName(cand.editionName);
    if (cand.format) setFormat(cand.format);
    setPageCount(merged.pageCount);
    setPublishedYear(merged.publishedYear);
    setSeriesName(merged.seriesName);
    setVolumeNumber(merged.volumeNumber);
    setCoverUrl(merged.coverUrl);
    setDescription(merged.description);
    if (merged.isbnInput) setIsbnInput(merged.isbnInput);
    if (merged.fieldProvenance) setFieldProvenance(merged.fieldProvenance);
  };

  const handleQuerySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setScanUi((prev) => ({ ...prev, loadingLookup: true, hasSearched: true }));
    setErrorMsg(null);
    try {
      const res = await searchMetadataWithReportByQuery(searchQuery);
      setScanUi((prev) => transitionOnLookupCompleted(prev, res));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Search failed');
      setScanUi((prev) => ({ ...prev, loadingLookup: false }));
    }
  };

  const handleBarcodeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopCamera();
    setScanModeLabel('upload');
    lastSubmittedIsbnRef.current = null;
    setScanUi((prev) => ({ ...prev, loadingLookup: true, cameraError: null }));
    try {
      const attempt = await detectBarcodeFromImageSourceDetailed(file);
      setLastAttemptAt(new Date().toLocaleTimeString());
      if (attempt.validIsbn13) {
        const isbn = attempt.validIsbn13;
        lastSubmittedIsbnRef.current = isbn;
        setScanUi((prev) =>
          transitionOnBarcodeDecoded(prev, isbn, {
            rawValue: attempt.rawValue,
            format: attempt.format,
            diagnostics: attempt,
          })
        );
        await handleIsbnLookup(isbn);
      } else {
        const message = attempt.checksumError
          ? `${attempt.checksumError}. Try another photo or enter manually.`
          : 'No valid ISBN-13/10 barcode detected in image. Try a sharper photo, OCR, or manual ISBN.';
        setScanUi((prev) => transitionOnBarcodeNotDetected(prev, message, attempt));
        setScanUi((prev) => ({ ...prev, loadingLookup: false }));
      }
    } catch (err) {
      setScanUi((prev) => ({
        ...prev,
        loadingLookup: false,
        cameraError: err instanceof Error ? err.message : 'Barcode image decoding failed.',
      }));
    }
  };

  const handleCoverPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverPreviewUrl(URL.createObjectURL(file));
  };

  const handleRunLocalOcr = async () => {
    if (!coverFile) return;
    setOcrRunning(true);
    setOcrStatus('Running local Tesseract OCR in background worker...');
    try {
      const res = await runLocalCoverOcr(coverFile);
      if (res.detectedIsbns.length > 0) {
        setIsbnInput(res.detectedIsbns[0]);
        setOcrStatus(`Detected ISBN ${formatIsbn13(res.detectedIsbns[0])}`);
      } else {
        setOcrStatus('Extracted cover text candidates — please verify fields below.');
      }
      if (!title && res.candidateTitle) setTitle(res.candidateTitle);
      if (!authorsText && res.candidateAuthor) setAuthorsText(res.candidateAuthor);
    } catch (err) {
      setOcrStatus(err instanceof Error ? err.message : 'Local OCR failed');
    } finally {
      setOcrRunning(false);
    }
  };

  const handleRunOptInAi = async () => {
    if (!coverFile) return;
    setOcrRunning(true);
    setOcrStatus('Running opt-in AI cover recognition...');
    try {
      const cand = await requestCoverAiAssist(coverFile, aiCoverAssistOptIn);
      applyCandidateToForm(cand);
      setOcrStatus('AI candidate loaded (unverified — please verify before saving).');
    } catch (err) {
      setOcrStatus(err instanceof Error ? err.message : 'AI cover recognition unavailable');
    } finally {
      setOcrRunning(false);
    }
  };

  const parsedIsbn = isbnInput.trim() ? parseIsbn(isbnInput.trim()) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !linkToWorkId) {
      setErrorMsg('Book title is required.');
      return;
    }
    if (isbnInput.trim() && parsedIsbn && !parsedIsbn.isValid) {
      setErrorMsg('Entered ISBN check digit is invalid. Correct it or clear the ISBN field.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const authors = authorsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const translators = translatorsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const illustrators = illustratorsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const editors = editorsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const publishers = publishersText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const genres = genresText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const contributors = buildStructuredContributors({
        authors,
        illustrators,
        translators,
        editors,
      });

      const selectedWork = existingWorks.find((w) => w.id === linkToWorkId);
      const bundle = await createBookBundle({
        workId: linkToWorkId || undefined,
        work: {
          title: selectedWork ? selectedWork.title : title.trim(),
          originalTitle: originalTitle.trim() || undefined,
          authors,
          illustrators,
          genres,
          description: description.trim() || undefined,
          originalLanguage: selectedCandidate?.originalTitle ? undefined : language,
          firstPublishedYear: publishedYear ? Number(publishedYear) || null : null,
          seriesName: seriesName.trim() || undefined,
          seriesIndex: volumeNumber.trim() || undefined,
          metadataSource: selectedCandidate?.provider ?? 'manual',
          metadataVerified: true,
          fieldProvenance: Object.keys(fieldProvenance).length ? fieldProvenance : undefined,
        },
        edition: {
          title: title.trim() || selectedWork?.title || 'Untitled Edition',
          editionName: editionName.trim() || undefined,
          translators,
          illustrators,
          editors,
          contributors,
          publishers,
          publishingPartner: publishingPartner.trim() || undefined,
          publishedYear: publishedYear ? Number(publishedYear) || null : null,
          language,
          format,
          pageCount: pageCount ? Number(pageCount) || null : null,
          seriesName: seriesName.trim() || undefined,
          volumeNumber: volumeNumber.trim() || undefined,
          coverUrl: coverUrl.trim() || undefined,
          description: description.trim() || undefined,
          metadataSource: selectedCandidate?.provider ?? 'manual',
          metadataVerified: true,
          fieldProvenance: Object.keys(fieldProvenance).length ? fieldProvenance : undefined,
        },
        isbnInput: isbnInput.trim() || undefined,
        createCopy: trackCopy,
        copy: trackCopy
          ? {
              ownershipStatus,
              format,
              condition,
              acquisitionMethod,
              purchaseDate: purchaseDate || undefined,
              purchasePrice: purchasePrice ? Number(purchasePrice) : null,
              currency,
              seller: seller.trim() || undefined,
              shelfLocation: shelfLocation.trim() || undefined,
              notes: copyNotes.trim() || undefined,
            }
          : undefined,
        initialReadingStatus: initialReadingStatus || undefined,
        shelfIds: selectedShelves,
      });

      if (coverFile) {
        await saveLocalCoverBlob(bundle.edition.id, coverFile);
      }
      if (selectedCandidate) {
        await recordProviderMetadata({
          workId: bundle.work.id,
          editionId: bundle.edition.id,
          candidate: selectedCandidate,
        });
      }

      onCreated?.(bundle.work.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save book');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-800 px-5 py-4">
          <h2 className="font-editorial text-lg font-semibold text-stone-900 dark:text-slate-100">
            {t('action.addBook')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-4 border-b border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 pt-2 gap-1">
          {(
            [
              ['scan', t('addBook.tabScan'), Camera],
              ['isbn', t('addBook.tabIsbn'), FileSearch],
              ['search', t('addBook.tabSearch'), Search],
              ['manual', t('addBook.tabManual'), Sparkles],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-[#C2410C] text-[#C2410C] bg-amber-50/40 dark:bg-slate-800/60'
                  : 'border-transparent text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'scan' && (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-stone-300 dark:border-slate-700 bg-stone-900 flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                {cameraActive && (
                  <>
                    {/* Non-blocking visual framing guide — full frame + lower/edge regions remain active */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
                      <div className="relative h-32 w-64 sm:w-80 rounded-xl border-2 border-dashed border-amber-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
                      <span className="mt-3 rounded-md bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">
                        Full-frame multi-region scan active — hold steady
                      </span>
                    </div>
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-2">
                      {torchSupported && (
                        <button
                          type="button"
                          onClick={toggleTorch}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            torchEnabled
                              ? 'bg-amber-400 text-stone-950'
                              : 'bg-black/65 text-white hover:bg-black/80'
                          }`}
                        >
                          <Flashlight className="h-3.5 w-3.5" />
                          {torchEnabled ? 'Torch On' : 'Torch'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="rounded-lg bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
                      >
                        Stop
                      </button>
                    </div>
                  </>
                )}
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
                    <Camera className="h-10 w-10 text-amber-400" />
                    <p className="text-sm max-w-sm">
                      Point the camera at the EAN-13 barcode on the back cover. Results appear right below without switching tabs.
                    </p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="min-h-[44px] rounded-xl bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9A3412]"
                    >
                      {scannedIsbn ? 'Scan Another Barcode' : 'Start Camera Scanner'}
                    </button>
                  </div>
                )}
              </div>
              {cameraError && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  {cameraError}
                </p>
              )}
              {!scannedIsbn && decodedChecksumError && cameraActive && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  Read partial/invalid barcode ({decodedRawValue}): {decodedChecksumError}. Keep holding steady...
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-xs text-stone-600 dark:text-slate-400">
                  Or upload a photo of the barcode:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-slate-700 px-2.5 py-2 text-xs font-medium text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Scanner Diagnostics
                  </button>
                  <label className="cursor-pointer rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800">
                    Choose Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBarcodeImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {showDiagnostics && (
                <ScannerDiagnosticsPanel
                  cameraActive={cameraActive}
                  cameraResolution={cameraResolution}
                  cameraProfile={cameraProfile}
                  scanMode={scanModeLabel}
                  lastAttemptAt={lastAttemptAt}
                  diagnostics={lastAttemptDiagnostics}
                  decodedRawValue={decodedRawValue}
                  decodedFormat={decodedFormat}
                  decodedChecksumError={decodedChecksumError}
                  scannedIsbn={scannedIsbn}
                />
              )}

              {/* Same-screen Decoded ISBN + Lookup Results Area */}
              {(scannedIsbn || loadingLookup || scanAttempted) && (
                <div className="space-y-3 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-4">
                  {scannedIsbn && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 dark:border-slate-800 pb-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Decoded ISBN
                          </span>
                          <span className="font-mono text-sm font-bold text-stone-900 dark:text-slate-100 tabular-nums">
                            {formatIsbn13(scannedIsbn)}
                          </span>
                          {decodedFormat && (
                            <span className="rounded bg-stone-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-stone-600 dark:text-slate-300">
                              {decodedFormat}
                            </span>
                          )}
                          {lookupFromCache && (
                            <span className="rounded bg-stone-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-stone-500">
                              Cached
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-stone-500">
                          Raw: {decodedRawValue || scannedIsbn}
                          {parseIsbn(scannedIsbn).isbn10 ? ` · ISBN-10: ${parseIsbn(scannedIsbn).isbn10}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyScannedIsbn}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-stone-50 dark:hover:bg-slate-800"
                        >
                          {copiedIsbn ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedIsbn ? 'Copied' : 'Copy ISBN'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleIsbnLookup(scannedIsbn, { bypassCache: true })}
                          disabled={loadingLookup}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={clearScanResult}
                          className="rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab('manual')}
                          className="rounded-lg bg-stone-900 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Enter Manually
                        </button>
                      </div>
                    </div>
                  )}

                  {errorMsg && (
                    <p className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                      {errorMsg}
                    </p>
                  )}

                  {!loadingLookup && providerStatuses.length > 0 && (
                    <ProviderStatusStrip
                      statuses={providerStatuses}
                      stagesExecuted={stagesExecuted}
                      onRetryFailed={
                        scannedIsbn
                          ? () => handleIsbnLookup(scannedIsbn, { retryFailedOnly: true })
                          : undefined
                      }
                    />
                  )}

                  <CandidateResultsList
                    candidates={candidates}
                    possibleEditionMatches={possibleEditionMatches}
                    relatedEditions={relatedEditions}
                    workMatches={workMatches}
                    approximateMatches={approximateMatches}
                    loading={loadingLookup}
                    hasSearched={hasSearched}
                    queriedIsbn={scannedIsbn}
                    onSelect={applyCandidateToForm}
                    onRetry={scannedIsbn ? () => handleIsbnLookup(scannedIsbn, { bypassCache: true }) : undefined}
                    onSwitchManual={() => setTab('manual')}
                  />
                </div>
              )}
            </div>
          )}

          {tab === 'isbn' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={isbnInput}
                  onChange={(e) => setIsbnInput(e.target.value)}
                  placeholder="9780140449136, 9784088820200, or 9786042243568"
                  className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-mono tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => handleIsbnLookup()}
                  disabled={loadingLookup || !isbnInput.trim()}
                  className="min-h-[44px] rounded-xl bg-stone-900 dark:bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loadingLookup ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
                </button>
              </div>
              {parsedIsbn && (
                <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs flex flex-wrap items-center gap-3">
                  <span className={parsedIsbn.isValid ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-red-600 font-semibold'}>
                    {parsedIsbn.isValid ? 'Valid ISBN' : 'Invalid ISBN check digit'}
                  </span>
                  {parsedIsbn.isbn13 && <span className="font-mono">ISBN-13: {parsedIsbn.isbn13}</span>}
                  {parsedIsbn.prefixGroup === '978' && parsedIsbn.isbn10 && (
                    <span className="font-mono text-stone-500">ISBN-10: {parsedIsbn.isbn10}</span>
                  )}
                  {parsedIsbn.prefixGroup === '979' && (
                    <span className="text-stone-500">979-* prefix (no ISBN-10 equivalent)</span>
                  )}
                </div>
              )}
              {!loadingLookup && providerStatuses.length > 0 && (
                <ProviderStatusStrip
                  statuses={providerStatuses}
                  stagesExecuted={stagesExecuted}
                  onRetryFailed={
                    isbnInput.trim()
                      ? () => handleIsbnLookup(undefined, { retryFailedOnly: true })
                      : undefined
                  }
                />
              )}
              <CandidateResultsList
                candidates={candidates}
                possibleEditionMatches={possibleEditionMatches}
                relatedEditions={relatedEditions}
                workMatches={workMatches}
                approximateMatches={approximateMatches}
                loading={loadingLookup}
                hasSearched={hasSearched}
                queriedIsbn={parsedIsbn?.isbn13 ?? (isbnInput.trim() || null)}
                onSelect={applyCandidateToForm}
                onRetry={isbnInput.trim() ? () => handleIsbnLookup(undefined, { bypassCache: true }) : undefined}
                onSwitchManual={() => setTab('manual')}
              />
            </div>
          )}

          {tab === 'search' && (
            <div className="space-y-4">
              <form onSubmit={handleQuerySearch} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Title, author, or publisher..."
                  className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={loadingLookup || !searchQuery.trim()}
                  className="min-h-[44px] rounded-xl bg-stone-900 dark:bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loadingLookup ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </button>
              </form>
              {!loadingLookup && providerStatuses.length > 0 && (
                <ProviderStatusStrip statuses={providerStatuses} stagesExecuted={stagesExecuted} />
              )}
              <CandidateResultsList
                candidates={candidates}
                possibleEditionMatches={possibleEditionMatches}
                relatedEditions={relatedEditions}
                workMatches={workMatches}
                approximateMatches={[]}
                loading={loadingLookup}
                hasSearched={hasSearched}
                queriedIsbn={null}
                onSelect={applyCandidateToForm}
                onSwitchManual={() => setTab('manual')}
              />
            </div>
          )}

          {tab === 'manual' && (
            <form id="add-book-form" onSubmit={handleSubmit} className="space-y-5">
              {(selectedCandidate || Object.keys(fieldProvenance).length > 0) && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {selectedCandidate
                        ? <>Candidate loaded from <strong>{(selectedCandidate.sources ?? [selectedCandidate.provider]).join(' + ')}</strong> (verify any fields before saving).</>
                        : 'Manual entry active.'}
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-amber-700 shrink-0" />
                  </div>
                  {Object.keys(fieldProvenance).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-stone-600 dark:text-slate-300">
                      {Object.entries(fieldProvenance)
                        .slice(0, 7)
                        .map(([field, entry]) => (
                          <span
                            key={field}
                            className="rounded bg-white/80 dark:bg-slate-900 px-1.5 py-0.5 border border-stone-200/70 dark:border-slate-700"
                          >
                            {field}: {entry.provider} ({entry.trust})
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cover upload + local OCR + opt-in AI assist */}
              <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {coverPreviewUrl || coverUrl ? (
                      <img
                        src={coverPreviewUrl || coverUrl}
                        alt="Cover preview"
                        className="h-20 w-14 rounded-md object-cover border border-stone-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="flex h-20 w-14 items-center justify-center rounded-md border border-dashed border-stone-300 dark:border-slate-700 text-stone-400">
                        <ImagePlus className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-stone-900 dark:text-slate-100">
                        Front Cover Photo &amp; Local OCR
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Stored offline locally and synced to private Storage when online.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800">
                      Upload Cover
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCoverPhotoSelect}
                        className="hidden"
                      />
                    </label>
                    {coverFile && (
                      <>
                        <button
                          type="button"
                          onClick={handleRunLocalOcr}
                          disabled={ocrRunning}
                          className="rounded-lg bg-stone-900 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {ocrRunning ? 'Processing...' : 'Local OCR'}
                        </button>
                        {aiCoverAssistOptIn && (
                          <button
                            type="button"
                            onClick={handleRunOptInAi}
                            disabled={ocrRunning}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#C2410C] px-3 py-1.5 text-xs font-semibold text-[#C2410C] hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            AI Assist
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {ocrStatus && <p className="text-xs text-stone-600 dark:text-slate-300">{ocrStatus}</p>}
              </div>

              {/* Link to existing Work OR create new Work */}
              {existingWorks.length > 0 && (
                <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <label className="block text-xs font-semibold text-stone-700 dark:text-slate-300 mb-1">
                    Attach as another edition of an existing Work (optional — never auto-merged)
                  </label>
                  <select
                    value={linkToWorkId}
                    onChange={(e) => setLinkToWorkId(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  >
                    <option value="">Create a new Work</option>
                    {existingWorks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title} {w.authors.length ? `— ${w.authors.join(', ')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Work & Edition bibliographic fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Title *</label>
                  <input
                    required={!linkToWorkId}
                    value={title}
                    onChange={(e) => {
                      markUserEdited('title');
                      setTitle(e.target.value);
                    }}
                    placeholder="Edition or book title"
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Authors (comma-separated)</label>
                  <input
                    value={authorsText}
                    onChange={(e) => {
                      markUserEdited('authorsText');
                      setAuthorsText(e.target.value);
                    }}
                    placeholder="Takata, Rin Murakami..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">ISBN-13 / ISBN-10</label>
                  <input
                    value={isbnInput}
                    onChange={(e) => {
                      markUserEdited('isbnInput');
                      setIsbnInput(e.target.value);
                    }}
                    placeholder="978..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Original Title</label>
                  <input
                    value={originalTitle}
                    onChange={(e) => {
                      markUserEdited('originalTitle');
                      setOriginalTitle(e.target.value);
                    }}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Translators</label>
                  <input
                    value={translatorsText}
                    onChange={(e) => {
                      markUserEdited('translatorsText');
                      setTranslatorsText(e.target.value);
                    }}
                    placeholder="Thế Đăng, KPS..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Illustrators (Minh họa)</label>
                  <input
                    value={illustratorsText}
                    onChange={(e) => {
                      markUserEdited('illustratorsText');
                      setIllustratorsText(e.target.value);
                    }}
                    placeholder="Mako Tatekawa..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Publishers</label>
                  <input
                    value={publishersText}
                    onChange={(e) => {
                      markUserEdited('publishersText');
                      setPublishersText(e.target.value);
                    }}
                    placeholder="NXB Kim Đồng, Amak Books..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Publishing Partner (NXB liên kết)</label>
                  <input
                    value={publishingPartner}
                    onChange={(e) => {
                      markUserEdited('publishingPartner');
                      setPublishingPartner(e.target.value);
                    }}
                    placeholder="NXB Hà Nội, NXB Văn học..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Edition Name</label>
                  <input
                    value={editionName}
                    onChange={(e) => setEditionName(e.target.value)}
                    placeholder="Bìa cứng giới hạn, Revised Ed..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Language</label>
                  <input
                    value={language}
                    onChange={(e) => {
                      markUserEdited('language');
                      setLanguage(e.target.value);
                    }}
                    placeholder="vi, en, ja..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as BookFormat)}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="paperback">Paperback</option>
                    <option value="hardcover">Hardcover</option>
                    <option value="bunko">Bunko</option>
                    <option value="tankobon">Tankobon</option>
                    <option value="box_set">Box Set</option>
                    <option value="ebook">E-book</option>
                    <option value="audiobook">Audiobook</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Page Count</label>
                  <input
                    type="number"
                    min={0}
                    value={pageCount}
                    onChange={(e) => {
                      markUserEdited('pageCount');
                      setPageCount(e.target.value);
                    }}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Published Year</label>
                  <input
                    type="number"
                    value={publishedYear}
                    onChange={(e) => {
                      markUserEdited('publishedYear');
                      setPublishedYear(e.target.value);
                    }}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Series &amp; Volume</label>
                  <div className="flex gap-2">
                    <input
                      value={seriesName}
                      onChange={(e) => {
                        markUserEdited('seriesName');
                        setSeriesName(e.target.value);
                      }}
                      placeholder="Series"
                      className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      value={volumeNumber}
                      onChange={(e) => {
                        markUserEdited('volumeNumber');
                        setVolumeNumber(e.target.value);
                      }}
                      placeholder="Vol"
                      className="w-20 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Genres (comma-separated)</label>
                  <input
                    value={genresText}
                    onChange={(e) => {
                      markUserEdited('genresText');
                      setGenresText(e.target.value);
                    }}
                    placeholder="Fiction, Mystery, Light Novel..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Cover Image URL (optional)</label>
                  <input
                    value={coverUrl}
                    onChange={(e) => {
                      markUserEdited('coverUrl');
                      setCoverUrl(e.target.value);
                    }}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Physical Copy Tracking */}
              <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-stone-700 dark:text-slate-300">
                    Physical Copy Record
                  </span>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trackCopy}
                      onChange={(e) => setTrackCopy(e.target.checked)}
                    />
                    Create physical copy record
                  </label>
                </div>

                {trackCopy && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Ownership</label>
                      <select
                        value={ownershipStatus}
                        onChange={(e) => setOwnershipStatus(e.target.value as OwnershipStatus)}
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      >
                        <option value="owned">Owned</option>
                        <option value="wishlist">Wishlist</option>
                        <option value="ordered">Ordered</option>
                        <option value="sold">Sold</option>
                        <option value="given_away">Given Away</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Condition</label>
                      <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value as CopyCondition)}
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      >
                        <option value="new">New</option>
                        <option value="like_new">Like New</option>
                        <option value="very_good">Very Good</option>
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="poor">Poor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Acquisition</label>
                      <select
                        value={acquisitionMethod}
                        onChange={(e) => setAcquisitionMethod(e.target.value as AcquisitionMethod)}
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      >
                        <option value="purchased">Purchased</option>
                        <option value="gift">Gift</option>
                        <option value="exchange">Exchange</option>
                        <option value="review_copy">Review Copy</option>
                        <option value="inherited">Inherited</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Purchase Price</label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          placeholder="120000"
                          className="flex-1 min-w-0 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs tabular-nums"
                        />
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                          className="w-20 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-2 text-xs font-mono"
                        >
                          {CURRENCY_OPTIONS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Seller / Shop</label>
                      <input
                        value={seller}
                        onChange={(e) => setSeller(e.target.value)}
                        placeholder="Fahasa, Tiki, Bookish..."
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Shelf Location</label>
                      <input
                        value={shelfLocation}
                        onChange={(e) => setShelfLocation(e.target.value)}
                        placeholder="Case A / Row 2"
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Purchase Date</label>
                      <input
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium mb-1">Copy Notes</label>
                      <input
                        value={copyNotes}
                        onChange={(e) => setCopyNotes(e.target.value)}
                        placeholder="First printing, obi intact, signed..."
                        className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Initial Reading Status & Custom Shelves */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Initial Reading Status</label>
                  <select
                    value={initialReadingStatus}
                    onChange={(e) => setInitialReadingStatus(e.target.value as ReadingStatus | '')}
                    className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  >
                    <option value="">No reading cycle yet</option>
                    <option value="want_to_read">Want to Read</option>
                    <option value="currently_reading">Currently Reading</option>
                    <option value="finished">Finished</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Custom Shelves</label>
                  {shelves.length === 0 ? (
                    <p className="text-xs text-stone-500 py-2">No custom shelves created yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {shelves.map((s) => {
                        const checked = selectedShelves.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setSelectedShelves((prev) =>
                                checked ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                              )
                            }
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              checked
                                ? 'border-[#C2410C] bg-amber-50 dark:bg-amber-950/40 text-[#C2410C]'
                                : 'border-stone-300 dark:border-slate-700 text-stone-600 dark:text-slate-300'
                            }`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {errorMsg && (
                <p className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </p>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-stone-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-stone-700 dark:text-slate-200"
          >
            {t('action.cancel')}
          </button>
          {tab === 'manual' ? (
            <button
              type="submit"
              form="add-book-form"
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-[#C2410C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Book to Library'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTab('manual')}
              className="min-h-[44px] rounded-xl bg-stone-900 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
            >
              Continue to Editor
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ScannerDiagnosticsPanel({
  cameraActive,
  cameraResolution,
  cameraProfile,
  scanMode,
  lastAttemptAt,
  diagnostics,
  decodedRawValue,
  decodedFormat,
  decodedChecksumError,
  scannedIsbn,
}: {
  cameraActive: boolean;
  cameraResolution: string | null;
  cameraProfile: string | null;
  scanMode: 'camera' | 'upload';
  lastAttemptAt: string | null;
  diagnostics: BarcodeScanAttemptResult | null;
  decodedRawValue: string | null;
  decodedFormat: string | null;
  decodedChecksumError: string | null;
  scannedIsbn: string | null;
}) {
  const caps = getScannerCapabilities();
  const nativeAvail = diagnostics?.nativeSupported ?? caps.nativeSupported;
  const zxStatus = diagnostics?.zxingStatus ?? caps.zxingStatus;

  return (
    <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900/90 p-3 text-[11px] font-mono space-y-1.5 text-stone-700 dark:text-slate-300">
      <div className="flex items-center justify-between font-sans text-xs font-semibold text-stone-900 dark:text-slate-100">
        <span>Scanner Diagnostics (local only — no frames uploaded)</span>
        {diagnostics && <span className="font-mono text-[10px] text-stone-500">{diagnostics.durationMs}ms</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <div>
          Camera: {cameraActive ? `${cameraResolution || 'Starting'} (${cameraProfile || 'default'})` : 'Inactive'}
        </div>
        <div>Mode: {scanMode === 'camera' ? 'Live Camera (Multi-Region)' : 'Uploaded Photo (Multi-Region)'}</div>
        <div>Native BarcodeDetector: {nativeAvail ? 'Supported' : 'Unavailable'}</div>
        <div>ZXing WASM: {zxStatus}{caps.zxingError ? ` (${caps.zxingError})` : ''}</div>
        <div>Last attempt: {lastAttemptAt || 'None yet'}</div>
        <div>Decoder used: {diagnostics?.decoderUsed || 'None'}</div>
        <div>Raw value: {decodedRawValue || diagnostics?.rawValue || '—'}</div>
        <div>Barcode format: {decodedFormat || diagnostics?.format || '—'}</div>
        <div className="sm:col-span-2">
          ISBN validation:{' '}
          {scannedIsbn
            ? `Valid ISBN-13 (${scannedIsbn})`
            : decodedChecksumError || diagnostics?.checksumError || 'No valid ISBN decoded'}
        </div>
        {diagnostics && diagnostics.regionsExamined.length > 0 && (
          <div className="sm:col-span-2 break-words text-stone-500">
            Regions examined: {diagnostics.regionsExamined.join(', ')}
            {diagnostics.matchedRegion ? ` -> matched in ${diagnostics.matchedRegion}` : ''}
          </div>
        )}
        {diagnostics?.error && (
          <div className="sm:col-span-2 text-amber-700 dark:text-amber-400">
            Decoder error: {diagnostics.error}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderStatusStrip({
  statuses,
  stagesExecuted,
  onRetryFailed,
}: {
  statuses: ProviderStatusReport[];
  stagesExecuted?: string[];
  onRetryFailed?: () => void;
}) {
  const exactMatched = statuses.filter((s) => s.status === 'exact_match');
  const approxMatched = statuses.filter((s) => s.status === 'approximate_match');
  const noMatchCount = statuses.filter((s) => s.status === 'no_match').length;
  const retryableCount = statuses.filter(
    (s) => s.status === 'timeout' || s.status === 'upstream_error' || s.status === 'api_key_required'
  ).length;
  const issueCount = statuses.length - exactMatched.length - approxMatched.length - noMatchCount;

  const badgeForStatus = (st: ProviderStatusReport) => {
    switch (st.status) {
      case 'exact_match':
        return {
          text: `Exact (${st.exactMatchCount || st.candidateCount})`,
          cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
        };
      case 'approximate_match':
        return {
          text: `Approx (${st.candidateCount})`,
          cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
        };
      case 'no_match':
        return {
          text: 'No match',
          cls: 'bg-stone-200 text-stone-700 dark:bg-slate-800 dark:text-slate-300',
        };
      case 'timeout':
        return {
          text: 'Timed out',
          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        };
      case 'access_denied':
        return {
          text: 'Access denied',
          cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
        };
      case 'api_key_required':
        return {
          text: 'API key / quota',
          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        };
      case 'proxy_required':
        return {
          text: 'Proxy required',
          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        };
      case 'not_implemented':
      case 'unsupported_interface':
        return {
          text: 'Unsupported API',
          cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        };
      case 'upstream_error':
      default:
        return {
          text: 'Upstream error',
          cls: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
        };
    }
  };

  return (
    <details className="rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-900/50 px-3 py-2 text-[11px]">
      <summary className="cursor-pointer font-medium text-stone-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
        <span>
          Providers checked ({statuses.length}):{' '}
          <strong className="text-emerald-700 dark:text-emerald-400">{exactMatched.length} exact</strong>
          {approxMatched.length > 0 && (
            <>
              {' · '}
              <span className="text-sky-700 dark:text-sky-400">{approxMatched.length} approx</span>
            </>
          )}
          {' · '}
          <span>{noMatchCount} no match</span>
          {issueCount > 0 && (
            <>
              {' · '}
              <span className="text-amber-700 dark:text-amber-400">{issueCount} unavailable/blocked</span>
            </>
          )}
          {stagesExecuted && stagesExecuted.length > 0 && (
            <span className="ml-2 font-mono text-[10px] text-stone-400">
              [{stagesExecuted.join(' → ')}]
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {onRetryFailed && retryableCount > 0 && (
            <button
              type="button"
              onClick={(ev) => {
                ev.preventDefault();
                onRetryFailed();
              }}
              className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100"
            >
              Retry Failed ({retryableCount})
            </button>
          )}
          <span className="text-stone-400">Details</span>
        </span>
      </summary>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {statuses.map((st) => {
          const badge = badgeForStatus(st);
          return (
            <div
              key={st.provider}
              className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-slate-950 px-2 py-1 border border-stone-200/70 dark:border-slate-800"
              title={st.message}
            >
              <span className="truncate font-medium text-stone-800 dark:text-slate-200">
                {st.label}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                {badge.text}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function CandidateCard({
  c,
  onSelect,
}: {
  c: MetadataCandidate;
  onSelect: (c: MetadataCandidate) => void;
}) {
  const level = c.editionMatchLevel;
  const confidence = c.matchConfidence ?? 'title_match';
  const confidenceBadge =
    level === 'possible_edition'
      ? {
          label: 'Possible Edition Match',
          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        }
      : level === 'related_edition'
        ? {
            label: 'Related Edition',
            cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
          }
        : confidence === 'exact_isbn'
          ? {
              label: 'Exact Edition Match',
              cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
            }
          : confidence === 'unverified_isbn'
            ? {
                label: 'Unverified ISBN',
                cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
              }
            : confidence === 'approximate_match'
              ? {
                  label: 'Approximate Match',
                  cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
                }
              : {
                  label: 'Work / Title Match',
                  cls: 'bg-stone-200 text-stone-700 dark:bg-slate-800 dark:text-slate-300',
                };

  const sourcesLabel = (c.sources && c.sources.length > 0 ? c.sources : [c.provider]).join(' + ');

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 hover:border-[#C2410C] transition-colors">
      <div className="flex items-start gap-3">
        {c.coverUrl ? (
          <img
            src={c.coverUrl}
            alt={c.title}
            className="h-20 w-14 rounded object-cover border border-stone-200 dark:border-slate-700 shrink-0"
          />
        ) : (
          <div className="h-20 w-14 rounded bg-stone-200 dark:bg-slate-800 shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${confidenceBadge.cls}`}>
              {confidenceBadge.label}
            </span>
            <span className="rounded bg-stone-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-stone-600 dark:text-slate-300">
              {sourcesLabel}
            </span>
            {c.sourceUrl && (
              <a
                href={c.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] text-[#C2410C] hover:underline"
              >
                Source <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          <p className="font-semibold text-sm text-stone-900 dark:text-slate-100">{c.title}</p>
          {c.originalTitle && c.originalTitle !== c.title && (
            <p className="text-[11px] italic text-stone-500 dark:text-slate-400">
              Original: {c.originalTitle}
            </p>
          )}
          <p className="text-xs text-stone-600 dark:text-slate-400">
            {c.authors.join(', ') || 'Unknown Author'}
            {c.translators.length > 0 ? ` · Tr: ${c.translators.join(', ')}` : ''}
            {c.illustrators && c.illustrators.length > 0
              ? ` · Ill: ${c.illustrators.join(', ')}`
              : ''}
            {c.editors && c.editors.length > 0 ? ` · Ed: ${c.editors.join(', ')}` : ''}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 font-mono">
            {c.publishers.length > 0 && <span>Pub: {c.publishers.join(' / ')}</span>}
            {c.isbn13 && <span>ISBN: {c.isbn13}</span>}
            {c.pageCount && <span>{c.pageCount}p</span>}
            {c.publishedYear && <span>{c.publishedYear}</span>}
            {c.language && c.language !== 'und' && <span className="uppercase">{c.language}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(c)}
          className="min-h-[36px] shrink-0 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
        >
          Select &amp; Review
        </button>
      </div>
      {c.contradictions && c.contradictions.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 px-2.5 py-1.5 text-[11px] text-rose-900 dark:text-rose-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{c.contradictions.join('; ')}</span>
        </div>
      )}
      {c.conflicts && c.conflicts.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Conflicting values across sources:{' '}
            {c.conflicts
              .map(
                (cf) =>
                  `${cf.field} (${cf.values.map((v) => `${v.value} [${v.provider}]`).join(' vs ')})`
              )
              .join('; ')}
          </span>
        </div>
      )}
    </div>
  );
}

function CandidateResultsList({
  candidates,
  possibleEditionMatches = [],
  relatedEditions = [],
  workMatches = [],
  approximateMatches = [],
  loading,
  hasSearched,
  queriedIsbn,
  onSelect,
  onRetry,
  onSwitchManual,
}: {
  candidates: MetadataCandidate[];
  possibleEditionMatches?: MetadataCandidate[];
  relatedEditions?: MetadataCandidate[];
  workMatches?: MetadataCandidate[];
  approximateMatches?: MetadataCandidate[];
  loading: boolean;
  hasSearched: boolean;
  queriedIsbn: string | null;
  onSelect: (c: MetadataCandidate) => void;
  onRetry?: () => void;
  onSwitchManual: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-stone-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Searching global &amp; regional book metadata providers...
      </div>
    );
  }

  const secondaryApprox =
    possibleEditionMatches.length > 0 || relatedEditions.length > 0 || workMatches.length > 0
      ? [...possibleEditionMatches, ...workMatches, ...relatedEditions].filter(
          (item) => !candidates.some((c) => c.externalId === item.externalId && c.provider === item.provider)
        )
      : approximateMatches;

  if (candidates.length === 0 && secondaryApprox.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 dark:border-slate-700 p-5 text-center space-y-2.5">
        {hasSearched && queriedIsbn ? (
          <p className="text-xs text-stone-600 dark:text-slate-300">
            Barcode / ISBN <span className="font-mono font-semibold">{formatIsbn13(queriedIsbn)}</span> was
            decoded, but no matching book record was found across active providers.
          </p>
        ) : (
          <p className="text-xs text-stone-500">
            Search by ISBN or keywords, or switch directly to Cover OCR / Manual entry.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800"
            >
              Retry Lookup
            </button>
          )}
          <button
            type="button"
            onClick={onSwitchManual}
            className="text-xs font-semibold text-[#C2410C] hover:underline"
          >
            {queriedIsbn ? 'Enter Manually with this ISBN' : 'Open Manual Entry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {candidates.length > 0 && (
        <div className="space-y-2.5">
          {candidates.map((c) => (
            <CandidateCard key={`${c.provider}-${c.externalId}`} c={c} onSelect={onSelect} />
          ))}
        </div>
      )}
      {secondaryApprox.length > 0 && (
        <div className="space-y-2 border-t border-stone-200 dark:border-slate-800 pt-3">
          <p className="text-xs font-semibold text-stone-600 dark:text-slate-400">
            Possible / Related Editions &amp; Work Matches
          </p>
          <div className="space-y-2.5">
            {secondaryApprox.map((c) => (
              <CandidateCard key={`approx-${c.provider}-${c.externalId}`} c={c} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
