import {notFound} from "next/navigation";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import StockHeader from "@/components/stocks/StockHeader";
import {
    SYMBOL_INFO_WIDGET_CONFIG,
    CANDLE_CHART_WIDGET_CONFIG,
    COMPANY_PROFILE_WIDGET_CONFIG,
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    COMPANY_FINANCIALS_WIDGET_CONFIG,
    tvScript,
} from "@/lib/stocks/tradingview";
import KeyNumbers from "@/components/stocks/KeyNumbers";
import RulesSee from "@/components/stocks/RulesSee";
import {getCompanyProfile, getFinancials, getQuote} from "@/lib/prices/finnhub";
import {requireUserId} from "@/lib/auth/session";
import {isInWatchlist} from "@/lib/stocks/watchlist-store";
import {getTopicsForUser} from "@/lib/topics/store";
import {readKeyNumbers} from "@/lib/stocks/key-numbers";
import {buildRulesSee, type SymbolBoardRead} from "@/lib/stocks/rules-see";
import {getBoardRowsForSymbol} from "@/lib/strategies/page-store";
import {strategiesWatching} from "@/lib/strategies/universe";
import {cn} from "@/lib/utils";
import Panel from "@/components/primitives/Panel";

type StockDetailsPageProps = {
    params: Promise<{
        symbol: string;
    }>;
};

// A failed board read hides "What the rules see" rather than reading as "no stored row".
const readBoardRows = async (symbol: string): Promise<SymbolBoardRead[] | null> => {
    try {
        return await getBoardRowsForSymbol(symbol);
    } catch (error) {
        console.error(`Error reading board rows for ${symbol}:`, error);
        return null;
    }
};

const StockDetailsPage = async ({params}: StockDetailsPageProps) => {
    const userId = await requireUserId();

    const {symbol: raw} = await params;
    const symbol = raw.toUpperCase();

    const watching = strategiesWatching(symbol);
    const [profile, quote, inWatchlist, topics, financials, boardRows] = await Promise.all([
        getCompanyProfile(symbol),
        getQuote(symbol),
        isInWatchlist(userId, symbol),
        getTopicsForUser(userId),
        getFinancials(symbol),
        watching.length > 0 ? readBoardRows(symbol) : Promise.resolve([] as SymbolBoardRead[]),
    ]);

    // Finnhub returns an empty object for unknown symbols; treat that as 404 — unless a strategy
    // watches the symbol: its stored board rows are content of the page's own, key or no key.
    if (!profile.name && typeof quote.c !== 'number' && watching.length === 0) notFound();

    const keyNumbers = readKeyNumbers({marketCapMillions: profile.marketCapitalization, metric: financials.metric});
    const rulesSee = boardRows ? buildRulesSee(symbol, watching, boardRows) : null;

    const company = profile.name || symbol;
    const followedTopic = topics.find((t) => t.name.toLowerCase() === company.toLowerCase() || t.keywords.includes(symbol.toLowerCase()));

    return (
        <div className="space-y-6">
            <StockHeader
                symbol={symbol}
                company={company}
                currentPrice={quote.c}
                changePercent={quote.dp}
                isInWatchlist={inWatchlist}
                followedTopic={followedTopic ? {id: followedTopic.id, slug: followedTopic.slug} : null}
            />

            {/* In plain words: the feed's key figures, and what the rule-based strategies see */}
            <div className={cn('grid gap-4', rulesSee && 'xl:grid-cols-2')}>
                <KeyNumbers symbol={symbol} rows={keyNumbers} />
                {rulesSee && <RulesSee view={rulesSee} />}
            </div>

            {/* Symbol Info */}
            <Panel pad={4} className="shimmer">
                <TradingViewWidget
                    scriptUrl={tvScript('symbol-info')}
                    config={SYMBOL_INFO_WIDGET_CONFIG(symbol)}
                    height={170}
                />
            </Panel>

            {/* Chart + Technical Analysis */}
            <div className="grid gap-4 xl:grid-cols-3">
                <Panel pad={4} className="xl:col-span-2 shimmer">
                    <TradingViewWidget
                        title="Advanced Chart"
                        scriptUrl={tvScript('advanced-chart')}
                        config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
                        height={600}
                    />
                </Panel>
                <Panel pad={4} className="xl:col-span-1">
                    <TradingViewWidget
                        title="Technical Analysis"
                        scriptUrl={tvScript('technical-analysis')}
                        config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(symbol)}
                        height={400}
                    />
                </Panel>
            </div>

            {/* Company Profile + Financials */}
            <div className="grid gap-4 xl:grid-cols-2">
                <Panel pad={4} className="shimmer">
                    <TradingViewWidget
                        title="Company Profile"
                        scriptUrl={tvScript('symbol-profile')}
                        config={COMPANY_PROFILE_WIDGET_CONFIG(symbol)}
                        height={440}
                    />
                </Panel>
                <Panel pad={4}>
                    <TradingViewWidget
                        title="Financials"
                        scriptUrl={tvScript('financials')}
                        config={COMPANY_FINANCIALS_WIDGET_CONFIG(symbol)}
                        height={464}
                    />
                </Panel>
            </div>
        </div>
    );
};

export default StockDetailsPage;
