import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CharacterManifestEntry } from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance, CharacterAnimationInfo } from './types';

/**
 * Deeply disposes a Three.js Object3D hierarchy and associated AnimationMixer
 */
export function disposeHierarchy(root: THREE.Object3D, mixer?: THREE.AnimationMixer) {
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

export function useCharacterLoader() {
  const [loadedCharacters, setLoadedCharacters] = useState<LoadedCharacterInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCharacter, setLoadingCharacter] = useState<CharacterManifestEntry | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [error, setError] = useState<{ character: CharacterManifestEntry; message: string } | null>(null);

  // Keep ref to all loaded instances for clean cleanup on unmount
  const loadedCharactersRef = useRef<LoadedCharacterInstance[]>([]);
  loadedCharactersRef.current = loadedCharacters;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      loadedCharactersRef.current.forEach((char) => {
        disposeHierarchy(char.scene, char.mixer);
      });
      loadedCharactersRef.current = [];
    };
  }, []);

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

                  if (mesh.geometry) {
                    vertexCount += mesh.geometry.attributes.position?.count || 0;
                  }

                  if (mesh.material) {
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach((m) => {
                      m.side = THREE.DoubleSide;
                      if ('map' in m && m.map) {
                        (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                      }
                      if ('roughness' in m && m.roughness === undefined) {
                        m.roughness = 0.5;
                      }
                    });
                  }
                }
              });

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
              }));

              // Create independent AnimationMixer for this character
              const mixer = new THREE.AnimationMixer(scene);

              // Target animation: defaults to Cafe_Idle for initial concert state
              let currentAction: THREE.AnimationAction | null = null;
              let currentAnimationName: string | null = null;

              const targetAnimName = options.initialAnimation || 'Cafe_Idle';
              const targetClip = THREE.AnimationClip.findByName(animations, targetAnimName);

              if (targetClip) {
                currentAction = mixer.clipAction(targetClip);
                currentAction.reset();
                currentAction.setLoop(THREE.LoopRepeat, Infinity);
                currentAction.play();
                currentAnimationName = targetAnimName;

                console.log(
                  `[Concert] Character ${entry.name}: ${targetAnimName} FOUND & PLAYING`
                );
              } else {
                console.warn(
                  `[Concert] Character ${entry.name}: ${targetAnimName} not found`
                );
                // Graceful fallback to Cafe_Reaction or first clip if target not found
                const fallbackClip =
                  THREE.AnimationClip.findByName(animations, 'Cafe_Reaction') ||
                  (animations.length > 0 ? animations[0] : null);

                if (fallbackClip) {
                  currentAction = mixer.clipAction(fallbackClip);
                  currentAction.reset();
                  currentAction.setLoop(THREE.LoopRepeat, Infinity);
                  currentAction.play();
                  currentAnimationName = fallbackClip.name;
                }
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
              };

              setLoadedCharacters((prev) => {
                if (options.replace) {
                  // Dispose old characters & mixers
                  prev.forEach((p) => disposeHierarchy(p.scene, p.mixer));
                  return [newInstance];
                } else if (options.slotIndex !== undefined) {
                  // Replace specific slot
                  const existingIdx = prev.findIndex((p) => p.slotIndex === options.slotIndex);
                  if (existingIdx !== -1) {
                    disposeHierarchy(prev[existingIdx].scene, prev[existingIdx].mixer);
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
    setLoadedCharacters((prev) =>
      prev.map((char) => {
        const clip = THREE.AnimationClip.findByName(char.animations, animationName);
        if (!clip) {
          console.warn(`[Concert] Character ${char.manifestEntry.name}: ${animationName} not found`);
          return char;
        }

        const prevAction = char.currentAction;
        const nextAction = char.mixer.clipAction(clip);
        nextAction.reset();
        nextAction.setLoop(THREE.LoopRepeat, Infinity);

        if (prevAction && prevAction !== nextAction) {
          prevAction.fadeOut(0.3);
          nextAction.fadeIn(0.3);
        }
        nextAction.play();

        return {
          ...char,
          currentAction: nextAction,
          currentAnimationName: animationName,
          isPlayingAnimation: true,
        };
      })
    );
  }, []);

  /**
   * Reusable animation playback function (Part 6 & 7)
   */
  const playAnimation = useCallback((instanceId: string, animationName: string) => {
    setLoadedCharacters((prev) =>
      prev.map((char) => {
        if (char.id !== instanceId) return char;

        const clip = THREE.AnimationClip.findByName(char.animations, animationName);
        if (!clip) {
          console.warn(`[Blue Archive Viewer] Animation "${animationName}" not found in model ${char.manifestEntry.name}`);
          return char;
        }

        const prevAction = char.currentAction;
        const nextAction = char.mixer.clipAction(clip);
        nextAction.reset();
        nextAction.setLoop(THREE.LoopRepeat, Infinity);

        if (prevAction && prevAction !== nextAction) {
          prevAction.fadeOut(0.25);
          nextAction.fadeIn(0.25);
        }
        nextAction.play();

        return {
          ...char,
          currentAction: nextAction,
          currentAnimationName: animationName,
          isPlayingAnimation: true,
        };
      })
    );
  }, []);

  /**
   * Toggle play / pause for character's current animation
   */
  const togglePlayPauseAnimation = useCallback((instanceId: string) => {
    setLoadedCharacters((prev) =>
      prev.map((char) => {
        if (char.id !== instanceId || !char.currentAction) return char;

        const isPaused = char.currentAction.paused;
        char.currentAction.paused = !isPaused;

        return {
          ...char,
          isPlayingAnimation: isPaused,
        };
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
        disposeHierarchy(target.scene, target.mixer);
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
      prev.forEach((c) => disposeHierarchy(c.scene, c.mixer));
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
