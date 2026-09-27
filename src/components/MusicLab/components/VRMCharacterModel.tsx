import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import { MusicInstrument } from '../types';
import { CharacterModelConfig } from '../characters/registry';

export interface VRMCharacterModelProps {
  modelConfig: CharacterModelConfig;
  customModelUrl?: string | null;
  pose?: 'relaxed_idle' | 'neutral_standing' | 'violin_playing' | 'guitar_playing' | 'piano_seated' | 'vocal_performance';
  activeInstrument?: MusicInstrument | null;
  isPlaying?: boolean;
  expressionPreset?: 'neutral' | 'happy' | 'relaxed' | 'surprised' | 'singing';
  enableBlinking?: boolean;
  enableSpringBones?: boolean;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onModelLoaded?: (info: { isVRM: boolean; vrmVersion?: string; boneCount?: number }) => void;
  onError?: (err: string) => void;
}

/**
 * Decoupled 3D Instrument Prop Component
 * Attaches dynamically to the performer without being baked into the character.
 */
const DecoupledInstrumentProp: React.FC<{
  instrument: MusicInstrument;
  isPlaying?: boolean;
  theme?: string;
}> = ({ instrument, isPlaying = false }) => {
  const propGroupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (isPlaying && propGroupRef.current) {
      const t = state.clock.getElapsedTime();
      if (instrument === 'violin') {
        propGroupRef.current.rotation.z = Math.sin(t * 4.0) * 0.04;
      }
    }
  });

  switch (instrument) {
    case 'violin':
      return (
        <group ref={propGroupRef} position={[-0.15, 1.22, 0.18]} rotation={[0.4, -0.6, 0.8]}>
          {/* Violin Body */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.09, 0.28, 0.04]} />
            <meshStandardMaterial color="#8B4513" roughness={0.35} metalness={0.2} />
          </mesh>
          {/* Violin Neck */}
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.2, 12]} />
            <meshStandardMaterial color="#2B1810" roughness={0.5} />
          </mesh>
          {/* Violin Bow */}
          <group position={[0.08, 0.06, 0.06]} rotation={[0, 0, 1.2]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.004, 0.004, 0.45, 8]} />
              <meshStandardMaterial color="#D4AF37" roughness={0.3} metalness={0.6} />
            </mesh>
          </group>
        </group>
      );

    case 'acoustic-guitar':
    case 'classical-guitar':
    case 'electric-guitar':
    case 'bass':
      return (
        <group ref={propGroupRef} position={[0, 0.95, 0.22]} rotation={[0.2, 0.1, -0.45]}>
          {/* Guitar Body */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.28, 0.42, 0.07]} />
            <meshStandardMaterial
              color={instrument === 'electric-guitar' ? '#991B1B' : '#A0522D'}
              roughness={0.3}
              metalness={instrument === 'electric-guitar' ? 0.4 : 0.1}
            />
          </mesh>
          {/* Guitar Neck */}
          <mesh position={[0, 0.38, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.025, 0.48, 12]} />
            <meshStandardMaterial color="#3E2723" roughness={0.4} />
          </mesh>
          {/* Headstock */}
          <mesh position={[0, 0.65, 0]} castShadow>
            <boxGeometry args={[0.06, 0.1, 0.025]} />
            <meshStandardMaterial color="#212121" roughness={0.3} />
          </mesh>
        </group>
      );

    case 'flute':
      return (
        <group ref={propGroupRef} position={[0.08, 1.34, 0.15]} rotation={[0.1, 0.3, -1.3]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.01, 0.01, 0.48, 16]} />
            <meshStandardMaterial color="#E0E0E0" roughness={0.2} metalness={0.9} />
          </mesh>
        </group>
      );

    case 'vocalist':
    case 'vocals-effects':
      return (
        <group ref={propGroupRef} position={[0, 1.32, 0.35]}>
          {/* Microphone Stand */}
          <mesh position={[0, -0.65, 0]} castShadow>
            <cylinderGeometry args={[0.008, 0.012, 1.3, 12]} />
            <meshStandardMaterial color="#424242" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Stand Base */}
          <mesh position={[0, -1.3, 0]} receiveShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.02, 24]} />
            <meshStandardMaterial color="#212121" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Mic Capsule */}
          <mesh position={[0, 0.02, 0]} castShadow>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshStandardMaterial color="#E0E0E0" metalness={0.85} roughness={0.2} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
};

/**
 * VRM & GLB Character Loader
 * Decoupled humanoid model loader using @pixiv/three-vrm with fallback to standard GLTF.
 */
export const VRMCharacterModel: React.FC<VRMCharacterModelProps> = ({
  modelConfig,
  customModelUrl,
  pose = 'relaxed_idle',
  activeInstrument = null,
  isPlaying = false,
  expressionPreset = 'neutral',
  enableBlinking = true,
  enableSpringBones = true,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  onModelLoaded,
  onError,
}) => {
  const containerRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const gltfSceneRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blinkTimer = useRef(0);

  const activeUrl = customModelUrl || modelConfig.assetPath;

  // Load Model with @pixiv/three-vrm plugin
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    const loader = new GLTFLoader();
    // Register VRMLoaderPlugin
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const targetUrl = activeUrl;

    loader.load(
      targetUrl,
      (gltf) => {
        if (!isMounted) return;

        const vrm = gltf.userData.vrm as VRM | undefined;

        if (vrm) {
          // It is a valid VRM model
          VRMUtils.rotateVRM0(vrm);
          vrmRef.current = vrm;
          gltfSceneRef.current = vrm.scene;

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
          // Standard GLB / GLTF model fallback
          const scene = gltf.scene;
          gltfSceneRef.current = scene;
          vrmRef.current = null;

          scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });

          // Setup animation mixer if animations exist
          if (gltf.animations && gltf.animations.length > 0) {
            mixerRef.current = new THREE.AnimationMixer(scene);
            const action = mixerRef.current.clipAction(gltf.animations[0]);
            action.play();
          }

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
        console.warn(`VRM / GLB Asset not found at ${targetUrl}. Ready for external asset.`);
        setIsLoading(false);
        setLoadError(`External model asset waiting at: ${targetUrl}`);
        onError?.(`External model asset waiting at: ${targetUrl}`);
      }
    );

    return () => {
      isMounted = false;
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
      }
    };
  }, [activeUrl, onModelLoaded, onError]);

  // Frame update loop for VRM spring bones, blendshapes, poses, and breathing
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // 1. VRM Spring Bone Physics & Update
    if (vrmRef.current) {
      const vrm = vrmRef.current;

      if (enableSpringBones) {
        vrm.update(delta);
      }

      // 2. VRM Facial Expressions / BlendShapes
      if (vrm.expressionManager) {
        // Natural eye blinking
        if (enableBlinking) {
          blinkTimer.current += delta;
          if (blinkTimer.current > 3.8) {
            vrm.expressionManager.setValue('blink', 1.0);
            if (blinkTimer.current > 4.0) {
              vrm.expressionManager.setValue('blink', 0.0);
              blinkTimer.current = Math.random() * 0.4;
            }
          } else {
            vrm.expressionManager.setValue('blink', 0.0);
          }
        }

        // Apply expression preset
        if (expressionPreset === 'happy') {
          vrm.expressionManager.setValue('happy', 0.6);
          vrm.expressionManager.setValue('relaxed', 0.2);
        } else if (expressionPreset === 'relaxed') {
          vrm.expressionManager.setValue('relaxed', 0.5);
        } else if (expressionPreset === 'singing') {
          vrm.expressionManager.setValue('aa', isPlaying ? 0.5 + Math.sin(t * 8) * 0.3 : 0.2);
          vrm.expressionManager.setValue('happy', 0.3);
        }
      }

      // 3. Humanoid Bone Procedural Posing
      if (vrm.humanoid) {
        const headNode = vrm.humanoid.getNormalizedBoneNode('head' as VRMHumanBoneName);
        const chestNode = vrm.humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName);
        const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
        const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
        const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
        const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);

        // Idle Breathing
        if (chestNode) {
          chestNode.rotation.x = Math.sin(t * 2.0) * 0.02;
        }

        // Head motion
        if (headNode) {
          headNode.rotation.y = Math.sin(t * 0.7) * 0.05;
          headNode.rotation.x = Math.sin(t * 1.2) * 0.02;
        }

        // Instrument-specific decoupled pose binding
        if (pose === 'violin_playing' || activeInstrument === 'violin') {
          if (leftUpperArm) leftUpperArm.rotation.z = 0.8;
          if (leftLowerArm) leftLowerArm.rotation.y = 1.2;
          if (rightUpperArm) rightUpperArm.rotation.z = -0.5 + (isPlaying ? Math.sin(t * 4.0) * 0.2 : 0);
          if (rightLowerArm) rightLowerArm.rotation.x = 0.6;
        } else if (pose === 'guitar_playing' || activeInstrument === 'acoustic-guitar' || activeInstrument === 'electric-guitar') {
          if (leftUpperArm) leftUpperArm.rotation.z = 0.4;
          if (leftLowerArm) leftLowerArm.rotation.y = 0.8;
          if (rightUpperArm) rightUpperArm.rotation.z = -0.3;
          if (rightLowerArm) rightLowerArm.rotation.x = 0.4 + (isPlaying ? Math.sin(t * 5.0) * 0.15 : 0);
        } else if (pose === 'relaxed_idle') {
          if (leftUpperArm) leftUpperArm.rotation.z = 0.12 + Math.sin(t * 1.5) * 0.02;
          if (rightUpperArm) rightUpperArm.rotation.z = -0.12 - Math.sin(t * 1.5) * 0.02;
        }
      }
    }

    // Standard GLB Mixer update
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* 3D Model Root Mount Point */}
      <group ref={containerRef} />

      {/* Decoupled Instrument Prop (Mounted separately from Character) */}
      {activeInstrument && (
        <DecoupledInstrumentProp instrument={activeInstrument} isPlaying={isPlaying} />
      )}
    </group>
  );
};
