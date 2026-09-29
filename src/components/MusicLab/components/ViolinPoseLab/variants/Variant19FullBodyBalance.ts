import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ViolinPoseVariant } from '../types';
import {
  setBoneEuler,
  solveTwoBoneIK,
  poseFingersLeftClassical,
  poseFingersRightPronated,
  REST_CHIN_LOCAL,
  REST_LEFT_JAW_LOCAL,
} from '../shared/poseHelpers';

export const Variant19FullBodyBalance: ViolinPoseVariant = {
  id: 19,
  numberStr: '19',
  name: 'Full-Body Grounded Stance',
  poseMethod: 'Holistic Kinetic Chain Stance',
  referenceName: 'Grounded Stage Musician Kinetic Chain',
  referenceUrl: 'https://en.wikipedia.org/wiki/Violin',
  creator: 'Full-Body Musician Biomechanics Study',
  license: 'Full-Body Biomechanics Standard',
  sourceAssetBundled: false,
  shortDescription: 'Solves the entire kinetic chain from the feet up, with realistic hip weight shift and knee flexion.',
  visibleDifferences: 'Complete lower-body engagement: weight shifted onto the left foot, right knee slightly softened, hips tilted -3°, natural grounded recital stance.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    // Full body kinetic chain: hips, legs, feet
    setBoneEuler(vrm, 'hips' as VRMHumanBoneName, 0.02, 0.04, -0.05); // Left hip loaded
    setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, -0.04, 0.02, 0.04);
    setBoneEuler(vrm, 'leftLowerLeg' as VRMHumanBoneName, 0.08, 0.0, 0.0);
    setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, 0.06, -0.06, -0.08); // Relaxed trailing leg
    setBoneEuler(vrm, 'rightLowerLeg' as VRMHumanBoneName, 0.14, 0.0, 0.0);

    // Torso counterbalancing
    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.02, 0.03, 0.03);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.03, 0.02);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.07, 0.26, 0.05, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.13, 0.30, 0.07, 'YXZ');
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.04, -0.02, 0.06);

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    const violinDirY = new THREE.Vector3(0.40, 0.15, 0.90).normalize();
    const violinDirZ = new THREE.Vector3(-0.35, 0.88, -0.31).normalize();
    const violinDirX = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    violinDirZ.crossVectors(violinDirX, violinDirY).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(violinDirX, violinDirY, violinDirZ);
    const violinWorldQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    const chinRestLocal = new THREE.Vector3(-0.048, -0.155, 0.040);
    const violinWorldPos = jawPos.clone().sub(chinRestLocal.clone().applyQuaternion(violinWorldQuat));

    violin.position.copy(violinWorldPos);
    violin.quaternion.copy(violinWorldQuat);
    violin.updateMatrixWorld(true);

    const leftHandTarget = new THREE.Vector3(0, 0.205, 0.005).applyMatrix4(violin.matrixWorld);
    const leftElbowHint = new THREE.Vector3(0.38, -0.82, 0.42).normalize();
    const leftUA = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName)!;
    const leftLA = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName)!;
    const leftH = vrm.humanoid?.getNormalizedBoneNode('leftHand' as VRMHumanBoneName)!;

    solveTwoBoneIK(leftUA, leftLA, leftH, leftHandTarget, leftElbowHint, true);
    poseFingersLeftClassical(vrm);

    const bowContactPos = new THREE.Vector3(0, 0.045, 0.045).applyMatrix4(violin.matrixWorld);
    const bowingDir = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    const bowUp = bowingDir.clone();
    const bowFwd = violinDirZ.clone().negate();
    const bowR = new THREE.Vector3().crossVectors(bowUp, bowFwd).normalize();
    const bowWorldMat = new THREE.Matrix4().makeBasis(bowR, bowUp, bowFwd);

    bow.position.copy(bowContactPos.clone().addScaledVector(bowUp, 0.10));
    bow.quaternion.setFromRotationMatrix(bowWorldMat);
    bow.updateMatrixWorld(true);

    const rightHandTarget = new THREE.Vector3(0, -0.26, 0).applyMatrix4(bow.matrixWorld);
    const rightUA = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName)!;
    const rightLA = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName)!;
    const rightH = vrm.humanoid?.getNormalizedBoneNode('rightHand' as VRMHumanBoneName)!;

    const rightElbowHint = new THREE.Vector3(-0.65, -0.60, 0.45).normalize();
    solveTwoBoneIK(rightUA, rightLA, rightH, rightHandTarget, rightElbowHint, false);
    poseFingersRightPronated(vrm);

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
