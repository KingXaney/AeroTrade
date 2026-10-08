'use client';

// The end of a hand: a banner drops in with each winner's look, "Ana wins 1,200" ("You win 1,200"
// for the viewer) and, at a showdown, the hand's name ("Flush, ace high"); a big win (a pot of forty
// big blinds, or an all-in won) bursts into confetti. It stays until the next deal.
// The cards — the five that play lifting and glowing, the rest dimming — are the board's, the
// seats' and the dock's own (lib/poker-night/reveal); the chips' flight is ChipFlight's. A result
// the table had already shown when this page saw it is drawn in place, with no show. Where it goes,
// how many winners it names and which banner it is — the full one; the compact one, a line a winner
// with no avatar, wrapped when narrow; or that cut short, never inside a name or a number — is TableScreen's plan
// (lib/poker-night/stage.bannerPlan), clear of every plate, turned-up hand, the dealer button and the
// board: drawn top-anchored at the plan's place, never wider than the room it found there. The banner
// is a button that opens the hand log on the hand just played (P8); who won is said by the live region
// (LiveAnnouncer), so the banner carries no status role of its own.

import type {CSSProperties} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import {openOverlay} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import {LOG_COPY} from "@/lib/learn/copy/poker-night";
import {playerAt, type BannerLine} from "@/lib/poker-night/reveal";
import type {BannerPlan} from "@/lib/poker-night/stage";
import {fnv1a, mulberry32} from "@/lib/random";
import {cn} from "@/lib/utils";

// The confetti's colours: the palette's own, so every theme throws its own.
const BITS = ['bg-brand', 'bg-warning', 'bg-positive', 'bg-negative', 'bg-secondary-tint', 'bg-fg'] as const;
const CONFETTI = 28;

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

type Props = {anims: readonly LiveAnim[]; handNo: number; lines: readonly BannerLine[]; plan: BannerPlan};

const WinnerReveal = ({anims, handNo, lines, plan}: Props) => {
    const room = useRoom();
    const table = room.table;
    const win = animsOf(anims, 'win').find((a) => a.event.handNo === handNo && !a.still) ?? null;
    const {banner} = plan;
    const shown = lines.slice(0, plan.rows);
    const userText = (line: BannerLine) => (line.mine ? {} : {'data-user-text': ''});
    return (
        <>
            <div className="pn-banner-wrap" style={{left: banner.x - banner.width / 2, top: banner.top, width: banner.width}} data-pn-banner-place="banner">
                <button type="button" className={cn('pn-banner chrome-surface text-fg', win && 'pn-banner-drop')}
                        style={win ? animVars(win, win.bannerAt ?? 0, 2) : undefined} onClick={() => openOverlay('log')}
                        aria-label={LOG_COPY.fromBanner(shown.map((line) => line.head))}
                        data-pn-banner={shown.map((w) => w.seat).join(',')} data-variant={plan.variant} data-anim={win ? 'banner' : undefined}>
                    {shown.map((line) => {
                        if (plan.short) {
                            // Cut short where the heads have no room whole: without the chips, and only the
                            // name ever cut, to an ellipsis — never a number or a board's name.
                            return (
                                <span key={line.key} className="pn-banner-line flex whitespace-nowrap font-semibold" data-winner={line.seat} data-board={line.board ?? undefined} data-short="">
                                    {line.short.lead && <span className="flex-none whitespace-pre">{line.short.lead}</span>}
                                    {line.short.name && <span className="min-w-0 truncate" {...userText(line)}>{line.short.name}</span>}
                                    {line.short.tail && <span className="flex-none whitespace-pre">{line.short.tail}</span>}
                                </span>
                            );
                        }
                        if (plan.variant !== 'full') {
                            return (
                                <span key={line.key} className={cn('pn-banner-line block', plan.variant === 'cut' && 'truncate')} data-winner={line.seat} data-board={line.board ?? undefined}>
                                    <span className="font-semibold" {...userText(line)}>{line.head}</span>
                                    {line.hand && <> · <span className="text-fg-soft" data-hand-name="">{line.hand}</span></>}
                                </span>
                            );
                        }
                        const pid = playerAt(table, line.seat);
                        const person = pid ? table.people[pid] : undefined;
                        return (
                            <span key={line.key} className="pn-banner-row" data-winner={line.seat} data-board={line.board ?? undefined}>
                                <AvatarDisc avatar={person?.avatar} decorative/>
                                <span className="block min-w-0">
                                    <span className="pn-banner-head block truncate" {...userText(line)}>{line.head}</span>
                                    {line.hand && <span className="pn-banner-hand block truncate text-fg-soft" data-hand-name="">{line.hand}</span>}
                                </span>
                            </span>
                        );
                    })}
                </button>
            </div>
            {win && win.confettiAt !== null && win.confettiAt !== undefined && (
                <div className="pn-confetti-field" style={{left: banner.x, top: banner.top}} aria-hidden="true" data-anim="confetti">
                    {confetti(handNo).map((bit) => (
                        <span key={bit.key} className={cn('pn-confetti-bit pn-confetti', bit.tone)}
                              style={animVars(win, win.confettiAt!, undefined, {x: bit.x, y: bit.y, rot: `${bit.rot}deg`, wait: `${bit.wait}ms`}) as CSSProperties}/>
                    ))}
                </div>
            )}
        </>
    );
};

export default WinnerReveal;
