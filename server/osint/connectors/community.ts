import type { Connector } from './types';
import { accountParts, empty } from './types';
import { addLinks } from './github';
import { safeLocation } from '../safety';

/** Hugging Face Hub: profile overview, models and spaces. */
export const huggingfaceConnector: Connector = {
  id: 'huggingface',
  name: 'Hugging Face',
  platform: 'Hugging Face',
  description: 'Public Hugging Face profile, organisations and top models.',
  accepts: ['account'],
  canHandle: (n) => ['huggingface', 'username'].includes(accountParts(n)?.platform || ''),
  reliability: 0.85,
  minIntervalMs: 800,

  async run(node, ctx) {
    const out = empty();
    const { platform, handle } = accountParts(node)!;
    let u: any;
    try {
      u = await ctx.get(`https://huggingface.co/api/users/${encodeURIComponent(handle)}/overview`);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        ctx.log(`No Hugging Face user ${handle}`);
        return out;
      }
      throw err;
    }
    const src = `https://huggingface.co/${u.user || handle}`;
    const self = platform === 'username' ? 'acct' : '$self';
    const attrs = { displayName: u.fullname, models: u.numModels, datasets: u.numDatasets, spaces: u.numSpaces, followers: u.numFollowers, createdAt: u.createdAt, profileUrl: src, avatarUrl: u.avatarUrl };
    if (self === 'acct') {
      out.entities.push({ ref: 'acct', type: 'account', value: `huggingface:${handle}`, label: `@${handle} (Hugging Face)`, attributes: attrs, evidence: { sourceUrl: src, excerpt: `Hugging Face user ${handle}`, method: 'api', observedDate: u.createdAt } });
      out.relations.push({ from: '$self', to: 'acct', type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false, reasoning: `A Hugging Face account uses the handle "${handle}".`, evidence: { sourceUrl: src, excerpt: 'Handle match', method: 'inference' } });
    } else {
      out.selfAttributes = attrs;
      out.selfEvidence = { sourceUrl: src, excerpt: `Hugging Face user ${handle}${u.fullname ? ` — "${u.fullname}"` : ''}`, method: 'api', observedDate: u.createdAt };
    }
    if (u.fullname) {
      out.entities.push({ ref: 'person', type: 'person', value: u.fullname, scope: `huggingface:${handle}`, label: u.fullname, evidence: { sourceUrl: src, excerpt: `Full name "${u.fullname}"`, method: 'api', selfReported: true } });
      out.relations.push({ from: 'person', to: self, type: 'OWNS', explicit: true, evidence: { sourceUrl: src, excerpt: `Profile full name "${u.fullname}"`, method: 'api', selfReported: true } });
    }
    for (const o of (u.orgs || []).slice(0, 10)) {
      const ref = `org:${o.name}`;
      out.entities.push({ ref, type: 'organization', value: o.fullname || o.name, label: o.fullname || o.name, attributes: { huggingfaceOrg: o.name }, evidence: { sourceUrl: `https://huggingface.co/${o.name}`, excerpt: `Organisation ${o.fullname || o.name}`, method: 'api' } });
      out.relations.push({ from: self, to: ref, type: 'MEMBER_OF', explicit: true, evidence: { sourceUrl: src, excerpt: `Member of ${o.name} on Hugging Face`, method: 'api' } });
    }
    const socials = [u.details?.github && `https://github.com/${u.details.github}`, u.details?.twitter && `https://x.com/${u.details.twitter}`, u.details?.homepage, u.details?.linkedin && `https://www.linkedin.com/in/${u.details.linkedin}`].filter(Boolean) as string[];
    addLinks(out, self, socials, src, 'Linked from Hugging Face profile');
    try {
      const models: any[] = await ctx.get(`https://huggingface.co/api/models?author=${encodeURIComponent(handle)}&sort=downloads&limit=8`);
      for (const m of models || []) {
        const ref = `model:${m.id}`;
        const url = `https://huggingface.co/${m.id}`;
        out.entities.push({ ref, type: 'project', value: `hf-model:${m.id}`, label: m.id, attributes: { kind: 'model', downloads: m.downloads, likes: m.likes, pipeline: m.pipeline_tag, createdAt: m.createdAt, url }, evidence: { sourceUrl: url, excerpt: `Model ${m.id} (${m.downloads ?? 0} downloads)`, method: 'api', observedDate: m.createdAt } });
        out.relations.push({ from: self, to: ref, type: 'CREATED', explicit: true, validFrom: m.createdAt?.slice(0, 10), evidence: { sourceUrl: url, excerpt: `Published by ${handle}`, method: 'api', observedDate: m.createdAt } });
      }
    } catch {
      // optional
    }
    return out;
  },
};

/** Stack Exchange API: Stack Overflow user profiles. */
export const stackexchangeConnector: Connector = {
  id: 'stackoverflow',
  name: 'Stack Overflow',
  platform: 'Stack Overflow',
  description: 'Stack Overflow user profile (display name, website, location, top tags) via the Stack Exchange API.',
  accepts: ['account', 'person'],
  canHandle: (n) => n.type === 'person' || accountParts(n)?.platform === 'stackoverflow',
  reliability: 0.75,
  minIntervalMs: 1000,
  optionalEnv: ['STACKEXCHANGE_KEY'],

  async run(node, ctx) {
    const out = empty();
    const key = process.env.STACKEXCHANGE_KEY ? `&key=${process.env.STACKEXCHANGE_KEY}` : '';
    let users: any[] = [];
    const acct = accountParts(node);
    if (acct?.platform === 'stackoverflow' && /^\d+$/.test(acct.handle)) {
      users = (await ctx.get(`https://api.stackexchange.com/2.3/users/${acct.handle}?site=stackoverflow&filter=!9_bDDxJY5${key}`))?.items || [];
    } else if (node.type === 'person') {
      users = (await ctx.get(`https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(node.label)}&site=stackoverflow&sort=reputation&pagesize=5${key}`))?.items || [];
    }
    if (!users.length) return out;
    const isSearch = node.type === 'person';
    for (const u of users.slice(0, isSearch ? 5 : 1)) {
      const ref = isSearch ? `so:${u.user_id}` : '$self';
      const src = u.link;
      const attrs = { displayName: u.display_name, reputation: u.reputation, location: safeLocation(u.location), createdAt: u.creation_date ? new Date(u.creation_date * 1000).toISOString() : undefined, profileUrl: src };
      if (isSearch) {
        out.entities.push({ ref, type: 'account', value: `stackoverflow:${u.user_id}`, label: `${u.display_name} (Stack Overflow)`, attributes: attrs, evidence: { sourceUrl: src, excerpt: `Stack Overflow user "${u.display_name}" (${u.reputation} rep)`, method: 'api' } });
        out.relations.push({
          from: '$self', to: ref, type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false,
          reasoning: `Display name "${u.display_name}" matched a name search for "${node.label}". Name search results are candidates, not matches.`,
          evidence: { sourceUrl: src, excerpt: `Name search result`, method: 'inference' },
        });
      } else {
        out.selfAttributes = attrs;
        out.selfEvidence = { sourceUrl: src, excerpt: `Stack Overflow user ${u.display_name}`, method: 'api' };
      }
      if (u.website_url) addLinks(out, ref, [u.website_url], src, 'Website on Stack Overflow profile');
    }
    return out;
  },
};
