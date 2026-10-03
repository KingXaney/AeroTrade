'use client';

import {useMemo, useRef, useState} from "react";
import {cn} from "@/lib/utils";
import {CLASS_COMBOS, CLASSES, COMBO_HI, COMBO_LO, classLabel, type Card} from "@/lib/poker/cards";
import {PREFLOP_RANKING} from "@/lib/poker/ranking";
import {classWeights, comboTotal, emptyRange, formatRange, parseRange, setClassWeight, topPercent, withoutCards, type Range, type RangeIssue} from "@/lib/poker/range";
import {RANGE_COPY} from "@/lib/learn/copy/poker";
import HandGrid, {type GridCell} from "@/components/poker/HandGrid";
import MicroLabel from "@/components/primitives/MicroLabel";
import TextField from "@/components/primitives/TextField";
import ActionButton from "@/components/primitives/ActionButton";

// A hand or range as the reader edits it: the text as typed, the weights it reads as, and what it
// could not read. Typing sets the weights from the text; the grid and Top x% set the text from the
// weights, so the two always say the same thing.
export type RangeState = {text: string; range: Range; issues: RangeIssue[]};

export const rangeFromText = (text: string): RangeState => {
    const {range, issues} = parseRange(text);
    return {text, range, issues};
};

export const rangeFromWeights = (range: Range): RangeState => ({text: formatRange(range), range, issues: []});

const BRUSHES = [1, 0.75, 0.5, 0.25] as const;

type Props = {
    id: string;
    label: string;
    value: RangeState;
    onChange: (update: (previous: RangeState) => RangeState) => void;
    // The board and dead cards, for the counts of what is left.
    dead: readonly Card[];
};

const RangeEditor = ({id, label, value, onChange, dead}: Props) => {
    const [brush, setBrush] = useState<number>(1);
    const [top, setTop] = useState<number | null>(null);
    // Whether this stroke adds (the brush's weight) or clears: decided by its first cell.
    const strokeWeight = useRef(1);

    const cells = useMemo((): GridCell[] => {
        const weights = classWeights(value.range);
        const isDead = new Uint8Array(52);
        for (const card of dead) isDead[card] = 1;
        return Array.from({length: CLASSES}, (_, classId) => {
            const live = CLASS_COMBOS[classId].filter((combo) => !isDead[COMBO_HI[combo]] && !isDead[COMBO_LO[combo]]).length;
            const weight = weights[classId];
            return {
                fill: weight,
                text: weight > 0 && weight < 1 ? `${Math.round(weight * 100)}%` : undefined,
                title: RANGE_COPY.cell(classLabel(classId), weight, live),
                muted: live === 0,
            };
        });
    }, [value.range, dead]);

    const total = comboTotal(value.range);
    const live = dead.length > 0 ? comboTotal(withoutCards(value.range, dead)) : null;

    const paint = (classId: number, first: boolean) => {
        if (first) {
            const current = classWeights(value.range)[classId];
            strokeWeight.current = Math.abs(current - brush) < 1e-9 ? 0 : brush;
        }
        const weight = strokeWeight.current;
        setTop(null);
        onChange((previous) => rangeFromWeights(setClassWeight(previous.range, classId, weight)));
    };

    return (
        <div className="space-y-3" data-range-editor={id}>
            <label className="block space-y-1">
                <MicroLabel as="span" className="block">{label} · {RANGE_COPY.textLabel}</MicroLabel>
                <TextField
                    value={value.text}
                    placeholder={RANGE_COPY.placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full"
                    data-range-text={id}
                    onChange={(event) => {
                        const text = event.target.value;
                        setTop(null);
                        onChange(() => rangeFromText(text));
                    }}
                />
            </label>
            {value.issues.length > 0 && (
                <ul className="space-y-0.5 text-xs text-warning" data-range-issues={id}>
                    {value.issues.map((issue, i) => <li key={`${issue.token}-${i}`}>{RANGE_COPY.issue(issue.kind, issue.token)}</li>)}
                </ul>
            )}
            <p className="font-mono text-[11px] text-fg-muted" data-range-combos={id} data-combos={total}>
                {RANGE_COPY.combos(total)} · {RANGE_COPY.share(total)}{live !== null && live !== total ? ` · ${RANGE_COPY.live(live)}` : ''}
            </p>
            <HandGrid cells={cells} label={RANGE_COPY.gridLabel(label)} onPaint={paint} dataAttr={id}/>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-1" role="group" aria-label={RANGE_COPY.brushLabel}>
                    <MicroLabel as="span" className="mr-1">{RANGE_COPY.brushLabel}</MicroLabel>
                    {BRUSHES.map((weight) => (
                        <button
                            key={weight}
                            type="button"
                            aria-pressed={brush === weight}
                            onClick={() => setBrush(weight)}
                            className={cn('rounded-md px-2 py-1 font-mono text-[11px] transition-colors', brush === weight ? 'bg-brand text-on-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg')}
                        >
                            {RANGE_COPY.brush(weight)}
                        </button>
                    ))}
                </div>
                <ActionButton variant="secondary" size="xs" onClick={() => { setTop(null); onChange(() => rangeFromWeights(emptyRange())); }} data-range-clear={id}>
                    {RANGE_COPY.clear}
                </ActionButton>
                <ActionButton variant="secondary" size="xs" onClick={() => { setTop(null); onChange(() => rangeFromText('random')); }} data-range-all={id}>
                    {RANGE_COPY.everyHand}
                </ActionButton>
            </div>
            <label className="block space-y-1">
                <MicroLabel as="span" className="block">
                    {RANGE_COPY.topLabel}: <span className="font-mono text-fg">{top === null ? '—' : RANGE_COPY.top(top)}</span>
                </MicroLabel>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={top ?? 0}
                    aria-label={RANGE_COPY.topLabel}
                    aria-valuetext={top === null ? undefined : RANGE_COPY.top(top)}
                    onChange={(event) => {
                        const pct = Number(event.target.value);
                        setTop(pct);
                        onChange(() => rangeFromWeights(topPercent(pct, PREFLOP_RANKING)));
                    }}
                    className="w-full accent-brand"
                    data-range-top={id}
                />
                <span className="block font-mono text-[10px] text-fg-muted">{RANGE_COPY.topHint}</span>
            </label>
        </div>
    );
};

export default RangeEditor;
