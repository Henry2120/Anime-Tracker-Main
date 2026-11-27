export type ArchiveQualityTier = 'high' | 'balanced' | 'performance';
export type ArchiveQualityPreference = 'auto' | ArchiveQualityTier;

export interface ArchiveQualitySettings {
  tier: ArchiveQualityTier;
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: 256 | 512 | 1024;
  particleCount: number;
  maxRenderedBooksPerShelf: number;
  enablePointerParallax: boolean;
  isSoftwareGl: boolean;
  isMobileViewport: boolean;
}

/**
 * Explicit complexity budget for The Midnight Archive 3D room:
 * - Target draw calls: <= 45 (books batched into 3 InstancedMesh draws total)
 * - Target triangles: <= 35,000 across room, desk, computer, and 1,000+ books
 * - Procedural CanvasTexture budget: <= 10 MB VRAM total with LRU eviction on hero covers
 * - Render mode: demand-driven (frameloop="demand") -> 0% GPU when idle
 */
export const SCENE_COMPLEXITY_BUDGET = {
  maxDrawCallsTarget: 45,
  maxTrianglesTarget: 35_000,
  maxHeroCoverTexturesCached: 20,
  maxLights: 3,
} as const;

const QUALITY_STORAGE_KEY = 'aniverse_archive_3d_quality';

export interface WebGLProbeResult {
  available: boolean;
  isSoftwareGl: boolean;
  rendererName: string;
}

let cachedProbe: WebGLProbeResult | null = null;

export function probeWebGLCapabilities(): WebGLProbeResult {
  if (cachedProbe) return cachedProbe;
  if (typeof document === 'undefined') {
    cachedProbe = { available: false, isSoftwareGl: false, rendererName: 'ssr' };
    return cachedProbe;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);

    if (!gl) {
      cachedProbe = { available: false, isSoftwareGl: false, rendererName: 'unavailable' };
      return cachedProbe;
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? 'unknown');
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);

    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedProbe = { available: true, isSoftwareGl, rendererName: gpu };
    return cachedProbe;
  } catch {
    cachedProbe = { available: false, isSoftwareGl: false, rendererName: 'error' };
    return cachedProbe;
  }
}

export function loadQualityPreference(): ArchiveQualityPreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (raw === 'high' || raw === 'balanced' || raw === 'performance' || raw === 'auto') {
      return raw;
    }
  } catch {
    // Ignore storage restriction
  }
  return 'auto';
}

export function saveQualityPreference(pref: ArchiveQualityPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, pref);
  } catch {
    // Ignore storage restriction
  }
}

export function resolveQualitySettings(
  preference: ArchiveQualityPreference = 'auto',
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280
): ArchiveQualitySettings {
  const probe = probeWebGLCapabilities();
  const isMobileViewport = viewportWidth < 768;
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  const deviceMemory =
    typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as Navigator & { deviceMemory: number }).deviceMemory
      : 4;

  let tier: ArchiveQualityTier;
  if (preference !== 'auto') {
    tier = preference;
  } else if (probe.isSoftwareGl || isMobileViewport || hardwareConcurrency <= 2 || deviceMemory <= 2) {
    tier = isMobileViewport && hardwareConcurrency >= 6 && deviceMemory >= 4 && !probe.isSoftwareGl
      ? 'balanced'
      : 'performance';
  } else if (hardwareConcurrency >= 8 && deviceMemory >= 8) {
    tier = 'high';
  } else {
    tier = 'balanced';
  }

  // Respect software WebGL cost limits without altering scene objects
  const effectiveAntialias = !probe.isSoftwareGl && tier !== 'performance';
  const effectiveShadows = !probe.isSoftwareGl && tier !== 'performance';

  if (tier === 'high') {
    return {
      tier,
      dpr: probe.isSoftwareGl ? [1, 1] : [1, 1.75],
      antialias: effectiveAntialias,
      shadows: effectiveShadows,
      shadowMapSize: 1024,
      particleCount: 28,
      maxRenderedBooksPerShelf: 160,
      enablePointerParallax: !isMobileViewport,
      isSoftwareGl: probe.isSoftwareGl,
      isMobileViewport,
    };
  }

  if (tier === 'balanced') {
    return {
      tier,
      dpr: probe.isSoftwareGl ? [1, 1] : [1, 1.25],
      antialias: effectiveAntialias,
      shadows: effectiveShadows,
      shadowMapSize: 512,
      particleCount: 16,
      maxRenderedBooksPerShelf: 120,
      enablePointerParallax: !isMobileViewport,
      isSoftwareGl: probe.isSoftwareGl,
      isMobileViewport,
    };
  }

  return {
    tier: 'performance',
    dpr: [0.85, 1],
    antialias: false,
    shadows: false,
    shadowMapSize: 256,
    particleCount: 8,
    maxRenderedBooksPerShelf: 96,
    enablePointerParallax: false,
    isSoftwareGl: probe.isSoftwareGl,
    isMobileViewport,
  };
}
