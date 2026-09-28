import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * VRM Body Metrics Extraction Utility (Stage 1: Character Measurement Layer)
 * 
 * Coordinate System Assumptions:
 * - Operates strictly on Normalized VRM Humanoid Bones via `vrm.humanoid.getNormalizedBoneNode(...)`.
 * - Units are in meters (Three.js standard, e.g., 1.66 = 166 cm).
 * - Rest pose orientation:
 *     +Y: Vertical upward axis (feet -> head)
 *     +X: Leftward axis (character's left arm)
 *     -X: Rightward axis (character's right arm)
 *     +Z: Forward axis (direction character faces)
 * 
 * Important Rules:
 * - Pure diagnostic measurement of the CHARACTER anatomy.
 * - Does NOT compute violin offsets, IK poses, or arm hints.
 * - Gracefully handles missing optional bones (e.g., upperChest, shoulders) with nulls instead of NaN.
 */

export interface ArmMetrics {
  /** Upper arm segment length (upperArm -> lowerArm) in meters */
  upperArmLength: number | null;
  /** Forearm segment length (lowerArm -> hand) in meters */
  forearmLength: number | null;
  /** Hand length (wrist joint -> middle finger knuckle / tip) in meters, if measurable */
  handLength: number | null;
  /** Total arm length (upper arm + forearm [+ hand if available]) in meters */
  totalArmLength: number | null;
}

export interface TorsoMetrics {
  /** Distance from hips to neck joint in meters */
  hipsToNeck: number | null;
  /** Distance from hips to chest joint in meters */
  hipsToChest: number | null;
  /** Distance between chest and upperChest (null if upperChest missing) */
  chestToUpperChest: number | null;
  /** Distance from upperChest (or chest) to neck in meters */
  chestToNeck: number | null;
}

export interface HeadNeckMetrics {
  /** Distance between neck joint and head joint in meters */
  neckToHeadDistance: number | null;
  /** Vertical Y delta from neck to head joint in meters */
  verticalNeckToHead: number | null;
}

export interface VRMBodyMetrics {
  /** Total visual character height in meters (measured from mesh bounding box) */
  characterHeight: number;
  /** Shoulder socket-to-socket width (leftUpperArm <-> rightUpperArm) in meters */
  shoulderWidth: number | null;
  /** Clavicle-to-clavicle distance (leftShoulder <-> rightShoulder) if available */
  clavicleWidth: number | null;
  /** Torso segment measurements */
  torso: TorsoMetrics;
  /** Left arm anatomical measurements */
  leftArm: ArmMetrics;
  /** Right arm anatomical measurements */
  rightArm: ArmMetrics;
  /** Head and neck joint relationship */
  headNeck: HeadNeckMetrics;
  /** Bone availability report for optional/critical bones */
  availableBones: {
    hips: boolean;
    spine: boolean;
    chest: boolean;
    upperChest: boolean;
    neck: boolean;
    head: boolean;
    leftShoulder: boolean;
    leftUpperArm: boolean;
    leftLowerArm: boolean;
    leftHand: boolean;
    rightShoulder: boolean;
    rightUpperArm: boolean;
    rightLowerArm: boolean;
    rightHand: boolean;
  };
}

/**
 * Helper to safely get the world position of a normalized bone node.
 */
function getBoneWorldPos(vrm: VRM, boneName: VRMHumanBoneName): THREE.Vector3 | null {
  const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
  if (!node) return null;
  const pos = new THREE.Vector3();
  node.getWorldPosition(pos);
  return pos;
}

/**
 * Safely computes Euclidean distance between two positions.
 * Returns null if either position is missing or NaN.
 */
function getDistance(posA: THREE.Vector3 | null, posB: THREE.Vector3 | null): number | null {
  if (!posA || !posB) return null;
  const dist = posA.distanceTo(posB);
  return isNaN(dist) ? null : Math.round(dist * 1000) / 1000;
}

/**
 * Pure function: Extracts anatomical proportions and segment lengths from a VRM model.
 * 
 * @param vrm Loaded VRM model instance
 * @returns VRMBodyMetrics object or null if vrm / humanoid is invalid
 */
export function extractVRMMetrics(vrm: VRM | null): VRMBodyMetrics | null {
  if (!vrm || !vrm.humanoid) return null;

  // Ensure world matrices are fully updated before reading joint positions
  vrm.scene.updateMatrixWorld(true);

  // 1. Check bone availability
  const checkBone = (name: VRMHumanBoneName): boolean =>
    Boolean(vrm.humanoid?.getNormalizedBoneNode(name));

  const availableBones = {
    hips: checkBone('hips' as VRMHumanBoneName),
    spine: checkBone('spine' as VRMHumanBoneName),
    chest: checkBone('chest' as VRMHumanBoneName),
    upperChest: checkBone('upperChest' as VRMHumanBoneName),
    neck: checkBone('neck' as VRMHumanBoneName),
    head: checkBone('head' as VRMHumanBoneName),
    leftShoulder: checkBone('leftShoulder' as VRMHumanBoneName),
    leftUpperArm: checkBone('leftUpperArm' as VRMHumanBoneName),
    leftLowerArm: checkBone('leftLowerArm' as VRMHumanBoneName),
    leftHand: checkBone('leftHand' as VRMHumanBoneName),
    rightShoulder: checkBone('rightShoulder' as VRMHumanBoneName),
    rightUpperArm: checkBone('rightUpperArm' as VRMHumanBoneName),
    rightLowerArm: checkBone('rightLowerArm' as VRMHumanBoneName),
    rightHand: checkBone('rightHand' as VRMHumanBoneName),
  };

  // 2. Fetch joint world positions
  const posHips = getBoneWorldPos(vrm, 'hips' as VRMHumanBoneName);
  const posChest = getBoneWorldPos(vrm, 'chest' as VRMHumanBoneName);
  const posUpperChest = getBoneWorldPos(vrm, 'upperChest' as VRMHumanBoneName);
  const posNeck = getBoneWorldPos(vrm, 'neck' as VRMHumanBoneName);
  const posHead = getBoneWorldPos(vrm, 'head' as VRMHumanBoneName);

  const posLeftShoulder = getBoneWorldPos(vrm, 'leftShoulder' as VRMHumanBoneName);
  const posLeftUpperArm = getBoneWorldPos(vrm, 'leftUpperArm' as VRMHumanBoneName);
  const posLeftLowerArm = getBoneWorldPos(vrm, 'leftLowerArm' as VRMHumanBoneName);
  const posLeftHand = getBoneWorldPos(vrm, 'leftHand' as VRMHumanBoneName);
  const posLeftMiddleProx = getBoneWorldPos(vrm, 'leftMiddleProximal' as VRMHumanBoneName);
  const posLeftMiddleDist = getBoneWorldPos(vrm, 'leftMiddleDistal' as VRMHumanBoneName);

  const posRightShoulder = getBoneWorldPos(vrm, 'rightShoulder' as VRMHumanBoneName);
  const posRightUpperArm = getBoneWorldPos(vrm, 'rightUpperArm' as VRMHumanBoneName);
  const posRightLowerArm = getBoneWorldPos(vrm, 'rightLowerArm' as VRMHumanBoneName);
  const posRightHand = getBoneWorldPos(vrm, 'rightHand' as VRMHumanBoneName);
  const posRightMiddleProx = getBoneWorldPos(vrm, 'rightMiddleProximal' as VRMHumanBoneName);
  const posRightMiddleDist = getBoneWorldPos(vrm, 'rightMiddleDistal' as VRMHumanBoneName);

  // 3. Overall Character Height (meters)
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const bboxHeight = bbox.max.y - bbox.min.y;
  const characterHeight = Math.round(bboxHeight * 1000) / 1000;

  // 4. Shoulder & Clavicle Widths
  // Socket-to-socket is the primary reliable measurement between arm roots
  const shoulderWidth = getDistance(posLeftUpperArm, posRightUpperArm);
  const clavicleWidth = getDistance(posLeftShoulder, posRightShoulder);

  // 5. Torso Metrics
  const effectiveChestPos = posUpperChest || posChest;
  const torso: TorsoMetrics = {
    hipsToNeck: getDistance(posHips, posNeck),
    hipsToChest: getDistance(posHips, posChest),
    chestToUpperChest: getDistance(posChest, posUpperChest),
    chestToNeck: getDistance(effectiveChestPos, posNeck),
  };

  // 6. Left Arm Metrics
  const leftUpper = getDistance(posLeftUpperArm, posLeftLowerArm);
  const leftForearm = getDistance(posLeftLowerArm, posLeftHand);
  const leftHandLen = posLeftHand && posLeftMiddleDist
    ? getDistance(posLeftHand, posLeftMiddleDist)
    : posLeftHand && posLeftMiddleProx
    ? Math.round((getDistance(posLeftHand, posLeftMiddleProx) || 0) * 1.8 * 1000) / 1000
    : null;

  const leftTotal = (leftUpper !== null && leftForearm !== null)
    ? Math.round((leftUpper + leftForearm + (leftHandLen || 0)) * 1000) / 1000
    : null;

  const leftArm: ArmMetrics = {
    upperArmLength: leftUpper,
    forearmLength: leftForearm,
    handLength: leftHandLen,
    totalArmLength: leftTotal,
  };

  // 7. Right Arm Metrics
  const rightUpper = getDistance(posRightUpperArm, posRightLowerArm);
  const rightForearm = getDistance(posRightLowerArm, posRightHand);
  const rightHandLen = posRightHand && posRightMiddleDist
    ? getDistance(posRightHand, posRightMiddleDist)
    : posRightHand && posRightMiddleProx
    ? Math.round((getDistance(posRightHand, posRightMiddleProx) || 0) * 1.8 * 1000) / 1000
    : null;

  const rightTotal = (rightUpper !== null && rightForearm !== null)
    ? Math.round((rightUpper + rightForearm + (rightHandLen || 0)) * 1000) / 1000
    : null;

  const rightArm: ArmMetrics = {
    upperArmLength: rightUpper,
    forearmLength: rightForearm,
    handLength: rightHandLen,
    totalArmLength: rightTotal,
  };

  // 8. Head & Neck Relationship
  const neckToHeadDistance = getDistance(posNeck, posHead);
  const verticalNeckToHead = (posNeck && posHead)
    ? Math.round((posHead.y - posNeck.y) * 1000) / 1000
    : null;

  const headNeck: HeadNeckMetrics = {
    neckToHeadDistance,
    verticalNeckToHead,
  };

  return {
    characterHeight,
    shoulderWidth,
    clavicleWidth,
    torso,
    leftArm,
    rightArm,
    headNeck,
    availableBones,
  };
}
