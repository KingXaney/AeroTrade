// The table's sounds: each a recipe of layered Web Audio tones and filtered noise, shaped on how the
// thing sounds in a room — a card's swish through the air and its crisp snap on the felt; clay chips
// clacking, a few at a time, each at its own pitch; two knocks on the table for a check; the cards
// swept into the muck; a winner's arpeggio; the viewer's turn's gentle chime; an emote's soft pop; the
// host's note that a player asks for chips and the viewer's that a player asks to see their cards —
// and every thrown thing's own landing (lib/poker-night/emotes.landingSound): a fish's heavy wet slap
// (the body's low thump, a broadband slap, a resonant squelch whose centre falls, droplets flung off),
// a tomato's juicy splat and drips, an egg's shell cracking before it splats, a cake's soft muffled
// thud, a rose's and a heart's whoosh and gentle pop, a soda can's clink and fizz, confetti's paper
// pop and rustle, popcorn popping, a tennis ball's felt thock and its bounces. Synthesised in the
// browser (components/poker-night/sound-player), so there is no file to fetch. Pure and client-safe:
// the recipes, the moment each sound plays on the animations' own timeline, and the gate that keeps
// them few.
//
// A recipe is played from a seed (soundParts): every pitch, length, level and moment it varies is
// drawn from that seed, so two throws of the same thing, two chips or two cards never sound quite the
// same, while one seed always gives one sound (sounds.test) — a cue's seed is its key, a landing's the
// emote's id (soundSeed), so every screen hears the same throw land the same way. The chime of the
// viewer's turn, the winner's arpeggio, the pop and the two notes of a request never vary.
//
// Every recipe stays safe: no part louder than SOUND_LIMITS.maxGain, its layers together never past
// maxMix at any moment, every frequency between 40 Hz and 10 kHz, the whole sound over within 1.2 s
// (sounds.test holds each one over many seeds). Sound is never the only cue for anything: everything
// it marks is drawn, and the live regions say it.

import {UNIT_MS, type CardTiming, type SplitFlight, type StreamChip} from '@/lib/poker-night/choreography';
import type {TableEvent} from '@/lib/poker-night/events';
import {fnv1a, mulberry32} from '@/lib/random';

// What a thrown thing sounds like as it lands, one each (lib/poker-night/emotes.landingSound).
export const HIT_SOUND_IDS = [
    'hit-tomato', 'hit-rose', 'hit-soda', 'hit-confetti', 'hit-cake', 'hit-egg', 'hit-tennis-ball', 'hit-popcorn', 'hit-heart', 'hit-fish',
] as const;
export const SOUND_IDS = ['deal', 'chip', 'check', 'fold', 'win', 'turn', 'pop', 'request', 'ask', ...HIT_SOUND_IDS] as const;
export type SoundId = (typeof SOUND_IDS)[number];

// A tone: an oscillator gliding from freq to `to` (Hz); a noise: a slice of white noise through a
// filter whose corner (or centre, with its resonance q) glides the same way. at and dur in seconds
// from the sound's start; gain the peak, reached by a linear attack (`attack` seconds, 5 ms unless
// said) and followed by an exponential fall to silence at the part's end.
export type Tone = {kind: 'tone'; wave: 'sine' | 'triangle' | 'square' | 'sawtooth'; freq: number; to?: number; at: number; dur: number; gain: number; attack?: number};
export type Noise = {kind: 'noise'; filter: 'lowpass' | 'highpass' | 'bandpass'; freq: number; to?: number; q?: number; at: number; dur: number; gain: number; attack?: number};
export type SoundPart = Tone | Noise;

// maxMix: the layers' levels added up at any moment (partLevel), the most a sound may reach.
export const SOUND_LIMITS = {maxGain: 0.35, maxMix: 0.75, minHz: 40, maxHz: 10000, maxSeconds: 1.2} as const;

// The attack a part takes unless it says, and the level an envelope falls to (an exponential ramp
// never reaches zero): the player's own (components/poker-night/sound-player).
export const DEFAULT_ATTACK = 0.005;
export const ENVELOPE_FLOOR = 0.0001;

// ── the recipes ──

// What a recipe draws its variation from: `n(x, spread)` x scaled by up to ± spread (0.1: ±10 %),
// `pick(lo, hi)` a value between, `int(lo, hi)` a whole number from lo to hi.
type Vary = {n: (x: number, spread: number) => number; pick: (lo: number, hi: number) => number; int: (lo: number, hi: number) => number};
type Recipe = (v: Vary) => SoundPart[];
type Extra = {to?: number; attack?: number};

const tone = (wave: Tone['wave'], freq: number, at: number, dur: number, gain: number, extra: Extra = {}): Tone =>
    ({kind: 'tone', wave, freq, at, dur, gain, ...extra});
const noise = (filter: Noise['filter'], freq: number, at: number, dur: number, gain: number, extra: Extra & {q?: number} = {}): Noise =>
    ({kind: 'noise', filter, freq, at, dur, gain, ...extra});

// Droplets: a drop's plip is a tiny sine chirp rising as its bubble closes.
const droplets = (v: Vary, count: number, from: number, to: number, hz: number, gain: number): Tone[] =>
    Array.from({length: count}, () => {
        const f = v.pick(hz * 0.8, hz * 1.25);
        return tone('sine', f, v.pick(from, to), v.pick(0.018, 0.03), v.n(gain, 0.3), {to: f * v.pick(1.6, 2.1), attack: 0.002});
    });

// Ticks: the shortest bursts of bright noise — a fizz's bubbles bursting, paper crinkling.
const ticks = (v: Vary, count: number, from: number, to: number, hz: number, gain: number): Noise[] =>
    Array.from({length: count}, () => noise('highpass', v.n(hz, 0.15), v.pick(from, to), v.pick(0.003, 0.007), v.n(gain, 0.3), {attack: 0.0008}));

const RECIPES: Record<SoundId, Recipe> = {
    // A card off the deck: a swish through the air rising as it flies, and a crisp snap as it lands on
    // the felt (a bright click with the card's own small body under it).
    deal: (v) => {
        const snap = v.pick(0.055, 0.075);
        return [
            noise('bandpass', v.n(2800, 0.12), 0, snap + 0.01, 0.17, {to: v.n(5200, 0.1), q: 0.9, attack: 0.02}),
            noise('highpass', v.n(3600, 0.1), snap, 0.016, 0.22, {attack: 0.0008}),
            tone('sine', v.n(900, 0.1), snap, 0.022, 0.05, {to: 520, attack: 0.001}),
        ];
    },
    // Chips: two to four clay chips clacking down, each a click, a short ceramic ring of two partials
    // and the clay's dull body, at its own pitch and moment, the later ones softer.
    chip: (v) => {
        const out: SoundPart[] = [];
        let at = 0;
        for (let k = 0, n = v.int(2, 4); k < n; k++) {
            const f = v.pick(2900, 3700);
            const s = k === 0 ? 1 : v.pick(0.45, 0.85);
            out.push(
                noise('highpass', 5200, at, 0.006, 0.18 * s, {attack: 0.0008}),
                tone('sine', f, at, v.pick(0.028, 0.045), 0.11 * s, {attack: 0.001}),
                tone('sine', f * v.pick(1.48, 1.56), at, 0.022, 0.06 * s, {attack: 0.001}),
                noise('bandpass', v.pick(1700, 2300), at, 0.014, 0.09 * s, {q: 3, attack: 0.001}),
            );
            at += v.pick(0.03, 0.075);
        }
        return out;
    },
    // A check: two knocks of a knuckle on the table — a low thump and the wood's click — the second
    // a little softer.
    check: (v) => {
        const knock = (at: number, s: number): SoundPart[] => [
            tone('sine', v.n(150, 0.06), at, 0.08, 0.28 * s, {to: 92, attack: 0.002}),
            noise('bandpass', v.n(850, 0.1), at, 0.03, 0.16 * s, {q: 2.2, attack: 0.001}),
        ];
        return [...knock(0, 1), ...knock(v.pick(0.1, 0.125), 0.88)];
    },
    // A fold: the cards swept across the felt, and their small slap on the muck.
    fold: (v) => [
        noise('lowpass', v.n(2400, 0.1), 0, v.n(0.2, 0.1), 0.13, {to: 450, attack: 0.025}),
        noise('bandpass', v.n(1300, 0.12), 0.02, 0.16, 0.07, {to: 700, q: 0.8, attack: 0.03}),
        noise('highpass', 3200, v.pick(0.15, 0.19), 0.014, 0.08, {attack: 0.001}),
    ],
    // A win: a rising arpeggio, the last note held with a soft octave over it.
    win: () => [
        tone('triangle', 523, 0, 0.14, 0.18),
        tone('triangle', 659, 0.09, 0.14, 0.18),
        tone('triangle', 784, 0.18, 0.14, 0.18),
        tone('triangle', 1047, 0.27, 0.3, 0.18),
        tone('sine', 2094, 0.27, 0.28, 0.04),
    ],
    // The viewer's turn: a gentle two-note chime.
    turn: () => [
        tone('triangle', 659, 0, 0.12, 0.2),
        tone('triangle', 880, 0.12, 0.16, 0.2),
    ],
    // An emote appearing: a soft rising pop.
    pop: () => [tone('sine', 600, 0, 0.06, 0.15, {to: 1200})],
    // The host's note: a player asks for chips (a soft knock-knock, then a short bell).
    request: () => [
        tone('sine', 220, 0, 0.06, 0.18, {to: 160}),
        tone('sine', 220, 0.1, 0.06, 0.16, {to: 160}),
        tone('triangle', 988, 0.2, 0.22, 0.12),
    ],
    // The viewer is asked to see their cards: a gentle rising two-note question.
    ask: () => [
        tone('triangle', 587, 0, 0.12, 0.15),
        tone('triangle', 784, 0.11, 0.18, 0.15, {to: 830}),
    ],

    // ── what lands ──

    // A tomato: the skin bursting (a bright tick), a juicy splat (a burst of noise closing down), the
    // pulp's low thud, a wet squish and a few drips after.
    'hit-tomato': (v) => {
        const body = v.n(140, 0.1);
        return [
            tone('sine', body, 0, 0.15, 0.24, {to: body * 0.4, attack: 0.002}),
            noise('lowpass', v.n(3200, 0.1), 0, v.n(0.13, 0.1), 0.3, {to: 480, attack: 0.001}),
            noise('highpass', 2500, 0, 0.025, 0.12, {attack: 0.001}),
            noise('bandpass', v.n(950, 0.12), v.pick(0.01, 0.02), v.n(0.24, 0.1), 0.2, {to: 300, q: 3.5, attack: 0.008}),
            ...droplets(v, v.int(2, 4), 0.22, 0.75, 1000, 0.05),
        ];
    },
    // A rose: a soft whoosh of air past the petals, rising, a gentle pop as it lands and the petals'
    // rustle settling.
    'hit-rose': (v) => [
        noise('bandpass', v.n(520, 0.1), 0, v.n(0.28, 0.08), 0.22, {to: v.n(1900, 0.1), q: 1.1, attack: 0.12}),
        tone('sine', v.n(520, 0.08), 0.25, 0.08, 0.16, {to: 880, attack: 0.004}),
        noise('highpass', 2400, 0.25, 0.012, 0.05, {attack: 0.001}),
        noise('bandpass', 3800, 0.27, v.n(0.22, 0.1), 0.08, {to: 2600, q: 1.4, attack: 0.03}),
    ],
    // A soda can: a metal clink (a click and three inharmonic partials ringing short), a smaller one
    // as it bounces, then the fizz — a rising hiss and its bubbles bursting.
    'hit-soda': (v) => {
        const f = v.n(1900, 0.06);
        const clink = (at: number, s: number): SoundPart[] => [
            noise('highpass', 6500, at, 0.008, 0.16 * s, {attack: 0.0008}),
            tone('sine', f, at, 0.16, 0.12 * s, {attack: 0.001}),
            tone('sine', f * 1.59, at, 0.11, 0.08 * s, {attack: 0.001}),
            tone('sine', f * 2.71, at, 0.07, 0.05 * s, {attack: 0.001}),
        ];
        return [
            ...clink(0, 1),
            ...clink(v.pick(0.085, 0.11), 0.45),
            noise('highpass', v.n(4200, 0.08), 0.05, v.n(0.62, 0.08), 0.08, {to: 7400, attack: 0.06}),
            noise('bandpass', 6000, 0.08, 0.5, 0.06, {q: 1.2, to: 8200, attack: 0.08}),
            ...ticks(v, v.int(6, 9), 0.1, 0.78, 7000, 0.07),
        ];
    },
    // Confetti: a party popper's paper pop (a burst of air with a little body), then the paper
    // rustling down, crinkling here and there.
    'hit-confetti': (v) => [
        noise('lowpass', v.n(2200, 0.1), 0, 0.035, 0.3, {to: 600, attack: 0.001}),
        tone('sine', v.n(210, 0.1), 0, 0.06, 0.16, {to: 90, attack: 0.001}),
        noise('highpass', 3000, 0, 0.01, 0.12, {attack: 0.0008}),
        noise('bandpass', v.n(3600, 0.1), 0.04, v.n(0.5, 0.1), 0.12, {to: 2800, q: 0.9, attack: 0.04}),
        ...ticks(v, v.int(4, 6), 0.06, 0.6, 5200, 0.06),
    ],
    // Cake: a soft, muffled thud — a low body, the sponge's dull burst closing down, a soft squish.
    'hit-cake': (v) => {
        const body = v.n(105, 0.1);
        return [
            tone('sine', body, 0, 0.22, 0.28, {to: body * 0.5, attack: 0.004}),
            noise('lowpass', v.n(650, 0.12), 0, 0.24, 0.26, {to: 160, attack: 0.003}),
            noise('bandpass', v.n(480, 0.12), 0.02, 0.2, 0.16, {to: 240, q: 2, attack: 0.012}),
            noise('lowpass', 1400, 0.008, 0.09, 0.07, {to: 400, attack: 0.004}),
        ];
    },
    // An egg: the shell cracking (a few short bright clicks and a brittle ring), then its splat — a
    // burst, a small thud, a squish — and a drip or two.
    'hit-egg': (v) => [
        ...Array.from({length: v.int(3, 4)}, (_, k) => noise('bandpass', v.n(5200, 0.2), k * v.pick(0.008, 0.016), v.pick(0.006, 0.011), v.n(0.26, 0.15), {q: 2.5, attack: 0.0008})),
        tone('sine', v.n(2400, 0.1), 0.004, 0.025, 0.05, {to: 1900, attack: 0.001}),
        noise('lowpass', v.n(2000, 0.1), 0.05, 0.13, 0.24, {to: 380, attack: 0.002}),
        tone('sine', v.n(170, 0.1), 0.05, 0.09, 0.14, {to: 75, attack: 0.002}),
        noise('bandpass', v.n(1100, 0.12), 0.06, 0.17, 0.18, {to: 420, q: 3.5, attack: 0.006}),
        ...droplets(v, v.int(1, 2), 0.25, 0.55, 1300, 0.045),
    ],
    // A tennis ball: a felt-covered thock — a hollow low knock, the felt's fuzzy burst and the ball's
    // own small ring — then two bounces, each smaller and sooner.
    'hit-tennis-ball': (v) => {
        const thock = (at: number, s: number): SoundPart[] => [
            tone('sine', v.n(250, 0.06), at, 0.07, 0.26 * s, {to: 140, attack: 0.001}),
            noise('bandpass', v.n(1300, 0.1), at, 0.035, 0.24 * s, {q: 1.4, attack: 0.0008}),
            tone('sine', v.n(560, 0.05), at, 0.05, 0.06 * s, {to: 470, attack: 0.001}),
        ];
        const first = v.pick(0.2, 0.26);
        return [...thock(0, 1), ...thock(first, 0.45), ...thock(first * (1 + v.pick(0.5, 0.6)), 0.2)];
    },
    // Popcorn: four to six kernels popping, each a hollow pop at its own pitch and moment.
    'hit-popcorn': (v) => Array.from({length: v.int(4, 6)}, (_, k): SoundPart[] => {
        const at = k === 0 ? 0 : v.pick(0.05, 0.7);
        return [
            noise('bandpass', v.pick(1500, 2600), at, v.pick(0.015, 0.025), v.pick(0.2, 0.3), {q: 2, attack: 0.0008}),
            tone('sine', v.pick(650, 1000), at, 0.03, 0.06, {to: 420, attack: 0.001}),
        ];
    }).flat(),
    // A heart: a soft whoosh, higher than the rose's, a gentle pop and a little sparkle.
    'hit-heart': (v) => [
        noise('bandpass', v.n(700, 0.1), 0, v.n(0.24, 0.08), 0.2, {to: v.n(2400, 0.1), q: 1.3, attack: 0.1}),
        tone('sine', v.n(660, 0.06), 0.21, 0.07, 0.16, {to: 1100, attack: 0.004}),
        tone('sine', v.n(1760, 0.02), 0.25, 0.22, 0.04, {attack: 0.004}),
        tone('sine', v.n(2637, 0.02), 0.29, 0.2, 0.03, {attack: 0.004}),
    ],
    // A fish: the heavy body landing (a low-mid thump, 60–180 Hz, with the flesh under it), the wet
    // slap of its side (a broadband transient and its smack closing down), a squelch — band-passed
    // noise, resonant, its centre falling — and a smaller one as it flops, then droplets flung off.
    'hit-fish': (v) => {
        const body = v.n(165, 0.08);
        return [
            tone('sine', body, 0, v.n(0.17, 0.1), 0.28, {to: body * 0.38, attack: 0.002}),
            tone('triangle', body * 0.66, 0.004, 0.12, 0.08, {to: body * 0.36, attack: 0.003}),
            noise('highpass', v.n(1100, 0.15), 0, v.n(0.035, 0.15), 0.28, {attack: 0.001}),
            noise('lowpass', v.n(2600, 0.1), 0, 0.07, 0.16, {to: 700, attack: 0.001}),
            noise('bandpass', v.n(1500, 0.12), v.pick(0.012, 0.025), v.n(0.2, 0.1), 0.3, {to: v.n(330, 0.15), q: v.n(4, 0.2), attack: 0.006}),
            noise('bandpass', v.n(800, 0.15), v.pick(0.11, 0.15), v.n(0.15, 0.15), 0.2, {to: v.n(260, 0.15), q: v.n(5, 0.2), attack: 0.01}),
            ...droplets(v, v.int(3, 4), 0.07, 0.45, 1500, 0.06),
        ];
    },
};

// The sounds that sound the same whatever the seed: the cues of the table's own life, not things.
export const FIXED_SOUNDS: readonly SoundId[] = ['win', 'turn', 'pop', 'request', 'ask'];

// To the nearest Hz, ms (a tenth of one for an attack) and thousandth of gain: what is played.
const tidy = (p: SoundPart): SoundPart => {
    const hz = (x: number) => Math.round(x);
    const s = (x: number) => Math.round(x * 1000) / 1000;
    const out = {...p, freq: hz(p.freq), at: s(p.at), dur: s(p.dur), gain: Math.round(p.gain * 1000) / 1000} as SoundPart;
    if (p.to !== undefined) out.to = hz(p.to);
    if (p.attack !== undefined) out.attack = Math.round(p.attack * 10000) / 10000;
    if (p.kind === 'noise' && p.q !== undefined) (out as Noise).q = Math.round(p.q * 100) / 100;
    return out;
};

// A sound as played from `seed`: the same seed always gives the same parts.
export const soundParts = (id: SoundId, seed: number): SoundPart[] => {
    const random = mulberry32(seed);
    const v: Vary = {
        n: (x, spread) => x * (1 + (random() * 2 - 1) * spread),
        pick: (lo, hi) => lo + random() * (hi - lo),
        int: (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)),
    };
    return RECIPES[id](v).map(tidy);
};

// A seed from a key (a cue's, an emote's id): the same key, the same sound on every screen.
export const soundSeed = (key: string): number => fnv1a(key);

// How long a sound runs, in seconds.
export const soundLength = (parts: readonly SoundPart[]): number => Math.max(...parts.map((p) => p.at + p.dur));

// A part's level at `t` seconds from the sound's start, as the player's envelope shapes it: a linear
// rise over its attack, then an exponential fall to the floor at its end.
export const partLevel = (p: SoundPart, t: number): number => {
    const attack = Math.min(p.attack ?? DEFAULT_ATTACK, p.dur * 0.9);
    const local = t - p.at;
    if (local < 0 || local > p.dur) return 0;
    if (local <= attack) return attack === 0 ? p.gain : ENVELOPE_FLOOR + (p.gain - ENVELOPE_FLOOR) * (local / attack);
    const fall = p.dur - attack;
    return fall <= 0 ? p.gain : p.gain * Math.pow(ENVELOPE_FLOOR / p.gain, (local - attack) / fall);
};

// The most a sound's layers reach together, sampled every half millisecond.
export const soundMix = (parts: readonly SoundPart[]): number => {
    let most = 0;
    const end = soundLength(parts);
    for (let t = 0; t <= end; t += 0.0005) most = Math.max(most, parts.reduce((sum, p) => sum + partLevel(p, t), 0));
    return most;
};

// ── when they play ──

// The same sound at most once per this long; a burst of chips is a few clacks, not a buzz.
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

// One sound at one moment: key, so a cue plays once however often the animations are read (and its
// seed, so each card and chip has its own sound, the same on every screen); at, in units of
// --motion-base from now.
export type Cue = {key: string; sound: SoundId; at: number; seed: number};

// The sounds the table's animations make, each at the moment its animation does: a card for each
// card dealt, turned or shown, chips for each bet, sweep and refund, a knock for a check, a swish
// for a fold and for a card thrown away (Triple T), a pop for a player sitting down; a win's arpeggio as its banner drops, chips for each
// pot's share flying to its board (two or three boards), a clack for each chip of a stream. A result the table had already shown (still) is silent; the
// viewer's turn is the room's own (useTableSounds), not an animation.
export const soundCues = (anims: readonly CueAnim[]): Cue[] => {
    const out: Cue[] = [];
    const push = (key: string, sound: SoundId, at: number) => out.push({key, sound, at, seed: soundSeed(key)});
    for (const a of anims) {
        if (a.still) continue;
        const at = (t: number) => a.offset + t;
        const cards = (sound: SoundId) => (a.cards ?? []).forEach((c, k) => push(`${a.id}:${k}`, sound, at(c.at)));
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
                push(a.id, 'chip', at(a.at));
                break;
            case 'check':
                push(a.id, 'check', at(a.at));
                break;
            case 'fold':
            case 'discard':
                push(a.id, 'fold', at(a.at));
                break;
            case 'join':
                push(a.id, 'pop', at(a.at));
                break;
            case 'win':
                push(`${a.id}:win`, 'win', at(a.bannerAt ?? a.at));
                (a.splits ?? []).forEach((s) => push(`${a.id}:split:${s.key}`, 'chip', at(s.at)));
                (a.streams ?? []).forEach((s) => push(`${a.id}:${s.key}`, 'chip', at(s.at)));
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
