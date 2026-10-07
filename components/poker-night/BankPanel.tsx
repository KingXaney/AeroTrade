'use client';

// The bank, in its drawer: play chips only, counted. The viewer's own chips first — the same
// figure as their Stack below (a live pot counted, said beside it) — with a rebuy at zero or a
// top-up to the cap by the table's rules (a request when the host approves them; while chips are in
// the pot it says what it adds, since a top-up counts only the chips behind); then
// the host's waiting requests with Approve and Decline; then every player who sat tonight — Chips
// in, Rebuys (only once someone has rebought), Stack (a live pot counted, said once at the foot),
// Net with its sign — and the footer's check that every chip is accounted for. "Chips in, by time"
// reads GET detail?part=bank when the drawer opens and again whenever the ledger moves.

import {useEffect, useId, useState} from "react";
import {toast} from "sonner";
import ActionButton from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";
import {Drawer, MiniAvatar, PlayerName} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {BANK_COPY, HOST_COPY, OVERLAY_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {bankView} from "@/lib/poker-night/bank";
import {bankTimeline, chipsInValue, ownChips} from "@/lib/poker-night/overlays";
import type {BankDetailRowView} from "@/lib/poker-night/view-types";
import {cn} from "@/lib/utils";

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean};

const count = TABLE_COPY.chips;

// The viewer's own chips: what they hold and what they may add.
const OwnChipsPanel = () => {
    const room = useRoom();
    const id = useId();
    const view = room.view;
    const own = view ? ownChips(view) : null;
    const [busy, setBusy] = useState(false);
    const [other, setOther] = useState('');
    if (!view || !own) return null;
    const offer = own.offer;

    const buy = async (amount: number) => {
        if (busy) return;
        setBusy(true);
        const r = await room.send({type: 'buy', amount});
        setBusy(false);
        if (!r.ok) {
            toast.error(r.message);
            return;
        }
        setOther('');
        const after = r.view.me.seat === null ? null : r.view.seats[r.view.me.seat];
        if (r.view.requests.some((q) => q.pid === r.view.me.pid)) toast.message(BANK_COPY.requested(amount));
        else if (after && after.pendingBuy > 0) toast.message(BANK_COPY.pending(after.pendingBuy));
        else toast.success(BANK_COPY.approved(amount));
    };

    const typed = offer ? chipsInValue(other, {min: offer.min, max: offer.max}) : null;
    return (
        <Panel pad={4} className="space-y-3" aria-labelledby={`${id}-own`} data-own-chips="">
            <div className="flex items-baseline justify-between gap-3">
                <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-own`}>{OVERLAY_COPY.yourChips}</SectionHeading>
                <span className="font-mono text-lg tabular-nums text-fg" data-own-stack={own.stack}>{count(own.stack)}</span>
            </div>
            {own.inPot > 0 && <p className="text-xs text-fg-soft" data-own-in-pot="">{BANK_COPY.ownInPot(own.inPot)}</p>}
            {own.pendingBuy > 0 && <p className="text-xs text-fg-soft">{BANK_COPY.pending(own.pendingBuy)}</p>}
            {own.requested !== null && <p role="status" className="text-xs text-fg-soft" data-pn-requested="">{BANK_COPY.requested(own.requested)}</p>}
            {offer && (
                <div className="space-y-3">
                    <ActionButton variant="primary" size="md" className="min-h-11 w-full" disabled={busy} aria-busy={busy} data-pn-rebuy=""
                                  onClick={() => void buy(offer.topUp)}>
                        {offer.rebuy ? BANK_COPY.rebuy : own.inPot > 0 ? BANK_COPY.addChips(offer.topUp) : BANK_COPY.topUp(own.behind + own.pendingBuy + offer.topUp)}
                    </ActionButton>
                    {offer.min < offer.max && (
                        <form className="space-y-1.5" onSubmit={(e) => {
                            e.preventDefault();
                            if (typed !== null) void buy(typed);
                        }}>
                            <MicroLabel as="label" htmlFor={`${id}-amount`}>{BANK_COPY.otherAmount}</MicroLabel>
                            <div className="flex gap-2">
                                <TextField id={`${id}-amount`} inputMode="numeric" autoComplete="off" value={other} aria-describedby={`${id}-rule`}
                                           aria-label={BANK_COPY.amountLabel} className="h-11 min-w-0 flex-1" onChange={(e) => setOther(e.target.value)}/>
                                <ActionButton type="submit" variant="secondary" size="md" className="min-h-11" disabled={busy || typed === null}>
                                    {OVERLAY_COPY.addChips}
                                </ActionButton>
                            </div>
                            <p id={`${id}-rule`} className="text-[11px] text-fg-muted">{BANK_COPY.amountRule(offer.min, offer.max)}</p>
                        </form>
                    )}
                </div>
            )}
            {own.maxRebuys !== null && <p className="text-[11px] text-fg-muted">{BANK_COPY.rebuysUsed(own.used, own.maxRebuys)}</p>}
        </Panel>
    );
};

// The host's waiting requests: one row each, Approve and Decline.
export const RequestsPanel = () => {
    const room = useRoom();
    const id = useId();
    const [busy, setBusy] = useState<string | null>(null);
    if (!room.me?.isHost || room.table.requests.length === 0) return null;
    const people = room.table.people;

    const answer = async (pid: string, op: 'approve' | 'deny') => {
        if (busy) return;
        setBusy(pid);
        const r = await room.send({type: 'host', op: {op, pid}});
        setBusy(null);
        if (!r.ok) toast.error(r.message);
    };

    return (
        <Panel pad={4} className="space-y-2" aria-labelledby={`${id}-requests`} data-bank-requests="">
            <SectionHeading as="h3" size="xs" spacing="none" id={`${id}-requests`}>{HOST_COPY.requestsHeading}</SectionHeading>
            <ul className="space-y-2">
                {room.table.requests.map((q) => (
                    <RowCard as="li" key={q.pid} className="flex flex-wrap items-center gap-2 px-3 py-2" data-request={q.pid}>
                        <p className="min-w-0 flex-1 text-sm text-fg-soft">{HOST_COPY.request(people[q.pid]?.name ?? '', q.amount)}</p>
                        <div className="flex gap-2">
                            <ActionButton size="sm" className="min-h-11" disabled={busy !== null} onClick={() => void answer(q.pid, 'approve')} data-approve="">
                                {HOST_COPY.approve}
                            </ActionButton>
                            <ActionButton variant="danger" size="sm" className="min-h-11" disabled={busy !== null} onClick={() => void answer(q.pid, 'deny')} data-decline="">
                                {HOST_COPY.decline}
                            </ActionButton>
                        </div>
                    </RowCard>
                ))}
            </ul>
        </Panel>
    );
};

const BankPanel = ({open, onOpenChange, toTable}: Props) => {
    const room = useRoom();
    const table = room.table;
    const [detail, setDetail] = useState<BankDetailRowView[] | null>(null);
    const ledgerKey = table.ledger.map((r) => `${r.pid}:${r.bought}:${r.cashedOut}:${r.buys}`).join('|');
    const joined = room.view !== null;
    const {detail: readDetail} = room;

    // The bank's events, read when the drawer opens and again when the ledger moves.
    useEffect(() => {
        if (!open || !joined) return;
        let live = true;
        void readDetail('bank').then((d) => {
            if (live && d && d.part === 'bank') setDetail(d.bank);
        });
        return () => {
            live = false;
        };
    }, [open, joined, ledgerKey, readDetail]);

    const bank = bankView(table, {me: room.me?.pid ?? null, detail});
    const timeline = bankTimeline(bank.rows);
    const people = table.people;

    return (
        <Drawer open={open} onOpenChange={onOpenChange} title={BANK_COPY.heading} toTable={toTable} wide data-pn-drawer="bank">
            <p className="text-xs leading-relaxed text-fg-muted">{BANK_COPY.lead}</p>
            <OwnChipsPanel/>
            <RequestsPanel/>
            <Panel pad={4} className="space-y-3" data-bank="">
                <table className="w-full table-fixed border-collapse text-xs">
                    <thead>
                        <tr className="text-left">
                            <th scope="col" className="w-[38%] pb-2 font-normal"><MicroLabel>{BANK_COPY.columns.player}</MicroLabel></th>
                            <th scope="col" className="pb-2 text-right font-normal"><MicroLabel>{BANK_COPY.columns.chipsIn}</MicroLabel></th>
                            {bank.showRebuys && <th scope="col" className="pb-2 text-right font-normal"><MicroLabel>{BANK_COPY.columns.rebuys}</MicroLabel></th>}
                            <th scope="col" className="pb-2 text-right font-normal"><MicroLabel>{BANK_COPY.columns.stack}</MicroLabel></th>
                            <th scope="col" className="pb-2 text-right font-normal"><MicroLabel>{BANK_COPY.columns.net}</MicroLabel></th>
                        </tr>
                    </thead>
                    <tbody>
                        {bank.rows.map((row) => (
                            <tr key={row.pid} className={cn('border-t border-line-strong/15 align-top', row.me && 'bg-brand-strong/5')} data-bank-row={row.pid}>
                                <th scope="row" className="py-2 pr-2 text-left font-normal">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <MiniAvatar avatar={row.avatar}/>
                                        <span className="min-w-0">
                                            <PlayerName name={row.name} className="block text-sm text-fg"/>
                                            {row.me && <Badge tone="brand" className="mt-0.5">{TABLE_COPY.you}</Badge>}
                                            {row.removed && <span className="block text-[11px] text-fg-muted">{BANK_COPY.removed}</span>}
                                            {!row.seated && row.cashedOut > 0 && <span className="block text-[11px] text-fg-muted">{BANK_COPY.leftWith(row.cashedOut)}</span>}
                                        </span>
                                    </span>
                                </th>
                                <td className="py-2 text-right font-mono tabular-nums text-fg-soft">{count(row.chipsIn)}</td>
                                {bank.showRebuys && <td className="py-2 text-right font-mono tabular-nums text-fg-soft">{count(row.rebuys)}</td>}
                                <td className="py-2 text-right font-mono tabular-nums text-fg-soft">{count(row.stack)}</td>
                                <td className={cn('py-2 text-right font-mono tabular-nums', row.net > 0 ? 'text-positive' : row.net < 0 ? 'text-negative' : 'text-fg-soft')}
                                    data-net={row.net}>
                                    {BANK_COPY.net(row.net)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="space-y-1 border-t border-line-strong/15 pt-3 text-xs">
                    {bank.inPot > 0 && <p className="text-fg-muted">{BANK_COPY.inPot(bank.inPot)}</p>}
                    <p className={bank.balanced ? 'text-fg-soft' : 'text-warning'} data-bank-check="">
                        {BANK_COPY.check(bank.onTable, bank.broughtIn, bank.cashedOut)}
                    </p>
                </div>
            </Panel>
            {timeline.length > 0 && (
                <Disclosure summary={BANK_COPY.byTime} data-bank-timeline="">
                    <ol className="mt-2 space-y-1 text-xs text-fg-soft">
                        {timeline.map((item) => (
                            <li key={item.key} className="flex min-w-0 gap-2">
                                <PlayerName name={people[item.pid]?.name ?? item.name} className="max-w-[45%] text-fg"/>
                                <span className="min-w-0 flex-1">{BANK_COPY.event(item.kind, item.amount)}</span>
                            </li>
                        ))}
                    </ol>
                </Disclosure>
            )}
        </Drawer>
    );
};

export default BankPanel;
