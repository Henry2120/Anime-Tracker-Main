import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sun, Moon, CloudRain, Cloud, Sparkles, Snowflake, Compass, Loader2, Palette, Sliders, Wind } from 'lucide-react';
import { AppTheme, THEME_OPTIONS, ThemeOption, CustomThemeConfig, DEFAULT_CUSTOM_THEME, RainIntensityLevel, RAIN_INTENSITY_LEVELS } from '../types/theme';
import { CustomThemeEditorModal } from './CustomThemeEditorModal';
import { loadMusicReactiveEnvSetting, saveMusicReactiveEnvSetting, MUSIC_REACTIVE_ENV_EVENT } from '../utils/environmentSettings';

interface AppearanceSelectorProps {
  currentTheme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  isLiveWeather?: boolean;
  onToggleLiveWeather?: (enabled: boolean) => void;
  liveWeatherCondition?: string | null;
  liveWeatherTemp?: number | null;
  liveWeatherLoading?: boolean;
  liveWeatherError?: string | null;
  // Custom Theme & Rain intensity controls
  customConfig?: CustomThemeConfig;
  onSaveCustomConfig?: (config: CustomThemeConfig) => void;
  rainIntensity?: RainIntensityLevel;
  onRainIntensityChange?: (level: RainIntensityLevel) => void;
}

export const AppearanceSelector: React.FC<AppearanceSelectorProps> = ({
  currentTheme,
  onThemeChange,
  isLiveWeather = false,
  onToggleLiveWeather,
  liveWeatherCondition,
  liveWeatherTemp,
  liveWeatherLoading = false,
  liveWeatherError,
  customConfig = DEFAULT_CUSTOM_THEME,
  onSaveCustomConfig,
  rainIntensity = 0,
  onRainIntensityChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomEditorOpen, setIsCustomEditorOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [musicReactiveEnv, setMusicReactiveEnv] = useState<boolean>(() =>
    loadMusicReactiveEnvSetting()
  );

  // Synchronize state across UI components
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setMusicReactiveEnv(customEvent.detail.enabled);
      } else {
        setMusicReactiveEnv(loadMusicReactiveEnvSetting());
      }
    };
    window.addEventListener(MUSIC_REACTIVE_ENV_EVENT, handleSync);
    return () => window.removeEventListener(MUSIC_REACTIVE_ENV_EVENT, handleSync);
  }, []);

  const handleToggleMusicReactiveEnv = (enabled: boolean) => {
    setMusicReactiveEnv(enabled);
    saveMusicReactiveEnvSetting(enabled);
  };

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
      case 'rain':
        return <CloudRain className="h-3.5 w-3.5 text-[#38BDF8]" />;
      case 'sunny':
        return <Sun className="h-3.5 w-3.5 text-[#0284C7]" />;
      case 'cloudy':
        return <Cloud className="h-3.5 w-3.5 text-[#64748B]" />;
      case 'starlight':
        return <Sparkles className="h-3.5 w-3.5 text-[#A78BFA]" />;
      case 'autumn':
        return <span className="text-xs leading-none">🍁</span>;
      case 'snow':
        return <Snowflake className="h-3.5 w-3.5 text-[#7DD3FC]" />;
      case 'custom':
        return <Palette className="h-3.5 w-3.5 text-[#7567C7]" />;
      default:
        return <Sun className="h-3.5 w-3.5" />;
    }
  };

  const classicThemes = THEME_OPTIONS.filter((t) => t.category === 'classic');
  const weatherThemes = THEME_OPTIONS.filter((t) => t.category === 'weather');
  const customOption = THEME_OPTIONS.find((t) => t.category === 'custom')!;

  const currentRainMeta =
    RAIN_INTENSITY_LEVELS.find((r) => r.level === rainIntensity) || RAIN_INTENSITY_LEVELS[0];

  return (
    <>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          type="button"
          id="appearance-selector-button"
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={`Appearance: ${activeOption.name}. Click to change theme.`}
          onClick={() => setIsOpen((prev) => !prev)}
          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40 dark:hover:border-[#7567C7]/60 text-[#25242A] dark:text-[#F4F2F7] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#7567C7]/40"
        >
          <span className="shrink-0">{getThemeIcon(currentTheme)}</span>
          <span className="hidden sm:inline font-medium">
            {currentTheme === 'custom' ? 'Custom' : activeOption.name}
          </span>
          {rainIntensity > 0 && (
            <span
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#38BDF8]/15 text-[#0284C7] dark:text-[#38BDF8] text-[9px] font-bold"
              title={`Rain level ${rainIntensity}: ${currentRainMeta.label}`}
            >
              <CloudRain className="h-2.5 w-2.5" />
              <span>Lv.{rainIntensity}</span>
            </span>
          )}
          {isLiveWeather && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#38BDF8]/15 text-[#0284C7] dark:text-[#38BDF8] text-[9.5px] font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8] animate-pulse" />
              Live
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-[#77747D] dark:text-[#9E9AA6] transition-transform duration-200 ${
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
            className="absolute right-0 mt-2 w-72 sm:w-84 max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl p-2.5 z-50 focus:outline-none animate-in fade-in zoom-in-95 duration-150 divide-y divide-[#E7E3DF] dark:divide-[#2E2C37]"
          >
            {/* Header & Subtitle */}
            <div className="px-2 py-1.5 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6]">
                  Theme & Atmosphere
                </span>
                <span className="text-[10px] font-medium text-[#7567C7] dark:text-[#C5BEF7]">
                  外観設定
                </span>
              </div>
            </div>

            {/* RAIN INTENSITY SLIDER (Independent Weather System) */}
            <div className="py-2.5 px-1.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CloudRain className="h-3.5 w-3.5 text-[#38BDF8]" />
                  <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    Rain Weather Effect
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {rainIntensity === 4 && <Wind className="h-3 w-3 text-[#38BDF8] animate-pulse" />}
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${
                      rainIntensity === 0
                        ? 'bg-black/5 dark:bg-white/5 text-[#77747D] dark:text-[#9E9AA6]'
                        : rainIntensity === 4
                        ? 'bg-[#38BDF8]/25 text-[#0284C7] dark:text-[#38BDF8] ring-1 ring-[#38BDF8]/50'
                        : 'bg-[#38BDF8]/15 text-[#0284C7] dark:text-[#38BDF8]'
                    }`}
                  >
                    Level {rainIntensity} · {currentRainMeta.label}
                  </span>
                </div>
              </div>

              {/* Slider Input */}
              <div className="px-1 space-y-1">
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={rainIntensity}
                  onChange={(e) => {
                    const nextLevel = parseInt(e.target.value, 10) as RainIntensityLevel;
                    if (onRainIntensityChange) {
                      onRainIntensityChange(nextLevel);
                    }
                    if (nextLevel > 0 && currentTheme !== 'rain' && currentTheme !== 'custom') {
                      onThemeChange('rain');
                      if (isLiveWeather && onToggleLiveWeather) onToggleLiveWeather(false);
                    }
                  }}
                  className="w-full h-1.5 bg-[#E7E3DF] dark:bg-[#343242] rounded-lg appearance-none cursor-pointer accent-[#0284C7] dark:accent-[#38BDF8]"
                  aria-label="Rain weather intensity slider from Off to Rainstorm"
                />

                <div className="flex justify-between text-[9px] text-[#77747D] dark:text-[#9E9AA6] px-0.5 font-medium">
                  <span>Off</span>
                  <span>Light</span>
                  <span>Moderate</span>
                  <span>Heavy</span>
                  <span className="font-bold text-[#0284C7] dark:text-[#38BDF8]">Rainstorm</span>
                </div>
              </div>

              <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] px-1 leading-tight">
                {currentRainMeta.description}
              </p>
            </div>

            {/* CUSTOM THEME & PALETTES SECTION */}
            <div className="py-2 px-1">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6]">
                  Custom Palette & Gradient
                </span>
                <span className="text-[9.5px] font-bold text-[#7567C7] dark:text-[#A898F8]">
                  NEW
                </span>
              </div>

              <div
                className={`p-2.5 rounded-xl border transition-all flex flex-col gap-2 ${
                  currentTheme === 'custom'
                    ? 'bg-[#7567C7]/10 dark:bg-[#7567C7]/20 border-[#7567C7]/40 ring-1 ring-[#7567C7]/30'
                    : 'bg-[#F7F5F2] dark:bg-[#26252F] border-[#E7E3DF] dark:border-[#2E2C37]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center border border-black/10 shadow-2xs shrink-0"
                      style={{
                        background: customConfig.useGradient
                          ? `linear-gradient(${customConfig.gradientDir}, ${customConfig.bgGradientStart}, ${customConfig.bgGradientEnd})`
                          : customConfig.pageBg,
                      }}
                    >
                      <Palette className="h-3.5 w-3.5 text-white drop-shadow-xs" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                        Custom Appearance
                      </p>
                      <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] leading-tight">
                        {customConfig.useGradient ? 'Atmospheric Gradient' : 'Personalized Palette'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {currentTheme !== 'custom' && (
                      <button
                        type="button"
                        onClick={() => {
                          onThemeChange('custom');
                          if (isLiveWeather && onToggleLiveWeather) onToggleLiveWeather(false);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-[#7567C7] hover:text-white text-[11px] font-semibold text-[#25242A] dark:text-white transition-colors cursor-pointer"
                      >
                        Apply
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomEditorOpen(true);
                        setIsOpen(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#7567C7] hover:bg-[#6455B8] text-white text-[11px] font-bold transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
                      title="Open Palette Board & Color Editor"
                    >
                      <Sliders className="h-3 w-3" />
                      <span>Customize</span>
                    </button>
                  </div>
                </div>

                {/* Mini Swatches Preview */}
                <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs"
                      style={{ backgroundColor: customConfig.primary }}
                      title="Accent"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs"
                      style={{ backgroundColor: customConfig.secondary }}
                      title="Secondary Accent"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs"
                      style={{ backgroundColor: customConfig.cardBg }}
                      title="Card"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs"
                      style={{ backgroundColor: customConfig.pageBg }}
                      title="Canvas"
                    />
                  </div>
                  <span className="text-[9.5px] font-mono text-[#77747D] dark:text-[#9E9AA6]">
                    {customConfig.primary}
                  </span>
                </div>
              </div>
            </div>

            {/* Optional Live Weather Mode Section */}
            {onToggleLiveWeather && (
              <div className="py-2 px-1">
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#F7F5F2] dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#2E2C37]">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white dark:bg-[#1E1D24] text-[#0284C7] dark:text-[#38BDF8] shadow-2xs">
                      <Compass className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                          Live Weather
                        </span>
                        {liveWeatherLoading && (
                          <Loader2 className="h-3 w-3 animate-spin text-[#7567C7]" />
                        )}
                      </div>
                      <p className="text-[10.5px] text-[#77747D] dark:text-[#9E9AA6] leading-tight mt-0.5">
                        {isLiveWeather
                          ? liveWeatherCondition
                            ? `${liveWeatherCondition}${typeof liveWeatherTemp === 'number' ? ` · ${Math.round(liveWeatherTemp)}°C` : ''}`
                            : 'Adapting to local weather'
                          : 'Auto-adapt to local sky & weather'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleLiveWeather(!isLiveWeather)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isLiveWeather ? 'bg-[#7567C7]' : 'bg-[#E7E3DF] dark:bg-[#403E4C]'
                    }`}
                    role="switch"
                    aria-checked={isLiveWeather}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isLiveWeather ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {liveWeatherError && isLiveWeather && (
                  <p className="text-[10.5px] text-amber-600 dark:text-amber-400 mt-1.5 px-1.5">
                    {liveWeatherError}
                  </p>
                )}
              </div>
            )}

            {/* Music-Reactive Environment Setting (Hina Piano Sky & Ground) */}
            <div className="py-2 px-1">
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#F7F5F2] dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#2E2C37]">
                <div className="flex items-center gap-2 pr-2">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-[#1E1D24] text-[#7567C7] dark:text-[#A898F8] shadow-2xs">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                        Music-Reactive Environment
                      </span>
                    </div>
                    <p className="text-[10.5px] text-[#77747D] dark:text-[#9E9AA6] leading-tight mt-0.5">
                      Change the sky and ground when Hina Piano plays music.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="toggle-music-reactive-env"
                  onClick={() => handleToggleMusicReactiveEnv(!musicReactiveEnv)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    musicReactiveEnv ? 'bg-[#7567C7]' : 'bg-[#E7E3DF] dark:bg-[#403E4C]'
                  }`}
                  role="switch"
                  aria-checked={musicReactiveEnv}
                  aria-label="Toggle Music-Reactive Environment"
                  title="Toggle Music-Reactive Environment"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      musicReactiveEnv ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Classic Themes */}
            <div className="py-2">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6]">
                Classic Themes
              </div>
              <div className="space-y-1">
                {classicThemes.map((option) => renderThemeItem(option))}
              </div>
            </div>

            {/* Weather & Atmospheric Themes */}
            <div className="pt-2">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6]">
                Atmospheric & Weather
              </div>
              <div className="space-y-1">
                {weatherThemes.map((option) => renderThemeItem(option))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Theme Editor Modal */}
      <CustomThemeEditorModal
        isOpen={isCustomEditorOpen}
        onClose={() => setIsCustomEditorOpen(false)}
        initialConfig={customConfig}
        onSave={(newConfig) => {
          if (onSaveCustomConfig) onSaveCustomConfig(newConfig);
          onThemeChange('custom');
        }}
        onReturnToBuiltIn={() => onThemeChange('light')}
      />
    </>
  );

  function renderThemeItem(option: ThemeOption) {
    const isSelected = option.id === currentTheme;
    return (
      <button
        key={option.id}
        role="menuitem"
        onClick={() => {
          onThemeChange(option.id);
          if (option.id === 'rain' && rainIntensity === 0 && onRainIntensityChange) {
            onRainIntensityChange(2);
          }
          if (isLiveWeather && onToggleLiveWeather) {
            onToggleLiveWeather(false);
          }
          setIsOpen(false);
        }}
        className={`w-full text-left p-2 rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer ${
          isSelected
            ? 'bg-[#7567C7]/10 dark:bg-[#7567C7]/20 border border-[#7567C7]/30 text-[#7567C7] dark:text-[#C5BEF7] font-semibold'
            : 'text-[#25242A] dark:text-[#F4F2F7] hover:bg-[#F7F5F2] dark:hover:bg-[#26252F] border border-transparent'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Swatch & Icon */}
          <div className="relative shrink-0 flex items-center">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xs overflow-hidden"
              style={{ backgroundColor: option.colors.card }}
            >
              {getThemeIcon(option.id)}
            </div>
            {/* Color preview dots */}
            <div className="flex -space-x-1 ml-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10"
                style={{ backgroundColor: option.colors.canvas }}
                title="Canvas color"
              />
              <span
                className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10"
                style={{ backgroundColor: option.colors.accent }}
                title="Accent color"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                {option.name}
              </span>
              <span className="text-[10px] font-medium text-[#77747D] dark:text-[#9E9AA6]">
                {option.nativeName}
              </span>
            </div>
            <p className="text-[10.5px] text-[#77747D] dark:text-[#9E9AA6] font-normal leading-tight truncate">
              {option.description}
            </p>
          </div>
        </div>

        {isSelected && (
          <Check className="h-4 w-4 text-[#7567C7] dark:text-[#C5BEF7] shrink-0" />
        )}
      </button>
    );
  }
};
