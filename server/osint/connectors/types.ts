import type { AxiosRequestConfig } from 'axios';
import type { Evidence, GraphNode, NodeType, RelType } from '../../../shared/osint';

/**
 * Connector contract. A connector takes one graph node, queries ONE public
 * source through its official API (or a public, robots-permitted page), and
 * returns entities and relations — each with the evidence that supports it.
 * It never touches the graph directly; ingestion does that.
 */

export type EvidenceInput = Omit<Evidence, 'id' | 'connector' | 'platform' | 'retrievedAt' | 'reliability'> & {
  reliability?: number;
};

export interface FoundEntity {
  /** Local reference used by relations in the same output. */
  ref: string;
  type: NodeType;
  /** Raw identifying value; normalized into the node key during ingestion. */
  value: string;
  /** Scope for non-unique identifiers (person names). */
  scope?: string;
  label: string;
  attributes?: Record<string, string | number | boolean | undefined | null>;
  evidence: EvidenceInput;
  geo?: { lat: number; lon: number; label?: string };
}

export interface FoundRelation {
  /** "$self" is the node being expanded. */
  from: string;
  to: string;
  type: RelType;
  /** Source states it directly (FACT) vs. connector-level guess (HYPOTHESIS). */
  explicit: boolean;
  validFrom?: string;
  validTo?: string;
  reasoning?: string;
  evidence: EvidenceInput;
}

export interface ConnectorOutput {
  /** Attributes to attach to the expanded node itself. */
  selfAttributes?: Record<string, string | number | boolean | undefined | null>;
  selfEvidence?: EvidenceInput;
  selfGeo?: { lat: number; lon: number; label?: string };
  entities: FoundEntity[];
  relations: FoundRelation[];
  notes?: string[];
}

export interface ConnectorContext {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  /** Fetch an arbitrary public page with SSRF + robots checks. */
  getPage(url: string): Promise<{ url: string; html: string } | null>;
  log(message: string, level?: 'info' | 'warn'): void;
  signal: { cancelled: boolean };
}

export interface Connector {
  id: string;
  name: string;
  platform: string;
  description: string;
  /** Node types this connector can expand. */
  accepts: NodeType[];
  /** Optional finer filter on the node (e.g. only github accounts). */
  canHandle?(node: GraphNode): boolean;
  reliability: number;
  /** Minimum spacing between requests to this source. */
  minIntervalMs: number;
  requiresEnv?: string[];
  optionalEnv?: string[];
  run(node: GraphNode, ctx: ConnectorContext): Promise<ConnectorOutput>;
}

export const empty = (): ConnectorOutput => ({ entities: [], relations: [] });

/** Helper to read the canonical value behind a node key, e.g. "account:github:x" → "github:x". */
export function keyValue(node: GraphNode): string {
  return node.key.slice(node.key.indexOf(':') + 1);
}

export function accountParts(node: GraphNode): { platform: string; handle: string } | null {
  if (node.type !== 'account') return null;
  const v = keyValue(node);
  const i = v.lastIndexOf(':');
  if (i < 0) return null;
  return { platform: v.slice(0, i), handle: v.slice(i + 1) };
}

export function firstAttr(node: GraphNode, name: string): string | undefined {
  const v = node.attributes[name]?.[0]?.value;
  return v == null ? undefined : String(v);
}
