// The messages between the page and the poker worker (components/poker/engine.worker.ts). Versioned:
// the page uses the worker only when its `ready` names this protocol. Pure types.

import type {PokerProgress, PokerRequest, PokerResult} from "@/lib/poker/jobs";

// 2: the river job, and a stopped job's result.
export const ENGINE_PROTOCOL = 2;

export type ToEngine =
    | {type: 'hello'}
    // A newer start stops the job before it: the latest one wins.
    | {type: 'start'; id: number; request: PokerRequest}
    | {type: 'stop'; id: number};

export type FromEngine =
    | {type: 'ready'; protocol: number}
    | {type: 'progress'; id: number; progress: PokerProgress}
    | {type: 'done'; id: number; result: PokerResult}
    // A job that finishes on stop (the river solver) still sends its result.
    | {type: 'stopped'; id: number; progress: PokerProgress | null; result: PokerResult | null}
    | {type: 'failed'; id: number; message: string};
