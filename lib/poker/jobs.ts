// The solver's jobs as one request type and one generator, which the Web Worker and the page-thread
// engine both run: an equity calculation or a push/fold solve. Pure.

import {equityJob, type EquityInput, type EquityProgress, type EquityResult} from "@/lib/poker/equity";
import {pushFoldJob, type PushFoldInput, type PushFoldProgress, type PushFoldResult} from "@/lib/poker/pushfold";
import type {PreflopTable} from "@/lib/poker/preflop";

export type PokerRequest = {kind: 'equity'; input: EquityInput} | {kind: 'push-fold'; input: PushFoldInput};

export type PokerProgress = {kind: 'equity'; progress: EquityProgress} | {kind: 'push-fold'; progress: PushFoldProgress};

export type PokerResult = {kind: 'equity'; result: EquityResult} | {kind: 'push-fold'; result: PushFoldResult};

// Whether a job reads the preflop table: a push/fold solve always, equity only before the flop with
// no dead cards, where the table can answer.
export const needsTable = (request: PokerRequest): boolean =>
    request.kind === 'push-fold' || (request.input.board.length === 0 && request.input.dead.length === 0);

export function* pokerJob(request: PokerRequest, table: PreflopTable | null): Generator<PokerProgress, PokerResult> {
    if (request.kind === 'equity') {
        const job = equityJob(request.input, table);
        for (let step = job.next(); ; step = job.next()) {
            if (step.done) return {kind: 'equity', result: step.value};
            yield {kind: 'equity', progress: step.value};
        }
    }
    if (table === null) throw new Error('push/fold: the preflop table is not loaded');
    const job = pushFoldJob(request.input, table);
    for (let step = job.next(); ; step = job.next()) {
        if (step.done) return {kind: 'push-fold', result: step.value};
        yield {kind: 'push-fold', progress: step.value};
    }
}
