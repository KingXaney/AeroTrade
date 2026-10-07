// From stored series, entities and bars to what the scorer takes: each brand's features, the
// cross-brand ones (press coverage, category share), and the roll-up of brands to their
// listed owner. Pure, dated by `asOf`, shared by the live run and the backtest, so the two
// cannot drift apart. lib/culture/picker-store.ts loads the inputs; this shapes them.

import {
    ATTENTION_TOP_BRANDS,
    BRAND_SHARE_CAP,
    LIVE_LOOKBACK_CALENDAR_DAYS,
    PRESS_WINDOW_DAYS,
    ATTENTION_RECENT_DAYS,
    ATTENTION_BASELINE_DAYS,
    type CultureFeed,
} from "@/lib/culture/config";
import {
    appRankScore,
    attentionBaseline,
    attentionPersistence,
    attentionSinceReport,
    attentionSurprise,
    attentionTrend,
    sumBetween,
} from "@/lib/culture/picker-features";
import type {CultureScoringInput} from "@/lib/culture/scoring";
import type {CultureTicker} from "@/lib/culture/universe";
import type {AttentionPoint, CultureBrand, CultureCategory, CultureEntitySummary} from "@/lib/culture/types";
import {rankNormalize} from "@/lib/navigator/scoring";
import {computeSignals, type Bar} from "@/lib/prices/signals";
import {addCalendarDays} from "@/lib/dates";

export type BrandSeriesInput = {
    brand: CultureBrand;
    wikipedia: readonly AttentionPoint[];
    appstore: readonly AttentionPoint[];
    news: readonly AttentionPoint[];
    entity: CultureEntitySummary | null;
    // The owner's last earnings date, when a calendar served one.
    reportDate: string | null;
};

export type BrandFeatures = {
    id: string;
    name: string;
    category: CultureCategory;
    ticker: string | null;
    baseline: number | null;
    recentSum: number;
    baseSum: number;
    surprise: number | null;
    trend: number | null;
    persistence: number | null;
    pressMentions: number;
    // Filled across the catalog by withCrossBrandFeatures.
    quiet: number | null;
    categoryShare: number | null;
    sinceReport: number | null;
    appRank: number | null;
    attentionSlow: number | null;
    sentimentSlow: number;
    thesis: boolean;
};

export const brandFeatures = (input: BrandSeriesInput, asOf: string): BrandFeatures => {
    const recentFrom = addCalendarDays(asOf, -(ATTENTION_RECENT_DAYS - 1));
    const baseTo = addCalendarDays(recentFrom, -1);
    const baseFrom = addCalendarDays(baseTo, -(ATTENTION_BASELINE_DAYS - 1));
    return {
        id: input.brand.id,
        name: input.brand.name,
        category: input.brand.category,
        ticker: input.brand.owner?.ticker ?? null,
        baseline: attentionBaseline(input.wikipedia, asOf),
        recentSum: sumBetween(input.wikipedia, recentFrom, asOf),
        baseSum: sumBetween(input.wikipedia, baseFrom, baseTo),
        surprise: attentionSurprise(input.wikipedia, asOf),
        trend: attentionTrend(input.wikipedia, asOf),
        persistence: attentionPersistence(input.wikipedia, asOf),
        pressMentions: sumBetween(input.news, addCalendarDays(asOf, -(PRESS_WINDOW_DAYS - 1)), asOf),
        quiet: null,
        categoryShare: null,
        sinceReport: attentionSinceReport(input.wikipedia, input.reportDate, asOf),
        appRank: appRankScore(input.appstore, asOf),
        attentionSlow: input.entity ? input.entity.weightSlow : null,
        sentimentSlow: input.entity?.sentimentSlow ?? 0,
        thesis: input.entity?.thesisSince != null,
    };
};

// Quiet attention: a surprise the press has not caught up with. Press coverage is a brand's
// rank among the brands the news named, spread 0 (least covered) to 1 (most); a brand no
// outlet mentioned is uncovered. Category share: the brand's share of its category's views,
// the last four weeks against the six months before, in share points, private brands in the
// denominator — a listed brand losing share to a private rival reads as a falling share.
export const withCrossBrandFeatures = (features: readonly BrandFeatures[], {hasPress}: {hasPress: boolean}): BrandFeatures[] => {
    const covered = features.filter((f) => f.pressMentions > 0);
    const coverage = new Map<string, number>();
    const normalized = rankNormalize(covered.map((f) => f.pressMentions));
    covered.forEach((f, i) => coverage.set(f.id, (normalized[i] + 1) / 2));

    const categoryRecent = new Map<CultureCategory, number>();
    const categoryBase = new Map<CultureCategory, number>();
    for (const f of features) {
        categoryRecent.set(f.category, (categoryRecent.get(f.category) ?? 0) + f.recentSum);
        categoryBase.set(f.category, (categoryBase.get(f.category) ?? 0) + f.baseSum);
    }

    return features.map((f) => {
        const press = coverage.get(f.id) ?? 0;
        const quiet = !hasPress || f.surprise === null ? null : f.surprise > 0 ? f.surprise * (1 - press) : f.surprise;
        const recentTotal = categoryRecent.get(f.category) ?? 0;
        const baseTotal = categoryBase.get(f.category) ?? 0;
        const categoryShare = f.baseline === null || recentTotal <= 0 || baseTotal <= 0
            ? null
            : (f.recentSum / recentTotal - f.baseSum / baseTotal) * 100;
        return {...f, quiet, categoryShare};
    });
};

// A ticker's brands weighed by their baselines, no brand past the cap (the excess spread over
// the rest), so PepsiCo's dozen brands never out-mass a single-brand company by count.
export const brandShares = (brands: readonly BrandFeatures[]): Map<string, number> => {
    const withBaseline = brands.filter((b) => b.baseline !== null && (b.baseline as number) >= 0);
    const total = withBaseline.reduce((sum, b) => sum + (b.baseline as number), 0);
    const shares = new Map<string, number>();
    if (withBaseline.length === 0) return shares;
    if (total <= 0) {
        for (const b of withBaseline) shares.set(b.id, 1 / withBaseline.length);
        return shares;
    }
    let remaining = withBaseline.map((b) => ({id: b.id, share: (b.baseline as number) / total}));
    for (let round = 0; round < withBaseline.length; round++) {
        const over = remaining.filter((s) => s.share > BRAND_SHARE_CAP);
        if (over.length === 0) break;
        const excess = over.reduce((sum, s) => sum + s.share - BRAND_SHARE_CAP, 0);
        const under = remaining.filter((s) => s.share <= BRAND_SHARE_CAP);
        const underTotal = under.reduce((sum, s) => sum + s.share, 0);
        remaining = remaining.map((s) => {
            if (s.share > BRAND_SHARE_CAP) return {id: s.id, share: BRAND_SHARE_CAP};
            if (underTotal <= 0) return {id: s.id, share: s.share + excess / Math.max(1, under.length)};
            return {id: s.id, share: s.share + excess * (s.share / underTotal)};
        });
    }
    for (const s of remaining) shares.set(s.id, s.share);
    return shares;
};

const shareWeighted = (brands: readonly BrandFeatures[], shares: ReadonlyMap<string, number>, pick: (b: BrandFeatures) => number | null): number | null => {
    let weight = 0;
    let sum = 0;
    for (const b of brands) {
        const value = pick(b);
        const share = shares.get(b.id);
        if (value === null || share === undefined) continue;
        weight += share;
        sum += share * value;
    }
    return weight <= 0 ? null : sum / weight;
};

export type TickerRollup = Pick<CultureScoringInput,
    'attentionAnomaly' | 'attentionTrend' | 'attentionPersistence' | 'quietAttention' | 'categoryShare' | 'attentionSinceReport'
    | 'attentionSlow' | 'sentimentSlow' | 'appRank' | 'hasThesis' | 'thesisLabel' | 'brandsCovered'>;

export const rollupTicker = (brands: readonly BrandFeatures[]): TickerRollup => {
    const shares = brandShares(brands);
    const withAttention = brands.filter((b) => b.attentionSlow !== null).sort((a, b) => (b.attentionSlow as number) - (a.attentionSlow as number));
    const slowSum = withAttention.length === 0 ? null : withAttention.slice(0, ATTENTION_TOP_BRANDS).reduce((sum, b) => sum + (b.attentionSlow as number), 0);
    const slowTotal = withAttention.reduce((sum, b) => sum + (b.attentionSlow as number), 0);
    const sentiment = slowTotal <= 1e-9 ? 0 : withAttention.reduce((sum, b) => sum + b.sentimentSlow * (b.attentionSlow as number), 0) / slowTotal;
    const theses = brands.filter((b) => b.thesis).sort((a, b) => (b.attentionSlow ?? 0) - (a.attentionSlow ?? 0));
    const appRanks = brands.map((b) => b.appRank).filter((v): v is number => v !== null);
    return {
        attentionAnomaly: shareWeighted(brands, shares, (b) => b.surprise),
        attentionTrend: shareWeighted(brands, shares, (b) => b.trend),
        attentionPersistence: shareWeighted(brands, shares, (b) => b.persistence),
        quietAttention: shareWeighted(brands, shares, (b) => b.quiet),
        categoryShare: shareWeighted(brands, shares, (b) => b.categoryShare),
        attentionSinceReport: shareWeighted(brands, shares, (b) => b.sinceReport),
        attentionSlow: slowSum,
        sentimentSlow: sentiment,
        appRank: appRanks.length === 0 ? null : Math.max(...appRanks),
        hasThesis: theses.length > 0,
        ...(theses.length > 0 ? {thesisLabel: theses[0].name} : {}),
        brandsCovered: brands.filter((b) => b.surprise !== null).length,
    };
};

export type ScoringInputsBuild = {
    tickers: readonly CultureTicker[];
    quoted: ReadonlySet<string>;
    bars: ReadonlyMap<string, readonly Bar[]>;
    brands: ReadonlyMap<string, BrandSeriesInput>;
    asOf: string;
};

// The feeds the data at hand carries: a term whose feed is missing is renormalised away.
export const detectFeeds = (brands: ReadonlyMap<string, BrandSeriesInput>): CultureFeed[] => {
    const inputs = [...brands.values()];
    const feeds: CultureFeed[] = ['price'];
    if (inputs.some((b) => b.wikipedia.length > 0)) feeds.push('wikipedia');
    if (inputs.some((b) => b.entity !== null)) feeds.push('mentions');
    if (inputs.some((b) => b.news.length > 0)) feeds.push('press');
    if (inputs.some((b) => b.appstore.length > 0)) feeds.push('appstore');
    if (inputs.some((b) => b.reportDate !== null)) feeds.push('earnings');
    return feeds;
};

export const toScoringInputs = ({tickers, quoted, bars, brands, asOf}: ScoringInputsBuild): {inputs: CultureScoringInput[]; feeds: CultureFeed[]} => {
    const feeds = detectFeeds(brands);
    const perBrand = withCrossBrandFeatures([...brands.values()].map((input) => brandFeatures(input, asOf)), {hasPress: feeds.includes('press')});
    const featureById = new Map(perBrand.map((f) => [f.id, f]));
    const from = addCalendarDays(asOf, -LIVE_LOOKBACK_CALENDAR_DAYS);
    const inputs = tickers.map((ticker) => {
        const windowed = (bars.get(ticker.symbol) ?? []).filter((bar) => bar.date >= from && bar.date <= asOf);
        const brandRows = ticker.brands.map((b) => featureById.get(b.id)).filter((f): f is BrandFeatures => f !== undefined);
        return {
            symbol: ticker.symbol,
            brands: ticker.brands.map((b) => ({id: b.id, name: b.name})),
            ...rollupTicker(brandRows),
            signals: computeSignals([...windowed]),
            barsCount: windowed.length,
            quoted: quoted.has(ticker.symbol),
        };
    });
    return {inputs, feeds};
};
