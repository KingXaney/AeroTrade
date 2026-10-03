import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getDailyPuzzleCard, getPuzzleArchive, readGameSummary} from "@/lib/games/store";
import {ARCHIVE_COPY, ARITHMETIC_COPY, GAMES_COPY} from "@/lib/learn/copy/games";
import DailyPuzzleCard from "@/components/games/DailyPuzzleCard";
import GameCard from "@/components/games/GameCard";
import StreakPanel from "@/components/games/StreakPanel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Games"};

// The games hub, a page of the Learn section: the daily-puzzle streak first, then each game
// with the way in. The one place the app keeps a score (lib/learn/copy/games.ts says why).
const GamesPage = async () => {
    const userId = await requireUserId();
    const [card, archive, sprint, interview] = await Promise.all([
        getDailyPuzzleCard(userId),
        getPuzzleArchive(userId),
        readGameSummary(userId, 'arithmetic', 'zetamac'),
        readGameSummary(userId, 'interview', 'interview'),
    ]);
    const recordStat = (label: string, record: number | null) => ({label, value: record === null ? '—' : record.toLocaleString('en-US'), hint: record === null ? ARITHMETIC_COPY.cardNone : undefined});
    const solved = archive.filter((row) => row.status === 'solved').length;

    return (
        <div className="space-y-4" data-games-hub>
            <PageTitle title={GAMES_COPY.title} subtitle={GAMES_COPY.subtitle} note={GAMES_COPY.note}/>
            <StreakPanel streak={card.streak}/>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel id="games-daily" aria-labelledby="games-daily-heading">
                    <SectionHeading id="games-daily-heading">{GAMES_COPY.dailyHeading}</SectionHeading>
                    <DailyPuzzleCard card={card}/>
                </Panel>
                <Panel id="games-archive" aria-labelledby="games-archive-heading" className="flex flex-col">
                    <SectionHeading id="games-archive-heading">{ARCHIVE_COPY.title}</SectionHeading>
                    <p className="text-sm text-fg-soft" data-archive-count={solved}>{ARCHIVE_COPY.hubLine(solved, archive.length)}</p>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">{ARCHIVE_COPY.hubLead}</p>
                    <div className="mt-auto pt-5">
                        <Link href="/games/puzzles" className={actionButton({variant: 'secondary', size: 'md'})}>{GAMES_COPY.archiveLink}</Link>
                    </div>
                </Panel>
                <GameCard
                    id="arithmetic"
                    title={ARITHMETIC_COPY.cardTitle}
                    body={ARITHMETIC_COPY.cardBody}
                    stats={[recordStat(ARITHMETIC_COPY.cardSprint, sprint.record), recordStat(ARITHMETIC_COPY.cardInterview, interview.record)]}
                    href="/games/arithmetic"
                    cta={ARITHMETIC_COPY.play}
                />
            </div>
        </div>
    );
};

export default GamesPage;
