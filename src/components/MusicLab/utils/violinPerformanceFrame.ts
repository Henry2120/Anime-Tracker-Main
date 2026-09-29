import * as THREE from 'three';
import { CharacterBodyFrame } from './characterBodyFrame';

export interface InstrumentTargets {
  supportPoint: THREE.Vector3;
  violinCenter: THREE.Vector3;
  violinNeckTarget: THREE.Vector3;
  chinRestTarget: THREE.Vector3;
  bowContactTarget: THREE.Vector3;
  bowGripTarget: THREE.Vector3;
}

export interface ArmTargets {
  shoulderTarget: THREE.Vector3;
  elbowTarget: THREE.Vector3;
  wristTarget: THREE.Vector3;
  handTarget: THREE.Vector3;
  shoulderToHandDistance: number;
  upperArmLength: number;
  forearmLength: number;
  maximumUsableReach: number;
  isReachClamped: boolean;
}

export interface HeadTargets {
  head: THREE.Vector3;
  neck: THREE.Vector3;
  chinTarget: THREE.Vector3;
  headToChinDistance: number;
  neckToChinDistance: number;
}

export interface OrientationBasis {
  violinForward: THREE.Vector3; // Longitudinal axis along fingerboard towards scroll
  violinUp: THREE.Vector3;      // Soundboard normal towards strings/chin
  violinRight: THREE.Vector3;   // Lateral bout axis across strings
  bowDirection: THREE.Vector3;  // Stroke vector along bow hair
  bowUp: THREE.Vector3;         // Direction perpendicular to bow hair
  angleToLeftDeg: number;       // Angle between violinForward and bodyFrame.left (deg)
  angleToUpDeg: number;         // Angle between violinUp and bodyFrame.up (deg)
}

export interface BowDiagnostics {
  bowContact: THREE.Vector3;
  bowGrip: THREE.Vector3;
  bowDirection: THREE.Vector3;
  contactToGripDistance: number;
  isBowAdapted: boolean;
}

export interface ViolinPerformanceFrame {
  instrument: InstrumentTargets;
  leftArm: ArmTargets;
  rightArm: ArmTargets;
  head: HeadTargets;
  orientation: OrientationBasis;
  bow: BowDiagnostics;
  clampedTargets: string[];
}

export interface ViolinPerformanceOptions {
  /** Bowing stroke phase between 0 (frog) and 1 (tip). Defaults to 0.35. */
  bowStrokePhase?: number;
}

/**
 * Calculates an anatomically grounded violin performance frame from a character's body frame.
 * Does NOT rely on hardcoded world coordinates, arbitrary rotations, or old pose offsets.
 */
export function buildViolinPerformanceFrame(
  bodyFrame: CharacterBodyFrame,
  options: ViolinPerformanceOptions = {}
): ViolinPerformanceFrame {
  const { landmarks, directions, height, ratios } = bodyFrame;
  const clampedTargets: string[] = [];

  const bowStrokePhase = options.bowStrokePhase ?? 0.35;

  // 1. Generic 4/4 Violin & Bow Instrument Dimensions (Meters)
  const VIOLIN_NECK_PLAY_DIST = 0.210;       // 1st position on fingerboard
  const VIOLIN_CHINREST_OFFSET_LONG = -0.135;// Longitudinal offset from body center to chinrest
  const VIOLIN_CHINREST_OFFSET_LAT = -0.035; // Lateral offset towards player's left bout
  const VIOLIN_CHINREST_HEIGHT = 0.038;      // Height above soundboard plane
  const BOW_CONTACT_OFFSET_LONG = 0.045;     // Contact point along violin longitudinal axis
  const BOW_CONTACT_HEIGHT = 0.048;          // Height of strings above soundboard
  const STANDARD_BOW_LENGTH = 0.720;         // Full 4/4 violin bow length

  // 2. Character Anatomical Anchors
  const torsoHeight = (ratios.torsoLengthToHeight ?? 0.25) * height;
  const shoulderSpan = (ratios.shoulderWidthToHeight ?? 0.135) * height;
  const neckToHeadLen = (ratios.neckLengthToHeight ?? 0.046) * height;

  const leftShoulderPos = (landmarks.leftUpperArm || landmarks.leftShoulder ||
    landmarks.effectiveUpperChest.clone().addScaledVector(directions.left, shoulderSpan * 0.5)).clone();

  const rightShoulderPos = (landmarks.rightUpperArm || landmarks.rightShoulder ||
    landmarks.effectiveUpperChest.clone().addScaledVector(directions.right, shoulderSpan * 0.5)).clone();

  const neckPos = (landmarks.neck ||
    landmarks.effectiveUpperChest.clone().addScaledVector(directions.up, torsoHeight * 0.15)).clone();
  const headPos = (landmarks.head ||
    neckPos.clone().addScaledVector(directions.up, neckToHeadLen)).clone();

  // 3. Facial Chin / Lower-Jaw Landmark Estimation
  // Chin is located slightly in front of and below the head center, offset towards the left lower jaw
  const chinTarget = neckPos.clone()
    .addScaledVector(directions.up, neckToHeadLen * 0.35)
    .addScaledVector(directions.forward, neckToHeadLen * 0.85)
    .addScaledVector(directions.left, shoulderSpan * 0.14);

  const headToChinDistance = headPos.distanceTo(chinTarget);
  const neckToChinDistance = neckPos.distanceTo(chinTarget);

  // 4. Violin Longitudinal & Orthogonal Orientation Basis
  // Longitudinal neck axis points primarily towards character's left side (~40 deg forward of coronal plane, ~12 deg up)
  const violinForward = new THREE.Vector3()
    .addScaledVector(directions.left, 0.76)
    .addScaledVector(directions.forward, 0.60)
    .addScaledVector(directions.up, 0.24)
    .normalize();

  // Soundboard normal points upward, tilted slightly towards player's right/chin (~35 deg inward roll)
  const rawUp = new THREE.Vector3()
    .addScaledVector(directions.up, 0.82)
    .addScaledVector(directions.right, 0.48)
    .addScaledVector(directions.forward, 0.30)
    .normalize();

  // Gram-Schmidt orthogonalization to ensure a pristine orthonormal basis
  const projFwd = violinForward.clone().multiplyScalar(rawUp.dot(violinForward));
  const violinUp = rawUp.clone().sub(projFwd).normalize();
  const violinRight = new THREE.Vector3().crossVectors(violinForward, violinUp).normalize();

  const angleToLeftDeg = (violinForward.angleTo(directions.left) * 180) / Math.PI;
  const angleToUpDeg = (violinUp.angleTo(directions.up) * 180) / Math.PI;

  // 5. Left Collarbone Support Point & Violin Center Placement
  // Support point on left clavicle / collarbone just medial to shoulder joint
  const supportPoint = leftShoulderPos.clone()
    .addScaledVector(directions.right, shoulderSpan * 0.16)
    .addScaledVector(directions.forward, torsoHeight * 0.10)
    .addScaledVector(directions.down, torsoHeight * 0.04);

  // Violin center is constructed so the chinrest aligns with the chin target
  const chinRestTarget = chinTarget.clone();

  const violinCenter = chinRestTarget.clone()
    .addScaledVector(violinForward, -VIOLIN_CHINREST_OFFSET_LONG)
    .addScaledVector(violinRight, -VIOLIN_CHINREST_OFFSET_LAT)
    .addScaledVector(violinUp, -VIOLIN_CHINREST_HEIGHT);

  // 6. Instrument Targets
  const violinNeckTarget = violinCenter.clone()
    .addScaledVector(violinForward, VIOLIN_NECK_PLAY_DIST)
    .addScaledVector(violinRight, 0.005)
    .addScaledVector(violinUp, -0.012);

  const bowContactTarget = violinCenter.clone()
    .addScaledVector(violinForward, BOW_CONTACT_OFFSET_LONG)
    .addScaledVector(violinUp, BOW_CONTACT_HEIGHT);

  // 7. Bow Orientation & Stroke Alignment
  // Bow stroke vector crosses strings perpendicular to violin longitudinal axis
  const bowDirection = violinRight.clone()
    .addScaledVector(violinUp, 0.04)
    .normalize();
  const bowUp = violinForward.clone().negate();

  // 8. Right Arm & Bow Grip Calculation
  const maxRightReach = Math.max(0.1, (ratios.rightTotalReachToHeight ?? 0.31) * height);
  const maxLeftReach = Math.max(0.1, (ratios.leftTotalReachToHeight ?? 0.31) * height);

  const rightArmUpperLen = landmarks.rightUpperArm && landmarks.rightElbow
    ? landmarks.rightUpperArm.distanceTo(landmarks.rightElbow)
    : (ratios.rightUpperArmToHeight ?? 0.136) * height;
  const rightArmForearmLen = landmarks.rightElbow && landmarks.rightWrist
    ? landmarks.rightElbow.distanceTo(landmarks.rightWrist)
    : (ratios.rightForearmToHeight ?? 0.133) * height;

  const leftArmUpperLen = landmarks.leftUpperArm && landmarks.leftElbow
    ? landmarks.leftUpperArm.distanceTo(landmarks.leftElbow)
    : (ratios.leftUpperArmToHeight ?? 0.136) * height;
  const leftArmForearmLen = landmarks.leftElbow && landmarks.leftWrist
    ? landmarks.leftElbow.distanceTo(landmarks.leftWrist)
    : (ratios.leftForearmToHeight ?? 0.133) * height;

  // Determine reachable bow grip distance based on right arm reach
  let idealFrogToContactDist = STANDARD_BOW_LENGTH * (0.20 + bowStrokePhase * 0.45);
  let isBowAdapted = false;

  let bowGripTarget = bowContactTarget.clone()
    .addScaledVector(bowDirection, -idealFrogToContactDist);

  let rightShoulderToGrip = rightShoulderPos.distanceTo(bowGripTarget);
  let rightClamped = false;
  const maxUsableRightReach = maxRightReach * 0.94; // 6% safety margin for comfortable bend

  if (rightShoulderToGrip > maxUsableRightReach) {
    // Shorten grip distance along bow stroke to fit character reach
    const reachableGripDist = Math.max(0.10, idealFrogToContactDist - (rightShoulderToGrip - maxUsableRightReach));
    bowGripTarget = bowContactTarget.clone().addScaledVector(bowDirection, -reachableGripDist);
    rightShoulderToGrip = rightShoulderPos.distanceTo(bowGripTarget);
    isBowAdapted = true;

    if (rightShoulderToGrip > maxUsableRightReach) {
      const toGripDir = new THREE.Vector3().subVectors(bowGripTarget, rightShoulderPos).normalize();
      bowGripTarget = rightShoulderPos.clone().addScaledVector(toGripDir, maxUsableRightReach);
      rightShoulderToGrip = maxUsableRightReach;
      rightClamped = true;
      clampedTargets.push('rightArm (bow grip reach clamped)');
    }
  }

  const contactToGripDistance = bowContactTarget.distanceTo(bowGripTarget);

  const rightWristTarget = bowGripTarget.clone();
  const rightHandTarget = bowGripTarget.clone().addScaledVector(bowDirection, 0.02);

  // Geometric Right Elbow Position Construction
  const rightElbowTarget = computeGeometricElbowPosition(
    rightShoulderPos,
    rightWristTarget,
    rightArmUpperLen,
    rightArmForearmLen,
    new THREE.Vector3()
      .addScaledVector(directions.down, 0.70)
      .addScaledVector(directions.forward, 0.52)
      .addScaledVector(directions.right, 0.48)
      .normalize()
  );

  const rightArm: ArmTargets = {
    shoulderTarget: rightShoulderPos,
    elbowTarget: rightElbowTarget,
    wristTarget: rightWristTarget,
    handTarget: rightHandTarget,
    shoulderToHandDistance: rightShoulderToGrip,
    upperArmLength: rightArmUpperLen,
    forearmLength: rightArmForearmLen,
    maximumUsableReach: maxUsableRightReach,
    isReachClamped: rightClamped,
  };

  // 9. Left Arm & Neck Playing Reach Calculation
  let leftWristTarget = violinNeckTarget.clone();
  let leftShoulderToWrist = leftShoulderPos.distanceTo(leftWristTarget);
  let leftClamped = false;
  const maxUsableLeftReach = maxLeftReach * 0.94;

  if (leftShoulderToWrist > maxUsableLeftReach) {
    const toWristDir = new THREE.Vector3().subVectors(leftWristTarget, leftShoulderPos).normalize();
    leftWristTarget = leftShoulderPos.clone().addScaledVector(toWristDir, maxUsableLeftReach);
    leftShoulderToWrist = maxUsableLeftReach;
    leftClamped = true;
    clampedTargets.push('leftArm (neck reach clamped)');
  }

  const leftHandTarget = leftWristTarget.clone().addScaledVector(violinForward, 0.03);

  // Geometric Left Elbow Position Construction
  const leftElbowTarget = computeGeometricElbowPosition(
    leftShoulderPos,
    leftWristTarget,
    leftArmUpperLen,
    leftArmForearmLen,
    new THREE.Vector3()
      .addScaledVector(directions.down, 0.78)
      .addScaledVector(directions.forward, 0.52)
      .addScaledVector(directions.left, 0.34)
      .normalize()
  );

  const leftArm: ArmTargets = {
    shoulderTarget: leftShoulderPos,
    elbowTarget: leftElbowTarget,
    wristTarget: leftWristTarget,
    handTarget: leftHandTarget,
    shoulderToHandDistance: leftShoulderToWrist,
    upperArmLength: leftArmUpperLen,
    forearmLength: leftArmForearmLen,
    maximumUsableReach: maxUsableLeftReach,
    isReachClamped: leftClamped,
  };

  const head: HeadTargets = {
    head: headPos,
    neck: neckPos,
    chinTarget,
    headToChinDistance,
    neckToChinDistance,
  };

  const instrument: InstrumentTargets = {
    supportPoint,
    violinCenter,
    violinNeckTarget,
    chinRestTarget,
    bowContactTarget,
    bowGripTarget,
  };

  const orientation: OrientationBasis = {
    violinForward,
    violinUp,
    violinRight,
    bowDirection,
    bowUp,
    angleToLeftDeg,
    angleToUpDeg,
  };

  const bow: BowDiagnostics = {
    bowContact: bowContactTarget,
    bowGrip: bowGripTarget,
    bowDirection,
    contactToGripDistance,
    isBowAdapted,
  };

  return {
    instrument,
    leftArm,
    rightArm,
    head,
    orientation,
    bow,
    clampedTargets,
  };
}

/**
 * Calculates a 3D geometric elbow joint position from shoulder, wrist, bone lengths,
 * and a natural anatomical bend hint vector.
 */
function computeGeometricElbowPosition(
  shoulder: THREE.Vector3,
  wrist: THREE.Vector3,
  lenUpper: number,
  lenLower: number,
  bendHintDir: THREE.Vector3
): THREE.Vector3 {
  const sw = new THREE.Vector3().subVectors(wrist, shoulder);
  const d = Math.max(0.001, sw.length());

  const clampedD = Math.max(Math.abs(lenUpper - lenLower) + 0.001, Math.min(lenUpper + lenLower - 0.001, d));
  const cosAlpha = (lenUpper * lenUpper + clampedD * clampedD - lenLower * lenLower) / (2 * lenUpper * clampedD);
  const clampedCosAlpha = Math.max(-1, Math.min(1, cosAlpha));
  const alpha = Math.acos(clampedCosAlpha);

  const armDistAlongSW = lenUpper * Math.cos(alpha);
  const elbowHeight = lenUpper * Math.sin(alpha);

  const swDir = sw.clone().normalize();
  const basePoint = shoulder.clone().addScaledVector(swDir, armDistAlongSW);

  const proj = swDir.clone().multiplyScalar(bendHintDir.dot(swDir));
  const bendPlaneDir = bendHintDir.clone().sub(proj).normalize();

  return basePoint.addScaledVector(bendPlaneDir, elbowHeight);
}

/**
 * Formats the violin performance frame diagnostics into an expanded text report.
 */
export function formatViolinPerformanceFrame(frame: ViolinPerformanceFrame): string {
  const fmtVec = (v: THREE.Vector3): string =>
    `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
  const fmtDist = (d: number): string => `${d.toFixed(3)}m`;
  const fmtAngle = (a: number): string => `${a.toFixed(1)}°`;

  return [
    'VIOLIN PERFORMANCE FRAME',
    '',
    'Violin Construction:',
    `  Support Point (Collarbone): ${fmtVec(frame.instrument.supportPoint)}`,
    `  Violin Center:             ${fmtVec(frame.instrument.violinCenter)}`,
    `  Chinrest Target:           ${fmtVec(frame.instrument.chinRestTarget)}`,
    `  Violin Neck Target:        ${fmtVec(frame.instrument.violinNeckTarget)}`,
    `  Violin Forward:            ${fmtVec(frame.orientation.violinForward)}`,
    `  Violin Up:                 ${fmtVec(frame.orientation.violinUp)}`,
    `  Violin Right:              ${fmtVec(frame.orientation.violinRight)}`,
    `  Angle to Body Left:        ${fmtAngle(frame.orientation.angleToLeftDeg)}`,
    `  Angle to Body Up:          ${fmtAngle(frame.orientation.angleToUpDeg)}`,
    '',
    'Head & Chin:',
    `  Head:                      ${fmtVec(frame.head.head)}`,
    `  Neck:                      ${fmtVec(frame.head.neck)}`,
    `  Chin Target:               ${fmtVec(frame.head.chinTarget)}`,
    `  Head -> Chin Distance:     ${fmtDist(frame.head.headToChinDistance)}`,
    `  Neck -> Chin Distance:     ${fmtDist(frame.head.neckToChinDistance)}`,
    '',
    'Left Arm:',
    `  Shoulder:                  ${fmtVec(frame.leftArm.shoulderTarget)}`,
    `  Elbow (Geometric):         ${fmtVec(frame.leftArm.elbowTarget)}`,
    `  Hand / Wrist:              ${fmtVec(frame.leftArm.wristTarget)}`,
    `  Shoulder -> Hand Dist:     ${fmtDist(frame.leftArm.shoulderToHandDistance)}`,
    `  Upper Arm Length:          ${fmtDist(frame.leftArm.upperArmLength)}`,
    `  Forearm Length:            ${fmtDist(frame.leftArm.forearmLength)}`,
    `  Max Usable Reach:          ${fmtDist(frame.leftArm.maximumUsableReach)}`,
    `  Reach Clamped:             ${frame.leftArm.isReachClamped ? 'YES' : 'NO'}`,
    '',
    'Right Arm:',
    `  Shoulder:                  ${fmtVec(frame.rightArm.shoulderTarget)}`,
    `  Elbow (Geometric):         ${fmtVec(frame.rightArm.elbowTarget)}`,
    `  Hand / Wrist:              ${fmtVec(frame.rightArm.wristTarget)}`,
    `  Shoulder -> Hand Dist:     ${fmtDist(frame.rightArm.shoulderToHandDistance)}`,
    `  Upper Arm Length:          ${fmtDist(frame.rightArm.upperArmLength)}`,
    `  Forearm Length:            ${fmtDist(frame.rightArm.forearmLength)}`,
    `  Max Usable Reach:          ${fmtDist(frame.rightArm.maximumUsableReach)}`,
    `  Reach Clamped:             ${frame.rightArm.isReachClamped ? 'YES' : 'NO'}`,
    '',
    'Bow:',
    `  Bow Contact:               ${fmtVec(frame.bow.bowContact)}`,
    `  Bow Grip:                  ${fmtVec(frame.bow.bowGrip)}`,
    `  Bow Direction:             ${fmtVec(frame.bow.bowDirection)}`,
    `  Contact -> Grip Dist:      ${fmtDist(frame.bow.contactToGripDistance)}`,
    `  Bow Length Adapted:        ${frame.bow.isBowAdapted ? 'YES' : 'NO'}`,
    '',
    `Clamped Targets:             ${frame.clampedTargets.length > 0 ? frame.clampedTargets.join(', ') : 'None (All within natural anatomical reach)'}`,
  ].join('\n');
}

/**
 * Diagnostic logger for violin performance frame.
 */
export function logViolinPerformanceFrame(frame: ViolinPerformanceFrame, modelName = 'Loaded Model'): void {
  console.log(`[MusicLab Violin Frame Diagnostics] === ${modelName} ===\n` + formatViolinPerformanceFrame(frame));
}
