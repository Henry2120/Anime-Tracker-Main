import React, { Suspense, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import {
  Sparkles,
  Eye,
  Layers,
  CheckCircle2,
  Users,
  Music,
  RotateCcw,
  Play,
  Pause,
  Box,
  Palette,
  Camera,
  ShieldCheck,
  Star,
  Maximize2,
  Sliders,
  Upload,
  FileCode2,
  Smile,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';
import { MusicInstrument, ModularMusician } from '../types';
import { CHARACTER_REGISTRY, getCharacterConfig } from '../characters/registry';
import { VRMCharacterModel } from './VRMCharacterModel';

interface MusicLab3DStageProps {
  theme?: AppTheme;
  activeInstruments?: MusicInstrument[];
  playingInstruments?: Set<MusicInstrument>;
  instrumentIntensities?: Record<string, number>;
  musicians?: ModularMusician[];
  isPlaying?: boolean;
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
  activeInstruments = [],
  playingInstruments = new Set(),
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
  const [selectedCharacterId] = useState('aria');
  const characterConfig = getCharacterConfig(selectedCharacterId);

  // Custom user uploaded VRM/GLB model URL
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<{ isVRM: boolean; vrmVersion?: string } | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  // Performer & Decoupled Instrument State
  const [assignedInstrument, setAssignedInstrument] = useState<MusicInstrument | 'none'>('violin');
  const [pose, setPose] = useState<
    'relaxed_idle' | 'neutral_standing' | 'violin_playing' | 'guitar_playing' | 'vocal_performance'
  >('violin_playing');
  const [expression, setExpression] = useState<'neutral' | 'happy' | 'relaxed' | 'singing'>('relaxed');
  const [enableBlinking, setEnableBlinking] = useState(true);
  const [enableSpringBones, setEnableSpringBones] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<'front' | 'threeQuarter' | 'side' | 'faceCloseup' | 'fullBody'>('front');

  const controlsRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle local VRM / GLB file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
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
      controls.object.position.set(0, 1.1, 3.2);
      controls.target.set(0, 0.85, 0);
    } else if (preset === 'threeQuarter') {
      controls.object.position.set(1.8, 1.15, 2.5);
      controls.target.set(0, 0.85, 0);
    } else if (preset === 'side') {
      controls.object.position.set(3.0, 0.95, 0);
      controls.target.set(0, 0.85, 0);
    } else if (preset === 'faceCloseup') {
      controls.object.position.set(0, 1.42, 0.95);
      controls.target.set(0, 1.42, 0);
    } else if (preset === 'fullBody') {
      controls.object.position.set(0, 0.9, 3.8);
      controls.target.set(0, 0.75, 0);
    }
    controls.update();
  };

  // Handle dynamic instrument assignment and auto-sync pose
  const handleSelectInstrument = (inst: MusicInstrument | 'none') => {
    setAssignedInstrument(inst);
    if (inst === 'violin') {
      setPose('violin_playing');
    } else if (inst === 'acoustic-guitar' || inst === 'electric-guitar') {
      setPose('guitar_playing');
    } else if (inst === 'vocalist') {
      setPose('vocal_performance');
      setExpression('singing');
    } else {
      setPose('relaxed_idle');
    }
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
                AniVerse External VRM / GLB Character System
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20 flex items-center gap-1">
                <FileCode2 className="h-3 w-3" />
                <span>@pixiv/three-vrm Active</span>
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Decoupled Architecture: <strong className="text-[#25242A] dark:text-white">Aria (VRM)</strong> + <strong className="text-[#25242A] dark:text-white">Instrument</strong> + <strong className="text-[#25242A] dark:text-white">Animation</strong> = Live Musician
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#7567C7] hover:bg-[#6455B8] text-white transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
            title="Import custom external VRM or GLB character"
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
      <div className="relative w-full h-[460px] sm:h-[540px] bg-gradient-to-b from-transparent to-black/5 dark:to-black/30">
        <Canvas
          shadows
          camera={{ position: [0, 1.1, 3.2], fov: 38 }}
          gl={{ antialias: true, alpha: true }}
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
            target={[0, 0.85, 0]}
            makeDefault
          />

          <Suspense fallback={null}>
            <VRMCharacterModel
              modelConfig={characterConfig}
              customModelUrl={customModelUrl}
              pose={pose}
              activeInstrument={assignedInstrument === 'none' ? null : assignedInstrument}
              isPlaying={true}
              expressionPreset={expression}
              enableBlinking={enableBlinking}
              enableSpringBones={enableSpringBones}
              position={[0, 0, 0]}
              scale={1.0}
              onModelLoaded={(info) => {
                setModelStatus(info);
                setLoadNotice(null);
              }}
              onError={(msg) => {
                setLoadNotice(msg);
              }}
            />
          </Suspense>
        </Canvas>

        {/* Quick Camera Angle Bar (Top Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] shadow-lg">
          <span className="px-2 font-bold font-mono text-[#C4B9FC] text-[10px] flex items-center gap-1">
            <Camera className="h-3 w-3" />
            <span>Camera:</span>
          </span>
          {[
            { id: 'front', label: 'Front' },
            { id: 'threeQuarter', label: '3/4 Angle' },
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

        {/* External VRM Asset Readiness Callout (If model waiting for local file) */}
        {loadNotice && !customModelUrl && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 p-3.5 rounded-2xl bg-black/80 backdrop-blur-md border border-amber-500/30 text-white text-xs max-w-md shadow-2xl space-y-1.5 text-center">
            <div className="flex items-center justify-center gap-1.5 text-amber-400 font-bold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>External Character Asset Pipeline Ready</span>
            </div>
            <p className="text-[11px] text-white/80">
              The loader is listening at <code className="font-mono text-amber-300 bg-white/10 px-1 py-0.5 rounded">public/music-lab/characters/aria/aria.vrm</code>.
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

        {/* Floating Decoupled Architecture HUD (Bottom Left) */}
        <div className="absolute bottom-4 left-4 pointer-events-none p-3 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 text-white text-xs max-w-xs shadow-xl space-y-1">
          <div className="flex items-center gap-1.5 text-[#C4B9FC] font-bold text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Decoupled Musician Pipeline</span>
          </div>
          <div className="text-[10px] text-white/80 space-y-0.5">
            <div>• <strong className="text-white">Performer:</strong> {customFileName || characterConfig.name}</div>
            <div>• <strong className="text-white">Assigned Prop:</strong> {assignedInstrument === 'none' ? 'Standalone (No Instrument)' : assignedInstrument}</div>
            <div>• <strong className="text-white">Animation Clip:</strong> {pose}</div>
            <div>• <strong className="text-white">Format:</strong> {modelStatus?.isVRM ? `VRM ${modelStatus.vrmVersion || '1.0'}` : customFileName ? 'Standard GLB' : 'VRM Pipeline'}</div>
          </div>
        </div>

        {/* Interaction Hint (Top Right) */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10">
          <Eye className="h-3 w-3" />
          <span>Left-drag to rotate • Scroll to zoom</span>
        </div>
      </div>

      {/* Control Deck (Bottom Panel) */}
      <div className="relative z-10 p-4 sm:p-5 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#1E1D24]/90 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Decoupled Instrument Assignment */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <Music className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Assign Instrument:</span>
            </span>
            <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/5 p-0.5 border border-black/10 dark:border-white/10">
              {[
                { id: 'violin', label: 'Violin' },
                { id: 'acoustic-guitar', label: 'Acoustic Guitar' },
                { id: 'electric-guitar', label: 'Electric Guitar' },
                { id: 'flute', label: 'Flute' },
                { id: 'vocalist', label: 'Vocal Mic' },
                { id: 'none', label: 'Standalone' },
              ].map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => handleSelectInstrument(inst.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    assignedInstrument === inst.id
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                >
                  {inst.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reusable Animation & Pose Selectors */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Humanoid Pose:</span>
            </span>
            <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/5 p-0.5 border border-black/10 dark:border-white/10">
              {[
                { id: 'relaxed_idle', label: 'Idle Breathing' },
                { id: 'neutral_standing', label: 'A-Pose' },
                { id: 'violin_playing', label: 'Violin Posture' },
                { id: 'guitar_playing', label: 'Guitar Strum' },
                { id: 'vocal_performance', label: 'Singing' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPose(p.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    pose === p.id
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expressions and Physics Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-black/5 dark:border-white/5">
          {/* VRM Facial BlendShapes / Expressions */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <Smile className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>VRM Expression:</span>
            </span>
            <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/5 p-0.5 border border-black/10 dark:border-white/10">
              {[
                { id: 'neutral', label: 'Neutral' },
                { id: 'happy', label: 'Happy' },
                { id: 'relaxed', label: 'Relaxed' },
                { id: 'singing', label: 'Singing (Mouth Aa)' },
              ].map((exp) => (
                <button
                  key={exp.id}
                  type="button"
                  onClick={() => setExpression(exp.id as any)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                    expression === exp.id
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                >
                  {exp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Physics Toggles */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-[#524E5B] dark:text-[#D1CCE0] text-[11px] font-medium">
              <input
                type="checkbox"
                checked={enableBlinking}
                onChange={(e) => setEnableBlinking(e.target.checked)}
                className="rounded accent-[#7567C7]"
              />
              <span>VRM Blink</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-[#524E5B] dark:text-[#D1CCE0] text-[11px] font-medium">
              <input
                type="checkbox"
                checked={enableSpringBones}
                onChange={(e) => setEnableSpringBones(e.target.checked)}
                className="rounded accent-[#7567C7]"
              />
              <span>Spring Bone Physics</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
