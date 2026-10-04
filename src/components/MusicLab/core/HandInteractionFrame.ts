import * as THREE from 'three';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { HandInteractionFrame, Transform3D, FingerTargets } from './types';

/**
 * Hand Interaction Frame Manager
 * Enforces the anatomical hierarchy:
 * Forearm -> Wrist -> Palm -> Fingers -> Actual Grip
 * Prevents treating the wrist as the grip or attachment point!
 */
export class HandInteractionFrameSolver {
  /**
   * Solves the Right Hand Bow Grip Frame.
   * Derives grip center, palm normal, and bow orientation from anatomical landmarks.
   */
  public static solveRightBowGripFrame(
    adapter: VRMHumanoidAdapter,
    wristTransform: Transform3D,
    desiredBowingDirection: THREE.Vector3, // string crossing direction
    violinStringsNormal: THREE.Vector3     // strings face normal
  ): HandInteractionFrame {
    const tempV = new THREE.Vector3();
    const metrics = adapter.computeMetrics();
    const handLen = metrics.handLength.right;

    // Discover anatomical landmarks
    const rWristPos = wristTransform.position.clone();
    const rThumbDistal = adapter.getBoneWorldPosition('rightThumbDistal', new THREE.Vector3());
    const rThumbProximal = adapter.getBoneWorldPosition('rightThumbProximal', new THREE.Vector3());
    const rIndexProx = adapter.getBoneWorldPosition('rightIndexProximal', new THREE.Vector3());
    const rIndexInter = adapter.getBoneWorldPosition('rightIndexIntermediate', new THREE.Vector3());
    const rMiddleProx = adapter.getBoneWorldPosition('rightMiddleProximal', new THREE.Vector3());
    const rMiddleInter = adapter.getBoneWorldPosition('rightMiddleIntermediate', new THREE.Vector3());
    const rLittleProx = adapter.getBoneWorldPosition('rightLittleProximal', new THREE.Vector3());

    // 1. Palm Center & Normal
    // Palm center lies in the metacarpal plane between wrist and knuckles
    const knucklesCenter = new THREE.Vector3();
    if (rIndexProx && rLittleProx) {
      knucklesCenter.addVectors(rIndexProx, rLittleProx).multiplyScalar(0.5);
    } else {
      // Estimated forward along hand direction
      const forwardDir = desiredBowingDirection.clone().cross(violinStringsNormal).normalize();
      knucklesCenter.copy(rWristPos).addScaledVector(forwardDir, handLen * 0.5);
    }

    const palmCenter = new THREE.Vector3().addVectors(rWristPos, knucklesCenter).multiplyScalar(0.5);

    // Palm normal: points outward from palm surface (palmar direction)
    const handLongitudinal = new THREE.Vector3().subVectors(knucklesCenter, rWristPos).normalize();
    const knucklesAxis = new THREE.Vector3();
    if (rIndexProx && rLittleProx) {
      knucklesAxis.subVectors(rIndexProx, rLittleProx).normalize();
    } else {
      knucklesAxis.crossVectors(violinStringsNormal, handLongitudinal).normalize();
    }

    const palmNormal = new THREE.Vector3().crossVectors(handLongitudinal, knucklesAxis).normalize();

    // 2. Authoritative Grip Center
    // The classical bow hold places the stick between the curved thumb tip and index/middle fingers:
    let gripCenter = new THREE.Vector3();
    if (rThumbDistal && (rIndexInter || rMiddleInter)) {
      const opposingFingers = (rIndexInter || rMiddleInter)!;
      // Grip center is the midpoint of the opposition cradle
      gripCenter.addVectors(rThumbDistal, opposingFingers).multiplyScalar(0.5);
    } else if (rThumbProximal && rIndexProx) {
      gripCenter.addVectors(rThumbProximal, rIndexProx).multiplyScalar(0.5);
      gripCenter.addScaledVector(handLongitudinal, handLen * 0.2);
    } else {
      // Geometric fallback using hand length offset from palm
      gripCenter.copy(palmCenter).addScaledVector(handLongitudinal, handLen * 0.25);
    }

    // 3. Grip Orientation Frame
    // Longitudinal axis of bow stick (+Y in bow coordinates) aligns with desired bowing direction
    const bowStickDir = desiredBowingDirection.clone().normalize();
    // Hair faces down into strings (-violinStringsNormal), so +Z is +violinStringsNormal
    const bowUpNormal = violinStringsNormal.clone().normalize();
    // Lateral axis orthogonal to stick and strings
    const bowLateralAxis = new THREE.Vector3().crossVectors(bowStickDir, bowUpNormal).normalize();
    // Ensure strict orthonormal basis
    bowUpNormal.crossVectors(bowLateralAxis, bowStickDir).normalize();

    const gripMat = new THREE.Matrix4().makeBasis(bowLateralAxis, bowStickDir, bowUpNormal);
    gripMat.setPosition(gripCenter);
    const gripQuat = new THREE.Quaternion().setFromRotationMatrix(gripMat);

    // Palm Transform
    const palmMat = new THREE.Matrix4().makeBasis(knucklesAxis, handLongitudinal, palmNormal);
    palmMat.setPosition(palmCenter);
    const palmQuat = new THREE.Quaternion().setFromRotationMatrix(palmMat);

    // Finger targets for bow hold (curved thumb, relaxed draped index, curled middle/ring, pinky on top)
    const fingerTargets: FingerTargets = {
      thumbCurl: 0.65,
      thumbOpposition: 0.60,
      indexCurl: 0.70,
      middleCurl: 0.85,
      ringCurl: 0.80,
      littleCurl: 0.65,
      fingerSpread: 0.15,
    };

    return {
      wrist: {
        position: rWristPos,
        quaternion: wristTransform.quaternion.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      palm: {
        position: palmCenter,
        quaternion: palmQuat,
        scale: new THREE.Vector3(1, 1, 1),
      },
      grip: {
        position: gripCenter,
        quaternion: gripQuat,
        scale: new THREE.Vector3(1, 1, 1),
      },
      fingerTargets,
    };
  }

  /**
   * Solves the Left Hand Violin Neck Support & Grip Frame.
   * Separates wrist from the neck cradle between thumb web and index knuckle.
   */
  public static solveLeftNeckGripFrame(
    adapter: VRMHumanoidAdapter,
    neckTargetPos: THREE.Vector3,        // Violin neck underside target
    violinLongitudinal: THREE.Vector3,   // Axis along fingerboard
    violinTopNormal: THREE.Vector3       // Strings face normal
  ): { frame: HandInteractionFrame; requiredWristPos: THREE.Vector3 } {
    const metrics = adapter.computeMetrics();
    const handLen = metrics.handLength.left;

    // Discover left landmarks
    const lThumbProx = adapter.getBoneWorldPosition('leftThumbProximal', new THREE.Vector3());
    const lIndexProx = adapter.getBoneWorldPosition('leftIndexProximal', new THREE.Vector3());

    // Neck cradle is the V-space between thumb base and index knuckle
    // The violin rests inside this cradle (NOT at the wrist)
    const cradlePos = neckTargetPos.clone();

    // Palm direction: Supinated, facing inward toward neck (+X in local violin space) and upward (+Z)
    const neckSideAxis = new THREE.Vector3().crossVectors(violinLongitudinal, violinTopNormal).normalize();
    const palmFacing = neckSideAxis.clone().multiplyScalar(0.7).addScaledVector(violinTopNormal, 0.7).normalize();

    // From cradle to wrist:
    // Wrist sits down and back along the hand longitudinal axis
    const handLongitudinal = violinLongitudinal.clone().multiplyScalar(-0.4).addScaledVector(violinTopNormal, -0.9).normalize();
    const requiredWristPos = cradlePos.clone().addScaledVector(handLongitudinal, handLen * 0.75);

    // Palm center is midway between wrist and cradle
    const palmCenter = new THREE.Vector3().addVectors(requiredWristPos, cradlePos).multiplyScalar(0.5);

    // Grip frame at the neck cradle
    const gripZ = violinTopNormal.clone();
    const gripY = violinLongitudinal.clone();
    const gripX = new THREE.Vector3().crossVectors(gripY, gripZ).normalize();

    const gripMat = new THREE.Matrix4().makeBasis(gripX, gripY, gripZ).setPosition(cradlePos);
    const gripQuat = new THREE.Quaternion().setFromRotationMatrix(gripMat);

    // Palm transform
    const palmMat = new THREE.Matrix4().makeBasis(gripX, handLongitudinal, palmFacing).setPosition(palmCenter);
    const palmQuat = new THREE.Quaternion().setFromRotationMatrix(palmMat);

    const fingerTargets: FingerTargets = {
      thumbCurl: 0.35,        // Open thumb resting on neck flank
      thumbOpposition: 0.40,
      indexCurl: 0.60,        // Arched over string
      middleCurl: 0.65,
      ringCurl: 0.70,
      littleCurl: 0.55,
      fingerSpread: 0.20,
    };

    const frame: HandInteractionFrame = {
      wrist: {
        position: requiredWristPos,
        quaternion: gripQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      palm: {
        position: palmCenter,
        quaternion: palmQuat,
        scale: new THREE.Vector3(1, 1, 1),
      },
      grip: {
        position: cradlePos,
        quaternion: gripQuat,
        scale: new THREE.Vector3(1, 1, 1),
      },
      fingerTargets,
    };

    return { frame, requiredWristPos };
  }
}
