// The office's floor plan holds together: every seat on the floor and apart, every fixture inside the
// room, every path from its start to its end, the camera in front of the room and above the floor,
// the idle gestures and the sky's mix the same for the same input.

import {describe, expect, it} from 'vitest';
import {WORKER_IDS} from '@/lib/agent-world/config';
import {
    arcPath,
    arcPoint,
    CAMERA_LIMITS,
    corkSlot,
    CORRIDOR_Z,
    FLOOR,
    FURNITURE,
    gagOffset,
    GAG_MS,
    GAG_PERIOD_MS,
    headTop,
    idleGag,
    IDLE_GAGS,
    OFFICE_PRESET_IDS,
    OFFICE_PRESETS,
    OFFICE_SEATS,
    OFFICE_SHELF_VENDORS,
    OFFICE_ZONES,
    pathLength,
    pathPoint,
    presetForSeat,
    seatOf,
    shelfFront,
    skyMix,
    walkPath,
    type Vec3,
} from '@/lib/agent-world/office-layout';

const inside = (p: Vec3, margin = 0) => p[0] >= FLOOR.minX + margin && p[0] <= FLOOR.maxX - margin && p[2] >= FLOOR.minZ + margin && p[2] <= FLOOR.maxZ - margin;
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('the seats', () => {
    it('seats the fourteen in the order a run reaches them, desks numbered 1 to 14', () => {
        expect(OFFICE_SEATS.map((s) => s.id)).toEqual([...WORKER_IDS]);
        expect(OFFICE_SEATS.map((s) => s.desk)).toEqual(Array.from({length: 14}, (_, i) => i + 1));
    });

    it('keeps every seat, desk and drop point on the floor, and no two seats closer than 1.8 m', () => {
        for (const seat of OFFICE_SEATS) {
            expect(inside(seat.seat, 0.5), seat.id).toBe(true);
            expect(inside(seat.work, 0.5), seat.id).toBe(true);
            expect(inside(seat.drop, 0.5), seat.id).toBe(true);
            if (seat.surface) expect(inside(seat.surface.center, 0.5), seat.id).toBe(true);
        }
        for (let i = 0; i < OFFICE_SEATS.length; i += 1) {
            for (let j = i + 1; j < OFFICE_SEATS.length; j += 1) {
                expect(flat(OFFICE_SEATS[i].seat, OFFICE_SEATS[j].seat), `${OFFICE_SEATS[i].id} and ${OFFICE_SEATS[j].id}`).toBeGreaterThanOrEqual(1.8);
            }
        }
    });

    it('puts each seat in its zone and every head above its seat', () => {
        for (const seat of OFFICE_SEATS) {
            const zone = OFFICE_ZONES.find((z) => z.id === seat.zone);
            if (!zone) throw new Error(seat.zone);
            const [x, , z] = seat.seat;
            expect(x >= zone.bounds.minX && x <= zone.bounds.maxX && z >= zone.bounds.minZ && z <= zone.bounds.maxZ, seat.id).toBe(true);
            const head = headTop(seat.id);
            expect(head[1]).toBeGreaterThan(1.5);
            expect([head[0], head[2]]).toEqual([seat.seat[0], seat.seat[2]]);
        }
        expect(headTop('head-trader')[1]).toBeGreaterThan(headTop('market')[1]);
        expect(() => seatOf('nobody' as never)).toThrow();
    });

    it('orders the back row\'s zones left to right without overlap', () => {
        const back = OFFICE_ZONES.filter((z) => z.bounds.maxZ < 0);
        expect(back.map((z) => z.id)).toEqual(['bullpen', 'table', 'trading', 'risk', 'corner']);
        for (let i = 1; i < back.length; i += 1) expect(back[i].bounds.minX).toBeGreaterThanOrEqual(back[i - 1].bounds.maxX);
    });
});

describe('the fixtures', () => {
    it('stands the five shelves along the back wall, left to right, each reachable by a plane', () => {
        expect(FURNITURE.shelves.map((s) => s.vendor)).toEqual([...OFFICE_SHELF_VENDORS]);
        for (let i = 1; i < FURNITURE.shelves.length; i += 1) {
            const a = FURNITURE.shelves[i - 1];
            const b = FURNITURE.shelves[i];
            expect(b.center[0] - b.width / 2).toBeGreaterThanOrEqual(a.center[0] + a.width / 2);
        }
        for (const vendor of OFFICE_SHELF_VENDORS) {
            const front = shelfFront(vendor);
            expect(front).not.toBeNull();
            if (front) expect(inside(front)).toBe(true);
        }
        expect(shelfFront('alpha_vantage')).toBeNull();
    });

    it('pins ten cards on the corkboard inside its frame', () => {
        const {center, size} = FURNITURE.corkboard;
        for (let i = 0; i < 10; i += 1) {
            const slot = corkSlot(i);
            expect(Math.abs(slot[0] - center[0])).toBeLessThan(size[0] / 2);
            expect(Math.abs(slot[1] - center[1])).toBeLessThan(size[1] / 2);
        }
        expect(corkSlot(10)).toEqual(corkSlot(0));
    });
});

describe('paths', () => {
    it('arcs a plane from its start to its end, above both', () => {
        const from: Vec3 = [-17.5, 0.8, -6.75];
        const to = shelfFront('openbb') as Vec3;
        const arc = arcPath(from, to, 1.6, 'fetch:7');
        expect(arcPoint(arc, 0)).toEqual(from);
        expect(arcPoint(arc, 1)).toEqual(to);
        expect(arcPoint(arc, 0.5)[1]).toBeGreaterThan(Math.max(from[1], to[1]));
        expect(arcPath(from, to, 1.6, 'fetch:7')).toEqual(arc);
        expect(arcPath(from, to, 1.6, 'fetch:8')).not.toEqual(arc);
    });

    it('walks the robot out to the corridor, along it and in', () => {
        const from = FURNITURE.dock;
        const to = seatOf('bull').drop;
        const path = walkPath(from, to);
        expect(path[0]).toEqual([from[0], 0, from[2]]);
        expect(path.at(-1)).toEqual([to[0], 0, to[2]]);
        expect(path.some((p) => p[2] === CORRIDOR_Z)).toBe(true);
        const length = pathLength(path);
        expect(length).toBeGreaterThan(flat(from, to) - 1e-9);
        expect(pathPoint(path, 0).at).toEqual(path[0]);
        expect(pathPoint(path, length).at).toEqual(path.at(-1));
        expect(pathPoint(path, length * 10).at).toEqual(path.at(-1));
    });
});

describe('the camera', () => {
    it('has a preset for every zone, each in front of the room, above the floor, inside the limits', () => {
        expect(OFFICE_PRESET_IDS[0]).toBe('overview');
        for (const id of OFFICE_PRESET_IDS) {
            const {target, position} = OFFICE_PRESETS[id];
            expect(position[1], id).toBeGreaterThan(target[1]);
            expect(position[2], id).toBeGreaterThan(target[2]);
            const distance = Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
            expect(distance, id).toBeGreaterThanOrEqual(CAMERA_LIMITS.minDistance);
            expect(distance, id).toBeLessThanOrEqual(CAMERA_LIMITS.maxDistance);
        }
        for (const seat of OFFICE_SEATS) expect(OFFICE_PRESET_IDS).toContain(presetForSeat(seat.id));
    });
});

describe('idle gestures and the sky', () => {
    it('picks the same gesture for the same seat and slot, and fits it in its slot', () => {
        const picks = new Set<string | null>();
        for (let index = 0; index < 14; index += 1) {
            for (let slot = 0; slot < 50; slot += 1) {
                const gag = idleGag(index, slot);
                expect(idleGag(index, slot)).toBe(gag);
                picks.add(gag);
            }
            expect(gagOffset(index) + GAG_MS).toBeLessThanOrEqual(GAG_PERIOD_MS);
        }
        for (const gag of IDLE_GAGS) expect(picks.has(gag)).toBe(true);
        expect(picks.has(null)).toBe(true);
    });

    it('mixes day, dusk and night by the New York minute, always summing to one', () => {
        for (let m = 0; m < 1440; m += 7) {
            const mix = skyMix(m);
            expect(mix.day + mix.dusk + mix.night).toBeCloseTo(1, 9);
            for (const w of [mix.day, mix.dusk, mix.night]) expect(w).toBeGreaterThanOrEqual(0);
        }
        expect(skyMix(12 * 60).day).toBeCloseTo(1, 6);
        expect(skyMix(2 * 60).night).toBeCloseTo(1, 6);
        expect(skyMix(18 * 60 + 30).dusk).toBeGreaterThan(0.3);
        expect(skyMix(-60)).toEqual(skyMix(23 * 60));
    });
});
