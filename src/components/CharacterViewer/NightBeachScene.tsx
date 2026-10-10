import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LoadedCharacterInstance } from './types';
import { useConcertMusic } from './ConcertMusicContext';

interface NightBeachSceneProps {
  character: LoadedCharacterInstance;
  isMini?: boolean;
}

/**
 * 1. PROCEDURAL NIGHT SKY DOME & STARRY FIELD
 */
const StarryNightSky: React.FC = () => {
  const starsRef = useRef<THREE.Points>(null);

  // Generate 850 natural-looking celestial stars with blue/purple/white variations
  const [starPositions, starColors, starSizes] = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const cWhite = new THREE.Color('#FFFFFF');
    const cBlue = new THREE.Color('#93C5FD');
    const cViolet = new THREE.Color('#C084FC');
    const cCyan = new THREE.Color('#67E8F9');

    for (let i = 0; i < count; i++) {
      // Hemisphere distribution above the horizon
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.12); // Above horizon
      const radius = 65.0 + Math.random() * 10.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) + 1.0; // Y up
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.cos(theta);

      // Star color palette (subtle blues, purples, white)
      const r = Math.random();
      let starColor = cWhite;
      if (r < 0.35) starColor = cBlue;
      else if (r < 0.6) starColor = cViolet;
      else if (r < 0.75) starColor = cCyan;

      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;

      sizes[i] = 0.8 + Math.random() * 1.6;
    }

    return [positions, colors, sizes];
  }, []);

  // Subtle twinkle pulsation
  useFrame(({ clock }) => {
    if (starsRef.current) {
      const t = clock.getElapsedTime();
      const geom = starsRef.current.geometry;
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute;
      if (sizeAttr) {
        for (let i = 0; i < sizeAttr.count; i += 7) {
          const base = starSizes[i];
          sizeAttr.setX(i, base * (0.8 + 0.4 * Math.sin(t * 2.5 + i)));
        }
        sizeAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group name="NightBeach_Sky">
      {/* Deep Navy/Indigo Sky Sphere */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[80, 32, 16]} />
        <meshBasicMaterial color="#050814" side={THREE.BackSide} />
      </mesh>

      {/* Atmospheric Horizon Gradient Dome */}
      <mesh position={[0, -10, 0]}>
        <cylinderGeometry args={[78, 78, 45, 32, 1, true]} />
        <meshBasicMaterial
          color="#0b1026"
          side={THREE.BackSide}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Soft Moon Disc in Background */}
      <group position={[18, 26, -55]}>
        <mesh>
          <circleGeometry args={[3.2, 32]} />
          <meshBasicMaterial color="#F8FAFC" />
        </mesh>
        {/* Soft Moon Halo */}
        <mesh position={[0, 0, -0.1]}>
          <circleGeometry args={[6.8, 32]} />
          <meshBasicMaterial color="#A5B4FC" transparent opacity={0.25} />
        </mesh>
        <mesh position={[0, 0, -0.2]}>
          <circleGeometry args={[14.0, 32]} />
          <meshBasicMaterial color="#818CF8" transparent opacity={0.08} />
        </mesh>
      </group>

      {/* Star Points */}
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
          size={1.6}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

/**
 * 2. SHOOTING STARS / METEORS (Crosses the sky at irregular intervals)
 */
const ShootingMeteors: React.FC = () => {
  const meteorRef = useRef<THREE.LineSegments>(null);
  const meteorState = useRef({
    active: false,
    progress: 0,
    start: new THREE.Vector3(-35, 45, -50),
    end: new THREE.Vector3(25, 12, -45),
    timer: 2.0, // Initial delay
  });

  useFrame((_, delta) => {
    const s = meteorState.current;
    if (!s.active) {
      s.timer -= delta;
      if (s.timer <= 0) {
        // Trigger new meteor streak
        s.active = true;
        s.progress = 0;
        const startX = -45 + Math.random() * 20;
        const startY = 38 + Math.random() * 15;
        const endX = startX + 50 + Math.random() * 20;
        const endY = startY - 25 - Math.random() * 15;
        s.start.set(startX, startY, -52);
        s.end.set(endX, endY, -48);
      }
    } else {
      s.progress += delta * 1.35; // Fast streak speed
      if (s.progress >= 1.0) {
        s.active = false;
        s.timer = 4.0 + Math.random() * 6.0; // Random interval (4-10 seconds)
      }

      if (meteorRef.current) {
        const geom = meteorRef.current.geometry;
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr) {
          const headT = Math.min(1.0, s.progress);
          const tailT = Math.max(0.0, s.progress - 0.22); // Trail length

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
        color="#C084FC"
        transparent
        opacity={0}
        linewidth={2}
        depthWrite={false}
      />
    </lineSegments>
  );
};

/**
 * 3. MOVING OCEAN WAVES WITH SHORELINE FOAM & MOON REFLECTION
 */
const AnimatedOcean: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Ocean Plane: 80 segments along width and depth for fluid procedural waves
  const { geometry, initialPositions } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(120, 75, 75, 45);
    geom.rotateX(-Math.PI / 2); // Lay horizontal
    const pos = geom.attributes.position.array as Float32Array;
    const initial = new Float32Array(pos.length);
    initial.set(pos);
    return { geometry: geom, initialPositions: initial };
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime() * 0.9;
    const geom = meshRef.current.geometry;
    const pos = geom.attributes.position.array as Float32Array;

    for (let i = 0; i < pos.length; i += 3) {
      const origX = initialPositions[i];
      const origZ = initialPositions[i + 2];

      // Wave calculation: primary gentle swell + secondary cross-wave + shore surge
      const wave1 = Math.sin(origX * 0.12 + origZ * 0.16 + t * 1.2) * 0.16;
      const wave2 = Math.cos(origX * 0.22 - origZ * 0.1 + t * 0.8) * 0.08;
      const wave3 = Math.sin((origX + origZ) * 0.28 + t * 1.5) * 0.04;

      // Distance dampening near the shoreline (Z close to 0) so water meets beach cleanly
      const shoreDamp = Math.min(1.0, Math.max(0.05, -origZ * 0.08));
      pos[i + 1] = (wave1 + wave2 + wave3) * shoreDamp - 0.08;
    }

    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return (
    <group position={[0, -0.05, -34]} name="NightBeach_Ocean">
      {/* Deep Ocean Surface with Moonlight Reflections */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#061226"
          roughness={0.18}
          metalness={0.65}
          emissive="#020817"
          emissiveIntensity={0.2}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Gentle Shoreline Foam Strip (Pulses gently at the water/sand boundary) */}
      <mesh position={[0, -0.02, 33.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[110, 2.2]} />
        <meshBasicMaterial
          color="#93C5FD"
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * 4. SANDY BEACH GROUND (Hina and piano firmly planted on sand)
 */
const SandyBeachGround: React.FC = () => {
  return (
    <group name="NightBeach_Sand">
      {/* Main Sandy Beach Plane */}
      <mesh position={[0, -0.015, 6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 24]} />
        <meshStandardMaterial
          color="#16192b"
          roughness={0.88}
          metalness={0.08}
        />
      </mesh>

      {/* Wet Sand Sheen near shoreline */}
      <mesh position={[0, -0.012, -2.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 7]} />
        <meshStandardMaterial
          color="#0e1322"
          roughness={0.45}
          metalness={0.35}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  );
};

/**
 * 5. STYLIZED BURNING PIANO FLAMES & FLOATING EMBERS
 * Blue & violet supernatural fire rising gracefully around the piano rim & base.
 * Carefully positioned so the keys, Hina's hands, and face remain completely visible!
 */
const BurningPianoEffects: React.FC<{
  character: LoadedCharacterInstance;
}> = ({ character }) => {
  const flameGroupRef = useRef<THREE.Group>(null);
  const flamePointsRef = useRef<THREE.Points>(null);
  const emberPointsRef = useRef<THREE.Points>(null);
  const fireLightRef = useRef<THREE.PointLight>(null);

  // Find piano world position or bounding box relative to character
  const charPos = character.position;

  // 1. Stylized Flame Particles (80 flame wisps along the outer curved rim and base)
  const [flamePositions, flameColors, flameSizes, flameInitialData] = useMemo(() => {
    const count = 90;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const initial = [];

    const cCyan = new THREE.Color('#38BDF8');
    const cRoyalBlue = new THREE.Color('#60A5FA');
    const cViolet = new THREE.Color('#C084FC');
    const cPurple = new THREE.Color('#A855F7');

    for (let i = 0; i < count; i++) {
      // Emitter perimeter: around the piano body outer curve and underside legs
      // Piano width X: -0.85 to +0.85; Piano depth Z: -0.7 to 0.4
      // We keep front center (X: -0.4 to 0.4, Z: 0.1 to 0.5) clear for keys and hands!
      const angle = (i / count) * Math.PI * 2;
      const radiusX = 0.85 + Math.random() * 0.25;
      const radiusZ = 0.75 + Math.random() * 0.25;

      let offsetX = Math.cos(angle) * radiusX;
      let offsetZ = Math.sin(angle) * radiusZ - 0.2;

      // Push away from keyboard area (front center)
      if (Math.abs(offsetX) < 0.42 && offsetZ > 0.05) {
        offsetX = (offsetX >= 0 ? 1 : -1) * (0.45 + Math.random() * 0.3);
      }

      const baseY = 0.05 + Math.random() * 0.65; // From floor up along piano sides

      pos[i * 3] = offsetX;
      pos[i * 3 + 1] = baseY;
      pos[i * 3 + 2] = offsetZ;

      // Alternating blue/purple magical fire palette
      const r = Math.random();
      let color = cCyan;
      if (r < 0.3) color = cRoyalBlue;
      else if (r < 0.75) color = cViolet;
      else color = cPurple;

      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;

      sizes[i] = 1.4 + Math.random() * 1.8;

      initial.push({
        baseX: offsetX,
        baseY,
        baseZ: offsetZ,
        speed: 0.9 + Math.random() * 1.3,
        amplitude: 0.08 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        heightRange: 0.85 + Math.random() * 0.65,
      });
    }

    return [pos, col, sizes, initial];
  }, []);

  // 2. Rising Glowing Embers (Drifting upwards like magical sparks)
  const [emberPositions, emberColors, emberSizes, emberInitialData] = useMemo(() => {
    const count = 65;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const initial = [];

    const cWhite = new THREE.Color('#FFFFFF');
    const cViolet = new THREE.Color('#E9D5FF');
    const cBlue = new THREE.Color('#93C5FD');

    for (let i = 0; i < count; i++) {
      const offsetX = (Math.random() - 0.5) * 1.9;
      const offsetZ = (Math.random() - 0.5) * 1.8 - 0.15;
      const baseY = 0.2 + Math.random() * 2.2;

      pos[i * 3] = offsetX;
      pos[i * 3 + 1] = baseY;
      pos[i * 3 + 2] = offsetZ;

      const r = Math.random();
      const color = r < 0.4 ? cViolet : r < 0.75 ? cBlue : cWhite;
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;

      sizes[i] = 0.7 + Math.random() * 1.1;

      initial.push({
        baseX: offsetX,
        baseY,
        baseZ: offsetZ,
        speed: 0.5 + Math.random() * 0.8,
        swaySpeed: 1.2 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    return [pos, col, sizes, initial];
  }, []);

  // Animate flames, rising embers, and flickering magical firelight
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // 1. Update flame particles
    if (flamePointsRef.current) {
      const geom = flamePointsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < flameInitialData.length; i++) {
          const init = flameInitialData[i];
          const cycle = ((t * init.speed + init.phase) % 1.0);
          const currentY = init.baseY + cycle * init.heightRange;
          const wobbleX = init.baseX + Math.sin(t * 3.5 + init.phase) * init.amplitude * (1.0 - cycle * 0.5);
          const wobbleZ = init.baseZ + Math.cos(t * 3.0 + init.phase) * init.amplitude * (1.0 - cycle * 0.5);

          posAttr.setXYZ(i, wobbleX, currentY, wobbleZ);
        }
        posAttr.needsUpdate = true;
      }
    }

    // 2. Update rising embers
    if (emberPointsRef.current) {
      const geom = emberPointsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < emberInitialData.length; i++) {
          const init = emberInitialData[i];
          const cycle = ((t * init.speed + init.phase) % 1.0);
          const currentY = 0.2 + cycle * 2.8;
          const swayX = init.baseX + Math.sin(t * init.swaySpeed + init.phase) * 0.18;
          const swayZ = init.baseZ + Math.cos(t * init.swaySpeed + init.phase) * 0.18;

          posAttr.setXYZ(i, swayX, currentY, swayZ);
        }
        posAttr.needsUpdate = true;
      }
    }

    // 3. Dynamic flickering blue-purple point light
    if (fireLightRef.current) {
      const flicker =
        Math.sin(t * 12.0) * 0.15 +
        Math.sin(t * 22.0) * 0.1 +
        Math.sin(t * 37.0) * 0.08;
      fireLightRef.current.intensity = 2.0 + flicker;
    }
  });

  return (
    <group
      ref={flameGroupRef}
      position={[charPos.x, charPos.y, charPos.z]}
      name="NightBeach_PianoFlames"
    >
      {/* Flickering Blue-Purple Point Light Cast Onto Piano & Sand */}
      <pointLight
        ref={fireLightRef}
        position={[0, 0.65, 0]}
        color="#A78BFA"
        intensity={2.0}
        distance={6.5}
        decay={2.0}
      />

      {/* Stylized Rising Flame Particles */}
      <points ref={flamePointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[flamePositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[flameColors, 3]} />
          <bufferAttribute attach="attributes-size" args={[flameSizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          size={1.8}
          vertexColors
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Floating Embers */}
      <points ref={emberPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[emberPositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[emberColors, 3]} />
          <bufferAttribute attach="attributes-size" args={[emberSizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.9}
          vertexColors
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
};

/**
 * 6. ANIMATION SYNCHRONIZER HOOK
 * Keeps Exs_Cutin animation tightly looped in [4.0s, 7.0s] based on YouTube player time.
 * Handles continuous playback, seeking, pause/resume without drift.
 */
function useHinaCutinSynchronizer(character: LoadedCharacterInstance, isPlaying: boolean) {
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

      // Map timeline to looped [4.0s, 7.0s] segment
      // Loop interval = 3.0s (from 4.0s to 7.0s)
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
 */
export const NightBeachScene: React.FC<NightBeachSceneProps> = ({
  character,
  isMini = false,
}) => {
  const { isPlaying } = useConcertMusic();

  // Run precise Exs_Cutin 4-7s animation loop
  useHinaCutinSynchronizer(character, isPlaying);

  return (
    <group name="NightBeachScene_Root">
      {/* 1. Cinematic Night Sky & Moon */}
      <StarryNightSky />

      {/* 2. Occasional Shooting Stars */}
      <ShootingMeteors />

      {/* 3. Moving Ocean Waves & Horizon */}
      <AnimatedOcean />

      {/* 4. Sandy Beach Ground */}
      <SandyBeachGround />

      {/* 5. Stylized Blue & Violet Burning Piano Fire */}
      <BurningPianoEffects character={character} />

      {/* 6. Cinematic Atmospheric Lighting */}
      {/* Cool Silvery-Lavender Moonlight */}
      <directionalLight
        position={[18, 28, -25]}
        intensity={1.35}
        color="#C7D2FE"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      {/* Ambient Deep Navy Ocean Light */}
      <ambientLight intensity={0.65} color="#1E1B4B" />

      {/* Soft Violet Rim Light */}
      <directionalLight
        position={[-12, 10, -18]}
        intensity={1.1}
        color="#A855F7"
      />

      {/* Front Fill for Character Face and Hands */}
      <directionalLight
        position={[0, 4, 8]}
        intensity={0.55}
        color="#E0E7FF"
      />
    </group>
  );
};

export default NightBeachScene;
