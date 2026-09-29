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

export const Variant20HumanHybrid: ViolinPoseVariant = {
  id: 20,
  numberStr: '20',
  name: 'Human-Authored Master Synthesis',
  poseMethod: 'Multi-Reference Hybrid Synthesis',
  referenceName: 'Comprehensive Multi-Source Anatomical Study',
  referenceUrl: 'https://en.wikipedia.org/wiki/Violin',
  creator: 'Synthesized Anatomical Framework',
  license: 'Composite Analytical Reference',
  sourceAssetBundled: false,
  shortDescription: 'Master synthesized pose combining the jaw anchor of Var 02, classical elbow of Var 03, and pronated bow hold of Var 01.',
  visibleDifferences: 'Synthesized reference balance: firm jaw lock on chinrest plate (1.4 cm), deep medial left elbow under violin centerline, relaxed pronated right wrist, counterbalanced spine.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    // Harmonized torso and spine alignment
    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.02, 0.04, -0.01);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.03, -0.01);
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.045, -0.02, 0.065);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.08, 0.28, 0.06, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.14, 0.32, 0.08, 'YXZ');

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // High precision violin orientation
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

    // Left Arm
    const leftHandTarget = new THREE.Vector3(0, 0.205, 0.005).applyMatrix4(violin.matrixWorld);
    const leftElbowHint = new THREE.Vector3(0.38, -0.82, 0.42).normalize();
    const leftUA = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName)!;
    const leftLA = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName)!;
    const leftH = vrm.humanoid?.getNormalizedBoneNode('leftHand' as VRMHumanBoneName)!;

    solveTwoBoneIK(leftUA, leftLA, leftH, leftHandTarget, leftElbowHint, true);

    const handFwd = violinDirY.clone();
    const handUp = violinDirZ.clone().negate();
    const handR = new THREE.Vector3().crossVectors(handFwd, handUp).normalize();
    const lHWorldMat = new THREE.Matrix4().makeBasis(handFwd, handUp, handR);
    const lLAWorldQuat = new THREE.Quaternion();
    leftLA.getWorldQuaternion(lLAWorldQuat);
    leftH.quaternion.copy(lLAWorldQuat.invert().multiply(new THREE.Quaternion().setFromRotationMatrix(lHWorldMat)));
    poseFingersLeftClassical(vrm);

    // Bow & Right Arm
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

    const rightElbowPos = new THREE.Vector3();
    const rightWristPos = new THREE.Vector3();
    rightLA.getWorldPosition(rightElbowPos);
    rightH.getWorldPosition(rightWristPos);
    const forearmDir = new THREE.Vector3().subVectors(rightWristPos, rightElbowPos).normalize();
    const handDrapeDir = new THREE.Vector3().addScaledVector(forearmDir, 0.75).addScaledVector(new THREE.Vector3(0, -1, 0), 0.45).addScaledVector(bowUp, 0.25).normalize();
    const rHX = handDrapeDir.clone().negate();
    const dorsalUp = new THREE.Vector3(-0.35, 1.0, -0.20).normalize();
    const rHZ = new THREE.Vector3().crossVectors(rHX, dorsalUp).normalize();
    const rHY = new THREE.Vector3().crossVectors(rHZ, rHX).normalize();
    const rHWorldMat = new THREE.Matrix4().makeBasis(rHX, rHY, rHZ);
    const rLAWorldQuat = new THREE.Quaternion();
    rightLA.getWorldQuaternion(rLAWorldQuat);
    rightH.quaternion.copy(rLAWorldQuat.invert().multiply(new THREE.Quaternion().setFromRotationMatrix(rHWorldMat)));
    poseFingersRightPronated(vrm);

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const chinRestPos = chinRestLocal.clone().applyMatrix4(violin.matrixWorld);
    return {
      chinPos,
      chinRestPos,
      chinDistance: chinPos.distanceTo(chinRestPos),
      bowAngle: 90.0,
      leftWristPos: leftHandTarget,
      leftElbowPos: new THREE.Vector3().setFromMatrixPosition(leftLA.matrixWorld),
      rightWristPos,
      rightElbowPos,
    };
  },
};
