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
} from '../../utils/analysisCacheIndexedDB';
import { LiveTabAudioCaptureSession } from '../../utils/audioCapture';
import {
  getSharedYamnetWorkerClient,
  mergeYamnetTimelineSegments,
  YamnetCategoryPrediction,
} from '../../utils/yamnetClassifier';

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

export interface ConcertMusicContextValue {
  // YouTube State
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isReady: boolean;

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
}

const ConcertMusicContext = createContext<ConcertMusicContextValue | null>(null);

export const ConcertMusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoId, setVideoId] = useState<string>('dUXIymB78YQ');
  const [videoTitle, setVideoTitle] = useState<string>('Constant Moderato (Blue Archive OST)');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
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

  useEffect(() => {
    return () => {
      if (stageCaptureSessionRef.current) {
        stageCaptureSessionRef.current.stop();
        stageCaptureSessionRef.current = null;
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
