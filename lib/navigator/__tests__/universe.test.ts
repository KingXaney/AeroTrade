import {describe, expect, it} from "vitest";
import {navigatorTargets, selectNavigatorUniverse} from "@/lib/navigator/universe";
import {ALWAYS_ELIGIBLE_SYMBOLS} from "@/lib/navigator/config";

const nav = {userId: 'u1', accountId: 'navAcct'};

describe('selectNavigatorUniverse', () => {
    it('scores the Navigator account\'s holdings but never the owner\'s other accounts', () => {
        const universe = selectNavigatorUniverse({
            navigators: [nav],
            accounts: [
                {id: 'navAcct', userId: 'u1', symbols: ['NVDA']},
                {id: 'manualAcct', userId: 'u1', symbols: ['ZZZZ']},
            ],
            topTickers: ['AAPL'],
        });
        expect(universe.symbols).toContain('NVDA');
        expect(universe.symbols).not.toContain('ZZZZ');
    });

    it('ignores an account whose id matches but whose owner is not the enrolled user', () => {
        const universe = selectNavigatorUniverse({
            navigators: [nav],
            accounts: [{id: 'navAcct', userId: 'someoneElse', symbols: ['ZZZZ']}],
            topTickers: [],
        });
        expect(universe.symbols).not.toContain('ZZZZ');
    });

    it('makes only the always-eligible ETFs and the top tickers targetable', () => {
        const universe = selectNavigatorUniverse({
            navigators: [nav],
            accounts: [{id: 'navAcct', userId: 'u1', symbols: ['nvda', 'XLK']}],
            topTickers: ['AAPL'],
        });
        expect(universe.targetable).toEqual([...ALWAYS_ELIGIBLE_SYMBOLS, 'AAPL']);
        expect(universe.symbols).toEqual([...ALWAYS_ELIGIBLE_SYMBOLS, 'AAPL', 'NVDA']);
    });
});

describe('navigatorTargets', () => {
    const scored = (symbol: string, score: number) => ({symbol, score, eligible: true, reasons: []});

    it('never targets a symbol that is only held, however well it scores', () => {
        const universe = {symbols: ['AAPL', 'NVDA'], targetable: ['AAPL']};
        const targets = navigatorTargets([scored('NVDA', 0.9), scored('AAPL', 0.5)], universe);
        expect(targets.map((t) => t.symbol)).toEqual(['AAPL']);
    });

    it('still targets a held symbol that is otherwise eligible', () => {
        const universe = {symbols: ['XLK'], targetable: ['XLK']};
        expect(navigatorTargets([scored('XLK', 0.5)], universe).map((t) => t.symbol)).toEqual(['XLK']);
    });
});
