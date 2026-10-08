// The table's sounds: every recipe safe over many seeds (no part above 0.35 gain, its layers together
// never past 0.75, every frequency between 40 Hz and 10 kHz, the whole over within 1.2 s), one seed
// always one sound and two seeds two (but for the table's own fixed cues), each thrown thing landing
// with a recipe of its own; the gate that lets one sound through at most every 60 ms and nothing but
// the turn while the page is hidden; and the cues — each animation's sound at its own moment on the
// choreography's timeline, seeded by its key, a result already shown silent, each cue keyed once.

import {describe, expect, it} from 'vitest';
import {UNIT_MS, scheduleBatch} from '@/lib/poker-night/choreography';
import type {TableEvent} from '@/lib/poker-night/events';
import {
    createSoundGate, cueDelayMs, FIXED_SOUNDS, HIT_SOUND_IDS, partLevel, SOUND_GAP_MS, SOUND_IDS, SOUND_LIMITS, soundCues, soundLength, soundMix, soundParts, soundSeed,
    type CueAnim, type SoundId, type SoundPart, type Noise, type Tone,
} from '@/lib/poker-night/sounds';

const SEEDS = Array.from({length: 120}, (_, k) => soundSeed(`seed:${k}`));
const kinds = (parts: readonly SoundPart[]) => parts.map((p) => (p.kind === 'tone' ? `tone:${p.wave}` : `noise:${p.filter}`));
const tones = (parts: readonly SoundPart[]): Tone[] => parts.filter((p): p is Tone => p.kind === 'tone');
const noises = (parts: readonly SoundPart[]): Noise[] => parts.filter((p): p is Noise => p.kind === 'noise');

describe('the recipes', () => {
    it('cover every sound the table makes, a landing for each thing thrown among them', () => {
        expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length);
        for (const id of ['deal', 'chip', 'check', 'fold', 'win', 'turn', 'pop', 'request', 'ask', ...HIT_SOUND_IDS]) expect(SOUND_IDS).toContain(id);
        expect(HIT_SOUND_IDS).toHaveLength(10);
    });

    it('stay safe, in range and short, whatever the seed', () => {
        expect(SOUND_LIMITS).toEqual({maxGain: 0.35, maxMix: 0.75, minHz: 40, maxHz: 10000, maxSeconds: 1.2});
        for (const id of SOUND_IDS) for (const seed of SEEDS.slice(0, 40)) {
            const parts = soundParts(id, seed);
            expect(parts.length, id).toBeGreaterThan(0);
            for (const part of parts) {
                expect(part.gain, id).toBeGreaterThan(0);
                expect(part.gain, id).toBeLessThanOrEqual(SOUND_LIMITS.maxGain);
                for (const hz of [part.freq, part.to ?? part.freq]) {
                    expect(hz, id).toBeGreaterThanOrEqual(SOUND_LIMITS.minHz);
                    expect(hz, id).toBeLessThanOrEqual(SOUND_LIMITS.maxHz);
                }
                expect(part.at, id).toBeGreaterThanOrEqual(0);
                expect(part.dur, id).toBeGreaterThan(0);
                // Its attack ends before it does: a rise, then a fall.
                expect(part.attack ?? 0.005, id).toBeLessThan(part.dur);
                if (part.kind === 'noise' && part.q !== undefined) expect(part.q, id).toBeLessThanOrEqual(10);
            }
            expect(soundLength(parts), id).toBeLessThanOrEqual(SOUND_LIMITS.maxSeconds);
            expect(soundMix(parts), `${id} ${seed}`).toBeLessThanOrEqual(SOUND_LIMITS.maxMix);
        }
    });

    it('play one seed as one sound, two seeds as two — but for the table\'s own fixed cues', () => {
        for (const id of SOUND_IDS) {
            const a = soundParts(id, SEEDS[0]);
            expect(soundParts(id, SEEDS[0]), id).toEqual(a);
            const distinct = new Set(SEEDS.slice(0, 12).map((seed) => JSON.stringify(soundParts(id, seed)))).size;
            expect(distinct, id).toBe(FIXED_SOUNDS.includes(id) ? 1 : 12);
        }
        // The viewer's turn stays the gentle two-note chime it was.
        expect(soundParts('turn', 1).map((p) => [p.kind, p.freq, p.gain])).toEqual([['tone', 659, 0.2], ['tone', 880, 0.2]]);
        expect(soundSeed('7:deal:0')).toBe(soundSeed('7:deal:0'));
        expect(soundSeed('7:deal:0')).not.toBe(soundSeed('7:deal:1'));
    });

    it('vary a thrown thing round its own sound: the same layers, nudged in pitch, level and time', () => {
        for (const id of ['hit-fish', 'hit-cake', 'hit-rose', 'hit-heart', 'hit-tennis-ball'] as SoundId[]) {
            const [a, b] = [soundParts(id, SEEDS[1]), soundParts(id, SEEDS[2])];
            if (id !== 'hit-fish') expect(kinds(a), id).toEqual(kinds(b));
            a.slice(0, 4).forEach((p, k) => expect(Math.abs(Math.log(p.freq / b[k].freq)), `${id} part ${k}`).toBeLessThan(0.45));
        }
    });

    it('land each thing thrown with a recipe of its own', () => {
        // The layers each lands with, as kinds: no two things alike, whatever the seeds.
        const shapes = new Map<SoundId, Set<string>>();
        for (const id of HIT_SOUND_IDS) shapes.set(id, new Set(SEEDS.slice(0, 30).map((seed) => kinds(soundParts(id, seed)).sort().join())));
        for (const a of HIT_SOUND_IDS) for (const b of HIT_SOUND_IDS) {
            if (a < b) expect([...shapes.get(a)!].some((s) => shapes.get(b)!.has(s)), `${a} and ${b}`).toBe(false);
        }
    });

    it('slap a fish wet: a 60–180 Hz body, a broadband slap at once, a squelch whose centre falls, droplets', () => {
        for (const seed of SEEDS.slice(0, 30)) {
            const fish = soundParts('hit-fish', seed);
            const body = tones(fish).find((p) => p.wave === 'sine')!;
            expect(body.freq).toBeGreaterThanOrEqual(60);
            expect(body.freq).toBeLessThanOrEqual(180);
            expect(body.to!).toBeLessThan(body.freq);
            expect(body.at).toBe(0);
            const slap = noises(fish).find((p) => p.filter === 'highpass')!;
            expect(slap.at).toBe(0);
            expect(slap.attack!).toBeLessThanOrEqual(0.001);
            expect(slap.dur).toBeLessThan(0.05);
            const squelch = noises(fish).filter((p) => p.filter === 'bandpass');
            expect(squelch.length).toBeGreaterThanOrEqual(2);
            for (const s of squelch) {
                expect(s.to!).toBeLessThan(s.freq);
                expect(s.q!).toBeGreaterThanOrEqual(3);
            }
            const drops = tones(fish).filter((p) => p.freq > 1000);
            expect(drops.length).toBeGreaterThanOrEqual(3);
            for (const d of drops) expect(d.to!).toBeGreaterThan(d.freq);
        }
    });

    it('crack an egg before it splats, clink a soda can before it fizzes, and bounce a tennis ball smaller and sooner each time', () => {
        for (const seed of SEEDS.slice(0, 30)) {
            const egg = soundParts('hit-egg', seed);
            const cracks = noises(egg).filter((p) => p.freq > 3500);
            const splat = noises(egg).find((p) => p.filter === 'lowpass')!;
            expect(cracks.length).toBeGreaterThanOrEqual(3);
            for (const c of cracks) expect(c.at + c.dur).toBeLessThanOrEqual(splat.at + 0.012);
            const soda = soundParts('hit-soda', seed);
            const clink = tones(soda).filter((p) => p.at === 0).map((p) => p.freq).sort((x, y) => x - y);
            expect(clink).toHaveLength(3);
            // Inharmonic partials: a metal's ring, not a note's.
            expect(clink[1] / clink[0]).toBeCloseTo(1.59, 1);
            expect(clink[2] / clink[0]).toBeCloseTo(2.71, 1);
            expect(noises(soda).filter((p) => p.at >= 0.05 && p.dur >= 0.3).length).toBeGreaterThanOrEqual(1);
            const ball = tones(soundParts('hit-tennis-ball', seed)).filter((p) => p.freq < 300);
            expect(ball).toHaveLength(3);
            expect(ball[1].gain).toBeLessThan(ball[0].gain);
            expect(ball[2].gain).toBeLessThan(ball[1].gain);
            expect(ball[2].at - ball[1].at).toBeLessThan(ball[1].at - ball[0].at);
        }
    });

    it('clack two to four chips, each at its own moment; a card swishes, then snaps; a check knocks twice', () => {
        const counts = new Set<number>();
        for (const seed of SEEDS) {
            const chip = soundParts('chip', seed);
            const clicks = noises(chip).filter((p) => p.filter === 'highpass');
            counts.add(clicks.length);
            expect(new Set(clicks.map((c) => c.at)).size).toBe(clicks.length);
            const [swish, snap] = noises(soundParts('deal', seed));
            expect(swish.at).toBe(0);
            expect(snap.at).toBeGreaterThan(0.05);
            expect(snap.dur).toBeLessThan(0.02);
        }
        expect([...counts].sort()).toEqual([2, 3, 4]);
        const check = tones(soundParts('check', SEEDS[0]));
        expect(check).toHaveLength(2);
        expect(check[1].gain).toBeLessThan(check[0].gain);
        expect(noises(soundParts('fold', SEEDS[0]))[0]).toMatchObject({kind: 'noise', filter: 'lowpass'});
    });

    it('shape each part as the player does: a linear rise over its attack, an exponential fall to its end', () => {
        const part: SoundPart = {kind: 'tone', wave: 'sine', freq: 200, at: 0.1, dur: 0.2, gain: 0.3, attack: 0.02};
        expect(partLevel(part, 0.05)).toBe(0);
        expect(partLevel(part, 0.12)).toBeCloseTo(0.3, 6);
        expect(partLevel(part, 0.11)).toBeCloseTo(0.15, 3);
        expect(partLevel(part, 0.2)).toBeLessThan(0.3);
        expect(partLevel(part, 0.3)).toBeCloseTo(0.0001, 6);
        expect(partLevel(part, 0.31)).toBe(0);
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
        // Two things landing at once: each its own sound.
        expect(gate('hit-fish', 2000, false)).toBe(true);
        expect(gate('hit-tomato', 2000, false)).toBe(true);
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

    it('swish a card thrown away (Triple T) as a fold, once each, and nothing for the throw-away over', () => {
        const events: TableEvent[] = [
            {...base, id: '7:2', kind: 'discard', seat: 0, timeout: false, auto: false},
            {...base, id: '7:3', kind: 'discard', seat: 1, timeout: true, auto: false},
            {...base, id: '7:discarded', kind: 'discarded'},
        ];
        const batch = scheduleBatch(events).items.map((s) => ({...s, offset: 0}));
        expect(at(batch)).toEqual([['fold', batch[0].at], ['fold', batch[1].at]]);
    });

    it('sound each move at its moment on the timeline, offset included, seeded by its key', () => {
        const events: TableEvent[] = [
            {...base, id: '7:1', kind: 'chips-out', seat: 1, move: 'call', amount: 20, to: 20, allIn: false},
            {...base, id: '7:2', kind: 'check', seat: 2},
            {...base, id: '7:3', kind: 'fold', seat: 3},
        ];
        const batch = scheduleBatch(events).items.map((s) => ({...s, offset: 2}));
        expect(at(batch)).toEqual([['chip', 2 + batch[0].at], ['check', 2 + batch[1].at], ['fold', 2 + batch[2].at]]);
        const cues = soundCues(batch);
        expect(new Set(cues.map((c) => c.key)).size).toBe(3);
        for (const c of cues) expect(c.seed).toBe(soundSeed(c.key));
    });

    it('snap a card for every card dealt or turned, each its own, and play the win as its banner drops', () => {
        const deal = scheduleBatch([{...base, id: '7:deal', kind: 'deal', seats: [0, 1, 2], cards: 2, variant: 'holdem', boards: 1, changed: false}]).items.map((s) => ({...s, offset: 0}));
        const cues = soundCues(deal);
        expect(cues).toHaveLength(6);
        expect(cues.every((c) => c.sound === 'deal')).toBe(true);
        expect(new Set(cues.map((c) => c.key)).size).toBe(6);
        expect(new Set(cues.map((c) => JSON.stringify(soundParts(c.sound, c.seed)))).size).toBe(6);
        const win: TableEvent = {
            ...base, id: '7:win', kind: 'win', pots: [{pot: 0, board: 0, amount: 100, winners: [{seat: 1, share: 100}]}], boards: 1, totals: [{seat: 1, amount: 100}],
            uncontested: false, big: false, fresh: true, revealMs: 3000,
        };
        const paid = scheduleBatch([win]).items.map((s) => ({...s, offset: 0}));
        const winCues = soundCues(paid);
        expect(winCues[0]).toMatchObject({sound: 'win', at: paid[0].bannerAt});
        expect(winCues.slice(1).every((c) => c.sound === 'chip')).toBe(true);
        expect(winCues.length).toBe(1 + (paid[0].streams?.length ?? 0));
    });

    it('stay silent for a result already shown, a turn and a seat given up', () => {
        const still: TableEvent = {...base, id: '7:win', kind: 'win', pots: [], boards: 1, totals: [], uncontested: true, big: false, fresh: false, revealMs: 1500};
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
