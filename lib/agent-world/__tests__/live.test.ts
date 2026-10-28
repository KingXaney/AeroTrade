import {describe, expect, it} from 'vitest';
import {activeRun, initialLive, liveMode, liveReducer, mergeView, nextPollDelay} from '@/lib/agent-world/live';
import {finishedRun, liveView, runningRun, session} from '@/lib/agent-world/__tests__/fixtures';

describe('merging a poll\'s answer', () => {
    it('takes a newer version, merging a partial answer\'s runs by symbol', () => {
        const held = liveView();
        const moved = {...runningRun(), seq: 44, stages: {}};
        const next = mergeView(held, {...liveView({version: 13, seq: 44, runs: [moved], partial: true})});
        expect(next.version).toBe(13);
        expect(next.partial).toBe(false);
        expect(next.runs.map((run) => [run.symbol, run.seq])).toEqual([['AAPL', 30], ['MSFT', 44]]);
    });

    it('ignores an older version, and a partial answer at the same version', () => {
        const held = liveView();
        expect(mergeView(held, liveView({version: 11}))).toBe(held);
        expect(mergeView(held, liveView({partial: true, runs: []}))).toBe(held);
    });

    it('replaces everything for a new session, whatever its version', () => {
        const next = liveView({version: 1, seq: 0, session: session({sessionId: 'aw-2026-11-02', symbols: ['NVDA']}), runs: []});
        expect(mergeView(liveView(), next)).toBe(next);
    });
});

describe('the floor\'s reducer', () => {
    it('follows the run in progress until the reader picks a lane, then stays on it', () => {
        let state = initialLive(liveView());
        expect(state.symbol).toBe('MSFT');
        state = liveReducer(state, {type: 'pick', symbol: 'AAPL'});
        expect([state.symbol, state.pinned]).toEqual(['AAPL', true]);
        state = liveReducer(state, {type: 'answer', answer: liveView({version: 13, partial: true, runs: []}), at: 0});
        expect(state.symbol).toBe('AAPL');
        state = liveReducer(state, {type: 'follow'});
        expect([state.symbol, state.pinned]).toEqual(['MSFT', false]);
        expect(liveReducer(state, {type: 'pick', symbol: 'TSLA'})).toBe(state);
    });

    it('counts failures, clears them on any answer, and keeps the same state for a quiet unchanged', () => {
        const start = initialLive(liveView());
        const failed = liveReducer(liveReducer(start, {type: 'failed'}), {type: 'failed'});
        expect(failed.failures).toBe(2);
        const back = liveReducer(failed, {type: 'answer', answer: {unchanged: true, version: 12, seq: 40, serverNow: start.view.serverNow, sessionId: 'aw-2026-10-26'}, at: start.view.serverNow});
        expect(back.failures).toBe(0);
        expect(liveReducer(back, {type: 'answer', answer: {unchanged: true, version: 12, seq: 40, serverNow: start.view.serverNow, sessionId: 'aw-2026-10-26'}, at: start.view.serverNow})).toBe(back);
    });

    it('replays only a session that is over', () => {
        const live = initialLive(liveView());
        expect(liveReducer(live, {type: 'replay-start', at: 0, duration: 20_000})).toBe(live);
        const done = initialLive(liveView({session: session({status: 'completed', current: null})}));
        const replaying = liveReducer(done, {type: 'replay-start', at: 0, duration: 20_000});
        expect(liveMode(replaying)).toBe('replay');
        expect(liveMode(liveReducer(replaying, {type: 'replay-stop'}))).toBe('idle');
        expect(liveMode(live)).toBe('live');
    });

    it('shows the picked lane, else the one in progress, else the first', () => {
        const view = liveView();
        expect(activeRun(view, 'AAPL')?.symbol).toBe('AAPL');
        expect(activeRun(view, null)?.symbol).toBe('MSFT');
        expect(activeRun({...view, session: session({current: null})}, null)?.symbol).toBe('AAPL');
        expect(activeRun({...view, runs: []}, 'AAPL')).toBeNull();
        expect(finishedRun().symbol).toBe('AAPL');
    });
});

describe('when to poll next', () => {
    it('never while hidden, every few seconds while live, slowly when idle, backing off after failures', () => {
        expect(nextPollDelay({live: true, hidden: true, failures: 0})).toBeNull();
        expect(nextPollDelay({live: true, hidden: false, failures: 0})).toBe(3000);
        expect(nextPollDelay({live: false, hidden: false, failures: 0})).toBe(30_000);
        expect([1, 2, 5].map((failures) => nextPollDelay({live: true, hidden: false, failures}))).toEqual([6000, 12_000, 30_000]);
    });
});
