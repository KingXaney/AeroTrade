'use client';

// The join card: a Panel over the live table, behind a scrim that keeps the felt's words from
// reading through it, for someone who opened the link — the table's terms,
// a name already filled in (the account's, else the one this browser kept), a look already rolled
// (on the server for a guest, kept from then on; Roll rolls another in its click handler, and
// "Change my look" opens the avatar builder in the card — optional, one tap away), the
// chips field only when the table's minimum and cap differ, and one tap: "Sit down" (in the seat
// they chose with "Sit here", else the first one open) or "Just watch". Once the first hand is dealt
// the card says that the host approves the chips before the player is dealt in (they sit with none
// until then: the dock says "Waiting for the host to approve your chips", with Cancel). A removed visitor, a locked
// table and a full room get the sentence that says so, what would change it, "Check again", the way
// home ("/": the landing page for a guest, never the sign-in the lobby would send them to) and, for
// an account, the lobby. Someone already watching who asks for a seat gets the same card without
// the name and look, which they have.
//
// A visitor polls nothing (the routes answer only players), so the card reads the page again every
// VISITOR_REFRESH_MS while it is in front and whenever it comes back: the table behind it stays
// current, and a card that had nothing to press learns that the host let them back in, opened the
// table or freed a seat (a removal lifted is a different room on the page, which remounts it).

import {useEffect, useId, useRef, useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Dices, Palette} from "lucide-react";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField from "@/components/primitives/TextField";
import AvatarBuilder from "@/components/poker-night/AvatarBuilder";
import {HomeLink} from "@/components/poker-night/HomeLink";
import {MiniAvatar} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {AVATAR_COPY, HOST_COPY, JOIN_COPY, LOOKS_COPY, OVERLAY_COPY, POKER_NIGHT_ERRORS, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {encodeAvatar, resolveAvatar, rollAvatar} from "@/lib/poker-night/avatar";
import {VISITOR_REFRESH_MS} from "@/lib/poker-night/feed";
import {NAME_INPUT_MAX} from "@/lib/poker-night/input";
import {chipsInValue, chipsRange, joinCardState, joinNotes, openSeats} from "@/lib/poker-night/overlays";

type Props = {
    seat: number | null; // the seat chosen with "Sit here", else the first one open
    onClose?: () => void; // a watcher's Cancel
};

const JoinCard = ({seat, onClose}: Props) => {
    const room = useRoom();
    const router = useRouter();
    const id = useId();
    const nameField = useRef<HTMLInputElement>(null);
    const joining = useRef(false);
    const [checking, startCheck] = useTransition();
    const [draft, setDraft] = useState<string | null>(null);
    const [chips, setChips] = useState<string | null>(null);
    const [busy, setBusy] = useState<'player' | 'watcher' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const visitor = room.joinView !== null;
    const name = draft ?? room.profile.name;
    const avatar = room.profile.avatar;
    const config = room.config;

    // A wide screen starts in the name field; a phone keeps its keyboard down until asked.
    useEffect(() => {
        if (visitor && !window.matchMedia('(max-width: 639px)').matches) nameField.current?.focus({preventScroll: true});
    }, [visitor]);

    // The page read again while it is in front (never mid-join): the visitor's only news.
    useEffect(() => {
        if (!visitor) return;
        const refresh = () => {
            if (!document.hidden && !joining.current) router.refresh();
        };
        const timer = setInterval(refresh, VISITOR_REFRESH_MS);
        const onVisibility = () => {
            if (!document.hidden) refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [visitor, router]);

    const state = room.joinView ? joinCardState(room.joinView) : null;
    const range = room.joinView ? chipsRange(room.joinView.buyIn.min, room.joinView.buyIn.max) : chipsRange(config.buyInMin, config.buyInMax);
    const chipsText = chips ?? (range ? String(range.max) : '');
    const chipsValue = range ? chipsInValue(chipsText, range) : null;
    const free = openSeats(room.table);
    const chosen = seat !== null && free.includes(seat) ? seat : null;
    const canSit = state ? state.kind === 'open' && state.canSit : free.length > 0;
    const canWatch = state ? state.kind === 'open' && state.canWatch : false;
    const face = AVATAR_COPY.faces[resolveAvatar(avatar).face];
    // Once the first hand is dealt, anyone but the host sits with no chips until the host says yes.
    const needsApproval = room.joinView ? room.joinView.needsApproval : room.table.handNo > 0 && !(room.me?.isHost ?? false);

    const join = async (as: 'player' | 'watcher') => {
        if (busy) return;
        if (as === 'player' && range && chipsValue === null) {
            setError(JOIN_COPY.chipsInRule(range.min, range.max));
            return;
        }
        setBusy(as);
        joining.current = true;
        setError(null);
        const own = room.me ? room.table.people[room.me.pid] : null;
        const r = await room.join({
            name: own?.name ?? name, avatar: own?.avatar ?? avatar, as,
            ...(as === 'player' && chosen !== null ? {seat: chosen} : {}),
            ...(as === 'player' && range && chipsValue !== null ? {buyIn: chipsValue} : {}),
        });
        setBusy(null);
        joining.current = false;
        if (!r.ok) {
            setError(r.message);
            return;
        }
        for (const note of joinNotes(r.outcome, r.renamed, r.view, as)) toast.message(note);
        onClose?.();
    };

    const blocked = state && state.kind !== 'open'
        ? state.kind === 'removed' ? JOIN_COPY.banned : state.kind === 'locked' ? JOIN_COPY.locked : POKER_NIGHT_ERRORS.room_full
        : null;
    const next = state?.kind === 'removed' ? JOIN_COPY.bannedNext : state?.kind === 'locked' ? JOIN_COPY.lockedNext : JOIN_COPY.fullNext;

    return (
        <>
            {/* A scrim between the table and the card, so the felt's words never read through the form;
                taps still reach the table (an open seat's Sit here), and the top bar stays clear. */}
            <div aria-hidden="true" data-join-scrim=""
                 className="pointer-events-none fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+3rem)] z-40 bg-bg/70 backdrop-blur-sm"/>
            <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center sm:inset-x-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
                <Panel pad={5} className="pointer-events-auto max-h-[calc(100dvh-5rem)] w-full max-w-sm space-y-4 overflow-y-auto"
                       aria-labelledby={`${id}-heading`} data-join-card={visitor ? 'visitor' : 'watcher'}>
                    <div className="space-y-1">
                        <SectionHeading as="h2" spacing="none" id={`${id}-heading`}>{visitor ? JOIN_COPY.heading : OVERLAY_COPY.takeSeat}</SectionHeading>
                        <p className="text-xs text-fg-muted" data-join-terms="">{JOIN_COPY.terms(config.smallBlind, config.bigBlind, config.buyInMax)}</p>
                    </div>

                    {blocked ? (
                        <div className="space-y-3">
                            <p role="status" className="text-sm text-fg-soft" data-join-blocked={state?.kind}>{blocked}</p>
                            <p className="text-xs text-fg-muted">{next}</p>
                            <div className="flex flex-wrap gap-2">
                                <ActionButton variant="primary" size="md" className="min-h-11" disabled={checking} aria-busy={checking}
                                              onClick={() => startCheck(() => router.refresh())} data-join-check="">
                                    {JOIN_COPY.checkAgain}
                                </ActionButton>
                                {/* Home is "/" for everyone (a guest's is the landing page); only an account has a lobby to go back to. */}
                                <HomeLink className={actionButton({variant: 'secondary', size: 'md', className: 'inline-flex min-h-11 items-center'})} data-join-home="">
                                    {TABLE_COPY.home}
                                </HomeLink>
                                {room.hasAccount && (
                                    <a href="/poker-night" className={actionButton({variant: 'secondary', size: 'md', className: 'inline-flex min-h-11 items-center'})} data-join-lobby="">
                                        {TABLE_COPY.toLobby}
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form className="space-y-4" onSubmit={(e) => {
                            e.preventDefault();
                            void join(canSit ? 'player' : 'watcher');
                        }}>
                            {visitor ? (
                                <>
                                    <p className="text-sm text-fg-soft">{JOIN_COPY.lead}</p>
                                    {building ? (
                                        <div className="space-y-2" data-pn-join-builder="">
                                            <AvatarBuilder compact value={avatar} onChange={(next) => room.setProfile({avatar: next})}/>
                                            <ActionButton variant="secondary" size="md" className="min-h-11" aria-expanded="true" onClick={() => setBuilding(false)}>
                                                {LOOKS_COPY.customizeDone}
                                            </ActionButton>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <MiniAvatar avatar={avatar} size="lg" label={JOIN_COPY.lookLabel(AVATAR_COPY.describe(resolveAvatar(avatar)))}/>
                                            <div className="flex min-w-0 flex-wrap gap-2">
                                                <ActionButton variant="secondary" size="md" className="inline-flex min-h-11 items-center gap-2" data-roll-look=""
                                                              onClick={() => room.setProfile({avatar: encodeAvatar(rollAvatar(Math.random))})}>
                                                    <Dices className="size-4" aria-hidden="true"/>
                                                    {JOIN_COPY.roll}
                                                </ActionButton>
                                                <ActionButton variant="secondary" size="md" className="inline-flex min-h-11 items-center gap-2" aria-expanded="false"
                                                              onClick={() => setBuilding(true)} data-pn-customize="">
                                                    <Palette className="size-4" aria-hidden="true"/>
                                                    {LOOKS_COPY.customize}
                                                </ActionButton>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <MicroLabel as="label" htmlFor={`${id}-name`}>{JOIN_COPY.nameLabel}</MicroLabel>
                                        <TextField ref={nameField} id={`${id}-name`} font="body" className="h-11 w-full" value={name} maxLength={NAME_INPUT_MAX}
                                                   placeholder={JOIN_COPY.namePlaceholder} autoComplete="nickname" enterKeyHint="go"
                                                   aria-describedby={`${id}-name-rule`} data-join-name=""
                                                   onChange={(e) => setDraft(e.target.value)}/>
                                        <p id={`${id}-name-rule`} className="text-[11px] text-fg-muted">
                                            {name.trim() === '' ? JOIN_COPY.blankName(face) : JOIN_COPY.nameRule}
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-fg-soft">{OVERLAY_COPY.takeSeatLead}</p>
                            )}

                            {canSit && range && (
                                <div className="space-y-1.5">
                                    <MicroLabel as="label" htmlFor={`${id}-chips`}>{JOIN_COPY.chipsInLabel}</MicroLabel>
                                    <TextField id={`${id}-chips`} inputMode="numeric" autoComplete="off" className="h-11 w-full" value={chipsText}
                                               aria-describedby={`${id}-chips-rule`} aria-invalid={chipsValue === null} data-join-chips=""
                                               onChange={(e) => setChips(e.target.value)}/>
                                    <p id={`${id}-chips-rule`} className="text-[11px] text-fg-muted">{JOIN_COPY.chipsInRule(range.min, range.max)}</p>
                                </div>
                            )}

                            {canSit && needsApproval && (
                                <p className="text-xs text-fg-soft" data-join-approval="">{JOIN_COPY.approvalNote}</p>
                            )}

                            {!canSit && visitor && (
                                <p className="text-sm text-fg-soft">{canWatch ? JOIN_COPY.full : POKER_NIGHT_ERRORS.watchers_full}</p>
                            )}

                            <div className="flex flex-col gap-2">
                                {canSit && (
                                    <ActionButton type="submit" variant="strong" size="block" glow className="min-h-12" disabled={busy !== null}
                                                  aria-busy={busy === 'player'} data-join-sit="">
                                        {busy === 'player' ? JOIN_COPY.joining : chosen !== null ? JOIN_COPY.sitIn(chosen) : JOIN_COPY.sit}
                                    </ActionButton>
                                )}
                                {visitor && canWatch && (
                                    <ActionButton variant="secondary" size="md" className="min-h-11" disabled={busy !== null} aria-busy={busy === 'watcher'}
                                                  onClick={() => void join('watcher')} data-join-watch="">
                                        {JOIN_COPY.watch}
                                    </ActionButton>
                                )}
                                {!visitor && onClose && (
                                    <ActionButton variant="secondary" size="md" className="min-h-11" disabled={busy !== null} onClick={onClose}>
                                        {HOST_COPY.cancel}
                                    </ActionButton>
                                )}
                            </div>
                            {error && <p role="alert" className="text-xs text-negative" data-join-error="">{error}</p>}
                        </form>
                    )}
                </Panel>
            </div>
        </>
    );
};

export default JoinCard;
