import { InstrumentDefinition, MusicInstrument } from '../types';

export const INSTRUMENT_REGISTRY: Record<MusicInstrument, InstrumentDefinition> = {
  piano: {
    id: 'piano',
    name: 'Piano',
    category: 'keyboard',
    icon: '🎹',
    performerTitle: 'Pianist',
    defaultEnsembleRank: 1,
  },
  drums: {
    id: 'drums',
    name: 'Drums',
    category: 'percussion',
    icon: '🥁',
    performerTitle: 'Drummer',
    defaultEnsembleRank: 2,
  },
  bass: {
    id: 'bass',
    name: 'Bass Guitar',
    category: 'strings',
    icon: '🎸',
    performerTitle: 'Bassist',
    defaultEnsembleRank: 3,
  },
  'electric-guitar': {
    id: 'electric-guitar',
    name: 'Electric Guitar',
    category: 'strings',
    icon: '🎸',
    performerTitle: 'Lead Guitarist',
    defaultEnsembleRank: 4,
  },
  'acoustic-guitar': {
    id: 'acoustic-guitar',
    name: 'Acoustic Guitar',
    category: 'strings',
    icon: '🎸',
    performerTitle: 'Acoustic Guitarist',
    defaultEnsembleRank: 5,
  },
  violin: {
    id: 'violin',
    name: 'Violin',
    category: 'strings',
    icon: '🎻',
    performerTitle: 'Violinist',
    defaultEnsembleRank: 6,
  },
  cello: {
    id: 'cello',
    name: 'Cello',
    category: 'strings',
    icon: '🎻',
    performerTitle: 'Cellist',
    defaultEnsembleRank: 7,
  },
  flute: {
    id: 'flute',
    name: 'Flute',
    category: 'woodwind',
    icon: '🪈',
    performerTitle: 'Flutist',
    defaultEnsembleRank: 8,
  },
  saxophone: {
    id: 'saxophone',
    name: 'Saxophone',
    category: 'woodwind',
    icon: '🎷',
    performerTitle: 'Saxophonist',
    defaultEnsembleRank: 9,
  },
  trumpet: {
    id: 'trumpet',
    name: 'Trumpet',
    category: 'brass',
    icon: '🎺',
    performerTitle: 'Trumpeter',
    defaultEnsembleRank: 10,
  },
};

export const ALL_INSTRUMENTS: MusicInstrument[] = [
  'piano',
  'drums',
  'bass',
  'electric-guitar',
  'acoustic-guitar',
  'violin',
  'cello',
  'flute',
  'saxophone',
  'trumpet',
];

export function getInstrumentDefinition(id: MusicInstrument): InstrumentDefinition {
  return INSTRUMENT_REGISTRY[id] || INSTRUMENT_REGISTRY.piano;
}
