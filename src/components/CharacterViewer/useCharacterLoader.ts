import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, CharacterAnimationInfo } from './types';
import {
  createCharacterVisibilityController,
  CharacterVisibilityController,
  enforceHinaPianoWeaponHidden,
} from './characterVisibilityController';
import { resolvePerformerClipName, resolvePerformerMapping } from './performerRegistry';

/**
 * Module-level GLTF asset cache and concurrent request deduplication.
 * Prevents redundant multi-MB downloads and GLB parsing when characters enter/leave.
 */
const parsedGlbCache = new Map<string, GLTF>();
const inFlightGlbLoads = new Map<string, Promise<GLTF>>();
const sharedLoader = new GLTFLoader();

let cacheHitCount = 0;
let cacheMissCount = 0;

export function getLoaderCacheStats() {
  return {
    cachedAssetCount: parsedGlbCache.size,
    pendingDownloadCount: inFlightGlbLoads.size,
    cacheHits: cacheHitCount,
    cacheMisses: cacheMissCount,
  };
}

/**
 * Loads and caches a remote GLB asset once, deduplicating concurrent requests for the same URL.
 */
function loadOrReuseCachedGltf(
  url: string,
  onProgress?: (pct: number) => void
): Promise<GLTF> {
  const existing = parsedGlbCache.get(url);
  if (existing) {
    cacheHitCount++;
    onProgress?.(100);
    return Promise.resolve(existing);
  }

  const pending = inFlightGlbLoads.get(url);
  if (pending) {
    cacheHitCount++;
    return pending;
  }

  cacheMissCount++;
  const loadPromise = new Promise<GLTF>((resolve, reject) => {
    sharedLoader.load(
      url,
      (gltf) => {
        parsedGlbCache.set(url, gltf);
        inFlightGlbLoads.delete(url);
        resolve(gltf);
      },
      (progressEvent) => {
        if (progressEvent.total > 0) {
          const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress?.(pct);
        }
      },
      (err) => {
        inFlightGlbLoads.delete(url);
        reject(err instanceof Error ? err : new Error(`Failed to fetch GLB at ${url}`));
      }
    );
  });

  inFlightGlbLoads.set(url, loadPromise);
  return loadPromise;
}

/**
 * Deeply disposes a Three.js Object3D hierarchy and associated AnimationMixer.
 * Respects shared GLTF cache flag so cached geometries/textures remain intact for fast re-spawns.
 */
export function disposeHierarchy(
  root: THREE.Object3D,
  mixer?: THREE.AnimationMixer,
  visibilityController?: CharacterVisibilityController
) {
  if (visibilityController) {
    try {
      visibilityController.dispose();
    } catch {
      // Ignore
    }
  }

  if (mixer) {
    mixer.stopAllAction();
    try {
      mixer.uncacheRoot(root);
    } catch {
      // Ignore if root was already uncached
    }
  }

  const usesSharedCache = Boolean(root.userData?.__usesSharedGlbCache);
  if (usesSharedCache) {
    return;
  }

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          Object.keys(mat).forEach((key) => {
            const val = (mat as any)[key];
            if (val && typeof val === 'object' && 'isTexture' in val && val.isTexture) {
              val.dispose();
            }
          });
          mat.dispose();
        });
      }
    }
  });
}

// Module-level persistent store so loaded 3D performers remain loaded across view transitions
let globalLoadedCharactersCache: LoadedCharacterInstance[] = [];
let globalSelectedInstanceIdCache: string | null = null;

/**
 * Checks if a character is Dress Hina with Piano.
 */
export function isHinaPianoPerformer(
  entry?: CharacterManifestEntry,
  scene?: THREE.Object3D
): boolean {
  if (scene && scene.getObjectByName('Piano_Switch')) {
    return true;
  }
  if (!entry) return false;
  const name = (entry.name || '').toLowerCase();
  const id = (entry.id || '').toLowerCase();
  const filename = (entry.filename || '').toLowerCase();
  const hasHina =
    (name.includes('hina') && !name.includes('hinata')) ||
    (id.includes('hina') && !id.includes('hinata')) ||
    (filename.includes('hina') && !filename.includes('hinata'));
  const hasDressOrPiano =
    name.includes('dress') ||
    id.includes('dress') ||
    filename.includes('dress') ||
    name.includes('piano') ||
    id.includes('piano') ||
    filename.includes('piano');
  return hasHina && hasDressOrPiano;
}

/**
 * Creates or retrieves the seamlessly looping short piano-playing segment of Exs_Cutin
 * specifically for Dress Hina's piano rig (12s clip -> active playing frames 118..211 at 30fps).
 */
export function getOrCreateExsCutinLoop(
  animations: THREE.AnimationClip[],
  characterEntry?: CharacterManifestEntry,
  scene?: THREE.Object3D
): THREE.AnimationClip | null {
  if (characterEntry || scene) {
    if (!isHinaPianoPerformer(characterEntry, scene)) {
      return null;
    }
  }

  const existing = THREE.AnimationClip.findByName(animations, 'Exs_Cutin_PianoLoop');
  if (existing) return existing;

  const originalCutin =
    THREE.AnimationClip.findByName(animations, 'Exs_Cutin') ||
    THREE.AnimationClip.findByName(animations, 'exs_cutin');
  if (!originalCutin || originalCutin.duration < 7.1) {
    return null;
  }

  try {
    const sub = THREE.AnimationUtils.subclip(originalCutin, 'Exs_Cutin_PianoLoop', 118, 211, 30);
    const pianoTrack = new THREE.VectorKeyframeTrack(
      'Piano_Switch.scale',
      [0, sub.duration],
      [1, 1, 1, 1, 1, 1]
    );
    sub.tracks.push(pianoTrack);
    animations.push(sub);
    return sub;
  } catch (err) {
    console.warn('[Animation] Failed to generate Exs_Cutin subclip, falling back to original:', err);
    return originalCutin;
  }
}

export function useCharacterLoader() {
  const [loadedCharacters, setLoadedCharacters] = useState<LoadedCharacterInstance[]>(
    () => globalLoadedCharactersCache
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    () => globalSelectedInstanceIdCache
  );
  const [loading, setLoading] = useState(false);
  const [loadingCharacter, setLoadingCharacter] = useState<CharacterManifestEntry | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [error, setError] = useState<{ character: CharacterManifestEntry; message: string } | null>(null);

  const loadedCharactersRef = useRef<LoadedCharacterInstance[]>(loadedCharacters);
  loadedCharactersRef.current = loadedCharacters;

  // Tracks pending fade-out stop timers keyed by `${instanceId}::${clipName}`
  const pendingFadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearPendingFadeTimer = useCallback((instanceId: string, clipName?: string) => {
    if (clipName) {
      const k = `${instanceId}::${clipName}`;
      const t = pendingFadeTimersRef.current.get(k);
      if (t !== undefined) {
        clearTimeout(t);
        pendingFadeTimersRef.current.delete(k);
      }
      return;
    }
    const prefix = `${instanceId}::`;
    for (const [k, t] of pendingFadeTimersRef.current.entries()) {
      if (k.startsWith(prefix)) {
        clearTimeout(t);
        pendingFadeTimersRef.current.delete(k);
      }
    }
  }, []);

  useEffect(() => {
    globalLoadedCharactersCache = loadedCharacters;
  }, [loadedCharacters]);

  useEffect(() => {
    globalSelectedInstanceIdCache = selectedInstanceId;
  }, [selectedInstanceId]);

  /**
   * Load (or clone from cache) a character GLB from its verified remote URL
   */
  const loadCharacter = useCallback(
    async (
      entry: CharacterManifestEntry,
      options: {
        replace?: boolean;
        position?: THREE.Vector3;
        rotation?: THREE.Euler;
        scale?: THREE.Vector3;
        slotIndex?: number;
        stageRow?: 'front' | 'back';
        initialAnimation?: string;
        abortCheck?: () => boolean;
      } = { replace: true }
    ): Promise<LoadedCharacterInstance> => {
      setLoading(true);
      setLoadingCharacter(entry);
      setLoadingProgress(0);
      setError(null);

      try {
        const gltf = await loadOrReuseCachedGltf(entry.url, (pct) => setLoadingProgress(pct));

        if (options.abortCheck && options.abortCheck()) {
          setLoading(false);
          setLoadingCharacter(null);
          throw new Error('Load cancelled because stage context changed');
        }

        const sourceScene = gltf.scene || gltf.scenes[0];
        if (!sourceScene) {
          throw new Error('GLTF file contains no valid scene');
        }

        // Clone independently with SkeletonUtils so cached rigs support multiple/re-added instances cleanly
        const scene = SkeletonUtils.clone(sourceScene) as THREE.Group;

        let vertexCount = 0;
        let meshCount = 0;
        const isHinaPianoModel = isHinaPianoPerformer(entry, scene);

        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            meshCount++;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if ((obj as any).isSkinnedMesh) {
              obj.frustumCulled = false;
            }

            if (mesh.geometry) {
              vertexCount += mesh.geometry.attributes.position?.count || 0;
            }

            const isHinaPianoMesh =
              isHinaPianoModel &&
              (mesh.name === 'SubMesh_0' ||
                mesh.name === 'Mesh_0' ||
                mesh.name.toLowerCase().includes('piano') ||
                Boolean(mesh.parent?.name?.toLowerCase().includes('piano')) ||
                Boolean(mesh.parent?.parent?.name?.toLowerCase().includes('piano')));

            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                if ('map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                if (m.transparent === false || ('alphaTest' in m && (m as any).alphaTest > 0)) {
                  m.depthWrite = true;
                }
                if (isHinaPianoMesh) {
                  if ('roughness' in m) (m as THREE.MeshStandardMaterial).roughness = 0.22;
                  if ('metalness' in m) (m as THREE.MeshStandardMaterial).metalness = 0.15;
                  if ('color' in m) {
                    (m as THREE.MeshStandardMaterial).color.setRGB(3.2, 3.2, 3.6);
                  }
                  if ('emissive' in m) {
                    (m as THREE.MeshStandardMaterial).emissive.set('#160c24');
                    (m as THREE.MeshStandardMaterial).emissiveIntensity = 0.22;
                  }
                } else if ('roughness' in m && m.roughness === undefined) {
                  m.roughness = 0.5;
                }
              });
            }
          }
        });

        if (isHinaPianoModel) {
          enforceHinaPianoWeaponHidden(scene);
        }

        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);

        const modelHeight = box.max.y - box.min.y;

        // Ground model feet neatly at Y = 0
        const centerOffset = new THREE.Vector3(
          -(box.min.x + box.max.x) / 2,
          -box.min.y,
          -(box.min.z + box.max.z) / 2
        );

        let initialPos = options.position;
        if (!initialPos) {
          if (options.replace) {
            initialPos = new THREE.Vector3(0, 0, 0);
          } else {
            const count = loadedCharactersRef.current.length;
            const xOffset = count % 2 === 1 ? Math.ceil(count / 2) * 1.45 : -(Math.ceil(count / 2) * 1.45);
            initialPos = new THREE.Vector3(xOffset, 0, 0);
          }
        }

        const instanceGroup = new THREE.Group();
        instanceGroup.name = `CharacterInstance_${entry.id}`;
        instanceGroup.userData.__usesSharedGlbCache = true;

        scene.position.copy(centerOffset);
        instanceGroup.add(scene);

        // Clone clip list so Hina's subclip injection stays isolated to this instance
        const animations: THREE.AnimationClip[] = [...(gltf.animations || [])];
        const availableAnimations: CharacterAnimationInfo[] = animations.map((clip) => ({
          name: clip.name,
          duration: parseFloat(clip.duration.toFixed(2)),
          tracksCount: clip.tracks.length,
        }));

        const mixer = new THREE.AnimationMixer(scene);
        const visibilityController = createCharacterVisibilityController(scene, animations);

        const performerMapping = resolvePerformerMapping(entry);
        const defaultIdle = performerMapping?.idleClip || 'Cafe_Idle';
        const fallbackIdles = performerMapping?.idleFallbacks || ['Cafe_Idle', 'Formation_Idle', 'Normal_Idle', 'Idle'];

        const requestedClip = options.initialAnimation || defaultIdle;
        const resolvedClipName = resolvePerformerClipName(
          availableAnimations,
          requestedClip,
          [...fallbackIdles, 'Cafe_Reaction']
        );

        let currentAction: THREE.AnimationAction | null = null;
        let currentAnimationName: string | null = null;

        const isTargetExs = resolvedClipName === 'Exs_Cutin' || resolvedClipName === 'exs_cutin';
        const targetClip =
          resolvedClipName && isTargetExs && isHinaPianoModel
            ? getOrCreateExsCutinLoop(animations, entry, scene) ||
              THREE.AnimationClip.findByName(animations, resolvedClipName)
            : resolvedClipName
            ? THREE.AnimationClip.findByName(animations, resolvedClipName)
            : null;

        if (targetClip && resolvedClipName) {
          currentAction = mixer.clipAction(targetClip);
          currentAction.reset();
          currentAction.setEffectiveTimeScale(1);
          currentAction.setEffectiveWeight(1);
          currentAction.setLoop(THREE.LoopRepeat, Infinity);
          currentAction.play();
          currentAnimationName = resolvedClipName;
          visibilityController.applyAnimationVisibility(targetClip);
        } else {
          visibilityController.resetToBaseline();
        }

        const initialPianoSwitch = scene.getObjectByName('Piano_Switch');
        if (initialPianoSwitch && isHinaPianoModel) {
          initialPianoSwitch.scale.set(1, 1, 1);
          initialPianoSwitch.visible = true;
        }
        if (isHinaPianoModel) {
          enforceHinaPianoWeaponHidden(scene);
        }

        const newInstance: LoadedCharacterInstance = {
          id: `instance-${entry.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          characterId: entry.id,
          manifestEntry: entry,
          scene: instanceGroup,
          position: initialPos.clone(),
          rotation: options.rotation ? options.rotation.clone() : new THREE.Euler(0, 0, 0),
          scale: options.scale ? options.scale.clone() : new THREE.Vector3(1, 1, 1),
          visible: true,
          boundingBox: box,
          boundingSphere: sphere,
          modelHeight: modelHeight > 0 ? modelHeight : 1.5,
          centerOffset,
          vertexCount,
          meshCount,
          slotIndex: options.slotIndex,
          stageRow: options.stageRow,
          animations,
          availableAnimations,
          mixer,
          currentAction,
          currentAnimationName,
          isPlayingAnimation: currentAction !== null,
          visibilityController,
        };

        setLoadedCharacters((prev) => {
          if (options.replace) {
            prev.forEach((p) => {
              clearPendingFadeTimer(p.id);
              disposeHierarchy(p.scene, p.mixer, p.visibilityController);
            });
            return [newInstance];
          }
          if (options.slotIndex !== undefined) {
            const existingIdx = prev.findIndex((p) => p.slotIndex === options.slotIndex);
            if (existingIdx !== -1) {
              clearPendingFadeTimer(prev[existingIdx].id);
              disposeHierarchy(
                prev[existingIdx].scene,
                prev[existingIdx].mixer,
                prev[existingIdx].visibilityController
              );
              const next = [...prev];
              next[existingIdx] = newInstance;
              return next;
            }
          }
          return [...prev, newInstance];
        });

        setSelectedInstanceId(newInstance.id);
        setLoading(false);
        setLoadingCharacter(null);
        setLoadingProgress(100);

        return newInstance;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Load cancelled')) {
          setError({ character: entry, message: msg });
        }
        setLoading(false);
        setLoadingCharacter(null);
        throw err;
      }
    },
    [clearPendingFadeTimer]
  );

  /**
   * Smoothly crossfades an instance to a target animation clip without restarting
   * if already active, and safely cancels any prior fade-out timer for the incoming clip.
   */
  const playAnimation = useCallback(
    (instanceId: string, animationName: string) => {
      setLoadedCharacters((prev) => {
        const target = prev.find((c) => c.id === instanceId);
        if (!target) return prev;

        if (target.currentAnimationName === animationName && target.isPlayingAnimation) {
          return prev;
        }

        const isHinaPiano = isHinaPianoPerformer(target.manifestEntry, target.scene);
        const isExs = animationName === 'Exs_Cutin' || animationName === 'exs_cutin';
        const clip =
          isExs && isHinaPiano
            ? getOrCreateExsCutinLoop(target.animations, target.manifestEntry, target.scene) ||
              THREE.AnimationClip.findByName(target.animations, animationName)
            : THREE.AnimationClip.findByName(target.animations, animationName);

        if (!clip) {
          console.warn(
            `[CharacterLoader] Animation "${animationName}" not found in model ${target.manifestEntry.name}`
          );
          return prev;
        }

        const prevAction = target.currentAction;
        const nextAction = target.mixer.clipAction(clip);

        clearPendingFadeTimer(instanceId, clip.name);

        target.visibilityController?.applyAnimationVisibility(clip);

        const pianoSwitch = target.scene.getObjectByName('Piano_Switch');
        if (pianoSwitch && isHinaPiano) {
          pianoSwitch.scale.set(1, 1, 1);
          pianoSwitch.visible = true;
        }
        if (isHinaPiano) {
          enforceHinaPianoWeaponHidden(target.scene);
        }

        const crossfadeSec = 0.25;
        if (prevAction && prevAction !== nextAction) {
          prevAction.fadeOut(crossfadeSec);
          nextAction.reset();
          nextAction.enabled = true;
          nextAction.setEffectiveTimeScale(1);
          nextAction.setEffectiveWeight(1);
          nextAction.fadeIn(crossfadeSec);
          nextAction.setLoop(THREE.LoopRepeat, Infinity);
          nextAction.play();

          const oldClipName = prevAction.getClip().name;
          const timerId = setTimeout(() => {
            pendingFadeTimersRef.current.delete(`${instanceId}::${oldClipName}`);
            try {
              if (prevAction !== target.mixer.clipAction(clip)) {
                prevAction.stop();
              }
            } catch {}
          }, Math.round(crossfadeSec * 1000) + 30);
          pendingFadeTimersRef.current.set(`${instanceId}::${oldClipName}`, timerId);
        } else {
          nextAction.reset();
          nextAction.enabled = true;
          nextAction.setEffectiveTimeScale(1);
          nextAction.setEffectiveWeight(1);
          nextAction.setLoop(THREE.LoopRepeat, Infinity);
          nextAction.play();
        }

        return prev.map((char) =>
          char.id === instanceId
            ? {
                ...char,
                currentAction: nextAction,
                currentAnimationName: animationName,
                isPlayingAnimation: true,
              }
            : char
        );
      });
    },
    [clearPendingFadeTimer]
  );

  /**
   * Batch switch animation across all loaded instances cleanly.
   */
  const setAllCharactersAnimation = useCallback(
    (animationName: string) => {
      loadedCharactersRef.current.forEach((char) => {
        if (char.animations.some((a) => a.name === animationName)) {
          playAnimation(char.id, animationName);
        }
      });
    },
    [playAnimation]
  );

  const togglePlayPauseAnimation = useCallback((instanceId: string) => {
    setLoadedCharacters((prev) =>
      prev.map((char) => {
        if (char.id !== instanceId || !char.currentAction) return char;

        const isCurrentlyPlaying = char.isPlayingAnimation && !char.currentAction.paused;
        if (isHinaPianoPerformer(char.manifestEntry, char.scene)) {
          enforceHinaPianoWeaponHidden(char.scene);
        }
        if (isCurrentlyPlaying) {
          char.currentAction.paused = true;
          return { ...char, isPlayingAnimation: false };
        }
        char.currentAction.paused = false;
        char.currentAction.play();
        return { ...char, isPlayingAnimation: true };
      })
    );
  }, []);

  const removeCharacter = useCallback(
    (instanceId: string) => {
      clearPendingFadeTimer(instanceId);
      setLoadedCharacters((prev) => {
        const target = prev.find((c) => c.id === instanceId);
        if (target) {
          disposeHierarchy(target.scene, target.mixer, target.visibilityController);
        }
        const remaining = prev.filter((c) => c.id !== instanceId);
        if (selectedInstanceId === instanceId) {
          setSelectedInstanceId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    },
    [selectedInstanceId, clearPendingFadeTimer]
  );

  const clearCharacters = useCallback(() => {
    for (const timerId of pendingFadeTimersRef.current.values()) {
      clearTimeout(timerId);
    }
    pendingFadeTimersRef.current.clear();
    setLoadedCharacters((prev) => {
      prev.forEach((c) => disposeHierarchy(c.scene, c.mixer, c.visibilityController));
      return [];
    });
    setSelectedInstanceId(null);
  }, []);

  const updateCharacterTransform = useCallback(
    (
      instanceId: string,
      transform: {
        position?: THREE.Vector3;
        rotation?: THREE.Euler;
        scale?: THREE.Vector3;
        visible?: boolean;
        slotIndex?: number;
        stageRow?: 'front' | 'back';
      }
    ) => {
      setLoadedCharacters((prev) =>
        prev.map((char) => {
          if (char.id !== instanceId) return char;
          const updated = { ...char };
          if (transform.position) updated.position = transform.position.clone();
          if (transform.rotation) updated.rotation = transform.rotation.clone();
          if (transform.scale) updated.scale = transform.scale.clone();
          if (transform.visible !== undefined) updated.visible = transform.visible;
          if (transform.slotIndex !== undefined) updated.slotIndex = transform.slotIndex;
          if (transform.stageRow !== undefined) updated.stageRow = transform.stageRow;
          return updated;
        })
      );
    },
    []
  );

  // Batch formation transform update (single React state commit when multiple characters shift slots)
  const batchUpdateFormationTransforms = useCallback(
    (
      updates: Array<{
        id: string;
        position: THREE.Vector3;
        rotation: THREE.Euler;
        scale: THREE.Vector3;
        slotIndex: number;
        stageRow: 'front' | 'back';
      }>
    ) => {
      if (updates.length === 0) return;
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      setLoadedCharacters((prev) => {
        let changed = false;
        const next = prev.map((char) => {
          const u = updateMap.get(char.id);
          if (!u) return char;
          const posChanged =
            Math.abs(char.position.x - u.position.x) > 0.01 ||
            Math.abs(char.position.y - u.position.y) > 0.01 ||
            Math.abs(char.position.z - u.position.z) > 0.01;
          if (!posChanged && char.slotIndex === u.slotIndex && char.stageRow === u.stageRow) {
            return char;
          }
          changed = true;
          return {
            ...char,
            position: u.position.clone(),
            rotation: u.rotation.clone(),
            scale: u.scale.clone(),
            slotIndex: u.slotIndex,
            stageRow: u.stageRow,
          };
        });
        return changed ? next : prev;
      });
    },
    []
  );

  return {
    loadedCharacters,
    selectedInstanceId,
    setSelectedInstanceId,
    loading,
    loadingCharacter,
    loadingProgress,
    error,
    loadCharacter,
    playAnimation,
    setAllCharactersAnimation,
    togglePlayPauseAnimation,
    removeCharacter,
    clearCharacters,
    updateCharacterTransform,
    batchUpdateFormationTransforms,
  };
}
