import React, { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Users,
  RefreshCw,
  AlertCircle,
  FolderOpen,
  Play,
  Pause,
  Square,
  X,
  Youtube,
  Disc3,
  Plus,
  Trash2,
  Activity,
  Box,
  Compass,
  Mic,
  Radio,
  Sparkles,
  Hand,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { ViewerCameraPreset, ViewerEnvironment } from './types';
import { useCharacterLoader, getLoaderCacheStats } from './useCharacterLoader';
import { CharacterInstanceMesh } from './CharacterInstanceMesh';
import { CharacterBrowserDrawer } from './CharacterBrowserDrawer';
import { CharacterViewerToolbar } from './CharacterViewerToolbar';
import { getConcertSlotTransform } from './concertConfig';
import { useConcertMusic, extractYouTubeVideoId } from './ConcertMusicContext';
import { SceneDebuggerPanel, SceneDebuggerData } from './SceneDebuggerPanel';
import { InstrumentAnalysisView } from './InstrumentAnalysisView';
import { EnvironmentPreviewPanel } from './EnvironmentPreviewPanel';
import { CompositeEnvironment } from './scenery/CompositeEnvironment';
import { SceneryConfig, DEFAULT_SCENERY_CONFIG } from './scenery/sceneryTypes';
import {
  resolvePerformerClipName,
  resolvePerformerMapping,
  toCharacterManifestEntry,
} from './performerRegistry';
import {
  OrchestratorState,
  PerformanceMode,
  StagedPerformerRecord,
  createInitialOrchestratorState,
  findDuplicateStagedPerformer,
  markPerformerLoadFailed,
  registerLoadedPerformer,
  removePerformerByInstanceId,
  stepPerformanceOrchestrator,
} from './performanceOrchestrator';
import { YamnetTargetInstrumentName } from '../../utils/yamnetLabelMap';

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
 * Procedural Studio Contact Shadow Texture generator for neutral stage environments.
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
  grad.addColorStop(0, 'rgba(12, 10, 24, 0.55)');
  grad.addColorStop(0.28, 'rgba(14, 12, 28, 0.34)');
  grad.addColorStop(0.58, 'rgba(16, 14, 32, 0.12)');
  grad.addColorStop(0.85, 'rgba(20, 18, 38, 0.02)');
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
 * Uniform 3-Point Studio Lighting System (Zero Environment GLBs Loaded)
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
      shadowOpacity: 0.28,
    },
    dark: {
      ambientIntensity: 0.75,
      keyColor: '#F0E6FF',
      keyIntensity: 1.5,
      fillColor: '#6B7280',
      fillIntensity: 0.5,
      rimColor: '#BCA8F8',
      rimIntensity: 1.4,
      shadowOpacity: 0.6,
    },
    sakura: {
      ambientIntensity: 0.95,
      keyColor: '#FFF0F5',
      keyIntensity: 1.35,
      fillColor: '#FCE7F3',
      fillIntensity: 0.7,
      rimColor: '#F472B6',
      rimIntensity: 1.2,
      shadowOpacity: 0.25,
    },
    sunset: {
      ambientIntensity: 0.8,
      keyColor: '#FFEDD5',
      keyIntensity: 1.6,
      fillColor: '#C084FC',
      fillIntensity: 0.6,
      rimColor: '#FB923C',
      rimIntensity: 1.3,
      shadowOpacity: 0.48,
    },
    clean: {
      ambientIntensity: 1.15,
      keyColor: '#FFFFFF',
      keyIntensity: 1.2,
      fillColor: '#E5E7EB',
      fillIntensity: 0.5,
      rimColor: '#FFFFFF',
      rimIntensity: 0.8,
      shadowOpacity: 0.2,
    },
  }[environment];

  return (
    <>
      <ambientLight intensity={envConfigs.ambientIntensity} />

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

      <directionalLight
        position={[-5.0, 4.0, -2.0]}
        intensity={envConfigs.fillIntensity}
        color={envConfigs.fillColor}
      />

      <directionalLight
        position={[0, 6.0, -5.0]}
        intensity={envConfigs.rimIntensity}
        color={envConfigs.rimColor}
      />

      <StudioContactShadow opacity={envConfigs.shadowOpacity} scale={16.0} />
    </>
  );
};

/**
 * Lightweight FPS / Frame-time sampler running inside Canvas without triggering React re-renders.
 */
const StagePerformanceMonitor: React.FC<{
  metricsRef: React.MutableRefObject<{ fps: number; frameTimeMs: number }>;
}> = ({ metricsRef }) => {
  const accumTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  useFrame((_, delta) => {
    frameCountRef.current += 1;
    accumTimeRef.current += Math.min(delta, 0.25);

    if (accumTimeRef.current >= 0.5) {
      const avgFrameSec = accumTimeRef.current / frameCountRef.current;
      metricsRef.current = {
        fps: Math.max(1, Math.round(1 / Math.max(0.001, avgFrameSec))),
        frameTimeMs: Math.round(avgFrameSec * 10000) / 10,
      };
      accumTimeRef.current = 0;
      frameCountRef.current = 0;
    }
  });

  return null;
};

/**
 * Camera Auto-Framer for Free-Standing Curved Concert Formation
 * - Respects manual orbit/zoom (stops overriding once user manipulates controls)
 * - Re-frames on preset changes or explicit Reset Camera clicks
 */
const DynamicCameraAutoFramer: React.FC<{
  loadedCharactersCount: number;
  calculateBounds: () => {
    center: THREE.Vector3;
    minY: number;
    maxY: number;
    height: number;
    width: number;
    depth: number;
    radius: number;
  };
  cameraPreset: ViewerCameraPreset;
  presetResetNonce: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  userAdjustedCameraRef: React.MutableRefObject<boolean>;
  isMini?: boolean;
}> = ({
  loadedCharactersCount,
  calculateBounds,
  cameraPreset,
  presetResetNonce,
  controlsRef,
  userAdjustedCameraRef,
  isMini = false,
}) => {
  const { camera, size } = useThree();
  const lastFramedKeyRef = useRef<string>('');

  // Explicit preset selection or Reset Camera clears user-override flag
  useEffect(() => {
    userAdjustedCameraRef.current = false;
  }, [cameraPreset, presetResetNonce, userAdjustedCameraRef]);

  useEffect(() => {
    const frameKey = `${cameraPreset}-${loadedCharactersCount}-${isMini ? 'mini' : 'full'}-${presetResetNonce}`;
    if (lastFramedKeyRef.current === frameKey) {
      return;
    }

    // If only performer count changed while user already orbited/zoomed, don't fight manual view
    const prevParts = lastFramedKeyRef.current.split('-');
    const onlyCountChanged =
      prevParts.length === 4 &&
      prevParts[0] === cameraPreset &&
      prevParts[2] === (isMini ? 'mini' : 'full') &&
      prevParts[3] === String(presetResetNonce);

    if (onlyCountChanged && userAdjustedCameraRef.current) {
      lastFramedKeyRef.current = frameKey;
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

    const distance = Math.max(distY, distX, distSphere, isMini ? 4.2 : 4.6);
    const targetY = minY + height * (isMini ? 0.5 : 0.45);
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
    loadedCharactersCount,
    cameraPreset,
    presetResetNonce,
    camera,
    size.width,
    size.height,
    controlsRef,
    calculateBounds,
    isMini,
  ]);

  return null;
};

export const Character3DViewer: React.FC<Character3DViewerProps> = ({
  theme = 'light',
  className = '',
  presentationMode = 'full',
  isSuspended = false,
}) => {
  const isMini = presentationMode === 'mini';
  const isDark = isDarkThemeFamily(theme || 'light');
  const isSakura = theme === 'sakura';

  // 3D Viewport Controls & State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [cameraPreset, setCameraPreset] = useState<ViewerCameraPreset>('front');
  const [presetResetNonce, setPresetResetNonce] = useState<number>(0);
  const [environment, setEnvironment] = useState<ViewerEnvironment>(
    isDark ? 'dark' : isSakura ? 'sakura' : 'studio'
  );
  const [showGrid, setShowGrid] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [isDebuggerOpen, setIsDebuggerOpen] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<{ timestamp: string; subsystem: string; message: string }[]>([]);

  // Stage Performance Orchestrator Settings (Mode A: Automatic vs Mode B: Manual)
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('automatic');
  const [gracePeriodMs, setGracePeriodMs] = useState<number>(2500);
  const [stagedPerformers, setStagedPerformers] = useState<StagedPerformerRecord[]>([]);
  const [activeInstruments, setActiveInstruments] = useState<YamnetTargetInstrumentName[]>([]);
  const [activeVocals, setActiveVocals] = useState<boolean>(false);
  const [playbackTimeSec, setPlaybackTimeSec] = useState<number>(0);
  const [stageNotice, setStageNotice] = useState<string | null>(null);

  // Standalone Feature Tabs: 'viewer' vs 'analysis' vs 'environment' (ALL preserved)
  const [activeTab, setActiveTab] = useState<'viewer' | 'analysis' | 'environment'>('viewer');

  // Independent Custom Scenery Configuration (for explicit Environment Preview tab only)
  const [previewSceneryConfig, setPreviewSceneryConfig] = useState<SceneryConfig>(DEFAULT_SCENERY_CONFIG);
  const [appliedSceneryConfig, setAppliedSceneryConfig] = useState<SceneryConfig>(DEFAULT_SCENERY_CONFIG);
  const [isCustomSceneryActive, setIsCustomSceneryActive] = useState<boolean>(false);

  const handleApplyEnvironment = useCallback(() => {
    setAppliedSceneryConfig({ ...previewSceneryConfig });
    setIsCustomSceneryActive(true);
  }, [previewSceneryConfig]);

  const handleResetEnvironment = useCallback(() => {
    setPreviewSceneryConfig(DEFAULT_SCENERY_CONFIG);
    setAppliedSceneryConfig(DEFAULT_SCENERY_CONFIG);
    setIsCustomSceneryActive(false);
  }, []);

  const handleEnterViewportPreview = useCallback(() => {
    setIsCustomSceneryActive(true);
    setActiveTab('viewer');
  }, []);

  const isCanvasActive = !isSuspended && (activeTab === 'viewer' || isMini);
  const orbitControlsRef = useRef<OrbitControlsImpl>(null);
  const userAdjustedCameraRef = useRef<boolean>(false);
  const perfMetricsRef = useRef<{ fps: number; frameTimeMs: number }>({ fps: 60, frameTimeMs: 16.7 });
  const [debuggerMetrics, setDebuggerMetrics] = useState<{ fps: number; frameTimeMs: number }>({
    fps: 60,
    frameTimeMs: 16.7,
  });

  // Character Loader
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
    togglePlayPauseAnimation,
    removeCharacter,
    clearCharacters,
    updateCharacterTransform,
    batchUpdateFormationTransforms,
  } = useCharacterLoader();

  // Persistent YouTube & Shared YAMNet Context
  const {
    videoId,
    videoTitle,
    isPlaying,
    isPaused,
    isStopped,
    stop,
    togglePlay,
    setVideo,
    getCurrentTime,
    yamnetVideoId,
    yamnetSegments,
    yamnetStatus,
    yamnetError,
    yamnetUsingWorker,
    isStageYamnetCapturing,
    startStageLiveYamnet,
    stopStageLiveYamnet,
  } = useConcertMusic();

  const activeCustomConfig = useMemo(() => {
    return isCustomSceneryActive ? previewSceneryConfig : appliedSceneryConfig;
  }, [isCustomSceneryActive, previewSceneryConfig, appliedSceneryConfig]);

  const isCustomEnvActive = useMemo(() => {
    return isCustomSceneryActive && Object.values(activeCustomConfig).some(Boolean);
  }, [isCustomSceneryActive, activeCustomConfig]);

  const loadedCharactersRef = useRef(loadedCharacters);
  loadedCharactersRef.current = loadedCharacters;

  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  const performanceModeRef = useRef(performanceMode);
  performanceModeRef.current = performanceMode;

  const orchestratorStateRef = useRef<OrchestratorState>(
    createInitialOrchestratorState('automatic', videoId)
  );
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const manualClipOverrideRef = useRef<Record<string, string>>({});

  // Only consume YAMNet segments belonging to the active videoId
  const activeYamnetSegments = useMemo(() => {
    return yamnetVideoId === videoId ? yamnetSegments : [];
  }, [yamnetVideoId, videoId, yamnetSegments]);

  // Clear manual clip overrides when music starts playing or when switching to Automatic mode
  useEffect(() => {
    if (performanceMode === 'automatic' || isPlaying) {
      manualClipOverrideRef.current = {};
    }
  }, [performanceMode, isPlaying]);

  // Auto-dismiss transient stage notice
  useEffect(() => {
    if (!stageNotice) return;
    const t = setTimeout(() => setStageNotice(null), 4000);
    return () => clearTimeout(t);
  }, [stageNotice]);

  // Poll FPS metrics at 2Hz only while Debugger panel is open
  useEffect(() => {
    if (!isDebuggerOpen) return;
    setDebuggerMetrics(perfMetricsRef.current);
    const id = setInterval(() => {
      setDebuggerMetrics({ ...perfMetricsRef.current });
    }, 500);
    return () => clearInterval(id);
  }, [isDebuggerOpen]);

  // Helper to commit orchestrator UI snapshot cleanly without redundant React updates
  const syncStagedSnapshot = useCallback((state: OrchestratorState) => {
    const nextList = Object.values(state.performers);
    setStagedPerformers((prev) => {
      if (
        prev.length === nextList.length &&
        prev.every(
          (p, i) =>
            p.key === nextList[i].key &&
            p.lifecycle === nextList[i].lifecycle &&
            p.origin === nextList[i].origin &&
            p.instanceId === nextList[i].instanceId &&
            p.graceDeadlineMs === nextList[i].graceDeadlineMs
        )
      ) {
        return prev;
      }
      return nextList;
    });
  }, []);

  // Reconcile orchestrator step: spawn / remove / animate performers against live/cached YAMNet
  const runOrchestratorTick = useCallback(() => {
    const nowMs = performance.now();
    const curTime = getCurrentTime();

    const step = stepPerformanceOrchestrator({
      state: orchestratorStateRef.current,
      mode: performanceMode,
      videoId,
      currentTime: curTime,
      isPlaying,
      isPaused,
      isStopped,
      segments: activeYamnetSegments,
      gracePeriodMs,
      nowMs,
    });

    orchestratorStateRef.current = step.nextState;
    syncStagedSnapshot(step.nextState);

    setPlaybackTimeSec((prev) => (Math.abs(prev - curTime) >= 0.2 ? curTime : prev));
    setActiveVocals((prev) => (prev === step.activeVocals ? prev : step.activeVocals));
    setActiveInstruments((prev) => {
      if (
        prev.length === step.activeInstruments.length &&
        prev.every((v, i) => v === step.activeInstruments[i])
      ) {
        return prev;
      }
      return step.activeInstruments;
    });

    // Execute removals cleanly
    if (step.removeInstanceIds.length > 0) {
      for (const instId of step.removeInstanceIds) {
        delete manualClipOverrideRef.current[instId];
        removeCharacter(instId);
      }
    }

    // Execute idle <-> playing animation directives with clip fallback resolution
    if (step.animationDirectives.length > 0) {
      const currentChars = loadedCharactersRef.current;
      for (const dir of step.animationDirectives) {
        if (performanceMode === 'manual' && manualClipOverrideRef.current[dir.instanceId]) {
          continue;
        }
        const char = currentChars.find((c) => c.id === dir.instanceId);
        if (!char) continue;

        const mapping = dir.mapping || resolvePerformerMapping(char);
        const preferred =
          dir.targetState === 'playing'
            ? mapping?.playingClip || 'Cafe_Reaction'
            : mapping?.idleClip || 'Cafe_Idle';
        const fallbacks =
          dir.targetState === 'playing'
            ? mapping?.playingFallbacks || ['Cafe_Reaction', 'Cafe_Idle']
            : mapping?.idleFallbacks || ['Cafe_Idle', 'Formation_Idle', 'Normal_Idle', 'Idle'];

        const resolvedClip = resolvePerformerClipName(char.availableAnimations, preferred, fallbacks);
        if (resolvedClip && char.currentAnimationName !== resolvedClip) {
          playAnimation(char.id, resolvedClip);
        }
      }
    }

    // Execute asynchronous GLB spawns cleanly with abort & failure isolation
    if (step.loadRequests.length > 0) {
      for (const req of step.loadRequests) {
        if (inFlightKeysRef.current.has(req.key)) continue;
        inFlightKeysRef.current.add(req.key);

        const reqVideoId = videoId;
        const manifestEntry = toCharacterManifestEntry(req.mapping);
        const initialClip =
          req.initialState === 'playing' ? req.mapping.playingClip : req.mapping.idleClip;

        loadCharacter(manifestEntry, {
          replace: false,
          initialAnimation: initialClip,
          abortCheck: () =>
            videoIdRef.current !== reqVideoId ||
            !orchestratorStateRef.current.performers[req.key],
        })
          .then((loadedInst) => {
            inFlightKeysRef.current.delete(req.key);

            // Double-check if removed/switched right as load finished
            if (
              videoIdRef.current !== reqVideoId ||
              !orchestratorStateRef.current.performers[req.key]
            ) {
              removeCharacter(loadedInst.id);
              return;
            }

            orchestratorStateRef.current = registerLoadedPerformer(orchestratorStateRef.current, {
              instanceId: loadedInst.id,
              characterId: req.mapping.characterId,
              characterName: req.mapping.characterName,
              filename: req.mapping.filename,
              origin: performanceModeRef.current === 'automatic' ? 'auto' : 'manual',
              nowMs: performance.now(),
              isPlayingNow: req.initialState === 'playing',
            });
            syncStagedSnapshot(orchestratorStateRef.current);
          })
          .catch((err) => {
            inFlightKeysRef.current.delete(req.key);
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes('Load cancelled')) {
              orchestratorStateRef.current = markPerformerLoadFailed(
                orchestratorStateRef.current,
                req.key,
                msg,
                performance.now()
              );
              syncStagedSnapshot(orchestratorStateRef.current);
              setStageNotice(`Could not load ${req.mapping.characterName}: ${msg}`);
              setRuntimeErrors((prev) => [
                ...prev.slice(-19),
                {
                  timestamp: new Date().toLocaleTimeString(),
                  subsystem: 'Performer_Spawn',
                  message: `${req.mapping.characterName} (${req.mapping.instrumentName}): ${msg}`,
                },
              ]);
            }
          });
      }
    }
  }, [
    performanceMode,
    videoId,
    isPlaying,
    isPaused,
    isStopped,
    activeYamnetSegments,
    gracePeriodMs,
    getCurrentTime,
    loadCharacter,
    playAnimation,
    removeCharacter,
    syncStagedSnapshot,
  ]);

  // Run immediately whenever key orchestration dependencies change
  useEffect(() => {
    runOrchestratorTick();
  }, [runOrchestratorTick]);

  // Poll at 10Hz whenever music is playing OR grace timers / loads are active
  const hasPendingTimersOrLoads = stagedPerformers.some(
    (p) => p.lifecycle === 'grace_waiting' || p.lifecycle === 'loading'
  );
  useEffect(() => {
    if (!isPlaying && !hasPendingTimersOrLoads) return;
    const intervalId = setInterval(() => {
      runOrchestratorTick();
    }, 100);
    return () => clearInterval(intervalId);
  }, [isPlaying, hasPendingTimersOrLoads, runOrchestratorTick]);

  // Dynamically recalculate footprint-aware curved formation whenever loaded characters change
  useEffect(() => {
    const total = loadedCharacters.length;
    if (total === 0) return;

    const footprintWidths = loadedCharacters.map(
      (char) => resolvePerformerMapping(char)?.stageFootprintWidth ?? 1.45
    );

    const updates = loadedCharacters.map((char, index) => {
      const transform = getConcertSlotTransform(index, total, footprintWidths);
      return {
        id: char.id,
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
        slotIndex: index,
        stageRow: transform.row,
      };
    });

    batchUpdateFormationTransforms(updates);
  }, [loadedCharacters, batchUpdateFormationTransforms]);

  // Safe User Actions synced cleanly with Orchestrator state
  const handleRemoveCharacter = useCallback(
    (instanceId: string) => {
      delete manualClipOverrideRef.current[instanceId];
      orchestratorStateRef.current = removePerformerByInstanceId(
        orchestratorStateRef.current,
        instanceId
      );
      syncStagedSnapshot(orchestratorStateRef.current);
      removeCharacter(instanceId);
    },
    [removeCharacter, syncStagedSnapshot]
  );

  const handleClearCharacters = useCallback(() => {
    manualClipOverrideRef.current = {};
    orchestratorStateRef.current = {
      ...orchestratorStateRef.current,
      performers: {},
    };
    syncStagedSnapshot(orchestratorStateRef.current);
    clearCharacters();
  }, [clearCharacters, syncStagedSnapshot]);

  const handleSelectAnimation = useCallback(
    (instanceId: string, animationName: string) => {
      if (performanceMode === 'manual') {
        manualClipOverrideRef.current[instanceId] = animationName;
      }
      playAnimation(instanceId, animationName);
    },
    [performanceMode, playAnimation]
  );

  // Adding or replacing characters from the Roster drawer (with duplicate prevention in Add mode)
  const handleSelectFromDrawer = useCallback(
    async (character: CharacterManifestEntry, mode: 'replace' | 'add') => {
      if (mode === 'add') {
        const duplicate = findDuplicateStagedPerformer(orchestratorStateRef.current, character);
        if (duplicate) {
          setStageNotice(
            `${character.name} is already on stage (${duplicate.characterName}${
              duplicate.instrumentName ? ` • ${duplicate.instrumentName}` : ''
            }). Duplicates are prevented.`
          );
          return;
        }
      }

      const isReplace = mode === 'replace' && loadedCharacters.length > 0;
      const targetInstanceId =
        isReplace ? selectedInstanceId || loadedCharacters[0]?.id : null;
      let targetSlot = loadedCharacters.length;

      if (isReplace && targetInstanceId) {
        const activeChar = loadedCharacters.find((c) => c.id === targetInstanceId);
        targetSlot = activeChar?.slotIndex ?? 0;
        orchestratorStateRef.current = removePerformerByInstanceId(
          orchestratorStateRef.current,
          targetInstanceId
        );
      }

      const projectedTotal = isReplace ? loadedCharacters.length : loadedCharacters.length + 1;
      const transform = getConcertSlotTransform(targetSlot, projectedTotal);
      const mapping = resolvePerformerMapping(character);

      const initialClip = mapping
        ? isPlaying && activeInstruments.includes(mapping.instrumentName)
          ? mapping.playingClip
          : mapping.idleClip
        : isPlaying
        ? 'Cafe_Reaction'
        : 'Cafe_Idle';

      try {
        const loadedInst = await loadCharacter(character, {
          replace: isReplace,
          slotIndex: targetSlot,
          stageRow: transform.row,
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
          initialAnimation: initialClip,
        });

        orchestratorStateRef.current = registerLoadedPerformer(orchestratorStateRef.current, {
          instanceId: loadedInst.id,
          characterId: character.id,
          characterName: character.name,
          filename: character.filename,
          origin: performanceMode === 'automatic' ? 'auto' : 'manual',
          nowMs: performance.now(),
          isPlayingNow: Boolean(
            isPlaying && mapping && activeInstruments.includes(mapping.instrumentName)
          ),
        });
        syncStagedSnapshot(orchestratorStateRef.current);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStageNotice(`Failed to load ${character.name}: ${msg}`);
      }
    },
    [
      loadedCharacters,
      selectedInstanceId,
      isPlaying,
      activeInstruments,
      performanceMode,
      loadCharacter,
      syncStagedSnapshot,
    ]
  );

  const handleLoadYouTube = useCallback(() => {
    const trimmed = youtubeInput.trim();
    if (!trimmed) return;
    const extracted = extractYouTubeVideoId(trimmed) || trimmed;
    setVideo(extracted, undefined, false);
    setYoutubeInput('');
  }, [youtubeInput, setVideo]);

  const handleResetCamera = useCallback(() => {
    setCameraPreset('front');
    setPresetResetNonce((n) => n + 1);
  }, []);

  const handleSelectCameraPreset = useCallback((preset: ViewerCameraPreset) => {
    setCameraPreset(preset);
    setPresetResetNonce((n) => n + 1);
  }, []);

  const calculateStageBounds = useCallback(() => {
    const collectiveBox = new THREE.Box3();
    let visibleCount = 0;

    loadedCharactersRef.current.forEach((char) => {
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

    return {
      center,
      minY: collectiveBox.min.y,
      maxY: collectiveBox.max.y,
      height: Math.max(0.6, collectiveBox.max.y - collectiveBox.min.y),
      width: Math.max(1.0, collectiveBox.max.x - collectiveBox.min.x),
      depth: Math.max(1.0, collectiveBox.max.z - collectiveBox.min.z),
      radius: Math.max(1.5, sphere.radius),
    };
  }, []);

  const highlightedInstanceIds = useMemo(() => {
    const ids = new Set<string>();
    stagedPerformers.forEach((p) => {
      if (p.lifecycle === 'playing' && p.instanceId) {
        ids.add(p.instanceId);
      }
    });
    return ids;
  }, [stagedPerformers]);

  const selectedCharacter = useMemo(() => {
    return loadedCharacters.find((c) => c.id === selectedInstanceId) || loadedCharacters[0];
  }, [loadedCharacters, selectedInstanceId]);

  useEffect(() => {
    if (error) {
      setRuntimeErrors((prev) => [
        ...prev.slice(-19),
        {
          timestamp: new Date().toLocaleTimeString(),
          subsystem: 'GLTF_Loader',
          message: `Failed to load ${error.character?.name || 'character'}: ${error.message}`,
        },
      ]);
    }
  }, [error]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDebuggerOpen) {
        setIsDebuggerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDebuggerOpen]);

  const debuggerData: SceneDebuggerData = useMemo(() => {
    const bgMode =
      environment === 'studio' ? 'STUDIO_WHITE' : environment.toUpperCase();
    const activeBgColor =
      environment === 'studio' || environment === 'clean'
        ? '#FFFFFF'
        : isDark
        ? '#14121C'
        : isSakura
        ? '#FDF6F8'
        : environment === 'sunset'
        ? '#2A1D2D'
        : '#FFFFFF';
    const activeSceneName =
      environment === 'studio'
        ? 'Clean Studio Backdrop'
        : environment === 'dark'
        ? 'Dark Backdrop'
        : environment === 'sakura'
        ? 'Sakura Backdrop'
        : environment === 'sunset'
        ? 'Sunset Backdrop'
        : 'Clean Backdrop';

    return {
      environment,
      activeSceneName,
      sceneStatus: loading ? 'LOADING' : error ? 'ERROR' : 'READY',
      backgroundMode: bgMode,
      activeBackgroundColor: activeBgColor,
      performanceMode,
      gracePeriodMs,
      yamnetStatus,
      yamnetUsingWorker,
      yamnetSegmentsCount: activeYamnetSegments.length,
      activeInstruments,
      activeVocals,
      stagedPerformers,
      fps: debuggerMetrics.fps,
      frameTimeMs: debuggerMetrics.frameTimeMs,
      cacheStats: getLoaderCacheStats(),
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
      playbackTimeSec,
      cameraPreset,
      showGrid,
      showWireframe,
      runtimeErrors,
      onClearErrors: () => setRuntimeErrors([]),
    };
  }, [
    environment,
    isDark,
    isSakura,
    loading,
    error,
    performanceMode,
    gracePeriodMs,
    yamnetStatus,
    yamnetUsingWorker,
    activeYamnetSegments.length,
    activeInstruments,
    activeVocals,
    stagedPerformers,
    debuggerMetrics,
    loadedCharacters,
    selectedInstanceId,
    loadingProgress,
    loadingCharacter,
    videoId,
    videoTitle,
    isPlaying,
    isPaused,
    isStopped,
    playbackTimeSec,
    cameraPreset,
    showGrid,
    showWireframe,
    runtimeErrors,
  ]);

  const containerBg =
    environment === 'studio' || environment === 'clean'
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

  const nowMs = performance.now();

  return (
    <div
      className={`relative w-full h-full min-h-0 flex-1 overflow-hidden flex flex-col select-none ${containerBg} ${className}`}
    >
      {/* Top Navigation Tabs (Preserved intact) */}
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
                {loadedCharacters.length} Performer{loadedCharacters.length !== 1 ? 's' : ''} •{' '}
                {performanceMode === 'automatic' ? 'Auto Sync' : 'Manual Stage'}
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
      {activeTab === 'analysis' && !isMini && <InstrumentAnalysisView theme={theme} />}

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

      {/* 3D Viewer Stage Container */}
      <div
        className={`flex-1 min-h-0 w-full h-full flex-col overflow-hidden relative ${
          activeTab === 'viewer' || isMini ? 'flex' : 'hidden'
        }`}
      >
        {/* Top YouTube, Transport & Performance Mode Control Bar */}
        {!isMini && (
          <div className="shrink-0 z-20 px-3 sm:px-4 py-2 bg-white/90 dark:bg-[#161422]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
            {/* YouTube Input Bar */}
            <div className="flex flex-1 items-center gap-2 min-w-[230px] max-w-md">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLoadYouTube();
                  }}
                  placeholder="Paste YouTube URL or video ID..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none transition-all placeholder:text-[#9E9AA6]"
                />
                <Youtube className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              </div>
              <button
                type="button"
                onClick={handleLoadYouTube}
                disabled={!youtubeInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                Load
              </button>
            </div>

            {/* Staging Mode, Live YAMNet Sync & Transport Controls */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {/* Auto / Manual Mode Switcher */}
              <div
                className="flex items-center p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10"
                title="Mode A: Automatically add/remove characters from YAMNet. Mode B: Persistent manual roster animated by YAMNet."
              >
                <button
                  type="button"
                  onClick={() => setPerformanceMode('automatic')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    performanceMode === 'automatic'
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Auto Stage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceMode('manual')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    performanceMode === 'manual'
                      ? 'bg-[#7567C7] text-white shadow-xs'
                      : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
                  }`}
                >
                  <Hand className="h-3 w-3" />
                  <span>Manual Stage</span>
                </button>
              </div>

              {/* Grace Period Selector (Mode A only) */}
              {performanceMode === 'automatic' && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-[10.5px]">
                  <span className="text-[#77747D] dark:text-[#9E9AA6] font-semibold">Grace:</span>
                  {([0, 2500, 5000] as const).map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => setGracePeriodMs(ms)}
                      className={`px-1.5 py-0.5 rounded font-mono font-bold transition-colors cursor-pointer ${
                        gracePeriodMs === ms
                          ? 'bg-emerald-600 text-white'
                          : 'text-[#77747D] hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {ms === 0 ? '0s' : `${ms / 1000}s`}
                    </button>
                  ))}
                </div>
              )}

              {/* Live YAMNet Audio Sync Trigger */}
              <button
                type="button"
                onClick={() =>
                  isStageYamnetCapturing ? stopStageLiveYamnet() : startStageLiveYamnet()
                }
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isStageYamnetCapturing
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-xs'
                    : activeYamnetSegments.length > 0
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                    : 'bg-black/5 dark:bg-white/5 text-[#25242A] dark:text-white border-black/10 dark:border-white/10 hover:bg-[#7567C7] hover:text-white'
                }`}
                title="Capture tab audio directly from this stage using local YAMNet"
              >
                <Radio className={`h-3.5 w-3.5 ${isStageYamnetCapturing ? 'animate-pulse' : ''}`} />
                <span>
                  {isStageYamnetCapturing
                    ? 'Live YAMNet ON'
                    : activeYamnetSegments.length > 0
                    ? 'Re-Capture Live'
                    : 'Start Live YAMNet'}
                </span>
              </button>

              {/* Current Track Badge */}
              <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs">
                <Disc3 className={`h-3.5 w-3.5 ${isPlaying ? 'text-emerald-500 animate-spin' : 'text-[#7567C7]'}`} />
                <span className="font-semibold text-xs truncate max-w-[150px] text-[#25242A] dark:text-[#F4F2F7]">
                  {videoTitle || (videoId ? `ID: ${videoId}` : 'No track')}
                </span>
              </div>

              {/* Play / Pause Toggle */}
              <button
                type="button"
                onClick={togglePlay}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm ${
                  isPlaying
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/40'
                    : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
                }`}
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
                  onClick={handleClearCharacters}
                  className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-red-500/10 text-[#77747D] hover:text-red-500 text-xs transition-colors cursor-pointer border border-black/5 dark:border-white/5"
                  title="Clear all performers from stage"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Performer & Active YAMNet Detection Strip */}
        {!isMini && (
          <div className="shrink-0 z-10 px-3 py-1.5 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between overflow-x-auto text-[11px] font-semibold gap-3 scrollbar-none">
            {/* Live Audio Sync Status Badges (Instruments + Independent Vocals) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#77747D] dark:text-[#A4A1AA]">
                Stage ({loadedCharacters.length}):
              </span>

              {activeYamnetSegments.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] border border-emerald-500/25">
                  {activeYamnetSegments.length} segs
                </span>
              )}

              {activeVocals && (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30 text-[10px] font-bold"
                  title="Vocals is tracked independently and never spawns a vocalist character"
                >
                  <Mic className="h-3 w-3" />
                  <span>Vocals Active (Independent)</span>
                </span>
              )}

              {yamnetError && (
                <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-300 text-[10px] max-w-[200px] truncate">
                  {yamnetError}
                </span>
              )}
            </div>

            {/* Active Staged Performers with Lifecycle State */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {stagedPerformers
                .filter((p) => p.lifecycle === 'loading' || p.lifecycle === 'error')
                .map((pending) => (
                  <div
                    key={pending.key}
                    className={`px-2 py-0.5 rounded-lg flex items-center gap-1.5 shrink-0 border text-[10.5px] ${
                      pending.lifecycle === 'error'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30'
                        : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {pending.lifecycle === 'loading' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    <span className="font-bold truncate max-w-[110px]">{pending.characterName}</span>
                    <span className="opacity-75 text-[9.5px]">
                      {pending.instrumentName || 'Manual'} • {pending.lifecycle}
                    </span>
                  </div>
                ))}

              {loadedCharacters.map((char, slotIdx) => {
                const isSelected = selectedCharacter?.id === char.id;
                const isElevated = char.stageRow === 'back';
                const mapping = resolvePerformerMapping(char);
                const record = stagedPerformers.find((p) => p.instanceId === char.id);
                const isGrace = record?.lifecycle === 'grace_waiting' && record.graceDeadlineMs !== null;
                const isSounding = record?.lifecycle === 'playing';
                const graceRemSec = isGrace
                  ? Math.max(0, (record!.graceDeadlineMs! - nowMs) / 1000).toFixed(1)
                  : null;

                return (
                  <div
                    key={char.id}
                    className={`group pl-2 pr-1.5 py-0.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 border ${
                      isSounding
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : isGrace
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40'
                        : isSelected
                        ? 'bg-[#7567C7] text-white border-[#7567C7] shadow-xs'
                        : isElevated
                        ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20'
                        : 'bg-black/5 dark:bg-white/5 text-[#25242A] dark:text-white border-black/5 dark:border-white/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedInstanceId(char.id)}
                      className="flex items-center gap-1 cursor-pointer text-left"
                      title={`Slot ${slotIdx + 1}: ${char.manifestEntry.name}${
                        mapping ? ` (${mapping.instrumentName})` : ''
                      } • Clip: ${char.currentAnimationName || 'Idle'}`}
                    >
                      <span className="font-mono text-[9.5px] opacity-75">[{slotIdx + 1}]</span>
                      <span className="truncate max-w-[90px] font-bold">{char.manifestEntry.name}</span>
                      {mapping && (
                        <span className="text-[9.5px] opacity-80 hidden sm:inline">
                          • {mapping.instrumentName}
                        </span>
                      )}
                      {isGrace && (
                        <span className="font-mono text-[9px] px-1 rounded bg-black/15">
                          Grace {graceRemSec}s
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveCharacter(char.id)}
                      className="p-0.5 rounded hover:bg-black/20 dark:hover:bg-white/20 text-current transition-colors cursor-pointer"
                      title={`Remove ${char.manifestEntry.name} from stage`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}

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

        {/* 3D Canvas Viewport */}
        <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden">
          <Canvas
            shadows
            frameloop={isCanvasActive ? 'always' : 'demand'}
            camera={{ position: [0.0, 2.5, 7.5], fov: 40, near: 0.1, far: 150 }}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <Suspense fallback={null}>
              {!isCustomEnvActive && (
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
              ) : (
                <ViewerEnvironment3D environment={environment} />
              )}

              <StagePerformanceMonitor metricsRef={perfMetricsRef} />

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
                onStart={() => {
                  userAdjustedCameraRef.current = true;
                }}
              />

              {loadedCharacters.map((char) => (
                <CharacterInstanceMesh
                  key={char.id}
                  instance={char}
                  isSelected={
                    selectedInstanceId === char.id &&
                    loadedCharacters.length > 1 &&
                    !isMini
                  }
                  isHighlighted={highlightedInstanceIds.has(char.id)}
                  wireframe={showWireframe}
                />
              ))}

              {showGrid && !isMini && (
                <gridHelper
                  args={[16, 32, '#7567C7', '#9A8BF0']}
                  position={[0, 0, 0]}
                />
              )}

              <DynamicCameraAutoFramer
                loadedCharactersCount={loadedCharacters.length}
                calculateBounds={calculateStageBounds}
                cameraPreset={cameraPreset}
                presetResetNonce={presetResetNonce}
                controlsRef={orbitControlsRef}
                userAdjustedCameraRef={userAdjustedCameraRef}
                isMini={isMini}
              />
            </Suspense>
          </Canvas>

          {/* Non-blocking Stage Notice Toast (duplicate guard or load failure notice) */}
          {stageNotice && !isMini && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-xl bg-[#1C192E]/95 text-white border border-white/15 shadow-xl text-xs font-medium flex items-center gap-2 max-w-md animate-in fade-in">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="truncate">{stageNotice}</span>
              <button
                type="button"
                onClick={() => setStageNotice(null)}
                className="p-0.5 rounded hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Floating Custom Scenery Preview Overlay Chip (Environment Preview tab feature) */}
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

          {/* Empty Stage Overlay */}
          {loadedCharacters.length === 0 && !loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
              <div className="px-5 py-4 rounded-3xl bg-white/85 dark:bg-[#14121C]/85 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl flex flex-col items-center gap-3 text-center max-w-sm pointer-events-auto">
                <div className="w-10 h-10 rounded-2xl bg-[#7567C7]/15 flex items-center justify-center text-[#7567C7]">
                  <Users className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7]">
                    {performanceMode === 'automatic'
                      ? 'Ready for Automatic YAMNet Performance'
                      : 'No characters loaded'}
                  </p>
                  <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                    {performanceMode === 'automatic'
                      ? activeYamnetSegments.length > 0
                        ? 'Cached YAMNet timeline loaded — press PLAY to spawn performers automatically.'
                        : 'Press PLAY + Start Live YAMNet (or run Instrument Analysis) to auto-stage performers, or open Roster to add manually.'
                      : 'Open the roster to add Blue Archive performers to the concert stage.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {performanceMode === 'automatic' && !isStageYamnetCapturing && (
                    <button
                      type="button"
                      onClick={startStageLiveYamnet}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Radio className="h-3.5 w-3.5" />
                      <span>Start Live YAMNet</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6556B8] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>Open Roster</span>
                  </button>
                </div>
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

          {/* Bottom Viewport Toolbar */}
          {!isMini && (
            <CharacterViewerToolbar
              theme={theme}
              loadedCharacters={loadedCharacters}
              selectedInstanceId={selectedInstanceId}
              cameraPreset={cameraPreset}
              onSelectCameraPreset={handleSelectCameraPreset}
              environment={environment}
              onSelectEnvironment={setEnvironment}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid(!showGrid)}
              showWireframe={showWireframe}
              onToggleWireframe={() => setShowWireframe(!showWireframe)}
              onOpenBrowser={() => setDrawerOpen(true)}
              onResetCamera={handleResetCamera}
              onSelectAnimation={handleSelectAnimation}
              onTogglePlayPause={togglePlayPauseAnimation}
              isConcertPlaying={isPlaying}
              onToggleConcertMusic={togglePlay}
              isDebuggerOpen={isDebuggerOpen}
              onToggleDebugger={() => setIsDebuggerOpen((prev) => !prev)}
            />
          )}

          {/* Performance & YAMNet Scene Debugger */}
          <SceneDebuggerPanel
            isOpen={isDebuggerOpen && !isMini}
            onClose={() => setIsDebuggerOpen(false)}
            data={debuggerData}
            onSelectAnimation={handleSelectAnimation}
          />

          {/* 296+ Character Roster Browser Drawer */}
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
            onRemoveInstance={handleRemoveCharacter}
            onToggleInstanceVisibility={(id) => {
              const char = loadedCharacters.find((c) => c.id === id);
              if (char) updateCharacterTransform(id, { visible: !char.visible });
            }}
            onSelectInstance={(id) => setSelectedInstanceId(id)}
            onClearAll={handleClearCharacters}
          />
        </div>
      </div>
    </div>
  );
};
