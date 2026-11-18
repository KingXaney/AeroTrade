'use client';

import {useState, useSyncExternalStore} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import OrderPanel from "@/components/trading/desk/OrderPanel";
import type {PositionLike} from "@/lib/trading/order-math";
import {TRADE_CHART_WIDGET_CONFIG, TRADE_DESK_WIDE_QUERY, tradeChartHeight, tvScript} from "@/lib/stocks/tradingview";
import {useDebounce} from "@/hooks/useDebounce";
import Panel from "@/components/primitives/Panel";

const URL_SYNC_DELAY_MS = 300;

// Whether the desk is wide enough to stand chart and ticket side by side (the xl: classes below).
// The chart's height is a number the embed is built with, so a class cannot change it: it follows
// this answer. null on the server and while hydrating, which cannot know the width — the embed
// waits for the browser, so it is built once, at the height its place has.
const subscribeWide = (onChange: () => void) => {
    const query = window.matchMedia(TRADE_DESK_WIDE_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};
const readWide = (): boolean | null => window.matchMedia(TRADE_DESK_WIDE_QUERY).matches;
const wideOnServer = (): boolean | null => null;

type Props = {
    chartSymbol: string;       // exchange-prefixed or bare, from ?symbol= (or the default)
    orderSymbol: string;       // bare ticker seeding the order panel
    cash: number;
    accountId: string;
    positions: readonly PositionLike[];
    queueNote: string | null;
    apy: number | null;        // cash APY at the latest T-bill rate (getCashApy); null before any rate is stored
};

// Chart and ticket share one symbol. Typing in the ticket used to leave the chart on
// whatever the URL said; now a *committed* symbol (search pick, Enter, or leaving the
// field) re-keys the chart and mirrors into ?symbol= — on commit, never per keystroke,
// so reloads and shared links land on the same view.
const TradeDesk = ({chartSymbol, orderSymbol, cash, accountId, positions, queueNote, apy}: Props) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [symbol, setSymbol] = useState(chartSymbol);
    const chartHeight = tradeChartHeight(useSyncExternalStore(subscribeWide, readWide, wideOnServer));
    // A Trade link or ⌘K hit while already on /trade is a soft navigation: Next keys the
    // page segment without its search params, so this instance survives and only the
    // prop changes. Adopt it (React's adjust-state-on-prop-change pattern); the echo of
    // our own URL sync arrives with the value we already hold and is a no-op.
    const [seeded, setSeeded] = useState(chartSymbol);
    if (chartSymbol !== seeded) {
        setSeeded(chartSymbol);
        setSymbol(chartSymbol);
    }

    const syncUrl = useDebounce((sym: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('symbol', sym);
        router.replace(`${pathname}?${params.toString()}`, {scroll: false});
    }, URL_SYNC_DELAY_MS);

    const onSymbolCommit = (sym: string) => {
        setSymbol(sym);
        syncUrl(sym);
    };

    return (
        <div className="grid gap-4 xl:grid-cols-3" data-trade-desk data-chart-height={chartHeight ?? undefined}>
            {/* The ticket comes first in the document: below xl the two stack in that order, so
                the page opens on the ticket and not on a screen of chart, and at every width the
                keyboard reaches it without crossing the embed's frame. From xl the classes put
                them in one row, the chart on the left. */}
            <div className="xl:col-start-3 xl:row-start-1">
                <OrderPanel defaultSymbol={orderSymbol} cash={cash} accountId={accountId} positions={positions} onSymbolCommit={onSymbolCommit} queueNote={queueNote} apy={apy} />
            </div>
            <Panel pad={4} className="xl:col-span-2 xl:col-start-1 xl:row-start-1">
                {/* Keyed so a new symbol tears the embed down and rebuilds it. */}
                <TradingViewWidget
                    key={symbol}
                    title="Advanced Chart"
                    scriptUrl={tvScript('advanced-chart')}
                    config={TRADE_CHART_WIDGET_CONFIG(symbol)}
                    height={chartHeight}
                />
            </Panel>
        </div>
    );
};

export default TradeDesk;
