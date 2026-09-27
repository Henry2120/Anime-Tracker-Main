// TEMPORARY VIOLIN POSE DEBUG
import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

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
  enabled?: boolean;
  onDataUpdate?: (data: ViolinDebugNumericData) => void;
}

/**
 * Temporary Visual Debugging System for VRM Violin Performance
 * Read-only visualizer that renders:
 * - Actual VRM normalized bone positions (Pink shoulder, Blue elbow, Yellow/Red hand)
 * - Actual bone local XYZ axes gizmos (Red=X, Green=Y, Blue=Z)
 * - Connecting skeletal arm lines
 * - Separate Left/Right IK target rings
 * - Violin & Bow reference anchors + local XYZ axes
 * - Two-Bone IK bend hint vectors
 * - 3D annotations with bone status
 */
export const ViolinPoseDebugger: React.FC<ViolinPoseDebuggerProps> = ({
  vrm,
  violinGroup,
  bowGroup,
  leftHandTargetPos,
  rightHandTargetPos,
  bendHintLeftElbow,
  bendHintRightElbow,
  enabled = true,
  onDataUpdate,
}) => {
  // Container ref
  const groupRef = useRef<THREE.Group>(null);

  // Line geometries & Line primitives
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

  // Marker meshes refs
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

  // Axes Helpers refs for 8 arm bones + violin + bow
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

  // Text label positions state/refs
  const posLeftShoulder = useRef(new THREE.Vector3());
  const posLeftUpperArm = useRef(new THREE.Vector3());
  const posLeftElbow = useRef(new THREE.Vector3());
  const posLeftHand = useRef(new THREE.Vector3());

  const posRightShoulder = useRef(new THREE.Vector3());
  const posRightUpperArm = useRef(new THREE.Vector3());
  const posRightElbow = useRef(new THREE.Vector3());
  const posRightHand = useRef(new THREE.Vector3());

  const posViolinBody = useRef(new THREE.Vector3());
  const posViolinNeck = useRef(new THREE.Vector3());
  const posChinRest = useRef(new THREE.Vector3());
  const posBowContact = useRef(new THREE.Vector3());
  const posBowGrip = useRef(new THREE.Vector3());

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

    // Helper to sync AxesHelper to Bone World Matrix
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

    // If shoulder node is missing, fall back to upper arm world pos for line anchor
    const effectiveLShoulder = hasLShoulder ? pLShoulder : pLUpperArm;
    const effectiveRShoulder = hasRShoulder ? pRShoulder : pRUpperArm;

    posLeftShoulder.current.copy(pLShoulder);
    posLeftUpperArm.current.copy(pLUpperArm);
    posLeftElbow.current.copy(pLElbow);
    posLeftHand.current.copy(pLHand);

    posRightShoulder.current.copy(pRShoulder);
    posRightUpperArm.current.copy(pRUpperArm);
    posRightElbow.current.copy(pRElbow);
    posRightHand.current.copy(pRHand);

    // Update marker positions
    if (markerLeftShoulder.current) markerLeftShoulder.current.position.copy(effectiveLShoulder);
    if (markerLeftElbow.current) markerLeftElbow.current.position.copy(pLElbow);
    if (markerLeftHand.current) markerLeftHand.current.position.copy(pLHand);
    if (markerLeftTarget.current) markerLeftTarget.current.position.copy(leftHandTargetPos);

    if (markerRightShoulder.current) markerRightShoulder.current.position.copy(effectiveRShoulder);
    if (markerRightElbow.current) markerRightElbow.current.position.copy(pRElbow);
    if (markerRightHand.current) markerRightHand.current.position.copy(pRHand);
    if (markerRightTarget.current) markerRightTarget.current.position.copy(rightHandTargetPos);

    // 3. Update Connecting Skeletal Lines
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

    // 4. Update IK Bend Hint Vectors (lines drawn from upper arm)
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

    // 5. Extract Violin & Bow Reference Points
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

    posViolinBody.current.copy(pVBody);
    posViolinNeck.current.copy(pVNeck);
    posChinRest.current.copy(pChin);
    posBowContact.current.copy(pBowContact);
    posBowGrip.current.copy(pBowGrip);

    if (markerViolinBody.current) markerViolinBody.current.position.copy(pVBody);
    if (markerViolinNeck.current) markerViolinNeck.current.position.copy(pVNeck);
    if (markerChinRest.current) markerChinRest.current.position.copy(pChin);
    if (markerBowContact.current) markerBowContact.current.position.copy(pBowContact);
    if (markerBowGrip.current) markerBowGrip.current.position.copy(pBowGrip);

    // 6. Throttle numeric data callback updates (~15Hz for UI panel smoothness)
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
      {/* --- Actual Bone Markers --- */}
      {/* Left Arm: Pink Shoulder, Blue Elbow, Yellow Hand */}
      <mesh ref={markerLeftShoulder}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color={0xff1493} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#ff69b4] text-[9px] font-mono whitespace-nowrap border border-[#ff1493]/50 pointer-events-none select-none shadow-md">
            Left Shoulder
          </div>
        </Html>
      </mesh>

      <mesh ref={markerLeftElbow}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={0x0088ff} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#60a5fa] text-[9px] font-mono whitespace-nowrap border border-[#0088ff]/50 pointer-events-none select-none shadow-md">
            Left LowerArm (Elbow)
          </div>
        </Html>
      </mesh>

      <mesh ref={markerLeftHand}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={0xffd700} depthTest={false} />
        <Html distanceFactor={4} position={[0, -0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#facc15] text-[9px] font-mono font-bold whitespace-nowrap border border-[#ffd700]/60 pointer-events-none select-none shadow-md">
            LEFT HAND
          </div>
        </Html>
      </mesh>

      {/* Left Hand Target Marker (Large Yellow Ring / Disc) */}
      <group ref={markerLeftTarget}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.026, 0.0035, 12, 24]} />
          <meshBasicMaterial color={0xffff00} depthTest={false} />
        </mesh>
        <Html distanceFactor={4} position={[0, 0.04, 0]}>
          <div className="px-2 py-0.5 rounded bg-yellow-950/90 text-yellow-300 text-[10px] font-mono font-bold whitespace-nowrap border border-yellow-400 pointer-events-none select-none shadow-lg">
            🎯 LEFT HAND TARGET
          </div>
        </Html>
      </group>

      {/* Right Arm: Orange Shoulder, Blue Elbow, Red Hand */}
      <mesh ref={markerRightShoulder}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color={0xff7700} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#fb923c] text-[9px] font-mono whitespace-nowrap border border-[#ff7700]/50 pointer-events-none select-none shadow-md">
            Right Shoulder
          </div>
        </Html>
      </mesh>

      <mesh ref={markerRightElbow}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={0x0088ff} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#60a5fa] text-[9px] font-mono whitespace-nowrap border border-[#0088ff]/50 pointer-events-none select-none shadow-md">
            Right LowerArm (Elbow)
          </div>
        </Html>
      </mesh>

      <mesh ref={markerRightHand}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={0xff2222} depthTest={false} />
        <Html distanceFactor={4} position={[0, -0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#f87171] text-[9px] font-mono font-bold whitespace-nowrap border border-[#ff2222]/60 pointer-events-none select-none shadow-md">
            RIGHT HAND
          </div>
        </Html>
      </mesh>

      {/* Right Hand Target Marker (Large Red Ring) */}
      <group ref={markerRightTarget}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.026, 0.0035, 12, 24]} />
          <meshBasicMaterial color={0xff0044} depthTest={false} />
        </mesh>
        <Html distanceFactor={4} position={[0, 0.04, 0]}>
          <div className="px-2 py-0.5 rounded bg-red-950/90 text-red-300 text-[10px] font-mono font-bold whitespace-nowrap border border-red-400 pointer-events-none select-none shadow-lg">
            🎯 RIGHT HAND TARGET
          </div>
        </Html>
      </group>

      {/* --- Connecting Arm Skeletal Lines --- */}
      <primitive object={leftArmLineMesh} />
      <primitive object={rightArmLineMesh} />

      {/* --- IK Bend Hint Vectors (Dashed/Distinct Lines) --- */}
      <primitive object={leftBendLineMesh} />
      <primitive object={rightBendLineMesh} />

      {/* --- Violin Reference Points --- */}
      {/* Green: Violin Neck Target */}
      <mesh ref={markerViolinNeck}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color={0x00ff66} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#4ade80] text-[9px] font-mono whitespace-nowrap border border-[#00ff66]/50 pointer-events-none select-none shadow-md">
            Violin Neck Target
          </div>
        </Html>
      </mesh>

      {/* Cyan: Violin Body Center */}
      <mesh ref={markerViolinBody}>
        <sphereGeometry args={[0.015, 14, 14]} />
        <meshBasicMaterial color={0x00ffff} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#38bdf8] text-[9px] font-mono whitespace-nowrap border border-[#00ffff]/50 pointer-events-none select-none shadow-md">
            Violin Body Center
          </div>
        </Html>
      </mesh>

      {/* White: Chin Rest Target */}
      <mesh ref={markerChinRest}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color={0xffffff} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-white text-[9px] font-mono whitespace-nowrap border border-white/50 pointer-events-none select-none shadow-md">
            Chin Rest Target
          </div>
        </Html>
      </mesh>

      {/* Red: Bow Contact Point */}
      <mesh ref={markerBowContact}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color={0xff0055} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#f43f5e] text-[9px] font-mono whitespace-nowrap border border-[#ff0055]/50 pointer-events-none select-none shadow-md">
            Bow Contact Point
          </div>
        </Html>
      </mesh>

      {/* Orange: Bow Grip Point */}
      <mesh ref={markerBowGrip}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color={0xffaa00} depthTest={false} />
        <Html distanceFactor={4} position={[0, 0.03, 0]}>
          <div className="px-1.5 py-0.5 rounded bg-black/85 text-[#fbbf24] text-[9px] font-mono whitespace-nowrap border border-[#ffaa00]/50 pointer-events-none select-none shadow-md">
            Bow Grip Point
          </div>
        </Html>
      </mesh>

      {/* --- Bone Local XYZ Axes Gizmos (Red=X, Green=Y, Blue=Z) --- */}
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesLeftShoulder} />
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesLeftUpperArm} />
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesLeftLowerArm} />
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesLeftHand} />

      <primitive object={new THREE.AxesHelper(0.09)} ref={axesRightShoulder} />
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesRightUpperArm} />
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesRightLowerArm} />
      <primitive object={new THREE.AxesHelper(0.09)} ref={axesRightHand} />

      {/* Violin & Bow Local XYZ Axes */}
      <primitive object={new THREE.AxesHelper(0.12)} ref={axesViolin}>
        <Html distanceFactor={4} position={[0.13, 0, 0]}>
          <div className="text-[8px] font-mono text-red-400 font-bold">Violin +X</div>
        </Html>
        <Html distanceFactor={4} position={[0, 0.13, 0]}>
          <div className="text-[8px] font-mono text-emerald-400 font-bold">Violin +Y</div>
        </Html>
        <Html distanceFactor={4} position={[0, 0, 0.13]}>
          <div className="text-[8px] font-mono text-blue-400 font-bold">Violin +Z</div>
        </Html>
      </primitive>

      <primitive object={new THREE.AxesHelper(0.12)} ref={axesBow}>
        <Html distanceFactor={4} position={[0.13, 0, 0]}>
          <div className="text-[8px] font-mono text-red-400 font-bold">Bow +X</div>
        </Html>
        <Html distanceFactor={4} position={[0, 0.13, 0]}>
          <div className="text-[8px] font-mono text-emerald-400 font-bold">Bow +Y</div>
        </Html>
        <Html distanceFactor={4} position={[0, 0, 0.13]}>
          <div className="text-[8px] font-mono text-blue-400 font-bold">Bow +Z</div>
        </Html>
      </primitive>
    </group>
  );
};
