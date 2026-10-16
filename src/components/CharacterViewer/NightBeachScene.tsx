import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export interface NightBeachSceneProps {
  characterPosition?: THREE.Vector3;
  isMini?: boolean;
}

/**
 * Texture loader helper with sRGB encoding and repeat wrapping configuration.
 */
function loadTexture(
  url: string,
  repeatX = 1,
  repeatY = 1,
  wrap: THREE.Wrapping = THREE.RepeatWrapping
): THREE.Texture {
  const loader = new THREE.TextureLoader();
  const texture = loader.load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn(`[NightBeach] Texture load fallback for ${url}:`, err);
    }
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

/**
 * Procedural seamless water ripple normal map generator.
 * Produces fine wave details, surface facets, and natural starlight shimmer across the water.
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

      // Multi-frequency wave slopes
      const dx =
        Math.cos(u * 1.4 + v * 0.7) * 0.35 +
        Math.cos(u * 2.8 - v * 1.8) * 0.22 +
        Math.cos(u * 5.5 + v * 3.5) * 0.1;
      const dy =
        Math.sin(v * 1.4 + u * 0.7) * 0.35 +
        Math.sin(v * 2.8 - u * 1.8) * 0.22 +
        Math.sin(v * 5.5 + u * 3.5) * 0.1;

      let nx = -dx * 0.7;
      let ny = -dy * 0.7;
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
 * Procedural organic shoreline foam texture generator.
 * Creates an irregular, soft-feathered scalloped froth band with micro-bubbles,
 * replacing the previous harsh rectangular artificial band.
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

  // Soft gradient band with organic scalloped clusters
  for (let x = 0; x < width; x += 4) {
    const nx = (x / width) * Math.PI * 10;
    const waveOffset = Math.sin(nx) * 10 + Math.cos(nx * 2.2) * 6 + Math.sin(nx * 4.3) * 3;
    const centerY = 64 + waveOffset;

    const grad = ctx.createLinearGradient(x, centerY - 24, x, centerY + 24);
    grad.addColorStop(0, 'rgba(210, 238, 255, 0)');
    grad.addColorStop(0.3, 'rgba(215, 240, 255, 0.38)');
    grad.addColorStop(0.5, 'rgba(235, 248, 255, 0.65)');
    grad.addColorStop(0.7, 'rgba(205, 235, 255, 0.3)');
    grad.addColorStop(1, 'rgba(195, 230, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(x, centerY - 24, 4, 48);
  }

  // Micro foam bubbles
  ctx.fillStyle = 'rgba(240, 250, 255, 0.55)';
  for (let i = 0; i < 200; i++) {
    const rx = (i * 39) % width;
    const nx = (rx / width) * Math.PI * 10;
    const ry = 64 + Math.sin(nx) * 10 + ((i * 17) % 28 - 14);
    const r = 1.0 + (i % 3) * 0.7;
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
 * Procedural soft feathered contact shadow texture generator.
 * Eliminates artificial circular black rings and replaces them with an organic,
 * feathered grounding occlusion shadow that naturally anchors Hina and the piano.
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
  const radius = size * 0.44;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, 'rgba(12, 18, 30, 0.42)');
  grad.addColorStop(0.25, 'rgba(12, 18, 30, 0.3)');
  grad.addColorStop(0.55, 'rgba(12, 18, 30, 0.12)');
  grad.addColorStop(0.8, 'rgba(12, 18, 30, 0.03)');
  grad.addColorStop(1, 'rgba(12, 18, 30, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.76, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 1. 360° PHOTOGRAPHIC PANORAMIC STARRY NIGHT SKY (MOONLESS)
 * Keeps the high-resolution starry night celestial panorama mapped onto the sky dome.
 * Completely removes the separate 3D moon mesh, inner halo, and outer corona billboard.
 */
const PhotographicStarrySky: React.FC = () => {
  const skyTexture = useMemo(() => {
    return loadTexture(
      '/textures/night_sky_pano.jpg',
      1,
      1,
      THREE.ClampToEdgeWrapping
    );
  }, []);

  return (
    <group name="Starry_Sky_Dome">
      <mesh position={[0, 0, 0]} rotation={[0, -Math.PI * 0.45, 0]}>
        <sphereGeometry args={[120, 64, 32]} />
        <meshBasicMaterial
          map={skyTexture}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * 2. SHOOTING METEORS
 * Occasional crisp meteors gracefully crossing the celestial sphere.
 * Environmental only: updates its own buffer geometry.
 */
const ShootingMeteors: React.FC = () => {
  const meteorRef = useRef<THREE.LineSegments>(null);
  const meteorState = useRef({
    active: false,
    progress: 0,
    start: new THREE.Vector3(-25, 24, -38),
    end: new THREE.Vector3(15, 10, -35),
    timer: 2.5,
  });

  useFrame((_, delta) => {
    const s = meteorState.current;
    if (!s.active) {
      s.timer -= delta;
      if (s.timer <= 0) {
        s.active = true;
        s.progress = 0;
        const startX = -32 + Math.random() * 18;
        const startY = 18 + Math.random() * 8;
        const endX = startX + 32 + Math.random() * 14;
        const endY = startY - 12 - Math.random() * 8;
        s.start.set(startX, startY, -38);
        s.end.set(endX, endY, -35);
      }
    } else {
      s.progress += delta * 1.4;
      if (s.progress >= 1.0) {
        s.active = false;
        s.timer = 5.0 + Math.random() * 7.0;
      }

      if (meteorRef.current) {
        const geom = meteorRef.current.geometry;
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr) {
          const headT = Math.min(1.0, s.progress);
          const tailT = Math.max(0.0, s.progress - 0.22);

          const head = s.start.clone().lerp(s.end, headT);
          const tail = s.start.clone().lerp(s.end, tailT);

          posAttr.setXYZ(0, tail.x, tail.y, tail.z);
          posAttr.setXYZ(1, head.x, head.y, head.z);
          posAttr.needsUpdate = true;
        }

        const mat = meteorRef.current.material as THREE.LineBasicMaterial;
        if (mat) {
          mat.opacity = s.active ? Math.sin(s.progress * Math.PI) * 0.95 : 0;
        }
      }
    }
  });

  const linePositions = useMemo(() => new Float32Array(6), []);

  return (
    <lineSegments ref={meteorRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[linePositions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#E0E7FF"
        transparent
        opacity={0}
        linewidth={2}
        depthWrite={false}
      />
    </lineSegments>
  );
};

/**
 * 3. DISTANT OCEAN HORIZON & BACKDROP
 * Curved panoramic cylinder in the background displaying high-res ocean horizon.
 * Creates seamless transition between the distant ocean line and the starry night sky.
 */
const PhotographicHorizonBackdrop: React.FC = () => {
  const horizonTexture = useMemo(() => {
    return loadTexture(
      '/textures/moonlit_ocean_shore.jpg',
      1,
      1,
      THREE.ClampToEdgeWrapping
    );
  }, []);

  return (
    <group position={[0, 9.5, -52]} name="Photographic_Horizon">
      <mesh rotation={[0, -Math.PI * 0.5, 0]}>
        <cylinderGeometry
          args={[72, 72, 32, 48, 1, true, -Math.PI * 0.45, Math.PI * 0.9]}
        />
        <meshBasicMaterial
          map={horizonTexture}
          side={THREE.BackSide}
          transparent
          opacity={0.88}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * 4. REALISTIC DEEP-BLUE OCEAN WATER & GENTLE WAVES
 * Features:
 * - Natural deep-blue to blue-green color gradient (#104e78), visibly distinct from sand.
 * - Low realistic dielectric metalness (0.08) avoiding black oil or reflective black mirror.
 * - Procedural ripple normal map providing fine specular wave detail.
 * - Multi-harmonic gentle wave displacement moving towards shore.
 * - Completely removed narrow moonlight reflection column.
 * - Organic, thin, irregular shoreline foam surging gently.
 */
const RealisticOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);

  const oceanTexture = useMemo(() => {
    return loadTexture('/textures/ocean_water_waves.jpg', 8, 5);
  }, []);

  const waterNormalMap = useMemo(() => {
    return createWaterNormalTexture();
  }, []);

  const foamTexture = useMemo(() => {
    return createShorelineFoamTexture();
  }, []);

  // Ocean Plane: 80 x 50 subdivisions spanning from Z = -2.6 to Z = -66, width = 140
  const { geometry, initialPositions } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(140, 64, 80, 50);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime() * 1.0;

    // UV drift: gentle drift towards shore
    if (oceanTexture) {
      oceanTexture.offset.y = (oceanTexture.offset.y - delta * 0.015) % 1.0;
    }
    if (waterNormalMap) {
      waterNormalMap.offset.y = (waterNormalMap.offset.y - delta * 0.02) % 1.0;
      waterNormalMap.offset.x = (waterNormalMap.offset.x + delta * 0.005) % 1.0;
    }

    // 3D Wave vertex displacement
    if (meshRef.current) {
      const geom = meshRef.current.geometry;
      const pos = geom.attributes.position.array as Float32Array;

      for (let i = 0; i < pos.length; i += 3) {
        const origX = initialPositions[i];
        const origZ = initialPositions[i + 2];

        // Harmonic rolling swells
        const wave1 = Math.sin(origZ * 0.3 + t * 1.4) * 0.11;
        const wave2 = Math.cos(origX * 0.18 - origZ * 0.12 + t * 1.0) * 0.05;
        const wave3 = Math.sin((origX * 0.45 + origZ * 0.35) + t * 2.1) * 0.025;

        // Dampen smoothly near shoreline so water surface touches beach cleanly
        const distFromShore = Math.max(0, -origZ - 2.6);
        const shoreDamp = Math.min(1.0, distFromShore * 0.25);

        pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.035;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
    }

    // Organic shoreline foam surging smoothly with the incoming tide
    if (foamRef.current) {
      const surge = Math.sin(t * 1.4) * 0.32;
      foamRef.current.position.z = 31.85 + surge;
    }
  });

  return (
    <group position={[0, -0.04, -34.8]} name="Realistic_Ocean">
      {/* 3D Ocean Surface: Deep blue ocean with cyan-teal depths, gentle roughness, low metalness */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          map={oceanTexture}
          normalMap={waterNormalMap || undefined}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          color="#104e78" // Vibrant deep oceanic blue
          roughness={0.18}
          metalness={0.08} // Non-metallic fluid water (avoids black mirror / oil appearance)
          emissive="#062844"
          emissiveIntensity={0.22}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Thin, organic scalloped shoreline foam surging at the sand edge */}
      {foamTexture && (
        <mesh
          ref={foamRef}
          position={[0, 0.018, 31.85]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[135, 1.4]} />
          <meshBasicMaterial
            map={foamTexture}
            color="#D8F0FF"
            transparent
            opacity={0.52}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

/**
 * 5. REALISTIC NATURAL BEACH SAND & SOFT FEATHERED GROUNDING
 * Refinements:
 * - Natural warm beige sand palette (#c8baa5) under night sky lighting.
 * - Removed all black sludge, dark brown muddy textures, and oily sheens.
 * - Stable, flat standing area around center stage ([0, 0, 0]).
 * - Gentle natural dunes farther out with smooth slope dipping into the water.
 * - Natural damp sand transition zone with soft sheen (roughness 0.58, non-metallic).
 * - Removed the two artificial circular black contact-shadow rings!
 * - Replaced with an ultra-smooth feathered radial contact shadow grounding Hina and the piano.
 */
const RealisticSandyBeach: React.FC<{ characterPosition?: THREE.Vector3 }> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const sandTexture = useMemo(() => {
    return loadTexture('/textures/beach_sand_texture.jpg', 16, 10);
  }, []);

  const contactShadowTexture = useMemo(() => {
    return createSoftContactShadowTexture();
  }, []);

  // Sandy beach terrain (width 135, depth 54)
  const { geometry } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(135, 54, 64, 44);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];

      // Flat, stable standing platform under Hina & piano within radius 3.5m
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter > 3.5) {
        // Subtle natural rolling dunes (gentle undulations)
        const dune =
          Math.sin(x * 0.08) * 0.05 +
          Math.cos(z * 0.14) * 0.04 +
          Math.sin(x * 0.04 + z * 0.07) * 0.03;
        // Slope gently down into water near shoreline (Z < -1.0)
        const slope = z < -1.0 ? (z - -1.0) * 0.038 : 0;
        pos[i + 1] = dune + slope;
      }
    }
    geom.computeVertexNormals();
    return { geometry: geom };
  }, []);

  const posX = characterPosition.x;
  const posZ = characterPosition.z;

  return (
    <group name="Realistic_Sand">
      {/* Main Natural Beige Sand Expanse */}
      <mesh position={[0, 0, 18.0]} geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={sandTexture}
          color="#c8baa5" // Natural warm beige beach sand
          roughness={0.94} // Powdery, matte beach sand
          metalness={0.0} // Zero metalness (no black sludge or oily reflections)
        />
      </mesh>

      {/* Shoreline Moist Sand Zone: natural gradient transition into water */}
      <mesh
        position={[0, -0.015, -2.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[135, 2.6]} />
        <meshStandardMaterial
          map={sandTexture}
          color="#9c8f7e" // Natural moist sand, organic muted beige-gray (NOT black or muddy brown)
          roughness={0.58} // Gentle damp sheen, NOT mirror-like
          metalness={0.02}
          transparent
          opacity={0.65}
        />
      </mesh>

      {/* Soft, Naturally Feathered Contact Shadow (Zero artificial rings or black disks) */}
      {contactShadowTexture && (
        <mesh
          position={[posX, 0.004, posZ - 0.12]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[4.4, 3.6]} />
          <meshBasicMaterial
            map={contactShadowTexture}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

/**
 * MAIN NIGHT BEACH CINEMATIC SCENE (REFINED MOONLESS REALISTIC BEACH)
 * Key Architectural & Visual Specifications:
 * - Moon completely removed (no moon disk, no glow halo, no corona billboard, no narrow moon reflection column).
 * - High-resolution 360° panoramic starry sky and shooting meteors preserved.
 * - Convincing, natural warm beige sand (#c8baa5) with powdery matte finish (zero oily sludge / black patches).
 * - Visibly distinct deep-blue to cyan-teal ocean water (#104e78) with procedural ripple normal map & low dielectric metalness (0.08).
 * - Thin, organic scalloped shoreline foam surging gently.
 * - Soft, feathered contact shadow beneath Hina & piano (zero artificial circular ring meshes).
 * - Coherent nighttime lighting in restrained blue and indigo palette with soft starlight illumination.
 * - 100% ISOLATED from character mixer, animation actions, model transforms, and piano visibility.
 */
export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera && camera.far < 150) {
      camera.far = 150;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return (
    <group name="NightBeachScene_Root">
      {/* 1. 360° Photographic Panoramic Starry Night Sky (Moonless) */}
      <PhotographicStarrySky />

      {/* 2. Occasional Shooting Stars */}
      <ShootingMeteors />

      {/* 3. Distant Ocean Horizon Layer */}
      <PhotographicHorizonBackdrop />

      {/* 4. Realistic Deep-Blue Ocean Waves & Organic Shoreline Foam */}
      <RealisticOcean />

      {/* 5. Realistic Natural Beige Sand & Feathered Grounding Shadow */}
      <RealisticSandyBeach characterPosition={characterPosition} />

      {/* 6. Restrained Nighttime Environmental Lighting (Blue & Indigo Palette) */}
      {/* Cool Diffuse Starlight Key Light */}
      <directionalLight
        position={[4, 15, -8]}
        intensity={1.1}
        color="#9EC2E6" // Soft cool starlight
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Deep Midnight Navy Ambient Light */}
      <ambientLight intensity={0.68} color="#0F223A" />

      {/* Warm Sand Diffuse Upward Bounce Light */}
      <directionalLight
        position={[0, -4, 2]}
        intensity={0.25}
        color="#8A7F72"
      />

      {/* Cool Starlight Rim Backlight (silhouette separation) */}
      <directionalLight
        position={[-8, 7, -10]}
        intensity={0.65}
        color="#7EA5D6"
      />

      {/* Soft Front Key (natural illumination for character expression, dress, and piano keys) */}
      <directionalLight
        position={[0, 3.2, 5.5]}
        intensity={0.6}
        color="#EEF4FF"
      />
    </group>
  );
};

export default NightBeachScene;
