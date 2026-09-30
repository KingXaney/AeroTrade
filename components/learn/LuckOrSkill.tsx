import type {LuckRead} from "@/lib/learn/luck-read";
import type {LuckReady} from "@/lib/learn/random-portfolios";
import {LUCK_COPY} from "@/lib/learn/copy/luck";
import {pctOneDecimal} from "@/lib/learn/copy/portfolio";
import {describeUnpriced} from "@/lib/trading/analytics";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import EmptyState from "@/components/primitives/EmptyState";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// "Luck or skill": the account's return placed among a thousand seeded random five-stock
// portfolios held over the same days (lib/learn/random-portfolios.ts), drawn as a histogram
// with three labelled markers — you, SPY, the median — told apart by label and dash, never by
// colour alone. A placement, not a verdict. Server component; each bar's native tooltip gives
// its range and count, and the marker list beneath is the same data as text.

const W = 720;
const H = 190;
const PAD_X = 16;
const TOP = 42;        // room for up to two rows of marker labels
const BASE = H - 22;   // baseline; axis labels sit under it
const LABEL_GAP = 96;  // labels closer than this share no row

type MarkerKey = 'you' | 'spy' | 'median';
type Marker = {key: MarkerKey; label: string; pct: number};

// A path for one bar: square at the baseline, 3px rounded at the data end.
const barPath = (x: number, width: number, top: number): string => {
    const r = Math.min(3, width / 2, (BASE - top) / 2);
    if (r <= 0) return `M${x},${BASE}h${width}v0h${-width}z`;
    return `M${x},${BASE}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${BASE}z`;
};

const MARKER_CLASS: Record<MarkerKey, {line: string; dash?: string; text: string}> = {
    you: {line: 'stroke-brand', text: 'fill-fg'},
    spy: {line: 'stroke-fg-muted', dash: '5 3', text: 'fill-fg-muted'},
    median: {line: 'stroke-fg', dash: '1 3', text: 'fill-fg-muted'},
};

const Histogram = ({view, markers}: {view: LuckReady; markers: Marker[]}) => {
    const {min, max, counts, binWidth} = view.histogram;
    const band = (W - PAD_X * 2) / counts.length;
    const tallest = Math.max(1, ...counts);
    const x = (pct: number) => PAD_X + ((pct - min) / (max - min)) * (W - PAD_X * 2);
    const y = (count: number) => BASE - (count / tallest) * (BASE - TOP);
    // Greedy rows: a label goes on the first row whose last label is far enough to its left.
    const rows: number[] = [];
    const placed = [...markers].sort((a, b) => x(a.pct) - x(b.pct)).map((marker) => {
        const at = x(marker.pct);
        let row = rows.findIndex((last) => at - last >= LABEL_GAP);
        if (row === -1) row = rows.length < 2 ? rows.length : 1;
        rows[row] = at;
        return {...marker, at, row};
    });
    const zero = min < 0 && max > 0 ? x(0) : null;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={LUCK_COPY.chartLabel(view)} data-testid="luck-histogram">
            {counts.map((count, i) => {
                const from = min + i * binWidth;
                return count === 0 ? null : (
                    <path key={i} d={barPath(PAD_X + i * band + 1, Math.max(1, band - 2), y(count))} className="fill-fg-muted/35" data-luck-bar>
                        <title>{LUCK_COPY.binTitle(from, from + binWidth, count)}</title>
                    </path>
                );
            })}
            <line x1={PAD_X} x2={W - PAD_X} y1={BASE} y2={BASE} className="stroke-line-strong/50" strokeWidth="1" />
            {zero !== null && <line x1={zero} x2={zero} y1={TOP} y2={BASE} className="stroke-line-strong/40" strokeDasharray="2 4" strokeWidth="1" />}
            <text x={PAD_X} y={H - 5} fontSize="12" className="fill-fg-muted font-mono">{pctOneDecimal(min)}</text>
            <text x={W - PAD_X} y={H - 5} fontSize="12" textAnchor="end" className="fill-fg-muted font-mono">{pctOneDecimal(max)}</text>
            {placed.map((marker) => {
                const style = MARKER_CLASS[marker.key];
                const labelY = 14 + marker.row * 16;
                const anchor = marker.at < PAD_X + 50 ? 'start' : marker.at > W - PAD_X - 50 ? 'end' : 'middle';
                return (
                    <g key={marker.key} data-luck-marker={marker.key}>
                        <line x1={marker.at} x2={marker.at} y1={labelY + 4} y2={BASE} className={style.line}
                              strokeWidth={marker.key === 'you' ? 2 : 1.5} strokeDasharray={style.dash} />
                        <text x={marker.at} y={labelY} fontSize="12" textAnchor={anchor} className={`${style.text} font-mono`}>
                            {LUCK_COPY.markerValue(marker.label, marker.pct)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const LuckOrSkill = ({luck}: {luck: LuckRead}) => {
    const body = (() => {
        if (luck.status === 'needs-days') {
            return <EmptyState title={LUCK_COPY.needsDaysTitle} description={LUCK_COPY.needsDaysDescription(luck.sessions)} className="px-0" />;
        }
        if (luck.status === 'no-prices') {
            return <EmptyState title={LUCK_COPY.noPricesTitle} description={LUCK_COPY.noPricesDescription} className="px-0" />;
        }
        const view = luck;
        const markers: Marker[] = [
            ...(view.yours ? [{key: 'you' as const, label: LUCK_COPY.marker.you, pct: view.yours.pct}] : []),
            ...(view.spyPct !== null ? [{key: 'spy' as const, label: LUCK_COPY.marker.spy, pct: view.spyPct}] : []),
            {key: 'median' as const, label: LUCK_COPY.marker.median, pct: view.medianPct},
        ];
        const unpricedNote = view.withheld === 'unpriced' ? describeUnpriced(luck.unpriced, luck.holdings) : null;
        return (
            <>
                <p className="font-heading text-sm text-fg leading-snug" data-testid="luck-landed">
                    {view.yours ? LUCK_COPY.landed({...view, yours: view.yours}) : LUCK_COPY.sampleOnly(view)}
                </p>
                {unpricedNote && (
                    <p role="status" className="mt-1 font-mono text-[11px] text-warning" data-testid="luck-withheld">{unpricedNote}</p>
                )}
                {view.withheld === 'no-snapshot' && (
                    <p className="mt-1 font-mono text-[11px] text-fg-muted" data-testid="luck-withheld">{LUCK_COPY.noSnapshot}</p>
                )}
                {view.withheld === 'not-yours' && (
                    <p className="mt-1 font-mono text-[11px] text-fg-muted" data-testid="luck-withheld">{LUCK_COPY.notYours}</p>
                )}
                <p className="mt-1 font-mono text-[11px] text-fg-muted" data-testid="luck-window">{LUCK_COPY.window(view)}</p>
                <div className="mt-3">
                    <Histogram view={view} markers={markers} />
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-fg" data-testid="luck-markers">
                    {markers.map((marker) => (
                        <li key={marker.key} data-luck-value={marker.key}>{LUCK_COPY.markerValue(marker.label, marker.pct)}</li>
                    ))}
                </ul>
                <WhatTheseMean keys={['random-portfolios', ...(view.yours ? ['percentile'] : []), 'median', 'benchmark', 'survivorship-bias']}>
                    <p className="text-xs text-fg-muted leading-relaxed" data-testid="luck-method">{LUCK_COPY.method(view)}</p>
                </WhatTheseMean>
            </>
        );
    })();

    return (
        <Panel id="luck-or-skill" aria-labelledby="luck-heading">
            <SectionHeading id="luck-heading" spacing="sm">{LUCK_COPY.heading}</SectionHeading>
            {body}
        </Panel>
    );
};

export default LuckOrSkill;
