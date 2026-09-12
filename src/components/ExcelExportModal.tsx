import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  Check,
  ShieldCheck,
  Loader2,
  Tv,
} from 'lucide-react';
import { MalListItem, MalUser } from '../types';
import {
  ExportMode,
  exportAniVerseToExcel,
  generateExportFilename,
} from '../utils/excelExport';

interface ExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  season: 'spring' | 'summer';
  onSeasonChange?: (newSeason: 'spring' | 'summer') => void;
  malList: MalListItem[];
  seasonAnimeList: MalListItem[];
  customUserNotes?: Record<number, string>;
  malUser?: MalUser | null;
  onSuccessToast?: (message: string) => void;
}

export const ExcelExportModal: React.FC<ExcelExportModalProps> = ({
  isOpen,
  onClose,
  year,
  season,
  onSeasonChange,
  malList,
  seasonAnimeList,
  customUserNotes = {},
  malUser,
  onSuccessToast,
}) => {
  const [selectedMode, setSelectedMode] = useState<ExportMode>('season');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportComplete, setExportComplete] = useState<boolean>(false);

  if (!isOpen) return null;

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
  const currentSeasonLabel = `${capitalize(season)} ${year}`;
  const filenamePreview = generateExportFilename(selectedMode, season, year);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportComplete(false);

      const result = await exportAniVerseToExcel({
        mode: selectedMode,
        year,
        season,
        malList,
        seasonAnimeList,
        customUserNotes,
        malUser,
      });

      setExportComplete(true);
      if (onSuccessToast) {
        onSuccessToast(`Exported ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`);
      }

      setTimeout(() => {
        setIsExporting(false);
        setExportComplete(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to export Excel workbook:', err);
      setIsExporting(false);
      setExportComplete(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-xl bg-white dark:bg-[#1A1824] rounded-3xl border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl overflow-hidden"
        >
          {/* Top Decorative Header */}
          <div className="relative px-6 pt-6 pb-5 bg-gradient-to-r from-[#7567C7]/10 via-[#F0EDFA] to-[#6D9B7C]/10 dark:from-[#7567C7]/20 dark:via-[#201D33] dark:to-[#6D9B7C]/15 border-b border-[#E7E3DF] dark:border-[#2E2C37]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#7567C7] text-white flex items-center justify-center shadow-md shadow-[#7567C7]/25 shrink-0">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[#25242A] dark:text-[#F4F2F7] tracking-tight flex items-center gap-2">
                    <span>Export to Excel</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#7567C7]/15 dark:bg-[#7567C7]/30 text-[#7567C7] dark:text-[#C5BEF7] text-[11px] font-bold">
                      .XLSX
                    </span>
                  </h3>
                  <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-0.5">
                    Generate a polished companion spreadsheet report from your MAL data
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="text-[#77747D] hover:text-[#25242A] dark:hover:text-white p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Season Selector Confirmation */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F5F2] dark:bg-[#222030] border border-[#E7E3DF] dark:border-[#2E2C37]">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-[#7567C7]" />
                <div>
                  <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">Target Season</div>
                  <div className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
                    {seasonAnimeList.length} anime tracked in this season
                  </div>
                </div>
              </div>

              {onSeasonChange ? (
                <div className="inline-flex items-center gap-1 bg-white dark:bg-[#1A1824] p-1 rounded-xl border border-[#E7E3DF] dark:border-[#353244] shadow-2xs">
                  <button
                    type="button"
                    onClick={() => onSeasonChange('spring')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      season === 'spring'
                        ? 'bg-[#7567C7] text-white shadow-2xs'
                        : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
                    }`}
                  >
                    Spring 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => onSeasonChange('summer')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      season === 'summer'
                        ? 'bg-[#7567C7] text-white shadow-2xs'
                        : 'text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white'
                    }`}
                  >
                    Summer 2026
                  </button>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-xl bg-[#7567C7]/10 text-[#7567C7] font-bold text-xs">
                  {currentSeasonLabel}
                </span>
              )}
            </div>

            {/* Export Mode Selection */}
            <div>
              <label className="block text-xs font-bold text-[#77747D] dark:text-[#A4A1AA] uppercase tracking-wider mb-3">
                Choose Export Mode
              </label>

              <div className="grid grid-cols-1 gap-3">
                {/* Mode 1: Current Season */}
                <button
                  type="button"
                  onClick={() => setSelectedMode('season')}
                  className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex items-start gap-3.5 ${
                    selectedMode === 'season'
                      ? 'bg-[#F0EDFA]/60 dark:bg-[#25223D] border-[#7567C7] shadow-sm'
                      : 'bg-white dark:bg-[#1E1C2B] border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                      selectedMode === 'season'
                        ? 'border-[#7567C7] bg-[#7567C7] text-white'
                        : 'border-[#77747D]/40'
                    }`}
                  >
                    {selectedMode === 'season' && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#25242A] dark:text-[#F4F2F7]">
                        Current Season ({currentSeasonLabel})
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#7567C7]/10 dark:bg-[#7567C7]/25 text-[#7567C7] dark:text-[#C5BEF7] text-[10px] font-bold">
                        {seasonAnimeList.length} Anime
                      </span>
                    </div>
                    <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1 leading-relaxed">
                      Exports your selected season dashboard, active tracking table, and visual statistics dashboard with charts.
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10.5px] text-[#7567C7] dark:text-[#C5BEF7] font-medium flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-md bg-[#7567C7]/10">✨ Welcome</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#7567C7]/10">📺 Anime List</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#7567C7]/10">📊 Statistics (Charts)</span>
                    </div>
                  </div>
                </button>

                {/* Mode 2: All Anime */}
                <button
                  type="button"
                  onClick={() => setSelectedMode('all')}
                  className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex items-start gap-3.5 ${
                    selectedMode === 'all'
                      ? 'bg-[#F0EDFA]/60 dark:bg-[#25223D] border-[#7567C7] shadow-sm'
                      : 'bg-white dark:bg-[#1E1C2B] border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                      selectedMode === 'all'
                        ? 'border-[#7567C7] bg-[#7567C7] text-white'
                        : 'border-[#77747D]/40'
                    }`}
                  >
                    {selectedMode === 'all' && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#25242A] dark:text-[#F4F2F7]">
                        All Anime (Complete MAL List)
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#6D9B7C]/15 dark:bg-[#6D9B7C]/25 text-[#6D9B7C] text-[10px] font-bold">
                        {malList.length} Anime
                      </span>
                    </div>
                    <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1 leading-relaxed">
                      Ignores season boundaries and exports your entire MyAnimeList catalogue with lifetime statistics & charts.
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10.5px] text-[#6D9B7C] font-medium flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-md bg-[#6D9B7C]/10">✨ Welcome</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#6D9B7C]/10">📺 Anime List (All)</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#6D9B7C]/10">📊 Statistics (Charts)</span>
                    </div>
                  </div>
                </button>

                {/* Mode 3: Full AniVerse Report */}
                <button
                  type="button"
                  onClick={() => setSelectedMode('full')}
                  className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex items-start gap-3.5 ${
                    selectedMode === 'full'
                      ? 'bg-[#F0EDFA]/60 dark:bg-[#25223D] border-[#7567C7] shadow-sm'
                      : 'bg-white dark:bg-[#1E1C2B] border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7]/40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                      selectedMode === 'full'
                        ? 'border-[#7567C7] bg-[#7567C7] text-white'
                        : 'border-[#77747D]/40'
                    }`}
                  >
                    {selectedMode === 'full' && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#25242A] dark:text-[#F4F2F7]">
                        Full AniVerse Report
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#C69A55]/15 dark:bg-[#C69A55]/25 text-[#C69A55] text-[10px] font-bold">
                        4 Worksheets
                      </span>
                    </div>
                    <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1 leading-relaxed">
                      Comprehensive 4-sheet report: season dashboard, anime list, visual charts & genre breakdown, plus full catalogue.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[#C69A55] font-medium flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-md bg-[#C69A55]/10">✨ Welcome</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#C69A55]/10">📺 Anime List</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#C69A55]/10">📊 Statistics (Charts)</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#C69A55]/10 font-bold">📚 All Anime</span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Target Filename Preview & Compatibility Guarantee */}
            <div className="p-3.5 rounded-2xl bg-[#F7F5F2] dark:bg-[#201E2E] border border-[#E7E3DF] dark:border-[#2E2C37] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#77747D] dark:text-[#A4A1AA] font-medium">Export Filename:</span>
                <span className="font-mono font-bold text-[#7567C7] dark:text-[#C5BEF7]">{filenamePreview}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#6D9B7C] font-medium">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Compatible with Microsoft Excel, Google Sheets, and LibreOffice.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="px-4 py-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] text-xs font-bold text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting || (selectedMode === 'season' && seasonAnimeList.length === 0 && malList.length === 0)}
                className="px-6 py-2.5 rounded-xl bg-[#7567C7] hover:bg-[#6556b6] text-white text-xs font-bold transition-all shadow-md shadow-[#7567C7]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating Excel File...</span>
                  </>
                ) : exportComplete ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <span>Export Complete!</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Download .XLSX Workbook</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
