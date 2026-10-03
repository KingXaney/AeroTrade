// The solver's jobs as one request type and one generator, which the Web Worker and the page-thread
// engine both run: an equity calculation, a push/fold solve or a river solve. Pure.

import {equityJob, type EquityInput, type EquityProgress, type EquityResult} from "@/lib/poker/equity";
import {pushFoldJob, type PushFoldInput, type PushFoldProgress, type PushFoldResult} from "@/lib/poker/pushfold";
import {riverJob, type RiverInput, type RiverProgress, type RiverResult} from "@/lib/poker/river/solver";
import type {PreflopTable} from "@/lib/poker/preflop";

export type PokerRequest =
    | {kind: 'equity'; input: EquityInput}
    | {kind: 'push-fold'; input: PushFoldInput}
    | {kind: 'river'; input: RiverInput};

export type PokerProgress =
    | {kind: 'equity'; progress: EquityProgress}
    | {kind: 'push-fold'; progress: PushFoldProgress}
    | {kind: 'river'; progress: RiverProgress};

export type PokerResult =
    | {kind: 'equity'; result: EquityResult}
    | {kind: 'push-fold'; result: PushFoldResult}
    | {kind: 'river'; result: RiverResult};

// Whether a job reads the preflop table: a push/fold solve always, equity only before the flop with
// no dead cards, where the table can answer, and the river never.
export const needsTable = (request: PokerRequest): boolean =>
    request.kind === 'push-fold' || (request.kind === 'equity' && request.input.board.length === 0 && request.input.dead.length === 0);

// Whether a stopped job still has a result to give: the river solver's average strategy so far.
export const finishesOnStop = (request: PokerRequest): boolean => request.kind === 'river';

// Wraps one job's progress and result, passing what the driver sends (a stop) through to it.
function* forward<P, R>(job: Generator<P, R, unknown>, progress: (p: P) => PokerProgress, result: (r: R) => PokerResult): Generator<PokerProgress, PokerResult, unknown> {
    let command: unknown = undefined;
    for (;;) {
        const step = job.next(command);
        if (step.done) return result(step.value);
        command = yield progress(step.value);
    }
}

export function* pokerJob(request: PokerRequest, table: PreflopTable | null): Generator<PokerProgress, PokerResult, unknown> {
    if (request.kind === 'equity') {
        return yield* forward(equityJob(request.input, table), (p) => ({kind: 'equity', progress: p}), (r) => ({kind: 'equity', result: r}));
    }
    if (request.kind === 'river') {
        return yield* forward(riverJob(request.input), (p) => ({kind: 'river', progress: p}), (r) => ({kind: 'river', result: r}));
    }
    if (table === null) throw new Error('push/fold: the preflop table is not loaded');
    return yield* forward(pushFoldJob(request.input, table), (p) => ({kind: 'push-fold', progress: p}), (r) => ({kind: 'push-fold', result: r}));
}
