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
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import { useI18n } from '../i18n/useI18n';
import { sanitizeCoverUrl, saveLocalCoverBlob } from '../services/covers';
import { assignBookToShelfPosition, createBookBundle } from '../services/libraryService';
import { BatchScannerWorkspace } from './BatchScannerWorkspace';
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
  BookIdentifierType,
  BookshelfPosition,
  CopyCondition,
  CurrencyCode,
  Edition,
  FieldProvenanceEntry,
  MetadataCandidate,
  OwnershipStatus,
  ProviderStatusReport,
  ReadingStatus,
  Shelf,
  VerificationStatus,
  Work,
} from '../types/domain';
import { BOOKSHELF_META, BOOKSHELF_POSITIONS } from '../utils/bookshelfPlacement';
import { CURRENCY_OPTIONS } from '../utils/currency';
import { formatBookIdentifier, parseBookIdentifier } from '../utils/isbn';
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

export interface RegisteredBookPlacementEvent {
  workId: string;
  title: string;
  author: string;
  edition: Edition;
  targetShelf: BookshelfPosition;
}

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  existingWorks: Work[];
  existingBooks?: EnrichedBookRecord[];
  shelves: Shelf[];
  defaultCurrency: CurrencyCode;
  aiCoverAssistOptIn: boolean;
  initialMode?: 'single' | 'batch';
  defaultShelfPosition?: BookshelfPosition;
  onCreated?: (workId: string, placement?: RegisteredBookPlacementEvent) => void;
  onCreatedBatch?: (
    workIds: string[],
    placements?: RegisteredBookPlacementEvent[]
  ) => void;
}

export function AddBookModal({
  open,
  onClose,
  existingWorks,
  existingBooks = [],
  shelves,
  defaultCurrency,
  aiCoverAssistOptIn,
  initialMode = 'single',
  defaultShelfPosition = 'middle',
  onCreated,
  onCreatedBatch,
}: AddBookModalProps) {
  const { t } = useI18n();
  const [modalMode, setModalMode] = useState<'single' | 'batch'>(initialMode);

  // Scanner & lookup state (managed via tested scanFlow transitions)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const decodeRunnerRef = useRef(createSequentialDecodeRunner());
  const scanDetectedRef = useRef(false);
  const lastSubmittedIsbnRef = useRef<string | null>(null);
  const lookupSeqRef = useRef(0);
  const coverPreviewRef = useRef<string | null>(null);
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
    scannedIdentifierType,
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
    identityMismatches,
    providerStatuses,
    stagesExecuted,
    verificationStatus,
    verificationMessage,
    retrievedAt,
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
  const [distributorText, setDistributorText] = useState('');
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
  const [targetShelfPosition, setTargetShelfPosition] =
    useState<BookshelfPosition>(defaultShelfPosition);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);

  const resetDraftState = () => {
    lookupSeqRef.current += 1;
    scanDetectedRef.current = false;
    lastSubmittedIsbnRef.current = null;

    if (coverPreviewRef.current && coverPreviewRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreviewRef.current);
    }
    coverPreviewRef.current = null;

    setScanUi(createInitialScanLookupState('isbn'));
    setSearchQuery('');
    setCameraResolution(null);
    setCameraProfile(null);
    setTorchSupported(false);
    setTorchEnabled(false);
    setScanModeLabel('camera');
    setLastAttemptAt(null);
    setCopiedIsbn(false);
    setShowDiagnostics(false);

    setCoverFile(null);
    setCoverPreviewUrl(null);
    setOcrStatus(null);
    setOcrRunning(false);

    setLinkToWorkId('');
    setTitle('');
    setOriginalTitle('');
    setAuthorsText('');
    setTranslatorsText('');
    setIllustratorsText('');
    setPublishersText('');
    setPublishingPartner('');
    setDistributorText('');
    setGenresText('');
    setLanguage('vi');
    setFormat('paperback');
    setPageCount('');
    setPublishedYear('');
    setEditionName('');
    setSeriesName('');
    setVolumeNumber('');
    setCoverUrl('');
    setDescription('');
    setEditorsText('');
    setUserEditedFields(new Set());
    setFieldProvenance({});

    setTrackCopy(true);
    setOwnershipStatus('owned');
    setCondition('new');
    setAcquisitionMethod('purchased');
    setPurchasePrice('');
    setCurrency(defaultCurrency);
    setPurchaseDate('');
    setSeller('');
    setShelfLocation('');
    setCopyNotes('');
    setInitialReadingStatus('want_to_read');
    setSelectedShelves([]);
    setTargetShelfPosition(defaultShelfPosition);
    setSaving(false);
    setErrorMsg(null);
  };

  useEffect(() => {
    if (open) {
      setModalMode(initialMode);
      setTargetShelfPosition(defaultShelfPosition);
    } else {
      resetDraftState();
    }
  }, [open, initialMode, defaultShelfPosition]);

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
    if (!open || modalMode !== 'single' || tab !== 'scan') {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, modalMode, tab]);

  const handleIsbnLookup = async (
    overrideIsbn?: string,
    lookupOpts?: { bypassCache?: boolean; retryFailedOnly?: boolean }
  ) => {
    const raw = (overrideIsbn ?? isbnInput).trim();
    if (!raw) return;
    const seq = ++lookupSeqRef.current;
    setScanUi((prev) => ({ ...prev, loadingLookup: true, hasSearched: true }));
    setErrorMsg(null);
    try {
      const res = await lookupMetadataWithReportByIsbn(raw, {
        bypassCache: lookupOpts?.bypassCache,
        retryFailedOnly: lookupOpts?.retryFailedOnly,
      });
      if (seq !== lookupSeqRef.current) return;
      setScanUi((prev) => transitionOnLookupCompleted(prev, res));
    } catch (err) {
      if (seq !== lookupSeqRef.current) return;
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

            const decodedId = attempt.validIdentifier ?? attempt.validIsbn13;
            if (decodedId) {
              scanDetectedRef.current = true;
              stopCamera();
              setScanUi((prev) =>
                transitionOnBarcodeDecoded(prev, decodedId, {
                  rawValue: attempt.rawValue,
                  format: attempt.format,
                  identifierType: attempt.identifierType,
                  diagnostics: attempt,
                })
              );
              if (lastSubmittedIsbnRef.current !== decodedId) {
                lastSubmittedIsbnRef.current = decodedId;
                void handleIsbnLookup(decodedId);
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
    const prevCand = selectedCandidate;
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
        distributorText,
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
      userEditedFields,
      { replaceUnedited: true }
    );
    setTitle(merged.title);
    setOriginalTitle(merged.originalTitle);
    setAuthorsText(merged.authorsText);
    setTranslatorsText(merged.translatorsText);
    setIllustratorsText(merged.illustratorsText);
    const prevEditors = prevCand?.editors?.join(', ') ?? '';
    if (!editorsText.trim() || editorsText === prevEditors) {
      setEditorsText(cand.editors?.join(', ') ?? '');
    }
    setPublishersText(merged.publishersText);
    setPublishingPartner(merged.publishingPartner);
    setDistributorText(merged.distributorText ?? '');
    setGenresText(merged.genresText);
    setLanguage(merged.language);
    const prevEditionName = prevCand?.editionName ?? '';
    if (!editionName.trim() || editionName === prevEditionName) {
      setEditionName(cand.editionName ?? '');
    }
    setFormat(cand.format ?? 'paperback');
    setPageCount(merged.pageCount);
    setPublishedYear(merged.publishedYear);
    setSeriesName(merged.seriesName);
    setVolumeNumber(merged.volumeNumber);
    setCoverUrl(sanitizeCoverUrl(merged.coverUrl) ?? '');
    setDescription(merged.description);
    if (merged.isbnInput) setIsbnInput(merged.isbnInput);
    if (merged.fieldProvenance) setFieldProvenance(merged.fieldProvenance);
  };

  const handleQuerySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const seq = ++lookupSeqRef.current;
    setScanUi((prev) => ({ ...prev, loadingLookup: true, hasSearched: true }));
    setErrorMsg(null);
    try {
      const res = await searchMetadataWithReportByQuery(searchQuery);
      if (seq !== lookupSeqRef.current) return;
      setScanUi((prev) => transitionOnLookupCompleted(prev, res));
    } catch (err) {
      if (seq !== lookupSeqRef.current) return;
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
    const seq = ++lookupSeqRef.current;
    setScanUi((prev) => ({ ...prev, loadingLookup: true, cameraError: null }));
    try {
      const attempt = await detectBarcodeFromImageSourceDetailed(file);
      if (seq !== lookupSeqRef.current) return;
      setLastAttemptAt(new Date().toLocaleTimeString());
      const decodedId = attempt.validIdentifier ?? attempt.validIsbn13;
      if (decodedId) {
        lastSubmittedIsbnRef.current = decodedId;
        setScanUi((prev) =>
          transitionOnBarcodeDecoded(prev, decodedId, {
            rawValue: attempt.rawValue,
            format: attempt.format,
            identifierType: attempt.identifierType,
            diagnostics: attempt,
          })
        );
        await handleIsbnLookup(decodedId);
      } else {
        const message = attempt.checksumError
          ? `${attempt.checksumError}. Try another photo or enter manually.`
          : 'No valid ISBN-13/10 or EAN-13 (e.g. 893*) barcode detected in image. Try a sharper photo, OCR, or manual entry.';
        setScanUi((prev) => transitionOnBarcodeNotDetected(prev, message, attempt));
        setScanUi((prev) => ({ ...prev, loadingLookup: false }));
      }
    } catch (err) {
      if (seq !== lookupSeqRef.current) return;
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
    if (coverPreviewRef.current && coverPreviewRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreviewRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    coverPreviewRef.current = nextUrl;
    setCoverPreviewUrl(nextUrl);
  };

  const handleRunLocalOcr = async () => {
    if (!coverFile) return;
    setOcrRunning(true);
    setOcrStatus('Running local Tesseract OCR in background worker...');
    try {
      const res = await runLocalCoverOcr(coverFile);
      if (res.detectedIsbns.length > 0) {
        setIsbnInput(res.detectedIsbns[0]);
        setOcrStatus(`Detected identifier ${formatBookIdentifier(res.detectedIsbns[0])}`);
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

  const parsedIdentifier = isbnInput.trim() ? parseBookIdentifier(isbnInput.trim()) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !linkToWorkId) {
      setErrorMsg('Book title is required.');
      return;
    }
    if (isbnInput.trim() && parsedIdentifier && !parsedIdentifier.isValid) {
      setErrorMsg(
        parsedIdentifier.errorReason ??
          'Entered ISBN/EAN-13 check digit is invalid. Correct it or clear the identifier field.'
      );
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
          distributor: distributorText.trim() || undefined,
          publishedYear: publishedYear ? Number(publishedYear) || null : null,
          language,
          format,
          pageCount: pageCount ? Number(pageCount) || null : null,
          seriesName: seriesName.trim() || undefined,
          volumeNumber: volumeNumber.trim() || undefined,
          coverUrl: sanitizeCoverUrl(coverUrl) ?? undefined,
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
              shelfLocation: shelfLocation.trim() || targetShelfPosition,
              shelfPosition: targetShelfPosition,
              notes: copyNotes.trim() || undefined,
            }
          : undefined,
        initialReadingStatus: initialReadingStatus || undefined,
        shelfIds: selectedShelves,
      });

      if (!trackCopy) {
        await assignBookToShelfPosition({
          workId: bundle.work.id,
          editionId: bundle.edition.id,
          position: targetShelfPosition,
        });
      }

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

      const placement: RegisteredBookPlacementEvent = {
        workId: bundle.work.id,
        title: bundle.edition.title || bundle.work.title,
        author: bundle.work.authors[0] || '',
        edition: bundle.edition,
        targetShelf: targetShelfPosition,
      };
      onCreated?.(bundle.work.id, placement);
      resetDraftState();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save book');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#060913]/80 backdrop-blur-xs p-0 sm:p-4">
      <div
        className={`archive-modal flex max-h-[94vh] w-full ${
          modalMode === 'batch' ? 'max-w-4xl' : 'max-w-3xl'
        } flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-[#B49A67]/35 bg-[#101827] text-[#ECE6D8] shadow-2xl`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B49A67]/25 bg-[#0B1120] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-editorial text-lg font-semibold text-[#F4EFE6]">
              {modalMode === 'batch' ? 'Batch Barcode Scanner' : t('action.addBook')}
            </h2>
            <div className="inline-flex rounded-xl border border-[#B49A67]/30 bg-[#101827] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setModalMode('single')}
                className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                  modalMode === 'single'
                    ? 'bg-[#B49A67] text-[#0B1120]'
                    : 'text-[#AEB9C9] hover:text-[#ECE6D8]'
                }`}
              >
                Single Book
              </button>
              <button
                type="button"
                onClick={() => setModalMode('batch')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 font-semibold transition-colors ${
                  modalMode === 'batch'
                    ? 'bg-[#B49A67] text-[#0B1120]'
                    : 'text-[#AEB9C9] hover:text-[#ECE6D8]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Batch Scan
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#AEB9C9] hover:bg-[#182238] hover:text-[#ECE6D8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Single Book Mode Tabs */}
        {modalMode === 'single' && (
          <div className="grid grid-cols-4 border-b border-[#B49A67]/20 bg-[#0F172A] px-2 pt-2 gap-1">
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
                    ? 'border-[#B49A67] text-[#D8C9A7] bg-[#162036]'
                    : 'border-transparent text-[#AEB9C9] hover:text-[#ECE6D8]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {modalMode === 'batch' ? (
            <BatchScannerWorkspace
              active={open && modalMode === 'batch'}
              existingBooks={existingBooks}
              shelves={shelves}
              defaultCurrency={defaultCurrency}
              defaultShelfPosition={defaultShelfPosition}
              onRegisteredBatch={onCreatedBatch}
              onClose={onClose}
            />
          ) : (
            <>
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
                  scannedIdentifierType={scannedIdentifierType}
                />
              )}

              {/* Same-screen Decoded Barcode + Lookup Results Area */}
              {(scannedIsbn || loadingLookup || scanAttempted) && (
                <div className="space-y-3 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-4">
                  {scannedIsbn && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 dark:border-slate-800 pb-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            {scannedIdentifierType === 'ean13'
                              ? 'Decoded EAN-13'
                              : scannedIdentifierType === 'isbn10'
                                ? 'Decoded ISBN-10'
                                : 'Decoded ISBN'}
                          </span>
                          <span className="font-mono text-sm font-bold text-stone-900 dark:text-slate-100 tabular-nums">
                            {formatBookIdentifier(scannedIsbn)}
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
                          {(() => {
                            const p = parseBookIdentifier(scannedIsbn);
                            if (p.prefixGroup === '978' && p.isbn10) return ` · ISBN-10: ${p.isbn10}`;
                            if (p.identifierType === 'ean13') return ' · GS1 EAN-13 (non-ISBN book barcode)';
                            return '';
                          })()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyScannedIsbn}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-stone-50 dark:hover:bg-slate-800"
                        >
                          {copiedIsbn ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedIsbn ? 'Copied' : 'Copy ID'}
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

                  {!loadingLookup && verificationStatus && (
                    <VerificationBanner
                      status={verificationStatus}
                      message={verificationMessage}
                      retrievedAt={retrievedAt}
                    />
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

                  {!loadingLookup && identityMismatches.length > 0 && (
                    <IdentityMismatchesPanel mismatches={identityMismatches} />
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
                  placeholder="9780140449136, 9786043590296, or 8935235220423"
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
              {parsedIdentifier && (
                <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs flex flex-wrap items-center gap-3">
                  <span
                    className={
                      parsedIdentifier.isValid
                        ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                        : 'text-red-600 font-semibold'
                    }
                  >
                    {parsedIdentifier.isValid
                      ? parsedIdentifier.identifierType === 'ean13'
                        ? 'Valid EAN-13 Barcode'
                        : parsedIdentifier.identifierType === 'isbn10'
                          ? 'Valid ISBN-10'
                          : 'Valid ISBN-13'
                      : 'Invalid identifier check digit'}
                  </span>
                  {parsedIdentifier.isbn13 && (
                    <span className="font-mono">ISBN-13: {parsedIdentifier.isbn13}</span>
                  )}
                  {!parsedIdentifier.isbn13 && parsedIdentifier.ean13 && (
                    <span className="font-mono">EAN-13: {parsedIdentifier.ean13}</span>
                  )}
                  {parsedIdentifier.prefixGroup === '978' && parsedIdentifier.isbn10 && (
                    <span className="font-mono text-stone-500">ISBN-10: {parsedIdentifier.isbn10}</span>
                  )}
                  {parsedIdentifier.prefixGroup === '979' && (
                    <span className="text-stone-500">979-* prefix (no ISBN-10 equivalent)</span>
                  )}
                  {parsedIdentifier.identifierType === 'ean13' && (
                    <span className="text-stone-500">GS1 EAN-13 barcode (no ISBN-10)</span>
                  )}
                  {!parsedIdentifier.isValid && parsedIdentifier.errorReason && (
                    <span className="text-red-600 dark:text-red-400">{parsedIdentifier.errorReason}</span>
                  )}
                </div>
              )}
              {!loadingLookup && verificationStatus && (
                <VerificationBanner
                  status={verificationStatus}
                  message={verificationMessage}
                  retrievedAt={retrievedAt}
                />
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
              {!loadingLookup && identityMismatches.length > 0 && (
                <IdentityMismatchesPanel mismatches={identityMismatches} />
              )}
              <CandidateResultsList
                candidates={candidates}
                possibleEditionMatches={possibleEditionMatches}
                relatedEditions={relatedEditions}
                workMatches={workMatches}
                approximateMatches={approximateMatches}
                loading={loadingLookup}
                hasSearched={hasSearched}
                queriedIsbn={parsedIdentifier?.normalizedId ?? (isbnInput.trim() || null)}
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
                    {coverPreviewUrl || sanitizeCoverUrl(coverUrl) ? (
                      <img
                        src={coverPreviewUrl || sanitizeCoverUrl(coverUrl)!}
                        alt="Cover preview"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
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
                  <label className="block text-xs font-semibold mb-1">ISBN-13 / ISBN-10 / EAN-13</label>
                  <input
                    value={isbnInput}
                    onChange={(e) => {
                      markUserEdited('isbnInput');
                      setIsbnInput(e.target.value);
                    }}
                    placeholder="978..., 893..."
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
                  <label className="block text-xs font-semibold mb-1">Publishers (Nhà xuất bản)</label>
                  <input
                    value={publishersText}
                    onChange={(e) => {
                      markUserEdited('publishersText');
                      setPublishersText(e.target.value);
                    }}
                    placeholder="Nhà xuất bản Văn Học, NXB Kim Đồng..."
                    className="w-full rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Distributor / Issuing House (Nhà phát hành)</label>
                  <input
                    value={distributorText}
                    onChange={(e) => {
                      markUserEdited('distributorText', 'distributor');
                      setDistributorText(e.target.value);
                    }}
                    placeholder="Nhã Nam, IPM, Amak Books..."
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

              {/* Physical Bookshelf Destination in Library Room */}
              <div className="rounded-xl border border-[#B49A67]/40 bg-[#101827] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#D6BD8A]">
                    Place on Library Bookshelf
                  </span>
                  <span className="text-[11px] text-[#AEB9C9]">
                    Book floats onto this shelf after saving
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {BOOKSHELF_POSITIONS.map((pos) => {
                    const meta = BOOKSHELF_META[pos];
                    const active = targetShelfPosition === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setTargetShelfPosition(pos)}
                        className={`min-h-[46px] rounded-xl border px-3 py-2 text-left transition-colors ${
                          active
                            ? 'border-[#D6BD8A] bg-[#392A24] text-[#F4EFE6] shadow-[0_0_16px_rgba(214,189,138,0.22)]'
                            : 'border-[#B49A67]/25 bg-[#0B1120] text-[#AEB9C9] hover:border-[#B49A67]/60'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[#D6BD8A] truncate">
                          {meta.label}
                        </div>
                        <div className="text-[10px] text-[#AEB9C9] truncate">
                          {meta.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
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
            </>
          )}
        </div>

        {/* Footer (Single Book Mode) */}
        {modalMode === 'single' && (
          <div className="flex items-center justify-end gap-2 border-t border-[#B49A67]/25 bg-[#0B1120] px-5 py-3 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#B49A67]/35 px-4 py-2 text-sm font-medium text-[#ECE6D8] hover:bg-[#182238]"
            >
              {t('action.cancel')}
            </button>
            {tab === 'manual' ? (
              <button
                type="submit"
                form="add-book-form"
                disabled={saving}
                className="min-h-[44px] rounded-xl bg-[#B49A67] px-5 py-2 text-sm font-semibold text-[#0B1120] hover:bg-[#C6AD7B] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Book to Library'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setTab('manual')}
                className="min-h-[44px] rounded-xl border border-[#B49A67]/40 bg-[#182238] px-4 py-2 text-sm font-semibold text-[#ECE6D8]"
              >
                Continue to Editor
              </button>
            )}
          </div>
        )}
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
  scannedIdentifierType,
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
  scannedIdentifierType?: BookIdentifierType;
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
          Identifier validation:{' '}
          {scannedIsbn
            ? scannedIdentifierType === 'ean13'
              ? `Valid GS1 EAN-13 (${scannedIsbn})`
              : scannedIdentifierType === 'isbn10'
                ? `Valid ISBN-10 → ${scannedIsbn}`
                : `Valid ISBN-13 (${scannedIsbn})`
            : decodedChecksumError || diagnostics?.checksumError || 'No valid identifier decoded'}
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

function VerificationBanner({
  status,
  message,
  retrievedAt,
}: {
  status: VerificationStatus;
  message?: string;
  retrievedAt?: string;
}) {
  const styles: Record<VerificationStatus, { label: string; cls: string }> = {
    verified_match: {
      label: 'Verified Match',
      cls: 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200',
    },
    conflicting_records: {
      label: 'Conflicting Records',
      cls: 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200',
    },
    identity_mismatch: {
      label: 'Identity Mismatch Rejected',
      cls: 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200',
    },
    valid_identifier_unconfirmed: {
      label: 'Valid Identifier (Unconfirmed)',
      cls: 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200',
    },
    not_found: {
      label: 'Valid Identifier (Not Found)',
      cls: 'border-stone-300 dark:border-slate-700 bg-stone-50 dark:bg-slate-900 text-stone-800 dark:text-slate-200',
    },
    invalid_identifier: {
      label: 'Invalid Identifier',
      cls: 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-900 dark:text-red-200',
    },
  };
  const cfg = styles[status];

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${cfg.cls}`}>
      <div className="space-y-0.5">
        <span className="font-semibold">{cfg.label}</span>
        {message && <p className="text-[11px] opacity-90">{message}</p>}
      </div>
      {retrievedAt && (
        <span className="font-mono text-[10px] opacity-75">
          Checked: {new Date(retrievedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

function IdentityMismatchesPanel({ mismatches }: { mismatches: MetadataCandidate[] }) {
  return (
    <details className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/25 px-3 py-2 text-[11px] text-rose-900 dark:text-rose-200">
      <summary className="cursor-pointer font-semibold flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Rejected {mismatches.length} mismatched-identifier record{mismatches.length > 1 ? 's' : ''} (not auto-accepted)
      </summary>
      <div className="mt-2 space-y-1.5">
        {mismatches.map((m) => (
          <div
            key={`mismatch-${m.provider}-${m.externalId}`}
            className="rounded-lg bg-white/80 dark:bg-slate-950/80 border border-rose-200/70 dark:border-rose-900/40 px-2.5 py-1.5 text-[11px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-rose-700 dark:text-rose-300">
              <span>{(m.sources ?? [m.provider]).join(' + ')}</span>
              <span>Returned ID: {m.isbn13 || m.ean13 || m.isbn10 || 'none'}</span>
            </div>
            <p className="font-semibold text-stone-900 dark:text-slate-100">{m.title}</p>
            {m.mismatchReason && <p className="text-rose-800 dark:text-rose-300">{m.mismatchReason}</p>}
          </div>
        ))}
      </div>
    </details>
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
        {sanitizeCoverUrl(c.coverUrl) ? (
          <img
            src={sanitizeCoverUrl(c.coverUrl)!}
            alt={c.title}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
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
            {c.sourceUrl && sanitizeCoverUrl(c.sourceUrl) && (
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
            {c.distributor && <span>Dist: {c.distributor}</span>}
            {c.isbn13 ? <span>ISBN: {c.isbn13}</span> : c.ean13 ? <span>EAN-13: {c.ean13}</span> : null}
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
            Identifier <span className="font-mono font-semibold">{formatBookIdentifier(queriedIsbn)}</span> was
            validated, but no matching book record was confirmed across active providers.
          </p>
        ) : (
          <p className="text-xs text-stone-500">
            Search by ISBN, EAN-13 barcode, or keywords, or switch directly to Cover OCR / Manual entry.
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
            {queriedIsbn ? 'Enter Manually with this ID' : 'Open Manual Entry'}
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
