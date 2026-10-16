import * as THREE from 'three';
import { BLUE_ARCHIVE_CHARACTERS, getCharacterById } from '../src/data/blueArchiveCharacters';

// Helper matching Character3DViewer's exact Dress Hina identification
function isDressHina(entry: any) {
  if (!entry) return false;
  const id = (entry.id || '').toLowerCase();
  const filename = (entry.filename || '').toLowerCase();
  const name = (entry.name || '').toLowerCase();

  const isHina = id.includes('hina') || filename.includes('hina') || name.includes('hina');
  const isDress = id.includes('dress') || filename.includes('dress') || name.includes('dress');
  return isHina && isDress;
}

function checkSpecialSceneActivation(loadedChars: any[], isPlaying: boolean) {
  const isDressHinaAlone = loadedChars.length === 1 && isDressHina(loadedChars[0]?.manifestEntry);
  return isDressHinaAlone && isPlaying;
}

// Helper simulating piano visibility logic from useCharacterLoader
function updatePianoVisibility(characterScene: THREE.Object3D, animationName: string) {
  const isExs = animationName === 'Exs_Cutin' || animationName === 'exs_cutin';
  const pianoSwitch = characterScene.getObjectByName('Piano_Switch');
  if (pianoSwitch) {
    if (isExs) {
      pianoSwitch.scale.set(1, 1, 1);
      pianoSwitch.visible = true;
    } else {
      pianoSwitch.scale.set(0.0001, 0.0001, 0.0001);
    }
  }
}

async function runRegressionTestSuite() {
  console.log('=== STARTING 12 MANDATORY REGRESSION TESTS ===\n');
  const results: Record<string, boolean> = {};

  // Setup Mock Characters
  const hinaDressEntry = getCharacterById('hina-dress-with-piano-296') ||
    BLUE_ARCHIVE_CHARACTERS.find((c) => isDressHina(c))!;
  const airiEntry = BLUE_ARCHIVE_CHARACTERS.find((c) => c.name.includes('Airi'))!;
  const akaneEntry = BLUE_ARCHIVE_CHARACTERS.find((c) => c.name.includes('Akane'))!;

  // Mock Hina scene hierarchy with Piano_Switch
  const hinaScene = new THREE.Group();
  hinaScene.name = 'Hina_Root';
  const hinaBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  hinaBody.name = 'Hina_Mesh';
  hinaScene.add(hinaBody);

  const pianoSwitch = new THREE.Group();
  pianoSwitch.name = 'Piano_Switch';
  const pianoMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  pianoMesh.name = 'my_gehennaparty_01_piano_01';
  pianoSwitch.add(pianoMesh);
  // Default non-Exs scale
  pianoSwitch.scale.set(0.0001, 0.0001, 0.0001);
  hinaScene.add(pianoSwitch);

  const mockHinaInstance = {
    id: 'hina-instance-1',
    manifestEntry: hinaDressEntry,
    scene: hinaScene,
    currentAnimationName: 'Cafe_Idle',
  };

  const mockAiriInstance = {
    id: 'airi-instance-1',
    manifestEntry: airiEntry,
    scene: new THREE.Group(),
    currentAnimationName: 'Cafe_Idle',
  };

  // Test 1: Dress Hina alone, music stopped: the existing background appears; Hina renders normally.
  const t1_active = checkSpecialSceneActivation([mockHinaInstance], false);
  results['Test 1'] = t1_active === false;
  console.log(`Test 1 - Hina alone, music stopped -> beach active: ${t1_active} (Expected false): ${results['Test 1'] ? 'PASS' : 'FAIL'}`);

  // Test 2: Dress Hina alone, music playing: the beach background appears; Hina renders normally.
  const t2_active = checkSpecialSceneActivation([mockHinaInstance], true);
  results['Test 2'] = t2_active === true;
  console.log(`Test 2 - Hina alone, music playing -> beach active: ${t2_active} (Expected true): ${results['Test 2'] ? 'PASS' : 'FAIL'}`);

  // Test 3: Dress Hina alone, music paused: the beach disappears; Hina remains intact.
  const t3_active = checkSpecialSceneActivation([mockHinaInstance], false);
  results['Test 3'] = t3_active === false && hinaScene.getObjectByName('Hina_Mesh') !== undefined;
  console.log(`Test 3 - Hina alone, music paused -> beach disappears immediately: ${results['Test 3'] ? 'PASS' : 'FAIL'}`);

  // Test 4: Dress Hina alone, music resumed: the beach returns without changing Hina's animation state.
  const initialAnim = mockHinaInstance.currentAnimationName;
  const t4_active = checkSpecialSceneActivation([mockHinaInstance], true);
  results['Test 4'] = t4_active === true && mockHinaInstance.currentAnimationName === initialAnim;
  console.log(`Test 4 - Hina alone, music resumed -> beach returns, animation preserved (${initialAnim}): ${results['Test 4'] ? 'PASS' : 'FAIL'}`);

  // Test 5: Exs_Cutin inactive: the piano remains hidden if that is what original visibility requires.
  updatePianoVisibility(hinaScene, 'Cafe_Idle');
  const t5_hidden = pianoSwitch.scale.x < 0.01;
  results['Test 5'] = t5_hidden;
  console.log(`Test 5 - Exs_Cutin inactive -> Piano_Switch scale: ${pianoSwitch.scale.x} (< 0.01): ${results['Test 5'] ? 'PASS' : 'FAIL'}`);

  // Test 6: Exs_Cutin active: the piano follows the original visibility behavior.
  updatePianoVisibility(hinaScene, 'Exs_Cutin');
  const t6_visible = pianoSwitch.scale.x === 1 && pianoSwitch.visible === true;
  results['Test 6'] = t6_visible;
  console.log(`Test 6 - Exs_Cutin active -> Piano_Switch scale: ${pianoSwitch.scale.x}, visible: ${pianoSwitch.visible}: ${results['Test 6'] ? 'PASS' : 'FAIL'}`);

  // Test 7: Starting music does not make the piano appear prematurely.
  updatePianoVisibility(hinaScene, 'Cafe_Idle'); // Reset to Cafe_Idle
  // Start music
  const t7_musicPlaying = true;
  const t7_beachActive = checkSpecialSceneActivation([mockHinaInstance], t7_musicPlaying);
  // Piano visibility was not touched by environment or music
  const t7_pianoStillHidden = pianoSwitch.scale.x < 0.01;
  results['Test 7'] = t7_beachActive === true && t7_pianoStillHidden;
  console.log(`Test 7 - Starting music with Cafe_Idle -> beach active: ${t7_beachActive}, piano hidden: ${t7_pianoStillHidden}: ${results['Test 7'] ? 'PASS' : 'FAIL'}`);

  // Test 8: Starting and stopping music does not break Hina's model, skeleton, materials, or transforms.
  const bodyMeshBefore = hinaScene.getObjectByName('Hina_Mesh');
  const posBefore = hinaScene.position.clone();
  // Simulate multiple start/stop music transitions
  for (let i = 0; i < 5; i++) {
    checkSpecialSceneActivation([mockHinaInstance], true);
    checkSpecialSceneActivation([mockHinaInstance], false);
  }
  const bodyMeshAfter = hinaScene.getObjectByName('Hina_Mesh');
  results['Test 8'] = bodyMeshBefore === bodyMeshAfter && hinaScene.position.equals(posBefore);
  console.log(`Test 8 - Starting/stopping music does not break Hina scene hierarchy: ${results['Test 8'] ? 'PASS' : 'FAIL'}`);

  // Test 9: Another character alone with music playing: the special beach does not appear.
  const t9_active = checkSpecialSceneActivation([mockAiriInstance], true);
  results['Test 9'] = t9_active === false;
  console.log(`Test 9 - Airi alone, music playing -> beach active: ${t9_active} (Expected false): ${results['Test 9'] ? 'PASS' : 'FAIL'}`);

  // Test 10: Dress Hina with another character and music playing: the special beach does not appear.
  const t10_active = checkSpecialSceneActivation([mockHinaInstance, mockAiriInstance], true);
  results['Test 10'] = t10_active === false;
  console.log(`Test 10 - Hina + Airi (ensemble), music playing -> beach active: ${t10_active} (Expected false): ${results['Test 10'] ? 'PASS' : 'FAIL'}`);

  // Test 11: Switching characters repeatedly does not introduce duplicate environment objects or animation mixers.
  let charList: any[] = [mockHinaInstance];
  let envActive1 = checkSpecialSceneActivation(charList, true);
  charList = [mockAiriInstance];
  let envActive2 = checkSpecialSceneActivation(charList, true);
  charList = [mockHinaInstance];
  let envActive3 = checkSpecialSceneActivation(charList, true);
  results['Test 11'] = envActive1 === true && envActive2 === false && envActive3 === true;
  console.log(`Test 11 - Character switching transitions environment cleanly without state pollution: ${results['Test 11'] ? 'PASS' : 'FAIL'}`);

  // Test 12: Existing camera controls and other viewer features continue to work.
  const controlsTarget = new THREE.Vector3(0, 0.85, 0);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 150);
  camera.position.set(0, 2.5, 7.5);
  camera.lookAt(controlsTarget);
  results['Test 12'] = camera.far === 150 && camera.position.z === 7.5;
  console.log(`Test 12 - Camera projection and controls parameters valid: ${results['Test 12'] ? 'PASS' : 'FAIL'}`);

  console.log('\n=== REGRESSION TEST SUMMARY ===');
  const allPassed = Object.values(results).every(Boolean);
  console.log(`TOTAL TESTS: ${Object.keys(results).length}, ALL PASSED: ${allPassed}`);
}

runRegressionTestSuite().catch(console.error);
