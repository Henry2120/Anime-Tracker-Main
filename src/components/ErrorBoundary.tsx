import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component error:', error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      const isDynamicImportError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.name === 'TypeError';

      return (
        <div className="min-h-[320px] w-full flex flex-col items-center justify-center p-6 text-center">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] shadow-xl max-w-md w-full space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
              {this.props.fallbackTitle || 'Something went wrong loading this view'}
            </h3>
            <p className="text-xs text-[#77747D] dark:text-[#9E9AA6]">
              {isDynamicImportError
                ? 'The module was updating or temporarily unreachable. Please retry.'
                : this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-2 px-4 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry Loading</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
