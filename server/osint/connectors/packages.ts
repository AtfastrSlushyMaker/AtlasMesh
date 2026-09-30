import type { Connector, ConnectorOutput } from './types';
import { accountParts, empty, keyValue } from './types';
import { addLinks } from './github';
import { normEmail } from '../normalize';

/** npm registry: packages maintained by an account, and package metadata. */
export const npmConnector: Connector = {
  id: 'npm',
  name: 'npm registry',
  platform: 'npm',
  description: 'Packages maintained by an npm user, or maintainers and repository of an npm package.',
  accepts: ['account', 'package'],
  canHandle: (n) => (n.type === 'package' ? keyValue(n).startsWith('npm:') : ['npm', 'username'].includes(accountParts(n)?.platform || '')),
  reliability: 0.85,
  minIntervalMs: 500,

  async run(node, ctx) {
    if (node.type === 'package') return npmPackage(keyValue(node).slice(4), ctx);
    const out = empty();
    const { platform, handle } = accountParts(node)!;
    const res = await ctx.get(`https://registry.npmjs.org/-/v1/search?text=maintainer:${encodeURIComponent(handle)}&size=20`);
    const objs: any[] = res?.objects || [];
    if (!objs.length) {
      ctx.log(`No npm packages maintained by ${handle}`);
      return out;
    }
    let self = '$self';
    if (platform === 'username') {
      self = 'acct';
      out.entities.push({ ref: 'acct', type: 'account', value: `npm:${handle}`, label: `@${handle} (npm)`, attributes: { profileUrl: `https://www.npmjs.com/~${handle}` }, evidence: { sourceUrl: `https://www.npmjs.com/~${handle}`, excerpt: `npm user ${handle} maintains ${objs.length}+ packages`, method: 'api' } });
      out.relations.push({ from: '$self', to: 'acct', type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false, reasoning: `An npm maintainer uses the handle "${handle}".`, evidence: { sourceUrl: `https://www.npmjs.com/~${handle}`, excerpt: 'Handle match', method: 'inference' } });
    }
    for (const o of objs.slice(0, 15)) {
      const p = o.package;
      const ref = `pkg:${p.name}`;
      const url = p.links?.npm || `https://www.npmjs.com/package/${p.name}`;
      out.entities.push({ ref, type: 'package', value: `npm:${p.name}`, label: `${p.name} (npm)`, attributes: { description: p.description, version: p.version, lastPublished: p.date, url }, evidence: { sourceUrl: url, excerpt: `${p.name}@${p.version}: ${p.description || ''}`, method: 'api', observedDate: p.date } });
      out.relations.push({ from: self, to: ref, type: 'MAINTAINS', explicit: true, evidence: { sourceUrl: url, excerpt: `Listed maintainer: ${handle}`, method: 'api' } });
    }
    return out;
  },
};

async function npmPackage(name: string, ctx: any): Promise<ConnectorOutput> {
  const out = empty();
  const p = await ctx.get(`https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`);
  const url = `https://www.npmjs.com/package/${name}`;
  const created = p.time?.created;
  out.selfAttributes = { description: p.description, latest: p['dist-tags']?.latest, license: typeof p.license === 'string' ? p.license : undefined, createdAt: created, url };
  out.selfEvidence = { sourceUrl: url, excerpt: `${name}: ${p.description || ''}`, method: 'api', observedDate: created };
  for (const m of (p.maintainers || []).slice(0, 10)) {
    const ref = `m:${m.name}`;
    out.entities.push({ ref, type: 'account', value: `npm:${String(m.name).toLowerCase()}`, label: `@${m.name} (npm)`, attributes: { profileUrl: `https://www.npmjs.com/~${m.name}` }, evidence: { sourceUrl: url, excerpt: `Maintainer: ${m.name}`, method: 'api' } });
    out.relations.push({ from: ref, to: '$self', type: 'MAINTAINS', explicit: true, evidence: { sourceUrl: url, excerpt: `${m.name} is a listed maintainer`, method: 'api' } });
  }
  const repoUrl = typeof p.repository === 'string' ? p.repository : p.repository?.url;
  const gh = repoUrl && String(repoUrl).match(/github\.com[/:]([^/]+)\/([^/.#]+)/i);
  if (gh) {
    const ref = 'repo';
    out.entities.push({ ref, type: 'repository', value: `github:${gh[1].toLowerCase()}/${gh[2].toLowerCase()}`, label: `${gh[1]}/${gh[2]}`, evidence: { sourceUrl: url, excerpt: `repository: ${repoUrl}`, method: 'api', selfReported: true } });
    out.relations.push({ from: '$self', to: ref, type: 'LINKS_TO', explicit: true, evidence: { sourceUrl: url, excerpt: `Declared source repository ${repoUrl}`, method: 'api', selfReported: true } });
  }
  if (p.homepage) addLinks(out, '$self', [p.homepage], url, 'Package homepage');
  return out;
}

/** PyPI JSON API: authors, project URLs and public author email of a package. */
export const pypiConnector: Connector = {
  id: 'pypi',
  name: 'PyPI',
  platform: 'PyPI',
  description: 'Authors, maintainers, project links and release history of a Python package.',
  accepts: ['package'],
  canHandle: (n) => keyValue(n).startsWith('pypi:'),
  reliability: 0.8,
  minIntervalMs: 500,

  async run(node, ctx) {
    const out = empty();
    const name = keyValue(node).slice(5);
    const d = await ctx.get(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    const info = d.info || {};
    const url = info.package_url || `https://pypi.org/project/${name}/`;
    const releases = Object.entries(d.releases || {}).map(([v, files]: any) => ({ v, t: files?.[0]?.upload_time_iso_8601 })).filter((r) => r.t).sort((a, b) => a.t.localeCompare(b.t));
    out.selfAttributes = { description: info.summary, latest: info.version, license: info.license?.slice(0, 60), firstRelease: releases[0]?.t, url };
    out.selfEvidence = { sourceUrl: url, excerpt: `${info.name}: ${info.summary || ''}`, method: 'api', observedDate: releases[0]?.t };

    const people: Array<[string | undefined, string | undefined, 'AUTHORED' | 'MAINTAINS']> = [
      [info.author, info.author_email, 'AUTHORED'],
      [info.maintainer, info.maintainer_email, 'MAINTAINS'],
    ];
    people.forEach(([nameRaw, emailRaw, rel], i) => {
      // author_email is often "Name <addr>, Name2 <addr2>"
      const emails = String(emailRaw || '').split(',').map((s) => normEmail(s.replace(/.*</, '').replace(/>.*/, ''))).filter(Boolean) as string[];
      const personName = nameRaw || String(emailRaw || '').match(/^([^<,]+)</)?.[1]?.trim();
      if (personName) {
        const ref = `p${i}`;
        out.entities.push({ ref, type: 'person', value: personName, scope: `pypi:${name.toLowerCase()}`, label: personName, evidence: { sourceUrl: url, excerpt: `${rel === 'AUTHORED' ? 'Author' : 'Maintainer'}: ${personName}`, method: 'api', selfReported: true } });
        out.relations.push({ from: ref, to: '$self', type: rel, explicit: true, evidence: { sourceUrl: url, excerpt: `Package metadata lists ${personName}`, method: 'api', selfReported: true } });
        for (const e of emails.slice(0, 2)) {
          const eref = `e${i}:${e}`;
          out.entities.push({ ref: eref, type: 'email', value: e, label: e, evidence: { sourceUrl: url, excerpt: `Published package contact: ${e}`, method: 'api', selfReported: true } });
          out.relations.push({ from: ref, to: eref, type: 'ASSOCIATED_WITH', explicit: true, evidence: { sourceUrl: url, excerpt: `${personName} <${e}> in package metadata`, method: 'api', selfReported: true } });
        }
      }
    });
    const links = Object.values(info.project_urls || {}).concat(info.home_page ? [info.home_page] : []) as string[];
    const repo = links.map((l) => String(l).match(/github\.com\/([^/]+)\/([^/#?]+)/i)).find(Boolean);
    if (repo) {
      out.entities.push({ ref: 'repo', type: 'repository', value: `github:${repo[1].toLowerCase()}/${repo[2].replace(/\.git$/, '').toLowerCase()}`, label: `${repo[1]}/${repo[2]}`, evidence: { sourceUrl: url, excerpt: `Project URL ${repo[0]}`, method: 'api', selfReported: true } });
      out.relations.push({ from: '$self', to: 'repo', type: 'LINKS_TO', explicit: true, evidence: { sourceUrl: url, excerpt: `Declared repository ${repo[0]}`, method: 'api', selfReported: true } });
    }
    addLinks(out, '$self', links.filter((l) => !/github\.com\/[^/]+\/[^/]+/i.test(l)).slice(0, 5), url, 'Project URL');
    return out;
  },
};

/** Docker Hub: public repositories under a namespace. */
export const dockerhubConnector: Connector = {
  id: 'dockerhub',
  name: 'Docker Hub',
  platform: 'Docker Hub',
  description: 'Public container images published under a Docker Hub namespace.',
  accepts: ['account'],
  canHandle: (n) => ['dockerhub', 'username'].includes(accountParts(n)?.platform || ''),
  reliability: 0.8,
  minIntervalMs: 1000,

  async run(node, ctx) {
    const out = empty();
    const { platform, handle } = accountParts(node)!;
    let res: any;
    try {
      res = await ctx.get(`https://hub.docker.com/v2/repositories/${encodeURIComponent(handle)}/?page_size=15&ordering=-pull_count`);
    } catch (err: any) {
      if (err?.response?.status === 404) return out;
      throw err;
    }
    const repos: any[] = res?.results || [];
    if (!repos.length) return out;
    let self = '$self';
    const src = `https://hub.docker.com/u/${handle}`;
    if (platform === 'username') {
      self = 'acct';
      out.entities.push({ ref: 'acct', type: 'account', value: `dockerhub:${handle}`, label: `@${handle} (Docker Hub)`, attributes: { profileUrl: src }, evidence: { sourceUrl: src, excerpt: `Docker Hub namespace ${handle} with ${res.count} public images`, method: 'api' } });
      out.relations.push({ from: '$self', to: 'acct', type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false, reasoning: `A Docker Hub namespace uses the handle "${handle}".`, evidence: { sourceUrl: src, excerpt: 'Handle match', method: 'inference' } });
    }
    for (const r of repos.slice(0, 10)) {
      const ref = `img:${r.name}`;
      const url = `https://hub.docker.com/r/${handle}/${r.name}`;
      out.entities.push({ ref, type: 'package', value: `docker:${handle}/${r.name}`, label: `${handle}/${r.name} (image)`, attributes: { description: r.description, pulls: r.pull_count, lastUpdated: r.last_updated, url }, evidence: { sourceUrl: url, excerpt: `${r.pull_count} pulls, updated ${r.last_updated?.slice(0, 10)}`, method: 'api', observedDate: r.date_registered } });
      out.relations.push({ from: self, to: ref, type: 'OWNS', explicit: true, evidence: { sourceUrl: url, excerpt: `Published under ${handle}`, method: 'api' } });
    }
    return out;
  },
};
