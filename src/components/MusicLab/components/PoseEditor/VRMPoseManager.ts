import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { EDITABLE_BONES, SavedPose, JointMarkerInfo, BoneTransformSnapshot } from './poseEditorTypes';
import { AnatomicalViolinistPoseParams, VIOLINIST_BASE_POSE, applyAnatomicalViolinistPose } from './anatomicalPosePreset';
import { extractAnatomicalLandmarks, solveInstrumentFitting } from '../InstrumentProps/ViolinCalibration';

export interface RestHandAnatomy {
  restWristPos: THREE.Vector3;
  restKnucklesCenter: THREE.Vector3;
  vRestHandLong: THREE.Vector3;
  vRestRadial: THREE.Vector3;
  vRestPalmar: THREE.Vector3;
  vRestDorsal: THREE.Vector3;
  qRestHandWorld: THREE.Quaternion;
  fingerJointHinges: Map<VRMHumanBoneName, {
    vBoneRestWorld: THREE.Vector3;
    vHingeRestWorld: THREE.Vector3;
    vHingeRestLocal: THREE.Vector3;
    vSplayRestLocal: THREE.Vector3;
  }>;
  thumbJointHinges: {
    metaOpposeLocal: THREE.Vector3;
    metaFlexLocal: THREE.Vector3;
    proxFlexLocal: THREE.Vector3;
    distFlexLocal: THREE.Vector3;
  };
}

export class VRMPoseManager {
  private vrm: VRM;
  private authoredRestTransforms: Map<VRMHumanBoneName, BoneTransformSnapshot> = new Map();
  private restHandAnatomy: RestHandAnatomy | null = null;
  private savedPoseInMemory: SavedPose | null = null;
  private activePoseName: string = 'Neutral T-Pose';

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.cacheAuthoredRestTransforms();
    this.measureRestHandAnatomy();
  }

  /**
   * Cache authored neutral T-pose transforms for all editable bones
   */
  public cacheAuthoredRestTransforms() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    EDITABLE_BONES.forEach((def) => {
      const node = humanoid.getNormalizedBoneNode(def.name);
      if (node) {
        this.authoredRestTransforms.set(def.name, {
          quaternion: node.quaternion.clone(),
          euler: node.rotation.clone(),
          position: node.position.clone(),
        });
      }
    });
  }

  /**
   * Measures the actual immutable authored rest anatomy and local joint hinge axes of THIS VRM skeleton
   */
  public measureRestHandAnatomy(): RestHandAnatomy | null {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return null;

    // Reset to clean authored T-pose to measure rest anatomy
    this.resetToTPose();

    const getWPos = (name: VRMHumanBoneName): THREE.Vector3 => {
      const node = humanoid.getNormalizedBoneNode(name);
      const pos = new THREE.Vector3();
      if (node) node.getWorldPosition(pos);
      return pos;
    };

    const getWQuat = (name: VRMHumanBoneName): THREE.Quaternion => {
      const node = humanoid.getNormalizedBoneNode(name);
      const q = new THREE.Quaternion();
      if (node) node.getWorldQuaternion(q);
      return q;
    };

    const restWristPos = getWPos('rightHand' as VRMHumanBoneName);
    const rIndexProx = getWPos('rightIndexProximal' as VRMHumanBoneName);
    const rIndexInter = getWPos('rightIndexIntermediate' as VRMHumanBoneName);
    const rIndexDist = getWPos('rightIndexDistal' as VRMHumanBoneName);

    const rMiddleProx = getWPos('rightMiddleProximal' as VRMHumanBoneName);
    const rMiddleInter = getWPos('rightMiddleIntermediate' as VRMHumanBoneName);
    const rMiddleDist = getWPos('rightMiddleDistal' as VRMHumanBoneName);

    const rRingProx = getWPos('rightRingProximal' as VRMHumanBoneName);
    const rRingInter = getWPos('rightRingIntermediate' as VRMHumanBoneName);
    const rRingDist = getWPos('rightRingDistal' as VRMHumanBoneName);

    const rLittleProx = getWPos('rightLittleProximal' as VRMHumanBoneName);
    const rLittleInter = getWPos('rightLittleIntermediate' as VRMHumanBoneName);
    const rLittleDist = getWPos('rightLittleDistal' as VRMHumanBoneName);

    const rThumbMeta = getWPos('rightThumbMetacarpal' as VRMHumanBoneName);
    const rThumbProx = getWPos('rightThumbProximal' as VRMHumanBoneName);
    const rThumbDist = getWPos('rightThumbDistal' as VRMHumanBoneName);

    const restKnucklesCenter = new THREE.Vector3()
      .add(rIndexProx)
      .add(rMiddleProx)
      .add(rRingProx)
      .add(rLittleProx)
      .multiplyScalar(0.25);

    const vRestHandLong = new THREE.Vector3().subVectors(restKnucklesCenter, restWristPos).normalize();
    const vRestRadial = new THREE.Vector3().subVectors(rIndexProx, rLittleProx).normalize();

    // Palmar normal for anatomical right hand: cross(radial, longitudinal) points into palm
    let vRestPalmar = new THREE.Vector3().crossVectors(vRestRadial, vRestHandLong).normalize();
    let vRestDorsal = vRestPalmar.clone().negate();

    // Verify sign with thumb: thumb sits in palmar-radial space
    const vThumbFromWrist = new THREE.Vector3().subVectors(rThumbDist, restWristPos);
    if (vThumbFromWrist.dot(vRestPalmar) < -0.01) {
      vRestPalmar.negate();
      vRestDorsal.negate();
    }

    const qRestHandWorld = getWQuat('rightHand' as VRMHumanBoneName);

    // Compute joint flexion hinges for all 4 fingers
    const fingerJointHinges = new Map<VRMHumanBoneName, {
      vBoneRestWorld: THREE.Vector3;
      vHingeRestWorld: THREE.Vector3;
      vHingeRestLocal: THREE.Vector3;
      vSplayRestLocal: THREE.Vector3;
    }>();

    const measureFingerJoint = (boneName: VRMHumanBoneName, childPos: THREE.Vector3) => {
      const pos = getWPos(boneName);
      const qWorld = getWQuat(boneName);
      const vBoneRestWorld = new THREE.Vector3().subVectors(childPos, pos).normalize();
      
      // Hinge axis: rotation around this axis rotates vBoneRestWorld toward vRestPalmar
      const vHingeRestWorld = new THREE.Vector3().crossVectors(vBoneRestWorld, vRestPalmar).normalize();
      const vHingeRestLocal = vHingeRestWorld.clone().applyQuaternion(qWorld.clone().invert()).normalize();
      
      // Splay axis: rotation around dorsal normal
      const vSplayRestWorld = vRestDorsal.clone();
      const vSplayRestLocal = vSplayRestWorld.clone().applyQuaternion(qWorld.clone().invert()).normalize();

      fingerJointHinges.set(boneName, {
        vBoneRestWorld,
        vHingeRestWorld,
        vHingeRestLocal,
        vSplayRestLocal,
      });
    };

    measureFingerJoint('rightIndexProximal' as VRMHumanBoneName, rIndexInter);
    measureFingerJoint('rightIndexIntermediate' as VRMHumanBoneName, rIndexDist);
    measureFingerJoint('rightIndexDistal' as VRMHumanBoneName, rIndexDist.clone().addScaledVector(vRestHandLong, 0.02));

    measureFingerJoint('rightMiddleProximal' as VRMHumanBoneName, rMiddleInter);
    measureFingerJoint('rightMiddleIntermediate' as VRMHumanBoneName, rMiddleDist);
    measureFingerJoint('rightMiddleDistal' as VRMHumanBoneName, rMiddleDist.clone().addScaledVector(vRestHandLong, 0.02));

    measureFingerJoint('rightRingProximal' as VRMHumanBoneName, rRingInter);
    measureFingerJoint('rightRingIntermediate' as VRMHumanBoneName, rRingDist);
    measureFingerJoint('rightRingDistal' as VRMHumanBoneName, rRingDist.clone().addScaledVector(vRestHandLong, 0.02));

    measureFingerJoint('rightLittleProximal' as VRMHumanBoneName, rLittleInter);
    measureFingerJoint('rightLittleIntermediate' as VRMHumanBoneName, rLittleDist);
    measureFingerJoint('rightLittleDistal' as VRMHumanBoneName, rLittleDist.clone().addScaledVector(vRestHandLong, 0.02));

    // Thumb opposition and flexion hinges
    const qThumbMetaWorld = getWQuat('rightThumbMetacarpal' as VRMHumanBoneName);
    const qThumbProxWorld = getWQuat('rightThumbProximal' as VRMHumanBoneName);
    const qThumbDistWorld = getWQuat('rightThumbDistal' as VRMHumanBoneName);

    const vThumbBoneWorld = new THREE.Vector3().subVectors(rThumbProx, rThumbMeta).normalize();
    const vThumbOpposeWorld = vRestHandLong.clone().negate(); // inward opposition axis
    const vThumbFlexWorld = new THREE.Vector3().crossVectors(vThumbBoneWorld, vRestRadial).normalize();

    const metaOpposeLocal = vThumbOpposeWorld.clone().applyQuaternion(qThumbMetaWorld.clone().invert()).normalize();
    const metaFlexLocal = vThumbFlexWorld.clone().applyQuaternion(qThumbMetaWorld.clone().invert()).normalize();
    const proxFlexLocal = vThumbFlexWorld.clone().applyQuaternion(qThumbProxWorld.clone().invert()).normalize();
    const distFlexLocal = vThumbFlexWorld.clone().applyQuaternion(qThumbDistWorld.clone().invert()).normalize();

    this.restHandAnatomy = {
      restWristPos,
      restKnucklesCenter,
      vRestHandLong,
      vRestRadial,
      vRestPalmar,
      vRestDorsal,
      qRestHandWorld,
      fingerJointHinges,
      thumbJointHinges: {
        metaOpposeLocal,
        metaFlexLocal,
        proxFlexLocal,
        distFlexLocal,
      },
    };

    return this.restHandAnatomy;
  }

  /**
   * Reset all editable bones to original authored T-pose
   */
  public resetToTPose() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    this.authoredRestTransforms.forEach((snapshot, boneName) => {
      const node = humanoid.getNormalizedBoneNode(boneName);
      if (node) {
        node.quaternion.copy(snapshot.quaternion);
        node.position.copy(snapshot.position);
      }
    });

    humanoid.update();
    this.vrm.scene.updateMatrixWorld(true);
    this.activePoseName = 'Neutral T-Pose';
  }

  private currentParams: AnatomicalViolinistPoseParams = { ...VIOLINIST_BASE_POSE };

  /**
   * Applies the scripted human violinist base pose through the calibrated anatomical system
   */
  public applyViolinistBasePose(params: AnatomicalViolinistPoseParams = VIOLINIST_BASE_POSE) {
    this.currentParams = { ...params };
    applyAnatomicalViolinistPose(this, params);
    this.activePoseName = 'Violinist Base Pose';
  }

  public getActivePoseName(): string {
    return this.activePoseName;
  }

  /**
   * Apply axis test rotation starting from clean T-pose
   */
  public testAxisRotation(boneName: VRMHumanBoneName, axis: 'x' | 'y' | 'z', degrees: number) {
    this.resetToTPose();
    const node = this.getBoneNode(boneName);
    if (!node) return;

    const rad = degrees * (Math.PI / 180);
    const deltaEuler = new THREE.Euler(
      axis === 'x' ? rad : 0,
      axis === 'y' ? rad : 0,
      axis === 'z' ? rad : 0,
      'XYZ'
    );
    node.quaternion.setFromEuler(deltaEuler);

    this.vrm.humanoid?.update();
    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * High-Level Anatomical Motion Setter (Converting Human Intent to Exact Calibrated Rest Quaternions)
   * Decouples axes cleanly using quaternion composition relative to authored rest frames.
   */
  public setAnatomicalMotion(
    boneName: VRMHumanBoneName,
    motionType: 'raise' | 'forward' | 'twist' | 'flexion' | 'turn' | 'tilt' | 'nod' | 'sideLean' | 'forwardLean' | 'deviation' | 'bend' | 'sideTilt' | 'fingerCurl' | 'thumbOpposition',
    degrees: number
  ) {
    // Track active param updates
    if (boneName === 'spine' || boneName === 'chest') {
      if (motionType === 'turn') this.currentParams.torsoTwist = degrees;
      if (motionType === 'sideLean') this.currentParams.torsoSideLean = degrees;
      if (motionType === 'forwardLean') this.currentParams.torsoForwardLean = degrees;
    } else if (boneName === 'head' || boneName === 'neck') {
      if (motionType === 'turn') this.currentParams.headTurn = degrees;
      if (motionType === 'tilt') this.currentParams.headTilt = degrees;
      if (motionType === 'nod') this.currentParams.headNod = degrees;
    } else if (boneName === 'leftShoulder') {
      if (motionType === 'raise') this.currentParams.leftShoulderRaise = degrees;
      if (motionType === 'forward') this.currentParams.leftShoulderForward = degrees;
    } else if (boneName === 'rightShoulder') {
      if (motionType === 'raise') this.currentParams.rightShoulderRaise = degrees;
      if (motionType === 'forward') this.currentParams.rightShoulderForward = degrees;
    } else if (boneName === 'leftUpperArm') {
      if (motionType === 'raise') this.currentParams.leftArmRaise = degrees;
      if (motionType === 'forward') this.currentParams.leftArmForward = degrees;
      if (motionType === 'twist') this.currentParams.leftArmTwist = degrees;
    } else if (boneName === 'rightUpperArm') {
      if (motionType === 'raise') this.currentParams.rightArmRaise = degrees;
      if (motionType === 'forward') this.currentParams.rightArmForward = degrees;
      if (motionType === 'twist') this.currentParams.rightArmTwist = degrees;
    } else if (boneName === 'leftLowerArm') {
      if (motionType === 'flexion') this.currentParams.leftElbowFlex = degrees;
      if (motionType === 'twist') this.currentParams.leftForearmTwist = degrees;
    } else if (boneName === 'rightLowerArm') {
      if (motionType === 'flexion') this.currentParams.rightElbowFlex = degrees;
      if (motionType === 'twist') this.currentParams.rightForearmTwist = degrees;
    } else if (boneName === 'leftHand') {
      if (motionType === 'turn') this.currentParams.leftWristTurn = degrees;
      if (motionType === 'bend') this.currentParams.leftWristBend = degrees;
      if (motionType === 'sideTilt') this.currentParams.leftWristSideTilt = degrees;
      if (motionType === 'fingerCurl') {
        this.currentParams.leftFingerCurl = degrees;
        this.applyFingers('left', degrees);
      }
      if (motionType === 'thumbOpposition') {
        this.currentParams.leftThumbOpposition = degrees;
        this.applyThumb('left', degrees);
      }
    } else if (boneName === 'rightHand') {
      if (motionType === 'turn') this.currentParams.rightWristTurn = degrees;
      if (motionType === 'bend') this.currentParams.rightWristBend = degrees;
      if (motionType === 'sideTilt') this.currentParams.rightWristSideTilt = degrees;
      if (motionType === 'fingerCurl') {
        this.currentParams.rightFingerCurl = degrees;
        this.applyFingers('right', degrees);
      }
      if (motionType === 'thumbOpposition') {
        this.currentParams.rightThumbOpposition = degrees;
        this.applyThumb('right', degrees);
      }
    }

    const node = this.getBoneNode(boneName);
    const snapshot = this.authoredRestTransforms.get(boneName);
    if (!node || !snapshot) return;

    const vX = new THREE.Vector3(1, 0, 0);
    const vY = new THREE.Vector3(0, 1, 0);
    const vZ = new THREE.Vector3(0, 0, 1);
    const toRad = Math.PI / 180;

    const qTarget = new THREE.Quaternion();

    if (boneName === 'spine') {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.torsoTwist * 0.4 * toRad);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.torsoForwardLean * 0.4 * toRad);
      const qRoll = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.torsoSideLean * 0.4 * toRad);
      qTarget.multiplyQuaternions(qYaw, qPitch).multiply(qRoll);
    } else if (boneName === 'chest' || boneName === 'upperChest') {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.torsoTwist * 0.6 * toRad);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.torsoForwardLean * 0.6 * toRad);
      const qRoll = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.torsoSideLean * 0.6 * toRad);
      qTarget.multiplyQuaternions(qYaw, qPitch).multiply(qRoll);
    } else if (boneName === 'neck') {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.headTurn * 0.45 * toRad);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.headNod * 0.45 * toRad);
      const qRoll = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.headTilt * 0.45 * toRad);
      qTarget.multiplyQuaternions(qYaw, qPitch).multiply(qRoll);
    } else if (boneName === 'head') {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.headTurn * 0.55 * toRad);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.headNod * 0.55 * toRad);
      const qRoll = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.headTilt * 0.55 * toRad);
      qTarget.multiplyQuaternions(qYaw, qPitch).multiply(qRoll);
    } else if (boneName === 'leftShoulder') {
      const qRaise = new THREE.Quaternion().setFromAxisAngle(vZ, this.currentParams.leftShoulderRaise * toRad);
      const qFwd = new THREE.Quaternion().setFromAxisAngle(vY, -this.currentParams.leftShoulderForward * toRad);
      qTarget.multiplyQuaternions(qFwd, qRaise);
    } else if (boneName === 'rightShoulder') {
      const qRaise = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.rightShoulderRaise * toRad);
      const qFwd = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.rightShoulderForward * toRad);
      qTarget.multiplyQuaternions(qFwd, qRaise);
    } else if (boneName === 'leftUpperArm') {
      // Stable composition: (Forward * Raise) * Twist along bone axis
      const qRaise = new THREE.Quaternion().setFromAxisAngle(vZ, this.currentParams.leftArmRaise * toRad);
      const qFwd = new THREE.Quaternion().setFromAxisAngle(vY, -this.currentParams.leftArmForward * toRad);
      const qTwist = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.leftArmTwist * toRad);
      qTarget.multiplyQuaternions(qFwd, qRaise).multiply(qTwist);
    } else if (boneName === 'rightUpperArm') {
      // Stable mirrored composition: (Forward * Raise) * Twist along bone axis
      const qRaise = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.rightArmRaise * toRad);
      const qFwd = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.rightArmForward * toRad);
      const qRTwist = new THREE.Quaternion().setFromAxisAngle(vX, -this.currentParams.rightArmTwist * toRad);
      qTarget.multiplyQuaternions(qFwd, qRaise).multiply(qRTwist);
    } else if (boneName === 'leftLowerArm') {
      // Forearm: Elbow Hinge Flexion * Forearm Twist
      const qFlex = new THREE.Quaternion().setFromAxisAngle(vY, -this.currentParams.leftElbowFlex * toRad);
      const qTwist = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.leftForearmTwist * toRad);
      qTarget.multiplyQuaternions(qFlex, qTwist);
    } else if (boneName === 'rightLowerArm') {
      // Forearm (mirrored): Elbow Hinge Flexion * Forearm Twist
      const qFlex = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.rightElbowFlex * toRad);
      const qTwist = new THREE.Quaternion().setFromAxisAngle(vX, -this.currentParams.rightForearmTwist * toRad);
      qTarget.multiplyQuaternions(qFlex, qTwist);
    } else if (boneName === 'leftHand') {
      // Left Wrist: (Bend * SideTilt) * Turn
      const qTurn = new THREE.Quaternion().setFromAxisAngle(vX, this.currentParams.leftWristTurn * toRad);
      const qBend = new THREE.Quaternion().setFromAxisAngle(vY, -this.currentParams.leftWristBend * toRad);
      const qTilt = new THREE.Quaternion().setFromAxisAngle(vZ, this.currentParams.leftWristSideTilt * toRad);
      qTarget.multiplyQuaternions(qBend, qTilt).multiply(qTurn);
    } else if (boneName === 'rightHand') {
      // Right Wrist (mirrored): (Bend * SideTilt) * Turn
      const qTurn = new THREE.Quaternion().setFromAxisAngle(vX, -this.currentParams.rightWristTurn * toRad);
      const qBend = new THREE.Quaternion().setFromAxisAngle(vY, this.currentParams.rightWristBend * toRad);
      const qTilt = new THREE.Quaternion().setFromAxisAngle(vZ, -this.currentParams.rightWristSideTilt * toRad);
      qTarget.multiplyQuaternions(qBend, qTilt).multiply(qTurn);
    }

    node.quaternion.copy(snapshot.quaternion).multiply(qTarget);
    this.vrm.humanoid?.update();
    this.vrm.scene.updateMatrixWorld(true);

    if (boneName === 'rightHand' && motionType !== 'fingerCurl' && motionType !== 'thumbOpposition') {
      this.applyRightBowHandGrip(this.currentParams.rightFingerCurl, this.currentParams.rightThumbOpposition);
    }
  }

  /**
   * Articulates finger joints hierarchically with progressive curl
   */
  public applyFingers(side: 'left' | 'right', curlDeg: number) {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    if (side === 'right') {
      this.applyRightBowHandGrip(curlDeg, this.currentParams.rightThumbOpposition);
      return;
    }

    const vZ = new THREE.Vector3(0, 0, 1);
    const toRad = Math.PI / 180;
    const sign = -1; // Left hand

    const fingerNames = ['Index', 'Middle', 'Ring', 'Little'];
    const multipliers = {
      Index: 1.0,
      Middle: 1.05,
      Ring: 1.0,
      Little: 0.95,
    };

    fingerNames.forEach((fName) => {
      const mult = multipliers[fName as keyof typeof multipliers] || 1.0;
      const baseCurl = curlDeg * mult;

      const qProx = new THREE.Quaternion().setFromAxisAngle(vZ, sign * baseCurl * 1.0 * toRad);
      const qInter = new THREE.Quaternion().setFromAxisAngle(vZ, sign * baseCurl * 0.85 * toRad);
      const qDist = new THREE.Quaternion().setFromAxisAngle(vZ, sign * baseCurl * 0.55 * toRad);

      const proxBone = `left${fName}Proximal` as VRMHumanBoneName;
      const interBone = `left${fName}Intermediate` as VRMHumanBoneName;
      const distBone = `left${fName}Distal` as VRMHumanBoneName;

      const pNode = humanoid.getNormalizedBoneNode(proxBone);
      const pSnap = this.authoredRestTransforms.get(proxBone);
      if (pNode && pSnap) pNode.quaternion.copy(pSnap.quaternion).multiply(qProx);

      const iNode = humanoid.getNormalizedBoneNode(interBone);
      const iSnap = this.authoredRestTransforms.get(interBone);
      if (iNode && iSnap) iNode.quaternion.copy(iSnap.quaternion).multiply(qInter);

      const dNode = humanoid.getNormalizedBoneNode(distBone);
      const dSnap = this.authoredRestTransforms.get(distBone);
      if (dNode && dSnap) dNode.quaternion.copy(dSnap.quaternion).multiply(qDist);
    });

    humanoid.update();
    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * Articulates thumb joints for anatomical opposition
   */
  public applyThumb(side: 'left' | 'right', opposeDeg: number) {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    if (side === 'right') {
      this.applyRightBowHandGrip(this.currentParams.rightFingerCurl, opposeDeg);
      return;
    }

    const vX = new THREE.Vector3(1, 0, 0);
    const vY = new THREE.Vector3(0, 1, 0);
    const vZ = new THREE.Vector3(0, 0, 1);
    const toRad = Math.PI / 180;
    const sign = 1; // Left hand

    // Metacarpal: Inward rotation and opposition pitch
    const qMetaY = new THREE.Quaternion().setFromAxisAngle(vY, -sign * opposeDeg * 0.45 * toRad);
    const qMetaZ = new THREE.Quaternion().setFromAxisAngle(vZ, -sign * opposeDeg * 0.35 * toRad);
    const qMetaX = new THREE.Quaternion().setFromAxisAngle(vX, sign * opposeDeg * 0.25 * toRad);
    const qMeta = new THREE.Quaternion().multiplyQuaternions(qMetaY, qMetaZ).multiply(qMetaX);

    // Proximal and Distal: Progressive flexion toward opposing fingers
    const qProx = new THREE.Quaternion().setFromAxisAngle(vZ, -sign * opposeDeg * 0.55 * toRad);
    const qDist = new THREE.Quaternion().setFromAxisAngle(vZ, -sign * opposeDeg * 0.45 * toRad);

    const metaBone = 'leftThumbMetacarpal' as VRMHumanBoneName;
    const proxBone = 'leftThumbProximal' as VRMHumanBoneName;
    const distBone = 'leftThumbDistal' as VRMHumanBoneName;

    const mNode = humanoid.getNormalizedBoneNode(metaBone);
    const mSnap = this.authoredRestTransforms.get(metaBone);
    if (mNode && mSnap) mNode.quaternion.copy(mSnap.quaternion).multiply(qMeta);

    const pNode = humanoid.getNormalizedBoneNode(proxBone);
    const pSnap = this.authoredRestTransforms.get(proxBone);
    if (pNode && pSnap) pNode.quaternion.copy(pSnap.quaternion).multiply(qProx);

    const dNode = humanoid.getNormalizedBoneNode(distBone);
    const dSnap = this.authoredRestTransforms.get(distBone);
    if (dNode && dSnap) dNode.quaternion.copy(dSnap.quaternion).multiply(qDist);

    humanoid.update();
    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * CANONICAL MEASURED RIGHT BOW GRIP SOLVER:
   * 1. Uses immutable measured RestHandAnatomy from THIS VRM (wrist, knuckles, signed palmar normal).
   * 2. Derives world orientation delta relative to measured rest hand frame and applies to hand bone.
   * 3. Articulates each finger joint around its own measured rest local hinge axis (MCP -> PIP -> DIP)
   *    ensuring fingers curl directly INWARD toward the bow and stick without splay or clawing.
   */
  public applyRightBowHandGrip(curlDeg = 38, opposeDeg = 32) {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    if (!this.restHandAnatomy) {
      this.measureRestHandAnatomy();
    }
    const rest = this.restHandAnatomy;
    if (!rest) return;

    humanoid.update();
    this.vrm.scene.updateMatrixWorld(true);

    // 1. Obtain authoritative RightBowGripFrame from posed skeleton & instrument fitting
    const landmarks = extractAnatomicalLandmarks(this.vrm);
    const solution = landmarks ? solveInstrumentFitting(landmarks) : null;

    let Ux: THREE.Vector3;
    let Uy: THREE.Vector3;
    let Uz: THREE.Vector3;

    if (solution) {
      const gripQuat = solution.rightBowGripWorldQuat.clone();
      Ux = new THREE.Vector3(1, 0, 0).applyQuaternion(gripQuat).normalize();
      Uy = new THREE.Vector3(0, 1, 0).applyQuaternion(gripQuat).normalize();
      Uz = new THREE.Vector3(0, 0, 1).applyQuaternion(gripQuat).normalize();
    } else {
      const rHandNode = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);
      const gripQuat = new THREE.Quaternion();
      if (rHandNode) {
        rHandNode.getWorldQuaternion(gripQuat);
      }
      Ux = new THREE.Vector3(1, 0, 0).applyQuaternion(gripQuat).normalize();
      Uy = new THREE.Vector3(0, 1, 0).applyQuaternion(gripQuat).normalize();
      Uz = new THREE.Vector3(0, 0, 1).applyQuaternion(gripQuat).normalize();
    }

    // 2. STEP 1: Derive Smooth Forearm-to-Wrist Hand Orientation Delta
    const rHandNode = humanoid.getNormalizedBoneNode('rightHand' as VRMHumanBoneName);
    const rLowerArmNode = humanoid.getNormalizedBoneNode('rightLowerArm' as VRMHumanBoneName);

    if (rHandNode && rLowerArmNode) {
      const wristPos = new THREE.Vector3();
      const elbowPos = new THREE.Vector3();
      rHandNode.getWorldPosition(wristPos);
      rLowerArmNode.getWorldPosition(elbowPos);

      const vForearm = new THREE.Vector3().subVectors(wristPos, elbowPos).normalize();

      // Hand longitudinal axis smoothly extends forearm with natural bowing tilt:
      let vDesiredHandLong = vForearm.clone()
        .addScaledVector(Uy, 0.16)
        .addScaledVector(Uz, -0.14)
        .normalize();

      // Limit wrist deflection to max 12 degrees relative to forearm (guaranteeing zero sharp wrist kink)
      const angleFromForearm = vForearm.angleTo(vDesiredHandLong);
      const maxWristDeflection = (12 * Math.PI) / 180;
      if (angleFromForearm > maxWristDeflection && angleFromForearm > 1e-4) {
        const blend = maxWristDeflection / angleFromForearm;
        vDesiredHandLong = new THREE.Vector3().copy(vForearm).lerp(vDesiredHandLong, blend).normalize();
      }

      // Desired Palmar Normal: explicitly faces downward toward strings and stick (-Uz) with pronated inward cant
      const vDesiredPalmar = new THREE.Vector3()
        .addScaledVector(Uz, -0.90)
        .addScaledVector(Ux, -0.35)
        .addScaledVector(Uy, 0.25)
        .normalize();

      const vDesiredDorsal = vDesiredPalmar.clone().negate();

      // Orthonormalize dorsal normal perpendicular to vDesiredHandLong
      let vDorsalCandidate = vDesiredDorsal.clone()
        .addScaledVector(vDesiredHandLong, -vDesiredDorsal.dot(vDesiredHandLong))
        .normalize();

      let vRadialCandidate = new THREE.Vector3().crossVectors(vDorsalCandidate, vDesiredHandLong).normalize();
      vDorsalCandidate.crossVectors(vDesiredHandLong, vRadialCandidate).normalize();
      let vPalmarActual = vDorsalCandidate.clone().negate();

      // PALM-SIDE AMBIGUITY REJECTION:
      if (vPalmarActual.dot(vDesiredPalmar) <= 0) {
        vDorsalCandidate.negate();
        vRadialCandidate.negate();
        vPalmarActual.negate();
      }

      // CHIRALITY VALIDATION:
      const chiralityDet = vDesiredHandLong.dot(new THREE.Vector3().crossVectors(vRadialCandidate, vDorsalCandidate));
      if (chiralityDet <= 0.5) {
        vRadialCandidate.crossVectors(vDorsalCandidate, vDesiredHandLong).normalize();
      }

      // Construct Target World Rotation relative to Measured Rest Hand Frame:
      // Rest frame: rest.vRestHandLong, rest.vRestRadial, rest.vRestDorsal
      // Target frame: vDesiredHandLong, vRadialCandidate, vDorsalCandidate
      const mRest = new THREE.Matrix4().makeBasis(rest.vRestHandLong, rest.vRestRadial, rest.vRestDorsal);
      const mTarget = new THREE.Matrix4().makeBasis(vDesiredHandLong, vRadialCandidate, vDorsalCandidate);
      
      const mWorldDelta = new THREE.Matrix4().multiplyMatrices(mTarget, mRest.clone().invert());
      const qWorldDelta = new THREE.Quaternion().setFromRotationMatrix(mWorldDelta);
      const qDesiredHandWorld = qWorldDelta.clone().multiply(rest.qRestHandWorld);

      // Convert world rotation to lowerArm parent local space:
      const parentWorldQuat = new THREE.Quaternion();
      if (rHandNode.parent) {
        rHandNode.parent.getWorldQuaternion(parentWorldQuat);
      }
      const qHandLocal = qDesiredHandWorld.clone().premultiply(parentWorldQuat.clone().invert());
      rHandNode.quaternion.copy(qHandLocal);
      rHandNode.updateMatrixWorld(true);
    }

    const toRad = Math.PI / 180;
    const sCurl = Math.max(0.2, curlDeg / 38);
    const sOppose = Math.max(0.2, opposeDeg / 32);

    // 3. STEP 2: Natural Biological Progressive Finger Kinematics (MCP -> PIP -> DIP)
    // Rotating around each joint's MEASURED local hinge axis toward the measured palm
    const applyFingerChain = (
      fingerName: 'Index' | 'Middle' | 'Ring' | 'Little',
      mcpDeg: number,
      pipDeg: number,
      dipDeg: number,
      splayDeg: number
    ) => {
      const pBone = `right${fingerName}Proximal` as VRMHumanBoneName;
      const iBone = `right${fingerName}Intermediate` as VRMHumanBoneName;
      const dBone = `right${fingerName}Distal` as VRMHumanBoneName;

      const pNode = humanoid.getNormalizedBoneNode(pBone);
      const iNode = humanoid.getNormalizedBoneNode(iBone);
      const dNode = humanoid.getNormalizedBoneNode(dBone);

      const pSnap = this.authoredRestTransforms.get(pBone);
      const iSnap = this.authoredRestTransforms.get(iBone);
      const dSnap = this.authoredRestTransforms.get(dBone);

      const pHinge = rest.fingerJointHinges.get(pBone);
      const iHinge = rest.fingerJointHinges.get(iBone);
      const dHinge = rest.fingerJointHinges.get(dBone);

      // Proximal (MCP): Flexion along measured hinge + Splay
      if (pNode && pSnap && pHinge) {
        const qFlex = new THREE.Quaternion().setFromAxisAngle(pHinge.vHingeRestLocal, mcpDeg * toRad);
        const qSplay = new THREE.Quaternion().setFromAxisAngle(pHinge.vSplayRestLocal, splayDeg * toRad);
        const qRot = new THREE.Quaternion().multiplyQuaternions(qFlex, qSplay);
        pNode.quaternion.copy(pSnap.quaternion).multiply(qRot);
      }

      // Intermediate (PIP): Flexion along measured hinge
      if (iNode && iSnap && iHinge) {
        const qFlex = new THREE.Quaternion().setFromAxisAngle(iHinge.vHingeRestLocal, pipDeg * toRad);
        iNode.quaternion.copy(iSnap.quaternion).multiply(qFlex);
      }

      // Distal (DIP): Subtle terminal curl along measured hinge
      if (dNode && dSnap && dHinge) {
        const qFlex = new THREE.Quaternion().setFromAxisAngle(dHinge.vHingeRestLocal, dipDeg * toRad);
        dNode.quaternion.copy(dSnap.quaternion).multiply(qFlex);
      }
    };

    // 1. INDEX: Open, extended drape over upper/outer stick
    applyFingerChain('Index', 24 * sCurl, 32 * sCurl, 16 * sCurl, -4 * sCurl);

    // 2. MIDDLE: Primary opposing fulcrum loop
    applyFingerChain('Middle', 34 * sCurl, 42 * sCurl, 22 * sCurl, 0);

    // 3. RING: Relaxed curve following middle along frog
    applyFingerChain('Ring', 30 * sCurl, 38 * sCurl, 18 * sCurl, 3 * sCurl);

    // 4. LITTLE (PINKY): Light arch with tip resting on top of stick as counterweight
    applyFingerChain('Little', 20 * sCurl, 26 * sCurl, 12 * sCurl, 6 * sCurl);

    // 5. THUMB: Rounded "C" support arch underneath frog thumb notch
    const metaBone = 'rightThumbMetacarpal' as VRMHumanBoneName;
    const proxBone = 'rightThumbProximal' as VRMHumanBoneName;
    const distBone = 'rightThumbDistal' as VRMHumanBoneName;

    const mNode = humanoid.getNormalizedBoneNode(metaBone);
    const pNode = humanoid.getNormalizedBoneNode(proxBone);
    const dNode = humanoid.getNormalizedBoneNode(distBone);

    const mSnap = this.authoredRestTransforms.get(metaBone);
    const pSnap = this.authoredRestTransforms.get(proxBone);
    const dSnap = this.authoredRestTransforms.get(distBone);

    const tHinges = rest.thumbJointHinges;

    if (mNode && mSnap) {
      const qOppose = new THREE.Quaternion().setFromAxisAngle(tHinges.metaOpposeLocal, 16 * sOppose * toRad);
      const qFlex = new THREE.Quaternion().setFromAxisAngle(tHinges.metaFlexLocal, 12 * sOppose * toRad);
      const qRot = new THREE.Quaternion().multiplyQuaternions(qOppose, qFlex);
      mNode.quaternion.copy(mSnap.quaternion).multiply(qRot);
    }

    if (pNode && pSnap) {
      const qFlex = new THREE.Quaternion().setFromAxisAngle(tHinges.proxFlexLocal, 18 * sOppose * toRad);
      pNode.quaternion.copy(pSnap.quaternion).multiply(qFlex);
    }

    if (dNode && dSnap) {
      const qFlex = new THREE.Quaternion().setFromAxisAngle(tHinges.distFlexLocal, 14 * sOppose * toRad);
      dNode.quaternion.copy(dSnap.quaternion).multiply(qFlex);
    }

    humanoid.update();
    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * Live Skeleton Diagnostics (Joint positions, forearm directions, elbow-torso clearances, asymmetry)
   */
  public getSkeletonDiagnostics() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return null;

    const getWPos = (name: VRMHumanBoneName): THREE.Vector3 | null => {
      const node = humanoid.getNormalizedBoneNode(name);
      if (!node) return null;
      const pos = new THREE.Vector3();
      node.getWorldPosition(pos);
      return pos;
    };

    const lShoulder = getWPos('leftShoulder' as VRMHumanBoneName);
    const lElbow = getWPos('leftLowerArm' as VRMHumanBoneName);
    const lWrist = getWPos('leftHand' as VRMHumanBoneName);
    const rShoulder = getWPos('rightShoulder' as VRMHumanBoneName);
    const rElbow = getWPos('rightLowerArm' as VRMHumanBoneName);
    const rWrist = getWPos('rightHand' as VRMHumanBoneName);
    const chest = getWPos('chest' as VRMHumanBoneName);
    const head = getWPos('head' as VRMHumanBoneName);

    const lForearmDir = (lWrist && lElbow) ? new THREE.Vector3().subVectors(lWrist, lElbow).normalize() : new THREE.Vector3();
    const rForearmDir = (rWrist && rElbow) ? new THREE.Vector3().subVectors(rWrist, rElbow).normalize() : new THREE.Vector3();

    // Hand orientation & Palm normal
    let lPalmNormal = new THREE.Vector3(0, 1, 0);
    let lHandDir = new THREE.Vector3(1, 0, 0);
    let lThumbDir = new THREE.Vector3(0, 0, 1);
    const lHandNode = humanoid.getNormalizedBoneNode('leftHand' as VRMHumanBoneName);
    if (lHandNode) {
      const q = new THREE.Quaternion();
      lHandNode.getWorldQuaternion(q);
      lHandDir = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const lDorsal = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      lPalmNormal = lDorsal.negate();
      lThumbDir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    }

    const lUpperArmLen = (lShoulder && lElbow) ? lShoulder.distanceTo(lElbow) : 0;
    const lForearmLen = (lElbow && lWrist) ? lElbow.distanceTo(lWrist) : 0;
    const rUpperArmLen = (rShoulder && rElbow) ? rShoulder.distanceTo(rElbow) : 0;
    const rForearmLen = (rElbow && rWrist) ? rElbow.distanceTo(rWrist) : 0;

    const lElbowChestDist = (lElbow && chest) ? lElbow.distanceTo(chest) : 0;
    const rElbowChestDist = (rElbow && chest) ? rElbow.distanceTo(chest) : 0;
    const lWristHeadDist = (lWrist && head) ? lWrist.distanceTo(head) : 0;
    const wristSeparation = (lWrist && rWrist) ? lWrist.distanceTo(rWrist) : 0;
    const elbowSeparation = (lElbow && rElbow) ? lElbow.distanceTo(rElbow) : 0;

    return {
      lShoulder,
      lElbow,
      lWrist,
      rShoulder,
      rElbow,
      rWrist,
      chest,
      head,
      lForearmDir,
      rForearmDir,
      lPalmNormal,
      lHandDir,
      lThumbDir,
      lUpperArmLen,
      lForearmLen,
      rUpperArmLen,
      rForearmLen,
      lElbowChestDist,
      rElbowChestDist,
      lWristHeadDist,
      wristSeparation,
      elbowSeparation,
    };
  }

  /**
   * Save current editable bone transforms to memory
   */
  public saveCurrentPose(name = 'Custom Pose'): SavedPose {
    const humanoid = this.vrm.humanoid;
    const pose: SavedPose = {
      id: `pose-${Date.now()}`,
      name,
      timestamp: Date.now(),
      bones: {},
    };

    if (humanoid) {
      EDITABLE_BONES.forEach((def) => {
        const node = humanoid.getNormalizedBoneNode(def.name);
        if (node) {
          pose.bones[def.name] = {
            quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
            euler: [node.rotation.x, node.rotation.y, node.rotation.z],
          };
        }
      });
    }

    this.savedPoseInMemory = pose;
    return pose;
  }

  /**
   * Load saved pose from memory onto test.vrm
   */
  public loadSavedPose(savedPose?: SavedPose | null): boolean {
    const poseToLoad = savedPose || this.savedPoseInMemory;
    if (!poseToLoad) return false;

    const humanoid = this.vrm.humanoid;
    if (!humanoid) return false;

    // Reset first to ensure clean baseline
    this.resetToTPose();

    Object.entries(poseToLoad.bones).forEach(([boneKey, data]) => {
      if (!data) return;
      const node = humanoid.getNormalizedBoneNode(boneKey as VRMHumanBoneName);
      if (node) {
        node.quaternion.set(
          data.quaternion[0],
          data.quaternion[1],
          data.quaternion[2],
          data.quaternion[3]
        );
      }
    });

    humanoid.update();
    this.vrm.scene.updateMatrixWorld(true);
    this.activePoseName = poseToLoad.name;
    return true;
  }

  public getSavedPose(): SavedPose | null {
    return this.savedPoseInMemory;
  }

  /**
   * Get bone node by VRM human bone name
   */
  public getBoneNode(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid?.getNormalizedBoneNode(name) || null;
  }

  /**
   * Set bone local rotation in Euler radians
   */
  public setBoneEuler(name: VRMHumanBoneName, xRad: number, yRad: number, zRad: number) {
    const node = this.getBoneNode(name);
    if (!node) return;

    node.quaternion.setFromEuler(new THREE.Euler(xRad, yRad, zRad, 'XYZ'));
    this.vrm.humanoid?.update();
    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * Reset single bone to original authored rotation
   */
  public resetSingleBone(name: VRMHumanBoneName) {
    const node = this.getBoneNode(name);
    const snapshot = this.authoredRestTransforms.get(name);
    if (!node || !snapshot) return;

    node.quaternion.copy(snapshot.quaternion);
    this.vrm.humanoid?.update();
    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * Extract joint marker world positions for 3D visualizers
   */
  public getJointMarkers(): JointMarkerInfo[] {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return [];

    const markers: JointMarkerInfo[] = [];

    EDITABLE_BONES.forEach((def) => {
      const node = humanoid.getNormalizedBoneNode(def.name);
      if (node) {
        const worldPos = new THREE.Vector3();
        node.getWorldPosition(worldPos);
        markers.push({
          boneName: def.name,
          label: def.label,
          category: def.category,
          worldPosition: worldPos,
          node,
        });
      }
    });

    return markers;
  }

  /**
   * Generate line segments connecting the skeleton hierarchy
   */
  public getSkeletonLines(): Float32Array {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return new Float32Array(0);

    const getPos = (name: VRMHumanBoneName): THREE.Vector3 | null => {
      const n = humanoid.getNormalizedBoneNode(name);
      if (!n) return null;
      const p = new THREE.Vector3();
      n.getWorldPosition(p);
      return p;
    };

    const connections: [VRMHumanBoneName, VRMHumanBoneName][] = [
      // Spine -> Chest -> UpperChest -> Neck -> Head
      ['spine' as VRMHumanBoneName, 'chest' as VRMHumanBoneName],
      ['chest' as VRMHumanBoneName, 'neck' as VRMHumanBoneName],
      ['neck' as VRMHumanBoneName, 'head' as VRMHumanBoneName],

      // Neck -> Left Shoulder -> Left Upper Arm -> Left Lower Arm -> Left Hand
      ['neck' as VRMHumanBoneName, 'leftShoulder' as VRMHumanBoneName],
      ['leftShoulder' as VRMHumanBoneName, 'leftUpperArm' as VRMHumanBoneName],
      ['leftUpperArm' as VRMHumanBoneName, 'leftLowerArm' as VRMHumanBoneName],
      ['leftLowerArm' as VRMHumanBoneName, 'leftHand' as VRMHumanBoneName],

      // Neck -> Right Shoulder -> Right Upper Arm -> Right Lower Arm -> Right Hand
      ['neck' as VRMHumanBoneName, 'rightShoulder' as VRMHumanBoneName],
      ['rightShoulder' as VRMHumanBoneName, 'rightUpperArm' as VRMHumanBoneName],
      ['rightUpperArm' as VRMHumanBoneName, 'rightLowerArm' as VRMHumanBoneName],
      ['rightLowerArm' as VRMHumanBoneName, 'rightHand' as VRMHumanBoneName],
    ];

    const points: number[] = [];
    connections.forEach(([from, to]) => {
      const p1 = getPos(from);
      const p2 = getPos(to);
      if (p1 && p2) {
        points.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    });

    return new Float32Array(points);
  }
}
