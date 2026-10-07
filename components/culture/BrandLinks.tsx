import Link from "next/link";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {circleLayout, type CultureGraph} from "@/lib/culture/graph";
import {brandEvidenceHref} from "@/lib/culture/links";
import {CULTURE_COPY, RISING_TERMS} from "@/lib/learn/copy/culture";

// The brands named together, as a hand-rolled SVG: brands on a circle, a line between two that a
// post or article named in one breath, heavier the more often (and fading as the fold fades).
// Each name is a real link to its evidence, so Tab reaches it and Enter opens it; the host is a
// group, never an img, so the links stay in the accessibility tree. The page draws this panel
// only when there is a line to draw (invariant 8). Deterministic layout, no physics.
const LABEL_GAP = 8;

const BrandLinks = ({graph}: {graph: CultureGraph}) => {
    const layout = circleLayout(graph);
    return (
        <div data-brand-links>
            <p className="text-xs text-fg-muted mb-3">{CULTURE_COPY.linksLead}</p>
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="w-full h-auto" role="group" aria-label={CULTURE_COPY.linksAria}>
                {layout.edges.map((edge) => (
                    <line key={`${edge.source}|${edge.target}`} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                          className="stroke-brand/45" strokeWidth={edge.width} strokeLinecap="round" data-edge={`${edge.source}|${edge.target}`} />
                ))}
                {layout.nodes.map((node) => {
                    const right = Math.cos(node.angle) >= 0;
                    const labelX = node.x + (right ? 1 : -1) * (node.r + LABEL_GAP);
                    return (
                        <Link key={node.key} href={brandEvidenceHref(node.key)} className="group/node outline-none" data-brand={node.key}>
                            <title>{node.displayName}{node.ticker ? ` · ${node.ticker}` : ''}</title>
                            {node.thesis && <circle cx={node.x} cy={node.y} r={node.r + 3} className="fill-none stroke-brand" strokeWidth="1.5" />}
                            <circle cx={node.x} cy={node.y} r={node.r} className="fill-brand/70 group-hover/node:fill-brand group-focus-visible/node:fill-brand transition-colors" />
                            <text x={labelX} y={node.y} dominantBaseline="middle" textAnchor={right ? 'start' : 'end'}
                                  className="fill-fg font-mono text-[10px] group-hover/node:fill-brand group-focus-visible/node:fill-brand">
                                {node.displayName}
                            </text>
                        </Link>
                    );
                })}
            </svg>
            <WhatTheseMean keys={RISING_TERMS} />
        </div>
    );
};

export default BrandLinks;
