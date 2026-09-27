import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

export interface Character3DModelProps {
  modelUrl: string;
  isPlayingAnimation: boolean;
  selectedClipName?: string;
  onClipsDetected?: (clips: { name: string; duration: number }[]) => void;
  onModelLoaded?: (info: { meshCount: number; boneCount: number; vertexCount: number }) => void;
  onError?: (errorMsg: string) => void;
  scaleFactor?: number;
  positionOffset?: [number, number, number];
}

/**
 * Loads a real 3D humanoid GLB model, sets up materials & shadows,
 * normalizes bounding box position to stage floor,
 * detects embedded animation clips, and plays/stops animations via THREE.AnimationMixer.
 */
export const Character3DModel: React.FC<Character3DModelProps> = ({
  modelUrl,
  isPlayingAnimation,
  selectedClipName,
  onClipsDetected,
  onModelLoaded,
  onError,
  scaleFactor = 1,
  positionOffset = [0, 0, 0],
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Load GLTF / GLB using @react-three/drei hook
  const gltf = useGLTF(modelUrl);
  const [modelBounds, setModelBounds] = useState<{ center: THREE.Vector3; size: THREE.Vector3; scale: number }>({
    center: new THREE.Vector3(0, 0, 0),
    size: new THREE.Vector3(1, 2, 1),
    scale: 1,
  });

  // Deep clone scene to avoid sharing mutable state if loaded multiple times
  const sceneClone = useMemo(() => {
    if (!gltf || !gltf.scene) return null;
    return gltf.scene.clone(true);
  }, [gltf]);

  // Analyze model hierarchy, setup shadows, compute bounding box, and report statistics
  useEffect(() => {
    if (!sceneClone) return;

    try {
      let meshCount = 0;
      let boneCount = 0;
      let vertexCount = 0;

      // Ensure proper shadow casting/receiving and materials
      sceneClone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          meshCount++;

          if (mesh.geometry) {
            vertexCount += mesh.geometry.attributes.position?.count || 0;
          }

          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((mat) => {
              mat.side = THREE.DoubleSide;
              if ('roughness' in mat && typeof mat.roughness === 'number') {
                mat.roughness = Math.min(1.0, Math.max(0.2, mat.roughness));
              }
            });
          }
        }

        if ((child as THREE.Bone).isBone) {
          boneCount++;
        }
      });

      // Calculate bounding box to normalize scale and center the model directly on the stage
      const box = new THREE.Box3().setFromObject(sceneClone);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Target character height around 2.2 units on the diorama stage
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetHeight = 2.2;
      const normalizedScale = maxDim > 0 ? targetHeight / (size.y > 0 ? size.y : maxDim) : 1;

      setModelBounds({
        center,
        size,
        scale: normalizedScale,
      });

      onModelLoaded?.({
        meshCount,
        boneCount,
        vertexCount,
      });
    } catch (err: any) {
      console.error('[Character3DModel] Error processing GLB hierarchy:', err);
      onError?.(err?.message || 'Failed to initialize 3D model meshes');
    }
  }, [sceneClone, onModelLoaded, onError]);

  // Setup AnimationMixer & detect animation clips
  useEffect(() => {
    if (!sceneClone) return;

    // Detect all clips in the GLB
    const rawClips = gltf.animations || [];
    const clipInfoList = rawClips.map((c, idx) => ({
      name: c.name || `Animation_${idx + 1}`,
      duration: parseFloat(c.duration.toFixed(2)),
    }));

    console.log('[Character3DModel] Loaded GLB:', modelUrl);
    console.log('[Character3DModel] Detected animation clips count:', rawClips.length);
    rawClips.forEach((c, idx) => console.log(`  [Clip ${idx + 1}] "${c.name}" (${c.duration.toFixed(2)}s)`));

    onClipsDetected?.(clipInfoList);

    // Initialize mixer
    const mixer = new THREE.AnimationMixer(sceneClone);
    mixerRef.current = mixer;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(sceneClone);
      mixerRef.current = null;
      currentActionRef.current = null;
    };
  }, [sceneClone, gltf.animations, modelUrl, onClipsDetected]);

  // Handle Play / Stop animation transition with smooth crossfade
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || !sceneClone) return;

    const clips = gltf.animations || [];
    if (clips.length === 0) {
      console.log('[Character3DModel] No animation clips in GLB to play.');
      return;
    }

    if (isPlayingAnimation) {
      // Find selected clip or default to first available
      let targetClip = clips[0];
      if (selectedClipName) {
        const found = clips.find((c) => c.name === selectedClipName);
        if (found) targetClip = found;
      }

      if (targetClip) {
        const action = mixer.clipAction(targetClip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;

        if (currentActionRef.current && currentActionRef.current !== action) {
          action.crossFadeFrom(currentActionRef.current, 0.35, true);
        } else {
          action.fadeIn(0.25);
        }

        action.play();
        currentActionRef.current = action;
        console.log(`[Character3DModel] Playing animation: "${targetClip.name}" (${targetClip.duration.toFixed(2)}s)`);
      }
    } else {
      // Stop animation and smoothly return to rest / idle posture
      if (currentActionRef.current) {
        currentActionRef.current.fadeOut(0.35);
        setTimeout(() => {
          if (!isPlayingAnimation && currentActionRef.current) {
            currentActionRef.current.stop();
            currentActionRef.current = null;
          }
        }, 360);
        console.log('[Character3DModel] Stopped animation (returned to idle / rest state)');
      }
    }
  }, [isPlayingAnimation, selectedClipName, gltf.animations, sceneClone]);

  // Update animation mixer every frame
  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  if (!sceneClone) return null;

  // Calculate position so bottom of bounding box aligns with Y=0
  const effectiveScale = modelBounds.scale * scaleFactor;
  const bottomY = (modelBounds.center.y - modelBounds.size.y / 2) * effectiveScale;
  const posX = -modelBounds.center.x * effectiveScale + positionOffset[0];
  const posY = -bottomY + positionOffset[1];
  const posZ = -modelBounds.center.z * effectiveScale + positionOffset[2];

  return (
    <group ref={groupRef}>
      <primitive
        object={sceneClone}
        position={[posX, posY, posZ]}
        scale={[effectiveScale, effectiveScale, effectiveScale]}
      />
    </group>
  );
};
