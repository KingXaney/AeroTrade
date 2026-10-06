import type {MomentumSurface} from "@/lib/landing/momentum-surface";
import {formatSigma, slicePath} from "@/lib/landing/terrain-view";
import {TERRAIN_COPY} from "@/lib/learn/copy/terrain";
import MicroLabel from "@/components/primitives/MicroLabel";

// The 2D slice under the terrain: one lookback's row across the year, zero on the middle line,
// with a dot on the session under the pointer. It fixes what a 3D surface hides — a valley behind
// a hill, two heights that are hard to compare — and it is the same data as text in its heading.
// Pure React over the surface; the colours are theme classes, never hex.

const W = 600;
const H = 72;

type Props = {
    surface: MomentumSurface;
    // Index into surface.lookbacks.
    lookback: number;
    // Index into surface.dates, or null when nothing is hovered.
    day: number | null;
};

const TerrainSlice = ({surface, lookback, day}: Props) => {
    const row = surface.z[lookback];
    const max = surface.zAbsMax > 0 ? surface.zAbsMax : 1;
    const x = day === null ? null : row.length > 1 ? (day * W) / (row.length - 1) : 0;
    const y = day === null ? null : H / 2 - (row[day] / max) * (H / 2);
    return (
        <div data-terrain-slice={surface.lookbacks[lookback]}>
            <div className="flex items-baseline justify-between gap-3">
                <MicroLabel>{TERRAIN_COPY.sliceHeading(surface.lookbacks[lookback])}</MicroLabel>
                {day !== null && (
                    <span className="font-mono text-[11px] text-fg-soft">
                        {TERRAIN_COPY.tooltip.date(surface.dates[day])} · {formatSigma(row[day])}
                    </span>
                )}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full" aria-hidden="true">
                <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <path d={slicePath(row, W, H, max)} className="fill-none stroke-brand" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {x !== null && y !== null && <circle cx={x} cy={y} r={4} className="fill-fg" />}
            </svg>
            <p className="mt-1 text-[11px] text-fg-muted">{TERRAIN_COPY.sliceHint}</p>
        </div>
    );
};

export default TerrainSlice;
