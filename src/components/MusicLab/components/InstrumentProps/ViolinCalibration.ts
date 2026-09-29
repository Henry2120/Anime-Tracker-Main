import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

/**
 * Geometric Landmarks of 4/4 Violin in Violin_Instrument local space.
 * Derived directly from the actual mesh nodes in /music-lab/musicians/violinist.glb:
 * - Violin_LowerBout: pos (0, 0, 0), rot (PI/2, 0, 0), BB x: [-0.11, 0.11], y: [-0.0225, 0.0225], z: [-0.11, 0.11]
 * - Violin_UpperBout: pos (0, 0.14, 0), rot (PI/2, 0, 0)
 * - Violin_Neck: pos (0, 0.28, 0.015), rot (0, 0, 0), length ~0.26m
 * - Violin_Scroll: pos (0, 0.42, 0.015), rot (0, 0, 0)
 * - Violin_Chinrest: pos (0.04, -0.06, 0.03), rot (0, 0, 0)
 * - Violin_Bridge: pos (0, 0.04, 0.03), rot (0, 0, 0)
 *
 * Local Axes:
 * - Longitudinal axis (+Y): tail/endpin -> body -> neck -> scroll
 * - Top / Front axis (+Z): back plate -> top plate / fingerboard / bridge / strings
 * - Chinrest side (+X): center axis -> player jaw contact chinrest
 */
export const RAW_VIOLIN_LANDMARKS = {
  lowerBoutCenter: new THREE.Vector3(0.000, 0.000, 0.000),
  upperBoutCenter: new THREE.Vector3(0.000, 0.140, 0.000),
  chinrestContact: new THREE.Vector3(0.040, -0.060, 0.030),
  shoulderSupportBack: new THREE.Vector3(0.000, -0.030, -0.0225),
  bridgeTop: new THREE.Vector3(0.000, 0.040, 0.030),
  playableStringLane: new THREE.Vector3(0.000, 0.080, 0.032),
  neckBase: new THREE.Vector3(0.000, 0.150, 0.015),
  neckCenter: new THREE.Vector3(0.000, 0.280, 0.015),
  scrollHeadTip: new THREE.Vector3(0.000, 0.420, 0.015),
  longitudinalAxis: new THREE.Vector3(0, 1, 0),
  topStringsAxis: new THREE.Vector3(0, 0, 1),
  chinrestSideAxis: new THREE.Vector3(1, 0, 0),
};

/**
 * Geometric Landmarks of Violin Bow in Violin_Bow local space.
 * Derived directly from the actual mesh nodes in /music-lab/musicians/violinist.glb:
 * - BowStick: pos (0, 0.12, 0), length = 0.72m, spans Y from -0.24 to +0.48
 * - BowFrog: pos (0, -0.22, 0)
 * - BowHair: pos (0.012, 0.12, 0), length = 0.68m, spans Y from -0.22 to +0.46
 *
 * Local Axes:
 * - Longitudinal axis (+Y): frog (heel) -> tip
 * - Hair contact side (+X): wooden stick -> hair (offset +0.012)
 * - Lateral axis (+Z): bow stick lateral thickness
 */
export const RAW_BOW_LANDMARKS = {
  frogCenter: new THREE.Vector3(0.000, -0.220, 0.000),
  gripCenter: new THREE.Vector3(0.000, -0.180, 0.000),
  hairOffset: 0.012,
  tip: new THREE.Vector3(0.000, 0.480, 0.000),
  longitudinalAxis: new THREE.Vector3(0, 1, 0),
  hairContactSideAxis: new THREE.Vector3(1, 0, 0),
};

export interface AnatomicalContactLandmarks {
  headCenter: THREE.Vector3;
  neckBase: THREE.Vector3;
  chinContactTarget: THREE.Vector3;
  shoulderShelfTarget: THREE.Vector3;
  leftWristPos: THREE.Vector3;
  leftThumbProximal: THREE.Vector3;
  leftIndexProximal: THREE.Vector3;
  leftHandCradleTarget: THREE.Vector3;
  rightWristPos: THREE.Vector3;
  rightThumbDistal: THREE.Vector3;
  rightIndexProximal: THREE.Vector3;
  rightIndexDistal: THREE.Vector3;
  rightMiddleProximal: THREE.Vector3;
  rightLittleProximal: THREE.Vector3;
  rightGripTarget: THREE.Vector3;
  rightPalmCenter: THREE.Vector3;
}

export interface InstrumentFitSolution {
  violinPosition: THREE.Vector3;
  violinQuaternion: THREE.Quaternion;
  violinEuler: THREE.Euler;
  bowPosition: THREE.Vector3;
  bowQuaternion: THREE.Quaternion;
  bowEuler: THREE.Euler;
}

export interface InstrumentDiagnosticsData {
  violinRootPos: THREE.Vector3;
  chinrestPos: THREE.Vector3;
  chinrestToChinDist: number; // in meters (for HUD display)
  violinNeckPos: THREE.Vector3;
  neckToHandDist: number; // in meters (for HUD display)
  bowFrogPos: THREE.Vector3;
  bowFrogToGripDist: number; // in meters (for HUD display)
  bowHairToStringDist: number; // in meters (for HUD display)
  bowToStringAngleDeg: number; // in degrees (for HUD display)
  palmClearanceDistMm: number;
  chinContactPass: boolean;
  neckSupportPass: boolean;
  stringContactPass: boolean;
  bowOrthogonalityPass: boolean;
  palmPenetrationFree: boolean;
  // World marker coordinates for visual diagnostic rendering
  wShoulderBack?: THREE.Vector3;
  wScrollTip?: THREE.Vector3;
  wBridgeTop?: THREE.Vector3;
  wPlayableStrings?: THREE.Vector3;
  wBowGrip?: THREE.Vector3;
  wBowTip?: THREE.Vector3;
  wBowHairContact?: THREE.Vector3;
}

/**
 * Extracts true anatomical contact landmarks from the currently posed VRM skeleton.
 */
export function extractAnatomicalLandmarks(vrm: VRM): AnatomicalContactLandmarks | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;

  const getBonePos = (name: any) => {
    const node = humanoid.getNormalizedBoneNode(name);
    if (!node) return new THREE.Vector3();
    const v = new THREE.Vector3();
    node.getWorldPosition(v);
    return v;
  };

  const headNode = humanoid.getNormalizedBoneNode('head' as any);
  const headCenter = getBonePos('head');
  const neckBase = getBonePos('neck');
  const leftShoulderPos = getBonePos('leftShoulder');
  const leftWristPos = getBonePos('leftHand');
  const leftThumbProximal = getBonePos('leftThumbProximal');
  const leftIndexProximal = getBonePos('leftIndexProximal');

  const rightWristPos = getBonePos('rightHand');
  const rightThumbDistal = getBonePos('rightThumbDistal');
  const rightIndexProximal = getBonePos('rightIndexProximal');
  const rightIndexDistal = getBonePos('rightIndexDistal');
  const rightMiddleProximal = getBonePos('rightMiddleProximal');
  const rightLittleProximal = getBonePos('rightLittleProximal');

  // Dynamic Chin Target derived from head bone world rotation & position:
  // Relative to head center, lower jaw is ~5.4cm down, ~8.0cm forward (+Z), and ~2.2cm left (+X)
  const headQuat = new THREE.Quaternion();
  if (headNode) {
    headNode.getWorldQuaternion(headQuat);
  }
  const chinLocalOffset = new THREE.Vector3(0.022, -0.054, 0.080);
  const chinContactTarget = headCenter.clone().add(chinLocalOffset.applyQuaternion(headQuat));

  // Left clavicular shelf (shoulder support shelf):
  const shoulderShelfTarget = new THREE.Vector3(
    leftShoulderPos.x * 0.7 + neckBase.x * 0.3 + 0.035,
    leftShoulderPos.y * 0.8 + neckBase.y * 0.2 - 0.025,
    neckBase.z + 0.075
  );

  // Left hand support cradle (between thumb proximal and index proximal knuckle):
  const leftHandCradleTarget = new THREE.Vector3()
    .addVectors(leftThumbProximal, leftIndexProximal)
    .multiplyScalar(0.5)
    .add(new THREE.Vector3(-0.002, 0.005, -0.005));

  // Right hand bow grip canal (cradle between thumb distal pad and opposing index finger):
  const rightGripTarget = new THREE.Vector3(
    (rightThumbDistal.x + (rightIndexProximal.x + rightIndexDistal.x) * 0.5) * 0.5,
    (rightThumbDistal.y + (rightIndexProximal.y + rightIndexDistal.y) * 0.5) * 0.5,
    (rightThumbDistal.z + (rightIndexProximal.z + rightIndexDistal.z) * 0.5) * 0.5
  );

  // Right palm center (used to verify NO bow stick penetration through the palm):
  const rightPalmCenter = new THREE.Vector3(
    (rightWristPos.x + rightIndexProximal.x + rightLittleProximal.x) / 3,
    (rightWristPos.y + rightIndexProximal.y + rightLittleProximal.y) / 3,
    (rightWristPos.z + rightIndexProximal.z + rightLittleProximal.z) / 3
  );

  return {
    headCenter,
    neckBase,
    chinContactTarget,
    shoulderShelfTarget,
    leftWristPos,
    leftThumbProximal,
    leftIndexProximal,
    leftHandCradleTarget,
    rightWristPos,
    rightThumbDistal,
    rightIndexProximal,
    rightIndexDistal,
    rightMiddleProximal,
    rightLittleProximal,
    rightGripTarget,
    rightPalmCenter,
  };
}

/**
 * Solves deterministic Violin and Bow transforms based on canonical geometry and anatomical landmarks.
 */
export function solveInstrumentFitting(landmarks: AnatomicalContactLandmarks): InstrumentFitSolution {
  // 1. VIOLIN TWO-POINT ANATOMICAL FITTING
  // In Violin_Instrument local coordinates:
  // - Chinrest is at (0.04, -0.06, 0.03)
  // - Neck center is at (0, 0.28, 0.015)
  const localChinrest = RAW_VIOLIN_LANDMARKS.chinrestContact;
  const localNeck = RAW_VIOLIN_LANDMARKS.neckCenter;
  const vLocalLine = new THREE.Vector3().subVectors(localNeck, localChinrest).normalize();

  // In World coordinates:
  // The line connecting the player's chin to the left hand cradle:
  const vWorldLine = new THREE.Vector3()
    .subVectors(landmarks.leftHandCradleTarget, landmarks.chinContactTarget)
    .normalize();

  // Base rotation: maps local chinrest->neck vector directly onto world chin->cradle vector
  const qBase = new THREE.Quaternion().setFromUnitVectors(vLocalLine, vWorldLine);

  // Roll around vWorldLine:
  // Classical violin posture: strings face upward (+Y) and tilted inward toward player's head (-X)
  const desiredFaceNormal = new THREE.Vector3(-0.42, 0.88, 0.22).normalize();
  const desiredPerpNormal = new THREE.Vector3()
    .subVectors(desiredFaceNormal, vWorldLine.clone().multiplyScalar(desiredFaceNormal.dot(vWorldLine)))
    .normalize();

  const currentFaceNormal = RAW_VIOLIN_LANDMARKS.topStringsAxis.clone().applyQuaternion(qBase);
  const currentPerpNormal = new THREE.Vector3()
    .subVectors(currentFaceNormal, vWorldLine.clone().multiplyScalar(currentFaceNormal.dot(vWorldLine)))
    .normalize();

  const crossNorm = new THREE.Vector3().crossVectors(currentPerpNormal, desiredPerpNormal);
  const rollAngle = Math.atan2(crossNorm.dot(vWorldLine), currentPerpNormal.dot(desiredPerpNormal));
  const qRoll = new THREE.Quaternion().setFromAxisAngle(vWorldLine, rollAngle);
  const violinQuaternion = new THREE.Quaternion().multiplyQuaternions(qRoll, qBase);
  const violinEuler = new THREE.Euler().setFromQuaternion(violinQuaternion, 'XYZ');

  // Position: Place violin root so local chinrest sits exactly at chinContactTarget:
  const wChinrestOffset = localChinrest.clone().applyQuaternion(violinQuaternion);
  const violinPosition = new THREE.Vector3().subVectors(landmarks.chinContactTarget, wChinrestOffset);

  // Playable strings lane on the placed violin:
  const wPlayableStrings = RAW_VIOLIN_LANDMARKS.playableStringLane
    .clone()
    .applyQuaternion(violinQuaternion)
    .add(violinPosition);

  // 2. BOW ANATOMICAL & ORTHOGONAL FITTING
  // Longitudinal string direction on the violin:
  const violinStringDir = RAW_VIOLIN_LANDMARKS.longitudinalAxis
    .clone()
    .applyQuaternion(violinQuaternion)
    .normalize();
  const violinUpNormal = RAW_VIOLIN_LANDMARKS.topStringsAxis
    .clone()
    .applyQuaternion(violinQuaternion)
    .normalize();

  // Vector from right hand grip to violin strings:
  const gripToString = new THREE.Vector3().subVectors(wPlayableStrings, landmarks.rightGripTarget);

  // Bowing direction (+Y in Bow):
  // Must be strictly orthogonal (90.0°) to violinStringDir:
  const bowLongDir = new THREE.Vector3()
    .subVectors(gripToString, violinStringDir.clone().multiplyScalar(gripToString.dot(violinStringDir)))
    .normalize();

  // Bow hair side (+X in Bow): Hair faces directly down into strings (-violinUpNormal)
  const bowHairDir = violinUpNormal.clone().negate();
  const bowXDir = new THREE.Vector3()
    .subVectors(bowHairDir, bowLongDir.clone().multiplyScalar(bowHairDir.dot(bowLongDir)))
    .normalize();
  const bowZDir = new THREE.Vector3().crossVectors(bowXDir, bowLongDir).normalize();
  bowXDir.crossVectors(bowLongDir, bowZDir).normalize();

  const bowMat = new THREE.Matrix4().makeBasis(bowXDir, bowLongDir, bowZDir);
  const bowQuaternion = new THREE.Quaternion().setFromRotationMatrix(bowMat);
  const bowEuler = new THREE.Euler().setFromQuaternion(bowQuaternion, 'XYZ');

  // Bow positioning:
  // Distance along bow from grip (local y = -0.18) to strings contact point:
  const sGripToString = bowLongDir.dot(new THREE.Vector3().subVectors(wPlayableStrings, landmarks.rightGripTarget));
  // Contact point on bow hair (local x = +0.012, local y = -0.18 + sGripToString, local z = 0):
  const localContactOnHair = new THREE.Vector3(
    RAW_BOW_LANDMARKS.hairOffset,
    RAW_BOW_LANDMARKS.gripCenter.y + sGripToString,
    0
  );
  // Position bow root so hair contact point is exactly at wPlayableStrings:
  const bowPosition = new THREE.Vector3().subVectors(
    wPlayableStrings,
    localContactOnHair.clone().applyQuaternion(bowQuaternion)
  );

  return {
    violinPosition,
    violinQuaternion,
    violinEuler,
    bowPosition,
    bowQuaternion,
    bowEuler,
  };
}

/**
 * Evaluates comprehensive diagnostics to verify geometry, clearance, and contact pass/fail.
 */
export function evaluateDiagnostics(
  solution: InstrumentFitSolution,
  landmarks: AnatomicalContactLandmarks
): InstrumentDiagnosticsData {
  const { violinPosition, violinQuaternion, bowPosition, bowQuaternion } = solution;

  const toWorldV = (pt: THREE.Vector3) => pt.clone().applyQuaternion(violinQuaternion).add(violinPosition);
  const violinRootPos = violinPosition.clone();
  const chinrestPos = toWorldV(RAW_VIOLIN_LANDMARKS.chinrestContact);
  const wShoulderBack = toWorldV(RAW_VIOLIN_LANDMARKS.shoulderSupportBack);
  const violinNeckPos = toWorldV(RAW_VIOLIN_LANDMARKS.neckCenter);
  const wScrollTip = toWorldV(RAW_VIOLIN_LANDMARKS.scrollHeadTip);
  const wBridgeTop = toWorldV(RAW_VIOLIN_LANDMARKS.bridgeTop);
  const wPlayableStrings = toWorldV(RAW_VIOLIN_LANDMARKS.playableStringLane);

  const chinrestToChinDist = chinrestPos.distanceTo(landmarks.chinContactTarget); // in meters
  const neckToHandDist = violinNeckPos.distanceTo(landmarks.leftHandCradleTarget); // in meters

  const toWorldB = (pt: THREE.Vector3) => pt.clone().applyQuaternion(bowQuaternion).add(bowPosition);
  const bowFrogPos = toWorldB(RAW_BOW_LANDMARKS.frogCenter);
  const wBowGrip = toWorldB(RAW_BOW_LANDMARKS.gripCenter);
  const wBowTip = toWorldB(RAW_BOW_LANDMARKS.tip);

  const bowFrogToGripDist = wBowGrip.distanceTo(landmarks.rightGripTarget); // in meters

  // Hair contact point on strings:
  const bowLongDir = RAW_BOW_LANDMARKS.longitudinalAxis.clone().applyQuaternion(bowQuaternion).normalize();
  const sGripToString = bowLongDir.dot(new THREE.Vector3().subVectors(wPlayableStrings, landmarks.rightGripTarget));
  const wBowHairContact = toWorldB(
    new THREE.Vector3(RAW_BOW_LANDMARKS.hairOffset, RAW_BOW_LANDMARKS.gripCenter.y + sGripToString, 0)
  );

  const bowHairToStringDist = wBowHairContact.distanceTo(wPlayableStrings); // in meters

  // Angle between bow shaft and violin strings:
  const violinStringDir = RAW_VIOLIN_LANDMARKS.longitudinalAxis
    .clone()
    .applyQuaternion(violinQuaternion)
    .normalize();
  const bowToStringAngleDeg = (bowLongDir.angleTo(violinStringDir) * 180) / Math.PI;

  // Palm clearance: distance from right palm center to infinite line of the bow shaft
  const bowRay = new THREE.Ray(wBowGrip, bowLongDir);
  const palmClearanceDistMm = bowRay.distanceToPoint(landmarks.rightPalmCenter) * 1000;

  return {
    violinRootPos,
    chinrestPos,
    chinrestToChinDist,
    violinNeckPos,
    neckToHandDist,
    bowFrogPos,
    bowFrogToGripDist,
    bowHairToStringDist,
    bowToStringAngleDeg,
    palmClearanceDistMm,
    chinContactPass: chinrestToChinDist < 0.015, // < 15mm
    neckSupportPass: neckToHandDist < 0.050,    // < 50mm
    stringContactPass: bowHairToStringDist < 0.003, // < 3mm
    bowOrthogonalityPass: Math.abs(bowToStringAngleDeg - 90.0) < 5.0, // within 5° of 90°
    palmPenetrationFree: palmClearanceDistMm > 25.0, // > 25mm clearance from palm
    wShoulderBack,
    wScrollTip,
    wBridgeTop,
    wPlayableStrings,
    wBowGrip,
    wBowTip,
    wBowHairContact,
  };
}
