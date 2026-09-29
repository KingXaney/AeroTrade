import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {LESSON_COPY, lessonCountLine, lessonLearnHref, momentCopy} from '@/lib/learn/copy/lesson';
import type {Moment} from '@/lib/learn/moments';
import {STRATEGIES} from '@/lib/strategies/catalog';

const fills = [
    {date: '2026-09-22', symbol: 'SPY', side: 'buy' as const, quantity: 3, price: 500},
    {date: '2026-09-22', symbol: 'BRK.B', side: 'buy' as const, quantity: 1, price: 412.37},
    {date: '2026-09-22', symbol: 'AAPL', side: 'sell' as const, quantity: 2.5, price: 187.1},
];
const sells = [
    {date: '2026-09-25', symbol: 'SPY', quantity: 1, price: 510, realizedPnl: 10},
    {date: '2026-09-25', symbol: 'NVDA', quantity: 4, price: 98.5, realizedPnl: -42.18},
    {date: '2026-09-25', symbol: 'MSFT', quantity: 2, price: 400, realizedPnl: null},
    {date: '2026-09-25', symbol: 'KO', quantity: 2, price: 60, realizedPnl: 0},
];
const dividends = [
    {date: '2026-09-28', symbol: 'SPY', amount: 18.89, perShare: 1.889, quantity: 10, exDate: '2026-09-23'},
    {date: '2026-09-28', symbol: 'KO', amount: 0.97, perShare: null, quantity: null, exDate: null},
];
const drawdowns = [
    {date: '2026-09-26', peakDate: '2026-09-23', peakValue: 102_000, value: 96_000, pct: 1 - 96_000 / 102_000},
    {date: '2026-01-02', peakDate: '2025-12-30', peakValue: 100_000, value: 80_000, pct: 0.2},
];

const moments: Moment[] = [
    ...fills.map((fill): Moment => ({kind: 'first-fill', id: 'first-fill', occurredOn: fill.date, fill})),
    ...sells.map((sell): Moment => ({kind: 'first-sell', id: 'first-sell', occurredOn: sell.date, sell})),
    ...dividends.map((dividend): Moment => ({kind: 'first-dividend', id: 'first-dividend', occurredOn: dividend.date, dividend})),
    ...drawdowns.map((drawdown): Moment => ({kind: 'first-drawdown', id: 'first-drawdown', occurredOn: drawdown.date, drawdown})),
    ...STRATEGIES.filter((def) => def.cadence !== 'daily').flatMap((def) => [true, false].map((traded): Moment => ({
        kind: 'rebalance', id: {kind: 'rebalance', strategyId: def.id, date: '2026-09-28'}, occurredOn: '2026-09-28',
        rebalance: {strategyId: def.id, date: '2026-09-28', traded},
    }))),
];

const allText = (moment: Moment): string => {
    const copy = momentCopy(moment);
    return [copy.label, copy.title, copy.figure, ...copy.body, copy.linkLabel].join(' ');
};

describe('momentCopy', () => {
    it('describes and never advises, on every kind and input', () => {
        for (const moment of moments) {
            expect(findBanned(allText(moment), 'copy'), allText(moment)).toEqual([]);
        }
    });

    it('gives every moment a title, a figure, two or three sentences, known terms and an in-app link', () => {
        for (const moment of moments) {
            const copy = momentCopy(moment);
            expect(copy.title.trim()).not.toBe('');
            expect(copy.figure.trim()).not.toBe('');
            expect(copy.body.length).toBeGreaterThanOrEqual(2);
            expect(copy.body.length).toBeLessThanOrEqual(3);
            expect(copy.terms.length).toBeGreaterThan(0);
            for (const term of copy.terms) expect(GLOSSARY[term], term).toBeDefined();
            expect(copy.href).toMatch(/^\/[a-z0-9/#-]*$/);
        }
    });

    it('reads a fill and a sell from the row', () => {
        expect(momentCopy(moments[0]).figure).toBe('Bought 3 SPY at $500.00 · Sep 22');
        expect(momentCopy(moments[2]).figure).toBe('Sold 2.5 AAPL at $187.10 · Sep 22');
        expect(momentCopy(moments[3]).figure).toBe('Sold 1 SPY at $510.00 · realized +$10.00 · Sep 25');
        expect(momentCopy(moments[4]).figure).toBe('Sold 4 NVDA at $98.50 · realized −$42.18 · Sep 25');
        expect(momentCopy(moments[5]).figure).toBe('Sold 2 MSFT at $400.00 · Sep 25');
    });

    it('prints a dividend\'s own arithmetic, to the tenth of a cent', () => {
        const spy = momentCopy(moments[7]);
        expect(spy.figure).toBe('SPY: 10 shares × $1.889 = $18.89 · paid Sep 28');
        expect(spy.body.join(' ')).toContain('Sep 23');
        expect(momentCopy(moments[8]).figure).toBe('KO: $0.97 · paid Sep 28');
    });

    it('dates a drawdown and states the rise back to the old high', () => {
        const copy = momentCopy(moments[9]);
        expect(copy.title).toBe('Your account\'s first 5% drop');
        expect(copy.figure).toBe('−5.9% from the Sep 23 high of $102,000.00 · Sep 26');
        expect(copy.body.join(' ')).toMatch(/\+6\.3% to get back/);
        expect(momentCopy(moments[10]).body.join(' ')).toMatch(/\+25\.0% to get back/);
        expect(momentCopy(moments[10]).figure).toContain('Dec 30, 2025');
    });

    it('describes a rebalance by cadence and outcome, never by the beginner line', () => {
        for (const moment of moments.filter((m) => m.kind === 'rebalance')) {
            if (moment.kind !== 'rebalance') continue;
            const def = STRATEGIES.find((d) => d.id === moment.rebalance.strategyId)!;
            const text = allText(moment);
            expect(text).toContain(def.name);
            expect(text.includes(def.explainer.beginnerLine), def.id).toBe(false);
            for (const clause of def.explainer.beginnerLine.split(/[.;—]/).map((s) => s.trim()).filter((s) => s.length > 12)) {
                expect(text.includes(clause), `${def.id}: ${clause}`).toBe(false);
            }
            expect(momentCopy(moment).href).toBe(`/strategies/${def.id}`);
            expect(text).toMatch(moment.rebalance.traded ? /placed orders/ : /left every holding as it was/);
        }
        const monthly = moments.find((m) => m.kind === 'rebalance' && m.rebalance.strategyId === 'momentum-12-1')!;
        expect(momentCopy(monthly).body.join(' ')).toMatch(/first trading day of each month/);
        expect(momentCopy(monthly).body.join(' ')).toMatch(/next check: first trading day of October 2026/i);
        const quarterly = moments.find((m) => m.kind === 'rebalance' && m.rebalance.strategyId === 'sixty-forty')!;
        expect(momentCopy(quarterly).body.join(' ')).toMatch(/each quarter/);
    });
});

describe('LESSON_COPY', () => {
    it('describes and never advises', () => {
        const strings = [...Object.values(LESSON_COPY), lessonCountLine(1), lessonCountLine(7)];
        for (const text of strings) expect(findBanned(text, 'copy'), text).toEqual([]);
    });

    it('counts articles in words that agree with the number', () => {
        expect(lessonCountLine(1)).toBe('1 of today\'s articles in your topics used this term');
        expect(lessonCountLine(4)).toBe('4 of today\'s articles in your topics used this term');
    });

    it('links a concept to its /learn entry', () => {
        expect(lessonLearnHref('fomc')).toBe('/learn#fomc');
        expect(lessonLearnHref('s&p 500')).toBe('/learn#s%26p%20500');
    });
});
