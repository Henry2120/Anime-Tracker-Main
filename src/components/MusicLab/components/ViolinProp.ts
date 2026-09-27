import * as THREE from 'three';

/**
 * Procedural Stylized Anime Violin & Bow Prop
 * Constructed with a realistic extruded violin body outline (Lower Bout, C-Bout Waist, Upper Bout),
 * arched soundboard, authentic F-holes, carved scroll/pegbox, bridge, tailpiece, chin rest, and strings.
 */

/**
 * Creates a procedurally modeled anime violin with authentic silhouette and reference anchors.
 * Scale: ~0.60m total length (standard 4/4 violin proportion).
 * Local Coordinates:
 *   +Y: Longitudinal axis (Tailpiece to Scroll)
 *   +Z: Front soundboard / Strings face +Z
 *   +X: Character's Left (when mounted in front of chest)
 */
export function createViolinProp(): THREE.Group {
  const violin = new THREE.Group();
  violin.name = 'ViolinRoot';

  // --- Materials ---
  const bodyWoodMat = new THREE.MeshStandardMaterial({
    color: 0x943f1e, // Warm rich varnished flamed maple/spruce
    roughness: 0.32,
    metalness: 0.05,
    name: 'ViolinVarnish',
  });

  const bodyRibMat = new THREE.MeshStandardMaterial({
    color: 0x5a230e, // Darker ribs and purfling edge
    roughness: 0.4,
    metalness: 0.05,
    name: 'ViolinRibs',
  });

  const ebonyMat = new THREE.MeshStandardMaterial({
    color: 0x16151a, // Polished ebony
    roughness: 0.22,
    metalness: 0.08,
    name: 'ViolinEbony',
  });

  const mapleMat = new THREE.MeshStandardMaterial({
    color: 0xd6aa7c, // Natural maple wood for bridge and neck
    roughness: 0.55,
    metalness: 0.0,
    name: 'ViolinMaple',
  });

  // High-visibility metallic silver strings
  const stringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.15,
    metalness: 0.9,
    name: 'ViolinStrings',
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Fine tuners
    roughness: 0.3,
    metalness: 0.85,
    name: 'ViolinGold',
  });

  // --- 1. Violin Body Silhouette (Extruded Shape with Upper Bout, C-Bouts, Lower Bout) ---
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'Body';

  const violinShape = new THREE.Shape();
  // Start at bottom center
  violinShape.moveTo(0, -0.175);
  // Right lower bout
  violinShape.bezierCurveTo(0.065, -0.175, 0.105, -0.145, 0.105, -0.095);
  violinShape.bezierCurveTo(0.105, -0.055, 0.096, -0.038, 0.098, -0.032); // Lower corner
  // Right C-bout (inward waist curve)
  violinShape.bezierCurveTo(0.062, -0.015, 0.060, 0.015, 0.082, 0.048); // Upper corner
  // Right upper bout
  violinShape.bezierCurveTo(0.085, 0.065, 0.084, 0.115, 0.055, 0.155);
  violinShape.bezierCurveTo(0.035, 0.175, 0.015, 0.180, 0, 0.180); // Top center
  // Left upper bout
  violinShape.bezierCurveTo(-0.015, 0.180, -0.035, 0.175, -0.055, 0.155);
  violinShape.bezierCurveTo(-0.084, 0.115, -0.085, 0.065, -0.082, 0.048); // Left upper corner
  // Left C-bout (inward waist curve)
  violinShape.bezierCurveTo(-0.060, 0.015, -0.062, -0.015, -0.098, -0.032); // Left lower corner
  // Left lower bout
  violinShape.bezierCurveTo(-0.096, -0.038, -0.105, -0.055, -0.105, -0.095);
  violinShape.bezierCurveTo(-0.105, -0.145, -0.065, -0.175, 0, -0.175);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    steps: 1,
    depth: 0.034,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelOffset: 0,
    bevelSegments: 3,
  };

  const bodyGeo = new THREE.ExtrudeGeometry(violinShape, extrudeSettings);
  // Center body depth so soundboard is at +Z and back is at -Z
  bodyGeo.translate(0, 0, -0.017);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyWoodMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyGroup.add(bodyMesh);

  // Soundboard arch plate (subtle convex curve on front)
  const soundboardArchGeo = new THREE.SphereGeometry(0.13, 16, 16);
  soundboardArchGeo.scale(0.68, 1.45, 0.12);
  const soundboardArch = new THREE.Mesh(soundboardArchGeo, bodyWoodMat);
  soundboardArch.position.set(0, 0.005, 0.016);
  soundboardArch.castShadow = true;
  bodyGroup.add(soundboardArch);

  // --- Authentic F-Holes on Soundboard ---
  const createFHole = (isLeft: boolean) => {
    const fGroup = new THREE.Group();
    const sign = isLeft ? -1 : 1;

    // Curved main stem
    const stemGeo = new THREE.TorusGeometry(0.035, 0.0028, 8, 18, Math.PI * 0.78);
    const stem = new THREE.Mesh(stemGeo, ebonyMat);
    stem.rotation.set(0, 0, sign * 0.25);
    fGroup.add(stem);

    // Upper circular eye
    const upperEyeGeo = new THREE.SphereGeometry(0.0035, 8, 8);
    const upperEye = new THREE.Mesh(upperEyeGeo, ebonyMat);
    upperEye.position.set(sign * 0.008, 0.026, 0.001);
    fGroup.add(upperEye);

    // Lower circular eye
    const lowerEyeGeo = new THREE.SphereGeometry(0.0045, 8, 8);
    const lowerEye = new THREE.Mesh(lowerEyeGeo, ebonyMat);
    lowerEye.position.set(-sign * 0.006, -0.026, 0.001);
    fGroup.add(lowerEye);

    // Center nick
    const nickGeo = new THREE.BoxGeometry(0.004, 0.002, 0.002);
    const nick = new THREE.Mesh(nickGeo, ebonyMat);
    nick.position.set(sign * 0.005, 0.0, 0.001);
    fGroup.add(nick);

    fGroup.position.set(sign * 0.038, 0.005, 0.026);
    return fGroup;
  };

  bodyGroup.add(createFHole(true));
  bodyGroup.add(createFHole(false));

  violin.add(bodyGroup);

  // --- 2. Narrow Maple Neck ---
  const neckGroup = new THREE.Group();
  neckGroup.name = 'Neck';

  const neckGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.16, 12);
  const neckMesh = new THREE.Mesh(neckGeo, mapleMat);
  neckMesh.position.set(0, 0.24, -0.004);
  neckMesh.castShadow = true;
  neckGroup.add(neckMesh);

  violin.add(neckGroup);

  // --- 3. Long Ebony Fingerboard ---
  const fingerboardGroup = new THREE.Group();
  fingerboardGroup.name = 'Fingerboard';

  const fbGeo = new THREE.BoxGeometry(0.024, 0.27, 0.008);
  const fbMesh = new THREE.Mesh(fbGeo, ebonyMat);
  fbMesh.position.set(0, 0.185, 0.028);
  fbMesh.castShadow = true;
  fingerboardGroup.add(fbMesh);

  violin.add(fingerboardGroup);

  // --- 4. Pegbox & Carved Scroll ---
  const scrollGroup = new THREE.Group();
  scrollGroup.name = 'Scroll';

  // Pegbox hollow housing
  const pegboxGeo = new THREE.BoxGeometry(0.022, 0.07, 0.026);
  const pegboxMesh = new THREE.Mesh(pegboxGeo, bodyWoodMat);
  pegboxMesh.position.set(0, 0.345, 0.004);
  pegboxMesh.castShadow = true;
  scrollGroup.add(pegboxMesh);

  // Carved Volute/Scroll (Layered spirals for recognizable violin scroll head)
  const outerSpiralGeo = new THREE.TorusGeometry(0.017, 0.007, 8, 24);
  const outerSpiral = new THREE.Mesh(outerSpiralGeo, bodyWoodMat);
  outerSpiral.position.set(0, 0.385, -0.006);
  outerSpiral.rotation.y = Math.PI / 2;
  outerSpiral.castShadow = true;
  scrollGroup.add(outerSpiral);

  const innerVoluteGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.024, 16);
  const innerVolute = new THREE.Mesh(innerVoluteGeo, bodyWoodMat);
  innerVolute.position.set(0, 0.385, -0.006);
  innerVolute.rotation.z = Math.PI / 2;
  innerVolute.castShadow = true;
  scrollGroup.add(innerVolute);

  // --- 5. Four Tuning Pegs (2 Left, 2 Right) ---
  const pegStemGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.048, 8);
  const pegHeadGeo = new THREE.SphereGeometry(0.0065, 8, 8);
  pegHeadGeo.scale(1.0, 0.45, 1.0);

  const pegPositions = [
    { y: 0.33, z: 0.008, left: true },
    { y: 0.35, z: -0.004, left: true },
    { y: 0.34, z: 0.008, left: false },
    { y: 0.36, z: -0.004, left: false },
  ];

  pegPositions.forEach((pos, idx) => {
    const peg = new THREE.Group();
    peg.name = `TuningPeg_${idx + 1}`;

    const stem = new THREE.Mesh(pegStemGeo, ebonyMat);
    stem.rotation.z = Math.PI / 2;
    peg.add(stem);

    const head = new THREE.Mesh(pegHeadGeo, ebonyMat);
    head.position.x = pos.left ? -0.026 : 0.026;
    peg.add(head);

    peg.position.set(0, pos.y, pos.z);
    scrollGroup.add(peg);
  });

  violin.add(scrollGroup);

  // --- 6. Curved Maple Bridge (Supporting 4 strings) ---
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'Bridge';

  const bridgeGeo = new THREE.BoxGeometry(0.036, 0.028, 0.005);
  const bridgeMesh = new THREE.Mesh(bridgeGeo, mapleMat);
  bridgeMesh.position.set(0, 0.012, 0.038);
  bridgeMesh.castShadow = true;
  bridgeGroup.add(bridgeMesh);

  violin.add(bridgeGroup);

  // --- 7. Tailpiece with Fine Tuners ---
  const tailpieceGroup = new THREE.Group();
  tailpieceGroup.name = 'Tailpiece';

  const tpGeo = new THREE.ConeGeometry(0.018, 0.115, 4);
  tpGeo.scale(1.0, 1.0, 0.35);
  const tpMesh = new THREE.Mesh(tpGeo, ebonyMat);
  tpMesh.position.set(0, -0.125, 0.03);
  tpMesh.rotation.z = Math.PI;
  tpMesh.castShadow = true;
  tailpieceGroup.add(tpMesh);

  // Fine tuner adjustment screws
  for (let i = 0; i < 4; i++) {
    const tunerGeo = new THREE.SphereGeometry(0.0024, 6, 6);
    const tuner = new THREE.Mesh(tunerGeo, goldMat);
    tuner.position.set((i - 1.5) * 0.0065, -0.08, 0.034);
    tailpieceGroup.add(tuner);
  }

  violin.add(tailpieceGroup);

  // --- 8. Ebony Chin Rest (Mounted over lower-left bout) ---
  const chinRestGroup = new THREE.Group();
  chinRestGroup.name = 'ChinRest';

  const chinRestGeo = new THREE.SphereGeometry(0.034, 14, 14);
  chinRestGeo.scale(1.15, 0.65, 0.28);
  const chinRestMesh = new THREE.Mesh(chinRestGeo, ebonyMat);
  chinRestMesh.position.set(-0.048, -0.155, 0.035);
  chinRestMesh.rotation.z = 0.22;
  chinRestMesh.castShadow = true;
  chinRestGroup.add(chinRestMesh);

  violin.add(chinRestGroup);

  // --- 9. Four Continuous Strings (G, D, A, E) ---
  const stringsGroup = new THREE.Group();
  stringsGroup.name = 'Strings';

  const stringOffsets = [-0.0085, -0.0028, 0.0028, 0.0085];
  stringOffsets.forEach((offset, idx) => {
    // Slender, visible metallic strings
    const strGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 0.46, 6);
    const strMesh = new THREE.Mesh(strGeo, stringMat);
    strMesh.position.set(offset * 0.72, 0.105, 0.042);
    strMesh.rotation.x = -0.014;
    strMesh.name = `String_${['G', 'D', 'A', 'E'][idx]}`;
    stringsGroup.add(strMesh);
  });

  violin.add(stringsGroup);

  // --- 10. Reference Anchors (For Hand IK and Bow Contact) ---
  const bowContactPoint = new THREE.Object3D();
  bowContactPoint.name = 'BowContactPoint';
  bowContactPoint.position.set(0, 0.045, 0.045); // Over strings between bridge & fingerboard
  violin.add(bowContactPoint);

  const violinNeckTarget = new THREE.Object3D();
  violinNeckTarget.name = 'ViolinNeckTarget';
  violinNeckTarget.position.set(0, 0.205, 0.016); // Playable neck holding zone for left hand
  violin.add(violinNeckTarget);

  const chinRestTarget = new THREE.Object3D();
  chinRestTarget.name = 'ChinRestTarget';
  chinRestTarget.position.set(-0.048, -0.155, 0.045);
  violin.add(chinRestTarget);

  return violin;
}

/**
 * Creates a procedurally modeled violin bow.
 * Length: ~0.72m.
 * Long axis: Local Y (frog at -0.32, tip at +0.35).
 * Hair ribbon: Positioned at local z = -0.014 facing -Z towards the violin strings.
 */
export function createBowProp(): THREE.Group {
  const bow = new THREE.Group();
  bow.name = 'BowRoot';

  const pernambucoWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5a2d18, // Rich reddish-brown Pernambuco wood
    roughness: 0.3,
    metalness: 0.05,
    name: 'BowWood',
  });

  const horsehairMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.0,
    name: 'BowHorsehair',
  });

  const frogEbonyMat = new THREE.MeshStandardMaterial({
    color: 0x151419,
    roughness: 0.3,
    metalness: 0.1,
    name: 'BowFrog',
  });

  const silverMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8d8,
    roughness: 0.2,
    metalness: 0.9,
    name: 'BowSilver',
  });

  const tipBoneMat = new THREE.MeshStandardMaterial({
    color: 0xf8f6f0,
    roughness: 0.4,
    metalness: 0.0,
    name: 'BowTipBone',
  });

  // --- 1. Stick (Gentle camber curve along Y axis) ---
  const stickLength = 0.72;
  const stickGeo = new THREE.CylinderGeometry(0.0038, 0.0052, stickLength, 8);
  const stickMesh = new THREE.Mesh(stickGeo, pernambucoWoodMat);
  stickMesh.position.set(0, 0, 0);
  stickMesh.castShadow = true;
  bow.add(stickMesh);

  // --- 2. Horsehair Ribbon (Contacts strings at -Z) ---
  const hairGeo = new THREE.BoxGeometry(0.007, stickLength - 0.04, 0.002);
  const hairMesh = new THREE.Mesh(hairGeo, horsehairMat);
  hairMesh.position.set(0, 0.015, -0.014);
  hairMesh.name = 'HairRibbon';
  bow.add(hairMesh);

  // --- 3. Frog (Handle end at negative Y) ---
  const frogGroup = new THREE.Group();
  frogGroup.name = 'Frog';

  const frogBodyGeo = new THREE.BoxGeometry(0.01, 0.05, 0.018);
  const frogBody = new THREE.Mesh(frogBodyGeo, frogEbonyMat);
  frogBody.position.set(0, -stickLength / 2 + 0.035, -0.008);
  frogBody.castShadow = true;
  frogGroup.add(frogBody);

  // Silver Ferrule
  const ferruleGeo = new THREE.BoxGeometry(0.0105, 0.012, 0.0185);
  const ferrule = new THREE.Mesh(ferruleGeo, silverMat);
  ferrule.position.set(0, -stickLength / 2 + 0.055, -0.008);
  frogGroup.add(ferrule);

  // Silver Button / Screw at base
  const buttonGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 8);
  const button = new THREE.Mesh(buttonGeo, silverMat);
  button.position.set(0, -stickLength / 2 - 0.005, 0);
  frogGroup.add(button);

  bow.add(frogGroup);

  // --- 4. Winding / Leather Grip ---
  const gripGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.045, 8);
  const gripMesh = new THREE.Mesh(gripGeo, frogEbonyMat);
  gripMesh.position.set(0, -stickLength / 2 + 0.085, 0);
  bow.add(gripMesh);

  // --- 5. Tip / Head ---
  const tipGroup = new THREE.Group();
  tipGroup.name = 'Tip';

  const tipGeo = new THREE.ConeGeometry(0.007, 0.025, 4);
  const tipMesh = new THREE.Mesh(tipGeo, tipBoneMat);
  tipMesh.position.set(0, stickLength / 2 - 0.005, -0.007);
  tipMesh.rotation.x = -Math.PI / 4;
  tipMesh.castShadow = true;
  tipGroup.add(tipMesh);

  bow.add(tipGroup);

  // --- Reference Anchors on Bow ---
  const bowGripPoint = new THREE.Object3D();
  bowGripPoint.name = 'BowGripPoint';
  bowGripPoint.position.set(0, -stickLength / 2 + 0.06, 0); // Where right hand fingers grasp frog
  bow.add(bowGripPoint);

  return bow;
}

/**
 * Clean disposal helper for violin and bow props.
 */
export function disposePropHierarchy(group: THREE.Object3D) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
  });
}
