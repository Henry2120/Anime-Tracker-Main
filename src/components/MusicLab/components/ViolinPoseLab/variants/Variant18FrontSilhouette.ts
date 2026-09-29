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

export const Variant18FrontSilhouette: ViolinPoseVariant = {
  id: 18,
  numberStr: '18',
  name: 'Front-Silhouette Negative Space',
  poseMethod: 'Coronal Silhouette & Negative Space Framing',
  referenceName: 'Concert Poster Graphic Silhouette Study',
  referenceUrl: 'https://en.wikipedia.org/wiki/Violin',
  creator: 'Silhouette Design & Aesthetic Framing',
  license: 'Graphic Silhouette Standard',
  sourceAssetBundled: false,
  shortDescription: 'Constructed to produce the cleanest 2D front silhouette with crisp negative spaces under both arms.',
  visibleDifferences: 'Maximum graphic silhouette separation: wide negative space triangles under both armpits, unoccluded view of the face and violin f-holes from the front camera.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.01, 0.03, 0.0);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.03, -0.01);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.07, 0.26, 0.05, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.12, 0.30, 0.07, 'YXZ');
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.05, -0.02, 0.06);

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // Instrument oriented to present soundboard clearly to front
    const violinDirY = new THREE.Vector3(0.44, 0.16, 0.88).normalize();
    const violinDirZ = new THREE.Vector3(-0.32, 0.90, -0.28).normalize();
    const violinDirX = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    violinDirZ.crossVectors(violinDirX, violinDirY).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(violinDirX, violinDirY, violinDirZ);
    const violinWorldQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    const chinRestLocal = new THREE.Vector3(-0.048, -0.155, 0.040);
    const violinWorldPos = jawPos.clone().sub(chinRestLocal.clone().applyQuaternion(violinWorldQuat));

    violin.position.copy(violinWorldPos);
    violin.quaternion.copy(violinWorldQuat);
    violin.updateMatrixWorld(true);

    // Wide triangular left elbow
    const leftHandTarget = new THREE.Vector3(0, 0.205, 0.005).applyMatrix4(violin.matrixWorld);
    const leftElbowHint = new THREE.Vector3(0.52, -0.76, 0.38).normalize();
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

    bow.position.copy(bowContactPos.clone().addScaledVector(bowUp, 0.08));
    bow.quaternion.setFromRotationMatrix(bowWorldMat);
    bow.updateMatrixWorld(true);

    const rightHandTarget = new THREE.Vector3(0, -0.26, 0).applyMatrix4(bow.matrixWorld);
    const rightUA = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName)!;
    const rightLA = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName)!;
    const rightH = vrm.humanoid?.getNormalizedBoneNode('rightHand' as VRMHumanBoneName)!;

    const rightElbowHint = new THREE.Vector3(-0.75, -0.55, 0.38).normalize(); // Wide front elbow span
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
