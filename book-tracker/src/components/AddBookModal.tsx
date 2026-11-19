import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Flashlight,
  ImagePlus,
  Loader2,
  Search,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { saveLocalCoverBlob } from '../services/covers';
import { createBookBundle } from '../services/libraryService';
import {
  lookupMetadataByIsbnDetailed,
  recordProviderMetadata,
  searchMetadataByQueryDetailed,
} from '../services/metadataService';
import {
  detectBarcodeFromImageFile,
  getCameraTrackTorchSupport,
  mapCameraErrorMessage,
  requestCoverAiAssist,
  runLocalCoverOcr,
  type ScannerUiState,
  scanVideoFrameForBarcode,
  setCameraTrackTorch,
} from '../services/scannerAndOcr';
import type {
  AcquisitionMethod,
  BookFormat,
  CopyCondition,
  CurrencyCode,
  MetadataCandidate,
  OwnershipStatus,
  ProviderLookupStatus,
  ReadingStatus,
  Shelf,
  Work,
} from '../types/domain';
import { CURRENCY_OPTIONS } from '../utils/currency';
import { formatIsbn13, parseIsbn } from '../utils/isbn';

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  existingWorks: Work[];
  shelves: Shelf[];
  defaultCurrency: CurrencyCode;
  aiCoverAssistOptIn: boolean;
  onCreated?: (workId: string) => void;
}

type ModalTab = 'scan' | 'isbn' | 'search' | 'manual';

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
  const [tab, setTab] = useState<ModalTab>('isbn');

  // Scanner & lookup state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inFlightScanRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerUiState>('idle');
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const [isbnInput, setIsbnInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [hasSearchedIsbn, setHasSearchedIsbn] = useState(false);
  const [hasSearchedQuery, setHasSearchedQuery] = useState(false);
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderLookupStatus[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidate | null>(null);

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
  const [illustratorsText, setIllustratorsText] = useState('');
  const [translatorsText, setTranslatorsText] = useState('');
  const [publishersText, setPublishersText] = useState('');
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

  const stopCamera = () => {
    if (streamRef.current) {
      if (torchEnabled) {
        void setCameraTrackTorch(streamRef.current, false);
      }
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    inFlightScanRef.current = false;
    setTorchEnabled(false);
    setTorchSupported(false);
    setCameraActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!open || tab !== 'scan') {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, tab]);

  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let timerId: number | null = null;
    let frameTick = 0;

    if (!scratchCanvasRef.current) {
      scratchCanvasRef.current = document.createElement('canvas');
    }

    const stepScan = async () => {
      if (cancelled || !videoRef.current) return;
      if (!inFlightScanRef.current && videoRef.current.readyState >= 2) {
        inFlightScanRef.current = true;
        frameTick += 1;
        try {
          const isbn = await scanVideoFrameForBarcode(
            videoRef.current,
            scratchCanvasRef.current!,
            { fullFrame: frameTick % 4 === 0 }
          );
          if (isbn && !cancelled) {
            stopCamera();
            setScannerState('decoded');
            setScannerMessage(`Decoded ISBN ${formatIsbn13(isbn)}`);
            setIsbnInput(isbn);
            const result = await handleIsbnLookup(isbn, { stayOnScanIfEmpty: true });
            if (!cancelled && result && result.candidates.length === 0) {
              setScannerState('decoded_not_found');
              setScannerMessage(
                `ISBN ${formatIsbn13(isbn)} is valid, but no catalogue match was found.`
              );
            } else if (!cancelled && result && result.candidates.length > 0) {
              setTab('isbn');
            }
            return;
          }
        } finally {
          inFlightScanRef.current = false;
        }
      }

      if (!cancelled) {
        timerId = window.setTimeout(() => void stepScan(), 260);
      }
    };

    timerId = window.setTimeout(() => void stepScan(), 260);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [cameraActive]);

  if (!open) return null;

  const startCamera = async () => {
    stopCamera();
    setScannerMessage(null);
    setScannerState('initializing');
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerState('permission_error');
      setScannerMessage(
        window.isSecureContext === false
          ? 'Camera scanning requires HTTPS. Upload a barcode photo instead.'
          : 'Camera access is unavailable in this browser. Upload a barcode photo instead.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setTorchSupported(getCameraTrackTorchSupport(stream));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setScannerState('searching');
      setScannerMessage('Center the EAN-13 barcode inside the guide box.');
    } catch (err) {
      stopCamera();
      setScannerState('permission_error');
      setScannerMessage(mapCameraErrorMessage(err));
    }
  };

  const handleToggleTorch = async () => {
    if (!streamRef.current || !torchSupported) return;
    const next = !torchEnabled;
    const ok = await setCameraTrackTorch(streamRef.current, next);
    if (ok) setTorchEnabled(next);
  };

  const applyCandidateToForm = (cand: MetadataCandidate) => {
    setSelectedCandidate(cand);
    setTitle(cand.title || '');
    setOriginalTitle(cand.originalTitle || '');
    setAuthorsText(cand.authors.join(', '));
    setIllustratorsText((cand.illustrators ?? []).join(', '));
    setTranslatorsText(cand.translators.join(', '));
    setPublishersText(cand.publishers.join(', '));
    setGenresText(cand.genres.join(', '));
    setLanguage(cand.language || 'vi');
    if (cand.format) setFormat(cand.format);
    if (cand.editionName) setEditionName(cand.editionName);
    setPageCount(cand.pageCount ? String(cand.pageCount) : '');
    setPublishedYear(cand.publishedYear ? String(cand.publishedYear) : '');
    setSeriesName(cand.seriesName || '');
    setVolumeNumber(cand.volumeNumber || '');
    setCoverUrl(cand.coverUrl || '');
    setDescription(cand.description || '');
    if (cand.isbn13) setIsbnInput(cand.isbn13);
    setTab('manual');
  };

  const handleIsbnLookup = async (
    overrideIsbn?: string,
    opts?: { stayOnScanIfEmpty?: boolean }
  ) => {
    const raw = (overrideIsbn ?? isbnInput).trim();
    if (!raw) return null;
    setLoadingLookup(true);
    setHasSearchedIsbn(true);
    setErrorMsg(null);
    try {
      const res = await lookupMetadataByIsbnDetailed(raw);
      setCandidates(res.candidates);
      setProviderStatuses(res.providerStatuses);
      if (res.candidates.length === 1 && res.candidates[0].matchQuality === 'exact_isbn' && !opts?.stayOnScanIfEmpty) {
        applyCandidateToForm(res.candidates[0]);
      }
      return res;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lookup failed');
      return null;
    } finally {
      setLoadingLookup(false);
    }
  };

  const handleQuerySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingLookup(true);
    setHasSearchedQuery(true);
    setErrorMsg(null);
    try {
      const res = await searchMetadataByQueryDetailed(searchQuery);
      setCandidates(res.candidates);
      setProviderStatuses(res.providerStatuses);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoadingLookup(false);
    }
  };

  const handleBarcodeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopCamera();
    setLoadingLookup(true);
    setScannerState('searching');
    setScannerMessage('Analyzing uploaded photo across multi-angle & contrast passes...');
    try {
      const isbn = await detectBarcodeFromImageFile(file);
      if (isbn) {
        setScannerState('decoded');
        setScannerMessage(`Decoded ISBN ${formatIsbn13(isbn)}`);
        setIsbnInput(isbn);
        const res = await handleIsbnLookup(isbn, { stayOnScanIfEmpty: true });
        if (res && res.candidates.length === 0) {
          setScannerState('decoded_not_found');
          setScannerMessage(
            `ISBN ${formatIsbn13(isbn)} is valid, but no catalogue match was found.`
          );
        } else {
          setTab('isbn');
        }
      } else {
        setScannerState('no_barcode_detected');
        setScannerMessage(
          'No barcode detected in this photo. Try a sharper photo, Cover OCR, or manual ISBN entry.'
        );
      }
    } finally {
      setLoadingLookup(false);
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
      const illustrators = illustratorsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const translators = translatorsText
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
          originalLanguage: language,
          firstPublishedYear: publishedYear ? Number(publishedYear) || null : null,
          seriesName: seriesName.trim() || undefined,
          seriesIndex: volumeNumber.trim() || undefined,
          metadataSource: selectedCandidate?.provider ?? 'manual',
          metadataVerified: true,
        },
        edition: {
          title: title.trim() || selectedWork?.title || 'Untitled Edition',
          editionName: editionName.trim() || undefined,
          translators,
          illustrators,
          publishers,
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
                    {/* Target reticle / framing guide matching scanVideoFrameForBarcode crop */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative w-[80%] h-[52%] rounded-xl border-2 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]">
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-black/75 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 whitespace-nowrap">
                          Align EAN-13 barcode here
                        </span>
                      </div>
                    </div>

                    {/* Top-right controls: Torch + Stop */}
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      {torchSupported && (
                        <button
                          type="button"
                          onClick={handleToggleTorch}
                          aria-label={torchEnabled ? 'Turn off flashlight' : 'Turn on flashlight'}
                          className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold backdrop-blur-xs ${
                            torchEnabled
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-black/65 text-white hover:bg-black/80'
                          }`}
                        >
                          <Flashlight className="h-3.5 w-3.5" />
                          {torchEnabled ? 'Light On' : 'Torch'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          stopCamera();
                          setScannerState('idle');
                          setScannerMessage(null);
                        }}
                        className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-black/65 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
                      >
                        <Square className="h-3 w-3 fill-current" />
                        Stop
                      </button>
                    </div>
                  </>
                )}

                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white bg-stone-900/90">
                    {scannerState === 'initializing' ? (
                      <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
                    ) : (
                      <Camera className="h-10 w-10 text-amber-400" />
                    )}
                    <p className="text-sm max-w-sm">
                      {scannerState === 'initializing'
                        ? 'Initializing rear camera...'
                        : 'Point the camera at the EAN-13 barcode on the back cover. Supports native BarcodeDetector and offline WASM fallback.'}
                    </p>
                    <button
                      type="button"
                      onClick={startCamera}
                      disabled={scannerState === 'initializing'}
                      className="min-h-[44px] rounded-xl bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9A3412] disabled:opacity-60"
                    >
                      {scannerState === 'initializing' ? 'Starting Camera...' : 'Start Camera Scanner'}
                    </button>
                  </div>
                )}
              </div>

              {/* Explicit 6-state scanner feedback banner */}
              {scannerState !== 'idle' && scannerMessage && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
                    scannerState === 'decoded'
                      ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                      : scannerState === 'decoded_not_found' || scannerState === 'no_barcode_detected' || scannerState === 'permission_error'
                        ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                        : 'border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {(scannerState === 'initializing' || (scannerState === 'searching' && loadingLookup)) && (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    )}
                    {scannerState === 'decoded' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    {(scannerState === 'decoded_not_found' ||
                      scannerState === 'no_barcode_detected' ||
                      scannerState === 'permission_error') && (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{scannerMessage}</span>
                  </div>
                  {scannerState === 'decoded_not_found' && (
                    <button
                      type="button"
                      onClick={() => setTab('manual')}
                      className="rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
                    >
                      Fill Manually with ISBN
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <span className="text-xs text-stone-600 dark:text-slate-400">
                  Or upload a photo of the barcode (handles tilt, uneven light &amp; cover clutter):
                </span>
                <label className="cursor-pointer rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-stone-50 dark:hover:bg-slate-800 shrink-0">
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
          )}

          {tab === 'isbn' && (
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleIsbnLookup();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={isbnInput}
                  onChange={(e) => {
                    setIsbnInput(e.target.value);
                    setHasSearchedIsbn(false);
                  }}
                  placeholder="9786042243568 or 9791032300000"
                  className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-mono tabular-nums"
                />
                <button
                  type="submit"
                  disabled={loadingLookup || !isbnInput.trim()}
                  className="min-h-[44px] rounded-xl bg-stone-900 dark:bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loadingLookup ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
                </button>
              </form>
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
              <CandidateResultsList
                candidates={candidates}
                providerStatuses={providerStatuses}
                loading={loadingLookup}
                hasSearched={hasSearchedIsbn}
                parsedIsbn={parsedIsbn}
                onSelect={applyCandidateToForm}
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
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHasSearchedQuery(false);
                  }}
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
              <CandidateResultsList
                candidates={candidates}
                providerStatuses={providerStatuses}
                loading={loadingLookup}
                hasSearched={hasSearchedQuery}
                parsedIsbn={null}
                onSelect={applyCandidateToForm}
                onSwitchManual={() => setTab('manual')}
              />
            </div>
          )}

          {tab === 'manual' && (
            <form id="add-book-form" onSubmit={handleSubmit} className="space-y-5">
              {selectedCandidate && (
                <div className="flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs">
                  <span>
                    Candidate loaded from <strong>{selectedCandidate.provider}</strong> (verify any fields before saving).
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-amber-700 shrink-0" />
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
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Edition or book title"
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Authors (comma-separated)</label>
                  <input
                    value={authorsText}
                    onChange={(e) => setAuthorsText(e.target.value)}
                    placeholder="Takata, Haruki Murakami..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Illustrators (comma-separated)</label>
                  <input
                    value={illustratorsText}
                    onChange={(e) => setIllustratorsText(e.target.value)}
                    placeholder="Tom Osabe, Azuri Hyuga..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">ISBN-13 / ISBN-10</label>
                  <input
                    value={isbnInput}
                    onChange={(e) => setIsbnInput(e.target.value)}
                    placeholder="9786042243568"
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Original Title</label>
                  <input
                    value={originalTitle}
                    onChange={(e) => setOriginalTitle(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Translators</label>
                  <input
                    value={translatorsText}
                    onChange={(e) => setTranslatorsText(e.target.value)}
                    placeholder="Thế Đăng..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Publishers</label>
                  <input
                    value={publishersText}
                    onChange={(e) => setPublishersText(e.target.value)}
                    placeholder="NXB Trẻ, Kim Đồng..."
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
                    onChange={(e) => setLanguage(e.target.value)}
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
                    onChange={(e) => setPageCount(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Published Year</label>
                  <input
                    type="number"
                    value={publishedYear}
                    onChange={(e) => setPublishedYear(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Series &amp; Volume</label>
                  <div className="flex gap-2">
                    <input
                      value={seriesName}
                      onChange={(e) => setSeriesName(e.target.value)}
                      placeholder="Series"
                      className="flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      value={volumeNumber}
                      onChange={(e) => setVolumeNumber(e.target.value)}
                      placeholder="Vol"
                      className="w-20 rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Genres (comma-separated)</label>
                  <input
                    value={genresText}
                    onChange={(e) => setGenresText(e.target.value)}
                    placeholder="Fiction, Mystery, Light Novel..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Cover Image URL (optional)</label>
                  <input
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
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

function formatProviderLabel(p: string): string {
  const map: Record<string, string> = {
    adcbook: 'ADCBook',
    nxb_kim_dong: 'NXB Kim Đồng',
    nha_nam: 'Nhã Nam',
    ipm: 'IPM',
    tiki_books: 'Tiki',
    google_books: 'Google Books',
    open_library: 'Open Library',
    openbd: 'openBD',
    isbndb: 'ISBNdb',
  };
  return map[p] ?? p;
}

function CandidateResultsList({
  candidates,
  providerStatuses,
  loading,
  hasSearched,
  parsedIsbn,
  onSelect,
  onSwitchManual,
}: {
  candidates: MetadataCandidate[];
  providerStatuses: ProviderLookupStatus[];
  loading: boolean;
  hasSearched: boolean;
  parsedIsbn: ReturnType<typeof parseIsbn> | null;
  onSelect: (c: MetadataCandidate) => void;
  onSwitchManual: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-stone-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Querying Vietnamese &amp; global book catalogues...
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 dark:border-slate-700 p-6 text-center space-y-2.5">
        {hasSearched && parsedIsbn?.isValid ? (
          <p className="text-xs font-medium text-stone-700 dark:text-slate-200">
            ISBN <span className="font-mono">{parsedIsbn.isbn13}</span> is valid, but no catalogue match was found.
          </p>
        ) : hasSearched ? (
          <p className="text-xs font-medium text-stone-700 dark:text-slate-200">
            No matching book records were found across the queried catalogues.
          </p>
        ) : (
          <p className="text-xs text-stone-500">
            Search by ISBN or keywords, or switch directly to Cover OCR / Manual entry.
          </p>
        )}

        {hasSearched && providerStatuses.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
            {providerStatuses.map((st) => (
              <span
                key={st.provider}
                title={st.message || st.status}
                className={`rounded px-2 py-0.5 text-[10px] font-mono ${
                  st.status === 'error'
                    ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                    : 'bg-stone-100 dark:bg-slate-800 text-stone-500 dark:text-slate-400'
                }`}
              >
                {formatProviderLabel(st.provider)}: {st.status === 'error' ? 'unavailable' : st.status === 'skipped' ? 'skipped' : '0'}
              </span>
            ))}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={onSwitchManual}
            className="rounded-lg bg-[#C2410C] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
          >
            {parsedIsbn?.isValid ? 'Fill Manually with This ISBN' : 'Open Manual Entry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {candidates.map((c) => {
        const sources = c.contributingProviders?.length ? c.contributingProviders : [c.provider];
        const conflicts = c.fieldConflicts ? Object.entries(c.fieldConflicts) : [];
        return (
          <div
            key={`${c.provider}-${c.externalId}`}
            onClick={() => onSelect(c)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(c);
              }
            }}
            className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left hover:border-[#C2410C] transition-colors"
          >
            {c.coverUrl ? (
              <img
                src={c.coverUrl}
                alt={c.title}
                className="h-18 w-12 rounded object-cover border border-stone-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="h-18 w-12 rounded bg-stone-200 dark:bg-slate-800 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-semibold text-sm text-stone-900 dark:text-slate-100 truncate">
                  {c.title}
                </p>
                {c.matchQuality === 'exact_isbn' && (
                  <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                    Exact ISBN Match
                  </span>
                )}
                {c.matchQuality === 'approximate' && (
                  <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    Approximate
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-600 dark:text-slate-400 truncate">
                {c.authors.join(', ') || 'Unknown Author'}
                {c.illustrators?.length ? ` · Illus: ${c.illustrators.join(', ')}` : ''}
                {c.translators?.length ? ` · Trans: ${c.translators.join(', ')}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 font-mono">
                <span>{sources.map(formatProviderLabel).join(' + ')}</span>
                {c.publishers[0] && <span>· {c.publishers[0]}</span>}
                {c.isbn13 && <span>· {c.isbn13}</span>}
                {c.pageCount && <span>· {c.pageCount}p</span>}
                {c.publishedYear && <span>· {c.publishedYear}</span>}
                {c.language && <span>· {c.language.toUpperCase()}</span>}
              </div>
              {conflicts.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Source discrepancy ({conflicts.map(([k, list]) => `${k}: ${list.map((x) => `${formatProviderLabel(x.provider)}=${x.value}`).join(' vs ')}`).join('; ')})
                </p>
              )}
              {c.sourceUrl && (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] text-[#C2410C] hover:underline"
                >
                  Source record
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <span className="text-xs font-semibold text-[#C2410C] shrink-0">Use</span>
          </div>
        );
      })}
    </div>
  );
}
