import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INSTRUMENT_PERFORMER_REGISTRY,
  getPerformerForInstrument,
  isAssignableInstrument,
  resolvePerformerClipName,
  resolvePerformerMapping,
} from '../src/components/CharacterViewer/performerRegistry';
import {
  createInitialOrchestratorState,
  evaluateActiveAudioCategories,
  findDuplicateStagedPerformer,
  markPerformerLoadFailed,
  registerLoadedPerformer,
  removePerformerByInstanceId,
  stepPerformanceOrchestrator,
} from '../src/components/CharacterViewer/performanceOrchestrator';
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

  // 3. Mode A — Automatic: Spawn on active detection -> Play -> Drop to Idle -> Grace Wait -> Re-detect Cancels Grace -> Grace Expires Remove
  let state = createInitialOrchestratorState('automatic', 'vidA');
  const pianoSegments = [
    makeSegment('Piano', 0, 5),
    makeSegment('Piano', 7, 12),
  ];

  // Step 3a: t=1s playing -> requests Hina (Dress) with Piano
  let step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
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

  // Step 3d: t=5.5s (gap between Piano segments) -> transitions to idle & grace_waiting (deadline 5500 + 2500)
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
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
  assert.equal(step.removeInstanceIds.length, 0, 'Must NOT remove immediately before grace expires');
  assert.equal(step.animationDirectives[0]?.targetState, 'idle', 'Must transition to idle when silent');
  assert.equal(state.performers['inst:piano']?.lifecycle, 'grace_waiting');

  // Step 3e: t=7.2s (re-detected within 2.5s grace at now=7200 < 8000) -> cancels removal & plays again
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    videoId: 'vidA',
    currentTime: 7.2,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 7200,
  });
  state = step.nextState;
  assert.equal(step.removeInstanceIds.length, 0);
  assert.equal(state.performers['inst:piano']?.lifecycle, 'playing');
  assert.equal(state.performers['inst:piano']?.graceDeadlineMs, null);
  assert.equal(step.animationDirectives[0]?.targetState, 'playing');

  // Step 3f: t=13s -> grace starts at 13000; pause freezes grace countdown; resume + expire removes
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
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

  // Pause at 16000 -> freezes removal & keeps idle cleanly
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    videoId: 'vidA',
    currentTime: 13.0,
    isPlaying: false,
    isPaused: true,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 16000,
  });
  state = step.nextState;
  assert.equal(step.removeInstanceIds.length, 0, 'Pause must NOT auto-remove performer during grace');

  // Playing again past grace deadline (16500 >= 15500) -> cleanly removes
  step = stepPerformanceOrchestrator({
    state,
    mode: 'automatic',
    videoId: 'vidA',
    currentTime: 16.5,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: pianoSegments,
    gracePeriodMs: 2500,
    nowMs: 16500,
  });
  state = step.nextState;
  assert.deepEqual(step.removeInstanceIds, ['inst-hina-1'], 'Performer must be removed after grace expires');
  assert.equal(Object.keys(state.performers).length, 0);
  console.log('PASS [3] Mode A Automatic lifecycle (spawn -> play -> idle -> grace -> re-detect cancel -> pause freeze -> remove).');

  // 4. Configurable Grace Period 0s vs 5s (Scenario 11)
  let fastGraceState = registerLoadedPerformer(createInitialOrchestratorState('automatic', 'vidFast'), {
    instanceId: 'inst-drum-1',
    characterId: 'natsu-band-no-weapon-183',
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    origin: 'auto',
    nowMs: 1000,
    isPlayingNow: true,
  });
  const fastStep = stepPerformanceOrchestrator({
    state: fastGraceState,
    mode: 'automatic',
    videoId: 'vidFast',
    currentTime: 10,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 0,
    nowMs: 1100,
  });
  assert.deepEqual(fastStep.removeInstanceIds, ['inst-drum-1'], '0s grace removes immediately when inactive');

  let longGraceState = registerLoadedPerformer(createInitialOrchestratorState('automatic', 'vidLong'), {
    instanceId: 'inst-drum-2',
    characterId: 'natsu-band-no-weapon-183',
    characterName: 'Natsu (Band) (No Weapon)',
    filename: 'Natsu (Band) (No Weapon).glb',
    origin: 'auto',
    nowMs: 1000,
    isPlayingNow: true,
  });
  let longStep = stepPerformanceOrchestrator({
    state: longGraceState,
    mode: 'automatic',
    videoId: 'vidLong',
    currentTime: 10,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 5000,
    nowMs: 1100,
  });
  assert.equal(longStep.removeInstanceIds.length, 0);
  longStep = stepPerformanceOrchestrator({
    state: longStep.nextState,
    mode: 'automatic',
    videoId: 'vidLong',
    currentTime: 14,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 5000,
    nowMs: 5000,
  });
  assert.equal(longStep.removeInstanceIds.length, 0, '5s grace still holds at 3.9s elapsed');
  longStep = stepPerformanceOrchestrator({
    state: longStep.nextState,
    mode: 'automatic',
    videoId: 'vidLong',
    currentTime: 16,
    isPlaying: true,
    isPaused: false,
    isStopped: false,
    segments: [],
    gracePeriodMs: 5000,
    nowMs: 6200,
  });
  assert.deepEqual(longStep.removeInstanceIds, ['inst-drum-2'], '5s grace removes once 5s elapsed');
  console.log('PASS [4] Configurable grace period (0s immediate removal vs 5s hold).');

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

  // Verify Saori (Harp) fallback clip resolution (has Formation_Idle, no Cafe_Idle)
  const harpMapping = resolvePerformerMapping('saori-dress-harp');
  assert.ok(harpMapping);
  const harpIdleResolved = resolvePerformerClipName(
    [{ name: 'Formation_Idle' }, { name: 'Exs_Harp' }],
    'Cafe_Idle',
    harpMapping.idleFallbacks
  );
  assert.equal(harpIdleResolved, 'Formation_Idle', 'Must gracefully fall back to Formation_Idle when Cafe_Idle absent');

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

  console.log('\nALL ORCHESTRATOR & INTEGRATION CHECKS PASSED CLEANLY!');
}

run();
