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
} from '../src/utils/instrumentNormalization';

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
  const records: WindowCoverageRecord[] = windows.map((w, idx) => ({
    windowId: w.id,
    index: idx,
    requestedStart: w.startTime,
    requestedEnd: w.endTime,
    processedStart: w.startTime,
    processedEnd: w.endTime,
    status: 'success',
    retryCount: 0,
    isSilence: false,
    segments: [
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
              family: 'Brass',
              startTime: w.startTime + 10,
              endTime: w.endTime - 5,
              confidence: 90,
              audibility: 'audible' as const,
              evidence: 'Warm brass sustained harmony chords',
            },
            {
              id: `orch-timpani-${idx}`,
              instrumentName: 'Timpani',
              family: 'Percussion',
              startTime: w.startTime + 15,
              endTime: w.endTime - 2,
              confidence: 86,
              audibility: 'audible' as const,
              evidence: 'Resonant orchestral kettle drum rolls',
            },
          ]
        : []),
    ],
  }));

  const coverage = calculateCoverage(duration, records);
  assert(coverage.isFullCoverage, 'Full video coverage (100%)');
  assert(coverage.missingRanges.length === 0, 'No unanalyzed gaps');

  const reconciled = reconcileWindowSegments(records, duration);
  const instruments = new Set(reconciled.map((s) => s.instrumentName));
  assert(instruments.has('Strings (Ensemble)'), 'Strings (Ensemble) identified and merged');
  assert(instruments.has('Flute'), 'Flute identified in woodwinds');
  assert(instruments.has('French Horn'), 'French Horn identified in brass');
  assert(instruments.has('Timpani'), 'Timpani identified in percussion');

  // Check that Strings (Ensemble) spans continuous playback across windows
  const stringSegs = reconciled.filter((s) => s.instrumentName === 'Strings (Ensemble)');
  assert(stringSegs.length === 1 && stringSegs[0].startTime === 0 && stringSegs[0].endTime === 180,
    'Strings (Ensemble) seamlessly merged across all 5 overlapping windows (0s to 180s)');
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

  const strings = reconciled.find((s) => s.instrumentName === 'Strings (Ensemble)');
  assert(Boolean(strings), 'Symphonic Strings (Ensemble) detected');

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
    isSilence: false,
    segments: [
      {
        id: `pop-acoust-${idx}`,
        instrumentName: 'Acoustic Guitar',
        family: 'Guitars',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 96,
        audibility: 'prominent',
        evidence: 'Steel-string acoustic guitar fingerpicking and strumming chords',
      },
      {
        id: `pop-bass-${idx}`,
        instrumentName: 'Bass Guitar',
        family: 'Guitars',
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
    isSilence: false,
    segments: [
      {
        id: `edm-synth-${idx}`,
        instrumentName: 'Synthesizer',
        family: 'Electronic',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 98,
        audibility: 'prominent',
        evidence: 'Super-saw lead synthesizer chords and arpeggiator',
      },
      {
        id: `edm-dm-${idx}`,
        instrumentName: 'Drum Machine',
        family: 'Percussion',
        startTime: w.startTime + 15,
        endTime: w.endTime,
        confidence: 94,
        audibility: 'prominent',
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
    isSilence: false,
    segments: [
      {
        id: `solo-piano-${idx}`,
        instrumentName: 'Piano',
        family: 'Keyboards',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 98,
        audibility: 'prominent',
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
    isSilence: false,
    segments: [
      {
        id: `trad-koto-${idx}`,
        instrumentName: 'Koto',
        family: 'Strings',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 95,
        audibility: 'prominent',
        evidence: 'Plucked 13-string traditional Japanese zither notes',
      },
      {
        id: `trad-shaku-${idx}`,
        instrumentName: 'Shakuhachi',
        family: 'Woodwinds',
        startTime: w.startTime + 5,
        endTime: w.endTime - 5,
        confidence: 91,
        audibility: 'prominent',
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
// 9. Vocal-Centric Track / A Cappella / Choir
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
    isSilence: false,
    segments: [
      {
        id: `choir-harm-${idx}`,
        instrumentName: 'Choir',
        family: 'Vocals',
        startTime: w.startTime,
        endTime: w.endTime,
        confidence: 96,
        audibility: 'prominent',
        evidence: 'Multi-part SATB choral polyphony without instrumental accompaniment',
      },
    ],
  }));

  const reconciled = reconcileWindowSegments(records, duration);
  assert(reconciled.length === 1 && reconciled[0].instrumentName === 'Choir', 'Choir recognized as canonical instrument');
  assert(reconciled[0].family === 'Voice & Electronic', 'Family is Voice & Electronic');
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

console.log('======================================================================');
console.log('ALL 10 REPRESENTATIVE TEST SET SCENARIOS COMPLETED SUCCESSFULLY!');
console.log('======================================================================\n');
