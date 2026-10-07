// The browser's reading of the server's clock. Every deadline a table view carries (a turn's, the
// next street's, the next deal's, nextDueAt) is server time, and a phone's clock can be seconds
// off; so the table keeps an offset — how far the server runs ahead of this browser — from the
// round trips it makes anyway, and converts with it. Pure and client-safe: the caller passes the
// times (Date.now() in an effect or a handler, never during render).
//
// A sample is the server's time when it answered against the midpoint of the request's round trip;
// the offset is the median of the last OFFSET_SAMPLES, so one slow answer cannot move it far.

// How many samples the median runs over.
export const OFFSET_SAMPLES = 5;
// A round trip longer than this says little about the clock (its midpoint may be off by half of
// it), so it is not taken as a sample.
export const MAX_SAMPLE_RTT_MS = 10_000;

// One sample: server time minus the round trip's midpoint, or null when the round trip is too long
// or runs backwards.
export const offsetSample = (sentAt: number, receivedAt: number, serverNow: number): number | null => {
    const rtt = receivedAt - sentAt;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > MAX_SAMPLE_RTT_MS || !Number.isFinite(serverNow)) return null;
    return serverNow - (sentAt + receivedAt) / 2;
};

export const median = (values: readonly number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// The samples with one more, the last OFFSET_SAMPLES kept, and the offset they give (whole ms).
export const nextOffset = (samples: readonly number[], sample: number): {offset: number; samples: number[]} => {
    const kept = [...samples, sample].slice(-OFFSET_SAMPLES);
    return {offset: Math.round(median(kept)), samples: kept};
};

// The server's time now, and a server time on this browser's clock.
export const serverTimeAt = (clientNow: number, offset: number): number => clientNow + offset;
export const clientTimeOf = (serverTime: number, offset: number): number => serverTime - offset;

export type TurnLeft = {
    ms: number; // left to the deadline the table shows (the server's grace after it is never shown)
    seconds: number; // the same, rounded up: what a countdown prints
    fraction: number; // of the whole turn, 0..1: what a ring draws
};

// What is left of a turn: its deadline (server time) against the clock now, as a share of the
// turn's length. Null with no deadline.
export const turnLeft = (deadline: number | null, turnMs: number, clientNow: number, offset: number): TurnLeft | null => {
    if (deadline === null || !Number.isFinite(deadline)) return null;
    const ms = Math.max(0, deadline - serverTimeAt(clientNow, offset));
    const fraction = turnMs > 0 ? Math.min(1, ms / turnMs) : 0;
    return {ms, seconds: Math.ceil(ms / 1000), fraction};
};

// Whole seconds until a server time (the next deal, the next street), never below zero; null when
// there is none.
export const secondsUntil = (at: number | null, clientNow: number, offset: number): number | null =>
    at === null || !Number.isFinite(at) ? null : Math.max(0, Math.ceil((at - serverTimeAt(clientNow, offset)) / 1000));

// The countdown ring's tone: the brand colour for most of the turn, a warning at 30 % and the
// negative colour at 10 %. Colour is never the only cue: the seconds are printed beside it.
export type TurnTone = 'brand' | 'warning' | 'negative';
export const turnTone = (fraction: number): TurnTone => (fraction <= 0.1 ? 'negative' : fraction <= 0.3 ? 'warning' : 'brand');
