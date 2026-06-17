'use client';

import {useState} from "react";
import TradingViewWidget from "@/components/TradingViewWidget";
import {cn} from "@/lib/utils";
import {
    MARKET_SCREENER_WIDGET_CONFIG,
    CRYPTO_SCREENER_WIDGET_CONFIG,
    FOREX_CROSS_RATES_WIDGET_CONFIG,
    HEATMAP_WIDGET_CONFIG,
} from "@/lib/constants";

const scriptBase = 'https://s3.tradingview.com/external-embedding/embed-widget-';

// One screener/heatmap/forex widget at a time. Only the active tab's widget mounts,
// so the page loads light and stays calm (vs. the old 5-widgets-at-once stack).
const TABS = [
    {id: 'stocks', label: 'Stocks', script: `${scriptBase}screener.js`, config: MARKET_SCREENER_WIDGET_CONFIG, height: 600},
    {id: 'heatmap', label: 'Heatmap', script: `${scriptBase}stock-heatmap.js`, config: HEATMAP_WIDGET_CONFIG, height: 540},
    {id: 'crypto', label: 'Crypto', script: `${scriptBase}screener.js`, config: CRYPTO_SCREENER_WIDGET_CONFIG, height: 540},
    {id: 'forex', label: 'Forex', script: `${scriptBase}forex-cross-rates.js`, config: FOREX_CROSS_RATES_WIDGET_CONFIG, height: 540},
] as const;

type TabId = typeof TABS[number]['id'];

const MarketsTabs = () => {
    const [active, setActive] = useState<TabId>('stocks');
    const tab = TABS.find((t) => t.id === active)!;

    return (
        <section className="glass-panel rounded-xl p-4 md:p-6">
            <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{backgroundColor: '#111318'}}>
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setActive(t.id)}
                        className={cn(
                            'px-4 py-1.5 rounded-md text-xs font-semibold transition-colors',
                            active === t.id ? 'bg-[#7df4ff] text-[#04212a]' : 'text-[#849495] hover:text-[#e2e2e8]',
                        )}
                        style={{fontFamily: 'var(--font-jetbrains)'}}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            {/* key forces a clean remount so the previous widget's DOM is torn down on tab switch */}
            <TradingViewWidget key={tab.id} scriptUrl={tab.script} config={tab.config} height={tab.height} />
        </section>
    );
};

export default MarketsTabs;
