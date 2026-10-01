import Panel from "@/components/primitives/Panel";
import MicroLabel from "@/components/primitives/MicroLabel";
import {cn} from "@/lib/utils";
import {LAST_FILL_COPY, receiptLine} from "@/lib/learn/copy/receipts";
import type {FillReceipt} from "@/lib/trading/receipts";
import type {PaperTradeRecord} from '@/lib/trading/types';

// The trade desk's most recent fill in the active account: what it was, what it did to the
// account (the receipt) and, when the learner wrote one, their why. Server component; the
// page reads the ledger once and hands the last row and its receipt in.
const LastFill = ({trade, receipt}: {trade: PaperTradeRecord | null; receipt?: FillReceipt}) => (
    <Panel as="section" id="last-fill" pad={4}>
        <MicroLabel as="p">{LAST_FILL_COPY.heading}</MicroLabel>
        {trade === null ? (
            <p className="mt-1 text-xs text-fg-muted">{LAST_FILL_COPY.empty}</p>
        ) : (
            <div className="mt-1 space-y-0.5">
                <p className={cn('font-mono text-sm', trade.side === 'buy' ? 'text-brand' : 'text-negative')} data-testid="last-fill-title">
                    {LAST_FILL_COPY.title(trade.side, trade.quantity, trade.symbol, trade.price, trade.createdAt)}
                </p>
                {receipt && <p data-testid="fill-receipt" className="font-mono text-[11px] text-fg-muted">{receiptLine(receipt)}</p>}
                {trade.reason && trade.source === 'user' && (
                    <p data-testid="last-fill-note" className="text-[11px] text-fg-soft break-words">{LAST_FILL_COPY.note(trade.reason)}</p>
                )}
            </div>
        )}
    </Panel>
);

export default LastFill;
