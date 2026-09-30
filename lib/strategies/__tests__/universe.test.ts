// strategiesWatching: which strategies put a symbol on their signal board. It is what lets
// the stock page render keyless for a symbol in the universe, and it bounds the page's
// board read — one index seek per watching strategy — so the fan-out is pinned here.

import {describe, expect, it} from 'vitest';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {ALL_STRATEGY_SYMBOLS, LARGE_CAPS, SECTOR_ETFS, strategiesWatching, UNIVERSES} from '@/lib/strategies/universe';

const ids = (symbol: string) => strategiesWatching(symbol).map((def) => def.id);

describe('strategiesWatching', () => {
    it('names the three strategies that watch SPY, in catalog order', () => {
        expect(ids('SPY')).toEqual(['buy-and-hold-spy', 'sixty-forty', 'dual-momentum']);
    });

    it('names the four large-cap strategies for a large cap, whatever the case or padding', () => {
        const largeCap = ['momentum-12-1', 'rsi2-mean-reversion', 'donchian-breakout', 'low-volatility'];
        expect(ids('NVDA')).toEqual(largeCap);
        expect(ids(' nvda ')).toEqual(largeCap);
        for (const symbol of LARGE_CAPS) expect(ids(symbol)).toEqual(largeCap);
    });

    it('names the golden cross for a sector fund and dual momentum for its other legs', () => {
        for (const symbol of SECTOR_ETFS) expect(ids(symbol)).toEqual(['golden-cross']);
        expect(ids('AGG')).toEqual(['sixty-forty', 'dual-momentum']);
        expect(ids('EFA')).toEqual(['dual-momentum']);
        expect(ids('BIL')).toEqual(['dual-momentum']);
    });

    it('is empty outside every universe', () => {
        for (const symbol of ['ZZZ', 'ZZZZNOTREAL', '', '   ', 'QQQ', 'nvda.x']) expect(ids(symbol)).toEqual([]);
    });

    it('agrees with each strategy\'s own universe, and never fans out past four', () => {
        for (const symbol of ALL_STRATEGY_SYMBOLS) {
            const watching = strategiesWatching(symbol);
            expect(watching.length).toBeLessThanOrEqual(4);
            expect(watching.map((def) => def.id)).toEqual(
                STRATEGIES.filter((def) => UNIVERSES[def.universe].includes(symbol)).map((def) => def.id),
            );
        }
    });
});
