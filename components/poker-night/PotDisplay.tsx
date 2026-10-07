'use client';

// The pot, where lib/poker-night/stage left room for it: one pill, "Pot 1,200", or the main pot and
// each side pot, counted from 1 in the order they were built — in one row, the side pots past what
// the row holds gathered into one pill ("3 more side pots: 2,340"). This street's bets stay in front
// of the players until the street ends. When the hand is won the pots stay on until each one's chips
// stream out to its winners (side pots first, the main pot last) and the winner's banner
// (components/poker-night/WinnerReveal) takes their place.

import type {CSSProperties} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import ChipStack from "@/components/poker-night/ChipStack";
import {useRoom} from "@/components/poker-night/room-controller";
import {FELT_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {potPillsShown, type Stage} from "@/lib/poker-night/stage";
import {cn} from "@/lib/utils";

const labelsFor = (amounts: readonly number[]): string[] =>
    amounts.length === 1 ? [TABLE_COPY.pot(amounts[0])] : amounts.map((n, i) => (i === 0 ? TABLE_COPY.mainPot(n) : TABLE_COPY.sidePot(i, n)));

type Pill = {key: string; pots: number[]; label: string; amount: number};

const PotDisplay = ({stage, anims}: {stage: Stage; anims: readonly LiveAnim[]}) => {
    const {table} = useRoom();
    const hand = table.hand;
    if (!hand) return null;
    let amounts: number[];
    let leaveAt: ((pot: number) => number | null) = () => null;
    let win: LiveAnim | null = null;
    if (hand.phase !== 'complete') {
        amounts = hand.pots.map((p) => p.amount);
    } else {
        // Paid out: shown only while their chips are still to leave.
        const paying = animsOf(anims, 'win').find((a) => a.event.handNo === hand.no && !a.still);
        if (!paying || !hand.result) return null;
        win = paying;
        amounts = hand.result.pots.map((p) => p.amount);
        leaveAt = (pot) => paying.potsOut?.find((p) => p.pot === pot)?.at ?? null;
    }
    const pots = amounts.flatMap((amount, pot) => (amount > 0 ? [{pot, amount}] : []));
    if (pots.length === 0) return null;
    const labels = labelsFor(pots.map((p) => p.amount));
    const rest = (from: number) => FELT_COPY.morePots(pots.length - from, pots.slice(from).reduce((s, p) => s + p.amount, 0));
    const width = Math.max(stage.pot.w, stage.board.w);
    const shown = potPillsShown(labels, width, rest);
    const pills: Pill[] = [
        ...pots.slice(0, shown).map((p, i) => ({key: `pot-${p.pot}`, pots: [p.pot], label: labels[i], amount: p.amount})),
        ...(shown < pots.length ? [{key: 'more', pots: pots.slice(shown).map((p) => p.pot), label: rest(shown), amount: 0}] : []),
    ];
    return (
        <div className="pn-pot" style={{left: stage.pot.x, top: stage.pot.y, width}} data-pn-pot={pots.reduce((s, p) => s + p.amount, 0)}>
            {pills.map((pill, i) => {
                // A pill leaves with the first of its pots to pay out.
                const times = pill.pots.map(leaveAt).filter((t): t is number => t !== null);
                const out = win && times.length > 0 ? Math.min(...times) : null;
                return (
                    <span key={pill.key} className={cn('pn-pot-pill chrome-surface text-fg', out !== null && 'pn-pot-out')}
                          style={out !== null && win ? (animVars(win, out) as CSSProperties) : undefined}
                          data-pot={pill.pots.join(',')} data-anim={out !== null ? 'pot-out' : undefined}>
                        {i === 0 && <ChipStack amount={pill.amount} label={false}/>}
                        <span>{pill.label}</span>
                    </span>
                );
            })}
        </div>
    );
};

export default PotDisplay;
