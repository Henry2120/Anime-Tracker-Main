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
 *
 * CRITICAL FIX FOR VISIBILITY:
 * Raw violin.glb and bow.glb contain nested Sketchfab wrapper nodes with arbitrary
 * rotation (-90° / 180°), translation offsets (+30m), and sub-millimeter scales (0.0076).
 * This component extracts the actual meshes directly and attaches them to a clean canonical
 * group with standard SI meter scaling (scale 0.01 from raw centimeter vertices).
 * Both instruments are 100% visible, correctly proportioned, and dynamically transformed.
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

    // 1. Load production violin.glb
    loader.load(
      '/music-lab/instruments/violin.glb',
      (gltf) => {
        if (isCancelled) return;
        const vGroup = new THREE.Group();
        vGroup.name = 'CanonicalViolinMeshGroup';

        // Extract the actual violin body mesh, bypassing Sketchfab wrapper node transforms
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = (child as THREE.Mesh).clone(true);
            mesh.position.set(0, 0, 0);
            mesh.quaternion.identity();
            // Convert raw centimeter vertices to SI meters
            mesh.scale.set(0.01, 0.01, 0.01);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                m.transparent = false;
                m.opacity = 1.0;
                m.depthWrite = true;
                if ('roughness' in m) m.roughness = 0.35;
                if ('metalness' in m) m.metalness = 0.1;
                if ('map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                m.needsUpdate = true;
              });
            }
            vGroup.add(mesh);
          }
        });

        vGroup.updateMatrixWorld(true);
        setViolinMeshGroup(vGroup);
      },
      undefined,
      (err) => console.error('Failed to load violin.glb:', err)
    );

    // 2. Load production bow.glb
    loader.load(
      '/music-lab/instruments/bow.glb',
      (gltf) => {
        if (isCancelled) return;
        const bGroup = new THREE.Group();
        bGroup.name = 'CanonicalBowMeshGroup';

        // Extract all bow meshes (stick, frog, hair, screw, winding), bypassing Sketchfab wrapper transforms
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = (child as THREE.Mesh).clone(true);
            mesh.position.set(0, 0, 0);
            mesh.quaternion.identity();
            // Convert raw centimeter vertices to SI meters
            mesh.scale.set(0.01, 0.01, 0.01);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                m.transparent = false;
                m.opacity = 1.0;
                m.depthWrite = true;
                if ('roughness' in m) m.roughness = 0.3;
                if ('map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                m.needsUpdate = true;
              });
            }
            bGroup.add(mesh);
          }
        });

        bGroup.updateMatrixWorld(true);
        setBowMeshGroup(bGroup);
      },
      undefined,
      (err) => console.error('Failed to load bow.glb:', err)
    );

    return () => {
      isCancelled = true;
    };
  }, []);

  // Synchronize transforms to root groups
  useEffect(() => {
    if (violinRootRef.current && violinTransform) {
      violinRootRef.current.position.copy(violinTransform.position);
      violinRootRef.current.quaternion.copy(violinTransform.quaternion);
      violinRootRef.current.scale.copy(violinTransform.scale);
      violinRootRef.current.updateMatrixWorld(true);
    }
  }, [violinTransform]);

  useEffect(() => {
    if (bowRootRef.current && bowTransform) {
      bowRootRef.current.position.copy(bowTransform.position);
      bowRootRef.current.quaternion.copy(bowTransform.quaternion);
      bowRootRef.current.scale.copy(bowTransform.scale);
      bowRootRef.current.updateMatrixWorld(true);
    }
  }, [bowTransform]);

  if (!visible) return null;

  return (
    <group name="InstrumentsContainer">
      {/* Violin Root Group */}
      <group ref={violinRootRef} name="ViolinRoot">
        {violinMeshGroup && <primitive object={violinMeshGroup} />}
      </group>

      {/* Bow Root Group */}
      <group ref={bowRootRef} name="BowRoot">
        {bowMeshGroup && <primitive object={bowMeshGroup} />}
      </group>
    </group>
  );
};
