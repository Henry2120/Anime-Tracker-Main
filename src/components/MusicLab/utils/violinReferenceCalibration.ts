import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { CharacterBodyFrame } from './characterBodyFrame';

/**
 * Representation of a vector in the character's anatomical body coordinate frame.
 * - right: lateral displacement along shoulder axis (left -> right)
 * - up: longitudinal displacement along spine (hips -> neck)
 * - forward: sagittal displacement perpendicular to chest (back -> front)
 */
export interface Vector3InBodyFrame {
  right: number;
  up: number;
  forward: number;
}

/**
 * Orthonormal basis of an object expressed in the character's body coordinate frame.
 */
export interface OrientationInBodyFrame {
  forward: Vector3InBodyFrame;
  up: Vector3InBodyFrame;
  right: Vector3InBodyFrame;
}

/**
 * Reference calibration dataset extracted from the reference model (test.vrm).
 * Encapsulates the reference character's successful anatomical violin relationships
 * rather than hardcoding arbitrary world coordinates.
 */
export interface ViolinReferenceCalibration {
  // 1. Reference Character Anatomical Baseline (test.vrm)
  referenceBaseline: {
    height: number;
    shoulderWidth: number;
    torsoLength: number;
    neckLength: number;
    leftArmReach: number;
    rightArmReach: number;
  };

  // 2. Violin Mount & Orientation in Body Frame
  violinMount: {
    anchorName: 'effectiveUpperChest';
    positionInBodyFrame: Vector3InBodyFrame; // Offset from effectiveUpperChest in body basis
    orientationInBodyFrame: OrientationInBodyFrame; // Violin [X, Y, Z] world axes in body basis
  };

  // 3. Instrument-Relative Targets
  violinTargets: {
    neckTargetLocal: THREE.Vector3;       // (0, 0.205, 0.016) in violin local space
    bowContactLocal: THREE.Vector3;       // (0, 0.045, 0.045) in violin local space
    chinRestLocal: THREE.Vector3;         // (0, -0.135, 0.038) in violin local space
    leftHandOffsetAlongZ: number;         // -0.012 along violinDirZ
  };

  // 4. Bow-Relative Targets
  bowTargets: {
    gripLocal: THREE.Vector3;             // (0, -0.30, 0) in bow local space
  };

  // 5. Elbow Bend Hints in Body Frame
  elbowHintsInBodyFrame: {
    leftElbowInBody: Vector3InBodyFrame;
    rightElbowInBody: Vector3InBodyFrame;
  };

  // 6. Validation / Reconstruction Accuracy Check
  reconstruction: {
    originalViolinMountWorld: THREE.Vector3;
    reconstructedViolinMountWorld: THREE.Vector3;
    violinMountErrorMeters: number;

    originalViolinNeckWorld: THREE.Vector3;
    reconstructedViolinNeckWorld: THREE.Vector3;
    violinNeckErrorMeters: number;

    originalChinRestWorld: THREE.Vector3;
    reconstructedChinRestWorld: THREE.Vector3;
    chinRestErrorMeters: number;

    originalBowContactWorld: THREE.Vector3;
    reconstructedBowContactWorld: THREE.Vector3;
    bowContactErrorMeters: number;

    originalBowGripWorld: THREE.Vector3;
    reconstructedBowGripWorld: THREE.Vector3;
    bowGripErrorMeters: number;

    originalLeftHandTargetWorld: THREE.Vector3;
    reconstructedLeftHandTargetWorld: THREE.Vector3;
    leftHandTargetErrorMeters: number;
  };
}

/**
 * Projects a world-space vector onto the character's anatomical body basis.
 */
function projectToBodyFrame(
  worldPos: THREE.Vector3,
  origin: THREE.Vector3,
  directions: { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 }
): Vector3InBodyFrame {
  const rel = new THREE.Vector3().subVectors(worldPos, origin);
  return {
    right: rel.dot(directions.right),
    up: rel.dot(directions.up),
    forward: rel.dot(directions.forward),
  };
}

/**
 * Projects a directional vector (no origin translation) onto the body basis.
 */
function projectDirectionToBodyFrame(
  worldDir: THREE.Vector3,
  directions: { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 }
): Vector3InBodyFrame {
  return {
    right: worldDir.dot(directions.right),
    up: worldDir.dot(directions.up),
    forward: worldDir.dot(directions.forward),
  };
}

/**
 * Reconstructs a world-space position from a body-frame coordinate.
 */
function reconstructFromBodyFrame(
  coord: Vector3InBodyFrame,
  origin: THREE.Vector3,
  directions: { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 }
): THREE.Vector3 {
  return origin.clone()
    .addScaledVector(directions.right, coord.right)
    .addScaledVector(directions.up, coord.up)
    .addScaledVector(directions.forward, coord.forward);
}

/**
 * Reconstructs a world-space direction from a body-frame direction.
 */
function reconstructDirectionFromBodyFrame(
  coord: Vector3InBodyFrame,
  directions: { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 }
): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(directions.right, coord.right)
    .addScaledVector(directions.up, coord.up)
    .addScaledVector(directions.forward, coord.forward)
    .normalize();
}

/**
 * Builds the reference-calibrated body-relative adapter dataset from a loaded reference VRM model.
 * Does NOT modify the live pose or skeleton state.
 */
export function buildReferenceCalibration(
  vrm: VRM,
  bodyFrame: CharacterBodyFrame
): ViolinReferenceCalibration {
  const { landmarks, directions, height, ratios } = bodyFrame;
  const humanoid = vrm.humanoid;

  // 1. Reference Character Baseline
  const torsoLength = (ratios.torsoLengthToHeight ?? 0.25) * height;
  const shoulderWidth = (ratios.shoulderWidthToHeight ?? 0.135) * height;
  const neckLength = (ratios.neckLengthToHeight ?? 0.046) * height;
  const leftArmReach = (ratios.leftTotalReachToHeight ?? 0.31) * height;
  const rightArmReach = (ratios.rightTotalReachToHeight ?? 0.31) * height;

  // 2. Compute Original Reference World Transforms (as evaluated in live ViolinPerformance.tsx)
  // Find chest / upper chest bone
  const chestBone = humanoid?.getNormalizedBoneNode('upperChest' as VRMHumanBoneName) ||
    humanoid?.getNormalizedBoneNode('chest' as VRMHumanBoneName);

  // Original reference mount constants
  const origLocalPos = new THREE.Vector3(0.08, 0.05, 0.20);
  const origLocalRot = new THREE.Euler(-0.25, -0.55, 0.52, 'YXZ');
  const origLocalQuat = new THREE.Quaternion().setFromEuler(origLocalRot);

  let originalViolinMountWorld = new THREE.Vector3();
  let originalViolinQuatWorld = new THREE.Quaternion();

  if (chestBone) {
    const parentWorldMat = chestBone.matrixWorld.clone();
    const violinLocalMat = new THREE.Matrix4().compose(origLocalPos, origLocalQuat, new THREE.Vector3(1, 1, 1));
    const violinWorldMat = parentWorldMat.multiply(violinLocalMat);

    violinWorldMat.decompose(originalViolinMountWorld, originalViolinQuatWorld, new THREE.Vector3());
  } else {
    originalViolinMountWorld = origLocalPos.clone();
    originalViolinQuatWorld = origLocalQuat.clone();
  }

  // Construct original violin world basis matrix
  const origViolinWorldMat = new THREE.Matrix4().compose(
    originalViolinMountWorld,
    originalViolinQuatWorld,
    new THREE.Vector3(1, 1, 1)
  );

  // Reference key landmarks in original world space
  const neckTargetLocal = new THREE.Vector3(0, 0.205, 0.016);
  const bowContactLocal = new THREE.Vector3(0, 0.045, 0.045);
  const chinRestLocal = new THREE.Vector3(0, -0.135, 0.038);

  const originalViolinNeckWorld = neckTargetLocal.clone().applyMatrix4(origViolinWorldMat);
  const originalBowContactWorld = bowContactLocal.clone().applyMatrix4(origViolinWorldMat);
  const originalChinRestWorld = chinRestLocal.clone().applyMatrix4(origViolinWorldMat);

  const violinDirY = new THREE.Vector3(0, 1, 0).transformDirection(origViolinWorldMat).normalize();
  const violinDirZ = new THREE.Vector3(0, 0, 1).transformDirection(origViolinWorldMat).normalize();
  const violinDirX = new THREE.Vector3(1, 0, 0).transformDirection(origViolinWorldMat).normalize();
  const bowingDirWorld = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();

  const originalLeftHandTargetWorld = originalViolinNeckWorld.clone().addScaledVector(violinDirZ, -0.012);

  // Original Bow World Transform & Grip Target
  const bowUpWorld = bowingDirWorld.clone();
  const bowForwardWorld = violinDirZ.clone().negate();
  const bowRightWorld = new THREE.Vector3().crossVectors(bowUpWorld, bowForwardWorld).normalize();

  const origBowWorldMat = new THREE.Matrix4().makeBasis(bowRightWorld, bowUpWorld, bowForwardWorld);
  origBowWorldMat.setPosition(originalBowContactWorld);

  const origGripLocal = new THREE.Vector3(0, -0.30, 0);
  const originalBowGripWorld = origGripLocal.clone().applyMatrix4(origBowWorldMat);

  // 3. Project Reference Mount & Orientation into Anatomical Body Frame
  const anchorOrigin = landmarks.effectiveUpperChest.clone();

  const positionInBodyFrame = projectToBodyFrame(originalViolinMountWorld, anchorOrigin, directions);

  const orientationInBodyFrame: OrientationInBodyFrame = {
    forward: projectDirectionToBodyFrame(violinDirY, directions), // Violin longitudinal neck axis
    up: projectDirectionToBodyFrame(violinDirZ, directions),      // Violin soundboard normal axis
    right: projectDirectionToBodyFrame(violinDirX, directions),   // Violin lateral bout axis
  };

  // 4. Project Reference Elbow Hints into Body Frame
  const origLeftElbowHintWorld = new THREE.Vector3(0.65, -0.60, -0.35).normalize();
  const origRightElbowHintWorld = new THREE.Vector3(-0.4, -0.8, -0.2).normalize();

  const leftElbowInBody = projectDirectionToBodyFrame(origLeftElbowHintWorld, directions);
  const rightElbowInBody = projectDirectionToBodyFrame(origRightElbowHintWorld, directions);

  // 5. Validation: Reconstruct World Positions from Body-Relative Representations & Measure Error
  const reconstructedViolinMountWorld = reconstructFromBodyFrame(positionInBodyFrame, anchorOrigin, directions);

  const reconstructedViolinDirY = reconstructDirectionFromBodyFrame(orientationInBodyFrame.forward, directions);
  const reconstructedViolinDirZ = reconstructDirectionFromBodyFrame(orientationInBodyFrame.up, directions);
  const reconstructedViolinDirX = reconstructDirectionFromBodyFrame(orientationInBodyFrame.right, directions);

  const reconstructedViolinWorldMat = new THREE.Matrix4().makeBasis(
    reconstructedViolinDirX,
    reconstructedViolinDirY,
    reconstructedViolinDirZ
  ).setPosition(reconstructedViolinMountWorld);

  const reconstructedViolinNeckWorld = neckTargetLocal.clone().applyMatrix4(reconstructedViolinWorldMat);
  const reconstructedBowContactWorld = bowContactLocal.clone().applyMatrix4(reconstructedViolinWorldMat);
  const reconstructedChinRestWorld = chinRestLocal.clone().applyMatrix4(reconstructedViolinWorldMat);
  const reconstructedLeftHandTargetWorld = reconstructedViolinNeckWorld.clone().addScaledVector(reconstructedViolinDirZ, -0.012);

  const reconstructedBowingDirWorld = new THREE.Vector3().crossVectors(reconstructedViolinDirY, reconstructedViolinDirZ).normalize();
  const reconstructedBowUp = reconstructedBowingDirWorld.clone();
  const reconstructedBowForward = reconstructedViolinDirZ.clone().negate();
  const reconstructedBowRight = new THREE.Vector3().crossVectors(reconstructedBowUp, reconstructedBowForward).normalize();

  const reconstructedBowWorldMat = new THREE.Matrix4().makeBasis(
    reconstructedBowRight,
    reconstructedBowUp,
    reconstructedBowForward
  ).setPosition(reconstructedBowContactWorld);

  const reconstructedBowGripWorld = origGripLocal.clone().applyMatrix4(reconstructedBowWorldMat);

  return {
    referenceBaseline: {
      height,
      shoulderWidth,
      torsoLength,
      neckLength,
      leftArmReach,
      rightArmReach,
    },
    violinMount: {
      anchorName: 'effectiveUpperChest',
      positionInBodyFrame,
      orientationInBodyFrame,
    },
    violinTargets: {
      neckTargetLocal,
      bowContactLocal,
      chinRestLocal,
      leftHandOffsetAlongZ: -0.012,
    },
    bowTargets: {
      gripLocal: origGripLocal,
    },
    elbowHintsInBodyFrame: {
      leftElbowInBody,
      rightElbowInBody,
    },
    reconstruction: {
      originalViolinMountWorld,
      reconstructedViolinMountWorld,
      violinMountErrorMeters: originalViolinMountWorld.distanceTo(reconstructedViolinMountWorld),

      originalViolinNeckWorld,
      reconstructedViolinNeckWorld,
      violinNeckErrorMeters: originalViolinNeckWorld.distanceTo(reconstructedViolinNeckWorld),

      originalChinRestWorld,
      reconstructedChinRestWorld,
      chinRestErrorMeters: originalChinRestWorld.distanceTo(reconstructedChinRestWorld),

      originalBowContactWorld,
      reconstructedBowContactWorld,
      bowContactErrorMeters: originalBowContactWorld.distanceTo(reconstructedBowContactWorld),

      originalBowGripWorld,
      reconstructedBowGripWorld,
      bowGripErrorMeters: originalBowGripWorld.distanceTo(reconstructedBowGripWorld),

      originalLeftHandTargetWorld,
      reconstructedLeftHandTargetWorld,
      leftHandTargetErrorMeters: originalLeftHandTargetWorld.distanceTo(reconstructedLeftHandTargetWorld),
    },
  };
}

/**
 * Formats the violin reference calibration dataset into a readable diagnostic report.
 */
export function formatReferenceCalibration(cal: ViolinReferenceCalibration): string {
  const fmtCoord = (c: Vector3InBodyFrame): string =>
    `[Right: ${c.right.toFixed(4)}m, Up: ${c.up.toFixed(4)}m, Fwd: ${c.forward.toFixed(4)}m]`;
  const fmtVec = (v: THREE.Vector3): string =>
    `(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;
  const fmtErr = (e: number): string => `${(e * 1000).toFixed(4)} mm`;

  return [
    'VIOLIN REFERENCE CALIBRATION',
    '',
    'Reference Baseline (test.vrm):',
    `  Height:             ${cal.referenceBaseline.height.toFixed(3)}m`,
    `  Shoulder Width:     ${cal.referenceBaseline.shoulderWidth.toFixed(3)}m`,
    `  Torso Length:       ${cal.referenceBaseline.torsoLength.toFixed(3)}m`,
    `  Neck Length:        ${cal.referenceBaseline.neckLength.toFixed(3)}m`,
    `  Left Arm Reach:     ${cal.referenceBaseline.leftArmReach.toFixed(3)}m`,
    `  Right Arm Reach:    ${cal.referenceBaseline.rightArmReach.toFixed(3)}m`,
    '',
    'Body-Relative Calibration (Anchored at EffectiveUpperChest):',
    `  Violin Mount Pos:   ${fmtCoord(cal.violinMount.positionInBodyFrame)}`,
    `  Violin Axis Y (Fwd):${fmtCoord(cal.violinMount.orientationInBodyFrame.forward)}`,
    `  Violin Axis Z (Up): ${fmtCoord(cal.violinMount.orientationInBodyFrame.up)}`,
    `  Violin Axis X (Rgt):${fmtCoord(cal.violinMount.orientationInBodyFrame.right)}`,
    `  Left Elbow Hint:    ${fmtCoord(cal.elbowHintsInBodyFrame.leftElbowInBody)}`,
    `  Right Elbow Hint:   ${fmtCoord(cal.elbowHintsInBodyFrame.rightElbowInBody)}`,
    '',
    'Reference Reconstruction Accuracy Validation:',
    `  Violin Mount:`,
    `    Original:         ${fmtVec(cal.reconstruction.originalViolinMountWorld)}`,
    `    Reconstructed:    ${fmtVec(cal.reconstruction.reconstructedViolinMountWorld)}`,
    `    Error:            ${fmtErr(cal.reconstruction.violinMountErrorMeters)}`,
    `  Violin Neck:`,
    `    Original:         ${fmtVec(cal.reconstruction.originalViolinNeckWorld)}`,
    `    Reconstructed:    ${fmtVec(cal.reconstruction.reconstructedViolinNeckWorld)}`,
    `    Error:            ${fmtErr(cal.reconstruction.violinNeckErrorMeters)}`,
    `  Chinrest:`,
    `    Original:         ${fmtVec(cal.reconstruction.originalChinRestWorld)}`,
    `    Reconstructed:    ${fmtVec(cal.reconstruction.reconstructedChinRestWorld)}`,
    `    Error:            ${fmtErr(cal.reconstruction.chinRestErrorMeters)}`,
    `  Bow Contact:`,
    `    Original:         ${fmtVec(cal.reconstruction.originalBowContactWorld)}`,
    `    Reconstructed:    ${fmtVec(cal.reconstruction.reconstructedBowContactWorld)}`,
    `    Error:            ${fmtErr(cal.reconstruction.bowContactErrorMeters)}`,
    `  Bow Grip:`,
    `    Original:         ${fmtVec(cal.reconstruction.originalBowGripWorld)}`,
    `    Reconstructed:    ${fmtVec(cal.reconstruction.reconstructedBowGripWorld)}`,
    `    Error:            ${fmtErr(cal.reconstruction.bowGripErrorMeters)}`,
    `  Left Hand Target:`,
    `    Original:         ${fmtVec(cal.reconstruction.originalLeftHandTargetWorld)}`,
    `    Reconstructed:    ${fmtVec(cal.reconstruction.reconstructedLeftHandTargetWorld)}`,
    `    Error:            ${fmtErr(cal.reconstruction.leftHandTargetErrorMeters)}`,
  ].join('\n');
}

/**
 * Diagnostic logger for violin reference calibration.
 */
export function logReferenceCalibration(cal: ViolinReferenceCalibration, modelName = 'Loaded Model'): void {
  console.log(`[MusicLab Reference Calibration Diagnostics] === ${modelName} ===\n` + formatReferenceCalibration(cal));
}
