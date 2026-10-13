import { WebSocket } from 'ws';

// A stalled client must not retain an ever-growing stream of feed updates.
// Leave room for the initial snapshots of the large static layers.
export const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

export function sendSocketMessage(ws: WebSocket, msg: unknown): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
  if (ws.bufferedAmount + Buffer.byteLength(payload) > MAX_BUFFERED_BYTES) {
    // Reconnecting clients receive a fresh snapshot; silently dropping a diff
    // would leave the globe out of sync for the rest of the connection.
    ws.terminate();
    return false;
  }
  ws.send(payload, (err) => {
    if (err) ws.terminate();
  });
  return true;
}
