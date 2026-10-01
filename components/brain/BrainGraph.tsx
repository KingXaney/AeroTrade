'use client';

import {useMemo, useState} from "react";
import Link from "next/link";
import {evidenceHref} from "@/lib/brain/links";
import {cn} from "@/lib/utils";
import type {BrainEntitySummary, BrainEntityType} from '@/lib/brain/types';

type GraphNode = BrainEntitySummary;
type GraphEdge = {source: string; target: string; weight: number};

// Hand-rolled SVG knowledge graph (PerformanceChart precedent — no chart deps).
// Deterministic concentric-ring layout: themes inner, sectors middle, tickers outer;
// angle by slow-weight rank within the ring. No physics sim — stable between renders.
// Each node is a link to its evidence (evidenceHref), so Tab reaches it and Enter opens it;
// focus lights it the way hover does.

const WIDTH = 720;
const HEIGHT = 440;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RING_RADII: Record<BrainEntityType, number> = {theme: 70, sector: 130, ticker: 190};
const MIN_NODE_R = 6;
const MAX_NODE_R = 22;

const sentimentColor = (s: number) => (s > 0.05 ? 'var(--positive)' : s < -0.05 ? 'var(--negative)' : 'var(--fg-muted)');

const BrainGraph = ({nodes, edges}: {nodes: GraphNode[]; edges: GraphEdge[]}) => {
    const [hoverKey, setHoverKey] = useState<string | null>(null);

    const layout = useMemo(() => {
        const byType: Record<BrainEntityType, GraphNode[]> = {theme: [], sector: [], ticker: []};
        for (const n of nodes) byType[n.type].push(n);

        const maxWeight = Math.max(...nodes.map((n) => n.weightSlow), 0.001);
        const positions = new Map<string, {x: number; y: number; r: number; node: GraphNode}>();
        for (const type of ['theme', 'sector', 'ticker'] as const) {
            const ring = byType[type].sort((a, b) => b.weightSlow - a.weightSlow);
            ring.forEach((node, i) => {
                // Evenly spaced by rank, heaviest at 12 o'clock.
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
                <span className="material-symbols-outlined text-3xl text-fg-muted mb-2">neurology</span>
                <p className="text-sm text-fg-muted">The brain is empty — it fills up as daily news is ingested.</p>
            </div>
        );
    }

    const hovered = hoverKey ? layout.positions.get(hoverKey) : null;

    return (
        <div>
            {/* role="group", not "img": an img's descendants are presentational, which would hide
                every node link from assistive technology. */}
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="group"
                 aria-label="News brain knowledge graph — themes inner ring, sectors middle, tickers outer">
                {/* Ring guides */}
                {(['theme', 'sector', 'ticker'] as const).map((type) => (
                    <circle key={type} cx={CX} cy={CY} r={RING_RADII[type]} fill="none"
                            className="stroke-line-strong/25" strokeDasharray="3 5" strokeWidth="1" />
                ))}

                {/* Edges */}
                {edges.map((e) => {
                    const a = layout.positions.get(e.source);
                    const b = layout.positions.get(e.target);
                    if (!a || !b) return null;
                    const active = hoverKey === e.source || hoverKey === e.target;
                    return (
                        <line key={`${e.source}|${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                              className={active ? 'stroke-brand' : 'stroke-line-strong'}
                              strokeOpacity={active ? 0.8 : 0.25 + 0.5 * (e.weight / layout.maxEdge)}
                              strokeWidth={active ? 1.5 : 1} />
                    );
                })}

                {/* Nodes */}
                {Array.from(layout.positions.values()).map(({x, y, r, node}) => (
                    <Link key={node.key} href={evidenceHref(node.key)}
                          aria-label={`${node.displayName} — evidence`}
                          className="cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
                          onMouseEnter={() => setHoverKey(node.key)}
                          onMouseLeave={() => setHoverKey(null)}
                          onFocus={() => setHoverKey(node.key)}
                          onBlur={() => setHoverKey(null)}>
                        <circle cx={x} cy={y} r={r}
                                style={{fill: sentimentColor(node.sentimentSlow), stroke: sentimentColor(node.sentimentSlow)}}
                                fillOpacity={node.thesisSince !== null ? 0.35 : 0.15}
                                strokeWidth={node.thesisSince !== null ? 2 : 1} />
                        <text x={x} y={y + r + 11} textAnchor="middle" fontSize="9"
                              className={cn('font-mono', hoverKey === node.key ? 'fill-fg' : 'fill-fg-muted')}>
                            {node.displayName.length > 14 ? `${node.displayName.slice(0, 13)}…` : node.displayName}
                        </text>
                    </Link>
                ))}
            </svg>

            <div className="flex items-center justify-between mt-2 text-[10px] text-fg-muted font-mono">
                <span>rings: themes · sectors · tickers — size = persistent attention, bold ring = active thesis</span>
                <span>{hovered ? `${hovered.node.displayName} · weight ${hovered.node.weightSlow.toFixed(1)}` : 'click a node for evidence'}</span>
            </div>
        </div>
    );
};

export default BrainGraph;
