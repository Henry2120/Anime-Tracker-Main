import * as THREE from 'three';
import { InstrumentProfile } from './InstrumentProfile';
import { HumanoidMetrics } from '../core/types';

/**
 * Canonical Violin Instrument Profile
 * Describes standalone violin.glb and bow.glb in local instrument coordinates.
 * In SI units (meters).
 */
export const ViolinProfile: InstrumentProfile = {
  id: 'violin',
  name: 'Violin',
  category: 'strings',
  modelPath: '/music-lab/instruments/violin.glb',
  accessoryModelPath: '/music-lab/instruments/bow.glb',

  dimensions: {
    length: 0.605, // 60.5 cm
    width: 0.213,  // 21.3 cm
    depth: 0.085,  // 8.5 cm
  },

  localAnchors: {
    bodyCenter: new THREE.Vector3(0.000, 0.160, 0.000),
    chinRest: new THREE.Vector3(0.045, 0.085, 0.025),
    shoulderSupport: new THREE.Vector3(0.000, 0.050, -0.045),
    neckTarget: new THREE.Vector3(0.000, 0.404, -0.015),
    leftHandTarget: new THREE.Vector3(0.000, 0.380, -0.018), // Neck cradle underside
    bowContactTarget: new THREE.Vector3(0.000, 0.200, 0.038), // Sounding point on strings
    bridge: new THREE.Vector3(0.000, 0.161, 0.042),
    scrollTip: new THREE.Vector3(0.000, 0.599, -0.039),
  },

  axes: {
    longitudinal: new THREE.Vector3(0, 1, 0), // Base to scroll
    upNormal: new THREE.Vector3(0, 0, 1),     // Strings / top plate normal
    lateral: new THREE.Vector3(1, 0, 0),      // Chinrest side
  },

  accessory: {
    name: 'Violin Bow',
    dimensions: {
      length: 0.776, // 77.6 cm
      width: 0.025,
      depth: 0.052,
    },
    localAnchors: {
      gripCenter: new THREE.Vector3(0.000, -0.255, 0.048), // Frog throat grip canal
      frogCenter: new THREE.Vector3(0.000, -0.310, 0.042),
      contactPoint: new THREE.Vector3(0.000, 0.020, 0.0373), // Sounding ribbon point
      tip: new THREE.Vector3(0.000, 0.400, 0.046),
    },
    axes: {
      longitudinal: new THREE.Vector3(0, 1, 0), // Frog to tip
      hairDirection: new THREE.Vector3(0, 0, -1), // Directed towards strings
      lateral: new THREE.Vector3(1, 0, 0),
    },
  },

  /**
   * Proportion-aware scale solver:
   * Considers arm reach, shoulder width, hand length, torso length, and chibi proportion flags.
   */
  calculateCandidateScale(metrics: HumanoidMetrics): number {
    // Standard adult baseline: reach ~0.65m, shoulder ~0.38m, torso ~0.48m
    const leftReach = metrics.armReach.left;
    const reachRatio = leftReach / 0.65;
    const shoulderRatio = metrics.shoulderWidth / 0.38;
    const torsoRatio = metrics.torsoLength / 0.48;

    // Weighted blend favoring functional reach (65%) and body frame (35%)
    let scale = reachRatio * 0.65 + ((shoulderRatio + torsoRatio) / 2) * 0.35;

    // Chibi adjustment: prevent miniature characters from being overwhelmed by a giant instrument
    if (metrics.isChibi) {
      scale = THREE.MathUtils.clamp(scale * 0.88, 0.52, 0.85);
    } else {
      scale = THREE.MathUtils.clamp(scale, 0.65, 1.15);
    }

    return parseFloat(scale.toFixed(3));
  },
};
