import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { MusicInstrument } from '../types';

export interface MusicianFigure3DProps {
  instrumentId: MusicInstrument;
  modelPath: string;
  isPlaying: boolean;
  intensity?: number; // 0.0 to 1.0 (default 0.8)
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  idleAnimation?: string;
  playingAnimation?: string;
  onClick?: () => void;
}

/**
 * MusicianFigure3D
 * Loads GLB/glTF 3D model, manages animations (smooth 0.25-0.5s transitions between idle & playing),
 * applies intensity pacing, and scales cleanly for the diorama stage.
 */
export const MusicianFigure3D: React.FC<MusicianFigure3DProps> = ({
  instrumentId,
  modelPath,
  isPlaying,
  intensity = 0.8,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  idleAnimation = 'idle',
  playingAnimation = 'playing',
  onClick,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // Load the GLTF asset
  const { scene, animations } = useGLTF(modelPath);

  // Bind animation mixer
  const { actions, names } = useAnimations(animations, groupRef);

  // Manage smooth transitions between idle and playing states
  useEffect(() => {
    const idleAction = actions[idleAnimation] || actions['idle'] || (names.length > 0 ? actions[names[0]] : null);
    const playAction = actions[playingAnimation] || actions['playing'] || (names.length > 1 ? actions[names[1]] : null);

    const transitionDuration = 0.35; // 0.35 seconds smooth crossfade as requested (0.25-0.5s)

    if (isPlaying && playAction) {
      // Transition from idle -> playing
      playAction.reset().fadeIn(transitionDuration).play();
      // Set playback speed dynamically based on musical intensity
      playAction.setEffectiveTimeScale(Math.max(0.6, 0.7 + intensity * 0.7));

      if (idleAction && idleAction !== playAction) {
        idleAction.fadeOut(transitionDuration);
      }
    } else if (idleAction) {
      // Transition from playing -> idle
      idleAction.reset().fadeIn(transitionDuration).play();
      idleAction.setEffectiveTimeScale(1.0);

      if (playAction && playAction !== idleAction) {
        playAction.fadeOut(transitionDuration);
      }
    }

    return () => {
      // Fade out on unmount or model change
      idleAction?.fadeOut(0.2);
      playAction?.fadeOut(0.2);
    };
  }, [actions, isPlaying, intensity, idleAnimation, playingAnimation, names]);

  // Subtle real-time performance polish: gentle procedural stage presence sway
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();

    if (isPlaying) {
      // Dynamic musical sway
      const swaySpeed = 2.5 + intensity * 1.5;
      const swayAmount = 0.02 + intensity * 0.03;
      groupRef.current.position.y = position[1] + Math.sin(time * swaySpeed) * (0.01 * intensity);
      groupRef.current.rotation.y = rotation[1] + Math.sin(time * (swaySpeed * 0.7)) * swayAmount;
    } else {
      // Gentle idle breath
      groupRef.current.position.y = position[1] + Math.sin(time * 1.5) * 0.004;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rotation[1], delta * 3);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <primitive object={scene} />
    </group>
  );
};

// Preload the default prototype asset
useGLTF.preload('/music-lab/musicians/violinist.glb');
