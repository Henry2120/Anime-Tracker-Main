import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { InstrumentTimelineSegment } from '../../utils/instrumentNormalization';
import {
  getCachedYamnetAnalysisFromDB,
  saveYamnetAnalysisToDB,
  mergeYamnetCaptureRanges,
  YamnetCaptureRange,
  getLatestCachedAnalysisByVideoIdFromDB,
  saveAnalysisToDB,
  clearCachedAnalysisFromDB,
} from '../../utils/analysisCacheIndexedDB';
import { LiveTabAudioCaptureSession } from '../../utils/audioCapture';
import {
  getSharedYamnetWorkerClient,
  mergeYamnetTimelineSegments,
  YamnetCategoryPrediction,
} from '../../utils/yamnetClassifier';
import {
  AiConcertPerformancePlan,
  buildAiConcertPerformancePlan,
} from './aiConcertPlanner';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface ConcertTrack {
  id: string;
  title: string;
  artist?: string;
}

export const PRESET_CONCERT_TRACKS: ConcertTrack[] = [
  {
    id: 'x3G1I_9DPf4',
    title: 'Elegy of the End (Violin/Cello/Piano)',
    artist: 'Lappy',
  },
  {
    id: 'aYKN5_b7yVo',
    title: 'Flamewall (Violin/Guitar/Drums)',
    artist: 'Camellia',
  },
  {
    id: 'dUXIymB78YQ',
    title: 'Constant Moderato (Mitsukiyo)',
    artist: 'Blue Archive OST',
  },
  {
    id: 'qpbX7SbXOtU',
    title: 'Classical Anime Medley (Cellos)',
    artist: 'Prague Cello Quartet',
  },
  {
    id: 'Igg7AxN5QPc',
    title: 'Carol of the Bells (Violin EDM)',
    artist: 'Lindsey Stirling',
  },
  {
    id: 'J3cg4tFLm7A',
    title: 'Burning Piano (Max Richter cover)',
    artist: 'Danila Bolshakov',
  },
  {
    id: 'kYbgcOC_FkI',
    title: 'That Band (Ano Bando)',
    artist: 'Bocchi the Rock!',
  },
];

export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

export type ConcertPresentationMode = 'full' | 'mini' | 'collapsed' | 'hidden';

export type SharedYamnetStatus =
  | 'idle'
  | 'loading_model'
  | 'waiting_tab_audio'
  | 'capturing'
  | 'analysing'
  | 'paused'
  | 'stopped'
  | 'completed_capture'
  | 'error';

export interface YamnetCaptureSummaryState {
  capturedRanges: YamnetCaptureRange[];
  totalCapturedSeconds: number;
  totalDuration: number;
  isCompleteCapture: boolean;
}

export type SharedAiAnalysisStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'incomplete'
  | 'unavailable'
  | 'error';

export interface AiAnalysisSnapshot {
  videoId: string;
  segments: InstrumentTimelineSegment[];
  status: SharedAiAnalysisStatus;
  error?: string | null;
  title?: string | null;
  isFullCoverage?: boolean | null;
  plan?: AiConcertPerformancePlan | null;
}

export interface ConcertMusicContextValue {
  // YouTube State
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isReady: boolean;
  seekNonce: number;

  // Presentation State
  presentationMode: ConcertPresentationMode;
  isConcertActive: boolean;

  // Controls
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  setVideo: (videoIdOrUrl: string, title?: string, autoPlay?: boolean) => void;
  setPresentationMode: (mode: ConcertPresentationMode) => void;
  closeMiniConcert: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number) => void;

  // Shared YAMNet 18-Category Stage Sync State
  yamnetVideoId: string;
  yamnetSegments: InstrumentTimelineSegment[];
  yamnetStatus: SharedYamnetStatus;
  yamnetError: string | null;
  yamnetUsingWorker: boolean;
  yamnetLastPredictions: YamnetCategoryPrediction[];
  yamnetCaptureSummary: YamnetCaptureSummaryState | null;
  isStageYamnetCapturing: boolean;
  publishYamnetState: (payload: {
    videoId: string;
    segments: InstrumentTimelineSegment[];
    status?: SharedYamnetStatus;
    error?: string | null;
    usingWorker?: boolean;
    lastPredictions?: YamnetCategoryPrediction[];
    captureSummary?: YamnetCaptureSummaryState | null;
  }) => void;
  startStageLiveYamnet: () => Promise<void>;
  stopStageLiveYamnet: () => void;

  // Independent AI Full-Track Performance Plan & Pre-Analysis Controls
  aiVideoId: string;
  aiSegments: InstrumentTimelineSegment[];
  aiStatus: SharedAiAnalysisStatus;
  aiError: string | null;
  aiTitle: string | null;
  aiIsFullCoverage: boolean | null;
  aiPlan: AiConcertPerformancePlan | null;
  aiProgressMessage: string | null;
  aiIsAnalyzing: boolean;
  publishAiAnalysisState: (payload: AiAnalysisSnapshot) => void;
  analyzeAiFullTrackConcert: (
    urlOrId?: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<AiConcertPerformancePlan | null>;
}

const ConcertMusicContext = createContext<ConcertMusicContextValue | null>(null);

export const ConcertMusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoId, setVideoId] = useState<string>('dUXIymB78YQ');
  const [videoTitle, setVideoTitle] = useState<string>('Constant Moderato (Blue Archive OST)');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [seekNonce, setSeekNonce] = useState<number>(0);
  const [presentationMode, setPresentationMode] = useState<ConcertPresentationMode>('hidden');
  const [isConcertActive, setIsConcertActive] = useState<boolean>(false);

  // Shared YAMNet State synced with InstrumentAnalysisView & 3D Stage Orchestrator
  const [yamnetVideoId, setYamnetVideoId] = useState<string>('dUXIymB78YQ');
  const [yamnetSegments, setYamnetSegments] = useState<InstrumentTimelineSegment[]>([]);
  const [yamnetStatus, setYamnetStatus] = useState<SharedYamnetStatus>('idle');
  const [yamnetError, setYamnetError] = useState<string | null>(null);
  const [yamnetUsingWorker, setYamnetUsingWorker] = useState<boolean>(false);
  const [yamnetLastPredictions, setYamnetLastPredictions] = useState<YamnetCategoryPrediction[]>([]);
  const [yamnetCaptureSummary, setYamnetCaptureSummary] =
    useState<YamnetCaptureSummaryState | null>(null);
  const [isStageYamnetCapturing, setIsStageYamnetCapturing] = useState<boolean>(false);

  // Independent AI Full-Track Performance State & Plan Cache (scoped per videoId)
  const [aiVideoId, setAiVideoId] = useState<string>('dUXIymB78YQ');
  const [aiSegments, setAiSegments] = useState<InstrumentTimelineSegment[]>([]);
  const [aiStatus, setAiStatus] = useState<SharedAiAnalysisStatus>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [aiIsFullCoverage, setAiIsFullCoverage] = useState<boolean | null>(null);
  const [aiPlan, setAiPlan] = useState<AiConcertPerformancePlan | null>(null);
  const [aiProgressMessage, setAiProgressMessage] = useState<string | null>(null);
  const [aiIsAnalyzing, setAiIsAnalyzing] = useState<boolean>(false);
  const aiByVideoRef = useRef<Map<string, AiAnalysisSnapshot>>(new Map());
  const aiAnalyzeAbortRef = useRef<AbortController | null>(null);
  const aiAnalyzeGenRef = useRef<number>(0);

  const playerRef = useRef<any>(null);
  const pendingPlayRef = useRef<boolean>(false);
  const videoIdRef = useRef<string>(videoId);
  videoIdRef.current = videoId;

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;

  // Stage-initiated live capture refs
  const stageCaptureSessionRef = useRef<LiveTabAudioCaptureSession | null>(null);
  const stageCaptureGenRef = useRef<number>(0);
  const stageRangesRef = useRef<YamnetCaptureRange[]>([]);
  const stageSegmentsRef = useRef<InstrumentTimelineSegment[]>([]);
  const stageDetectedMapRef = useRef<Map<string, { name: string; family: string }>>(new Map());
  const stageLastFrameEndRef = useRef<number | null>(null);
  const stageFrameCountRef = useRef<number>(0);

  // Initialize YouTube IFrame API
  useEffect(() => {
    const initPlayer = () => {
      if (playerRef.current || !window.YT || !window.YT.Player) return;

      const targetEl = document.getElementById('persistent-youtube-iframe-target');
      if (!targetEl) return;

      try {
        playerRef.current = new window.YT.Player('persistent-youtube-iframe-target', {
          height: '100%',
          width: '100%',
          videoId: videoIdRef.current,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              setIsReady(true);
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false;
                try {
                  event.target.playVideo();
                } catch {
                  // Ignore autoplay policy rejection
                }
              }
            },
            onStateChange: (event: any) => {
              const state = event.data;
              if (state === 1) {
                setIsPlaying(true);
                setIsPaused(false);
                setIsStopped(false);
                setIsConcertActive(true);
              } else if (state === 2) {
                setIsPlaying(false);
                setIsPaused(true);
                setIsStopped(false);
              } else if (state === 0) {
                setIsPlaying(false);
                setIsPaused(false);
                setIsStopped(true);
              }
            },
            onError: (err: any) => {
              console.warn('[Concert YouTube Player] Error code:', err.data);
            },
          },
        });
      } catch (err) {
        console.error('[Concert YouTube Player] Failed to initialize:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };

      if (!document.getElementById('youtube-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Auto-hydrate cached YAMNet segments whenever videoId changes
  useEffect(() => {
    let cancelled = false;
    const vid = videoId;

    // Stop any stage live capture tied to a previous video
    if (stageCaptureSessionRef.current) {
      stageCaptureGenRef.current++;
      stageCaptureSessionRef.current.stop();
      stageCaptureSessionRef.current = null;
      setIsStageYamnetCapturing(false);
    }

    setYamnetVideoId(vid);
    setYamnetSegments([]);
    setYamnetCaptureSummary(null);
    setYamnetLastPredictions([]);
    setYamnetError(null);
    setYamnetStatus('idle');
    stageRangesRef.current = [];
    stageSegmentsRef.current = [];
    stageDetectedMapRef.current.clear();
    stageLastFrameEndRef.current = null;

    getCachedYamnetAnalysisFromDB(vid)
      .then((cached) => {
        if (cancelled || videoIdRef.current !== vid) return;
        if (cached && cached.instrumentSegments.length > 0) {
          stageSegmentsRef.current = cached.instrumentSegments;
          stageRangesRef.current = cached.capturedRanges;
          cached.allDetectedInstruments.forEach((inst) => {
            stageDetectedMapRef.current.set(inst.name.toLowerCase(), inst);
          });
          setYamnetSegments(cached.instrumentSegments);
          setYamnetCaptureSummary({
            capturedRanges: cached.capturedRanges,
            totalCapturedSeconds: cached.totalCapturedSeconds,
            totalDuration: cached.duration,
            isCompleteCapture: cached.isCompleteCapture,
          });
          setYamnetStatus(cached.isCompleteCapture ? 'completed_capture' : 'stopped');
        }
      })
      .catch(() => {
        // Ignore IndexedDB unavailability
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Auto-hydrate cached AI Full-Track Performance Plan from memory/IndexedDB strictly scoped by videoId
  useEffect(() => {
    let cancelled = false;
    const vid = videoId;

    // Immediately clear previous video's AI Full-Track state on videoId change
    const inMemory = aiByVideoRef.current.get(vid);
    if (inMemory) {
      setAiVideoId(vid);
      setAiSegments(inMemory.status === 'ready' ? inMemory.segments : []);
      setAiStatus(inMemory.status);
      setAiError(inMemory.error ?? null);
      setAiTitle(inMemory.title ?? null);
      setAiIsFullCoverage(inMemory.isFullCoverage ?? null);
      setAiPlan(inMemory.plan ?? null);
      setAiProgressMessage(null);
      return;
    }

    setAiVideoId(vid);
    setAiSegments([]);
    setAiError(null);
    setAiTitle(null);
    setAiIsFullCoverage(null);
    setAiPlan(null);
    setAiProgressMessage(null);
    setAiStatus('loading');

    const dur =
      playerRef.current && typeof playerRef.current.getDuration === 'function'
        ? (() => {
            try {
              const d = playerRef.current.getDuration();
              return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : undefined;
            } catch {
              return undefined;
            }
          })()
        : undefined;

    getLatestCachedAnalysisByVideoIdFromDB(vid, dur)
      .then((cached) => {
        if (cancelled || videoIdRef.current !== vid) return;
        const freshInMemory = aiByVideoRef.current.get(vid);
        if (freshInMemory) {
          setAiVideoId(vid);
          setAiSegments(freshInMemory.status === 'ready' ? freshInMemory.segments : []);
          setAiStatus(freshInMemory.status);
          setAiError(freshInMemory.error ?? null);
          setAiTitle(freshInMemory.title ?? null);
          setAiIsFullCoverage(freshInMemory.isFullCoverage ?? null);
          setAiPlan(freshInMemory.plan ?? null);
          return;
        }
        if (cached && cached.analysisResult) {
          const plan = buildAiConcertPerformancePlan(cached.analysisResult, {
            videoIdOverride: vid,
            fromCache: true,
          });
          if (!plan.isComplete) {
            const incompleteSnap: AiAnalysisSnapshot = {
              videoId: vid,
              segments: [],
              status: 'incomplete',
              error: plan.completionReason || 'Cached analysis did not cover 100% of the track.',
              title: plan.title,
              isFullCoverage: false,
              plan,
            };
            aiByVideoRef.current.set(vid, incompleteSnap);
            setAiVideoId(vid);
            setAiSegments([]);
            setAiStatus('incomplete');
            setAiError(incompleteSnap.error ?? null);
            setAiTitle(plan.title);
            setAiIsFullCoverage(false);
            setAiPlan(plan);
            return;
          }

          const snapshot: AiAnalysisSnapshot = {
            videoId: vid,
            segments: plan.segments,
            status: 'ready',
            error: null,
            title: plan.title,
            isFullCoverage: true,
            plan,
          };
          aiByVideoRef.current.set(vid, snapshot);
          setAiVideoId(vid);
          setAiSegments(plan.segments);
          setAiStatus('ready');
          setAiError(null);
          setAiTitle(plan.title);
          setAiIsFullCoverage(true);
          setAiPlan(plan);
          if (plan.title) {
            setVideoTitle(plan.title);
          }
        } else {
          setAiVideoId(vid);
          setAiSegments([]);
          setAiStatus('unavailable');
          setAiError(null);
          setAiPlan(null);
        }
      })
      .catch(() => {
        if (!cancelled && videoIdRef.current === vid) {
          setAiVideoId(vid);
          setAiSegments([]);
          setAiStatus('unavailable');
          setAiPlan(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const publishYamnetState = useCallback(
    (payload: {
      videoId: string;
      segments: InstrumentTimelineSegment[];
      status?: SharedYamnetStatus;
      error?: string | null;
      usingWorker?: boolean;
      lastPredictions?: YamnetCategoryPrediction[];
      captureSummary?: YamnetCaptureSummaryState | null;
    }) => {
      setYamnetVideoId(payload.videoId);
      setYamnetSegments(payload.segments);
      if (payload.status !== undefined) setYamnetStatus(payload.status);
      if (payload.error !== undefined) setYamnetError(payload.error);
      if (payload.usingWorker !== undefined) setYamnetUsingWorker(payload.usingWorker);
      if (payload.lastPredictions !== undefined) setYamnetLastPredictions(payload.lastPredictions);
      if (payload.captureSummary !== undefined) setYamnetCaptureSummary(payload.captureSummary);
    },
    []
  );

  const publishAiAnalysisState = useCallback((payload: AiAnalysisSnapshot) => {
    const cleanId = payload.videoId?.trim();
    if (!cleanId) return;

    let normalizedStatus = payload.status;
    let normalizedPlan = payload.plan ?? null;
    let normalizedSegments = payload.segments;
    let normalizedError = payload.error ?? null;

    if (normalizedStatus === 'ready' && payload.isFullCoverage === false) {
      normalizedStatus = 'incomplete';
      normalizedSegments = [];
      normalizedError =
        normalizedError || 'Analysis is incomplete and cannot be used for full-track concert playback.';
    } else if (normalizedStatus === 'ready' && !normalizedPlan && payload.isFullCoverage === true) {
      normalizedPlan = buildAiConcertPerformancePlan(
        {
          success: true,
          status: 'detected',
          videoId: cleanId,
          title: payload.title || `YouTube Track (${cleanId})`,
          coverage: {
            totalDuration:
              payload.segments.reduce((m, s) => Math.max(m, s.endTime), 0) || 1,
            isFullCoverage: true,
            coveragePercentage: 100,
            totalWindows: 1,
            successfulWindows: 1,
            failedWindows: 0,
            missingRanges: [],
            authoritativeDurationEstablished: true,
          },
          instrumentSegments: payload.segments,
        },
        { videoIdOverride: cleanId, fromCache: true }
      );
    }

    const stored: AiAnalysisSnapshot = {
      ...payload,
      videoId: cleanId,
      status: normalizedStatus,
      segments: normalizedStatus === 'ready' ? normalizedSegments : [],
      error: normalizedError,
      plan: normalizedPlan,
    };

    aiByVideoRef.current.set(cleanId, stored);
    if (cleanId === videoIdRef.current) {
      setAiVideoId(cleanId);
      setAiSegments(stored.segments);
      setAiStatus(stored.status);
      setAiError(stored.error ?? null);
      setAiTitle(stored.title ?? null);
      setAiIsFullCoverage(stored.isFullCoverage ?? null);
      setAiPlan(stored.plan ?? null);
    }
  }, []);

  const play = useCallback(() => {
    setIsConcertActive(true);
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      try {
        playerRef.current.playVideo();
      } catch (e) {
        console.warn('[YouTube Player] playVideo error:', e);
      }
    } else {
      pendingPlayRef.current = true;
      setIsPlaying(true);
      setIsPaused(false);
      setIsStopped(false);
    }
  }, []);

  const pause = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
      try {
        playerRef.current.pauseVideo();
      } catch (e) {
        console.warn('[YouTube Player] pauseVideo error:', e);
      }
    }
    setIsPlaying(false);
    setIsPaused(true);
  }, []);

  const stop = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
      try {
        playerRef.current.stopVideo();
      } catch (e) {
        console.warn('[YouTube Player] stopVideo error:', e);
      }
    }
    setIsPlaying(false);
    setIsPaused(false);
    setIsStopped(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const setVideo = useCallback(
    (urlOrId: string, customTitle?: string, autoPlay: boolean = false) => {
      const extracted = extractYouTubeVideoId(urlOrId) || urlOrId.trim();
      if (!extracted) return;
      setVideoId(extracted);
      videoIdRef.current = extracted;

      const title = customTitle || `YouTube Track (${extracted})`;
      setVideoTitle(title);
      setIsConcertActive(true);

      if (playerRef.current) {
        try {
          if (autoPlay && typeof playerRef.current.loadVideoById === 'function') {
            playerRef.current.loadVideoById(extracted);
          } else if (typeof playerRef.current.cueVideoById === 'function') {
            playerRef.current.cueVideoById(extracted);
            setIsPlaying(false);
            setIsPaused(false);
            setIsStopped(true);
          }
        } catch (e) {
          console.warn('[YouTube Player] load/cue error:', e);
        }
      }
    },
    []
  );

  const closeMiniConcert = useCallback(() => {
    stop();
    setIsConcertActive(false);
    setPresentationMode('hidden');
  }, [stop]);

  const getCurrentTime = useCallback((): number => {
    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      try {
        const t = playerRef.current.getCurrentTime();
        if (typeof t === 'number' && Number.isFinite(t)) {
          return t;
        }
      } catch {
        // Ignore iframe access error if player not initialized
      }
    }
    return 0;
  }, []);

  const getDuration = useCallback((): number => {
    if (playerRef.current && typeof playerRef.current.getDuration === 'function') {
      try {
        const d = playerRef.current.getDuration();
        if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
          return d;
        }
      } catch {
        // Ignore
      }
    }
    return 0;
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(seconds, true);
      } catch (e) {
        console.warn('[YouTube Player] seekTo error:', e);
      }
    }
    setSeekNonce((n) => n + 1);
  }, []);

  const persistStageYamnet = useCallback(
    async (vid: string) => {
      if (stageRangesRef.current.length === 0 && stageSegmentsRef.current.length === 0) return;
      const dur = getDuration();
      const saved = await saveYamnetAnalysisToDB({
        videoId: vid,
        duration: dur,
        capturedRanges: stageRangesRef.current,
        instrumentSegments: stageSegmentsRef.current,
        allDetectedInstruments: Array.from(stageDetectedMapRef.current.values()),
      });
      if (saved && videoIdRef.current === vid) {
        setYamnetCaptureSummary({
          capturedRanges: saved.capturedRanges,
          totalCapturedSeconds: saved.totalCapturedSeconds,
          totalDuration: saved.duration,
          isCompleteCapture: saved.isCompleteCapture,
        });
      }
    },
    [getDuration]
  );

  const stopStageLiveYamnet = useCallback(() => {
    stageCaptureGenRef.current++;
    if (stageCaptureSessionRef.current) {
      stageCaptureSessionRef.current.stop();
      stageCaptureSessionRef.current = null;
    }
    setIsStageYamnetCapturing(false);
    persistStageYamnet(videoIdRef.current);
  }, [persistStageYamnet]);

  const startStageLiveYamnet = useCallback(async () => {
    const vid = videoIdRef.current;
    stageCaptureGenRef.current++;
    const genId = stageCaptureGenRef.current;

    if (stageCaptureSessionRef.current) {
      stageCaptureSessionRef.current.stop();
      stageCaptureSessionRef.current = null;
    }

    setYamnetVideoId(vid);
    setYamnetError(null);
    setYamnetStatus('loading_model');
    stageLastFrameEndRef.current = null;
    stageFrameCountRef.current = 0;

    const workerClient = getSharedYamnetWorkerClient();
    try {
      await workerClient.init();
      await workerClient.reset();
      if (genId !== stageCaptureGenRef.current) return;
      setYamnetUsingWorker(workerClient.isUsingWorker());
    } catch (err: any) {
      if (genId !== stageCaptureGenRef.current) return;
      setYamnetStatus('error');
      setYamnetError(err?.message || 'Failed to initialize YAMNet classifier');
      setIsStageYamnetCapturing(false);
      return;
    }

    setYamnetStatus('waiting_tab_audio');
    const session = new LiveTabAudioCaptureSession({
      generationId: genId,
      onStatusChange: (status, err) => {
        if (genId !== stageCaptureGenRef.current) return;
        if (status === 'requesting_permission') {
          setYamnetStatus('waiting_tab_audio');
        } else if (status === 'capturing') {
          setYamnetStatus('capturing');
          setIsStageYamnetCapturing(true);
        } else if (status === 'stopped') {
          setIsStageYamnetCapturing(false);
          setYamnetStatus('stopped');
          persistStageYamnet(vid);
        } else if (status === 'error' && err) {
          setIsStageYamnetCapturing(false);
          setYamnetStatus('error');
          setYamnetError(err.message);
        }
      },
      onFrame: async (frame) => {
        if (genId !== stageCaptureGenRef.current) return;

        let playerState: number | undefined;
        let currentYtTime = getCurrentTime();
        let playbackRate = 1;
        try {
          if (playerRef.current) {
            playerState = playerRef.current.getPlayerState?.();
            const r = playerRef.current.getPlaybackRate?.();
            if (typeof r === 'number' && Number.isFinite(r) && r > 0) playbackRate = r;
          }
        } catch {}

        const activelyPlaying = playerState === 1 || (playerState === undefined && isPlayingRef.current);
        if (!activelyPlaying) {
          setYamnetStatus('paused');
          stageLastFrameEndRef.current = null;
          await workerClient.reset();
          return;
        }

        setYamnetStatus('analysing');
        const span = Math.max(0.3, frame.frameDurationSec * playbackRate);
        const dur = getDuration();

        const prevEnd = stageLastFrameEndRef.current;
        if (prevEnd !== null && Math.abs(currentYtTime - prevEnd) > 2.2) {
          await workerClient.reset();
        }
        const playbackEnd =
          dur > 0 ? Math.min(dur, Math.max(0.3, currentYtTime)) : Math.max(0.3, currentYtTime);
        const playbackStart = Math.max(0, playbackEnd - span);
        const adjustedEnd = playbackEnd <= playbackStart ? playbackStart + 0.4 : playbackEnd;
        stageLastFrameEndRef.current = adjustedEnd;

        try {
          const frameResult = await workerClient.classifyFrame({
            samples16k: frame.samples16k,
            playbackStart,
            playbackEnd: adjustedEnd,
            inputRms: frame.rms,
          });
          if (genId !== stageCaptureGenRef.current) return;

          setYamnetLastPredictions(frameResult.predictions);
          const nextRanges = mergeYamnetCaptureRanges([
            ...stageRangesRef.current,
            { start: playbackStart, end: adjustedEnd },
          ]);
          stageRangesRef.current = nextRanges;
          const totalCapturedSeconds =
            Math.round(nextRanges.reduce((acc, r) => acc + (r.end - r.start), 0) * 10) / 10;

          setYamnetCaptureSummary({
            capturedRanges: nextRanges,
            totalCapturedSeconds,
            totalDuration: dur,
            isCompleteCapture: dur > 0 && totalCapturedSeconds >= dur * 0.92,
          });

          if (frameResult.segments.length > 0) {
            const merged = mergeYamnetTimelineSegments(
              [...stageSegmentsRef.current, ...frameResult.segments],
              dur > 0 ? dur : undefined
            );
            stageSegmentsRef.current = merged;
            frameResult.segments.forEach((seg) => {
              const key = seg.instrumentName.toLowerCase();
              if (!stageDetectedMapRef.current.has(key)) {
                stageDetectedMapRef.current.set(key, {
                  name: seg.instrumentName,
                  family: seg.family,
                });
              }
            });
            setYamnetSegments(merged);
          }

          stageFrameCountRef.current += 1;
          if (stageFrameCountRef.current % 3 === 0) {
            persistStageYamnet(vid);
          }
        } catch (procErr: any) {
          console.warn('[Stage YAMNet] Frame warning:', procErr);
        }
      },
    });

    stageCaptureSessionRef.current = session;
    try {
      await session.start();
    } catch {
      if (genId === stageCaptureGenRef.current) {
        setIsStageYamnetCapturing(false);
      }
    }
  }, [getCurrentTime, getDuration, persistStageYamnet]);

  const analyzeAiFullTrackConcert = useCallback(
    async (
      urlOrId?: string,
      options: { forceRefresh?: boolean } = {}
    ): Promise<AiConcertPerformancePlan | null> => {
      const rawInput = (urlOrId || videoIdRef.current || '').trim();
      const targetVideoId = extractYouTubeVideoId(rawInput) || rawInput;
      if (!targetVideoId || !/^[a-zA-Z0-9_-]{11}$/.test(targetVideoId)) {
        setAiStatus('error');
        setAiError('Please enter a valid YouTube URL or 11-character video ID.');
        setAiIsAnalyzing(false);
        return null;
      }

      if (aiAnalyzeAbortRef.current) {
        aiAnalyzeAbortRef.current.abort();
      }
      const abortController = new AbortController();
      aiAnalyzeAbortRef.current = abortController;
      aiAnalyzeGenRef.current += 1;
      const genId = aiAnalyzeGenRef.current;

      const forceRefresh = Boolean(options.forceRefresh);
      const isVideoSwitch = targetVideoId !== videoIdRef.current;
      if (isVideoSwitch) {
        setVideo(targetVideoId, undefined, false);
      }

      setAiVideoId(targetVideoId);
      setAiSegments([]);
      setAiError(null);
      setAiPlan(null);
      setAiIsFullCoverage(null);
      setAiStatus('loading');
      setAiIsAnalyzing(true);
      setAiProgressMessage('Preparing video metadata...');

      // Give freshly cued YouTube iframe a short moment to report authoritative duration if ready
      let knownDuration = getDuration();
      if ((!knownDuration || knownDuration <= 0) && playerRef.current) {
        for (let i = 0; i < 6; i++) {
          if (genId !== aiAnalyzeGenRef.current) return null;
          await new Promise((r) => setTimeout(r, 200));
          const d = getDuration();
          if (d > 0 && videoIdRef.current === targetVideoId) {
            knownDuration = d;
            break;
          }
        }
      }

      if (genId !== aiAnalyzeGenRef.current) return null;

      if (forceRefresh) {
        await clearCachedAnalysisFromDB(targetVideoId).catch(() => {});
        aiByVideoRef.current.delete(targetVideoId);
      } else {
        try {
          const cached = await getLatestCachedAnalysisByVideoIdFromDB(
            targetVideoId,
            knownDuration > 0 ? knownDuration : undefined
          );
          if (genId !== aiAnalyzeGenRef.current) return null;
          if (cached && cached.analysisResult) {
            const cachedPlan = buildAiConcertPerformancePlan(cached.analysisResult, {
              videoIdOverride: targetVideoId,
              fromCache: true,
            });
            if (cachedPlan.isComplete) {
              const snap: AiAnalysisSnapshot = {
                videoId: targetVideoId,
                segments: cachedPlan.segments,
                status: 'ready',
                error: null,
                title: cachedPlan.title,
                isFullCoverage: true,
                plan: cachedPlan,
              };
              aiByVideoRef.current.set(targetVideoId, snap);
              if (videoIdRef.current === targetVideoId) {
                setAiVideoId(targetVideoId);
                setAiSegments(cachedPlan.segments);
                setAiStatus('ready');
                setAiError(null);
                setAiTitle(cachedPlan.title);
                setAiIsFullCoverage(true);
                setAiPlan(cachedPlan);
                setAiProgressMessage(null);
                setAiIsAnalyzing(false);
                if (cachedPlan.title) setVideoTitle(cachedPlan.title);
              }
              return cachedPlan;
            }
          }
        } catch {
          // Proceed to server analysis
        }
      }

      if (genId !== aiAnalyzeGenRef.current) return null;
      setAiProgressMessage('Analyzing full audio windows with Gemini AI (this may take a moment)...');

      try {
        const res = await fetch('/api/music/analyze-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            videoId: targetVideoId,
            url: `https://www.youtube.com/watch?v=${targetVideoId}`,
            duration: knownDuration > 0 ? knownDuration : undefined,
            forceRefresh,
          }),
        });

        if (genId !== aiAnalyzeGenRef.current) return null;
        if (!res.ok) {
          throw new Error(`Analysis server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (genId !== aiAnalyzeGenRef.current) return null;

        const plan = buildAiConcertPerformancePlan(data, {
          videoIdOverride: targetVideoId,
          fromCache: Boolean(data?.cached),
        });

        if (!data?.success) {
          const errMsg =
            data?.error ||
            plan.completionReason ||
            'AI Full-Track analysis failed for this YouTube video.';
          const failSnap: AiAnalysisSnapshot = {
            videoId: targetVideoId,
            segments: [],
            status: 'error',
            error: errMsg,
            title: plan.title,
            isFullCoverage: false,
            plan: null,
          };
          aiByVideoRef.current.set(targetVideoId, failSnap);
          if (videoIdRef.current === targetVideoId) {
            setAiStatus('error');
            setAiError(errMsg);
            setAiSegments([]);
            setAiPlan(null);
            setAiIsFullCoverage(false);
            setAiProgressMessage(null);
            setAiIsAnalyzing(false);
          }
          return null;
        }

        if (!plan.isComplete) {
          const incompleteSnap: AiAnalysisSnapshot = {
            videoId: targetVideoId,
            segments: [],
            status: 'incomplete',
            error:
              plan.completionReason ||
              'Track analysis did not achieve 100% coverage and cannot start concert playback.',
            title: plan.title,
            isFullCoverage: false,
            plan,
          };
          aiByVideoRef.current.set(targetVideoId, incompleteSnap);
          if (videoIdRef.current === targetVideoId) {
            setAiStatus('incomplete');
            setAiError(incompleteSnap.error ?? null);
            setAiSegments([]);
            setAiPlan(plan);
            setAiTitle(plan.title);
            setAiIsFullCoverage(false);
            setAiProgressMessage(null);
            setAiIsAnalyzing(false);
          }
          return plan;
        }

        // Validated 100% complete plan
        const readySnap: AiAnalysisSnapshot = {
          videoId: targetVideoId,
          segments: plan.segments,
          status: 'ready',
          error: null,
          title: plan.title,
          isFullCoverage: true,
          plan,
        };
        aiByVideoRef.current.set(targetVideoId, readySnap);

        if (videoIdRef.current === targetVideoId) {
          setAiVideoId(targetVideoId);
          setAiSegments(plan.segments);
          setAiStatus('ready');
          setAiError(null);
          setAiTitle(plan.title);
          setAiIsFullCoverage(true);
          setAiPlan(plan);
          setAiProgressMessage(null);
          setAiIsAnalyzing(false);
          if (plan.title) {
            setVideoTitle(plan.title);
          }
        }

        const cacheDuration = plan.duration > 0 ? plan.duration : knownDuration;
        if (cacheDuration > 0) {
          saveAnalysisToDB(
            { videoId: targetVideoId, duration: cacheDuration },
            {
              ...data,
              instrumentSegments: plan.segments,
            }
          ).catch((e) => console.warn('[IndexedDB Cache] Save warning:', e));
        }

        return plan;
      } catch (err: any) {
        if (err?.name === 'AbortError' || genId !== aiAnalyzeGenRef.current) {
          return null;
        }
        const errMsg =
          err?.message ||
          'Failed to reach the AI Full-Track analysis service. Please try again.';
        const errSnap: AiAnalysisSnapshot = {
          videoId: targetVideoId,
          segments: [],
          status: 'error',
          error: errMsg,
          isFullCoverage: false,
          plan: null,
        };
        aiByVideoRef.current.set(targetVideoId, errSnap);
        if (videoIdRef.current === targetVideoId) {
          setAiStatus('error');
          setAiError(errMsg);
          setAiSegments([]);
          setAiPlan(null);
          setAiIsFullCoverage(false);
          setAiProgressMessage(null);
          setAiIsAnalyzing(false);
        }
        return null;
      }
    },
    [getDuration, setVideo]
  );

  useEffect(() => {
    return () => {
      if (stageCaptureSessionRef.current) {
        stageCaptureSessionRef.current.stop();
        stageCaptureSessionRef.current = null;
      }
      if (aiAnalyzeAbortRef.current) {
        aiAnalyzeAbortRef.current.abort();
      }
    };
  }, []);

  const value: ConcertMusicContextValue = {
    videoId,
    videoTitle,
    isPlaying,
    isPaused,
    isStopped,
    isReady,
    seekNonce,
    presentationMode,
    isConcertActive,
    play,
    pause,
    stop,
    togglePlay,
    setVideo,
    setPresentationMode,
    closeMiniConcert,
    getCurrentTime,
    getDuration,
    seekTo,
    yamnetVideoId,
    yamnetSegments,
    yamnetStatus,
    yamnetError,
    yamnetUsingWorker,
    yamnetLastPredictions,
    yamnetCaptureSummary,
    isStageYamnetCapturing,
    publishYamnetState,
    startStageLiveYamnet,
    stopStageLiveYamnet,
    aiVideoId,
    aiSegments,
    aiStatus,
    aiError,
    aiTitle,
    aiIsFullCoverage,
    aiPlan,
    aiProgressMessage,
    aiIsAnalyzing,
    publishAiAnalysisState,
    analyzeAiFullTrackConcert,
  };

  return (
    <ConcertMusicContext.Provider value={value}>
      {children}

      {/* PERSISTENT YOUTUBE IFRAME MOUNT */}
      <div
        id="persistent-youtube-player-mount"
        aria-hidden="true"
        className="fixed -left-[9999px] -top-[9999px] w-[320px] h-[180px] pointer-events-none opacity-0 z-[-1]"
      >
        <div id="persistent-youtube-iframe-target" />
      </div>
    </ConcertMusicContext.Provider>
  );
};

export function useConcertMusic(): ConcertMusicContextValue {
  const context = useContext(ConcertMusicContext);
  if (!context) {
    throw new Error('useConcertMusic must be used within a ConcertMusicProvider');
  }
  return context;
}
