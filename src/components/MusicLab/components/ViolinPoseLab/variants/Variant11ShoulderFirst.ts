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

export const Variant11ShoulderFirst: ViolinPoseVariant = {
  id: 11,
  numberStr: '11',
  name: 'Shoulder-First Clavicle Shelf',
  poseMethod: 'Clavicular Shelf Dominant Support',
  referenceName: 'Shoulder-Rest Ergonomic Clavicle Base',
  referenceUrl: 'https://en.wikipedia.org/wiki/Shoulder_rest',
  creator: 'Violin Clavicle Shelf Ergonomics',
  license: 'Ergonomic Support Standard',
  sourceAssetBundled: false,
  shortDescription: 'Constructed by elevating the left shoulder into a firm supporting shelf beneath the lower bout.',
  visibleDifferences: 'Elevated left collarbone and shoulder blade (+8° Z-elevation), flat instrument back sitting securely on the clavicle shelf, more upright head.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    // Elevated left shoulder supporting instrument
    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.01, 0.02, 0.01);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.02, 0.0);
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.08, -0.02, 0.14); // Elevated clavicle shelf
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.06, 0.24, 0.04, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.10, 0.28, 0.05, 'YXZ');

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // Instrument sitting firmly on elevated shoulder shelf
    const violinDirY = new THREE.Vector3(0.42, 0.14, 0.89).normalize();
    const violinDirZ = new THREE.Vector3(-0.34, 0.90, -0.27).normalize();
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
    const leftElbowHint = new THREE.Vector3(0.40, -0.80, 0.44).normalize();
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

    bow.position.copy(bowContactPos.clone().addScaledVector(bowUp, 0.10));
    bow.quaternion.setFromRotationMatrix(bowWorldMat);
    bow.updateMatrixWorld(true);

    const rightHandTarget = new THREE.Vector3(0, -0.26, 0).applyMatrix4(bow.matrixWorld);
    const rightUA = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName)!;
    const rightLA = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName)!;
    const rightH = vrm.humanoid?.getNormalizedBoneNode('rightHand' as VRMHumanBoneName)!;

    const rightElbowHint = new THREE.Vector3(-0.66, -0.58, 0.46).normalize();
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
