import {Suspense, type ReactNode} from "react";
import {WIDGETS, type DataKey, type WidgetId, type WidgetSpan} from "@/lib/dashboard/catalog";
import Panel from "@/components/primitives/Panel";
import {LOADERS, type DashboardData, type LoaderCtx} from "@/lib/dashboard/loaders";
import {bestAccount, newsBrainSummary, topMovers} from "@/lib/dashboard/select";
import {toApplyAccounts, toComparisonRows} from "@/lib/trading/active-account";
import {aggregatePortfolios} from "@/lib/trading/valuation";
import WidgetErrorBoundary from "@/components/dashboard/WidgetErrorBoundary";
import WidgetSkeleton from "@/components/primitives/Skeleton";
import WidgetUnavailable from "@/components/dashboard/WidgetUnavailable";
import PortfolioSnapshot from "@/components/dashboard/widgets/trading/PortfolioSnapshot";
import WatchlistMovers from "@/components/dashboard/widgets/stocks/WatchlistMovers";
import FriendsRank from "@/components/dashboard/widgets/friends/FriendsRank";
import NewsBrainTile from "@/components/dashboard/widgets/brain/NewsBrainTile";
import TradingViewBody from "@/components/dashboard/widgets/stocks/TradingViewBody";
import TopHoldings from "@/components/dashboard/widgets/trading/TopHoldings";
import SecondOpinionExcerpt from "@/components/dashboard/widgets/brain/SecondOpinionExcerpt";
import QuantStrategiesList from "@/components/dashboard/widgets/strategies/QuantStrategiesList";
import MarketNewsList from "@/components/dashboard/widgets/news/MarketNewsList";
import QuickLinks from "@/components/dashboard/widgets/QuickLinks";
import TopicsOverview from "@/components/dashboard/widgets/topics/TopicsOverview";
import TopicsLatest from "@/components/dashboard/widgets/topics/TopicsLatest";
import TopicBriefsList from "@/components/dashboard/widgets/topics/TopicBriefsList";
import TopicsWidgetEmpty from "@/components/dashboard/widgets/topics/TopicsWidgetEmpty";
import GettingStarted from "@/components/dashboard/widgets/learn/GettingStarted";
import TodaysLesson from "@/components/dashboard/widgets/learn/TodaysLesson";
import {deriveMissions} from "@/lib/learn/missions";
import {deriveMoments} from "@/lib/learn/moments";
import AccountSummary from "@/components/trading/portfolio/AccountSummary";
import OpenPositionsStrip from "@/components/trading/desk/OpenPositionsStrip";
import TradeHistory from "@/components/trading/portfolio/TradeHistory";
import OrderPanel from "@/components/trading/desk/OrderPanel";
import PerformanceChart from "@/components/trading/PerformanceChart";
import AnalyticsStats from "@/components/trading/portfolio/AnalyticsStats";
import AccountComparisonTable from "@/components/trading/portfolio/AccountComparisonTable";
import Leaderboard from "@/components/friends/Leaderboard";
import NavigatorCard from "@/components/navigator/NavigatorCard";
import SuggestionPanel from "@/components/navigator/SuggestionPanel";
import ActiveTheses from "@/components/brain/ActiveTheses";
import NarrativeLeaderboard from "@/components/brain/NarrativeLeaderboard";
import BrainGraph from "@/components/brain/BrainGraph";
import SystemStatus from "@/components/jobs/SystemStatus";
import {PERFORMANCE_COPY} from "@/lib/learn/copy/portfolio";

type WidgetRenderCtx = {
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

// A fallback is not the widget's body, so for chrome:'bare' — where the body draws its
// own panel and the shell draws nothing — the fallback has to bring the frame itself.
// One rule read off the registry, rather than the same literal written at four sites.
const framed = (id: WidgetId, node: ReactNode): ReactNode =>
    WIDGETS[id].chrome === 'bare' ? <Panel>{node}</Panel> : node;

const skeleton = (id: WidgetId, rows = 3) => framed(id, <WidgetSkeleton height={WIDGETS[id].minHeight} rows={rows} />);

// Lazy bodies await their own (cache()-deduped) loader under Suspense so the
// expensive calls stream in after the rest of the dashboard has painted.
const WatchlistMoversAsync = async ({ctx}: {ctx: LoaderCtx}) => (
    <WatchlistMovers movers={topMovers((await LOADERS.movers(ctx)) ?? [], 4)} />
);
const MarketNewsAsync = async ({ctx, span}: {ctx: LoaderCtx; span: number}) => <MarketNewsList news={(await LOADERS.news(ctx)) ?? []} span={span} />;
const PerformanceChartAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const analytics = await LOADERS.analytics(ctx);
    if (!analytics) return <WidgetUnavailable text={PERFORMANCE_COPY.widgetNoHistory} />;
    return <PerformanceChart series={analytics.series} accountName={analytics.account.name} />;
};
const AnalyticsStatsAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const analytics = await LOADERS.analytics(ctx);
    if (!analytics) return framed('analytics-stats', <WidgetUnavailable text={PERFORMANCE_COPY.widgetNoAnalytics} />);
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
const QuantStrategiesAsync = async ({ctx, span}: {ctx: LoaderCtx; span: number}) => {
    const rows = await LOADERS.strategies(ctx);
    if (!rows) return <WidgetUnavailable failed />;
    return <QuantStrategiesList rows={rows} span={span} />;
};
// Read only on a day no moment wins. A failed read shows the same "unavailable" state the
// eager pass gave it, not the error boundary's replacement panel.
const TodaysLessonAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const lesson = await LOADERS.lesson(ctx).catch((error) => {
        console.error('Dashboard loader "lesson" failed:', error);
        return undefined;
    });
    return lesson ? <TodaysLesson lesson={lesson} /> : <WidgetUnavailable failed />;
};
const BrainStatusAsync = async ({ctx}: {ctx: LoaderCtx}) => {
    const status = await LOADERS.brainStatus(ctx);
    if (!status) return framed('brain-status', <WidgetUnavailable failed />);
    return <SystemStatus status={status} />;
};

const WIDGET_RENDERERS: Record<WidgetId, Renderer> = {
    'topics-overview': (r) => need(r, 'topicsOverview', (o) => (
        o.topics.length > 0 ? <TopicsOverview overview={o} span={r.span} /> : <TopicsWidgetEmpty />
    )),
    'topics-latest': (r) => <Suspense fallback={skeleton('topics-latest', 4)}><TopicsLatestAsync ctx={r.ctx} span={r.span} /></Suspense>,
    'topic-briefs': (r) => need(r, 'topicsOverview', (o) => <TopicBriefsList overview={o} />),
    'getting-started': (r) => need(r, 'onboardingFacts', (f) => <GettingStarted missions={deriveMissions(f)} />),
    // A fresh moment wins and never reads the lesson at all: 'lesson' is a lazy key, so the
    // concept is read (streamed under Suspense) only on a day with no moment.
    'todays-lesson': (r) => {
        const facts = r.data.learnFacts;
        const moment = facts ? deriveMoments(facts, facts.today)[0] : undefined;
        if (moment) return <TodaysLesson moment={moment} />;
        return <Suspense fallback={skeleton('todays-lesson')}><TodaysLessonAsync ctx={r.ctx} /></Suspense>;
    },
    'portfolio-snapshot': (r) => need(r, 'portfolios', (p) => <PortfolioSnapshot portfolio={aggregatePortfolios(p)} best={bestAccount(p)} />),
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
        <Suspense fallback={skeleton('analytics-stats', 2)}>
            <AnalyticsStatsAsync ctx={r.ctx} />
        </Suspense>
    ),
    'account-comparison': (r) => need(r, 'comparisonStats', (stats) => (
        r.data.portfolios && r.data.activeAccount
            ? <AccountComparisonTable rows={toComparisonRows(r.data.portfolios, stats)} activeId={r.data.activeAccount.account.id} />
            : <WidgetUnavailable failed={r.failed.has('portfolios')} />
    )),
    // No onSymbolCommit: the widget must never navigate the dashboard to /trade.
    'quick-trade': (r) => need(r, 'activeAccount', (a) => <OrderPanel cash={a.summary.cash} accountId={a.account.id} positions={a.summary.positions} compact />),
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
        <Suspense fallback={skeleton('brain-status', 2)}>
            <BrainStatusAsync ctx={r.ctx} />
        </Suspense>
    ),
    'quant-strategies': (r) => <Suspense fallback={skeleton('quant-strategies', 5)}><QuantStrategiesAsync ctx={r.ctx} span={r.span} /></Suspense>,
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
