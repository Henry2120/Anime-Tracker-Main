import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sun, Moon, Sparkles } from 'lucide-react';
import { AppTheme, THEME_OPTIONS } from '../types/theme';

interface AppearanceSelectorProps {
  currentTheme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const AppearanceSelector: React.FC<AppearanceSelectorProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const activeOption = THEME_OPTIONS.find((t) => t.id === currentTheme) || THEME_OPTIONS[0];

  const getThemeIcon = (themeId: AppTheme) => {
    switch (themeId) {
      case 'light':
        return <Sun className="h-3.5 w-3.5 text-[#C69A55]" />;
      case 'dark':
        return <Moon className="h-3.5 w-3.5 text-[#7567C7]" />;
      case 'sakura':
        return <span className="text-xs leading-none">🌸</span>;
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        id="appearance-selector-button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Appearance: ${activeOption.name}. Click to change theme.`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="px-2.5 py-1.5 rounded-xl bg-white border border-[#E7E3DF] hover:border-[#7567C7]/40 text-[#25242A] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#7567C7]/40"
      >
        {getThemeIcon(currentTheme)}
        <span className="hidden sm:inline">{activeOption.name}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[#77747D] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="appearance-selector-button"
          className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-[#E7E3DF] shadow-xl p-1.5 z-50 focus:outline-none animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-2 border-b border-[#E7E3DF] mb-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D]">
                Appearance
              </span>
              <span className="text-[10px] font-medium text-[#7567C7]">
                外観設定
              </span>
            </div>
          </div>

          <div className="space-y-1">
            {THEME_OPTIONS.map((option) => {
              const isSelected = option.id === currentTheme;
              return (
                <button
                  key={option.id}
                  role="menuitem"
                  onClick={() => {
                    onThemeChange(option.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#F0EDFA] text-[#7567C7] font-semibold'
                      : 'text-[#25242A] hover:bg-[#F7F5F2]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-white border border-[#E7E3DF] shrink-0 mt-0.5 shadow-2xs">
                      {getThemeIcon(option.id)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#25242A]">
                          {option.name}
                        </span>
                        <span className="text-[10px] font-medium text-[#77747D]">
                          {option.nativeName}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#77747D] font-normal leading-tight mt-0.5">
                        {option.description}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 text-[#7567C7] shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
