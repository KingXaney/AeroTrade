'use client';

// Asks to see a hand, and the host's requests for chips, as the table says them as they come.
//
// - AskPrompt: a player who folded the hand just completed asks the viewer to see their cards. A card
//   under the top bar says who asks and how many seconds are left, with three answers — "Show Ana"
//   (to Ana alone: their view and their history of the hand), "Show everyone" (the table's show) and
//   "No thanks" — each a 44 px target behind a tap shield, so a tap meant for the plate's menu that
//   lands as the card appears does nothing. It sits under the top bar, never over the dock: the
//   viewer's own controls stay where they are. It goes when the ask is answered, runs out (the
//   server reads an unanswered ask as a no once its seconds are up) or the next hand is dealt, which
//   ends every ask. A short sound says it came (the viewer's sound on).
// - AskWatch: the viewer's own asks — how each ended, said once in a toast as the answer comes (or
//   the seconds run out with none).
// - RequestWatch: the host's — each new request for chips once the first hand is dealt (a new player's
//   first chips, a rebuy, a top-up), a short sound and a toast with Approve; the bank's rows hold
//   them all, Decline included, and a dot on the Bank and Host icons says they wait.

import {useEffect, useId, useRef, useState, type MouseEvent} from "react";
import {toast} from "sonner";
import ActionButton from "@/components/primitives/ActionButton";
import {MiniAvatar} from "@/components/poker-night/overlay-kit";
import {useRoom, useServerNow} from "@/components/poker-night/room-controller";
import {playSound} from "@/components/poker-night/sound-player";
import {useTapShield} from "@/components/poker-night/useTapShield";
import {ASK_COPY, HOST_COPY} from "@/lib/learn/copy/poker-night";
import {askKey, askNews, askToAnswer, newRequests, requestKind, type AskSeen, type RequestKind} from "@/lib/poker-night/overlays";
import type {AskReply} from "@/lib/poker-night/types";
import type {AskView} from "@/lib/poker-night/view-types";

// ── the viewer is asked ──

const AskCard = ({ask}: {ask: AskView}) => {
    const room = useRoom();
    const id = useId();
    const shield = useTapShield();
    const now = useServerNow(500);
    const [busy, setBusy] = useState<AskReply | null>(null);
    const person = room.table.people[ask.from];
    const name = person?.name ?? '';
    const left = Math.max(0, Math.ceil((ask.until - now) / 1000));

    // Said once as it comes, by sound too while the viewer keeps sounds on.
    const sound = room.personal.sound;
    const played = useRef(false);
    useEffect(() => {
        if (played.current) return;
        played.current = true;
        if (sound) playSound('ask');
    }, [sound]);

    const answer = async (show: AskReply, e: MouseEvent<HTMLButtonElement>) => {
        if (busy !== null || !shield.lands(e)) return;
        setBusy(show);
        const r = await room.send({type: 'reply', to: ask.from, show});
        setBusy(null);
        if (!r.ok) toast.error(r.message);
        else if (show === 'one') toast.message(ASK_COPY.shownOne(name));
    };

    const button = 'min-h-11 w-full whitespace-normal px-2 leading-tight';
    return (
        <section aria-labelledby={`${id}-ask`} className="chrome-surface pointer-events-auto w-full max-w-md space-y-2 rounded-lg p-3 shadow-lg"
                 data-pn-ask-prompt={ask.from} data-pn-armed={shield.armed ? '' : undefined}>
            <div className="flex items-center gap-2.5">
                <MiniAvatar avatar={person?.avatar ?? null}/>
                <p id={`${id}-ask`} className="min-w-0 flex-1 text-sm leading-snug text-fg" role="status">{ASK_COPY.prompt(name)}</p>
                <span className="shrink-0 font-mono text-xs tabular-nums text-fg-soft" role="timer" aria-live="off" aria-label={ASK_COPY.timer}
                      data-pn-ask-left={left}>
                    {ASK_COPY.secondsLeft(left)}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={ASK_COPY.region}>
                <ActionButton variant="primary" size="md" className={button} disabled={busy !== null} aria-busy={busy === 'one'}
                              onClick={(e) => void answer('one', e)} data-pn-reply="one">
                    <span className="line-clamp-2 break-words" data-user-text="">{ASK_COPY.showOne(name)}</span>
                </ActionButton>
                <ActionButton variant="secondary" size="md" className={button} disabled={busy !== null} aria-busy={busy === 'all'}
                              onClick={(e) => void answer('all', e)} data-pn-reply="all">
                    {ASK_COPY.showAll}
                </ActionButton>
                <ActionButton variant="secondary" size="md" className={button} disabled={busy !== null} aria-busy={busy === 'none'}
                              onClick={(e) => void answer('none', e)} data-pn-reply="none">
                    {ASK_COPY.noThanks}
                </ActionButton>
            </div>
        </section>
    );
};

// Mounted while an ask to the viewer waits (TableOverlays checks without the clock); the card reads
// the clock and goes once the seconds are up.
export const AskPrompt = () => {
    const room = useRoom();
    const now = useServerNow(500);
    const me = room.me;
    const ask = me ? askToAnswer(me, now) : null;
    if (!ask) return null;
    return (
        <div className="pn-ask-wrap">
            <AskCard key={askKey(ask)} ask={ask}/>
        </div>
    );
};

// ── the viewer's own asks ──

export const AskWatch = () => {
    const room = useRoom();
    const now = useServerNow(1000);
    const seen = useRef<AskSeen>({});
    const me = room.me;
    const people = room.table.people;
    useEffect(() => {
        if (!me) return;
        const {news, seen: next} = askNews(seen.current, me, now);
        seen.current = next;
        for (const {ask, answer} of news) {
            if (answer === 'waiting') continue;
            const name = people[ask.to]?.name ?? '';
            if (answer === 'shown') toast.success(ASK_COPY.ended.shown(name));
            else toast.message(ASK_COPY.ended[answer](name));
        }
    }, [me, now, people]);
    return null;
};

// ── the host's requests for chips ──

const REQUEST_TEXT: Record<RequestKind, (name: string, n: number) => string> = {
    seat: HOST_COPY.requestSeat, rebuy: HOST_COPY.requestRebuy, 'top-up': HOST_COPY.requestTopUp,
};

// A request's words in the bank's row and the host's toast.
export const requestText = (kind: RequestKind, name: string, amount: number): string => REQUEST_TEXT[kind](name, amount);

export const RequestWatch = () => {
    const room = useRoom();
    const view = room.view;
    const requests = view?.requests ?? null;
    const key = requests ? requests.map((r) => `${r.pid}:${r.amount}`).join(',') : null;
    const before = useRef<{key: string; requests: {pid: string; amount: number}[]} | null>(null);
    const sound = room.personal.sound;
    const {send} = room;
    useEffect(() => {
        if (!view || !requests || key === null) return;
        // Keyed on the requests' own figures: a poll that changes nothing of them says nothing.
        if (before.current?.key === key) return;
        const was = before.current?.requests ?? null;
        before.current = {key, requests};
        // A request answered (here, in the bank, or by another tab) or taken back: its toast goes.
        for (const r of was ?? []) if (!requests.some((q) => q.pid === r.pid)) toast.dismiss(`pn-request-${r.pid}`);
        // The first view holds what waited before the page opened: the dot says those.
        if (was === null || !view.me.isHost) return;
        const fresh = newRequests(was, requests);
        if (fresh.length === 0) return;
        if (sound) playSound('request');
        for (const r of fresh) {
            const name = view.people[r.pid]?.name ?? '';
            toast.message(requestText(requestKind(view, r.pid), name, r.amount), {
                id: `pn-request-${r.pid}`,
                duration: 15_000,
                action: {
                    label: HOST_COPY.approve,
                    onClick: () => {
                        void send({type: 'host', op: {op: 'approve', pid: r.pid}}).then((answer) => {
                            if (answer.ok) toast.success(HOST_COPY.approvedFor(name));
                            else toast.error(answer.message);
                        });
                    },
                },
            });
        }
    }, [key, view, requests, sound, send]);
    return null;
};
