import * as THREE from 'three';

export interface AnimationVisibilityDirectives {
  hide: string[];
  show: string[];
}

export interface CharacterVisibilityController {
  /**
   * Apply visibility rules for a given animation clip (by clip instance or clip name).
   * Restores all switch-controlled objects to their recorded baseline visibility first,
   * then applies the animation's hide and show instructions.
   */
  applyAnimationVisibility: (clipOrName: THREE.AnimationClip | string | null | undefined) => void;

  /**
   * Restores all controlled objects and their descendant meshes to their initial baseline visibility state.
   */
  resetToBaseline: () => void;

  /**
   * Clean up controller state, maps, and references when character is disposed.
   */
  dispose: () => void;

  /**
   * Returns true if this model contains any switch-controlled objects.
   */
  hasSwitches: () => boolean;

  /**
   * Returns list of discovered switch identifiers in the model.
   */
  getSwitchIds: () => string[];

  /**
   * Returns diagnostic summary of currently controlled objects and visibility states.
   */
  getDiagnostics: () => Record<string, { switches: string[]; visible: boolean; baseline: boolean }>;
}

/**
 * Extracts any switch identifiers associated with a Three.js Object3D's userData.
 * Inspects both direct properties (e.g. { switch0: true, switch1: true }) and nested extras,
 * as well as explicit switch / switches arrays or fields.
 */
export function extractSwitchIdsFromObject(
  userData: Record<string, any> | undefined | null,
  knownAnimationSwitches?: Set<string>
): string[] {
  if (!userData || typeof userData !== 'object') return [];

  const switchIds = new Set<string>();
  const sources = [userData];
  if (userData.extras && typeof userData.extras === 'object') {
    sources.push(userData.extras);
  }

  for (const src of sources) {
    for (const [key, value] of Object.entries(src)) {
      if (key === 'extras') continue;
      // Check if key matches switch pattern (e.g. "switch0", "switch1", "switch_body") and is truthy
      if (/^switch[0-9a-zA-Z_-]*/i.test(key) && Boolean(value)) {
        switchIds.add(key);
      }

      // Check if key is known from animation hide/show metadata
      if (knownAnimationSwitches && knownAnimationSwitches.has(key) && Boolean(value)) {
        switchIds.add(key);
      }
    }

    // Check explicit switch / switches fields
    if (typeof src.switch === 'string' && src.switch.trim()) {
      switchIds.add(src.switch.trim());
    } else if (Array.isArray(src.switch)) {
      src.switch.forEach((s) => {
        if (typeof s === 'string' && s.trim()) switchIds.add(s.trim());
      });
    }

    if (Array.isArray(src.switches)) {
      src.switches.forEach((s) => {
        if (typeof s === 'string' && s.trim()) switchIds.add(s.trim());
      });
    }
  }

  return Array.from(switchIds);
}

/**
 * Extracts hide and show switch lists from an animation clip's userData (parsed from glTF extras).
 * Inspects both direct clip.userData and clip.userData.extras.
 */
export function extractVisibilityDirectives(
  clip: THREE.AnimationClip | null | undefined
): AnimationVisibilityDirectives {
  if (!clip || !clip.userData || typeof clip.userData !== 'object') {
    return { hide: [], show: [] };
  }

  const hide = new Set<string>();
  const show = new Set<string>();
  const sources: Record<string, any>[] = [clip.userData];
  if (clip.userData.extras && typeof clip.userData.extras === 'object') {
    sources.push(clip.userData.extras as Record<string, any>);
  }

  for (const src of sources) {
    if (Array.isArray(src.hide)) {
      src.hide.forEach((id: any) => {
        if (typeof id === 'string' && id.trim()) hide.add(id.trim());
      });
    } else if (typeof src.hide === 'string' && src.hide.trim()) {
      hide.add(src.hide.trim());
    }

    if (Array.isArray(src.show)) {
      src.show.forEach((id: any) => {
        if (typeof id === 'string' && id.trim()) show.add(id.trim());
      });
    } else if (typeof src.show === 'string' && src.show.trim()) {
      show.add(src.show.trim());
    }
  }

  return {
    hide: Array.from(hide),
    show: Array.from(show),
  };
}

/**
 * Resolves an AnimationClip from animations list by name or instance,
 * with case-insensitive and subclip prefix/suffix fallback.
 */
function resolveClip(
  clipOrName: THREE.AnimationClip | string | null | undefined,
  animations: THREE.AnimationClip[]
): THREE.AnimationClip | null {
  if (!clipOrName) return null;
  if (typeof clipOrName !== 'string') return clipOrName;

  const exact = THREE.AnimationClip.findByName(animations, clipOrName);
  if (exact) return exact;

  const lower = clipOrName.toLowerCase();
  const caseInsensitive = animations.find((a) => a.name.toLowerCase() === lower);
  if (caseInsensitive) return caseInsensitive;

  // Subclip fallback (e.g. "Exs_Cutin_PianoLoop" -> matches "Exs_Cutin")
  const baseMatch = animations.find(
    (a) => lower.startsWith(a.name.toLowerCase()) || a.name.toLowerCase().startsWith(lower)
  );
  if (baseMatch) return baseMatch;

  return null;
}

/**
 * Creates a generic, reusable visibility controller for a loaded GLTF scene.
 * Inspects node and animation extras, builds a deterministic mapping,
 * and synchronizes object visibility with active animation selection.
 */
export function createCharacterVisibilityController(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[]
): CharacterVisibilityController {
  // 1. Gather all switch identifiers referenced in any animation clip
  const knownAnimationSwitches = new Set<string>();
  animations.forEach((clip) => {
    const { hide, show } = extractVisibilityDirectives(clip);
    hide.forEach((h) => knownAnimationSwitches.add(h));
    show.forEach((s) => knownAnimationSwitches.add(s));
  });

  // 2. Discover all objects governed by switch metadata
  const baselineVisibility = new Map<THREE.Object3D, boolean>();
  const objectToSwitches = new Map<THREE.Object3D, string[]>();
  const switchMap = new Map<string, Set<THREE.Object3D>>();

  scene.traverse((obj) => {
    const switchIds = extractSwitchIdsFromObject(obj.userData, knownAnimationSwitches);

    // Also check if object name itself matches any known switch identifier
    knownAnimationSwitches.forEach((sw) => {
      if (obj.name === sw && !switchIds.includes(sw)) {
        switchIds.push(sw);
      }
    });

    if (switchIds.length > 0) {
      // Record initial baseline visibility for this object from the loaded GLTF model
      baselineVisibility.set(obj, obj.visible);
      objectToSwitches.set(obj, switchIds);

      // Record baseline visibility for all descendant objects to prevent state leakage
      obj.traverse((child) => {
        if (!baselineVisibility.has(child)) {
          baselineVisibility.set(child, child.visible);
        }
      });

      switchIds.forEach((sw) => {
        if (!switchMap.has(sw)) switchMap.set(sw, new Set());
        switchMap.get(sw)!.add(obj);
      });
    }
  });

  const resetToBaseline = () => {
    for (const [obj, baseline] of baselineVisibility) {
      obj.visible = baseline;
    }
  };

  const applyAnimationVisibility = (clipOrName: THREE.AnimationClip | string | null | undefined) => {
    // Always restore all controlled objects to their recorded baseline first
    resetToBaseline();

    if (!clipOrName) return;

    const clip = resolveClip(clipOrName, animations);
    if (!clip) return;

    const { hide, show } = extractVisibilityDirectives(clip);
    if (hide.length === 0 && show.length === 0) return;

    // Apply visibility state deterministically per object:
    // 1. Check if any associated switch is in 'show' -> visible = true
    // 2. Check if any associated switch is in 'hide' -> visible = false (explicit hide takes precedence)
    for (const [obj, switchIds] of objectToSwitches) {
      let targetVisible = baselineVisibility.get(obj) ?? true;

      const shouldShow = switchIds.some((sw) => show.includes(sw));
      if (shouldShow) {
        targetVisible = true;
      }

      const shouldHide = switchIds.some((sw) => hide.includes(sw));
      if (shouldHide) {
        targetVisible = false;
      }

      obj.visible = targetVisible;

      // Synchronize descendant objects that do not have their own independent switch, respecting their baseline
      obj.traverse((child) => {
        if (child !== obj && !objectToSwitches.has(child)) {
          child.visible = targetVisible ? (baselineVisibility.get(child) ?? true) : false;
        }
      });
    }
  };

  const dispose = () => {
    resetToBaseline();
    baselineVisibility.clear();
    objectToSwitches.clear();
    switchMap.clear();
  };

  const hasSwitches = () => switchMap.size > 0;

  const getSwitchIds = () => Array.from(switchMap.keys());

  const getDiagnostics = () => {
    const res: Record<string, { switches: string[]; visible: boolean; baseline: boolean }> = {};
    for (const [obj, switches] of objectToSwitches) {
      res[obj.name] = {
        switches,
        visible: obj.visible,
        baseline: baselineVisibility.get(obj) ?? true,
      };
    }
    return res;
  };

  return {
    applyAnimationVisibility,
    resetToBaseline,
    dispose,
    hasSwitches,
    getSwitchIds,
    getDiagnostics,
  };
}
