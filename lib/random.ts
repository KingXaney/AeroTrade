// Seeded randomness and hashing, import-free so any layer can use it: the server's pure modules,
// the client games and the poker worker alike. The same input gives the same output on every
// machine, so a seeded sample or a day's pick holds across reloads and learners.
//
// scripts/qa/qa-learn-account.mjs keeps its own copy of both functions to recompute Luck or
// skill's sample; lib/__tests__/random.test.ts pins their outputs, so neither can drift.

// 32-bit FNV-1a over UTF-16 code units.
export const fnv1a = (text: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

// A small, well-mixed 32-bit generator: the same seed always yields the same stream in [0, 1).
export const mulberry32 = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
