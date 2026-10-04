import * as THREE from 'three';
import { VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * 3D Spatial Transform representation
 */
export interface Transform3D {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/**
 * Humanoid Body Proportions and Metrics
 * Discovered dynamically from the loaded VRM humanoid skeleton,
 * with ZERO hardcoded height or limb assumptions.
 */
export interface HumanoidMetrics {
  /** Total height from floor (lowest foot) to head crown/top in meters */
  height: number;
  /** Height of eyes from ground */
  eyeHeight: number;
  /** Distance between left and right upper arm shoulder joints */
  shoulderWidth: number;
  /** Distance from hips to neck joint */
  torsoLength: number;
  /** Distance from neck joint to head joint */
  neckLength: number;

  upperArmLength: {
    left: number;
    right: number;
  };

  forearmLength: {
    left: number;
    right: number;
  };

  handLength: {
    left: number;
    right: number;
  };

  /** Total functional arm reach (upperArm + forearm + hand) in meters */
  armReach: {
    left: number;
    right: number;
  };

  /** Head radius estimate */
  headRadius: number;

  /** Rest/T-pose anatomical anchor positions in model world coordinates */
  anchors: {
    hips: THREE.Vector3;
    spine: THREE.Vector3;
    chest: THREE.Vector3;
    upperChest?: THREE.Vector3;
    effectiveChest: THREE.Vector3;
    neck: THREE.Vector3;
    head: THREE.Vector3;
    chin: THREE.Vector3;
    leftCollarboneShelf: THREE.Vector3;
    leftShoulder: THREE.Vector3;
    rightShoulder: THREE.Vector3;
    leftUpperArm: THREE.Vector3;
    rightUpperArm: THREE.Vector3;
    leftLowerArm: THREE.Vector3;
    rightLowerArm: THREE.Vector3;
    leftHand: THREE.Vector3;
    rightHand: THREE.Vector3;
  };

  /** Anatomical flags */
  isChibi: boolean;
  hasUpperChest: boolean;
  hasFingerBones: {
    left: boolean;
    right: boolean;
  };
}

/**
 * Finger interaction target descriptors for believable hand holds
 */
export interface FingerTargets {
  thumbCurl: number; // 0 (flat) to 1 (full curl)
  thumbOpposition: number; // 0 to 1
  indexCurl: number;
  middleCurl: number;
  ringCurl: number;
  littleCurl: number;
  fingerSpread?: number;
}

/**
 * Hand Interaction Frame
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * Wrist is NOT the grip!
 * The hierarchy is forearm -> wrist -> palm -> fingers -> grip.
 */
export interface HandInteractionFrame {
  /** Wrist joint transform */
  wrist: Transform3D;
  /** Center of palm */
  palm: Transform3D;
  /** Authoritative grip center & orientation where the instrument/prop is held */
  grip: Transform3D;
  /** Finger pose targets */
  fingerTargets: FingerTargets;
}

/**
 * Analytical Arm Two-Bone IK Solution
 */
export interface ArmIKSolution {
  upperArmQuat: THREE.Quaternion;
  lowerArmQuat: THREE.Quaternion;
  handQuat: THREE.Quaternion;
  shoulderPos: THREE.Vector3;
  elbowPos: THREE.Vector3;
  wristPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  targetDistance: number;
  maxReach: number;
  reachRatio: number;
  isReachable: boolean;
  isHyperextended: boolean;
  elbowAngleDeg: number;
}

/**
 * Validation check item
 */
export interface ValidationCheck {
  id: string;
  label: string;
  weight: number;
  achievedScore: number;
  passed: boolean;
  measurementValue: number;
  targetError: number; // theoretical target error (mm or deg)
  actualError: number; // measured from actual rendered VRM bones in world space (mm or deg)
  unit: string;
  threshold: number;
  details: string;
}

export type InteractionState = 'excellent' | 'acceptable' | 'questionable' | 'invalid';

/**
 * Interaction Validation Report
 */
export interface ValidationResult {
  score: number; // 0 to 100 percentage based on actual rendered skeleton
  state: InteractionState;
  checks: ValidationCheck[];
  leftHandReachMm: number;
  rightHandReachMm: number;
  chinrestDistMm: number;
  bowStringAlignmentAngleDeg: number;
  bowHairToStringDistMm: number;
  leftElbowValid: boolean;
  rightElbowValid: boolean;
  hyperextended: boolean;
  hardFailures: string[];
  actualBoneErrors?: {
    chinMm: number;
    leftHandCradleMm: number;
    rightHandGripMm: number;
    bowHairMm: number;
    bowAngleDeg: number;
    leftElbowDeg: number;
    rightElbowDeg: number;
  };
  notes: string[];
}

/**
 * Full Co-Solved Interaction Result
 */
export interface InteractionSolution {
  instrumentScale: number;
  instrumentTransform: Transform3D;
  accessoryTransform: Transform3D; // Bow for violin
  leftArmIK: ArmIKSolution;
  rightArmIK: ArmIKSolution;
  leftHandFrame: HandInteractionFrame;
  rightHandFrame: HandInteractionFrame;
  leftShoulderRotation?: THREE.Quaternion;
  rightShoulderRotation?: THREE.Quaternion;
  headRotation: THREE.Quaternion;
  neckRotation: THREE.Quaternion;
  spineRotation: THREE.Quaternion;
  chestRotation: THREE.Quaternion;
  validation: ValidationResult;
}
