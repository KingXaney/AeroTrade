// The brands named together: the co-mention links the fold keeps on each brand entity, as the
// graph the brands view draws. Pure. A node is a brand with attention, an edge the decayed mass
// of the posts and articles that named both; a brand none of the drawn brands was named with is
// left out, since an unlinked dot says nothing a row on the board does not. The layout is a
// circle — deterministic, no physics — ordered by category and attention, so the picture is
// stable between renders.

import {CULTURE_CATEGORIES, type CultureCategory, type CultureEntitySummary} from "@/lib/culture/types";

export type GraphNode = {
    key: string;
    displayName: string;
    category: CultureCategory;
    ticker: string | null;
    weightSlow: number;
    thesis: boolean;
};

export type GraphEdge = {source: string; target: string; weight: number};

export type CultureGraph = {nodes: GraphNode[]; edges: GraphEdge[]};

export type LinkedEntity = CultureEntitySummary & {links: readonly {key: string; weight: number}[]};

// Edges between the entities given (each pair once, by the heavier of the two sides), then the
// entities that take part in one.
export const graphFromEntities = (entities: readonly LinkedEntity[]): CultureGraph => {
    const keys = new Set(entities.map((entity) => entity.key));
    const byPair = new Map<string, GraphEdge>();
    for (const entity of entities) {
        for (const link of entity.links) {
            if (!keys.has(link.key) || link.key === entity.key || !(link.weight > 0)) continue;
            const [source, target] = [entity.key, link.key].sort();
            const pair = `${source}|${target}`;
            const existing = byPair.get(pair);
            if (!existing || link.weight > existing.weight) byPair.set(pair, {source, target, weight: link.weight});
        }
    }
    const edges = [...byPair.values()].sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
    const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    const nodes = entities.filter((entity) => linked.has(entity.key)).map((entity) => ({
        key: entity.key,
        displayName: entity.displayName,
        category: entity.category,
        ticker: entity.ticker,
        weightSlow: entity.weightSlow,
        thesis: entity.thesisSince !== null,
    }));
    return {nodes, edges};
};

export type PlacedNode = GraphNode & {x: number; y: number; r: number; angle: number};
export type PlacedEdge = GraphEdge & {x1: number; y1: number; x2: number; y2: number; width: number};
export type GraphLayout = {width: number; height: number; nodes: PlacedNode[]; edges: PlacedEdge[]};

export const GRAPH_SIZE = {width: 480, height: 320, radius: 118, minNode: 4, maxNode: 13, minEdge: 0.75, maxEdge: 3.5} as const;

const categoryRank = (category: CultureCategory): number => CULTURE_CATEGORIES.indexOf(category);

// Nodes on a circle, by category then attention, the first at twelve o'clock; a node's radius
// grows with the square root of its share of the heaviest attention, an edge's width with its
// share of the heaviest link.
export const circleLayout = (graph: CultureGraph, size = GRAPH_SIZE): GraphLayout => {
    const ordered = [...graph.nodes].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || b.weightSlow - a.weightSlow || a.displayName.localeCompare(b.displayName));
    const cx = size.width / 2;
    const cy = size.height / 2;
    const maxWeight = Math.max(...ordered.map((node) => node.weightSlow), 1e-9);
    const nodes: PlacedNode[] = ordered.map((node, i) => {
        const angle = (i / Math.max(ordered.length, 1)) * 2 * Math.PI - Math.PI / 2;
        return {
            ...node,
            angle,
            x: cx + size.radius * Math.cos(angle),
            y: cy + size.radius * Math.sin(angle),
            r: size.minNode + (size.maxNode - size.minNode) * Math.sqrt(Math.max(0, node.weightSlow) / maxWeight),
        };
    });
    const at = new Map(nodes.map((node) => [node.key, node]));
    const maxEdge = Math.max(...graph.edges.map((edge) => edge.weight), 1e-9);
    const edges: PlacedEdge[] = graph.edges.flatMap((edge) => {
        const a = at.get(edge.source);
        const b = at.get(edge.target);
        if (!a || !b) return [];
        return [{...edge, x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: size.minEdge + (size.maxEdge - size.minEdge) * (edge.weight / maxEdge)}];
    });
    return {width: size.width, height: size.height, nodes, edges};
};
