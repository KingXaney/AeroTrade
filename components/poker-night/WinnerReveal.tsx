'use client';

// The end of a hand: a banner drops in where the pot was, with each winner's look, "Ana wins 1,200"
// ("You win 1,200" for the viewer) and, at a showdown, the hand's name ("Flush, ace high"); a big win
// (a pot of forty big blinds, or an all-in won) bursts into confetti. It stays until the next deal.
// The cards — the five that play lifting and glowing, the rest dimming — are the board's, the
// seats' and the dock's own (lib/poker-night/reveal); the chips' flight is ChipFlight's. A result
// the table had already shown when this page saw it is drawn in place, with no show. When the banner
// grows down over the spot under the board, TableScreen hands it what would have shown there (the
// next deal's countdown, the pause) as `footer`, drawn under the banner in the same column.

import type {CSSProperties, ReactNode} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import {useRoom} from "@/components/poker-night/room-controller";
import {HAND_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {bannerShows, type ResultLook} from "@/lib/poker-night/reveal";
import {bannerPlace, type Stage} from "@/lib/poker-night/stage";
import {fnv1a, mulberry32} from "@/lib/random";
import {cn} from "@/lib/utils";

// The confetti's colours: the palette's own, so every theme throws its own.
const BITS = ['bg-brand', 'bg-warning', 'bg-positive', 'bg-negative', 'bg-secondary-tint', 'bg-fg'] as const;
const CONFETTI = 28;
const SHOWN_WINNERS = 3;

// The same pieces for the same hand on every screen: positions from the hand number.
const confetti = (handNo: number) => {
    const random = mulberry32(fnv1a(`poker-night:${handNo}`));
    return Array.from({length: CONFETTI}, (_, i) => ({
        key: i,
        tone: BITS[i % BITS.length],
        x: Math.round((random() * 2 - 1) * (110 + random() * 110)),
        y: Math.round(-60 - random() * 140 + (i % 3) * 60),
        rot: Math.round((random() * 2 - 1) * 540),
        wait: Math.round(random() * 220),
    }));
};

type Props = {stage: Stage; anims: readonly LiveAnim[]; look: ResultLook | null; footer?: ReactNode};

const WinnerReveal = ({stage, anims, look, footer = null}: Props) => {
    const room = useRoom();
    const table = room.table;
    const hand = table.hand;
    if (!hand || !look || !bannerShows(hand, look)) return null;
    const win = animsOf(anims, 'win').find((a) => a.event.handNo === hand.no && !a.still) ?? null;
    const mySeat = room.me?.seat ?? null;
    const {up, left, top} = bannerPlace(stage);
    const at = {left, top};
    return (
        <>
            <div className="pn-banner-wrap" style={at} data-grow={up ? 'up' : 'down'}>
                <div className={cn('pn-banner chrome-surface text-fg', win && 'pn-banner-drop')}
                     style={win ? animVars(win, win.bannerAt ?? 0, 2) : undefined}
                     role="status" data-pn-banner={look.winners.map((w) => w.seat).join(',')} data-anim={win ? 'banner' : undefined}>
                    {look.winners.slice(0, SHOWN_WINNERS).map((w) => {
                        const pid = table.seats[w.seat]?.pid ?? null;
                        const person = pid ? table.people[pid] : undefined;
                        const mine = w.seat === mySeat;
                        return (
                            <div key={w.seat} className="pn-banner-row" data-winner={w.seat}>
                                <AvatarDisc avatar={person?.avatar} decorative/>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold" {...(mine ? {} : {'data-user-text': ''})}>
                                        {mine ? TABLE_COPY.bannerYou(w.amount) : TABLE_COPY.banner(person?.name ?? TABLE_COPY.seat(w.seat), w.amount)}
                                    </p>
                                    {w.description && <p className="truncate text-xs text-fg-soft" data-hand-name="">{w.playsBoard ? `${HAND_COPY.label(w.description)} · ${HAND_COPY.playsBoard}` : HAND_COPY.label(w.description)}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {footer}
            </div>
            {win && win.confettiAt !== null && win.confettiAt !== undefined && (
                <div className="pn-confetti-field" style={at} aria-hidden="true" data-anim="confetti">
                    {confetti(hand.no).map((bit) => (
                        <span key={bit.key} className={cn('pn-confetti-bit pn-confetti', bit.tone)}
                              style={animVars(win, win.confettiAt!, undefined, {x: bit.x, y: bit.y, rot: `${bit.rot}deg`, wait: `${bit.wait}ms`}) as CSSProperties}/>
                    ))}
                </div>
            )}
        </>
    );
};

export default WinnerReveal;
