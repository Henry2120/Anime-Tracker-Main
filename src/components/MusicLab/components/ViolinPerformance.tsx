import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { createViolinProp, createBowProp, disposePropHierarchy } from './ViolinProp';

export type CharacterPerformanceMode = 'normal' | 'violin';

export interface ViolinPerformanceProps {
  vrm: VRM | null;
  mode: CharacterPerformanceMode;
}

interface SavedBoneState {
  bone: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  originalScale: THREE.Vector3;
}

/**
 * Dedicated Modular Violin Performance Rig & Animation
 * - Operates cleanly on the existing loaded VRM instance without recreating or reloading the model.
 * - In 'normal' mode: restores exact authored T-pose / rest transforms, hides violin & bow, runs 0 bone updates.
 * - In 'violin' mode: attaches violin/bow once, applies playing posture, and runs smooth periodic bowing animation.
 * - Zero spring-bone physics simulation (vrm.update is never called).
 */
export const ViolinPerformance: React.FC<ViolinPerformanceProps> = ({
  vrm,
  mode,
}) => {
  const violinGroupRef = useRef<THREE.Group | null>(null);
  const bowGroupRef = useRef<THREE.Group | null>(null);
  const savedBonesRef = useRef<SavedBoneState[]>([]);
  const timeRef = useRef<number>(0);
  const isAttachedRef = useRef<boolean>(false);

  // 1. Initialize Props and Cache Authored Rest Transforms Once per VRM instance
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

    // Cache exact authored rest transforms before any performance pose is applied
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

    // Create Violin and Bow 3D Props ONCE
    const violin = createViolinProp();
    const bow = createBowProp();
    violin.visible = false;
    bow.visible = false;
    violinGroupRef.current = violin;
    bowGroupRef.current = bow;

    // Attach to VRM Skeleton
    const chestBone =
      humanoid.getNormalizedBoneNode('upperChest' as VRMHumanBoneName) ||
      humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName) ||
      humanoid.getNormalizedBoneNode('spine' as VRMHumanBoneName);

    const rightHandBone = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

    if (chestBone) {
      violin.scale.setScalar(1.0);
      violin.position.set(-0.13, 0.08, 0.14);
      violin.rotation.set(-0.35, 0.65, -0.6);
      chestBone.add(violin);
    } else {
      violin.scale.setScalar(1.0);
      violin.position.set(-0.13, 1.25, 0.14);
      violin.rotation.set(-0.35, 0.65, -0.6);
      vrm.scene.add(violin);
    }

    if (rightHandBone) {
      bow.scale.setScalar(1.0);
      bow.position.set(0.02, 0.01, 0.02);
      bow.rotation.set(Math.PI / 2 + 0.2, 0.4, -0.3);
      rightHandBone.add(bow);
    } else {
      bow.scale.setScalar(1.0);
      bow.position.set(0.15, 1.2, 0.25);
      bow.rotation.set(0, 0, 0);
      vrm.scene.add(bow);
    }

    isAttachedRef.current = true;

    return () => {
      // Restore cached bone transforms on unmount
      saved.forEach(({ bone, originalQuaternion, originalPosition, originalScale }) => {
        bone.quaternion.copy(originalQuaternion);
        bone.position.copy(originalPosition);
        bone.scale.copy(originalScale);
      });

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

    if (!isViolin) {
      // Returning to 'normal': immediately restore exact authored rest transforms
      savedBonesRef.current.forEach(({ bone, originalQuaternion, originalPosition, originalScale }) => {
        bone.quaternion.copy(originalQuaternion);
        bone.position.copy(originalPosition);
        bone.scale.copy(originalScale);
      });
    }
  }, [mode]);

  // 3. Performance Animation Frame Loop (Active ONLY in 'violin' mode)
  useFrame((_, delta) => {
    if (mode !== 'violin' || !vrm || !vrm.humanoid || !isAttachedRef.current) return;

    // Accumulate smooth delta time (independent of deprecated clock)
    timeRef.current += Math.min(delta, 0.1);
    const t = timeRef.current;

    const humanoid = vrm.humanoid;

    // Bowing Cycle parameters (smooth periodic loop, ~2.6 second stroke cycle)
    const bowingSpeed = 2.4; // radians/sec
    const bowPhase = t * bowingSpeed;
    const stroke = Math.sin(bowPhase); // -1 (tip/out) to +1 (frog/in)
    const strokeVelocity = Math.cos(bowPhase); // 90° lead for wrist articulation

    // Secondary phrasing frequency for torso/head musical sway
    const phrasePhase = t * 1.2;
    const phraseSway = Math.sin(phrasePhase) * 0.035;

    // Helper to safely set bone rotation from Euler angles
    const setBoneRotation = (
      name: VRMHumanBoneName,
      x: number,
      y: number,
      z: number
    ) => {
      const bone = humanoid.getNormalizedBoneNode(name);
      if (!bone) return;
      bone.quaternion.setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
    };

    // --- 1. Torso & Spine Posture (Subtle breathing & musical phrasing) ---
    setBoneRotation('spine' as VRMHumanBoneName, 0.03 + phraseSway * 0.4, 0.02, 0.0);
    setBoneRotation(
      'chest' as VRMHumanBoneName,
      0.02 + Math.sin(t * 1.5) * 0.015,
      phraseSway * 0.6,
      -0.015
    );

    // --- 2. Head & Neck Posture (Turned & tilted onto chin rest) ---
    const headSway = Math.sin(bowPhase * 0.5) * 0.02;
    setBoneRotation('neck' as VRMHumanBoneName, 0.06, 0.12 + headSway * 0.5, -0.08);
    setBoneRotation(
      'head' as VRMHumanBoneName,
      0.14 + headSway * 0.8,
      0.22 + phraseSway * 0.3,
      -0.18 + headSway * 0.4
    );

    // --- 3. Left Arm (Holding Violin Neck & Fingerboard) ---
    // Left Shoulder: slightly forward/up
    setBoneRotation('leftShoulder' as VRMHumanBoneName, 0.05, 0.08, 0.12);

    // Left Upper Arm: adducted forward and inward under violin neck
    const vibrato = Math.sin(t * 28.0) * 0.015; // Subtle 4.5Hz natural vibrato
    setBoneRotation(
      'leftUpperArm' as VRMHumanBoneName,
      -0.48 + phraseSway * 0.2,
      0.32 + vibrato,
      0.72
    );

    // Left Lower Arm: flexed ~95° and supinated (palm turned upward/inward)
    setBoneRotation(
      'leftLowerArm' as VRMHumanBoneName,
      -0.22,
      -0.78 + vibrato * 1.5,
      -1.38
    );

    // Left Hand (Wrist & Palm cradling neck)
    setBoneRotation(
      'leftHand' as VRMHumanBoneName,
      0.12 + vibrato * 2.0,
      -0.18,
      0.35 + vibrato * 1.2
    );

    // Left Fingers (Arched gracefully on fingerboard with rhythmic tapping)
    const fingerTap1 = Math.sin(t * 6.5) > 0 ? 0.35 : 0.15;
    const fingerTap2 = Math.cos(t * 5.2) > 0 ? 0.4 : 0.18;
    const fingerTap3 = Math.sin(t * 8.0 + 1.0) > 0 ? 0.38 : 0.15;

    setBoneRotation('leftThumbProximal' as VRMHumanBoneName, 0.2, 0.1, 0.15);
    setBoneRotation('leftIndexProximal' as VRMHumanBoneName, 0.45 + fingerTap1, 0.05, 0.1);
    setBoneRotation('leftMiddleProximal' as VRMHumanBoneName, 0.5 + fingerTap2, 0.0, 0.05);
    setBoneRotation('leftRingProximal' as VRMHumanBoneName, 0.48 + fingerTap3, -0.05, 0.05);
    setBoneRotation('leftLittleProximal' as VRMHumanBoneName, 0.4, -0.1, 0.05);

    // --- 4. Right Arm (Active Bowing Motion) ---
    // Right Shoulder: stable and relaxed
    setBoneRotation('rightShoulder' as VRMHumanBoneName, 0.02, -0.04, -0.08);

    // Right Upper Arm: extends and draws inward with bowing stroke
    const rightUpperArmX = -0.32 + stroke * 0.14;
    const rightUpperArmY = -0.28 - stroke * 0.12;
    const rightUpperArmZ = -0.68 + stroke * 0.08;
    setBoneRotation('rightUpperArm' as VRMHumanBoneName, rightUpperArmX, rightUpperArmY, rightUpperArmZ);

    // Right Lower Arm (Elbow flexion/extension driving bow along strings)
    const rightLowerArmX = -0.18 + stroke * 0.28;
    const rightLowerArmY = 0.52 + stroke * 0.18;
    const rightLowerArmZ = 0.95 - stroke * 0.32;
    setBoneRotation('rightLowerArm' as VRMHumanBoneName, rightLowerArmX, rightLowerArmY, rightLowerArmZ);

    // Right Hand (Wrist flexion with authentic lead/lag at stroke turning points)
    const rightHandX = 0.12 - strokeVelocity * 0.16;
    const rightHandY = 0.25 - stroke * 0.14;
    const rightHandZ = -0.22 + strokeVelocity * 0.12;
    setBoneRotation('rightHand' as VRMHumanBoneName, rightHandX, rightHandY, rightHandZ);

    // Right Fingers (Curved naturally holding bow frog)
    setBoneRotation('rightThumbProximal' as VRMHumanBoneName, 0.35, -0.1, -0.15);
    setBoneRotation('rightIndexProximal' as VRMHumanBoneName, 0.45, -0.05, -0.08);
    setBoneRotation('rightMiddleProximal' as VRMHumanBoneName, 0.42, 0.0, -0.05);
    setBoneRotation('rightRingProximal' as VRMHumanBoneName, 0.38, 0.05, -0.05);
    setBoneRotation('rightLittleProximal' as VRMHumanBoneName, 0.32, 0.08, -0.05);
  });

  return null;
};
