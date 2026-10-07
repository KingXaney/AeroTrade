'use client';

import {useEffect, useRef, useState, type ReactNode} from "react";
import {LOOKBACKS, type MomentumSurface} from "@/lib/landing/momentum-surface";
import {
    CAMERA_PRESET_IDS,
    formatSigma,
    legendTicks,
    parseCssColor,
    TERRAIN_STOPS,
    type CameraPreset,
    type Rgb,
} from "@/lib/landing/terrain-view";
import {TERRAIN_COPY} from "@/lib/learn/copy/terrain";
import {paintHeatmap} from "@/components/landing/terrain-heatmap";
import {useCoarsePointer, useReducedMotion, useThemeStamp, useWebGL} from "@/components/three/scene-env";
import type {TerrainHit, TerrainPalette, TerrainScene} from "@/components/landing/terrain-scene";
import TerrainSlice from "@/components/landing/TerrainSlice";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import {cn} from "@/lib/utils";

// SPY's momentum over the last year as a 3D surface, on two pages. The landing hero renders
// nothing for it on the server; this fetches app/api/landing/surface after paint. Home reads the
// same store on the server and hands the surface in as `initial`, so the panel is drawn only when
// there is one and never shows a loading box. Either way the three.js scene
// (components/landing/terrain-scene.ts) loads with a dynamic import; without WebGL the same grid
// is the 2D heatmap; without data the box says so and nothing else is drawn (invariant 8).
//
// Motion follows the OS setting and the in-app toggle (html[data-motion]): no auto-rotate, no
// intro, presets and the flatten toggle jump. The colours are the --terrain-* and foreground
// tokens read from the document, re-read when the page's theme changes, so no hex lives here
// (invariant 5). `children` is the page's one "What these mean" for the panel, shown only once
// there is a surface to explain.

type Status = 'loading' | 'ready' | 'flat' | 'unavailable';
type Size = 'hero' | 'panel';

const SURFACE_URL = '/api/landing/surface';
const GREY: Rgb = [128, 128, 128];
const DEFAULT_ROW = Math.max(0, LOOKBACKS.indexOf(20));
// One press of − or + : the camera's distance, times this.
const ZOOM_IN = 0.8;
const ZOOM_OUT = 1.25;
// The canvas: the landing's hero column, or a full-width panel on Home. 4:3 and 16:9 under lg.
const SIZE: Record<Size, string> = {
    hero: 'aspect-[4/3] max-h-[520px] lg:aspect-auto lg:h-[500px] lg:max-h-none',
    panel: 'aspect-[16/9] max-h-[440px] lg:aspect-auto lg:h-[400px] lg:max-h-none',
};

const isSurface = (value: unknown): value is MomentumSurface => {
    if (typeof value !== 'object' || value === null) return false;
    const s = value as Partial<MomentumSurface>;
    return Array.isArray(s.dates) && s.dates.length > 0 && Array.isArray(s.lookbacks) && Array.isArray(s.z)
        && s.z.length === s.lookbacks.length && s.z.every((row) => Array.isArray(row) && row.length === s.dates?.length)
        && Array.isArray(s.price) && typeof s.zAbsMax === 'number' && typeof s.updated === 'string' && Array.isArray(s.notable)
        && (s.source === 'tiingo' || s.source === 'stored');
};

const readPalette = (): TerrainPalette => {
    const style = getComputedStyle(document.documentElement);
    const read = (token: string): Rgb => parseCssColor(style.getPropertyValue(token)) ?? GREY;
    return {scale: TERRAIN_STOPS.map((stop) => read(stop.token)), fg: read('--fg'), zero: read('--terrain-zero')};
};

type Props = {
    // A surface the page already read (Home): drawn at once, nothing fetched. Without one the
    // component fetches the route itself (the landing page, which reads nothing).
    initial?: MomentumSurface;
    // Off when the host gives the panel its own heading.
    eyebrow?: boolean;
    size?: Size;
    children?: ReactNode;
};

const MomentumTerrain = ({initial, eyebrow = true, size = 'hero', children}: Props) => {
    // undefined: not read yet; null: nothing to draw.
    const [fetched, setFetched] = useState<MomentumSurface | null | undefined>(initial);
    const [sceneFailed, setSceneFailed] = useState(false);
    const [hover, setHover] = useState<TerrainHit | null>(null);
    const [preset, setPreset] = useState<CameraPreset>('angle');
    const [flat, setFlat] = useState(false);
    const [rotating, setRotating] = useState(false);
    // The camera's distance from the surface, for the zoom buttons' state and the QA's eyes.
    const [distance, setDistance] = useState<number | null>(null);

    const webgl = useWebGL();
    const stamp = useThemeStamp();
    const osReduced = useReducedMotion();
    const coarse = useCoarsePointer();
    const reduced = osReduced || stamp.endsWith('|reduced');

    const surface = fetched ?? null;
    const status: Status = fetched === undefined ? 'loading'
        : fetched === null ? 'unavailable'
        : webgl === null ? 'loading'
        : webgl && !sceneFailed ? 'ready' : 'flat';

    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const flatRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<TerrainScene | null>(null);
    const markerRefs = useRef<(HTMLElement | null)[]>([]);
    const reducedRef = useRef(reduced);
    const coarseRef = useRef(coarse);

    // The data, when the page did not hand it in.
    useEffect(() => {
        if (initial !== undefined) return;
        const controller = new AbortController();
        (async () => {
            try {
                const response = await fetch(SURFACE_URL, {signal: controller.signal});
                if (!response.ok) {
                    setFetched(null);
                    return;
                }
                const data: unknown = await response.json();
                setFetched(isSurface(data) ? data : null);
            } catch {
                if (!controller.signal.aborted) setFetched(null);
            }
        })();
        return () => controller.abort();
    }, [initial]);

    // The latest flags, for a scene created after they were read.
    useEffect(() => {
        reducedRef.current = reduced;
        sceneRef.current?.setReduceMotion(reduced);
    }, [reduced]);
    useEffect(() => {
        coarseRef.current = coarse;
    }, [coarse]);

    // The 3D scene, loaded on demand; a failure falls back to the flat drawing.
    useEffect(() => {
        if (status !== 'ready' || !surface) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cancelled = false;
        let scene: TerrainScene | null = null;
        import('@/components/landing/terrain-scene')
            .then(({createTerrainScene}) => {
                if (cancelled) return;
                try {
                    scene = createTerrainScene({
                        canvas,
                        surface,
                        palette: readPalette(),
                        reduceMotion: reducedRef.current,
                        coarsePointer: coarseRef.current,
                        onHover: setHover,
                        onRotating: setRotating,
                        onZoom: setDistance,
                        markers: () => markerRefs.current,
                    });
                    sceneRef.current = scene;
                } catch (error) {
                    console.error('Momentum terrain: the scene could not start', error);
                    setSceneFailed(true);
                }
            })
            .catch(() => {
                if (!cancelled) setSceneFailed(true);
            });
        return () => {
            cancelled = true;
            scene?.dispose();
            sceneRef.current = null;
        };
    }, [status, surface]);

    // Draw only while the terrain is on screen and the tab is visible.
    useEffect(() => {
        if (status !== 'ready') return;
        const host = hostRef.current;
        if (!host) return;
        let inView = true;
        const apply = () => sceneRef.current?.setActive(inView && !document.hidden);
        const observer = new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? true;
            apply();
        });
        observer.observe(host);
        document.addEventListener('visibilitychange', apply);
        return () => {
            observer.disconnect();
            document.removeEventListener('visibilitychange', apply);
        };
    }, [status]);

    // The theme's tokens, on first draw and whenever the page is repainted.
    useEffect(() => {
        if (!surface) return;
        if (status === 'flat' && flatRef.current) paintHeatmap(flatRef.current, surface, readPalette().scale);
        sceneRef.current?.setPalette(readPalette());
    }, [stamp, status, surface]);

    const choosePreset = (next: CameraPreset) => {
        setPreset(next);
        sceneRef.current?.setPreset(next);
    };
    const toggleFlat = () => {
        setFlat(!flat);
        sceneRef.current?.setFlat(!flat);
    };
    const zoom = (factor: number) => sceneRef.current?.zoom(factor);

    const drawn = surface !== null && (status === 'ready' || status === 'flat');
    const days = surface?.dates.length ?? 0;
    const label = surface
        ? TERRAIN_COPY.ariaLabel({updated: surface.updated, days, z20: surface.z[DEFAULT_ROW][days - 1]})
        : undefined;
    const tipOnLeft = hover !== null && hover.x > hover.width * 0.55;
    const cell = hover?.cell ?? null;

    return (
        <div
            data-terrain
            data-terrain-size={size}
            data-terrain-state={status}
            data-terrain-motion={reduced ? 'reduced' : 'auto'}
            data-terrain-rotating={rotating ? 'true' : 'false'}
            data-terrain-distance={distance === null ? undefined : distance.toFixed(1)}
        >
            {eyebrow && <MicroLabel tone="brand">{TERRAIN_COPY.eyebrow}</MicroLabel>}
            <div
                ref={hostRef}
                className={cn('relative w-full overflow-hidden rounded-[var(--panel-radius)]', eyebrow && 'mt-3', SIZE[size])}
                style={{touchAction: 'pan-y'}}
            >
                {status === 'ready' && <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full" />}
                {status === 'flat' && (
                    <canvas ref={flatRef} role="img" aria-label={label} className="block h-full w-full [image-rendering:pixelated]" />
                )}
                {status === 'loading' && (
                    <div className="absolute inset-0 grid place-items-end p-4" aria-live="polite">
                        <div className="absolute inset-0 animate-pulse bg-surface-2/40" aria-hidden="true" />
                        <p className="relative text-xs text-fg-muted">{TERRAIN_COPY.loading}</p>
                    </div>
                )}
                {status === 'unavailable' && (
                    <div className="absolute inset-0 grid place-items-center border border-line-strong/20 p-6 text-center rounded-[var(--panel-radius)]">
                        <p className="max-w-sm text-sm text-fg-muted">{TERRAIN_COPY.unavailable}</p>
                    </div>
                )}
                {status === 'ready' && surface?.notable.map((marked, index) => (
                    <div
                        key={`${marked.day}-${marked.lookback}`}
                        ref={(element) => {
                            markerRefs.current[index] = element;
                        }}
                        data-terrain-marker={index}
                        className="pointer-events-none absolute left-0 top-0 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded border border-line-strong/40 bg-surface-1/90 px-2 py-1 font-mono text-[10px] text-fg-soft"
                        style={{visibility: 'hidden'}}
                    >
                        {TERRAIN_COPY.notable({date: surface.dates[marked.day], lookback: surface.lookbacks[marked.lookback], z: marked.z})}
                    </div>
                ))}
                {hover && surface && cell && (
                    <div
                        data-terrain-tip
                        aria-hidden="true"
                        className={cn(
                            'pointer-events-none absolute z-10 rounded-lg border border-line-strong/40 bg-surface-1/95 px-3 py-2 text-xs shadow-lg',
                            tipOnLeft ? '-translate-x-full -translate-y-full -ml-3 -mt-3' : 'ml-3 -mt-3 -translate-y-full',
                        )}
                        style={{left: hover.x, top: hover.y}}
                    >
                        <p className="font-heading font-semibold text-fg">{TERRAIN_COPY.tooltip.date(surface.dates[cell.day])}</p>
                        <p className="text-fg-soft">{TERRAIN_COPY.tooltip.lookback(surface.lookbacks[cell.lookback])}</p>
                        <p className="font-mono text-fg">{formatSigma(surface.z[cell.lookback][cell.day])}</p>
                        <p className="text-fg-muted">{TERRAIN_COPY.tooltip.close(surface.price[cell.day])}</p>
                    </div>
                )}
            </div>

            {drawn && surface && (
                <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {status === 'ready' && (
                            <>
                                <div role="group" aria-label={TERRAIN_COPY.cameraLabel} className="flex gap-1">
                                    {CAMERA_PRESET_IDS.map((id) => (
                                        <ActionButton
                                            key={id}
                                            variant="secondary"
                                            size="xs"
                                            aria-pressed={preset === id}
                                            data-terrain-preset={id}
                                            className={cn(preset === id && 'border-brand/40 bg-brand/10 text-brand')}
                                            onClick={() => choosePreset(id)}
                                        >
                                            {TERRAIN_COPY.presets[id]}
                                        </ActionButton>
                                    ))}
                                </div>
                                <ActionButton
                                    variant="secondary"
                                    size="xs"
                                    aria-pressed={flat}
                                    data-terrain-flatten
                                    className={cn(flat && 'border-brand/40 bg-brand/10 text-brand')}
                                    onClick={toggleFlat}
                                >
                                    {flat ? TERRAIN_COPY.raise : TERRAIN_COPY.flatten}
                                </ActionButton>
                                <div role="group" aria-label={TERRAIN_COPY.zoomLabel} className="flex gap-1">
                                    <ActionButton variant="secondary" size="xs" aria-label={TERRAIN_COPY.zoomIn} data-terrain-zoom="in" className="font-mono" onClick={() => zoom(ZOOM_IN)}>+</ActionButton>
                                    <ActionButton variant="secondary" size="xs" aria-label={TERRAIN_COPY.zoomOut} data-terrain-zoom="out" className="font-mono" onClick={() => zoom(ZOOM_OUT)}>−</ActionButton>
                                </div>
                            </>
                        )}
                        <p className="ml-auto text-xs text-fg-muted">
                            {status === 'flat' ? TERRAIN_COPY.flat : coarse ? TERRAIN_COPY.hintTouch : TERRAIN_COPY.hint}
                        </p>
                    </div>

                    <div className="mt-4 flex items-center gap-3" data-terrain-legend>
                        <span className="text-[11px] text-fg-muted">{TERRAIN_COPY.legend.below}</span>
                        <div className="relative h-2 flex-1 rounded-full terrain-scale">
                            {legendTicks(surface.zAbsMax).map((tick) => (
                                <span
                                    key={tick.label}
                                    className="absolute top-3 -translate-x-1/2 font-mono text-[10px] text-fg-muted"
                                    style={{left: `${((tick.at + 1) / 2) * 100}%`}}
                                >
                                    {tick.label}
                                </span>
                            ))}
                        </div>
                        <span className="text-[11px] text-fg-muted">{TERRAIN_COPY.legend.above}</span>
                    </div>

                    <div className="mt-8">
                        <TerrainSlice surface={surface} lookback={cell?.lookback ?? DEFAULT_ROW} day={cell?.day ?? null} />
                    </div>

                    <p className="mt-4 text-xs leading-relaxed text-fg-muted" data-terrain-caption>{TERRAIN_COPY.caption(days)}</p>
                    <p className="mt-1 text-xs text-fg-muted" data-terrain-updated data-terrain-source={surface.source}>
                        {TERRAIN_COPY.updated(surface.updated)} · {TERRAIN_COPY.source[surface.source]}
                        {surface.source === 'tiingo' && (
                            <>
                                {' · '}
                                <a href={TERRAIN_COPY.tiingoHref} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                                    {TERRAIN_COPY.tiingoCredit}
                                </a>
                            </>
                        )}
                    </p>
                    {children}
                </>
            )}
        </div>
    );
};

export default MomentumTerrain;
