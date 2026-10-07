import {describe, expect, it} from 'vitest';
import {layoutGraph, MAX_NODE_R, MIN_NODE_R, SHELL_POLES, SHELL_RADII, type GraphEdge} from '@/lib/brain/graph-layout';
import type {BrainEntitySummary, BrainEntityType} from '@/lib/brain/types';

const entity = (key: string, type: BrainEntityType, weightSlow: number, extra: Partial<BrainEntitySummary> = {}): BrainEntitySummary => ({
    key, type, displayName: key, weightFast: weightSlow / 2, weightSlow, sentimentFast: 0, sentimentSlow: 0, thesisSince: null, lastSeenAt: 0, ...extra,
});

const distance = (a: {x: number; y: number; z: number}, b: {x: number; y: number; z: number}) =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (p: {x: number; y: number; z: number}) => Math.hypot(p.x, p.y, p.z);
// The angle between two points' directions from the centre, in degrees.
const angleBetween = (a: {x: number; y: number; z: number}, b: {x: number; y: number; z: number}) =>
    (Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (norm(a) * norm(b))))) * 180) / Math.PI;

const tickers = Array.from({length: 20}, (_, i) => entity(`T${i}`, 'ticker', 20 - i));
const mixed = [entity('AI', 'theme', 30), entity('Rates', 'theme', 12), entity('Chips', 'sector', 18), entity('NVDA', 'ticker', 14), entity('AMD', 'ticker', 6)];

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

    it('spreads twenty tickers over their shell with no two on top of each other', () => {
        const points = layoutGraph(tickers, []);
        let closest = Infinity;
        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) closest = Math.min(closest, distance(points[i], points[j]));
        }
        expect(closest).toBeGreaterThan(0.8);
    });

    it('pulls a linked pair together without leaving the shell', () => {
        const four = tickers.slice(0, 4);
        const edges: GraphEdge[] = [{source: 'T0', target: 'T3', weight: 1}];
        const loose = new Map(layoutGraph(four, [], {steps: 0}).map((p) => [p.key, p]));
        const relaxed = new Map(layoutGraph(four, edges).map((p) => [p.key, p]));
        const before = distance(loose.get('T0')!, loose.get('T3')!);
        const after = distance(relaxed.get('T0')!, relaxed.get('T3')!);
        expect(after).toBeLessThan(before);
        expect(after).toBeLessThan(distance(relaxed.get('T0')!, relaxed.get('T1')!));
        expect(after).toBeLessThan(distance(relaxed.get('T0')!, relaxed.get('T2')!));
        for (const point of relaxed.values()) expect(norm(point)).toBeCloseTo(SHELL_RADII.ticker, 6);
    });

    it('ignores an edge to an entity that is not drawn, and is the same for the same input', () => {
        const edges: GraphEdge[] = [{source: 'NVDA', target: 'TSLA', weight: 2}, {source: 'AI', target: 'NVDA', weight: 1}];
        const once = layoutGraph(mixed, edges);
        const twice = layoutGraph(mixed, edges);
        expect(twice).toEqual(once);
        expect(once.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true);
    });

    it('opens with the heaviest ticker nearest the tickers\' pole, the shells\' poles well apart', () => {
        const alone = layoutGraph([tickers[0]], [], {steps: 0})[0];
        expect(angleBetween(alone, SHELL_POLES.ticker)).toBeLessThan(1e-6);
        const points = layoutGraph(tickers, [], {steps: 0});
        const heaviest = points.find((p) => p.key === 'T0')!;
        expect(angleBetween(heaviest, SHELL_POLES.ticker)).toBeLessThan(20);
        for (const point of points) expect(angleBetween(point, SHELL_POLES.ticker)).toBeGreaterThanOrEqual(angleBetween(heaviest, SHELL_POLES.ticker) - 1e-9);
        expect(angleBetween(SHELL_POLES.ticker, SHELL_POLES.theme)).toBeGreaterThan(60);
        expect(angleBetween(SHELL_POLES.ticker, SHELL_POLES.sector)).toBeGreaterThan(60);
        expect(angleBetween(SHELL_POLES.theme, SHELL_POLES.sector)).toBeGreaterThan(60);
    });

    it('never leaves two entities on one line from the centre, whatever their shells', () => {
        const edges: GraphEdge[] = [
            {source: 'AI', target: 'Chips', weight: 6}, {source: 'AI', target: 'NVDA', weight: 7}, {source: 'Chips', target: 'NVDA', weight: 6},
            {source: 'Chips', target: 'AMD', weight: 4}, {source: 'Rates', target: 'AMD', weight: 1},
        ];
        const points = layoutGraph(mixed, edges);
        let closest = Infinity;
        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) closest = Math.min(closest, angleBetween(points[i], points[j]));
        }
        expect(closest).toBeGreaterThan(20);
    });
});
