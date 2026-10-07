// What the chat's getCultureBrain tool hands the model. The tool reads the culture brain through
// the /culture page's own readers (the heaviest brand entities, the owners' roll-up, the pickers
// view with its decisions, records and backtest); this module only shapes those results. Pure and
// import-light so the shape is unit-tested.
//
// The output is data for the model, never text for the page: numbers are rounded, each reason a
// picker wrote is decoded clause by clause through lib/learn/culture-reasons.ts (its clauses carry
// the glossary's definitions, via explain.ts's shapeReason), the pickers come in the registry's
// order with both records printed, and every call carries the same stance line.

import {echoText, MAX_ECHO_CHARS, shapeReason, type ExplainReason} from '@/lib/chat/explain';
import type {CultureBacktestView} from '@/lib/culture/backtest';
import {CATEGORY_LABELS} from '@/lib/culture/catalog';
import type {CultureDecisionItem} from '@/lib/culture/decisions';
import type {LiveRecordView} from '@/lib/culture/page-store';
import type {TickerRollup} from '@/lib/culture/rollup';
import type {CultureEntitySummary} from '@/lib/culture/types';
import type {ProfileId} from '@/lib/culture/config';
import {decodeCultureReason} from '@/lib/learn/culture-reasons';

export const CULTURE_STANCE =
    "This is the app's culture brain, read from its own records: the brands younger consumers are giving attention to — pageviews, App Store ranks and labelled posts folded into a decayed weight, with the model's reading of how people feel and whether a brand is a thesis — the listed companies that own them, and two automated paper pickers, Spike and Quiet, that read the same brands with different weights. Each picker comes with its live record beside SPY's total return over the same days and its simulated record kept apart. Attention is not demand, and a brand is not its owner. Describe what the brain counted and what each picker did; the two are printed side by side in the registry's order, which names no winner.";

export const CULTURE_NOTES = {
    empty: 'No brand has attention yet; the daily run fills the brain from the first morning it runs.',
    notStarted: (label: string): string => `${label}'s account opens on the first weekly run; it has no live record yet.`,
    noDecision: (label: string): string => `${label} has no decision yet; it decides on Mondays at 10:45 ET.`,
    preview: (label: string): string => `${label}'s latest decision was a preview: its orders were planned, and none were placed.`,
    unfilled: 'An order marked unfilled did not trade; its note says why.',
    noBacktest: 'No simulated record yet; the weekly job builds it once the data is vouched for.',
    simulatedOnly: 'The simulated records read pageviews and prices only, over a catalog chosen in 2026.',
} as const;

// How much travels: the heaviest brands and owners, and the first items of a decision.
export const CULTURE_CHAT_LIMITS = {brands: 10, owners: 8, items: 8, reasons: 6} as const;

const round2 = (n: number): number => Math.round(n * 100) / 100 || 0;
const round2OrNull = (n: number | null): number | null => (n === null || !Number.isFinite(n) ? null : round2(n));

export type ChatBrand = {
    id: string;
    name: string;
    category: string;
    owner: string | null;
    attention: number;
    thisWeek: number;
    sentiment: number;
    thesis: boolean;
};

export type ChatOwner = {ticker: string; company: string; attention: number; brands: string[]; theses: number};

type ChatDecisionItem = {
    action: CultureDecisionItem['action'];
    symbol: string;
    targetWeightPct: number;
    score: number;
    brands: string[];
    filled: boolean;
    price: number | null;
    unfilledBecause?: string;
    reasons: {text: string; decoded: ExplainReason}[];
};

export type ChatPicker = {
    id: ProfileId;
    label: string;
    follows: string;
    live: {returnPct: number; spyReturnPct: number | null; since: string} | null;
    decision: {date: string; preview: boolean; items: ChatDecisionItem[]; itemsTotal: number} | null;
    simulated: {returnPct: number | null; spyReturnPct: number | null; from: string; to: string; weeks: number; fills: number} | null;
};

export type ChatPickerInput = {
    id: ProfileId;
    label: string;
    follows: string;
    live: LiveRecordView | null;
    decision: {date: string; kind: 'executed' | 'preview' | 'skipped'; items: CultureDecisionItem[]} | null;
};

export type CultureChatResult = {stance: string; brands: ChatBrand[]; owners: ChatOwner[]; pickers: ChatPicker[]; notes: string[]};

export const shapeBrand = (entity: CultureEntitySummary): ChatBrand => ({
    id: entity.key,
    name: entity.displayName,
    category: CATEGORY_LABELS[entity.category] ?? entity.category,
    owner: entity.ticker,
    attention: round2(entity.weightSlow),
    thisWeek: round2(entity.weightFast),
    sentiment: round2(entity.sentimentSlow),
    thesis: entity.thesisSince !== null,
});

export const shapeOwner = (rollup: TickerRollup): ChatOwner => ({
    ticker: rollup.ticker,
    company: rollup.company,
    attention: round2(rollup.weightSlowSum),
    brands: rollup.brands.filter((brand) => brand.weightSlow > 0).map((brand) => brand.name),
    theses: rollup.thesisCount,
});

const shapeItem = (item: CultureDecisionItem): ChatDecisionItem => ({
    action: item.action,
    symbol: item.symbol,
    targetWeightPct: Math.round(item.targetWeight * 100),
    score: round2(item.score),
    brands: item.brands.map((brand) => brand.name),
    filled: item.executed,
    price: round2OrNull(typeof item.executionPrice === 'number' ? item.executionPrice : null),
    ...(!item.executed && item.error ? {unfilledBecause: echoText(item.error, MAX_ECHO_CHARS)} : {}),
    reasons: item.reasons.slice(0, CULTURE_CHAT_LIMITS.reasons).map((reason) => ({
        text: echoText(reason, MAX_ECHO_CHARS),
        decoded: shapeReason(decodeCultureReason(reason)),
    })),
});

const shapePicker = (picker: ChatPickerInput, backtest: CultureBacktestView | null): ChatPicker => {
    const variant = backtest?.variants.find((candidate) => candidate.profile === picker.id) ?? null;
    return {
        id: picker.id,
        label: picker.label,
        follows: picker.follows,
        live: picker.live ? {returnPct: round2(picker.live.totalReturnPct), spyReturnPct: round2OrNull(picker.live.benchmarkReturnPct), since: picker.live.since} : null,
        decision: picker.decision ? {
            date: picker.decision.date,
            preview: picker.decision.kind !== 'executed',
            items: picker.decision.items.slice(0, CULTURE_CHAT_LIMITS.items).map(shapeItem),
            itemsTotal: picker.decision.items.length,
        } : null,
        simulated: variant ? {
            returnPct: round2OrNull(variant.stats.totalReturnPct),
            spyReturnPct: round2OrNull(variant.stats.benchmarkReturnPct),
            from: variant.from,
            to: variant.to,
            weeks: variant.weeks,
            fills: variant.tradeCount,
        } : null,
    };
};

export const shapeCultureBrain = ({brands, owners, pickers, backtest}: {
    brands: readonly CultureEntitySummary[];
    owners: readonly TickerRollup[];
    pickers: readonly ChatPickerInput[];
    backtest: CultureBacktestView | null;
}): CultureChatResult => {
    const shaped = pickers.map((picker) => shapePicker(picker, backtest));
    const notes: string[] = [];
    if (brands.length === 0) notes.push(CULTURE_NOTES.empty);
    for (const picker of shaped) {
        if (!picker.live) notes.push(CULTURE_NOTES.notStarted(picker.label));
        if (!picker.decision) notes.push(CULTURE_NOTES.noDecision(picker.label));
        else if (picker.decision.preview) notes.push(CULTURE_NOTES.preview(picker.label));
    }
    if (shaped.some((picker) => picker.decision?.items.some((item) => item.unfilledBecause))) notes.push(CULTURE_NOTES.unfilled);
    notes.push(backtest ? CULTURE_NOTES.simulatedOnly : CULTURE_NOTES.noBacktest);
    return {
        stance: CULTURE_STANCE,
        brands: brands.slice(0, CULTURE_CHAT_LIMITS.brands).map(shapeBrand),
        owners: owners.slice(0, CULTURE_CHAT_LIMITS.owners).filter((owner) => owner.weightSlowSum > 0).map(shapeOwner),
        pickers: shaped,
        notes,
    };
};
