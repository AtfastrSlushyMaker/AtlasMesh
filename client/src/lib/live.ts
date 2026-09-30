import { useSyncExternalStore } from 'react';
import type { Entity, SourceInfo } from '../../../shared/entity';

/**
 * WebSocket feed. One connection for the whole app, reconnecting with
 * backoff. Layers subscribe imperatively to diffs (bypassing React), while
 * connection status and source health are exposed through a tiny store.
 */

export type Diff = { added: Entity[]; updated: Entity[]; removed: string[]; snapshot?: string[] };
type DiffListener = (d: Diff) => void;

export type ConnState = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface LiveState {
  conn: ConnState;
  sources: SourceInfo[];
  lastMessageAt: number | null;
}

let state: LiveState = { conn: 'connecting', sources: [], lastMessageAt: null };
const stateListeners = new Set<() => void>();
const diffListeners = new Set<DiffListener>();
let ws: WebSocket | null = null;
let layers: string[] = [];
let retry = 0;
let retryTimer: number | null = null;
let started = false;

function setState(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev the API runs on :3000 next to Vite; in production it's the same origin.
  return import.meta.env.DEV ? `${proto}//${location.hostname}:3000` : `${proto}//${location.host}`;
}

function connect() {
  setState({ conn: retry === 0 ? 'connecting' : 'reconnecting' });
  const socket = new WebSocket(wsUrl());
  ws = socket;
  socket.onopen = () => {
    retry = 0;
    setState({ conn: 'live' });
    socket.send(JSON.stringify({ type: 'subscribe', layers }));
  };
  socket.onmessage = (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === 'update') {
      diffListeners.forEach((fn) => fn(msg));
      // Throttle store updates; layers receive diffs directly.
      if (!state.lastMessageAt || Date.now() - state.lastMessageAt > 2000) setState({ lastMessageAt: Date.now() });
    } else if (msg.type === 'sources') {
      setState({ sources: msg.sources });
    }
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    const delay = Math.min(30000, 1000 * 2 ** retry) + Math.random() * 500;
    retry++;
    setState({ conn: retry > 6 ? 'offline' : 'reconnecting' });
    retryTimer = window.setTimeout(connect, delay);
  };
  socket.onerror = () => socket.close();
}

export function startLive() {
  if (started) return;
  started = true;
  connect();
  // Reconnect immediately when the tab comes back online or visible.
  window.addEventListener('online', () => {
    if (!ws) {
      if (retryTimer) clearTimeout(retryTimer);
      retry = 0;
      connect();
    }
  });
}

export function setSubscribedLayers(next: string[]) {
  layers = next;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subscribe', layers }));
}

export function onDiff(fn: DiffListener) {
  diffListeners.add(fn);
  return () => {
    diffListeners.delete(fn);
  };
}

export function useLive() {
  return useSyncExternalStore(
    (cb) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    () => state
  );
}
