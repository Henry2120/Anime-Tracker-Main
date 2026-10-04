import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { HumanoidMetrics } from './types';

/**
 * Reusable Humanoid Character Adapter for VRM models.
 * Automatically discovers skeletal bones and derives anatomical proportions dynamically.
 *
 * CRITICAL API COMPLIANCE:
 * Never calls deprecated `vrm.humanoid.getBoneNode()`.
 * Uses `getNormalizedBoneNode()` and `getRawBoneNode()`.
 * Captures true model rest quaternions upon load to support universal rest-pose resetting.
 */
export class VRMHumanoidAdapter {
  private vrm: VRM;
  private metricsCache: HumanoidMetrics | null = null;
  private restPoseMap = new Map<VRMHumanBoneName, THREE.Quaternion>();
  private restBoneDirections = new Map<string, THREE.Vector3>();

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.captureRestPose();
  }

  public getVRM(): VRM {
    return this.vrm;
  }

  /**
   * Safe non-deprecated bone node retriever.
   * Prefers normalized humanoid bone, falls back cleanly to raw bone node.
   */
  public getBoneNode(boneName: VRMHumanBoneName): THREE.Object3D | null {
    if (!this.vrm.humanoid) return null;
    const normalized = this.vrm.humanoid.getNormalizedBoneNode(boneName);
    if (normalized) return normalized;
    return this.vrm.humanoid.getRawBoneNode(boneName);
  }

  /**
   * Captures the initial rest rotations of all humanoid bones.
   */
  private captureRestPose(): void {
    if (!this.vrm.humanoid) return;
    this.vrm.scene.updateMatrixWorld(true);

    const allBones: VRMHumanBoneName[] = [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
      'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
      'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
      'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
      'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
      'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
      'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
      'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
      'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
      'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
    ];

    allBones.forEach((b) => {
      const node = this.getBoneNode(b);
      if (node) {
        this.restPoseMap.set(b, node.quaternion.clone());
      }
    });

    // Compute dynamic canonical rest bone directions (parent -> child)
    const computeDir = (parentBone: VRMHumanBoneName, childBone: VRMHumanBoneName) => {
      const pParent = this.getBoneWorldPosition(parentBone);
      const pChild = this.getBoneWorldPosition(childBone);
      if (pParent && pChild) {
        const dir = new THREE.Vector3().subVectors(pChild, pParent).normalize();
        this.restBoneDirections.set(`${parentBone}_to_${childBone}`, dir);
      }
    };

    computeDir('leftUpperArm', 'leftLowerArm');
    computeDir('leftLowerArm', 'leftHand');
    computeDir('rightUpperArm', 'rightLowerArm');
    computeDir('rightLowerArm', 'rightHand');
  }

  /**
   * Gets the dynamic canonical rest bone direction measured directly from rest pose.
   * Defaults to normalized VRM T-pose conventions (+X for left, -X for right) if unavailable.
   */
  public getRestBoneDirection(parentBone: VRMHumanBoneName, childBone: VRMHumanBoneName): THREE.Vector3 {
    const key = `${parentBone}_to_${childBone}`;
    const cached = this.restBoneDirections.get(key);
    if (cached) return cached.clone();

    // Fallback: standard VRM normalized T-pose axis
    const isLeft = parentBone.startsWith('left');
    return new THREE.Vector3(isLeft ? 1 : -1, 0, 0);
  }

  /**
   * Retrieves world position of a humanoid bone.
   */
  public getBoneWorldPosition(boneName: VRMHumanBoneName, target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 | null {
    const node = this.getBoneNode(boneName);
    if (!node) return null;
    node.updateWorldMatrix(true, false);
    return node.getWorldPosition(target);
  }

  /**
   * Retrieves world quaternion of a humanoid bone.
   */
  public getBoneWorldQuaternion(boneName: VRMHumanBoneName, target: THREE.Quaternion = new THREE.Quaternion()): THREE.Quaternion | null {
    const node = this.getBoneNode(boneName);
    if (!node) return null;
    node.updateWorldMatrix(true, false);
    return node.getWorldQuaternion(target);
  }

  /**
   * Retrieves world quaternion of a bone's parent object in Three.js hierarchy.
   */
  public getParentWorldQuaternion(boneName: VRMHumanBoneName, target: THREE.Quaternion = new THREE.Quaternion()): THREE.Quaternion {
    const node = this.getBoneNode(boneName);
    if (!node || !node.parent) return target.identity();
    node.parent.updateWorldMatrix(true, false);
    return node.parent.getWorldQuaternion(target);
  }

  /**
   * Checks if a bone exists in this humanoid.
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

    // Head Radius & Chin Target derived dynamically
    const headRadius = Math.max(0.08, neckLength * 0.9);
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

    // Detect Chibi proportions
    const headToHeightRatio = (headRadius * 2) / totalHeight;
    const isChibi = headToHeightRatio > 0.26 || totalHeight < 1.25;

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
   * Resets all humanoid bones to their initial captured rest pose (Part 15).
   */
  public resetToRestPose(): void {
    if (!this.vrm.humanoid) return;

    this.restPoseMap.forEach((quat, boneName) => {
      const node = this.getBoneNode(boneName);
      if (node) {
        node.quaternion.copy(quat);
      }
    });

    this.vrm.scene.updateMatrixWorld(true);
  }

  /**
   * Applies local rotation quaternion to a specific bone.
   */
  public setBoneRotation(boneName: VRMHumanBoneName, quat: THREE.Quaternion): void {
    const node = this.getBoneNode(boneName);
    if (node) {
      node.quaternion.copy(quat);
    }
  }

  /**
   * Updates world matrix of VRM scene.
   */
  public updateWorldMatrix(): void {
    this.vrm.scene.updateMatrixWorld(true);
  }
}
