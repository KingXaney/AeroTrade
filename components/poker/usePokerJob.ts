'use client';

import {useCallback, useEffect, useRef, useState} from "react";
import type {PokerProgress, PokerRequest, PokerResult} from "@/lib/poker/jobs";
import {getEngine, type EngineChoice, type EngineKind, type RunningJob} from "@/components/poker/engine";
import {readSession, writeSession} from "@/components/poker/session-store";

// A tab's job as the page shows it. `result` is the latest finished result, kept while a newer run
// works or after one stops, so a chart never blanks out; `status` says whether it is current.
export type JobState = {
    status: 'idle' | 'running' | 'done' | 'stopped' | 'failed';
    progress: PokerProgress | null;
    result: PokerResult | null;
    message: string | null;
};

const IDLE: JobState = {status: 'idle', progress: null, result: null, message: null};

// One tab's job: run starts it (stopping the one before), stop ends it, and the state — kept in the
// session store under `key`, so a tab shows its last result again after a switch — follows it.
export const usePokerJob = (key: string, choice: EngineChoice) => {
    const [state, setState] = useState<JobState>(() => readSession<JobState>(key) ?? IDLE);
    const [engine, setEngine] = useState<EngineKind | 'starting'>('starting');
    const current = useRef<RunningJob | null>(null);
    // Counts runs, so a run still waiting for the engine knows a newer one has started.
    const generation = useRef(0);

    const commit = useCallback((update: (previous: JobState) => JobState) => {
        setState((previous) => {
            const next = update(previous);
            writeSession(key, next);
            return next;
        });
    }, [key]);

    useEffect(() => {
        let live = true;
        void getEngine(choice).then((ready) => {
            if (live) setEngine(ready.kind);
        });
        return () => {
            live = false;
            // Leaving the tab stops its job; coming back shows where it stopped.
            if (current.current) {
                current.current.stop();
                current.current = null;
                const saved = readSession<JobState>(key);
                if (saved?.status === 'running') writeSession<JobState>(key, {...saved, status: 'stopped'});
            }
        };
    }, [choice, key]);

    const run = useCallback(async (request: PokerRequest) => {
        const mine = ++generation.current;
        current.current?.stop();
        current.current = null;
        const ready = await getEngine(choice);
        if (mine !== generation.current) return;
        const token: {job: RunningJob | null} = {job: null};
        commit((previous) => ({status: 'running', progress: null, result: previous.result, message: null}));
        const job = ready.run(request, (progress) => {
            if (current.current === token.job) commit((previous) => ({...previous, progress}));
        });
        token.job = job;
        current.current = job;
        try {
            const outcome = await job.promise;
            if (current.current !== job) return;
            // A stopped job that finishes on stop (the river solver) brings its own result.
            commit((previous) => (outcome.status === 'done'
                ? {status: 'done', progress: null, result: outcome.result, message: null}
                : {...previous, status: 'stopped', progress: outcome.progress, result: outcome.result ?? previous.result}));
        } catch (error) {
            if (current.current === job) commit((previous) => ({...previous, status: 'failed', message: error instanceof Error ? error.message : String(error)}));
        } finally {
            if (current.current === job) current.current = null;
        }
    }, [choice, commit]);

    const stop = useCallback(() => {
        generation.current++;
        current.current?.stop();
    }, []);

    return {state, run, stop, engine};
};
