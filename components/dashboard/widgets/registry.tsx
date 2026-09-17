import {Suspense, type ReactNode} from "react";
import {WIDGETS, type DataKey, type WidgetId, type WidgetSpan} from "@/lib/dashboard/widgets";
import {LOADERS, type DashboardData, type LoaderCtx} from "@/lib/dashboard/loaders";
import {bestStrategy, newsBrainSummary, toApplyAccounts, toComparisonRows, topMovers} from "@/lib/dashboard/select";
import {aggregatePortfolios} from "@/lib/trading/account";
import WidgetErrorBoundary from "@/components/dashboard/WidgetErrorBoundary";
import WidgetSkeleton from "@/components/dashboard/WidgetSkeleton";
import WidgetUnavailable from "@/components/dashboard/WidgetUnavailable";
import PortfolioSnapshot from "@/components/dashboard/widgets/PortfolioSnapshot";
import WatchlistMovers from "@/components/dashboard/widgets/WatchlistMovers";
import FriendsRank from "@/components/dashboard/widgets/FriendsRank";
import NewsBrainTile from "@/components/dashboard/widgets/NewsBrainTile";
import TradingViewBody from "@/components/dashboard/widgets/TradingViewBody";
import TopHoldings from "@/components/dashboard/widgets/TopHoldings";
import SecondOpinionExcerpt from "@/components/dashboard/widgets/SecondOpinionExcerpt";
import MarketNewsList from "@/components/dashboard/widgets/MarketNewsList";
import QuickLinks from "@/components/dashboard/widgets/QuickLinks";
import TopicsOverview from "@/components/dashboard/widgets/TopicsOverview";
import TopicsLatest from "@/components/dashboard/widgets/TopicsLatest";
import TopicBriefsList from "@/components/dashboard/widgets/TopicBriefsList";
import TopicsWidgetEmpty from "@/components/dashboard/widgets/TopicsWidgetEmpty";
import AccountSummary from "@/components/trade/AccountSummary";
import OpenPositionsStrip from "@/components/trade/OpenPositionsStrip";
import TradeHistory from "@/components/trade/TradeHistory";
import OrderPanel from "@/components/trade/OrderPanel";
import PerformanceChart from "@/components/analytics/PerformanceChart";
import AnalyticsStats from "@/components/analytics/AnalyticsStats";
import AccountComparisonTable from "@/components/analytics/AccountComparisonTable";
import Leaderboard from "@/components/friends/Leaderboard";
import NavigatorCard from "@/components/brain/NavigatorCard";
import SuggestionPanel from "@/components/brain/SuggestionPanel";
import ActiveTheses from "@/components/brain/ActiveTheses";
import NarrativeLeaderboard from "@/components/brain/NarrativeLeaderboard";
import BrainGraph from "@/components/brain/BrainGraph";
import SystemStatus from "@/components/brain/SystemStatus";

export type WidgetRenderCtx = {
    ctx: LoaderCtx;
    data: DashboardData;
    failed: ReadonlySet<DataKey>;
    span: WidgetSpan;
};
type Renderer = (r: WidgetRenderCtx) => ReactNode;

const THESES_COUNT = 5;

// Eager data: undefined means the loader failed (Retry) or produced nothing.
const need = <K extends DataKey>(r: WidgetRenderCtx, key: K, render: (value: NonNullable<DashboardData[K]>) => ReactNode): ReactNode => {
    const value = r.data[key];
    if (value === undefined || value === null) return <WidgetUnavailable failed={r.failed.has(key)} />;
    return render(value as NonNullable<DashboardData[K]>);
};

const skeleton = (id: WidgetId, rows = 3) => <WidgetSkeleton height={WIDGETS[id].minHeight} rows={rows} />;

// Lazy bodies await their own (cache()-deduped) loader under Suspense so the
// expensive calls stream in after the rest of the dashboard has painted.
const WatchlistMoversAsync = async ({ctx}: {ctx: LoaderCtx}) => (
    <WatchlistMovers movers={topMovers((await LOADERS.movers(ctx)) ?? [], 4)} />
);
const MarketNewsAsync = async ({ctx, span}: {ctx: LoaderCtx; span: number}) => <MarketNewsList news={(await LOADERS.news(ctx)) ?? []} span={span} />;
const PerformanceChartAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const analytics = await LOADERS.analytics(ctx);
    if (!analytics) return <WidgetUnavailable text="No performance history yet — snapshots start tomorrow." />;
    return <PerformanceChart series={analytics.series} accountName={analytics.account.name} />;
};
const AnalyticsStatsAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const analytics = await LOADERS.analytics(ctx);
    if (!analytics) {
        return (
            <div className="glass-panel rounded-xl p-5">
                <WidgetUnavailable text="No analytics yet — they appear once a daily snapshot exists." />
            </div>
        );
    }
    return <AnalyticsStats analytics={analytics} />;
};
// Empty feed + zero topics is the onboarding nudge; empty feed + topics is just "nothing matched yet".
const TopicsLatestAsync = async ({ctx, span}: {ctx: LoaderCtx; span: WidgetSpan}) => {
    const articles = (await LOADERS.topicsLatest(ctx)) ?? [];
    if (articles.length > 0) return <TopicsLatest articles={articles} span={span} />;
    const overview = await LOADERS.topicsOverview(ctx);
    return overview && overview.topics.length > 0
        ? <WidgetUnavailable text="No articles yet — we check for matches every few hours." />
        : <TopicsWidgetEmpty />;
};
const BrainStatusAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const status = await LOADERS.brainStatus(ctx);
    if (!status) return <div className="glass-panel rounded-xl p-5"><WidgetUnavailable failed /></div>;
    return <SystemStatus status={status} />;
};

export const WIDGET_RENDERERS: Record<WidgetId, Renderer> = {
    'topics-overview': (r) => need(r, 'topicsOverview', (o) => (
        o.topics.length > 0 ? <TopicsOverview overview={o} span={r.span} /> : <TopicsWidgetEmpty />
    )),
    'topics-latest': (r) => <Suspense fallback={skeleton('topics-latest', 4)}><TopicsLatestAsync ctx={r.ctx} span={r.span} /></Suspense>,
    'topic-briefs': (r) => need(r, 'topicsOverview', (o) => <TopicBriefsList overview={o} />),
    'portfolio-snapshot': (r) => need(r, 'portfolios', (p) => <PortfolioSnapshot portfolio={aggregatePortfolios(p)} best={bestStrategy(p)} />),
    'watchlist-movers': (r) => <Suspense fallback={skeleton('watchlist-movers', 4)}><WatchlistMoversAsync ctx={r.ctx} /></Suspense>,
    'friends-rank': (r) => need(r, 'leaderboard', (l) => <FriendsRank leaderboard={l} />),
    'news-brain-tile': (r) => (
        <NewsBrainTile summary={newsBrainSummary(r.data.theses ?? [], r.data.suggestions ?? {user: null, global: null})} />
    ),
    'tv-heatmap': () => <TradingViewBody kind="tv-heatmap" />,
    'tv-top-stories': () => <TradingViewBody kind="tv-top-stories" />,
    'tv-ticker-tape': () => <TradingViewBody kind="tv-ticker-tape" />,
    'tv-market-screener': () => <TradingViewBody kind="tv-market-screener" />,
    'tv-crypto-screener': () => <TradingViewBody kind="tv-crypto-screener" />,
    'tv-forex': () => <TradingViewBody kind="tv-forex" />,
    'account-summary': (r) => need(r, 'portfolios', (p) => <AccountSummary portfolio={aggregatePortfolios(p)} />),
    'top-holdings': (r) => need(r, 'activeAccount', (a) => <TopHoldings positions={a.summary.positions} accountName={a.account.name} />),
    'open-positions': (r) => need(r, 'activeAccount', (a) => <OpenPositionsStrip positions={a.summary.positions} accountId={a.account.id} />),
    'recent-trades': (r) => need(r, 'trades', (t) => <TradeHistory trades={t} />),
    'performance-chart': (r) => <Suspense fallback={skeleton('performance-chart', 5)}><PerformanceChartAsync ctx={r.ctx} /></Suspense>,
    'analytics-stats': (r) => (
        <Suspense fallback={<div className="glass-panel rounded-xl p-5">{skeleton('analytics-stats', 2)}</div>}>
            <AnalyticsStatsAsync ctx={r.ctx} />
        </Suspense>
    ),
    'strategy-comparison': (r) => need(r, 'comparisonStats', (stats) => (
        r.data.portfolios && r.data.activeAccount
            ? <AccountComparisonTable rows={toComparisonRows(r.data.portfolios, stats)} activeId={r.data.activeAccount.account.id} />
            : <WidgetUnavailable failed={r.failed.has('portfolios')} />
    )),
    // No onSymbolCommit: the widget must never navigate the dashboard to /trade.
    'quick-trade': (r) => need(r, 'activeAccount', (a) => <OrderPanel cash={a.summary.cash} accountId={a.account.id} positions={a.summary.positions} />),
    'leaderboard': (r) => need(r, 'leaderboard', (l) => <Leaderboard entries={l} />),
    'ai-navigator': (r) => need(r, 'navigatorStatus', (s) => <NavigatorCard status={s} />),
    'weekly-decisions': (r) => need(r, 'suggestions', (s) => (
        <SuggestionPanel userSet={s.user} globalSet={s.global} accounts={toApplyAccounts(r.data.portfolios ?? [])} />
    )),
    'active-theses': (r) => need(r, 'theses', (t) => <ActiveTheses theses={t.slice(0, THESES_COUNT)} />),
    'narrative-leaderboard': (r) => need(r, 'topEntities', (e) => <NarrativeLeaderboard entities={e} />),
    'knowledge-graph': (r) => need(r, 'brainGraph', (g) => <BrainGraph nodes={g.nodes} edges={g.edges} />),
    'second-opinion': (r) => r.failed.has('secondOpinion')
        ? <WidgetUnavailable failed />
        : <SecondOpinionExcerpt opinion={r.data.secondOpinion ?? null} />,
    'brain-status': (r) => (
        <Suspense fallback={<div className="glass-panel rounded-xl p-5">{skeleton('brain-status', 2)}</div>}>
            <BrainStatusAsync ctx={r.ctx} />
        </Suspense>
    ),
    'market-news': (r) => <Suspense fallback={skeleton('market-news', 4)}><MarketNewsAsync ctx={r.ctx} span={r.span} /></Suspense>,
    'quick-links': () => <QuickLinks />,
};

// The renderer runs while React renders this server component, i.e. INSIDE the
// boundary below — so a throwing derivation (or loader inside Suspense) stays
// confined to its own widget instead of failing the page.
const WidgetBody = ({id, r}: {id: WidgetId; r: WidgetRenderCtx}) => <>{WIDGET_RENDERERS[id](r)}</>;

export const renderWidgetBody = (id: WidgetId, r: WidgetRenderCtx): ReactNode => (
    <WidgetErrorBoundary title={WIDGETS[id].title}>
        <WidgetBody id={id} r={r} />
    </WidgetErrorBoundary>
);
