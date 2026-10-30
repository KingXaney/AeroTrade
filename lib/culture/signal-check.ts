// What each culture signal said, against what followed: for every week the simulation decided,
// how each term's ranking of the owners — and each picker's whole score — lined up with the
// returns they went on to earn over the next 1, 2, 4, 8 and 13 weeks. Pure. Research log R1
// (measure before tuning) and R2 (does a jump in attention reverse?): docs/research/log.md.
//
// The week is the simulation's own (lib/culture/simulator): the inputs as that morning scored
// them, the names it could buy (eligible), and the returns from that session's open — the fill —
// to the open of the session h decision weeks later, with the dividends that went ex in between.
// A term is measured only in weeks whose feeds carried it, and only over the names it covered.

import {CULTURE_MOMENTUM_MIX, SIGNAL_HORIZONS_WEEKS, TERM_FEEDS, type CultureFeed, type CultureTerm, type ProfileId} from "@/lib/culture/config";
import {scoreCultureUniverse, type CultureScoringInput} from "@/lib/culture/scoring";
import {computeMomentumComponents} from "@/lib/navigator/scoring";
import type {Bar} from "@/lib/prices/signals";
import {spearman, summarizeIc, type IcSummary} from "@/lib/research/ic";
import {bookShelf, forwardReturn} from "@/lib/research/returns";

export {SIGNAL_HORIZONS_WEEKS, SIGNALS_VERSION} from "@/lib/culture/config";

// A term by its id, or a picker's whole score as `score:<profile>`.
export type SignalId = CultureTerm | `score:${ProfileId}`;
export type SignalIcRow = {signal: SignalId; horizonWeeks: number} & IcSummary;

export type MeasuredWeek = {
    // The calendar index of the session the week was decided and filled on.
    index: number;
    inputs: readonly CultureScoringInput[];
    feeds: readonly CultureFeed[];
};

// Each term as the scorer reads it, null where the name has none: momentum as its blended rank
// (lib/navigator/scoring), a thesis as 1 or 0, sentiment only where there is slow attention.
const termValues = (inputs: readonly CultureScoringInput[]): Record<CultureTerm, (number | null)[]> => {
    const momentum = computeMomentumComponents(inputs.map((input) => input.signals), CULTURE_MOMENTUM_MIX);
    return {
        momentumLong: inputs.map((input, i) => (input.signals.r63 === null && input.signals.r126 === null && input.signals.r252 === null ? null : momentum[i].component)),
        attentionAnomaly: inputs.map((input) => input.attentionAnomaly),
        attentionTrend: inputs.map((input) => input.attentionTrend),
        attentionPersistence: inputs.map((input) => input.attentionPersistence),
        quietAttention: inputs.map((input) => input.quietAttention),
        categoryShare: inputs.map((input) => input.categoryShare),
        attentionSinceReport: inputs.map((input) => input.attentionSinceReport),
        attentionSlow: inputs.map((input) => input.attentionSlow),
        thesis: inputs.map((input) => (input.hasThesis ? 1 : 0)),
        sentimentSlow: inputs.map((input) => (input.attentionSlow === null ? null : input.sentimentSlow)),
        appRank: inputs.map((input) => input.appRank),
    };
};

export const measureCultureSignals = ({weeks, calendar, bars, profiles}: {
    weeks: readonly MeasuredWeek[];
    calendar: readonly string[];
    bars: ReadonlyMap<string, readonly Bar[]>;
    profiles: readonly ProfileId[];
}): SignalIcRow[] => {
    const bookFor = bookShelf(bars);

    const weekly = new Map<string, number[]>();
    const push = (signal: SignalId, horizon: number, ic: number | null) => {
        if (ic === null) return;
        const key = `${signal}|${horizon}`;
        const list = weekly.get(key) ?? [];
        list.push(ic);
        weekly.set(key, list);
    };

    weeks.forEach((week, k) => {
        const scored = profiles.map((profile) => ({profile, scores: scoreCultureUniverse(week.inputs, {profile, feeds: week.feeds})}));
        // The names the week could buy; eligibility does not depend on the profile.
        const eligible = (scored[0]?.scores ?? week.inputs.map(() => ({eligible: true}))).map((s) => s.eligible);
        const pick = <T>(values: readonly T[]): T[] => values.filter((_, i) => eligible[i]);
        const symbols = pick(week.inputs.map((input) => input.symbol));
        const terms = termValues(week.inputs);
        const have = new Set(week.feeds);

        for (const horizon of SIGNAL_HORIZONS_WEEKS) {
            const ahead = weeks[k + horizon];
            if (!ahead) continue;
            const from = calendar[week.index];
            const to = calendar[ahead.index];
            const returns = symbols.map((symbol) => forwardReturn(bookFor(symbol), from, to));
            for (const term of Object.keys(terms) as CultureTerm[]) {
                if (!TERM_FEEDS[term].every((feed) => have.has(feed))) continue;
                push(term, horizon, spearman(pick(terms[term]), returns));
            }
            for (const {profile, scores} of scored) push(`score:${profile}`, horizon, spearman(pick(scores.map((s) => s.score)), returns));
        }
    });

    const rows: SignalIcRow[] = [];
    for (const [key, ics] of weekly) {
        const [signal, horizon] = key.split('|');
        const summary = summarizeIc(ics, Number(horizon));
        if (summary) rows.push({signal: signal as SignalId, horizonWeeks: Number(horizon), ...summary});
    }
    return rows.sort((a, b) => a.signal.localeCompare(b.signal) || a.horizonWeeks - b.horizonWeeks);
};
