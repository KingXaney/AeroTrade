// Long-horizon composite scoring for the AI Navigator. Pure and deterministic:
// the same universe in always yields the same scores and reason strings out, so
// the LLM never picks positions — it only narrates what these numbers already say.

import {
    MIN_ARTICLES_FOR_ELIGIBILITY,
    MIN_DISTINCT_SOURCES,
    MIN_PRICE_BARS,
    MOMENTUM_MIX,
    SCORE_WEIGHTS,
    VOLATILITY_HAIRCUT,
} from "@/lib/navigator/config";
import type {Signals} from "@/lib/prices/signals";

export type ScoringInput = {
    symbol: string;
    newsWeightSlow: number;
    sentimentSlow: number;
    signals: Signals;
    sectorTilt: number;
    hasActiveThesis: boolean;
    thesisLabel?: string;
    articleCount: number;
    sourceCount: number;
    barsCount: number;
    alwaysEligible: boolean;
};

export type ScoredSymbol = {symbol: string; score: number; eligible: boolean; reasons: string[]};

type MomentumHorizon = keyof typeof MOMENTUM_MIX;

type MomentumResult = {component: number; reason: string};

// Fraction of the universe (by 63d vol) that takes the volatility haircut.
const TOP_QUINTILE_FRACTION = 0.2;

// Reason strings show one decimal — enough to be readable, stable across runs.
const REASON_DECIMALS = 1;
const PERCENT_SCALE = 100;

const HORIZON_LABELS: Record<MomentumHorizon, string> = {
    r63: "3-month momentum",
    r126: "6-month momentum",
    r252: "12-month momentum",
};

// The momentum reason quotes the heaviest-weighted horizon the symbol actually has,
// so the narrative tracks whatever drives most of the component.
const REASON_HORIZON_ORDER: MomentumHorizon[] = (Object.keys(MOMENTUM_MIX) as MomentumHorizon[])
    .sort((a, b) => MOMENTUM_MIX[b] - MOMENTUM_MIX[a]);

const INSUFFICIENT_MOMENTUM_REASON = "insufficient price history for momentum";

export const rankNormalize = (values: number[]): number[] => {
    const count = values.length;
    if (count === 0) {
        return [];
    }
    if (count === 1) {
        return [0];
    }

    const ordered = values
        .map((value, index) => ({value, index}))
        .sort((a, b) => a.value - b.value);

    const ranks = new Array<number>(count);
    let position = 0;
    while (position < count) {
        let end = position;
        while (end + 1 < count && ordered[end + 1].value === ordered[position].value) {
            end += 1;
        }
        // Ties share the average of the rank positions they span.
        const sharedRank = (position + end) / 2;
        for (let cursor = position; cursor <= end; cursor += 1) {
            ranks[ordered[cursor].index] = sharedRank;
        }
        position = end + 1;
    }

    return ranks.map((rank) => -1 + (2 * rank) / (count - 1));
};

const formatSignedPercent = (value: number): string => {
    const scaled = value * PERCENT_SCALE;
    const formatted = scaled.toFixed(REASON_DECIMALS);
    return scaled < 0 ? `${formatted}%` : `+${formatted}%`;
};

const newsReason = (input: ScoringInput, universe: ScoringInput[]): string => {
    // Ties share the same displayed rank (count of strictly higher weights + 1).
    const rank = universe.filter((other) => other.newsWeightSlow > input.newsWeightSlow).length + 1;
    return `slow news weight ${input.newsWeightSlow.toFixed(REASON_DECIMALS)} (rank ${rank}/${universe.length})`;
};

const computeMomentumByIndex = (inputs: ScoringInput[]): MomentumResult[] => {
    const horizons = Object.keys(MOMENTUM_MIX) as MomentumHorizon[];

    // Each horizon is rank-normalized over the symbols that actually have it, so
    // a sparse universe never drags present values toward an artificial middle.
    const normalizedByHorizon = new Map<MomentumHorizon, Map<number, number>>();
    for (const horizon of horizons) {
        const present: {index: number; value: number}[] = [];
        inputs.forEach((input, index) => {
            const value = input.signals[horizon];
            if (value !== null) {
                present.push({index, value});
            }
        });
        const normalized = rankNormalize(present.map((entry) => entry.value));
        const byIndex = new Map<number, number>();
        present.forEach((entry, positionInPresent) => byIndex.set(entry.index, normalized[positionInPresent]));
        normalizedByHorizon.set(horizon, byIndex);
    }

    return inputs.map((input, index) => {
        let mixWeight = 0;
        let weighted = 0;
        for (const horizon of horizons) {
            const normalized = normalizedByHorizon.get(horizon)?.get(index);
            if (normalized !== undefined) {
                // Renormalize the mix over the horizons this symbol actually has,
                // so a missing 12-month return doesn't shrink the whole component.
                mixWeight += MOMENTUM_MIX[horizon];
                weighted += MOMENTUM_MIX[horizon] * normalized;
            }
        }

        if (mixWeight === 0) {
            return {component: 0, reason: INSUFFICIENT_MOMENTUM_REASON};
        }

        const reasonHorizon = REASON_HORIZON_ORDER.find((horizon) => input.signals[horizon] !== null);
        // find() cannot miss when mixWeight > 0, but fall back safely rather than assert.
        const reason = reasonHorizon !== undefined
            ? `${HORIZON_LABELS[reasonHorizon]} ${formatSignedPercent(input.signals[reasonHorizon] ?? 0)}`
            : INSUFFICIENT_MOMENTUM_REASON;

        return {component: weighted / mixWeight, reason};
    });
};

const topQuintileVolCutoff = (inputs: ScoringInput[]): number | null => {
    const vols = inputs
        .map((input) => input.signals.vol63)
        .filter((vol): vol is number => vol !== null)
        .sort((a, b) => b - a);
    if (vols.length === 0) {
        return null;
    }
    // Ceil keeps at least one symbol in the quintile; ties at the cutoff all take the haircut.
    const haircutCount = Math.ceil(vols.length * TOP_QUINTILE_FRACTION);
    return vols[haircutCount - 1];
};

export const scoreUniverse = (inputs: ScoringInput[]): ScoredSymbol[] => {
    const newsComponents = rankNormalize(inputs.map((input) => input.newsWeightSlow));
    const momentumByIndex = computeMomentumByIndex(inputs);
    const volCutoff = topQuintileVolCutoff(inputs);

    return inputs.map((input, index) => {
        const reasons: string[] = [newsReason(input, inputs)];

        const momentum = momentumByIndex[index];
        reasons.push(momentum.reason);

        const thesisComponent = input.hasActiveThesis ? 1 : 0;
        if (input.hasActiveThesis) {
            reasons.push(`thesis ${input.thesisLabel ?? "active"}`);
        }

        let score =
            SCORE_WEIGHTS.newsSlow * newsComponents[index] +
            SCORE_WEIGHTS.sentimentSlow * input.sentimentSlow +
            SCORE_WEIGHTS.momentumLong * momentum.component +
            SCORE_WEIGHTS.thesis * thesisComponent;

        const {ma200dist, vol63} = input.signals;
        // Never buy a broken trend: a positive composite below the 200d MA is capped
        // at zero, while an already-negative composite stays negative.
        if (ma200dist !== null && ma200dist < 0) {
            score = Math.min(score, 0);
            reasons.push("below 200d MA — capped");
        }

        if (vol63 !== null && volCutoff !== null && vol63 >= volCutoff && score > 0) {
            score *= VOLATILITY_HAIRCUT;
            reasons.push("high volatility haircut");
        }

        const eligible =
            input.alwaysEligible ||
            (input.articleCount >= MIN_ARTICLES_FOR_ELIGIBILITY &&
                input.sourceCount >= MIN_DISTINCT_SOURCES &&
                input.barsCount >= MIN_PRICE_BARS);
        if (!eligible) {
            reasons.push(
                `ineligible (${input.articleCount} articles, ${input.sourceCount} sources, ${input.barsCount} bars)`,
            );
        }

        return {symbol: input.symbol, score, eligible, reasons};
    });
};
