'use client';

// The pots, each pill where lib/poker-night/stage.potPlan placed it — on the felt, clear of every
// card, plate, bet line out, a winner's "+N", the dealer button and the winner's banner, wherever the
// table has room for that: one pill, "Pot 1,200", or the main pot and each side pot, counted from 1
// in the order they were built, in full or in short, in a row or in rows, a few side pots gathered
// into one pill where the room is short ("2 more: 5,050"), every pot in one where it is shorter still
// ("4 pots: 6,250"). Each pill is drawn at the plan's size, so what
// the plan cleared is what shows. This street's bets stay in front of the players until the street
// ends. When the hand is won the pots stay on until each one's chips stream out to its winners (side
// pots first, the main pot last) from its own pill, under the winner's banner
// (components/poker-night/WinnerReveal), which keeps clear of them. data-pn-pot (the chips in every
// pot), data-pot (a pill's pots) and the plan's own (data-pn-pot-keeps, -clear, -felt) are the hooks
// a test reads.

import type {CSSProperties} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import ChipStack from "@/components/poker-night/ChipStack";
import {useRoom} from "@/components/poker-night/room-controller";
import type {PotPlan} from "@/lib/poker-night/stage";
import {cn} from "@/lib/utils";

const PotDisplay = ({plan, anims}: {plan: PotPlan | null; anims: readonly LiveAnim[]}) => {
    const {table} = useRoom();
    const hand = table.hand;
    if (!hand || !plan) return null;
    let leaveAt: ((pot: number) => number | null) = () => null;
    let win: LiveAnim | null = null;
    if (hand.phase === 'complete') {
        // Paid out: shown only while their chips are still to leave.
        const paying = animsOf(anims, 'win').find((a) => a.event.handNo === hand.no && !a.still);
        if (!paying || !hand.result) return null;
        win = paying;
        leaveAt = (pot) => paying.potsOut?.find((p) => p.pot === pot)?.at ?? null;
    }
    return (
        <div className="pn-pot" data-pn-pot={plan.pills.reduce((s, p) => s + p.amount, 0)} data-pn-pot-variant={plan.variant}
             data-pn-pot-rows={plan.rows} data-pn-pot-keeps={plan.keeps} data-pn-pot-clear={plan.clear ? 'true' : 'false'}
             data-pn-pot-felt={plan.felt ? 'true' : 'false'}>
            {plan.pills.map((pill) => {
                // A pill leaves with the first of its pots to pay out.
                const times = pill.pots.map(leaveAt).filter((t): t is number => t !== null);
                const out = win && times.length > 0 ? Math.min(...times) : null;
                const style: CSSProperties = {left: pill.x, top: pill.y, width: pill.w, height: pill.h, ...(out !== null && win ? animVars(win, out) : {})};
                return (
                    <span key={pill.key} className={cn('pn-pot-pill chrome-surface text-fg', out !== null && 'pn-pot-out')} style={style}
                          data-pot={pill.pots.join(',')} data-anim={out !== null ? 'pot-out' : undefined}>
                        {pill.chips && <ChipStack amount={pill.amount} label={false}/>}
                        <span className="pn-pot-label">{pill.label}</span>
                    </span>
                );
            })}
        </div>
    );
};

export default PotDisplay;
