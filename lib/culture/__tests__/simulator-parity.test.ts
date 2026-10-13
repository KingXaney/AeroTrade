// The simulator decides with the live engine on the live inputs builder, and earns through the
// live accrual clock: its first week is decideWeek's answer on the same inputs, and a live
// replay of its fills reproduces its income rows to the cent (invariant 11).

import {describe, expect, it} from 'vitest';
import {CULTURE_RAILS} from '@/lib/culture/config';
import {decideWeek} from '@/lib/culture/engine';
import {isWeekStart, prepareCultureSimulation, simulateCulture} from '@/lib/culture/simulator';
import {addCalendarDays, eachCalendarDay} from '@/lib/dates';
import {createIncomeClock, dividendsByExDate, makeRateLookup, replayIncome} from '@/lib/income/accrual';
import type {HeldPosition} from '@/lib/navigator/allocator';
import type {Bar} from '@/lib/prices/signals';
import type {RatePoint} from '@/lib/prices/types';
import {SESSIONS, baseInput} from './simulator-fixture';

describe('the first week is the engine\'s own decision', () => {
    it('plans the same orders as decideWeek on inputsFor, and fills them at the next open', () => {
        const input = baseInput();
        const sim = simulateCulture(input);
        const spike = sim.variants.find((v) => v.profile === 'spike')!;
        const prepared = prepareCultureSimulation(input);
        const {calendar} = prepared;
        const first = calendar.indexOf(spike.points[0].date) + 1;
        expect(isWeekStart(calendar, first)).toBe(true);
        const asOf = calendar[first - 1];
        const tradeDate = calendar[first];

        const week = prepared.inputsFor(asOf, tradeDate, []);
        const targetable = new Set(week.inputs.map((i) => i.symbol).filter((symbol) => week.quoted.has(symbol)));
        const positions: HeldPosition[] = [...targetable].map((symbol) => ({
            symbol, quantity: 0, avgCost: 0, price: prepared.barIndex.get(symbol)!.byDate.get(asOf)!.close, heldTradingDays: null, thesisBroken: false, score: null,
        }));
        const decision = decideWeek({inputs: week.inputs, feeds: week.feeds, profile: 'spike', book: {totalValue: 100_000, cash: 100_000, positions}, targetable, maxTrades: CULTURE_RAILS.maxPositions});
        expect(decision.orders.length).toBeGreaterThan(0);

        const firstWeek = spike.trades.filter((t) => t.date === tradeDate);
        expect(firstWeek.map((t) => [t.symbol, t.side, t.quantity])).toEqual(decision.orders.map((o) => [o.symbol, o.side, o.quantity]));
        for (const trade of firstWeek) {
            expect(trade.price).toBe(input.bars.get(trade.symbol)!.find((bar) => bar.date === tradeDate)!.open);
            expect(trade.reason).toBe(decision.orders.find((o) => o.symbol === trade.symbol)!.reason);
        }
    });
});

describe('income parity — the simulator and the live replay', () => {
    const rates: RatePoint[] = eachCalendarDay(addCalendarDays(SESSIONS[0], -10), SESSIONS[SESSIONS.length - 1])
        .map((date) => ({date, discountPct: date < SESSIONS[600] ? 4.0 : 4.6}));

    const withDividends = (bars: Bar[], every: number, perShare: number): Bar[] =>
        bars.map((bar, i) => (i > 0 && i % every === 0 ? {...bar, dividend: perShare} : bar));

    const liveReplayOf = (variant: ReturnType<typeof simulateCulture>['variants'][number], bars: ReadonlyMap<string, readonly Bar[]>) => {
        const dividends = [...bars].flatMap(([symbol, series]) =>
            series.filter((b) => (b.dividend ?? 0) > 0).map((b) => ({symbol, exDate: b.date, perShare: b.dividend as number})));
        return replayIncome({
            from: variant.from,
            // The simulator has closed every day before its last trade date.
            to: addCalendarDays(variant.to, -1),
            startCash: 100_000,
            startHoldings: new Map(),
            trades: variant.trades.map((t) => ({date: t.date, symbol: t.symbol, side: t.side, quantity: t.quantity, total: t.total})),
            clock: createIncomeClock({rateOn: makeRateLookup(rates), dividends: dividendsByExDate(dividends)}),
        });
    };

    it('credits interest and every dividend identically, for every variant', () => {
        const input = baseInput();
        input.rates = rates;
        input.bars.set('BBB', withDividends(input.bars.get('BBB')!, 60, 1.25));
        input.bars.set('EEE', withDividends(input.bars.get('EEE')!, 45, 0.4));
        const sim = simulateCulture(input);
        for (const variant of sim.variants) {
            expect(variant.income.length, variant.profile).toBeGreaterThan(0);
            expect(variant.income.some((row) => row.kind === 'dividend'), variant.profile).toBe(true);
            const live = liveReplayOf(variant, input.bars).rows;
            expect(variant.income.map((r) => `${r.date} ${r.kind} ${r.symbol}`), variant.profile).toEqual(live.map((r) => `${r.date} ${r.kind} ${r.symbol}`));
            variant.income.forEach((row, i) => expect(row.amount).toBeCloseTo(live[i].amount, 9));
        }
    });

    it('lets the income reach the equity curve: with rates the curve ends above the price-only run', () => {
        const withIncome = simulateCulture({...baseInput(), rates});
        const without = simulateCulture(baseInput());
        for (const variant of withIncome.variants) {
            const twin = without.variants.find((v) => v.profile === variant.profile)!;
            expect(twin.income).toEqual([]);
            expect(variant.points.at(-1)!.value).toBeGreaterThan(twin.points.at(-1)!.value);
        }
    });
});
