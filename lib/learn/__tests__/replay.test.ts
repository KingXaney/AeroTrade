import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {REPLAY_COPY} from '@/lib/learn/copy/replay';
import {describeReplay, fillDate, isReplayExpired, matchFillToRun, replayReason, type ReplayRun} from '@/lib/learn/replay';

const run: ReplayRun = {
    asOf: '2026-09-25',
    board: [{symbol: 'XLF', state: 'enter', values: {close: 42.1, sma50: 42.1, sma200: 40, spread: 0.053, trendOn: true}}],
    orders: [{symbol: 'XLF', side: 'buy', quantity: 10, kind: 'enter', reason: 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)', executed: true, price: 42.2, message: null}],
};

describe('fillDate', () => {
    it('reads the ET date, not the UTC one', () => {
        // 23:30 UTC on the 25th is 19:30 ET on the 25th; 03:30 UTC on the 26th is 23:30 ET on the 25th.
        expect(fillDate(Date.UTC(2026, 8, 25, 23, 30))).toBe('2026-09-25');
        expect(fillDate(Date.UTC(2026, 8, 26, 3, 30))).toBe('2026-09-25');
        expect(fillDate(Date.UTC(2026, 8, 25, 13, 35))).toBe('2026-09-25');
    });
});

describe('matchFillToRun', () => {
    it('pairs the fill with the row and the order of the same side', () => {
        const match = matchFillToRun(run, 'XLF', 'buy');
        expect(match.row?.state).toBe('enter');
        expect(match.order?.reason).toMatch(/^enter: SMA50/);
        expect(matchFillToRun(run, 'XLF', 'sell').order).toBeNull();
        expect(matchFillToRun(run, 'XLE', 'buy')).toEqual({row: null, order: null});
    });
});

// The reason a fill's "What the rule saw" decodes: the planned order's while the run record
// lasts, else the reason stored on the fill itself — an expired board takes the row with it,
// not the rule's words, which the trade row still carries.
describe('replayReason', () => {
    const stored = 'exit: SMA50 80.00 ≤ SMA200 81.00';
    it('reads the planned order while the record lasts', () => {
        expect(replayReason(matchFillToRun(run, 'XLF', 'buy'), stored)).toBe(run.orders[0].reason);
    });
    it('falls back to the fill\'s own reason when the record is gone or never matched', () => {
        expect(replayReason(null, stored)).toBe(stored);
        expect(replayReason({row: null, order: null}, stored)).toBe(stored);
        expect(replayReason({row: run.board[0], order: null}, stored)).toBe(stored);
    });
    it('has nothing to decode when neither carries a reason', () => {
        expect(replayReason(null, undefined)).toBeNull();
        expect(replayReason(null, '   ')).toBeNull();
    });
});

describe('describeReplay', () => {
    it('captions a found row, and says why when nothing is there', () => {
        expect(describeReplay(matchFillToRun(run, 'XLF', 'buy'), run.asOf, false)).toBe(REPLAY_COPY.caption('2026-09-25'));
        expect(describeReplay(null, null, false)).toBe(REPLAY_COPY.missing);
        expect(describeReplay(null, null, true)).toBe(REPLAY_COPY.expired);
        expect(describeReplay({row: null, order: null}, run.asOf, true)).toBe(REPLAY_COPY.expired);
        expect(REPLAY_COPY.expired).toMatch(/400 days/);
    });

    it('expires after the run record does', () => {
        expect(isReplayExpired('2026-01-01', '2026-09-27')).toBe(false);
        expect(isReplayExpired('2025-06-01', '2026-09-27')).toBe(true);
    });

    it('keeps its copy descriptive', () => {
        expect(findBanned([REPLAY_COPY.summary, REPLAY_COPY.caption('x'), REPLAY_COPY.expired, REPLAY_COPY.missing].join(' '), 'copy')).toEqual([]);
    });
});
