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
  | 'trumpet';

export type InstrumentCategory = 'keyboard' | 'strings' | 'percussion' | 'woodwind' | 'brass';

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
  analysisSource: 'local_web_audio' | 'metadata_heuristic' | 'manual';
  notes?: string;
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
