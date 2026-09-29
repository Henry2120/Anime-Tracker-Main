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

export const Variant17SideViewPriority: ViolinPoseVariant = {
  id: 17,
  numberStr: '17',
  name: 'Side-View Depth Priority',
  poseMethod: 'Sagittal Plane Profile Optimization',
  referenceName: 'Profile-View Orthographic Classical Performance',
  referenceUrl: 'https://en.wikipedia.org/wiki/Violin',
  creator: 'Sagittal Profile Kinematics Study',
  license: 'Biomechanical Profile Model',
  sourceAssetBundled: false,
  shortDescription: 'Constructed specifically to optimize depth relationships when viewed directly from the left or right profile.',
  visibleDifferences: 'Distinct forward head projection, deep instrument tuck into the neck notch, right elbow drawn back in deep bowing trajectory, clear forearm separation from torso.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.05, 0.04, 0.0);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.04, 0.03, -0.01);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.08, 0.28, 0.06, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.16, 0.32, 0.08, 'YXZ');
    setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.05, -0.02, 0.06);

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // Violin positioned with prominent forward depth
    const violinDirY = new THREE.Vector3(0.38, 0.16, 0.91).normalize();
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
    const leftElbowHint = new THREE.Vector3(0.32, -0.80, 0.50).normalize(); // Pushed forward in Z
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

    const rightElbowHint = new THREE.Vector3(-0.55, -0.62, 0.55).normalize(); // Deep Z elbow
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
