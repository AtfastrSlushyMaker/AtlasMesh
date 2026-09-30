import axios, { AxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const USER_AGENT = 'AtlasMesh/2.1 (+https://github.com/AtfastrSlushyMaker/AtlasMesh)';

/**
 * Shared axios client. IPv4 is forced because several upstream hosts
 * advertise AAAA records that are unreachable from common hosting providers.
 */
export const client = axios.create({
  timeout: 20000,
  headers: { 'User-Agent': USER_AGENT },
  httpAgent: new http.Agent({ family: 4, keepAlive: true }),
  httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
  maxContentLength: 64 * 1024 * 1024,
});

const CACHE_DIR = path.resolve(process.env.ATLAS_CACHE_DIR || path.join(process.cwd(), '.cache'));

function cachePath(url: string) {
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  return path.join(CACHE_DIR, `${hash}.cache`);
}

const inflight = new Map<string, Promise<any>>();

/**
 * GET with an on-disk cache. Large static datasets (TLEs, power plants,
 * airports…) are cached so dev-server restarts don't hammer upstream hosts
 * — Celestrak in particular rate-limits repeated downloads.
 *
 * If the network request fails and a stale cache entry exists, the stale copy
 * is returned instead of throwing.
 */
export async function fetchCached<T = any>(
  url: string,
  ttlMs: number,
  config: AxiosRequestConfig = {}
): Promise<T> {
  const file = cachePath(url);
  let stale: { data: T } | null = null;

  try {
    const stat = fs.statSync(file);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (Date.now() - stat.mtimeMs < ttlMs) return parsed.data as T;
    stale = parsed;
  } catch {
    // no cache yet
  }

  if (inflight.has(url)) return inflight.get(url)!;

  const p = (async () => {
    try {
      const res = await client.get(url, config);
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ url, data: res.data }));
      } catch (err: any) {
        console.warn('[cache] write failed:', err?.message);
      }
      return res.data as T;
    } catch (err) {
      if (stale) {
        console.warn(`[cache] network failed for ${url}; serving stale copy`);
        return stale.data;
      }
      throw err;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/** setTimeout-based poller that never overlaps and supports a dynamic delay. */
export function poll(fn: () => Promise<number | void>, defaultMs: number) {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const run = async () => {
    let next = defaultMs;
    try {
      const r = await fn();
      if (typeof r === 'number') next = r;
    } catch (err: any) {
      console.warn('[poll] unhandled error:', err?.message || err);
    }
    if (!stopped) timer = setTimeout(run, next);
  };
  run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
