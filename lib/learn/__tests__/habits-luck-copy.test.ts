// Copy for the /portfolio "Trading habits" and "Luck or skill" panels. Every sentence is rendered
// on a grid of inputs and held to the 'copy' tier of lib/learn/banned.ts: these are measurements
// ("landed above 62%", never "beat"). The printed figures are parsed back and checked against
// each other: a share against its counts, a difference against the two amounts it sits between.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {daysHeld, HABITS_COPY, lotShare, turnoverShare} from '@/lib/learn/copy/habits';
import {landedShare, LUCK_COPY} from '@/lib/learn/copy/luck';
import {cadenceControls, type Habits} from '@/lib/trading/habits';
import {histogram, type LuckReady} from '@/lib/learn/random-portfolios';
import {STRATEGIES} from '@/lib/strategies/catalog';

const clean = (text: string | null) => {
    expect(text, String(text)).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text ?? '', 'copy'), String(text)).toEqual([]);
};

const cents = (printed: string): number => Math.round(Number(printed.replace(/[$,+−]/g, '')) * 100) * (printed.startsWith('−') ? -1 : 1);

const habits = (patch: Partial<Habits> = {}): Habits => ({
    closedLots: 5,
    hold: {winnerDays: 3.4, loserDays: 12, winners: 2, losers: 3},
    sold: {winners: {sold: 2, total: 3}, losers: {sold: 1, total: 5}, unpricedOpen: 1},
    pace: {fills: 9, days: 6, windowDays: 30, sessions: 21, since: '2026-08-29', full: true},
    turnover: {soldCents: 575_000, startingCents: 10_000_000},
    hadYouHeld: {soldForCents: 300_000, worthNowCents: 340_050, symbols: ['MSFT', 'AAPL'], capped: false},
    ...patch,
});

describe('Trading habits copy', () => {
    it('writes days held in plain words', () => {
        expect(daysHeld(null)).toBe('—');
        expect(daysHeld(0.2)).toBe('under a day');
        expect(daysHeld(1.2)).toBe('1 day');
        expect(daysHeld(2.5)).toBe('3 days');
    });

    it('prints "sold 67% of winners · 20% of losers", and the counts beside it reproduce each share', () => {
        const grid: Habits['sold'][] = [
            habits().sold,
            {winners: {sold: 0, total: 4}, losers: {sold: 3, total: 3}, unpricedOpen: 0},
            {winners: {sold: 1, total: 1}, losers: {sold: 0, total: 0}, unpricedOpen: 2},
            {winners: {sold: 7, total: 9}, losers: {sold: 2, total: 11}, unpricedOpen: 0},
        ];
        expect(HABITS_COPY.soldValue(habits().sold)).toBe('sold 67% of winners · 20% of losers');
        for (const sold of grid) {
            const value = HABITS_COPY.soldValue(sold);
            const hint = HABITS_COPY.soldHint(sold);
            clean(value);
            clean(hint);
            const shares = /^sold (\d+%|—) of winners · (\d+%|—) of losers$/.exec(value);
            const counts = /^(\d+) of (\d+) lots? up · (\d+) of (\d+) lots? down$/.exec(hint);
            expect(shares && counts, `${value} | ${hint}`).toBeTruthy();
            if (!shares || !counts) continue;
            const pct = (a: string, b: string) => (Number(b) > 0 ? `${Math.round((Number(a) / Number(b)) * 100)}%` : '—');
            expect(shares[1]).toBe(pct(counts[1], counts[2]));
            expect(shares[2]).toBe(pct(counts[3], counts[4]));
        }
        expect(lotShare({sold: 0, total: 0})).toBe('—');
    });

    it('states the unpriced open lots once, and nothing when every open lot is priced', () => {
        expect(HABITS_COPY.unpricedOpen(0)).toBeNull();
        expect(HABITS_COPY.unpricedOpen(1)).toBe('1 open lot without a live quote left out of winners and losers');
        clean(HABITS_COPY.unpricedOpen(3));
    });

    it('prints turnover whose share reproduces from the two printed amounts', () => {
        for (const soldCents of [0, 3_000, 575_000, 12_345_678, 9_999_999]) {
            const turnover = {soldCents, startingCents: 10_000_000};
            const value = HABITS_COPY.turnoverValue(turnover);
            const hint = HABITS_COPY.turnoverHint(turnover);
            clean(value);
            clean(hint);
            const m = /^(under 1%|\d+%) of the (\$[\d,]+\.\d{2}) starting balance, same days$/.exec(hint);
            expect(m, hint).toBeTruthy();
            if (!m) continue;
            const ratio = cents(value) / cents(m[2]) * 100;
            expect(m[1]).toBe(Math.round(ratio) === 0 && cents(value) > 0 ? 'under 1%' : `${Math.round(ratio)}%`);
        }
        expect(turnoverShare({soldCents: 1, startingCents: 0})).toBe('—');
    });

    it('prints "had you held" so that worth now minus sold for is the printed difference, to the cent', () => {
        for (const [soldForCents, worthNowCents] of [[300_000, 340_050], [512_345, 498_000], [100, 100], [1_234_567, 1_234_568]]) {
            const held = {soldForCents, worthNowCents, symbols: ['AAPL'], capped: false};
            const value = HABITS_COPY.heldValue(held);
            const hint = HABITS_COPY.heldHint(held);
            clean(value);
            clean(hint);
            const now = /^(\$[\d,]+\.\d{2}) now$/.exec(value);
            const parts = /^sold for (\$[\d,]+\.\d{2}) · ([+−]?\$[\d,]+\.\d{2}) at the last quote$/.exec(hint);
            expect(now && parts, `${value} | ${hint}`).toBeTruthy();
            if (!now || !parts) continue;
            expect(cents(now[1]) - cents(parts[1])).toBe(cents(parts[2]));
        }
        expect(HABITS_COPY.heldScope({soldForCents: 1, worthNowCents: 1, symbols: ['MSFT', 'AAPL'], capped: true}))
            .toBe('the most recent names sold: MSFT, AAPL');
    });

    it('sets the pace beside the catalog\'s cadences only', () => {
        const line = HABITS_COPY.cadenceLine(cadenceControls(STRATEGIES), 21);
        expect(line).toBe("Beside the strategies' clocks: 3 daily rules on any of these 21 sessions · 3 monthly rules on 1 day a month · 1 quarterly rule on 1 day a quarter · 1 buy-once rule on its first day only");
        clean(line);
        // no holding period the catalog does not define
        expect(line).not.toMatch(/year|week|long-term|short-term/i);
        clean(HABITS_COPY.cadenceLine([{cadence: 'once', names: ['A', 'B']}], 1));
    });

    it('renders every habits sentence clean across the grid', () => {
        const grid = [
            habits(),
            habits({hold: {winnerDays: null, loserDays: 0.3, winners: 0, losers: 4}}),
            habits({pace: {fills: 1, days: 1, windowDays: 12, sessions: 8, since: '2026-09-16', full: false}}),
        ];
        for (const h of grid) {
            for (const text of [
                HABITS_COPY.holdValue(h.hold), HABITS_COPY.holdHint(h.hold), HABITS_COPY.paceValue(h.pace), HABITS_COPY.paceHint(h.pace),
                HABITS_COPY.heldScope(h.hadYouHeld ?? {soldForCents: 0, worthNowCents: 0, symbols: ['X'], capped: false}),
            ]) clean(text);
        }
        expect(HABITS_COPY.paceHint(grid[2].pace)).toBe('since Sep 16');
        expect(HABITS_COPY.paceValue(grid[2].pace)).toBe('1 fill on 1 day');
        for (const text of [HABITS_COPY.heading, HABITS_COPY.emptyTitle, HABITS_COPY.emptyDescription(0), HABITS_COPY.emptyDescription(2),
            HABITS_COPY.holdLabel, HABITS_COPY.soldLabel, HABITS_COPY.paceLabel, HABITS_COPY.turnoverLabel, HABITS_COPY.heldLabel, HABITS_COPY.method]) clean(text);
    });
});

const ready = (patch: Partial<LuckReady> = {}): LuckReady => ({
    status: 'ready', start: '2026-08-14', end: '2026-10-02', sessions: 34, count: 1000, size: 5, pool: 40,
    spyPct: 2.04, medianPct: 1.5, yours: {pct: 3.1, below: 623, rankPct: 62}, withheld: null,
    histogram: histogram([-4, 0, 1, 2, 6], 24), ...patch,
});

describe('Luck or skill copy', () => {
    it('says "landed above 62% of 1,000 random five-stock portfolios over the same 34 trading days"', () => {
        const view = ready();
        expect(LUCK_COPY.landed({...view, yours: view.yours ?? {pct: 0, below: 0, rankPct: 0}}))
            .toBe('Your return landed above 62% of 1,000 random five-stock portfolios over the same 34 trading days');
    });

    it('prints a rank that reproduces from the counts, never rounded up, with "all" and "none" at the ends', () => {
        for (const below of [0, 1, 9, 10, 499, 623, 999, 1000]) {
            const yours = {pct: 1, below, rankPct: Math.floor((below / 1000) * 100)};
            const text = LUCK_COPY.landed({count: 1000, size: 5, sessions: 34, yours});
            clean(text);
            expect(text).not.toMatch(/\bbeat/i);
            const m = /^Your return landed above (all|none of the|(\d+)% of|(\d+) of the) ([\d,]+) random five-stock portfolios over the same (\d+) trading days$/.exec(text);
            expect(m, text).toBeTruthy();
            if (!m) continue;
            const count = Number(m[4].replace(/,/g, ''));
            if (m[1] === 'all') expect(below).toBe(count);
            else if (m[1] === 'none of the') expect(below).toBe(0);
            else if (m[3] !== undefined) {
                expect(Number(m[3])).toBe(below);
                expect(Math.floor((below / count) * 100)).toBe(0);
            } else {
                expect(Number(m[2])).toBe(Math.floor((below / count) * 100));
                expect(below).toBeGreaterThan(0);
                expect(below).toBeLessThan(count);
            }
        }
        expect(landedShare({below: 996, rankPct: 99}, 1000)).toBe('above 99% of 1,000');
        expect(landedShare({below: 7, rankPct: 0}, 1000)).toBe('above 7 of the 1,000');
    });

    it('keeps the sample sentence, the markers and the window clean', () => {
        const view = ready();
        for (const text of [
            LUCK_COPY.sampleOnly(view), LUCK_COPY.noSnapshot, LUCK_COPY.window(view), LUCK_COPY.chartLabel(view),
            LUCK_COPY.method(view), LUCK_COPY.markerValue(LUCK_COPY.marker.spy, -1.25), LUCK_COPY.markerValue(LUCK_COPY.marker.median, 0),
            LUCK_COPY.heading, LUCK_COPY.needsDaysTitle, LUCK_COPY.needsDaysDescription(0), LUCK_COPY.needsDaysDescription(7),
            LUCK_COPY.noPricesTitle, LUCK_COPY.noPricesDescription,
        ]) clean(text);
        expect(LUCK_COPY.binTitle(-4, -3.375, 1)).toBe('−4.0% to −3.4%: 1 portfolio');
        clean(LUCK_COPY.binTitle(0.5, 1.25, 37));
        expect(LUCK_COPY.sampleOnly(view)).toBe('1,000 random five-stock portfolios over the same 34 trading days');
        expect(LUCK_COPY.markerValue('You', 3.14)).toBe('You +3.1%');
        expect(LUCK_COPY.window(view)).toBe('bought at the Aug 14 close · valued at the Oct 2 close');
        expect(LUCK_COPY.window({start: '2025-12-19', end: '2026-01-09'})).toBe('bought at the Dec 19, 2025 close · valued at the Jan 9, 2026 close');
        expect(LUCK_COPY.needsDaysTitle).toBe('Needs 10 trading days');
        expect(LUCK_COPY.method(view)).toMatch(/survivorship bias/);
    });
});
