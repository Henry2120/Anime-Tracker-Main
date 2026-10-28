export interface DetectedInstrument {
  name: string; // e.g. "piano", "violin", "cello", "electric guitar", "bass", "drums", "vocals"
  confidence: number; // 0.0 to 1.0
  role?: 'lead' | 'rhythm' | 'bass' | 'percussion' | 'harmony' | 'solo' | string;
  notes?: string;
}

export interface InstrumentActivity {
  instrument: string;
  startTime: number;
  endTime: number;
  intensity?: number;
}

export interface MusicAnalysisResult {
  success: boolean;
  status: 'detected' | 'unavailable' | 'error' | 'unsupported';
  videoId: string;
  title: string;
  artist?: string;
  description?: string;
  bpm?: number;
  genre?: string;
  detectedInstruments: DetectedInstrument[];
  instrumentActivities?: InstrumentActivity[];
  error?: string;
  source?: 'gemini' | 'verified_catalog' | 'manual';
  cached?: boolean;
}

export interface PerformerMapping {
  instrumentKey: string; // canonical lowercase key e.g. "piano", "violin", "cello"
  displayInstrumentName: string;
  characterId: string;
  characterName: string;
  modelUrl: string;
  modelFilename: string;
  performanceAnimation: string; // animation when music is playing (e.g. "Exs_Cutin" or "playing" or "Cafe_Reaction")
  idleAnimation: string; // animation when music is paused/stopped (e.g. "Cafe_Idle" or "idle")
  notes?: string;
}

export interface PerformerAssignment {
  slotIndex: number;
  instrumentName: string;
  confidence: number;
  role?: string;
  characterId: string;
  characterName: string;
  modelUrl: string;
  modelFilename: string;
  performanceAnimation: string;
  idleAnimation: string;
}
