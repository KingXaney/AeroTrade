'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import RatingBadge from "@/components/agent-world/RatingBadge";
import ReasonGloss from "@/components/learn/ReasonGloss";
import ActionButton from "@/components/primitives/ActionButton";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {runWithToast} from "@/lib/action-toast";
import {approveSession, declineSession} from "@/lib/actions/agent-world.actions";
import {ORDER_SIDE_LABELS} from "@/lib/agent-world/config";
import {approvalState, formatCents, formatTokens} from "@/lib/agent-world/page-view";
import type {SessionView} from "@/lib/agent-world/types";
import {formatEasternTimestamp, formatPrice, formatTimeUntilMs} from "@/lib/format";
import {ACTION_COPY, APPROVAL_COPY, FLOOR_COPY, RUN_STATUS_COPY} from "@/lib/learn/copy/agent-world";

const pct = (weight: number): string => `${Number((weight * 100).toFixed(1))}%`;

// What the ratings became, and what was done with it: each symbol's rating, the orders code sized
// from them, the decision (the owner's two buttons while it waits, the record after), the fills,
// and the session's cost. The orders and the approval come only after the desk is done.
const DecisionPanel = ({session, owner, enabled, now, ratingTitle, onDecided}: {
    session: SessionView;
    owner: boolean;
    enabled: boolean;
    now: number;
    ratingTitle: string;
    onDecided: () => void;
}) => {
    const router = useRouter();
    const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
    const state = approvalState(session);
    // An owner's address is shown to the owners alone; every other reader sees "the owner".
    const who = (by: string | null): string => (owner && by ? by : APPROVAL_COPY.ownerWord);
    const deskDone = session.serviceFinishedAt !== null || session.orders.length > 0 || session.finishedAt !== null;

    const decide = async (kind: 'approve' | 'decline') => {
        setBusy(kind);
        const action = kind === 'approve' ? approveSession : declineSession;
        const ok = await runWithToast(() => action({sessionId: session.sessionId}), toast, {success: kind === 'approve' ? ACTION_COPY.approved : ACTION_COPY.declined, error: ACTION_COPY.notSaved});
        setBusy(null);
        if (ok) {
            router.refresh();
            onDecided();
        }
    };

    return (
        <div className="space-y-5" data-aw-decision>
            <div>
                <SectionHeading size="sm">{FLOOR_COPY.decisionHeading}</SectionHeading>
                <ul data-aw-ratings className="flex flex-wrap gap-x-5 gap-y-2">
                    {session.runs.map((run) => (
                        <li key={run.symbol} data-aw-rating-row={run.symbol} className="flex items-center gap-2 text-sm">
                            <span className="font-mono text-fg">{run.symbol}</span>
                            {run.rating ? <RatingBadge rating={run.rating} title={ratingTitle} /> : <span className="text-xs text-fg-muted">{RUN_STATUS_COPY[run.status]}</span>}
                        </li>
                    ))}
                </ul>
                {session.runs.some((run) => run.rating === 'REVIEW') && <p className="mt-2 text-xs text-fg-muted">{FLOOR_COPY.reviewNote}</p>}
            </div>

            <div>
                <SectionHeading size="sm">{FLOOR_COPY.ordersHeading}</SectionHeading>
                <p className="text-xs text-fg-muted max-w-3xl mb-2">{FLOOR_COPY.ordersLead}</p>
                {session.orders.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table data-aw-orders className="w-full text-sm">
                            <thead>
                                <tr className="text-left">
                                    {[FLOOR_COPY.columns.symbol, FLOOR_COPY.columns.rating, FLOOR_COPY.columns.held, FLOOR_COPY.columns.target, FLOOR_COPY.columns.side, FLOOR_COPY.columns.shares].map((label) => (
                                        <th key={label} className="pb-1 pr-4 font-normal"><MicroLabel>{label}</MicroLabel></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {session.orders.map((order) => (
                                    <tr key={`${order.side}-${order.symbol}`} data-aw-order={order.symbol} className="border-t border-line">
                                        <td className="py-1.5 pr-4 font-mono text-fg">{order.symbol}</td>
                                        <td className="py-1.5 pr-4"><RatingBadge rating={order.rating} title={ratingTitle} /></td>
                                        <td className="py-1.5 pr-4 tabular-nums text-fg-muted">{pct(order.currentWeight)}</td>
                                        <td className="py-1.5 pr-4 tabular-nums text-fg">{order.targetWeight === null ? FLOOR_COPY.targetKeep : pct(order.targetWeight)}</td>
                                        <td className="py-1.5 pr-4 text-fg">{ORDER_SIDE_LABELS[order.side]}</td>
                                        <td className="py-1.5 pr-4 tabular-nums text-fg">{order.quantity.toLocaleString('en-US')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {session.orders.some((order) => (order.gloss ?? []).length > 0) && (
                            <Disclosure variant="link" summary={FLOOR_COPY.ruleSaw} className="mt-2" data-aw-rule-saw>
                                <div className="mt-2 space-y-3">
                                    {session.orders.map((order) => (
                                        <div key={`${order.side}-${order.symbol}`}>
                                            <span className="font-mono text-xs text-fg">{order.symbol}</span>
                                            <ReasonGloss clauses={order.gloss ?? []} quoted={order.reason} className="mt-1" />
                                        </div>
                                    ))}
                                </div>
                            </Disclosure>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-fg-muted" data-aw-orders-empty>
                        {session.status === 'running' && session.serviceFinishedAt !== null ? FLOOR_COPY.planning : deskDone ? FLOOR_COPY.ordersNone : FLOOR_COPY.ordersPending}
                    </p>
                )}
            </div>

            <div data-aw-approval={session.approval} data-aw-approval-state={state}>
                <SectionHeading size="sm">{APPROVAL_COPY.heading}</SectionHeading>
                {state === 'pending' && (
                    <div className="space-y-3">
                        <p className="text-sm text-fg">{owner && enabled ? APPROVAL_COPY.prompt : APPROVAL_COPY.waiting}</p>
                        {session.lapseAt !== null && (
                            <p className="text-xs text-fg-muted" data-aw-lapse>
                                {APPROVAL_COPY.lapses(formatEasternTimestamp(session.lapseAt), formatTimeUntilMs(session.lapseAt, now))}
                            </p>
                        )}
                        {owner && enabled && (
                            <div className="flex flex-wrap gap-2">
                                <ActionButton variant="strong" data-aw-approve disabled={busy !== null} onClick={() => void decide('approve')}>
                                    {busy === 'approve' ? APPROVAL_COPY.approving : APPROVAL_COPY.approve}
                                </ActionButton>
                                <ActionButton variant="danger" data-aw-decline disabled={busy !== null} onClick={() => void decide('decline')}>
                                    {busy === 'decline' ? APPROVAL_COPY.declining : APPROVAL_COPY.decline}
                                </ActionButton>
                            </div>
                        )}
                    </div>
                )}
                {state === 'approved' && session.decision && <p className="text-sm text-fg">{APPROVAL_COPY.approved(who(session.decision.by), formatEasternTimestamp(session.decision.at))}</p>}
                {state === 'approved-auto' && <p className="text-sm text-fg">{APPROVAL_COPY.approvedAuto}</p>}
                {state === 'declined' && session.decision && <p className="text-sm text-fg">{APPROVAL_COPY.declined(who(session.decision.by), formatEasternTimestamp(session.decision.at))}</p>}
                {state === 'lapsed' && session.decision && <p className="text-sm text-fg">{APPROVAL_COPY.lapsed(formatEasternTimestamp(session.decision.at))}</p>}
                {state === 'preview' && <p className="text-sm text-fg-muted">{APPROVAL_COPY.previewNone}</p>}
                {state === 'none' && <p className="text-sm text-fg-muted">{FLOOR_COPY.ordersPending}</p>}
                {session.status === 'approved' && session.fills.length === 0 && <p className="mt-2 text-xs text-fg-muted">{FLOOR_COPY.waitingOpen}</p>}
                {session.paperclip.mirrored === false && <p className="mt-2 text-xs text-warning">{APPROVAL_COPY.mirrorFailed}</p>}
                {session.paperclip.mirrored === true && <p className="mt-2 text-xs text-fg-muted">{APPROVAL_COPY.mirrored}</p>}
            </div>

            <div>
                <SectionHeading size="sm">{FLOOR_COPY.fillsHeading}</SectionHeading>
                {session.fills.length > 0 ? (
                    <ul data-aw-fills className="space-y-1 text-sm">
                        {session.fills.map((fill) => (
                            <li key={`${fill.side}-${fill.symbol}`} data-aw-fill={fill.symbol} data-ok={fill.executed ? 'true' : 'false'} className={fill.executed ? 'text-fg' : 'text-fg-muted'}>
                                {fill.executed && fill.price !== null
                                    ? FLOOR_COPY.fillLine(fill.symbol, fill.side === 'sell', fill.quantity, formatPrice(fill.price))
                                    : FLOOR_COPY.fillFailed(fill.symbol, fill.message ?? '')}
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-fg-muted">{FLOOR_COPY.fillsNone}</p>}
            </div>

            <p className="text-xs text-fg-muted tabular-nums" data-aw-cost>
                {FLOOR_COPY.costLine(session.cost.llmCalls, session.cost.toolCalls, formatTokens(session.cost.tokensIn), formatTokens(session.cost.tokensOut), formatCents(session.cost.totalCents))}
            </p>
            {session.service && <p className="text-xs text-warning" data-aw-service-stopped>{FLOOR_COPY.serviceStopped(session.service.message || session.service.outcome)}</p>}
        </div>
    );
};

export default DecisionPanel;
