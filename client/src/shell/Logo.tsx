import { memo } from 'react';

interface LogoProps {
  size?: number;
}

export const Logo = memo(function Logo({ size = 28 }: LogoProps) {
  const s = size;
  const vb = 120;
  const scale = s / vb;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <filter id="glow-nodes" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-outer" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="0.25" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow" />
          </feMerge>
        </filter>
      </defs>

      {/* Globe background circle */}
      <circle cx="60" cy="60" r="44" fill="#020617" opacity="0" />

      {/* Outer glow ring */}
      <circle
        cx="60" cy="60" r="48"
        stroke="#38bdf8" strokeWidth="0.6" opacity="0.18"
        filter="url(#glow-outer)"
      />

      {/* Globe border */}
      <circle
        cx="60" cy="60" r="44"
        stroke="#38bdf8" strokeWidth="1.2" opacity="0.55"
        fill="none"
      />

      {/* Wireframe — latitude arcs */}
      <ellipse
        cx="60" cy="60" rx="44" ry="44"
        stroke="#38bdf8" strokeWidth="0.6" opacity="0.2"
        fill="none"
      />
      <ellipse
        cx="60" cy="60" rx="44" ry="18"
        stroke="#38bdf8" strokeWidth="0.4" opacity="0.14"
        fill="none"
      />
      <ellipse
        cx="60" cy="60" rx="44" ry="6"
        stroke="#38bdf8" strokeWidth="0.35" opacity="0.1"
        fill="none"
      />

      {/* Wireframe — longitude arcs */}
      <ellipse
        cx="60" cy="60" rx="20" ry="44"
        stroke="#22d3ee" strokeWidth="0.45" opacity="0.18"
        fill="none"
      />
      <ellipse
        cx="60" cy="60" rx="38" ry="44"
        stroke="#22d3ee" strokeWidth="0.45" opacity="0.13"
        fill="none"
      />

      {/* Mesh cross-lines */}
      <line x1="18" y1="22" x2="60" y2="38" stroke="#38bdf8" strokeWidth="0.35" opacity="0.12" />
      <line x1="102" y1="22" x2="60" y2="82" stroke="#38bdf8" strokeWidth="0.35" opacity="0.12" />
      <line x1="102" y1="98" x2="60" y2="38" stroke="#22d3ee" strokeWidth="0.35" opacity="0.12" />
      <line x1="18" y1="98" x2="60" y2="82" stroke="#22d3ee" strokeWidth="0.35" opacity="0.12" />

      {/* Data nodes with glow */}
      {/* Top node */}
      <circle cx="60" cy="16" r="3.5" fill="#00ffaa" opacity="0.9" filter="url(#glow-nodes)" />
      <circle cx="60" cy="16" r="1.8" fill="#ffffff" opacity="0.85" />

      {/* Right node */}
      <circle cx="104" cy="56" r="3.2" fill="#22d3ee" opacity="0.85" filter="url(#glow-nodes)" />
      <circle cx="104" cy="56" r="1.6" fill="#ffffff" opacity="0.75" />

      {/* Lower-left node */}
      <circle cx="30" cy="88" r="3.8" fill="#38bdf8" opacity="0.9" filter="url(#glow-nodes)" />
      <circle cx="30" cy="88" r="1.9" fill="#ffffff" opacity="0.85" />

      {/* Node connections (mesh edges) */}
      <line x1="60" y1="16" x2="104" y2="56" stroke="#00ffaa" strokeWidth="0.4" opacity="0.25" />
      <line x1="60" y1="16" x2="30" y2="88" stroke="#38bdf8" strokeWidth="0.4" opacity="0.2" />
      <line x1="104" y1="56" x2="30" y2="88" stroke="#22d3ee" strokeWidth="0.4" opacity="0.2" />
    </svg>
  );
});
