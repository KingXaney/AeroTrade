// Copy for the /portfolio learning surfaces: the return bridge ("Where the return came
// from"), the risk lens and the dated drawdown. Every sentence is rendered on a grid of
// inputs and held to the 'copy' tier of lib/learn/banned.ts — these are measurements, and
// the Navigator comparison names its rails without saying the account ought to match them.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {
    BRIDGE_COPY,
    drawdownBand,
    drawdownBandLabel,
    drawdownLine,
    DRAWDOWN_COPY,
    HOLDINGS_COPY,
    PERFORMANCE_COPY,
    pctOneDecimal,
    RISK_COPY,
    shortDate,
    signedMoney,
} from '@/lib/learn/copy/portfolio';
import {MAX_POSITION_WEIGHT, MIN_CASH_WEIGHT} from '@/lib/navigator/config';
import type {DrawdownWindow} from '@/lib/trading/types';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

const window = (patch: Partial<DrawdownWindow> = {}): DrawdownWindow => ({
    pct: 8.1, peakDate: '2026-08-03', peakValue: 101_000, troughDate: '2026-08-21', troughValue: 92_819,
    recovered: false, recoveryPctNeeded: 8.81, ...patch,
});

describe('formatting helpers', () => {
    it('writes an ET date as a short month and day, with the year only when a span crosses one', () => {
        expect(shortDate('2026-08-03')).toBe('Aug 3');
        expect(shortDate('2026-12-31')).toBe('Dec 31');
        expect(shortDate('2026-01-05', true)).toBe('Jan 5, 2026');
        expect(shortDate('not a date')).toBe('not a date');
    });

    it('signs money with a true minus and percentages to one decimal', () => {
        expect(signedMoney(1234.5)).toBe('+$1,234.50');
        expect(signedMoney(-69.14)).toBe('−$69.14');
        expect(signedMoney(0)).toBe('$0.00');
        expect(signedMoney(-0.001)).toBe('$0.00');
        expect(pctOneDecimal(-3.14)).toBe('−3.1%');
        expect(pctOneDecimal(8.81)).toBe('+8.8%');
        expect(pctOneDecimal(-0.04)).toBe('0.0%');
    });
});

describe('drawdownLine', () => {
    it('dates the worst stretch, sets SPY beside it and says what the climb back takes', () => {
        expect(drawdownLine({maxDrawdownPct: 8.1, drawdown: window(), benchmarkOverDrawdownPct: -3.1}))
            .toBe('Aug 3 → Aug 21 · SPY −3.1% same days · +8.8% to recover');
    });

    it('says when the account has since climbed back, and drops what it cannot know', () => {
        expect(drawdownLine({maxDrawdownPct: 8.1, drawdown: window({recovered: true}), benchmarkOverDrawdownPct: 0.4}))
            .toBe('Aug 3 → Aug 21 · SPY +0.4% same days · since recovered');
        expect(drawdownLine({maxDrawdownPct: 8.1, drawdown: window(), benchmarkOverDrawdownPct: null}))
            .toBe('Aug 3 → Aug 21 · +8.8% to recover');
        expect(drawdownLine({maxDrawdownPct: 100, drawdown: window({pct: 100, troughValue: 0, recoveryPctNeeded: null}), benchmarkOverDrawdownPct: null}))
            .toBe('Aug 3 → Aug 21');
    });

    it('puts the year on both ends of a window that crosses New Year', () => {
        expect(drawdownLine({maxDrawdownPct: 2, drawdown: window({peakDate: '2025-12-29', troughDate: '2026-01-06'}), benchmarkOverDrawdownPct: null}))
            .toBe('Dec 29, 2025 → Jan 6, 2026 · +8.8% to recover');
    });

    it('falls back to the undated hint when there is no window (older data, simulated records) or no fall', () => {
        expect(drawdownLine({maxDrawdownPct: null})).toBe(DRAWDOWN_COPY.needsHistory);
        expect(drawdownLine({maxDrawdownPct: 4.2})).toBe(DRAWDOWN_COPY.undated);
        expect(drawdownLine({maxDrawdownPct: 0, drawdown: window({pct: 0}), benchmarkOverDrawdownPct: null})).toBe(DRAWDOWN_COPY.undated);
    });

    it('labels the chart band with the same dates, and shades nothing without a drop', () => {
        expect(drawdownBandLabel(window())).toBe('Shaded: the largest drop, Aug 3 → Aug 21');
        expect(drawdownBand(window())).toEqual({from: '2026-08-03', to: '2026-08-21', label: 'Shaded: the largest drop, Aug 3 → Aug 21'});
        expect(drawdownBand(window({pct: 0.004}))).toBeNull();
        expect(drawdownBand(null)).toBeNull();
        expect(drawdownBand(undefined)).toBeNull();
    });

    it('never advises', () => {
        for (const recovered of [true, false]) {
            for (const spy of [-12.3, 0, 4.4, null]) {
                for (const need of [0.4, 8.81, 400, null]) {
                    const w = window({recovered, recoveryPctNeeded: need});
                    clean(drawdownLine({maxDrawdownPct: w.pct, drawdown: w, benchmarkOverDrawdownPct: spy}));
                    clean(drawdownBandLabel(w));
                }
            }
        }
        for (const text of Object.values(DRAWDOWN_COPY)) clean(text);
    });
});

describe('HOLDINGS_COPY.summary', () => {
    it('counts the holdings and names the basis they are valued on', () => {
        expect(HOLDINGS_COPY.summary(0, 0, true)).toBe('No open positions yet');
        expect(HOLDINGS_COPY.summary(1, 0, true)).toBe('1 holding · live valuation');
        expect(HOLDINGS_COPY.summary(3, 0, false)).toBe('3 holdings · valued at last close');
        expect(HOLDINGS_COPY.summary(3, 3, true)).toBe('3 holdings · valued at cost');
        expect(HOLDINGS_COPY.summary(5, 2, false)).toBe('5 holdings · 2 of 5 valued at cost');
    });

    it('never advises', () => {
        for (const [h, u] of [[0, 0], [1, 0], [1, 1], [4, 1], [4, 4]]) {
            for (const open of [true, false]) clean(HOLDINGS_COPY.summary(h, u, open));
        }
    });
});

describe('BRIDGE_COPY', () => {
    it('names every line in plain words', () => {
        expect(BRIDGE_COPY.line).toEqual({
            price: 'Price moves on shares still held',
            realized: 'Locked in by sells',
            interest: 'Interest on cash',
            dividends: 'Dividends',
            residual: 'Not attributed to a line above',
        });
    });

    it('asks for the guess against the real total and states the stored one with its date', () => {
        expect(BRIDGE_COPY.guessPrompt('+$569.14')).toBe('Guess first: what share of this +$569.14 return came from interest and dividends?');
        expect(BRIDGE_COPY.guessed({guess: 10, date: '2026-09-03', share: 29.7, other: 400})).toBe('You guessed 10% on Sep 3 · interest and dividends were 30% of it');
        expect(BRIDGE_COPY.guessed({guess: 50, date: '2026-09-03', share: 169.1, other: -69.14}))
            .toBe('You guessed 50% on Sep 3 · interest and dividends were 169% of it; everything else came to −$69.14');
    });

    it('says once which price moves are valued at cost', () => {
        expect(BRIDGE_COPY.unpriced(2, 2)).toBe('valued at cost');
        expect(BRIDGE_COPY.unpriced(1, 3)).toBe('1 of 3 valued at cost');
        expect(BRIDGE_COPY.unpriced(0, 3)).toBeNull();
    });

    it('never advises', () => {
        for (const text of [BRIDGE_COPY.heading, BRIDGE_COPY.emptyTitle, BRIDGE_COPY.emptyDescription, BRIDGE_COPY.total,
            BRIDGE_COPY.reveal, BRIDGE_COPY.guessAgain, BRIDGE_COPY.sliderLabel, ...Object.values(BRIDGE_COPY.line)]) clean(text);
        for (const total of ['+$0.01', '+$569.14', '+$12,345.67']) clean(BRIDGE_COPY.guessPrompt(total));
        for (const guess of [0, 10, 55, 100]) {
            for (const share of [0.4, 29.7, 100, 169.1, 900]) {
                clean(BRIDGE_COPY.guessed({guess, date: '2026-09-03', share, other: 100 - share}));
            }
        }
        for (const [u, h] of [[1, 1], [1, 4], [3, 4]]) clean(BRIDGE_COPY.unpriced(u, h) as string);
    });
});

describe('RISK_COPY', () => {
    it('states the swing in whole dollars and as a share of today\'s value', () => {
        expect(RISK_COPY.swingValue(640.4)).toBe('±$640');
        expect(RISK_COPY.swingValue(12_345.6)).toBe('±$12,346');
        expect(RISK_COPY.swingHint(0.6404)).toBe('0.64% of today\'s value');
    });

    it('names the largest position, and says when its value is at cost', () => {
        expect(RISK_COPY.largestValue(0.4099)).toBe('41%');
        expect(RISK_COPY.largestHint('NVDA', 41_020, false)).toBe('NVDA · $41,020');
        expect(RISK_COPY.largestHint('AAPL', 1_500, true)).toBe('AAPL · $1,500 · valued at cost');
    });

    it('sets the account beside the Navigator\'s own rails, read from its config', () => {
        expect(MAX_POSITION_WEIGHT).toBe(0.2);
        expect(MIN_CASH_WEIGHT).toBe(0.1);
        expect(RISK_COPY.caption('NVDA', 0.41))
            .toBe('41% of this account moves with one holding, NVDA · the AI Navigator caps itself at 20% per name and keeps at least 10% in cash');
    });

    it('never advises, and never says the account ought to match the Navigator', () => {
        for (const text of [RISK_COPY.heading, RISK_COPY.swingLabel, RISK_COPY.swingNeedsHistory, RISK_COPY.largestLabel, RISK_COPY.allCash]) clean(text);
        for (const weight of [0.01, 0.2, 0.41, 0.99, 1]) {
            clean(RISK_COPY.caption('SPY', weight));
            clean(RISK_COPY.largestValue(weight));
        }
        for (const dollars of [0, 12.4, 640, 99_999]) clean(RISK_COPY.swingValue(dollars));
        for (const pct of [0, 0.64, 3.2]) clean(RISK_COPY.swingHint(pct));
        clean(RISK_COPY.largestHint('SPY', 41_020, true));
    });
});

describe('HOLDINGS_COPY', () => {
    // /portfolio has no order panel: the empty Holdings table points at the Trade Desk, the
    // page that does, and PositionsTable links the second sentence to /trade.
    it('points an empty Holdings table at the Trade Desk, not at an order panel', () => {
        expect(HOLDINGS_COPY.empty).toBe('No open positions.');
        expect(HOLDINGS_COPY.toTradeDesk).toBe('Orders are placed on the Trade Desk.');
        for (const text of [HOLDINGS_COPY.empty, HOLDINGS_COPY.toTradeDesk]) {
            expect(text).not.toMatch(/order panel/i);
            clean(text);
        }
    });
});

describe('PERFORMANCE_COPY', () => {
    it('never advises', () => {
        for (const text of Object.values(PERFORMANCE_COPY)) clean(text);
    });
});
