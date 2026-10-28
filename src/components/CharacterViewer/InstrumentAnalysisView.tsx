import React, { useState, useRef, useCallback } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import { extractYouTubeVideoId, PRESET_CONCERT_TRACKS } from './ConcertMusicContext';

// ============================================================================
// INSTRUMENT CATEGORIES (Fixed, extensible standard reference list)
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
    keywords: ['other', 'unclassified', 'misc', 'folk', 'accordion', 'erhu', 'shamisen', 'koto', 'banjo', 'marimba'],
    description: 'Traditional, ethnic, acoustic novelty, or unclassified instrumentation',
  },
];

export interface DetectedInstrumentResult {
  categoryId: string;
  categoryName: string;
  confidence: number; // 0..100
  source: 'gemini_audio' | 'track_metadata' | 'oembed';
  evidence?: string;
}

export interface InstrumentAnalysisViewProps {
  theme?: AppTheme;
}

export const InstrumentAnalysisView: React.FC<InstrumentAnalysisViewProps> = ({ theme = 'light' }) => {
  const [inputUrl, setInputUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [analyzedVideoTitle, setAnalyzedVideoTitle] = useState('');
  const [analyzedArtist, setAnalyzedArtist] = useState('');
  const [analyzedVideoId, setAnalyzedVideoId] = useState('');
  const [detectedMap, setDetectedMap] = useState<Record<string, DetectedInstrumentResult>>({});
  const [additionalDetected, setAdditionalDetected] = useState<string[]>([]);
  const [uncertainState, setUncertainState] = useState<boolean>(false);
  const [analysisNote, setAnalysisNote] = useState<string>('');

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
  };

  // Run analysis when user explicitly presses "Analyze Instruments"
  const handleAnalyze = useCallback(async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setErrorNotice('Please enter a YouTube video URL or 11-character video ID.');
      return;
    }

    const videoId = extractYouTubeVideoId(trimmed) || trimmed;
    if (!videoId || videoId.length < 6) {
      setErrorNotice('Invalid YouTube URL or video ID format.');
      return;
    }

    // Increment request ID so previous pending requests are discarded
    const thisRequestId = ++requestIdRef.current;
    setAnalyzing(true);
    setErrorNotice(null);
    setUncertainState(false);
    setAnalysisNote('');
    setHasRunAnalysis(true);

    try {
      // 1. Call existing analysis endpoint
      const response = await fetch('/api/music/analyze-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, url: trimmed }),
      });

      // If a newer request was dispatched while this was fetching, safely ignore
      if (thisRequestId !== requestIdRef.current) return;

      if (!response.ok) {
        throw new Error(`Analysis server returned HTTP status ${response.status}`);
      }

      const data = await response.json();
      if (thisRequestId !== requestIdRef.current) return;

      const title = data.title || '';
      const artist = data.artist || '';
      setAnalyzedVideoId(videoId);
      setAnalyzedVideoTitle(title);
      setAnalyzedArtist(artist);

      const newDetectedMap: Record<string, DetectedInstrumentResult> = {};
      const newAdditional: string[] = [];

      // Check if backend returned explicit detected instruments
      const backendInstruments: string[] = Array.isArray(data.detectedInstruments)
        ? data.detectedInstruments
        : [];

      if (backendInstruments.length > 0) {
        backendInstruments.forEach((instName) => {
          const lower = instName.toLowerCase().trim();
          let matched = false;
          for (const cat of STANDARD_INSTRUMENT_CATEGORIES) {
            if (
              cat.name.toLowerCase().includes(lower) ||
              cat.keywords.some((kw) => lower.includes(kw) || kw.includes(lower))
            ) {
              newDetectedMap[cat.id] = {
                categoryId: cat.id,
                categoryName: cat.name,
                confidence: 90,
                source: 'gemini_audio',
                evidence: instName,
              };
              matched = true;
              break;
            }
          }
          if (!matched && !newAdditional.includes(instName)) {
            newAdditional.push(instName);
          }
        });
      }

      // Check track title and artist metadata for verified acoustic instrument references
      const searchableText = `${title} ${artist}`.toLowerCase();
      let metadataFoundCount = 0;

      STANDARD_INSTRUMENT_CATEGORIES.forEach((cat) => {
        if (cat.id === 'other-unclassified') return;
        if (!newDetectedMap[cat.id]) {
          const matchedKw = cat.keywords.find((kw) => {
            // Require word boundary match to avoid false substrings
            const regex = new RegExp(`\\b${kw}\\b`, 'i');
            return regex.test(searchableText);
          });

          if (matchedKw) {
            newDetectedMap[cat.id] = {
              categoryId: cat.id,
              categoryName: cat.name,
              confidence: 85,
              source: 'track_metadata',
              evidence: `Matched "${matchedKw}" in title/artist metadata`,
            };
            metadataFoundCount++;
          }
        }
      });

      setDetectedMap(newDetectedMap);
      setAdditionalDetected(newAdditional);

      const totalDetected = Object.keys(newDetectedMap).length + newAdditional.length;

      if (totalDetected === 0) {
        // Honest explanation: audio stream analysis is disabled and title has no unambiguous instrument markers
        setUncertainState(true);
        if (data.disabled) {
          setAnalysisNote(
            'The AI audio analysis service is currently disabled on the server, and no specific instruments could be determined from the track metadata alone.'
          );
        } else {
          setAnalysisNote(
            'No instruments could be identified with sufficient confidence. The track may be speech, ambient audio, or unclassified instrumentation.'
          );
        }
      } else {
        if (data.disabled) {
          setAnalysisNote(
            'Instruments identified via verified track metadata and title analysis (server audio stream analysis is disabled).'
          );
        } else {
          setAnalysisNote(
            `Analysis completed successfully. ${totalDetected} instrument${
              totalDetected > 1 ? 's' : ''
            } identified.`
          );
        }
      }
    } catch (err: any) {
      if (thisRequestId !== requestIdRef.current) return;
      console.error('[InstrumentAnalysisView] Analysis failed:', err);
      setErrorNotice(
        err.message ||
          'Analysis failed. The service may be temporarily unreachable or the video is restricted.'
      );
      setUncertainState(true);
    } finally {
      if (thisRequestId === requestIdRef.current) {
        setAnalyzing(false);
      }
    }
  }, [inputUrl]);

  // Demo track quick-fill (ONLY fills the input — does NOT auto-analyze!)
  const handleQuickFill = (trackId: string, trackTitle: string) => {
    setInputUrl(`https://www.youtube.com/watch?v=${trackId}`);
    setErrorNotice(null);
  };

  const detectedCount = Object.keys(detectedMap).length + additionalDetected.length;

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-4 sm:p-6 overflow-y-auto select-none font-sans">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A898F8]">
                <Activity className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Instrument Analysis
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A898F8] border border-[#7567C7]/20">
                Standalone Interface
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
              Independent acoustic analysis tool. Analyzes a YouTube track and displays detected
              instruments without altering 3D characters or stage models.
            </p>
          </div>

          {hasRunAnalysis && (
            <button
              type="button"
              onClick={handleClear}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5"
            >
              Clear Analysis
            </button>
          )}
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
                  if (e.key === 'Enter' && !analyzing) handleAnalyze();
                }}
                placeholder="Enter YouTube URL (e.g. https://www.youtube.com/watch?v=J3cg4tFLm7A) or ID..."
                disabled={analyzing}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none transition-all placeholder:text-[#9E9AA6]"
              />
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            </div>

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !inputUrl.trim()}
              className="px-5 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0"
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

          {/* Preset Fill Buttons (Do NOT auto-analyze!) */}
          <div className="pt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
            <span className="font-semibold text-[10px] uppercase tracking-wider">Example Tracks:</span>
            {PRESET_CONCERT_TRACKS.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => handleQuickFill(track.id, track.title)}
                disabled={analyzing}
                className="px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-[#7567C7]/15 hover:text-[#7567C7] dark:hover:text-[#A898F8] transition-colors cursor-pointer border border-black/5 dark:border-white/5 text-[10.5px]"
                title="Click to populate input field (does not auto-analyze)"
              >
                {track.title}
              </button>
            ))}
            <span className="text-[10px] italic opacity-75 ml-1">
              (Fills input field; press Analyze Instruments to inspect)
            </span>
          </div>
        </div>

        {/* Loading State Banner */}
        {analyzing && (
          <div className="p-4 rounded-2xl bg-[#7567C7]/10 border border-[#7567C7]/30 flex items-center gap-3 animate-pulse">
            <RefreshCw className="h-5 w-5 animate-spin text-[#7567C7]" />
            <div>
              <p className="text-xs font-bold text-[#7567C7] dark:text-[#A898F8]">
                Scanning track instrumentation...
              </p>
              <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                Evaluating audio metadata and instrument signatures. This will not change your 3D stage.
              </p>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorNotice && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Analysis Notice</p>
              <p className="text-[11px] opacity-90">{errorNotice}</p>
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-300 font-bold text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Uncertain Result State Banner */}
        {uncertainState && !analyzing && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
            <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1">
              <p className="font-bold">Uncertain Analysis Result</p>
              <p className="text-[11px] opacity-90 mt-0.5">{analysisNote}</p>
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-bold text-[11px] cursor-pointer"
            >
              Retry Analysis
            </button>
          </div>
        )}

        {/* Active Track Metadata Card */}
        {hasRunAnalysis && !analyzing && (analyzedVideoTitle || analyzedVideoId) && (
          <div className="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Music className="h-4 w-4 text-[#7567C7] shrink-0" />
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
              <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A898F8] border border-[#7567C7]/20">
                {detectedCount} Instrument{detectedCount !== 1 ? 's' : ''} Identified
              </span>
            </div>
          </div>
        )}

        {/* Additional Non-Standard Detected Instruments (if identified) */}
        {additionalDetected.length > 0 && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <span>Additional Instruments Detected Beyond Standard Categories</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {additionalDetected.map((item, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{item}</span>
                  <span className="text-[10px] font-mono opacity-80">(Detected)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            RECOGNIZED INSTRUMENTS REFERENCE & DISPLAY GRID
            (Highlights detected instruments; unhighlighted if not detected)
            ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#7567C7]" />
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

              return (
                <div
                  key={cat.id}
                  className={`p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-2 ${
                    isDetected
                      ? 'bg-gradient-to-br from-[#7567C7]/15 via-purple-500/10 to-indigo-500/15 border-[#7567C7] shadow-md ring-2 ring-[#7567C7]/30 scale-[1.01]'
                      : 'bg-white/50 dark:bg-[#161422]/50 border-black/5 dark:border-white/5 opacity-60 hover:opacity-85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold leading-tight ${
                            isDetected
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

                    {isDetected ? (
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
                        {detectedResult.source === 'gemini_audio' ? 'Audio AI' : 'Track metadata'}
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
          <Info className="h-4 w-4 shrink-0 text-[#7567C7]" />
          <span>
            Instrument Analysis operates in total isolation from the 3D Viewer. Detecting instruments will never replace, add, or alter characters on your 3D stage.
          </span>
        </div>
      </div>
    </div>
  );
};

export default InstrumentAnalysisView;
