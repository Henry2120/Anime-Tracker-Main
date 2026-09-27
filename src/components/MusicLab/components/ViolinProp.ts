import * as THREE from 'three';

/**
 * Procedural Stylized Anime Violin & Bow Prop
 * Constructed from modular, named Three.js sub-meshes with lightweight geometries.
 */

export interface ViolinPropGroup extends THREE.Group {
  userData: {
    isViolinProp: true;
    bodyMesh?: THREE.Mesh;
    neckMesh?: THREE.Mesh;
    fingerboardMesh?: THREE.Mesh;
    bridgeMesh?: THREE.Mesh;
    bowMesh?: THREE.Group;
    stringsMesh?: THREE.Group;
    contactPoint?: THREE.Vector3; // Point where bow meets strings
  };
}

/**
 * Creates a procedurally modeled anime violin.
 * Scale: ~0.60m length (standard 4/4 violin proportion).
 */
export function createViolinProp(): THREE.Group {
  const violin = new THREE.Group();
  violin.name = 'ViolinRoot';

  // --- Materials ---
  const bodyWoodMat = new THREE.MeshStandardMaterial({
    color: 0x8a3a1b, // Warm varnished spruce/maple
    roughness: 0.35,
    metalness: 0.05,
    name: 'ViolinVarnish',
  });

  const bodyRimMat = new THREE.MeshStandardMaterial({
    color: 0x4a1e0e, // Darker purfling edge and ribs
    roughness: 0.4,
    metalness: 0.05,
    name: 'ViolinRibs',
  });

  const ebonyMat = new THREE.MeshStandardMaterial({
    color: 0x18171c, // Polished ebony
    roughness: 0.25,
    metalness: 0.1,
    name: 'ViolinEbony',
  });

  const mapleMat = new THREE.MeshStandardMaterial({
    color: 0xd2a679, // Natural maple wood for bridge and neck
    roughness: 0.5,
    metalness: 0.0,
    name: 'ViolinMaple',
  });

  const stringMat = new THREE.MeshStandardMaterial({
    color: 0xdedede, // Metallic silver / steel strings
    roughness: 0.2,
    metalness: 0.85,
    name: 'ViolinStrings',
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Gold tuners / peg rings
    roughness: 0.3,
    metalness: 0.8,
    name: 'ViolinGold',
  });

  // --- 1. Violin Body (Lower Bout, Waist, Upper Bout) ---
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'Body';

  // Lower Bout (Wider base)
  const lowerBoutGeo = new THREE.CylinderGeometry(0.105, 0.11, 0.045, 24);
  lowerBoutGeo.scale(1.0, 1.0, 0.75);
  const lowerBout = new THREE.Mesh(lowerBoutGeo, bodyWoodMat);
  lowerBout.position.set(0, -0.1, 0);
  lowerBout.castShadow = true;
  lowerBout.receiveShadow = true;
  bodyGroup.add(lowerBout);

  // Upper Bout (Narrower top)
  const upperBoutGeo = new THREE.CylinderGeometry(0.082, 0.085, 0.045, 24);
  upperBoutGeo.scale(1.0, 1.0, 0.72);
  const upperBout = new THREE.Mesh(upperBoutGeo, bodyWoodMat);
  upperBout.position.set(0, 0.08, 0);
  upperBout.castShadow = true;
  upperBout.receiveShadow = true;
  bodyGroup.add(upperBout);

  // Waist (Narrow C-bout center)
  const waistGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.046, 24);
  waistGeo.scale(0.85, 1.0, 0.7);
  const waist = new THREE.Mesh(waistGeo, bodyWoodMat);
  waist.position.set(0, -0.01, 0);
  waist.castShadow = true;
  waist.receiveShadow = true;
  bodyGroup.add(waist);

  // Front soundboard arch (Curved plate top)
  const frontPlateGeo = new THREE.SphereGeometry(0.125, 16, 16);
  frontPlateGeo.scale(0.7, 1.6, 0.15);
  const frontPlate = new THREE.Mesh(frontPlateGeo, bodyWoodMat);
  frontPlate.position.set(0, -0.01, 0.02);
  frontPlate.castShadow = true;
  bodyGroup.add(frontPlate);

  // F-Hole accents on soundboard
  const fHoleGeo = new THREE.TorusGeometry(0.032, 0.003, 8, 16, Math.PI * 0.85);
  const leftFHole = new THREE.Mesh(fHoleGeo, ebonyMat);
  leftFHole.position.set(-0.038, 0.0, 0.035);
  leftFHole.rotation.set(0, 0, -0.2);
  bodyGroup.add(leftFHole);

  const rightFHole = new THREE.Mesh(fHoleGeo, ebonyMat);
  rightFHole.position.set(0.038, 0.0, 0.035);
  rightFHole.rotation.set(0, 0, Math.PI + 0.2);
  bodyGroup.add(rightFHole);

  violin.add(bodyGroup);

  // --- 2. Neck ---
  const neckGroup = new THREE.Group();
  neckGroup.name = 'Neck';

  const neckGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.17, 12);
  const neckMesh = new THREE.Mesh(neckGeo, mapleMat);
  neckMesh.position.set(0, 0.23, -0.005);
  neckMesh.castShadow = true;
  neckGroup.add(neckMesh);

  violin.add(neckGroup);

  // --- 3. Fingerboard ---
  const fingerboardGroup = new THREE.Group();
  fingerboardGroup.name = 'Fingerboard';

  const fbGeo = new THREE.BoxGeometry(0.026, 0.25, 0.01);
  const fbMesh = new THREE.Mesh(fbGeo, ebonyMat);
  fbMesh.position.set(0, 0.18, 0.026);
  fbMesh.castShadow = true;
  fingerboardGroup.add(fbMesh);

  violin.add(fingerboardGroup);

  // --- 4. Scroll & Pegbox ---
  const scrollGroup = new THREE.Group();
  scrollGroup.name = 'Scroll';

  // Pegbox
  const pegboxGeo = new THREE.BoxGeometry(0.024, 0.065, 0.028);
  const pegboxMesh = new THREE.Mesh(pegboxGeo, bodyWoodMat);
  pegboxMesh.position.set(0, 0.335, 0.005);
  pegboxMesh.castShadow = true;
  scrollGroup.add(pegboxMesh);

  // Volute / Scroll spiral head
  const scrollSpiralGeo = new THREE.TorusGeometry(0.018, 0.009, 8, 20);
  const scrollSpiral = new THREE.Mesh(scrollSpiralGeo, bodyWoodMat);
  scrollSpiral.position.set(0, 0.375, -0.005);
  scrollSpiral.rotation.y = Math.PI / 2;
  scrollSpiral.castShadow = true;
  scrollGroup.add(scrollSpiral);

  // --- 5. Tuning Pegs (2 on left, 2 on right) ---
  const pegGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.05, 8);
  const pegHeadGeo = new THREE.SphereGeometry(0.007, 8, 8);
  pegHeadGeo.scale(1.0, 0.5, 1.0);

  const pegPositions = [
    { y: 0.32, z: 0.01, left: true },
    { y: 0.34, z: -0.005, left: true },
    { y: 0.33, z: 0.01, left: false },
    { y: 0.35, z: -0.005, left: false },
  ];

  pegPositions.forEach((pos, idx) => {
    const peg = new THREE.Group();
    peg.name = `TuningPeg_${idx + 1}`;
    const stem = new THREE.Mesh(pegGeo, ebonyMat);
    stem.rotation.z = Math.PI / 2;
    peg.add(stem);

    const head = new THREE.Mesh(pegHeadGeo, ebonyMat);
    head.position.x = pos.left ? -0.028 : 0.028;
    peg.add(head);

    peg.position.set(0, pos.y, pos.z);
    scrollGroup.add(peg);
  });

  violin.add(scrollGroup);

  // --- 6. Bridge ---
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'Bridge';

  const bridgeGeo = new THREE.BoxGeometry(0.038, 0.03, 0.006);
  const bridgeMesh = new THREE.Mesh(bridgeGeo, mapleMat);
  bridgeMesh.position.set(0, 0.01, 0.04);
  bridgeMesh.castShadow = true;
  bridgeGroup.add(bridgeMesh);

  violin.add(bridgeGroup);

  // --- 7. Tailpiece ---
  const tailpieceGroup = new THREE.Group();
  tailpieceGroup.name = 'Tailpiece';

  const tpGeo = new THREE.ConeGeometry(0.02, 0.11, 4);
  tpGeo.scale(1.0, 1.0, 0.4);
  const tpMesh = new THREE.Mesh(tpGeo, ebonyMat);
  tpMesh.position.set(0, -0.13, 0.032);
  tpMesh.rotation.z = Math.PI;
  tpMesh.castShadow = true;
  tailpieceGroup.add(tpMesh);

  // Fine tuner dots
  for (let i = 0; i < 4; i++) {
    const tunerGeo = new THREE.SphereGeometry(0.0025, 6, 6);
    const tuner = new THREE.Mesh(tunerGeo, goldMat);
    tuner.position.set((i - 1.5) * 0.007, -0.085, 0.036);
    tailpieceGroup.add(tuner);
  }

  violin.add(tailpieceGroup);

  // --- 8. Chin Rest ---
  const chinRestGroup = new THREE.Group();
  chinRestGroup.name = 'ChinRest';

  const chinRestGeo = new THREE.SphereGeometry(0.036, 12, 12);
  chinRestGeo.scale(1.1, 0.6, 0.3);
  const chinRestMesh = new THREE.Mesh(chinRestGeo, ebonyMat);
  chinRestMesh.position.set(-0.055, -0.165, 0.036);
  chinRestMesh.rotation.z = 0.25;
  chinRestMesh.castShadow = true;
  chinRestGroup.add(chinRestMesh);

  violin.add(chinRestGroup);

  // --- 9. Four Strings (G, D, A, E) ---
  const stringsGroup = new THREE.Group();
  stringsGroup.name = 'Strings';

  const stringOffsets = [-0.008, -0.0028, 0.0028, 0.008];
  stringOffsets.forEach((offset, idx) => {
    const strGeo = new THREE.CylinderGeometry(0.0007, 0.0007, 0.44, 4);
    const strMesh = new THREE.Mesh(strGeo, stringMat);
    strMesh.position.set(offset * 0.7, 0.1, 0.041);
    strMesh.rotation.x = -0.015; // Slopes slightly from bridge to nut
    strMesh.name = `String_${['G', 'D', 'A', 'E'][idx]}`;
    stringsGroup.add(strMesh);
  });

  violin.add(stringsGroup);

  return violin;
}

/**
 * Creates a procedurally modeled violin bow.
 * Length: ~0.74m (standard full-size bow).
 */
export function createBowProp(): THREE.Group {
  const bow = new THREE.Group();
  bow.name = 'BowRoot';

  const pernambucoWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5a2d18, // Rich reddish-brown Pernambuco / Brazilwood
    roughness: 0.3,
    metalness: 0.05,
    name: 'BowWood',
  });

  const horsehairMat = new THREE.MeshStandardMaterial({
    color: 0xf3ede2, // Creamy white horsehair
    roughness: 0.6,
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

  // --- 1. Stick (Gentle camber curve) ---
  const stickLength = 0.72;
  const stickGeo = new THREE.CylinderGeometry(0.004, 0.0055, stickLength, 8);
  const stickMesh = new THREE.Mesh(stickGeo, pernambucoWoodMat);
  stickMesh.position.set(0, 0, 0);
  stickMesh.castShadow = true;
  bow.add(stickMesh);

  // --- 2. Horsehair Ribbon ---
  const hairGeo = new THREE.BoxGeometry(0.006, stickLength - 0.04, 0.0015);
  const hairMesh = new THREE.Mesh(hairGeo, horsehairMat);
  hairMesh.position.set(0, 0.015, -0.014);
  hairMesh.name = 'HairRibbon';
  bow.add(hairMesh);

  // --- 3. Frog (Handle end where fingers rest) ---
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
  const gripGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.045, 8);
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
