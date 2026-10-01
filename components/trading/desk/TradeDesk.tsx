'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import OrderPanel from "@/components/trading/desk/OrderPanel";
import type {PositionLike} from "@/lib/trading/order-math";
import {TRADE_CHART_WIDGET_CONFIG, tvScript} from "@/lib/stocks/tradingview";
import {useDebounce} from "@/hooks/useDebounce";

const URL_SYNC_DELAY_MS = 300;

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
        <div className="grid gap-4 xl:grid-cols-3">
            <section className="xl:col-span-2 glass-panel rounded-xl p-4">
                {/* Keyed so a new symbol tears the embed down and rebuilds it. */}
                <TradingViewWidget
                    key={symbol}
                    title="Advanced Chart"
                    scriptUrl={tvScript('advanced-chart')}
                    config={TRADE_CHART_WIDGET_CONFIG(symbol)}
                    height={560}
                />
            </section>
            <div className="xl:col-span-1">
                <OrderPanel defaultSymbol={orderSymbol} cash={cash} accountId={accountId} positions={positions} onSymbolCommit={onSymbolCommit} queueNote={queueNote} apy={apy} />
            </div>
        </div>
    );
};

export default TradeDesk;
