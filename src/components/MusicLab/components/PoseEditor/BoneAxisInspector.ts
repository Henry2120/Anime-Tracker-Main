import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface BoneHierarchyInfo {
  boneName: VRMHumanBoneName;
  label: string;
  category: 'Body' | 'Left Arm' | 'Right Arm' | 'Left Hand / Fingers' | 'Right Hand / Fingers';
  parentName: string;
  childName: string;
}

export interface BoneLocalFrameData {
  boneName: VRMHumanBoneName;
  label: string;
  category: 'Body' | 'Left Arm' | 'Right Arm' | 'Left Hand / Fingers' | 'Right Hand / Fingers';
  parentName: string;
  childName: string;
  hasHumanoidMapping: boolean;
  restRotationEulerDeg: { x: number; y: number; z: number };
  currentRotationEulerDeg: { x: number; y: number; z: number };
  localXWorld: THREE.Vector3;
  localYWorld: THREE.Vector3;
  localZWorld: THREE.Vector3;
  boneDirectionWorld: THREE.Vector3;
  boneLength: number;
  anatomicalControls: {
    primaryMotion: string;
    primaryAxis: string;
    secondaryMotion: string;
    secondaryAxis: string;
    twistMotion: string;
    twistAxis: string;
  };
}

export const BONE_HIERARCHY_MAP: { [key in VRMHumanBoneName]?: { parent: string; child: string } } = {
  spine: { parent: 'Hips', child: 'Chest' },
  chest: { parent: 'Spine', child: 'Neck' },
  upperChest: { parent: 'Chest', child: 'Neck' },
  neck: { parent: 'Chest', child: 'Head' },
  head: { parent: 'Neck', child: 'Top of Head' },

  leftShoulder: { parent: 'Chest', child: 'Left Upper Arm' },
  leftUpperArm: { parent: 'Left Shoulder', child: 'Left Lower Arm (Elbow)' },
  leftLowerArm: { parent: 'Left Upper Arm', child: 'Left Hand (Wrist)' },
  leftHand: { parent: 'Left Lower Arm', child: 'Left Middle Proximal' },

  // Left Fingers
  leftThumbMetacarpal: { parent: 'Left Hand (Wrist)', child: 'Left Thumb Proximal' },
  leftThumbProximal: { parent: 'Left Thumb Metacarpal', child: 'Left Thumb Distal' },
  leftThumbDistal: { parent: 'Left Thumb Proximal', child: 'Left Thumb Tip' },
  leftIndexProximal: { parent: 'Left Hand (Wrist)', child: 'Left Index Intermediate' },
  leftIndexIntermediate: { parent: 'Left Index Proximal', child: 'Left Index Distal' },
  leftIndexDistal: { parent: 'Left Index Intermediate', child: 'Left Index Tip' },
  leftMiddleProximal: { parent: 'Left Hand (Wrist)', child: 'Left Middle Intermediate' },
  leftMiddleIntermediate: { parent: 'Left Middle Proximal', child: 'Left Middle Distal' },
  leftMiddleDistal: { parent: 'Left Middle Intermediate', child: 'Left Middle Tip' },
  leftRingProximal: { parent: 'Left Hand (Wrist)', child: 'Left Ring Intermediate' },
  leftRingIntermediate: { parent: 'Left Ring Proximal', child: 'Left Ring Distal' },
  leftRingDistal: { parent: 'Left Ring Intermediate', child: 'Left Ring Tip' },
  leftLittleProximal: { parent: 'Left Hand (Wrist)', child: 'Left Little Intermediate' },
  leftLittleIntermediate: { parent: 'Left Little Proximal', child: 'Left Little Distal' },
  leftLittleDistal: { parent: 'Left Little Intermediate', child: 'Left Little Tip' },

  rightShoulder: { parent: 'Chest', child: 'Right Upper Arm' },
  rightUpperArm: { parent: 'Right Shoulder', child: 'Right Lower Arm (Elbow)' },
  rightLowerArm: { parent: 'Right Upper Arm', child: 'Right Hand (Wrist)' },
  rightHand: { parent: 'Right Lower Arm', child: 'Right Middle Proximal' },

  // Right Fingers
  rightThumbMetacarpal: { parent: 'Right Hand (Wrist)', child: 'Right Thumb Proximal' },
  rightThumbProximal: { parent: 'Right Thumb Metacarpal', child: 'Right Thumb Distal' },
  rightThumbDistal: { parent: 'Right Thumb Proximal', child: 'Right Thumb Tip' },
  rightIndexProximal: { parent: 'Right Hand (Wrist)', child: 'Right Index Intermediate' },
  rightIndexIntermediate: { parent: 'Right Index Proximal', child: 'Right Index Distal' },
  rightIndexDistal: { parent: 'Right Index Intermediate', child: 'Right Index Tip' },
  rightMiddleProximal: { parent: 'Right Hand (Wrist)', child: 'Right Middle Intermediate' },
  rightMiddleIntermediate: { parent: 'Right Middle Proximal', child: 'Right Middle Distal' },
  rightMiddleDistal: { parent: 'Right Middle Intermediate', child: 'Right Middle Tip' },
  rightRingProximal: { parent: 'Right Hand (Wrist)', child: 'Right Ring Intermediate' },
  rightRingIntermediate: { parent: 'Right Ring Proximal', child: 'Right Ring Distal' },
  rightRingDistal: { parent: 'Right Ring Intermediate', child: 'Right Ring Tip' },
  rightLittleProximal: { parent: 'Right Hand (Wrist)', child: 'Right Little Intermediate' },
  rightLittleIntermediate: { parent: 'Right Little Proximal', child: 'Right Little Distal' },
  rightLittleDistal: { parent: 'Right Little Intermediate', child: 'Right Little Tip' },
};

/**
 * Extracts live coordinate frame vectors, anatomical direction, and control mappings for any VRM bone.
 */
export function inspectBoneLocalFrame(
  vrm: VRM,
  boneName: VRMHumanBoneName,
  label: string,
  category: 'Body' | 'Left Arm' | 'Right Arm' | 'Left Hand / Fingers' | 'Right Hand / Fingers'
): BoneLocalFrameData | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;

  const node = humanoid.getNormalizedBoneNode(boneName);
  const hasHumanoidMapping = !!node;
  if (!node) return null;

  const wQuat = new THREE.Quaternion();
  node.getWorldQuaternion(wQuat);

  const localXWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(wQuat).normalize();
  const localYWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(wQuat).normalize();
  const localZWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(wQuat).normalize();

  const currentPos = new THREE.Vector3();
  node.getWorldPosition(currentPos);

  // Compute bone direction toward primary child
  const boneDirectionWorld = new THREE.Vector3();
  let boneLength = 0.05;

  const childMap: { [key in VRMHumanBoneName]?: VRMHumanBoneName } = {
    spine: 'chest' as VRMHumanBoneName,
    chest: 'neck' as VRMHumanBoneName,
    neck: 'head' as VRMHumanBoneName,
    leftShoulder: 'leftUpperArm' as VRMHumanBoneName,
    leftUpperArm: 'leftLowerArm' as VRMHumanBoneName,
    leftLowerArm: 'leftHand' as VRMHumanBoneName,
    leftThumbMetacarpal: 'leftThumbProximal' as VRMHumanBoneName,
    leftThumbProximal: 'leftThumbDistal' as VRMHumanBoneName,
    leftIndexProximal: 'leftIndexIntermediate' as VRMHumanBoneName,
    leftIndexIntermediate: 'leftIndexDistal' as VRMHumanBoneName,
    leftMiddleProximal: 'leftMiddleIntermediate' as VRMHumanBoneName,
    leftMiddleIntermediate: 'leftMiddleDistal' as VRMHumanBoneName,
    leftRingProximal: 'leftRingIntermediate' as VRMHumanBoneName,
    leftRingIntermediate: 'leftRingDistal' as VRMHumanBoneName,
    leftLittleProximal: 'leftLittleIntermediate' as VRMHumanBoneName,
    leftLittleIntermediate: 'leftLittleDistal' as VRMHumanBoneName,

    rightShoulder: 'rightUpperArm' as VRMHumanBoneName,
    rightUpperArm: 'rightLowerArm' as VRMHumanBoneName,
    rightLowerArm: 'rightHand' as VRMHumanBoneName,
    rightThumbMetacarpal: 'rightThumbProximal' as VRMHumanBoneName,
    rightThumbProximal: 'rightThumbDistal' as VRMHumanBoneName,
    rightIndexProximal: 'rightIndexIntermediate' as VRMHumanBoneName,
    rightIndexIntermediate: 'rightIndexDistal' as VRMHumanBoneName,
    rightMiddleProximal: 'rightMiddleIntermediate' as VRMHumanBoneName,
    rightMiddleIntermediate: 'rightMiddleDistal' as VRMHumanBoneName,
    rightRingProximal: 'rightRingIntermediate' as VRMHumanBoneName,
    rightRingIntermediate: 'rightRingDistal' as VRMHumanBoneName,
    rightLittleProximal: 'rightLittleIntermediate' as VRMHumanBoneName,
    rightLittleIntermediate: 'rightLittleDistal' as VRMHumanBoneName,
  };

  const childBoneName = childMap[boneName];
  if (childBoneName) {
    const childNode = humanoid.getNormalizedBoneNode(childBoneName);
    if (childNode) {
      const childPos = new THREE.Vector3();
      childNode.getWorldPosition(childPos);
      boneDirectionWorld.subVectors(childPos, currentPos);
      boneLength = boneDirectionWorld.length();
      boneDirectionWorld.normalize();
    }
  } else {
    // Head / Hand / Finger terminal defaults
    if (boneName === 'head') {
      boneDirectionWorld.copy(localYWorld);
      boneLength = 0.15;
    } else if (boneName.startsWith('left')) {
      boneDirectionWorld.copy(localXWorld);
      boneLength = 0.04;
    } else if (boneName.startsWith('right')) {
      boneDirectionWorld.copy(localXWorld).negate();
      boneLength = 0.04;
    }
  }

  // Derive exact anatomical control axis mappings based on bone kinematic role
  let anatomicalControls = {
    primaryMotion: 'Raise / Lower',
    primaryAxis: 'Local Z',
    secondaryMotion: 'Forward / Back',
    secondaryAxis: 'Local Y',
    twistMotion: 'Twist / Roll',
    twistAxis: 'Local X',
  };

  if (category === 'Body') {
    anatomicalControls = {
      primaryMotion: 'Lean Forward / Back (Pitch)',
      primaryAxis: 'Local X',
      secondaryMotion: 'Turn Left / Right (Yaw / Twist)',
      secondaryAxis: 'Local Y',
      twistMotion: 'Tilt Left / Right (Roll)',
      twistAxis: 'Local Z',
    };
  } else if (boneName === 'leftShoulder') {
    anatomicalControls = {
      primaryMotion: 'Raise / Depress (+Z / -Z)',
      primaryAxis: 'Local Z',
      secondaryMotion: 'Protraction / Retraction (-Y / +Y)',
      secondaryAxis: 'Local Y',
      twistMotion: 'Scapular Tilt',
      twistAxis: 'Local X',
    };
  } else if (boneName === 'rightShoulder') {
    anatomicalControls = {
      primaryMotion: 'Raise / Depress (-Z / +Z)',
      primaryAxis: 'Local Z (Mirrored)',
      secondaryMotion: 'Protraction / Retraction (+Y / -Y)',
      secondaryAxis: 'Local Y (Mirrored)',
      twistMotion: 'Scapular Tilt',
      twistAxis: 'Local X (Mirrored)',
    };
  } else if (boneName === 'leftUpperArm') {
    anatomicalControls = {
      primaryMotion: 'Raise / Lower (+Z / -Z)',
      primaryAxis: 'Local Z',
      secondaryMotion: 'Forward / Back (-Y / +Y)',
      secondaryAxis: 'Local Y',
      twistMotion: 'Internal / External Twist (+X / -X)',
      twistAxis: 'Local X',
    };
  } else if (boneName === 'rightUpperArm') {
    anatomicalControls = {
      primaryMotion: 'Raise / Lower (-Z / +Z)',
      primaryAxis: 'Local Z (Mirrored)',
      secondaryMotion: 'Forward / Back (+Y / -Y)',
      secondaryAxis: 'Local Y (Mirrored)',
      twistMotion: 'Internal / External Twist (-X / +X)',
      twistAxis: 'Local X (Mirrored)',
    };
  } else if (boneName === 'leftLowerArm') {
    anatomicalControls = {
      primaryMotion: 'Elbow Flexion / Bend (-Y Hinge)',
      primaryAxis: 'Local Y',
      secondaryMotion: 'Forearm Pronate / Supinate (+X / -X)',
      secondaryAxis: 'Local X',
      twistMotion: 'Side Hinge',
      twistAxis: 'Local Z',
    };
  } else if (boneName === 'rightLowerArm') {
    anatomicalControls = {
      primaryMotion: 'Elbow Flexion / Bend (+Y Hinge Mirrored)',
      primaryAxis: 'Local Y (Mirrored)',
      secondaryMotion: 'Forearm Pronate / Supinate (-X / +X)',
      secondaryAxis: 'Local X (Mirrored)',
      twistMotion: 'Side Hinge',
      twistAxis: 'Local Z',
    };
  } else if (boneName === 'leftHand') {
    anatomicalControls = {
      primaryMotion: 'Wrist Bend / Flexion (-Y / +Y)',
      primaryAxis: 'Local Y',
      secondaryMotion: 'Wrist Side Tilt (+Z / -Z)',
      secondaryAxis: 'Local Z',
      twistMotion: 'Wrist Turn / Roll (+X / -X)',
      twistAxis: 'Local X',
    };
  } else if (boneName === 'rightHand') {
    anatomicalControls = {
      primaryMotion: 'Wrist Bend / Flexion (+Y / -Y)',
      primaryAxis: 'Local Y (Mirrored)',
      secondaryMotion: 'Wrist Side Tilt (-Z / +Z)',
      secondaryAxis: 'Local Z (Mirrored)',
      twistMotion: 'Wrist Turn / Roll (-X / +X)',
      twistAxis: 'Local X (Mirrored)',
    };
  } else if (boneName.startsWith('leftThumb')) {
    anatomicalControls = {
      primaryMotion: 'Thumb Opposition / Flexion (-Z / -Y)',
      primaryAxis: 'Local Z / Y',
      secondaryMotion: 'Thumb Abduction (-Y)',
      secondaryAxis: 'Local Y',
      twistMotion: 'Thumb Axial Roll (+X)',
      twistAxis: 'Local X',
    };
  } else if (boneName.startsWith('rightThumb')) {
    anatomicalControls = {
      primaryMotion: 'Thumb Opposition / Flexion (+Z / +Y)',
      primaryAxis: 'Local Z / Y (Mirrored)',
      secondaryMotion: 'Thumb Abduction (+Y)',
      secondaryAxis: 'Local Y (Mirrored)',
      twistMotion: 'Thumb Axial Roll (-X)',
      twistAxis: 'Local X (Mirrored)',
    };
  } else if (boneName.startsWith('left')) {
    // Left fingers
    anatomicalControls = {
      primaryMotion: 'Finger Joint Curl (-Z)',
      primaryAxis: 'Local Z',
      secondaryMotion: 'Finger Splay / Spread (Y)',
      secondaryAxis: 'Local Y',
      twistMotion: 'Axial Twist (X)',
      twistAxis: 'Local X',
    };
  } else if (boneName.startsWith('right')) {
    // Right fingers
    anatomicalControls = {
      primaryMotion: 'Finger Joint Curl (+Z)',
      primaryAxis: 'Local Z (Mirrored)',
      secondaryMotion: 'Finger Splay / Spread (Y)',
      secondaryAxis: 'Local Y (Mirrored)',
      twistMotion: 'Axial Twist (X)',
      twistAxis: 'Local X (Mirrored)',
    };
  }

  const hInfo = BONE_HIERARCHY_MAP[boneName] || { parent: 'Parent Bone', child: 'Child Bone' };

  return {
    boneName,
    label,
    category,
    parentName: hInfo.parent,
    childName: hInfo.child,
    hasHumanoidMapping,
    restRotationEulerDeg: { x: 0, y: 0, z: 0 },
    currentRotationEulerDeg: {
      x: Math.round(node.rotation.x * (180 / Math.PI)),
      y: Math.round(node.rotation.y * (180 / Math.PI)),
      z: Math.round(node.rotation.z * (180 / Math.PI)),
    },
    localXWorld,
    localYWorld,
    localZWorld,
    boneDirectionWorld,
    boneLength,
    anatomicalControls,
  };
}
