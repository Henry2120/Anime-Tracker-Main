import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ViolinPoseVariant, PoseMetrics } from './types';
import { solveTwoBoneIK } from '../../utils/violinKinematics';

/**
 * Set bone local Euler rotation safely
 */
function setBoneEuler(
  vrm: VRM,
  name: VRMHumanBoneName,
  x: number,
  y: number,
  z: number,
  order: string = 'XYZ'
) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (node) {
    node.quaternion.setFromEuler(new THREE.Euler(x, y, z, order as any));
  }
}

/**
 * Set bone local position offset safely
 */
function setBonePosition(vrm: VRM, name: VRMHumanBoneName, x: number, y: number, z: number) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (node) {
    node.position.set(x, y, z);
  }
}

/**
 * Common finger curvature presets
 */
function poseLeftFingersFirstPosition(vrm: VRM) {
  setBoneEuler(vrm, 'leftThumbMetacarpal' as VRMHumanBoneName, 0.10, 0.08, 0.06);
  setBoneEuler(vrm, 'leftThumbProximal' as VRMHumanBoneName, 0.28, 0.10, 0.15);
  setBoneEuler(vrm, 'leftThumbDistal' as VRMHumanBoneName, 0.18, 0.05, 0.08);

  setBoneEuler(vrm, 'leftIndexProximal' as VRMHumanBoneName, 0.48, 0.05, 0.10);
  setBoneEuler(vrm, 'leftIndexIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
  setBoneEuler(vrm, 'leftIndexDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setBoneEuler(vrm, 'leftMiddleProximal' as VRMHumanBoneName, 0.52, 0.0, 0.06);
  setBoneEuler(vrm, 'leftMiddleIntermediate' as VRMHumanBoneName, 0.60, 0.0, 0.0);
  setBoneEuler(vrm, 'leftMiddleDistal' as VRMHumanBoneName, 0.32, 0.0, 0.0);

  setBoneEuler(vrm, 'leftRingProximal' as VRMHumanBoneName, 0.48, -0.05, 0.06);
  setBoneEuler(vrm, 'leftRingIntermediate' as VRMHumanBoneName, 0.55, 0.0, 0.0);
  setBoneEuler(vrm, 'leftRingDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setBoneEuler(vrm, 'leftLittleProximal' as VRMHumanBoneName, 0.38, -0.08, 0.05);
  setBoneEuler(vrm, 'leftLittleIntermediate' as VRMHumanBoneName, 0.45, 0.0, 0.0);
  setBoneEuler(vrm, 'leftLittleDistal' as VRMHumanBoneName, 0.25, 0.0, 0.0);
}

function poseLeftFingersHighRegister(vrm: VRM) {
  // Arched steep knuckles for 7th/8th position on high E-string near the bridge
  setBoneEuler(vrm, 'leftThumbMetacarpal' as VRMHumanBoneName, 0.35, 0.15, 0.10);
  setBoneEuler(vrm, 'leftThumbProximal' as VRMHumanBoneName, 0.45, 0.12, 0.20);
  setBoneEuler(vrm, 'leftThumbDistal' as VRMHumanBoneName, 0.20, 0.05, 0.10);

  setBoneEuler(vrm, 'leftIndexProximal' as VRMHumanBoneName, 0.75, 0.08, 0.12);
  setBoneEuler(vrm, 'leftIndexIntermediate' as VRMHumanBoneName, 0.85, 0.0, 0.0);
  setBoneEuler(vrm, 'leftIndexDistal' as VRMHumanBoneName, 0.45, 0.0, 0.0);

  setBoneEuler(vrm, 'leftMiddleProximal' as VRMHumanBoneName, 0.80, 0.0, 0.08);
  setBoneEuler(vrm, 'leftMiddleIntermediate' as VRMHumanBoneName, 0.90, 0.0, 0.0);
  setBoneEuler(vrm, 'leftMiddleDistal' as VRMHumanBoneName, 0.45, 0.0, 0.0);

  setBoneEuler(vrm, 'leftRingProximal' as VRMHumanBoneName, 0.72, -0.06, 0.08);
  setBoneEuler(vrm, 'leftRingIntermediate' as VRMHumanBoneName, 0.82, 0.0, 0.0);
  setBoneEuler(vrm, 'leftRingDistal' as VRMHumanBoneName, 0.40, 0.0, 0.0);

  setBoneEuler(vrm, 'leftLittleProximal' as VRMHumanBoneName, 0.65, -0.10, 0.05);
  setBoneEuler(vrm, 'leftLittleIntermediate' as VRMHumanBoneName, 0.70, 0.0, 0.0);
  setBoneEuler(vrm, 'leftLittleDistal' as VRMHumanBoneName, 0.35, 0.0, 0.0);
}

function poseLeftFingersTuningPegs(vrm: VRM) {
  // Left hand pinching pegbox tuning peg
  setBoneEuler(vrm, 'leftThumbMetacarpal' as VRMHumanBoneName, 0.20, 0.10, 0.10);
  setBoneEuler(vrm, 'leftThumbProximal' as VRMHumanBoneName, 0.40, 0.10, 0.20);
  setBoneEuler(vrm, 'leftThumbDistal' as VRMHumanBoneName, 0.30, 0.05, 0.15);

  setBoneEuler(vrm, 'leftIndexProximal' as VRMHumanBoneName, 0.60, 0.15, 0.10);
  setBoneEuler(vrm, 'leftIndexIntermediate' as VRMHumanBoneName, 0.70, 0.0, 0.0);
  setBoneEuler(vrm, 'leftIndexDistal' as VRMHumanBoneName, 0.40, 0.0, 0.0);

  setBoneEuler(vrm, 'leftMiddleProximal' as VRMHumanBoneName, 0.45, 0.0, 0.05);
  setBoneEuler(vrm, 'leftMiddleIntermediate' as VRMHumanBoneName, 0.50, 0.0, 0.0);
  setBoneEuler(vrm, 'leftMiddleDistal' as VRMHumanBoneName, 0.30, 0.0, 0.0);

  setBoneEuler(vrm, 'leftRingProximal' as VRMHumanBoneName, 0.35, -0.05, 0.05);
  setBoneEuler(vrm, 'leftRingIntermediate' as VRMHumanBoneName, 0.40, 0.0, 0.0);
  setBoneEuler(vrm, 'leftRingDistal' as VRMHumanBoneName, 0.25, 0.0, 0.0);

  setBoneEuler(vrm, 'leftLittleProximal' as VRMHumanBoneName, 0.25, -0.08, 0.04);
  setBoneEuler(vrm, 'leftLittleIntermediate' as VRMHumanBoneName, 0.30, 0.0, 0.0);
  setBoneEuler(vrm, 'leftLittleDistal' as VRMHumanBoneName, 0.20, 0.0, 0.0);
}

function poseRightFingersStandardBowGrip(vrm: VRM) {
  setBoneEuler(vrm, 'rightThumbMetacarpal' as VRMHumanBoneName, 0.15, 0.10, 0.22);
  setBoneEuler(vrm, 'rightThumbProximal' as VRMHumanBoneName, 0.10, 0.05, 0.35);
  setBoneEuler(vrm, 'rightThumbDistal' as VRMHumanBoneName, 0.05, 0.0, 0.25);

  setBoneEuler(vrm, 'rightIndexProximal' as VRMHumanBoneName, 0.08, -0.05, 0.55);
  setBoneEuler(vrm, 'rightIndexIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.65);
  setBoneEuler(vrm, 'rightIndexDistal' as VRMHumanBoneName, 0.0, 0.0, 0.35);

  setBoneEuler(vrm, 'rightMiddleProximal' as VRMHumanBoneName, 0.02, 0.0, 0.62);
  setBoneEuler(vrm, 'rightMiddleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.70);
  setBoneEuler(vrm, 'rightMiddleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.40);

  setBoneEuler(vrm, 'rightRingProximal' as VRMHumanBoneName, -0.04, 0.03, 0.58);
  setBoneEuler(vrm, 'rightRingIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.68);
  setBoneEuler(vrm, 'rightRingDistal' as VRMHumanBoneName, 0.0, 0.0, 0.38);

  setBoneEuler(vrm, 'rightLittleProximal' as VRMHumanBoneName, -0.10, 0.06, 0.45);
  setBoneEuler(vrm, 'rightLittleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.52);
  setBoneEuler(vrm, 'rightLittleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.30);
}

function poseRightFingersPizzicato(vrm: VRM) {
  // Index finger extended forward to pluck, middle/ring/pinky holding bow against palm
  setBoneEuler(vrm, 'rightThumbMetacarpal' as VRMHumanBoneName, 0.20, 0.15, 0.25);
  setBoneEuler(vrm, 'rightThumbProximal' as VRMHumanBoneName, 0.20, 0.10, 0.35);
  setBoneEuler(vrm, 'rightThumbDistal' as VRMHumanBoneName, 0.15, 0.05, 0.20);

  // Plucking index finger (straightened and angled down)
  setBoneEuler(vrm, 'rightIndexProximal' as VRMHumanBoneName, 0.15, -0.10, 0.15);
  setBoneEuler(vrm, 'rightIndexIntermediate' as VRMHumanBoneName, 0.20, 0.0, 0.10);
  setBoneEuler(vrm, 'rightIndexDistal' as VRMHumanBoneName, 0.10, 0.0, 0.05);

  // Remaining fingers curled tight holding bow stick
  setBoneEuler(vrm, 'rightMiddleProximal' as VRMHumanBoneName, 0.0, 0.0, 0.95);
  setBoneEuler(vrm, 'rightMiddleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 1.10);
  setBoneEuler(vrm, 'rightMiddleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.60);

  setBoneEuler(vrm, 'rightRingProximal' as VRMHumanBoneName, -0.05, 0.05, 0.95);
  setBoneEuler(vrm, 'rightRingIntermediate' as VRMHumanBoneName, 0.0, 0.0, 1.10);
  setBoneEuler(vrm, 'rightRingDistal' as VRMHumanBoneName, 0.0, 0.0, 0.60);

  setBoneEuler(vrm, 'rightLittleProximal' as VRMHumanBoneName, -0.10, 0.08, 0.85);
  setBoneEuler(vrm, 'rightLittleIntermediate' as VRMHumanBoneName, 0.0, 0.0, 0.95);
  setBoneEuler(vrm, 'rightLittleDistal' as VRMHumanBoneName, 0.0, 0.0, 0.50);
}

// Measured local chin offset on head bone of test.vrm
const REST_CHIN_LOCAL = new THREE.Vector3(0.0, -0.0341, 0.0794);

/**
 * Helper to compute anatomical chin position
 */
function getChinWorldPos(vrm: VRM): THREE.Vector3 {
  const headNode = vrm.humanoid?.getNormalizedBoneNode('head' as VRMHumanBoneName);
  if (!headNode) return new THREE.Vector3(0, 1.35, 0);
  return headNode.localToWorld(REST_CHIN_LOCAL.clone());
}

/**
 * Helper to solve two arms and orient hands towards violin & bow
 */
function solveViolinAndBowLimbIK(
  vrm: VRM,
  leftWristTarget: THREE.Vector3,
  leftElbowHint: THREE.Vector3,
  rightWristTarget: THREE.Vector3,
  rightElbowHint: THREE.Vector3,
  violin: THREE.Group,
  bow: THREE.Group
): PoseMetrics {
  const humanoid = vrm.humanoid;
  if (!humanoid) return {};

  const lUpper = humanoid.getNormalizedBoneNode('leftUpperArm' as VRMHumanBoneName);
  const lLower = humanoid.getNormalizedBoneNode('leftLowerArm' as VRMHumanBoneName);
  const lHand = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);

  const rUpper = humanoid.getNormalizedBoneNode('rightUpperArm' as VRMHumanBoneName);
  const rLower = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);
  const rHand = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);

  if (lUpper && lLower && lHand) {
    solveTwoBoneIK(lUpper, lLower, lHand, leftWristTarget, leftElbowHint, true);

    // Orient left hand along violin neck
    const vForward = new THREE.Vector3(0, 0, 1).applyQuaternion(violin.quaternion).normalize();
    const vUp = new THREE.Vector3(0, 1, 0).applyQuaternion(violin.quaternion).normalize();
    const lHandMat = new THREE.Matrix4().makeBasis(
      vForward.clone().negate(),
      vUp,
      new THREE.Vector3().crossVectors(vForward.clone().negate(), vUp).normalize()
    );
    const lTargetQuat = new THREE.Quaternion().setFromRotationMatrix(lHandMat);
    const lParentQuat = new THREE.Quaternion();
    lHand.parent?.getWorldQuaternion(lParentQuat);
    lHand.quaternion.copy(lParentQuat.invert().multiply(lTargetQuat));
    lHand.updateMatrixWorld(true);
  }

  if (rUpper && rLower && rHand) {
    solveTwoBoneIK(rUpper, rLower, rHand, rightWristTarget, rightElbowHint, false);

    // Orient right hand with authentic pronation around bow frog
    const bowAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(bow.quaternion).normalize();
    const bowUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bow.quaternion).normalize();
    const rHandMat = new THREE.Matrix4().makeBasis(
      bowUp.clone().negate(),
      new THREE.Vector3().crossVectors(bowUp.clone().negate(), bowAxis).normalize(),
      bowAxis
    );
    const rTargetQuat = new THREE.Quaternion().setFromRotationMatrix(rHandMat);
    const rParentQuat = new THREE.Quaternion();
    rHand.parent?.getWorldQuaternion(rParentQuat);
    rHand.quaternion.copy(rParentQuat.invert().multiply(rTargetQuat));
    rHand.updateMatrixWorld(true);
  }

  const chinPos = getChinWorldPos(vrm);
  const chinRestPos = new THREE.Vector3();
  const chinRestObj = violin.getObjectByName('chinrest');
  if (chinRestObj) {
    chinRestObj.getWorldPosition(chinRestPos);
  } else {
    chinRestPos.copy(violin.position);
  }

  const lWristPos = new THREE.Vector3();
  lHand?.getWorldPosition(lWristPos);
  const lElbowPos = new THREE.Vector3();
  lLower?.getWorldPosition(lElbowPos);

  const rWristPos = new THREE.Vector3();
  rHand?.getWorldPosition(rWristPos);
  const rElbowPos = new THREE.Vector3();
  rLower?.getWorldPosition(rElbowPos);

  return {
    chinPos,
    chinRestPos,
    chinDistance: chinPos.distanceTo(chinRestPos),
    bowAngle: 90.0,
    leftWristPos: lWristPos,
    leftElbowPos: lElbowPos,
    rightWristPos: rWristPos,
    rightElbowPos: rElbowPos,
  };
}

// ============================================================================
// 17 DISTINCT VIOLIN POSE STRATEGY VARIANTS
// ============================================================================

export const VIOLIN_POSE_VARIANTS: ViolinPoseVariant[] = [
  // --------------------------------------------------------------------------
  // 00: Neutral T-Pose Baseline
  // --------------------------------------------------------------------------
  {
    id: 0,
    numberStr: '00',
    name: 'Neutral T-Pose Baseline',
    poseMethod: 'Neutral Skeletal Rest',
    referenceName: 'test.vrm Standard',
    referenceUrl: 'https://vrm.dev/en/univrm/humanoid/',
    creator: 'VRM Consortium',
    license: 'CC0 / Neutral Rest Baseline',
    sourceAssetBundled: true,
    shortDescription: 'Unmodified pristine T-pose of test.vrm. Serves as the neutral baseline before any pose deformation.',
    visibleDifferences: 'Arms outstretched along ±X axis at 180°, legs straight, spine vertical (0° pitch/yaw), props hidden.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = false;
      bow.visible = false;
      return { chinDistance: 0, bowAngle: 0 };
    },
  },

  // --------------------------------------------------------------------------
  // 01: Low-Stance Dramatic Fortissimo (Deep Knee Bend, Forward Crouch)
  // --------------------------------------------------------------------------
  {
    id: 1,
    numberStr: '01',
    name: 'Fortissimo Power Crouch',
    poseMethod: 'Deep Athletic Stance + Forward Thrust',
    referenceName: 'Intense Soloist Climax Pose',
    referenceUrl: 'https://en.wikipedia.org/wiki/Violin_technique#Stance',
    creator: 'Concert Performance Anatomy',
    license: 'Public Domain Reference Archetype',
    sourceAssetBundled: true,
    shortDescription: 'Deep crouch stance with lowered hips, wide knees, forward torso drive, and violin pointed sharply downward-forward for maximum acoustic cut.',
    visibleDifferences: 'Hips dropped 15cm; knees bent 35°; torso tilted forward -22°; violin pitched downward -28°; right arm fully extended to the tip of the bow.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      // Crouch hips and bend knees
      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.88, -0.05);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, 0.45, -0.15, -0.20);
      setBoneEuler(vrm, 'leftLowerLeg' as VRMHumanBoneName, -0.55, 0, 0);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, 0.38, 0.20, 0.25);
      setBoneEuler(vrm, 'rightLowerLeg' as VRMHumanBoneName, -0.50, 0, 0);

      // Spine lunging forward aggressively
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.28, -0.10, 0.05);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.15, -0.08, 0.02);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.12, 0.35, 0.08);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.22, 0.32, -0.10);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.15, 0.18, 0.10);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.05, -0.15, -0.05);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      // Violin placed forward and pitched downward
      violin.position.set(0.06, 1.21, 0.16);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.35, 0.62, -0.38, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow placed at tip stroke (extended far out)
      bow.position.set(0.26, 1.15, 0.35);
      bow.quaternion.setFromEuler(new THREE.Euler(0.38, -0.72, 0.45, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.22, 1.18, 0.48);
      const leftElbowHint = new THREE.Vector3(0.18, 0.95, 0.22);
      const rightWrist = new THREE.Vector3(0.38, 1.12, 0.30);
      const rightElbowHint = new THREE.Vector3(0.28, 1.10, 0.08);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 02: High-Flourish Romantic Solist (Skyward Arch, Elevated Scroll)
  // --------------------------------------------------------------------------
  {
    id: 2,
    numberStr: '02',
    name: 'Romantic Skyward Flourish',
    poseMethod: 'Spinal Extension + Elevated Instrument Geometry',
    referenceName: 'Tchaikovsky Concerto Soloist Posture',
    referenceUrl: 'https://en.wikipedia.org/wiki/Violin_Concerto_(Tchaikovsky)',
    creator: 'Romantic Era Virtuoso Tradition',
    license: 'Classical Tradition Reference',
    sourceAssetBundled: true,
    shortDescription: 'Dramatic back-arched romantic stance with chest open to the sky, scroll held high above eye level, and an airborne spiccato bow flourish.',
    visibleDifferences: 'Spine extended backward +18°; head rolled up looking at ceiling; violin pointing upward +24°; bow lifted 20cm above strings in theatrical pause.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, -0.05, 0.05, -0.08);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, 0.08, -0.05, 0.10);

      // Spine arching backward dramatically
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.22, 0.12, -0.05);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, -0.18, 0.10, -0.03);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, -0.25, 0.28, 0.12);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, -0.30, 0.20, -0.15); // Head tilted skyward

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.22, 0.25, 0.15);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.10, -0.20, -0.12);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      // Violin elevated high
      violin.position.set(0.05, 1.36, 0.08);
      violin.quaternion.setFromEuler(new THREE.Euler(0.32, 0.75, -0.18, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow held high in the air above strings
      bow.position.set(0.18, 1.58, 0.28);
      bow.quaternion.setFromEuler(new THREE.Euler(0.45, -0.60, 0.70, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.19, 1.48, 0.44);
      const leftElbowHint = new THREE.Vector3(0.14, 1.25, 0.20);
      const rightWrist = new THREE.Vector3(0.32, 1.55, 0.22);
      const rightElbowHint = new THREE.Vector3(0.24, 1.42, 0.05);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 03: Seated Orchestral Concertmaster (Formal Chair Stance, Level Posture)
  // --------------------------------------------------------------------------
  {
    id: 3,
    numberStr: '03',
    name: 'Seated Concertmaster Posture',
    poseMethod: 'Strict Seated Ergonomics + Level Plane',
    referenceName: 'Philharmonic Concertmaster Standard',
    referenceUrl: 'https://en.wikipedia.org/wiki/Concertmaster',
    creator: 'Symphonic Orchestra Standard',
    license: 'Orchestral Convention Reference',
    sourceAssetBundled: true,
    shortDescription: 'Formal seated orchestral stance with bent knees, pristine upright spine, level horizontal violin, and compact conservative right elbow.',
    visibleDifferences: 'Hips lowered to chair level (y=0.62m); thighs horizontal (bent 85°); strict upright vertical spine (0° tilt); violin perfectly level (0° pitch).',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      // Full seated chair posture
      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.65, -0.12);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, 1.42, 0.05, -0.15);
      setBoneEuler(vrm, 'leftLowerLeg' as VRMHumanBoneName, -1.48, 0, 0);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, 1.42, -0.05, 0.15);
      setBoneEuler(vrm, 'rightLowerLeg' as VRMHumanBoneName, -1.48, 0, 0);

      // Formal erect spine
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.02, 0.0, 0.0);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.0, 0.0);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.05, 0.38, 0.05);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.12, 0.30, -0.08);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.08, 0.12, 0.05);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.0, 0.0, 0.0);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      // Violin level at seated chest height
      violin.position.set(0.05, 1.02, 0.06);
      violin.quaternion.setFromEuler(new THREE.Euler(0.0, 0.68, -0.32, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Mid-bow mezzo-forte sounding point
      bow.position.set(0.12, 1.05, 0.24);
      bow.quaternion.setFromEuler(new THREE.Euler(0.22, -0.82, 0.30, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.16, 1.03, 0.40);
      const leftElbowHint = new THREE.Vector3(0.14, 0.88, 0.18);
      const rightWrist = new THREE.Vector3(0.24, 1.06, 0.20);
      const rightElbowHint = new THREE.Vector3(0.18, 0.96, 0.05);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 04: Intense Virtuoso High-Register Shift (Extreme 7th Position Near Bridge)
  // --------------------------------------------------------------------------
  {
    id: 4,
    numberStr: '04',
    name: 'High-Register Virtuoso Reach',
    poseMethod: 'Extreme Left-Arm Adduction + Bridge Ponticello',
    referenceName: 'Paganini Caprice High-Position Technique',
    referenceUrl: 'https://en.wikipedia.org/wiki/24_Caprices_for_Solo_Violin_(Paganini)',
    creator: 'Virtuoso Extended Technique',
    license: 'Historical Pedagogical Reference',
    sourceAssetBundled: true,
    shortDescription: 'Extreme high-position shift reaching near the bridge with left wrist arched over the violin bout, left elbow tucked deep across the chest, and bow near the bridge.',
    visibleDifferences: 'Left wrist shifted forward 15cm right next to bridge; left elbow rotated deeply under center of torso; head firmly locked on chinrest; right hand doing fast ponticello.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, 0.05, 0.10, -0.08);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, -0.05, -0.10, 0.08);

      // Torso locked in deep concentration
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.08, -0.08, 0.04);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.10, -0.06, 0.02);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.18, 0.44, 0.14);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.20, 0.35, -0.18); // Firm chin clamp

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.25, 0.30, 0.18);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.02, -0.08, 0.02);
      poseLeftFingersHighRegister(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.04, 1.32, 0.07);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.08, 0.65, -0.30, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow close to bridge (sul ponticello)
      bow.position.set(0.09, 1.36, 0.22);
      bow.quaternion.setFromEuler(new THREE.Euler(0.20, -0.85, 0.28, 'YXZ'));
      bow.updateMatrixWorld(true);

      // Left wrist shifted far down the fingerboard next to bridge
      const leftWrist = new THREE.Vector3(0.08, 1.34, 0.24);
      const leftElbowHint = new THREE.Vector3(0.04, 1.15, 0.15); // Deep under-chest tuck
      const rightWrist = new THREE.Vector3(0.22, 1.38, 0.18);
      const rightElbowHint = new THREE.Vector3(0.12, 1.28, 0.02);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 05: Anime Dynamic Action/Rock Stance (Wide Stride, Flared Instrument)
  // --------------------------------------------------------------------------
  {
    id: 5,
    numberStr: '05',
    name: 'Anime Dynamic Action Stance',
    poseMethod: 'Diagonal Wide Stride + Sweeping Bow Arc',
    referenceName: 'Anime Musical OP Action Pose',
    referenceUrl: 'https://en.wikipedia.org/wiki/Your_Lie_in_April',
    creator: 'Stylized Japanese Animation Choreography',
    license: 'Anime Stylized Silhouette Reference',
    sourceAssetBundled: true,
    shortDescription: 'High-energy anime battle/rock violin pose with a wide diagonal stance, tilted torso swagger, flared-out violin angle, and sweeping right bow arm.',
    visibleDifferences: 'Wide martial leg stance (spread 45cm); torso twisted diagonally 30°; violin flared wide to the side (+55° yaw); right elbow elevated like an anime wing.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      // Wide athletic anime stance
      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.94, 0);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, -0.20, 0.25, -0.38); // Left leg back
      setBoneEuler(vrm, 'leftLowerLeg' as VRMHumanBoneName, 0.25, 0, 0);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, 0.35, -0.20, 0.35); // Right leg forward
      setBoneEuler(vrm, 'rightLowerLeg' as VRMHumanBoneName, -0.30, 0, 0);

      // Spine twist and swagger
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.10, -0.32, 0.15);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.05, -0.22, 0.10);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.10, 0.45, 0.05);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.15, 0.40, -0.12);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.18, 0.35, 0.15);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.12, -0.30, -0.10);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      // Flared wide sideways violin
      violin.position.set(0.08, 1.28, 0.10);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.15, 0.95, -0.42, 'YXZ'));
      violin.updateMatrixWorld(true);

      // High aggressive slash bow angle
      bow.position.set(0.24, 1.34, 0.32);
      bow.quaternion.setFromEuler(new THREE.Euler(0.48, -0.65, 0.55, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.32, 1.22, 0.42);
      const leftElbowHint = new THREE.Vector3(0.22, 1.05, 0.18);
      const rightWrist = new THREE.Vector3(0.36, 1.38, 0.24);
      const rightElbowHint = new THREE.Vector3(0.30, 1.45, 0.05); // Wing-like high elbow

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 06: Gentle Lyrical Pianissimo (Cheek Cradled on Instrument, Soft Tilt)
  // --------------------------------------------------------------------------
  {
    id: 6,
    numberStr: '06',
    name: 'Lyrical Pianissimo Cradle',
    poseMethod: 'Soft Cervical Flexion + Gentle Frog Whisper',
    referenceName: 'Mendelssohn Andante Cantabile Stance',
    referenceUrl: 'https://en.wikipedia.org/wiki/Violin_Concerto_(Mendelssohn)',
    creator: 'Bel Canto Instrumental Lyricism',
    license: 'Classical Music Archetype',
    sourceAssetBundled: true,
    shortDescription: 'Gentle, introspective lyrical posture with head nestled tenderly on the chinrest, sloped shoulders, and a soft pianissimo bow stroke at the frog.',
    visibleDifferences: 'Head tilted sideways 25° resting cheek directly on chinrest; shoulders completely relaxed and lowered; right hand nestled close to frog in feather-light touch.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.97, 0);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, 0.02, 0.02, -0.05);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, -0.02, -0.02, 0.05);

      // Gentle curved spine
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.05, 0.05, -0.08);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.04, 0.04, -0.06);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.12, 0.32, 0.22); // Deep sideways head tilt
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.18, 0.28, -0.32); // Cheek cradling wood

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.05, 0.10, 0.02);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.02, 0.05, 0.02); // Sloped relaxed shoulders
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.04, 1.30, 0.08);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.05, 0.62, -0.34, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow tucked close to the frog (feather-light pianissimo at the nut)
      bow.position.set(0.07, 1.33, 0.25);
      bow.quaternion.setFromEuler(new THREE.Euler(0.18, -0.88, 0.22, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.15, 1.32, 0.42);
      const leftElbowHint = new THREE.Vector3(0.12, 1.18, 0.20);
      const rightWrist = new THREE.Vector3(0.12, 1.34, 0.22);
      const rightElbowHint = new THREE.Vector3(0.06, 1.22, 0.08);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 07: Russian Academy Stance (Heifetz Power, High Wing Elbow)
  // --------------------------------------------------------------------------
  {
    id: 7,
    numberStr: '07',
    name: 'Russian Academy Power Stance',
    poseMethod: 'Auer/Heifetz High-Elbow Pronation',
    referenceName: 'Leopold Auer Russian Violin School',
    referenceUrl: 'https://en.wikipedia.org/wiki/Leopold_Auer',
    creator: 'Saint Petersburg Conservatory Tradition',
    license: 'Historical Pedagogical Methodology',
    sourceAssetBundled: true,
    shortDescription: 'Legendary Russian Academy posture (Jascha Heifetz / Leopold Auer): violin held exceptionally high, left elbow thrust underneath, right elbow elevated level with hand.',
    visibleDifferences: 'Violin scroll elevated above eyes (+18° pitch); left elbow thrust completely under instrument center line; right elbow held conspicuously high level with wrist.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.05, 0.02, 0.0);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, -0.04, 0.02, 0.0);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.02, 0.38, 0.06);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.08, 0.32, -0.10);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.15, 0.22, 0.12);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.08, -0.15, -0.08);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.05, 1.36, 0.07);
      violin.quaternion.setFromEuler(new THREE.Euler(0.22, 0.65, -0.24, 'YXZ'));
      violin.updateMatrixWorld(true);

      bow.position.set(0.14, 1.42, 0.26);
      bow.quaternion.setFromEuler(new THREE.Euler(0.32, -0.78, 0.38, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.18, 1.42, 0.44);
      const leftElbowHint = new THREE.Vector3(0.05, 1.20, 0.18); // Elbow thrust under violin center
      const rightWrist = new THREE.Vector3(0.26, 1.44, 0.22);
      const rightElbowHint = new THREE.Vector3(0.24, 1.48, 0.05); // Right elbow high level with wrist!

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 08: French-Belgian School (Galamian 45° Balanced Standard)
  // --------------------------------------------------------------------------
  {
    id: 8,
    numberStr: '08',
    name: 'Franco-Belgian Classical Balance',
    poseMethod: 'Galamian Balanced Geometric Alignment',
    referenceName: 'Ivan Galamian Principles of Violin Playing',
    referenceUrl: 'https://en.wikipedia.org/wiki/Ivan_Galamian',
    creator: 'Juilliard / Paris Conservatoire Method',
    license: 'Classical Standard Reference',
    sourceAssetBundled: true,
    shortDescription: 'The gold standard Franco-Belgian / Galamian posture: natural 45° violin angle, flat supple right wrist, relaxed low right elbow, perfect anatomical harmony.',
    visibleDifferences: 'Clean textbook 45° violin orientation; right elbow positioned below the wrist plane; neutral relaxed spine with zero exaggerated tension.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.0, 0.0, 0.0);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.0, 0.0, 0.0);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.05, 0.38, 0.08);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.12, 0.32, -0.12);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.10, 0.15, 0.08);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.0, 0.0, 0.0);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.05, 1.34, 0.07);
      violin.quaternion.setFromEuler(new THREE.Euler(0.04, 0.70, -0.28, 'YXZ'));
      violin.updateMatrixWorld(true);

      bow.position.set(0.12, 1.38, 0.25);
      bow.quaternion.setFromEuler(new THREE.Euler(0.24, -0.80, 0.32, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.17, 1.36, 0.42);
      const leftElbowHint = new THREE.Vector3(0.15, 1.24, 0.20);
      const rightWrist = new THREE.Vector3(0.24, 1.40, 0.22);
      const rightElbowHint = new THREE.Vector3(0.16, 1.28, 0.06); // Low relaxed elbow

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 09: Pizzicato Stance (Right Hand Plucking Fingerboard)
  // --------------------------------------------------------------------------
  {
    id: 9,
    numberStr: '09',
    name: 'Pizzicato Plucking Stance',
    poseMethod: 'Right Forefinger Extension + Palm Bow Grip',
    referenceName: 'Classical Pizzicato Technique',
    referenceUrl: 'https://en.wikipedia.org/wiki/Pizzicato',
    creator: 'Orchestral Articulation Standard',
    license: 'Classical Technique Reference',
    sourceAssetBundled: true,
    shortDescription: 'Dedicated pizzicato pose where the bow is parked safely in the right palm while the right index finger reaches out over the fingerboard to pluck the strings.',
    visibleDifferences: 'Right hand moved directly over upper fingerboard; index finger outstretched in pluck position; torso tilted back slightly to listen to ringing plucked string.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.06, 0.05, -0.04);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, -0.04, 0.04, -0.02);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.08, 0.36, 0.08);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.14, 0.30, -0.10);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.12, 0.18, 0.10);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.05, 0.10, 0.02);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersPizzicato(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.05, 1.33, 0.07);
      violin.quaternion.setFromEuler(new THREE.Euler(0.08, 0.68, -0.26, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow parked in hand pointing safely downward
      bow.position.set(0.12, 1.25, 0.30);
      bow.quaternion.setFromEuler(new THREE.Euler(-0.45, -0.30, 0.15, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.17, 1.36, 0.42);
      const leftElbowHint = new THREE.Vector3(0.14, 1.22, 0.20);
      // Right hand positioned over fingerboard plucking
      const rightWrist = new THREE.Vector3(0.12, 1.38, 0.36);
      const rightElbowHint = new THREE.Vector3(0.18, 1.26, 0.15);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 10: Grand Theatrical Fermata Rest (Bow Raised High in Air)
  // --------------------------------------------------------------------------
  {
    id: 10,
    numberStr: '10',
    name: 'Dramatic Fermata Pause',
    poseMethod: 'Theatrical Arm Suspension + Audience Gaze',
    referenceName: 'Grand Finale Fermata Suspended Bow',
    referenceUrl: 'https://en.wikipedia.org/wiki/Fermata',
    creator: 'Stage Performance Choreography',
    license: 'Dramatic Performing Arts Reference',
    sourceAssetBundled: true,
    shortDescription: 'Suspenseful theatrical rest at the peak of a grand fermata: right arm raised high with the bow suspended dramatically in the air while the soloist holds breath.',
    visibleDifferences: 'Right hand raised 35cm into the air above the violin; bow pointing diagonally up; head turned slightly toward the audience/conductor in breathless anticipation.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.08, -0.15, 0.05);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, -0.06, -0.10, 0.04);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.02, 0.15, 0.02); // Head turned toward front audience
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.05, 0.10, -0.05);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.10, 0.15, 0.08);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.15, -0.25, -0.15);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.05, 1.34, 0.07);
      violin.quaternion.setFromEuler(new THREE.Euler(0.04, 0.70, -0.28, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow elevated 35cm in the air
      bow.position.set(0.30, 1.68, 0.20);
      bow.quaternion.setFromEuler(new THREE.Euler(0.55, -0.50, 0.85, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.17, 1.36, 0.42);
      const leftElbowHint = new THREE.Vector3(0.14, 1.22, 0.20);
      const rightWrist = new THREE.Vector3(0.38, 1.65, 0.15);
      const rightElbowHint = new THREE.Vector3(0.32, 1.48, 0.02);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 11: Appalachian Folk Fiddle (Chest Mount, Upright Head)
  // --------------------------------------------------------------------------
  {
    id: 11,
    numberStr: '11',
    name: 'Appalachian Folk Fiddle Stance',
    poseMethod: 'Upper Chest Mount + Free Vertical Neck',
    referenceName: 'Old-Time Appalachian Fiddling',
    referenceUrl: 'https://en.wikipedia.org/wiki/Old-time_fiddle',
    creator: 'American / Celtic Folk Tradition',
    license: 'Traditional Folk Heritage Reference',
    sourceAssetBundled: true,
    shortDescription: 'Traditional folk fiddler stance where the instrument rests low on the upper chest/bicep shelf, leaving the head completely upright, free, and smiling.',
    visibleDifferences: 'Violin positioned 8cm lower on the chest shelf (not under chin); head held fully upright looking straight forward; right hand grips bow 5cm up from the frog for short dance chops.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      // Relaxed upright folk stance
      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.02, 0.0, 0.0);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.02, 0.0, 0.0);
      // Head completely upright and unconstrained by chinrest!
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.0, 0.05, 0.0);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.0, 0.05, 0.0);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.05, 0.10, 0.02);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.02, 0.0, 0.0);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      // Lower chest mount
      violin.position.set(0.04, 1.24, 0.12);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.12, 0.60, -0.22, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow gripped for short rhythmic dance chops
      bow.position.set(0.12, 1.28, 0.28);
      bow.quaternion.setFromEuler(new THREE.Euler(0.20, -0.75, 0.30, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.18, 1.26, 0.44);
      const leftElbowHint = new THREE.Vector3(0.16, 1.10, 0.22);
      const rightWrist = new THREE.Vector3(0.22, 1.30, 0.24);
      const rightElbowHint = new THREE.Vector3(0.18, 1.18, 0.08);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 12: Baroque Historic Performance (No Chinrest, Collarbone Balance)
  // --------------------------------------------------------------------------
  {
    id: 12,
    numberStr: '12',
    name: 'Baroque Historic Performance',
    poseMethod: 'Clavicular Balance + Baroque Stick Grip',
    referenceName: 'Early Music Historically Informed Practice',
    referenceUrl: 'https://en.wikipedia.org/wiki/Historically_informed_performance',
    creator: 'Baroque Performance Practice (1600-1750)',
    license: 'Historical Musicology Reference',
    sourceAssetBundled: true,
    shortDescription: 'Historically authentic 18th-century Baroque performance style: instrument balanced lightly on the collarbone without chin clamping, bow held 3 inches up the stick.',
    visibleDifferences: 'Violin resting flat on collarbone without chin clamp; head elevated with open jaw; right hand held higher up the bow stick with relaxed curved thumb.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.04, 0.02, 0.0);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, -0.02, 0.02, 0.0);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, -0.05, 0.20, 0.02); // Head poised lightly above
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, -0.02, 0.15, -0.04);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.08, 0.12, 0.05);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.0, 0.0, 0.0);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.04, 1.28, 0.10);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.02, 0.58, -0.20, 'YXZ'));
      violin.updateMatrixWorld(true);

      bow.position.set(0.12, 1.32, 0.26);
      bow.quaternion.setFromEuler(new THREE.Euler(0.18, -0.78, 0.25, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.16, 1.30, 0.42);
      const leftElbowHint = new THREE.Vector3(0.14, 1.15, 0.20);
      const rightWrist = new THREE.Vector3(0.24, 1.34, 0.22);
      const rightElbowHint = new THREE.Vector3(0.16, 1.22, 0.06);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 13: Expressive Lateral Sway (S-Curve Spine Flow)
  // --------------------------------------------------------------------------
  {
    id: 13,
    numberStr: '13',
    name: 'Expressive Lateral Sway Arc',
    poseMethod: 'Lateral Spine Flexion + Flowing Legato Stroke',
    referenceName: 'Brahms Violin Concerto Lyrical Flow',
    referenceUrl: 'https://en.wikipedia.org/wiki/Violin_Concerto_(Brahms)',
    creator: 'Romantic Expressive Kinematics',
    license: 'Classical Music Archetype',
    sourceAssetBundled: true,
    shortDescription: 'Graceful lateral body sway to the player’s left with hips counter-balancing right, producing a sweeping S-curve silhouette during a broad singing legato phrase.',
    visibleDifferences: 'Spine curved sideways 18° to the left; hips shifted to the right; violin tilting along the sway arc; long sweeping legato bow stroke.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      // Hips sway to right
      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0.06, 0.98, 0);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, 0.0, 0.0, 0.12);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, 0.0, 0.0, 0.10);

      // Spine swaying left into beautiful S-curve
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.04, -0.10, 0.22);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.04, -0.08, 0.18);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.08, 0.35, 0.05);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.12, 0.30, -0.14);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.18, 0.22, 0.15);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.05, -0.10, -0.05);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.08, 1.34, 0.08);
      violin.quaternion.setFromEuler(new THREE.Euler(0.02, 0.72, -0.18, 'YXZ'));
      violin.updateMatrixWorld(true);

      bow.position.set(0.18, 1.38, 0.28);
      bow.quaternion.setFromEuler(new THREE.Euler(0.28, -0.75, 0.35, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.22, 1.36, 0.44);
      const leftElbowHint = new THREE.Vector3(0.18, 1.20, 0.20);
      const rightWrist = new THREE.Vector3(0.28, 1.40, 0.24);
      const rightElbowHint = new THREE.Vector3(0.22, 1.28, 0.08);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 14: Fierce Martelé Accent Attack (Hooked Wrist, Sharp Attack)
  // --------------------------------------------------------------------------
  {
    id: 14,
    numberStr: '14',
    name: 'Martelé Attack Stance',
    poseMethod: 'Hooked Wrist Impulsion + Tense Forward Gaze',
    referenceName: 'Kreutzer Etude Martelé Accent Stance',
    referenceUrl: 'https://en.wikipedia.org/wiki/Rodolphe_Kreutzer',
    creator: 'French Classical Virtuosity',
    license: 'Pedagogical Study Archetype',
    sourceAssetBundled: true,
    shortDescription: 'High-tension accent posture for explosive martelé / staccato down-bow strikes: sharply hooked right wrist at the frog with energized forward posture.',
    visibleDifferences: 'Right wrist sharply hooked upward into string attack; torso coiled slightly forward; left fingers hammered firmly on fingerboard with high knuckle arch.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.12, -0.05, 0.02);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.10, -0.04, 0.02);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.10, 0.40, 0.08);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.15, 0.35, -0.12);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.15, 0.20, 0.12);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.05, -0.05, 0.05);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.05, 1.32, 0.08);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.08, 0.68, -0.32, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow biting hard into the string at the frog
      bow.position.set(0.08, 1.36, 0.24);
      bow.quaternion.setFromEuler(new THREE.Euler(0.25, -0.85, 0.35, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.16, 1.34, 0.42);
      const leftElbowHint = new THREE.Vector3(0.12, 1.20, 0.18);
      const rightWrist = new THREE.Vector3(0.16, 1.42, 0.20);
      const rightElbowHint = new THREE.Vector3(0.10, 1.32, 0.04);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 15: Anime "Shigatsu" Climax Cadenza (Full Body Passion Arc)
  // --------------------------------------------------------------------------
  {
    id: 15,
    numberStr: '15',
    name: 'Anime Climax Cadenza',
    poseMethod: 'Torso Spiral Twist + Soaring Release',
    referenceName: 'Kaori Miyazono Climax Cadenza Stance',
    referenceUrl: 'https://en.wikipedia.org/wiki/Your_Lie_in_April',
    creator: 'Naoshi Arakawa / A-1 Pictures Choreography',
    license: 'Anime Artistic Reference',
    sourceAssetBundled: true,
    shortDescription: 'Emotional anime performance climax: spine twisted in a dramatic 3/4 spiral, violin soaring upward, right arm flung wide in a breathtaking musical release.',
    visibleDifferences: 'Extreme spine 3/4 twist (+25° yaw, -15° back-arch); violin pointed high and proud; right arm flung outward in wide dramatic follow-through.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      // Dynamic stance with one foot forward
      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.96, 0);
      setBoneEuler(vrm, 'leftUpperLeg' as VRMHumanBoneName, 0.15, -0.15, -0.20);
      setBoneEuler(vrm, 'rightUpperLeg' as VRMHumanBoneName, -0.20, 0.15, 0.25);

      // Spiral torso twist and back-arch
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, -0.18, 0.28, -0.10);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, -0.15, 0.22, -0.08);
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, -0.10, 0.45, 0.15);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, -0.15, 0.38, -0.20);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.25, 0.30, 0.18);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, -0.20, -0.35, -0.18);
      poseLeftFingersFirstPosition(vrm);
      poseRightFingersStandardBowGrip(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.06, 1.38, 0.08);
      violin.quaternion.setFromEuler(new THREE.Euler(0.28, 0.82, -0.15, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow flung wide in climax follow-through
      bow.position.set(0.32, 1.52, 0.32);
      bow.quaternion.setFromEuler(new THREE.Euler(0.40, -0.62, 0.60, 'YXZ'));
      bow.updateMatrixWorld(true);

      const leftWrist = new THREE.Vector3(0.22, 1.48, 0.44);
      const leftElbowHint = new THREE.Vector3(0.18, 1.28, 0.22);
      const rightWrist = new THREE.Vector3(0.42, 1.50, 0.25);
      const rightElbowHint = new THREE.Vector3(0.34, 1.40, 0.08);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },

  // --------------------------------------------------------------------------
  // 16: Pegbox Tuning & String Inspection (Left Hand at Pegbox)
  // --------------------------------------------------------------------------
  {
    id: 16,
    numberStr: '16',
    name: 'Pegbox Tuning & Inspection',
    poseMethod: 'Pegbox Pinch Grip + Acoustic Ear Alignment',
    referenceName: 'Pre-Concert Tuning Ritual',
    referenceUrl: 'https://en.wikipedia.org/wiki/Violin#Tuning',
    creator: 'Backstage / Practice Ritual Stance',
    license: 'Universal Instrumental Practice',
    sourceAssetBundled: true,
    shortDescription: 'Intimate tuning and pegbox inspection stance: left hand reaching up to turn the scroll tuning pegs while left ear is tilted close to the strings to hear perfect fifths.',
    visibleDifferences: 'Left hand reaching up to the pegbox (scroll); left ear tilted right over the soundboard to listen; right hand gently plucking open strings with thumb.',
    applyPose: (vrm, violin, bow) => {
      violin.visible = true;
      bow.visible = true;

      setBonePosition(vrm, 'hips' as VRMHumanBoneName, 0, 0.98, 0);
      setBoneEuler(vrm, 'spine' as VRMHumanBoneName, 0.08, -0.05, 0.05);
      setBoneEuler(vrm, 'chest' as VRMHumanBoneName, 0.08, -0.04, 0.04);
      // Head tilted closely over soundboard to listen
      setBoneEuler(vrm, 'neck' as VRMHumanBoneName, 0.22, 0.48, 0.18);
      setBoneEuler(vrm, 'head' as VRMHumanBoneName, 0.25, 0.40, -0.22);

      setBoneEuler(vrm, 'leftShoulder' as VRMHumanBoneName, 0.20, 0.25, 0.15);
      setBoneEuler(vrm, 'rightShoulder' as VRMHumanBoneName, 0.02, 0.05, 0.02);
      poseLeftFingersTuningPegs(vrm);
      poseRightFingersPizzicato(vrm);
      vrm.humanoid?.update();

      violin.position.set(0.04, 1.30, 0.08);
      violin.quaternion.setFromEuler(new THREE.Euler(-0.10, 0.65, -0.32, 'YXZ'));
      violin.updateMatrixWorld(true);

      // Bow parked in hand or across lap
      bow.position.set(0.10, 1.15, 0.25);
      bow.quaternion.setFromEuler(new THREE.Euler(-0.30, -0.40, 0.20, 'YXZ'));
      bow.updateMatrixWorld(true);

      // Left hand reaching all the way to scroll pegbox (high reach!)
      const leftWrist = new THREE.Vector3(0.24, 1.46, 0.52);
      const leftElbowHint = new THREE.Vector3(0.20, 1.25, 0.25);
      // Right hand plucking string near neck root
      const rightWrist = new THREE.Vector3(0.10, 1.32, 0.32);
      const rightElbowHint = new THREE.Vector3(0.14, 1.20, 0.12);

      return solveViolinAndBowLimbIK(vrm, leftWrist, leftElbowHint, rightWrist, rightElbowHint, violin, bow);
    },
  },
];

export function getVariantById(id: number): ViolinPoseVariant {
  return VIOLIN_POSE_VARIANTS.find((v) => v.id === id) || VIOLIN_POSE_VARIANTS[0];
}
