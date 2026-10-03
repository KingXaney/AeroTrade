// The preflop table, loaded once per thread on first use: its JSON is a chunk of its own (about
// 85 KB), so a page that never runs a preflop job never fetches it.

import {decodePreflop, type PreflopFile, type PreflopTable} from "@/lib/poker/preflop";

let loading: Promise<PreflopTable> | null = null;

export const loadPreflopTable = (): Promise<PreflopTable> => {
    loading ??= import("@/lib/poker/data/preflop-equity.json").then((module) => decodePreflop(module.default as PreflopFile));
    return loading;
};

// Hands control back to the event loop: a message to itself, which no timer clamping delays.
export const yieldToLoop = (): Promise<void> =>
    new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            channel.port1.close();
            resolve();
        };
        channel.port2.postMessage(null);
    });
