// Runs a job's generator in slices of about `sliceMs`, handing control back to the event loop between
// slices, so a stop or a newer job is heard within a slice, and reporting progress at most every
// `progressMs`. The worker drives with long slices; the page thread with short ones, so the page
// stays responsive. The clock and the pause are passed in, which keeps it testable. Pure.
//
// A stop ends a job one of two ways: dropped where it stands, or — with `finishOnStop`, for a job
// whose partial work is a result (the river solver's average strategy) — told 'stop' through its
// next() so it can finish and return what it has.

export type DriveOptions<P> = {
    sliceMs: number;
    progressMs: number;
    onProgress: (progress: P) => void;
    now: () => number;
    pause: () => Promise<void>;
    finishOnStop?: boolean;
};

export type DriveOutcome<P, R> = {status: 'done'; result: R} | {status: 'stopped'; progress: P | null; result: R | null};

export type Driven<P, R> = {promise: Promise<DriveOutcome<P, R>>; stop: () => void};

export const STOP = 'stop';

export const drive = <P, R>(job: Generator<P, R, unknown>, options: DriveOptions<P>): Driven<P, R> => {
    let stopped = false;
    const promise = (async (): Promise<DriveOutcome<P, R>> => {
        let last: P | null = null;
        let reported = -Infinity;
        for (;;) {
            // The pause comes first, so drive() returns before any work and a stop is heard at once.
            await options.pause();
            if (stopped) {
                if (!options.finishOnStop) {
                    job.return(undefined as never);
                    return {status: 'stopped', progress: last, result: null};
                }
                let step = job.next(STOP);
                while (!step.done) step = job.next(STOP);
                return {status: 'stopped', progress: last, result: step.value};
            }
            const until = options.now() + options.sliceMs;
            do {
                const step = job.next();
                if (step.done) return {status: 'done', result: step.value};
                last = step.value;
            } while (options.now() < until);
            if (options.now() - reported >= options.progressMs) {
                reported = options.now();
                options.onProgress(last);
            }
        }
    })();
    return {promise, stop: () => { stopped = true; }};
};
