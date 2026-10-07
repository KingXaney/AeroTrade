// The table's sounds in the browser: lib/poker-night/sounds' recipes played through one Web Audio
// context per page. The context is made, and resumed, inside a gesture's handler (unlockSound,
// listened for by stayUnlocked, which useTableSounds mounts) — a browser lets no page make a sound
// before a gesture, and only some events count as one: a click, a touch's pointerup or touchend, a
// mouse press, a key (a touch's pointerdown does not; iOS starts Web Audio only in a touchend or a
// click). Any state but 'running' is resumed — 'suspended', and WebKit's 'interrupted' after a call
// or an app switch. A one-second buffer of white noise is made once and every noise part
// plays a slice of it through its filter; a master gain sits in front of the speakers. The same
// sound plays at most once per 60 ms, and nothing plays while the page is hidden except the
// viewer's turn (lib/poker-night/sounds.createSoundGate). No file is fetched, nothing is stored.

import {createSoundGate, SOUNDS, type SoundId, type SoundPart} from "@/lib/poker-night/sounds";

const MASTER_GAIN = 0.6;
// The quietest level an envelope falls to (exponential ramps cannot reach zero).
const FLOOR = 0.0001;
const ATTACK_S = 0.005;

type AudioContextClass = typeof AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const gate = createSoundGate();

const contextClass = (): AudioContextClass | null => {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass};
    return w.AudioContext ?? w.webkitAudioContext ?? null;
};

// What listens for the context's state (stayUnlocked): told on every change.
const stateListeners = new Set<() => void>();

// Called from a gesture's handler: makes the page's one context (and its master gain and noise),
// or resumes it whenever it is not running. Safe to call on every gesture.
export const unlockSound = (): void => {
    try {
        if (!ctx) {
            const Ctx = contextClass();
            if (!Ctx) return;
            ctx = new Ctx();
            master = ctx.createGain();
            master.gain.value = MASTER_GAIN;
            master.connect(ctx.destination);
            const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            noise = buffer;
            ctx.addEventListener('statechange', () => {
                for (const listener of [...stateListeners]) listener();
            });
        }
        if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    } catch {
        // A browser without Web Audio, or one that refused: the table stays silent.
        ctx = null;
    }
};

// Whether the page has its context yet (the first gesture has come).
export const soundUnlocked = (): boolean => ctx !== null;

// The events a browser counts as a user's gesture (user activation), listened for on the window in
// the capture phase.
const GESTURES = ['click', 'pointerup', 'touchend', 'mousedown', 'keydown'] as const;

// Listens for gestures until the context runs, and again whenever it stops running (the browser
// suspended or interrupted it: a resume counts only inside a gesture); returns how to stop.
export const stayUnlocked = (): (() => void) => {
    let listening = false;
    const onGesture = () => unlockSound();
    const listen = (on: boolean) => {
        if (on === listening) return;
        listening = on;
        for (const type of GESTURES) {
            if (on) window.addEventListener(type, onGesture, {capture: true, passive: true});
            else window.removeEventListener(type, onGesture, {capture: true});
        }
    };
    const onState = () => listen(ctx?.state !== 'running');
    stateListeners.add(onState);
    onState();
    return () => {
        stateListeners.delete(onState);
        listen(false);
    };
};

const envelope = (c: AudioContext, part: SoundPart, start: number): GainNode => {
    const g = c.createGain();
    g.gain.setValueAtTime(FLOOR, start);
    g.gain.linearRampToValueAtTime(part.gain, start + ATTACK_S);
    g.gain.exponentialRampToValueAtTime(FLOOR, start + part.dur);
    return g;
};

const playPart = (c: AudioContext, out: AudioNode, part: SoundPart, t0: number): void => {
    const start = t0 + part.at;
    const end = start + part.dur;
    const g = envelope(c, part, start);
    g.connect(out);
    if (part.kind === 'tone') {
        const osc = c.createOscillator();
        osc.type = part.wave;
        osc.frequency.setValueAtTime(part.freq, start);
        if (part.to !== undefined) osc.frequency.exponentialRampToValueAtTime(part.to, end);
        osc.connect(g);
        osc.start(start);
        osc.stop(end + 0.02);
        osc.onended = () => g.disconnect();
        return;
    }
    if (!noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = part.filter;
    filter.frequency.setValueAtTime(part.freq, start);
    if (part.to !== undefined) filter.frequency.exponentialRampToValueAtTime(part.to, end);
    if (part.q !== undefined) filter.Q.value = part.q;
    src.connect(filter);
    filter.connect(g);
    // A different slice of the noise each time, so two swishes are not the same swish.
    src.start(start, Math.random() * Math.max(0, noise.duration - part.dur - 0.05), part.dur + 0.02);
    src.onended = () => {
        filter.disconnect();
        g.disconnect();
    };
};

// Plays a sound now, if the page has its context, the gate lets it through and nothing failed.
export const playSound = (id: SoundId): void => {
    const c = ctx;
    const out = master;
    if (!c || !out) return;
    if (!gate(id, Date.now(), typeof document !== 'undefined' && document.hidden)) return;
    try {
        if (c.state !== 'running') void c.resume().catch(() => undefined);
        const t0 = c.currentTime + 0.01;
        for (const part of SOUNDS[id]) playPart(c, out, part, t0);
    } catch {
        // A node the browser would not make: this sound is skipped.
    }
};
