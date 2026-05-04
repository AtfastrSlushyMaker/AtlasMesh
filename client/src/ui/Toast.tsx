import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

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
  const typeStyles: Record<ToastType, { border: string; icon: React.ReactNode; glow: string }> = {
    success: { border: 'var(--accent-success)', icon: <Check size={12} />, glow: 'rgba(34,197,94,0.12)' },
    error: { border: 'var(--accent-danger)', icon: <X size={12} />, glow: 'rgba(239,68,68,0.12)' },
    warning: { border: 'var(--accent-warning)', icon: <AlertTriangle size={12} />, glow: 'rgba(245,158,11,0.12)' },
    info: { border: 'var(--accent-primary)', icon: <Info size={12} />, glow: 'rgba(56,189,248,0.12)' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 'var(--z-toast)',
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
              background: 'var(--bg-overlay)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border-subtle)',
              boxShadow: `0 8px 32px rgba(2,6,23,0.60)`,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              transition: 'opacity var(--transition-fast)',
              borderRadius: 'var(--radius-md)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${style.border}30`,
                color: style.border,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {style.icon}
            </span>
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
                fontWeight: 450,
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
