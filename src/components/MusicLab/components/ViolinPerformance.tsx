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
 * Anatomical Constants derived directly from test.vrm skeleton & mesh geometry:
 * - Local chin offset on head bone in rest pose (from vertex scan): (0.0, -0.0341, 0.0794)
 * - Left jaw contact point (resting on chinrest): (0.025, -0.032, 0.068)
 * - Violin chinrest anchor in violin local space: (-0.048, -0.155, 0.040)
 */
const REFERENCE_ANATOMY = {
  localChinOffset: new THREE.Vector3(0.0, -0.0341, 0.0794),
  localLeftJawOffset: new THREE.Vector3(0.025, -0.032, 0.068),
  violinChinrestLocal: new THREE.Vector3(-0.048, -0.155, 0.040),
  violinNeckPlayableLocal: new THREE.Vector3(0.0, 0.205, 0.005),
  violinBowContactLocal: new THREE.Vector3(0.0, 0.045, 0.045),
  bowFrogGripLocal: new THREE.Vector3(0.0, -0.26, 0.0),
  bowOffsetAlongStick: -0.10, // Resting bow hair lower-middle on strings
};

/**
 * Posture rotations for the neutral female reference skeleton:
 * - Torso: slight natural stance
 * - Left shoulder: slightly raised and forward to support instrument
 * - Neck & Head: turned left and tilted to naturally nest the jaw onto the chinrest
 */
const REFERENCE_SKELETON_ROTATIONS = {
  spine: new THREE.Euler(0.02, 0.04, 0.0),
  chest: new THREE.Euler(0.02, 0.03, -0.01),
  leftShoulder: new THREE.Euler(0.04, -0.02, 0.06),
  neck: new THREE.Euler(0.08, 0.28, 0.06, 'YXZ'),
  head: new THREE.Euler(0.14, 0.32, 0.08, 'YXZ'),
};

export const ViolinPerformance: React.FC<ViolinPerformanceProps> = ({
  vrm,
  mode,
  showDebugTargets = false,
}) => {
  const violinGroupRef = useRef<THREE.Group | null>(null);
  const bowGroupRef = useRef<THREE.Group | null>(null);
  const savedBonesRef = useRef<SavedBoneState[]>([]);
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

    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    // Cache exact authored rest transforms for all upper body & finger bones
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
      // Left fingers
      'leftThumbMetacarpal' as VRMHumanBoneName,
      'leftThumbProximal' as VRMHumanBoneName,
      'leftThumbDistal' as VRMHumanBoneName,
      'leftIndexProximal' as VRMHumanBoneName,
      'leftIndexIntermediate' as VRMHumanBoneName,
      'leftIndexDistal' as VRMHumanBoneName,
      'leftMiddleProximal' as VRMHumanBoneName,
      'leftMiddleIntermediate' as VRMHumanBoneName,
      'leftMiddleDistal' as VRMHumanBoneName,
      'leftRingProximal' as VRMHumanBoneName,
      'leftRingIntermediate' as VRMHumanBoneName,
      'leftRingDistal' as VRMHumanBoneName,
      'leftLittleProximal' as VRMHumanBoneName,
      'leftLittleIntermediate' as VRMHumanBoneName,
      'leftLittleDistal' as VRMHumanBoneName,
      // Right fingers
      'rightThumbMetacarpal' as VRMHumanBoneName,
      'rightThumbProximal' as VRMHumanBoneName,
      'rightThumbDistal' as VRMHumanBoneName,
      'rightIndexProximal' as VRMHumanBoneName,
      'rightIndexIntermediate' as VRMHumanBoneName,
      'rightIndexDistal' as VRMHumanBoneName,
      'rightMiddleProximal' as VRMHumanBoneName,
      'rightMiddleIntermediate' as VRMHumanBoneName,
      'rightMiddleDistal' as VRMHumanBoneName,
      'rightRingProximal' as VRMHumanBoneName,
      'rightRingIntermediate' as VRMHumanBoneName,
      'rightRingDistal' as VRMHumanBoneName,
      'rightLittleProximal' as VRMHumanBoneName,
      'rightLittleIntermediate' as VRMHumanBoneName,
      'rightLittleDistal' as VRMHumanBoneName,
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

    // 2. Create Procedural Violin and Bow 3D Props
    const violin = createViolinProp();
    const bow = createBowProp();
    violin.visible = false;
    bow.visible = false;
    violinGroupRef.current = violin;
    bowGroupRef.current = bow;

    // Attach props to VRM scene root for unified coordinate space
    vrm.scene.add(violin);
    vrm.scene.add(bow);

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
  }, [mode, vrm]);

  // 3. Performance Pose Frame Loop
  useFrame((_, delta) => {
    if (mode !== 'violin' || !vrm || !vrm.humanoid || !isAttachedRef.current) return;
    const violin = violinGroupRef.current;
    const bow = bowGroupRef.current;
    if (!violin || !bow) return;

    timeRef.current += Math.min(delta, 0.1);

    const humanoid = vrm.humanoid;

    // Fetch necessary humanoid bones
    const spine = humanoid.getNormalizedBoneNode('spine' as VRMHumanBoneName);
    const chest = humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName);
    const neck = humanoid.getNormalizedBoneNode('neck' as VRMHumanBoneName);
    const head = humanoid.getNormalizedBoneNode('head' as VRMHumanBoneName);
    const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder' as VRMHumanBoneName);
    const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
    const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
    const leftHand = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);
    const rightShoulder = humanoid.getNormalizedBoneNode('rightShoulder' as VRMHumanBoneName);
    const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
    const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);
    const rightHand = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

    // --- STEP 1: Torso & Head Posture Supporting Violin ---
    if (spine) spine.quaternion.setFromEuler(REFERENCE_SKELETON_ROTATIONS.spine);
    if (chest) chest.quaternion.setFromEuler(REFERENCE_SKELETON_ROTATIONS.chest);
    if (leftShoulder) leftShoulder.quaternion.setFromEuler(REFERENCE_SKELETON_ROTATIONS.leftShoulder);
    if (neck) neck.quaternion.setFromEuler(REFERENCE_SKELETON_ROTATIONS.neck);
    if (head) head.quaternion.setFromEuler(REFERENCE_SKELETON_ROTATIONS.head);

    humanoid.update();
    vrm.scene.updateMatrixWorld(true);

    if (!head || !leftUpperArm || !leftLowerArm || !leftHand || !rightUpperArm || !rightLowerArm || !rightHand) {
      return;
    }

    // --- STEP 2: Anatomical Landmarks (Jaw & Collarbone Support) ---
    const headWorldMatrix = head.matrixWorld;
    const leftJawWorldPos = REFERENCE_ANATOMY.localLeftJawOffset.clone().applyMatrix4(headWorldMatrix);

    // Derive Violin Orientation Basis:
    // - Longitudinal axis (+Y): extends forward-left (azimuth ~40°) and elevates ~12°
    // - Soundboard normal (+Z): faces upward-right towards the right hand
    const violinDirY = new THREE.Vector3(0.40, 0.16, 0.90).normalize();
    const violinDirZ = new THREE.Vector3(-0.35, 0.88, -0.32).normalize();
    const violinDirX = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    violinDirZ.crossVectors(violinDirX, violinDirY).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(violinDirX, violinDirY, violinDirZ);
    const violinWorldQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    // Match chinrest anchor on violin to the character's left jaw
    const chinRestOffsetWorld = REFERENCE_ANATOMY.violinChinrestLocal.clone().applyQuaternion(violinWorldQuat);
    const violinWorldPos = leftJawWorldPos.clone().sub(chinRestOffsetWorld);

    violin.position.copy(violinWorldPos);
    violin.quaternion.copy(violinWorldQuat);
    violin.updateMatrixWorld(true);

    // --- STEP 3: Left Arm (Shoulder -> Elbow -> Wrist) & Neck Grip ---
    const violinNeckTargetPos = REFERENCE_ANATOMY.violinNeckPlayableLocal.clone().applyMatrix4(violin.matrixWorld);

    // Left elbow: suspended comfortably downward and forward-left below the violin
    const bodyDown = new THREE.Vector3(0, -1, 0);
    const bodyLeft = new THREE.Vector3(1, 0, 0);
    const bodyForward = new THREE.Vector3(0, 0, 1);

    const leftElbowHint = new THREE.Vector3()
      .addScaledVector(bodyDown, 0.82)
      .addScaledVector(bodyLeft, 0.38)
      .addScaledVector(bodyForward, 0.42)
      .normalize();

    solveTwoBoneIK(
      leftUpperArm,
      leftLowerArm,
      leftHand,
      violinNeckTargetPos,
      leftElbowHint,
      true // Left arm (+X bone)
    );

    // Left hand orientation around neck
    const handForward = violinDirY.clone();
    const handUp = violinDirZ.clone().negate();
    const handRight = new THREE.Vector3().crossVectors(handForward, handUp).normalize();
    const leftHandWorldMat = new THREE.Matrix4().makeBasis(handForward, handUp, handRight);
    const leftHandWorldQuat = new THREE.Quaternion().setFromRotationMatrix(leftHandWorldMat);

    const lowerArmWorldQuat = new THREE.Quaternion();
    leftLowerArm.getWorldQuaternion(lowerArmWorldQuat);
    const leftHandLocalQuat = lowerArmWorldQuat.clone().invert().multiply(leftHandWorldQuat);
    leftHand.quaternion.copy(leftHandLocalQuat);
    leftHand.updateMatrixWorld(true);

    // Left fingers: wrapped around neck & curved over fingerboard
    const setBoneRot = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
    };

    setBoneRot('leftThumbMetacarpal' as VRMHumanBoneName, 0.10, 0.08, 0.06);
    setBoneRot('leftThumbProximal' as VRMHumanBoneName, 0.28, 0.10, 0.15);
    setBoneRot('leftThumbDistal' as VRMHumanBoneName, 0.18, 0.05, 0.08);

    setBoneRot('leftIndexProximal' as VRMHumanBoneName, 0.48, 0.05, 0.10);
    setBoneRot('leftIndexIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
    setBoneRot('leftIndexDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

    setBoneRot('leftMiddleProximal' as VRMHumanBoneName, 0.52, 0.0, 0.06);
    setBoneRot('leftMiddleIntermediate' as VRMHumanBoneName, 0.60, 0.0, 0.0);
    setBoneRot('leftMiddleDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);

    setBoneRot('leftRingProximal' as VRMHumanBoneName, 0.48, -0.05, 0.06);
    setBoneRot('leftRingIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
    setBoneRot('leftRingDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

    setBoneRot('leftLittleProximal' as VRMHumanBoneName, 0.38, -0.08, 0.05);
    setBoneRot('leftLittleIntermediate' as VRMHumanBoneName, 0.45, 0.0, 0.0);
    setBoneRot('leftLittleDistal' as VRMHumanBoneName, 0.25, 0.0, 0.0);

    // --- STEP 4: Bow Alignment on Strings ---
    const bowContactPointPos = REFERENCE_ANATOMY.violinBowContactLocal.clone().applyMatrix4(violin.matrixWorld);

    // Bow stick runs perpendicular to violin strings
    const bowingDir = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    const bowUp = bowingDir.clone();
    const bowForward = violinDirZ.clone().negate();
    const bowRight = new THREE.Vector3().crossVectors(bowUp, bowForward).normalize();

    const bowWorldMat = new THREE.Matrix4().makeBasis(bowRight, bowUp, bowForward);
    const bowWorldQuat = new THREE.Quaternion().setFromRotationMatrix(bowWorldMat);

    // Position bow on strings at lower-middle hair section
    const bowPositionWorld = bowContactPointPos.clone().addScaledVector(bowUp, -REFERENCE_ANATOMY.bowOffsetAlongStick);
    bow.position.copy(bowPositionWorld);
    bow.quaternion.copy(bowWorldQuat);
    bow.updateMatrixWorld(true);

    // --- STEP 5: Right Arm (Shoulder -> Elbow -> Wrist) & Bow Grip ---
    const rightHandTargetPos = REFERENCE_ANATOMY.bowFrogGripLocal.clone().applyMatrix4(bow.matrixWorld);

    const rightElbowHint = new THREE.Vector3()
      .addScaledVector(new THREE.Vector3(-1, 0, 0), 0.65)
      .addScaledVector(bodyDown, 0.60)
      .addScaledVector(bodyForward, 0.45)
      .normalize();

    solveTwoBoneIK(
      rightUpperArm,
      rightLowerArm,
      rightHand,
      rightHandTargetPos,
      rightElbowHint,
      false // Right arm (-X bone)
    );

    // Derive Right Forearm & Bow Coordinate Alignment
    const rightElbowPos = new THREE.Vector3();
    const rightWristPos = new THREE.Vector3();
    rightLowerArm.getWorldPosition(rightElbowPos);
    rightHand.getWorldPosition(rightWristPos);
    const forearmDir = new THREE.Vector3().subVectors(rightWristPos, rightElbowPos).normalize();
    const bodyRightDir = new THREE.Vector3(-1, 0, 0);

    // Natural Violinist Bow Grip Basis:
    // 1. Hand fingers direction (-X in VRM normalized bone space) continues forearm & drapes down over the stick:
    const handDrapeDir = new THREE.Vector3()
      .addScaledVector(forearmDir, 0.75)
      .addScaledVector(bodyDown, 0.45)
      .addScaledVector(bowUp, 0.25)
      .normalize();
    const handX = handDrapeDir.clone().negate(); // Hand +X (wrist back towards forearm)

    // 2. Hand dorsal / back of hand (+Y): points upward and outward (natural pronation over frog)
    const dorsalUpRaw = new THREE.Vector3(0, 1, 0)
      .addScaledVector(bodyForward, -0.20)
      .addScaledVector(bodyRightDir, 0.35)
      .normalize();

    // 3. Thumb side (+Z): points inward toward player/frog throat
    const handZ = new THREE.Vector3().crossVectors(handX, dorsalUpRaw).normalize();
    const handY = new THREE.Vector3().crossVectors(handZ, handX).normalize();

    const handWorldMat = new THREE.Matrix4().makeBasis(handX, handY, handZ);
    const handWorldQuat = new THREE.Quaternion().setFromRotationMatrix(handWorldMat);

    // Convert from world quaternion to local parent (lowerArm) space
    const rightLowerArmWorldQuat = new THREE.Quaternion();
    rightLowerArm.getWorldQuaternion(rightLowerArmWorldQuat);
    const handLocalQuat = rightLowerArmWorldQuat.clone().invert().multiply(handWorldQuat);

    rightHand.quaternion.copy(handLocalQuat);
    rightHand.updateMatrixWorld(true);

    // Right fingers: curved around frog and stick in an authentic bow hold
    // Thumb: gently curved under the stick/frog, opposing middle finger
    setBoneRot('rightThumbMetacarpal' as VRMHumanBoneName, 0.15, 0.10, 0.22);
    setBoneRot('rightThumbProximal' as VRMHumanBoneName, 0.10, 0.05, 0.35);
    setBoneRot('rightThumbDistal' as VRMHumanBoneName, 0.05, 0.0, 0.25);

    // Index finger: curved over stick, extending comfortably along stick
    setBoneRot('rightIndexProximal' as VRMHumanBoneName, 0.08, -0.05, 0.55);
    setBoneRot('rightIndexIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.65);
    setBoneRot('rightIndexDistal' as VRMHumanBoneName, 0.0, 0.0, 0.35);

    // Middle finger: draped over frog, tip resting near ferrule
    setBoneRot('rightMiddleProximal' as VRMHumanBoneName, 0.02, 0.0, 0.62);
    setBoneRot('rightMiddleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.70);
    setBoneRot('rightMiddleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.40);

    // Ring finger: curved comfortably over frog body
    setBoneRot('rightRingProximal' as VRMHumanBoneName, -0.04, 0.03, 0.58);
    setBoneRot('rightRingIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.68);
    setBoneRot('rightRingDistal' as VRMHumanBoneName, 0.0, 0.0, 0.38);

    // Little finger (pinky): curved on top of the stick near screw for balance
    setBoneRot('rightLittleProximal' as VRMHumanBoneName, -0.10, 0.06, 0.45);
    setBoneRot('rightLittleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.52);
    setBoneRot('rightLittleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.30);

    // --- STEP 6: Synchronize humanoid bones to skinned mesh ---
    humanoid.update();
  });

  return null;
};
