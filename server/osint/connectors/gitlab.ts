import type { Connector } from './types';
import { accountParts, empty } from './types';
import { addLinks } from './github';
import { safeLocation } from '../safety';

const API = 'https://gitlab.com/api/v4';

export const gitlabConnector: Connector = {
  id: 'gitlab',
  name: 'GitLab',
  platform: 'GitLab',
  description: 'Public GitLab.com user profile and owned projects via the GitLab REST API.',
  accepts: ['account'],
  canHandle: (n) => ['gitlab', 'username'].includes(accountParts(n)?.platform || ''),
  reliability: 0.85,
  minIntervalMs: 1000,

  async run(node, ctx) {
    const out = empty();
    const { platform, handle } = accountParts(node)!;
    const users: any[] = await ctx.get(`${API}/users?username=${encodeURIComponent(handle)}`);
    const u = users?.[0];
    if (!u) {
      ctx.log(`No GitLab account named ${handle}`);
      return out;
    }
    let detail: any = u;
    try {
      detail = await ctx.get(`${API}/users/${u.id}`);
    } catch {
      // public detail may be restricted
    }
    const src = u.web_url;
    const self = platform === 'username' ? 'acct' : '$self';
    const attrs = {
      displayName: u.name, bio: detail.bio || undefined, location: safeLocation(detail.location),
      organization: detail.organization || undefined, jobTitle: detail.job_title || undefined,
      createdAt: detail.created_at, profileUrl: src, avatarUrl: u.avatar_url,
    };
    if (self === 'acct') {
      out.entities.push({ ref: 'acct', type: 'account', value: `gitlab:${u.username.toLowerCase()}`, label: `@${u.username} (GitLab)`, attributes: attrs, evidence: { sourceUrl: src, excerpt: `GitLab account @${u.username}`, method: 'api', observedDate: detail.created_at } });
      out.relations.push({ from: '$self', to: 'acct', type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false, reasoning: `A GitLab account uses the handle "${handle}".`, evidence: { sourceUrl: src, excerpt: src, method: 'inference' } });
    } else {
      out.selfAttributes = attrs;
      out.selfEvidence = { sourceUrl: src, excerpt: `GitLab user @${u.username} — "${u.name}"`, method: 'api', observedDate: detail.created_at };
    }
    if (u.name) {
      out.entities.push({ ref: 'person', type: 'person', value: u.name, scope: `gitlab:${u.username.toLowerCase()}`, label: u.name, evidence: { sourceUrl: src, excerpt: `Display name "${u.name}"`, method: 'api', selfReported: true } });
      out.relations.push({ from: 'person', to: self, type: 'OWNS', explicit: true, evidence: { sourceUrl: src, excerpt: `Display name "${u.name}" on ${src}`, method: 'api', selfReported: true } });
    }
    if (detail.organization) {
      out.entities.push({ ref: 'org', type: 'organization', value: detail.organization, label: detail.organization, evidence: { sourceUrl: src, excerpt: `Organization field: ${detail.organization}`, method: 'api', selfReported: true } });
      out.relations.push({ from: u.name ? 'person' : self, to: 'org', type: 'WORKS_AT', explicit: true, evidence: { sourceUrl: src, excerpt: `Organization: ${detail.organization}${detail.job_title ? `, ${detail.job_title}` : ''}`, method: 'api', selfReported: true } });
    }
    if (detail.public_email) {
      out.entities.push({ ref: 'email', type: 'email', value: detail.public_email, label: detail.public_email, evidence: { sourceUrl: src, excerpt: `Public email ${detail.public_email}`, method: 'api', selfReported: true } });
      out.relations.push({ from: self, to: 'email', type: 'ASSOCIATED_WITH', explicit: true, evidence: { sourceUrl: src, excerpt: 'Public email on GitLab profile', method: 'api', selfReported: true } });
    }
    const links = [detail.website_url, detail.twitter && `https://x.com/${detail.twitter}`, detail.github && `https://github.com/${detail.github}`, detail.linkedin && `https://www.linkedin.com/in/${detail.linkedin}`].filter(Boolean) as string[];
    addLinks(out, self, links, src, 'Linked from GitLab profile');

    try {
      const projects: any[] = await ctx.get(`${API}/users/${u.id}/projects?per_page=20&order_by=star_count&simple=true`);
      for (const p of (projects || []).slice(0, 10)) {
        const ref = `proj:${p.id}`;
        out.entities.push({ ref, type: 'repository', value: `gitlab:${p.path_with_namespace.toLowerCase()}`, label: p.path_with_namespace, attributes: { description: p.description, stars: p.star_count, createdAt: p.created_at, url: p.web_url }, evidence: { sourceUrl: p.web_url, excerpt: `${p.path_with_namespace} (★${p.star_count})`, method: 'api', observedDate: p.created_at } });
        out.relations.push({ from: self, to: ref, type: 'CREATED', explicit: true, validFrom: p.created_at?.slice(0, 10), evidence: { sourceUrl: p.web_url, excerpt: `Created ${p.created_at?.slice(0, 10)}`, method: 'api', observedDate: p.created_at } });
      }
    } catch {
      // optional
    }
    return out;
  },
};
