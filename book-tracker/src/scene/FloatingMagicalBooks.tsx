import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArchiveMaterialLibrary } from './proceduralMaterials';
import type { ArchiveQualitySettings } from './qualityConfig';

interface FloatingBookSpec {
  basePos: [number, number, number];
  baseRot: [number, number, number];
  size: [number, number, number]; // width, height, depth
  color: string;
  ampY: number;
  speed: number;
  phase: number;
  tiltAmp: number;
  minTier: 'performance' | 'balanced' | 'high';
}

/**
 * Curated non-interactive decorative books hovering gracefully around Left, Middle,
 * and Right bookcases. Kept strictly clear of real shelf spines, bookcase raycast planes,
 * and the desk workstation path.
 */
const FLOATING_BOOK_SPECS: FloatingBookSpec[] = [
  // Above & flanking Left Shelf (left bookcase at [-2.35, 0..2.46, -1.18])
  {
    basePos: [-2.12, 2.74, -0.84],
    baseRot: [0.14, 0.62, -0.08],
    size: [0.038, 0.24, 0.19],
    color: '#294466',
    ampY: 0.045,
    speed: 0.85,
    phase: 0.2,
    tiltAmp: 0.055,
    minTier: 'performance',
  },
  {
    basePos: [-1.42, 2.54, -2.02],
    baseRot: [-0.12, 0.42, 0.09],
    size: [0.034, 0.22, 0.175],
    color: '#5a262f',
    ampY: 0.04,
    speed: 0.72,
    phase: 1.9,
    tiltAmp: 0.05,
    minTier: 'balanced',
  },
  {
    basePos: [-2.82, 2.24, -0.34],
    baseRot: [0.08, 0.78, -0.1],
    size: [0.042, 0.26, 0.2],
    color: '#1e4a3b',
    ampY: 0.048,
    speed: 0.68,
    phase: 3.4,
    tiltAmp: 0.048,
    minTier: 'high',
  },

  // Above & flanking Middle Shelf (middle bookcase at [0, 0..2.46, -3.38])
  {
    basePos: [-0.88, 2.78, -3.08],
    baseRot: [-0.11, 0.28, 0.07],
    size: [0.04, 0.25, 0.195],
    color: '#432d57',
    ampY: 0.046,
    speed: 0.78,
    phase: 2.6,
    tiltAmp: 0.052,
    minTier: 'performance',
  },
  {
    basePos: [0.92, 2.74, -3.12],
    baseRot: [0.15, -0.34, -0.09],
    size: [0.036, 0.23, 0.18],
    color: '#6b4728',
    ampY: 0.042,
    speed: 0.9,
    phase: 4.1,
    tiltAmp: 0.05,
    minTier: 'balanced',
  },
  {
    basePos: [-1.24, 2.18, -3.14],
    baseRot: [0.09, 0.48, -0.06],
    size: [0.033, 0.21, 0.17],
    color: '#25525a',
    ampY: 0.038,
    speed: 0.82,
    phase: 5.0,
    tiltAmp: 0.044,
    minTier: 'high',
  },
  {
    basePos: [1.26, 2.24, -3.1],
    baseRot: [-0.13, -0.44, 0.08],
    size: [0.038, 0.24, 0.185],
    color: '#4f273c',
    ampY: 0.044,
    speed: 0.74,
    phase: 0.9,
    tiltAmp: 0.046,
    minTier: 'high',
  },

  // Above & flanking Right Shelf (right bookcase at [2.35, 0..2.46, -1.18])
  {
    basePos: [2.12, 2.74, -0.84],
    baseRot: [-0.13, -0.62, 0.08],
    size: [0.038, 0.24, 0.19],
    color: '#2a3c59',
    ampY: 0.045,
    speed: 0.81,
    phase: 3.1,
    tiltAmp: 0.055,
    minTier: 'performance',
  },
  {
    basePos: [1.44, 2.52, -2.02],
    baseRot: [0.11, -0.44, -0.08],
    size: [0.034, 0.22, 0.175],
    color: '#5b3c22',
    ampY: 0.04,
    speed: 0.76,
    phase: 1.1,
    tiltAmp: 0.05,
    minTier: 'balanced',
  },
  {
    basePos: [2.8, 2.26, -0.36],
    baseRot: [-0.09, -0.78, 0.09],
    size: [0.041, 0.255, 0.198],
    color: '#1f444d',
    ampY: 0.046,
    speed: 0.7,
    phase: 4.8,
    tiltAmp: 0.048,
    minTier: 'high',
  },
];

const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const _bandOffset = new THREE.Vector3();
const _color = new THREE.Color();
const NOOP_RAYCAST = () => null;

export function FloatingMagicalBooks({
  materials,
  quality,
  shadowsEnabled,
}: {
  materials: ArchiveMaterialLibrary;
  quality: ArchiveQualitySettings;
  shadowsEnabled: boolean;
}) {
  const { invalidate } = useThree();
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const pagesRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);

  const unitBoxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => {
    return () => {
      unitBoxGeo.dispose();
    };
  }, [unitBoxGeo]);

  const activeSpecs = useMemo(() => {
    if (quality.tier === 'high') return FLOATING_BOOK_SPECS;
    if (quality.tier === 'balanced') {
      return FLOATING_BOOK_SPECS.filter(
        (b) => b.minTier === 'performance' || b.minTier === 'balanced'
      );
    }
    return FLOATING_BOOK_SPECS.filter((b) => b.minTier === 'performance');
  }, [quality.tier]);

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const shouldAnimate =
    !reducedMotion &&
    !quality.isSoftwareGl &&
    quality.tier !== 'performance';

  const applyPoseAtTime = (elapsed: number) => {
    const body = bodyRef.current;
    const pages = pagesRef.current;
    const band = bandRef.current;
    if (!body || !pages || !band) return;

    const count = activeSpecs.length;
    body.count = count;
    pages.count = count;
    band.count = count;

    for (let i = 0; i < count; i++) {
      const b = activeSpecs[i];
      const wave = Math.sin(elapsed * b.speed + b.phase);
      const wave2 = Math.cos(elapsed * b.speed * 0.74 + b.phase * 1.3);

      const y = b.basePos[1] + wave * b.ampY;
      _euler.set(
        b.baseRot[0] + wave2 * b.tiltAmp,
        b.baseRot[1] + Math.sin(elapsed * 0.32 + b.phase) * 0.08,
        b.baseRot[2] + wave * b.tiltAmp * 0.85
      );
      _quat.setFromEuler(_euler);

      const [w, h, d] = b.size;
      _pos.set(b.basePos[0], y, b.basePos[2]);
      _scale.set(w, h, d);
      _mat.compose(_pos, _quat, _scale);
      body.setMatrixAt(i, _mat);

      _scale.set(w * 0.78, h * 0.96, d * 0.95);
      _mat.compose(_pos, _quat, _scale);
      pages.setMatrixAt(i, _mat);

      _bandOffset.set(0, h * 0.28, d * 0.502).applyQuaternion(_quat);
      _pos.set(
        b.basePos[0] + _bandOffset.x,
        y + _bandOffset.y,
        b.basePos[2] + _bandOffset.z
      );
      _scale.set(w * 0.96, 0.011, 0.004);
      _mat.compose(_pos, _quat, _scale);
      band.setMatrixAt(i, _mat);
    }

    body.instanceMatrix.needsUpdate = true;
    pages.instanceMatrix.needsUpdate = true;
    band.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    for (let i = 0; i < activeSpecs.length; i++) {
      _color.set(activeSpecs[i].color);
      body.setColorAt(i, _color);
    }
    if (body.instanceColor) {
      body.instanceColor.needsUpdate = true;
    }
    applyPoseAtTime(0.4);
    invalidate();
  }, [activeSpecs, invalidate]);

  useFrame((state) => {
    if (!shouldAnimate) return;
    applyPoseAtTime(state.clock.elapsedTime);
    invalidate();
  });

  const maxCount = FLOATING_BOOK_SPECS.length;

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[unitBoxGeo, materials.bookBodyMat, maxCount]}
        frustumCulled={false}
        castShadow={shadowsEnabled}
        raycast={NOOP_RAYCAST}
      />
      <instancedMesh
        ref={pagesRef}
        args={[unitBoxGeo, materials.bookPagesMat, maxCount]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
      />
      <instancedMesh
        ref={bandRef}
        args={[unitBoxGeo, materials.bookGoldBandMat, maxCount]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
      />
    </group>
  );
}
