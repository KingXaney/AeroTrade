// Stock splits. Pure.
//
// The books are kept in TODAY'S shares. A split changes how many shares a dollar of a company
// is, not what an account is worth, so no dollar an account paid or earned moves: a fill from
// before a split is read as more (or fewer) shares at a proportionally lower (or higher) price,
// its total and its realised P&L as they were. That is the basis the price history and the
// per-share dividends are already in — Yahoo restates both on the day of a split.
//
// A split is detected once per symbol (database/models/stock-split.model.ts) and applied once per
// account (lib/trading/splits-store.ts), which stores it on the account beside the position it
// changed. An account's own list is what its ledger is read with, so the stored holding and the
// restated ledger never disagree.

import {easternToInstant, previousTradingDay, sessionCloseOf} from "@/lib/prices/market-hours";
import {applyFill, SHARE_EPSILON, type SimAccount} from "@/lib/trading/fill";

// `numerator` new shares for every `denominator` old ones: 10 and 1 for a 10-for-1.
export type SplitRatio = {numerator: number; denominator: number};

// A split as detected: `at` is the instant it took effect, `prevClose` the close of the session
// before it IN THE NEW BASIS (read from the same payload that carried the event).
export type StockSplitEvent = SplitRatio & {symbol: string; exDate: string; at: number; prevClose?: number};

// A split as one account applied it: fills before `before` are in old shares. `appliedAt` is
// when the account took it (absent on a split built in memory, before it is stored).
export type AppliedSplit = SplitRatio & {symbol: string; exDate: string; before: number; appliedAt?: number};

// The first moment of trading in new shares: the ex-date's 09:30 ET open.
export const splitInstant = (exDate: string): number => easternToInstant(exDate, 9, 30);

export const isSplit = ({numerator, denominator}: SplitRatio): boolean =>
    Number.isFinite(numerator) && Number.isFinite(denominator) && numerator > 0 && denominator > 0 && numerator !== denominator;

export const splitKey = ({symbol, exDate}: {symbol: string; exDate: string}): string => `${symbol.toUpperCase()}|${exDate}`;

// What a fill of `symbol` made at `at` is multiplied by to read in today's shares: every split
// of that symbol whose cut it is before, compounded. Null when none applies.
export const factorAt = (splits: readonly AppliedSplit[], symbol: string, at: number): SplitRatio | null => {
    const upper = symbol.toUpperCase();
    let numerator = 1;
    let denominator = 1;
    let any = false;
    for (const split of splits) {
        if (split.symbol.toUpperCase() !== upper || at >= split.before) continue;
        numerator *= split.numerator;
        denominator *= split.denominator;
        any = true;
    }
    return any ? {numerator, denominator} : null;
};

// A stored split (PaperAccount.splits) as the pure functions read it.
export const toAppliedSplits = (
    stored: readonly {symbol: string; exDate: string; numerator: number; denominator: number; before: Date | string | number; appliedAt?: Date | string | number}[] | null | undefined,
): AppliedSplit[] => (stored ?? []).map((split) => ({
    symbol: split.symbol,
    exDate: split.exDate,
    numerator: split.numerator,
    denominator: split.denominator,
    before: new Date(split.before).getTime(),
    ...(split.appliedAt !== undefined ? {appliedAt: new Date(split.appliedAt).getTime()} : {}),
}));

// A trade record (createdAt in epoch ms) or a lean trade row (a Date).
type RestatableFill = {symbol: string; quantity: number; price: number; createdAt: number | Date};

// A fill in today's shares. The same object when no split applies, so a ledger with no split
// in it costs nothing and nothing downstream sees a new row. Multiplied before divided, so a
// 3-for-2 of 5 shares is exactly 7.5.
export const restateFill = <T extends RestatableFill>(fill: T, splits: readonly AppliedSplit[]): T & {restated?: true} => {
    if (splits.length === 0) return fill;
    const factor = factorAt(splits, fill.symbol, new Date(fill.createdAt).getTime());
    if (factor === null) return fill;
    return {
        ...fill,
        quantity: (fill.quantity * factor.numerator) / factor.denominator,
        price: (fill.price * factor.denominator) / factor.numerator,
        restated: true,
    };
};

// Ratios this near to one cannot be told apart from an ordinary day's move by price.
const TOO_CLOSE_TO_TELL = {low: 0.8, high: 1.25};

// Where one account's cut falls: fills before it are in old shares. Normally the split's own
// instant. A fill between the previous session's close and the ex-date's close is read by its
// price instead, because what a quote says in those hours is the provider's business: nearer
// the previous close in new shares it was already a new-basis fill (a pre-open quote that had
// been restated), nearer that close times the ratio it was still an old one (a stale last
// trade just after the bell). The basis turns over once, so the first new-basis fill is the cut.
export const cutFor = (split: StockSplitEvent, fills: readonly {createdAt: number; price: number}[]): number => {
    const ratio = split.numerator / split.denominator;
    if (split.prevClose === undefined || !(split.prevClose > 0)) return split.at;
    if (ratio > TOO_CLOSE_TO_TELL.low && ratio < TOO_CLOSE_TO_TELL.high) return split.at;

    const from = sessionCloseOf(previousTradingDay(split.exDate));
    const to = sessionCloseOf(split.exDate);
    const near = fills
        .filter((fill) => fill.createdAt >= from && fill.createdAt <= to && fill.price > 0)
        .sort((a, b) => a.createdAt - b.createdAt);
    if (near.length === 0) return split.at;

    const newBasis = split.prevClose;
    const oldBasis = split.prevClose * ratio;
    const inNewShares = (price: number): boolean => Math.abs(Math.log(price / newBasis)) < Math.abs(Math.log(price / oldBasis));
    const firstNew = near.find((fill) => inNewShares(fill.price));
    if (firstNew) return firstNew.createdAt;
    return Math.max(split.at, near[near.length - 1].createdAt + 1);
};

type ReplayFill = {side: 'buy' | 'sell'; quantity: number; price: number; createdAt: number};

// One symbol's holding rebuilt from its fills, through the one fill arithmetic: null when
// nothing is held, undefined when the fills do not add up (a sell with no shares behind it), in
// which case nothing should be concluded from them.
export const positionFromFills = (fills: readonly ReplayFill[]): {quantity: number; avgCost: number} | null | undefined => {
    let account: SimAccount = {cash: Number.POSITIVE_INFINITY, positions: []};
    const ordered = fills.map((fill, index) => ({fill, index})).sort((a, b) => a.fill.createdAt - b.fill.createdAt || a.index - b.index);
    for (const {fill} of ordered) {
        const result = applyFill(account, {symbol: 'X', side: fill.side, quantity: fill.quantity}, fill.price, undefined, {exact: true});
        if (!result.ok) return undefined;
        account = result.account;
    }
    const held = account.positions[0];
    return held ? {quantity: snapShares(held.quantity), avgCost: held.avgCost} : null;
};

// A share count a ratio left a hair off a whole number (23 old shares less 3, one for ten, is
// 1.9999999999999998) is that whole number.
export const snapShares = (quantity: number): number => {
    const whole = Math.round(quantity);
    return Math.abs(quantity - whole) <= SHARE_EPSILON ? whole : quantity;
};

type DividendLike = {symbol: string; exDate?: string | null; quantity?: number | null; perShare?: number | null; createdAt?: Date | string | number};

// A dividend row from before a split, in today's shares: the amount paid is untouched. A row is
// in old shares when it went ex before the split AND was written before the account applied
// it: the income job builds a row from the trades as they read that night, so one written after
// the split was applied (a pay date a few days past the ex-date, a watermark that was waiting)
// is in today's shares already and must not be restated again. A row with no write time, or a
// split with no applied time, goes by the ex-dates alone.
export const restateDividend = <T extends DividendLike>(row: T, splits: readonly AppliedSplit[]): T => {
    if (typeof row.exDate !== 'string' || typeof row.quantity !== 'number' || typeof row.perShare !== 'number') return row;
    const upper = row.symbol.toUpperCase();
    const written = row.createdAt === undefined ? null : new Date(row.createdAt).getTime();
    let numerator = 1;
    let denominator = 1;
    let any = false;
    for (const split of splits) {
        if (split.symbol.toUpperCase() !== upper || row.exDate >= split.exDate) continue;
        if (written !== null && split.appliedAt !== undefined && written >= split.appliedAt) continue;
        numerator *= split.numerator;
        denominator *= split.denominator;
        any = true;
    }
    return any ? {...row, quantity: (row.quantity * numerator) / denominator, perShare: (row.perShare * denominator) / numerator} : row;
};

// ---------------------------------------------------------------------------
// Before a fill: is the holding about to be traded on the wrong basis?
// ---------------------------------------------------------------------------

// A quote this far from the symbol's last stored close is what a split looks like to a holding
// that has not been adjusted for it (the snapshot job's own threshold).
export const SPLIT_SUSPECT_MOVE = 0.15;

export const looksLikeSplit = (price: number, lastClose: number | null | undefined): boolean =>
    typeof lastClose === 'number' && lastClose > 0 && price > 0 && Math.abs(price / lastClose - 1) > SPLIT_SUSPECT_MOVE;

// ---------------------------------------------------------------------------
// What a run of the split job did — its one-line stamp (the system view's strip)
// ---------------------------------------------------------------------------

export const splitLabel = ({numerator, denominator}: SplitRatio): string => `${numerator}-for-${denominator}`;

export type SplitApplication = {accountId: string; symbol: string; exDate: string; numerator: number; denominator: number; lateDays: number};
export type SplitSkip = {accountId: string; symbol: string; reason: string};

export type SplitRun = {
    checked: number;                 // symbols Yahoo answered for
    unanswered: readonly string[];   // symbols it did not: they were not checked, which is not "no split"
    detection: boolean;              // false when detection is switched off (the browser QA)
    applied: readonly SplitApplication[];
    skipped: readonly SplitSkip[];
    // Accounts whose guarded write kept losing to another writer: tried again next run.
    unsettled?: readonly {accountId: string; symbol: string}[];
};

const named = (items: readonly string[], limit = 3): string =>
    `${items.slice(0, limit).join(', ')}${items.length > limit ? ` +${items.length - limit} more` : ''}`;

// What was checked, then what changed; anything that did not go through is named, never dropped.
export const describeSplitRun = ({checked, unanswered, detection, applied, skipped, unsettled = []}: SplitRun): string => {
    const parts: string[] = [];
    if (!detection) parts.push('Detection off');
    else {
        const total = checked + unanswered.length;
        parts.push(`Checked ${total} holding(s)${unanswered.length > 0 ? ` (${unanswered.length} not answered: ${named(unanswered)})` : ''}`);
    }
    if (applied.length === 0) parts.push('no split to apply');
    else {
        const bySplit = new Map<string, SplitApplication[]>();
        for (const item of applied) bySplit.set(splitKey(item), [...(bySplit.get(splitKey(item)) ?? []), item]);
        for (const group of bySplit.values()) {
            const late = Math.max(...group.map((item) => item.lateDays));
            parts.push(`${group[0].symbol} ${splitLabel(group[0])} of ${group[0].exDate} applied to ${group.length} account(s)`
                + (late > 0 ? `, ${late} session(s) late: snapshots in between were valued before it` : ''));
        }
    }
    if (skipped.length > 0) {
        parts.push(`${skipped.length} skipped: ${named(skipped.map((item) => `${item.accountId.slice(-6)} ${item.symbol} (${item.reason})`))}`);
    }
    if (unsettled.length > 0) {
        parts.push(`${unsettled.length} not applied, the account changed mid-write (${named(unsettled.map((item) => `${item.accountId.slice(-6)} ${item.symbol}`))}): tried again next run`);
    }
    return parts.join(' · ');
};
