import * as THREE from 'three';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { ArmIKSolver } from './ArmIKSolver';
import { InteractionSolution } from './types';

/**
 * Performance Animation Engine (Part 11, 15, 17, 18, 19)
 *
 * Implements subtle, expressive violin bowing motion:
 * - Down-bow and up-bow periodic stroke along the bow stick axis.
 * - Right hand remains attached to the moving frog grip.
 * - Right arm IK follows the animated stroke using parent-relative local rotations.
 * - Left hand remains stable in neck cradle with subtle finger vibrato.
 * - Chinrest remains stable with subtle breathing sway.
 * - Stops cleanly and resets without cumulative drift.
 */
export class PerformanceAnimator {
  public static animate(
    adapter: VRMHumanoidAdapter,
    baseSolution: InteractionSolution,
    currentTime: number,
    isPlaying: boolean,
    bpm = 110
  ): {
    animatedBowTransform: { position: THREE.Vector3; quaternion: THREE.Quaternion };
    animatedViolinTransform: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  } {
    if (!isPlaying || !adapter || !baseSolution) {
      ViolinInteractionSolverApplyStatic(adapter, baseSolution);
      return {
        animatedBowTransform: {
          position: baseSolution.accessoryTransform.position.clone(),
          quaternion: baseSolution.accessoryTransform.quaternion.clone(),
        },
        animatedViolinTransform: {
          position: baseSolution.instrumentTransform.position.clone(),
          quaternion: baseSolution.instrumentTransform.quaternion.clone(),
        },
      };
    }

    // 1. Musical Frequency based on tempo (BASE + OFFSET, no drift)
    const beatFreq = (bpm / 60) * Math.PI; // radians/sec
    const strokePhase = currentTime * beatFreq;

    // 2. Bow Stroke: periodic motion along the bow stick direction (+Y in local bow frame)
    const bowStickDir = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(baseSolution.accessoryTransform.quaternion)
      .normalize();

    // Subtle natural bowing stroke ~ 2.8cm along bow stick
    const strokeOffset = Math.sin(strokePhase) * 0.028 * baseSolution.instrumentScale;
    const animatedBowPos = baseSolution.accessoryTransform.position
      .clone()
      .addScaledVector(bowStickDir, strokeOffset);

    // 3. Right Arm Tracking: wrist target moves with the bow stroke
    const animatedRightWristTarget = baseSolution.rightArmIK.targetPos
      .clone()
      .addScaledVector(bowStickDir, strokeOffset);

    // Re-read current right shoulder world position and parent world quaternion
    const curRightShoulderPos = adapter.getBoneWorldPosition('rightUpperArm', new THREE.Vector3());
    const parentRightShoulderQuat = adapter.getParentWorldQuaternion('rightUpperArm');

    if (curRightShoulderPos) {
      const refRightUpper = adapter.getRestBoneDirection('rightUpperArm', 'rightLowerArm');
      const refRightLower = adapter.getRestBoneDirection('rightLowerArm', 'rightHand');
      const rightPoleVec = new THREE.Vector3(0.75, -0.45, 0.45).normalize();

      const animatedRightArmIK = ArmIKSolver.solveArmIK(
        'right',
        curRightShoulderPos,
        animatedRightWristTarget,
        baseSolution.rightArmIK.shoulderPos.distanceTo(baseSolution.rightArmIK.elbowPos),
        baseSolution.rightArmIK.elbowPos.distanceTo(baseSolution.rightArmIK.wristPos),
        rightPoleVec,
        parentRightShoulderQuat,
        refRightUpper,
        refRightLower
      );

      const rLowerArmDir = new THREE.Vector3()
        .subVectors(animatedRightArmIK.wristPos, animatedRightArmIK.elbowPos)
        .normalize();
      const rLowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(refRightLower, rLowerArmDir);
      const animatedRightHandQuat = ArmIKSolver.solveHandOrientation(
        'right',
        baseSolution.rightHandFrame,
        rLowerArmWorldQuat
      );

      adapter.setBoneRotation('rightUpperArm', animatedRightArmIK.upperArmQuat);
      adapter.setBoneRotation('rightLowerArm', animatedRightArmIK.lowerArmQuat);
      adapter.setBoneRotation('rightHand', animatedRightHandQuat);
      ArmIKSolver.applyFingerPoses(adapter, 'right', baseSolution.rightHandFrame.fingerTargets);
    }

    // 4. Subtle Left Hand Vibrato
    const vibratoOsc = Math.sin(currentTime * 28) * 0.06;
    const vibratoTargets = {
      ...baseSolution.leftHandFrame.fingerTargets,
      indexCurl: THREE.MathUtils.clamp(baseSolution.leftHandFrame.fingerTargets.indexCurl + vibratoOsc, 0.45, 0.65),
      middleCurl: THREE.MathUtils.clamp(baseSolution.leftHandFrame.fingerTargets.middleCurl + vibratoOsc * 0.8, 0.55, 0.78),
    };
    ArmIKSolver.applyFingerPoses(adapter, 'left', vibratoTargets);

    // Left arm remains rock-solid in cradle
    adapter.setBoneRotation('leftUpperArm', baseSolution.leftArmIK.upperArmQuat);
    adapter.setBoneRotation('leftLowerArm', baseSolution.leftArmIK.lowerArmQuat);
    adapter.setBoneRotation('leftHand', baseSolution.leftArmIK.handQuat);

    // 5. Subtle Musical Sway (Head & Torso)
    const swayAngle = Math.sin(currentTime * (beatFreq * 0.5)) * 0.012; // ~0.7 degrees
    const animatedSpineRot = baseSolution.spineRotation.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swayAngle * 0.5)
    );
    const animatedHeadRot = baseSolution.headRotation.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swayAngle * 0.6)
    );

    adapter.setBoneRotation('spine', animatedSpineRot);
    adapter.setBoneRotation('chest', baseSolution.chestRotation);
    if (adapter.hasBone('upperChest')) {
      adapter.setBoneRotation('upperChest', baseSolution.chestRotation);
    }
    adapter.setBoneRotation('neck', baseSolution.neckRotation);
    adapter.setBoneRotation('head', animatedHeadRot);

    if (baseSolution.leftShoulderRotation && adapter.hasBone('leftShoulder')) {
      adapter.setBoneRotation('leftShoulder', baseSolution.leftShoulderRotation);
    }
    if (baseSolution.rightShoulderRotation && adapter.hasBone('rightShoulder')) {
      adapter.setBoneRotation('rightShoulder', baseSolution.rightShoulderRotation);
    }

    adapter.updateWorldMatrix();

    return {
      animatedBowTransform: {
        position: animatedBowPos,
        quaternion: baseSolution.accessoryTransform.quaternion.clone(),
      },
      animatedViolinTransform: {
        position: baseSolution.instrumentTransform.position.clone(),
        quaternion: baseSolution.instrumentTransform.quaternion.clone(),
      },
    };
  }
}

function ViolinInteractionSolverApplyStatic(
  adapter: VRMHumanoidAdapter,
  solution: InteractionSolution
): void {
  adapter.setBoneRotation('spine', solution.spineRotation);
  adapter.setBoneRotation('chest', solution.chestRotation);
  if (adapter.hasBone('upperChest')) {
    adapter.setBoneRotation('upperChest', solution.chestRotation);
  }
  adapter.setBoneRotation('neck', solution.neckRotation);
  adapter.setBoneRotation('head', solution.headRotation);

  if (solution.leftShoulderRotation && adapter.hasBone('leftShoulder')) {
    adapter.setBoneRotation('leftShoulder', solution.leftShoulderRotation);
  }
  if (solution.rightShoulderRotation && adapter.hasBone('rightShoulder')) {
    adapter.setBoneRotation('rightShoulder', solution.rightShoulderRotation);
  }

  adapter.setBoneRotation('leftUpperArm', solution.leftArmIK.upperArmQuat);
  adapter.setBoneRotation('leftLowerArm', solution.leftArmIK.lowerArmQuat);
  adapter.setBoneRotation('leftHand', solution.leftArmIK.handQuat);

  adapter.setBoneRotation('rightUpperArm', solution.rightArmIK.upperArmQuat);
  adapter.setBoneRotation('rightLowerArm', solution.rightArmIK.lowerArmQuat);
  adapter.setBoneRotation('rightHand', solution.rightArmIK.handQuat);

  ArmIKSolver.applyFingerPoses(adapter, 'left', solution.leftHandFrame.fingerTargets);
  ArmIKSolver.applyFingerPoses(adapter, 'right', solution.rightHandFrame.fingerTargets);

  adapter.updateWorldMatrix();
}
