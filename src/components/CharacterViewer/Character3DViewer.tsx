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
  Film,
} from 'lucide-react';
import { AppTheme } from '../../types/theme';
import { BLUE_ARCHIVE_CHARACTERS, CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, ViewerCameraPreset, ViewerEnvironment } from './types';
import { useCharacterLoader } from './useCharacterLoader';
import { CharacterInstanceMesh } from './CharacterInstanceMesh';
import { CharacterBrowserDrawer } from './CharacterBrowserDrawer';
import { CharacterViewerToolbar } from './CharacterViewerToolbar';

interface Character3DViewerProps {
  theme?: AppTheme;
  className?: string;
  onReturnToEnsemble?: () => void;
}

/**
 * Dynamic Environment & Lighting System
 */
const ViewerEnvironment3D: React.FC<{ environment: ViewerEnvironment }> = ({ environment }) => {
  const envConfigs = {
    studio: {
      ambientIntensity: 0.85,
      keyColor: '#FFFFFF',
      keyIntensity: 1.4,
      fillColor: '#D8E5FF',
      fillIntensity: 0.6,
      rimColor: '#E6E6FA',
      rimIntensity: 1.0,
      pedestalColor: '#ECE8E1',
      floorColor: '#F4EFEB',
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
      pedestalColor: '#1A1828',
      floorColor: '#120F1D',
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
      pedestalColor: '#FCE8EE',
      floorColor: '#FAF0F3',
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
      pedestalColor: '#2A1E24',
      floorColor: '#1F171C',
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
      pedestalColor: '#FFFFFF',
      floorColor: '#F9FAFB',
      shadowOpacity: 0.35,
    },
  }[environment];

  return (
    <>
      <ambientLight intensity={envConfigs.ambientIntensity} />

      {/* Key Directional Light with Soft Shadows */}
      <directionalLight
        position={[3.0, 5.0, 3.5]}
        intensity={envConfigs.keyIntensity}
        color={envConfigs.keyColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
        shadow-bias={-0.0005}
      />

      {/* Soft Fill Light */}
      <directionalLight
        position={[-3.5, 3.0, -2.0]}
        intensity={envConfigs.fillIntensity}
        color={envConfigs.fillColor}
      />

      {/* Rim / Hair Silhouette Backlight */}
      <directionalLight
        position={[0, 4.0, -4.0]}
        intensity={envConfigs.rimIntensity}
        color={envConfigs.rimColor}
      />

      {/* Ground Diorama Platform */}
      <group position={[0, -0.01, 0]}>
        <mesh position={[0, -0.06, 0]} receiveShadow>
          <cylinderGeometry args={[2.5, 2.6, 0.12, 64]} />
          <meshStandardMaterial color={envConfigs.pedestalColor} roughness={0.4} metalness={0.08} />
        </mesh>
        <mesh position={[0, -0.01, 0]} receiveShadow>
          <torusGeometry args={[2.52, 0.02, 16, 64]} />
          <meshStandardMaterial color="#7567C7" metalness={0.5} roughness={0.3} />
        </mesh>
      </group>

      <ContactShadows
        position={[0, 0, 0]}
        opacity={envConfigs.shadowOpacity}
        scale={6.0}
        blur={1.8}
        far={2.5}
      />
    </>
  );
};

/**
 * Camera Auto-Framer for dynamic models of variable heights & counts (Part 1)
 * Calculates accurate bounds to frame character from head to feet with comfortable margins.
 */
const DynamicCameraAutoFramer: React.FC<{
  loadedCharacters: LoadedCharacterInstance[];
  cameraPreset: ViewerCameraPreset;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}> = ({ loadedCharacters, cameraPreset, controlsRef }) => {
  const { camera, size } = useThree();

  const calculateBounds = useCallback(() => {
    if (loadedCharacters.length === 0) {
      return {
        center: new THREE.Vector3(0, 0.75, 0),
        minY: 0,
        maxY: 1.5,
        height: 1.5,
        width: 0.8,
        depth: 0.8,
        radius: 1.2,
      };
    }

    const collectiveBox = new THREE.Box3();
    let visibleCount = 0;

    loadedCharacters.forEach((char) => {
      if (char.visible && char.scene) {
        char.scene.updateMatrixWorld(true);
        const charBox = new THREE.Box3().setFromObject(char.scene);
        if (!charBox.isEmpty()) {
          collectiveBox.union(charBox);
          visibleCount++;
        }
      }
    });

    if (collectiveBox.isEmpty() || visibleCount === 0) {
      return {
        center: new THREE.Vector3(0, 0.75, 0),
        minY: 0,
        maxY: 1.5,
        height: 1.5,
        width: 0.8,
        depth: 0.8,
        radius: 1.2,
      };
    }

    const center = new THREE.Vector3();
    collectiveBox.getCenter(center);
    const sphere = new THREE.Sphere();
    collectiveBox.getBoundingSphere(sphere);

    const height = Math.max(0.4, collectiveBox.max.y - collectiveBox.min.y);
    const width = Math.max(0.4, collectiveBox.max.x - collectiveBox.min.x);
    const depth = Math.max(0.4, collectiveBox.max.z - collectiveBox.min.z);

    return {
      center,
      minY: collectiveBox.min.y,
      maxY: collectiveBox.max.y,
      height,
      width,
      depth,
      radius: Math.max(0.6, sphere.radius),
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
    const distSphere = radius * 2.2;

    // Use max distance so entire model is completely visible
    const distance = Math.max(distY, distX, distSphere, 1.8);

    // Vertical target: Center of character body
    const targetY = minY + height * 0.5;
    const target = new THREE.Vector3(center.x, targetY, center.z);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = 0.3;
      controls.maxDistance = 25.0;
    }

    if (cameraPreset === 'front') {
      // Clean frontal view, slight 3-degree elevation so feet and floor circle are visible
      camera.position.set(center.x, targetY + distance * 0.05, center.z + distance);
    } else if (cameraPreset === 'perspective') {
      // Dynamic 3/4 showcase view (26 deg azimuth, 14 deg elevation)
      const radAzim = 0.45;
      const radElev = 0.24;
      camera.position.set(
        center.x + distance * Math.sin(radAzim) * Math.cos(radElev),
        targetY + distance * Math.sin(radElev),
        center.z + distance * Math.cos(radAzim) * Math.cos(radElev)
      );
    } else if (cameraPreset === 'side') {
      // 90-degree profile view
      camera.position.set(center.x + distance, targetY + distance * 0.05, center.z);
    } else if (cameraPreset === 'closeUp') {
      // Portrait / upper body & halo framing
      const portraitTargetY = minY + height * 0.72;
      const portraitTarget = new THREE.Vector3(center.x, portraitTargetY, center.z);
      if (controls) controls.target.copy(portraitTarget);

      const closeDist = Math.max(0.65, (height * 0.5) / (2 * Math.tan(fovRad / 2)));
      camera.position.set(center.x + closeDist * 0.15, portraitTargetY + 0.05, center.z + closeDist * 0.98);
      camera.lookAt(portraitTarget);
      if (controls) controls.update();
      return;
    } else if (cameraPreset === 'top') {
      // Top down view
      camera.position.set(center.x, targetY + distance * 1.3, center.z + 0.05);
    }

    camera.lookAt(target);
    persCamera.updateProjectionMatrix();

    if (controls) {
      controls.update();
    }
  }, [loadedCharacters, cameraPreset, camera, size.width, size.height, controlsRef, calculateBounds]);

  return null;
};

export const Character3DViewer: React.FC<Character3DViewerProps> = ({
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

  // 3D Viewport Controls & State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<ViewerCameraPreset>('perspective');
  const [environment, setEnvironment] = useState<ViewerEnvironment>(
    isDark ? 'dark' : isSakura ? 'sakura' : 'studio'
  );
  const [showGrid, setShowGrid] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);

  const orbitControlsRef = useRef<OrbitControlsImpl>(null);

  // Multi-GLB Character Loader with Animation Support (Parts 2-7)
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
  } = useCharacterLoader();

  // Load initial character on mount if none loaded
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current || BLUE_ARCHIVE_CHARACTERS.length === 0) return;
    hasInitializedRef.current = true;

    // Load first character e.g. "Airi"
    const initial =
      BLUE_ARCHIVE_CHARACTERS.find((c) => c.name.toLowerCase() === 'airi') ||
      BLUE_ARCHIVE_CHARACTERS[0];
    if (initial) {
      loadCharacter(initial, { replace: true });
    }
  }, [loadCharacter]);

  // Handle character selection from drawer
  const handleSelectFromDrawer = useCallback(
    (character: CharacterManifestEntry, mode: 'replace' | 'add') => {
      loadCharacter(character, { replace: mode === 'replace' });
      if (mode === 'replace') {
        setCameraPreset('perspective');
      }
    },
    [loadCharacter]
  );

  // Reset Camera Framing
  const handleResetCamera = useCallback(() => {
    setCameraPreset('perspective');
  }, []);

  // Selected character details for top status bar
  const selectedCharacter = useMemo(() => {
    return loadedCharacters.find((c) => c.id === selectedInstanceId) || loadedCharacters[0];
  }, [loadedCharacters, selectedInstanceId]);

  return (
    <div
      className={`relative w-full h-full min-h-0 flex-1 rounded-2xl sm:rounded-3xl overflow-hidden border shadow-2xl flex flex-col select-none ${containerBg} ${className}`}
    >
      {/* =========================================================================
          TOP CONTROL BAR
          ========================================================================= */}
      <div className="relative shrink-0 z-20 flex items-center justify-between p-3 sm:p-3.5 bg-white/75 dark:bg-[#1A1824]/75 backdrop-blur-md border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7]">
              Blue Archive 3D Character Studio
            </span>
          </div>

          {/* Model Status Badge */}
          {selectedCharacter && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <span className="px-2.5 py-0.5 rounded-lg bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A898F8] border border-[#7567C7]/20 flex items-center gap-1 font-bold">
                <User className="h-3 w-3" />
                <span>{selectedCharacter.manifestEntry.name}</span>
              </span>

              {selectedCharacter.currentAnimationName && (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-semibold text-[10.5px]">
                  <Film className="h-3 w-3" />
                  <span>{selectedCharacter.currentAnimationName}</span>
                </span>
              )}

              {loadedCharacters.length > 1 && (
                <span className="px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1 font-medium">
                  <Users className="h-3 w-3" />
                  <span>{loadedCharacters.length} Models in Scene</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Top Bar Actions */}
        <div className="flex items-center gap-2">
          {/* Character Roster Drawer Button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 px-3 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Character Roster ({BLUE_ARCHIVE_CHARACTERS.length})</span>
          </button>

          {/* Return to 2D Ensemble Button */}
          {onReturnToEnsemble && (
            <button
              type="button"
              onClick={onReturnToEnsemble}
              className="p-1.5 px-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-black/5 dark:border-white/5"
            >
              <span>2D Stage</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          3D CANVAS VIEWPORT (Part 1: Viewport / Canvas sizing & framing)
          ========================================================================= */}
      <div className="relative flex-1 min-h-0 w-full h-full bg-radial from-transparent to-black/15 overflow-hidden">
        <Canvas
          shadows
          camera={{ position: [0.0, 1.2, 2.5], fov: 40, near: 0.1, far: 50 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <Suspense fallback={null}>
            <ViewerEnvironment3D environment={environment} />

            <OrbitControls
              ref={orbitControlsRef}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.3}
              maxDistance={25.0}
              maxPolarAngle={Math.PI / 2 + 0.05}
              target={[0, 0.75, 0]}
            />

            {/* Render all loaded character instances in scene (Multi-GLB Architecture) */}
            {loadedCharacters.map((char) => (
              <CharacterInstanceMesh
                key={char.id}
                instance={char}
                isSelected={selectedInstanceId === char.id && loadedCharacters.length > 1}
                wireframe={showWireframe}
              />
            ))}

            {/* Optional Ground Grid */}
            {showGrid && (
              <DreiGrid
                position={[0, 0, 0]}
                args={[10, 10]}
                cellSize={0.5}
                cellThickness={1.0}
                cellColor="#7567C7"
                sectionSize={2.0}
                sectionThickness={1.5}
                sectionColor="#9A8BF0"
                fadeDistance={12}
                fadeStrength={1.5}
              />
            )}

            {/* Dynamic Camera Auto-Framer */}
            <DynamicCameraAutoFramer
              loadedCharacters={loadedCharacters}
              cameraPreset={cameraPreset}
              controlsRef={orbitControlsRef}
            />
          </Suspense>
        </Canvas>

        {/* Loading Spinner & Progress Overlay */}
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

        {/* Loading Error Notice */}
        {error && (
          <div className="absolute top-4 left-4 z-30 px-3.5 py-2.5 rounded-2xl bg-red-500/10 dark:bg-red-500/20 backdrop-blur-md border border-red-500/30 shadow-lg flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 max-w-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Failed to load {error.character.name}</p>
              <p className="text-[10.5px] opacity-80 break-words">{error.message}</p>
            </div>
          </div>
        )}

        {/* Bottom Viewport Toolbar with Dynamic Animation Controls */}
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
        />

        {/* 295 Character Roster Browser Drawer */}
        <CharacterBrowserDrawer
          theme={theme}
          isOpen={drawerOpen}
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
          onSelectInstance={(id) => setSelectedInstanceId(id)}
          onClearAll={clearCharacters}
        />
      </div>
    </div>
  );
};
