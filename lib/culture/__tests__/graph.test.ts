import {describe, expect, it} from 'vitest';
import {circleLayout, GRAPH_SIZE, graphFromEntities, type LinkedEntity} from '@/lib/culture/graph';
import type {CultureEntitySummary} from '@/lib/culture/types';

const entity = (key: string, over: Partial<CultureEntitySummary> = {}, links: {key: string; weight: number}[] = []): LinkedEntity => ({
    key, displayName: key.toUpperCase(), category: 'drinks', ticker: 'CELH', listing: 'us',
    weightFast: 1, weightSlow: 2, sentimentFast: 0, sentimentSlow: 0, thesisSince: null, lastSeenAt: 1, ...over, links,
});

describe('graphFromEntities', () => {
    it('keeps each pair once by its heavier side, drops links outside the set, and prunes unlinked brands', () => {
        const graph = graphFromEntities([
            entity('celsius', {weightSlow: 5, thesisSince: 1}, [{key: 'poppi', weight: 0.4}, {key: 'ghost', weight: 9}, {key: 'celsius', weight: 1}]),
            entity('poppi', {ticker: 'PEP'}, [{key: 'celsius', weight: 0.6}, {key: 'crocs', weight: 0}]),
            entity('crocs', {category: 'footwear', ticker: 'CROX'}),
        ]);
        expect(graph.edges).toEqual([{source: 'celsius', target: 'poppi', weight: 0.6}]);
        expect(graph.nodes.map((n) => n.key)).toEqual(['celsius', 'poppi']);
        expect(graph.nodes[0]).toMatchObject({displayName: 'CELSIUS', category: 'drinks', ticker: 'CELH', weightSlow: 5, thesis: true});
    });

    it('orders edges heaviest first and is empty without links', () => {
        const graph = graphFromEntities([
            entity('a', {}, [{key: 'b', weight: 1}, {key: 'c', weight: 3}]),
            entity('b', {}, []),
            entity('c', {}, []),
        ]);
        expect(graph.edges.map((e) => `${e.source}|${e.target}`)).toEqual(['a|c', 'a|b']);
        expect(graphFromEntities([entity('a'), entity('b')])).toEqual({nodes: [], edges: []});
    });
});

describe('circleLayout', () => {
    const graph = graphFromEntities([
        entity('zzz', {category: 'footwear', weightSlow: 1}, [{key: 'aaa', weight: 2}]),
        entity('aaa', {weightSlow: 8}, [{key: 'bbb', weight: 1}]),
        entity('bbb', {weightSlow: 4}, []),
    ]);
    const layout = circleLayout(graph);

    it('places every node on the circle, by category then attention, the first at twelve o\'clock', () => {
        expect(layout.nodes.map((n) => n.key)).toEqual(['aaa', 'bbb', 'zzz']);
        const cx = GRAPH_SIZE.width / 2;
        const cy = GRAPH_SIZE.height / 2;
        for (const node of layout.nodes) {
            expect(Math.hypot(node.x - cx, node.y - cy)).toBeCloseTo(GRAPH_SIZE.radius, 6);
        }
        expect(layout.nodes[0].x).toBeCloseTo(cx, 6);
        expect(layout.nodes[0].y).toBeCloseTo(cy - GRAPH_SIZE.radius, 6);
    });

    it('sizes nodes by the square root of their share and edges by their share of the heaviest', () => {
        const [aaa, bbb] = layout.nodes;
        expect(aaa.r).toBeCloseTo(GRAPH_SIZE.maxNode, 6);
        expect(bbb.r).toBeCloseTo(GRAPH_SIZE.minNode + (GRAPH_SIZE.maxNode - GRAPH_SIZE.minNode) * Math.sqrt(0.5), 6);
        const widths = layout.edges.map((e) => e.width);
        expect(Math.max(...widths)).toBeCloseTo(GRAPH_SIZE.maxEdge, 6);
        expect(Math.min(...widths)).toBeCloseTo(GRAPH_SIZE.minEdge + (GRAPH_SIZE.maxEdge - GRAPH_SIZE.minEdge) * 0.5, 6);
        for (const edge of layout.edges) {
            const a = layout.nodes.find((n) => n.key === edge.source)!;
            expect([edge.x1, edge.y1]).toEqual([a.x, a.y]);
        }
    });

    it('is deterministic', () => {
        expect(JSON.stringify(circleLayout(graph))).toBe(JSON.stringify(layout));
    });
});
