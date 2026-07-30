'use client';

import {useMemo, useState} from "react";
import {useRouter} from "next/navigation";

export type GraphNode = BrainEntitySummary;
export type GraphEdge = {source: string; target: string; weight: number};

// Hand-rolled SVG knowledge graph (PerformanceChart precedent — no chart deps).
// Deterministic concentric-ring layout: themes inner, sectors middle, tickers outer;
// angle by slow-weight rank within the ring. No physics sim — stable between renders.

const WIDTH = 720;
const HEIGHT = 440;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RING_RADII: Record<BrainEntityType, number> = {theme: 70, sector: 130, ticker: 190};
const MIN_NODE_R = 6;
const MAX_NODE_R = 22;

const sentimentColor = (s: number) => (s > 0.05 ? '#7df4ff' : s < -0.05 ? '#ffb4ab' : '#849495');

const BrainGraph = ({nodes, edges}: {nodes: GraphNode[]; edges: GraphEdge[]}) => {
    const router = useRouter();
    const [hoverKey, setHoverKey] = useState<string | null>(null);

    const layout = useMemo(() => {
        const byType: Record<BrainEntityType, GraphNode[]> = {theme: [], sector: [], ticker: []};
        for (const n of nodes) byType[n.type].push(n);

        const maxWeight = Math.max(...nodes.map((n) => n.weightSlow), 0.001);
        const positions = new Map<string, {x: number; y: number; r: number; node: GraphNode}>();
        for (const type of ['theme', 'sector', 'ticker'] as const) {
            const ring = byType[type].sort((a, b) => b.weightSlow - a.weightSlow);
            ring.forEach((node, i) => {
                // Golden-angle-ish spread keeps neighbors from clustering at 0°.
                const angle = (i / Math.max(ring.length, 1)) * 2 * Math.PI - Math.PI / 2;
                const radius = RING_RADII[type];
                positions.set(node.key, {
                    x: CX + radius * Math.cos(angle),
                    y: CY + radius * Math.sin(angle),
                    r: MIN_NODE_R + (MAX_NODE_R - MIN_NODE_R) * Math.sqrt(node.weightSlow / maxWeight),
                    node,
                });
            });
        }
        const maxEdge = Math.max(...edges.map((e) => e.weight), 0.001);
        return {positions, maxEdge};
    }, [nodes, edges]);

    if (nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined text-3xl text-[#849495] mb-2">neurology</span>
                <p className="text-sm text-[#849495]">The brain is empty — it fills up as daily news is ingested.</p>
            </div>
        );
    }

    const hovered = hoverKey ? layout.positions.get(hoverKey) : null;

    return (
        <div>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img"
                 aria-label="News brain knowledge graph — themes inner ring, sectors middle, tickers outer">
                {/* Ring guides */}
                {(['theme', 'sector', 'ticker'] as const).map((type) => (
                    <circle key={type} cx={CX} cy={CY} r={RING_RADII[type]} fill="none"
                            stroke="rgba(59,73,75,0.25)" strokeDasharray="3 5" strokeWidth="1" />
                ))}

                {/* Edges */}
                {edges.map((e) => {
                    const a = layout.positions.get(e.source);
                    const b = layout.positions.get(e.target);
                    if (!a || !b) return null;
                    const active = hoverKey === e.source || hoverKey === e.target;
                    return (
                        <line key={`${e.source}|${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                              stroke={active ? '#7df4ff' : '#3b494b'}
                              strokeOpacity={active ? 0.8 : 0.25 + 0.5 * (e.weight / layout.maxEdge)}
                              strokeWidth={active ? 1.5 : 1} />
                    );
                })}

                {/* Nodes */}
                {Array.from(layout.positions.values()).map(({x, y, r, node}) => (
                    <g key={node.key}
                       onMouseEnter={() => setHoverKey(node.key)}
                       onMouseLeave={() => setHoverKey(null)}
                       onClick={() => router.push(`/brain?entity=${encodeURIComponent(node.key)}`)}
                       style={{cursor: 'pointer'}}>
                        <circle cx={x} cy={y} r={r}
                                fill={sentimentColor(node.sentimentSlow)}
                                fillOpacity={node.thesisSince !== null ? 0.35 : 0.15}
                                stroke={sentimentColor(node.sentimentSlow)}
                                strokeWidth={node.thesisSince !== null ? 2 : 1} />
                        <text x={x} y={y + r + 11} textAnchor="middle" fontSize="9"
                              fill={hoverKey === node.key ? '#e2e2e8' : '#849495'}
                              fontFamily="var(--font-jetbrains)">
                            {node.displayName.length > 14 ? `${node.displayName.slice(0, 13)}…` : node.displayName}
                        </text>
                    </g>
                ))}
            </svg>

            <div className="flex items-center justify-between mt-2 text-[10px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                <span>rings: themes · sectors · tickers — size = persistent attention, bold ring = active thesis</span>
                <span>{hovered ? `${hovered.node.displayName} · weight ${hovered.node.weightSlow.toFixed(1)}` : 'click a node for evidence'}</span>
            </div>
        </div>
    );
};

export default BrainGraph;
