import Link from "next/link";
import {cn} from "@/lib/utils";
import {GAMES_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_COPY, PUZZLE_DIFFICULTY_LABEL, STREAK_COPY} from "@/lib/learn/copy/games";
import type {DailyPuzzleCardView} from "@/lib/games/store";
import MicroLabel from "@/components/primitives/MicroLabel";
import {actionButton} from "@/components/primitives/ActionButton";
import WeekStrip from "@/components/games/WeekStrip";

// Today's puzzle in a few lines — its number, kind and title, how far the reader got, and the
// streak with this week's dots — and the way in. Learn › Today, the dashboard's daily-puzzle
// widget and the games hub share it. Presentational: no "What these mean", no "Ask in chat"
// (invariant 12 keeps both off widgets), and no answer — the card never has one.
const DailyPuzzleCard = ({card}: {card: DailyPuzzleCardView}) => {
    const {puzzle, status, streak} = card;
    if (!puzzle) return <p className="text-sm text-fg-muted">{GAMES_COPY.noPuzzleYet}</p>;
    const closed = status === 'solved' || status === 'revealed';
    return (
        <div className="space-y-4" data-daily-puzzle={puzzle.id} data-puzzle-status={status ?? 'new'}>
            <div>
                <MicroLabel>
                    {PUZZLE_COPY.number(puzzle.number)} · {PUZZLE_CATEGORY_LABEL[puzzle.category]} · {PUZZLE_DIFFICULTY_LABEL[puzzle.difficulty]}
                </MicroLabel>
                <h3 className="mt-1 font-heading text-lg font-semibold text-fg">{puzzle.title}</h3>
                {closed && (
                    <p className={cn('mt-1 text-sm', status === 'solved' ? 'text-positive' : 'text-fg-muted')}>
                        {status === 'solved' ? PUZZLE_COPY.correct : PUZZLE_COPY.revealedLine}
                    </p>
                )}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className={cn('mb-2 text-sm font-semibold', streak.current > 0 ? 'text-fg' : 'text-fg-muted')} data-card-streak={streak.current}>
                        {streak.current > 0 ? STREAK_COPY.streak(streak.current) : STREAK_COPY.none}
                    </p>
                    <WeekStrip week={streak.week} />
                </div>
                <Link href="/games/puzzle" className={actionButton({variant: closed ? 'secondary' : 'primary', size: 'md'})} data-open-puzzle>
                    {closed ? GAMES_COPY.seeSolution : GAMES_COPY.openPuzzle}
                </Link>
            </div>
        </div>
    );
};

export default DailyPuzzleCard;
