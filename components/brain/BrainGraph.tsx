'use client';

import {useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {evidenceHref} from "@/lib/brain/links";
import {layoutGraph, type GraphEdge} from "@/lib/brain/graph-layout";
import type {BrainEntitySummary} from "@/lib/brain/types";
import {BRAIN_COPY} from "@/lib/learn/copy/brain";
import {readTokens, useCoarsePointer, useReducedMotion, useThemeStamp, useWebGL} from "@/components/three/scene-env";
import type {GraphPalette, GraphScene} from "@/components/brain/graph-scene";
import BrainGraph2D from "@/components/brain/BrainGraph2D";
import {cn} from "@/lib/utils";

// The knowledge graph in 3D: the brain's entities on three concentric shells — themes inner,
// sectors middle, tickers outer (lib/brain/graph-layout) — as spheres sized by persistent
// attention and coloured by sentiment, an active thesis haloed, the links among them as lines.
// The three.js scene (components/brain/graph-scene.ts) loads on demand; a browser without WebGL
// gets the SVG rings (BrainGraph2D) instead, and an empty brain its empty state.
//
// Every entity's label is a real link to its evidence (evidenceHref), placed over the canvas by
// the scene, so Tab reaches it and Enter opens it exactly as the SVG's nodes did; the canvas
// itself is aria-hidden and the host is role="group", never "img". Hover or focus on a label
// lights its sphere and links; a click on a sphere opens the same evidence. Colours are the
// theme's tokens read from the document (invariant 5); motion follows the OS setting and the
// in-app toggle.

type Props = {nodes: BrainEntitySummary[]; edges: GraphEdge[]};

const TOKENS = {positive: '--positive', negative: '--negative', muted: '--fg-muted', brand: '--brand', line: '--line-strong', fg: '--fg'} as const;
const readPalette = (): GraphPalette => readTokens(TOKENS);
const MAX_LABEL = 16;

const BrainGraph = ({nodes, edges}: Props) => {
    const webgl = useWebGL();
    const stamp = useThemeStamp();
    const osReduced = useReducedMotion();
    const coarse = useCoarsePointer();
    const reduced = osReduced || stamp.endsWith('|reduced');
    const router = useRouter();

    const [sceneFailed, setSceneFailed] = useState(false);
    const [ready, setReady] = useState(false);
    const [hover, setHover] = useState<string | null>(null);
    const [rotating, setRotating] = useState(false);
    const points = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);

    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<GraphScene | null>(null);
    const labelRefs = useRef<(HTMLElement | null)[]>([]);
    const reducedRef = useRef(reduced);
    const coarseRef = useRef(coarse);

    const threeD = webgl === true && !sceneFailed && nodes.length > 0;

    useEffect(() => {
        reducedRef.current = reduced;
        sceneRef.current?.setReduceMotion(reduced);
    }, [reduced]);
    useEffect(() => {
        coarseRef.current = coarse;
    }, [coarse]);

    // The scene, once there is WebGL and a canvas; a failure falls back to the SVG.
    useEffect(() => {
        if (!threeD) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cancelled = false;
        let scene: GraphScene | null = null;
        import('@/components/brain/graph-scene')
            .then(({createGraphScene}) => {
                if (cancelled) return;
                try {
                    scene = createGraphScene({
                        canvas,
                        points,
                        edges,
                        palette: readPalette(),
                        reduceMotion: reducedRef.current,
                        coarsePointer: coarseRef.current,
                        onHover: setHover,
                        onPick: (key) => router.push(evidenceHref(key)),
                        onRotating: setRotating,
                        labels: () => labelRefs.current,
                    });
                    sceneRef.current = scene;
                    setReady(true);
                } catch (error) {
                    console.error('Knowledge graph: the scene could not start', error);
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
    }, [threeD, points, edges, router]);

    // Draw only while the panel is on screen and the tab is visible.
    useEffect(() => {
        if (!threeD) return;
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
    }, [threeD]);

    // The theme's tokens, on first draw and whenever the page is repainted.
    useEffect(() => {
        sceneRef.current?.setPalette(readPalette());
    }, [stamp, ready]);

    if (nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-brain-graph="empty">
                <span className="material-symbols-outlined text-3xl text-fg-muted mb-2">neurology</span>
                <p className="text-sm text-fg-muted">{BRAIN_COPY.graphEmpty}</p>
            </div>
        );
    }
    if (webgl === false || sceneFailed) return <BrainGraph2D nodes={nodes} edges={edges} />;

    const hovered = hover === null ? null : points.find((p) => p.key === hover) ?? null;
    const light = (key: string | null) => sceneRef.current?.setHover(key);

    return (
        <div data-brain-graph="3d" data-brain-graph-state={ready ? 'ready' : 'loading'} data-brain-graph-rotating={rotating ? 'true' : 'false'}>
            <div
                ref={hostRef}
                role="group"
                aria-label={BRAIN_COPY.graphAria}
                className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--panel-radius)]"
                style={{touchAction: 'pan-y'}}
            >
                <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
                {!ready && <div className="absolute inset-0 animate-pulse bg-surface-2/40" aria-hidden="true" />}
                {points.map((p, i) => (
                    <Link
                        key={p.key}
                        href={evidenceHref(p.key)}
                        aria-label={`${p.node.displayName} — evidence`}
                        data-graph-node={p.key}
                        ref={(element) => {
                            labelRefs.current[i] = element;
                        }}
                        className={cn(
                            'absolute left-0 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                            hover === p.key ? 'border-brand/50 bg-surface-1/95 text-fg' : 'border-line-strong/30 bg-surface-1/80 text-fg-soft hover:text-fg',
                        )}
                        style={{visibility: 'hidden'}}
                        onMouseEnter={() => light(p.key)}
                        onMouseLeave={() => light(null)}
                        onFocus={() => light(p.key)}
                        onBlur={() => light(null)}
                    >
                        {p.node.displayName.length > MAX_LABEL ? `${p.node.displayName.slice(0, MAX_LABEL - 1)}…` : p.node.displayName}
                    </Link>
                ))}
            </div>

            <div className="flex items-center justify-between mt-2 text-[10px] text-fg-muted font-mono">
                <span>{BRAIN_COPY.graphShells}</span>
                <span>{hovered ? `${hovered.node.displayName} · weight ${hovered.node.weightSlow.toFixed(1)}` : BRAIN_COPY.graphHint3d}</span>
            </div>
        </div>
    );
};

export default BrainGraph;
