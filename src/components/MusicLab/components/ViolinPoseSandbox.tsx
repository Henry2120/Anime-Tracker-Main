import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { createViolinProp, disposePropHierarchy } from './ViolinProp';

export interface Vector3State {
  x: number;
  y: number;
  z: number;
}

export interface ViolinPoseSandboxProps {
  vrm: VRM | null;
  enabled: boolean;
  leftShoulder: Vector3State;
  leftElbow: Vector3State;
  leftHand: Vector3State;
  showActualBones: boolean;
  violinPos: Vector3State;
  violinRot: Vector3State;
  violinScale: number;
}

/**
 * Interactive Pose Sandbox 3D Scene Component
 * - Purely visualization objects driven directly by React state.
 * - Test Left Arm: Pink Shoulder, Blue Elbow, Yellow Hand connected by lines.
 * - Actual VRM Bones: Optional white/gray markers and lines directly tracking VRM bones.
 * - Test Violin: Procedural violin with Green (neck), White (chin rest), Red (bow contact) reference points.
 * - ZERO 3D text in the scene (all labels are in the diagnostics panel).
 * - ZERO IK / ZERO modification to the actual character bones.
 */
export const ViolinPoseSandbox: React.FC<ViolinPoseSandboxProps> = ({
  vrm,
  enabled,
  leftShoulder,
  leftElbow,
  leftHand,
  showActualBones,
  violinPos,
  violinRot,
  violinScale,
}) => {
  // Test Violin Instance
  const testViolinGroupRef = useRef<THREE.Group | null>(null);
  const testViolinContainerRef = useRef<THREE.Group | null>(null);

  // BufferGeometry for Left Arm Test Lines (Pink -> Blue -> Yellow)
  const armLineGeoRef = useRef<THREE.BufferGeometry>(null);

  // BufferGeometry for Actual VRM Arm Bones Lines
  const actualArmLineGeoRef = useRef<THREE.BufferGeometry>(null);

  // Actual Bone Position Refs
  const actualShoulderRef = useRef<THREE.Mesh>(null);
  const actualUpperArmRef = useRef<THREE.Mesh>(null);
  const actualLowerArmRef = useRef<THREE.Mesh>(null);
  const actualHandRef = useRef<THREE.Mesh>(null);

  // Create and manage Test Violin instance
  useEffect(() => {
    if (!enabled) return;

    const violin = createViolinProp();
    testViolinGroupRef.current = violin;

    if (testViolinContainerRef.current) {
      testViolinContainerRef.current.add(violin);
    }

    return () => {
      if (testViolinGroupRef.current) {
        testViolinGroupRef.current.parent?.remove(testViolinGroupRef.current);
        disposePropHierarchy(testViolinGroupRef.current);
        testViolinGroupRef.current = null;
      }
    };
  }, [enabled]);

  // Update Test Arm Lines whenever shoulder, elbow, or hand state changes
  useEffect(() => {
    if (!armLineGeoRef.current) return;
    const positions = new Float32Array([
      leftShoulder.x, leftShoulder.y, leftShoulder.z,
      leftElbow.x, leftElbow.y, leftElbow.z,
      leftHand.x, leftHand.y, leftHand.z,
    ]);
    armLineGeoRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    armLineGeoRef.current.computeBoundingSphere();
  }, [leftShoulder, leftElbow, leftHand]);

  // Track Actual VRM Bones in world space each frame
  useFrame(() => {
    if (!enabled || !showActualBones || !vrm || !vrm.humanoid) return;

    const humanoid = vrm.humanoid;
    const shoulderNode = humanoid.getNormalizedBoneNode('leftShoulder' as VRMHumanBoneName);
    const upperArmNode = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
    const lowerArmNode = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
    const handNode = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);

    const pShoulder = new THREE.Vector3();
    const pUpper = new THREE.Vector3();
    const pLower = new THREE.Vector3();
    const pHand = new THREE.Vector3();

    if (shoulderNode) shoulderNode.getWorldPosition(pShoulder);
    if (upperArmNode) upperArmNode.getWorldPosition(pUpper);
    if (lowerArmNode) lowerArmNode.getWorldPosition(pLower);
    if (handNode) handNode.getWorldPosition(pHand);

    // Update actual bone indicator spheres
    if (actualShoulderRef.current) actualShoulderRef.current.position.copy(pShoulder);
    if (actualUpperArmRef.current) actualUpperArmRef.current.position.copy(pUpper);
    if (actualLowerArmRef.current) actualLowerArmRef.current.position.copy(pLower);
    if (actualHandRef.current) actualHandRef.current.position.copy(pHand);

    // Update connecting line for actual bones
    if (actualArmLineGeoRef.current) {
      const positions = new Float32Array([
        pShoulder.x, pShoulder.y, pShoulder.z,
        pUpper.x, pUpper.y, pUpper.z,
        pLower.x, pLower.y, pLower.z,
        pHand.x, pHand.y, pHand.z,
      ]);
      actualArmLineGeoRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      actualArmLineGeoRef.current.computeBoundingSphere();
    }
  });

  if (!enabled) return null;

  return (
    <group name="ViolinPoseSandbox">
      {/* ========================================================================= */}
      {/* 1. TEST LEFT ARM (Pink Shoulder, Blue Elbow, Yellow Hand + Lines)        */}
      {/* ========================================================================= */}
      <group name="TestLeftArm">
        {/* Pink Point: LEFT SHOULDER */}
        <mesh position={[leftShoulder.x, leftShoulder.y, leftShoulder.z]}>
          <sphereGeometry args={[0.025, 16, 16]} />
          <meshBasicMaterial color={0xff00ff} depthTest={false} transparent opacity={0.95} />
        </mesh>

        {/* Blue Point: LEFT ELBOW */}
        <mesh position={[leftElbow.x, leftElbow.y, leftElbow.z]}>
          <sphereGeometry args={[0.024, 16, 16]} />
          <meshBasicMaterial color={0x0088ff} depthTest={false} transparent opacity={0.95} />
        </mesh>

        {/* Yellow Point: LEFT HAND */}
        <mesh position={[leftHand.x, leftHand.y, leftHand.z]}>
          <sphereGeometry args={[0.025, 16, 16]} />
          <meshBasicMaterial color={0xffee00} depthTest={false} transparent opacity={0.95} />
        </mesh>

        {/* Connecting Lines: Shoulder -> Elbow -> Hand */}
        {/* @ts-ignore line element is standard in R3F */}
        <line>
          <bufferGeometry ref={armLineGeoRef}>
            <bufferAttribute
              attach="attributes-position"
              count={3}
              array={
                new Float32Array([
                  leftShoulder.x, leftShoulder.y, leftShoulder.z,
                  leftElbow.x, leftElbow.y, leftElbow.z,
                  leftHand.x, leftHand.y, leftHand.z,
                ])
              }
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={0x00ffff} linewidth={3} depthTest={false} transparent opacity={0.9} />
        </line>
      </group>

      {/* ========================================================================= */}
      {/* 2. ACTUAL VRM BONES (Shown when toggle is enabled, purely diagnostic)    */}
      {/* ========================================================================= */}
      {showActualBones && (
        <group name="ActualVRMBones">
          {/* Small white/gray markers */}
          <mesh ref={actualShoulderRef}>
            <sphereGeometry args={[0.014, 12, 12]} />
            <meshBasicMaterial color={0xffffff} depthTest={false} transparent opacity={0.8} />
          </mesh>
          <mesh ref={actualUpperArmRef}>
            <sphereGeometry args={[0.014, 12, 12]} />
            <meshBasicMaterial color={0xcccccc} depthTest={false} transparent opacity={0.8} />
          </mesh>
          <mesh ref={actualLowerArmRef}>
            <sphereGeometry args={[0.014, 12, 12]} />
            <meshBasicMaterial color={0xaaaaaa} depthTest={false} transparent opacity={0.8} />
          </mesh>
          <mesh ref={actualHandRef}>
            <sphereGeometry args={[0.014, 12, 12]} />
            <meshBasicMaterial color={0xffffff} depthTest={false} transparent opacity={0.8} />
          </mesh>

          {/* Thin line connecting actual bones */}
          {/* @ts-ignore line element is standard in R3F */}
          <line>
            <bufferGeometry ref={actualArmLineGeoRef} />
            <lineBasicMaterial color={0x888888} linewidth={1} depthTest={false} transparent opacity={0.7} />
          </line>
        </group>
      )}

      {/* ========================================================================= */}
      {/* 3. TEST VIOLIN (Directly controlled by Position, Rotation, Scale)         */}
      {/* ========================================================================= */}
      <group
        ref={testViolinContainerRef}
        name="TestViolin"
        position={[violinPos.x, violinPos.y, violinPos.z]}
        rotation={[violinRot.x, violinRot.y, violinRot.z]}
        scale={[violinScale, violinScale, violinScale]}
      >
        {/* Reference Point: Green = Violin Neck Target (Local: 0, 0.205, 0.016) */}
        <mesh position={[0, 0.205, 0.016]}>
          <sphereGeometry args={[0.016, 12, 12]} />
          <meshBasicMaterial color={0x00ff66} depthTest={false} transparent opacity={0.95} />
        </mesh>

        {/* Reference Point: White = Chin Rest (Local: -0.048, -0.155, 0.045) */}
        <mesh position={[-0.048, -0.155, 0.045]}>
          <sphereGeometry args={[0.016, 12, 12]} />
          <meshBasicMaterial color={0xffffff} depthTest={false} transparent opacity={0.95} />
        </mesh>

        {/* Reference Point: Red = Bow/String Contact (Local: 0, 0.045, 0.045) */}
        <mesh position={[0, 0.045, 0.045]}>
          <sphereGeometry args={[0.016, 12, 12]} />
          <meshBasicMaterial color={0xff2222} depthTest={false} transparent opacity={0.95} />
        </mesh>
      </group>
    </group>
  );
};
