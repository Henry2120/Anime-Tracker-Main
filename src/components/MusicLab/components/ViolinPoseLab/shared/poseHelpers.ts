import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { solveTwoBoneIK } from '../../../utils/violinKinematics';

// Measured local chin offset on head bone of test.vrm
export const REST_CHIN_LOCAL = new THREE.Vector3(0.0, -0.0341, 0.0794);
export const REST_LEFT_JAW_LOCAL = new THREE.Vector3(0.025, -0.032, 0.068);

export function setBoneEuler(
  vrm: VRM,
  name: VRMHumanBoneName,
  x: number,
  y: number,
  z: number,
  order: string = 'XYZ'
) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (node) {
    node.quaternion.setFromEuler(new THREE.Euler(x, y, z, order as any));
  }
}

export function setBoneQuat(vrm: VRM, name: VRMHumanBoneName, q: THREE.Quaternion) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (node) {
    node.quaternion.copy(q);
  }
}

export function poseFingersLeftClassical(vrm: VRM) {
  setBoneEuler(vrm, 'leftThumbMetacarpal' as VRMHumanBoneName, 0.10, 0.08, 0.06);
  setBoneEuler(vrm, 'leftThumbProximal' as VRMHumanBoneName, 0.28, 0.10, 0.15);
  setBoneEuler(vrm, 'leftThumbDistal' as VRMHumanBoneName, 0.18, 0.05, 0.08);

  setBoneEuler(vrm, 'leftIndexProximal' as VRMHumanBoneName, 0.48, 0.05, 0.10);
  setBoneEuler(vrm, 'leftIndexIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
  setBoneEuler(vrm, 'leftIndexDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setBoneEuler(vrm, 'leftMiddleProximal' as VRMHumanBoneName, 0.52, 0.0, 0.06);
  setBoneEuler(vrm, 'leftMiddleIntermediate' as VRMHumanBoneName, 0.60, 0.0, 0.0);
  setBoneEuler(vrm, 'leftMiddleDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);

  setBoneEuler(vrm, 'leftRingProximal' as VRMHumanBoneName, 0.48, -0.05, 0.06);
  setBoneEuler(vrm, 'leftRingIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
  setBoneEuler(vrm, 'leftRingDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setBoneEuler(vrm, 'leftLittleProximal' as VRMHumanBoneName, 0.38, -0.08, 0.05);
  setBoneEuler(vrm, 'leftLittleIntermediate' as VRMHumanBoneName, 0.45, 0.0, 0.0);
  setBoneEuler(vrm, 'leftLittleDistal' as VRMHumanBoneName, 0.25, 0.0, 0.0);
}

export function poseFingersLeftShifted(vrm: VRM) {
  // Higher position finger arching (3rd/5th position)
  setBoneEuler(vrm, 'leftThumbMetacarpal' as VRMHumanBoneName, 0.08, 0.06, 0.04);
  setBoneEuler(vrm, 'leftThumbProximal' as VRMHumanBoneName, 0.22, 0.08, 0.12);
  setBoneEuler(vrm, 'leftThumbDistal' as VRMHumanBoneName, 0.14, 0.04, 0.06);

  setBoneEuler(vrm, 'leftIndexProximal' as VRMHumanBoneName, 0.62, 0.06, 0.14);
  setBoneEuler(vrm, 'leftIndexIntermediate' as VRMHumanBoneName, 0.68, 0.0, 0.0);
  setBoneEuler(vrm, 'leftIndexDistal' as VRMHumanBoneName, 0.38, 0.0, 0.0);

  setBoneEuler(vrm, 'leftMiddleProximal' as VRMHumanBoneName, 0.65, 0.02, 0.08);
  setBoneEuler(vrm, 'leftMiddleIntermediate' as VRMHumanBoneName, 0.72, 0.0, 0.0);
  setBoneEuler(vrm, 'leftMiddleDistal' as VRMHumanBoneName, 0.40, 0.0, 0.0);

  setBoneEuler(vrm, 'leftRingProximal' as VRMHumanBoneName, 0.60, -0.04, 0.08);
  setBoneEuler(vrm, 'leftRingIntermediate' as VRMHumanBoneName, 0.68, 0.0, 0.0);
  setBoneEuler(vrm, 'leftRingDistal' as VRMHumanBoneName, 0.38, 0.0, 0.0);

  setBoneEuler(vrm, 'leftLittleProximal' as VRMHumanBoneName, 0.48, -0.06, 0.06);
  setBoneEuler(vrm, 'leftLittleIntermediate' as VRMHumanBoneName, 0.58, 0.0, 0.0);
  setBoneEuler(vrm, 'leftLittleDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);
}

export function poseFingersRightPronated(vrm: VRM) {
  // Russian/Franco-Belgian pronated bow grip
  setBoneEuler(vrm, 'rightThumbMetacarpal' as VRMHumanBoneName, 0.15, 0.10, 0.22);
  setBoneEuler(vrm, 'rightThumbProximal' as VRMHumanBoneName, 0.10, 0.05, 0.35);
  setBoneEuler(vrm, 'rightThumbDistal' as VRMHumanBoneName, 0.05, 0.0, 0.25);

  setBoneEuler(vrm, 'rightIndexProximal' as VRMHumanBoneName, 0.08, -0.05, 0.55);
  setBoneEuler(vrm, 'rightIndexIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.65);
  setBoneEuler(vrm, 'rightIndexDistal' as VRMHumanBoneName, 0.0, 0.0, 0.35);

  setBoneEuler(vrm, 'rightMiddleProximal' as VRMHumanBoneName, 0.02, 0.0, 0.62);
  setBoneEuler(vrm, 'rightMiddleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.70);
  setBoneEuler(vrm, 'rightMiddleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.40);

  setBoneEuler(vrm, 'rightRingProximal' as VRMHumanBoneName, -0.04, 0.03, 0.58);
  setBoneEuler(vrm, 'rightRingIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.68);
  setBoneEuler(vrm, 'rightRingDistal' as VRMHumanBoneName, 0.0, 0.0, 0.38);

  setBoneEuler(vrm, 'rightLittleProximal' as VRMHumanBoneName, -0.10, 0.06, 0.45);
  setBoneEuler(vrm, 'rightLittleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.52);
  setBoneEuler(vrm, 'rightLittleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.30);
}

export function poseFingersRightFlexible(vrm: VRM) {
  // Galamian flexible bow hold
  setBoneEuler(vrm, 'rightThumbMetacarpal' as VRMHumanBoneName, 0.12, 0.08, 0.18);
  setBoneEuler(vrm, 'rightThumbProximal' as VRMHumanBoneName, 0.08, 0.04, 0.28);
  setBoneEuler(vrm, 'rightThumbDistal' as VRMHumanBoneName, 0.04, 0.0, 0.20);

  setBoneEuler(vrm, 'rightIndexProximal' as VRMHumanBoneName, 0.05, -0.03, 0.48);
  setBoneEuler(vrm, 'rightIndexIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.55);
  setBoneEuler(vrm, 'rightIndexDistal' as VRMHumanBoneName, 0.0, 0.0, 0.28);

  setBoneEuler(vrm, 'rightMiddleProximal' as VRMHumanBoneName, 0.0, 0.0, 0.52);
  setBoneEuler(vrm, 'rightMiddleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.58);
  setBoneEuler(vrm, 'rightMiddleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.32);

  setBoneEuler(vrm, 'rightRingProximal' as VRMHumanBoneName, -0.03, 0.02, 0.48);
  setBoneEuler(vrm, 'rightRingIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.56);
  setBoneEuler(vrm, 'rightRingDistal' as VRMHumanBoneName, 0.0, 0.0, 0.30);

  setBoneEuler(vrm, 'rightLittleProximal' as VRMHumanBoneName, -0.08, 0.04, 0.38);
  setBoneEuler(vrm, 'rightLittleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.44);
  setBoneEuler(vrm, 'rightLittleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.25);
}

export { solveTwoBoneIK };
