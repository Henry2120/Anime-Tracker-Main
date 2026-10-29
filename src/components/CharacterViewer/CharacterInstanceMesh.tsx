import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LoadedCharacterInstance } from './types';
import {
  enforceHinaPianoWeaponHidden,
  isHinaPianoWeaponObject,
} from './characterVisibilityController';
import { isHinaPianoPerformer } from './useCharacterLoader';

interface CharacterInstanceMeshProps {
  instance: LoadedCharacterInstance;
  isSelected?: boolean;
  isHighlighted?: boolean;
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export const CharacterInstanceMesh: React.FC<CharacterInstanceMeshProps> = ({
  instance,
  isSelected = false,
  isHighlighted = false,
  wireframe = false,
  castShadow = true,
  receiveShadow = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const isHinaPiano = isHinaPianoPerformer(instance.manifestEntry, instance.scene);
  const weaponObjectsRef = useRef<THREE.Object3D[]>([]);

  // Discover and enforce weapon hidden state for Hina with Piano
  useEffect(() => {
    if (!instance.scene) return;

    if (isHinaPiano) {
      enforceHinaPianoWeaponHidden(instance.scene);
      const weapons: THREE.Object3D[] = [];
      instance.scene.traverse((obj) => {
        if (isHinaPianoWeaponObject(obj)) {
          obj.visible = false;
          weapons.push(obj);
        }
      });
      weaponObjectsRef.current = weapons;
    } else {
      weaponObjectsRef.current = [];
    }
  }, [instance.scene, isHinaPiano]);

  // =========================================================================
  // ANIMATION MIXER FRAME UPDATE (Part 4)
  // Each character instance updates its own independent mixer using delta time
  // =========================================================================
  useFrame((_, delta) => {
    if (instance.mixer && instance.visible) {
      // Clamp delta to avoid huge time jumps when switching tabs
      const safeDelta = Math.min(delta, 0.1);
      instance.mixer.update(safeDelta);

      // Guarantee the detached weapon remains hidden across every animation frame
      if (isHinaPiano && weaponObjectsRef.current.length > 0) {
        for (let i = 0; i < weaponObjectsRef.current.length; i++) {
          const w = weaponObjectsRef.current[i];
          if (w.visible) {
            w.visible = false;
          }
        }
      }
    }
  });

  // Synchronize wireframe & shadow settings
  useEffect(() => {
    if (!instance.scene) return;

    if (isHinaPiano) {
      enforceHinaPianoWeaponHidden(instance.scene);
    }

    instance.scene.traverse((obj) => {
      // Skip weapon objects so they are never inadvertently made visible
      if (isHinaPiano && isHinaPianoWeaponObject(obj)) {
        obj.visible = false;
        return;
      }

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
  }, [instance.scene, wireframe, castShadow, receiveShadow, isHinaPiano]);

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

      {/* Live Audio Detected Instrument Highlight Ring & Aura */}
      {isHighlighted && (
        <group position={[0, 0.008, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.65, 32]} />
            <meshBasicMaterial color="#10B981" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.54, 32]} />
            <meshBasicMaterial color="#10B981" transparent opacity={0.16} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
};
