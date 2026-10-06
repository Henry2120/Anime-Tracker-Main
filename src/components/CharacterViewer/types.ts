import * as THREE from 'three';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';

export interface CharacterAnimationInfo {
  name: string;
  duration: number;
}

export interface LoadedCharacterInstance {
  id: string; // Unique instance ID
  characterId: string; // Manifest ID
  manifestEntry: CharacterManifestEntry;
  scene: THREE.Group;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  visible: boolean;
  boundingBox: THREE.Box3;
  boundingSphere: THREE.Sphere;
  modelHeight: number;
  centerOffset: THREE.Vector3;
  vertexCount: number;
  meshCount: number;

  // Concert Stage Slot
  slotIndex?: number; // 0 to 9
  stageRow?: 'front' | 'back';

  // Animation system per character instance
  animations: THREE.AnimationClip[];
  availableAnimations: CharacterAnimationInfo[];
  mixer: THREE.AnimationMixer;
  currentAction: THREE.AnimationAction | null;
  currentAnimationName: string | null;
  isPlayingAnimation: boolean;
}

export type ViewerCameraPreset = 'front' | 'perspective' | 'side' | 'closeUp' | 'top';

export type ViewerEnvironment = 'studio' | 'dark' | 'sakura' | 'sunset' | 'clean';

export interface CharacterViewerState {
  loadedCharacters: LoadedCharacterInstance[];
  selectedInstanceId: string | null;
  loading: boolean;
  loadingCharacter: CharacterManifestEntry | null;
  loadingProgress?: number;
  error: {
    character: CharacterManifestEntry;
    message: string;
  } | null;
}
