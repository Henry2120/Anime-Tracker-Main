import * as THREE from 'three';
import { SCENE_COMPLEXITY_BUDGET } from './qualityConfig';

export interface ArchiveMaterialLibrary {
  walnutMat: THREE.MeshStandardMaterial;
  walnutDarkMat: THREE.MeshStandardMaterial;
  floorParquetMat: THREE.MeshStandardMaterial;
  runnerRugMat: THREE.MeshStandardMaterial;
  stoneWallMat: THREE.MeshStandardMaterial;
  wainscotMat: THREE.MeshStandardMaterial;
  brassMat: THREE.MeshStandardMaterial;
  brassDarkMat: THREE.MeshStandardMaterial;
  slateMonitorMat: THREE.MeshStandardMaterial;
  keycapMat: THREE.MeshStandardMaterial;
  blotterMat: THREE.MeshStandardMaterial;
  emeraldShadeMat: THREE.MeshStandardMaterial;
  parchmentMat: THREE.MeshStandardMaterial;
  moonGlassMat: THREE.MeshStandardMaterial;
  bookBodyMat: THREE.MeshStandardMaterial;
  bookPagesMat: THREE.MeshStandardMaterial;
  bookGoldBandMat: THREE.MeshStandardMaterial;
  monitorScreenMat: THREE.MeshStandardMaterial;
  updateMonitorScreen: (booksCount: number, lanternWarmth: boolean) => void;
  updateLampShade: (lanternWarmth: boolean) => void;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeatX > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeatY > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createWalnutTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#3e291f');
    grad.addColorStop(0.5, '#332018');
    grad.addColorStop(1, '#291912');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 2) {
      const wave = Math.sin(y * 0.08) * 6;
      ctx.strokeStyle = y % 6 === 0 ? 'rgba(18, 10, 7, 0.34)' : 'rgba(98, 66, 44, 0.14)';
      ctx.lineWidth = y % 12 === 0 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(85, y + wave, 170, y - wave, 256, y);
      ctx.stroke();
    }
  }
  return configureColorTexture(canvas, 2, 2, anisotropy);
}

function createHerringboneFloorTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  if (ctx) {
    ctx.fillStyle = '#1b120d';
    ctx.fillRect(0, 0, 512, 512);

    const plankW = 64;
    const plankH = 24;
    for (let row = -2; row < 28; row++) {
      for (let col = -2; col < 14; col++) {
        const x = col * plankW;
        const y = row * plankH;
        const shade = ((row * 7 + col * 13) & 3) * 4;
        ctx.save();
        ctx.translate(x + plankW / 2, y + plankH / 2);
        ctx.rotate((col % 2 === 0 ? 1 : -1) * 0.38);
        ctx.fillStyle = `rgb(${38 + shade}, ${25 + Math.floor(shade * 0.7)}, ${19 + Math.floor(shade * 0.5)})`;
        ctx.fillRect(-plankW / 2, -plankH / 2, plankW - 2, plankH - 2);
        ctx.strokeStyle = 'rgba(8, 5, 4, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-plankW / 2, -plankH / 2, plankW - 2, plankH - 2);
        ctx.restore();
      }
    }
  }
  return configureColorTexture(canvas, 5, 5, anisotropy);
}

function createStoneWallTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#111a2c');
    grad.addColorStop(1, '#192238');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(7, 11, 20, 0.46)';
    ctx.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();

      const offset = (y / 32) % 2 === 0 ? 0 : 32;
      for (let x = offset; x < 256; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }
  }
  return configureColorTexture(canvas, 4, 3, anisotropy);
}

function createRunnerRugTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 512);
  if (ctx) {
    ctx.fillStyle = '#151e34';
    ctx.fillRect(0, 0, 256, 512);

    ctx.strokeStyle = '#b49a67';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 228, 484);

    ctx.strokeStyle = 'rgba(214, 189, 138, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, 204, 460);

    ctx.fillStyle = 'rgba(119, 151, 201, 0.14)';
    for (let y = 48; y < 464; y += 52) {
      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.lineTo(156, y + 20);
      ctx.lineTo(128, y + 40);
      ctx.lineTo(100, y + 20);
      ctx.closePath();
      ctx.fill();
    }
  }
  return configureColorTexture(canvas, 1, 1, anisotropy);
}

function createBlotterTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (ctx) {
    ctx.fillStyle = '#121928';
    ctx.fillRect(0, 0, 256, 256);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(214, 189, 138, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 236, 236);
  }
  return configureColorTexture(canvas, 1, 1, anisotropy);
}

function drawMonitorCanvas(
  canvas: HTMLCanvasElement,
  booksCount: number,
  lanternWarmth: boolean
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.25, 24, w * 0.5, h * 0.5, w * 0.72);
  bg.addColorStop(0, lanternWarmth ? '#18243d' : '#162544');
  bg.addColorStop(1, '#070c17');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Outer terminal bezel line
  ctx.strokeStyle = 'rgba(180, 154, 103, 0.48)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Header strip
  ctx.fillStyle = 'rgba(180, 154, 103, 0.14)';
  ctx.fillRect(16, 16, w - 32, 34);

  ctx.fillStyle = '#d6bd8a';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText('THE MIDNIGHT ARCHIVE // WORKSTATION', 28, 38);

  ctx.fillStyle = '#7797c9';
  ctx.font = '13px monospace';
  ctx.fillText('> archive://catalog.local', 28, 78);

  ctx.fillStyle = '#f4efe6';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(`${booksCount} ${booksCount === 1 ? 'Volume' : 'Volumes'} Cataloged`, 28, 126);

  ctx.fillStyle = '#aeb9c9';
  ctx.font = '14px sans-serif';
  ctx.fillText('Catalog · Barcode Scanner · Wishlist · Journal · Vault', 28, 160);

  // Subtle decorative catalog row previews
  ctx.fillStyle = 'rgba(119, 151, 201, 0.16)';
  ctx.fillRect(28, 186, w - 56, 22);
  ctx.fillRect(28, 216, w - 96, 18);
  ctx.fillRect(28, 244, w - 140, 18);

  ctx.fillStyle = '#d6bd8a';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Click monitor to open Library Workstation →', 28, h - 32);
}

export function createArchiveMaterialLibrary(maxAnisotropy = 4): ArchiveMaterialLibrary {
  const anisotropy = Math.min(8, Math.max(1, maxAnisotropy));

  const walnutTex = createWalnutTexture(anisotropy);
  const parquetTex = createHerringboneFloorTexture(anisotropy);
  const stoneTex = createStoneWallTexture(anisotropy);
  const rugTex = createRunnerRugTexture(anisotropy);
  const blotterTex = createBlotterTexture(anisotropy);

  const [monitorCanvas] = makeCanvas(512, 320);
  drawMonitorCanvas(monitorCanvas, 0, true);
  const monitorTex = configureColorTexture(monitorCanvas, 1, 1, anisotropy);

  const walnutMat = new THREE.MeshStandardMaterial({
    map: walnutTex,
    roughness: 0.54,
    metalness: 0.06,
  });

  const walnutDarkMat = new THREE.MeshStandardMaterial({
    color: '#20140f',
    roughness: 0.68,
    metalness: 0.04,
  });

  const floorParquetMat = new THREE.MeshStandardMaterial({
    map: parquetTex,
    roughness: 0.58,
    metalness: 0.08,
  });

  const runnerRugMat = new THREE.MeshStandardMaterial({
    map: rugTex,
    roughness: 0.9,
    metalness: 0.02,
  });

  const stoneWallMat = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.88,
    metalness: 0.04,
  });

  const wainscotMat = new THREE.MeshStandardMaterial({
    color: '#261812',
    roughness: 0.62,
    metalness: 0.05,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: '#c9a96a',
    roughness: 0.25,
    metalness: 0.86,
  });

  const brassDarkMat = new THREE.MeshStandardMaterial({
    color: '#826736',
    roughness: 0.34,
    metalness: 0.78,
  });

  const slateMonitorMat = new THREE.MeshStandardMaterial({
    color: '#1b1d24',
    roughness: 0.38,
    metalness: 0.42,
  });

  const keycapMat = new THREE.MeshStandardMaterial({
    color: '#2d2928',
    roughness: 0.65,
    metalness: 0.12,
  });

  const blotterMat = new THREE.MeshStandardMaterial({
    map: blotterTex,
    roughness: 0.78,
    metalness: 0.04,
  });

  const emeraldShadeMat = new THREE.MeshStandardMaterial({
    color: '#0f4e37',
    emissive: new THREE.Color('#0c3b29'),
    emissiveIntensity: 0.22,
    roughness: 0.22,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const parchmentMat = new THREE.MeshStandardMaterial({
    color: '#dfd0ae',
    roughness: 0.85,
    metalness: 0.02,
  });

  const moonGlassMat = new THREE.MeshStandardMaterial({
    color: '#9fc0f5',
    emissive: new THREE.Color('#5a87cf'),
    emissiveIntensity: 1.05,
    roughness: 0.15,
    metalness: 0.05,
  });

  // Shared materials for InstancedMesh books (3 draw calls total across hundreds of books!)
  const bookBodyMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.66,
    metalness: 0.08,
  });

  const bookPagesMat = new THREE.MeshStandardMaterial({
    color: '#dfd4ba',
    roughness: 0.88,
    metalness: 0.02,
  });

  const bookGoldBandMat = new THREE.MeshStandardMaterial({
    color: '#d6bd8a',
    roughness: 0.28,
    metalness: 0.82,
  });

  const monitorScreenMat = new THREE.MeshStandardMaterial({
    map: monitorTex,
    emissiveMap: monitorTex,
    emissive: new THREE.Color('#b6cff5'),
    emissiveIntensity: 0.68,
    roughness: 0.22,
    metalness: 0.08,
  });

  const texturesToDispose: THREE.Texture[] = [
    walnutTex,
    parquetTex,
    stoneTex,
    rugTex,
    blotterTex,
    monitorTex,
  ];

  const materialsToDispose: THREE.Material[] = [
    walnutMat,
    walnutDarkMat,
    floorParquetMat,
    runnerRugMat,
    stoneWallMat,
    wainscotMat,
    brassMat,
    brassDarkMat,
    slateMonitorMat,
    keycapMat,
    blotterMat,
    emeraldShadeMat,
    parchmentMat,
    moonGlassMat,
    bookBodyMat,
    bookPagesMat,
    bookGoldBandMat,
    monitorScreenMat,
  ];

  return {
    walnutMat,
    walnutDarkMat,
    floorParquetMat,
    runnerRugMat,
    stoneWallMat,
    wainscotMat,
    brassMat,
    brassDarkMat,
    slateMonitorMat,
    keycapMat,
    blotterMat,
    emeraldShadeMat,
    parchmentMat,
    moonGlassMat,
    bookBodyMat,
    bookPagesMat,
    bookGoldBandMat,
    monitorScreenMat,
    updateMonitorScreen(booksCount: number, lanternWarmth: boolean) {
      drawMonitorCanvas(monitorCanvas, booksCount, lanternWarmth);
      monitorTex.needsUpdate = true;
    },
    updateLampShade(lanternWarmth: boolean) {
      if (lanternWarmth) {
        emeraldShadeMat.color.set('#0f4e37');
        emeraldShadeMat.emissive.set('#144a34');
        emeraldShadeMat.emissiveIntensity = 0.24;
      } else {
        emeraldShadeMat.color.set('#1a3052');
        emeraldShadeMat.emissive.set('#305694');
        emeraldShadeMat.emissiveIntensity = 0.28;
      }
    },
    dispose() {
      texturesToDispose.forEach((t) => t.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    },
  };
}

// Bounded LRU cache for hero book inspection / placement cover textures (never allocated per shelf book!)
const heroCoverCache = new Map<string, THREE.CanvasTexture>();

export function getHeroBookCoverTexture(params: {
  key: string;
  title: string;
  author: string;
  coverHex: string;
  foilHex: string;
  coverUrl?: string;
}): THREE.CanvasTexture {
  const existing = heroCoverCache.get(params.key);
  if (existing) {
    // Move to most recently used
    heroCoverCache.delete(params.key);
    heroCoverCache.set(params.key, existing);
    return existing;
  }

  // Evict oldest if over budget
  if (heroCoverCache.size >= SCENE_COMPLEXITY_BUDGET.maxHeroCoverTexturesCached) {
    const oldestKey = heroCoverCache.keys().next().value;
    if (oldestKey) {
      heroCoverCache.get(oldestKey)?.dispose();
      heroCoverCache.delete(oldestKey);
    }
  }

  const [canvas, ctx] = makeCanvas(256, 384);
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 384);
    grad.addColorStop(0, params.coverHex);
    grad.addColorStop(1, '#120d0c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 384);

    // Ornate antique gold double border
    ctx.strokeStyle = params.foilHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, 228, 356);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(22, 22, 212, 340);

    // Title block
    ctx.fillStyle = params.foilHex;
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Georgia, serif';

    const words = params.title.trim().split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (ctx.measureText(candidate).width > 188 && current) {
        lines.push(current);
        current = w;
      } else {
        current = candidate;
      }
      if (lines.length >= 4) break;
    }
    if (current && lines.length < 5) lines.push(current);

    lines.forEach((line, idx) => {
      ctx.fillText(line, 128, 126 + idx * 28, 192);
    });

    // Divider line
    ctx.fillRect(72, 266, 112, 1.5);

    ctx.fillStyle = 'rgba(244, 239, 230, 0.82)';
    ctx.font = '14px Georgia, serif';
    ctx.fillText(params.author || 'Midnight Archive', 128, 304, 188);
  }

  const tex = configureColorTexture(canvas, 1, 1, 4);
  heroCoverCache.set(params.key, tex);

  // Optional async cover image upgrade if CORS permits
  if (params.coverUrl && typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c2 = canvas.getContext('2d');
      if (!c2) return;
      c2.drawImage(img, 0, 0, 256, 384);
      tex.needsUpdate = true;
    };
    img.src = params.coverUrl;
  }

  return tex;
}

export function disposeAllHeroCoverTextures(): void {
  heroCoverCache.forEach((tex) => tex.dispose());
  heroCoverCache.clear();
}
