import * as THREE from 'three';
import { CharacterBodyFrame } from './characterBodyFrame';

/**
 * Body-Relative Violin Anchors & Target Calculations (Stage 2)
 * 
 * Replaces hardcoded universal world coordinates with anatomical,
 * body-relative violin positioning derived from the character's body frame.
 * 
 * Flow:
 * Character Body Frame -> Canonical Body-Relative Ratios -> Character-Specific World Targets.
 * 
 * Preserves the reference model's existing pose with exact precision, while
 * establishing a reusable body-relative coordinate foundation.
 */

/** Canonical body-relative proportions derived from the verified reference character */
export const CANONICAL_VIOLIN_RATIOS = {
  /** Reference shoulder socket-to-socket width (m) */
  referenceShoulderWidth: 0.217,
  /** Reference chest-to-neck distance (m) */
  referenceChestToNeck: 0.246,
  /** Reference torso length (m) */
  referenceTorsoLength: 0.407,

  /**
   * Lateral placement ratio across left clavicle:
   * 0.08m offset / (0.217m shoulderWidth / 2) ≈ 0.7373
   */
  lateralShoulderRatio: 0.08 / (0.217 / 2),

  /**
   * Vertical placement ratio along chest-to-neck span:
   * 0.05m offset / 0.246m chestToNeck ≈ 0.2033
   */
  verticalChestRatio: 0.05 / 0.246,

  /**
   * Forward chest clearance ratio along torso depth:
   * 0.20m offset / 0.246m chestToNeck ≈ 0.8130
   */
  forwardChestRatio: 0.20 / 0.246,

  /**
   * Canonical Euler rotation of violin relative to thoracic chest coordinate frame
   * Order: 'YXZ'
   * X: Pitch (-14.3° neck downward/forward)
   * Y: Yaw (-31.5° neck leftward toward left hand)
   * Z: Roll (+29.8° soundboard tilted upward to receive bow)
   */
  violinLocalRotation: new THREE.Euler(-0.25, -0.55, 0.52, 'YXZ'),

  /** Instrument-local anchor offsets (m) */
  violinAnchors: {
    neckTarget: new THREE.Vector3(0, 0.205, 0.016),
    chinRestTarget: new THREE.Vector3(-0.048, -0.155, 0.045),
    bowContactPoint: new THREE.Vector3(0, 0.045, 0.045),
    leftHandOffsetFromNeckZ: -0.012,
  },

  bowAnchors: {
    frogGripPoint: new THREE.Vector3(0, -0.30, 0),
  },
};

export interface ViolinMountTransform {
  /** Recommended local offset relative to effective chest bone */
  localPosition: THREE.Vector3;
  /** Recommended local rotation relative to effective chest bone */
  localRotation: THREE.Euler;
  /** Resulting world position of violin body pivot */
  worldPosition: THREE.Vector3;
  /** Resulting world orientation of violin body */
  worldQuaternion: THREE.Quaternion;
  /** Resulting world transform matrix */
  worldMatrix: THREE.Matrix4;
}

export interface BowTransform {
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  worldMatrix: THREE.Matrix4;
  bowingDirection: THREE.Vector3;
}

export interface HeadChinRelationship {
  /** World position of violin chin rest target */
  chinRestWorldPos: THREE.Vector3;
  /** Current world position of head joint */
  headJointWorldPos: THREE.Vector3;
  /** Distance from head joint to chin rest in meters */
  distanceToChinRest: number;
  /** Offset vector from head to chin rest */
  headToChinRestOffset: THREE.Vector3;
}

export interface ViolinBodyAnchors {
  /** Body-relative violin mounting transform */
  violinMount: ViolinMountTransform;
  /** Target position on violin neck for left hand reach */
  violinNeckTarget: THREE.Vector3;
  /** Target position on chin rest */
  chinRestTarget: THREE.Vector3;
  /** Point where bow hair contacts the violin strings */
  bowContactPoint: THREE.Vector3;
  /** Bow world transform and bowing direction */
  bowTransform: BowTransform;
  /** Frog grip anchor where right hand grasps the bow */
  bowGripTarget: THREE.Vector3;
  /** Final calculated world target for left hand IK */
  leftHandTarget: THREE.Vector3;
  /** Final calculated world target for right hand IK */
  rightHandTarget: THREE.Vector3;
  /** Diagnostic relationship between head joint and chin rest */
  headChinRelationship: HeadChinRelationship;
}

/**
 * Calculates body-relative violin and bow anchor targets for a character.
 * 
 * @param frame CharacterBodyFrame extracted from normalized VRM
 * @returns ViolinBodyAnchors or null if frame is invalid
 */
export function calculateViolinBodyAnchors(frame: CharacterBodyFrame | null): ViolinBodyAnchors | null {
  if (!frame) return null;

  const { landmarks, metrics, chestWorldMatrix } = frame;

  // 1. Calculate Body-Relative Local Mounting Offset
  // Clamped anatomical references to prevent division by zero or extreme scaling
  const halfShoulderWidth = Math.max(0.08, (metrics.shoulderWidth || CANONICAL_VIOLIN_RATIOS.referenceShoulderWidth) / 2);
  const chestToNeck = Math.max(0.12, metrics.torso.chestToNeck || CANONICAL_VIOLIN_RATIOS.referenceChestToNeck);

  // Anatomical positioning:
  // X: Proportional to half-shoulder width across left collarbone
  const localX = CANONICAL_VIOLIN_RATIOS.lateralShoulderRatio * halfShoulderWidth;
  // Y: Proportional to vertical chest-to-neck torso height
  const localY = CANONICAL_VIOLIN_RATIOS.verticalChestRatio * chestToNeck;
  // Z: Proportional to thoracic depth (chest clearance)
  const localZ = CANONICAL_VIOLIN_RATIOS.forwardChestRatio * chestToNeck;

  const localPosition = new THREE.Vector3(
    Math.round(localX * 1000) / 1000,
    Math.round(localY * 1000) / 1000,
    Math.round(localZ * 1000) / 1000
  );

  const localRotation = CANONICAL_VIOLIN_RATIOS.violinLocalRotation.clone();

  // 2. Compute Violin World Transformation
  const localMat = new THREE.Matrix4().compose(
    localPosition,
    new THREE.Quaternion().setFromEuler(localRotation),
    new THREE.Vector3(1, 1, 1)
  );

  const violinWorldMatrix = new THREE.Matrix4().multiplyMatrices(chestWorldMatrix, localMat);
  const worldPosition = new THREE.Vector3().setFromMatrixPosition(violinWorldMatrix);
  const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(violinWorldMatrix);

  const violinMount: ViolinMountTransform = {
    localPosition,
    localRotation,
    worldPosition,
    worldQuaternion,
    worldMatrix: violinWorldMatrix,
  };

  // 3. Violin World Axes
  const violinDirY = new THREE.Vector3(0, 1, 0).transformDirection(violinWorldMatrix).normalize(); // Strings direction (+Y)
  const violinDirZ = new THREE.Vector3(0, 0, 1).transformDirection(violinWorldMatrix).normalize(); // Soundboard normal (+Z)

  // 4. Instrument Anchors in World Coordinates
  const violinNeckTarget = CANONICAL_VIOLIN_RATIOS.violinAnchors.neckTarget.clone().applyMatrix4(violinWorldMatrix);
  const chinRestTarget = CANONICAL_VIOLIN_RATIOS.violinAnchors.chinRestTarget.clone().applyMatrix4(violinWorldMatrix);
  const bowContactPoint = CANONICAL_VIOLIN_RATIOS.violinAnchors.bowContactPoint.clone().applyMatrix4(violinWorldMatrix);

  // Left Hand Target: Reaches fingerboard at neckTarget with slight offset along soundboard normal
  const leftHandTarget = violinNeckTarget.clone().addScaledVector(
    violinDirZ,
    CANONICAL_VIOLIN_RATIOS.violinAnchors.leftHandOffsetFromNeckZ
  );

  // 5. Bow World Alignment & Grip Target
  // Bow axis perpendicular to strings and parallel to soundboard
  const bowingDirWorld = new THREE.Vector3().crossVectors(violinDirY, violinDirZ).normalize();

  // Orthogonal bow world orientation:
  // Bow Up (+Y): along bowing direction
  // Bow Forward (+Z): facing outward, so hair ribbon (-Z) contacts strings at -violinDirZ
  const bowUp = bowingDirWorld.clone();
  const bowForward = violinDirZ.clone().negate();
  const bowRight = new THREE.Vector3().crossVectors(bowUp, bowForward).normalize();

  const bowWorldMat = new THREE.Matrix4().makeBasis(bowRight, bowUp, bowForward);
  bowWorldMat.setPosition(bowContactPoint);
  const bowWorldQuat = new THREE.Quaternion().setFromRotationMatrix(bowWorldMat);

  const bowTransform: BowTransform = {
    worldPosition: bowContactPoint.clone(),
    worldQuaternion: bowWorldQuat,
    worldMatrix: bowWorldMat,
    bowingDirection: bowingDirWorld,
  };

  // Bow Grip Point: frog position along bow
  const bowGripTarget = CANONICAL_VIOLIN_RATIOS.bowAnchors.frogGripPoint.clone().applyMatrix4(bowWorldMat);
  const rightHandTarget = bowGripTarget.clone();

  // 6. Diagnostic Head-to-Chin Relationship (Read-Only)
  const headPos = landmarks.head.clone();
  const distToChin = Math.round(headPos.distanceTo(chinRestTarget) * 1000) / 1000;
  const offsetToChin = new THREE.Vector3().subVectors(chinRestTarget, headPos);

  const headChinRelationship: HeadChinRelationship = {
    chinRestWorldPos: chinRestTarget,
    headJointWorldPos: headPos,
    distanceToChinRest: distToChin,
    headToChinRestOffset: offsetToChin,
  };

  return {
    violinMount,
    violinNeckTarget,
    chinRestTarget,
    bowContactPoint,
    bowTransform,
    bowGripTarget,
    leftHandTarget,
    rightHandTarget,
    headChinRelationship,
  };
}
