import {describe, expect, it} from 'vitest';
import {MARKET_EMBEDS, tvScript} from '@/lib/stocks/tradingview';

describe('tvScript', () => {
    it('builds the embed script URL every TradingView surface loads', () => {
        expect(tvScript('stock-heatmap')).toBe('https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js');
        expect(tvScript('advanced-chart')).toBe('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js');
    });
});

describe('MARKET_EMBEDS', () => {
    it('pairs each market-wide embed with its script', () => {
        expect(Object.fromEntries(Object.entries(MARKET_EMBEDS).map(([key, embed]) => [key, embed.script.split('embed-widget-')[1]]))).toEqual({
            heatmap: 'stock-heatmap.js',
            topStories: 'timeline.js',
            tickerTape: 'ticker-tape.js',
            stockScreener: 'screener.js',
            cryptoScreener: 'screener.js',
            forex: 'forex-cross-rates.js',
        });
    });

    it('keeps the two screeners apart by their config', () => {
        expect(MARKET_EMBEDS.stockScreener.config).toMatchObject({defaultScreen: 'most_capitalized', market: 'america'});
        expect(MARKET_EMBEDS.cryptoScreener.config).toMatchObject({screener_type: 'crypto_mkt'});
    });
});
