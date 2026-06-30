
import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import {
  Network, ZoomIn, ZoomOut, Maximize2, Filter, X, Search, ChevronRight,
  AlertTriangle, Users, FileText, Calendar, Zap, Loader2, Eye, EyeOff,
  BrainCircuit, Target, Shield, Hash
} from 'lucide-react';
import {
  buildGraphFromPipeline, enrichGraphWithAI, getGraphStats, filterGraph,
  generateGraphNarrative, NODE_COLORS,
  type EvidenceGraph, type GraphNode, type GraphEdge, type GraphNodeType, type GraphEdgeType
} from '../services/evidenceGraphService';
import { loadPipelineState } from '../services/casePipeline';
import type { PipelineState } from '../types';

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1800;
const CENTER_X = WORLD_WIDTH / 2;
const CENTER_Y = WORLD_HEIGHT / 2;

const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  person: 'Person',
  organization: 'Organization',
  document: 'Document',
  event: 'Event',
  contradiction: 'Contradiction',
  motion: 'Motion',
  gap: 'Evidence Gap',
  impeachment: 'Impeachment',
  statute: 'Statute',
  location: 'Location',
};

const NODE_TYPE_ICONS: Partial<Record<GraphNodeType, React.ReactNode>> = {
  person: <Users size={14} />,
  organization: <Shield size={14} />,
  document: <FileText size={14} />,
  event: <Calendar size={14} />,
  contradiction: <AlertTriangle size={14} />,
  motion: <Target size={14} />,
  gap: <Hash size={14} />,
  impeachment: <Zap size={14} />,
  statute: <FileText size={14} />,
  location: <Target size={14} />,
};

const getEdgeColor = (type: GraphEdgeType): string => {
  switch (type) {
    case 'contradicts': return '#ef4444';
    case 'supports': return '#22c55e';
    case 'impeaches': return '#ec4899';
    case 'mentions': return '#3b82f6';
    case 'addresses': return '#a855f7';
    case 'authored': return '#f59e0b';
    case 'scheduled': return '#38bdf8';
    case 'references': return '#60a5fa';
    case 'related': return '#94a3b8';
    default: return '#64748b';
  }
};

const importanceBarColor = (val: number): string => {
  if (val >= 80) return 'bg-red-500';
  if (val >= 60) return 'bg-amber-500';
  if (val >= 40) return 'bg-yellow-500';
  return 'bg-slate-500';
};

const allNodeTypes: GraphNodeType[] = [
  'person', 'organization', 'document', 'event', 'contradiction',
  'motion', 'gap', 'impeachment', 'statute', 'location',
];

const EvidenceMapper: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [graph, setGraph] = useState<EvidenceGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [narrative, setNarrative] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<GraphNodeType>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof getGraphStats> | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!activeCase) {
      setGraph(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const pipelineState = loadPipelineState(activeCase.id);
    if (!pipelineState || pipelineState.status !== 'completed') {
      setGraph(null);
      setLoading(false);
      return;
    }
    try {
      const g = buildGraphFromPipeline(activeCase.id);
      setGraph(g);
      if (g) {
        setStats(getGraphStats(g));
      }
    } catch {
      setGraph(null);
    }
    setLoading(false);
  }, [activeCase]);

  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;

    let running = true;
    const nodes: GraphNode[] = [...graph.nodes].map(n => ({
      ...n,
      x: n.x || (Math.random() * 800 - 400),
      y: n.y || (Math.random() * 600 - 300),
      vx: 0,
      vy: 0,
    }));
    const edges = graph.edges;
    const nodeIndex = new Map<string, number>();
    nodes.forEach((n, i) => nodeIndex.set(n.id, i));

    let frameCount = 0;
    const simulate = () => {
      if (!running) return;
      frameCount++;

      const alpha = Math.max(0.02, 1 - frameCount / 300);

      for (let i = 0; i < nodes.length; i++) {
        let fx = 0, fy = 0;

        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);
          fx += (dx / dist) * force * alpha;
          fy += (dy / dist) * force * alpha;
        }

        for (const edge of edges) {
          const si = nodeIndex.get(edge.source);
          const ti = nodeIndex.get(edge.target);
          if (si === undefined || ti === undefined) continue;
          if (edge.source === nodes[i].id) {
            const dx = nodes[ti].x - nodes[i].x;
            const dy = nodes[ti].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            fx += dx * 0.015 * alpha;
            fy += dy * 0.015 * alpha;
          }
        }

        fx += nodes[i].importance * 0.02 * (nodes[i].x < 0 ? 1 : -1) * alpha * 0.1;
        fx -= nodes[i].x * 0.002 * alpha;
        fy -= nodes[i].y * 0.002 * alpha;

        nodes[i].vx = (nodes[i].vx + fx) * 0.8;
        nodes[i].vy = (nodes[i].vy + fy) * 0.8;
        nodes[i].x += nodes[i].vx;
        nodes[i].y += nodes[i].vy;
      }

      if (frameCount % 3 === 0) {
        setGraph(prev => prev ? { ...prev, nodes: [...nodes] } : prev);
      }

      animFrameRef.current = requestAnimationFrame(simulate);
    };

    simulate();
    const timer = setTimeout(() => { running = false; }, 6000);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout(timer);
    };
  }, [graph?.id]);

  const filtered = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const filterArr = filterTypes.size > 0 ? Array.from(filterTypes) : undefined;
    const result = filterGraph(graph, filterArr, searchQuery);
    return result;
  }, [graph, filterTypes, searchQuery]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    if (graph) {
      graph.nodes.forEach(n => m.set(n.id, n));
    }
    return m;
  }, [graph]);

  const handleZoom = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(3, Math.max(0.2, prev + delta)));
  }, []);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof SVGElement || (e.target as HTMLElement).closest('[data-node]')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handlePanEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleFilterType = useCallback((type: GraphNodeType) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const selectAllTypes = useCallback(() => {
    setFilterTypes(new Set());
  }, []);

  const clearAllTypes = useCallback(() => {
    setFilterTypes(new Set(allNodeTypes));
  }, []);

  const handleEnrich = useCallback(async () => {
    if (!graph || !activeCase) return;
    setEnriching(true);
    try {
      const context = `${activeCase.title} — ${activeCase.summary}`;
      const enriched = await enrichGraphWithAI(graph, context);
      setGraph(enriched);
      setStats(getGraphStats(enriched));
    } catch {
      // enrich silently fails
    }
    setEnriching(false);
  }, [graph, activeCase]);

  const handleGenerateNarrative = useCallback(async () => {
    if (!graph) return;
    setNarrativeLoading(true);
    try {
      const text = await generateGraphNarrative(graph);
      setNarrative(text);
    } catch {
      setNarrative('Unable to generate narrative. Please try again.');
    }
    setNarrativeLoading(false);
  }, [graph]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  const connectedNodes = useMemo(() => {
    if (!selectedNode || !graph) return [];
    const connectedIds = new Set<string>();
    graph.edges.forEach(e => {
      if (e.source === selectedNode.id) connectedIds.add(e.target);
      if (e.target === selectedNode.id) connectedIds.add(e.source);
    });
    return graph.nodes.filter(n => connectedIds.has(n.id));
  }, [selectedNode, graph]);

  const relatedEdges = useMemo(() => {
    if (!selectedNode || !graph) return [];
    return graph.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
  }, [selectedNode, graph]);

  const hasPipelineData = activeCase && loadPipelineState(activeCase.id)?.status === 'completed';

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 gap-3">
        <Network size={48} className="text-slate-600" />
        <p className="text-lg font-medium">Select a case to view its evidence graph</p>
        <p className="text-sm text-slate-500">Choose an active case from the sidebar to begin mapping</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 size={32} className="text-gold-500 animate-spin" />
        <p className="text-slate-400 text-sm">Loading evidence graph...</p>
      </div>
    );
  }

  if (!hasPipelineData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 gap-3">
        <AlertTriangle size={48} className="text-amber-500/60" />
        <p className="text-lg font-medium">Run Case Pipeline first to generate evidence data</p>
        <p className="text-sm text-slate-500">The pipeline extracts entities, chronology, contradictions, and more</p>
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 gap-3">
        <Search size={48} className="text-slate-600" />
        <p className="text-lg font-medium">No evidence data to map</p>
        <p className="text-sm text-slate-500">The pipeline completed but produced no mappable entities</p>
      </div>
    );
  }

  const visibleNodes = filtered.nodes;
  const visibleEdges = filtered.edges;
  const graphNodeCount = graph.nodes.length;
  const graphEdgeCount = graph.edges.length;

  const nodeTypeCounts: Record<string, number> = {};
  graph.nodes.forEach(n => {
    nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] || 0) + 1;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-gold-400">
          <Network size={22} />
          <h1 className="text-xl font-serif font-bold text-white">Evidence Mapper</h1>
        </div>
        <span className="text-slate-500 text-sm px-3 py-1 bg-slate-800/60 rounded-lg border border-slate-700/50 truncate max-w-xs">
          {activeCase.title}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors" title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors" title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button onClick={resetView} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors" title="Reset View">
            <Maximize2 size={16} />
          </button>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'}`}
            title="Toggle Filters"
          >
            <Filter size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> {graphNodeCount} nodes</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> {graphEdgeCount} edges</span>
        </div>
      </div>

      {/* ── Filter Panel ────────────────────────────────────────── */}
      {showFilters && (
        <div className="bg-slate-900/70 backdrop-blur border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Filter size={14} />
              <span>Filter Node Types</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={selectAllTypes} className="text-xs text-gold-400 hover:text-gold-300 transition-colors">Select All</button>
              <span className="text-slate-600">|</span>
              <button onClick={clearAllTypes} className="text-xs text-slate-400 hover:text-slate-300 transition-colors">Clear All</button>
              <button onClick={() => setShowFilters(false)} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {allNodeTypes.map(type => {
              const colors = NODE_COLORS[type];
              const isActive = !filterTypes.has(type);
              const count = nodeTypeCounts[type] || 0;
              return (
                <button
                  key={type}
                  onClick={() => toggleFilterType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    isActive
                      ? 'border-current text-white'
                      : 'border-slate-700/50 text-slate-600 bg-slate-800/40'
                  }`}
                  style={isActive ? { borderColor: colors.border, backgroundColor: `${colors.bg}40` } : {}}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.border }} />
                  {NODE_TYPE_LABELS[type]}
                  <span className="text-slate-500">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/60 text-slate-300 text-sm pl-9 pr-3 py-2 rounded-lg border border-slate-700/60 focus:border-gold-500/50 focus:outline-none placeholder-slate-600"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main Area ───────────────────────────────────────────── */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* ── Graph Canvas ──────────────────────────────────────── */}
        <div className="flex-1 relative">
          {/* Enrich Button */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="flex items-center gap-2 px-4 py-2 bg-gold-500/20 border border-gold-500/40 text-gold-400 rounded-lg text-sm font-medium hover:bg-gold-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {enriching ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
              {enriching ? 'Analyzing...' : 'Enrich with AI'}
            </button>
          </div>

          <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden bg-slate-950 rounded-xl border border-slate-700/50"
            onWheel={handleZoom}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', minHeight: 500 }}
          >
            <div
              className="absolute"
              style={{
                width: WORLD_WIDTH,
                height: WORLD_HEIGHT,
                left: '50%',
                top: '50%',
                marginLeft: -WORLD_WIDTH / 2,
                marginTop: -WORLD_HEIGHT / 2,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <svg
                className="absolute inset-0 pointer-events-none"
                width={WORLD_WIDTH}
                height={WORLD_HEIGHT}
                viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
              >
                {visibleEdges.map(edge => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target) return null;
                  const sx = CENTER_X + source.x;
                  const sy = CENTER_Y + source.y;
                  const tx = CENTER_X + target.x;
                  const ty = CENTER_Y + target.y;
                  return (
                    <line key={edge.id}
                      x1={sx} y1={sy} x2={tx} y2={ty}
                      stroke={getEdgeColor(edge.type)}
                      strokeWidth={Math.max(0.5, edge.strength / 30)}
                      opacity={0.4}
                    />
                  );
                })}
                {selectedNode && relatedEdges.map(edge => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target) return null;
                  const sx = CENTER_X + source.x;
                  const sy = CENTER_Y + source.y;
                  const tx = CENTER_X + target.x;
                  const ty = CENTER_Y + target.y;
                  return (
                    <line key={`sel-${edge.id}`}
                      x1={sx} y1={sy} x2={tx} y2={ty}
                      stroke="#fbbf24"
                      strokeWidth={Math.max(0.5, edge.strength / 30) + 0.5}
                      opacity={0.7}
                    />
                  );
                })}
              </svg>

              {visibleNodes.map(node => {
                const colors = NODE_COLORS[node.type];
                const size = colors.size * (0.7 + node.importance / 300);
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    data-node="true"
                    className="absolute rounded-full flex items-center justify-center transition-transform duration-150 border-2 cursor-pointer"
                    style={{
                      left: CENTER_X + node.x - size / 2,
                      top: CENTER_Y + node.y - size / 2,
                      width: size,
                      height: size,
                      backgroundColor: colors.bg,
                      borderColor: isSelected ? '#fbbf24' : colors.border,
                      boxShadow: isSelected ? `0 0 16px ${colors.border}` : 'none',
                      zIndex: isSelected ? 10 : 1,
                      transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                    }}
                    onClick={() => handleNodeClick(node)}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <span className="text-xs font-bold select-none" style={{ color: colors.text, fontSize: Math.max(9, size * 0.28) }}>
                      {node.label.slice(0, 4).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Hover Tooltip */}
            {hoveredNode && !isDragging && (
              <div
                className="absolute pointer-events-none bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 shadow-lg z-30"
                style={{
                  left: (() => {
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    if (!containerRect) return 0;
                    const worldX = CENTER_X + hoveredNode.x;
                    const worldY = CENTER_Y + hoveredNode.y;
                    const cx = containerRect.width / 2;
                    const cy = containerRect.height / 2;
                    return cx + (worldX - WORLD_WIDTH / 2) * zoom + pan.x + NODE_COLORS[hoveredNode.type].size;
                  })(),
                  top: (() => {
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    if (!containerRect) return 0;
                    const worldY = CENTER_Y + hoveredNode.y;
                    const cy = containerRect.height / 2;
                    return cy + (worldY - WORLD_HEIGHT / 2) * zoom + pan.y - 40;
                  })(),
                }}
              >
                <p className="text-white text-sm font-medium">{hoveredNode.label}</p>
                <p className="text-xs" style={{ color: NODE_COLORS[hoveredNode.type].border }}>
                  {NODE_TYPE_LABELS[hoveredNode.type]} · Importance: {hoveredNode.importance}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Detail Sidebar ────────────────────────────────────── */}
        <div className="w-80 shrink-0 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
          {selectedNode ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[selectedNode.type].border }}
                  />
                  <span className="text-xs text-slate-400 uppercase tracking-wider">{NODE_TYPE_LABELS[selectedNode.type]}</span>
                </div>
                <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <div>
                  <h3 className="text-white font-semibold text-base leading-tight">{selectedNode.label}</h3>
                  {selectedNode.description && (
                    <p className="text-slate-400 text-sm mt-1">{selectedNode.description}</p>
                  )}
                </div>

                {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Metadata</p>
                    <div className="space-y-1">
                      {Object.entries(selectedNode.metadata).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <span className="text-slate-300 truncate max-w-40" title={String(val)}>
                            {typeof val === 'object' ? JSON.stringify(val).slice(0, 40) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">Importance</span>
                    <span className="text-xs text-slate-400">{selectedNode.importance}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${importanceBarColor(selectedNode.importance)}`}
                      style={{ width: `${selectedNode.importance}%` }}
                    />
                  </div>
                </div>

                {connectedNodes.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Connected Nodes ({connectedNodes.length})
                    </p>
                    <div className="space-y-1.5">
                      {connectedNodes.slice(0, 12).map(cn => {
                        const colors = NODE_COLORS[cn.type];
                        return (
                          <button
                            key={cn.id}
                            onClick={() => handleNodeClick(cn)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 text-left transition-colors"
                          >
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.border }} />
                            <span className="text-sm text-slate-300 truncate">{cn.label}</span>
                            <ChevronRight size={12} className="text-slate-600 ml-auto shrink-0" />
                          </button>
                        );
                      })}
                      {connectedNodes.length > 12 && (
                        <p className="text-xs text-slate-600 pl-2">+{connectedNodes.length - 12} more</p>
                      )}
                    </div>
                  </div>
                )}

                {relatedEdges.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Related Edges ({relatedEdges.length})
                    </p>
                    <div className="space-y-1.5">
                      {relatedEdges.slice(0, 8).map(edge => {
                        const src = nodeMap.get(edge.source);
                        const tgt = nodeMap.get(edge.target);
                        return (
                          <div key={edge.id} className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded bg-slate-800/30">
                            <span className="text-slate-400 truncate max-w-24">{src?.label || edge.source}</span>
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: getEdgeColor(edge.type), backgroundColor: `${getEdgeColor(edge.type)}20` }}>
                              {edge.type}
                            </span>
                            <span className="text-slate-400 truncate max-w-24">{tgt?.label || edge.target}</span>
                          </div>
                        );
                      })}
                      {relatedEdges.length > 8 && (
                        <p className="text-xs text-slate-600 pl-2">+{relatedEdges.length - 8} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Target size={32} className="text-slate-600 mb-3" />
              <p className="text-slate-500 text-sm">Click a node to view details</p>
              <p className="text-slate-600 text-xs mt-1">Select a node to see its connections, metadata, and importance</p>

              {stats && (
                <div className="mt-6 w-full space-y-3">
                  {stats.mostConnected && (
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">Most Connected</p>
                      <p className="text-sm text-slate-200 font-medium">{stats.mostConnected.label}</p>
                      <p className="text-xs text-slate-500">{NODE_TYPE_LABELS[stats.mostConnected.type]}</p>
                    </div>
                  )}
                  {stats.criticalNodes.length > 0 && (
                    <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20">
                      <p className="text-xs text-red-400 mb-1">Critical Nodes ({stats.criticalNodes.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {stats.criticalNodes.slice(0, 5).map(n => (
                          <button
                            key={n.id}
                            onClick={() => handleNodeClick(n)}
                            className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                          >
                            {n.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {stats.isolatedNodes.length > 0 && (
                    <p className="text-xs text-slate-500">
                      <EyeOff size={12} className="inline mr-1" />
                      {stats.isolatedNodes.length} isolated nodes
                    </p>
                  )}
                  {stats.hubNodes.length > 0 && (
                    <p className="text-xs text-slate-500">
                      <Network size={12} className="inline mr-1" />
                      {stats.hubNodes.length} hub nodes (5+ connections)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Narrative ────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-gold-400" />
            <h3 className="text-sm font-semibold text-white">AI Narrative</h3>
          </div>
          <button
            onClick={handleGenerateNarrative}
            disabled={narrativeLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gold-500/20 border border-gold-500/40 text-gold-400 rounded-lg text-sm font-medium hover:bg-gold-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {narrativeLoading ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
            {narrativeLoading ? 'Generating...' : 'Generate Narrative'}
          </button>
        </div>

        {narrative ? (
          <div className="bg-slate-950/80 rounded-lg p-4 border border-slate-700/30">
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{narrative}</p>
          </div>
        ) : (
          <div className="bg-slate-950/80 rounded-lg p-4 border border-slate-700/30 flex items-center justify-center h-20">
            <p className="text-slate-600 text-sm">Click "Generate Narrative" to have AI analyze the evidence graph and tell the story</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvidenceMapper;
