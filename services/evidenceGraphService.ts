import { deepseekChat, parseDeepSeekJson } from './deepseek';
import { loadPipelineState } from './casePipeline';
import type { PipelineState, PipelineEntity, PipelineInventoryItem, PipelineChronologyEntry, PipelineContradiction, PipelineMotion, PipelineGap, PipelineImpeachment } from '../types';

export type GraphNodeType = 'person' | 'organization' | 'document' | 'event' | 'contradiction' | 'motion' | 'gap' | 'impeachment' | 'statute' | 'location';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  subtype?: string;
  description?: string;
  importance: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
  sourceId?: string;
  metadata?: Record<string, any>;
}

export type GraphEdgeType = 'mentions' | 'contradicts' | 'supports' | 'authored' | 'scheduled' | 'impeaches' | 'addresses' | 'references' | 'related';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  label: string;
  strength: number;
  description?: string;
}

export interface EvidenceGraph {
  id: string;
  caseId: string;
  caseTitle: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    byType: Record<GraphNodeType, number>;
  };
  createdAt: number;
}

export const NODE_COLORS: Record<GraphNodeType, { bg: string; border: string; text: string; size: number }> = {
  person:          { bg: '#1e40af', border: '#3b82f6', text: '#93c5fd', size: 36 },
  organization:    { bg: '#1e3a5f', border: '#60a5fa', text: '#bfdbfe', size: 32 },
  document:        { bg: '#166534', border: '#22c55e', text: '#bbf7d0', size: 30 },
  event:           { bg: '#92400e', border: '#f59e0b', text: '#fde68a', size: 28 },
  contradiction:   { bg: '#991b1b', border: '#ef4444', text: '#fca5a5', size: 34 },
  motion:          { bg: '#6b21a8', border: '#a855f7', text: '#d8b4fe', size: 30 },
  gap:             { bg: '#9a3412', border: '#f97316', text: '#fed7aa', size: 28 },
  impeachment:     { bg: '#831843', border: '#ec4899', text: '#fbcfe8', size: 32 },
  statute:         { bg: '#1e3a5f', border: '#38bdf8', text: '#bae6fd', size: 26 },
  location:        { bg: '#14532d', border: '#4ade80', text: '#bbf7d0', size: 26 },
};

const severityScore = (severity: string): number => {
  switch (severity) {
    case 'critical': return 92;
    case 'high': return 78;
    case 'medium': return 52;
    case 'low': return 28;
    default: return 50;
  }
};

const confidenceScore = (confidence: string): number => {
  switch (confidence) {
    case 'high': return 80;
    case 'medium': return 55;
    case 'low': return 30;
    default: return 50;
  }
};

const priorityScore = (priority: string): number => {
  switch (priority) {
    case 'critical': return 95;
    case 'high': return 80;
    case 'medium': return 52;
    case 'low': return 28;
    default: return 50;
  }
};

const nodeId = (prefix: string, sourceId: string, counter: number): string =>
  `${prefix}-${sourceId}-${counter}`;

const edgeId = (source: string, target: string, type: string, counter: number): string =>
  `e-${source}-${target}-${type}-${counter}`;

const blankNode = (overrides: Partial<GraphNode>): GraphNode => ({
  id: '',
  label: '',
  type: 'document' as GraphNodeType,
  importance: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ...overrides,
});

export const buildGraphFromPipeline = (caseId: string): EvidenceGraph | null => {
  const state = loadPipelineState(caseId);
  if (!state) return null;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeCounter = 0;
  let nodeCounter = 0;

  const docNodeIds = new Map<string, string>();

  // ── Inventory → document nodes ───────────────────────────────────────────
  state.inventory.forEach((item) => {
    const id = nodeId('doc', item.id, nodeCounter++);
    docNodeIds.set(item.id, id);
    const edgeCount = state.chronology.filter((c) => c.source === item.id).length +
      state.contradictions.filter((c) => c.sourceA === item.id || c.sourceB === item.id).length +
      state.impeachments.filter((i) => i.source === item.id).length;

    nodes.push(blankNode({
      id,
      label: item.fileName,
      type: 'document',
      subtype: item.category,
      description: item.summary || item.extractedText?.slice(0, 120) || '',
      importance: Math.min(90, 30 + edgeCount * 8),
      sourceId: item.id,
      metadata: { fileSize: item.fileSize, batesNumber: item.batesNumber, category: item.category },
    }));
  });

  // ── Entities → person / organization / location / statute nodes ──────────
  const personMaxMentions = Math.max(1, ...state.entities
    .filter((e) => e.type === 'person')
    .map((e) => e.mentions));
  const allMaxMentions = Math.max(1, ...state.entities.map((e) => e.mentions));

  const entityNodeIds = new Map<string, string>();

  state.entities.forEach((e) => {
    const graphType = (e.type === 'date' || e.type === 'case-law')
      ? undefined
      : e.type as GraphNodeType;
    if (!graphType) return;

    const id = nodeId('ent', e.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(), nodeCounter++);
    entityNodeIds.set(e.name, id);

    let importance: number;
    if (graphType === 'person') {
      importance = 50 + Math.round((e.mentions / personMaxMentions) * 45);
    } else if (graphType === 'statute') {
      importance = 30 + Math.round((e.mentions / allMaxMentions) * 40);
    } else {
      importance = 35 + Math.round((e.mentions / allMaxMentions) * 40);
    }
    importance = Math.min(98, importance);

    nodes.push(blankNode({
      id,
      label: e.name,
      type: graphType,
      description: e.role ? `Role: ${e.role}, Mentioned ${e.mentions} times` : `Mentioned ${e.mentions} times`,
      importance,
      sourceId: e.name,
      metadata: { role: e.role, mentions: e.mentions, entityType: e.type },
    }));

    e.documents.forEach((docId) => {
      const targetNodeId = docNodeIds.get(docId);
      if (targetNodeId) {
        edges.push({
          id: edgeId(id, targetNodeId, 'mentions', edgeCounter++),
          source: id,
          target: targetNodeId,
          type: 'mentions',
          label: `${e.name} mentioned in`,
          strength: 40 + Math.min(55, e.mentions * 10),
        });
      }
    });
  });

  // ── Chronology → event nodes ─────────────────────────────────────────────
  state.chronology.forEach((entry) => {
    const id = nodeId('evt', entry.date.replace(/[^a-zA-Z0-9]/g, ''), nodeCounter++);
    nodes.push(blankNode({
      id,
      label: entry.title,
      type: 'event',
      description: `${entry.date}: ${entry.description}`,
      importance: confidenceScore(entry.confidence),
      sourceId: entry.date + entry.title,
      metadata: { date: entry.date, confidence: entry.confidence },
    }));

    const targetDocId = docNodeIds.get(entry.source);
    if (targetDocId) {
      edges.push({
        id: edgeId(targetDocId, id, 'scheduled', edgeCounter++),
        source: targetDocId,
        target: id,
        type: 'scheduled',
        label: `Source: ${entry.date}`,
        strength: 40,
        description: entry.title,
      });
    }
  });

  // ── Contradictions → contradiction nodes ──────────────────────────────────
  state.contradictions.forEach((c) => {
    const id = nodeId('con', c.id, nodeCounter++);
    nodes.push(blankNode({
      id,
      label: c.id,
      type: 'contradiction',
      description: c.description,
      importance: severityScore(c.severity),
      sourceId: c.id,
      metadata: { severity: c.severity, detail: c.detail, implication: c.implication },
    }));

    const docA = docNodeIds.get(c.sourceA);
    const docB = docNodeIds.get(c.sourceB);
    if (docA) {
      edges.push({
        id: edgeId(docA, id, 'contradicts', edgeCounter++),
        source: docA,
        target: id,
        type: 'contradicts',
        label: 'Contradiction source A',
        strength: severityScore(c.severity) / 2,
        description: c.detail,
      });
    }
    if (docB) {
      edges.push({
        id: edgeId(docB, id, 'contradicts', edgeCounter++),
        source: docB,
        target: id,
        type: 'contradicts',
        label: 'Contradiction source B',
        strength: severityScore(c.severity) / 2,
        description: c.detail,
      });
    }
  });

  // ── Motions → motion nodes ───────────────────────────────────────────────
  state.motions.forEach((m, idx) => {
    const id = nodeId('mot', `motion-${idx}`, nodeCounter++);
    nodes.push(blankNode({
      id,
      label: m.title,
      type: 'motion',
      description: `Type: ${m.type}, Priority: ${m.priority}, Basis: ${m.basis}`,
      importance: priorityScore(m.priority),
      sourceId: `motion-${idx}`,
      metadata: { motionType: m.type, priority: m.priority, draftContent: m.draftContent },
    }));

    const searchText = `${m.title} ${m.basis} ${m.draftContent || ''}`.toLowerCase();
    entityNodeIds.forEach((entityId, entityName) => {
      if (searchText.includes(entityName.toLowerCase())) {
        edges.push({
          id: edgeId(id, entityId, 'addresses', edgeCounter++),
          source: id,
          target: entityId,
          type: 'addresses',
          label: `Motion addresses ${entityName}`,
          strength: 45,
        });
      }
    });
  });

  // ── Gaps → gap nodes ─────────────────────────────────────────────────────
  state.gaps.forEach((g, idx) => {
    const id = nodeId('gap', `gap-${idx}`, nodeCounter++);
    nodes.push(blankNode({
      id,
      label: g.category,
      type: 'gap',
      description: g.description,
      importance: severityScore(g.severity),
      sourceId: `gap-${idx}`,
      metadata: { category: g.category, severity: g.severity, recommendation: g.recommendation },
    }));
  });

  // ── Impeachments → impeachment nodes ──────────────────────────────────────
  state.impeachments.forEach((imp, idx) => {
    const id = nodeId('imp', `impeachment-${idx}`, nodeCounter++);
    nodes.push(blankNode({
      id,
      label: `${imp.targetName} (${imp.targetRole})`,
      type: 'impeachment',
      description: imp.statement,
      importance: severityScore(imp.impeachmentValue),
      sourceId: `impeachment-${idx}`,
      metadata: { targetName: imp.targetName, targetRole: imp.targetRole, impeachmentValue: imp.impeachmentValue, suggestedQuestions: imp.suggestedQuestions },
    }));

    const sourceDocId = docNodeIds.get(imp.source);
    if (sourceDocId) {
      edges.push({
        id: edgeId(sourceDocId, id, 'impeaches', edgeCounter++),
        source: sourceDocId,
        target: id,
        type: 'impeaches',
        label: `Impeachment source against ${imp.targetName}`,
        strength: severityScore(imp.impeachmentValue) / 2,
        description: imp.contradiction,
      });
    }
  });

  const byType: Record<GraphNodeType, number> = {
    person: 0, organization: 0, document: 0, event: 0, contradiction: 0,
    motion: 0, gap: 0, impeachment: 0, statute: 0, location: 0,
  };
  nodes.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });

  return {
    id: `graph-${caseId}-${Date.now()}`,
    caseId,
    caseTitle: state.caseTitle,
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      byType,
    },
    createdAt: Date.now(),
  };
};

export const enrichGraphWithAI = async (graph: EvidenceGraph, caseContext: string): Promise<EvidenceGraph> => {
  if (graph.nodes.length === 0) return graph;

  const nodeSummary = graph.nodes
    .slice(0, 80)
    .map((n) => `- [${n.type}] ${n.label}${n.description ? ` — ${n.description.slice(0, 100)}` : ''}`)
    .join('\n');

  const edgeSummary = graph.edges
    .slice(0, 60)
    .map((e) => {
      const src = graph.nodes.find((n) => n.id === e.source);
      const tgt = graph.nodes.find((n) => n.id === e.target);
      return `- ${src?.label || e.source} --[${e.type}]--> ${tgt?.label || e.target}`;
    })
    .join('\n');

  const prompt = `Analyze this case evidence graph and identify non-obvious relationships between entities, documents, and events. Look for connections a human might miss.

Case: ${caseContext}
Graph: ${graph.caseTitle} (${graph.nodes.length} nodes, ${graph.edges.length} edges)

NODES:
${nodeSummary}

KNOWN EDGES:
${edgeSummary || 'None'}

Return JSON: { "newEdges": [{ "sourceLabel": string, "targetLabel": string, "type": "mentions"|"contradicts"|"supports"|"authored"|"scheduled"|"impeaches"|"addresses"|"references"|"related", "label": string, "description": string, "strength": number }] }
- sourceLabel/targetLabel: exact node labels from the NODES list above
- type: the relationship type
- strength: 0-100 confidence in this edge
- ONLY include edges that do NOT already exist in KNOWN EDGES
- Return at most 15 new edges`;

  try {
    const response = await deepseekChat({
      systemInstruction: 'You are a legal evidence graph analyst. Discover non-obvious connections in case evidence.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ newEdges?: { sourceLabel: string; targetLabel: string; type: GraphEdgeType; label: string; description?: string; strength: number }[] }>(
      response,
      { newEdges: [] }
    );

    const labelToId = new Map<string, string>();
    graph.nodes.forEach((n) => labelToId.set(n.label, n.id));

    let edgeCounter = graph.edges.length;
    const existingKeys = new Set(graph.edges.map((e) => `${e.source}|${e.target}|${e.type}`));
    const newEdges: GraphEdge[] = [];

    (parsed.newEdges || []).forEach((ne) => {
      const srcId = labelToId.get(ne.sourceLabel);
      const tgtId = labelToId.get(ne.targetLabel);
      if (!srcId || !tgtId) return;
      if (srcId === tgtId) return;
      const key = `${srcId}|${tgtId}|${ne.type}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);

      newEdges.push({
        id: `e-ai-${edgeCounter++}`,
        source: srcId,
        target: tgtId,
        type: ne.type,
        label: ne.label,
        strength: Math.min(100, Math.max(0, Math.round(ne.strength))),
        description: ne.description,
      });
    });

    const updatedEdges = [...graph.edges, ...newEdges];
    return {
      ...graph,
      edges: updatedEdges,
      stats: {
        ...graph.stats,
        totalEdges: updatedEdges.length,
      },
    };
  } catch {
    return graph;
  }
};

export const getGraphStats = (graph: EvidenceGraph): {
  mostConnected: GraphNode | null;
  criticalNodes: GraphNode[];
  isolatedNodes: GraphNode[];
  hubNodes: GraphNode[];
} => {
  const edgeCounts = new Map<string, number>();
  graph.edges.forEach((e) => {
    edgeCounts.set(e.source, (edgeCounts.get(e.source) || 0) + 1);
    edgeCounts.set(e.target, (edgeCounts.get(e.target) || 0) + 1);
  });

  let mostConnected: GraphNode | null = null;
  let maxEdges = 0;
  const criticalNodes: GraphNode[] = [];
  const isolatedNodes: GraphNode[] = [];
  const hubNodes: GraphNode[] = [];

  graph.nodes.forEach((n) => {
    const count = edgeCounts.get(n.id) || 0;
    if (count > maxEdges) {
      maxEdges = count;
      mostConnected = n;
    }
    if (n.importance > 80) criticalNodes.push(n);
    if (count === 0) isolatedNodes.push(n);
    if (count >= 5) hubNodes.push(n);
  });

  return { mostConnected, criticalNodes, isolatedNodes, hubNodes };
};

export const filterGraph = (
  graph: EvidenceGraph,
  types?: GraphNodeType[],
  query?: string
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  let filteredNodes = graph.nodes;

  if (types && types.length > 0) {
    const typeSet = new Set(types);
    filteredNodes = filteredNodes.filter((n) => typeSet.has(n.type));
  }

  if (query && query.trim()) {
    const lower = query.toLowerCase();
    filteredNodes = filteredNodes.filter(
      (n) =>
        n.label.toLowerCase().includes(lower) ||
        (n.description || '').toLowerCase().includes(lower) ||
        (n.subtype || '').toLowerCase().includes(lower)
    );
  }

  const nodeIdSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = graph.edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
};

export const generateGraphNarrative = async (graph: EvidenceGraph): Promise<string> => {
  if (graph.nodes.length === 0) return 'No evidence data available to generate a narrative.';

  const nodeList = graph.nodes
    .map((n) => `[${n.type}|imp:${n.importance}] ${n.label}${n.description ? ` — ${n.description.slice(0, 150)}` : ''}`)
    .join('\n');

  const criticalSet = new Set(getGraphStats(graph).criticalNodes.map((n) => n.id));
  const edgeList = graph.edges
    .filter((e) => criticalSet.has(e.source) || criticalSet.has(e.target))
    .slice(0, 40)
    .map((e) => {
      const src = graph.nodes.find((n) => n.id === e.source);
      const tgt = graph.nodes.find((n) => n.id === e.target);
      return `- ${src?.label || e.source} --[${e.type}]--> ${tgt?.label || e.target} (${e.label})`;
    })
    .join('\n');

  const contradictions = graph.nodes
    .filter((n) => n.type === 'contradiction')
    .map((n) => `- ${n.label}: ${n.description}`)
    .join('\n');

  const timelineNodes = graph.nodes
    .filter((n) => n.type === 'event')
    .sort((a, b) => (a.metadata?.date || '').localeCompare(b.metadata?.date || ''))
    .map((n) => `- ${n.metadata?.date || '?'}: ${n.label}`)
    .join('\n');

  const prompt = `You are a legal investigator. Tell the story this evidence graph reveals. What happened? Who is central? What are the key contradictions? What is the timeline?

Case: ${graph.caseTitle}
Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges

ALL NODES:
${nodeList}

KEY EDGES (around critical nodes):
${edgeList || 'None'}

CONTRADICTIONS:
${contradictions || 'None identified'}

TIMELINE:
${timelineNodes || 'No timeline events'}

Write a concise, evidence-based narrative summary (2-3 paragraphs). Be direct and investigative in tone.`;

  try {
    const response = await deepseekChat({
      systemInstruction: 'You are a legal investigator writing an evidence-based case narrative.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 1024,
      timeoutMs: 30000,
    });
    return response.trim();
  } catch {
    return 'Unable to generate narrative at this time. Review the evidence graph manually.';
  }
};
