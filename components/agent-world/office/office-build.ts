// The office's meshes, built once from three.js primitives (no model or image files): floor 12 of a
// tower with its furniture, the fourteen seated (one standing) workers' rigs, the courier robot,
// the paper planes, the cards and tickets, and the city far below under a New York sky. Static
// furniture is merged per material to keep the draw calls few; everything that moves keeps its own
// mesh. Colours come from the palette the scene reads off the page's tokens, so `recolor` repaints
// every material in place. Every geometry, material and texture is registered for disposal.

import {
    BoxGeometry,
    BufferGeometry,
    CanvasTexture,
    CircleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    LinearFilter,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    OctahedronGeometry,
    PlaneGeometry,
    Points,
    PointsMaterial,
    RepeatWrapping,
    SphereGeometry,
    SRGBColorSpace,
    TorusGeometry,
    type Material,
    type Object3D,
    type Texture,
} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {WorkerId} from '@/lib/agent-world/config';
import {
    CORK_SLOTS,
    FLOOR,
    FURNITURE,
    hashString,
    OFFICE_SEATS,
    RIG,
    type OfficeSeat,
    type Vec3,
} from '@/lib/agent-world/office-layout';
import {SHIRTS, shirtOf, type Shirt} from '@/components/agent-world/office/office-look';
import type {OfficePalette} from '@/components/agent-world/office/office-tokens';
import type {Rgb} from '@/lib/theme/css-color';

export type Registry = {geometries: BufferGeometry[]; materials: Material[]; textures: Texture[]};
export const createRegistry = (): Registry => ({geometries: [], materials: [], textures: []});

export const toColor = (rgb: Rgb, out = new Color()): Color => out.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
const hex = (rgb: Rgb): string => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

export {SHIRTS, shirtOf, type Shirt};

// ---- materials -----------------------------------------------------------------------------------

const drawChecker = (canvas: HTMLCanvasElement, a: Rgb, b: Rgb) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cell = canvas.width / 2;
    for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < 2; x += 1) {
            ctx.fillStyle = hex((x + y) % 2 === 0 ? a : b);
            ctx.fillRect(x * cell, y * cell, cell, cell);
        }
    }
    // A faint grout line round every tile.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, canvas.height);
        ctx.moveTo(0, i * cell);
        ctx.lineTo(canvas.width, i * cell);
        ctx.stroke();
    }
};

// A tower's windows: a grid of panes, some lit, read as the emissive map (lit only at night).
const drawWindows = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cols = 6;
    const rows = 16;
    const w = canvas.width / cols;
    const h = canvas.height / rows;
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const lit = hashString(`w${r}:${c}`) % 100 < 46;
            ctx.fillStyle = lit ? '#fff' : '#161616';
            ctx.fillRect(c * w + w * 0.2, r * h + h * 0.25, w * 0.6, h * 0.5);
        }
    }
};

const drawBlob = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    g.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
};

const canvasOf = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

export type OfficeMaterials = ReturnType<typeof createMaterials>;

export const createMaterials = (reg: Registry, palette: OfficePalette) => {
    const lambert = (params: ConstructorParameters<typeof MeshLambertMaterial>[0] = {}) => {
        const m = new MeshLambertMaterial(params);
        reg.materials.push(m);
        return m;
    };
    const basic = (params: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}) => {
        const m = new MeshBasicMaterial(params);
        reg.materials.push(m);
        return m;
    };
    const texture = <T extends Texture>(t: T): T => {
        reg.textures.push(t);
        return t;
    };

    const checkerCanvas = canvasOf(128, 128);
    drawChecker(checkerCanvas, palette.floor, palette.floorAlt);
    const checker = texture(new CanvasTexture(checkerCanvas));
    checker.colorSpace = SRGBColorSpace;
    checker.wrapS = RepeatWrapping;
    checker.wrapT = RepeatWrapping;
    checker.repeat.set((FLOOR.maxX - FLOOR.minX) / 4, (FLOOR.maxZ - FLOOR.minZ) / 4);
    checker.anisotropy = 4;

    const windowsCanvas = canvasOf(96, 256);
    drawWindows(windowsCanvas);
    const windows = texture(new CanvasTexture(windowsCanvas));
    windows.colorSpace = SRGBColorSpace;
    windows.minFilter = LinearFilter;

    const blobCanvas = canvasOf(64, 64);
    drawBlob(blobCanvas);
    const blob = texture(new CanvasTexture(blobCanvas));

    const shirts = Object.fromEntries(SHIRTS.map((shirt) => [shirt, lambert()])) as Record<Shirt, MeshLambertMaterial>;
    const carpets = Object.fromEntries(SHIRTS.map((shirt) => [shirt, lambert({transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1})])) as Record<Shirt, MeshLambertMaterial>;

    const m = {
        checkerCanvas,
        checker,
        floor: lambert({map: checker}),
        slab: lambert(),
        wall: lambert(),
        trim: lambert(),
        glass: lambert({transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide}),
        wood: lambert(),
        woodTop: lambert(),
        chair: lambert(),
        metal: lambert(),
        brass: lambert(),
        frame: lambert(),
        paper: lambert({side: DoubleSide}),
        cork: lambert(),
        plant: lambert(),
        shelf: lambert(),
        binder: lambert(),
        robot: lambert(),
        robotDark: lambert(),
        skin: lambert(),
        pants: lambert(),
        city: lambert(),
        tower: lambert({emissiveMap: windows, emissiveIntensity: 0}),
        shirts,
        carpets,
        eyes: basic(),
        shadow: basic({map: blob, transparent: true, depthWrite: false, color: 0x000000}),
        ring: basic({transparent: true, opacity: 0.85, depthWrite: false}),
        wallPanel: basic(),
        bulb: basic(),
        marketLamp: basic(),
        brew: basic(),
        stars: (() => {
            const pm = new PointsMaterial({size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff});
            reg.materials.push(pm);
            return pm;
        })(),
        // One each, so a seat's screen, a seat's lamp and a shelf's glow change alone.
        screens: new Map<WorkerId, MeshBasicMaterial>(OFFICE_SEATS.map((seat) => [seat.id, basic()])),
        diamonds: new Map<WorkerId, MeshBasicMaterial>(OFFICE_SEATS.map((seat) => [seat.id, basic({transparent: true, opacity: 0.95})])),
        glows: new Map<string, MeshBasicMaterial>(FURNITURE.shelves.map((shelf) => [shelf.vendor, basic({transparent: true, opacity: 0, depthWrite: false})])),
        riskLamps: [basic(), basic(), basic()],
        check: basic(),
    };
    recolor(m, palette);
    return m;
};

export const recolor = (m: OfficeMaterials, p: OfficePalette) => {
    drawChecker(m.checkerCanvas, p.floor, p.floorAlt);
    m.checker.needsUpdate = true;
    toColor(p.trim, m.slab.color);
    toColor(p.wall, m.wall.color);
    toColor(p.trim, m.trim.color);
    toColor(p.glass, m.glass.color);
    toColor(p.wood, m.wood.color);
    toColor(p.woodTop, m.woodTop.color);
    toColor(p.chair, m.chair.color);
    toColor(p.metal, m.metal.color);
    toColor(p.brass, m.brass.color);
    toColor(p.robotDark, m.frame.color);
    toColor(p.paper, m.paper.color);
    toColor(p.cork, m.cork.color);
    toColor(p.plant, m.plant.color);
    toColor(p.shelf, m.shelf.color);
    toColor(p.analysts, m.binder.color);
    toColor(p.robot, m.robot.color);
    toColor(p.robotDark, m.robotDark.color);
    toColor(p.skin, m.skin.color);
    toColor(p.robotDark, m.pants.color);
    toColor(p.city, m.city.color);
    toColor(p.skyline, m.tower.color);
    toColor(p.skylineWindow, m.tower.emissive);
    toColor(p.robotDark, m.eyes.color);
    toColor(p.brand, m.ring.color);
    toColor(p.screenOff, m.wallPanel.color);
    toColor(p.brand, m.check.color);
    for (const shirt of SHIRTS) {
        toColor(p[shirt], m.shirts[shirt].color);
        toColor(p[shirt], m.carpets[shirt].color);
    }
};

// ---- geometry helpers ----------------------------------------------------------------------------

// Static pieces, gathered per material and merged into one mesh each.
class Batch {
    private parts = new Map<Material, BufferGeometry[]>();
    constructor(private reg: Registry) {}
    add(material: Material, geometry: BufferGeometry) {
        const list = this.parts.get(material) ?? [];
        list.push(geometry);
        this.parts.set(material, list);
    }
    build(parent: Object3D) {
        for (const [material, list] of this.parts) {
            const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
            for (const g of list) g.dispose();
            if (!merged) continue;
            this.reg.geometries.push(merged);
            const mesh = new Mesh(merged, material);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            parent.add(mesh);
        }
        this.parts.clear();
    }
}

// A geometry in a seat's frame (its yaw, then its position).
const inSeat = (geometry: BufferGeometry, seat: OfficeSeat, local: Vec3): BufferGeometry => {
    geometry.translate(local[0], local[1], local[2]);
    geometry.rotateY(seat.yaw);
    geometry.translate(seat.seat[0], seat.seat[1], seat.seat[2]);
    return geometry;
};

const box = (w: number, h: number, d: number, at: Vec3, yaw = 0): BufferGeometry => {
    const g = new BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    g.translate(at[0], at[1], at[2]);
    return g;
};

const cylinder = (rTop: number, rBottom: number, h: number, at: Vec3, segments = 16): BufferGeometry => {
    const g = new CylinderGeometry(rTop, rBottom, h, segments);
    g.translate(at[0], at[1], at[2]);
    return g;
};

const register = <T extends BufferGeometry>(reg: Registry, geometry: T): T => {
    reg.geometries.push(geometry);
    return geometry;
};

const meshOf = (reg: Registry, geometry: BufferGeometry, material: Material): Mesh => new Mesh(register(reg, geometry), material);

// ---- the room ------------------------------------------------------------------------------------

export type Room = {
    group: Group;
    glows: Map<string, Mesh>;
    gaugeNeedles: Mesh[];
    clockHands: {hour: Mesh; minute: Mesh};
    planBars: Mesh[];
    printerStrip: Mesh;
    lampBulb: Mesh;
    marketLamp: Mesh;
    stamp: Group;
    issueCard: Mesh;
    riskLampBulbs: Mesh[];
    brewLight: Mesh;
    ring: Mesh;
};

const WALL_H = 3.4;

export const buildRoom = (reg: Registry, m: OfficeMaterials): Room => {
    const group = new Group();
    const batch = new Batch(reg);
    const width = FLOOR.maxX - FLOOR.minX;
    const depth = FLOOR.maxZ - FLOOR.minZ;

    // The floor plate: its tiles, and the slab's edge (floor 12 hangs in the air).
    const floor = new Mesh(register(reg, new PlaneGeometry(width, depth)), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'floor';
    group.add(floor);
    batch.add(m.slab, box(width + 0.6, 0.9, depth + 0.6, [0, -0.46, 0]));

    // Each team's carpet, a soft wash of its shirt colour under its seats.
    const carpet = (shirt: Shirt, minX: number, maxX: number, minZ: number, maxZ: number) => {
        const g = new PlaneGeometry(maxX - minX, maxZ - minZ);
        g.rotateX(-Math.PI / 2);
        g.translate((minX + maxX) / 2, 0.006, (minZ + maxZ) / 2);
        batch.add(m.carpets[shirt], g);
    };
    carpet('analysts', -19.6, -6.6, -8.8, -2.4);
    carpet('research', -5.8, 0.8, -8.9, -2.6);
    carpet('trading', 1.6, 5.8, -7.6, -2.6);
    carpet('risk', 6.6, 13.6, -7.6, -2.6);
    carpet('portfolio', 14.4, 19.8, -9.8, -2.8);
    carpet('head', -19.6, -10.4, 1.6, 6.6);
    carpet('execution', 3.4, 10.6, 1.8, 6.4);

    // The back wall, the glass balustrades round the open floor, the corner office's glass.
    batch.add(m.wall, box(width + 0.6, WALL_H, 0.3, [0, WALL_H / 2, FLOOR.minZ - 0.15]));
    batch.add(m.trim, box(width + 0.6, 0.12, 0.36, [0, WALL_H + 0.06, FLOOR.minZ - 0.15]));
    batch.add(m.trim, box(width + 0.6, 0.14, 0.32, [0, 0.07, FLOOR.minZ + 0.02]));
    for (const x of [FLOOR.minX - 0.15, FLOOR.maxX + 0.15]) {
        batch.add(m.trim, box(0.3, 0.14, depth, [x, 0.07, 0]));
        batch.add(m.glass, box(0.04, 1.0, depth, [x, 0.64, 0]));
        batch.add(m.metal, box(0.08, 0.06, depth, [x, 1.16, 0]));
    }
    batch.add(m.trim, box(width + 0.6, 0.14, 0.3, [0, 0.07, FLOOR.maxZ + 0.15]));
    batch.add(m.glass, box(width + 0.6, 1.0, 0.04, [0, 0.64, FLOOR.maxZ + 0.15]));
    batch.add(m.metal, box(width + 0.6, 0.06, 0.08, [0, 1.16, FLOOR.maxZ + 0.15]));
    for (const pane of FURNITURE.glass) {
        const [x0, z0] = pane.from;
        const [x1, z1] = pane.to;
        const length = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        batch.add(m.glass, box(length, 2.6, 0.05, [(x0 + x1) / 2, 1.3, (z0 + z1) / 2], yaw));
        batch.add(m.metal, box(length, 0.06, 0.08, [(x0 + x1) / 2, 2.62, (z0 + z1) / 2], yaw));
        batch.add(m.metal, box(0.08, 2.6, 0.08, [x1, 1.3, z1]));
    }

    // Desks, monitors and chairs for every seat that has them.
    for (const seat of OFFICE_SEATS) {
        const local = (g: BufferGeometry, at: Vec3) => inSeat(g, seat, at);
        if (seat.surface && seat.id !== 'head-trader') {
            const [w, d] = seat.surface.size;
            const forward = seat.id === 'portfolio-manager' || seat.id === 'execution-desk' ? 1 : 0.95;
            batch.add(m.woodTop, local(new BoxGeometry(w, 0.06, d), [0, RIG.deskTop - 0.03, forward]));
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    batch.add(m.metal, local(new BoxGeometry(0.05, RIG.deskTop - 0.06, 0.05), [sx * (w / 2 - 0.08), (RIG.deskTop - 0.06) / 2, forward + sz * (d / 2 - 0.08)]));
                }
            }
            batch.add(m.wood, local(new BoxGeometry(w - 0.1, 0.36, 0.03), [0, RIG.deskTop - 0.24, forward + d / 2 - 0.06]));
        }
        if (!seat.standing) {
            // The chair: a seat, a back, a post and a foot.
            batch.add(m.chair, local(new BoxGeometry(0.56, 0.08, 0.54), [0, 0.46, -0.02]));
            batch.add(m.chair, local(new BoxGeometry(0.54, 0.62, 0.07), [0, 0.82, -0.3]));
            batch.add(m.metal, local(new CylinderGeometry(0.04, 0.04, 0.38, 8), [0, 0.22, 0]));
            batch.add(m.chair, local(new CylinderGeometry(0.28, 0.3, 0.05, 10), [0, 0.03, 0]));
        }
    }

    // Monitors (frame static; the screen is the seat's own, lit by its status).
    const monitors: {seat: OfficeSeat; at: Vec3; yaw: number; width: number}[] = [];
    for (const seat of OFFICE_SEATS) {
        if (seat.zone === 'bullpen' || seat.zone === 'trading' || seat.zone === 'risk') {
            monitors.push({seat, at: [0, RIG.deskTop + 0.3, 1.2], yaw: 0, width: 0.66});
            if (seat.id === 'market') {
                monitors.push({seat, at: [-0.62, RIG.deskTop + 0.3, 1.08], yaw: 0.5, width: 0.5});
                monitors.push({seat, at: [0.62, RIG.deskTop + 0.3, 1.08], yaw: -0.5, width: 0.5});
            }
            if (seat.id === 'trader') monitors.push({seat, at: [0.66, RIG.deskTop + 0.3, 1.1], yaw: -0.35, width: 0.56});
        }
        if (seat.id === 'portfolio-manager') monitors.push({seat, at: [0.45, RIG.deskTop + 0.3, 1.2], yaw: 0.2, width: 0.62});
    }
    for (const mon of monitors) {
        const frame = new BoxGeometry(mon.width + 0.06, 0.42, 0.05);
        frame.rotateY(mon.yaw);
        frame.translate(mon.at[0], mon.at[1], mon.at[2]);
        batch.add(m.frame, inSeat(frame, mon.seat, [0, 0, 0]));
        batch.add(m.metal, inSeat(new BoxGeometry(0.06, 0.3, 0.06), mon.seat, [mon.at[0], RIG.deskTop + 0.08, mon.at[2] + 0.04]));
        batch.add(m.metal, inSeat(new BoxGeometry(0.26, 0.02, 0.18), mon.seat, [mon.at[0], RIG.deskTop + 0.01, mon.at[2] + 0.04]));
        // Keyboard.
        if (mon.yaw === 0) batch.add(m.frame, inSeat(new BoxGeometry(0.46, 0.025, 0.16), mon.seat, [0, RIG.deskTop + 0.012, 0.68]));
    }

    // The data wall: five bookcases of binders, each with a glow panel the scene lights.
    const glows = new Map<string, Mesh>();
    for (const shelf of FURNITURE.shelves) {
        const [cx, , cz] = shelf.center;
        const w = shelf.width;
        const h = shelf.height;
        batch.add(m.shelf, box(w, h, 0.08, [cx, h / 2, cz - 0.24]));
        for (const sx of [-1, 1]) batch.add(m.shelf, box(0.07, h, 0.55, [cx + sx * (w / 2 - 0.035), h / 2, cz]));
        for (let level = 0; level < 5; level += 1) batch.add(m.shelf, box(w, 0.05, 0.55, [cx, 0.06 + level * 0.62, cz]));
        for (let level = 0; level < 4; level += 1) {
            const count = 9;
            for (let i = 0; i < count; i += 1) {
                const tall = 0.42 + (hashString(`${shelf.vendor}:${level}:${i}`) % 10) / 100;
                const g = box(w / count - 0.05, tall, 0.34, [cx - w / 2 + 0.12 + (i + 0.5) * ((w - 0.24) / count), 0.09 + level * 0.62 + tall / 2, cz + 0.02]);
                batch.add(i % 3 === 1 ? m.paper : m.binder, g);
            }
        }
        const glow = new Mesh(register(reg, new PlaneGeometry(w - 0.1, h - 0.1)), m.glows.get(shelf.vendor) as MeshBasicMaterial);
        glow.position.set(cx, h / 2, cz + 0.3);
        glows.set(shelf.vendor, glow);
        group.add(glow);
    }
    batch.add(m.metal, cylinder(0.22, 0.18, 0.5, [FURNITURE.bin[0], 0.25, FURNITURE.bin[2]], 12));

    // The research table, with papers between the three.
    const [tx, ty, tz] = FURNITURE.table.center;
    batch.add(m.woodTop, cylinder(FURNITURE.table.radius, FURNITURE.table.radius, 0.06, [tx, ty - 0.03, tz], 28));
    batch.add(m.metal, cylinder(0.08, 0.1, ty - 0.06, [tx, (ty - 0.06) / 2, tz], 10));
    batch.add(m.metal, cylinder(0.45, 0.5, 0.04, [tx, 0.02, tz], 16));
    for (const [dx, dz, yaw] of [[-0.6, 0.1, 0.3], [0.62, -0.05, -0.4], [0.05, -0.62, 1.2], [0.1, 0.55, 0.1]] as const) {
        batch.add(m.paper, box(0.3, 0.01, 0.4, [tx + dx, ty + 0.005, tz + dz], yaw));
    }

    // The risk bench: one long desk the three share.
    const [bx, by, bz] = FURNITURE.bench.center;
    const [bw, bd] = FURNITURE.bench.size;
    batch.add(m.woodTop, box(bw, 0.06, bd, [bx, by - 0.03, bz]));
    for (const sx of [-1, 0, 1]) batch.add(m.metal, box(0.06, by - 0.06, bd - 0.1, [bx + sx * (bw / 2 - 0.1), (by - 0.06) / 2, bz]));
    batch.add(m.wood, box(bw - 0.12, 0.36, 0.03, [bx, by - 0.24, bz - bd / 2 + 0.06]));

    // The risk desk's three lamps: tall, banker's and disc, each its analyst's.
    const riskLampBulbs: Mesh[] = [];
    const lampSpots: [number, 'tall' | 'banker' | 'disc'][] = [[8, 'tall'], [10, 'banker'], [12, 'disc']];
    lampSpots.forEach(([x, kind], i) => {
        const z = bz - 0.15;
        const lx = x + 0.55;
        batch.add(m.metal, cylinder(0.1, 0.12, 0.03, [lx, by + 0.015, z], 12));
        const bulbMat = m.riskLamps[i];
        if (kind === 'tall') {
            batch.add(m.metal, cylinder(0.015, 0.015, 0.62, [lx, by + 0.33, z], 6));
            const shade = new Mesh(register(reg, new ConeGeometry(0.13, 0.16, 12, 1, true)), bulbMat);
            shade.position.set(lx, by + 0.66, z);
            riskLampBulbs.push(shade);
            group.add(shade);
        } else if (kind === 'banker') {
            batch.add(m.brass, cylinder(0.015, 0.015, 0.26, [lx, by + 0.14, z], 6));
            const shade = new Mesh(register(reg, new SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), bulbMat);
            shade.position.set(lx, by + 0.27, z);
            riskLampBulbs.push(shade);
            group.add(shade);
        } else {
            batch.add(m.metal, cylinder(0.015, 0.015, 0.4, [lx, by + 0.21, z], 6));
            const shade = new Mesh(register(reg, new CylinderGeometry(0.16, 0.16, 0.035, 18)), bulbMat);
            shade.position.set(lx, by + 0.42, z);
            riskLampBulbs.push(shade);
            group.add(shade);
        }
    });

    // The front desk: a counter with the Head trader's colour along its face, a bell, a tray.
    const [fx, , fz] = FURNITURE.counter.center;
    const [cw, cd, ch] = FURNITURE.counter.size;
    batch.add(m.wood, box(cw, ch - 0.06, cd, [fx, (ch - 0.06) / 2, fz]));
    batch.add(m.woodTop, box(cw + 0.12, 0.06, cd + 0.12, [fx, ch - 0.03, fz]));
    batch.add(m.shirts.head, box(cw, 0.12, 0.02, [fx, ch - 0.25, fz + cd / 2 + 0.01]));
    const [bellX, bellY, bellZ] = FURNITURE.bell;
    batch.add(m.brass, new SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(bellX, bellY, bellZ));
    batch.add(m.frame, cylinder(0.1, 0.1, 0.015, [bellX, bellY, bellZ], 14));
    batch.add(m.paper, box(0.36, 0.05, 0.28, [fx - 1.0, ch + 0.025, fz - 0.05], 0.15));

    // The issue board on its stand: three columns the issue's card moves along.
    const ib = FURNITURE.issueBoard;
    batch.add(m.paper, box(ib.size[0], ib.size[1], 0.04, ib.center));
    batch.add(m.metal, box(ib.size[0] + 0.08, 0.06, 0.06, [ib.center[0], ib.center[1] + ib.size[1] / 2, ib.center[2]]));
    batch.add(m.metal, box(ib.size[0] + 0.08, 0.06, 0.06, [ib.center[0], ib.center[1] - ib.size[1] / 2, ib.center[2]]));
    for (const sx of [-1, 1]) batch.add(m.metal, box(0.06, ib.center[1] + ib.size[1] / 2, 0.06, [ib.center[0] + sx * (ib.size[0] / 2 + 0.03), (ib.center[1] + ib.size[1] / 2) / 2, ib.center[2]]));
    for (const sx of [-1, 1]) batch.add(m.frame, box(0.02, ib.size[1] - 0.16, 0.05, [ib.center[0] + sx * (ib.size[0] / 6), ib.center[1], ib.center[2] + 0.01]));
    const issueCard = meshOf(reg, new BoxGeometry(0.7, 0.42, 0.02), m.paper);
    issueCard.visible = false;
    group.add(issueCard);
    const issueStripe = meshOf(reg, new BoxGeometry(0.7, 0.07, 0.025), m.shirts.head);
    issueStripe.position.set(0, 0.17, 0.002);
    issueCard.add(issueStripe);

    // The coffee counter, the machine with its brew light, and the robot's dock.
    const coffee = FURNITURE.coffee;
    batch.add(m.wood, box(coffee.size[0], 0.86, coffee.size[1], [coffee.center[0], 0.43, coffee.center[2]]));
    batch.add(m.woodTop, box(coffee.size[0] + 0.1, 0.05, coffee.size[1] + 0.1, [coffee.center[0], 0.885, coffee.center[2]]));
    batch.add(m.robotDark, box(0.5, 0.62, 0.42, [coffee.center[0] - 0.6, 1.22, coffee.center[2] - 0.05]));
    batch.add(m.metal, cylinder(0.04, 0.04, 0.12, [coffee.center[0] - 0.6, 1.0, coffee.center[2] + 0.12], 8));
    for (let i = 0; i < 4; i += 1) batch.add(m.paper, cylinder(0.05, 0.045, 0.1, [coffee.center[0] + 0.25 + i * 0.16, 0.96, coffee.center[2]], 10));
    const brewLight = meshOf(reg, new SphereGeometry(0.035, 8, 6), m.brew);
    brewLight.position.set(coffee.center[0] - 0.42, 1.42, coffee.center[2] + 0.17);
    group.add(brewLight);
    const ring = meshOf(reg, new TorusGeometry(0.62, 0.035, 8, 40), m.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(FURNITURE.dock[0], 0.02, FURNITURE.dock[2]);
    group.add(ring);

    // The corner office's plant, cork board and window frame.
    const [px, , pz] = FURNITURE.plant;
    batch.add(m.paper, cylinder(0.26, 0.2, 0.42, [px, 0.21, pz], 14));
    batch.add(m.plant, new ConeGeometry(0.42, 0.9, 9).translate(px, 0.86, pz));
    batch.add(m.plant, new ConeGeometry(0.32, 0.7, 9).translate(px, 1.2, pz));
    batch.add(m.plant, new ConeGeometry(0.2, 0.5, 9).translate(px, 1.5, pz));
    const cork = FURNITURE.corkboard;
    batch.add(m.cork, box(cork.size[0], cork.size[1], 0.04, cork.center));
    batch.add(m.wood, box(cork.size[0] + 0.1, cork.size[1] + 0.1, 0.02, [cork.center[0], cork.center[1], cork.center[2] - 0.02]));

    // The back wall's fixtures: the plan board, the wall panel, the clock and the three gauges.
    const plan = FURNITURE.planBoard;
    batch.add(m.paper, box(plan.size[0], plan.size[1], 0.04, plan.center));
    batch.add(m.metal, box(plan.size[0] + 0.08, plan.size[1] + 0.08, 0.02, [plan.center[0], plan.center[1], plan.center[2] - 0.02]));
    const planBars: Mesh[] = [0, 1, 2].map((i) => {
        const bar = meshOf(reg, new BoxGeometry(1, 0.13, 0.02), m.shirts.research);
        bar.position.set(plan.center[0] - plan.size[0] / 2 + 0.25, plan.center[1] + 0.3 - i * 0.3, plan.center[2] + 0.03);
        bar.scale.x = 0.001;
        group.add(bar);
        return bar;
    });
    const plate = FURNITURE.wallPlate;
    const panel = meshOf(reg, new PlaneGeometry(plate.size[0], plate.size[1]), m.wallPanel);
    panel.position.set(plate.center[0], plate.center[1], plate.center[2] + 0.03);
    group.add(panel);
    batch.add(m.frame, box(plate.size[0] + 0.12, plate.size[1] + 0.12, 0.04, [plate.center[0], plate.center[1], plate.center[2]]));

    const [kx, ky, kz] = FURNITURE.clock;
    const face = new CylinderGeometry(0.42, 0.42, 0.04, 32);
    face.rotateX(Math.PI / 2);
    face.translate(kx, ky, kz + 0.02);
    batch.add(m.paper, face);
    const rim = new TorusGeometry(0.43, 0.035, 8, 32);
    rim.translate(kx, ky, kz + 0.04);
    batch.add(m.frame, rim);
    const hand = (length: number, width: number) => {
        const g = new BoxGeometry(width, length, 0.015);
        g.translate(0, length / 2 - 0.04, 0);
        const mesh = meshOf(reg, g, m.robotDark);
        mesh.position.set(kx, ky, kz + 0.06);
        group.add(mesh);
        return mesh;
    };
    const clockHands = {hour: hand(0.24, 0.045), minute: hand(0.36, 0.03)};

    const gaugeNeedles: Mesh[] = FURNITURE.gauges.map(([gx, gy, gz]) => {
        const dial = new CylinderGeometry(0.34, 0.34, 0.04, 28, 1, false, 0, Math.PI);
        dial.rotateX(Math.PI / 2);
        dial.rotateZ(-Math.PI / 2);
        dial.translate(gx, gy, gz + 0.02);
        batch.add(m.paper, dial);
        batch.add(m.frame, box(0.74, 0.04, 0.04, [gx, gy - 0.02, gz + 0.02]));
        const g = new BoxGeometry(0.03, 0.3, 0.015);
        g.translate(0, 0.15, 0);
        const needle = meshOf(reg, g, m.robotDark);
        needle.position.set(gx, gy, gz + 0.06);
        group.add(needle);
        return needle;
    });

    // The trader's ticket printer and the strip it extrudes when the proposal is filed.
    const trader = OFFICE_SEATS.find((seat) => seat.id === 'trader') as OfficeSeat;
    batch.add(m.robotDark, inSeat(new BoxGeometry(0.3, 0.14, 0.24), trader, [-0.6, RIG.deskTop + 0.07, 0.75]));
    // The strip grows from the printer's slot toward the trader (its length is the scale).
    const strip = meshOf(reg, new BoxGeometry(0.16, 0.006, 1).translate(0, 0, -0.5), m.paper);
    const yaw = trader.yaw;
    const [plx, plz] = [-0.6, 0.62];
    strip.position.set(trader.seat[0] + plx * Math.cos(yaw) + plz * Math.sin(yaw), RIG.deskTop + 0.01, trader.seat[2] - plx * Math.sin(yaw) + plz * Math.cos(yaw));
    strip.rotation.y = yaw;
    strip.scale.z = 0.001;
    group.add(strip);

    // The Execution desk's lamp post, its stamp and its two trays.
    const [lx, ly, lz] = FURNITURE.lampPost;
    batch.add(m.metal, cylinder(0.11, 0.13, 0.04, [lx, ly + 0.02, lz], 12));
    batch.add(m.metal, cylinder(0.018, 0.018, 0.5, [lx, ly + 0.27, lz], 6));
    const lampBulb = meshOf(reg, new SphereGeometry(0.12, 16, 10), m.bulb);
    lampBulb.position.set(lx, ly + 0.6, lz);
    group.add(lampBulb);
    const stamp = new Group();
    const [sx, sy, sz] = FURNITURE.stamp;
    stamp.position.set(sx, sy, sz);
    const stampHandle = meshOf(reg, new CylinderGeometry(0.035, 0.05, 0.18, 10), m.robotDark);
    stampHandle.position.set(0, 0.2, 0);
    const stampKnob = meshOf(reg, new SphereGeometry(0.06, 10, 8), m.robotDark);
    stampKnob.position.set(0, 0.31, 0);
    const stampBlock = meshOf(reg, new BoxGeometry(0.2, 0.08, 0.14), m.shirts.execution);
    stampBlock.position.set(0, 0.08, 0);
    stamp.add(stampHandle, stampKnob, stampBlock);
    group.add(stamp);
    batch.add(m.frame, box(0.24, 0.012, 0.18, [sx, sy + 0.006, sz]));
    for (const tray of [FURNITURE.trays.sent, FURNITURE.trays.returned]) {
        batch.add(m.metal, box(0.42, 0.015, 0.3, [tray[0], tray[1] + 0.008, tray[2]]));
        batch.add(m.metal, box(0.42, 0.06, 0.015, [tray[0], tray[1] + 0.03, tray[2] - 0.15]));
    }

    // The chute to the exchange: a brass tube with a mouth, a flap, and the market lamp on top.
    const chute = FURNITURE.chute;
    batch.add(m.brass, cylinder(chute.radius, chute.radius, WALL_H, [chute.center[0], WALL_H / 2, chute.center[2]], 18));
    batch.add(m.brass, cylinder(chute.radius + 0.06, chute.radius + 0.06, 0.12, [chute.center[0], 0.06, chute.center[2]], 18));
    const mouth = new BoxGeometry(0.5, 0.42, 0.56);
    mouth.translate(chute.mouth[0] + 0.12, chute.mouth[1], chute.mouth[2]);
    batch.add(m.robotDark, mouth);
    const marketLamp = meshOf(reg, new SphereGeometry(0.16, 14, 10), m.marketLamp);
    marketLamp.position.set(chute.center[0], WALL_H + 0.2, chute.center[2]);
    group.add(marketLamp);

    // A brand ring the scene puts under the seat that is picked.
    const pickRing = meshOf(reg, new TorusGeometry(0.72, 0.04, 8, 40), m.ring);
    pickRing.rotation.x = Math.PI / 2;
    pickRing.visible = false;
    group.add(pickRing);

    batch.build(group);
    return {group, glows, gaugeNeedles, clockHands, planBars, printerStrip: strip, lampBulb, marketLamp, stamp, issueCard, riskLampBulbs, brewLight, ring: pickRing};
};

// ---- the city below and the sky ------------------------------------------------------------------

export type City = {group: Group; stars: Points};

export const CITY_GROUND_Y = -38;

export const buildCity = (reg: Registry, m: OfficeMaterials): City => {
    const group = new Group();
    const ground = new Mesh(register(reg, new PlaneGeometry(900, 900)), m.city);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = CITY_GROUND_Y;
    group.add(ground);

    // Towers round the floor, behind it and far to the sides, none in front of the camera: the
    // nearer ones stay well below floor 12, the far ones rise past it to make a skyline.
    const spots: {x: number; z: number; w: number; d: number; top: number}[] = [];
    for (let i = 0; spots.length < 90 && i < 900; i += 1) {
        const h = hashString(`tower:${i}`);
        const angle = Math.PI + ((h % 3600) / 3600) * Math.PI;
        const radius = 52 + ((h >>> 12) % 140);
        const x = Math.cos(angle) * radius * 1.3;
        const z = Math.sin(angle) * radius - 10;
        if (z > -22 && Math.abs(x) < 80) continue;
        const w = 3.5 + ((h >>> 5) % 6);
        const d = 3.5 + ((h >>> 9) % 6);
        const ceiling = -34 + (radius - 50) * 0.22;
        const top = Math.min(ceiling, -30 + ((h >>> 3) % 34));
        if (top < CITY_GROUND_Y + 5) continue;
        if (spots.some((s) => Math.abs(s.x - x) < (s.w + w) / 2 + 2 && Math.abs(s.z - z) < (s.d + d) / 2 + 2)) continue;
        spots.push({x, z, w, d, top});
    }
    const towers = new InstancedMesh(register(reg, new BoxGeometry(1, 1, 1)), m.tower, spots.length);
    const matrix = new Matrix4();
    spots.forEach((spot, i) => {
        const height = spot.top - CITY_GROUND_Y;
        matrix.makeScale(spot.w, height, spot.d);
        matrix.setPosition(spot.x, CITY_GROUND_Y + height / 2, spot.z);
        towers.setMatrixAt(i, matrix);
    });
    towers.instanceMatrix.needsUpdate = true;
    group.add(towers);

    // Stars on a dome, seen only at night.
    const positions: number[] = [];
    for (let i = 0; i < 260; i += 1) {
        const h = hashString(`star:${i}`);
        const theta = ((h % 1000) / 1000) * Math.PI * 2;
        const phi = 0.15 + (((h >>> 10) % 1000) / 1000) * 1.1;
        const r = 260;
        positions.push(Math.cos(theta) * Math.cos(phi) * r, Math.sin(phi) * r * 0.9 + 20, Math.sin(theta) * Math.cos(phi) * r - 60);
    }
    const geometry = register(reg, new BufferGeometry());
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const stars = new Points(geometry, m.stars);
    group.add(stars);
    return {group, stars};
};

// The sky as a vertical gradient, top to horizon.
export const drawSky = (canvas: HTMLCanvasElement, top: Color, low: Color) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const css = (c: Color) => `#${c.getHexString(SRGBColorSpace)}`;
    g.addColorStop(0, css(top));
    g.addColorStop(0.62, css(low));
    g.addColorStop(1, css(low));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
};

export const createSkyTexture = (reg: Registry): {canvas: HTMLCanvasElement; texture: CanvasTexture} => {
    const canvas = canvasOf(4, 256);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    reg.textures.push(texture);
    return {canvas, texture};
};

// ---- the workers ---------------------------------------------------------------------------------

export type WorkerRig = {
    id: WorkerId;
    index: number;
    seat: OfficeSeat;
    root: Group;
    body: Group;
    head: Group;
    armL: Group;
    armR: Group;
    cup: Mesh;
    diamond: Mesh;
    check: Group;
    screen: Mesh | null;
    pickables: Object3D[];
};

const SHOULDER_Y = 0.56;

// One worker: a shirt-coloured body, a head with a dark cap and a face, two arms that type, a status
// diamond floating over the head, a check mark for a filing, the seat's screen, and its prop.
export const buildWorker = (reg: Registry, m: OfficeMaterials, seat: OfficeSeat, index: number, shared: Record<string, BufferGeometry>): WorkerRig => {
    const shirt = m.shirts[shirtOf(seat.id)];
    const root = new Group();
    root.position.set(seat.seat[0], seat.seat[1], seat.seat[2]);
    root.rotation.y = seat.yaw;
    const standing = seat.standing;
    const body = new Group();
    body.position.set(0, standing ? 0.86 : RIG.seat, standing ? 0 : -0.04);
    root.add(body);

    const torso = new Mesh(shared.torso, shirt);
    torso.position.set(0, 0.32, 0);
    body.add(torso);
    if (standing) {
        const legs = new Mesh(shared.legsStanding, m.pants);
        legs.position.set(0, -0.43, 0);
        body.add(legs);
    } else {
        const thighs = new Mesh(shared.thighs, m.pants);
        thighs.position.set(0, 0.04, 0.2);
        body.add(thighs);
        const shins = new Mesh(shared.shins, m.pants);
        shins.position.set(0, -0.2, 0.42);
        body.add(shins);
    }

    const head = new Group();
    head.position.set(0, 0.66, 0);
    body.add(head);
    const skull = new Mesh(shared.head, m.skin);
    skull.position.set(0, 0.21, 0);
    head.add(skull);
    const cap = new Mesh(shared.cap, m.robotDark);
    cap.position.set(0, 0.43, -0.015);
    head.add(cap);
    const face = new Mesh(shared.face, m.eyes);
    face.position.set(0, 0.21, 0.196);
    head.add(face);

    const arm = (side: -1 | 1) => {
        const group = new Group();
        group.position.set(side * 0.31, SHOULDER_Y, 0.02);
        const limb = new Mesh(shared.arm, shirt);
        limb.position.set(0, 0, 0.22);
        group.add(limb);
        const hand = new Mesh(shared.hand, m.skin);
        hand.position.set(0, 0, 0.46);
        group.add(hand);
        group.rotation.x = 0.62;
        body.add(group);
        return group;
    };
    const armL = arm(-1);
    const armR = arm(1);
    // A mug the right hand lifts when the seat takes a sip.
    const cup = new Mesh(shared.cup, m.paper);
    cup.position.set(0, 0.06, 0.5);
    cup.visible = false;
    armR.add(cup);

    const diamond = new Mesh(shared.diamond, m.diamonds.get(seat.id) as MeshBasicMaterial);
    diamond.position.set(0, RIG.headTop + (standing ? RIG.standingLift : 0) + 0.38, 0);
    root.add(diamond);

    const check = new Group();
    const tickA = new Mesh(shared.tickShort, m.check);
    tickA.position.set(-0.07, 0, 0);
    tickA.rotation.z = Math.PI / 4;
    const tickB = new Mesh(shared.tickLong, m.check);
    tickB.position.set(0.08, 0.06, 0);
    tickB.rotation.z = -Math.PI / 4.5;
    check.add(tickA, tickB);
    check.position.set(0, RIG.headTop + (standing ? RIG.standingLift : 0) + 0.72, 0);
    check.scale.setScalar(0.001);
    check.visible = false;
    root.add(check);

    const shadow = new Mesh(shared.shadow, m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.012, 0);
    root.add(shadow);

    // The seat's screen (the main monitor's face), lit by its status.
    let screen: Mesh | null = null;
    const hasScreen = seat.zone === 'bullpen' || seat.zone === 'trading' || seat.zone === 'risk' || seat.id === 'portfolio-manager';
    if (hasScreen) {
        screen = new Mesh(shared.screen, m.screens.get(seat.id) as MeshBasicMaterial);
        const x = seat.id === 'portfolio-manager' ? 0.45 : 0;
        screen.position.set(x, RIG.deskTop + 0.3, seat.id === 'portfolio-manager' ? 1.17 : 1.17);
        screen.rotation.y = Math.PI + (seat.id === 'portfolio-manager' ? 0.2 : 0);
        root.add(screen);
    }

    for (const part of [torso, skull, cap]) part.userData.worker = seat.id;
    addProp(reg, m, seat, {root, body, head, armL, armR});
    return {id: seat.id, index, seat, root, body, head, armL, armR, cup, diamond, check, screen, pickables: [torso, skull, cap]};
};

export const createSharedGeometry = (reg: Registry): Record<string, BufferGeometry> => {
    const keep = <T extends BufferGeometry>(g: T) => register(reg, g);
    const face = (() => {
        const parts = [box(0.07, 0.09, 0.02, [-0.09, 0.03, 0]), box(0.07, 0.09, 0.02, [0.09, 0.03, 0]), box(0.13, 0.025, 0.02, [0, -0.08, 0])];
        const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false) as BufferGeometry;
        for (const p of parts) p.dispose();
        return merged;
    })();
    return {
        torso: keep(new RoundedBoxGeometry(0.52, 0.62, 0.32, 2, 0.08)),
        thighs: keep(new BoxGeometry(0.42, 0.15, 0.46)),
        shins: keep(new BoxGeometry(0.38, 0.44, 0.15)),
        legsStanding: keep(new BoxGeometry(0.4, 0.86, 0.2)),
        head: keep(new RoundedBoxGeometry(0.4, 0.4, 0.38, 2, 0.07)),
        cap: keep(new BoxGeometry(0.42, 0.1, 0.4)),
        face: keep(face),
        arm: keep(new BoxGeometry(0.12, 0.12, 0.44)),
        hand: keep(new BoxGeometry(0.11, 0.1, 0.1)),
        cup: keep(new CylinderGeometry(0.05, 0.045, 0.1, 10)),
        diamond: keep(new OctahedronGeometry(0.12, 0)),
        tickShort: keep(new BoxGeometry(0.16, 0.045, 0.045)),
        tickLong: keep(new BoxGeometry(0.3, 0.045, 0.045)),
        shadow: keep(new CircleGeometry(0.62, 20)),
        screen: keep(new PlaneGeometry(0.6, 0.36)),
    };
};

type RigParts = {root: Group; body: Group; head: Group; armL: Group; armR: Group};

// Each seat's one prop, attached where it reads from afar.
const addProp = (reg: Registry, m: OfficeMaterials, seat: OfficeSeat, parts: RigParts) => {
    const add = (parent: Object3D, geometry: BufferGeometry, material: Material, at: Vec3, rot: Vec3 = [0, 0, 0]) => {
        const mesh = meshOf(reg, geometry, material);
        mesh.position.set(at[0], at[1], at[2]);
        mesh.rotation.set(rot[0], rot[1], rot[2]);
        parent.add(mesh);
        return mesh;
    };
    switch (seat.prop) {
        case 'monitors':
            // The side screens of the three: lit with the main one, from the scene.
            break;
        case 'headset':
            add(parts.head, new TorusGeometry(0.22, 0.025, 6, 18, Math.PI), m.robotDark, [0, 0.24, 0], [0, Math.PI / 2, 0]);
            add(parts.head, new BoxGeometry(0.06, 0.12, 0.1), m.robotDark, [-0.22, 0.2, 0]);
            add(parts.head, new BoxGeometry(0.06, 0.12, 0.1), m.robotDark, [0.22, 0.2, 0]);
            add(parts.head, new BoxGeometry(0.02, 0.02, 0.16), m.robotDark, [-0.2, 0.12, 0.12], [0.3, 0, 0]);
            break;
        case 'newspaper':
            add(parts.armL, new BoxGeometry(0.34, 0.26, 0.012), m.paper, [0.12, 0.08, 0.5], [-0.5, 0, 0.15]);
            break;
        case 'calculator': {
            const calc = new Group();
            add(calc, new BoxGeometry(0.16, 0.025, 0.22), m.robotDark, [0, 0, 0]);
            add(calc, new BoxGeometry(0.12, 0.004, 0.06), m.screens.get(seat.id) as Material, [0, 0.014, -0.06]);
            calc.position.set(0.42, RIG.deskTop + 0.013, 0.55);
            calc.rotation.y = -0.3;
            parts.root.add(calc);
            for (let i = 0; i < 3; i += 1) add(parts.root, new BoxGeometry(0.07, 0.3, 0.24), i === 1 ? m.paper : m.binder, [-0.6 + i * 0.08, RIG.deskTop + 0.15, 1.0]);
            break;
        }
        case 'bull': {
            const fig = new Group();
            add(fig, new BoxGeometry(0.2, 0.1, 0.12), m.brass, [0, 0.05, 0]);
            add(fig, new ConeGeometry(0.025, 0.09, 6), m.paper, [-0.07, 0.13, 0.05], [0, 0, 0.6]);
            add(fig, new ConeGeometry(0.025, 0.09, 6), m.paper, [0.07, 0.13, 0.05], [0, 0, -0.6]);
            fig.position.set(0, RIG.deskTop, 0.95);
            parts.root.add(fig);
            break;
        }
        case 'bear': {
            const fig = new Group();
            add(fig, new BoxGeometry(0.2, 0.1, 0.12), m.robotDark, [0, 0.05, 0]);
            add(fig, new SphereGeometry(0.035, 8, 6), m.robotDark, [-0.07, 0.12, 0.03]);
            add(fig, new SphereGeometry(0.035, 8, 6), m.robotDark, [0.07, 0.12, 0.03]);
            fig.position.set(0, RIG.deskTop, 0.95);
            parts.root.add(fig);
            break;
        }
        case 'glasses':
            add(parts.head, new TorusGeometry(0.055, 0.012, 6, 16), m.robotDark, [-0.09, 0.24, 0.2]);
            add(parts.head, new TorusGeometry(0.055, 0.012, 6, 16), m.robotDark, [0.09, 0.24, 0.2]);
            add(parts.head, new BoxGeometry(0.06, 0.012, 0.012), m.robotDark, [0, 0.25, 0.2]);
            break;
        case 'visor':
            add(parts.head, new BoxGeometry(0.44, 0.02, 0.2), m.shirts.trading, [0, 0.38, 0.24], [0.12, 0, 0]);
            break;
        case 'lamp-tall':
        case 'lamp-banker':
        case 'lamp-disc':
            // The lamps stand on the bench (the room builds them, the scene lights them).
            break;
        case 'tie':
            add(parts.body, new BoxGeometry(0.08, 0.36, 0.02), m.robotDark, [0, 0.38, 0.165]);
            add(parts.body, new BoxGeometry(0.12, 0.06, 0.02), m.robotDark, [0, 0.56, 0.165]);
            break;
        case 'bell':
            add(parts.body, new BoxGeometry(0.03, 0.34, 0.01), m.shirts.head, [0, 0.42, 0.166]);
            add(parts.body, new BoxGeometry(0.12, 0.16, 0.012), m.paper, [0, 0.22, 0.17]);
            break;
        case 'stamp':
            add(parts.head, new BoxGeometry(0.44, 0.06, 0.42), m.shirts.execution, [0, 0.47, -0.01]);
            break;
    }
};

// The side screens of the market analyst's three monitors share its screen material.
export const buildSideScreens = (reg: Registry, m: OfficeMaterials, seat: OfficeSeat, shared: Record<string, BufferGeometry>, rig: WorkerRig) => {
    if (seat.prop !== 'monitors') return;
    for (const side of [-1, 1] as const) {
        const screen = new Mesh(shared.screen, m.screens.get(seat.id) as MeshBasicMaterial);
        screen.scale.set(0.76, 1, 1);
        screen.position.set(side * 0.62, RIG.deskTop + 0.3, 1.05);
        screen.rotation.y = Math.PI - side * 0.5;
        rig.root.add(screen);
    }
};

// ---- things that travel ------------------------------------------------------------------------

export const buildPlaneGeometry = (reg: Registry): BufferGeometry => {
    // A folded paper plane: a nose, two wing tips and a keel, nose toward +z.
    const nose = [0, 0, 0.22];
    const left = [-0.16, 0.02, -0.16];
    const right = [0.16, 0.02, -0.16];
    const keel = [0, -0.06, -0.14];
    const tail = [0, 0.01, -0.16];
    const positions = [...nose, ...left, ...tail, ...nose, ...tail, ...right, ...nose, ...keel, ...tail];
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return register(reg, g);
};

export type Robot = {group: Group; body: Group; tray: Mesh; antenna: Mesh; eyes: Mesh; wheels: Mesh[]};

// The courier: the chat's robot in three dimensions (components/chat/RobotMascot.tsx), a rounded head
// with an antenna whose tip glows, two eyes and a smile, on a little wheeled body with a tray.
export const buildRobot = (reg: Registry, m: OfficeMaterials): Robot => {
    const group = new Group();
    const body = new Group();
    group.add(body);
    const add = (parent: Object3D, geometry: BufferGeometry, material: Material, at: Vec3, rot: Vec3 = [0, 0, 0]) => {
        const mesh = meshOf(reg, geometry, material);
        mesh.position.set(at[0], at[1], at[2]);
        mesh.rotation.set(rot[0], rot[1], rot[2]);
        parent.add(mesh);
        return mesh;
    };
    add(body, new RoundedBoxGeometry(0.62, 0.5, 0.5, 2, 0.1), m.robot, [0, 0.42, 0]);
    const tray = add(body, new BoxGeometry(0.5, 0.06, 0.34), m.paper, [0, 0.7, 0.05]);
    tray.visible = false;
    add(body, new RoundedBoxGeometry(0.66, 0.56, 0.54, 3, 0.16), m.robot, [0, 1.02, 0]);
    add(body, new BoxGeometry(0.5, 0.36, 0.02), m.robotDark, [0, 1.02, 0.271]);
    const eyes = add(body, (() => {
        const parts = [box(0.08, 0.14, 0.02, [-0.11, 0.03, 0]), box(0.08, 0.14, 0.02, [0.11, 0.03, 0])];
        const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false) as BufferGeometry;
        for (const p of parts) p.dispose();
        return merged;
    })(), m.ring, [0, 1.04, 0.284]);
    add(body, new TorusGeometry(0.09, 0.016, 6, 14, Math.PI * 0.8), m.ring, [0, 0.95, 0.284], [0, 0, Math.PI * 1.1]);
    add(body, new CylinderGeometry(0.06, 0.06, 0.16, 10), m.metal, [-0.36, 1.02, 0], [0, 0, Math.PI / 2]);
    add(body, new CylinderGeometry(0.06, 0.06, 0.16, 10), m.metal, [0.36, 1.02, 0], [0, 0, Math.PI / 2]);
    add(body, new CylinderGeometry(0.018, 0.018, 0.2, 6), m.metal, [0, 1.4, 0]);
    const antenna = add(body, new SphereGeometry(0.06, 10, 8), m.ring, [0, 1.52, 0]);
    const wheels = [-1, 1].map((side) => add(group, new CylinderGeometry(0.15, 0.15, 0.08, 14), m.robotDark, [side * 0.26, 0.15, 0], [0, 0, Math.PI / 2]));
    const shadow = add(group, new CircleGeometry(0.5, 18), m.shadow, [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
    shadow.renderOrder = 1;
    group.position.set(FURNITURE.dock[0], 0, FURNITURE.dock[2]);
    return {group, body, tray, antenna, eyes, wheels};
};

export const buildCard = (reg: Registry, m: OfficeMaterials, shared: {card?: BufferGeometry}): Mesh => {
    shared.card ??= register(reg, new BoxGeometry(0.34, 0.24, 0.012));
    const card = new Mesh(shared.card, m.paper);
    const pin = new Mesh(register(reg, new SphereGeometry(0.025, 8, 6)), m.ring);
    pin.position.set(0, 0.09, 0.012);
    card.add(pin);
    card.visible = false;
    return card;
};

export const CARD_POOL = CORK_SLOTS;
