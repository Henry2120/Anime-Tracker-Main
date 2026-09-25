import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Music2,
  Sparkles,
  Youtube,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  FileAudio,
  AlertCircle,
  CheckCircle2,
  Radio,
  Plus,
  Minus,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { WorldSwitcher, AppMode } from '../WorldSwitcher';
import { AppearanceSelector } from '../AppearanceSelector';
import { AppTheme } from '../../types/theme';
import { MalUser } from '../../types';
import {
  MusicInstrument,
  MusicSourceType,
  PlaybackState,
  YouTubeTrackInfo,
  LocalAudioTrackInfo,
  MusicAnalysisResult,
  DetectedInstrument,
} from './types';
import { extractYouTubeVideoId } from './utils/youtubeParser';
import { YouTubePlayer } from './components/YouTubePlayer';
import { PerformanceStage } from './components/PerformanceStage';
import { instrumentDetector } from './services/detector';
import { ALL_INSTRUMENTS, getInstrumentDefinition } from './instruments/registry';

interface MusicLabViewProps {
  onReturnToAnime: () => void;
  onSelectMode: (mode: AppMode) => void;
  malUser: MalUser | null;
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
}

export const MusicLabView: React.FC<MusicLabViewProps> = ({
  onReturnToAnime,
  onSelectMode,
  malUser,
  theme = 'light',
  onThemeChange,
}) => {
  // Source State
  const [sourceType, setSourceType] = useState<MusicSourceType>('none');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeTrack, setYoutubeTrack] = useState<YouTubeTrackInfo | null>(null);
  const [showYouTubePlayer, setShowYouTubePlayer] = useState(true);

  // Local audio state
  const [localAudioTrack, setLocalAudioTrack] = useState<LocalAudioTrackInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Playback Clock & State
  const [playback, setPlayback] = useState<PlaybackState>({
    currentTime: 0,
    duration: 0,
    progress: 0,
    isPlaying: false,
  });

  // Instrument Analysis & Ensemble State
  const [analysisResult, setAnalysisResult] = useState<MusicAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeInstruments, setActiveInstruments] = useState<MusicInstrument[]>([]);

  // Local audio time sync effect
  useEffect(() => {
    const audio = audioPlayerRef.current;
    if (!audio || sourceType !== 'local_audio') return;

    const handleTimeUpdate = () => {
      const cur = audio.currentTime;
      const dur = audio.duration || analysisResult?.duration || 1;
      const prog = dur > 0 ? Math.min(1.0, cur / dur) : 0;
      setPlayback((prev) => ({
        ...prev,
        currentTime: cur,
        duration: dur,
        progress: prog,
      }));
    };

    const handlePlay = () => setPlayback((prev) => ({ ...prev, isPlaying: true }));
    const handlePause = () => setPlayback((prev) => ({ ...prev, isPlaying: false }));
    const handleEnded = () => setPlayback((prev) => ({ ...prev, isPlaying: false, isEnded: true }));

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [sourceType, analysisResult]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (localAudioTrack?.objectUrl) {
        URL.revokeObjectURL(localAudioTrack.objectUrl);
      }
    };
  }, [localAudioTrack?.objectUrl]);

  // Calculate which instruments are actively playing at current playback time
  const playingInstruments = useMemo(() => {
    const activeSet = new Set<MusicInstrument>();
    if (!playback.isPlaying || !analysisResult) {
      return activeSet;
    }

    const curTime = playback.currentTime;
    // Find current section
    const currentSection = analysisResult.sections.find(
      (sec) => curTime >= sec.start && curTime <= sec.end
    );

    if (currentSection) {
      currentSection.activeInstruments.forEach((inst) => {
        if (activeInstruments.includes(inst)) {
          activeSet.add(inst);
        }
      });
    } else {
      // Fallback: all active ensemble instruments play if in playback
      activeInstruments.forEach((inst) => activeSet.add(inst));
    }

    return activeSet;
  }, [playback.isPlaying, playback.currentTime, analysisResult, activeInstruments]);

  // Handle YouTube URL submission
  const handleLoadYouTube = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setYoutubeError(null);

    const videoId = extractYouTubeVideoId(youtubeInput);
    if (!videoId) {
      setYoutubeError('Please enter a valid YouTube video URL (e.g. https://www.youtube.com/watch?v=...)');
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    setIsAnalyzing(true);
    setSourceType('youtube');
    setYoutubeTrack({
      videoId,
      url: youtubeInput,
      title: 'YouTube Song',
    });

    try {
      // Detect instruments from title / music cues
      const result = await instrumentDetector.detectFromTitle(youtubeInput, 210);
      setAnalysisResult(result);
      const detected = result.detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);
      setActiveInstruments(detected.length > 0 ? detected : ['piano', 'drums', 'bass', 'electric-guitar']);
      setPlayback({
        currentTime: 0,
        duration: result.duration,
        progress: 0,
        isPlaying: false,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle local audio file selection
  const handleLocalAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setYoutubeError(null);
    const objectUrl = URL.createObjectURL(file);

    setLocalAudioTrack({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'audio/mpeg',
      objectUrl,
    });
    setSourceType('local_audio');
    setIsAnalyzing(true);

    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const result = await instrumentDetector.detectLocalAudio(audioBuffer, file.name);
      setAnalysisResult(result);
      const detected = result.detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);
      setActiveInstruments(detected.length > 0 ? detected : ['piano', 'acoustic-guitar']);

      setPlayback({
        currentTime: 0,
        duration: result.duration,
        progress: 0,
        isPlaying: false,
      });

      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch (err) {
      console.error('Audio decode failure:', err);
      setYoutubeError('Could not decode audio file with Web Audio API. Please try an MP3, WAV, or M4A file.');
      // Fallback detector
      const fallbackResult = await instrumentDetector.detectFromTitle(file.name, 180);
      setAnalysisResult(fallbackResult);
      setActiveInstruments(['piano', 'drums', 'bass']);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Quick Preset Demo Loader
  const handleLoadDemo = async (preset: 'rock' | 'acoustic' | 'orchestral') => {
    setYoutubeError(null);
    setIsAnalyzing(true);
    setSourceType('youtube');

    let title = 'Anime Rock Band';
    let demoVideoId = 'dQw4w9WgXcQ'; // Safe fallback
    if (preset === 'acoustic') {
      title = 'Acoustic Guitar & Piano Recital';
    } else if (preset === 'orchestral') {
      title = 'Symphonic Anime OST';
    }

    setYoutubeTrack({
      videoId: demoVideoId,
      url: `https://www.youtube.com/watch?v=${demoVideoId}`,
      title,
    });

    const result = await instrumentDetector.detectFromTitle(title, 240);
    setAnalysisResult(result);
    const detected = result.detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);
    setActiveInstruments(detected.length > 0 ? detected : ['piano', 'drums', 'electric-guitar']);
    setIsAnalyzing(false);
  };

  // Toggle instrument inclusion on stage
  const handleToggleInstrument = (inst: MusicInstrument) => {
    setActiveInstruments((prev) => {
      if (prev.includes(inst)) {
        return prev.filter((i) => i !== inst);
      } else {
        return [...prev, inst];
      }
    });
  };

  // Reset to initial screen
  const handleResetSource = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setSourceType('none');
    setYoutubeTrack(null);
    if (localAudioTrack?.objectUrl) {
      URL.revokeObjectURL(localAudioTrack.objectUrl);
    }
    setLocalAudioTrack(null);
    setAnalysisResult(null);
    setActiveInstruments([]);
    setPlayback({
      currentTime: 0,
      duration: 0,
      progress: 0,
      isPlaying: false,
    });
    setYoutubeInput('');
    setYoutubeError(null);
  };

  // Theme-aware container styling
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerClasses = isDark
    ? 'bg-[#141318] text-[#F4F2F7]'
    : isSakura
    ? 'bg-[#FDF5F7] text-[#25242A]'
    : 'bg-[#F7F5F2] text-[#25242A]';

  const headerBg = isDark
    ? 'bg-[#1E1D24]/90 border-[#2E2C37]'
    : isSakura
    ? 'bg-white/90 border-[#F2D6DC]'
    : 'bg-white/90 border-[#E7E3DF]';

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-300 ${containerClasses}`}>
      {/* =========================================================================
          MINIMAL HEADER
          ========================================================================= */}
      <header className={`w-full sticky top-0 z-50 backdrop-blur-md border-b px-4 sm:px-8 py-3 ${headerBg} shadow-2xs`}>
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
          {/* Left: Return to Anime Tracker */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="return-to-aniverse-btn"
              onClick={onReturnToAnime}
              title="Return to Anime Tracker"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F0EDFA] dark:bg-[#2A2542] hover:bg-[#E4DEFC] dark:hover:bg-[#342D59] text-[#7567C7] dark:text-[#B9B0F2] transition-all duration-200 cursor-pointer text-xs font-semibold border border-[#7567C7]/20"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
              <span>← AniVerse</span>
              <span className="hidden sm:inline-block text-[11px] opacity-75 font-normal">
                (Anime Tracker)
              </span>
            </button>

            <WorldSwitcher
              currentMode="music"
              onSelectMode={onSelectMode}
            />
          </div>

          {/* Right: Theme & Status Badge */}
          <div className="flex items-center gap-2 sm:gap-3">
            {sourceType !== 'none' && (
              <button
                type="button"
                onClick={handleResetSource}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 border border-[#E7E3DF] dark:border-[#2E2C37]"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">Change Song</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/25 text-[11px] font-bold">
              <span className="text-xs">🎵</span>
              <span className="hidden xs:inline">Music Lab</span>
              <span>Virtual Band</span>
            </div>

            {onThemeChange && (
              <AppearanceSelector
                currentTheme={theme}
                onThemeChange={onThemeChange}
              />
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          MAIN WORKSPACE
          ========================================================================= */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 flex flex-col space-y-6">
        {/* =======================================================================
            SECTION 1: MUSIC SOURCE / INPUT AREA
            ======================================================================= */}
        {sourceType === 'none' ? (
          <div className="w-full max-w-3xl mx-auto bg-white dark:bg-[#1E1D24] rounded-3xl p-6 sm:p-8 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-xl text-center space-y-6">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-[#F0EDFA] dark:bg-[#2A2542] border border-[#7567C7]/30 flex items-center justify-center text-[#7567C7] dark:text-[#B9B0F2] mx-auto mb-3 shadow-xs">
                <Music2 className="h-7 w-7" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#25242A] dark:text-[#F4F2F7]">
                Virtual Band Performance
              </h1>
              <p className="text-xs sm:text-sm text-[#77747D] dark:text-[#9E9AA6] mt-1 max-w-lg mx-auto">
                Paste any song or anime soundtrack. Music Lab detects the instruments and creates a live virtual ensemble playing your music.
              </p>
            </div>

            {/* Input Form */}
            <form onSubmit={handleLoadYouTube} className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => {
                  setYoutubeInput(e.target.value);
                  if (youtubeError) setYoutubeError(null);
                }}
                placeholder="Paste YouTube music video URL..."
                className="flex-1 px-4 py-3 rounded-xl bg-[#F7F5F2] dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs sm:text-sm text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-2 focus:ring-[#7567C7]/50 font-mono"
              />
              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>Create Performance</span>
              </button>
            </form>

            {youtubeError && (
              <div className="text-xs text-red-500 dark:text-red-400 flex items-center justify-center gap-1.5 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{youtubeError}</span>
              </div>
            )}

            {/* Divider */}
            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-[#E7E3DF] dark:border-[#2E2C37] w-full" />
              <span className="bg-white dark:bg-[#1E1D24] px-4 text-[10px] font-bold uppercase tracking-widest text-[#77747D] dark:text-[#9E9AA6]">
                OR LOCAL AUDIO
              </span>
            </div>

            {/* Local Audio Upload */}
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLocalAudioSelect}
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40 text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Upload className="h-4 w-4 text-[#7567C7]" />
                <span>Upload Audio File (MP3 / WAV / M4A)</span>
              </button>
            </div>

            {/* Instant Demo Presets */}
            <div className="pt-2 border-t border-[#E7E3DF] dark:border-[#2E2C37] flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="text-[#77747D] dark:text-[#9E9AA6] text-[11px] font-medium mr-1">
                Try an instant ensemble demo:
              </span>
              <button
                type="button"
                onClick={() => handleLoadDemo('rock')}
                className="px-2.5 py-1 rounded-lg bg-[#F7F5F2] dark:bg-[#26252F] hover:bg-[#7567C7]/15 text-[#25242A] dark:text-[#F4F2F7] font-semibold text-[11px] transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37]"
              >
                🎸 Anime Rock Band
              </button>
              <button
                type="button"
                onClick={() => handleLoadDemo('acoustic')}
                className="px-2.5 py-1 rounded-lg bg-[#F7F5F2] dark:bg-[#26252F] hover:bg-[#7567C7]/15 text-[#25242A] dark:text-[#F4F2F7] font-semibold text-[11px] transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37]"
              >
                🎹 Acoustic Recital
              </button>
              <button
                type="button"
                onClick={() => handleLoadDemo('orchestral')}
                className="px-2.5 py-1 rounded-lg bg-[#F7F5F2] dark:bg-[#26252F] hover:bg-[#7567C7]/15 text-[#25242A] dark:text-[#F4F2F7] font-semibold text-[11px] transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37]"
              >
                🎻 Symphonic Strings
              </button>
            </div>
          </div>
        ) : (
          /* Loaded Track Bar */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#F0EDFA] dark:bg-[#2A2542] text-[#7567C7] dark:text-[#B9B0F2] shrink-0">
                {sourceType === 'youtube' ? <Youtube className="h-5 w-5" /> : <FileAudio className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <span className="px-2 py-0.5 rounded-md bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A294EE] text-[10px] font-bold uppercase tracking-wider border border-[#7567C7]/20">
                  {sourceType === 'youtube' ? 'YouTube Stream' : 'Local Audio'}
                </span>
                <h2 className="text-sm sm:text-base font-bold text-[#25242A] dark:text-[#F4F2F7] truncate mt-0.5">
                  {sourceType === 'youtube'
                    ? youtubeTrack?.title || 'YouTube Track'
                    : localAudioTrack?.fileName || 'Local Audio File'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {sourceType === 'youtube' && (
                <button
                  type="button"
                  onClick={() => setShowYouTubePlayer((prev) => !prev)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 border border-[#E7E3DF] dark:border-[#2E2C37]"
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>{showYouTubePlayer ? 'Dock Video' : 'Expand Video'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetSource}
                className="px-3 py-1.5 rounded-xl bg-[#7567C7] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Change Song
              </button>
            </div>
          </div>
        )}

        {/* =======================================================================
            SECTION 2: PERFORMANCE STAGE (CENTERPIECE)
            ======================================================================= */}
        <div className="w-full">
          <PerformanceStage
            activeInstruments={activeInstruments}
            playingInstruments={playingInstruments}
            theme={theme}
            isPlaying={playback.isPlaying}
          />
        </div>

        {/* =======================================================================
            SECTION 3: DETECTED INSTRUMENTS & PERFORMER ROSTER
            ======================================================================= */}
        {sourceType !== 'none' && (
          <div className="bg-white dark:bg-[#1E1D24] rounded-3xl p-5 sm:p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E3DF] dark:border-[#2E2C37] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
                  <span>Detected Instruments & Performers</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A294EE] text-[11px] font-bold">
                    {activeInstruments.length} on Stage
                  </span>
                </h3>
                <p className="text-xs text-[#77747D] dark:text-[#9E9AA6] mt-0.5">
                  Musicians visibly perform their instruments when detected in the song timeline. Click any instrument to toggle them on or off the stage.
                </p>
              </div>

              <div className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
                Analysis Source: <span className="font-semibold text-[#7567C7]">{analysisResult?.analysisSource === 'local_web_audio' ? 'Web Audio Spectrum' : 'Musical Metadata'}</span>
              </div>
            </div>

            {/* Instrument Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {ALL_INSTRUMENTS.map((inst) => {
                const def = getInstrumentDefinition(inst);
                const isSelected = activeInstruments.includes(inst);
                const isCurrentlyPlaying = playingInstruments.has(inst);

                return (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => handleToggleInstrument(inst)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                      isSelected
                        ? isCurrentlyPlaying
                          ? 'bg-[#F0EDFA] dark:bg-[#2A2542] border-[#7567C7] shadow-xs'
                          : 'bg-white dark:bg-[#1E1D24] border-[#7567C7]/50'
                        : 'bg-[#F7F5F2]/60 dark:bg-[#26252F]/40 border-[#E7E3DF] dark:border-[#2E2C37] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between w-full">
                      <span className="text-xl">{def.icon}</span>
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                          isSelected ? 'bg-[#7567C7] text-white' : 'bg-black/10 dark:bg-white/10 text-transparent'
                        }`}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] truncate">
                        {def.performerTitle}
                      </div>
                      <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] truncate">
                        {def.name}
                      </div>
                    </div>

                    <div className="pt-1 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px]">
                      <span
                        className={`font-semibold ${
                          isSelected
                            ? isCurrentlyPlaying
                              ? 'text-[#7567C7] dark:text-[#A294EE]'
                              : 'text-[#77747D]'
                            : 'text-[#9E9AA6]'
                        }`}
                      >
                        {isSelected ? (isCurrentlyPlaying ? 'Playing ♪' : 'Resting') : 'Off Stage'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* =======================================================================
            SECTION 4: PLAYBACK & MEDIA CONTROLLER
            ======================================================================= */}
        {sourceType !== 'none' && (
          <div className="bg-white dark:bg-[#1E1D24] rounded-3xl p-5 sm:p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-sm space-y-4">
            {/* If YouTube: Official Player (respecting policies, with official controls) */}
            {sourceType === 'youtube' && youtubeTrack && (
              <div className={showYouTubePlayer ? 'block' : 'hidden'}>
                <div className="max-w-xl mx-auto mb-3">
                  <YouTubePlayer
                    videoId={youtubeTrack.videoId}
                    onPlaybackUpdate={(st) => setPlayback(st)}
                    onVideoLoaded={(title, dur) => {
                      if (title && youtubeTrack) {
                        setYoutubeTrack((prev) => (prev ? { ...prev, title } : null));
                      }
                      if (dur) {
                        setPlayback((prev) => ({ ...prev, duration: dur }));
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* If Local Audio: Native HTML5 Audio Controller */}
            {sourceType === 'local_audio' && localAudioTrack && (
              <div className="max-w-xl mx-auto space-y-3">
                <audio ref={audioPlayerRef} src={localAudioTrack.objectUrl} preload="auto" />

                {/* Timeline Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={playback.duration || 100}
                    value={playback.currentTime}
                    onChange={(e) => {
                      const targetTime = parseFloat(e.target.value);
                      if (audioPlayerRef.current) {
                        audioPlayerRef.current.currentTime = targetTime;
                      }
                      setPlayback((prev) => ({
                        ...prev,
                        currentTime: targetTime,
                        progress: prev.duration > 0 ? targetTime / prev.duration : 0,
                      }));
                    }}
                    className="w-full accent-[#7567C7] cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-xs font-mono text-[#77747D] dark:text-[#9E9AA6]">
                    <span>
                      {Math.floor(playback.currentTime / 60)}:{(Math.floor(playback.currentTime % 60)).toString().padStart(2, '0')}
                    </span>
                    <span>
                      {Math.floor(playback.duration / 60)}:{(Math.floor(playback.duration % 60)).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>

                {/* Play / Pause Buttons */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (audioPlayerRef.current) {
                        if (playback.isPlaying) {
                          audioPlayerRef.current.pause();
                        } else {
                          audioPlayerRef.current.play();
                        }
                      }
                    }}
                    className="px-6 py-2.5 rounded-2xl bg-[#7567C7] hover:bg-[#6455B8] text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95"
                  >
                    {playback.isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />}
                    <span>{playback.isPlaying ? 'Pause Performance' : 'Play Performance'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Playback Clock Summary */}
            <div className="pt-2 border-t border-[#E7E3DF] dark:border-[#2E2C37] flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#77747D] dark:text-[#9E9AA6] gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#25242A] dark:text-[#F4F2F7]">Timeline Clock:</span>
                <span className="font-mono text-[#7567C7] font-bold">
                  {Math.floor(playback.currentTime / 60)}:{(Math.floor(playback.currentTime % 60)).toString().padStart(2, '0')} /{' '}
                  {Math.floor(playback.duration / 60)}:{(Math.floor(playback.duration % 60)).toString().padStart(2, '0')}
                </span>
                <span>({Math.round(playback.progress * 100)}%)</span>
              </div>

              <div>
                <span>Active Performers: </span>
                <span className="font-bold text-[#7567C7]">
                  {playingInstruments.size} / {activeInstruments.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MusicLabView;
