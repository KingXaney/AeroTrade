import Link from "next/link";
import {cn} from "@/lib/utils";

// The one convention for getting to the order ticket: symbol text links to the
// stock page (/stocks/X); an explicit "Trade" affordance links to the desk with the
// ticket prefilled (/trade?symbol=X — the page has accepted this for a long time,
// nothing linked to it). No hooks, so it renders from server and client components.
type Props = {
    symbol: string;
    variant?: 'button' | 'chip' | 'icon';
    className?: string;
};

const TradeLink = ({symbol, variant = 'chip', className}: Props) => {
    const href = `/trade?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
    if (variant === 'icon') {
        return (
            <Link href={href} aria-label={`Trade ${symbol}`} title={`Trade ${symbol}`}
                  className={cn('inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:text-brand hover:bg-brand/10 transition-colors', className)}>
                <span className="material-symbols-outlined text-base">candlestick_chart</span>
            </Link>
        );
    }
    if (variant === 'button') {
        return (
            <Link href={href}
                  className={cn('inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] border border-brand/40 text-brand hover:bg-brand/10 transition-colors', className)}
                  style={{fontFamily: 'var(--type-mono)'}}>
                <span className="material-symbols-outlined text-base">candlestick_chart</span>
                Trade
            </Link>
        );
    }
    return (
        <Link href={href}
              className={cn('inline-flex items-center px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider border border-brand/30 text-brand hover:bg-brand/10 transition-colors', className)}
              style={{fontFamily: 'var(--type-mono)'}}>
            Trade
        </Link>
    );
};

export default TradeLink;
