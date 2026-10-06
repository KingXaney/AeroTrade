// The one read behind the landing page's momentum terrain. A plain server module, called by
// app/api/landing/surface/route.ts; the page itself still reads nothing. Two sources, in order:
//
// 1. Tiingo, once TIINGO_TOKEN is set (lib/prices/tiingo.ts): SPY's daily prices in one payload,
//    adjusted for dividends and splits — the owner's plan, as written. Next caches the fetch for
//    an hour, so a deployment asks Tiingo about once an hour for this against a free tier of 50
//    requests an hour, and no visitor waits on it twice. An adjusted close is trusted here and
//    nowhere else in the app, because it is read inside ONE payload (AGENTS invariant 11); a
//    payload with a row missing it falls back to the chained index below.
// 2. The stored SPY bars (the strategies job backfills about 1,560 days): the total-return index
//    chained from closes and stored dividends, as every "vs SPY" read does. The whole answer
//    without a key, and the fallback when Tiingo fails or has too little history.
//
// Either way the surface is memoised for the ET day on the data's own stamp — the last bar's
// date and close — never the clock alone, so a close that lands later is read and nothing is
// pinned. A failed or short read returns null and the hero shows its unavailable state rather
// than a wrong shape.

import {createDayMemo, remember} from "@/lib/day-memo";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {buildMomentumSurface, type MomentumSurface, type SurfacePoint} from "@/lib/landing/momentum-surface";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import type {Bar} from "@/lib/prices/signals";
import {getBarsForSymbols, getLatestBars} from "@/lib/prices/store";
import {fetchTiingoDaily, tiingoConfigured} from "@/lib/prices/tiingo";
import {totalReturnIndex} from "@/lib/prices/total-return";

// How far back the stored stamp's lookup reaches. SPY is stored every night; a surface older than
// this is not drawn at all rather than drawn as if current.
const STAMP_LOOKBACK_DAYS = 120;
// The surface needs 501 sessions — about 725 calendar days; read a margin for holidays and thin
// stretches. The strategies job backfills SPY about 1,560 days, so this is always inside it.
const READ_CALENDAR_DAYS = 900;

const memo = createDayMemo<MomentumSurface | null>(4);
const keep = (value: MomentumSurface | null): boolean => value !== null;

const stampOf = (bars: readonly Bar[]): string => {
    const last = bars[bars.length - 1];
    return `${last.date}:${last.close}`;
};

const points = (bars: readonly Bar[], values: readonly number[]): SurfacePoint[] =>
    bars.map((bar, i) => ({date: bar.date, value: values[i], close: bar.close}));

const chained = (bars: readonly Bar[]): number[] => totalReturnIndex(bars).map((point) => point.value);

const fromTiingo = async (today: string): Promise<MomentumSurface | null> => {
    const bars = await fetchTiingoDaily(BENCHMARK_SYMBOL, {from: addCalendarDays(today, -READ_CALENDAR_DAYS)});
    if (bars.length === 0) return null;
    return remember(memo, `tiingo:${stampOf(bars)}`, today, async () => {
        const adjusted = bars.every((bar) => bar.adjClose !== undefined) ? bars.map((bar) => bar.adjClose as number) : chained(bars);
        return buildMomentumSurface(points(bars, adjusted), {source: 'tiingo'});
    }, keep);
};

const readStored = async (from: string, to: string): Promise<MomentumSurface | null> => {
    const bars = (await getBarsForSymbols([BENCHMARK_SYMBOL], {from, to})).get(BENCHMARK_SYMBOL) ?? [];
    return bars.length === 0 ? null : buildMomentumSurface(points(bars, chained(bars)), {source: 'stored'});
};

const fromStore = async (today: string): Promise<MomentumSurface | null> => {
    const latest = await getLatestBars([BENCHMARK_SYMBOL], {since: addCalendarDays(today, -STAMP_LOOKBACK_DAYS), onOrBefore: today});
    const bar = latest.get(BENCHMARK_SYMBOL);
    if (!bar) return null;
    return remember(memo, `stored:${bar.date}:${bar.close}`, today, () => readStored(addCalendarDays(today, -READ_CALENDAR_DAYS), today), keep);
};

export const getMomentumSurface = async (): Promise<MomentumSurface | null> => {
    const today = getEasternDateString();
    if (tiingoConfigured()) {
        try {
            const surface = await fromTiingo(today);
            if (surface) return surface;
            console.warn('Momentum terrain: Tiingo gave no usable surface; drawing from the stored SPY bars');
        } catch (error) {
            console.error('Momentum terrain: Tiingo read failed; drawing from the stored SPY bars', error);
        }
    }
    try {
        return await fromStore(today);
    } catch (error) {
        console.error('Momentum terrain: read failed', error);
        return null;
    }
};
