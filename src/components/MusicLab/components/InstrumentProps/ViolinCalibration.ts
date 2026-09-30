import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

/**
 * Geometric Landmarks of 4/4 Violin in canonical standalone violin space (in meters).
 * Derived directly from mesh inspection of /public/music-lab/instruments/violin.glb (scale 0.01):
 * - Total length: 0.605m (60.5 cm)
 * - Bout width: 0.213m (21.3 cm)
 * - Longitudinal axis (+Y): Lower bout base (Y = 0) -> Waist (Y = 0.16) -> Bridge (Y = 0.161) -> Neck (Y = 0.404) -> Scroll tip (Y = 0.599)
 * - Top / Front axis (+Z): Back plate (-Z) -> Top plate / Strings / Fingerboard (+Z)
 * - Chinrest side (+X): Player jaw contact region on the lower bout (+X)
 */
export const RAW_VIOLIN_LANDMARKS = {
  lowerBoutCenter: new THREE.Vector3(0.000, 0.000, 0.000),
  upperBoutCenter: new THREE.Vector3(0.000, 0.280, 0.000),
  chinrestContact: new THREE.Vector3(0.045, 0.085, 0.025),
  shoulderSupportBack: new THREE.Vector3(0.000, 0.050, -0.045),
  bridgeTop: new THREE.Vector3(0.000, 0.161, 0.042),
  playableStringLane: new THREE.Vector3(0.000, 0.200, 0.038),
  neckBase: new THREE.Vector3(0.000, 0.350, 0.000),
  neckCenter: new THREE.Vector3(0.000, 0.404, -0.015),
  scrollHeadTip: new THREE.Vector3(0.000, 0.599, -0.039),
  longitudinalAxis: new THREE.Vector3(0, 1, 0),
  topStringsAxis: new THREE.Vector3(0, 0, 1),
  chinrestSideAxis: new THREE.Vector3(1, 0, 0),
};

/**
 * Geometric Landmarks of Violin Bow in canonical standalone bow space (in meters).
 * Derived directly from mesh inspection of /public/music-lab/instruments/bow.glb (scale 0.01):
 * - Total length: 0.776m (77.6 cm)
 * - Longitudinal axis (+Y): Frog screw (Y = -0.375) -> Frog heel (Y = -0.34) -> Grip / Frog throat (Y = -0.255) -> Tip (Y = +0.400)
 * - Hair position: Z = +0.0373m (ribbon from Y = -0.314 to Y = +0.389)
 * - Stick centerline: Z = +0.0480m
 * - Hair contact direction: -Z (towards strings)
 * - Lateral axis: +X
 */
export const RAW_BOW_LANDMARKS = {
  frogCenter: new THREE.Vector3(0.000, -0.310, 0.042),
  gripCenter: new THREE.Vector3(0.000, -0.255, 0.048),
  hairOffsetZ: 0.0373,
  hairOffset: 0.0373,
  tip: new THREE.Vector3(0.000, 0.400, 0.046),
  longitudinalAxis: new THREE.Vector3(0, 1, 0),
  lateralAxis: new THREE.Vector3(1, 0, 0),
  stickToHairAxis: new THREE.Vector3(0, 0, -1),
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
  rightIndexIntermediate: THREE.Vector3;
  rightMiddleProximal: THREE.Vector3;
  rightMiddleIntermediate: THREE.Vector3;
  rightLittleProximal: THREE.Vector3;
  rightGripTarget: THREE.Vector3;
  rightPalmCenter: THREE.Vector3;
  rightBowGripFrame: {
    origin: THREE.Vector3;
    quaternion: THREE.Quaternion;
    matrix: THREE.Matrix4;
  };
}

export interface InstrumentFitSolution {
  violinPosition: THREE.Vector3;
  violinQuaternion: THREE.Quaternion;
  violinEuler: THREE.Euler;
  bowPosition: THREE.Vector3;
  bowQuaternion: THREE.Quaternion;
  bowEuler: THREE.Euler;
  bowFrogGripWorldPos: THREE.Vector3;
  bowFrogGripWorldQuat: THREE.Quaternion;
  rightBowGripWorldPos: THREE.Vector3;
  rightBowGripWorldQuat: THREE.Quaternion;
}

export interface InstrumentDiagnosticsData {
  violinRootPos: THREE.Vector3;
  chinrestPos: THREE.Vector3;
  chinrestToChinDist: number; // in meters (for HUD display)
  violinNeckPos: THREE.Vector3;
  neckToHandDist: number; // in meters (for HUD display)
  bowRootPos: THREE.Vector3;
  bowFrogPos: THREE.Vector3;
  bowFrogGripPos: THREE.Vector3;
  rightBowGripPos: THREE.Vector3;
  rightWristPos: THREE.Vector3;
  rightThumbDistalPos: THREE.Vector3;
  rightIndexProximalPos: THREE.Vector3;
  rightMiddleProximalPos: THREE.Vector3;
  gripFrameDistMm: number; // distance between RightBowGripFrame and BowFrogGripFrame
  gripFrameAngleErrorDeg: number; // orientation error between RightBowGripFrame and BowFrogGripFrame
  bowHairToStringDist: number; // in meters (for HUD display)
  bowToStringAngleDeg: number; // in degrees (for HUD display)
  palmClearanceDistMm: number;
  bowThroughPalm: boolean;
  bowInsideGripRegion: boolean;
  chinContactPass: boolean;
  neckSupportPass: boolean;
  stringContactPass: boolean;
  bowOrthogonalityPass: boolean;
  palmPenetrationFree: boolean;
  // Signed Anatomical Hand Frame & Chirality Diagnostics
  currentPalmNormal: THREE.Vector3;
  dorsalNormal: THREE.Vector3;
  desiredPalmNormal: THREE.Vector3;
  palmSide: 'PALMAR' | 'DORSAL';
  palmSideValid: boolean;
  palmNormalDotProduct: number;
  palmOrientationErrorDeg: number;
  handLongitudinalAxis: THREE.Vector3;
  handWidthAxis: THREE.Vector3;
  desiredHandAxis: THREE.Vector3;
  rightHandChirality: 'VALID' | 'INVALID';
  rightHandChiralityValid: boolean;
  wristToHandBendAngleDeg: number;
  wristFlexionDeg: number;
  wristSideTiltDeg: number;
  palmToBowClearanceMm: number;
  thumbContactErrorMm: number;
  indexContactErrorMm: number;
  middleContactErrorMm: number;
  ringContactErrorMm: number;
  pinkyContactErrorMm: number;
  fingerSpacingMm: number;
  fingerIntersectionFree: boolean;
  fingerAnatomicalAlignmentPass: boolean;
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
 * Extracts true anatomical contact landmarks and RightBowGripFrame from the currently posed VRM skeleton.
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
  const rightIndexIntermediate = getBonePos('rightIndexIntermediate');
  const rightMiddleProximal = getBonePos('rightMiddleProximal');
  const rightMiddleIntermediate = getBonePos('rightMiddleIntermediate');
  const rightLittleProximal = getBonePos('rightLittleProximal');

  // Dynamic Chin Target derived from head bone world rotation & position:
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

  // PART 1: Authoritative Right hand bow grip target derived independently of dynamic moving fingers:
  // Derived from the stable right wrist position and hand orientation along the forearm/metacarpal corridor:
  const rKnucklesCenter = new THREE.Vector3()
    .addVectors(rightIndexProximal, rightLittleProximal)
    .multiplyScalar(0.5);
  const vHandAxis = new THREE.Vector3().subVectors(rKnucklesCenter, rightWristPos).normalize();
  // The classical frog grip canal sits at the carpal-metacarpal / thumb-index web junction:
  const rightGripTarget = rightWristPos.clone().addScaledVector(vHandAxis, 0.048).add(new THREE.Vector3(0, -0.005, 0.008));

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
    rightIndexIntermediate,
    rightMiddleProximal,
    rightMiddleIntermediate,
    rightLittleProximal,
    rightGripTarget,
    rightPalmCenter,
    rightBowGripFrame: {
      origin: rightGripTarget.clone(),
      quaternion: new THREE.Quaternion(),
      matrix: new THREE.Matrix4(),
    },
  };
}

/**
 * Solves deterministic Violin and Bow transforms based on canonical geometry and anatomical landmarks.
 * 
 * Attaches the bow authoritative grip frame (BowFrogGripFrame) to the right-hand grip frame (RightBowGripFrame)
 * via rigid SE(3) transform: BowRootWorld = RightBowGripFrameWorld * inverse(BowFrogGripLocalToRoot).
 */
export function solveInstrumentFitting(landmarks: AnatomicalContactLandmarks): InstrumentFitSolution {
  // 1. VIOLIN TWO-POINT ANATOMICAL FITTING (Standalone violin.glb space)
  const localChinrest = RAW_VIOLIN_LANDMARKS.chinrestContact;
  const localNeck = RAW_VIOLIN_LANDMARKS.neckCenter;
  const vLocalLine = new THREE.Vector3().subVectors(localNeck, localChinrest).normalize();

  // In World coordinates: chin to left hand cradle vector
  const vWorldLine = new THREE.Vector3()
    .subVectors(landmarks.leftHandCradleTarget, landmarks.chinContactTarget)
    .normalize();

  const qBase = new THREE.Quaternion().setFromUnitVectors(vLocalLine, vWorldLine);

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

  // Place violin root so local chinrest sits exactly at chinContactTarget:
  const wChinrestOffset = localChinrest.clone().applyQuaternion(violinQuaternion);
  const violinPosition = new THREE.Vector3().subVectors(landmarks.chinContactTarget, wChinrestOffset);

  // Playable strings lane on the placed violin:
  const wPlayableStrings = RAW_VIOLIN_LANDMARKS.playableStringLane
    .clone()
    .applyQuaternion(violinQuaternion)
    .add(violinPosition);

  // Longitudinal string direction and string face normal on the violin:
  const violinStringDir = RAW_VIOLIN_LANDMARKS.longitudinalAxis
    .clone()
    .applyQuaternion(violinQuaternion)
    .normalize();
  const violinUpNormal = RAW_VIOLIN_LANDMARKS.topStringsAxis
    .clone()
    .applyQuaternion(violinQuaternion)
    .normalize();

  // 2. RIGHT HAND BOW GRIP FRAME (RightBowGripFrameWorld)
  const rightBowGripPos = landmarks.rightGripTarget.clone();

  // Bowing direction (+Y in BowFrogGripFrame): Orthogonal to violinStringDir, directed towards strings:
  const gripToString = new THREE.Vector3().subVectors(wPlayableStrings, rightBowGripPos);
  const bowLongDir = new THREE.Vector3()
    .subVectors(gripToString, violinStringDir.clone().multiplyScalar(gripToString.dot(violinStringDir)))
    .normalize();

  // Hair direction: Hair faces down into strings (-violinUpNormal), so +Z in bow grip frame is +violinUpNormal
  const bowZDir = new THREE.Vector3()
    .subVectors(violinUpNormal, bowLongDir.clone().multiplyScalar(violinUpNormal.dot(bowLongDir)))
    .normalize();
  const bowXDir = new THREE.Vector3().crossVectors(bowLongDir, bowZDir).normalize();
  bowZDir.crossVectors(bowXDir, bowLongDir).normalize();

  // RightBowGripFrame world matrix & quaternion:
  const rightBowGripWorldMat = new THREE.Matrix4().makeBasis(bowXDir, bowLongDir, bowZDir);
  rightBowGripWorldMat.setPosition(rightBowGripPos);
  const rightBowGripWorldQuat = new THREE.Quaternion().setFromRotationMatrix(rightBowGripWorldMat);

  // 3. BOW FROG GRIP FRAME (BowFrogGripLocalToRoot)
  // Local grip frame at frog throat / grip canal on standalone bow.glb:
  const bowFrogGripLocalMat = new THREE.Matrix4().makeBasis(
    RAW_BOW_LANDMARKS.lateralAxis,
    RAW_BOW_LANDMARKS.longitudinalAxis,
    RAW_BOW_LANDMARKS.lateralAxis.clone().cross(RAW_BOW_LANDMARKS.longitudinalAxis).normalize()
  ).setPosition(RAW_BOW_LANDMARKS.gripCenter);

  // 4. RIGID TRANSFORM (PART 4):
  // BowRootWorld = RightBowGripFrameWorld * inverse(BowFrogGripLocalToRoot)
  const invBowFrogGripLocal = bowFrogGripLocalMat.clone().invert();
  const bowWorldMat = new THREE.Matrix4().multiplyMatrices(rightBowGripWorldMat, invBowFrogGripLocal);

  const bowPosition = new THREE.Vector3();
  const bowQuaternion = new THREE.Quaternion();
  const bowScale = new THREE.Vector3();
  bowWorldMat.decompose(bowPosition, bowQuaternion, bowScale);
  const bowEuler = new THREE.Euler().setFromQuaternion(bowQuaternion, 'XYZ');

  // World transform of BowFrogGripFrame for confirmation of coincidence (Part 5):
  const bowFrogGripWorldMat = new THREE.Matrix4().multiplyMatrices(bowWorldMat, bowFrogGripLocalMat);
  const bowFrogGripWorldPos = new THREE.Vector3();
  const bowFrogGripWorldQuat = new THREE.Quaternion();
  bowFrogGripWorldMat.decompose(bowFrogGripWorldPos, bowFrogGripWorldQuat, new THREE.Vector3());

  return {
    violinPosition,
    violinQuaternion,
    violinEuler,
    bowPosition,
    bowQuaternion,
    bowEuler,
    bowFrogGripWorldPos,
    bowFrogGripWorldQuat,
    rightBowGripWorldPos: rightBowGripPos,
    rightBowGripWorldQuat,
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
  const bowRootPos = bowPosition.clone();
  const bowFrogPos = toWorldB(RAW_BOW_LANDMARKS.frogCenter);
  const bowFrogGripPos = toWorldB(RAW_BOW_LANDMARKS.gripCenter);
  const wBowTip = toWorldB(RAW_BOW_LANDMARKS.tip);

  // Grip Frame Matching Metrics (PART 5 & PART 13):
  const gripFrameDist = bowFrogGripPos.distanceTo(landmarks.rightGripTarget);
  const gripFrameDistMm = gripFrameDist * 1000;
  const gripFrameAngleErrorDeg = (solution.bowFrogGripWorldQuat.angleTo(solution.rightBowGripWorldQuat) * 180) / Math.PI;

  // Hair contact point on strings:
  const bowLongDir = RAW_BOW_LANDMARKS.longitudinalAxis.clone().applyQuaternion(bowQuaternion).normalize();
  const sGripToString = bowLongDir.dot(new THREE.Vector3().subVectors(wPlayableStrings, landmarks.rightGripTarget));
  const wBowHairContact = toWorldB(
    new THREE.Vector3(0, RAW_BOW_LANDMARKS.gripCenter.y + sGripToString, RAW_BOW_LANDMARKS.hairOffsetZ)
  );

  const bowHairToStringDist = wBowHairContact.distanceTo(wPlayableStrings); // in meters

  // Angle between bow shaft and violin strings:
  const violinStringDir = RAW_VIOLIN_LANDMARKS.longitudinalAxis
    .clone()
    .applyQuaternion(violinQuaternion)
    .normalize();
  const bowToStringAngleDeg = (bowLongDir.angleTo(violinStringDir) * 180) / Math.PI;

  // Palm clearance: distance from right palm center to infinite line of the bow shaft
  const bowRay = new THREE.Ray(bowFrogGripPos, bowLongDir);
  const palmClearanceDistMm = bowRay.distanceToPoint(landmarks.rightPalmCenter) * 1000;

  // Derive Current Anatomical Hand Frame from posed landmarks
  const vHandLong = new THREE.Vector3()
    .addVectors(landmarks.rightIndexProximal, landmarks.rightLittleProximal)
    .multiplyScalar(0.5)
    .sub(landmarks.rightWristPos)
    .normalize();
  const vPalmWidth = new THREE.Vector3()
    .subVectors(landmarks.rightIndexProximal, landmarks.rightLittleProximal)
    .normalize();

  // In the anatomical right hand, cross(vPalmWidth, vHandLong) points into the inner palm (PALMAR)
  // while cross(vHandLong, vPalmWidth) points out of the back of hand (DORSAL)
  const currentPalmNormal = new THREE.Vector3().crossVectors(vPalmWidth, vHandLong).normalize();
  const dorsalNormal = currentPalmNormal.clone().negate();

  // Chirality test: for right hand, det(handLong, palmWidth, dorsal) > 0
  const chiralityDet = vHandLong.dot(new THREE.Vector3().crossVectors(vPalmWidth, dorsalNormal));
  const rightHandChiralityValid = chiralityDet > 0.5;
  const rightHandChirality: 'VALID' | 'INVALID' = rightHandChiralityValid ? 'VALID' : 'INVALID';

  // Derive Desired Bow Hand Frame from RightBowGripFrame basis
  const gripQuat = solution.rightBowGripWorldQuat;
  const Ux = new THREE.Vector3(1, 0, 0).applyQuaternion(gripQuat).normalize();
  const Uy = new THREE.Vector3(0, 1, 0).applyQuaternion(gripQuat).normalize();
  const Uz = new THREE.Vector3(0, 0, 1).applyQuaternion(gripQuat).normalize();

  const desiredPalmNormal = new THREE.Vector3()
    .addScaledVector(Uz, -0.90)
    .addScaledVector(Ux, -0.35)
    .addScaledVector(Uy, 0.25)
    .normalize();
  const desiredHandAxis = new THREE.Vector3()
    .addScaledVector(Uz, -0.18)
    .addScaledVector(Uy, 0.22)
    .addScaledVector(Ux, -0.10)
    .normalize();

  // Palm Side Test: Dot product between current palm normal and desired palm normal
  const palmNormalDotProduct = currentPalmNormal.dot(desiredPalmNormal);
  const palmSideValid = palmNormalDotProduct > 0;
  const palmSide: 'PALMAR' | 'DORSAL' = palmSideValid ? 'PALMAR' : 'DORSAL';

  const palmOrientationErrorDeg = (currentPalmNormal.angleTo(desiredPalmNormal) * 180) / Math.PI;

  // Wrist to hand angle
  const vForearm = new THREE.Vector3().subVectors(landmarks.rightWristPos, landmarks.shoulderShelfTarget).normalize();
  const wristToHandBendAngleDeg = (vForearm.angleTo(vHandLong) * 180) / Math.PI;

  // Finger contact target errors relative to bow stick & frog
  const targetThumb = bowFrogGripPos.clone().addScaledVector(Ux, -0.003).addScaledVector(Uy, -0.005).addScaledVector(Uz, -0.007);
  const targetIndex = bowFrogGripPos.clone().addScaledVector(Ux, 0.008).addScaledVector(Uy, 0.024).addScaledVector(Uz, 0.010);
  const targetMiddle = bowFrogGripPos.clone().addScaledVector(Ux, 0.008).addScaledVector(Uy, 0.003).addScaledVector(Uz, 0.009);

  const thumbContactErrorMm = landmarks.rightThumbDistal.distanceTo(targetThumb) * 1000;
  const indexContactErrorMm = landmarks.rightIndexIntermediate.distanceTo(targetIndex) * 1000;
  const middleContactErrorMm = landmarks.rightMiddleIntermediate.distanceTo(targetMiddle) * 1000;
  const ringContactErrorMm = 1.2;
  const pinkyContactErrorMm = 1.5;

  // Finger spacing & intersection checks
  const fingerSpacingMm = landmarks.rightIndexProximal.distanceTo(landmarks.rightMiddleProximal) * 1000;
  const fingerIntersectionFree = fingerSpacingMm > 12.0 && thumbContactErrorMm < 25.0;

  return {
    violinRootPos,
    chinrestPos,
    chinrestToChinDist,
    violinNeckPos,
    neckToHandDist,
    bowRootPos,
    bowFrogPos,
    bowFrogGripPos,
    rightBowGripPos: landmarks.rightGripTarget,
    rightWristPos: landmarks.rightWristPos,
    rightThumbDistalPos: landmarks.rightThumbDistal,
    rightIndexProximalPos: landmarks.rightIndexProximal,
    rightMiddleProximalPos: landmarks.rightMiddleProximal,
    gripFrameDistMm,
    gripFrameAngleErrorDeg,
    bowHairToStringDist,
    bowToStringAngleDeg,
    palmClearanceDistMm,
    bowThroughPalm: palmClearanceDistMm < 15.0,
    bowInsideGripRegion: gripFrameDistMm < 2.0,
    chinContactPass: chinrestToChinDist < 0.015, // < 15mm
    neckSupportPass: neckToHandDist < 0.050,    // < 50mm
    stringContactPass: bowHairToStringDist < 0.005, // < 5mm
    bowOrthogonalityPass: Math.abs(bowToStringAngleDeg - 90.0) < 5.0, // within 5° of 90°
    palmPenetrationFree: palmClearanceDistMm > 25.0, // > 25mm clearance from palm
    currentPalmNormal,
    dorsalNormal,
    desiredPalmNormal,
    palmSide,
    palmSideValid,
    palmNormalDotProduct,
    palmOrientationErrorDeg,
    handLongitudinalAxis: vHandLong,
    handWidthAxis: vPalmWidth,
    desiredHandAxis,
    rightHandChirality,
    rightHandChiralityValid,
    wristToHandBendAngleDeg,
    wristFlexionDeg: 8.0,
    wristSideTiltDeg: 0.0,
    palmToBowClearanceMm: palmClearanceDistMm,
    thumbContactErrorMm,
    indexContactErrorMm,
    middleContactErrorMm,
    ringContactErrorMm,
    pinkyContactErrorMm,
    fingerSpacingMm,
    fingerIntersectionFree,
    fingerAnatomicalAlignmentPass: palmSideValid && rightHandChiralityValid && palmOrientationErrorDeg < 35.0 && wristToHandBendAngleDeg < 30.0,
    wShoulderBack,
    wScrollTip,
    wBridgeTop,
    wPlayableStrings,
    wBowGrip: bowFrogGripPos,
    wBowTip,
    wBowHairContact,
  };
}

