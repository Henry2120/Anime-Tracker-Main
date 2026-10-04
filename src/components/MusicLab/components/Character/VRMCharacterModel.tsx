import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { VRMHumanoidAdapter } from '../../core/VRMHumanoidAdapter';

export interface VRMCharacterModelProps {
  modelUrl: string;
  onLoaded?: (adapter: VRMHumanoidAdapter, vrm: VRM) => void;
  onError?: (error: Error) => void;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Three.js React Three Fiber Component for Loading and Rendering VRM Characters.
 * Instantiates the VRMHumanoidAdapter and manages lifecycle + clean disposal.
 */
export const VRMCharacterModel: React.FC<VRMCharacterModelProps> = ({
  modelUrl,
  onLoaded,
  onError,
  castShadow = true,
  receiveShadow = true,
}) => {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const vrmRef = useRef<VRM | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelUrl,
      (gltf) => {
        if (isCancelled) return;
        const loadedVrm = gltf.userData.vrm as VRM;
        if (!loadedVrm) {
          onError?.(new Error('Failed to parse VRM from GLTF asset'));
          return;
        }

        // Configure shadows and material color space
        loadedVrm.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = castShadow;
            obj.receiveShadow = receiveShadow;
            const mesh = obj as THREE.Mesh;
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

        // Initialize reusable humanoid adapter
        const adapter = new VRMHumanoidAdapter(loadedVrm);
        adapter.resetToRestPose();

        vrmRef.current = loadedVrm;
        setVrm(loadedVrm);
        onLoaded?.(adapter, loadedVrm);
      },
      undefined,
      (err) => {
        if (isCancelled) return;
        console.error('Error loading VRM character:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    );

    return () => {
      isCancelled = true;
      if (vrmRef.current) {
        // Clean disposal of VRM Three.js scene (Phase 18)
        vrmRef.current.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => m.dispose());
            }
          }
        });
        vrmRef.current = null;
      }
    };
  }, [modelUrl]);

  // Update VRM internal components (blendshapes, springbones)
  useFrame((_, delta) => {
    if (vrm) {
      vrm.update(delta);
    }
  });

  if (!vrm) return null;

  return <primitive object={vrm.scene} />;
};
