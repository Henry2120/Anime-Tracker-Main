import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { HumanoidMetrics } from './types';

/**
 * Reusable Humanoid Character Adapter for VRM models.
 * Automatically discovers skeletal bones and derives anatomical proportions dynamically.
 * Never relies on hardcoded heights or bone lengths.
 */
export class VRMHumanoidAdapter {
  private vrm: VRM;
  private metricsCache: HumanoidMetrics | null = null;

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  public getVRM(): VRM {
    return this.vrm;
  }

  /**
   * Retrieves normalized bone node if available, otherwise raw bone node
   */
  public getBoneNode(boneName: VRMHumanBoneName): THREE.Object3D | null {
    if (!this.vrm.humanoid) return null;
    const normalized = this.vrm.humanoid.getNormalizedBoneNode(boneName);
    if (normalized) return normalized;
    return this.vrm.humanoid.getBoneNode(boneName);
  }

  /**
   * Retrieves world position of a humanoid bone
   */
  public getBoneWorldPosition(boneName: VRMHumanBoneName, target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 | null {
    const node = this.getBoneNode(boneName);
    if (!node) return null;
    node.updateWorldMatrix(true, false);
    return node.getWorldPosition(target);
  }

  /**
   * Retrieves world quaternion of a humanoid bone
   */
  public getBoneWorldQuaternion(boneName: VRMHumanBoneName, target: THREE.Quaternion = new THREE.Quaternion()): THREE.Quaternion | null {
    const node = this.getBoneNode(boneName);
    if (!node) return null;
    node.updateWorldMatrix(true, false);
    return node.getWorldQuaternion(target);
  }

  /**
   * Checks if a bone exists in this humanoid
   */
  public hasBone(boneName: VRMHumanBoneName): boolean {
    return Boolean(this.getBoneNode(boneName));
  }

  /**
   * Discovers and computes full anatomical metrics dynamically from the loaded VRM.
   */
  public computeMetrics(forceRecalculate = false): HumanoidMetrics {
    if (this.metricsCache && !forceRecalculate) {
      return this.metricsCache;
    }

    const tempV = new THREE.Vector3();
    const getPos = (name: VRMHumanBoneName): THREE.Vector3 => {
      const p = this.getBoneWorldPosition(name, new THREE.Vector3());
      return p ? p : new THREE.Vector3(0, 0, 0);
    };

    // Humanoid Core Bones
    const hips = getPos('hips');
    const spine = getPos('spine');
    const chest = getPos('chest');
    const upperChestNode = this.getBoneNode('upperChest');
    const upperChest = upperChestNode ? getPos('upperChest') : undefined;
    const effectiveChest = upperChest || chest;
    const neck = getPos('neck');
    const head = getPos('head');

    // Left & Right Arm Bones
    const leftShoulder = getPos('leftShoulder');
    const rightShoulder = getPos('rightShoulder');
    const leftUpperArm = getPos('leftUpperArm');
    const rightUpperArm = getPos('rightUpperArm');
    const leftLowerArm = getPos('leftLowerArm');
    const rightLowerArm = getPos('rightLowerArm');
    const leftHand = getPos('leftHand');
    const rightHand = getPos('rightHand');

    // Leg & Foot Bones for Height Measurement
    const leftFoot = getPos('leftFoot');
    const rightFoot = getPos('rightFoot');
    const groundY = Math.min(leftFoot.y, rightFoot.y, 0);

    // Dynamic Distances
    const leftUpperArmLen = Math.max(0.08, leftUpperArm.distanceTo(leftLowerArm));
    const rightUpperArmLen = Math.max(0.08, rightUpperArm.distanceTo(rightLowerArm));

    const leftForearmLen = Math.max(0.08, leftLowerArm.distanceTo(leftHand));
    const rightForearmLen = Math.max(0.08, rightLowerArm.distanceTo(rightHand));

    // Hand length: distance from wrist to index/middle knuckle or finger tip
    let leftHandLen = 0.10;
    const leftIndexProx = this.getBoneWorldPosition('leftIndexProximal', tempV);
    if (leftIndexProx) {
      leftHandLen = Math.max(0.06, leftHand.distanceTo(leftIndexProx) * 1.8);
    } else {
      leftHandLen = leftForearmLen * 0.55;
    }

    let rightHandLen = 0.10;
    const rightIndexProx = this.getBoneWorldPosition('rightIndexProximal', tempV);
    if (rightIndexProx) {
      rightHandLen = Math.max(0.06, rightHand.distanceTo(rightIndexProx) * 1.8);
    } else {
      rightHandLen = rightForearmLen * 0.55;
    }

    const shoulderWidth = Math.max(0.15, leftUpperArm.distanceTo(rightUpperArm));
    const torsoLength = Math.max(0.2, hips.distanceTo(neck));
    const neckLength = Math.max(0.05, neck.distanceTo(head));

    // Head Radius & Chin Target derived dynamically from head and neck
    const headRadius = Math.max(0.08, neckLength * 0.9);
    // Chin sits below head, forward along face direction
    const chin = head.clone().add(new THREE.Vector3(0, -headRadius * 0.6, headRadius * 0.7));

    // Left collarbone shelf (between neck base and left shoulder)
    const leftCollarboneShelf = new THREE.Vector3(
      leftShoulder.x * 0.65 + neck.x * 0.35 + 0.02,
      leftShoulder.y * 0.75 + neck.y * 0.25 - 0.02,
      neck.z + 0.06
    );

    // Height calculation
    const headTopY = head.y + headRadius * 1.25;
    const totalHeight = Math.max(0.5, headTopY - groundY);
    const eyeHeight = head.y + headRadius * 0.2 - groundY;

    // Detect Chibi proportions: large head relative to height or very short limbs
    const headToHeightRatio = (headRadius * 2) / totalHeight;
    const isChibi = headToHeightRatio > 0.26 || totalHeight < 1.25;

    // Check finger bone presence
    const hasLeftFingers = this.hasBone('leftIndexProximal') && this.hasBone('leftThumbProximal');
    const hasRightFingers = this.hasBone('rightIndexProximal') && this.hasBone('rightThumbProximal');

    const metrics: HumanoidMetrics = {
      height: totalHeight,
      eyeHeight,
      shoulderWidth,
      torsoLength,
      neckLength,
      upperArmLength: {
        left: leftUpperArmLen,
        right: rightUpperArmLen,
      },
      forearmLength: {
        left: leftForearmLen,
        right: rightForearmLen,
      },
      handLength: {
        left: leftHandLen,
        right: rightHandLen,
      },
      armReach: {
        left: leftUpperArmLen + leftForearmLen + leftHandLen,
        right: rightUpperArmLen + rightForearmLen + rightHandLen,
      },
      headRadius,
      anchors: {
        hips,
        spine,
        chest,
        upperChest,
        effectiveChest,
        neck,
        head,
        chin,
        leftCollarboneShelf,
        leftShoulder,
        rightShoulder,
        leftUpperArm,
        rightUpperArm,
        leftLowerArm,
        rightLowerArm,
        leftHand,
        rightHand,
      },
      isChibi,
      hasUpperChest: Boolean(upperChestNode),
      hasFingerBones: {
        left: hasLeftFingers,
        right: hasRightFingers,
      },
    };

    this.metricsCache = metrics;
    return metrics;
  }

  /**
   * Resets all humanoid bones to their neutral / T-pose identity rotation
   */
  public resetToRestPose(): void {
    if (!this.vrm.humanoid) return;
    const bones: VRMHumanBoneName[] = [
      'hips',
      'spine',
      'chest',
      'upperChest',
      'neck',
      'head',
      'leftShoulder',
      'leftUpperArm',
      'leftLowerArm',
      'leftHand',
      'rightShoulder',
      'rightUpperArm',
      'rightLowerArm',
      'rightHand',
      'leftThumbMetacarpal',
      'leftThumbProximal',
      'leftThumbDistal',
      'leftIndexProximal',
      'leftIndexIntermediate',
      'leftIndexDistal',
      'leftMiddleProximal',
      'leftMiddleIntermediate',
      'leftMiddleDistal',
      'leftRingProximal',
      'leftRingIntermediate',
      'leftRingDistal',
      'leftLittleProximal',
      'leftLittleIntermediate',
      'leftLittleDistal',
      'rightThumbMetacarpal',
      'rightThumbProximal',
      'rightThumbDistal',
      'rightIndexProximal',
      'rightIndexIntermediate',
      'rightIndexDistal',
      'rightMiddleProximal',
      'rightMiddleIntermediate',
      'rightMiddleDistal',
      'rightRingProximal',
      'rightRingIntermediate',
      'rightRingDistal',
      'rightLittleProximal',
      'rightLittleIntermediate',
      'rightLittleDistal',
    ];

    bones.forEach((name) => {
      const node = this.getBoneNode(name);
      if (node) {
        node.quaternion.identity();
      }
    });

    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * Applies local rotation quaternion to a specific bone
   */
  public setBoneRotation(boneName: VRMHumanBoneName, quat: THREE.Quaternion): void {
    const node = this.getBoneNode(boneName);
    if (node) {
      node.quaternion.copy(quat);
    }
  }

  /**
   * Updates world matrix of VRM scene
   */
  public updateWorldMatrix(): void {
    this.vrm.scene.updateMatrixWorld(true);
  }
}
