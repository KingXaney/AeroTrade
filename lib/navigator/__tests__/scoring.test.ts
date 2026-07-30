// Pure scoring math: rank normalization, eligibility floors, momentum mixing,
// the 200d MA trend cap, volatility haircut, thesis boost, and reason strings.

import {describe, expect, it} from "vitest";

import {
    MIN_ARTICLES_FOR_ELIGIBILITY,
    MIN_DISTINCT_SOURCES,
    MIN_PRICE_BARS,
    MOMENTUM_MIX,
    SCORE_WEIGHTS,
    VOLATILITY_HAIRCUT,
} from "@/lib/navigator/config";
import {rankNormalize, scoreUniverse, type ScoringInput} from "@/lib/navigator/scoring";

const makeSignals = (overrides: Partial<ScoringInput["signals"]> = {}): ScoringInput["signals"] => ({
    r63: null,
    r126: null,
    r252: null,
    vol63: null,
    ma200dist: null,
    ...overrides,
});

// Defaults sit exactly on the eligibility floors so each test flips one knob at a time.
const makeInput = (overrides: Partial<ScoringInput> = {}): ScoringInput => ({
    symbol: "TEST",
    newsWeightSlow: 0,
    sentimentSlow: 0,
    signals: makeSignals(),
    sectorTilt: 0,
    hasActiveThesis: false,
    articleCount: MIN_ARTICLES_FOR_ELIGIBILITY,
    sourceCount: MIN_DISTINCT_SOURCES,
    barsCount: MIN_PRICE_BARS,
    alwaysEligible: false,
    ...overrides,
});

const bySymbol = (scored: ReturnType<typeof scoreUniverse>, symbol: string) => {
    const match = scored.find((entry) => entry.symbol === symbol);
    if (match === undefined) {
        throw new Error(`symbol ${symbol} missing from scored universe`);
    }
    return match;
};

describe("rankNormalize", () => {
    it("maps ordered values onto [-1, 1] by rank", () => {
        expect(rankNormalize([10, 30, 20])).toEqual([-1, 1, 0]);
    });

    it("gives tied values the average of the ranks they span", () => {
        // Sorted: 1 (rank 0), 5, 5 (ranks 1+2 -> avg 1.5), 9 (rank 3).
        expect(rankNormalize([5, 5, 1, 9])).toEqual([0, 0, -1, 1]);
    });

    it("returns [0] for a single element", () => {
        expect(rankNormalize([42])).toEqual([0]);
    });

    it("returns [] for an empty input", () => {
        expect(rankNormalize([])).toEqual([]);
    });
});

describe("scoreUniverse eligibility", () => {
    it("marks a symbol eligible when every floor is met", () => {
        const [scored] = scoreUniverse([makeInput()]);
        expect(scored.eligible).toBe(true);
        expect(scored.reasons.some((reason) => reason.includes("ineligible"))).toBe(false);
    });

    it("fails eligibility on article count alone", () => {
        const [scored] = scoreUniverse([makeInput({articleCount: MIN_ARTICLES_FOR_ELIGIBILITY - 1})]);
        expect(scored.eligible).toBe(false);
        expect(scored.reasons.some((reason) => reason.includes("ineligible"))).toBe(true);
    });

    it("fails eligibility on source count alone", () => {
        const [scored] = scoreUniverse([makeInput({sourceCount: MIN_DISTINCT_SOURCES - 1})]);
        expect(scored.eligible).toBe(false);
    });

    it("fails eligibility on bars count alone", () => {
        const [scored] = scoreUniverse([makeInput({barsCount: MIN_PRICE_BARS - 1})]);
        expect(scored.eligible).toBe(false);
    });

    it("lets alwaysEligible bypass every floor", () => {
        const [scored] = scoreUniverse([
            makeInput({alwaysEligible: true, articleCount: 0, sourceCount: 0, barsCount: 0}),
        ]);
        expect(scored.eligible).toBe(true);
    });

    it("still scores ineligible symbols for display", () => {
        const [scored] = scoreUniverse([makeInput({articleCount: 0, sourceCount: 0, barsCount: 0})]);
        expect(scored.eligible).toBe(false);
        expect(Number.isFinite(scored.score)).toBe(true);
        // Neutral single-symbol universe: every component is zero.
        expect(scored.score).toBeCloseTo(0, 10);
    });
});

describe("scoreUniverse momentum", () => {
    // Neutral everywhere else: equal news weights tie to a 0 news component,
    // zero sentiment, no thesis, no vol, no MA distance.
    const momentumUniverse = (): ScoringInput[] => [
        makeInput({symbol: "A", signals: makeSignals({r63: 0.0, r126: 0.3, r252: null})}),
        makeInput({symbol: "B", signals: makeSignals({r63: 0.05, r126: 0.2, r252: 0.5})}),
        makeInput({symbol: "C", signals: makeSignals({r63: 0.1, r126: 0.1, r252: 0.4})}),
    ];

    it("renormalizes the mix when r252 is missing", () => {
        const scored = scoreUniverse(momentumUniverse());

        // A: r126 rank 1, r63 rank -1; weights renormalize over r126+r63 only.
        const expectedComponent =
            (MOMENTUM_MIX.r126 * 1 + MOMENTUM_MIX.r63 * -1) / (MOMENTUM_MIX.r126 + MOMENTUM_MIX.r63);
        expect(bySymbol(scored, "A").score).toBeCloseTo(SCORE_WEIGHTS.momentumLong * expectedComponent, 10);
    });

    it("keeps the full-weight mix for symbols with every horizon", () => {
        const scored = scoreUniverse(momentumUniverse());

        // B: r63 rank 0, r126 rank 0, r252 rank 1 (over the {B, C} subset).
        expect(bySymbol(scored, "B").score).toBeCloseTo(SCORE_WEIGHTS.momentumLong * MOMENTUM_MIX.r252, 10);
        // C: r63 rank 1, r126 rank -1, r252 rank -1.
        const expectedC = MOMENTUM_MIX.r63 * 1 + MOMENTUM_MIX.r126 * -1 + MOMENTUM_MIX.r252 * -1;
        expect(bySymbol(scored, "C").score).toBeCloseTo(SCORE_WEIGHTS.momentumLong * expectedC, 10);
    });

    it("scores all-null momentum as zero with an insufficient-history reason", () => {
        const scored = scoreUniverse([
            makeInput({symbol: "D"}),
            makeInput({symbol: "E", signals: makeSignals({r126: 0.2})}),
        ]);

        const noHistory = bySymbol(scored, "D");
        expect(noHistory.score).toBeCloseTo(0, 10);
        expect(noHistory.reasons.some((reason) => reason.includes("insufficient price history"))).toBe(true);

        const withHistory = bySymbol(scored, "E");
        expect(withHistory.reasons.some((reason) => reason.includes("6-month momentum"))).toBe(true);
    });
});

describe("scoreUniverse 200d MA trend filter", () => {
    it("caps a positive composite at 0 and records the reason", () => {
        const scored = scoreUniverse([
            makeInput({
                symbol: "F",
                newsWeightSlow: 10,
                hasActiveThesis: true,
                signals: makeSignals({ma200dist: -0.05}),
            }),
            makeInput({symbol: "G", newsWeightSlow: 5, signals: makeSignals({ma200dist: -0.05})}),
        ]);

        const capped = bySymbol(scored, "F");
        expect(capped.score).toBeCloseTo(0, 10);
        expect(capped.reasons.some((reason) => reason.includes("below 200d MA"))).toBe(true);
    });

    it("leaves an already-negative composite negative", () => {
        const scored = scoreUniverse([
            makeInput({symbol: "F", newsWeightSlow: 10, signals: makeSignals({ma200dist: -0.05})}),
            makeInput({symbol: "G", newsWeightSlow: 5, signals: makeSignals({ma200dist: -0.05})}),
        ]);

        // G is the news laggard: news component -1 drives the composite below zero.
        const negative = bySymbol(scored, "G");
        expect(negative.score).toBeCloseTo(-SCORE_WEIGHTS.newsSlow, 10);
        expect(negative.reasons.some((reason) => reason.includes("below 200d MA"))).toBe(true);
    });

    it("does not fire above the 200d MA", () => {
        const scored = scoreUniverse([
            makeInput({
                symbol: "H",
                newsWeightSlow: 10,
                hasActiveThesis: true,
                signals: makeSignals({ma200dist: 0.1}),
            }),
            makeInput({symbol: "I", newsWeightSlow: 5}),
        ]);

        const aboveTrend = bySymbol(scored, "H");
        expect(aboveTrend.score).toBeGreaterThan(0);
        expect(aboveTrend.reasons.some((reason) => reason.includes("200d MA"))).toBe(false);
    });
});

describe("scoreUniverse volatility haircut", () => {
    // Five symbols with distinct news weights spread news components across [-1, 1];
    // exactly one of five vols lands in the top quintile.
    const volUniverse = (topVolSymbol: string): ScoringInput[] => {
        const calmVols = [0.1, 0.2, 0.3, 0.4];
        return ["S1", "S2", "S3", "S4", "S5"].map((symbol, index) =>
            makeInput({
                symbol,
                newsWeightSlow: (index + 1) * 10,
                signals: makeSignals({vol63: symbol === topVolSymbol ? 0.9 : calmVols[index % calmVols.length]}),
            }),
        );
    };

    it("haircuts only the top-quintile symbol when its score is positive", () => {
        const scored = scoreUniverse(volUniverse("S5"));

        // S5 leads the news ranks (component 1) and carries the top vol.
        expect(bySymbol(scored, "S5").score).toBeCloseTo(SCORE_WEIGHTS.newsSlow * VOLATILITY_HAIRCUT, 10);
        expect(bySymbol(scored, "S5").reasons.some((reason) => reason.includes("volatility haircut"))).toBe(true);

        // S4 is positive but outside the top quintile — untouched.
        expect(bySymbol(scored, "S4").score).toBeCloseTo(SCORE_WEIGHTS.newsSlow * 0.5, 10);
        expect(bySymbol(scored, "S4").reasons.some((reason) => reason.includes("volatility haircut"))).toBe(false);
    });

    it("skips top-quintile symbols whose score is not positive", () => {
        const scored = scoreUniverse(volUniverse("S1"));

        // S1 trails the news ranks (component -1) so its composite is negative.
        const negativeTopVol = bySymbol(scored, "S1");
        expect(negativeTopVol.score).toBeCloseTo(-SCORE_WEIGHTS.newsSlow, 10);
        expect(negativeTopVol.reasons.some((reason) => reason.includes("volatility haircut"))).toBe(false);

        // The positive news leader is no longer top-quintile vol — untouched.
        expect(bySymbol(scored, "S5").score).toBeCloseTo(SCORE_WEIGHTS.newsSlow, 10);
    });
});

describe("scoreUniverse thesis component", () => {
    it("adds the thesis weight and a labeled reason", () => {
        const scored = scoreUniverse([
            makeInput({symbol: "T", hasActiveThesis: true, thesisLabel: "theme:ai-capex active"}),
            makeInput({symbol: "U"}),
        ]);

        const withThesis = bySymbol(scored, "T");
        expect(withThesis.score).toBeCloseTo(SCORE_WEIGHTS.thesis, 10);
        expect(withThesis.reasons.some((reason) => reason.includes("thesis theme:ai-capex active"))).toBe(true);

        const withoutThesis = bySymbol(scored, "U");
        expect(withoutThesis.score).toBeCloseTo(0, 10);
        expect(withoutThesis.reasons.some((reason) => reason.includes("thesis"))).toBe(false);
    });
});

describe("scoreUniverse sentiment component", () => {
    it("passes sentiment through without rank normalization", () => {
        const [scored] = scoreUniverse([makeInput({sentimentSlow: 0.5})]);
        expect(scored.score).toBeCloseTo(SCORE_WEIGHTS.sentimentSlow * 0.5, 10);
    });
});

describe("scoreUniverse reasons", () => {
    it("formats the slow news weight with its universe rank", () => {
        const scored = scoreUniverse(
            ["S1", "S2", "S3", "S4", "S5"].map((symbol, index) =>
                makeInput({symbol, newsWeightSlow: (index + 1) * 10}),
            ),
        );

        expect(bySymbol(scored, "S5").reasons).toContain("slow news weight 50.0 (rank 1/5)");
        expect(bySymbol(scored, "S1").reasons).toContain("slow news weight 10.0 (rank 5/5)");
    });

    it("formats momentum as a signed percentage of the dominant horizon", () => {
        const scored = scoreUniverse([
            makeInput({symbol: "A", signals: makeSignals({r126: 0.3})}),
            makeInput({symbol: "B", signals: makeSignals({r126: -0.12})}),
        ]);

        expect(bySymbol(scored, "A").reasons).toContain("6-month momentum +30.0%");
        expect(bySymbol(scored, "B").reasons).toContain("6-month momentum -12.0%");
    });

    it("always emits between 2 and 5 reasons per symbol", () => {
        const scored = scoreUniverse([
            makeInput({
                symbol: "MAXED",
                newsWeightSlow: 10,
                hasActiveThesis: true,
                thesisLabel: "theme:ai-capex active",
                articleCount: 0,
                signals: makeSignals({r126: 0.2, ma200dist: -0.1}),
            }),
            makeInput({symbol: "BARE"}),
        ]);

        for (const entry of scored) {
            expect(entry.reasons.length).toBeGreaterThanOrEqual(2);
            expect(entry.reasons.length).toBeLessThanOrEqual(5);
        }
    });
});
