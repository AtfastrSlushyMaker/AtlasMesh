import type { Connector, ConnectorOutput, FoundEntity, FoundRelation } from './types';
import { accountParts, empty, keyValue } from './types';
import { accountFromUrl, normDomain, normUrl, platformLabel } from '../normalize';
import { safeLocation } from '../safety';

const API = 'https://api.github.com';

function headers() {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

const isGithubAccount = (n: any) => {
  const p = accountParts(n);
  return !!p && (p.platform === 'github' || p.platform === 'username');
};

export const githubConnector: Connector = {
  id: 'github',
  name: 'GitHub',
  platform: 'GitHub',
  description: 'Public profile, organisations, owned repositories, contributors and linked accounts via the GitHub REST API.',
  accepts: ['account', 'repository', 'organization'],
  canHandle: (n) =>
    n.type === 'repository' ? keyValue(n).startsWith('github:') :
    n.type === 'organization' ? !!n.attributes.githubLogin?.length :
    isGithubAccount(n),
  reliability: 0.9,
  get minIntervalMs() {
    return process.env.GITHUB_TOKEN ? 250 : 1500;
  },
  optionalEnv: ['GITHUB_TOKEN'],

  async run(node, ctx) {
    if (node.type === 'repository') return repo(keyValue(node).slice('github:'.length), ctx);
    const login =
      node.type === 'organization' ? String(node.attributes.githubLogin[0].value) : accountParts(node)!.handle;
    return user(login, node.type === 'account' && accountParts(node)!.platform === 'username', ctx);
  },
};

async function user(login: string, fromUsername: boolean, ctx: any): Promise<ConnectorOutput> {
  const out = empty();
  let u: any;
  try {
    u = await ctx.get(`${API}/users/${encodeURIComponent(login)}`, { headers: headers() });
  } catch (err: any) {
    if (err?.response?.status === 404) {
      ctx.log(`No GitHub account named ${login}`);
      return out;
    }
    throw err;
  }
  const profileUrl = u.html_url as string;
  const ev = (excerpt: string, extra: any = {}) => ({ sourceUrl: profileUrl, excerpt, method: 'api' as const, selfReported: true, ...extra });
  const isOrg = u.type === 'Organization';

  // When expanding a bare username, the GitHub account becomes its own node.
  const selfRef = fromUsername ? 'acct' : '$self';
  const acctAttrs = {
    displayName: u.name,
    bio: u.bio,
    location: safeLocation(u.location),
    company: u.company,
    blog: u.blog || undefined,
    publicRepos: u.public_repos,
    followers: u.followers,
    accountType: u.type,
    createdAt: u.created_at,
    profileUrl,
    avatarUrl: u.avatar_url,
  };
  if (fromUsername) {
    out.entities.push({
      ref: 'acct', type: 'account', value: `github:${u.login.toLowerCase()}`, label: `@${u.login} (GitHub)`,
      attributes: acctAttrs, evidence: ev(`GitHub account @${u.login} exists (created ${u.created_at?.slice(0, 10)})`, { selfReported: false, observedDate: u.created_at }),
    });
    out.relations.push({
      from: '$self', to: 'acct', type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false,
      reasoning: `A GitHub account uses the handle "${login}". Handle reuse alone does not prove common ownership.`,
      evidence: ev(`github.com/${u.login}`, { method: 'inference', selfReported: false }),
    });
  } else {
    out.selfAttributes = acctAttrs;
    out.selfEvidence = ev(`GitHub ${isOrg ? 'organisation' : 'user'} @${u.login}${u.name ? ` — "${u.name}"` : ''}`, { observedDate: u.created_at, selfReported: false });
  }

  if (isOrg) {
    out.entities.push({
      ref: 'org', type: 'organization', value: u.name || u.login, label: u.name || u.login,
      attributes: { githubLogin: u.login, website: u.blog || undefined, description: u.description || u.bio },
      evidence: ev(`GitHub organisation ${u.login}${u.name ? ` named "${u.name}"` : ''}`),
    });
    out.relations.push({ from: 'org', to: selfRef, type: 'OWNS', explicit: true, evidence: ev(`Organisation account github.com/${u.login}`, { selfReported: false }) });
  } else if (u.name) {
    // The person is scoped to this account: the resolver decides if they match anyone else.
    out.entities.push({
      ref: 'person', type: 'person', value: u.name, scope: `github:${u.login.toLowerCase()}`, label: u.name,
      attributes: { location: safeLocation(u.location) },
      evidence: ev(`Profile display name: "${u.name}"`),
    });
    out.relations.push({ from: 'person', to: selfRef, type: 'OWNS', explicit: true, evidence: ev(`Display name "${u.name}" shown on github.com/${u.login}`) });
  }
  const personRef = !isOrg && u.name ? 'person' : selfRef;

  if (u.email) {
    out.entities.push({ ref: 'email', type: 'email', value: u.email, label: u.email, evidence: ev(`Public profile email: ${u.email}`) });
    out.relations.push({ from: selfRef, to: 'email', type: 'ASSOCIATED_WITH', explicit: true, evidence: ev(`Public email on profile`) });
  }

  if (u.company && !isOrg) {
    const handle = String(u.company).trim().startsWith('@') ? String(u.company).trim().slice(1).split(/\s/)[0] : undefined;
    const name = String(u.company).replace(/^@/, '').trim();
    if (name) {
      out.entities.push({
        ref: 'company', type: 'organization', value: name, label: name,
        attributes: handle ? { githubLogin: handle } : {},
        evidence: ev(`Company field: "${u.company}"`),
      });
      out.relations.push({
        from: personRef, to: 'company', type: 'WORKS_AT', explicit: true,
        reasoning: 'Self-reported in the GitHub company field; current at retrieval time.',
        evidence: ev(`Company field: "${u.company}"`, { observedDate: new Date().toISOString().slice(0, 10) }),
      });
    }
  }

  const links: string[] = [];
  if (u.blog) links.push(u.blog);
  if (u.twitter_username) links.push(`https://x.com/${u.twitter_username}`);
  try {
    const social: any[] = await ctx.get(`${API}/users/${encodeURIComponent(u.login)}/social_accounts`, { headers: headers() });
    for (const s of social || []) if (s?.url) links.push(s.url);
  } catch {
    // optional
  }
  addLinks(out, selfRef, links, profileUrl, 'Linked from GitHub profile');

  if (!ctx.signal.cancelled) {
    try {
      const orgs: any[] = await ctx.get(`${API}/users/${encodeURIComponent(u.login)}/orgs`, { headers: headers() });
      for (const o of (orgs || []).slice(0, 15)) {
        const ref = `org:${o.login}`;
        out.entities.push({
          ref, type: 'organization', value: o.login, label: o.login,
          attributes: { githubLogin: o.login, description: o.description },
          evidence: ev(`Public member of github.com/${o.login}`, { selfReported: false }),
        });
        out.relations.push({ from: selfRef, to: ref, type: 'MEMBER_OF', explicit: true, evidence: ev(`Public organisation membership: ${o.login}`, { selfReported: false }) });
      }
    } catch {
      // optional
    }
  }

  if (!ctx.signal.cancelled) {
    const repos: any[] = await ctx.get(`${API}/users/${encodeURIComponent(u.login)}/repos?per_page=100&type=owner&sort=pushed`, { headers: headers() });
    const top = (repos || []).filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 12);
    for (const r of top) addRepo(out, selfRef, r, isOrg ? 'OWNS' : 'CREATED');
  }
  return out;
}

function addRepo(out: ConnectorOutput, ownerRef: string, r: any, rel: 'OWNS' | 'CREATED') {
  const ref = `repo:${r.full_name}`;
  out.entities.push({
    ref, type: 'repository', value: `github:${r.full_name.toLowerCase()}`, label: r.full_name,
    attributes: {
      description: r.description, stars: r.stargazers_count, forks: r.forks_count, language: r.language,
      createdAt: r.created_at, pushedAt: r.pushed_at, homepage: r.homepage || undefined, license: r.license?.spdx_id, archived: r.archived,
      url: r.html_url,
    },
    evidence: { sourceUrl: r.html_url, excerpt: `${r.full_name}: ${r.description || 'no description'} (★${r.stargazers_count})`, method: 'api', observedDate: r.created_at },
  });
  out.relations.push({
    from: ownerRef, to: ref, type: rel, explicit: true, validFrom: r.created_at?.slice(0, 10),
    evidence: { sourceUrl: r.html_url, excerpt: `Repository created ${r.created_at?.slice(0, 10)} under ${r.owner?.login}`, method: 'api', observedDate: r.created_at },
  });
  if (r.language) {
    const tref = `tech:${r.language}`;
    if (!out.entities.some((e) => e.ref === tref)) {
      out.entities.push({ ref: tref, type: 'technology', value: r.language, label: r.language, evidence: { sourceUrl: r.html_url, excerpt: `Primary language ${r.language}`, method: 'api' } });
    }
    out.relations.push({ from: ref, to: tref, type: 'USES', explicit: true, evidence: { sourceUrl: r.html_url, excerpt: `GitHub reports primary language ${r.language}`, method: 'api' } });
  }
}

async function repo(fullName: string, ctx: any): Promise<ConnectorOutput> {
  const out = empty();
  const r = await ctx.get(`${API}/repos/${fullName}`, { headers: headers() });
  out.selfAttributes = {
    description: r.description, stars: r.stargazers_count, forks: r.forks_count, language: r.language,
    createdAt: r.created_at, pushedAt: r.pushed_at, homepage: r.homepage || undefined, license: r.license?.spdx_id, url: r.html_url,
  };
  out.selfEvidence = { sourceUrl: r.html_url, excerpt: `${r.full_name}: ${r.description || ''}`, method: 'api', observedDate: r.created_at };

  const ownerRef = `owner:${r.owner.login}`;
  out.entities.push({
    ref: ownerRef, type: 'account', value: `github:${r.owner.login.toLowerCase()}`, label: `@${r.owner.login} (GitHub)`,
    attributes: { accountType: r.owner.type, profileUrl: r.owner.html_url },
    evidence: { sourceUrl: r.html_url, excerpt: `Owned by ${r.owner.login}`, method: 'api' },
  });
  out.relations.push({ from: ownerRef, to: '$self', type: 'OWNS', explicit: true, evidence: { sourceUrl: r.html_url, excerpt: `Repository owner: ${r.owner.login}`, method: 'api' } });

  if (r.homepage) addLinks(out, '$self', [r.homepage], r.html_url, 'Repository homepage');
  for (const topic of (r.topics || []).slice(0, 10)) {
    const tref = `topic:${topic}`;
    out.entities.push({ ref: tref, type: 'technology', value: topic, label: topic, evidence: { sourceUrl: r.html_url, excerpt: `Topic: ${topic}`, method: 'api' } });
    out.relations.push({ from: '$self', to: tref, type: 'USES', explicit: true, evidence: { sourceUrl: r.html_url, excerpt: `Tagged with topic "${topic}"`, method: 'api', selfReported: true } });
  }

  if (!ctx.signal.cancelled) {
    try {
      const contributors: any[] = await ctx.get(`${API}/repos/${fullName}/contributors?per_page=15`, { headers: headers() });
      for (const c of (contributors || []).filter((c) => c.type === 'User').slice(0, 12)) {
        const cref = `contrib:${c.login}`;
        if (c.login.toLowerCase() === r.owner.login.toLowerCase()) {
          out.relations.push({ from: ownerRef, to: '$self', type: 'CONTRIBUTED_TO', explicit: true, evidence: { sourceUrl: `${r.html_url}/graphs/contributors`, excerpt: `${c.contributions} commits by ${c.login}`, method: 'api' } });
          continue;
        }
        out.entities.push({
          ref: cref, type: 'account', value: `github:${c.login.toLowerCase()}`, label: `@${c.login} (GitHub)`,
          attributes: { profileUrl: c.html_url }, evidence: { sourceUrl: c.html_url, excerpt: `Contributor ${c.login}`, method: 'api' },
        });
        out.relations.push({
          from: cref, to: '$self', type: 'CONTRIBUTED_TO', explicit: true,
          evidence: { sourceUrl: `${r.html_url}/graphs/contributors`, excerpt: `${c.contributions} commits to ${r.full_name}`, method: 'api' },
        });
      }
    } catch {
      // contributor stats can 202/403 on large repos
    }
  }
  return out;
}

/** Turn a list of profile links into account / website / domain nodes. */
export function addLinks(out: ConnectorOutput, fromRef: string, urls: string[], sourceUrl: string, why: string) {
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = normUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const acct = accountFromUrl(url);
    const ev = { sourceUrl, excerpt: `${why}: ${url}`, method: 'api' as const, selfReported: true };
    if (acct) {
      const ref = `link:${acct.platform}:${acct.handle}`;
      if (!out.entities.some((e) => e.ref === ref)) {
        out.entities.push({
          ref, type: 'account', value: `${acct.platform}:${acct.handle}`, label: `@${acct.handle} (${platformLabel(acct.platform)})`,
          attributes: { profileUrl: url }, evidence: ev,
        });
      }
      out.relations.push({ from: fromRef, to: ref, type: 'LINKS_TO', explicit: true, evidence: ev });
      continue;
    }
    const domain = normDomain(url);
    const wref = `site:${url}`;
    out.entities.push({ ref: wref, type: 'website', value: url, label: url.replace(/^https?:\/\//, ''), evidence: ev });
    out.relations.push({ from: fromRef, to: wref, type: 'LINKS_TO', explicit: true, evidence: ev });
    if (domain) {
      const dref = `domain:${domain}`;
      if (!out.entities.some((e) => e.ref === dref)) {
        out.entities.push({ ref: dref, type: 'domain', value: domain, label: domain, evidence: { ...ev, excerpt: `Host of ${url}` } });
      }
      out.relations.push({ from: wref, to: dref, type: 'HOSTED_BY', explicit: true, evidence: { ...ev, excerpt: `${url} is served from ${domain}`, selfReported: false } });
    }
  }
}

export type { FoundEntity, FoundRelation };
