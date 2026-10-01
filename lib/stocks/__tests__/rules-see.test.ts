// buildRulesSee: the stock page's "What the rules see" — the row each watching strategy stored
// for this symbol on its latest board, verdict and values as the board prints them. A figure
// identical on every row (the close, the run's dates) is stated once for the panel, never per
// row (AGENTS.md invariant 8); a strategy with no stored row is named once, in one line.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {isGlossaryKey} from '@/lib/learn/glossary';
import {buildRulesSee, type SymbolBoardRead} from '@/lib/stocks/rules-see';
import {RULES_SEE_COPY} from '@/lib/learn/copy/rules-see';
import {strategyBySlug} from '@/lib/strategies/catalog';
import {strategiesWatching} from '@/lib/strategies/universe';
import type {SignalRow, StrategyDefinition} from '@/lib/strategies/types';

const def = (slug: string): StrategyDefinition => {
    const found = strategyBySlug(slug);
    if (!found) throw new Error(slug);
    return found;
};

const RSI: SignalRow = {symbol: 'NVDA', state: 'enter', values: {close: 181.25, rsi2: 4.2, sma5: 186.4, sma200: 150.3, aboveSma200: true}};
const MOM: SignalRow = {symbol: 'NVDA', state: 'held', values: {close: 181.25, momentum: 0.842, rank: 2}};
const read = (strategyId: string, row: SignalRow | null, asOf = '2026-09-28', date = '2026-09-29'): SymbolBoardRead =>
    ({strategyId: strategyId as SymbolBoardRead['strategyId'], asOf, date, row});

const clean = (text: string, tier: 'copy' | 'advice' = 'copy') => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, tier), text).toEqual([]);
};

describe('buildRulesSee', () => {
    it('is null for a symbol no strategy watches', () => {
        expect(buildRulesSee('ZZZ', strategiesWatching('ZZZ'), [])).toBeNull();
    });

    it('lists each stored row in catalog order, states the shared dates and close once, and names the rest', () => {
        const view = buildRulesSee('NVDA', strategiesWatching('NVDA'), [read('rsi2-mean-reversion', RSI), read('momentum-12-1', MOM)]);
        expect(view).not.toBeNull();
        if (!view) return;
        expect(view.watching).toBe(4);
        expect(view.entries.map((e) => e.strategyId)).toEqual(['momentum-12-1', 'rsi2-mean-reversion']);
        expect(view.stamp).toEqual({asOf: '2026-09-28', date: '2026-09-29'});
        expect(view.entries.every((e) => e.stamp === null)).toBe(true);
        expect(view.shared.map((s) => [s.column.key, s.value])).toEqual([['close', '$181.25']]);
        const rsi = view.entries[1];
        expect(rsi.name).toBe(def('rsi2-mean-reversion').name);
        expect(rsi.state).toBe('enter');
        expect(rsi.cells.map((c) => [c.column.key, c.value])).toEqual([['rsi2', '4.2'], ['sma5', '$186.40'], ['sma200', '$150.30'], ['aboveSma200', 'yes']]);
        expect(view.entries[0].cells.map((c) => [c.column.key, c.value])).toEqual([['momentum', '+84.2%'], ['rank', '#2']]);
        expect(view.missing).toEqual([def('donchian-breakout').name, def('low-volatility').name]);
        // The rule's own narrator reads the row; a single row has no board total to quote.
        expect(rsi.reading.join(' ')).toMatch(/NVDA/);
        expect(view.entries[0].reading.join(' ')).toMatch(/#2/);
        expect(view.entries[0].reading.join(' ')).not.toMatch(/#2 of/);
        // One disclosure's worth of definitions: every shown column's entry, once.
        expect(view.glossary).toEqual(['close', 'momentum-12-1', 'momentum-rank', 'rsi2', 'sma5', 'sma200', 'above-sma200']);
        expect(view.glossary.every(isGlossaryKey)).toBe(true);
    });

    it('keeps dates and values on each row when the rows come from different runs', () => {
        const view = buildRulesSee('NVDA', strategiesWatching('NVDA'), [
            read('rsi2-mean-reversion', RSI),
            read('momentum-12-1', MOM, '2026-09-25', '2026-09-26'),
        ]);
        expect(view?.stamp).toBeNull();
        expect(view?.shared).toEqual([]);
        expect(view?.entries.map((e) => e.stamp)).toEqual([{asOf: '2026-09-25', date: '2026-09-26'}, {asOf: '2026-09-28', date: '2026-09-29'}]);
        expect(view?.entries.every((e) => e.cells[0].column.key === 'close')).toBe(true);
    });

    it('keeps a close that differs between rows on each row', () => {
        const view = buildRulesSee('NVDA', strategiesWatching('NVDA'), [
            read('rsi2-mean-reversion', RSI),
            read('momentum-12-1', {...MOM, values: {...MOM.values, close: 181.3}}),
        ]);
        expect(view?.stamp).not.toBeNull();
        expect(view?.shared).toEqual([]);
        expect(view?.entries.every((e) => e.cells[0].column.key === 'close')).toBe(true);
    });

    it('hoists nothing but the dates from a single row', () => {
        const view = buildRulesSee('NVDA', strategiesWatching('NVDA'), [read('rsi2-mean-reversion', RSI)]);
        expect(view?.stamp).toEqual({asOf: '2026-09-28', date: '2026-09-29'});
        expect(view?.shared).toEqual([]);
        expect(view?.entries[0].cells[0]).toMatchObject({value: '$181.25'});
        expect(view?.missing).toHaveLength(3);
    });

    it('names every strategy once when none has a stored row, a run without the symbol included', () => {
        const view = buildRulesSee('SPY', strategiesWatching('SPY'), [read('sixty-forty', null)]);
        expect(view?.entries).toEqual([]);
        expect(view?.stamp).toBeNull();
        expect(view?.missing).toEqual(['Buy & Hold SPY', '60/40 Quarterly', 'Dual Momentum (GEM)']);
        expect(view?.glossary).toEqual([]);
    });

    it('drops a column the row leaves blank, and reads an excluded row by its note', () => {
        const stale: SignalRow = {symbol: 'NVDA', state: 'excluded', values: {close: null, rsi2: null, sma5: null, sma200: null, aboveSma200: null}, note: 'no fresh bar for 2026-09-28'};
        const view = buildRulesSee('NVDA', strategiesWatching('NVDA'), [read('rsi2-mean-reversion', stale)]);
        expect(view?.entries[0].cells).toEqual([]);
        expect(view?.entries[0].note).toBe('no fresh bar for 2026-09-28');
        expect(view?.entries[0].reading.length).toBeGreaterThan(0);
        expect(view?.glossary).toEqual([]);
    });

    it('ignores a read for a strategy that does not watch the symbol, or for another symbol', () => {
        const view = buildRulesSee('NVDA', strategiesWatching('NVDA'), [
            read('golden-cross', {symbol: 'NVDA', state: 'held', values: {close: 1}}),
            read('rsi2-mean-reversion', {...RSI, symbol: 'AMD'}),
        ]);
        expect(view?.entries).toEqual([]);
        expect(view?.missing).toHaveLength(4);
    });

    it('keeps the panel copy to descriptions', () => {
        const names = ['RSI-2 Mean Reversion', 'Donchian 55/20 Breakout', 'Low Volatility Top 10'];
        for (let n = 1; n <= names.length; n += 1) {
            clean(RULES_SEE_COPY.missing('NVDA', names.slice(0, n)));
            clean(RULES_SEE_COPY.intro('NVDA', n));
        }
        expect(RULES_SEE_COPY.missing('NVDA', names)).toBe('No stored board row for NVDA from RSI-2 Mean Reversion, Donchian 55/20 Breakout or Low Volatility Top 10.');
        expect(RULES_SEE_COPY.intro('SPY', 1)).toContain('1 rule-based strategy;');
        for (const text of [RULES_SEE_COPY.heading, RULES_SEE_COPY.missingAll('NVDA'), RULES_SEE_COPY.stamp('2026-09-28', '2026-09-29'), RULES_SEE_COPY.readingLabel('NVDA')]) {
            clean(text);
        }
    });
});
