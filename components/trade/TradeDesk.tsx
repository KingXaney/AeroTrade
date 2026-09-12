'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import OrderPanel from "@/components/trade/OrderPanel";
import {TRADE_CHART_WIDGET_CONFIG} from "@/lib/constants";
import {useDebounce} from "@/hooks/useDebounce";

const SCRIPT_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
const URL_SYNC_DELAY_MS = 300;

type Props = {
    chartSymbol: string;       // exchange-prefixed or bare, from ?symbol= (or the default)
    orderSymbol: string;       // bare ticker seeding the order panel
    cash: number;
    accountId: string;
    positions: readonly {symbol: string; quantity: number}[];
};

// Chart and ticket share one symbol. Typing in the ticket used to leave the chart on
// whatever the URL said; now a *committed* symbol (search pick, Enter, or leaving the
// field) re-keys the chart and mirrors into ?symbol= — on commit, never per keystroke,
// so reloads and shared links land on the same view.
const TradeDesk = ({chartSymbol, orderSymbol, cash, accountId, positions}: Props) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [symbol, setSymbol] = useState(chartSymbol);

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
                    scriptUrl={SCRIPT_URL}
                    config={TRADE_CHART_WIDGET_CONFIG(symbol)}
                    height={560}
                />
            </section>
            <div className="xl:col-span-1">
                <OrderPanel defaultSymbol={orderSymbol} cash={cash} accountId={accountId} positions={positions} onSymbolCommit={onSymbolCommit} />
            </div>
        </div>
    );
};

export default TradeDesk;
