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
};

const OrderPanel = ({defaultSymbol = '', cash}: OrderPanelProps) => {
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
            const result = await placeOrder({symbol, side, quantity: qtyNum});
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
                <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Order Entry
                </h3>
                <span className="text-[10px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Buying Power {formatPrice(cash)}
                </span>
            </div>

            {/* Buy / Sell toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{backgroundColor: '#1e2024'}}>
                {(['buy', 'sell'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        className={cn(
                            'py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                            side === s
                                ? s === 'buy'
                                    ? 'bg-[rgba(0,240,255,0.15)] text-[#7df4ff]'
                                    : 'bg-[rgba(255,180,171,0.15)] text-[#ffb4ab]'
                                : 'text-[#849495] hover:text-[#e2e2e8]',
                        )}
                        style={{fontFamily: 'var(--font-jetbrains)'}}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Symbol */}
            <div className="relative">
                <label className="text-[10px] uppercase tracking-[0.1em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>Symbol</label>
                <input
                    value={symbol}
                    onChange={(e) => onSymbolChange(e.target.value)}
                    onBlur={() => window.setTimeout(() => setResults([]), 120)}
                    placeholder="e.g. AAPL"
                    autoComplete="off"
                    className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none"
                    style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
                />
                {results.length > 0 && (
                    <div className="mt-1 w-full rounded-lg overflow-y-auto max-h-44 shadow-2xl"
                         style={{backgroundColor: 'rgba(17,19,24,0.98)', border: '1px solid rgba(59,73,75,0.5)'}}>
                        {results.map((r) => (
                            <button
                                key={r.symbol}
                                type="button"
                                onClick={() => pickResult(r)}
                                className="w-full text-left px-3 py-2 hover:bg-[rgba(0,240,255,0.06)] flex items-center justify-between"
                            >
                                <span className="text-sm font-bold text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>{r.symbol}</span>
                                <span className="text-xs text-[#849495] truncate max-w-[55%]">{r.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quantity */}
            <div>
                <label className="text-[10px] uppercase tracking-[0.1em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>Shares</label>
                <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none"
                    style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
                />
            </div>

            {/* Live price + estimate */}
            <div className="flex items-center justify-between text-sm">
                <span className="text-[#849495]">Live Price</span>
                <span className="text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    {priceLoading ? '…' : price !== null ? formatPrice(price) : '—'}
                </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-[rgba(59,73,75,0.3)] pt-3">
                <span className="text-[#849495]">Est. {side === 'buy' ? 'Cost' : 'Proceeds'}</span>
                <span className="text-[#7df4ff] font-semibold" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    {estTotal !== null ? formatPrice(estTotal) : '—'}
                </span>
            </div>

            <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className={cn(
                    'w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50',
                    side === 'buy' ? 'text-[#002022]' : 'text-[#690005]',
                )}
                style={{
                    fontFamily: 'var(--font-jetbrains)',
                    backgroundColor: side === 'buy' ? '#00f0ff' : '#ffb4ab',
                    boxShadow: side === 'buy' ? '0 0 15px rgba(0,240,255,0.3)' : '0 0 15px rgba(255,180,171,0.25)',
                }}
            >
                {submitting ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || ''}`.trim()}
            </button>
        </div>
    );
};

export default OrderPanel;
