// TEMPORARY VIOLIN POSE DEBUG
import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface DiagnosticTuningValues {
  // Left Arm Diagnostic Targets & Joint Offsets
  leftShoulder: { x: number; y: number; z: number };
  leftElbow: { x: number; y: number; z: number };
  leftHand: { x: number; y: number; z: number };
  leftHandTarget: { x: number; y: number; z: number };

  // Right Arm Diagnostic Targets & Joint Offsets
  rightShoulder: { x: number; y: number; z: number };
  rightElbow: { x: number; y: number; z: number };
  rightHand: { x: number; y: number; z: number };
  rightHandTarget: { x: number; y: number; z: number };

  // Violin Diagnostic World/Local Position and Rotation
  violinPos: { x: number; y: number; z: number };
  violinRot: { x: number; y: number; z: number }; // radians

  // Bow Diagnostic World/Local Position and Rotation
  bowPos: { x: number; y: number; z: number };
  bowRot: { x: number; y: number; z: number }; // radians
}

export interface ViolinDebugNumericData {
  leftShoulder: { x: number; y: number; z: number } | null;
  leftElbow: { x: number; y: number; z: number } | null;
  leftHand: { x: number; y: number; z: number } | null;
  leftHandTarget: { x: number; y: number; z: number };
  rightShoulder: { x: number; y: number; z: number } | null;
  rightElbow: { x: number; y: number; z: number } | null;
  rightHand: { x: number; y: number; z: number } | null;
  rightHandTarget: { x: number; y: number; z: number };
  violinNeckTarget: { x: number; y: number; z: number };
  violinBodyCenter: { x: number; y: number; z: number };
  chinRestTarget: { x: number; y: number; z: number };
  bowContactPoint: { x: number; y: number; z: number };
  bowGripPoint: { x: number; y: number; z: number };
  boneStatus: {
    leftShoulder: boolean;
    leftUpperArm: boolean;
    leftLowerArm: boolean;
    leftHand: boolean;
    rightShoulder: boolean;
    rightUpperArm: boolean;
    rightLowerArm: boolean;
    rightHand: boolean;
  };
}

export interface ViolinPoseDebuggerProps {
  vrm: VRM | null;
  violinGroup: THREE.Group | null;
  bowGroup: THREE.Group | null;
  leftHandTargetPos: THREE.Vector3;
  rightHandTargetPos: THREE.Vector3;
  bendHintLeftElbow: THREE.Vector3;
  bendHintRightElbow: THREE.Vector3;
  tuningValues: DiagnosticTuningValues;
  enabled?: boolean;
  onDataUpdate?: (data: ViolinDebugNumericData) => void;
}

/**
 * Temporary Visual Debugging System for VRM Violin Performance
 * Clean 3D viewport visualizer (NO 3D text labels):
 * - Renders actual bone markers (Pink, Blue, Yellow, Orange, Red) + connecting lines + local axes.
 * - Renders live editable diagnostic test markers (Wireframe rings, diagnostic test lines, test gizmos).
 * - Updates instantly when diagnostic values change without modifying production kinematics.
 */
export const ViolinPoseDebugger: React.FC<ViolinPoseDebuggerProps> = ({
  vrm,
  violinGroup,
  bowGroup,
  leftHandTargetPos,
  rightHandTargetPos,
  bendHintLeftElbow,
  bendHintRightElbow,
  tuningValues,
  enabled = true,
  onDataUpdate,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // --- 1. Actual Skeletal Lines ---
  const leftArmLineGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const rightArmLineGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const leftBendLineGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const rightBendLineGeo = useMemo(() => new THREE.BufferGeometry(), []);

  const leftArmLineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0xff00bb, depthTest: false });
    return new THREE.Line(leftArmLineGeo, mat);
  }, [leftArmLineGeo]);

  const rightArmLineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0xff5500, depthTest: false });
    return new THREE.Line(rightArmLineGeo, mat);
  }, [rightArmLineGeo]);

  const leftBendLineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false });
    return new THREE.Line(leftBendLineGeo, mat);
  }, [leftBendLineGeo]);

  const rightBendLineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false });
    return new THREE.Line(rightBendLineGeo, mat);
  }, [rightBendLineGeo]);

  // --- 2. Diagnostic Test Skeletal Lines ---
  const diagLeftArmLineGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const diagRightArmLineGeo = useMemo(() => new THREE.BufferGeometry(), []);

  const diagLeftArmLineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, transparent: true, opacity: 0.85 });
    return new THREE.Line(diagLeftArmLineGeo, mat);
  }, [diagLeftArmLineGeo]);

  const diagRightArmLineMesh = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0xff0055, depthTest: false, transparent: true, opacity: 0.85 });
    return new THREE.Line(diagRightArmLineGeo, mat);
  }, [diagRightArmLineGeo]);

  // --- 3. Actual Bone Marker Refs ---
  const markerLeftShoulder = useRef<THREE.Mesh>(null);
  const markerLeftElbow = useRef<THREE.Mesh>(null);
  const markerLeftHand = useRef<THREE.Mesh>(null);
  const markerLeftTarget = useRef<THREE.Group>(null);

  const markerRightShoulder = useRef<THREE.Mesh>(null);
  const markerRightElbow = useRef<THREE.Mesh>(null);
  const markerRightHand = useRef<THREE.Mesh>(null);
  const markerRightTarget = useRef<THREE.Group>(null);

  const markerViolinBody = useRef<THREE.Mesh>(null);
  const markerViolinNeck = useRef<THREE.Mesh>(null);
  const markerChinRest = useRef<THREE.Mesh>(null);
  const markerBowContact = useRef<THREE.Mesh>(null);
  const markerBowGrip = useRef<THREE.Mesh>(null);

  // --- 4. Diagnostic Test Marker Refs ---
  const diagMarkerLShoulder = useRef<THREE.Mesh>(null);
  const diagMarkerLElbow = useRef<THREE.Mesh>(null);
  const diagMarkerLHand = useRef<THREE.Mesh>(null);
  const diagMarkerLTarget = useRef<THREE.Group>(null);

  const diagMarkerRShoulder = useRef<THREE.Mesh>(null);
  const diagMarkerRElbow = useRef<THREE.Mesh>(null);
  const diagMarkerRHand = useRef<THREE.Mesh>(null);
  const diagMarkerRTarget = useRef<THREE.Group>(null);

  const diagViolinAxes = useRef<THREE.Group>(null);
  const diagBowAxes = useRef<THREE.Group>(null);

  // --- 5. Axes Helper Refs ---
  const axesLeftShoulder = useRef<THREE.AxesHelper>(null);
  const axesLeftUpperArm = useRef<THREE.AxesHelper>(null);
  const axesLeftLowerArm = useRef<THREE.AxesHelper>(null);
  const axesLeftHand = useRef<THREE.AxesHelper>(null);

  const axesRightShoulder = useRef<THREE.AxesHelper>(null);
  const axesRightUpperArm = useRef<THREE.AxesHelper>(null);
  const axesRightLowerArm = useRef<THREE.AxesHelper>(null);
  const axesRightHand = useRef<THREE.AxesHelper>(null);

  const axesViolin = useRef<THREE.AxesHelper>(null);
  const axesBow = useRef<THREE.AxesHelper>(null);

  const lastUpdateRef = useRef<number>(0);

  useFrame((state) => {
    if (!enabled || !vrm || !vrm.humanoid) return;

    const humanoid = vrm.humanoid;

    // 1. Fetch normalized bone nodes
    const bLeftShoulder = humanoid.getNormalizedBoneNode('leftShoulder' as VRMHumanBoneName);
    const bLeftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
    const bLeftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
    const bLeftHand = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);

    const bRightShoulder = humanoid.getNormalizedBoneNode('rightShoulder' as VRMHumanBoneName);
    const bRightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
    const bRightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);
    const bRightHand = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

    // 2. Extract Actual Bone World Positions & Coordinate Systems
    const pLShoulder = new THREE.Vector3();
    const pLUpperArm = new THREE.Vector3();
    const pLElbow = new THREE.Vector3();
    const pLHand = new THREE.Vector3();

    const pRShoulder = new THREE.Vector3();
    const pRUpperArm = new THREE.Vector3();
    const pRElbow = new THREE.Vector3();
    const pRHand = new THREE.Vector3();

    const syncAxes = (axes: THREE.AxesHelper | null, bone: THREE.Object3D | null, outPos: THREE.Vector3) => {
      if (!axes || !bone) {
        if (axes) axes.visible = false;
        return false;
      }
      bone.getWorldPosition(outPos);
      axes.visible = true;
      axes.matrix.copy(bone.matrixWorld);
      axes.matrixAutoUpdate = false;
      return true;
    };

    const hasLShoulder = syncAxes(axesLeftShoulder.current, bLeftShoulder, pLShoulder);
    const hasLUpper = syncAxes(axesLeftUpperArm.current, bLeftUpperArm, pLUpperArm);
    const hasLElbow = syncAxes(axesLeftLowerArm.current, bLeftLowerArm, pLElbow);
    const hasLHand = syncAxes(axesLeftHand.current, bLeftHand, pLHand);

    const hasRShoulder = syncAxes(axesRightShoulder.current, bRightShoulder, pRShoulder);
    const hasRUpper = syncAxes(axesRightUpperArm.current, bRightUpperArm, pRUpperArm);
    const hasRElbow = syncAxes(axesRightLowerArm.current, bRightLowerArm, pRElbow);
    const hasRHand = syncAxes(axesRightHand.current, bRightHand, pRHand);

    const effectiveLShoulder = hasLShoulder ? pLShoulder : pLUpperArm;
    const effectiveRShoulder = hasRShoulder ? pRShoulder : pRUpperArm;

    // Actual bone positions
    if (markerLeftShoulder.current) markerLeftShoulder.current.position.copy(effectiveLShoulder);
    if (markerLeftElbow.current) markerLeftElbow.current.position.copy(pLElbow);
    if (markerLeftHand.current) markerLeftHand.current.position.copy(pLHand);
    if (markerLeftTarget.current) markerLeftTarget.current.position.copy(leftHandTargetPos);

    if (markerRightShoulder.current) markerRightShoulder.current.position.copy(effectiveRShoulder);
    if (markerRightElbow.current) markerRightElbow.current.position.copy(pRElbow);
    if (markerRightHand.current) markerRightHand.current.position.copy(pRHand);
    if (markerRightTarget.current) markerRightTarget.current.position.copy(rightHandTargetPos);

    // 3. Update Connecting Skeletal Lines for Actual Bones
    const leftArmPts = [
      effectiveLShoulder.x, effectiveLShoulder.y, effectiveLShoulder.z,
      pLElbow.x, pLElbow.y, pLElbow.z,
      pLHand.x, pLHand.y, pLHand.z,
    ];
    leftArmLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftArmPts, 3));

    const rightArmPts = [
      effectiveRShoulder.x, effectiveRShoulder.y, effectiveRShoulder.z,
      pRElbow.x, pRElbow.y, pRElbow.z,
      pRHand.x, pRHand.y, pRHand.z,
    ];
    rightArmLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightArmPts, 3));

    // 4. Update IK Bend Hint Vectors
    const leftBendEnd = pLUpperArm.clone().addScaledVector(bendHintLeftElbow, 0.18);
    const leftBendPts = [
      pLUpperArm.x, pLUpperArm.y, pLUpperArm.z,
      leftBendEnd.x, leftBendEnd.y, leftBendEnd.z,
    ];
    leftBendLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftBendPts, 3));

    const rightBendEnd = pRUpperArm.clone().addScaledVector(bendHintRightElbow, 0.18);
    const rightBendPts = [
      pRUpperArm.x, pRUpperArm.y, pRUpperArm.z,
      rightBendEnd.x, rightBendEnd.y, rightBendEnd.z,
    ];
    rightBendLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightBendPts, 3));

    // 5. Update Diagnostic Test Positions from Tuning Props
    const tv = tuningValues;

    if (diagMarkerLShoulder.current) diagMarkerLShoulder.current.position.set(tv.leftShoulder.x, tv.leftShoulder.y, tv.leftShoulder.z);
    if (diagMarkerLElbow.current) diagMarkerLElbow.current.position.set(tv.leftElbow.x, tv.leftElbow.y, tv.leftElbow.z);
    if (diagMarkerLHand.current) diagMarkerLHand.current.position.set(tv.leftHand.x, tv.leftHand.y, tv.leftHand.z);
    if (diagMarkerLTarget.current) diagMarkerLTarget.current.position.set(tv.leftHandTarget.x, tv.leftHandTarget.y, tv.leftHandTarget.z);

    const diagLeftArmPts = [
      tv.leftShoulder.x, tv.leftShoulder.y, tv.leftShoulder.z,
      tv.leftElbow.x, tv.leftElbow.y, tv.leftElbow.z,
      tv.leftHand.x, tv.leftHand.y, tv.leftHand.z,
    ];
    diagLeftArmLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(diagLeftArmPts, 3));

    if (diagMarkerRShoulder.current) diagMarkerRShoulder.current.position.set(tv.rightShoulder.x, tv.rightShoulder.y, tv.rightShoulder.z);
    if (diagMarkerRElbow.current) diagMarkerRElbow.current.position.set(tv.rightElbow.x, tv.rightElbow.y, tv.rightElbow.z);
    if (diagMarkerRHand.current) diagMarkerRHand.current.position.set(tv.rightHand.x, tv.rightHand.y, tv.rightHand.z);
    if (diagMarkerRTarget.current) diagMarkerRTarget.current.position.set(tv.rightHandTarget.x, tv.rightHandTarget.y, tv.rightHandTarget.z);

    const diagRightArmPts = [
      tv.rightShoulder.x, tv.rightShoulder.y, tv.rightShoulder.z,
      tv.rightElbow.x, tv.rightElbow.y, tv.rightElbow.z,
      tv.rightHand.x, tv.rightHand.y, tv.rightHand.z,
    ];
    diagRightArmLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(diagRightArmPts, 3));

    // Diagnostic Test Violin & Bow
    if (diagViolinAxes.current) {
      diagViolinAxes.current.position.set(tv.violinPos.x, tv.violinPos.y, tv.violinPos.z);
      diagViolinAxes.current.rotation.set(tv.violinRot.x, tv.violinRot.y, tv.violinRot.z, 'YXZ');
    }
    if (diagBowAxes.current) {
      diagBowAxes.current.position.set(tv.bowPos.x, tv.bowPos.y, tv.bowPos.z);
      diagBowAxes.current.rotation.set(tv.bowRot.x, tv.bowRot.y, tv.bowRot.z);
    }

    // 6. Extract Actual Violin & Bow Reference Points
    const pVBody = new THREE.Vector3();
    const pVNeck = new THREE.Vector3();
    const pChin = new THREE.Vector3();
    const pBowContact = new THREE.Vector3();
    const pBowGrip = new THREE.Vector3();

    if (violinGroup) {
      violinGroup.getWorldPosition(pVBody);
      pVNeck.set(0, 0.205, 0.016).applyMatrix4(violinGroup.matrixWorld);
      pChin.set(-0.048, -0.155, 0.045).applyMatrix4(violinGroup.matrixWorld);
      pBowContact.set(0, 0.045, 0.045).applyMatrix4(violinGroup.matrixWorld);

      if (axesViolin.current) {
        axesViolin.current.visible = true;
        axesViolin.current.matrix.copy(violinGroup.matrixWorld);
        axesViolin.current.matrixAutoUpdate = false;
      }
    }

    if (bowGroup) {
      pBowGrip.set(0, -0.30, 0).applyMatrix4(bowGroup.matrixWorld);

      if (axesBow.current) {
        axesBow.current.visible = true;
        axesBow.current.matrix.copy(bowGroup.matrixWorld);
        axesBow.current.matrixAutoUpdate = false;
      }
    }

    if (markerViolinBody.current) markerViolinBody.current.position.copy(pVBody);
    if (markerViolinNeck.current) markerViolinNeck.current.position.copy(pVNeck);
    if (markerChinRest.current) markerChinRest.current.position.copy(pChin);
    if (markerBowContact.current) markerBowContact.current.position.copy(pBowContact);
    if (markerBowGrip.current) markerBowGrip.current.position.copy(pBowGrip);

    // 7. Periodic telemetry callback to UI
    const now = state.clock.elapsedTime;
    if (now - lastUpdateRef.current > 0.066) {
      lastUpdateRef.current = now;
      onDataUpdate?.({
        leftShoulder: hasLShoulder ? { x: pLShoulder.x, y: pLShoulder.y, z: pLShoulder.z } : null,
        leftElbow: hasLElbow ? { x: pLElbow.x, y: pLElbow.y, z: pLElbow.z } : null,
        leftHand: hasLHand ? { x: pLHand.x, y: pLHand.y, z: pLHand.z } : null,
        leftHandTarget: { x: leftHandTargetPos.x, y: leftHandTargetPos.y, z: leftHandTargetPos.z },
        rightShoulder: hasRShoulder ? { x: pRShoulder.x, y: pRShoulder.y, z: pRShoulder.z } : null,
        rightElbow: hasRElbow ? { x: pRElbow.x, y: pRElbow.y, z: pRElbow.z } : null,
        rightHand: hasRHand ? { x: pRHand.x, y: pRHand.y, z: pRHand.z } : null,
        rightHandTarget: { x: rightHandTargetPos.x, y: rightHandTargetPos.y, z: rightHandTargetPos.z },
        violinNeckTarget: { x: pVNeck.x, y: pVNeck.y, z: pVNeck.z },
        violinBodyCenter: { x: pVBody.x, y: pVBody.y, z: pVBody.z },
        chinRestTarget: { x: pChin.x, y: pChin.y, z: pChin.z },
        bowContactPoint: { x: pBowContact.x, y: pBowContact.y, z: pBowContact.z },
        bowGripPoint: { x: pBowGrip.x, y: pBowGrip.y, z: pBowGrip.z },
        boneStatus: {
          leftShoulder: hasLShoulder,
          leftUpperArm: hasLUpper,
          leftLowerArm: hasLElbow,
          leftHand: hasLHand,
          rightShoulder: hasRShoulder,
          rightUpperArm: hasRUpper,
          rightLowerArm: hasRElbow,
          rightHand: hasRHand,
        },
      });
    }
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef} name="ViolinPoseDebuggerRoot" renderOrder={1000}>
      {/* ======================================================== */}
      {/* 1. ACTUAL SKELETON MARKERS (Solid Colored Spheres) */}
      {/* ======================================================== */}
      {/* Left Arm: Pink Shoulder, Blue Elbow, Yellow Hand */}
      <mesh ref={markerLeftShoulder}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={0xff1493} depthTest={false} />
      </mesh>

      <mesh ref={markerLeftElbow}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={0x0088ff} depthTest={false} />
      </mesh>

      <mesh ref={markerLeftHand}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={0xffd700} depthTest={false} />
      </mesh>

      {/* Actual Left Hand Target Ring (Yellow Torus) */}
      <group ref={markerLeftTarget}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.024, 0.003, 12, 24]} />
          <meshBasicMaterial color={0xffff00} depthTest={false} />
        </mesh>
      </group>

      {/* Right Arm: Orange Shoulder, Blue Elbow, Red Hand */}
      <mesh ref={markerRightShoulder}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={0xff7700} depthTest={false} />
      </mesh>

      <mesh ref={markerRightElbow}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={0x0088ff} depthTest={false} />
      </mesh>

      <mesh ref={markerRightHand}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={0xff2222} depthTest={false} />
      </mesh>

      {/* Actual Right Hand Target Ring (Red Torus) */}
      <group ref={markerRightTarget}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.024, 0.003, 12, 24]} />
          <meshBasicMaterial color={0xff0044} depthTest={false} />
        </mesh>
      </group>

      {/* Connecting Arm Skeletal Lines */}
      <primitive object={leftArmLineMesh} />
      <primitive object={rightArmLineMesh} />

      {/* IK Bend Hint Vectors */}
      <primitive object={leftBendLineMesh} />
      <primitive object={rightBendLineMesh} />

      {/* Violin & Bow Reference Points */}
      <mesh ref={markerViolinNeck}>
        <sphereGeometry args={[0.013, 14, 14]} />
        <meshBasicMaterial color={0x00ff66} depthTest={false} />
      </mesh>

      <mesh ref={markerViolinBody}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color={0x00ffff} depthTest={false} />
      </mesh>

      <mesh ref={markerChinRest}>
        <sphereGeometry args={[0.013, 14, 14]} />
        <meshBasicMaterial color={0xffffff} depthTest={false} />
      </mesh>

      <mesh ref={markerBowContact}>
        <sphereGeometry args={[0.013, 14, 14]} />
        <meshBasicMaterial color={0xff0055} depthTest={false} />
      </mesh>

      <mesh ref={markerBowGrip}>
        <sphereGeometry args={[0.013, 14, 14]} />
        <meshBasicMaterial color={0xffaa00} depthTest={false} />
      </mesh>

      {/* Actual Bone Local Axes Helpers */}
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesLeftShoulder} />
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesLeftUpperArm} />
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesLeftLowerArm} />
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesLeftHand} />

      <primitive object={new THREE.AxesHelper(0.08)} ref={axesRightShoulder} />
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesRightUpperArm} />
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesRightLowerArm} />
      <primitive object={new THREE.AxesHelper(0.08)} ref={axesRightHand} />

      <primitive object={new THREE.AxesHelper(0.11)} ref={axesViolin} />
      <primitive object={new THREE.AxesHelper(0.11)} ref={axesBow} />

      {/* ======================================================== */}
      {/* 2. EDITABLE DIAGNOSTIC TEST MARKERS (Interactive Layer)  */}
      {/* ======================================================== */}
      {/* Left Diagnostic Test Markers (Distinct Wireframe & Octahedron shapes) */}
      <mesh ref={diagMarkerLShoulder}>
        <octahedronGeometry args={[0.02, 0]} />
        <meshBasicMaterial color={0xff69b4} wireframe depthTest={false} />
      </mesh>

      <mesh ref={diagMarkerLElbow}>
        <octahedronGeometry args={[0.02, 0]} />
        <meshBasicMaterial color={0x38bdf8} wireframe depthTest={false} />
      </mesh>

      <mesh ref={diagMarkerLHand}>
        <octahedronGeometry args={[0.02, 0]} />
        <meshBasicMaterial color={0xfacc15} wireframe depthTest={false} />
      </mesh>

      {/* Diagnostic Left Hand Target (Dual Diamond Gizmo) */}
      <group ref={diagMarkerLTarget}>
        <mesh>
          <octahedronGeometry args={[0.032, 0]} />
          <meshBasicMaterial color={0xffff55} wireframe depthTest={false} />
        </mesh>
      </group>

      {/* Right Diagnostic Test Markers */}
      <mesh ref={diagMarkerRShoulder}>
        <octahedronGeometry args={[0.02, 0]} />
        <meshBasicMaterial color={0xfb923c} wireframe depthTest={false} />
      </mesh>

      <mesh ref={diagMarkerRElbow}>
        <octahedronGeometry args={[0.02, 0]} />
        <meshBasicMaterial color={0x38bdf8} wireframe depthTest={false} />
      </mesh>

      <mesh ref={diagMarkerRHand}>
        <octahedronGeometry args={[0.02, 0]} />
        <meshBasicMaterial color={0xf87171} wireframe depthTest={false} />
      </mesh>

      {/* Diagnostic Right Hand Target */}
      <group ref={diagMarkerRTarget}>
        <mesh>
          <octahedronGeometry args={[0.032, 0]} />
          <meshBasicMaterial color={0xff4477} wireframe depthTest={false} />
        </mesh>
      </group>

      {/* Diagnostic Test Skeletal Lines */}
      <primitive object={diagLeftArmLineMesh} />
      <primitive object={diagRightArmLineMesh} />

      {/* Diagnostic Test Violin Transform Gizmo & Ghost Frame */}
      <group ref={diagViolinAxes}>
        <primitive object={new THREE.AxesHelper(0.14)} />
        {/* Subtle wireframe bounding guide for violin orientation testing */}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.18, 0.52, 0.05]} />
          <meshBasicMaterial color={0x00ffff} wireframe transparent opacity={0.35} depthTest={false} />
        </mesh>
      </group>

      {/* Diagnostic Test Bow Transform Gizmo & Ghost Frame */}
      <group ref={diagBowAxes}>
        <primitive object={new THREE.AxesHelper(0.14)} />
        {/* Subtle wireframe guide for bow translation and tilt testing */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.02, 0.72, 0.02]} />
          <meshBasicMaterial color={0xffaa00} wireframe transparent opacity={0.35} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};
