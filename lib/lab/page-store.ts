// The lab page's one read: the owner's rows beside the bank, the one streak, today's puzzle and
// the records of the games on the page, shaped by lib/lab/view. Cached per request so the page
// and its panels share it. Server-only.

import {cache} from "react";
import {getEasternDateString} from "@/lib/dates";
import {getDailyPuzzleCard, readGameSummary, type GameSummary} from "@/lib/games/store";
import {readActivityStreak, readGamesPlayedOn} from "@/lib/learn/activity-store";
import {cardRefs, LAB_PLAN, LAB_UNITS} from "@/lib/lab/registry";
import {readCardRows, readLabLayout, readQuizzes, readRevealed, readStudied, readTickedKeys} from "@/lib/lab/store";
import {gamesOf} from "@/lib/lab/layout";
import {labWidget, type LabWidgetGame} from "@/lib/lab/widgets";
import {getLatestLabDay} from "@/lib/lab/papers/store";
import {shapeLabView, type LabView} from "@/lib/lab/view";

// The settings key a game's record is read under (lib/games/arithmetic.settingsKey for the sprint).
const RECORD_KEYS: Readonly<Record<LabWidgetGame, string>> = {arithmetic: 'zetamac', kelly: 'kelly', 'market-making': 'market-making', correlation: 'correlation'};

export const getLabView = cache(async (userId: string, today: string = getEasternDateString()): Promise<LabView> => {
    const layout = await readLabLayout(userId);
    const widgets = gamesOf(layout);
    const games = widgets.map((id) => labWidget(id).game).filter((game): game is LabWidgetGame => game !== undefined);
    const hasPuzzle = widgets.includes('daily-puzzle');
    const [studied, revealed, quizzes, cardRows, labDay, streak, puzzle, playedToday, tickedKeys, summaries] = await Promise.all([
        readStudied(userId),
        readRevealed(userId),
        readQuizzes(userId),
        readCardRows(userId),
        getLatestLabDay(today),
        readActivityStreak(userId, today),
        hasPuzzle ? getDailyPuzzleCard(userId) : Promise.resolve(null),
        readGamesPlayedOn(userId, today),
        readTickedKeys(userId),
        Promise.all(games.map(async (game) => [game, await readGameSummary(userId, game, RECORD_KEYS[game])] as const)),
    ]);
    const gameSummaries: Record<string, GameSummary> = Object.fromEntries(summaries);
    return shapeLabView({
        today, units: LAB_UNITS, plan: LAB_PLAN, cards: cardRefs(), studied, revealed, quizzes, cardRows, labDay, streak, layout, puzzle,
        playedToday, gameSummaries,
        tickedKeys: tickedKeys.map((row) => row.key),
    });
});

export type UnitProgress = {studiedOn: string | null; lastDay: string | null; quizPassedOn: string | null; quizScore: number | null};

// A unit page's read: the unit's own study row and its quiz's pass.
export const getUnitProgress = cache(async (userId: string, unitId: string): Promise<UnitProgress> => {
    const [studied, quizzes] = await Promise.all([readStudied(userId), readQuizzes(userId)]);
    const row = studied.find((r) => r.unitId === unitId);
    const quiz = quizzes.find((r) => r.unitId === unitId);
    return {studiedOn: row?.day ?? null, lastDay: row?.lastDay ?? null, quizPassedOn: quiz?.day ?? null, quizScore: quiz?.score ?? null};
});
