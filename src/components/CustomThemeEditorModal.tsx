import React, { useState, useEffect } from 'react';
import { X, Check, RotateCcw, Palette, Sparkles, Layers, Sliders, AlertCircle } from 'lucide-react';
import { CustomThemeConfig, DEFAULT_CUSTOM_THEME, PRESET_PALETTES, PresetPalette, isHexColorValid } from '../types/theme';

interface CustomThemeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: CustomThemeConfig;
  onSave: (config: CustomThemeConfig) => void;
  onReturnToBuiltIn?: () => void;
}

export const CustomThemeEditorModal: React.FC<CustomThemeEditorModalProps> = ({
  isOpen,
  onClose,
  initialConfig,
  onSave,
  onReturnToBuiltIn,
}) => {
  const [config, setConfig] = useState<CustomThemeConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<'presets' | 'editor'>('presets');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Sync initialConfig when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfig(initialConfig);
      setValidationErrors({});
      setSaveSuccessNotice(false);
    }
  }, [isOpen, initialConfig]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleColorChange = (key: keyof CustomThemeConfig, value: string) => {
    // Validate hex format
    if (typeof value === 'string' && value.startsWith('#')) {
      if (!isHexColorValid(value)) {
        setValidationErrors((prev) => ({
          ...prev,
          [key]: 'Invalid hex format (#RRGGBB)',
        }));
      } else {
        setValidationErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }

    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSelectPreset = (preset: PresetPalette) => {
    setConfig({ ...preset.colors });
    setValidationErrors({});
  };

  const handleResetToDefault = () => {
    setConfig({ ...DEFAULT_CUSTOM_THEME });
    setValidationErrors({});
  };

  const handleApplyAndSave = () => {
    // Check if any hex errors exist
    const hasErrors = Object.keys(validationErrors).length > 0;
    if (hasErrors) return;

    onSave(config);
    setSaveSuccessNotice(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  const solidPresets = PRESET_PALETTES.filter((p) => p.category === 'solid');
  const gradientPresets = PRESET_PALETTES.filter((p) => p.category === 'gradient');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-[#181720] border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-theme-editor-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E7E3DF] dark:border-[#2E2C37] flex items-center justify-between gap-3 bg-white/80 dark:bg-[#181720]/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#7567C7]/15 flex items-center justify-center text-[#7567C7]">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="custom-theme-editor-title"
                className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2"
              >
                <span>Customize Appearance</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A898F8] font-bold">
                  CUSTOM THEME
                </span>
              </h2>
              <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
                Choose coordinated palettes or design your own colors & gradients
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer"
            title="Close Editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-[#E7E3DF]/60 dark:border-[#2E2C37]/60 bg-[#F7F5F2]/40 dark:bg-[#201F2B]/40">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'presets'
                  ? 'bg-white dark:bg-[#262434] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                  : 'text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Palette Board</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-white dark:bg-[#262434] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                  : 'text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Color Editor</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#77747D] dark:text-[#9E9AA6] hover:text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer"
            title="Reset to default custom theme"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Defaults</span>
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* LIVE PREVIEW CONTAINER */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6]">
              <span>Live Theme Preview</span>
              <span className="font-mono text-[10px] opacity-75">Interactive token sample</span>
            </div>

            <div
              className="p-4 rounded-2xl border transition-all shadow-inner relative overflow-hidden"
              style={{
                background: config.useGradient
                  ? `linear-gradient(${config.gradientDir}, ${config.bgGradientStart}, ${config.bgGradientEnd})`
                  : config.pageBg,
                borderColor: config.borderColor,
                color: config.textColor,
              }}
            >
              <div
                className="p-3 rounded-xl border transition-all shadow-sm flex flex-col gap-2.5"
                style={{
                  backgroundColor: config.cardBg,
                  borderColor: config.borderColor,
                  color: config.textColor,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: config.primary }}
                    />
                    <span className="font-bold text-xs">Anime Tracker Preview Card</span>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      backgroundColor: `${config.primary}20`,
                      color: config.primary,
                    }}
                  >
                    Active Token
                  </span>
                </div>

                <p className="text-xs" style={{ color: config.mutedTextColor }}>
                  The preview updates in real-time as you select palettes or change hex colors below.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-xs font-bold shadow-xs cursor-pointer text-white"
                    style={{ backgroundColor: config.primary }}
                  >
                    Primary Button
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer"
                    style={{
                      borderColor: config.borderColor,
                      color: config.secondary,
                    }}
                  >
                    Secondary Tag
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: PRESET PALETTES */}
          {activeTab === 'presets' && (
            <div className="space-y-4">
              {/* Solid Palettes */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  <Layers className="h-3.5 w-3.5 text-[#7567C7]" />
                  <span>Solid Palettes (Coordinated Schemes)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {solidPresets.map((preset) => {
                    const isSelected =
                      config.primary === preset.colors.primary &&
                      config.pageBg === preset.colors.pageBg &&
                      !config.useGradient;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 relative ${
                          isSelected
                            ? 'border-[#7567C7] ring-2 ring-[#7567C7]/30 bg-[#7567C7]/5'
                            : 'border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40 bg-white dark:bg-[#1E1D24]'
                        }`}
                      >
                        {/* Color Swatch Trio */}
                        <div
                          className="h-10 w-full rounded-lg border border-black/10 flex items-center justify-around p-1 shadow-2xs"
                          style={{ backgroundColor: preset.colors.pageBg }}
                        >
                          <div
                            className="w-5 h-5 rounded-md shadow-2xs border border-white/20"
                            style={{ backgroundColor: preset.colors.cardBg }}
                          />
                          <div
                            className="w-4 h-4 rounded-full shadow-2xs"
                            style={{ backgroundColor: preset.colors.primary }}
                          />
                          <div
                            className="w-3.5 h-3.5 rounded-full shadow-2xs"
                            style={{ backgroundColor: preset.colors.secondary }}
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7] truncate">
                            {preset.name}
                          </p>
                          <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] line-clamp-1">
                            {preset.description}
                          </p>
                        </div>

                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-[#7567C7] text-white">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gradient Palettes */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  <Sparkles className="h-3.5 w-3.5 text-[#E06D8A]" />
                  <span>Gradient Palettes (Atmospheric Canvas)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {gradientPresets.map((preset) => {
                    const isSelected =
                      config.primary === preset.colors.primary &&
                      config.bgGradientStart === preset.colors.bgGradientStart &&
                      config.useGradient;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 relative ${
                          isSelected
                            ? 'border-[#7567C7] ring-2 ring-[#7567C7]/30 bg-[#7567C7]/5'
                            : 'border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40 bg-white dark:bg-[#1E1D24]'
                        }`}
                      >
                        {/* Gradient Swatch */}
                        <div
                          className="h-10 w-full rounded-lg border border-black/10 flex items-center justify-around p-1 shadow-2xs"
                          style={{
                            background: `linear-gradient(${preset.colors.gradientDir}, ${preset.colors.bgGradientStart}, ${preset.colors.bgGradientEnd})`,
                          }}
                        >
                          <div
                            className="w-5 h-5 rounded-md shadow-2xs border border-white/20"
                            style={{ backgroundColor: preset.colors.cardBg }}
                          />
                          <div
                            className="w-4 h-4 rounded-full shadow-2xs"
                            style={{ backgroundColor: preset.colors.primary }}
                          />
                          <div
                            className="w-3.5 h-3.5 rounded-full shadow-2xs"
                            style={{ backgroundColor: preset.colors.secondary }}
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7] truncate">
                            {preset.name}
                          </p>
                          <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] line-clamp-1">
                            {preset.description}
                          </p>
                        </div>

                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-[#7567C7] text-white">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DETAILED COLOR EDITOR */}
          {activeTab === 'editor' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Primary Accent */}
                {renderColorField('primary', 'Primary Accent', config.primary, 'Main buttons, active badges, highlights')}

                {/* Secondary Accent */}
                {renderColorField('secondary', 'Secondary Accent', config.secondary, 'Tags, secondary controls, badges')}

                {/* Page Background */}
                {renderColorField('pageBg', 'Page Background (Solid)', config.pageBg, 'Main canvas and window backdrop')}

                {/* Card Surface */}
                {renderColorField('cardBg', 'Card & Panel Surface', config.cardBg, 'Cards, modals, headers, lists')}

                {/* Text Color */}
                {renderColorField('textColor', 'Main Text Color', config.textColor, 'Headings, anime titles, body text')}

                {/* Muted Text */}
                {renderColorField('mutedTextColor', 'Muted Text Color', config.mutedTextColor, 'Subtitles, episode counts, metadata')}

                {/* Border Color */}
                {renderColorField('borderColor', 'Border & Divider', config.borderColor, 'Card borders, separators, outlines')}
              </div>

              {/* Gradient Settings Toggle & Fields */}
              <div className="p-3.5 rounded-2xl bg-[#F7F5F2] dark:bg-[#201F2B] border border-[#E7E3DF] dark:border-[#2E2C37] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#7567C7]" />
                    <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      Background Gradient
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, useGradient: !prev.useGradient }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.useGradient ? 'bg-[#7567C7]' : 'bg-[#E7E3DF] dark:bg-[#403E4C]'
                    }`}
                    role="switch"
                    aria-checked={config.useGradient}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        config.useGradient ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {config.useGradient && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 animate-in fade-in duration-150">
                    {renderColorField('bgGradientStart', 'Gradient Start', config.bgGradientStart, 'Top/left color')}
                    {renderColorField('bgGradientEnd', 'Gradient End', config.bgGradientEnd, 'Bottom/right color')}

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#25242A] dark:text-[#F4F2F7]">
                        Direction
                      </label>
                      <select
                        value={config.gradientDir}
                        onChange={(e) => setConfig((prev) => ({ ...prev, gradientDir: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-[#181720] border border-[#E7E3DF] dark:border-[#2E2C37] focus:border-[#7567C7] focus:outline-none font-medium cursor-pointer"
                      >
                        <option value="to bottom">To Bottom</option>
                        <option value="to bottom right">To Bottom Right (Diagonal)</option>
                        <option value="to right">To Right</option>
                        <option value="to top right">To Top Right</option>
                      </select>
                      <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6]">Angle of the color gradient</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-[#E7E3DF] dark:border-[#2E2C37] flex items-center justify-between gap-3 bg-white dark:bg-[#181720]">
          {onReturnToBuiltIn ? (
            <button
              type="button"
              onClick={() => {
                onReturnToBuiltIn();
                onClose();
              }}
              className="text-xs font-semibold text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer"
            >
              Return to built-in themes
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyAndSave}
              disabled={Object.keys(validationErrors).length > 0}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                saveSuccessNotice
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#7567C7] hover:bg-[#6455B8] text-white disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {saveSuccessNotice ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Theme Applied!</span>
                </>
              ) : (
                <>
                  <Palette className="h-3.5 w-3.5" />
                  <span>Save & Apply Theme</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function renderColorField(
    key: keyof CustomThemeConfig,
    label: string,
    currentValue: string,
    helpText: string
  ) {
    const error = validationErrors[key];
    const safeHex = isHexColorValid(currentValue) ? currentValue : '#7567C7';

    return (
      <div key={key} className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-[#25242A] dark:text-[#F4F2F7]">
            {label}
          </label>
          {error && (
            <span className="text-[9.5px] text-red-500 font-semibold flex items-center gap-0.5">
              <AlertCircle className="h-2.5 w-2.5" />
              <span>Invalid hex</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Native Color Picker Circle */}
          <div className="relative shrink-0 w-8 h-8 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] overflow-hidden shadow-2xs cursor-pointer">
            <input
              type="color"
              value={safeHex}
              onChange={(e) => handleColorChange(key, e.target.value.toUpperCase())}
              className="absolute inset-[-10px] w-[60px] h-[60px] cursor-pointer border-0"
              title={`Choose ${label}`}
            />
          </div>

          {/* Hex Input Field */}
          <input
            type="text"
            value={currentValue}
            onChange={(e) => handleColorChange(key, e.target.value.toUpperCase())}
            maxLength={7}
            placeholder="#RRGGBB"
            className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-white dark:bg-[#181720] border transition-all focus:outline-none ${
              error
                ? 'border-red-500 focus:ring-1 focus:ring-red-500 text-red-500'
                : 'border-[#E7E3DF] dark:border-[#2E2C37] focus:border-[#7567C7] text-[#25242A] dark:text-[#F4F2F7]'
            }`}
          />
        </div>
        <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6]">{helpText}</p>
      </div>
    );
  }
};
