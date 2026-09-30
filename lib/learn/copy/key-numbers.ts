// Copy for the stock page's "Key numbers" panel (lib/learn/key-numbers.ts builds the rows).
// Each sentence says what its figure divides — or, for market cap, multiplies — and repeats
// the figure exactly as the value beside it prints it. Nothing here calls a number high, low,
// cheap or anything else: the definitions (lib/learn/glossary.ts) say what a figure measures,
// and the panel's one "What these mean" carries them. Held to the 'copy' tier of
// lib/learn/banned.ts and a list of evaluative words by key-numbers.test.ts.

export const KEY_NUMBERS_COPY = {
    heading: 'Key numbers',
    emptyTitle: (symbol: string): string => `No key numbers came back for ${symbol}.`,
    emptyDescription:
        'They come from the market-data feed, which has none for some symbols (funds among them) and none at all when no market-data key is configured.',
    // Stated once per panel, under the rows.
    source: 'From the market-data feed, refreshed at most once an hour, so a ratio can trail the live quote.',

    marketCap: (amount: string): string =>
        `The share price times every share outstanding: about ${amount} for the whole company.`,
    pe: (multiple: string): string =>
        `The share price divided by the last twelve months of earnings per share: $${multiple} of price for each $1 of those earnings.`,
    peNone:
        'Earnings per share over the last twelve months were zero or below, so the price is not a multiple of them and there is no ratio to show.',
    dividend: (percent: string): string =>
        `The last twelve months of dividends per share divided by the share price: ${percent}%, or $${percent} for each $100 of stock.`,
    dividendTiny:
        'The last twelve months of dividends per share divided by the share price: under 0.01%, less than a cent for each $100 of stock.',
    dividendNone: 'The company paid no dividend over the last twelve months.',
    beta: (moves: string): string =>
        `The stock's moves measured against the market's over past years: about ${moves}% for each 1% the market moved, in either direction.`,
    betaInverse: (moves: string): string =>
        `The stock's moves measured against the market's over past years: about ${moves}% in the opposite direction for each 1% the market moved.`,
    betaZero: "The stock's moves measured against the market's over past years: they show no steady link to the market's moves.",
    range: (bottom: string, top: string, above: string): string =>
        `Over the past 52 weeks the stock traded between ${bottom} and ${top}; the top of that range is ${above} above the bottom.`,
    rangeFlat: (price: string): string => `Over the past 52 weeks the stock traded at ${price} throughout.`,
} as const;
