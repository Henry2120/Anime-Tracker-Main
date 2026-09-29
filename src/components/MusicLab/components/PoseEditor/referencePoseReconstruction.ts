import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface ReferencePoseAngles {
  spine: THREE.Euler;
  chest: THREE.Euler;
  neck: THREE.Euler;
  head: THREE.Euler;
  leftShoulder: THREE.Euler;
  leftUpperArm: THREE.Euler;
  leftLowerArm: THREE.Euler;
  leftHand: THREE.Euler;
  rightShoulder: THREE.Euler;
  rightUpperArm: THREE.Euler;
  rightLowerArm: THREE.Euler;
  rightHand: THREE.Euler;
}

/**
 * Reconstructed 3D Humanoid Violinist Body Pose from Reference Image
 * Captures realistic spinal extension, head tilt to left jaw,
 * acute left elbow bend (~80°) with forearm reaching upward,
 * and wide right bowing triangle (~65° elbow bend with pronated wrist).
 * NO instruments, NO bows, NO IK constraints.
 */
export const REFERENCE_IMAGE_POSE: ReferencePoseAngles = {
  // 1. Torso & Spine (Natural poise, subtle rightward torso rotation)
  spine: new THREE.Euler(0.04, -0.05, 0.02, 'XYZ'),
  chest: new THREE.Euler(0.03, -0.04, 0.01, 'XYZ'),

  // 2. Neck & Head (Turned and tilted toward left collarbone shelf)
  neck: new THREE.Euler(0.06, 0.36, 0.06, 'XYZ'),
  head: new THREE.Euler(0.14, 0.32, -0.14, 'XYZ'),

  // 3. Left Shoulder & Clavicle (Elevated & forward to support instrument plane)
  leftShoulder: new THREE.Euler(0.12, 0.18, 0.08, 'XYZ'),

  // 4. Left Arm Chain (Elbow elevated forward, sharp acute forearm bend)
  leftUpperArm: new THREE.Euler(0.52, -0.42, 0.65, 'XYZ'),
  leftLowerArm: new THREE.Euler(0.35, 0.22, 1.38, 'XYZ'),
  leftHand: new THREE.Euler(-0.25, 0.32, -0.22, 'XYZ'),

  // 5. Right Shoulder (Relaxed, slight depression)
  rightShoulder: new THREE.Euler(-0.04, -0.06, -0.02, 'XYZ'),

  // 6. Right Arm Chain (Bowing triangle, elbow abducted, pronated wrist)
  rightUpperArm: new THREE.Euler(-0.42, 0.38, -0.58, 'XYZ'),
  rightLowerArm: new THREE.Euler(-0.30, -0.20, -1.05, 'XYZ'),
  rightHand: new THREE.Euler(0.18, -0.25, 0.35, 'XYZ'),
};

/**
 * Applies the reference image reconstructed pose directly onto test.vrm
 */
export function applyReconstructedPoseToVRM(vrm: VRM, pose: ReferencePoseAngles = REFERENCE_IMAGE_POSE) {
  const hum = vrm.humanoid;
  if (!hum) return;

  const setBone = (boneName: VRMHumanBoneName, euler: THREE.Euler) => {
    const node = hum.getNormalizedBoneNode(boneName);
    if (node) {
      node.quaternion.setFromEuler(euler);
    }
  };

  setBone('spine' as VRMHumanBoneName, pose.spine);
  setBone('chest' as VRMHumanBoneName, pose.chest);
  setBone('neck' as VRMHumanBoneName, pose.neck);
  setBone('head' as VRMHumanBoneName, pose.head);

  setBone('leftShoulder' as VRMHumanBoneName, pose.leftShoulder);
  setBone('leftUpperArm' as VRMHumanBoneName, pose.leftUpperArm);
  setBone('leftLowerArm' as VRMHumanBoneName, pose.leftLowerArm);
  setBone('leftHand' as VRMHumanBoneName, pose.leftHand);

  setBone('rightShoulder' as VRMHumanBoneName, pose.rightShoulder);
  setBone('rightUpperArm' as VRMHumanBoneName, pose.rightUpperArm);
  setBone('rightLowerArm' as VRMHumanBoneName, pose.rightLowerArm);
  setBone('rightHand' as VRMHumanBoneName, pose.rightHand);

  hum.update();
  vrm.scene.updateMatrixWorld(true);
}
