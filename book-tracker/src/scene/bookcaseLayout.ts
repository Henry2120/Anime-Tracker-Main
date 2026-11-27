import * as THREE from 'three';
import type { BookshelfPosition } from '../types/domain';

export interface BookcaseTransform {
  position: [number, number, number];
  rotationY: number;
}

export const BOOKCASE_TRANSFORMS: Record<BookshelfPosition, BookcaseTransform> = {
  left: {
    position: [-2.35, 0, -1.18],
    rotationY: 0.56,
  },
  middle: {
    position: [0, 0, -3.38],
    rotationY: 0,
  },
  right: {
    position: [2.35, 0, -1.18],
    rotationY: -0.56,
  },
};

export const BOOKCASE_DIMENSIONS = {
  width: 1.84,
  height: 2.46,
  depth: 0.38,
  innerHalfWidth: 0.81,
  centerStileHalfWidth: 0.028,
  // Top surface Y of each of the 4 horizontal shelf planks (from top shelf down to bottom shelf)
  tierSurfaceYs: [1.857, 1.337, 0.817, 0.297] as const,
  shelfZOffset: 0.03,
} as const;

export function getBookcaseCameraPose(
  shelf: BookshelfPosition,
  isMobileViewport: boolean
): { position: [number, number, number]; target: [number, number, number] } {
  const tf = BOOKCASE_TRANSFORMS[shelf];
  const dist = isMobileViewport ? 2.85 : 2.15;
  const sinY = Math.sin(tf.rotationY);
  const cosY = Math.cos(tf.rotationY);
  const targetY = 1.24;

  return {
    position: [
      tf.position[0] + sinY * dist,
      isMobileViewport ? 1.36 : 1.28,
      tf.position[2] + cosY * dist,
    ],
    target: [tf.position[0], targetY, tf.position[2]],
  };
}

/**
 * Computes local shelf-relative coordinates (in bookcase local space) for book slot `slotIndex`
 * inside a bookcase of 4 tiers x 2 bays (left bay + right bay per tier).
 */
export function computeLocalBookSlot(params: {
  slotIndex: number;
  spineThickness: number;
  bookHeight: number;
  bookDepth: number;
}): { x: number; y: number; z: number } {
  // 8 compartments total: 4 tiers * 2 bays (bay width ~0.76m each)
  const slotsPerBay = 20;
  const maxVisibleSlots = BOOKCASE_DIMENSIONS.tierSurfaceYs.length * 2 * slotsPerBay;
  const clampedIdx = params.slotIndex % maxVisibleSlots;

  const tierIdx = Math.floor(clampedIdx / (2 * slotsPerBay));
  const rem = clampedIdx % (2 * slotsPerBay);
  const bayIdx = Math.floor(rem / slotsPerBay); // 0 = left bay, 1 = right bay
  const indexInBay = rem % slotsPerBay;

  const bayStartX =
    bayIdx === 0
      ? -BOOKCASE_DIMENSIONS.innerHalfWidth + 0.025
      : BOOKCASE_DIMENSIONS.centerStileHalfWidth + 0.025;
  const slotPitch = 0.037;
  const x = bayStartX + indexInBay * slotPitch + params.spineThickness * 0.5;
  const y = BOOKCASE_DIMENSIONS.tierSurfaceYs[tierIdx] + params.bookHeight * 0.5;
  const z = BOOKCASE_DIMENSIONS.shelfZOffset + (0.24 - params.bookDepth) * 0.25;

  return { x, y, z };
}

const _localPos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

export function localBookSlotToWorld(
  shelf: BookshelfPosition,
  local: { x: number; y: number; z: number },
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
  const tf = BOOKCASE_TRANSFORMS[shelf];
  _euler.set(0, tf.rotationY, 0);
  _quat.setFromEuler(_euler);
  _localPos.set(local.x, local.y, local.z).applyQuaternion(_quat);
  return out.set(
    tf.position[0] + _localPos.x,
    tf.position[1] + _localPos.y,
    tf.position[2] + _localPos.z
  );
}
