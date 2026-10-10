import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { LoadedCharacterInstance } from './types';
import { useConcertMusic } from './ConcertMusicContext';

interface NightBeachSceneProps {
  character: LoadedCharacterInstance;
  isMini?: boolean;
}

/**
 * Procedural canvas texture generating fine sand grain noise & gentle color variations.
 * Ensures the beach foreground looks unmistakably like real sand even in still screenshots.
 */
function createSandTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Base moonlit sand tone (muted warm beige)
    ctx.fillStyle = '#bfae94';
    ctx.fillRect(0, 0, size, size);

    // Procedural sand grain noise & ripples
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const px = (i / 4) % size;
      const py = Math.floor(i / 4 / size);

      // Gentle wave ripple pattern in sand
      const ripple = Math.sin(py * 0.12 + Math.sin(px * 0.05) * 2.0) * 8;
      // High-frequency grain noise
      const grain = (Math.random() - 0.5) * 22;
      const delta = ripple + grain;

      data[i] = Math.min(255, Math.max(0, 191 + delta)); // R
      data[i + 1] = Math.min(255, Math.max(0, 174 + delta * 0.95)); // G
      data[i + 2] = Math.min(255, Math.max(0, 148 + delta * 0.85)); // B
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 6);
  return texture;
}

/**
 * 1. PROCEDURAL NIGHT SKY DOME, STARRY FIELD & GLOWING MOON
 * Creates an expansive deep navy night sky with cool blue/violet twinkling stars,
 * a visible ocean horizon, and a luminous moon disc with atmospheric halos.
 */
const StarryNightSky: React.FC = () => {
  const starsRef = useRef<THREE.Points>(null);
  const nebulaRef = useRef<THREE.Points>(null);

  // 1. Star field: cool blue, cyan, violet and silvery-white stars
  const [starPositions, starColors, starSizes] = useMemo(() => {
    const count = 1100;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const cWhite = new THREE.Color('#FFFFFF');
    const cBlue = new THREE.Color('#93C5FD');
    const cViolet = new THREE.Color('#C084FC');
    const cCyan = new THREE.Color('#67E8F9');
    const cPaleSilver = new THREE.Color('#E0E7FF');

    for (let i = 0; i < count; i++) {
      // Hemisphere distribution above the horizon (radius 55 to 68)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.88 + 0.08); // Kept above horizon line
      const radius = 55.0 + Math.random() * 12.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 1] = Math.max(1.2, radius * Math.cos(phi) + 1.0); // Y up
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.cos(theta);

      // Star color palette (cool celestial blues, purples, crisp white)
      const r = Math.random();
      let starColor = cWhite;
      if (r < 0.35) starColor = cBlue;
      else if (r < 0.6) starColor = cViolet;
      else if (r < 0.8) starColor = cCyan;
      else starColor = cPaleSilver;

      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;

      sizes[i] = 0.9 + Math.random() * 1.8;
    }

    return [positions, colors, sizes];
  }, []);

  // 2. Subtle celestial Milky Way dust band arching diagonally across the sky
  const [nebulaPositions, nebulaColors, nebulaSizes] = useMemo(() => {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const cIndigo = new THREE.Color('#818CF8');
    const cSky = new THREE.Color('#60A5FA');
    const cLavender = new THREE.Color('#A78BFA');

    for (let i = 0; i < count; i++) {
      const t = (i / count) * 2 - 1; // -1 to 1
      const theta = -0.6 + t * 1.4 + (Math.random() - 0.5) * 0.25;
      const phi = 0.45 + Math.abs(t) * 0.4 + (Math.random() - 0.5) * 0.2;
      const radius = 58.0 + (Math.random() - 0.5) * 4.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 1] = Math.max(2.5, radius * Math.cos(phi));
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.cos(theta);

      const r = Math.random();
      const col = r < 0.45 ? cIndigo : r < 0.75 ? cSky : cLavender;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      sizes[i] = 2.2 + Math.random() * 3.2;
    }

    return [positions, colors, sizes];
  }, []);

  // Gentle star twinkling
  useFrame(({ clock }) => {
    if (starsRef.current) {
      const t = clock.getElapsedTime();
      const geom = starsRef.current.geometry;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;
      if (sizeAttr) {
        for (let i = 0; i < sizeAttr.count; i += 6) {
          const base = starSizes[i];
          sizeAttr.setX(i, base * (0.8 + 0.45 * Math.sin(t * 2.2 + i * 0.7)));
        }
        sizeAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group name="NightBeach_Sky">
      {/* Deep Navy/Indigo Sky Dome */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[70, 32, 20]} />
        <meshBasicMaterial color="#050a1c" side={THREE.BackSide} />
      </mesh>

      {/* Atmospheric Horizon Gradient Cylinder (creates clean, readable water-sky boundary) */}
      <mesh position={[0, -2, 0]}>
        <cylinderGeometry args={[69, 69, 36, 32, 1, true]} />
        <meshBasicMaterial
          color="#0b1736"
          side={THREE.BackSide}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Radiant Moon Disc & Atmospheric Halos */}
      {/* Placed prominently above the ocean horizon in the upper-right view frustum */}
      <group position={[11, 8.5, -36]}>
        {/* Core Moon Disc */}
        <mesh>
          <circleGeometry args={[1.7, 36]} />
          <meshBasicMaterial color="#F8FAFC" />
        </mesh>
        {/* Subtle Crater Depth shading */}
        <mesh position={[-0.25, 0.2, 0.01]}>
          <circleGeometry args={[0.7, 24]} />
          <meshBasicMaterial color="#E2E8F0" transparent opacity={0.65} />
        </mesh>
        <mesh position={[0.4, -0.3, 0.01]}>
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial color="#CBD5E1" transparent opacity={0.55} />
        </mesh>
        {/* Inner Silvery-Blue Halo */}
        <mesh position={[0, 0, -0.05]}>
          <circleGeometry args={[3.8, 36]} />
          <meshBasicMaterial color="#BAE6FD" transparent opacity={0.32} />
        </mesh>
        {/* Soft Lavender Atmospheric Aura */}
        <mesh position={[0, 0, -0.1]}>
          <circleGeometry args={[8.0, 36]} />
          <meshBasicMaterial color="#A5B4FC" transparent opacity={0.16} />
        </mesh>
        {/* Outer Radiant Glow */}
        <mesh position={[0, 0, -0.15]}>
          <circleGeometry args={[16.0, 36]} />
          <meshBasicMaterial color="#818CF8" transparent opacity={0.06} />
        </mesh>
      </group>

      {/* Twinkling Celestial Star Points */}
      <points ref={starsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[starPositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[starColors, 3]} />
          <bufferAttribute attach="attributes-size" args={[starSizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          size={1.5}
          vertexColors
          transparent
          opacity={0.92}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      {/* Subtle Milky Way Star Dust Band */}
      <points ref={nebulaRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[nebulaPositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[nebulaColors, 3]} />
          <bufferAttribute attach="attributes-size" args={[nebulaSizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          size={2.4}
          vertexColors
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

/**
 * 2. SHOOTING STARS / METEORS
 * Occasional meteors cross a small portion of the sky, fade naturally, and disappear.
 */
const ShootingMeteors: React.FC = () => {
  const meteorRef = useRef<THREE.LineSegments>(null);
  const meteorState = useRef({
    active: false,
    progress: 0,
    start: new THREE.Vector3(-25, 18, -38),
    end: new THREE.Vector3(15, 6, -35),
    timer: 2.5, // Initial delay
  });

  useFrame((_, delta) => {
    const s = meteorState.current;
    if (!s.active) {
      s.timer -= delta;
      if (s.timer <= 0) {
        // Trigger a new shooting star with random trajectory
        s.active = true;
        s.progress = 0;
        const startX = -32 + Math.random() * 18;
        const startY = 14 + Math.random() * 8;
        const endX = startX + 32 + Math.random() * 14;
        const endY = startY - 12 - Math.random() * 8;
        s.start.set(startX, startY, -38);
        s.end.set(endX, endY, -35);
      }
    } else {
      s.progress += delta * 1.45; // Fast elegant streak
      if (s.progress >= 1.0) {
        s.active = false;
        s.timer = 5.0 + Math.random() * 7.0; // Random natural interval (5-12 seconds)
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
 * 3. ANIMATED DEEP BLUE OCEAN WAVES WITH SHORELINE FOAM & BROKEN MOONLIGHT REFLECTIONS
 * Clearly visible body of deep navy and blue-teal water extending toward the horizon.
 * Features rolling waves moving toward the shore, thin softly moving white-blue foam,
 * and broken shimmering moonlight highlights across the water.
 */
const AnimatedOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);
  const glintsRef = useRef<THREE.Points>(null);

  // Ocean Plane: 80 x 50 subdivisions for smooth undulating wave displacement
  const { geometry, initialPositions } = useMemo(() => {
    // Spans from Z = -2.8 (shoreline) to Z = -48 (horizon), width = 90
    const geom = new THREE.PlaneGeometry(90, 46, 80, 50);
    geom.rotateX(-Math.PI / 2); // Lay horizontal
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  // Broken shimmering moonlight glints along the moon reflection column on the water
  const [glintPositions, glintSizes, glintPhases] = useMemo(() => {
    const count = 120;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    // Moon is at X ~ 11, Z = -36.
    // The specular reflection column runs between X = 2 and 12, Z from -4 to -38.
    for (let i = 0; i < count; i++) {
      const zProgress = Math.random(); // 0 (near shore) to 1 (near moon/horizon)
      const z = -4.0 - zProgress * 34.0;
      // Spread widens slightly towards the camera, narrows towards the moon
      const spread = 2.2 + (1.0 - zProgress) * 4.5;
      const centerX = 2.0 + zProgress * 8.0;
      const x = centerX + (Math.random() - 0.5) * spread;

      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.05; // Slightly above water plane
      positions[i * 3 + 2] = z;

      sizes[i] = 0.8 + Math.random() * 1.4;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return [positions, sizes, phases];
  }, []);

  // Dynamic wave animation & shoreline foam motion
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 1.05;

    // 1. Ocean wave displacement
    if (meshRef.current) {
      const geom = meshRef.current.geometry;
      const pos = geom.attributes.position.array as Float32Array;

      for (let i = 0; i < pos.length; i += 3) {
        const origX = initialPositions[i];
        const origZ = initialPositions[i + 2];

        // Waves rolling toward shore (+Z direction)
        const wave1 = Math.sin(origZ * 0.38 + t * 1.6) * 0.14;
        const wave2 = Math.cos(origX * 0.22 - origZ * 0.16 + t * 1.1) * 0.07;
        const wave3 = Math.sin((origX * 0.45 + origZ * 0.32) + t * 2.0) * 0.035;

        // Shore dampening so waves crest and fade cleanly at the sand boundary (Z = -2.8)
        const distFromShore = Math.max(0, -origZ - 2.8);
        const shoreDamp = Math.min(1.0, distFromShore * 0.3);

        pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.04;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
    }

    // 2. Shoreline foam pulsing gently with wave surges
    if (foamRef.current) {
      const surge = Math.sin(t * 1.6) * 0.28;
      foamRef.current.position.z = 22.8 + surge; // Relative to ocean group center
    }

    // 3. Broken moonlight reflections shimmering on waves
    if (glintsRef.current) {
      const geom = glintsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;
      if (posAttr && sizeAttr) {
        for (let i = 0; i < glintPhases.length; i++) {
          const ph = glintPhases[i];
          const z = glintPositions[i * 3 + 2];
          // Shimmer calculation aligned with wave frequency
          const shimmer = Math.sin(t * 3.5 + ph + z * 0.5);
          const currentSize = glintSizes[i] * Math.max(0, shimmer * 0.7 + 0.5);
          sizeAttr.setX(i, currentSize);

          // Bob glint with wave height
          const waveHeight = Math.sin(z * 0.38 + t * 1.6) * 0.12;
          posAttr.setY(i, waveHeight + 0.04);
        }
        posAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group position={[0, -0.04, -25.5]} name="NightBeach_Ocean">
      {/* Deep Blue-Teal Ocean Water Surface */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#0a3359" // Visibly blue-teal ocean water
          roughness={0.16}
          metalness={0.72}
          emissive="#041a30"
          emissiveIntensity={0.3}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Shoreline Foam Strip (Pulses and surges gently at the sand boundary) */}
      <mesh
        ref={foamRef}
        position={[0, 0.02, 22.8]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[85, 1.4]} />
        <meshBasicMaterial
          color="#BAE6FD" // Soft white-blue sea foam
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* Secondary soft shoreline froth edge */}
      <mesh position={[0, 0.015, 23.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[85, 0.7]} />
        <meshBasicMaterial
          color="#E0F2FE"
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>

      {/* Broken Shimmering Moonlight Reflections */}
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
          size={1.2}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
};

/**
 * 4. SANDY BEACH GROUND (Foreground)
 * Broad expanse of recognizable sand beneath Hina and the grand piano.
 * Sand-colored material (moonlit tan/warm gray-beige), subtle procedural grain texture,
 * gentle dune undulations, and soft grounding shadows.
 */
const SandyBeachGround: React.FC<{ character: LoadedCharacterInstance }> = ({
  character,
}) => {
  const sandTexture = useMemo(() => createSandTexture(), []);

  // Sandy beach geometry with subtle natural dune undulations
  const { geometry } = useMemo(() => {
    // Spans width = 80, depth = 22 (from Z = +16 in front of camera down to Z = -2.8 at shoreline)
    const geom = new THREE.PlaneGeometry(80, 22, 40, 24);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];

      // Subtle gentle dunes (keep flat around character area at center)
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter > 2.5) {
        const dune =
          Math.sin(x * 0.12) * 0.05 +
          Math.cos(z * 0.22) * 0.04 +
          Math.sin(x * 0.06 + z * 0.1) * 0.03;
        // Slope down slightly into water near the shoreline (Z < -1.5)
        const slope = z < -1.5 ? (z - -1.5) * 0.04 : 0;
        pos[i + 1] = dune + slope;
      }
    }
    geom.computeVertexNormals();
    return { geometry: geom };
  }, []);

  const charPos = character.position;

  return (
    <group name="NightBeach_Sand">
      {/* Main Sandy Beach Expanse */}
      <mesh
        position={[0, 0, 6.6]}
        geometry={geometry}
        receiveShadow
      >
        <meshStandardMaterial
          map={sandTexture}
          color="#c8b99d" // Muted moonlit tan / warm gray-beige sand
          roughness={0.88}
          metalness={0.04}
        />
      </mesh>

      {/* Shoreline Wet Sand Zone (Darker tone & water sheen where waves wash over) */}
      <mesh
        position={[0, -0.01, -2.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[80, 2.2]} />
        <meshStandardMaterial
          color="#786a54" // Dark wet sand
          roughness={0.32}
          metalness={0.28}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Dedicated Soft Contact Shadow directly beneath Hina & Grand Piano */}
      {/* Ensures both are solidly grounded with realistic soft contact shadows */}
      <mesh
        position={[charPos.x, 0.005, charPos.z - 0.15]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0, 1.95, 32]} />
        <meshBasicMaterial
          color="#080b12"
          transparent
          opacity={0.48}
          depthWrite={false}
        />
      </mesh>
      {/* Secondary tight contact shadow under piano body */}
      <mesh
        position={[charPos.x, 0.007, charPos.z - 0.2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0, 1.25, 32]} />
        <meshBasicMaterial
          color="#05070d"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * 5. ANIMATION SYNCHRONIZER HOOK
 * Keeps Exs_Cutin animation tightly looped in [4.0s, 7.0s] based on YouTube player time.
 * Handles continuous playback, seeking, pause/resume without drift.
 * Preserves character position, scale, and correct relationship to the piano.
 */
function useHinaCutinSynchronizer(
  character: LoadedCharacterInstance,
  isPlaying: boolean
) {
  const { getCurrentTime } = useConcertMusic();
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const localElapsedRef = useRef<number>(0);

  // Prepare and activate Exs_Cutin animation action
  useEffect(() => {
    if (!character || !character.mixer) return;

    // Find Exs_Cutin clip from character animations
    const clip =
      THREE.AnimationClip.findByName(character.animations, 'Exs_Cutin') ||
      THREE.AnimationClip.findByName(character.animations, 'exs_cutin');

    if (!clip) {
      console.warn('[NightBeach] Exs_Cutin clip not found in character animations!');
      return;
    }

    const action = character.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    actionRef.current = action;

    // Ensure Piano_Switch is visible
    const pianoSwitch = character.scene.getObjectByName('Piano_Switch');
    if (pianoSwitch) {
      pianoSwitch.scale.set(1, 1, 1);
      pianoSwitch.visible = true;
    }

    return () => {
      // Clean restoration when leaving special scene
      if (action) {
        action.stop();
      }
      actionRef.current = null;
    };
  }, [character]);

  // Synchronize action.time with YouTube timeline in [4.0s, 7.0s] segment
  useFrame((_, delta) => {
    const action = actionRef.current;
    if (!action || !character.mixer) return;

    // When YouTube is playing, synchronize smoothly with video time
    if (isPlaying) {
      const ytTime = getCurrentTime();

      // Detect YouTube seek or tick update
      if (Math.abs(ytTime - lastSyncTimeRef.current) > 0.05) {
        lastSyncTimeRef.current = ytTime;
        localElapsedRef.current = ytTime;
      } else {
        // High-precision 60fps interpolation between YouTube polling ticks
        localElapsedRef.current += Math.min(delta, 0.1);
      }

      // Map timeline to looped [4.0s, 7.0s] segment (loop interval = 3.0s)
      const currentTimeline = localElapsedRef.current;
      const loopOffset = ((currentTimeline - 4.0) % 3.0 + 3.0) % 3.0;
      const targetAnimTime = 4.0 + loopOffset;

      action.paused = false;
      action.time = targetAnimTime;
      character.mixer.update(0); // Force keyframe evaluation
    } else {
      // When video is paused, hold animation at current frame
      action.paused = true;
      character.mixer.update(0);
    }
  });
}

/**
 * MAIN NIGHT BEACH CINEMATIC SCENE
 * Free of fire effects, rendering a recognizable 3D nighttime beach:
 * - Sandy beige beach foreground
 * - Visible undulating blue-teal ocean middle-ground with shoreline foam
 * - Deep navy night sky with celestial stars, shooting stars, and radiant moon
 * - Balanced cool moonlit lighting preserving character and piano details
 */
export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  character,
}) => {
  const { isPlaying } = useConcertMusic();
  const { camera } = useThree();

  // Ensure camera frustum far plane easily accommodates the distant ocean horizon and sky
  useEffect(() => {
    if (camera && camera.far < 150) {
      camera.far = 150;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  // Run precise Exs_Cutin 4-7s animation loop synchronized with YouTube
  useHinaCutinSynchronizer(character, isPlaying);

  return (
    <group name="NightBeachScene_Root">
      {/* 1. Cinematic Night Sky, Stars & Glowing Moon */}
      <StarryNightSky />

      {/* 2. Occasional Shooting Stars */}
      <ShootingMeteors />

      {/* 3. Deep Blue-Teal Ocean Waves, Foam & Moonlight Shimmer */}
      <AnimatedOcean />

      {/* 4. Recognizable Sandy Beach Foreground with Grounding Shadows */}
      <SandyBeachGround character={character} />

      {/* 5. Coherent Cool Moonlit Lighting (No fire/burning effects) */}
      {/* Silvery Moonlit Directional Light from the Moon */}
      <directionalLight
        position={[11, 16, -30]}
        intensity={1.65}
        color="#DBEAFE" // Silvery-cool moonlit cyan-white
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Deep Ocean Ambient Light (prevents black shadows, gives rich midnight blue tone) */}
      <ambientLight intensity={0.82} color="#0E233C" />

      {/* Warm Sand Upward Bounce Light */}
      <directionalLight
        position={[0, -5, 2]}
        intensity={0.35}
        color="#8B7D6B"
      />

      {/* Cool Ice-Blue Rim Light (crisp silhouette separation for Hina and piano) */}
      <directionalLight
        position={[-10, 8, -16]}
        intensity={0.95}
        color="#93C5FD"
      />

      {/* Soft Front Light for Hina's Face, Dress Details & Piano Keyboard */}
      <directionalLight
        position={[0, 3.2, 6.0]}
        intensity={0.78}
        color="#F8FAFC"
      />
    </group>
  );
};

export default NightBeachScene;
