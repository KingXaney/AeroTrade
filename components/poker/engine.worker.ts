// The poker solver's Web Worker: runs the solvers off the page's thread, so a long equity run or a
// push/fold solve never freezes the page. A classic worker under Turbopack — no top-level await.
// It is created only by components/poker/engine-worker-host.ts, beside it in this folder, so
// moving the folder keeps the `new URL('./engine.worker.ts')` valid.

import {cardLabel} from "@/lib/poker/cards";

type Scope = {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};
const scope = self as unknown as Scope;

scope.addEventListener('message', (event) => {
    const message = event.data as {type?: string};
    if (message.type === 'hello') {
        scope.postMessage({type: 'ready', version: 1, sample: cardLabel(51)});
        return;
    }
    if (message.type === 'bench') {
        // A dynamic import inside the worker: the evaluator loads as its own chunk.
        void import("@/lib/poker/evaluator").then(({evaluateMasks}) => {
            const started = performance.now();
            let sink = 0;
            const n = 2_000_000;
            for (let i = 0; i < n; i++) sink ^= evaluateMasks(i & 0x1fff, (i >> 3) & 0x1fff, (i >> 6) & 0x1fff, (i >> 9) & 0x1fff);
            const seconds = (performance.now() - started) / 1000;
            scope.postMessage({type: 'bench', evaluationsPerSecond: Math.round(n / seconds), sink});
        });
    }
});
