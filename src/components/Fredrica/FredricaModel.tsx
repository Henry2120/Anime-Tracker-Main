import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export interface FredricaModelProps {
  url?: string;
  onLoaded?: (vrm: VRM) => void;
  onError?: (error: Error | string) => void;
  onProgress?: (progress: number) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

/**
 * FredricaModel: Isolated VRM Character Component
 * Loads /models/test.vrm using GLTFLoader and @pixiv/three-vrm VRMLoaderPlugin.
 * Handles centering, bounding box normalization, VRM 0.0 rotation, and resource disposal.
 */
export const FredricaModel: React.FC<FredricaModelProps> = ({
  url = '/models/test.vrm',
  onLoaded,
  onError,
  onProgress,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1.0,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();

    // Register VRM plugin for the installed @pixiv/three-vrm version
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        if (!isMounted) return;

        const vrm = gltf.userData.vrm as VRM | undefined;

        if (!vrm) {
          const err = new Error(`File at ${url} is not a valid VRM model (no VRM extension found in gltf.userData).`);
          onError?.(err);
          return;
        }

        // VRM 0.0 coordinate/rotation correction
        try {
          VRMUtils.rotateVRM0(vrm);
        } catch (e) {
          console.warn('VRMUtils.rotateVRM0 notice:', e);
        }

        vrmRef.current = vrm;

        // Traverse meshes to enable casting and receiving shadows
        vrm.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Ensure materials are rendered with proper double-sidedness and color space
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((mat) => {
                mat.side = THREE.DoubleSide;
                mat.needsUpdate = true;
              });
            } else if (mesh.material) {
              mesh.material.side = THREE.DoubleSide;
              mesh.material.needsUpdate = true;
            }
          }
        });

        // Center model geometry on the floor platform
        const bbox = new THREE.Box3().setFromObject(vrm.scene);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());

        // Offset so feet align with ground plane (y = 0) and model is centered horizontally
        vrm.scene.position.x = -center.x;
        vrm.scene.position.y = -bbox.min.y;
        vrm.scene.position.z = -center.z;

        if (groupRef.current) {
          groupRef.current.clear();
          groupRef.current.add(vrm.scene);
        }

        onLoaded?.(vrm);
      },
      (progressEvent) => {
        if (progressEvent.lengthComputable && progressEvent.total > 0) {
          const percent = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress?.(percent);
        }
      },
      (error) => {
        if (!isMounted) return;
        console.error('Failed to load VRM model at', url, error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    );

    return () => {
      isMounted = false;
      if (vrmRef.current) {
        try {
          VRMUtils.deepDispose(vrmRef.current.scene);
        } catch (e) {
          console.warn('Error during VRM deepDispose:', e);
        }
        vrmRef.current = null;
      }
    };
  }, [url, onLoaded, onError, onProgress]);

  // Frame update for VRM spring bone physics & internal state
  useFrame((_, delta) => {
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale} />
  );
};
