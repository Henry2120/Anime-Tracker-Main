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
 * 1. PHOTOGRAPHIC PANORAMIC STARRY NIGHT SKY & MOON
 * Uses high-resolution photographic starry night panorama mapped onto a full 360° celestial sphere.
 * Provides seamless deep navy and dark sapphire sky in every direction when orbiting around Hina & piano.
 */
const PhotographicNightSky: React.FC = () => {
  const skyTexture = useMemo(() => {
    return loadTexture(
      '/textures/night_sky_pano.jpg',
      1,
      1,
      THREE.ClampToEdgeWrapping
    );
  }, []);

  return (
    <group name="Photographic_Sky">
      {/* 360° Photographic Sky Dome Sphere */}
      <mesh position={[0, 0, 0]} rotation={[0, -Math.PI * 0.45, 0]}>
        <sphereGeometry args={[120, 64, 32]} />
        <meshBasicMaterial
          map={skyTexture}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Luminous 3D Moon with Radiant Moonlit Glow Corona at [14, 18, -32] */}
      <group position={[14, 18, -32]}>
        {/* Crisp Moon Disk */}
        <mesh>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshBasicMaterial color="#FFFBEB" />
        </mesh>
        {/* Inner Soft Moon Glow Halo */}
        <mesh scale={[1.25, 1.25, 1.25]}>
          <sphereGeometry args={[1.5, 24, 24]} />
          <meshBasicMaterial color="#E0F2FE" transparent opacity={0.35} />
        </mesh>
        {/* Outer Radiant Moonlit Corona Billboard */}
        <mesh scale={[3.2, 3.2, 1]}>
          <planeGeometry args={[2.5, 2.5]} />
          <meshBasicMaterial
            color="#93C5FD"
            transparent
            opacity={0.16}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
};

/**
 * 2. SHOOTING METEORS
 * Occasional crisp meteors gracefully crossing the celestial sphere.
 * Strictly environmental: updates only its own geometry line attributes.
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
 * 3. DISTANT PHOTOGRAPHIC OCEAN HORIZON & SHORELINE BACKDROP
 * Curved panoramic cylinder in the background displaying high-res moonlit ocean waves & horizon.
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
      {/* Curved cylinder arc framing the ocean horizon in the camera view */}
      <mesh rotation={[0, -Math.PI * 0.5, 0]}>
        <cylinderGeometry
          args={[72, 72, 32, 48, 1, true, -Math.PI * 0.45, Math.PI * 0.9]}
        />
        <meshBasicMaterial
          map={horizonTexture}
          side={THREE.BackSide}
          transparent
          opacity={0.92}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * 4. PHOTOGRAPHIC 3D ANIMATED OCEAN WATER & SHORELINE FOAM
 * Combines high-resolution photographic water surface texture with dynamic vertex waves
 * moving toward shore, UV wave drift, and glowing moonlit reflections.
 * Strictly environmental: animates only its own geometry vertices and UV offset.
 */
const PhotographicOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);
  const glintsRef = useRef<THREE.Points>(null);

  // Photographic ocean wave surface texture
  const oceanTexture = useMemo(() => {
    return loadTexture('/textures/ocean_water_waves.jpg', 10, 5);
  }, []);

  // Ocean Plane: 80 x 50 subdivisions spanning from Z = -2.8 to Z = -66, width = 140
  const { geometry, initialPositions } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(140, 64, 80, 50);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  // Shimmering moonlight reflection column along moon path (moon at X ~ 14)
  const [glintPositions, glintSizes, glintPhases] = useMemo(() => {
    const count = 140;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const zProgress = Math.random();
      const z = -3.5 - zProgress * 45.0;
      const spread = 2.5 + (1.0 - zProgress) * 5.0;
      const centerX = 4.0 + zProgress * 10.0;
      const x = centerX + (Math.random() - 0.5) * spread;

      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.05;
      positions[i * 3 + 2] = z;

      sizes[i] = 1.0 + Math.random() * 1.6;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return [positions, sizes, phases];
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime() * 1.05;

    // 1. Photographic ocean texture UV animation: waves drift naturally toward shore
    if (oceanTexture) {
      oceanTexture.offset.y = (oceanTexture.offset.y - delta * 0.02) % 1.0;
    }

    // 2. 3D Wave vertex displacement moving toward shore (+Z direction)
    if (meshRef.current) {
      const geom = meshRef.current.geometry;
      const pos = geom.attributes.position.array as Float32Array;

      for (let i = 0; i < pos.length; i += 3) {
        const origX = initialPositions[i];
        const origZ = initialPositions[i + 2];

        const wave1 = Math.sin(origZ * 0.36 + t * 1.6) * 0.15;
        const wave2 = Math.cos(origX * 0.2 - origZ * 0.15 + t * 1.1) * 0.07;
        const wave3 = Math.sin((origX * 0.4 + origZ * 0.3) + t * 2.0) * 0.035;

        // Dampen near the sand shore boundary
        const distFromShore = Math.max(0, -origZ - 2.8);
        const shoreDamp = Math.min(1.0, distFromShore * 0.28);

        pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.04;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
    }

    // 3. Shoreline foam gently surging with the incoming swell
    if (foamRef.current) {
      const surge = Math.sin(t * 1.6) * 0.28;
      foamRef.current.position.z = 31.8 + surge;
    }

    // 4. Broken moonlight reflections glistening on the wave crests
    if (glintsRef.current) {
      const geom = glintsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;
      if (posAttr && sizeAttr) {
        for (let i = 0; i < glintPhases.length; i++) {
          const ph = glintPhases[i];
          const z = glintPositions[i * 3 + 2];
          const shimmer = Math.sin(t * 3.5 + ph + z * 0.5);
          const currentSize = glintSizes[i] * Math.max(0, shimmer * 0.7 + 0.5);
          sizeAttr.setX(i, currentSize);

          const waveHeight = Math.sin(z * 0.36 + t * 1.6) * 0.14;
          posAttr.setY(i, waveHeight + 0.04);
        }
        posAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group position={[0, -0.04, -34.8]} name="Photographic_Ocean">
      {/* 3D Ocean Surface with Photographic Wave Texture & Blue-Teal Ocean Tone */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          map={oceanTexture}
          color="#164e78"
          roughness={0.2}
          metalness={0.65}
          emissive="#092845"
          emissiveIntensity={0.28}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Shoreline Foam Layer surging at the sand boundary */}
      <mesh
        ref={foamRef}
        position={[0, 0.02, 31.8]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[135, 1.5]} />
        <meshBasicMaterial
          color="#BAE6FD"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {/* Soft secondary froth wash */}
      <mesh position={[0, 0.015, 32.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[135, 0.8]} />
        <meshBasicMaterial
          color="#E0F2FE"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>

      {/* Broken Shimmering Moonlight Column */}
      <points ref={glintsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[glintPositions, 3]}
          />
          <bufferAttribute attach="attributes-size" args={[glintSizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          color="#E0E7FF"
          size={1.4}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
};

/**
 * 5. PHOTOGRAPHIC SANDY BEACH GROUND (360° Inspection Expanse)
 * Broad expanse of high-resolution photographic sand wrapping 360° around the center stage.
 * Natural warm moonlit tan palette (#c8bba3), tactile sand grain detail, gentle dune undulations,
 * damp shoreline sand zone, and grounding contact shadows.
 * Strictly environmental: independent geometry; places contact shadow at character's X and Z.
 */
const PhotographicSandyBeach: React.FC<{ characterPosition?: THREE.Vector3 }> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const sandTexture = useMemo(() => {
    return loadTexture('/textures/beach_sand_texture.jpg', 14, 8);
  }, []);

  // Sandy beach geometry covering foreground and wrap-around terrain (width 130, depth 52)
  const { geometry } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(130, 52, 60, 40);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];

      // Flat, stable standing area under stage center ([0, 0, 0])
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter > 2.8) {
        // Natural gentle rolling dunes
        const dune =
          Math.sin(x * 0.1) * 0.06 +
          Math.cos(z * 0.16) * 0.05 +
          Math.sin(x * 0.05 + z * 0.08) * 0.04;
        // Slope gently down into water near shoreline (Z < -1.5)
        const slope = z < -1.5 ? (z - -1.5) * 0.04 : 0;
        pos[i + 1] = dune + slope;
      }
    }
    geom.computeVertexNormals();
    return { geometry: geom };
  }, []);

  const posX = characterPosition.x;
  const posZ = characterPosition.z;

  return (
    <group name="Photographic_Sand">
      {/* Main Photographic Sand Expanse */}
      <mesh position={[0, 0, 17.5]} geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={sandTexture}
          color="#c8bba3" // Warm moonlit tan with natural beige tones
          roughness={0.9}
          metalness={0.03}
        />
      </mesh>

      {/* Shoreline Wet Sand Zone (Damp water sheen where waves break) */}
      <mesh
        position={[0, -0.01, -2.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[130, 2.4]} />
        <meshStandardMaterial
          map={sandTexture}
          color="#72624c" // Damp sand
          roughness={0.36}
          metalness={0.24}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Grounding Soft Contact Shadow beneath Character & Props */}
      <mesh
        position={[posX, 0.005, posZ - 0.15]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0, 2.1, 36]} />
        <meshBasicMaterial
          color="#060912"
          transparent
          opacity={0.52}
          depthWrite={false}
        />
      </mesh>
      {/* Secondary tight contact shadow under central footprint */}
      <mesh
        position={[posX, 0.007, posZ - 0.2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0, 1.35, 36]} />
        <meshBasicMaterial
          color="#04060b"
          transparent
          opacity={0.58}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * MAIN NIGHT BEACH CINEMATIC SCENE
 * Isolated, zero-character-coupling photorealistic nighttime beach environment:
 * - Seamless 360° photographic starry night sky dome with glowing moon
 * - Curved photographic horizon backdrop for natural water-sky separation
 * - 3D animated ocean waves textured with photographic water surface
 * - 3D natural beige sand foreground with photographic sand texture
 * - Coherent nighttime lighting matching the moon angle, preserving character and piano colors
 *
 * CRITICAL REGRESSION SAFEGUARDS:
 * - Does NOT access, manage, or update Hina's AnimationMixer or AnimationAction.
 * - Does NOT modify Hina's skeleton, materials, transforms, or mesh visibility.
 * - Does NOT touch or force Piano_Switch visibility or scale (preserves existing Exs_Cutin logic).
 * - Operates strictly as an isolated environment layer inside the 3D scene.
 */
export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const { camera } = useThree();

  // Ensure camera frustum far plane easily accommodates the distant ocean horizon and sky
  useEffect(() => {
    if (camera && camera.far < 150) {
      camera.far = 150;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return (
    <group name="NightBeachScene_Root">
      {/* 1. 360° Photographic Panoramic Starry Night Sky & Moon */}
      <PhotographicNightSky />

      {/* 2. Occasional Shooting Stars */}
      <ShootingMeteors />

      {/* 3. Distant Photographic Ocean Horizon Layer */}
      <PhotographicHorizonBackdrop />

      {/* 4. Photographic 3D Animated Ocean Waves & Shoreline Foam */}
      <PhotographicOcean />

      {/* 5. Photographic Sandy Beach Ground (360° inspection expanse) */}
      <PhotographicSandyBeach characterPosition={characterPosition} />

      {/* 6. Coherent Moonlit Lighting System */}
      {/* Directional moonlight aligned with Moon at [14, 18, -32] */}
      <directionalLight
        position={[14, 18, -32]}
        intensity={1.75}
        color="#DBEAFE" // Cool silvery moonlit cyan-white
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Deep Ocean Midnight Ambient (ensures dark areas are rich navy instead of crushed black) */}
      <ambientLight intensity={0.88} color="#0E2442" />

      {/* Warm Sand Upward Bounce Light */}
      <directionalLight
        position={[0, -5, 2]}
        intensity={0.35}
        color="#7E6F5B"
      />

      {/* Cool Rim Light (silhouette separation for character and props) */}
      <directionalLight
        position={[-12, 10, -18]}
        intensity={0.95}
        color="#93C5FD"
      />

      {/* Soft Front Fill (illuminates character outfit, expression, and props) */}
      <directionalLight
        position={[0, 3.5, 6.0]}
        intensity={0.75}
        color="#F8FAFC"
      />
    </group>
  );
};

export default NightBeachScene;
