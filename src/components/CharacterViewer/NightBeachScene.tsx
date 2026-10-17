import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export interface NightBeachSceneProps {
  characterPosition?: THREE.Vector3;
  isMini?: boolean;
}

// ============================================================================
// PROCEDURAL TEXTURE GENERATORS (Zero 404s, High Quality, Fully Self-Contained)
// ============================================================================

/**
 * Procedural Sky Dome Gradient Texture:
 * Rich celestial vertical gradient from deepest midnight obsidian navy at zenith
 * down to deep sapphire, indigo, and soft oceanic twilight at the horizon.
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
  grad.addColorStop(0.0, '#030714'); // Zenith: Deepest midnight obsidian
  grad.addColorStop(0.25, '#06122d'); // High celestial: Rich midnight navy
  grad.addColorStop(0.55, '#0b1d47'); // Mid sky: Deep sapphire indigo
  grad.addColorStop(0.82, '#122e66'); // Lower sky: Oceanic blue
  grad.addColorStop(0.96, '#18427a'); // Horizon transition: Luminous twilight indigo
  grad.addColorStop(1.0, '#1a4782'); // Horizon line

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Soft subtle cosmic dust / nebula wisps across upper sky
  for (let i = 0; i < 4; i++) {
    const rx = 200 + i * 220;
    const ry = 180 + (i % 2) * 140;
    const rad = 240 + i * 40;
    const dustGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    dustGrad.addColorStop(0, 'rgba(40, 85, 170, 0.12)');
    dustGrad.addColorStop(0.5, 'rgba(28, 60, 130, 0.05)');
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
 * Procedural Soft Circular Star Glow Texture for Starfield & Sparkles
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
  grad.addColorStop(0.25, 'rgba(220, 245, 255, 0.85)');
  grad.addColorStop(0.55, 'rgba(160, 215, 255, 0.35)');
  grad.addColorStop(1, 'rgba(120, 180, 255, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural Fine-Grained Cool Blue Sand Texture:
 * Micro-granule noise, shallow wind-sand ripples, and pale cyan/periwinkle starlight highlights.
 * Avoids pure black, muddy brown, or repetitive tiling.
 */
function createCoolBlueSandTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base cool periwinkle-blue beach sand fill
  ctx.fillStyle = '#7a93ba';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // Multi-frequency micro grain & shallow wind ripples
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Shallow sand ripples
      const ripple = Math.sin(x * 0.08 + Math.sin(y * 0.04) * 2.5) * 8;
      // High-frequency sand grain noise
      const noise1 = (Math.random() - 0.5) * 22;
      const noise2 = (Math.random() - 0.5) * 12;
      const lum = ripple + noise1 + noise2;

      // Base color: R: 122, G: 147, B: 186 (cool blue-grey with periwinkle tint)
      data[idx] = Math.max(90, Math.min(160, 122 + lum * 0.7));
      data[idx + 1] = Math.max(115, Math.min(185, 147 + lum * 0.85));
      data[idx + 2] = Math.max(150, Math.min(225, 186 + lum * 1.05)); // Slight blue boost
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
 * Adds fine wave facets and dancing specular reflections across the blue ocean.
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
        Math.cos(u * 1.5 + v * 0.8) * 0.4 +
        Math.cos(u * 3.0 - v * 2.0) * 0.25 +
        Math.cos(u * 6.0 + v * 3.8) * 0.12;
      const dy =
        Math.sin(v * 1.5 + u * 0.8) * 0.4 +
        Math.sin(v * 3.0 - u * 2.0) * 0.25 +
        Math.sin(v * 6.0 + u * 3.8) * 0.12;

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
 * Soft scalloped froth band with irregular bubbly noise that surges gently with small waves.
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
    const waveOffset = Math.sin(nx) * 11 + Math.cos(nx * 2.4) * 6 + Math.sin(nx * 4.8) * 3;
    const centerY = 64 + waveOffset;

    const grad = ctx.createLinearGradient(x, centerY - 24, x, centerY + 24);
    grad.addColorStop(0, 'rgba(195, 235, 255, 0)');
    grad.addColorStop(0.3, 'rgba(215, 245, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(240, 252, 255, 0.85)');
    grad.addColorStop(0.7, 'rgba(205, 240, 255, 0.38)');
    grad.addColorStop(1, 'rgba(185, 230, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(x, centerY - 24, 3, 48);
  }

  // Micro bubbly foam froth
  ctx.fillStyle = 'rgba(245, 253, 255, 0.7)';
  for (let i = 0; i < 280; i++) {
    const rx = (i * 37) % width;
    const nx = (rx / width) * Math.PI * 12;
    const ry = 64 + Math.sin(nx) * 11 + ((i * 19) % 28 - 14);
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
  grad.addColorStop(0, 'rgba(10, 18, 34, 0.46)');
  grad.addColorStop(0.25, 'rgba(12, 22, 40, 0.32)');
  grad.addColorStop(0.55, 'rgba(14, 26, 48, 0.12)');
  grad.addColorStop(0.8, 'rgba(16, 30, 54, 0.03)');
  grad.addColorStop(1, 'rgba(16, 30, 54, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.76, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 1. SEAMLESS PROCEDURAL NIGHT SKY DOME & TWINKLING STARFIELD (NO MOON)
// ============================================================================

/**
 * Procedural Sky Dome with smooth vertical celestial gradient.
 * Eliminates static photographic images, visible seams, or floating rectangles.
 */
const ProceduralSkyDome: React.FC = () => {
  const skyTexture = useMemo(() => createProceduralSkyTexture(), []);

  return (
    <group name="Procedural_Sky_Dome">
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <sphereGeometry args={[130, 48, 24]} />
        <meshBasicMaterial
          map={skyTexture || undefined}
          color={skyTexture ? '#ffffff' : '#0a1638'}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * Lively 3D Twinkling Starfield:
 * ~2,200 naturally distributed stars across the upper sky dome.
 * Subtle individual brightness twinkling (never flashing the whole sky).
 * Varied celestial colors: cool diamond white, pale cyan, icy blue, and periwinkle.
 */
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
      new THREE.Color('#ffffff'), // Pure diamond white
      new THREE.Color('#d8f0ff'), // Cool ice blue
      new THREE.Color('#bae6fd'), // Pale cyan
      new THREE.Color('#e0e7ff'), // Soft periwinkle
      new THREE.Color('#93c5fd'), // Azure starlight
    ];

    for (let i = 0; i < starCount; i++) {
      // Uniform hemisphere distribution (upper sky: y > 2)
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(1.0 - v * 0.92); // Constrain mostly above horizon

      const r = 120 + Math.random() * 8;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.max(3.0, r * Math.cos(phi));
      const z = r * Math.sin(phi) * Math.sin(theta);

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      // Color variation
      const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      // Varied star sizes: most fine micro-stars, occasional brighter beacon
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
          // Subtle twinkle: oscillates brightness/size gently without flashing
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

/**
 * Occasional Shooting Meteors:
 * Graceful starlight streaks crossing the upper celestial sphere and fading naturally.
 */
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
// 2. LIVELY BLUE OCEAN & GENTLE MULTI-LAYER SURF
// ============================================================================

/**
 * Lively Blue Ocean:
 * Deep rich oceanic blue (#0c3f6e) transitioning to vibrant cobalt (#135c94) and cyan (#1f8ebf).
 * Gentle rolling swells with fine starlight ripples, zero black tar/oil appearance.
 */
const LivelyBlueOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const foam1Ref = useRef<THREE.Mesh>(null);
  const foam2Ref = useRef<THREE.Mesh>(null);

  const waterNormalMap = useMemo(() => createWaterNormalTexture(), []);
  const foamTexture = useMemo(() => createShorelineFoamTexture(), []);

  // Ocean Plane: 80 x 50 subdivisions spanning from Z = -2.4 to Z = -72, width = 150
  const { geometry, initialPositions } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(150, 70, 80, 50);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime() * 1.05;

    // Normal map starlight shimmer drift
    if (waterNormalMap) {
      waterNormalMap.offset.y = (waterNormalMap.offset.y - delta * 0.018) % 1.0;
      waterNormalMap.offset.x = (waterNormalMap.offset.x + delta * 0.006) % 1.0;
    }

    // 3D Harmonic Wave vertex displacement
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

        // Dampen smoothly near shoreline so water surface flows gently over sand
        const distFromShore = Math.max(0, -origZ - 2.4);
        const shoreDamp = Math.min(1.0, distFromShore * 0.26);

        pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.035;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
    }

    // Layer 1 Primary shoreline foam surge
    if (foam1Ref.current) {
      const surge1 = Math.sin(t * 1.4) * 0.36;
      foam1Ref.current.position.z = 34.8 + surge1;
    }

    // Layer 2 Secondary receding foam froth
    if (foam2Ref.current) {
      const surge2 = Math.sin(t * 1.4 - 0.7) * 0.28;
      foam2Ref.current.position.z = 35.3 + surge2;
    }
  });

  return (
    <group position={[0, -0.04, -37.4]} name="Lively_Blue_Ocean">
      {/* 3D Ocean Surface: Rich vibrant blue with cyan-teal depths */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          normalMap={waterNormalMap || undefined}
          normalScale={new THREE.Vector2(0.4, 0.4)}
          color="#125287" // Vibrant deep ocean blue
          roughness={0.16}
          metalness={0.06} // Low dielectric metalness: avoids black oil appearance
          emissive="#083154" // Soft oceanic depth glow
          emissiveIntensity={0.28}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Layer 1: Primary thin organic shoreline foam surging onto the sand */}
      {foamTexture && (
        <mesh
          ref={foam1Ref}
          position={[0, 0.022, 34.8]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[145, 1.4]} />
          <meshBasicMaterial
            map={foamTexture}
            color="#D8F2FF"
            transparent
            opacity={0.58}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Layer 2: Secondary soft frothy wash layer */}
      {foamTexture && (
        <mesh
          ref={foam2Ref}
          position={[0, 0.016, 35.3]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[145, 1.0]} />
          <meshBasicMaterial
            map={foamTexture}
            color="#E8F8FF"
            transparent
            opacity={0.38}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

// ============================================================================
// 3. BRIGHT & DISTINCTLY BLUE SAND BEACH
// ============================================================================

/**
 * Bright, distinctly blue beach sand:
 * - Cool blue-grey with soft periwinkle tones and pale cyan highlights (#7a93ba).
 * - High brightness: visibly blue, clean, and elegant under night starlight.
 * - Flat, stable standing area around Hina and the piano ([0, 0, 0], radius 3.5m).
 * - Gentle natural rolling dunes farther out, sloping smoothly into the water.
 * - Dedicated moist periwinkle wet sand transition zone.
 * - Soft feathered contact shadow (zero artificial black rings).
 */
const LivelyBlueSandBeach: React.FC<{ characterPosition?: THREE.Vector3 }> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const sandTexture = useMemo(() => createCoolBlueSandTexture(), []);
  const contactShadowTexture = useMemo(() => createSoftContactShadowTexture(), []);

  // Sandy beach terrain (width 140, depth 56)
  const { geometry } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(140, 56, 68, 46);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];

      // Flat, stable standing platform under Hina & piano within radius 3.5m
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter > 3.5) {
        // Natural gentle rolling dunes
        const dune =
          Math.sin(x * 0.08) * 0.055 +
          Math.cos(z * 0.13) * 0.045 +
          Math.sin(x * 0.04 + z * 0.07) * 0.035;
        // Slope smoothly down towards water near shoreline (Z < -0.8)
        const slope = z < -0.8 ? (z - -0.8) * 0.038 : 0;
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
      {/* Main Cool Blue-Grey Beach Sand Expanse */}
      <mesh position={[0, 0, 18.0]} geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={sandTexture || undefined}
          color="#8ca5cc" // Luminous cool blue-grey beach sand
          roughness={0.92} // Powdery matte finish
          metalness={0.0} // Zero metalness: no black sludge or oily shine
        />
      </mesh>

      {/* Shoreline Wet Sand Zone: Soft periwinkle moist sand with gentle starlight sheen */}
      <mesh
        position={[0, -0.012, -2.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[140, 2.6]} />
        <meshStandardMaterial
          map={sandTexture || undefined}
          color="#6583ab" // Natural moist sand with cool periwinkle tone (NOT black or brown)
          roughness={0.46} // Gentle wet starlight sheen
          metalness={0.02}
          transparent
          opacity={0.72}
        />
      </mesh>

      {/* Translucent Shallow Water Edge: smooth blend between water and sand */}
      <mesh
        position={[0, -0.016, -3.2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[140, 2.8]} />
        <meshStandardMaterial
          color="#1e73a6"
          roughness={0.2}
          metalness={0.04}
          transparent
          opacity={0.45}
          depthWrite={false}
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
// 4. MAGICAL STAINLESS SPARKLES ACROSS THE WET BEACH
// ============================================================================

/**
 * Magical Starlight Beach Sparkles:
 * Scatters ~420 tiny points of blue-white and pale-cyan light across the wet sand and shoreline.
 * Gently brighten and fade asynchronously, simulating starlight dancing on moist sand & tide.
 * Pinned directly to the sand/water surface heights (zero floating particles).
 */
const BeachSparkles: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const sparkleCount = 420;

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
      new THREE.Color('#7dd3fc'), // Bright turquoise cyan
    ];

    for (let i = 0; i < sparkleCount; i++) {
      // Clustered across wet sand and shoreline: z between -1.0 and -5.8, x between -32 and 32
      const x = (Math.random() - 0.5) * 64;
      const zProgress = Math.random();
      const z = -1.0 - Math.pow(zProgress, 1.2) * 5.0; // Denser near waterline

      // Pinned flush to ground contour (y ~ 0.01 to 0.02)
      const y = 0.012 + Math.random() * 0.01;

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      // Mostly tiny, delicate sparkles with occasional brighter point
      const isBeacon = Math.random() < 0.12;
      sizes[i] = isBeacon ? 1.8 + Math.random() * 0.8 : 0.75 + Math.random() * 0.65;

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
          // Asynchronous soft pulse: powers of sine create crisp sparkling peaks
          const pulse = Math.pow(Math.sin(t * speeds[i] + phases[i]), 4);
          const currentSize = baseSizes[i] * (0.35 + 0.85 * pulse);
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
        size={1.2}
        transparent
        opacity={0.88}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

// ============================================================================
// 5. DISTANT COASTAL SILHOUETTES & HORIZON DEPTH (NO EMPTY VOID)
// ============================================================================

/**
 * Distant Coastal Rocky Headlands & Shoreline Details:
 * Adds small rocky headland formations along the far flanks (x = -40 and x = +44)
 * with soft cool blue rim lighting, small smooth beach stones safely on the distant flanks,
 * and a thin horizontal atmospheric horizon haze layer for natural oceanic depth.
 * Foreground around Hina and the piano is kept 100% clean and unobstructed.
 */
const CoastalAtmosphereAndDetails: React.FC = () => {
  return (
    <group name="Coastal_Atmosphere_And_Details">
      {/* Far Left Rocky Headland Silhouette */}
      <group position={[-38, 1.2, -34]} rotation={[0, 0.35, 0]}>
        <mesh position={[0, 1.2, 0]} scale={[8.5, 3.2, 7.0]}>
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#0c182c" // Dark coastal headland slate
            roughness={0.88}
            metalness={0.05}
          />
        </mesh>
        <mesh position={[4.5, 0.7, 2.0]} scale={[5.0, 2.0, 4.5]}>
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#0a1424"
            roughness={0.9}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Far Right Low Coastal Rocks */}
      <group position={[42, 1.0, -36]} rotation={[0, -0.4, 0]}>
        <mesh position={[0, 1.0, 0]} scale={[9.0, 2.8, 6.5]}>
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#0c182c"
            roughness={0.88}
            metalness={0.05}
          />
        </mesh>
        <mesh position={[-4.2, 0.6, 2.5]} scale={[5.2, 1.8, 4.0]}>
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#0a1424"
            roughness={0.9}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* Small Smooth Beach Stones on the Far Flanks (Safely far from center stage) */}
      <group position={[-9.5, 0.05, 4.5]}>
        <mesh scale={[0.18, 0.08, 0.14]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#556c8a" roughness={0.7} />
        </mesh>
      </group>
      <group position={[11.2, 0.05, 5.2]}>
        <mesh scale={[0.22, 0.09, 0.16]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#5e7594" roughness={0.7} />
        </mesh>
      </group>
      <group position={[-12.0, 0.04, 2.8]}>
        <mesh scale={[0.14, 0.07, 0.12]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#4f6580" roughness={0.75} />
        </mesh>
      </group>

      {/* Soft Thin Coastal Horizon Mist Layer: creates seamless water-sky depth */}
      <mesh position={[0, 1.8, -52]} rotation={[0, 0, 0]}>
        <planeGeometry args={[145, 6.5]} />
        <meshBasicMaterial
          color="#163866"
          transparent
          opacity={0.25}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
};

// ============================================================================
// MAIN NIGHT BEACH CINEMATIC SCENE (LIVELY BLUE MOONLESS BEACH)
// ============================================================================

/**
 * MAIN NIGHT BEACH CINEMATIC SCENE
 * Full Visual Specification:
 * - 100% MOONLESS: No 3D moon, no halo, no corona, no narrow moon reflection column.
 * - Procedural Starry Sky Dome: Rich deep navy-to-sapphire gradient with zero static image seams.
 * - Twinkling Starfield: ~2,200 stars with individual, gentle asynchronous brightness twinkling.
 * - Shooting Meteors: Occasional graceful starlight streaks.
 * - Lively Blue Ocean: Rich deep blue (#125287) transitioning to vibrant cobalt and cyan near shore.
 * - Distinctly Blue Sand: Luminous cool blue-grey (#8ca5cc) with periwinkle undertones (zero black sludge).
 * - Multi-Layer Shoreline Foam: Organic scalloped froth surging and receding with wave rhythm.
 * - Magical Beach Sparkles: ~420 shimmering points of pale-cyan and diamond-white light on the wet sand.
 * - Coastal Details: Distant rocky headlands, subtle horizon mist, and small beach stones on the far flanks.
 * - Noticeably Brighter Coordinated Starlight Lighting Rig in cool blue & indigo palette.
 * - 100% ISOLATED from character mixer, animation actions, model transforms, and piano visibility.
 */
export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera && camera.far < 160) {
      camera.far = 160;
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

      {/* 3. Lively Blue Ocean with Multi-Layer Surf */}
      <LivelyBlueOcean />

      {/* 4. Bright Distinctly Blue Beach Sand */}
      <LivelyBlueSandBeach characterPosition={characterPosition} />

      {/* 5. Magical Starlight Sparkles on the Wet Sand & Shoreline */}
      <BeachSparkles />

      {/* 6. Noticeably Brighter Coordinated Nighttime Starlight Lighting */}
      {/* Primary Celestial Starlight Key Light */}
      <directionalLight
        position={[5, 18, -10]}
        intensity={1.75}
        color="#C8E4FE" // Crisp cool starlight cyan-white
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Deep Midnight Sapphire Ambient Light (brightens scene, prevents pitch-black shadows) */}
      <ambientLight intensity={1.15} color="#162D4E" />

      {/* Luminous Blue Sand Upward Diffuse Bounce Light */}
      <directionalLight
        position={[0, -5, 2]}
        intensity={0.5}
        color="#456B96"
      />

      {/* Cool Starlight Rim Backlight (crisp silhouette separation for Hina & piano) */}
      <directionalLight
        position={[-8, 7, -12]}
        intensity={0.85}
        color="#85BBF5"
      />

      {/* Soft Front Key (clean illumination for character expression, dress, and piano keys) */}
      <directionalLight
        position={[0, 3.2, 5.5]}
        intensity={0.75}
        color="#F0F6FF"
      />
    </group>
  );
};

export default NightBeachScene;
