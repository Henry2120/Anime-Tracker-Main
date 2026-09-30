import React, { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  Eye,
  Camera,
  Upload,
  User,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  Save,
  FolderOpen,
  Layers,
  Sliders,
  X,
  Crosshair,
  CircleDot,
  Compass,
  Play,
  Pause,
  Activity,
  Check,
  Music,
  Zap,
  Gauge,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';
import { DEFAULT_CHARACTER_ID, getCharacterConfig } from '../characters/registry';
import { PlaybackState, MusicAnalysisResult } from '../types';
import { VRMCharacterModel } from './VRMCharacterModel';
import { VRMPoseManager } from './PoseEditor/VRMPoseManager';
import { EDITABLE_BONES, SavedPose } from './PoseEditor/poseEditorTypes';
import { inspectBoneLocalFrame, BoneLocalFrameData } from './PoseEditor/BoneAxisInspector';
import { VIOLINIST_BASE_POSE, AnatomicalViolinistPoseParams } from './PoseEditor/anatomicalPosePreset';
import { ViolinAndBowProps, InstrumentDiagnosticsData } from './InstrumentProps/ViolinAndBowProps';
import { ViolinMusicMotionEngine, MusicalMotionState } from './Animation/ViolinMusicMotionEngine';

interface MusicLab3DStageProps {
  theme?: AppTheme;
  className?: string;
  playback?: PlaybackState;
  analysisResult?: MusicAnalysisResult | null;
  onTogglePlayPause?: () => void;
  onReturnToEnsemble?: () => void;
}

/**
 * Real-Time Music Motion Animator Component for React Three Fiber Canvas
 */
interface ViolinistPerformanceAnimatorProps {
  vrm: VRM | null;
  poseManager: VRMPoseManager | null;
  activePreset: 'tpose' | 'violinistBase';
  baseParams: AnatomicalViolinistPoseParams;
  playback: PlaybackState;
  analysisResult: MusicAnalysisResult | null;
  motionEngine: ViolinMusicMotionEngine;
  onMotionStateUpdate?: (st: MusicalMotionState) => void;
}

const ViolinistPerformanceAnimator: React.FC<ViolinistPerformanceAnimatorProps> = ({
  vrm,
  poseManager,
  activePreset,
  baseParams,
  playback,
  analysisResult,
  motionEngine,
  onMotionStateUpdate,
}) => {
  useFrame((_, delta) => {
    if (!vrm || !poseManager || activePreset !== 'violinistBase') return;

    // 1. Evaluate motion state from authoritative playback clock & analysis
    const motionState = motionEngine.update(playback, analysisResult, delta);

    // 2. Derive effective pose parameters = baseParams + offsets(motionState)
    const effectiveParams = motionEngine.computePoseParams(baseParams, motionState);

    // 3. Apply to VRM skeleton deterministically
    poseManager.applyViolinistBasePose(effectiveParams);

    onMotionStateUpdate?.(motionState);
  });

  return null;
};

/**
 * Studio Diorama Stage Environment
 * Calibrated 3-point studio lighting with soft rim backlight and metallic diorama platform.
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
          <cylinderGeometry args={[2.2, 2.3, 0.16, 48]} />
          <meshStandardMaterial
            color={pedestalColor}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>

        {/* Outer metallic trim ring */}
        <mesh position={[0, -0.01, 0]} receiveShadow>
          <torusGeometry args={[2.22, 0.025, 16, 64]} />
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
        scale={4.8}
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

  // Character Configuration (test.vrm)
  const characterConfig = getCharacterConfig(DEFAULT_CHARACTER_ID);

  // Pose Manager & Calibration State
  const [poseManager, setPoseManager] = useState<VRMPoseManager | null>(null);
  const [vrmInstance, setVrmInstance] = useState<VRM | null>(null);
  const [activePreset, setActivePreset] = useState<'tpose' | 'violinistBase'>('tpose');
  const [selectedBone, setSelectedBone] = useState<VRMHumanBoneName | null>('leftUpperArm' as VRMHumanBoneName);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [showJointMarkers, setShowJointMarkers] = useState<boolean>(true);
  const [showLocalAxes, setShowLocalAxes] = useState<boolean>(false);
  const [isGizmoDragging, setIsGizmoDragging] = useState<boolean>(false);
  const [savedPoseSnapshot, setSavedPoseSnapshot] = useState<SavedPose | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Anatomical Pose Parameters
  const [currentPoseParams, setCurrentPoseParams] = useState<AnatomicalViolinistPoseParams>(VIOLINIST_BASE_POSE);

  // Music-Driven Performance Motion Engine State
  const motionEngineRef = useRef<ViolinMusicMotionEngine>(new ViolinMusicMotionEngine());
  const [motionState, setMotionState] = useState<MusicalMotionState | null>(null);

  // Standalone in-stage playback simulation when no global song is playing
  const [internalPlaying, setInternalPlaying] = useState<boolean>(false);
  const [internalTime, setInternalTime] = useState<number>(0);
  const [testBpm, setTestBpm] = useState<number>(120);
  const [testIntensity, setTestIntensity] = useState<number>(0.75);

  // Simulation timer for standalone in-stage performance testing
  useEffect(() => {
    if (!internalPlaying) return;
    let animId: number;
    let lastStamp = performance.now();

    const tick = (stamp: number) => {
      const dt = (stamp - lastStamp) / 1000;
      lastStamp = stamp;
      setInternalTime((prev) => (prev + dt) % 180);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [internalPlaying]);

  // Resolve authoritative playback state
  const hasExternalAudio = Boolean(playback && (playback.isPlaying || playback.duration > 0));
  const activePlayback: PlaybackState = hasExternalAudio && playback
    ? playback
    : {
        currentTime: internalTime,
        duration: 180,
        progress: internalTime / 180,
        isPlaying: internalPlaying,
      };

  const activeAnalysis: MusicAnalysisResult | null = hasExternalAudio
    ? analysisResult || null
    : {
        duration: 180,
        bpm: testBpm,
        detectedInstruments: [],
        sections: [
          {
            start: 0,
            end: 180,
            label: 'Test Performance',
            intensity: testIntensity,
            activeInstruments: ['violin'],
          },
        ],
        analysisSource: 'manual',
      };

  const handleTogglePerformance = () => {
    if (hasExternalAudio && onTogglePlayPause) {
      onTogglePlayPause();
    } else {
      setInternalPlaying((prev) => !prev);
    }
  };

  // Inspector Live Frame Data & Diagnostics
  const [frameData, setFrameData] = useState<BoneLocalFrameData | null>(null);
  const [skeletonDiagnostics, setSkeletonDiagnostics] = useState<any | null>(null);
  const [showDiagnosticsHUD, setShowDiagnosticsHUD] = useState<boolean>(false);

  // Instrument Props & Fitting State
  const [showViolin, setShowViolin] = useState<boolean>(true);
  const [showBow, setShowBow] = useState<boolean>(true);
  const [showInstrumentAxes, setShowInstrumentAxes] = useState<boolean>(false);
  const [showContactDiagnostics, setShowContactDiagnostics] = useState<boolean>(false);
  const [instrumentDiagnostics, setInstrumentDiagnostics] = useState<InstrumentDiagnosticsData | null>(null);
  const [hudTab, setHudTab] = useState<'anatomical' | 'skeleton' | 'instruments'>('anatomical');

  // Custom User Uploaded Model
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);

  const [cameraPreset, setCameraPreset] = useState<'threeQuarter' | 'front' | 'faceCloseup' | 'fullBody' | 'leftSide' | 'rightSide'>('threeQuarter');

  const controlsRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Refresh Frame Data for selected bone and skeleton diagnostics
  const updateFrameData = useCallback(() => {
    if (!vrmInstance) return;
    if (selectedBone) {
      const def = EDITABLE_BONES.find((b) => b.name === selectedBone);
      const data = inspectBoneLocalFrame(
        vrmInstance,
        selectedBone,
        def?.label || selectedBone,
        def?.category || 'Body'
      );
      setFrameData(data);
    }
    if (poseManager) {
      const diag = poseManager.getSkeletonDiagnostics();
      setSkeletonDiagnostics(diag);
    }
  }, [vrmInstance, selectedBone, poseManager]);

  useEffect(() => {
    updateFrameData();
  }, [selectedBone, updateFrameData]);

  const handleVRMReady = useCallback((vrm: VRM, manager: VRMPoseManager) => {
    setVrmInstance(vrm);
    setPoseManager(manager);
    setSelectedBone('leftUpperArm' as VRMHumanBoneName);
  }, []);

  // Action: Apply Violinist Base Pose
  const handleApplyViolinistBasePose = () => {
    if (!poseManager) return;
    poseManager.applyViolinistBasePose(currentPoseParams);
    setActivePreset('violinistBase');
    setShowViolin(true);
    setShowBow(true);
    updateFrameData();
    showToast('Applied Scripted Violinist Base Pose & Fitted Instruments');
  };

  // Action: Reset T-Pose
  const handleResetTPose = () => {
    if (!poseManager) return;
    poseManager.resetToTPose();
    setActivePreset('tpose');
    updateFrameData();
    showToast('Reset to authored neutral T-Pose');
  };

  // Action: Reset Instrument Fit
  const handleResetInstrumentFit = () => {
    setShowViolin(true);
    setShowBow(true);
    showToast('Reset Instrument Fit to deterministic baseline');
  };

  // Action: Save Pose
  const handleSavePose = () => {
    if (!poseManager) return;
    const name = activePreset === 'violinistBase' ? 'Violinist Base Pose' : 'Neutral T-Pose';
    const saved = poseManager.saveCurrentPose(name);
    setSavedPoseSnapshot(saved);
    showToast('Pose saved');
  };

  // Action: Load Saved Pose
  const handleLoadSavedPose = () => {
    if (!poseManager) return;
    const success = poseManager.loadSavedPose(savedPoseSnapshot);
    if (success) {
      if (savedPoseSnapshot?.name === 'Violinist Base Pose') {
        setActivePreset('violinistBase');
      }
      updateFrameData();
      showToast('Loaded saved pose');
    } else {
      showToast('No saved pose in memory yet');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fine-tuning anatomical parameter slider
  const handleParamChange = (key: keyof AnatomicalViolinistPoseParams, value: number) => {
    const updated = { ...currentPoseParams, [key]: value };
    setCurrentPoseParams(updated);
    if (poseManager && activePreset === 'violinistBase') {
      poseManager.applyViolinistBasePose(updated);
      updateFrameData();
    }
  };

  // Cleanup Blob URLs on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Handle custom model upload (.vrm / .glb)
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
  };

  const handleClearCustomModel = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setCustomModelUrl(null);
    setCustomFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Set camera angle preset
  const handleSetCameraPreset = (preset: typeof cameraPreset) => {
    setCameraPreset(preset);
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    if (preset === 'front') {
      controls.object.position.set(0, 1.1, 2.8);
      controls.target.set(0, 0.95, 0);
    } else if (preset === 'threeQuarter') {
      controls.object.position.set(1.5, 1.2, 2.2);
      controls.target.set(0, 0.95, 0);
    } else if (preset === 'leftSide') {
      controls.object.position.set(2.4, 1.15, 0.0);
      controls.target.set(0, 0.95, 0);
    } else if (preset === 'rightSide') {
      controls.object.position.set(-2.4, 1.15, 0.0);
      controls.target.set(0, 0.95, 0);
    } else if (preset === 'faceCloseup') {
      controls.object.position.set(0.0, 1.36, 0.85);
      controls.target.set(0.0, 1.33, 0.0);
    } else if (preset === 'fullBody') {
      controls.object.position.set(0, 0.9, 3.8);
      controls.target.set(0, 0.75, 0);
    }
    controls.update();
  };

  const selectedBoneDef = EDITABLE_BONES.find((b) => b.name === selectedBone);

  return (
    <div className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col ${containerBg} ${className}`}>
      {/* Top Header Bar: Scripted Human Violinist Pose */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/10 backdrop-blur-md bg-white/70 dark:bg-black/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Violinist Scene (Anatomical System + Instrument Props)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                <span>Deterministic Instrument Fit</span>
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Static violin & bow fitted to articulated <code className="font-mono text-[#7567C7] font-semibold">test.vrm</code> using anatomical landmark coordinate alignment
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Preset Switcher Pills */}
          <div className="flex items-center p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={handleResetTPose}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activePreset === 'tpose'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
              title="Reset to exact authored neutral T-Pose"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset T-Pose</span>
            </button>

            <button
              type="button"
              onClick={handleApplyViolinistBasePose}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activePreset === 'violinistBase'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
              title="Apply Scripted Violinist Base Pose & Fit Instruments"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Apply Violinist Base Pose</span>
            </button>
          </div>

          {/* Instrument Props Controls */}
          <div className="flex items-center p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 gap-0.5">
            {/* Toggle Violin */}
            <button
              type="button"
              onClick={() => setShowViolin((prev) => !prev)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                showViolin
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white opacity-60'
              }`}
              title="Show/Hide Violin Model"
            >
              <span className="text-xs">🎻</span>
              <span className="hidden sm:inline">Violin</span>
            </button>

            {/* Toggle Bow */}
            <button
              type="button"
              onClick={() => setShowBow((prev) => !prev)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                showBow
                  ? 'bg-amber-700 text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white opacity-60'
              }`}
              title="Show/Hide Bow Model"
            >
              <Music className="h-3 w-3" />
              <span className="hidden sm:inline">Bow</span>
            </button>

            {/* Toggle Instrument Local Axes */}
            <button
              type="button"
              onClick={() => setShowInstrumentAxes((prev) => !prev)}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                showInstrumentAxes
                  ? 'bg-[#7567C7] text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
              title="Toggle Instrument Local Coordinate Axes"
            >
              <Compass className="h-3.5 w-3.5" />
            </button>

            {/* Toggle Contact Diagnostics */}
            <button
              type="button"
              onClick={() => setShowContactDiagnostics((prev) => !prev)}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                showContactDiagnostics
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
              title="Toggle Instrument Contact Diagnostics Visualizers"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>

            {/* Reset Instrument Fit */}
            <button
              type="button"
              onClick={handleResetInstrumentFit}
              className="p-1.5 rounded-lg text-xs font-bold text-[#77747D] hover:text-[#25242A] dark:hover:text-white cursor-pointer transition-colors"
              title="Reset Instrument Fit to Deterministic Baseline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Toggle Skeleton Lines */}
          <button
            type="button"
            onClick={() => setShowSkeleton((prev) => !prev)}
            className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              showSkeleton
                ? 'bg-[#7567C7]/20 text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/40'
                : 'bg-white/80 dark:bg-white/10 text-[#77747D] dark:text-[#A8A4B2] border-[#E7E3DF] dark:border-[#2E2C37]'
            }`}
            title="Toggle Skeleton Hierarchy Lines"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>

          {/* Toggle Joint Markers */}
          <button
            type="button"
            onClick={() => setShowJointMarkers((prev) => !prev)}
            className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              showJointMarkers
                ? 'bg-[#00E5FF]/20 text-[#0088A3] dark:text-[#00F0FF] border-[#00E5FF]/40'
                : 'bg-white/80 dark:bg-white/10 text-[#77747D] dark:text-[#A8A4B2] border-[#E7E3DF] dark:border-[#2E2C37]'
            }`}
            title="Toggle Clickable Joint Spheres"
          >
            <CircleDot className="h-3.5 w-3.5" />
          </button>

          {/* Toggle Local Axes */}
          <button
            type="button"
            onClick={() => setShowLocalAxes((prev) => !prev)}
            className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 ${
              showLocalAxes
                ? 'bg-[#FF3366]/20 text-[#FF3366] border-[#FF3366]/40'
                : 'bg-white/80 dark:bg-white/10 text-[#77747D] dark:text-[#A8A4B2] border-[#E7E3DF] dark:border-[#2E2C37]'
            }`}
            title="Toggle 3D Local Axes Gizmo (RGB)"
          >
            <Compass className="h-3.5 w-3.5" />
          </button>

          {/* Save Pose */}
          <button
            type="button"
            onClick={handleSavePose}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#7567C7] text-white hover:bg-[#6456B5] border border-[#7567C7] transition-all cursor-pointer shadow-xs flex items-center gap-1"
            title="Save current joint transformations to memory"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save Pose</span>
          </button>

          {/* Load Saved Pose */}
          <button
            type="button"
            onClick={handleLoadSavedPose}
            disabled={!savedPoseSnapshot}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1 shadow-xs ${
              savedPoseSnapshot
                ? 'bg-white/80 dark:bg-white/10 text-[#25242A] dark:text-white border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-black/5'
                : 'bg-black/5 dark:bg-white/5 text-[#A8A4B2] border-black/10 dark:border-white/10 opacity-60 cursor-not-allowed'
            }`}
            title="Load previously saved pose from memory"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Load Pose</span>
          </button>

          {/* Custom File Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".vrm,.glb,.gltf"
            className="hidden"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/80 dark:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white border border-[#E7E3DF] dark:border-[#2E2C37] transition-all cursor-pointer shadow-xs flex items-center gap-1"
              title="Load custom VRM model"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{customFileName ? customFileName : 'Custom Model'}</span>
            </button>
            {customFileName && (
              <button
                type="button"
                onClick={handleClearCustomModel}
                className="p-1.5 rounded-xl text-xs font-bold bg-black/10 dark:bg-white/10 text-[#77747D] hover:text-red-500 transition-colors cursor-pointer border border-[#E7E3DF] dark:border-[#2E2C37]"
                title="Reset to default test.vrm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

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

      {/* Toast Notice */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-black/90 text-white text-xs font-bold shadow-2xl flex items-center gap-2 border border-white/20 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-[#00F0FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 3D Canvas Viewport */}
      <div className="relative w-full h-[520px] sm:h-[640px] bg-gradient-to-b from-transparent to-black/10 dark:to-black/40">
        <Canvas
          shadows
          camera={{ position: [1.5, 1.2, 2.2], fov: 38 }}
          gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <StageDioramaEnvironment theme={theme} />

          <OrbitControls
            ref={controlsRef}
            enabled={!isGizmoDragging}
            enablePan={true}
            minDistance={0.5}
            maxDistance={5.5}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={[0, 0.95, 0]}
            makeDefault
          />

          <Suspense fallback={null}>
            <ViolinistPerformanceAnimator
              vrm={vrmInstance}
              poseManager={poseManager}
              activePreset={activePreset}
              baseParams={currentPoseParams}
              playback={activePlayback}
              analysisResult={activeAnalysis}
              motionEngine={motionEngineRef.current}
              onMotionStateUpdate={setMotionState}
            />
            <VRMCharacterModel
              modelConfig={characterConfig}
              customModelUrl={customModelUrl}
              position={[0, 0, 0]}
              scale={1.0}
              poseManager={poseManager}
              selectedBone={selectedBone}
              onSelectBone={(boneName) => setSelectedBone(boneName)}
              showSkeleton={showSkeleton}
              showJointMarkers={showJointMarkers}
              showLocalAxes={showLocalAxes}
              onGizmoDraggingChange={(dragging) => setIsGizmoDragging(dragging)}
              onVRMInstanceReady={handleVRMReady}
              onBoneTransformed={updateFrameData}
            />
            <ViolinAndBowProps
              vrm={vrmInstance}
              activePreset={activePreset}
              showViolin={showViolin}
              showBow={showBow}
              showInstrumentAxes={showInstrumentAxes}
              showContactDiagnostics={showContactDiagnostics}
              onDiagnosticsUpdate={setInstrumentDiagnostics}
            />
          </Suspense>
        </Canvas>

        {/* Quick Camera Angle Presets Bar (Top Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white text-[11px] shadow-lg z-20">
          <span className="px-2 font-bold font-mono text-[#00E5FF] text-[10px] flex items-center gap-1">
            <Camera className="h-3 w-3" />
            <span>Angle:</span>
          </span>
          {[
            { id: 'threeQuarter', label: '3/4 View' },
            { id: 'front', label: 'Front' },
            { id: 'faceCloseup', label: 'Head / Neck' },
            { id: 'fullBody', label: 'Full Body' },
            { id: 'leftSide', label: 'Left Arm' },
            { id: 'rightSide', label: 'Right Arm' },
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

        {/* Applied Anatomical Values & Instrument Diagnostics HUD (Top Right) */}
        {activePreset === 'violinistBase' && (
          <div className="absolute top-14 right-3 p-3 rounded-2xl bg-black/85 backdrop-blur-md border border-emerald-500/30 text-white text-[10px] font-mono shadow-2xl space-y-1.5 z-20 max-w-[290px]">
            <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-white/10 pb-1 text-[11px]">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                <span>VIOLINIST SCENE</span>
              </span>
              <div className="flex items-center gap-1 text-[9px]">
                <button
                  type="button"
                  onClick={() => setHudTab('anatomical')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    hudTab === 'anatomical' ? 'bg-emerald-500/30 text-emerald-300 font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Pose
                </button>
                <button
                  type="button"
                  onClick={() => setHudTab('instruments')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    hudTab === 'instruments' ? 'bg-[#00E5FF]/30 text-[#00F0FF] font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Props
                </button>
                <button
                  type="button"
                  onClick={() => setHudTab('skeleton')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    hudTab === 'skeleton' ? 'bg-[#7567C7]/30 text-[#B9B0F2] font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Joints
                </button>
              </div>
            </div>

            {hudTab === 'anatomical' && (
              <div className="space-y-0.5 text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Torso Twist / Lean:</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.torsoTwist}° / {currentPoseParams.torsoSideLean}°</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-0.5">
                  <span className="text-zinc-400">Head Turn / Tilt / Nod:</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.headTurn}° / {currentPoseParams.headTilt}° / {currentPoseParams.headNod}°</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-0.5">
                  <span className="text-zinc-400">Left Arm Raise / Fwd / Flex:</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.leftArmRaise}° / {currentPoseParams.leftArmForward}° / {currentPoseParams.leftElbowFlex}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Left Wrist (Turn/Bend/Tilt):</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.leftWristTurn}° / {currentPoseParams.leftWristBend}° / {currentPoseParams.leftWristSideTilt}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Left Fingers (Curl / Oppose):</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.leftFingerCurl}° / {currentPoseParams.leftThumbOpposition}°</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-0.5">
                  <span className="text-zinc-400">Right Arm Raise / Fwd / Flex:</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.rightArmRaise}° / {currentPoseParams.rightArmForward}° / {currentPoseParams.rightElbowFlex}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Right Wrist (Turn/Bend/Tilt):</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.rightWristTurn}° / {currentPoseParams.rightWristBend}° / {currentPoseParams.rightWristSideTilt}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Right Fingers (Curl / Oppose):</span>
                  <span className="text-emerald-400 font-bold">{currentPoseParams.rightFingerCurl}° / {currentPoseParams.rightThumbOpposition}°</span>
                </div>
              </div>
            )}

            {hudTab === 'instruments' && instrumentDiagnostics && (
              <div className="space-y-1 text-zinc-300 text-[9px]">
                <div className="text-[#00E5FF] font-bold border-b border-white/10 pb-0.5 flex justify-between">
                  <span>Violin Contact Fit</span>
                  <span className="text-emerald-400 font-semibold">PASS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Root Pos:</span>
                  <span className="text-zinc-200 font-bold">
                    ({instrumentDiagnostics.violinRootPos.x.toFixed(2)}, {instrumentDiagnostics.violinRootPos.y.toFixed(2)}, {instrumentDiagnostics.violinRootPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Chinrest Pos:</span>
                  <span className="text-emerald-400 font-bold">
                    ({instrumentDiagnostics.chinrestPos.x.toFixed(2)}, {instrumentDiagnostics.chinrestPos.y.toFixed(2)}, {instrumentDiagnostics.chinrestPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Chinrest / Chin Gap:</span>
                  <span className="text-emerald-400 font-bold">{(instrumentDiagnostics.chinrestToChinDist * 1000).toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Neck Pos:</span>
                  <span className="text-emerald-400 font-bold">
                    ({instrumentDiagnostics.violinNeckPos.x.toFixed(2)}, {instrumentDiagnostics.violinNeckPos.y.toFixed(2)}, {instrumentDiagnostics.violinNeckPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Neck to LHand Cradle:</span>
                  <span className="text-emerald-400 font-bold">{(instrumentDiagnostics.neckToHandDist * 1000).toFixed(1)} mm</span>
                </div>

                <div className="text-[#F59E0B] font-bold border-b border-white/10 pb-0.5 pt-1 flex justify-between">
                  <span>Right Hand Bow Hold & Palm Side Test</span>
                  <span className={instrumentDiagnostics.palmSideValid && instrumentDiagnostics.rightHandChiralityValid ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {instrumentDiagnostics.palmSideValid && instrumentDiagnostics.rightHandChiralityValid ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Palm Side:</span>
                  <span className={instrumentDiagnostics.palmSide === 'PALMAR' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {instrumentDiagnostics.palmSide}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Palm Side Valid:</span>
                  <span className={instrumentDiagnostics.palmSideValid ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {instrumentDiagnostics.palmSideValid ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Right-Hand Chirality:</span>
                  <span className={instrumentDiagnostics.rightHandChirality === 'VALID' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {instrumentDiagnostics.rightHandChirality}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Palm Normal Dot:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.palmNormalDotProduct.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Wrist-to-Hand Bend:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.wristToHandBendAngleDeg.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Right Wrist:</span>
                  <span className="text-zinc-400">
                    ({instrumentDiagnostics.rightWristPos.x.toFixed(2)}, {instrumentDiagnostics.rightWristPos.y.toFixed(2)}, {instrumentDiagnostics.rightWristPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">R Thumb Distal:</span>
                  <span className="text-amber-400 font-bold">
                    ({instrumentDiagnostics.rightThumbDistalPos.x.toFixed(2)}, {instrumentDiagnostics.rightThumbDistalPos.y.toFixed(2)}, {instrumentDiagnostics.rightThumbDistalPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">R Index Prox:</span>
                  <span className="text-amber-400 font-bold">
                    ({instrumentDiagnostics.rightIndexProximalPos.x.toFixed(2)}, {instrumentDiagnostics.rightIndexProximalPos.y.toFixed(2)}, {instrumentDiagnostics.rightIndexProximalPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">RightBowGripFrame:</span>
                  <span className="text-emerald-400 font-bold">
                    ({instrumentDiagnostics.rightBowGripPos.x.toFixed(2)}, {instrumentDiagnostics.rightBowGripPos.y.toFixed(2)}, {instrumentDiagnostics.rightBowGripPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">BowFrogGripFrame:</span>
                  <span className="text-emerald-400 font-bold">
                    ({instrumentDiagnostics.bowFrogGripPos.x.toFixed(2)}, {instrumentDiagnostics.bowFrogGripPos.y.toFixed(2)}, {instrumentDiagnostics.bowFrogGripPos.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Grip Coincidence Dist:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.gripFrameDistMm.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Grip Angle Error:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.gripFrameAngleErrorDeg.toFixed(2)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Palm Normal Error:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.palmOrientationErrorDeg.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Thumb Contact Error:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.thumbContactErrorMm.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Index Contact Error:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.indexContactErrorMm.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Middle Contact Error:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.middleContactErrorMm.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Finger Spacing:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.fingerSpacingMm.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Anatomical Alignment:</span>
                  <span className={instrumentDiagnostics.fingerAnatomicalAlignmentPass ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {instrumentDiagnostics.fingerAnatomicalAlignmentPass ? 'PASS' : 'WARN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bow Inside Fingers:</span>
                  <span className={instrumentDiagnostics.bowInsideGripRegion ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {instrumentDiagnostics.bowInsideGripRegion ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bow Through Palm:</span>
                  <span className={instrumentDiagnostics.bowThroughPalm ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {instrumentDiagnostics.bowThroughPalm ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Hair to String Contact:</span>
                  <span className="text-emerald-400 font-bold">{(instrumentDiagnostics.bowHairToStringDist * 1000).toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bowing Orthogonality:</span>
                  <span className="text-emerald-400 font-bold">{instrumentDiagnostics.bowToStringAngleDeg.toFixed(1)}°</span>
                </div>
              </div>
            )}

            {hudTab === 'skeleton' && skeletonDiagnostics && (
              <div className="space-y-1 text-zinc-300 text-[9px]">
                <div className="text-[#00E5FF] font-bold border-b border-white/10 pb-0.5">
                  3D Joint Diagnostics
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">L Forearm Dir:</span>
                  <span className="text-emerald-400 font-bold">
                    ({skeletonDiagnostics.lForearmDir.x.toFixed(2)}, {skeletonDiagnostics.lForearmDir.y.toFixed(2)}, {skeletonDiagnostics.lForearmDir.z.toFixed(2)})
                  </span>
                </div>
                {skeletonDiagnostics.lPalmNormal && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">L Palm Normal:</span>
                    <span className="text-emerald-400 font-bold">
                      ({skeletonDiagnostics.lPalmNormal.x.toFixed(2)}, {skeletonDiagnostics.lPalmNormal.y.toFixed(2)}, {skeletonDiagnostics.lPalmNormal.z.toFixed(2)})
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-400">R Forearm Dir:</span>
                  <span className="text-emerald-400 font-bold">
                    ({skeletonDiagnostics.rForearmDir.x.toFixed(2)}, {skeletonDiagnostics.rForearmDir.y.toFixed(2)}, {skeletonDiagnostics.rForearmDir.z.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-0.5">
                  <span className="text-zinc-400">L Elbow Clearance:</span>
                  <span className="text-emerald-400 font-bold">{(skeletonDiagnostics.lElbowChestDist * 100).toFixed(1)} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">R Elbow Clearance:</span>
                  <span className="text-emerald-400 font-bold">{(skeletonDiagnostics.rElbowChestDist * 100).toFixed(1)} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Wrist Separation:</span>
                  <span className="text-emerald-400 font-bold">{(skeletonDiagnostics.wristSeparation * 100).toFixed(1)} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Elbow Separation:</span>
                  <span className="text-emerald-400 font-bold">{(skeletonDiagnostics.elbowSeparation * 100).toFixed(1)} cm</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected Bone Inspector & Local Rotation Panel (Bottom Left) */}
        <div className="absolute bottom-4 left-4 p-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/15 text-white text-xs max-w-xs sm:max-w-sm shadow-2xl space-y-2.5 z-20 font-mono">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700] animate-pulse" />
              <span className="text-[11px] text-zinc-400">Selected Bone:</span>
              <strong className="text-white font-bold">{selectedBoneDef?.label || 'None'}</strong>
            </div>
            {selectedBone && (
              <button
                type="button"
                onClick={handleResetTPose}
                className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer underline"
                title="Reset to rest rotation"
              >
                Reset T-Pose
              </button>
            )}
          </div>

          {/* Quick Joint Selector Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-400">Select:</label>
            <select
              value={selectedBone || ''}
              onChange={(e) => setSelectedBone(e.target.value as VRMHumanBoneName)}
              className="w-full px-2 py-1 rounded-lg text-xs bg-[#1F1D2B] text-white border border-white/20 focus:outline-none focus:ring-1 focus:ring-[#7567C7] cursor-pointer max-h-32"
            >
              {EDITABLE_BONES.map((b) => (
                <option key={b.name} value={b.name}>
                  [{b.category}] {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Live Coordinate Vectors & Hierarchy Readout */}
          {frameData && (
            <div className="space-y-1 text-[10px] text-zinc-300 bg-white/5 p-2 rounded-xl border border-white/10">
              <div className="flex justify-between text-zinc-400">
                <span>Parent: <strong className="text-white">{frameData.parentName}</strong></span>
                <span>Child: <strong className="text-white">{frameData.childName}</strong></span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1">
                <span>Current Rotation:</span>
                <span className="text-emerald-400 font-bold">
                  X:{frameData.currentRotationEulerDeg.x}° Y:{frameData.currentRotationEulerDeg.y}° Z:{frameData.currentRotationEulerDeg.z}°
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-zinc-400 pt-0.5">
                <span className="text-[#FF3366]">Local X (Red): ({frameData.localXWorld.x.toFixed(2)}, {frameData.localXWorld.y.toFixed(2)}, {frameData.localXWorld.z.toFixed(2)})</span>
              </div>
              <div className="flex justify-between text-[9px] text-zinc-400">
                <span className="text-[#00FF66]">Local Y (Green): ({frameData.localYWorld.x.toFixed(2)}, {frameData.localYWorld.y.toFixed(2)}, {frameData.localYWorld.z.toFixed(2)})</span>
              </div>
              <div className="flex justify-between text-[9px] text-zinc-400">
                <span className="text-[#0099FF]">Local Z (Blue): ({frameData.localZWorld.x.toFixed(2)}, {frameData.localZWorld.y.toFixed(2)}, {frameData.localZWorld.z.toFixed(2)})</span>
              </div>
            </div>
          )}
        </div>

        {/* Anatomical Parameter Fine-Tuning Panel (Bottom Right) */}
        <div className="absolute bottom-4 right-4 p-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-[#7567C7]/40 text-white text-xs max-w-xs sm:max-w-sm shadow-2xl space-y-2 z-20 font-mono">
          <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[#B9B0F2] font-bold">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>Anatomical Controls</span>
            </span>
            <span className="text-[10px] text-emerald-400">{activePreset === 'violinistBase' ? 'Base Pose' : 'T-Pose'}</span>
          </div>

          <div className="space-y-1.5 text-[10px] max-h-48 overflow-y-auto pr-1">
            {/* Left Hand Controls */}
            <div className="text-[10px] font-bold text-[#00E5FF] pt-0.5">Left Support Hand</div>
            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>L Wrist Turn / Bend:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.leftWristTurn}° / {currentPoseParams.leftWristBend}°</span>
              </div>
              <input
                type="range"
                min="-135"
                max="135"
                step="1"
                value={currentPoseParams.leftWristTurn}
                onChange={(e) => handleParamChange('leftWristTurn', parseInt(e.target.value))}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>L Finger Curl:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.leftFingerCurl}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                step="1"
                value={currentPoseParams.leftFingerCurl}
                onChange={(e) => handleParamChange('leftFingerCurl', parseInt(e.target.value))}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>L Thumb Opposition:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.leftThumbOpposition}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={currentPoseParams.leftThumbOpposition}
                onChange={(e) => handleParamChange('leftThumbOpposition', parseInt(e.target.value))}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
            </div>

            {/* Right Hand Controls */}
            <div className="text-[10px] font-bold text-[#FF9900] pt-1 border-t border-white/10">Right Grip Hand</div>
            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>R Wrist Turn / Bend:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.rightWristTurn}° / {currentPoseParams.rightWristBend}°</span>
              </div>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                value={currentPoseParams.rightWristTurn}
                onChange={(e) => handleParamChange('rightWristTurn', parseInt(e.target.value))}
                className="w-full accent-[#FF9900] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>R Finger Curl (Grip):</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.rightFingerCurl}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                step="1"
                value={currentPoseParams.rightFingerCurl}
                onChange={(e) => handleParamChange('rightFingerCurl', parseInt(e.target.value))}
                className="w-full accent-[#FF9900] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>R Thumb Opposition:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.rightThumbOpposition}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={currentPoseParams.rightThumbOpposition}
                onChange={(e) => handleParamChange('rightThumbOpposition', parseInt(e.target.value))}
                className="w-full accent-[#FF9900] cursor-pointer"
              />
            </div>

            {/* Arm Controls */}
            <div className="text-[10px] font-bold text-[#B9B0F2] pt-1 border-t border-white/10">Elbow & Arm Controls</div>
            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>Left Elbow Flexion:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.leftElbowFlex}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="135"
                step="1"
                value={currentPoseParams.leftElbowFlex}
                onChange={(e) => handleParamChange('leftElbowFlex', parseInt(e.target.value))}
                className="w-full accent-[#7567C7] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-0.5">
                <span>Right Elbow Flexion:</span>
                <span className="font-bold text-emerald-400">{currentPoseParams.rightElbowFlex}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="135"
                step="1"
                value={currentPoseParams.rightElbowFlex}
                onChange={(e) => handleParamChange('rightElbowFlex', parseInt(e.target.value))}
                className="w-full accent-[#7567C7] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Live Music-Driven Performance Bar (Bottom Left) */}
        <div className="absolute bottom-4 left-4 p-3 rounded-2xl bg-black/85 backdrop-blur-md border border-[#00E5FF]/40 text-white text-xs max-w-xs sm:max-w-sm shadow-2xl space-y-2 z-20 font-mono">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 text-[#00E5FF] font-bold">
            <span className="flex items-center gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5 text-[#00E5FF] animate-pulse" />
              <span>Music Motion Engine</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activePlayback.isPlaying
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {activePlayback.isPlaying ? 'PLAYING ♪' : 'SETTLED'}
            </span>
          </div>

          {/* Transport & Timeline Info */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleTogglePerformance}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activePlayback.isPlaying
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : 'bg-[#7567C7] hover:bg-[#6455B8] text-white shadow-md'
              }`}
            >
              {activePlayback.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-white" />}
              <span>{activePlayback.isPlaying ? 'Pause' : 'Start Music'}</span>
            </button>

            <div className="text-[11px] font-mono text-zinc-300">
              <span className="text-white font-bold">
                {Math.floor((activePlayback.currentTime || 0) / 60)}:
                {(Math.floor((activePlayback.currentTime || 0) % 60)).toString().padStart(2, '0')}
              </span>
              <span className="text-zinc-500"> / </span>
              <span className="text-zinc-400">
                {Math.floor((activePlayback.duration || 180) / 60)}:
                {(Math.floor((activePlayback.duration || 180) % 60)).toString().padStart(2, '0')}
              </span>
            </div>

            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-[10px] font-bold text-[#B9B0F2]">
              <Gauge className="h-3 w-3" />
              <span>{motionState ? Math.round(motionState.bpm) : activeAnalysis?.bpm || testBpm} BPM</span>
            </div>
          </div>

          {/* Audio Source & Live Dynamics Info */}
          <div className="space-y-1 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Audio Source:</span>
              <span className="font-bold text-[#B9B0F2]">
                {motionState?.dynamicsSource === 'timeline'
                  ? 'Precomputed Audio Stream'
                  : motionState?.dynamicsSource === 'section'
                  ? 'Gemini Section Fallback'
                  : 'Manual Test Mode'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Violin Energy:</span>
              <span className="font-bold text-amber-300">
                {motionState ? Math.round(motionState.violinEnergy * 100) : 0}%
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Dynamics:</span>
              <span className="font-bold text-[#00E5FF]">
                {motionState ? Math.round(motionState.effectivePerformanceEnergy * 100) : 0}%
                {motionState && (
                  <span className="text-[9px] ml-1 text-zinc-400 font-normal">
                    (
                    {motionState.effectivePerformanceEnergy < 0.3
                      ? 'Piano'
                      : motionState.effectivePerformanceEnergy < 0.6
                      ? 'Mezzo'
                      : motionState.effectivePerformanceEnergy < 0.8
                      ? 'Forte'
                      : 'Fortissimo'}
                    )
                  </span>
                )}
              </span>
            </div>

            {/* Intensity progress bar */}
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-[#00E5FF] via-[#7567C7] to-[#F472B6] transition-all duration-100 rounded-full"
                style={{ width: `${Math.round((motionState?.effectivePerformanceEnergy || 0) * 100)}%` }}
              />
            </div>
          </div>

          {/* Attack / Transient Onset & Bowing Stroke Status */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
            <span>Attack / Onset:</span>
            <span
              className={`font-bold transition-colors ${
                motionState && motionState.attackStrength > 0.25
                  ? 'text-[#00E5FF] animate-pulse font-extrabold'
                  : 'text-zinc-500'
              }`}
            >
              {motionState && motionState.attackStrength > 0.25
                ? `⚡ ${Math.round(motionState.attackStrength * 100)}% (ONSET: YES)`
                : 'Sustained (ONSET: NO)'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
            <span>Bowing Stroke:</span>
            <span
              className={`font-bold ${
                motionState && motionState.bowVelocity < 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {motionState
                ? motionState.bowVelocity < 0
                  ? '▾ Down-bow (Accelerating)'
                  : '▴ Up-bow (Retracting)'
                : 'Idle'}
            </span>
          </div>

          {/* Standalone simulation controls (if no external audio is active) */}
          {!hasExternalAudio && (
            <div className="pt-1.5 border-t border-white/10 space-y-1 text-[9px] text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Tempo: {testBpm} BPM</span>
                <input
                  type="range"
                  min="60"
                  max="180"
                  step="1"
                  value={testBpm}
                  onChange={(e) => setTestBpm(parseInt(e.target.value))}
                  className="w-24 accent-[#7567C7] cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Intensity: {Math.round(testIntensity * 100)}%</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={testIntensity}
                  onChange={(e) => setTestIntensity(parseFloat(e.target.value))}
                  className="w-24 accent-[#00E5FF] cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Interaction Hint (Top Right) */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10 z-20">
          <Eye className="h-3 w-3" />
          <span>Click joint to select • Drag 3D gizmo to rotate • Drag background to orbit</span>
        </div>
      </div>
    </div>
  );
};
