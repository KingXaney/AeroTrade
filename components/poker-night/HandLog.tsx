'use client';

// The hand log, in its drawer: the hand in play line by line (GET detail?part=log, read again as
// the hand moves while the drawer is open), then the hands before it from history (GET
// detail?part=history, ten at a time, "Show earlier hands" for more), each in LOG_COPY's words
// through lib/poker-night/hand-log. A hand history already holds is not printed twice. A hand shown
// to the viewer alone ("Shown to you: …") is in both: the hand just ended prints it from the view's
// own part (MeView.shownToMe), and history is read again when one comes.

import {useEffect, useState} from "react";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {Drawer} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {LOG_COPY, OVERLAY_COPY, POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {currentHandLog, historyHandLog, seatNamer, type LogHand} from "@/lib/poker-night/hand-log";
import {playerAt} from "@/lib/poker-night/reveal";
import type {HandEntryView, HandSummaryView} from "@/lib/poker-night/view-types";
import {cn} from "@/lib/utils";

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean};

type Current = {hand: number; log: HandEntryView[]};
type History = {hands: HandSummaryView[]; done: boolean};

const HandBlock = ({hand}: {hand: LogHand}) => (
    <Panel pad={4} as="article" className="space-y-2" aria-label={hand.title} data-log-hand={hand.no}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionHeading as="h3" size="xs" spacing="none">{hand.title}</SectionHeading>
            {hand.blinds && <MicroLabel>{hand.blinds}</MicroLabel>}
        </div>
        <ol className="space-y-1 text-sm">
            {hand.lines.map((line) => (
                <li key={line.key} data-log-line={line.kind}
                    className={cn(
                        line.kind === 'street' && 'pt-1.5 font-mono text-xs text-fg-muted',
                        line.kind === 'move' && 'text-fg-soft',
                        line.kind === 'show' && 'text-fg',
                        line.kind === 'result' && 'font-medium text-fg',
                        line.kind === 'note' && 'text-xs text-fg-muted',
                    )}>
                    {line.text}
                </li>
            ))}
        </ol>
        {hand.truncated && <p className="text-[11px] text-fg-muted">{LOG_COPY.truncated}</p>}
    </Panel>
);

const HandLog = ({open, onOpenChange, toTable}: Props) => {
    const room = useRoom();
    const table = room.table;
    const hand = table.hand;
    const {detail} = room;
    const [current, setCurrent] = useState<Current | null>(null);
    const [history, setHistory] = useState<History | null>(null);
    const [failed, setFailed] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const handNo = hand?.no ?? null;
    const logLength = hand?.logLength ?? 0;
    const shownToMe = room.me?.shownToMe ?? [];
    const seenKey = shownToMe.map((h) => h.seat).join(',');

    // The hand in play: read on open and whenever it moves.
    useEffect(() => {
        if (!open || handNo === null) return;
        let live = true;
        void detail('log').then((d) => {
            if (!live) return;
            if (d && d.part === 'log' && d.hand !== null) {
                setCurrent({hand: d.hand, log: d.log});
                setFailed(false);
            }
            else if (!d) setFailed(true);
        });
        return () => {
            live = false;
        };
    }, [open, handNo, logLength, detail]);

    // The hands before it: read on open and whenever a hand completes.
    useEffect(() => {
        if (!open) return;
        let live = true;
        void detail('history').then((d) => {
            if (!live) return;
            if (d && d.part === 'history') {
                setHistory({hands: d.hands, done: d.hands.length === 0});
                setFailed(false);
            }
            else if (!d) setFailed(true);
        });
        return () => {
            live = false;
        };
    }, [open, handNo, seenKey, detail]);

    const more = async () => {
        if (!history || loadingMore) return;
        const oldest = history.hands[history.hands.length - 1];
        if (!oldest) return;
        setLoadingMore(true);
        const d = await detail('history', {before: oldest.no});
        setLoadingMore(false);
        if (d && d.part === 'history') {
            const known = new Set(history.hands.map((h) => h.no));
            setHistory({hands: [...history.hands, ...d.hands.filter((h) => !known.has(h.no))], done: d.hands.length === 0});
        }
    };

    const nameOf = seatNamer((seat) => playerAt(table, seat), table.people);
    const fromHistory = (history?.hands ?? []).map((h) => historyHandLog(h, table.people, room.me?.pid ?? null, h.no === handNo ? shownToMe : []));
    const showCurrent = hand !== null && current !== null && current.hand === hand.no && !fromHistory.some((h) => h.no === hand.no);
    const now = showCurrent ? currentHandLog(hand.no, current.log, hand, hand.phase === 'complete' ? hand.result : null, nameOf, shownToMe) : null;
    const loading = open && history === null && !failed;
    const oldest = history?.hands[history.hands.length - 1];

    return (
        <Drawer open={open} onOpenChange={onOpenChange} title={LOG_COPY.heading} toTable={toTable} data-pn-drawer="log">
            {loading && <p className="text-xs text-fg-muted" aria-live="polite">{OVERLAY_COPY.loading}</p>}
            {failed && history === null && <p role="alert" className="text-xs text-negative">{POKER_NIGHT_ERRORS.unavailable}</p>}
            {!loading && !now && fromHistory.length === 0 && !failed && <p className="text-sm text-fg-muted">{LOG_COPY.empty}</p>}
            {now && <HandBlock hand={now}/>}
            {fromHistory.length > 0 && (
                <section className="space-y-3" aria-label={LOG_COPY.earlier}>
                    {now && <MicroLabel as="p">{LOG_COPY.earlier}</MicroLabel>}
                    {fromHistory.map((h) => <HandBlock key={h.no} hand={h}/>)}
                </section>
            )}
            {history && !history.done && oldest && oldest.no > 1 && (
                <ActionButton variant="secondary" size="md" className="min-h-11 w-full" disabled={loadingMore} aria-busy={loadingMore}
                              onClick={() => void more()} data-log-more="">
                    {LOG_COPY.more}
                </ActionButton>
            )}
        </Drawer>
    );
};

export default HandLog;
