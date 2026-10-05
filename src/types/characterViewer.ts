import * as THREE from 'three';

export interface CharacterManifestEntry {
  id: string;
  displayName: string;
  filename: string;
  url: string;
  fileSize?: number;
}

export interface Transform3DOptions {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export interface LoadedCharacter {
  instanceId: string; // Unique instance ID (e.g. char-id-12345)
  manifestEntry: CharacterManifestEntry;
  scene: THREE.Group;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  boundingBox: THREE.Box3;
  dimensions: THREE.Vector3; // (width, height, depth)
  centerOffset: THREE.Vector3;
  visible: boolean;
  isLoading: boolean;
  loadProgress: number; // 0 to 100
  loadError: string | null;
  gltf?: any;
}

export interface ViewerSettings {
  showGrid: boolean;
  showShadows: boolean;
  showBoundingBox: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  environmentPreset: 'studio' | 'sunset' | 'dawn' | 'night' | 'sakura';
  backgroundColor: string;
}
