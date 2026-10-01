// Every number the catalog's prose states about a rule comes from that rule's parameters
// (CATALOG_PARAMS) or from the rails in lib/strategies/config: a moved parameter moves the
// explainer and the board's labels with it. What stays spelled out — the names, the board's
// stored value keys and the glossary entries those keys point at — is held equal to the params.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildStrategies, CATALOG_PARAMS, STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import {UNIVERSES} from '@/lib/strategies/universe';
import {GLOSSARY} from '@/lib/learn/glossary';
import {numberWord} from '@/lib/text';
import type {StrategyDefinition, StrategyId} from '@/lib/strategies/types';

const prose = (def: StrategyDefinition): string => {
    const {explainer} = def;
    return [
        explainer.summary, explainer.watching, explainer.beginnerLine, explainer.cashReason,
        ...explainer.how, ...explainer.why, ...explainer.fails, ...explainer.caveats,
        ...def.signalColumns.map((column) => column.label),
    ].join('\n');
};

const defOf = (defs: readonly StrategyDefinition[], id: StrategyId): StrategyDefinition => {
    const def = defs.find((entry) => entry.id === id);
    if (!def) throw new Error(id);
    return def;
};

describe('buildStrategies', () => {
    it('is the catalog for CATALOG_PARAMS, and each def carries its own params', () => {
        expect(buildStrategies()).toEqual(STRATEGIES);
        for (const def of STRATEGIES) expect(def.params).toEqual(CATALOG_PARAMS[def.id]);
    });

    it('moves every stated parameter with the params', () => {
        const moved = buildStrategies({
            ...CATALOG_PARAMS,
            'buy-and-hold-spy': {allocation: 0.97},
            'sixty-forty': {spyWeight: 0.7, aggWeight: 0.3},
            'golden-cross': {fast: 40, slow: 150},
            'dual-momentum': {lookback: 126},
            'momentum-12-1': {lookback: 189, skip: 42, top: 6},
            'rsi2-mean-reversion': {rsiPeriod: 3, entryRsi: 15, exitSma: 7, trendSma: 150},
            'donchian-breakout': {entryChannel: 40, exitChannel: 15},
            'low-volatility': {volWindow: 42, top: 12},
        });
        const expectations: Record<StrategyId, {now: string[]; gone: RegExp}> = {
            'buy-and-hold-spy': {now: ['puts 97% of the account into SPY'], gone: /99% of the account/},
            'sixty-forty': {now: ['70% stocks (SPY), 30% bonds (AGG)', 'which is 69.3% and 29.7% of equity', '70/30 lags'], gone: /\b60%|\b40%|59\.4|39\.6|60\/40/},
            'golden-cross': {now: ['its 40-day average is above its 150-day average', 'SMA40 vs SMA150', 'a 150-day average confirms'], gone: /\b50\b|\b200\b/},
            'dual-momentum': {now: ['6-month (126-bar) total returns', '6m total return', 'a 6-month lookback'], gone: /12-month|252/},
            'momentum-12-1': {now: ['buys the six large caps', '189 trading days ago to 42 trading days ago (9-2 momentum)', 'The top 6 each get 16.5% of equity (99% ÷ 6)', 'fewer than 190 bars', 'reshuffle of six names', '9-2 return'], gone: /\b8\b|eight|12-1|253|\b252\b/},
            'rsi2-mean-reversion': {now: ['RSI-3', 'sharp three-day dip', 'the 7-day and the 150-day', 'RSI(3) below 15', 'close above SMA7', 'Above SMA150'], gone: /RSI\(2\)|two-day|SMA5\b|SMA200|below 10\b/},
            'donchian-breakout': {now: ['above its 40-day high', 'below its 15-day low', 'prior 40 bars', 'needs 41 bars', 'vs 40-day high', '15-day low'], gone: /\b55\b|\b20-day|\b56\b/},
            'low-volatility': {now: ['holds the twelve large caps', '42-day realised volatility', 'The 12 least volatile each get 8.3% of equity (99% ÷ 12)', 'drops out of the twelve', 'fewer than 43 bars', 'the calm twelve', '42-day vol'], gone: /\b63\b|\b64\b|\bten\b|\b10 least/},
        };
        for (const [id, {now, gone}] of Object.entries(expectations) as [StrategyId, {now: string[]; gone: RegExp}][]) {
            const text = prose(defOf(moved, id));
            for (const phrase of now) expect(text, `${id}: ${phrase}`).toContain(phrase);
            expect(text, id).not.toMatch(gone);
        }
        expect(defOf(moved, 'momentum-12-1').slots).toBe(6);
        expect(defOf(moved, 'low-volatility').slots).toBe(12);
    });
});

describe('the rails the catalog quotes', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/strategies/config');
        vi.resetModules();
    });

    it('moves the cash floor and the drift band with lib/strategies/config', async () => {
        vi.resetModules();
        vi.doMock('@/lib/strategies/config', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/strategies/config')>();
            return {...original, CASH_FLOOR: 0.02, DEFAULT_DRIFT_BAND: 0.03, slotWeight: (slots: number) => 0.98 / slots};
        });
        const mocked = await import('@/lib/strategies/catalog');
        const text = mocked.STRATEGIES.map(prose).join('\n');
        for (const phrase of ['keeps a 2% cash floor', 'of the invested 98%, which is 58.8% and 39.2% of equity', 'more than 3% of equity from target',
            'equal slot of 8.9% of equity (98% ÷ 11)', 'beyond the 3% band', '12.3% of equity (98% ÷ 8)', 'Up to 5 positions of 19.6% of equity each (98% ÷ 5)',
            'past the 3% drift band', 'The 2% cash floor makes the actual targets 58.8% and 39.2%', 'The chosen ETF gets 98% of equity']) {
            expect(text, phrase).toContain(phrase);
        }
        // Buy & hold's 99% is its own parameter (allocation), not the floor.
        expect(text).not.toMatch(/invested 99%|\(99% ÷|gets 99% of equity|\b2% drift|\b2% band|\b1% cash floor/);
    });
});

describe('what stays spelled out', () => {
    const p = CATALOG_PARAMS;

    it('names each strategy with its own parameters', () => {
        const name = (id: StrategyId) => strategyBySlug(id)?.name ?? '';
        expect(name('sixty-forty')).toContain(`${p['sixty-forty'].spyWeight * 100}/${p['sixty-forty'].aggWeight * 100}`);
        expect(name('momentum-12-1')).toContain(`${p['momentum-12-1'].lookback / 21}-${p['momentum-12-1'].skip / 21} Momentum Top ${p['momentum-12-1'].top}`);
        expect(name('rsi2-mean-reversion')).toContain(`RSI-${p['rsi2-mean-reversion'].rsiPeriod}`);
        expect(name('donchian-breakout')).toContain(`Donchian ${p['donchian-breakout'].entryChannel}/${p['donchian-breakout'].exitChannel}`);
        expect(name('low-volatility')).toContain(`Top ${p['low-volatility'].top}`);
        expect(1 - p['buy-and-hold-spy'].allocation).toBeCloseTo(0.01, 10);
    });

    it('keys the board\'s stored values by the parameters the rules compute them with', () => {
        const keys = (id: StrategyId) => strategyBySlug(id)?.signalColumns.map((column) => column.key) ?? [];
        expect(keys('golden-cross')).toEqual(expect.arrayContaining([`sma${p['golden-cross'].fast}`, `sma${p['golden-cross'].slow}`]));
        expect(keys('rsi2-mean-reversion')).toEqual(expect.arrayContaining([
            `rsi${p['rsi2-mean-reversion'].rsiPeriod}`, `sma${p['rsi2-mean-reversion'].exitSma}`, `sma${p['rsi2-mean-reversion'].trendSma}`,
            `aboveSma${p['rsi2-mean-reversion'].trendSma}`,
        ]));
        expect(keys('donchian-breakout')).toEqual(expect.arrayContaining([`high${p['donchian-breakout'].entryChannel}`, `low${p['donchian-breakout'].exitChannel}`]));
        expect(keys('low-volatility')).toContain(`vol${p['low-volatility'].volWindow}`);
        expect(keys('dual-momentum')).toContain(`r${p['dual-momentum'].lookback / 21}`);
    });

    it('defines those keys in the glossary with the same numbers', () => {
        const cross = p['golden-cross'];
        expect(GLOSSARY.sma50.short).toContain(`last ${cross.fast} closes`);
        expect(GLOSSARY.sma200.short).toContain(`last ${cross.slow} closes`);
        expect(GLOSSARY.sma200.short).toContain(`last ${p['rsi2-mean-reversion'].trendSma} closes`);
        expect(GLOSSARY.sma5.short).toContain(`last ${numberWord(p['rsi2-mean-reversion'].exitSma)} closes`);
        expect(GLOSSARY.rsi2.short).toContain(`A ${numberWord(p['rsi2-mean-reversion'].rsiPeriod)}-day relative strength index`);
        expect(GLOSSARY.high55.term).toBe(`${p['donchian-breakout'].entryChannel}-day high`);
        expect(GLOSSARY.high55.short).toContain(`last ${p['donchian-breakout'].entryChannel} sessions`);
        expect(GLOSSARY.high55.long).toContain(`past ${numberWord(p['donchian-breakout'].entryChannel / 5)} weeks`);
        expect(GLOSSARY.low20.term).toBe(`${p['donchian-breakout'].exitChannel}-day low`);
        expect(GLOSSARY.low20.short).toContain(`last ${p['donchian-breakout'].exitChannel} sessions`);
        expect(GLOSSARY['vs-high'].term).toBe(`vs ${p['donchian-breakout'].entryChannel}-day high`);
        expect(GLOSSARY.vol63.short).toContain(`last ${p['low-volatility'].volWindow} daily log returns`);
        expect(GLOSSARY['momentum-12-1'].formula).toBe(`close[t−${p['momentum-12-1'].skip}] / close[t−${p['momentum-12-1'].lookback}] − 1`);
        expect(GLOSSARY['momentum-rank'].short).toContain(`the top ${numberWord(p['momentum-12-1'].top)} are held`);
        expect(GLOSSARY['vol-rank'].short).toContain(`the ${numberWord(p['low-volatility'].top)} lowest are held`);
        for (const key of ['momentum-rank', 'vol-rank'] as const) {
            expect(GLOSSARY[key].short).toContain(`among the ${numberWord(UNIVERSES.largecaps.length)} large caps`);
        }
        expect(GLOSSARY.target.long).toContain(`${p['sixty-forty'].spyWeight * 100}% and ${p['sixty-forty'].aggWeight * 100}% of the 99%`);
        expect(GLOSSARY.benchmark.long).toContain(`one of the ${numberWord(STRATEGIES.length)} strategies`);
    });

    it('sizes the explainers\' universes as the universe lists do', () => {
        expect(strategyBySlug('golden-cross')?.explainer.summary).toContain(`the ${numberWord(UNIVERSES.sectors.length)} S&P sector ETFs`);
        for (const id of ['momentum-12-1', 'rsi2-mean-reversion'] as const) {
            expect(prose(defOf(STRATEGIES, id))).toMatch(new RegExp(`\\b${UNIVERSES.largecaps.length}-(stock|name) universe`));
        }
        expect(strategyBySlug('donchian-breakout')?.explainer.caveats.join(' ')).toContain(`The ${UNIVERSES.largecaps.length}-name list`);
    });
});
