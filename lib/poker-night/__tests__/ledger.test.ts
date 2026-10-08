// The bank: each kind of buy as it lands, a net that holds still while chips go into the pot, the
// night's net across leaving and sitting down again (bought 2,000, left with 5,000, sat down with
// 2,000: up 3,000), what the counters mean (wins, the biggest win, all-ins, the peak), a digest that
// moves only with the figures, the buy range, the capped event list with exact totals, and the
// conservation sum through a whole night.

import {describe, expect, it} from 'vitest';
import {DEFAULT_CONFIG, KEEP} from '@/lib/poker-night/config';
import {createTable, forgetSettled, reduce} from '@/lib/poker-night/engine';
import {buyRange, chipsOf, conservation, hasBought, inPotOf, isSettled, ledgerDigest, ledgerEvents, ledgerRow, needsHost, netOf} from '@/lib/poker-night/ledger';
import type {GameConfig, TableAction, TableState} from '@/lib/poker-night/types';
import {A, C, R, X, deal, host, moves, nowOf, ok, play, runOut, T0, table} from './fixtures';

const sit = (s: TableState, pid: string, seat: number, buyIn: number): TableAction => ({type: 'sit', by: pid, seat, buyIn, at: nowOf(s)});
// Once a hand has been dealt every buy but the host's waits for the host: approved here at once.
const approve = (s: TableState, pid: string): TableState => ok(host(s, {op: 'approve', pid}));
const kinds = (s: TableState, pid: string) => ledgerEvents(s, ledgerRow(s, pid)!).map((e) => `${e.kind} ${e.amount}`);

// A table the players sat down at themselves, each with their own buy-in.
const seated = (buyIns: number[], config: Partial<GameConfig> = {}): TableState => {
    let s = createTable({hostPid: 'p0', config: {...DEFAULT_CONFIG, buyInMin: 1000, buyInMax: 2000, ...config}, at: T0});
    buyIns.forEach((buyIn, i) => {
        s = play(s, sit(s, `p${i}`, i, buyIn));
    });
    return ok(host(s, {op: 'start'}));
};

describe('buys', () => {
    it('records a first sit as a buy-in, chips above zero as a top-up, chips at zero as a rebuy, a second sit as a rebuy', () => {
        let s = seated([2000, 2000, 1000]);
        expect(kinds(s, 'p2')).toEqual(['buy-in 1000']);
        s = play(s, {type: 'buy', by: 'p2', amount: 500, at: nowOf(s)});
        expect(kinds(s, 'p2')).toEqual(['buy-in 1000', 'top-up 500']);
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd', 2: '7c2d'}, board: 'QsJs9d5h4c'});
        s = runOut(moves(s, A, C, C));
        expect(s.seats[2]!.stack).toBe(0);
        s = approve(play(s, {type: 'buy', by: 'p2', amount: 1500, at: nowOf(s)}), 'p2');
        expect(kinds(s, 'p2')).toEqual(['buy-in 1000', 'top-up 500', 'rebuy 1500']);
        expect(ledgerRow(s, 'p2')).toMatchObject({bought: 3000, buys: 2});
        s = approve(play(s, {type: 'leave', by: 'p2', at: nowOf(s)}, sit(s, 'p2', 4, 1000)), 'p2');
        expect(kinds(s, 'p2')).toEqual(['buy-in 1000', 'top-up 500', 'rebuy 1500', 'cash-out 1500', 'rebuy 1000']);
        expect(ledgerRow(s, 'p2')).toMatchObject({bought: 4000, cashedOut: 1500, buys: 3});
    });

    it('keeps the last twelve events and every total exact', () => {
        let s = seated([1000, 1000], {buyInMax: 10_000});
        for (let k = 1; k <= 15; k++) s = play(s, {type: 'buy', by: 'p1', amount: k, at: T0 + k * 1000});
        const row = ledgerRow(s, 'p1')!;
        expect(row.events.length).toBe(KEEP.LEDGER_EVENTS);
        expect(row.bought).toBe(1000 + 120);
        expect(row.buys).toBe(15);
        expect(ledgerEvents(s, row)[0]).toEqual({at: T0 + 4000, kind: 'top-up', amount: 4});
        expect(ledgerEvents(s, row).slice(-1)).toEqual([{at: T0 + 15_000, kind: 'top-up', amount: 15}]);
    });
});

describe('the figures', () => {
    it('holds chips and net still while a player bets, with what is in the pot beside them', () => {
        let s = deal(seated([2000, 2000, 2000]));
        const before = ledgerDigest(s);
        const actor = s.seats[s.hand!.actor!]!.pid;
        s = moves(s, R(300));
        expect(chipsOf(s, actor)).toBe(2000);
        expect(inPotOf(s, actor)).toBe(300);
        expect(netOf(s, actor)).toBe(0);
        expect(ledgerDigest(s)).toEqual(before);
    });

    it('nets a night across leaving and sitting down again: bought 2,000, left with 5,000, back with 2,000 is up 3,000', () => {
        let s = seated([2000, 2000, 1000]);
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd', 2: '7c2d'}, board: 'QsJs9d5h4c'});
        s = runOut(moves(s, A, A, A));
        expect(s.seats[0]!.stack).toBe(5000);
        s = play(s, {type: 'leave', by: 'p0', at: nowOf(s)});
        expect(netOf(s, 'p0')).toBe(3000);
        s = play(s, sit(s, 'p0', 5, 2000));
        expect(ledgerRow(s, 'p0')).toMatchObject({bought: 4000, cashedOut: 5000});
        expect(chipsOf(s, 'p0')).toBe(2000);
        expect(netOf(s, 'p0')).toBe(3000);
    });

    it('counts wins (any hand that paid), the biggest win (the most one hand paid), all-ins and the peak', () => {
        let s = seated([2000, 2000, 1000]);
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd', 2: '7c2d'}, board: 'QsJs9d5h4c'});
        s = runOut(moves(s, A, A, A));
        expect(ledgerRow(s, 'p0')).toMatchObject({hands: 1, wins: 1, biggestWin: 5000, allIns: 1, peakChips: 5000});
        expect(ledgerRow(s, 'p1')).toMatchObject({hands: 1, wins: 0, biggestWin: 0, allIns: 1, peakChips: 2000});
        expect(ledgerRow(s, 'p2')).toMatchObject({hands: 1, wins: 0, allIns: 1, peakChips: 1000});
        // A split pays both players: a win each.
        s = approve(play(s, {type: 'buy', by: 'p1', amount: 2000, at: nowOf(s)}), 'p1');
        s = deal(s, {holes: {0: '2c3c', 1: '2d3d'}, board: 'AsKsQsJsTs'});
        s = moves(s, C, X, X, X, X, X, X, X);
        expect(s.hand!.result!.pots[0].winners[0]).toHaveLength(2);
        expect(ledgerRow(s, 'p0')).toMatchObject({hands: 2, wins: 2, biggestWin: 5000});
        expect(ledgerRow(s, 'p1')).toMatchObject({hands: 2, wins: 1, biggestWin: 20});
    });

    it('moves the digest only when a figure moves', () => {
        let s = deal(seated([2000, 2000, 2000]));
        const start = ledgerDigest(s);
        const flags: boolean[] = [];
        const step = (action: TableAction) => {
            const r = reduce(s, action);
            s = ok(r);
            flags.push(r.ok && r.ledgerDirty);
        };
        step({type: 'pre', by: s.seats[s.hand!.bigBlindSeat]!.pid, pre: {kind: 'check-fold'}, at: nowOf(s)});
        step({type: 'sit-out', by: 'p1', at: nowOf(s)});
        expect(ledgerDigest(s)).toEqual(start);
        while (s.hand!.phase === 'betting') {
            const before = ledgerDigest(s);
            const last = s.hand!.seats.filter((p) => !p.folded).length === 2 && s.hand!.currentBet > 0;
            s = moves(s, last ? C : {kind: 'fold'});
            if (s.hand!.phase === 'betting') expect(ledgerDigest(s)).toEqual(before);
        }
        expect(ledgerDigest(s)).not.toEqual(start);
        expect(flags).toEqual([false, false]);
        // A request moves no figure; the host's yes does when the chips land.
        const r = reduce(s, {type: 'buy', by: 'p2', amount: 1, at: nowOf(s)});
        if (s.seats[2]!.stack < 2000) {
            expect(r.ok && r.ledgerDirty).toBe(false);
            const yes = host(ok(r), {op: 'approve', pid: 'p2'});
            expect(yes.ok && yes.ledgerDirty).toBe(true);
        }
    });
});

describe('buyRange', () => {
    it('is what a seated player may add: up to the cap, at least to the minimum, never past the rebuy limit', () => {
        let s = table({0: 500, 1: 2000, 2: 1000}, {config: {buyInMin: 1000, buyInMax: 2000, maxRebuys: 1}});
        s = {...s, seats: s.seats.map((seat) => (seat?.pid === 'p2' ? {...seat, stack: 0} : seat))};
        expect(buyRange(s, 'p0')).toEqual({min: 500, max: 1500});
        expect(buyRange(s, 'p1')).toBeNull();
        expect(buyRange(s, 'p2')).toEqual({min: 1000, max: 2000});
        expect(buyRange(s, 'nobody')).toBeNull();
        s = play(s, {type: 'buy', by: 'p0', amount: 500, at: T0});
        expect(buyRange(s, 'p0')).toBeNull();
        expect(buyRange({...s, config: {...s.config, rebuys: 'off'}}, 'p2')).toBeNull();
        // A newcomer who has bought nothing yet: their first chips, whatever the policy and the limit.
        const newcomer = {...s, config: {...s.config, rebuys: 'off' as const}, seats: s.seats.map((seat, i) => (i === 5 ? {...s.seats[2]!, pid: 'p5'} : seat))};
        expect(buyRange(newcomer, 'p5')).toEqual({min: 1000, max: 2000});
        // Leaving now, or after the hand in play: nothing.
        expect(buyRange({...s, seats: s.seats.map((seat) => (seat?.pid === 'p2' ? {...seat, leaveAfter: true} : seat))}, 'p2')).toBeNull();
        expect(buyRange({...s, seats: s.seats.map((seat) => (seat?.pid === 'p2' ? {...seat, leaving: true} : seat))}, 'p2')).toBeNull();
    });

    it('says when a buy waits for the host: anyone but the host, once the first hand is dealt', () => {
        const s = table({0: 1000, 1: 1000});
        expect(needsHost(s, 'p1')).toBe(false);
        expect(needsHost({...s, handNo: 1}, 'p1')).toBe(true);
        expect(needsHost({...s, handNo: 1}, 'p0')).toBe(false);
        expect(hasBought(null)).toBe(false);
        expect(hasBought(ledgerRow(s, 'p1'))).toBe(true);
    });
});

describe('conservation', () => {
    it('holds before, during and after a hand, and after the table closes', () => {
        let s = seated([2000, 1500, 1000]);
        expect(conservation(s)).toEqual({bought: 4500, stacks: 4500, inPot: 0, cashedOut: 0, ok: true});
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd', 2: '7c2d'}, board: 'QsJs9d5h4c'});
        s = moves(s, R(400), C);
        expect(conservation(s)).toMatchObject({inPot: 820, ok: true});
        s = moves(s, C);
        while (s.hand!.phase === 'betting') s = moves(s, X);
        expect(conservation(s)).toMatchObject({inPot: 0, ok: true});
        s = ok(host(s, {op: 'end'}));
        expect(conservation(s)).toEqual({bought: 4500, stacks: 0, inPot: 0, cashedOut: 4500, ok: true});
    });
});

describe('forgetting settled rows', () => {
    it('lets go only the rows of players who are gone, were never dealt in and took out what they bought', () => {
        // p3 sat and left before a hand; p4 is still seated; p5 asked the host for chips; p1 played.
        let s = seated([2000, 1500, 1000], {rebuys: 'approve'});
        s = play(s, sit(s, 'p3', 3, 1000), {type: 'leave', by: 'p3', at: nowOf(s)}, sit(s, 'p4', 4, 1000));
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd', 2: '7c2d', 4: '3c3d'}, board: 'QsJs9d5h4c'});
        s = runOut(moves(s, A, C, C, C));
        s = play(s, {type: 'leave', by: 'p1', at: nowOf(s)});
        expect(isSettled(ledgerRow(s, 'p3')!)).toBe(true);
        expect(isSettled(ledgerRow(s, 'p1')!)).toBe(false);
        const before = conservation(s);
        const after = forgetSettled(s, ['p1', 'p3', 'p4', 'nobody']);
        expect(after.ledger.map((row) => row.pid)).toEqual(s.ledger.map((row) => row.pid).filter((pid) => pid !== 'p3'));
        expect(conservation(after)).toEqual({...before, bought: before.bought - 1000, cashedOut: before.cashedOut - 1000});
        expect(conservation(after).ok).toBe(true);
        // Nothing to let go: the same state.
        expect(forgetSettled(after, ['p1', 'p4'])).toBe(after);
        expect(forgetSettled(s, [])).toBe(s);
    });

    it('never lets go a player who is seated, asking for chips or in the current hand, whatever their row says', () => {
        let s = seated([2000, 2000]);
        // p1's row made to read as settled while they still sit, then while they ask for chips with no seat.
        const settled = (t: TableState): TableState => ({...t, ledger: t.ledger.map((row) => (row.pid === 'p1' ? {...row, cashedOut: row.bought, hands: 0} : row))});
        const sitting = settled(s);
        expect(isSettled(ledgerRow(sitting, 'p1')!)).toBe(true);
        expect(forgetSettled(sitting, ['p1'])).toBe(sitting);
        const asking = {...sitting, seats: sitting.seats.map((seat) => (seat?.pid === 'p1' ? null : seat)), requests: [{pid: 'p1', amount: 100}]};
        expect(forgetSettled(asking, ['p1'])).toBe(asking);
        // Dealt into the hand on the table, with no seat left (as the hand completes for a leaver).
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd'}, board: 'QsJs9d5h4c'});
        const inHand = {...settled(s), seats: s.seats.map((seat) => (seat?.pid === 'p1' ? null : seat))};
        expect(forgetSettled(inHand, ['p1'])).toBe(inHand);
    });
});
