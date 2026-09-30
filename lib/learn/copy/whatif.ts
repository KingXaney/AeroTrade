// Copy for the what-if parameter lab and the parameter table of every strategy page. A what-if
// is the same rule with one setting moved, run over the same three years as the stored
// backtest, in hindsight — so every line here names a setting and its value, and none ranks
// one setting against another (the test holds each line the grid can produce to the 'copy'
// tier of lib/learn/banned.ts). Client-safe: types only from the lab.

import type {ParamChange} from '@/lib/strategies/whatif';

// One label per catalog parameter; the explainer's parameter table and the lab both read it.
export const PARAM_LABELS: Readonly<Record<string, string>> = {
    allocation: 'Target allocation',
    spyWeight: 'SPY weight',
    aggWeight: 'AGG weight',
    fast: 'Fast average (days)',
    slow: 'Slow average (days)',
    lookback: 'Lookback (trading days)',
    skip: 'Skip most recent (days)',
    top: 'Positions held',
    rsiPeriod: 'RSI period',
    entryRsi: 'Entry: RSI below',
    exitSma: 'Exit: close above SMA (days)',
    trendSma: 'Trend filter SMA (days)',
    entryChannel: 'Entry channel (days)',
    exitChannel: 'Exit channel (days)',
    volWindow: 'Volatility window (days)',
};

export const paramLabel = (key: string): string => PARAM_LABELS[key] ?? key;

// A weight (a fraction) reads as a percentage; a window or a level as the number itself.
export const formatParamValue = (value: number | string): string =>
    typeof value === 'number' && value > 0 && value < 1 ? `${(value * 100).toFixed(0)}%` : String(value);

// "Entry: RSI below 10 → 5", "SPY weight: 60% → 80%": catalog value first, then the setting.
export const paramChangeText = (change: ParamChange): string => {
    const label = paramLabel(change.key);
    const joiner = label.includes(':') ? ' ' : ': ';
    return `${label}${joiner}${formatParamValue(change.from)} → ${formatParamValue(change.to)}`;
};

export const WHATIF_COPY = {
    whatIfSeries: 'What-if',
    storedSeries: 'Stored backtest (catalog setting)',
    catalogSetting: 'Catalog setting',
    caveat: 'Same rule, different setting, same three years, in hindsight.',
} as const;

// The one diff line above the what-if's numbers; the catalog setting itself has no diff.
export const whatIfDiffLine = (changes: readonly ParamChange[]): string =>
    changes.length === 0 ? WHATIF_COPY.catalogSetting : changes.map(paramChangeText).join(' · ');

// A position on a knob's control: the value, and which one is the catalog's.
export const positionText = (value: number, isCatalog: boolean): string =>
    `${formatParamValue(value)}${isCatalog ? ' (catalog)' : ''}`;

// The lab on a strategy page (components/strategies/WhatIfLab.tsx): the precomputed grid of
// settings, one knob moved at a time, drawn beside the stored backtest.
export const WHATIF_LAB = {
    heading: 'What-if lab',
    window: (from: string, to: string): string =>
        `${from} → ${to} · the stored backtest's bars, next-open fills, interest and dividends · one setting moved`,
    oneAtATime: 'One setting moves at a time; the others keep their catalog value.',
    pending: 'Other settings are computed overnight, after the stored backtest; none are ready for this rule yet.',
    knobAria: (label: string, position: string): string => `${label}: ${position}`,
    chartAria: (diffLine: string): string => `Account value with ${diffLine}, beside the stored backtest at the catalog setting`,
} as const;
