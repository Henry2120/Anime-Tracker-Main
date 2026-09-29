import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

export interface ReferenceLandmarks {
  head: THREE.Vector3;
  chin: THREE.Vector3;
  neck: THREE.Vector3;
  spine: THREE.Vector3;
  hips: THREE.Vector3;
  leftShoulder: THREE.Vector3;
  leftElbow: THREE.Vector3;
  leftWrist: THREE.Vector3;
  rightShoulder: THREE.Vector3;
  rightElbow: THREE.Vector3;
  rightWrist: THREE.Vector3;
  violinChinrest?: THREE.Vector3;
  violinBridge?: THREE.Vector3;
  violinScroll?: THREE.Vector3;
  bowFrog?: THREE.Vector3;
  bowTip?: THREE.Vector3;
  bowContact?: THREE.Vector3;
}

export interface ReferencePoseData {
  id: string;
  name: string;
  category: string;
  modelUrl?: string;
  sourceType: 'bundled-glb' | 'mocap-rig' | 'custom-upload';
  sourceName: string;
  sourceUrl: string;
  license: string;
  description: string;
  landmarks: ReferenceLandmarks;
  // Relative joint directions & angles
  torsoEuler: THREE.Euler;
  neckEuler: THREE.Euler;
  headEuler: THREE.Euler;
  leftArm: {
    shoulderEuler: THREE.Euler;
    upperArmDir: THREE.Vector3;
    elbowAngle: number;
    wristDir: THREE.Vector3;
    wristTargetOffset: THREE.Vector3;
    elbowHintDir: THREE.Vector3;
  };
  rightArm: {
    shoulderEuler: THREE.Euler;
    upperArmDir: THREE.Vector3;
    elbowAngle: number;
    wristDir: THREE.Vector3;
    wristTargetOffset: THREE.Vector3;
    elbowHintDir: THREE.Vector3;
  };
  violinTransform: {
    positionOffset: THREE.Vector3;
    rotationEuler: THREE.Euler;
  };
  bowTransform: {
    positionOffset: THREE.Vector3;
    rotationEuler: THREE.Euler;
  };
}

export interface RetargetDiagnostics {
  headAngleErrorDeg: number;
  leftElbowAngleErrorDeg: number;
  leftWristOrientationErrorDeg: number;
  rightElbowAngleErrorDeg: number;
  rightWristOrientationErrorDeg: number;
  violinShoulderErrorCm: number;
  chinChinrestErrorCm: number;
  leftHandNeckErrorCm: number;
  rightHandBowErrorCm: number;
  bowStringAngleDeg: number;
}
