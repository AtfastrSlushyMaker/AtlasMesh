import { useSyncExternalStore } from 'react';
import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiClose, mdiInformationOutline } from '@mdi/js';
import { Icon } from './Icon';

type Kind = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
  action?: { label: string; run: () => void };
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: Kind = 'info', action?: Toast['action']) {
  const t = { id: ++seq, kind, text, action };
  toasts = [...toasts.slice(-2), t];
  emit();
  // Toasts with an action wait for the user; errors stay a little longer.
  if (!action) setTimeout(() => dismiss(t.id), kind === 'error' ? 8000 : 4500);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const ICON: Record<Kind, [string, string]> = {
  info: [mdiInformationOutline, 'var(--chart-blue)'],
  success: [mdiCheckCircleOutline, 'var(--ok)'],
  error: [mdiAlertCircleOutline, 'var(--bad)'],
};

export function Toasts() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast panel rise">
          <Icon path={ICON[t.kind][0]} color={ICON[t.kind][1]} />
          <span>{t.text}</span>
          {t.action && (
            <button className="btn btn-sm" onClick={() => { t.action!.run(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Icon path={mdiClose} size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
