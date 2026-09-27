import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface AniVerseCharacterProps {
  pose?: 'neutral_relaxed' | 'a_pose' | 'idle_breathing' | 'graceful_turn';
  expression?: 'serene' | 'smile' | 'focused' | 'wink';
  displayMode?: 'shaded' | 'wireframe' | 'clay';
  isBlinkingEnabled?: boolean;
  scale?: number;
  position?: [number, number, number];
}

/**
 * Procedural High-Fidelity 3D Anime Game Character Model: Lyra (AniVerse Cast #01)
 *
 * Built with pure Three.js geometries and stylized anime materials:
 * - Proportions: Tall young adult female (~172cm / 7.8 heads tall)
 * - Anime Face: Stylized chin, delicate nose, expressive eyes with multi-layer iris & reflections
 * - Layered Hair: Volumetric crown, face-framing fringe bangs, side tresses, cascading back locks with anime specular sheen
 * - Neutral Stylish Outfit: Tailored blazer jacket with crisp lapels, inner blouse, high-waisted pleated skirt, fitted stockings, and heeled ankle boots
 * - Natural Relaxed Pose: A-pose compatible for humanoid skeletal rigging & future musical animations
 * - Dynamic Idle Breathing & Natural Eye Blinking
 */
export const AniVerseCharacterModel: React.FC<AniVerseCharacterProps> = ({
  pose = 'idle_breathing',
  expression = 'serene',
  displayMode = 'shaded',
  isBlinkingEnabled = true,
  scale = 1.0,
  position = [0, 0, 0],
}) => {
  const rootGroupRef = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);
  const hairBackRef = useRef<THREE.Group>(null);
  const leftEyeLidRef = useRef<THREE.Mesh>(null);
  const rightEyeLidRef = useRef<THREE.Mesh>(null);

  // Blink state
  const blinkTimerRef = useRef(0);
  const nextBlinkRef = useRef(2.5 + Math.random() * 2);

  // Materials setup with anime color grading
  const materials = useMemo(() => {
    const isWire = displayMode === 'wireframe';
    const isClay = displayMode === 'clay';

    if (isClay) {
      const clayMat = new THREE.MeshStandardMaterial({
        color: '#E0DDD8',
        roughness: 0.6,
        metalness: 0.05,
        wireframe: isWire,
      });
      return {
        skin: clayMat,
        skinShadow: clayMat,
        hair: clayMat,
        hairSheen: clayMat,
        jacket: clayMat,
        jacketLapel: clayMat,
        blouse: clayMat,
        skirt: clayMat,
        belt: clayMat,
        tights: clayMat,
        boots: clayMat,
        goldTrim: clayMat,
        eyeWhite: clayMat,
        iris: clayMat,
        pupil: clayMat,
        eyeHighlight: clayMat,
        eyelash: clayMat,
        lip: clayMat,
      };
    }

    return {
      skin: new THREE.MeshStandardMaterial({
        color: '#FBEBE3',
        roughness: 0.35,
        metalness: 0.02,
        wireframe: isWire,
      }),
      skinShadow: new THREE.MeshStandardMaterial({
        color: '#ECD2C5',
        roughness: 0.45,
        metalness: 0.02,
        wireframe: isWire,
      }),
      hair: new THREE.MeshStandardMaterial({
        color: '#382D42', // Elegant dark plum-chestnut
        roughness: 0.28,
        metalness: 0.15,
        wireframe: isWire,
      }),
      hairSheen: new THREE.MeshStandardMaterial({
        color: '#765B8A', // Anime hair highlight band ("angel ring")
        roughness: 0.2,
        metalness: 0.2,
        wireframe: isWire,
      }),
      jacket: new THREE.MeshStandardMaterial({
        color: '#24222E', // Midnight tailored jacket
        roughness: 0.5,
        metalness: 0.08,
        wireframe: isWire,
      }),
      jacketLapel: new THREE.MeshStandardMaterial({
        color: '#363345',
        roughness: 0.4,
        metalness: 0.1,
        wireframe: isWire,
      }),
      blouse: new THREE.MeshStandardMaterial({
        color: '#F8F6F4', // Pure satin inner top
        roughness: 0.35,
        metalness: 0.05,
        wireframe: isWire,
      }),
      skirt: new THREE.MeshStandardMaterial({
        color: '#433D56', // Fine pleated skirt
        roughness: 0.55,
        metalness: 0.05,
        wireframe: isWire,
      }),
      belt: new THREE.MeshStandardMaterial({
        color: '#1C1A24',
        roughness: 0.3,
        metalness: 0.2,
        wireframe: isWire,
      }),
      tights: new THREE.MeshStandardMaterial({
        color: '#1E1B26', // Semi-sheer fitted tights
        roughness: 0.6,
        metalness: 0.05,
        wireframe: isWire,
      }),
      boots: new THREE.MeshStandardMaterial({
        color: '#17151F', // Polished leather ankle boots
        roughness: 0.25,
        metalness: 0.35,
        wireframe: isWire,
      }),
      goldTrim: new THREE.MeshStandardMaterial({
        color: '#E2C268',
        roughness: 0.25,
        metalness: 0.85,
        wireframe: isWire,
      }),
      eyeWhite: new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
      }),
      iris: new THREE.MeshBasicMaterial({
        color: '#4B55A8', // Deep violet-sapphire anime iris
      }),
      pupil: new THREE.MeshBasicMaterial({
        color: '#16132C',
      }),
      eyeHighlight: new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
      }),
      eyelash: new THREE.MeshBasicMaterial({
        color: '#211C2B',
      }),
      lip: new THREE.MeshStandardMaterial({
        color: '#EAA9A3',
        roughness: 0.2,
        metalness: 0.1,
        wireframe: isWire,
      }),
    };
  }, [displayMode]);

  // Frame animation loop: Idle Breathing, Turntable, Eye Blinks, and Hair Physics
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // 1. Natural Breathing Loop
    if (pose === 'idle_breathing' || pose === 'neutral_relaxed') {
      const breathPhase = Math.sin(time * 1.8);
      const subtleSway = Math.sin(time * 0.9) * 0.008;

      if (chestRef.current) {
        // Ribcage expands and gently lifts
        chestRef.current.position.y = 1.15 + breathPhase * 0.005;
        chestRef.current.rotation.x = breathPhase * 0.012;
      }

      if (headRef.current) {
        // Head has subtle counter-balance & gentle life micro-tilt
        headRef.current.rotation.x = -breathPhase * 0.008;
        headRef.current.rotation.z = subtleSway;
      }

      if (leftArmRef.current && rightArmRef.current) {
        // Arms naturally settle near sides with breathing rhythm
        leftArmRef.current.rotation.z = 0.28 + breathPhase * 0.006;
        rightArmRef.current.rotation.z = -0.28 - breathPhase * 0.006;
        leftArmRef.current.rotation.x = -0.05 + Math.sin(time * 1.8 + 0.4) * 0.008;
        rightArmRef.current.rotation.x = -0.05 + Math.sin(time * 1.8 + 0.4) * 0.008;
      }

      if (hairBackRef.current) {
        // Soft hair cascade sway
        hairBackRef.current.rotation.x = 0.06 + Math.sin(time * 1.8 + 0.8) * 0.015;
      }
    } else if (pose === 'a_pose') {
      // Clean standard rigging A-Pose
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.z = 0.75;
        rightArmRef.current.rotation.z = -0.75;
        leftArmRef.current.rotation.x = 0;
        rightArmRef.current.rotation.x = 0;
      }
      if (chestRef.current) {
        chestRef.current.position.y = 1.15;
        chestRef.current.rotation.x = 0;
      }
      if (headRef.current) {
        headRef.current.rotation.set(0, 0, 0);
      }
    }

    // 2. Turntable Rotation if selected
    if (pose === 'graceful_turn' && rootGroupRef.current) {
      rootGroupRef.current.rotation.y = time * 0.6;
    } else if (rootGroupRef.current && pose !== 'graceful_turn') {
      // Settle back to facing forward
      rootGroupRef.current.rotation.y = THREE.MathUtils.lerp(rootGroupRef.current.rotation.y, 0, 0.08);
    }

    // 3. Eye Blinking Logic
    if (isBlinkingEnabled) {
      blinkTimerRef.current += delta;
      if (blinkTimerRef.current >= nextBlinkRef.current) {
        // Trigger quick blink (120ms closed, then reopen)
        const blinkProgress = (blinkTimerRef.current - nextBlinkRef.current) / 0.14;
        if (blinkProgress <= 1.0) {
          const blinkScaleY = 1.0 - Math.sin(blinkProgress * Math.PI) * 0.95;
          if (leftEyeLidRef.current && rightEyeLidRef.current) {
            leftEyeLidRef.current.scale.y = blinkScaleY;
            rightEyeLidRef.current.scale.y = blinkScaleY;
          }
        } else {
          // Reset blink timer
          blinkTimerRef.current = 0;
          nextBlinkRef.current = 2.8 + Math.random() * 3.5;
          if (leftEyeLidRef.current && rightEyeLidRef.current) {
            leftEyeLidRef.current.scale.y = 1.0;
            rightEyeLidRef.current.scale.y = 1.0;
          }
        }
      }
    }
  });

  return (
    <group ref={rootGroupRef} position={position} scale={[scale, scale, scale]}>
      {/* =======================================================================
          LOWER BODY: Boots, Tights, Calves & Thighs (Ground at Y=0)
          ======================================================================= */}
      <group position={[0, 0, 0]}>
        {/* Left Leg */}
        <group position={[-0.14, 0, 0]}>
          {/* Ankle Boot (Stylized pointed toe & small heel) */}
          <group position={[0, 0.08, 0.02]}>
            {/* Boot Shaft */}
            <mesh position={[0, 0.08, -0.01]} castShadow receiveShadow>
              <cylinderGeometry args={[0.065, 0.062, 0.18, 16]} />
              <primitive object={materials.boots} />
            </mesh>
            {/* Boot Foot & Toe */}
            <mesh position={[0, -0.02, 0.05]} rotation={[0.1, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.09, 0.07, 0.18]} />
              <primitive object={materials.boots} />
            </mesh>
            {/* Boot Heel */}
            <mesh position={[0, -0.04, -0.05]} castShadow receiveShadow>
              <boxGeometry args={[0.06, 0.06, 0.05]} />
              <primitive object={materials.boots} />
            </mesh>
            {/* Gold Buckle Accent */}
            <mesh position={[-0.038, 0.06, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow>
              <torusGeometry args={[0.022, 0.005, 8, 16]} />
              <primitive object={materials.goldTrim} />
            </mesh>
          </group>

          {/* Lower Leg / Calf (with fitted sheer tights) */}
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.068, 0.06, 0.42, 20]} />
            <primitive object={materials.tights} />
          </mesh>

          {/* Knee Joint */}
          <mesh position={[0, 0.60, 0.005]} castShadow receiveShadow>
            <sphereGeometry args={[0.072, 16, 16]} />
            <primitive object={materials.tights} />
          </mesh>

          {/* Upper Leg / Thigh (Long, graceful anime contour) */}
          <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.095, 0.075, 0.44, 20]} />
            <primitive object={materials.tights} />
          </mesh>
        </group>

        {/* Right Leg */}
        <group position={[0.14, 0, 0]}>
          {/* Ankle Boot */}
          <group position={[0, 0.08, 0.02]}>
            <mesh position={[0, 0.08, -0.01]} castShadow receiveShadow>
              <cylinderGeometry args={[0.065, 0.062, 0.18, 16]} />
              <primitive object={materials.boots} />
            </mesh>
            <mesh position={[0, -0.02, 0.05]} rotation={[0.1, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.09, 0.07, 0.18]} />
              <primitive object={materials.boots} />
            </mesh>
            <mesh position={[0, -0.04, -0.05]} castShadow receiveShadow>
              <boxGeometry args={[0.06, 0.06, 0.05]} />
              <primitive object={materials.boots} />
            </mesh>
            <mesh position={[0.038, 0.06, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
              <torusGeometry args={[0.022, 0.005, 8, 16]} />
              <primitive object={materials.goldTrim} />
            </mesh>
          </group>

          {/* Lower Leg */}
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.068, 0.06, 0.42, 20]} />
            <primitive object={materials.tights} />
          </mesh>

          {/* Knee */}
          <mesh position={[0, 0.60, 0.005]} castShadow receiveShadow>
            <sphereGeometry args={[0.072, 16, 16]} />
            <primitive object={materials.tights} />
          </mesh>

          {/* Upper Leg */}
          <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.095, 0.075, 0.44, 20]} />
            <primitive object={materials.tights} />
          </mesh>
        </group>
      </group>

      {/* =======================================================================
          PELVIS & PLEATED SKIRT (Y ~ 1.05)
          ======================================================================= */}
      <group position={[0, 1.05, 0]}>
        {/* Pelvis base */}
        <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.18, 0.16, 0.14, 24]} />
          <primitive object={materials.tights} />
        </mesh>

        {/* High-Waisted Flared Pleated Skirt */}
        <group position={[0, -0.06, 0]}>
          <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.19, 0.32, 0.28, 32, 1, true]} />
            <primitive object={materials.skirt} />
          </mesh>
          {/* Subtle inner shadow of skirt */}
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.185, 0.315, 0.27, 24, 1, true]} />
            <primitive object={materials.jacket} />
          </mesh>
        </group>

        {/* Tailored Belt with Metallic Buckle */}
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.185, 0.185, 0.04, 32]} />
          <primitive object={materials.belt} />
        </mesh>
        {/* Golden Buckle */}
        <mesh position={[0, 0.08, 0.186]} castShadow>
          <boxGeometry args={[0.06, 0.045, 0.015]} />
          <primitive object={materials.goldTrim} />
        </mesh>
      </group>

      {/* =======================================================================
          TORSO / CHEST & TAILORED BLAZER (Y ~ 1.15 to 1.50)
          ======================================================================= */}
      <group ref={chestRef} position={[0, 1.15, 0]}>
        {/* Slim Waist */}
        <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.17, 0.16, 0.14, 24]} />
          <primitive object={materials.blouse} />
        </mesh>

        {/* Ribcage & Torso */}
        <mesh position={[0, 0.20, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.19, 0.17, 0.18, 24]} />
          <primitive object={materials.blouse} />
        </mesh>

        {/* Tailored Chic Jacket Overlay */}
        <group position={[0, 0.16, 0]}>
          {/* Jacket Body */}
          <mesh position={[0, 0.03, -0.01]} castShadow receiveShadow>
            <cylinderGeometry args={[0.21, 0.20, 0.26, 24]} />
            <primitive object={materials.jacket} />
          </mesh>

          {/* Left Lapel */}
          <mesh position={[-0.08, 0.08, 0.18]} rotation={[0.1, 0.25, -0.15]} castShadow>
            <boxGeometry args={[0.09, 0.20, 0.02]} />
            <primitive object={materials.jacketLapel} />
          </mesh>

          {/* Right Lapel */}
          <mesh position={[0.08, 0.08, 0.18]} rotation={[0.1, -0.25, 0.15]} castShadow>
            <boxGeometry args={[0.09, 0.20, 0.02]} />
            <primitive object={materials.jacketLapel} />
          </mesh>

          {/* Gold Button Accent */}
          <mesh position={[-0.01, -0.04, 0.205]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.01, 16]} />
            <primitive object={materials.goldTrim} />
          </mesh>
        </group>

        {/* Elegant Neck & Collarbone */}
        <group position={[0, 0.32, 0]}>
          {/* Chest skin v-neck cutout */}
          <mesh position={[0, -0.04, 0.15]} rotation={[0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.09, 16]} />
            <primitive object={materials.skin} />
          </mesh>

          {/* Neck cylinder */}
          <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.065, 0.072, 0.14, 20]} />
            <primitive object={materials.skin} />
          </mesh>

          {/* Delicate Choker / Ribbon Accessory */}
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.069, 0.069, 0.018, 24]} />
            <primitive object={materials.belt} />
          </mesh>
          <mesh position={[0, 0.06, 0.07]} castShadow>
            <sphereGeometry args={[0.012, 12, 12]} />
            <primitive object={materials.goldTrim} />
          </mesh>
        </group>

        {/* =====================================================================
            LEFT ARM & HAND (Relaxed natural pose)
            ===================================================================== */}
        <group ref={leftArmRef} position={[-0.24, 0.28, 0]}>
          {/* Shoulder Cap */}
          <mesh position={[0, 0, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.075, 16, 16]} />
            <primitive object={materials.jacket} />
          </mesh>

          {/* Upper Arm */}
          <mesh position={[-0.02, -0.14, 0]} rotation={[0, 0, -0.05]} castShadow receiveShadow>
            <cylinderGeometry args={[0.055, 0.05, 0.26, 16]} />
            <primitive object={materials.jacket} />
          </mesh>

          {/* Elbow & Forearm */}
          <group ref={leftForearmRef} position={[-0.03, -0.28, 0]}>
            {/* Forearm (Fitted sleeve) */}
            <mesh position={[0, -0.12, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.048, 0.042, 0.24, 16]} />
              <primitive object={materials.jacket} />
            </mesh>

            {/* Sleeve Cuff & Gold Button */}
            <mesh position={[0, -0.22, 0]} castShadow>
              <cylinderGeometry args={[0.052, 0.052, 0.03, 16]} />
              <primitive object={materials.jacketLapel} />
            </mesh>

            {/* Stylized Hand & Fingers in relaxed extension */}
            <group position={[0, -0.28, 0]}>
              {/* Palm */}
              <mesh position={[0, -0.035, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.055, 0.07, 0.025]} />
                <primitive object={materials.skin} />
              </mesh>
              {/* Thumb */}
              <mesh position={[0.028, -0.02, 0.012]} rotation={[0.2, -0.3, -0.4]} castShadow>
                <cylinderGeometry args={[0.01, 0.009, 0.045, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              {/* Fingers (Index, Middle, Ring, Pinky) */}
              <mesh position={[0.018, -0.08, 0.002]} rotation={[0.08, 0, -0.05]} castShadow>
                <cylinderGeometry args={[0.008, 0.007, 0.055, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              <mesh position={[0.006, -0.085, 0]} rotation={[0.05, 0, 0]} castShadow>
                <cylinderGeometry args={[0.008, 0.007, 0.06, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              <mesh position={[-0.006, -0.082, -0.002]} rotation={[0.06, 0, 0.04]} castShadow>
                <cylinderGeometry args={[0.008, 0.007, 0.055, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              <mesh position={[-0.018, -0.075, -0.004]} rotation={[0.1, 0, 0.08]} castShadow>
                <cylinderGeometry args={[0.007, 0.006, 0.045, 8]} />
                <primitive object={materials.skin} />
              </mesh>
            </group>
          </group>
        </group>

        {/* =====================================================================
            RIGHT ARM & HAND (Relaxed natural pose)
            ===================================================================== */}
        <group ref={rightArmRef} position={[0.24, 0.28, 0]}>
          {/* Shoulder Cap */}
          <mesh position={[0, 0, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.075, 16, 16]} />
            <primitive object={materials.jacket} />
          </mesh>

          {/* Upper Arm */}
          <mesh position={[0.02, -0.14, 0]} rotation={[0, 0, 0.05]} castShadow receiveShadow>
            <cylinderGeometry args={[0.055, 0.05, 0.26, 16]} />
            <primitive object={materials.jacket} />
          </mesh>

          {/* Elbow & Forearm */}
          <group ref={rightForearmRef} position={[0.03, -0.28, 0]}>
            <mesh position={[0, -0.12, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.048, 0.042, 0.24, 16]} />
              <primitive object={materials.jacket} />
            </mesh>

            <mesh position={[0, -0.22, 0]} castShadow>
              <cylinderGeometry args={[0.052, 0.052, 0.03, 16]} />
              <primitive object={materials.jacketLapel} />
            </mesh>

            {/* Hand & Fingers */}
            <group position={[0, -0.28, 0]}>
              <mesh position={[0, -0.035, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.055, 0.07, 0.025]} />
                <primitive object={materials.skin} />
              </mesh>
              {/* Thumb */}
              <mesh position={[-0.028, -0.02, 0.012]} rotation={[0.2, 0.3, 0.4]} castShadow>
                <cylinderGeometry args={[0.01, 0.009, 0.045, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              {/* Fingers */}
              <mesh position={[-0.018, -0.08, 0.002]} rotation={[0.08, 0, 0.05]} castShadow>
                <cylinderGeometry args={[0.008, 0.007, 0.055, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              <mesh position={[-0.006, -0.085, 0]} rotation={[0.05, 0, 0]} castShadow>
                <cylinderGeometry args={[0.008, 0.007, 0.06, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              <mesh position={[0.006, -0.082, -0.002]} rotation={[0.06, 0, -0.04]} castShadow>
                <cylinderGeometry args={[0.008, 0.007, 0.055, 8]} />
                <primitive object={materials.skin} />
              </mesh>
              <mesh position={[0.018, -0.075, -0.004]} rotation={[0.1, 0, -0.08]} castShadow>
                <cylinderGeometry args={[0.007, 0.006, 0.045, 8]} />
                <primitive object={materials.skin} />
              </mesh>
            </group>
          </group>
        </group>

        {/* =====================================================================
            HEAD & EXPRESSIVE ANIME FACE (Y ~ 1.56)
            ===================================================================== */}
        <group ref={headRef} position={[0, 0.46, 0]}>
          {/* Anime Head Base (Subtle tapered chin, smooth cheeks) */}
          <group position={[0, 0, 0]}>
            {/* Cranium */}
            <mesh position={[0, 0.04, -0.02]} castShadow receiveShadow>
              <sphereGeometry args={[0.135, 32, 32]} />
              <primitive object={materials.skin} />
            </mesh>

            {/* Cheeks & Tapered Chin Geometry */}
            <mesh position={[0, -0.04, 0.04]} rotation={[0.2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.115, 0.04, 0.15, 24]} />
              <primitive object={materials.skin} />
            </mesh>

            {/* Petite Anime Nose */}
            <mesh position={[0, -0.02, 0.125]} rotation={[0.4, 0, 0]} castShadow>
              <coneGeometry args={[0.012, 0.028, 8]} />
              <primitive object={materials.skinShadow} />
            </mesh>

            {/* Refined Anime Lips */}
            <mesh position={[0, -0.062, 0.108]} rotation={[0.15, 0, 0]} castShadow>
              <boxGeometry args={[0.032, 0.008, 0.01]} />
              <primitive object={materials.lip} />
            </mesh>
          </group>

          {/* ===================================================================
              EXPRESSIVE ANIME EYES (Left & Right)
              =================================================================== */}
          {/* Left Eye */}
          <group position={[-0.052, 0.015, 0.105]} rotation={[-0.05, -0.15, 0]}>
            {/* Sclera / Eye White */}
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[0.045, 0.055]} />
              <primitive object={materials.eyeWhite} />
            </mesh>

            {/* Deep Iris */}
            <mesh position={[0, -0.002, 0.002]}>
              <circleGeometry args={[0.019, 24]} />
              <primitive object={materials.iris} />
            </mesh>

            {/* Pupil */}
            <mesh position={[0, -0.001, 0.004]}>
              <circleGeometry args={[0.009, 16]} />
              <primitive object={materials.pupil} />
            </mesh>

            {/* Anime Specular Highlight Reflections */}
            <mesh position={[-0.006, 0.007, 0.006]}>
              <circleGeometry args={[0.005, 12]} />
              <primitive object={materials.eyeHighlight} />
            </mesh>
            <mesh position={[0.005, -0.006, 0.006]}>
              <circleGeometry args={[0.0025, 8]} />
              <primitive object={materials.eyeHighlight} />
            </mesh>

            {/* Upper Stylized Eyelash / Eyelid (Blink target) */}
            <mesh ref={leftEyeLidRef} position={[0, 0.022, 0.008]}>
              <boxGeometry args={[0.052, 0.012, 0.004]} />
              <primitive object={materials.eyelash} />
            </mesh>

            {/* Eyebrow */}
            <mesh position={[0, 0.045, 0.008]} rotation={[0, 0, -0.08]}>
              <boxGeometry args={[0.048, 0.006, 0.002]} />
              <primitive object={materials.hair} />
            </mesh>
          </group>

          {/* Right Eye */}
          <group position={[0.052, 0.015, 0.105]} rotation={[-0.05, 0.15, 0]}>
            {/* Sclera */}
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[0.045, 0.055]} />
              <primitive object={materials.eyeWhite} />
            </mesh>

            {/* Iris */}
            <mesh position={[0, -0.002, 0.002]}>
              <circleGeometry args={[0.019, 24]} />
              <primitive object={materials.iris} />
            </mesh>

            {/* Pupil */}
            <mesh position={[0, -0.001, 0.004]}>
              <circleGeometry args={[0.009, 16]} />
              <primitive object={materials.pupil} />
            </mesh>

            {/* Specular Highlights */}
            <mesh position={[-0.006, 0.007, 0.006]}>
              <circleGeometry args={[0.005, 12]} />
              <primitive object={materials.eyeHighlight} />
            </mesh>
            <mesh position={[0.005, -0.006, 0.006]}>
              <circleGeometry args={[0.0025, 8]} />
              <primitive object={materials.eyeHighlight} />
            </mesh>

            {/* Eyelash / Eyelid */}
            <mesh ref={rightEyeLidRef} position={[0, 0.022, 0.008]}>
              <boxGeometry args={[0.052, 0.012, 0.004]} />
              <primitive object={materials.eyelash} />
            </mesh>

            {/* Eyebrow */}
            <mesh position={[0, 0.045, 0.008]} rotation={[0, 0, 0.08]}>
              <boxGeometry args={[0.048, 0.006, 0.002]} />
              <primitive object={materials.hair} />
            </mesh>
          </group>

          {/* ===================================================================
              DISTINCTIVE LAYERED ANIME HAIRSTYLE
              =================================================================== */}
          {/* Crown & Volumetric Base */}
          <mesh position={[0, 0.06, -0.02]} castShadow receiveShadow>
            <sphereGeometry args={[0.155, 32, 32]} />
            <primitive object={materials.hair} />
          </mesh>

          {/* Anime Hair Sheen Band ("Angel Ring") */}
          <mesh position={[0, 0.08, 0.02]} rotation={[-0.1, 0, 0]}>
            <torusGeometry args={[0.152, 0.012, 12, 32, Math.PI * 0.8]} />
            <primitive object={materials.hairSheen} />
          </mesh>

          {/* Front Bangs Fringe (Layered stylized strands) */}
          <group position={[0, 0.06, 0.12]}>
            {/* Center Bang */}
            <mesh position={[0, -0.03, 0.015]} rotation={[-0.15, 0, 0]} castShadow>
              <coneGeometry args={[0.032, 0.11, 8]} />
              <primitive object={materials.hair} />
            </mesh>
            {/* Left Bang */}
            <mesh position={[-0.045, -0.02, 0.01]} rotation={[-0.1, 0.2, 0.2]} castShadow>
              <coneGeometry args={[0.03, 0.10, 8]} />
              <primitive object={materials.hair} />
            </mesh>
            {/* Right Bang */}
            <mesh position={[0.045, -0.02, 0.01]} rotation={[-0.1, -0.2, -0.2]} castShadow>
              <coneGeometry args={[0.03, 0.10, 8]} />
              <primitive object={materials.hair} />
            </mesh>
          </group>

          {/* Face-Framing Side Tresses */}
          {/* Left Side Lock */}
          <mesh position={[-0.13, -0.08, 0.04]} rotation={[0.1, 0.1, -0.15]} castShadow>
            <cylinderGeometry args={[0.025, 0.008, 0.28, 12]} />
            <primitive object={materials.hair} />
          </mesh>
          {/* Right Side Lock */}
          <mesh position={[0.13, -0.08, 0.04]} rotation={[0.1, -0.1, 0.15]} castShadow>
            <cylinderGeometry args={[0.025, 0.008, 0.28, 12]} />
            <primitive object={materials.hair} />
          </mesh>

          {/* Cascading Back Hair Volume (with gentle idle physics sway) */}
          <group ref={hairBackRef} position={[0, 0.02, -0.10]}>
            <mesh position={[0, -0.22, 0]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.13, 0.18, 0.44, 20]} />
              <primitive object={materials.hair} />
            </mesh>
            {/* Lower layered strands tips */}
            <mesh position={[-0.06, -0.44, 0.02]} rotation={[0.12, 0, -0.1]} castShadow>
              <coneGeometry args={[0.04, 0.16, 8]} />
              <primitive object={materials.hair} />
            </mesh>
            <mesh position={[0, -0.46, 0.01]} rotation={[0.15, 0, 0]} castShadow>
              <coneGeometry args={[0.045, 0.18, 8]} />
              <primitive object={materials.hair} />
            </mesh>
            <mesh position={[0.06, -0.44, 0.02]} rotation={[0.12, 0, 0.1]} castShadow>
              <coneGeometry args={[0.04, 0.16, 8]} />
              <primitive object={materials.hair} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};
