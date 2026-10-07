import * as THREE from 'three';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';

/**
 * 10-Character Concert Stage Configuration
 * Front Row: 5 characters in a gentle curved arc at Y=0, Z≈0.85
 * Back Row: 5 characters in a parallel curved arc elevated at Y=0.50, Z≈-0.75
 * Both rows curve gently backward towards the wings, all facing the audience.
 */
export const CONCERT_STAGE_CONFIG = {
  defaultPerformerCount: 10,
  rowSize: 5,
  characterSpacingX: 1.35, // Distance between adjacent characters horizontally (meters)
  radiusOfCurvature: 13.5, // Radius of the arc; creates a subtle, gentle curve (~0.27m depth)
  frontRowY: 0.0,
  backRowY: 0.50, // Physical elevation of the back riser
  frontRowBaseZ: 0.85, // Front row center Z (closest to audience)
  backRowBaseZ: -0.75, // Back row center Z (elevated riser)
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
 * Calculates transform coordinates for a given concert slot (0..performerCount-1).
 * Features a gentle curved arc formation:
 * Center characters are closest to audience; wing characters curve slightly backward.
 * All characters face toward the audience (rotation = [0, 0, 0]).
 */
export function getConcertSlotTransform(slotIndex: number, performerCount: number = 10) {
  const frontCount = Math.ceil(performerCount / 2);
  const isBackRow = slotIndex >= frontCount;

  const rowCount = isBackRow ? performerCount - frontCount : frontCount;
  const colIndex = isBackRow ? slotIndex - frontCount : slotIndex;

  // Normalized distance from center of row (for 5 characters: -2, -1, 0, 1, 2)
  const centerOffset = colIndex - (rowCount - 1) / 2;
  const xOffset = centerOffset * CONCERT_STAGE_CONFIG.characterSpacingX;

  // Parabolic arc curvature: deltaZ is negative, curving back toward the wings
  const deltaZ = -(xOffset * xOffset) / (2 * CONCERT_STAGE_CONFIG.radiusOfCurvature);

  const baseY = isBackRow ? CONCERT_STAGE_CONFIG.backRowY : CONCERT_STAGE_CONFIG.frontRowY;
  const baseZ = isBackRow ? CONCERT_STAGE_CONFIG.backRowBaseZ : CONCERT_STAGE_CONFIG.frontRowBaseZ;

  const yOffset = baseY;
  const zOffset = baseZ + deltaZ;

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
