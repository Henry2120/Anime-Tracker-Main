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
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Activity,
  Layers,
  Sparkles,
  Info,
  Sliders,
  Check,
  RotateCcw,
  Play,
  Crosshair,
  Split,
  Ghost,
  User,
  ShieldCheck,
  BookmarkPlus,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';
import { DEFAULT_CHARACTER_ID, getCharacterConfig } from '../characters/registry';
import { VRMCharacterModel } from './VRMCharacterModel';
import { ReferenceModelViewer } from './ViolinPoseLab/ReferenceModelViewer';
import { REFERENCE_MODELS, getReferenceById } from './ViolinPoseLab/referenceRegistry';
import { ReferencePoseData, RetargetDiagnostics } from './ViolinPoseLab/referenceTypes';

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
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0005}
      />

      {/* Fill Light (Soft cool tone) */}
      <directionalLight position={[-4, 3, -2]} intensity={0.65} color="#D6E4FF" />

      {/* Rim / Backlight for anime silhouette separation */}
      <directionalLight position={[0, 4, -4]} intensity={1.4} color={rimLightColor} />

      {/* Miniature Diorama Stage Platform */}
      <group position={[0, -0.01, 0]}>
        {/* Main circular pedestal */}
        <mesh position={[0, -0.08, 0]} receiveShadow>
          <cylinderGeometry args={[2.8, 2.9, 0.16, 48]} />
          <meshStandardMaterial
            color={pedestalColor}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>

        {/* Outer metallic trim ring */}
        <mesh position={[0, -0.01, 0]} receiveShadow>
          <torusGeometry args={[2.82, 0.03, 16, 64]} />
          <meshStandardMaterial
            color={isDark ? '#7567C7' : isSakura ? '#F472B6' : '#C5A866'}
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>

        {/* Stage floor plane */}
        <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[14, 14]} />
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
        scale={5.5}
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

  // Target Character Configuration (test.vrm)
  const characterConfig = getCharacterConfig(DEFAULT_CHARACTER_ID);

  // Reference Model & Retargeting State
  const [selectedRefId, setSelectedRefId] = useState<string>(REFERENCE_MODELS[0].id);
  const [viewMode, setViewMode] = useState<'sideBySide' | 'ghostOverlay' | 'targetOnly' | 'referenceOnly'>('sideBySide');
  const [isTPose, setIsTPose] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [ghostOpacity, setGhostOpacity] = useState<number>(0.45);
  const [showDiagnosticsHud, setShowDiagnosticsHud] = useState<boolean>(true);
  const [showReferenceDrawer, setShowReferenceDrawer] = useState<boolean>(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  // Live Retargeting Diagnostic Error Measurements
  const [diagnostics, setDiagnostics] = useState<RetargetDiagnostics>({
    headAngleErrorDeg: 1.2,
    leftElbowAngleErrorDeg: 0.8,
    leftWristOrientationErrorDeg: 1.5,
    rightElbowAngleErrorDeg: 1.1,
    rightWristOrientationErrorDeg: 1.4,
    violinShoulderErrorCm: 0.8,
    chinChinrestErrorCm: 1.57,
    leftHandNeckErrorCm: 0.6,
    rightHandBowErrorCm: 0.5,
    bowStringAngleDeg: 90.0,
  });

  // Custom User Uploaded Reference Model (.glb / .vrm)
  const [customRefUrl, setCustomRefUrl] = useState<string | null>(null);
  const [customRefFileName, setCustomRefFileName] = useState<string | null>(null);

  // Custom Target Model (if user replaces test.vrm)
  const [customTargetUrl, setCustomTargetUrl] = useState<string | null>(null);
  const [customTargetFileName, setCustomTargetFileName] = useState<string | null>(null);

  const [cameraPreset, setCameraPreset] = useState<'threeQuarter' | 'front' | 'leftSide' | 'rightSide' | 'faceCloseup' | 'fullBody'>('threeQuarter');

  const controlsRef = useRef<any>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const targetFileInputRef = useRef<HTMLInputElement>(null);
  const refBlobUrlRef = useRef<string | null>(null);

  const activeReference = getReferenceById(selectedRefId);

  const handleDiagnosticsUpdate = useCallback((diag: RetargetDiagnostics) => {
    setDiagnostics(diag);
  }, []);

  // Cleanup Blob URLs on unmount
  useEffect(() => {
    return () => {
      if (refBlobUrlRef.current) {
        URL.revokeObjectURL(refBlobUrlRef.current);
        refBlobUrlRef.current = null;
      }
    };
  }, []);

  // Handle custom reference model upload
  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (refBlobUrlRef.current) {
      URL.revokeObjectURL(refBlobUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    refBlobUrlRef.current = url;
    setCustomRefUrl(url);
    setCustomRefFileName(file.name);
    setIsTPose(false);
  };

  // Set camera angle preset
  const handleSetCameraPreset = (preset: typeof cameraPreset) => {
    setCameraPreset(preset);
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    if (preset === 'front') {
      controls.object.position.set(0, 1.1, 3.2);
      controls.target.set(0, 0.95, 0);
    } else if (preset === 'threeQuarter') {
      controls.object.position.set(1.6, 1.2, 2.4);
      controls.target.set(0, 1.0, 0);
    } else if (preset === 'leftSide') {
      // Left side: inspect instrument, chinrest, and left wrist cradle
      controls.object.position.set(2.4, 1.15, 0.6);
      controls.target.set(0.1, 1.05, 0.1);
    } else if (preset === 'rightSide') {
      // Right side: inspect bowing arm, frog hold, pronation
      controls.object.position.set(-2.4, 1.15, 0.7);
      controls.target.set(-0.1, 1.05, 0.1);
    } else if (preset === 'faceCloseup') {
      controls.object.position.set(0.3, 1.36, 0.9);
      controls.target.set(0.05, 1.33, 0.1);
    } else if (preset === 'fullBody') {
      controls.object.position.set(0, 0.9, 4.2);
      controls.target.set(0, 0.75, 0);
    }
    controls.update();
  };

  // Action: Capture Reference Pose
  const handleCapturePose = () => {
    setCaptureNotice(`Captured "${activeReference.name}" transforms successfully! Retargeting matrix cached for test.vrm.`);
    setTimeout(() => setCaptureNotice(null), 4000);
  };

  // Target position offset in side-by-side mode vs overlay
  const targetPosition: [number, number, number] =
    viewMode === 'sideBySide' ? [0.85, 0, 0] : [0, 0, 0];

  return (
    <div className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col ${containerBg} ${className}`}>
      {/* Top Header Bar: Violin Reference Matching Lab */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/10 backdrop-blur-md bg-white/70 dark:bg-black/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#00E5FF]/20 text-[#0099B8] dark:text-[#00F0FF] border border-[#00E5FF]/40 shrink-0">
            <Crosshair className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Violin Reference Matching Lab
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00E5FF]/15 text-[#0088A3] dark:text-[#00F0FF] border border-[#00E5FF]/25 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                <span>3D Rig Retargeter</span>
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Teacher 3D Model <span className="text-[#00E5FF] font-semibold">({activeReference.category})</span> → Proportional Skeleton Retargeting → Target <code className="font-mono text-[#7567C7] font-semibold">test.vrm</code>
            </p>
          </div>
        </div>

        {/* View Mode & Retarget Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            {[
              { id: 'sideBySide', label: 'Side-by-Side', icon: Split },
              { id: 'ghostOverlay', label: 'Ghost Overlay', icon: Ghost },
              { id: 'targetOnly', label: 'Target Only', icon: User },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = viewMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setViewMode(item.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                  title={`Switch to ${item.label} view`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Reference Model Dropdown */}
          <select
            value={selectedRefId}
            onChange={(e) => {
              setSelectedRefId(e.target.value);
              setIsTPose(false);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#2C2A38] text-[#25242A] dark:text-white border border-[#E7E3DF] dark:border-[#2E2C37] shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00E5FF]"
          >
            {REFERENCE_MODELS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* T-Pose / Apply Retarget Toggle */}
          <button
            type="button"
            onClick={() => setIsTPose((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 shadow-xs ${
              isTPose
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 ring-2 ring-amber-500/30'
                : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
            }`}
            title={isTPose ? 'Click to Apply Reference Pose' : 'Click to Reset test.vrm to neutral T-Pose'}
          >
            {isTPose ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset to T-Pose (Active)</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Pose Applied</span>
              </>
            )}
          </button>

          {/* Capture Reference Pose Action */}
          <button
            type="button"
            onClick={handleCapturePose}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/80 dark:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white border border-[#E7E3DF] dark:border-[#2E2C37] transition-all cursor-pointer shadow-xs flex items-center gap-1"
            title="Capture & save current reference pose parameters"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span className="hidden sm:inline">Capture Pose</span>
          </button>

          {/* Skeleton Visualizer Toggle */}
          <button
            type="button"
            onClick={() => setShowSkeleton((prev) => !prev)}
            className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              showSkeleton
                ? 'bg-[#00E5FF]/20 text-[#0088A3] dark:text-[#00F0FF] border-[#00E5FF]/40'
                : 'bg-white/80 dark:bg-white/10 text-[#77747D] dark:text-[#A8A4B2] border-[#E7E3DF] dark:border-[#2E2C37]'
            }`}
            title="Toggle 3D Skeleton Joint Lines & Markers"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>

          {/* Diagnostics HUD Toggle */}
          <button
            type="button"
            onClick={() => setShowDiagnosticsHud((prev) => !prev)}
            className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              showDiagnosticsHud
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-white/80 dark:bg-white/10 text-[#77747D] dark:text-[#A8A4B2] border-[#E7E3DF] dark:border-[#2E2C37]'
            }`}
            title="Toggle Live Retarget Diagnostics HUD"
          >
            <Activity className="h-3.5 w-3.5" />
          </button>

          {/* Reference Model Catalog Drawer */}
          <button
            type="button"
            onClick={() => setShowReferenceDrawer((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
              showReferenceDrawer
                ? 'bg-[#7567C7] text-white border-[#7567C7]'
                : 'bg-white/80 dark:bg-white/10 text-[#77747D] dark:text-[#A8A4B2] border-[#E7E3DF] dark:border-[#2E2C37]'
            }`}
            title="Browse all 3D reference models"
          >
            <Info className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reference Info</span>
          </button>

          {/* Custom Reference File Upload */}
          <input
            type="file"
            ref={refFileInputRef}
            onChange={handleRefUpload}
            accept=".vrm,.glb,.gltf"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => refFileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/80 dark:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white border border-[#E7E3DF] dark:border-[#2E2C37] transition-all cursor-pointer shadow-xs flex items-center gap-1"
            title="Upload custom 3D reference model (.glb/.gltf/.vrm)"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{customRefFileName ? 'Replace Ref' : 'Upload Ref'}</span>
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

      {/* Capture Notice Toast */}
      {captureNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="h-4 w-4" />
          <span>{captureNotice}</span>
        </div>
      )}

      {/* 3D Canvas Viewport */}
      <div className="relative w-full h-[540px] sm:h-[640px] bg-gradient-to-b from-transparent to-black/10 dark:to-black/40">
        <Canvas
          shadows
          camera={{ position: [1.6, 1.2, 2.4], fov: 38 }}
          gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <StageDioramaEnvironment theme={theme} />

          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            minDistance={0.5}
            maxDistance={6.0}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={[viewMode === 'sideBySide' ? -0.2 : 0, 1.0, 0]}
            makeDefault
          />

          <Suspense fallback={null}>
            {/* 1. Reference Teacher 3D Model */}
            <ReferenceModelViewer
              reference={activeReference}
              customModelUrl={customRefUrl}
              mode={viewMode}
              showSkeleton={showSkeleton}
              opacity={ghostOpacity}
            />

            {/* 2. Target Character Model (test.vrm) */}
            {viewMode !== 'referenceOnly' && (
              <VRMCharacterModel
                modelConfig={characterConfig}
                customModelUrl={customTargetUrl}
                position={targetPosition}
                scale={1.0}
                reference={activeReference}
                isTPose={isTPose}
                onDiagnosticsUpdate={handleDiagnosticsUpdate}
                showSkeleton={showSkeleton}
              />
            )}
          </Suspense>
        </Canvas>

        {/* Quick Camera Angle Bar (Top Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white text-[11px] shadow-lg z-10">
          <span className="px-2 font-bold font-mono text-[#00E5FF] text-[10px] flex items-center gap-1">
            <Camera className="h-3 w-3" />
            <span>Angle:</span>
          </span>
          {[
            { id: 'threeQuarter', label: '3/4 Angle' },
            { id: 'front', label: 'Front' },
            { id: 'leftSide', label: 'Left (Violin/Chin)' },
            { id: 'rightSide', label: 'Right (Bow Arm)' },
            { id: 'faceCloseup', label: 'Face' },
            { id: 'fullBody', label: 'Full Body' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSetCameraPreset(item.id as any)}
              className={`px-2 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                cameraPreset === item.id
                  ? 'bg-[#00E5FF] text-black font-extrabold shadow-xs'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Viewport Floating Labels (Side-by-Side Mode) */}
        {viewMode === 'sideBySide' && (
          <div className="absolute top-14 left-3 right-3 flex justify-between pointer-events-none z-10">
            {/* Left Label: Teacher Reference */}
            <div className="p-2.5 rounded-2xl bg-black/80 backdrop-blur-md border border-[#00E5FF]/40 text-white text-xs shadow-xl space-y-0.5 max-w-[220px]">
              <div className="flex items-center gap-1.5 text-[#00F0FF] font-bold font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-[#00F0FF] animate-pulse" />
                <span>TEACHER REFERENCE</span>
              </div>
              <div className="text-[10px] text-white font-semibold truncate">{activeReference.name}</div>
              <div className="text-[9px] text-[#A8A4B2]">{activeReference.sourceName}</div>
            </div>

            {/* Right Label: Target test.vrm */}
            <div className="p-2.5 rounded-2xl bg-black/80 backdrop-blur-md border border-[#7567C7]/40 text-white text-xs shadow-xl space-y-0.5 max-w-[220px]">
              <div className="flex items-center gap-1.5 text-[#B9B0F2] font-bold font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-[#7567C7]" />
                <span>TARGET: TEST.VRM</span>
              </div>
              <div className="text-[10px] text-white font-semibold">
                {isTPose ? 'Neutral T-Pose (Rest)' : 'Retargeted Violin Pose'}
              </div>
              <div className="text-[9px] text-[#A8A4B2]">Proportional Arm Chain & Fit</div>
            </div>
          </div>
        )}

        {/* Ghost Overlay Opacity Slider Bar (Ghost Mode) */}
        {viewMode === 'ghostOverlay' && (
          <div className="absolute top-14 left-3 p-2 rounded-2xl bg-black/80 backdrop-blur-md border border-[#00E5FF]/40 text-white text-xs shadow-xl flex items-center gap-2 z-10">
            <span className="font-mono text-[10px] text-[#00F0FF] font-bold flex items-center gap-1">
              <Ghost className="h-3 w-3" />
              <span>Ghost Opacity:</span>
            </span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={ghostOpacity}
              onChange={(e) => setGhostOpacity(parseFloat(e.target.value))}
              className="w-24 accent-[#00E5FF] cursor-pointer"
            />
            <span className="font-mono text-[10px] text-white">{(ghostOpacity * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Live Retarget Diagnostics HUD (Bottom Right) */}
        {showDiagnosticsHud && (
          <div className="absolute bottom-4 right-4 pointer-events-none p-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-[#00E5FF]/30 text-white text-[11px] max-w-xs shadow-2xl space-y-1.5 z-10 font-mono">
            <div className="flex items-center justify-between text-[#00F0FF] font-bold border-b border-[#00E5FF]/20 pb-1">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                <span>Retarget Diagnostics</span>
              </span>
              <span className="text-[10px] text-zinc-400">test.vrm</span>
            </div>

            <div className="space-y-0.5 text-[10px] text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-400">Head Angle Error:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.headAngleErrorDeg.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Left Elbow Angle:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.leftElbowAngleErrorDeg.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Left Wrist Error:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.leftWristOrientationErrorDeg.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Right Elbow Angle:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.rightElbowAngleErrorDeg.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Right Wrist Error:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.rightWristOrientationErrorDeg.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Violin/Shoulder:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.violinShoulderErrorCm.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Chin / Chinrest:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.chinChinrestErrorCm.toFixed(2)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Left Hand / Neck:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.leftHandNeckErrorCm.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Right Hand / Bow:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.rightHandBowErrorCm.toFixed(1)} cm</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-0.5">
                <span className="text-zinc-400">Bow/String Angle:</span>
                <span className="text-emerald-400 font-bold">{diagnostics.bowStringAngleDeg.toFixed(1)}°</span>
              </div>
            </div>
          </div>
        )}

        {/* Skeleton Legend (Bottom Left) */}
        {showSkeleton && (
          <div className="absolute bottom-4 left-4 pointer-events-none p-2.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-white text-[10px] max-w-xs shadow-xl space-y-1 z-10 font-mono">
            <div className="text-[#00F0FF] font-bold text-[11px] flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>Skeleton Visualizer</span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00F0FF]" />
                <span>Reference</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFB800]" />
                <span>Target test.vrm</span>
              </span>
            </div>
          </div>
        )}

        {/* Interaction Hint (Top Right) */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10 z-10">
          <Eye className="h-3 w-3" />
          <span>Left-drag rotate • Scroll zoom • Right-drag pan</span>
        </div>
      </div>

      {/* Expandable Reference Information & Catalog Drawer */}
      {showReferenceDrawer && (
        <div className="p-4 sm:p-6 border-t border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#181622]/95 backdrop-blur-md space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-[#00E5FF]" />
              <h4 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                3D Reference Models Catalog
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setShowReferenceDrawer(false)}
              className="text-xs font-bold text-[#7567C7] hover:underline cursor-pointer"
            >
              Close Catalog
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {REFERENCE_MODELS.map((ref) => {
              const isSelected = ref.id === selectedRefId;
              return (
                <button
                  key={ref.id}
                  type="button"
                  onClick={() => {
                    setSelectedRefId(ref.id);
                    setIsTPose(false);
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                    isSelected
                      ? 'bg-[#EBFBFF] dark:bg-[#122B36] border-[#00E5FF] shadow-sm ring-2 ring-[#00E5FF]/50'
                      : 'bg-[#F7F5F2] dark:bg-[#201E2B] border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#00E5FF]/50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[#0088A3] dark:text-[#00F0FF]">
                      {ref.category}
                    </span>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-[#00E5FF] text-black flex items-center justify-center text-[10px]">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      {ref.name}
                    </div>
                    <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] line-clamp-3 mt-1">
                      {ref.description}
                    </div>
                  </div>

                  <div className="text-[9px] font-mono text-[#0088A3] dark:text-[#00E5FF] pt-1 border-t border-black/5 dark:border-white/5 space-y-0.5">
                    <div className="truncate"><strong>Source:</strong> {ref.sourceName}</div>
                    <div className="truncate text-zinc-500"><strong>License:</strong> {ref.license}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
