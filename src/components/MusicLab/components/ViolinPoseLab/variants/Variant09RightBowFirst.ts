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

export const Variant09RightBowFirst: ViolinPoseVariant = {
  id: 9,
  numberStr: '09',
  name: 'Right-Bow-First Fitting',
  poseMethod: 'Bow-Grip Driven Kinematics',
  referenceName: 'Bowing Plane Master Pose Dataset',
  referenceUrl: 'https://en.wikipedia.org/wiki/Bowing_(music)',
  creator: 'Violin Right-Arm Kinematics Study',
  license: 'Bowing Pedagogy Standard',
  sourceAssetBundled: false,
  shortDescription: 'Constructed around a deep down-bow frog grip, forcing the right shoulder and torso into a low bowing plane.',
  visibleDifferences: 'Deep down-bow frog position close to the body, flexed right wrist with strong pronation, lower right elbow, violin rolled clockwise into the bowing trajectory.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = true;
    bow.visible = true;

    // Torso angled to support lower bowing plane
    setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.02, 0.02, -0.03);
    setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.02, -0.02);
    setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.08, 0.28, 0.06, 'YXZ');
    setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.14, 0.32, 0.08, 'YXZ');
    setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.04, -0.02, -0.02); // Dropped right shoulder

    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const head = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName)!;
    const chinPos = REST_CHIN_LOCAL.clone().applyMatrix4(head.matrixWorld);
    const jawPos = REST_LEFT_JAW_LOCAL.clone().applyMatrix4(head.matrixWorld);

    // Violin rolled slightly more clockwise (strings facing more toward right hand)
    const violinDirY = new THREE.Vector3(0.40, 0.14, 0.90).normalize();
    const violinDirZ = new THREE.Vector3(-0.42, 0.85, -0.32).normalize();
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
    const leftElbowHint = new THREE.Vector3(0.36, -0.85, 0.38).normalize();
    const leftUA = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName)!;
    const leftLA = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName)!;
    const leftH = vrm.humanoid?.getNormalizedBoneNode('leftHand' as VRMHumanBoneName)!;

    solveTwoBoneIK(leftUA, leftLA, leftH, leftHandTarget, leftElbowHint, true);
    poseFingersLeftClassical(vrm);

    // Bow: deep frog contact position (+0.24m down the stick)
    const bowContactPos = new THREE.Vector3(0, 0.045, 0.045).applyMatrix4(violin.matrixWorld);
    const bowingDir = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();
    const bowUp = bowingDir.clone();
    const bowFwd = violinDirZ.clone().negate();
    const bowR = new THREE.Vector3().crossVectors(bowUp, bowFwd).normalize();
    const bowWorldMat = new THREE.Matrix4().makeBasis(bowR, bowUp, bowFwd);

    bow.position.copy(bowContactPos.clone().addScaledVector(bowUp, 0.24)); // Deep frog stroke
    bow.quaternion.setFromRotationMatrix(bowWorldMat);
    bow.updateMatrixWorld(true);

    const rightHandTarget = new THREE.Vector3(0, -0.26, 0).applyMatrix4(bow.matrixWorld);
    const rightUA = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName)!;
    const rightLA = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName)!;
    const rightH = vrm.humanoid?.getNormalizedBoneNode('rightHand' as VRMHumanBoneName)!;

    const rightElbowHint = new THREE.Vector3(-0.58, -0.75, 0.32).normalize(); // Low dropped bowing elbow
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
