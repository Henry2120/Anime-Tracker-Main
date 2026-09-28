import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react';
import { AppTheme } from '../../../types/theme';

interface Props {
  children: ReactNode;
  theme?: AppTheme;
  onReturnToAnime?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MusicLabErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[MusicLabErrorBoundary] Caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const isDark = this.props.theme === 'dark';
      return (
        <div className={`min-h-screen w-full flex flex-col items-center justify-center p-6 ${
          isDark ? 'bg-[#0E0C15] text-white' : 'bg-[#FAF8F5] text-[#25242A]'
        }`}>
          <div className="max-w-md w-full p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Music Lab Interruption</h2>
              <p className="text-xs text-white/60 mt-1">
                A rendering issue occurred while initializing the performance stage.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6858BE] text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Stage</span>
              </button>
              {this.props.onReturnToAnime && (
                <button
                  type="button"
                  onClick={this.props.onReturnToAnime}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Anime</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
