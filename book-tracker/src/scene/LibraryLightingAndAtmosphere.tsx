import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ArchiveQualitySettings } from './qualityConfig';

interface LibraryLightingAndAtmosphereProps {
  lanternWarmth: boolean;
  quality: ArchiveQualitySettings;
}

const ROOM_BG_COLOR = '#080d18';

export function LibraryLightingAndAtmosphere({
  lanternWarmth,
  quality,
}: LibraryLightingAndAtmosphereProps) {
  const { gl, scene, invalidate } = useThree();
  const dirLightRef = useRef<THREE.DirectionalLight>(null);

  // Mandatory procedural RoomEnvironment for brass, monitor glass, and wood sheen
  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.36;
    scene.background = new THREE.Color(ROOM_BG_COLOR);
    scene.fog = new THREE.FogExp2(ROOM_BG_COLOR, 0.045);

    roomEnv.dispose();
    pmremGenerator.dispose();
    invalidate();

    return () => {
      if (scene.environment === envTarget.texture) {
        scene.environment = null;
      }
      envTarget.dispose();
    };
  }, [gl, scene, invalidate]);

  useEffect(() => {
    invalidate();
  }, [lanternWarmth, quality, invalidate]);

  // Bounded static/gentle dust motes geometry (1 draw call)
  const particleGeometry = useMemo(() => {
    const count = Math.max(4, quality.particleCount);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const gold = new THREE.Color('#d6bd8a');
    const moon = new THREE.Color('#88aee8');

    for (let i = 0; i < count; i++) {
      // Deterministic pseudo-random spread inside room volume
      const s1 = Math.sin(i * 12.9898) * 43758.5453;
      const s2 = Math.sin(i * 78.233 + 1.7) * 24634.6345;
      const s3 = Math.sin(i * 39.425 + 3.1) * 19283.4812;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      const r3 = s3 - Math.floor(s3);

      positions[i * 3] = (r1 - 0.5) * 6.4;
      positions[i * 3 + 1] = 0.8 + r2 * 2.7;
      positions[i * 3 + 2] = -3.4 + r3 * 4.4;

      const c = i % 3 === 0 ? moon : gold;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [quality.particleCount]);

  useEffect(() => {
    return () => {
      particleGeometry.dispose();
    };
  }, [particleGeometry]);

  const particleMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.028,
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    []
  );

  useEffect(() => {
    return () => {
      particleMaterial.dispose();
    };
  }, [particleMaterial]);

  return (
    <>
      {/* 1. Cool Moonlit Sky / Warm Walnut Ground Fill */}
      <hemisphereLight args={['#8eb3ec', '#2c1c13', 0.92]} />

      {/* 2. Directional Moonlight Casting Shadows From Gothic Window */}
      <directionalLight
        ref={dirLightRef}
        position={[-1.4, 4.3, -4.6]}
        intensity={lanternWarmth ? 1.35 : 1.75}
        color="#9dc0f5"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-camera-near={0.5}
        shadow-camera-far={13}
        shadow-camera-left={-4.5}
        shadow-camera-right={4.5}
        shadow-camera-top={4.5}
        shadow-camera-bottom={-4.5}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      {/* 3. Desk Banker Lamp Point Light (Warm Amber or Cool Moonlight) */}
      <pointLight
        position={[-0.72, 1.06, 0.78]}
        intensity={lanternWarmth ? 2.8 : 1.15}
        distance={6.2}
        decay={2}
        color={lanternWarmth ? '#f3bd69' : '#80a6e0'}
      />

      {/* Subtle Floating Dust Motes */}
      <points geometry={particleGeometry} material={particleMaterial} />
    </>
  );
}
