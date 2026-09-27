import React, { useState, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { VRM } from '@pixiv/three-vrm';
import {
  ArrowLeft,
  Box,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  Camera,
  Upload,
  RefreshCw,
  Layers,
  FileCode,
} from 'lucide-react';
import { AppTheme } from '../../types/theme';
import { FredricaModel } from './FredricaModel';

interface FredricaViewerProps {
  onReturnToAnime: () => void;
  theme?: AppTheme;
  initialModelUrl?: string;
}

interface ModelMetadata {
  title?: string;
  author?: string;
  version?: string;
  vrmVersion?: string;
  boneCount?: number;
  meshCount?: number;
}

export const FredricaViewer: React.FC<FredricaViewerProps> = ({
  onReturnToAnime,
  theme = 'light',
  initialModelUrl = '/models/test.vrm',
}) => {
  const [modelUrl, setModelUrl] = useState<string>(initialModelUrl);
  const [loadingState, setLoadingState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const controlsRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerBg = isDark
    ? 'bg-[#12111A] text-[#F4F2F7]'
    : isSakura
    ? 'bg-[#FCF5F7] text-[#25242A]'
    : 'bg-[#F5F3EF] text-[#25242A]';

  const cardBg = isDark
    ? 'bg-[#1C1A27] border-[#2D2A3D]'
    : isSakura
    ? 'bg-white border-[#F3D7DF]'
    : 'bg-white border-[#E5E1DA]';

  // Handle successful VRM model load
  const handleModelLoaded = useCallback((vrm: VRM) => {
    setLoadingState('success');
    setErrorMessage(null);

    // Extract basic metadata for technical verification
    let meshCount = 0;
    vrm.scene.traverse((obj) => {
      if ((obj as any).isMesh) meshCount++;
    });

    const humanBones = vrm.humanoid?.humanBones;
    const boneCount = humanBones ? Object.keys(humanBones).length : 0;

    const metaAny = vrm.meta as any;
    const title = metaAny?.name || metaAny?.title || 'VRM Avatar';
    const author = Array.isArray(metaAny?.authors)
      ? metaAny.authors.join(', ')
      : metaAny?.author || 'Unknown';

    setMetadata({
      title,
      author,
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
    setErrorMessage(msg || 'Failed to load VRM model. Verify that /models/test.vrm is a valid VRM file.');
  }, []);

  // Reset Camera View
  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(0, 1.0, 3.8);
      controlsRef.current.target.set(0, 0.85, 0);
      controlsRef.current.update();
    }
  };

  // Allow custom file upload as a fallback/test helper
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newUrl = URL.createObjectURL(file);
    setModelUrl(newUrl);
    setUploadedFileName(file.name);
    setLoadingState('loading');
    setErrorMessage(null);
    setLoadProgress(0);
  };

  const handleReload = () => {
    setLoadingState('loading');
    setErrorMessage(null);
    setLoadProgress(0);
    // Trigger re-render by appending timestamp cache-buster if needed
    const base = modelUrl.split('?')[0];
    setModelUrl(`${base}?t=${Date.now()}`);
  };

  return (
    <div className={`min-h-screen w-full flex flex-col ${containerBg}`}>
      {/* =========================================================================
          HEADER BAR
          ========================================================================= */}
      <header className="w-full border-b border-black/5 dark:border-white/10 bg-white/70 dark:bg-[#181622]/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnToAnime}
            className="p-2 rounded-xl text-[#77747D] hover:text-[#25242A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to AniVerse</span>
          </button>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25">
              <Box className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-[#25242A] dark:text-[#F4F2F7]">
                  Fredrica VRM Test Viewer
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                  Isolated Technical Test
                </span>
              </div>
              <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
                Target: <code className="font-mono text-[#7567C7] dark:text-[#B9B0F2]">{uploadedFileName || '/models/test.vrm'}</code>
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* File Upload Helper */}
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
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
            title="Load an alternative VRM file for testing"
          >
            <Upload className="h-3.5 w-3.5 text-[#7567C7]" />
            <span className="hidden sm:inline">Select Other VRM</span>
          </button>

          {/* Reset Camera Button */}
          <button
            type="button"
            onClick={handleResetCamera}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
            title="Reset camera to default framed view"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#7567C7]" />
            <span className="hidden sm:inline">Reset View</span>
          </button>

          {/* Status Indicator */}
          {loadingState === 'loading' && (
            <div className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </div>
          )}
          {loadingState === 'success' && (
            <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              <span>VRM Active</span>
            </div>
          )}
          {loadingState === 'error' && (
            <div className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[11px] font-bold flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              <span>Load Error</span>
            </div>
          )}
        </div>
      </header>

      {/* =========================================================================
          MAIN 3D VIEWPORT CONTAINER
          ========================================================================= */}
      <main className="flex-1 w-full relative flex flex-col items-center justify-center overflow-hidden">
        {/* React Three Fiber 3D Canvas */}
        <div className="absolute inset-0 w-full h-full bg-radial from-black/5 via-black/10 to-black/20 dark:from-[#1D1A2B] dark:via-[#141220] dark:to-[#0C0B14]">
          <Canvas
            shadows
            camera={{ position: [0, 1.0, 3.8], fov: 32 }}
            gl={{ antialias: true, alpha: true }}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          >
            {/* Studio Lighting Setup: Designed so dark clothing and black materials have clear visibility and rim highlights */}
            <ambientLight intensity={isDark ? 1.1 : 1.25} />

            {/* Main Key Light with Shadow Mapping */}
            <directionalLight
              position={[2.5, 4.5, 3.0]}
              intensity={isDark ? 1.4 : 1.2}
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

            {/* Cool Fill Light (Left) to illuminate shaded clothing surfaces */}
            <directionalLight
              position={[-3.5, 2.5, 2.0]}
              intensity={0.85}
              color="#E2EEFF"
            />

            {/* Rim / Hair / Edge Light (Behind Model) to cleanly separate dark clothing from neutral background */}
            <directionalLight
              position={[0, 3.5, -3.2]}
              intensity={1.2}
              color={isDark ? '#C7BEF8' : '#FFF5E0'}
            />

            {/* Neutral Studio Floor Pedestal / Circular Stand */}
            <group position={[0, -0.005, 0]}>
              <mesh position={[0, -0.04, 0]} receiveShadow>
                <cylinderGeometry args={[1.5, 1.6, 0.08, 48]} />
                <meshStandardMaterial
                  color={isDark ? '#232035' : '#ECE7E1'}
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
            </group>

            {/* Soft Ground Contact Shadows */}
            <ContactShadows
              position={[0, 0, 0]}
              opacity={isDark ? 0.75 : 0.55}
              scale={3.6}
              blur={1.6}
              far={1.8}
              resolution={512}
            />

            {/* Orbit Controls with full vertical freedom and smooth damping */}
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

            {/* VRM Model Root */}
            <FredricaModel
              url={modelUrl}
              onLoaded={handleModelLoaded}
              onError={handleModelError}
              onProgress={setLoadProgress}
              position={[0, 0, 0]}
              scale={1.0}
            />
          </Canvas>
        </div>

        {/* =======================================================================
            OVERLAY: LOADING PROGRESS STATE
            ======================================================================= */}
        {loadingState === 'loading' && (
          <div className="relative z-10 p-6 rounded-3xl bg-white/90 dark:bg-[#1C1A27]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl flex flex-col items-center space-y-4 max-w-sm text-center animate-in fade-in zoom-in-95">
            <div className="p-3.5 rounded-2xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Loading VRM Model
              </h2>
              <p className="text-xs text-[#77747D] dark:text-[#9E9AA6] mt-1 font-mono break-all">
                {uploadedFileName || '/models/test.vrm'}
              </p>
            </div>

            {loadProgress > 0 && (
              <div className="w-full space-y-1.5">
                <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
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
        )}

        {/* =======================================================================
            OVERLAY: ERROR STATE WITH DIAGNOSTICS & RECOVERY
            ======================================================================= */}
        {loadingState === 'error' && (
          <div className="relative z-10 p-6 sm:p-8 rounded-3xl bg-white/95 dark:bg-[#1C1A27]/95 backdrop-blur-xl border border-red-500/30 shadow-2xl flex flex-col items-center space-y-4 max-w-md text-center mx-4 animate-in fade-in zoom-in-95">
            <div className="p-3.5 rounded-2xl bg-red-500/15 text-red-500">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Unable to Load VRM Model
              </h2>
              <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-mono text-left bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 max-h-24 overflow-y-auto">
                {errorMessage}
              </p>
            </div>

            <p className="text-xs text-[#77747D] dark:text-[#9E9AA6] leading-relaxed">
              If <code className="font-mono text-xs bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">public/models/test.vrm</code> is an empty 0-byte file or not yet populated with valid binary data, select a real <code className="font-mono">.vrm</code> file below to test immediately.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white font-bold text-xs transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                <span>Choose Local VRM</span>
              </button>
              <button
                type="button"
                onClick={handleReload}
                className="px-4 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        )}

        {/* =======================================================================
            OVERLAY: METADATA & INSPECTION HUD
            ======================================================================= */}
        {loadingState === 'success' && metadata && (
          <div className="absolute bottom-4 left-4 z-10 p-3.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 text-white text-xs max-w-xs shadow-xl space-y-1.5 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-1.5 text-[#C4B9FC] font-bold text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>VRM Model Verified</span>
            </div>
            <div className="text-[11px] text-white/90 space-y-0.5">
              <div>• <strong>Avatar:</strong> {metadata.title}</div>
              <div>• <strong>Humanoid Bones:</strong> {metadata.boneCount} bones</div>
              <div>• <strong>Meshes:</strong> {metadata.meshCount} nodes</div>
              <div>• <strong>VRM Spec:</strong> Version {metadata.vrmVersion}</div>
            </div>
          </div>
        )}

        {/* Navigation Hint (Top Right) */}
        <div className="absolute top-4 right-4 z-10 pointer-events-none px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white/80 text-[11px] font-mono flex items-center gap-2 border border-white/10">
          <Eye className="h-3.5 w-3.5 text-[#C4B9FC]" />
          <span>Left-drag to rotate • Scroll to zoom • Right-drag to pan</span>
        </div>
      </main>
    </div>
  );
};
