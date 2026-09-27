import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import {
  Sparkles,
  Box,
  Eye,
  Layers,
  CheckCircle2,
  Users,
  Music,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';
import { MusicInstrument, ModularMusician } from '../types';

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
 * 3D Miniature Concert Diorama Stage
 * Studio 3-point lighting, circular pedestal, soft contact shadows, and orbit camera.
 */
const StageDioramaEnvironment: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const pedestalColor = isDark ? '#1C1929' : isSakura ? '#FCE8EE' : '#ECE8E1';
  const rimLightColor = isDark ? '#BCA8F8' : isSakura ? '#F472B6' : '#E8CE9D';
  const stageFloorColor = isDark ? '#120F1D' : isSakura ? '#FAF0F3' : '#F4EFEB';

  return (
    <>
      {/* 3-Point Studio / Concert Lighting */}
      <ambientLight intensity={isDark ? 0.8 : 1.0} />

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

      {/* Rim / Backlight for anime silhouette separation */}
      <directionalLight position={[0, 4, -4]} intensity={1.3} color={rimLightColor} />

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
 * Clean 3D Stage Viewport
 * Prepared to host decoupled Character + Instrument + Animation instances.
 * In the neutral/empty state, it renders the diorama stage without any placeholder shapes.
 */
export const MusicLab3DStage: React.FC<MusicLab3DStageProps> = ({
  theme = 'light',
  activeInstruments = [],
  playingInstruments = new Set(),
  instrumentIntensities = {},
  musicians = [],
  isPlaying = false,
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

  return (
    <div className={`relative w-full rounded-3xl overflow-hidden border shadow-2xl flex flex-col ${containerBg} ${className}`}>
      {/* Stage Header Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/10 backdrop-blur-md bg-white/40 dark:bg-black/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25 shrink-0">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                3D Music Lab Concert Stage
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                Three.js / R3F Engine
              </span>
            </div>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              Modular 3D Diorama Stage • Ready for Character + Instrument + Animation Assets
            </p>
          </div>
        </div>

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
            <span>3D Stage Ready</span>
          </div>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="relative w-full h-[400px] sm:h-[480px] bg-gradient-to-b from-transparent to-black/5 dark:to-black/30">
        <Canvas
          shadows
          camera={{ position: [0, 1.3, 3.4], fov: 38 }}
          gl={{ antialias: true, alpha: true }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        >
          <StageDioramaEnvironment theme={theme} />

          <OrbitControls
            enablePan={true}
            minDistance={1.2}
            maxDistance={5.5}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2 - 0.05}
            target={[0, 0.6, 0]}
            makeDefault
          />

          <Suspense fallback={null}>
            {/* Future 3D Musician instances will mount here */}
          </Suspense>
        </Canvas>

        {/* Interaction Hint Overlay */}
        <div className="absolute top-3 right-3 pointer-events-none px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur-xs text-white/80 text-[10px] font-mono flex items-center gap-1.5 border border-white/10">
          <Eye className="h-3 w-3" />
          <span>Left-drag to rotate • Scroll to zoom</span>
        </div>

        {/* Clean Architecture Callout */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none text-center px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 text-white text-xs max-w-md shadow-lg">
          <div className="flex items-center justify-center gap-1.5 text-[#D8D2FF] font-bold text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Modular 3D Musician Architecture</span>
          </div>
          <p className="text-[11px] text-white/80 mt-0.5">
            <span className="font-mono text-white font-semibold">Character</span> +{' '}
            <span className="font-mono text-white font-semibold">Instrument</span> +{' '}
            <span className="font-mono text-white font-semibold">Animation</span> ={' '}
            <span className="text-[#BCA8F8] font-semibold">Live Musician</span>
          </p>
        </div>
      </div>

      {/* Stage Information Footer */}
      <div className="relative z-10 p-4 sm:p-5 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#1E1D24]/90 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[#77747D] dark:text-[#9E9AA6]">
              <Users className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Characters: Reusable Base Models</span>
            </div>
            <span className="text-black/20 dark:text-white/20">•</span>
            <div className="flex items-center gap-1.5 text-[#77747D] dark:text-[#9E9AA6]">
              <Music className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Instruments: 3D Props</span>
            </div>
            <span className="text-black/20 dark:text-white/20">•</span>
            <div className="flex items-center gap-1.5 text-[#77747D] dark:text-[#9E9AA6]">
              <Layers className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Animations: Skeletal Clips</span>
            </div>
          </div>

          <span className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] font-mono">
            Platform Ready: Three.js / React Three Fiber
          </span>
        </div>
      </div>
    </div>
  );
};
