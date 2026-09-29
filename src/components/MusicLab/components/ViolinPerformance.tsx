import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { createViolinProp, createBowProp, disposePropHierarchy } from './ViolinProp';
import { ReferencePoseData, RetargetDiagnostics } from './ViolinPoseLab/referenceTypes';
import { retargetReferenceToVRM } from './ViolinPoseLab/referenceRetargeter';

export interface ViolinPerformanceProps {
  vrm: VRM | null;
  reference: ReferencePoseData;
  isTPose: boolean;
  onDiagnosticsUpdate?: (diag: RetargetDiagnostics) => void;
  showSkeleton?: boolean;
}

interface SavedBoneState {
  bone: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  originalScale: THREE.Vector3;
}

export const ViolinPerformance: React.FC<ViolinPerformanceProps> = ({
  vrm,
  reference,
  isTPose,
  onDiagnosticsUpdate,
  showSkeleton = false,
}) => {
  const violinGroupRef = useRef<THREE.Group | null>(null);
  const bowGroupRef = useRef<THREE.Group | null>(null);
  const savedBonesRef = useRef<SavedBoneState[]>([]);
  const isAttachedRef = useRef<boolean>(false);
  const onDiagnosticsUpdateRef = useRef(onDiagnosticsUpdate);
  onDiagnosticsUpdateRef.current = onDiagnosticsUpdate;

  // 1. Initialize Props and Cache Authored Rest Transforms Once per VRM Instance
  useEffect(() => {
    if (!vrm) return;

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

    // Cache exact authored rest transforms for all skeleton & finger bones
    const boneNames: VRMHumanBoneName[] = [
      'hips' as VRMHumanBoneName,
      'spine' as VRMHumanBoneName,
      'chest' as VRMHumanBoneName,
      'upperChest' as VRMHumanBoneName,
      'neck' as VRMHumanBoneName,
      'head' as VRMHumanBoneName,
      'leftUpperLeg' as VRMHumanBoneName,
      'leftLowerLeg' as VRMHumanBoneName,
      'leftFoot' as VRMHumanBoneName,
      'rightUpperLeg' as VRMHumanBoneName,
      'rightLowerLeg' as VRMHumanBoneName,
      'rightFoot' as VRMHumanBoneName,
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

    // Create high-fidelity procedural violin and bow props
    const violin = createViolinProp();
    const bow = createBowProp();
    violin.visible = false;
    bow.visible = false;
    violinGroupRef.current = violin;
    bowGroupRef.current = bow;

    vrm.scene.add(violin);
    vrm.scene.add(bow);

    isAttachedRef.current = true;

    return () => {
      saved.forEach(({ bone, originalQuaternion, originalPosition, originalScale }) => {
        bone.quaternion.copy(originalQuaternion);
        bone.position.copy(originalPosition);
        bone.scale.copy(originalScale);
      });
      vrm.humanoid?.update();

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

  // 2. Reset skeleton to authored pristine rest transform whenever switching reference or setting T-Pose
  useEffect(() => {
    if (!vrm || !vrm.humanoid) return;

    savedBonesRef.current.forEach(({ bone, originalQuaternion, originalPosition, originalScale }) => {
      bone.quaternion.copy(originalQuaternion);
      bone.position.copy(originalPosition);
      bone.scale.copy(originalScale);
    });
    vrm.humanoid.update();
    vrm.scene.updateMatrixWorld(true);

    if (isTPose) {
      if (violinGroupRef.current) violinGroupRef.current.visible = false;
      if (bowGroupRef.current) bowGroupRef.current.visible = false;
    }
  }, [isTPose, reference, vrm]);

  // 3. Execution Frame Loop: Retargets reference pose to test.vrm
  useFrame(() => {
    if (!vrm || !vrm.humanoid || !isAttachedRef.current) return;
    const violin = violinGroupRef.current;
    const bow = bowGroupRef.current;
    if (!violin || !bow) return;

    if (isTPose) {
      violin.visible = false;
      bow.visible = false;
      return;
    }

    const diagnostics = retargetReferenceToVRM(reference, vrm, violin, bow);
    onDiagnosticsUpdateRef.current?.(diagnostics);
  });

  return null;
};
