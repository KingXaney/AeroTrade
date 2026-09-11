'use client';

import {useCallback, useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {cn, formatPrice} from "@/lib/utils";
import {useDebounce} from "@/hooks/useDebounce";
import {getQuote, searchStocks} from "@/lib/actions/finnhub.actions";
import {placeOrder} from "@/lib/actions/trading.actions";

type OrderPanelProps = {
    defaultSymbol?: string;
    cash: number;
    accountId: string;
};

const OrderPanel = ({defaultSymbol = '', cash, accountId}: OrderPanelProps) => {
    const router = useRouter();
    const [symbol, setSymbol] = useState(defaultSymbol.toUpperCase());
    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [quantity, setQuantity] = useState('1');
    const [price, setPrice] = useState<number | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);
    const [results, setResults] = useState<StockWithWatchlistStatus[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const loadPrice = useCallback(async (sym: string) => {
        if (!sym) { setPrice(null); return; }
        setPriceLoading(true);
        try {
            const quote = await getQuote(sym);
            setPrice(typeof quote.c === 'number' ? quote.c : null);
        } catch {
            setPrice(null);
        } finally {
            setPriceLoading(false);
        }
    }, []);

    const runSearch = useCallback(async (q: string) => {
        if (!q || q.length < 1) { setResults([]); return; }
        try {
            const hits = await searchStocks(q);
            setResults(hits.slice(0, 6));
        } catch {
            setResults([]);
        }
    }, []);

    const debouncedSearch = useDebounce(runSearch, 350);
    const debouncedPrice = useDebounce(loadPrice, 350);

    // Show the live price for the seeded symbol immediately on mount.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time async price fetch for the seeded symbol
        if (defaultSymbol) void loadPrice(defaultSymbol.toUpperCase());
    }, [defaultSymbol, loadPrice]);

    const onSymbolChange = (value: string) => {
        const upper = value.toUpperCase().replace(/[^A-Z.]/g, '');
        setSymbol(upper);
        setPrice(null);
        debouncedSearch(upper);
        debouncedPrice(upper);
    };

    const pickResult = (s: StockWithWatchlistStatus) => {
        setSymbol(s.symbol);
        setResults([]);
        void loadPrice(s.symbol);
    };

    const qtyNum = Math.floor(Number(quantity)) || 0;
    const estTotal = price !== null ? price * qtyNum : null;

    const onSubmit = async () => {
        if (submitting) return;
        if (!symbol) { toast.error('Enter a stock symbol'); return; }
        if (qtyNum <= 0) { toast.error('Enter a whole number of shares'); return; }

        setSubmitting(true);
        try {
            const result = await placeOrder({symbol, side, quantity: qtyNum, accountId});
            if (result.success) {
                toast.success(result.message || 'Order filled');
                router.refresh();
            } else {
                toast.error(result.message || 'Order failed');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                    Order Entry
                </h3>
                <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    Buying Power {formatPrice(cash)}
                </span>
            </div>

            {/* Buy / Sell toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{backgroundColor: 'var(--surface-2)'}}>
                {(['buy', 'sell'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        className={cn(
                            'py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                            side === s
                                ? s === 'buy'
                                    ? 'bg-brand-strong/15 text-brand'
                                    : 'bg-negative/15 text-negative'
                                : 'text-fg-muted hover:text-fg',
                        )}
                        style={{fontFamily: 'var(--type-mono)'}}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Symbol */}
            <div className="relative">
                <label className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>Symbol</label>
                <input
                    value={symbol}
                    onChange={(e) => onSymbolChange(e.target.value)}
                    onBlur={() => window.setTimeout(() => setResults([]), 120)}
                    placeholder="e.g. AAPL"
                    autoComplete="off"
                    className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus"
                    style={{backgroundColor: 'var(--surface-0)', border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                />
                {results.length > 0 && (
                    <div className="mt-1 w-full rounded-lg overflow-y-auto max-h-44 shadow-2xl"
                         style={{backgroundColor: 'color-mix(in srgb, var(--surface-0) 98%, transparent)', border: '1px solid color-mix(in srgb, var(--line-strong) 50%, transparent)'}}>
                        {results.map((r) => (
                            <button
                                key={r.symbol}
                                type="button"
                                onClick={() => pickResult(r)}
                                className="w-full text-left px-3 py-2 hover:bg-brand-strong/6 flex items-center justify-between"
                            >
                                <span className="text-sm font-bold text-fg" style={{fontFamily: 'var(--type-mono)'}}>{r.symbol}</span>
                                <span className="text-xs text-fg-muted truncate max-w-[55%]">{r.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quantity */}
            <div>
                <label className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>Shares</label>
                <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus"
                    style={{backgroundColor: 'var(--surface-0)', border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                />
            </div>

            {/* Live price + estimate */}
            <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Live Price</span>
                <span className="text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                    {priceLoading ? '…' : price !== null ? formatPrice(price) : '—'}
                </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-line-strong/30 pt-3">
                <span className="text-fg-muted">Est. {side === 'buy' ? 'Cost' : 'Proceeds'}</span>
                <span className="text-brand font-semibold" style={{fontFamily: 'var(--type-mono)'}}>
                    {estTotal !== null ? formatPrice(estTotal) : '—'}
                </span>
            </div>

            <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className={cn(
                    'w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50',
                    side === 'buy' ? 'text-on-brand' : 'text-on-negative',
                )}
                style={{
                    fontFamily: 'var(--type-mono)',
                    backgroundColor: side === 'buy' ? 'var(--brand-strong)' : 'var(--negative)',
                    boxShadow: side === 'buy' ? '0 0 15px color-mix(in srgb, var(--brand-strong) 30%, transparent)' : '0 0 15px color-mix(in srgb, var(--negative) 25%, transparent)',
                }}
            >
                {submitting ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || ''}`.trim()}
            </button>
        </div>
    );
};

export default OrderPanel;
