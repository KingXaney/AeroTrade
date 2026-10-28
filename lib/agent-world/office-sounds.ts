// The office's sound cues, synthesised in the browser by components/agent-world/office/office-sound.ts:
// each cue a few short parts — a tone that may glide, or a burst of filtered noise — held quiet by
// SOUND_LIMITS (the test pins every recipe to them). Off until the reader turns them on. Pure and
// import-free.

export const OFFICE_CUES = ['fetch', 'filed', 'turn', 'pin', 'stamp', 'done'] as const;
export type OfficeCue = (typeof OFFICE_CUES)[number];

// A part starts `at` ms into its cue and lasts `dur` ms, its level rising in a few ms and falling
// away exponentially; `from` and `to` are its pitch (a tone) or its filter's centre (noise), in Hz.
export type SoundPart =
    | {kind: 'tone'; wave: 'sine' | 'triangle'; from: number; to: number; at: number; dur: number; gain: number}
    | {kind: 'noise'; filter: 'bandpass' | 'highpass' | 'lowpass'; from: number; to: number; q: number; at: number; dur: number; gain: number};

export const SOUND_LIMITS = {partGain: 0.2, cueGain: 0.4, minHz: 40, maxHz: 9000, maxMs: 900} as const;

export const OFFICE_SOUNDS: Readonly<Record<OfficeCue, readonly SoundPart[]>> = {
    // A paper plane coming back with the data: a short rising whoosh.
    fetch: [{kind: 'noise', filter: 'bandpass', from: 900, to: 2600, q: 1.4, at: 0, dur: 220, gain: 0.07}],
    // A page laid down, and a tick.
    filed: [
        {kind: 'noise', filter: 'highpass', from: 2800, to: 2800, q: 0.7, at: 0, dur: 60, gain: 0.08},
        {kind: 'tone', wave: 'sine', from: 1320, to: 1320, at: 30, dur: 90, gain: 0.04},
    ],
    // A turn spoken: two soft notes, a third apart.
    turn: [
        {kind: 'tone', wave: 'triangle', from: 523.25, to: 523.25, at: 0, dur: 70, gain: 0.05},
        {kind: 'tone', wave: 'triangle', from: 659.25, to: 659.25, at: 90, dur: 80, gain: 0.05},
    ],
    // A card pinned to the cork.
    pin: [
        {kind: 'tone', wave: 'triangle', from: 320, to: 190, at: 0, dur: 90, gain: 0.08},
        {kind: 'noise', filter: 'highpass', from: 4000, to: 4000, q: 0.7, at: 0, dur: 25, gain: 0.05},
    ],
    // The stamp coming down on the desk.
    stamp: [
        {kind: 'tone', wave: 'sine', from: 120, to: 55, at: 0, dur: 240, gain: 0.18},
        {kind: 'noise', filter: 'lowpass', from: 500, to: 200, q: 0.7, at: 0, dur: 140, gain: 0.12},
    ],
    // The desk done: three rising notes.
    done: [
        {kind: 'tone', wave: 'sine', from: 523.25, to: 523.25, at: 0, dur: 160, gain: 0.05},
        {kind: 'tone', wave: 'sine', from: 659.25, to: 659.25, at: 110, dur: 160, gain: 0.05},
        {kind: 'tone', wave: 'sine', from: 783.99, to: 783.99, at: 220, dur: 260, gain: 0.05},
    ],
};

// Which cue an office event sounds, by its key (lib/agent-world/office.officeEvents, the ticker's ids):
// a fetch's data landing, a filing, a turn, a rating pinned, the owner's decision, the desk done.
// Nothing else makes a sound.
export const cueForEvent = (key: string): OfficeCue | null => {
    if (key.startsWith('result:')) return 'fetch';
    if (key.startsWith('report:')) return 'filed';
    if (key.startsWith('turn:')) return 'turn';
    if (key.startsWith('run-completed:')) return 'pin';
    if (key === 'decision') return 'stamp';
    if (key === 'desk-done') return 'done';
    return null;
};

// A poll brings a few seconds of events at once: they sound one after another, CUE_GAP_MS apart, at
// most CUES_PER_BATCH of them (the newest kept), so a batch reads as activity, not a pile.
export const CUE_GAP_MS = 220;
export const CUES_PER_BATCH = 4;

export const cuesFor = (keys: readonly string[]): {cue: OfficeCue; delay: number}[] => {
    const cues = keys.map(cueForEvent).filter((cue): cue is OfficeCue => cue !== null).slice(-CUES_PER_BATCH);
    return cues.map((cue, i) => ({cue, delay: i * CUE_GAP_MS}));
};
