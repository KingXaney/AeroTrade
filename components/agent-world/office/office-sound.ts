// The office's sound player: one audio context, made when the reader turns the sound on (a gesture
// a browser counts) and resumed by the next gesture when the page opened with it on; every cue is
// built from its recipe (lib/agent-world/office-sounds.ts) into short-lived nodes through one master
// gain and a gentle compressor. Nothing plays while the context is not running.

import {OFFICE_SOUNDS, type OfficeCue, type SoundPart} from "@/lib/agent-world/office-sounds";

export type OfficeSoundPlayer = {play: (cue: OfficeCue, delayMs: number) => void; unlock: () => void; dispose: () => void};

type AudioWindow = Window & {webkitAudioContext?: typeof AudioContext};

const FLOOR_GAIN = 0.0001;

export const createOfficeSound = (): OfficeSoundPlayer | null => {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) return null;
    let context: AudioContext;
    try {
        context = new Context();
    } catch {
        return null;
    }
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    const master = context.createGain();
    master.gain.value = 0.9;
    master.connect(compressor).connect(context.destination);

    // One second of white noise, read from a random offset by every noise part.
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;

    const envelope = (start: number, part: SoundPart): GainNode => {
        const gain = context.createGain();
        const end = start + part.dur / 1000;
        gain.gain.setValueAtTime(FLOOR_GAIN, start);
        gain.gain.linearRampToValueAtTime(part.gain, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(FLOOR_GAIN, end);
        gain.connect(master);
        return gain;
    };

    const playPart = (part: SoundPart, start: number) => {
        const end = start + part.dur / 1000;
        const gain = envelope(start, part);
        if (part.kind === 'tone') {
            const tone = context.createOscillator();
            tone.type = part.wave;
            tone.frequency.setValueAtTime(part.from, start);
            if (part.to !== part.from) tone.frequency.exponentialRampToValueAtTime(part.to, end);
            tone.connect(gain);
            tone.start(start);
            tone.stop(end + 0.05);
            return;
        }
        const source = context.createBufferSource();
        source.buffer = noise;
        const filter = context.createBiquadFilter();
        filter.type = part.filter;
        filter.Q.value = part.q;
        filter.frequency.setValueAtTime(part.from, start);
        if (part.to !== part.from) filter.frequency.exponentialRampToValueAtTime(part.to, end);
        source.connect(filter).connect(gain);
        source.start(start, Math.random() * 0.5);
        source.stop(end + 0.05);
    };

    return {
        play: (cue, delayMs) => {
            if (context.state !== 'running') return;
            const start = context.currentTime + 0.01 + delayMs / 1000;
            for (const part of OFFICE_SOUNDS[cue]) playPart(part, start + part.at / 1000);
        },
        unlock: () => {
            if (context.state === 'suspended') void context.resume().catch(() => undefined);
        },
        dispose: () => {
            void context.close().catch(() => undefined);
        },
    };
};
