import * as THREE from 'three';
import { HumanoidMetrics, Transform3D } from '../core/types';

/**
 * Reusable Instrument Interaction Profile Abstraction.
 * Enables supporting any instrument (Violin, Guitar, Flute, Cello, Piano, etc.)
 * by describing local interaction geometry independently of world coordinates.
 */
export interface InstrumentProfile {
  id: string;
  name: string;
  category: 'strings' | 'woodwind' | 'brass' | 'keyboard' | 'percussion';
  modelPath: string;
  accessoryModelPath?: string;

  /** Canonical dimensions in meters (scale 1.0) */
  dimensions: {
    length: number;
    width: number;
    depth: number;
  };

  /** Local instrument-space anchor points (in meters) */
  localAnchors: {
    bodyCenter: THREE.Vector3;
    chinRest?: THREE.Vector3;
    neckTarget?: THREE.Vector3;
    leftHandTarget?: THREE.Vector3;
    bowGripTarget?: THREE.Vector3;
    bowContactTarget?: THREE.Vector3;
    [key: string]: THREE.Vector3 | undefined;
  };

  /** Local axes */
  axes: {
    longitudinal: THREE.Vector3; // along the instrument body/neck
    upNormal: THREE.Vector3;     // facing strings/key surface
    lateral: THREE.Vector3;      // lateral cross-axis
  };

  /** Accessory local geometry (e.g. Bow for Violin, Plectrum for Guitar) */
  accessory?: {
    name: string;
    dimensions: {
      length: number;
      width: number;
      depth: number;
    };
    localAnchors: {
      gripCenter: THREE.Vector3;
      frogCenter?: THREE.Vector3;
      contactPoint: THREE.Vector3;
      tip: THREE.Vector3;
    };
    axes: {
      longitudinal: THREE.Vector3;
      hairDirection: THREE.Vector3;
      lateral: THREE.Vector3;
    };
  };

  /**
   * Calculates candidate scale of this instrument suited for character's proportions
   */
  calculateCandidateScale(metrics: HumanoidMetrics): number;
}
