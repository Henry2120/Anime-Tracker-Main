import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface VRMLimbMetrics {
  upperArm: number;
  forearm: number;
  hand: number | null;
  totalReach: number;
}

export interface VRMTorsoMetrics {
  hipsToSpine: number | null;
  hipsToChest: number | null;
  chestToUpperChest: number | null;
  chestToNeck: number | null;
  effectiveChestToNeck: number | null;
}

export interface VRMNeckHeadMetrics {
  neckToHead: number | null;
  headToTopEstimate: number | null;
}

export interface VRMMetrics {
  height: number;
  shoulderWidth: number | null;
  leftClavicleSpan: number | null;
  rightClavicleSpan: number | null;
  torso: VRMTorsoMetrics;
  neckHead: VRMNeckHeadMetrics;
  leftArm: VRMLimbMetrics | null;
  rightArm: VRMLimbMetrics | null;
  hasUpperChest: boolean;
  hasChest: boolean;
  effectiveChestBone: 'upperChest' | 'chest' | null;
}

/**
 * Helper to safely extract world position of a normalized humanoid bone.
 */
function getBoneWorldPos(vrm: VRM, boneName: VRMHumanBoneName, outVec: THREE.Vector3): boolean {
  const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
  if (!bone) return false;
  bone.getWorldPosition(outVec);
  return true;
}

/**
 * Extracts read-only anatomical measurements from any loaded VRM humanoid model.
 * Uses normalized humanoid bone positions in world space without hardcoded constants.
 * If optional bones are missing, returns null for those measurements.
 */
export function extractVRMMetrics(vrm: VRM): VRMMetrics {
  // Ensure world matrices are fully updated before taking measurements
  vrm.scene.updateMatrixWorld(true);

  const tmpVecA = new THREE.Vector3();
  const tmpVecB = new THREE.Vector3();
  const tmpVecC = new THREE.Vector3();
  const tmpVecD = new THREE.Vector3();

  // 1. Overall Bounding Box Height
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const bboxHeight = bbox.max.y - bbox.min.y;

  // 2. Bone Existence Checks
  const hasHips = getBoneWorldPos(vrm, 'hips', tmpVecA);
  const hipsPos = hasHips ? tmpVecA.clone() : null;

  const hasSpine = getBoneWorldPos(vrm, 'spine', tmpVecB);
  const spinePos = hasSpine ? tmpVecB.clone() : null;

  const hasChest = getBoneWorldPos(vrm, 'chest', tmpVecC);
  const chestPos = hasChest ? tmpVecC.clone() : null;

  const hasUpperChest = getBoneWorldPos(vrm, 'upperChest', tmpVecD);
  const upperChestPos = hasUpperChest ? tmpVecD.clone() : null;

  const effectiveChestPos = upperChestPos || chestPos || spinePos;
  const effectiveChestBone: 'upperChest' | 'chest' | null = hasUpperChest
    ? 'upperChest'
    : hasChest
    ? 'chest'
    : null;

  const hasNeck = getBoneWorldPos(vrm, 'neck', tmpVecA);
  const neckPos = hasNeck ? tmpVecA.clone() : null;

  const hasHead = getBoneWorldPos(vrm, 'head', tmpVecB);
  const headPos = hasHead ? tmpVecB.clone() : null;

  // 3. Torso Measurements
  const hipsToSpine = hipsPos && spinePos ? hipsPos.distanceTo(spinePos) : null;
  const hipsToChest = hipsPos && chestPos ? hipsPos.distanceTo(chestPos) : null;
  const chestToUpperChest = chestPos && upperChestPos ? chestPos.distanceTo(upperChestPos) : null;
  const chestToNeck = chestPos && neckPos ? chestPos.distanceTo(neckPos) : null;
  const effectiveChestToNeck = effectiveChestPos && neckPos ? effectiveChestPos.distanceTo(neckPos) : null;

  // 4. Neck / Head Measurements
  const neckToHead = neckPos && headPos ? neckPos.distanceTo(headPos) : null;
  const headToTopEstimate = headPos ? Math.max(0, bbox.max.y - headPos.y) : null;

  // 5. Shoulder / Clavicle Measurements
  const hasLeftShoulder = getBoneWorldPos(vrm, 'leftShoulder', tmpVecA);
  const leftShoulderPos = hasLeftShoulder ? tmpVecA.clone() : null;

  const hasRightShoulder = getBoneWorldPos(vrm, 'rightShoulder', tmpVecB);
  const rightShoulderPos = hasRightShoulder ? tmpVecB.clone() : null;

  const hasLeftUpperArm = getBoneWorldPos(vrm, 'leftUpperArm', tmpVecC);
  const leftUpperArmPos = hasLeftUpperArm ? tmpVecC.clone() : null;

  const hasRightUpperArm = getBoneWorldPos(vrm, 'rightUpperArm', tmpVecD);
  const rightUpperArmPos = hasRightUpperArm ? tmpVecD.clone() : null;

  // Biacromial width: upperArm to upperArm span (or shoulder to shoulder if arms missing)
  const shoulderWidth =
    leftUpperArmPos && rightUpperArmPos
      ? leftUpperArmPos.distanceTo(rightUpperArmPos)
      : leftShoulderPos && rightShoulderPos
      ? leftShoulderPos.distanceTo(rightShoulderPos)
      : null;

  // Clavicle span: effective chest to shoulder/upperArm
  const leftClavicleSpan =
    effectiveChestPos && leftShoulderPos
      ? effectiveChestPos.distanceTo(leftShoulderPos)
      : leftShoulderPos && leftUpperArmPos
      ? leftShoulderPos.distanceTo(leftUpperArmPos)
      : null;

  const rightClavicleSpan =
    effectiveChestPos && rightShoulderPos
      ? effectiveChestPos.distanceTo(rightShoulderPos)
      : rightShoulderPos && rightUpperArmPos
      ? rightShoulderPos.distanceTo(rightUpperArmPos)
      : null;

  // 6. Left Arm Measurements
  let leftArm: VRMLimbMetrics | null = null;
  if (leftUpperArmPos) {
    const hasLeftLowerArm = getBoneWorldPos(vrm, 'leftLowerArm', tmpVecA);
    const leftLowerArmPos = hasLeftLowerArm ? tmpVecA.clone() : null;

    const hasLeftHand = getBoneWorldPos(vrm, 'leftHand', tmpVecB);
    const leftHandPos = hasLeftHand ? tmpVecB.clone() : null;

    if (leftLowerArmPos && leftHandPos) {
      const upperArm = leftUpperArmPos.distanceTo(leftLowerArmPos);
      const forearm = leftLowerArmPos.distanceTo(leftHandPos);

      // Optional hand length estimate (wrist to middle proximal)
      let handLength: number | null = null;
      const hasLeftMiddleProx = getBoneWorldPos(vrm, 'leftMiddleProximal', tmpVecC);
      if (hasLeftMiddleProx) {
        handLength = leftHandPos.distanceTo(tmpVecC);
      }

      leftArm = {
        upperArm,
        forearm,
        hand: handLength,
        totalReach: upperArm + forearm + (handLength || 0),
      };
    }
  }

  // 7. Right Arm Measurements
  let rightArm: VRMLimbMetrics | null = null;
  if (rightUpperArmPos) {
    const hasRightLowerArm = getBoneWorldPos(vrm, 'rightLowerArm', tmpVecA);
    const rightLowerArmPos = hasRightLowerArm ? tmpVecA.clone() : null;

    const hasRightHand = getBoneWorldPos(vrm, 'rightHand', tmpVecB);
    const rightHandPos = hasRightHand ? tmpVecB.clone() : null;

    if (rightLowerArmPos && rightHandPos) {
      const upperArm = rightUpperArmPos.distanceTo(rightLowerArmPos);
      const forearm = rightLowerArmPos.distanceTo(rightHandPos);

      let handLength: number | null = null;
      const hasRightMiddleProx = getBoneWorldPos(vrm, 'rightMiddleProximal', tmpVecC);
      if (hasRightMiddleProx) {
        handLength = rightHandPos.distanceTo(tmpVecC);
      }

      rightArm = {
        upperArm,
        forearm,
        hand: handLength,
        totalReach: upperArm + forearm + (handLength || 0),
      };
    }
  }

  return {
    height: bboxHeight,
    shoulderWidth,
    leftClavicleSpan,
    rightClavicleSpan,
    torso: {
      hipsToSpine,
      hipsToChest,
      chestToUpperChest,
      chestToNeck,
      effectiveChestToNeck,
    },
    neckHead: {
      neckToHead,
      headToTopEstimate,
    },
    leftArm,
    rightArm,
    hasUpperChest: Boolean(hasUpperChest),
    hasChest: Boolean(hasChest),
    effectiveChestBone,
  };
}

/**
 * Formats VRM metrics into a clean human-readable diagnostic string.
 */
export function formatVRMMetrics(metrics: VRMMetrics): string {
  const fmt = (val: number | null | undefined, unit = 'm'): string =>
    val != null ? `${val.toFixed(3)}${unit}` : 'N/A';

  return [
    'VRM METRICS',
    '',
    `Height: ${fmt(metrics.height)}`,
    `Shoulder Width: ${fmt(metrics.shoulderWidth)}`,
    `Left Clavicle Span: ${fmt(metrics.leftClavicleSpan)}`,
    `Right Clavicle Span: ${fmt(metrics.rightClavicleSpan)}`,
    '',
    'Torso',
    `Hips → Spine: ${fmt(metrics.torso.hipsToSpine)}`,
    `Hips → Chest: ${fmt(metrics.torso.hipsToChest)}`,
    `Chest → UpperChest: ${fmt(metrics.torso.chestToUpperChest)}`,
    `Chest → Neck: ${fmt(metrics.torso.chestToNeck)}`,
    `Effective Chest → Neck: ${fmt(metrics.torso.effectiveChestToNeck)}`,
    '',
    'Neck / Head',
    `Neck → Head: ${fmt(metrics.neckHead.neckToHead)}`,
    `Head → Top Estimate: ${fmt(metrics.neckHead.headToTopEstimate)}`,
    '',
    'Left Arm',
    `Upper Arm: ${fmt(metrics.leftArm?.upperArm)}`,
    `Forearm: ${fmt(metrics.leftArm?.forearm)}`,
    `Hand: ${fmt(metrics.leftArm?.hand)}`,
    `Total Reach: ${fmt(metrics.leftArm?.totalReach)}`,
    '',
    'Right Arm',
    `Upper Arm: ${fmt(metrics.rightArm?.upperArm)}`,
    `Forearm: ${fmt(metrics.rightArm?.forearm)}`,
    `Hand: ${fmt(metrics.rightArm?.hand)}`,
    `Total Reach: ${fmt(metrics.rightArm?.totalReach)}`,
  ].join('\n');
}

/**
 * Diagnostic logger to output formatted metrics to console when a model loads.
 */
export function logVRMMetrics(metrics: VRMMetrics, modelName = 'Loaded Model'): void {
  console.log(`[MusicLab VRM Diagnostics] === ${modelName} ===\n` + formatVRMMetrics(metrics));
}
