import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

export interface PoseMetrics {
  chinPos?: THREE.Vector3;
  chinRestPos?: THREE.Vector3;
  chinDistance?: number;
  bowAngle?: number;
  leftWristPos?: THREE.Vector3;
  leftElbowPos?: THREE.Vector3;
  rightWristPos?: THREE.Vector3;
  rightElbowPos?: THREE.Vector3;
}

export interface ViolinPoseVariant {
  id: number; // 0 = Neutral T-Pose Baseline, 1..16 = Numbered Strategies
  numberStr: string; // e.g. "00", "01", "02", ...
  name: string;
  poseMethod: string;
  strategy?: string;
  referenceName: string;
  referenceModel?: string;
  referenceUrl: string;
  referenceWebsite?: string;
  creator: string;
  license: string;
  sourceAssetBundled: boolean;
  shortDescription: string;
  visibleDifferences: string;
  anatomicalDifferences?: string;
  applyPose: (
    vrm: VRM,
    violin: THREE.Group,
    bow: THREE.Group,
    time: number
  ) => PoseMetrics;
}
