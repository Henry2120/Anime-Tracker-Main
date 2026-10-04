import * as THREE from 'three';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { ArmIKSolver } from './ArmIKSolver';
import { InteractionSolution } from './types';

/**
 * Simple Performance Layer (Phase 15 & 18)
 * Moves the already-solved, kinematically correct violin playing pose gently:
 * - Down-bow / up-bow stroke along the bow stick axis
 * - Synchronized right arm IK tracking the moving bow frog
 * - Subtle left hand finger vibrato
 * - Subtle musical breathing sway (head & torso)
 *
 * NEVER breaks physical hand/instrument contacts!
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
    if (!isPlaying) {
      // Static pose
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

    // Musical frequency based on tempo
    const beatFreq = (bpm / 60) * Math.PI; // radians/sec
    const strokePhase = currentTime * beatFreq;

    // 1. Bow Stroke: periodic motion along the bow stick direction (+Y in local bow frame)
    const bowStickDir = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(baseSolution.accessoryTransform.quaternion)
      .normalize();

    // Amplitude ~ 3.5 cm stroke
    const strokeOffset = Math.sin(strokePhase) * 0.035 * baseSolution.instrumentScale;
    const animatedBowPos = baseSolution.accessoryTransform.position
      .clone()
      .addScaledVector(bowStickDir, strokeOffset);

    // 2. Right Arm Tracking Bow: moves right wrist with the bow stroke
    const metrics = adapter.computeMetrics();
    const animatedRightWristTarget = baseSolution.rightArmIK.targetPos
      .clone()
      .addScaledVector(bowStickDir, strokeOffset);

    const rightPoleVec = new THREE.Vector3(0.75, -0.40, 0.50).normalize();
    const animatedRightArmIK = ArmIKSolver.solveArmIK(
      'right',
      metrics.anchors.rightUpperArm,
      animatedRightWristTarget,
      metrics.upperArmLength.right,
      metrics.forearmLength.right,
      rightPoleVec
    );

    const rLowerArmDir = new THREE.Vector3()
      .subVectors(animatedRightArmIK.wristPos, animatedRightArmIK.elbowPos)
      .normalize();
    const rLowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), rLowerArmDir);
    const animatedRightHandQuat = ArmIKSolver.solveHandOrientation(
      'right',
      baseSolution.rightHandFrame,
      rLowerArmWorldQuat
    );

    // 3. Subtle Left Hand Vibrato
    const vibratoOsc = Math.sin(currentTime * 30) * 0.08;
    const vibratoTargets = {
      ...baseSolution.leftHandFrame.fingerTargets,
      indexCurl: THREE.MathUtils.clamp(baseSolution.leftHandFrame.fingerTargets.indexCurl + vibratoOsc, 0.4, 0.8),
      middleCurl: THREE.MathUtils.clamp(baseSolution.leftHandFrame.fingerTargets.middleCurl + vibratoOsc * 0.8, 0.4, 0.8),
    };

    // 4. Subtle Musical Breathing Sway (Head & Torso)
    const swayAngle = Math.sin(currentTime * (beatFreq * 0.5)) * 0.02; // ~1.1 degrees
    const animatedSpineRot = baseSolution.spineRotation.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swayAngle * 0.5)
    );
    const animatedHeadRot = baseSolution.headRotation.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swayAngle * 0.6)
    );

    // Apply animated transforms to humanoid bones
    adapter.setBoneRotation('spine', animatedSpineRot);
    adapter.setBoneRotation('chest', baseSolution.chestRotation);
    if (adapter.hasBone('upperChest')) {
      adapter.setBoneRotation('upperChest', baseSolution.chestRotation);
    }

    adapter.setBoneRotation('neck', baseSolution.neckRotation);
    adapter.setBoneRotation('head', animatedHeadRot);

    // Left arm remains rock-solid in cradle
    adapter.setBoneRotation('leftUpperArm', baseSolution.leftArmIK.upperArmQuat);
    adapter.setBoneRotation('leftLowerArm', baseSolution.leftArmIK.lowerArmQuat);
    adapter.setBoneRotation('leftHand', baseSolution.leftArmIK.handQuat);

    // Right arm moves with bowing stroke
    adapter.setBoneRotation('rightUpperArm', animatedRightArmIK.upperArmQuat);
    adapter.setBoneRotation('rightLowerArm', animatedRightArmIK.lowerArmQuat);
    adapter.setBoneRotation('rightHand', animatedRightHandQuat);

    // Fingers
    ArmIKSolver.applyFingerPoses(adapter, 'left', vibratoTargets);
    ArmIKSolver.applyFingerPoses(adapter, 'right', baseSolution.rightHandFrame.fingerTargets);

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
