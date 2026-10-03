'use client';

import {useMemo} from "react";
import {cn} from "@/lib/utils";
import {CLASSES, classLabel, parseCardList} from "@/lib/poker/cards";
import {withoutCards} from "@/lib/poker/range";
import {RIVER_MAX_ITERATIONS, RIVER_TARGET_PCT, validateRiver, type RiverInput, type RiverMethod, type RiverResult} from "@/lib/poker/river/solver";
import {actionKind, buildTree, DECISION, estimateBytes, estimateMsPerIteration, FOLD, pathTo, RIVER_LIMITS, type RiverConfig} from "@/lib/poker/river/tree";
import {viewAt, type NodeView} from "@/lib/poker/river/view";
import {CARDS_COPY, POKER_COPY, RIVER_COPY, type RiverPreset} from "@/lib/learn/copy/poker";
import type {EngineChoice} from "@/components/poker/engine";
import {useSessionState} from "@/components/poker/session-store";
import {usePokerJob} from "@/components/poker/usePokerJob";
import CardsField from "@/components/poker/CardsField";
import ExploitabilityChart from "@/components/poker/ExploitabilityChart";
import HandGrid, {SEGMENT_TONES, type GridCell} from "@/components/poker/HandGrid";
import ProgressLine from "@/components/poker/ProgressLine";
import RangeEditor, {rangeFromText, type RangeState} from "@/components/poker/RangeEditor";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Switch from "@/components/primitives/Switch";
import Term from "@/components/primitives/Term";
import TextField, {fieldClass} from "@/components/primitives/TextField";

type Inputs = {
    sides: [RangeState, RangeState];
    board: string;
    pot: string;
    stack: string;
    bets: [string, string];
    raises: [string, string];
    allIn: boolean;
    raiseCap: number;
    method: RiverMethod;
    ranFor: string | null;
};

const PRESETS: Record<RiverPreset, Omit<Inputs, 'ranFor' | 'method'>> = {
    polarized: {
        sides: [rangeFromText('AA, 65s'), rangeFromText('KQs')], board: 'Ah Kd 7c 4s 2h', pot: '10', stack: '100',
        bets: ['75', ''], raises: ['', ''], allIn: false, raiseCap: 0,
    },
    realistic: {
        sides: [rangeFromText('TT+, AQ+, KQs, QJs, JTs, 98s, A5s-A2s'), rangeFromText('99-66, AJ+, KQ, QTs+, JTs, T9s, 87s, 65s')],
        board: 'Qs Jh 7d 4c 2s', pot: '10', stack: '30', bets: ['33, 75', '50'], raises: ['100', '100'], allIn: true, raiseCap: 2,
    },
};

const JOB_KEY = 'poker:river:job';
const RAISE_CAPS = [0, 1, 2, 3, 4] as const;
const METHODS: readonly RiverMethod[] = ['dcfr', 'cfr+'];

const keyOf = (inputs: Inputs): string =>
    [inputs.sides[0].text, inputs.sides[1].text, inputs.board, inputs.pot, inputs.stack, ...inputs.bets, ...inputs.raises, inputs.allIn, inputs.raiseCap, inputs.method].join('|');

// "33, 75" → [33, 75]; null names the first token that is not a size.
const parseSizes = (text: string): {sizes: number[]; bad: string | null} => {
    const sizes: number[] = [];
    for (const token of text.split(/[\s,%]+/).filter(Boolean)) {
        const value = Number(token);
        if (!Number.isFinite(value)) return {sizes, bad: token};
        sizes.push(value);
    }
    return {sizes, bad: null};
};

// A node's actions get a tone each: check, fold and call their own; sized bets and raises the brand
// in rising strength by amount; the all-in last.
const tonesOf = (view: NodeView): number[] => {
    const sized = view.actions.map((action, a) => ({action, a})).filter(({action}) => action.kind === 'bet' || action.kind === 'raise').sort((x, y) => x.action.amount - y.action.amount);
    return view.actions.map((action, a) => {
        if (action.kind === 'check') return 0;
        if (action.kind === 'fold') return 1;
        if (action.kind === 'call') return 2;
        if (action.kind === 'all-in') return 7;
        return Math.min(6, 3 + sized.findIndex((entry) => entry.a === a));
    });
};

const strategyCells = (view: NodeView, labels: readonly string[], tones: readonly number[]): GridCell[] =>
    Array.from({length: CLASSES}, (_, classId) => {
        const cell = view.classes[classId];
        const reaches = cell.combos > 1e-9;
        return {
            fill: 0,
            muted: !reaches,
            segments: reaches ? cell.freq.map((share, a) => ({share, tone: tones[a]})) : [],
            title: RIVER_COPY.cell(classLabel(classId), cell.combos, cell.freq.map((share, a) => ({action: labels[a], share})), Number.isFinite(cell.ev) ? cell.ev : null),
        };
    });

// The river solver: a spot in, the equilibrium out, browsable decision by decision.
const RiverTab = ({engine: choice}: {engine: EngineChoice}) => {
    const [inputs, setInputs] = useSessionState<Inputs>('poker:river:inputs', () => ({...PRESETS.polarized, method: 'dcfr', ranFor: null}));
    const [selected, setSelected] = useSessionState<number>('poker:river:node', () => 0);
    const {state, run, stop, engine} = usePokerJob(JOB_KEY, choice);
    const players = RIVER_COPY.players;

    const board = useMemo(() => parseCardList(inputs.board), [inputs.board]);
    const parsed = useMemo(() => ({
        bets: inputs.bets.map(parseSizes) as [ReturnType<typeof parseSizes>, ReturnType<typeof parseSizes>],
        raises: inputs.raises.map(parseSizes) as [ReturnType<typeof parseSizes>, ReturnType<typeof parseSizes>],
    }), [inputs.bets, inputs.raises]);
    const maxDecisions = engine === 'main' ? RIVER_LIMITS.maxDecisionsOnPage : RIVER_LIMITS.maxDecisions;
    const config = useMemo((): RiverConfig => ({
        pot: Number(inputs.pot),
        stack: Number(inputs.stack),
        betSizes: [parsed.bets[0].sizes, parsed.bets[1].sizes],
        raiseSizes: [parsed.raises[0].sizes, parsed.raises[1].sizes],
        allIn: inputs.allIn,
        raiseCap: inputs.raiseCap,
    }), [inputs.pot, inputs.stack, inputs.allIn, inputs.raiseCap, parsed]);
    const input = useMemo((): RiverInput => ({
        board: board.cards, ranges: [inputs.sides[0].range, inputs.sides[1].range], config, method: inputs.method,
        maxIterations: RIVER_MAX_ITERATIONS, targetPct: RIVER_TARGET_PCT, maxDecisions,
    }), [board.cards, inputs.sides, config, inputs.method, maxDecisions]);
    const unreadable = [...parsed.bets, ...parsed.raises].map((p) => p.bad).filter((bad): bad is string => bad !== null);
    const cardsOk = board.unknown.length === 0 && board.repeated.length === 0;
    const issues = useMemo(() => (unreadable.length === 0 && cardsOk ? validateRiver(input) : []), [unreadable.length, cardsOk, input]);
    const summary = useMemo(() => {
        if (unreadable.length > 0 || issues.length > 0) return null;
        const tree = buildTree(config, maxDecisions);
        if (!tree) return null;
        const live = (range: Float64Array) => withoutCards(range, board.cards).filter((w) => w > 0).length;
        const counts: [number, number] = [live(inputs.sides[0].range), live(inputs.sides[1].range)];
        return {tree, megabytes: estimateBytes(tree, counts) / 1e6, ms: estimateMsPerIteration(tree, counts)};
    }, [unreadable.length, issues, config, maxDecisions, board.cards, inputs.sides]);
    const ready = summary !== null && unreadable.length === 0 && cardsOk;

    const running = state.status === 'running';
    const result: RiverResult | null = state.result?.kind === 'river' ? state.result.result : null;
    const progress = state.progress?.kind === 'river' ? state.progress.progress : null;
    const stale = result !== null && inputs.ranFor !== null && inputs.ranFor !== keyOf(inputs);
    const node = result && selected < result.tree.size && result.tree.kind[selected] === DECISION ? selected : 0;
    const view = useMemo(() => (result ? viewAt(result, node) : null), [result, node]);
    const {labels, tones, cells} = useMemo(() => {
        if (!view) return {labels: [] as string[], tones: [] as number[], cells: null};
        const names = view.actions.map((action) => RIVER_COPY.action(action.kind, action.amount, action.total));
        const shades = tonesOf(view);
        return {labels: names, tones: shades, cells: strategyCells(view, names, shades)};
    }, [view]);

    const setSide = (index: 0 | 1) => (update: (previous: RangeState) => RangeState) =>
        setInputs((previous) => {
            const sides: [RangeState, RangeState] = [...previous.sides];
            sides[index] = update(previous.sides[index]);
            return {...previous, sides};
        });
    const setPair = (key: 'bets' | 'raises', index: 0 | 1, text: string) =>
        setInputs((previous) => {
            const pair: [string, string] = [...previous[key]];
            pair[index] = text;
            return {...previous, [key]: pair};
        });
    const start = () => {
        if (!ready) return;
        setSelected(0);
        setInputs((previous) => ({...previous, ranFor: keyOf(previous)}));
        void run({kind: 'river', input});
    };

    return (
        <div className="space-y-4" data-poker-tab="river">
            <Panel aria-labelledby="river-heading">
                <SectionHeading id="river-heading" spacing="sm">{RIVER_COPY.heading}</SectionHeading>
                <p className="mb-4 max-w-2xl text-sm leading-relaxed text-fg-soft">{RIVER_COPY.lead}</p>
                <div className="mb-5 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <MicroLabel as="span">{RIVER_COPY.presetsLabel}</MicroLabel>
                        {(Object.keys(PRESETS) as RiverPreset[]).map((preset) => (
                            <ActionButton key={preset} variant="secondary" size="xs" data-river-preset={preset}
                                          onClick={() => setInputs((previous) => ({...previous, ...PRESETS[preset]}))}>
                                {RIVER_COPY.presets[preset]}
                            </ActionButton>
                        ))}
                    </div>
                    <ul className="space-y-0.5 text-xs text-fg-muted">
                        {(Object.keys(PRESETS) as RiverPreset[]).map((preset) => <li key={preset}><span className="text-fg-soft">{RIVER_COPY.presets[preset]}:</span> {RIVER_COPY.presetLines[preset]}</li>)}
                    </ul>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {([0, 1] as const).map((side) => (
                        <div key={side} className="space-y-3">
                            <RangeEditor id={side === 0 ? 'oop' : 'ip'} label={`${players[side]} · ${RIVER_COPY.playerNotes[side]}`} value={inputs.sides[side]} onChange={setSide(side)} dead={board.cards}/>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="block space-y-1">
                                    <MicroLabel as="span" className="block">{RIVER_COPY.betsLabel(players[side])}</MicroLabel>
                                    <TextField value={inputs.bets[side]} placeholder="33, 75" className="w-full" data-river-bets={side} onChange={(event) => setPair('bets', side, event.target.value)}/>
                                </label>
                                <label className="block space-y-1">
                                    <MicroLabel as="span" className="block">{RIVER_COPY.raisesLabel(players[side])}</MicroLabel>
                                    <TextField value={inputs.raises[side]} placeholder="100" className="w-full" data-river-raises={side} onChange={(event) => setPair('raises', side, event.target.value)}/>
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-2 font-mono text-[10px] text-fg-muted">{RIVER_COPY.sizesHint}</p>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <CardsField id="river-board" label={CARDS_COPY.boardLabel} hint={RIVER_COPY.boardHint} placeholder="Ah Kd 7c 4s 2h"
                                value={inputs.board} onChange={(text) => setInputs((previous) => ({...previous, board: text}))}/>
                    <label className="block space-y-1">
                        <MicroLabel as="span" className="block">{RIVER_COPY.potLabel}</MicroLabel>
                        <TextField type="number" inputMode="decimal" min={0} step="any" value={inputs.pot} className="w-full" data-river-pot
                                   onChange={(event) => setInputs((previous) => ({...previous, pot: event.target.value}))}/>
                    </label>
                    <label className="block space-y-1">
                        <MicroLabel as="span" className="block">{RIVER_COPY.stackLabel}</MicroLabel>
                        <TextField type="number" inputMode="decimal" min={0} step="any" value={inputs.stack} className="w-full" data-river-stack
                                   onChange={(event) => setInputs((previous) => ({...previous, stack: event.target.value}))}/>
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
                    <label className="flex items-center gap-2">
                        <Switch checked={inputs.allIn} onCheckedChange={(checked) => setInputs((previous) => ({...previous, allIn: checked}))} data-river-all-in/>
                        <MicroLabel as="span">{RIVER_COPY.allInLabel}</MicroLabel>
                    </label>
                    <label className="block space-y-1">
                        <MicroLabel as="span" className="block">{RIVER_COPY.raiseCapLabel}</MicroLabel>
                        <select className={fieldClass('pr-8', 'body')} value={String(inputs.raiseCap)} data-river-raise-cap
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setInputs((previous) => ({...previous, raiseCap: next}));
                                }}>
                            {RAISE_CAPS.map((cap) => <option key={cap} value={String(cap)}>{cap}</option>)}
                        </select>
                    </label>
                    <label className="block space-y-1">
                        <MicroLabel as="span" className="block"><Term k="cfr">{RIVER_COPY.methodLabel}</Term></MicroLabel>
                        <select className={fieldClass('pr-8', 'body')} value={inputs.method} data-river-method
                                onChange={(event) => {
                                    const next = event.target.value as RiverMethod;
                                    setInputs((previous) => ({...previous, method: next}));
                                }}>
                            {METHODS.map((method) => <option key={method} value={method}>{RIVER_COPY.methods[method]}</option>)}
                        </select>
                    </label>
                    {running ? (
                        <ActionButton size="md" variant="secondary" onClick={stop} data-river-stop>{RIVER_COPY.stop}</ActionButton>
                    ) : (
                        <ActionButton size="md" onClick={start} disabled={!ready} data-river-solve>{RIVER_COPY.solve}</ActionButton>
                    )}
                    <span className="font-mono text-[11px] text-fg-muted" data-poker-engine={engine}>{POKER_COPY.engine[engine]}</span>
                </div>
                {summary && (
                    <p className="mt-3 font-mono text-[11px] text-fg-soft" data-river-summary={summary.tree.decisions}>
                        <Term k="game-tree">{RIVER_COPY.treeHeading}</Term>: {RIVER_COPY.summary(summary.tree.decisions, summary.tree.size, summary.megabytes, summary.ms)}
                    </p>
                )}
                {(unreadable.length > 0 || issues.length > 0) && (
                    <ul className="mt-3 space-y-0.5 text-xs text-warning" data-river-issues>
                        {unreadable.map((bad) => <li key={bad}>{RIVER_COPY.sizesUnreadable(bad)}</li>)}
                        {issues.map((issue) => <li key={issue}>{RIVER_COPY.issue(issue, maxDecisions)}</li>)}
                    </ul>
                )}
                {running && (
                    <div className="mt-3">
                        <ProgressLine share={progress ? progress.iterations / RIVER_MAX_ITERATIONS : null}
                                      label={progress ? RIVER_COPY.progress(progress.iterations, progress.exploitabilityPct) : RIVER_COPY.solving}/>
                    </div>
                )}
                <WhatTheseMean id="river-input-terms" keys={['game-tree', 'cfr', 'hand-range', 'polarized-range', 'bluff-catcher', 'bluff', 'value-bet']}/>
            </Panel>

            <Panel aria-labelledby="river-result-heading" data-river-result={state.status}>
                <SectionHeading id="river-result-heading" spacing="sm"><Term k="nash-equilibrium">{RIVER_COPY.resultHeading}</Term></SectionHeading>
                {state.status === 'failed' && state.message && <p className="mb-3 text-sm text-warning" role="alert">{POKER_COPY.failed(state.message)}</p>}
                {!result ? (
                    state.status !== 'failed' && <p className="text-sm text-fg-muted">{RIVER_COPY.nothingYet}</p>
                ) : (
                    <div className={cn('space-y-5', running && 'opacity-60')} data-river-iterations={result.iterations} data-river-exploitability={result.exploitabilityPct}>
                        {stale && <p className="text-xs text-fg-muted" data-river-stale>{RIVER_COPY.stale}</p>}
                        {state.status === 'stopped' && <p className="text-sm text-fg-soft" data-river-stopped>{RIVER_COPY.stopped(result.iterations)}</p>}
                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            <StatTile label={RIVER_COPY.evLabel(players[0])} value={RIVER_COPY.ev(result.ev[0], result.tree.config.pot)}/>
                            <StatTile label={RIVER_COPY.evLabel(players[1])} value={RIVER_COPY.ev(result.ev[1], result.tree.config.pot)}/>
                            <StatTile label={<Term k="exploitability">{RIVER_COPY.exploitabilityLabel}</Term>} value={RIVER_COPY.exploitability(result.exploitabilityPct)}/>
                            <StatTile label={RIVER_COPY.iterationsLabel} value={result.iterations.toLocaleString('en-US')}/>
                        </div>

                        <div className="space-y-3" data-river-node={node}>
                            <nav aria-label={RIVER_COPY.treeHeading} className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                                {pathTo(result.tree, node).map((at, i) => {
                                    const parent = result.tree.parent[at];
                                    const crumb = i === 0 ? RIVER_COPY.root : `${players[result.tree.player[parent]]}: ${RIVER_COPY.action(actionKind(result.tree, at), result.tree.amount[at], result.tree.invested[2 * at + result.tree.player[parent]])}`;
                                    return (
                                        <span key={at} className="inline-flex items-center gap-1">
                                            {i > 0 && <span aria-hidden="true" className="text-fg-muted">›</span>}
                                            <button type="button" onClick={() => setSelected(at)} aria-current={at === node ? 'step' : undefined} data-river-crumb={at}
                                                    className={cn('rounded-md px-1.5 py-0.5 transition-colors', at === node ? 'bg-surface-3 text-fg' : 'text-brand hover:bg-surface-3')}>
                                                {crumb}
                                            </button>
                                        </span>
                                    );
                                })}
                            </nav>
                            {view && (
                                <>
                                    <MicroLabel as="p" tone="fg">{RIVER_COPY.toAct(players[view.actor])}</MicroLabel>
                                    <ul className="flex flex-wrap gap-2" data-river-actions>
                                        {view.actions.map((action, a) => {
                                            const terminal = result.tree.kind[action.node] !== DECISION;
                                            const face = (
                                                <>
                                                    <span aria-hidden="true" className={cn('inline-block h-3 w-3 rounded-sm', SEGMENT_TONES[tones[a]])}/>
                                                    <span>{labels[a]}</span>
                                                    <span className="text-fg-muted">{RIVER_COPY.actionShare(action.share)}</span>
                                                    {terminal && (
                                                        <span className="text-fg-muted">
                                                            {result.tree.kind[action.node] === FOLD ? RIVER_COPY.ends.fold : <Term k="showdown">{RIVER_COPY.ends.showdown}</Term>}
                                                        </span>
                                                    )}
                                                </>
                                            );
                                            return (
                                                <li key={action.node}>
                                                    {terminal ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong/40 px-2.5 py-1.5 font-mono text-[11px] text-fg-soft" data-river-action={action.kind}>{face}</span>
                                                    ) : (
                                                        <button type="button" onClick={() => setSelected(action.node)} data-river-action={action.kind} data-river-goto={action.node}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong/40 px-2.5 py-1.5 font-mono text-[11px] text-fg transition-colors hover:bg-surface-3">
                                                            {face}
                                                        </button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {view.combos > 1e-9 && cells ? (
                                        <div className="max-w-xl">
                                            <HandGrid cells={cells} label={RIVER_COPY.gridLabel(players[view.actor])} dataAttr={`river-${view.actor}`}/>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-fg-muted">{RIVER_COPY.noneReach}</p>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="space-y-2">
                            <MicroLabel as="p">{RIVER_COPY.chartHeading}</MicroLabel>
                            <ExploitabilityChart history={result.history} target={RIVER_TARGET_PCT}/>
                        </div>
                    </div>
                )}
                <WhatTheseMean id="river-result-terms" keys={['nash-equilibrium', 'exploitability', 'showdown']}/>
            </Panel>
        </div>
    );
};

export default RiverTab;
