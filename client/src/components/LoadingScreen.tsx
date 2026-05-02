import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Initializing AtlasMesh...' }: LoadingScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        gap: 24,
      }}
    >
      {/* Globe Spinner */}
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.15)',
            borderTopColor: 'var(--accent-primary)',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 8,
            borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.10)',
            borderBottomColor: 'var(--accent-primary)',
            animation: 'spin 1.4s linear infinite reverse',
          }}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            margin: '0 0 6px',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          AtlasMesh
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {message}
        </p>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: 200,
          height: 2,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '60%',
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-info))',
            borderRadius: 1,
            animation: 'shimmer 2s infinite linear',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );
}
