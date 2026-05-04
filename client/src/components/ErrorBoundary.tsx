import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            height: '100dvh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              padding: 40,
              textAlign: 'center',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: '2px solid var(--accent-danger)',
                color: 'var(--accent-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                margin: '0 auto 20px',
              }}
              >
                <AlertTriangle size={24} />
              </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              The application encountered an unexpected error. Try refreshing the page.
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: 'rgba(3,7,18,0.50)',
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  overflow: 'auto',
                  textAlign: 'left',
                  maxHeight: 120,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                padding: '10px 24px',
                background: 'var(--accent-primary)',
                border: 'none',
                color: 'var(--bg-base)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
