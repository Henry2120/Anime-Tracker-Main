import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LoadedCharacterInstance } from './types';

interface CharacterInstanceMeshProps {
  instance: LoadedCharacterInstance;
  isSelected?: boolean;
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export const CharacterInstanceMesh: React.FC<CharacterInstanceMeshProps> = ({
  instance,
  isSelected = false,
  wireframe = false,
  castShadow = true,
  receiveShadow = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // =========================================================================
  // ANIMATION MIXER FRAME UPDATE (Part 4)
  // Each character instance updates its own independent mixer using delta time
  // =========================================================================
  useFrame((_, delta) => {
    if (instance.mixer && instance.visible) {
      // Clamp delta to avoid huge time jumps when switching tabs
      const safeDelta = Math.min(delta, 0.1);
      instance.mixer.update(safeDelta);
    }
  });

  // Synchronize wireframe & shadow settings
  useEffect(() => {
    if (!instance.scene) return;

    instance.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;

        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if ('wireframe' in m) {
              m.wireframe = wireframe;
            }
          });
        }
      }
    });
  }, [instance.scene, wireframe, castShadow, receiveShadow]);

  if (!instance.visible) return null;

  return (
    <group
      ref={groupRef}
      name={instance.id}
      position={[instance.position.x, instance.position.y, instance.position.z]}
      rotation={[instance.rotation.x, instance.rotation.y, instance.rotation.z]}
      scale={[instance.scale.x, instance.scale.y, instance.scale.z]}
    >
      <primitive object={instance.scene} />

      {/* Selected Character Base Ring Indicator */}
      {isSelected && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.5, 32]} />
          <meshBasicMaterial color="#7567C7" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};
