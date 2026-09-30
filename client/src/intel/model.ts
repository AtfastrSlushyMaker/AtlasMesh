import {
  mdiAccount, mdiDomain, mdiSchool, mdiAt, mdiEmailOutline, mdiWeb, mdiDns, mdiIpNetwork, mdiSourceRepository,
  mdiPackageVariant, mdiCodeTags, mdiFileDocument, mdiCalendarStar, mdiMapMarker, mdiCertificate, mdiLightbulbOutline,
  mdiFileDocumentOutline,
} from '@mdi/js';
import type { ClaimKind, GraphEdge, Investigation, NodeType } from '../../../shared/osint';
import { api, storage } from '../lib/api';

const key = () => storage.get<string>('intel:key', '');
const withKey = (init: any = {}) => ({ ...init, headers: { ...(init.headers || {}), ...(key() ? { 'x-atlas-key': key() } : {}) } });
const call = <T = any>(path: string, init?: any) => api<T>(path, withKey(init));

export const NODE_STYLE: Record<NodeType, { label: string; color: string; shape: string; icon: string }> = {
  person: { label: 'Person', color: '#f2a7c9', shape: 'ellipse', icon: mdiAccount },
  organization: { label: 'Organisation', color: '#e8c160', shape: 'round-rectangle', icon: mdiDomain },
  university: { label: 'University', color: '#d6a07a', shape: 'round-rectangle', icon: mdiSchool },
  account: { label: 'Account', color: '#6fa8dc', shape: 'ellipse', icon: mdiAt },
  email: { label: 'Email', color: '#8fe3e0', shape: 'tag', icon: mdiEmailOutline },
  website: { label: 'Website', color: '#7fd49a', shape: 'round-tag', icon: mdiWeb },
  domain: { label: 'Domain', color: '#4fd1b0', shape: 'hexagon', icon: mdiDns },
  ip: { label: 'IP address', color: '#8d96a0', shape: 'diamond', icon: mdiIpNetwork },
  repository: { label: 'Repository', color: '#a996e8', shape: 'round-rectangle', icon: mdiSourceRepository },
  project: { label: 'Project', color: '#b9a6ef', shape: 'round-rectangle', icon: mdiLightbulbOutline },
  package: { label: 'Package', color: '#c7a6f0', shape: 'barrel', icon: mdiPackageVariant },
  technology: { label: 'Technology', color: '#6c7a88', shape: 'ellipse', icon: mdiCodeTags },
  paper: { label: 'Paper', color: '#e7e1a1', shape: 'rectangle', icon: mdiFileDocument },
  patent: { label: 'Patent', color: '#e7e1a1', shape: 'rectangle', icon: mdiFileDocument },
  event: { label: 'Event', color: '#ff8a4c', shape: 'star', icon: mdiCalendarStar },
  location: { label: 'Location', color: '#e2553f', shape: 'vee', icon: mdiMapMarker },
  document: { label: 'Document', color: '#b9b7ad', shape: 'rectangle', icon: mdiFileDocumentOutline },
  certificate: { label: 'Certificate', color: '#8fa3f0', shape: 'rectangle', icon: mdiCertificate },
};

export const CLAIM_COLOR: Record<ClaimKind, string> = {
  FACT: 'var(--fact)',
  INFERENCE: 'var(--inference)',
  HYPOTHESIS: 'var(--hypothesis)',
};

export const CLAIM_TEXT: Record<ClaimKind, string> = {
  FACT: 'A source states this directly',
  INFERENCE: 'Derived from several pieces of evidence',
  HYPOTHESIS: 'Possible, but evidence is insufficient',
};

export const REL_TEXT: Record<string, string> = {
  WORKS_AT: 'works at',
  WORKED_AT: 'worked at',
  STUDIED_AT: 'studied at',
  CONTRIBUTED_TO: 'contributed to',
  CREATED: 'created',
  MAINTAINS: 'maintains',
  OWNS: 'owns',
  USES: 'uses',
  MENTIONED_IN: 'mentioned in',
  ASSOCIATED_WITH: 'associated with',
  MEMBER_OF: 'member of',
  COLLABORATED_WITH: 'collaborated with',
  SPOKE_AT: 'spoke at',
  AUTHORED: 'authored',
  COAUTHORED: 'co-authored',
  LINKS_TO: 'links to',
  LOCATED_IN: 'located in',
  RESOLVES_TO: 'resolves to',
  HOSTED_BY: 'hosted by',
  SUBDOMAIN_OF: 'subdomain of',
  REGISTERED_WITH: 'registered with',
  PUBLISHED_IN: 'published in',
  SAME_ENTITY_AS: 'same entity as',
  POSSIBLY_SAME_ENTITY_AS: 'possibly same as',
};

export const relText = (t: string) => REL_TEXT[t] || t.toLowerCase().replace(/_/g, ' ');

export const SEED_TYPES: Array<{ id: string; label: string; placeholder: string }> = [
  { id: 'auto', label: 'Detect automatically', placeholder: 'github:torvalds, jane@example.org, example.com, 10.1038/…' },
  { id: 'person', label: 'Person name', placeholder: 'Ada Lovelace' },
  { id: 'organization', label: 'Organisation', placeholder: 'Mozilla Foundation' },
  { id: 'account', label: 'Username or profile URL', placeholder: '@handle or https://github.com/handle' },
  { id: 'email', label: 'Public email', placeholder: 'press@example.org' },
  { id: 'domain', label: 'Domain', placeholder: 'example.org' },
  { id: 'website', label: 'Web page', placeholder: 'https://example.org/about' },
  { id: 'repository', label: 'GitHub repository', placeholder: 'https://github.com/owner/repo' },
  { id: 'package', label: 'Package', placeholder: 'npm:react or pypi:requests' },
  { id: 'paper', label: 'Paper (DOI)', placeholder: '10.1145/3368089.3409755' },
];

export const osint = {
  access: () => call<{ required: boolean; ok: boolean }>('/api/osint/access'),
  setKey: (k: string) => storage.set('intel:key', k),
  list: () => call<{ investigations: any[] }>('/api/osint/investigations'),
  get: (id: string) => call<Investigation & { runningJob: any }>(`/api/osint/investigations/${id}`),
  create: (body: any) => call<Investigation>('/api/osint/investigations', { method: 'POST', json: body }),
  remove: (id: string) => call(`/api/osint/investigations/${id}`, { method: 'DELETE' }),
  update: (id: string, body: any) => call(`/api/osint/investigations/${id}`, { method: 'PATCH', json: body }),
  addSeed: (id: string, value: string, type?: string) => call<{ node: any }>(`/api/osint/investigations/${id}/seeds`, { method: 'POST', json: { value, type } }),
  expand: (id: string, nodeId: string, body: any) => call<{ job: any }>(`/api/osint/investigations/${id}/nodes/${nodeId}/expand`, { method: 'POST', json: body }),
  nodeConnectors: (id: string, nodeId: string) => call<{ connectors: Array<{ id: string; name: string; done: boolean }> }>(`/api/osint/investigations/${id}/nodes/${nodeId}/connectors`),
  cancel: (id: string, jobId: string) => call(`/api/osint/investigations/${id}/jobs/${jobId}/cancel`, { method: 'POST' }),
  patchNode: (id: string, nodeId: string, body: any) => call(`/api/osint/investigations/${id}/nodes/${nodeId}`, { method: 'PATCH', json: body }),
  patchEdge: (id: string, edgeId: string, body: any) => call(`/api/osint/investigations/${id}/edges/${edgeId}`, { method: 'PATCH', json: body }),
  patchContradiction: (id: string, cid: string, status: string) => call(`/api/osint/investigations/${id}/contradictions/${cid}`, { method: 'PATCH', json: { status } }),
  note: (id: string, text: string) => call(`/api/osint/investigations/${id}/notes`, { method: 'POST', json: { text } }),
  timeline: (id: string) => call<{ events: any[] }>(`/api/osint/investigations/${id}/timeline`),
  path: (id: string, from: string, to: string, mode: string) => call<{ path: { nodeIds: string[]; edgeIds: string[]; strength: number } }>(`/api/osint/investigations/${id}/path?from=${from}&to=${to}&mode=${mode}`),
  insights: (id: string) => call<any>(`/api/osint/investigations/${id}/insights`),
  ask: (id: string, question: string, focus: string[]) => call<any>(`/api/osint/investigations/${id}/ask`, { method: 'POST', json: { question, focus } }),
  report: (id: string) => call<{ markdown: string; citations: any[] }>(`/api/osint/investigations/${id}/report`, { method: 'POST' }),
  connectors: () => call<{ connectors: any[]; analyst: { llm: boolean; provider: string | null } }>('/api/osint/connectors'),
};

export function edgeLabel(inv: Investigation, e: GraphEdge) {
  return `${inv.nodes[e.from]?.label ?? '?'} ${relText(e.type)} ${inv.nodes[e.to]?.label ?? '?'}`;
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;
