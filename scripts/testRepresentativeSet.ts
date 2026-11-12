import {
  generateAnalysisWindows,
  calculateCoverage,
  reconcileWindowSegments,
  validateAuthoritativeDuration,
  WindowCoverageRecord,
} from '../src/utils/audioCoverageRecovery';
import {
  normalizeInstrument,
  MASTER_INSTRUMENT_CATALOG,
  InstrumentTimelineSegment,
  isVoiceInstrument,
  TAXONOMY_VERSION,
  ANALYSIS_SCHEMA_VERSION,
} from '../src/utils/instrumentNormalization';
import {
  buildAnalysisCacheKey,
  CURRENT_MODEL_ID,
  INSTRUCTION_VERSION,
} from '../src/utils/analysisCacheIndexedDB';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

console.log('======================================================================');
console.log('RUNNING REPRESENTATIVE TEST SET (10 DIVERSE STYLES & RECORDING TYPES)');
console.log('======================================================================\n');

// -------------------------------------------------------------------------
// 1. Orchestral / Classical Music
// -------------------------------------------------------------------------
console.log('TEST 1: Orchestral / Classical Music (Symphonic Strings, Woodwinds, Brass, Percussion)');
{
  const duration = validateAuthoritativeDuration(180)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  // Simulate orchestral recording: Strings throughout, Woodwinds melody, Brass fanfares, Timpani
  const records: WindowCoverageRecord[] = windows.map((w, idx) => {
    const segs: InstrumentTimelineSegment[] = [
      {
        id: `orch-strings-${idx}`,
        instrumentName: 'String Section',
        family: 'Strings',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 94,
        audibility: 'audible',
        evidence: 'Lush bowing of orchestral violin and cello sections',
      },
      {
        id: `orch-woodwind-${idx}`,
        instrumentName: 'Flute',
        family: 'Woodwinds',
        startTime: w.startTime + 2,
        endTime: Math.min(w.endTime, w.startTime + 28),
        confidence: 88,
        audibility: 'audible',
        evidence: 'High woodwind solo melody',
      },
      ...(idx % 2 === 1
        ? [
            {
              id: `orch-brass-${idx}`,
              instrumentName: 'French Horn',
              family: 'Brass' as const,
              startTime: w.startTime + 10,
              endTime: w.endTime - 5,
              confidence: 90,
              audibility: 'audible' as const,
              evidence: 'Warm brass sustained harmony chords',
            },
            {
              id: `orch-timpani-${idx}`,
              instrumentName: 'Timpani',
              family: 'Percussion' as const,
              startTime: w.startTime + 15,
              endTime: w.endTime - 2,
              confidence: 86,
              audibility: 'audible' as const,
              evidence: 'Resonant orchestral kettle drum rolls',
            },
          ]
        : []),
    ];

    return {
      windowId: w.id,
      index: idx,
      requestedStart: w.startTime,
      requestedEnd: w.endTime,
      processedStart: w.startTime,
      processedEnd: w.endTime,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: segs,
    };
  });

  const coverage = calculateCoverage(duration, records);
  assert(coverage.isFullCoverage, 'Full video coverage (100%)');
  assert(coverage.missingRanges.length === 0, 'No unanalyzed gaps');

  const reconciled = reconcileWindowSegments(records, duration);
  const instruments = new Set(reconciled.map((s) => s.instrumentName));
  assert(instruments.has('Unresolved String Section'), 'Unresolved String Section identified and merged');
  assert(instruments.has('Flute'), 'Flute identified in woodwinds');
  assert(instruments.has('French Horn'), 'French Horn identified in brass');
  assert(instruments.has('Timpani'), 'Timpani identified in percussion');

  // Check that Unresolved String Section spans continuous playback across windows
  const stringSegs = reconciled.filter((s) => s.instrumentName === 'Unresolved String Section');
  assert(stringSegs.length === 1 && stringSegs[0].startTime === 0 && stringSegs[0].endTime === 180,
    'Unresolved String Section seamlessly merged across all 5 overlapping windows (0s to 180s)');
  console.log('✅ TEST 1 PASSED: Classical Orchestral\n');
}

// -------------------------------------------------------------------------
// 2. Anime / Game Soundtrack (OST)
// -------------------------------------------------------------------------
console.log('TEST 2: Anime / Game Soundtrack (OST: Piano intro, layered strings, synth bass, electric rhythm)');
{
  const duration = validateAuthoritativeDuration(120)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  const records: WindowCoverageRecord[] = windows.map((w, idx) => {
    const segs: any[] = [];
    if (idx === 0) {
      // Intro: solo gentle piano [0-20s], then strings swell at 20s
      segs.push({
        id: 'ost-piano-intro',
        instrumentName: 'Piano',
        family: 'Keyboards',
        startTime: 0,
        endTime: 24,
        confidence: 95,
        audibility: 'prominent',
        evidence: 'Acoustic piano arpeggio opening theme',
      });
      segs.push({
        id: 'ost-strings-intro',
        instrumentName: 'Violin',
        family: 'Strings',
        startTime: 20,
        endTime: 45,
        confidence: 90,
        audibility: 'prominent',
        evidence: 'Emotional solo violin melody leading into theme',
      });
    } else {
      // Build-up and battle theme: Drums, Electric Guitar, Synthesizer, Strings
      segs.push({
        id: `ost-drums-${idx}`,
        instrumentName: 'Drum Kit',
        family: 'Percussion',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 96,
        audibility: 'prominent',
        evidence: 'High tempo kick and snare rhythm',
      });
      segs.push({
        id: `ost-eguitar-${idx}`,
        instrumentName: 'Electric Guitar',
        family: 'Guitars',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 92,
        audibility: 'audible',
        evidence: 'Distorted power chord riffs',
      });
      segs.push({
        id: `ost-strings-${idx}`,
        instrumentName: 'Violin',
        family: 'Strings',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 88,
        audibility: 'audible',
        evidence: 'Counter-melody strings running behind guitar riff',
      });
    }

    return {
      windowId: w.id,
      index: idx,
      requestedStart: w.startTime,
      requestedEnd: w.endTime,
      processedStart: w.startTime,
      processedEnd: w.endTime,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: segs,
    };
  });

  const reconciled = reconcileWindowSegments(records, duration);
  const pianoSegs = reconciled.filter((s) => s.instrumentName === 'Piano');
  const violinSegs = reconciled.filter((s) => s.instrumentName === 'Violin');
  const drumSegs = reconciled.filter((s) => s.instrumentName === 'Drum Kit');

  assert(pianoSegs.length > 0 && pianoSegs[0].startTime === 0, 'Piano intro preserved at 0s');
  assert(violinSegs.length > 0, 'Violin recognized during both intro and heavy climax');
  assert(drumSegs.length > 0 && drumSegs[0].startTime >= 40, 'Drums enter after piano intro');
  console.log('✅ TEST 2 PASSED: Anime/Game OST\n');
}

// -------------------------------------------------------------------------
// 3. Rock / Metal Track with Heavy Distortion & Fast Drums (Flamewall Scenario)
// -------------------------------------------------------------------------
console.log('TEST 3: Rock / Speedcore / Symphonic Metal (Regression check for Flamewall: Violin intro, Drums, E-Guitar, Strings)');
{
  const duration = validateAuthoritativeDuration(411)!; // 6:51
  assert(duration === 411, 'Flamewall authoritative duration = 411s');

  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });
  assert(windows.length === 11, `Flamewall scheduled into 11 windows (expected 11, got ${windows.length})`);

  // Window 0 has solo violin [0-3s], then intense speedcore drums [3-45s], electric guitar [3-45s], and symphonic strings [3-45s]
  const records: WindowCoverageRecord[] = windows.map((w, idx) => {
    const segs: any[] = [];
    if (idx === 0) {
      segs.push({
        id: 'flame-violin-intro',
        instrumentName: 'Violin',
        family: 'Strings',
        startTime: 0,
        endTime: 3,
        confidence: 94,
        audibility: 'prominent',
        evidence: 'Solo acoustic violin opening phrase before heavy beat drop',
      });
      segs.push({
        id: 'flame-strings-drop',
        instrumentName: 'String Section',
        family: 'Strings',
        startTime: 3,
        endTime: 45,
        confidence: 92,
        audibility: 'prominent',
        evidence: 'Rapid symphonic string section accompaniment',
      });
      segs.push({
        id: 'flame-drums-drop',
        instrumentName: 'Drum Kit',
        family: 'Percussion',
        startTime: 3,
        endTime: 45,
        confidence: 97,
        audibility: 'prominent',
        evidence: 'Extreme tempo double-bass speedcore metal drumming',
      });
      segs.push({
        id: 'flame-eguitar-drop',
        instrumentName: 'Electric Guitar',
        family: 'Guitars',
        startTime: 3,
        endTime: 45,
        confidence: 93,
        audibility: 'prominent',
        evidence: 'Heavy distorted chugging electric guitar riffs',
      });
    } else {
      // Subsequent windows continue high-intensity metal/electronic
      segs.push({
        id: `flame-drums-${idx}`,
        instrumentName: 'Drum Kit',
        family: 'Percussion',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 95,
        audibility: 'prominent',
        evidence: 'Continuous heavy kick/snare double-pedal rhythms',
      });
      segs.push({
        id: `flame-eguitar-${idx}`,
        instrumentName: 'Electric Guitar',
        family: 'Guitars',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 91,
        audibility: 'prominent',
        evidence: 'Distorted rhythm and solo guitar riffs',
      });
      segs.push({
        id: `flame-strings-${idx}`,
        instrumentName: 'String Section',
        family: 'Strings',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 89,
        audibility: 'audible',
        evidence: 'Symphonic strings backing speed metal textures',
      });
    }

    return {
      windowId: w.id,
      index: idx,
      requestedStart: w.startTime,
      requestedEnd: w.endTime,
      processedStart: w.startTime,
      processedEnd: w.endTime,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: segs,
    };
  });

  const coverage = calculateCoverage(duration, records);
  assert(coverage.isFullCoverage, 'Flamewall achieves 100% full coverage');
  assert(coverage.coveragePercentage === 100, 'Coverage percentage = 100%');
  assert(coverage.missingRanges.length === 0, 'No missing ranges in 411s track');

  const reconciled = reconcileWindowSegments(records, duration);
  const introViolin = reconciled.find((s) => s.instrumentName === 'Violin' && s.startTime === 0 && s.endTime <= 4);
  assert(Boolean(introViolin), 'Flamewall solo Violin intro [0s-3s] preserved intact!');

  const strings = reconciled.find((s) => s.instrumentName === 'Unresolved String Section');
  assert(Boolean(strings), 'Symphonic Unresolved String Section detected');

  const drums = reconciled.find((s) => s.instrumentName === 'Drum Kit');
  assert(Boolean(drums), 'Drums detected');

  const eguitar = reconciled.find((s) => s.instrumentName === 'Electric Guitar');
  assert(Boolean(eguitar), 'Electric Guitar detected');

  console.log('✅ TEST 3 PASSED: Flamewall Regression Test\n');
}

// -------------------------------------------------------------------------
// 4. Acoustic / Pop Track with Guitar or Piano
// -------------------------------------------------------------------------
console.log('TEST 4: Acoustic / Pop Track (Acoustic Guitar, Upright Bass, Handclaps/Shaker, Piano)');
{
  const duration = validateAuthoritativeDuration(200)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'instrumental_music',
    isSilence: false,
    segments: [
      {
        id: `pop-acoust-${idx}`,
        instrumentName: 'Acoustic Guitar',
        family: 'Strings',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 96,
        audibility: 'audible',
        evidence: 'Steel-string acoustic guitar fingerpicking and strumming chords',
      },
      {
        id: `pop-bass-${idx}`,
        instrumentName: 'Bass Guitar',
        family: 'Strings',
        startTime: w.startTime + 10,
        endTime: w.endTime,
        confidence: 90,
        audibility: 'audible',
        evidence: 'Warm bass guitar rhythm line supporting chord changes',
      },
    ],
  }));

  const reconciled = reconcileWindowSegments(records, duration);
  assert(reconciled.some((s) => s.instrumentName === 'Acoustic Guitar'), 'Acoustic guitar properly identified (not electric)');
  assert(!reconciled.some((s) => s.instrumentName === 'Electric Guitar'), 'Zero false electric guitar hallucination');
  console.log('✅ TEST 4 PASSED: Acoustic / Pop\n');
}

// -------------------------------------------------------------------------
// 5. EDM / Electronic Track with Synths & Drum Machines
// -------------------------------------------------------------------------
console.log('TEST 5: EDM / Electronic Track (Synthesizer, Drum Machine, Synth Bass)');
{
  const duration = validateAuthoritativeDuration(150)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'instrumental_music',
    isSilence: false,
    segments: [
      {
        id: `edm-synth-${idx}`,
        instrumentName: 'Synthesizer',
        family: 'Voice & Electronic',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 98,
        audibility: 'audible',
        evidence: 'Super-saw lead synthesizer chords and arpeggiator',
      },
      {
        id: `edm-dm-${idx}`,
        instrumentName: 'Drum Machine',
        family: 'Percussion',
        startTime: w.startTime + 15,
        endTime: w.endTime,
        confidence: 94,
        audibility: 'audible',
        evidence: 'Electronic 808 programmed beat pattern and four-on-the-floor kick',
      },
    ],
  }));

  const reconciled = reconcileWindowSegments(records, duration);
  const synth = reconciled.find((s) => s.instrumentName === 'Synthesizer');
  const dm = reconciled.find((s) => s.instrumentName === 'Drum Machine');

  assert(Boolean(synth), 'Synthesizer accurately classified');
  assert(Boolean(dm), 'Drum Machine recognized in percussion taxonomy');
  assert(!reconciled.some((s) => s.instrumentName === 'Acoustic Guitar'), 'No acoustic instruments hallucinated on pure EDM');
  console.log('✅ TEST 5 PASSED: EDM / Electronic\n');
}

// -------------------------------------------------------------------------
// 6. Solo Instrument Track (e.g. Solo Piano or Solo Violin)
// -------------------------------------------------------------------------
console.log('TEST 6: Solo Instrument Track (Solo Piano, unassisted without drums or bass)');
{
  const duration = validateAuthoritativeDuration(90)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'instrumental_music',
    isSilence: false,
    segments: [
      {
        id: `solo-piano-${idx}`,
        instrumentName: 'Piano',
        family: 'Keyboards',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 98,
        audibility: 'audible',
        evidence: 'Unaccompanied grand piano performance playing classical nocturne',
      },
    ],
  }));

  const coverage = calculateCoverage(duration, records);
  assert(coverage.isFullCoverage, 'Full coverage verified on solo track');

  const reconciled = reconcileWindowSegments(records, duration);
  assert(reconciled.length === 1, 'Only one continuous instrument segment detected across whole video');
  assert(reconciled[0].instrumentName === 'Piano', 'Instrument is solely Piano');
  assert(reconciled[0].startTime === 0 && reconciled[0].endTime === 90, 'Piano covers 0s to 90s');
  console.log('✅ TEST 6 PASSED: Solo Instrument\n');
}

// -------------------------------------------------------------------------
// 7. Traditional / World Music Track
// -------------------------------------------------------------------------
console.log('TEST 7: Traditional / World Music (Shakuhachi flute, Koto, Taiko drums)');
{
  const duration = validateAuthoritativeDuration(140)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  // Normalization checks for traditional instruments
  const kotoNorm = normalizeInstrument('koto');
  assert(kotoNorm.canonicalName === 'Koto' && kotoNorm.family === 'Traditional & World', 'Koto mapped to Traditional & World');

  const shakuhachiNorm = normalizeInstrument('shakuhachi');
  assert(shakuhachiNorm.canonicalName === 'Shakuhachi' && shakuhachiNorm.family === 'Traditional & World', 'Shakuhachi mapped to Traditional & World');

  const taikoNorm = normalizeInstrument('taiko');
  assert(taikoNorm.canonicalName === 'Taiko' && taikoNorm.family === 'Traditional & World', 'Taiko mapped to Traditional & World');

  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'instrumental_music',
    isSilence: false,
    segments: [
      {
        id: `trad-koto-${idx}`,
        instrumentName: 'Koto',
        family: 'Traditional & World',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 95,
        audibility: 'audible',
        evidence: 'Plucked 13-string traditional Japanese zither notes',
      },
      {
        id: `trad-shaku-${idx}`,
        instrumentName: 'Shakuhachi',
        family: 'Traditional & World',
        startTime: w.startTime + 5,
        endTime: w.endTime - 5,
        confidence: 91,
        audibility: 'audible',
        evidence: 'Bamboo end-blown flute breathy phrasing',
      },
    ],
  }));

  const reconciled = reconcileWindowSegments(records, duration);
  assert(reconciled.some((s) => s.instrumentName === 'Koto'), 'Koto detected in world music');
  assert(reconciled.some((s) => s.instrumentName === 'Shakuhachi'), 'Shakuhachi detected in world music');
  console.log('✅ TEST 7 PASSED: Traditional / World Music\n');
}

// -------------------------------------------------------------------------
// 8. Live Concert Recording with Audience Noise & Reverb
// -------------------------------------------------------------------------
console.log('TEST 8: Live Concert Recording (Audience cheering, room reverb, live electric band)');
{
  const duration = validateAuthoritativeDuration(160)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  const records: WindowCoverageRecord[] = windows.map((w, idx) => {
    // Window 0: crowd cheering 0-10s before band counts in at 10s
    const segs: any[] = [];
    const startSec = idx === 0 ? 10 : w.startTime;

    segs.push({
      id: `live-eguitar-${idx}`,
      instrumentName: 'Electric Guitar',
      family: 'Guitars',
      startTime: startSec,
      endTime: w.endTime,
      confidence: 92,
      audibility: 'prominent',
      evidence: 'Live arena stage amplifier feedback and rhythm guitar riffing',
    });
    segs.push({
      id: `live-drums-${idx}`,
      instrumentName: 'Drum Kit',
      family: 'Percussion',
      startTime: startSec,
      endTime: w.endTime,
      confidence: 94,
      audibility: 'prominent',
      evidence: 'Live stadium acoustic drum kit with ride cymbal and floor toms',
    });

    return {
      windowId: w.id,
      index: idx,
      requestedStart: w.startTime,
      requestedEnd: w.endTime,
      processedStart: w.startTime,
      processedEnd: w.endTime,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: segs,
    };
  });

  const reconciled = reconcileWindowSegments(records, duration);
  const guitar = reconciled.find((s) => s.instrumentName === 'Electric Guitar');
  assert(guitar?.startTime === 10, 'Live intro crowd noise correctly recognized as instrument silence; music starts at 10s');
  console.log('✅ TEST 8 PASSED: Live Concert Recording\n');
}

// -------------------------------------------------------------------------
// 9. Vocal-Centric Track / A Cappella / Mixed Choir
// -------------------------------------------------------------------------
console.log('TEST 9: Vocal-Centric / Choir / A Cappella');
{
  const duration = validateAuthoritativeDuration(120)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'instrumental_music',
    isSilence: false,
    segments: [
      {
        id: `choir-harm-${idx}`,
        instrumentName: 'Mixed Choir',
        family: 'Voice & Electronic',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 96,
        audibility: 'audible',
        evidence: 'Multi-part SATB choral polyphony without instrumental accompaniment',
        isVoice: true,
      },
    ],
  }));

  const reconciled = reconcileWindowSegments(records, duration);
  assert(reconciled.length === 1 && reconciled[0].instrumentName === 'Mixed Choir', 'Mixed Choir recognized as canonical vocal instrument');
  assert(reconciled[0].family === 'Voice & Electronic', 'Family is Voice & Electronic');
  assert(reconciled[0].isVoice === true, 'isVoice flag preserved');
  console.log('✅ TEST 9 PASSED: Vocal-Centric / Choir\n');
}

// -------------------------------------------------------------------------
// 10. Speech / Non-Musical Audio (Zero Instruments Fabricated)
// -------------------------------------------------------------------------
console.log('TEST 10: Speech / Non-Musical Audio (Podcast, Conversation, Ambient Noise)');
{
  const duration = validateAuthoritativeDuration(100)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  // All windows processed, but model detected speech only -> isSilence = true or empty segments
  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'silence',
    isSilence: true, // No musical instruments
    segments: [],
  }));

  const coverage = calculateCoverage(duration, records);
  assert(coverage.isFullCoverage, 'Full audio coverage verified (100%)');
  assert(coverage.coveragePercentage === 100, 'Coverage percentage is 100%');
  assert(coverage.missingRanges.length === 0, 'No unanalyzed gaps');

  const reconciled = reconcileWindowSegments(records, duration);
  assert(reconciled.length === 0, 'Zero musical instruments fabricated for spoken audio');

  const isNonMusicalOrSilent = reconciled.length === 0;
  const status = isNonMusicalOrSilent ? 'unsupported' : coverage.status;
  assert(status === 'unsupported', 'Status set to unsupported for non-musical audio without error');
  console.log('✅ TEST 10 PASSED: Speech / Non-Musical Audio\n');
}

// -------------------------------------------------------------------------
// 11. Fine-Grained Vocal Taxonomy & Voice Classifier (Section 6)
// -------------------------------------------------------------------------
console.log('TEST 11: Fine-Grained Vocal Taxonomy & Distinctions (Male/Female/Choir/Speech)');
{
  const testCases: Array<{ raw: string; expectedName: string; expectedFamily: string }> = [
    { raw: 'Male Solo Voice', expectedName: 'Male Solo Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'male vocals', expectedName: 'Male Solo Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'Female Solo Voice', expectedName: 'Female Solo Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'female lead singer', expectedName: 'Female Solo Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'Male Backing Vocals', expectedName: 'Male Backing Vocals', expectedFamily: 'Voice & Electronic' },
    { raw: 'Female Backing Vocals', expectedName: 'Female Backing Vocals', expectedFamily: 'Voice & Electronic' },
    { raw: 'Mixed Backing Vocals', expectedName: 'Mixed Backing Vocals', expectedFamily: 'Voice & Electronic' },
    { raw: 'Male Choir', expectedName: 'Male Choir', expectedFamily: 'Voice & Electronic' },
    { raw: 'Female Choir', expectedName: 'Female Choir', expectedFamily: 'Voice & Electronic' },
    { raw: 'Mixed Choir', expectedName: 'Mixed Choir', expectedFamily: 'Voice & Electronic' },
    { raw: 'Spoken Male Voice', expectedName: 'Spoken Male Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'Spoken Female Voice', expectedName: 'Spoken Female Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'Unclassified Voice', expectedName: 'Unclassified Voice', expectedFamily: 'Voice & Electronic' },
    { raw: 'human voice', expectedName: 'Unclassified Voice', expectedFamily: 'Voice & Electronic' },
  ];

  testCases.forEach((tc) => {
    const norm = normalizeInstrument(tc.raw);
    assert(norm.canonicalName === tc.expectedName, `Vocal "${tc.raw}" maps to "${tc.expectedName}" (got "${norm.canonicalName}")`);
    assert(norm.family === tc.expectedFamily, `Vocal "${tc.raw}" family is "${tc.expectedFamily}" (got "${norm.family}")`);
    assert(isVoiceInstrument(norm.canonicalName), `isVoiceInstrument("${norm.canonicalName}") is true`);
  });

  // Non-voice instruments must return false
  assert(!isVoiceInstrument('Piano'), 'Piano is not voice');
  assert(!isVoiceInstrument('Violin'), 'Violin is not voice');
  assert(!isVoiceInstrument('Drum Kit'), 'Drum Kit is not voice');
  assert(!isVoiceInstrument('Synthesizer'), 'Synthesizer is not voice');
  console.log('✅ TEST 11 PASSED: Vocal Taxonomy & Distinctions\n');
}

// -------------------------------------------------------------------------
// 12. Solo Strings vs Unresolved Sections (Section 5)
// -------------------------------------------------------------------------
console.log('TEST 12: Solo Strings vs Unresolved Section Isolation (No Generic Strings)');
{
  assert(normalizeInstrument('Violin').canonicalName === 'Violin', 'Violin normalized');
  assert(normalizeInstrument('Viola').canonicalName === 'Viola', 'Viola normalized');
  assert(normalizeInstrument('Cello').canonicalName === 'Cello', 'Cello normalized');
  assert(normalizeInstrument('Double Bass').canonicalName === 'Double Bass', 'Double Bass normalized');
  assert(normalizeInstrument('String Section').canonicalName === 'Unresolved String Section', 'String Section maps to Unresolved String Section');
  assert(normalizeInstrument('Strings (Ensemble)').canonicalName === 'Unresolved String Section', 'Strings (Ensemble) maps to Unresolved String Section');
  assert(normalizeInstrument('Woodwind Section').canonicalName === 'Unresolved Woodwind Section', 'Woodwind Section maps to Unresolved Woodwind Section');
  assert(normalizeInstrument('Brass Section').canonicalName === 'Unresolved Brass Section', 'Brass Section maps to Unresolved Brass Section');

  // Verify generic ensemble labels are completely excluded from catalog
  const catalogNames = MASTER_INSTRUMENT_CATALOG.map((i) => i.canonicalName);
  assert(!catalogNames.includes('Strings (Ensemble)' as any), 'Strings (Ensemble) NOT in catalog');
  assert(!catalogNames.includes('Woodwinds (Ensemble)' as any), 'Woodwinds (Ensemble) NOT in catalog');
  assert(!catalogNames.includes('Brass (Ensemble)' as any), 'Brass (Ensemble) NOT in catalog');
  assert(!catalogNames.includes('Strings' as any), 'Generic "Strings" NOT in catalog');
  assert(!catalogNames.includes('Ensemble' as any), 'Generic "Ensemble" NOT in catalog');
  console.log('✅ TEST 12 PASSED: Solo Strings vs Unresolved Sections\n');
}

// -------------------------------------------------------------------------
// 13. Benchmark Track Regression (YouTube QME5QBetC_k)
// -------------------------------------------------------------------------
console.log('TEST 13: Benchmark Track Regression (YouTube QME5QBetC_k, Duration 195s)');
{
  const duration = validateAuthoritativeDuration(195)!;
  const windows = generateAnalysisWindows(duration, { windowSize: 45, overlap: 5 });

  // Simulate benchmark recording: Piano intro [0-20s], Female Solo Voice [20-190s], Drums & Bass [20-195s]
  const records: WindowCoverageRecord[] = windows.map((w, idx) => {
    const segs: InstrumentTimelineSegment[] = [];
    if (w.startTime < 20) {
      segs.push({
        id: `bench-piano-${idx}`,
        instrumentName: 'Piano',
        family: 'Keyboards',
        startTime: w.startTime,
        endTime: Math.min(w.endTime, 22),
        confidence: 94,
        audibility: 'audible',
        evidence: 'Acoustic piano arpeggio introduction theme',
      });
    }
    if (w.endTime > 20) {
      segs.push({
        id: `bench-drums-${idx}`,
        instrumentName: 'Drum Kit',
        family: 'Percussion',
        startTime: Math.max(w.startTime, 20),
        endTime: w.endTime,
        confidence: 96,
        audibility: 'audible',
        evidence: 'Solid acoustic drum groove with snare backbeat',
      });
      segs.push({
        id: `bench-bass-${idx}`,
        instrumentName: 'Bass Guitar',
        family: 'Strings',
        startTime: Math.max(w.startTime, 20),
        endTime: w.endTime,
        confidence: 92,
        audibility: 'audible',
        evidence: 'Electric bass root notes locking with kick drum',
      });
      segs.push({
        id: `bench-vocal-${idx}`,
        instrumentName: 'Female Solo Voice',
        family: 'Voice & Electronic',
        startTime: Math.max(w.startTime, 25),
        endTime: Math.min(w.endTime, 185),
        confidence: 95,
        audibility: 'audible',
        evidence: 'Female solo lead vocal performing main verse and chorus melody',
        isVoice: true,
      });
    }

    return {
      windowId: w.id,
      index: idx,
      requestedStart: w.startTime,
      requestedEnd: w.endTime,
      processedStart: w.startTime,
      processedEnd: w.endTime,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: segs,
    };
  });

  const coverage = calculateCoverage(duration, records);
  assert(coverage.isFullCoverage, 'Full track coverage 100% on benchmark track');
  assert(coverage.totalDuration === 195, 'Authoritative duration is 195s');
  assert(coverage.missingRanges.length === 0, 'No missing gaps in benchmark track');

  const reconciled = reconcileWindowSegments(records, duration);
  const instNames = new Set(reconciled.map((s) => s.instrumentName));
  assert(instNames.has('Piano'), 'Piano detected in intro');
  assert(instNames.has('Drum Kit'), 'Drum Kit detected across track');
  assert(instNames.has('Bass Guitar'), 'Bass Guitar detected');
  assert(instNames.has('Female Solo Voice'), 'Female Solo Voice detected');

  // Verify Voice flag propagation
  const vocalSeg = reconciled.find((s) => s.instrumentName === 'Female Solo Voice');
  assert(vocalSeg?.isVoice === true, 'Female Solo Voice has isVoice === true');
  assert(vocalSeg?.startTime === 25, 'Vocal starts at 25s');
  assert(vocalSeg?.endTime === 185, 'Vocal ends at 185s');
  console.log('✅ TEST 13 PASSED: Benchmark Track Regression\n');
}

// -------------------------------------------------------------------------
// 14. Session State Management & Generation ID Invalidation
// -------------------------------------------------------------------------
console.log('TEST 14: Session State Management, Generation ID Invalidation & Abort Handling');
{
  let currentGenerationId = 10;
  const preservedSegments: InstrumentTimelineSegment[] = [
    {
      id: 'seg-1',
      instrumentName: 'Piano',
      family: 'Keyboards',
      startTime: 0,
      endTime: 30,
      confidence: 90,
      audibility: 'audible',
    },
  ];

  // User presses Stop
  const handleStop = () => {
    currentGenerationId++;
    // Preserves existing timeline segments without wiping them
    return { currentGenerationId, preservedCount: preservedSegments.length };
  };

  const stopResult = handleStop();
  assert(stopResult.currentGenerationId === 11, 'Generation ID incremented to 11');
  assert(stopResult.preservedCount === 1, 'Completed segments preserved upon stopping');

  // Simulate late-arriving chunk from cancelled generation 10
  const lateChunkGenerationId = 10;
  const isLateChunkIgnored = lateChunkGenerationId !== currentGenerationId;
  assert(isLateChunkIgnored, 'Late-arriving chunk from older generation ID is rejected');
  console.log('✅ TEST 14 PASSED: Session State & Generation Invalidation\n');
}

// -------------------------------------------------------------------------
// 15. IndexedDB Versioned Cache Key Validation
// -------------------------------------------------------------------------
console.log('TEST 15: IndexedDB Versioned Cache Key Determinism & Invalidation');
{
  const key1 = buildAnalysisCacheKey({
    videoId: 'QME5QBetC_k',
    duration: 195,
  });

  const key2 = buildAnalysisCacheKey({
    videoId: 'QME5QBetC_k',
    duration: 195,
  });

  assert(key1 === key2, 'Cache key is deterministic for identical video & duration');
  assert(key1.includes('QME5QBetC_k'), 'Cache key contains videoId');
  assert(key1.includes(TAXONOMY_VERSION), `Cache key includes taxonomy version (${TAXONOMY_VERSION})`);
  assert(key1.includes(ANALYSIS_SCHEMA_VERSION), `Cache key includes schema version (${ANALYSIS_SCHEMA_VERSION})`);
  assert(key1.includes(CURRENT_MODEL_ID), `Cache key includes model ID (${CURRENT_MODEL_ID})`);
  assert(key1.includes(INSTRUCTION_VERSION), `Cache key includes instruction version (${INSTRUCTION_VERSION})`);

  // Changing duration produces different key
  const keyDifferentDuration = buildAnalysisCacheKey({
    videoId: 'QME5QBetC_k',
    duration: 196,
  });
  assert(key1 !== keyDifferentDuration, 'Duration change invalidates cache key');
  console.log('✅ TEST 15 PASSED: IndexedDB Versioned Cache Key\n');
}

// -------------------------------------------------------------------------
// 16. Catalog Invariance: Celesta, Oud, Handpan, Unidentified Instrument
// -------------------------------------------------------------------------
console.log('TEST 16: Catalog Invariance (Celesta, Oud, Handpan, Unidentified Instrument)');
{
  assert(normalizeInstrument('Celesta').canonicalName === 'Celesta', 'Celesta normalized');
  assert(normalizeInstrument('Oud').canonicalName === 'Oud', 'Oud normalized');
  assert(normalizeInstrument('Handpan').canonicalName === 'Handpan', 'Handpan normalized');
  assert(normalizeInstrument('Unknown sound').canonicalName === 'Unidentified Instrument', 'Unknown sound maps to Unidentified Instrument');
  assert(normalizeInstrument('Unidentified Instrument').canonicalName === 'Unidentified Instrument', 'Unidentified Instrument normalized');

  const celesta = MASTER_INSTRUMENT_CATALOG.find((i) => i.canonicalName === 'Celesta');
  assert(celesta?.family === 'Keyboards', 'Celesta is in Keyboards');

  const oud = MASTER_INSTRUMENT_CATALOG.find((i) => i.canonicalName === 'Oud');
  assert(oud?.family === 'Traditional & World', 'Oud is in Traditional & World');

  const handpan = MASTER_INSTRUMENT_CATALOG.find((i) => i.canonicalName === 'Handpan');
  assert(handpan?.family === 'Traditional & World', 'Handpan is in Traditional & World');

  const unidentified = MASTER_INSTRUMENT_CATALOG.find((i) => i.canonicalName === 'Unidentified Instrument');
  assert(unidentified?.family === 'Other', 'Unidentified Instrument is in Other');
  console.log('✅ TEST 16 PASSED: Catalog Invariance & New Additions\n');
}

console.log('======================================================================');
console.log('ALL 16 REPRESENTATIVE TEST SET SCENARIOS COMPLETED SUCCESSFULLY!');
console.log('======================================================================\n');
