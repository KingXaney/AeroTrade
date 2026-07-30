'use client';

import {useMemo, useRef, useState} from "react";

// Hand-rolled SVG performance chart: the strategy's %-return since inception
// (cyan) vs the SPY benchmark (muted), from daily close snapshots. Deliberately
// dependency-free — two polylines and a hover crosshair cover the need.

const WIDTH = 720;
const HEIGHT = 240;
const PAD_X = 44;
const PAD_Y = 18;

const formatPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const PerformanceChart = ({series, accountName}: {series: PerfPoint[]; accountName: string}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const geometry = useMemo(() => {
        if (series.length < 2) return null;
        const values = series.flatMap((p) => (p.benchmarkPct === null ? [p.accountPct] : [p.accountPct, p.benchmarkPct]));
        const min = Math.min(...values, 0);
        const max = Math.max(...values, 0);
        const span = max - min || 1;

        const x = (i: number) => PAD_X + (i / (series.length - 1)) * (WIDTH - PAD_X * 2);
        const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (HEIGHT - PAD_Y * 2);

        const accountPath = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.accountPct).toFixed(1)}`).join(' ');
        const benchPath = series
            .map((p, i) => (p.benchmarkPct === null ? null : `${x(i).toFixed(1)},${y(p.benchmarkPct).toFixed(1)}`))
            .reduce<{path: string; drawing: boolean}>((acc, coord) => {
                if (coord === null) return {...acc, drawing: false};
                return {path: `${acc.path}${acc.drawing ? ' L' : ' M'}${coord}`, drawing: true};
            }, {path: '', drawing: false}).path.trim();

        const zeroY = y(0);
        return {x, y, accountPath, benchPath, zeroY, min, max};
    }, [series]);

    if (!geometry) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined text-3xl text-[#849495] mb-2">monitoring</span>
                <p className="text-sm text-[#849495]">
                    Collecting daily performance data — check back tomorrow.
                </p>
                <p className="text-xs text-[#849495] mt-1" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    A value snapshot is recorded every market day at close.
                </p>
            </div>
        );
    }

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
        const ratio = (px - PAD_X) / (WIDTH - PAD_X * 2);
        const idx = Math.round(ratio * (series.length - 1));
        setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
    };

    const hover = hoverIdx !== null ? series[hoverIdx] : null;
    const last = series[series.length - 1];

    return (
        <div>
            {/* Legend + current values */}
            <div className="flex flex-wrap items-center gap-4 mb-3 text-xs" style={{fontFamily: 'var(--font-jetbrains)'}}>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 rounded" style={{backgroundColor: '#7df4ff'}} />
                    <span className="text-[#e2e2e8]">{accountName}</span>
                    <span className="text-[#7df4ff]">{formatPct((hover ?? last).accountPct)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 rounded" style={{backgroundColor: '#849495'}} />
                    <span className="text-[#849495]">S&amp;P 500 (SPY)</span>
                    <span className="text-[#b9cacb]">
                        {(hover ?? last).benchmarkPct === null ? '—' : formatPct((hover ?? last).benchmarkPct as number)}
                    </span>
                </span>
                <span className="ml-auto text-[#849495]">{(hover ?? last).date}</span>
            </div>

            <svg
                ref={svgRef}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="w-full h-auto"
                role="img"
                aria-label={`Performance of ${accountName} vs the S&P 500 since inception`}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverIdx(null)}
            >
                {/* Zero line */}
                <line x1={PAD_X} x2={WIDTH - PAD_X} y1={geometry.zeroY} y2={geometry.zeroY}
                      stroke="rgba(59,73,75,0.5)" strokeDasharray="4 4" strokeWidth="1" />
                <text x={PAD_X - 6} y={geometry.zeroY + 3} textAnchor="end" fontSize="9"
                      fill="#849495" fontFamily="var(--font-jetbrains)">0%</text>
                <text x={PAD_X - 6} y={PAD_Y + 3} textAnchor="end" fontSize="9"
                      fill="#849495" fontFamily="var(--font-jetbrains)">{formatPct(geometry.max)}</text>
                <text x={PAD_X - 6} y={HEIGHT - PAD_Y + 3} textAnchor="end" fontSize="9"
                      fill="#849495" fontFamily="var(--font-jetbrains)">{formatPct(geometry.min)}</text>

                {/* Benchmark line (under the account line) */}
                {geometry.benchPath && (
                    <path d={geometry.benchPath} fill="none" stroke="#849495" strokeWidth="1.25" opacity="0.9" />
                )}
                {/* Account line */}
                <path d={geometry.accountPath} fill="none" stroke="#7df4ff" strokeWidth="1.75" />

                {/* Hover crosshair */}
                {hover && hoverIdx !== null && (
                    <g>
                        <line x1={geometry.x(hoverIdx)} x2={geometry.x(hoverIdx)} y1={PAD_Y} y2={HEIGHT - PAD_Y}
                              stroke="rgba(125,244,255,0.35)" strokeWidth="1" />
                        <circle cx={geometry.x(hoverIdx)} cy={geometry.y(hover.accountPct)} r="3" fill="#7df4ff" />
                        {hover.benchmarkPct !== null && (
                            <circle cx={geometry.x(hoverIdx)} cy={geometry.y(hover.benchmarkPct)} r="2.5" fill="#849495" />
                        )}
                    </g>
                )}
            </svg>
        </div>
    );
};

export default PerformanceChart;
