// Pure target construction + order diffing for the AI Navigator. Deliberately
// PURE — no DB, no fetch — so vitest can cover the trading rails without a
// database. Every threshold comes from the navigator config; nothing here is
// tunable at call sites, so the LLM can never widen its own rails.

import {
    ENTRY_SCORE_THRESHOLD,
    EXIT_SCORE_THRESHOLD,
    HARD_STOP_DRAWDOWN,
    MAX_POSITIONS,
    MAX_POSITION_WEIGHT,
    MAX_TRADES_PER_WEEK,
    MIN_CASH_WEIGHT,
    MIN_HOLDING_TRADING_DAYS,
    REBALANCE_BAND,
} from "@/lib/navigator/config";
import type {ScoredSymbol} from "@/lib/navigator/scoring";

export type TargetWeight = {symbol: string; weight: number; score: number; reasons: string[]};

const PERCENT = 100;

// Eligible symbols above the entry threshold, best-first, capped at
// MAX_POSITIONS. Weights are proportional to score, per-position clamped, then
// rescaled (only downward) so the book never eats into the minimum cash buffer.
export const buildTargets = (scored: ScoredSymbol[]): TargetWeight[] => {
    const picks = scored
        .filter((item) => item.eligible && item.score > ENTRY_SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_POSITIONS);
    const totalScore = picks.reduce((sum, pick) => sum + pick.score, 0);
    if (totalScore <= 0) {
        return [];
    }
    const investable = 1 - MIN_CASH_WEIGHT;
    const clampedWeights = picks.map((pick) => Math.min(pick.score / totalScore, MAX_POSITION_WEIGHT));
    const clampedSum = clampedWeights.reduce((sum, weight) => sum + weight, 0);
    // Scaling only shrinks weights, so the per-position clamp still holds after it.
    const scale = clampedSum > investable ? investable / clampedSum : 1;
    return picks.map((pick, index) => ({
        symbol: pick.symbol,
        weight: clampedWeights[index] * scale,
        score: pick.score,
        reasons: pick.reasons,
    }));
};

export type HeldPosition = {
    symbol: string;
    quantity: number;
    avgCost: number;
    price: number | null;
    heldTradingDays: number | null;
    thesisBroken: boolean;
    score: number | null;
};

export type PlannedOrder = {symbol: string; side: 'buy' | 'sell'; quantity: number; reason: string};

type OrderCandidate = {
    symbol: string;
    side: 'buy' | 'sell';
    // Signed dollar drift; its magnitude drives priority under the trade cap.
    driftValue: number;
    price: number;
    // Set only for trigger exits: sell the whole position, not the drift amount.
    fullExitQuantity: number | null;
    // Cap for trim sells — never sell more than is actually held.
    maxSellQuantity: number | null;
    reason: string;
};

// Checked in declaration order so multi-trigger positions get a stable reason.
const exitTriggerReason = (position: HeldPosition): string | null => {
    if (position.score !== null && position.score < EXIT_SCORE_THRESHOLD) {
        return `exit: score ${position.score.toFixed(2)} below exit threshold ${EXIT_SCORE_THRESHOLD}`;
    }
    if (position.thesisBroken) {
        return 'exit: thesis broken';
    }
    if (position.price !== null && position.avgCost > 0
        && position.price / position.avgCost - 1 < -HARD_STOP_DRAWDOWN) {
        const drawdownPct = Math.round((position.price / position.avgCost - 1) * PERCENT);
        return `exit: hard stop ${drawdownPct}% vs cost`;
    }
    return null;
};

// Unknown holding age (null) is treated as satisfying the minimum hold.
const underMinHold = (position: HeldPosition): boolean =>
    position.heldTradingDays !== null && position.heldTradingDays < MIN_HOLDING_TRADING_DAYS;

// Weights like 0.14 are inexact in binary, so a drift meant to be 12_000 can
// arrive as 11_999.999999999996 and floor away a whole share. The epsilon
// absorbs that representation noise without ever adding a real share.
const SHARE_FLOOR_EPSILON = 1e-9;

const floorShares = (value: number): number => Math.floor(value + SHARE_FLOOR_EPSILON);

const rebalanceReason = (driftValue: number, totalValue: number, targetWeight: number): string => {
    const driftPct = (driftValue / totalValue) * PERCENT;
    const sign = driftPct >= 0 ? '+' : '';
    return `rebalance ${sign}${driftPct.toFixed(1)}% drift toward ${(targetWeight * PERCENT).toFixed(1)}% target`;
};

// Diff current holdings against targets and emit at most MAX_TRADES_PER_WEEK
// orders. Sells run before buys so exits and trims fund the entries in the
// same batch; a simulated cash walk trims buys against the cash floor.
export const diffToOrders = (input: {
    totalValue: number;
    cash: number;
    positions: HeldPosition[];
    targets: TargetWeight[];
}): PlannedOrder[] => {
    const {totalValue, positions, targets} = input;
    if (totalValue <= 0) {
        return [];
    }

    const bandValue = REBALANCE_BAND * totalValue;
    const targetBySymbol = new Map(targets.map((target) => [target.symbol, target]));
    // Any position row can price a symbol — integration passes quantity-0 rows
    // as quote carriers for not-yet-held targets.
    const priceBySymbol = new Map<string, number>();
    for (const position of positions) {
        if (position.price !== null) {
            priceBySymbol.set(position.symbol, position.price);
        }
    }

    const candidates: OrderCandidate[] = [];
    const heldSymbols = new Set<string>();

    for (const position of positions) {
        if (position.quantity <= 0) {
            continue; // quote-only row, nothing held
        }
        heldSymbols.add(position.symbol);
        if (position.price === null) {
            continue; // no live quote: skip the symbol entirely
        }
        const price = position.price;
        const currentValue = position.quantity * price;
        const trigger = exitTriggerReason(position);

        if (trigger !== null) {
            // Triggers override both targeting and the minimum holding period.
            candidates.push({
                symbol: position.symbol,
                side: 'sell',
                driftValue: -currentValue,
                price,
                fullExitQuantity: position.quantity,
                maxSellQuantity: position.quantity,
                reason: trigger,
            });
            continue;
        }

        const target = targetBySymbol.get(position.symbol);
        if (target === undefined) {
            continue; // hysteresis: healthy untargeted holdings stay put
        }

        const driftValue = target.weight * totalValue - currentValue;
        if (Math.abs(driftValue) < bandValue) {
            continue; // churn control
        }
        if (driftValue < 0 && underMinHold(position)) {
            continue; // trimming is not an exit trigger — min hold blocks it
        }
        candidates.push({
            symbol: position.symbol,
            side: driftValue < 0 ? 'sell' : 'buy',
            driftValue,
            price,
            fullExitQuantity: null,
            maxSellQuantity: driftValue < 0 ? position.quantity : null,
            reason: rebalanceReason(driftValue, totalValue, target.weight),
        });
    }

    for (const target of targets) {
        if (heldSymbols.has(target.symbol)) {
            continue; // handled above (or skipped entirely for a null quote)
        }
        const price = priceBySymbol.get(target.symbol);
        if (price === undefined) {
            continue; // unpriced target: skip with no order
        }
        const driftValue = target.weight * totalValue;
        if (driftValue < bandValue) {
            continue;
        }
        candidates.push({
            symbol: target.symbol,
            side: 'buy',
            driftValue,
            price,
            fullExitQuantity: null,
            maxSellQuantity: null,
            reason: `enter: score ${target.score.toFixed(2)}`,
        });
    }

    candidates.sort((a, b) => {
        if (a.side !== b.side) {
            return a.side === 'sell' ? -1 : 1;
        }
        return Math.abs(b.driftValue) - Math.abs(a.driftValue);
    });

    const orders: PlannedOrder[] = [];
    const cashFloor = MIN_CASH_WEIGHT * totalValue;
    let cash = input.cash;

    for (const candidate of candidates) {
        if (orders.length >= MAX_TRADES_PER_WEEK) {
            break;
        }
        if (candidate.side === 'sell') {
            const desired = candidate.fullExitQuantity
                ?? floorShares(Math.abs(candidate.driftValue) / candidate.price);
            const quantity = candidate.maxSellQuantity !== null
                ? Math.min(desired, candidate.maxSellQuantity)
                : desired;
            if (quantity < 1) {
                continue; // sub-share sell: dropped, consumes no trade slot
            }
            cash += quantity * candidate.price;
            orders.push({symbol: candidate.symbol, side: 'sell', quantity, reason: candidate.reason});
        } else {
            const desired = floorShares(Math.abs(candidate.driftValue) / candidate.price);
            const affordable = floorShares((cash - cashFloor) / candidate.price);
            const quantity = Math.min(desired, Math.max(affordable, 0));
            if (quantity < 1) {
                continue; // trimmed-to-zero (or sub-share) buy frees the slot
            }
            cash -= quantity * candidate.price;
            orders.push({symbol: candidate.symbol, side: 'buy', quantity, reason: candidate.reason});
        }
    }

    return orders;
};
