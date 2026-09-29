import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { CharacterBodyFrame } from './characterBodyFrame';
import { VRMMetrics } from './vrmMetrics';
import {
  ViolinReferenceCalibration,
  Vector3InBodyFrame,
} from './violinReferenceCalibration';

export interface UniversalViolinPerformanceFrame {
  // Character Baseline
  character: {
    height: number;
    shoulderWidth: number;
    torsoLength: number;
    neckLength: number;
    leftArmReach: number;
    rightArmReach: number;
  };

  // Adapted Violin Mount
  violinMount: {
    referenceBodyRelative: Vector3InBodyFrame;
    adaptedBodyRelative: Vector3InBodyFrame;
    worldPosition: THREE.Vector3;
    worldQuaternion: THREE.Quaternion;
  };

  // Adapted Violin Orientation
  violinOrientation: {
    referenceBodyBasis: {
      forward: Vector3InBodyFrame;
      up: Vector3InBodyFrame;
      right: Vector3InBodyFrame;
    };
    worldForward: THREE.Vector3;
    worldUp: THREE.Vector3;
    worldRight: THREE.Vector3;
  };

  // Adapted Instrument Targets
  instrumentTargets: {
    chinRestWorld: THREE.Vector3;
    violinNeckWorld: THREE.Vector3;
    bowContactWorld: THREE.Vector3;
  };

  // Left Arm & Hand Target
  leftArm: {
    handTargetWorld: THREE.Vector3;
    shoulderToHandDistance: number;
    maxUsableReach: number;
    reachRatio: number;
    isReachClamped: boolean;
    elbowHintWorld: THREE.Vector3;
  };

  // Right Arm & Bow Grip Target
  rightArm: {
    bowContactWorld: THREE.Vector3;
    bowGripWorld: THREE.Vector3;
    shoulderToGripDistance: number;
    maxUsableReach: number;
    reachRatio: number;
    isGripAdapted: boolean;
    elbowHintWorld: THREE.Vector3;
  };

  // Identity / Validation against reference baseline
  validation: {
    isReferenceModel: boolean;
    mountErrorMeters: number;
    neckErrorMeters: number;
    chinRestErrorMeters: number;
    bowContactErrorMeters: number;
    bowGripErrorMeters: number;
    leftHandTargetErrorMeters: number;
  };
}

/**
 * Transforms a body-frame direction into the new character's 3D world space.
 */
function reconstructDirection(
  dir: Vector3InBodyFrame,
  directions: { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 }
): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(directions.right, dir.right)
    .addScaledVector(directions.up, dir.up)
    .addScaledVector(directions.forward, dir.forward)
    .normalize();
}

/**
 * Adapts reference-calibrated violin relationships to any VRM character model
 * using anatomical dimension proportions (shoulder span, torso length, limb lengths)
 * rather than a single naive global height scale.
 * 
 * DIAGNOSTIC ONLY: Does not mutate the live pose.
 */
export function buildUniversalViolinAdapter(
  _vrm: VRM,
  bodyFrame: CharacterBodyFrame,
  metrics: VRMMetrics,
  calibration: ViolinReferenceCalibration
): UniversalViolinPerformanceFrame {
  const { landmarks, directions, height, ratios } = bodyFrame;
  const ref = calibration.referenceBaseline;

  // 1. New Character Anatomical Dimensions
  const shoulderWidth = (ratios.shoulderWidthToHeight ?? 0.135) * height;
  const torsoLength = (ratios.torsoLengthToHeight ?? 0.25) * height;
  const neckLength = (ratios.neckLengthToHeight ?? 0.046) * height;
  const leftArmReach = metrics.leftArm?.totalReach || ((ratios.leftTotalReachToHeight ?? 0.31) * height);
  const rightArmReach = metrics.rightArm?.totalReach || ((ratios.rightTotalReachToHeight ?? 0.31) * height);

  // 2. Anatomically Grounded Scaling Ratios (Never a single global height scalar)
  const lateralScale = ref.shoulderWidth > 0 ? shoulderWidth / ref.shoulderWidth : 1.0;
  const verticalScale = ref.torsoLength > 0 ? torsoLength / ref.torsoLength : 1.0;
  const sagittalScale = ref.torsoLength > 0 ? torsoLength / ref.torsoLength : 1.0;

  // 3. Adapt Body-Relative Violin Mount Position
  const refMount = calibration.violinMount.positionInBodyFrame;
  const adaptedMountBodyRelative: Vector3InBodyFrame = {
    right: refMount.right * lateralScale,
    up: refMount.up * verticalScale,
    forward: refMount.forward * sagittalScale,
  };

  const anchorOrigin = landmarks.effectiveUpperChest.clone();
  const adaptedViolinMountWorld = anchorOrigin.clone()
    .addScaledVector(directions.right, adaptedMountBodyRelative.right)
    .addScaledVector(directions.up, adaptedMountBodyRelative.up)
    .addScaledVector(directions.forward, adaptedMountBodyRelative.forward);

  // 4. Adapt Violin Orientation Basis in New Character's Body Frame
  const rawForward = reconstructDirection(calibration.violinMount.orientationInBodyFrame.forward, directions);
  const rawUp = reconstructDirection(calibration.violinMount.orientationInBodyFrame.up, directions);
  const rawRight = reconstructDirection(calibration.violinMount.orientationInBodyFrame.right, directions);

  // Ensure strict orthonormal basis
  const violinForward = rawForward.clone().normalize();
  const projFwd = violinForward.clone().multiplyScalar(rawUp.dot(violinForward));
  const violinUp = rawUp.clone().sub(projFwd).normalize();
  const violinRight = new THREE.Vector3().crossVectors(violinForward, violinUp).normalize();

  const adaptedViolinWorldMat = new THREE.Matrix4().makeBasis(
    violinRight,
    violinForward,
    violinUp
  ).setPosition(adaptedViolinMountWorld);

  const adaptedViolinQuatWorld = new THREE.Quaternion().setFromRotationMatrix(adaptedViolinWorldMat);

  // 5. Adapt Instrument Targets (Standard 4/4 Violin Local Anchors)
  const chinRestWorld = calibration.violinTargets.chinRestLocal.clone().applyMatrix4(adaptedViolinWorldMat);
  const violinNeckWorld = calibration.violinTargets.neckTargetLocal.clone().applyMatrix4(adaptedViolinWorldMat);
  const bowContactWorld = calibration.violinTargets.bowContactLocal.clone().applyMatrix4(adaptedViolinWorldMat);

  // 6. Left Arm & Hand Target
  const leftHandTargetWorld = violinNeckWorld.clone()
    .addScaledVector(violinUp, calibration.violinTargets.leftHandOffsetAlongZ);

  const leftShoulderPos = landmarks.leftUpperArm || landmarks.leftShoulder ||
    landmarks.effectiveUpperChest.clone().addScaledVector(directions.left, shoulderWidth * 0.5);

  const leftShoulderToHandDist = leftShoulderPos.distanceTo(leftHandTargetWorld);
  const maxUsableLeftReach = leftArmReach * 0.94;
  const leftReachRatio = maxUsableLeftReach > 0 ? leftShoulderToHandDist / maxUsableLeftReach : 1.0;
  const isLeftClamped = leftShoulderToHandDist > maxUsableLeftReach;

  const leftElbowHintWorld = reconstructDirection(calibration.elbowHintsInBodyFrame.leftElbowInBody, directions);

  // 7. Right Arm, Bow World Transform & Bow Grip Target
  const bowingDirWorld = new THREE.Vector3().crossVectors(violinForward, violinUp).normalize();
  const bowUpWorld = bowingDirWorld.clone();
  const bowForwardWorld = violinUp.clone().negate();
  const bowRightWorld = new THREE.Vector3().crossVectors(bowUpWorld, bowForwardWorld).normalize();

  const adaptedBowWorldMat = new THREE.Matrix4().makeBasis(
    bowRightWorld,
    bowUpWorld,
    bowForwardWorld
  ).setPosition(bowContactWorld);

  let bowGripWorld = calibration.bowTargets.gripLocal.clone().applyMatrix4(adaptedBowWorldMat);

  const rightShoulderPos = landmarks.rightUpperArm || landmarks.rightShoulder ||
    landmarks.effectiveUpperChest.clone().addScaledVector(directions.right, shoulderWidth * 0.5);

  let rightShoulderToGripDist = rightShoulderPos.distanceTo(bowGripWorld);
  const maxUsableRightReach = rightArmReach * 0.94;
  let isGripAdapted = false;

  if (rightShoulderToGripDist > maxUsableRightReach) {
    // Shorten grip distance along bow frog-to-tip direction to remain within character reach
    const reachableGripDist = Math.max(0.12, 0.30 - (rightShoulderToGripDist - maxUsableRightReach));
    bowGripWorld = new THREE.Vector3(0, -reachableGripDist, 0).applyMatrix4(adaptedBowWorldMat);
    rightShoulderToGripDist = rightShoulderPos.distanceTo(bowGripWorld);
    isGripAdapted = true;
  }

  const rightReachRatio = maxUsableRightReach > 0 ? rightShoulderToGripDist / maxUsableRightReach : 1.0;
  const rightElbowHintWorld = reconstructDirection(calibration.elbowHintsInBodyFrame.rightElbowInBody, directions);

  // 8. Identity / Validation Check (against original reference model)
  const isReferenceModel = Math.abs(height - ref.height) < 0.02 &&
    Math.abs(shoulderWidth - ref.shoulderWidth) < 0.01;

  const mountErrorMeters = adaptedViolinMountWorld.distanceTo(calibration.reconstruction.originalViolinMountWorld);
  const neckErrorMeters = violinNeckWorld.distanceTo(calibration.reconstruction.originalViolinNeckWorld);
  const chinRestErrorMeters = chinRestWorld.distanceTo(calibration.reconstruction.originalChinRestWorld);
  const bowContactErrorMeters = bowContactWorld.distanceTo(calibration.reconstruction.originalBowContactWorld);
  const bowGripErrorMeters = bowGripWorld.distanceTo(calibration.reconstruction.originalBowGripWorld);
  const leftHandTargetErrorMeters = leftHandTargetWorld.distanceTo(calibration.reconstruction.originalLeftHandTargetWorld);

  return {
    character: {
      height,
      shoulderWidth,
      torsoLength,
      neckLength,
      leftArmReach,
      rightArmReach,
    },
    violinMount: {
      referenceBodyRelative: refMount,
      adaptedBodyRelative: adaptedMountBodyRelative,
      worldPosition: adaptedViolinMountWorld,
      worldQuaternion: adaptedViolinQuatWorld,
    },
    violinOrientation: {
      referenceBodyBasis: calibration.violinMount.orientationInBodyFrame,
      worldForward: violinForward,
      worldUp: violinUp,
      worldRight: violinRight,
    },
    instrumentTargets: {
      chinRestWorld,
      violinNeckWorld,
      bowContactWorld,
    },
    leftArm: {
      handTargetWorld: leftHandTargetWorld,
      shoulderToHandDistance: leftShoulderToHandDist,
      maxUsableReach: maxUsableLeftReach,
      reachRatio: leftReachRatio,
      isReachClamped: isLeftClamped,
      elbowHintWorld: leftElbowHintWorld,
    },
    rightArm: {
      bowContactWorld,
      bowGripWorld,
      shoulderToGripDistance: rightShoulderToGripDist,
      maxUsableReach: maxUsableRightReach,
      reachRatio: rightReachRatio,
      isGripAdapted,
      elbowHintWorld: rightElbowHintWorld,
    },
    validation: {
      isReferenceModel,
      mountErrorMeters,
      neckErrorMeters,
      chinRestErrorMeters,
      bowContactErrorMeters,
      bowGripErrorMeters,
      leftHandTargetErrorMeters,
    },
  };
}

/**
 * Formats the Universal Violin Adapter diagnostic output.
 */
export function formatUniversalViolinAdapter(frame: UniversalViolinPerformanceFrame): string {
  const fmtCoord = (c: Vector3InBodyFrame): string =>
    `[Right: ${c.right.toFixed(4)}m, Up: ${c.up.toFixed(4)}m, Fwd: ${c.forward.toFixed(4)}m]`;
  const fmtVec = (v: THREE.Vector3): string =>
    `(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;
  const fmtDist = (d: number): string => `${d.toFixed(3)}m`;
  const fmtRatio = (r: number): string => `${(r * 100).toFixed(1)}%`;
  const fmtErr = (e: number): string => `${(e * 1000).toFixed(4)} mm`;

  return [
    'UNIVERSAL VIOLIN ADAPTER',
    '',
    'Character:',
    `  Height:                    ${fmtDist(frame.character.height)}`,
    `  Shoulder Width:            ${fmtDist(frame.character.shoulderWidth)}`,
    `  Torso Length:              ${fmtDist(frame.character.torsoLength)}`,
    `  Neck Length:               ${fmtDist(frame.character.neckLength)}`,
    `  Left Arm Reach:            ${fmtDist(frame.character.leftArmReach)}`,
    `  Right Arm Reach:           ${fmtDist(frame.character.rightArmReach)}`,
    '',
    'VIOLIN MOUNT',
    `  Reference body-relative:   ${fmtCoord(frame.violinMount.referenceBodyRelative)}`,
    `  Adapted body-relative:     ${fmtCoord(frame.violinMount.adaptedBodyRelative)}`,
    `  World position:            ${fmtVec(frame.violinMount.worldPosition)}`,
    '',
    'VIOLIN ORIENTATION',
    `  Reference body-relative basis:`,
    `    Forward:                 ${fmtCoord(frame.violinOrientation.referenceBodyBasis.forward)}`,
    `    Up:                      ${fmtCoord(frame.violinOrientation.referenceBodyBasis.up)}`,
    `    Right:                   ${fmtCoord(frame.violinOrientation.referenceBodyBasis.right)}`,
    `  Adapted world basis:`,
    `    Forward:                 ${fmtVec(frame.violinOrientation.worldForward)}`,
    `    Up:                      ${fmtVec(frame.violinOrientation.worldUp)}`,
    `    Right:                   ${fmtVec(frame.violinOrientation.worldRight)}`,
    '',
    'CHINREST',
    `  World position:            ${fmtVec(frame.instrumentTargets.chinRestWorld)}`,
    '',
    'VIOLIN NECK',
    `  World position:            ${fmtVec(frame.instrumentTargets.violinNeckWorld)}`,
    '',
    'LEFT HAND',
    `  Target:                    ${fmtVec(frame.leftArm.handTargetWorld)}`,
    `  Shoulder -> target dist:   ${fmtDist(frame.leftArm.shoulderToHandDistance)}`,
    `  Maximum usable reach:      ${fmtDist(frame.leftArm.maxUsableReach)}`,
    `  Reach ratio:               ${fmtRatio(frame.leftArm.reachRatio)}`,
    `  Reach clamped:             ${frame.leftArm.isReachClamped ? 'YES' : 'NO'}`,
    '',
    'RIGHT HAND / BOW',
    `  Bow contact:               ${fmtVec(frame.rightArm.bowContactWorld)}`,
    `  Bow grip:                  ${fmtVec(frame.rightArm.bowGripWorld)}`,
    `  Shoulder -> grip dist:     ${fmtDist(frame.rightArm.shoulderToGripDistance)}`,
    `  Maximum usable reach:      ${fmtDist(frame.rightArm.maxUsableReach)}`,
    `  Reach ratio:               ${fmtRatio(frame.rightArm.reachRatio)}`,
    `  Grip adapted:              ${frame.rightArm.isGripAdapted ? 'YES' : 'NO'}`,
    '',
    'ELBOW HINTS',
    `  Left:                      ${fmtVec(frame.leftArm.elbowHintWorld)}`,
    `  Right:                     ${fmtVec(frame.rightArm.elbowHintWorld)}`,
    '',
    'RECONSTRUCTION ACCURACY VS REFERENCE:',
    `  Violin Mount Error:        ${fmtErr(frame.validation.mountErrorMeters)}`,
    `  Violin Neck Error:         ${fmtErr(frame.validation.neckErrorMeters)}`,
    `  Chinrest Error:            ${fmtErr(frame.validation.chinRestErrorMeters)}`,
    `  Bow Contact Error:         ${fmtErr(frame.validation.bowContactErrorMeters)}`,
    `  Bow Grip Error:            ${fmtErr(frame.validation.bowGripErrorMeters)}`,
    `  Left Hand Target Error:    ${fmtErr(frame.validation.leftHandTargetErrorMeters)}`,
  ].join('\n');
}

/**
 * Diagnostic logger for Universal Violin Adapter.
 */
export function logUniversalViolinAdapter(frame: UniversalViolinPerformanceFrame, modelName = 'Loaded Model'): void {
  console.log(`[MusicLab Universal Adapter Diagnostics] === ${modelName} ===\n` + formatUniversalViolinAdapter(frame));
}
