import Link from "next/link";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import {cn} from "@/lib/utils";
import {MARKET_EMBEDS} from "@/lib/stocks/tradingview";

// One screener/heatmap/forex widget at a time. Only the active tab's widget mounts,
// so the page loads light and stays calm (vs. the old 5-widgets-at-once stack).
const TABS = [
    {id: 'stocks', label: 'Stocks', ...MARKET_EMBEDS.stockScreener, height: 600},
    {id: 'heatmap', label: 'Heatmap', ...MARKET_EMBEDS.heatmap, height: 540},
    {id: 'crypto', label: 'Crypto', ...MARKET_EMBEDS.cryptoScreener, height: 540},
    {id: 'forex', label: 'Forex', ...MARKET_EMBEDS.forex, height: 540},
] as const;

type MarketsTabId = typeof TABS[number]['id'];

export const isMarketsTabId = (value: unknown): value is MarketsTabId =>
    typeof value === 'string' && TABS.some((t) => t.id === value);

// The active tab lives in the URL (?view=heatmap): it survives a reload, can be
// linked to, and renders correctly on the server — none of which useState did.
const MarketsTabs = ({active}: {active: MarketsTabId}) => {
    const tab = TABS.find((t) => t.id === active) ?? TABS[0];

    return (
        <section className="glass-panel rounded-xl p-4 md:p-6">
            <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{backgroundColor: 'var(--surface-0)'}} role="tablist" aria-label="Market views">
                {TABS.map((t) => (
                    <Link
                        key={t.id}
                        href={t.id === TABS[0].id ? '/markets' : `/markets?view=${t.id}`}
                        replace
                        scroll={false}
                        role="tab"
                        aria-selected={tab.id === t.id}
                        aria-current={tab.id === t.id ? 'page' : undefined}
                        className={cn(
                            'px-4 py-1.5 rounded-md text-xs font-semibold transition-colors',
                            tab.id === t.id ? 'bg-brand text-on-brand' : 'text-fg-muted hover:text-fg',
                        )}
                        style={{fontFamily: 'var(--type-mono)'}}
                    >
                        {t.label}
                    </Link>
                ))}
            </div>
            {/* key forces a clean remount so the previous widget's DOM is torn down on tab switch */}
            <TradingViewWidget key={tab.id} scriptUrl={tab.script} config={tab.config} height={tab.height} />
        </section>
    );
};

export default MarketsTabs;
