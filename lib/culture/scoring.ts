// The culture pickers' composite score. Pure and deterministic: the same inputs, profile and
// feeds in always yield the same scores and reason strings out, so the model never picks a
// position — it only narrates what these numbers already say. The attention terms are rank-
// normalised over the symbols that have them (a symbol without one sits at 0, the middle); the
// price terms are the Navigator's own, exported from its scorer; the two guards are its too.

import {
    APP_RANK_FLOOR,
    CULTURE_MOMENTUM_MIX,
    CULTURE_PROFILES,
    CULTURE_TERMS,
    CULTURE_TOP_QUINTILE_FRACTION,
    CULTURE_VOLATILITY_HAIRCUT,
    MIN_PRICE_BARS,
    TERM_FEEDS,
    type CultureFeed,
    type CultureTerm,
    type ProfileId,
} from "@/lib/culture/config";
import {logRatioPct} from "@/lib/culture/picker-features";
import {computeMomentumComponents, rankNormalize, topQuintileVolCutoff, type ScoredSymbol} from "@/lib/navigator/scoring";
import type {Signals} from "@/lib/prices/signals";

export type CultureScoringInput = {
    symbol: string;
    brands: {id: string; name: string}[];
    // Each null = unmeasured = neutral: outside the rank, 0 in the score.
    attentionAnomaly: number | null;
    attentionTrend: number | null;
    attentionPersistence: number | null;
    quietAttention: number | null;
    categoryShare: number | null;
    attentionSinceReport: number | null;
    attentionSlow: number | null;
    sentimentSlow: number;
    appRank: number | null;
    hasThesis: boolean;
    thesisLabel?: string;
    signals: Signals;
    barsCount: number;
    quoted: boolean;
    brandsCovered: number;
};

const DECIMALS = 1;

// The profile's weights over the feeds a run has, divided by their sum: a term whose feed is
// absent is zeroed, and the rest keep their proportions, so a backtest on attention and price
// and a live run with everything score on one scale.
export const effectiveWeights = (profile: ProfileId, feeds: readonly CultureFeed[]): Record<CultureTerm, number> => {
    const have = new Set(feeds);
    const raw = CULTURE_PROFILES[profile].weights;
    const present = Object.fromEntries(CULTURE_TERMS.map((term) =>
        [term, TERM_FEEDS[term].every((feed) => have.has(feed)) ? raw[term] : 0])) as Record<CultureTerm, number>;
    const total = CULTURE_TERMS.reduce((sum, term) => sum + present[term], 0);
    if (total <= 0) return present;
    return Object.fromEntries(CULTURE_TERMS.map((term) => [term, present[term] / total])) as Record<CultureTerm, number>;
};

// Rank-normalised components over the symbols that have the term, with each symbol's
// displayed rank (ties share the count of strictly higher values + 1).
const rankTerm = (values: readonly (number | null)[]): {components: number[]; ranks: (string | null)[]} => {
    const covered: {index: number; value: number}[] = [];
    values.forEach((value, index) => {
        if (value !== null) covered.push({index, value});
    });
    const normalized = rankNormalize(covered.map((entry) => entry.value));
    const components = new Array<number>(values.length).fill(0);
    const ranks = new Array<string | null>(values.length).fill(null);
    covered.forEach((entry, position) => {
        components[entry.index] = normalized[position];
        const rank = covered.filter((other) => other.value > entry.value).length + 1;
        ranks[entry.index] = `(rank ${rank}/${covered.length})`;
    });
    return {components, ranks};
};

const signedPct = (value: number): string => {
    const text = value.toFixed(DECIMALS);
    return value < 0 ? `${text}%` : `+${text}%`;
};

const signedPts = (value: number): string => {
    const text = value.toFixed(DECIMALS);
    return value < 0 ? `${text} pts` : `+${text} pts`;
};

const signed = (value: number): string => {
    const text = value.toFixed(DECIMALS);
    return value < 0 ? text : `+${text}`;
};

export const scoreCultureUniverse = (
    inputs: readonly CultureScoringInput[],
    {profile, feeds}: {profile: ProfileId; feeds: readonly CultureFeed[]},
): ScoredSymbol[] => {
    const weights = effectiveWeights(profile, feeds);
    const label = CULTURE_PROFILES[profile].label;

    const anomaly = rankTerm(inputs.map((i) => i.attentionAnomaly));
    const trend = rankTerm(inputs.map((i) => i.attentionTrend));
    const persistence = rankTerm(inputs.map((i) => i.attentionPersistence));
    const quiet = rankTerm(inputs.map((i) => i.quietAttention));
    const share = rankTerm(inputs.map((i) => i.categoryShare));
    const sinceReport = rankTerm(inputs.map((i) => i.attentionSinceReport));
    const slow = rankTerm(inputs.map((i) => i.attentionSlow));
    const momentum = computeMomentumComponents(inputs.map((i) => i.signals), CULTURE_MOMENTUM_MIX);
    const volCutoff = topQuintileVolCutoff(inputs.map((i) => i.signals.vol63), CULTURE_TOP_QUINTILE_FRACTION);

    return inputs.map((input, index) => {
        const reasons: string[] = [`picker ${label}`];

        if (weights.attentionAnomaly > 0) {
            reasons.push(input.attentionAnomaly === null
                ? 'attention unmeasured — neutral'
                : `attention ${signedPct(logRatioPct(input.attentionAnomaly))} vs baseline ${anomaly.ranks[index]}`);
        }
        if (weights.attentionTrend > 0) {
            reasons.push(input.attentionTrend === null
                ? 'attention trend unmeasured — neutral'
                : `attention trend ${signedPct(logRatioPct(input.attentionTrend))} ${trend.ranks[index]}`);
        }
        if (weights.attentionPersistence > 0) {
            reasons.push(input.attentionPersistence === null
                ? 'attention persistence unmeasured — neutral'
                : `attention held ${Math.round(input.attentionPersistence)} weeks ${persistence.ranks[index]}`);
        }
        if (weights.quietAttention > 0) {
            reasons.push(input.quietAttention === null
                ? 'quiet attention unmeasured — neutral'
                : `quiet attention ${signedPct(logRatioPct(input.quietAttention))} ${quiet.ranks[index]}`);
        }
        if (weights.categoryShare > 0) {
            reasons.push(input.categoryShare === null
                ? 'category share unmeasured — neutral'
                : `category share ${signedPts(input.categoryShare)} ${share.ranks[index]}`);
        }
        if (weights.attentionSinceReport > 0) {
            reasons.push(input.attentionSinceReport === null
                ? 'no report date — neutral'
                : `since last report ${signedPct(logRatioPct(input.attentionSinceReport))} ${sinceReport.ranks[index]}`);
        }
        if (weights.attentionSlow > 0) {
            reasons.push(input.attentionSlow === null
                ? 'no attention coverage — neutral'
                : `slow attention ${input.attentionSlow.toFixed(DECIMALS)} ${slow.ranks[index]}`);
        }
        if (weights.sentimentSlow > 0 && input.attentionSlow !== null) {
            reasons.push(`brand sentiment ${signed(input.sentimentSlow)}`);
        }
        if (weights.appRank > 0 && input.appRank !== null) {
            // The score is 1 − ln(rank)/ln(floor); this reads the rank back out of it.
            const rank = Math.round(Math.exp((1 - input.appRank) * Math.log(APP_RANK_FLOOR)));
            reasons.push(`app rank #${rank}`);
        }
        reasons.push(momentum[index].reason);
        if (weights.thesis > 0 && input.hasThesis) {
            reasons.push(`attention thesis ${(input.thesisLabel ?? 'active').slice(0, 40)}`);
        }

        let score =
            weights.momentumLong * momentum[index].component +
            weights.attentionAnomaly * anomaly.components[index] +
            weights.attentionTrend * trend.components[index] +
            weights.attentionPersistence * persistence.components[index] +
            weights.quietAttention * quiet.components[index] +
            weights.categoryShare * share.components[index] +
            weights.attentionSinceReport * sinceReport.components[index] +
            weights.attentionSlow * slow.components[index] +
            weights.thesis * (input.hasThesis ? 1 : 0) +
            weights.sentimentSlow * (input.attentionSlow === null ? 0 : input.sentimentSlow) +
            weights.appRank * (input.appRank ?? 0);

        const {ma200dist, vol63} = input.signals;
        // Never buy a broken trend: a positive composite below the 200d MA is capped at zero.
        if (ma200dist !== null && ma200dist < 0) {
            score = Math.min(score, 0);
            reasons.push('below 200d MA — capped');
        }
        if (vol63 !== null && volCutoff !== null && vol63 >= volCutoff && score > 0) {
            score *= CULTURE_VOLATILITY_HAIRCUT;
            reasons.push('high volatility haircut');
        }

        const eligible = input.barsCount >= MIN_PRICE_BARS && input.quoted && input.brandsCovered >= 1;
        if (!eligible) {
            reasons.push(`ineligible (${input.barsCount} bars, ${input.quoted ? 'quoted' : 'no quote'}, ${input.brandsCovered >= 1 ? 'attention covered' : 'no attention series'})`);
        }

        return {symbol: input.symbol, score, eligible, reasons};
    });
};
