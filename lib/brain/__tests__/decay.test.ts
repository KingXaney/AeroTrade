import {describe, expect, it} from "vitest";

import {
    DAILY_DECAY_FAST,
    DAILY_DECAY_SLOW,
    ENTITY_EPSILON,
    ENTITY_STALE_DAYS,
    LINK_EPSILON,
    THESIS_EXIT_FRACTION,
    THESIS_WEIGHT_THRESHOLD,
} from "@/lib/brain/config";
import {
    daysBetween,
    decayEntity,
    foldLink,
    foldMentions,
    pruneLinks,
    sentimentAvg,
    shouldDeleteEntity,
    updateThesis,
    type EntityState,
    type Mention,
} from "@/lib/brain/decay";

const MS_PER_DAY = 86_400_000;
const FLOAT_PRECISION = 12;

const baseEntity = (overrides: Partial<EntityState> = {}): EntityState => ({
    weightFast: 2,
    sentimentSumFast: 0.8,
    weightSlow: 3,
    sentimentSumSlow: 1.2,
    decayedTo: "2026-07-01",
    links: [{key: "theme:ai", weight: 0.5}],
    thesisSince: null,
    peakSlowWeight: 0,
    ...overrides,
});

describe("daysBetween", () => {
    it("returns 0 for the same date", () => {
        expect(daysBetween("2026-07-01", "2026-07-01")).toBe(0);
    });

    it("returns 1 for consecutive days", () => {
        expect(daysBetween("2026-07-01", "2026-07-02")).toBe(1);
    });

    it("counts calendar days across month boundaries", () => {
        expect(daysBetween("2026-06-28", "2026-07-03")).toBe(5);
    });

    it("clamps to 0 when toDate is before fromDate", () => {
        expect(daysBetween("2026-07-10", "2026-07-01")).toBe(0);
    });
});

describe("decayEntity", () => {
    it("applies exactly one daily factor per layer after one day", () => {
        const e = baseEntity();
        const decayed = decayEntity(e, "2026-07-02");
        expect(decayed.weightFast).toBe(e.weightFast * DAILY_DECAY_FAST);
        expect(decayed.sentimentSumFast).toBe(e.sentimentSumFast * DAILY_DECAY_FAST);
        expect(decayed.weightSlow).toBe(e.weightSlow * DAILY_DECAY_SLOW);
        expect(decayed.sentimentSumSlow).toBe(e.sentimentSumSlow * DAILY_DECAY_SLOW);
        expect(decayed.decayedTo).toBe("2026-07-02");
    });

    it("decays links with the SLOW factor, not the fast one", () => {
        const e = baseEntity({links: [{key: "sector:technology", weight: 1}]});
        const decayed = decayEntity(e, "2026-07-02");
        expect(decayed.links[0].weight).toBe(DAILY_DECAY_SLOW);
        expect(decayed.links[0].weight).not.toBe(DAILY_DECAY_FAST);
    });

    it("multi-day catch-up equals compounding the daily factor", () => {
        const e = baseEntity();
        const atOnce = decayEntity(e, "2026-07-04");
        const dayByDay = decayEntity(decayEntity(decayEntity(e, "2026-07-02"), "2026-07-03"), "2026-07-04");
        expect(atOnce.weightFast).toBeCloseTo(e.weightFast * DAILY_DECAY_FAST ** 3, FLOAT_PRECISION);
        expect(atOnce.weightSlow).toBeCloseTo(e.weightSlow * DAILY_DECAY_SLOW ** 3, FLOAT_PRECISION);
        expect(atOnce.weightFast).toBeCloseTo(dayByDay.weightFast, FLOAT_PRECISION);
        expect(atOnce.weightSlow).toBeCloseTo(dayByDay.weightSlow, FLOAT_PRECISION);
        expect(atOnce.links[0].weight).toBeCloseTo(dayByDay.links[0].weight, FLOAT_PRECISION);
    });

    it("is an equal-valued copy (idempotent) when today equals decayedTo", () => {
        const e = baseEntity();
        const once = decayEntity(e, "2026-07-01");
        const twice = decayEntity(once, "2026-07-01");
        expect(once).toEqual(e);
        expect(twice).toEqual(once);
        expect(once).not.toBe(e);
    });
});

describe("foldMentions", () => {
    it("adds importance*relevance mass and weighted sentiment to BOTH layers", () => {
        const e = baseEntity();
        const mentions: Mention[] = [
            {sentiment: 0.5, importance: 2, relevance: 0.8},
            {sentiment: -1, importance: 1, relevance: 0.5},
        ];
        const weightAdd = 2 * 0.8 + 1 * 0.5;
        const sentimentAdd = 0.5 * (2 * 0.8) + -1 * (1 * 0.5);
        const folded = foldMentions(e, mentions);
        expect(folded.weightFast).toBeCloseTo(e.weightFast + weightAdd, FLOAT_PRECISION);
        expect(folded.weightSlow).toBeCloseTo(e.weightSlow + weightAdd, FLOAT_PRECISION);
        expect(folded.sentimentSumFast).toBeCloseTo(e.sentimentSumFast + sentimentAdd, FLOAT_PRECISION);
        expect(folded.sentimentSumSlow).toBeCloseTo(e.sentimentSumSlow + sentimentAdd, FLOAT_PRECISION);
    });

    it("leaves the entity unchanged for an empty mention list", () => {
        const e = baseEntity();
        expect(foldMentions(e, [])).toEqual(e);
    });
});

describe("foldLink", () => {
    it("inserts a new link with the given weight", () => {
        const e = baseEntity();
        const folded = foldLink(e, "sector:energy", 0.3);
        expect(folded.links).toEqual([
            {key: "theme:ai", weight: 0.5},
            {key: "sector:energy", weight: 0.3},
        ]);
    });

    it("increments an existing link and leaves the others untouched", () => {
        const e = baseEntity({
            links: [
                {key: "theme:ai", weight: 0.5},
                {key: "sector:energy", weight: 0.2},
            ],
        });
        const folded = foldLink(e, "theme:ai", 0.25);
        expect(folded.links).toEqual([
            {key: "theme:ai", weight: 0.75},
            {key: "sector:energy", weight: 0.2},
        ]);
    });
});

describe("updateThesis", () => {
    const todayMs = Date.UTC(2026, 6, 30);

    it("activates exactly at the threshold and records the peak", () => {
        const e = baseEntity({weightSlow: THESIS_WEIGHT_THRESHOLD});
        const updated = updateThesis(e, todayMs);
        expect(updated.thesisSince).toBe(todayMs);
        expect(updated.peakSlowWeight).toBe(THESIS_WEIGHT_THRESHOLD);
    });

    it("does not activate just below the threshold", () => {
        const e = baseEntity({weightSlow: THESIS_WEIGHT_THRESHOLD - 0.001});
        const updated = updateThesis(e, todayMs);
        expect(updated.thesisSince).toBeNull();
        expect(updated.peakSlowWeight).toBe(0);
    });

    it("tracks a rising peak while the thesis is active", () => {
        const startedMs = todayMs - 10 * MS_PER_DAY;
        const e = baseEntity({weightSlow: 12, thesisSince: startedMs, peakSlowWeight: 8});
        const updated = updateThesis(e, todayMs);
        expect(updated.thesisSince).toBe(startedMs);
        expect(updated.peakSlowWeight).toBe(12);
    });

    it("keeps the peak when weight dips but stays above the exit line", () => {
        const startedMs = todayMs - 10 * MS_PER_DAY;
        const peak = 20;
        const aboveExit = THESIS_EXIT_FRACTION * peak + 0.5;
        const e = baseEntity({weightSlow: aboveExit, thesisSince: startedMs, peakSlowWeight: peak});
        const updated = updateThesis(e, todayMs);
        expect(updated.thesisSince).toBe(startedMs);
        expect(updated.peakSlowWeight).toBe(peak);
    });

    it("exits when weight falls below the fraction of peak", () => {
        const peak = 20;
        const belowExit = THESIS_EXIT_FRACTION * peak - 0.1;
        const e = baseEntity({weightSlow: belowExit, thesisSince: todayMs - MS_PER_DAY, peakSlowWeight: peak});
        const updated = updateThesis(e, todayMs);
        expect(updated.thesisSince).toBeNull();
        expect(updated.peakSlowWeight).toBe(0);
    });

    it("does not reactivate in the same call even if the exited weight clears the entry threshold", () => {
        // With peak 20, exit triggers below 8 while the entry threshold is 5:
        // a weight of 6 must exit and STAY exited within this single update.
        const peak = 20;
        const weight = THESIS_WEIGHT_THRESHOLD + 1;
        expect(weight).toBeLessThan(THESIS_EXIT_FRACTION * peak);
        const e = baseEntity({weightSlow: weight, thesisSince: todayMs - MS_PER_DAY, peakSlowWeight: peak});
        const updated = updateThesis(e, todayMs);
        expect(updated.thesisSince).toBeNull();
        expect(updated.peakSlowWeight).toBe(0);
    });
});

describe("pruneLinks", () => {
    it("drops links below LINK_EPSILON and keeps the boundary value", () => {
        const links = [
            {key: "keep-high", weight: LINK_EPSILON * 2},
            {key: "keep-boundary", weight: LINK_EPSILON},
            {key: "drop-low", weight: LINK_EPSILON / 2},
        ];
        expect(pruneLinks(links)).toEqual([
            {key: "keep-high", weight: LINK_EPSILON * 2},
            {key: "keep-boundary", weight: LINK_EPSILON},
        ]);
    });
});

describe("shouldDeleteEntity", () => {
    const todayMs = Date.UTC(2026, 6, 30);
    const staleMs = todayMs - ENTITY_STALE_DAYS * MS_PER_DAY - 1;
    const tiny = ENTITY_EPSILON / 2;

    it("deletes when both weights are negligible and last seen is older than the stale window", () => {
        const e = baseEntity({weightFast: tiny, weightSlow: tiny});
        expect(shouldDeleteEntity(e, staleMs, todayMs)).toBe(true);
    });

    it("keeps the entity when either weight reaches ENTITY_EPSILON", () => {
        expect(shouldDeleteEntity(baseEntity({weightFast: ENTITY_EPSILON, weightSlow: tiny}), staleMs, todayMs)).toBe(false);
        expect(shouldDeleteEntity(baseEntity({weightFast: tiny, weightSlow: ENTITY_EPSILON}), staleMs, todayMs)).toBe(false);
    });

    it("keeps the entity at exactly ENTITY_STALE_DAYS old (must be strictly older)", () => {
        const boundaryMs = todayMs - ENTITY_STALE_DAYS * MS_PER_DAY;
        const e = baseEntity({weightFast: tiny, weightSlow: tiny});
        expect(shouldDeleteEntity(e, boundaryMs, todayMs)).toBe(false);
        expect(shouldDeleteEntity(e, boundaryMs - 1, todayMs)).toBe(true);
    });
});

describe("sentimentAvg", () => {
    it("divides sum by weight", () => {
        expect(sentimentAvg(1.5, 3)).toBeCloseTo(0.5, FLOAT_PRECISION);
    });

    it("returns 0 for zero and near-zero weights instead of exploding", () => {
        expect(sentimentAvg(1, 0)).toBe(0);
        expect(sentimentAvg(1, 1e-10)).toBe(0);
        expect(sentimentAvg(1, -1e-10)).toBe(0);
    });
});

describe("immutability", () => {
    it("never mutates the input entity or its links", () => {
        const e = baseEntity({weightSlow: 20, thesisSince: Date.UTC(2026, 6, 1), peakSlowWeight: 20});
        const before = structuredClone(e);

        decayEntity(e, "2026-07-15");
        foldMentions(e, [{sentiment: 1, importance: 2, relevance: 1}]);
        foldLink(e, "theme:ai", 0.4);
        foldLink(e, "sector:energy", 0.4);
        updateThesis(e, Date.UTC(2026, 6, 30));

        expect(e).toEqual(before);
    });

    it("pruneLinks returns a new array without touching the input", () => {
        const links = [
            {key: "keep", weight: 1},
            {key: "drop", weight: LINK_EPSILON / 10},
        ];
        const before = structuredClone(links);
        const pruned = pruneLinks(links);
        expect(links).toEqual(before);
        expect(pruned).not.toBe(links);
    });
});
