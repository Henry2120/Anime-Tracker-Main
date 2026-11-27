import { useCallback, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type { BookshelfPosition, Shelf } from '../types/domain';
import {
  BOOKSHELF_META,
  getBooksForShelfPosition,
} from '../utils/bookshelfPlacement';
import type { RegisteredBookPlacementEvent } from '../components/AddBookModal';
import {
  BookPlacementFlight,
  HeroBookInspection,
} from './BookPlacementAndInspection';
import { InstancedBookshelfBooks } from './InstancedBookshelfBooks';
import {
  LibraryCameraRig,
  type SceneCameraViewpoint,
} from './LibraryCameraRig';
import { LibraryLightingAndAtmosphere } from './LibraryLightingAndAtmosphere';
import {
  createArchiveMaterialLibrary,
  disposeAllHeroCoverTextures,
} from './proceduralMaterials';
import type { ArchiveQualitySettings } from './qualityConfig';
import { RoomArchitecture } from './RoomArchitecture';
import { ScenePerformanceBridge } from './ScenePerformanceBridge';

export interface Selected3DBookState {
  book: EnrichedBookRecord;
  shelf: BookshelfPosition;
  worldPos: [number, number, number];
}

interface MidnightArchive3DCanvasProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  viewpoint: SceneCameraViewpoint;
  inspectShelf: BookshelfPosition;
  selected3DBook: Selected3DBookState | null;
  lanternWarmth: boolean;
  quality: ArchiveQualitySettings;
  floatingPlacement: RegisteredBookPlacementEvent | null;
  onSelectBookshelf: (pos: BookshelfPosition) => void;
  onOpenComputer: () => void;
  onToggleLantern: () => void;
  onHoverBook: (hovered: { book: EnrichedBookRecord; shelf: BookshelfPosition } | null) => void;
  onSelectBook: (
    book: EnrichedBookRecord,
    shelf: BookshelfPosition,
    worldPos: [number, number, number]
  ) => void;
  onCompleteFloatingPlacement: () => void;
  onContextLostChange?: (lost: boolean) => void;
}

export function MidnightArchive3DCanvas({
  books,
  shelves,
  viewpoint,
  inspectShelf,
  selected3DBook,
  lanternWarmth,
  quality,
  floatingPlacement,
  onSelectBookshelf,
  onOpenComputer,
  onToggleLantern,
  onHoverBook,
  onSelectBook,
  onCompleteFloatingPlacement,
  onContextLostChange,
}: MidnightArchive3DCanvasProps) {
  const materials = useMemo(() => createArchiveMaterialLibrary(4), []);

  // Cleanly dispose shared materials & textures on unmount
  useEffect(() => {
    return () => {
      materials.dispose();
      disposeAllHeroCoverTextures();
    };
  }, [materials]);

  // Update procedural monitor display & banker lamp emissive shade when data/lamp toggles
  useEffect(() => {
    materials.updateMonitorScreen(books.length, lanternWarmth);
    materials.updateLampShade(lanternWarmth);
  }, [materials, books.length, lanternWarmth]);

  const activeShelf: BookshelfPosition | null =
    viewpoint === 'shelf_left'
      ? 'left'
      : viewpoint === 'shelf_middle'
        ? 'middle'
        : viewpoint === 'shelf_right'
          ? 'right'
          : viewpoint === 'inspect_book'
            ? inspectShelf
            : null;

  const targetSlotIndex = useMemo(() => {
    if (!floatingPlacement) return 0;
    const shelfBooks = getBooksForShelfPosition(
      books,
      shelves,
      floatingPlacement.targetShelf
    );
    const idx = shelfBooks.findIndex((b) => b.work.id === floatingPlacement.workId);
    return idx >= 0 ? idx : Math.max(0, shelfBooks.length - 1);
  }, [floatingPlacement, books, shelves]);

  const handleCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.08;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;

      const canvas = gl.domElement;
      const onLost = (e: Event) => {
        e.preventDefault();
        onContextLostChange?.(true);
      };
      const onRestored = () => {
        onContextLostChange?.(false);
      };
      canvas.addEventListener('webglcontextlost', onLost, false);
      canvas.addEventListener('webglcontextrestored', onRestored, false);
    },
    [onContextLostChange]
  );

  const highlightedShelf = floatingPlacement ? floatingPlacement.targetShelf : null;

  return (
    <Canvas
      frameloop="demand"
      dpr={quality.dpr}
      shadows={quality.shadows}
      camera={{ position: [0, 1.34, 2.02], fov: 48, near: 0.08, far: 26 }}
      gl={{
        antialias: quality.antialias,
        powerPreference: 'high-performance',
      }}
      onCreated={handleCreated}
      className="h-full w-full block"
      aria-label={`Interactive 3D library interior showing desk workstation and ${BOOKSHELF_META.left.label}, ${BOOKSHELF_META.middle.label}, and ${BOOKSHELF_META.right.label}`}
    >
      <LibraryCameraRig
        viewpoint={viewpoint}
        inspectShelf={inspectShelf}
        quality={quality}
      />

      <LibraryLightingAndAtmosphere
        lanternWarmth={lanternWarmth}
        quality={quality}
      />

      <RoomArchitecture
        materials={materials}
        lanternWarmth={lanternWarmth}
        shadowsEnabled={quality.shadows}
        activeViewpoint={viewpoint}
        highlightedShelf={highlightedShelf}
        onSelectBookshelf={onSelectBookshelf}
        onOpenComputer={onOpenComputer}
        onToggleLantern={onToggleLantern}
      />

      <InstancedBookshelfBooks
        books={books}
        shelves={shelves}
        materials={materials}
        maxBooksPerShelf={quality.maxRenderedBooksPerShelf}
        shadowsEnabled={quality.shadows}
        activeShelf={activeShelf}
        hiddenBook={
          selected3DBook && viewpoint === 'inspect_book'
            ? { workId: selected3DBook.book.work.id, shelf: selected3DBook.shelf }
            : floatingPlacement
              ? { workId: floatingPlacement.workId, shelf: floatingPlacement.targetShelf }
              : null
        }
        onHoverBook={onHoverBook}
        onSelectBook={onSelectBook}
      />

      {selected3DBook && viewpoint === 'inspect_book' && (
        <HeroBookInspection
          book={selected3DBook.book}
          shelf={selected3DBook.shelf}
          startWorld={selected3DBook.worldPos}
        />
      )}

      {floatingPlacement && (
        <BookPlacementFlight
          workId={floatingPlacement.workId}
          title={floatingPlacement.title}
          author={floatingPlacement.author}
          edition={floatingPlacement.edition}
          targetShelf={floatingPlacement.targetShelf}
          targetSlotIndex={targetSlotIndex}
          onComplete={onCompleteFloatingPlacement}
        />
      )}

      <ScenePerformanceBridge quality={quality} />
    </Canvas>
  );
}

export default MidnightArchive3DCanvas;
