import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Confirmation dialog for destructive actions (replaces window.confirm).
 * Usage: if (await confirmAction({ title, body, confirm: 'Delete' })) …
 */
interface Request {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmAction(opts: Omit<Request, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    current = { danger: true, ...opts, resolve };
    emit();
  });
}

function close(ok: boolean) {
  current?.resolve(ok);
  current = null;
  emit();
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    // Focus the safe choice first.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);
  if (!req) return null;
  return (
    <div className="overlay" style={{ zIndex: 95 }} onMouseDown={() => close(false)}>
      <div className="panel dialog rise" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="panel-title" style={{ marginBottom: 8 }}>{req.title}</h2>
        <p id="confirm-body" className="muted" style={{ marginTop: 0 }}>{req.body}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button ref={cancelRef} className="btn" onClick={() => close(false)}>Cancel</button>
          <button className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>{req.confirm}</button>
        </div>
      </div>
    </div>
  );
}
