import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface SpikeDef {
  x: number;
  z: number;
  height: number;
  radius: number;
  rotX: number;
  rotZ: number;
  segments: number;
}

interface ShardDef {
  x: number;
  y: number;
  z: number;
  size: number;
  rotSpeed: number;
  bobPhase: number;
  bobSpeed: number;
}

/**
 * Procedural 3D Ground Spikes:
 * - Sharp triangular / crystal obsidian monoliths rising from the ground at dynamic angles.
 * - Deep dark blue / charcoal obsidian materials with specular edge highlights.
 * - Central dramatic backlight / luminescent aura behind and between the spikes.
 * - Floating geometric fragments / angular shards with subtle bobbing and slow rotation.
 * - Procedural 3D cone/prism geometries with clean normals and depth.
 */
export const GroundSpikes: React.FC<{
  radius?: number;
  intensity?: number;
}> = ({ radius = 6.0, intensity = 1.0 }) => {
  const shardsGroupRef = useRef<THREE.Group>(null);

  // Obsidian dark charcoal / midnight blue crystalline material with sharp specular highlights
  const spikeMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x111625, // Deep obsidian midnight navy
      roughness: 0.28,
      metalness: 0.8,
      flatShading: true, // Enhances faceted crystal look
    });
  }, []);

  // Luminescent Edge Accent Material for focal monoliths
  const accentSpikeMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x1a233a,
      emissive: 0x1e3a8a, // Subtle royal blue luminescent edge glow
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.85,
      flatShading: true,
    });
  }, []);

  // Floating crystalline shard material
  const shardMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.9,
      flatShading: true,
    });
  }, []);

  // Monolith ground spikes layout arranged behind and around the stage perimeter
  const spikes: SpikeDef[] = useMemo(() => {
    return [
      // Central dramatic rear spine (tallest)
      { x: 0.0, z: -5.8, height: 7.2, radius: 0.75, rotX: 0.12, rotZ: 0.0, segments: 4 },
      { x: -1.4, z: -5.4, height: 5.8, radius: 0.6, rotX: 0.18, rotZ: -0.15, segments: 4 },
      { x: 1.4, z: -5.4, height: 6.1, radius: 0.62, rotX: 0.16, rotZ: 0.14, segments: 4 },

      // Mid flanking spikes
      { x: -3.2, z: -4.5, height: 4.8, radius: 0.52, rotX: 0.22, rotZ: -0.28, segments: 3 },
      { x: 3.2, z: -4.5, height: 5.0, radius: 0.54, rotX: 0.2, rotZ: 0.26, segments: 3 },

      // Outer lateral wings
      { x: -5.0, z: -3.2, height: 3.8, radius: 0.48, rotX: 0.15, rotZ: -0.35, segments: 4 },
      { x: 5.0, z: -3.2, height: 4.0, radius: 0.5, rotX: 0.14, rotZ: 0.32, segments: 4 },

      // Secondary layered cluster spikes
      { x: -0.6, z: -4.2, height: 3.2, radius: 0.4, rotX: 0.08, rotZ: -0.1, segments: 3 },
      { x: 0.8, z: -4.3, height: 3.4, radius: 0.42, rotX: 0.09, rotZ: 0.12, segments: 4 },
      { x: -2.2, z: -3.6, height: 2.6, radius: 0.35, rotX: 0.14, rotZ: -0.2, segments: 3 },
      { x: 2.4, z: -3.7, height: 2.8, radius: 0.38, rotX: 0.12, rotZ: 0.18, segments: 3 },

      // Front low accent spikes (flanking front corners outside character space)
      { x: -4.8, z: 0.5, height: 2.2, radius: 0.32, rotX: -0.1, rotZ: -0.4, segments: 3 },
      { x: 4.8, z: 0.5, height: 2.4, radius: 0.34, rotX: -0.1, rotZ: 0.38, segments: 3 },
    ];
  }, []);

  // Floating geometric shards
  const shards: ShardDef[] = useMemo(() => {
    return [
      { x: -1.2, y: 3.8, z: -4.8, size: 0.35, rotSpeed: 0.6, bobPhase: 0.0, bobSpeed: 1.2 },
      { x: 1.5, y: 4.2, z: -4.5, size: 0.42, rotSpeed: -0.5, bobPhase: 1.5, bobSpeed: 1.0 },
      { x: -2.8, y: 3.2, z: -3.8, size: 0.3, rotSpeed: 0.8, bobPhase: 2.8, bobSpeed: 1.4 },
      { x: 2.6, y: 3.4, z: -3.6, size: 0.38, rotSpeed: -0.7, bobPhase: 4.2, bobSpeed: 1.1 },
      { x: 0.2, y: 5.6, z: -5.2, size: 0.45, rotSpeed: 0.4, bobPhase: 0.8, bobSpeed: 0.9 },
      { x: -3.8, y: 2.5, z: -2.8, size: 0.28, rotSpeed: 0.9, bobPhase: 3.4, bobSpeed: 1.5 },
      { x: 3.9, y: 2.7, z: -2.6, size: 0.32, rotSpeed: -0.85, bobPhase: 5.0, bobSpeed: 1.3 },
    ];
  }, []);

  // Subtle floating animation for fragments
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (shardsGroupRef.current) {
      shardsGroupRef.current.children.forEach((child, idx) => {
        const def = shards[idx];
        if (def) {
          child.rotation.x = t * def.rotSpeed * 0.5;
          child.rotation.y = t * def.rotSpeed;
          child.position.y = def.y + Math.sin(t * def.bobSpeed + def.bobPhase) * 0.15;
        }
      });
    }
  });

  return (
    <group name="Scenery_GroundSpikes">
      {/* 1. Monolith Ground Spikes */}
      {spikes.map((s, idx) => (
        <mesh
          key={idx}
          position={[s.x, s.height / 2 - 0.2, s.z]}
          rotation={[s.rotX, 0, s.rotZ]}
          castShadow
          receiveShadow
        >
          <coneGeometry args={[s.radius, s.height, s.segments]} />
          <primitive
            object={idx < 3 ? accentSpikeMaterial : spikeMaterial}
            attach="material"
          />
        </mesh>
      ))}

      {/* 2. Floating Shards Group */}
      <group ref={shardsGroupRef}>
        {shards.map((sh, idx) => (
          <mesh
            key={idx}
            position={[sh.x, sh.y, sh.z]}
            castShadow
          >
            <octahedronGeometry args={[sh.size, 0]} />
            <primitive object={shardMaterial} attach="material" />
          </mesh>
        ))}
      </group>

      {/* 3. Central Dramatic Backlight Aura behind the Spikes */}
      <pointLight
        position={[0, 4.0, -6.5]}
        color="#38bdf8" // Vibrant electric sky blue aura
        intensity={2.8 * intensity}
        distance={16.0}
        decay={2}
      />

      {/* Deep Violet Secondary Rim Light */}
      <directionalLight
        position={[0, 5.0, -8.0]}
        color="#6366f1"
        intensity={1.2 * intensity}
      />
    </group>
  );
};

export default GroundSpikes;
