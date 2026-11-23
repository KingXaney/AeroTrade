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
    // Home's strip, where the slice sits in a narrow column: the hovered session gets a line of its
    // own under the heading, kept while nothing is hovered, so a hover never moves the column.
    stacked?: boolean;
};

const TerrainSlice = ({surface, lookback, day, stacked = false}: Props) => {
    const row = surface.z[lookback];
    const max = surface.zAbsMax > 0 ? surface.zAbsMax : 1;
    const x = day === null ? null : row.length > 1 ? (day * W) / (row.length - 1) : 0;
    const y = day === null ? null : H / 2 - (row[day] / max) * (H / 2);
    const heading = TERRAIN_COPY.sliceHeading(surface.lookbacks[lookback]);
    const session = day === null ? null : `${TERRAIN_COPY.tooltip.date(surface.dates[day])} · ${formatSigma(row[day])}`;
    return (
        <div data-terrain-slice={surface.lookbacks[lookback]}>
            {stacked ? (
                <>
                    <MicroLabel as="p">{heading}</MicroLabel>
                    <p className="h-4 font-mono text-[11px] leading-4 text-fg-soft" data-terrain-slice-session>{session}</p>
                </>
            ) : (
                <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>{heading}</MicroLabel>
                    {session !== null && <span className="font-mono text-[11px] text-fg-soft">{session}</span>}
                </div>
            )}
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
