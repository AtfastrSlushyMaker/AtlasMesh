import fs from 'fs';
import path from 'path';

/**
 * Runtime settings: API keys and service options that can be edited from the
 * app's Settings screen. Values saved here live in data/settings.json and are
 * applied to process.env, so the rest of the server reads them the same way
 * as values from .env. Environment variables set outside the app (.env or the
 * hosting dashboard) take precedence and are shown as read-only.
 */

export type SettingGroup = 'Live feeds' | 'Intel workspace' | 'Connector limits' | 'Security';

export interface SettingDef {
  key: string;
  label: string;
  group: SettingGroup;
  secret: boolean;
  help: string;
  link?: string;
  placeholder?: string;
  /** Live sources to restart when this value changes. */
  restarts?: string[];
}

export const SETTINGS: SettingDef[] = [
  { key: 'OPENSKY_CLIENT_ID', label: 'OpenSky client ID', group: 'Live feeds', secret: false, help: 'Aircraft refresh every minute instead of every 15 minutes.', link: 'https://opensky-network.org/my-opensky/account', restarts: ['aircraft'] },
  { key: 'OPENSKY_CLIENT_SECRET', label: 'OpenSky client secret', group: 'Live feeds', secret: true, help: 'Pairs with the client ID.', restarts: ['aircraft'] },
  { key: 'AISSTREAM_TOKEN', label: 'AISStream API key', group: 'Live feeds', secret: true, help: 'Turns on live ship positions. Free key.', link: 'https://aisstream.io/apikeys', restarts: ['ship'] },
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', group: 'Intel workspace', secret: true, help: 'Powers free-form questions and report summaries. Without it a rules-based analyst answers.', link: 'https://platform.deepseek.com/api_keys', placeholder: 'sk-…' },
  { key: 'LLM_BASE_URL', label: 'Language model endpoint', group: 'Intel workspace', secret: false, help: 'Any OpenAI-compatible API. Leave empty for DeepSeek.', placeholder: 'https://api.deepseek.com' },
  { key: 'LLM_MODEL', label: 'Model name', group: 'Intel workspace', secret: false, help: 'Leave empty for deepseek-chat.', placeholder: 'deepseek-chat' },
  { key: 'GITHUB_TOKEN', label: 'GitHub token', group: 'Connector limits', secret: true, help: 'Raises GitHub from 60 to 5,000 requests an hour. A token with no scopes is enough.', link: 'https://github.com/settings/tokens?type=beta', placeholder: 'github_pat_…' },
  { key: 'STACKEXCHANGE_KEY', label: 'Stack Exchange key', group: 'Connector limits', secret: true, help: 'Raises the Stack Overflow daily quota.', link: 'https://stackapps.com/apps/oauth/register' },
  { key: 'S2_API_KEY', label: 'Semantic Scholar key', group: 'Connector limits', secret: true, help: 'Avoids frequent rate limiting on author search.', link: 'https://www.semanticscholar.org/product/api#api-key' },
  { key: 'CERTSPOTTER_TOKEN', label: 'Cert Spotter token', group: 'Connector limits', secret: true, help: 'More certificate transparency lookups per hour.', link: 'https://sslmate.com/certspotter/api/' },
  { key: 'OSINT_ACCESS_KEY', label: 'Workspace access key', group: 'Security', secret: true, help: 'Anyone using the Intel workspace or Settings must enter this. Set it on any public deployment.' },
];

const FILE = path.resolve(process.env.ATLAS_SETTINGS_FILE || path.join(process.cwd(), 'data', 'settings.json'));

let saved: Record<string, string> = {};
/** Keys that came from the real environment before the app applied its own. */
const external = new Set<string>();

export function loadSettings() {
  for (const s of SETTINGS) if (process.env[s.key]) external.add(s.key);
  try {
    saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    saved = {};
  }
  for (const [k, v] of Object.entries(saved)) {
    if (!external.has(k) && SETTINGS.some((s) => s.key === k) && v) process.env[k] = v;
  }
}

export function settingsSummary() {
  return SETTINGS.map((s) => {
    const value = process.env[s.key];
    return {
      ...s,
      set: !!value,
      source: external.has(s.key) ? 'environment' : value ? 'app' : null,
      preview: !value ? null : s.secret ? `••••${value.slice(-4)}` : value,
    };
  });
}

/** Apply edits. `null` or '' clears a value. Returns source ids to restart. */
export function updateSettings(values: Record<string, string | null>) {
  const restart = new Set<string>();
  const changed: string[] = [];
  const next = { ...saved };
  const edits: Record<string, string> = {};
  for (const [k, raw] of Object.entries(values)) {
    const def = SETTINGS.find((s) => s.key === k);
    if (!def || external.has(k)) continue;
    const v = typeof raw === 'string' ? raw.trim().slice(0, 500) : '';
    if ((process.env[k] || '') === v) continue;
    if (v) {
      next[k] = v;
    } else {
      delete next[k];
    }
    edits[k] = v;
    changed.push(k);
    def.restarts?.forEach((id) => restart.add(id));
  }
  if (changed.length) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const temp = `${FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temp, FILE);
    saved = next;
    // Apply only after persistence succeeds; a failed save must not change keys.
    for (const [key, value] of Object.entries(edits)) {
      if (value) process.env[key] = value;
      else delete process.env[key];
    }
  }
  return { changed, restart: [...restart] };
}

export const isExternal = (k: string) => external.has(k);
