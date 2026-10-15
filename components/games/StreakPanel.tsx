import {STREAK_COPY} from "@/lib/learn/copy/games";
import type {Streak} from "@/lib/games/streak";
import Panel from "@/components/primitives/Panel";
import StreakHero from "@/components/learn/StreakHero";

// The games hub's header: the one streak (components/learn/StreakHero), with the puzzles solved
// on their day as the hub's own extra count. Presentational; the streak is
// lib/learn/activity-store's.
const StreakPanel = ({streak, puzzlesSolved}: {streak: Streak; puzzlesSolved: number}) => (
    <Panel id="games-streak" aria-labelledby="games-streak-heading">
        <StreakHero
            streak={streak}
            headingId="games-streak-heading"
            extraTiles={[{label: STREAK_COPY.solvedLabel, value: String(puzzlesSolved), hint: STREAK_COPY.puzzles(puzzlesSolved)}]}
        />
    </Panel>
);

export default StreakPanel;
