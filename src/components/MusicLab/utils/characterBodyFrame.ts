import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface AnatomicalLandmarks {
  hips: THREE.Vector3 | null;
  spine: THREE.Vector3 | null;
  chest: THREE.Vector3 | null;
  upperChest: THREE.Vector3 | null;
  effectiveUpperChest: THREE.Vector3;
  effectiveChest: THREE.Vector3;
  neck: THREE.Vector3 | null;
  head: THREE.Vector3 | null;
  leftShoulder: THREE.Vector3 | null;
  rightShoulder: THREE.Vector3 | null;
  leftUpperArm: THREE.Vector3 | null;
  rightUpperArm: THREE.Vector3 | null;
  leftElbow: THREE.Vector3 | null; // leftLowerArm
  rightElbow: THREE.Vector3 | null; // rightLowerArm
  leftWrist: THREE.Vector3 | null; // leftHand
  rightWrist: THREE.Vector3 | null; // rightHand
}

export interface BodyDirections {
  up: THREE.Vector3;
  down: THREE.Vector3;
  forward: THREE.Vector3;
  back: THREE.Vector3;
  left: THREE.Vector3;
  right: THREE.Vector3;
  shoulderAxis: THREE.Vector3; // left-to-right vector
}

export interface AnatomicalRatios {
  shoulderWidthToHeight: number | null;
  leftUpperArmToHeight: number | null;
  leftForearmToHeight: number | null;
  leftHandToHeight: number | null;
  leftTotalReachToHeight: number | null;
  rightUpperArmToHeight: number | null;
  rightForearmToHeight: number | null;
  rightHandToHeight: number | null;
  rightTotalReachToHeight: number | null;
  torsoLengthToHeight: number | null;
  neckLengthToHeight: number | null;
}

export interface CharacterBodyFrame {
  height: number;
  landmarks: AnatomicalLandmarks;
  directions: BodyDirections;
  ratios: AnatomicalRatios;
  hasUpperChest: boolean;
  hasShoulders: boolean;
  usedUpperChestFallback: boolean;
}

/**
 * Safely extracts world position of a normalized humanoid bone.
 */
function getBoneWorldPosition(vrm: VRM, boneName: VRMHumanBoneName): THREE.Vector3 | null {
  const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
  if (!bone) return null;
  const pos = new THREE.Vector3();
  bone.getWorldPosition(pos);
  return pos;
}

/**
 * Constructs an anatomical body coordinate frame from any loaded VRM humanoid model.
 * Derives natural coordinate directions (up, forward, right) from the skeleton geometry
 * rather than assuming fixed world axes.
 */
export function buildCharacterBodyFrame(vrm: VRM): CharacterBodyFrame {
  // Ensure world transformations are fully resolved
  vrm.scene.updateMatrixWorld(true);

  // 1. Total bounding box height
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const height = Math.max(0.001, bbox.max.y - bbox.min.y);

  // 2. Extract landmark positions in world space
  const hips = getBoneWorldPosition(vrm, 'hips');
  const spine = getBoneWorldPosition(vrm, 'spine');
  const chest = getBoneWorldPosition(vrm, 'chest');
  const upperChest = getBoneWorldPosition(vrm, 'upperChest');
  const neck = getBoneWorldPosition(vrm, 'neck');
  const head = getBoneWorldPosition(vrm, 'head');

  const leftShoulder = getBoneWorldPosition(vrm, 'leftShoulder');
  const rightShoulder = getBoneWorldPosition(vrm, 'rightShoulder');
  const leftUpperArm = getBoneWorldPosition(vrm, 'leftUpperArm');
  const rightUpperArm = getBoneWorldPosition(vrm, 'rightUpperArm');
  const leftElbow = getBoneWorldPosition(vrm, 'leftLowerArm');
  const rightElbow = getBoneWorldPosition(vrm, 'rightLowerArm');
  const leftWrist = getBoneWorldPosition(vrm, 'leftHand');
  const rightWrist = getBoneWorldPosition(vrm, 'rightHand');

  // Fallbacks for effective chest / upper chest
  const hasUpperChest = upperChest !== null;
  const usedUpperChestFallback = !hasUpperChest;
  const effectiveUpperChest = (upperChest || chest || spine || hips || new THREE.Vector3(0, height * 0.75, 0)).clone();
  const effectiveChest = (chest || spine || hips || new THREE.Vector3(0, height * 0.65, 0)).clone();

  const landmarks: AnatomicalLandmarks = {
    hips,
    spine,
    chest,
    upperChest,
    effectiveUpperChest,
    effectiveChest,
    neck,
    head,
    leftShoulder,
    rightShoulder,
    leftUpperArm,
    rightUpperArm,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
  };

  // 3. Derive anatomical body directions
  // Up direction: hips -> effective upper chest / neck
  let up = new THREE.Vector3(0, 1, 0);
  if (hips && (neck || effectiveUpperChest)) {
    const topLandmark = neck || effectiveUpperChest;
    up.subVectors(topLandmark, hips).normalize();
  } else if (vrm.scene) {
    up.set(0, 1, 0).applyQuaternion(vrm.scene.quaternion).normalize();
  }

  // Shoulder axis / Right direction: left shoulder/arm -> right shoulder/arm
  let right = new THREE.Vector3(1, 0, 0);
  const leftAnchor = leftUpperArm || leftShoulder;
  const rightAnchor = rightUpperArm || rightShoulder;

  if (leftAnchor && rightAnchor) {
    right.subVectors(rightAnchor, leftAnchor).normalize();
  } else if (vrm.scene) {
    right.set(1, 0, 0).applyQuaternion(vrm.scene.quaternion).normalize();
  }

  // Orthogonalize right vector with respect to up
  const rightProj = up.clone().multiplyScalar(right.dot(up));
  right.sub(rightProj).normalize();

  // Forward direction: anatomical cross product of right x up (Right-handed frame)
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();

  const down = up.clone().negate();
  const left = right.clone().negate();
  const back = forward.clone().negate();
  const shoulderAxis = right.clone();

  const directions: BodyDirections = {
    up,
    down,
    forward,
    back,
    left,
    right,
    shoulderAxis,
  };

  // 4. Derive anatomical ratios relative to total height
  const shoulderSpan = leftAnchor && rightAnchor ? leftAnchor.distanceTo(rightAnchor) : null;
  const shoulderWidthToHeight = shoulderSpan !== null ? shoulderSpan / height : null;

  const leftUpperArmLen = leftUpperArm && leftElbow ? leftUpperArm.distanceTo(leftElbow) : null;
  const leftForearmLen = leftElbow && leftWrist ? leftElbow.distanceTo(leftWrist) : null;
  const leftHandLen = leftWrist && getBoneWorldPosition(vrm, 'leftMiddleProximal')
    ? leftWrist.distanceTo(getBoneWorldPosition(vrm, 'leftMiddleProximal')!)
    : null;
  const leftTotalReach = (leftUpperArmLen || 0) + (leftForearmLen || 0) + (leftHandLen || 0);

  const rightUpperArmLen = rightUpperArm && rightElbow ? rightUpperArm.distanceTo(rightElbow) : null;
  const rightForearmLen = rightElbow && rightWrist ? rightElbow.distanceTo(rightWrist) : null;
  const rightHandLen = rightWrist && getBoneWorldPosition(vrm, 'rightMiddleProximal')
    ? rightWrist.distanceTo(getBoneWorldPosition(vrm, 'rightMiddleProximal')!)
    : null;
  const rightTotalReach = (rightUpperArmLen || 0) + (rightForearmLen || 0) + (rightHandLen || 0);

  const torsoLen = hips && neck ? hips.distanceTo(neck) : null;
  const neckLen = neck && head ? neck.distanceTo(head) : null;

  const ratios: AnatomicalRatios = {
    shoulderWidthToHeight,
    leftUpperArmToHeight: leftUpperArmLen !== null ? leftUpperArmLen / height : null,
    leftForearmToHeight: leftForearmLen !== null ? leftForearmLen / height : null,
    leftHandToHeight: leftHandLen !== null ? leftHandLen / height : null,
    leftTotalReachToHeight: leftTotalReach > 0 ? leftTotalReach / height : null,
    rightUpperArmToHeight: rightUpperArmLen !== null ? rightUpperArmLen / height : null,
    rightForearmToHeight: rightForearmLen !== null ? rightForearmLen / height : null,
    rightHandToHeight: rightHandLen !== null ? rightHandLen / height : null,
    rightTotalReachToHeight: rightTotalReach > 0 ? rightTotalReach / height : null,
    torsoLengthToHeight: torsoLen !== null ? torsoLen / height : null,
    neckLengthToHeight: neckLen !== null ? neckLen / height : null,
  };

  return {
    height,
    landmarks,
    directions,
    ratios,
    hasUpperChest,
    hasShoulders: leftShoulder !== null && rightShoulder !== null,
    usedUpperChestFallback,
  };
}

/**
 * Formats character body frame diagnostics for display or logging.
 */
export function formatCharacterBodyFrame(frame: CharacterBodyFrame): string {
  const fmtVec = (v: THREE.Vector3): string =>
    `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
  const fmtRatio = (r: number | null | undefined): string =>
    r != null ? `${(r * 100).toFixed(1)}%` : 'N/A';

  return [
    'CHARACTER BODY FRAME',
    '',
    `Height: ${frame.height.toFixed(3)}m`,
    `UpperChest Present: ${frame.hasUpperChest ? 'YES' : 'NO (Using Chest Fallback)'}`,
    `Shoulders Present: ${frame.hasShoulders ? 'YES' : 'NO'}`,
    '',
    'Body Directions (Normalized):',
    `  Up:      ${fmtVec(frame.directions.up)}`,
    `  Forward: ${fmtVec(frame.directions.forward)}`,
    `  Right:   ${fmtVec(frame.directions.right)}`,
    '',
    'Anatomical Proportions (% of Height):',
    `  Shoulder Width: ${fmtRatio(frame.ratios.shoulderWidthToHeight)}`,
    `  Torso Length:   ${fmtRatio(frame.ratios.torsoLengthToHeight)}`,
    `  Neck Length:    ${fmtRatio(frame.ratios.neckLengthToHeight)}`,
    `  Left Arm Reach: ${fmtRatio(frame.ratios.leftTotalReachToHeight)}`,
    `  Right Arm Reach:${fmtRatio(frame.ratios.rightTotalReachToHeight)}`,
  ].join('\n');
}

/**
 * Diagnostic logger for character body frame.
 */
export function logCharacterBodyFrame(frame: CharacterBodyFrame, modelName = 'Loaded Model'): void {
  console.log(`[MusicLab Body Frame Diagnostics] === ${modelName} ===\n` + formatCharacterBodyFrame(frame));
}
