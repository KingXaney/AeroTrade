import {cn} from "@/lib/utils";

// The equity curve for one leaderboard row. Dependency-free in the same spirit as
// PerformanceChart: a polyline, a baseline and a terminal dot, nothing else.
//
// `min`/`max` are the COLUMN's domain, not this row's. Eight independently auto-scaled
// sparks in a *ranked* table would draw a +2% strategy exactly like a +137% one, which
// is the same failure as a column of em-dashes — it just looks busier. Most sparks
// therefore read flat next to the best row, and that is the information.
//
// No area fill: a gradient under an 18px line is decoration carrying nothing.

const WIDTH = 64;
const HEIGHT = 18;
const PAD_Y = 2;

type Props = {
    // Already downsampled and expressed as % return (see toSparkPct in views.ts).
    values: readonly number[];
    min: number;
    max: number;
    // Read aloud instead of the curve; must name the basis, since live and simulated
    // numbers are never allowed to read as one.
    label: string;
    basis: 'live' | 'simulated';
    className?: string;
};

const Sparkline = ({values, min, max, label, basis, className}: Props) => {
    // A single point is not a curve, and a flat domain has no shape to show.
    if (values.length < 2 || max === min) return null;

    const span = max - min;
    const x = (i: number) => (i / (values.length - 1)) * WIDTH;
    const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (HEIGHT - PAD_Y * 2);

    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = values[values.length - 1];
    const zeroY = y(0);

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width={WIDTH}
            height={HEIGHT}
            preserveAspectRatio="none"
            role="img"
            aria-label={label}
            data-spark={basis}
            className={cn('shrink-0 overflow-visible', className)}
        >
            <line
                x1="0" x2={WIDTH} y1={zeroY} y2={zeroY}
                className="stroke-line-strong/40"
                strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"
            />
            <polyline
                points={points}
                fill="none"
                className={basis === 'live' ? 'stroke-brand' : 'stroke-fg-muted'}
                strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
            {/* A flat line still needs a readable end. */}
            <circle
                cx={WIDTH} cy={y(last)} r="1.5"
                className={last > 0 ? 'fill-positive' : last < 0 ? 'fill-negative' : 'fill-fg-muted'}
            />
        </svg>
    );
};

export default Sparkline;
