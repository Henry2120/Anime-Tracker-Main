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
 * Dedicated Modular Violin Performance Rig & Kinematic Controller
 * - Transitions the VRM character from authored T-pose into a stable, natural violin playing posture.
 * - Attaches the 3D violin to the upper chest/shoulder and the bow to the right hand.
 * - Executes smooth, non-spinning bowing motion across the violin strings.
 * - Calls vrm.humanoid.update() for direct kinematic synchronization with zero spring-bone simulation.
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

    // Find attachment bones
    const chestBone =
      humanoid.getNormalizedBoneNode('upperChest' as VRMHumanBoneName) ||
      humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName) ||
      humanoid.getNormalizedBoneNode('spine' as VRMHumanBoneName);

    const rightHandBone = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

    // 1. Attach Violin to Upper Chest / Shoulder
    if (chestBone) {
      violin.scale.setScalar(1.0);
      violin.position.set(-0.11, 0.08, 0.12);
      violin.rotation.set(-0.35, 0.62, -0.58);
      chestBone.add(violin);
    } else {
      violin.scale.setScalar(1.0);
      violin.position.set(-0.11, 1.25, 0.12);
      violin.rotation.set(-0.35, 0.62, -0.58);
      vrm.scene.add(violin);
    }

    // 2. Attach Bow to Right Hand (Frog rested in palm, hair facing violin strings)
    if (rightHandBone) {
      bow.scale.setScalar(1.0);
      bow.position.set(0.04, -0.02, 0.08);
      bow.rotation.set(1.45, 0.35, -0.75);
      rightHandBone.add(bow);
    } else {
      bow.scale.setScalar(1.0);
      bow.position.set(0.12, 1.2, 0.22);
      bow.rotation.set(0, 0, 0);
      vrm.scene.add(bow);
    }

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

  // 3. Performance Pose & Bowing Frame Loop (Active ONLY in 'violin' mode)
  useFrame((_, delta) => {
    if (mode !== 'violin' || !vrm || !vrm.humanoid || !isAttachedRef.current) return;

    // Accumulate smooth delta time
    timeRef.current += Math.min(delta, 0.1);
    const t = timeRef.current;

    const humanoid = vrm.humanoid;

    // Bowing Cycle parameters (~2.6 second full back-and-forth stroke)
    const bowingSpeed = 2.4; // radians/sec
    const bowPhase = t * bowingSpeed;
    const stroke = Math.sin(bowPhase); // -1 (down-bow tip) to +1 (up-bow frog)
    const strokeVelocity = Math.cos(bowPhase); // 90° lead for authentic wrist follow-through

    // Phrasing sway frequency for subtle torso & head musical expression
    const phrasePhase = t * 1.2;
    const phraseSway = Math.sin(phrasePhase) * 0.025;

    // Helper to safely set normalized bone rotation from Euler angles
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

    // --- 1. Torso & Spine Posture ---
    setBoneRotation('spine' as VRMHumanBoneName, 0.02 + phraseSway * 0.3, 0.03, 0.0);
    setBoneRotation(
      'chest' as VRMHumanBoneName,
      0.02 + Math.sin(t * 1.5) * 0.01,
      phraseSway * 0.5,
      -0.015
    );

    // --- 2. Head & Neck (Turned & tilted naturally onto chin rest) ---
    const headSway = Math.sin(bowPhase * 0.5) * 0.015;
    setBoneRotation('neck' as VRMHumanBoneName, 0.05, 0.18 + headSway * 0.4, -0.08);
    setBoneRotation(
      'head' as VRMHumanBoneName,
      0.08 + headSway * 0.6,
      0.12 + phraseSway * 0.2,
      -0.12 + headSway * 0.3
    );

    // --- 3. Left Arm (Holding Violin Neck & Fingerboard) ---
    // Left Shoulder: subtle lift
    setBoneRotation('leftShoulder' as VRMHumanBoneName, 0.05, -0.05, 0.08);

    // Left Upper Arm: swings forward and lowers from horizontal T-pose toward chest
    const vibrato = Math.sin(t * 26.0) * 0.012; // Natural 4.2Hz subtle vibrato
    setBoneRotation(
      'leftUpperArm' as VRMHumanBoneName,
      -0.25 + phraseSway * 0.2,
      -0.65 + vibrato,
      0.42
    );

    // Left Lower Arm: bends elbow sharply upward and across to reach violin neck
    setBoneRotation(
      'leftLowerArm' as VRMHumanBoneName,
      -0.35,
      -0.45 + vibrato * 1.5,
      1.45
    );

    // Left Hand: cradling the neck and fingerboard
    setBoneRotation(
      'leftHand' as VRMHumanBoneName,
      0.15 + vibrato * 1.8,
      -0.20,
      0.25 + vibrato * 1.0
    );

    // Left Fingers: arched naturally around fingerboard with subtle phrasing
    const fingerTap1 = Math.sin(t * 4.8) > 0 ? 0.25 : 0.12;
    const fingerTap2 = Math.cos(t * 3.6) > 0 ? 0.30 : 0.15;
    const fingerTap3 = Math.sin(t * 6.0 + 1.2) > 0 ? 0.28 : 0.12;

    setBoneRotation('leftThumbProximal' as VRMHumanBoneName, 0.20, 0.10, 0.15);
    setBoneRotation('leftIndexProximal' as VRMHumanBoneName, 0.40 + fingerTap1, 0.05, 0.08);
    setBoneRotation('leftMiddleProximal' as VRMHumanBoneName, 0.45 + fingerTap2, 0.0, 0.05);
    setBoneRotation('leftRingProximal' as VRMHumanBoneName, 0.42 + fingerTap3, -0.05, 0.05);
    setBoneRotation('leftLittleProximal' as VRMHumanBoneName, 0.35, -0.08, 0.05);

    // --- 4. Right Arm (Active Bowing Motion Driving Bow Across Strings) ---
    // Right Shoulder: relaxed
    setBoneRotation('rightShoulder' as VRMHumanBoneName, 0.05, 0.05, -0.05);

    // Right Upper Arm: lowered from T-pose and angled forward into playing plane
    const rightUpperArmX = 0.20 - stroke * 0.04;
    const rightUpperArmY = 0.55 - stroke * 0.06;
    const rightUpperArmZ = -0.65 + stroke * 0.08;
    setBoneRotation('rightUpperArm' as VRMHumanBoneName, rightUpperArmX, rightUpperArmY, rightUpperArmZ);

    // Right Lower Arm: elbow flexion/extension driving the bow stroke
    const rightLowerArmX = 0.25 + stroke * 0.05;
    const rightLowerArmY = 0.35 + stroke * 0.12;
    const rightLowerArmZ = -1.15 + stroke * 0.18;
    setBoneRotation('rightLowerArm' as VRMHumanBoneName, rightLowerArmX, rightLowerArmY, rightLowerArmZ);

    // Right Hand (Wrist): authentic bowing lead/lag without spinning
    const rightHandX = -0.15 - strokeVelocity * 0.10;
    const rightHandY = 0.20 - stroke * 0.05;
    const rightHandZ = -0.15 + stroke * 0.08;
    setBoneRotation('rightHand' as VRMHumanBoneName, rightHandX, rightHandY, rightHandZ);

    // Right Fingers: curved naturally around bow frog
    setBoneRotation('rightThumbProximal' as VRMHumanBoneName, 0.30, -0.10, -0.12);
    setBoneRotation('rightIndexProximal' as VRMHumanBoneName, 0.40, -0.05, -0.06);
    setBoneRotation('rightMiddleProximal' as VRMHumanBoneName, 0.38, 0.0, -0.05);
    setBoneRotation('rightRingProximal' as VRMHumanBoneName, 0.35, 0.05, -0.05);
    setBoneRotation('rightLittleProximal' as VRMHumanBoneName, 0.30, 0.08, -0.05);

    // --- 5. Bow Position Translation Along Its Longitudinal Axis ---
    // The bow slides smoothly along its local Y axis (frog to tip) keeping hair on the strings
    if (bowGroupRef.current) {
      bowGroupRef.current.position.y = -0.02 + stroke * 0.14;
    }

    // --- 6. Synchronize Humanoid Kinematics (No spring-bone simulation) ---
    humanoid.update();
  });

  return null;
};
