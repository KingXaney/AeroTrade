import {describe, expect, it} from 'vitest';
import {motionUnitMs, replayDuration, replayFrame, replayProgress, sessionSpan} from '@/lib/agent-world/replay';
import {T0, liveView, session} from '@/lib/agent-world/__tests__/fixtures';

const done = () => liveView({session: session({status: 'completed', current: null, orders: [{symbol: 'AAPL', side: 'buy', quantity: 100, reason: 'rated Buy → target 20%', rating: 'Buy', targetWeight: 0.2, currentWeight: 0}]})});

describe('the replay clock', () => {
    it('reads the motion token, so reduced motion shows the end at once', () => {
        expect(motionUnitMs('240ms')).toBe(240);
        expect(motionUnitMs(' 0.24s ')).toBe(240);
        expect(motionUnitMs('0ms')).toBe(0);
        expect(motionUnitMs('')).toBe(0);
        expect(replayDuration(240)).toBe(20_000);
        expect(replayDuration(0)).toBe(0);
        expect(replayProgress({startedAt: 1000, duration: 0}, 1000)).toBe(1);
        expect(replayProgress({startedAt: 1000, duration: 20_000}, 11_000)).toBe(0.5);
        expect(replayProgress({startedAt: 1000, duration: 20_000}, 99_000)).toBe(1);
    });

    it('spans the session from its start to its last stored moment', () => {
        expect(sessionSpan(done())).toEqual({from: T0, to: T0 + 11 * 60_000});
        expect(sessionSpan(liveView({runs: [], session: session({startedAt: null})}))).toBeNull();
    });
});

describe('a frame of the replay', () => {
    it('is the view itself at the end', () => {
        const view = done();
        expect(replayFrame(view, 1)).toBe(view);
    });

    it('shows nothing filed and no orders at the start', () => {
        const frame = replayFrame(done(), 0);
        expect(frame.session?.status).toBe('running');
        expect(frame.session?.orders).toEqual([]);
        expect(frame.runs[0].status).toBe('running');
        expect(Object.keys(frame.runs[0].reports)).toEqual([]);
        expect(frame.runs[1].status).toBe('pending');
    });

    it('shows a role working, its report not yet filed, and only the fetches made by the cut', () => {
        // Three minutes in: the market analyst done (minute 2), the news analyst still working.
        const frame = replayFrame(done(), 2.5 / 11);
        const aapl = frame.runs[0];
        expect(aapl.stages.market?.status).toBe('done');
        expect(aapl.stages.news?.status).toBe('working');
        expect(Object.keys(aapl.reports)).toEqual(['market']);
        expect(aapl.toolResults.map((result) => result.callId)).toEqual(['c1', 'c2', 'c3']);
        expect(aapl.debate).toEqual([]);
        expect(aapl.rating).toBeNull();
        expect(frame.session?.current?.symbol).toBe('AAPL');
    });
});
