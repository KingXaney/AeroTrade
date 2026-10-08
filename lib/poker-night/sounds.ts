// The table's sounds: each a short recipe of Web Audio tones and filtered noise — a card's snap, a
// chip's click, the knock of a check, the swish of a fold, a winner's arpeggio, the chime of the
// viewer's turn, an emote's pop, a thrown thing's landing (a splat, a fizz, a bounce), the host's
// note that a player asks for chips and the viewer's that a player asks to see their cards —
// synthesised in the browser (components/poker-night/sound-player), so there is no file to fetch.
// Pure and client-safe: the recipes, the moment each sound plays on the animations' own timeline,
// and the gate that keeps them few.
//
// Every recipe stays gentle: no part louder than SOUND_LIMITS.maxGain, every frequency between
// 40 Hz and 8 kHz, the whole sound over within 1.2 s (sounds.test holds each one). Sound is never
// the only cue for anything: everything it marks is drawn, and the live regions say it.

import {UNIT_MS, type CardTiming, type SplitFlight, type StreamChip} from '@/lib/poker-night/choreography';
import type {TableEvent} from '@/lib/poker-night/events';

export const SOUND_IDS = ['deal', 'chip', 'check', 'fold', 'win', 'turn', 'pop', 'splat', 'fizz', 'bounce', 'request', 'ask'] as const;
export type SoundId = (typeof SOUND_IDS)[number];

// A tone: an oscillator gliding from freq to `to` (Hz); a noise: one second of white noise through
// a filter whose corner glides the same way. at and dur in seconds from the sound's start, gain the
// peak of a short attack and an exponential fall.
export type Tone = {kind: 'tone'; wave: 'sine' | 'triangle' | 'square' | 'sawtooth'; freq: number; to?: number; at: number; dur: number; gain: number};
export type Noise = {kind: 'noise'; filter: 'lowpass' | 'highpass' | 'bandpass'; freq: number; to?: number; q?: number; at: number; dur: number; gain: number};
export type SoundPart = Tone | Noise;

export const SOUND_LIMITS = {maxGain: 0.3, minHz: 40, maxHz: 8000, maxSeconds: 1.2} as const;

export const SOUNDS: Record<SoundId, readonly SoundPart[]> = {
    // A card off the deck: a quick bright swish.
    deal: [{kind: 'noise', filter: 'bandpass', freq: 3600, to: 1800, q: 1.4, at: 0, dur: 0.07, gain: 0.16}],
    // Chips: two small clicks and a tick of noise.
    chip: [
        {kind: 'tone', wave: 'sine', freq: 2400, to: 2000, at: 0, dur: 0.03, gain: 0.12},
        {kind: 'tone', wave: 'sine', freq: 3100, at: 0.04, dur: 0.025, gain: 0.08},
        {kind: 'noise', filter: 'highpass', freq: 6000, at: 0, dur: 0.02, gain: 0.05},
    ],
    // A check: two knocks on the table.
    check: [
        {kind: 'tone', wave: 'sine', freq: 140, to: 90, at: 0, dur: 0.08, gain: 0.3},
        {kind: 'tone', wave: 'sine', freq: 140, to: 90, at: 0.11, dur: 0.08, gain: 0.26},
    ],
    // A fold: the cards swept away.
    fold: [{kind: 'noise', filter: 'lowpass', freq: 1800, to: 400, at: 0, dur: 0.18, gain: 0.12}],
    // A win: a rising arpeggio, the last note held.
    win: [
        {kind: 'tone', wave: 'triangle', freq: 523, at: 0, dur: 0.14, gain: 0.18},
        {kind: 'tone', wave: 'triangle', freq: 659, at: 0.09, dur: 0.14, gain: 0.18},
        {kind: 'tone', wave: 'triangle', freq: 784, at: 0.18, dur: 0.14, gain: 0.18},
        {kind: 'tone', wave: 'triangle', freq: 1047, at: 0.27, dur: 0.3, gain: 0.18},
    ],
    // The viewer's turn: a two-note chime.
    turn: [
        {kind: 'tone', wave: 'triangle', freq: 659, at: 0, dur: 0.12, gain: 0.2},
        {kind: 'tone', wave: 'triangle', freq: 880, at: 0.12, dur: 0.16, gain: 0.2},
    ],
    // An emote appearing: a soft rising pop.
    pop: [{kind: 'tone', wave: 'sine', freq: 600, to: 1200, at: 0, dur: 0.06, gain: 0.15}],
    // A thrown thing landing: a wet thud (a tomato, cake, an egg — lib/poker-night/emotes.landingSound
    // picks the landing's sound from its impact).
    splat: [
        {kind: 'noise', filter: 'lowpass', freq: 900, at: 0, dur: 0.22, gain: 0.25},
        {kind: 'tone', wave: 'sine', freq: 120, to: 60, at: 0, dur: 0.18, gain: 0.2},
    ],
    // A soda landing: a hiss of bubbles.
    fizz: [
        {kind: 'noise', filter: 'highpass', freq: 3200, to: 5200, at: 0, dur: 0.35, gain: 0.07},
        {kind: 'noise', filter: 'bandpass', freq: 4200, q: 3, at: 0.05, dur: 0.25, gain: 0.05},
    ],
    // A ball or a fish landing: two springy boings, the second smaller.
    bounce: [
        {kind: 'tone', wave: 'sine', freq: 520, to: 260, at: 0, dur: 0.12, gain: 0.18},
        {kind: 'tone', wave: 'sine', freq: 440, to: 240, at: 0.16, dur: 0.1, gain: 0.1},
    ],
    // The host's note: a player asks for chips (a soft knock-knock, then a short bell).
    request: [
        {kind: 'tone', wave: 'sine', freq: 220, to: 160, at: 0, dur: 0.06, gain: 0.18},
        {kind: 'tone', wave: 'sine', freq: 220, to: 160, at: 0.1, dur: 0.06, gain: 0.16},
        {kind: 'tone', wave: 'triangle', freq: 988, at: 0.2, dur: 0.22, gain: 0.12},
    ],
    // The viewer is asked to see their cards: a gentle rising two-note question.
    ask: [
        {kind: 'tone', wave: 'triangle', freq: 587, at: 0, dur: 0.12, gain: 0.15},
        {kind: 'tone', wave: 'triangle', freq: 784, to: 830, at: 0.11, dur: 0.18, gain: 0.15},
    ],
};

// How long a sound runs, in seconds.
export const soundLength = (id: SoundId): number => Math.max(...SOUNDS[id].map((p) => p.at + p.dur));

// ── when they play ──

// The same sound at most once per this long; a burst of chips is a few clicks, not a buzz.
export const SOUND_GAP_MS = 60;

// Whether a sound may play now: not within SOUND_GAP_MS of the same sound, and nothing while the
// page is hidden but the viewer's turn. A gate per page (sound-player keeps one).
export const createSoundGate = (gapMs: number = SOUND_GAP_MS) => {
    const last = new Map<SoundId, number>();
    return (id: SoundId, now: number, hidden: boolean): boolean => {
        if (hidden && id !== 'turn') return false;
        const before = last.get(id);
        if (before !== undefined && now - before < gapMs) return false;
        last.set(id, now);
        return true;
    };
};

// What sounds.soundCues reads of an animation as components/poker-night/anim schedules it: its
// event and its times, in units of --motion-base from the moment it was scheduled (offset added).
export type CueAnim = {
    id: string;
    event: TableEvent;
    at: number;
    offset: number;
    still?: boolean;
    cards?: CardTiming[];
    bannerAt?: number;
    splits?: SplitFlight[];
    streams?: StreamChip[];
};

// One sound at one moment: key, so a cue plays once however often the animations are read; at, in
// units of --motion-base from now.
export type Cue = {key: string; sound: SoundId; at: number};

// The sounds the table's animations make, each at the moment its animation does: a card for each
// card dealt, turned or shown, a chip for each bet, sweep and refund, a knock for a check, a swish
// for a fold, a pop for a player sitting down; a win's arpeggio as its banner drops, a chip for each
// pot's share flying to its board (two or three boards), a click for each chip of a stream. A result the table had already shown (still) is silent; the
// viewer's turn is the room's own (useTableSounds), not an animation.
export const soundCues = (anims: readonly CueAnim[]): Cue[] => {
    const out: Cue[] = [];
    for (const a of anims) {
        if (a.still) continue;
        const at = (t: number) => a.offset + t;
        const cards = (sound: SoundId) => (a.cards ?? []).forEach((c, k) => out.push({key: `${a.id}:${k}`, sound, at: at(c.at)}));
        switch (a.event.kind) {
            case 'deal':
            case 'board':
            case 'show':
            case 'reveal':
                cards('deal');
                break;
            case 'chips-out':
            case 'street-sweep':
            case 'refund':
                out.push({key: a.id, sound: 'chip', at: at(a.at)});
                break;
            case 'check':
                out.push({key: a.id, sound: 'check', at: at(a.at)});
                break;
            case 'fold':
                out.push({key: a.id, sound: 'fold', at: at(a.at)});
                break;
            case 'join':
                out.push({key: a.id, sound: 'pop', at: at(a.at)});
                break;
            case 'win':
                out.push({key: `${a.id}:win`, sound: 'win', at: at(a.bannerAt ?? a.at)});
                (a.splits ?? []).forEach((s) => out.push({key: `${a.id}:split:${s.key}`, sound: 'chip', at: at(s.at)}));
                (a.streams ?? []).forEach((s) => out.push({key: `${a.id}:${s.key}`, sound: 'chip', at: at(s.at)}));
                break;
            default:
                break;
        }
    }
    return out;
};

// A cue's wait in ms, on the style's motion token (a zeroed token — brutalist, reduced motion —
// plays every cue at once, as the animations do).
export const cueDelayMs = (cue: Pick<Cue, 'at'>, unitMs: number = UNIT_MS): number => Math.max(0, Math.round(cue.at * unitMs));
