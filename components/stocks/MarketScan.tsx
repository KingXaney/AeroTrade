import Link from "next/link";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import {cn} from "@/lib/utils";
import {MARKET_EMBEDS} from "@/lib/stocks/tradingview";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {MARKETS_PAGE_COPY} from "@/lib/learn/copy/trade";

// The market scan at the foot of /trade: one screener, heatmap or forex grid at a time. Only
// the active view's widget mounts, so the page carries three embeds at most (the ticker tape,
// the chart, this) and stays calm — the old overview page stacked five at once.
const VIEWS = [
    {id: 'stocks', label: 'Stocks', ...MARKET_EMBEDS.stockScreener, height: 600},
    {id: 'heatmap', label: 'Heatmap', ...MARKET_EMBEDS.heatmap, height: 540},
    {id: 'crypto', label: 'Crypto', ...MARKET_EMBEDS.cryptoScreener, height: 540},
    {id: 'forex', label: 'Forex', ...MARKET_EMBEDS.forex, height: 540},
] as const;

export type ScanViewId = typeof VIEWS[number]['id'];

export const isScanViewId = (value: unknown): value is ScanViewId =>
    typeof value === 'string' && VIEWS.some((v) => v.id === value);

type Props = {
    active: ScanViewId;
    /** The page's other search params (the desk's symbol, the account), kept on every view's link. */
    params: Readonly<Record<string, string | undefined>>;
};

// The active view lives in the URL (?view=heatmap): it survives a reload, can be linked to, and
// renders on the server — none of which useState did. The ids are the ones /markets used, so an
// old /markets?view=heatmap link lands on the same view through the redirect.
const hrefFor = (id: ScanViewId, params: Props['params']): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (id !== VIEWS[0].id) search.set('view', id);
    const query = search.toString();
    return query ? `/trade?${query}` : '/trade';
};

const MarketScan = ({active, params}: Props) => {
    const view = VIEWS.find((v) => v.id === active) ?? VIEWS[0];

    return (
        <Panel pad={4} className="md:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <SectionHeading spacing="none">{MARKETS_PAGE_COPY.scanHeading}</SectionHeading>
                    <p className="mt-1 text-xs text-fg-muted">{MARKETS_PAGE_COPY.scanNote}</p>
                </div>
                <div className="flex gap-1 p-1 rounded-lg w-fit bg-surface-0" role="tablist" aria-label={MARKETS_PAGE_COPY.scanViews}>
                    {VIEWS.map((v) => (
                        <Link
                            key={v.id}
                            href={hrefFor(v.id, params)}
                            replace
                            scroll={false}
                            role="tab"
                            aria-selected={view.id === v.id}
                            aria-current={view.id === v.id ? 'page' : undefined}
                            className={cn(
                                'font-mono px-4 py-1.5 rounded-md text-xs font-semibold transition-colors',
                                view.id === v.id ? 'bg-brand text-on-brand' : 'text-fg-muted hover:text-fg',
                            )}
                        >
                            {v.label}
                        </Link>
                    ))}
                </div>
            </div>
            {/* key forces a clean remount so the previous widget's DOM is torn down on a view switch */}
            <TradingViewWidget key={view.id} scriptUrl={view.script} config={view.config} height={view.height} />
        </Panel>
    );
};

export default MarketScan;
