import React, { Suspense, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { LoadedCharacter, ViewerSettings } from '../../types/characterViewer';
import { Box3, Vector3 } from 'three';

interface Character3DViewportProps {
  loadedCharacters: LoadedCharacter[];
  selectedInstanceId: string | null;
  onSelectInstance?: (instanceId: string) => void;
  settings: ViewerSettings;
  theme: 'light' | 'dark' | 'sakura';
}

/**
 * Camera Auto-Framer Component
 * Calculates bounding box of active character(s) and adjusts OrbitControls target
 */
const CameraFramer: React.FC<{
  loadedCharacters: LoadedCharacter[];
  selectedInstanceId: string | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}> = ({ loadedCharacters, selectedInstanceId, controlsRef }) => {
  const { camera } = useThree();

  useEffect(() => {
    const visibleChars = loadedCharacters.filter((c) => c.visible && !c.isLoading && !c.loadError);
    if (visibleChars.length === 0 || !controlsRef.current) return;

    // Determine target characters to frame
    let targetChars = visibleChars;
    if (selectedInstanceId) {
      const selected = visibleChars.find((c) => c.instanceId === selectedInstanceId);
      if (selected) targetChars = [selected];
    }

    const overallBox = new Box3();
    targetChars.forEach((char) => {
      if (char.scene) {
        const charBox = new Box3().setFromObject(char.scene);
        overallBox.union(charBox);
      }
    });

    if (overallBox.isEmpty()) return;

    const center = new Vector3();
    overallBox.getCenter(center);
    const size = new Vector3();
    overallBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.85;
    cameraDistance = Math.min(Math.max(cameraDistance, 1.2), 10.0);

    // Smoothly set controls target
    controlsRef.current.target.set(center.x, center.y, center.z);
    camera.position.set(center.x + cameraDistance * 0.4, center.y + size.y * 0.1, center.z + cameraDistance * 0.9);
    controlsRef.current.update();
  }, [loadedCharacters.length, selectedInstanceId, camera, controlsRef]);

  return null;
};

/**
 * Individual Character Instance Renderer
 */
const CharacterInstanceRenderer: React.FC<{
  character: LoadedCharacter;
  isSelected: boolean;
  showBoundingBox: boolean;
  onSelect?: () => void;
}> = ({ character, isSelected, showBoundingBox, onSelect }) => {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group
      ref={groupRef}
      position={[character.position.x, character.position.y, character.position.z]}
      rotation={[character.rotation.x, character.rotation.y, character.rotation.z]}
      scale={[character.scale.x, character.scale.y, character.scale.z]}
      visible={character.visible}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
      }}
    >
      {/* GLB Scene Primitive */}
      {character.scene && <primitive object={character.scene} />}

      {/* Bounding Box Visualizer */}
      {showBoundingBox && character.boundingBox && !character.boundingBox.isEmpty() && (
        <box3Helper args={[character.boundingBox, isSelected ? 0x7567c7 : 0xffffff]} />
      )}

      {/* Loading Overlay Tag in 3D */}
      {character.isLoading && (
        <Html position={[0, 1.2, 0]} center distanceFactor={3}>
          <div className="px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md text-white border border-white/20 text-xs font-medium flex items-center gap-2 shadow-xl">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <span>Loading {character.manifestEntry.displayName}... ({character.loadProgress}%)</span>
          </div>
        </Html>
      )}

      {/* Error Overlay Tag in 3D */}
      {character.loadError && (
        <Html position={[0, 1.2, 0]} center distanceFactor={3}>
          <div className="px-3 py-1.5 rounded-xl bg-red-900/90 backdrop-blur-md text-red-100 border border-red-500/40 text-xs font-semibold flex items-center gap-2 shadow-xl">
            <span>⚠️ {character.loadError}</span>
          </div>
        </Html>
      )}
    </group>
  );
};

/**
 * Clean Generic Three.js 3D Viewport
 */
export const Character3DViewport: React.FC<Character3DViewportProps> = ({
  loadedCharacters,
  selectedInstanceId,
  onSelectInstance,
  settings,
  theme,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const getBgColor = () => {
    if (settings.backgroundColor && settings.backgroundColor !== 'default') {
      return settings.backgroundColor;
    }
    if (theme === 'dark') return '#111017';
    if (theme === 'sakura') return '#FDF5F7';
    return '#F5F3EF';
  };

  return (
    <div className="relative w-full h-full min-h-[450px] rounded-2xl overflow-hidden select-none bg-gradient-to-b from-black/5 to-black/15">
      <Canvas
        shadows={settings.showShadows}
        camera={{ position: [0, 1.2, 2.5], fov: 42, near: 0.1, far: 50 }}
        className="w-full h-full"
      >
        <color attach="background" args={[getBgColor()]} />

        <Suspense fallback={null}>
          {/* Lighting Rig */}
          <ambientLight intensity={theme === 'dark' ? 0.7 : 0.95} />
          
          {/* Key Directional Light */}
          <directionalLight
            position={[3.5, 6.0, 4.0]}
            intensity={theme === 'dark' ? 1.2 : 1.4}
            castShadow={settings.showShadows}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={15}
            shadow-camera-left={-2.5}
            shadow-camera-right={2.5}
            shadow-camera-top={3.5}
            shadow-camera-bottom={-1.0}
            shadow-bias={-0.0001}
          />

          {/* Soft Fill Light */}
          <directionalLight position={[-3.5, 2.5, -2.0]} intensity={0.5} color="#DDE5FF" />

          {/* Subtle Rim Light */}
          <directionalLight position={[0, 4.0, -4.0]} intensity={0.7} color="#A0B5FF" />

          {/* Orbit Camera Controls */}
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.06}
            minDistance={0.3}
            maxDistance={12.0}
            maxPolarAngle={Math.PI / 2 + 0.05}
            autoRotate={settings.autoRotate}
            autoRotateSpeed={settings.autoRotateSpeed}
          />

          {/* Ground Plane & Contact Shadows */}
          {settings.showShadows && (
            <ContactShadows
              position={[0, 0, 0]}
              opacity={0.45}
              scale={10}
              blur={1.8}
              far={4.0}
              resolution={1024}
              color="#0F0C1B"
            />
          )}

          {/* Ground Grid Helper */}
          {settings.showGrid && (
            <gridHelper
              args={[10, 20, theme === 'dark' ? '#3B3654' : '#C5C1D8', theme === 'dark' ? '#232035' : '#E2DEEC']}
              position={[0, 0, 0]}
            />
          )}

          {/* Render All Loaded Character Instances */}
          {loadedCharacters.map((char) => (
            <CharacterInstanceRenderer
              key={char.instanceId}
              character={char}
              isSelected={char.instanceId === selectedInstanceId}
              showBoundingBox={settings.showBoundingBox}
              onSelect={() => onSelectInstance && onSelectInstance(char.instanceId)}
            />
          ))}

          {/* Camera Auto Framing Helper */}
          <CameraFramer
            loadedCharacters={loadedCharacters}
            selectedInstanceId={selectedInstanceId}
            controlsRef={controlsRef}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
