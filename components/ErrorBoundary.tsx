import React, { Component, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in the fallback UI. Defaults to "This section". */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches rendering errors in any child tree and shows a recovery card
 * instead of crashing the whole app.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary] ${this.props.label ?? 'Component'} crashed:`, error, info.componentStack);
  }

  handleRetry = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      const label = this.props.label ?? 'This section';
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">{label} hit an error</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-1">
            {this.state.error?.message || 'Something unexpected happened.'}
          </p>
          <p className="text-xs text-slate-500 mb-5">
            If this keeps happening, check your API keys in Settings or try refreshing the page.
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-white text-sm font-medium transition-colors"
          >
            <RotateCcw size={15} /> Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
