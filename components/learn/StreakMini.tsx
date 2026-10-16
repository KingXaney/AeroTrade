import {cn} from "@/lib/utils";
import {STREAK_COPY} from "@/lib/learn/copy/games";
import {nextMilestone, type Streak} from "@/lib/games/streak";
import MicroLabel from "@/components/primitives/MicroLabel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {DayPill, DISC_CLASS, toneOf} from "@/components/learn/StreakHero";

// The streak at a third of the row on Lab › Today: the flame in its disc, the count as the heading,
// the next milestone, and this week as seven small day pills — the hero's own pieces
// (components/learn/StreakHero draws the whole on the games hub) without its status line, its
// tiles, its caption and its twelve-week grid, so the card stays a few lines tall. It keeps the
// hero's hooks (data-streak-hero, -tone, -current, -milestone, data-week-pills) and none of the
// parts it leaves out, so a count of those on a page is the hero's alone. Presentational; the
// streak is lib/learn/activity-store's.
type Props = {streak: Streak; headingId: string};

const StreakMini = ({streak, headingId}: Props) => {
    const tone = toneOf(streak);
    const milestone = nextMilestone(streak.current);
    return (
        <div className="space-y-4" data-streak-hero data-streak-tone={tone} data-streak-current={streak.current}>
            <div className="flex items-center gap-3">
                <span aria-hidden="true" className={cn('flex size-12 shrink-0 items-center justify-center rounded-full border-2', DISC_CLASS[tone])}>
                    <span className="material-symbols-outlined text-3xl leading-none" style={streak.todayDone ? {fontVariationSettings: "'FILL' 1"} : undefined}>
                        local_fire_department
                    </span>
                </span>
                <div className="min-w-0">
                    <SectionHeading id={headingId} spacing="none" className="text-xl">
                        {streak.current > 0 ? STREAK_COPY.streak(streak.current) : STREAK_COPY.none}
                    </SectionHeading>
                    <MicroLabel as="p" className="mt-0.5" data-streak-milestone={milestone?.target ?? 'none'}>
                        {milestone ? STREAK_COPY.milestone(milestone.toGo, milestone.target) : STREAK_COPY.pastMilestones}
                    </MicroLabel>
                </div>
            </div>
            <ol className="flex max-w-80 items-end justify-between" aria-label={STREAK_COPY.weekHeading} data-week-pills>
                {streak.week.map((day) => <DayPill key={day.date} day={day} atRisk={streak.atRisk} size="sm"/>)}
            </ol>
        </div>
    );
};

export default StreakMini;
