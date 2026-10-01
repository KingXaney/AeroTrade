import Link from "next/link";
import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import {formatEasternTimestamp, formatSignedPrice, formatPrice, getChangeColorClass} from "@/lib/format";
import {REPLAY_COPY} from "@/lib/learn/copy/replay";
import {boughtForLine, receiptLine} from "@/lib/learn/copy/receipts";
import type {FillReceipt} from "@/lib/trading/receipts";
import type {PaperTradeRecord, TradeSource} from '@/lib/trading/types';
import Disclosure from "@/components/primitives/Disclosure";
import RowCard from "@/components/primitives/RowCard";

// Only automated fills get a chip: 'user' is the default reading of a trade log, and
// rows from before the field existed carry no source at all — that absence is honest
// ("unknown"), not something to dress up as either.
const SOURCE_LABEL: Partial<Record<TradeSource, string>> = {
    'ai-navigator': 'AI Navigator',
    'ai-suggestion': 'AI suggestion',
    'strategy': 'Strategy',
};
const SOURCE_TITLE: Partial<Record<TradeSource, string>> = {
    'ai-navigator': 'Placed by the AI, not by you',
    'ai-suggestion': 'Placed by the AI, not by you',
    'strategy': 'Placed by a quant strategy\'s rule, not by a person',
};

type Props = {
    trades: PaperTradeRecord[];
    totalCount?: number;      // the account's full trade count, when the list is capped
    exportHref?: string;      // where the complete history lives
    // The one "What the rule saw" disclosure an automated fill may carry (strategy
    // detail page only). A server render prop: the dashboard widget passes nothing.
    detail?: (trade: PaperTradeRecord) => ReactNode;
    // What each fill did to the account (replayed from the ledger) and, under a sell, the
    // notes of the buys it closed. Page-only: the dashboard widget passes neither.
    receipts?: Readonly<Record<string, FillReceipt>>;
    buyNotesBySellId?: Readonly<Record<string, readonly string[]>>;
};

const TradeHistory = ({trades, totalCount, exportHref, detail, receipts, buyNotesBySellId}: Props) => {
    if (trades.length === 0) {
        return <p className="text-sm text-fg-muted p-4">No trades yet. Place your first order to get started.</p>;
    }
    const capped = typeof totalCount === 'number' && totalCount > trades.length;

    return (
        <div className="space-y-1.5">
            {trades.map((t) => {
                const isBuy = t.side === 'buy';
                const source = t.source ? SOURCE_LABEL[t.source] : undefined;
                const sourceTitle = t.source ? SOURCE_TITLE[t.source] : undefined;
                const detailNode = detail ? detail(t) : null;
                const receipt = receipts?.[t.id];
                const boughtFor = buyNotesBySellId?.[t.id];
                return (
                    <RowCard key={t.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                                'font-mono px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0',
                                isBuy
                                    ? 'bg-brand/10 text-brand border-brand/20'
                                    : 'bg-negative/10 text-negative border-negative/20',
                            )}>
                                {t.side}
                            </span>
                            <div className="min-w-0">
                                <Link href={`/stocks/${t.symbol}`} className="text-sm font-bold text-fg hover:text-brand transition-colors font-mono">
                                    {t.symbol}
                                </Link>
                                <span className="text-xs text-fg-muted ml-2">{t.quantity} @ {formatPrice(t.price)}</span>
                                {t.accountName && (
                                    <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-fg-muted font-mono">{t.accountName}</span>
                                )}
                                {source && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider whitespace-nowrap border border-line-strong/40 text-fg-soft font-mono" title={sourceTitle}>
                                        {source}
                                    </span>
                                )}
                                {t.reason && (
                                    <p data-trade-reason className="mt-0.5 text-[11px] text-fg-muted leading-snug break-words">{t.reason}</p>
                                )}
                                {boughtFor && boughtFor.length > 0 && (
                                    <p data-testid="bought-for" className="mt-0.5 text-[11px] text-fg-muted leading-snug break-words">{boughtForLine(boughtFor)}</p>
                                )}
                                {receipt && (
                                    <p data-testid="fill-receipt" className="mt-0.5 font-mono text-[11px] text-fg-muted leading-snug">{receiptLine(receipt)}</p>
                                )}
                                {detailNode && (
                                    <Disclosure data-replay className="mt-1" chevron={false} summary={REPLAY_COPY.summary}>
                                        {detailNode}
                                    </Disclosure>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-sm text-fg font-mono">{formatPrice(t.total)}</div>
                            <div className="text-[10px] text-fg-muted">
                                {formatEasternTimestamp(t.createdAt)}
                                {typeof t.realizedPnl === 'number' && (
                                    <span className={cn('ml-2', getChangeColorClass(t.realizedPnl))}>
                                        {formatSignedPrice(t.realizedPnl)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </RowCard>
                );
            })}
            {capped && (
                <p className="px-4 pt-2 text-[11px] text-fg-muted font-mono">
                    Showing the latest {trades.length} of {totalCount} trades
                    {exportHref ? <> · <a href={exportHref} download className="text-brand hover:underline">export the full history as CSV</a></> : null}
                </p>
            )}
        </div>
    );
};

export default TradeHistory;
