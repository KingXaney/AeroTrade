'use client';

import {useCallback, useEffect, useState, type FormEvent, type KeyboardEvent} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {formatPrice} from "@/lib/format";
import {useDebounce} from "@/hooks/useDebounce";
import {getQuote, searchStocks} from "@/lib/actions/stocks.actions";
import {placeOrder} from "@/lib/actions/trading.actions";
import {checkOrder, describeOrderEffect, presetQuantities, ticketTerms, type PositionLike} from "@/lib/trading/order-math";
import {orderEffectLine, queueLine} from "@/lib/learn/copy/trade";
import {NOTE_COPY} from "@/lib/learn/copy/receipts";
import {TRADE_REASON_MAX} from "@/lib/trading/config";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import type {Stock} from '@/lib/stocks/types';
import Panel from '@/components/primitives/Panel';
import TextField from '@/components/primitives/TextField';
import SectionHeading from "@/components/primitives/SectionHeading";

type OrderPanelProps = {
    defaultSymbol?: string;
    cash: number;
    accountId: string;
    // What the active account holds, so the ticket can say how many shares a sell
    // can touch and offer sell presets. Optional: the dashboard widget may omit it.
    positions?: readonly PositionLike[];
    // What a real broker would do with the order right now (null while the session is
    // open); computed on the server so the ticket never disagrees with MarketStatus.
    queueNote?: string | null;
    // The 360px dashboard ticket: the first two facts of the consequence line, no queue
    // line, no definitions.
    compact?: boolean;
    // The cash APY at the latest T-bill rate (getCashApy), for the buy line's "earning
    // ≈$x/month" clause on the cash left. Null or unset: no clause. The dashboard widget
    // leaves it unset — its compact line drops the cash left the clause describes.
    apy?: number | null;
    // Called when the user *commits* a symbol (picks a search hit, or leaves the field
    // with a new one). The trade desk uses it to move the chart; the dashboard's
    // quick-trade widget leaves it unset, so it never navigates anyone anywhere.
    onSymbolCommit?: (symbol: string) => void;
};

const OrderPanel = ({defaultSymbol = '', cash, accountId, positions = [], onSymbolCommit, queueNote = null, compact = false, apy = null}: OrderPanelProps) => {
    const router = useRouter();
    const [symbol, setSymbol] = useState(defaultSymbol.toUpperCase());
    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [quantity, setQuantity] = useState('1');
    const [price, setPrice] = useState<number | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);
    const [results, setResults] = useState<Stock[]>([]);
    const [submitting, setSubmitting] = useState(false);
    // The learner's own "why"; the server sanitises it (sanitizeTradeNote) and stores it on the fill.
    const [note, setNote] = useState('');
    const [committed, setCommitted] = useState(defaultSymbol.toUpperCase());
    // Same-route deep links reuse this instance with a new defaultSymbol (see TradeDesk).
    // Adopt an external symbol; ignore the echo of our own commit so a symbol the user is
    // mid-way through typing is not wiped by the URL sync catching up.
    const [seeded, setSeeded] = useState(defaultSymbol.toUpperCase());
    if (defaultSymbol.toUpperCase() !== seeded) {
        const next = defaultSymbol.toUpperCase();
        setSeeded(next);
        if (next !== committed) {
            setSymbol(next);
            setCommitted(next);
            setResults([]);
        }
    }

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

    const pickResult = (s: Stock) => {
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
    // Numbers, not a lesson: what this order does to the account at the last price.
    const effect = symbol ? describeOrderEffect({side, symbol, quantity: qtyNum, price, cash, positions, apy}) : null;
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
            const result = await placeOrder({symbol, side, quantity: Math.floor(qtyNum), accountId, ...(!compact && note.trim() ? {note} : {})});
            if (result.success) {
                toast.success(result.message || 'Order filled');
                setNote('');
                router.refresh();
            } else {
                toast.error(result.message || 'Order failed');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Panel as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <SectionHeading as="h3" spacing="none">
                    Order Entry
                </SectionHeading>
                <span className="text-[10px] text-fg-muted font-mono">
                    {side === 'buy'
                        ? <>Buying Power {formatPrice(cash)}</>
                        : <>You own {owned} {owned === 1 ? 'share' : 'shares'}{symbol ? ` of ${symbol}` : ''}</>}
                </span>
            </div>

            {/* Buy / Sell toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-2">
                {(['buy', 'sell'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        aria-pressed={side === s}
                        className={cn(
                            'font-mono py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                            side === s
                                ? s === 'buy'
                                    ? 'bg-brand-strong/15 text-brand'
                                    : 'bg-negative/15 text-negative'
                                : 'text-fg-muted hover:text-fg',
                        )}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Symbol */}
            <div className="relative">
                <label htmlFor="order-symbol" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-mono">Symbol</label>
                <TextField
                    id="order-symbol"
                    value={symbol}
                    onChange={(e) => onSymbolChange(e.target.value)}
                    onKeyDown={onSymbolKeyDown}
                    onBlur={() => { window.setTimeout(() => setResults([]), 120); commit(symbol); }}
                    placeholder="e.g. AAPL"
                    autoComplete="off"
                    className="w-full mt-1"
                />
                {results.length > 0 && (
                    <div className="mt-1 w-full rounded-lg overflow-y-auto max-h-44 shadow-2xl bg-surface-0/98 border border-line-strong/50">
                        {results.map((r) => (
                            <button
                                key={r.symbol}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickResult(r)}
                                className="w-full text-left px-3 py-2 hover:bg-brand-strong/6 flex items-center justify-between"
                            >
                                <span className="text-sm font-bold text-fg font-mono">{r.symbol}</span>
                                <span className="text-xs text-fg-muted truncate max-w-[55%]">{r.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quantity + presets */}
            <div>
                <label htmlFor="order-shares" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-mono">Shares</label>
                <TextField
                    id="order-shares"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-full mt-1"
                />
                {presets && (
                    <div className="mt-1.5 grid grid-cols-4 gap-1 p-1 rounded-lg bg-surface-2">
                        {presets.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => setQuantity(String(preset.value))}
                                title={side === 'buy' ? `${preset.value} shares at the last price` : `${preset.value} of your ${owned} shares`}
                                className={cn(
                                    'font-mono py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors',
                                    qtyNum === preset.value
                                        ? side === 'buy' ? 'bg-brand-strong/15 text-brand' : 'bg-negative/15 text-negative'
                                        : 'text-fg-muted hover:text-fg',
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                )}
                {symbol && check.message && (
                    <p role="alert" className="mt-1 text-xs text-negative">{check.message}</p>
                )}
                {effect && (
                    <p className="mt-1.5 text-[11px] text-fg-muted font-mono" data-testid="order-effect">
                        {orderEffectLine(effect, compact)}
                    </p>
                )}
                {!compact && queueNote && (
                    <p className="mt-1 text-[11px] text-fg-muted font-mono" data-testid="order-queue">
                        {queueLine(queueNote)}
                    </p>
                )}
            </div>

            {/* The learner's "why": a line they will see again at the sell. Not on the compact ticket. */}
            {!compact && (
                <div>
                    <div className="flex items-center justify-between">
                        <label htmlFor="order-note" className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">{NOTE_COPY.label}</label>
                        <span className="font-mono text-[10px] text-fg-muted" aria-hidden>{NOTE_COPY.counter(note.length, TRADE_REASON_MAX)}</span>
                    </div>
                    <textarea
                        id="order-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={TRADE_REASON_MAX}
                        rows={2}
                        placeholder={NOTE_COPY.placeholder}
                        className="w-full mt-1 rounded-lg px-3 py-2 text-xs text-fg outline-none field-focus resize-none bg-surface-0 border border-line-strong/40"
                    />
                </div>
            )}

            {/* Last price + estimate */}
            <div className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Last Price</span>
                <span className="text-fg font-mono">
                    {priceLoading ? '…' : price !== null ? formatPrice(price) : '—'}
                </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-line-strong/30 pt-3">
                <span className="text-fg-muted">Est. {side === 'buy' ? 'Cost' : 'Proceeds'}</span>
                <span className="text-brand font-semibold font-mono">
                    {check.estTotal !== null ? formatPrice(check.estTotal) : '—'}
                </span>
            </div>

            <button
                type="submit"
                disabled={submitting || blocked}
                className={cn(
                    'font-mono w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50',
                    side === 'buy' ? 'bg-brand-strong text-on-brand' : 'bg-negative text-on-negative',
                )}
                style={{
                    boxShadow: side === 'buy' ? '0 0 15px color-mix(in srgb, var(--brand-strong) 30%, transparent)' : '0 0 15px color-mix(in srgb, var(--negative) 25%, transparent)',
                }}
            >
                {submitting ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || ''}`.trim()}
            </button>
            {/* The one definitions disclosure: APY joins it only while the buy line states it. */}
            {!compact && <WhatTheseMean keys={ticketTerms(effect)} className="mt-0" />}
        </Panel>
    );
};

export default OrderPanel;
