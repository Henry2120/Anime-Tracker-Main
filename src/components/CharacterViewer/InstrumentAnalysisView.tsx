import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Music,
  Activity,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Info,
  Youtube,
  Clock,
  Play,
  Pause,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Volume2,
  ExternalLink,
  Zap,
  Radio,
  Square,
  RotateCcw,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import { extractYouTubeVideoId, PRESET_CONCERT_TRACKS } from './ConcertMusicContext';
import {
  InstrumentFamily,
  CanonicalInstrument,
  InstrumentTimelineSegment,
  MASTER_INSTRUMENT_CATALOG,
  normalizeInstrument,
  parseTimelineSegments,
  isSegmentActiveAtTime,
  isVoiceInstrument,
} from '../../utils/instrumentNormalization';
import {
  getCachedAnalysisFromDB,
  saveAnalysisToDB,
  clearCachedAnalysisFromDB,
  getCachedYamnetAnalysisFromDB,
  saveYamnetAnalysisToDB,
  clearCachedYamnetAnalysisFromDB,
  mergeYamnetCaptureRanges,
  YamnetCaptureRange,
} from '../../utils/analysisCacheIndexedDB';
import {
  LiveTabAudioCaptureSession,
  isTabAudioCaptureSupported,
  isRunningInIframe,
  LiveCaptureError,
} from '../../utils/audioCapture';
import {
  getOrInitializeYamnetClassifier,
  classifyPcmFrameLocally,
  mergeYamnetTimelineSegments,
  YamnetTemporalTracker,
  YamnetCategoryPrediction,
} from '../../utils/yamnetClassifier';

export interface InstrumentAnalysisViewProps {
  theme?: AppTheme;
}

// 7 Standard Musical Families with Distinct Color Accents
const FAMILY_CONFIG: Record<
  InstrumentFamily,
  {
    name: string;
    color: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    activeGlow: string;
  }
> = {
  Strings: {
    name: 'Strings',
    color: '#6366F1', // Indigo
    bgClass: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    borderClass: 'border-indigo-500/30',
    textClass: 'text-indigo-600 dark:text-indigo-400',
    activeGlow: 'ring-2 ring-indigo-500/50 shadow-indigo-500/20',
  },
  Woodwinds: {
    name: 'Woodwinds',
    color: '#06B6D4', // Cyan
    bgClass: 'bg-cyan-500/10 dark:bg-cyan-500/15',
    borderClass: 'border-cyan-500/30',
    textClass: 'text-cyan-600 dark:text-cyan-400',
    activeGlow: 'ring-2 ring-cyan-500/50 shadow-cyan-500/20',
  },
  Brass: {
    name: 'Brass',
    color: '#F59E0B', // Amber
    bgClass: 'bg-amber-500/10 dark:bg-amber-500/15',
    borderClass: 'border-amber-500/30',
    textClass: 'text-amber-600 dark:text-amber-400',
    activeGlow: 'ring-2 ring-amber-500/50 shadow-amber-500/20',
  },
  Keyboards: {
    name: 'Keyboards',
    color: '#8B5CF6', // Purple
    bgClass: 'bg-purple-500/10 dark:bg-purple-500/15',
    borderClass: 'border-purple-500/30',
    textClass: 'text-purple-600 dark:text-purple-400',
    activeGlow: 'ring-2 ring-purple-500/50 shadow-purple-500/20',
  },
  Percussion: {
    name: 'Percussion',
    color: '#EF4444', // Red
    bgClass: 'bg-rose-500/10 dark:bg-rose-500/15',
    borderClass: 'border-rose-500/30',
    textClass: 'text-rose-600 dark:text-rose-400',
    activeGlow: 'ring-2 ring-rose-500/50 shadow-rose-500/20',
  },
  'Traditional & World': {
    name: 'Traditional & World',
    color: '#10B981', // Emerald
    bgClass: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    borderClass: 'border-emerald-500/30',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    activeGlow: 'ring-2 ring-emerald-500/50 shadow-emerald-500/20',
  },
  'Voice & Electronic': {
    name: 'Voice & Electronic',
    color: '#EC4899', // Pink
    bgClass: 'bg-pink-500/10 dark:bg-pink-500/15',
    borderClass: 'border-pink-500/30',
    textClass: 'text-pink-600 dark:text-pink-400',
    activeGlow: 'ring-2 ring-pink-500/50 shadow-pink-500/20',
  },
  Other: {
    name: 'Other',
    color: '#6B7280', // Gray
    bgClass: 'bg-gray-500/10 dark:bg-gray-500/15',
    borderClass: 'border-gray-500/30',
    textClass: 'text-gray-600 dark:text-gray-400',
    activeGlow: 'ring-2 ring-gray-500/50 shadow-gray-500/20',
  },
};

const ORDERED_FAMILIES: InstrumentFamily[] = [
  'Strings',
  'Woodwinds',
  'Brass',
  'Keyboards',
  'Percussion',
  'Traditional & World',
  'Voice & Electronic',
];

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const InstrumentAnalysisView: React.FC<InstrumentAnalysisViewProps> = ({ theme = 'light' }) => {
  const isDark = isDarkThemeFamily(theme);

  // Input & Video State
  const [inputUrl, setInputUrl] = useState('https://www.youtube.com/watch?v=x3G1I_9DPf4');
  const [activeVideoId, setActiveVideoId] = useState('x3G1I_9DPf4');
  const [videoTitle, setVideoTitle] = useState('Elegy of the End (Lappy)');
  const [videoArtist, setVideoArtist] = useState('Lappy');

  // Hybrid Analysis Mode & Session States (Section 2 & 4)
  const [analysisMode, setAnalysisMode] = useState<'full_track' | 'live'>('full_track');
  const [sessionState, setSessionState] = useState<
    'idle' | 'preparing' | 'detecting' | 'processing' | 'paused' | 'completed' | 'stopped' | 'error'
  >('idle');
  const [liveStatusDetail, setLiveStatusDetail] = useState<
    | 'idle'
    | 'loading_model'
    | 'waiting_tab_audio'
    | 'capturing'
    | 'analysing'
    | 'paused'
    | 'stopped'
    | 'completed_capture'
    | 'permission_denied'
    | 'missing_tab_audio'
    | 'model_error'
    | 'processing_error'
  >('idle');
  const [isCachedResult, setIsCachedResult] = useState<boolean>(false);
  const [liveCaptureError, setLiveCaptureError] = useState<LiveCaptureError | null>(null);
  const [liveDelayNotice, setLiveDelayNotice] = useState<string | null>(null);
  const [liveLastPredictions, setLiveLastPredictions] = useState<YamnetCategoryPrediction[]>([]);
  const [yamnetCaptureSummary, setYamnetCaptureSummary] = useState<{
    capturedRanges: YamnetCaptureRange[];
    totalCapturedSeconds: number;
    totalDuration: number;
    isCompleteCapture: boolean;
  } | null>(null);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<
    'idle' | 'detected' | 'partial' | 'unsupported' | 'error' | 'stopped'
  >('idle');
  const [analysisCoverage, setAnalysisCoverage] = useState<{
    startSecond: number;
    endSecond: number;
    totalDuration: number;
    isFullCoverage: boolean;
    coveragePercentage?: number;
    analyzedRanges?: Array<{ start: number; end: number }>;
    missingRanges?: Array<{ start: number; end: number }>;
    confirmedSilentRanges?: Array<{ start: number; end: number }>;
    nonInstrumentRanges?: Array<{ start: number; end: number }>;
    uncertainRanges?: Array<{ start: number; end: number }>;
    totalWindows?: number;
    successfulWindows?: number;
    failedWindows?: number;
    retryCount?: number;
    authoritativeDurationEstablished?: boolean;
    coverageNotes?: string;
  } | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<string>('');
  const [timelineSegments, setTimelineSegments] = useState<InstrumentTimelineSegment[]>([]);
  const [allDetectedInstruments, setAllDetectedInstruments] = useState<{
    name: string;
    family: string;
    role?: string;
    description?: string;
  }[]>([]);

  // YouTube Player Synchronized State
  const [playerCurrentTime, setPlayerCurrentTime] = useState<number>(0);
  const [playerDuration, setPlayerDuration] = useState<number>(0);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState<boolean>(false);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);

  // UI Filter / View States
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');
  const [collapsedFamilies, setCollapsedFamilies] = useState<Record<string, boolean>>({});

  const ytPlayerRef = useRef<any>(null);
  const timePollingIntervalRef = useRef<any>(null);
  const currentGenerationIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const liveCaptureSessionRef = useRef<LiveTabAudioCaptureSession | null>(null);
  const playerLoadedVideoIdRef = useRef<string | null>(null);
  const playerDurationsMapRef = useRef<Map<string, number>>(new Map());
  const playerCurrentTimeRef = useRef<number>(0);
  const playerDurationRef = useRef<number>(0);
  const activeVideoIdRef = useRef<string>(activeVideoId);

  // Local YAMNet session tracking refs (avoid stale closures inside AudioWorklet callback)
  const yamnetTrackerRef = useRef<YamnetTemporalTracker>(new YamnetTemporalTracker());
  const yamnetLastFrameEndRef = useRef<number | null>(null);
  const yamnetCapturedRangesRef = useRef<YamnetCaptureRange[]>([]);
  const yamnetSegmentsRef = useRef<InstrumentTimelineSegment[]>([]);
  const yamnetDetectedMapRef = useRef<Map<string, { name: string; family: string }>>(new Map());
  const yamnetFrameCountRef = useRef<number>(0);

  playerCurrentTimeRef.current = playerCurrentTime;
  playerDurationRef.current = playerDuration;
  activeVideoIdRef.current = activeVideoId;

  // =========================================================================
  // EMBEDDED YOUTUBE PLAYER INITIALIZATION
  // =========================================================================
  const initYouTubePlayer = useCallback((videoId: string) => {
    if (typeof window === 'undefined') return;

    const setupPlayerInstance = () => {
      const container = document.getElementById('analysis-embedded-yt-player');
      if (!container || !window.YT || !window.YT.Player) return;

      // Clean up previous instance
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }

      try {
        playerLoadedVideoIdRef.current = videoId;
        ytPlayerRef.current = new window.YT.Player('analysis-embedded-yt-player', {
          height: '100%',
          width: '100%',
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              setIsPlayerReady(true);
              playerLoadedVideoIdRef.current = videoId;
              const dur = event.target.getDuration();
              if (typeof dur === 'number' && dur > 0) {
                playerDurationsMapRef.current.set(videoId, dur);
                setPlayerDuration(dur);
              }
            },
            onStateChange: (event: any) => {
              const state = event.data;
              // 1 = PLAYING
              if (state === 1) {
                setIsPlayerPlaying(true);
              } else if (state === 2 || state === 0) {
                // 2 = PAUSED, 0 = ENDED
                setIsPlayerPlaying(false);
              }

              // Update time and duration immediately on any state change
              try {
                const t = event.target.getCurrentTime();
                if (typeof t === 'number' && !isNaN(t)) {
                  setPlayerCurrentTime(t);
                }
                const dur = event.target.getDuration();
                if (typeof dur === 'number' && dur > 0) {
                  playerDurationsMapRef.current.set(videoId, dur);
                  setPlayerDuration(dur);
                }
              } catch {}
            },
            onError: (err: any) => {
              console.warn('[Analysis YouTube Player] Error code:', err.data);
            },
          },
        });
      } catch (err) {
        console.error('[Analysis YouTube Player] Failed to mount:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      setupPlayerInstance();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        setupPlayerInstance();
      };

      if (!document.getElementById('youtube-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Mount player on active video change
  useEffect(() => {
    initYouTubePlayer(activeVideoId);

    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [activeVideoId, initYouTubePlayer]);

  // Real-time playback time polling (runs during video playback)
  useEffect(() => {
    if (timePollingIntervalRef.current) {
      clearInterval(timePollingIntervalRef.current);
      timePollingIntervalRef.current = null;
    }

    timePollingIntervalRef.current = setInterval(() => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          const t = ytPlayerRef.current.getCurrentTime();
          if (typeof t === 'number' && !isNaN(t)) {
            setPlayerCurrentTime(t);
          }
          const dur = ytPlayerRef.current.getDuration();
          if (typeof dur === 'number' && dur > 0 && dur !== playerDuration) {
            setPlayerDuration(dur);
          }
        } catch {}
      }
    }, 120);

    return () => {
      if (timePollingIntervalRef.current) {
        clearInterval(timePollingIntervalRef.current);
      }
    };
  }, [playerDuration]);

  // Seek handler: smoothly moves the player and recalculates active state immediately
  const handleSeek = (seconds: number) => {
    const target = Math.max(0, seconds);
    setPlayerCurrentTime(target);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      try {
        ytPlayerRef.current.seekTo(target, true);
      } catch (err) {
        console.warn('[Analysis Player] seek error:', err);
      }
    }
  };

  // Toggle play/pause on player
  const handleTogglePlay = () => {
    if (!ytPlayerRef.current) return;
    try {
      if (isPlayerPlaying) {
        ytPlayerRef.current.pauseVideo();
      } else {
        ytPlayerRef.current.playVideo();
      }
    } catch {}
  };

  // =========================================================================
  // ENSURE PLAYER READY & RETRIEVE DURATION FOR CURRENT VIDEO
  // =========================================================================
  const ensurePlayerReadyForVideo = useCallback(
    async (targetVideoId: string): Promise<number | null> => {
      // 1. Check cached duration for this exact video ID
      const cached = playerDurationsMapRef.current.get(targetVideoId);
      if (typeof cached === 'number' && cached > 0) {
        return cached;
      }

      // 2. If current player already has this video loaded
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getDuration === 'function') {
        try {
          const d = ytPlayerRef.current.getDuration();
          const url = ytPlayerRef.current.getVideoUrl?.() || '';
          if (
            typeof d === 'number' &&
            d > 0 &&
            (playerLoadedVideoIdRef.current === targetVideoId || url.includes(targetVideoId))
          ) {
            playerDurationsMapRef.current.set(targetVideoId, d);
            return d;
          }
        } catch {}
      }

      // 3. Cue or load video in player
      if (ytPlayerRef.current && typeof ytPlayerRef.current.cueVideoById === 'function') {
        try {
          playerLoadedVideoIdRef.current = targetVideoId;
          ytPlayerRef.current.cueVideoById(targetVideoId);
        } catch {
          initYouTubePlayer(targetVideoId);
        }
      } else {
        initYouTubePlayer(targetVideoId);
      }

      // 4. Await player's onReady / duration retrieval for this specific video
      return new Promise<number | null>((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.getDuration === 'function') {
            try {
              const d = ytPlayerRef.current.getDuration();
              const url = ytPlayerRef.current.getVideoUrl?.() || '';
              if (
                typeof d === 'number' &&
                d > 0 &&
                (playerLoadedVideoIdRef.current === targetVideoId || url.includes(targetVideoId))
              ) {
                clearInterval(interval);
                playerDurationsMapRef.current.set(targetVideoId, d);
                setPlayerDuration(d);
                return resolve(d);
              }
            } catch {}
          }
          if (Date.now() - startTime > 3500) {
            clearInterval(interval);
            resolve(null);
          }
        }, 80);
      });
    },
    [initYouTubePlayer]
  );

  // Persist current live YAMNet session to dedicated IndexedDB store (never touches Gemini store)
  const persistCurrentYamnetSession = useCallback(async (vid: string) => {
    if (!vid || (yamnetCapturedRangesRef.current.length === 0 && yamnetSegmentsRef.current.length === 0)) {
      return null;
    }
    const dur =
      playerDurationsMapRef.current.get(vid) ||
      (playerDurationRef.current > 0 ? playerDurationRef.current : 0);

    const detectedList = Array.from(yamnetDetectedMapRef.current.values());
    const saved = await saveYamnetAnalysisToDB({
      videoId: vid,
      duration: dur,
      capturedRanges: yamnetCapturedRangesRef.current,
      instrumentSegments: yamnetSegmentsRef.current,
      allDetectedInstruments: detectedList,
    });
    if (saved) {
      setYamnetCaptureSummary({
        capturedRanges: saved.capturedRanges,
        totalCapturedSeconds: saved.totalCapturedSeconds,
        totalDuration: saved.duration,
        isCompleteCapture: saved.isCompleteCapture,
      });
    }
    return saved;
  }, []);

  // =========================================================================
  // STOP ACTION (SECTION 4)
  // Cancels pending requests, stops audio tracks, releases nodes, invalidates session
  // =========================================================================
  const handleStop = useCallback(() => {
    const wasCapturingYamnet = Boolean(liveCaptureSessionRef.current?.getIsRunning());
    const currentVid = activeVideoIdRef.current;

    // Invalidate outstanding requests via generation ID
    currentGenerationIdRef.current++;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (liveCaptureSessionRef.current) {
      liveCaptureSessionRef.current.stop();
      liveCaptureSessionRef.current = null;
    }

    if (wasCapturingYamnet && currentVid) {
      persistCurrentYamnetSession(currentVid).then((saved) => {
        if (saved?.isCompleteCapture) {
          setLiveStatusDetail('completed_capture');
          setSessionState('completed');
        } else {
          setLiveStatusDetail('stopped');
          setSessionState('stopped');
        }
      });
    } else {
      setLiveStatusDetail('stopped');
      setSessionState('stopped');
    }

    setIsAnalyzing(false);
  }, [persistCurrentYamnetSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      currentGenerationIdRef.current++;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (liveCaptureSessionRef.current) {
        liveCaptureSessionRef.current.stop();
        liveCaptureSessionRef.current = null;
      }
    };
  }, []);

  // =========================================================================
  // FULL-TRACK ANALYSIS ACTION (BACKEND GEMINI REQUEST + INDEXEDDB CACHE)
  // =========================================================================
  const executeTrackAnalysis = useCallback(
    async (targetVideoId: string, customUrl?: string, forceFresh: boolean = false) => {
      const cleanId = targetVideoId.trim();
      if (!cleanId || cleanId.length < 5) {
        setAnalysisError('Please enter a valid YouTube video URL or 11-character video ID.');
        return;
      }

      // Stop any running live capture
      if (liveCaptureSessionRef.current) {
        liveCaptureSessionRef.current.stop();
        liveCaptureSessionRef.current = null;
      }

      const generationId = ++currentGenerationIdRef.current;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setAnalysisMode('full_track');
      setSessionState('preparing');
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAnalysisCoverage(null);
      setAnalysisSummary('');
      setIsCachedResult(false);

      // Check if switching to a different video
      const isVideoSwitch = cleanId !== activeVideoId;
      if (isVideoSwitch) {
        setActiveVideoId(cleanId);
        setPlayerCurrentTime(0);
        // Clear previous results on video change
        setTimelineSegments([]);
        setAllDetectedInstruments([]);
      }

      // Wait until new player's onReady event and obtain its duration for cleanId
      const targetDuration = await ensurePlayerReadyForVideo(cleanId);
      if (typeof targetDuration === 'number' && targetDuration > 0) {
        setPlayerDuration(targetDuration);
      }

      // Check IndexedDB durable cache first if not forcing a fresh rerun
      if (!forceFresh && targetDuration) {
        try {
          const cached = await getCachedAnalysisFromDB({
            videoId: cleanId,
            duration: targetDuration,
          });
          if (cached && generationId === currentGenerationIdRef.current) {
            console.log(`[IndexedDB Cache] Loaded durable cached analysis for ${cleanId}`);
            const data = cached.analysisResult;
            setAnalysisStatus((data.status as any) || 'detected');
            if (data.coverage) setAnalysisCoverage(data.coverage);
            setVideoTitle(data.title || `YouTube Track (${cleanId})`);
            setVideoArtist(data.artist || '');
            setAnalysisSummary(data.analysisSummary || '');
            setTimelineSegments(data.instrumentSegments || []);
            setAllDetectedInstruments(data.allDetectedInstruments || []);
            setIsCachedResult(true);
            setSessionState('completed');
            setIsAnalyzing(false);
            return;
          }
        } catch (dbErr) {
          console.warn('[IndexedDB Cache] Read warning:', dbErr);
        }
      }

      if (generationId !== currentGenerationIdRef.current) return;
      setSessionState('processing');

      try {
        const effectiveReqDuration =
          typeof targetDuration === 'number' && targetDuration > 0
            ? targetDuration
            : playerDuration > 0
            ? playerDuration
            : undefined;

        const response = await fetch('/api/music/analyze-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            videoId: cleanId,
            url: customUrl || `https://www.youtube.com/watch?v=${cleanId}`,
            duration: effectiveReqDuration,
            forceRefresh: forceFresh,
          }),
        });

        if (generationId !== currentGenerationIdRef.current) return;

        if (!response.ok) {
          throw new Error(`Analysis server returned HTTP status ${response.status}`);
        }

        const data = await response.json();
        if (generationId !== currentGenerationIdRef.current) return;

        if (!data.success) {
          setAnalysisStatus(data.status || 'error');
          setAnalysisError(
            data.error ||
              'Unable to analyze this YouTube video. Please ensure the video is publicly accessible.'
          );
          setSessionState('error');
          return;
        }

        setAnalysisStatus(data.status || 'detected');
        if (data.coverage) {
          setAnalysisCoverage(data.coverage);
          if (
            typeof data.coverage.totalDuration === 'number' &&
            data.coverage.totalDuration > 0 &&
            data.coverage.authoritativeDurationEstablished
          ) {
            setPlayerDuration((prev) => (prev > 0 ? prev : data.coverage.totalDuration));
          }
        }
        setVideoTitle(data.title || `YouTube Track (${cleanId})`);
        setVideoArtist(data.artist || '');
        setAnalysisSummary(data.analysisSummary || '');

        const parsedSegments = parseTimelineSegments(data.instrumentSegments, {
          maxDuration:
            data.coverage?.totalDuration || (playerDuration > 0 ? playerDuration : undefined),
          gapMergeThreshold: 1.0,
        });
        setTimelineSegments(parsedSegments);

        let detectedInsts: any[] = [];
        if (Array.isArray(data.allDetectedInstruments) && data.allDetectedInstruments.length > 0) {
          detectedInsts = data.allDetectedInstruments;
          setAllDetectedInstruments(data.allDetectedInstruments);
        } else {
          const uniqueMap = new Map<string, { name: string; family: string }>();
          parsedSegments.forEach((seg) => {
            if (!uniqueMap.has(seg.instrumentName)) {
              uniqueMap.set(seg.instrumentName, { name: seg.instrumentName, family: seg.family });
            }
          });
          detectedInsts = Array.from(uniqueMap.values());
          setAllDetectedInstruments(detectedInsts);
        }

        setSessionState('completed');

        // Persist to IndexedDB durable cache
        if (targetDuration) {
          saveAnalysisToDB(
            { videoId: cleanId, duration: targetDuration },
            {
              ...data,
              instrumentSegments: parsedSegments,
              allDetectedInstruments: detectedInsts,
            }
          ).catch((e) => console.warn('[IndexedDB Cache] Save warning:', e));
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('[InstrumentAnalysisView] Analysis fetch aborted.');
          return;
        }
        if (generationId !== currentGenerationIdRef.current) return;
        console.error('[InstrumentAnalysisView] Analysis failed:', err);
        setAnalysisStatus('error');
        setAnalysisError(
          err.message ||
            'Failed to connect to the analysis service. Please check your internet connection or server status.'
        );
        setSessionState('error');
      } finally {
        if (generationId === currentGenerationIdRef.current) {
          setIsAnalyzing(false);
        }
      }
    },
    [activeVideoId, ensurePlayerReadyForVideo, playerDuration]
  );

  // =========================================================================
  // LOCAL BROWSER-SIDE YAMNET TRUE LIVE DETECTION
  // Captures 16 kHz mono Float32 PCM from shared tab audio & classifies locally
  // Zero network audio upload or server Gemini chunk calls.
  // =========================================================================
  const handleStartLiveDetection = async () => {
    // Stop any ongoing capture or full-track request
    currentGenerationIdRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (liveCaptureSessionRef.current) {
      liveCaptureSessionRef.current.stop();
      liveCaptureSessionRef.current = null;
    }

    const generationId = ++currentGenerationIdRef.current;

    // Resolve target video from inputUrl if user typed a new one
    const trimmedInput = inputUrl.trim();
    const targetVideoId = (trimmedInput ? extractYouTubeVideoId(trimmedInput) || trimmedInput : activeVideoId).trim();
    const isVideoSwitch = targetVideoId && targetVideoId !== activeVideoId;
    const effectiveVideoId = targetVideoId || activeVideoId;

    if (isVideoSwitch) {
      setActiveVideoId(effectiveVideoId);
      setPlayerCurrentTime(0);
      setTimelineSegments([]);
      setAllDetectedInstruments([]);
      yamnetSegmentsRef.current = [];
      yamnetCapturedRangesRef.current = [];
      yamnetDetectedMapRef.current.clear();
    }

    setAnalysisMode('live');
    setLiveCaptureError(null);
    setAnalysisError(null);
    setAnalysisCoverage(null);
    setAnalysisSummary('');
    setIsCachedResult(false);
    setLiveDelayNotice(null);
    setLiveLastPredictions([]);
    setSessionState('preparing');
    setLiveStatusDetail('loading_model');
    setIsAnalyzing(true);

    yamnetTrackerRef.current.reset();
    yamnetLastFrameEndRef.current = null;
    yamnetFrameCountRef.current = 0;

    // Seed with existing YAMNet cache if present for the same video so resuming appends smoothly
    try {
      const existingCache = await getCachedYamnetAnalysisFromDB(effectiveVideoId);
      if (generationId !== currentGenerationIdRef.current) return;
      if (existingCache && (existingCache.instrumentSegments.length > 0 || existingCache.capturedRanges.length > 0)) {
        yamnetSegmentsRef.current = existingCache.instrumentSegments;
        yamnetCapturedRangesRef.current = existingCache.capturedRanges;
        yamnetDetectedMapRef.current.clear();
        existingCache.allDetectedInstruments.forEach((inst) => {
          yamnetDetectedMapRef.current.set(inst.name.toLowerCase(), inst);
        });
        setTimelineSegments(existingCache.instrumentSegments);
        setAllDetectedInstruments(existingCache.allDetectedInstruments);
        setYamnetCaptureSummary({
          capturedRanges: existingCache.capturedRanges,
          totalCapturedSeconds: existingCache.totalCapturedSeconds,
          totalDuration: existingCache.duration,
          isCompleteCapture: existingCache.isCompleteCapture,
        });
      } else if (!isVideoSwitch) {
        yamnetSegmentsRef.current = [];
        yamnetCapturedRangesRef.current = [];
        yamnetDetectedMapRef.current.clear();
        setTimelineSegments([]);
        setAllDetectedInstruments([]);
        setYamnetCaptureSummary(null);
      }
    } catch {}

    // 1. Initialize local MediaPipe AudioClassifier (YAMNet)
    let classifier: Awaited<ReturnType<typeof getOrInitializeYamnetClassifier>>;
    try {
      classifier = await getOrInitializeYamnetClassifier();
      if (generationId !== currentGenerationIdRef.current) return;
    } catch (modelErr: any) {
      if (generationId !== currentGenerationIdRef.current) return;
      const errMsg = modelErr?.message || 'Failed to load local YAMNet WASM/TFLite runtime.';
      console.error('[YAMNet] Model initialization error:', modelErr);
      setLiveStatusDetail('model_error');
      setAnalysisError(`Local YAMNet model error: ${errMsg}`);
      setSessionState('error');
      setAnalysisStatus('error');
      setIsAnalyzing(false);
      return;
    }

    // 2. Ensure YouTube player is cued/ready for duration lookup
    const targetDuration = await ensurePlayerReadyForVideo(effectiveVideoId);
    if (generationId !== currentGenerationIdRef.current) return;
    if (typeof targetDuration === 'number' && targetDuration > 0) {
      setPlayerDuration(targetDuration);
    }

    // 3. Request tab audio via getDisplayMedia and stream 16 kHz PCM frames from AudioWorklet
    setLiveStatusDetail('waiting_tab_audio');

    try {
      const session = new LiveTabAudioCaptureSession({
        generationId,
        onStatusChange: (status, error) => {
          if (generationId !== currentGenerationIdRef.current) return;
          if (status === 'requesting_permission') {
            setLiveStatusDetail('waiting_tab_audio');
            setSessionState('preparing');
          } else if (status === 'capturing') {
            setLiveStatusDetail('capturing');
            setSessionState('detecting');
          } else if (status === 'stopped') {
            setIsAnalyzing(false);
            persistCurrentYamnetSession(effectiveVideoId).then((saved) => {
              if (generationId !== currentGenerationIdRef.current) return;
              if (saved?.isCompleteCapture) {
                setLiveStatusDetail('completed_capture');
                setSessionState('completed');
              } else {
                setLiveStatusDetail('stopped');
                setSessionState('stopped');
              }
            });
          } else if (status === 'error' && error) {
            setLiveCaptureError(error);
            setAnalysisError(error.message);
            setLiveStatusDetail(
              error.type === 'no_audio_track' ? 'missing_tab_audio' : 'permission_denied'
            );
            setSessionState('error');
            setIsAnalyzing(false);
          }
        },
        onFrame: (frame) => {
          if (generationId !== currentGenerationIdRef.current) return;

          // Read live YouTube player state & clock dynamically
          let playerState: number | undefined;
          let currentYtTime = playerCurrentTimeRef.current;
          let playbackRate = 1;
          try {
            if (ytPlayerRef.current) {
              playerState = ytPlayerRef.current.getPlayerState?.();
              const t = ytPlayerRef.current.getCurrentTime?.();
              if (typeof t === 'number' && Number.isFinite(t)) {
                currentYtTime = t;
              }
              const r = ytPlayerRef.current.getPlaybackRate?.();
              if (typeof r === 'number' && Number.isFinite(r) && r > 0) {
                playbackRate = r;
              }
            }
          } catch {}

          // Pause handling: if YouTube is paused, stopped, unstarted, or buffering, do NOT attribute frames
          if (typeof playerState === 'number' && playerState !== 1) {
            setLiveStatusDetail('paused');
            setSessionState('paused');
            yamnetLastFrameEndRef.current = null;
            yamnetTrackerRef.current.reset();

            if (playerState === 0 && yamnetCapturedRangesRef.current.length > 0) {
              persistCurrentYamnetSession(effectiveVideoId);
            }
            return;
          }

          setLiveStatusDetail('analysing');
          setSessionState('detecting');

          const timelineSpan = Math.max(0.3, frame.frameDurationSec * playbackRate);
          const knownDur =
            playerDurationsMapRef.current.get(effectiveVideoId) ||
            (playerDurationRef.current > 0 ? playerDurationRef.current : 0);

          let playbackStart: number;
          let playbackEnd: number;

          const prevEnd = yamnetLastFrameEndRef.current;
          if (prevEnd !== null && Math.abs(currentYtTime - prevEnd) > 2.2) {
            // Seek detected (forward or backward): reset temporal smoothing to prevent cross-seek bleed
            yamnetTrackerRef.current.reset();
            playbackEnd = knownDur > 0 ? Math.min(knownDur, currentYtTime) : currentYtTime;
            playbackStart = Math.max(0, playbackEnd - timelineSpan);
          } else {
            playbackEnd = knownDur > 0 ? Math.min(knownDur, Math.max(0.3, currentYtTime)) : Math.max(0.3, currentYtTime);
            playbackStart = Math.max(0, playbackEnd - timelineSpan);
          }

          if (playbackEnd <= playbackStart) {
            playbackEnd = playbackStart + 0.4;
          }
          yamnetLastFrameEndRef.current = playbackEnd;

          try {
            const frameResult = classifyPcmFrameLocally({
              classifier,
              samples16k: frame.samples16k,
              playbackStart,
              playbackEnd,
              tracker: yamnetTrackerRef.current,
              inputRms: frame.rms,
            });

            setLiveLastPredictions(frameResult.predictions);

            // Track actual captured playback range regardless of silence/instruments
            const nextRanges = mergeYamnetCaptureRanges([
              ...yamnetCapturedRangesRef.current,
              { start: playbackStart, end: playbackEnd },
            ]);
            yamnetCapturedRangesRef.current = nextRanges;

            const totalCapturedSec =
              Math.round(nextRanges.reduce((acc, r) => acc + (r.end - r.start), 0) * 10) / 10;
            const isComplete = knownDur > 0 && totalCapturedSec >= knownDur * 0.92;

            setYamnetCaptureSummary({
              capturedRanges: nextRanges,
              totalCapturedSeconds: totalCapturedSec,
              totalDuration: knownDur,
              isCompleteCapture: isComplete,
            });

            if (frameResult.segments.length > 0) {
              const combined = [...yamnetSegmentsRef.current, ...frameResult.segments];
              const merged = mergeYamnetTimelineSegments(
                combined,
                knownDur > 0 ? knownDur : undefined
              );
              yamnetSegmentsRef.current = merged;

              frameResult.segments.forEach((seg) => {
                const key = seg.instrumentName.toLowerCase();
                if (!yamnetDetectedMapRef.current.has(key)) {
                  yamnetDetectedMapRef.current.set(key, {
                    name: seg.instrumentName,
                    family: seg.family,
                  });
                }
              });

              const nextDetectedList = Array.from(yamnetDetectedMapRef.current.values());
              setTimelineSegments(merged);
              setAllDetectedInstruments(nextDetectedList);
              setAnalysisStatus('detected');
            }

            yamnetFrameCountRef.current += 1;
            if (yamnetFrameCountRef.current % 3 === 0) {
              persistCurrentYamnetSession(effectiveVideoId);
            }
          } catch (procErr: any) {
            console.warn('[YAMNet] Frame classification error:', procErr);
            setLiveStatusDetail('processing_error');
            setLiveDelayNotice(
              `Local YAMNet frame processing warning: ${procErr?.message || 'classification skipped for one frame'}`
            );
          }
        },
      });

      liveCaptureSessionRef.current = session;
      await session.start();
    } catch (err: any) {
      if (generationId !== currentGenerationIdRef.current) return;
      console.warn('[YAMNet Live Detection] Start failed:', err);
      setSessionState('error');
      setIsAnalyzing(false);
    }
  };

  const handleClearLiveYamnetCache = useCallback(async () => {
    handleStop();
    await clearCachedYamnetAnalysisFromDB(activeVideoId);
    yamnetTrackerRef.current.reset();
    yamnetLastFrameEndRef.current = null;
    yamnetCapturedRangesRef.current = [];
    yamnetSegmentsRef.current = [];
    yamnetDetectedMapRef.current.clear();
    setTimelineSegments([]);
    setAllDetectedInstruments([]);
    setYamnetCaptureSummary(null);
    setLiveLastPredictions([]);
    setIsCachedResult(false);
    setAnalysisStatus('idle');
    setLiveStatusDetail('idle');
    setSessionState('idle');
  }, [activeVideoId, handleStop]);

  // Mode switcher that keeps Gemini and YAMNet caches/results strictly isolated
  const handleSwitchAnalysisMode = useCallback(
    async (targetMode: 'full_track' | 'live') => {
      if (targetMode === analysisMode) return;
      handleStop();
      setAnalysisMode(targetMode);
      setAnalysisError(null);
      setLiveCaptureError(null);
      setLiveDelayNotice(null);
      setLiveLastPredictions([]);
      setIsCachedResult(false);

      const dur =
        playerDurationsMapRef.current.get(activeVideoId) ||
        (playerDurationRef.current > 0 ? playerDurationRef.current : 0);

      if (targetMode === 'full_track') {
        setYamnetCaptureSummary(null);
        setLiveStatusDetail('idle');
        if (dur > 0) {
          const cached = await getCachedAnalysisFromDB({ videoId: activeVideoId, duration: dur });
          if (cached) {
            const data = cached.analysisResult;
            setAnalysisStatus((data.status as any) || 'detected');
            if (data.coverage) setAnalysisCoverage(data.coverage);
            setVideoTitle(data.title || `YouTube Track (${activeVideoId})`);
            setVideoArtist(data.artist || '');
            setAnalysisSummary(data.analysisSummary || '');
            setTimelineSegments(data.instrumentSegments || []);
            setAllDetectedInstruments(data.allDetectedInstruments || []);
            setIsCachedResult(true);
            setSessionState('completed');
            return;
          }
        }
      } else {
        setAnalysisCoverage(null);
        setAnalysisSummary('');
        const cachedYamnet = await getCachedYamnetAnalysisFromDB(activeVideoId);
        if (cachedYamnet) {
          yamnetSegmentsRef.current = cachedYamnet.instrumentSegments;
          yamnetCapturedRangesRef.current = cachedYamnet.capturedRanges;
          yamnetDetectedMapRef.current.clear();
          cachedYamnet.allDetectedInstruments.forEach((inst) => {
            yamnetDetectedMapRef.current.set(inst.name.toLowerCase(), inst);
          });
          setTimelineSegments(cachedYamnet.instrumentSegments);
          setAllDetectedInstruments(cachedYamnet.allDetectedInstruments);
          setYamnetCaptureSummary({
            capturedRanges: cachedYamnet.capturedRanges,
            totalCapturedSeconds: cachedYamnet.totalCapturedSeconds,
            totalDuration: cachedYamnet.duration,
            isCompleteCapture: cachedYamnet.isCompleteCapture,
          });
          setAnalysisStatus(cachedYamnet.instrumentSegments.length > 0 ? 'detected' : 'idle');
          setIsCachedResult(true);
          setLiveStatusDetail(cachedYamnet.isCompleteCapture ? 'completed_capture' : 'stopped');
          setSessionState(cachedYamnet.isCompleteCapture ? 'completed' : 'stopped');
          return;
        }
      }

      setTimelineSegments([]);
      setAllDetectedInstruments([]);
      setAnalysisCoverage(null);
      setAnalysisSummary('');
      setYamnetCaptureSummary(null);
      setAnalysisStatus('idle');
      setLiveStatusDetail('idle');
      setSessionState('idle');
    },
    [analysisMode, activeVideoId, handleStop]
  );

  // User click handlers for explicit Start (Full-Track Gemini preserved intact)
  const handleStartFullTrackClick = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setAnalysisError('Please enter a YouTube video URL or ID.');
      return;
    }
    const extracted = extractYouTubeVideoId(trimmed) || trimmed;
    executeTrackAnalysis(extracted, trimmed, false);
  };

  const handleRerunFullTrackClick = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    const extracted = extractYouTubeVideoId(trimmed) || trimmed;
    await clearCachedAnalysisFromDB(extracted);
    executeTrackAnalysis(extracted, trimmed, true);
  };

  const handleSelectPreset = async (trackId: string, trackTitle: string) => {
    // Invalidate active session and stop any ongoing analysis
    handleStop();

    const url = `https://www.youtube.com/watch?v=${trackId}`;
    setInputUrl(url);
    setActiveVideoId(trackId);
    setVideoTitle(trackTitle);
    setVideoArtist('');
    setPlayerCurrentTime(0);
    setAnalysisError(null);
    setLiveCaptureError(null);
    setLiveLastPredictions([]);
    setIsCachedResult(false);

    yamnetTrackerRef.current.reset();
    yamnetLastFrameEndRef.current = null;
    yamnetCapturedRangesRef.current = [];
    yamnetSegmentsRef.current = [];
    yamnetDetectedMapRef.current.clear();

    // Cue new video in player without auto-starting analysis
    if (ytPlayerRef.current && typeof ytPlayerRef.current.cueVideoById === 'function') {
      try {
        playerLoadedVideoIdRef.current = trackId;
        ytPlayerRef.current.cueVideoById(trackId);
      } catch {}
    }

    // Check active mode's separate IndexedDB store
    const duration = await ensurePlayerReadyForVideo(trackId);
    if (analysisMode === 'live') {
      const cachedYamnet = await getCachedYamnetAnalysisFromDB(trackId);
      if (cachedYamnet) {
        yamnetSegmentsRef.current = cachedYamnet.instrumentSegments;
        yamnetCapturedRangesRef.current = cachedYamnet.capturedRanges;
        cachedYamnet.allDetectedInstruments.forEach((inst) => {
          yamnetDetectedMapRef.current.set(inst.name.toLowerCase(), inst);
        });
        setTimelineSegments(cachedYamnet.instrumentSegments);
        setAllDetectedInstruments(cachedYamnet.allDetectedInstruments);
        setYamnetCaptureSummary({
          capturedRanges: cachedYamnet.capturedRanges,
          totalCapturedSeconds: cachedYamnet.totalCapturedSeconds,
          totalDuration: cachedYamnet.duration || duration || 0,
          isCompleteCapture: cachedYamnet.isCompleteCapture,
        });
        setAnalysisStatus(cachedYamnet.instrumentSegments.length > 0 ? 'detected' : 'idle');
        setIsCachedResult(true);
        setLiveStatusDetail(cachedYamnet.isCompleteCapture ? 'completed_capture' : 'stopped');
        setSessionState(cachedYamnet.isCompleteCapture ? 'completed' : 'stopped');
        return;
      }
    } else if (duration) {
      const cached = await getCachedAnalysisFromDB({ videoId: trackId, duration });
      if (cached) {
        const data = cached.analysisResult;
        setAnalysisStatus((data.status as any) || 'detected');
        if (data.coverage) setAnalysisCoverage(data.coverage);
        setVideoTitle(data.title || trackTitle);
        setVideoArtist(data.artist || '');
        setAnalysisSummary(data.analysisSummary || '');
        setTimelineSegments(data.instrumentSegments || []);
        setAllDetectedInstruments(data.allDetectedInstruments || []);
        setIsCachedResult(true);
        setSessionState('completed');
        return;
      }
    }

    // No auto-analysis! Reset to idle state
    setTimelineSegments([]);
    setAllDetectedInstruments([]);
    setAnalysisCoverage(null);
    setYamnetCaptureSummary(null);
    setAnalysisSummary('');
    setAnalysisStatus('idle');
    setLiveStatusDetail('idle');
    setSessionState('idle');
  };

  // =========================================================================
  // REAL-TIME ACTIVE INSTRUMENTS COMPUTATION (TIMESTAMP SYNCHRONIZATION)
  // Evaluates strictly against detected timeline intervals [startTime, endTime]
  // Recalculates immediately whenever playerCurrentTime changes
  // =========================================================================
  const activeSegments = useMemo(() => {
    return timelineSegments.filter((seg) =>
      isSegmentActiveAtTime(seg, playerCurrentTime)
    );
  }, [timelineSegments, playerCurrentTime]);

  const activeInstrumentNamesSet = useMemo(() => {
    return new Set(activeSegments.map((s) => s.instrumentName.toLowerCase()));
  }, [activeSegments]);

  // Group comprehensive instrument catalog by family
  const groupedCatalog = useMemo(() => {
    const groups: Record<
      InstrumentFamily,
      {
        family: InstrumentFamily;
        config: (typeof FAMILY_CONFIG)[InstrumentFamily];
        instruments: CanonicalInstrument[];
      }
    > = {
      Strings: { family: 'Strings', config: FAMILY_CONFIG.Strings, instruments: [] },
      Woodwinds: { family: 'Woodwinds', config: FAMILY_CONFIG.Woodwinds, instruments: [] },
      Brass: { family: 'Brass', config: FAMILY_CONFIG.Brass, instruments: [] },
      Keyboards: { family: 'Keyboards', config: FAMILY_CONFIG.Keyboards, instruments: [] },
      Percussion: { family: 'Percussion', config: FAMILY_CONFIG.Percussion, instruments: [] },
      'Traditional & World': {
        family: 'Traditional & World',
        config: FAMILY_CONFIG['Traditional & World'],
        instruments: [],
      },
      'Voice & Electronic': {
        family: 'Voice & Electronic',
        config: FAMILY_CONFIG['Voice & Electronic'],
        instruments: [],
      },
      Other: { family: 'Other', config: FAMILY_CONFIG.Other, instruments: [] },
    };

    MASTER_INSTRUMENT_CATALOG.forEach((item) => {
      if (groups[item.family]) {
        groups[item.family].instruments.push(item);
      }
    });

    // Also include any dynamically detected instruments from the AI not present in base catalog
    allDetectedInstruments.forEach((det) => {
      const normalized = normalizeInstrument(det.name);
      const fam = (normalized.family in groups ? normalized.family : 'Other') as InstrumentFamily;
      const alreadyInList = groups[fam].instruments.some(
        (i) => i.canonicalName.toLowerCase() === normalized.canonicalName.toLowerCase()
      );
      if (!alreadyInList) {
        groups[fam].instruments.push({
          id: normalized.id,
          canonicalName: normalized.canonicalName,
          family: fam,
          aliases: [],
          description: det.description || 'Audibly detected in current audio track',
        });
      }
    });

    return groups;
  }, [allDetectedInstruments]);

  // Duration for visual timeline bar
  const effectiveDuration = useMemo(() => {
    if (playerDuration > 0) return playerDuration;
    const maxEnd = Math.max(...timelineSegments.map((s) => s.endTime), 60);
    return maxEnd;
  }, [playerDuration, timelineSegments]);

  // Distinct detected instrument names for quick stats
  const distinctDetectedCount = useMemo(() => {
    return new Set(timelineSegments.map((s) => s.instrumentName.toLowerCase())).size;
  }, [timelineSegments]);

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-4 sm:p-6 overflow-y-auto select-none font-sans">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* =========================================================================
            1. HEADER & SEARCH BAR WITH ANALYZE TRACK ACTION
            ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#7567C7]/15 text-[#7567C7]">
                <Activity className="h-5 w-5" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Instrument Analysis & Timestamped Timeline
              </h1>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
              AI acoustic transcription of YouTube tracks with real-time player playback synchronization.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA]">
              {distinctDetectedCount} Instruments in Track • {activeSegments.length} Sounding Now
            </span>
          </div>
        </div>

        {/* Hybrid Architecture Mode Selector & Explicit Controls (Section 2, 3, 4, 8) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-3.5">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => handleSwitchAnalysisMode('full_track')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  analysisMode === 'full_track'
                    ? 'bg-white dark:bg-[#25242A] text-[#7567C7] shadow-xs'
                    : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Full-Track Analysis</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchAnalysisMode('live')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  analysisMode === 'live'
                    ? 'bg-white dark:bg-[#25242A] text-rose-500 shadow-xs'
                    : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>True Live Detection (YAMNet)</span>
              </button>
            </div>

            {/* Session State Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              {analysisMode === 'live' && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  100% Local Browser AudioSet YAMNet (16 kHz PCM)
                </span>
              )}
              {isCachedResult && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[#7567C7]/15 text-[#7567C7] border border-[#7567C7]/30 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  <span>
                    {analysisMode === 'live' ? 'Cached YAMNet (IndexedDB)' : 'Durable Cache (IndexedDB)'}
                  </span>
                </span>
              )}
              <span
                className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                  sessionState === 'detecting'
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse'
                    : sessionState === 'processing' || sessionState === 'preparing'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse'
                    : sessionState === 'paused'
                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30'
                    : sessionState === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : sessionState === 'stopped'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : sessionState === 'error'
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    : 'bg-black/5 dark:bg-white/5 text-[#77747D] border-black/5 dark:border-white/5'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>
                  {analysisMode === 'live' && liveStatusDetail !== 'idle'
                    ? liveStatusDetail.replace(/_/g, ' ')
                    : sessionState}
                </span>
              </span>
            </div>
          </div>

          {/* Input & Action Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (analysisMode === 'full_track') handleStartFullTrackClick();
                    else handleStartLiveDetection();
                  }
                }}
                placeholder="Paste public YouTube URL or 11-char video ID (e.g. x3G1I_9DPf4)..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none transition-all placeholder:text-[#9E9AA6]"
              />
              <Search className="h-4 w-4 absolute left-3 top-3 text-[#9E9AA6]" />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {analysisMode === 'full_track' ? (
                <>
                  <button
                    type="button"
                    onClick={handleStartFullTrackClick}
                    disabled={isAnalyzing}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-50 text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isAnalyzing && sessionState !== 'stopped' ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Analyzing Track...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Start Full-Track Analysis</span>
                      </>
                    )}
                  </button>

                  {(timelineSegments.length > 0 || isCachedResult) && (
                    <button
                      type="button"
                      onClick={handleRerunFullTrackClick}
                      disabled={isAnalyzing}
                      title="Clear local cache and re-analyze with Gemini"
                      className="px-3 py-2.5 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] dark:text-[#A4A1AA] border border-black/10 dark:border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Rerun</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleStartLiveDetection}
                    disabled={isAnalyzing}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>
                          {liveStatusDetail === 'loading_model'
                            ? 'Loading YAMNet...'
                            : liveStatusDetail === 'waiting_tab_audio'
                            ? 'Share Tab Audio...'
                            : liveStatusDetail === 'paused'
                            ? 'Paused (Play Video)'
                            : 'Detecting Locally...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Radio className="h-3.5 w-3.5" />
                        <span>Start YAMNet Detection</span>
                      </>
                    )}
                  </button>

                  {(timelineSegments.length > 0 || yamnetCaptureSummary || isCachedResult) && (
                    <button
                      type="button"
                      onClick={handleClearLiveYamnetCache}
                      disabled={isAnalyzing}
                      title="Clear local YAMNet cache for this track (keeps Gemini Full-Track cache intact)"
                      className="px-3 py-2.5 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] dark:text-[#A4A1AA] border border-black/10 dark:border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">New Capture</span>
                    </button>
                  )}
                </>
              )}

              {/* Explicit Stop Button (Section 3 & 4) */}
              <button
                type="button"
                onClick={handleStop}
                disabled={
                  !isAnalyzing &&
                  sessionState !== 'detecting' &&
                  sessionState !== 'processing' &&
                  sessionState !== 'paused'
                }
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Stop current analysis and preserve completed timeline"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          </div>

          {/* Mode Guidance / Local YAMNet Live Telemetry */}
          {analysisMode === 'live' && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-900 dark:text-rose-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">True Live Tab-Audio Detection (Local Browser YAMNet):</span>
                  <p className="text-[11px] opacity-90">
                    Runs directly in your browser using MediaPipe AudioClassifier (AudioSet YAMNet, 16 kHz mono PCM via AudioWorklet) with zero audio upload to Gemini. Select this tab in the share dialog and toggle <strong>"Also share tab audio"</strong> ON.
                  </p>
                  {isRunningInIframe() && (
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      Previewing inside an embedded iframe may block tab-audio capture via browser Permissions Policy. For best results, open AniVerse in a standalone HTTPS Chrome tab.
                    </p>
                  )}
                </div>
              </div>

              {liveCaptureError?.actionableHelp && (
                <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-950 dark:text-amber-200">
                  <strong>Browser Capture Guidance:</strong> {liveCaptureError.actionableHelp}
                </div>
              )}

              {liveLastPredictions.length > 0 && (
                <div className="pt-1.5 border-t border-rose-500/20 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-75 mr-1">
                    Latest AudioSet Frame:
                  </span>
                  {liveLastPredictions.map((pred) => (
                    <span
                      key={`${pred.canonicalName}-${pred.originalModelClass}`}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/70 dark:bg-black/30 border border-rose-500/25"
                      title={`Raw AudioSet class: ${pred.originalModelClass} | Raw score: ${pred.rawScore.toFixed(4)} | Smoothed: ${pred.smoothedScore.toFixed(4)}`}
                    >
                      {pred.canonicalName} ({pred.originalModelClass}: {(pred.rawScore * 100).toFixed(1)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Audio Latency Notice */}
          {liveDelayNotice && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500 shrink-0" />
              <span>{liveDelayNotice}</span>
            </div>
          )}

          {/* Quick Preset Test Tracks */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-[#77747D] uppercase tracking-wider mr-1">
                Test Presets:
              </span>
              {PRESET_CONCERT_TRACKS.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleSelectPreset(track.id, track.title)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                    activeVideoId === track.id
                      ? 'bg-[#7567C7]/15 text-[#7567C7] border-[#7567C7]/30 font-bold'
                      : 'bg-black/5 dark:bg-white/5 hover:bg-[#7567C7]/10 text-[#77747D] dark:text-[#A4A1AA] border-black/5 dark:border-white/5'
                  }`}
                >
                  {track.title}
                </button>
              ))}
            </div>

            {analysisMode === 'live' && yamnetCaptureSummary && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    yamnetCaptureSummary.isCompleteCapture
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                  }`}
                >
                  {yamnetCaptureSummary.isCompleteCapture
                    ? '✓ Full Track Captured (YAMNet)'
                    : yamnetCaptureSummary.totalDuration > 0
                    ? `Live Capture: ${Math.min(
                        99,
                        Math.round(
                          (yamnetCaptureSummary.totalCapturedSeconds /
                            yamnetCaptureSummary.totalDuration) *
                            100
                        )
                      )}% (${formatTime(yamnetCaptureSummary.totalCapturedSeconds)} / ${formatTime(
                        yamnetCaptureSummary.totalDuration
                      )})`
                    : `Live Captured: ${formatTime(yamnetCaptureSummary.totalCapturedSeconds)}`}
                </span>
              </div>
            )}

            {analysisMode === 'full_track' && analysisCoverage && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    analysisCoverage.isFullCoverage
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {analysisCoverage.isFullCoverage
                    ? '✓ 100% Full Track Coverage'
                    : `Coverage: ${analysisCoverage.coveragePercentage ?? Math.round((analysisCoverage.endSecond / analysisCoverage.totalDuration) * 100)}% (Partial)`}
                </span>
                <span className="text-[10px] font-mono text-[#77747D] dark:text-[#A4A1AA] hidden sm:inline">
                  {formatTime(analysisCoverage.startSecond)} - {formatTime(analysisCoverage.endSecond)}
                  {analysisCoverage.totalWindows ? ` • ${analysisCoverage.successfulWindows}/${analysisCoverage.totalWindows} windows` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Partial Analysis Notice */}
          {analysisStatus === 'partial' && analysisCoverage && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <div className="space-y-1">
                <div>
                  <strong>Partial Track Coverage ({analysisCoverage.coveragePercentage ?? Math.round((analysisCoverage.endSecond / analysisCoverage.totalDuration) * 100)}%):</strong> Successfully processed {analysisCoverage.successfulWindows ?? '?'}/{analysisCoverage.totalWindows ?? '?'} analysis windows.
                </div>
                {analysisCoverage.missingRanges && analysisCoverage.missingRanges.length > 0 && (
                  <div className="text-[11px] font-mono opacity-90">
                    Unanalyzed intervals: {analysisCoverage.missingRanges.map((r) => `${formatTime(r.start)} - ${formatTime(r.end)}`).join(', ')}
                    {analysisCoverage.failedWindows ? ` (${analysisCoverage.failedWindows} window${analysisCoverage.failedWindows > 1 ? 's' : ''} failed after retries)` : ''}.
                  </div>
                )}
                {analysisCoverage.authoritativeDurationEstablished === false && (
                  <div className="text-[11px] opacity-80">
                    Authoritative video duration could not be independently confirmed. Playback time is bounded to observed video player length.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Non-musical / Speech Notice */}
          {(analysisStatus === 'unsupported' || (analysisCoverage && !isAnalyzing && timelineSegments.length === 0)) && !analysisError && (
            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-900 dark:text-purple-200 text-xs flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-purple-500 mt-0.5" />
              <div className="space-y-1">
                <div>
                  <strong>Non-Musical Audio / Spoken Content:</strong> The audio was analyzed with full coverage ({analysisCoverage?.coveragePercentage ?? 100}%), and no musical instruments were detected.
                </div>
                <div className="text-[11px] opacity-80">
                  The recording appears to consist of spoken dialogue, ambient audio, or non-instrumental sound. No artificial instruments have been fabricated.
                </div>
              </div>
            </div>
          )}

          {/* Error Notice */}
          {analysisError && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="break-words">{analysisError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (analysisMode === 'live') {
                    handleStartLiveDetection();
                  } else {
                    handleRerunFullTrackClick();
                  }
                }}
                disabled={isAnalyzing}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-bold text-[11px] transition-all cursor-pointer shrink-0 self-end sm:self-center"
              >
                Retry Analysis
              </button>
            </div>
          )}
        </div>

        {/* =========================================================================
            2. EMBEDDED YOUTUBE PLAYER & SYNCHRONIZATION CONTROLLER
            ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Youtube className="h-4 w-4 text-red-500" />
              <h2 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] truncate max-w-md">
                {videoTitle} {videoArtist ? `— ${videoArtist}` : ''}
              </h2>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="font-bold text-[#7567C7]">
                {formatTime(playerCurrentTime)}
              </span>
              <span className="text-[#77747D]">/</span>
              <span className="text-[#77747D]">
                {formatTime(effectiveDuration)}
              </span>
            </div>
          </div>

          {/* Embedded YouTube Iframe Target (16:9 Aspect Ratio) */}
          <div className="relative w-full aspect-video max-w-3xl mx-auto rounded-xl overflow-hidden bg-black shadow-inner border border-black/15">
            <div id="analysis-embedded-yt-player" className="w-full h-full" />
          </div>

          {/* Quick Playback Transport Controls */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPlayerPlaying
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
                }`}
              >
                {isPlayerPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Play Video</span>
                  </>
                )}
              </button>

              <span className="text-[11px] text-[#77747D]">
                {isPlayerPlaying
                  ? 'Playing • Active instruments update dynamically'
                  : 'Paused • Click segments or timeline to seek'}
              </span>
            </div>

            {/* Currently Sounding Counter */}
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {activeSegments.length > 0 && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    activeSegments.length > 0 ? 'bg-emerald-500' : 'bg-[#77747D]'
                  }`}
                />
              </span>
              <span className="text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7]">
                {activeSegments.length} active sound source{activeSegments.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. INTERACTIVE TIMESTAMPED INSTRUMENT TIMELINE
            ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#7567C7]" />
              <h2 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Timestamped Instrument Timeline
              </h2>
            </div>
            <span className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
              {timelineSegments.length} Segment Cues • Click any block to seek
            </span>
          </div>

          {/* Visual Horizontal Timeline Bar with Playhead */}
          <div className="space-y-1.5">
            <div
              className="relative w-full h-12 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                handleSeek(ratio * effectiveDuration);
              }}
              title="Click anywhere to jump to timestamp"
            >
              {/* 1. Unanalyzed / Missing Ranges Indicators (distinguishes silence from unanalyzed sections) */}
              {analysisCoverage?.missingRanges?.map((missing, idx) => {
                const leftPct = (missing.start / effectiveDuration) * 100;
                const widthPct = Math.max(1, ((missing.end - missing.start) / effectiveDuration) * 100);
                return (
                  <div
                    key={`missing-range-${idx}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className="absolute top-0 bottom-0 bg-amber-500/15 border-x border-amber-500/40 flex items-center justify-center pointer-events-none z-5 overflow-hidden"
                    title={`Unanalyzed / Failed section: ${formatTime(missing.start)} - ${formatTime(missing.end)}`}
                  >
                    <span className="text-[9px] font-mono font-bold text-amber-700 dark:text-amber-300 opacity-80 uppercase px-1 truncate select-none">
                      ⚠ Missing ({formatTime(missing.start)}–{formatTime(missing.end)})
                    </span>
                  </div>
                );
              })}

              {/* 2. Uncertain / Review Ranges Indicators (distinguishes uncertain audio needing review) */}
              {analysisCoverage?.uncertainRanges?.map((unc, idx) => {
                const leftPct = (unc.start / effectiveDuration) * 100;
                const widthPct = Math.max(1, ((unc.end - unc.start) / effectiveDuration) * 100);
                return (
                  <div
                    key={`uncertain-range-${idx}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className="absolute top-0 bottom-0 bg-purple-500/15 border-x border-purple-500/35 flex items-center justify-center pointer-events-none z-4 overflow-hidden"
                    title={`Review required section: ${formatTime(unc.start)} - ${formatTime(unc.end)}`}
                  >
                    <span className="text-[8.5px] font-mono font-bold text-purple-700 dark:text-purple-300 opacity-80 px-1 truncate select-none">
                      ? Review ({formatTime(unc.start)}–{formatTime(unc.end)})
                    </span>
                  </div>
                );
              })}

              {/* 3. Timeline Segments Blocks */}
              {timelineSegments.map((seg) => {
                const leftPct = (seg.startTime / effectiveDuration) * 100;
                const widthPct = Math.max(1.5, ((seg.endTime - seg.startTime) / effectiveDuration) * 100);
                const isActive = isSegmentActiveAtTime(seg, playerCurrentTime);
                const familyCfg = FAMILY_CONFIG[seg.family] || FAMILY_CONFIG.Other;
                const isVocal = seg.isVoice || isVoiceInstrument(seg.instrumentName);
                const isProvisional = seg.status === 'provisional';

                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeek(seg.startTime);
                    }}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: familyCfg.color,
                    }}
                    className={`absolute top-2 h-8 rounded-md transition-all cursor-pointer opacity-85 hover:opacity-100 flex items-center px-1.5 overflow-hidden ${
                      isProvisional ? 'border-2 border-dashed border-amber-300' : ''
                    } ${
                      isActive ? 'ring-2 ring-emerald-400 shadow-md z-10 opacity-100 scale-y-105' : ''
                    }`}
                    title={`${seg.instrumentName}${isVocal ? ' (Vocal)' : ''}${isProvisional ? ' [Provisional]' : ''} (${formatTime(seg.startTime)} - ${formatTime(seg.endTime)})`}
                  >
                    <span className="text-[9.5px] font-bold text-white truncate drop-shadow-sm select-none">
                      {isVocal ? '🎙️ ' : ''}{seg.instrumentName}
                    </span>
                  </div>
                );
              })}

              {/* Vertical Playhead Cursor */}
              <div
                style={{
                  left: `${(playerCurrentTime / effectiveDuration) * 100}%`,
                }}
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 shadow-md pointer-events-none z-20"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 -mt-0.5 shadow-sm" />
              </div>
            </div>

            {/* Timeline Time Labels */}
            <div className="flex justify-between text-[10px] font-mono text-[#77747D]">
              <span>0:00</span>
              <span>{formatTime(effectiveDuration * 0.25)}</span>
              <span>{formatTime(effectiveDuration * 0.5)}</span>
              <span>{formatTime(effectiveDuration * 0.75)}</span>
              <span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>

          {/* Chronological Cue List of Segments */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
              Audible Cue Log ({timelineSegments.length} segments):
            </span>

            {timelineSegments.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#77747D] border border-dashed rounded-xl">
                {isAnalyzing
                  ? 'Transcribing audio timeline...'
                  : analysisCoverage
                  ? 'No musical instruments audibly detected in this recording (speech, ambient sound, or silence).'
                  : 'No timeline segments detected. Click Analyze Track above.'}
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {timelineSegments.map((seg) => {
                  const isActive = isSegmentActiveAtTime(seg, playerCurrentTime);
                  const familyCfg = FAMILY_CONFIG[seg.family] || FAMILY_CONFIG.Other;

                  return (
                    <div
                      key={seg.id}
                      onClick={() => handleSeek(seg.startTime)}
                      className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isActive
                          ? `${familyCfg.bgClass} ${familyCfg.borderClass} ${familyCfg.activeGlow}`
                          : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/5 dark:border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Timestamp Button */}
                        <div
                          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                            isActive
                              ? 'bg-[#7567C7] text-white shadow-xs'
                              : 'bg-black/10 dark:bg-white/10 text-current'
                          }`}
                        >
                          {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                        </div>

                        {/* Instrument & Family */}
                        <div className="truncate">
                          <span className="font-bold text-[#25242A] dark:text-[#F4F2F7] mr-1.5">
                            {seg.instrumentName}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.2 rounded"
                            style={{ backgroundColor: `${familyCfg.color}20`, color: familyCfg.color }}
                          >
                            {seg.family}
                          </span>
                          {(seg.isVoice || isVoiceInstrument(seg.instrumentName)) && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-pink-500/15 text-pink-600 dark:text-pink-400 ml-1">
                              Vocal
                            </span>
                          )}
                          {seg.status === 'provisional' && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 ml-1">
                              Provisional
                            </span>
                          )}
                          {seg.evidence && (
                            <span className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] ml-2 truncate hidden sm:inline">
                              — {seg.evidence}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status & Diagnostic Badge */}
                      <div className="flex items-center gap-2 shrink-0">
                        {typeof seg.confidence === 'number' && (
                          <span className="text-[10px] font-mono text-[#77747D]">
                            {seg.confidence}%
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isActive
                              ? 'bg-emerald-500 text-white animate-pulse'
                              : 'bg-black/5 dark:bg-white/10 text-[#77747D]'
                          }`}
                        >
                          {isActive ? '● SOUNDING NOW' : 'Resting'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            4. COMPREHENSIVE INSTRUMENT LIST (GROUPED BY FAMILY)
            ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-[#7567C7]" />
                <span>Comprehensive Instrument Catalog by Family</span>
              </h2>
              <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] mt-0.5">
                Full taxonomy covering orchestral, acoustic, folk, world, keyboard, percussion, and electronic instruments.
              </p>
            </div>

            {/* Family Category Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedFamilyFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedFamilyFilter === 'all'
                    ? 'bg-[#7567C7] text-white shadow-xs'
                    : 'bg-black/5 dark:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                }`}
              >
                All Families
              </button>
              {ORDERED_FAMILIES.map((fam) => (
                <button
                  key={fam}
                  type="button"
                  onClick={() => setSelectedFamilyFilter(fam)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedFamilyFilter === fam
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'bg-black/5 dark:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                >
                  {fam}
                </button>
              ))}
            </div>
          </div>

          {/* Grouped Family Cards */}
          <div className="space-y-4">
            {ORDERED_FAMILIES.filter(
              (fam) => selectedFamilyFilter === 'all' || selectedFamilyFilter === fam
            ).map((familyKey) => {
              const group = groupedCatalog[familyKey];
              const isCollapsed = Boolean(collapsedFamilies[familyKey]);
              const activeCountInFamily = group.instruments.filter((i) =>
                activeInstrumentNamesSet.has(i.canonicalName.toLowerCase())
              ).length;
              const detectedCountInFamily = group.instruments.filter((i) =>
                timelineSegments.some(
                  (seg) => seg.instrumentName.toLowerCase() === i.canonicalName.toLowerCase()
                )
              ).length;

              return (
                <div
                  key={familyKey}
                  className={`rounded-xl border transition-all ${group.config.borderClass} ${group.config.bgClass}`}
                >
                  {/* Family Header */}
                  <div
                    onClick={() =>
                      setCollapsedFamilies((prev) => ({
                        ...prev,
                        [familyKey]: !prev[familyKey],
                      }))
                    }
                    className="p-3 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: group.config.color }}
                      />
                      <span className="font-bold text-xs sm:text-sm text-[#25242A] dark:text-[#F4F2F7]">
                        {group.config.name}
                      </span>
                      <span className="text-[11px] font-semibold text-[#77747D]">
                        ({detectedCountInFamily} in track • {group.instruments.length} catalog)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeCountInFamily > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white animate-pulse">
                          {activeCountInFamily} SOUNDING NOW
                        </span>
                      )}
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4 text-[#77747D]" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-[#77747D]" />
                      )}
                    </div>
                  </div>

                  {/* Instrument Items Grid */}
                  {!isCollapsed && (
                    <div className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {group.instruments.map((inst) => {
                        const isSoundingNow = activeInstrumentNamesSet.has(
                          inst.canonicalName.toLowerCase()
                        );
                        const instSegments = timelineSegments.filter(
                          (s) => s.instrumentName.toLowerCase() === inst.canonicalName.toLowerCase()
                        );
                        const isDetectedInTrack = instSegments.length > 0;

                        return (
                          <div
                            key={inst.id}
                            onClick={() => {
                              if (isDetectedInTrack && instSegments.length > 0) {
                                const nextSeg =
                                  instSegments.find((s) => s.startTime > playerCurrentTime + 0.1) ||
                                  instSegments[0];
                                handleSeek(nextSeg.startTime);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-xs transition-all flex flex-col justify-between gap-1.5 ${
                              isSoundingNow
                                ? 'bg-white dark:bg-[#1E1B2E] border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
                                : isDetectedInTrack
                                ? 'bg-white/80 dark:bg-[#161422]/80 border-black/10 dark:border-white/10 hover:border-[#7567C7]'
                                : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-60'
                            } ${isDetectedInTrack ? 'cursor-pointer' : ''}`}
                            title={
                              isSoundingNow
                                ? `${inst.canonicalName}: Actively sounding at ${formatTime(playerCurrentTime)}`
                                : isDetectedInTrack
                                ? `Click to seek to entrance (${formatTime(
                                    (
                                      instSegments.find((s) => s.startTime > playerCurrentTime + 0.1) ||
                                      instSegments[0]
                                    ).startTime
                                  )})`
                                : inst.description
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                                {inst.canonicalName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                                  isSoundingNow
                                    ? 'bg-emerald-500 text-white animate-pulse'
                                    : isDetectedInTrack
                                    ? 'bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A898F8]'
                                    : 'bg-black/5 dark:bg-white/10 text-[#77747D]'
                                }`}
                              >
                                {isSoundingNow
                                  ? '● ACTIVE'
                                  : isDetectedInTrack
                                  ? `${instSegments.length} cue${instSegments.length > 1 ? 's' : ''} (Resting)`
                                  : 'Not in track'}
                              </span>
                            </div>

                            <p className="text-[10px] text-[#77747D] dark:text-[#A4A1AA] line-clamp-1">
                              {inst.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-[#7567C7]" />
          <span>
            {analysisMode === 'live'
              ? 'True Live Detection processes shared browser tab audio (16 kHz mono PCM) locally on-device using MediaPipe AudioSet YAMNet with zero server audio uploads.'
              : 'Full-Track Analysis synchronizes active instruments directly from the YouTube player playback position without requiring tab-audio capture or microphone permissions.'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default InstrumentAnalysisView;
