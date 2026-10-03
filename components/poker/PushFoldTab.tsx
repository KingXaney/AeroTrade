'use client';

import {useEffect, useMemo} from "react";
import {cn} from "@/lib/utils";
import {CLASSES, classLabel} from "@/lib/poker/cards";
import {PUSH_FOLD_STACK, validatePushFold, type PushFoldResult} from "@/lib/poker/pushfold";
import {POKER_COPY, PUSH_FOLD_ANTES, PUSH_FOLD_COPY} from "@/lib/learn/copy/poker";
import type {EngineChoice} from "@/components/poker/engine";
import {readSession, useSessionState} from "@/components/poker/session-store";
import {usePokerJob, type JobState} from "@/components/poker/usePokerJob";
import HandGrid, {type GridCell} from "@/components/poker/HandGrid";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import {fieldClass} from "@/components/primitives/TextField";

const JOB_KEY = 'poker:push-fold:job';
const STACK_STEP = 0.5;

const chartCells = (strategy: Float64Array, gains: Float64Array, seat: 'push' | 'call'): GridCell[] =>
    Array.from({length: CLASSES}, (_, classId) => {
        const share = strategy[classId];
        return {
            fill: share,
            text: share > 0.005 && share < 0.995 ? POKER_COPY.wholePercent(share) : undefined,
            title: PUSH_FOLD_COPY.cell(classLabel(classId), share, gains[classId], seat),
        };
    });

const solvedFor = (saved: JobState | undefined, stack: number, ante: number): boolean =>
    saved?.status === 'done' && saved.result?.kind === 'push-fold' && saved.result.result.stack === stack && saved.result.result.ante === ante;

// Heads-up push or fold: a stack and an ante in, both seats' equilibrium charts out, re-solved as the
// stack slider moves (a solve takes a few milliseconds; a newer one replaces the one before).
const PushFoldTab = ({engine: choice}: {engine: EngineChoice}) => {
    const [inputs, setInputs] = useSessionState('poker:push-fold:inputs', () => ({stack: 10, ante: 0}));
    const {state, run, engine} = usePokerJob(JOB_KEY, choice);
    const {stack, ante} = inputs;
    const issues = validatePushFold({stack, ante});
    const blocked = issues.length > 0;

    useEffect(() => {
        if (blocked || solvedFor(readSession<JobState>(JOB_KEY), stack, ante)) return;
        void run({kind: 'push-fold', input: {stack, ante}});
    }, [stack, ante, blocked, run]);

    const result: PushFoldResult | null = state.result?.kind === 'push-fold' ? state.result.result : null;
    const current = result !== null && state.status === 'done' && result.stack === stack && result.ante === ante;
    const pushCells = useMemo(() => (result ? chartCells(result.push, result.pushGain, 'push') : null), [result]);
    const callCells = useMemo(() => (result ? chartCells(result.call, result.callGain, 'call') : null), [result]);

    return (
        <div className="space-y-4" data-poker-tab="push-fold">
            <Panel aria-labelledby="push-fold-heading">
                <SectionHeading id="push-fold-heading" spacing="sm">{PUSH_FOLD_COPY.heading}</SectionHeading>
                <p className="mb-4 max-w-2xl text-sm leading-relaxed text-fg-soft">{PUSH_FOLD_COPY.lead}</p>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                    <label className="block min-w-56 flex-1 space-y-1 sm:max-w-sm">
                        <MicroLabel as="span" className="block">
                            <Term k="effective-stack">{PUSH_FOLD_COPY.stackLabel}</Term>: <span className="font-mono text-fg" data-push-fold-stack={stack}>{PUSH_FOLD_COPY.stack(stack)}</span>
                        </MicroLabel>
                        <input
                            type="range"
                            min={PUSH_FOLD_STACK.min}
                            max={PUSH_FOLD_STACK.max}
                            step={STACK_STEP}
                            value={stack}
                            aria-valuetext={PUSH_FOLD_COPY.stack(stack)}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setInputs((previous) => ({...previous, stack: next}));
                            }}
                            className="w-full accent-brand"
                            data-push-fold-slider
                        />
                    </label>
                    <label className="block space-y-1">
                        <MicroLabel as="span" className="block"><Term k="ante">{PUSH_FOLD_COPY.anteLabel}</Term></MicroLabel>
                        <select className={fieldClass('pr-8', 'body')} value={String(ante)} data-push-fold-ante
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setInputs((previous) => ({...previous, ante: next}));
                                }}>
                            {PUSH_FOLD_ANTES.map((value) => <option key={value} value={String(value)}>{PUSH_FOLD_COPY.ante(value)}</option>)}
                        </select>
                    </label>
                    <span className="font-mono text-[11px] text-fg-muted" data-poker-engine={engine}>{POKER_COPY.engine[engine]}</span>
                </div>
                {issues.length > 0 && (
                    <ul className="mt-3 space-y-0.5 text-xs text-warning" data-push-fold-issues>
                        {issues.map((issue) => <li key={issue}>{PUSH_FOLD_COPY.issue(issue, ante)}</li>)}
                    </ul>
                )}
                {state.status === 'failed' && state.message && <p className="mt-3 text-sm text-warning" role="alert">{POKER_COPY.failed(state.message)}</p>}
                <p className="mt-3 font-mono text-[11px] text-fg-muted" role="status" data-push-fold-status={current ? 'solved' : state.status}>
                    {current && result ? PUSH_FOLD_COPY.solved(result.iterations) : !blocked && state.status === 'running' ? PUSH_FOLD_COPY.solving : ' '}
                </p>
                {result && (
                    <div className={cn('mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5', !current && 'opacity-60')}
                         data-push-fold-result={`${result.stack}:${result.ante}`} data-push-share={result.pushShare.toFixed(6)} data-call-share={result.callShare.toFixed(6)}
                         data-exploitability={result.exploitability.toExponential(3)}>
                        <StatTile label={PUSH_FOLD_COPY.pushShare} value={PUSH_FOLD_COPY.share(result.pushShare)} hint={PUSH_FOLD_COPY.ofHands} valueClass="text-2xl"/>
                        <StatTile label={PUSH_FOLD_COPY.callShare} value={PUSH_FOLD_COPY.share(result.callShare)} hint={PUSH_FOLD_COPY.ofHands} valueClass="text-2xl"/>
                        <StatTile label={PUSH_FOLD_COPY.valueLabel} value={PUSH_FOLD_COPY.bb(result.value)}/>
                        <StatTile label={<Term k="exploitability">{PUSH_FOLD_COPY.exploitabilityLabel}</Term>} value={PUSH_FOLD_COPY.exploitability(result.exploitability)}/>
                        <StatTile label={<Term k="cfr">{PUSH_FOLD_COPY.iterationsLabel}</Term>} value={result.iterations.toLocaleString('en-US')}/>
                    </div>
                )}
                <WhatTheseMean id="push-fold-terms" keys={['push-fold', 'effective-stack', 'big-blind', 'ante', 'nash-equilibrium', 'exploitability', 'cfr']}/>
            </Panel>

            <Panel aria-labelledby="push-fold-charts-heading">
                <SectionHeading id="push-fold-charts-heading" spacing="sm">{PUSH_FOLD_COPY.chartsHeading}</SectionHeading>
                <p className="mb-2 text-xs text-fg-muted">{PUSH_FOLD_COPY.legend}</p>
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-fg-soft" data-push-fold-legend>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-brand/70"/>{PUSH_FOLD_COPY.legendAlways}</span>
                    <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="relative inline-block h-3 w-3 overflow-hidden rounded-sm bg-surface-1"><span className="absolute inset-x-0 bottom-0 h-1/2 bg-brand/70"/></span>
                        <Term k="mixed-strategy"/>
                    </span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-surface-1"/>{PUSH_FOLD_COPY.legendNever}</span>
                </div>
                <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-2', !current && 'opacity-60')}>
                    <div className="space-y-2">
                        <MicroLabel as="p">{PUSH_FOLD_COPY.pushChart}</MicroLabel>
                        {pushCells && <HandGrid cells={pushCells} label={PUSH_FOLD_COPY.pushChart} dataAttr="push"/>}
                    </div>
                    <div className="space-y-2">
                        <MicroLabel as="p">{PUSH_FOLD_COPY.callChart}</MicroLabel>
                        {callCells && <HandGrid cells={callCells} label={PUSH_FOLD_COPY.callChart} dataAttr="call"/>}
                    </div>
                </div>
                <WhatTheseMean id="push-fold-chart-terms" keys={['mixed-strategy']}/>
            </Panel>
        </div>
    );
};

export default PushFoldTab;
