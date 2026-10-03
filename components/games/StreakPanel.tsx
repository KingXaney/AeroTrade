import {cn} from "@/lib/utils";
import {STREAK_COPY} from "@/lib/learn/copy/games";
import type {Streak} from "@/lib/games/streak";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import StatTile from "@/components/primitives/StatTile";
import WeekStrip from "@/components/games/WeekStrip";

// The games hub's header: the streak, its longest run and the days solved, this week as dots
// and the last twelve weeks as a grid (a solved day filled). Presentational; the streak is
// derived from the solved rows (lib/games/streak.ts). The grid is one picture, so a screen
// reader gets one sentence for it rather than 84 squares.
const StreakPanel = ({streak}: {streak: Streak}) => {
    const solvedInGrid = streak.weeks.flat().filter((day) => day.solved).length;
    const status = streak.todayDone ? STREAK_COPY.doneToday : streak.atRisk ? STREAK_COPY.atRisk(streak.current) : STREAK_COPY.start;
    return (
        <Panel id="games-streak" aria-labelledby="games-streak-heading" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-4">
                <div className="flex items-center gap-3">
                    <span
                        aria-hidden="true"
                        className={cn('material-symbols-outlined text-4xl', streak.current > 0 ? 'text-brand' : 'text-fg-muted')}
                        style={streak.todayDone ? {fontVariationSettings: "'FILL' 1"} : undefined}
                    >
                        local_fire_department
                    </span>
                    <div>
                        <SectionHeading id="games-streak-heading" spacing="none" className="text-xl">
                            {streak.current > 0 ? STREAK_COPY.streak(streak.current) : STREAK_COPY.none}
                        </SectionHeading>
                        <p className={cn('text-sm', streak.atRisk ? 'text-warning' : 'text-fg-soft')} data-streak-status>{status}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <StatTile label={STREAK_COPY.longestLabel} value={String(streak.longest)} hint={STREAK_COPY.days(streak.longest)} />
                    <StatTile label={STREAK_COPY.solvedLabel} value={String(streak.total)} hint={STREAK_COPY.puzzles(streak.total)} />
                </div>
                <div>
                    <MicroLabel as="p" className="mb-2">{STREAK_COPY.weekHeading}</MicroLabel>
                    <WeekStrip week={streak.week} />
                </div>
                <p className="max-w-xl text-xs leading-relaxed text-fg-muted">{STREAK_COPY.rule}</p>
            </div>
            <div className="min-w-0">
                <MicroLabel as="p" className="mb-2">{STREAK_COPY.gridHeading}</MicroLabel>
                <p className="sr-only">{STREAK_COPY.solvedOnTheDay(solvedInGrid)}</p>
                <div className="grid w-max grid-flow-col grid-rows-7 gap-1" aria-hidden="true" data-streak-grid>
                    {streak.weeks.flat().map((day) => (
                        <span
                            key={day.date}
                            title={day.future ? undefined : STREAK_COPY.dayLabel(day.date, day.solved)}
                            data-solved={day.solved || undefined}
                            className={cn(
                                'block size-3 rounded-sm',
                                day.future ? 'bg-transparent' : day.solved ? 'bg-brand' : 'bg-surface-3',
                                day.today && 'outline outline-1 outline-offset-1 outline-brand/60',
                            )}
                        />
                    ))}
                </div>
            </div>
        </Panel>
    );
};

export default StreakPanel;
