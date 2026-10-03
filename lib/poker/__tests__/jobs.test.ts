// The jobs and their driver: each kind runs to the same result driven or run straight through, a
// stop lands between slices and keeps the last progress, progress is throttled, and an error
// rejects the run.

import {describe, expect, it} from 'vitest';
import {drive} from '@/lib/poker/drive';
import {runToEnd} from '@/lib/poker/equity';
import {finishesOnStop, needsTable, pokerJob, type PokerProgress, type PokerRequest} from '@/lib/poker/jobs';
import {decodePreflop, type PreflopFile} from '@/lib/poker/preflop';
import {parseCard} from '@/lib/poker/cards';
import {parseRange} from '@/lib/poker/range';
import file from '@/lib/poker/data/preflop-equity.json';

const table = decodePreflop(file as PreflopFile);
const range = (text: string) => parseRange(text).range;
const equity = (a: string, b: string, board: string[] = [], method: 'auto' | 'exact' | 'monte-carlo' = 'auto'): PokerRequest => ({
    kind: 'equity', input: {ranges: [range(a), range(b)], board: board.map((c) => parseCard(c)!), dead: [], method, seed: 7},
});

// A fake clock that moves a millisecond a reading, and a pause that lets queued tasks run.
const clock = () => {
    let t = 0;
    return () => t++;
};
const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('pokerJob', () => {
    it('runs equity and push/fold, and reads the table only where it can answer', () => {
        expect(needsTable(equity('AA', 'KK'))).toBe(true);
        expect(needsTable(equity('AA', 'KK', ['Ah', '7c', '2d']))).toBe(false);
        expect(needsTable({kind: 'push-fold', input: {stack: 10, ante: 0}})).toBe(true);
        expect(finishesOnStop({kind: 'push-fold', input: {stack: 10, ante: 0}})).toBe(false);
        const eq = runToEnd(pokerJob(equity('AA', 'KK'), table));
        expect(eq.kind === 'equity' && eq.result.method).toBe('table');
        const pf = runToEnd(pokerJob({kind: 'push-fold', input: {stack: 10, ante: 0}}, table));
        expect(pf.kind === 'push-fold' && pf.result.pushShare).toBeGreaterThan(0.5);
        expect(() => runToEnd(pokerJob({kind: 'push-fold', input: {stack: 10, ante: 0}}, null))).toThrow();
    });
});

describe('drive', () => {
    it('ends on the same result as a straight run, reporting progress along the way', async () => {
        const request = equity('AA, KK', 'QQ+, AK', ['Kh', '7c', '2d']);
        const seen: PokerProgress[] = [];
        const run = drive(pokerJob(request, null), {sliceMs: 5, progressMs: 10, onProgress: (p) => seen.push(p), now: clock(), pause});
        const outcome = await run.promise;
        expect(outcome.status).toBe('done');
        expect(outcome.status === 'done' && outcome.result).toEqual(runToEnd(pokerJob(request, null)));
        expect(seen.length).toBeGreaterThan(0);
    });

    it('stops between slices and keeps the last Monte Carlo estimate', async () => {
        const request = equity('random', 'random', ['Ah', '7c', '2d'], 'monte-carlo');
        let reports = 0;
        const run = drive(pokerJob(request, null), {sliceMs: 0, progressMs: 0, onProgress: () => { reports++; }, now: clock(), pause});
        while (reports < 2) await pause();
        run.stop();
        const outcome = await run.promise;
        expect(outcome.status).toBe('stopped');
        if (outcome.status !== 'stopped' || outcome.progress?.kind !== 'equity') throw new Error('expected an equity estimate');
        expect(outcome.progress.progress.equity).toBeGreaterThan(0.4);
        expect(outcome.progress.progress.stdErr).toBeGreaterThan(0);
    });

    it('returns before doing any work, and a stop before the first slice runs none of it', async () => {
        let pulled = 0;
        function* counting(): Generator<number, number> {
            for (;;) {
                pulled++;
                yield pulled;
            }
        }
        const run = drive(counting(), {sliceMs: 5, progressMs: 0, onProgress: () => {}, now: clock(), pause});
        expect(pulled).toBe(0);
        run.stop();
        expect(await run.promise).toEqual({status: 'stopped', progress: null, result: null});
        expect(pulled).toBe(0);
    });

    it('lets a job that finishes on stop hand back what it has', async () => {
        function* counting(): Generator<number, string, unknown> {
            let n = 0;
            for (;;) {
                n++;
                const command = yield n;
                if (command === 'stop') return `stopped at ${n}`;
            }
        }
        let reports = 0;
        const run = drive(counting(), {sliceMs: 0, progressMs: 0, onProgress: () => { reports++; }, now: clock(), pause, finishOnStop: true});
        while (reports < 3) await pause();
        run.stop();
        const outcome = await run.promise;
        expect(outcome.status).toBe('stopped');
        expect(outcome.status === 'stopped' && outcome.result).toMatch(/^stopped at \d+$/);
    });

    it('rejects when the job throws', async () => {
        const run = drive(pokerJob(equity('AsAh', 'AsAh'), table), {sliceMs: 5, progressMs: 0, onProgress: () => {}, now: clock(), pause});
        await expect(run.promise).rejects.toThrow(/no-pairs/);
    });
});
