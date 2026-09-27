import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export interface CharacterModelProps {
  url?: string;
  onLoaded?: (vrm: VRM) => void;
  onError?: (error: Error | string) => void;
  onProgress?: (progress: number) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

/**
 * CharacterModel: Neutral VRM 3D Character Component for Music Lab
 * Loads /models/test.vrm using GLTFLoader + @pixiv/three-vrm VRMLoaderPlugin.
 * 
 * Fix for MToon Black Materials:
 * - Preserves VRM MToon shaders and culling (never forces DoubleSide on inverted-hull outlines).
 * - Enforces sRGB color space on all embedded texture maps.
 * - Calibrates bounding box and grounds feet on the stage plane (y = 0).
 * - Performs vrm.update(delta) for continuous shader and spring bone execution.
 */
export const CharacterModel: React.FC<CharacterModelProps> = ({
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

        // VRM 0.0 coordinate/rotation correction if applicable
        try {
          VRMUtils.rotateVRM0(vrm);
        } catch (e) {
          console.warn('VRMUtils.rotateVRM0 notice:', e);
        }

        vrmRef.current = vrm;

        // Traverse meshes: enable shadows and ensure textures use sRGB color space
        vrm.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((mat) => {
              if (!mat) return;

              // Ensure texture maps use sRGB color space so skin/clothing colors aren't crushed to black
              if ('map' in mat && mat.map) {
                (mat.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                (mat.map as THREE.Texture).needsUpdate = true;
              }
              if ('shadeMultiplyTexture' in mat && (mat as any).shadeMultiplyTexture) {
                ((mat as any).shadeMultiplyTexture as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                ((mat as any).shadeMultiplyTexture as THREE.Texture).needsUpdate = true;
              }
              if ('emissiveMap' in mat && (mat as any).emissiveMap) {
                ((mat as any).emissiveMap as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
              }

              // Do NOT override mat.side to DoubleSide on MToon materials
              // MToon uses front-side for main geometry and back-side for inverted-hull black outlines.
              // Forcing DoubleSide causes black outline hulls to overlay all front-facing skin/clothing!
              mat.needsUpdate = true;
            });
          }
        });

        // Center model geometry and align feet with ground plane (y = 0)
        const bbox = new THREE.Box3().setFromObject(vrm.scene);
        const center = bbox.getCenter(new THREE.Vector3());

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

  // Frame update for VRM spring bone physics & internal shader uniforms
  useFrame((_, delta) => {
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale} />
  );
};
