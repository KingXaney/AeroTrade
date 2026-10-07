// Where the knowledge graph's entities sit in space. Pure, and deterministic for one input, so the
// 3D graph (components/brain/BrainGraph, graph-scene) is stable between renders, as the SVG's
// ring layout was. Three concentric shells keep the SVG's meaning — themes inner, sectors middle,
// tickers outer — and a short relaxation of every entity's *direction* pulls linked entities
// toward each other and pushes every pair apart, whatever their shells, so an edge is short where
// the news ties two names together and no two names sit on one line from the centre.

import type {BrainEntitySummary, BrainEntityType} from "@/lib/brain/types";

export type GraphEdge = {source: string; target: string; weight: number};

export type GraphPoint = {
    key: string;
    x: number;
    y: number;
    z: number;
    // The sphere's radius: by the square root of the share of the heaviest slow weight.
    r: number;
    node: BrainEntitySummary;
};

type Vec = {x: number; y: number; z: number};

// World units; the camera stands 12 away (graph-scene's CAMERA_DISTANCE).
export const SHELL_RADII: Record<BrainEntityType, number> = {theme: 1.1, sector: 2.2, ticker: 3.3};
export const MIN_NODE_R = 0.12;
export const MAX_NODE_R = 0.42;
export const RELAX_STEPS = 160;
// How far one step of the relaxation moves a direction, and how the two forces weigh.
const STEP = 0.04;
const ATTRACT = 0.5;
const REPEL = 0.12;

const unit = (v: Vec): Vec => {
    const n = Math.hypot(v.x, v.y, v.z) || 1;
    return {x: v.x / n, y: v.y / n, z: v.z / n};
};
const cross = (a: Vec, b: Vec): Vec => ({x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x});

// Each shell's distribution has a pole of its own, so the heaviest theme, sector and ticker do
// not open stacked on one line. The tickers' pole faces the camera's opening position
// (graph-scene), so the heaviest ticker is the first thing read; the themes' is to its upper
// left and the sectors' to its lower right, each about 70° away.
export const SHELL_POLES: Record<BrainEntityType, Vec> = {
    ticker: unit({x: 0.55, y: 0.35, z: 0.76}),
    theme: unit({x: -0.5, y: 0.65, z: 0.57}),
    sector: unit({x: 0.8, y: -0.55, z: 0.1}),
};

// The i-th of n points spread evenly over a unit sphere, the first at the top (0, 1, 0).
const fibonacciPoint = (i: number, n: number): Vec => {
    if (n === 1) return {x: 0, y: 1, z: 0};
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (2 * (i + 0.5)) / n;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    return {x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring};
};

// The frame whose +y is `pole`: maps a point of the unit sphere onto a sphere with that pole.
const frameOf = (pole: Vec) => {
    const helper = Math.abs(pole.y) < 0.9 ? {x: 0, y: 1, z: 0} : {x: 1, y: 0, z: 0};
    const e1 = unit(cross(helper, pole));
    const e2 = cross(pole, e1);
    return (p: Vec): Vec => ({
        x: p.x * e1.x + p.y * pole.x + p.z * e2.x,
        y: p.x * e1.y + p.y * pole.y + p.z * e2.y,
        z: p.x * e1.z + p.y * pole.z + p.z * e2.z,
    });
};

type LayoutOptions = {steps?: number};

export const layoutGraph = (nodes: readonly BrainEntitySummary[], edges: readonly GraphEdge[], {steps = RELAX_STEPS}: LayoutOptions = {}): GraphPoint[] => {
    if (nodes.length === 0) return [];
    const maxWeight = Math.max(...nodes.map((n) => n.weightSlow), 0.001);

    // Start: each type spread over its own sphere, by rank, the heaviest at that shell's pole.
    const directions = new Map<string, Vec>();
    const byType: Record<BrainEntityType, BrainEntitySummary[]> = {theme: [], sector: [], ticker: []};
    for (const node of nodes) byType[node.type].push(node);
    for (const type of ['theme', 'sector', 'ticker'] as const) {
        const shell = [...byType[type]].sort((a, b) => b.weightSlow - a.weightSlow || a.key.localeCompare(b.key));
        const place = frameOf(SHELL_POLES[type]);
        shell.forEach((node, i) => directions.set(node.key, place(fibonacciPoint(i, shell.length))));
    }

    // Relax the directions: linked entities pull, every pair pushes, each kept a unit vector.
    const known = edges.filter((e) => directions.has(e.source) && directions.has(e.target) && e.source !== e.target);
    const maxEdge = Math.max(...known.map((e) => e.weight), 0.001);
    const keys = nodes.map((n) => n.key);
    for (let step = 0; step < steps; step += 1) {
        const forces = new Map<string, Vec>(keys.map((k) => [k, {x: 0, y: 0, z: 0}]));
        for (const edge of known) {
            const a = directions.get(edge.source)!;
            const b = directions.get(edge.target)!;
            const pull = ATTRACT * (0.2 + edge.weight / maxEdge);
            const fa = forces.get(edge.source)!;
            const fb = forces.get(edge.target)!;
            fa.x += (b.x - a.x) * pull; fa.y += (b.y - a.y) * pull; fa.z += (b.z - a.z) * pull;
            fb.x += (a.x - b.x) * pull; fb.y += (a.y - b.y) * pull; fb.z += (a.z - b.z) * pull;
        }
        for (let i = 0; i < keys.length; i += 1) {
            for (let j = i + 1; j < keys.length; j += 1) {
                const a = directions.get(keys[i])!;
                const b = directions.get(keys[j])!;
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                const d2 = Math.max(dx * dx + dy * dy + dz * dz, 0.02);
                const push = REPEL / d2;
                const fa = forces.get(keys[i])!;
                const fb = forces.get(keys[j])!;
                fa.x += dx * push; fa.y += dy * push; fa.z += dz * push;
                fb.x -= dx * push; fb.y -= dy * push; fb.z -= dz * push;
            }
        }
        for (const key of keys) {
            const u = directions.get(key)!;
            const f = forces.get(key)!;
            directions.set(key, unit({x: u.x + f.x * STEP, y: u.y + f.y * STEP, z: u.z + f.z * STEP}));
        }
    }

    return nodes.map((node) => {
        const u = directions.get(node.key)!;
        const radius = SHELL_RADII[node.type];
        return {key: node.key, x: u.x * radius, y: u.y * radius, z: u.z * radius, r: MIN_NODE_R + (MAX_NODE_R - MIN_NODE_R) * Math.sqrt(node.weightSlow / maxWeight), node};
    });
};
