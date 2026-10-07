// The three.js scene behind components/landing/MomentumTerrain: the surface as a plane with one
// vertex per (session, lookback) raised by momentum, the zero plane, the floor heatmap, drop
// lines, the front edge, hover highlights and a marker, orbit controls with the plan's limits,
// camera presets, the flatten toggle and the intro rise. Loaded with a dynamic import() once the
// data has arrived, so the landing HTML carries none of it.
//
// It owns no React state: hover and auto-rotate changes go out through callbacks, the story
// markers are positioned by writing transforms on the elements the component hands it, and
// every colour comes in as a palette the component read from the document's tokens.
//
// Drawing is on demand: a frame is scheduled only while something moves (auto-rotate, damping,
// a tween, a pending pointer), and setActive(false) stops it while the hero is off screen.

import {
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    DirectionalLight,
    DoubleSide,
    Float32BufferAttribute,
    HemisphereLight,
    Line,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    NearestFilter,
    PerspectiveCamera,
    PlaneGeometry,
    Raycaster,
    Scene,
    SphereGeometry,
    SRGBColorSpace,
    Vector2,
    Vector3,
    WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {MomentumSurface, SurfaceCell} from "@/lib/landing/momentum-surface";
import {
    CAMERA_PRESETS,
    cellFromUv,
    colorAt,
    easeInOut,
    rowOfLookback,
    type CameraPreset,
    type Rgb,
    type TerrainScale,
} from "@/lib/landing/terrain-view";
import {paintHeatmap} from "@/components/landing/terrain-heatmap";

export type TerrainPalette = {scale: TerrainScale; fg: Rgb; zero: Rgb};
// The cell under the pointer and where, in CSS pixels from the canvas's top-left, with the
// canvas's width so the tooltip can pick its side without reading the DOM.
export type TerrainHit = {cell: SurfaceCell; x: number; y: number; width: number};

export type SceneOptions = {
    canvas: HTMLCanvasElement;
    surface: MomentumSurface;
    palette: TerrainPalette;
    reduceMotion: boolean;
    coarsePointer: boolean;
    onHover: (hit: TerrainHit | null) => void;
    onRotating: (rotating: boolean) => void;
    // The camera's distance from the surface's centre, whenever it changes (a zoom, a preset).
    onZoom?: (distance: number) => void;
    // The story markers' elements, in surface.notable order; read on every drawn frame.
    markers: () => readonly (HTMLElement | null)[];
};

export type TerrainScene = {
    setPreset: (preset: CameraPreset) => void;
    setFlat: (flat: boolean) => void;
    // Multiplies the camera's distance: under 1 zooms in, over 1 out, within the limits.
    zoom: (factor: number) => void;
    setPalette: (palette: TerrainPalette) => void;
    setReduceMotion: (reduce: boolean) => void;
    setActive: (active: boolean) => void;
    dispose: () => void;
};

// World units. The data is 250 sessions across and 7 lookbacks deep; the plan drew it 3:1 so a
// day stays a thin column and the ridges along time read. 3:2 keeps that and sits better in a
// wide panel — the owner wanted it squarer.
const WIDTH = 12;
const DEPTH = 8;
// Height per σ.
const HEIGHT = 0.45;
// The floor sits this far under the lowest point.
const BASE_GAP = 0.35;
const INTRO_MS = 800;
const FLATTEN_MS = 800;
const PRESET_MS = 600;
const IDLE_RESUME_MS = 6000;
const AUTO_ROTATE_SPEED = 0.4;
// A drop line from every fifth session of the front row.
const DROP_EVERY = 5;
const MIN_DISTANCE = 4;
const MAX_DISTANCE = 30;
const ZOOM_STEP = 0.1;
// What the + and − buttons do to the distance.
const ZOOM_BUTTON_FACTOR = 0.8;
// A hair above the surface, so a line on it is not cut by its own facets.
const LIFT = 0.015;
// How much of the frame the fitted surface may use, in normalised device coordinates.
const FIT_MARGIN = 0.95;
// Points on the cylinder the surface turns inside, sampled to fit the camera whatever the azimuth.
const FIT_SAMPLES = 24;

type Tween = {from: number; to: number; start: number; ms: number};
type CameraTween = {from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3; start: number; ms: number};
type Framing = {target: Vector3; position: Vector3};

// An sRGB token as a three.js colour (stored linear, as the renderer expects).
const toColor = (rgb: Rgb): Color => new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);

const progress = (start: number, ms: number, now: number): number => (ms <= 0 ? 1 : Math.min(1, (now - start) / ms));

export const createTerrainScene = (options: SceneOptions): TerrainScene => {
    const {canvas, surface} = options;
    let palette = options.palette;
    let reduceMotion = options.reduceMotion;
    const days = surface.dates.length;
    const rows = surface.lookbacks.length;

    const renderer = new WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
    renderer.setClearColor(0, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.coarsePointer ? 1.5 : 2));

    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.angle);
    camera.lookAt(0, 0, 0);

    scene.add(new HemisphereLight(new Color(1, 1, 1), new Color(0.12, 0.12, 0.16), 1.0));
    const sun = new DirectionalLight(new Color(1, 1, 1), 1.3);
    sun.position.set(-6, 9, 5);
    scene.add(sun);

    // ---- the surface ---------------------------------------------------------------------
    // Row 0 of the plane ends up at the back after the rotation; the longest lookback goes there.
    const geometry = new PlaneGeometry(WIDTH, DEPTH, days - 1, rows - 1);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position') as BufferAttribute;
    const heights = new Float32Array(position.count);
    let lowest = 0;
    let highest = 0;
    for (let j = 0; j < rows; j += 1) {
        const lookback = rowOfLookback(j, rows);
        for (let i = 0; i < days; i += 1) {
            const k = j * days + i;
            heights[k] = surface.z[lookback][i] * HEIGHT;
            lowest = Math.min(lowest, heights[k]);
            highest = Math.max(highest, heights[k]);
        }
    }
    const colors = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
    geometry.setAttribute('color', colors);
    const material = new MeshStandardMaterial({vertexColors: true, flatShading: true, side: DoubleSide, roughness: 0.6, metalness: 0.05});
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);
    const baseY = lowest - BASE_GAP;

    // ---- the planes: zero, and the floor with the heatmap --------------------------------
    const zeroMaterial = new MeshBasicMaterial({transparent: true, opacity: 0.08, side: DoubleSide, depthWrite: false});
    const zero = new Mesh(new PlaneGeometry(WIDTH, DEPTH).rotateX(-Math.PI / 2), zeroMaterial);
    scene.add(zero);

    const floorCanvas = document.createElement('canvas');
    const texture = new CanvasTexture(floorCanvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = SRGBColorSpace;
    const floorMaterial = new MeshBasicMaterial({map: texture, transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false});
    const floor = new Mesh(new PlaneGeometry(WIDTH, DEPTH).rotateX(-Math.PI / 2), floorMaterial);
    floor.position.y = baseY;
    scene.add(floor);

    // ---- lines: the front edge, drop lines, the hover highlights; the hover marker ---------
    const frontRow = rowOfLookback(0, rows);
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(days * 3), 3));
    const edgeMaterial = new LineBasicMaterial({transparent: true, opacity: 0.9});
    scene.add(new Line(edgeGeometry, edgeMaterial));

    const dropDays: number[] = [];
    for (let i = 0; i < days; i += DROP_EVERY) dropDays.push(i);
    const dropGeometry = new BufferGeometry();
    dropGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(dropDays.length * 6), 3));
    const dropMaterial = new LineBasicMaterial({transparent: true, opacity: 0.4});
    scene.add(new LineSegments(dropGeometry, dropMaterial));

    const rowGeometry = new BufferGeometry();
    rowGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(days * 3), 3));
    const columnGeometry = new BufferGeometry();
    columnGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(rows * 3), 3));
    const highlightMaterial = new LineBasicMaterial({transparent: true, opacity: 0.9, depthTest: false});
    const rowLine = new Line(rowGeometry, highlightMaterial);
    const columnLine = new Line(columnGeometry, highlightMaterial);
    rowLine.renderOrder = 2;
    columnLine.renderOrder = 2;
    rowLine.visible = false;
    columnLine.visible = false;
    scene.add(rowLine, columnLine);

    const markerMaterial = new MeshBasicMaterial();
    const marker = new Mesh(new SphereGeometry(0.07, 12, 12), markerMaterial);
    marker.visible = false;
    scene.add(marker);

    let hovered: SurfaceCell | null = null;

    const copyVertex = (target: BufferAttribute, slot: number, k: number, lift: number) =>
        target.setXYZ(slot, position.getX(k), position.getY(k) + lift, position.getZ(k));

    const syncEdge = () => {
        const attribute = edgeGeometry.getAttribute('position') as BufferAttribute;
        for (let i = 0; i < days; i += 1) copyVertex(attribute, i, frontRow * days + i, LIFT);
        attribute.needsUpdate = true;
    };
    const syncDrops = () => {
        const attribute = dropGeometry.getAttribute('position') as BufferAttribute;
        dropDays.forEach((i, slot) => {
            const k = frontRow * days + i;
            attribute.setXYZ(2 * slot, position.getX(k), position.getY(k), position.getZ(k));
            attribute.setXYZ(2 * slot + 1, position.getX(k), baseY, position.getZ(k));
        });
        attribute.needsUpdate = true;
    };
    const syncHighlight = () => {
        if (!hovered) return;
        const j = rowOfLookback(hovered.lookback, rows);
        const row = rowGeometry.getAttribute('position') as BufferAttribute;
        for (let i = 0; i < days; i += 1) copyVertex(row, i, j * days + i, LIFT);
        row.needsUpdate = true;
        const column = columnGeometry.getAttribute('position') as BufferAttribute;
        for (let jj = 0; jj < rows; jj += 1) copyVertex(column, jj, jj * days + hovered.day, LIFT);
        column.needsUpdate = true;
        const k = j * days + hovered.day;
        marker.position.set(position.getX(k), position.getY(k) + LIFT, position.getZ(k));
    };

    // The surface at a share of its full height: 0 is flat, 1 the data.
    let heightFactor = reduceMotion ? 1 : 0;
    const applyHeights = (factor: number) => {
        heightFactor = factor;
        for (let k = 0; k < position.count; k += 1) position.setY(k, heights[k] * factor);
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        syncEdge();
        syncDrops();
        syncHighlight();
    };

    const paint = () => {
        const colour = new Color();
        for (let j = 0; j < rows; j += 1) {
            const lookback = rowOfLookback(j, rows);
            for (let i = 0; i < days; i += 1) {
                const [r, g, b] = colorAt(palette.scale, surface.z[lookback][i] / surface.zAbsMax);
                colour.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
                colors.setXYZ(j * days + i, colour.r, colour.g, colour.b);
            }
        }
        colors.needsUpdate = true;
        paintHeatmap(floorCanvas, surface, palette.scale);
        texture.needsUpdate = true;
        zeroMaterial.color.copy(toColor(palette.fg));
        edgeMaterial.color.copy(toColor(palette.fg));
        highlightMaterial.color.copy(toColor(palette.fg));
        markerMaterial.color.copy(toColor(palette.fg));
        dropMaterial.color.copy(toColor(palette.zero));
    };

    // ---- the loop ------------------------------------------------------------------------
    let raf = 0;
    let active = true;
    let disposed = false;
    let dirty = true;
    let cameraTween: CameraTween | null = null;
    let heightTween: Tween | null = reduceMotion ? null : {from: 0, to: 1, start: performance.now(), ms: INTRO_MS};
    let flatTarget = 1;
    let pending: {x: number; y: number} | null = null;
    // A hand on the surface: from a press until the pointer leaves, the wheel zooms instead of
    // scrolling the page. Idle, the wheel is the page's, so a visitor scrolls past the hero.
    let engaged = false;
    let reportedDistance = -1;

    const schedule = () => {
        if (raf === 0 && active && !disposed) raf = requestAnimationFrame(frame);
    };

    // ---- the controls --------------------------------------------------------------------
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    // The wheel is the page's: zoom is Ctrl (or a trackpad pinch) and the wheel, below.
    controls.enableZoom = false;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    controls.autoRotate = !reduceMotion;
    // A finger on a phone scrolls the page past the hero; the surface keeps turning on its own.
    controls.enabled = !options.coarsePointer;
    // OrbitControls sets the canvas to touch-action: none on connect; the page's scroll wins.
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
            if (!reduceMotion) setRotating(true);
        }, IDLE_RESUME_MS);
    };
    const onChange = () => {
        dirty = true;
        schedule();
    };
    controls.addEventListener('start', pause);
    controls.addEventListener('end', resumeLater);
    controls.addEventListener('change', onChange);

    const zoomBy = (factor: number) => {
        pause();
        const offset = camera.position.clone().sub(controls.target);
        const length = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, offset.length() * factor));
        camera.position.copy(controls.target).add(offset.setLength(length));
        resumeLater();
        dirty = true;
        schedule();
    };
    // Ctrl or Meta and the wheel (a trackpad pinch arrives this way) zoom at any time; the bare
    // wheel only once the surface has been grabbed.
    const onWheel = (event: WheelEvent) => {
        if (!(event.ctrlKey || event.metaKey || engaged)) return;
        event.preventDefault();
        zoomBy(1 + Math.sign(event.deltaY) * ZOOM_STEP);
    };
    canvas.addEventListener('wheel', onWheel, {passive: false});

    // ---- framing: the whole surface in view at this canvas's aspect, from any azimuth --------
    // The surface turns inside a cylinder (its half-diagonal, from the floor to its highest
    // point); the camera stands on `dir` from a target at the cylinder's centre at the nearest
    // distance that keeps every sample of that cylinder inside the frame, then the target slides
    // along the camera's up vector so the surface sits in the middle of the canvas, not low.
    const probe = new PerspectiveCamera(camera.fov, 1, 0.1, 100);
    const projected0 = new Vector3();
    const cylinder: Vector3[] = [];
    const radius = Math.hypot(WIDTH / 2, DEPTH / 2);
    for (let a = 0; a < FIT_SAMPLES; a += 1) {
        const angle = (a / FIT_SAMPLES) * Math.PI * 2;
        cylinder.push(new Vector3(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius), new Vector3(Math.cos(angle) * radius, highest, Math.sin(angle) * radius));
    }
    const probeAt = (dir: Vector3, target: Vector3, distance: number): {fits: boolean; yMid: number} => {
        probe.aspect = camera.aspect;
        probe.updateProjectionMatrix();
        probe.position.copy(target).addScaledVector(dir, distance);
        probe.lookAt(target);
        probe.updateMatrixWorld(true);
        let fits = true;
        let yMin = Infinity;
        let yMax = -Infinity;
        for (const sample of cylinder) {
            projected0.copy(sample).project(probe);
            if (Math.abs(projected0.x) > FIT_MARGIN || Math.abs(projected0.y) > FIT_MARGIN) fits = false;
            yMin = Math.min(yMin, projected0.y);
            yMax = Math.max(yMax, projected0.y);
        }
        return {fits, yMid: (yMin + yMax) / 2};
    };
    const fitDistance = (dir: Vector3, target: Vector3): number => {
        let low = MIN_DISTANCE;
        let high = MAX_DISTANCE;
        if (probeAt(dir, target, low).fits) return low;
        for (let i = 0; i < 24; i += 1) {
            const mid = (low + high) / 2;
            if (probeAt(dir, target, mid).fits) high = mid;
            else low = mid;
        }
        return high;
    };
    const framingFor = (dir: Vector3): Framing => {
        const target = new Vector3(0, (baseY + highest) / 2, 0);
        let distance = fitDistance(dir, target);
        const {yMid} = probeAt(dir, target, distance);
        const up = new Vector3(0, 1, 0).applyQuaternion(probe.quaternion);
        target.addScaledVector(up, yMid * distance * Math.tan((camera.fov * Math.PI) / 360));
        distance = fitDistance(dir, target);
        return {target, position: target.clone().addScaledVector(dir, distance)};
    };
    const directionOf = (preset: CameraPreset): Vector3 => new Vector3(...CAMERA_PRESETS[preset]).normalize();
    // The current direction, re-fitted (a resize); no tween.
    const refit = () => {
        const dir = camera.position.clone().sub(controls.target);
        if (dir.lengthSq() === 0) dir.copy(directionOf('angle'));
        const framing = framingFor(dir.normalize());
        controls.target.copy(framing.target);
        camera.position.copy(framing.position);
        camera.lookAt(framing.target);
    };

    // ---- the pointer ---------------------------------------------------------------------
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const queuePick = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        pending = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        schedule();
    };
    const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        queuePick(event);
    };
    const onPointerDown = (event: PointerEvent) => {
        engaged = true;
        if (event.pointerType !== 'touch') return;
        queuePick(event);
    };
    const clearHover = () => {
        engaged = false;
        pending = null;
        if (hovered === null) return;
        hovered = null;
        marker.visible = false;
        rowLine.visible = false;
        columnLine.visible = false;
        options.onHover(null);
        dirty = true;
        schedule();
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerleave', clearHover);

    const pick = () => {
        if (!pending) return;
        const point = pending;
        pending = null;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) return;
        ndc.set((point.x / width) * 2 - 1, -(point.y / height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (!hit?.uv) {
            clearHover();
            return;
        }
        hovered = cellFromUv(hit.uv, days, rows);
        marker.visible = true;
        rowLine.visible = true;
        columnLine.visible = true;
        syncHighlight();
        options.onHover({cell: hovered, x: point.x, y: point.y, width});
        dirty = true;
    };

    // ---- the story markers ---------------------------------------------------------------
    const projected = new Vector3();
    const placeMarkers = () => {
        const elements = options.markers();
        if (elements.length === 0) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        surface.notable.forEach((cell, index) => {
            const element = elements[index];
            if (!element) return;
            const k = rowOfLookback(cell.lookback, rows) * days + cell.day;
            projected.set(position.getX(k), position.getY(k), position.getZ(k)).project(camera);
            const visible = projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
            element.style.visibility = visible ? 'visible' : 'hidden';
            if (visible) {
                // Centred on the point, but kept inside the canvas: a label at the edge is read whole.
                const half = element.offsetWidth / 2;
                const x = Math.min(width - half, Math.max(half, ((projected.x + 1) / 2) * width));
                const y = Math.max(element.offsetHeight + 12, ((1 - projected.y) / 2) * height);
                element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
            }
        });
    };

    const frame = (now: number) => {
        raf = 0;
        if (disposed || !active) return;
        let moved = false;
        if (cameraTween) {
            const t = easeInOut(progress(cameraTween.start, cameraTween.ms, now));
            camera.position.lerpVectors(cameraTween.from, cameraTween.to, t);
            controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, t);
            if (t >= 1) cameraTween = null;
            moved = true;
        }
        if (heightTween) {
            const t = progress(heightTween.start, heightTween.ms, now);
            applyHeights(heightTween.from + (heightTween.to - heightTween.from) * easeInOut(t));
            if (t >= 1) heightTween = null;
            moved = true;
        }
        if (controls.update()) moved = true;
        pick();
        if (moved || dirty) {
            renderer.render(scene, camera);
            placeMarkers();
            dirty = false;
            const distance = camera.position.distanceTo(controls.target);
            if (Math.abs(distance - reportedDistance) > 0.01) {
                reportedDistance = distance;
                options.onZoom?.(distance);
            }
        }
        if (moved || cameraTween || heightTween || controls.autoRotate || pending) schedule();
    };

    // ---- size ----------------------------------------------------------------------------
    const host = canvas.parentElement ?? canvas;
    const resize = () => {
        const rect = host.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        refit();
        dirty = true;
        schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    paint();
    applyHeights(heightFactor);
    resize();
    options.onRotating(controls.autoRotate);
    schedule();

    return {
        setPreset: (preset) => {
            const framing = framingFor(directionOf(preset));
            pause();
            if (reduceMotion) {
                camera.position.copy(framing.position);
                controls.target.copy(framing.target);
                cameraTween = null;
                dirty = true;
            } else {
                cameraTween = {
                    from: camera.position.clone(), to: framing.position,
                    fromTarget: controls.target.clone(), toTarget: framing.target,
                    start: performance.now(), ms: PRESET_MS,
                };
            }
            resumeLater();
            schedule();
        },
        zoom: (factor) => zoomBy(factor),
        setFlat: (flat) => {
            flatTarget = flat ? 0 : 1;
            if (reduceMotion) {
                heightTween = null;
                applyHeights(flatTarget);
                dirty = true;
            } else {
                heightTween = {from: heightFactor, to: flatTarget, start: performance.now(), ms: FLATTEN_MS};
            }
            schedule();
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
                if (heightTween) {
                    heightTween = null;
                    applyHeights(flatTarget);
                }
                if (cameraTween) {
                    camera.position.copy(cameraTween.to);
                    cameraTween = null;
                }
            } else {
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
            canvas.removeEventListener('pointerleave', clearHover);
            for (const g of [geometry, zero.geometry, floor.geometry, edgeGeometry, dropGeometry, rowGeometry, columnGeometry, marker.geometry]) g.dispose();
            for (const m of [material, zeroMaterial, floorMaterial, edgeMaterial, dropMaterial, highlightMaterial, markerMaterial]) m.dispose();
            texture.dispose();
            renderer.dispose();
        },
    };
};
