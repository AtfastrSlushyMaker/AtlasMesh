import type { ConnectorInfo, GraphNode } from '../../../shared/osint';
import type { Connector } from './types';
import { githubConnector } from './github';
import { gitlabConnector } from './gitlab';
import { npmConnector, pypiConnector, dockerhubConnector } from './packages';
import { huggingfaceConnector, stackexchangeConnector } from './community';
import { orcidConnector, crossrefConnector, arxivConnector, semanticScholarConnector } from './research';
import { dnsConnector, rdapConnector, certConnector } from './infrastructure';
import { websiteConnector } from './website';
import { wikidataConnector } from './wikidata';

/**
 * Connector registry. Adding a source means writing one Connector and
 * listing it here — nothing else in the engine changes.
 */
export const CONNECTORS: Connector[] = [
  githubConnector,
  gitlabConnector,
  huggingfaceConnector,
  stackexchangeConnector,
  npmConnector,
  pypiConnector,
  dockerhubConnector,
  orcidConnector,
  crossrefConnector,
  arxivConnector,
  semanticScholarConnector,
  wikidataConnector,
  websiteConnector,
  dnsConnector,
  rdapConnector,
  certConnector,
];

export function connectorAvailable(c: Connector) {
  return (c.requiresEnv ?? []).every((k) => !!process.env[k]);
}

export function connectorsFor(node: GraphNode, enabled: string[] | null): Connector[] {
  return CONNECTORS.filter(
    (c) =>
      connectorAvailable(c) &&
      (!enabled || enabled.includes(c.id)) &&
      c.accepts.includes(node.type) &&
      (!c.canHandle || c.canHandle(node))
  );
}

export function connectorInfo(): ConnectorInfo[] {
  return CONNECTORS.map((c) => {
    const missingOptional = (c.optionalEnv ?? []).filter((k) => !process.env[k]);
    return {
      id: c.id,
      name: c.name,
      platform: c.platform,
      description: c.description,
      accepts: c.accepts,
      available: connectorAvailable(c),
      note: missingOptional.length ? `Optional: set ${missingOptional.join(', ')} for higher rate limits` : undefined,
    };
  });
}

export function getConnector(id: string) {
  return CONNECTORS.find((c) => c.id === id);
}
