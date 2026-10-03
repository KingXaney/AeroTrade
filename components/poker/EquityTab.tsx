'use client';

import {useMemo} from "react";
import {cn} from "@/lib/utils";
import {CLASSES, classLabel, parseCardList} from "@/lib/poker/cards";
import {planEquity, validateEquity, type EquityInput, type EquityResult} from "@/lib/poker/equity";
import {EQUITY_COPY, CARDS_COPY, POKER_COPY} from "@/lib/learn/copy/poker";
import type {EngineChoice} from "@/components/poker/engine";
import {useSessionState} from "@/components/poker/session-store";
import {usePokerJob} from "@/components/poker/usePokerJob";
import CardsField from "@/components/poker/CardsField";
import HandGrid, {type GridCell} from "@/components/poker/HandGrid";
import ProgressLine from "@/components/poker/ProgressLine";
import RangeEditor, {rangeFromText, type RangeState} from "@/components/poker/RangeEditor";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import TextField, {fieldClass} from "@/components/primitives/TextField";

type Method = EquityInput['method'];
type Inputs = {sides: [RangeState, RangeState]; board: string; dead: string; method: Method; seed: number; ranFor: string | null};

const METHODS: readonly Method[] = ['auto', 'exact', 'monte-carlo'];
const JOB_KEY = 'poker:equity:job';

const keyOf = (inputs: Inputs): string => [inputs.sides[0].text, inputs.sides[1].text, inputs.board, inputs.dead, inputs.method, inputs.seed].join('|');

const heatCells = (result: EquityResult): GridCell[] =>
    Array.from({length: CLASSES}, (_, classId) => {
        const equity = result.byClass[classId];
        return {
            fill: equity ?? 0,
            text: equity === null ? undefined : POKER_COPY.wholePercent(equity),
            title: EQUITY_COPY.heatCell(classLabel(classId), equity),
            muted: equity === null,
        };
    });

// Equity between two hands or ranges: the inputs, the plan the engine will follow, Run and Stop
// with progress, and the result with each class's share for the first side.
const EquityTab = ({engine: choice}: {engine: EngineChoice}) => {
    const [inputs, setInputs] = useSessionState<Inputs>('poker:equity:inputs', () => ({
        sides: [rangeFromText('AhKh'), rangeFromText('QQ')], board: '', dead: '', method: 'auto', seed: 1, ranFor: null,
    }));
    const {state, run, stop, engine} = usePokerJob(JOB_KEY, choice);

    const board = useMemo(() => parseCardList(inputs.board), [inputs.board]);
    const dead = useMemo(() => parseCardList(inputs.dead), [inputs.dead]);
    const input = useMemo((): EquityInput => ({
        ranges: [inputs.sides[0].range, inputs.sides[1].range], board: board.cards, dead: dead.cards, method: inputs.method, seed: inputs.seed,
    }), [inputs.sides, inputs.method, inputs.seed, board.cards, dead.cards]);
    const cardsOk = board.unknown.length === 0 && board.repeated.length === 0 && dead.unknown.length === 0 && dead.repeated.length === 0;
    const issues = useMemo(() => (cardsOk ? validateEquity(input) : []), [cardsOk, input]);
    const plan = useMemo(() => (cardsOk && issues.length === 0 ? planEquity(input, true) : null), [cardsOk, issues, input]);
    const inView = useMemo(() => [...board.cards, ...dead.cards], [board.cards, dead.cards]);

    const running = state.status === 'running';
    const setSide = (index: 0 | 1) => (update: (previous: RangeState) => RangeState) =>
        setInputs((previous) => {
            const sides: [RangeState, RangeState] = [...previous.sides];
            sides[index] = update(previous.sides[index]);
            return {...previous, sides};
        });

    const start = () => {
        if (!plan) return;
        setInputs((previous) => ({...previous, ranFor: keyOf(previous)}));
        void run({kind: 'equity', input});
    };

    const result = state.result?.kind === 'equity' ? state.result.result : null;
    const progress = state.progress?.kind === 'equity' ? state.progress.progress : null;
    // A stopped Monte Carlo run keeps its estimate; a stopped enumeration has none.
    const estimate = state.status === 'stopped' && progress?.equity != null && progress.stdErr != null ? progress : null;
    const stale = result !== null && inputs.ranFor !== null && inputs.ranFor !== keyOf(inputs);
    const side = EQUITY_COPY.sides;

    return (
        <div className="space-y-4" data-poker-tab="equity">
            <Panel aria-labelledby="equity-heading">
                <SectionHeading id="equity-heading" spacing="sm">{EQUITY_COPY.heading}</SectionHeading>
                <p className="mb-4 max-w-2xl text-sm leading-relaxed text-fg-soft">{EQUITY_COPY.lead}</p>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <RangeEditor id="a" label={side[0]} value={inputs.sides[0]} onChange={setSide(0)} dead={inView}/>
                    <RangeEditor id="b" label={side[1]} value={inputs.sides[1]} onChange={setSide(1)} dead={inView}/>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <CardsField id="board" label={CARDS_COPY.boardLabel} hint={CARDS_COPY.boardHint} placeholder={CARDS_COPY.boardPlaceholder}
                                value={inputs.board} onChange={(text) => setInputs((previous) => ({...previous, board: text}))}/>
                    <CardsField id="dead" label={CARDS_COPY.deadLabel} hint={CARDS_COPY.deadHint} placeholder={CARDS_COPY.deadPlaceholder}
                                value={inputs.dead} onChange={(text) => setInputs((previous) => ({...previous, dead: text}))}/>
                </div>
                <div className="mt-5 flex flex-wrap items-end gap-4">
                    <label className="block space-y-1">
                        <MicroLabel as="span" className="block">{EQUITY_COPY.methodLabel}</MicroLabel>
                        <select className={fieldClass('pr-8', 'body')} value={inputs.method} data-equity-method
                                onChange={(event) => setInputs((previous) => ({...previous, method: event.target.value as Method}))}>
                            {METHODS.map((method) => <option key={method} value={method}>{EQUITY_COPY.methods[method]}</option>)}
                        </select>
                    </label>
                    {inputs.method === 'monte-carlo' && (
                        <label className="block space-y-1">
                            <MicroLabel as="span" className="block">{EQUITY_COPY.seedLabel}</MicroLabel>
                            <TextField type="number" min={0} step={1} value={inputs.seed} className="w-28" data-equity-seed
                                       onChange={(event) => setInputs((previous) => ({...previous, seed: Math.max(0, Math.floor(Number(event.target.value) || 0))}))}/>
                        </label>
                    )}
                    {running ? (
                        <ActionButton size="md" variant="secondary" onClick={stop} data-equity-stop>{EQUITY_COPY.stop}</ActionButton>
                    ) : (
                        <ActionButton size="md" onClick={start} disabled={!plan} data-equity-run>{EQUITY_COPY.run}</ActionButton>
                    )}
                    <span className="font-mono text-[11px] text-fg-muted" data-poker-engine={engine}>{POKER_COPY.engine[engine]}</span>
                </div>
                {plan && <p className="mt-3 font-mono text-[11px] text-fg-soft" data-equity-plan={plan.method} data-equity-boards={plan.boards}>{EQUITY_COPY.plan(plan)}</p>}
                {issues.length > 0 && (
                    <ul className="mt-3 space-y-0.5 text-xs text-warning" data-equity-issues>
                        {issues.map((issue) => <li key={issue}>{EQUITY_COPY.issue(issue)}</li>)}
                    </ul>
                )}
                {running && (
                    <div className="mt-3">
                        <ProgressLine
                            share={progress ? progress.done / progress.total : null}
                            label={!progress ? EQUITY_COPY.working : progress.equity === null ? EQUITY_COPY.boardsDone(progress.done, progress.total) : EQUITY_COPY.dealsDone(progress.done, progress.equity, progress.stdErr)}
                        />
                    </div>
                )}
                <WhatTheseMean id="equity-input-terms" keys={['hand-range', 'combination', 'card-removal', 'exact-enumeration', 'monte-carlo']}/>
            </Panel>

            <Panel aria-labelledby="equity-result-heading" data-equity-result={state.status}>
                <SectionHeading id="equity-result-heading" spacing="sm">{EQUITY_COPY.resultHeading}</SectionHeading>
                {state.status === 'failed' && state.message && <p className="mb-3 text-sm text-warning" role="alert" data-equity-failed>{POKER_COPY.failed(state.message)}</p>}
                {state.status === 'stopped' && (
                    <p className="mb-3 text-sm text-fg-soft" data-equity-stopped={estimate ? 'estimate' : 'none'}>
                        {estimate ? EQUITY_COPY.stoppedSample(estimate.done) : EQUITY_COPY.stoppedExact}
                    </p>
                )}
                {estimate && (
                    <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4" data-equity-estimate={String(estimate.equity)}>
                        <StatTile label={<Term k="hand-equity">{EQUITY_COPY.equityLabel(side[0])}</Term>} value={POKER_COPY.percent(estimate.equity ?? 0)}/>
                        <StatTile label={<Term k="hand-equity">{EQUITY_COPY.equityLabel(side[1])}</Term>} value={POKER_COPY.percent(1 - (estimate.equity ?? 0))}/>
                        <StatTile label={<Term k="standard-error">{EQUITY_COPY.errorLabel}</Term>} value={EQUITY_COPY.points(estimate.stdErr ?? 0)}/>
                        <StatTile label={EQUITY_COPY.dealsLabel} value={estimate.done.toLocaleString('en-US')}/>
                    </div>
                )}
                {result ? (
                    <div className={cn('space-y-4', state.status !== 'done' && 'opacity-60')}
                         data-equity-value={String(result.equity)} data-equity-method-used={result.method}
                         data-equity-win={result.win === null ? undefined : String(result.win)} data-equity-tie={result.tie === null ? undefined : String(result.tie)} data-equity-boards-used={result.boards} data-equity-samples={result.samples}>
                        {stale && <p className="text-xs text-fg-muted" data-equity-stale>{EQUITY_COPY.stale}</p>}
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                            <StatTile label={<Term k="hand-equity">{EQUITY_COPY.equityLabel(side[0])}</Term>} value={POKER_COPY.percent(result.equity)} valueClass="text-2xl"/>
                            <StatTile label={<Term k="hand-equity">{EQUITY_COPY.equityLabel(side[1])}</Term>} value={POKER_COPY.percent(1 - result.equity)} valueClass="text-2xl"/>
                            <StatTile label={EQUITY_COPY.winLabel} value={result.win === null ? '—' : POKER_COPY.percent(result.win)}/>
                            <StatTile label={EQUITY_COPY.tieLabel} value={result.tie === null ? '—' : POKER_COPY.percent(result.tie)}/>
                            <StatTile label={EQUITY_COPY.methodTile} value={EQUITY_COPY.methodName(result.method)}/>
                            {result.method === 'monte-carlo' && result.stdErr !== null ? (
                                <StatTile label={<Term k="standard-error">{EQUITY_COPY.errorLabel}</Term>} value={EQUITY_COPY.points(result.stdErr)} hint={EQUITY_COPY.dealsDone(result.samples, null, null)}/>
                            ) : result.method === 'exact' ? (
                                <StatTile label={EQUITY_COPY.boardsLabel} value={result.boards.toLocaleString('en-US')}/>
                            ) : null}
                        </div>
                        {result.method === 'table' && <p className="text-xs text-fg-muted">{EQUITY_COPY.winTieNote}</p>}
                        <div className="max-w-xl space-y-2">
                            <MicroLabel as="p"><Term k="hand-class">{EQUITY_COPY.heatHeading}</Term></MicroLabel>
                            <p className="text-xs text-fg-muted">{EQUITY_COPY.heatLead(side[0])}</p>
                            <HandGrid cells={heatCells(result)} label={EQUITY_COPY.heatHeading} dataAttr="equity-heat"/>
                        </div>
                    </div>
                ) : !estimate && state.status !== 'failed' && (
                    <p className="text-sm text-fg-muted">{EQUITY_COPY.nothingYet}</p>
                )}
                <WhatTheseMean id="equity-result-terms" keys={['hand-equity', 'standard-error', 'hand-class']}/>
            </Panel>
        </div>
    );
};

export default EquityTab;
