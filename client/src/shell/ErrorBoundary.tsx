import { Component, ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('AtlasMesh crashed', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
        <div className="panel" style={{ maxWidth: 480, padding: 24 }}>
          <h1 className="panel-title" style={{ marginBottom: 8 }}>AtlasMesh stopped working</h1>
          <p className="muted">Something in the interface failed. Reloading usually fixes it; your layer choices are saved.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-3)', maxHeight: 160, overflow: 'auto' }}>{this.state.error.message}</pre>
          <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
