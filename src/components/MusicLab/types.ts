import { AppTheme } from '../../types/theme';

export type MusicInstrument =
  // Acoustic / traditional / orchestral
  | 'piano'
  | 'acoustic-guitar'
  | 'classical-guitar'
  | 'electric-guitar'
  | 'bass'
  | 'double-bass'
  | 'violin'
  | 'viola'
  | 'cello'
  | 'flute'
  | 'clarinet'
  | 'oboe'
  | 'bassoon'
  | 'saxophone'
  | 'trumpet'
  | 'trombone'
  | 'french-horn'
  | 'tuba'
  | 'harp'
  | 'accordion'
  | 'mandolin'
  | 'church-organ'
  | 'pipe-organ'
  | 'timpani'
  | 'percussion'
  | 'drums'
  // Voice / ensemble
  | 'vocalist'
  | 'vocals-effects'
  | 'choir'
  // Electronic / modern / production
  | 'synthesizer'
  | 'keyboard-workstation'
  | 'dj-turntable'
  | 'sampler'
  | 'drum-machine'
  | 'electronic-drum-pad'
  | 'electronic-drums'
  | 'midi-controller'
  | 'sequencer'
  | 'electronic-producer';

export type InstrumentCategory =
  | 'keyboard'
  | 'strings'
  | 'percussion'
  | 'woodwind'
  | 'brass'
  | 'vocal'
  | 'electronic';

export type PerformerGender = 'female' | 'male';

export type TheaterEnvironment = 'concert-hall' | 'small-theater' | 'church';

export interface TheaterPerformer {
  id: string;
  instrument: MusicInstrument;
  gender: PerformerGender;
  characterName: string;
  x: number; // 0 - 100 percentage
  y: number; // 0 - 100 percentage
  scale: number; // 0.5 - 2.0
  isPlaying: boolean;
  playMode?: 'auto' | 'always' | 'resting';
  layerOrder?: number;
}

export interface TheaterSceneConfig {
  id: string;
  name: string;
  environment: TheaterEnvironment;
  performers: TheaterPerformer[];
  createdAt: number;
  updatedAt: number;
}

export interface InstrumentDefinition {
  id: MusicInstrument;
  name: string;
  category: InstrumentCategory;
  icon: string;
  performerTitle: string;
  description?: string;
  defaultEnsembleRank: number; // Priority order for stage arrangement
  performerType: 'seated' | 'standing' | 'station';
  requiresSeatedPerformer?: boolean;
  requiresStandingPerformer?: boolean;
  visualVariant?: string;
  aliases?: string[];

  // 3D Miniature Stage Configuration
  modelPath?: string;
  has3DModel?: boolean;
  idleAnimation?: string;
  playingAnimation?: string;
  scale3D?: number;
  position3D?: [number, number, number];
  rotation3D?: [number, number, number];
}

export interface CharacterProfile {
  id: string;
  name: string;
  gender: PerformerGender;
  archetype?: string;
  modelPath?: string;
  heightCm?: number;
  defaultScale?: number;
}

export interface InstrumentAsset {
  instrumentId: MusicInstrument;
  propModelPath?: string;
  attachmentBone?: string;
  performerType: 'seated' | 'standing' | 'station';
}

export interface MusicianAnimationBinding {
  characterId: string;
  instrumentId: MusicInstrument;
  idleAnimationClip?: string;
  playingAnimationClip?: string;
  intensityScale?: number;
}

export interface ModularMusician {
  id: string;
  character: CharacterProfile;
  instrument: InstrumentAsset;
  animationBinding: MusicianAnimationBinding;
  position: [number, number, number];
  rotation?: [number, number, number];
  isPlaying: boolean;
  intensity: number;
}

export interface InstrumentActivity {
  instrumentId: MusicInstrument;
  startPercent: number; // 0.0 to 1.0
  endPercent: number;   // 0.0 to 1.0
  intensity: number;    // 0.0 to 1.0
  confidence: number;   // 0.0 to 1.0
  reason?: string;
}

export interface DetectedInstrument {
  instrumentId: MusicInstrument;
  confidence: number; // 0.0 to 1.0
  isDetected: boolean;
  isActive: boolean; // whether currently playing at currentTime
  reason?: string;
  intensity?: number;
}

export interface MusicSection {
  start: number; // seconds
  end: number;
  label: string;
  activeInstruments: MusicInstrument[];
  intensity: number; // 0.0 to 1.0
}

export interface AudioDynamicsPoint {
  time: number;              // Timestamp in seconds
  intensity: number;         // 0.0 to 1.0 (percentile-normalized instantaneous energy)
  transientStrength: number; // 0.0 to 1.0 (attack / onset strength)
  violinEnergy: number;      // 0.0 to 1.0 (bowed-string spectral band prominence)
}

export interface MusicAnalysisResult {
  duration: number;
  bpm?: number;
  detectedInstruments: DetectedInstrument[];
  instrumentActivities?: InstrumentActivity[];
  sections: MusicSection[];
  dynamicsTimeline?: AudioDynamicsPoint[]; // High-resolution (~50ms) time-varying dynamics curve
  analysisSource: 'gemini_ai' | 'local_web_audio' | 'metadata_heuristic' | 'manual';
  notes?: string;
  title?: string;
  artist?: string;
  description?: string;
}

export interface MusicPerformer {
  id: string;
  instrument: MusicInstrument;
  performerTitle: string;
  characterName: string;
  isPlaying: boolean;
  positionIndex: number;
}

export type MusicSourceType = 'none' | 'youtube' | 'local_audio';

export interface PlaybackState {
  currentTime: number;
  duration: number;
  progress: number; // 0.0 to 1.0
  isPlaying: boolean;
  isBuffering?: boolean;
  isEnded?: boolean;
}

export interface YouTubeTrackInfo {
  videoId: string;
  url: string;
  title?: string;
  duration?: number;
}

export interface LocalAudioTrackInfo {
  fileName: string;
  fileSize: number;
  fileType: string;
  objectUrl: string;
  audioBuffer?: AudioBuffer;
}
