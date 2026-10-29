import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { LoadedCharacterInstance } from './types';

export interface MeadowEnvironmentLayers {
  skyAndStarfield: boolean;
  baseGround: boolean;
  grassBlades: boolean;
  grassTufts: boolean;
  fireflies: boolean;
  meadowLighting: boolean;
}

export const DEFAULT_MEADOW_LAYERS: MeadowEnvironmentLayers = {
  skyAndStarfield: false,
  baseGround: false,
  grassBlades: false,
  grassTufts: false,
  fireflies: false,
  meadowLighting: false,
};

export interface NightBeachSceneProps {
  characterPosition?: THREE.Vector3;
  character?: LoadedCharacterInstance;
  isPianoVisible?: boolean;
  isPlaying?: boolean;
  isMini?: boolean;
  layers?: MeadowEnvironmentLayers;
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
 * Procedural Lush Night Grass Turf Texture for base ground plane:
 * Natural blade striations, micro-clumping, deep nocturne forest green tones.
 */
function createGrassTurfTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#163b22';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // Multi-frequency organic turf blade noise
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const bladePattern = Math.sin(x * 0.45 + Math.sin(y * 0.12) * 3.0) * 14;
      const microNoise = (Math.random() - 0.5) * 20;
      const patchNoise = Math.sin(x * 0.04) * Math.cos(y * 0.04) * 16;
      const variation = bladePattern + microNoise + patchNoise;

      // Base: R: 22, G: 58, B: 34 (Lush visible night emerald)
      data[idx] = Math.max(14, Math.min(48, Math.floor(22 + variation * 0.5)));
      data[idx + 1] = Math.max(38, Math.min(95, Math.floor(58 + variation * 1.2)));
      data[idx + 2] = Math.max(20, Math.min(60, Math.floor(34 + variation * 0.6)));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Soft scattered blades overlay
  ctx.strokeStyle = 'rgba(78, 142, 85, 0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 400; i++) {
    const bx = Math.random() * size;
    const by = Math.random() * size;
    const blen = 6 + Math.random() * 12;
    const curve = (Math.random() - 0.5) * 4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + curve, by - blen * 0.6, bx + curve * 1.5, by - blen);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural 3D Grass Tuft Alpha Texture:
 * Multi-blade clump shape for layered vegetation silhouettes.
 */
function createGrassTuftTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const width = 128;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  const bladeCount = 18;
  for (let i = 0; i < bladeCount; i++) {
    const startX = width * 0.5 + (Math.random() - 0.5) * 32;
    const startY = height - 2;
    const bladeHeight = height * (0.55 + Math.random() * 0.42);
    const lean = (Math.random() - 0.5) * 36;
    const midX = startX + lean * 0.5;
    const midY = startY - bladeHeight * 0.55;
    const tipX = startX + lean;
    const tipY = startY - bladeHeight;

    const bladeGrad = ctx.createLinearGradient(startX, startY, tipX, tipY);
    bladeGrad.addColorStop(0, 'rgba(32, 75, 42, 0.98)');
    bladeGrad.addColorStop(0.65, 'rgba(56, 122, 68, 0.95)');
    bladeGrad.addColorStop(1, 'rgba(84, 162, 98, 0.9)');

    ctx.strokeStyle = bladeGrad;
    ctx.lineWidth = 2.8 + Math.random() * 1.8;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural Soft Contact Shadow Texture under Hina and Piano
 */
function createSoftContactShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const rad = size * 0.44;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  grad.addColorStop(0, 'rgba(5, 12, 8, 0.75)');
  grad.addColorStop(0.3, 'rgba(7, 16, 10, 0.55)');
  grad.addColorStop(0.65, 'rgba(9, 20, 13, 0.22)');
  grad.addColorStop(1, 'rgba(10, 24, 15, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural 3D Grass Blade Geometry:
 * Tapered, curved 3-segment blade geometry for realistic specular highlights,
 * genuine volume, and depth when viewed from front, perspective, and side angles.
 */
function createGrassBladeGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();

  // 3 segments (6 vertices) forming a tapered curved blade
  // Bottom: Y=0, width=0.07m
  // Mid: Y=0.22m, width=0.048m, bent forward in Z by 0.04m
  // Top: Y=0.45m, width=0.006m, curved forward in Z by 0.12m
  const positions = new Float32Array([
    // Quad 1: Base to Mid
    -0.035, 0.0, 0.0,
    0.035, 0.0, 0.0,
    -0.024, 0.22, 0.04,

    0.035, 0.0, 0.0,
    0.024, 0.22, 0.04,
    -0.024, 0.22, 0.04,

    // Quad 2: Mid to Tip
    -0.024, 0.22, 0.04,
    0.024, 0.22, 0.04,
    -0.004, 0.45, 0.12,

    0.024, 0.22, 0.04,
    0.004, 0.45, 0.12,
    -0.004, 0.45, 0.12,
  ]);

  const uvs = new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.15, 0.5,

    1.0, 0.0,
    0.85, 0.5,
    0.15, 0.5,

    0.15, 0.5,
    0.85, 0.5,
    0.45, 1.0,

    0.85, 0.5,
    0.55, 1.0,
    0.45, 1.0,
  ]);

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.computeVertexNormals();

  return geom;
}

// ============================================================================
// 1. PROCEDURAL SKY DOME (EXACTLY PRESERVED)
// ============================================================================

export const ProceduralSkyDome: React.FC = () => {
  const skyTexture = useMemo(() => createProceduralSkyTexture(), []);

  return (
    <mesh name="Sky_Dome" scale={[-1, 1, 1]} position={[0, -2, 0]}>
      <sphereGeometry args={[140, 48, 32]} />
      <meshBasicMaterial
        map={skyTexture || undefined}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
};

// ============================================================================
// TWINKLING STARFIELD (EXACTLY PRESERVED)
// ============================================================================

export const TwinklingStarfield: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const starTexture = useMemo(() => createStarDotTexture(), []);
  const starCount = 650;

  const [positions, baseAlphas, blinkFrequencies, blinkPhases] = useMemo(() => {
    const pos = new Float32Array(starCount * 3);
    const alphas = new Float32Array(starCount);
    const freqs = new Float32Array(starCount);
    const phases = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.88 + 0.12);
      const r = 135;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) - 2;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      alphas[i] = 0.45 + Math.random() * 0.55;
      freqs[i] = 0.8 + Math.random() * 2.5;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return [pos, alphas, freqs, phases];
  }, [starCount]);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      const t = clock.getElapsedTime();
      const geom = pointsRef.current.geometry;
      const alphaAttr = geom.getAttribute('customAlpha') as THREE.BufferAttribute;

      if (alphaAttr) {
        for (let i = 0; i < starCount; i++) {
          const val = baseAlphas[i] * (0.65 + 0.35 * Math.sin(t * blinkFrequencies[i] + blinkPhases[i]));
          alphaAttr.setX(i, val);
        }
        alphaAttr.needsUpdate = true;
      }
    }
  });

  return (
    <points ref={pointsRef} name="Twinkling_Stars">
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-customAlpha" args={[baseAlphas, 1]} />
      </bufferGeometry>
      <pointsMaterial
        map={starTexture || undefined}
        color="#F0F8FF"
        size={2.2}
        transparent
        opacity={0.92}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

// ============================================================================
// SHOOTING METEORS (EXACTLY PRESERVED)
// ============================================================================

export const ShootingMeteors: React.FC = () => {
  const lineRef = useRef<THREE.LineSegments>(null);
  const meteorCount = 3;

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(meteorCount * 6);
    const col = new Float32Array(meteorCount * 6);
    for (let i = 0; i < meteorCount; i++) {
      pos[i * 6] = 0; pos[i * 6 + 1] = 0; pos[i * 6 + 2] = 0;
      pos[i * 6 + 3] = 0; pos[i * 6 + 4] = 0; pos[i * 6 + 5] = 0;

      col[i * 6] = 1; col[i * 6 + 1] = 1; col[i * 6 + 2] = 1;
      col[i * 6 + 3] = 0.5; col[i * 6 + 4] = 0.7; col[i * 6 + 5] = 1;
    }
    return [pos, col];
  }, [meteorCount]);

  const meteorsState = useRef(
    Array.from({ length: meteorCount }, () => ({
      active: false,
      progress: 0,
      speed: 0.35,
      start: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      length: 12,
      timer: Math.random() * 4 + 2,
    }))
  );

  useFrame((_, delta) => {
    if (!lineRef.current) return;
    const geom = lineRef.current.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;

    meteorsState.current.forEach((m, idx) => {
      if (!m.active) {
        m.timer -= delta;
        if (m.timer <= 0) {
          m.active = true;
          m.progress = 0;
          m.speed = 0.45 + Math.random() * 0.4;
          m.length = 10 + Math.random() * 14;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * 0.45 + 0.25;
          const r = 125;
          m.start.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi) + 10,
            r * Math.sin(phi) * Math.sin(theta)
          );
          m.dir.set(-0.65 - Math.random() * 0.3, -0.4 - Math.random() * 0.3, -0.2 + Math.random() * 0.4).normalize();
        }
      } else {
        m.progress += delta * m.speed;
        if (m.progress >= 1.0) {
          m.active = false;
          m.timer = 3.5 + Math.random() * 6.0;
          posAttr.setXYZ(idx * 2, 0, 0, 0);
          posAttr.setXYZ(idx * 2 + 1, 0, 0, 0);
        } else {
          const travelDist = m.progress * 45;
          const head = m.start.clone().addScaledVector(m.dir, travelDist);
          const tail = head.clone().addScaledVector(m.dir, -m.length);
          posAttr.setXYZ(idx * 2, head.x, head.y, head.z);
          posAttr.setXYZ(idx * 2 + 1, tail.x, tail.y, tail.z);
        }
      }
    });

    posAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef} name="Shooting_Meteors">
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.85}
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
// undulations in the distance.
// ============================================================================

export const NaturalGrassMeadow: React.FC<{ characterPosition?: THREE.Vector3 }> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
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

      // Inner circle (radius < 4.2m) around Hina and the piano is strictly flat at Y=0
      if (distFromCenter < 4.2) {
        pos[i + 1] = 0;
      } else {
        // Smooth transition to natural gentle undulating rolling meadow knolls
        const t = Math.min(1.0, (distFromCenter - 4.2) / 10.0);
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
          color="#225433"
          roughness={0.72}
          metalness={0.03}
          bumpScale={0.06}
        />
      </mesh>

      {/* Distant Meadow Horizon Silhouette Ring (Frames starry sky softly) */}
      <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[56, 68, 64]} />
        <meshBasicMaterial
          color="#0b2214"
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
            opacity={0.65}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

// ============================================================================
// 3. VISIBLY THREE-DIMENSIONAL INSTANCED 3D GRASS BLADES & VEGETATION
// ============================================================================

/**
 * High-density Instanced 3D Grass Blades:
 * Visible geometry with individual height, width, rotation, and organic green shades.
 * Placed in foreground (directly visible from front camera), midground, and perimeter.
 * Keeps Hina's seat and piano base clear to prevent clipping.
 */
const Instanced3DGrassMeadow: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const bladeGeometry = useMemo(() => createGrassBladeGeometry(), []);

  // 2,200 3D grass blade instances
  const count = 2200;

  const [matrices, colors] = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matList: THREE.Matrix4[] = [];
    const colList: THREE.Color[] = [];

    // Organic color palette: warm olive, rich emerald, lime-moss, and deep jade
    const colorPalette = [
      new THREE.Color('#3d7f45'),
      new THREE.Color('#50964a'),
      new THREE.Color('#2d6d39'),
      new THREE.Color('#5ca654'),
      new THREE.Color('#255d32'),
      new THREE.Color('#468a48'),
    ];

    // Seeded random helper for stable layout across renders
    let seed = 42;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    let placed = 0;
    let attempts = 0;

    while (placed < count && attempts < count * 3) {
      attempts++;

      let x = 0;
      let z = 0;

      // 35% of blades densely placed in foreground between camera [0, 2.5, 7.5] and Hina [0, 0, 0]
      if (placed < count * 0.35) {
        x = (random() - 0.5) * 11.0;
        z = 1.35 + random() * 6.2;
      } else {
        // 65% radiating out across the surrounding meadow up to radius 22m
        const angle = random() * Math.PI * 2;
        const dist = 1.3 + Math.sqrt(random()) * 20.5;
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
      }

      // CRITICAL: Strictly keep Hina's feet, stool, and piano pedals footprint clear
      // Hina sits at ~[0, 0, 0], piano extends slightly in -Z (~-0.9 to +0.8)
      if (Math.abs(x) < 1.05 && z > -0.95 && z < 0.85) {
        continue;
      }

      // Ground elevation matching meadow undulations
      const distFromCenter = Math.sqrt(x * x + z * z);
      let y = 0;
      if (distFromCenter > 4.2) {
        const t = Math.min(1.0, (distFromCenter - 4.2) / 10.0);
        const wave1 = Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.45;
        const wave2 = Math.sin(x * 0.03 + z * 0.04) * 0.65;
        y = (wave1 + wave2) * t;
      }

      // Height variation: 0.32m to 0.62m (varied blade heights for rich depth)
      const heightScale = 0.75 + random() * 0.65;
      const widthScale = 0.8 + random() * 0.5;

      dummy.position.set(x, y, z);
      dummy.rotation.y = random() * Math.PI * 2;
      dummy.rotation.x = (random() - 0.5) * 0.18; // Natural slight tilt
      dummy.rotation.z = (random() - 0.5) * 0.18;
      dummy.scale.set(widthScale, heightScale, widthScale);
      dummy.updateMatrix();

      matList.push(dummy.matrix.clone());

      const chosenColor = colorPalette[Math.floor(random() * colorPalette.length)].clone();
      // Subtle luminosity variation per blade
      const lum = 0.88 + random() * 0.24;
      chosenColor.multiplyScalar(lum);
      colList.push(chosenColor);

      placed++;
    }

    return [matList, colList];
  }, [count]);

  useEffect(() => {
    if (meshRef.current) {
      for (let i = 0; i < matrices.length; i++) {
        meshRef.current.setMatrixAt(i, matrices[i]);
        meshRef.current.setColorAt(i, colors[i]);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, [matrices, colors]);

  // Gentle wind sway across the meadow
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = clock.getElapsedTime() * 1.5;
      meshRef.current.rotation.y = Math.sin(t * 0.5) * 0.012;
      meshRef.current.rotation.z = Math.cos(t * 0.7) * 0.008;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[bladeGeometry, undefined as any, matrices.length]}
      name="Instanced_3D_Grass"
      receiveShadow
    >
      <meshStandardMaterial
        color="#ffffff" // Color driven by instanceColor attribute
        roughness={0.65}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
};

/**
 * Layered Grass Tufts & Vegetation Clumps:
 * Cross-quad tufts distributed across midground and distant mounds for dense silhouette depth.
 */
const GrassTuftsField: React.FC = () => {
  const tuftsGroupRef = useRef<THREE.Group>(null);
  const tuftTexture = useMemo(() => createGrassTuftTexture(), []);

  const tuftTransforms = useMemo(() => {
    const list: { position: [number, number, number]; rotation: number; scale: number }[] = [];
    const count = 180;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2.4 + Math.sqrt(Math.random()) * 22;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (Math.abs(x) < 1.15 && z > -1.0 && z < 0.9) {
        continue;
      }

      const y = dist < 4.2 ? 0 : Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.35;
      const rot = Math.random() * Math.PI * 2;
      const scale = 0.65 + Math.random() * 0.55;

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
        tuft.rotation.z = Math.sin(t + tuft.position.x * 0.35) * 0.05;
      }
    }
  });

  return (
    <group ref={tuftsGroupRef} name="Grass_Tufts_Field">
      {tuftTransforms.map((tf, idx) => (
        <group key={idx} position={tf.position} rotation={[0, tf.rotation, 0]} scale={tf.scale}>
          <mesh position={[0, 0.32, 0]}>
            <planeGeometry args={[0.75, 0.68]} />
            <meshStandardMaterial
              map={tuftTexture || undefined}
              color="#2a663b"
              roughness={0.72}
              metalness={0.03}
              transparent
              alphaTest={0.25}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.32, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.75, 0.68]} />
            <meshStandardMaterial
              map={tuftTexture || undefined}
              color="#235c33"
              roughness={0.72}
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
// Floating bioluminescent warm golden-green orbs drifting across the meadow
// ============================================================================

export const MeadowFireflies: React.FC<{ isPlaying?: boolean }> = ({ isPlaying = false }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const fireflyCount = 80;
  const glowTexture = useMemo(() => createFireflyGlowTexture(), []);

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
      const dist = 1.1 + Math.sqrt(Math.random()) * 19;
      const x = Math.cos(angle) * dist;
      const y = 0.35 + Math.random() * 2.8;
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

        const offsetX = Math.sin(t * speed + phase) * r + Math.cos(t * speed * 0.5 + phase) * 0.3;
        const offsetY = Math.sin(t * speed * 1.3 + phase * 1.5) * (r * 0.45);
        const offsetZ = Math.cos(t * speed * 0.8 + phase) * r;

        const currentX = initialPositions[i * 3] + offsetX;
        const currentY = Math.max(0.2, initialPositions[i * 3 + 1] + offsetY);
        const currentZ = initialPositions[i * 3 + 2] + offsetZ;

        posAttr.setXYZ(i, currentX, currentY, currentZ);
      }
      posAttr.needsUpdate = true;

      const mat = pointsRef.current.material as THREE.PointsMaterial;
      if (mat) {
        const pulse = 0.68 + Math.sin(t * 1.8) * 0.26 + Math.cos(t * 2.4) * 0.1;
        mat.opacity = Math.max(0.45, Math.min(0.98, pulse));
      }
    }

    if (light1Ref.current) {
      const lx = Math.cos(t * 0.6) * 2.8;
      const lz = Math.sin(t * 0.6) * 2.8;
      const ly = 1.1 + Math.sin(t * 1.2) * 0.4;
      light1Ref.current.position.set(lx, ly, lz);
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
// 5. LOCAL LIGHTING AROUND HINA'S PIANO PERFORMANCE
// Soft, warm-white / pale-golden local illumination focused on Hina and the piano.
// Illuminates nearby grass and piano lacquer with smooth falloff, preventing overexposure.
// ============================================================================

const HinaPerformanceLighting: React.FC<{ isPlaying?: boolean }> = ({ isPlaying = false }) => {
  return (
    <group name="Hina_Performance_Lighting">
      {/* Primary Soft Warm-White Overhead Local Light */}
      <pointLight
        position={[0.3, 3.4, 1.6]}
        color="#FFF5DF" // Gentle pale-golden warm-white
        distance={10.5}
        decay={2}
        intensity={isPlaying ? 1.85 : 1.25}
      />

      {/* Gentle Diffuse Ground Fill (reveals grass blade shapes and piano pedals) */}
      <pointLight
        position={[0.0, 0.45, 0.9]}
        color="#FEECC8" // Soft warm amber-gold
        distance={5.5}
        decay={2}
        intensity={isPlaying ? 0.75 : 0.45}
      />

      {/* Subtle Specular Accent for Piano Lacquer and Sheet Music */}
      <directionalLight
        position={[2.0, 4.0, 2.5]}
        color="#FFF8EB"
        intensity={isPlaying ? 0.6 : 0.35}
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
  layers = DEFAULT_MEADOW_LAYERS,
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
      {layers.skyAndStarfield && (
        <group name="Layer_SkyAndStarfield">
          <ProceduralSkyDome />
          <TwinklingStarfield />
          <ShootingMeteors />
        </group>
      )}

      {/* 2. Natural Lush Grass Meadow Ground (Stable flat center for Hina & Piano) */}
      {layers.baseGround && (
        <group name="Layer_BaseGround">
          <NaturalGrassMeadow characterPosition={characterPosition} />
        </group>
      )}

      {/* 3. Visibly Three-Dimensional Instanced 3D Grass Blades (Rich depth from front camera) */}
      {layers.grassBlades && (
        <group name="Layer_GrassBlades">
          <Instanced3DGrassMeadow />
        </group>
      )}

      {/* 4. Layered Grass Tufts & Vegetation Clumps */}
      {layers.grassTufts && (
        <group name="Layer_GrassTufts">
          <GrassTuftsField />
        </group>
      )}

      {/* 5. Magical Glowing Fireflies (Bioluminescent floating orbs) - Independent of ground/grass */}
      {layers.fireflies && (
        <group name="Layer_Fireflies">
          <MeadowFireflies isPlaying={isPlaying} />
        </group>
      )}

      {/* 6. Meadow Lighting (Independent of sky and ground) */}
      {layers.meadowLighting ? (
        <group name="Layer_MeadowLighting">
          {/* Subtle Local Lighting around Hina's Piano Performance */}
          <HinaPerformanceLighting isPlaying={isPlaying} />

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
            intensity={0.7}
            color="#F2F7FF"
          />
        </group>
      ) : (
        /* Neutral viewer lighting fallback so characters/models remain visible without darkening whole app */
        <group name="Layer_MeadowLightingFallback">
          <ambientLight intensity={0.9} color="#FFFFFF" />
          <directionalLight position={[3, 6, 4]} intensity={1.2} color="#FFFFFF" />
        </group>
      )}
    </group>
  );
};

// Also export alias for clarity
export const NightMeadowScene = NightBeachScene;

export default NightBeachScene;
