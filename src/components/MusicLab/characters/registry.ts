import { CharacterProfile } from '../types';

export type CharacterAssetFormat = 'vrm' | 'glb' | 'gltf';

export interface CharacterModelConfig {
  id: string;
  name: string;
  avatarTitle: string;
  gender: 'female' | 'male';
  assetPath: string;
  fallbackAssetPath?: string;
  format: CharacterAssetFormat;
  heightCm: number;
  defaultScale: number;
  offsetY: number;
  springBoneEnabled: boolean;
  description: string;
  defaultExpressions?: {
    blink?: number;
    happy?: number;
    relaxed?: number;
    neutral?: number;
  };
}

/**
 * AniVerse Master Character Registry
 * 
 * Production Character Architecture:
 * CHARACTER (VRM / GLB Humanoid)
 *     +
 * INSTRUMENT (3D Prop Asset)
 *     +
 * ANIMATION (Reusable Humanoid Skeletal Clip)
 *     =
 * MUSICIAN
 */
export const CHARACTER_REGISTRY: Record<string, CharacterModelConfig> = {
  aria: {
    id: 'aria',
    name: 'Aria (アリア)',
    avatarTitle: 'Heroine #01 — Universal Performer',
    gender: 'female',
    assetPath: '/music-lab/characters/aria/aria.vrm',
    fallbackAssetPath: '/music-lab/characters/aria/aria.glb',
    format: 'vrm',
    heightCm: 166,
    defaultScale: 1.0,
    offsetY: 0,
    springBoneEnabled: true,
    description:
      'Youthful, elegant, anime-game humanoid base model customized into Aria. Decoupled performer capable of playing any instrument in AniVerse.',
    defaultExpressions: {
      relaxed: 0.3,
      happy: 0.1,
    },
  },
};

export const DEFAULT_CHARACTER_ID = 'aria';

export function getCharacterConfig(characterId: string = DEFAULT_CHARACTER_ID): CharacterModelConfig {
  return CHARACTER_REGISTRY[characterId] || CHARACTER_REGISTRY.aria;
}
