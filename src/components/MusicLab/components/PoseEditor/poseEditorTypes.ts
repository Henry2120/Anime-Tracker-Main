import * as THREE from 'three';
import { VRMHumanBoneName } from '@pixiv/three-vrm';

export interface EditableBoneDefinition {
  name: VRMHumanBoneName;
  label: string;
  category: 'Body' | 'Left Arm' | 'Right Arm' | 'Left Hand / Fingers' | 'Right Hand / Fingers';
}

export const EDITABLE_BONES: EditableBoneDefinition[] = [
  // Body
  { name: 'spine' as VRMHumanBoneName, label: 'Spine (Lower)', category: 'Body' },
  { name: 'chest' as VRMHumanBoneName, label: 'Chest (Torso)', category: 'Body' },
  { name: 'upperChest' as VRMHumanBoneName, label: 'Upper Chest', category: 'Body' },
  { name: 'neck' as VRMHumanBoneName, label: 'Neck', category: 'Body' },
  { name: 'head' as VRMHumanBoneName, label: 'Head', category: 'Body' },

  // Left Arm Chain
  { name: 'leftShoulder' as VRMHumanBoneName, label: 'Left Shoulder', category: 'Left Arm' },
  { name: 'leftUpperArm' as VRMHumanBoneName, label: 'Left Upper Arm', category: 'Left Arm' },
  { name: 'leftLowerArm' as VRMHumanBoneName, label: 'Left Lower Arm (Elbow)', category: 'Left Arm' },
  { name: 'leftHand' as VRMHumanBoneName, label: 'Left Hand (Wrist)', category: 'Left Arm' },

  // Left Fingers
  { name: 'leftThumbMetacarpal' as VRMHumanBoneName, label: 'Left Thumb Metacarpal', category: 'Left Hand / Fingers' },
  { name: 'leftThumbProximal' as VRMHumanBoneName, label: 'Left Thumb Proximal', category: 'Left Hand / Fingers' },
  { name: 'leftThumbDistal' as VRMHumanBoneName, label: 'Left Thumb Distal', category: 'Left Hand / Fingers' },
  { name: 'leftIndexProximal' as VRMHumanBoneName, label: 'Left Index Proximal', category: 'Left Hand / Fingers' },
  { name: 'leftIndexIntermediate' as VRMHumanBoneName, label: 'Left Index Intermediate', category: 'Left Hand / Fingers' },
  { name: 'leftIndexDistal' as VRMHumanBoneName, label: 'Left Index Distal', category: 'Left Hand / Fingers' },
  { name: 'leftMiddleProximal' as VRMHumanBoneName, label: 'Left Middle Proximal', category: 'Left Hand / Fingers' },
  { name: 'leftMiddleIntermediate' as VRMHumanBoneName, label: 'Left Middle Intermediate', category: 'Left Hand / Fingers' },
  { name: 'leftMiddleDistal' as VRMHumanBoneName, label: 'Left Middle Distal', category: 'Left Hand / Fingers' },
  { name: 'leftRingProximal' as VRMHumanBoneName, label: 'Left Ring Proximal', category: 'Left Hand / Fingers' },
  { name: 'leftRingIntermediate' as VRMHumanBoneName, label: 'Left Ring Intermediate', category: 'Left Hand / Fingers' },
  { name: 'leftRingDistal' as VRMHumanBoneName, label: 'Left Ring Distal', category: 'Left Hand / Fingers' },
  { name: 'leftLittleProximal' as VRMHumanBoneName, label: 'Left Little Proximal', category: 'Left Hand / Fingers' },
  { name: 'leftLittleIntermediate' as VRMHumanBoneName, label: 'Left Little Intermediate', category: 'Left Hand / Fingers' },
  { name: 'leftLittleDistal' as VRMHumanBoneName, label: 'Left Little Distal', category: 'Left Hand / Fingers' },

  // Right Arm Chain
  { name: 'rightShoulder' as VRMHumanBoneName, label: 'Right Shoulder', category: 'Right Arm' },
  { name: 'rightUpperArm' as VRMHumanBoneName, label: 'Right Upper Arm', category: 'Right Arm' },
  { name: 'rightLowerArm' as VRMHumanBoneName, label: 'Right Lower Arm (Elbow)', category: 'Right Arm' },
  { name: 'rightHand' as VRMHumanBoneName, label: 'Right Hand (Wrist)', category: 'Right Arm' },

  // Right Fingers
  { name: 'rightThumbMetacarpal' as VRMHumanBoneName, label: 'Right Thumb Metacarpal', category: 'Right Hand / Fingers' },
  { name: 'rightThumbProximal' as VRMHumanBoneName, label: 'Right Thumb Proximal', category: 'Right Hand / Fingers' },
  { name: 'rightThumbDistal' as VRMHumanBoneName, label: 'Right Thumb Distal', category: 'Right Hand / Fingers' },
  { name: 'rightIndexProximal' as VRMHumanBoneName, label: 'Right Index Proximal', category: 'Right Hand / Fingers' },
  { name: 'rightIndexIntermediate' as VRMHumanBoneName, label: 'Right Index Intermediate', category: 'Right Hand / Fingers' },
  { name: 'rightIndexDistal' as VRMHumanBoneName, label: 'Right Index Distal', category: 'Right Hand / Fingers' },
  { name: 'rightMiddleProximal' as VRMHumanBoneName, label: 'Right Middle Proximal', category: 'Right Hand / Fingers' },
  { name: 'rightMiddleIntermediate' as VRMHumanBoneName, label: 'Right Middle Intermediate', category: 'Right Hand / Fingers' },
  { name: 'rightMiddleDistal' as VRMHumanBoneName, label: 'Right Middle Distal', category: 'Right Hand / Fingers' },
  { name: 'rightRingProximal' as VRMHumanBoneName, label: 'Right Ring Proximal', category: 'Right Hand / Fingers' },
  { name: 'rightRingIntermediate' as VRMHumanBoneName, label: 'Right Ring Intermediate', category: 'Right Hand / Fingers' },
  { name: 'rightRingDistal' as VRMHumanBoneName, label: 'Right Ring Distal', category: 'Right Hand / Fingers' },
  { name: 'rightLittleProximal' as VRMHumanBoneName, label: 'Right Little Proximal', category: 'Right Hand / Fingers' },
  { name: 'rightLittleIntermediate' as VRMHumanBoneName, label: 'Right Little Intermediate', category: 'Right Hand / Fingers' },
  { name: 'rightLittleDistal' as VRMHumanBoneName, label: 'Right Little Distal', category: 'Right Hand / Fingers' },
];

export interface BoneTransformSnapshot {
  quaternion: THREE.Quaternion;
  euler: THREE.Euler;
  position: THREE.Vector3;
}

export interface SavedPose {
  id: string;
  name: string;
  timestamp: number;
  bones: { [boneName in VRMHumanBoneName]?: {
    quaternion: [number, number, number, number];
    euler: [number, number, number];
  }};
}

export interface JointMarkerInfo {
  boneName: VRMHumanBoneName;
  label: string;
  category: 'Body' | 'Left Arm' | 'Right Arm' | 'Left Hand / Fingers' | 'Right Hand / Fingers';
  worldPosition: THREE.Vector3;
  node: THREE.Object3D;
}
