import fs from 'node:fs';
import path from 'node:path';
import { downsampleTo16kMono } from '../src/utils/audioCapture';
import {
  mapAudioSetLabelToInstrument,
  isAudioSetSilenceOrSpeech,
} from '../src/utils/yamnetLabelMap';
import {
  YamnetTemporalTracker,
  mergeYamnetTimelineSegments,
} from '../src/utils/yamnetClassifier';
import { normalizeInstrument } from '../src/utils/instrumentNormalization';
import {
  buildAnalysisCacheKey,
  buildYamnetCacheKey,
  mergeYamnetCaptureRanges,
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
console.log('RUNNING YAMNET PIPELINE & 6-GLB INTEGRATION UNIT TEST SUITE');
console.log('========================================================================\n');

// -------------------------------------------------------------------------
// TEST 1: downsampleTo16kMono DSP correctness (48kHz, 44.1kHz, 16kHz)
// -------------------------------------------------------------------------
console.log('TEST 1: downsampleTo16kMono Resampling & Mono Downmix');
{
  // 48 kHz stereo sine wave (440 Hz, 1 second = 48,000 samples)
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
  assert(
    out16.length === Math.floor(len48 / 3),
    `48 kHz -> 16 kHz produced exact expected length ${Math.floor(len48 / 3)} (got ${out16.length})`
  );

  let maxAbs = 0;
  let sumSq = 0;
  let hasNaN = false;
  for (let i = 0; i < out16.length; i++) {
    const v = out16[i];
    if (!Number.isFinite(v)) hasNaN = true;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / out16.length);
  assert(!hasNaN, '48 kHz output contains zero NaN/Inf samples');
  assert(maxAbs <= 1.0 && rms > 0.35 && rms < 0.65, `440 Hz energy preserved without clipping (rms=${rms.toFixed(3)}, peak=${maxAbs.toFixed(3)})`);

  // 44.1 kHz mono -> 16 kHz
  const sr441 = 44100;
  const len441 = 44100;
  const mono441 = new Float32Array(len441);
  for (let i = 0; i < len441; i++) {
    mono441[i] = 0.5 * Math.sin((2 * Math.PI * 330 * i) / sr441);
  }
  const out441 = downsampleTo16kMono([mono441], sr441, 16000);
  const expected441 = Math.floor(len441 / (sr441 / 16000));
  assert(
    out441.length === expected441,
    `44.1 kHz -> 16 kHz produced expected length ${expected441} (got ${out441.length})`
  );

  // 16 kHz stereo passthrough downmix
  const chA = new Float32Array([0.4, -0.4, 0.8]);
  const chB = new Float32Array([0.0, 0.4, 0.0]);
  const outPassthrough = downsampleTo16kMono([chA, chB], 16000, 16000);
  assert(outPassthrough.length === 3, '16 kHz passthrough keeps length 3');
  assert(
    Math.abs(outPassthrough[0] - 0.2) < 1e-6 &&
      Math.abs(outPassthrough[1]) < 1e-6 &&
      Math.abs(outPassthrough[2] - 0.4) < 1e-6,
    '16 kHz stereo passthrough averages left/right channels accurately'
  );
  console.log('✅ TEST 1 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 2: AudioSet YAMNet label map fidelity (zero fabrication, broader classes)
// -------------------------------------------------------------------------
console.log('TEST 2: AudioSet YAMNet Label Map Fidelity & Zero Fabrication');
{
  const violin = mapAudioSetLabelToInstrument('Violin, fiddle');
  assert(violin?.canonicalName === 'Violin' && violin.isBroaderClass === false, 'Violin, fiddle -> Violin (exact)');

  const grand = mapAudioSetLabelToInstrument('Piano');
  assert(grand?.canonicalName === 'Piano' && grand.isBroaderClass === false, 'Piano -> Piano (exact)');

  const keyboardBroad = mapAudioSetLabelToInstrument('Keyboard (musical)');
  assert(
    keyboardBroad?.canonicalName === 'Keyboard (AudioSet)' && keyboardBroad.isBroaderClass === true,
    'Keyboard (musical) -> Keyboard (AudioSet) (broader class, not coerced to Synthesizer)'
  );

  const pluckedBroad = mapAudioSetLabelToInstrument('Plucked string instrument');
  assert(
    pluckedBroad?.canonicalName === 'Plucked Strings (AudioSet)' && pluckedBroad.isBroaderClass === true,
    'Plucked string instrument -> Plucked Strings (AudioSet)'
  );

  assert(mapAudioSetLabelToInstrument('Silence') === null, 'Silence is NOT mapped as an instrument');
  assert(mapAudioSetLabelToInstrument('Speech') === null, 'Speech is NOT mapped as an instrument');
  assert(mapAudioSetLabelToInstrument('Narration, monologue') === null, 'Narration, monologue is NOT mapped as an instrument');
  assert(isAudioSetSilenceOrSpeech('Silence') === 'silence', 'isAudioSetSilenceOrSpeech recognizes Silence');
  assert(isAudioSetSilenceOrSpeech('Speech') === 'speech', 'isAudioSetSilenceOrSpeech recognizes Speech');

  // Verify zero Erhu / Handpan fabrication in AudioSet map
  assert(mapAudioSetLabelToInstrument('Erhu') === null, 'Erhu is NOT fabricated in AudioSet label map');
  assert(mapAudioSetLabelToInstrument('Handpan') === null, 'Handpan is NOT fabricated in AudioSet label map');

  // Verify normalizeInstrument preserves broader AudioSet classes without aliasing
  assert(normalizeInstrument('Keyboard (AudioSet)').canonicalName === 'Keyboard (AudioSet)', 'normalizeInstrument keeps Keyboard (AudioSet)');
  assert(normalizeInstrument('Plucked Strings (AudioSet)').canonicalName === 'Plucked Strings (AudioSet)', 'normalizeInstrument keeps Plucked Strings (AudioSet)');
  assert(normalizeInstrument('Guitar (AudioSet)').canonicalName === 'Guitar (AudioSet)', 'normalizeInstrument keeps Guitar (AudioSet)');
  console.log('✅ TEST 2 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 3: YamnetTemporalTracker (unthresholded scores, EMA, flicker, RMS silence, reset)
// -------------------------------------------------------------------------
console.log('TEST 3: YamnetTemporalTracker Unthresholded Scores & Flicker Suppression');
{
  const tracker = new YamnetTemporalTracker();

  // Frame 1: Low-confidence 0.02 Violin (2%) must NOT be discarded by a hardcoded cutoff
  const frame1 = tracker.processCategories({
    categories: [
      { categoryName: 'Violin, fiddle', score: 0.02 },
      { categoryName: 'Piano', score: 0.015 },
    ],
    playbackStart: 0.0,
    playbackEnd: 0.975,
    inputRms: 0.05,
  });

  assert(frame1.predictions.length === 2, 'Low rawScore predictions (0.02, 0.015) are retained without cutoff');
  assert(frame1.predictions[0].rawScore === 0.02 && frame1.predictions[0].originalModelClass === 'Violin, fiddle', 'rawScore (0.02) and originalModelClass preserved');
  assert(frame1.segments[0].status === 'confirmed', 'Rank #1 class confirmed on frame 1');
  assert(frame1.segments[1].status === 'provisional', 'Isolated single-frame secondary class marked provisional (flicker suppression)');

  // Frame 2: Piano sustained -> promoted to confirmed
  const frame2 = tracker.processCategories({
    categories: [
      { categoryName: 'Violin, fiddle', score: 0.08 },
      { categoryName: 'Piano', score: 0.06 },
    ],
    playbackStart: 0.975,
    playbackEnd: 1.95,
    inputRms: 0.06,
  });
  assert(frame2.segments[1].status === 'confirmed', 'Sustained secondary class promoted to confirmed on frame 2');

  // Frame 3: Zero RMS silence -> empty segments & decays EMA
  const silentFrame = tracker.processCategories({
    categories: [{ categoryName: 'Violin, fiddle', score: 0.5 }],
    playbackStart: 2.0,
    playbackEnd: 2.975,
    inputRms: 0,
  });
  assert(silentFrame.isSilence === true && silentFrame.segments.length === 0, 'Digital silence (inputRms === 0) produces empty segments');

  // Merge segments preserving metadata
  const merged = mergeYamnetTimelineSegments([...frame1.segments, ...frame2.segments], 30);
  const violinMerged = merged.find((s) => s.instrumentName === 'Violin');
  assert(
    violinMerged?.source === 'yamnet' &&
      violinMerged.originalModelClass === 'Violin, fiddle' &&
      violinMerged.rawScore === 0.08,
    'mergeYamnetTimelineSegments preserves source, originalModelClass, and max rawScore'
  );

  tracker.reset();
  const afterReset = tracker.processCategories({
    categories: [{ categoryName: 'Cello', score: 0.04 }],
    playbackStart: 10.0,
    playbackEnd: 10.975,
    inputRms: 0.04,
  });
  assert(afterReset.predictions.length === 1 && afterReset.predictions[0].smoothedScore === 0.04, 'tracker.reset() clears prior EMA state');
  console.log('✅ TEST 3 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 4: IndexedDB Cache Separation & Capture Range Merging
// -------------------------------------------------------------------------
console.log('TEST 4: IndexedDB Cache Key Separation & YAMNet Capture Ranges');
{
  const geminiKey = buildAnalysisCacheKey({ videoId: 'aYKN5_b7yVo', duration: 411 });
  const yamnetKey = buildYamnetCacheKey({ videoId: 'aYKN5_b7yVo' });

  assert(yamnetKey.includes('__eng_yamnet__'), 'YAMNet cache key contains __eng_yamnet__');
  assert(geminiKey !== yamnetKey, 'Gemini and YAMNet cache keys are completely distinct');

  const mergedRanges = mergeYamnetCaptureRanges([
    { start: 0, end: 12.2 },
    { start: 12.5, end: 25.0 },
    { start: 40.0, end: 52.0 },
  ]);
  assert(mergedRanges.length === 2, `Merged contiguous/near-contiguous ranges (got ${mergedRanges.length})`);
  assert(mergedRanges[0].start === 0 && mergedRanges[0].end === 25.0, 'First range [0, 25.0] merged cleanly');
  assert(mergedRanges[1].start === 40.0 && mergedRanges[1].end === 52.0, 'Disjoint range [40.0, 52.0] kept separate for partial capture tracking');
  console.log('✅ TEST 4 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 5: 6 New GLBs Integration (4 Character Performers + 2 Lazy Environments)
// -------------------------------------------------------------------------
console.log('TEST 5: 6 BlueArchiveModels GLB Integration & Safety Guards');
{
  const expectedPerformers = [
    {
      id: 'hinata-grand-piano',
      filename: 'Hinata_Grand_Piano_Exs_Grand_Piano.glb',
      url: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Hinata_Grand_Piano_Exs_Grand_Piano.glb',
      roleTag: 'Grand Piano',
    },
    {
      id: 'kisaki-erhu',
      filename: 'Kisaki_Erhu_Exs_Erhu.glb',
      url: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Kisaki_Erhu_Exs_Erhu.glb',
      roleTag: 'Erhu',
    },
    {
      id: 'yuuka-handpan',
      filename: 'Yuuka_Handpan_Exs_Handpan.glb',
      url: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Yuuka_Handpan_Exs_Handpan.glb',
      roleTag: 'Handpan',
    },
    {
      id: 'saori-dress-harp',
      filename: 'Saori_Dress_Harp_Exs_Harp (1).glb',
      url: 'https://raw.githubusercontent.com/Henry2120/BlueArchiveModels/main/Saori_Dress_Harp_Exs_Harp%20(1).glb',
      roleTag: 'Harp',
    },
  ];

  for (const p of expectedPerformers) {
    const tsEntry = BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === p.id);
    const jsonEntry = (blueArchiveManifest as any[]).find((c) => c.id === p.id);
    assert(Boolean(tsEntry && tsEntry.filename === p.filename && tsEntry.url === p.url), `blueArchiveCharacters.ts contains ${p.id} with exact URL/filename`);
    assert(Boolean(jsonEntry && jsonEntry.filename === p.filename && jsonEntry.url === p.url), `blueArchiveManifest.json contains ${p.id} with exact URL/filename`);
    const role = getCharacterRole(tsEntry);
    assert(role?.roleTag === p.roleTag, `characterRoles.ts maps ${p.id} to role "${p.roleTag}"`);
  }

  // Environment GLBs must NEVER appear in character rosters
  const forbiddenEnvNames = ['Sainte_Chapelle_Interior.glb', 'AniVerse_Fire_Stage.glb'];
  for (const envName of forbiddenEnvNames) {
    assert(
      !BLUE_ARCHIVE_CHARACTERS.some((c) => c.filename === envName || c.url.includes(envName)),
      `Environment GLB "${envName}" is NOT in blueArchiveCharacters.ts`
    );
    assert(
      !(blueArchiveManifest as any[]).some((c) => c.filename === envName || (c.url || '').includes(envName)),
      `Environment GLB "${envName}" is NOT in blueArchiveManifest.json`
    );
  }

  // Scenery defaults must keep both GLB environments OFF at startup
  assert(
    DEFAULT_SCENERY_CONFIG.sainteChapelleInterior === false && DEFAULT_SCENERY_CONFIG.fireStage === false,
    'DEFAULT_SCENERY_CONFIG has both GLB environments OFF'
  );
  assert(
    HINA_SPECIAL_SCENERY.sainteChapelleInterior === false && HINA_SPECIAL_SCENERY.fireStage === false,
    'HINA_SPECIAL_SCENERY has both GLB environments OFF'
  );
  const nonGlbPresets = SCENERY_PRESETS.filter(
    (p) => p.id !== 'sainte-chapelle-interior' && p.id !== 'aniverse-fire-stage'
  );
  assert(
    nonGlbPresets.every((p) => !p.config.sainteChapelleInterior && !p.config.fireStage),
    'All existing presets keep both GLB environments OFF'
  );

  // Hina vs Hinata guard
  const dressHina = BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === 'hina-dress-with-piano-296');
  const hinataPiano = BLUE_ARCHIVE_CHARACTERS.find((c) => c.id === 'hinata-grand-piano');
  assert(isHinaPianoPerformer(dressHina) === true, 'isHinaPianoPerformer returns true for Dress Hina');
  assert(isHinaPianoPerformer(hinataPiano) === false, 'isHinaPianoPerformer returns false for Hinata (Grand Piano)');
  console.log('✅ TEST 5 PASSED\n');
}

// -------------------------------------------------------------------------
// TEST 6: Verify local YAMNet static runtime artifacts exist on disk
// -------------------------------------------------------------------------
console.log('TEST 6: Local Browser YAMNet Runtime Artifacts On Disk');
{
  const rootDir = process.cwd();
  const requiredFiles = [
    'public/yamnet/yamnet.tflite',
    'public/yamnet/pcm-capture-worklet.js',
    'public/yamnet/wasm/audio_wasm_internal.js',
    'public/yamnet/wasm/audio_wasm_internal.wasm',
    'public/yamnet/wasm/audio_wasm_module_internal.js',
    'public/yamnet/wasm/audio_wasm_module_internal.wasm',
  ];
  for (const rel of requiredFiles) {
    const abs = path.join(rootDir, rel);
    const stat = fs.statSync(abs);
    assert(stat.isFile() && stat.size > 0, `${rel} exists (${stat.size.toLocaleString()} bytes)`);
  }
  console.log('✅ TEST 6 PASSED\n');
}

console.log('========================================================================');
console.log('ALL 6 YAMNET & 6-GLB INTEGRATION UNIT TESTS PASSED SUCCESSFULLY!');
console.log('========================================================================');
