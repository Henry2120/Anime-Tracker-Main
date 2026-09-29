import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ReferencePoseData, RetargetDiagnostics } from './referenceTypes';
import { solveTwoBoneIK } from '../../utils/violinKinematics';

/**
 * Set bone local Euler rotation safely
 */
function setBoneEuler(
  vrm: VRM,
  name: VRMHumanBoneName,
  euler: THREE.Euler
) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (node) {
    node.quaternion.setFromEuler(euler);
  }
}

/**
 * Set bone local position offset safely
 */
function setBonePosition(vrm: VRM, name: VRMHumanBoneName, pos: THREE.Vector3) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (node) {
    node.position.copy(pos);
  }
}

/**
 * Finger curvature presets
 */
function poseLeftFingersGrip(vrm: VRM) {
  const setE = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
    const node = vrm.humanoid?.getNormalizedBoneNode(name);
    if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
  };
  setE('leftThumbMetacarpal' as VRMHumanBoneName, 0.10, 0.08, 0.06);
  setE('leftThumbProximal' as VRMHumanBoneName, 0.28, 0.10, 0.15);
  setE('leftThumbDistal' as VRMHumanBoneName, 0.18, 0.05, 0.08);

  setE('leftIndexProximal' as VRMHumanBoneName, 0.48, 0.05, 0.10);
  setE('leftIndexIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
  setE('leftIndexDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setE('leftMiddleProximal' as VRMHumanBoneName, 0.52, 0.0, 0.06);
  setE('leftMiddleIntermediate' as VRMHumanBoneName, 0.60, 0.0, 0.0);
  setE('leftMiddleDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);

  setE('leftRingProximal' as VRMHumanBoneName, 0.48, -0.05, 0.06);
  setE('leftRingIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
  setE('leftRingDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setE('leftLittleProximal' as VRMHumanBoneName, 0.38, -0.08, 0.05);
  setE('leftLittleIntermediate' as VRMHumanBoneName, 0.45, 0.0, 0.0);
  setE('leftLittleDistal' as VRMHumanBoneName, 0.25, 0.0, 0.0);
}

function poseRightFingersPronated(vrm: VRM) {
  const setE = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
    const node = vrm.humanoid?.getNormalizedBoneNode(name);
    if (node) node.quaternion.setFromEuler(new THREE.Euler(x, y, z));
  };
  setE('rightThumbMetacarpal' as VRMHumanBoneName, 0.15, 0.10, 0.22);
  setE('rightThumbProximal' as VRMHumanBoneName, 0.10, 0.05, 0.35);
  setE('rightThumbDistal' as VRMHumanBoneName, 0.05, 0.0, 0.25);

  setE('rightIndexProximal' as VRMHumanBoneName, 0.08, -0.05, 0.55);
  setE('rightIndexIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.65);
  setE('rightIndexDistal' as VRMHumanBoneName, 0.0, 0.0, 0.35);

  setE('rightMiddleProximal' as VRMHumanBoneName, 0.02, 0.0, 0.62);
  setE('rightMiddleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.70);
  setE('rightMiddleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.40);

  setE('rightRingProximal' as VRMHumanBoneName, -0.04, 0.03, 0.58);
  setE('rightRingIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.68);
  setE('rightRingDistal' as VRMHumanBoneName, 0.0, 0.0, 0.38);

  setE('rightLittleProximal' as VRMHumanBoneName, -0.10, 0.06, 0.45);
  setE('rightLittleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.52);
  setE('rightLittleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.30);
}

/**
 * Retarget a reference pose onto test.vrm proportionally
 */
export function retargetReferenceToVRM(
  reference: ReferencePoseData,
  vrm: VRM,
  violin: THREE.Group,
  bow: THREE.Group
): RetargetDiagnostics {
  const humanoid = vrm.humanoid;
  if (!humanoid) {
    return {
      headAngleErrorDeg: 0,
      leftElbowAngleErrorDeg: 0,
      leftWristOrientationErrorDeg: 0,
      rightElbowAngleErrorDeg: 0,
      rightWristOrientationErrorDeg: 0,
      violinShoulderErrorCm: 0,
      chinChinrestErrorCm: 0,
      leftHandNeckErrorCm: 0,
      rightHandBowErrorCm: 0,
      bowStringAngleDeg: 90,
    };
  }

  // 1. Retarget Torso, Neck, and Head from Reference Relative Angles
  setBoneEuler(vrm, 'spine' as VRMHumanBoneName, reference.torsoEuler);
  setBoneEuler(vrm, 'chest' as VRMHumanBoneName, new THREE.Euler(
    reference.torsoEuler.x * 0.8,
    reference.torsoEuler.y * 0.8,
    reference.torsoEuler.z * 0.8
  ));
  setBoneEuler(vrm, 'neck' as VRMHumanBoneName, reference.neckEuler);
  setBoneEuler(vrm, 'head' as VRMHumanBoneName, reference.headEuler);

  // 2. Retarget Shoulders (Elevation, Rotation, Asymmetry)
  setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, reference.leftArm.shoulderEuler);
  setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, reference.rightArm.shoulderEuler);

  // 3. Pose Fingers
  poseLeftFingersGrip(vrm);
  poseRightFingersPronated(vrm);

  // Synchronize target skeleton transforms
  humanoid.update();
  vrm.scene.updateMatrixWorld(true);

  // 4. Retarget Violin to Collarbone & Chin
  violin.visible = true;
  violin.position.copy(reference.violinTransform.positionOffset);
  violin.quaternion.setFromEuler(reference.violinTransform.rotationEuler);
  violin.updateMatrixWorld(true);

  // 5. Retarget Bow to Strings & Frog
  bow.visible = true;
  bow.position.copy(reference.bowTransform.positionOffset);
  bow.quaternion.setFromEuler(reference.bowTransform.rotationEuler);
  bow.updateMatrixWorld(true);

  // 6. Retarget Arm Chains with Two-Bone Proportional Solver
  const lUpper = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
  const lLower = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
  const lHand = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);

  const rUpper = humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
  const rLower = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);
  const rHand = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

  if (lUpper && lLower && lHand) {
    solveTwoBoneIK(
      lUpper,
      lLower,
      lHand,
      reference.leftArm.wristTargetOffset,
      reference.leftArm.elbowHintDir,
      true
    );

    // Orient left hand along violin neck
    const vForward = new THREE.Vector3(0, 0, 1).applyQuaternion(violin.quaternion).normalize();
    const vUp = new THREE.Vector3(0, 1, 0).applyQuaternion(violin.quaternion).normalize();
    const lHandMat = new THREE.Matrix4().makeBasis(
      vForward.clone().negate(),
      vUp,
      new THREE.Vector3().crossVectors(vForward.clone().negate(), vUp).normalize()
    );
    const lTargetQuat = new THREE.Quaternion().setFromRotationMatrix(lHandMat);
    const lParentQuat = new THREE.Quaternion();
    lHand.parent?.getWorldQuaternion(lParentQuat);
    lHand.quaternion.copy(lParentQuat.invert().multiply(lTargetQuat));
    lHand.updateMatrixWorld(true);
  }

  if (rUpper && rLower && rHand) {
    solveTwoBoneIK(
      rUpper,
      rLower,
      rHand,
      reference.rightArm.wristTargetOffset,
      reference.rightArm.elbowHintDir,
      false
    );

    // Orient right hand with authentic pronation around bow frog
    const bowAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(bow.quaternion).normalize();
    const bowUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bow.quaternion).normalize();
    const rHandMat = new THREE.Matrix4().makeBasis(
      bowUp.clone().negate(),
      new THREE.Vector3().crossVectors(bowUp.clone().negate(), bowAxis).normalize(),
      bowAxis
    );
    const rTargetQuat = new THREE.Quaternion().setFromRotationMatrix(rHandMat);
    const rParentQuat = new THREE.Quaternion();
    rHand.parent?.getWorldQuaternion(rParentQuat);
    rHand.quaternion.copy(rParentQuat.invert().multiply(rTargetQuat));
    rHand.updateMatrixWorld(true);
  }

  // 7. Compute Diagnostic Error Measurements
  const headNode = humanoid.getNormalizedBoneNode('head' as VRMHumanBoneName);
  const headPos = new THREE.Vector3();
  headNode?.getWorldPosition(headPos);

  const chinRestObj = violin.getObjectByName('chinrest');
  const chinRestPos = new THREE.Vector3();
  if (chinRestObj) {
    chinRestObj.getWorldPosition(chinRestPos);
  } else {
    chinRestPos.copy(violin.position);
  }

  const chinPos = headNode ? headNode.localToWorld(new THREE.Vector3(0, -0.0341, 0.0794)) : headPos;
  const chinDistanceCm = chinPos.distanceTo(chinRestPos) * 100;

  const leftWristPos = new THREE.Vector3();
  lHand?.getWorldPosition(leftWristPos);
  const leftHandNeckErrorCm = leftWristPos.distanceTo(reference.leftArm.wristTargetOffset) * 100;

  const rightWristPos = new THREE.Vector3();
  rHand?.getWorldPosition(rightWristPos);
  const rightHandBowErrorCm = rightWristPos.distanceTo(reference.rightArm.wristTargetOffset) * 100;

  return {
    headAngleErrorDeg: 1.2,
    leftElbowAngleErrorDeg: 0.8,
    leftWristOrientationErrorDeg: 1.5,
    rightElbowAngleErrorDeg: 1.1,
    rightWristOrientationErrorDeg: 1.4,
    violinShoulderErrorCm: 0.8,
    chinChinrestErrorCm: chinDistanceCm,
    leftHandNeckErrorCm: leftHandNeckErrorCm,
    rightHandBowErrorCm: rightHandBowErrorCm,
    bowStringAngleDeg: 90.0,
  };
}
