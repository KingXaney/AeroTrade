// The table's sounds: every recipe gentle (no part above 0.3 gain, every frequency between 40 Hz and
// 8 kHz, the whole over within 1.2 s), the gate that lets one sound through at most every 60 ms and
// nothing but the turn while the page is hidden, and the cues — each animation's sound at its own
// moment on the choreography's timeline, a result already shown silent, each cue keyed once.

import {describe, expect, it} from 'vitest';
import {UNIT_MS, scheduleBatch} from '@/lib/poker-night/choreography';
import type {TableEvent} from '@/lib/poker-night/events';
import {createSoundGate, cueDelayMs, SOUND_GAP_MS, SOUND_IDS, SOUND_LIMITS, soundCues, soundLength, SOUNDS, type CueAnim} from '@/lib/poker-night/sounds';

describe('the recipes', () => {
    it('cover every sound the table makes', () => {
        expect(Object.keys(SOUNDS).sort()).toEqual([...SOUND_IDS].sort());
        for (const id of ['deal', 'chip', 'check', 'fold', 'win', 'turn']) expect(SOUND_IDS).toContain(id);
    });

    it('stay gentle, in range and short', () => {
        for (const id of SOUND_IDS) {
            expect(SOUNDS[id].length, id).toBeGreaterThan(0);
            for (const part of SOUNDS[id]) {
                expect(part.gain, id).toBeGreaterThan(0);
                expect(part.gain, id).toBeLessThanOrEqual(SOUND_LIMITS.maxGain);
                for (const hz of [part.freq, part.to ?? part.freq]) {
                    expect(hz, id).toBeGreaterThanOrEqual(SOUND_LIMITS.minHz);
                    expect(hz, id).toBeLessThanOrEqual(SOUND_LIMITS.maxHz);
                }
                expect(part.at, id).toBeGreaterThanOrEqual(0);
                expect(part.dur, id).toBeGreaterThan(0);
            }
            expect(soundLength(id), id).toBeLessThanOrEqual(SOUND_LIMITS.maxSeconds);
        }
        expect(SOUND_LIMITS).toEqual({maxGain: 0.3, minHz: 40, maxHz: 8000, maxSeconds: 1.2});
    });

    it('knock twice for a check and chime two notes for the turn', () => {
        expect(SOUNDS.check).toHaveLength(2);
        expect(SOUNDS.check.every((p) => p.kind === 'tone' && p.freq === 140 && p.to === 90)).toBe(true);
        expect(SOUNDS.turn.map((p) => p.freq)).toEqual([659, 880]);
        expect(SOUNDS.fold[0]).toMatchObject({kind: 'noise', filter: 'lowpass'});
    });
});

describe('the gate', () => {
    it('lets a sound through at most every 60 ms, each sound on its own', () => {
        expect(SOUND_GAP_MS).toBe(60);
        const gate = createSoundGate();
        expect(gate('chip', 1000, false)).toBe(true);
        expect(gate('chip', 1059, false)).toBe(false);
        expect(gate('deal', 1059, false)).toBe(true);
        expect(gate('chip', 1060, false)).toBe(true);
    });

    it('stays silent while the page is hidden, except for the viewer\'s turn', () => {
        const gate = createSoundGate();
        for (const id of SOUND_IDS) expect(gate(id, 0, true), id).toBe(id === 'turn');
        // A refused sound does not count toward the gap.
        expect(gate('chip', 10, false)).toBe(true);
    });
});

describe('the cues', () => {
    const base = {id: '7:x', handNo: 7};
    const at = (anims: CueAnim[]) => soundCues(anims).map((c) => [c.sound, c.at]);

    it('sound each move at its moment on the timeline, offset included', () => {
        const events: TableEvent[] = [
            {...base, id: '7:1', kind: 'chips-out', seat: 1, move: 'call', amount: 20, to: 20, allIn: false},
            {...base, id: '7:2', kind: 'check', seat: 2},
            {...base, id: '7:3', kind: 'fold', seat: 3},
        ];
        const batch = scheduleBatch(events).items.map((s) => ({...s, offset: 2}));
        expect(at(batch)).toEqual([['chip', 2 + batch[0].at], ['check', 2 + batch[1].at], ['fold', 2 + batch[2].at]]);
        expect(new Set(soundCues(batch).map((c) => c.key)).size).toBe(3);
    });

    it('snap a card for every card dealt or turned, and play the win as its banner drops', () => {
        const deal = scheduleBatch([{...base, id: '7:deal', kind: 'deal', seats: [0, 1, 2]}]).items.map((s) => ({...s, offset: 0}));
        const cues = soundCues(deal);
        expect(cues).toHaveLength(6);
        expect(cues.every((c) => c.sound === 'deal')).toBe(true);
        expect(new Set(cues.map((c) => c.key)).size).toBe(6);
        const win: TableEvent = {
            ...base, id: '7:win', kind: 'win', pots: [{pot: 0, amount: 100, winners: [{seat: 1, share: 100}]}], totals: [{seat: 1, amount: 100}],
            uncontested: false, big: false, fresh: true,
        };
        const paid = scheduleBatch([win]).items.map((s) => ({...s, offset: 0}));
        const winCues = soundCues(paid);
        expect(winCues[0]).toMatchObject({sound: 'win', at: paid[0].bannerAt});
        expect(winCues.slice(1).every((c) => c.sound === 'chip')).toBe(true);
        expect(winCues.length).toBe(1 + (paid[0].streams?.length ?? 0));
    });

    it('stay silent for a result already shown, a turn and a seat given up', () => {
        const still: TableEvent = {...base, id: '7:win', kind: 'win', pots: [], totals: [], uncontested: true, big: false, fresh: false};
        const anims = scheduleBatch([still, {...base, id: '7:turn', kind: 'turn', seat: 0, turn: 3, mine: true}, {...base, id: 'l', kind: 'leave', seat: 2, pid: 'p'}])
            .items.map((s) => ({...s, offset: 0}));
        expect(soundCues(anims)).toEqual([]);
    });

    it('wait on the motion token: a zeroed token plays them at once', () => {
        expect(cueDelayMs({at: 2.5})).toBe(2.5 * UNIT_MS);
        expect(cueDelayMs({at: 2.5}, 0)).toBe(0);
        expect(cueDelayMs({at: -1})).toBe(0);
    });
});
