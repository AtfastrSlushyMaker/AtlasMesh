import React, { useState, useEffect } from 'react';
import { useKeyboardShortcuts, Shortcut } from '../hooks/useKeyboardShortcuts';
import { useToast } from '../ui/Toast';

interface KeyboardHelpModalProps {
  shortcuts: Shortcut[];
}

export function KeyboardHelpModal({ shortcuts }: KeyboardHelpModalProps) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  useKeyboardShortcuts([
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      action: () => setOpen(prev => !prev),
    },
    {
      key: 'Escape',
      description: 'Close modal',
      action: () => setOpen(false),
    },
  ]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(2,6,23,0.70)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: 480,
          maxWidth: '90vw',
          maxHeight: '80vh',
          background: 'rgba(10,15,30,0.95)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.60)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'var(--text-secondary)',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shortcuts.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {s.description}
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {s.ctrl && <KeyBadge label="Ctrl" />}
                  {s.shift && <KeyBadge label="Shift" />}
                  {s.alt && <KeyBadge label="Alt" />}
                  {s.meta && <KeyBadge label="⌘" />}
                  <KeyBadge label={s.key.toUpperCase()} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          Press <strong style={{ color: 'var(--text-secondary)' }}>?</strong> anytime to toggle this help
        </div>
      </div>
    </div>
  );
}

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 26,
        padding: '0 8px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 5,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        color: 'var(--text-primary)',
        boxShadow: '0 2px 0 rgba(0,0,0,0.30)',
      }}
    >
      {label}
    </kbd>
  );
}
