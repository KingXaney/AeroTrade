// A synthetic market for the simulator tests: five listed owners and one private brand, weekday
// bars that trend at their own slopes (so momentum ranks), a brand whose pageviews quadruple
// part-way, and a short-history owner that never qualifies. Not a test file itself.

import {MIN_PRICE_BARS as MIN_BARS} from '@/lib/culture/config';
import {THESIS_WEIGHT_THRESHOLD} from '@/lib/brain/config';
import type {CultureSimulationInput} from '@/lib/culture/simulator';
import {cultureTickers} from '@/lib/culture/universe';
import type {AttentionPoint, CultureBrand} from '@/lib/culture/types';
import {addCalendarDays, eachCalendarDay} from '@/lib/dates';
import type {Bar} from '@/lib/prices/signals';

export const MIN_PRICE_BARS = MIN_BARS;
export const THESIS_WEIGHT_THRESHOLD_FOR_TESTS = THESIS_WEIGHT_THRESHOLD;

export const LAUNCH = '2030-01-01';

const weekdays = (count: number, from: string): string[] => {
    const dates: string[] = [];
    for (let day = from; dates.length < count; day = addCalendarDays(day, 1)) {
        const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
        if (wd !== 0 && wd !== 6) dates.push(day);
    }
    return dates;
};

export const SESSIONS = weekdays(820, '2023-01-02');

export const barsFor = (dates: readonly string[], base: number, slope: number): Bar[] =>
    dates.map((date, i) => {
        const close = base * (1 + slope * i);
        return {date, close, open: close * 0.999, high: close * 1.01, low: close * 0.99, dividend: 0};
    });

export const brand = (id: string, ticker: string | null, category: CultureBrand['category'] = 'drinks'): CultureBrand =>
    ({id, name: id.toUpperCase(), category, aliases: [id], owner: ticker ? {company: ticker, ticker, listing: 'us'} : null, wikipedia: [id]});

const DAYS = eachCalendarDay(addCalendarDays(SESSIONS[0], -420), SESSIONS[SESSIONS.length - 1]);

export const views = (valueAt: (date: string) => number): AttentionPoint[] => DAYS.map((date) => ({date, value: valueAt(date)}));

export const SURGE_FROM = SESSIONS[500];

export const BRANDS: CultureBrand[] = [
    brand('aaa', 'AAA'), brand('bbb', 'BBB'), brand('ccc', 'CCC', 'apparel'), brand('ddd', 'DDD', 'apparel'), brand('eee', 'EEE', 'apps'), brand('ppp', null),
];

// The simulator's input with mutable maps, so a test can bend one series before running it.
export type Fixture = Omit<CultureSimulationInput, 'bars' | 'attention'> & {bars: Map<string, Bar[]>; attention: Map<string, AttentionPoint[]>};

export const baseInput = (): Fixture => ({
    tickers: cultureTickers(BRANDS),
    bars: new Map<string, Bar[]>([
        ['AAA', barsFor(SESSIONS, 50, 0.0005)],
        ['BBB', barsFor(SESSIONS, 80, 0.0009)],
        // Too short a history to be held: a listing newer than the window.
        ['CCC', barsFor(SESSIONS.slice(-100), 30, 0.001)],
        ['DDD', barsFor(SESSIONS, 40, 0.0002)],
        ['EEE', barsFor(SESSIONS, 60, 0.0007)],
        ['SPY', barsFor(SESSIONS, 400, 0.0004)],
    ]),
    attention: new Map<string, AttentionPoint[]>([
        ['aaa', views((date) => (date >= SURGE_FROM ? 400 : 100))],
        ['bbb', views(() => 100)],
        ['ccc', views(() => 100)],
        ['ddd', views(() => 100)],
        ['eee', views(() => 100)],
        ['ppp', views(() => 100)],
    ]),
    brands: BRANDS,
    profiles: ['price', 'spike', 'quiet'],
    launchDate: LAUNCH,
    startingBalance: 100_000,
    resultWeeks: 40,
    warmupBars: 260,
});
