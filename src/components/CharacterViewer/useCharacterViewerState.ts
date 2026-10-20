import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CharacterManifestEntry,
  LoadedCharacter,
  ViewerSettings,
} from '../../types/characterViewer';
import {
  createCharacterVisibilityController,
  CharacterVisibilityController,
} from './characterVisibilityController';

/**
 * Deep Resource Disposer to prevent memory leaks
 */
export const disposeGLTFScene = (
  scene: THREE.Object3D,
  mixer?: THREE.AnimationMixer,
  visibilityController?: CharacterVisibilityController
) => {
  if (visibilityController) {
    try {
      visibilityController.dispose();
    } catch {}
  }

  if (mixer) {
    mixer.stopAllAction();
    try {
      mixer.uncacheRoot(scene);
    } catch {}
  }

  if (!scene) return;
  scene.traverse((node: any) => {
    if (node.isMesh) {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((mat) => {
          Object.keys(mat).forEach((key) => {
            if (mat[key] && mat[key].isTexture) {
              mat[key].dispose();
            }
          });
          mat.dispose();
        });
      }
    }
  });
};

export const useCharacterViewerState = () => {
  const [loadedCharacters, setLoadedCharacters] = useState<LoadedCharacter[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [isMultiMode, setIsMultiMode] = useState<boolean>(false);

  const [settings, setSettings] = useState<ViewerSettings>({
    showGrid: true,
    showShadows: true,
    showBoundingBox: false,
    autoRotate: false,
    autoRotateSpeed: 1.0,
    environmentPreset: 'studio',
    backgroundColor: 'default',
  });

  const loaderRef = useRef<GLTFLoader>(new GLTFLoader());

  /**
   * Load a GLB character into the 3D scene
   */
  const loadCharacter = useCallback(
    async (
      entry: CharacterManifestEntry,
      options?: { replaceExisting?: boolean; customPosition?: THREE.Vector3 }
    ) => {
      const instanceId = `instance-${entry.id}-${Date.now()}`;
      const replaceAll = options?.replaceExisting ?? !isMultiMode;

      // Create placeholder loading state instance
      const newInstance: LoadedCharacter = {
        instanceId,
        manifestEntry: entry,
        scene: new THREE.Group(),
        position: options?.customPosition || new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        boundingBox: new THREE.Box3(),
        dimensions: new THREE.Vector3(1, 1, 1),
        centerOffset: new THREE.Vector3(0, 0, 0),
        visible: true,
        isLoading: true,
        loadProgress: 0,
        loadError: null,
      };

      setLoadedCharacters((prev) => {
        if (replaceAll) {
          // Dispose all existing scenes, mixers, and controllers
          prev.forEach((char) => disposeGLTFScene(char.scene, char.mixer, char.visibilityController));
          return [newInstance];
        }
        // Multi mode: auto-offset along X if at origin
        if (!options?.customPosition && prev.length > 0) {
          const offsetX = (prev.length % 2 === 1 ? 1 : -1) * Math.ceil(prev.length / 2) * 0.85;
          newInstance.position.set(offsetX, 0, 0);
        }
        return [...prev, newInstance];
      });

      setSelectedInstanceId(instanceId);

      try {
        const gltf = await new Promise<any>((resolve, reject) => {
          loaderRef.current.load(
            entry.url,
            resolve,
            (event) => {
              if (event.lengthComputable && event.total > 0) {
                const progress = Math.round((event.loaded / event.total) * 100);
                setLoadedCharacters((prev) =>
                  prev.map((item) =>
                    item.instanceId === instanceId ? { ...item, loadProgress: progress } : item
                  )
                );
              }
            },
            (err) => reject(err)
          );
        });

        const scene = gltf.scene as THREE.Group;

        // Traverse scene and setup shadows, materials, and culling
        scene.traverse((node: any) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;

            // Prevent animated skinned meshes from disappearing when bones animate outside bind bounds
            if (node.isSkinnedMesh) {
              node.frustumCulled = false;
            }

            if (node.material) {
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m: any) => {
                if ('map' in m && m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace;
                }
                if (m.transparent === false || ('alphaTest' in m && m.alphaTest > 0)) {
                  m.depthWrite = true;
                }
              });
            }
          }
        });

        // Compute bounding box and ground-align model
        const box = new THREE.Box3().setFromObject(scene);
        const dimensions = new THREE.Vector3();
        box.getSize(dimensions);

        const center = new THREE.Vector3();
        box.getCenter(center);

        // Ground offset: align bottom of bounding box to Y = 0
        const bottomY = box.min.y;
        scene.position.y -= bottomY;

        // Recompute grounded bounding box
        const groundedBox = new THREE.Box3().setFromObject(scene);

        // Animation System & Visibility Controller Setup
        const animations: THREE.AnimationClip[] = gltf.animations || [];
        const availableAnimations = animations.map((clip) => ({
          name: clip.name,
          duration: parseFloat(clip.duration.toFixed(2)),
          tracksCount: clip.tracks.length,
        }));
        const mixer = new THREE.AnimationMixer(scene);
        const visibilityController = createCharacterVisibilityController(scene, animations);

        let currentAction: THREE.AnimationAction | null = null;
        let currentAnimationName: string | null = null;

        const defaultClip =
          THREE.AnimationClip.findByName(animations, 'Cafe_Idle') ||
          THREE.AnimationClip.findByName(animations, 'Formation_Idle') ||
          THREE.AnimationClip.findByName(animations, 'Normal_Idle') ||
          THREE.AnimationClip.findByName(animations, 'Idle') ||
          (animations.length > 0 ? animations[0] : null);

        if (defaultClip) {
          currentAction = mixer.clipAction(defaultClip);
          currentAction.reset();
          currentAction.setEffectiveTimeScale(1);
          currentAction.setEffectiveWeight(1);
          currentAction.setLoop(THREE.LoopRepeat, Infinity);
          currentAction.play();
          currentAnimationName = defaultClip.name;
          visibilityController.applyAnimationVisibility(defaultClip);
        } else {
          visibilityController.resetToBaseline();
        }

        setLoadedCharacters((prev) =>
          prev.map((item) =>
            item.instanceId === instanceId
              ? {
                  ...item,
                  scene,
                  boundingBox: groundedBox,
                  dimensions,
                  centerOffset: center,
                  isLoading: false,
                  loadProgress: 100,
                  gltf,
                  animations,
                  availableAnimations,
                  mixer,
                  currentAction,
                  currentAnimationName,
                  isPlayingAnimation: currentAction !== null,
                  visibilityController,
                }
              : item
          )
        );
      } catch (error: any) {
        console.error(`Failed to load GLB model "${entry.displayName}":`, error);
        const errorMsg = error?.message || `Failed to fetch remote GLB file (${entry.filename})`;
        setLoadedCharacters((prev) =>
          prev.map((item) =>
            item.instanceId === instanceId
              ? {
                  ...item,
                  isLoading: false,
                  loadError: errorMsg,
                }
              : item
          )
        );
      }
    },
    [isMultiMode]
  );

  /**
   * Switch animation for a loaded character instance
   */
  const playAnimation = useCallback((instanceId: string, animationName: string) => {
    setLoadedCharacters((prev) => {
      const target = prev.find((item) => item.instanceId === instanceId);
      if (!target || !target.mixer) return prev;

      if (target.currentAnimationName === animationName && target.isPlayingAnimation) {
        return prev;
      }

      const clip = THREE.AnimationClip.findByName(target.animations || [], animationName);
      if (!clip) {
        console.warn(`[BlueArchiveViewer] Animation "${animationName}" not found on ${target.manifestEntry.displayName}`);
        return prev;
      }

      const prevAction = target.currentAction;
      const nextAction = target.mixer.clipAction(clip);

      // Apply visibility directives for this animation
      target.visibilityController?.applyAnimationVisibility(clip);

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
            if (oldAct !== target.mixer?.clipAction(clip)) {
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

      return prev.map((item) =>
        item.instanceId === instanceId
          ? {
              ...item,
              currentAction: nextAction,
              currentAnimationName: animationName,
              isPlayingAnimation: true,
            }
          : item
      );
    });
  }, []);

  /**
   * Toggle play / pause animation for a loaded character instance
   */
  const togglePlayPauseAnimation = useCallback((instanceId: string) => {
    setLoadedCharacters((prev) =>
      prev.map((item) => {
        if (item.instanceId !== instanceId || !item.currentAction) return item;
        const isCurrentlyPlaying = item.isPlayingAnimation && !item.currentAction.paused;
        if (isCurrentlyPlaying) {
          item.currentAction.paused = true;
          return { ...item, isPlayingAnimation: false };
        } else {
          item.currentAction.paused = false;
          item.currentAction.play();
          return { ...item, isPlayingAnimation: true };
        }
      })
    );
  }, []);

  /**
   * Remove a specific character instance and dispose resources
   */
  const removeCharacter = useCallback((instanceId: string) => {
    setLoadedCharacters((prev) => {
      const target = prev.find((item) => item.instanceId === instanceId);
      if (target) {
        disposeGLTFScene(target.scene, target.mixer, target.visibilityController);
      }
      const filtered = prev.filter((item) => item.instanceId !== instanceId);
      return filtered;
    });

    setSelectedInstanceId((prev) => (prev === instanceId ? null : prev));
  }, []);

  /**
   * Clear all characters and dispose resources
   */
  const clearCharacters = useCallback(() => {
    setLoadedCharacters((prev) => {
      prev.forEach((char) => disposeGLTFScene(char.scene, char.mixer, char.visibilityController));
      return [];
    });
    setSelectedInstanceId(null);
  }, []);

  /**
   * Update transform of a specific character instance
   */
  const updateCharacterTransform = useCallback(
    (
      instanceId: string,
      transform: {
        position?: [number, number, number];
        rotation?: [number, number, number];
        scale?: [number, number, number];
      }
    ) => {
      setLoadedCharacters((prev) =>
        prev.map((item) => {
          if (item.instanceId !== instanceId) return item;

          const newPos = transform.position
            ? new THREE.Vector3(...transform.position)
            : item.position;
          const newRot = transform.rotation
            ? new THREE.Euler(...transform.rotation)
            : item.rotation;
          const newScale = transform.scale
            ? new THREE.Vector3(...transform.scale)
            : item.scale;

          return {
            ...item,
            position: newPos,
            rotation: newRot,
            scale: newScale,
          };
        })
      );
    },
    []
  );

  /**
   * Toggle character visibility
   */
  const toggleCharacterVisibility = useCallback((instanceId: string) => {
    setLoadedCharacters((prev) =>
      prev.map((item) =>
        item.instanceId === instanceId ? { ...item, visible: !item.visible } : item
      )
    );
  }, []);

  return {
    loadedCharacters,
    selectedInstanceId,
    setSelectedInstanceId,
    isMultiMode,
    setIsMultiMode,
    settings,
    setSettings,
    loadCharacter,
    playAnimation,
    togglePlayPauseAnimation,
    removeCharacter,
    clearCharacters,
    updateCharacterTransform,
    toggleCharacterVisibility,
  };
};
