import {describe, expect, it} from 'vitest';
import {effectiveVersion, STRATEGIES, STRATEGY_SLUGS, strategyBySlug} from '@/lib/strategies/catalog';
import {DEFAULT_DRIFT_BAND, ENGINE_VERSION} from '@/lib/strategies/config';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import {SECTOR_ETFS, UNIVERSES} from '@/lib/strategies/universe';
import {SECTOR_TO_ETF} from '@/lib/prices/sectors';
import {findBanned} from '@/lib/learn/banned';
import {isGlossaryKey, shortHelp} from '@/lib/learn/glossary';

const EXPECTED_ORDER = [
    'buy-and-hold-spy',
    'sixty-forty',
    'golden-cross',
    'dual-momentum',
    'momentum-12-1',
    'rsi2-mean-reversion',
    'donchian-breakout',
    'low-volatility',
];

const EXPECTED_NAMES = [
    'Buy & Hold SPY',
    '60/40 Quarterly',
    'Golden Cross Sectors',
    'Dual Momentum (GEM)',
    '12-1 Momentum Top 8',
    'RSI-2 Mean Reversion',
    'Donchian 55/20 Breakout',
    'Low Volatility Top 10',
];

// The PaperAccount name field is the binding constraint.
const MAX_NAME_LENGTH = 40;

describe('STRATEGIES', () => {
    it('lists the eight strategies in the plan order with their exact names', () => {
        expect(STRATEGIES.map((def) => def.id)).toEqual(EXPECTED_ORDER);
        expect(STRATEGIES.map((def) => def.name)).toEqual(EXPECTED_NAMES);
        expect(STRATEGY_SLUGS).toEqual(EXPECTED_ORDER);
    });

    it('has unique ids and names, each name short enough for an account', () => {
        expect(new Set(STRATEGIES.map((def) => def.id)).size).toBe(STRATEGIES.length);
        expect(new Set(STRATEGIES.map((def) => def.name)).size).toBe(STRATEGIES.length);
        for (const def of STRATEGIES) expect(def.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    });

    it('points every strategy at an existing universe with usable slots and the shared drift band', () => {
        for (const def of STRATEGIES) {
            expect(UNIVERSES[def.universe]).toBeDefined();
            expect(UNIVERSES[def.universe].length).toBeGreaterThan(0);
            expect(def.slots).toBeGreaterThan(0);
            expect(def.slots).toBeLessThanOrEqual(UNIVERSES[def.universe].length);
            expect(def.driftBand).toBe(DEFAULT_DRIFT_BAND);
            expect(def.version).toBe('1');
        }
    });

    it('pins the sector slots to the navigator sector map so a twelfth sector cannot over-allocate', () => {
        expect([...SECTOR_ETFS]).toEqual(Object.values(SECTOR_TO_ETF));
        expect(strategyBySlug('golden-cross')?.slots).toBe(UNIVERSES.sectors.length);
        expect(strategyBySlug('sixty-forty')?.slots).toBe(UNIVERSES['sixty-forty'].length);
    });

    it('states the survivorship caveat on every large-cap strategy', () => {
        const largeCap = STRATEGIES.filter((def) => def.universe === 'largecaps');
        expect(largeCap.map((def) => def.id)).toEqual([
            'momentum-12-1', 'rsi2-mean-reversion', 'donchian-breakout', 'low-volatility',
        ]);
        for (const def of largeCap) {
            expect(def.explainer.caveats.some((line) => /survivorship/i.test(line))).toBe(true);
        }
        for (const def of STRATEGIES.filter((entry) => entry.universe !== 'largecaps')) {
            expect(def.explainer.caveats.some((line) => /survivorship/i.test(line))).toBe(false);
        }
    });

    it('discloses total-return signals on dual momentum and the reinvestment gap on buy and hold', () => {
        const gem = strategyBySlug('dual-momentum');
        expect(gem?.explainer.caveats.some((line) => /total return/i.test(line))).toBe(true);
        const spy = strategyBySlug('buy-and-hold-spy');
        expect(spy?.explainer.caveats.some((line) => /dividend/i.test(line))).toBe(true);
    });

    it('carries the shared execution caveats on every strategy', () => {
        for (const def of STRATEGIES) {
            const caveats = def.explainer.caveats.join(' ');
            expect(caveats).toMatch(/next session/);
            expect(caveats).toMatch(/whole shares/);
            expect(caveats).toMatch(/dividends/);
            expect(caveats).toMatch(/slippage/);
            for (const line of def.explainer.caveats) {
                expect(findBanned(line, 'copy'), `${def.id} caveat`).toEqual([]);
            }
        }
    });

    // The explainer narrates what a rule does and why it has worked; it may name a
    // mechanism but never pass a verdict on a stock (the 'advice' tier).
    it('explains every rule without a verdict on any stock', () => {
        for (const def of STRATEGIES) {
            const {explainer} = def;
            const prose = [explainer.summary, explainer.watching, explainer.cashReason, ...explainer.how, ...explainer.why, ...explainer.fails].join(' ');
            expect(findBanned(prose, 'advice'), def.id).toEqual([]);
        }
    });

    it('fills every explainer field and never calls anything live', () => {
        for (const def of STRATEGIES) {
            const {explainer} = def;
            for (const text of [explainer.summary, explainer.watching, explainer.beginnerLine, explainer.cashReason]) {
                expect(text.trim().length).toBeGreaterThan(0);
            }
            for (const list of [explainer.how, explainer.why, explainer.fails, explainer.caveats]) {
                expect(list.length).toBeGreaterThan(0);
                for (const line of list) expect(line.trim().length).toBeGreaterThan(0);
            }
            expect(explainer.how.length).toBeGreaterThanOrEqual(3);
            expect(explainer.why.length).toBeGreaterThanOrEqual(2);
            expect(explainer.fails.length).toBeGreaterThanOrEqual(2);
            expect(explainer.cashReason).toMatch(/^In cash/);
            const everything = [
                explainer.summary, ...explainer.how, ...explainer.why, ...explainer.fails,
                explainer.watching, explainer.beginnerLine, explainer.cashReason, ...explainer.caveats,
            ].join(' ');
            expect(everything).not.toMatch(/\blive\b/i);
        }
    });

    it('has unique signal column keys per strategy, always starting with the close', () => {
        for (const def of STRATEGIES) {
            const keys = def.signalColumns.map((column) => column.key);
            expect(new Set(keys).size).toBe(keys.length);
            expect(keys[0]).toBe('close');
            expect(Object.keys(def.params).length).toBeGreaterThan(0);
        }
    });

    it('defines every signal column in the glossary and shows that definition as its help', () => {
        for (const def of STRATEGIES) {
            for (const column of def.signalColumns) {
                expect(column.glossary && isGlossaryKey(column.glossary), `${def.id}.${column.key}`).toBe(true);
                expect(column.help, `${def.id}.${column.key}`).toBe(shortHelp(column.glossary!));
                expect(findBanned(column.help!, 'copy'), `${def.id}.${column.key}`).toEqual([]);
            }
        }
        // The two 'rank' columns mean different things and say so.
        expect(strategyBySlug('momentum-12-1')?.signalColumns.at(-1)?.glossary).toBe('momentum-rank');
        expect(strategyBySlug('low-volatility')?.signalColumns.at(-1)?.glossary).toBe('vol-rank');
    });

    it('keeps the beginner line descriptive — it is shown above every number on the page', () => {
        for (const def of STRATEGIES) {
            expect(findBanned(def.explainer.beginnerLine, 'copy'), def.id).toEqual([]);
            expect(def.explainer.beginnerLine.length).toBeLessThanOrEqual(120);
        }
    });

    it('looks strategies up by slug and versions them under the engine', () => {
        expect(strategyBySlug('golden-cross')?.name).toBe('Golden Cross Sectors');
        expect(strategyBySlug('nope')).toBeUndefined();
        expect(effectiveVersion(STRATEGIES[0])).toBe(`${ENGINE_VERSION}.1`);
    });
});

describe('STRATEGY_RULES', () => {
    it('has exactly one rule per catalog id', () => {
        expect(Object.keys(STRATEGY_RULES).sort()).toEqual([...EXPECTED_ORDER].sort());
        for (const def of STRATEGIES) expect(typeof STRATEGY_RULES[def.id]).toBe('function');
    });
});
