import React from 'react';
import {
  Compass,
  Sparkles,
  Mountain,
  Moon,
  Flame,
  Shield,
  Church,
  Eye,
  Check,
  RotateCcw,
  Layers,
  Info,
  Maximize2,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import {
  SceneryConfig,
  SCENERY_PRESETS,
  DEFAULT_SCENERY_CONFIG,
} from './scenery/sceneryTypes';

export interface EnvironmentPreviewPanelProps {
  theme?: AppTheme;
  previewConfig: SceneryConfig;
  appliedConfig: SceneryConfig;
  isPreviewActive: boolean;
  onUpdatePreviewConfig: (updater: (prev: SceneryConfig) => SceneryConfig) => void;
  onApplyEnvironment: () => void;
  onResetEnvironment: () => void;
  onEnterViewportPreview: () => void;
}

export const EnvironmentPreviewPanel: React.FC<EnvironmentPreviewPanelProps> = ({
  theme = 'light',
  previewConfig,
  appliedConfig,
  isPreviewActive,
  onUpdatePreviewConfig,
  onApplyEnvironment,
  onResetEnvironment,
  onEnterViewportPreview,
}) => {
  const isDark = isDarkThemeFamily(theme);

  const sceneryItems: {
    key: keyof SceneryConfig;
    name: string;
    category: string;
    icon: React.ReactNode;
    description: string;
    tag: string;
  }[] = [
    {
      key: 'nightSky',
      name: 'Night Sky and Starfield',
      category: 'Celestial Sky',
      icon: <Moon className="h-4 w-4 text-sky-400" />,
      description: 'Procedural sky dome with midnight twilight gradient, twinkling stars, and shooting meteors.',
      tag: 'Atmosphere',
    },
    {
      key: 'meadowTerrain',
      name: 'Base Ground / Meadow Terrain',
      category: 'Natural Landscape',
      icon: <Mountain className="h-4 w-4 text-emerald-400" />,
      description: 'Lush nocturne grass turf ground with stable flat central staging and distant rolling mounds.',
      tag: 'Terrain',
    },
    {
      key: 'performanceStage',
      name: 'Performance Stage',
      category: 'Stage Architecture',
      icon: <Layers className="h-4 w-4 text-indigo-400" />,
      description: 'Elevated multi-tier concert platform under character feet with LED perimeter neon runner and metal rim.',
      tag: 'Stage',
    },
    {
      key: 'glassChapel',
      name: 'Glass Chapel',
      category: 'Monumental Architecture',
      icon: <Church className="h-4 w-4 text-cyan-400" />,
      description: 'Procedural Gothic glass pavilion with arched crystal ribs, translucent floor, and open front.',
      tag: 'Architecture',
    },
    {
      key: 'groundSpikes',
      name: 'Ground Spikes & Shards',
      category: 'Dramatic Landscape',
      icon: <Shield className="h-4 w-4 text-blue-400" />,
      description: 'Procedural 3D obsidian/dark blue monolith spikes with vibrant central backlight and floating shards.',
      tag: 'Monoliths',
    },
    {
      key: 'burningFire',
      name: 'Burning Fire & Embers',
      category: 'Dynamic Effects',
      icon: <Flame className="h-4 w-4 text-orange-400" />,
      description: 'Animated particle flame simulation with rising embers, dynamic convection, and warm flickering point light.',
      tag: 'FX Lighting',
    },
    {
      key: 'fireflies',
      name: 'Bioluminescent Fireflies',
      category: 'Dynamic Effects',
      icon: <Sparkles className="h-4 w-4 text-lime-400" />,
      description: 'Floating bioluminescent warm golden-green orbs drifting gently through the environment space.',
      tag: 'Particles',
    },
  ];

  const activeCount = Object.values(previewConfig).filter(Boolean).length;
  const isAppliedIdentical =
    JSON.stringify(previewConfig) === JSON.stringify(appliedConfig);

  const toggleElement = (key: keyof SceneryConfig) => {
    onUpdatePreviewConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const applyPreset = (config: SceneryConfig) => {
    onUpdatePreviewConfig(() => ({ ...config }));
  };

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-4 sm:p-6 overflow-y-auto select-none font-sans">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Compass className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Environment Preview & Stage Customizer
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                Independent Scenery System
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
              Preview and combine 3D stage environments without requiring a character to be loaded or music to be playing.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onResetEnvironment}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5 flex items-center gap-1.5"
              title="Reset to default clean stage"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Default</span>
            </button>

            <button
              type="button"
              onClick={onEnterViewportPreview}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#7567C7] hover:bg-[#6556B8] text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
              title="Inspect active scenery combination directly in the 3D viewport"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview in Viewport</span>
            </button>

            <button
              type="button"
              onClick={onApplyEnvironment}
              disabled={isAppliedIdentical}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
              title="Make this environment the persistent active stage"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isAppliedIdentical ? 'Stage Applied' : 'Apply to Stage'}</span>
            </button>
          </div>
        </div>

        {/* Preset Combinations Section */}
        <div className="p-4 rounded-2xl bg-white/70 dark:bg-[#161422]/70 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              Curated Environment Presets
            </span>
            <span className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
              {SCENERY_PRESETS.length} One-Click Themes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {SCENERY_PRESETS.map((preset) => {
              const isMatch =
                JSON.stringify(previewConfig) === JSON.stringify(preset.config);

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.config)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isMatch
                      ? 'bg-purple-500/15 border-purple-500/40 ring-2 ring-purple-500/20'
                      : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/5 dark:border-white/5'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      {preset.name}
                    </p>
                    <p className="text-[10px] text-[#77747D] dark:text-[#A4A1AA] line-clamp-2 mt-0.5 leading-tight">
                      {preset.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5">
                    <span className="text-[9.5px] font-semibold text-purple-600 dark:text-purple-400">
                      {Object.values(preset.config).filter(Boolean).length} layers
                    </span>
                    {isMatch && (
                      <span className="text-[9px] font-bold text-emerald-500 flex items-center gap-0.5">
                        <Check className="h-2.5 w-2.5" /> Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7 Modular Scenery Layer Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" />
              <h2 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Scenery Elements & Visual Layers
              </h2>
            </div>
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
              {activeCount} of {sceneryItems.length} Elements Enabled
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sceneryItems.map((item) => {
              const isActive = Boolean(previewConfig[item.key]);

              return (
                <div
                  key={item.key}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'bg-gradient-to-br from-purple-500/10 via-[#7567C7]/5 to-indigo-500/10 border-purple-500/40 shadow-sm ring-1 ring-purple-500/25'
                      : 'bg-white/60 dark:bg-[#161422]/60 border-black/5 dark:border-white/5 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-2 rounded-xl ${
                          isActive
                            ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                            : 'bg-black/5 dark:bg-white/5 text-[#77747D]'
                        }`}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] leading-tight">
                          {item.name}
                        </p>
                        <span className="text-[10px] text-[#77747D] dark:text-[#9E9AA6]">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    <span className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-[9px] font-bold text-[#77747D] dark:text-[#9E9AA6] shrink-0">
                      {item.tag}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] leading-relaxed">
                    {item.description}
                  </p>

                  <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[#77747D]">
                      Status: {isActive ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleElement(item.key)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-black/5 dark:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                      }`}
                    >
                      {isActive ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-purple-500" />
          <span>
            Scenery configurations render continuously across all 3D viewing states. Toggling elements does not affect character visibility, animation clips, or music synchronization.
          </span>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentPreviewPanel;
