'use client';

import {useState} from "react";
import PerformanceChart, {type DollarLine} from "@/components/analytics/PerformanceChart";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import SimulatedStats from "@/components/strategies/SimulatedStats";
import {paramLabel, positionText, whatIfDiffLine, WHATIF_COPY, WHATIF_LAB} from "@/lib/learn/copy/whatif";
import {cn} from "@/lib/utils";
import type {LabKnob, WhatIfLabVariant, WhatIfLabView} from "@/lib/strategies/whatif";

// The what-if lab on a strategy page: the same rule over the stored backtest's three years with
// ONE setting moved, from the grid the nightly job precomputes (lib/strategies/whatif.ts). Every
// variant arrives as a prop, so the control switches them without a round trip and nothing is
// persisted by looking. A single-knob rule gets a slider over its positions; a rule with more
// knobs gets one row of positions per knob, and moving one returns the others to the catalog.
// The chart sets "What-if" beside "Stored backtest (catalog setting)" on the same dates, and the
// tiles below are the stored backtest's own tiles for the setting (#whatif-stats) — no delta,
// no colour saying which is ahead, no ranking, and no variant trades (their reasons would print
// the catalog's parameters). Imports only types from the lab; every sentence is from the copy.

type Props = {view: WhatIfLabView};

// Positions with something to show: the catalog value (the stored backtest) and every value a
// stored variant computed.
const available = (knob: LabKnob, variants: readonly WhatIfLabVariant[]): number[] =>
    knob.positions.filter((value) => value === knob.catalog || variants.some((v) => v.knob === knob.key && v.value === value));

const WhatIfLab = ({view}: Props) => {
    const {knobs, stored, variants} = view;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = variants.find((v) => v.id === selectedId) ?? null;

    const valueOf = (knob: LabKnob): number => (selected?.knob === knob.key ? selected.value : knob.catalog);
    const choose = (knob: LabKnob, value: number) => {
        const match = variants.find((v) => v.knob === knob.key && v.value === value);
        setSelectedId(value === knob.catalog || !match ? null : match.id);
    };

    if (stored === null || variants.length === 0) {
        return (
            <section id="whatif-lab" aria-labelledby="whatif-lab-heading" className="scroll-mt-24">
                <Panel as="div" id="whatif-lab-panel">
                    <SectionHeading id="whatif-lab-heading" spacing="none">{WHATIF_LAB.heading}</SectionHeading>
                    <p className="text-sm text-fg-muted mt-2" data-testid="whatif-pending">{WHATIF_LAB.pending}</p>
                </Panel>
            </section>
        );
    }

    const diffLine = whatIfDiffLine(selected?.changes ?? []);
    const lines: DollarLine[] = [
        ...(selected ? [{key: 'whatif', label: WHATIF_COPY.whatIfSeries, tone: 'brand' as const, values: selected.values}] : []),
        {key: 'stored', label: WHATIF_COPY.storedSeries, tone: 'muted', values: stored.values},
    ];

    return (
        <section id="whatif-lab" aria-labelledby="whatif-lab-heading" className="space-y-3 scroll-mt-24">
            <Panel as="div" id="whatif-lab-panel">
                <SectionHeading id="whatif-lab-heading" spacing="none">{WHATIF_LAB.heading}</SectionHeading>
                <p className="font-mono text-[11px] text-fg-muted mt-1" id="whatif-window">{WHATIF_LAB.window(stored.from, stored.to)}</p>

                <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3" id="whatif-controls">
                    {knobs.length === 1
                        ? <KnobSlider knob={knobs[0]} positions={available(knobs[0], variants)} value={valueOf(knobs[0])} onChange={(value) => choose(knobs[0], value)} />
                        : knobs.map((knob) => (
                            <KnobButtons key={knob.key} knob={knob} positions={available(knob, variants)} value={valueOf(knob)} onChange={(value) => choose(knob, value)} />
                        ))}
                </div>
                {knobs.length > 1 && <p className="font-mono text-[11px] text-fg-muted mt-2">{WHATIF_LAB.oneAtATime}</p>}

                <p className="font-mono text-xs text-fg mt-4" id="whatif-diff" data-variant={selected?.id ?? 'catalog'} aria-live="polite">{diffLine}</p>
                <figure className="mt-2">
                    <PerformanceChart dollars={{dates: stored.dates, lines, baseline: stored.values[0], ariaLabel: WHATIF_LAB.chartAria(diffLine)}} />
                </figure>
                <p className="font-mono text-[11px] text-fg-muted mt-3" data-testid="whatif-caveat">{WHATIF_COPY.caveat}</p>
            </Panel>

            <SimulatedStats id="whatif-stats" stats={selected?.stats ?? stored.stats} />
        </section>
    );
};

type ControlProps = {knob: LabKnob; positions: number[]; value: number; onChange: (value: number) => void};

// Five positions on one knob, the catalog value among them.
const KnobSlider = ({knob, positions, value, onChange}: ControlProps) => {
    const index = Math.max(0, positions.indexOf(value));
    const label = paramLabel(knob.key);
    return (
        <label className="flex flex-col gap-2 w-full max-w-md">
            <MicroLabel>{label}</MicroLabel>
            <input
                type="range" id="whatif-slider" min={0} max={positions.length - 1} step={1} value={index}
                data-knob={knob.key}
                aria-valuetext={WHATIF_LAB.knobAria(label, positionText(positions[index], positions[index] === knob.catalog))}
                onChange={(e) => onChange(positions[Number(e.target.value)] ?? knob.catalog)}
                className="w-full accent-brand"
            />
            <span className="flex justify-between font-mono text-[11px]" aria-hidden="true">
                {positions.map((position) => (
                    <span key={position} data-position={position} className={position === value ? 'text-brand' : 'text-fg-muted'}>
                        {positionText(position, position === knob.catalog)}
                    </span>
                ))}
            </span>
        </label>
    );
};

// Two or three positions per knob, as a group of pressed/unpressed buttons.
const KnobButtons = ({knob, positions, value, onChange}: ControlProps) => {
    const label = paramLabel(knob.key);
    return (
        <div className="flex flex-col gap-2">
            <MicroLabel>{label}</MicroLabel>
            <div role="group" aria-label={label} className="flex items-center gap-1 rounded-lg border border-line-strong/20 p-0.5 w-fit">
                {positions.map((position) => (
                    <button
                        key={position}
                        type="button"
                        data-knob={knob.key}
                        data-value={position}
                        aria-pressed={position === value}
                        onClick={() => onChange(position)}
                        className={cn(
                            'px-3 py-1 rounded-md font-mono text-[11px] font-bold tracking-[0.04em] transition-colors',
                            position === value ? 'bg-brand/10 text-brand' : 'text-fg-muted hover:text-fg',
                        )}
                    >
                        {positionText(position, position === knob.catalog)}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default WhatIfLab;
