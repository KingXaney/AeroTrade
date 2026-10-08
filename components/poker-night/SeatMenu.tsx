'use client';

// Another player's plate, tapped or clicked (P6): a menu with a row of things to throw at them —
// one tap and it flies — and "Mute Sam's emotes" for this visit (or "Show" to take it back). Once a
// hand the viewer was dealt into and folded is complete, it leads with "Ask to see their cards" for a
// player whose cards nobody saw (lib/poker-night/overlays.askOffer, the same rules the server keeps):
// greyed with the reason when that player turned asks off or a rule stands in the way (one ask
// waiting at a time, two a hand, five hands after a no), and once asked, how the ask stands. The
// plates themselves are drawn by Seat; this lays a clear button the plate's size (at least 44 px
// each way) over each other player's plate, so the menu needs nothing from the seat it sits on. The
// menu opens toward the table's middle (stage.menuSide), where it fits whole.
// Throws are offered to a seated viewer while the host keeps throwables on; a watcher, or a table
// with throwables off, gets a line saying why and the mute alone. Sending shares the picker's
// cooldown (emote-client.sendEmoteNow).

import {useState} from "react";
import {Eye, VolumeX, Volume2} from "lucide-react";
import {toast} from "sonner";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {sendEmoteNow, toggleMuted, useCoolingDown, useMutedPlayers} from "@/components/poker-night/emote-client";
import {focusTableOnClose, PlayerName} from "@/components/poker-night/overlay-kit";
import {useRoom, useServerNow} from "@/components/poker-night/room-controller";
import {ASK_COPY, EMOTE_COPY} from "@/lib/learn/copy/poker-night";
import {THROW_IDS, throwGlyph, type ThrowId} from "@/lib/poker-night/emotes";
import {askOffer, myTurnKey} from "@/lib/poker-night/overlays";
import {menuSide, type Stage} from "@/lib/poker-night/stage";

// The ask, while the menu is open: read at the server's time, so an ask of the viewer's that ran out
// frees the others without a write.
const AskItem = ({pid, name}: {pid: string; name: string}) => {
    const room = useRoom();
    const now = useServerNow(1000);
    const [busy, setBusy] = useState(false);
    const me = room.me;
    const offer = me ? askOffer(me, pid, now) : null;
    if (!offer) return null;
    const ask = async () => {
        if (busy) return;
        setBusy(true);
        const r = await room.send({type: 'ask', to: pid});
        setBusy(false);
        if (r.ok) toast.message(ASK_COPY.asked(name));
        else toast.error(r.message);
    };
    if (offer.kind === 'asked') {
        const status = offer.answer === 'waiting' ? ASK_COPY.status.waiting(name) : ASK_COPY.status[offer.answer](name);
        return (
            <>
                <p className="px-2 py-1.5 text-xs text-fg-soft" role="status" data-seat-ask-status={offer.answer}>{status}</p>
                <DropdownMenuSeparator/>
            </>
        );
    }
    return (
        <>
            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" disabled={offer.kind === 'blocked' || busy} onSelect={() => void ask()}
                              data-seat-ask={offer.kind === 'blocked' ? offer.block : 'ask'}>
                <Eye className="size-4" aria-hidden="true"/>{ASK_COPY.ask}
            </DropdownMenuItem>
            {offer.kind === 'blocked' && <p className="px-2 pb-1.5 text-[11px] leading-snug text-fg-muted" data-seat-ask-why="">{ASK_COPY.blocked[offer.block](name)}</p>}
            <DropdownMenuSeparator/>
        </>
    );
};

const SeatMenus = ({stage}: {stage: Stage}) => {
    const room = useRoom();
    const muted = useMutedPlayers();
    const cooling = useCoolingDown();
    // One menu open at a time; the viewer's turn closes it and hands the focus to the action bar.
    const turnKey = myTurnKey(room.view);
    const [ui, setUi] = useState<{open: number | null; turnSeen: number | null; closedByTurn: boolean}>(() => ({open: null, turnSeen: turnKey, closedByTurn: false}));
    if (turnKey !== ui.turnSeen) setUi({open: turnKey !== null ? null : ui.open, turnSeen: turnKey, closedByTurn: turnKey !== null && ui.open !== null});
    if (!room.view) return null;
    const table = room.table;
    const me = room.view.me;
    const canThrow = me.seat !== null && table.settings.throwables;

    const throwAt = (to: string, item: ThrowId) => void sendEmoteNow(room.sendEmote, {kind: 'throw', item, to});
    const mute = (pid: string, name: string) => {
        const now = toggleMuted(pid);
        toast.message(now ? EMOTE_COPY.muted(name) : EMOTE_COPY.shown(name));
    };

    return (
        <div className="pn-seat-menus">
            {table.seats.map((s, seat) => {
                const place = stage.seats[seat];
                if (!s || !place || s.pid === me.pid) return null;
                const name = table.people[s.pid]?.name ?? '';
                const isMuted = muted.has(s.pid);
                return (
                    <DropdownMenu key={`${seat}-${s.pid}`} open={ui.open === seat}
                                  onOpenChange={(open) => setUi((prev) => ({...prev, open: open ? seat : prev.open === seat ? null : prev.open, closedByTurn: false}))}>
                        <DropdownMenuTrigger asChild>
                            <button type="button" className="pn-seat-hit rounded-full" style={{left: place.plate.x, top: place.plate.y}}
                                    aria-label={EMOTE_COPY.seatMenu(name)} data-seat-menu={seat} data-muted={isMuted ? '' : undefined}/>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" side={menuSide(place, stage)} collisionPadding={8} className="w-64 text-fg" data-pn-seat-menu={seat}
                                                 data-pn-menu-side={menuSide(place, stage)} onCloseAutoFocus={focusTableOnClose(ui.closedByTurn)}>
                            <DropdownMenuLabel className="flex min-w-0 items-center gap-2 text-sm text-fg">
                                <PlayerName name={name}/>
                            </DropdownMenuLabel>
                            <AskItem pid={s.pid} name={name}/>
                            {canThrow ? (
                                <div role="group" aria-label={EMOTE_COPY.throwAt(name)} className="grid grid-cols-5 gap-0.5">
                                    {THROW_IDS.map((item) => (
                                        <DropdownMenuItem key={item} disabled={cooling} className="size-11 justify-center p-0 text-2xl leading-none"
                                                          aria-label={EMOTE_COPY.throwItemAt(item, name)} title={EMOTE_COPY.throwables[item].label}
                                                          onSelect={() => throwAt(s.pid, item)} data-seat-throw={item}>
                                            <span aria-hidden="true">{throwGlyph(item)}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </div>
                            ) : (
                                <p className="px-1.5 py-1 text-xs text-fg-muted">{me.seat === null ? EMOTE_COPY.seatedOnly : EMOTE_COPY.off}</p>
                            )}
                            <DropdownMenuSeparator/>
                            <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => mute(s.pid, name)} data-seat-mute={isMuted ? 'show' : 'mute'}>
                                {isMuted ? <Volume2 className="size-4" aria-hidden="true"/> : <VolumeX className="size-4" aria-hidden="true"/>}
                                {isMuted ? EMOTE_COPY.showPlayer(name) : EMOTE_COPY.mutePlayer(name)}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            })}
        </div>
    );
};

export default SeatMenus;
