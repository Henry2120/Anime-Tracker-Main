import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GlbEnvironmentLoadState {
  id: string;
  name: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  errorMessage?: string;
}

type StatusListener = (state: Record<string, GlbEnvironmentLoadState>) => void;

const envLoadStates: Record<string, GlbEnvironmentLoadState> = {};
const statusListeners = new Set<StatusListener>();

function publishStatus(next: GlbEnvironmentLoadState): void {
  envLoadStates[next.id] = next;
  const snapshot = { ...envLoadStates };
  statusListeners.forEach((listener) => listener(snapshot));
}

function clearStatus(id: string): void {
  if (id in envLoadStates) {
    delete envLoadStates[id];
    const snapshot = { ...envLoadStates };
    statusListeners.forEach((listener) => listener(snapshot));
  }
}

export function subscribeGlbEnvironmentStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener({ ...envLoadStates });
  return () => {
    statusListeners.delete(listener);
  };
}

/**
 * Recursively disposes every Geometry, Material, Texture, Light, and AnimationMixer
 * associated with a dynamically loaded GLB environment hierarchy.
 */
function disposeGlbEnvironmentScene(
  root: THREE.Object3D,
  mixer: THREE.AnimationMixer | null
): void {
  if (mixer) {
    try {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    } catch {}
  }

  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) {
      const light = obj as THREE.Light;
      if (typeof light.dispose === 'function') {
        try {
          light.dispose();
        } catch {}
      }
    }

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          Object.values(mat).forEach((val) => {
            if (val && typeof val === 'object' && 'isTexture' in val && (val as THREE.Texture).isTexture) {
              (val as THREE.Texture).dispose();
            }
          });
          mat.dispose();
        });
      }
    }
  });
}

export interface GlbEnvironmentAssetProps {
  id: string;
  name: string;
  url: string;
  preferredClipName?: string;
  position?: [number, number, number];
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Lazy-loaded Three.js GLB Environment Asset component.
 * Only fetches the remote GLB when mounted (explicitly selected by the user),
 * plays its looping stage animation if present (e.g. FireShow_Loop),
 * and disposes all GPU geometries, materials, textures, and KHR_lights_punctual
 * lights cleanly on unmount / deactivation.
 */
export const GlbEnvironmentAsset: React.FC<GlbEnvironmentAssetProps> = ({
  id,
  name,
  url,
  preferredClipName,
  position = [0, 0, 0],
  scale = 1,
  castShadow = false,
  receiveShadow = true,
}) => {
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeRoot: THREE.Object3D | null = null;
    let activeMixer: THREE.AnimationMixer | null = null;

    const loader = new GLTFLoader();
    publishStatus({ id, name, status: 'loading', progress: 0 });

    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene || gltf.scenes?.[0];
        if (!scene) {
          if (!cancelled) {
            publishStatus({
              id,
              name,
              status: 'error',
              progress: 0,
              errorMessage: `${name} GLB contains no valid 3D scene.`,
            });
          }
          return;
        }

        if (cancelled) {
          disposeGlbEnvironmentScene(scene, null);
          return;
        }

        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = castShadow;
            mesh.receiveShadow = receiveShadow;
            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                if ('map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                if ('emissiveMap' in m && m.emissiveMap) {
                  (m.emissiveMap as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                if (m.transparent === false || ('alphaTest' in m && (m as any).alphaTest > 0)) {
                  m.depthWrite = true;
                }
              });
            }
          }
        });

        // Setup AnimationMixer only if the GLB ships animation clips
        const clips = gltf.animations || [];
        if (clips.length > 0) {
          const mixer = new THREE.AnimationMixer(scene);
          const chosenClip =
            (preferredClipName && THREE.AnimationClip.findByName(clips, preferredClipName)) ||
            THREE.AnimationClip.findByName(clips, 'FireShow_Loop') ||
            clips[0];

          if (chosenClip) {
            const action = mixer.clipAction(chosenClip);
            action.reset();
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(1);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          }
          activeMixer = mixer;
          mixerRef.current = mixer;
        }

        activeRoot = scene;
        setLoadedScene(scene);
        publishStatus({ id, name, status: 'ready', progress: 100 });
      },
      (progressEvent) => {
        if (cancelled) return;
        const pct =
          progressEvent.total > 0
            ? Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100))
            : 0;
        publishStatus({ id, name, status: 'loading', progress: pct });
      },
      (err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : `Failed to load ${name} GLB.`;
        console.error(`[GlbEnvironmentAsset] Failed to load ${name} (${url}):`, err);
        publishStatus({ id, name, status: 'error', progress: 0, errorMessage: msg });
      }
    );

    return () => {
      cancelled = true;
      mixerRef.current = null;
      if (activeRoot) {
        disposeGlbEnvironmentScene(activeRoot, activeMixer);
        activeRoot = null;
      }
      setLoadedScene(null);
      clearStatus(id);
    };
  }, [id, name, url, preferredClipName, castShadow, receiveShadow]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(Math.min(delta, 0.1));
    }
  });

  if (!loadedScene) return null;

  return (
    <primitive
      object={loadedScene}
      position={position}
      scale={[scale, scale, scale]}
    />
  );
};

export default GlbEnvironmentAsset;
