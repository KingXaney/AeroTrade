import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MARKET_EMBEDS, TICKER_TAPE_HEIGHTS, TICKER_TAPE_PLACE_CLASS, TRADE_CHART_HEIGHT, TRADE_CHART_PLACE_CLASS, TRADE_DESK_WIDE_QUERY, tradeChartHeight, tvScript} from '@/lib/stocks/tradingview';

const read = (path: string): string => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');

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

// The trade desk (components/trading/desk/TradeDesk): chart beside the ticket from xl, under it
// below. Nothing here renders a component — the browser suite (qa-trading) measures the page —
// so these hold the pieces the layout is made of to each other.
describe('the trade desk chart', () => {
    it('is the full chart beside the ticket and the shorter one under it', () => {
        expect(tradeChartHeight(true)).toBe(560);
        expect(tradeChartHeight(false)).toBe(360);
        expect(TRADE_CHART_HEIGHT.narrow).toBeLessThan(TRADE_CHART_HEIGHT.wide);
    });

    it('has no height until the browser has said how wide it is', () => {
        expect(tradeChartHeight(null)).toBeNull();
    });

    // The embed's frame arrives a second after the page, and until then its container has no
    // height: everything under the desk jumps down by the chart's height. The place is held in
    // CSS from the first paint, at the two heights the number will be — on the container, since
    // the stylesheet sizes the widget's own box to 100% of it and overrides any height given there.
    it('holds the chart\'s place, at both heights, on the embed\'s container', () => {
        expect(TRADE_CHART_PLACE_CLASS).toBe(`h-[${TRADE_CHART_HEIGHT.narrow}px] xl:h-[${TRADE_CHART_HEIGHT.wide}px]`);
        expect(read('components/trading/desk/TradeDesk.tsx')).toContain('className={TRADE_CHART_PLACE_CLASS}');
        expect(read('components/stocks/TradingViewWidget.tsx')).toMatch(/cn\('tradingview-widget-container', className\)/);
        expect(read('app/globals.css')).toMatch(/\.tradingview-widget-container__widget \{[^}]*height: 100% !important;/);
    });

    // The ticker tape over the desk draws itself at one of two heights, by a width only
    // TradingView knows, a second after the page. Its place is held at the taller, so the desk
    // under it never moves — and a menu open on the page is not pushed out from under a click.
    it('holds the ticker tape\'s place at the taller of its two heights', () => {
        expect(TICKER_TAPE_HEIGHTS).toEqual({wide: 58, narrow: 84});
        expect(TICKER_TAPE_PLACE_CLASS).toBe(`flex min-h-[${Math.max(TICKER_TAPE_HEIGHTS.wide, TICKER_TAPE_HEIGHTS.narrow)}px] items-center`);
        expect(read('app/(root)/trade/page.tsx')).toContain('className={TICKER_TAPE_PLACE_CLASS}');
    });

    // The height is chosen in JS and the columns in CSS: they must turn at the same width.
    it('asks at the width where the desk goes side by side', () => {
        const xl = /--breakpoint-xl:\s*([^;]+);/.exec(read('node_modules/tailwindcss/theme.css'))?.[1].trim();
        expect(xl).toBeDefined();
        expect(TRADE_DESK_WIDE_QUERY).toBe(`(min-width: ${xl})`);
        expect(read('app/globals.css')).not.toMatch(/--breakpoint-xl\s*:/);
        expect(read('components/trading/desk/TradeDesk.tsx')).toContain('xl:grid-cols-3');
    });

    // Below xl the two stack in document order, and the keyboard and a screen reader follow that
    // order at every width: the ticket is reached without crossing the embed's frame.
    it('comes after the ticket in the document', () => {
        const desk = read('components/trading/desk/TradeDesk.tsx');
        const ticket = desk.indexOf('<OrderPanel');
        const chart = desk.indexOf('<TradingViewWidget');
        expect(ticket).toBeGreaterThan(-1);
        expect(chart).toBeGreaterThan(ticket);
    });
});
