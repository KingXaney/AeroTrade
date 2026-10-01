'use client';

import {useMemo, useRef, useState} from "react";
import {formatPct} from "@/lib/format";
import type {PerfPoint} from '@/lib/trading/types';

// Hand-rolled SVG performance chart: an account's (or a quant strategy's) %-return since inception
// (cyan) vs SPY's total return (muted, lib/prices/total-return.ts). Deliberately
// dependency-free — two polylines and a hover crosshair cover the need.

const WIDTH = 720;
const HEIGHT = 240;
const PAD_X = 44;
const PAD_Y = 18;

// An optional shaded stretch of the x-axis — /portfolio passes the account's worst drawdown,
// peak date to trough date — with its legend text supplied by the caller (copy lives in
// lib/learn/copy). Dates not on the series draw nothing.
type ChartBand = {from: string; to: string; label: string};

const ReturnChart = ({series, accountName, band}: {series: PerfPoint[]; accountName: string; band?: ChartBand | null}) => {
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
        const bandFrom = band ? series.findIndex((p) => p.date === band.from) : -1;
        const bandTo = band ? series.findIndex((p) => p.date === band.to) : -1;
        const shade = bandFrom >= 0 && bandTo > bandFrom ? {x: x(bandFrom), width: x(bandTo) - x(bandFrom)} : null;
        return {x, y, accountPath, benchPath, zeroY, min, max, shade};
    }, [series, band]);

    if (!geometry) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined text-3xl text-fg-muted mb-2">monitoring</span>
                <p className="text-sm text-fg-muted">
                    Collecting daily performance data — check back tomorrow.
                </p>
                <p className="text-xs text-fg-muted mt-1 font-mono">
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
            <div className="flex flex-wrap items-center gap-4 mb-3 text-xs font-mono">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 rounded bg-brand" />
                    <span className="text-fg">{accountName}</span>
                    <span className="text-brand">{formatPct((hover ?? last).accountPct)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 rounded bg-fg-muted" />
                    <span className="text-fg-muted">S&amp;P 500 (SPY, total return)</span>
                    <span className="text-fg-soft">
                        {(hover ?? last).benchmarkPct === null ? '—' : formatPct((hover ?? last).benchmarkPct as number)}
                    </span>
                </span>
                {geometry.shade && band && (
                    <span className="flex items-center gap-1.5" data-testid="drawdown-band-legend">
                        <span className="inline-block w-3 h-2.5 rounded-sm bg-negative/15" />
                        <span className="text-fg-muted">{band.label}</span>
                    </span>
                )}
                <span className="ml-auto text-fg-muted">{(hover ?? last).date}</span>
            </div>

            <svg
                ref={svgRef}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="w-full h-auto"
                role="img"
                aria-label={`Performance of ${accountName} vs the S&P 500 total return since inception`}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverIdx(null)}
            >
                {/* Shaded band (under everything else) */}
                {geometry.shade && (
                    <rect data-testid="drawdown-band" x={geometry.shade.x} width={geometry.shade.width} y={PAD_Y} height={HEIGHT - PAD_Y * 2}
                          className="fill-negative/10" />
                )}
                {/* Zero line */}
                <line x1={PAD_X} x2={WIDTH - PAD_X} y1={geometry.zeroY} y2={geometry.zeroY}
                      className="stroke-line-strong/50" strokeDasharray="4 4" strokeWidth="1" />
                <text x={PAD_X - 6} y={geometry.zeroY + 3} textAnchor="end" fontSize="9"
                      className="fill-fg-muted font-mono">0%</text>
                <text x={PAD_X - 6} y={PAD_Y + 3} textAnchor="end" fontSize="9"
                      className="fill-fg-muted font-mono">{formatPct(geometry.max)}</text>
                <text x={PAD_X - 6} y={HEIGHT - PAD_Y + 3} textAnchor="end" fontSize="9"
                      className="fill-fg-muted font-mono">{formatPct(geometry.min)}</text>

                {/* Benchmark line (under the account line) */}
                {geometry.benchPath && (
                    <path d={geometry.benchPath} fill="none" className="stroke-fg-muted" strokeWidth="1.25" opacity="0.9" />
                )}
                {/* Account line */}
                <path d={geometry.accountPath} fill="none" className="stroke-brand" strokeWidth="1.75" />

                {/* Hover crosshair */}
                {hover && hoverIdx !== null && (
                    <g>
                        <line x1={geometry.x(hoverIdx)} x2={geometry.x(hoverIdx)} y1={PAD_Y} y2={HEIGHT - PAD_Y}
                              className="stroke-brand/35" strokeWidth="1" />
                        <circle cx={geometry.x(hoverIdx)} cy={geometry.y(hover.accountPct)} r="3" className="fill-brand" />
                        {hover.benchmarkPct !== null && (
                            <circle cx={geometry.x(hoverIdx)} cy={geometry.y(hover.benchmarkPct)} r="2.5" className="fill-fg-muted" />
                        )}
                    </g>
                )}
            </svg>
        </div>
    );
};

// ---------------------------------------------------------------------------------------------
// Dollar-value mode: lines of dollar values on one set of dates, around a dashed baseline. Built
// for "Time in the market" (the growth of each dollar contributed, three ways of owning SPY),
// where a series that takes deposits is not a return series and must never be rebased through
// toPerfSeries. Every label comes from the caller (copy lives in lib/learn/copy); the lines are
// told apart by colour and dash, and no colour says which line is ahead.
// ---------------------------------------------------------------------------------------------

export type DollarLineTone = 'brand' | 'secondary' | 'muted';
export type DollarLine = {key: string; label: string; tone: DollarLineTone; values: readonly number[]};
type DollarSeries = {dates: readonly string[]; lines: readonly DollarLine[]; baseline: number; ariaLabel: string};

const TONES: Record<DollarLineTone, {stroke: string; swatch: string; width: number; dash?: string}> = {
    brand: {stroke: 'stroke-brand', swatch: 'bg-brand', width: 1.75},
    secondary: {stroke: 'stroke-chart-2', swatch: 'bg-chart-2', width: 1.5},
    muted: {stroke: 'stroke-fg-muted', swatch: 'bg-fg-muted', width: 1.25, dash: '5 3'},
};

// Grouped, so an account worth $112,345.67 reads as one; the axis labels sit inside PAD_X, so from
// $10,000 up they shorten to thousands ("$112k"). Below that both print as before ("$1.23").
const formatDollars = (v: number) => `$${v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const formatAxisDollars = (v: number) => (Math.abs(v) >= 10_000 ? `$${(v / 1000).toFixed(0)}k` : formatDollars(v));

const DollarChart = ({dates, lines, baseline, ariaLabel}: DollarSeries) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const count = dates.length;

    const geometry = useMemo(() => {
        const drawn = lines.filter((line) => line.values.length === count);
        if (count < 2 || drawn.length === 0) return null;
        let min = baseline;
        let max = baseline;
        for (const line of drawn) for (const v of line.values) { if (v < min) min = v; if (v > max) max = v; }
        const span = max - min || 1;
        const x = (i: number) => PAD_X + (i / (count - 1)) * (WIDTH - PAD_X * 2);
        const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (HEIGHT - PAD_Y * 2);
        const paths = drawn.map((line) => ({line, d: line.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}));
        return {x, y, paths, drawn, min, max, baseY: y(baseline)};
    }, [lines, baseline, count]);

    if (!geometry) return null;

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
        const idx = Math.round(((px - PAD_X) / (WIDTH - PAD_X * 2)) * (count - 1));
        setHoverIdx(Math.max(0, Math.min(count - 1, idx)));
    };
    const at = hoverIdx ?? count - 1;

    return (
        <div data-testid="dollar-chart">
            <div className="flex flex-wrap items-center gap-4 mb-3 text-xs font-mono">
                {geometry.drawn.map((line) => (
                    <span key={line.key} className="flex items-center gap-1.5" data-line={line.key}>
                        <span className={`inline-block w-3 h-0.5 rounded ${TONES[line.tone].swatch}`} />
                        <span className="text-fg-muted">{line.label}</span>
                        <span className="text-fg" data-line-value>{formatDollars(line.values[at])}</span>
                    </span>
                ))}
                <span className="ml-auto text-fg-muted">{dates[at]}</span>
            </div>
            <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label={ariaLabel}
                 onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
                <line x1={PAD_X} x2={WIDTH - PAD_X} y1={geometry.baseY} y2={geometry.baseY}
                      className="stroke-line-strong/50" strokeDasharray="4 4" strokeWidth="1" />
                <text x={PAD_X - 6} y={geometry.baseY + 3} textAnchor="end" fontSize="9" className="fill-fg-muted font-mono">{formatAxisDollars(baseline)}</text>
                <text x={PAD_X - 6} y={PAD_Y + 3} textAnchor="end" fontSize="9" className="fill-fg-muted font-mono">{formatAxisDollars(geometry.max)}</text>
                <text x={PAD_X - 6} y={HEIGHT - PAD_Y + 3} textAnchor="end" fontSize="9" className="fill-fg-muted font-mono">{formatAxisDollars(geometry.min)}</text>
                {/* Drawn last-listed first, so the first line the caller lists sits on top. */}
                {[...geometry.paths].reverse().map(({line, d}) => (
                    <path key={line.key} d={d} fill="none" data-line={line.key} className={TONES[line.tone].stroke}
                          strokeWidth={TONES[line.tone].width} strokeDasharray={TONES[line.tone].dash} />
                ))}
                {hoverIdx !== null && (
                    <g>
                        <line x1={geometry.x(hoverIdx)} x2={geometry.x(hoverIdx)} y1={PAD_Y} y2={HEIGHT - PAD_Y} className="stroke-brand/35" strokeWidth="1" />
                        {geometry.drawn.map((line) => (
                            <circle key={line.key} cx={geometry.x(hoverIdx)} cy={geometry.y(line.values[hoverIdx])} r="2.5" className={`${TONES[line.tone].stroke} fill-bg`} strokeWidth="1.5" />
                        ))}
                    </g>
                )}
            </svg>
        </div>
    );
};

// One chart, two modes: a return series against SPY (the default), or dollar values.
type ReturnProps = {series: PerfPoint[]; accountName: string; band?: ChartBand | null; dollars?: undefined};
type DollarProps = {dollars: DollarSeries; series?: undefined; accountName?: undefined; band?: undefined};

const PerformanceChart = (props: ReturnProps | DollarProps) =>
    props.dollars !== undefined
        ? <DollarChart {...props.dollars} />
        : <ReturnChart series={props.series} accountName={props.accountName} band={props.band} />;

export default PerformanceChart;
