import React, { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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
  Moon,
  Waves,
  Sparkles,
  Activity,
  Box,
  Compass,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import {
  CharacterManifestEntry,
  BLUE_ARCHIVE_CHARACTERS,
  getCharacterById,
} from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, ViewerCameraPreset, ViewerEnvironment } from './types';
import { useCharacterLoader } from './useCharacterLoader';
import { CharacterInstanceMesh } from './CharacterInstanceMesh';
import { CharacterBrowserDrawer } from './CharacterBrowserDrawer';
import { CharacterViewerToolbar } from './CharacterViewerToolbar';
import { getConcertSlotTransform } from './concertConfig';
import { useConcertMusic, extractYouTubeVideoId } from './ConcertMusicContext';
import {
  NightBeachScene,
  MeadowEnvironmentLayers,
  DEFAULT_MEADOW_LAYERS,
} from './NightBeachScene';
import { SceneDebuggerPanel, SceneDebuggerData } from './SceneDebuggerPanel';
import { InstrumentAnalysisView } from './InstrumentAnalysisView';
import { EnvironmentPreviewPanel } from './EnvironmentPreviewPanel';
import { CompositeEnvironment } from './scenery/CompositeEnvironment';
import {
  SceneryConfig,
  DEFAULT_SCENERY_CONFIG,
} from './scenery/sceneryTypes';

interface Character3DViewerProps {
  theme?: AppTheme;
  className?: string;
  presentationMode?: 'full' | 'mini';
  isSuspended?: boolean;
  onReturnToEnsemble?: () => void;
  onExpand?: () => void;
  onCloseMini?: () => void;
}

/**
 * Procedural Studio Contact Shadow Texture generator for standard stage environments.
 * Renders as a lightweight native Three.js mesh, completely bypassing buggy ContactShadows render passes.
 */
function createStudioContactShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.46;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, 'rgba(12, 10, 24, 0.65)');
  grad.addColorStop(0.28, 'rgba(14, 12, 28, 0.42)');
  grad.addColorStop(0.58, 'rgba(16, 14, 32, 0.16)');
  grad.addColorStop(0.85, 'rgba(20, 18, 38, 0.03)');
  grad.addColorStop(1, 'rgba(20, 18, 38, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const StudioContactShadow: React.FC<{ opacity: number; scale?: number }> = ({ opacity, scale = 16.0 }) => {
  const shadowTex = useMemo(() => createStudioContactShadowTexture(), []);
  if (!shadowTex || opacity <= 0) return null;

  return (
    <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[scale, scale]} />
      <meshBasicMaterial
        map={shadowTex}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
};

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
      shadowOpacity: 0, // Uniform pure white background without floor shadow gradient
    },
    dark: {
      ambientIntensity: 0.75,
      keyColor: '#F0E6FF',
      keyIntensity: 1.5,
      fillColor: '#6B7280',
      fillIntensity: 0.5,
      rimColor: '#BCA8F8',
      rimIntensity: 1.4,
      shadowOpacity: 0.65,
    },
    sakura: {
      ambientIntensity: 0.95,
      keyColor: '#FFF0F5',
      keyIntensity: 1.35,
      fillColor: '#FCE7F3',
      fillIntensity: 0.7,
      rimColor: '#F472B6',
      rimIntensity: 1.2,
      shadowOpacity: 0,
    },
    sunset: {
      ambientIntensity: 0.8,
      keyColor: '#FFEDD5',
      keyIntensity: 1.6,
      fillColor: '#C084FC',
      fillIntensity: 0.6,
      rimColor: '#FB923C',
      rimIntensity: 1.3,
      shadowOpacity: 0.5,
    },
    clean: {
      ambientIntensity: 1.15,
      keyColor: '#FFFFFF',
      keyIntensity: 1.2,
      fillColor: '#E5E7EB',
      fillIntensity: 0.5,
      rimColor: '#FFFFFF',
      rimIntensity: 0.8,
      shadowOpacity: 0,
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
      <StudioContactShadow opacity={envConfigs.shadowOpacity} scale={16.0} />
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
  isSpecialSceneActive?: boolean;
}> = ({
  loadedCharacters,
  cameraPreset,
  controlsRef,
  isMini = false,
  isSpecialSceneActive = false,
}) => {
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

  // Adjust camera only when preset changes, character count changes, or presentation/scene mode changes
  useEffect(() => {
    const frameKey = `${cameraPreset}-${loadedCharacters.length}-${isMini ? 'mini' : 'full'}-${
      isSpecialSceneActive ? 'beach' : 'stage'
    }`;
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

    const baseDistance = Math.max(distY, distX, distSphere, isMini ? 4.2 : 4.6);
    const distance = isSpecialSceneActive ? (isMini ? 4.2 : 4.6) : baseDistance;
    const targetY = isSpecialSceneActive ? 0.85 : minY + height * (isMini ? 0.5 : 0.45);
    const target = new THREE.Vector3(center.x, targetY, center.z);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = 0.8;
      controls.maxDistance = 35.0;
    }

    if (cameraPreset === 'front') {
      camera.position.set(center.x, targetY + distance * 0.15, center.z + distance * 0.98);
    } else if (cameraPreset === 'back') {
      camera.position.set(center.x, targetY + distance * 0.18, center.z - distance * 0.98);
    } else if (cameraPreset === 'perspective') {
      const radAzim = 0.38;
      const radElev = 0.28;
      camera.position.set(
        center.x + distance * Math.sin(radAzim) * Math.cos(radElev),
        targetY + distance * Math.sin(radElev),
        center.z + distance * Math.cos(radAzim) * Math.cos(radElev)
      );
    } else if (cameraPreset === 'side') {
      camera.position.set(center.x + distance * 0.95, targetY + distance * 0.18, center.z);
    } else if (cameraPreset === 'closeUp') {
      const closeDist = Math.max(1.8, (width * 0.38) / (2 * Math.tan(fovRad / 2) * aspect));
      camera.position.set(center.x, Math.max(0.85, targetY), center.z + closeDist);
      if (controls) controls.target.set(center.x, 0.85, center.z);
    } else if (cameraPreset === 'top') {
      camera.position.set(center.x, targetY + distance * 1.15, center.z + 0.1);
    }

    camera.lookAt(target);
    persCamera.updateProjectionMatrix();

    if (controls) {
      controls.update();
    }
  }, [
    loadedCharacters.length,
    cameraPreset,
    camera,
    size.width,
    size.height,
    controlsRef,
    calculateBounds,
    isMini,
    isSpecialSceneActive,
  ]);

  return null;
};

export const Character3DViewer: React.FC<Character3DViewerProps> = ({
  theme = 'light',
  className = '',
  presentationMode = 'full',
  isSuspended = false,
  onReturnToEnsemble,
  onExpand: _onExpand,
  onCloseMini: _onCloseMini,
}) => {
  const isMini = presentationMode === 'mini';
  const isDark = isDarkThemeFamily(theme || 'light');
  const isSakura = theme === 'sakura';

  // 3D Viewport Controls & State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [cameraPreset, setCameraPreset] = useState<ViewerCameraPreset>('front');
  const [environment, setEnvironment] = useState<ViewerEnvironment>(
    isDark ? 'dark' : isSakura ? 'sakura' : 'studio'
  );
  const [showGrid, setShowGrid] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [isDebuggerOpen, setIsDebuggerOpen] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<{ timestamp: string; subsystem: string; message: string }[]>([]);

  // Standalone Feature Tabs: 'viewer' (3D Viewer) vs 'analysis' (Instrument Analysis) vs 'environment' (Environment Preview)
  const [activeTab, setActiveTab] = useState<'viewer' | 'analysis' | 'environment'>('viewer');

  // Independent Custom Scenery Configuration & Preview States
  const [previewSceneryConfig, setPreviewSceneryConfig] = useState<SceneryConfig>(DEFAULT_SCENERY_CONFIG);
  const [appliedSceneryConfig, setAppliedSceneryConfig] = useState<SceneryConfig>(DEFAULT_SCENERY_CONFIG);
  const [isCustomSceneryActive, setIsCustomSceneryActive] = useState<boolean>(false);

  // Independent Meadow Environment Layers (all default to OFF = false)
  const [meadowLayers, setMeadowLayers] = useState<MeadowEnvironmentLayers>(DEFAULT_MEADOW_LAYERS);

  // Special Hina Piano Environment master toggle (defaults to OFF = false)
  const [specialEnvironmentEnabled, setSpecialEnvironmentEnabled] = useState<boolean>(false);

  const handleApplyEnvironment = useCallback(() => {
    setAppliedSceneryConfig({ ...previewSceneryConfig });
    setIsCustomSceneryActive(true);
  }, [previewSceneryConfig]);

  const handleResetEnvironment = useCallback(() => {
    setPreviewSceneryConfig(DEFAULT_SCENERY_CONFIG);
    setAppliedSceneryConfig(DEFAULT_SCENERY_CONFIG);
    setIsCustomSceneryActive(false);
    setSpecialEnvironmentEnabled(false);
    setMeadowLayers(DEFAULT_MEADOW_LAYERS);
  }, []);

  const handleEnterViewportPreview = useCallback(() => {
    setIsCustomSceneryActive(true);
    setActiveTab('viewer');
  }, []);

  const handleUpdateMeadowLayers = useCallback((updated: Partial<MeadowEnvironmentLayers>) => {
    setMeadowLayers((prev) => ({ ...prev, ...updated }));
  }, []);

  const handleResetMeadowLayers = useCallback(() => {
    setMeadowLayers(DEFAULT_MEADOW_LAYERS);
  }, []);

  const handleToggleSpecialEnvironment = useCallback(() => {
    setSpecialEnvironmentEnabled((prev) => !prev);
  }, []);

  // WebGL Render loop guard: demand frameloop whenever view is hidden or suspended
  const isCanvasActive = !isSuspended && (activeTab === 'viewer' || isMini);

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
    isPaused,
    isStopped,
    isConcertActive,
    stop,
    togglePlay,
    setVideo,
  } = useConcertMusic();

  // Check if loaded character is Dress Hina and she is the only character placed in the 3D viewer
  const isDressHinaAlone = useMemo(() => {
    if (loadedCharacters.length !== 1) return false;
    const char = loadedCharacters[0];
    if (!char || !char.manifestEntry) return false;

    const id = (char.manifestEntry.id || '').toLowerCase();
    const filename = (char.manifestEntry.filename || '').toLowerCase();
    const name = (char.manifestEntry.name || '').toLowerCase();

    const isHina = id.includes('hina') || filename.includes('hina') || name.includes('hina');
    const isDress = id.includes('dress') || filename.includes('dress') || name.includes('dress');

    return isHina && isDress;
  }, [loadedCharacters]);

  // Activate the meadow only when all conditions are satisfied:
  // 1. Dress Hina is the only character placed in the 3D viewer.
  // 2. The existing music player reports that music is actively playing.
  // 3. The special environment manual switch is enabled.
  // When any condition becomes false, disable the meadow and restore the normal viewer environment immediately.
  const isSpecialSceneActive = isDressHinaAlone && isPlaying && specialEnvironmentEnabled;

  const activeCustomConfig = useMemo(() => {
    return isCustomSceneryActive ? previewSceneryConfig : appliedSceneryConfig;
  }, [isCustomSceneryActive, previewSceneryConfig, appliedSceneryConfig]);

  const isCustomEnvActive = useMemo(() => {
    return isCustomSceneryActive && Object.values(activeCustomConfig).some(Boolean);
  }, [isCustomSceneryActive, activeCustomConfig]);

  const loadedCharactersRef = useRef(loadedCharacters);
  useEffect(() => {
    loadedCharactersRef.current = loadedCharacters;
  }, [loadedCharacters]);

  // Synchronized animation state machine for performance & ensemble concert:
  // 1. Dress Hina Piano Performance:
  //    When Dress Hina is alone on stage and YouTube music is playing (isPlaying === true),
  //    she performs her grand piano cut-in (Exs_Cutin) with her grand piano.
  //    When music stops or pauses (isPlaying === false), she gracefully returns to Cafe_Idle.
  // 2. Ensemble performers:
  //    YouTube PLAYING (isPlaying === true)  -> Cafe_Reaction
  //    YouTube PAUSED/STOPPED (isPlaying === false) -> Cafe_Idle
  useEffect(() => {
    const chars = loadedCharactersRef.current;
    if (chars.length === 0) return;

    if (isDressHinaAlone) {
      const hina = chars[0];
      if (!hina) return;
      const targetAnim = isPlaying ? 'Exs_Cutin' : 'Cafe_Idle';
      if (hina.currentAnimationName !== targetAnim) {
        const hasTarget = hina.animations.some((a) => a.name === targetAnim);
        if (hasTarget) {
          playAnimation(hina.id, targetAnim);
        }
      }
      return;
    }

    const targetAnim = isPlaying ? 'Cafe_Reaction' : 'Cafe_Idle';
    chars.forEach((char) => {
      const isExs =
        char.currentAnimationName === 'Exs_Cutin' ||
        char.currentAnimationName === 'exs_cutin';
      if (isExs || char.currentAnimationName === targetAnim) return;

      const hasTarget = char.animations.some((a) => a.name === targetAnim);
      if (hasTarget) {
        playAnimation(char.id, targetAnim);
      }
    });
  }, [isPlaying, isDressHinaAlone, playAnimation]);

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

  // Quick trigger to load/stage Hina (Dress with Piano)
  const handleEquipHinaWithPiano = useCallback(async () => {
    const hinaWithPiano =
      getCharacterById('hina-dress-with-piano-296') ||
      BLUE_ARCHIVE_CHARACTERS.find((c) => c.filename === 'Hina_Dress_with_Piano.glb');
    if (hinaWithPiano) {
      await handleSelectFromDrawer(hinaWithPiano, 'replace');
    }
  }, [handleSelectFromDrawer]);

  // Log runtime loader errors for debugger diagnostics
  useEffect(() => {
    if (error) {
      setRuntimeErrors((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          subsystem: 'GLTF_Loader',
          message: `Failed to load ${error.character?.name || 'character'}: ${error.message}`,
        },
      ]);
    }
  }, [error]);

  // ESC key shortcut closes open debugger panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDebuggerOpen) {
        setIsDebuggerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDebuggerOpen]);

  // Compute live scene debugger diagnostics
  const debuggerData: SceneDebuggerData = useMemo(() => {
    const bgMode = isSpecialSceneActive
      ? 'PERFORMANCE_MEADOW'
      : environment === 'studio'
      ? 'STUDIO_WHITE'
      : environment.toUpperCase();

    const activeBgColor = isSpecialSceneActive
      ? '#050814'
      : environment === 'studio' || environment === 'clean'
      ? '#FFFFFF'
      : isDark
      ? '#14121C'
      : isSakura
      ? '#FDF6F8'
      : environment === 'sunset'
      ? '#2A1D2D'
      : '#FFFFFF';

    const activeSceneName = isSpecialSceneActive
      ? 'Night Meadow Performance'
      : environment === 'studio'
      ? 'Clean Studio Stage'
      : environment === 'dark'
      ? 'Dark Stage'
      : environment === 'sakura'
      ? 'Sakura Stage'
      : environment === 'sunset'
      ? 'Sunset Stage'
      : 'Clean Stage';

    const selectionReason = isSpecialSceneActive
      ? 'Dress Hina is the sole performer and YouTube concert music is actively playing in the viewer.'
      : isDressHinaAlone && !isPlaying
      ? 'Dress Hina is staged alone. Start music playback or YouTube concert to activate Night Meadow.'
      : loadedCharacters.length > 1
      ? `Standard Ensemble Stage (${loadedCharacters.length} performers on stage). Special solo performance disabled.`
      : loadedCharacters.length === 0
      ? 'No performers loaded on stage.'
      : `Standard Character Stage with active environment preset: ${environment}`;

    return {
      environment,
      isSpecialSceneActive,
      isDressHinaAlone,
      activeSceneName,
      sceneStatus: loading ? 'LOADING' : error ? 'ERROR' : 'READY',
      sceneTransition: loading ? 'LOADING_ASSETS' : isSpecialSceneActive ? 'NIGHT_MEADOW_ACTIVE' : 'IDLE',
      backgroundMode: bgMode,
      activeBackgroundColor: activeBgColor,
      selectionReason,
      fallbackActive: false,
      loadedCharacters,
      selectedInstanceId,
      loading,
      loadingProgress,
      loadingCharacterName: loadingCharacter?.name,
      videoId,
      videoTitle,
      isPlaying,
      isPaused,
      isStopped,
      isConcertActive,
      cameraPreset,
      showGrid,
      showWireframe,
      runtimeErrors,
      onClearErrors: () => setRuntimeErrors([]),
    };
  }, [
    environment,
    isSpecialSceneActive,
    isDressHinaAlone,
    loading,
    error,
    loadedCharacters,
    selectedInstanceId,
    loadingProgress,
    loadingCharacter,
    videoId,
    videoTitle,
    isPlaying,
    isPaused,
    isStopped,
    isConcertActive,
    cameraPreset,
    showGrid,
    showWireframe,
    runtimeErrors,
    isDark,
    isSakura,
  ]);

  // Matching container background to current Anime Tracker theme family (or night meadow if special scene active)
  // Ensures crisp White Background Consistency (#FFFFFF) across Studio and clean viewer modes
  const containerBg = isSpecialSceneActive
    ? 'bg-[#050814] text-[#F4F2F7]'
    : environment === 'studio' || environment === 'clean'
    ? 'bg-white text-[#25242A]'
    : environment === 'dark'
    ? 'bg-[#14121C] text-[#F4F2F7]'
    : environment === 'sakura'
    ? 'bg-[#FDF6F8] text-[#25242A]'
    : environment === 'sunset'
    ? 'bg-[#2A1D2D] text-[#F4F2F7]'
    : isDark
    ? 'bg-[#14121C] text-[#F4F2F7]'
    : 'bg-white text-[#25242A]';

  return (
    <div
      className={`relative w-full h-full min-h-0 flex-1 overflow-hidden flex flex-col select-none ${containerBg} ${className}`}
    >
      {/* =========================================================================
          TOP NAVIGATION TABS: 3D VIEWER vs INSTRUMENT ANALYSIS
          ========================================================================= */}
      {!isMini && (
        <div className="shrink-0 z-30 px-3 sm:px-4 py-2 bg-white/95 dark:bg-[#161422]/95 backdrop-blur-md border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('viewer')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'viewer'
                  ? 'bg-[#7567C7] text-white shadow-sm'
                  : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              <span>3D Viewer</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analysis')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'analysis'
                  ? 'bg-[#7567C7] text-white shadow-sm'
                  : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span>Instrument Analysis</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('environment')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'environment'
                  ? 'bg-[#7567C7] text-white shadow-sm'
                  : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <Compass className="h-3.5 w-3.5 text-purple-400" />
              <span>Environment Preview</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#77747D] dark:text-[#9E9AA6]">
            {activeTab === 'viewer' ? (
              <span className="font-semibold">
                {loadedCharacters.length} Performer{loadedCharacters.length !== 1 ? 's' : ''} on Stage
              </span>
            ) : activeTab === 'analysis' ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Isolated Track Analysis Interface
              </span>
            ) : (
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                Independent Stage Scenery Customizer
              </span>
            )}
          </div>
        </div>
      )}

      {/* Standalone Instrument Analysis Tab Panel */}
      {activeTab === 'analysis' && !isMini && (
        <InstrumentAnalysisView theme={theme} />
      )}

      {/* Standalone Environment Preview Tab Panel */}
      {activeTab === 'environment' && !isMini && (
        <EnvironmentPreviewPanel
          theme={theme}
          previewConfig={previewSceneryConfig}
          appliedConfig={appliedSceneryConfig}
          isPreviewActive={isCustomSceneryActive}
          onUpdatePreviewConfig={setPreviewSceneryConfig}
          onApplyEnvironment={handleApplyEnvironment}
          onResetEnvironment={handleResetEnvironment}
          onEnterViewportPreview={handleEnterViewportPreview}
        />
      )}

      {/* 3D Viewer Stage Container (Kept in DOM so WebGL canvas & performers persist seamlessly) */}
      <div
        className={`flex-1 min-h-0 w-full h-full flex-col overflow-hidden relative ${
          activeTab === 'viewer' || isMini ? 'flex' : 'hidden'
        }`}
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
            {/* Special Scene Active Indicator Badge */}
            {isSpecialSceneActive && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-950/70 via-teal-950/70 to-slate-900/70 border border-emerald-400/40 text-xs font-bold text-emerald-100 shadow-md">
                <Sparkles className="h-4 w-4 text-emerald-300" />
                <span className="hidden sm:inline">Night Meadow Performance</span>
              </div>
            )}

            {/* Quick Trigger Button when J3cg4tFLm7A is loaded but Hina with Piano is not on stage */}
            {videoId === 'J3cg4tFLm7A' && !isSpecialSceneActive && (
              <button
                type="button"
                onClick={handleEquipHinaWithPiano}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer ring-2 ring-purple-400/30"
                title="Stage Hina (Dress with Piano) to activate the Night Meadow Piano Performance"
              >
                <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                <span>Stage Hina (Dress with Piano)</span>
              </button>
            )}

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
          frameloop={isCanvasActive ? 'always' : 'demand'}
          camera={{ position: [0.0, 2.5, 7.5], fov: 40, near: 0.1, far: 150 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <Suspense fallback={null}>
            {/* White Background Consistency for standard viewer modes when no custom sky/environment */}
            {!isSpecialSceneActive && !isCustomEnvActive && (
              <color
                attach="background"
                args={[
                  environment === 'studio' || environment === 'clean'
                    ? '#FFFFFF'
                    : isDark
                    ? '#14121C'
                    : isSakura
                    ? '#FDF6F8'
                    : environment === 'sunset'
                    ? '#2A1D2D'
                    : '#FFFFFF',
                ]}
              />
            )}

            {isCustomEnvActive ? (
              <CompositeEnvironment
                config={activeCustomConfig}
                isPlaying={isPlaying}
                characterPosition={loadedCharacters[0]?.position}
              />
            ) : isSpecialSceneActive ? (
              <NightBeachScene
                characterPosition={loadedCharacters[0]?.position}
                character={loadedCharacters[0]}
                isPlaying={isPlaying}
                isMini={isMini}
                layers={meadowLayers}
              />
            ) : (
              <ViewerEnvironment3D environment={environment} />
            )}

            {/* Interactive OrbitControls: Full 360° horizontal and vertical inspection, zoom & pan */}
            <OrbitControls
              ref={orbitControlsRef}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.8}
              maxDistance={35.0}
              minPolarAngle={0.05}
              maxPolarAngle={Math.PI - 0.05}
              enablePan={true}
              target={[0, 0.85, 0]}
              enabled={true}
            />

            {/* Render all loaded character instances in curved formation */}
            {loadedCharacters.map((char) => (
              <CharacterInstanceMesh
                key={char.id}
                instance={char}
                isSelected={
                  selectedInstanceId === char.id &&
                  loadedCharacters.length > 1 &&
                  !isMini &&
                  !isSpecialSceneActive
                }
                wireframe={showWireframe}
              />
            ))}

            {/* Ground Grid (Full mode and regular stage only) */}
            {showGrid && !isMini && !isSpecialSceneActive && (
              <gridHelper
                args={[16, 32, '#7567C7', '#9A8BF0']}
                position={[0, 0, 0]}
              />
            )}

            {/* Dynamic Camera Auto-Framer */}
            <DynamicCameraAutoFramer
              loadedCharacters={loadedCharacters}
              cameraPreset={cameraPreset}
              controlsRef={orbitControlsRef}
              isMini={isMini}
              isSpecialSceneActive={isSpecialSceneActive}
            />
          </Suspense>
        </Canvas>

        {/* Floating Custom Scenery Preview Overlay Chip */}
        {isCustomEnvActive && activeTab === 'viewer' && !isMini && (
          <div className="absolute top-4 right-4 z-20 px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-[#1A1828]/95 backdrop-blur-xl border border-purple-500/30 shadow-xl flex items-center gap-2.5 text-xs animate-in fade-in">
            <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-bold">
              <Compass className="h-3.5 w-3.5 text-purple-500" />
              <span>Environment Preview</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/15 font-mono">
                {Object.values(activeCustomConfig).filter(Boolean).length} Active
              </span>
            </div>
            <div className="h-3.5 w-px bg-black/10 dark:bg-white/10" />
            <button
              type="button"
              onClick={handleApplyEnvironment}
              className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              title="Apply previewed environment to stage"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('environment')}
              className="text-[11px] font-bold text-[#7567C7] dark:text-[#A898F8] hover:underline cursor-pointer"
            >
              Customize
            </button>
            <button
              type="button"
              onClick={handleResetEnvironment}
              className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-red-500 transition-colors cursor-pointer"
              title="Exit preview and restore stage"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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
            isSpecialSceneActive={isSpecialSceneActive}
            isDebuggerOpen={isDebuggerOpen}
            onToggleDebugger={() => setIsDebuggerOpen((prev) => !prev)}
            meadowLayers={meadowLayers}
            onUpdateMeadowLayers={handleUpdateMeadowLayers}
            onResetMeadowLayers={handleResetMeadowLayers}
            specialEnvironmentEnabled={specialEnvironmentEnabled}
            onToggleSpecialEnvironment={handleToggleSpecialEnvironment}
          />
        )}

        {/* 3D Scene Debugger Diagnostic Console */}
        <SceneDebuggerPanel
          isOpen={isDebuggerOpen && !isMini}
          onClose={() => setIsDebuggerOpen(false)}
          data={debuggerData}
          onSelectAnimation={playAnimation}
        />

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
  </div>
  );
};
