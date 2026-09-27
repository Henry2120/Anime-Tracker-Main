import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { CharacterModelConfig } from '../characters/registry';

export interface VRMCharacterModelProps {
  modelConfig: CharacterModelConfig;
  customModelUrl?: string | null;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onModelLoaded?: (info: { isVRM: boolean; vrmVersion?: string; boneCount?: number }) => void;
  onError?: (err: string) => void;
}

/**
 * VRM & GLB Passive Character Model
 * Loads and renders the VRM model cleanly in its authored default pose.
 * Preserves correct MToon materials and sRGB texture color spaces.
 */
export const VRMCharacterModel: React.FC<VRMCharacterModelProps> = ({
  modelConfig,
  customModelUrl,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  onModelLoaded,
  onError,
}) => {
  const containerRef = useRef<THREE.Group>(null);
  const currentModelSceneRef = useRef<THREE.Group | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeUrl = customModelUrl || modelConfig.assetPath;

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const targetUrl = activeUrl;

    loader.load(
      targetUrl,
      (gltf) => {
        if (!isMounted) return;

        // Dispose previous scene if any
        if (currentModelSceneRef.current) {
          VRMUtils.deepDispose(currentModelSceneRef.current);
          currentModelSceneRef.current = null;
        }

        const vrm = gltf.userData.vrm as VRM | undefined;

        if (vrm) {
          // Adjust VRM0 coordinate system orientation
          VRMUtils.rotateVRM0(vrm);
          currentModelSceneRef.current = vrm.scene;

          // Enable shadows and ensure sRGB textures on all materials
          vrm.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;

              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((mat) => {
                if (!mat) return;
                if ('map' in mat && mat.map) {
                  (mat.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                if ('shadeMultiplyTexture' in mat && (mat as any).shadeMultiplyTexture) {
                  ((mat as any).shadeMultiplyTexture as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                mat.needsUpdate = true;
              });
            }
          });

          // Center VRM model geometry on stage platform
          const bbox = new THREE.Box3().setFromObject(vrm.scene);
          const center = bbox.getCenter(new THREE.Vector3());
          vrm.scene.position.x = -center.x;
          vrm.scene.position.y = -bbox.min.y;
          vrm.scene.position.z = -center.z;

          if (containerRef.current) {
            containerRef.current.clear();
            containerRef.current.add(vrm.scene);
          }

          setIsLoading(false);
          onModelLoaded?.({
            isVRM: true,
            vrmVersion: vrm.meta?.metaVersion || '1.0',
            boneCount: Object.keys(vrm.humanoid?.humanBones || {}).length,
          });
        } else {
          // Standard GLTF / GLB model fallback
          const scene = gltf.scene;
          currentModelSceneRef.current = scene;

          scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });

          const bbox = new THREE.Box3().setFromObject(scene);
          const center = bbox.getCenter(new THREE.Vector3());
          scene.position.x = -center.x;
          scene.position.y = -bbox.min.y;
          scene.position.z = -center.z;

          if (containerRef.current) {
            containerRef.current.clear();
            containerRef.current.add(scene);
          }

          setIsLoading(false);
          onModelLoaded?.({
            isVRM: false,
          });
        }
      },
      undefined,
      (err) => {
        if (!isMounted) return;
        const errMsg = `Character model asset not found at ${targetUrl}.`;
        console.warn(errMsg, err);
        setIsLoading(false);
        setLoadError(errMsg);
        onError?.(errMsg);
      }
    );

    return () => {
      isMounted = false;
      if (currentModelSceneRef.current) {
        VRMUtils.deepDispose(currentModelSceneRef.current);
        currentModelSceneRef.current = null;
      }
    };
  }, [activeUrl, onModelLoaded, onError]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group ref={containerRef} />
    </group>
  );
};
