import { VRMPoseManager } from './VRMPoseManager';
import { VRMHumanBoneName } from '@pixiv/three-vrm';

export interface AnatomicalViolinistPoseParams {
  torsoTwist: number;
  torsoSideLean: number;
  torsoForwardLean: number;
  headTurn: number;
  headTilt: number;
  headNod: number;
  leftShoulderRaise: number;
  leftShoulderForward: number;
  leftArmRaise: number;
  leftArmForward: number;
  leftArmTwist: number;
  leftElbowFlex: number;
  leftForearmTwist: number;
  leftWristTurn: number;
  leftWristBend: number;
  leftWristSideTilt: number;
  leftFingerCurl: number;
  leftThumbOpposition: number;
  rightShoulderRaise: number;
  rightShoulderForward: number;
  rightArmRaise: number;
  rightArmForward: number;
  rightArmTwist: number;
  rightElbowFlex: number;
  rightForearmTwist: number;
  rightWristTurn: number;
  rightWristBend: number;
  rightWristSideTilt: number;
  rightFingerCurl: number;
  rightThumbOpposition: number;
}

/**
 * Single Scripted Human Violinist Body Pose Definition
 * Expressed purely in conceptual anatomical degrees via the calibrated anatomical coordinate system.
 * NO instruments, NO bows, NO IK, NO raw Euler magic numbers.
 */
export const VIOLINIST_BASE_POSE: AnatomicalViolinistPoseParams = {
  // 1. Torso & Spine: Subtle spinal twist opening slightly for bow arm and natural balanced posture
  torsoTwist: -4,        // -4°: subtle rightward chest rotation
  torsoSideLean: -2,     // -2°: slight leftward lateral stance
  torsoForwardLean: 2,   // +2°: natural upright spinal extension

  // 2. Head & Neck: Turned and tilted toward the character's left collarbone shelf
  headTurn: 18,          // +18°: turned toward left side
  headTilt: 10,          // +10°: tilted toward left collarbone
  headNod: 6,            // +6°: modest downward look/nod

  // 3. Left Shoulder & Clavicle: Natural clavicle relaxation and collarbone shelf
  leftShoulderRaise: -3,   // -3°: relaxed clavicle depression
  leftShoulderForward: 4,  // +4°: subtle forward protraction

  // 4. Left Arm Chain: Upper arm lowered and forward, elbow flexed at 88° raising forearm upward & inward
  leftArmRaise: -32,     // -32°: lowered away from horizontal T-pose (elbow below shoulder)
  leftArmForward: 32,    // +32°: angled forward in scapular plane
  leftArmTwist: -35,     // -35°: external humerus rotation orienting hinge upwards & inwards
  leftElbowFlex: 88,     // +88°: acute elbow bend raising forearm upward & inward
  leftForearmTwist: 15,  // +15°: supinated forearm for instrument support

  // 5. Left Support Hand & Fingers: Natural open cradle posture with palm facing upward/inward
  leftWristTurn: -95,    // -95°: calibrated supination rotating palm upward & inward toward neck cradle
  leftWristBend: -4,     // -4°: natural straight continuation of forearm with slight anatomical relief
  leftWristSideTilt: 2,  // +2°: neutral anatomical alignment with forearm
  leftFingerCurl: 22,    // +22°: relaxed progressive curve across finger joints
  leftThumbOpposition: 18,// +18°: open thumb cradle ready for future instrument support

  // 6. Right Shoulder & Clavicle: Relaxed depression for bowing
  rightShoulderRaise: -5,  // -5°: natural relaxed shoulder depression
  rightShoulderForward: 3, // +3°: subtle forward protraction

  // 7. Right Arm Chain: Relaxed bowing posture with 62° elbow bend, forearm pronated in bowing plane
  rightArmRaise: -36,    // -36°: dropped away from horizontal T-pose, elbow clearly visible and separated
  rightArmForward: 28,   // +28°: angled forward in bowing plane
  rightArmTwist: 15,     // +15°: internal arm rotation into bowing plane
  rightElbowFlex: 62,    // +62°: natural bowing arm bend
  rightForearmTwist: 65, // +65°: relaxed pronated forearm for violin bow grip

  // 8. Right Grip Hand & Fingers: Natural relaxed bow grip preparation shape
  rightWristTurn: 75,    // +75°: pronated wrist orienting palm downward toward bow
  rightWristBend: 8,     // +8°: gentle relaxed wrist arch for bow hold
  rightWristSideTilt: 0, // 0°: neutral anatomical alignment with forearm
  rightFingerCurl: 38,   // +38°: relaxed progressive curve around future cylindrical grip
  rightThumbOpposition: 32,// +32°: opposes fingers in natural bow grip
};

/**
 * Canonical Right Bow Grip Reference Configuration
 * Stable baseline right-hand grip configuration relative to RightBowGripFrame.
 */
export const CANONICAL_RIGHT_BOW_GRIP = {
  rightForearmTwist: 65,
  rightWristTurn: 75,
  rightWristBend: 8,
  rightWristSideTilt: 0,
  rightFingerCurl: 38,
  rightThumbOpposition: 32,
  // Signed Anatomical Hand Frame Reference
  handOrientation: {
    palmSide: 'PALMAR' as const,
    chirality: 'RIGHT' as const,
    isChiralityValid: true,
    maxWristDeflectionDeg: 12.0,
    palmFacingTarget: 'BOW_FROG_INNER' as const,
  },
  fingerFlexionDeg: {
    thumb: { mcp: 14, pip: 18, dip: 14, opposeY: 14, opposeZ: 10, rollX: -6 },
    index: { mcp: 24, pip: 32, dip: 16, splay: -4, roll: -2 },
    middle: { mcp: 34, pip: 42, dip: 22, splay: 0, roll: 0 },
    ring: { mcp: 30, pip: 38, dip: 18, splay: 3, roll: 1 },
    little: { mcp: 20, pip: 26, dip: 12, splay: 6, roll: 2 },
  },
};

/**
 * Performance offsets kept strictly separate from canonical baseline
 */
export const RIGHT_BOW_PERFORMANCE_OFFSETS = {
  frogOffset: { x: 0, y: 0, z: 0 },
  tipOffset: { x: 0, y: 0, z: 0 },
};

/**
 * Applies the scripted anatomical pose deterministically through the VRMPoseManager anatomical API
 */
export function applyAnatomicalViolinistPose(
  manager: VRMPoseManager,
  params: AnatomicalViolinistPoseParams = VIOLINIST_BASE_POSE
) {
  // 1. Reset to clean authored T-pose baseline first (never accumulate)
  manager.resetToTPose();

  // 2. Torso / Spine
  manager.setAnatomicalMotion('spine' as VRMHumanBoneName, 'turn', params.torsoTwist * 0.4);
  manager.setAnatomicalMotion('spine' as VRMHumanBoneName, 'sideLean', params.torsoSideLean * 0.4);
  manager.setAnatomicalMotion('spine' as VRMHumanBoneName, 'forwardLean', params.torsoForwardLean * 0.4);

  manager.setAnatomicalMotion('chest' as VRMHumanBoneName, 'turn', params.torsoTwist * 0.6);
  manager.setAnatomicalMotion('chest' as VRMHumanBoneName, 'sideLean', params.torsoSideLean * 0.6);
  manager.setAnatomicalMotion('chest' as VRMHumanBoneName, 'forwardLean', params.torsoForwardLean * 0.6);

  // 3. Neck & Head
  manager.setAnatomicalMotion('neck' as VRMHumanBoneName, 'turn', params.headTurn * 0.45);
  manager.setAnatomicalMotion('neck' as VRMHumanBoneName, 'tilt', params.headTilt * 0.45);
  manager.setAnatomicalMotion('neck' as VRMHumanBoneName, 'nod', params.headNod * 0.45);

  manager.setAnatomicalMotion('head' as VRMHumanBoneName, 'turn', params.headTurn * 0.55);
  manager.setAnatomicalMotion('head' as VRMHumanBoneName, 'tilt', params.headTilt * 0.55);
  manager.setAnatomicalMotion('head' as VRMHumanBoneName, 'nod', params.headNod * 0.55);

  // 4. Shoulders (Clavicular / Scapular girdle)
  manager.setAnatomicalMotion('leftShoulder' as VRMHumanBoneName, 'raise', params.leftShoulderRaise);
  manager.setAnatomicalMotion('leftShoulder' as VRMHumanBoneName, 'forward', params.leftShoulderForward);

  manager.setAnatomicalMotion('rightShoulder' as VRMHumanBoneName, 'raise', params.rightShoulderRaise);
  manager.setAnatomicalMotion('rightShoulder' as VRMHumanBoneName, 'forward', params.rightShoulderForward);

  // 5. Left Arm Chain (Shoulder -> Upper Arm -> Elbow -> Forearm)
  manager.setAnatomicalMotion('leftUpperArm' as VRMHumanBoneName, 'raise', params.leftArmRaise);
  manager.setAnatomicalMotion('leftUpperArm' as VRMHumanBoneName, 'forward', params.leftArmForward);
  manager.setAnatomicalMotion('leftUpperArm' as VRMHumanBoneName, 'twist', params.leftArmTwist);

  manager.setAnatomicalMotion('leftLowerArm' as VRMHumanBoneName, 'flexion', params.leftElbowFlex);
  manager.setAnatomicalMotion('leftLowerArm' as VRMHumanBoneName, 'twist', params.leftForearmTwist);

  // 6. Left Support Hand & Fingers
  manager.setAnatomicalMotion('leftHand' as VRMHumanBoneName, 'turn', params.leftWristTurn);
  manager.setAnatomicalMotion('leftHand' as VRMHumanBoneName, 'bend', params.leftWristBend);
  manager.setAnatomicalMotion('leftHand' as VRMHumanBoneName, 'sideTilt', params.leftWristSideTilt);
  manager.setAnatomicalMotion('leftHand' as VRMHumanBoneName, 'fingerCurl', params.leftFingerCurl);
  manager.setAnatomicalMotion('leftHand' as VRMHumanBoneName, 'thumbOpposition', params.leftThumbOpposition);

  // 7. Right Arm Chain (Shoulder -> Upper Arm -> Elbow -> Forearm)
  manager.setAnatomicalMotion('rightUpperArm' as VRMHumanBoneName, 'raise', params.rightArmRaise);
  manager.setAnatomicalMotion('rightUpperArm' as VRMHumanBoneName, 'forward', params.rightArmForward);
  manager.setAnatomicalMotion('rightUpperArm' as VRMHumanBoneName, 'twist', params.rightArmTwist);

  manager.setAnatomicalMotion('rightLowerArm' as VRMHumanBoneName, 'flexion', params.rightElbowFlex);
  manager.setAnatomicalMotion('rightLowerArm' as VRMHumanBoneName, 'twist', params.rightForearmTwist);

  // 8. Right Grip Hand & Fingers
  manager.setAnatomicalMotion('rightHand' as VRMHumanBoneName, 'turn', params.rightWristTurn);
  manager.setAnatomicalMotion('rightHand' as VRMHumanBoneName, 'bend', params.rightWristBend);
  manager.setAnatomicalMotion('rightHand' as VRMHumanBoneName, 'sideTilt', params.rightWristSideTilt);
  manager.setAnatomicalMotion('rightHand' as VRMHumanBoneName, 'fingerCurl', params.rightFingerCurl);
  manager.setAnatomicalMotion('rightHand' as VRMHumanBoneName, 'thumbOpposition', params.rightThumbOpposition);
}
