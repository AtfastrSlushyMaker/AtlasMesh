export function Icon({ path, size = 18, color = 'currentColor', title }: { path: string; size?: number; color?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} style={{ display: 'block', flexShrink: 0, color }}>
      {title && <title>{title}</title>}
      <path d={path} fill="currentColor" />
    </svg>
  );
}
