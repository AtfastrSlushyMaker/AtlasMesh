import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${++idRef.current}`;
    const toast: Toast = { id, message, type, duration };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  const typeStyles: Record<ToastType, { border: string; icon: string; glow: string }> = {
    success: { border: 'var(--accent-success)', icon: '✓', glow: 'rgba(34,197,94,0.2)' },
    error: { border: 'var(--accent-danger)', icon: '✕', glow: 'rgba(239,68,68,0.2)' },
    warning: { border: 'var(--accent-warning)', icon: '◆', glow: 'rgba(245,158,11,0.2)' },
    info: { border: 'var(--accent-primary)', icon: 'ℹ', glow: 'rgba(56,189,248,0.2)' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => {
        const style = typeStyles[toast.type];
        return (
          <div
            key={toast.id}
            onClick={() => onRemove(toast.id)}
            style={{
              pointerEvents: 'auto',
              animation: 'toast-enter 280ms cubic-bezier(0.16,1,0.3,1) forwards',
              background: 'rgba(8,12,24,0.92)',
              backdropFilter: 'blur(20px)',
              borderLeft: `3px solid ${style.border}`,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${style.glow}`,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              transition: 'opacity 200ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `1.5px solid ${style.border}`,
                color: style.border,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {style.icon}
            </span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
                fontWeight: 400,
              }}
            >
              {toast.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
