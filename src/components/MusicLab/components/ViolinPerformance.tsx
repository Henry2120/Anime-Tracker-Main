import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { createViolinProp, createBowProp, disposePropHierarchy } from './ViolinProp';
import { solveTwoBoneIK } from '../utils/violinKinematics';
import { ViolinPoseDebugger, ViolinDebugNumericData } from './ViolinPoseDebugger';

export type CharacterPerformanceMode = 'normal' | 'violin';

export interface ViolinPerformanceProps {
  vrm: VRM | null;
  mode: CharacterPerformanceMode;
  showDebugTargets?: boolean;
  onDebugDataUpdate?: (data: ViolinDebugNumericData) => void;
}

interface SavedBoneState {
  bone: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  originalScale: THREE.Vector3;
}

/**
 * Dedicated Target-Driven Violin Performance Rig
 * - Anatomical Left Arm: Reaches outward from left shoulder to violin neck with natural elbow positioning.
 * - Anatomical Left Hand: Derives orientation from violin world axes to wrap around neck without inward collapse.
 * - Locked Right Arm/Bow/Strings: Stable bow contact at BowContactPoint with curved frog grip.
 * - Isolated Debugger: Houses ViolinPoseDebugger without changing character kinematics.
 * - Zero spring-bone simulation (vrm.update is never called).
 */
export const ViolinPerformance: React.FC<ViolinPerformanceProps> = ({
  vrm,
  mode,
  showDebugTargets = false,
  onDebugDataUpdate,
}) => {
  const violinGroupRef = useRef<THREE.Group | null>(null);
  const bowGroupRef = useRef<THREE.Group | null>(null);
  const savedBonesRef = useRef<SavedBoneState[]>([]);
  const timeRef = useRef<number>(0);
  const isAttachedRef = useRef<boolean>(false);

  // Debug reference vectors
  const leftHandTargetPosRef = useRef(new THREE.Vector3());
  const rightHandTargetPosRef = useRef(new THREE.Vector3());
  const bendHintLeftElbowRef = useRef(new THREE.Vector3(0.65, -0.60, -0.35).normalize());
  const bendHintRightElbowRef = useRef(new THREE.Vector3(-0.4, -0.8, -0.2).normalize());

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

    // 2. Create Rebuilt Violin and Bow 3D Props
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
      // Clean forward position in front of upper-left chest
      violin.position.set(0.08, 0.05, 0.20);
      // Rotation: Neck extends to left-front (+X, +Z), soundboard faces outward (+Z, +Y)
      violin.rotation.set(-0.25, -0.55, 0.52, 'YXZ');
      chestBone.add(violin);
    } else {
      violin.scale.setScalar(1.0);
      violin.position.set(0.08, 1.25, 0.20);
      violin.rotation.set(-0.25, -0.55, 0.52, 'YXZ');
      vrm.scene.add(violin);
    }

    // 4. Attach Bow to Scene / Stage and coordinate with right hand
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
    const neck = humanoid.getNormalizedBoneNode('neck' as VRMHumanBoneName);
    const head = humanoid.getNormalizedBoneNode('head' as VRMHumanBoneName);
    const spine = humanoid.getNormalizedBoneNode('spine' as VRMHumanBoneName);
    const chest = humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName);
    const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder' as VRMHumanBoneName);
    const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
    const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
    const leftHand = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);
    const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
    const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);
    const rightHand = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

    // --- STEP 1: Head & Torso Posture ---
    if (spine) {
      spine.quaternion.setFromEuler(new THREE.Euler(0.02, 0.02, 0.0));
    }
    if (chest) {
      chest.quaternion.setFromEuler(new THREE.Euler(0.02, 0.0, -0.01));
    }
    if (neck) {
      neck.quaternion.setFromEuler(new THREE.Euler(0.04, 0.15, 0.05));
    }
    if (head) {
      // Turned and tilted toward left chin rest
      head.quaternion.setFromEuler(new THREE.Euler(0.06, 0.16, 0.10));
    }

    // Left Shoulder: Subtle natural lift and forward tilt supporting the violin
    if (leftShoulder) {
      leftShoulder.quaternion.setFromEuler(new THREE.Euler(0.06, -0.04, 0.08));
    }

    // Update scene graph matrix for character and violin
    violin.updateMatrixWorld(true);

    // --- STEP 2: Calculate Key Reference Target Positions in World Space ---
    const violinWorldMatrix = violin.matrixWorld;

    // Violin Reference points
    const violinNeckTargetPos = new THREE.Vector3(0, 0.205, 0.016).applyMatrix4(violinWorldMatrix);
    const bowContactPointPos = new THREE.Vector3(0, 0.045, 0.045).applyMatrix4(violinWorldMatrix);

    // Violin world axes
    const violinDirY = new THREE.Vector3(0, 1, 0).transformDirection(violinWorldMatrix).normalize(); // String/neck direction (+Y scroll)
    const violinDirZ = new THREE.Vector3(0, 0, 1).transformDirection(violinWorldMatrix).normalize(); // Soundboard normal (+Z front)
    
    // Bowing direction perpendicular to strings and parallel to soundboard
    const bowingDirWorld = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();

    // --- STEP 3: Solve Left Arm Two-Bone IK (Reaching Outward to Violin Neck) ---
    if (leftUpperArm && leftLowerArm && leftHand) {
      // Left Hand Target sits directly on the violin neck/fingerboard
      const leftHandTargetPos = violinNeckTargetPos.clone().addScaledVector(violinDirZ, -0.012);
      leftHandTargetPosRef.current.copy(leftHandTargetPos);
      
      const bendHintLeftElbow = bendHintLeftElbowRef.current;

      solveTwoBoneIK(
        leftUpperArm,
        leftLowerArm,
        leftHand,
        leftHandTargetPos,
        bendHintLeftElbow,
        true // Left arm (+X bone)
      );

      // --- Left Hand Orientation: Derived directly from violin world axes ---
      const handForward = violinDirY.clone();
      const handUp = violinDirZ.clone().negate();
      const handRight = new THREE.Vector3().crossVectors(handForward, handUp).normalize();

      const leftHandWorldMat = new THREE.Matrix4().makeBasis(handForward, handUp, handRight);
      const leftHandWorldQuat = new THREE.Quaternion().setFromRotationMatrix(leftHandWorldMat);

      // Convert to local parent space of leftHand (leftLowerArm)
      const lowerArmWorldQuat = new THREE.Quaternion();
      leftLowerArm.getWorldQuaternion(lowerArmWorldQuat);
      const leftHandLocalQuat = lowerArmWorldQuat.clone().invert().multiply(leftHandWorldQuat);

      leftHand.quaternion.copy(leftHandLocalQuat);
      leftHand.updateMatrixWorld(true);

      // --- Left Fingers: Naturally wrap around the neck without clenched fist ---
      const setBoneRot = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
        const node = humanoid.getNormalizedBoneNode(name);
        if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
      };

      // Thumb opposes the fingers on the underside of the neck
      setBoneRot('leftThumbMetacarpal' as VRMHumanBoneName, 0.12, 0.10, 0.08);
      setBoneRot('leftThumbProximal' as VRMHumanBoneName, 0.32, 0.12, 0.18);
      setBoneRot('leftThumbDistal' as VRMHumanBoneName, 0.22, 0.05, 0.10);

      // Fingers curl over the top and wrap around fingerboard
      setBoneRot('leftIndexProximal' as VRMHumanBoneName, 0.52, 0.05, 0.12);
      setBoneRot('leftIndexIntermediate' as VRMHumanBoneName, 0.60, 0.0, 0.0);
      setBoneRot('leftIndexDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);

      setBoneRot('leftMiddleProximal' as VRMHumanBoneName, 0.56, 0.0, 0.08);
      setBoneRot('leftMiddleIntermediate' as VRMHumanBoneName, 0.65, 0.0, 0.0);
      setBoneRot('leftMiddleDistal' as VRMHumanBoneName, 0.36, 0.0, 0.0);

      setBoneRot('leftRingProximal' as VRMHumanBoneName, 0.52, -0.05, 0.08);
      setBoneRot('leftRingIntermediate' as VRMHumanBoneName, 0.60, 0.0, 0.0);
      setBoneRot('leftRingDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);

      setBoneRot('leftLittleProximal' as VRMHumanBoneName, 0.42, -0.08, 0.06);
      setBoneRot('leftLittleIntermediate' as VRMHumanBoneName, 0.50, 0.0, 0.0);
      setBoneRot('leftLittleDistal' as VRMHumanBoneName, 0.28, 0.0, 0.0);
    }

    // --- STEP 4: Position and Orient Bow (Resting Directly on Strings) ---
    const bowUp = bowingDirWorld.clone();
    const bowForward = violinDirZ.clone().negate();
    const bowRight = new THREE.Vector3().crossVectors(bowUp, bowForward).normalize();

    const bowWorldMat = new THREE.Matrix4().makeBasis(bowRight, bowUp, bowForward);
    const bowWorldQuat = new THREE.Quaternion().setFromRotationMatrix(bowWorldMat);

    // Place bow center so that hair contacts strings at bowContactPointPos
    bow.position.copy(bowContactPointPos);
    bow.quaternion.copy(bowWorldQuat);
    bow.updateMatrixWorld(true);

    // Bow Frog / Grip world position (Frog is at local y = -0.30 on bow)
    const bowGripTargetPos = new THREE.Vector3(0, -0.30, 0).applyMatrix4(bow.matrixWorld);
    rightHandTargetPosRef.current.copy(bowGripTargetPos);

    // --- STEP 5: Solve Right Arm Two-Bone IK (Gripping Bow Frog) ---
    if (rightUpperArm && rightLowerArm && rightHand) {
      const rightHandTargetPos = bowGripTargetPos.clone();
      const bendHintRightElbow = bendHintRightElbowRef.current;

      solveTwoBoneIK(
        rightUpperArm,
        rightLowerArm,
        rightHand,
        rightHandTargetPos,
        bendHintRightElbow,
        false // Right arm (-X bone)
      );

      // Orient Right Hand to hold bow frog
      const handGripAlign = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.25, 0.15, -0.35)
      );
      rightHand.quaternion.copy(bowWorldQuat).multiply(handGripAlign);

      // Right Fingers: Visibly curled around the bow frog/grip
      const setRightFinger = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
        const node = humanoid.getNormalizedBoneNode(name);
        if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
      };

      // Thumb opposes the frog from underneath
      setRightFinger('rightThumbMetacarpal' as VRMHumanBoneName, 0.15, -0.1, -0.1);
      setRightFinger('rightThumbProximal' as VRMHumanBoneName, 0.45, -0.15, -0.15);
      setRightFinger('rightThumbDistal' as VRMHumanBoneName, 0.30, -0.05, -0.1);

      // Fingers wrap curved around the stick and frog
      setRightFinger('rightIndexProximal' as VRMHumanBoneName, 0.55, -0.05, -0.08);
      setRightFinger('rightIndexIntermediate' as VRMHumanBoneName, 0.65, 0.0, 0.0);
      setRightFinger('rightIndexDistal' as VRMHumanBoneName, 0.35, 0.0, 0.0);

      setRightFinger('rightMiddleProximal' as VRMHumanBoneName, 0.60, 0.0, -0.06);
      setRightFinger('rightMiddleIntermediate' as VRMHumanBoneName, 0.70, 0.0, 0.0);
      setRightFinger('rightMiddleDistal' as VRMHumanBoneName, 0.40, 0.0, 0.0);

      setRightFinger('rightRingProximal' as VRMHumanBoneName, 0.55, 0.05, -0.06);
      setRightFinger('rightRingIntermediate' as VRMHumanBoneName, 0.65, 0.0, 0.0);
      setRightFinger('rightRingDistal' as VRMHumanBoneName, 0.35, 0.0, 0.0);

      setRightFinger('rightLittleProximal' as VRMHumanBoneName, 0.45, 0.08, -0.05);
      setRightFinger('rightLittleIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
      setRightLittleFinger: setRightFinger('rightLittleDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);
    }

    // --- STEP 6: Synchronize Normalized Humanoid Bones to Mesh ---
    humanoid.update();
  });

  return (
    <>
      {/* Isolated Temporary Violin Pose Debugger */}
      {mode === 'violin' && showDebugTargets && (
        <ViolinPoseDebugger
          vrm={vrm}
          violinGroup={violinGroupRef.current}
          bowGroup={bowGroupRef.current}
          leftHandTargetPos={leftHandTargetPosRef.current}
          rightHandTargetPos={rightHandTargetPosRef.current}
          bendHintLeftElbow={bendHintLeftElbowRef.current}
          bendHintRightElbow={bendHintRightElbowRef.current}
          enabled={showDebugTargets}
          onDataUpdate={onDebugDataUpdate}
        />
      )}
    </>
  );
};
