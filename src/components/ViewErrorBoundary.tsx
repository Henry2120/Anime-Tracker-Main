import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  viewName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ViewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ViewErrorBoundary] Error loading ${this.props.viewName || 'view'}:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const isDynamicImportError =
        this.state.error?.message?.includes('dynamically imported module') ||
        this.state.error?.message?.includes('Failed to fetch') ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="py-20 px-6 flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 border border-amber-500/20">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-[#25242A] dark:text-[#F4F2F7] mb-2">
            {this.props.viewName ? `Failed to load ${this.props.viewName}` : 'Component Loading Issue'}
          </h3>
          <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mb-6 leading-relaxed">
            {isDynamicImportError
              ? 'A temporary network or module loading issue occurred while loading this view. Please try reloading.'
              : this.state.error?.message || 'An unexpected error occurred in this view.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7567C7] hover:bg-[#6355B5] text-white text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Loading
            </button>
            {isDynamicImportError && (
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-[#EFECE8] dark:hover:bg-[#2A2832] text-[#25242A] dark:text-[#F4F2F7] text-xs font-medium transition-all"
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
