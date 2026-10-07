// Where the knowledge graph's entities sit in space. Pure, and deterministic for one input, so the
// 3D graph (components/brain/BrainGraph, graph-scene) is stable between renders, as the SVG's
// ring layout was. Three concentric shells keep the SVG's meaning — themes inner, sectors middle,
// tickers outer — and every entity takes one of n directions spread evenly over the sphere, so no
// two names are ever close from the centre's point of view, however densely the news links them:
// the heaviest faces the camera, a linked entity sits beside its links, an unlinked one as far
// from the rest as it can. The shell only sets the radius.

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

// World units; the camera stands CAMERA_DISTANCE away along VIEW_DIRECTION (graph-scene).
export const SHELL_RADII: Record<BrainEntityType, number> = {theme: 1.6, sector: 2.8, ticker: 4};
export const MIN_NODE_R = 0.12;
export const MAX_NODE_R = 0.42;

const unit = (v: Vec): Vec => {
    const n = Math.hypot(v.x, v.y, v.z) || 1;
    return {x: v.x / n, y: v.y / n, z: v.z / n};
};
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => ({x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x});
// The angle between two directions, in radians.
const angle = (a: Vec, b: Vec): number => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

// Where the camera opens, as a direction from the centre; the heaviest entity faces it.
export const VIEW_DIRECTION: Vec = unit({x: 0.55, y: 0.35, z: 0.76});

// The i-th of n points spread evenly over the unit sphere (a Fibonacci lattice).
const fibonacciPoint = (i: number, n: number): Vec => {
    if (n === 1) return {x: 0, y: 1, z: 0};
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (2 * (i + 0.5)) / n;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    return {x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring};
};

// The rotation taking unit vector `from` to unit vector `to` (Rodrigues), as a function.
const rotationTaking = (from: Vec, to: Vec): ((v: Vec) => Vec) => {
    const axis = cross(from, to);
    const s = Math.hypot(axis.x, axis.y, axis.z);
    const c = dot(from, to);
    if (s < 1e-9) {
        if (c > 0) return (v) => v;
        // Opposite directions: a half turn about any axis perpendicular to `from`.
        const perpendicular = unit(cross(from, Math.abs(from.y) < 0.9 ? {x: 0, y: 1, z: 0} : {x: 1, y: 0, z: 0}));
        return (v) => {
            const along = dot(v, perpendicular);
            return {x: 2 * along * perpendicular.x - v.x, y: 2 * along * perpendicular.y - v.y, z: 2 * along * perpendicular.z - v.z};
        };
    }
    const k = {x: axis.x / s, y: axis.y / s, z: axis.z / s};
    return (v) => {
        const kv = cross(k, v);
        const kd = dot(k, v);
        return {
            x: v.x * c + kv.x * s + k.x * kd * (1 - c),
            y: v.y * c + kv.y * s + k.y * kd * (1 - c),
            z: v.z * c + kv.z * s + k.z * kd * (1 - c),
        };
    };
};

// n directions spread evenly over the sphere, the first exactly at VIEW_DIRECTION.
export const spreadDirections = (n: number): Vec[] => {
    const points = Array.from({length: n}, (_, i) => fibonacciPoint(i, n));
    const face = rotationTaking(points[0], VIEW_DIRECTION);
    return points.map((p) => unit(face(p)));
};

// The links drawn while nothing is lit: each entity's heaviest few, so a densely linked brain is a
// constellation rather than a hairball. A link stays when it is among either end's heaviest, so an
// entity with one link always shows it; a lit entity shows all of its links (graph-scene).
export const RESTING_LINKS_PER_ENTITY = 3;
export const restingEdges = (edges: readonly GraphEdge[], perEntity = RESTING_LINKS_PER_ENTITY): GraphEdge[] => {
    const byEntity = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
        if (edge.source === edge.target) continue;
        for (const key of [edge.source, edge.target]) {
            const list = byEntity.get(key) ?? [];
            list.push(edge);
            byEntity.set(key, list);
        }
    }
    const kept = new Set<GraphEdge>();
    for (const list of byEntity.values()) {
        const heaviest = [...list].sort((a, b) => b.weight - a.weight || `${a.source}|${a.target}`.localeCompare(`${b.source}|${b.target}`));
        for (const edge of heaviest.slice(0, perEntity)) kept.add(edge);
    }
    return edges.filter((edge) => kept.has(edge));
};

export const layoutGraph = (nodes: readonly BrainEntitySummary[], edges: readonly GraphEdge[]): GraphPoint[] => {
    if (nodes.length === 0) return [];
    const maxWeight = Math.max(...nodes.map((n) => n.weightSlow), 0.001);
    const known = edges.filter((e) => e.source !== e.target);
    const linkWeight = new Map<string, number>();
    for (const e of known) {
        const pair = `${e.source}\u0000${e.target}`;
        const back = `${e.target}\u0000${e.source}`;
        linkWeight.set(pair, Math.max(linkWeight.get(pair) ?? 0, e.weight));
        linkWeight.set(back, Math.max(linkWeight.get(back) ?? 0, e.weight));
    }

    // Seat the entities in weight order: the heaviest faces the camera; one with links to seated
    // entities takes the free direction nearest them, weighted by the links; one without takes the
    // free direction farthest from everything seated. Ties go to the lower slot, which is nearer
    // the front.
    const slots = spreadDirections(nodes.length);
    const free = slots.map((_, i) => i);
    const seated = new Map<string, Vec>();
    const order = [...nodes].sort((a, b) => b.weightSlow - a.weightSlow || a.key.localeCompare(b.key));
    for (const node of order) {
        let best = free[0];
        if (seated.size > 0) {
            const links = [...seated].map(([key, dir]) => [linkWeight.get(`${node.key}\u0000${key}`) ?? 0, dir] as const).filter(([w]) => w > 0);
            let bestScore = Infinity;
            for (const slot of free) {
                const score = links.length > 0
                    ? links.reduce((sum, [w, dir]) => sum + w * angle(slots[slot], dir), 0)
                    : -Math.min(...[...seated.values()].map((dir) => angle(slots[slot], dir)));
                if (score < bestScore - 1e-12) {
                    bestScore = score;
                    best = slot;
                }
            }
        }
        free.splice(free.indexOf(best), 1);
        seated.set(node.key, slots[best]);
    }

    return nodes.map((node) => {
        const u = seated.get(node.key)!;
        const radius = SHELL_RADII[node.type];
        return {key: node.key, x: u.x * radius, y: u.y * radius, z: u.z * radius, r: MIN_NODE_R + (MAX_NODE_R - MIN_NODE_R) * Math.sqrt(node.weightSlow / maxWeight), node};
    });
};
