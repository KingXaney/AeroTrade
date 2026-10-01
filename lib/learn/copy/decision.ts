// Copy for a strategy page's "Latest decision" panel (components/strategies/LatestDecision.tsx):
// the empty state, the run's mode badge and its dated line, each order's size and outcome, the
// skipped-order line and the heading over the signal board. What the run itself stored — its
// summary, each order's reason and message, each skipped order's reason — is the rule's and the
// job's own wording, quoted as stored: these lines only frame it. A data issue is the job's own
// sentence with nothing around it, so it has no entry here. The test holds every line to the
// 'copy' tier of lib/learn/banned.ts.

import {formatPrice} from "@/lib/format";
import type {RunOrderView, StrategyRunView} from "@/lib/strategies/views";

export const DECISION_COPY = {
    emptyTitle: 'No decisions yet.',
    emptyDescription: 'The first run happens on the next trading morning.',
    mode: {
        live: 'Live run',
        preview: 'Preview — nothing traded',
        skipped: 'Skipped',
    } satisfies Record<StrategyRunView['mode'], string>,
    // The run's trading day, the close it decided from, and the job's own one-line summary.
    runLine: (date: string, asOf: string, summary: string): string => `${date} · from the ${asOf} close · ${summary}`,
    rebalanced: '· rule evaluated its allocation today',
    noOrders: 'Nothing to do — the rule held its positions.',
    orderSize: (quantity: number, kind: RunOrderView['kind']): string => `${quantity} share${quantity === 1 ? '' : 's'} · ${kind}`,
    // An order's outcome: its fill price, or why it did not fill (a preview never fills; a live
    // order that failed carries the order path's own message).
    outcome: (order: Pick<RunOrderView, 'executed' | 'price' | 'message'>, mode: StrategyRunView['mode']): string => {
        if (order.executed) return `filled${order.price !== null ? ` @ ${formatPrice(order.price)}` : ''}`;
        if (mode === 'preview') return 'not filled (preview)';
        return `not filled${order.message ? ` — ${order.message}` : ''}`;
    },
    skipped: (symbol: string, reason: string): string => `${symbol}: ${reason}`,
    watching: 'What it is watching',
} as const;
