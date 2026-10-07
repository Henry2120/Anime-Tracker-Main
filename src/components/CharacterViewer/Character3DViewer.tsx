import React, { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Grid as DreiGrid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  User,
  Users,
  Box,
  Layers,
  Sparkles,
  Maximize2,
  RefreshCw,
  AlertCircle,
  FolderOpen,
  Info,
  Sliders,
  Play,
  Pause,
  Film,
  Music2,
  X,
  Youtube,
  Radio,
  Check,
} from 'lucide-react';
import { AppTheme } from '../../types/theme';
import { BLUE_ARCHIVE_CHARACTERS, CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, ViewerCameraPreset, ViewerEnvironment } from './types';
import { useCharacterLoader } from './useCharacterLoader';
import { CharacterInstanceMesh } from './CharacterInstanceMesh';
import { CharacterBrowserDrawer } from './CharacterBrowserDrawer';
import { CharacterViewerToolbar } from './CharacterViewerToolbar';
import { ConcertStage3D } from './ConcertStage3D';
import {
  DEFAULT_CONCERT_PERFORMERS,
  getConcertSlotTransform,
  CONCERT_STAGE_CONFIG,
} from './concertConfig';
import {
  useConcertMusic,
  PRESET_CONCERT_TRACKS,
  extractYouTubeVideoId,
} from './ConcertMusicContext';

interface Character3DViewerProps {
  theme?: AppTheme;
  className?: string;
  presentationMode?: 'full' | 'mini';
  onReturnToEnsemble?: () => void;
  onExpand?: () => void;
  onCloseMini?: () => void;
}

/**
 * Dynamic Environment, Concert Stage & Lighting System
 */
const ViewerEnvironment3D: React.FC<{
  environment: ViewerEnvironment;
  selectedSlotIndex?: number | null;
  onSelectSlot?: (slotIndex: number) => void;
}> = ({ environment, selectedSlotIndex, onSelectSlot }) => {
  const envConfigs = {
    studio: {
      ambientIntensity: 0.85,
      keyColor: '#FFFFFF',
      keyIntensity: 1.4,
      fillColor: '#D8E5FF',
      fillIntensity: 0.6,
      rimColor: '#E6E6FA',
      rimIntensity: 1.0,
      shadowOpacity: 0.45,
    },
    dark: {
      ambientIntensity: 0.7,
      keyColor: '#F0E6FF',
      keyIntensity: 1.5,
      fillColor: '#6B7280',
      fillIntensity: 0.5,
      rimColor: '#BCA8F8',
      rimIntensity: 1.4,
      shadowOpacity: 0.75,
    },
    sakura: {
      ambientIntensity: 0.9,
      keyColor: '#FFF0F5',
      keyIntensity: 1.35,
      fillColor: '#FCE7F3',
      fillIntensity: 0.7,
      rimColor: '#F472B6',
      rimIntensity: 1.2,
      shadowOpacity: 0.45,
    },
    sunset: {
      ambientIntensity: 0.75,
      keyColor: '#FFEDD5',
      keyIntensity: 1.6,
      fillColor: '#C084FC',
      fillIntensity: 0.6,
      rimColor: '#FB923C',
      rimIntensity: 1.3,
      shadowOpacity: 0.6,
    },
    clean: {
      ambientIntensity: 1.1,
      keyColor: '#FFFFFF',
      keyIntensity: 1.2,
      fillColor: '#E5E7EB',
      fillIntensity: 0.5,
      rimColor: '#FFFFFF',
      rimIntensity: 0.8,
      shadowOpacity: 0.35,
    },
  }[environment];

  return (
    <>
      <ambientLight intensity={envConfigs.ambientIntensity} />

      {/* Key Directional Stage Light with Soft Shadows */}
      <directionalLight
        position={[3.0, 7.0, 5.0]}
        intensity={envConfigs.keyIntensity}
        color={envConfigs.keyColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={5}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0005}
      />

      {/* Soft Fill Light */}
      <directionalLight
        position={[-5.0, 4.0, -2.0]}
        intensity={envConfigs.fillIntensity}
        color={envConfigs.fillColor}
      />

      {/* Rim / Hair Silhouette Backlight */}
      <directionalLight
        position={[0, 6.0, -5.0]}
        intensity={envConfigs.rimIntensity}
        color={envConfigs.rimColor}
      />

      {/* Physical 3D Concert Stage Platform (Front Row & Elevated Back Row Riser with Curved Markers) */}
      <ConcertStage3D
        environment={environment}
        selectedSlotIndex={selectedSlotIndex}
        onSelectSlot={onSelectSlot}
      />

      {/* Soft Contact Shadows covering the entire concert stage */}
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={envConfigs.shadowOpacity}
        scale={14.0}
        blur={1.8}
        far={3.0}
      />
    </>
  );
};

/**
 * Camera Auto-Framer for 10-Character Curved Concert Stage
 * Frames all 10 performers, both curved rows, elevated back platform, with comfortable margins.
 */
const DynamicCameraAutoFramer: React.FC<{
  loadedCharacters: LoadedCharacterInstance[];
  cameraPreset: ViewerCameraPreset;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isMini?: boolean;
}> = ({ loadedCharacters, cameraPreset, controlsRef, isMini = false }) => {
  const { camera, size } = useThree();

  const calculateBounds = useCallback(() => {
    const collectiveBox = new THREE.Box3();
    let visibleCount = 0;

    loadedCharacters.forEach((char) => {
      if (char.visible && char.scene) {
        const box = char.boundingBox ? char.boundingBox.clone() : new THREE.Box3().setFromObject(char.scene);
        box.translate(char.position);
        collectiveBox.union(box);
        visibleCount++;
      }
    });

    // Also include stage geometry bounds to ensure complete stage visibility
    // Stage is 8.8m wide, front at Z=2.2, back riser at Z=-1.8, height 0 to 0.5
    const stageBounds = new THREE.Box3(
      new THREE.Vector3(-4.4, 0, -1.8),
      new THREE.Vector3(4.4, 0.5, 2.2)
    );
    collectiveBox.union(stageBounds);

    const center = new THREE.Vector3();
    collectiveBox.getCenter(center);
    const sphere = new THREE.Sphere();
    collectiveBox.getBoundingSphere(sphere);

    const height = Math.max(0.6, collectiveBox.max.y - collectiveBox.min.y);
    const width = Math.max(1.0, collectiveBox.max.x - collectiveBox.min.x);
    const depth = Math.max(1.0, collectiveBox.max.z - collectiveBox.min.z);

    return {
      center,
      minY: collectiveBox.min.y,
      maxY: collectiveBox.max.y,
      height,
      width,
      depth,
      radius: Math.max(1.5, sphere.radius),
    };
  }, [loadedCharacters]);

  // Adjust camera whenever models load, preset changes, or viewport resizes
  useEffect(() => {
    const { center, minY, height, width, radius } = calculateBounds();

    const persCamera = camera as THREE.PerspectiveCamera;
    const fovRad = (persCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));

    // Distance needed to comfortably frame full height with headroom and footroom (35% margin)
    const distY = (height * 1.35) / (2 * Math.tan(fovRad / 2));

    // Distance needed to comfortably frame full width on narrow/mobile viewports (30% margin)
    const distX = (width * 1.3) / (2 * Math.tan(fovRad / 2) * aspect);

    // Diagonal clearance
    const distSphere = radius * 2.1;

    // Use max distance so entire 10-character ensemble + stage is completely visible
    const distance = Math.max(distY, distX, distSphere, isMini ? 4.8 : 5.0);

    // Vertical target: Center of stage performers
    const targetY = minY + height * (isMini ? 0.48 : 0.45);
    const target = new THREE.Vector3(center.x, targetY, center.z);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = 0.5;
      controls.maxDistance = 35.0;
    }

    if (isMini) {
      // Frontal concert stage view optimized for small overlay card
      camera.position.set(center.x, targetY + distance * 0.28, center.z + distance * 1.05);
    } else if (cameraPreset === 'front') {
      // Full audience frontal stage view with slight elevation so both rows are visible
      camera.position.set(center.x, targetY + distance * 0.22, center.z + distance * 0.98);
    } else if (cameraPreset === 'perspective') {
      // Concert 3/4 amphitheater view (22 deg azimuth, 18 deg elevation)
      const radAzim = 0.38;
      const radElev = 0.28;
      camera.position.set(
        center.x + distance * Math.sin(radAzim) * Math.cos(radElev),
        targetY + distance * Math.sin(radElev),
        center.z + distance * Math.cos(radAzim) * Math.cos(radElev)
      );
    } else if (cameraPreset === 'side') {
      // Side stage profile view
      camera.position.set(center.x + distance, targetY + distance * 0.2, center.z);
    } else if (cameraPreset === 'closeUp') {
      // Front row center focus
      const closeDist = Math.max(2.2, (width * 0.38) / (2 * Math.tan(fovRad / 2) * aspect));
      camera.position.set(0, 0.95, 0.75 + closeDist);
      if (controls) controls.target.set(0, 0.85, 0.75);
    } else if (cameraPreset === 'top') {
      // High angle stage lighting view
      camera.position.set(center.x, targetY + distance * 1.25, center.z + 0.1);
    }

    camera.lookAt(target);
    persCamera.updateProjectionMatrix();

    if (controls) {
      controls.update();
    }
  }, [loadedCharacters, cameraPreset, camera, size.width, size.height, controlsRef, calculateBounds, isMini]);

  return null;
};

export const Character3DViewer: React.FC<Character3DViewerProps> = ({
  theme = 'light',
  className = '',
  presentationMode = 'full',
  onReturnToEnsemble,
  onExpand,
  onCloseMini,
}) => {
  const isMini = presentationMode === 'mini';
  const isDark = theme === 'dark' || isMini;
  const isSakura = theme === 'sakura' && !isMini;

  const containerBg = isMini
    ? 'bg-[#12101C]'
    : isDark
    ? 'bg-[#14121C] border-[#2E2C37]'
    : isSakura
    ? 'bg-[#FDF6F8] border-[#F2D6DC]'
    : 'bg-[#F8F6F2] border-[#E7E3DF]';

  // 3D Viewport Controls & State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [songModalOpen, setSongModalOpen] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [cameraPreset, setCameraPreset] = useState<ViewerCameraPreset>('front');
  const [environment, setEnvironment] = useState<ViewerEnvironment>(
    isDark ? 'dark' : isSakura ? 'sakura' : 'studio'
  );
  const [showGrid, setShowGrid] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(2); // Default to Slot 3 (Center front)

  const orbitControlsRef = useRef<OrbitControlsImpl>(null);

  // Multi-GLB Character Loader with Concert Animation Support
  const {
    loadedCharacters,
    selectedInstanceId,
    setSelectedInstanceId,
    loading,
    loadingCharacter,
    loadingProgress,
    error,
    loadCharacter,
    playAnimation,
    setAllCharactersAnimation,
    togglePlayPauseAnimation,
    removeCharacter,
    clearCharacters,
    updateCharacterTransform,
  } = useCharacterLoader();

  // Persistent YouTube Music Controller (Single Source of Truth)
  const {
    videoId,
    videoTitle,
    isPlaying,
    isPaused,
    play,
    pause,
    stop,
    togglePlay,
    setVideo,
  } = useConcertMusic();

  // 10-Character Concert Stage Initialization (Curved Formation)
  const hasInitializedRef = useRef(false);
  const [concertLoadingProgress, setConcertLoadingProgress] = useState<{ loaded: number; total: number }>({
    loaded: 0,
    total: DEFAULT_CONCERT_PERFORMERS.length,
  });
  const [isConcertInitializing, setIsConcertInitializing] = useState(true);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    async function initConcert() {
      setIsConcertInitializing(true);
      for (let i = 0; i < DEFAULT_CONCERT_PERFORMERS.length; i++) {
        const performer = DEFAULT_CONCERT_PERFORMERS[i];
        const transform = getConcertSlotTransform(i, DEFAULT_CONCERT_PERFORMERS.length);
        try {
          await loadCharacter(performer, {
            replace: i === 0, // Clears initial placeholder on first model
            position: transform.position,
            rotation: transform.rotation,
            scale: transform.scale,
            slotIndex: i,
            stageRow: transform.row,
            initialAnimation: isPlaying ? 'Cafe_Reaction' : 'Cafe_Idle', // Respect current playback state
          });
          setConcertLoadingProgress({ loaded: i + 1, total: DEFAULT_CONCERT_PERFORMERS.length });
        } catch (err) {
          console.error(`[Concert] Failed to load slot ${i + 1} (${performer.name}):`, err);
        }
      }
      setIsConcertInitializing(false);
    }

    initConcert();
  }, [loadCharacter, isPlaying]);

  // Synchronized animation state machine:
  // YouTube PLAYING (isPlaying === true)  -> Cafe_Reaction for all 10 characters
  // YouTube PAUSED/STOPPED (isPlaying === false) -> Cafe_Idle for all 10 characters
  useEffect(() => {
    if (isConcertInitializing || loadedCharacters.length === 0) return;

    if (isPlaying) {
      console.log('[Concert] YouTube is PLAYING -> Switching all 10 characters to Cafe_Reaction');
      setAllCharactersAnimation('Cafe_Reaction');
    } else {
      console.log('[Concert] YouTube is PAUSED/STOPPED -> Switching all 10 characters to Cafe_Idle');
      setAllCharactersAnimation('Cafe_Idle');
    }
  }, [isPlaying, isConcertInitializing, loadedCharacters.length, setAllCharactersAnimation]);

  // Handle character replacement in selected slot from drawer
  const handleSelectFromDrawer = useCallback(
    (character: CharacterManifestEntry, mode: 'replace' | 'add') => {
      const activeChar = loadedCharacters.find((c) => c.id === selectedInstanceId);
      const targetSlot = activeChar?.slotIndex ?? selectedSlotIndex ?? 0;
      const transform = getConcertSlotTransform(targetSlot, DEFAULT_CONCERT_PERFORMERS.length);

      loadCharacter(character, {
        replace: false,
        slotIndex: targetSlot,
        stageRow: transform.row,
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
        initialAnimation: isPlaying ? 'Cafe_Reaction' : 'Cafe_Idle',
      });
    },
    [loadedCharacters, selectedInstanceId, selectedSlotIndex, isPlaying, loadCharacter]
  );

  // Reset Camera Framing
  const handleResetCamera = useCallback(() => {
    setCameraPreset('front');
  }, []);

  // Selected character details for status bar
  const selectedCharacter = useMemo(() => {
    return loadedCharacters.find((c) => c.id === selectedInstanceId) || loadedCharacters[0];
  }, [loadedCharacters, selectedInstanceId]);

  return (
    <div
      className={`relative w-full h-full min-h-0 flex-1 overflow-hidden flex flex-col select-none ${containerBg} ${className}`}
    >
      {/* =========================================================================
          MINI PRESENTATION MODE: COMPACT OVERLAY HEADER
          ========================================================================= */}
      {isMini && (
        <div className="shrink-0 z-30 px-3 py-2 bg-black/75 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-purple-400'
              }`}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A898F8] leading-tight flex items-center gap-1">
                <Music2 className="h-3 w-3 inline" />
                <span>{isPlaying ? 'Cafe_Reaction' : 'Cafe_Idle'}</span>
              </span>
              <span className="font-semibold text-white/90 text-xs truncate max-w-[150px] leading-tight">
                {videoTitle}
              </span>
            </div>
          </div>

          {/* Mini Action Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Play / Pause Toggle */}
            <button
              type="button"
              onClick={togglePlay}
              className={`p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${
                isPlaying
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
              }`}
              title={isPlaying ? 'Pause Music (Characters switch to Cafe_Idle)' : 'Resume Music (Characters switch to Cafe_Reaction)'}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
            </button>

            {/* Expand to Full Concert View */}
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title="Expand to Full Concert Stage"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Quit Mini Concert */}
            {onCloseMini && (
              <button
                type="button"
                onClick={onCloseMini}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/80 text-white/80 hover:text-white transition-all cursor-pointer"
                title="Quit Concert (Stops music and closes overlay)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL PRESENTATION MODE: TOP CONTROL BAR & CONCERT STATUS
          ========================================================================= */}
      {!isMini && (
        <div className="relative shrink-0 z-20 flex flex-wrap items-center justify-between p-2.5 sm:p-3 bg-white/80 dark:bg-[#1A1824]/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-purple-500'
                }`}
              />
              <div className="flex flex-col">
                <span className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7] leading-tight flex items-center gap-1.5">
                  <span>Blue Archive 10-Character Live Concert</span>
                  <span className="px-1.5 py-0.2 rounded bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A898F8] text-[9.5px] font-mono">
                    Curved Arc
                  </span>
                </span>
                <span className="text-[10px] text-[#77747D] dark:text-[#A4A1AA] font-mono leading-tight">
                  5 Front • 5 Back Elevated (+0.50m)
                </span>
              </div>
            </div>

            {/* Selected Performer Badge */}
            {selectedCharacter && (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
                <span className="px-2.5 py-0.5 rounded-lg bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A898F8] border border-[#7567C7]/20 flex items-center gap-1 font-bold">
                  <User className="h-3 w-3" />
                  <span>
                    Slot {(selectedCharacter.slotIndex ?? 0) + 1}: {selectedCharacter.manifestEntry.name}
                  </span>
                </span>

                {selectedCharacter.currentAnimationName && (
                  <span
                    className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 font-semibold text-[10.5px] ${
                      isPlaying
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                    }`}
                  >
                    <Film className="h-3 w-3" />
                    <span>{selectedCharacter.currentAnimationName}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* PRIMARY CONCERT CONTROLS: YOUTUBE MUSIC & ROSTER */}
          <div className="flex items-center gap-2">
            {/* Song Selection Trigger */}
            <button
              type="button"
              onClick={() => setSongModalOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-black/5 dark:border-white/5 transition-colors"
              title="Change YouTube Concert Track"
            >
              <Youtube className="h-3.5 w-3.5 text-red-500" />
              <span className="max-w-[120px] sm:max-w-[160px] truncate">{videoTitle}</span>
            </button>

            {/* Main Concert Play/Pause Toggle */}
            <button
              type="button"
              id="concert-music-toggle-btn"
              onClick={togglePlay}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md ${
                isPlaying
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/50 animate-pulse'
                  : 'bg-gradient-to-r from-[#7567C7] to-[#8B5CF6] hover:from-[#6556B8] hover:to-[#7B4CF0] text-white'
              }`}
              title={
                isPlaying
                  ? 'Pause YouTube music -> Switches all 10 characters to Cafe_Idle'
                  : 'Play YouTube music -> Switches all 10 characters to Cafe_Reaction'
              }
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4 fill-white shrink-0" />
                  <span>PAUSE MUSIC</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white shrink-0" />
                  <span>PLAY MUSIC</span>
                </>
              )}
            </button>

            {/* Concert State Indicator Badge */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                isPlaying
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isPlaying ? 'bg-emerald-500 animate-ping' : 'bg-purple-400'
                }`}
              />
              <span>{isPlaying ? 'PERFORMING (Cafe_Reaction)' : 'IDLE (Cafe_Idle)'}</span>
            </div>

            {/* Character Roster Drawer Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 px-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border border-black/5 dark:border-white/5"
              title="Browse all 295 Blue Archive characters to swap into slots"
            >
              <FolderOpen className="h-3.5 w-3.5 text-[#7567C7]" />
              <span className="hidden sm:inline">Roster</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL PRESENTATION MODE: PERFORMER SLOT STRIP (Curved Slots Overview)
          ========================================================================= */}
      {!isMini && (
        <div className="shrink-0 z-10 px-3 py-1.5 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between overflow-x-auto text-[11px] font-semibold gap-2 scrollbar-none">
          <div className="flex items-center gap-1.5 shrink-0 text-[#77747D] dark:text-[#A4A1AA]">
            <span className="text-[10px] uppercase font-bold tracking-wider">Performer Slots:</span>
          </div>

          {/* 10 Slot Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {Array.from({ length: DEFAULT_CONCERT_PERFORMERS.length }).map((_, slotIdx) => {
              const char = loadedCharacters.find((c) => c.slotIndex === slotIdx);
              const isSelected = selectedCharacter?.slotIndex === slotIdx;
              const isElevated = slotIdx >= Math.ceil(DEFAULT_CONCERT_PERFORMERS.length / 2);

              return (
                <button
                  key={`slot-badge-${slotIdx}`}
                  type="button"
                  onClick={() => {
                    setSelectedSlotIndex(slotIdx);
                    if (char) setSelectedInstanceId(char.id);
                  }}
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer border ${
                    isSelected
                      ? 'bg-[#7567C7] text-white border-[#7567C7] shadow-xs'
                      : isElevated
                      ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                      : 'bg-black/5 dark:bg-white/5 text-[#25242A] dark:text-white border-black/5 dark:border-white/5 hover:bg-black/10'
                  }`}
                  title={
                    char
                      ? `Slot ${slotIdx + 1}: ${char.manifestEntry.name} (${
                          isElevated ? 'Back Row Elevated Arc' : 'Front Row Arc'
                        })`
                      : `Slot ${slotIdx + 1}: Loading...`
                  }
                >
                  <span className="font-mono text-[9.5px] opacity-75">[{slotIdx + 1}]</span>
                  <span className="truncate max-w-[65px]">{char?.manifestEntry.name || 'Loading'}</span>
                  {isElevated && <span className="text-[8.5px] opacity-75">▲</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          3D CANVAS VIEWPORT (Concert Stage & 10 Performers in Curved Formation)
          ========================================================================= */}
      <div className="relative flex-1 min-h-0 w-full h-full bg-radial from-transparent to-black/15 overflow-hidden">
        <Canvas
          shadows
          camera={{ position: [0.0, 2.5, 7.5], fov: 40, near: 0.1, far: 50 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <Suspense fallback={null}>
            <ViewerEnvironment3D
              environment={environment}
              selectedSlotIndex={selectedCharacter?.slotIndex ?? selectedSlotIndex}
              onSelectSlot={(slotIdx) => {
                setSelectedSlotIndex(slotIdx);
                const char = loadedCharacters.find((c) => c.slotIndex === slotIdx);
                if (char) setSelectedInstanceId(char.id);
              }}
            />

            <OrbitControls
              ref={orbitControlsRef}
              enableDamping
              dampingFactor={0.08}
              minDistance={1.0}
              maxDistance={35.0}
              maxPolarAngle={Math.PI / 2 + 0.05}
              target={[0, 0.9, 0]}
              enabled={!isMini}
            />

            {/* Render all loaded character instances in scene */}
            {loadedCharacters.map((char) => (
              <CharacterInstanceMesh
                key={char.id}
                instance={char}
                isSelected={selectedInstanceId === char.id && loadedCharacters.length > 1 && !isMini}
                wireframe={showWireframe}
              />
            ))}

            {/* Optional Ground Grid (in Full mode only) */}
            {showGrid && !isMini && (
              <DreiGrid
                position={[0, 0, 0]}
                args={[16, 16]}
                cellSize={0.5}
                cellThickness={1.0}
                cellColor="#7567C7"
                sectionSize={2.0}
                sectionThickness={1.5}
                sectionColor="#9A8BF0"
                fadeDistance={18}
                fadeStrength={1.5}
              />
            )}

            {/* Dynamic Camera Auto-Framer for Curved 10-Character Formation */}
            <DynamicCameraAutoFramer
              loadedCharacters={loadedCharacters}
              cameraPreset={cameraPreset}
              controlsRef={orbitControlsRef}
              isMini={isMini}
            />
          </Suspense>
        </Canvas>

        {/* Initial Concert Ensemble Loading Overlay */}
        {isConcertInitializing && !isMini && (
          <div className="absolute top-4 left-4 z-30 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-[#1A1824]/95 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-xl flex items-center gap-3 text-xs text-[#25242A] dark:text-white animate-in fade-in">
            <RefreshCw className="h-5 w-5 animate-spin text-[#7567C7] shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold">
                Assembling Concert Ensemble ({concertLoadingProgress.loaded}/{concertLoadingProgress.total})
              </span>
              <span className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">
                {loadingCharacter ? `Loading ${loadingCharacter.name}...` : 'Initializing curved stage formation...'}
              </span>
            </div>
          </div>
        )}

        {/* Loading Single Replacement Progress */}
        {!isConcertInitializing && loading && loadingCharacter && !isMini && (
          <div className="absolute top-4 left-4 z-30 px-3.5 py-2 rounded-2xl bg-white/90 dark:bg-[#1A1824]/90 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-lg flex items-center gap-2.5 text-xs text-[#25242A] dark:text-white animate-in fade-in">
            <RefreshCw className="h-4 w-4 animate-spin text-[#7567C7]" />
            <div className="flex flex-col">
              <span className="font-bold">Loading {loadingCharacter.name}</span>
              <span className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">
                {loadingProgress > 0 ? `${loadingProgress}% downloaded` : 'Fetching remote GLB...'}
              </span>
            </div>
          </div>
        )}

        {/* Loading Error Notice */}
        {error && !isMini && (
          <div className="absolute top-4 left-4 z-30 px-3.5 py-2.5 rounded-2xl bg-red-500/10 dark:bg-red-500/20 backdrop-blur-md border border-red-500/30 shadow-lg flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 max-w-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Failed to load {error.character.name}</p>
              <p className="text-[10.5px] opacity-80 break-words">{error.message}</p>
            </div>
          </div>
        )}

        {/* Bottom Viewport Toolbar with Concert Controls (in Full mode only) */}
        {!isMini && (
          <CharacterViewerToolbar
            theme={theme}
            loadedCharacters={loadedCharacters}
            selectedInstanceId={selectedInstanceId}
            cameraPreset={cameraPreset}
            onSelectCameraPreset={setCameraPreset}
            environment={environment}
            onSelectEnvironment={setEnvironment}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
            showWireframe={showWireframe}
            onToggleWireframe={() => setShowWireframe(!showWireframe)}
            onOpenBrowser={() => setDrawerOpen(true)}
            onResetCamera={handleResetCamera}
            onSelectAnimation={playAnimation}
            onTogglePlayPause={togglePlayPauseAnimation}
            isConcertPlaying={isPlaying}
            onToggleConcertMusic={togglePlay}
          />
        )}

        {/* 295 Character Roster Browser Drawer */}
        <CharacterBrowserDrawer
          theme={theme}
          isOpen={drawerOpen && !isMini}
          onClose={() => setDrawerOpen(false)}
          loadedCharacters={loadedCharacters}
          selectedInstanceId={selectedInstanceId}
          loading={loading}
          loadingCharacter={loadingCharacter}
          error={error}
          onSelectCharacter={handleSelectFromDrawer}
          onRemoveInstance={removeCharacter}
          onToggleInstanceVisibility={(id) => {
            const char = loadedCharacters.find((c) => c.id === id);
            if (char) updateCharacterTransform(id, { visible: !char.visible });
          }}
          onSelectInstance={(id) => {
            setSelectedInstanceId(id);
            const char = loadedCharacters.find((c) => c.id === id);
            if (char && char.slotIndex !== undefined) {
              setSelectedSlotIndex(char.slotIndex);
            }
          }}
          onClearAll={clearCharacters}
        />
      </div>

      {/* =========================================================================
          YOUTUBE TRACK SELECTOR MODAL (Full Mode Only)
          ========================================================================= */}
      {songModalOpen && !isMini && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#1E1C2B] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Youtube className="h-5 w-5 text-red-500" />
                <h3 className="font-bold text-sm text-[#25242A] dark:text-white">
                  Select Concert Soundtrack
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSongModalOpen(false)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Presets List */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#77747D]">
                Curated Concert Tracks
              </span>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {PRESET_CONCERT_TRACKS.map((t) => {
                  const isCurrent = t.id === videoId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setVideo(t.id, t.title);
                        setSongModalOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-colors cursor-pointer border ${
                        isCurrent
                          ? 'bg-[#7567C7]/15 border-[#7567C7]/30 text-[#7567C7] dark:text-[#A898F8] font-bold'
                          : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs truncate">{t.title}</span>
                        <span className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">{t.artist}</span>
                      </div>
                      {isCurrent && <Check className="h-4 w-4 text-[#7567C7] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom URL Input */}
            <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#77747D] block">
                Paste YouTube Music Video URL / ID
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customUrlInput.trim()) {
                    setVideo(customUrlInput.trim());
                    setCustomUrlInput('');
                    setSongModalOpen(false);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#25242A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7567C7]/50"
                />
                <button
                  type="submit"
                  disabled={!customUrlInput.trim()}
                  className="px-4 py-2 bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Load Track
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
