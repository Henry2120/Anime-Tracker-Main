import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Bug,
  ChevronDown,
  ChevronRight,
  Play,
  Film,
  Activity,
  Cpu,
} from 'lucide-react';
import { LoadedCharacterInstance, ViewerCameraPreset, ViewerEnvironment } from './types';
import {
  DetectionSourceMode,
  PerformanceMode,
  StagedPerformerRecord,
} from './performanceOrchestrator';

export interface SceneDebuggerData {
  // Stage & Backdrop
  environment: ViewerEnvironment;
  activeSceneName: string;
  sceneStatus: 'READY' | 'LOADING' | 'ERROR';
  backgroundMode: string;
  activeBackgroundColor: string;

  // Performance Orchestrator & Detection Sync
  performanceMode: PerformanceMode;
  detectionSource: DetectionSourceMode;
  gracePeriodMs: number;
  yamnetStatus: string;
  yamnetUsingWorker: boolean;
  yamnetSegmentsCount: number;
  aiStatus: string;
  aiSegmentsCount: number;
  aiTitle?: string | null;
  activeInstruments: string[];
  activeVocals: boolean;
  stagedPerformers: StagedPerformerRecord[];

  // Performance & Cache Metrics
  fps: number;
  frameTimeMs: number;
  cacheStats: {
    cachedAssetCount: number;
    pendingDownloadCount: number;
    cacheHits: number;
    cacheMisses: number;
  };

  // Performers & Models
  loadedCharacters: LoadedCharacterInstance[];
  selectedInstanceId: string | null;
  loading: boolean;
  loadingProgress: number;
  loadingCharacterName?: string;

  // Music & YouTube
  videoId: string | null;
  videoTitle: string;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  playbackTimeSec: number;

  // Camera & Visual Systems
  cameraPreset: ViewerCameraPreset;
  showGrid: boolean;
  showWireframe: boolean;

  // Errors / Warnings
  runtimeErrors?: { timestamp: string; subsystem: string; message: string }[];
  onClearErrors?: () => void;
}

interface SceneDebuggerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: SceneDebuggerData;
  onSelectAnimation?: (instanceId: string, animationName: string) => void;
}

export const SceneDebuggerPanel: React.FC<SceneDebuggerPanelProps> = ({
  isOpen,
  onClose,
  data,
  onSelectAnimation,
}) => {
  const [copiedFormat, setCopiedFormat] = useState<'text' | 'json' | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModelDiagnostics, setShowModelDiagnostics] = useState(false);

  const handleCopyDiagnostics = (format: 'text' | 'json') => {
    const timestamp = new Date().toISOString();

    const snapshot = {
      timestamp,
      stage: {
        activeSceneName: data.activeSceneName,
        status: data.sceneStatus,
        environment: data.environment,
        backgroundMode: data.backgroundMode,
        activeBackgroundColor: data.activeBackgroundColor,
        fps: data.fps,
        frameTimeMs: data.frameTimeMs,
      },
      audioPerformanceSync: {
        mode: data.performanceMode,
        detectionSource: data.detectionSource,
        antiFlickerHoldMs: data.gracePeriodMs,
        yamnetStatus: data.yamnetStatus,
        executionEngine: data.yamnetUsingWorker ? 'Web Worker' : 'Main Thread',
        yamnetSegmentsCount: data.yamnetSegmentsCount,
        aiStatus: data.aiStatus,
        aiSegmentsCount: data.aiSegmentsCount,
        activeInstruments: data.activeInstruments,
        activeVocals: data.activeVocals,
        stagedPerformers: data.stagedPerformers.map((p) => ({
          characterName: p.characterName,
          instrument: p.instrumentName,
          origin: p.origin,
          stagePresence: p.lifecycle === 'error' ? 'error' : 'persistent',
          animationState: p.lifecycle,
          activeSource: p.activeSource ?? null,
        })),
      },
      cache: data.cacheStats,
      roster: {
        totalPerformers: data.loadedCharacters.length,
        selectedInstanceId: data.selectedInstanceId,
        performers: data.loadedCharacters.map((c) => ({
          name: c.manifestEntry.name,
          currentAnimation: c.currentAnimationName,
          isPlayingAnimation: c.isPlayingAnimation,
          missingClipWarning: c.missingClipWarning || null,
        })),
      },
      music: {
        videoId: data.videoId || 'None',
        videoTitle: data.videoTitle || 'N/A',
        isPlaying: data.isPlaying,
        playbackTimeSec: data.playbackTimeSec,
      },
    };

    const copyText =
      format === 'json'
        ? JSON.stringify(snapshot, null, 2)
        : `=== 3D VIEWER PERFORMANCE DEBUGGER ===
Timestamp: ${timestamp}
Backdrop: ${data.activeSceneName} (${data.sceneStatus})
FPS / Frame Time: ${data.fps} FPS (${data.frameTimeMs.toFixed(1)} ms)
Mode: ${data.performanceMode.toUpperCase()} | Source: ${data.detectionSource.toUpperCase()} | Hold: ${data.gracePeriodMs} ms
YAMNet Engine: ${data.yamnetUsingWorker ? 'Web Worker' : 'Main Thread'} | Status: ${data.yamnetStatus} | Segments: ${data.yamnetSegmentsCount}
AI Full-Track: ${data.aiStatus} | Segments: ${data.aiSegmentsCount}
Active Instruments: ${data.activeInstruments.length > 0 ? data.activeInstruments.join(', ') : 'None'}
Vocals Active (No Character): ${data.activeVocals ? 'Yes' : 'No'}
Loaded Performers: ${data.loadedCharacters.length}
GLB Cache: ${data.cacheStats.cachedAssetCount} cached (${data.cacheStats.cacheHits} hits / ${data.cacheStats.cacheMisses} misses / ${data.cacheStats.pendingDownloadCount} in-flight)
========================================`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(copyText).then(
        () => {
          setCopiedFormat(format);
          setTimeout(() => setCopiedFormat(null), 2000);
        },
        () => {
          console.warn('[Debugger] Clipboard write failed');
        }
      );
    }
  };

  if (!isOpen) return null;

  const playingCount = data.stagedPerformers.filter((p) => p.lifecycle === 'playing').length;

  return (
    <div className="absolute top-4 right-4 z-40 w-[95vw] sm:w-[420px] max-h-[85vh] flex flex-col rounded-2xl bg-[#090D16]/95 border border-white/10 text-[#E2E8F0] shadow-2xl backdrop-blur-xl font-mono text-xs overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 select-text">
      {/* Console Header */}
      <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2.5 bg-[#0D1322]">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Bug className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="font-bold text-xs tracking-wider flex items-center gap-1.5 text-white">
              <span>PERFORMANCE DEBUGGER</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white/10 text-cyan-300 border border-white/15 uppercase">
                {data.performanceMode}
              </span>
            </h3>
            <p className="text-[10px] text-[#94A3B8]">
              {data.activeSceneName} • {data.fps} FPS ({data.frameTimeMs.toFixed(1)} ms)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopyDiagnostics('text')}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10.5px] font-semibold text-[#94A3B8] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
            title="Copy diagnostics summary"
          >
            {copiedFormat === 'text' ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white transition-colors cursor-pointer ml-1"
            title="Close Debugger (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* Audio Sync & Stage Metrics */}
        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-white/10">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>Performance & Detection Sync</span>
            </span>
            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded bg-white/10 text-cyan-300 border border-white/10 uppercase">
              {data.detectionSource === 'ai_full_track'
                ? `AI:${data.aiStatus}`
                : data.yamnetStatus}
            </span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">Staging / Persistence:</span>
              <span className="font-bold text-white uppercase">
                {data.performanceMode} • Persistent (Hold {(data.gracePeriodMs / 1000).toFixed(1)}s)
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">Detection Source:</span>
              <span className="font-bold text-emerald-300 uppercase">
                {data.detectionSource === 'ai_full_track'
                  ? 'AI Full-Track'
                  : 'Live YAMNet'}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">YAMNet Segments / Engine:</span>
              <span className="font-mono text-cyan-300">
                {data.yamnetSegmentsCount} segs • {data.yamnetUsingWorker ? 'Worker' : 'Main'}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">AI Full-Track Cache:</span>
              <span className="font-mono text-indigo-300">
                {data.aiStatus.toUpperCase()} ({data.aiSegmentsCount} segs)
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">Playback Cursor:</span>
              <span className="font-mono text-white">
                {data.playbackTimeSec.toFixed(2)}s ({data.isPlaying ? 'PLAY' : data.isPaused ? 'PAUSE' : 'STOP'})
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">Active Instruments:</span>
              <span className="font-bold text-emerald-300 truncate max-w-[200px]">
                {data.activeInstruments.length > 0 ? data.activeInstruments.join(', ') : 'None'}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-[#94A3B8]">Vocals (Independent):</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  data.activeVocals
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-white/5 text-[#94A3B8] border border-white/10'
                }`}
              >
                {data.activeVocals ? 'ACTIVE (No Model Spawned)' : 'Inactive'}
              </span>
            </div>
          </div>

          {data.stagedPerformers.length > 0 && (
            <div className="pt-1.5 border-t border-white/10 space-y-1">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8]">
                Persistent Stage Roster ({data.stagedPerformers.length}):
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {data.stagedPerformers.map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between text-[10px] bg-black/30 px-2 py-1 rounded border border-white/5"
                  >
                    <span className="truncate max-w-[160px] text-white font-semibold">
                      {p.characterName}
                      {p.instrumentName ? ` • ${p.instrumentName}` : ''}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {p.activeSource && (
                        <span className="px-1 rounded bg-white/10 text-cyan-300 uppercase text-[9px]">
                          {p.activeSource === 'ai_full_track' ? 'AI' : 'Y'}
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                          p.lifecycle === 'playing'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : p.lifecycle === 'grace_waiting'
                            ? 'bg-amber-500/20 text-amber-300'
                            : p.lifecycle === 'error'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-white/10 text-[#CBD5E1]'
                        }`}
                      >
                        {p.lifecycle === 'grace_waiting' ? 'HOLD' : p.lifecycle}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Performance & Cache Metrics */}
        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between pb-1 border-b border-white/10">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              <span>Performance & GLB Cache</span>
            </span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-[#94A3B8]">Render Speed:</span>
            <span className="font-mono text-white">
              {data.fps} FPS • {data.frameTimeMs.toFixed(1)} ms/frame
            </span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-[#94A3B8]">Models / Mixers / Playing:</span>
            <span className="font-mono text-white">
              {data.loadedCharacters.length} loaded / {data.loadedCharacters.filter((c) => c.isPlayingAnimation).length} active / {playingCount} playing inst.
            </span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-[#94A3B8]">GLB Cache Hits / Misses:</span>
            <span className="font-mono text-emerald-300">
              {data.cacheStats.cacheHits} hits / {data.cacheStats.cacheMisses} misses ({data.cacheStats.cachedAssetCount} cached, {data.cacheStats.pendingDownloadCount} loading)
            </span>
          </div>
        </div>

        {/* Model & Animation Diagnostics */}
        {data.loadedCharacters.length > 0 && (
          <div className="border border-white/10 rounded-xl bg-black/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowModelDiagnostics((prev) => !prev)}
              className="w-full px-3 py-2 flex items-center justify-between text-left text-[10.5px] font-bold text-cyan-400 hover:text-white transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-cyan-400" />
                <span>Model & Animation Diagnostics</span>
              </span>
              {showModelDiagnostics ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>

            {showModelDiagnostics && (
              <div className="px-3 pb-3 pt-1 space-y-2.5 text-[10.5px] border-t border-white/5">
                {(() => {
                  const targetChar =
                    data.loadedCharacters.find((c) => c.id === data.selectedInstanceId) ||
                    data.loadedCharacters[0];
                  if (!targetChar) return null;

                  const switchDiagnostics = targetChar.visibilityController?.getDiagnostics() || {};
                  const switchEntries = Object.entries(switchDiagnostics);
                  const switchIds = targetChar.visibilityController?.getSwitchIds() || [];

                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                        <span className="text-[#94A3B8]">Selected Character:</span>
                        <span className="font-bold text-white truncate max-w-[170px]">
                          {targetChar.manifestEntry.name}
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                        <span className="text-[#94A3B8]">Mesh / Vertex Count:</span>
                        <span className="font-mono text-white">
                          {targetChar.meshCount} meshes / {targetChar.vertexCount.toLocaleString()} verts
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                        <span className="text-[#94A3B8]">Active Animation:</span>
                        <span className="font-bold text-emerald-400">
                          {targetChar.currentAnimationName || 'None'}
                        </span>
                      </div>

                      {targetChar.missingClipWarning && (
                        <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] break-words">
                          {targetChar.missingClipWarning}
                        </div>
                      )}

                      <div className="flex justify-between items-center py-0.5 border-b border-white/5">
                        <span className="text-[#94A3B8]">Mixer & Action State:</span>
                        <span className="font-mono text-cyan-300">
                          {targetChar.isPlayingAnimation ? 'PLAYING (LoopRepeat)' : 'PAUSED'}
                        </span>
                      </div>

                      {/* Switch & Visibility Metadata Status */}
                      <div className="space-y-1 pt-1">
                        <span className="text-[#94A3B8] font-bold block text-[10px] uppercase tracking-wider">
                          Switch Visibility ({switchIds.length > 0 ? switchIds.join(', ') : 'None'}):
                        </span>
                        {switchEntries.length > 0 ? (
                          <div className="space-y-1 bg-black/40 p-2 rounded-lg border border-white/5">
                            {switchEntries.map(([nodeName, info]: [string, any]) => (
                              <div key={nodeName} className="flex items-center justify-between font-mono text-[9.5px]">
                                <span className="text-white truncate max-w-[140px]">{nodeName}</span>
                                <span className="text-cyan-300">[{info.switches.join(', ')}]</span>
                                <span className={`px-1.5 py-0.2 rounded font-bold ${info.visible ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                  {info.visible ? 'VISIBLE' : 'HIDDEN'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#64748B] text-[10px] italic">No switch-controlled props in this model</span>
                        )}
                      </div>

                      {/* Embedded Animation Clips with Play Buttons */}
                      <div className="space-y-1 pt-1">
                        <span className="text-[#94A3B8] font-bold block text-[10px] uppercase tracking-wider">
                          Animation Clips ({targetChar.availableAnimations.length}):
                        </span>
                        <div className="max-h-36 overflow-y-auto space-y-1 bg-black/40 p-1.5 rounded-lg border border-white/5 custom-scrollbar">
                          {targetChar.availableAnimations.map((clip) => {
                            const isCurrent = targetChar.currentAnimationName === clip.name;
                            return (
                              <div
                                key={clip.name}
                                className={`flex items-center justify-between p-1 rounded transition-colors ${
                                  isCurrent ? 'bg-[#7567C7]/30 border border-[#7567C7]/50' : 'hover:bg-white/5'
                                }`}
                              >
                                <div className="truncate min-w-0 pr-1">
                                  <span className={`text-[10px] font-medium block truncate ${isCurrent ? 'text-white font-bold' : 'text-[#CBD5E1]'}`}>
                                    {clip.name}
                                  </span>
                                  <span className="text-[9px] text-[#64748B] font-mono">
                                    {clip.duration}s • {clip.tracksCount ?? 0} tracks
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onSelectAnimation?.(targetChar.id, clip.name)}
                                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1 ${
                                    isCurrent
                                      ? 'bg-emerald-500 text-black'
                                      : 'bg-white/10 hover:bg-[#7567C7] text-white'
                                  }`}
                                >
                                  <Play className="h-2.5 w-2.5 fill-current" />
                                  <span>{isCurrent ? 'ACTIVE' : 'TEST'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Advanced Diagnostics */}
        <div className="border border-white/5 rounded-xl bg-black/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-left text-[10.5px] font-bold text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
          >
            <span>Advanced Diagnostics</span>
            {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {showAdvanced && (
            <div className="px-3 pb-3 pt-1 space-y-2 text-[10.5px] border-t border-white/5">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#94A3B8]">Active Backdrop:</span>
                <span className="font-bold text-white">{data.environment}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#94A3B8]">Clear Color:</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded border border-white/30 shrink-0"
                    style={{ backgroundColor: data.activeBackgroundColor }}
                  />
                  <span className="font-mono text-white">{data.activeBackgroundColor}</span>
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#94A3B8]">Camera Preset:</span>
                <span className="text-cyan-300 uppercase">{data.cameraPreset}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#94A3B8]">Video ID:</span>
                <span className="font-mono text-white truncate max-w-[150px]">{data.videoId || 'None'}</span>
              </div>
              {data.runtimeErrors && data.runtimeErrors.length > 0 && (
                <div className="pt-1.5 border-t border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-red-400 font-bold">Errors ({data.runtimeErrors.length}):</span>
                    {data.onClearErrors && (
                      <button
                        type="button"
                        onClick={data.onClearErrors}
                        className="text-[9.5px] text-cyan-400 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {data.runtimeErrors.map((e, idx) => (
                    <div key={idx} className="text-red-300 text-[10px] truncate">
                      [{e.subsystem}] {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-3.5 py-1.5 border-t border-white/10 bg-[#0D1322] flex items-center justify-between text-[10px] text-[#94A3B8]">
        <span>Observer mode • No Env GLBs</span>
        <span>ESC to close</span>
      </div>
    </div>
  );
};
