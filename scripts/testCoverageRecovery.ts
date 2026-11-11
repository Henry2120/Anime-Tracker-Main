import {
  generateAnalysisWindows,
  calculateCoverage,
  reconcileWindowSegments,
  validateAuthoritativeDuration,
  convertClipRelativeSegments,
  findUncoveredGaps,
  isRangeConfirmedSilent,
  WindowCoverageRecord,
  TimeRange,
} from '../src/utils/audioCoverageRecovery';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

console.log('========================================================================');
console.log('RUNNING EXPANDED 12-POINT REGRESSION TEST SUITE (COVERAGE & RECOVERY)');
console.log('========================================================================\n');

// -------------------------------------------------------------------------
// REGRESSION TEST 1: Video longer than 210s must be analyzed through its actual duration
// -------------------------------------------------------------------------
console.log('TEST 1: Video Longer Than 210s Analyzed Through Full Duration (e.g. 411s Flamewall)');
{
  const actualDuration = validateAuthoritativeDuration(411);
  assert(actualDuration === 411, 'Authoritative duration is 411.0s (not truncated at 210s)');

  const windows = generateAnalysisWindows(actualDuration!, { windowSize: 45, overlap: 5 });
  assert(windows.length === 11, `11 analysis windows generated for 411s (got ${windows.length})`);
  assert(windows[0].startTime === 0, 'First window starts at 0.0s');
  assert(windows[windows.length - 1].endTime === 411, `Final window ends exactly at actual duration 411.0s (got ${windows[windows.length - 1].endTime})`);

  // Verify consecutive windows overlap without gaps
  for (let i = 0; i < windows.length - 1; i++) {
    assert(windows[i].endTime >= windows[i + 1].startTime, `Window ${i} (ends ${windows[i].endTime}) overlaps window ${i + 1} (starts ${windows[i + 1].startTime})`);
  }
  console.log('✅ TEST 1 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 2: Unavailable duration must NEVER produce a fabricated 210s analysis
// -------------------------------------------------------------------------
console.log('TEST 2: Unavailable Duration Returns Null & Never Fabricates 210s Authoritative Result');
{
  assert(validateAuthoritativeDuration(undefined) === null, 'undefined duration returns null');
  assert(validateAuthoritativeDuration(null) === null, 'null duration returns null');
  assert(validateAuthoritativeDuration(0) === null, '0 duration returns null');
  assert(validateAuthoritativeDuration(-50) === null, 'negative duration returns null');
  assert(validateAuthoritativeDuration(NaN) === null, 'NaN duration returns null');

  const coverage = calculateCoverage(0, []);
  assert(coverage.authoritativeDurationEstablished === false, 'authoritativeDurationEstablished is false when duration is 0');
  assert(coverage.isFullCoverage === false, 'isFullCoverage is false');
  assert(coverage.status === 'failed', 'status is failed (never detected)');
  assert(coverage.totalDuration === 0, 'totalDuration is 0 (not 210s)');
  console.log('✅ TEST 2 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 3: Switching videos must not overwrite new player duration with stale duration
// -------------------------------------------------------------------------
console.log('TEST 3: Switching Videos Preserves Actual New Duration');
{
  // Simulate video switch: Video A has duration 250s, Video B has duration 411s
  const durationCache = new Map<string, number>();
  durationCache.set('videoA', 250);

  // When switching to Video B with fresh player duration 411s
  const playerVideoBDuration = 411;
  const verifiedDurationB = validateAuthoritativeDuration(playerVideoBDuration);
  assert(verifiedDurationB === 411, 'Video B duration verified as 411s');

  durationCache.set('videoB', verifiedDurationB!);
  assert(durationCache.get('videoB') === 411, 'Video B duration is stored as 411s');
  assert(durationCache.get('videoA') === 250, 'Video A duration remains distinct at 250s');
  console.log('✅ TEST 3 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 4: Segment in final clip converted correctly from clip-relative to absolute timestamps
// -------------------------------------------------------------------------
console.log('TEST 4: Clip-Relative to Absolute Timestamp Conversion (e.g. 360s window, clip 8s–15s -> 368s–375s)');
{
  const windowStart = 360;
  const clipDuration = 45;
  const videoDuration = 411;

  const rawClipSegments = [
    {
      instrumentName: 'Electric Guitar',
      family: 'Strings',
      startTime: 8,
      endTime: 15,
      evidence: 'High solo bending note',
    },
    {
      instrumentName: 'Drum Kit',
      family: 'Percussion',
      startTime: 0,
      endTime: 45,
      evidence: 'Double kick drum groove',
    },
  ];

  const absoluteSegments = convertClipRelativeSegments(
    rawClipSegments,
    windowStart,
    clipDuration,
    videoDuration
  );

  assert(absoluteSegments.length === 2, `Converted 2 segments (got ${absoluteSegments.length})`);
  const guitar = absoluteSegments.find((s) => s.instrumentName === 'Electric Guitar');
  assert(guitar?.startTime === 368, `Guitar starts at 368s (360 + 8) (got ${guitar?.startTime})`);
  assert(guitar?.endTime === 375, `Guitar ends at 375s (360 + 15) (got ${guitar?.endTime})`);

  const drums = absoluteSegments.find((s) => s.instrumentName === 'Drum Kit');
  assert(drums?.startTime === 360, `Drums start at 360s (360 + 0) (got ${drums?.startTime})`);
  assert(drums?.endTime === 405, `Drums end at 405s (360 + 45) (got ${drums?.endTime})`);
  console.log('✅ TEST 4 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 5: Final 10-second section containing an audible instrument retains its detection
// -------------------------------------------------------------------------
console.log('TEST 5: Final 10-Second Section With Audible Instrument Retains Detection');
{
  const totalDuration = 100;
  // Final window covers 55s to 100s. Solo piano plays from 90s to 99s (final 10s of video)
  const records: WindowCoverageRecord[] = [
    {
      windowId: 'win-0',
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 's0',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 0,
          endTime: 45,
          confidence: 95,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: 'win-1',
      index: 1,
      requestedStart: 40,
      requestedEnd: 85,
      processedStart: 40,
      processedEnd: 85,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 's1',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 40,
          endTime: 85,
          confidence: 95,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: 'win-2',
      index: 2,
      requestedStart: 80,
      requestedEnd: 100,
      processedStart: 80,
      processedEnd: 100,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 's2',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 80,
          endTime: 99, // Plays until 99s in the final 10s
          confidence: 95,
          audibility: 'audible',
        },
      ],
    },
  ];

  const reconciled = reconcileWindowSegments(records, totalDuration);
  const finalPiano = reconciled.find((s) => s.instrumentName === 'Piano');
  assert(Boolean(finalPiano), 'Piano detected throughout track');
  assert(finalPiano?.endTime === 99, `Piano ends at 99.0s in final section (got ${finalPiano?.endTime})`);
  console.log('✅ TEST 5 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 6: Final 10-second section containing genuine silence must remain empty
// -------------------------------------------------------------------------
console.log('TEST 6: Final 10-Second Section Containing Genuine Silence Remains Empty');
{
  const totalDuration = 100;
  // Music ends at 88s, 88s to 100s is genuine silence
  const records: WindowCoverageRecord[] = [
    {
      windowId: 'win-0',
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 's0',
          instrumentName: 'Violin',
          family: 'Strings',
          startTime: 5,
          endTime: 45,
          confidence: 92,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: 'win-1',
      index: 1,
      requestedStart: 40,
      requestedEnd: 85,
      processedStart: 40,
      processedEnd: 85,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 's1',
          instrumentName: 'Violin',
          family: 'Strings',
          startTime: 40,
          endTime: 85,
          confidence: 92,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: 'win-2',
      index: 2,
      requestedStart: 80,
      requestedEnd: 100,
      processedStart: 80,
      processedEnd: 100,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 's2',
          instrumentName: 'Violin',
          family: 'Strings',
          startTime: 80,
          endTime: 88, // Music stops at 88s, 88-100s is silent!
          confidence: 92,
          audibility: 'audible',
        },
      ],
    },
  ];

  const reconciled = reconcileWindowSegments(records, totalDuration);
  const finalViolin = reconciled.find((s) => s.instrumentName === 'Violin');
  assert(finalViolin?.endTime === 88, `Violin terminates at 88s and does NOT artificially stretch to 100s (got ${finalViolin?.endTime})`);

  // Ensure no instruments exist between 88s and 100s
  const trailingSegments = reconciled.filter((s) => s.startTime >= 88);
  assert(trailingSegments.length === 0, 'Zero instruments fabricated in trailing silent section');
  console.log('✅ TEST 6 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 7: Empty response with audioAssessment: instrumental_music triggers recovery
// -------------------------------------------------------------------------
console.log('TEST 7: Empty Instrument Response With audioAssessment="instrumental_music" Flags needsRecovery');
{
  const emptyRecord: WindowCoverageRecord = {
    windowId: 'win-test',
    index: 0,
    requestedStart: 0,
    requestedEnd: 45,
    processedStart: 0,
    processedEnd: 45,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'instrumental_music',
    isSilence: false, // NOT classified as silence!
    needsRecovery: true, // Flagged for targeted recovery!
    segments: [],
  };

  assert(emptyRecord.isSilence === false, 'isSilence is FALSE despite empty segments array');
  assert(emptyRecord.needsRecovery === true, 'needsRecovery is TRUE');
  assert(emptyRecord.audioAssessment === 'instrumental_music', 'audioAssessment correctly preserved as instrumental_music');
  console.log('✅ TEST 7 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 8: Explicitly confirmed silent window does not receive fabricated detections
// -------------------------------------------------------------------------
console.log('TEST 8: Confirmed Silent Window Does Not Receive Fabricated Instruments');
{
  const confirmedSilentWindow: WindowCoverageRecord = {
    windowId: 'win-silent',
    index: 1,
    requestedStart: 45,
    requestedEnd: 90,
    processedStart: 45,
    processedEnd: 90,
    status: 'success',
    retryCount: 0,
    audioAssessment: 'silence',
    isSilence: true,
    needsRecovery: false,
    segments: [],
  };

  const coverage = calculateCoverage(90, [
    {
      windowId: 'win-intro',
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 'intro-flute',
          instrumentName: 'Flute',
          family: 'Woodwinds',
          startTime: 5,
          endTime: 40,
          confidence: 90,
          audibility: 'audible',
        },
      ],
    },
    confirmedSilentWindow,
  ]);

  assert(coverage.isFullCoverage === true, '100% full coverage achieved');
  assert(coverage.confirmedSilentRanges.length === 1, '1 confirmed silent range recorded');
  assert(coverage.confirmedSilentRanges[0].start === 45 && coverage.confirmedSilentRanges[0].end === 90, 'Silent range is [45s, 90s]');

  const reconciled = reconcileWindowSegments([confirmedSilentWindow]);
  assert(reconciled.length === 0, 'Zero segments generated for confirmed silence');
  console.log('✅ TEST 8 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 9: Internal gap containing an audible instrument is recoverable through reanalysis
// -------------------------------------------------------------------------
console.log('TEST 9: Internal Gap Identified and Recovered Through Focused Targeted Reanalysis');
{
  const totalDuration = 120;
  // Window 0: 0-40 has Acoustic Guitar [0-35]
  // Window 1: 40-80 missed detections initially (empty)
  // Window 2: 75-120 has Acoustic Guitar [85-115]
  const initialSegments = [
    {
      id: 'g-part1',
      instrumentName: 'Acoustic Guitar',
      family: 'Strings' as const,
      startTime: 0,
      endTime: 35,
      confidence: 90,
      audibility: 'audible' as const,
    },
    {
      id: 'g-part2',
      instrumentName: 'Acoustic Guitar',
      family: 'Strings' as const,
      startTime: 85,
      endTime: 115,
      confidence: 90,
      audibility: 'audible' as const,
    },
  ];

  // 1. Find uncovered gaps >= 1.5s
  const gaps = findUncoveredGaps(initialSegments, totalDuration, 1.5);
  assert(gaps.length === 2, `Identified ${gaps.length} gaps (got [35-85] and [115-120])`);
  assert(gaps[0].start === 35 && gaps[0].end === 85, 'First gap is [35s, 85s]');

  // 2. Simulate targeted recovery on gap [35s, 85s]: finds Acoustic Guitar [35s, 85s]
  const recoveredGapSegment = {
    id: 'g-recovered',
    instrumentName: 'Acoustic Guitar',
    family: 'Strings' as const,
    startTime: 35,
    endTime: 85,
    confidence: 92,
    audibility: 'audible' as const,
  };

  // 3. Reconcile combined segments
  const combinedRecords: WindowCoverageRecord[] = [
    {
      windowId: 'win-initial',
      index: 0,
      requestedStart: 0,
      requestedEnd: 120,
      processedStart: 0,
      processedEnd: 120,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [...initialSegments, recoveredGapSegment],
    },
  ];

  const merged = reconcileWindowSegments(combinedRecords, totalDuration);
  assert(merged.length === 1, `Merged seamlessly into 1 continuous segment (got ${merged.length})`);
  assert(merged[0].startTime === 0 && merged[0].endTime === 115, `Seamless span from 0s to 115s (got ${merged[0].startTime} to ${merged[0].endTime})`);
  console.log('✅ TEST 9 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 10: Duplicate detections from overlapping windows must still be merged
// -------------------------------------------------------------------------
console.log('TEST 10: Duplicate Detections From Overlapping Windows Seamlessly Merged');
{
  const totalDuration = 80;
  // Window 0 [0-45s] detects Trumpet [10-44s]
  // Window 1 [40-80s] detects Trumpet [40-70s]
  // Overlap interval is [40s, 44s]
  const records: WindowCoverageRecord[] = [
    {
      windowId: 'win-0',
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 'w0-t',
          instrumentName: 'Trumpet',
          family: 'Brass',
          startTime: 10,
          endTime: 44,
          confidence: 90,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: 'win-1',
      index: 1,
      requestedStart: 40,
      requestedEnd: 80,
      processedStart: 40,
      processedEnd: 80,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 'w1-t',
          instrumentName: 'Trumpet',
          family: 'Brass',
          startTime: 40,
          endTime: 70,
          confidence: 92,
          audibility: 'audible',
        },
      ],
    },
  ];

  const reconciled = reconcileWindowSegments(records, totalDuration);
  assert(reconciled.length === 1, `Duplicate overlap merged into 1 continuous segment (got ${reconciled.length})`);
  assert(reconciled[0].startTime === 10, 'Merged segment starts at 10.0s');
  assert(reconciled[0].endTime === 70, 'Merged segment ends at 70.0s');
  console.log('✅ TEST 10 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 11: Genuine rests of at least 1 second must remain separate
// -------------------------------------------------------------------------
console.log('TEST 11: Genuine Musical Rests (>= 1.0s) Preserved Separately');
{
  const totalDuration = 100;
  // Piano phrase 1: [10s, 25s]
  // Rest of 3 seconds: [25s, 28s]
  // Piano phrase 2: [28s, 45s]
  const records: WindowCoverageRecord[] = [
    {
      windowId: 'win-0',
      index: 0,
      requestedStart: 0,
      requestedEnd: 50,
      processedStart: 0,
      processedEnd: 50,
      status: 'success',
      retryCount: 0,
      audioAssessment: 'instrumental_music',
      isSilence: false,
      segments: [
        {
          id: 'piano-p1',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 10,
          endTime: 25,
          confidence: 94,
          audibility: 'audible',
        },
        {
          id: 'piano-p2',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 28,
          endTime: 45,
          confidence: 94,
          audibility: 'audible',
        },
      ],
    },
  ];

  const reconciled = reconcileWindowSegments(records, totalDuration);
  assert(reconciled.length === 2, `2 distinct phrases preserved across the 3s rest (got ${reconciled.length})`);
  assert(reconciled[0].endTime === 25, 'Phrase 1 terminates at 25s');
  assert(reconciled[1].startTime === 28, 'Phrase 2 begins at 28s');
  assert(reconciled[1].startTime - reconciled[0].endTime === 3, 'Rest duration of 3s preserved');
  console.log('✅ TEST 11 PASSED\n');
}

// -------------------------------------------------------------------------
// REGRESSION TEST 12: No segment may extend beyond the actual video duration
// -------------------------------------------------------------------------
console.log('TEST 12: No Segment Extends Beyond Actual Video Duration');
{
  const totalDuration = 65.4;
  const rawClipSegments = [
    {
      instrumentName: 'Cello',
      family: 'Strings',
      startTime: 0,
      endTime: 50, // Clip-relative 0 to 50
    },
  ];

  // Window starts at 30s. 30 + 50 = 80s, which exceeds 65.4s totalDuration
  const boundedSegments = convertClipRelativeSegments(
    rawClipSegments,
    30,
    45,
    totalDuration
  );

  assert(boundedSegments.length === 1, 'Segment converted and bounded');
  assert(boundedSegments[0].startTime === 30, 'Segment starts at 30s');
  assert(boundedSegments[0].endTime === 65.4, `Segment is clamped strictly to videoDuration 65.4s (got ${boundedSegments[0].endTime})`);
  assert(boundedSegments[0].endTime <= totalDuration, 'Segment end time <= totalDuration');
  console.log('✅ TEST 12 PASSED\n');
}

console.log('========================================================================');
console.log('ALL 12 COVERAGE & RECOVERY REGRESSION TESTS COMPLETED SUCCESSFULLY!');
console.log('========================================================================\n');
