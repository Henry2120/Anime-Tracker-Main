import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Procedural Burning Fire & Embers Effect:
 * - Animated particle simulation of dancing flames and rising embers.
 * - Dynamic color decay: brilliant white-yellow core -> incandescent orange -> ruby crimson -> cinder ash.
 * - Organic turbulent upward convection using sinusoidal noise.
 * - Realistic flickering warm point light illuminating surroundings.
 * - Clean disposal and fixed bounded particle buffers (80 flame particles + 70 ember sparks).
 */
export const BurningFire: React.FC<{
  position?: [number, number, number];
  intensity?: number;
  scale?: number;
}> = ({ position = [0, 0, -3.2], intensity = 1.0, scale = 1.0 }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const flameParticlesRef = useRef<THREE.Points>(null);
  const emberParticlesRef = useRef<THREE.Points>(null);

  // 1. Procedural Flame Core Sprite Texture
  const flameTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)'); // Intense white core
    grad.addColorStop(0.25, 'rgba(254, 215, 64, 0.9)'); // Brilliant golden yellow
    grad.addColorStop(0.55, 'rgba(249, 115, 22, 0.6)'); // Warm orange flame
    grad.addColorStop(0.82, 'rgba(220, 38, 38, 0.25)'); // Crimson fringe
    grad.addColorStop(1.0, 'rgba(153, 27, 27, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  // 2. Procedural Glowing Ember Spark Sprite Texture
  const emberTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0.0, 'rgba(255, 240, 180, 1.0)');
    grad.addColorStop(0.35, 'rgba(251, 146, 60, 0.85)');
    grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.3)');
    grad.addColorStop(1.0, 'rgba(185, 28, 28, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  // Clean disposal of textures on unmount
  useEffect(() => {
    return () => {
      flameTexture?.dispose();
      emberTexture?.dispose();
    };
  }, [flameTexture, emberTexture]);

  // Flame particle count & persistent state
  const FLAME_COUNT = 85;
  const flameData = useMemo(() => {
    const pos = new Float32Array(FLAME_COUNT * 3);
    const life = new Float32Array(FLAME_COUNT);
    const speed = new Float32Array(FLAME_COUNT);
    const offsets = new Float32Array(FLAME_COUNT);

    for (let i = 0; i < FLAME_COUNT; i++) {
      life[i] = Math.random();
      speed[i] = 0.8 + Math.random() * 0.9;
      offsets[i] = Math.random() * Math.PI * 2;

      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.45;
      pos[i * 3 + 0] = Math.cos(angle) * r;
      pos[i * 3 + 1] = life[i] * 1.6;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }

    return { pos, life, speed, offsets };
  }, []);

  // Ember particle count & persistent state
  const EMBER_COUNT = 65;
  const emberData = useMemo(() => {
    const pos = new Float32Array(EMBER_COUNT * 3);
    const life = new Float32Array(EMBER_COUNT);
    const speed = new Float32Array(EMBER_COUNT);
    const angle = new Float32Array(EMBER_COUNT);

    for (let i = 0; i < EMBER_COUNT; i++) {
      life[i] = Math.random();
      speed[i] = 1.0 + Math.random() * 1.2;
      angle[i] = Math.random() * Math.PI * 2;

      const r = Math.random() * 0.5;
      pos[i * 3 + 0] = Math.cos(angle[i]) * r;
      pos[i * 3 + 1] = life[i] * 3.5;
      pos[i * 3 + 2] = Math.sin(angle[i]) * r;
    }

    return { pos, life, speed, angle };
  }, []);

  // Per-frame animation: convective lift, sinusoidal curl, and light flicker
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const clampedDelta = Math.min(delta, 0.05);

    // 1. Animate Flame Particles
    if (flameParticlesRef.current) {
      const geo = flameParticlesRef.current.geometry;
      const posAttr = geo.attributes.position;
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i < FLAME_COUNT; i++) {
        flameData.life[i] += clampedDelta * flameData.speed[i];
        if (flameData.life[i] > 1.0) {
          flameData.life[i] = 0.0;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 0.35;
          arr[i * 3 + 0] = Math.cos(a) * r;
          arr[i * 3 + 1] = 0.0;
          arr[i * 3 + 2] = Math.sin(a) * r;
        } else {
          // Upward lift
          arr[i * 3 + 1] += clampedDelta * flameData.speed[i] * 1.8;
          // Convective inward/curl taper
          const progress = flameData.life[i];
          const wobble = Math.sin(t * 5 + flameData.offsets[i]) * 0.04 * (1 - progress);
          arr[i * 3 + 0] += wobble;
          arr[i * 3 + 2] += Math.cos(t * 4 + flameData.offsets[i]) * 0.03 * (1 - progress);
        }
      }
      posAttr.needsUpdate = true;
    }

    // 2. Animate Rising Sparks / Embers
    if (emberParticlesRef.current) {
      const geo = emberParticlesRef.current.geometry;
      const posAttr = geo.attributes.position;
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i < EMBER_COUNT; i++) {
        emberData.life[i] += clampedDelta * emberData.speed[i] * 0.45;
        if (emberData.life[i] > 1.0) {
          emberData.life[i] = 0.0;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.4;
          arr[i * 3 + 0] = Math.cos(a) * r;
          arr[i * 3 + 1] = 0.1;
          arr[i * 3 + 2] = Math.sin(a) * r;
        } else {
          arr[i * 3 + 1] += clampedDelta * emberData.speed[i] * 1.5;
          // Turbulent spiral drift
          arr[i * 3 + 0] += Math.sin(t * 3 + i) * 0.02;
          arr[i * 3 + 2] += Math.cos(t * 2.8 + i) * 0.02;
        }
      }
      posAttr.needsUpdate = true;
    }

    // 3. Dynamic Organic Firelight Flicker
    if (lightRef.current) {
      const flicker1 = Math.sin(t * 12.0) * 0.18;
      const flicker2 = Math.cos(t * 23.0) * 0.12;
      const flicker3 = Math.sin(t * 37.0) * 0.06;
      lightRef.current.intensity = (1.8 + flicker1 + flicker2 + flicker3) * intensity;
    }
  });

  return (
    <group name="Scenery_BurningFire" position={position} scale={[scale, scale, scale]}>
      {/* Fire Pit Hearth / Charcoal Brazier Base */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.12, 16]} />
        <meshStandardMaterial color={0x1e293b} roughness={0.9} metalness={0.2} />
      </mesh>

      {/* Burning Coals Core Disc */}
      <mesh position={[0, 0.12, 0]}>
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial color={0xff4500} />
      </mesh>

      {/* 1. Main Dancing Flame Particles */}
      <points ref={flameParticlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[flameData.pos, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.65 * scale}
          map={flameTexture || undefined}
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* 2. Rising Hot Embers / Spark Particles */}
      <points ref={emberParticlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[emberData.pos, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.16 * scale}
          map={emberTexture || undefined}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* 3. Dynamic Flickering Point Light (Warm Amber Flame) */}
      <pointLight
        ref={lightRef}
        position={[0, 0.8, 0]}
        color="#ff7a18"
        intensity={2.0 * intensity}
        distance={9.0}
        decay={2}
        castShadow
        shadow-bias={-0.002}
      />

      {/* Secondary Soft Ruby Glow around the base */}
      <pointLight
        position={[0, 0.2, 0]}
        color="#ef4444"
        intensity={0.9 * intensity}
        distance={4.0}
        decay={2}
      />
    </group>
  );
};

export default BurningFire;
