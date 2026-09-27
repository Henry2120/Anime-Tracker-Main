import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { createViolinProp, createBowProp, disposePropHierarchy } from './ViolinProp';
import { solveTwoBoneIK } from '../utils/violinKinematics';

export type CharacterPerformanceMode = 'normal' | 'violin';

export interface ViolinPerformanceProps {
  vrm: VRM | null;
  mode: CharacterPerformanceMode;
  showDebugTargets?: boolean;
}

interface SavedBoneState {
  bone: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  originalScale: THREE.Vector3;
}

/**
 * Dedicated Target-Driven Violin Performance Rig
 * - Establishes correct physical anatomy: Character -> Violin -> Left Hand / Right Hand -> Bow -> Strings.
 * - Solves limbs using analytic Two-Bone IK instead of guessing arbitrary Euler angles.
 * - Positions violin in front of upper-left chest with chin rest under jaw.
 * - Bow hair contacts strings at BowContactPoint and slides linearly across strings without spinning.
 * - Direct kinematic sync via vrm.humanoid.update() with zero spring-bone simulation.
 */
export const ViolinPerformance: React.FC<ViolinPerformanceProps> = ({
  vrm,
  mode,
  showDebugTargets = false,
}) => {
  const violinGroupRef = useRef<THREE.Group | null>(null);
  const bowGroupRef = useRef<THREE.Group | null>(null);
  const savedBonesRef = useRef<SavedBoneState[]>([]);
  const debugGroupRef = useRef<THREE.Group | null>(null);
  const timeRef = useRef<number>(0);
  const isAttachedRef = useRef<boolean>(false);

  // 1. Initialize Props and Cache Authored Rest Transforms Once per VRM Instance
  useEffect(() => {
    if (!vrm) return;

    // Clean up any previously attached props
    if (violinGroupRef.current) {
      violinGroupRef.current.parent?.remove(violinGroupRef.current);
      disposePropHierarchy(violinGroupRef.current);
      violinGroupRef.current = null;
    }
    if (bowGroupRef.current) {
      bowGroupRef.current.parent?.remove(bowGroupRef.current);
      disposePropHierarchy(bowGroupRef.current);
      bowGroupRef.current = null;
    }
    if (debugGroupRef.current) {
      debugGroupRef.current.parent?.remove(debugGroupRef.current);
      disposePropHierarchy(debugGroupRef.current);
      debugGroupRef.current = null;
    }

    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    // Cache exact authored rest transforms
    const boneNames: VRMHumanBoneName[] = [
      'neck' as VRMHumanBoneName,
      'head' as VRMHumanBoneName,
      'spine' as VRMHumanBoneName,
      'chest' as VRMHumanBoneName,
      'upperChest' as VRMHumanBoneName,
      'leftShoulder' as VRMHumanBoneName,
      'leftUpperArm' as VRMHumanBoneName,
      'leftLowerArm' as VRMHumanBoneName,
      'leftHand' as VRMHumanBoneName,
      'rightShoulder' as VRMHumanBoneName,
      'rightUpperArm' as VRMHumanBoneName,
      'rightLowerArm' as VRMHumanBoneName,
      'rightHand' as VRMHumanBoneName,
      'leftThumbProximal' as VRMHumanBoneName,
      'leftIndexProximal' as VRMHumanBoneName,
      'leftMiddleProximal' as VRMHumanBoneName,
      'leftRingProximal' as VRMHumanBoneName,
      'leftLittleProximal' as VRMHumanBoneName,
      'rightThumbProximal' as VRMHumanBoneName,
      'rightIndexProximal' as VRMHumanBoneName,
      'rightMiddleProximal' as VRMHumanBoneName,
      'rightRingProximal' as VRMHumanBoneName,
      'rightLittleProximal' as VRMHumanBoneName,
    ];

    const saved: SavedBoneState[] = [];
    boneNames.forEach((name) => {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) {
        saved.push({
          bone: node,
          originalPosition: node.position.clone(),
          originalQuaternion: node.quaternion.clone(),
          originalScale: node.scale.clone(),
        });
      }
    });
    savedBonesRef.current = saved;

    // 2. Create Violin and Bow 3D Props
    const violin = createViolinProp();
    const bow = createBowProp();
    violin.visible = false;
    bow.visible = false;
    violinGroupRef.current = violin;
    bowGroupRef.current = bow;

    // 3. Attach Violin in front of Upper Chest / Left Clavicle
    const chestBone =
      humanoid.getNormalizedBoneNode('upperChest' as VRMHumanBoneName) ||
      humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName);

    if (chestBone) {
      violin.scale.setScalar(1.0);
      // Position on character's upper-left chest (+X is Left, +Y is Up, +Z is Front)
      violin.position.set(0.09, 0.06, 0.13);
      // Rotation: Neck points left-front (+X, +Z), soundboard faces forward-up (+Z, +Y)
      violin.rotation.set(-0.32, -0.62, 0.62, 'YXZ');
      chestBone.add(violin);
    } else {
      violin.scale.setScalar(1.0);
      violin.position.set(0.09, 1.25, 0.13);
      violin.rotation.set(-0.32, -0.62, 0.62, 'YXZ');
      vrm.scene.add(violin);
    }

    // 4. Attach Bow to Scene / Stage and coordinate with right hand
    vrm.scene.add(bow);

    // 5. Create Debug Targets
    const debugGroup = new THREE.Group();
    debugGroup.name = 'ViolinDebugTargets';

    const createDebugSphere = (color: number, name: string) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 12, 12),
        new THREE.MeshBasicMaterial({ color, wireframe: false, depthTest: false })
      );
      mesh.renderOrder = 999;
      mesh.name = name;
      return mesh;
    };

    const dbgViolinBody = createDebugSphere(0x00ffff, 'Dbg_ViolinBody'); // Cyan
    const dbgViolinNeck = createDebugSphere(0x00ff00, 'Dbg_ViolinNeck'); // Green
    const dbgChinRest = createDebugSphere(0xff00ff, 'Dbg_ChinRest');     // Magenta
    const dbgLeftHand = createDebugSphere(0xffff00, 'Dbg_LeftHand');     // Yellow
    const dbgRightHand = createDebugSphere(0xff8800, 'Dbg_RightHand');   // Orange
    const dbgBowContact = createDebugSphere(0xff0000, 'Dbg_BowContact'); // Red

    debugGroup.add(dbgViolinBody, dbgViolinNeck, dbgChinRest, dbgLeftHand, dbgRightHand, dbgBowContact);
    debugGroup.visible = false;
    vrm.scene.add(debugGroup);
    debugGroupRef.current = debugGroup;

    isAttachedRef.current = true;

    return () => {
      // Restore cached bone transforms on unmount and synchronize humanoid skeleton
      saved.forEach(({ bone, originalQuaternion, originalPosition, originalScale }) => {
        bone.quaternion.copy(originalQuaternion);
        bone.position.copy(originalPosition);
        bone.scale.copy(originalScale);
      });
      vrm.humanoid?.update();

      // Dispose props
      if (violinGroupRef.current) {
        violinGroupRef.current.parent?.remove(violinGroupRef.current);
        disposePropHierarchy(violinGroupRef.current);
        violinGroupRef.current = null;
      }
      if (bowGroupRef.current) {
        bowGroupRef.current.parent?.remove(bowGroupRef.current);
        disposePropHierarchy(bowGroupRef.current);
        bowGroupRef.current = null;
      }
      if (debugGroupRef.current) {
        debugGroupRef.current.parent?.remove(debugGroupRef.current);
        disposePropHierarchy(debugGroupRef.current);
        debugGroupRef.current = null;
      }
      isAttachedRef.current = false;
    };
  }, [vrm]);

  // 2. Handle Mode Transitions: 'normal' vs 'violin'
  useEffect(() => {
    const isViolin = mode === 'violin';

    if (violinGroupRef.current) {
      violinGroupRef.current.visible = isViolin;
    }
    if (bowGroupRef.current) {
      bowGroupRef.current.visible = isViolin;
    }
    if (debugGroupRef.current) {
      debugGroupRef.current.visible = isViolin && showDebugTargets;
    }

    if (!isViolin && vrm && vrm.humanoid) {
      // Returning to 'normal': immediately restore exact authored rest transforms
      savedBonesRef.current.forEach(({ bone, originalQuaternion, originalPosition, originalScale }) => {
        bone.quaternion.copy(originalQuaternion);
        bone.position.copy(originalPosition);
        bone.scale.copy(originalScale);
      });
      // Synchronize normalized bones to skinned mesh
      vrm.humanoid.update();
    }
  }, [mode, vrm, showDebugTargets]);

  // 3. Performance Pose & Bowing Frame Loop
  useFrame((_, delta) => {
    if (mode !== 'violin' || !vrm || !vrm.humanoid || !isAttachedRef.current) return;
    const violin = violinGroupRef.current;
    const bow = bowGroupRef.current;
    if (!violin || !bow) return;

    timeRef.current += Math.min(delta, 0.1);
    const t = timeRef.current;

    const humanoid = vrm.humanoid;

    // Fetch necessary humanoid bones
    const neck = humanoid.getNormalizedBoneNode('neck' as VRMHumanBoneName);
    const head = humanoid.getNormalizedBoneNode('head' as VRMHumanBoneName);
    const spine = humanoid.getNormalizedBoneNode('spine' as VRMHumanBoneName);
    const chest = humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName);
    const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
    const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
    const leftHand = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);
    const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
    const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);
    const rightHand = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

    // --- STEP 1: Head & Torso Posture (Subtle tilt toward chin rest) ---
    const bowingSpeed = 2.2;
    const bowPhase = t * bowingSpeed;
    const stroke = Math.sin(bowPhase); // -1 to +1 along bow stroke
    const phraseSway = Math.sin(t * 1.1) * 0.02;

    if (spine) {
      spine.quaternion.setFromEuler(new THREE.Euler(0.02, 0.02 + phraseSway * 0.3, 0.0));
    }
    if (chest) {
      chest.quaternion.setFromEuler(new THREE.Euler(0.02, phraseSway * 0.4, -0.01));
    }
    if (neck) {
      neck.quaternion.setFromEuler(new THREE.Euler(0.04, 0.16 + phraseSway * 0.2, 0.06));
    }
    if (head) {
      // Turned and tilted toward left chin rest (+X in normalized VRM)
      head.quaternion.setFromEuler(new THREE.Euler(0.06, 0.18, 0.12));
    }

    // Update scene graph matrix for violin after chest update
    violin.updateMatrixWorld(true);

    // --- STEP 2: Calculate Key Reference Target Positions in World Space ---
    const violinWorldMatrix = violin.matrixWorld;

    // Violin Reference points
    const violinBodyTargetPos = new THREE.Vector3().setFromMatrixPosition(violinWorldMatrix);
    const violinNeckTargetPos = new THREE.Vector3(0, 0.20, 0.015).applyMatrix4(violinWorldMatrix);
    const chinRestTargetPos = new THREE.Vector3(-0.055, -0.165, 0.045).applyMatrix4(violinWorldMatrix);
    const bowContactPointPos = new THREE.Vector3(0, 0.045, 0.046).applyMatrix4(violinWorldMatrix);

    // Violin world axes
    const violinDirY = new THREE.Vector3(0, 1, 0).transformDirection(violinWorldMatrix).normalize(); // String direction
    const violinDirZ = new THREE.Vector3(0, 0, 1).transformDirection(violinWorldMatrix).normalize(); // Soundboard normal
    // Bowing direction perpendicular to strings and parallel to soundboard
    const bowingDirWorld = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();

    // --- STEP 3: Solve Left Arm Two-Bone IK (Reaching Violin Neck) ---
    if (leftUpperArm && leftLowerArm && leftHand) {
      // Left Hand Target is at the violin neck
      const leftHandTargetPos = violinNeckTargetPos.clone().addScaledVector(violinDirZ, -0.015);
      
      // Left elbow bend hint: down, backward, and slightly left
      const bendHintLeftElbow = new THREE.Vector3(0.2, -1.0, -0.4).normalize();

      solveTwoBoneIK(
        leftUpperArm,
        leftLowerArm,
        leftHand,
        leftHandTargetPos,
        bendHintLeftElbow,
        true // Left arm
      );

      // Orient Left Hand to cradle the neck (palm facing upward/inward along neck)
      const violinWorldQuat = new THREE.Quaternion().setFromRotationMatrix(violinWorldMatrix);
      const handAlignQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2)
      );
      leftHand.quaternion.copy(violinWorldQuat).multiply(handAlignQuat);

      // Left Fingers: arched naturally around fingerboard with subtle vibrato
      const vibrato = Math.sin(t * 24.0) * 0.015;
      const fingerTap = Math.sin(t * 4.5) > 0 ? 0.25 : 0.1;

      const setLeftFinger = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
        const node = humanoid.getNormalizedBoneNode(name);
        if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
      };

      setLeftFinger('leftThumbProximal' as VRMHumanBoneName, 0.25, 0.1, 0.15);
      setLeftFinger('leftIndexProximal' as VRMHumanBoneName, 0.45 + fingerTap, 0.05, 0.08 + vibrato);
      setLeftFinger('leftMiddleProximal' as VRMHumanBoneName, 0.50, 0.0, 0.05 + vibrato);
      setLeftFinger('leftRingProximal' as VRMHumanBoneName, 0.45 + fingerTap, -0.05, 0.05);
      setLeftFinger('leftLittleProximal' as VRMHumanBoneName, 0.35, -0.08, 0.05);
    }

    // --- STEP 4: Position and Orient Bow (Resting Directly on Strings) ---
    // Stroke translation along bow long axis (Y) across the contact point
    const strokeOffset = stroke * 0.14; // ±14cm stroke
    
    // Bow world orientation:
    // Long axis (local Y) aligned with bowingDirWorld
    // Hair ribbon (local -Z) aligned with -violinDirZ (facing down onto strings)
    const bowUp = bowingDirWorld.clone();
    const bowForward = violinDirZ.clone().negate();
    const bowRight = new THREE.Vector3().crossVectors(bowUp, bowForward).normalize();

    const bowWorldMat = new THREE.Matrix4().makeBasis(bowRight, bowUp, bowForward);
    const bowWorldQuat = new THREE.Quaternion().setFromRotationMatrix(bowWorldMat);

    // Place bow center so that local y = strokeOffset is exactly at bowContactPointPos
    const bowCenterWorldPos = bowContactPointPos.clone().addScaledVector(bowingDirWorld, -strokeOffset);

    bow.position.copy(bowCenterWorldPos);
    bow.quaternion.copy(bowWorldQuat);
    bow.updateMatrixWorld(true);

    // Bow Frog / Grip world position (Frog is at local y = -0.30 on bow)
    const bowGripTargetPos = new THREE.Vector3(0, -0.30, 0).applyMatrix4(bow.matrixWorld);

    // --- STEP 5: Solve Right Arm Two-Bone IK (Gripping Bow Frog) ---
    if (rightUpperArm && rightLowerArm && rightHand) {
      // Right Hand Target is at the Bow Grip Point
      const rightHandTargetPos = bowGripTargetPos.clone();

      // Right elbow bend hint: down and outward
      const bendHintRightElbow = new THREE.Vector3(-0.4, -0.8, -0.2).normalize();

      solveTwoBoneIK(
        rightUpperArm,
        rightLowerArm,
        rightHand,
        rightHandTargetPos,
        bendHintRightElbow,
        false // Right arm
      );

      // Orient Right Hand to hold bow frog
      const handGripAlign = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.2, 0.1, -0.3)
      );
      rightHand.quaternion.copy(bowWorldQuat).multiply(handGripAlign);

      // Right Fingers: curved around frog
      const setRightFinger = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
        const node = humanoid.getNormalizedBoneNode(name);
        if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
      };

      setRightFinger('rightThumbProximal' as VRMHumanBoneName, 0.35, -0.1, -0.15);
      setRightFinger('rightIndexProximal' as VRMHumanBoneName, 0.45, -0.05, -0.08);
      setRightFinger('rightMiddleProximal' as VRMHumanBoneName, 0.42, 0.0, -0.05);
      setRightFinger('rightRingProximal' as VRMHumanBoneName, 0.38, 0.05, -0.05);
      setRightFinger('rightLittleProximal' as VRMHumanBoneName, 0.32, 0.08, -0.05);
    }

    // --- STEP 6: Update Debug Spheres (if active) ---
    if (debugGroupRef.current && showDebugTargets) {
      const dbg = debugGroupRef.current;
      dbg.getObjectByName('Dbg_ViolinBody')?.position.copy(violinBodyTargetPos);
      dbg.getObjectByName('Dbg_ViolinNeck')?.position.copy(violinNeckTargetPos);
      dbg.getObjectByName('Dbg_ChinRest')?.position.copy(chinRestTargetPos);
      dbg.getObjectByName('Dbg_LeftHand')?.position.copy(violinNeckTargetPos);
      dbg.getObjectByName('Dbg_RightHand')?.position.copy(bowGripTargetPos);
      dbg.getObjectByName('Dbg_BowContact')?.position.copy(bowContactPointPos);
    }

    // --- STEP 7: Synchronize Normalized Humanoid Bones to Mesh (Zero Spring Bones) ---
    humanoid.update();
  });

  return null;
};
