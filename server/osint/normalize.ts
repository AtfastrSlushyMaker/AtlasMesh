import { domainToASCII } from 'url';
import type { NodeType } from '../../shared/osint';

/**
 * Entity normalization: turns raw strings into canonical keys so that the same
 * identifier seen twice collapses to one node. Only identifiers that are
 * unambiguous by construction (emails, domains, platform handles, DOIs,
 * ORCID iDs…) are keyed globally. People are keyed per asserting source so
 * that two "John Doe"s are never merged by normalization; linking them is the
 * resolver's job.
 */

export function stripDiacritics(s: string) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function normName(s: string) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const ORG_SUFFIX = /\b(incorporated|inc|llc|ltd|limited|gmbh|ag|sa|sas|srl|bv|plc|corp|corporation|co|company|pty)\b\.?/g;

export function normOrg(s: string) {
  return normName(s.replace(/^@/, '')).replace(ORG_SUFFIX, '').replace(/\s+/g, ' ').trim();
}

export function normDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  try {
    if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname;
  } catch {
    return null;
  }
  s = s.replace(/^www\./, '').replace(/\.$/, '').split('/')[0].split(':')[0];
  const ascii = domainToASCII(s);
  if (!ascii || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(ascii)) return null;
  return ascii;
}

export function normUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let out = u.toString();
    if (out.endsWith('/') && u.pathname === '/') out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

export function normEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(s) ? s : null;
}

export function normHandle(raw: string) {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function normDoi(raw: string): string | null {
  const m = raw.trim().match(/10\.\d{4,9}\/\S+/i);
  return m ? m[0].toLowerCase().replace(/[.,;]$/, '') : null;
}

export function normOrcid(raw: string): string | null {
  const m = raw.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
  return m ? m[1].toUpperCase() : null;
}

/** Map well-known profile URLs to platform accounts. */
export function accountFromUrl(raw: string): { platform: string; handle: string } | null {
  const url = normUrl(raw);
  if (!url) return null;
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean);
  const host = u.hostname;
  const first = seg[0];
  const reserved = new Set(['orgs', 'about', 'features', 'explore', 'topics', 'sponsors', 'settings', 'login', 'join', 'search', 'marketplace', 'pricing', 'u', 'in', 'company', 'intent', 'share', 'hashtag', 'home']);
  if (!first || reserved.has(first.toLowerCase())) {
    if (host.endsWith('linkedin.com') && (first === 'in' || first === 'company') && seg[1]) return { platform: 'linkedin', handle: seg[1].toLowerCase() };
    if (host === 'stackoverflow.com' && first === 'users' && seg[1]) return { platform: 'stackoverflow', handle: seg[1] };
    return null;
  }
  switch (host) {
    case 'github.com':
      return seg.length === 1 ? { platform: 'github', handle: first.toLowerCase() } : null;
    case 'gitlab.com':
      return seg.length === 1 ? { platform: 'gitlab', handle: first.toLowerCase() } : null;
    case 'twitter.com':
    case 'x.com':
      return { platform: 'x', handle: first.toLowerCase() };
    case 'huggingface.co':
      return seg.length === 1 ? { platform: 'huggingface', handle: first.toLowerCase() } : null;
    case 'kaggle.com':
      return seg.length === 1 ? { platform: 'kaggle', handle: first.toLowerCase() } : null;
    case 'npmjs.com':
      return first === '~' && seg[1] ? { platform: 'npm', handle: seg[1].toLowerCase() } : null;
    case 'orcid.org': {
      const id = normOrcid(first);
      return id ? { platform: 'orcid', handle: id } : null;
    }
    case 'bsky.app':
      return first === 'profile' && seg[1] ? { platform: 'bluesky', handle: seg[1].toLowerCase() } : null;
    case 'youtube.com':
      return first.startsWith('@') ? { platform: 'youtube', handle: first.slice(1).toLowerCase() } : null;
    case 'medium.com':
      return first.startsWith('@') ? { platform: 'medium', handle: first.slice(1).toLowerCase() } : null;
    case 'dev.to':
      return seg.length === 1 ? { platform: 'devto', handle: first.toLowerCase() } : null;
    case 'keybase.io':
      return seg.length === 1 ? { platform: 'keybase', handle: first.toLowerCase() } : null;
    case 'hub.docker.com':
      return (first === 'u' || first === 'r') && seg[1] ? { platform: 'dockerhub', handle: seg[1].toLowerCase() } : null;
    // Link-only platforms: recorded as accounts so identity links work, never fetched.
    case 'instagram.com':
    case 'facebook.com':
    case 'threads.net':
    case 'tiktok.com':
    case 'twitch.tv':
    case 'reddit.com':
    case 'behance.net':
    case 'dribbble.com':
    case 'codepen.io':
    case 'producthunt.com':
    case 'patreon.com':
    case 'ko-fi.com':
    case 'buymeacoffee.com':
    case 'unsplash.com':
    case 'soundcloud.com':
    case 'leetcode.com': {
      const h = (host === 'reddit.com' && (first === 'user' || first === 'u') ? seg[1] : first)?.replace(/^@/, '');
      return h && (seg.length === 1 || host === 'reddit.com') ? { platform: host.split('.')[0], handle: h.toLowerCase() } : null;
    }
  }
  // Fediverse-style https://instance/@user
  if (first.startsWith('@') && seg.length === 1 && first.length > 1) {
    const platform = /mastodon|mstdn|fosstodon|hachyderm|infosec\.exchange|social\./i.test(host) ? `mastodon:${host}` : `web:${host}`;
    return { platform, handle: first.slice(1).toLowerCase() };
  }
  return null;
}

export const PLATFORM_LABEL: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', x: 'X', huggingface: 'Hugging Face', kaggle: 'Kaggle', npm: 'npm',
  pypi: 'PyPI', orcid: 'ORCID', bluesky: 'Bluesky', youtube: 'YouTube', medium: 'Medium', devto: 'DEV',
  keybase: 'Keybase', dockerhub: 'Docker Hub', linkedin: 'LinkedIn', stackoverflow: 'Stack Overflow',
  instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', tiktok: 'TikTok', twitch: 'Twitch', reddit: 'Reddit',
  behance: 'Behance', dribbble: 'Dribbble', codepen: 'CodePen', producthunt: 'Product Hunt', patreon: 'Patreon',
  'ko-fi': 'Ko-fi', buymeacoffee: 'Buy Me a Coffee', unsplash: 'Unsplash', soundcloud: 'SoundCloud', leetcode: 'LeetCode',
  semanticscholar: 'Semantic Scholar',
};

export function platformLabel(p: string) {
  if (p.startsWith('mastodon:')) return `Mastodon (${p.slice(9)})`;
  if (p.startsWith('web:')) return p.slice(4);
  return PLATFORM_LABEL[p] || p;
}

export function accountUrl(platform: string, handle: string): string | undefined {
  switch (platform) {
    case 'github': return `https://github.com/${handle}`;
    case 'gitlab': return `https://gitlab.com/${handle}`;
    case 'x': return `https://x.com/${handle}`;
    case 'huggingface': return `https://huggingface.co/${handle}`;
    case 'kaggle': return `https://www.kaggle.com/${handle}`;
    case 'npm': return `https://www.npmjs.com/~${handle}`;
    case 'orcid': return `https://orcid.org/${handle}`;
    case 'bluesky': return `https://bsky.app/profile/${handle}`;
    case 'linkedin': return `https://www.linkedin.com/in/${handle}`;
    case 'stackoverflow': return `https://stackoverflow.com/users/${handle}`;
    case 'dockerhub': return `https://hub.docker.com/u/${handle}`;
  }
  if (platform.startsWith('mastodon:')) return `https://${platform.slice(9)}/@${handle}`;
  if (platform.startsWith('web:')) return `https://${platform.slice(4)}/@${handle}`;
  return undefined;
}

/** Canonical keys per node type. `scope` disambiguates non-unique identifiers such as person names. */
export function nodeKey(type: NodeType, value: string, scope?: string): string | null {
  switch (type) {
    case 'email': {
      const e = normEmail(value);
      return e ? `email:${e}` : null;
    }
    case 'domain': {
      const d = normDomain(value);
      return d ? `domain:${d}` : null;
    }
    case 'website': {
      const u = normUrl(value);
      return u ? `website:${u}` : null;
    }
    case 'account':
      return `account:${value.toLowerCase()}`; // value = "platform:handle"
    case 'ip':
      return `ip:${value.trim()}`;
    case 'paper': {
      const doi = normDoi(value);
      return doi ? `paper:doi:${doi}` : `paper:${normName(value)}`;
    }
    case 'person':
      return `person:${normName(value)}${scope ? `|${scope}` : ''}`;
    case 'organization':
    case 'university':
      return `${type}:${normOrg(value)}`;
    case 'technology':
      return `technology:${normName(value)}`;
    default:
      return `${type}:${value.trim().toLowerCase()}`;
  }
}

/** Guess what a free-text seed is. */
export function detectSeed(raw: string): { type: NodeType; value: string; label: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const orcid = normOrcid(s);
  if (orcid && /orcid|^\d{4}-/.test(s)) return { type: 'account', value: `orcid:${orcid}`, label: `ORCID ${orcid}` };
  const doi = normDoi(s);
  if (doi && /^(doi:|https?:\/\/(dx\.)?doi\.org\/|10\.)/i.test(s)) return { type: 'paper', value: doi, label: doi };
  const email = normEmail(s);
  if (email) return { type: 'email', value: email, label: email };
  const pref = s.match(/^(github|gitlab|npm|pypi|huggingface|hf|stackoverflow|so|orcid|dockerhub|kaggle):(.+)$/i);
  if (pref) {
    const platform = { hf: 'huggingface', so: 'stackoverflow' }[pref[1].toLowerCase()] || pref[1].toLowerCase();
    if (platform === 'pypi' || (platform === 'npm' && !pref[2].startsWith('~'))) {
      return { type: 'package', value: `${platform}:${pref[2].trim()}`, label: `${pref[2].trim()} (${platformLabel(platform)})` };
    }
    const handle = normHandle(pref[2].replace(/^~/, ''));
    return { type: 'account', value: `${platform}:${handle}`, label: `@${handle} (${platformLabel(platform)})` };
  }
  if (/^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+\/\S*/.test(s)) {
    const acct = accountFromUrl(s);
    if (acct) return { type: 'account', value: `${acct.platform}:${acct.handle}`, label: `@${acct.handle} (${platformLabel(acct.platform)})` };
    const u = normUrl(s);
    if (u) {
      const gh = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
      if (gh) return { type: 'repository', value: `github:${gh[1].toLowerCase()}/${gh[2].toLowerCase()}`, label: `${gh[1]}/${gh[2]}` };
      return { type: 'website', value: u, label: u.replace(/^https?:\/\//, '') };
    }
  }
  if (s.startsWith('@')) {
    const h = normHandle(s);
    return { type: 'account', value: `username:${h}`, label: `@${h}` };
  }
  const d = normDomain(s);
  if (d && !/\s/.test(s)) return { type: 'domain', value: d, label: d };
  if (/^[a-z0-9_-]{3,39}$/i.test(s) && !/\s/.test(s)) return { type: 'account', value: `username:${s.toLowerCase()}`, label: `@${s}` };
  return { type: 'person', value: s, label: s };
}
