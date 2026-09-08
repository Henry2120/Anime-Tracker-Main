import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Sparkles, Loader2, BookOpen, AlertCircle } from 'lucide-react';
import { MalAnimeNode, MalListItem } from '../types';
import { MalCatalogueSearchCard } from './MalCatalogueSearchCard';

interface MalCatalogueSearchResultsProps {
  query: string;
  results: Array<{ node: MalAnimeNode }>;
  loading: boolean;
  userMalMap: Map<number, MalListItem>;
  addingAnimeId: number | null;
  onAdd: (node: MalAnimeNode) => void;
  onSelect?: (node: MalAnimeNode) => void;
  onEdit?: (node: MalAnimeNode) => void;
}

export const MalCatalogueSearchResults: React.FC<MalCatalogueSearchResultsProps> = ({
  query,
  results,
  loading,
  userMalMap,
  addingAnimeId,
  onAdd,
  onSelect,
  onEdit,
}) => {
  if (!query || query.trim().length < 2) {
    return null;
  }

  const trimmedQuery = query.trim();

  return (
    <div className="space-y-4 pt-4 border-t border-[#E7E3DF] dark:border-[#2E2C37]">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gradient-to-r from-[#F0EDFA]/60 to-transparent dark:from-[#25232F]/60 p-3.5 rounded-2xl border border-[#7567C7]/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#7567C7] flex items-center justify-center text-white shadow-xs">
            <Search className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-[#25242A] dark:text-[#EAE8F0]">
                MyAnimeList Catalogue Results
              </h4>
              <span className="px-2 py-0.5 rounded-full bg-[#7567C7]/15 text-[#7567C7] text-[11px] font-bold">
                Global Search
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-0.5">
              Discover and add titles directly from MyAnimeList
            </p>
          </div>
        </div>

        {!loading && (
          <span className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA] self-end sm:self-auto px-2 py-1 rounded-lg bg-white/80 dark:bg-[#1C1A24]/80 border border-[#E7E3DF] dark:border-[#2E2C37]">
            {results.length} {results.length === 1 ? 'title' : 'titles'} found
          </span>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl bg-white dark:bg-[#1C1A24] border border-[#E7E3DF] dark:border-[#2E2C37] text-center">
          <Loader2 className="h-8 w-8 text-[#7567C7] animate-spin mb-3" />
          <p className="text-sm font-bold text-[#25242A] dark:text-[#EAE8F0]">
            Searching MyAnimeList Catalogue...
          </p>
          <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
            Looking up "{trimmedQuery}" on MyAnimeList
          </p>
        </div>
      )}

      {/* Results List */}
      {!loading && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {results.map((item) => {
            const animeId = item.node.id;
            const isInList = userMalMap.has(animeId);
            const existingItem = userMalMap.get(animeId);
            const isAdding = addingAnimeId === animeId;

            return (
              <MalCatalogueSearchCard
                key={animeId}
                node={item.node}
                isInList={isInList}
                existingItem={existingItem}
                isAdding={isAdding}
                onAdd={onAdd}
                onSelect={onSelect}
                onEdit={onEdit}
              />
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && (
        <div className="text-center py-10 px-4 bg-white dark:bg-[#1C1A24] rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37]">
          <BookOpen className="h-8 w-8 text-[#77747D] dark:text-[#A4A1AA] mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-[#25242A] dark:text-[#EAE8F0]">
            No catalogue results found for "{trimmedQuery}"
          </p>
          <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1 max-w-md mx-auto">
            Try searching by English title, Romanized Japanese title, or keywords.
          </p>
        </div>
      )}
    </div>
  );
};
