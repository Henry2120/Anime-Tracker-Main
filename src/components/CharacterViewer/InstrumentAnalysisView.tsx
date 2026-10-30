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
} from '../../utils/instrumentNormalization';

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

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'detected' | 'partial' | 'unsupported' | 'error'>('idle');
  const [analysisCoverage, setAnalysisCoverage] = useState<{
    startSecond: number;
    endSecond: number;
    totalDuration: number;
    isFullCoverage: boolean;
    coveragePercentage?: number;
    analyzedRanges?: Array<{ start: number; end: number }>;
    missingRanges?: Array<{ start: number; end: number }>;
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
  const currentRequestIdRef = useRef(0);

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
              const dur = event.target.getDuration();
              if (typeof dur === 'number' && dur > 0) {
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

              // Update time immediately on any state change (e.g. pause or seek)
              try {
                const t = event.target.getCurrentTime();
                if (typeof t === 'number' && !isNaN(t)) {
                  setPlayerCurrentTime(t);
                }
                const dur = event.target.getDuration();
                if (typeof dur === 'number' && dur > 0) {
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
  // ANALYZE TRACK ACTION (BACKEND GEMINI REQUEST)
  // =========================================================================
  const executeTrackAnalysis = useCallback(async (targetVideoId: string, customUrl?: string) => {
    const cleanId = targetVideoId.trim();
    if (!cleanId || cleanId.length < 5) {
      setAnalysisError('Please enter a valid YouTube video URL or 11-character video ID.');
      return;
    }

    const requestId = ++currentRequestIdRef.current;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus('idle');
    setAnalysisCoverage(null);
    setAnalysisSummary('');

    // Clear previous results immediately to avoid stale data from previous tracks
    setTimelineSegments([]);
    setAllDetectedInstruments([]);

    // Check if switching to a different video
    const isVideoSwitch = cleanId !== activeVideoId;
    if (isVideoSwitch) {
      setActiveVideoId(cleanId);
      setPlayerCurrentTime(0);
      setPlayerDuration(0); // Reset duration immediately so old video duration is never sent!
    }

    try {
      const response = await fetch('/api/music/analyze-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: cleanId,
          url: customUrl || `https://www.youtube.com/watch?v=${cleanId}`,
          // If video switched, omit duration so backend queries true media duration
          duration: !isVideoSwitch && playerDuration > 0 ? playerDuration : undefined,
        }),
      });

      if (requestId !== currentRequestIdRef.current) return;

      if (!response.ok) {
        throw new Error(`Analysis server returned HTTP status ${response.status}`);
      }

      const data = await response.json();
      if (requestId !== currentRequestIdRef.current) return;

      if (!data.success) {
        setAnalysisStatus(data.status || 'error');
        setAnalysisError(
          data.error ||
            'Unable to analyze this YouTube video. Please ensure the video is publicly accessible.'
        );
        return;
      }

      setAnalysisStatus(data.status || 'detected');
      if (data.coverage) {
        setAnalysisCoverage(data.coverage);
        // Synchronize playerDuration from verified authoritative coverage duration if client was unset
        if (typeof data.coverage.totalDuration === 'number' && data.coverage.totalDuration > 0) {
          if (playerDuration <= 0 || isVideoSwitch) {
            setPlayerDuration(data.coverage.totalDuration);
          }
        }
      }
      setVideoTitle(data.title || `YouTube Track (${cleanId})`);
      setVideoArtist(data.artist || '');
      setAnalysisSummary(data.analysisSummary || '');

      // Parse structured timeline segments with duration bounding and gap preservation
      const parsedSegments = parseTimelineSegments(data.instrumentSegments, {
        maxDuration: data.coverage?.totalDuration || (playerDuration > 0 ? playerDuration : undefined),
        gapMergeThreshold: 1.0, // Merges micro-overlaps while strictly preserving rests >= 1.0s
      });
      setTimelineSegments(parsedSegments);

      // Parse detected instruments list
      if (Array.isArray(data.allDetectedInstruments) && data.allDetectedInstruments.length > 0) {
        setAllDetectedInstruments(data.allDetectedInstruments);
      } else {
        // Derive from timeline segments if not provided separately
        const uniqueMap = new Map<string, { name: string; family: string }>();
        parsedSegments.forEach((seg) => {
          if (!uniqueMap.has(seg.instrumentName)) {
            uniqueMap.set(seg.instrumentName, { name: seg.instrumentName, family: seg.family });
          }
        });
        setAllDetectedInstruments(Array.from(uniqueMap.values()));
      }
    } catch (err: any) {
      if (requestId !== currentRequestIdRef.current) return;
      console.error('[InstrumentAnalysisView] Analysis failed:', err);
      setAnalysisStatus('error');
      setAnalysisError(
        err.message ||
          'Failed to connect to the analysis service. Please check your internet connection or server status.'
      );
    } finally {
      if (requestId === currentRequestIdRef.current) {
        setIsAnalyzing(false);
      }
    }
  }, [activeVideoId, playerDuration]);

  // Initial analysis on first mount
  useEffect(() => {
    executeTrackAnalysis('x3G1I_9DPf4', 'https://www.youtube.com/watch?v=x3G1I_9DPf4');
  }, []);

  const handleAnalyzeClick = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setAnalysisError('Please enter a YouTube video URL or ID.');
      return;
    }
    const extracted = extractYouTubeVideoId(trimmed) || trimmed;
    executeTrackAnalysis(extracted, trimmed);
  };

  const handleSelectPreset = (trackId: string, trackTitle: string) => {
    const url = `https://www.youtube.com/watch?v=${trackId}`;
    setInputUrl(url);
    // Invalidate stale data immediately before new analysis
    setTimelineSegments([]);
    setAllDetectedInstruments([]);
    setPlayerCurrentTime(0);
    setPlayerDuration(0); // Reset stale duration from previous track!
    executeTrackAnalysis(trackId, url);
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

        {/* Input Bar & Preset Quick-Select */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAnalyzeClick();
                }}
                placeholder="Paste public YouTube URL or 11-char video ID (e.g. x3G1I_9DPf4)..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none transition-all placeholder:text-[#9E9AA6]"
              />
              <Search className="h-4 w-4 absolute left-3 top-3 text-[#9E9AA6]" />
            </div>

            <button
              type="button"
              onClick={handleAnalyzeClick}
              disabled={isAnalyzing}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-50 text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing Audio...</span>
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5" />
                  <span>Analyze Track</span>
                </>
              )}
            </button>
          </div>

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

            {analysisCoverage && (
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

          {/* Error Notice */}
          {analysisError && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="break-words">{analysisError}</span>
              </div>
              <button
                type="button"
                onClick={handleAnalyzeClick}
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

              {/* 2. Timeline Segments Blocks */}
              {timelineSegments.map((seg) => {
                const leftPct = (seg.startTime / effectiveDuration) * 100;
                const widthPct = Math.max(1.5, ((seg.endTime - seg.startTime) / effectiveDuration) * 100);
                const isActive = isSegmentActiveAtTime(seg, playerCurrentTime);
                const familyCfg = FAMILY_CONFIG[seg.family] || FAMILY_CONFIG.Other;

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
                      isActive ? 'ring-2 ring-emerald-400 shadow-md z-10 opacity-100 scale-y-105' : ''
                    }`}
                    title={`${seg.instrumentName} (${formatTime(seg.startTime)} - ${formatTime(seg.endTime)})`}
                  >
                    <span className="text-[9.5px] font-bold text-white truncate drop-shadow-sm select-none">
                      {seg.instrumentName}
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
                {isAnalyzing ? 'Transcribing audio timeline...' : 'No timeline segments detected. Click Analyze Track above.'}
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
            Timeline synchronization calculates active instruments directly from the YouTube player's playback position. No audio capture or microphone permissions required.
          </span>
        </div>
      </div>
    </div>
  );
};

export default InstrumentAnalysisView;
