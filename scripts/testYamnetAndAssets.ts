import fs from 'node:fs';
import path from 'node:path';
import { downsampleTo16kMono } from '../src/utils/audioCapture';
import {
  YAMNET_TARGET_CATALOG,
  YAMNET_TARGET_NAMES,
  YAMNET_VOCAL_CATEGORY,
  YAMNET_ALL_TARGET_NAMES,
  isSupportedYamnetInstrument,
  isSupportedYamnetCategory,
  mapAudioSetLabelToInstrument,
  isAudioSetSilenceOrSpeech,
  resolveAudioSetToClosedSet17,
  evaluateVocalsIndependently,
  extractAcousticFrameFeatures,
} from '../src/utils/yamnetLabelMap';
import {
  YamnetTemporalTracker,
  VocalTemporalTracker,
  mergeYamnetTimelineSegments,
} from '../src/utils/yamnetClassifier';
import {
  buildAnalysisCacheKey,
  buildYamnetCacheKey,
  mergeYamnetCaptureRanges,
  YAMNET_SCHEMA_VERSION,
} from '../src/utils/analysisCacheIndexedDB';
import { BLUE_ARCHIVE_CHARACTERS } from '../src/data/blueArchiveCharacters';
import blueArchiveManifest from '../src/data/blueArchiveManifest.json';
import { getCharacterRole } from '../src/data/characterRoles';
import {
  DEFAULT_SCENERY_CONFIG,
  HINA_SPECIAL_SCENERY,
  SCENERY_PRESETS,
} from '../src/components/CharacterViewer/scenery/sceneryTypes';
import { isHinaPianoPerformer } from '../src/components/CharacterViewer/useCharacterLoader';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

console.log('========================================================================');
console.log('RUNNING CLOSED-SET 17-INSTRUMENT YAMNET & ASSETS UNIT TEST SUITE');
console.log('========================================================================\n');

// -------------------------------------------------------------------------
// TEST 0: Authoritative 17-class catalogue integrity & DSP resampling
// -------------------------------------------------------------------------
console.log('TEST 0: 17-Class Closed-Set Catalogue Integrity & DSP Resampling');
{
  assert(YAMNET_TARGET_CATALOG.length === 17, `YAMNET_TARGET_CATALOG contains exactly 17 instruments (got ${YAMNET_TARGET_CATALOG.length})`);
  const uniqueIds = new Set(YAMNET_TARGET_CATALOG.map((c) => c.id));
  const uniqueNames = new Set(YAMNET_TARGET_CATALOG.map((c) => c.canonicalName));
  assert(uniqueIds.size === 17 && uniqueNames.size === 17, 'All 17 instrument IDs and canonical names are unique');

  // Verify 48 kHz -> 16 kHz stereo downmix & energy preservation
  const sr48 = 48000;
  const len48 = 48000;
  const chL = new Float32Array(len48);
  const chR = new Float32Array(len48);
  for (let i = 0; i < len48; i++) {
    const val = 0.7 * Math.sin((2 * Math.PI * 440 * i) / sr48);
    chL[i] = val;
    chR[i] = val;
  }
  const out16 = downsampleTo16kMono([chL, chR], sr48, 16000);
  assert(out16.length === 16000, `48 kHz -> 16 kHz produced 16000 samples (got ${out16.length})`);
  const feat = extractAcousticFrameFeatures(out16);
  assert(feat.rms > 0.35 && feat.spectralCentroidHz > 300, `Acoustic feature extractor computes valid RMS & centroid (centroid=${Math.round(feat.spectralCentroidHz)}Hz)`);
  console.log('✅ TEST 0 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIOS 1 & 2: Exact Violin -> Violin & Exact Cello -> Cello
// -------------------------------------------------------------------------
console.log('TEST 1 & 2: Exact Violin and Exact Cello Predictions');
{
  const tracker = new YamnetTemporalTracker();

  const violinRes = tracker.processCategories({
    categories: [{ categoryName: 'Violin, fiddle', score: 0.78 }],
    playbackStart: 0,
    playbackEnd: 1.0,
    inputRms: 0.08,
  });
  assert(violinRes.predictions.length === 1, '1 prediction emitted for exact Violin');
  assert(
    violinRes.predictions[0].canonicalName === 'Violin' &&
      violinRes.predictions[0].classificationMode === 'exact' &&
      violinRes.predictions[0].isFallback === false &&
      violinRes.predictions[0].rawScore === 0.78,
    'Violin, fiddle -> Violin (exact, isFallback=false, rawScore preserved)'
  );

  tracker.reset();
  const celloRes = tracker.processCategories({
    categories: [{ categoryName: 'Cello', score: 0.72 }],
    playbackStart: 1.0,
    playbackEnd: 2.0,
    inputRms: 0.09,
  });
  assert(celloRes.predictions.length === 1, '1 prediction emitted for exact Cello');
  assert(
    celloRes.predictions[0].canonicalName === 'Cello' &&
      celloRes.predictions[0].classificationMode === 'exact' &&
      celloRes.predictions[0].isFallback === false &&
      celloRes.predictions[0].rawScore === 0.72,
    'Cello -> Cello (exact, isFallback=false, rawScore preserved)'
  );
  console.log('✅ TEST 1 & 2 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 3: Broad Bowed string instrument -> {Violin, Cello, Erhu}
// -------------------------------------------------------------------------
console.log('TEST 3: Broad "Bowed string instrument" -> Closest of {Violin, Cello, Erhu}');
{
  const bowedBase = resolveAudioSetToClosedSet17({
    categories: [{ categoryName: 'Bowed string instrument', score: 0.65 }],
    inputRms: 0.07,
  });
  assert(bowedBase.decisions.length === 1, 'Resolved broad bowed string to 1 candidate');
  assert(
    ['Violin', 'Cello', 'Erhu'].includes(bowedBase.decisions[0].instrument.canonicalName),
    `Selected bowed candidate "${bowedBase.decisions[0].instrument.canonicalName}" is in {Violin, Cello, Erhu}`
  );
  assert(
    bowedBase.decisions[0].classificationMode === 'best_match' &&
      bowedBase.decisions[0].isFallback === true &&
      bowedBase.decisions[0].classificationConfidence <= 54 &&
      bowedBase.decisions[0].originalModelClass === 'Bowed string instrument',
    `Marked best_match + isFallback=true with honest capped confidence (${bowedBase.decisions[0].classificationConfidence}%)`
  );

  // With Traditional / Asian modal cue, Erhu should win instead of blindly defaulting to Violin
  const bowedErhu = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Bowed string instrument', score: 0.62 },
      { categoryName: 'Traditional music', score: 0.45 },
      { categoryName: 'Music of Asia', score: 0.40 },
    ],
    inputRms: 0.07,
  });
  assert(
    bowedErhu.decisions[0].instrument.canonicalName === 'Erhu' &&
      bowedErhu.decisions[0].isFallback === true,
    `Traditional/Asian bowed string context disambiguates to Erhu best-match (got ${bowedErhu.decisions[0].instrument.canonicalName})`
  );

  // With low cello/double-bass co-evidence, Cello should win
  const bowedCello = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Bowed string instrument', score: 0.62 },
      { categoryName: 'Double bass', score: 0.35 },
    ],
    inputRms: 0.07,
  });
  assert(
    bowedCello.decisions.some((d) => d.instrument.canonicalName === 'Cello'),
    'Low string co-evidence resolves broad bowed string to Cello'
  );
  console.log('✅ TEST 3 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 4: Broad Plucked string instrument -> {Bass Guitar, Electric Guitar, Shamisen, Harp}
// -------------------------------------------------------------------------
console.log('TEST 4: Broad "Plucked string instrument" -> {Bass Guitar, Electric Guitar, Shamisen, Harp}');
{
  const pluckedBase = resolveAudioSetToClosedSet17({
    categories: [{ categoryName: 'Plucked string instrument', score: 0.6 }],
    inputRms: 0.08,
  });
  assert(
    ['Bass Guitar', 'Electric Guitar', 'Shamisen', 'Harp'].includes(
      pluckedBase.decisions[0].instrument.canonicalName
    ),
    `Broad plucked string resolved to allowed pool (got ${pluckedBase.decisions[0].instrument.canonicalName})`
  );
  assert(pluckedBase.decisions[0].classificationMode === 'best_match' && pluckedBase.decisions[0].isFallback === true, 'Broad plucked marked best_match + isFallback=true');

  // Traditional Asian plucked cue favors Shamisen
  const pluckedShamisen = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Plucked string instrument', score: 0.58 },
      { categoryName: 'Traditional music', score: 0.50 },
      { categoryName: 'Music of Asia', score: 0.40 },
    ],
    inputRms: 0.08,
  });
  assert(
    pluckedShamisen.decisions[0].instrument.canonicalName === 'Shamisen',
    `Asian traditional plucked cue selects Shamisen (got ${pluckedShamisen.decisions[0].instrument.canonicalName})`
  );

  // Rock cue shifts to Electric Guitar
  const pluckedRock = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Plucked string instrument', score: 0.58 },
      { categoryName: 'Rock music', score: 0.65 },
    ],
    inputRms: 0.08,
  });
  assert(
    pluckedRock.decisions[0].instrument.canonicalName === 'Electric Guitar',
    `Rock plucked cue selects Electric Guitar (got ${pluckedRock.decisions[0].instrument.canonicalName})`
  );
  console.log('✅ TEST 4 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 5: Broad Keyboard (musical) -> {Piano, Grand Piano, Electric Piano, Synthesizer}
// -------------------------------------------------------------------------
console.log('TEST 5: Broad "Keyboard (musical)" -> {Piano, Grand Piano, Electric Piano, Synthesizer}');
{
  const synthKey = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Keyboard (musical)', score: 0.66 },
      { categoryName: 'Electronic music', score: 0.72 },
    ],
    inputRms: 0.08,
  });
  assert(
    synthKey.decisions[0].instrument.canonicalName === 'Synthesizer' &&
      synthKey.decisions[0].classificationMode === 'best_match' &&
      synthKey.decisions[0].isFallback === true,
    `Electronic context turns Keyboard (musical) into Synthesizer best-match (not blindly Piano; got ${synthKey.decisions[0].instrument.canonicalName})`
  );

  const epianoKey = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Keyboard (musical)', score: 0.64 },
      { categoryName: 'Jazz', score: 0.55 },
    ],
    inputRms: 0.08,
  });
  assert(
    ['Electric Piano', 'Piano', 'Grand Piano', 'Synthesizer'].includes(
      epianoKey.decisions[0].instrument.canonicalName
    ),
    `Jazz Keyboard (musical) selects Electric Piano (got ${epianoKey.decisions[0].instrument.canonicalName})`
  );
  assert(epianoKey.decisions[0].instrument.canonicalName === 'Electric Piano', 'Jazz Keyboard resolves specifically to Electric Piano');
  console.log('✅ TEST 5 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 6: Generic Percussion -> {Drum Kit, Vibraphone, Handpan}
// -------------------------------------------------------------------------
console.log('TEST 6: Generic "Percussion" -> {Drum Kit, Vibraphone, Handpan}');
{
  const percDrum = resolveAudioSetToClosedSet17({
    categories: [{ categoryName: 'Percussion', score: 0.61 }],
    inputRms: 0.1,
  });
  assert(
    ['Drum Kit', 'Vibraphone', 'Handpan'].includes(percDrum.decisions[0].instrument.canonicalName) &&
      percDrum.decisions[0].isFallback === true,
    `Generic Percussion resolved inside {Drum Kit, Vibraphone, Handpan} (got ${percDrum.decisions[0].instrument.canonicalName})`
  );

  const percHandpan = resolveAudioSetToClosedSet17({
    categories: [
      { categoryName: 'Percussion', score: 0.55 },
      { categoryName: 'Ambient music', score: 0.62 },
    ],
    inputRms: 0.06,
  });
  assert(
    percHandpan.decisions[0].instrument.canonicalName === 'Handpan' &&
      percHandpan.decisions[0].isFallback === true,
    `Ambient melodic percussion selects Handpan best-match (got ${percHandpan.decisions[0].instrument.canonicalName})`
  );

  // Marimba, xylophone must NOT claim exact Vibraphone
  const marimba = resolveAudioSetToClosedSet17({
    categories: [{ categoryName: 'Marimba, xylophone', score: 0.70 }],
    inputRms: 0.06,
  });
  assert(
    marimba.decisions[0].instrument.canonicalName === 'Vibraphone' &&
      marimba.decisions[0].classificationMode === 'inferred' &&
      marimba.decisions[0].classificationConfidence < 75,
    'Marimba, xylophone maps to inferred Vibraphone with modest confidence (not definitive)'
  );
  console.log('✅ TEST 6 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 7 & 12: Temporal continuity retention, hysteresis, & gapless merging
// -------------------------------------------------------------------------
console.log('TEST 7 & 12: Ambiguous Frame Continuity, Anti-Flip-Flop Hysteresis, & Zero Unexplained Gaps');
{
  const tracker = new YamnetTemporalTracker();

  // Frame 1: Exact Cello
  const f1 = tracker.processCategories({
    categories: [{ categoryName: 'Cello', score: 0.75 }],
    playbackStart: 0.0,
    playbackEnd: 1.0,
    inputRms: 0.08,
  });
  // Frame 2: Broad Bowed string instrument (hysteresis MUST retain Cello cleanly without switching to Violin/Erhu)
  const f2 = tracker.processCategories({
    categories: [{ categoryName: 'Bowed string instrument', score: 0.62 }],
    playbackStart: 1.0,
    playbackEnd: 2.0,
    inputRms: 0.07,
  });
  // Frame 3: Ambiguous Music only (continuity bridge maintains coverage cleanly)
  const f3 = tracker.processCategories({
    categories: [{ categoryName: 'Music', score: 0.74 }],
    playbackStart: 2.0,
    playbackEnd: 3.0,
    inputRms: 0.06,
  });
  // Frame 4: Exact Cello returns
  const f4 = tracker.processCategories({
    categories: [{ categoryName: 'Cello', score: 0.70 }],
    playbackStart: 3.0,
    playbackEnd: 4.0,
    inputRms: 0.08,
  });

  assert(f1.predictions[0].canonicalName === 'Cello', 'Frame 1: Cello (exact)');
  assert(
    f2.predictions[0].canonicalName === 'Cello' &&
      f2.predictions[0].classificationMode === 'best_match' &&
      f2.predictions[0].influencedByTemporalHistory === true,
    'Frame 2: Broad bowed string retains Cello via temporal hysteresis (no random switch to Violin/Erhu)'
  );
  assert(
    f3.predictions.length === 1 &&
      f3.predictions[0].canonicalName === 'Cello' &&
      f3.bridgedByContinuity === true &&
      f3.predictions[0].isFallback === true,
    'Frame 3: Ambiguous bare Music bridges Cello briefly with isFallback=true'
  );
  assert(f4.predictions[0].canonicalName === 'Cello', 'Frame 4: Cello returns seamlessly');

  const merged = mergeYamnetTimelineSegments(
    [...f1.segments, ...f2.segments, ...f3.segments, ...f4.segments],
    10
  );
  assert(
    merged.length === 1 && merged[0].startTime === 0 && merged[0].endTime === 4,
    `Continuous merged Cello segment [0s..4s] with zero unexplained gaps (count=${merged.length})`
  );

  // Verify continuity bridge expires automatically if bare Music persists past maxBridgeFrames (2)
  const b1 = tracker.processCategories({ categories: [{ categoryName: 'Music', score: 0.6 }], playbackStart: 4, playbackEnd: 5, inputRms: 0.05 });
  const b2 = tracker.processCategories({ categories: [{ categoryName: 'Music', score: 0.6 }], playbackStart: 5, playbackEnd: 6, inputRms: 0.05 });
  const b3 = tracker.processCategories({ categories: [{ categoryName: 'Music', score: 0.6 }], playbackStart: 6, playbackEnd: 7, inputRms: 0.05 });
  assert(b1.bridgedByContinuity === true && b2.bridgedByContinuity === true && b3.segments.length === 0, 'Continuity bridge expires after max 2 ambiguous frames (does not extend indefinitely)');
  console.log('✅ TEST 7 & 12 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 8 & 9: Genuine silence & Speech-only & Cold Bare Music produce NO segments
// -------------------------------------------------------------------------
console.log('TEST 8 & 9: Silence, Speech-Only, and Bare Cold-Start Music Emit Zero Segments');
{
  const tracker = new YamnetTemporalTracker();

  const silentRms = tracker.processCategories({
    categories: [{ categoryName: 'Piano', score: 0.8 }],
    playbackStart: 0,
    playbackEnd: 1,
    inputRms: 0.0001,
  });
  assert(silentRms.isSilence === true && silentRms.segments.length === 0, 'Zero/near-zero RMS produces empty segments');

  const silentClass = tracker.processCategories({
    categories: [{ categoryName: 'Silence', score: 0.92 }],
    playbackStart: 1,
    playbackEnd: 2,
    inputRms: 0.01,
  });
  assert(silentClass.isSilence === true && silentClass.segments.length === 0, 'AudioSet Silence produces empty segments');

  const speechOnly = tracker.processCategories({
    categories: [
      { categoryName: 'Speech', score: 0.88 },
      { categoryName: 'Narration, monologue', score: 0.42 },
    ],
    playbackStart: 2,
    playbackEnd: 3,
    inputRms: 0.06,
  });
  assert(speechOnly.isSpeechDominant === true && speechOnly.segments.length === 0, 'Speech-only audio produces zero instrument segments');

  const envNoise = tracker.processCategories({
    categories: [{ categoryName: 'Traffic noise, roadway noise', score: 0.84 }],
    playbackStart: 3,
    playbackEnd: 4,
    inputRms: 0.06,
  });
  assert(envNoise.isNonMusicalNoise === true && envNoise.segments.length === 0, 'Environmental noise produces zero instrument segments');

  const coldBareMusic = tracker.processCategories({
    categories: [{ categoryName: 'Music', score: 0.91 }, { categoryName: 'Pop music', score: 0.55 }],
    playbackStart: 4,
    playbackEnd: 5,
    inputRms: 0.07,
  });
  assert(coldBareMusic.segments.length === 0, 'Cold-start generic Music without any instrument tag or prior history does NOT fabricate an instrument');
  console.log('✅ TEST 8 & 9 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 10: Multi-instrument frame retains multiple simultaneous instruments
// -------------------------------------------------------------------------
console.log('TEST 10: Multi-Instrument Detection in Single Frame');
{
  const tracker = new YamnetTemporalTracker();
  const multi = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.65 },
      { categoryName: 'Violin, fiddle', score: 0.52 },
      { categoryName: 'Drum kit', score: 0.44 },
      { categoryName: 'Bass guitar', score: 0.36 },
    ],
    playbackStart: 10,
    playbackEnd: 11,
    inputRms: 0.12,
  });

  const names = multi.segments.map((s) => s.instrumentName);
  assert(multi.segments.length === 4, `All 4 simultaneous instruments preserved (got ${multi.segments.length}: ${names.join(', ')})`);
  assert(
    names.includes('Piano') &&
      names.includes('Violin') &&
      names.includes('Drum Kit') &&
      names.includes('Bass Guitar'),
    'Piano, Violin, Drum Kit, and Bass Guitar co-exist without suppressing each other'
  );
  console.log('✅ TEST 10 PASSED\n');
}

// -------------------------------------------------------------------------
// SCENARIO 11: Strict Closed-Set 18-Category Output Invariant (17 Instruments + Vocals)
// -------------------------------------------------------------------------
console.log('TEST 11: Strict Closed-Set Invariant (Only 17 Instruments + Unified Vocals)');
{
  assert(
    YAMNET_ALL_TARGET_NAMES.length === 18 && YAMNET_ALL_TARGET_NAMES.includes('Vocals'),
    `YAMNET_ALL_TARGET_NAMES has 18 categories including Vocals (got ${YAMNET_ALL_TARGET_NAMES.length})`
  );

  const forbiddenLabels = [
    'Unresolved String Section',
    'Plucked Strings (AudioSet)',
    'Guitar (AudioSet)',
    'Keyboard (AudioSet)',
    'Unresolved Woodwind Section',
    'Unresolved Brass Section',
    'Orchestra (AudioSet)',
    'Unknown Instrument',
    'Unidentified Instrument',
    'Unclassified Voice',
    'Male Vocals',
    'Female Vocals',
    'Mixed Choir',
    'Banjo',
    'Clarinet',
    'Oboe',
    'Acoustic Guitar',
  ];

  const stressLabels = [
    'Singing',
    'Choir',
    'Synthetic singing',
    'Vocal music',
    'A capella',
    'Banjo',
    'Mandolin',
    'Clarinet',
    'Oboe',
    'Bassoon',
    'French horn',
    'Trombone',
    'Accordion',
    'Sitar',
    'Harpsichord',
    'Acoustic guitar',
    'Orchestra',
    'Musical instrument',
    'Bowed string instrument',
    'Plucked string instrument',
    'Keyboard (musical)',
    'Wind instrument, woodwind instrument',
    'Brass instrument',
    'Percussion',
  ];

  const vocalTriggerLabels = new Set(['Singing', 'Choir', 'Synthetic singing', 'Vocal music', 'A capella']);
  const tracker = new YamnetTemporalTracker();

  for (const label of stressLabels) {
    const res = tracker.processCategories({
      categories: [{ categoryName: label, score: 0.7 }],
      playbackStart: 0,
      playbackEnd: 1,
      inputRms: 0.08,
    });
    for (const seg of res.segments) {
      assert(
        isSupportedYamnetCategory(seg.instrumentName) &&
          YAMNET_ALL_TARGET_NAMES.includes(seg.instrumentName as any),
        `Stress label "${label}" produced supported 18-class category "${seg.instrumentName}"`
      );
      if (vocalTriggerLabels.has(label)) {
        assert(
          seg.instrumentName === YAMNET_VOCAL_CATEGORY.canonicalName &&
            seg.isVoice === true &&
            seg.family === 'Voice & Electronic',
          `Vocal label "${label}" mapped to unified Vocals with isVoice=true & Voice & Electronic family`
        );
      } else {
        assert(
          isSupportedYamnetInstrument(seg.instrumentName) &&
            YAMNET_TARGET_NAMES.includes(seg.instrumentName as any),
          `Instrument stress label "${label}" produced supported 17-class instrument "${seg.instrumentName}"`
        );
      }
      assert(
        !forbiddenLabels.includes(seg.instrumentName),
        `Forbidden output "${seg.instrumentName}" was never emitted`
      );
    }
    tracker.reset();
  }

  assert(mapAudioSetLabelToInstrument('Speech') === null, 'Speech maps to null');
  assert(isAudioSetSilenceOrSpeech('Silence') === 'silence', 'Silence detected cleanly');
  console.log('✅ TEST 11 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 12+: Cache Versioning, 6-GLB Integration, & On-Disk Runtime Check
// -------------------------------------------------------------------------
console.log('TEST 13: Cache Versioning Isolation, 6-GLB Integration & Static Assets');
{
  assert(
    YAMNET_SCHEMA_VERSION === 'v3-18cat-multilabel-vocals',
    `YAMNET_SCHEMA_VERSION updated (${YAMNET_SCHEMA_VERSION})`
  );
  const geminiKey = buildAnalysisCacheKey({ videoId: 'aYKN5_b7yVo', duration: 411 });
  const yamnetKey = buildYamnetCacheKey({ videoId: 'aYKN5_b7yVo' });
  const v2YamnetKey = buildYamnetCacheKey({
    videoId: 'aYKN5_b7yVo',
    schemaVersion: 'v2-closed-set-17-best-match',
  });
  const legacyYamnetKey = buildYamnetCacheKey({
    videoId: 'aYKN5_b7yVo',
    schemaVersion: 'v1-local-yamnet',
  });
  assert(
    yamnetKey !== v2YamnetKey && yamnetKey !== legacyYamnetKey,
    'New v3 YAMNet cache key invalidates v1 & v2 safely without touching Gemini cache'
  );
  assert(geminiKey !== yamnetKey, 'Gemini and YAMNet cache keys remain completely separate');

  const mergedRanges = mergeYamnetCaptureRanges([
    { start: 0, end: 12.2 },
    { start: 12.5, end: 25.0 },
  ]);
  assert(mergedRanges.length === 1 && mergedRanges[0].end === 25.0, 'Capture range merge operates cleanly');

  const expectedPerformers = [
    { id: 'hinata-grand-piano', roleTag: 'Grand Piano' },
    { id: 'kisaki-erhu', roleTag: 'Erhu' },
    { id: 'yuuka-handpan', roleTag: 'Handpan' },
    { id: 'saori-dress-harp', roleTag: 'Harp' },
  ];
  for (const p of expectedPerformers) {
    const tsEntry = BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === p.id);
    const jsonEntry = (blueArchiveManifest as any[]).find((c) => c.id === p.id);
    assert(Boolean(tsEntry && jsonEntry), `Manifest contains ${p.id}`);
    assert(getCharacterRole(tsEntry)?.roleTag === p.roleTag, `Role badge matches ${p.roleTag}`);
  }
  assert(
    DEFAULT_SCENERY_CONFIG.sainteChapelleInterior === false &&
      DEFAULT_SCENERY_CONFIG.fireStage === false &&
      HINA_SPECIAL_SCENERY.sainteChapelleInterior === false &&
      SCENERY_PRESETS.some((p) => p.id === 'aniverse-fire-stage'),
    'GLB environments remain OFF by default and excluded from character roster'
  );
  const dressHina = BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === 'hina-dress-with-piano-296');
  const hinataPiano = BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === 'hinata-grand-piano');
  assert(isHinaPianoPerformer(dressHina) === true && isHinaPianoPerformer(hinataPiano) === false, 'Hina vs Hinata guard holds');

  const rootDir = process.cwd();
  for (const rel of [
    'public/yamnet/yamnet.tflite',
    'public/yamnet/pcm-capture-worklet.js',
    'public/yamnet/wasm/audio_wasm_internal.js',
    'public/yamnet/wasm/audio_wasm_internal.wasm',
  ]) {
    assert(fs.statSync(path.join(rootDir, rel)).isFile(), `${rel} exists on disk`);
  }
  console.log('✅ TEST 13 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 14: 18-Category Multi-Label Independent Vocals & Speech Separation
// -------------------------------------------------------------------------
console.log('TEST 14: 18-Category Independent Vocals Detection (All 12 Scenarios)');
{
  const tracker = new YamnetTemporalTracker();

  // 1. Instrumental piano without vocals (including realistic rank-#140 sigmoid tail Singing=0.002)
  const pianoNoVocals = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.84 },
      { categoryName: 'Music', score: 0.72 },
      { categoryName: 'Singing', score: 0.002 },
    ],
    playbackStart: 0,
    playbackEnd: 1,
    inputRms: 0.09,
  });
  assert(
    pianoNoVocals.segments.length === 1 &&
      pianoNoVocals.segments[0].instrumentName === 'Piano' &&
      pianoNoVocals.vocalPrediction === null,
    'Scenario 1: Instrumental Piano ignores 0.002 Singing sigmoid tail -> Piano only'
  );

  // 2. Piano + Solo singer (Piano: 0.82, Singing: 0.65)
  tracker.reset();
  const pianoAndSolo = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.82 },
      { categoryName: 'Singing', score: 0.65 },
      { categoryName: 'Music', score: 0.76 },
    ],
    playbackStart: 1,
    playbackEnd: 2,
    inputRms: 0.11,
  });
  const s2Names = pianoAndSolo.segments.map((s) => s.instrumentName);
  assert(
    s2Names.includes('Piano') && s2Names.includes('Vocals') && pianoAndSolo.vocalPrediction?.isVoice === true,
    `Scenario 2: Piano (0.82) + Singing (0.65) -> both Piano & Vocals detected simultaneously (${s2Names.join(', ')})`
  );

  // 3. Violin + Singing
  tracker.reset();
  const violinAndSinging = tracker.processCategories({
    categories: [
      { categoryName: 'Violin, fiddle', score: 0.74 },
      { categoryName: 'Singing', score: 0.42 },
    ],
    playbackStart: 2,
    playbackEnd: 3,
    inputRms: 0.1,
  });
  const s3Names = violinAndSinging.segments.map((s) => s.instrumentName);
  assert(
    s3Names.includes('Violin') && s3Names.includes('Vocals'),
    `Scenario 3: Violin + Singing -> Violin & Vocals coexist (${s3Names.join(', ')})`
  );

  // 4. Multiple instruments (5 loud instruments = maxClassesPerFrame) + lead vocals
  tracker.reset();
  const fullBandPlusVocal = tracker.processCategories({
    categories: [
      { categoryName: 'Drum kit', score: 0.88 },
      { categoryName: 'Electric guitar', score: 0.81 },
      { categoryName: 'Bass guitar', score: 0.72 },
      { categoryName: 'Synthesizer', score: 0.64 },
      { categoryName: 'Piano', score: 0.59 },
      { categoryName: 'Singing', score: 0.35 },
    ],
    playbackStart: 3,
    playbackEnd: 4,
    inputRms: 0.15,
  });
  const s4Names = fullBandPlusVocal.segments.map((s) => s.instrumentName);
  assert(
    fullBandPlusVocal.segments.length === 6 &&
      s4Names.includes('Drum Kit') &&
      s4Names.includes('Electric Guitar') &&
      s4Names.includes('Bass Guitar') &&
      s4Names.includes('Synthesizer') &&
      s4Names.includes('Piano') &&
      s4Names.includes('Vocals'),
    `Scenario 4: 5 simultaneous instruments NEVER evict Vocals (emitted 6: ${s4Names.join(', ')})`
  );

  // 5. Choir + Instruments
  tracker.reset();
  const choirPlusInst = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.68 },
      { categoryName: 'Choir', score: 0.58 },
      { categoryName: 'Classical music', score: 0.52 },
    ],
    playbackStart: 4,
    playbackEnd: 5,
    inputRms: 0.12,
  });
  const s5Vocal = choirPlusInst.segments.find((s) => s.instrumentName === 'Vocals');
  assert(
    Boolean(s5Vocal && s5Vocal.isVoice === true && s5Vocal.originalModelClass === 'Choir') &&
      choirPlusInst.segments.some(
        (s) => s.instrumentName === 'Piano' || s.instrumentName === 'Grand Piano'
      ),
    'Scenario 5: Choir + Piano -> Piano/Grand Piano + unified Vocals (preserving originalModelClass="Choir")'
  );

  // 6. Backing + lead vocals (Singing + Choir + Vocal music) -> ONE unified Vocals category
  tracker.reset();
  const layeredVocals = tracker.processCategories({
    categories: [
      { categoryName: 'Singing', score: 0.61 },
      { categoryName: 'Choir', score: 0.37 },
      { categoryName: 'Vocal music', score: 0.44 },
      { categoryName: 'Electric guitar', score: 0.70 },
    ],
    playbackStart: 5,
    playbackEnd: 6,
    inputRms: 0.12,
  });
  const s6VocalSegments = layeredVocals.segments.filter((s) => s.isVoice || s.instrumentName === 'Vocals');
  assert(
    s6VocalSegments.length === 1 &&
      s6VocalSegments[0].instrumentName === 'Vocals' &&
      s6VocalSegments[0].originalModelClass?.includes('Singing') &&
      s6VocalSegments[0].originalModelClass?.includes('Choir'),
    `Scenario 6: Layered Singing + Choir + Vocal music merge into ONE unified Vocals track (${s6VocalSegments[0]?.originalModelClass})`
  );

  // 7. Synthetic singing -> Vocals
  tracker.reset();
  const synthVocal = tracker.processCategories({
    categories: [
      { categoryName: 'Synthesizer', score: 0.76 },
      { categoryName: 'Synthetic singing', score: 0.53 },
    ],
    playbackStart: 6,
    playbackEnd: 7,
    inputRms: 0.1,
  });
  assert(
    synthVocal.segments.some((s) => s.instrumentName === 'Vocals' && s.isVoice === true) &&
      synthVocal.segments.some((s) => s.instrumentName === 'Synthesizer'),
    'Scenario 7: Synthetic singing + Synthesizer -> Vocals + Synthesizer'
  );

  // 8. Spoken dialogue alone AND dialogue over background Piano -> zero Vocals!
  tracker.reset();
  const dialogueOnly = tracker.processCategories({
    categories: [
      { categoryName: 'Speech', score: 0.89 },
      { categoryName: 'Narration, monologue', score: 0.61 },
      { categoryName: 'Conversation', score: 0.44 },
      { categoryName: 'Singing', score: 0.025 }, // subtle bleed well below 2.5x rule
    ],
    playbackStart: 7,
    playbackEnd: 8,
    inputRms: 0.07,
  });
  assert(
    dialogueOnly.segments.length === 0 && dialogueOnly.vocalPrediction === null,
    'Scenario 8a: Spoken dialogue / monologue alone produces ZERO segments & NO Vocals'
  );

  const dialogueOverPiano = tracker.processCategories({
    categories: [
      { categoryName: 'Speech', score: 0.82 },
      { categoryName: 'Piano', score: 0.64 },
      { categoryName: 'Music', score: 0.58 },
      { categoryName: 'Humming', score: 0.06 }, // inferred-only vocal trace under speech
    ],
    playbackStart: 8,
    playbackEnd: 9,
    inputRms: 0.08,
  });
  assert(
    dialogueOverPiano.segments.length === 1 &&
      dialogueOverPiano.segments[0].instrumentName === 'Piano' &&
      dialogueOverPiano.vocalPrediction === null,
    'Scenario 8b: Dialogue over background Piano detects Piano while blocking false Vocals'
  );

  // 9. Instrumental music without vocals (including non-human vocal traps!)
  tracker.reset();
  const instrumentalWithTraps = tracker.processCategories({
    categories: [
      { categoryName: 'Flute', score: 0.71 },
      { categoryName: 'Harp', score: 0.62 },
      { categoryName: 'Bird vocalization, bird call, bird song', score: 0.55 },
      { categoryName: 'Singing bowl', score: 0.40 },
      { categoryName: 'Mains hum', score: 0.35 },
    ],
    playbackStart: 9,
    playbackEnd: 10,
    inputRms: 0.07,
  });
  assert(
    !instrumentalWithTraps.segments.some((s) => s.instrumentName === 'Vocals') &&
      instrumentalWithTraps.segments.some((s) => s.instrumentName === 'Flute') &&
      instrumentalWithTraps.segments.some((s) => s.instrumentName === 'Harp'),
    'Scenario 9: Bird vocalization / Singing bowl / Mains hum NEVER trigger false Vocals'
  );

  // 10. Genuine silence
  tracker.reset();
  const genuineSilence = tracker.processCategories({
    categories: [
      { categoryName: 'Silence', score: 0.91 },
      { categoryName: 'Singing', score: 0.03 },
    ],
    playbackStart: 10,
    playbackEnd: 11,
    inputRms: 0.0002,
  });
  assert(
    genuineSilence.isSilence === true &&
      genuineSilence.segments.length === 0 &&
      genuineSilence.vocalPrediction === null,
    'Scenario 10: Genuine silence produces ZERO instruments and ZERO Vocals'
  );

  // 11. Quiet vocals buried below top-15 loud instruments (index #18)
  tracker.reset();
  const buriedQuietVocalsCategories = [
    { categoryName: 'Music', score: 0.94 },
    { categoryName: 'Rock music', score: 0.88 },
    { categoryName: 'Drum kit', score: 0.83 },
    { categoryName: 'Electric guitar', score: 0.79 },
    { categoryName: 'Bass guitar', score: 0.71 },
    { categoryName: 'Snare drum', score: 0.66 },
    { categoryName: 'Cymbal', score: 0.61 },
    { categoryName: 'Heavy metal', score: 0.54 },
    { categoryName: 'Pop music', score: 0.49 },
    { categoryName: 'Soundtrack music', score: 0.44 },
    { categoryName: 'Synthesizer', score: 0.41 },
    { categoryName: 'Keyboard (musical)', score: 0.36 },
    { categoryName: 'Guitar', score: 0.33 },
    { categoryName: 'Bass drum', score: 0.29 },
    { categoryName: 'Hi-hat', score: 0.24 },
    { categoryName: 'Orchestra', score: 0.19 },
    { categoryName: 'Piano', score: 0.14 },
    // Position #18 (would have been invisible when maxResults was 15!):
    { categoryName: 'Singing', score: 0.045 },
  ];
  const buriedResult = tracker.processCategories({
    categories: buriedQuietVocalsCategories,
    playbackStart: 11,
    playbackEnd: 12,
    inputRms: 0.14,
  });
  assert(
    buriedResult.segments.some((s) => s.instrumentName === 'Vocals' && s.isVoice === true) &&
      buriedResult.segments.some((s) => s.instrumentName === 'Drum Kit'),
    'Scenario 11: Quiet Singing (0.045 at rank #18 below top-15 loud instruments) is detected as Vocals'
  );

  // 12. Vocals start and stop dynamically during continuous instrumental Piano
  tracker.reset();
  const f1 = tracker.processCategories({
    categories: [{ categoryName: 'Piano', score: 0.79 }],
    playbackStart: 0,
    playbackEnd: 1,
    inputRms: 0.08,
  });
  const f2 = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.78 },
      { categoryName: 'Singing', score: 0.55 },
    ],
    playbackStart: 1,
    playbackEnd: 2,
    inputRms: 0.1,
  });
  const f3 = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.77 },
      { categoryName: 'Singing', score: 0.62 },
    ],
    playbackStart: 2,
    playbackEnd: 3,
    inputRms: 0.1,
  });
  // Brief 1-frame breath/syllable dip while singing phrase continues: holdover preserves Vocals cleanly
  const f4Holdover = tracker.processCategories({
    categories: [
      { categoryName: 'Piano', score: 0.80 },
      { categoryName: 'Music', score: 0.68 },
    ],
    playbackStart: 3,
    playbackEnd: 4,
    inputRms: 0.08,
  });
  // Singing remains absent for 3 more frames -> holdover expires, leaving Piano only
  const f5 = tracker.processCategories({
    categories: [{ categoryName: 'Piano', score: 0.81 }],
    playbackStart: 4,
    playbackEnd: 5,
    inputRms: 0.08,
  });
  const f6 = tracker.processCategories({
    categories: [{ categoryName: 'Piano', score: 0.80 }],
    playbackStart: 5,
    playbackEnd: 6,
    inputRms: 0.08,
  });
  const f7Stopped = tracker.processCategories({
    categories: [{ categoryName: 'Piano', score: 0.82 }],
    playbackStart: 6,
    playbackEnd: 7,
    inputRms: 0.08,
  });

  assert(
    f1.segments.every((s) => s.instrumentName === 'Piano') &&
      f2.segments.some((s) => s.instrumentName === 'Vocals') &&
      f3.segments.some((s) => s.instrumentName === 'Vocals') &&
      f4Holdover.segments.some((s) => s.instrumentName === 'Vocals') &&
      f4Holdover.diagnostics.vocalEvaluation.bridgedByHoldover === true &&
      f5.diagnostics.vocalEvaluation.bridgedByHoldover === true &&
      !f6.segments.some((s) => s.instrumentName === 'Vocals') &&
      f7Stopped.segments.length === 1 &&
      f7Stopped.segments[0].instrumentName === 'Piano' &&
      !f7Stopped.segments.some((s) => s.instrumentName === 'Vocals'),
    'Scenario 12: Vocals enter mid-track, bridge up to 2 holdover frames, and stop cleanly while Piano continues'
  );

  // Verify VocalTemporalTracker + evaluateVocalsIndependently + mergeYamnetTimelineSegments end-to-end
  const vocalOnlyEval = evaluateVocalsIndependently({
    categories: [{ categoryName: 'A capella', score: 0.82 }],
    inputRms: 0.09,
  });
  assert(
    vocalOnlyEval.hasVocalEvidence && vocalOnlyEval.classificationMode === 'exact',
    'A capella triggers exact Vocals directly'
  );

  const mergedDynamic = mergeYamnetTimelineSegments(
    [
      ...f1.segments,
      ...f2.segments,
      ...f3.segments,
      ...f4Holdover.segments,
      ...f5.segments,
      ...f6.segments,
      ...f7Stopped.segments,
    ],
    10
  );
  const mergedPiano = mergedDynamic.find((s) => s.instrumentName === 'Piano');
  const mergedVocals = mergedDynamic.find((s) => s.instrumentName === 'Vocals');
  assert(
    Boolean(
      mergedPiano &&
        mergedPiano.startTime === 0 &&
        mergedPiano.endTime === 7 &&
        mergedVocals &&
        mergedVocals.isVoice === true &&
        mergedVocals.family === 'Voice & Electronic' &&
        mergedVocals.startTime === 1 &&
        mergedVocals.endTime === 5
    ),
    `Merged timeline preserves continuous Piano [0s..7s] overlapping bounded Vocals [1s..5s]`
  );

  // Also ensure VocalTemporalTracker is exported cleanly
  const directVocalTracker = new VocalTemporalTracker();
  directVocalTracker.reset();
  console.log('✅ TEST 14 PASSED\n');
}

console.log('========================================================================');
console.log('ALL 18-CATEGORY (17 INSTRUMENTS + VOCALS) YAMNET & ASSET TESTS PASSED!');
console.log('========================================================================');
