import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Transform3D } from '../../core/types';

interface ViolinAndBowGroupProps {
  violinTransform: Transform3D | null;
  bowTransform: Transform3D | null;
  visible?: boolean;
}

/**
 * 3D Component for rendering the canonical Violin and Bow models.
 * Loads actual assets from /music-lab/instruments/violin.glb and /music-lab/instruments/bow.glb.
 * Applies the kinematically solved and animated transforms.
 */
export const ViolinAndBowGroup: React.FC<ViolinAndBowGroupProps> = ({
  violinTransform,
  bowTransform,
  visible = true,
}) => {
  const [violinMeshGroup, setViolinMeshGroup] = useState<THREE.Group | null>(null);
  const [bowMeshGroup, setBowMeshGroup] = useState<THREE.Group | null>(null);

  const violinRootRef = useRef<THREE.Group>(null);
  const bowRootRef = useRef<THREE.Group>(null);

  useEffect(() => {
    let isCancelled = false;
    const loader = new GLTFLoader();

    // 1. Load standalone violin.glb
    loader.load(
      '/music-lab/instruments/violin.glb',
      (gltf) => {
        if (isCancelled) return;
        const vGroup = new THREE.Group();
        vGroup.name = 'CanonicalViolinMeshGroup';

        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                if (m && 'map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
              });
            }
          }
        });

        // The raw glb mesh is in centimeters; scale 0.01 brings it to SI meters
        gltf.scene.scale.set(0.01, 0.01, 0.01);
        vGroup.add(gltf.scene);
        setViolinMeshGroup(vGroup);
      },
      undefined,
      (err) => console.error('Failed to load violin.glb:', err)
    );

    // 2. Load standalone bow.glb
    loader.load(
      '/music-lab/instruments/bow.glb',
      (gltf) => {
        if (isCancelled) return;
        const bGroup = new THREE.Group();
        bGroup.name = 'CanonicalBowMeshGroup';

        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                if (m && 'map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
              });
            }
          }
        });

        // The raw glb mesh is in centimeters; scale 0.01 brings it to SI meters
        gltf.scene.scale.set(0.01, 0.01, 0.01);
        bGroup.add(gltf.scene);
        setBowMeshGroup(bGroup);
      },
      undefined,
      (err) => console.error('Failed to load bow.glb:', err)
    );

    return () => {
      isCancelled = true;
    };
  }, []);

  // Sync transforms to group roots
  useEffect(() => {
    if (violinRootRef.current && violinTransform) {
      violinRootRef.current.position.copy(violinTransform.position);
      violinRootRef.current.quaternion.copy(violinTransform.quaternion);
      violinRootRef.current.scale.copy(violinTransform.scale);
    }
  }, [violinTransform]);

  useEffect(() => {
    if (bowRootRef.current && bowTransform) {
      bowRootRef.current.position.copy(bowTransform.position);
      bowRootRef.current.quaternion.copy(bowTransform.quaternion);
      bowRootRef.current.scale.copy(bowTransform.scale);
    }
  }, [bowTransform]);

  if (!visible) return null;

  return (
    <group name="InstrumentsContainer">
      {/* Violin Group */}
      <group ref={violinRootRef} name="ViolinRoot">
        {violinMeshGroup && <primitive object={violinMeshGroup} />}
      </group>

      {/* Bow Group */}
      <group ref={bowRootRef} name="BowRoot">
        {bowMeshGroup && <primitive object={bowMeshGroup} />}
      </group>
    </group>
  );
};
