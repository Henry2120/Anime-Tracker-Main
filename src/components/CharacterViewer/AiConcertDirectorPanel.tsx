import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  Square,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Users,
  Youtube,
  Music2,
  Mic,
  Clock,
} from 'lucide-react';
import {
  AiConcertPerformancePlan,
  formatConcertTimestamp,
} from './aiConcertPlanner';
import {
  PRESET_CONCERT_TRACKS,
  SharedAiAnalysisStatus,
  extractYouTubeVideoId,
} from './ConcertMusicContext';
import { StagedPerformerRecord } from './performanceOrchestrator';
import { YamnetTargetInstrumentName } from '../../utils/yamnetLabelMap';

interface AiConcertDirectorPanelProps {
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  isPaused: boolean;
  playbackTimeSec: number;
  aiStatus: SharedAiAnalysisStatus;
  aiError: string | null;
  aiIsAnalyzing: boolean;
  aiProgressMessage: string | null;
  aiPlan: AiConcertPerformancePlan | null;
  stagedPerformers: StagedPerformerRecord[];
  loadedCharactersCount: number;
  activeInstruments: YamnetTargetInstrumentName[];
  activeVocals: boolean;
  isExpanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  onAnalyzeTrack: (urlOrId?: string, options?: { forceRefresh?: boolean }) => Promise<any>;
  onPrepareCast: () => void;
  onPlayConcert: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onSeekTo: (seconds: number) => void;
  onClearStage: () => void;
}

export const AiConcertDirectorPanel: React.FC<AiConcertDirectorPanelProps> = ({
  videoId,
  videoTitle,
  isPlaying,
  isPaused,
  playbackTimeSec,
  aiStatus,
  aiError,
  aiIsAnalyzing,
  aiProgressMessage,
  aiPlan,
  stagedPerformers,
  loadedCharactersCount,
  activeInstruments,
  activeVocals,
  isExpanded,
  onToggleExpanded,
  onAnalyzeTrack,
  onPrepareCast,
  onPlayConcert,
  onTogglePlay,
  onStop,
  onSeekTo,
  onClearStage,
}) => {
  const [trackInput, setTrackInput] = useState<string>(videoId);
  const [showTimelinePreview, setShowTimelinePreview] = useState<boolean>(false);

  useEffect(() => {
    setTrackInput(videoId);
  }, [videoId]);

  const isPlanReady = Boolean(aiPlan && aiPlan.isComplete && aiStatus === 'ready');
  const duration = aiPlan?.duration && aiPlan.duration > 0 ? aiPlan.duration : 0;
  const clampedTime = duration > 0 ? Math.min(duration, Math.max(0, playbackTimeSec)) : Math.max(0, playbackTimeSec);

  const stageStepLabel = isAiAnalyzingLabel(aiIsAnalyzing, aiStatus, isPlanReady, loadedCharactersCount, isPlaying);

  const stagedByKey = new Map<string, StagedPerformerRecord>();
  for (const p of stagedPerformers) {
    stagedByKey.set(p.key, p);
  }

  const allRosterLoaded =
    isPlanReady &&
    aiPlan!.roster.length > 0 &&
    aiPlan!.roster.every((entry) => {
      const rec = stagedByKey.get(entry.key);
      return rec && rec.instanceId && rec.lifecycle !== 'loading' && rec.lifecycle !== 'error';
    });

  const playingCount = stagedPerformers.filter((p) => p.lifecycle === 'playing').length;

  const handleAnalyzeSubmit = () => {
    const trimmed = trackInput.trim();
    const target = extractYouTubeVideoId(trimmed) || trimmed || videoId;
    onAnalyzeTrack(target, { forceRefresh: false });
  };

  // Stage D Compact Floating HUD when collapsed and performers or complete plan are active
  if (!isExpanded) {
    return (
      <div className="absolute top-3 left-3 z-20 w-[min(92vw,420px)] rounded-2xl bg-white/92 dark:bg-[#14121C]/92 backdrop-blur-xl border border-black/10 dark:border-white/15 shadow-xl px-3.5 py-2.5 text-[#25242A] dark:text-[#F4F2F7]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#7567C7] dark:text-[#A898F8]">
              AI Concert Director · {stageStepLabel}
            </div>
            <div className="text-xs font-bold truncate">
              {aiPlan?.title || videoTitle || videoId}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPlanReady && (
              <>
                <button
                  type="button"
                  onClick={isPlaying || isPaused ? onTogglePlay : onPlayConcert}
                  className="px-2.5 py-1 rounded-lg bg-[#7567C7] hover:bg-[#6556B8] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3 w-3 fill-white" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 fill-white" />
                      <span>Play</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:text-red-500 text-[#77747D] dark:text-[#A4A1AA] cursor-pointer"
                  title="Stop concert playback"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onToggleExpanded(true)}
              className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Setup</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Live Seek Scrubber & Active Instrumentation */}
        {isPlanReady && duration > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tabular-nums text-[#77747D] dark:text-[#A4A1AA] w-9">
                {formatConcertTimestamp(clampedTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.round(duration))}
                step={0.5}
                value={clampedTime}
                onChange={(e) => onSeekTo(Number(e.target.value))}
                aria-label="Seek concert playback timeline"
                className="flex-1 h-1.5 accent-[#7567C7] cursor-pointer"
              />
              <span className="text-[10px] font-mono tabular-nums text-[#77747D] dark:text-[#A4A1AA] w-9 text-right">
                {formatConcertTimestamp(duration)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#77747D] dark:text-[#A4A1AA] tabular-nums">
              <span className="truncate">
                {activeInstruments.length > 0
                  ? `Playing: ${activeInstruments.join(', ')}`
                  : isPlaying
                  ? 'Musical rest / interlude'
                  : `${loadedCharactersCount} cast staged`}
                {activeVocals ? ' · Vocals active' : ''}
              </span>
              <span className="shrink-0 font-mono">
                {playingCount}/{loadedCharactersCount} active
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded Stages A -> B -> C -> D Director Panel
  return (
    <div className="absolute top-3 left-3 z-20 w-[min(94vw,470px)] max-h-[calc(100%-5.5rem)] flex flex-col rounded-2xl bg-white/95 dark:bg-[#14121C]/95 backdrop-blur-xl border border-black/10 dark:border-white/15 shadow-2xl text-[#25242A] dark:text-[#F4F2F7] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/8 dark:border-white/10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#7567C7] dark:text-[#A898F8]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Full-Track Concert Director</span>
          </div>
          <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] truncate">
            Pre-analyzes the entire song before playback and coordinates the full 3D cast.
          </p>
        </div>

        {(isPlanReady || loadedCharactersCount > 0) && (
          <button
            type="button"
            onClick={() => onToggleExpanded(false)}
            className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
            title="Minimize to stage HUD"
          >
            <span>Stage HUD</span>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Scrollable Workflow Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* STAGE A — VIDEO SELECTION */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA]">
            <span>Stage A · Video Selection</span>
            <span className="font-mono text-[10px] tabular-nums">ID: {videoId}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Youtube className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              <input
                type="text"
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !aiIsAnalyzing) {
                    handleAnalyzeSubmit();
                  }
                }}
                placeholder="Paste YouTube URL or 11-char ID..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleAnalyzeSubmit}
              disabled={aiIsAnalyzing || !trackInput.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-45 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap transition-colors"
            >
              {aiIsAnalyzing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Analyze</span>
                </>
              )}
            </button>
          </div>

          {/* Preset Quick Select */}
          <div className="flex items-center gap-2 text-[11px]">
            <label htmlFor="ai-concert-preset-select" className="text-[#77747D] dark:text-[#A4A1AA] shrink-0">
              Preset:
            </label>
            <select
              id="ai-concert-preset-select"
              value={PRESET_CONCERT_TRACKS.some((t) => t.id === trackInput) ? trackInput : ''}
              onChange={(e) => {
                if (e.target.value) {
                  setTrackInput(e.target.value);
                }
              }}
              className="flex-1 min-w-0 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:border-[#7567C7]"
            >
              <option value="">Choose a concert track...</option>
              {PRESET_CONCERT_TRACKS.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title} — {track.artist}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* STAGE B — AI ANALYSIS STATUS & TIMELINE */}
        <section className="pt-3 border-t border-black/8 dark:border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA]">
            <span>Stage B · AI Full-Track Analysis</span>
            {aiPlan && (
              <button
                type="button"
                onClick={() => onAnalyzeTrack(videoId, { forceRefresh: true })}
                disabled={aiIsAnalyzing}
                className="text-[11px] font-semibold text-[#7567C7] dark:text-[#A898F8] hover:underline disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                Re-Analyze
              </button>
            )}
          </div>

          {aiIsAnalyzing && (
            <div className="p-3 rounded-xl bg-[#7567C7]/10 border border-[#7567C7]/25 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#7567C7] dark:text-[#A898F8]">
                <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                <span>Analyzing Full Audio Track...</span>
              </div>
              <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                {aiProgressMessage ||
                  'Gemini is scanning windowed audio across the entire song to build the performance timeline.'}
              </p>
            </div>
          )}

          {!aiIsAnalyzing && (aiStatus === 'error' || aiStatus === 'incomplete') && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2 text-xs">
              <div className="flex items-start gap-2 text-red-600 dark:text-red-300 font-bold">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {aiStatus === 'incomplete'
                    ? 'Incomplete Track Analysis — Concert Blocked'
                    : 'AI Analysis Failed'}
                </span>
              </div>
              <p className="text-[11px] text-red-700/90 dark:text-red-200/90 leading-relaxed">
                {aiError || 'Full track coverage could not be verified.'}
              </p>
              {aiPlan && aiPlan.missingRanges.length > 0 && (
                <div className="text-[10.5px] font-mono tabular-nums text-red-700 dark:text-red-200">
                  Missing intervals:{' '}
                  {aiPlan.missingRanges
                    .map((r) => `${formatConcertTimestamp(r.start)}–${formatConcertTimestamp(r.end)}`)
                    .join(', ')}
                </div>
              )}
              <button
                type="button"
                onClick={() => onAnalyzeTrack(videoId, { forceRefresh: true })}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
              >
                Retry Full Analysis
              </button>
            </div>
          )}

          {!aiIsAnalyzing && (aiStatus === 'unavailable' || aiStatus === 'idle') && !aiPlan && (
            <div className="p-3 rounded-xl bg-black/4 dark:bg-white/4 border border-black/8 dark:border-white/8 text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
              No complete AI Full-Track Performance Plan cached for this video yet. Click{' '}
              <strong className="text-[#25242A] dark:text-white">Analyze</strong> above to inspect the full song.
            </div>
          )}

          {!aiIsAnalyzing && aiStatus === 'loading' && !aiPlan && (
            <div className="p-3 rounded-xl bg-black/4 dark:bg-white/4 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Checking cached performance plans...</span>
            </div>
          )}

          {isPlanReady && aiPlan && (
            <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/25 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{aiPlan.title}</span>
                  </div>
                  <div className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] font-mono tabular-nums mt-0.5">
                    {formatConcertTimestamp(aiPlan.duration)} · {aiPlan.coveragePercentage}% coverage ·{' '}
                    {aiPlan.successfulWindows}/{aiPlan.totalWindows} windows
                    {aiPlan.fromCache ? ' · Cached' : ''}
                  </div>
                </div>
              </div>

              {/* Instrument Summary */}
              <div className="text-[11px] text-[#25242A] dark:text-[#E2E8F0] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Music2 className="h-3.5 w-3.5 text-[#7567C7]" />
                    <span>
                      {aiPlan.roster.length} Stage Performer{aiPlan.roster.length !== 1 ? 's' : ''} ·{' '}
                      {aiPlan.segments.length} Timeline Segment{aiPlan.segments.length !== 1 ? 's' : ''}
                    </span>
                  </span>
                  {aiPlan.segments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTimelinePreview((v) => !v)}
                      className="text-[11px] font-semibold text-[#7567C7] dark:text-[#A898F8] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      {showTimelinePreview ? 'Hide Timeline' : 'View Timeline'}
                    </button>
                  )}
                </div>

                {aiPlan.vocalsDetected && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                    <Mic className="h-3 w-3 shrink-0" />
                    <span>
                      Vocals active ({aiPlan.vocalSegmentsCount} segments · independent, no vocalist model)
                    </span>
                  </div>
                )}

                {aiPlan.unmappedInstruments.length > 0 && (
                  <div className="text-[10.5px] text-amber-700 dark:text-amber-300">
                    Unmapped instruments (no 3D performer rig): {aiPlan.unmappedInstruments.join(', ')}
                  </div>
                )}
              </div>

              {/* Collapsible Timestamped Timeline Preview */}
              {showTimelinePreview && (
                <div className="pt-2 border-t border-black/8 dark:border-white/10 max-h-36 overflow-y-auto space-y-1 text-[10.5px] font-mono tabular-nums">
                  {aiPlan.segments.slice(0, 80).map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => onSeekTo(seg.startTime)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-left cursor-pointer"
                      title="Jump playback to this segment"
                    >
                      <span className="truncate font-sans font-medium">
                        {seg.instrumentName}
                      </span>
                      <span className="shrink-0 text-[#77747D] dark:text-[#A4A1AA]">
                        {formatConcertTimestamp(seg.startTime)}–{formatConcertTimestamp(seg.endTime)}
                      </span>
                    </button>
                  ))}
                  {aiPlan.segments.length > 80 && (
                    <div className="text-[10px] text-[#77747D] px-2">
                      Showing first 80 of {aiPlan.segments.length} timeline segments
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* STAGE C — COMPLETE PERFORMANCE ROSTER & PREPARATION */}
        {isPlanReady && aiPlan && (
          <section className="pt-3 border-t border-black/8 dark:border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA]">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[#7567C7]" />
                <span>Stage C · Complete Cast ({aiPlan.roster.length})</span>
              </span>
              {loadedCharactersCount > 0 && (
                <button
                  type="button"
                  onClick={onClearStage}
                  className="text-[11px] font-semibold text-red-500 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Clear Stage
                </button>
              )}
            </div>

            {aiPlan.roster.length === 0 ? (
              <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                No assignable 3D instruments were found in this track.
                {aiPlan.vocalsDetected
                  ? ' Only vocals were detected (Vocals stays independent without spawning a performer).'
                  : ''}
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
                {aiPlan.roster.map((entry) => {
                  const staged = stagedByKey.get(entry.key);
                  const stateLabel = staged
                    ? staged.lifecycle === 'playing'
                      ? 'Playing'
                      : staged.lifecycle === 'loading'
                      ? 'Loading'
                      : staged.lifecycle === 'error'
                      ? 'Error'
                      : 'Staged Idle'
                    : 'Queued';

                  return (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/4 dark:bg-white/5 border border-black/6 dark:border-white/8 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="font-bold truncate text-[#25242A] dark:text-white">
                          {entry.mapping.characterName}
                        </div>
                        <div className="text-[10px] text-[#77747D] dark:text-[#A4A1AA] tabular-nums truncate">
                          {entry.instrumentName} · Entry {formatConcertTimestamp(entry.firstStartTime)} ·{' '}
                          {entry.mapping.playingClip}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold shrink-0 ${
                          staged?.lifecycle === 'playing'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : staged?.lifecycle === 'loading'
                            ? 'text-[#7567C7] dark:text-[#A898F8]'
                            : staged?.lifecycle === 'error'
                            ? 'text-red-500'
                            : staged
                            ? 'text-[#25242A] dark:text-white'
                            : 'text-[#77747D] dark:text-[#A4A1AA]'
                        }`}
                      >
                        {stateLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Preparation & Concert Launch Actions */}
            {aiPlan.roster.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!allRosterLoaded && (
                  <button
                    type="button"
                    onClick={onPrepareCast}
                    className="px-3 py-1.5 rounded-xl bg-black/6 dark:bg-white/10 hover:bg-black/12 dark:hover:bg-white/15 text-[#25242A] dark:text-white text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
                  >
                    Prepare Cast ({aiPlan.roster.length})
                  </button>
                )}

                <button
                  type="button"
                  onClick={isPlaying ? onTogglePlay : onPlayConcert}
                  className="flex-1 px-3.5 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5 fill-white" />
                      <span>Pause Concert</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-white" />
                      <span>Play Concert</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* STAGE D — LIVE PLAYBACK SCRUBBER */}
        {isPlanReady && duration > 0 && (
          <section className="pt-3 border-t border-black/8 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#A4A1AA]">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-500" />
                <span>Stage D · Concert Playback</span>
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-[#25242A] dark:text-white">
                {formatConcertTimestamp(clampedTime)} / {formatConcertTimestamp(duration)}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              step={0.5}
              value={clampedTime}
              onChange={(e) => onSeekTo(Number(e.target.value))}
              aria-label="Concert playback timeline"
              className="w-full h-1.5 accent-[#7567C7] cursor-pointer"
            />
          </section>
        )}
      </div>
    </div>
  );
};

function isAiAnalyzingLabel(
  aiIsAnalyzing: boolean,
  aiStatus: SharedAiAnalysisStatus,
  isPlanReady: boolean,
  loadedCharactersCount: number,
  isPlaying: boolean
): string {
  if (aiIsAnalyzing) return 'Stage B · Analyzing';
  if (aiStatus === 'incomplete') return 'Stage B · Incomplete';
  if (aiStatus === 'error') return 'Stage B · Error';
  if (!isPlanReady) return 'Stage A · Select Video';
  if (isPlaying || loadedCharactersCount > 0) return 'Stage D · Live Performance';
  return 'Stage C · Ready';
}
