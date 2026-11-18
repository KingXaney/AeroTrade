// What a run of the daily snapshot job did, and the small decisions it makes. Pure.

import {easternParts} from "@/lib/prices/market-hours";
import {looksLikeSplit, splitLabel, type SplitApplication} from "@/lib/trading/splits";

// The job has two crons, 16:10 and 16:40 ET. A run from 16:30 on is the late pass: it writes
// only the accounts still without a close for the day, so it asks Finnhub only about those.
const LATE_PASS_FROM_MINUTES = 16 * 60 + 30;
export const isLatePass = (ts: unknown): boolean =>
    typeof ts === 'number' && easternParts(new Date(ts)).minutes >= LATE_PASS_FROM_MINUTES;

// A quote far from the symbol's last stored close is looked at again before anything is valued:
// it is what a split looks like to a position not adjusted for it (lib/trading/splits.looksLikeSplit).
export const splitSuspects = (
    prices: ReadonlyMap<string, {price?: number}>,
    closes: ReadonlyMap<string, {close: number}>,
): string[] => {
    const suspects: string[] = [];
    for (const [symbol, info] of prices) {
        if (typeof info.price === 'number' && looksLikeSplit(info.price, closes.get(symbol)?.close)) suspects.push(symbol);
    }
    return suspects.sort();
};

export type SnapshotSkip = {accountId: string; symbols: string[]};

export type SnapshotWrite = {
    written: number;
    // Accounts written with a gone holding valued at its last stored close, and which symbols.
    atClose: SnapshotSkip[];
    // Accounts NOT written: a holding had no quote and is not gone (an outage), or the account
    // changed mid-run — reset, deleted, or a split applied to it (no symbols).
    skipped: SnapshotSkip[];
};

export type SnapshotRun = SnapshotWrite & {
    accounts: number;
    late: boolean;
    benchmark: {symbol: string; state: 'recorded' | 'kept' | 'missing'};
    splits: readonly SplitApplication[];
};

const symbolsOf = (items: readonly SnapshotSkip[], limit = 4): string => {
    const symbols = [...new Set(items.flatMap((item) => item.symbols))].sort();
    return `${symbols.slice(0, limit).join(', ')}${symbols.length > limit ? ` +${symbols.length - limit} more` : ''}`;
};

// The job's stamp: how many of the accounts it looked at were written, then everything that
// was not as it should be, named. A run that wrote nothing never reads as a healthy one.
export const describeSnapshotRun = ({accounts, written, atClose, skipped, late, benchmark, splits}: SnapshotRun): string => {
    if (late && accounts === 0 && benchmark.state !== 'missing') return 'Late pass: every account already has today\'s close';
    const parts = [`${late ? 'Late pass: ' : ''}${written} of ${accounts} account(s) snapshotted`];
    const unquoted = skipped.filter((item) => item.symbols.length > 0);
    if (unquoted.length > 0) parts.push(`${unquoted.length} skipped, no quote for ${symbolsOf(unquoted)}`);
    const changed = skipped.length - unquoted.length;
    if (changed > 0) parts.push(`${changed} skipped, changed mid-run`);
    if (atClose.length > 0) parts.push(`${atClose.length} valued a holding at its last stored close (${symbolsOf(atClose)})`);
    for (const key of new Set(splits.map((split) => `${split.symbol} ${splitLabel(split)}`))) parts.push(`${key} split applied before valuing`);
    parts.push(`${benchmark.symbol} ${benchmark.state === 'missing' ? 'not recorded' : benchmark.state === 'kept' ? 'already recorded' : 'recorded'}`);
    return parts.join('; ');
};
