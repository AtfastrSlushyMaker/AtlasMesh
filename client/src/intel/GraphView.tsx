import { useEffect, useRef } from 'react';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import type { GraphEdge, GraphNode, Investigation } from '../../../shared/osint';
import { NODE_STYLE, relText } from './model';
import { useApp } from '../state';

export interface GraphFilters {
  types: Set<string>; // hidden node types
  platforms: Set<string>; // hidden evidence platforms
  claims: Set<string>; // hidden claim kinds
  minConfidence: number;
  showHidden: boolean;
  showRejected: boolean;
}

interface Props {
  inv: Investigation;
  filters: GraphFilters;
  selected: string[];
  highlight: { nodeIds: string[]; edgeIds: string[] } | null;
  collapsed: Set<string>;
  onSelect: (id: string | null, kind: 'node' | 'edge' | null, additive: boolean) => void;
  onExpand: (nodeId: string) => void;
  fitSignal: number;
}

/** Colours come from the CSS theme tokens so the graph follows Day/Night. */
function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    fact: v('--fact', '#1f7a4d'),
    inference: v('--inference', '#1d5fa8'),
    hypothesis: v('--hypothesis', '#9a5b00'),
    magenta: '#e0a800',
    line: v('--line-strong', '#6d8391'),
    paper: v('--text', '#10202a'),
    halo: v('--bg', '#dfe4e7'),
    bad: v('--bad', '#b3261e'),
  };
}
let HEX = { fact: '#1f7a4d', inference: '#1d5fa8', hypothesis: '#9a5b00', magenta: '#e0a800', line: '#6d8391', paper: '#10202a', halo: '#dfe4e7', bad: '#b3261e' };

/** Which nodes are visible after filters and collapses. */
export function visibleGraph(inv: Investigation, f: GraphFilters, collapsed: Set<string>) {
  const edges = Object.values(inv.edges).filter((e) => {
    if (e.review === 'rejected' && !f.showRejected) return false;
    if (f.claims.has(e.claim)) return false;
    if (e.confidence.score < f.minConfidence && e.review !== 'verified') return false;
    if (f.platforms.size && e.evidenceIds.length && e.evidenceIds.every((id) => f.platforms.has(inv.evidence[id]?.platform))) return false;
    return true;
  });
  const nodeOk = (n: GraphNode | undefined) => !!n && (f.showHidden || !n.hidden) && !f.types.has(n.type);
  // Collapsing a node hides neighbours that are only connected through it.
  const degree = new Map<string, Set<string>>();
  for (const e of edges) {
    (degree.get(e.from) ?? degree.set(e.from, new Set()).get(e.from)!).add(e.to);
    (degree.get(e.to) ?? degree.set(e.to, new Set()).get(e.to)!).add(e.from);
  }
  const collapsedAway = new Set<string>();
  for (const c of collapsed) {
    for (const nb of degree.get(c) || []) {
      const others = [...(degree.get(nb) || [])].filter((x) => x !== c);
      if (others.length === 0 && !inv.seedIds.includes(nb) && !inv.nodes[nb]?.pinned) collapsedAway.add(nb);
    }
  }
  const nodes = Object.values(inv.nodes).filter((n) => nodeOk(n) && !collapsedAway.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  // Seeds stay visible even when isolated; other isolated nodes are dropped once edges are filtered.
  const liveEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const connected = new Set<string>(inv.seedIds);
  for (const e of liveEdges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  const shownNodes = nodes.filter((n) => connected.has(n.id) || n.pinned || Object.keys(inv.edges).length === 0);
  return { nodes: shownNodes, edges: liveEdges, hiddenByCollapse: collapsedAway.size };
}

function toElements(inv: Investigation, nodes: GraphNode[], edges: GraphEdge[], collapsed: Set<string>): ElementDefinition[] {
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  }
  const els: ElementDefinition[] = nodes.map((n) => {
    const st = NODE_STYLE[n.type];
    const d = deg.get(n.id) || 0;
    return {
      group: 'nodes',
      data: {
        id: n.id,
        label: n.label.length > 34 ? `${n.label.slice(0, 32)}…` : n.label,
        color: st?.color || '#999',
        shape: st?.shape || 'ellipse',
        size: Math.min(58, 22 + Math.sqrt(d) * 7 + (inv.seedIds.includes(n.id) ? 10 : 0)),
        seed: inv.seedIds.includes(n.id) ? 1 : 0,
        pinned: n.pinned ? 1 : 0,
        hiddenNode: n.hidden ? 1 : 0,
        collapsed: collapsed.has(n.id) ? 1 : 0,
        type: n.type,
      },
    };
  });
  for (const e of edges) {
    const identity = e.type === 'SAME_ENTITY_AS' || e.type === 'POSSIBLY_SAME_ENTITY_AS';
    els.push({
      group: 'edges',
      data: {
        id: e.id,
        source: e.from,
        target: e.to,
        label: relText(e.type),
        claim: e.claim,
        width: 1 + e.confidence.score * 2.5,
        opacity: 0.35 + e.confidence.score * 0.6,
        color: identity ? HEX.magenta : e.claim === 'HYPOTHESIS' ? HEX.hypothesis : e.claim === 'INFERENCE' ? HEX.inference : HEX.line,
        review: e.review,
      },
    });
  }
  return els;
}

const buildStyle = (): any[] => [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      shape: 'data(shape)',
      width: 'data(size)',
      height: 'data(size)',
      label: 'data(label)',
      color: HEX.paper,
      'font-family': 'Barlow, sans-serif',
      'font-size': 11,
      'text-valign': 'bottom',
      'text-margin-y': 5,
      'text-outline-color': HEX.halo,
      'text-outline-width': 2.5,
      'text-max-width': '140px',
      'text-wrap': 'ellipsis',
      'border-width': 1.5,
      'border-color': HEX.paper,
      'min-zoomed-font-size': 7,
    },
  },
  { selector: 'node[seed = 1]', style: { 'border-width': 3, 'border-color': HEX.magenta } },
  { selector: 'node[pinned = 1]', style: { 'border-width': 4, 'border-style': 'double', 'border-color': HEX.paper } },
  { selector: 'node[hiddenNode = 1]', style: { opacity: 0.35 } },
  { selector: 'node[collapsed = 1]', style: { 'background-blacken': 0.35, 'border-style': 'dashed', 'border-color': HEX.paper, 'border-width': 2 } },
  {
    selector: 'edge',
    style: {
      width: 'data(width)',
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      opacity: 'data(opacity)',
      label: '',
      'font-family': 'Barlow, sans-serif',
      'font-size': 10,
      color: HEX.paper,
      'text-outline-color': HEX.halo,
      'text-outline-width': 2,
      'text-rotation': 'autorotate',
    },
  },
  { selector: 'edge[claim = "INFERENCE"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [7, 4] } },
  { selector: 'edge[claim = "HYPOTHESIS"]', style: { 'line-style': 'dotted' } },
  { selector: 'edge[review = "verified"]', style: { 'line-style': 'solid' } },
  { selector: 'edge[review = "rejected"]', style: { 'line-color': HEX.bad, opacity: 0.4 } },
  { selector: 'edge:selected, edge.hover', style: { label: 'data(label)', opacity: 1, 'z-index': 10 } },
  { selector: 'node:selected', style: { 'border-width': 4, 'border-color': HEX.magenta, 'overlay-opacity': 0 } },
  { selector: 'edge:selected', style: { 'line-color': HEX.magenta, 'target-arrow-color': HEX.magenta } },
  { selector: '.dim', style: { opacity: 0.12 } },
  { selector: '.hl', style: { opacity: 1 } },
  { selector: 'edge.hl', style: { 'line-color': HEX.magenta, 'target-arrow-color': HEX.magenta, width: 4, label: 'data(label)' } },
  { selector: 'node.hl', style: { 'border-color': HEX.magenta, 'border-width': 4 } },
];

export function GraphView({ inv, filters, selected, highlight, collapsed, onSelect, onExpand, fitSignal }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const handlers = useRef({ onSelect, onExpand });
  handlers.current = { onSelect, onExpand };
  const invId = useRef<string | null>(null);
  const layoutRef = useRef<cytoscape.Layouts | null>(null);

  useEffect(() => {
    if (!host.current) return;
    HEX = palette();
    const cy = cytoscape({
      container: host.current,
      style: buildStyle(),
      wheelSensitivity: 0.25,
      minZoom: 0.08,
      maxZoom: 3,
      boxSelectionEnabled: false,
      selectionType: 'additive',
    });
    cyRef.current = cy;
    cy.on('tap', 'node, edge', (ev) => {
      const t = ev.target;
      const additive = !!(ev.originalEvent as MouseEvent)?.shiftKey;
      handlers.current.onSelect(t.id(), t.isNode() ? 'node' : 'edge', additive);
    });
    cy.on('tap', (ev) => {
      if (ev.target === cy) handlers.current.onSelect(null, null, false);
    });
    cy.on('dbltap', 'node', (ev) => handlers.current.onExpand(ev.target.id()));
    cy.on('mouseover', 'edge', (ev) => ev.target.addClass('hover'));
    cy.on('mouseout', 'edge', (ev) => ev.target.removeClass('hover'));
    cy.on('mouseover', 'node', () => (host.current!.style.cursor = 'pointer'));
    cy.on('mouseout', 'node', () => (host.current!.style.cursor = ''));
    return () => {
      layoutRef.current?.stop();
      cy.stop();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const { nodes, edges } = visibleGraph(inv, filters, collapsed);
    const els = toElements(inv, nodes, edges, collapsed);
    const fresh = invId.current !== inv.id;
    invId.current = inv.id;
    if (fresh) cy.elements().remove();
    const want = new Set(els.map((e) => e.data.id as string));
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (!want.has(el.id())) el.remove();
      });
    });
    const added: string[] = [];
    // Neighbour lookup for placing new nodes; built once instead of scanning edges per node.
    const nbrs = new Map<string, string[]>();
    for (const e of Object.values(inv.edges)) {
      (nbrs.get(e.from) ?? nbrs.set(e.from, []).get(e.from)!).push(e.to);
      (nbrs.get(e.to) ?? nbrs.set(e.to, []).get(e.to)!).push(e.from);
    }
    cy.batch(() => {
      for (const el of els) {
        const existing = cy.getElementById(el.data.id as string);
        if (existing.nonempty()) {
          existing.data(el.data);
          continue;
        }
        if (el.group === 'nodes') {
          // Start new nodes next to an existing neighbour so the layout settles locally.
          const nb = (nbrs.get(el.data.id as string) || []).find((id) => cy.getElementById(id).nonempty());
          const anchor = nb ? cy.getElementById(nb).position() : { x: 0, y: 0 };
          el.position = { x: anchor.x + (Math.random() - 0.5) * 120, y: anchor.y + (Math.random() - 0.5) * 120 };
          added.push(el.data.id as string);
        }
        cy.add(el);
      }
    });
    if (added.length || fresh) {
      const n = cy.nodes().length;
      layoutRef.current?.stop();
      layoutRef.current = cy.layout({
        name: 'cose',
        animate: n < 250 && !fresh,
        animationDuration: 450,
        randomize: fresh,
        fit: fresh || added.length > n / 3,
        padding: 60,
        nodeRepulsion: () => 9000,
        idealEdgeLength: () => 90,
        edgeElasticity: () => 80,
        gravity: 0.3,
        numIter: n > 400 ? 600 : 1200,
      } as any);
      layoutRef.current.run();
    }
  }, [inv, filters, collapsed]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().unselect();
      for (const id of selected) cy.getElementById(id).select();
    });
  }, [selected, inv]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('dim hl');
      if (highlight && (highlight.nodeIds.length || highlight.edgeIds.length)) {
        cy.elements().addClass('dim');
        for (const id of [...highlight.nodeIds, ...highlight.edgeIds]) cy.getElementById(id).removeClass('dim').addClass('hl');
      }
    });
    if (highlight?.nodeIds.length) {
      const col = cy.collection(highlight.nodeIds.map((id) => cy.getElementById(id)).filter((x) => x.nonempty()) as any);
      if (col.length) cy.animate({ fit: { eles: col, padding: 120 }, duration: 400 } as any);
    }
  }, [highlight, inv]);

  // Re-read theme colours when Day/Night changes.
  const theme = useApp((st) => st.prefs.theme);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const t = setTimeout(() => {
      HEX = palette();
      cy.style(buildStyle());
    }, 30);
    return () => clearTimeout(t);
  }, [theme]);

  useEffect(() => {
    if (fitSignal) cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 50 }, duration: 350 } as any);
  }, [fitSignal]);

  return <div ref={host} className="graph-canvas" role="application" aria-label="Investigation graph. Use the entity list for keyboard navigation." />;
}
