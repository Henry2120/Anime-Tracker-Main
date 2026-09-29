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

export const Variant02FemaleReference: ViolinPoseVariant = {
  id: 2,
  numberStr: '02',
  name: 'Female Reference B (Darek)',
  poseMethod: 'Forward-Pitch Model Transfer',
  referenceName: 'Violinist by Darek (Standing Classical Musician)',
  referenceUrl: 'https://sketchfab.com/3d-models/violinist-darek',
  creator: 'Darek',
  license: 'CC-BY Reference Study',
  sourceAssetBundled: false,
  shortDescription: 'Transferred from Darek’s standing classical violinist model featuring a prominent forward torso lean.',
  visibleDifferences: '7° forward torso pitch, violin held wider across the chest (50° azimuth), distinctly lower left elbow hanging closer to the torso, bow contacting closer to tip.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    // Torso with forward pitch and leftward yaw
    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.08, 0.05, -0.02);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.06, 0.04, -0.01);
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.06, -0.01, 0.08);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.06, 0.32, 0.04, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.12, 0.36, 0.06, 'YXZ');

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // Wider 50° violin azimuth
    const violinDirY = new THREE.Vector3(0.50, 0.10, 0.86).normalize();
    const violinDirZ = new THREE.Vector3(-0.28, 0.92, -0.26).normalize();
    const violinDirX = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    violinDirZ.crossVectors(violinDirX, violinDirY).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(violinDirX, violinDirY, violinDirZ);
    const violinWorldQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    const chinRestLocal = new THREE.Vector3(-0.048, -0.155, 0.040);
    const violinWorldPos = jawPos.clone().sub(chinRestLocal.clone().applyQuaternion(violinWorldQuat));

    violin.position.copy(violinWorldPos);
    violin.quaternion.copy(violinWorldQuat);
    violin.updateMatrixWorld(true);

    // Left Arm: lower elbow hanging closer
    const leftHandTarget = new THREE.Vector3(0, 0.205, 0.005).applyMatrix4(violin.matrixWorld);
    const leftElbowHint = new THREE.Vector3(0.25, -0.92, 0.28).normalize();
    const leftUA = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName)!;
    const leftLA = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName)!;
    const leftH = vrm.humanoid?.getNormalizedBoneNode('leftHand' as VRMHumanBoneName)!;

    solveTwoBoneIK(leftUA, leftLA, leftH, leftHandTarget, leftElbowHint, true);
    poseFingersLeftClassical(vrm);

    // Bow contacting closer to the upper third (tip stroke)
    const bowContactPos = new THREE.Vector3(0, 0.045, 0.045).applyMatrix4(violin.matrixWorld);
    const bowingDir = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    const bowUp = bowingDir.clone();
    const bowFwd = violinDirZ.clone().negate();
    const bowR = new THREE.Vector3().crossVectors(bowUp, bowFwd).normalize();
    const bowWorldMat = new THREE.Matrix4().makeBasis(bowR, bowUp, bowFwd);

    bow.position.copy(bowContactPos.clone().addScaledVector(bowUp, -0.12)); // Tip stroke position
    bow.quaternion.setFromRotationMatrix(bowWorldMat);
    bow.updateMatrixWorld(true);

    const rightHandTarget = new THREE.Vector3(0, -0.26, 0).applyMatrix4(bow.matrixWorld);
    const rightUA = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName)!;
    const rightLA = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName)!;
    const rightH = vrm.humanoid?.getNormalizedBoneNode('rightHand' as VRMHumanBoneName)!;

    const rightElbowHint = new THREE.Vector3(-0.55, -0.72, 0.40).normalize();
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
