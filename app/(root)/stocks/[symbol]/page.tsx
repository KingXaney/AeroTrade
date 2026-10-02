import type {Metadata} from "next";
import {notFound} from "next/navigation";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import StockHeader from "@/components/stocks/StockHeader";
import {
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
import Tabs from "@/components/primitives/Tabs";

// The browser tab's title: the symbol, as typed in the address.
export const generateMetadata = async ({params}: {params: Promise<{symbol: string}>}): Promise<Metadata> =>
    ({title: decodeURIComponent((await params).symbol).toUpperCase()});

type StockDetailsPageProps = {
    params: Promise<{
        symbol: string;
    }>;
    searchParams: Promise<{view?: string}>;
};

// The three reference embeds, one at a time (?view=): mounting all of them stacked five
// third-party frames on one page, and the price showed three times.
const REFERENCE = [
    {id: 'technicals', label: 'Technicals', script: 'technical-analysis', config: TECHNICAL_ANALYSIS_WIDGET_CONFIG, height: 400},
    {id: 'profile', label: 'Company profile', script: 'symbol-profile', config: COMPANY_PROFILE_WIDGET_CONFIG, height: 440},
    {id: 'financials', label: 'Financials', script: 'financials', config: COMPANY_FINANCIALS_WIDGET_CONFIG, height: 464},
] as const;

// A failed board read hides "What the rules see" rather than reading as "no stored row".
const readBoardRows = async (symbol: string): Promise<SymbolBoardRead[] | null> => {
    try {
        return await getBoardRowsForSymbol(symbol);
    } catch (error) {
        console.error(`Error reading board rows for ${symbol}:`, error);
        return null;
    }
};

const StockDetailsPage = async ({params, searchParams}: StockDetailsPageProps) => {
    const userId = await requireUserId();

    const {symbol: raw} = await params;
    const symbol = raw.toUpperCase();
    const {view} = await searchParams;
    const reference = REFERENCE.find((r) => r.id === view) ?? REFERENCE[0];
    const path = `/stocks/${encodeURIComponent(symbol)}`;

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

            {/* The chart, straight under the price */}
            <Panel pad={4} className="shimmer">
                <TradingViewWidget
                    title="Advanced Chart"
                    scriptUrl={tvScript('advanced-chart')}
                    config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
                    height={560}
                />
            </Panel>

            {/* In plain words: the feed's key figures, and what the rule-based strategies see */}
            <div className={cn('grid gap-4', rulesSee && 'xl:grid-cols-2')}>
                <KeyNumbers symbol={symbol} rows={keyNumbers} />
                {rulesSee && <RulesSee view={rulesSee} />}
            </div>

            {/* Reference, one embed at a time */}
            <Panel pad={4} id="stock-reference">
                <Tabs
                    className="mb-4"
                    label="Reference views"
                    active={reference.id}
                    tabs={REFERENCE.map((r) => ({id: r.id, label: r.label, href: r.id === REFERENCE[0].id ? path : `${path}?view=${r.id}`}))}
                />
                {/* key forces a clean remount so the previous embed's DOM is torn down on a switch */}
                <TradingViewWidget
                    key={reference.id}
                    scriptUrl={tvScript(reference.script)}
                    config={reference.config(symbol)}
                    height={reference.height}
                />
            </Panel>
        </div>
    );
};

export default StockDetailsPage;
