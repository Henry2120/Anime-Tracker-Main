import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Bug,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Info,
  Play,
  Film,
  Layers,
} from 'lucide-react';
import { LoadedCharacterInstance, ViewerCameraPreset, ViewerEnvironment } from './types';

export interface SceneDebuggerData {
  // Scene & Selection
  environment: ViewerEnvironment;
  isSpecialSceneActive: boolean;
  isDressHinaAlone: boolean;
  activeSceneName: string;
  sceneStatus: 'READY' | 'LOADING' | 'ERROR';
  sceneTransition: string;
  backgroundMode: string;
  activeBackgroundColor: string;
  selectionReason: string;
  fallbackActive: boolean;

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
  isConcertActive: boolean;

  // Camera & Visual Systems
  cameraPreset: ViewerCameraPreset;
  showGrid: boolean;
  showWireframe: boolean;

  // Errors / Warnings
  runtimeErrors?: { timestamp: string; subsystem: string; message: string }[];
  onClearErrors?: () => void;

  // Manual Environment & Instrument Detection
  hinaSpecialEnvEnabled?: boolean;
  musicAnalysis?: any;
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

  // Inspect first character for Dress Hina
  const firstChar = data.loadedCharacters[0];
  const isDressHinaLoaded = useMemo(() => {
    return data.loadedCharacters.some((char) => {
      if (!char?.manifestEntry) return false;
      const name = (char.manifestEntry.name || '').toLowerCase();
      const id = (char.manifestEntry.id || '').toLowerCase();
      const filename = (char.manifestEntry.filename || '').toLowerCase();
      const hasHina = name.includes('hina') || id.includes('hina') || filename.includes('hina');
      const hasDress = name.includes('dress') || id.includes('dress') || filename.includes('dress');
      return hasHina && hasDress;
    });
  }, [data.loadedCharacters]);

  const isSongLoaded = Boolean(data.videoId && data.videoId.trim().length > 0);
  const isSongPlaying = data.isPlaying;
  const isHinaSolePerformer = data.isDressHinaAlone && data.loadedCharacters.length === 1;
  const isEnvSettingEnabled = Boolean(data.hinaSpecialEnvEnabled);
  const specialSceneShouldActivate =
    isDressHinaLoaded && isHinaSolePerformer && isSongLoaded && isSongPlaying && isEnvSettingEnabled;

  // Detailed reason why scene is active or inactive
  const inactiveReason = useMemo(() => {
    if (data.isSpecialSceneActive) {
      return 'None — Special Night Meadow piano performance is active.';
    }
    if (data.loadedCharacters.length === 0) {
      return 'No performers on stage. Add Dress Hina to begin.';
    }
    if (!isDressHinaLoaded) {
      return `Current performer (${firstChar?.manifestEntry?.name || 'Character'}) is not Dress Hina. Load Dress Hina (with Piano).`;
    }
    if (data.loadedCharacters.length > 1) {
      return `Multiple performers on stage (${data.loadedCharacters.length}). Dress Hina must be the sole performer.`;
    }
    if (!isSongLoaded) {
      return 'No song loaded. Paste a YouTube URL or select a track.';
    }
    if (!isSongPlaying) {
      return 'Target song is paused or stopped. Press Play to trigger Night Meadow.';
    }
    if (!isEnvSettingEnabled) {
      return 'Hina Piano Special Environment is set to OFF in Settings. Enable it in Settings (or top bar) to activate Night Meadow.';
    }
    return data.selectionReason || 'Performance conditions not met.';
  }, [
    data.isSpecialSceneActive,
    data.loadedCharacters.length,
    isDressHinaLoaded,
    firstChar,
    isSongLoaded,
    isSongPlaying,
    isEnvSettingEnabled,
    data.selectionReason,
  ]);

  // Copy diagnostics snapshot
  const handleCopyDiagnostics = (format: 'text' | 'json') => {
    const timestamp = new Date().toISOString();

    const snapshot = {
      timestamp,
      scene: {
        activeSceneName: data.activeSceneName,
        status: data.sceneStatus,
        environment: data.environment,
        backgroundMode: data.backgroundMode,
        activeBackgroundColor: data.activeBackgroundColor,
      },
      whatTriggers: {
        targetSongLoaded: isSongLoaded,
        targetSongPlaying: isSongPlaying,
        hinaPianoLoaded: isDressHinaLoaded,
        hinaSolePerformer: isHinaSolePerformer,
        specialSceneShouldActivate,
        specialSceneActive: data.isSpecialSceneActive,
        reason: inactiveReason,
      },
      roster: {
        totalPerformers: data.loadedCharacters.length,
        selectedInstanceId: data.selectedInstanceId,
        performers: data.loadedCharacters.map((c) => ({
          name: c.manifestEntry.name,
          currentAnimation: c.currentAnimationName,
          isPlayingAnimation: c.isPlayingAnimation,
        })),
      },
      music: {
        videoId: data.videoId || 'None',
        videoTitle: data.videoTitle || 'N/A',
        isPlaying: data.isPlaying,
      },
    };

    let copyText = '';
    if (format === 'json') {
      copyText = JSON.stringify(snapshot, null, 2);
    } else {
      copyText = `=== 3D VIEWER SCENE DEBUGGER ===
Timestamp: ${timestamp}
Active Scene: ${data.activeSceneName} (${data.sceneStatus})
Environment: ${data.environment}

[WHAT TRIGGERS?]
Target song is loaded: ${isSongLoaded ? 'Yes' : 'No'} (${data.videoTitle || 'None'})
Target song is currently playing: ${isSongPlaying ? 'Yes' : 'No'}
Hina (Piano) is loaded: ${isDressHinaLoaded ? 'Yes' : 'No'}
Hina is the only performer on the field: ${isHinaSolePerformer ? 'Yes' : 'No'} (Count: ${data.loadedCharacters.length})
Special scene should activate: ${specialSceneShouldActivate ? 'Yes' : 'No'}
Special scene is active: ${data.isSpecialSceneActive ? 'Yes' : 'No'}
Status Reason: ${inactiveReason}
================================`;
    }

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
              <span>SCENE DEBUGGER</span>
              {data.isSpecialSceneActive && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>SPECIAL SCENE</span>
                </span>
              )}
            </h3>
            <p className="text-[10px] text-[#94A3B8]">Active: {data.activeSceneName}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Copy snapshot button */}
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

          {/* Close button */}
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

      {/* Main Content: "What triggers?" Section */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* "What triggers?" Primary Section */}
        <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-white/10">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>What triggers?</span>
            </span>
            <span
              className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                data.isSpecialSceneActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/10 text-[#94A3B8] border border-white/10'
              }`}
            >
              {data.isSpecialSceneActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>

          {/* Trigger Conditions Status List */}
          <div className="space-y-1.5 text-[11px]">
            {renderConditionRow('Target song is loaded', isSongLoaded, data.videoTitle ? `"${data.videoTitle}"` : undefined)}
            {renderConditionRow('Target song is currently playing', isSongPlaying)}
            {renderConditionRow('Hina (Piano) is loaded', isDressHinaLoaded)}
            {renderConditionRow(
              'Hina is the only performer on the field',
              isHinaSolePerformer,
              data.loadedCharacters.length > 0 ? `${data.loadedCharacters.length} on field` : undefined
            )}
            {renderConditionRow(
              'Hina Special Environment setting enabled',
              isEnvSettingEnabled,
              isEnvSettingEnabled ? 'ON' : 'OFF (Default)'
            )}
            <div className="pt-1 border-t border-white/5">
              {renderConditionRow('Special scene should activate', specialSceneShouldActivate, undefined, true)}
            </div>
          </div>

          {/* Explanation Box */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1 mb-1">
              <Info className="h-3 w-3 text-cyan-400" />
              <span>{data.isSpecialSceneActive ? 'Active status' : 'Reason the scene is inactive'}</span>
            </div>
            <p
              className={`p-2 rounded-lg text-[10.5px] leading-relaxed border ${
                data.isSpecialSceneActive
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                  : 'bg-[#14121F] text-amber-200 border-amber-500/20'
              }`}
            >
              {inactiveReason}
            </p>
          </div>
        </div>

        {/* Collapsed-by-default Character & Animation Diagnostics Panel (Section 7) */}
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

        {/* Optional Collapsed Advanced Diagnostics Section */}
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
                <span className="text-[#94A3B8]">Active Environment:</span>
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
                <span className="text-[#94A3B8]">Performers Count:</span>
                <span className="font-bold text-white">{data.loadedCharacters.length}</span>
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
                  <span className="text-red-400 font-bold block mb-1">Errors ({data.runtimeErrors.length}):</span>
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
        <span>Observer mode</span>
        <span>ESC to close</span>
      </div>
    </div>
  );

  function renderConditionRow(label: string, isYes: boolean, detail?: string, isHighlight = false) {
    return (
      <div
        className={`flex items-center justify-between py-1 px-1.5 rounded ${
          isHighlight
            ? isYes
              ? 'bg-emerald-950/40 text-emerald-300 font-bold'
              : 'bg-white/5 text-white font-bold'
            : ''
        }`}
      >
        <span className="text-[#94A3B8] pr-2 flex items-center gap-1 truncate">
          <span>{label}</span>
          {detail && <span className="text-[9.5px] opacity-75 truncate max-w-[120px]">({detail})</span>}
        </span>
        <span
          className={`font-bold px-2 py-0.5 rounded text-[10px] shrink-0 ${
            isYes
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-white/5 text-[#94A3B8] border border-white/10'
          }`}
        >
          {isYes ? 'Yes' : 'No'}
        </span>
      </div>
    );
  }
};
