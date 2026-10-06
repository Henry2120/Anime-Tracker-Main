import * as THREE from 'three';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';

/**
 * 10-Character Concert Stage Configuration
 * Front Row: 5 characters at Y=0, Z=0.75
 * Back Row: 5 characters at Y=0.50 (elevated platform), Z=-0.85
 * Symmetrically aligned across the stage facing the audience
 */
export const CONCERT_STAGE_CONFIG = {
  slotCount: 10,
  rowSize: 5,
  characterSpacingX: 1.35, // Distance between adjacent characters in meters
  frontRowY: 0.0,
  backRowY: 0.50, // Physical elevation of the back riser
  frontRowZ: 0.75, // Closer to camera
  backRowZ: -0.85, // Distance behind front row
  stageWidth: 8.8,
  stageDepth: 4.4,
  riserWidth: 7.8,
  riserDepth: 1.8,
  riserHeight: 0.50,
};

/**
 * The 10 Iconic Blue Archive performers
 */
export const DEFAULT_CONCERT_PERFORMERS: CharacterManifestEntry[] = [
  // FRONT ROW (Slots 1 to 5)
  {
    id: 'airi-2',
    name: 'Airi',
    filename: 'Airi.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Airi.glb',
  },
  {
    id: 'hifumi-67',
    name: 'Hifumi',
    filename: 'Hifumi.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Hifumi.glb',
  },
  {
    id: 'shiroko-240',
    name: 'Shiroko',
    filename: 'Shiroko.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Shiroko.glb',
  },
  {
    id: 'yuuka-282',
    name: 'Yuuka',
    filename: 'Yuuka.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Yuuka.glb',
  },
  {
    id: 'hoshino-80',
    name: 'Hoshino',
    filename: 'Hoshino.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Hoshino.glb',
  },
  // BACK ROW - ELEVATED (Slots 6 to 10)
  {
    id: 'aru-18',
    name: 'Aru',
    filename: 'Aru.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Aru.glb',
  },
  {
    id: 'mika-154',
    name: 'Mika',
    filename: 'Mika.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Mika.glb',
  },
  {
    id: 'azusa-27',
    name: 'Azusa',
    filename: 'Azusa.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Azusa.glb',
  },
  {
    id: 'koharu-124',
    name: 'Koharu',
    filename: 'Koharu.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Koharu.glb',
  },
  {
    id: 'mutsuki-177',
    name: 'Mutsuki',
    filename: 'Mutsuki.glb',
    url: 'https://media.githubusercontent.com/media/Henry2120/AniVerse-BlueArchive-Assets/main/Mutsuki.glb',
  },
];

/**
 * Calculates transform coordinates for a given concert slot (0..9)
 */
export function getConcertSlotTransform(slotIndex: number) {
  const isBackRow = slotIndex >= 5;
  const colIndex = slotIndex % 5; // 0, 1, 2, 3, 4
  const xOffset = (colIndex - 2) * CONCERT_STAGE_CONFIG.characterSpacingX; // -2.7, -1.35, 0, 1.35, 2.7
  const yOffset = isBackRow ? CONCERT_STAGE_CONFIG.backRowY : CONCERT_STAGE_CONFIG.frontRowY;
  const zOffset = isBackRow ? CONCERT_STAGE_CONFIG.backRowZ : CONCERT_STAGE_CONFIG.frontRowZ;

  return {
    slotIndex,
    slotNumber: slotIndex + 1,
    row: isBackRow ? ('back' as const) : ('front' as const),
    position: new THREE.Vector3(xOffset, yOffset, zOffset),
    rotation: new THREE.Euler(0, 0, 0), // Facing audience/camera
    scale: new THREE.Vector3(1, 1, 1),
    isElevated: isBackRow,
  };
}
