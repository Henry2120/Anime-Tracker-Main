import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { VRMPoseManager } from './VRMPoseManager';
import { JointMarkerInfo } from './poseEditorTypes';
import { inspectBoneLocalFrame, BoneLocalFrameData } from './BoneAxisInspector';

export interface JointGizmoVisualizerProps {
  vrm: VRM;
  poseManager: VRMPoseManager;
  selectedBone: VRMHumanBoneName | null;
  onSelectBone: (boneName: VRMHumanBoneName) => void;
  showSkeleton: boolean;
  showJointMarkers: boolean;
  showLocalAxes: boolean;
  onGizmoDraggingChange: (isDragging: boolean) => void;
  onBoneTransformed?: () => void;
}

export const JointGizmoVisualizer: React.FC<JointGizmoVisualizerProps> = ({
  vrm,
  poseManager,
  selectedBone,
  onSelectBone,
  showSkeleton,
  showJointMarkers,
  showLocalAxes = true,
  onGizmoDraggingChange,
  onBoneTransformed,
}) => {
  const [markers, setMarkers] = useState<JointMarkerInfo[]>([]);
  const [skeletonLinesData, setSkeletonLinesData] = useState<Float32Array>(new Float32Array(0));
  const [frameData, setFrameData] = useState<BoneLocalFrameData | null>(null);
  const transformRef = useRef<any>(null);

  const onGizmoDraggingChangeRef = useRef(onGizmoDraggingChange);
  onGizmoDraggingChangeRef.current = onGizmoDraggingChange;

  const onBoneTransformedRef = useRef(onBoneTransformed);
  onBoneTransformedRef.current = onBoneTransformed;

  // Update marker positions, skeleton lines, and local frame data each frame
  useFrame(() => {
    if (!vrm || !vrm.humanoid) return;

    if (showJointMarkers || showSkeleton) {
      const currentMarkers = poseManager.getJointMarkers();
      setMarkers(currentMarkers);

      if (showSkeleton) {
        const lines = poseManager.getSkeletonLines();
        setSkeletonLinesData(lines);
      }
    }

    if (selectedBone) {
      const currentMarker = markers.find((m) => m.boneName === selectedBone);
      const label = currentMarker?.label || selectedBone;
      const category = currentMarker?.category || 'Body';
      const data = inspectBoneLocalFrame(vrm, selectedBone, label, category);
      setFrameData(data);
    } else {
      setFrameData(null);
    }
  });

  const selectedNode = selectedBone ? poseManager.getBoneNode(selectedBone) : null;

  // Listen to dragging-changed on TransformControls
  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const handleDraggingChanged = (event: any) => {
      onGizmoDraggingChangeRef.current(!!event.value);
    };

    const handleChange = () => {
      if (vrm.humanoid) {
        vrm.humanoid.update();
        vrm.scene.updateMatrixWorld(true);
        onBoneTransformedRef.current?.();
      }
    };

    controls.addEventListener('dragging-changed', handleDraggingChanged);
    controls.addEventListener('change', handleChange);

    return () => {
      controls.removeEventListener('dragging-changed', handleDraggingChanged);
      controls.removeEventListener('change', handleChange);
    };
  }, [selectedNode, vrm]);

  const selectedMarker = markers.find((m) => m.boneName === selectedBone);
  const selectedJointPos = selectedMarker?.worldPosition || new THREE.Vector3();

  const axisLen = 0.14;

  return (
    <group>
      {/* 1. Clickable 3D Joint Markers */}
      {showJointMarkers &&
        markers.map((marker) => {
          const isSelected = selectedBone === marker.boneName;
          const isArm = marker.category !== 'Body';
          const markerColor = isSelected ? '#FFD700' : isArm ? '#00E5FF' : '#BCA8F8';
          const markerRadius = isSelected ? 0.024 : 0.016;

          return (
            <group key={marker.boneName} position={marker.worldPosition}>
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBone(marker.boneName);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'auto';
                }}
              >
                <sphereGeometry args={[markerRadius, 16, 16]} />
                <meshBasicMaterial
                  color={markerColor}
                  depthTest={false}
                  transparent
                  opacity={isSelected ? 1.0 : 0.85}
                />
              </mesh>

              {/* Selection Ring */}
              {isSelected && (
                <mesh>
                  <ringGeometry args={[0.028, 0.036, 24]} />
                  <meshBasicMaterial color="#FFD700" side={THREE.DoubleSide} depthTest={false} />
                </mesh>
              )}
            </group>
          );
        })}

      {/* 2. Connecting Skeleton Lines */}
      {showSkeleton && skeletonLinesData.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[skeletonLinesData, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#7567C7"
            linewidth={2}
            depthTest={false}
            transparent
            opacity={0.8}
          />
        </lineSegments>
      )}

      {/* 3. Visual 3D Local Axes Gizmo (Red=X, Green=Y, Blue=Z) on Selected Bone */}
      {showLocalAxes && selectedNode && frameData && (
        <group position={selectedJointPos}>
          {/* Local X Axis (Red) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    0, 0, 0,
                    frameData.localXWorld.x * axisLen,
                    frameData.localXWorld.y * axisLen,
                    frameData.localXWorld.z * axisLen,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#FF3366" linewidth={4} depthTest={false} />
          </line>
          <mesh position={[
            frameData.localXWorld.x * axisLen,
            frameData.localXWorld.y * axisLen,
            frameData.localXWorld.z * axisLen,
          ]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color="#FF3366" depthTest={false} />
          </mesh>

          {/* Local Y Axis (Green) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    0, 0, 0,
                    frameData.localYWorld.x * axisLen,
                    frameData.localYWorld.y * axisLen,
                    frameData.localYWorld.z * axisLen,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#00FF66" linewidth={4} depthTest={false} />
          </line>
          <mesh position={[
            frameData.localYWorld.x * axisLen,
            frameData.localYWorld.y * axisLen,
            frameData.localYWorld.z * axisLen,
          ]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color="#00FF66" depthTest={false} />
          </mesh>

          {/* Local Z Axis (Blue) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    0, 0, 0,
                    frameData.localZWorld.x * axisLen,
                    frameData.localZWorld.y * axisLen,
                    frameData.localZWorld.z * axisLen,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#0099FF" linewidth={4} depthTest={false} />
          </line>
          <mesh position={[
            frameData.localZWorld.x * axisLen,
            frameData.localZWorld.y * axisLen,
            frameData.localZWorld.z * axisLen,
          ]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color="#0099FF" depthTest={false} />
          </mesh>

          {/* Bone Direction Vector Arrow (Gold / Orange) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    0, 0, 0,
                    frameData.boneDirectionWorld.x * (frameData.boneLength * 0.9),
                    frameData.boneDirectionWorld.y * (frameData.boneLength * 0.9),
                    frameData.boneDirectionWorld.z * (frameData.boneLength * 0.9),
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#FFCC00" linewidth={3} depthTest={false} />
          </line>
        </group>
      )}

      {/* 4. Three.js Transform Rotation Gizmo attached to Selected Bone */}
      {selectedNode && (
        <TransformControls
          ref={transformRef}
          object={selectedNode}
          mode="rotate"
          space="local"
          size={0.65}
        />
      )}
    </group>
  );
};
