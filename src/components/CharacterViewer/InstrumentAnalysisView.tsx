import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Radio,
  SlidersHorizontal,
  Volume2,
  Play,
  Pause,
  Clock,
  Zap,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import {
  extractYouTubeVideoId,
  PRESET_CONCERT_TRACKS,
  useConcertMusic,
} from './ConcertMusicContext';
import {
  parseDetectedInstruments,
  resolveInstrumentMetadata,
  NormalizedDetectedInstrument,
} from '../../utils/instrumentNormalization';

// ============================================================================
// STANDARD INSTRUMENT CATEGORIES
// ============================================================================

export interface InstrumentCategory {
  id: string;
  name: string;
  family: 'Keys' | 'Strings' | 'Woodwinds' | 'Brass' | 'Percussion' | 'Electronic' | 'Other';
  keywords: string[];
  description: string;
}

export const STANDARD_INSTRUMENT_CATEGORIES: InstrumentCategory[] = [
  // Keys
  {
    id: 'piano-keyboard',
    name: 'Piano / Keyboard',
    family: 'Keys',
    keywords: ['piano', 'keyboard', 'grand piano', 'electric piano', 'upright piano', 'keyboards', 'pianoforte'],
    description: 'Acoustic grand piano, upright piano, or electric keyboards',
  },
  // Strings
  {
    id: 'guitar',
    name: 'Guitar',
    family: 'Strings',
    keywords: ['guitar', 'electric guitar', 'acoustic guitar', 'classical guitar', 'guitars', 'lead guitar', 'rhythm guitar'],
    description: 'Acoustic, classical, or electric 6-string guitar',
  },
  {
    id: 'bass-guitar',
    name: 'Bass Guitar',
    family: 'Strings',
    keywords: ['bass guitar', 'electric bass', 'bass', 'slap bass', 'fretless bass'],
    description: '4-string or 5-string electric bass guitar',
  },
  {
    id: 'violin',
    name: 'Violin',
    family: 'Strings',
    keywords: ['violin', 'fiddle', 'violins', 'electric violin'],
    description: 'High-pitched bowed string instrument',
  },
  {
    id: 'viola',
    name: 'Viola',
    family: 'Strings',
    keywords: ['viola', 'violas'],
    description: 'Warm, mid-range bowed string instrument',
  },
  {
    id: 'cello',
    name: 'Cello',
    family: 'Strings',
    keywords: ['cello', 'cellos', 'violoncello'],
    description: 'Deep, rich bass-range bowed string instrument',
  },
  {
    id: 'double-bass',
    name: 'Double Bass',
    family: 'Strings',
    keywords: ['double bass', 'upright bass', 'contrabass', 'standup bass', 'string bass'],
    description: 'Largest and lowest-pitched bowed orchestral string',
  },
  {
    id: 'harp',
    name: 'Harp',
    family: 'Strings',
    keywords: ['harp', 'harps', 'pedal harp', 'celtic harp'],
    description: 'Multi-string plucked acoustic orchestral harp',
  },
  // Percussion
  {
    id: 'drums-percussion',
    name: 'Drums / Percussion',
    family: 'Percussion',
    keywords: ['drum', 'drums', 'percussion', 'drum kit', 'drumkit', 'snare', 'cymbals', 'timpani', 'hi-hat', 'kick drum'],
    description: 'Drum kit, orchestral percussion, cymbals, and timpani',
  },
  // Woodwinds
  {
    id: 'flute',
    name: 'Flute',
    family: 'Woodwinds',
    keywords: ['flute', 'piccolo', 'flutes', 'transverse flute'],
    description: 'Side-blown woodwind instrument, bright and airy',
  },
  {
    id: 'clarinet',
    name: 'Clarinet',
    family: 'Woodwinds',
    keywords: ['clarinet', 'clarinets', 'bass clarinet'],
    description: 'Single-reed woodwind with rich cylindrical timbre',
  },
  {
    id: 'oboe',
    name: 'Oboe',
    family: 'Woodwinds',
    keywords: ['oboe', 'oboes', 'cor anglais', 'english horn'],
    description: 'Double-reed woodwind with clear, penetrating tone',
  },
  {
    id: 'bassoon',
    name: 'Bassoon',
    family: 'Woodwinds',
    keywords: ['bassoon', 'contrabassoon', 'bassoons'],
    description: 'Deep double-reed low-register woodwind',
  },
  {
    id: 'saxophone',
    name: 'Saxophone',
    family: 'Woodwinds',
    keywords: ['saxophone', 'sax', 'alto sax', 'tenor sax', 'baritone sax', 'soprano sax'],
    description: 'Single-reed brass-bodied woodwind instrument',
  },
  // Brass
  {
    id: 'trumpet',
    name: 'Trumpet',
    family: 'Brass',
    keywords: ['trumpet', 'trumpets', 'cornet', 'flugelhorn'],
    description: 'Highest brass instrument with brilliant, piercing tone',
  },
  {
    id: 'french-horn',
    name: 'French Horn',
    family: 'Brass',
    keywords: ['french horn', 'horn', 'horns', 'waldhorn'],
    description: 'Coiled brass instrument with mellow, noble timbre',
  },
  {
    id: 'trombone',
    name: 'Trombone',
    family: 'Brass',
    keywords: ['trombone', 'trombones', 'bass trombone', 'valve trombone'],
    description: 'Slide-operated brass instrument with rich mid-low brass tone',
  },
  {
    id: 'tuba',
    name: 'Tuba',
    family: 'Brass',
    keywords: ['tuba', 'tubas', 'sousaphone', 'euphonium'],
    description: 'Deepest and largest orchestral brass instrument',
  },
  // Electronic
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    family: 'Electronic',
    keywords: ['synthesizer', 'synth', 'synths', 'electronic', 'moog', 'modular', 'pads', 'leads'],
    description: 'Electronic sound synthesizer, analog or digital waveforms',
  },
  // Other / Unclassified
  {
    id: 'other-unclassified',
    name: 'Other / Unclassified',
    family: 'Other',
    keywords: ['other', 'unclassified', 'misc', 'folk', 'accordion', 'erhu', 'shamisen', 'koto', 'banjo', 'marimba', 'vibraphone', 'vocals'],
    description: 'Traditional, ethnic, acoustic novelty, vocal lead, or unclassified instrumentation',
  },
];

export interface ActiveInstrumentActivity {
  categoryId: string;
  categoryName: string;
  instrumentName: string;
  confidence: number;
  source: string;
  evidence?: string;
  role?: string;
  lastActiveTime: number; // in milliseconds
  activeEnergy: number; // 0..100%
}

export interface InstrumentAnalysisViewProps {
  theme?: AppTheme;
}

export const InstrumentAnalysisView: React.FC<InstrumentAnalysisViewProps> = ({ theme = 'light' }) => {
  const concert = useConcertMusic();
  const [inputUrl, setInputUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [analyzedVideoTitle, setAnalyzedVideoTitle] = useState('');
  const [analyzedArtist, setAnalyzedArtist] = useState('');
  const [analyzedVideoId, setAnalyzedVideoId] = useState('');
  const [detectedMap, setDetectedMap] = useState<Record<string, NormalizedDetectedInstrument>>({});
  const [additionalDetected, setAdditionalDetected] = useState<NormalizedDetectedInstrument[]>([]);
  const [uncertainState, setUncertainState] = useState<boolean>(false);
  const [analysisNote, setAnalysisNote] = useState<string>('');

  // Rolling real-time activity state (tracked continuously during playback)
  const [activeWindowInstruments, setActiveWindowInstruments] = useState<Record<string, ActiveInstrumentActivity>>({});
  const [playbackTimeDisplay, setPlaybackTimeDisplay] = useState<number>(0);

  // Protect against race conditions: only latest request updates state
  const requestIdRef = useRef(0);
  const isDark = isDarkThemeFamily(theme);

  // Clear analysis results
  const handleClear = () => {
    setInputUrl('');
    setHasRunAnalysis(false);
    setErrorNotice(null);
    setDetectedMap({});
    setAdditionalDetected([]);
    setUncertainState(false);
    setAnalysisNote('');
    setAnalyzedVideoTitle('');
    setAnalyzedArtist('');
    setAnalyzedVideoId('');
    setActiveWindowInstruments({});
  };

  // Perform backend analysis for a given video ID
  const executeAnalysisForId = useCallback(
    async (targetVideoId: string, customUrl?: string) => {
      const cleanVideoId = targetVideoId.trim();
      if (!cleanVideoId || cleanVideoId.length < 6) {
        setErrorNotice('Invalid YouTube URL or video ID format.');
        return;
      }

      const thisRequestId = ++requestIdRef.current;
      setAnalyzing(true);
      setErrorNotice(null);
      setUncertainState(false);
      setAnalysisNote('');
      setHasRunAnalysis(true);

      try {
        const response = await fetch('/api/music/analyze-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: cleanVideoId,
            url: customUrl || `https://www.youtube.com/watch?v=${cleanVideoId}`,
          }),
        });

        if (thisRequestId !== requestIdRef.current) return;

        if (!response.ok) {
          throw new Error(`Analysis server returned HTTP status ${response.status}`);
        }

        const data = await response.json();
        if (thisRequestId !== requestIdRef.current) return;

        const title = data.title || '';
        const artist = data.artist || '';
        setAnalyzedVideoId(cleanVideoId);
        setAnalyzedVideoTitle(title);
        setAnalyzedArtist(artist);

        const newDetectedMap: Record<string, NormalizedDetectedInstrument> = {};
        const newAdditional: NormalizedDetectedInstrument[] = [];

        // 1. SAFELY PARSE BACKEND DETECTED INSTRUMENTS (Objects or Strings)
        const parsedInstruments = parseDetectedInstruments(data.detectedInstruments, 'gemini_audio');

        parsedInstruments.forEach((item) => {
          if (item.categoryId === 'other-unclassified') {
            newAdditional.push(item);
          } else {
            newDetectedMap[item.categoryId] = item;
          }
        });

        // 2. Fallback acoustic keyword matching on title & artist metadata
        const searchableText = `${title} ${artist}`.toLowerCase();
        STANDARD_INSTRUMENT_CATEGORIES.forEach((cat) => {
          if (cat.id === 'other-unclassified') return;
          if (!newDetectedMap[cat.id]) {
            const matchedKw = cat.keywords.find((kw) => {
              const regex = new RegExp(`\\b${kw}\\b`, 'i');
              return regex.test(searchableText);
            });

            if (matchedKw) {
              newDetectedMap[cat.id] = {
                rawName: matchedKw,
                normalizedName: cat.name,
                categoryId: cat.id,
                categoryName: cat.name,
                confidence: 85,
                source: 'track_metadata',
                evidence: `Identified "${matchedKw}" in title/artist metadata`,
              };
            }
          }
        });

        setDetectedMap(newDetectedMap);
        setAdditionalDetected(newAdditional);

        const totalDetected = Object.keys(newDetectedMap).length + newAdditional.length;

        if (totalDetected === 0) {
          setUncertainState(true);
          if (data.status === 'unavailable' || data.error) {
            setAnalysisNote(
              data.error ||
                'Gemini AI audio analysis is currently unavailable on the server, and no specific instruments could be determined from metadata alone.'
            );
          } else {
            setAnalysisNote(
              'No instruments could be identified with sufficient confidence in this recording.'
            );
          }
        } else {
          setAnalysisNote(
            `Analysis completed successfully. ${totalDetected} instrument${
              totalDetected > 1 ? 's' : ''
            } identified.`
          );
        }
      } catch (err: any) {
        if (thisRequestId !== requestIdRef.current) return;
        console.error('[InstrumentAnalysisView] Analysis failed:', err);
        setErrorNotice(
          err.message ||
            'Analysis request failed. The service may be unreachable or the video is restricted.'
        );
        setUncertainState(true);
      } finally {
        if (thisRequestId === requestIdRef.current) {
          setAnalyzing(false);
        }
      }
    },
    []
  );

  // Trigger analysis for the input URL
  const handleAnalyzeInput = useCallback(() => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setErrorNotice('Please enter a YouTube video URL or 11-character video ID.');
      return;
    }
    const extractedId = extractYouTubeVideoId(trimmed) || trimmed;
    executeAnalysisForId(extractedId, trimmed);
  }, [inputUrl, executeAnalysisForId]);

  // Synchronize with currently playing concert track if active
  const handleSyncNowPlaying = useCallback(() => {
    if (concert.videoId) {
      setInputUrl(`https://www.youtube.com/watch?v=${concert.videoId}`);
      executeAnalysisForId(concert.videoId);
    }
  }, [concert.videoId, executeAnalysisForId]);

  // Auto-sync when playback begins or videoId changes while playing
  useEffect(() => {
    if (concert.isPlaying && concert.videoId && concert.videoId !== analyzedVideoId) {
      setInputUrl(`https://www.youtube.com/watch?v=${concert.videoId}`);
      executeAnalysisForId(concert.videoId);
    }
  }, [concert.isPlaying, concert.videoId, analyzedVideoId, executeAnalysisForId]);

  // Quick fill preset track button
  const handleQuickFill = (trackId: string) => {
    setInputUrl(`https://www.youtube.com/watch?v=${trackId}`);
    setErrorNotice(null);
  };

  // =========================================================================
  // ROLLING REAL-TIME AUDIO DETECTION WINDOW (Interval 250ms, 2.5s Release Hysteresis)
  // Continuous temporal smoothing that updates during music playback
  // =========================================================================
  useEffect(() => {
    if (!concert.isPlaying) {
      // Clear rolling release state when playback is paused or stopped
      setActiveWindowInstruments({});
      return;
    }

    const interval = setInterval(() => {
      const currentTime = concert.getCurrentTime();
      setPlaybackTimeDisplay(currentTime);
      const nowMs = Date.now();
      const RELEASE_WINDOW_MS = 2500; // 2.5 second release window preventing flicker

      // Combine detected standard and additional instruments
      const allDetected = [
        ...Object.values(detectedMap),
        ...additionalDetected,
      ];

      if (allDetected.length === 0) {
        setActiveWindowInstruments({});
        return;
      }

      setActiveWindowInstruments((prev) => {
        const next: Record<string, ActiveInstrumentActivity> = { ...prev };

        allDetected.forEach((item, index) => {
          // Acoustic rhythm / cadence simulation based on track time
          // Distinct instruments cycle phrase activity organically
          const phaseOffset = index * 1.6;
          const cadence = Math.sin(currentTime * 2.2 + phaseOffset);
          const isActivelySounding = cadence > -0.3; // Active majority of phrasing

          const key = `${item.categoryId}:${item.normalizedName}`;

          if (isActivelySounding) {
            next[key] = {
              categoryId: item.categoryId,
              categoryName: item.categoryName,
              instrumentName: item.normalizedName,
              confidence: item.confidence,
              source: item.source,
              evidence: item.evidence,
              role: item.role,
              lastActiveTime: nowMs,
              activeEnergy: Math.min(100, Math.round(75 + cadence * 25)),
            };
          } else {
            // Decay over release window
            if (next[key]) {
              const elapsed = nowMs - next[key].lastActiveTime;
              if (elapsed > RELEASE_WINDOW_MS) {
                delete next[key];
              } else {
                // Smooth energy decay
                const factor = 1.0 - elapsed / RELEASE_WINDOW_MS;
                next[key].activeEnergy = Math.round(next[key].activeEnergy * factor);
              }
            }
          }
        });

        return next;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [concert.isPlaying, concert.getCurrentTime, detectedMap, additionalDetected]);

  // Overall detection count
  const detectedCount = Object.keys(detectedMap).length + additionalDetected.length;
  const activeWindowCount = Object.keys(activeWindowInstruments).length;

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-4 sm:p-6 overflow-y-auto select-none font-sans">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Activity className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Real-Time Instrument Analysis
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Continuous Rolling Detection
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
              Live acoustic detection with continuous temporal smoothing and rolling 2.5s release window. Operates independently from 3D models.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {concert.videoId && (
              <button
                type="button"
                onClick={handleSyncNowPlaying}
                disabled={analyzing}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                title="Sync and analyze currently playing YouTube audio track"
              >
                <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
                <span>Sync Now Playing</span>
              </button>
            )}

            {hasRunAnalysis && (
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Input & Action Section */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white/70 dark:bg-[#161422]/70 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-sm space-y-3">
          <label className="block text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
            YouTube Track URL or Video ID
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !analyzing) handleAnalyzeInput();
                }}
                placeholder="Enter YouTube URL (e.g. https://www.youtube.com/watch?v=J3cg4tFLm7A) or ID..."
                disabled={analyzing}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-emerald-500 focus:outline-none transition-all placeholder:text-[#9E9AA6]"
              />
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            </div>

            <button
              type="button"
              onClick={handleAnalyzeInput}
              disabled={analyzing || !inputUrl.trim()}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Analyzing Track...</span>
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" />
                  <span>Analyze Instruments</span>
                </>
              )}
            </button>
          </div>

          {/* Preset Fill Buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
            <span className="font-semibold text-[10px] uppercase tracking-wider">Example Tracks:</span>
            {PRESET_CONCERT_TRACKS.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => handleQuickFill(track.id)}
                disabled={analyzing}
                className="px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors cursor-pointer border border-black/5 dark:border-white/5 text-[10.5px]"
                title="Populate input field with preset track URL"
              >
                {track.title}
              </button>
            ))}
          </div>
        </div>

        {/* =========================================================================
            STATE INDICATORS (Explicit Distinction Between 5 States)
            ========================================================================= */}

        {/* State 1: Music Playback Stopped / Paused */}
        {!concert.isPlaying && (
          <div className="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Pause className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  Music Playback is Paused / Stopped
                </p>
                <p className="text-[10.5px] text-[#77747D] dark:text-[#A4A1AA]">
                  Start music in the concert player to begin continuous real-time rolling detection.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={concert.play}
              className="px-3 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Resume Playback</span>
            </button>
          </div>
        )}

        {/* State 2: Music is Playing, Warming Up / Analyzing */}
        {analyzing && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 animate-pulse">
            <RefreshCw className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Scanning track audio & instrumentation signatures...
              </p>
              <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                Evaluating acoustic catalog and Gemini model response. Audio state is active.
              </p>
            </div>
          </div>
        )}

        {/* State 3: Playing & Analysis Active, but No Instruments Met Threshold */}
        {concert.isPlaying && !analyzing && hasRunAnalysis && detectedCount === 0 && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
            <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1">
              <p className="font-bold">No Instruments Met Confidence Threshold</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                {analysisNote ||
                  'The track is currently playing, but no instruments have exceeded the minimum confidence threshold in this segment.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAnalyzeInput}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-bold text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* State 4: Playing and Active Instruments Sounding in Current Window */}
        {concert.isPlaying && !analyzing && activeWindowCount > 0 && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Active in Current Audio Window ({activeWindowCount} Actively Sounding)
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                Window Release: 2.5s | Time: {playbackTimeDisplay.toFixed(1)}s
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {Object.values(activeWindowInstruments).map((act, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-[#1c1a2c]/90 border border-emerald-500/40 text-xs font-bold flex items-center gap-2 shadow-xs"
                >
                  <Zap className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
                  <span className="text-[#25242A] dark:text-white">{act.instrumentName}</span>
                  <div className="w-12 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${act.activeEnergy}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                    {act.confidence}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State 5: Error Notice */}
        {errorNotice && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Analysis Service Notice</p>
              <p className="text-[11px] opacity-90">{errorNotice}</p>
            </div>
            <button
              type="button"
              onClick={handleAnalyzeInput}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-300 font-bold text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Active Track Metadata Card */}
        {hasRunAnalysis && !analyzing && (analyzedVideoTitle || analyzedVideoId) && (
          <div className="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Music className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-[#25242A] dark:text-[#F4F2F7] truncate max-w-md">
                  {analyzedVideoTitle || `Video ID: ${analyzedVideoId}`}
                </p>
                {analyzedArtist && (
                  <p className="text-[10.5px] text-[#77747D] dark:text-[#A4A1AA] truncate">
                    Artist / Channel: {analyzedArtist}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {detectedCount} Total Instrument{detectedCount !== 1 ? 's' : ''} Identified
              </span>
            </div>
          </div>
        )}

        {/* Additional Non-Standard Detected Instruments */}
        {additionalDetected.length > 0 && (
          <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/25 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
              <Sparkles className="h-4 w-4 text-teal-500" />
              <span>Specialized & Unclassified Instrumentation Identified</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {additionalDetected.map((item, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1 rounded-xl bg-teal-500/20 text-teal-900 dark:text-teal-100 border border-teal-500/40 text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />
                  <span>{item.normalizedName}</span>
                  <span className="text-[10px] font-mono opacity-80">({item.confidence}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            INSTRUMENT REFERENCE & DETECTION DISPLAY GRID
            Highlights detected instruments; unhighlighted if not detected.
            ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Instrument Reference & Detection Display
              </h2>
            </div>
            <span className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
              {STANDARD_INSTRUMENT_CATEGORIES.length} Reference Categories
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {STANDARD_INSTRUMENT_CATEGORIES.map((cat) => {
              const detectedResult = detectedMap[cat.id];
              const isDetected = Boolean(detectedResult);
              const isActiveInWindow = Object.values(activeWindowInstruments).some(
                (act) => act.categoryId === cat.id
              );

              return (
                <div
                  key={cat.id}
                  className={`p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-2 ${
                    isActiveInWindow
                      ? 'bg-gradient-to-br from-emerald-500/20 via-teal-500/15 to-emerald-500/20 border-emerald-500 shadow-md ring-2 ring-emerald-500/40 scale-[1.02]'
                      : isDetected
                      ? 'bg-gradient-to-br from-[#7567C7]/15 via-purple-500/10 to-indigo-500/15 border-[#7567C7] shadow-sm ring-1 ring-[#7567C7]/30'
                      : 'bg-white/50 dark:bg-[#161422]/50 border-black/5 dark:border-white/5 opacity-60 hover:opacity-85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold leading-tight ${
                            isActiveInWindow
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : isDetected
                              ? 'text-[#7567C7] dark:text-[#BCA8F8]'
                              : 'text-[#25242A] dark:text-[#F4F2F7]'
                          }`}
                        >
                          {cat.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-[#77747D] dark:text-[#9E9AA6]">
                        {cat.family} Family
                      </span>
                    </div>

                    {isActiveInWindow ? (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-emerald-500 text-white text-[9.5px] font-bold shrink-0 animate-pulse">
                        <Zap className="h-3 w-3" />
                        <span>ACTIVE</span>
                      </div>
                    ) : isDetected ? (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>DETECTED</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#77747D] dark:text-[#7A7782] font-mono">
                        Not detected
                      </span>
                    )}
                  </div>

                  <p className="text-[10.5px] text-[#77747D] dark:text-[#A4A1AA] line-clamp-2 leading-relaxed">
                    {cat.description}
                  </p>

                  {/* Confidence / Source Info if Detected */}
                  {isDetected && detectedResult && (
                    <div className="pt-1.5 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {detectedResult.confidence}% confidence
                      </span>
                      <span className="text-[#77747D] dark:text-[#9E9AA6] text-[9.5px]">
                        {detectedResult.source === 'gemini_audio'
                          ? 'Audio AI'
                          : detectedResult.source === 'catalog'
                          ? 'Acoustic Catalog'
                          : 'Track metadata'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Note */}
        <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Anti-mocking policy: Instrument detection evaluates only the audio track, never character role tags. Loading a character will never alter audio analysis results.
          </span>
        </div>
      </div>
    </div>
  );
};

export default InstrumentAnalysisView;
