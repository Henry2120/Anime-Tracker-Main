import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ArchiveQualitySettings } from './qualityConfig';
import type { SceneAtmosphereProfile } from './themeAtmosphere';

interface LibraryLightingAndAtmosphereProps {
  atmosphere: SceneAtmosphereProfile;
  quality: ArchiveQualitySettings;
}

const MAX_WEATHER_PARTICLES = 140;
const NOOP_RAYCAST = () => null;

export function LibraryLightingAndAtmosphere({
  atmosphere,
  quality,
}: LibraryLightingAndAtmosphereProps) {
  const { gl, scene, invalidate } = useThree();
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const weatherPointsRef = useRef<THREE.Points>(null);

  // Procedural RoomEnvironment PMREM for metallic laptop, brass, glass reflection, and walnut sheen
  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = atmosphere.envIntensity;
    scene.background = new THREE.Color(atmosphere.roomBg);
    scene.fog = new THREE.FogExp2(atmosphere.fogColor, atmosphere.fogDensity);

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

  // Smoothly update scene background, fog, and reflection intensity when theme changes
  useEffect(() => {
    scene.environmentIntensity = atmosphere.envIntensity;
    if (scene.background instanceof THREE.Color) {
      scene.background.set(atmosphere.roomBg);
    } else {
      scene.background = new THREE.Color(atmosphere.roomBg);
    }
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(atmosphere.fogColor);
      scene.fog.density = atmosphere.fogDensity;
    } else {
      scene.fog = new THREE.FogExp2(atmosphere.fogColor, atmosphere.fogDensity);
    }
    invalidate();
  }, [scene, atmosphere, invalidate]);

  // Bounded room ambient motes (1 draw call)
  const particleGeometry = useMemo(() => {
    const count = Math.max(4, quality.particleCount);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const primary = new THREE.Color(atmosphere.particlePrimary);
    const secondary = new THREE.Color(atmosphere.particleSecondary);

    for (let i = 0; i < count; i++) {
      const s1 = Math.sin(i * 12.9898) * 43758.5453;
      const s2 = Math.sin(i * 78.233 + 1.7) * 24634.6345;
      const s3 = Math.sin(i * 39.425 + 3.1) * 19283.4812;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      const r3 = s3 - Math.floor(s3);

      positions[i * 3] = (r1 - 0.5) * 6.4;
      positions[i * 3 + 1] = 0.8 + r2 * 2.7;
      positions[i * 3 + 2] = -3.4 + r3 * 4.4;

      const c = i % 3 === 0 ? secondary : primary;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [quality.particleCount, atmosphere.particlePrimary, atmosphere.particleSecondary]);

  useEffect(() => {
    return () => {
      particleGeometry.dispose();
    };
  }, [particleGeometry]);

  const particleMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.026,
        vertexColors: true,
        transparent: true,
        opacity: 0.52,
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

  // Exterior Window Weather Particles (petals / rain / snow / autumn leaves / starlight)
  const { weatherGeo, weatherMat, weatherCount, weatherSpeeds } = useMemo(() => {
    const mode = atmosphere.weatherMode;
    const densityMultiplier =
      quality.tier === 'high' ? 1 : quality.tier === 'balanced' ? 0.65 : 0.35;

    let baseCount = 0;
    if (mode === 'rain') {
      baseCount = 32 + atmosphere.effectiveRainIntensity * 26;
    } else if (mode === 'petals' || mode === 'leaves' || mode === 'snow') {
      baseCount = 58;
    } else if (mode === 'stars') {
      baseCount = 46;
    }

    const count = Math.min(
      MAX_WEATHER_PARTICLES,
      Math.round(baseCount * densityMultiplier)
    );
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const s1 = Math.sin(i * 45.164 + 0.3) * 19432.12;
      const s2 = Math.sin(i * 91.771 + 1.9) * 31823.77;
      const s3 = Math.sin(i * 17.311 + 4.2) * 12491.33;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      const r3 = s3 - Math.floor(s3);

      // Inside wide window glass opening: x [-1.88..1.88], y [1.94..4.02], z ~ -4.39
      positions[i * 3] = (r1 - 0.5) * 3.76;
      positions[i * 3 + 1] = 1.94 + r2 * 2.08;
      positions[i * 3 + 2] = -4.395 + (r3 - 0.5) * 0.03;

      speeds[i * 2] = 0.65 + r3 * 0.7;
      speeds[i * 2 + 1] = (r1 - 0.5) * 0.45;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: atmosphere.particlePrimary,
      size:
        mode === 'rain'
          ? 0.038 + atmosphere.effectiveRainIntensity * 0.005
          : mode === 'stars'
            ? 0.045
            : 0.056,
      transparent: true,
      opacity: mode === 'none' ? 0 : mode === 'rain' ? 0.72 : 0.82,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { weatherGeo: geo, weatherMat: mat, weatherCount: count, weatherSpeeds: speeds };
  }, [
    atmosphere.weatherMode,
    atmosphere.effectiveRainIntensity,
    atmosphere.particlePrimary,
    quality.tier,
  ]);

  useEffect(() => {
    return () => {
      weatherGeo.dispose();
      weatherMat.dispose();
    };
  }, [weatherGeo, weatherMat]);

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animateWeather =
    atmosphere.weatherMode !== 'none' &&
    atmosphere.weatherMode !== 'stars' &&
    weatherCount > 0 &&
    !reducedMotion &&
    !quality.isSoftwareGl &&
    quality.tier !== 'performance';

  useFrame((_, rawDelta) => {
    if (!animateWeather || !weatherPointsRef.current) return;
    const posAttr = weatherGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const dt = Math.min(0.05, rawDelta || 0.016);
    const mode = atmosphere.weatherMode;

    const fallSpeed =
      mode === 'rain'
        ? 1.65 + atmosphere.effectiveRainIntensity * 0.65
        : mode === 'snow'
          ? 0.28
          : 0.34;
    const windX =
      mode === 'rain'
        ? atmosphere.effectiveRainIntensity >= 4
          ? -0.85
          : -0.22
        : 0.18;

    for (let i = 0; i < weatherCount; i++) {
      let x = arr[i * 3];
      let y = arr[i * 3 + 1];
      const sp = weatherSpeeds[i * 2];
      const sway = weatherSpeeds[i * 2 + 1];

      y -= fallSpeed * sp * dt;
      x += (windX + sway * (mode === 'rain' ? 0.15 : 0.45)) * dt;

      if (y < 1.92) {
        y = 4.02;
      }
      if (x < -1.88) x = 1.88;
      if (x > 1.88) x = -1.88;

      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
    }
    posAttr.needsUpdate = true;
    invalidate();
  });

  return (
    <>
      {/* 1. Theme-Driven Sky / Warm Walnut Ground Fill */}
      <hemisphereLight
        args={[
          atmosphere.hemiSkyColor,
          atmosphere.hemiGroundColor,
          atmosphere.hemiIntensity,
        ]}
      />

      {/* 2. Directional Window Sunlight / Moonlight Casting Shadows */}
      <directionalLight
        ref={dirLightRef}
        position={[-1.2, 4.2, -4.6]}
        intensity={atmosphere.dirLightIntensity}
        color={atmosphere.dirLightColor}
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

      {/* 3. Desk Banker Lamp Point Light */}
      <pointLight
        position={[-0.72, 1.07, 0.78]}
        intensity={atmosphere.lampIntensity}
        distance={6.2}
        decay={2}
        color={atmosphere.lampColor}
      />

      {/* Interior Floating Motes */}
      <points
        geometry={particleGeometry}
        material={particleMaterial}
        raycast={NOOP_RAYCAST}
      />

      {/* Exterior Window Weather Particles */}
      {weatherCount > 0 && atmosphere.weatherMode !== 'none' && (
        <points
          ref={weatherPointsRef}
          geometry={weatherGeo}
          material={weatherMat}
          raycast={NOOP_RAYCAST}
        />
      )}
    </>
  );
}
