// What each of the Navigator's terms said, against what followed: the weekly record of the whole
// scored universe (database/models/navigator-signal-week), each term's ranking of the names the
// week could buy set beside the returns they went on to earn. Pure. Research log R1
// (docs/research/log.md) — the news brain's counterpart of lib/culture/signal-check, which has
// five years of simulated weeks; this one has only the weeks the Navigator has run since it began
// recording, and says nothing until eight of them have a return to measure.

import {MOMENTUM_MIX} from "@/lib/navigator/config";
import {computeMomentumComponents, type ScoredSymbol, type ScoringInput} from "@/lib/navigator/scoring";
import {addCalendarDays, getEasternWeekKey} from "@/lib/dates";
import type {Bar} from "@/lib/prices/signals";
import {icTable, spearman, summarizeIc, type IcRow, type IcTable} from "@/lib/research/ic";
import {NAVIGATOR_SIGNAL_COPY} from "@/lib/learn/copy/navigator";
import {bookShelf, forwardReturn} from "@/lib/research/returns";

export const NAVIGATOR_SIGNAL_HORIZONS_WEEKS = [1, 2, 4, 8, 13] as const;
export const NAVIGATOR_SIGNALS = ['score', 'newsSlow', 'sentimentSlow', 'momentumLong', 'sectorSlow', 'thesis'] as const;
export type NavigatorSignal = (typeof NAVIGATOR_SIGNALS)[number];

export type SignalSymbol = {
    symbol: string;
    newsWeightSlow: number | null;
    sentimentSlow: number | null;
    r63: number | null;
    r126: number | null;
    r252: number | null;
    sectorTilt: number | null;
    thesis: boolean;
    score: number;
    eligible: boolean;
};
export type SignalWeek = {weekKey: string; date: string; symbols: readonly SignalSymbol[]};

// The week's record from what scoreUniverse was handed and what it returned: sentiment counts as
// unmeasured where the brain has no entity, a sector's standing where there is no sector.
export const toSignalSymbols = (inputs: readonly ScoringInput[], scored: readonly ScoredSymbol[]): SignalSymbol[] => {
    const bySymbol = new Map(scored.map((s) => [s.symbol, s]));
    return inputs.map((input) => {
        const result = bySymbol.get(input.symbol);
        return {
            symbol: input.symbol,
            newsWeightSlow: input.newsWeightSlow,
            sentimentSlow: input.newsWeightSlow === null ? null : input.sentimentSlow,
            r63: input.signals.r63,
            r126: input.signals.r126,
            r252: input.signals.r252,
            sectorTilt: input.sectorLabel ? input.sectorTilt : null,
            thesis: input.hasActiveThesis,
            score: result?.score ?? 0,
            eligible: result?.eligible ?? false,
        };
    });
};

const valuesOf = (symbols: readonly SignalSymbol[]): Record<NavigatorSignal, (number | null)[]> => {
    const signals = symbols.map((s) => ({r63: s.r63, r126: s.r126, r252: s.r252, vol63: null, ma200dist: null}));
    const momentum = computeMomentumComponents(signals, MOMENTUM_MIX);
    return {
        score: symbols.map((s) => s.score),
        newsSlow: symbols.map((s) => s.newsWeightSlow),
        sentimentSlow: symbols.map((s) => s.sentimentSlow),
        momentumLong: symbols.map((s, i) => (s.r63 === null && s.r126 === null && s.r252 === null ? null : momentum[i].component)),
        sectorSlow: symbols.map((s) => s.sectorTilt),
        thesis: symbols.map((s) => (s.thesis ? 1 : 0)),
    };
};

// Each recorded week against the recorded week h ET weeks later (a week the job did not run
// leaves a gap, never a shorter horizon), from one scoring day's open to the other's.
export const measureNavigatorSignals = ({weeks, bars}: {weeks: readonly SignalWeek[]; bars: ReadonlyMap<string, readonly Bar[]>}): IcRow[] => {
    const byWeek = new Map(weeks.map((week) => [week.weekKey, week]));
    const bookFor = bookShelf(bars);
    const weekly = new Map<string, number[]>();
    const ordered = [...weeks].sort((a, b) => a.date.localeCompare(b.date));
    for (const week of ordered) {
        const eligible = week.symbols.filter((s) => s.eligible);
        const values = valuesOf(eligible);
        for (const horizon of NAVIGATOR_SIGNAL_HORIZONS_WEEKS) {
            const ahead = byWeek.get(getEasternWeekKey(addCalendarDays(week.date, 7 * horizon)));
            if (!ahead) continue;
            const returns = eligible.map((s) => forwardReturn(bookFor(s.symbol), week.date, ahead.date));
            for (const signal of NAVIGATOR_SIGNALS) {
                const ic = spearman(values[signal], returns);
                if (ic === null) continue;
                const key = `${signal}|${horizon}`;
                weekly.set(key, [...(weekly.get(key) ?? []), ic]);
            }
        }
    }
    const rows: IcRow[] = [];
    for (const [key, ics] of weekly) {
        const [signal, horizon] = key.split('|');
        const summary = summarizeIc(ics, Number(horizon));
        if (summary) rows.push({signal, horizonWeeks: Number(horizon), ...summary});
    }
    return rows.sort((a, b) => a.signal.localeCompare(b.signal) || a.horizonWeeks - b.horizonWeeks);
};

// The table /brain?view=navigator prints: the whole score first, then the terms in the order
// scoreUniverse weighs them (NAVIGATOR_SIGNALS) — never by figure.
export const navigatorSignalTable = (rows: readonly IcRow[]): IcTable | null =>
    icTable(rows, NAVIGATOR_SIGNALS.map((signal) => ({id: signal, label: NAVIGATOR_SIGNAL_COPY.rows[signal], strong: signal === 'score'})), NAVIGATOR_SIGNAL_HORIZONS_WEEKS);
