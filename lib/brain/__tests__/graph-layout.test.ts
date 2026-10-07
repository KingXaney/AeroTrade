import {describe, expect, it} from 'vitest';
import {layoutGraph, MAX_NODE_R, MIN_NODE_R, RESTING_LINKS_PER_ENTITY, restingEdges, SHELL_RADII, spreadDirections, VIEW_DIRECTION, type GraphEdge} from '@/lib/brain/graph-layout';
import type {BrainEntitySummary, BrainEntityType} from '@/lib/brain/types';

const entity = (key: string, type: BrainEntityType, weightSlow: number, extra: Partial<BrainEntitySummary> = {}): BrainEntitySummary => ({
    key, type, displayName: key, weightFast: weightSlow / 2, weightSlow, sentimentFast: 0, sentimentSlow: 0, thesisSince: null, lastSeenAt: 0, ...extra,
});

type P = {x: number; y: number; z: number};
const distance = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (p: P) => Math.hypot(p.x, p.y, p.z);
// The angle between two points' directions from the centre, in degrees.
const angleBetween = (a: P, b: P) => (Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (norm(a) * norm(b))))) * 180) / Math.PI;
const closestPair = (points: P[], measure: (a: P, b: P) => number) => {
    let closest = Infinity;
    for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) closest = Math.min(closest, measure(points[i], points[j]));
    }
    return closest;
};

const tickers = Array.from({length: 20}, (_, i) => entity(`T${i}`, 'ticker', 20 - i));
const mixed = [entity('AI', 'theme', 30), entity('Rates', 'theme', 12), entity('Chips', 'sector', 18), entity('NVDA', 'ticker', 14), entity('AMD', 'ticker', 6)];
// Twenty entities of every type, linked as densely as the news links the real brain's.
const dense = [
    ...['AI', 'Rates', 'Tariffs'].map((k, i) => entity(k, 'theme', 30 - 4 * i)),
    ...['Chips', 'Software', 'Banks', 'Energy', 'Autos'].map((k, i) => entity(k, 'sector', 26 - 3 * i)),
    ...['NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'AVGO', 'TSM', 'JPM', 'XOM'].map((k, i) => entity(k, 'ticker', 28 - 2 * i)),
];
const denseEdges: GraphEdge[] = [];
dense.forEach((a, i) => dense.forEach((b, j) => {
    if (j > i && (i + 2 * j) % 3 !== 0) denseEdges.push({source: a.key, target: b.key, weight: 1 + ((i * 7 + j * 3) % 8)});
}));

describe('layoutGraph', () => {
    it('is nothing for nothing', () => {
        expect(layoutGraph([], [])).toEqual([]);
    });

    it('puts every entity on its type\'s shell: themes inner, sectors middle, tickers outer', () => {
        const points = layoutGraph(mixed, []);
        expect(points).toHaveLength(mixed.length);
        for (const point of points) {
            expect(norm(point)).toBeCloseTo(SHELL_RADII[point.node.type], 6);
        }
        expect(SHELL_RADII.theme).toBeLessThan(SHELL_RADII.sector);
        expect(SHELL_RADII.sector).toBeLessThan(SHELL_RADII.ticker);
    });

    it('sizes a node by the square root of its share of the heaviest weight', () => {
        const points = layoutGraph(mixed, []);
        const byKey = new Map(points.map((p) => [p.key, p]));
        expect(byKey.get('AI')?.r).toBeCloseTo(MAX_NODE_R, 9);
        expect(byKey.get('AMD')?.r).toBeCloseTo(MIN_NODE_R + (MAX_NODE_R - MIN_NODE_R) * Math.sqrt(6 / 30), 9);
        for (const point of points) {
            expect(point.r).toBeGreaterThanOrEqual(MIN_NODE_R);
            expect(point.r).toBeLessThanOrEqual(MAX_NODE_R);
        }
    });

    it('spreads n directions evenly, the first facing the camera', () => {
        for (const n of [1, 2, 3, 5, 12, 20]) {
            const directions = spreadDirections(n);
            expect(directions).toHaveLength(n);
            expect(angleBetween(directions[0], VIEW_DIRECTION)).toBeLessThan(1e-6);
            for (const d of directions) expect(norm(d)).toBeCloseTo(1, 9);
            if (n > 1) expect(closestPair(directions, angleBetween)).toBeGreaterThan(n <= 3 ? 90 : n <= 5 ? 60 : 30);
        }
    });

    it('spreads twenty tickers over their shell with no two on top of each other', () => {
        const points = layoutGraph(tickers, []);
        expect(closestPair(points, distance)).toBeGreaterThan(2 * MAX_NODE_R);
        expect(closestPair(points, angleBetween)).toBeGreaterThan(30);
    });

    it('keeps twenty densely linked entities of every type at least 30° apart, the heaviest facing the camera', () => {
        const points = layoutGraph(dense, denseEdges);
        expect(closestPair(points, angleBetween)).toBeGreaterThan(30);
        const heaviest = points.find((p) => p.key === 'AI')!;
        expect(angleBetween(heaviest, VIEW_DIRECTION)).toBeLessThan(1e-6);
        for (const point of points) expect(norm(point)).toBeCloseTo(SHELL_RADII[point.node.type], 6);
    });

    it('seats a linked pair side by side and the unlinked apart, all on the shell', () => {
        // Eight, not four: four directions are all the same distance apart, so no seat is "beside".
        const eight = tickers.slice(0, 8);
        const edges: GraphEdge[] = [{source: 'T0', target: 'T3', weight: 1}];
        const apart = new Map(layoutGraph(eight, []).map((p) => [p.key, p]));
        const linked = new Map(layoutGraph(eight, edges).map((p) => [p.key, p]));
        const before = distance(apart.get('T0')!, apart.get('T3')!);
        const after = distance(linked.get('T0')!, linked.get('T3')!);
        expect(after).toBeLessThan(before);
        expect(after).toBeLessThan(distance(linked.get('T0')!, linked.get('T1')!));
        expect(after).toBeLessThan(distance(linked.get('T0')!, linked.get('T2')!));
        for (const point of linked.values()) expect(norm(point)).toBeCloseTo(SHELL_RADII.ticker, 6);
    });

    it('draws at rest only each entity\'s heaviest links, every entity keeping at least one', () => {
        const resting = restingEdges(denseEdges);
        expect(resting.length).toBeLessThan(denseEdges.length / 2);
        expect(resting.length).toBeLessThanOrEqual(dense.length * RESTING_LINKS_PER_ENTITY);
        const linked = new Set(denseEdges.flatMap((e) => [e.source, e.target]));
        const shown = new Set(resting.flatMap((e) => [e.source, e.target]));
        for (const key of linked) expect(shown.has(key), key).toBe(true);
        // Each entity's heaviest link is always drawn.
        for (const key of linked) {
            const heaviest = denseEdges.filter((e) => e.source === key || e.target === key).reduce((a, b) => (b.weight > a.weight ? b : a));
            expect(resting).toContain(heaviest);
        }
        // Order is the input's, and a self-link is never drawn.
        expect(resting).toEqual(denseEdges.filter((e) => resting.includes(e)));
        expect(restingEdges([{source: 'A', target: 'A', weight: 9}, {source: 'A', target: 'B', weight: 1}])).toEqual([{source: 'A', target: 'B', weight: 1}]);
    });

    it('ignores an edge to an entity that is not drawn, and is the same for the same input', () => {
        const edges: GraphEdge[] = [{source: 'NVDA', target: 'TSLA', weight: 2}, {source: 'AI', target: 'NVDA', weight: 1}];
        const once = layoutGraph(mixed, edges);
        const twice = layoutGraph(mixed, edges);
        expect(twice).toEqual(once);
        expect(once.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true);
    });
});
