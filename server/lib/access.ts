import type { Request } from 'express';

/**
 * Access rules shared by the Intel workspace and Settings.
 * - With OSINT_ACCESS_KEY set, callers must send it in x-atlas-key.
 * - Without it, Settings can only be changed from the machine running the
 *   server, so an open public deployment can't have its keys rewritten.
 */
export const accessKey = () => process.env.OSINT_ACCESS_KEY || '';

export function hasKey(req: Request) {
  const k = accessKey();
  return !k || req.get('x-atlas-key') === k;
}

export function isLocalRequest(req: Request) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const forwarded = req.get('x-forwarded-for');
  return !forwarded && (ip === '127.0.0.1' || ip === '::1');
}

export function canEditSettings(req: Request) {
  return accessKey() ? hasKey(req) : isLocalRequest(req);
}
