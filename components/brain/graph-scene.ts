// The three.js scene behind components/brain/BrainGraph: the knowledge graph as spheres on three
// concentric shells (lib/brain/graph-layout), sized by persistent attention and coloured by
// sentiment, an active thesis haloed, the links among them as lines, the shells as faint rings. It
// turns slowly on its own, a hand on it turns it, and a hovered or focused entity lights up with
// its links. Loaded with a dynamic import once the page has painted.
//
// No React state lives here: hover and picks go out through callbacks, and the labels — real
// links the component renders — are placed by writing transforms on the elements it hands in.
// Drawing is on demand: a frame is scheduled only while something moves, and setActive(false)
// stops it while the panel is off screen.

import {
    BackSide,
    BufferAttribute,
    BufferGeometry,
    Color,
    DirectionalLight,
    Float32BufferAttribute,
    HemisphereLight,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PerspectiveCamera,
    Raycaster,
    Scene,
    SphereGeometry,
    SRGBColorSpace,
    TorusGeometry,
    Vector2,
    Vector3,
    WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {SHELL_RADII, type GraphEdge, type GraphPoint} from "@/lib/brain/graph-layout";
import type {Rgb} from "@/lib/theme/css-color";

export type GraphPalette = {positive: Rgb; negative: Rgb; muted: Rgb; brand: Rgb; line: Rgb; fg: Rgb};

export type GraphSceneOptions = {
    canvas: HTMLCanvasElement;
    points: readonly GraphPoint[];
    edges: readonly GraphEdge[];
    palette: GraphPalette;
    reduceMotion: boolean;
    coarsePointer: boolean;
    // The entity under the pointer, or none.
    onHover: (key: string | null) => void;
    // A click (not a drag) on an entity's sphere.
    onPick: (key: string) => void;
    onRotating: (rotating: boolean) => void;
    // The labels, in `points` order; placed on every drawn frame.
    labels: () => readonly (HTMLElement | null)[];
};

export type GraphScene = {
    // Light an entity (a label hovered or focused), or none.
    setHover: (key: string | null) => void;
    setPalette: (palette: GraphPalette) => void;
    setReduceMotion: (reduce: boolean) => void;
    setActive: (active: boolean) => void;
    dispose: () => void;
};

// Far enough that the outer shell's topmost label — the sphere's top plus its lift — stays inside
// a 45° frustum with room to spare, whatever the canvas's width (its aspect is fixed at 16:10).
const CAMERA_DISTANCE = 12;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 24;
const ZOOM_STEP = 0.1;
const AUTO_ROTATE_SPEED = 0.6;
const IDLE_RESUME_MS = 6000;
const INTRO_MS = 900;
// A press that moves less than this before release is a click, not a drag.
const CLICK_SLOP_PX = 5;
// Where a label sits: above its sphere, by this share of the radius plus a little.
const LABEL_LIFT = 1.35;
// How much a thesis halo outgrows its sphere.
const HALO_SCALE = 1.7;
// Sentiment this close to zero is neutral.
const NEUTRAL_BAND = 0.05;

const toColor = (rgb: Rgb): Color => new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export const createGraphScene = (options: GraphSceneOptions): GraphScene => {
    const {canvas, points, edges} = options;
    let palette = options.palette;
    let reduceMotion = options.reduceMotion;
    const index = new Map(points.map((p, i) => [p.key, i]));

    const renderer = new WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
    renderer.setClearColor(0, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.coarsePointer ? 1.5 : 2));

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(CAMERA_DISTANCE * 0.55, CAMERA_DISTANCE * 0.35, CAMERA_DISTANCE * 0.76);
    camera.lookAt(0, 0, 0);
    scene.add(new HemisphereLight(new Color(1, 1, 1), new Color(0.1, 0.1, 0.14), 0.9));
    const sun = new DirectionalLight(new Color(1, 1, 1), 1.1);
    sun.position.set(5, 8, 6);
    scene.add(sun);

    // ---- the spheres and their halos ---------------------------------------------------------
    const sphereGeometry = new SphereGeometry(1, 24, 18);
    const sentimentOf = (s: number): Rgb => (s > NEUTRAL_BAND ? palette.positive : s < -NEUTRAL_BAND ? palette.negative : palette.muted);
    const materials = points.map((p) => new MeshStandardMaterial({
        color: toColor(sentimentOf(p.node.sentimentSlow)),
        emissive: toColor(sentimentOf(p.node.sentimentSlow)),
        emissiveIntensity: 0.25,
        roughness: 0.45,
        metalness: 0.1,
    }));
    const spheres = points.map((p, i) => {
        const mesh = new Mesh(sphereGeometry, materials[i]);
        mesh.userData.key = p.key;
        scene.add(mesh);
        return mesh;
    });
    const haloMaterial = new MeshBasicMaterial({transparent: true, opacity: 0.16, side: BackSide, depthWrite: false});
    const halos = points.map((p) => {
        if (p.node.thesisSince === null) return null;
        const halo = new Mesh(sphereGeometry, haloMaterial);
        scene.add(halo);
        return halo;
    });

    // ---- the links, and the hovered entity's links ----------------------------------------
    const drawn = edges.filter((e) => index.has(e.source) && index.has(e.target));
    const maxEdge = Math.max(...drawn.map((e) => e.weight), 0.001);
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(drawn.length * 6), 3));
    const edgeColors = new Float32BufferAttribute(new Float32Array(drawn.length * 6), 3);
    edgeGeometry.setAttribute('color', edgeColors);
    const edgeMaterial = new LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.55});
    scene.add(new LineSegments(edgeGeometry, edgeMaterial));
    const litGeometry = new BufferGeometry();
    litGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(drawn.length * 6), 3));
    const litMaterial = new LineBasicMaterial({transparent: true, opacity: 0.95, depthTest: false});
    const lit = new LineSegments(litGeometry, litMaterial);
    lit.renderOrder = 2;
    lit.visible = false;
    scene.add(lit);

    // ---- the shells, as rings at their equators ----------------------------------------------
    const ringMaterial = new MeshBasicMaterial({transparent: true, opacity: 0.22, depthWrite: false});
    const rings = (['theme', 'sector', 'ticker'] as const).map((type) => {
        const ring = new Mesh(new TorusGeometry(SHELL_RADII[type], 0.004, 6, 128), ringMaterial);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        return ring;
    });

    let hovered: string | null = null;
    let bloom = reduceMotion ? 1 : 0;

    // Everything's place at a share of its final distance from the centre (the intro's bloom).
    const place = () => {
        points.forEach((p, i) => {
            const sphere = spheres[i];
            sphere.position.set(p.x * bloom, p.y * bloom, p.z * bloom);
            const lift = hovered === p.key ? 1.18 : 1;
            sphere.scale.setScalar(Math.max(0.001, p.r * bloom * lift));
            const halo = halos[i];
            if (halo) {
                halo.position.copy(sphere.position);
                halo.scale.setScalar(Math.max(0.001, p.r * bloom * HALO_SCALE));
            }
        });
        const attribute = edgeGeometry.getAttribute('position') as BufferAttribute;
        drawn.forEach((e, k) => {
            const a = spheres[index.get(e.source)!].position;
            const b = spheres[index.get(e.target)!].position;
            attribute.setXYZ(2 * k, a.x, a.y, a.z);
            attribute.setXYZ(2 * k + 1, b.x, b.y, b.z);
        });
        attribute.needsUpdate = true;
        syncLit();
    };
    const syncLit = () => {
        if (hovered === null) {
            lit.visible = false;
            return;
        }
        const attribute = litGeometry.getAttribute('position') as BufferAttribute;
        let n = 0;
        for (const e of drawn) {
            if (e.source !== hovered && e.target !== hovered) continue;
            const a = spheres[index.get(e.source)!].position;
            const b = spheres[index.get(e.target)!].position;
            attribute.setXYZ(2 * n, a.x, a.y, a.z);
            attribute.setXYZ(2 * n + 1, b.x, b.y, b.z);
            n += 1;
        }
        attribute.needsUpdate = true;
        litGeometry.setDrawRange(0, 2 * n);
        lit.visible = n > 0;
    };

    const paint = () => {
        points.forEach((p, i) => {
            const colour = toColor(sentimentOf(p.node.sentimentSlow));
            materials[i].color.copy(colour);
            materials[i].emissive.copy(colour);
            materials[i].emissiveIntensity = hovered === p.key ? 0.9 : 0.25;
        });
        const line = toColor(palette.line);
        drawn.forEach((e, k) => {
            // A heavier link is a brighter line: the line colour lifted toward the foreground.
            const c = line.clone().lerp(toColor(palette.fg), 0.15 + 0.45 * (e.weight / maxEdge));
            edgeColors.setXYZ(2 * k, c.r, c.g, c.b);
            edgeColors.setXYZ(2 * k + 1, c.r, c.g, c.b);
        });
        edgeColors.needsUpdate = true;
        haloMaterial.color.copy(toColor(palette.brand));
        litMaterial.color.copy(toColor(palette.brand));
        ringMaterial.color.copy(toColor(palette.line));
    };

    // ---- the loop ------------------------------------------------------------------------
    let raf = 0;
    let active = true;
    let disposed = false;
    let dirty = true;
    let intro: {start: number} | null = reduceMotion ? null : {start: performance.now()};
    let pending: {x: number; y: number} | null = null;
    let engaged = false;
    let press: {x: number; y: number} | null = null;

    const schedule = () => {
        if (raf === 0 && active && !disposed) raf = requestAnimationFrame(frame);
    };

    // ---- the controls --------------------------------------------------------------------
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    controls.autoRotate = !reduceMotion;
    controls.enabled = !options.coarsePointer;
    canvas.style.touchAction = 'pan-y';

    let idle: ReturnType<typeof setTimeout> | null = null;
    const setRotating = (on: boolean) => {
        if (controls.autoRotate === on) return;
        controls.autoRotate = on;
        options.onRotating(on);
        dirty = true;
        schedule();
    };
    const pause = () => {
        if (idle !== null) clearTimeout(idle);
        idle = null;
        setRotating(false);
    };
    const resumeLater = () => {
        if (idle !== null) clearTimeout(idle);
        idle = setTimeout(() => {
            idle = null;
            if (!reduceMotion && hovered === null) setRotating(true);
        }, IDLE_RESUME_MS);
    };
    const onChange = () => {
        dirty = true;
        schedule();
    };
    controls.addEventListener('start', pause);
    controls.addEventListener('end', resumeLater);
    controls.addEventListener('change', onChange);

    const onWheel = (event: WheelEvent) => {
        if (!(event.ctrlKey || event.metaKey || engaged)) return;
        event.preventDefault();
        pause();
        const offset = camera.position.clone().sub(controls.target);
        const length = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, offset.length() * (1 + Math.sign(event.deltaY) * ZOOM_STEP)));
        camera.position.copy(controls.target).add(offset.setLength(length));
        resumeLater();
        dirty = true;
        schedule();
    };
    canvas.addEventListener('wheel', onWheel, {passive: false});

    // ---- the pointer ---------------------------------------------------------------------
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const local = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    };
    const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        pending = local(event);
        schedule();
    };
    const onPointerDown = (event: PointerEvent) => {
        engaged = true;
        press = {x: event.clientX, y: event.clientY};
        if (event.pointerType === 'touch') {
            pending = local(event);
            schedule();
        }
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
        if (hovered !== null && !labelHold) light(null, true);
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    // The sphere under a canvas point, or none.
    const pick = (point: {x: number; y: number}): string | null => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) return null;
        ndc.set((point.x / width) * 2 - 1, -(point.y / height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(spheres, false)[0];
        return hit ? (hit.object.userData.key as string) : null;
    };

    // A label that is hovered or focused holds its entity lit even as the pointer wanders.
    let labelHold = false;
    const light = (key: string | null, fromCanvas: boolean) => {
        if (fromCanvas && labelHold) return;
        if (hovered === key) return;
        hovered = key;
        paint();
        place();
        options.onHover(key);
        if (key !== null) pause();
        else resumeLater();
        dirty = true;
        schedule();
    };

    // ---- the labels ----------------------------------------------------------------------
    const projected = new Vector3();
    type Placed = {element: HTMLElement; key: string; x: number; y: number; w: number; h: number; near: number};
    const OVERLAP_PAD = 2;
    // A label covered by a nearer one fades to a trace rather than hiding: it stays in the tab
    // order, and comes forward on hover or focus.
    const placeLabels = () => {
        const elements = options.labels();
        if (elements.length === 0) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const toCamera = camera.position.length();
        const placed: Placed[] = [];
        points.forEach((p, i) => {
            const element = elements[i];
            if (!element) return;
            const sphere = spheres[i];
            projected.set(sphere.position.x, sphere.position.y + p.r * bloom * LABEL_LIFT + 0.05, sphere.position.z);
            // Depth before projection: nearer the camera, more present.
            const depth = projected.distanceTo(camera.position);
            projected.project(camera);
            const visible = bloom > 0.2 && projected.z < 1 && Math.abs(projected.x) <= 1.05 && Math.abs(projected.y) <= 1.05;
            if (!visible) {
                element.style.visibility = 'hidden';
                return;
            }
            const near = Math.min(1, Math.max(0, (toCamera + SHELL_RADII.ticker - depth) / (2 * SHELL_RADII.ticker)));
            placed.push({element, key: p.key, x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height, w: element.offsetWidth, h: element.offsetHeight, near});
        });
        // The lit label, then the nearer ones, claim their space first; a later one that overlaps fades.
        placed.sort((a, b) => Number(b.key === hovered) - Number(a.key === hovered) || b.near - a.near);
        const claimed: Placed[] = [];
        for (const label of placed) {
            // A label's box hangs above and is centred on its point (the -50%/-100% translate).
            const covered = label.key !== hovered && claimed.some((c) =>
                Math.abs(c.x - label.x) * 2 < c.w + label.w + OVERLAP_PAD && Math.abs(c.y - c.h / 2 - (label.y - label.h / 2)) * 2 < c.h + label.h + OVERLAP_PAD);
            if (!covered) claimed.push(label);
            const {element, key, x, y, near} = label;
            element.style.visibility = 'visible';
            element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
            element.style.opacity = key === hovered ? '1' : covered ? '0.12' : (0.35 + 0.65 * near).toFixed(2);
            element.style.zIndex = key === hovered ? '40' : covered ? '5' : String(10 + Math.round(near * 20));
        }
    };

    const frame = (now: number) => {
        raf = 0;
        if (disposed || !active) return;
        let moved = false;
        if (intro) {
            bloom = easeOut((now - intro.start) / INTRO_MS);
            if (bloom >= 1) {
                bloom = 1;
                intro = null;
            }
            place();
            moved = true;
        }
        if (controls.update()) moved = true;
        if (pending) {
            const hit = pick(pending);
            pending = null;
            light(hit, true);
        }
        if (moved || dirty) {
            renderer.render(scene, camera);
            placeLabels();
            dirty = false;
        }
        if (moved || intro || controls.autoRotate || pending) schedule();
    };

    // ---- size ----------------------------------------------------------------------------
    const host = canvas.parentElement ?? canvas;
    const resize = () => {
        const rect = host.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        dirty = true;
        schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    paint();
    place();
    resize();
    options.onRotating(controls.autoRotate);
    schedule();

    return {
        setHover: (key) => {
            labelHold = key !== null;
            light(key, false);
        },
        setPalette: (next) => {
            palette = next;
            paint();
            dirty = true;
            schedule();
        },
        setReduceMotion: (reduce) => {
            reduceMotion = reduce;
            if (reduce) {
                pause();
                if (intro) {
                    intro = null;
                    bloom = 1;
                    place();
                }
            } else if (hovered === null) {
                setRotating(true);
            }
            dirty = true;
            schedule();
        },
        setActive: (next) => {
            active = next;
            if (next) {
                dirty = true;
                schedule();
            } else if (raf !== 0) {
                cancelAnimationFrame(raf);
                raf = 0;
            }
        },
        dispose: () => {
            disposed = true;
            if (raf !== 0) cancelAnimationFrame(raf);
            if (idle !== null) clearTimeout(idle);
            observer.disconnect();
            controls.removeEventListener('start', pause);
            controls.removeEventListener('end', resumeLater);
            controls.removeEventListener('change', onChange);
            controls.dispose();
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            sphereGeometry.dispose();
            for (const ring of rings) ring.geometry.dispose();
            edgeGeometry.dispose();
            litGeometry.dispose();
            for (const m of [...materials, haloMaterial, edgeMaterial, litMaterial, ringMaterial]) m.dispose();
            renderer.dispose();
        },
    };
};
