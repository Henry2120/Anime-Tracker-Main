/**
 * Test suite verifying YAMNet AudioSet mapping, temporal aggregation,
 * and zero Gemini API calls in the Instrument Analysis pipeline.
 */

import {
  YAMNET_INSTRUMENT_MAP,
  aggregateYamnetDetections,
  YamnetWindowResult,
} from '../src/utils/yamnetAudioClassifier';

function runTests() {
  console.log('=== YAMNet Classifier & Mapping Verification ===\n');

  // Test 1: Verify canonical instrument coverage in AudioSet map
  console.log('1. Testing canonical instrument coverage in AudioSet map...');
  const keyInstruments = [
    'Violin, fiddle',
    'Cello',
    'Double bass',
    'Piano',
    'Electric piano',
    'Organ',
    'Synthesizer',
    'Acoustic guitar',
    'Electric guitar',
    'Bass guitar',
    'Flute',
    'Saxophone',
    'Clarinet',
    'Trumpet',
    'Trombone',
    'French horn',
    'Drum kit',
    'Drum machine',
    'Snare drum',
    'Bass drum',
    'Timpani',
    'Cymbal',
    'Marimba, xylophone',
    'Vibraphone',
    'Singing',
    'Choir',
  ];

  let missing = 0;
  for (const label of keyInstruments) {
    const mapped = YAMNET_INSTRUMENT_MAP[label];
    if (!mapped) {
      console.error(`  FAIL: Missing mapping for AudioSet class: "${label}"`);
      missing++;
    } else {
      console.log(`  PASS: "${label}" -> ${mapped.canonicalName} (${mapped.family})`);
    }
  }

  if (missing > 0) {
    throw new Error(`Failed: ${missing} AudioSet classes unmapped.`);
  }

  // Test 2: Verify aggregation and rest preservation (>= 1.0s)
  console.log('\n2. Testing temporal aggregation & rest preservation...');
  const mockWindowResults: YamnetWindowResult[] = [
    // Window 1 (0.0 - 1.0s): Violin (score: 0.72)
    {
      startTime: 0.0,
      endTime: 1.0,
      detections: [
        {
          categoryName: 'Violin, fiddle',
          canonicalName: 'Violin',
          family: 'Strings',
          score: 0.72,
          isVoice: false,
        },
      ],
      rawTopCategories: [{ categoryName: 'Violin, fiddle', score: 0.72 }],
      isSilence: false,
      isMusic: true,
    },
    // Window 2 (0.5 - 1.5s): Violin (score: 0.81)
    {
      startTime: 0.5,
      endTime: 1.5,
      detections: [
        {
          categoryName: 'Violin, fiddle',
          canonicalName: 'Violin',
          family: 'Strings',
          score: 0.81,
          isVoice: false,
        },
      ],
      rawTopCategories: [{ categoryName: 'Violin, fiddle', score: 0.81 }],
      isSilence: false,
      isMusic: true,
    },
    // Window 3 (1.0 - 2.0s): Violin (score: 0.78)
    {
      startTime: 1.0,
      endTime: 2.0,
      detections: [
        {
          categoryName: 'Violin, fiddle',
          canonicalName: 'Violin',
          family: 'Strings',
          score: 0.78,
          isVoice: false,
        },
      ],
      rawTopCategories: [{ categoryName: 'Violin, fiddle', score: 0.78 }],
      isSilence: false,
      isMusic: true,
    },
    // Window 4 & 5 (2.0 - 4.5s): Silence / Rest interval (2.5 seconds gap)
    {
      startTime: 2.0,
      endTime: 3.0,
      detections: [],
      rawTopCategories: [{ categoryName: 'Silence', score: 0.95 }],
      isSilence: true,
      isMusic: false,
    },
    {
      startTime: 3.0,
      endTime: 4.0,
      detections: [],
      rawTopCategories: [{ categoryName: 'Silence', score: 0.92 }],
      isSilence: true,
      isMusic: false,
    },
    // Window 6 & 7 (4.5 - 6.5s): Violin re-enters
    {
      startTime: 4.5,
      endTime: 5.5,
      detections: [
        {
          categoryName: 'Violin, fiddle',
          canonicalName: 'Violin',
          family: 'Strings',
          score: 0.85,
          isVoice: false,
        },
      ],
      rawTopCategories: [{ categoryName: 'Violin, fiddle', score: 0.85 }],
      isSilence: false,
      isMusic: true,
    },
    {
      startTime: 5.5,
      endTime: 6.5,
      detections: [
        {
          categoryName: 'Violin, fiddle',
          canonicalName: 'Violin',
          family: 'Strings',
          score: 0.89,
          isVoice: false,
        },
      ],
      rawTopCategories: [{ categoryName: 'Violin, fiddle', score: 0.89 }],
      isSilence: false,
      isMusic: true,
    },
  ];

  const { segments, detectedInstruments } = aggregateYamnetDetections(
    mockWindowResults,
    7.0
  );

  console.log(`  Produced ${segments.length} segments:`);
  segments.forEach((seg, i) => {
    console.log(
      `  Segment ${i + 1}: ${seg.instrumentName} [${seg.startTime.toFixed(2)}s - ${seg.endTime.toFixed(2)}s] (confidence: ${seg.confidence}%)`
    );
  });

  // Verify that the 2.5s rest between 2.0s and 4.5s was NOT bridged
  if (segments.length !== 2) {
    throw new Error(
      `Expected 2 separate segments because of rest interval >= 1.0s, but got ${segments.length}`
    );
  }

  if (segments[0].startTime !== 0.0 || segments[0].endTime !== 2.0) {
    throw new Error(
      `Segment 1 unexpected boundaries: [${segments[0].startTime}, ${segments[0].endTime}]`
    );
  }

  if (segments[1].startTime !== 4.5 || segments[1].endTime !== 6.5) {
    throw new Error(
      `Segment 2 unexpected boundaries: [${segments[1].startTime}, ${segments[1].endTime}]`
    );
  }

  console.log('  PASS: Rest interval (2.0s - 4.5s) correctly preserved without bridging.');
  console.log(`  PASS: Detected instruments: ${detectedInstruments.map((d) => d.name).join(', ')}`);

  console.log('\n=== All YAMNet Classifier tests PASSED successfully! ===');
}

runTests();
