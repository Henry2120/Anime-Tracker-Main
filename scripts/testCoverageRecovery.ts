import {
  generateAnalysisWindows,
  calculateCoverage,
  reconcileWindowSegments,
  validateAuthoritativeDuration,
  WindowCoverageRecord,
} from '../src/utils/audioCoverageRecovery';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

console.log('=====================================================');
console.log('RUNNING COVERAGE VERIFICATION & RECOVERY TEST SUITE');
console.log('=====================================================\n');

// -------------------------------------------------------------------------
// TEST 1: Short video (e.g. 25 seconds <= window size)
// -------------------------------------------------------------------------
console.log('TEST 1: Short Video (25s <= window size of 45s)');
{
  const duration = validateAuthoritativeDuration(25);
  assert(duration === 25, 'Authoritative duration established as 25.0s');

  const windows = generateAnalysisWindows(duration!, { windowSize: 45, overlap: 5 });
  assert(windows.length === 1, 'Exactly 1 analysis window generated');
  assert(windows[0].startTime === 0, 'Window starts at 0s');
  assert(windows[0].endTime === 25, 'Window ends at 25s');

  // Simulated successful processing
  const records: WindowCoverageRecord[] = [
    {
      windowId: windows[0].id,
      index: 0,
      requestedStart: 0,
      requestedEnd: 25,
      processedStart: 0,
      processedEnd: 25,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 'test-violin-1',
          instrumentName: 'Violin',
          family: 'Strings',
          startTime: 2,
          endTime: 20,
          confidence: 90,
          audibility: 'audible',
        },
      ],
    },
  ];

  const coverage = calculateCoverage(duration!, records);
  assert(coverage.authoritativeDurationEstablished === true, 'Authoritative duration established');
  assert(coverage.isFullCoverage === true, 'Calculated full coverage = true');
  assert(coverage.coveragePercentage === 100, 'Coverage percentage is 100%');
  assert(coverage.missingRanges.length === 0, 'Zero missing ranges');
  assert(coverage.status === 'detected', 'Status is detected');

  const merged = reconcileWindowSegments(records, duration!);
  assert(merged.length === 1, 'Reconciled 1 segment');
  assert(merged[0].instrumentName === 'Violin', 'Instrument is Violin');
  console.log('✅ TEST 1 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 2: Medium-length video (e.g. 85 seconds)
// -------------------------------------------------------------------------
console.log('TEST 2: Medium-Length Video (85s)');
{
  const duration = validateAuthoritativeDuration(85);
  const windows = generateAnalysisWindows(duration!, { windowSize: 45, overlap: 5 });
  // Window 0: 0 to 45
  // Window 1: 40 to 85
  assert(windows.length === 2, `Generated ${windows.length} windows (expected 2)`);
  assert(windows[0].startTime === 0 && windows[0].endTime === 45, 'Window 0: 0–45s');
  assert(windows[1].startTime === 40 && windows[1].endTime === 85, 'Window 1: 40–85s');
  assert(windows[0].endTime > windows[1].startTime, 'Windows overlap (40s to 45s)');

  // Window 0 has Piano [5, 45], Window 1 has Piano [40, 75] -> overlapping continuous segment
  const records: WindowCoverageRecord[] = [
    {
      windowId: windows[0].id,
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 's0',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 5,
          endTime: 45,
          confidence: 88,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: windows[1].id,
      index: 1,
      requestedStart: 40,
      requestedEnd: 85,
      processedStart: 40,
      processedEnd: 85,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 's1',
          instrumentName: 'Piano',
          family: 'Keyboards',
          startTime: 40,
          endTime: 75,
          confidence: 92,
          audibility: 'audible',
        },
      ],
    },
  ];

  const coverage = calculateCoverage(duration!, records);
  assert(coverage.isFullCoverage === true, 'Full coverage verified independently');
  assert(coverage.coveragePercentage === 100, 'Coverage percentage is 100%');
  assert(coverage.missingRanges.length === 0, 'No missing ranges');

  // Reconcile: Piano segments [5, 45] and [40, 75] should merge into [5, 75]
  const reconciled = reconcileWindowSegments(records, duration!);
  assert(reconciled.length === 1, `Merged into 1 continuous segment (got ${reconciled.length})`);
  assert(reconciled[0].startTime === 5, 'Merged segment starts at 5s');
  assert(reconciled[0].endTime === 75, 'Merged segment ends at 75s');
  console.log('✅ TEST 2 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 3: Long video (e.g. 240 seconds)
// -------------------------------------------------------------------------
console.log('TEST 3: Long Video (240s, multi-window deterministic scheduling)');
{
  const duration = validateAuthoritativeDuration(240);
  const windows = generateAnalysisWindows(duration!, { windowSize: 45, overlap: 5 });
  // Step is 40s: 0-45, 40-85, 80-125, 120-165, 160-205, 200-240 = 6 windows
  assert(windows.length === 6, `Scheduled ${windows.length} windows for 240s video`);
  assert(windows[0].startTime === 0, 'First window starts at 0s');
  assert(windows[windows.length - 1].endTime === 240, 'Final window ends at 240s exactly');

  // Verify no gaps exist between any adjacent windows
  for (let i = 0; i < windows.length - 1; i++) {
    assert(
      windows[i].endTime >= windows[i + 1].startTime,
      `No gap between window ${i} (ends ${windows[i].endTime}) and ${i + 1} (starts ${windows[i + 1].startTime})`
    );
  }

  // All 6 windows succeed
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
        id: `seg-long-${idx}`,
        instrumentName: 'Acoustic Guitar',
        family: 'Strings',
        startTime: w.startTime + 2,
        endTime: w.endTime - 2,
        confidence: 85,
        audibility: 'audible',
      },
    ],
  }));

  const coverage = calculateCoverage(duration!, records);
  assert(coverage.isFullCoverage === true, 'Independent calculation verifies 100% full coverage');
  assert(coverage.coveragePercentage === 100, 'Coverage percentage = 100%');
  assert(coverage.failedWindows === 0, '0 failed windows');
  console.log('✅ TEST 3 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 4: Video where one analysis window fails (tests retry & honest partial coverage)
// -------------------------------------------------------------------------
console.log('TEST 4: One Window Fails (Automatic retry exhausted & honest partial coverage)');
{
  const duration = validateAuthoritativeDuration(120);
  const windows = generateAnalysisWindows(duration!, { windowSize: 45, overlap: 5 });
  // Window 0: 0–45
  // Window 1: 40–85 (FAILS)
  // Window 2: 80–120
  assert(windows.length === 3, '3 windows scheduled for 120s video');

  const records: WindowCoverageRecord[] = [
    {
      windowId: windows[0].id,
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 'seg-w0',
          instrumentName: 'Flute',
          family: 'Woodwinds',
          startTime: 10,
          endTime: 30,
          confidence: 90,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: windows[1].id,
      index: 1,
      requestedStart: 40,
      requestedEnd: 85,
      processedStart: 0,
      processedEnd: 0,
      status: 'failed',
      retryCount: 2, // Retried 2 times before marking failed
      error: 'API rate limit or connection timeout',
      isSilence: false,
      segments: [],
    },
    {
      windowId: windows[2].id,
      index: 2,
      requestedStart: 80,
      requestedEnd: 120,
      processedStart: 80,
      processedEnd: 120,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 'seg-w2',
          instrumentName: 'Cello',
          family: 'Strings',
          startTime: 85,
          endTime: 110,
          confidence: 85,
          audibility: 'audible',
        },
      ],
    },
  ];

  const coverage = calculateCoverage(duration!, records);
  assert(coverage.isFullCoverage === false, 'isFullCoverage is FALSE because Window 1 failed');
  assert(coverage.status === 'partial', 'Status is PARTIAL');
  assert(coverage.failedWindows === 1, 'Failed windows count is 1');
  assert(coverage.retryCount === 2, 'Total retries recorded is 2');
  assert(coverage.missingRanges.length > 0, 'Identified missing range between 45s and 80s');
  assert(
    coverage.missingRanges[0].start === 45 && coverage.missingRanges[0].end === 80,
    `Missing range is exactly [45s, 80s] (got [${coverage.missingRanges[0].start}, ${coverage.missingRanges[0].end}])`
  );

  // Reconciled results preserve the detections from the successful windows without fabricating anything
  const reconciled = reconcileWindowSegments(records, duration!);
  assert(reconciled.length === 2, 'Preserved detections from both successful windows (Flute + Cello)');
  assert(reconciled[0].instrumentName === 'Flute', 'Flute preserved from Window 0');
  assert(reconciled[1].instrumentName === 'Cello', 'Cello preserved from Window 2');
  console.log('✅ TEST 4 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 5: Video where Gemini returns incomplete or malformed JSON (tests retry & recovery)
// -------------------------------------------------------------------------
console.log('TEST 5: Window returns malformed JSON, retries and succeeds');
{
  const duration = validateAuthoritativeDuration(60);
  const windows = generateAnalysisWindows(duration!, { windowSize: 45, overlap: 5 });

  // Simulate window 0 failing on attempt 1 (malformed JSON) and succeeding on retry 1
  const records: WindowCoverageRecord[] = [
    {
      windowId: windows[0].id,
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 1, // Succeeded on retry attempt 1!
      isSilence: false,
      segments: [
        {
          id: 'seg-rec',
          instrumentName: 'Trumpet',
          family: 'Brass',
          startTime: 5,
          endTime: 42,
          confidence: 90,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: windows[1].id,
      index: 1,
      requestedStart: 40,
      requestedEnd: 60,
      processedStart: 40,
      processedEnd: 60,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 'seg-rec-2',
          instrumentName: 'Trumpet',
          family: 'Brass',
          startTime: 40,
          endTime: 55,
          confidence: 88,
          audibility: 'audible',
        },
      ],
    },
  ];

  const coverage = calculateCoverage(duration!, records);
  assert(coverage.isFullCoverage === true, 'Recovered from malformed JSON via retry, achieved full coverage');
  assert(coverage.retryCount === 1, 'Retry count recorded as 1');
  assert(coverage.failedWindows === 0, '0 permanently failed windows');

  const reconciled = reconcileWindowSegments(records, duration!);
  assert(reconciled.length === 1, 'Trumpet across windows merged into 1 continuous segment [5, 55]');
  assert(reconciled[0].startTime === 5 && reconciled[0].endTime === 55, 'Segment bounds: 5s to 55s');
  console.log('✅ TEST 5 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 6: Video containing genuine silence
// -------------------------------------------------------------------------
console.log('TEST 6: Recording Containing Genuine Silence (No instruments)');
{
  const duration = validateAuthoritativeDuration(50);
  const windows = generateAnalysisWindows(duration!, { windowSize: 45, overlap: 5 });
  // Window 0: 0–45 (contains Violin)
  // Window 1: 40–50 (contains genuine silence / 0 instruments)
  assert(windows.length === 2, '2 windows scheduled');

  const records: WindowCoverageRecord[] = [
    {
      windowId: windows[0].id,
      index: 0,
      requestedStart: 0,
      requestedEnd: 45,
      processedStart: 0,
      processedEnd: 45,
      status: 'success',
      retryCount: 0,
      isSilence: false,
      segments: [
        {
          id: 'seg-sil-0',
          instrumentName: 'Violin',
          family: 'Strings',
          startTime: 10,
          endTime: 30,
          confidence: 92,
          audibility: 'audible',
        },
      ],
    },
    {
      windowId: windows[1].id,
      index: 1,
      requestedStart: 40,
      requestedEnd: 50,
      processedStart: 40,
      processedEnd: 50,
      status: 'success', // SUCCESSFULLY ANALYZED, even though 0 instruments were playing!
      retryCount: 0,
      isSilence: true, // Marked genuine silence
      segments: [],
    },
  ];

  const coverage = calculateCoverage(duration!, records);
  assert(
    coverage.isFullCoverage === true,
    'Genuine silence is recognized as SUCCESSFUL coverage, NOT an error or missing section'
  );
  assert(coverage.coveragePercentage === 100, 'Coverage percentage is 100%');
  assert(coverage.missingRanges.length === 0, 'Missing ranges is empty');

  const reconciled = reconcileWindowSegments(records, duration!);
  assert(reconciled.length === 1, 'Only Violin [10, 30] returned');
  assert(reconciled[0].endTime === 30, 'Violin correctly terminates at 30s across the silent gap');
  console.log('✅ TEST 6 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 7: Final analysis window reaches the exact end of recording
// -------------------------------------------------------------------------
console.log('TEST 7: Final window reaches exact end of recording');
{
  const durationsToTest = [21.3, 45.0, 77.7, 183.4, 299.9];

  for (const testDur of durationsToTest) {
    const dur = validateAuthoritativeDuration(testDur)!;
    const windows = generateAnalysisWindows(dur, { windowSize: 45, overlap: 5 });
    const lastWindow = windows[windows.length - 1];

    assert(
      lastWindow.endTime === dur,
      `For duration ${dur}s: final window ${lastWindow.id} ends at ${lastWindow.endTime}s (exact match)`
    );

    // Verify all windows are contiguous with overlap
    for (let i = 0; i < windows.length - 1; i++) {
      assert(
        windows[i].endTime >= windows[i + 1].startTime,
        `Window ${i} and ${i + 1} overlap properly`
      );
    }
  }
  console.log('✅ TEST 7 PASSED\n');
}

console.log('=====================================================');
console.log('ALL 7 COVERAGE RECOVERY & VERIFICATION TESTS PASSED!');
console.log('=====================================================');
