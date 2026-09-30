import type { Entity } from '../../shared/entity';
import { client, poll } from '../lib/http';

/**
 * OpenSky Network state vectors.
 *
 * Credit budget (2025+ API): anonymous ≈ 400 credits/day, a full-world
 * `/states/all` costs 4 → roughly one call every 15 minutes. Registered API
 * clients (OAuth2 client-credentials) get 4000/day → about once a minute.
 * Legacy basic-auth accounts are still honoured.
 */
const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

let token: { value: string; expiresAt: number } | null = null;

async function authHeaders(): Promise<Record<string, string>> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (id && secret) {
    if (!token || Date.now() > token.expiresAt - 60_000) {
      const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret });
      const res = await client.post(TOKEN_URL, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      token = { value: res.data.access_token, expiresAt: Date.now() + (res.data.expires_in ?? 1800) * 1000 };
    }
    return { Authorization: `Bearer ${token.value}` };
  }
  const user = process.env.OPENSKY_USERNAME;
  const pass = process.env.OPENSKY_PASSWORD;
  if (user && pass) return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
  return {};
}

export function isAircraftAuthenticated() {
  return !!(process.env.OPENSKY_CLIENT_ID || process.env.OPENSKY_USERNAME);
}

export function startAircraftSource(onEntities: (entities: Entity[]) => void) {
  const baseMs = isAircraftAuthenticated() ? 60_000 : 15 * 60_000;

  return poll(async () => {
    try {
      const res = await client.get(STATES_URL, { headers: await authHeaders(), timeout: 30000 });
      const states: any[] = res.data?.states || [];
      const out: Entity[] = [];
      for (const s of states) {
        const lon = s[5];
        const lat = s[6];
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;
        const onGround = !!s[8];
        const alt = typeof s[13] === 'number' ? s[13] : typeof s[7] === 'number' ? s[7] : 0;
        out.push({
          id: `aircraft:${s[0]}`,
          type: 'aircraft',
          position: { lat, lon, alt: onGround ? 0 : alt },
          velocity: typeof s[9] === 'number' ? s[9] : undefined,
          heading: typeof s[10] === 'number' ? s[10] : undefined,
          timestamp: (s[3] ?? s[4] ?? Date.now() / 1000) * 1000,
          metadata: {
            name: (s[1] || '').trim() || s[0],
            callsign: (s[1] || '').trim() || undefined,
            icao24: s[0],
            originCountry: s[2],
            onGround,
            altitudeM: alt,
            verticalRateMs: s[11] ?? undefined,
            squawk: s[14] || undefined,
            sourceUrl: `https://globe.adsbexchange.com/?icao=${s[0]}`,
          },
        });
      }
      console.log(`[Aircraft] ${out.length} aircraft`);
      onEntities(out);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        const retry = Number(err.response.headers?.['x-rate-limit-retry-after-seconds']);
        const wait = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 30 * 60_000;
        console.warn(`[Aircraft] OpenSky credit limit reached; retrying in ${Math.round(wait / 60000)} min`);
        return wait;
      }
      if (status === 401) token = null;
      console.warn('[Aircraft] Error:', err?.message || err);
      return 2 * 60_000;
    }
  }, baseMs);
}
