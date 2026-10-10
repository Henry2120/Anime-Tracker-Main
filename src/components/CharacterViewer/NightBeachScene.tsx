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
 * Procedural canvas texture generating natural sand grain noise & gentle color variations.
 * Ensures the beach foreground looks convincingly like moonlit sand in both motion & still frames.
 */
function createSandTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Base natural moonlit sand tone (muted beige / moonlit tan)
    ctx.fillStyle = '#bfae94';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const px = (i / 4) % size;
      const py = Math.floor(i / 4 / size);

      // Subtle gentle wind-swept sand ripple wave
      const ripple = Math.sin(py * 0.14 + Math.sin(px * 0.05) * 2.2) * 7.0;
      // High-frequency tactile sand grain noise
      const grain = (Math.random() - 0.5) * 20.0;
      const delta = ripple + grain;

      data[i] = Math.min(255, Math.max(0, 192 + delta)); // R
      data[i + 1] = Math.min(255, Math.max(0, 175 + delta * 0.94)); // G
      data[i + 2] = Math.min(255, Math.max(0, 150 + delta * 0.85)); // B
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 8);
  return texture;
}

/**
 * 1. PROCEDURAL NIGHT SKY DOME, STARRY FIELD & MOON
 * Deep navy blue sky dome (visually separate from ocean), 1,200+ cool blue/violet/cyan/white stars,
 * subtle Milky Way dust band, and radiant moon placed at [14, 18, -32].
 */
const StarryNightSky: React.FC = () => {
  const starsRef = useRef<THREE.Points>(null);
  const nebulaRef = useRef<THREE.Points>(null);

  // 1. Star field: cool blue, cyan, violet and crisp silvery-white stars
  const [starPositions, starColors, starSizes] = useMemo(() => {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const cWhite = new THREE.Color('#FFFFFF');
    const cBlue = new THREE.Color('#93C5FD');
    const cViolet = new THREE.Color('#C084FC');
    const cCyan = new THREE.Color('#67E8F9');
    const cPaleSilver = new THREE.Color('#E0E7FF');

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.88 + 0.08); // Above horizon line
      const radius = 58.0 + Math.random() * 14.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 1] = Math.max(1.5, radius * Math.cos(phi) + 1.0);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.cos(theta);

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

  // 2. Subtle Milky Way celestial dust band arching across the night sky
  const [nebulaPositions, nebulaColors, nebulaSizes] = useMemo(() => {
    const count = 320;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const cIndigo = new THREE.Color('#818CF8');
    const cSky = new THREE.Color('#60A5FA');
    const cLavender = new THREE.Color('#A78BFA');

    for (let i = 0; i < count; i++) {
      const t = (i / count) * 2 - 1;
      const theta = -0.5 + t * 1.5 + (Math.random() - 0.5) * 0.25;
      const phi = 0.42 + Math.abs(t) * 0.4 + (Math.random() - 0.5) * 0.2;
      const radius = 62.0 + (Math.random() - 0.5) * 4.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 1] = Math.max(2.5, radius * Math.cos(phi));
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.cos(theta);

      const r = Math.random();
      const col = r < 0.45 ? cIndigo : r < 0.75 ? cSky : cLavender;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      sizes[i] = 2.4 + Math.random() * 3.4;
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
        <sphereGeometry args={[74, 32, 20]} />
        <meshBasicMaterial color="#050a1c" side={THREE.BackSide} />
      </mesh>

      {/* Atmospheric Horizon Gradient Cylinder (Clean, readable ocean-sky boundary) */}
      <mesh position={[0, -2, 0]}>
        <cylinderGeometry args={[73, 73, 38, 32, 1, true]} />
        <meshBasicMaterial
          color="#0b1736"
          side={THREE.BackSide}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Radiant Moon Disc & Atmospheric Halos (Placed at [14, 18, -32]) */}
      <group position={[14, 18, -32]}>
        {/* Core Moon Disc */}
        <mesh>
          <circleGeometry args={[2.0, 36]} />
          <meshBasicMaterial color="#F8FAFC" />
        </mesh>
        {/* Subtle Crater Depth shading */}
        <mesh position={[-0.3, 0.25, 0.01]}>
          <circleGeometry args={[0.8, 24]} />
          <meshBasicMaterial color="#E2E8F0" transparent opacity={0.65} />
        </mesh>
        <mesh position={[0.45, -0.35, 0.01]}>
          <circleGeometry args={[0.6, 24]} />
          <meshBasicMaterial color="#CBD5E1" transparent opacity={0.55} />
        </mesh>
        {/* Inner Silvery-Blue Halo */}
        <mesh position={[0, 0, -0.05]}>
          <circleGeometry args={[4.5, 36]} />
          <meshBasicMaterial color="#BAE6FD" transparent opacity={0.34} />
        </mesh>
        {/* Soft Lavender Atmospheric Aura */}
        <mesh position={[0, 0, -0.1]}>
          <circleGeometry args={[9.5, 36]} />
          <meshBasicMaterial color="#A5B4FC" transparent opacity={0.18} />
        </mesh>
        {/* Outer Radiant Glow */}
        <mesh position={[0, 0, -0.15]}>
          <circleGeometry args={[19.0, 36]} />
          <meshBasicMaterial color="#818CF8" transparent opacity={0.07} />
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
    start: new THREE.Vector3(-25, 22, -38),
    end: new THREE.Vector3(15, 8, -35),
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
        const startY = 16 + Math.random() * 8;
        const endX = startX + 32 + Math.random() * 14;
        const endY = startY - 12 - Math.random() * 8;
        s.start.set(startX, startY, -38);
        s.end.set(endX, endY, -35);
      }
    } else {
      s.progress += delta * 1.45;
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
 * 3. ANIMATED DEEP BLUE OCEAN WAVES WITH SHORELINE FOAM & BROKEN MOONLIGHT REFLECTIONS
 * Spans from Z = -2.8 to Z = -66, width = 140. Visible rolling waves with lighter blue highlights
 * moving toward shore, restrained foam surge at the water boundary, and broken moonlight glints.
 */
const AnimatedOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);
  const glintsRef = useRef<THREE.Points>(null);

  // Ocean Plane: 80 x 50 subdivisions
  const { geometry, initialPositions } = useMemo(() => {
    // Spans from Z = -2.8 to Z = -66 (depth = 64), width = 140
    const geom = new THREE.PlaneGeometry(140, 64, 80, 50);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  // Broken shimmering moonlight glints along the moon reflection column (aligned with moon at X ~ 14)
  const [glintPositions, glintSizes, glintPhases] = useMemo(() => {
    const count = 130;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const zProgress = Math.random(); // 0 (near shore) to 1 (near horizon)
      const z = -3.5 - zProgress * 45.0;
      // Column spreads out toward camera, aligns with moon at X = 14
      const spread = 2.5 + (1.0 - zProgress) * 5.0;
      const centerX = 4.0 + zProgress * 10.0;
      const x = centerX + (Math.random() - 0.5) * spread;

      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.05;
      positions[i * 3 + 2] = z;

      sizes[i] = 0.9 + Math.random() * 1.5;
      phases[i] = Math.random() * Math.PI * 2;
    }

    return [positions, sizes, phases];
  }, []);

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
        const wave1 = Math.sin(origZ * 0.36 + t * 1.6) * 0.15;
        const wave2 = Math.cos(origX * 0.2 - origZ * 0.15 + t * 1.1) * 0.07;
        const wave3 = Math.sin((origX * 0.4 + origZ * 0.3) + t * 2.0) * 0.035;

        // Shore dampening so waves crest cleanly at the sand boundary
        const distFromShore = Math.max(0, -origZ - 2.8);
        const shoreDamp = Math.min(1.0, distFromShore * 0.28);

        pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.04;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
    }

    // 2. Shoreline foam pulsing gently with wave surges
    if (foamRef.current) {
      const surge = Math.sin(t * 1.6) * 0.28;
      foamRef.current.position.z = 31.8 + surge; // Relative to ocean group center
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
    <group position={[0, -0.04, -34.8]} name="NightBeach_Ocean">
      {/* Deep Blue-Teal Ocean Water Surface with Visible Lighter Highlights */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#0c3559"
          roughness={0.16}
          metalness={0.72}
          emissive="#051c33"
          emissiveIntensity={0.32}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Shoreline Foam Strip (Pulses and surges gently at the sand boundary) */}
      <mesh
        ref={foamRef}
        position={[0, 0.02, 31.8]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[135, 1.4]} />
        <meshBasicMaterial
          color="#BAE6FD"
          transparent
          opacity={0.52}
          depthWrite={false}
        />
      </mesh>

      {/* Secondary soft shoreline froth edge */}
      <mesh position={[0, 0.015, 32.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[135, 0.8]} />
        <meshBasicMaterial
          color="#E0F2FE"
          transparent
          opacity={0.32}
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
          size={1.3}
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
};

/**
 * 4. SANDY BEACH GROUND (Foreground & 360° Inspection Expanse)
 * Broad expanse of recognizable sand spanning in 360° around Hina and the grand piano.
 * Natural muted beige palette (#c4b49a), high-res tactile sand grain texture,
 * gentle dune undulations, wet sand zone near shoreline, and soft grounding shadows.
 */
const SandyBeachGround: React.FC<{ character: LoadedCharacterInstance }> = ({
  character,
}) => {
  const sandTexture = useMemo(() => createSandTexture(), []);

  // Sandy beach geometry covering foreground and wrap-around terrain (width 130, depth 52)
  const { geometry } = useMemo(() => {
    // Spans width = 130, depth = 52 (from Z = +38 behind camera down to Z = -2.8 at shoreline)
    const geom = new THREE.PlaneGeometry(130, 52, 60, 40);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];

      // Flat, stable standing area under Hina and grand piano ([0, 0, 0])
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

  const charPos = character.position;

  return (
    <group name="NightBeach_Sand">
      {/* Main Sandy Beach Expanse (covers 360° orbit inspection) */}
      <mesh
        position={[0, 0, 17.5]}
        geometry={geometry}
        receiveShadow
      >
        <meshStandardMaterial
          map={sandTexture}
          color="#c4b49a" // Natural muted beige sand with cool moonlit highlights
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
        <planeGeometry args={[130, 2.4]} />
        <meshStandardMaterial
          color="#70624e" // Dark damp sand
          roughness={0.34}
          metalness={0.26}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Dedicated Soft Contact Shadow directly beneath Hina & Grand Piano */}
      <mesh
        position={[charPos.x, 0.005, charPos.z - 0.15]}
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
      {/* Secondary tight contact shadow under piano body */}
      <mesh
        position={[charPos.x, 0.007, charPos.z - 0.2]}
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

    // Cleanly stop any other conflicting actions on mixer
    character.mixer.stopAllAction();

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

    // Ensure Piano_Switch is visible and scaled to [1, 1, 1]
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
  }, [character.id]);

  // Synchronize action.time with YouTube timeline in [4.0s, 7.0s] segment
  useFrame((_, delta) => {
    const action = actionRef.current;
    if (!action || !character.mixer) return;

    // Ensure Piano_Switch remains visible during loop
    const pianoSwitch = character.scene.getObjectByName('Piano_Switch');
    if (pianoSwitch && (pianoSwitch.scale.x < 0.5 || !pianoSwitch.visible)) {
      pianoSwitch.scale.set(1, 1, 1);
      pianoSwitch.visible = true;
    }

    // When YouTube is playing, synchronize smoothly with video time
    if (isPlaying) {
      const ytTime = getCurrentTime();

      // Detect YouTube seek or tick update
      if (Math.abs(ytTime - lastSyncTimeRef.current) > 0.05) {
        lastSyncTimeRef.current = ytTime;
        localElapsedRef.current = ytTime;
      } else {
        // High-precision interpolation between YouTube polling ticks
        localElapsedRef.current += Math.min(delta, 0.1);
      }

      // Map timeline to looped [4.0s, 7.0s] segment (loop interval = 3.0s)
      const currentTimeline = localElapsedRef.current;
      const loopOffset = ((currentTimeline - 4.0) % 3.0 + 3.0) % 3.0;
      const targetAnimTime = 4.0 + loopOffset;

      action.paused = false;
      action.time = targetAnimTime;
    } else {
      // When video is paused, hold animation cleanly at current frame
      action.paused = true;
    }
  });
}

/**
 * MAIN NIGHT BEACH CINEMATIC SCENE
 * Free of fire effects, rendering a realistic 3D nighttime beach:
 * - Natural beige sand foreground extending in 360° around the model
 * - Undulating blue-teal ocean with lighter wave highlights and shoreline foam
 * - Deep navy night sky with stars, shooting stars, and radiant moon at [14, 18, -32]
 * - Directional moonlight matching moon position, soft blue fill, and rim light
 * - Piano retains original royal purple lacquer and gold accents
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

      {/* 4. Natural Sandy Beach Foreground with Grounding Shadows (360° inspection) */}
      <SandyBeachGround character={character} />

      {/* 5. Coherent Moonlit Lighting (Directional light aligns with Moon at [14, 18, -32]) */}
      <directionalLight
        position={[14, 18, -32]}
        intensity={1.7}
        color="#DBEAFE" // Silvery-cool moonlit cyan-white
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Deep Ocean Ambient Light (prevents crushed black shadows, gives rich midnight navy tone) */}
      <ambientLight intensity={0.85} color="#0E223D" />

      {/* Warm Sand Upward Bounce Light */}
      <directionalLight
        position={[0, -5, 2]}
        intensity={0.35}
        color="#7A6B57"
      />

      {/* Cool Ice-Blue Rim Light (crisp silhouette separation for Hina and piano) */}
      <directionalLight
        position={[-12, 10, -18]}
        intensity={1.0}
        color="#93C5FD"
      />

      {/* Soft Front Light for Hina's Face, Dress Details & Piano Keyboard */}
      <directionalLight
        position={[0, 3.5, 6.0]}
        intensity={0.75}
        color="#F8FAFC"
      />
    </group>
  );
};

export default NightBeachScene;
