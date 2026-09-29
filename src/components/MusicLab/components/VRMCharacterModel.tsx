import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import { CharacterModelConfig } from '../characters/registry';
import { ViolinPerformance } from './ViolinPerformance';
import { ReferencePoseData, RetargetDiagnostics } from './ViolinPoseLab/referenceTypes';
import { REFERENCE_MODELS } from './ViolinPoseLab/referenceRegistry';

export interface VRMCharacterModelProps {
  modelConfig: CharacterModelConfig;
  customModelUrl?: string | null;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  reference?: ReferencePoseData;
  isTPose?: boolean;
  onDiagnosticsUpdate?: (diag: RetargetDiagnostics) => void;
  onModelLoaded?: (info: { isVRM: boolean; vrmVersion?: string; boneCount?: number }) => void;
  onError?: (err: string) => void;
  showSkeleton?: boolean;
}

/**
 * VRM & GLB Target Character Model (`test.vrm`)
 * Hosts the Violin Reference Matching Lab without recreating the model.
 */
export const VRMCharacterModel: React.FC<VRMCharacterModelProps> = ({
  modelConfig,
  customModelUrl,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  reference = REFERENCE_MODELS[0],
  isTPose = false,
  onDiagnosticsUpdate,
  onModelLoaded,
  onError,
  showSkeleton = false,
}) => {
  const containerRef = useRef<THREE.Group>(null);
  const currentModelSceneRef = useRef<THREE.Group | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedVRM, setLoadedVRM] = useState<VRM | null>(null);

  // Keep stable callback refs to prevent any reload loops
  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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

          setLoadedVRM(vrm);
          setIsLoading(false);

          onModelLoadedRef.current?.({
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

          setLoadedVRM(null);
          setIsLoading(false);
          onModelLoadedRef.current?.({
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
        onErrorRef.current?.(errMsg);
      }
    );

    return () => {
      isMounted = false;
      setLoadedVRM(null);
      if (currentModelSceneRef.current) {
        VRMUtils.deepDispose(currentModelSceneRef.current);
        currentModelSceneRef.current = null;
      }
    };
  }, [activeUrl]);

  // Target skeleton joints extracted live for skeleton visualizer overlay
  const [targetJoints, setTargetJoints] = useState<{
    head: THREE.Vector3;
    neck: THREE.Vector3;
    spine: THREE.Vector3;
    lShoulder: THREE.Vector3;
    lElbow: THREE.Vector3;
    lWrist: THREE.Vector3;
    rShoulder: THREE.Vector3;
    rElbow: THREE.Vector3;
    rWrist: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    if (!loadedVRM || !showSkeleton) return;
    const interval = setInterval(() => {
      const hum = loadedVRM.humanoid;
      if (!hum) return;
      const getP = (name: VRMHumanBoneName) => {
        const n = hum.getNormalizedBoneNode(name);
        const p = new THREE.Vector3();
        n?.getWorldPosition(p);
        return p;
      };
      setTargetJoints({
        head: getP('head' as VRMHumanBoneName),
        neck: getP('neck' as VRMHumanBoneName),
        spine: getP('spine' as VRMHumanBoneName),
        lShoulder: getP('leftShoulder' as VRMHumanBoneName),
        lElbow: getP('leftLowerArm' as VRMHumanBoneName),
        lWrist: getP('leftHand' as VRMHumanBoneName),
        rShoulder: getP('rightShoulder' as VRMHumanBoneName),
        rElbow: getP('rightLowerArm' as VRMHumanBoneName),
        rWrist: getP('rightHand' as VRMHumanBoneName),
      });
    }, 100);
    return () => clearInterval(interval);
  }, [loadedVRM, showSkeleton]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group ref={containerRef} />
      {loadedVRM && (
        <ViolinPerformance
          vrm={loadedVRM}
          reference={reference}
          isTPose={isTPose}
          onDiagnosticsUpdate={onDiagnosticsUpdate}
          showSkeleton={showSkeleton}
        />
      )}

      {/* Target Skeleton Overlay Visualizer (Purple/Gold markers) */}
      {showSkeleton && targetJoints && (
        <group>
          <mesh position={[targetJoints.head.x, targetJoints.head.y, targetJoints.head.z]}>
            <sphereGeometry args={[0.032, 16, 16]} />
            <meshBasicMaterial color="#FFB800" />
          </mesh>
          <mesh position={[targetJoints.neck.x, targetJoints.neck.y, targetJoints.neck.z]}>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#FFB800" />
          </mesh>
          <mesh position={[targetJoints.lShoulder.x, targetJoints.lShoulder.y, targetJoints.lShoulder.z]}>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshBasicMaterial color="#E066FF" />
          </mesh>
          <mesh position={[targetJoints.lElbow.x, targetJoints.lElbow.y, targetJoints.lElbow.z]}>
            <sphereGeometry args={[0.026, 16, 16]} />
            <meshBasicMaterial color="#E066FF" />
          </mesh>
          <mesh position={[targetJoints.lWrist.x, targetJoints.lWrist.y, targetJoints.lWrist.z]}>
            <sphereGeometry args={[0.024, 16, 16]} />
            <meshBasicMaterial color="#E066FF" />
          </mesh>
          <mesh position={[targetJoints.rShoulder.x, targetJoints.rShoulder.y, targetJoints.rShoulder.z]}>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshBasicMaterial color="#FF5588" />
          </mesh>
          <mesh position={[targetJoints.rElbow.x, targetJoints.rElbow.y, targetJoints.rElbow.z]}>
            <sphereGeometry args={[0.026, 16, 16]} />
            <meshBasicMaterial color="#FF5588" />
          </mesh>
          <mesh position={[targetJoints.rWrist.x, targetJoints.rWrist.y, targetJoints.rWrist.z]}>
            <sphereGeometry args={[0.024, 16, 16]} />
            <meshBasicMaterial color="#FF5588" />
          </mesh>

          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    targetJoints.spine.x, targetJoints.spine.y, targetJoints.spine.z,
                    targetJoints.neck.x, targetJoints.neck.y, targetJoints.neck.z,
                    targetJoints.neck.x, targetJoints.neck.y, targetJoints.neck.z,
                    targetJoints.head.x, targetJoints.head.y, targetJoints.head.z,
                    targetJoints.neck.x, targetJoints.neck.y, targetJoints.neck.z,
                    targetJoints.lShoulder.x, targetJoints.lShoulder.y, targetJoints.lShoulder.z,
                    targetJoints.lShoulder.x, targetJoints.lShoulder.y, targetJoints.lShoulder.z,
                    targetJoints.lElbow.x, targetJoints.lElbow.y, targetJoints.lElbow.z,
                    targetJoints.lElbow.x, targetJoints.lElbow.y, targetJoints.lElbow.z,
                    targetJoints.lWrist.x, targetJoints.lWrist.y, targetJoints.lWrist.z,
                    targetJoints.neck.x, targetJoints.neck.y, targetJoints.neck.z,
                    targetJoints.rShoulder.x, targetJoints.rShoulder.y, targetJoints.rShoulder.z,
                    targetJoints.rShoulder.x, targetJoints.rShoulder.y, targetJoints.rShoulder.z,
                    targetJoints.rElbow.x, targetJoints.rElbow.y, targetJoints.rElbow.z,
                    targetJoints.rElbow.x, targetJoints.rElbow.y, targetJoints.rElbow.z,
                    targetJoints.rWrist.x, targetJoints.rWrist.y, targetJoints.rWrist.z,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#FFB800" linewidth={3} transparent opacity={0.85} />
          </line>
        </group>
      )}
    </group>
  );
};
