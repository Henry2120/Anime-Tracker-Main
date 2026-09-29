import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ViolinPoseVariant } from '../types';
import {
  setBoneEuler,
  solveTwoBoneIK,
  poseFingersLeftClassical,
  poseFingersRightFlexible,
  REST_CHIN_LOCAL,
  REST_LEFT_JAW_LOCAL,
} from '../shared/poseHelpers';

export const Variant04Relaxed: ViolinPoseVariant = {
  id: 4,
  numberStr: '04',
  name: 'Relaxed Professional Stance',
  poseMethod: 'Ergonomic Musician Biomechanics',
  referenceName: 'Relaxed Chamber Musician Rehearsal Pose',
  referenceUrl: 'https://en.wikipedia.org/wiki/Alexander_technique',
  creator: 'Ergonomic Musician Study',
  license: 'Ergonomic Reference Standard',
  sourceAssetBundled: false,
  shortDescription: 'Casual, relaxed professional rehearsal posture with relaxed shoulders and softer joints.',
  visibleDifferences: 'Spine relaxed with weight shift toward left hip, shoulders dropped lower, violin resting at a lower and flatter chest angle, softer right wrist curvature.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    // Weight shift and relaxed torso
    setBoneEuler(vrm, 'hips' as VRMHumanBoneName, 0.0, 0.0, -0.04);
    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.01, 0.02, 0.02);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.01, 0.02, 0.01);
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.01, -0.01, 0.02);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.05, 0.20, 0.04, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.09, 0.24, 0.05, 'YXZ');

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // Flatter, lower violin resting angle
    const violinDirY = new THREE.Vector3(0.44, 0.06, 0.90).normalize();
    const violinDirZ = new THREE.Vector3(-0.30, 0.93, -0.21).normalize();
    const violinDirX = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    violinDirZ.crossVectors(violinDirX, violinDirY).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(violinDirX, violinDirY, violinDirZ);
    const violinWorldQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    const chinRestLocal = new THREE.Vector3(-0.048, -0.155, 0.040);
    const violinWorldPos = jawPos.clone().sub(chinRestLocal.clone().applyQuaternion(violinWorldQuat));

    violin.position.copy(violinWorldPos);
    violin.quaternion.copy(violinWorldQuat);
    violin.updateMatrixWorld(true);

    // Left Arm
    const leftHandTarget = new THREE.Vector3(0, 0.205, 0.005).applyMatrix4(violin.matrixWorld);
    const leftElbowHint = new THREE.Vector3(0.42, -0.88, 0.22).normalize();
    const leftUA = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName)!;
    const leftLA = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName)!;
    const leftH = vrm.humanoid?.getNormalizedBoneNode('leftHand' as VRMHumanBoneName)!;

    solveTwoBoneIK(leftUA, leftLA, leftH, leftHandTarget, leftElbowHint, true);
    poseFingersLeftClassical(vrm);

    // Bow
    const bowContactPos = new THREE.Vector3(0, 0.045, 0.045).applyMatrix4(violin.matrixWorld);
    const bowingDir = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    const bowUp = bowingDir.clone();
    const bowFwd = violinDirZ.clone().negate();
    const bowR = new THREE.Vector3().crossVectors(bowUp, bowFwd).normalize();
    const bowWorldMat = new THREE.Matrix4().makeBasis(bowR, bowUp, bowFwd);

    bow.position.copy(bowContactPos.clone().addScaledVector(bowUp, 0.06));
    bow.quaternion.setFromRotationMatrix(bowWorldMat);
    bow.updateMatrixWorld(true);

    const rightHandTarget = new THREE.Vector3(0, -0.26, 0).applyMatrix4(bow.matrixWorld);
    const rightUA = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName)!;
    const rightLA = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName)!;
    const rightH = vrm.humanoid?.getNormalizedBoneNode('rightHand' as VRMHumanBoneName)!;

    const rightElbowHint = new THREE.Vector3(-0.62, -0.70, 0.35).normalize();
    solveTwoBoneIK(rightUA, rightLA, rightH, rightHandTarget, rightElbowHint, false);
    poseFingersRightFlexible(vrm);

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const chinRestPos = chinRestLocal.clone().applyMatrix4(violin.matrixWorld);
    return {
      chinPos,
      chinRestPos,
      chinDistance: chinPos.distanceTo(chinRestPos),
      bowAngle: 90.0,
    };
  },
};
