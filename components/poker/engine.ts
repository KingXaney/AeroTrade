// The poker engine the page talks to: the Web Worker when it starts and says hello in time, else the
// page thread running the same jobs in short slices. One per page load and choice (a module
// singleton), so React's double effects never start two workers. `?engine=main` forces the page
// thread, for QA.
//
// A stop the worker does not answer within a second ends the worker; the next job starts a new one.

import {drive, type DriveOutcome} from "@/lib/poker/drive";
import {needsTable, pokerJob, type PokerProgress, type PokerRequest, type PokerResult} from "@/lib/poker/jobs";
import {ENGINE_PROTOCOL, type FromEngine, type ToEngine} from "@/lib/poker/protocol";
import {loadPreflopTable, yieldToLoop} from "@/components/poker/preflop-table";

export type EngineKind = 'worker' | 'main';
export type EngineChoice = 'auto' | 'main';
export type JobOutcome = DriveOutcome<PokerProgress, PokerResult>;
export type RunningJob = {promise: Promise<JobOutcome>; stop: () => void};

export type Engine = {
    kind: EngineKind;
    run: (request: PokerRequest, onProgress: (progress: PokerProgress) => void) => RunningJob;
};

const READY_WITHIN_MS = 4000;
const STOP_WITHIN_MS = 1000;

const mainEngine = (): Engine => ({
    kind: 'main',
    run: (request, onProgress) => {
        let stopped = false;
        let stopDriven: (() => void) | null = null;
        const promise = (async (): Promise<JobOutcome> => {
            const table = needsTable(request) ? await loadPreflopTable() : null;
            if (stopped) return {status: 'stopped', progress: null};
            const run = drive(pokerJob(request, table), {
                sliceMs: 12,
                progressMs: 100,
                onProgress,
                now: () => performance.now(),
                pause: yieldToLoop,
            });
            stopDriven = run.stop;
            return run.promise;
        })();
        return {
            promise,
            stop: () => {
                stopped = true;
                stopDriven?.();
            },
        };
    },
});

type Pending = {
    onProgress: (progress: PokerProgress) => void;
    resolve: (outcome: JobOutcome) => void;
    reject: (error: Error) => void;
    last: PokerProgress | null;
};

// Starts a worker and waits for its hello; null when it cannot be built or does not answer in time.
const startWorker = async (): Promise<Worker | null> => {
    try {
        const {createEngineWorker} = await import("@/components/poker/engine-worker-host");
        const worker = createEngineWorker();
        const ready = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), READY_WITHIN_MS);
            worker.addEventListener('message', function onReady(event: MessageEvent<FromEngine>) {
                if (event.data.type !== 'ready') return;
                clearTimeout(timer);
                worker.removeEventListener('message', onReady);
                resolve(event.data.protocol === ENGINE_PROTOCOL);
            });
            worker.addEventListener('error', () => {
                clearTimeout(timer);
                resolve(false);
            });
            const hello: ToEngine = {type: 'hello'};
            worker.postMessage(hello);
        });
        if (!ready) {
            worker.terminate();
            return null;
        }
        return worker;
    } catch {
        return null;
    }
};

const workerEngine = (first: Worker): Engine => {
    let worker: Worker | null = first;
    let nextId = 0;
    const pending = new Map<number, Pending>();

    const listen = (target: Worker) => {
        target.addEventListener('message', (event: MessageEvent<FromEngine>) => {
            const message = event.data;
            if (message.type === 'ready') return;
            const job = pending.get(message.id);
            if (!job) return;
            if (message.type === 'progress') {
                job.last = message.progress;
                job.onProgress(message.progress);
                return;
            }
            pending.delete(message.id);
            if (message.type === 'done') job.resolve({status: 'done', result: message.result});
            else if (message.type === 'stopped') job.resolve({status: 'stopped', progress: message.progress ?? job.last});
            else job.reject(new Error(message.message));
        });
        // A worker that crashes fails what it held; the next job starts a new one.
        target.addEventListener('error', () => {
            if (worker !== target) return;
            target.terminate();
            worker = null;
            for (const [id, job] of pending) {
                pending.delete(id);
                job.reject(new Error('The solver stopped unexpectedly.'));
            }
        });
    };
    listen(first);

    // Ends an unresponsive worker: every job it held ends stopped, with its last progress.
    const retire = () => {
        worker?.terminate();
        worker = null;
        for (const [id, job] of pending) {
            pending.delete(id);
            job.resolve({status: 'stopped', progress: job.last});
        }
    };

    const ensureWorker = async (): Promise<Worker | null> => {
        if (worker) return worker;
        const fresh = await startWorker();
        if (fresh) {
            listen(fresh);
            worker = fresh;
        }
        return worker;
    };

    return {
        kind: 'worker',
        run: (request, onProgress) => {
            const id = ++nextId;
            let stopRequested = false;
            const promise = new Promise<JobOutcome>((resolve, reject) => {
                pending.set(id, {onProgress, resolve, reject, last: null});
                void ensureWorker().then((target) => {
                    if (!target) {
                        pending.delete(id);
                        reject(new Error('The solver could not start.'));
                        return;
                    }
                    if (stopRequested) {
                        pending.delete(id);
                        resolve({status: 'stopped', progress: null});
                        return;
                    }
                    const start: ToEngine = {type: 'start', id, request};
                    target.postMessage(start);
                });
            });
            return {
                promise,
                stop: () => {
                    stopRequested = true;
                    if (!pending.has(id) || !worker) return;
                    const stop: ToEngine = {type: 'stop', id};
                    worker.postMessage(stop);
                    setTimeout(() => {
                        if (pending.has(id)) retire();
                    }, STOP_WITHIN_MS);
                },
            };
        },
    };
};

const engines = new Map<EngineChoice, Promise<Engine>>();

export const getEngine = (choice: EngineChoice): Promise<Engine> => {
    let engine = engines.get(choice);
    if (!engine) {
        engine = choice === 'main' || typeof Worker === 'undefined'
            ? Promise.resolve(mainEngine())
            : startWorker().then((worker) => (worker ? workerEngine(worker) : mainEngine()));
        engines.set(choice, engine);
    }
    return engine;
};
