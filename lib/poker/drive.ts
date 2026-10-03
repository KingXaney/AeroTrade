// Runs a job's generator in slices of about `sliceMs`, handing control back to the event loop between
// slices, so a stop or a newer job is heard within a slice, and reporting progress at most every
// `progressMs`. The worker drives with long slices; the page thread with short ones, so the page
// stays responsive. The clock and the pause are passed in, which keeps it testable. Pure.

export type DriveOptions<P> = {
    sliceMs: number;
    progressMs: number;
    onProgress: (progress: P) => void;
    now: () => number;
    pause: () => Promise<void>;
};

export type DriveOutcome<P, R> = {status: 'done'; result: R} | {status: 'stopped'; progress: P | null};

export type Driven<P, R> = {promise: Promise<DriveOutcome<P, R>>; stop: () => void};

export const drive = <P, R>(job: Generator<P, R>, options: DriveOptions<P>): Driven<P, R> => {
    let stopped = false;
    const promise = (async (): Promise<DriveOutcome<P, R>> => {
        let last: P | null = null;
        let reported = -Infinity;
        for (;;) {
            // The pause comes first, so drive() returns before any work and a stop is heard at once.
            await options.pause();
            if (stopped) {
                job.return(undefined as never);
                return {status: 'stopped', progress: last};
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
