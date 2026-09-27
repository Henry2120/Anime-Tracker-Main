import React, { useState, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import {
  Box,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  Camera,
  RefreshCw,
} from 'lucide-react';
import { AppTheme } from '../../types/theme';
import { CharacterModel } from './CharacterModel';

interface CharacterViewerProps {
  theme?: AppTheme;
  modelUrl?: string;
  className?: string;
}

interface ModelMetadata {
  title?: string;
  author?: string;
  version?: string;
  vrmVersion?: string;
  boneCount?: number;
  meshCount?: number;
}

/**
 * Studio Diorama Environment & Lighting
 * Specifically calibrated for VRM MToon shaders and sRGB color representation.
 */
const CharacterStudioLighting: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const pedestalColor = isDark ? '#1C1929' : isSakura ? '#FCE8EE' : '#ECE8E1';
  const rimLightColor = isDark ? '#C7BEF8' : isSakura ? '#F472B6' : '#E8CE9D';
  const stageFloorColor = isDark ? '#120F1D' : isSakura ? '#FAF0F3' : '#F4EFEB';

  return (
    <>
      {/* Balanced Ambient Light for MToon shading */}
      <ambientLight intensity={isDark ? 0.95 : 1.15} />

      {/* Key Directional Light (Top-Right-Front) with soft shadows */}
      <directionalLight
        position={[2.5, 4.5, 3.2]}
        intensity={isDark ? 1.4 : 1.25}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={3.0}
        shadow-camera-bottom={-1.5}
        shadow-bias={-0.0005}
      />

      {/* Fill Light (Soft cool tone) for secondary bounce */}
      <directionalLight
        position={[-3.5, 2.5, 2.0]}
        intensity={0.8}
        color="#E2EEFF"
      />

      {/* Rim / Backlight for anime silhouette separation */}
      <directionalLight
        position={[0, 3.5, -3.2]}
        intensity={1.3}
        color={rimLightColor}
      />

      {/* Circular Studio Pedestal */}
      <group position={[0, -0.005, 0]}>
        <mesh position={[0, -0.04, 0]} receiveShadow>
          <cylinderGeometry args={[1.5, 1.6, 0.08, 48]} />
          <meshStandardMaterial
            color={pedestalColor}
            roughness={0.5}
            metalness={0.1}
          />
        </mesh>
        <mesh position={[0, -0.001, 0]} receiveShadow>
          <torusGeometry args={[1.51, 0.015, 16, 48]} />
          <meshStandardMaterial
            color="#7567C7"
            roughness={0.3}
            metalness={0.5}
          />
        </mesh>
        <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial
            color={stageFloorColor}
            roughness={0.8}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Grounding Contact Shadows */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={isDark ? 0.75 : 0.55}
        scale={3.6}
        blur={1.6}
        far={1.8}
        resolution={512}
      />
    </>
  );
};

export const CharacterViewer: React.FC<CharacterViewerProps> = ({
  theme = 'light',
  modelUrl = '/models/test.vrm',
  className = '',
}) => {
  const [activeUrl, setActiveUrl] = useState<string>(modelUrl);
  const [loadingState, setLoadingState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [cameraPreset, setCameraPreset] = useState<'front' | 'threeQuarter' | 'side' | 'face' | 'fullBody'>('front');

  const controlsRef = useRef<any>(null);

  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerBg = isDark
    ? 'bg-[#14121C] border-[#2E2C37]'
    : isSakura
    ? 'bg-[#FDF6F8] border-[#F2D6DC]'
    : 'bg-[#F8F6F2] border-[#E7E3DF]';

  // Handle successful VRM model load
  const handleModelLoaded = useCallback((vrm: VRM) => {
    setLoadingState('success');
    setErrorMessage(null);

    let meshCount = 0;
    vrm.scene.traverse((obj) => {
      if ((obj as any).isMesh) meshCount++;
    });

    const humanBones = vrm.humanoid?.humanBones;
    const boneCount = humanBones ? Object.keys(humanBones).length : 0;
    const metaAny = vrm.meta as any;

    setMetadata({
      title: metaAny?.name || metaAny?.title || 'VRM Avatar',
      author: Array.isArray(metaAny?.authors) ? metaAny.authors.join(', ') : metaAny?.author || 'Unknown',
      version: metaAny?.version || '1.0',
      vrmVersion: metaAny?.metaVersion || '1.0',
      boneCount,
      meshCount,
    });
  }, []);

  // Handle load error
  const handleModelError = useCallback((err: Error | string) => {
    setLoadingState('error');
    const msg = typeof err === 'string' ? err : err.message;
    setErrorMessage(msg || 'Failed to load VRM model at /models/test.vrm');
  }, []);

  // Set camera angle preset
  const handleSetCameraPreset = (preset: typeof cameraPreset) => {
    setCameraPreset(preset);
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    if (preset === 'front') {
      controls.object.position.set(0, 1.0, 3.6);
      controls.target.set(0, 0.85, 0);
    } else if (preset === 'threeQuarter') {
      controls.object.position.set(1.8, 1.15, 2.5);
      controls.target.set(0, 0.85, 0);
    } else if (preset === 'side') {
      controls.object.position.set(3.0, 0.95, 0);
      controls.target.set(0, 0.85, 0);
    } else if (preset === 'face') {
      controls.object.position.set(0, 1.42, 0.95);
      controls.target.set(0, 1.42, 0);
    } else if (preset === 'fullBody') {
      controls.object.position.set(0, 0.9, 4.0);
      controls.target.set(0, 0.75, 0);
    }
    controls.update();
  };

  const handleReload = () => {
    setLoadingState('loading');
    setErrorMessage(null);
    setLoadProgress(0);
    const base = activeUrl.split('?')[0];
    setActiveUrl(`${base}?t=${Date.now()}`);
  };

  return (
    <div className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col ${containerBg} ${className}`}>
      {/* Top Header Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/10 backdrop-blur-md bg-white/50 dark:bg-black/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25 shrink-0">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                3D Character Viewport
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                VRM MToon Engine
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Target: <code className="font-mono text-[#7567C7] dark:text-[#B9B0F2]">/models/test.vrm</code> • Native VRM textures & materials
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {loadingState === 'loading' && (
            <div className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading VRM...</span>
            </div>
          )}
          {loadingState === 'success' && (
            <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              <span>VRM Active</span>
            </div>
          )}
          {loadingState === 'error' && (
            <button
              type="button"
              onClick={handleReload}
              className="px-2.5 py-1 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry Load</span>
            </button>
          )}
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="relative w-full h-[460px] sm:h-[540px] bg-gradient-to-b from-transparent to-black/5 dark:to-black/30">
        <Canvas
          shadows
          camera={{ position: [0, 1.0, 3.6], fov: 32 }}
          gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <CharacterStudioLighting theme={theme} />

          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={0.5}
            maxDistance={6.0}
            minPolarAngle={Math.PI / 12}
            maxPolarAngle={Math.PI / 2 - 0.02}
            target={[0, 0.85, 0]}
            makeDefault
          />

          <CharacterModel
            url={activeUrl}
            onLoaded={handleModelLoaded}
            onError={handleModelError}
            onProgress={setLoadProgress}
            position={[0, 0, 0]}
            scale={1.0}
          />
        </Canvas>

        {/* Camera Angle Presets (Top Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] shadow-lg">
          <span className="px-2 font-bold font-mono text-[#C4B9FC] text-[10px] flex items-center gap-1">
            <Camera className="h-3 w-3" />
            <span>Angles:</span>
          </span>
          {[
            { id: 'front', label: '1. Front' },
            { id: 'threeQuarter', label: '2. 3/4 View' },
            { id: 'side', label: '3. Side' },
            { id: 'face', label: '4. Face' },
            { id: 'fullBody', label: '5. Full Body' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSetCameraPreset(item.id as any)}
              className={`px-2 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                cameraPreset === item.id
                  ? 'bg-[#7567C7] text-white shadow-xs'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Loading Progress State Overlay */}
        {loadingState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
            <div className="p-5 rounded-3xl bg-white/90 dark:bg-[#1C1A27]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl flex flex-col items-center space-y-3 max-w-xs text-center">
              <div className="p-3 rounded-2xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2]">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  Loading VRM Model
                </h4>
                <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] mt-0.5 font-mono">
                  /models/test.vrm
                </p>
              </div>
              {loadProgress > 0 && (
                <div className="w-full space-y-1">
                  <div className="w-full h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#7567C7] transition-all duration-200"
                      style={{ width: `${Math.min(100, Math.max(10, loadProgress))}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-[#77747D] dark:text-[#9E9AA6]">
                    {Math.round(loadProgress)}% downloaded
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error State Overlay */}
        {loadingState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="p-6 rounded-3xl bg-white/95 dark:bg-[#1C1A27]/95 backdrop-blur-xl border border-red-500/30 shadow-2xl flex flex-col items-center space-y-3 max-w-sm text-center">
              <div className="p-3 rounded-2xl bg-red-500/15 text-red-500">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Unable to Load VRM
              </h4>
              <p className="text-xs text-red-500 dark:text-red-400 font-mono text-left bg-red-500/10 p-2 rounded-xl border border-red-500/20 max-h-24 overflow-y-auto w-full">
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={handleReload}
                className="px-4 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        )}

        {/* Metadata & Verification HUD (Bottom Left) */}
        {loadingState === 'success' && metadata && (
          <div className="absolute bottom-4 left-4 z-10 p-3 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 text-white text-xs max-w-xs shadow-xl space-y-1 pointer-events-none">
            <div className="flex items-center gap-1.5 text-[#C4B9FC] font-bold text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>VRM 3D Model Verified</span>
            </div>
            <div className="text-[10px] text-white/90 space-y-0.5">
              <div>• <strong>Avatar:</strong> {metadata.title}</div>
              <div>• <strong>Bones:</strong> {metadata.boneCount} humanoid bones</div>
              <div>• <strong>Meshes:</strong> {metadata.meshCount} mesh nodes</div>
              <div>• <strong>Materials:</strong> Native MToon sRGB</div>
            </div>
          </div>
        )}

        {/* Interaction Hint (Top Right) */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10">
          <Eye className="h-3 w-3" />
          <span>Left-drag to rotate • Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
};
