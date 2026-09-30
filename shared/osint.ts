/**
 * OSINT graph model shared by the server engine and the investigation workspace.
 *
 * Every node attribute and every edge points at Evidence records. Nothing in
 * the graph exists without a source.
 */

export type NodeType =
  | 'person'
  | 'organization'
  | 'university'
  | 'account'
  | 'email'
  | 'website'
  | 'domain'
  | 'ip'
  | 'repository'
  | 'project'
  | 'package'
  | 'technology'
  | 'paper'
  | 'patent'
  | 'event'
  | 'location'
  | 'document'
  | 'certificate';

export type RelType =
  | 'WORKS_AT'
  | 'WORKED_AT'
  | 'STUDIED_AT'
  | 'CONTRIBUTED_TO'
  | 'CREATED'
  | 'MAINTAINS'
  | 'OWNS'
  | 'USES'
  | 'MENTIONED_IN'
  | 'ASSOCIATED_WITH'
  | 'MEMBER_OF'
  | 'COLLABORATED_WITH'
  | 'SPOKE_AT'
  | 'AUTHORED'
  | 'COAUTHORED'
  | 'LINKS_TO'
  | 'LOCATED_IN'
  | 'RESOLVES_TO'
  | 'HOSTED_BY'
  | 'SUBDOMAIN_OF'
  | 'REGISTERED_WITH'
  | 'PUBLISHED_IN'
  | 'SAME_ENTITY_AS'
  | 'POSSIBLY_SAME_ENTITY_AS';

/**
 * FACT: a source explicitly states the relationship.
 * INFERENCE: derived by the engine from several pieces of evidence.
 * HYPOTHESIS: plausible, but evidence is insufficient.
 */
export type ClaimKind = 'FACT' | 'INFERENCE' | 'HYPOTHESIS';

export type ConfidenceLevel = 'confirmed' | 'high' | 'medium' | 'weak' | 'unresolved';

export type ReviewStatus = 'unreviewed' | 'verified' | 'rejected' | 'uncertain';

export interface ConfidenceSignal {
  id: string;
  label: string;
  /** Contribution to the score, can be negative. */
  weight: number;
  detail?: string;
}

export interface Confidence {
  score: number; // 0..1
  level: ConfidenceLevel;
  signals: ConfidenceSignal[];
}

export interface Evidence {
  id: string;
  connector: string;
  platform: string;
  sourceUrl: string;
  retrievedAt: number;
  /** Short verbatim or structured excerpt supporting the claim. */
  excerpt: string;
  method: 'api' | 'dns' | 'rdap' | 'ct-log' | 'html' | 'structured-data' | 'inference' | 'analyst';
  /** Prior reliability of the source, 0..1. */
  reliability: number;
  /** Date the fact itself refers to (e.g. repo created), ISO string. */
  observedDate?: string;
  /** True when the subject published the claim about themselves (bio, profile field). */
  selfReported?: boolean;
}

export interface AttributeValue {
  value: string | number | boolean;
  evidenceIds: string[];
}

export interface Note {
  id: string;
  text: string;
  createdAt: number;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  /** Canonical identity key after normalization, e.g. "account:github:torvalds". */
  key: string;
  label: string;
  attributes: Record<string, AttributeValue[]>;
  evidenceIds: string[];
  firstObserved: number;
  lastObserved: number;
  depth: number;
  discoveredBy: string;
  /** Connector ids already run against this node. */
  expandedWith: string[];
  pinned?: boolean;
  hidden?: boolean;
  notes: Note[];
  geo?: { lat: number; lon: number; label?: string };
}

export interface GraphEdge {
  id: string;
  type: RelType;
  from: string;
  to: string;
  claim: ClaimKind;
  explicit: boolean;
  confidence: Confidence;
  evidenceIds: string[];
  firstObserved: number;
  lastObserved: number;
  validFrom?: string;
  validTo?: string;
  /** Human-readable reasoning, required for inferred and identity edges. */
  reasoning?: string;
  review: ReviewStatus;
  notes: Note[];
}

export interface Contradiction {
  id: string;
  kind: 'employment' | 'location' | 'identity' | 'name' | 'date';
  description: string;
  nodeIds: string[];
  edgeIds: string[];
  evidenceIds: string[];
  /** temporal: both can be true at different times. unresolved: they conflict. */
  status: 'temporal' | 'unresolved' | 'dismissed';
}

export interface TimelineEvent {
  id: string;
  date: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
  evidenceIds: string[];
  claim: ClaimKind;
}

export interface InvestigationSettings {
  maxDepth: number;
  maxNodes: number;
  maxRequestsPerJob: number;
  minConfidence: number;
  enabledConnectors: string[] | null; // null = all available
}

export interface JobLogEntry {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  connector?: string;
  nodeId?: string;
}

export interface Job {
  id: string;
  investigationId: string;
  seedNodeId: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  requests: number;
  nodesAdded: number;
  edgesAdded: number;
  log: JobLogEntry[];
}

export interface Investigation {
  id: string;
  title: string;
  objective: string;
  createdAt: number;
  updatedAt: number;
  settings: InvestigationSettings;
  seedIds: string[];
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  evidence: Record<string, Evidence>;
  contradictions: Contradiction[];
  notes: Note[];
  jobs: Job[];
}

export interface InvestigationSummary {
  id: string;
  title: string;
  objective: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
  edgeCount: number;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  platform: string;
  description: string;
  accepts: NodeType[];
  available: boolean;
  note?: string;
}

export interface AnalystCitation {
  kind: 'node' | 'edge' | 'evidence';
  id: string;
  label: string;
}

export interface AnalystAnswer {
  answer: string;
  citations: AnalystCitation[];
  mode: 'llm' | 'rules';
  highlight?: { nodeIds: string[]; edgeIds: string[] };
  toolTrace?: string[];
}

export const CONFIDENCE_ORDER: ConfidenceLevel[] = ['unresolved', 'weak', 'medium', 'high', 'confirmed'];

export function levelForScore(score: number): ConfidenceLevel {
  if (score >= 0.9) return 'confirmed';
  if (score >= 0.72) return 'high';
  if (score >= 0.5) return 'medium';
  if (score >= 0.25) return 'weak';
  return 'unresolved';
}
