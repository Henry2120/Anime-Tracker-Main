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
  character: {
    id: 'character',
    name: 'Character',
    avatarTitle: '3D VRM Performer',
    gender: 'female',
    assetPath: '/models/test.vrm',
    fallbackAssetPath: '/models/test.vrm',
    format: 'vrm',
    heightCm: 166,
    defaultScale: 1.0,
    offsetY: 0,
    springBoneEnabled: true,
    description:
      'Anime-game humanoid VRM model. Decoupled performer capable of playing any instrument in AniVerse.',
    defaultExpressions: {
      relaxed: 0.3,
      happy: 0.1,
    },
  },
};

export const DEFAULT_CHARACTER_ID = 'character';

export function getCharacterConfig(characterId: string = DEFAULT_CHARACTER_ID): CharacterModelConfig {
  return CHARACTER_REGISTRY[characterId] || CHARACTER_REGISTRY.character;
}
