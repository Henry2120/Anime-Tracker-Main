import React, { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import {
  Eye,
  Box,
  Camera,
  Upload,
  FileCode2,
  AlertCircle,
  CheckCircle2,
  Music2,
  User,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';
import { DEFAULT_CHARACTER_ID, getCharacterConfig } from '../characters/registry';
import { VRMCharacterModel } from './VRMCharacterModel';
import { CharacterPerformanceMode } from './ViolinPerformance';

interface MusicLab3DStageProps {
  theme?: AppTheme;
  className?: string;
  onReturnToEnsemble?: () => void;
}

/**
 * Stage Diorama Environment
 * Studio 3-point lighting calibrated for anime cel-shading + soft rim backlight.
 */
const StageDioramaEnvironment: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const pedestalColor = isDark ? '#1C1929' : isSakura ? '#FCE8EE' : '#ECE8E1';
  const rimLightColor = isDark ? '#BCA8F8' : isSakura ? '#F472B6' : '#E8CE9D';
  const stageFloorColor = isDark ? '#120F1D' : isSakura ? '#FAF0F3' : '#F4EFEB';

  return (
    <>
      {/* 3-Point Studio Lighting */}
      <ambientLight intensity={isDark ? 0.85 : 1.05} />

      {/* Key Light (Top-Right-Front) */}
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
      <directionalLight position={[-4, 3, -2]} intensity={0.6} color="#D6E4FF" />

      {/* Rim / Backlight for anime silhouette separation */}
      <directionalLight position={[0, 4, -4]} intensity={1.4} color={rimLightColor} />

      {/* Miniature Diorama Stage Platform */}
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

        {/* Stage floor plane */}
        <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial
            color={stageFloorColor}
            roughness={0.8}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Grounding Contact Shadow */}
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

export const MusicLab3DStage: React.FC<MusicLab3DStageProps> = ({
  theme = 'light',
  className = '',
  onReturnToEnsemble,
}) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerBg = isDark
    ? 'bg-[#14121C] border-[#2E2C37]'
    : isSakura
    ? 'bg-[#FDF6F8] border-[#F2D6DC]'
    : 'bg-[#F8F6F2] border-[#E7E3DF]';

  // Character Configuration State
  const characterConfig = getCharacterConfig(DEFAULT_CHARACTER_ID);

  // Explicit Performance Mode: 'normal' (default T-pose) vs 'violin'
  const [performanceMode, setPerformanceMode] = useState<CharacterPerformanceMode>('normal');

  // Custom user uploaded VRM/GLB model URL
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<{ isVRM: boolean; vrmVersion?: string; boneCount?: number } | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<'front' | 'threeQuarter' | 'side' | 'faceCloseup' | 'fullBody'>('threeQuarter');

  const controlsRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Stable callback handlers
  const handleModelLoaded = useCallback((info: { isVRM: boolean; vrmVersion?: string; boneCount?: number }) => {
    setModelStatus(info);
    setLoadNotice(null);
  }, []);

  const handleModelError = useCallback((msg: string) => {
    setLoadNotice(msg);
  }, []);

  // Cleanup Blob URLs on replacement or unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Handle local VRM / GLB file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setCustomModelUrl(url);
    setCustomFileName(file.name);
    setLoadNotice(null);
  };

  // Set camera angle preset
  const handleSetCameraPreset = (preset: typeof cameraPreset) => {
    setCameraPreset(preset);
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    if (preset === 'front') {
      controls.object.position.set(0, 1.1, 3.0);
      controls.target.set(0, 0.9, 0);
    } else if (preset === 'threeQuarter') {
      controls.object.position.set(1.6, 1.15, 2.4);
      controls.target.set(-0.05, 0.95, 0);
    } else if (preset === 'side') {
      controls.object.position.set(2.8, 1.0, 0.2);
      controls.target.set(0, 0.9, 0);
    } else if (preset === 'faceCloseup') {
      controls.object.position.set(0.2, 1.38, 0.9);
      controls.target.set(-0.05, 1.35, 0);
    } else if (preset === 'fullBody') {
      controls.object.position.set(0, 0.9, 3.8);
      controls.target.set(0, 0.75, 0);
    }
    controls.update();
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
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20 flex items-center gap-1">
                <FileCode2 className="h-3 w-3" />
                <span>{modelStatus?.isVRM ? `VRM ${modelStatus.vrmVersion || '1.0'}` : 'VRM Pipeline'}</span>
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              {performanceMode === 'violin'
                ? 'Violin Performance Rig • Procedural Bowing & Fingering'
                : 'Normal Model Viewer • Authored T-Pose'}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Two Explicit State Buttons: Normal (T-Pose) vs Violin Performance */}
          <div className="flex items-center p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setPerformanceMode('normal')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                performanceMode === 'normal'
                  ? 'bg-white dark:bg-[#2C2A38] text-[#25242A] dark:text-white shadow-xs border border-black/5 dark:border-white/10'
                  : 'text-[#77747D] dark:text-[#A8A4B2] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Normal</span>
            </button>
            <button
              type="button"
              onClick={() => setPerformanceMode('violin')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                performanceMode === 'violin'
                  ? 'bg-[#7567C7] text-white shadow-xs'
                  : 'text-[#77747D] dark:text-[#A8A4B2] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <Music2 className="h-3.5 w-3.5" />
              <span>Violin Performance</span>
            </button>
          </div>

          {/* External VRM / GLB File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".vrm,.glb,.gltf"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/80 dark:bg-white/10 hover:bg-[#7567C7]/15 text-[#25242A] dark:text-[#F4F2F7] border border-[#E7E3DF] dark:border-[#2E2C37] transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
            title="Import custom VRM or GLB character model"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{customFileName ? 'Replace VRM/GLB' : 'Load VRM / GLB'}</span>
          </button>

          {onReturnToEnsemble && (
            <button
              type="button"
              onClick={onReturnToEnsemble}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37] bg-white/60 dark:bg-white/5"
            >
              2D Ensemble
            </button>
          )}
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="relative w-full h-[480px] sm:h-[560px] bg-gradient-to-b from-transparent to-black/5 dark:to-black/30">
        <Canvas
          shadows
          camera={{ position: [1.6, 1.15, 2.4], fov: 38 }}
          gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <StageDioramaEnvironment theme={theme} />

          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            minDistance={0.6}
            maxDistance={5.5}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={[-0.05, 0.95, 0]}
            makeDefault
          />

          <Suspense fallback={null}>
            <VRMCharacterModel
              modelConfig={characterConfig}
              customModelUrl={customModelUrl}
              position={[0, 0, 0]}
              scale={1.0}
              mode={performanceMode}
              onModelLoaded={handleModelLoaded}
              onError={handleModelError}
            />
          </Suspense>
        </Canvas>

        {/* Quick Camera Angle Bar (Top Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] shadow-lg z-10">
          <span className="px-2 font-bold font-mono text-[#C4B9FC] text-[10px] flex items-center gap-1">
            <Camera className="h-3 w-3" />
            <span>Camera:</span>
          </span>
          {[
            { id: 'threeQuarter', label: '3/4 Angle' },
            { id: 'front', label: 'Front' },
            { id: 'side', label: 'Side' },
            { id: 'faceCloseup', label: 'Face' },
            { id: 'fullBody', label: 'Full Body' },
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

        {/* Model Asset Notice / Upload Prompt */}
        {loadNotice && !customModelUrl && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 p-3.5 rounded-2xl bg-black/80 backdrop-blur-md border border-amber-500/30 text-white text-xs max-w-md shadow-2xl space-y-1.5 text-center z-10">
            <div className="flex items-center justify-center gap-1.5 text-amber-400 font-bold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Character Model Asset Ready</span>
            </div>
            <p className="text-[11px] text-white/80">
              The loader is listening at <code className="font-mono text-amber-300 bg-white/10 px-1 py-0.5 rounded">public/models/test.vrm</code>.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-[11px] transition-all cursor-pointer shadow-xs inline-flex items-center gap-1"
            >
              <Upload className="h-3 w-3" />
              <span>Select VRM or GLB file from disk</span>
            </button>
          </div>
        )}

        {/* Model Info HUD (Bottom Left) */}
        <div className="absolute bottom-4 left-4 pointer-events-none p-3 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 text-white text-xs max-w-xs shadow-xl space-y-1 z-10">
          <div className="flex items-center gap-1.5 text-[#C4B9FC] font-bold text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Character Viewport Status</span>
          </div>
          <div className="text-[10px] text-white/80 space-y-0.5">
            <div>• <strong className="text-white">Source:</strong> {customFileName || 'Default (test.vrm)'}</div>
            <div>• <strong className="text-white">Format:</strong> {modelStatus?.isVRM ? `VRM (${modelStatus.vrmVersion || '1.0'})` : customFileName ? 'GLB / GLTF' : 'VRM'}</div>
            {modelStatus?.boneCount !== undefined && (
              <div>• <strong className="text-white">Humanoid Bones:</strong> {modelStatus.boneCount}</div>
            )}
            <div>
              • <strong className="text-white">State:</strong>{' '}
              <span className={performanceMode === 'violin' ? 'text-emerald-400 font-bold' : 'text-zinc-300 font-medium'}>
                {performanceMode === 'violin' ? 'Violin Performance' : 'Normal / T-Pose'}
              </span>
            </div>
          </div>
        </div>

        {/* Interaction Hint (Top Right) */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10 z-10">
          <Eye className="h-3 w-3" />
          <span>Left-drag to rotate • Scroll to zoom • Right-drag to pan</span>
        </div>
      </div>
    </div>
  );
};
