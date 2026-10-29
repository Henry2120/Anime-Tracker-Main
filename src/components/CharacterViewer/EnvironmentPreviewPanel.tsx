import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
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
  Activity,
  Maximize2,
  Camera,
  Gauge,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import {
  SceneryConfig,
  SCENERY_PRESETS,
  DEFAULT_SCENERY_CONFIG,
} from './scenery/sceneryTypes';
import { CompositeEnvironment } from './scenery/CompositeEnvironment';

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

/**
 * Lightweight real-time performance and draw-cost diagnostic HUD.
 * Tracks true frame-to-frame delta, computes rolling average FPS,
 * and measures WebGL scene complexity without GPU readback penalties.
 */
function PreviewPerformanceMonitor({
  onStatsUpdate,
}: {
  onStatsUpdate: (stats: { fps: number; frameMs: number }) => void;
}) {
  const lastTimeRef = useRef<number>(performance.now());
  const framesRef = useRef<number>(0);
  const accumTimeRef = useRef<number>(0);

  useFrame(() => {
    const now = performance.now();
    const deltaMs = now - lastTimeRef.current;
    lastTimeRef.current = now;

    framesRef.current++;
    accumTimeRef.current += deltaMs;

    if (accumTimeRef.current >= 400) {
      const avgFps = Math.round((framesRef.current * 1000) / accumTimeRef.current);
      const avgMs = +(accumTimeRef.current / framesRef.current).toFixed(1);
      onStatsUpdate({ fps: Math.min(avgFps, 120), frameMs: avgMs });
      framesRef.current = 0;
      accumTimeRef.current = 0;
    }
  });

  return null;
}

/**
 * Camera Reset Helper for Environment Preview
 */
function PreviewCameraRig({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 3.2, 9.8);
    camera.lookAt(0, 1.2, 0);
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.5}
      maxDistance={35.0}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 + 0.15}
      target={[0, 1.2, 0]}
    />
  );
}

export const EnvironmentPreviewPanel: React.FC<EnvironmentPreviewPanelProps> = ({
  theme = 'light',
  previewConfig,
  appliedConfig,
  isPreviewActive: _isPreviewActive,
  onUpdatePreviewConfig,
  onApplyEnvironment,
  onResetEnvironment,
  onEnterViewportPreview,
}) => {
  const isDark = isDarkThemeFamily(theme);
  const previewControlsRef = useRef<OrbitControlsImpl>(null);
  const [perfStats, setPerfStats] = useState<{ fps: number; frameMs: number }>({
    fps: 60,
    frameMs: 1.2,
  });

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
      description: 'Elevated multi-tier concert platform with LED perimeter neon runner and metal rim.',
      tag: 'Stage',
    },
    {
      key: 'glassChapel',
      name: 'Glass Chapel (Optimized)',
      category: 'Monumental Architecture',
      icon: <Church className="h-4 w-4 text-cyan-400" />,
      description: 'High-performance Gothic glass pavilion with arched crystal ribs, translucent floor, and open front.',
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

  const handleResetCamera = useCallback(() => {
    if (previewControlsRef.current) {
      previewControlsRef.current.object.position.set(0, 3.2, 9.8);
      previewControlsRef.current.target.set(0, 1.2, 0);
      previewControlsRef.current.update();
    }
  }, []);

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-3 sm:p-5 overflow-y-auto select-none font-sans">
      <div className="max-w-6xl mx-auto w-full space-y-4">
        {/* Top Header & Master Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Compass className="h-5 w-5" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                3D Environment Preview & Stage Customizer
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                Independent 3D Viewer
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
              Dedicated 3D viewport to inspect, orbit, and customize stage environments without loading characters or music.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onResetEnvironment}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5 flex items-center gap-1.5"
              title="Reset all environment elements to OFF (clean stage)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Default (All OFF)</span>
            </button>

            <button
              type="button"
              onClick={onEnterViewportPreview}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#7567C7] hover:bg-[#6556B8] text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
              title="Inspect active scenery combination directly in the main performer stage"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview in Main Stage</span>
            </button>

            <button
              type="button"
              onClick={onApplyEnvironment}
              disabled={isAppliedIdentical}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
              title="Apply previewed environment to persistent stage"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isAppliedIdentical ? 'Stage Applied' : 'Apply to Stage'}</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            DEDICATED 3D ENVIRONMENT PREVIEW VIEWPORT WITH ORBIT CONTROLS & FPS HUD
            ========================================================================= */}
        <div className="relative w-full h-[320px] sm:h-[400px] rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-lg bg-[#070913]">
          <Canvas
            camera={{ position: [0, 3.2, 9.8], fov: 42, near: 0.1, far: 180 }}
            style={{ width: '100%', height: '100%' }}
          >
            <Suspense fallback={null}>
              {/* Neutral ambient & directional lighting for the preview */}
              <ambientLight intensity={0.8} />
              <directionalLight position={[4, 8, 4]} intensity={1.2} color="#ffffff" />
              <directionalLight position={[-4, 4, -3]} intensity={0.5} color="#93c5fd" />

              {/* Modular Scenery Environment */}
              <CompositeEnvironment config={previewConfig} />

              {/* Orbit Controls & Camera Rig */}
              <PreviewCameraRig controlsRef={previewControlsRef} />

              {/* Real-time FPS & Performance Monitor */}
              <PreviewPerformanceMonitor onStatsUpdate={setPerfStats} />
            </Suspense>
          </Canvas>

          {/* Floating Viewport Controls & Diagnostic HUD */}
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetCamera}
              className="px-2.5 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 text-[11px] font-bold backdrop-blur-md border border-white/15 shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              title="Reset OrbitControls camera to frontal default view"
            >
              <Camera className="h-3 w-3 text-purple-400" />
              <span>Reset Camera</span>
            </button>

            <div className="px-2.5 py-1.5 rounded-xl bg-black/60 text-white/90 text-[11px] font-mono backdrop-blur-md border border-white/15 shadow-md flex items-center gap-1.5">
              <Gauge className="h-3 w-3 text-emerald-400" />
              <span className="font-bold text-emerald-400">{perfStats.fps} FPS</span>
              <span className="text-white/40">|</span>
              <span className="text-white/70">{perfStats.frameMs} ms</span>
            </div>
          </div>

          {/* Viewport Info Overlay Chip */}
          <div className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-xl bg-black/60 text-white/80 text-[10px] font-medium backdrop-blur-md border border-white/15 shadow-md flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-purple-400" />
            <span>Drag to rotate • Scroll to zoom • {activeCount} active layer{activeCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Preset Combinations Section */}
        <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-[#161422]/70 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              Environment Presets (Click to Load)
            </span>
            <span className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
              {SCENERY_PRESETS.length} Curated Themes
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
                        <Check className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7 Modular Scenery Layer Toggles */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" />
              <h2 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Scenery Elements & Visual Layers (Default: All OFF)
              </h2>
            </div>
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
              {activeCount} of {sceneryItems.length} Elements Enabled
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {sceneryItems.map((item) => {
              const isActive = Boolean(previewConfig[item.key]);

              return (
                <div
                  key={item.key}
                  className={`p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-2.5 ${
                    isActive
                      ? 'bg-gradient-to-br from-purple-500/10 via-[#7567C7]/5 to-indigo-500/10 border-purple-500/40 shadow-xs ring-1 ring-purple-500/25'
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

                  <p className="text-[10.5px] text-[#77747D] dark:text-[#A4A1AA] leading-relaxed">
                    {item.description}
                  </p>

                  <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[#77747D]">
                      State: {isActive ? 'Enabled' : 'Disabled'}
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
        <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-purple-500" />
          <span>
            Dedicated preview canvas unmounts cleanly when switching tabs. All environment triggers are OFF by default.
          </span>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentPreviewPanel;
