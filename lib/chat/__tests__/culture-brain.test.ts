// The getCultureBrain tool's output is data for the model, shaped here and nowhere else: the
// heaviest brands and owners with their numbers rounded, and each picker with its live record,
// its latest decision — every reason decoded clause by clause through the culture grammar — and
// its simulated record kept apart. One constant stance line rides on every shape, and every
// sentence passes the no-advice list.

import {describe, expect, it} from 'vitest';
import {CULTURE_CHAT_LIMITS, CULTURE_NOTES, CULTURE_STANCE, shapeBrand, shapeCultureBrain, shapeOwner, type ChatFollowInput, type ChatPickerInput} from '@/lib/chat/culture-brain';
import type {CultureBacktestView} from '@/lib/culture/backtest';
import type {CultureDecisionItem} from '@/lib/culture/decisions';
import type {TickerRollup} from '@/lib/culture/rollup';
import type {CultureEntitySummary} from '@/lib/culture/types';
import {findBanned} from '@/lib/learn/banned';
import type {SeriesStats} from '@/lib/strategies/types';

const entity = (key: string, over: Partial<CultureEntitySummary> = {}): CultureEntitySummary => ({
    key, displayName: key.toUpperCase(), category: 'drinks', ticker: 'CELH', listing: 'us',
    weightFast: 0.456, weightSlow: 3.14159, sentimentFast: 0, sentimentSlow: 0.2345, thesisSince: null, lastSeenAt: 1, ...over,
});

const rollup = (ticker: string, over: Partial<TickerRollup> = {}): TickerRollup => ({
    ticker, listing: 'us', company: `${ticker} Inc`, weightSlowSum: 4.5678, weightSlowMax: 3, weightFastSum: 1, sentimentSlow: 0.1, thesisCount: 1,
    brands: [{id: 'a', name: 'A', weightSlow: 3, weightFast: 1, sentimentSlow: 0.1, thesis: true}, {id: 'b', name: 'B', weightSlow: 0, weightFast: 0, sentimentSlow: 0, thesis: false}],
    ...over,
});

const item = (symbol: string, over: Partial<CultureDecisionItem> = {}): CultureDecisionItem => ({
    symbol, action: 'buy', quantity: 10, targetWeight: 0.149, currentWeight: 0, score: 0.41234,
    reasons: ['enter: score 0.41', 'picker Spike', 'attention +200.0% vs baseline (rank 1/2)', 'a reason the grammar has never seen'],
    brands: [{id: 'celsius', name: 'Celsius'}], executed: false, error: 'Couldn\'t fetch a live price for CELH', ...over,
});

const stats = (totalReturnPct: number): SeriesStats => ({
    totalReturnPct, cagrPct: 1, annualizedVolPct: 1, maxDrawdownPct: 1, winRatePct: null, wins: 0, losses: 0, tradeCount: 19, benchmarkReturnPct: 136.24, excessReturnPct: totalReturnPct - 136.24,
});

const backtest: CultureBacktestView = {
    version: '1', computedAt: 1, from: '2021-10-15', to: '2026-10-06', feeds: ['price', 'wikipedia'], benchmarkReturnPct: 136.24,
    variants: [
        {profile: 'spike', label: 'Spike', from: '2021-10-15', to: '2026-10-06', weeks: 260, closeFills: 0, tradeCount: 19, turnoverPct: 50, stats: stats(21.5555), series: []},
        {profile: 'quiet', label: 'Quiet', from: '2021-10-15', to: '2026-10-06', weeks: 260, closeFills: 0, tradeCount: 19, turnoverPct: 50, stats: stats(21.5555), series: []},
    ],
};

const picker = (id: 'spike' | 'quiet', over: Partial<ChatPickerInput> = {}): ChatPickerInput => ({
    id, label: id === 'spike' ? 'Spike' : 'Quiet', follows: 'it follows attention that has just jumped.',
    live: {series: [], stats: {} as never, since: '2026-10-07', snapshotDays: 1, benchmarkReturnPct: 0.123456, totalReturnPct: -0.5},
    decision: {date: '2026-10-07', kind: 'executed', items: [item('CELH')]},
    ...over,
});

describe('shapeCultureBrain', () => {
    it('rounds the brands and owners, drops an owner\'s brands without weight, and caps both lists', () => {
        const brands = Array.from({length: 14}, (_, i) => entity(`b${i}`, {weightSlow: 14 - i, thesisSince: i === 0 ? 1 : null}));
        const owners = Array.from({length: 10}, (_, i) => rollup(`T${i}`));
        const result = shapeCultureBrain({brands, owners, pickers: [], backtest: null});
        expect(result.brands).toHaveLength(CULTURE_CHAT_LIMITS.brands);
        expect(result.owners).toHaveLength(CULTURE_CHAT_LIMITS.owners);
        expect(result.brands[0]).toEqual({id: 'b0', name: 'B0', category: 'Drinks', owner: 'CELH', attention: 14, thisWeek: 0.46, sentiment: 0.23, thesis: true});
        expect(result.owners[0]).toEqual({ticker: 'T0', company: 'T0 Inc', attention: 4.57, brands: ['A'], theses: 1});
        expect(shapeBrand(entity('x', {ticker: null, listing: null})).owner).toBeNull();
        expect(shapeOwner(rollup('Z', {weightSlowSum: 0})).attention).toBe(0);
    });

    it('shapes each picker: the live record beside SPY, the decision with every reason decoded, the simulated record apart', () => {
        const result = shapeCultureBrain({brands: [entity('celsius')], owners: [rollup('CELH')], pickers: [picker('spike'), picker('quiet')], backtest});
        expect(result.stance).toBe(CULTURE_STANCE);
        expect(result.pickers.map((p) => p.id)).toEqual(['spike', 'quiet']);
        const spike = result.pickers[0];
        expect(spike.live).toEqual({returnPct: -0.5, spyReturnPct: 0.12, since: '2026-10-07'});
        expect(spike.decision?.preview).toBe(false);
        expect(spike.decision?.itemsTotal).toBe(1);
        const shaped = spike.decision!.items[0];
        expect(shaped).toMatchObject({action: 'buy', symbol: 'CELH', targetWeightPct: 15, score: 0.41, brands: ['Celsius'], filled: false, price: null});
        expect(shaped.unfilledBecause).toMatch(/live price/);
        expect(shaped.reasons).toHaveLength(4);
        // The grammar reads the picker's own strings and leaves the stranger whole.
        expect(shaped.reasons[1].decoded.clauses[0].text).toBe('picker Spike');
        expect(shaped.reasons[1].decoded.clauses[0].term).toBe('Picker profile');
        expect(shaped.reasons[2].decoded.clauses.length).toBeGreaterThan(0);
        expect(shaped.reasons[3].decoded.clauses).toEqual([]);
        expect(shaped.reasons[3].decoded.unrecognised).toEqual(['a reason the grammar has never seen']);
        expect(spike.simulated).toEqual({returnPct: 21.56, spyReturnPct: 136.24, from: '2021-10-15', to: '2026-10-06', weeks: 260, fills: 19});
        expect(result.yours).toEqual([]);
        expect(result.notes).toEqual([CULTURE_NOTES.unfilled, CULTURE_NOTES.simulatedOnly, CULTURE_NOTES.noneEnrolled]);
    });

    it("shapes the reader's own enrolled accounts under \"yours\", enrolled ones only, with their notes", () => {
        const follow = (profile: 'spike' | 'quiet', over: Partial<ChatFollowInput> = {}): ChatFollowInput => ({
            profile, label: profile === 'spike' ? 'Spike' : 'Quiet', accountName: `Culture · ${profile === 'spike' ? 'Spike' : 'Quiet'}`,
            status: {enrolled: true, status: 'active', accountId: 'acc', enrolledAt: 1},
            record: {returnPct: 1.23456, benchmarkReturnPct: 0.5, since: '2026-10-14'},
            decision: {date: '2026-10-14', kind: 'executed', items: [item('CELH', {executed: true, error: undefined, executionPrice: 41.2})]},
            ...over,
        });
        const result = shapeCultureBrain({
            brands: [entity('celsius')], owners: [], pickers: [picker('spike')], backtest,
            follows: [follow('spike'), follow('quiet', {status: {enrolled: false}})],
        });
        expect(result.yours).toHaveLength(1);
        expect(result.yours[0]).toMatchObject({profile: 'spike', label: 'Spike', status: 'active', accountName: 'Culture · Spike', live: {returnPct: 1.23, spyReturnPct: 0.5, since: '2026-10-14'}});
        expect(result.yours[0].decision).toMatchObject({date: '2026-10-14', preview: false, itemsTotal: 1});
        expect(result.yours[0].decision!.items[0]).toMatchObject({symbol: 'CELH', filled: true, price: 41.2});
        expect(result.notes).toEqual([CULTURE_NOTES.unfilled, CULTURE_NOTES.simulatedOnly, CULTURE_NOTES.enrolled(['Spike'])]);

        const paused = shapeCultureBrain({
            brands: [], owners: [], pickers: [], backtest: null,
            follows: [follow('quiet', {status: {enrolled: true, status: 'paused'}, record: null, decision: {date: '2026-10-14', kind: 'preview', items: []}})],
        });
        expect(paused.yours[0]).toMatchObject({status: 'paused', live: null, decision: {preview: true, items: [], itemsTotal: 0}});
        expect(paused.notes).toEqual([CULTURE_NOTES.empty, CULTURE_NOTES.noBacktest, CULTURE_NOTES.enrolled(['Quiet']), CULTURE_NOTES.followPaused('Quiet'), CULTURE_NOTES.followPreview('Quiet')]);
    });

    it('says what is missing: no brands, an account not opened, no decision, a preview, no backtest', () => {
        const result = shapeCultureBrain({
            brands: [], owners: [],
            pickers: [picker('spike', {live: null, decision: null}), picker('quiet', {decision: {date: '2026-10-07', kind: 'preview', items: [item('PEP', {executed: false, error: undefined})]}})],
            backtest: null,
        });
        expect(result.notes).toEqual([
            CULTURE_NOTES.empty,
            CULTURE_NOTES.notStarted('Spike'),
            CULTURE_NOTES.noDecision('Spike'),
            CULTURE_NOTES.preview('Quiet'),
            CULTURE_NOTES.noBacktest,
            CULTURE_NOTES.noneEnrolled,
        ]);
        expect(result.pickers[1].decision?.preview).toBe(true);
        expect(result.pickers[1].simulated).toBeNull();
    });

    it('keeps at most the limits of items and reasons, echoing text clipped', () => {
        const many = Array.from({length: 12}, (_, i) => item(`S${i}`, {reasons: Array.from({length: 9}, (_, j) => `reason ${j} ${'x'.repeat(300)}`)}));
        const result = shapeCultureBrain({brands: [], owners: [], pickers: [picker('spike', {decision: {date: '2026-10-07', kind: 'executed', items: many}})], backtest: null});
        const decision = result.pickers[0].decision!;
        expect(decision.items).toHaveLength(CULTURE_CHAT_LIMITS.items);
        expect(decision.itemsTotal).toBe(12);
        expect(decision.items[0].reasons).toHaveLength(CULTURE_CHAT_LIMITS.reasons);
        expect(decision.items[0].reasons[0].text.length).toBeLessThanOrEqual(200);
    });

    it('speaks in the descriptive voice', () => {
        const texts = [CULTURE_STANCE, CULTURE_NOTES.empty, CULTURE_NOTES.unfilled, CULTURE_NOTES.noBacktest, CULTURE_NOTES.simulatedOnly,
            CULTURE_NOTES.notStarted('Spike'), CULTURE_NOTES.noDecision('Quiet'), CULTURE_NOTES.preview('Spike'),
            CULTURE_NOTES.enrolled(['Spike', 'Quiet']), CULTURE_NOTES.noneEnrolled, CULTURE_NOTES.followPaused('Spike'), CULTURE_NOTES.followPreview('Quiet')];
        for (const text of texts) expect(findBanned(text, 'advice'), text).toEqual([]);
    });
});
