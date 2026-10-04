import React, { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Camera,
  RotateCcw,
  Play,
  Pause,
  Activity,
  Layers,
  Sparkles,
  Maximize2,
  ChevronRight,
  Eye,
  Crosshair,
  User,
  Music,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';
import { PlaybackState, MusicAnalysisResult } from '../types';
import { VRMCharacterModel } from './Character/VRMCharacterModel';
import { ViolinAndBowGroup } from './Instruments/ViolinAndBowGroup';
import { InteractionDebugOverlay } from './Debug/InteractionDebugOverlay';
import { InteractionDiagnosticHUD } from './Debug/InteractionDiagnosticHUD';
import { VRMHumanoidAdapter } from '../core/VRMHumanoidAdapter';
import { ViolinInteractionSolver } from '../core/ViolinInteractionSolver';
import { PerformanceAnimator } from '../core/PerformanceAnimator';
import { InteractionSolution, HumanoidMetrics, Transform3D } from '../core/types';

interface MusicLab3DStageProps {
  theme?: AppTheme;
  className?: string;
  playback?: PlaybackState;
  analysisResult?: MusicAnalysisResult | null;
  onTogglePlayPause?: () => void;
  onReturnToEnsemble?: () => void;
}

/**
 * Lighting & Diorama Environment
 */
const StudioEnvironment: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const pedestalColor = isDark ? '#1C1929' : isSakura ? '#FCE8EE' : '#ECE8E1';
  const rimLightColor = isDark ? '#BCA8F8' : isSakura ? '#F472B6' : '#E8CE9D';
  const floorColor = isDark ? '#120F1D' : isSakura ? '#FAF0F3' : '#F4EFEB';

  return (
    <>
      <ambientLight intensity={isDark ? 0.95 : 1.15} />

      {/* Key Light */}
      <directionalLight
        position={[2.8, 4.5, 3.8]}
        intensity={isDark ? 1.5 : 1.3}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-bias={-0.0005}
      />

      {/* Soft Fill Light */}
      <directionalLight position={[-3.5, 3.0, -1.5]} intensity={0.65} color="#D6E4FF" />

      {/* Rim / Hair Silhouette Backlight */}
      <directionalLight position={[0, 3.8, -3.5]} intensity={1.35} color={rimLightColor} />

      {/* Diorama Platform */}
      <group position={[0, -0.01, 0]}>
        <mesh position={[0, -0.08, 0]} receiveShadow>
          <cylinderGeometry args={[2.0, 2.1, 0.16, 48]} />
          <meshStandardMaterial color={pedestalColor} roughness={0.35} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.01, 0]} receiveShadow>
          <torusGeometry args={[2.02, 0.02, 16, 64]} />
          <meshStandardMaterial
            color={isDark ? '#7567C7' : isSakura ? '#F472B6' : '#C5A866'}
            metalness={0.6}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[14, 14]} />
          <meshStandardMaterial color={floorColor} roughness={0.8} metalness={0.05} />
        </mesh>
      </group>

      <ContactShadows position={[0, 0, 0]} opacity={isDark ? 0.75 : 0.45} scale={4.5} blur={1.6} far={2} />
    </>
  );
};

/**
 * Scene Animator Hook Component for R3F Canvas
 */
const SceneAnimator: React.FC<{
  adapter: VRMHumanoidAdapter | null;
  solution: InteractionSolution | null;
  isPlaying: boolean;
  bpm: number;
  onUpdateTransforms: (vTrans: Transform3D, bTrans: Transform3D) => void;
}> = ({ adapter, solution, isPlaying, bpm, onUpdateTransforms }) => {
  const clockRef = useRef<number>(0);

  useFrame((_, delta) => {
    if (!adapter || !solution) return;

    if (isPlaying) {
      clockRef.current += delta;
      const { animatedViolinTransform, animatedBowTransform } = PerformanceAnimator.animate(
        adapter,
        solution,
        clockRef.current,
        true,
        bpm
      );
      onUpdateTransforms(
        {
          position: animatedViolinTransform.position,
          quaternion: animatedViolinTransform.quaternion,
          scale: solution.instrumentTransform.scale,
        },
        {
          position: animatedBowTransform.position,
          quaternion: animatedBowTransform.quaternion,
          scale: solution.accessoryTransform.scale,
        }
      );
    }
  });

  return null;
};

/**
 * Camera Auto-Framing Component (Section 15)
 * Dynamically frames the combined bounding box of Character + Violin + Bow.
 */
const CameraAutoFramer: React.FC<{
  solution: InteractionSolution | null;
  metrics: HumanoidMetrics | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}> = ({ solution, metrics, controlsRef }) => {
  const { camera } = useThree();
  const hasFramedRef = useRef(false);

  useEffect(() => {
    if (!solution || !metrics || hasFramedRef.current) return;
    hasFramedRef.current = true;

    // Combined target center around upper chest & violin
    const targetY = metrics.height * 0.72; // ~1.16m on 1.61m character
    const targetCenter = new THREE.Vector3(0.04, targetY, 0.08);

    // Camera placed in front 3/4 angle framing whole character + violin + bow
    const camDistance = Math.max(1.8, metrics.height * 1.35);
    camera.position.set(0.65, targetY + 0.15, camDistance);
    camera.lookAt(targetCenter);

    if (controlsRef.current) {
      controlsRef.current.target.copy(targetCenter);
      controlsRef.current.update();
    }
  }, [solution, metrics, camera, controlsRef]);

  return null;
};

export const MusicLab3DStage: React.FC<MusicLab3DStageProps> = ({
  theme = 'light',
  className = '',
  playback,
  analysisResult,
  onTogglePlayPause,
  onReturnToEnsemble,
}) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerBg = isDark
    ? 'bg-[#14121C] border-[#2E2C37]'
    : isSakura
    ? 'bg-[#FDF6F8] border-[#F2D6DC]'
    : 'bg-[#F8F6F2] border-[#E7E3DF]';

  // Core Kinematic State
  const [adapter, setAdapter] = useState<VRMHumanoidAdapter | null>(null);
  const [metrics, setMetrics] = useState<HumanoidMetrics | null>(null);
  const [solution, setSolution] = useState<InteractionSolution | null>(null);

  // Dynamic transforms applied to violin & bow in 3D scene
  const [activeViolinTransform, setActiveViolinTransform] = useState<Transform3D | null>(null);
  const [activeBowTransform, setActiveBowTransform] = useState<Transform3D | null>(null);

  // UI & Viewport Controls
  const [showDebug, setShowDebug] = useState<boolean>(true);
  const [cameraView, setCameraView] = useState<'default' | 'front' | 'bowHand' | 'chinrest'>('default');
  const [localPlaying, setLocalPlaying] = useState<boolean>(false);

  const orbitControlsRef = useRef<OrbitControlsImpl>(null);

  // Effective playback state
  const isPlaying = Boolean(playback?.isPlaying || localPlaying);
  const bpm = analysisResult?.bpm || 112;

  // Handle character VRM model loaded
  const handleCharacterLoaded = useCallback((loadedAdapter: VRMHumanoidAdapter) => {
    setAdapter(loadedAdapter);
    const m = loadedAdapter.computeMetrics(true);
    setMetrics(m);

    // Solve universal interaction
    const sol = ViolinInteractionSolver.solve(loadedAdapter);
    setSolution(sol);
    setActiveViolinTransform(sol.instrumentTransform);
    setActiveBowTransform(sol.accessoryTransform);

    // Apply static solved pose
    ViolinInteractionSolver.applySolutionToModel(loadedAdapter, sol);
  }, []);

  // Explicit recalculation handler
  const handleRecalculate = useCallback(() => {
    if (!adapter) return;
    const m = adapter.computeMetrics(true);
    setMetrics(m);
    const sol = ViolinInteractionSolver.solve(adapter);
    setSolution(sol);
    setActiveViolinTransform(sol.instrumentTransform);
    setActiveBowTransform(sol.accessoryTransform);
    ViolinInteractionSolver.applySolutionToModel(adapter, sol);
  }, [adapter]);

  // Handle frame-by-frame animated transforms update from SceneAnimator
  const handleAnimatedTransforms = useCallback((vTrans: Transform3D, bTrans: Transform3D) => {
    setActiveViolinTransform(vTrans);
    setActiveBowTransform(bTrans);
  }, []);

  // Camera presets
  const applyCameraPreset = (preset: 'default' | 'front' | 'bowHand' | 'chinrest') => {
    setCameraView(preset);
    const controls = orbitControlsRef.current;
    if (!controls || !metrics) return;

    const baseH = metrics.height;
    if (preset === 'default') {
      controls.object.position.set(0.65, baseH * 0.74, 2.1);
      controls.target.set(0.04, baseH * 0.72, 0.08);
    } else if (preset === 'front') {
      controls.object.position.set(0.0, baseH * 0.74, 2.2);
      controls.target.set(0.0, baseH * 0.72, 0.05);
    } else if (preset === 'bowHand') {
      controls.object.position.set(-0.35, baseH * 0.75, 0.85);
      controls.target.set(-0.08, baseH * 0.73, 0.16);
    } else if (preset === 'chinrest') {
      controls.object.position.set(0.35, baseH * 0.88, 0.85);
      controls.target.set(0.06, baseH * 0.84, 0.12);
    }
    controls.update();
  };

  const handleTogglePlay = () => {
    if (onTogglePlayPause) {
      onTogglePlayPause();
    } else {
      setLocalPlaying((prev) => !prev);
    }
  };

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col min-h-[580px] sm:min-h-[660px] select-none ${containerBg} ${className}`}
    >
      {/* =========================================================================
          TOP CONTROL BAR
          ========================================================================= */}
      <div className="relative z-20 flex items-center justify-between p-3.5 bg-white/70 dark:bg-[#1A1824]/70 backdrop-blur-md border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7]">
              Universal Humanoid-Instrument Studio
            </span>
          </div>

          {/* Model / Instrument Badges */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1 font-medium">
              <User className="h-3 w-3" />
              <span>test.vrm</span>
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1 font-medium">
              <Music className="h-3 w-3 text-[#7567C7]" />
              <span>Violin & Bow GLB</span>
            </span>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Quality Badge */}
          {solution && (
            <div
              className={`px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                solution.validation.state === 'excellent'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : solution.validation.state === 'acceptable'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
              }`}
            >
              {solution.validation.state === 'excellent' ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              <span>
                {solution.validation.score}% {solution.validation.state.toUpperCase()}
              </span>
            </div>
          )}

          {/* Recalculate Button */}
          <button
            type="button"
            onClick={handleRecalculate}
            title="Recalculate dynamic kinematic pose and scale"
            className="p-1.5 px-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Recalculate</span>
          </button>

          {/* Debug Toggle */}
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            title="Toggle interaction markers & diagnostic HUD"
            className={`p-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              showDebug
                ? 'bg-[#7567C7] text-white border-[#7567C7]'
                : 'bg-black/5 dark:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white border-black/5 dark:border-white/5'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Debug Overlay</span>
          </button>

          {/* Return to 2D Ensemble Button */}
          {onReturnToEnsemble && (
            <button
              type="button"
              onClick={onReturnToEnsemble}
              className="p-1.5 px-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-black/5 dark:border-white/5"
            >
              <span>2D Stage</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          3D CANVAS VIEWPORT
          ========================================================================= */}
      <div className="relative flex-1 w-full h-[500px] sm:h-[580px] bg-radial from-transparent to-black/15">
        <Canvas
          shadows
          camera={{ position: [0.65, 1.25, 2.1], fov: 40, near: 0.1, far: 25 }}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <StudioEnvironment theme={theme} />

            <OrbitControls
              ref={orbitControlsRef}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.5}
              maxDistance={5.0}
              maxPolarAngle={Math.PI / 2 + 0.05}
              target={[0.04, 1.15, 0.08]}
            />

            {/* Character VRM Model */}
            <VRMCharacterModel modelUrl="/models/test.vrm" onLoaded={handleCharacterLoaded} />

            {/* Instrument & Bow 3D Props */}
            <ViolinAndBowGroup
              violinTransform={activeViolinTransform}
              bowTransform={activeBowTransform}
              visible={true}
            />

            {/* Debug Landmarks Overlay (Section 16) */}
            <InteractionDebugOverlay solution={solution} visible={showDebug} />

            {/* Performance Animator Driver (Section 18) */}
            <SceneAnimator
              adapter={adapter}
              solution={solution}
              isPlaying={isPlaying}
              bpm={bpm}
              onUpdateTransforms={handleAnimatedTransforms}
            />

            {/* Camera Auto-Framer (Section 15) */}
            <CameraAutoFramer
              solution={solution}
              metrics={metrics}
              controlsRef={orbitControlsRef}
            />
          </Suspense>
        </Canvas>

        {/* Diagnostic HUD Overlay Panel (Section 17) */}
        <InteractionDiagnosticHUD
          solution={solution}
          metrics={metrics}
          visible={showDebug}
          onToggleVisible={() => setShowDebug(!showDebug)}
          onRecalculate={handleRecalculate}
          isPlaying={isPlaying}
        />

        {/* =====================================================================
            BOTTOM VIEWPORT TOOLBAR: PLAYBACK & CAMERA PRESETS
            ===================================================================== */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-1.5 rounded-2xl bg-white/90 dark:bg-[#1A1824]/90 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-lg text-xs">
          {/* Play / Pause Performance Motion Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className="px-3.5 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white font-bold flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-xs"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
            <span>{isPlaying ? 'Pause Motion' : 'Play Motion'}</span>
          </button>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-1" />

          {/* Camera View Presets */}
          <div className="flex items-center gap-1 text-[11px] font-medium text-[#77747D] dark:text-[#A4A1AA]">
            <Camera className="h-3.5 w-3.5 ml-1 mr-0.5 text-[#7567C7]" />
            {[
              { id: 'default', label: 'Default' },
              { id: 'front', label: 'Front' },
              { id: 'bowHand', label: 'Bow Grip' },
              { id: 'chinrest', label: 'Chinrest' },
            ].map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => applyCameraPreset(cam.id as any)}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  cameraView === cam.id
                    ? 'bg-black/10 dark:bg-white/15 text-[#25242A] dark:text-white font-bold'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
