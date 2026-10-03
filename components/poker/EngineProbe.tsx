'use client';

import {useEffect, useState} from "react";

// The worker spike's probe: starts the worker, asks it to say hello and to time the evaluator, and
// names which engine answered. Replaced by the solver once the spike passes.
const EngineProbe = () => {
    const [engine, setEngine] = useState<'starting' | 'worker' | 'main'>('starting');
    const [rate, setRate] = useState<number | null>(null);
    useEffect(() => {
        let worker: Worker | null = null;
        let settled = false;
        const timeout = window.setTimeout(() => {
            if (!settled) setEngine('main');
        }, 4000);
        void import("@/components/poker/engine-worker-host").then(({createEngineWorker}) => {
            try {
                worker = createEngineWorker();
            } catch {
                setEngine('main');
                return;
            }
            worker.addEventListener('message', (event: MessageEvent) => {
                const data = event.data as {type: string; evaluationsPerSecond?: number};
                if (data.type === 'ready') {
                    settled = true;
                    setEngine('worker');
                    worker?.postMessage({type: 'bench'});
                }
                if (data.type === 'bench') setRate(data.evaluationsPerSecond ?? null);
            });
            worker.addEventListener('error', () => setEngine('main'));
            worker.postMessage({type: 'hello'});
        });
        return () => {
            window.clearTimeout(timeout);
            worker?.terminate();
        };
    }, []);
    return (
        <p className="font-mono text-sm text-fg-soft" data-poker-engine={engine} data-poker-rate={rate ?? undefined}>
            engine: {engine}{rate !== null ? ` · ${rate.toLocaleString('en-US')} evaluations/s` : ''}
        </p>
    );
};

export default EngineProbe;
