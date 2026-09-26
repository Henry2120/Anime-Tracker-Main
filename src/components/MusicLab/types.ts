import { AppTheme } from '../../types/theme';

export type MusicInstrument =
  | 'piano'
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'bass'
  | 'drums'
  | 'violin'
  | 'cello'
  | 'flute'
  | 'saxophone'
  | 'trumpet'
  | 'vocalist'
  | 'church-organ'
  | 'synthesizer'
  | 'electronic-drums'
  | 'dj-turntable'
  | 'harp';

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
  defaultEnsembleRank: number; // Priority order for stage arrangement
}

export interface DetectedInstrument {
  instrumentId: MusicInstrument;
  confidence: number; // 0.0 to 1.0
  isDetected: boolean;
  isActive: boolean; // whether currently playing at currentTime
  reason?: string;
}

export interface MusicSection {
  start: number; // seconds
  end: number;
  label: string;
  activeInstruments: MusicInstrument[];
  intensity: number; // 0.0 to 1.0
}

export interface MusicAnalysisResult {
  duration: number;
  bpm?: number;
  detectedInstruments: DetectedInstrument[];
  sections: MusicSection[];
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
