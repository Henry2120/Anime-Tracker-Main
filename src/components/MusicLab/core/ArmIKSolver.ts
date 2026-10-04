import * as THREE from 'three';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { ArmIKSolution, HandInteractionFrame, FingerTargets } from './types';

export type ArmSide = 'left' | 'right';

/**
 * Analytical Two-Bone Arm Inverse Kinematics Solver
 * Solves Shoulder -> Upper Arm -> Elbow -> Forearm -> Wrist.
 *
 * CRITICAL HIERARCHY FIX:
 * In a 3D skeletal hierarchy, lowerArm is a child of upperArm, and hand is a child of lowerArm.
 * To achieve the desired world-space orientation on lowerArm and hand, their local quaternions
 * must be multiplied by the inverse of their parent's world quaternion:
 *   qLowerLocal = qUpperWorld⁻¹ * qLowerWorld
 *   qHandLocal = qLowerWorld⁻¹ * qHandWorld
 */
export class ArmIKSolver {
  /**
   * Solves arm kinematics for either left or right arm.
   */
  public static solveArmIK(
    side: ArmSide,
    shoulderPos: THREE.Vector3,
    targetWristPos: THREE.Vector3,
    upperArmLength: number,
    forearmLength: number,
    poleDirection: THREE.Vector3
  ): ArmIKSolution {
    const isLeft = side === 'left';
    // Canonical reference bone vector in standard VRM T-pose:
    // Left arm extends along +X; right arm extends along -X
    const refBoneDir = new THREE.Vector3(isLeft ? 1 : -1, 0, 0);

    const D = new THREE.Vector3().subVectors(targetWristPos, shoulderPos);
    const targetDist = D.length();
    const maxReach = upperArmLength + forearmLength;
    const minReach = Math.abs(upperArmLength - forearmLength) + 0.03;

    // Hyperextension prevention: clamp target distance slightly inside maximum reach
    const isHyperextended = targetDist >= maxReach * 0.985;
    const clampedDist = THREE.MathUtils.clamp(targetDist, minReach, maxReach * 0.985);
    const d = clampedDist;
    const dirUnit = D.clone().normalize();

    // 1. Law of Cosines for Shoulder Angle (alpha) and Elbow Flexion Angle (gamma)
    const cosAlpha = THREE.MathUtils.clamp(
      (upperArmLength * upperArmLength + d * d - forearmLength * forearmLength) /
        (2 * upperArmLength * d),
      -1,
      1
    );
    const alpha = Math.acos(cosAlpha);

    const cosGamma = THREE.MathUtils.clamp(
      (upperArmLength * upperArmLength + forearmLength * forearmLength - d * d) /
        (2 * upperArmLength * forearmLength),
      -1,
      1
    );
    const gamma = Math.acos(cosGamma);
    const elbowAngleDeg = parseFloat((180 - (gamma * 180) / Math.PI).toFixed(1));

    // 2. Swivel / Arm Plane Determination
    let planeNormal = new THREE.Vector3().crossVectors(dirUnit, poleDirection).normalize();
    if (planeNormal.lengthSq() < 0.001) {
      planeNormal = new THREE.Vector3(0, 1, 0).cross(dirUnit).normalize();
    }

    // Vector in the arm plane perpendicular to dirUnit pointing toward elbow
    const elbowOffsetDir = new THREE.Vector3().crossVectors(planeNormal, dirUnit).normalize();
    if (elbowOffsetDir.dot(poleDirection) < 0) {
      elbowOffsetDir.negate();
      planeNormal.negate();
    }

    // 3. Exact Elbow Position in World Space
    const elbowPos = shoulderPos
      .clone()
      .addScaledVector(dirUnit, upperArmLength * Math.cos(alpha))
      .addScaledVector(elbowOffsetDir, upperArmLength * Math.sin(alpha));

    // 4. Achieved Wrist Position
    const achievedWristPos = elbowPos
      .clone()
      .addScaledVector(new THREE.Vector3().subVectors(targetWristPos, elbowPos).normalize(), forearmLength);

    // 5. Upper Arm World Rotation Quaternion
    const upperArmDir = new THREE.Vector3().subVectors(elbowPos, shoulderPos).normalize();
    const upperArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(refBoneDir, upperArmDir);

    // Roll alignment with elbow swivel plane
    const curUp = new THREE.Vector3(0, 1, 0).applyQuaternion(upperArmWorldQuat);
    const desiredUp = elbowOffsetDir.clone();
    const projCurUp = curUp.clone().addScaledVector(upperArmDir, -curUp.dot(upperArmDir)).normalize();
    const projDesiredUp = desiredUp.clone().addScaledVector(upperArmDir, -desiredUp.dot(upperArmDir)).normalize();
    if (projCurUp.lengthSq() > 0.01 && projDesiredUp.lengthSq() > 0.01) {
      const qRoll = new THREE.Quaternion().setFromUnitVectors(projCurUp, projDesiredUp);
      upperArmWorldQuat.premultiply(qRoll);
    }

    // 6. Forearm / Lower Arm World Rotation Quaternion
    const lowerArmDir = new THREE.Vector3().subVectors(achievedWristPos, elbowPos).normalize();
    const lowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(refBoneDir, lowerArmDir);

    // 7. CRITICAL: SKELETAL LOCAL ROTATIONS
    // lowerArm local rotation is parented to upperArm
    const lowerArmLocalQuat = upperArmWorldQuat.clone().invert().multiply(lowerArmWorldQuat);

    const isReachable = targetDist <= maxReach;
    const reachRatio = parseFloat((targetDist / maxReach).toFixed(3));

    return {
      upperArmQuat: upperArmWorldQuat,
      lowerArmQuat: lowerArmLocalQuat,
      handQuat: new THREE.Quaternion(), // Will be solved relative to lowerArmWorldQuat
      shoulderPos: shoulderPos.clone(),
      elbowPos,
      wristPos: achievedWristPos,
      targetPos: targetWristPos.clone(),
      targetDistance: parseFloat(targetDist.toFixed(4)),
      maxReach: parseFloat(maxReach.toFixed(4)),
      reachRatio,
      isReachable,
      isHyperextended,
      elbowAngleDeg,
    };
  }

  /**
   * Independently solves Wrist and Palm Orientation (Phase 9).
   * Returns the LOCAL quaternion for the hand bone, relative to lowerArm's world orientation.
   */
  public static solveHandOrientation(
    side: ArmSide,
    handInteractionFrame: HandInteractionFrame,
    lowerArmWorldQuat: THREE.Quaternion
  ): THREE.Quaternion {
    // Desired world orientation for the hand
    const targetWorldQuat = handInteractionFrame.grip.quaternion.clone();

    // Hand bone is child of lowerArm: local quat = lowerArmWorld⁻¹ * handWorld
    const handLocalQuat = lowerArmWorldQuat.clone().invert().multiply(targetWorldQuat);
    return handLocalQuat;
  }

  /**
   * Applies finger joint curls to the character model (Phase 10)
   */
  public static applyFingerPoses(
    adapter: VRMHumanoidAdapter,
    side: ArmSide,
    targets: FingerTargets
  ): void {
    const prefix = side === 'left' ? 'left' : 'right';
    const isLeft = side === 'left';
    const curlSign = isLeft ? 1 : -1;

    const setFlexion = (boneName: any, angleDeg: number, oppositionDeg = 0) => {
      const rad = THREE.MathUtils.degToRad(angleDeg);
      const oppRad = THREE.MathUtils.degToRad(oppositionDeg);
      const node = adapter.getBoneNode(boneName);
      if (node) {
        const euler = new THREE.Euler(0, oppRad, rad * curlSign, 'YXZ');
        node.quaternion.setFromEuler(euler);
      }
    };

    // Thumb: opposition + progressive flexion
    const thumbOpp = targets.thumbOpposition * 50;
    const thumbFlex = targets.thumbCurl * 45;
    setFlexion(`${prefix}ThumbMetacarpal` as any, thumbFlex * 0.4, thumbOpp);
    setFlexion(`${prefix}ThumbProximal` as any, thumbFlex * 0.6, thumbOpp * 0.5);
    setFlexion(`${prefix}ThumbDistal` as any, thumbFlex * 0.8, 0);

    // Index Finger
    const idxFlex = targets.indexCurl * 80;
    setFlexion(`${prefix}IndexProximal` as any, idxFlex * 0.5);
    setFlexion(`${prefix}IndexIntermediate` as any, idxFlex * 0.6);
    setFlexion(`${prefix}IndexDistal` as any, idxFlex * 0.4);

    // Middle Finger
    const midFlex = targets.middleCurl * 85;
    setFlexion(`${prefix}MiddleProximal` as any, midFlex * 0.5);
    setFlexion(`${prefix}MiddleIntermediate` as any, midFlex * 0.6);
    setFlexion(`${prefix}MiddleDistal` as any, midFlex * 0.4);

    // Ring Finger
    const ringFlex = targets.ringCurl * 80;
    setFlexion(`${prefix}RingProximal` as any, ringFlex * 0.5);
    setFlexion(`${prefix}RingIntermediate` as any, ringFlex * 0.6);
    setFlexion(`${prefix}RingDistal` as any, ringFlex * 0.4);

    // Little Finger (Pinky)
    const litFlex = targets.littleCurl * 70;
    setFlexion(`${prefix}LittleProximal` as any, litFlex * 0.45);
    setFlexion(`${prefix}LittleIntermediate` as any, litFlex * 0.55);
    setFlexion(`${prefix}LittleDistal` as any, litFlex * 0.4);
  }
}
