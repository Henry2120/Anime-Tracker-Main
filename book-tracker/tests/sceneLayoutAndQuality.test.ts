import { describe, expect, it } from 'vitest';
import {
  BOOKCASE_DIMENSIONS,
  BOOKCASE_TRANSFORMS,
  computeLocalBookSlot,
  getBookcaseCameraPose,
  localBookSlotToWorld,
} from '../src/scene/bookcaseLayout';
import {
  resolveQualitySettings,
  SCENE_COMPLEXITY_BUDGET,
} from '../src/scene/qualityConfig';
import { getDeterministicBookSpineStyle } from '../src/utils/bookSpine';

import { resolveSceneAtmosphere } from '../src/scene/themeAtmosphere';
import { DEFAULT_CUSTOM_THEME, THEME_OPTIONS } from '../../src/types/theme';

describe('Book Tracker 3D layout, theme atmosphere & quality configuration', () => {
  it('places up to 160 books per bookcase into distinct non-overlapping tier/bay slots', () => {
    const seen = new Set<string>();
    for (let idx = 0; idx < 160; idx += 1) {
      const slot = computeLocalBookSlot({
        slotIndex: idx,
        spineThickness: 0.03,
        bookHeight: 0.24,
        bookDepth: 0.21,
      });
      const key = `${slot.x.toFixed(4)}:${slot.y.toFixed(4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);

      expect(Math.abs(slot.x)).toBeLessThanOrEqual(
        BOOKCASE_DIMENSIONS.innerHalfWidth
      );
      expect(slot.y).toBeGreaterThan(0.25);
      expect(slot.y).toBeLessThan(BOOKCASE_DIMENSIONS.height);
    }
  });

  it('transforms local slots into angled world coordinates for left, middle, and right bookcases', () => {
    const local = { x: 0.2, y: 1.4, z: 0.03 };
    const leftWorld = localBookSlotToWorld('left', local);
    const middleWorld = localBookSlotToWorld('middle', local);
    const rightWorld = localBookSlotToWorld('right', local);

    expect(leftWorld.x).toBeLessThan(0);
    expect(middleWorld.x).toBeCloseTo(BOOKCASE_TRANSFORMS.middle.position[0] + 0.2, 4);
    expect(rightWorld.x).toBeGreaterThan(0);

    for (const shelf of ['left', 'middle', 'right'] as const) {
      const desktopPose = getBookcaseCameraPose(shelf, false);
      const mobilePose = getBookcaseCameraPose(shelf, true);
      expect(desktopPose.target).toEqual([
        BOOKCASE_TRANSFORMS[shelf].position[0],
        1.24,
        BOOKCASE_TRANSFORMS[shelf].position[2],
      ]);
      // Mobile camera stands slightly further back for portrait FOV comfort
      const desktopDist = Math.hypot(
        desktopPose.position[0] - desktopPose.target[0],
        desktopPose.position[2] - desktopPose.target[2]
      );
      const mobileDist = Math.hypot(
        mobilePose.position[0] - mobilePose.target[0],
        mobilePose.position[2] - mobilePose.target[2]
      );
      expect(mobileDist).toBeGreaterThan(desktopDist);
    }
  });

  it('scales render cost via quality tiers and software-WebGL detection within complexity budget', () => {
    const desktopHigh = resolveQualitySettings('high', 1440);
    expect(desktopHigh.tier).toBe('high');
    expect(desktopHigh.shadows).toBe(true);
    expect(desktopHigh.particleCount).toBeLessThanOrEqual(30);
    expect(SCENE_COMPLEXITY_BUDGET.maxDrawCallsTarget).toBeLessThanOrEqual(45);

    const mobilePerf = resolveQualitySettings('performance', 390);
    expect(mobilePerf.tier).toBe('performance');
    expect(mobilePerf.isMobileViewport).toBe(true);
    expect(mobilePerf.shadows).toBe(false);
    expect(mobilePerf.enablePointerParallax).toBe(false);
    expect(mobilePerf.dpr[1]).toBeLessThanOrEqual(1.25);
  });

  it('assigns valid deterministic leather hex colors for 3D instanced book meshes', () => {
    const styleA = getDeterministicBookSpineStyle({
      workId: 'work-alpha',
      pageCount: 320,
      format: 'hardcover',
    });
    const styleB = getDeterministicBookSpineStyle({
      workId: 'work-alpha',
      pageCount: 320,
      format: 'hardcover',
    });

    expect(styleA.leatherHex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(styleA.leatherHex).toBe(styleB.leatherHex);
  });

  it('maps every shared AniVerse theme, custom config, and rain intensity into 3D scene atmosphere', () => {
    for (const option of THEME_OPTIONS) {
      const profile = resolveSceneAtmosphere({
        theme: option.id,
        customConfig: DEFAULT_CUSTOM_THEME,
        rainIntensity: 0,
        lanternWarmth: true,
      });
      expect(profile.theme).toBe(option.id);
      expect(profile.skyTop).toMatch(/^#[0-9a-f]{6}$/i);
      expect(profile.skyBottom).toMatch(/^#[0-9a-f]{6}$/i);
      expect(profile.dirLightIntensity).toBeGreaterThan(1);
    }

    const sakura = resolveSceneAtmosphere({ theme: 'sakura', lanternWarmth: true });
    expect(sakura.weatherMode).toBe('petals');

    const storm = resolveSceneAtmosphere({
      theme: 'light',
      rainIntensity: 4,
      lanternWarmth: true,
    });
    expect(storm.weatherMode).toBe('rain');
    expect(storm.effectiveRainIntensity).toBe(4);

    const custom = resolveSceneAtmosphere({
      theme: 'custom',
      customConfig: {
        ...DEFAULT_CUSTOM_THEME,
        primary: '#FF5588',
        secondary: '#00CCFF',
        bgGradientStart: '#120826',
        bgGradientEnd: '#2B1248',
        useGradient: true,
      },
      lanternWarmth: false,
    });
    expect(custom.skyTop).toBe('#120826');
    expect(custom.skyBottom).toBe('#2B1248');
    expect(custom.accentHex).toBe('#FF5588');
  });
});
