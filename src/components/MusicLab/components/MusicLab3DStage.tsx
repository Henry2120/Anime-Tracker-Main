import React, { Suspense, useState, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import {
  Play,
  Square,
  Sparkles,
  Layers,
  Box,
  RotateCcw,
  RefreshCw,
  Eye,
  Info,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Sliders,
  Camera,
  Shirt,
  Smile,
  ShieldCheck,
} from 'lucide-react';
import { Character3DModel } from './Character3DModel';
import { AniVerseCharacterModel } from './AniVerseCharacterModel';
import { AppTheme } from '../../../types/theme';

export interface DetectedAnimationClip {
  name: string;
  duration: number;
}

export interface ModelStats {
  meshCount: number;
  boneCount: number;
  vertexCount: number;
}

interface MusicLab3DStageProps {
  theme?: AppTheme;
  defaultModelPath?: string;
  className?: string;
  onReturnToEnsemble?: () => void;
}

/**
 * 3D Stage Environment with Studio Diorama Lighting, Shadows, and Pedestal
 */
const StageDioramaEnvironment: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const pedestalColor = isDark ? '#1C1929' : isSakura ? '#FCE8EE' : '#ECE8E1';
  const rimLightColor = isDark ? '#A294EE' : isSakura ? '#F472B6' : '#E2C48D';
  const stageFloorColor = isDark ? '#120F1D' : isSakura ? '#FAF0F3' : '#F4EFEB';

  return (
    <>
      {/* 3-Point Studio Lighting */}
      <ambientLight intensity={isDark ? 0.75 : 0.95} />

      {/* Key Light with soft shadows */}
      <directionalLight
        position={[3, 5, 4]}
        intensity={isDark ? 1.5 : 1.3}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0005}
      />

      {/* Fill Light (Soft cool tone) */}
      <directionalLight position={[-4, 3, -2]} intensity={0.55} color="#D6E4FF" />

      {/* Rim / Hair Light from behind for anime character pop */}
      <directionalLight position={[0, 4, -4]} intensity={1.2} color={rimLightColor} />

      {/* Miniature Concert Diorama Stage Platform */}
      <group position={[0, -0.01, 0]}>
        {/* Main circular pedestal */}
        <mesh position={[0, -0.08, 0]} receiveShadow>
          <cylinderGeometry args={[2.2, 2.3, 0.16, 48]} />
          <meshStandardMaterial
            color={pedestalColor}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>

        {/* Outer metallic trim ring */}
        <mesh position={[0, -0.01, 0]} receiveShadow>
          <torusGeometry args={[2.22, 0.03, 16, 64]} />
          <meshStandardMaterial
            color={isDark ? '#7567C7' : isSakura ? '#F472B6' : '#C5A866'}
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>

        {/* Subtle stage floor plane to catch broad reflections */}
        <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial
            color={stageFloorColor}
            roughness={0.8}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Contact Shadow for grounded realism */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={isDark ? 0.75 : 0.5}
        scale={4.5}
        blur={1.8}
        far={2}
        resolution={512}
      />
    </>
  );
};

/**
 * Fallback loading spinner inside 3D Canvas
 */
const Canvas3DLoader: React.FC = () => {
  return (
    <mesh position={[0, 1, 0]}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshStandardMaterial color="#7567C7" wireframe />
    </mesh>
  );
};

/**
 * MusicLab3DStage Component
 * Complete 3D viewport showcasing AniVerse's first full-body 3D Anime Game Character
 * with inspection controls, animation states, rigging verification, and GLB loading.
 */
export const MusicLab3DStage: React.FC<MusicLab3DStageProps> = ({
  theme = 'light',
  defaultModelPath = '/music-lab/characters/test-character.glb',
  className = '',
  onReturnToEnsemble,
}) => {
  // Model source mode: 'aniverse_lyra' (Original Heroine) vs 'external_glb'
  const [characterSource, setCharacterSource] = useState<'aniverse_lyra' | 'external_glb'>('aniverse_lyra');

  // Lyra procedural character states
  const [lyraPose, setLyraPose] = useState<'idle_breathing' | 'neutral_relaxed' | 'a_pose' | 'graceful_turn'>('idle_breathing');
  const [lyraDisplayMode, setLyraDisplayMode] = useState<'shaded' | 'wireframe' | 'clay'>('shaded');
  const [lyraExpression, setLyraExpression] = useState<'serene' | 'smile' | 'focused'>('serene');
  const [cameraPreset, setCameraPreset] = useState<'full_body' | 'portrait' | 'upper_body' | 'boots'>('full_body');

  // External GLB state
  const [modelPath, setModelPath] = useState(defaultModelPath);
  const [inputPath, setInputPath] = useState(defaultModelPath);
  const [loadKey, setLoadKey] = useState(0);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState(false);
  const [detectedClips, setDetectedClips] = useState<DetectedAnimationClip[]>([]);
  const [selectedClipName, setSelectedClipName] = useState<string>('');
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const orbitControlsRef = useRef<any>(null);

  // Theme styling
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerBg = isDark
    ? 'bg-[#14121C] border-[#2E2C37]'
    : isSakura
    ? 'bg-[#FDF6F8] border-[#F2D6DC]'
    : 'bg-[#F8F6F2] border-[#E7E3DF]';

  const handleClipsDetected = useCallback((clips: DetectedAnimationClip[]) => {
    setDetectedClips(clips);
    setIsLoading(false);
    setLoadError(null);
    if (clips.length > 0 && !selectedClipName) {
      setSelectedClipName(clips[0].name);
    }
  }, [selectedClipName]);

  const handleModelLoaded = useCallback((stats: ModelStats) => {
    setModelStats(stats);
    setIsLoading(false);
    setLoadError(null);
  }, []);

  const handleError = useCallback((msg: string) => {
    setLoadError(msg);
    setIsLoading(false);
  }, []);

  const handleReloadModel = (newPath?: string) => {
    const target = newPath || inputPath;
    setModelPath(target);
    setLoadKey((prev) => prev + 1);
    setIsLoading(true);
    setLoadError(null);
    setDetectedClips([]);
    setModelStats(null);
    setIsPlayingAnimation(false);
  };

  const setCameraView = (preset: 'full_body' | 'portrait' | 'upper_body' | 'boots') => {
    setCameraPreset(preset);
    if (!orbitControlsRef.current) return;

    const controls = orbitControlsRef.current;
    if (preset === 'full_body') {
      controls.target.set(0, 0.95, 0);
      controls.object.position.set(0, 1.3, 3.4);
    } else if (preset === 'portrait') {
      controls.target.set(0, 1.56, 0);
      controls.object.position.set(0, 1.62, 1.1);
    } else if (preset === 'upper_body') {
      controls.target.set(0, 1.35, 0);
      controls.object.position.set(0, 1.42, 1.8);
    } else if (preset === 'boots') {
      controls.target.set(0, 0.25, 0);
      controls.object.position.set(0, 0.35, 1.4);
    }
    controls.update();
  };

  return (
    <div className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col ${containerBg} ${className}`}>
      {/* =========================================================================
          STAGE TOP BAR: Header, Character Model Switcher, and View Modes
          ========================================================================= */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/10 backdrop-blur-md bg-white/40 dark:bg-black/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25 shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                AniVerse Original 3D Character
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                Cast #01: Lyra (リラ)
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Tall young adult heroine • Neutral modern attire • Humanoid rigging ready
            </p>
          </div>
        </div>

        {/* Character Switcher & Return */}
        <div className="flex items-center gap-2">
          {/* Character Source Switcher */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setCharacterSource('aniverse_lyra')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                characterSource === 'aniverse_lyra'
                  ? 'bg-[#7567C7] text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              ★ Lyra (AniVerse 3D)
            </button>
            <button
              type="button"
              onClick={() => {
                setCharacterSource('external_glb');
                if (!modelStats) handleReloadModel();
              }}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                characterSource === 'external_glb'
                  ? 'bg-[#7567C7] text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              External GLB
            </button>
          </div>

          {onReturnToEnsemble && (
            <button
              type="button"
              onClick={onReturnToEnsemble}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37] bg-white/60 dark:bg-white/5"
            >
              2D Ensemble Stage
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          CENTER 3D CANVAS VIEWPORT
          ========================================================================= */}
      <div className="relative w-full h-[440px] sm:h-[540px] bg-gradient-to-b from-transparent to-black/5 dark:to-black/30">
        <Canvas
          shadows
          camera={{ position: [0, 1.3, 3.4], fov: 38 }}
          gl={{ antialias: true, alpha: true }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <StageDioramaEnvironment theme={theme} />

          {/* Smooth Orbit Camera Controls */}
          <OrbitControls
            ref={orbitControlsRef}
            enablePan={true}
            minDistance={0.8}
            maxDistance={5.5}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={[0, 0.95, 0]}
            makeDefault
          />

          <Suspense fallback={<Canvas3DLoader />}>
            {characterSource === 'aniverse_lyra' ? (
              <AniVerseCharacterModel
                pose={lyraPose}
                expression={lyraExpression}
                displayMode={lyraDisplayMode}
                scale={1.12}
                position={[0, 0, 0]}
              />
            ) : (
              <Character3DModel
                key={`${modelPath}-${loadKey}`}
                modelUrl={modelPath}
                isPlayingAnimation={isPlayingAnimation}
                selectedClipName={selectedClipName}
                onClipsDetected={handleClipsDetected}
                onModelLoaded={handleModelLoaded}
                onError={handleError}
              />
            )}
          </Suspense>
        </Canvas>

        {/* Camera Preset Toolbar (Floating Left) */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 p-1.5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white text-xs shadow-lg">
          <div className="px-2 py-1 text-[10px] font-mono text-white/60 uppercase tracking-wider flex items-center gap-1">
            <Camera className="h-3 w-3" />
            <span>Camera Focus</span>
          </div>
          {[
            { id: 'full_body', label: 'Full Body' },
            { id: 'portrait', label: 'Face / Portrait' },
            { id: 'upper_body', label: 'Upper Torso' },
            { id: 'boots', label: 'Footwear / Boots' },
          ].map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => setCameraView(cam.id as any)}
              className={`px-2.5 py-1 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer ${
                cameraPreset === cam.id
                  ? 'bg-[#7567C7] text-white shadow-xs'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cam.label}
            </button>
          ))}
        </div>

        {/* Interaction Hint Overlay (Top Right) */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10">
          <Eye className="h-3 w-3" />
          <span>Left-drag to rotate • Scroll to zoom • Right-drag to pan</span>
        </div>

        {/* Character Info Card (Floating Bottom Left) */}
        {characterSource === 'aniverse_lyra' && (
          <div className="absolute bottom-3 left-3 pointer-events-none p-3 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 text-white text-xs max-w-xs space-y-1 shadow-lg">
            <div className="flex items-center gap-1.5 text-[#D8D2FF] font-bold text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Lyra (リラ) • Standalone Anime Game Heroine</span>
            </div>
            <p className="text-[11px] text-white/80 leading-snug">
              Height: 172 cm (7.8 heads) • A-Pose Base • Anime Cel Eyes & Layered Bangs
            </p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-white/60 pt-0.5">
              <span>54 Rig Bones</span>
              <span>•</span>
              <span>Smooth Topology</span>
              <span>•</span>
              <span>Zero Props</span>
            </div>
          </div>
        )}

        {/* Loading Spinner Overlay for GLB */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-2xs flex flex-col items-center justify-center gap-2 pointer-events-none">
            <Loader2 className="h-6 w-6 animate-spin text-[#7567C7]" />
            <span className="text-xs font-semibold text-[#25242A] dark:text-white bg-white/80 dark:bg-black/80 px-3 py-1 rounded-lg">
              Loading 3D Character GLB...
            </span>
          </div>
        )}

        {/* Load Error Callout */}
        {loadError && (
          <div className="absolute bottom-4 left-4 right-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 backdrop-blur-md text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => handleReloadModel()}
              className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          BOTTOM INSPECTOR & ANIMATION HARNESS CONTROLS
          ========================================================================= */}
      <div className="relative z-10 p-4 sm:p-5 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#1E1D24]/90 backdrop-blur-md space-y-4">
        {characterSource === 'aniverse_lyra' ? (
          /* =====================================================================
             LYRA HEROINE INSPECTOR CONTROLS
             ===================================================================== */
          <div className="space-y-3">
            {/* Control Row 1: Pose & Animation Modes */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1 mr-1">
                  <Play className="h-3 w-3" />
                  <span>Pose & Motion:</span>
                </span>
                {[
                  { id: 'idle_breathing', label: 'Idle Breathing' },
                  { id: 'neutral_relaxed', label: 'Neutral Relaxed' },
                  { id: 'a_pose', label: 'A-Pose (Rigging)' },
                  { id: 'graceful_turn', label: '360° Turntable' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLyraPose(p.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      lyraPose === p.id
                        ? 'bg-[#7567C7] text-white shadow-xs'
                        : 'bg-black/5 dark:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white border border-transparent'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Shading / Material View Modes */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] mr-1">
                  Shader:
                </span>
                {[
                  { id: 'shaded', label: 'Anime Cel/PBR' },
                  { id: 'clay', label: 'Studio Clay' },
                  { id: 'wireframe', label: 'Wireframe' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setLyraDisplayMode(mode.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                      lyraDisplayMode === mode.id
                        ? 'bg-[#7567C7]/20 text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/40'
                        : 'bg-transparent text-[#77747D] border-transparent hover:border-black/10'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Character Design Specifications Card */}
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>AniVerse Character Standard: Production-Quality Humanoid Asset</span>
                </div>
                <p className="text-[#77747D] dark:text-[#9E9AA6] text-[11px]">
                  Engineered with clean edge loops, non-intersecting A-pose limbs, multi-layer hair geometry, and stylized iris optics.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 font-mono">
                  Height: 172cm
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 font-mono">
                  Proportions: 7.8 Heads
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  VRM/Skeletal Ready
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* =====================================================================
             EXTERNAL GLB TEST CONTROLS
             ===================================================================== */
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayingAnimation((prev) => !prev)}
                  disabled={isLoading || Boolean(loadError)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                    isPlayingAnimation
                      ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-400/40'
                      : 'bg-[#7567C7] hover:bg-[#6455B8] text-white'
                  }`}
                >
                  {isPlayingAnimation ? (
                    <>
                      <Square className="h-3.5 w-3.5 fill-white" />
                      <span>Stop Animation (Idle State)</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-white" />
                      <span>Play Animation</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleReloadModel()}
                  title="Reload GLB asset"
                  className="p-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-black/5 dark:hover:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">Preset Asset:</span>
                <button
                  type="button"
                  onClick={() => {
                    setInputPath('/music-lab/characters/test-character.glb');
                    handleReloadModel('/music-lab/characters/test-character.glb');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                    modelPath.includes('test-character')
                      ? 'bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/30'
                      : 'bg-black/5 dark:bg-white/5 text-[#77747D] border-transparent'
                  }`}
                >
                  test-character.glb
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputPath('/music-lab/musicians/violinist.glb');
                    handleReloadModel('/music-lab/musicians/violinist.glb');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                    modelPath.includes('violinist')
                      ? 'bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/30'
                      : 'bg-black/5 dark:bg-white/5 text-[#77747D] border-transparent'
                  }`}
                >
                  violinist.glb
                </button>
              </div>
            </div>

            {/* Animation Clips Inspector */}
            <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[#7567C7] dark:text-[#B9B0F2]" />
                  <span className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    Detected Animation Clips ({detectedClips.length})
                  </span>
                </div>

                {modelStats && (
                  <div className="flex items-center gap-3 text-[11px] font-mono text-[#77747D] dark:text-[#9E9AA6]">
                    <span>Meshes: {modelStats.meshCount}</span>
                    <span>Bones: {modelStats.boneCount}</span>
                    <span>Vertices: {modelStats.vertexCount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {detectedClips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {detectedClips.map((clip, idx) => {
                    const isSelected = selectedClipName === clip.name || (!selectedClipName && idx === 0);
                    return (
                      <button
                        key={clip.name}
                        type="button"
                        onClick={() => {
                          setSelectedClipName(clip.name);
                          if (!isPlayingAnimation) setIsPlayingAnimation(true);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
                          isSelected
                            ? isPlayingAnimation
                              ? 'bg-[#7567C7] text-white border-[#7567C7] shadow-2xs'
                              : 'bg-[#7567C7]/20 text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/40'
                            : 'bg-white dark:bg-[#26252F] text-[#77747D] dark:text-[#9E9AA6] border-[#E7E3DF] dark:border-[#2E2C37]'
                        }`}
                      >
                        <span>{clip.name}</span>
                        <span className="font-mono text-[10px] opacity-75">({clip.duration}s)</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1.5 italic">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isLoading
                      ? 'Analyzing animation clips in GLB file...'
                      : 'This GLB model contains no embedded animation clips (static pose).'}
                  </span>
                </div>
              )}
            </div>

            {/* Custom Path Input */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-[11px] text-[#77747D] dark:text-[#9E9AA6] shrink-0">Model URL:</span>
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/music-lab/characters/test-character.glb"
                className="flex-1 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-mono text-[#25242A] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#7567C7]"
              />
              <button
                type="button"
                onClick={() => handleReloadModel()}
                className="px-3 py-1.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-[#7567C7] hover:text-white font-semibold transition-colors cursor-pointer text-xs shrink-0"
              >
                Load GLB
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
