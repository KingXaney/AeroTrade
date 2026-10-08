'use client';

// Chips in flight, drawn where they land and sent there by CSS from where they start (--pn-dx /
// --pn-dy, worked out from lib/poker-night/stage's positions): a bet, call or raise sliding from the
// plate to its bet line (an all-in a bigger push), every bet sweeping into the pots (the middle of
// their pills, where lib/poker-night/stage.potPlan put them) when a street ends, an uncalled bet going
// back, and at the end each pot bursting from its own pill into a stream of chips to its winners —
// split between them by share, side pots first and the main pot last. Each element ends invisible,
// so under reduced motion nothing flies and the table simply shows where the chips are.
// data-anim names each flight for a test.

import type {CSSProperties} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import ChipStack from "@/components/poker-night/ChipStack";
import {DENOMINATIONS} from "@/lib/poker-night/chips";
import {BEAT} from "@/lib/poker-night/choreography";
import {offset, potCentre, type PotPlan, type Px, type Stage} from "@/lib/poker-night/stage";

// The chip a stream's chips are drawn as: the largest that a sixth of the pot holds.
const streamDenom = (amount: number): number => [...DENOMINATIONS].reverse().find((d) => d <= Math.max(1, amount / 6)) ?? 1;

const fly = (at: Px, extra: CSSProperties): CSSProperties => ({left: at.x, top: at.y, ...extra});

const ChipFlight = ({stage, pots, anims, handNo}: {stage: Stage; pots: PotPlan | null; anims: readonly LiveAnim[]; handNo: number | null}) => {
    const seatAt = (seat: number) => stage.seats[seat];
    const current = (a: LiveAnim) => a.event.handNo === handNo;
    const out = animsOf(anims, 'chips-out').filter(current);
    const sweeps = animsOf(anims, 'street-sweep').filter(current);
    const refunds = animsOf(anims, 'refund').filter(current);
    const wins = animsOf(anims, 'win').filter((a) => current(a) && !a.still);
    // Where the pots are: the middle of their pills (the one pot's own place before there are any).
    const pot: Px = pots ? {x: pots.box.x, y: pots.box.y} : {x: stage.pot.x, y: stage.pot.y};
    const potOf = (n: number): Px => (pots ? potCentre(pots, n) : pot);
    return (
        <div className="pn-flights" aria-hidden="true">
            {out.map((a) => {
                const place = seatAt(a.event.seat);
                if (!place) return null;
                const from = offset(place.plate, place.bet);
                return (
                    <span key={a.id} className="pn-fly pn-chip-slide" data-anim="chips-out" data-all-in={a.event.allIn ? '' : undefined}
                          style={fly(place.bet, animVars(a, a.at, a.dur, {dx: from.dx, dy: from.dy, push: a.event.allIn ? '1.35' : '0.8'}))}>
                        <ChipStack amount={a.event.amount} className="pn-on-felt"/>
                    </span>
                );
            })}
            {sweeps.flatMap((a) => a.event.bets.map((line) => {
                const place = seatAt(line.seat);
                if (!place) return null;
                const from = offset(place.bet, pot);
                return (
                    <span key={`${a.id}:${line.seat}`} className="pn-fly pn-sweep" data-anim="sweep" style={fly(pot, animVars(a, a.at, a.dur, {dx: from.dx, dy: from.dy}))}>
                        <ChipStack amount={line.amount} label={false}/>
                    </span>
                );
            }))}
            {refunds.map((a) => {
                const place = seatAt(a.event.seat);
                if (!place) return null;
                const from = offset(place.bet, place.plate);
                return (
                    <span key={a.id} className="pn-fly pn-sweep" data-anim="refund" style={fly(place.plate, animVars(a, a.at, a.dur, {dx: from.dx, dy: from.dy}))}>
                        <ChipStack amount={a.event.amount} label={false}/>
                    </span>
                );
            })}
            {wins.flatMap((a) => (a.streams ?? []).map((chip) => {
                const place = seatAt(chip.seat);
                if (!place) return null;
                const from = offset(potOf(chip.pot), place.plate);
                const amount = a.event.pots.find((p) => p.pot === chip.pot)?.amount ?? 1;
                return (
                    <span key={`${a.id}:${chip.key}`} className="pn-fly pn-chip-stream" data-anim="stream" data-pot={chip.pot} data-to={chip.seat}
                          style={fly(place.plate, animVars(a, chip.at, BEAT.STREAM, {dx: from.dx, dy: from.dy}))}>
                        <span className="pn-chips"><span className="pn-chip rounded-full" data-denom={streamDenom(amount)} style={{'--pn-chip': '18px'} as CSSProperties}/></span>
                    </span>
                );
            }))}
        </div>
    );
};

export default ChipFlight;
