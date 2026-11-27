import * as THREE from 'three';
import { SCENE_COMPLEXITY_BUDGET } from './qualityConfig';
import type { SceneAtmosphereProfile } from './themeAtmosphere';

export interface ArchiveMaterialLibrary {
  walnutMat: THREE.MeshStandardMaterial;
  walnutDarkMat: THREE.MeshStandardMaterial;
  floorParquetMat: THREE.MeshStandardMaterial;
  runnerRugMat: THREE.MeshStandardMaterial;
  stoneWallMat: THREE.MeshStandardMaterial;
  wainscotMat: THREE.MeshStandardMaterial;
  brassMat: THREE.MeshStandardMaterial;
  brassDarkMat: THREE.MeshStandardMaterial;
  laptopChassisMat: THREE.MeshStandardMaterial;
  laptopBezelMat: THREE.MeshStandardMaterial;
  laptopKeyboardMat: THREE.MeshStandardMaterial;
  slateMonitorMat: THREE.MeshStandardMaterial;
  keycapMat: THREE.MeshStandardMaterial;
  blotterMat: THREE.MeshStandardMaterial;
  emeraldShadeMat: THREE.MeshStandardMaterial;
  parchmentMat: THREE.MeshStandardMaterial;
  moonGlassMat: THREE.MeshPhysicalMaterial;
  windowExteriorMat: THREE.MeshBasicMaterial;
  bookBodyMat: THREE.MeshStandardMaterial;
  bookPagesMat: THREE.MeshStandardMaterial;
  bookGoldBandMat: THREE.MeshStandardMaterial;
  monitorScreenMat: THREE.MeshStandardMaterial;
  updateMonitorScreen: (
    booksCount: number,
    lanternWarmth: boolean,
    atmosphere?: SceneAtmosphereProfile
  ) => void;
  updateLampShade: (lanternWarmth: boolean) => void;
  updateWindowAtmosphere: (atmosphere: SceneAtmosphereProfile) => void;
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
  const [canvas, ctx] = makeCanvas(512, 512);
  if (ctx) {
    // Rich warm walnut plank gradient
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#4d3324');
    grad.addColorStop(0.38, '#3f281c');
    grad.addColorStop(0.72, '#352016');
    grad.addColorStop(1, '#2b1911');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle plank banding for authentic joinery
    const plankBands = [0, 128, 256, 384];
    for (let i = 0; i < plankBands.length; i++) {
      const py = plankBands[i];
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 224, 190, 0.035)' : 'rgba(12, 6, 3, 0.06)';
      ctx.fillRect(0, py, 512, 128);
      ctx.fillStyle = 'rgba(18, 9, 5, 0.22)';
      ctx.fillRect(0, py, 512, 1.5);
    }

    // Organic flowing cathedral grain lines
    for (let y = 0; y < 512; y += 2) {
      const waveA = Math.sin(y * 0.045) * 9 + Math.cos(y * 0.017) * 4;
      const waveB = Math.sin(y * 0.075 + 1.2) * 7;
      ctx.strokeStyle =
        y % 8 === 0
          ? 'rgba(20, 10, 6, 0.32)'
          : y % 10 === 0
            ? 'rgba(128, 86, 56, 0.14)'
            : 'rgba(68, 42, 28, 0.18)';
      ctx.lineWidth = y % 16 === 0 ? 1.5 : 0.9;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + waveA, 340, y - waveB, 512, y);
      ctx.stroke();
    }

    // Subtle figure highlights / wood pores
    ctx.fillStyle = 'rgba(24, 12, 7, 0.16)';
    for (let i = 0; i < 180; i++) {
      const rx = ((i * 97) % 500) + 4;
      const ry = ((i * 53) % 500) + 4;
      const len = 8 + (i % 16);
      ctx.fillRect(rx, ry, len, 1);
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
        ctx.fillStyle = `rgb(${42 + shade}, ${28 + Math.floor(shade * 0.7)}, ${21 + Math.floor(shade * 0.5)})`;
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
    grad.addColorStop(0, '#131c2e');
    grad.addColorStop(1, '#1b2439');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(7, 11, 20, 0.42)';
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
    ctx.fillStyle = '#172138';
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
    ctx.fillStyle = '#141c2b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(214, 189, 138, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 236, 236);
  }
  return configureColorTexture(canvas, 1, 1, anisotropy);
}

function createLaptopKeyboardTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 320);
  if (ctx) {
    // Anodized gunmetal palm-rest chassis
    const deckGrad = ctx.createLinearGradient(0, 0, 0, 320);
    deckGrad.addColorStop(0, '#2a2e38');
    deckGrad.addColorStop(1, '#22262f');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(0, 0, 512, 320);

    // Subtle speaker grilles flanking keyboard
    ctx.fillStyle = 'rgba(10, 12, 18, 0.45)';
    for (let gy = 26; gy < 176; gy += 6) {
      ctx.fillRect(14, gy, 24, 2);
      ctx.fillRect(474, gy, 24, 2);
    }

    // Recessed keyboard well
    ctx.fillStyle = '#14171e';
    ctx.fillRect(46, 20, 420, 162);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(46, 20, 420, 162);

    // Chiclet keycaps (6 rows)
    const rowY = [26, 48, 74, 100, 126, 152];
    const rowH = [16, 20, 20, 20, 20, 22];
    const rowCols = [14, 14, 14, 13, 12, 8];

    for (let r = 0; r < rowY.length; r++) {
      const cols = rowCols[r];
      const y = rowY[r];
      const h = rowH[r];
      const gap = 4;
      const totalW = 408;
      if (r === 5) {
        // Bottom modifier + centered wide spacebar row
        const widths = [38, 38, 44, 156, 44, 38, 30];
        let x = 52;
        for (let k = 0; k < widths.length; k++) {
          const kw = widths[k];
          ctx.fillStyle = '#1d212b';
          ctx.fillRect(x, y, kw, h);
          ctx.strokeStyle = 'rgba(180, 198, 232, 0.16)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, kw, h);
          x += kw + gap;
        }
      } else {
        const keyW = (totalW - (cols - 1) * gap) / cols;
        for (let c = 0; c < cols; c++) {
          const x = 52 + c * (keyW + gap);
          ctx.fillStyle = '#1d212b';
          ctx.fillRect(x, y, keyW, h);
          ctx.strokeStyle = 'rgba(180, 198, 232, 0.16)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, keyW, h);
        }
      }
    }

    // Large glass precision trackpad centered below keyboard
    ctx.fillStyle = '#1d212a';
    ctx.fillRect(174, 198, 164, 104);
    ctx.strokeStyle = 'rgba(214, 222, 235, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(174, 198, 164, 104);
  }
  return configureColorTexture(canvas, 1, 1, anisotropy);
}

function drawWindowSkyCanvas(
  canvas: HTMLCanvasElement,
  atmosphere?: SceneAtmosphereProfile
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const skyTop = atmosphere?.skyTop ?? '#0a1224';
  const skyBottom = atmosphere?.skyBottom ?? '#1c2b48';
  const horizonGlow = atmosphere?.horizonGlow ?? '#7797c9';
  const celestialBody = atmosphere?.celestialBody ?? 'moon';
  const celestialColor = atmosphere?.celestialColor ?? '#dceaff';
  const silhouetteColor = atmosphere?.silhouetteColor ?? '#0b1220';

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(0.74, skyBottom);
  grad.addColorStop(1, horizonGlow);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft horizon atmospheric glow band
  const hGlow = ctx.createRadialGradient(w * 0.52, h * 0.72, 16, w * 0.52, h * 0.72, w * 0.55);
  hGlow.addColorStop(0, `${horizonGlow}55`);
  hGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = hGlow;
  ctx.fillRect(0, 0, w, h);

  // Subtle stars for nocturnal / starlight skies
  if (!atmosphere?.isDaylight || celestialBody === 'stars') {
    const starCount = celestialBody === 'stars' ? 95 : 40;
    for (let i = 0; i < starCount; i++) {
      const sx = ((i * 137.5) % (w - 20)) + 10;
      const sy = ((i * 73.1) % (h * 0.68)) + 8;
      const r = i % 5 === 0 ? 1.8 : 1.05;
      ctx.fillStyle = i % 7 === 0 ? celestialColor : 'rgba(240, 246, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sun or Moon halo orb
  if (celestialBody === 'moon' || celestialBody === 'sun') {
    const cx = celestialBody === 'sun' ? w * 0.72 : w * 0.28;
    const cy = celestialBody === 'sun' ? h * 0.34 : h * 0.30;
    const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 78);
    halo.addColorStop(0, `${celestialColor}cc`);
    halo.addColorStop(0.35, `${celestialColor}44`);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = celestialColor;
    ctx.beginPath();
    ctx.arc(cx, cy, celestialBody === 'sun' ? 20 : 17, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft layered clouds for sunny / cloudy / sakura / light skies
  if (atmosphere?.theme === 'cloudy' || atmosphere?.theme === 'sunny' || atmosphere?.theme === 'light' || atmosphere?.theme === 'sakura') {
    ctx.fillStyle =
      atmosphere.theme === 'cloudy'
        ? 'rgba(226, 232, 240, 0.28)'
        : 'rgba(255, 255, 255, 0.24)';
    const clouds = [
      [w * 0.18, h * 0.38, 62, 18],
      [w * 0.48, h * 0.26, 78, 22],
      [w * 0.78, h * 0.44, 68, 19],
    ];
    for (const [cx, cy, rx, ry] of clouds) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Distant library courtyard roofline & treetop silhouette along bottom sill edge
  ctx.fillStyle = silhouetteColor;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.84);
  const ridgePoints = [
    [0.08, 0.80],
    [0.16, 0.86],
    [0.24, 0.78],
    [0.32, 0.84],
    [0.42, 0.88],
    [0.54, 0.82],
    [0.65, 0.87],
    [0.76, 0.77],
    [0.86, 0.84],
    [0.94, 0.79],
    [1.0, 0.85],
  ];
  for (const [px, py] of ridgePoints) {
    ctx.lineTo(w * px, h * py);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function drawMonitorCanvas(
  canvas: HTMLCanvasElement,
  booksCount: number,
  lanternWarmth: boolean,
  atmosphere?: SceneAtmosphereProfile
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const accent = atmosphere?.accentHex ?? '#d6bd8a';

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.22, 24, w * 0.5, h * 0.5, w * 0.75);
  bg.addColorStop(0, lanternWarmth ? '#19243b' : '#14223d');
  bg.addColorStop(1, '#080d18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle screen top accent bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fillRect(14, 14, w - 28, 34);
  ctx.strokeStyle = `${accent}66`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Traffic dots on laptop window frame
  const dots = ['#e57373', '#e5c07b', '#7ec699'];
  dots.forEach((c, idx) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(30 + idx * 14, 31, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#e8e2d4';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('BOOK TRACKER // WORKSTATION', 82, 35);

  ctx.fillStyle = accent;
  ctx.font = '12px monospace';
  ctx.fillText('library://catalog.local', 28, 76);

  ctx.fillStyle = '#f4efe6';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(`${booksCount} ${booksCount === 1 ? 'Book' : 'Books'} Cataloged`, 28, 122);

  ctx.fillStyle = '#aeb9c9';
  ctx.font = '13px sans-serif';
  ctx.fillText('Catalog · ISBN Scanner · Wishlist · Journal · Vault', 28, 152);

  // Clean minimalist catalog preview rows
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(28, 178, w - 56, 26);
  ctx.fillRect(28, 212, w - 92, 22);
  ctx.fillRect(28, 242, w - 134, 22);

  ctx.fillStyle = accent;
  ctx.fillRect(28, 178, 6, 26);

  ctx.fillStyle = '#e2d0a7';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Click laptop to open Library Workstation →', 28, h - 28);
}

export function createArchiveMaterialLibrary(maxAnisotropy = 4): ArchiveMaterialLibrary {
  const anisotropy = Math.min(8, Math.max(1, maxAnisotropy));

  const walnutTex = createWalnutTexture(anisotropy);
  const parquetTex = createHerringboneFloorTexture(anisotropy);
  const stoneTex = createStoneWallTexture(anisotropy);
  const rugTex = createRunnerRugTexture(anisotropy);
  const blotterTex = createBlotterTexture(anisotropy);
  const keyboardTex = createLaptopKeyboardTexture(anisotropy);

  const [monitorCanvas] = makeCanvas(512, 320);
  drawMonitorCanvas(monitorCanvas, 0, true);
  const monitorTex = configureColorTexture(monitorCanvas, 1, 1, anisotropy);

  const [windowSkyCanvas] = makeCanvas(512, 256);
  drawWindowSkyCanvas(windowSkyCanvas);
  const windowSkyTex = configureColorTexture(windowSkyCanvas, 1, 1, anisotropy);

  const walnutMat = new THREE.MeshStandardMaterial({
    map: walnutTex,
    roughness: 0.48,
    metalness: 0.05,
  });

  const walnutDarkMat = new THREE.MeshStandardMaterial({
    color: '#221510',
    roughness: 0.62,
    metalness: 0.04,
  });

  const floorParquetMat = new THREE.MeshStandardMaterial({
    map: parquetTex,
    roughness: 0.56,
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
    color: '#271912',
    roughness: 0.58,
    metalness: 0.05,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: '#cca968',
    roughness: 0.24,
    metalness: 0.88,
  });

  const brassDarkMat = new THREE.MeshStandardMaterial({
    color: '#826736',
    roughness: 0.34,
    metalness: 0.78,
  });

  const laptopChassisMat = new THREE.MeshStandardMaterial({
    color: '#2b303a',
    roughness: 0.26,
    metalness: 0.82,
  });

  const laptopBezelMat = new THREE.MeshStandardMaterial({
    color: '#11141b',
    roughness: 0.38,
    metalness: 0.35,
  });

  const laptopKeyboardMat = new THREE.MeshStandardMaterial({
    map: keyboardTex,
    roughness: 0.44,
    metalness: 0.24,
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
    color: '#0f563d',
    emissive: new THREE.Color('#134f38'),
    emissiveIntensity: 0.26,
    roughness: 0.16,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const parchmentMat = new THREE.MeshStandardMaterial({
    color: '#dfd0ae',
    roughness: 0.85,
    metalness: 0.02,
  });

  const moonGlassMat = new THREE.MeshPhysicalMaterial({
    color: '#a8ccf5',
    transparent: true,
    opacity: 0.16,
    roughness: 0.08,
    metalness: 0.2,
    reflectivity: 0.8,
    depthWrite: false,
  });

  const windowExteriorMat = new THREE.MeshBasicMaterial({
    map: windowSkyTex,
    toneMapped: false,
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
    emissive: new THREE.Color('#c2d7f8'),
    emissiveIntensity: 0.72,
    roughness: 0.16,
    metalness: 0.12,
  });

  const texturesToDispose: THREE.Texture[] = [
    walnutTex,
    parquetTex,
    stoneTex,
    rugTex,
    blotterTex,
    keyboardTex,
    monitorTex,
    windowSkyTex,
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
    laptopChassisMat,
    laptopBezelMat,
    laptopKeyboardMat,
    slateMonitorMat,
    keycapMat,
    blotterMat,
    emeraldShadeMat,
    parchmentMat,
    moonGlassMat,
    windowExteriorMat,
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
    laptopChassisMat,
    laptopBezelMat,
    laptopKeyboardMat,
    slateMonitorMat,
    keycapMat,
    blotterMat,
    emeraldShadeMat,
    parchmentMat,
    moonGlassMat,
    windowExteriorMat,
    bookBodyMat,
    bookPagesMat,
    bookGoldBandMat,
    monitorScreenMat,
    updateMonitorScreen(
      booksCount: number,
      lanternWarmth: boolean,
      atmosphere?: SceneAtmosphereProfile
    ) {
      drawMonitorCanvas(monitorCanvas, booksCount, lanternWarmth, atmosphere);
      monitorTex.needsUpdate = true;
    },
    updateLampShade(lanternWarmth: boolean) {
      if (lanternWarmth) {
        emeraldShadeMat.color.set('#0f563d');
        emeraldShadeMat.emissive.set('#185d41');
        emeraldShadeMat.emissiveIntensity = 0.28;
      } else {
        emeraldShadeMat.color.set('#1a3052');
        emeraldShadeMat.emissive.set('#305694');
        emeraldShadeMat.emissiveIntensity = 0.28;
      }
    },
    updateWindowAtmosphere(atmosphere: SceneAtmosphereProfile) {
      drawWindowSkyCanvas(windowSkyCanvas, atmosphere);
      windowSkyTex.needsUpdate = true;
      moonGlassMat.color.set(atmosphere.glassTint);
      moonGlassMat.opacity = atmosphere.glassOpacity;
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
    heroCoverCache.delete(params.key);
    heroCoverCache.set(params.key, existing);
    return existing;
  }

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

    ctx.strokeStyle = params.foilHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, 228, 356);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(22, 22, 212, 340);

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

    ctx.fillRect(72, 266, 112, 1.5);

    ctx.fillStyle = 'rgba(244, 239, 230, 0.82)';
    ctx.font = '14px Georgia, serif';
    ctx.fillText(params.author || 'Unknown Author', 128, 304, 188);
  }

  const tex = configureColorTexture(canvas, 1, 1, 4);
  heroCoverCache.set(params.key, tex);

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
