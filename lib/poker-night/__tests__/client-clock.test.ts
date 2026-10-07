// The browser's reading of the server's clock: a sample from a round trip's midpoint, the median of
// the last five so one slow answer barely moves it, a turn's time left as seconds and a share of the
// turn, and the ring's tone.

import {describe, expect, it} from 'vitest';
import {MAX_SAMPLE_RTT_MS, median, nextOffset, OFFSET_SAMPLES, offsetSample, secondsUntil, turnLeft, turnTone} from '@/lib/poker-night/client-clock';

describe('the offset', () => {
    it('takes the server time against the round trip\'s midpoint', () => {
        expect(offsetSample(1000, 1200, 5100)).toBe(4000);
        expect(offsetSample(1000, 1000, 900)).toBe(-100);
    });

    it('takes no sample from a round trip too long or running backwards', () => {
        expect(offsetSample(0, MAX_SAMPLE_RTT_MS + 1, 0)).toBeNull();
        expect(offsetSample(10, 5, 0)).toBeNull();
        expect(offsetSample(0, 10, Number.NaN)).toBeNull();
    });

    it('is the median of the last five samples', () => {
        let state = {offset: 0, samples: [] as number[]};
        for (const sample of [100, 120, 90, 5000, 110, 105]) state = nextOffset(state.samples, sample);
        expect(state.samples).toHaveLength(OFFSET_SAMPLES);
        expect(state.samples).toEqual([120, 90, 5000, 110, 105]);
        expect(state.offset).toBe(110);
        expect(median([])).toBe(0);
        expect(median([1, 3])).toBe(2);
    });
});

describe('a turn\'s time', () => {
    it('counts down to the deadline on the server\'s clock', () => {
        // The server runs 2 s ahead: at browser time 10,000 it is 12,000 there.
        expect(turnLeft(42_000, 30_000, 10_000, 2000)).toEqual({ms: 30_000, seconds: 30, fraction: 1});
        expect(turnLeft(42_000, 30_000, 25_000, 2000)).toEqual({ms: 15_000, seconds: 15, fraction: 0.5});
        expect(turnLeft(42_000, 30_000, 39_500, 2000)).toEqual({ms: 500, seconds: 1, fraction: 500 / 30_000});
        expect(turnLeft(42_000, 30_000, 99_000, 2000)).toEqual({ms: 0, seconds: 0, fraction: 0});
        expect(turnLeft(null, 30_000, 0, 0)).toBeNull();
    });

    it('counts whole seconds to the next deal', () => {
        expect(secondsUntil(5000, 1000, 0)).toBe(4);
        expect(secondsUntil(5000, 1001, 0)).toBe(4);
        expect(secondsUntil(5000, 9000, 0)).toBe(0);
        expect(secondsUntil(null, 0, 0)).toBeNull();
    });

    it('turns the ring from brand to warning to negative', () => {
        expect(turnTone(0.9)).toBe('brand');
        expect(turnTone(0.31)).toBe('brand');
        expect(turnTone(0.3)).toBe('warning');
        expect(turnTone(0.1)).toBe('negative');
        expect(turnTone(0)).toBe('negative');
    });
});
