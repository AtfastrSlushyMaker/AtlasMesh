import type { Connector } from './types';
import { empty, keyValue } from './types';
import { normDomain } from '../normalize';

/** TXT verification tokens that reveal which SaaS a domain uses. */
const TXT_SERVICES: Array<[RegExp, string]> = [
  [/^google-site-verification=/i, 'Google Search Console'],
  [/^MS=/i, 'Microsoft 365'],
  [/^atlassian-domain-verification=/i, 'Atlassian'],
  [/^stripe-verification=/i, 'Stripe'],
  [/^facebook-domain-verification=/i, 'Meta Business'],
  [/^apple-domain-verification=/i, 'Apple'],
  [/^docusign=/i, 'DocuSign'],
  [/^adobe-idp-site-verification=/i, 'Adobe'],
  [/^slack-domain-verification=/i, 'Slack'],
  [/^zoom-domain-verification/i, 'Zoom'],
  [/^hubspot-developer-verification=/i, 'HubSpot'],
  [/^openai-domain-verification=/i, 'OpenAI'],
  [/^cursor-domain-verification/i, 'Cursor'],
  [/^_?github-(pages-)?challenge/i, 'GitHub'],
];
const SPF_SERVICES: Array<[RegExp, string]> = [
  [/_spf\.google\.com/i, 'Google Workspace'],
  [/spf\.protection\.outlook\.com/i, 'Microsoft 365'],
  [/amazonses\.com/i, 'Amazon SES'],
  [/sendgrid\.net/i, 'SendGrid'],
  [/mailgun\.org/i, 'Mailgun'],
  [/servers\.mcsv\.net/i, 'Mailchimp'],
  [/_spf\.salesforce\.com/i, 'Salesforce'],
  [/zoho\./i, 'Zoho Mail'],
  [/protonmail\.ch/i, 'Proton Mail'],
];
const MX_SERVICES: Array<[RegExp, string]> = [
  [/google(mail)?\.com\.?$/i, 'Google Workspace'],
  [/outlook\.com\.?$/i, 'Microsoft 365'],
  [/protonmail\.ch\.?$/i, 'Proton Mail'],
  [/zoho\.(com|eu)\.?$/i, 'Zoho Mail'],
  [/messagingengine\.com\.?$/i, 'Fastmail'],
];

const isDomain = (n: any) => n.type === 'domain';

/** DNS over HTTPS (Google Public DNS). */
export const dnsConnector: Connector = {
  id: 'dns',
  name: 'DNS',
  platform: 'DNS',
  description: 'A/AAAA, MX, NS and TXT records via DNS-over-HTTPS; infers mail and SaaS providers from records.',
  accepts: ['domain'],
  canHandle: isDomain,
  reliability: 0.95,
  minIntervalMs: 200,

  async run(node, ctx) {
    const out = empty();
    const domain = keyValue(node);
    const q = async (type: string) => {
      const r = await ctx.get(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { headers: { Accept: 'application/dns-json' } });
      return (r?.Answer || []).map((a: any) => String(a.data));
    };
    const [a, aaaa, mx, ns, txt] = await Promise.all(['A', 'AAAA', 'MX', 'NS', 'TXT'].map((t) => q(t).catch(() => [] as string[])));
    const src = `https://dns.google/query?name=${domain}`;
    const ev = (excerpt: string) => ({ sourceUrl: src, excerpt, method: 'dns' as const, observedDate: new Date().toISOString().slice(0, 10) });

    for (const ip of [...a, ...aaaa].slice(0, 8)) {
      const ref = `ip:${ip}`;
      out.entities.push({ ref, type: 'ip', value: ip, label: ip, evidence: ev(`${domain} ${ip.includes(':') ? 'AAAA' : 'A'} ${ip}`) });
      out.relations.push({ from: '$self', to: ref, type: 'RESOLVES_TO', explicit: true, evidence: ev(`${domain} → ${ip}`) });
    }
    for (const n of ns.slice(0, 6)) {
      const host = normDomain(n);
      if (!host) continue;
      const parent = host.split('.').slice(-2).join('.');
      const ref = `ns:${parent}`;
      if (!out.entities.some((e) => e.ref === ref)) out.entities.push({ ref, type: 'domain', value: parent, label: parent, evidence: ev(`NS ${host}`) });
      out.relations.push({ from: '$self', to: ref, type: 'HOSTED_BY', explicit: true, reasoning: 'Authoritative DNS is operated by this provider.', evidence: ev(`${domain} NS ${host}`) });
    }
    const services = new Map<string, string>();
    for (const m of mx) {
      const host = m.split(/\s+/).pop() || '';
      const svc = MX_SERVICES.find(([re]) => re.test(host))?.[1];
      if (svc) services.set(svc, `MX ${host}`);
    }
    for (const t of txt.map((s) => s.replace(/^"|"$/g, ''))) {
      const svc = TXT_SERVICES.find(([re]) => re.test(t))?.[1];
      if (svc) services.set(svc, `TXT ${t.slice(0, 60)}`);
      if (t.startsWith('v=spf1')) for (const [re, name] of SPF_SERVICES) if (re.test(t)) services.set(name, `SPF includes ${t.match(re)?.[0]}`);
    }
    for (const [svc, record] of services) {
      const ref = `svc:${svc}`;
      out.entities.push({ ref, type: 'technology', value: svc, label: svc, evidence: ev(record) });
      out.relations.push({ from: '$self', to: ref, type: 'USES', explicit: false, reasoning: `Inferred from a DNS record (${record}). Verification tokens can outlive a subscription.`, evidence: { ...ev(record), method: 'inference' } });
    }
    out.selfAttributes = { mx: mx.slice(0, 3).join(' | ') || undefined, ipv4: a.length, ipv6: aaaa.length };
    out.selfEvidence = ev(`${a.length} A, ${aaaa.length} AAAA, ${mx.length} MX, ${ns.length} NS, ${txt.length} TXT records`);
    return out;
  },
};

/** RDAP (successor to WHOIS). Registrant contact data is deliberately ignored. */
export const rdapConnector: Connector = {
  id: 'rdap',
  name: 'RDAP',
  platform: 'RDAP',
  description: 'Registrar, registration and expiry dates for a domain. Personal registrant contacts are never stored.',
  accepts: ['domain'],
  canHandle: isDomain,
  reliability: 0.9,
  minIntervalMs: 1000,

  async run(node, ctx) {
    const out = empty();
    const domain = keyValue(node);
    // Registrable domain only
    const d = await ctx.get(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { Accept: 'application/rdap+json' }, maxRedirects: 5 });
    const src = d.links?.find((l: any) => l.rel === 'self')?.href || `https://rdap.org/domain/${domain}`;
    const evt = (action: string) => d.events?.find((e: any) => e.eventAction === action)?.eventDate;
    const registered = evt('registration');
    const expires = evt('expiration');
    const changed = evt('last changed');
    out.selfAttributes = { registered, expires, lastChanged: changed, status: (d.status || []).join(', ') || undefined, dnssec: d.secureDNS?.delegationSigned };
    out.selfEvidence = { sourceUrl: src, excerpt: `Registered ${registered?.slice(0, 10) || '?'}, expires ${expires?.slice(0, 10) || '?'}`, method: 'rdap', observedDate: registered };
    const registrar = (d.entities || []).find((e: any) => (e.roles || []).includes('registrar'));
    const regName = registrar?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3];
    if (regName) {
      out.entities.push({ ref: 'registrar', type: 'organization', value: regName, label: regName, attributes: { role: 'Domain registrar', ianaId: registrar.publicIds?.[0]?.identifier }, evidence: { sourceUrl: src, excerpt: `Registrar: ${regName}`, method: 'rdap' } });
      out.relations.push({ from: '$self', to: 'registrar', type: 'REGISTERED_WITH', explicit: true, validFrom: registered?.slice(0, 10), evidence: { sourceUrl: src, excerpt: `Sponsoring registrar ${regName}`, method: 'rdap', observedDate: registered } });
    }
    return out;
  },
};

/** Certificate Transparency via SSLMate Cert Spotter (free tier), subdomains and issuers. */
export const certConnector: Connector = {
  id: 'certs',
  name: 'Certificate Transparency',
  platform: 'CT logs',
  description: 'Subdomains and certificate issuers from public Certificate Transparency logs.',
  accepts: ['domain'],
  canHandle: isDomain,
  reliability: 0.9,
  minIntervalMs: 2000,
  optionalEnv: ['CERTSPOTTER_TOKEN'],

  async run(node, ctx) {
    const out = empty();
    const domain = keyValue(node);
    const headers = process.env.CERTSPOTTER_TOKEN ? { Authorization: `Bearer ${process.env.CERTSPOTTER_TOKEN}` } : {};
    const list: any[] = await ctx.get(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`, { headers });
    const src = `https://sslmate.com/certspotter/`;
    const subs = new Map<string, string>();
    const issuers = new Map<string, string>();
    for (const c of list || []) {
      for (const n of c.dns_names || []) {
        const h = String(n).replace(/^\*\./, '').toLowerCase();
        if (h !== domain && h.endsWith(`.${domain}`) && !subs.has(h)) subs.set(h, c.not_before);
      }
      const iss = c.issuer?.friendly_name || c.issuer?.name?.match(/O=([^,]+)/)?.[1];
      if (iss && !issuers.has(iss)) issuers.set(iss, c.not_before);
    }
    for (const [h, first] of [...subs].slice(0, 40)) {
      const ref = `sub:${h}`;
      out.entities.push({ ref, type: 'domain', value: h, label: h, evidence: { sourceUrl: `https://crt.sh/?q=${h}`, excerpt: `Certificate issued for ${h} (${first?.slice(0, 10)})`, method: 'ct-log', observedDate: first } });
      out.relations.push({ from: ref, to: '$self', type: 'SUBDOMAIN_OF', explicit: true, evidence: { sourceUrl: `https://crt.sh/?q=${h}`, excerpt: `${h} seen in CT logs since ${first?.slice(0, 10)}`, method: 'ct-log', observedDate: first } });
    }
    for (const [iss, first] of issuers) {
      const ref = `ca:${iss}`;
      out.entities.push({ ref, type: 'organization', value: iss, label: iss, attributes: { role: 'Certificate authority' }, evidence: { sourceUrl: src, excerpt: `Issuer ${iss}`, method: 'ct-log' } });
      out.relations.push({ from: '$self', to: ref, type: 'USES', explicit: true, validFrom: first?.slice(0, 10), reasoning: 'Certificates for this domain were issued by this CA.', evidence: { sourceUrl: src, excerpt: `First certificate from ${iss}: ${first?.slice(0, 10)}`, method: 'ct-log', observedDate: first } });
    }
    out.selfAttributes = { subdomainsSeen: subs.size, certificateIssuers: issuers.size };
    out.selfEvidence = { sourceUrl: src, excerpt: `${(list || []).length} certificates, ${subs.size} subdomains`, method: 'ct-log' };
    return out;
  },
};
