import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Layers,
  Sun,
  Grid,
  Sparkles,
  UserPlus,
  RotateCcw,
  Play,
  Pause,
  Film,
  ChevronDown,
  Moon,
} from 'lucide-react';
import { ViewerCameraPreset, ViewerEnvironment, LoadedCharacterInstance } from './types';
import { AppTheme } from '../../types/theme';

interface CharacterViewerToolbarProps {
  theme: AppTheme;
  loadedCharacters: LoadedCharacterInstance[];
  selectedInstanceId: string | null;
  cameraPreset: ViewerCameraPreset;
  onSelectCameraPreset: (preset: ViewerCameraPreset) => void;
  environment: ViewerEnvironment;
  onSelectEnvironment: (env: ViewerEnvironment) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  onOpenBrowser: () => void;
  onResetCamera: () => void;
  onSelectAnimation?: (instanceId: string, animationName: string) => void;
  onTogglePlayPause?: (instanceId: string) => void;
  isConcertPlaying?: boolean;
  onToggleConcertMusic?: () => void;
  isSpecialSceneActive?: boolean;
}

export const CharacterViewerToolbar: React.FC<CharacterViewerToolbarProps> = ({
  theme,
  loadedCharacters,
  selectedInstanceId,
  cameraPreset,
  onSelectCameraPreset,
  environment,
  onSelectEnvironment,
  showGrid,
  onToggleGrid,
  showWireframe,
  onToggleWireframe,
  onOpenBrowser,
  onResetCamera,
  onSelectAnimation,
  onTogglePlayPause,
  isConcertPlaying,
  onToggleConcertMusic,
  isSpecialSceneActive = false,
}) => {
  const [animDropdownOpen, setAnimDropdownOpen] = useState(false);
  const animDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (animDropdownRef.current && !animDropdownRef.current.contains(e.target as Node)) {
        setAnimDropdownOpen(false);
      }
    };
    if (animDropdownOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [animDropdownOpen]);

  // Current active character
  const activeChar =
    loadedCharacters.find((c) => c.id === selectedInstanceId) || loadedCharacters[0];

  const hasAnimations = activeChar && activeChar.availableAnimations.length > 0;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-[#161422]/90 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-xl max-w-[95vw] select-none text-xs">
      {/* Special Scene Indicator in Toolbar */}
      {isSpecialSceneActive && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-950/80 via-indigo-950/80 to-slate-900/80 border border-blue-500/50 text-xs font-bold text-blue-200 shadow-md">
          <Moon className="h-3.5 w-3.5 text-cyan-300 fill-cyan-300" />
          <span>Night Beach Piano Performance (00:04 - 00:07)</span>
        </div>
      )}

      {/* Browse Roster Button */}
      <button
        type="button"
        onClick={onOpenBrowser}
        className="px-3 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
      >
        <UserPlus className="h-3.5 w-3.5" />
        <span>Roster</span>
      </button>

      {/* Concert Music Master Toggle */}
      {onToggleConcertMusic && (
        <button
          type="button"
          onClick={onToggleConcertMusic}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs ${
            isConcertPlaying
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
              : 'bg-black/10 dark:bg-white/10 hover:bg-[#7567C7] hover:text-white text-[#25242A] dark:text-white'
          }`}
          title={
            isConcertPlaying
              ? 'Stop Concert Music (Switches all 10 to Cafe_Idle)'
              : 'Play Concert Music (Switches all 10 to Cafe_Reaction)'
          }
        >
          {isConcertPlaying ? (
            <>
              <Pause className="h-3.5 w-3.5 fill-white" />
              <span>Stop Music</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Play Music</span>
            </>
          )}
        </button>
      )}

      <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5 hidden sm:block" />

      {/* =========================================================================
          DYNAMIC ANIMATION SELECTOR & CONTROLS (Part 6, 7, 8)
          ========================================================================= */}
      {hasAnimations && (
        <div className="relative flex items-center gap-1" ref={animDropdownRef}>
          {/* Play/Pause Button */}
          {onTogglePlayPause && (
            <button
              type="button"
              onClick={() => onTogglePlayPause(activeChar.id)}
              title={activeChar.isPlayingAnimation ? 'Pause Animation' : 'Play Animation'}
              className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-[#7567C7] hover:text-white text-[#25242A] dark:text-white transition-colors cursor-pointer"
            >
              {activeChar.isPlayingAnimation ? (
                <Pause className="h-3.5 w-3.5 text-[#7567C7] hover:text-white" />
              ) : (
                <Play className="h-3.5 w-3.5 text-[#7567C7] hover:text-white" />
              )}
            </button>
          )}

          {/* Animation Selector Dropdown Trigger */}
          <button
            type="button"
            onClick={() => setAnimDropdownOpen((prev) => !prev)}
            title="Select embedded animation clip"
            className="px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#25242A] dark:text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
          >
            <Film className="h-3.5 w-3.5 text-[#7567C7]" />
            <span className="max-w-[110px] truncate">
              {activeChar.currentAnimationName || 'Animation'}
            </span>
            <span className="text-[9px] font-mono opacity-60">
              ({activeChar.availableAnimations.length})
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {/* Animation Popover List */}
          {animDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-56 max-h-64 overflow-y-auto bg-white dark:bg-[#1C192E] rounded-2xl shadow-2xl border border-[#E7E3DF] dark:border-[#2D2A4A] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
              <div className="px-2.5 py-1.5 border-b border-black/5 dark:border-white/5 mb-1 flex items-center justify-between text-[10px] font-bold text-[#77747D] uppercase tracking-wider">
                <span>Embedded Clips</span>
                <span>{activeChar.availableAnimations.length}</span>
              </div>

              <div className="space-y-0.5">
                {activeChar.availableAnimations.map((clip) => {
                  const isCurrent = activeChar.currentAnimationName === clip.name;
                  const isCafeReaction = clip.name === 'Cafe_Reaction';

                  return (
                    <button
                      key={clip.name}
                      type="button"
                      onClick={() => {
                        onSelectAnimation?.(activeChar.id, clip.name);
                        setAnimDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                        isCurrent
                          ? 'bg-[#7567C7] text-white font-bold'
                          : 'text-[#25242A] dark:text-[#F4F2F7] hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isCafeReaction && (
                          <Sparkles className={`h-3 w-3 ${isCurrent ? 'text-amber-300' : 'text-amber-500'}`} />
                        )}
                        <span className="truncate">{clip.name}</span>
                      </div>
                      <span className={`text-[9px] font-mono shrink-0 opacity-70`}>
                        {clip.duration}s
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5 hidden sm:block" />
        </div>
      )}

      {/* Camera Presets */}
      <div className="flex items-center gap-0.5">
        <Camera className="h-3.5 w-3.5 ml-1 mr-0.5 text-[#7567C7] hidden sm:block" />
        {(
          [
            { id: 'perspective', label: 'Perspective' },
            { id: 'front', label: 'Front' },
            { id: 'side', label: 'Side' },
            { id: 'closeUp', label: 'Portrait' },
          ] as const
        ).map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelectCameraPreset(preset.id)}
            className={`px-2 py-1 rounded-lg font-medium text-[11px] transition-colors cursor-pointer ${
              cameraPreset === preset.id
                ? 'bg-black/10 dark:bg-white/15 text-[#25242A] dark:text-white font-bold'
                : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5 hidden sm:block" />

      {/* Environment / Mood Selector */}
      <div className="flex items-center gap-0.5">
        <Sun className="h-3.5 w-3.5 ml-1 mr-0.5 text-amber-500 hidden sm:block" />
        {(
          [
            { id: 'studio', label: 'Studio' },
            { id: 'dark', label: 'Dark' },
            { id: 'sakura', label: 'Sakura' },
          ] as const
        ).map((env) => (
          <button
            key={env.id}
            type="button"
            onClick={() => onSelectEnvironment(env.id)}
            className={`px-2 py-1 rounded-lg font-medium text-[11px] transition-colors cursor-pointer ${
              environment === env.id
                ? 'bg-black/10 dark:bg-white/15 text-[#25242A] dark:text-white font-bold'
                : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {env.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5 hidden sm:block" />

      {/* Toggle View Options */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleGrid}
          title="Toggle Ground Grid"
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showGrid
              ? 'bg-[#7567C7]/20 text-[#7567C7] dark:text-[#A898F8]'
              : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Grid className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleWireframe}
          title="Toggle Wireframe Mode"
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showWireframe
              ? 'bg-[#7567C7]/20 text-[#7567C7] dark:text-[#A898F8]'
              : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onResetCamera}
          title="Reset Camera Framing"
          className="p-1.5 rounded-lg text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
