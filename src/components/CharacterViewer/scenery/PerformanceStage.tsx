import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Concert Performance Stage:
 * - Multi-tier geometric concert platform centered under character feet.
 * - Upper tier at y = 0 for perfect character foot placement without clipping.
 * - Beveled lower tier with perimeter neon runner strip and brushed aluminum bevel rim.
 * - Polished dark acoustic concert floor with subtle specular sheen and stage floor markings.
 */
export const PerformanceStage: React.FC<{
  radius?: number;
  neonColor?: string;
}> = ({ radius = 4.2, neonColor = '#7567C7' }) => {
  // Polished concert acrylic stage floor material
  const stageFloorMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x181820,
      roughness: 0.22,
      metalness: 0.35,
    });
  }, []);

  // Brushed aluminum stage rim material
  const rimMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.9,
      roughness: 0.3,
    });
  }, []);

  // Luminous LED perimeter light strip material
  const neonMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: neonColor,
    });
  }, [neonColor]);

  // Secondary sub-tier floor
  const subTierMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x0f1117,
      roughness: 0.4,
      metalness: 0.2,
    });
  }, []);

  return (
    <group name="Scenery_PerformanceStage">
      {/* 1. Main Upper Stage Platform (y = 0 flush top surface) */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.12, 0.12, 48]} />
        <primitive object={stageFloorMaterial} attach="material" />
      </mesh>

      {/* Outer Metallic Bevel Ring on upper tier */}
      <mesh position={[0, -0.058, 0]}>
        <ringGeometry args={[radius - 0.08, radius + 0.12, 48]} />
        <primitive object={rimMaterial} attach="material" />
      </mesh>

      {/* Radiant Neon LED Perimeter Glow Strip */}
      <mesh position={[0, -0.055, 0]}>
        <ringGeometry args={[radius - 0.16, radius - 0.08, 48]} />
        <primitive object={neonMaterial} attach="material" />
      </mesh>

      {/* Decorative Center Acoustic Resonance Disc */}
      <mesh position={[0, -0.057, 0]}>
        <ringGeometry args={[1.2, 1.25, 36]} />
        <meshBasicMaterial color={0x94a3b8} opacity={0.4} transparent />
      </mesh>

      {/* 2. Lower Stepped Plinth Base (wider step down at y = -0.16) */}
      <mesh position={[0, -0.18, 0]} receiveShadow>
        <cylinderGeometry args={[radius + 0.8, radius + 1.0, 0.12, 48]} />
        <primitive object={subTierMaterial} attach="material" />
      </mesh>

      {/* Lower Plinth LED Accent Strip */}
      <mesh position={[0, -0.178, 0]}>
        <ringGeometry args={[radius + 0.72, radius + 0.8, 48]} />
        <meshBasicMaterial color={neonColor} />
      </mesh>

      {/* 3. Stage Footing Spotlights (4 perimeter angled mini-spotlights) */}
      {[
        [-radius * 0.7, -radius * 0.7],
        [radius * 0.7, -radius * 0.7],
        [-radius * 0.7, radius * 0.7],
        [radius * 0.7, radius * 0.7],
      ].map(([x, z], i) => (
        <group key={i} position={[x, -0.06, z]}>
          {/* Fixture casing */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 0.08, 16]} />
            <meshStandardMaterial color={0x334155} metalness={0.9} />
          </mesh>
          {/* Upward stage rim glow */}
          <pointLight
            position={[0, 0.15, 0]}
            color={neonColor}
            intensity={0.4}
            distance={2.5}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
};

export default PerformanceStage;
