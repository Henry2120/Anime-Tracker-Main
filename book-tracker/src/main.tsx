import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

if (typeof window !== 'undefined') {
  registerSW({ immediate: true });
}

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    if (error instanceof Error) return { error };
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    return { error: new Error(message) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Book Tracker error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] text-stone-900 p-6">
          <div className="max-w-md w-full rounded-2xl border border-stone-200 bg-white p-6 space-y-3 shadow-sm">
            <h1 className="font-editorial text-lg font-semibold">Unable to initialize Book Tracker</h1>
            <p className="text-xs text-stone-600 font-mono break-words">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
