'use client';

import {useState, type ReactNode} from "react";
import {toast} from "sonner";
import {gradeReviewCard} from "@/lib/actions/lab.actions";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import {GRADES, type Grade} from "@/lib/lab/srs";
import ActionButton from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import {rowCard} from "@/components/primitives/RowCard";

// The due cards, one at a time: the front, then the back on a click, then one of four grades,
// which the server turns into the card's next date (lib/lab/srs). The faces arrive already
// rendered (components/lab/LabMarkdown, on the server), so this component only flips and grades.
// It walks the queue it opened with: a grade's action revalidates /learn, and the re-render
// carries a queue without the graded card, so advancing on both would skip a card. The server's
// queue is adopted only once this walk is done — a card graded Again comes round then.
export type ReviewDeckCard = {cardId: string; unitTitle: string; why: 'overdue' | 'due' | 'new'; front: ReactNode; back: ReactNode};

const GRADE_VARIANT: Record<Grade, 'danger' | 'secondary' | 'primary' | 'strong'> = {again: 'danger', hard: 'secondary', good: 'primary', easy: 'strong'};

type Walk = {queue: ReviewDeckCard[]; index: number; source: ReviewDeckCard[]};

const ReviewDeck = ({cards}: {cards: ReviewDeckCard[]}) => {
    const [walk, setWalk] = useState<Walk>({queue: cards, index: 0, source: cards});
    const [revealed, setRevealed] = useState(false);
    const [pending, setPending] = useState<Grade | null>(null);
    // The walk is over and the page has sent a different queue: start on it (the pattern React
    // documents for state that follows a prop — a set during render, guarded by the comparison).
    if (walk.index >= walk.queue.length && cards !== walk.source && cards.length > 0) {
        setWalk({queue: cards, index: 0, source: cards});
    }
    const {queue, index} = walk;
    const card = queue[index];

    if (!card) {
        return <p className="text-sm text-fg-muted" data-review-done>{queue.length === 0 ? LAB_COPY.reviewNothing : LAB_COPY.reviewAllDone}</p>;
    }

    const grade = async (g: Grade) => {
        if (pending) return;
        setPending(g);
        const result = await gradeReviewCard({cardId: card.cardId, grade: g});
        setPending(null);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        setRevealed(false);
        setWalk((w) => ({...w, index: w.index + 1}));
    };

    return (
        <div data-review-deck data-review-left={queue.length - index}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <MicroLabel>{LAB_COPY.fromUnit(card.unitTitle)}</MicroLabel>
                <span className="flex items-center gap-2">
                    <Badge tone={card.why === 'overdue' ? 'warning' : card.why === 'new' ? 'brand' : 'neutral'} variant="outline">{LAB_COPY.why[card.why]}</Badge>
                    <MicroLabel>{LAB_COPY.reviewLeft(queue.length - index)}</MicroLabel>
                </span>
            </div>
            <div className={rowCard({className: 'px-3 py-2.5'})} data-review-card={card.cardId}>
                <div data-review-front>{card.front}</div>
                {revealed && (
                    <div className="mt-3 border-t border-line-strong/25 pt-3" data-review-back>{card.back}</div>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {!revealed ? (
                    <ActionButton variant="secondary" onClick={() => setRevealed(true)} data-review-show>{LAB_COPY.showAnswer}</ActionButton>
                ) : (
                    GRADES.map((g) => (
                        <ActionButton key={g} variant={GRADE_VARIANT[g]} size="sm" disabled={pending !== null} onClick={() => grade(g)} data-review-grade={g}>
                            {pending === g ? LAB_COPY.marking : LAB_COPY.grades[g]}
                        </ActionButton>
                    ))
                )}
            </div>
            {revealed && <MicroLabel as="p" className="mt-2">{LAB_COPY.gradeLine}</MicroLabel>}
        </div>
    );
};

export default ReviewDeck;
