const fs = require('fs');
const THREE = require('three');
const { GLTFExporter } = require('three/examples/jsm/exporters/GLTFExporter.js');

// Create cellist scene
const root = new THREE.Group();
root.name = 'Cellist_Character';

// Materials
const skinMat = new THREE.MeshStandardMaterial({ color: 0xFFDFC8, roughness: 0.6, name: 'AnimeSkin' });
const dressMat = new THREE.MeshStandardMaterial({ color: 0x1E1B4B, roughness: 0.4, name: 'ConcertDress' }); // Deep indigo dress
const trimMat = new THREE.MeshStandardMaterial({ color: 0xC7D2FE, roughness: 0.3, name: 'DressTrim' });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, name: 'AnimeHair' }); // Slate silver/blue hair
const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3, metalness: 0.1, name: 'CelloWood' }); // Rich acoustic warm wood
const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x271910, roughness: 0.2, name: 'Fingerboard' });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xD4AF37, roughness: 0.2, metalness: 0.8, name: 'CelloGold' });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.3, name: 'ConcertShoes' });

// Stool / Chair for seated cellist
const stoolGroup = new THREE.Group();
stoolGroup.name = 'Musician_Stool';
const seatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16), dressMat);
seatMesh.position.y = 0.52;
stoolGroup.add(seatMesh);
for (let i = 0; i < 4; i++) {
  const angle = (i * Math.PI) / 2 + Math.PI / 4;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 8), darkWoodMat);
  leg.position.set(Math.cos(angle) * 0.18, 0.26, Math.sin(angle) * 0.18);
  stoolGroup.add(leg);
}
root.add(stoolGroup);

// Cellist Body Group
const body = new THREE.Group();
body.name = 'Character_Body';
body.position.set(0, 0.52, 0); // seated at stool level

// Legs (bent for sitting with cello)
const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.48, 8), dressMat);
legL.name = 'Leg_L';
legL.position.set(-0.20, -0.22, 0.18);
legL.rotation.x = Math.PI / 4;
body.add(legL);

const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.48, 8), dressMat);
legR.name = 'Leg_R';
legR.position.set(0.20, -0.22, 0.18);
legR.rotation.x = Math.PI / 4;
body.add(legR);

// Shoes
const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.16), shoeMat);
shoeL.position.set(-0.20, -0.48, 0.32);
body.add(shoeL);
const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.16), shoeMat);
shoeR.position.set(0.20, -0.48, 0.32);
body.add(shoeR);

// Skirt
const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.45, 16), dressMat);
skirt.name = 'Skirt';
skirt.position.set(0, 0.05, 0.05);
skirt.rotation.x = 0.1;
body.add(skirt);

// Spine
const spine = new THREE.Group();
spine.name = 'Spine';
spine.position.set(0, 0.20, 0);

// Torso
const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.32, 12), dressMat);
torso.name = 'Torso';
torso.position.set(0, 0.16, 0);
spine.add(torso);

// Collar & Neck
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.04, 12), trimMat);
collar.position.set(0, 0.33, 0);
spine.add(collar);
const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), skinMat);
neck.position.set(0, 0.38, 0);
spine.add(neck);

// Head
const head = new THREE.Group();
head.name = 'Head';
head.position.set(0, 0.48, 0);
const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), skinMat);
face.name = 'Face';
face.scale.set(1, 1.1, 1.05);
head.add(face);

// Hair
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.142, 16, 16), hairMat);
hair.position.set(0, 0.02, -0.02);
head.add(hair);
const bangs = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 12), hairMat);
bangs.position.set(0, 0.08, 0.06);
bangs.rotation.x = -0.2;
head.add(bangs);
const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.40, 8), hairMat);
braid.position.set(-0.10, -0.15, -0.08);
braid.rotation.z = 0.15;
head.add(braid);
spine.add(head);

// Left Arm (Holding Cello Neck)
const armL = new THREE.Group();
armL.name = 'UpperArm_L';
armL.position.set(-0.18, 0.28, 0.04);
const upperL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.24, 8), dressMat);
upperL.position.set(0, -0.12, 0);
armL.add(upperL);
const forearmL = new THREE.Group();
forearmL.name = 'Forearm_L';
forearmL.position.set(0, -0.24, 0);
const lowerL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8), skinMat);
lowerL.position.set(0, -0.11, 0);
forearmL.add(lowerL);
const handL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), skinMat);
handL.name = 'Hand_L';
handL.position.set(0, -0.23, 0);
forearmL.add(handL);
armL.add(forearmL);
// Position arm toward cello neck
armL.rotation.set(0.6, 0.4, -0.5);
forearmL.rotation.set(0.7, -0.2, 0.4);
spine.add(armL);

// Right Arm (Bowing across strings)
const armR = new THREE.Group();
armR.name = 'UpperArm_R';
armR.position.set(0.18, 0.28, 0.04);
const upperR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.24, 8), dressMat);
upperR.position.set(0, -0.12, 0);
armR.add(upperR);
const forearmR = new THREE.Group();
forearmR.name = 'Forearm_R';
forearmR.position.set(0, -0.24, 0);
const lowerR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8), skinMat);
lowerR.position.set(0, -0.11, 0);
forearmR.add(lowerR);
const handR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), skinMat);
handR.name = 'Hand_R';
handR.position.set(0, -0.23, 0);
forearmR.add(handR);

// Cello Bow attached to right hand
const bow = new THREE.Group();
bow.name = 'Cello_Bow';
bow.position.set(0, -0.23, 0);
const bowStick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.68, 6), darkWoodMat);
bowStick.name = 'BowStick';
bowStick.rotation.z = Math.PI / 2;
bow.add(bowStick);
const bowHair = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.64, 4), trimMat);
bowHair.name = 'BowHair';
bowHair.position.set(0, -0.012, 0);
bowHair.rotation.z = Math.PI / 2;
bow.add(bowHair);
forearmR.add(bow);

armR.add(forearmR);
armR.rotation.set(0.5, -0.3, 0.4);
forearmR.rotation.set(0.8, 0.3, -0.4);
spine.add(armR);

body.add(spine);
root.add(body);

// Acoustic Cello Instrument (Placed between knees, resting on endpin)
const cello = new THREE.Group();
cello.name = 'Cello_Instrument';
// Cello rests against cellist's chest, angled backward ~25 degrees
cello.position.set(0, 0.58, 0.24);
cello.rotation.set(-0.35, 0.05, -0.08);

// Endpin extending to floor
const endpin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 8), goldMat);
endpin.position.set(0, -0.58, 0);
cello.add(endpin);

// Lower Bout
const lowerBout = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 16), woodMat);
lowerBout.name = 'Cello_LowerBout';
lowerBout.scale.set(1.1, 1, 0.55);
lowerBout.position.set(0, -0.16, 0);
cello.add(lowerBout);

// C-Bouts (waist)
const waist = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.20, 0.14), woodMat);
waist.position.set(0, 0.06, 0);
cello.add(waist);

// Upper Bout
const upperBout = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.30, 16), woodMat);
upperBout.name = 'Cello_UpperBout';
upperBout.scale.set(1.05, 1, 0.52);
upperBout.position.set(0, 0.24, 0);
cello.add(upperBout);

// Bridge
const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.02), goldMat);
bridge.name = 'Cello_Bridge';
bridge.position.set(0, 0.04, 0.09);
cello.add(bridge);

// Fingerboard & Neck
const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 8), woodMat);
neckMesh.name = 'Cello_Neck';
neckMesh.position.set(0, 0.56, 0.03);
cello.add(neckMesh);

const fingerboard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.015), darkWoodMat);
fingerboard.name = 'Fingerboard';
fingerboard.position.set(0, 0.46, 0.06);
cello.add(fingerboard);

// Scroll & Pegbox
const scroll = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), woodMat);
scroll.name = 'Cello_Scroll';
scroll.position.set(0, 0.82, 0.02);
cello.add(scroll);

root.add(cello);

// Create Keyframed Animations
// 1. IDLE Animation (gentle breathing & resting posture)
const idleTimes = [0, 1.5, 3.0];
const spineIdleRot = [
  0, 0, 0, 1,
  0.015, 0, 0, 0.9998,
  0, 0, 0, 1
];
const armRIdleRot = [
  0.5, -0.3, 0.4, 0.707,
  0.48, -0.28, 0.38, 0.73,
  0.5, -0.3, 0.4, 0.707
];
const bowIdlePos = [
  0, -0.23, 0,
  0, -0.235, 0.01,
  0, -0.23, 0
];

const idleTracks = [
  new THREE.QuaternionKeyframeTrack('Spine.quaternion', idleTimes, spineIdleRot),
  new THREE.QuaternionKeyframeTrack('UpperArm_R.quaternion', idleTimes, armRIdleRot),
  new THREE.VectorKeyframeTrack('Cello_Bow.position', idleTimes, bowIdlePos),
];
const idleClip = new THREE.AnimationClip('idle', 3.0, idleTracks);

// 2. PLAYING Animation (expressive bowing stroke & cello body sway)
const playTimes = [0, 0.5, 1.0, 1.5, 2.0];
const spinePlayRot = [
  0.02, 0.03, -0.02, 0.999,
  -0.01, 0.01, 0.01, 0.999,
  0.03, -0.02, -0.03, 0.998,
  -0.01, -0.01, 0.02, 0.999,
  0.02, 0.03, -0.02, 0.999
];
const armRPlayRot = [
  0.58, -0.15, 0.35, 0.71,
  0.42, -0.38, 0.52, 0.64,
  0.62, -0.10, 0.28, 0.72,
  0.38, -0.42, 0.55, 0.61,
  0.58, -0.15, 0.35, 0.71
];
const forearmRPlayRot = [
  0.72, 0.15, -0.32, 0.60,
  0.92, 0.42, -0.48, 0.40,
  0.68, 0.12, -0.28, 0.65,
  0.95, 0.45, -0.50, 0.38,
  0.72, 0.15, -0.32, 0.60
];
const bowPlayPos = [
  -0.12, -0.21, 0.02,
  0.14, -0.25, -0.02,
  -0.10, -0.20, 0.03,
  0.16, -0.26, -0.01,
  -0.12, -0.21, 0.02
];

const playTracks = [
  new THREE.QuaternionKeyframeTrack('Spine.quaternion', playTimes, spinePlayRot),
  new THREE.QuaternionKeyframeTrack('UpperArm_R.quaternion', playTimes, armRPlayRot),
  new THREE.QuaternionKeyframeTrack('Forearm_R.quaternion', playTimes, forearmRPlayRot),
  new THREE.VectorKeyframeTrack('Cello_Bow.position', playTimes, bowPlayPos),
];
const playClip = new THREE.AnimationClip('playing', 2.0, playTracks);

const exporter = new GLTFExporter();
exporter.parse(
  root,
  (gltf) => {
    fs.writeFileSync('public/music-lab/musicians/cellist.glb', Buffer.from(gltf));
    console.log('Successfully created public/music-lab/musicians/cellist.glb!');
  },
  (err) => {
    console.error('Error exporting cellist GLTF:', err);
  },
  { binary: true, animations: [idleClip, playClip] }
);
