import {redirect} from "next/navigation";
import Link from "next/link";
import TradingViewWidget from "@/components/TradingViewWidget";
import {TRADE_CHART_WIDGET_CONFIG} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getPortfolio} from "@/lib/trading/account";
import OrderPanel from "@/components/trade/OrderPanel";
import OpenPositionsStrip from "@/components/trade/OpenPositionsStrip";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

type TradePageProps = {
    searchParams: Promise<{symbol?: string}>;
};

const TradePage = async ({searchParams}: TradePageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {symbol: raw} = await searchParams;
    const chartSymbol = (raw || 'NASDAQ:AAPL').toUpperCase();
    // Bare ticker (drop exchange prefix) seeds the order panel.
    const orderSymbol = chartSymbol.includes(':') ? chartSymbol.split(':').pop()! : chartSymbol;

    const portfolio = await getPortfolio(userId);

    return (
        <div className="min-h-screen space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1" style={{fontFamily: 'var(--font-sora)'}}>
                        Trade Desk
                    </h1>
                    <p className="text-sm text-[#849495]">Paper trading · live prices</p>
                </div>
                <Link href="/portfolio" className="text-xs text-[#7df4ff] hover:underline" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    View full portfolio →
                </Link>
            </div>

            {/* Chart + order entry — the focus of this page */}
            <div className="grid gap-4 xl:grid-cols-3">
                <section className="xl:col-span-2 glass-panel rounded-xl p-4">
                    <TradingViewWidget
                        title="Advanced Chart"
                        scriptUrl={`${scriptUrl}advanced-chart.js`}
                        config={TRADE_CHART_WIDGET_CONFIG(chartSymbol)}
                        height={560}
                    />
                </section>
                <div className="xl:col-span-1">
                    <OrderPanel defaultSymbol={orderSymbol} cash={portfolio.cash} />
                </div>
            </div>

            {/* Open positions — compact quick-sell; full holdings & history live on /portfolio */}
            <section className="glass-panel rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        Open Positions
                    </h2>
                    <Link href="/portfolio" className="text-xs text-[#849495] hover:text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        Full holdings &amp; history →
                    </Link>
                </div>
                <OpenPositionsStrip positions={portfolio.positions} />
            </section>
        </div>
    );
};

export default TradePage;
