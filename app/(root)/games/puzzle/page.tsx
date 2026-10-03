import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getTodaysPuzzle} from "@/lib/games/store";
import {ARCHIVE_COPY, GAMES_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_COPY, PUZZLE_DIFFICULTY_LABEL} from "@/lib/learn/copy/games";
import PuzzleSolver from "@/components/games/PuzzleSolver";
import StreakChip from "@/components/games/StreakChip";
import EmptyState from "@/components/primitives/EmptyState";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";

export const metadata: Metadata = {title: "Today's puzzle"};

// Today's puzzle: the same for every reader on an ET day. Solving it today counts toward the
// streak; the answer is checked on the server (lib/actions/games.actions.ts) and the page never
// holds it until the puzzle is solved or its solution shown.
const PuzzlePage = async () => {
    const userId = await requireUserId();
    const view = await getTodaysPuzzle(userId);

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-puzzle-page="daily">
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            {view ? (
                <>
                    <PageTitle
                        title={view.puzzle.title}
                        subtitle={`${PUZZLE_COPY.number(view.puzzle.number)} · ${PUZZLE_CATEGORY_LABEL[view.puzzle.category]} · ${PUZZLE_DIFFICULTY_LABEL[view.puzzle.difficulty]}`}
                        actions={<StreakChip current={view.streak.current} todayDone={view.streak.todayDone} atRisk={view.streak.atRisk}/>}
                    />
                    <Panel pad={6}>
                        <PuzzleSolver key={`${view.puzzle.id}:${view.day}`} puzzle={view.puzzle} daily initial={view.progress}/>
                    </Panel>
                    <p className="text-xs leading-relaxed text-fg-muted">{PUZZLE_COPY.dailyRule}</p>
                    <Link href="/games/puzzles" className="label-type text-xs text-brand hover:underline">{GAMES_COPY.archiveLink} →</Link>
                </>
            ) : (
                <EmptyState title={GAMES_COPY.dailyHeading} description={GAMES_COPY.noPuzzleYet}/>
            )}
        </div>
    );
};

export default PuzzlePage;
