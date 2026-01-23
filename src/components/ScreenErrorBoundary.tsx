import React from 'react';

type Props = {
  label?: string;
  onClose?: () => void;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  componentStack?: string;
};

export default class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      // eslint-disable-next-line no-console
      console.error('[ScreenErrorBoundary]', this.props.label || 'screen', error, info);
    } catch {}

    try {
      const payload = {
        at: new Date().toISOString(),
        label: this.props.label || null,
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        componentStack: String(info?.componentStack || ''),
      };
      window.localStorage.setItem('last_ui_crash', JSON.stringify(payload));
    } catch {}

    this.setState({ componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const label = this.props.label ? `${this.props.label} crashed` : 'This screen crashed';
    const message = this.state.error?.message || String(this.state.error);

    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="font-light">{label}</div>
          {this.props.onClose && (
            <button
              onClick={this.props.onClose}
              className="px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/20 text-white/90 text-sm font-light hover:bg-white/[0.12]"
            >
              Close
            </button>
          )}
        </div>

        <div className="p-4 overflow-auto">
          <div className="text-sm text-white/70 mb-2">
            The error was saved to <span className="text-white/90 font-normal">localStorage</span> as{' '}
            <span className="text-white/90 font-normal">last_ui_crash</span>.
          </div>
          <pre className="text-xs whitespace-pre-wrap break-words text-white/80 bg-white/[0.06] border border-white/10 rounded-lg p-3">
            {message}
            {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ''}
            {this.state.componentStack ? `\n\nComponent stack:\n${this.state.componentStack}` : ''}
          </pre>
        </div>
      </div>
    );
  }
}

