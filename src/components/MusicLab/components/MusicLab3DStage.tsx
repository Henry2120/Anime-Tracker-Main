import React, { Suspense, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Float } from '@react-three/drei';
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
} from 'lucide-react';
import { Character3DModel } from './Character3DModel';
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
      {/* 3-Point Studio / Concert Lighting */}
      <ambientLight intensity={isDark ? 0.7 : 0.9} />

      {/* Key Light with soft shadows */}
      <directionalLight
        position={[3, 5, 4]}
        intensity={isDark ? 1.4 : 1.2}
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
      <directionalLight position={[-4, 3, -2]} intensity={0.5} color="#D6E4FF" />

      {/* Rim / Hair Light from behind for anime character pop */}
      <directionalLight position={[0, 4, -4]} intensity={1.1} color={rimLightColor} />

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
 * Complete 3D viewport and verification harness for external GLB characters and animations.
 */
export const MusicLab3DStage: React.FC<MusicLab3DStageProps> = ({
  theme = 'light',
  defaultModelPath = '/music-lab/characters/test-character.glb',
  className = '',
  onReturnToEnsemble,
}) => {
  // Model state
  const [modelPath, setModelPath] = useState(defaultModelPath);
  const [inputPath, setInputPath] = useState(defaultModelPath);
  const [loadKey, setLoadKey] = useState(0);

  // Playback & Animation state
  const [isPlayingAnimation, setIsPlayingAnimation] = useState(false);
  const [detectedClips, setDetectedClips] = useState<DetectedAnimationClip[]>([]);
  const [selectedClipName, setSelectedClipName] = useState<string>('');
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const togglePlayAnimation = () => {
    setIsPlayingAnimation((prev) => !prev);
  };

  return (
    <div className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col ${containerBg} ${className}`}>
      {/* =========================================================================
          STAGE TOP BAR: Header & Mode indicator
          ========================================================================= */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/10 backdrop-blur-md bg-white/40 dark:bg-black/40">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                3D Music Lab Character Stage
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                Three.js / R3F Engine
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Real GLB model viewport & animation clip verification harness
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          {onReturnToEnsemble && (
            <button
              type="button"
              onClick={onReturnToEnsemble}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37] bg-white/60 dark:bg-white/5"
            >
              2D Ensemble Stage
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            <span>WebGL 3D Active</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CENTER 3D CANVAS VIEWPORT
          ========================================================================= */}
      <div className="relative w-full h-[400px] sm:h-[480px] bg-gradient-to-b from-transparent to-black/5 dark:to-black/30">
        <Canvas
          shadows
          camera={{ position: [0, 1.4, 3.8], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <StageDioramaEnvironment theme={theme} />

          {/* Smooth Orbit Camera Controls */}
          <OrbitControls
            enablePan={false}
            minDistance={1.8}
            maxDistance={6.0}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={[0, 1.0, 0]}
            makeDefault
          />

          <Suspense fallback={<Canvas3DLoader />}>
            <Character3DModel
              key={`${modelPath}-${loadKey}`}
              modelUrl={modelPath}
              isPlayingAnimation={isPlayingAnimation}
              selectedClipName={selectedClipName}
              onClipsDetected={handleClipsDetected}
              onModelLoaded={handleModelLoaded}
              onError={handleError}
            />
          </Suspense>
        </Canvas>

        {/* Subtle camera help overlay in corner */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10">
          <Eye className="h-3 w-3" />
          <span>Drag to orbit • Scroll to zoom</span>
        </div>

        {/* Loading Spinner Overlay */}
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
          BOTTOM TEST CONTROLS & ANIMATION INSPECTION PANEL
          ========================================================================= */}
      <div className="relative z-10 p-4 sm:p-5 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#1E1D24]/90 backdrop-blur-md space-y-4">
        {/* Main Test Control Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Play / Stop Animation primary controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayAnimation}
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

          {/* Right: Quick model path selector presets */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">Asset:</span>
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

        {/* Animation Clips Inspector & Metadata Row */}
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
                      if (!isPlayingAnimation) {
                        setIsPlayingAnimation(true);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
                      isSelected
                        ? isPlayingAnimation
                          ? 'bg-[#7567C7] text-white border-[#7567C7] shadow-2xs'
                          : 'bg-[#7567C7]/20 text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/40'
                        : 'bg-white dark:bg-[#26252F] text-[#77747D] dark:text-[#9E9AA6] border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40'
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
                  : 'This GLB model contains no embedded animation clips (static pose). Ready for external animation clips.'}
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
    </div>
  );
};
