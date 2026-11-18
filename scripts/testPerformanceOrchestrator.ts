import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INSTRUMENT_PERFORMER_REGISTRY,
  getPerformerForInstrument,
  isAssignableInstrument,
  mapInstrumentNameToPerformerTarget,
  resolvePerformerActionClip,
  resolvePerformerClipName,
  resolvePerformerMapping,
} from '../src/components/CharacterViewer/performerRegistry';
import {
  createInitialOrchestratorState,
  evaluateActiveAudioCategories,
  evaluateCombinedAudioSources,
  findDuplicateStagedPerformer,
  markPerformerLoadFailed,
  registerLoadedPerformer,
  removePerformerByInstanceId,
  stepPerformanceOrchestrator,
} from '../src/components/CharacterViewer/performanceOrchestrator';
import {
  buildAiConcertPerformancePlan,
  validateAiAnalysisCompletion,
} from '../src/components/CharacterViewer/aiConcertPlanner';
import { getConcertSlotTransform } from '../src/components/CharacterViewer/concertConfig';
import { BLUE_ARCHIVE_CHARACTERS } from '../src/data/blueArchiveCharacters';
import manifestJson from '../src/data/blueArchiveManifest.json';
import { getCharacterRole } from '../src/data/characterRoles';
import { YAMNET_TARGET_CATALOG } from '../src/utils/yamnetLabelMap';
import { InstrumentTimelineSegment } from '../src/utils/instrumentNormalization';

function makeSegment(
  instrumentName: string,
  startTime: number,
  endTime: number,
  opts: { isVoice?: boolean; confidence?: number } = {}
): InstrumentTimelineSegment {
  return {
    id: `seg-${instrumentName}-${startTime}-${endTime}`,
    instrumentName,
    family: opts.isVoice ? 'Voice & Electronic' : 'Strings',
    startTime,
    endTime,
    confidence: opts.confidence ?? 0.85,
    audibility: 'audible',
    source: 'yamnet',
    isVoice: opts.isVoice ?? instrumentName.toLowerCase() === 'vocals',
  };
}

function run() {
  console.log('=== Running AniVerse 3D Performer & YAMNet Orchestrator Verification ===\n');

  // 1. Complete 17-Instrument Registry & Live Manifest Alignment
  assert.equal(YAMNET_TARGET_CATALOG.length, 17, 'Expected 17 canonical YAMNet instrument categories');
  assert.equal(INSTRUMENT_PERFORMER_REGISTRY.length, 17, 'Expected 17 performer mappings in registry');

  const manifestIds = new Set((manifestJson as any[]).map((m) => m.id));
  const manifestFilenames = new Set((manifestJson as any[]).map((m) => m.filename));
  const tsIds = new Set(BLUE_ARCHIVE_CHARACTERS.map((c) => c.id));
  const tsFilenames = new Set(BLUE_ARCHIVE_CHARACTERS.map((c) => c.filename));
  const filenamesSeen = new Set<string>();

  for (const inst of YAMNET_TARGET_CATALOG) {
    const mapping = getPerformerForInstrument(inst.canonicalName);
    assert.ok(mapping, `Missing mapping for ${inst.canonicalName}`);
    assert.equal(mapping.hasVerifiedInstrumentProp, true, `${mapping.characterName} must have verified instrument prop`);
    assert.equal(mapping.verificationStatus, 'verified', `${mapping.characterName} must be verified`);
    assert.ok(mapping.idleClip.length > 0 && mapping.playingClip.length > 0, `Clips required for ${mapping.characterName}`);
    assert.ok(!filenamesSeen.has(mapping.filename), `Duplicate filename detected: ${mapping.filename}`);
    filenamesSeen.add(mapping.filename);

    // Ensure registry characterId & filename exist in both TS roster and JSON manifest
    assert.ok(tsIds.has(mapping.characterId), `Missing in BLUE_ARCHIVE_CHARACTERS: ${mapping.characterId}`);
    assert.ok(tsFilenames.has(mapping.filename), `Missing filename in BLUE_ARCHIVE_CHARACTERS: ${mapping.filename}`);
    assert.ok(
      manifestIds.has(mapping.characterId) ||
        mapping.alternateCharacterIds.some((alt) => manifestIds.has(alt)),
      `Missing ID or alternateCharacterId in blueArchiveManifest.json for ${mapping.characterName}`
    );
    assert.ok(
      manifestFilenames.has(mapping.filename),
      `Missing filename in blueArchiveManifest.json: ${mapping.filename}`
    );

    const role = getCharacterRole({ id: mapping.characterId, filename: mapping.filename, name: mapping.characterName });
    assert.ok(role, `Missing role entry for ${mapping.characterName}`);
  }
  console.log('PASS [1] All 17 YAMNet instruments map cleanly to unique verified Blue Archive models & animations.');

  // 2. Independent Vocals Rule (Scenario 4 & 10)
  assert.equal(isAssignableInstrument('Vocals'), false, 'Vocals must NEVER be assignable to a 3D performer');
  assert.equal(getPerformerForInstrument('Vocals'), null, 'getPerformerForInstrument(Vocals) must return null');

  const vocalsPlusViolinSegs = [
    makeSegment('Vocals', 0, 10, { isVoice: true }),
    makeSegment('Violin', 2, 8),
  ];
  const evalBoth = evaluateActiveAudioCategories(vocalsPlusViolinSegs, 5);
  assert.equal(evalBoth.activeVocals, true, 'Vocals should be flagged active at t=5');
  assert.deepEqual(evalBoth.activeInstruments, ['Violin'], 'Only Violin should be in activeInstruments alongside Vocals');

  const vocalsOnlyEval = evaluateActiveAudioCategories([makeSegment('Vocals', 0, 10, { isVoice: true })], 5);
  assert.equal(vocalsOnlyEval.activeVocals, true);
  assert.equal(vocalsOnlyEval.activeInstruments.length, 0, 'Vocals alone must spawn ZERO performers');
  console.log('PASS [2] Vocals stays strictly independent (no 3D vocalist spawned).');

  // 3. Mode A — Automatic Persistent Performers: Spawn -> Play -> Anti-Flicker Hold -> Re-detect -> Idle on Silence/Pause (NEVER Auto-Removed)
  let state = createInitialOrchestratorState('automatic', 'vidA', 'yamnet');
  const pianoSegments = [
    makeSegment('Piano', 0, 5),
    makeSegment('Piano', 7, 12),
  ];

  // Step 3a: t=1s playing -> requests Hina (Dress) with Piano
  let step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 1,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 1000,
  });
  state = step.nextState;
  assert.equal(step.loadRequests.length, 1);
  assert.equal(step.loadRequests[0].mapping.characterName, 'Hina (Dress) with Piano');
  assert.equal(step.loadRequests[0].initialState, 'playing');

  // Step 3b: Same instrument stays active at t=2s while loading -> MUST NOT spawn duplicate download
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 2,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 2000,
  });
  state = step.nextState;
  assert.equal(step.loadRequests.length, 0, 'Duplicate load prevented while in flight');

  // Step 3c: Register loaded Hina
  state = registerLoadedPerformer(state, {
    instanceId: 'inst-hina-1',
    characterId: 'hina-dress-with-piano-296',
    characterName: 'Hina (Dress) with Piano',
    filename: 'Hina_Dress_with_Piano.glb',
    origin: 'auto',
    nowMs: 2200,
    isPlayingNow: true,
  });

  // Step 3d: t=5.5s (brief gap between Piano segments) -> holds playing (grace_waiting anti-flicker), NEVER removes
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 5.5,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 5500,
  });
  state = step.nextState;
  assert.equal(step.removeInstanceIds.length, 0, 'Must NEVER remove performer on silence');
  assert.equal(step.animationDirectives[0]?.targetState, 'playing', 'Anti-flicker hold keeps playing smoothly during brief gap');
  assert.equal(state.performers['inst:piano']?.lifecycle, 'grace_waiting');

  // Step 3e: t=6.8s (re-detected within 2.5s hold at now=6800 < 8000) -> cancels hold & stays playing continuously
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 7.0,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 6800,
  });
  state = step.nextState;
  assert.equal(step.removeInstanceIds.length, 0);
  assert.equal(state.performers['inst:piano']?.lifecycle, 'playing');
  assert.equal(state.performers['inst:piano']?.graceDeadlineMs, null);
  assert.equal(step.animationDirectives[0]?.targetState, 'playing');

  // Step 3f: t=13s -> hold starts at 13000; pause settles immediately to idle & keeps performer on stage
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 13.0,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 13000,
  });
  state = step.nextState;
  assert.equal(state.performers['inst:piano']?.lifecycle, 'grace_waiting');

  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 13.0,
    isPlaying: false,
    isPaused: true,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 14000,
  });
  state = step.nextState;
  assert.equal(step.removeInstanceIds.length, 0, 'Pause must NEVER auto-remove performer');
  assert.equal(step.animationDirectives[0]?.targetState, 'idle', 'Pause transitions performer smoothly to idle');
  assert.equal(state.performers['inst:piano']?.lifecycle, 'idle');

  // Step 3g: Resume playing during prolonged silence (t=20s..25s) -> transitions to idle after hold expiry, STILL on stage!
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidA',
    currentTime: 20.0,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 20000,
  });
  state = step.nextState;
  assert.equal(step.removeInstanceIds.length, 0);
  assert.ok(state.performers['inst:piano'], 'Performer must stay staged forever during session');
  assert.equal(state.performers['inst:piano']?.lifecycle, 'idle');
  console.log('PASS [3] Mode A Persistent Performers (spawn -> play -> anti-flicker hold -> re-detect -> idle on silence/pause, NEVER auto-removed).');

  // 4. Configurable Anti-Flicker Hold (0s instant idle vs 2.5s hold) — Zero Removals
  let fastHoldState = registerLoadedPerformer(createInitialOrchestratorState('automatic', 'vidFast'), {
    instanceId: 'inst-drum-1',
    characterId: 'natsu-band-no-weapon-183',
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    origin: 'auto',
    nowMs: 1000,
    isPlayingNow: true,
  });
  const fastStep = stepPerformanceOrchestrator({
    state: fastHoldState,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidFast',
    currentTime: 10,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 0,
    nowMs: 1100,
  });
  assert.equal(fastStep.removeInstanceIds.length, 0, '0s hold transitions to idle WITHOUT removing performer');
  assert.equal(fastStep.animationDirectives[0]?.targetState, 'idle');
  assert.ok(fastStep.nextState.performers['inst:drum kit'], 'Drum Kit remains staged');

  let longHoldState = registerLoadedPerformer(createInitialOrchestratorState('automatic', 'vidLong'), {
    instanceId: 'inst-drum-2',
    characterId: 'natsu-band-no-weapon-183',
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    origin: 'auto',
    nowMs: 1000,
    isPlayingNow: true,
  });
  let longStep = stepPerformanceOrchestrator({
    state: longHoldState,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidLong',
    currentTime: 10,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 2500,
    nowMs: 1100,
  });
  assert.equal(longStep.removeInstanceIds.length, 0);
  assert.equal(longStep.animationDirectives[0]?.targetState, 'playing', 'Hold window preserves playing animation briefly');
  longStep = stepPerformanceOrchestrator({
    state: longStep.nextState,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidLong',
    currentTime: 11.2,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 2500,
    nowMs: 2500,
  });
  assert.equal(longStep.removeInstanceIds.length, 0);
  assert.equal(longStep.animationDirectives[0]?.targetState, 'playing', '2.5s hold still active at 1.4s elapsed');
  longStep = stepPerformanceOrchestrator({
    state: longStep.nextState,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidLong',
    currentTime: 13.0,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 2500,
    nowMs: 4000,
  });
  assert.equal(longStep.removeInstanceIds.length, 0, 'Hold expiry must NEVER remove performer');
  assert.equal(longStep.animationDirectives[0]?.targetState, 'idle', 'Hold expiry transitions smoothly to idle');
  assert.ok(longStep.nextState.performers['inst:drum kit'], 'Drum Kit still staged in idle');
  console.log('PASS [4] Configurable anti-flicker hold (0s instant idle vs 2.5s hold, zero performer removals).');

  // 5. Mode B — Manual Mode + Duplicate Prevention + Mode Switching Auto <-> Manual (Scenarios 12–19)
  let manualState = createInitialOrchestratorState('manual', 'vidM');
  manualState = registerLoadedPerformer(manualState, {
    instanceId: 'inst-violin-m',
    characterId: 'shiroko-violin-297',
    characterName: 'Shiroko (Violin)',
    filename: 'Shiroko_Violin.glb',
    origin: 'manual',
    nowMs: 1000,
  });
  // Duplicate check prevents second Shiroko (Violin)
  const dupCheck = findDuplicateStagedPerformer(manualState, {
    id: 'shiroko-violin-297',
    filename: 'Shiroko_Violin.glb',
  });
  assert.ok(dupCheck, 'Duplicate staged character/instrument must be caught in Manual mode');

  // Unseen instrument ('Guitar') does NOT auto-spawn in Manual mode; silent Violin stays idle permanently
  const manualSegs = [makeSegment('Electric Guitar', 0, 10), makeSegment('Violin', 5, 10)];
  let manStep = stepPerformanceOrchestrator({
    state: manualState,
    mode: 'manual',
    videoId: 'vidM',
    currentTime: 2,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: manualSegs,
    gracePeriodMs: 2500,
    nowMs: 2000,
  });
  assert.equal(manStep.loadRequests.length, 0, 'Manual mode must not auto-spawn Electric Guitar');
  assert.equal(manStep.removeInstanceIds.length, 0, 'Manual mode must never auto-remove Shiroko');
  assert.equal(manStep.animationDirectives[0]?.targetState, 'idle');

  // When Violin becomes active at t=6s -> Manual performer triggers playing
  manStep = stepPerformanceOrchestrator({
    state: manStep.nextState,
    mode: 'manual',
    videoId: 'vidM',
    currentTime: 6,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: manualSegs,
    gracePeriodMs: 2500,
    nowMs: 6000,
  });
  assert.equal(manStep.animationDirectives[0]?.targetState, 'playing', 'Manual performer animates playing on detection');

  // Switch Manual -> Auto: preserves loaded Shiroko (zero reloads) AND spawns active Electric Guitar
  manStep = stepPerformanceOrchestrator({
    state: manStep.nextState,
    mode: 'automatic',
    videoId: 'vidM',
    currentTime: 6.5,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: manualSegs,
    gracePeriodMs: 2500,
    nowMs: 6500,
  });
  assert.equal(manStep.reconciledModeSwitch, true);
  assert.equal(manStep.removeInstanceIds.length, 0, 'Existing active performer stays loaded on Manual -> Auto');
  assert.equal(manStep.loadRequests.length, 1);
  assert.equal(manStep.loadRequests[0].mapping.instrumentName, 'Electric Guitar');

  // Remove one manual performer helper check
  const afterSingleRemove = removePerformerByInstanceId(manStep.nextState, 'inst-violin-m');
  assert.equal(afterSingleRemove.performers['inst:violin'], undefined);
  console.log('PASS [5] Mode B Manual persistence, YAMNet animation sync, duplicate prevention, and Auto <-> Manual transitions.');

  // 6. Seek & Video Switch Reconciliation (Scenarios 22–24)
  let switchState = registerLoadedPerformer(createInitialOrchestratorState('automatic', 'vid1'), {
    instanceId: 'inst-sax-1',
    characterId: 'ako-dress-sax-297',
    characterName: 'Ako (Dress) with Saxophone',
    filename: 'Ako_Dress_Sax.glb',
    origin: 'auto',
    nowMs: 1000,
    isPlayingNow: true,
  });
  const videoSwitchStep = stepPerformanceOrchestrator({
    state: switchState,
    mode: 'automatic',
    videoId: 'vid2',
    currentTime: 0.5,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [makeSegment('Flute', 0, 8)],
    gracePeriodMs: 2500,
    nowMs: 2000,
  });
  assert.equal(videoSwitchStep.reconciledVideoSwitch, true);
  assert.deepEqual(videoSwitchStep.removeInstanceIds, ['inst-sax-1'], 'Previous video auto-staged Saxophone removed on switch');
  assert.equal(videoSwitchStep.loadRequests[0]?.mapping.instrumentName, 'Flute', 'New video Flute spawned');
  console.log('PASS [6] Video switch cleans previous auto performers & reconciles new video instruments.');

  // 7. Fault Tolerance: GLB Failure Isolation + Missing Clip Fallbacks + Footprint Spacing (Scenarios 26, 27, 29)
  let errState = createInitialOrchestratorState('automatic', 'vidErr');
  errState = stepPerformanceOrchestrator({
    state: errState,
    mode: 'automatic',
    videoId: 'vidErr',
    currentTime: 1,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [makeSegment('Harp', 0, 10), makeSegment('Cello', 0, 10)],
    gracePeriodMs: 2500,
    nowMs: 1000,
  }).nextState;
  errState = markPerformerLoadFailed(errState, 'inst:harp', 'Network timeout', 1500);
  // Cello remains unaffected while Harp is isolated in error state (not retried before cooldown)
  const duringCooldown = stepPerformanceOrchestrator({
    state: errState,
    mode: 'automatic',
    videoId: 'vidErr',
    currentTime: 3,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [makeSegment('Harp', 0, 10), makeSegment('Cello', 0, 10)],
    gracePeriodMs: 2500,
    nowMs: 3000,
    errorCooldownMs: 15000,
  });
  assert.equal(duringCooldown.loadRequests.length, 0, 'Errored Harp does not hammer reload inside cooldown');
  assert.equal(duringCooldown.nextState.performers['inst:cello']?.lifecycle, 'loading', 'Cello unaffected by Harp failure');

  // Verify Saori (Harp) idle resolution (has Formation_Idle, no Cafe_Idle)
  const harpMapping = resolvePerformerMapping('saori-dress-harp');
  assert.ok(harpMapping);
  const harpIdleAction = resolvePerformerActionClip(
    [{ name: 'Formation_Idle' }, { name: 'Exs_Harp' }],
    harpMapping,
    'idle'
  );
  assert.equal(harpIdleAction.clipName, 'Formation_Idle', 'Must resolve Formation_Idle cleanly when Cafe_Idle absent');
  const harpIdleResolved = resolvePerformerClipName(
    [{ name: 'Formation_Idle' }, { name: 'Exs_Harp' }],
    harpMapping.idleClip,
    harpMapping.idleFallbacks
  );
  assert.equal(harpIdleResolved, 'Formation_Idle');

  // Verify footprint-aware curved arc spacing does not overlap adjacent large instruments
  const widths = [1.95, 1.85, 1.75]; // Grand Piano, Drum Kit, Harp
  const slots = widths.map((_, idx) => getConcertSlotTransform(idx, widths.length, widths));
  const dist01 = Math.abs(slots[1].position.x - slots[0].position.x);
  const dist12 = Math.abs(slots[2].position.x - slots[1].position.x);
  assert.ok(dist01 >= 1.85 && dist12 >= 1.75, `Footprint spacing must prevent overlaps (got ${dist01.toFixed(2)}m, ${dist12.toFixed(2)}m)`);
  console.log('PASS [7] Error isolation, missing clip fallback resolution, and footprint-aware curved arc spacing.');

  // 8. Section 9 Mandatory Verification: Character-Specific Environment Behavior Completely Removed
  const viewerSrc = fs.readFileSync(path.resolve('src/components/CharacterViewer/Character3DViewer.tsx'), 'utf8');
  const toolbarSrc = fs.readFileSync(path.resolve('src/components/CharacterViewer/CharacterViewerToolbar.tsx'), 'utf8');
  const debuggerSrc = fs.readFileSync(path.resolve('src/components/CharacterViewer/SceneDebuggerPanel.tsx'), 'utf8');

  const forbiddenTokens = [
    'NightBeachScene',
    'isDressHinaAlone',
    'isSpecialSceneActive',
    'specialEnvironmentEnabled',
    'Stage Hina (Dress with Piano)',
    'Meadow Layers',
    'What triggers?',
  ];
  for (const token of forbiddenTokens) {
    assert.ok(!viewerSrc.includes(token), `Character3DViewer.tsx still contains removed token: ${token}`);
    assert.ok(!toolbarSrc.includes(token), `CharacterViewerToolbar.tsx still contains removed token: ${token}`);
    assert.ok(!debuggerSrc.includes(token), `SceneDebuggerPanel.tsx still contains removed token: ${token}`);
  }
  // Confirm Environment Preview tab and Instrument Analysis tab are still intact
  assert.ok(viewerSrc.includes('EnvironmentPreviewPanel'), 'EnvironmentPreviewPanel must remain preserved');
  assert.ok(viewerSrc.includes('InstrumentAnalysisView'), 'InstrumentAnalysisView must remain preserved');
  console.log('PASS [8] Dress Hina character-specific Night Meadow triggers removed while Environment Preview & Instrument Analysis remain intact.');

  // 9. Option B — AI Full-Track Analysis Source Integration & Alias Mapping
  assert.equal(mapInstrumentNameToPerformerTarget('Drum Machine', false, { allowAiAliases: true }), 'Drum Kit');
  assert.equal(mapInstrumentNameToPerformerTarget('Synth Pads', false, { allowAiAliases: true }), 'Synthesizer');
  assert.equal(mapInstrumentNameToPerformerTarget('Vocals', true, { allowAiAliases: true }), null);

  let aiState = createInitialOrchestratorState('automatic', 'vidAI', 'ai_full_track');
  const aiTimeline = [
    makeSegment('Drum Machine', 1, 5),
    makeSegment('Synth Pads', 2, 6),
    makeSegment('Vocals', 0, 10, { isVoice: true }),
  ];

  // At t=3s -> spawns Drum Kit (Natsu) & Synthesizer (Saori), ignores Vocals
  let aiStep = stepPerformanceOrchestrator({
    state: aiState,
    mode: 'automatic',
    detectionSource: 'ai_full_track',
    videoId: 'vidAI',
    currentTime: 3,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    aiSegments: aiTimeline,
    gracePeriodMs: 0,
    nowMs: 3000,
  });
  aiState = aiStep.nextState;
  assert.equal(aiStep.activeVocals, true);
  assert.deepEqual(aiStep.activeInstruments.sort(), ['Drum Kit', 'Synthesizer']);
  assert.equal(aiStep.loadRequests.length, 2);

  aiState = registerLoadedPerformer(aiState, {
    instanceId: 'inst-ai-drum',
    characterId: 'natsu-band-no-weapon-183',
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    origin: 'auto',
    nowMs: 3200,
    isPlayingNow: true,
  });
  aiState = registerLoadedPerformer(aiState, {
    instanceId: 'inst-ai-synth',
    characterId: 'saori-synthesizer',
    characterName: 'Saori (Synthesizer)',
    filename: 'Saori_Synthesizer_Exs_Synthesizer.glb',
    origin: 'auto',
    nowMs: 3200,
    isPlayingNow: true,
  });

  // At t=5.5s -> Drum Machine ended, Synth Pads still active -> Drum Kit becomes idle but stays on stage
  aiStep = stepPerformanceOrchestrator({
    state: aiState,
    mode: 'automatic',
    detectionSource: 'ai_full_track',
    videoId: 'vidAI',
    currentTime: 5.5,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    aiSegments: aiTimeline,
    gracePeriodMs: 0,
    nowMs: 5500,
  });
  assert.equal(aiStep.removeInstanceIds.length, 0);
  assert.equal(
    aiStep.animationDirectives.find((d) => d.instanceId === 'inst-ai-drum')?.targetState,
    'idle'
  );
  assert.equal(
    aiStep.animationDirectives.find((d) => d.instanceId === 'inst-ai-synth')?.targetState,
    'playing'
  );
  console.log('PASS [9] AI Full-Track Analysis source spawns persistent performers with alias mapping & Vocals isolation.');

  // 10. AI Full-Track Virtual Concert Plan, Incomplete Rejection, Upfront Roster Spawning & Deterministic Sync
  const incompleteCheck = validateAiAnalysisCompletion({
    success: true,
    status: 'partial',
    coverage: {
      totalDuration: 180,
      isFullCoverage: false,
      coveragePercentage: 75,
      totalWindows: 4,
      successfulWindows: 3,
      failedWindows: 1,
      missingRanges: [{ start: 135, end: 180 }],
      authoritativeDurationEstablished: true,
    },
  });
  assert.equal(incompleteCheck.isComplete, false, 'Incomplete analysis must NEVER be treated as complete');
  assert.equal(incompleteCheck.completionStatus, 'incomplete');
  assert.ok(incompleteCheck.completionReason?.includes('1 of 4'));

  const completePlan = buildAiConcertPerformancePlan({
    success: true,
    status: 'detected',
    videoId: 'vidConcert',
    title: 'Full Concert Test Track',
    artist: 'AniVerse Ensemble',
    coverage: {
      totalDuration: 180,
      isFullCoverage: true,
      coveragePercentage: 100,
      totalWindows: 4,
      successfulWindows: 4,
      failedWindows: 0,
      missingRanges: [],
      authoritativeDurationEstablished: true,
    },
    instrumentSegments: [
      makeSegment('Piano', 0, 45),
      makeSegment('Drum Machine', 15, 175),
      makeSegment('Vocals', 10, 140, { isVoice: true }),
      // Late-entering instrument at 02:30 (150s)
      makeSegment('Violin', 150, 178),
    ],
  });
  assert.equal(completePlan.isComplete, true);
  assert.equal(completePlan.vocalsDetected, true);
  assert.equal(completePlan.roster.length, 3, 'Complete roster must include late-entering Violin alongside Piano & Drum Kit (excluding Vocals)');
  assert.deepEqual(
    completePlan.roster.map((r) => r.instrumentName),
    ['Piano', 'Drum Kit', 'Violin']
  );

  const aiEvalCheck = evaluateCombinedAudioSources({
    sourceMode: 'ai_full_track',
    yamnetSegments: [makeSegment('Electric Guitar', 0, 180)], // Must NEVER bleed into AI mode
    aiSegments: completePlan.segments,
    currentTime: 5,
  });
  assert.deepEqual(aiEvalCheck.activeInstruments, ['Piano'], 'AI mode must strictly ignore YAMNet detections');

  // Press Play at t=1s: spawns ALL 3 planned roster characters upfront! Piano=playing, Drum Kit=idle, Violin=idle
  let aiConcertState = createInitialOrchestratorState('automatic', 'vidConcert', 'ai_full_track');
  const plannedMappings = completePlan.roster.map((r) => r.mapping);
  let concertStep = stepPerformanceOrchestrator({
    state: aiConcertState,
    mode: 'automatic',
    detectionSource: 'ai_full_track',
    videoId: 'vidConcert',
    currentTime: 1,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [makeSegment('Electric Guitar', 0, 180)],
    aiSegments: completePlan.segments,
    aiRoster: plannedMappings,
    gracePeriodMs: 2500, // Should be bypassed cleanly in AI mode
    nowMs: 1000,
  });
  aiConcertState = concertStep.nextState;
  assert.equal(concertStep.loadRequests.length, 3, 'All planned roster performers spawn upfront on AI Play');
  assert.equal(
    concertStep.loadRequests.find((r) => r.mapping.instrumentName === 'Piano')?.initialState,
    'playing'
  );
  assert.equal(
    concertStep.loadRequests.find((r) => r.mapping.instrumentName === 'Drum Kit')?.initialState,
    'idle'
  );
  assert.equal(
    concertStep.loadRequests.find((r) => r.mapping.instrumentName === 'Violin')?.initialState,
    'idle',
    'Late-entering Violin at 02:30 spawns upfront in idle state'
  );

  // Register loaded upfront cast
  aiConcertState = registerLoadedPerformer(aiConcertState, {
    instanceId: 'c-piano',
    characterId: 'hina-dress-with-piano-296',
    characterName: 'Hina (Dress) with Piano',
    filename: 'Hina_Dress_with_Piano.glb',
    origin: 'auto',
    nowMs: 1100,
    isPlayingNow: true,
  });
  aiConcertState = registerLoadedPerformer(aiConcertState, {
    instanceId: 'c-drum',
    characterId: 'natsu-band-no-weapon-183',
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    origin: 'auto',
    nowMs: 1100,
    isPlayingNow: false,
  });
  aiConcertState = registerLoadedPerformer(aiConcertState, {
    instanceId: 'c-violin',
    characterId: 'shiroko-violin-297',
    characterName: 'Shiroko (Violin)',
    filename: 'Shiroko_Violin.glb',
    origin: 'auto',
    nowMs: 1100,
    isPlayingNow: false,
  });

  // Forward Seek to 02:35 (155s): Piano becomes idle immediately (0ms AI grace), Drum Kit & Violin play, zero removals!
  concertStep = stepPerformanceOrchestrator({
    state: aiConcertState,
    mode: 'automatic',
    detectionSource: 'ai_full_track',
    videoId: 'vidConcert',
    currentTime: 155,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    aiSegments: completePlan.segments,
    aiRoster: plannedMappings,
    gracePeriodMs: 2500,
    nowMs: 2000,
  });
  aiConcertState = concertStep.nextState;
  assert.equal(concertStep.reconciledSeek, true);
  assert.equal(concertStep.removeInstanceIds.length, 0);
  assert.equal(concertStep.animationDirectives.find((d) => d.instanceId === 'c-piano')?.targetState, 'idle');
  assert.equal(concertStep.animationDirectives.find((d) => d.instanceId === 'c-drum')?.targetState, 'playing');
  assert.equal(concertStep.animationDirectives.find((d) => d.instanceId === 'c-violin')?.targetState, 'playing');

  // Backward Seek to t=5s: Piano resumes playing immediately, Drum Kit & Violin return to idle cleanly, zero removals!
  concertStep = stepPerformanceOrchestrator({
    state: aiConcertState,
    mode: 'automatic',
    detectionSource: 'ai_full_track',
    videoId: 'vidConcert',
    currentTime: 5,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    aiSegments: completePlan.segments,
    aiRoster: plannedMappings,
    gracePeriodMs: 2500,
    nowMs: 2500,
  });
  aiConcertState = concertStep.nextState;
  assert.equal(concertStep.removeInstanceIds.length, 0);
  assert.equal(concertStep.animationDirectives.find((d) => d.instanceId === 'c-piano')?.targetState, 'playing');
  assert.equal(concertStep.animationDirectives.find((d) => d.instanceId === 'c-drum')?.targetState, 'idle');
  assert.equal(concertStep.animationDirectives.find((d) => d.instanceId === 'c-violin')?.targetState, 'idle');

  // Pause: all staged characters stay on stage and settle immediately to idle
  concertStep = stepPerformanceOrchestrator({
    state: aiConcertState,
    mode: 'automatic',
    detectionSource: 'ai_full_track',
    videoId: 'vidConcert',
    currentTime: 5,
    isPlaying: false,
    isPaused: true,
    isStopped: false,
    segments: [],
    aiSegments: completePlan.segments,
    aiRoster: plannedMappings,
    gracePeriodMs: 2500,
    nowMs: 3000,
  });
  assert.equal(concertStep.removeInstanceIds.length, 0);
  assert.ok(concertStep.animationDirectives.every((d) => d.targetState === 'idle'));
  console.log('PASS [10] AI Full-Track Planner, incomplete rejection, upfront roster spawn & seek/pause sync.');

  // 11. Complete Hybrid Mode Removal & Seek / Strict Clip Verification
  const orchSrc = fs.readFileSync(path.resolve('src/components/CharacterViewer/performanceOrchestrator.ts'), 'utf8');
  const directorSrc = fs.readFileSync(path.resolve('src/components/CharacterViewer/AiConcertDirectorPanel.tsx'), 'utf8');
  for (const [name, src] of [
    ['performanceOrchestrator.ts', orchSrc],
    ['Character3DViewer.tsx', viewerSrc],
    ['SceneDebuggerPanel.tsx', debuggerSrc],
    ['AiConcertDirectorPanel.tsx', directorSrc],
  ]) {
    assert.ok(!src.includes("'hybrid'") && !src.includes('"hybrid"'), `${name} must not contain 'hybrid' mode`);
    assert.ok(!src.includes("'both'") && !src.includes('"both"'), `${name} must not contain 'both' audio source`);
    assert.ok(!src.includes('Y+AI'), `${name} must not contain 'Y+AI'`);
  }

  // Verify YAMNet seek jump clears grace_waiting hold immediately -> instant idle
  let seekState = registerLoadedPerformer(createInitialOrchestratorState('automatic', 'vidSeekY', 'yamnet'), {
    instanceId: 'inst-seek-violin',
    characterId: 'shiroko-violin-297',
    characterName: 'Shiroko (Violin)',
    filename: 'Shiroko_Violin.glb',
    origin: 'auto',
    nowMs: 1000,
    isPlayingNow: true,
  });
  seekState = stepPerformanceOrchestrator({
    state: seekState,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidSeekY',
    currentTime: 2,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [makeSegment('Violin', 0, 10)],
    gracePeriodMs: 2500,
    nowMs: 10100,
  }).nextState;
  const seekJumpStep = stepPerformanceOrchestrator({
    state: seekState,
    mode: 'automatic',
    detectionSource: 'yamnet',
    videoId: 'vidSeekY',
    currentTime: 45, // Big jump forward to silent section
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [makeSegment('Violin', 0, 10)],
    gracePeriodMs: 2500,
    nowMs: 10600,
  });
  assert.equal(seekJumpStep.reconciledSeek, true);
  assert.equal(seekJumpStep.removeInstanceIds.length, 0);
  assert.equal(
    seekJumpStep.animationDirectives.find((d) => d.instanceId === 'inst-seek-violin')?.targetState,
    'idle',
    'Seek to silent timestamp must immediately set playing performer to idle'
  );

  // Strict clip check: missing Exs_Saxophone MUST NOT silently fall back to Cafe_Reaction or clip[0]
  const saxMapping = getPerformerForInstrument('Saxophone')!;
  const missingSaxRes = resolvePerformerActionClip(
    [{ name: 'Cafe_Idle' }, { name: 'Cafe_Reaction' }, { name: 'Random_Dance' }],
    saxMapping,
    'playing'
  );
  assert.equal(missingSaxRes.clipName, null, 'Must never substitute Cafe_Reaction for missing playing clip');
  assert.equal(missingSaxRes.isMissingExpected, true);
  assert.ok(missingSaxRes.diagnosticMessage?.includes('Exs_Saxophone'));

  const validSaxRes = resolvePerformerActionClip(
    [{ name: 'Cafe_Idle' }, { name: 'Exs_Saxophone' }],
    saxMapping,
    'playing'
  );
  assert.equal(validSaxRes.clipName, 'Exs_Saxophone');
  assert.equal(validSaxRes.isMissingExpected, false);

  // Verify Hina (Dress) with Piano supports Exs_Cutin / Exs_Cutin_PianoLoop cleanly
  const hinaMapping = getPerformerForInstrument('Piano')!;
  const hinaSubclipRes = resolvePerformerActionClip(
    [{ name: 'Cafe_Idle' }, { name: 'Exs_Cutin' }, { name: 'Exs_Cutin_PianoLoop' }],
    hinaMapping,
    'playing'
  );
  assert.equal(hinaSubclipRes.clipName, 'Exs_Cutin');
  assert.equal(hinaSubclipRes.isMissingExpected, false);
  console.log('PASS [11] Hybrid mode completely removed; seek reconciliation & strict dedicated clip checks passed.');

  console.log('\nALL ORCHESTRATOR & INTEGRATION CHECKS PASSED CLEANLY!');
}

run();
