import {notFound, redirect} from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import StockHeader from "@/components/stock/StockHeader";
import {
    SYMBOL_INFO_WIDGET_CONFIG,
    CANDLE_CHART_WIDGET_CONFIG,
    COMPANY_PROFILE_WIDGET_CONFIG,
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import {getCompanyProfile, getQuote} from "@/lib/actions/finnhub.actions";
import {getCurrentUserId, isInWatchlist} from "@/lib/actions/watchlist.actions";

const TRADINGVIEW_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const StockDetailsPage = async ({params}: StockDetailsPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {symbol: raw} = await params;
    const symbol = raw.toUpperCase();

    const [profile, quote, inWatchlist] = await Promise.all([
        getCompanyProfile(symbol),
        getQuote(symbol),
        isInWatchlist(userId, symbol),
    ]);

    // Finnhub returns an empty object for unknown symbols; treat that as 404.
    if (!profile.name && typeof quote.c !== 'number') notFound();

    const company = profile.name || symbol;

    return (
        <div className="space-y-6">
            <StockHeader
                symbol={symbol}
                company={company}
                currentPrice={quote.c}
                changePercent={quote.dp}
                isInWatchlist={inWatchlist}
            />

            <TradingViewWidget
                scriptUrl={`${TRADINGVIEW_SCRIPT}symbol-info.js`}
                config={SYMBOL_INFO_WIDGET_CONFIG(symbol)}
                height={170}
            />

            <div className="grid gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                    <TradingViewWidget
                        scriptUrl={`${TRADINGVIEW_SCRIPT}advanced-chart.js`}
                        config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
                        height={600}
                    />
                </div>
                <div className="xl:col-span-1">
                    <TradingViewWidget
                        scriptUrl={`${TRADINGVIEW_SCRIPT}technical-analysis.js`}
                        config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
                        height={400}
                    />
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <TradingViewWidget
                    scriptUrl={`${TRADINGVIEW_SCRIPT}symbol-profile.js`}
                    config={COMPANY_PROFILE_WIDGET_CONFIG(symbol)}
                    height={440}
                />
                <TradingViewWidget
                    scriptUrl={`${TRADINGVIEW_SCRIPT}financials.js`}
                    config={COMPANY_FINANCIALS_WIDGET_CONFIG(symbol)}
                    height={464}
                />
            </div>
        </div>
    );
};

export default StockDetailsPage;
