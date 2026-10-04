import React from 'react';
import {
  Camera,
  Layers,
  Sun,
  Grid,
  Sparkles,
  UserPlus,
  RotateCcw,
  Sliders,
  Eye,
  Maximize2,
} from 'lucide-react';
import { ViewerCameraPreset, ViewerEnvironment, LoadedCharacterInstance } from './types';
import { AppTheme } from '../../types/theme';

interface CharacterViewerToolbarProps {
  theme: AppTheme;
  loadedCharacters: LoadedCharacterInstance[];
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
}

export const CharacterViewerToolbar: React.FC<CharacterViewerToolbarProps> = ({
  theme,
  loadedCharacters,
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
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-[#161422]/90 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-xl max-w-[95vw] select-none text-xs">
      {/* Browse Roster Button */}
      <button
        type="button"
        onClick={onOpenBrowser}
        className="px-3 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
      >
        <UserPlus className="h-3.5 w-3.5" />
        <span>Roster (295)</span>
      </button>

      <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5 hidden sm:block" />

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
