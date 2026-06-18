import React, { Component, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reloading: boolean;
}

const isChunkLoadError = (error: Error) =>
  error?.name === 'ChunkLoadError' ||
  /loading chunk/i.test(error?.message ?? '') ||
  /failed to fetch dynamically imported module/i.test(error?.message ?? '') ||
  /dynamically imported module/i.test(error?.message ?? '');

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, reloading: false };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.label ?? 'Component'} crashed:`, error, info.componentStack);

    // Chunk load error = stale HTML referencing old hashed assets after a deploy.
    // Auto-reload once — the fresh HTML will reference the correct chunks.
    if (isChunkLoadError(error)) {
      const reloadedKey = '__cb_chunk_reloaded';
      if (!sessionStorage.getItem(reloadedKey)) {
        sessionStorage.setItem(reloadedKey, '1');
        this.setState({ reloading: true });
        // Small delay so React finishes the current render cycle
        setTimeout(() => window.location.reload(), 300);
      }
    }
  }

  handleRetry() {
    this.setState({ hasError: false, error: null, reloading: false });
  }

  render() {
    if (this.state.reloading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-gold-500/40 border-t-gold-500 animate-spin mb-4" />
          <p className="text-sm text-slate-400">Updating to the latest version…</p>
        </div>
      );
    }

    if (this.state.hasError) {
      const label = this.props.label ?? 'This section';
      const isChunk = isChunkLoadError(this.state.error!);
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">
            {isChunk ? 'New version available' : `${label} hit an error`}
          </h3>
          <p className="text-sm text-slate-400 max-w-sm mb-1">
            {isChunk
              ? 'The app was just updated. Refresh to load the latest version.'
              : this.state.error?.message || 'Something unexpected happened.'}
          </p>
          {!isChunk && (
            <p className="text-xs text-slate-500 mb-5">
              If this keeps happening, check your API keys in Settings.
            </p>
          )}
          <button
            onClick={isChunk ? () => window.location.reload() : this.handleRetry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-white text-sm font-medium transition-colors mt-4"
          >
            <RotateCcw size={15} /> {isChunk ? 'Refresh now' : 'Try Again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
