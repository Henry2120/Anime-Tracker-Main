import React from 'react';
import { BookOpen, Monitor, Plus, ScanBarcode } from 'lucide-react';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type { BookshelfPosition, Shelf } from '../types/domain';
import {
  BOOKSHELF_META,
  BOOKSHELF_POSITIONS,
  getBooksForShelfPosition,
} from '../utils/bookshelfPlacement';

interface WebGLFallbackProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  reason?: string;
  onSelectBookshelf: (position: BookshelfPosition) => void;
  onOpenComputer: () => void;
  onQuickAdd: (mode: 'single' | 'batch') => void;
}

export function WebGLErrorFallback({
  books,
  shelves,
  reason,
  onSelectBookshelf,
  onOpenComputer,
  onQuickAdd,
}: WebGLFallbackProps) {
  return (
    <div className="flex min-h-[calc(100vh-52px)] w-full flex-col items-center justify-center bg-[#080d18] p-4 sm:p-8 text-[#F4EFE6]">
      <div className="w-full max-w-4xl space-y-6 rounded-2xl border border-[#B49A67]/40 bg-[#101827] p-6 shadow-2xl">
        <div className="space-y-2 border-b border-[#B49A67]/25 pb-4">
          <h2 className="font-archive-display text-xl font-bold text-[#F4EFE6]">
            The Midnight Archive — Lightweight Mode
          </h2>
          <p className="text-xs sm:text-sm text-[#AEB9C9]">
            {reason ||
              '3D WebGL acceleration is unavailable on this browser. Full catalog, barcode scanning, bookshelves, and sync remain ready below.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {BOOKSHELF_POSITIONS.map((pos) => {
            const count = getBooksForShelfPosition(books, shelves, pos).length;
            const meta = BOOKSHELF_META[pos];
            return (
              <button
                key={pos}
                type="button"
                onClick={() => onSelectBookshelf(pos)}
                className="flex min-h-[84px] flex-col justify-between rounded-xl border border-[#B49A67]/35 bg-[#1B130F] p-4 text-left hover:border-[#D6BD8A]"
              >
                <span className="font-archive-display text-sm font-bold text-[#D6BD8A]">
                  {meta.label}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[#AEB9C9]">
                  <BookOpen className="h-3.5 w-3.5" />
                  {count} {count === 1 ? 'volume' : 'volumes'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenComputer}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#B49A67] px-4 text-xs font-semibold text-[#0B1120] hover:bg-[#D6BD8A]"
          >
            <Monitor className="h-4 w-4" />
            Open Archive Computer ({books.length} books)
          </button>
          <button
            type="button"
            onClick={() => onQuickAdd('single')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#B49A67]/40 bg-[#141E30] px-4 text-xs font-semibold text-[#F4EFE6]"
          >
            <Plus className="h-4 w-4 text-[#D6BD8A]" />
            Add Book
          </button>
          <button
            type="button"
            onClick={() => onQuickAdd('batch')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#7797C9]/45 bg-[#141E30] px-4 text-xs font-semibold text-[#AEB9C9]"
          >
            <ScanBarcode className="h-4 w-4 text-[#7797C9]" />
            Batch Scan
          </button>
        </div>
      </div>
    </div>
  );
}

export class SceneCanvasErrorBoundary extends React.Component<
  {
    fallback: React.ReactNode;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
