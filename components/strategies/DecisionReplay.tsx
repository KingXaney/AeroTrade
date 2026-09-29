import type {SignalColumn, SignalRow} from "@/lib/strategies/types";
import {visibleSignalColumns, type RunOrderView} from "@/lib/strategies/views";
import {SignalRowLine} from "@/components/strategies/SignalBoard";
import {REPLAY_COPY} from "@/lib/learn/copy/replay";
import AskLink from "@/components/chat/AskLink";

// The one disclosure an automated fill gets: the stored board row the rule looked at
// that morning, rendered with the catalog's own columns, and the planned order's reason
// beneath it. When the row is gone (expired record, pre-record fill) only the caption
// says so. Bundle A's decoded reason joins this same disclosure later.

type Props = {
    columns: readonly SignalColumn[];
    row: SignalRow | null;
    order: RunOrderView | null;
    caption: string;
    strategyName: string;
};

const DecisionReplay = ({columns, row, order, caption, strategyName}: Props) => (
    <div className="mt-2 space-y-1.5" data-replay-body>
        <p className="font-mono text-[11px] text-fg-muted">{caption}</p>
        {row && <SignalRowLine columns={visibleSignalColumns(columns, [row])} row={row} />}
        {order && (
            <p className="text-[11px] text-fg-muted leading-snug">
                <span className="font-mono uppercase tracking-[0.1em] text-[10px]">{REPLAY_COPY.plannedOrder} · </span>
                {order.reason}
            </p>
        )}
        {order && <AskLink input={{kind: 'reason', reason: order.reason, symbol: order.symbol, strategy: strategyName}} />}
    </div>
);

export default DecisionReplay;
