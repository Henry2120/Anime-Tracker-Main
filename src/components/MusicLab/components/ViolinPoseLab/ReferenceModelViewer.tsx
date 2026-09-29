import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ReferencePoseData } from './referenceTypes';

export interface ReferenceModelViewerProps {
  reference: ReferencePoseData;
  customModelUrl?: string | null;
  mode: 'sideBySide' | 'ghostOverlay' | 'targetOnly' | 'referenceOnly';
  showSkeleton: boolean;
  opacity?: number;
}

export const ReferenceModelViewer: React.FC<ReferenceModelViewerProps> = ({
  reference,
  customModelUrl,
  mode,
  showSkeleton,
  opacity = 0.45,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [modelScene, setModelScene] = useState<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const modelPath = customModelUrl || reference.modelUrl || '/music-lab/musicians/violinist.glb';

  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();

    loader.load(
      modelPath,
      (gltf) => {
        if (!isMounted) return;
        const scene = gltf.scene.clone();

        // Setup materials for ghost mode or solid mode
        scene.traverse((obj: any) => {
          if (obj.isMesh && obj.material) {
            obj.castShadow = mode !== 'ghostOverlay';
            obj.receiveShadow = mode !== 'ghostOverlay';
            if (Array.isArray(obj.material)) {
              obj.material = obj.material.map((m: any) => m.clone());
            } else {
              obj.material = obj.material.clone();
            }
          }
        });

        // Setup animation mixer if animations exist
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(scene);
          const playAction = mixer.clipAction(gltf.animations[0]);
          playAction.play();
          mixerRef.current = mixer;
        }

        setModelScene(scene);
      },
      undefined,
      (err) => {
        console.warn('Could not load 3D reference model GLB, falling back to procedural reference rig', err);
        setModelScene(null);
      }
    );

    return () => {
      isMounted = false;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
  }, [modelPath, mode]);

  // Update materials on mode/opacity change
  useEffect(() => {
    if (!modelScene) return;
    const isGhost = mode === 'ghostOverlay';

    modelScene.traverse((obj: any) => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m: any) => {
          if (isGhost) {
            m.transparent = true;
            m.opacity = opacity;
            m.depthWrite = false;
            m.roughness = 0.2;
            // Cyan/teal tint for reference ghost
            if (m.color) {
              m.color.setRGB(0.3, 0.8, 0.95);
            }
          } else {
            m.transparent = false;
            m.opacity = 1.0;
            m.depthWrite = true;
          }
          m.needsUpdate = true;
        });
      }
    });
  }, [modelScene, mode, opacity]);

  useFrame((_, delta) => {
    mixerRef.current?.update(Math.min(delta, 0.1));
  });

  if (mode === 'targetOnly') return null;

  // Position offset based on view mode
  const positionOffset: [number, number, number] =
    mode === 'sideBySide' ? [-1.35, 0, 0] : [0, 0, 0];

  const lm = reference.landmarks;

  return (
    <group ref={groupRef} position={positionOffset}>
      {/* 3D Reference Model Mesh */}
      {modelScene && <primitive object={modelScene} scale={mode === 'sideBySide' ? 1.0 : 0.95} />}

      {/* Reference Skeleton Joint Visualizer Markers */}
      {showSkeleton && (
        <group>
          {/* Head & Neck */}
          <mesh position={[lm.head.x, lm.head.y, lm.head.z]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color="#00F0FF" />
          </mesh>
          <mesh position={[lm.neck.x, lm.neck.y, lm.neck.z]}>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#00F0FF" />
          </mesh>

          {/* Left Arm Chain (Shoulder → Elbow → Wrist) */}
          <mesh position={[lm.leftShoulder.x, lm.leftShoulder.y, lm.leftShoulder.z]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshBasicMaterial color="#00E5FF" />
          </mesh>
          <mesh position={[lm.leftElbow.x, lm.leftElbow.y, lm.leftElbow.z]}>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshBasicMaterial color="#00E5FF" />
          </mesh>
          <mesh position={[lm.leftWrist.x, lm.leftWrist.y, lm.leftWrist.z]}>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#00E5FF" />
          </mesh>

          {/* Right Arm Chain (Shoulder → Elbow → Wrist) */}
          <mesh position={[lm.rightShoulder.x, lm.rightShoulder.y, lm.rightShoulder.z]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshBasicMaterial color="#00FFB2" />
          </mesh>
          <mesh position={[lm.rightElbow.x, lm.rightElbow.y, lm.rightElbow.z]}>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshBasicMaterial color="#00FFB2" />
          </mesh>
          <mesh position={[lm.rightWrist.x, lm.rightWrist.y, lm.rightWrist.z]}>
            <sphereGeometry args={[0.025, 16, 16]} />
            <meshBasicMaterial color="#00FFB2" />
          </mesh>

          {/* Connecting Bone Lines (Cyan/Neon) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    // Spine → Neck → Head
                    lm.spine.x, lm.spine.y, lm.spine.z,
                    lm.neck.x, lm.neck.y, lm.neck.z,
                    lm.neck.x, lm.neck.y, lm.neck.z,
                    lm.head.x, lm.head.y, lm.head.z,
                    // Neck → Left Shoulder → Left Elbow → Left Wrist
                    lm.neck.x, lm.neck.y, lm.neck.z,
                    lm.leftShoulder.x, lm.leftShoulder.y, lm.leftShoulder.z,
                    lm.leftShoulder.x, lm.leftShoulder.y, lm.leftShoulder.z,
                    lm.leftElbow.x, lm.leftElbow.y, lm.leftElbow.z,
                    lm.leftElbow.x, lm.leftElbow.y, lm.leftElbow.z,
                    lm.leftWrist.x, lm.leftWrist.y, lm.leftWrist.z,
                    // Neck → Right Shoulder → Right Elbow → Right Wrist
                    lm.neck.x, lm.neck.y, lm.neck.z,
                    lm.rightShoulder.x, lm.rightShoulder.y, lm.rightShoulder.z,
                    lm.rightShoulder.x, lm.rightShoulder.y, lm.rightShoulder.z,
                    lm.rightElbow.x, lm.rightElbow.y, lm.rightElbow.z,
                    lm.rightElbow.x, lm.rightElbow.y, lm.rightElbow.z,
                    lm.rightWrist.x, lm.rightWrist.y, lm.rightWrist.z,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#00F0FF" linewidth={3} transparent opacity={0.85} />
          </line>
        </group>
      )}

      {/* Diorama Pedestal when in Side-by-Side mode */}
      {mode === 'sideBySide' && (
        <group position={[0, -0.01, 0]}>
          <mesh position={[0, -0.08, 0]} receiveShadow>
            <cylinderGeometry args={[0.9, 0.95, 0.14, 32]} />
            <meshStandardMaterial color="#202A36" roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh position={[0, -0.01, 0]}>
            <torusGeometry args={[0.92, 0.02, 16, 48]} />
            <meshStandardMaterial color="#00E5FF" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}
    </group>
  );
};
