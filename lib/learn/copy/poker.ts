// Copy for the poker solver (/poker): equity between hands and ranges, heads-up push or fold at
// equilibrium, and pot odds. The sentences describe what the cards and the strategies do — an
// equilibrium, never an "optimal" play; a hand wins against another, never "beats" it — and none
// says what to do with money. Held to the 'copy' tier of lib/learn/banned.ts by
// lib/learn/__tests__/poker-copy.test.ts.

import type {EquityIssue, EquityMethod, EquityPlan} from "@/lib/poker/equity";
import type {PotOddsIssue} from "@/lib/poker/pot-odds";
import type {PushFoldIssue} from "@/lib/poker/pushfold";
import type {RangeIssueKind} from "@/lib/poker/range";
import type {RiverIssue, RiverMethod} from "@/lib/poker/river/solver";
import type {ActionKind} from "@/lib/poker/river/tree";
import {formatSigned} from "@/lib/format";

const count = (n: number): string => n.toLocaleString('en-US', {maximumFractionDigits: 2});
const plural = (n: number, one: string, many: string): string => `${count(n)} ${n === 1 ? one : many}`;
// A share as a percentage: 0.82637 → "82.64%".
const percent = (share: number, digits = 2): string => `${(share * 100).toFixed(digits)}%`;
// Big counts in words: 3,424,608 → "3.4 million".
const roughly = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : count(n));

export const POKER_COPY = {
    title: 'Poker solver',
    subtitle: 'Equity between hands and ranges, heads-up push or fold and river play at equilibrium, and pot odds, all worked out in this browser.',
    note: 'Nothing here is saved, and no figure is a recommendation: the solver describes how cards and bets behave.',
    tabsLabel: 'Poker solver tools',
    tabs: {equity: 'Equity', 'push-fold': 'Push or fold', 'pot-odds': 'Pot odds', river: 'River'},
    engine: {
        starting: 'Starting the solver…',
        worker: 'Solving in a background thread',
        main: 'Solving on the page thread',
    },
    failed: (message: string): string => `The solver stopped: ${message}`,
    percent,
    wholePercent: (share: number): string => `${Math.round(share * 100)}%`,
} as const;

export const RANGE_COPY = {
    textLabel: 'As text',
    placeholder: 'QQ+, AKs, AhKh, 76s-T9s',
    gridLabel: (side: string): string => `${side}: the 169 starting hands, pairs on the diagonal, suited above it and offsuit below`,
    issue: (kind: RangeIssueKind, token: string): string => {
        switch (kind) {
            case 'unknown': return `"${token}" is not a hand, a range or a combination.`;
            case 'dash': return `"${token}": a dash joins two pairs, two hands with the same first card, or two hands the same gap apart.`;
            case 'weight': return `"${token}": a weight is a number from 0 to 1, or a percentage.`;
            case 'pair-suit': return `"${token}": a pair has no suited or offsuit form.`;
            case 'repeat-card': return `"${token}" names the same card twice.`;
        }
    },
    combos: (combos: number): string => plural(combos, 'combination', 'combinations'),
    share: (combos: number): string => `${percent(combos / 1326, 1)} of all hands`,
    live: (live: number): string => `${count(live)} once the cards in view are out`,
    brushLabel: 'Paint at',
    brush: (weight: number): string => `${Math.round(weight * 100)}%`,
    clear: 'Clear',
    everyHand: 'Every hand',
    topLabel: 'Strongest',
    top: (pct: number): string => `Top ${pct}%`,
    topHint: 'Ranked by equity against a random hand',
    cell: (label: string, weight: number, combos: number): string =>
        weight > 0 ? `${label}: ${plural(combos, 'combination', 'combinations')}, in the range at ${Math.round(weight * 100)}%` : `${label}: ${plural(combos, 'combination', 'combinations')}, not in the range`,
} as const;

export const CARDS_COPY = {
    boardLabel: 'Board',
    boardPlaceholder: 'Ah 7c 2d',
    boardHint: 'None, three, four or five cards',
    deadLabel: 'Dead cards',
    deadPlaceholder: 'Cards out of play',
    deadHint: 'Seen or folded: they come out of both ranges',
    unknown: (token: string): string => `"${token}" is not a card: a rank (2 to 9, T, J, Q, K or A) and a suit (c, d, h or s).`,
    repeated: (card: string): string => `${card} appears twice.`,
} as const;

const EQUITY_METHOD_NAMES: Record<EquityMethod, string> = {table: 'Preflop table', exact: 'Every board', 'monte-carlo': 'Monte Carlo'};

export const EQUITY_COPY = {
    heading: 'Equity',
    lead: 'Two hands or ranges all in: the share of the pot each takes over every way the board can finish.',
    sides: ['Hand or range 1', 'Hand or range 2'] as const,
    methodLabel: 'Method',
    methods: {auto: 'Choose for me', exact: 'Every board', 'monte-carlo': 'Monte Carlo'},
    methodName: (method: EquityMethod): string => EQUITY_METHOD_NAMES[method],
    seedLabel: 'Seed',
    plan: (plan: EquityPlan): string => {
        if (plan.method === 'table') return 'From the preflop table: exact, at once.';
        if (plan.method === 'exact') return `Every board: ${plural(plan.boards, 'board', 'boards')}, ${roughly(plan.work)} hand values.`;
        return 'Monte Carlo: seeded deals until the standard error is under 0.05 points.';
    },
    run: 'Work it out',
    stop: 'Stop',
    working: 'Working…',
    boardsDone: (done: number, total: number): string => `${count(done)} of ${count(total)} boards`,
    dealsDone: (done: number, equity: number | null, stdErr: number | null): string =>
        equity === null || stdErr === null ? plural(done, 'deal', 'deals') : `${plural(done, 'deal', 'deals')} · ${percent(equity)} so far, ± ${(stdErr * 100).toFixed(2)} points`,
    stoppedExact: 'Stopped before the last board, so there is no figure: the boards come in card order, and part of them is not a sample.',
    stoppedSample: (samples: number): string => `Stopped after ${plural(samples, 'deal', 'deals')}; the estimate is from those.`,
    equityLabel: (side: string): string => `Equity, ${side.toLowerCase()}`,
    winLabel: 'Wins',
    tieLabel: 'Ties',
    methodTile: 'Method',
    errorLabel: 'Standard error',
    boardsLabel: 'Boards',
    dealsLabel: 'Deals',
    points: (stdErr: number): string => `± ${(stdErr * 100).toFixed(2)} points`,
    winTieNote: 'The preflop table keeps equity only; "Every board" also counts the wins and ties.',
    stale: 'These figures are for the hands and cards as they were when worked out.',
    resultHeading: 'Result',
    nothingYet: 'The result shows here once it is worked out.',
    heatHeading: 'Equity by starting hand',
    heatLead: (side: string): string => `Each class in ${side.toLowerCase()}, against everything the other side holds.`,
    heatCell: (label: string, equity: number | null): string => (equity === null ? `${label}: not in the range` : `${label}: ${percent(equity, 1)}`),
    issue: (issue: EquityIssue): string => {
        switch (issue) {
            case 'board-size': return 'A board is none, three, four or five cards.';
            case 'duplicate': return 'A card appears twice among the board and the dead cards.';
            case 'empty-side': return 'One side has no hand left once the board and the dead cards are out.';
            case 'no-pairs': return 'Every hand on one side shares a card with every hand on the other.';
        }
    },
} as const;

export const PUSH_FOLD_ANTES = [0, 0.1, 0.125, 0.2, 0.25] as const;

export const PUSH_FOLD_COPY = {
    heading: 'Push or fold, heads-up',
    lead: "The small blind moves all in or folds; the big blind, facing that, calls or folds. Each chart is that seat's equilibrium strategy: neither seat gains by changing its own while the other keeps its.",
    stackLabel: 'Effective stack',
    stack: (bb: number): string => `${count(bb)} bb`,
    anteLabel: 'Ante, each player',
    ante: (ante: number): string => (ante === 0 ? 'None' : `${count(ante)} bb`),
    issue: (issue: PushFoldIssue, ante: number): string => {
        switch (issue) {
            case 'stack-range': return 'The stack is from 1 to 25 big blinds.';
            case 'ante-range': return 'The ante is from 0 to a quarter of a big blind.';
            case 'stack-below-posts': return `With an ante of ${count(ante)} bb the stack starts at ${count(1 + ante)} bb: enough for the big blind and the ante.`;
        }
    },
    solving: 'Solving…',
    solved: (iterations: number): string => `Solved in ${plural(iterations, 'iteration', 'iterations')}.`,
    pushChart: 'Small blind: pushes',
    callChart: 'Big blind: calls the push',
    cell: (label: string, share: number, gain: number, seat: 'push' | 'call'): string => {
        const play = seat === 'push' ? 'pushing' : 'calling';
        const result = Math.abs(gain) < 0.005 ? `${play} and folding come out about even` : `${play} ${gain > 0 ? 'gains' : 'loses'} ${Math.abs(gain).toFixed(2)} bb a hand against folding`;
        return `${label}: ${seat === 'push' ? 'pushes' : 'calls'} ${Math.round(share * 100)}%; ${result}`;
    },
    chartsHeading: 'Both seats at equilibrium',
    legend: "A cell's fill is how often that hand plays; a part-filled cell is close to even either way.",
    legendAlways: 'Every time',
    legendNever: 'Folds',
    pushShare: 'Small blind pushes',
    callShare: 'Big blind calls',
    valueLabel: "Small blind's result a hand",
    exploitabilityLabel: 'Exploitability',
    iterationsLabel: 'Iterations',
    share: (share: number): string => percent(share, 1),
    bb: (value: number): string => `${formatSigned(value, 3)} bb`,
    exploitability: (value: number): string => `${Math.max(0, value).toFixed(7)} bb`,
    ofHands: 'of all hands',
} as const;

const trim = (n: number): string => count(Math.round(n * 100) / 100);

export const POT_ODDS_COPY = {
    heading: 'Pot odds',
    lead: 'A bet into a pot: what a call needs to break even, and what a bluff of the same size needs.',
    potLabel: 'Pot before the bet',
    betLabel: 'Bet to call',
    equityLabel: 'Equity, if known (%)',
    breakEvenLabel: 'Break-even equity',
    oddsLabel: 'Pot odds',
    minimumDefenseLabel: 'Minimum defense',
    bluffFoldsLabel: 'Folds a bluff needs',
    callResultLabel: "A call's expected result",
    odds: (odds: number): string => `${trim(odds)} to 1`,
    breakEvenHow: (pot: number, bet: number): string => `${trim(bet)} ÷ (${trim(pot)} + 2 × ${trim(bet)})`,
    oddsHow: (pot: number, bet: number): string => `(${trim(pot)} + ${trim(bet)}) : ${trim(bet)}`,
    minimumDefenseHow: (pot: number, bet: number): string => `${trim(pot)} ÷ (${trim(pot)} + ${trim(bet)})`,
    bluffFoldsHow: (pot: number, bet: number): string => `${trim(bet)} ÷ (${trim(pot)} + ${trim(bet)})`,
    callResultHow: (equity: number, pot: number, bet: number): string => `${percent(equity)} × ${trim(pot + 2 * bet)} − ${trim(bet)}`,
    callResult: (value: number): string => formatSigned(value, 2),
    noEquity: "With an equity, the call's expected result shows here.",
    share: (share: number): string => percent(share, 1),
    issue: (issue: PotOddsIssue): string => {
        switch (issue) {
            case 'pot': return 'The pot is a number above 0.';
            case 'bet': return 'The bet is a number above 0.';
            case 'equity': return 'Equity is a share from 0% to 100%.';
        }
    },
} as const;

const chips = (n: number): string => count(Math.round(n * 100) / 100);

export type RiverPreset = 'polarized' | 'realistic';

export const RIVER_COPY = {
    heading: 'River solver',
    lead: 'Two ranges on a finished board and a betting tree: the equilibrium strategy for every hand at every decision, by discounted CFR.',
    presetsLabel: 'Start from',
    presets: {polarized: 'Polarized example', realistic: 'A realistic spot'} satisfies Record<RiverPreset, string>,
    presetLines: {
        polarized: 'Aces and four bluffs against three king-queens that only catch bluffs, one bet of 75% of the pot: the spot with an answer in closed form.',
        realistic: 'Two wide ranges on a queen-high board, two bet sizes, raises and an all-in.',
    } satisfies Record<RiverPreset, string>,
    players: ['Out of position', 'In position'] as const,
    playerNotes: ['Acts first', 'Acts second'] as const,
    boardHint: 'Five cards',
    potLabel: 'Pot',
    stackLabel: 'Stack behind, each',
    betsLabel: (player: string): string => `${player}: bets, % of the pot`,
    raisesLabel: (player: string): string => `${player}: raises, % of the pot`,
    sizesHint: 'Up to four sizes, such as 33, 75',
    allInLabel: 'All-in offered',
    raiseCapLabel: 'Raises a line allows',
    methodLabel: 'Method',
    methods: {dcfr: 'Discounted CFR', 'cfr+': 'CFR+'} satisfies Record<RiverMethod, string>,
    summary: (decisions: number, nodes: number, megabytes: number, msPerIteration: number): string =>
        `${plural(decisions, 'decision', 'decisions')} and ${plural(nodes, 'node', 'nodes')} · ${megabytes < 1 ? 'under 1 MB' : `about ${count(Math.round(megabytes))} MB`} · ${msPerIteration < 1 ? 'under 1 ms' : `about ${count(Math.round(msPerIteration))} ms`} an iteration`,
    solve: 'Solve',
    stop: 'Stop',
    solving: 'Solving…',
    progress: (iterations: number, pct: number | null): string =>
        pct === null ? plural(iterations, 'iteration', 'iterations') : `${plural(iterations, 'iteration', 'iterations')} · exploitability ${pct.toFixed(2)}% of the pot`,
    stopped: (iterations: number): string => `Stopped after ${plural(iterations, 'iteration', 'iterations')}: the strategy shown is the average so far.`,
    sizesUnreadable: (text: string): string => `"${text}" is not a list of sizes such as 33, 75.`,
    issue: (issue: RiverIssue, maxDecisions: number): string => {
        switch (issue) {
            case 'pot': return 'The pot is a number above 0.';
            case 'stack': return 'The stack is a number from 0 up.';
            case 'sizes': return 'Each size is above 0% and at most 1,000% of the pot, four at most a list.';
            case 'raise-cap': return 'Raises a line allows is a whole number from 0 to 4.';
            case 'too-big': return `The tree is over ${count(maxDecisions)} decisions or 64 MB; with fewer sizes or raises it fits.`;
            case 'board': return 'A river board is five different cards.';
            case 'empty-side': return 'One side has no hand left once the board is out.';
            case 'no-pairs': return 'Every hand on one side shares a card with every hand on the other.';
        }
    },
    resultHeading: 'Equilibrium',
    nothingYet: 'The equilibrium shows here once the spot is solved.',
    stale: 'These figures are for the spot as it was when solved.',
    evLabel: (player: string): string => `${player}: result a hand`,
    ev: (value: number, pot: number): string => `${chips(value)} · ${percent(value / pot, 1)} of the pot`,
    exploitabilityLabel: 'Exploitability',
    exploitability: (pct: number): string => `${pct.toFixed(3)}% of the pot`,
    iterationsLabel: 'Iterations',
    treeHeading: 'The tree',
    root: 'River',
    toAct: (player: string): string => `${player} to act`,
    action: (kind: ActionKind, amount: number, total: number): string => {
        switch (kind) {
            case 'check': return 'Check';
            case 'bet': return `Bet ${chips(amount)}`;
            case 'call': return `Call ${chips(amount)}`;
            case 'fold': return 'Fold';
            case 'raise': return `Raise to ${chips(total)}`;
            case 'all-in': return `All in for ${chips(total)}`;
        }
    },
    ends: {fold: 'ends the hand', showdown: 'goes to showdown'},
    actionShare: (share: number): string => percent(share, 1),
    gridLabel: (player: string): string => `${player}: the strategy of each starting hand here`,
    cell: (label: string, combos: number, parts: readonly {action: string; share: number}[], ev: number | null): string =>
        combos <= 0 ? `${label}: does not reach here`
            : `${label}: ${count(Math.round(combos * 100) / 100)} combos · ${parts.map((part) => `${part.action} ${percent(part.share, 1)}`).join(', ')}${ev === null ? '' : ` · result ${chips(ev)}`}`,
    noneReach: 'No hand of this player reaches this decision.',
    chartHeading: 'Exploitability as it solves',
    chartLabel: 'Exploitability after each check, % of the pot, on a log scale',
    target: (pct: number): string => `stops under ${pct}%`,
    iterationsAxis: 'iterations',
} as const;

