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
// CONTINUOUS NATURAL SHORELINE CONTOUR
// Mathematical curve describing the natural curving cove shoreline.
// Eliminates artificial straight rectangular strips.
// ============================================================================
export function getShorelineZ(x: number): number {
  return -2.8 + Math.sin(x * 0.08) * 0.95 + Math.cos(x * 0.035) * 0.6 + Math.sin(x * 0.22) * 0.28;
}

// ============================================================================
// PROCEDURAL TEXTURE GENERATORS (Zero 404s, Clean Memory, High Fidelity)
// ============================================================================

/**
 * Procedural Sky Dome Texture:
 * Smooth vertical celestial gradient from midnight obsidian navy down to luminous horizon twilight indigo.
 * Completely eliminates static photo billboard artifacts, seams, and image edges.
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
 * Procedural Soft Circular Dot Texture for Stars, Ambient Sparkles & Rising Particles
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
 * Procedural Luminous Blue Sand Texture:
 * Micro-granule noise, shallow wind-sand ripples, and silver-cyan starlight highlights.
 * Noticeably brighter, visibly blue, and non-repeating.
 */
function createLuminousBlueSandTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#9cb5db';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const ripple = Math.sin(x * 0.08 + Math.sin(y * 0.04) * 2.5) * 8;
      const noise1 = (Math.random() - 0.5) * 20;
      const noise2 = (Math.random() - 0.5) * 10;
      const lum = ripple + noise1 + noise2;

      // Base color: R: 156, G: 181, B: 219 (Luminous silver-periwinkle beach sand)
      data[idx] = Math.max(120, Math.min(195, 156 + lum * 0.7));
      data[idx + 1] = Math.max(145, Math.min(220, 181 + lum * 0.85));
      data[idx + 2] = Math.max(180, Math.min(255, 219 + lum * 1.05));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 12);
  return tex;
}

/**
 * Procedural Seamless Water Ripple Normal Map:
 * Provides fine wave facets and dancing specular reflections across the blue ocean.
 */
function createWaterNormalTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 4;
      const v = (y / size) * Math.PI * 4;

      const dx =
        Math.cos(u * 1.4 + v * 0.8) * 0.38 +
        Math.cos(u * 2.8 - v * 2.0) * 0.24 +
        Math.cos(u * 5.6 + v * 3.6) * 0.12;
      const dy =
        Math.sin(v * 1.4 + u * 0.8) * 0.38 +
        Math.sin(v * 2.8 - u * 2.0) * 0.24 +
        Math.sin(v * 5.6 + u * 3.6) * 0.12;

      let nx = -dx * 0.75;
      let ny = -dy * 0.75;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 6);
  return tex;
}

/**
 * Procedural Organic Shoreline Foam Texture:
 * Soft scalloped froth band with irregular bubbly micro-noise that surges gently.
 */
function createShorelineFoamTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const width = 512;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  for (let x = 0; x < width; x += 3) {
    const nx = (x / width) * Math.PI * 12;
    const waveOffset = Math.sin(nx) * 12 + Math.cos(nx * 2.4) * 6 + Math.sin(nx * 4.8) * 3;
    const centerY = 64 + waveOffset;

    const grad = ctx.createLinearGradient(x, centerY - 24, x, centerY + 24);
    grad.addColorStop(0, 'rgba(210, 242, 255, 0)');
    grad.addColorStop(0.3, 'rgba(225, 248, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(245, 253, 255, 0.85)');
    grad.addColorStop(0.7, 'rgba(215, 245, 255, 0.38)');
    grad.addColorStop(1, 'rgba(195, 235, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(x, centerY - 24, 3, 48);
  }

  // Micro bubbly foam froth
  ctx.fillStyle = 'rgba(245, 253, 255, 0.7)';
  for (let i = 0; i < 280; i++) {
    const rx = (i * 37) % width;
    const nx = (rx / width) * Math.PI * 12;
    const ry = 64 + Math.sin(nx) * 12 + ((i * 19) % 28 - 14);
    const r = 0.9 + (i % 3) * 0.8;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
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
  grad.addColorStop(0, 'rgba(10, 20, 38, 0.45)');
  grad.addColorStop(0.25, 'rgba(12, 24, 44, 0.3)');
  grad.addColorStop(0.55, 'rgba(14, 28, 52, 0.12)');
  grad.addColorStop(0.8, 'rgba(16, 32, 58, 0.03)');
  grad.addColorStop(1, 'rgba(16, 32, 58, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.76, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 1. PROCEDURAL NIGHT SKY DOME & TWINKLING STARFIELD (NO MOON)
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
        color="#E0F2FE"
        transparent
        opacity={0}
        linewidth={2}
        depthWrite={false}
      />
    </lineSegments>
  );
};

// ============================================================================
// 2. OCEAN WITH ORGANIC CURVING SHORELINE & MULTI-LAYER SURF
// ============================================================================

/**
 * Generates an organic wave foam ribbon geometry that follows getShorelineZ(x)
 */
function createFoamRibbonGeometry(width = 145, segments = 72, depth = 1.4): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertexCount = (segments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const halfWidth = width / 2;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -halfWidth + t * width;
    const shoreZ = getShorelineZ(x);

    // Vertex 0: Oceanward edge
    positions[i * 6] = x;
    positions[i * 6 + 1] = 0.015;
    positions[i * 6 + 2] = shoreZ - depth * 0.5;
    uvs[i * 4] = t * 6;
    uvs[i * 4 + 1] = 0;

    // Vertex 1: Shoreward edge
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = 0.022;
    positions[i * 6 + 5] = shoreZ + depth * 0.5;
    uvs[i * 4 + 2] = t * 6;
    uvs[i * 4 + 3] = 1;

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Generates a curved wet sand transition ribbon that matches getShorelineZ(x)
 */
function createWetSandRibbonGeometry(width = 145, segments = 72): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertexCount = (segments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const halfWidth = width / 2;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -halfWidth + t * width;
    const shoreZ = getShorelineZ(x);

    // Vertex 0: Seaward edge
    positions[i * 6] = x;
    positions[i * 6 + 1] = -0.025;
    positions[i * 6 + 2] = shoreZ - 1.8;
    uvs[i * 4] = t * 8;
    uvs[i * 4 + 1] = 0;

    // Vertex 1: Landward edge
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = 0.005;
    positions[i * 6 + 5] = shoreZ + 1.6;
    uvs[i * 4 + 2] = t * 8;
    uvs[i * 4 + 3] = 1;

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

const OrganicShorelineOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const foam1Ref = useRef<THREE.Mesh>(null);
  const foam2Ref = useRef<THREE.Mesh>(null);

  const waterNormalMap = useMemo(() => createWaterNormalTexture(), []);
  const foamTexture = useMemo(() => createShorelineFoamTexture(), []);

  // Multi-layer organic foam ribbons following getShorelineZ(x)
  const foamRibbon1 = useMemo(() => createFoamRibbonGeometry(145, 72, 1.4), []);
  const foamRibbon2 = useMemo(() => createFoamRibbonGeometry(145, 72, 1.0), []);

  // Ocean Plane: 80 x 50 subdivisions spanning from Z = -2.5 to Z = -75, width = 150
  const { geometry, initialPositions } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(150, 72, 80, 50);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime() * 1.05;

    if (waterNormalMap) {
      waterNormalMap.offset.y = (waterNormalMap.offset.y - delta * 0.018) % 1.0;
      waterNormalMap.offset.x = (waterNormalMap.offset.x + delta * 0.006) % 1.0;
    }

    if (meshRef.current) {
      const geom = meshRef.current.geometry;
      const pos = geom.attributes.position.array as Float32Array;

      for (let i = 0; i < pos.length; i += 3) {
        const origX = initialPositions[i];
        const origZ = initialPositions[i + 2];

        // Smooth multi-frequency rolling swells
        const wave1 = Math.sin(origZ * 0.28 + t * 1.4) * 0.12;
        const wave2 = Math.cos(origX * 0.16 - origZ * 0.12 + t * 1.0) * 0.06;
        const wave3 = Math.sin((origX * 0.4 + origZ * 0.3) + t * 2.0) * 0.028;

        // Dampen organically near the shoreline curve getShorelineZ(origX)
        const shoreZ = getShorelineZ(origX);
        const distFromShore = Math.max(0, shoreZ - origZ);
        const shoreDamp = Math.min(1.0, distFromShore * 0.25);

        pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.035;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
    }

    // Layer 1 Shoreline surge forward & back along curve
    if (foam1Ref.current) {
      const surge1 = Math.sin(t * 1.4) * 0.38;
      foam1Ref.current.position.z = surge1;
    }

    // Layer 2 Secondary wave wash
    if (foam2Ref.current) {
      const surge2 = Math.sin(t * 1.4 - 0.75) * 0.28;
      foam2Ref.current.position.z = -0.3 + surge2;
    }
  });

  return (
    <group position={[0, -0.04, -38.5]} name="Organic_Shoreline_Ocean">
      {/* 3D Ocean Surface: Rich royal-blue fading to cyan shallows */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          normalMap={waterNormalMap || undefined}
          normalScale={new THREE.Vector2(0.42, 0.42)}
          color="#104e84" // Rich royal ocean blue
          roughness={0.15}
          metalness={0.06} // Dielectric fluid water (zero black mirror / oil look)
          emissive="#06294a"
          emissiveIntensity={0.28}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Layer 1: Primary organic wave foam ribbon along curved shoreline */}
      {foamTexture && (
        <mesh ref={foam1Ref} geometry={foamRibbon1} position={[0, 0.022, 38.5]}>
          <meshBasicMaterial
            map={foamTexture}
            color="#D8F2FF"
            transparent
            opacity={0.65}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Layer 2: Secondary soft frothy wash ribbon along curved shoreline */}
      {foamTexture && (
        <mesh ref={foam2Ref} geometry={foamRibbon2} position={[0, 0.016, 38.2]}>
          <meshBasicMaterial
            map={foamTexture}
            color="#EAF6FF"
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

// ============================================================================
// 3. NOTICEABLY BRIGHTER BLUE-GREY SAND WITH CURVED SHORELINE
// ============================================================================

const LivelyBlueSandBeach: React.FC<{ characterPosition?: THREE.Vector3 }> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const sandTexture = useMemo(() => createLuminousBlueSandTexture(), []);
  const contactShadowTexture = useMemo(() => createSoftContactShadowTexture(), []);

  // Wet sand curved ribbon following getShorelineZ(x)
  const wetSandRibbon = useMemo(() => createWetSandRibbonGeometry(145, 72), []);

  // Sandy beach terrain (width 145, depth 58, 80x50)
  const { geometry } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(145, 58, 80, 50);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];

      const shoreZ = getShorelineZ(x);
      const distFromCenter = Math.sqrt(x * x + z * z);

      if (distFromCenter <= 3.5) {
        // Flat, stable standing platform under Hina & piano within radius 3.5m
        pos[i + 1] = 0.0;
      } else {
        // Subtle natural rolling dunes (gentle undulations)
        const dune =
          Math.sin(x * 0.08) * 0.05 +
          Math.cos(z * 0.12) * 0.04 +
          Math.sin(x * 0.04 + z * 0.07) * 0.03;

        // Slope organically down into water along curved shoreline
        const distFromShore = z - shoreZ;
        const slope = distFromShore < 0 ? distFromShore * 0.035 : 0;
        pos[i + 1] = dune + slope;
      }
    }
    geom.computeVertexNormals();
    return { geometry: geom };
  }, []);

  const posX = characterPosition.x;
  const posZ = characterPosition.z;

  return (
    <group name="Lively_Blue_Sand">
      {/* Main Cool Luminous Silver-Blue Beach Sand Expanse */}
      <mesh position={[0, 0, 18.0]} geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={sandTexture || undefined}
          color="#9bb5dc" // Luminous cool blue-grey sand with silver highlights
          roughness={0.9} // Matte powdery finish
          metalness={0.0} // Zero metalness: no black sludge
        />
      </mesh>

      {/* Shoreline Wet Sand Ribbon: Follows the curving shoreline contour organically */}
      <mesh geometry={wetSandRibbon} position={[0, -0.01, 0]} receiveShadow>
        <meshStandardMaterial
          map={sandTexture || undefined}
          color="#5b7ea8" // Natural moist sand with cool periwinkle tone (NOT black or brown)
          roughness={0.42} // Gentle wet starlight sheen
          metalness={0.02}
          transparent
          opacity={0.82}
        />
      </mesh>

      {/* Soft Naturally Feathered Contact Shadow (Zero artificial rings or black disks) */}
      {contactShadowTexture && (
        <mesh
          position={[posX, 0.004, posZ - 0.12]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[4.4, 3.6]} />
          <meshBasicMaterial
            map={contactShadowTexture}
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
// 4. REDESIGNED DELICATE AMBIENT BEACH SPARKLES
// ============================================================================

/**
 * Ambient Beach Sparkles:
 * Redesigned from scratch: delicate, tiny points of light (size 0.35 - 1.1)
 * clustered along the organic curving shoreline getShorelineZ(x).
 * Staggered asynchronous twinkling with zero bright floating LED bulb appearance.
 */
const BeachSparkles: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const sparkleCount = 380;
  const starDotTexture = useMemo(() => createStarDotTexture(), []);

  const [positions, colors, baseSizes, phases, speeds] = useMemo(() => {
    const pos = new Float32Array(sparkleCount * 3);
    const col = new Float32Array(sparkleCount * 3);
    const sizes = new Float32Array(sparkleCount);
    const ph = new Float32Array(sparkleCount);
    const sp = new Float32Array(sparkleCount);

    const palette = [
      new THREE.Color('#ffffff'), // Diamond white
      new THREE.Color('#d4f4ff'), // Pale cyan
      new THREE.Color('#bae6fd'), // Ice blue
      new THREE.Color('#c7d2fe'), // Soft periwinkle
      new THREE.Color('#7dd3fc'), // Turquoise starlight
    ];

    for (let i = 0; i < sparkleCount; i++) {
      // Distributed organically along the curved shoreline contour getShorelineZ(x)
      const x = (Math.random() - 0.5) * 62;
      const shoreZ = getShorelineZ(x);
      // Tight band around the wet sand line: between shoreZ - 2.8 and shoreZ + 1.2
      const offset = (Math.random() - 0.4) * 3.6;
      const z = shoreZ + offset;

      // Pinned directly to the sand/water surface heights (y ~ 0.012)
      const y = 0.012 + Math.random() * 0.008;

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      // Tiny, delicate starlight glints (NOT large LED bulbs)
      sizes[i] = 0.4 + Math.random() * 0.65;

      ph[i] = Math.random() * Math.PI * 2;
      sp[i] = 1.0 + Math.random() * 2.2;
    }

    return [pos, col, sizes, ph, sp];
  }, [sparkleCount]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (pointsRef.current) {
      const geom = pointsRef.current.geometry;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;
      if (sizeAttr) {
        for (let i = 0; i < sparkleCount; i++) {
          const pulse = Math.pow(Math.sin(t * speeds[i] + phases[i]), 4);
          const currentSize = baseSizes[i] * (0.3 + 0.8 * pulse);
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
        size={0.9}
        transparent
        opacity={0.82}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

// ============================================================================
// 5. MUSIC-REACTIVE OCEAN PARTICLES (BIOLUMINESCENT PIANO NOTES)
// ============================================================================

interface ReactiveParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseSize: number;
  color: THREE.Color;
}

/**
 * Piano-Reactive Ocean Particles:
 * When YouTube music is playing AND Dress Hina's piano performance is active,
 * glowing bioluminescent particles gracefully rise from the ocean in synchronization
 * with the musical keystrokes/phrasing.
 *
 * Timing Integration:
 * - Reads Hina's 3D animation performance action time (currentAction.time in Exs_Cutin).
 * - Tracks rhythmic keystroke cadence and hand downstroke impulses.
 * - Spawns delicate bursts of cyan, ice blue, pale violet, and white starlight particles.
 * - When music pauses or stops, active particles fade naturally without abrupt cutoff.
 */
const PianoOceanParticles: React.FC<{
  character?: LoadedCharacterInstance;
  isPlaying?: boolean;
  isPianoVisible?: boolean;
}> = ({ character, isPlaying = false, isPianoVisible = false }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = 160;
  const starDotTexture = useMemo(() => createStarDotTexture(), []);

  // Pre-allocated circular particle pool (Zero GC allocations per frame)
  const particles = useRef<ReactiveParticle[]>([]);
  const lastTriggerTime = useRef<number>(0);
  const prevHandY = useRef<number>(0);
  const prevHandVelY = useRef<number>(0);

  // Initialize particle pool once
  useEffect(() => {
    particles.current = Array.from({ length: particleCount }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 2.2,
      baseSize: 1.2,
      color: new THREE.Color('#22d3ee'),
    }));
  }, [particleCount]);

  const [positions, colors, sizes] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const sz = new Float32Array(particleCount);
    // Initially place inactive particles far below scene
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3 + 1] = -100;
      sz[i] = 0;
    }
    return [pos, col, sz];
  }, [particleCount]);

  // Spawns a musical note cluster rising from the ocean
  const spawnNoteBurst = (pitchRegister: 'high' | 'mid' | 'bass', intensity: number) => {
    const pool = particles.current;
    const burstCount = pitchRegister === 'bass' ? 6 : pitchRegister === 'high' ? 10 : 8;

    const palette =
      pitchRegister === 'high'
        ? [new THREE.Color('#ffffff'), new THREE.Color('#bae6fd'), new THREE.Color('#38bdf8')]
        : pitchRegister === 'bass'
        ? [new THREE.Color('#c084fc'), new THREE.Color('#818cf8'), new THREE.Color('#22d3ee')]
        : [new THREE.Color('#22d3ee'), new THREE.Color('#e0f2fe'), new THREE.Color('#a5f3fc')];

    // Spawn location: rising from the ocean surface in the midground (safe distance from Hina)
    const centerX = pitchRegister === 'high' ? 4.5 + Math.random() * 5.0 : pitchRegister === 'bass' ? -5.5 - Math.random() * 5.0 : (Math.random() - 0.5) * 8.0;
    const centerZ = -7.5 - Math.random() * 9.0;

    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < burstCount; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.x = centerX + (Math.random() - 0.5) * 3.5;
        p.y = 0.02 + Math.random() * 0.05;
        p.z = centerZ + (Math.random() - 0.5) * 3.0;

        // Upward rising trajectory with gentle ocean breeze drift
        p.vy = 1.3 + Math.random() * 0.9 * intensity;
        p.vx = (Math.random() - 0.5) * 0.25;
        p.vz = -0.05 + (Math.random() - 0.5) * 0.15;

        p.life = 0;
        p.maxLife = 1.8 + Math.random() * 0.9;
        p.baseSize = pitchRegister === 'high' ? 0.9 + Math.random() * 0.6 : 1.3 + Math.random() * 0.8;
        p.color = palette[Math.floor(Math.random() * palette.length)].clone();
        spawned++;
      }
    }
  };

  useFrame(({ clock }, delta) => {
    const safeDelta = Math.min(delta, 0.08);
    const pool = particles.current;
    const now = clock.getElapsedTime();

    // =========================================================================
    // TIMING DETECTION: Sourced from Hina's active 3D performance animation
    // Synchronized with active YouTube playback & piano visibility
    // =========================================================================
    const canEmit = isPlaying && isPianoVisible && character;

    if (canEmit && character) {
      const currentAction = character.currentAction;
      const animName = character.currentAnimationName || '';
      const isExs = animName === 'Exs_Cutin' || animName === 'exs_cutin';

      if (currentAction && isExs) {
        // Method 1: Hand bone downstroke tracking (physical key strike)
        let handTriggered = false;
        const handBone =
          character.scene.getObjectByName('Bip001 R Hand') ||
          character.scene.getObjectByName('RightHand') ||
          character.scene.getObjectByName('Bone_R_Hand');

        if (handBone) {
          const worldPos = new THREE.Vector3();
          handBone.getWorldPosition(worldPos);
          const currentY = worldPos.y;
          const currentVelY = (currentY - prevHandY.current) / Math.max(0.001, safeDelta);

          // Downstroke reversal: hand reaches bottom of keystroke and starts moving up
          if (prevHandVelY.current < -0.15 && currentVelY >= -0.05 && now - lastTriggerTime.current > 0.32) {
            handTriggered = true;
            lastTriggerTime.current = now;
            const pitch = worldPos.x > 0 ? 'high' : 'bass';
            spawnNoteBurst(pitch, 1.1);
          }

          prevHandY.current = currentY;
          prevHandVelY.current = currentVelY;
        }

        // Method 2: Cadenced animation action musical phrase timing fallback
        if (!handTriggered) {
          const actionTime = currentAction.time;
          // Loop intervals matching piano phrase cadence in Exs_Cutin (~0.45s to 0.75s)
          const phraseInterval = 0.52;
          const currentPhrase = Math.floor(actionTime / phraseInterval);
          const lastPhrase = Math.floor((actionTime - safeDelta) / phraseInterval);

          if (currentPhrase !== lastPhrase && now - lastTriggerTime.current > 0.35) {
            lastTriggerTime.current = now;
            const pitch = currentPhrase % 3 === 0 ? 'high' : currentPhrase % 3 === 1 ? 'bass' : 'mid';
            spawnNoteBurst(pitch, 1.0);
          }
        }
      } else if (isPlaying) {
        // Method 3: Rhythmic concert beat fallback when YouTube is playing
        if (now - lastTriggerTime.current > 0.65) {
          lastTriggerTime.current = now;
          spawnNoteBurst('mid', 0.9);
        }
      }
    }

    // =========================================================================
    // UPDATE ACTIVE PARTICLES & BUFFER ATTRIBUTES
    // =========================================================================
    if (pointsRef.current) {
      const geom = pointsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;

      if (posAttr && colAttr && sizeAttr) {
        for (let i = 0; i < pool.length; i++) {
          const p = pool[i];
          if (p.active) {
            p.life += safeDelta;
            if (p.life >= p.maxLife) {
              p.active = false;
              posAttr.setY(i, -100);
              sizeAttr.setX(i, 0);
              continue;
            }

            // Upward motion with gentle aerodynamic deceleration
            p.y += p.vy * safeDelta;
            p.x += p.vx * safeDelta;
            p.z += p.vz * safeDelta;
            p.vy *= 0.965; // Soft upward deceleration

            // Graceful lifecycle curve: quick birth fade-in, smooth starlight dissipation
            const progress = p.life / p.maxLife;
            const fade = progress < 0.2 ? progress / 0.2 : 1.0 - (progress - 0.2) / 0.8;
            const shimmer = 0.8 + 0.35 * Math.sin(now * 8.0 + i * 2.1);
            const currentSize = p.baseSize * fade * shimmer;

            posAttr.setXYZ(i, p.x, p.y, p.z);
            colAttr.setXYZ(i, p.color.r * fade, p.color.g * fade, p.color.b * fade);
            sizeAttr.setX(i, currentSize);
          } else {
            posAttr.setY(i, -100);
            sizeAttr.setX(i, 0);
          }
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
      }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        map={starDotTexture || undefined}
        vertexColors
        size={1.3}
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
// 6. DISTANT COASTAL SCENERY & NATURAL DEPTH (NO EMPTY VOID)
// ============================================================================

const CoastalAtmosphereAndDetails: React.FC = () => {
  return (
    <group name="Coastal_Atmosphere_And_Details">
      {/* Far Left Atmospheric Coastal Sea Stack / Headland */}
      <group position={[-42, 0.8, -45]} rotation={[0, 0.4, 0]}>
        <mesh position={[0, 1.8, 0]} scale={[9.5, 4.2, 7.5]}>
          <dodecahedronGeometry args={[1, 2]} />
          <meshStandardMaterial
            color="#0d1f3b" // Deep oceanic navy-slate
            roughness={0.82}
            metalness={0.05}
          />
        </mesh>
        <mesh position={[5.2, 1.0, 2.5]} scale={[5.5, 2.4, 4.8]}>
          <dodecahedronGeometry args={[1, 2]} />
          <meshStandardMaterial
            color="#0b1a33"
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Far Right Low Coastal Islands Silhouette */}
      <group position={[45, 0.6, -48]} rotation={[0, -0.45, 0]}>
        <mesh position={[0, 1.6, 0]} scale={[10.5, 3.8, 7.0]}>
          <dodecahedronGeometry args={[1, 2]} />
          <meshStandardMaterial
            color="#0d1f3b"
            roughness={0.82}
            metalness={0.05}
          />
        </mesh>
        <mesh position={[-4.8, 0.9, 3.0]} scale={[5.8, 2.2, 4.4]}>
          <dodecahedronGeometry args={[1, 2]} />
          <meshStandardMaterial
            color="#0b1a33"
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Small Smooth Beach Stones & Shells on the Far Flanks (Away from Hina) */}
      <group position={[-11.5, 0.05, 5.0]}>
        <mesh scale={[0.18, 0.08, 0.14]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#6a84a8" roughness={0.65} />
        </mesh>
      </group>
      <group position={[12.8, 0.05, 5.5]}>
        <mesh scale={[0.22, 0.09, 0.16]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#728db3" roughness={0.65} />
        </mesh>
      </group>
      <group position={[-13.8, 0.04, 3.2]}>
        <mesh scale={[0.14, 0.07, 0.12]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#5f7799" roughness={0.7} />
        </mesh>
      </group>

      {/* Soft Coastal Horizon Haze: Blends the distant ocean naturally into the sky dome */}
      <mesh position={[0, 2.2, -58]}>
        <planeGeometry args={[155, 7.5]} />
        <meshBasicMaterial
          color="#153664"
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
};

// ============================================================================
// MAIN NIGHT BEACH CINEMATIC SCENE
// ============================================================================

export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
  character,
  isPianoVisible = false,
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
    <group name="NightBeachScene_Root">
      {/* 1. Seamless Procedural Sky Dome & Twinkling Starfield */}
      <ProceduralSkyDome />
      <TwinklingStarfield />
      <ShootingMeteors />

      {/* 2. Coastal Atmosphere, Rocky Headlands & Horizon Haze */}
      <CoastalAtmosphereAndDetails />

      {/* 3. Ocean with Natural Curving Shoreline & Multi-Layer Surf */}
      <OrganicShorelineOcean />

      {/* 4. Noticeably Brighter Silver-Blue Beach Sand */}
      <LivelyBlueSandBeach characterPosition={characterPosition} />

      {/* 5. Delicate Ambient Beach Sparkles along Curved Shoreline */}
      <BeachSparkles />

      {/* 6. Piano-Reactive Ocean Particles (Bioluminescent Starlight Lift) */}
      <PianoOceanParticles
        character={character}
        isPlaying={isPlaying}
        isPianoVisible={isPianoVisible}
      />

      {/* 7. Noticeably Brighter Coordinated Nighttime Starlight Lighting */}
      {/* Primary Starlight Key Light */}
      <directionalLight
        position={[5, 18, -10]}
        intensity={1.8}
        color="#D4ECFF" // Crisp cool starlight cyan-white
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Sapphire Midnight Ambient Light (brightens scene, prevents pitch-black shadows) */}
      <ambientLight intensity={1.2} color="#1A3356" />

      {/* Luminous Blue Sand Upward Diffuse Bounce Light */}
      <directionalLight
        position={[0, -5, 2]}
        intensity={0.55}
        color="#4D75A6"
      />

      {/* Cool Starlight Rim Backlight (silhouette separation for Hina & piano) */}
      <directionalLight
        position={[-8, 7, -12]}
        intensity={0.9}
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

export default NightBeachScene;
