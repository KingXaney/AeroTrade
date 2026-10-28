// The office's floor plan, pure: one open floor 40 × 24 m, the pipeline along the back row (the data
// wall and the bullpen, the research table, the trader, the risk bench, the corner office) and the
// company along the front (the front desk, the coffee and the robot's dock, the execution desk, the
// chute to the exchange). Every seat, prop, path, camera preset, idle gesture and the sky's mix by
// the New York hour is a function of constants here, so the 3D scene and the 2D floor plan draw the
// same room and a test can hold it together (lib/agent-world/__tests__/office-layout.test.ts).
//
// Axes: x to the right, y up, z toward the camera; the back wall stands at z = −10. A seat's yaw is
// the way its worker faces: 0 toward the camera (+z), π toward the back wall.

import type {WorkerId} from "@/lib/agent-world/config";

export type Vec3 = readonly [number, number, number];

export const FLOOR = {minX: -20, maxX: 20, minZ: -10, maxZ: 7} as const;
export const WALL_HEIGHT = 4.4;
export const PARTITION_HEIGHT = 1.1;
// The robot's corridor between the back row and the front row.
export const CORRIDOR_Z = 0;

// The data wall's five providers, left to right, in the order the chains ask them most.
export const OFFICE_SHELF_VENDORS = ['openbb', 'yfinance', 'sec_edgar', 'fred', 'polymarket'] as const;
export type ShelfVendor = (typeof OFFICE_SHELF_VENDORS)[number];

export const OFFICE_ZONE_IDS = ['front', 'bullpen', 'table', 'trading', 'risk', 'corner', 'execution'] as const;
export type OfficeZoneId = (typeof OFFICE_ZONE_IDS)[number];

export const OFFICE_PROPS = ['monitors', 'headset', 'newspaper', 'calculator', 'bull', 'bear', 'glasses', 'visor', 'lamp-tall', 'lamp-banker', 'lamp-disc', 'tie', 'bell', 'stamp'] as const;
export type OfficeProp = (typeof OFFICE_PROPS)[number];

// Seated and standing heights: the seat, the shoulders, the top of the head.
export const RIG = {seat: 0.5, shoulder: 1.16, headBase: 1.3, headTop: 1.66, standingLift: 0.36, deskTop: 0.76} as const;

export type OfficeSeat = {
    id: WorkerId;
    // The desk number, 1 to 14, in the order a run reaches the seats.
    desk: number;
    zone: OfficeZoneId;
    // Where the worker sits (or stands), on the floor.
    seat: Vec3;
    yaw: number;
    standing: boolean;
    prop: OfficeProp;
    // The worker's own desk, if it has one (the table and the bench are shared furniture).
    surface: {center: Vec3; size: readonly [number, number]} | null;
    // Where the worker's hands meet the desk: a plane leaves from and lands here.
    work: Vec3;
    // Where the robot stops to hand a paper over.
    drop: Vec3;
};

const BACK_SEAT_Z = -4.6;
const BACK_DESK_Z = -5.55;
const DESK: readonly [number, number] = [1.6, 0.8];

const backSeat = (id: WorkerId, desk: number, zone: OfficeZoneId, x: number, prop: OfficeProp, surface = true): OfficeSeat => ({
    id,
    desk,
    zone,
    seat: [x, 0, BACK_SEAT_Z],
    yaw: Math.PI,
    standing: false,
    prop,
    surface: surface ? {center: [x, RIG.deskTop, BACK_DESK_Z], size: DESK} : null,
    work: [x, RIG.deskTop + 0.05, BACK_DESK_Z + 0.2],
    drop: [x, 0, BACK_SEAT_Z + 1.2],
});

const TABLE: Vec3 = [-2.5, RIG.deskTop, -5.8];
const TABLE_RADIUS = 1.25;

export const OFFICE_SEATS: readonly OfficeSeat[] = [
    {id: 'head-trader', desk: 1, zone: 'front', seat: [-15, 0, 3.2], yaw: 0, standing: true, prop: 'bell',
        surface: {center: [-15, 1.1, 4.25], size: [3.2, 0.9]}, work: [-15, 1.12, 4.1], drop: [-12.9, 0, 3.3]},
    backSeat('market', 2, 'bullpen', -17.5, 'monitors'),
    backSeat('sentiment', 3, 'bullpen', -14.5, 'headset'),
    backSeat('news', 4, 'bullpen', -11.5, 'newspaper'),
    backSeat('fundamentals', 5, 'bullpen', -8.5, 'calculator'),
    {id: 'bull', desk: 6, zone: 'table', seat: [TABLE[0] - 1.85, 0, TABLE[2]], yaw: Math.PI / 2, standing: false, prop: 'bull',
        surface: null, work: [TABLE[0] - 0.75, RIG.deskTop + 0.05, TABLE[2]], drop: [TABLE[0] - 1.85, 0, TABLE[2] + 1.5]},
    {id: 'bear', desk: 7, zone: 'table', seat: [TABLE[0] + 1.85, 0, TABLE[2]], yaw: -Math.PI / 2, standing: false, prop: 'bear',
        surface: null, work: [TABLE[0] + 0.75, RIG.deskTop + 0.05, TABLE[2]], drop: [TABLE[0] + 1.85, 0, TABLE[2] + 1.5]},
    {id: 'research-manager', desk: 8, zone: 'table', seat: [TABLE[0], 0, TABLE[2] - 1.85], yaw: 0, standing: false, prop: 'glasses',
        surface: null, work: [TABLE[0], RIG.deskTop + 0.05, TABLE[2] - 0.75], drop: [TABLE[0], 0, TABLE[2] + 1.6]},
    backSeat('trader', 9, 'trading', 3.5, 'visor'),
    backSeat('risk-aggressive', 10, 'risk', 8, 'lamp-tall', false),
    backSeat('risk-conservative', 11, 'risk', 10, 'lamp-banker', false),
    backSeat('risk-neutral', 12, 'risk', 12, 'lamp-disc', false),
    {id: 'portfolio-manager', desk: 13, zone: 'corner', seat: [17.4, 0, -7.4], yaw: 0, standing: false, prop: 'tie',
        surface: {center: [17.4, RIG.deskTop, -6.4], size: [2, 0.9]}, work: [17.4, RIG.deskTop + 0.05, -6.6], drop: [15.6, 0, -1.4]},
    {id: 'execution-desk', desk: 14, zone: 'execution', seat: [7, 0, 3.2], yaw: 0, standing: false, prop: 'stamp',
        surface: {center: [7, RIG.deskTop, 4.2], size: [2.2, 0.9]}, work: [7, RIG.deskTop + 0.05, 4.0], drop: [5.2, 0, 2.5]},
];

const SEAT_BY_ID = new Map(OFFICE_SEATS.map((seat) => [seat.id, seat]));
export const seatOf = (id: WorkerId): OfficeSeat => {
    const seat = SEAT_BY_ID.get(id);
    if (!seat) throw new Error(`no seat for ${id}`);
    return seat;
};

// The top of a worker's head (where its lamp, nameplate and bubble hang).
export const headTop = (id: WorkerId): Vec3 => {
    const {seat, standing} = seatOf(id);
    return [seat[0], RIG.headTop + (standing ? RIG.standingLift : 0), seat[2]];
};

// The shared furniture and the walls' fixtures.
export const FURNITURE = {
    table: {center: TABLE, radius: TABLE_RADIUS},
    bench: {center: [10, RIG.deskTop, BACK_DESK_Z] as Vec3, size: [6.2, 0.8] as const},
    shelves: OFFICE_SHELF_VENDORS.map((vendor, i): {vendor: ShelfVendor; center: Vec3; width: number; height: number} => ({
        vendor,
        center: [-18 + i * 2.5, 0, -9.45],
        width: 2.1,
        height: 2.6,
    })),
    bin: [-6.6, 0, -8.9] as Vec3,
    planBoard: {center: [-2.5, 1.65, -9.82] as Vec3, size: [3.2, 1.25] as const},
    wallPlate: {center: [5.6, 2.35, -9.82] as Vec3, size: [3.6, 1.3] as const},
    clock: [1.25, 2.55, -9.8] as Vec3,
    gauges: [[8, 2.05, -9.8], [10, 2.05, -9.8], [12, 2.05, -9.8]] as readonly Vec3[],
    windowBand: {from: -20, to: 14.2, bottom: 3.15, top: 4.25},
    cornerWindow: {center: [18.7, 2.2, -9.85] as Vec3, size: [2.2, 2.4] as const},
    corkboard: {center: [15.8, 1.75, -9.82] as Vec3, size: [2.2, 1.3] as const},
    plant: [19.2, 0, -8.9] as Vec3,
    glass: [
        {from: [14.2, -10] as const, to: [14.2, -2.6] as const},
        {from: [14.2, -2.6] as const, to: [14.9, -2.6] as const},
        {from: [16.3, -2.6] as const, to: [20, -2.6] as const},
    ],
    counter: {center: [-15, 0, 4.25] as Vec3, size: [3.2, 0.9, 1.1] as const},
    bell: [-13.9, 1.1, 4.2] as Vec3,
    issueBoard: {center: [-18.4, 1.6, 2.6] as Vec3, size: [2.4, 1.3] as const},
    coffee: {center: [-6.6, 0, 5.6] as Vec3, size: [2.4, 0.7] as const},
    dock: [-3.8, 0, 5.3] as Vec3,
    lampPost: [8.15, RIG.deskTop, 4.25] as Vec3,
    stamp: [5.95, RIG.deskTop, 4.25] as Vec3,
    trays: {sent: [6.5, RIG.deskTop, 4.55] as Vec3, returned: [7.55, RIG.deskTop, 4.55] as Vec3},
    chute: {center: [12.8, 0, 3.8] as Vec3, radius: 0.26, mouth: [12.35, 1.25, 3.8] as Vec3},
} as const;

export const shelfOf = (vendor: string): (typeof FURNITURE.shelves)[number] | null => FURNITURE.shelves.find((shelf) => shelf.vendor === vendor) ?? null;

// Where a plane meets a shelf: the middle of its face, at a binder's height.
export const shelfFront = (vendor: string): Vec3 | null => {
    const shelf = shelfOf(vendor);
    return shelf ? [shelf.center[0], 1.45, shelf.center[2] + 0.42] : null;
};

// A rating card's place on the corkboard, the i-th of up to ten (two rows of five).
export const CORK_SLOTS = 10;
export const corkSlot = (i: number): Vec3 => {
    const {center, size} = FURNITURE.corkboard;
    const slot = ((i % CORK_SLOTS) + CORK_SLOTS) % CORK_SLOTS;
    const col = slot % 5;
    const row = Math.floor(slot / 5);
    return [center[0] - size[0] / 2 + 0.28 + col * 0.41, center[1] + size[1] / 2 - 0.36 - row * 0.58, center[2] + 0.04];
};

// The zones, each with its label's place, its bounds on the floor and its camera preset.
export const OFFICE_ZONES: readonly {id: OfficeZoneId; label: Vec3; bounds: {minX: number; maxX: number; minZ: number; maxZ: number}}[] = [
    {id: 'front', label: [-15, 0.05, 6.2], bounds: {minX: -20, maxX: -9, minZ: 1.4, maxZ: 7}},
    {id: 'bullpen', label: [-13, 0.05, -3.0], bounds: {minX: -20, maxX: -6.2, minZ: -10, maxZ: -2.2}},
    {id: 'table', label: [-2.5, 0.05, -3.0], bounds: {minX: -6.2, maxX: 1.2, minZ: -10, maxZ: -2.2}},
    {id: 'trading', label: [3.5, 0.05, -3.0], bounds: {minX: 1.2, maxX: 6.4, minZ: -10, maxZ: -2.2}},
    {id: 'risk', label: [10, 0.05, -3.0], bounds: {minX: 6.4, maxX: 14.2, minZ: -10, maxZ: -2.2}},
    {id: 'corner', label: [17.2, 0.05, -3.2], bounds: {minX: 14.2, maxX: 20, minZ: -10, maxZ: -2.6}},
    {id: 'execution', label: [7, 0.05, 6.2], bounds: {minX: 2, maxX: 20, minZ: 1.4, maxZ: 7}},
];

// ---- paths ---------------------------------------------------------------------------------------

// A small stable hash, for a flow's lateral offset (so parallel planes do not overlap).
export const hashString = (text: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
};

export type Arc = {p0: Vec3; c: Vec3; p1: Vec3};

// A quadratic arc from `from` to `to` rising `apex` above the higher end, pushed sideways by up to
// `lateral` (by the key's hash), so two planes on the same route take different arcs.
export const arcPath = (from: Vec3, to: Vec3, apex: number, key = '', lateral = 0.35): Arc => {
    const mid: [number, number, number] = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + apex, (from[2] + to[2]) / 2];
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const length = Math.hypot(dx, dz) || 1;
    const shift = (((hashString(key) % 1000) / 1000) * 2 - 1) * lateral;
    return {p0: from, c: [mid[0] - (dz / length) * shift, mid[1], mid[2] + (dx / length) * shift], p1: to};
};

export const arcPoint = (arc: Arc, u: number): Vec3 => {
    const t = Math.min(1, Math.max(0, u));
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return [a * arc.p0[0] + b * arc.c[0] + c * arc.p1[0], a * arc.p0[1] + b * arc.c[1] + c * arc.p1[1], a * arc.p0[2] + b * arc.c[2] + c * arc.p1[2]];
};

// The robot's way from one point to another: out to the corridor, along it, in to the target. On
// the floor (y = 0); consecutive duplicates dropped.
export const walkPath = (from: Vec3, to: Vec3): Vec3[] => {
    const points: Vec3[] = [[from[0], 0, from[2]], [from[0], 0, CORRIDOR_Z], [to[0], 0, CORRIDOR_Z], [to[0], 0, to[2]]];
    return points.filter((point, i) => i === 0 || Math.hypot(point[0] - points[i - 1][0], point[2] - points[i - 1][2]) > 1e-6);
};

export const pathLength = (points: readonly Vec3[]): number =>
    points.reduce((sum, point, i) => (i === 0 ? 0 : sum + Math.hypot(point[0] - points[i - 1][0], point[2] - points[i - 1][2])), 0);

// The point `distance` along a path, and the heading there (radians, 0 toward +z).
export const pathPoint = (points: readonly Vec3[], distance: number): {at: Vec3; heading: number} => {
    if (points.length === 0) return {at: [0, 0, 0], heading: 0};
    let left = Math.max(0, distance);
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const heading = Math.atan2(b[0] - a[0], b[2] - a[2]);
        if (left <= length || i === points.length - 1) {
            if (left >= length - 1e-9) return {at: b, heading};
            const t = length === 0 ? 1 : left / length;
            return {at: [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t], heading};
        }
        left -= length;
    }
    return {at: points[points.length - 1], heading: 0};
};

// ---- the camera ----------------------------------------------------------------------------------

export const OFFICE_PRESET_IDS = ['overview', 'front', 'bullpen', 'table', 'trading', 'risk', 'corner', 'execution'] as const;
export type OfficePresetId = (typeof OFFICE_PRESET_IDS)[number];

export const OFFICE_PRESETS: Readonly<Record<OfficePresetId, {target: Vec3; position: Vec3}>> = {
    overview: {target: [0, 0.4, -1.6], position: [0, 19.5, 17.5]},
    front: {target: [-15.4, 1.2, 3.4], position: [-10.6, 7, 12.4]},
    bullpen: {target: [-13, 1.1, -6.2], position: [-13, 7.8, 3.4]},
    table: {target: [-2.5, 0.9, -5.9], position: [-2.5, 7, 2.6]},
    trading: {target: [3.5, 1, -5.6], position: [1.8, 6.2, 2.2]},
    risk: {target: [10, 1.2, -6], position: [10, 7, 3.2]},
    corner: {target: [17.2, 1.2, -6.8], position: [12.8, 6.6, 1.2]},
    execution: {target: [9.9, 1.1, 4], position: [9.6, 6, 12.8]},
};

// The preset that shows a seat best.
export const presetForSeat = (id: WorkerId): OfficePresetId => {
    const zone = seatOf(id).zone;
    return zone === 'execution' ? 'execution' : zone;
};

// Orbit limits: the camera stays in front of the room and above the floor.
export const CAMERA_LIMITS = {minDistance: 5, maxDistance: 62, minPolar: 0.18, maxPolar: Math.PI / 2 - 0.12, maxAzimuth: 1.05, fov: 40} as const;
export const TARGET_BOUNDS = {minX: -18, maxX: 18, minZ: -8.5, maxZ: 5.5, minY: 0.3, maxY: 3} as const;

// ---- idle gestures and the sky -------------------------------------------------------------------

// A seat that waits or is done does something small now and then: sips, swivels or stretches,
// chosen by its place and the time slot alone (no stored randomness), so a replay shows the same.
export const GAG_PERIOD_MS = 9000;
export const GAG_MS = 1400;
export const IDLE_GAGS = ['sip', 'swivel', 'stretch'] as const;
export type IdleGag = (typeof IDLE_GAGS)[number];
export const idleGag = (index: number, slot: number): IdleGag | null => {
    const pick = Math.abs(Math.imul(index + 1, 7919) ^ Math.imul(slot + 3, 104729)) % 7;
    return pick < IDLE_GAGS.length ? IDLE_GAGS[pick] : null;
};
// When, within its slot, a seat's gesture starts (seats are staggered).
export const gagOffset = (index: number): number => (index * 1370) % (GAG_PERIOD_MS - GAG_MS);

const smooth = (edge0: number, edge1: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};
const bump = (x: number, centre: number, width: number): number => Math.max(0, 1 - Math.abs(x - centre) / width);

// Day, dusk and night by the minute of the New York day, summing to 1: day from about 7:00 to
// 17:30, a twilight around 6:45 and 18:00, night otherwise.
export const skyMix = (etMinutes: number): {day: number; dusk: number; night: number} => {
    const m = ((etMinutes % 1440) + 1440) % 1440;
    const day = smooth(390, 465, m) * (1 - smooth(1005, 1095, m));
    const dusk = bump(m, 405, 60) + bump(m, 1080, 70);
    const night = Math.max(0, 1 - smooth(330, 405, m)) + smooth(1080, 1155, m);
    const total = day + dusk + night;
    return total <= 0 ? {day: 0, dusk: 0, night: 1} : {day: day / total, dusk: dusk / total, night: night / total};
};
