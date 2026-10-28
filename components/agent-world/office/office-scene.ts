// The office in three.js: floor 12 of a tower, its fourteen seats animated from the office state
// (lib/agent-world/office.ts), the courier robot, the paper planes to the data shelves, the cards,
// the stamp and the tickets down the chute, under the New York sky. Loaded on demand by
// components/agent-world/office/OfficeStage.tsx, the way the brain's graph and the landing terrain
// load theirs, with the same contract: a factory returning a handle, no React inside, the words
// all HTML placed over the canvas by this module, drawing only while something moves.
//
// State arrives through setState and is diffed, never rebuilt. The scene keeps its own clock
// (`sceneNow`, the state's time carried forward at the replay's rate between ticks), so a plane or
// a pose is a function of the state and that clock; only the robot's errands and the short blends
// between poses remember anything. With motion reduced every state is drawn at its end: nothing
// loops, flies or walks, and every bubble, tag, card and stamp still shows.

import {
    AmbientLight,
    Color,
    DirectionalLight,
    Fog,
    HemisphereLight,
    Mesh,
    PerspectiveCamera,
    Raycaster,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer,
    type MeshBasicMaterial,
    type Object3D,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {WORKER_IDS, type WorkerId, type WorkerStatus} from '@/lib/agent-world/config';
import type {OfficeFlow, OfficeState, OfficeWorker} from '@/lib/agent-world/office';
import {
    arcPath,
    arcPoint,
    CAMERA_LIMITS,
    corkSlot,
    CORK_SLOTS,
    FURNITURE,
    gagOffset,
    GAG_MS,
    GAG_PERIOD_MS,
    headTop,
    idleGag,
    OFFICE_PRESETS,
    OFFICE_SEATS,
    OFFICE_ZONES,
    pathLength,
    pathPoint,
    presetForSeat,
    seatOf,
    shelfFront,
    skyMix,
    TARGET_BOUNDS,
    walkPath,
    type Arc,
    type OfficePresetId,
    type Vec3,
} from '@/lib/agent-world/office-layout';
import {
    buildCard,
    buildCity,
    buildPlaneGeometry,
    buildRobot,
    buildRoom,
    buildSideScreens,
    buildWorker,
    createMaterials,
    createRegistry,
    createSharedGeometry,
    createSkyTexture,
    drawSky,
    recolor,
    toColor,
    type WorkerRig,
} from '@/components/agent-world/office/office-build';
import type {OfficePalette} from '@/components/agent-world/office/office-tokens';

export type OfficeDaylight = {etMinutes: number; marketOpen: boolean};
export type OfficeOverlay = {id: string; element: HTMLElement | null};
export type OfficeCameraInfo = {preset: OfficePresetId | null; distance: number};

export type OfficeSceneOptions = {
    canvas: HTMLCanvasElement;
    palette: OfficePalette;
    reduceMotion: boolean;
    coarsePointer: boolean;
    // The wheel zooms at once (the page does not scroll); else only with Ctrl or ⌘, or once grabbed.
    wheelZoom: boolean;
    initial: {state: OfficeState; now: number; rate: number; daylight: OfficeDaylight};
    follow: boolean;
    onHover: (id: WorkerId | null) => void;
    onPick: (id: WorkerId) => void;
    onFollowChange: (on: boolean) => void;
    onCamera: (info: OfficeCameraInfo) => void;
    onDrawn?: (frames: number, calls: number) => void;
    overlays: () => readonly OfficeOverlay[];
};

export type OfficeScene = {
    setState: (state: OfficeState, nowMs: number, rate: number) => void;
    setDaylight: (daylight: OfficeDaylight) => void;
    setHover: (id: WorkerId | null) => void;
    setSelected: (id: WorkerId | null) => void;
    setPreset: (preset: OfficePresetId) => void;
    setFollow: (on: boolean) => void;
    zoom: (factor: number) => void;
    setPalette: (palette: OfficePalette) => void;
    setReduceMotion: (reduce: boolean) => void;
    setActive: (active: boolean) => void;
    dispose: () => void;
};

// Wall-clock durations (ms) of the things that travel; in a replay they cover the same screen time.
const FLY_OUT_MS = 950;
const HOP_MS = 650;
const FLY_BACK_MS = 900;
const CARD_MS = 1100;
const TICKET_MS = 1000;
const BOUNCE_MS = 700;
const BLEND_MS = 350;
const PRESET_MS = 1100;
const FOLLOW_DWELL_MS = 3500;
const ROBOT_SPEED = 3.4; // m per second of the wall clock
const ROBOT_PAUSE_MS = 380;
const ROBOT_HOME_AFTER_MS = 4500;
const ROBOT_QUEUE = 3;
const PLANE_POOL = 12;
const CLICK_SLOP_PX = 5;
const OVERLAP_PAD = 4;
const clamp = (value: number, low: number, high: number) => (high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value)));
const PLATE_ROWS = 3;
const PLATE_GAP = 6;
// Where a plate may slide to, as a share of its width, before it climbs a row.
const PLATE_SHIFTS = [0, 0.3, -0.3];
const BUBBLE_GAP = 10;
const EDGE_PAD = 6;
// The chips drawn centred over their anchor and above it, kept inside the stage.
const CENTRED_CHIPS: ReadonlySet<string> = new Set(['issue', 'cork', 'stamp', 'returned', 'bin', 'lamp']);
// Where a bubble may slide to, as a share of its width, before it climbs a row.
const BUBBLE_SHIFTS = [0, -0.35, 0.35, -0.7, 0.7];
const AMBIENT_FRAME_MS = 33;
// Half the width the overview keeps in view: the floor's 40 m and a margin.
const OVERVIEW_HALF_WIDTH = 21.5;

type Pose = {lean: number; swivel: number; headPitch: number; headYaw: number; armL: number; armR: number; armOut: number; cup: number};
const REST: Pose = {lean: 0, swivel: 0, headPitch: 0, headYaw: 0, armL: 0.62, armR: 0.62, armOut: 0, cup: 0};
const POSE_KEYS = Object.keys(REST) as (keyof Pose)[];

type Seat = {
    rig: WorkerRig;
    worker: OfficeWorker | null;
    status: WorkerStatus;
    changedAt: number; // wall ms
    pose: Pose;
    from: Pose;
    checkAt: number | null;
};

type PlaneRun = {
    id: string;
    mesh: Mesh;
    role: WorkerId;
    vendors: string[];
    open: boolean;
    at: number;
    landedAt: number | null;
    key: string;
};

type Errand = {id: string; from: WorkerId; to: WorkerId[]};

const smooth = (t: number) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};
const easeOutBack = (t: number) => {
    const x = Math.min(1, Math.max(0, t));
    const c = 1.70158;
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};
const v3 = (p: Vec3, out = new Vector3()) => out.set(p[0], p[1], p[2]);
const ACTIVE: ReadonlySet<WorkerStatus> = new Set(['working', 'fetching', 'talking']);

export const createOfficeScene = (options: OfficeSceneOptions): OfficeScene => {
    const {canvas} = options;
    const reg = createRegistry();
    let palette = options.palette;
    let reduceMotion = options.reduceMotion;

    const renderer = new WebGLRenderer({canvas, antialias: true, powerPreference: 'low-power', alpha: false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.coarsePointer ? 1.5 : 2));
    const scene = new Scene();
    const camera = new PerspectiveCamera(CAMERA_LIMITS.fov, 1, 0.1, 600);
    const sky = createSkyTexture(reg);
    scene.background = sky.texture;
    scene.fog = new Fog(0xdddddd, 52, 190);

    const hemi = new HemisphereLight(0xffffff, 0x888888, 1.4);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(-18, 38, 26);
    const ambient = new AmbientLight(0xfff1dc, 0.4);
    scene.add(hemi, sun, ambient);

    const m = createMaterials(reg, palette);
    m.stars.fog = false;
    const room = buildRoom(reg, m);
    scene.add(room.group);
    const city = buildCity(reg, m);
    scene.add(city.group);
    const shared = createSharedGeometry(reg);
    const seats = new Map<WorkerId, Seat>();
    OFFICE_SEATS.forEach((seatDef, index) => {
        const rig = buildWorker(reg, m, seatDef, index, shared);
        buildSideScreens(reg, m, seatDef, shared, rig);
        scene.add(rig.root);
        seats.set(seatDef.id, {rig, worker: null, status: 'idle', changedAt: -1e9, pose: {...REST}, from: {...REST}, checkAt: null});
    });
    const pickables: Object3D[] = [...seats.values()].flatMap((s) => s.rig.pickables);

    const planeGeometry = buildPlaneGeometry(reg);
    const planes: Mesh[] = Array.from({length: PLANE_POOL}, () => {
        const mesh = new Mesh(planeGeometry, m.paper);
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
    });
    const robot = buildRobot(reg, m);
    scene.add(robot.group);
    const cardShared: {card?: import('three').BufferGeometry} = {};
    const cards: Mesh[] = Array.from({length: CORK_SLOTS}, () => {
        const card = buildCard(reg, m, cardShared);
        scene.add(card);
        return card;
    });
    const tickets: Mesh[] = Array.from({length: 6}, () => {
        const ticket = new Mesh(cardShared.card, m.paper);
        ticket.scale.set(0.8, 0.8, 1);
        ticket.visible = false;
        scene.add(ticket);
        return ticket;
    });

    // ---- clocks ----
    let state = options.initial.state;
    let stateNow = options.initial.now;
    let stateWall = performance.now();
    let rate = Math.max(1, options.initial.rate);
    let daylight = options.initial.daylight;
    const sceneNow = (wall: number) => stateNow + (wall - stateWall) * (state.mode === 'replay' ? rate : 1);
    const span = (wallMs: number) => wallMs * (state.mode === 'replay' ? rate : 1);

    // ---- loop bookkeeping ----
    let raf = 0;
    let active = true;
    let disposed = false;
    let dirty = true;
    let frames = 0;
    let lastDraw = 0;
    let wake: ReturnType<typeof setTimeout> | null = null;

    // ---- camera and controls ----
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.enablePan = !options.coarsePointer;
    controls.enableZoom = options.wheelZoom;
    controls.zoomSpeed = 0.8;
    controls.minDistance = CAMERA_LIMITS.minDistance;
    controls.maxDistance = CAMERA_LIMITS.maxDistance;
    controls.minPolarAngle = CAMERA_LIMITS.minPolar;
    controls.maxPolarAngle = CAMERA_LIMITS.maxPolar;
    controls.minAzimuthAngle = -CAMERA_LIMITS.maxAzimuth;
    controls.maxAzimuthAngle = CAMERA_LIMITS.maxAzimuth;
    controls.enabled = !options.coarsePointer;
    canvas.style.touchAction = 'pan-y';

    let preset: OfficePresetId | null = 'overview';
    let cameraTouched = false;
    let tween: {fromPos: Vector3; fromTarget: Vector3; toPos: Vector3; toTarget: Vector3; start: number; ms: number} | null = null;
    let follow = options.follow;
    let lastFollowAt = -1e9;
    let followFocus: WorkerId | null = null;
    let reportedDistance = -1;

    // A preset's camera. The overview stands back exactly as far as the floor's width needs at this
    // screen's aspect; a zone's preset is pulled back a little on a narrow screen.
    const presetPose = (id: OfficePresetId): {position: Vector3; target: Vector3} => {
        const {target, position} = OFFICE_PRESETS[id];
        const t = v3(target);
        const offset = v3(position).sub(t);
        const aspect = camera.aspect || 16 / 9;
        if (id === 'overview') {
            const halfFov = Math.atan(Math.tan((CAMERA_LIMITS.fov * Math.PI) / 360) * aspect);
            const distance = Math.min(CAMERA_LIMITS.maxDistance, Math.max(26, OVERVIEW_HALF_WIDTH / Math.tan(halfFov)));
            offset.setLength(distance);
        } else {
            offset.multiplyScalar(Math.max(1, ((16 / 9) / aspect) ** 0.6));
            if (offset.length() > CAMERA_LIMITS.maxDistance) offset.setLength(CAMERA_LIMITS.maxDistance);
        }
        return {position: offset.add(t), target: t};
    };

    const goTo = (id: OfficePresetId, ms = PRESET_MS) => {
        const pose = presetPose(id);
        preset = id;
        if (reduceMotion || ms <= 0) {
            camera.position.copy(pose.position);
            controls.target.copy(pose.target);
            tween = null;
        } else {
            tween = {fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: pose.position, toTarget: pose.target, start: performance.now(), ms};
        }
        options.onCamera({preset, distance: camera.position.distanceTo(controls.target)});
        dirty = true;
        schedule();
    };

    const clampTarget = () => {
        const t = controls.target;
        const x = Math.min(TARGET_BOUNDS.maxX, Math.max(TARGET_BOUNDS.minX, t.x));
        const y = Math.min(TARGET_BOUNDS.maxY, Math.max(TARGET_BOUNDS.minY, t.y));
        const z = Math.min(TARGET_BOUNDS.maxZ, Math.max(TARGET_BOUNDS.minZ, t.z));
        if (x !== t.x || y !== t.y || z !== t.z) {
            camera.position.x += x - t.x;
            camera.position.y += y - t.y;
            camera.position.z += z - t.z;
            t.set(x, y, z);
        }
    };

    const onStart = () => {
        tween = null;
        cameraTouched = true;
        if (preset !== null) {
            preset = null;
            options.onCamera({preset, distance: camera.position.distanceTo(controls.target)});
        }
        if (follow) {
            follow = false;
            options.onFollowChange(false);
        }
    };
    const onChange = () => {
        dirty = true;
        schedule();
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('change', onChange);

    // The wheel, when the page might scroll: Ctrl or ⌘ zooms, or a grabbed floor.
    let engaged = false;
    const zoomBy = (factor: number) => {
        const offset = camera.position.clone().sub(controls.target);
        const length = Math.min(CAMERA_LIMITS.maxDistance, Math.max(CAMERA_LIMITS.minDistance, offset.length() * factor));
        camera.position.copy(controls.target).add(offset.setLength(length));
        cameraTouched = true;
        dirty = true;
        schedule();
    };
    const onWheel = (event: WheelEvent) => {
        if (options.wheelZoom) return;
        if (!(event.ctrlKey || event.metaKey || engaged)) return;
        event.preventDefault();
        zoomBy(1 + Math.sign(event.deltaY) * 0.1);
    };
    canvas.addEventListener('wheel', onWheel, {passive: false});

    // ---- picking ----
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let pending: {x: number; y: number} | null = null;
    let press: {x: number; y: number} | null = null;
    let hovered: WorkerId | null = null;
    let labelHover: WorkerId | null = null;
    let selected: WorkerId | null = null;
    const local = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    };
    const pick = (point: {x: number; y: number}): WorkerId | null => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) return null;
        ndc.set((point.x / width) * 2 - 1, -(point.y / height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(pickables, false)[0];
        return hit ? (hit.object.userData.worker as WorkerId) : null;
    };
    const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        pending = local(event);
        schedule();
    };
    const onPointerDown = (event: PointerEvent) => {
        engaged = true;
        press = {x: event.clientX, y: event.clientY};
    };
    const onPointerUp = (event: PointerEvent) => {
        const start = press;
        press = null;
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
        const hit = pick(local(event));
        if (hit !== null) options.onPick(hit);
    };
    const onPointerLeave = () => {
        engaged = false;
        pending = null;
        press = null;
        if (hovered !== null && labelHover === null) setHovered(null);
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    const setHovered = (id: WorkerId | null) => {
        if (hovered === id) return;
        hovered = id;
        options.onHover(id);
        dirty = true;
        schedule();
    };

    // ---- the daylight ----
    const mix = {day: 1, dusk: 0, night: 0};
    let mixFrom = {...mix};
    let mixTo = {...mix};
    let mixStart = -1;
    const MIX_MS = 1500;
    const cTop = new Color();
    const cLow = new Color();
    const tmpA = new Color();
    const tmpB = new Color();
    const blend3 = (out: Color, a: Color, b: Color, c: Color, w: {day: number; dusk: number; night: number}) =>
        out.setRGB(a.r * w.day + b.r * w.dusk + c.r * w.night, a.g * w.day + b.g * w.dusk + c.g * w.night, a.b * w.day + b.b * w.dusk + c.b * w.night);
    const applyDaylight = () => {
        const p = palette;
        blend3(cTop, toColor(p.skyDay, new Color()), toColor(p.skyDusk, new Color()), toColor(p.skyNight, new Color()), mix);
        blend3(cLow, toColor(p.skyDayLow, new Color()), toColor(p.skyDuskLow, new Color()), toColor(p.skyNightLow, new Color()), mix);
        drawSky(sky.canvas, cTop, cLow);
        sky.texture.needsUpdate = true;
        (scene.fog as Fog).color.copy(cLow);
        hemi.color.copy(cTop).lerp(tmpA.setRGB(1, 1, 1), 0.55);
        hemi.groundColor.copy(toColor(p.floor, tmpB)).multiplyScalar(0.55);
        hemi.intensity = 1.55 * mix.day + 1.1 * mix.dusk + 0.55 * mix.night;
        sun.intensity = 1.7 * mix.day + 0.9 * mix.dusk + 0.25 * mix.night;
        sun.color.copy(tmpA.setRGB(1, 0.97, 0.9)).lerp(tmpB.setRGB(1, 0.62, 0.38), mix.dusk).lerp(tmpB.setRGB(0.55, 0.62, 0.95), mix.night);
        ambient.intensity = 0.32 + 0.55 * mix.night + 0.25 * mix.dusk;
        m.tower.emissiveIntensity = 0.95 * mix.night + 0.45 * mix.dusk;
        m.stars.opacity = mix.night * 0.9;
        toColor(daylight.marketOpen ? p.brand : p.idle, m.marketLamp.color);
        if (!daylight.marketOpen) m.marketLamp.color.multiplyScalar(0.6);
        dirty = true;
    };
    const setMixTarget = (instant: boolean) => {
        mixTo = skyMix(daylight.etMinutes);
        if (instant || reduceMotion) {
            Object.assign(mix, mixTo);
            mixStart = -1;
            applyDaylight();
        } else {
            mixFrom = {...mix};
            mixStart = performance.now();
        }
    };

    // ---- the clock on the wall ----
    const setClockHands = () => {
        const minutes = daylight.etMinutes;
        room.clockHands.minute.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
        room.clockHands.hour.rotation.z = -(((minutes / 60) % 12) / 12) * Math.PI * 2;
    };

    // ---- poses ----
    const blendOf = (seat: Seat, wall: number) => (reduceMotion ? 1 : smooth((wall - seat.changedAt) / BLEND_MS));

    const targetPose = (seat: Seat, wall: number, out: Pose) => {
        Object.assign(out, REST);
        const i = seat.rig.index;
        const loop = !reduceMotion;
        const t = wall / 1000;
        switch (seat.status) {
            case 'working':
                out.lean = 0.08;
                out.headPitch = 0.14;
                out.armL = 0.5 + (loop ? 0.09 * Math.sin(t * 15 + i) : 0);
                out.armR = 0.5 + (loop ? 0.09 * Math.sin(t * 15 + i + Math.PI) : 0);
                break;
            case 'fetching':
                out.lean = 0.02;
                out.headPitch = -0.12;
                out.armL = 0.5 + (loop ? 0.09 * Math.sin(t * 15 + i) : 0);
                out.armR = -0.95 + (loop ? 0.08 * Math.sin(t * 3 + i) : 0);
                out.armOut = 0.25;
                break;
            case 'talking':
                out.lean = -0.06;
                out.headPitch = loop ? 0.07 * Math.sin(t * 5 + i) : 0;
                out.headYaw = loop ? 0.12 * Math.sin(t * 1.7 + i) : 0;
                out.armR = 0.05 + (loop ? 0.35 * Math.sin(t * 3.4 + i) : 0);
                out.armOut = 0.2;
                break;
            case 'filed':
                out.lean = -0.08;
                out.headPitch = -0.08;
                break;
            case 'done':
                out.lean = -0.12;
                out.headPitch = -0.06;
                out.armL = 0.75;
                out.armR = 0.75;
                break;
            case 'stopped':
                out.lean = 0.12;
                out.headPitch = 0.42;
                out.armL = 1.0;
                out.armR = 1.0;
                break;
            case 'waiting':
                out.headYaw = loop ? 0.22 * Math.sin(t * 0.45 + i * 1.7) : 0;
                break;
            default:
                break;
        }
        // The desks: the Execution desk sits with folded hands while the owner decides.
        if (seat.rig.id === 'execution-desk' && seat.status === 'waiting' && state.lamp === 'awaiting') {
            out.armL = 0.95;
            out.armR = 0.95;
            out.headYaw = 0.35;
        }
        // Idle gestures, on the wall clock (they are not events), never while a seat is at it.
        if (loop && (seat.status === 'idle' || seat.status === 'waiting' || seat.status === 'done')) {
            const phase = wall - gagOffset(i);
            const slot = Math.floor(phase / GAG_PERIOD_MS);
            const u = (phase - slot * GAG_PERIOD_MS) / GAG_MS;
            if (u >= 0 && u < 1) {
                const gag = idleGag(i, slot);
                const env = Math.sin(Math.PI * u);
                if (gag === 'sip') {
                    out.armR = 0.62 + (-1.55 - 0.62) * env;
                    out.headPitch -= 0.18 * env;
                    out.cup = env > 0.05 ? 1 : 0;
                } else if (gag === 'swivel') {
                    out.swivel = 0.55 * Math.sin(2 * Math.PI * u);
                } else if (gag === 'stretch') {
                    out.armL = 0.62 + (-2.7 - 0.62) * env;
                    out.armR = 0.62 + (-2.7 - 0.62) * env;
                    out.lean -= 0.16 * env;
                }
            }
        }
    };

    const scratchPose: Pose = {...REST};
    const applyPose = (seat: Seat, wall: number) => {
        targetPose(seat, wall, scratchPose);
        const b = blendOf(seat, wall);
        for (const key of POSE_KEYS) seat.pose[key] = seat.from[key] + (scratchPose[key] - seat.from[key]) * b;
        const {rig, pose} = seat;
        rig.body.rotation.set(pose.lean, pose.swivel, 0);
        rig.head.rotation.set(pose.headPitch, pose.headYaw, 0);
        rig.armL.rotation.set(pose.armL, 0, 0);
        rig.armR.rotation.set(pose.armR, 0, -pose.armOut);
        rig.cup.visible = pose.cup > 0.5;
    };

    const statusColor = new Color();
    const paintSeat = (seat: Seat, wall: number) => {
        const p = palette;
        const diamondMat = seat.rig.diamond.material as MeshBasicMaterial;
        const screenMat = seat.rig.screen?.material as MeshBasicMaterial | undefined;
        let glow = 0.06;
        switch (seat.status) {
            case 'working':
            case 'fetching':
            case 'talking':
                toColor(p.brand, statusColor);
                glow = 1;
                break;
            case 'filed':
                toColor(p.brand, statusColor);
                glow = 0.85;
                break;
            case 'done':
                toColor(p.brand, statusColor).lerp(tmpA.setRGB(1, 1, 1), 0.45);
                glow = 0.4;
                break;
            case 'stopped':
                toColor(p.warning, statusColor);
                glow = 0.5;
                break;
            case 'waiting':
                toColor(p.idle, statusColor);
                glow = 0.14;
                break;
            default:
                toColor(p.idle, statusColor).multiplyScalar(0.75);
                glow = 0.05;
        }
        diamondMat.color.copy(statusColor);
        const pulse = !reduceMotion && seat.status === 'fetching' ? 0.7 + 0.3 * Math.sin(wall / 120) : 1;
        diamondMat.opacity = (seat.status === 'idle' ? 0.55 : 0.95) * pulse;
        if (seat.status === 'stopped' && !reduceMotion) diamondMat.opacity = Math.sin(wall / 160) > 0 ? 1 : 0.35;
        if (screenMat) {
            toColor(p.screenOff, screenMat.color).lerp(seat.status === 'stopped' ? toColor(p.warning, tmpB) : toColor(p.screenGlow, tmpB), glow);
            screenMat.color.multiplyScalar(1 + 0.25 * mix.night);
        }
    };

    const tickSeat = (seat: Seat, wall: number) => {
        applyPose(seat, wall);
        paintSeat(seat, wall);
        // The diamond turns while its seat is at it; it bobs gently always.
        const {diamond, check} = seat.rig;
        if (!reduceMotion) {
            diamond.rotation.y = (wall / 1000) * (ACTIVE.has(seat.status) ? 2.4 : 0.6) + seat.rig.index;
            diamond.position.y = headTop(seat.rig.id)[1] + 0.38 + 0.035 * Math.sin(wall / 520 + seat.rig.index);
        }
        const big = seat.rig.id === hovered || seat.rig.id === selected ? 1.35 : 1;
        diamond.scale.setScalar(big);
        // The check mark over a filing: pops in, holds while the status lasts, shrinks away.
        if (seat.status === 'filed') {
            seat.checkAt ??= wall;
            const s = reduceMotion ? 1 : easeOutBack((wall - seat.checkAt) / 420);
            check.visible = true;
            check.scale.setScalar(Math.max(0.001, s));
            if (!reduceMotion) check.rotation.y = Math.sin(wall / 700) * 0.4;
        } else if (check.visible) {
            const s = reduceMotion ? 0 : check.scale.x * 0.82;
            if (s < 0.02) {
                check.visible = false;
                seat.checkAt = null;
            } else check.scale.setScalar(s);
        }
    };

    // ---- the planes ----
    const runs = new Map<string, PlaneRun>();
    const seen = new Set<string>();
    const freePlanes = [...planes];

    type Leg = {arc: Arc; start: number; ms: number};
    const routeOf = (run: PlaneRun): {legs: Leg[]; parkedAt: Vec3 | null; end: number} => {
        const work = seatOf(run.role).work;
        const shelves = run.vendors.map((vendor) => shelfFront(vendor)).filter((p): p is Vec3 => p !== null);
        const legs: Leg[] = [];
        if (shelves.length === 0) return {legs, parkedAt: null, end: run.at};
        let at = run.at;
        legs.push({arc: arcPath(work, shelves[0], 1.6, `${run.key}:0`), start: at, ms: span(FLY_OUT_MS)});
        at += span(FLY_OUT_MS);
        if (run.open) return {legs, parkedAt: shelves[0], end: Number.POSITIVE_INFINITY};
        at = Math.max(at, run.landedAt ?? at);
        for (let i = 1; i < shelves.length; i += 1) {
            legs.push({arc: arcPath(shelves[i - 1], shelves[i], 0.7, `${run.key}:${i}`), start: at, ms: span(HOP_MS)});
            at += span(HOP_MS);
        }
        legs.push({arc: arcPath(shelves[shelves.length - 1], work, 1.4, `${run.key}:back`), start: at, ms: span(FLY_BACK_MS)});
        at += span(FLY_BACK_MS);
        return {legs, parkedAt: null, end: at};
    };

    const tangentA = new Vector3();
    const tangentB = new Vector3();
    const placePlane = (run: PlaneRun, now: number, wall: number): boolean => {
        const {legs, parkedAt, end} = routeOf(run);
        if (now >= end) return false;
        const mesh = run.mesh;
        mesh.visible = true;
        const leg = [...legs].reverse().find((l) => now >= l.start);
        if (!leg) {
            mesh.visible = false;
            return true;
        }
        const u = (now - leg.start) / leg.ms;
        if (u >= 1 && parkedAt && leg === legs[legs.length - 1]) {
            // Waiting at the shelf for the answer: a small hover.
            v3(parkedAt, mesh.position);
            mesh.position.y += 0.25 + 0.06 * Math.sin(wall / 260);
            mesh.rotation.set(0, wall / 900, 0.15 * Math.sin(wall / 400));
            return true;
        }
        const t = Math.min(1, Math.max(0, u));
        const ease = smooth(t);
        const p = arcPoint(leg.arc, ease);
        const q = arcPoint(leg.arc, Math.min(1, ease + 0.02));
        mesh.position.set(p[0], p[1], p[2]);
        tangentA.set(q[0], q[1], q[2]);
        if (tangentA.distanceToSquared(mesh.position) > 1e-8) mesh.lookAt(tangentA);
        tangentB.set(leg.arc.p1[0] - leg.arc.p0[0], 0, leg.arc.p1[2] - leg.arc.p0[2]);
        mesh.rotateZ(0.5 * Math.sin(Math.PI * t) * Math.sign(tangentB.x || 1));
        return true;
    };

    const syncPlanes = (flows: readonly OfficeFlow[], now: number) => {
        for (const flow of flows) {
            if (flow.kind !== 'fetch') continue;
            const vendors = flow.hops.map((hop) => hop.vendor);
            const existing = runs.get(flow.id);
            if (existing) {
                existing.open = flow.open;
                existing.vendors = vendors;
                existing.landedAt = flow.landedAt;
                continue;
            }
            if (seen.has(flow.id) || reduceMotion) {
                seen.add(flow.id);
                continue;
            }
            const draft: PlaneRun = {id: flow.id, mesh: planes[0], role: flow.role, vendors, open: flow.open, at: flow.at, landedAt: flow.landedAt, key: flow.id};
            if (routeOf(draft).end <= now) {
                seen.add(flow.id);
                continue;
            }
            const mesh = freePlanes.pop();
            if (!mesh) {
                seen.add(flow.id);
                continue;
            }
            draft.mesh = mesh;
            runs.set(flow.id, draft);
            seen.add(flow.id);
        }
    };

    const tickPlanes = (now: number, wall: number): boolean => {
        let moving = false;
        for (const [id, run] of runs) {
            if (placePlane(run, now, wall)) {
                moving = true;
                continue;
            }
            run.mesh.visible = false;
            freePlanes.push(run.mesh);
            runs.delete(id);
        }
        return moving;
    };

    // ---- the robot ----
    const queue: Errand[] = [];
    const errandsSeen = new Set<string>();
    let errand: {job: Errand; stops: Vec3[]; stop: number; carrying: boolean} | null = null;
    let walk: {path: Vec3[]; length: number; start: number} | null = null;
    let pauseUntil = 0;
    let idleSince = performance.now();
    let robotAt: Vec3 = [FURNITURE.dock[0], 0, FURNITURE.dock[2]];
    let robotHeading = Math.PI;
    let homeBound = false;

    const syncErrands = (flows: readonly OfficeFlow[]) => {
        for (const flow of flows) {
            if (flow.kind !== 'handoff' || errandsSeen.has(flow.id)) continue;
            errandsSeen.add(flow.id);
            if (reduceMotion) continue;
            queue.push({id: flow.id, from: flow.from, to: flow.to});
            while (queue.length > ROBOT_QUEUE) queue.shift();
        }
    };

    const startWalk = (to: Vec3, wall: number) => {
        const path = walkPath(robotAt, to);
        walk = {path, length: pathLength(path), start: wall};
    };

    const tickRobot = (wall: number): boolean => {
        if (reduceMotion) {
            robot.group.position.set(FURNITURE.dock[0], 0, FURNITURE.dock[2]);
            robot.group.rotation.y = Math.PI;
            robot.tray.visible = false;
            return false;
        }
        let moving = false;
        if (walk) {
            const distance = ((wall - walk.start) / 1000) * ROBOT_SPEED;
            const {at, heading} = pathPoint(walk.path, Math.min(distance, walk.length));
            robot.group.position.set(at[0], 0, at[2]);
            robotHeading = heading;
            robot.group.rotation.y = robotHeading;
            robot.body.position.y = 0.04 * Math.abs(Math.sin(wall / 110));
            for (const wheel of robot.wheels) wheel.rotation.x = -distance * 3;
            moving = true;
            if (distance >= walk.length) {
                robotAt = walk.path[walk.path.length - 1];
                walk = null;
                pauseUntil = wall + ROBOT_PAUSE_MS;
                robot.body.position.y = 0;
                if (errand) {
                    if (errand.stop === 0) errand.carrying = true;
                    errand.stop += 1;
                    if (errand.stop >= errand.stops.length) {
                        errand = null;
                        idleSince = wall + ROBOT_PAUSE_MS;
                    }
                } else if (homeBound) {
                    homeBound = false;
                    robot.group.rotation.y = Math.PI;
                }
            }
        } else if (wall >= pauseUntil) {
            if (errand && errand.stop < errand.stops.length) {
                startWalk(errand.stops[errand.stop], wall);
                moving = true;
            } else if (queue.length > 0) {
                const job = queue.shift() as Errand;
                errand = {job, stops: [seatOf(job.from).drop, ...job.to.map((id) => seatOf(id).drop)], stop: 0, carrying: false};
                startWalk(errand.stops[0], wall);
                moving = true;
            } else if (!homeBound && wall - idleSince > ROBOT_HOME_AFTER_MS && Math.hypot(robotAt[0] - FURNITURE.dock[0], robotAt[2] - FURNITURE.dock[2]) > 0.2) {
                homeBound = true;
                startWalk([FURNITURE.dock[0], 0, FURNITURE.dock[2]], wall);
                moving = true;
            }
        }
        robot.tray.visible = errand?.carrying === true && errand.stop > 0;
        // The eyes blink every few seconds; the antenna glows while it carries something.
        robot.eyes.scale.y = (wall % 4400) < 140 ? 0.15 : 1;
        robot.antenna.scale.setScalar(robot.tray.visible ? 1.25 + 0.15 * Math.sin(wall / 160) : 1);
        return moving || walk !== null || queue.length > 0 || errand !== null || homeBound || (wall % 4400) < 160;
    };

    // ---- cards, tickets, the stamp, the issue card, the fixtures ----
    const cardFlights = new Map<string, number>(); // symbol → flight start (scene time)
    const ticketFlights = new Map<string, {start: number; executed: boolean; slot: number}>();
    let stampAt: number | null = null;
    let lastLamp = state.lamp;
    let issueX: number | null = null;
    let issueFrom: number | null = null;
    let issueStart = 0;

    const syncFixtures = (next: OfficeState, now: number) => {
        for (const flow of next.flows) {
            if (flow.kind === 'card' && !cardFlights.has(flow.symbol) && !reduceMotion && flow.at + span(CARD_MS) > now) cardFlights.set(flow.symbol, flow.at);
            if (flow.kind === 'ticket' && !ticketFlights.has(flow.id) && !reduceMotion && flow.at + span(TICKET_MS + BOUNCE_MS) > now) {
                ticketFlights.set(flow.id, {start: flow.at, executed: flow.executed, slot: ticketFlights.size % tickets.length});
            }
        }
        if (next.lamp !== lastLamp) {
            const exec = next.workers.find((w) => w.id === 'execution-desk');
            const recent = exec?.since != null && now - exec.since < span(8000);
            if ((next.lamp === 'approved' || next.lamp === 'declined') && recent && !reduceMotion) stampAt = performance.now();
            lastLamp = next.lamp;
        }
    };

    const tickFixtures = (now: number, wall: number): boolean => {
        let moving = false;
        const p = palette;
        // Rating cards pinned on the cork, the newest flying in from the corner office's desk.
        cards.forEach((card, i) => {
            const rating = state.ratings[i];
            if (!rating || rating.rating === null) {
                card.visible = false;
                return;
            }
            const slot = corkSlot(i);
            const start = cardFlights.get(rating.symbol);
            card.visible = true;
            if (start !== undefined && now < start + span(CARD_MS)) {
                const u = smooth((now - start) / span(CARD_MS));
                const from = seatOf('portfolio-manager').work;
                const point = arcPoint(arcPath(from, slot, 0.9, `card:${rating.symbol}`), u);
                card.position.set(point[0], point[1], point[2]);
                card.rotation.set(0, (1 - u) * Math.PI, 0);
                moving = true;
            } else {
                card.position.set(slot[0], slot[1], slot[2]);
                card.rotation.set(0, 0, ((i % 3) - 1) * 0.05);
            }
        });

        // Tickets: to the chute; a refused one comes back to the returned tray.
        for (const [id, flight] of ticketFlights) {
            const mesh = tickets[flight.slot];
            const t = (now - flight.start) / span(TICKET_MS);
            const from: Vec3 = [FURNITURE.trays.sent[0], FURNITURE.trays.sent[1] + 0.05, FURNITURE.trays.sent[2]];
            const mouth = FURNITURE.chute.mouth;
            if (t < 1) {
                const point = arcPoint(arcPath(from, mouth, 1.0, id), smooth(t));
                mesh.position.set(point[0], point[1], point[2]);
                mesh.rotation.set(-Math.PI / 2 + t, t * 3, 0);
                mesh.visible = true;
                moving = true;
            } else if (!flight.executed) {
                const back = (now - flight.start - span(TICKET_MS)) / span(BOUNCE_MS);
                const to: Vec3 = [FURNITURE.trays.returned[0], FURNITURE.trays.returned[1] + 0.04 + 0.01 * flight.slot, FURNITURE.trays.returned[2]];
                const point = arcPoint(arcPath(mouth, to, 0.8, `${id}:back`), smooth(Math.min(1, back)));
                mesh.position.set(point[0], point[1], point[2]);
                mesh.rotation.set(-Math.PI / 2, 0, 0.2);
                mesh.visible = true;
                if (back < 1) moving = true;
            } else {
                mesh.visible = false;
            }
        }
        // A refused ticket stays in the returned tray while the session shows it.
        if (state.tickets.length === 0 && ticketFlights.size > 0) {
            for (const flight of ticketFlights.values()) tickets[flight.slot].visible = false;
            ticketFlights.clear();
        }

        // The lamp on the execution desk: breathing while the owner decides.
        const lamp = m.bulb;
        switch (state.lamp) {
            case 'awaiting':
                toColor(p.brand, lamp.color);
                if (!reduceMotion) {
                    lamp.color.multiplyScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(wall / 380)));
                    moving = true;
                }
                break;
            case 'approved':
                toColor(p.brand, lamp.color);
                break;
            case 'declined':
                toColor(p.warning, lamp.color);
                break;
            default:
                toColor(p.idle, lamp.color).multiplyScalar(0.7);
        }
        // The stamp: lifted, then down with a thud and a squash.
        if (stampAt !== null) {
            const t = (wall - stampAt) / 650;
            const up = t < 0.45 ? smooth(t / 0.45) : 1 - smooth((t - 0.45) / 0.2);
            room.stamp.position.y = FURNITURE.stamp[1] + 0.45 * Math.max(0, up);
            const squash = t > 0.62 && t < 0.85 ? 1 - 0.25 * Math.sin(((t - 0.62) / 0.23) * Math.PI) : 1;
            room.stamp.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);
            if (t >= 1) {
                stampAt = null;
                room.stamp.position.y = FURNITURE.stamp[1];
                room.stamp.scale.set(1, 1, 1);
            } else moving = true;
        }

        // The issue card moves along the board's three columns.
        const column = state.issue.state === 'open' ? 0 : state.issue.state === 'handed-in' || state.issue.state === 'blocked' ? 1 : state.issue.state === 'none' ? null : 2;
        const board = FURNITURE.issueBoard;
        if (column === null) room.issueCard.visible = false;
        else {
            const target = board.center[0] - board.size[0] / 3 + column * (board.size[0] / 3);
            if (issueX === null || reduceMotion) {
                issueX = target;
                issueFrom = null;
            } else if (Math.abs(issueX - target) > 1e-3 && issueFrom === null) {
                issueFrom = issueX;
                issueStart = wall;
            }
            if (issueFrom !== null) {
                const u = smooth((wall - issueStart) / 700);
                issueX = issueFrom + (target - issueFrom) * u;
                if (u >= 1) issueFrom = null;
                else moving = true;
            }
            room.issueCard.visible = true;
            room.issueCard.position.set(issueX, board.center[1] - 0.08, board.center[2] + 0.05);
        }

        // The risk desk: a speaking analyst's lamp lights and its gauge's needle swings to its side.
        const riskIds: WorkerId[] = ['risk-aggressive', 'risk-conservative', 'risk-neutral'];
        const side = [0.9, -0.9, 0];
        riskIds.forEach((id, i) => {
            const seat = seats.get(id);
            const status = seat?.status ?? 'idle';
            const talking = status === 'talking';
            const at = status === 'working' || talking;
            const needle = room.gaugeNeedles[i];
            const rest = status === 'done' || status === 'waiting' && seat?.worker?.task.startsWith('Spoke') ? side[i] * 0.7 : -1.25;
            let angle = at ? (talking ? side[i] : 0) : rest;
            if (talking && !reduceMotion) angle += 0.12 * Math.sin(wall / 90 + i);
            if (at && !talking && !reduceMotion) angle += 0.05 * Math.sin(wall / 300 + i);
            needle.rotation.z = -angle;
            const bulb = m.riskLamps[i];
            const base = [p.brass, p.risk, p.screenGlow][i];
            toColor(base, bulb.color).multiplyScalar(talking ? 1.2 : 0.35 + 0.55 * Math.max(mix.night, at ? 0.6 : 0));
        });
        if (riskIds.some((id) => seats.get(id)?.status === 'talking') && !reduceMotion) moving = true;

        // The research manager's plan board and the trader's printed strip.
        const plan = seats.get('research-manager')?.status;
        const planned = plan === 'filed' || plan === 'done';
        room.planBars.forEach((bar, i) => {
            const target = planned ? [2.2, 1.7, 1.2][i] : 0.001;
            bar.scale.x += (target - bar.scale.x) * (reduceMotion ? 1 : 0.12);
            bar.position.x = FURNITURE.planBoard.center[0] - FURNITURE.planBoard.size[0] / 2 + 0.25 + bar.scale.x / 2;
            if (Math.abs(target - bar.scale.x) > 0.01) moving = true;
        });
        const trader = seats.get('trader')?.status;
        const printed = trader === 'filed' || trader === 'done' ? 0.42 : 0.001;
        room.printerStrip.scale.z += (printed - room.printerStrip.scale.z) * (reduceMotion ? 1 : 0.1);
        if (Math.abs(printed - room.printerStrip.scale.z) > 0.005) moving = true;

        // The shelves: lit while a provider answers, amber when one refused.
        for (const shelf of state.shelves) {
            const glow = m.glows.get(shelf.vendor);
            if (!glow) continue;
            if (shelf.refused) {
                toColor(p.warning, glow.color);
                const flash = reduceMotion ? 0.45 : 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(wall / 110));
                glow.opacity = flash;
                if (!reduceMotion) moving = true;
            } else if (shelf.hot) {
                toColor(p.brand, glow.color);
                glow.opacity = 0.32;
            } else {
                glow.opacity = Math.max(0, glow.opacity - (reduceMotion ? 1 : 0.02));
                if (glow.opacity > 0) moving = true;
            }
        }

        // The coffee machine's brew light, on while the robot rests at its dock.
        const docked = errand === null && walk === null && Math.hypot(robotAt[0] - FURNITURE.dock[0], robotAt[2] - FURNITURE.dock[2]) < 0.3;
        toColor(docked ? p.warning : p.idle, m.brew.color);
        return moving;
    };

    // ---- the overlays ----
    const anchors = new Map<string, Vector3>();
    for (const id of WORKER_IDS) {
        const top = headTop(id);
        anchors.set(`plate:${id}`, new Vector3(top[0], top[1] + 0.5, top[2]));
        anchors.set(`bubble:${id}`, new Vector3(top[0], top[1] + 1.12, top[2]));
    }
    for (const shelf of FURNITURE.shelves) {
        anchors.set(`shelf:${shelf.vendor}`, new Vector3(shelf.center[0], shelf.height + 0.28, shelf.center[2] + 0.1));
    }
    for (const zone of OFFICE_ZONES) anchors.set(`zone:${zone.id}`, v3(zone.label));
    anchors.set('cork', new Vector3(FURNITURE.corkboard.center[0], FURNITURE.corkboard.center[1] + FURNITURE.corkboard.size[1] / 2 + 0.12, FURNITURE.corkboard.center[2] + 0.05));
    anchors.set('wall', v3(FURNITURE.wallPlate.center).setZ(FURNITURE.wallPlate.center[2] + 0.05));
    anchors.set('issue', new Vector3(FURNITURE.issueBoard.center[0], FURNITURE.issueBoard.center[1] + FURNITURE.issueBoard.size[1] / 2 + 0.35, FURNITURE.issueBoard.center[2]));
    anchors.set('stamp', new Vector3(FURNITURE.stamp[0] + 0.6, 1.95, FURNITURE.stamp[2]));
    anchors.set('lamp', new Vector3(FURNITURE.lampPost[0], FURNITURE.lampPost[1] + 0.9, FURNITURE.lampPost[2]));
    anchors.set('confetti', new Vector3(FURNITURE.lampPost[0] - 1, 1.4, FURNITURE.lampPost[2]));
    anchors.set('chute', new Vector3(FURNITURE.chute.center[0], 4.25, FURNITURE.chute.center[2]));
    anchors.set('returned', new Vector3(FURNITURE.trays.returned[0], FURNITURE.trays.returned[1] + 0.35, FURNITURE.trays.returned[2]));
    anchors.set('bin', new Vector3(FURNITURE.bin[0], 0.95, FURNITURE.bin[2]));
    const robotAnchor = new Vector3();

    type Placed = {element: HTMLElement; worker: WorkerId; x: number; y: number; w: number; h: number; near: number; priority: number; order: number};
    type Box = {x: number; y: number; w: number; h: number};
    const projected = new Vector3();
    const placeOverlays = () => {
        const list = options.overlays();
        if (list.length === 0) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const plates: Placed[] = [];
        const bubbles: Placed[] = [];
        // The chips the plates should rather not sit on: the shelves' providers, the wall, the corkboard,
        // the issue, the bin and the returned tray.
        const chips: Box[] = [];
        for (const {id, element} of list) {
            if (!element) continue;
            let anchor = anchors.get(id) ?? null;
            if (id === 'robot') {
                anchor = robotAnchor.set(robot.group.position.x, 2.05, robot.group.position.z);
            }
            if (!anchor) {
                element.style.visibility = 'hidden';
                continue;
            }
            const depth = anchor.distanceTo(camera.position);
            projected.copy(anchor).project(camera);
            const visible = projected.z < 1 && Math.abs(projected.x) <= 1.08 && Math.abs(projected.y) <= 1.08;
            if (!visible) {
                element.style.visibility = 'hidden';
                continue;
            }
            const x = ((projected.x + 1) / 2) * width;
            const y = ((1 - projected.y) / 2) * height;
            if (id.startsWith('plate:') || id.startsWith('bubble:')) {
                const worker = id.slice(id.indexOf(':') + 1) as WorkerId;
                const priority = (worker === selected ? 100 : 0) + (worker === hovered ? 50 : 0);
                const entry = {element, worker, x, y, w: element.offsetWidth, h: element.offsetHeight, near: depth, priority, order: WORKER_IDS.indexOf(worker)};
                (id.startsWith('plate:') ? plates : bubbles).push(entry);
                continue;
            }
            const w = element.offsetWidth;
            const h = element.offsetHeight;
            let px = x;
            let py = y;
            if (id.startsWith('shelf:')) {
                // Shelves close together: a chip that meets one before it climbs a row, else fades.
                let row = 0;
                while (row < 3 && chips.some((c) => Math.abs(c.x - x) * 2 < c.w + w && Math.abs(c.y - (y - row * (h + 2) - h / 2)) * 2 < c.h + h)) row += 1;
                py = y - Math.min(row, 2) * (h + 2);
                element.style.opacity = row > 2 ? '0.25' : '1';
                chips.push({x, y: py - h / 2, w, h});
            } else if (id === 'wall') {
                chips.push({x, y, w, h});
            } else if (CENTRED_CHIPS.has(id)) {
                // Inside the stage, however near its edge the thing it labels.
                px = clamp(x, w / 2 + EDGE_PAD, width - w / 2 - EDGE_PAD);
                py = clamp(y, h + EDGE_PAD, height - EDGE_PAD);
                if (id !== 'stamp' && id !== 'lamp') chips.push({x: px, y: py - h / 2, w, h});
            }
            element.style.visibility = 'visible';
            element.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
            element.style.zIndex = String(Math.max(1, 900 - Math.round(depth * 8)));
        }
        // A plate that would cover one already placed climbs a row (at most PLATE_ROWS − 1 times) on
        // a stem in its seat's colour; one with no free row fades. The selected and hovered go
        // first, then the run's order, so the rows hold still while statuses change.
        plates.sort((a, b) => b.priority - a.priority || a.order - b.order);
        const claimed: Box[] = [];
        const plateTops = new Map<WorkerId, number>();
        const meets = (boxes: readonly Box[], x: number, y: number, w: number, h: number) => boxes.some((c) =>
            Math.abs(c.x - x) * 2 < c.w + w + OVERLAP_PAD && Math.abs(c.y - y) * 2 < c.h + h + OVERLAP_PAD);
        for (const plate of plates) {
            const {element, x, y, w, h} = plate;
            // The lowest row clear of the other plates and the chips, sliding a little aside before it
            // climbs; else the lowest clear of the plates alone. Always inside the stage.
            const inside = (cx: number, lift: number) => ({x: clamp(cx, w / 2 + EDGE_PAD, width - w / 2 - EDGE_PAD), bottom: clamp(y - lift, h + EDGE_PAD, height - EDGE_PAD)});
            let spot: {x: number; bottom: number} | null = null;
            for (const avoidChips of [true, false]) {
                for (let row = 0; spot === null && row < PLATE_ROWS; row += 1) {
                    for (const shift of PLATE_SHIFTS) {
                        const at = inside(x + shift * w, row * (h + PLATE_GAP));
                        if (!meets(claimed, at.x, at.bottom - h / 2, w, h) && !(avoidChips && meets(chips, at.x, at.bottom - h / 2, w, h))) {
                            spot = at;
                            break;
                        }
                    }
                }
                if (spot !== null) break;
            }
            const shown = spot !== null || plate.priority >= 100;
            const {x: px, bottom: py} = spot ?? inside(x, 0);
            if (shown) {
                claimed.push({x: px, y: py - h / 2, w, h});
                plateTops.set(plate.worker, py - h);
            }
            element.style.visibility = 'visible';
            element.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
            // The stem from the plate down to its seat.
            element.style.setProperty('--ao-lift', `${Math.max(0, y - py).toFixed(1)}px`);
            element.style.setProperty('--ao-stem-x', `${clamp(x - px, -(w / 2 - 8), w / 2 - 8).toFixed(1)}px`);
            element.style.opacity = shown ? '1' : '0.18';
            element.style.zIndex = String(shown ? 950 + Math.min(40, plate.priority) - Math.round(plate.near) : 5);
        }
        // A bubble sits over its seat's plate. One that would cover another bubble or a plate slides
        // aside (its tail still pointing at the seat) or climbs a row; the newest words go first, and
        // a bubble with no room waits hidden until there is (the seat's file and the ticker keep it).
        bubbles.sort((a, b) => b.priority - a.priority || (seats.get(b.worker)?.worker?.since ?? 0) - (seats.get(a.worker)?.worker?.since ?? 0));
        const said: Box[] = [];
        for (const bubble of bubbles) {
            const {element, worker, w, h} = bubble;
            const bottom = (plateTops.get(worker) ?? bubble.y) - BUBBLE_GAP;
            let spot: {x: number; bottom: number} | null = null;
            for (let row = 0; spot === null && row < 2; row += 1) {
                for (const shift of BUBBLE_SHIFTS) {
                    const x = clamp(bubble.x + shift * w, w / 2 + EDGE_PAD, width - w / 2 - EDGE_PAD);
                    const b = Math.max(h + EDGE_PAD, bottom - row * (h + BUBBLE_GAP));
                    if (!meets(said, x, b - h / 2, w, h) && !meets(claimed, x, b - h / 2, w, h)) {
                        spot = {x, bottom: b};
                        break;
                    }
                }
            }
            if (spot === null && bubble.priority >= 100) spot = {x: bubble.x, bottom};
            if (spot === null) {
                element.style.visibility = 'hidden';
                continue;
            }
            said.push({x: spot.x, y: spot.bottom - h / 2, w, h});
            const reach = Math.max(0, w / 2 - 18);
            element.style.visibility = 'visible';
            element.style.opacity = '1';
            element.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.bottom.toFixed(1)}px)`;
            element.style.setProperty('--ao-tail', `${Math.max(-reach, Math.min(reach, bubble.x - spot.x)).toFixed(1)}px`);
            element.style.zIndex = String(1000 + bubble.priority - bubble.order);
        }
    };

    // ---- state ----
    const applyState = (next: OfficeState, nowMs: number, nextRate: number) => {
        const wall = performance.now();
        if (next.sessionId !== state.sessionId || nowMs < stateNow - 500) {
            // A new session, or a replay jumped back: start the travelling things afresh.
            for (const run of runs.values()) {
                run.mesh.visible = false;
                freePlanes.push(run.mesh);
            }
            runs.clear();
            seen.clear();
            cardFlights.clear();
            ticketFlights.clear();
            for (const ticket of tickets) ticket.visible = false;
            queue.length = 0;
            errand = null;
        }
        state = next;
        stateNow = nowMs;
        stateWall = wall;
        rate = Math.max(1, nextRate);
        for (const worker of next.workers) {
            const seat = seats.get(worker.id);
            if (!seat) continue;
            seat.worker = worker;
            if (seat.status !== worker.status) {
                Object.assign(seat.from, seat.pose);
                seat.status = worker.status;
                seat.changedAt = wall;
            }
        }
        syncPlanes(next.flows, nowMs);
        syncErrands(next.flows);
        syncFixtures(next, nowMs);
        // Follow the run: glide to the zone of the newest seat, at most once every few seconds.
        if (follow && next.focus && next.focus !== followFocus && wall - lastFollowAt > FOLLOW_DWELL_MS) {
            const target = presetForSeat(next.focus);
            followFocus = next.focus;
            if (target !== preset) {
                lastFollowAt = wall;
                goTo(target);
            }
        }
        dirty = true;
        schedule();
    };

    // ---- the frame ----
    const resize = () => {
        const host = canvas.parentElement ?? canvas;
        const rect = host.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        if (!cameraTouched && preset) {
            const pose = presetPose(preset);
            camera.position.copy(pose.position);
            controls.target.copy(pose.target);
        }
        dirty = true;
        schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement ?? canvas);

    const schedule = () => {
        if (raf === 0 && active && !disposed) raf = requestAnimationFrame(frame);
    };

    const frame = (wall: number) => {
        raf = 0;
        if (disposed || !active) return;
        const now = sceneNow(wall);
        let busy = false;
        if (tween) {
            const u = smooth((wall - tween.start) / tween.ms);
            camera.position.lerpVectors(tween.fromPos, tween.toPos, u);
            controls.target.lerpVectors(tween.fromTarget, tween.toTarget, u);
            if (u >= 1) tween = null;
            busy = true;
        }
        if (mixStart >= 0) {
            const u = smooth((wall - mixStart) / MIX_MS);
            mix.day = mixFrom.day + (mixTo.day - mixFrom.day) * u;
            mix.dusk = mixFrom.dusk + (mixTo.dusk - mixFrom.dusk) * u;
            mix.night = mixFrom.night + (mixTo.night - mixFrom.night) * u;
            applyDaylight();
            if (u >= 1) mixStart = -1;
            busy = true;
        }
        if (controls.update()) busy = true;
        clampTarget();
        if (pending) {
            const hit = pick(pending);
            pending = null;
            if (labelHover === null) setHovered(hit);
            canvas.style.cursor = hit ? 'pointer' : '';
        }
        let ambient = false;
        for (const seat of seats.values()) {
            tickSeat(seat, wall);
            if (!reduceMotion) ambient = true;
            if (wall - seat.changedAt < BLEND_MS) busy = true;
        }
        const ring = room.ring;
        const ringed = selected ?? hovered;
        if (ringed) {
            const s = seatOf(ringed).seat;
            ring.visible = true;
            ring.position.set(s[0], 0.03, s[2]);
            (ring.material as MeshBasicMaterial).opacity = selected ? 0.9 : 0.45;
        } else ring.visible = false;
        if (tickPlanes(now, wall)) busy = true;
        if (tickRobot(wall)) busy = true;
        if (tickFixtures(now, wall)) busy = true;

        const distance = camera.position.distanceTo(controls.target);
        if (Math.abs(distance - reportedDistance) > 0.25) {
            reportedDistance = distance;
            options.onCamera({preset, distance});
        }
        const due = busy || dirty || (ambient && wall - lastDraw >= AMBIENT_FRAME_MS);
        if (due) {
            renderer.render(scene, camera);
            placeOverlays();
            dirty = false;
            lastDraw = wall;
            frames += 1;
            if (frames % 30 === 0) options.onDrawn?.(frames, renderer.info.render.calls);
        }
        if (busy || ambient || runs.size > 0) schedule();
        else if (state.mode === 'live') {
            // Nothing moving: wake for the next tick of the page's clock only.
            if (wake !== null) clearTimeout(wake);
            wake = setTimeout(() => {
                wake = null;
                schedule();
            }, 1000);
        }
    };

    // ---- start ----
    setMixTarget(true);
    setClockHands();
    applyState(state, stateNow, rate);
    goTo('overview', 0);
    resize();
    schedule();

    return {
        setState: applyState,
        setDaylight: (next) => {
            const changed = next.etMinutes !== daylight.etMinutes || next.marketOpen !== daylight.marketOpen;
            daylight = next;
            if (!changed) return;
            setClockHands();
            setMixTarget(false);
            applyDaylight();
            dirty = true;
            schedule();
        },
        setHover: (id) => {
            labelHover = id;
            setHovered(id);
        },
        setSelected: (id) => {
            selected = id;
            dirty = true;
            schedule();
        },
        setPreset: (id) => {
            cameraTouched = false;
            goTo(id);
        },
        setFollow: (on) => {
            follow = on;
            followFocus = null;
            lastFollowAt = -1e9;
            if (on && state.focus) {
                followFocus = state.focus;
                goTo(presetForSeat(state.focus));
            }
        },
        zoom: (factor) => zoomBy(factor),
        setPalette: (next) => {
            palette = next;
            recolor(m, next);
            applyDaylight();
            dirty = true;
            schedule();
        },
        setReduceMotion: (reduce) => {
            reduceMotion = reduce;
            if (reduce) {
                tween = null;
                for (const run of runs.values()) {
                    run.mesh.visible = false;
                    freePlanes.push(run.mesh);
                }
                runs.clear();
                queue.length = 0;
                errand = null;
                walk = null;
                homeBound = false;
                robotAt = [FURNITURE.dock[0], 0, FURNITURE.dock[2]];
                setMixTarget(true);
            }
            dirty = true;
            schedule();
        },
        setActive: (next) => {
            active = next;
            if (next) {
                dirty = true;
                schedule();
            } else {
                if (raf !== 0) cancelAnimationFrame(raf);
                raf = 0;
                if (wake !== null) clearTimeout(wake);
                wake = null;
            }
        },
        dispose: () => {
            disposed = true;
            if (raf !== 0) cancelAnimationFrame(raf);
            if (wake !== null) clearTimeout(wake);
            observer.disconnect();
            controls.removeEventListener('start', onStart);
            controls.removeEventListener('change', onChange);
            controls.dispose();
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            for (const geometry of reg.geometries) geometry.dispose();
            for (const material of reg.materials) material.dispose();
            for (const texture of reg.textures) texture.dispose();
            renderer.dispose();
        },
    };
};
