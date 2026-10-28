import {describe, expect, it} from 'vitest';
import {CUES_PER_BATCH, CUE_GAP_MS, OFFICE_CUES, OFFICE_SOUNDS, SOUND_LIMITS, cueForEvent, cuesFor} from '@/lib/agent-world/office-sounds';

describe('the office sound cues', () => {
    it('has a recipe for every cue and none besides', () => {
        expect(Object.keys(OFFICE_SOUNDS).sort()).toEqual([...OFFICE_CUES].sort());
    });

    it('keeps every part quiet, short and in the audible band', () => {
        for (const cue of OFFICE_CUES) {
            const parts = OFFICE_SOUNDS[cue];
            expect(parts.length).toBeGreaterThan(0);
            expect(parts.reduce((sum, part) => sum + part.gain, 0)).toBeLessThanOrEqual(SOUND_LIMITS.cueGain);
            for (const part of parts) {
                expect(part.gain).toBeGreaterThan(0);
                expect(part.gain).toBeLessThanOrEqual(SOUND_LIMITS.partGain);
                expect(part.at + part.dur).toBeLessThanOrEqual(SOUND_LIMITS.maxMs);
                for (const hz of [part.from, part.to]) {
                    expect(hz).toBeGreaterThanOrEqual(SOUND_LIMITS.minHz);
                    expect(hz).toBeLessThanOrEqual(SOUND_LIMITS.maxHz);
                }
            }
        }
    });

    it('sounds a fetch, a filing, a turn, a pin, the decision and the desk done, and nothing else', () => {
        expect(cueForEvent('result:12')).toBe('fetch');
        expect(cueForEvent('report:AAPL:market')).toBe('filed');
        expect(cueForEvent('turn:33')).toBe('turn');
        expect(cueForEvent('run-completed:AAPL')).toBe('pin');
        expect(cueForEvent('decision')).toBe('stamp');
        expect(cueForEvent('desk-done')).toBe('done');
        for (const key of ['tool:12', 'session-started', 'run-started:AAPL', 'fill:AAPL:buy', 'limit:1:openbb', 'service-stopped']) expect(cueForEvent(key)).toBeNull();
    });

    it('spaces a batch out, keeping its newest cues', () => {
        expect(cuesFor(['tool:1', 'result:1', 'report:AAPL:market'])).toEqual([{cue: 'fetch', delay: 0}, {cue: 'filed', delay: CUE_GAP_MS}]);
        const many = cuesFor(['result:1', 'result:2', 'result:3', 'turn:4', 'turn:5', 'decision']);
        expect(many).toHaveLength(CUES_PER_BATCH);
        expect(many.at(-1)).toEqual({cue: 'stamp', delay: (CUES_PER_BATCH - 1) * CUE_GAP_MS});
        expect(cuesFor([])).toEqual([]);
    });
});
