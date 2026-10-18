import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { LoadedCharacterInstance } from './types';

export interface NightBeachSceneProps {
  characterPosition?: THREE.Vector3;
  character?: LoadedCharacterInstance;
  isPianoVisible?: boolean;
  isPlaying?: boolean;
  isMini?: boolean;
}

// ============================================================================
// PROCEDURAL TEXTURE GENERATORS (Zero 404s, Clean Memory, High Fidelity)
// ============================================================================

/**
 * Procedural Sky Dome Texture:
 * PRESERVED EXACTLY: Smooth vertical celestial gradient from midnight obsidian navy down to luminous horizon twilight indigo.
 */
function createProceduralSkyTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, '#020512'); // Zenith: Deepest midnight obsidian
  grad.addColorStop(0.22, '#051028'); // Upper celestial navy
  grad.addColorStop(0.5, '#0a1c42'); // Mid sky: Deep sapphire indigo
  grad.addColorStop(0.78, '#102a5e'); // Lower sky: Oceanic blue
  grad.addColorStop(0.94, '#153b73'); // Horizon glow
  grad.addColorStop(1.0, '#19437d'); // Horizon line

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Soft subtle cosmic dust / nebula wisps
  for (let i = 0; i < 4; i++) {
    const rx = 180 + i * 230;
    const ry = 160 + (i % 2) * 150;
    const rad = 250 + i * 40;
    const dustGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    dustGrad.addColorStop(0, 'rgba(45, 95, 185, 0.12)');
    dustGrad.addColorStop(0.5, 'rgba(30, 70, 145, 0.05)');
    dustGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = dustGrad;
    ctx.beginPath();
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Procedural Soft Circular Dot Texture for Stars
 */
function createStarDotTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.2, 'rgba(225, 248, 255, 0.9)');
  grad.addColorStop(0.5, 'rgba(165, 220, 255, 0.35)');
  grad.addColorStop(1, 'rgba(120, 180, 255, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural Bioluminescent Firefly Glowing Orb Texture:
 * Soft golden-green luminescent core with ethereal warm aura.
 */
function createFireflyGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1)'); // Intense diamond center
  grad.addColorStop(0.18, 'rgba(254, 240, 138, 0.95)'); // Warm golden core
  grad.addColorStop(0.42, 'rgba(190, 242, 100, 0.65)'); // Luminous yellow-green halo
  grad.addColorStop(0.72, 'rgba(132, 204, 22, 0.22)'); // Soft lime outer aura
  grad.addColorStop(1.0, 'rgba(101, 163, 13, 0)'); // Soft edge feather

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural Lush Night Grass Turf Texture:
 * Natural blade striations, micro-clumping, deep nocturne forest green tones.
 * Completely eliminates flat plain color or beach-like appearance.
 */
function createGrassTurfTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep midnight emerald base
  ctx.fillStyle = '#0d2817';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // Multi-frequency organic turf blade noise
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Vertical fiber / blade directionality
      const bladePattern = Math.sin(x * 0.45 + Math.sin(y * 0.12) * 3.0) * 12;
      const microNoise = (Math.random() - 0.5) * 18;
      const patchNoise = Math.sin(x * 0.04) * Math.cos(y * 0.04) * 14;
      const variation = bladePattern + microNoise + patchNoise;

      // Base: R: 14, G: 42, B: 24 (Lush deep night emerald)
      data[idx] = Math.max(8, Math.min(32, Math.floor(14 + variation * 0.4)));
      data[idx + 1] = Math.max(26, Math.min(78, Math.floor(44 + variation * 1.1)));
      data[idx + 2] = Math.max(14, Math.min(48, Math.floor(25 + variation * 0.5)));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Soft scattered blades overlay
  ctx.fillStyle = 'rgba(38, 92, 52, 0.25)';
  for (let i = 0; i < 400; i++) {
    const rx = (i * 37) % size;
    const ry = (i * 59) % size;
    const rw = 1.5;
    const rh = 6 + (i % 5) * 2;
    ctx.fillRect(rx, ry, rw, rh);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

/**
 * Procedural Grass Blade Clump Texture for 3D tufts
 */
function createGrassTuftTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const width = 128;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  // Draw 5 natural tapered grass blades
  const bladeCount = 5;
  for (let b = 0; b < bladeCount; b++) {
    const baseX = 24 + b * 20;
    const tipX = baseX + (b - 2) * 16;
    const tipY = 20 + Math.abs(b - 2) * 25;

    const grad = ctx.createLinearGradient(baseX, height, tipX, tipY);
    grad.addColorStop(0.0, 'rgba(10, 32, 18, 0.95)');
    grad.addColorStop(0.5, 'rgba(24, 68, 38, 0.88)');
    grad.addColorStop(0.85, 'rgba(46, 112, 64, 0.75)');
    grad.addColorStop(1.0, 'rgba(74, 158, 96, 0.85)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(baseX - 4, height);
    ctx.quadraticCurveTo(baseX - 1, height * 0.45, tipX, tipY);
    ctx.quadraticCurveTo(baseX + 2, height * 0.45, baseX + 4, height);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural Soft Feathered Contact Shadow Texture (Zero artificial black rings)
 */
function createSoftContactShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.45;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, 'rgba(8, 18, 12, 0.55)');
  grad.addColorStop(0.3, 'rgba(10, 24, 16, 0.35)');
  grad.addColorStop(0.65, 'rgba(12, 28, 20, 0.12)');
  grad.addColorStop(0.85, 'rgba(14, 32, 22, 0.03)');
  grad.addColorStop(1, 'rgba(14, 32, 22, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 1. PROCEDURAL NIGHT SKY DOME & TWINKLING STARFIELD (PRESERVED EXACTLY)
// ============================================================================

const ProceduralSkyDome: React.FC = () => {
  const skyTexture = useMemo(() => createProceduralSkyTexture(), []);

  return (
    <group name="Procedural_Sky_Dome">
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[135, 48, 24]} />
        <meshBasicMaterial
          map={skyTexture || undefined}
          color={skyTexture ? '#ffffff' : '#0a1c42'}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

const TwinklingStarfield: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const starCount = 2200;
  const starDotTexture = useMemo(() => createStarDotTexture(), []);

  const [positions, colors, baseSizes, phases, speeds] = useMemo(() => {
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const ph = new Float32Array(starCount);
    const sp = new Float32Array(starCount);

    const colorPalette = [
      new THREE.Color('#ffffff'), // Diamond white
      new THREE.Color('#d8f0ff'), // Cool ice blue
      new THREE.Color('#bae6fd'), // Pale cyan
      new THREE.Color('#e0e7ff'), // Soft periwinkle
      new THREE.Color('#93c5fd'), // Azure starlight
    ];

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(1.0 - v * 0.92);

      const r = 120 + Math.random() * 8;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.max(3.0, r * Math.cos(phi));
      const z = r * Math.sin(phi) * Math.sin(theta);

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      const isBright = Math.random() < 0.08;
      sizes[i] = isBright ? 2.0 + Math.random() * 1.2 : 0.85 + Math.random() * 0.8;

      ph[i] = Math.random() * Math.PI * 2;
      sp[i] = 0.8 + Math.random() * 1.8;
    }

    return [pos, col, sizes, ph, sp];
  }, [starCount]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (pointsRef.current) {
      const geom = pointsRef.current.geometry;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;
      if (sizeAttr) {
        for (let i = 0; i < starCount; i++) {
          const twinkle = Math.sin(t * speeds[i] + phases[i]);
          const currentSize = baseSizes[i] * (0.8 + 0.3 * twinkle);
          sizeAttr.setX(i, currentSize);
        }
        sizeAttr.needsUpdate = true;
      }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[baseSizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        map={starDotTexture || undefined}
        vertexColors
        size={1.4}
        transparent
        opacity={0.92}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

const ShootingMeteors: React.FC = () => {
  const meteorRef = useRef<THREE.LineSegments>(null);
  const meteorState = useRef({
    active: false,
    progress: 0,
    start: new THREE.Vector3(-30, 26, -42),
    end: new THREE.Vector3(18, 12, -38),
    timer: 2.0,
  });

  useFrame((_, delta) => {
    const s = meteorState.current;
    if (!s.active) {
      s.timer -= delta;
      if (s.timer <= 0) {
        s.active = true;
        s.progress = 0;
        const startX = -36 + Math.random() * 20;
        const startY = 20 + Math.random() * 9;
        const endX = startX + 34 + Math.random() * 16;
        const endY = startY - 14 - Math.random() * 7;
        s.start.set(startX, startY, -40);
        s.end.set(endX, endY, -36);
      }
    } else {
      s.progress += delta * 1.35;
      if (s.progress >= 1.0) {
        s.active = false;
        s.timer = 4.5 + Math.random() * 6.0;
      }

      if (meteorRef.current) {
        const geom = meteorRef.current.geometry;
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr) {
          const headT = Math.min(1.0, s.progress);
          const tailT = Math.max(0.0, s.progress - 0.24);

          const head = s.start.clone().lerp(s.end, headT);
          const tail = s.start.clone().lerp(s.end, tailT);

          posAttr.setXYZ(0, tail.x, tail.y, tail.z);
          posAttr.setXYZ(1, head.x, head.y, head.z);
          posAttr.needsUpdate = true;
        }

        const mat = meteorRef.current.material as THREE.LineBasicMaterial;
        if (mat) {
          mat.opacity = s.active ? Math.sin(s.progress * Math.PI) * 0.92 : 0;
        }
      }
    }
  });

  const linePositions = useMemo(() => new Float32Array(6), []);

  return (
    <lineSegments ref={meteorRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#a5f3fc"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        linewidth={1.5}
        depthWrite={false}
      />
    </lineSegments>
  );
};

// ============================================================================
// 2. NATURAL LUSH GRASS MEADOW TERRAIN
// Stable, perfectly flat ground around Hina and piano, with gentle natural rolling
// undulations in the distance. Completely removes all beach sand and rocks.
// ============================================================================

const NaturalGrassMeadow: React.FC<{ characterPosition: THREE.Vector3 }> = ({
  characterPosition,
}) => {
  const grassTexture = useMemo(() => createGrassTurfTexture(), []);
  const shadowTexture = useMemo(() => createSoftContactShadowTexture(), []);

  // Subdivided meadow plane with natural rolling hills in the distance
  const meadowGeometry = useMemo(() => {
    const size = 130;
    const segments = 90;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];
      const distFromCenter = Math.sqrt(x * x + z * z);

      // Inner circle (radius < 4.5m) around Hina and the piano is strictly flat at Y=0
      if (distFromCenter < 4.5) {
        pos[i + 1] = 0;
      } else {
        // Smooth transition to natural gentle undulating rolling meadow knolls
        const t = Math.min(1.0, (distFromCenter - 4.5) / 12.0);
        const wave1 = Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.45;
        const wave2 = Math.sin(x * 0.03 + z * 0.04) * 0.65;
        const hillElevation = (distFromCenter > 25 ? Math.sin(distFromCenter * 0.05) * 0.8 : 0);
        pos[i + 1] = (wave1 + wave2 + hillElevation) * t;
      }
    }

    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <group name="Natural_Grass_Meadow">
      {/* Main Grass Meadow Terrain Mesh */}
      <mesh geometry={meadowGeometry} receiveShadow>
        <meshStandardMaterial
          map={grassTexture || undefined}
          color="#1e462a"
          roughness={0.78}
          metalness={0.04}
          bumpScale={0.05}
        />
      </mesh>

      {/* Distant Meadow Horizon Silhouette Ring (Frames starry sky softly) */}
      <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[56, 68, 64]} />
        <meshBasicMaterial
          color="#091a10"
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Soft Contact Shadow beneath Hina & Grand Piano */}
      {shadowTexture && (
        <mesh
          position={[characterPosition.x, 0.003, characterPosition.z - 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[4.8, 3.8]} />
          <meshBasicMaterial
            map={shadowTexture}
            transparent
            opacity={0.75}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

// ============================================================================
// 3. 3D GRASS TUFTS & MEADOW VEGETATION (Natural Swaying)
// ============================================================================

const GrassTuftsField: React.FC = () => {
  const tuftsGroupRef = useRef<THREE.Group>(null);
  const tuftTexture = useMemo(() => createGrassTuftTexture(), []);

  // Generate natural positions for grass tufts around the meadow
  const tuftTransforms = useMemo(() => {
    const list: { position: [number, number, number]; rotation: number; scale: number }[] = [];
    const count = 160;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Scatter from radius 3.2m to 28m (keeping piano footprint clear)
      const dist = 3.2 + Math.sqrt(Math.random()) * 24;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Slight natural undulation matching meadow
      const y = dist < 4.5 ? 0 : Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.35;
      const rot = Math.random() * Math.PI * 2;
      const scale = 0.55 + Math.random() * 0.45;

      list.push({ position: [x, y, z], rotation: rot, scale });
    }
    return list;
  }, []);

  useFrame(({ clock }) => {
    if (tuftsGroupRef.current) {
      const t = clock.getElapsedTime() * 1.4;
      const children = tuftsGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const tuft = children[i];
        // Gentle nighttime breeze swaying
        tuft.rotation.z = Math.sin(t + tuft.position.x * 0.35) * 0.06;
      }
    }
  });

  return (
    <group ref={tuftsGroupRef} name="Grass_Tufts_Field">
      {tuftTransforms.map((tf, idx) => (
        <group key={idx} position={tf.position} rotation={[0, tf.rotation, 0]} scale={tf.scale}>
          {/* Crossed billboard quads for 3D fullness */}
          <mesh position={[0, 0.32, 0]}>
            <planeGeometry args={[0.7, 0.65]} />
            <meshStandardMaterial
              map={tuftTexture || undefined}
              color="#235a34"
              roughness={0.75}
              metalness={0.03}
              transparent
              alphaTest={0.25}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.32, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.7, 0.65]} />
            <meshStandardMaterial
              map={tuftTexture || undefined}
              color="#1f522e"
              roughness={0.75}
              metalness={0.03}
              transparent
              alphaTest={0.25}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ============================================================================
// 4. MAGICAL FIREFLIES SYSTEM
// Floating bioluminescent warm golden-green orbs drifting across the meadow,
// pulsing gently and illuminating the night grass softly.
// ============================================================================

const MeadowFireflies: React.FC<{ isPlaying?: boolean }> = ({ isPlaying = false }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const fireflyCount = 75;
  const glowTexture = useMemo(() => createFireflyGlowTexture(), []);

  // Point lights for key fireflies near the performance area
  const light1Ref = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);

  const [positions, initialPositions, phases, speeds, floatRadii] = useMemo(() => {
    const pos = new Float32Array(fireflyCount * 3);
    const initPos = new Float32Array(fireflyCount * 3);
    const ph = new Float32Array(fireflyCount);
    const sp = new Float32Array(fireflyCount);
    const rad = new Float32Array(fireflyCount);

    for (let i = 0; i < fireflyCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.2 + Math.sqrt(Math.random()) * 18;
      const x = Math.cos(angle) * dist;
      const y = 0.35 + Math.random() * 2.8; // Floating from low grass to mid air
      const z = Math.sin(angle) * dist;

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      initPos[i * 3] = x;
      initPos[i * 3 + 1] = y;
      initPos[i * 3 + 2] = z;

      ph[i] = Math.random() * Math.PI * 2;
      sp[i] = 0.6 + Math.random() * 0.9;
      rad[i] = 0.4 + Math.random() * 0.8;
    }

    return [pos, initPos, ph, sp, rad];
  }, [fireflyCount]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (pointsRef.current) {
      const geom = pointsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;

      for (let i = 0; i < fireflyCount; i++) {
        const speed = speeds[i];
        const phase = phases[i];
        const r = floatRadii[i];

        // Organic 3D figure-8 / Lissajous wandering
        const offsetX = Math.sin(t * speed + phase) * r + Math.cos(t * speed * 0.5 + phase) * 0.3;
        const offsetY = Math.sin(t * speed * 1.3 + phase * 1.5) * (r * 0.45);
        const offsetZ = Math.cos(t * speed * 0.8 + phase) * r;

        const currentX = initialPositions[i * 3] + offsetX;
        const currentY = Math.max(0.2, initialPositions[i * 3 + 1] + offsetY);
        const currentZ = initialPositions[i * 3 + 2] + offsetZ;

        posAttr.setXYZ(i, currentX, currentY, currentZ);
      }
      posAttr.needsUpdate = true;

      // Animate material opacity with natural firefly breathing/pulsing
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      if (mat) {
        const pulse = 0.65 + Math.sin(t * 1.8) * 0.28 + Math.cos(t * 2.4) * 0.12;
        mat.opacity = Math.max(0.4, Math.min(0.98, pulse));
      }
    }

    // Dynamic wandering for local firefly point lights
    if (light1Ref.current) {
      const lx = Math.cos(t * 0.6) * 2.8;
      const lz = Math.sin(t * 0.6) * 2.8;
      const ly = 1.1 + Math.sin(t * 1.2) * 0.4;
      light1Ref.current.position.set(lx, ly, lz);
      // Gentle breathing intensity
      const pulse1 = 0.6 + Math.pow(Math.sin(t * 2.2), 4) * 0.6;
      light1Ref.current.intensity = isPlaying ? pulse1 * 1.25 : pulse1 * 0.8;
    }

    if (light2Ref.current) {
      const lx2 = Math.sin(t * 0.45 + 2.0) * 3.5;
      const lz2 = Math.cos(t * 0.45 + 2.0) * 3.5;
      const ly2 = 0.85 + Math.cos(t * 0.9) * 0.35;
      light2Ref.current.position.set(lx2, ly2, lz2);
      const pulse2 = 0.5 + Math.pow(Math.sin(t * 1.7 + 1.2), 4) * 0.5;
      light2Ref.current.intensity = isPlaying ? pulse2 * 1.1 : pulse2 * 0.7;
    }
  });

  return (
    <group name="Meadow_Fireflies">
      {/* Fireflies particle points */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={glowTexture || undefined}
          color="#d9f99d"
          size={1.65}
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Soft local bioluminescent lights drifting near the performance */}
      <pointLight
        ref={light1Ref}
        color="#bef264"
        distance={5.0}
        decay={2}
        intensity={0.85}
      />
      <pointLight
        ref={light2Ref}
        color="#fef08a"
        distance={4.5}
        decay={2}
        intensity={0.7}
      />
    </group>
  );
};

// ============================================================================
// MAIN NIGHT MEADOW CINEMATIC SCENE
// Seamless isolated environment with preserved starry sky, lush grass ground,
// realistic fireflies, and balanced moonless nighttime lighting.
// ============================================================================

export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
  isPlaying = false,
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera && camera.far < 165) {
      camera.far = 165;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return (
    <group name="NightMeadowScene_Root">
      {/* 1. Seamless Procedural Sky Dome & Twinkling Starfield (EXACTLY PRESERVED) */}
      <ProceduralSkyDome />
      <TwinklingStarfield />
      <ShootingMeteors />

      {/* 2. Natural Lush Grass Meadow Ground (Stable flat center for Hina & Piano) */}
      <NaturalGrassMeadow characterPosition={characterPosition} />

      {/* 3. 3D Grass Tufts & Meadow Flora */}
      <GrassTuftsField />

      {/* 4. Magical Glowing Fireflies (Bioluminescent floating orbs) */}
      <MeadowFireflies isPlaying={isPlaying} />

      {/* 5. Balanced Moonless Night Meadow Lighting */}
      {/* Cool Celestial Starlight Key Light */}
      <directionalLight
        position={[5, 18, -10]}
        intensity={1.6}
        color="#D4ECFF" // Crisp cool starlight cyan-white
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Midnight Sapphire & Forest Ambient Light */}
      <ambientLight intensity={1.15} color="#102521" />

      {/* Upward Diffuse Meadow Bounce Light (soft green-tinted ground bounce) */}
      <directionalLight
        position={[0, -5, 2]}
        intensity={0.4}
        color="#1f5431"
      />

      {/* Cool Starlight Rim Backlight (silhouette separation for Hina & piano) */}
      <directionalLight
        position={[-8, 7, -12]}
        intensity={0.85}
        color="#8EC1F8"
      />

      {/* Soft Front Key (clean illumination for character expression, dress, and piano keys) */}
      <directionalLight
        position={[0, 3.2, 5.5]}
        intensity={0.8}
        color="#F2F7FF"
      />
    </group>
  );
};

// Also export alias for clarity
export const NightMeadowScene = NightBeachScene;

export default NightBeachScene;
