import type { Request } from 'express';

/**
 * Access rules shared by the Intel workspace and Settings.
 * - With OSINT_ACCESS_KEY set, callers must send it in x-atlas-key.
 * - Without it, Settings can only be changed from the machine running the
 *   server, so an open public deployment can't have its keys rewritten.
 */
export const accessKey = () => process.env.OSINT_ACCESS_KEY || '';

/**
 * Showcase mode is for a public demo (e.g. the Render deployment): the live
 * globe works, but the Intel workspace and all settings are off, so a public
 * server never spends API credit or makes lookups on visitors' behalf.
 */
export const isShowcase = () => process.env.ATLAS_MODE === 'showcase' ||
  (process.env.RENDER === 'true' && (process.env.ATLAS_MODE !== 'full' || !accessKey()));

export const REPO_URL = process.env.ATLAS_REPO_URL || 'https://github.com/AtfastrSlushyMaker/AtlasMesh';
export const IMAGE = process.env.ATLAS_IMAGE || 'ghcr.io/atfastrslushymaker/atlasmesh:latest';

export function hasKey(req: Request) {
  const k = accessKey();
  return !k || req.get('x-atlas-key') === k;
}

export function isLocalRequest(req: Request) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const forwarded = req.get('x-forwarded-for');
  return !forwarded && (ip === '127.0.0.1' || ip === '::1');
}

function hasTrustedOrigin(req: Request) {
  const origin = req.get('origin');
  // CLI tools do not send an Origin. Browsers do on settings mutations.
  if (!origin) return true;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return origin === `${req.protocol}://${req.get('host')}` || allowed.includes(origin);
}

/**
 * ATLAS_ALLOW_SETTINGS=1 lets any client that can reach the server change
 * settings. The Docker setup uses it because requests arrive from the
 * container bridge, not loopback; compose binds the port to 127.0.0.1.
 */
export function canEditSettings(req: Request) {
  if (isShowcase()) return false;
  if (accessKey()) return hasKey(req);
  // Loopback alone is insufficient: a third-party web page can issue requests
  // to localhost from the user's browser, especially with development CORS.
  return hasTrustedOrigin(req) && (process.env.ATLAS_ALLOW_SETTINGS === '1' || isLocalRequest(req));
}
