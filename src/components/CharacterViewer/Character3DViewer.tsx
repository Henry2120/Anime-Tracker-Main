import React, { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Grid as DreiGrid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  User,
  Users,
  Maximize2,
  RefreshCw,
  AlertCircle,
  FolderOpen,
  Play,
  Pause,
  Film,
  Square,
  X,
  Youtube,
  Disc3,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppTheme } from '../../types/theme';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, ViewerCameraPreset, ViewerEnvironment } from './types';
import { useCharacterLoader } from './useCharacterLoader';
import { CharacterInstanceMesh } from './CharacterInstanceMesh';
import { CharacterBrowserDrawer } from './CharacterBrowserDrawer';
import { CharacterViewerToolbar } from './CharacterViewerToolbar';
import { getConcertSlotTransform } from './concertConfig';
import { useConcertMusic, extractYouTubeVideoId } from './ConcertMusicContext';

interface Character3DViewerProps {
  theme?: AppTheme;
  className?: string;
  presentationMode?: 'full' | 'mini';
  onReturnToEnsemble?: () => void;
  onExpand?: () => void;
  onCloseMini?: () => void;
}

/**
 * Lighting & Environment System (Physical Stage Platform Removed)
 */
const ViewerEnvironment3D: React.FC<{
  environment: ViewerEnvironment;
}> = ({ environment }) => {
  const envConfigs = {
    studio: {
      ambientIntensity: 0.9,
      keyColor: '#FFFFFF',
      keyIntensity: 1.4,
      fillColor: '#D8E5FF',
      fillIntensity: 0.6,
      rimColor: '#E6E6FA',
      rimIntensity: 1.0,
      shadowOpacity: 0.45,
    },
    dark: {
      ambientIntensity: 0.75,
      keyColor: '#F0E6FF',
      keyIntensity: 1.5,
      fillColor: '#6B7280',
      fillIntensity: 0.5,
      rimColor: '#BCA8F8',
      rimIntensity: 1.4,
      shadowOpacity: 0.75,
    },
    sakura: {
      ambientIntensity: 0.95,
      keyColor: '#FFF0F5',
      keyIntensity: 1.35,
      fillColor: '#FCE7F3',
      fillIntensity: 0.7,
      rimColor: '#F472B6',
      rimIntensity: 1.2,
      shadowOpacity: 0.45,
    },
    sunset: {
      ambientIntensity: 0.8,
      keyColor: '#FFEDD5',
      keyIntensity: 1.6,
      fillColor: '#C084FC',
      fillIntensity: 0.6,
      rimColor: '#FB923C',
      rimIntensity: 1.3,
      shadowOpacity: 0.6,
    },
    clean: {
      ambientIntensity: 1.15,
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

      {/* Key Directional Light with Soft Shadows */}
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

      {/* Rim Silhouette Backlight */}
      <directionalLight
        position={[0, 6.0, -5.0]}
        intensity={envConfigs.rimIntensity}
        color={envConfigs.rimColor}
      />

      {/* Soft Contact Shadows on the floor under standing performers */}
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={envConfigs.shadowOpacity}
        scale={16.0}
        blur={1.8}
        far={3.0}
      />
    </>
  );
};

/**
 * Camera Auto-Framer for Free-Standing Curved Concert Formation
 * - Frames actual loaded character models only (no stage bounds)
 * - Preserves user's manual zoom and rotation (does NOT fight OrbitControls)
 */
const DynamicCameraAutoFramer: React.FC<{
  loadedCharacters: LoadedCharacterInstance[];
  cameraPreset: ViewerCameraPreset;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isMini?: boolean;
}> = ({ loadedCharacters, cameraPreset, controlsRef, isMini = false }) => {
  const { camera, size } = useThree();
  const lastFramedKeyRef = useRef<string>('');

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

    if (visibleCount === 0) {
      return {
        center: new THREE.Vector3(0, 0.8, 0),
        minY: 0,
        maxY: 1.6,
        height: 1.6,
        width: 2.0,
        depth: 1.0,
        radius: 1.5,
      };
    }

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

  // Adjust camera only when preset changes, character count changes, or presentation mode changes
  useEffect(() => {
    const frameKey = `${cameraPreset}-${loadedCharacters.length}-${isMini ? 'mini' : 'full'}`;
    if (lastFramedKeyRef.current === frameKey) {
      return;
    }
    lastFramedKeyRef.current = frameKey;

    const { center, minY, height, width, radius } = calculateBounds();

    const persCamera = camera as THREE.PerspectiveCamera;
    const fovRad = (persCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));

    const distY = (height * 1.35) / (2 * Math.tan(fovRad / 2));
    const distX = (width * 1.3) / (2 * Math.tan(fovRad / 2) * aspect);
    const distSphere = radius * 2.0;

    const distance = Math.max(distY, distX, distSphere, isMini ? 4.2 : 4.8);
    const targetY = minY + height * (isMini ? 0.5 : 0.45);
    const target = new THREE.Vector3(center.x, targetY, center.z);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = 1.5;
      controls.maxDistance = 20.0;
    }

    if (isMini) {
      camera.position.set(center.x, targetY + distance * 0.28, center.z + distance * 1.05);
    } else if (cameraPreset === 'front') {
      camera.position.set(center.x, targetY + distance * 0.22, center.z + distance * 0.98);
    } else if (cameraPreset === 'perspective') {
      const radAzim = 0.38;
      const radElev = 0.28;
      camera.position.set(
        center.x + distance * Math.sin(radAzim) * Math.cos(radElev),
        targetY + distance * Math.sin(radElev),
        center.z + distance * Math.cos(radAzim) * Math.cos(radElev)
      );
    } else if (cameraPreset === 'side') {
      camera.position.set(center.x + distance, targetY + distance * 0.2, center.z);
    } else if (cameraPreset === 'closeUp') {
      const closeDist = Math.max(2.0, (width * 0.38) / (2 * Math.tan(fovRad / 2) * aspect));
      camera.position.set(center.x, 0.95, center.z + closeDist);
      if (controls) controls.target.set(center.x, 0.85, center.z);
    } else if (cameraPreset === 'top') {
      camera.position.set(center.x, targetY + distance * 1.25, center.z + 0.1);
    }

    camera.lookAt(target);
    persCamera.updateProjectionMatrix();

    if (controls) {
      controls.update();
    }
  }, [loadedCharacters.length, cameraPreset, camera, size.width, size.height, controlsRef, calculateBounds, isMini]);

  return null;
};

export const Character3DViewer: React.FC<Character3DViewerProps> = ({
  theme = 'light',
  className = '',
  presentationMode = 'full',
  onReturnToEnsemble,
  onExpand: _onExpand,
  onCloseMini: _onCloseMini,
}) => {
  const isMini = presentationMode === 'mini';
  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  // Matching container background to current Anime Tracker theme family
  const containerBg = isDark
    ? 'bg-[#14121C] text-[#F4F2F7]'
    : isSakura
    ? 'bg-[#FDF6F8] text-[#25242A]'
    : 'bg-[#F7F5F2] text-[#25242A]';

  // 3D Viewport Controls & State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [cameraPreset, setCameraPreset] = useState<ViewerCameraPreset>('front');
  const [environment, setEnvironment] = useState<ViewerEnvironment>(
    isDark ? 'dark' : isSakura ? 'sakura' : 'studio'
  );
  const [showGrid, setShowGrid] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);

  const orbitControlsRef = useRef<OrbitControlsImpl>(null);

  // Multi-GLB Character Loader with Concert Animation Support (Starts empty with 0 characters)
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
    stop,
    togglePlay,
    setVideo,
  } = useConcertMusic();

  // Synchronized animation state machine:
  // YouTube PLAYING (isPlaying === true)  -> Cafe_Reaction for all loaded characters
  // YouTube PAUSED/STOPPED (isPlaying === false) -> Cafe_Idle for all loaded characters
  useEffect(() => {
    if (loadedCharacters.length === 0) return;

    if (isPlaying) {
      setAllCharactersAnimation('Cafe_Reaction');
    } else {
      setAllCharactersAnimation('Cafe_Idle');
    }
  }, [isPlaying, loadedCharacters.length, setAllCharactersAnimation]);

  // Dynamically recalculate formation positions for all loaded characters whenever count changes
  useEffect(() => {
    const total = loadedCharacters.length;
    if (total === 0) return;

    loadedCharacters.forEach((char, index) => {
      const transform = getConcertSlotTransform(index, total);
      if (
        Math.abs(char.position.x - transform.position.x) > 0.01 ||
        Math.abs(char.position.y - transform.position.y) > 0.01 ||
        Math.abs(char.position.z - transform.position.z) > 0.01 ||
        char.slotIndex !== index
      ) {
        updateCharacterTransform(char.id, {
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
        });
        char.slotIndex = index;
        char.stageRow = transform.row;
      }
    });
  }, [loadedCharacters.length, updateCharacterTransform]);

  // Handle adding or replacing characters from the 295 Blue Archive roster drawer
  const handleSelectFromDrawer = useCallback(
    async (character: CharacterManifestEntry, mode: 'replace' | 'add') => {
      const isReplace = mode === 'replace' && loadedCharacters.length > 0 && selectedInstanceId !== null;
      let targetSlot = loadedCharacters.length;

      if (isReplace) {
        const activeChar = loadedCharacters.find((c) => c.id === selectedInstanceId);
        targetSlot = activeChar?.slotIndex ?? 0;
      }

      const projectedTotal = isReplace ? loadedCharacters.length : loadedCharacters.length + 1;
      const transform = getConcertSlotTransform(targetSlot, projectedTotal);

      try {
        await loadCharacter(character, {
          replace: isReplace,
          slotIndex: targetSlot,
          stageRow: transform.row,
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
          initialAnimation: isPlaying ? 'Cafe_Reaction' : 'Cafe_Idle',
        });
      } catch (err) {
        console.error(`[Concert] Failed to load character ${character.name}:`, err);
      }
    },
    [loadedCharacters, selectedInstanceId, isPlaying, loadCharacter]
  );

  // Handle loading YouTube URL/ID from direct input
  const handleLoadYouTube = useCallback(() => {
    const trimmed = youtubeInput.trim();
    if (!trimmed) return;
    const extracted = extractYouTubeVideoId(trimmed) || trimmed;
    setVideo(extracted, undefined, false); // Load/cue without auto-playing
    setYoutubeInput('');
  }, [youtubeInput, setVideo]);

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
          FULL PRESENTATION MODE: TOP YOUTUBE INPUT & CONTROL BAR
          ========================================================================= */}
      {!isMini && (
        <div className="shrink-0 z-20 px-3 sm:px-4 py-2.5 bg-white/90 dark:bg-[#161422]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2.5">
          {/* Direct YouTube Input Bar */}
          <div className="flex flex-1 items-center gap-2 min-w-[260px] max-w-xl">
            <div className="relative flex-1">
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLoadYouTube();
                }}
                placeholder="Paste YouTube URL or video ID (e.g. dUXIymB78YQ)..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none transition-all placeholder:text-[#9E9AA6]"
              />
              <Youtube className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            </div>
            <button
              type="button"
              onClick={handleLoadYouTube}
              disabled={!youtubeInput.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              Load
            </button>
          </div>

          {/* Transport Controls & Status */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Current Track Badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs">
              <Disc3 className={`h-3.5 w-3.5 ${isPlaying ? 'text-emerald-500 animate-spin' : 'text-[#7567C7]'}`} />
              <span className="font-semibold text-xs truncate max-w-[170px] text-[#25242A] dark:text-[#F4F2F7]">
                {videoTitle || (videoId ? `ID: ${videoId}` : 'No track loaded')}
              </span>
            </div>

            {/* Play / Pause Toggle */}
            <button
              type="button"
              onClick={togglePlay}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm ${
                isPlaying
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/40 animate-pulse'
                  : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
              }`}
              title={isPlaying ? 'Pause music (performers switch to Cafe_Idle)' : 'Play music (performers switch to Cafe_Reaction)'}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5 fill-white" />
                  <span>PAUSE</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>PLAY</span>
                </>
              )}
            </button>

            {/* Stop Button */}
            <button
              type="button"
              onClick={stop}
              className="px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-red-500 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
              title="Stop YouTube Playback"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">STOP</span>
            </button>

            {/* Roster Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-black/5 dark:border-white/5"
            >
              <Users className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Roster ({loadedCharacters.length})</span>
            </button>

            {/* Clear All Button */}
            {loadedCharacters.length > 0 && (
              <button
                type="button"
                onClick={clearCharacters}
                className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-red-500/10 text-[#77747D] hover:text-red-500 text-xs transition-colors cursor-pointer border border-black/5 dark:border-white/5"
                title="Clear all performers from stage"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL PRESENTATION MODE: PERFORMER SLOT STRIP (Derived from loadedCharacters)
          ========================================================================= */}
      {!isMini && (
        <div className="shrink-0 z-10 px-3 py-1.5 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between overflow-x-auto text-[11px] font-semibold gap-2 scrollbar-none">
          <div className="flex items-center gap-1.5 shrink-0 text-[#77747D] dark:text-[#A4A1AA]">
            <span className="text-[10px] uppercase font-bold tracking-wider">
              Performers ({loadedCharacters.length}):
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {loadedCharacters.map((char, slotIdx) => {
              const isSelected = selectedCharacter?.id === char.id;
              const isElevated = char.stageRow === 'back';

              return (
                <div
                  key={char.id}
                  className={`group pl-2 pr-1.5 py-0.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 border ${
                    isSelected
                      ? 'bg-[#7567C7] text-white border-[#7567C7] shadow-xs'
                      : isElevated
                      ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20'
                      : 'bg-black/5 dark:bg-white/5 text-[#25242A] dark:text-white border-black/5 dark:border-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInstanceId(char.id);
                    }}
                    className="flex items-center gap-1 cursor-pointer text-left"
                    title={`Slot ${slotIdx + 1}: ${char.manifestEntry.name} (${
                      isElevated ? 'Back Row Elevated' : 'Front Row'
                    })`}
                  >
                    <span className="font-mono text-[9.5px] opacity-75">[{slotIdx + 1}]</span>
                    <span className="truncate max-w-[80px] font-bold">{char.manifestEntry.name}</span>
                    {isElevated && <span className="text-[8.5px] opacity-75">▲</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => removeCharacter(char.id)}
                    className="p-0.5 rounded hover:bg-black/20 dark:hover:bg-white/20 text-current transition-colors cursor-pointer"
                    title={`Remove ${char.manifestEntry.name} from stage`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {/* Quick Add Performer Trigger */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="px-2 py-0.5 rounded-lg border border-dashed border-[#7567C7]/40 text-[#7567C7] dark:text-[#A898F8] hover:bg-[#7567C7]/10 flex items-center gap-1 text-[11px] font-bold transition-all cursor-pointer shrink-0"
              title="Add character from roster"
            >
              <Plus className="h-3 w-3" />
              <span>Add Performer</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          3D CANVAS VIEWPORT (Free-Standing Curved Formation & Shadows)
          ========================================================================= */}
      <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden">
        <Canvas
          shadows
          camera={{ position: [0.0, 2.5, 7.5], fov: 40, near: 0.1, far: 50 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <Suspense fallback={null}>
            <ViewerEnvironment3D environment={environment} />

            {/* Interactive OrbitControls: Fully active and zoomable in both Full and Mini mode */}
            <OrbitControls
              ref={orbitControlsRef}
              enableDamping
              dampingFactor={0.08}
              minDistance={1.5}
              maxDistance={20.0}
              maxPolarAngle={Math.PI / 2 + 0.05}
              target={[0, 0.9, 0]}
              enabled={true}
            />

            {/* Render all loaded character instances in curved formation */}
            {loadedCharacters.map((char) => (
              <CharacterInstanceMesh
                key={char.id}
                instance={char}
                isSelected={selectedInstanceId === char.id && loadedCharacters.length > 1 && !isMini}
                wireframe={showWireframe}
              />
            ))}

            {/* Ground Grid (Full mode only) */}
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

            {/* Dynamic Camera Auto-Framer */}
            <DynamicCameraAutoFramer
              loadedCharacters={loadedCharacters}
              cameraPreset={cameraPreset}
              controlsRef={orbitControlsRef}
              isMini={isMini}
            />
          </Suspense>
        </Canvas>

        {/* =======================================================================
            EMPTY STAGE STATE OVERLAY (When 0 characters are loaded)
            ======================================================================= */}
        {loadedCharacters.length === 0 && !loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <div className="px-5 py-4 rounded-3xl bg-white/80 dark:bg-[#14121C]/80 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl flex flex-col items-center gap-3 text-center max-w-sm pointer-events-auto">
              <div className="w-10 h-10 rounded-2xl bg-[#7567C7]/15 flex items-center justify-center text-[#7567C7]">
                <Users className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7]">
                  No characters loaded
                </p>
                <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                  Open the roster to add Blue Archive performers to the concert stage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Open Character Roster</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading Progress Notice */}
        {loading && loadingCharacter && (
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

        {/* Error Notice */}
        {error && (
          <div className="absolute top-4 left-4 z-30 px-3.5 py-2.5 rounded-2xl bg-red-500/10 dark:bg-red-500/20 backdrop-blur-md border border-red-500/30 shadow-lg flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 max-w-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Failed to load {error.character.name}</p>
              <p className="text-[10.5px] opacity-80 break-words">{error.message}</p>
            </div>
          </div>
        )}

        {/* Bottom Viewport Toolbar (Full mode only) */}
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
          }}
          onClearAll={clearCharacters}
        />
      </div>
    </div>
  );
};
