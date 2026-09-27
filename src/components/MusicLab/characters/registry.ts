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
  description: string;
}

/**
 * Character Registry
 * Holds clean configuration for loading the passive VRM character model.
 */
export const CHARACTER_REGISTRY: Record<string, CharacterModelConfig> = {
  character: {
    id: 'character',
    name: 'Character',
    avatarTitle: '3D VRM Character Model',
    gender: 'female',
    assetPath: '/models/test.vrm',
    fallbackAssetPath: '/models/test.vrm',
    format: 'vrm',
    heightCm: 166,
    defaultScale: 1.0,
    offsetY: 0,
    description: 'Humanoid VRM character model.',
  },
};

export const DEFAULT_CHARACTER_ID = 'character';

export function getCharacterConfig(characterId: string = DEFAULT_CHARACTER_ID): CharacterModelConfig {
  return CHARACTER_REGISTRY[characterId] || CHARACTER_REGISTRY.character;
}
