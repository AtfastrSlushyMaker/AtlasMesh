/** Small fetch wrapper that turns API errors into readable messages. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: any) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.error || (res.status >= 500 ? 'The server could not complete the request.' : `Request failed (${res.status})`);
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`atlasmesh:${key}`);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`atlasmesh:${key}`, JSON.stringify(value));
    } catch {
      // storage unavailable (private mode) — preferences just won't persist
    }
  },
};
