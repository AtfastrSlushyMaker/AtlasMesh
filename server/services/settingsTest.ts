import WebSocket from 'ws';
import { client } from '../lib/http';
import { redactSecrets } from '../lib/secrets';

/** Check a key against its service without saving it. */
export async function testSetting(key: string, value: string, pair?: string): Promise<{ ok: boolean; message: string }> {
  switch (key) {
    case 'DEEPSEEK_API_KEY': {
      const base = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
      const r = await client.get(`${base}/models`, { headers: { Authorization: `Bearer ${value}` }, timeout: 15000 });
      const n = r.data?.data?.length;
      return { ok: true, message: `Key accepted${n ? ` · ${n} model${n > 1 ? 's' : ''} available` : ''}.` };
    }
    case 'GITHUB_TOKEN': {
      const r = await client.get('https://api.github.com/rate_limit', { headers: { Authorization: `Bearer ${value}` } });
      return { ok: true, message: `Token accepted · ${r.data?.rate?.limit ?? '?'} requests per hour.` };
    }
    case 'OPENSKY_CLIENT_ID':
    case 'OPENSKY_CLIENT_SECRET': {
      const id = key === 'OPENSKY_CLIENT_ID' ? value : pair || process.env.OPENSKY_CLIENT_ID;
      const secret = key === 'OPENSKY_CLIENT_SECRET' ? value : pair || process.env.OPENSKY_CLIENT_SECRET;
      if (!id || !secret) return { ok: false, message: 'Enter both the client ID and the client secret.' };
      const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret });
      await client.post('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { ok: true, message: 'OpenSky accepted these credentials.' };
    }
    case 'AISSTREAM_TOKEN':
      return new Promise((resolve) => {
        const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
        const done = (r: { ok: boolean; message: string }) => {
          clearTimeout(t);
          try { ws.close(); } catch { /* closed */ }
          resolve({ ...r, message: redactSecrets(r.message, [value, pair]).slice(0, 160) });
        };
        const t = setTimeout(() => done({ ok: false, message: 'No data within 12 seconds. The key may be wrong, or the service is slow; try again.' }), 12000);
        ws.on('open', () => ws.send(JSON.stringify({ APIKey: value, BoundingBoxes: [[[-90, -180], [90, 180]]], FilterMessageTypes: ['PositionReport'] })));
        ws.on('message', (m) => {
          const text = m.toString();
          if (/error/i.test(text) && text.length < 300) done({ ok: false, message: `AISStream: ${text}` });
          else done({ ok: true, message: 'Key accepted · ship positions are streaming.' });
        });
        ws.on('close', () => done({ ok: false, message: 'AISStream closed the connection. The key was probably rejected.' }));
        ws.on('error', (e) => done({ ok: false, message: e.message }));
      });
    case 'S2_API_KEY':
      await client.get('https://api.semanticscholar.org/graph/v1/author/search?query=test&limit=1', { headers: { 'x-api-key': value } });
      return { ok: true, message: 'Key accepted.' };
    case 'STACKEXCHANGE_KEY': {
      const r = await client.get(`https://api.stackexchange.com/2.3/info?site=stackoverflow&key=${encodeURIComponent(value)}`);
      return { ok: true, message: `Key accepted · ${r.data?.quota_remaining ?? '?'} requests left today.` };
    }
    case 'CERTSPOTTER_TOKEN':
      await client.get('https://api.certspotter.com/v1/issuances?domain=example.com', { headers: { Authorization: `Bearer ${value}` } });
      return { ok: true, message: 'Token accepted.' };
    default:
      return { ok: true, message: 'Nothing to test for this setting.' };
  }
}
