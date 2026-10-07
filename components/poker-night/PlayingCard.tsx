// One playing card: the rank and a suit drawing on the paper, in the suit's colour (two or four
// colours, the viewer's choice through [data-pn-colours] on the room), or the viewer's card back.
// Its size is the --pn-card-w the place it sits in sets. data-card is the card ("Ah") or "back",
// the hook a test reads; the accessible name is the card's own ("Ace of hearts").
//
// Three layers, one motion each (app/globals.css): the card itself is dealt, turned up or folded
// (`motion`), its inner layer lifts or dims at a showdown (`stateMotion`), its face glows while it
// is one of the cards that play (`glow`). A two-sided card draws its back behind its face, so a
// fold turns it face down: the card slides and fades (.pn-fold) while its inner layer turns
// (.pn-fold-turn) — the turn never on the fading element, whose opacity would flatten it and show
// the face mirrored.

import type {CSSProperties} from "react";
import {cardLabel, rankOf, suitOf, type Card} from "@/lib/poker/cards";
import {HAND_COPY} from "@/lib/learn/copy/poker-night";
import {SUIT_LETTERS} from "@/lib/poker-night/looks";
import SuitIcon from "@/components/poker-night/SuitIcon";
import {cn} from "@/lib/utils";

export type CardMotion = {cls: 'pn-deal' | 'pn-flip' | 'pn-fold'; style: CSSProperties; anim: string};
export type CardStateMotion = {cls: 'pn-dim' | 'pn-win-lift'; style: CSSProperties};

type Props = {
    card: Card | null; // null: face down
    state?: 'win' | 'dim' | null;
    sides?: 'one' | 'two';
    motion?: CardMotion | null;
    stateMotion?: CardStateMotion | null;
    glow?: CSSProperties | null; // the glow's timing, when the card is one of the cards that play
    className?: string;
    style?: CSSProperties;
};

const PlayingCard = ({card, state = null, sides = 'one', motion = null, stateMotion = null, glow = null, className, style}: Props) => {
    const suit = card === null ? null : SUIT_LETTERS[suitOf(card)];
    // Only a two-sided card turns as it folds (a back alone, with nothing behind it, would vanish).
    const turning = motion?.cls === 'pn-fold' && sides === 'two';
    const inner = motion?.cls === 'pn-fold' ? null : stateMotion;
    return (
        <div
            className={cn('pn-card', motion?.cls, className)}
            style={motion ? {...style, ...motion.style} : style}
            role="img"
            aria-label={card === null ? HAND_COPY.faceDown : HAND_COPY.card(card)}
            data-card={card === null ? 'back' : cardLabel(card)}
            data-suit={suit ?? undefined}
            data-state={state ?? undefined}
            data-sides={sides}
            data-anim={motion?.anim}
        >
            <div className={cn('pn-card-inner', turning ? 'pn-fold-turn' : inner?.cls)} style={inner?.style}
                 data-anim={turning ? 'fold-turn' : inner ? (inner.cls === 'pn-dim' ? 'dim' : 'lift') : undefined}>
                {card !== null && suit !== null && (
                    <div className={cn('pn-card-face', glow && 'pn-win-glow')} style={glow ?? undefined}>
                        <span className="pn-card-rank" aria-hidden="true">{HAND_COPY.rankShort[rankOf(card)]}</span>
                        <SuitIcon suit={suit} className="pn-card-corner"/>
                        <SuitIcon suit={suit} className="pn-card-pip"/>
                    </div>
                )}
                {(card === null || sides === 'two') && <div className="pn-card-face pn-card-back" aria-hidden="true"/>}
            </div>
        </div>
    );
};

export default PlayingCard;
