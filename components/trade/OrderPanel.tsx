'use client';

import {useCallback, useEffect, useState, type FormEvent, type KeyboardEvent} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {cn, formatPrice} from "@/lib/utils";
import {useDebounce} from "@/hooks/useDebounce";
import {getQuote, searchStocks} from "@/lib/actions/finnhub.actions";
import {placeOrder} from "@/lib/actions/trading.actions";
import {checkOrder, presetQuantities} from "@/lib/trading/order-math";

type OrderPanelProps = {
    defaultSymbol?: string;
    cash: number;
    accountId: string;
    // What the active account holds, so the ticket can say how many shares a sell
    // can touch and offer sell presets. Optional: the dashboard widget may omit it.
    positions?: readonly {symbol: string; quantity: number}[];
    // Called when the user *commits* a symbol (picks a search hit, or leaves the field
    // with a new one). The trade desk uses it to move the chart; the dashboard's
    // quick-trade widget leaves it unset, so it never navigates anyone anywhere.
    onSymbolCommit?: (symbol: string) => void;
};

const OrderPanel = ({defaultSymbol = '', cash, accountId, positions = [], onSymbolCommit}: OrderPanelProps) => {
    const router = useRouter();
    const [symbol, setSymbol] = useState(defaultSymbol.toUpperCase());
    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [quantity, setQuantity] = useState('1');
    const [price, setPrice] = useState<number | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);
    const [results, setResults] = useState<StockWithWatchlistStatus[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [committed, setCommitted] = useState(defaultSymbol.toUpperCase());

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

    // Show the last price for the seeded symbol immediately on mount.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time async price fetch for the seeded symbol
        if (defaultSymbol) void loadPrice(defaultSymbol.toUpperCase());
    }, [defaultSymbol, loadPrice]);

    const commit = (sym: string) => {
        if (!sym || sym === committed) return;
        setCommitted(sym);
        onSymbolCommit?.(sym);
    };

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
        commit(s.symbol);
    };

    // Enter in the symbol field means "use this symbol", never "place the order" —
    // the order submits from the shares field or the button.
    const onSymbolKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        setResults([]);
        commit(symbol);
    };

    const qtyNum = quantity === '' ? 0 : Number(quantity);
    const owned = positions.find((p) => p.symbol.toUpperCase() === symbol)?.quantity ?? 0;
    const check = checkOrder({side, quantity: qtyNum, price, cash, owned});
    const presets = presetQuantities(side, {cash, price, owned});
    // Advisory only: a definite problem (over-sell, over-budget at the last price)
    // blocks the button; an unknown price never does — executeOrder is the authority.
    const blocked = symbol !== '' && !check.ok;

    const onSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        if (submitting) return;
        if (!symbol) { toast.error('Enter a stock symbol'); return; }
        if (!check.ok) { toast.error(check.message ?? 'Check the order'); return; }

        setSubmitting(true);
        try {
            const result = await placeOrder({symbol, side, quantity: Math.floor(qtyNum), accountId});
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
        <form onSubmit={onSubmit} className="glass-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                    Order Entry
                </h3>
                <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    {side === 'buy'
                        ? <>Buying Power {formatPrice(cash)}</>
                        : <>You own {owned} {owned === 1 ? 'share' : 'shares'}{symbol ? ` of ${symbol}` : ''}</>}
                </span>
            </div>

            {/* Buy / Sell toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{backgroundColor: 'var(--surface-2)'}}>
                {(['buy', 'sell'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        aria-pressed={side === s}
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
                <label htmlFor="order-symbol" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>Symbol</label>
                <input
                    id="order-symbol"
                    value={symbol}
                    onChange={(e) => onSymbolChange(e.target.value)}
                    onKeyDown={onSymbolKeyDown}
                    onBlur={() => { window.setTimeout(() => setResults([]), 120); commit(symbol); }}
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
                                onMouseDown={(e) => e.preventDefault()}
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

            {/* Quantity + presets */}
            <div>
                <label htmlFor="order-shares" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>Shares</label>
                <input
                    id="order-shares"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus"
                    style={{backgroundColor: 'var(--surface-0)', border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                />
                {presets && (
                    <div className="mt-1.5 grid grid-cols-4 gap-1 p-1 rounded-lg" style={{backgroundColor: 'var(--surface-2)'}}>
                        {presets.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => setQuantity(String(preset.value))}
                                title={side === 'buy' ? `${preset.value} shares at the last price` : `${preset.value} of your ${owned} shares`}
                                className={cn(
                                    'py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                                    qtyNum === preset.value
                                        ? side === 'buy' ? 'bg-brand-strong/15 text-brand' : 'bg-negative/15 text-negative'
                                        : 'text-fg-muted hover:text-fg',
                                )}
                                style={{fontFamily: 'var(--type-mono)'}}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                )}
                {symbol && check.message && (
                    <p role="alert" className="mt-1 text-xs text-negative">{check.message}</p>
                )}
            </div>

            {/* Last price + estimate */}
            <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Last Price</span>
                <span className="text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                    {priceLoading ? '…' : price !== null ? formatPrice(price) : '—'}
                </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-line-strong/30 pt-3">
                <span className="text-fg-muted">Est. {side === 'buy' ? 'Cost' : 'Proceeds'}</span>
                <span className="text-brand font-semibold" style={{fontFamily: 'var(--type-mono)'}}>
                    {check.estTotal !== null ? formatPrice(check.estTotal) : '—'}
                </span>
            </div>

            <button
                type="submit"
                disabled={submitting || blocked}
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
        </form>
    );
};

export default OrderPanel;
