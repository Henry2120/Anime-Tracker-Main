import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Procedural Gothic Glass Chapel / Pavilion:
 * - Structural crystalline arches, vaulted ribs, slender Gothic columns.
 * - Polished translucent reflective glass floor with subtle refractive qualities.
 * - Stained glass rose window / ceiling apex motif casting soft prismatic color.
 * - Open frontal aperture so the camera has completely unobstructed view of performers.
 */
export const GlassChapel: React.FC<{ scale?: number }> = ({ scale = 1.0 }) => {
  // Translucent structural glass material with physical PBR properties
  const glassMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe, // Crystal pale sky blue
      transmission: 0.82, // Highly translucent glass
      opacity: 0.95,
      transparent: true,
      roughness: 0.08, // Highly polished specular reflections
      metalness: 0.1,
      ior: 1.52, // Standard crown glass index of refraction
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Frame / Column Material: Elegant polished platinum / frosted chrome structural ribbing
  const frameMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      metalness: 0.85,
      roughness: 0.22,
    });
  }, []);

  // Stained Glass Accent Material for the high apse / rose window
  const stainedGlassMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.35,
      transmission: 0.6,
      transparent: true,
      roughness: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Floor Material: Polished mirror-like crystal glass floor slab
  const floorGlassMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.05,
      metalness: 0.4,
      transmission: 0.35,
      transparent: true,
      opacity: 0.88,
      reflectivity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
    });
  }, []);

  // Arched rib positions along the nave (flanking the sides, leaving the front wide open)
  const arches = useMemo(() => {
    const list: { z: number; span: number; height: number }[] = [];
    const zOffsets = [-6, -3, 0, 3];
    zOffsets.forEach((z) => {
      list.push({ z, span: 5.2, height: 6.8 });
    });
    return list;
  }, []);

  return (
    <group name="Scenery_GlassChapel" scale={[scale, scale, scale]} position={[0, 0, 0]}>
      {/* 1. Translucent Polished Glass Floor Slab */}
      <mesh position={[0, -0.02, -1.5]} receiveShadow>
        <cylinderGeometry args={[7.5, 7.8, 0.06, 32]} />
        <primitive object={floorGlassMaterial} attach="material" />
      </mesh>

      {/* Decorative Outer Metal Rim around Floor */}
      <mesh position={[0, -0.01, -1.5]}>
        <ringGeometry args={[7.4, 7.8, 48]} />
        <meshStandardMaterial color={0x94a3b8} metalness={0.9} roughness={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* 2. Gothic Arched Structural Ribs & Columns */}
      {arches.map((arch, i) => (
        <group key={i} position={[0, 0, arch.z]}>
          {/* Left Slender Pillar */}
          <mesh position={[-arch.span / 2, arch.height / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.07, 0.09, arch.height, 16]} />
            <primitive object={frameMaterial} attach="material" />
          </mesh>

          {/* Right Slender Pillar */}
          <mesh position={[arch.span / 2, arch.height / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.07, 0.09, arch.height, 16]} />
            <primitive object={frameMaterial} attach="material" />
          </mesh>

          {/* Left Arched Roof Rib */}
          <mesh
            position={[-arch.span / 4, arch.height + 0.6, 0]}
            rotation={[0, 0, -Math.PI / 6]}
            castShadow
          >
            <cylinderGeometry args={[0.06, 0.06, arch.span * 0.68, 16]} />
            <primitive object={frameMaterial} attach="material" />
          </mesh>

          {/* Right Arched Roof Rib */}
          <mesh
            position={[arch.span / 4, arch.height + 0.6, 0]}
            rotation={[0, 0, Math.PI / 6]}
            castShadow
          >
            <cylinderGeometry args={[0.06, 0.06, arch.span * 0.68, 16]} />
            <primitive object={frameMaterial} attach="material" />
          </mesh>

          {/* Translucent Glass Canopy Panel between arch ribs */}
          {i < arches.length - 1 && (
            <group position={[0, 0, 1.5]}>
              {/* Left Pitch Glass */}
              <mesh
                position={[-arch.span / 4, arch.height + 0.6, 0]}
                rotation={[0, 0, -Math.PI / 6]}
              >
                <boxGeometry args={[0.02, arch.span * 0.66, 2.9]} />
                <primitive object={glassMaterial} attach="material" />
              </mesh>
              {/* Right Pitch Glass */}
              <mesh
                position={[arch.span / 4, arch.height + 0.6, 0]}
                rotation={[0, 0, Math.PI / 6]}
              >
                <boxGeometry args={[0.02, arch.span * 0.66, 2.9]} />
                <primitive object={glassMaterial} attach="material" />
              </mesh>
            </group>
          )}
        </group>
      ))}

      {/* 3. Rear Glass Apse & Stained Glass Rose Motif at z = -7.5 */}
      <group position={[0, 3.8, -7.5]}>
        {/* Rear Wall Glass Pane */}
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[5.2, 7.6]} />
          <primitive object={glassMaterial} attach="material" />
        </mesh>

        {/* Circular Rose Window Ring */}
        <mesh position={[0, 1.8, 0.02]}>
          <torusGeometry args={[1.4, 0.06, 16, 48]} />
          <primitive object={frameMaterial} attach="material" />
        </mesh>

        {/* Stained Glass Rose Center */}
        <mesh position={[0, 1.8, 0.01]}>
          <circleGeometry args={[1.38, 32]} />
          <primitive object={stainedGlassMaterial} attach="material" />
        </mesh>

        {/* Delicate Radial Mullions */}
        {[0, 30, 60, 90, 120, 150].map((deg) => (
          <mesh
            key={deg}
            position={[0, 1.8, 0.03]}
            rotation={[0, 0, (deg * Math.PI) / 180]}
          >
            <boxGeometry args={[2.7, 0.03, 0.02]} />
            <primitive object={frameMaterial} attach="material" />
          </mesh>
        ))}
      </group>

      {/* 4. Soft Celestial Accent Lighting inside Chapel */}
      <pointLight
        position={[0, 6.2, -3]}
        color="#dbeafe"
        intensity={0.8}
        distance={18}
        decay={2}
      />
      <pointLight
        position={[0, 3.5, -7.0]}
        color="#60a5fa"
        intensity={0.9}
        distance={12}
        decay={2}
      />
    </group>
  );
};

export default GlassChapel;
