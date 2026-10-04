import * as THREE from 'three';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { HandInteractionFrame, Transform3D, FingerTargets } from './types';

/**
 * Hand Interaction Frame Manager (Part 4 & Part 5)
 *
 * Implements classical violin ergonomics:
 * - Left Hand: V-cradle neck support, fingers arched over strings, thumb on neck underside.
 * - Right Hand: Classical Franco-Belgian bow hold with opposing bent thumb, draped index, curved pinky.
 *
 * CRITICAL CANONICAL VRM COORDINATE SYSTEM:
 * - Left Hand bone: local +X points along fingers; local -Y is palm normal; local +Z is thumb.
 * - Right Hand bone: local -X points along fingers; local -Y is palm normal; local +Z is thumb.
 */
export class HandInteractionFrameSolver {
  /**
   * Solves the Left Hand Violin Neck Support & Grip Frame.
   */
  public static solveLeftNeckGripFrame(
    adapter: VRMHumanoidAdapter,
    neckTargetPos: THREE.Vector3,
    violinLongitudinal: THREE.Vector3,
    violinTopNormal: THREE.Vector3
  ): { frame: HandInteractionFrame; requiredWristPos: THREE.Vector3 } {
    const metrics = adapter.computeMetrics();
    const handLen = metrics.handLength.left;

    // Neck cradle position: under violin neck between thumb web and index base
    const cradlePos = neckTargetPos.clone();

    // Finger direction: fingers extend forward and arch over fingerboard
    const desiredFingersDir = violinLongitudinal
      .clone()
      .multiplyScalar(0.82)
      .addScaledVector(violinTopNormal, 0.57)
      .normalize();

    // Lateral direction towards the player (outer flank of neck)
    const neckSideAxis = new THREE.Vector3().crossVectors(violinLongitudinal, violinTopNormal).normalize();

    // Palm normal: faces inward and upward toward strings & neck
    const desiredPalmNormal = neckSideAxis
      .clone()
      .multiplyScalar(0.60)
      .addScaledVector(violinTopNormal, 0.80)
      .normalize();

    // In VRM normalized skeleton for LEFT hand:
    // col0 (+X): fingers direction
    // col1 (+Y): back-of-hand (opposite to palm normal)
    // col2 (+Z): thumb direction
    const lCol0 = desiredFingersDir.clone().normalize();
    const lBackOfHand = desiredPalmNormal.clone().negate().normalize();
    const lCol2 = new THREE.Vector3().crossVectors(lCol0, lBackOfHand).normalize();
    const lCol1 = new THREE.Vector3().crossVectors(lCol2, lCol0).normalize();

    const leftHandWorldMat = new THREE.Matrix4().makeBasis(lCol0, lCol1, lCol2);
    const leftHandWorldQuat = new THREE.Quaternion().setFromRotationMatrix(leftHandWorldMat);

    // Required wrist position: backtracked from cradle along hand longitudinal axis
    const requiredWristPos = cradlePos
      .clone()
      .addScaledVector(desiredFingersDir, -handLen * 0.72)
      .addScaledVector(desiredPalmNormal, -handLen * 0.38);

    const palmCenter = new THREE.Vector3().addVectors(requiredWristPos, cradlePos).multiplyScalar(0.5);

    // Finger targets for left hand (Part 4: subtle natural progression)
    // index: slightly extended; middle: curved; ring: curved; little: poised
    const fingerTargets: FingerTargets = {
      thumbCurl: 0.25,        // Open curved thumb resting gently on neck flank
      thumbOpposition: 0.45,  // Opposes index knuckle
      indexCurl: 0.52,        // Slightly extended, poised to press string
      middleCurl: 0.68,       // Curved naturally over D/A strings
      ringCurl: 0.72,         // Curved naturally over string
      littleCurl: 0.60,       // Poised above fingerboard
      fingerSpread: 0.18,     // Natural string-spacing spread
    };

    const frame: HandInteractionFrame = {
      wrist: {
        position: requiredWristPos,
        quaternion: leftHandWorldQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      palm: {
        position: palmCenter,
        quaternion: leftHandWorldQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      grip: {
        position: cradlePos,
        quaternion: leftHandWorldQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      fingerTargets,
    };

    return { frame, requiredWristPos };
  }

  /**
   * Solves the Right Hand Bow Grip Frame.
   */
  public static solveRightBowGripFrame(
    adapter: VRMHumanoidAdapter,
    wristTransform: Transform3D,
    desiredBowingDirection: THREE.Vector3,
    violinStringsNormal: THREE.Vector3
  ): HandInteractionFrame {
    const metrics = adapter.computeMetrics();
    const handLen = metrics.handLength.right;

    const rWristPos = wristTransform.position.clone();
    const bowStickDir = desiredBowingDirection.clone().normalize();
    const bowUpNormal = violinStringsNormal.clone().normalize();

    // Finger direction: fingers drape across the bow stick and point downward/inward
    const desiredFingersDir = new THREE.Vector3().crossVectors(bowStickDir, bowUpNormal).normalize();

    // Palm normal: faces down-inward toward frog and hair
    const desiredPalmNormal = bowUpNormal.clone().negate().normalize();

    // In VRM normalized skeleton for RIGHT hand:
    // col0 (+X): opposite to fingers direction (-X is fingers)
    // col1 (+Y): back-of-hand (opposite to palm normal)
    // col2 (+Z): thumb direction
    const rCol0 = desiredFingersDir.clone().negate().normalize();
    const rBackOfHand = desiredPalmNormal.clone().negate().normalize();
    const rCol2 = new THREE.Vector3().crossVectors(rCol0, rBackOfHand).normalize();
    const rCol1 = new THREE.Vector3().crossVectors(rCol2, rCol0).normalize();

    const rightHandWorldMat = new THREE.Matrix4().makeBasis(rCol0, rCol1, rCol2);
    const rightHandWorldQuat = new THREE.Quaternion().setFromRotationMatrix(rightHandWorldMat);

    const palmCenter = rWristPos.clone().addScaledVector(desiredFingersDir, handLen * 0.4);
    const gripCenter = rWristPos.clone().addScaledVector(desiredFingersDir, handLen * 0.55);

    // Finger targets for right hand (Part 5: classical violin bow hold)
    const fingerTargets: FingerTargets = {
      thumbCurl: 0.48,        // Bent thumb opposing middle finger at frog notch
      thumbOpposition: 0.75,  // Opposes middle finger
      indexCurl: 0.60,        // Index drapes over stick at intermediate phalanx
      middleCurl: 0.78,       // Middle finger wraps around frog
      ringCurl: 0.82,         // Ring finger rests against frog eye
      littleCurl: 0.45,       // Pinky curved with tip resting on top of stick
      fingerSpread: 0.16,     // Natural bow-hold spread
    };

    return {
      wrist: {
        position: rWristPos,
        quaternion: rightHandWorldQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      palm: {
        position: palmCenter,
        quaternion: rightHandWorldQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      grip: {
        position: gripCenter,
        quaternion: rightHandWorldQuat.clone(),
        scale: new THREE.Vector3(1, 1, 1),
      },
      fingerTargets,
    };
  }
}
