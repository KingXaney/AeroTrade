// The poker solver's Web Worker: runs the jobs (lib/poker/jobs.ts) off the page's thread, so a long
// equity run or a push/fold solve never freezes the page. A classic worker under Turbopack, so no
// top-level await. It is created only by components/poker/engine-worker-host.ts, beside it in this
// folder, so moving the folder keeps the `new URL('./engine.worker.ts')` valid.
//
// One job at a time, the latest winning: a start stops the job before it. A job runs in 50 ms
// slices, so a stop is heard between them; progress goes out at most every 100 ms.

import {drive} from "@/lib/poker/drive";
import {finishesOnStop, needsTable, pokerJob} from "@/lib/poker/jobs";
import {ENGINE_PROTOCOL, type FromEngine, type ToEngine} from "@/lib/poker/protocol";
import {loadPreflopTable, yieldToLoop} from "@/components/poker/preflop-table";

type Scope = {
    postMessage(message: FromEngine): void;
    addEventListener(type: 'message', listener: (event: MessageEvent<ToEngine>) => void): void;
};
const scope = self as unknown as Scope;

let latest = 0;
let stopCurrent: (() => void) | null = null;

const start = async (id: number, message: Extract<ToEngine, {type: 'start'}>) => {
    try {
        const table = needsTable(message.request) ? await loadPreflopTable() : null;
        // A newer start may have come in while the table loaded.
        if (id !== latest) {
            scope.postMessage({type: 'stopped', id, progress: null, result: null});
            return;
        }
        const run = drive(pokerJob(message.request, table), {
            sliceMs: 50,
            progressMs: 100,
            onProgress: (progress) => scope.postMessage({type: 'progress', id, progress}),
            now: () => performance.now(),
            pause: yieldToLoop,
            finishOnStop: finishesOnStop(message.request),
        });
        stopCurrent = run.stop;
        const outcome = await run.promise;
        scope.postMessage(outcome.status === 'done'
            ? {type: 'done', id, result: outcome.result}
            : {type: 'stopped', id, progress: outcome.progress, result: outcome.result});
    } catch (error) {
        scope.postMessage({type: 'failed', id, message: error instanceof Error ? error.message : String(error)});
    } finally {
        if (id === latest) stopCurrent = null;
    }
};

scope.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'hello') {
        scope.postMessage({type: 'ready', protocol: ENGINE_PROTOCOL});
        return;
    }
    if (message.type === 'stop') {
        if (message.id === latest) stopCurrent?.();
        return;
    }
    stopCurrent?.();
    stopCurrent = null;
    latest = message.id;
    void start(message.id, message);
});
