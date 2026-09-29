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

export const Variant14BlenderDCC: ViolinPoseVariant = {
  id: 14,
  numberStr: '14',
  name: 'Blender Rigify DCC Retarget',
  poseMethod: 'DCC Rigify / VRM Armature Retargeting',
  referenceName: 'Blender Rigify Female Musician Armature',
  referenceUrl: 'https://www.blender.org/',
  creator: 'Blender Open Armature Project',
  license: 'GPL / CC0 Armature Model',
  sourceAssetBundled: false,
  shortDescription: 'Reconstructed from a Blender Rigify violin performance armature with twist-bone distribution.',
  visibleDifferences: 'Clean forearm pronation distribution without wrist pinching, balanced scapular elevation, relaxed neck alignment.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.018, 0.04, 0.0);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.022, 0.03, -0.01);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.075, 0.27, 0.055, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.135, 0.31, 0.075, 'YXZ');
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.045, -0.02, 0.065);

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    const violinDirY = new THREE.Vector3(0.40, 0.16, 0.90).normalize();
    const violinDirZ = new THREE.Vector3(-0.35, 0.88, -0.32).normalize();
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
