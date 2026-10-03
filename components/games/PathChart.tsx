import {cn} from "@/lib/utils";

// `stroke` and `swatch` are full literal token classes (stroke-brand, bg-brand): Tailwind cannot see a
// class assembled at runtime.
export type PathSeries = {id: string; values: readonly number[]; stroke: string; swatch: string; label: string};

// Several paths on one set of axes — a bankroll after each flip — from zero to the highest value
// any of them reached. Presentational and client-safe; the colours are token classes.
const PathChart = ({series, label, width = 600, height = 180}: {series: readonly PathSeries[]; label: string; width?: number; height?: number}) => {
    const longest = Math.max(2, ...series.map((s) => s.values.length));
    const top = Math.max(1, ...series.flatMap((s) => s.values));
    const point = (value: number, i: number) => `${((i / (longest - 1)) * width).toFixed(1)},${(height - (value / top) * height).toFixed(1)}`;
    return (
        <figure className="space-y-2">
            <svg viewBox={`-2 -2 ${width + 4} ${height + 4}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={label} data-path-chart>
                <line x1={0} y1={height} x2={width} y2={height} className="stroke-line-strong" strokeWidth={1}/>
                {series.map((s) => (
                    <polyline key={s.id} points={s.values.map(point).join(' ')} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke"
                              strokeLinejoin="round" className={s.stroke} data-series={s.id}/>
                ))}
            </svg>
            <figcaption className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-fg-muted">
                {series.map((s) => (
                    <span key={s.id} className="flex items-center gap-1.5">
                        <span aria-hidden="true" className={cn('inline-block h-0.5 w-4', s.swatch)}/>
                        {s.label}
                    </span>
                ))}
            </figcaption>
        </figure>
    );
};

export default PathChart;
