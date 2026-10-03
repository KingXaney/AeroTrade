// The poker solver's sentences (lib/learn/copy/poker.ts), each rendered over the inputs it meets,
// held to the 'copy' tier of the no-advice list, and its printed figures read back.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {CARDS_COPY, EQUITY_COPY, POKER_COPY, POT_ODDS_COPY, PUSH_FOLD_ANTES, PUSH_FOLD_COPY, RANGE_COPY, RIVER_COPY} from '@/lib/learn/copy/poker';
import type {RiverIssue} from '@/lib/poker/river/solver';
import {ACTIONS} from '@/lib/poker/river/tree';
import type {EquityIssue, EquityMethod} from '@/lib/poker/equity';
import type {PotOddsIssue} from '@/lib/poker/pot-odds';
import type {PushFoldIssue} from '@/lib/poker/pushfold';
import type {RangeIssueKind} from '@/lib/poker/range';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
    // A sentence never opens on the game's name: findBanned reads "Hold'em" there as an order to hold.
    expect(text, text).not.toMatch(/(^|[.!?:;]\s*)hold'em/i);
};

const strings = (table: object): string[] =>
    Object.values(table).flatMap((value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v) => typeof v === 'string') : typeof value === 'object' && value ? strings(value) : []));

describe('the poker copy', () => {
    it('says every fixed line in plain words', () => {
        for (const table of [POKER_COPY, RANGE_COPY, CARDS_COPY, EQUITY_COPY, PUSH_FOLD_COPY, POT_ODDS_COPY, RIVER_COPY]) {
            for (const text of strings(table)) clean(text);
        }
    });

    it('renders every function over the inputs it meets', () => {
        for (const kind of ['unknown', 'dash', 'weight', 'pair-suit', 'repeat-card'] as RangeIssueKind[]) clean(RANGE_COPY.issue(kind, 'AKs-QJo'));
        for (const n of [0, 1, 5.5, 34, 1326]) [RANGE_COPY.combos(n), RANGE_COPY.share(n), RANGE_COPY.live(n), RANGE_COPY.cell('AKs', 1, n), RANGE_COPY.cell('72o', 0, n)].forEach(clean);
        for (const w of [1, 0.75, 0.5, 0.25]) clean(RANGE_COPY.brush(w));
        for (const pct of [1, 15, 100]) clean(RANGE_COPY.top(pct));
        clean(RANGE_COPY.gridLabel(EQUITY_COPY.sides[0]));
        [CARDS_COPY.unknown('Ax'), CARDS_COPY.repeated('Ah')].forEach(clean);
        for (const method of ['table', 'exact', 'monte-carlo'] as EquityMethod[]) {
            clean(EQUITY_COPY.methodName(method));
            clean(EQUITY_COPY.plan({method, boards: 1_712_304, live: [1, 1], work: 3_424_608}));
        }
        clean(EQUITY_COPY.plan({method: 'exact', boards: 1, live: [1, 1], work: 2}));
        for (const issue of ['board-size', 'duplicate', 'empty-side', 'no-pairs'] as EquityIssue[]) clean(EQUITY_COPY.issue(issue));
        [EQUITY_COPY.boardsDone(856_152, 1_712_304), EQUITY_COPY.dealsDone(65_536, 0.5123, 0.0012), EQUITY_COPY.dealsDone(1, null, null),
            EQUITY_COPY.stoppedSample(131_072), EQUITY_COPY.points(0.0004), EQUITY_COPY.heatCell('AKs', 0.4605), EQUITY_COPY.heatCell('72o', null)].forEach(clean);
        for (const side of EQUITY_COPY.sides) [EQUITY_COPY.equityLabel(side), EQUITY_COPY.heatLead(side)].forEach(clean);
        for (const issue of ['stack-range', 'ante-range', 'stack-below-posts'] as PushFoldIssue[]) for (const ante of PUSH_FOLD_ANTES) clean(PUSH_FOLD_COPY.issue(issue, ante));
        for (const ante of PUSH_FOLD_ANTES) clean(PUSH_FOLD_COPY.ante(ante));
        for (const bb of [1, 1.5, 10, 25]) clean(PUSH_FOLD_COPY.stack(bb));
        for (const [share, gain] of [[1, 0.42], [0, -0.13], [0.37, 0.0001], [0.5, -0]]) {
            clean(PUSH_FOLD_COPY.cell('K9o', share, gain, 'push'));
            clean(PUSH_FOLD_COPY.cell('K9o', share, gain, 'call'));
        }
        [PUSH_FOLD_COPY.solved(1), PUSH_FOLD_COPY.solved(130), PUSH_FOLD_COPY.share(0.5807), PUSH_FOLD_COPY.bb(-0.04538), PUSH_FOLD_COPY.bb(0),
            PUSH_FOLD_COPY.exploitability(9.6e-7), PUSH_FOLD_COPY.exploitability(-1e-17)].forEach(clean);
        for (const issue of ['pot', 'bet', 'equity'] as PotOddsIssue[]) clean(POT_ODDS_COPY.issue(issue));
        for (const [pot, bet] of [[100, 50], [7.5, 2.25], [1, 1000]]) {
            [POT_ODDS_COPY.breakEvenHow(pot, bet), POT_ODDS_COPY.oddsHow(pot, bet), POT_ODDS_COPY.minimumDefenseHow(pot, bet), POT_ODDS_COPY.bluffFoldsHow(pot, bet),
                POT_ODDS_COPY.callResultHow(0.3, pot, bet), POT_ODDS_COPY.odds((pot + bet) / bet), POT_ODDS_COPY.callResult(0.3 * (pot + 2 * bet) - bet)].forEach(clean);
        }
        clean(POKER_COPY.failed('The solver could not start.'));
        for (const player of RIVER_COPY.players) [RIVER_COPY.betsLabel(player), RIVER_COPY.raisesLabel(player), RIVER_COPY.evLabel(player), RIVER_COPY.toAct(player), RIVER_COPY.gridLabel(player)].forEach(clean);
        for (const [decisions, nodes, mb, ms] of [[1, 3, 0.2, 0.4], [24, 69, 1.6, 3], [400, 1200, 63.9, 120]]) clean(RIVER_COPY.summary(decisions, nodes, mb, ms));
        for (const [iterations, pct] of [[1, null], [10, 16.1], [1000, 0.0123]] as const) clean(RIVER_COPY.progress(iterations, pct));
        [RIVER_COPY.stopped(1), RIVER_COPY.stopped(250), RIVER_COPY.sizesUnreadable('7x'), RIVER_COPY.ev(6.122, 10), RIVER_COPY.ev(-2.5, 10),
            RIVER_COPY.exploitability(0.189), RIVER_COPY.actionShare(0.3), RIVER_COPY.target(0.3)].forEach(clean);
        for (const issue of ['pot', 'stack', 'sizes', 'raise-cap', 'too-big', 'board', 'empty-side', 'no-pairs'] as RiverIssue[]) for (const max of [120, 400]) clean(RIVER_COPY.issue(issue, max));
        for (const kind of ACTIONS) clean(RIVER_COPY.action(kind, 7.5, 22.5));
        clean(RIVER_COPY.cell('AKs', 3, [{action: 'Check', share: 0.4}, {action: 'Bet 7.5', share: 0.6}], 12.4));
        clean(RIVER_COPY.cell('72o', 0, [], null));
        clean(RIVER_COPY.cell('65s', 2.4, [{action: 'Bet 7.5', share: 1}], null));
    });

    it('prints the figures it is given, and reads right at one and at many', () => {
        expect(POKER_COPY.percent(0.826370)).toBe('82.64%');
        expect(POKER_COPY.wholePercent(0.583)).toBe('58%');
        expect(EQUITY_COPY.plan({method: 'exact', boards: 1_712_304, live: [1, 1], work: 3_424_608})).toBe('Every board: 1,712,304 boards, 3.4 million hand values.');
        expect(EQUITY_COPY.boardsDone(856_152, 1_712_304)).toBe('856,152 of 1,712,304 boards');
        expect(EQUITY_COPY.dealsDone(65_536, 0.51234, 0.0012)).toBe('65,536 deals · 51.23% so far, ± 0.12 points');
        expect(RANGE_COPY.combos(1)).toBe('1 combination');
        expect(RANGE_COPY.combos(5.5)).toBe('5.5 combinations');
        expect(RANGE_COPY.share(1326)).toBe('100.0% of all hands');
        expect(PUSH_FOLD_COPY.cell('AA', 1, 1.234, 'push')).toBe('AA: pushes 100%; pushing gains 1.23 bb a hand against folding');
        expect(PUSH_FOLD_COPY.cell('T7o', 0, -0.0491, 'call')).toBe('T7o: calls 0%; calling loses 0.05 bb a hand against folding');
        expect(PUSH_FOLD_COPY.cell('43s', 0.75, -0.0003, 'push')).toBe('43s: pushes 75%; pushing and folding come out about even');
        expect(PUSH_FOLD_COPY.issue('stack-below-posts', 0.25)).toBe('With an ante of 0.25 bb the stack starts at 1.25 bb: enough for the big blind and the ante.');
        expect(PUSH_FOLD_COPY.bb(-0.04538)).toBe('-0.045 bb');
        expect(PUSH_FOLD_COPY.exploitability(9.6e-7)).toBe('0.0000010 bb');
        expect(POT_ODDS_COPY.odds(3)).toBe('3 to 1');
        expect(POT_ODDS_COPY.odds(1.5)).toBe('1.5 to 1');
        expect(POT_ODDS_COPY.breakEvenHow(100, 50)).toBe('50 ÷ (100 + 2 × 50)');
        expect(POT_ODDS_COPY.callResult(10)).toBe('+10.00');
        expect(RIVER_COPY.action('raise', 15, 22.5)).toBe('Raise to 22.5');
        expect(RIVER_COPY.action('bet', 7.5, 7.5)).toBe('Bet 7.5');
        expect(RIVER_COPY.action('all-in', 30, 30)).toBe('All in for 30');
        expect(RIVER_COPY.summary(24, 69, 1.6, 3)).toBe('24 decisions and 69 nodes · about 2 MB · about 3 ms an iteration');
        expect(RIVER_COPY.summary(1, 3, 0.2, 0.4)).toBe('1 decision and 3 nodes · under 1 MB · under 1 ms an iteration');
        expect(RIVER_COPY.ev(6.1224, 10)).toBe('6.12 · 61.2% of the pot');
        expect(RIVER_COPY.cell('AKs', 3, [{action: 'Check', share: 0.4}, {action: 'Bet 7.5', share: 0.6}], 12.4)).toBe('AKs: 3 combos · Check 40.0%, Bet 7.5 60.0% · result 12.4');
    });
});
