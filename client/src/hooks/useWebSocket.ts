import { useEffect, useRef, useState } from 'react';

// Global pub/sub for high-frequency websocket diffs
type Listener = (msg: any) => void;
const listeners = new Set<Listener>();

export function subscribeToEntityUpdates(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWebSocket(url: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!url) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        // Imperatively notify all subscribed layers immediately (bypasses React batching)
        listeners.forEach(fn => fn(msg));
      } catch (e) {
        console.error('WS Parse Error', e);
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => {
      ws.close();
    };
  }, [url]);

  return { ws: wsRef.current, connected };
}
