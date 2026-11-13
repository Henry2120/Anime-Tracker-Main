import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { SceneryConfig } from './sceneryTypes';
import {
  ProceduralSkyDome,
  TwinklingStarfield,
  ShootingMeteors,
  NaturalGrassMeadow,
  MeadowFireflies,
} from '../NightBeachScene';
import { GlassChapel } from './GlassChapel';
import { PerformanceStage } from './PerformanceStage';
import { BurningFire } from './BurningFire';
import { GroundSpikes } from './GroundSpikes';
import { GlbEnvironmentAsset } from './GlbEnvironmentAsset';

export const SAINTE_CHAPELLE_INTERIOR_GLB_URL =
  'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Sainte_Chapelle_Interior.glb';
export const ANIVERSE_FIRE_STAGE_GLB_URL =
  'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/AniVerse_Fire_Stage.glb';

export interface CompositeEnvironmentProps {
  config: SceneryConfig;
  isPlaying?: boolean;
  characterPosition?: THREE.Vector3;
}

/**
 * Composite Scenery Environment:
 * Combines procedural scenery layers and manually selected lazy-loaded GLB stage/interior assets:
 * - Night Sky & Starfield
 * - Base Ground / Meadow Terrain
 * - Fireflies
 * - Glass Chapel
 * - Performance Stage
 * - Burning Fire
 * - Ground Spikes
 * - Sainte-Chapelle Interior (GLB, OFF by default)
 * - AniVerse Fire Stage (Animated GLB, OFF by default)
 *
 * Ensures balanced lighting and proper depth sorting without washing out models.
 */
export const CompositeEnvironment: React.FC<CompositeEnvironmentProps> = ({
  config,
  isPlaying = false,
  characterPosition = new THREE.Vector3(0, 0, 0),
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera && camera.far < 180) {
      camera.far = 180;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  const isNightTheme =
    config.nightSky ||
    config.groundSpikes ||
    config.burningFire ||
    config.glassChapel ||
    config.fireStage;

  return (
    <group name="CompositeEnvironment_Root">
      {/* 1. Celestial Night Sky and Starfield */}
      {config.nightSky && (
        <group name="Env_NightSky">
          <ProceduralSkyDome />
          <TwinklingStarfield />
          <ShootingMeteors />
        </group>
      )}

      {/* 2. Natural Grass Meadow Terrain */}
      {config.meadowTerrain && (
        <group name="Env_MeadowTerrain">
          <NaturalGrassMeadow characterPosition={characterPosition} />
        </group>
      )}

      {/* 3. Performance Stage (Elevated Concert Platform under Character Feet) */}
      {config.performanceStage && (
        <group name="Env_PerformanceStage">
          <PerformanceStage radius={4.5} neonColor="#7567C7" />
        </group>
      )}

      {/* 4. Glass Chapel / Cathedral Architecture */}
      {config.glassChapel && (
        <group name="Env_GlassChapel">
          <GlassChapel scale={1.0} />
        </group>
      )}

      {/* 5. Procedural 3D Ground Spikes & Shards */}
      {config.groundSpikes && (
        <group name="Env_GroundSpikes">
          <GroundSpikes radius={6.0} intensity={1.0} />
        </group>
      )}

      {/* 6. Dynamic Burning Fire & Animated Embers */}
      {config.burningFire && (
        <group name="Env_BurningFire">
          <BurningFire position={[0, 0, -3.2]} intensity={1.0} scale={1.0} />
        </group>
      )}

      {/* 7. Bioluminescent Fireflies */}
      {config.fireflies && (
        <group name="Env_Fireflies">
          <MeadowFireflies isPlaying={isPlaying} />
        </group>
      )}

      {/* 8. Sainte-Chapelle Interior (Lazy-loaded GLB, manual activation only) */}
      {config.sainteChapelleInterior && (
        <group name="Env_SainteChapelleInterior">
          <GlbEnvironmentAsset
            id="sainte-chapelle-interior"
            name="Sainte-Chapelle Interior"
            url={SAINTE_CHAPELLE_INTERIOR_GLB_URL}
            castShadow={false}
            receiveShadow={true}
          />
        </group>
      )}

      {/* 9. AniVerse Fire Stage (Lazy-loaded animated GLB with FireShow_Loop, manual activation only) */}
      {config.fireStage && (
        <group name="Env_AniVerseFireStage">
          <GlbEnvironmentAsset
            id="aniverse-fire-stage"
            name="AniVerse Fire Stage"
            url={ANIVERSE_FIRE_STAGE_GLB_URL}
            preferredClipName="FireShow_Loop"
            castShadow={false}
            receiveShadow={true}
          />
        </group>
      )}

      {/* 10. Balanced Environmental Composite Lighting */}
      <group name="Env_Lighting">
        {isNightTheme && !config.sainteChapelleInterior ? (
          <>
            {/* Soft Ambient Fill */}
            <ambientLight intensity={0.75} color={config.nightSky ? '#131e33' : '#1e293b'} />

            {/* Cool Key Starlight Directional */}
            <directionalLight
              position={[5, 16, 8]}
              intensity={1.2}
              color="#dbeafe"
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
              shadow-bias={-0.0005}
            />

            {/* Subtle Character Rim Light */}
            <directionalLight
              position={[-6, 8, -8]}
              intensity={0.65}
              color="#93c5fd"
            />

            {/* Character Face/Front Key */}
            <directionalLight
              position={[0, 2.5, 6]}
              intensity={0.6}
              color="#f8fafc"
            />
          </>
        ) : (
          <>
            {/* Daylight / Interior / Studio Balanced Illumination */}
            <ambientLight intensity={0.95} color="#ffffff" />
            <directionalLight
              position={[4, 12, 6]}
              intensity={1.3}
              color="#ffffff"
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
              shadow-bias={-0.0005}
            />
            <directionalLight position={[-4, 8, -4]} intensity={0.55} color="#e2e8f0" />
          </>
        )}
      </group>
    </group>
  );
};

export default CompositeEnvironment;
