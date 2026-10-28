import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, CharacterAnimationInfo } from './types';
import {
  createCharacterVisibilityController,
  CharacterVisibilityController,
  enforceHinaPianoWeaponHidden,
} from './characterVisibilityController';

/**
 * Deeply disposes a Three.js Object3D hierarchy and associated AnimationMixer
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

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          // Dispose textures
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

// Module-level persistent store so loaded 3D performers remain loaded across all view transitions
let globalLoadedCharactersCache: LoadedCharacterInstance[] = [];
let globalSelectedInstanceIdCache: string | null = null;

/**
 * Checks if a character is Dress Hina with Piano (the special solo piano performance)
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
  const hasHina = name.includes('hina') || id.includes('hina') || filename.includes('hina');
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
 * Creates or retrieves the seamlessly looping short piano-playing segment of Exs_Cutin.
 * Specifically for Dress Hina's piano performance (original duration 12s, active playing segment
 * occurs between frame 118 (~3.93s) and frame 211 (~7.03s) at 30 fps).
 * This must NEVER be applied to Arisu or other characters whose Exs_Cutin is their normal action.
 */
export function getOrCreateExsCutinLoop(
  animations: THREE.AnimationClip[],
  characterEntry?: CharacterManifestEntry,
  scene?: THREE.Object3D
): THREE.AnimationClip | null {
  // If characterEntry or scene is provided, verify this is actually Dress Hina with piano
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
  if (!originalCutin) return null;

  // Safeguard: Hina's piano performance cutin is 12s. If the clip duration is shorter than 7.1s,
  // frames 118-211 (3.93s-7.03s) cannot be extracted and it is NOT Hina's piano performance!
  if (originalCutin.duration < 7.1) {
    return null;
  }

  try {
    // Frame 118 (3.93s) to frame 211 (7.03s) at 30 fps produces the optimal smooth playing loop
    const sub = THREE.AnimationUtils.subclip(originalCutin, 'Exs_Cutin_PianoLoop', 118, 211, 30);
    // Explicitly guarantee Piano_Switch remains scaled and visible throughout
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

  // Keep ref and module-level cache in sync
  const loadedCharactersRef = useRef<LoadedCharacterInstance[]>(loadedCharacters);
  loadedCharactersRef.current = loadedCharacters;

  useEffect(() => {
    globalLoadedCharactersCache = loadedCharacters;
  }, [loadedCharacters]);

  useEffect(() => {
    globalSelectedInstanceIdCache = selectedInstanceId;
  }, [selectedInstanceId]);

  /**
   * Load a character GLB from its remote public URL
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
      } = { replace: true }
    ): Promise<LoadedCharacterInstance> => {
      setLoading(true);
      setLoadingCharacter(entry);
      setLoadingProgress(0);
      setError(null);

      const loader = new GLTFLoader();

      return new Promise<LoadedCharacterInstance>((resolve, reject) => {
        loader.load(
          entry.url,
          (gltf) => {
            try {
              const scene = gltf.scene || gltf.scenes[0];
              if (!scene) {
                throw new Error('GLTF file contains no valid scene');
              }

              // Compute bounding box & statistics
              let vertexCount = 0;
              let meshCount = 0;

              scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                  const mesh = obj as THREE.Mesh;
                  meshCount++;
                  mesh.castShadow = true;
                  mesh.receiveShadow = true;

                  // Prevent animated skinned meshes from disappearing when bones move outside bind bounding box
                  if ((obj as any).isSkinnedMesh) {
                    obj.frustumCulled = false;
                  }

                  if (mesh.geometry) {
                    vertexCount += mesh.geometry.attributes.position?.count || 0;
                  }

                  // Detect piano mesh
                  const isPianoMesh =
                    mesh.name === 'SubMesh_0' ||
                    mesh.name === 'Mesh_0' ||
                    mesh.name.toLowerCase().includes('piano') ||
                    Boolean(mesh.parent?.name?.toLowerCase().includes('piano')) ||
                    Boolean(mesh.parent?.parent?.name?.toLowerCase().includes('piano'));

                  if (mesh.material) {
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach((m) => {
                      // Preserve original material.side from GLTF specifications (do not force DoubleSide globally)
                      if ('map' in m && m.map) {
                        (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                      }
                      if (m.transparent === false || ('alphaTest' in m && (m as any).alphaTest > 0)) {
                        m.depthWrite = true;
                      }
                      if (isPianoMesh) {
                        // Piano lacquer finish: smooth glossy clearcoat, elegant specular shine
                        if ('roughness' in m) (m as THREE.MeshStandardMaterial).roughness = 0.22;
                        if ('metalness' in m) (m as THREE.MeshStandardMaterial).metalness = 0.15;
                        // Restore original rich royal purple tint by balancing vertex colors
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

              // Enforce floating weapon is hidden immediately on load for Hina with Piano
              if (isHinaPianoPerformer(entry, scene)) {
                enforceHinaPianoWeaponHidden(scene);
              }

              scene.updateMatrixWorld(true);
              const box = new THREE.Box3().setFromObject(scene);
              const sphere = new THREE.Sphere();
              box.getBoundingSphere(sphere);

              const modelHeight = box.max.y - box.min.y;

              // Auto-ground offset so model feet touch Y=0
              const centerOffset = new THREE.Vector3(
                -(box.min.x + box.max.x) / 2,
                -box.min.y,
                -(box.min.z + box.max.z) / 2
              );

              // Position models neatly if multiple
              let initialPos = options.position;
              if (!initialPos) {
                if (options.replace) {
                  initialPos = new THREE.Vector3(0, 0, 0);
                } else {
                  // Offset based on existing character count
                  const count = loadedCharactersRef.current.length;
                  const xOffset = count % 2 === 1 ? Math.ceil(count / 2) * 1.1 : -(Math.ceil(count / 2) * 1.1);
                  initialPos = new THREE.Vector3(xOffset, 0, 0);
                }
              }

              // Create instance container
              const instanceGroup = new THREE.Group();
              instanceGroup.name = `CharacterInstance_${entry.id}`;

              // Position inner scene with grounding offset
              scene.position.copy(centerOffset);
              instanceGroup.add(scene);

              // =========================================================================
              // ANIMATION DISCOVERY & ANIMATION MIXER SETUP (Parts 2, 3, 4, 8)
              // =========================================================================
              const animations: THREE.AnimationClip[] = gltf.animations || [];
              const availableAnimations: CharacterAnimationInfo[] = animations.map((clip) => ({
                name: clip.name,
                duration: parseFloat(clip.duration.toFixed(2)),
                tracksCount: clip.tracks.length,
              }));

              // Create independent AnimationMixer for this character
              const mixer = new THREE.AnimationMixer(scene);

              // Create Generic Character Visibility Controller for switch metadata
              const visibilityController = createCharacterVisibilityController(scene, animations);

              // Target animation: defaults to Cafe_Idle for initial concert state
              let currentAction: THREE.AnimationAction | null = null;
              let currentAnimationName: string | null = null;

              const targetAnimName = options.initialAnimation || 'Cafe_Idle';
              const isHinaPiano = isHinaPianoPerformer(entry, scene);
              const isTargetExs = targetAnimName === 'Exs_Cutin' || targetAnimName === 'exs_cutin';
              const targetClip = (isTargetExs && isHinaPiano)
                ? getOrCreateExsCutinLoop(animations, entry, scene) || THREE.AnimationClip.findByName(animations, targetAnimName)
                : THREE.AnimationClip.findByName(animations, targetAnimName);

              if (targetClip) {
                currentAction = mixer.clipAction(targetClip);
                currentAction.reset();
                currentAction.setEffectiveTimeScale(1);
                currentAction.setEffectiveWeight(1);
                currentAction.setLoop(THREE.LoopRepeat, Infinity);
                currentAction.play();
                currentAnimationName = targetAnimName;

                visibilityController.applyAnimationVisibility(targetClip);

                console.log(
                  `[Concert] Character ${entry.name}: ${targetAnimName} FOUND & PLAYING`
                );
              } else {
                console.warn(
                  `[Concert] Character ${entry.name}: ${targetAnimName} not found`
                );
                // Graceful fallback to Cafe_Reaction, Formation_Idle, Normal_Idle, or first clip
                const fallbackClip =
                  THREE.AnimationClip.findByName(animations, 'Cafe_Reaction') ||
                  THREE.AnimationClip.findByName(animations, 'Formation_Idle') ||
                  THREE.AnimationClip.findByName(animations, 'Normal_Idle') ||
                  THREE.AnimationClip.findByName(animations, 'Idle') ||
                  (animations.length > 0 ? animations[0] : null);

                if (fallbackClip) {
                  currentAction = mixer.clipAction(fallbackClip);
                  currentAction.reset();
                  currentAction.setEffectiveTimeScale(1);
                  currentAction.setEffectiveWeight(1);
                  currentAction.setLoop(THREE.LoopRepeat, Infinity);
                  currentAction.play();
                  currentAnimationName = fallbackClip.name;

                  visibilityController.applyAnimationVisibility(fallbackClip);
                } else {
                  // No animations: reset switch objects to baseline
                  visibilityController.resetToBaseline();
                }
              }

              // For Hina with Piano, guarantee the piano and piano seat remain visible and properly scaled at [1,1,1]
              const initialPianoSwitch = scene.getObjectByName('Piano_Switch');
              if (initialPianoSwitch && isHinaPiano) {
                initialPianoSwitch.scale.set(1, 1, 1);
                initialPianoSwitch.visible = true;
              }

              // Enforce weapon remains hidden after animation and switch initialization
              if (isHinaPiano) {
                enforceHinaPianoWeaponHidden(scene);
              }

              const newInstance: LoadedCharacterInstance = {
                id: `instance-${entry.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                characterId: entry.id,
                manifestEntry: entry,
                scene: instanceGroup,
                position: initialPos,
                rotation: options.rotation || new THREE.Euler(0, 0, 0),
                scale: options.scale || new THREE.Vector3(1, 1, 1),
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
                  // Dispose old characters & mixers
                  prev.forEach((p) => disposeHierarchy(p.scene, p.mixer, p.visibilityController));
                  return [newInstance];
                } else if (options.slotIndex !== undefined) {
                  // Replace specific slot
                  const existingIdx = prev.findIndex((p) => p.slotIndex === options.slotIndex);
                  if (existingIdx !== -1) {
                    disposeHierarchy(prev[existingIdx].scene, prev[existingIdx].mixer, prev[existingIdx].visibilityController);
                    const next = [...prev];
                    next[existingIdx] = newInstance;
                    return next;
                  }
                  return [...prev, newInstance];
                } else {
                  return [...prev, newInstance];
                }
              });

              setSelectedInstanceId(newInstance.id);
              setLoading(false);
              setLoadingCharacter(null);
              setLoadingProgress(100);

              resolve(newInstance);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              setError({ character: entry, message: msg });
              setLoading(false);
              setLoadingCharacter(null);
              reject(err);
            }
          },
          (progressEvent) => {
            if (progressEvent.total > 0) {
              const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
              setLoadingProgress(pct);
            }
          },
          (err) => {
            const errorMsg =
              err instanceof Error
                ? err.message
                : `Failed to download ${entry.filename} from remote asset repository`;
            console.error(`Error loading GLB (${entry.name}):`, err);
            setError({ character: entry, message: errorMsg });
            setLoading(false);
            setLoadingCharacter(null);
            reject(new Error(errorMsg));
          }
        );
      });
    },
    []
  );

  /**
   * Batch switch animation for all loaded characters simultaneously (Part 3, 4, 7)
   * Smoothly crossfades and resets actions so performers visually begin together.
   */
  const setAllCharactersAnimation = useCallback((animationName: string) => {
    setLoadedCharacters((prev) => {
      let anyChanged = false;
      const updated = prev.map((char) => {
        // If character is currently performing Exs_Cutin in Hina's piano performance, preserve it!
        const isHinaPiano = isHinaPianoPerformer(char.manifestEntry, char.scene);
        const isExs = char.currentAnimationName === 'Exs_Cutin' || char.currentAnimationName === 'exs_cutin';
        if (isExs && isHinaPiano) return char;

        // If already playing this animation, skip without modifying state
        if (char.currentAnimationName === animationName && char.isPlayingAnimation) {
          return char;
        }

        const clip = THREE.AnimationClip.findByName(char.animations, animationName);
        if (!clip) {
          console.warn(`[Concert] Character ${char.manifestEntry.name}: ${animationName} not found`);
          return char;
        }

        anyChanged = true;
        const prevAction = char.currentAction;
        const nextAction = char.mixer.clipAction(clip);

        // Apply visibility directives for this animation
        char.visibilityController?.applyAnimationVisibility(clip);

        if (isHinaPiano) {
          enforceHinaPianoWeaponHidden(char.scene);
        }

        if (prevAction && prevAction !== nextAction) {
          prevAction.fadeOut(0.2);
          nextAction.reset();
          nextAction.enabled = true;
          nextAction.setEffectiveTimeScale(1);
          nextAction.setEffectiveWeight(1);
          nextAction.fadeIn(0.2);
          nextAction.setLoop(THREE.LoopRepeat, Infinity);
          nextAction.play();

          const oldAct = prevAction;
          setTimeout(() => {
            try {
              if (oldAct !== char.mixer.clipAction(clip)) {
                oldAct.stop();
              }
            } catch {}
          }, 220);
        } else {
          nextAction.reset();
          nextAction.enabled = true;
          nextAction.setEffectiveTimeScale(1);
          nextAction.setEffectiveWeight(1);
          nextAction.setLoop(THREE.LoopRepeat, Infinity);
          nextAction.play();
        }

        return {
          ...char,
          currentAction: nextAction,
          currentAnimationName: animationName,
          isPlayingAnimation: true,
        };
      });

      return anyChanged ? updated : prev;
    });
  }, []);

  /**
   * Reusable animation playback function (Part 6 & 7)
   */
  const playAnimation = useCallback((instanceId: string, animationName: string) => {
    setLoadedCharacters((prev) => {
      const target = prev.find((c) => c.id === instanceId);
      if (!target) return prev;

      // If already playing this exact animation, avoid redundant state updates
      if (target.currentAnimationName === animationName && target.isPlayingAnimation) {
        return prev;
      }

      const isHinaPiano = isHinaPianoPerformer(target.manifestEntry, target.scene);
      const isExs = animationName === 'Exs_Cutin' || animationName === 'exs_cutin';
      const clip = (isExs && isHinaPiano)
        ? getOrCreateExsCutinLoop(target.animations, target.manifestEntry, target.scene) || THREE.AnimationClip.findByName(target.animations, animationName)
        : THREE.AnimationClip.findByName(target.animations, animationName);
      if (!clip) {
        console.warn(`[Blue Archive Viewer] Animation "${animationName}" not found in model ${target.manifestEntry.name}`);
        return prev;
      }

      const prevAction = target.currentAction;
      const nextAction = target.mixer.clipAction(clip);

      // Apply visibility directives for the new animation clip
      target.visibilityController?.applyAnimationVisibility(clip);

      // Ensure Piano_Switch and grand piano are always visible and properly scaled for Hina with Piano
      const pianoSwitch = target.scene.getObjectByName('Piano_Switch');
      if (pianoSwitch && isHinaPiano) {
        pianoSwitch.scale.set(1, 1, 1);
        pianoSwitch.visible = true;
      }

      if (isHinaPiano) {
        enforceHinaPianoWeaponHidden(target.scene);
      }

      // Smooth, clean crossfade without leaving zombie actions in mixer
      if (prevAction && prevAction !== nextAction) {
        prevAction.fadeOut(0.2);
        nextAction.reset();
        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        nextAction.fadeIn(0.2);
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
        nextAction.play();

        const oldAct = prevAction;
        setTimeout(() => {
          try {
            if (oldAct !== target.mixer.clipAction(clip)) {
              oldAct.stop();
            }
          } catch {}
        }, 220);
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
  }, []);

  /**
   * Toggle play / pause for character's current animation
   */
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
          return {
            ...char,
            isPlayingAnimation: false,
          };
        } else {
          char.currentAction.paused = false;
          char.currentAction.play();
          return {
            ...char,
            isPlayingAnimation: true,
          };
        }
      })
    );
  }, []);

  /**
   * Remove a single loaded character instance and dispose its resources
   */
  const removeCharacter = useCallback((instanceId: string) => {
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
  }, [selectedInstanceId]);

  /**
   * Clear all loaded characters and dispose their resources
   */
  const clearCharacters = useCallback(() => {
    setLoadedCharacters((prev) => {
      prev.forEach((c) => disposeHierarchy(c.scene, c.mixer, c.visibilityController));
      return [];
    });
    setSelectedInstanceId(null);
  }, []);

  /**
   * Update transform of a specific loaded instance
   */
  const updateCharacterTransform = useCallback(
    (
      instanceId: string,
      transform: {
        position?: THREE.Vector3;
        rotation?: THREE.Euler;
        scale?: THREE.Vector3;
        visible?: boolean;
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
          return updated;
        })
      );
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
  };
}
