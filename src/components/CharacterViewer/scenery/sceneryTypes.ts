export interface SceneryConfig {
  meadowTerrain: boolean;
  nightSky: boolean;
  fireflies: boolean;
  glassChapel: boolean;
  performanceStage: boolean;
  burningFire: boolean;
  groundSpikes: boolean;
  sainteChapelleInterior: boolean;
  fireStage: boolean;
}

export const DEFAULT_SCENERY_CONFIG: SceneryConfig = {
  meadowTerrain: false,
  nightSky: false,
  fireflies: false,
  glassChapel: false,
  performanceStage: false,
  burningFire: false,
  groundSpikes: false,
  sainteChapelleInterior: false,
  fireStage: false,
};

export const HINA_SPECIAL_SCENERY: SceneryConfig = {
  meadowTerrain: true,
  nightSky: true,
  fireflies: true,
  glassChapel: false,
  performanceStage: false,
  burningFire: false,
  groundSpikes: false,
  sainteChapelleInterior: false,
  fireStage: false,
};

export interface SceneryPreset {
  id: string;
  name: string;
  description: string;
  config: SceneryConfig;
}

export const SCENERY_PRESETS: SceneryPreset[] = [
  {
    id: 'glass-cathedral',
    name: 'Glass Cathedral',
    description: 'Ethereal Gothic glass chapel with crystalline arched ribs, starry night dome, and translucent floor.',
    config: {
      meadowTerrain: false,
      nightSky: true,
      fireflies: true,
      glassChapel: true,
      performanceStage: true,
      burningFire: false,
      groundSpikes: false,
      sainteChapelleInterior: false,
      fireStage: false,
    },
  },
  {
    id: 'dramatic-monolith',
    name: 'Obsidian Monolith Spikes',
    description: 'Dramatic dark blue/charcoal ground spikes with central backlight and floating geometric shards.',
    config: {
      meadowTerrain: false,
      nightSky: true,
      fireflies: false,
      glassChapel: false,
      performanceStage: true,
      burningFire: true,
      groundSpikes: true,
      sainteChapelleInterior: false,
      fireStage: false,
    },
  },
  {
    id: 'midnight-meadow',
    name: 'Nocturne Grass Meadow',
    description: 'Lush natural grass terrain under midnight starfield with twinkling meteors and glowing fireflies.',
    config: {
      meadowTerrain: true,
      nightSky: true,
      fireflies: true,
      glassChapel: false,
      performanceStage: false,
      burningFire: false,
      groundSpikes: false,
      sainteChapelleInterior: false,
      fireStage: false,
    },
  },
  {
    id: 'concert-arena',
    name: 'Concert Performance Stage',
    description: 'Elevated multi-tier concert stage with neon rim glow and ambient stage lighting.',
    config: {
      meadowTerrain: false,
      nightSky: true,
      fireflies: false,
      glassChapel: false,
      performanceStage: true,
      burningFire: false,
      groundSpikes: false,
      sainteChapelleInterior: false,
      fireStage: false,
    },
  },
  {
    id: 'burning-night',
    name: 'Burning Night Stage',
    description: 'Concert stage surrounded by dynamic embers, flickering firelight, and starfield.',
    config: {
      meadowTerrain: false,
      nightSky: true,
      fireflies: false,
      glassChapel: false,
      performanceStage: true,
      burningFire: true,
      groundSpikes: false,
      sainteChapelleInterior: false,
      fireStage: false,
    },
  },
  {
    id: 'sainte-chapelle-interior',
    name: 'Sainte-Chapelle Interior (GLB)',
    description: 'Detailed Gothic cathedral interior GLB with stained glass and vaulted nave (34.4 MB, lazy-loaded).',
    config: {
      meadowTerrain: false,
      nightSky: false,
      fireflies: false,
      glassChapel: false,
      performanceStage: false,
      burningFire: false,
      groundSpikes: false,
      sainteChapelleInterior: true,
      fireStage: false,
    },
  },
  {
    id: 'aniverse-fire-stage',
    name: 'AniVerse Fire Stage (GLB)',
    description: 'Animated pyrotechnic concert stage GLB with FireShow_Loop FX and dark starry sky (4.6 MB, lazy-loaded).',
    config: {
      meadowTerrain: false,
      nightSky: true,
      fireflies: false,
      glassChapel: false,
      performanceStage: false,
      burningFire: false,
      groundSpikes: false,
      sainteChapelleInterior: false,
      fireStage: true,
    },
  },
];
