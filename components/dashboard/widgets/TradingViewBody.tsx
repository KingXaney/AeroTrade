'use client';

import TradingViewWidget from "@/components/TradingViewWidget";
import {MARKET_EMBEDS} from "@/lib/stocks/tradingview";

type TradingViewKind = 'tv-heatmap' | 'tv-top-stories' | 'tv-ticker-tape' | 'tv-market-screener' | 'tv-crypto-screener' | 'tv-forex';

// The embeds come from lib/stocks/tradingview; the heights are this surface's own. Heatmap and
// top stories share a dashboard row at 460px, shorter than /markets renders the heatmap.
const EMBEDS: Record<TradingViewKind, {script: string; config: Record<string, unknown>; height: number; title?: string; className?: string}> = {
    'tv-heatmap': {...MARKET_EMBEDS.heatmap, height: 460, title: 'Market Heatmap'},
    'tv-top-stories': {...MARKET_EMBEDS.topStories, height: 460, title: 'Top Stories', className: 'custom-chart'},
    'tv-ticker-tape': {...MARKET_EMBEDS.tickerTape, height: 70},
    'tv-market-screener': {...MARKET_EMBEDS.stockScreener, height: 600, title: 'Stock Screener'},
    'tv-crypto-screener': {...MARKET_EMBEDS.cryptoScreener, height: 540, title: 'Crypto Screener'},
    'tv-forex': {...MARKET_EMBEDS.forex, height: 540, title: 'Forex Cross Rates'},
};

const TradingViewBody = ({kind}: {kind: TradingViewKind}) => {
    const embed = EMBEDS[kind];
    return (
        <TradingViewWidget
            title={embed.title}
            scriptUrl={embed.script}
            config={embed.config}
            height={embed.height}
            className={embed.className}
        />
    );
};

export default TradingViewBody;
