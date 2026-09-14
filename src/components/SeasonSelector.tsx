import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sparkles, Sun } from 'lucide-react';
import { AppSeason, SUPPORTED_SEASONS } from '../utils/seasonUtils';

interface SeasonSelectorProps {
  selectedSeason: 'spring' | 'summer';
  onSelectSeason: (season: 'spring' | 'summer') => void;
  seasons?: AppSeason[];
  variant?: 'default' | 'review' | 'compact';
  idPrefix?: string;
  className?: string;
}

export const SeasonSelector: React.FC<SeasonSelectorProps> = ({
  selectedSeason,
  onSelectSeason,
  seasons = SUPPORTED_SEASONS,
  variant = 'default',
  idPrefix = 'season-picker',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSeasonObj = seasons.find((s) => s.id === selectedSeason) || seasons[0];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (seasonId: 'spring' | 'summer') => {
    onSelectSeason(seasonId);
    setIsOpen(false);
  };

  const isReview = variant === 'review';

  return (
    <div
      ref={dropdownRef}
      id={`${idPrefix}-container`}
      className={`relative inline-block text-left ${className}`}
    >
      {/* Dropdown Trigger Button */}
      <button
        id={`${idPrefix}-button`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center justify-between gap-2 rounded-xl font-semibold text-xs transition-all cursor-pointer select-none ${
          isReview
            ? 'px-3 py-1.5 bg-[#F7F5F2] dark:bg-[#181628] hover:bg-[#EAE6DF] dark:hover:bg-[#201D36] text-[#25242A] dark:text-[#AEA8C9] border border-[#E7E3DF] dark:border-[#2D2A4A] shadow-2xs'
            : 'px-3.5 py-1.5 bg-[#F7F5F2] dark:bg-[#25232F] hover:bg-[#EFECE8] dark:hover:bg-[#2D2B38] text-[#25242A] dark:text-[#F4F2F7] border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xs'
        }`}
        title={`Select season (Current: ${activeSeasonObj.label})`}
      >
        <span className="flex items-center gap-1.5">
          {activeSeasonObj.id === 'spring' ? (
            <Sparkles className="h-3.5 w-3.5 text-[#6D9B7C] shrink-0" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-[#C69A55] shrink-0" />
          )}
          <span className="font-bold tracking-tight">{activeSeasonObj.label}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[#77747D] dark:text-[#9E9AA6] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#7567C7]' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          id={`${idPrefix}-menu`}
          role="listbox"
          aria-label="Supported Seasons"
          className="absolute z-50 mt-1.5 min-w-[170px] w-full origin-top-left rounded-xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6]">
            Select Season
          </div>
          {seasons.map((season) => {
            const isSelected = season.id === selectedSeason;
            return (
              <button
                key={season.id}
                id={`${idPrefix}-option-${season.id}`}
                role="option"
                aria-selected={isSelected}
                type="button"
                onClick={() => handleSelect(season.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#F0EDFA] dark:bg-[#2E2C37] text-[#7567C7] dark:text-[#C5BEF7] font-bold'
                    : 'text-[#25242A] dark:text-[#EAE8F0] hover:bg-[#F7F5F2] dark:hover:bg-[#262432]'
                }`}
              >
                <span className="flex items-center gap-2">
                  {season.id === 'spring' ? (
                    <Sparkles className={`h-3.5 w-3.5 ${isSelected ? 'text-[#6D9B7C]' : 'text-[#77747D]'}`} />
                  ) : (
                    <Sun className={`h-3.5 w-3.5 ${isSelected ? 'text-[#C69A55]' : 'text-[#77747D]'}`} />
                  )}
                  <span>{season.label}</span>
                </span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-[#7567C7] dark:text-[#C5BEF7] shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
