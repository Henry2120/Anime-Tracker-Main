import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { extractVRMMetrics, VRMBodyMetrics } from './vrmMetrics';

/**
 * Body-Relative Character Frame (Stage 2: Anatomical Coordinate Frame)
 * 
 * Extracts a complete, structured anatomical coordinate frame from the
 * normalized VRM humanoid skeleton in world space.
 * 
 * Coordinate System:
 * - Operates strictly on Normalized VRM Humanoid Bones (+X Left, -X Right, +Y Up, +Z Forward).
 * - All positions and directions are expressed in Three.js world coordinates.
 * - Units are meters.
 */

export interface CharacterBodyLandmarks {
  hips: THREE.Vector3;
  spine: THREE.Vector3;
  chest: THREE.Vector3;
  upperChest: THREE.Vector3 | null;
  /** Primary thoracic anchor (upperChest if available, otherwise chest) */
  effectiveChest: THREE.Vector3;
  neck: THREE.Vector3;
  head: THREE.Vector3;
  leftShoulder: THREE.Vector3;
  leftUpperArm: THREE.Vector3;
  leftLowerArm: THREE.Vector3;
  leftHand: THREE.Vector3;
  rightShoulder: THREE.Vector3;
  rightUpperArm: THREE.Vector3;
  rightLowerArm: THREE.Vector3;
  rightHand: THREE.Vector3;
}

export interface CharacterBodyDirections {
  /** Vertical upward axis from spine/hips to neck */
  up: THREE.Vector3;
  /** Forward facing direction perpendicular to shoulder axis and up */
  forward: THREE.Vector3;
  /** Leftward direction pointing toward character's left arm (+X) */
  left: THREE.Vector3;
  /** Rightward direction pointing toward character's right arm (-X) */
  right: THREE.Vector3;
  /** Normalized axis from right shoulder socket to left shoulder socket */
  shoulderAxis: THREE.Vector3;
}

export interface CharacterBodyFrame {
  /** Key 3D anatomical joint positions in world coordinates */
  landmarks: CharacterBodyLandmarks;
  /** Normalized orthogonal body direction vectors */
  directions: CharacterBodyDirections;
  /** Extracted body segment measurements */
  metrics: VRMBodyMetrics;
  /** World transformation matrix of the effective chest bone */
  chestWorldMatrix: THREE.Matrix4;
  /** World orientation quaternion of the effective chest bone */
  chestWorldQuaternion: THREE.Quaternion;
  /** Normalized bone node of the effective chest */
  effectiveChestNode: THREE.Object3D | null;
}

/**
 * Safely reads the world position of a normalized humanoid bone.
 */
function getBonePos(vrm: VRM, boneName: VRMHumanBoneName, fallbackPos: THREE.Vector3): THREE.Vector3 {
  const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
  if (!node) return fallbackPos.clone();
  const pos = new THREE.Vector3();
  node.getWorldPosition(pos);
  return pos;
}

/**
 * Extracts a complete, body-relative anatomical frame from a loaded VRM humanoid.
 * 
 * @param vrm Loaded VRM model instance
 * @returns CharacterBodyFrame or null if vrm / humanoid is invalid
 */
export function extractCharacterBodyFrame(vrm: VRM | null): CharacterBodyFrame | null {
  if (!vrm || !vrm.humanoid) return null;

  // Ensure world matrices are up-to-date across the VRM hierarchy
  vrm.scene.updateMatrixWorld(true);

  const humanoid = vrm.humanoid;
  const metrics = extractVRMMetrics(vrm);
  if (!metrics) return null;

  // 1. Fetch Key Bone Nodes
  const hipsNode = humanoid.getNormalizedBoneNode('hips' as VRMHumanBoneName);
  const spineNode = humanoid.getNormalizedBoneNode('spine' as VRMHumanBoneName);
  const chestNode = humanoid.getNormalizedBoneNode('chest' as VRMHumanBoneName);
  const upperChestNode = humanoid.getNormalizedBoneNode('upperChest' as VRMHumanBoneName);
  const neckNode = humanoid.getNormalizedBoneNode('neck' as VRMHumanBoneName);

  const effectiveChestNode = upperChestNode || chestNode || spineNode || hipsNode;
  const defaultPos = new THREE.Vector3();

  // 2. Extract Landmark World Positions
  const hips = getBonePos(vrm, 'hips' as VRMHumanBoneName, defaultPos);
  const spine = getBonePos(vrm, 'spine' as VRMHumanBoneName, hips);
  const chest = getBonePos(vrm, 'chest' as VRMHumanBoneName, spine);
  const upperChest = upperChestNode ? getBonePos(vrm, 'upperChest' as VRMHumanBoneName, chest) : null;
  const effectiveChest = upperChest || chest;
  const neck = getBonePos(vrm, 'neck' as VRMHumanBoneName, effectiveChest);
  const head = getBonePos(vrm, 'head' as VRMHumanBoneName, neck);

  const leftShoulder = getBonePos(vrm, 'leftShoulder' as VRMHumanBoneName, effectiveChest);
  const leftUpperArm = getBonePos(vrm, 'leftUpperArm' as VRMHumanBoneName, leftShoulder);
  const leftLowerArm = getBonePos(vrm, 'leftLowerArm' as VRMHumanBoneName, leftUpperArm);
  const leftHand = getBonePos(vrm, 'leftHand' as VRMHumanBoneName, leftLowerArm);

  const rightShoulder = getBonePos(vrm, 'rightShoulder' as VRMHumanBoneName, effectiveChest);
  const rightUpperArm = getBonePos(vrm, 'rightUpperArm' as VRMHumanBoneName, rightShoulder);
  const rightLowerArm = getBonePos(vrm, 'rightLowerArm' as VRMHumanBoneName, rightUpperArm);
  const rightHand = getBonePos(vrm, 'rightHand' as VRMHumanBoneName, rightLowerArm);

  const landmarks: CharacterBodyLandmarks = {
    hips,
    spine,
    chest,
    upperChest,
    effectiveChest,
    neck,
    head,
    leftShoulder,
    leftUpperArm,
    leftLowerArm,
    leftHand,
    rightShoulder,
    rightUpperArm,
    rightLowerArm,
    rightHand,
  };

  // 3. Compute Anatomical Direction Vectors
  // Up: along spine from hips/chest to neck
  let up = new THREE.Vector3().subVectors(neck, chest);
  if (up.lengthSq() < 1e-6) {
    up = new THREE.Vector3().subVectors(neck, hips);
  }
  if (up.lengthSq() < 1e-6) {
    up.set(0, 1, 0);
  } else {
    up.normalize();
  }

  // Shoulder Axis (Right Arm Root -> Left Arm Root)
  let shoulderAxis = new THREE.Vector3().subVectors(leftUpperArm, rightUpperArm);
  if (shoulderAxis.lengthSq() < 1e-6) {
    shoulderAxis.set(1, 0, 0);
  } else {
    shoulderAxis.normalize();
  }

  // Left & Right body directions
  const left = shoulderAxis.clone();
  const right = shoulderAxis.clone().negate();

  // Forward: orthogonal to shoulder axis and up direction
  const forward = new THREE.Vector3().crossVectors(shoulderAxis, up).normalize();

  // Re-orthogonalize Up to ensure an exact orthonormal basis
  up.crossVectors(forward, shoulderAxis).normalize();

  const directions: CharacterBodyDirections = {
    up,
    forward,
    left,
    right,
    shoulderAxis,
  };

  // 4. Effective Chest World Matrix & Quaternion
  const chestWorldMatrix = new THREE.Matrix4();
  const chestWorldQuaternion = new THREE.Quaternion();
  if (effectiveChestNode) {
    effectiveChestNode.updateMatrixWorld(true);
    chestWorldMatrix.copy(effectiveChestNode.matrixWorld);
    effectiveChestNode.getWorldQuaternion(chestWorldQuaternion);
  } else {
    chestWorldMatrix.makeBasis(left, up, forward);
    chestWorldMatrix.setPosition(effectiveChest);
    chestWorldQuaternion.setFromRotationMatrix(chestWorldMatrix);
  }

  return {
    landmarks,
    directions,
    metrics,
    chestWorldMatrix,
    chestWorldQuaternion,
    effectiveChestNode,
  };
}
