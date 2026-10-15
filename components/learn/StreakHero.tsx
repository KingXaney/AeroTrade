import {cn} from "@/lib/utils";
import {STREAK_COPY} from "@/lib/learn/copy/games";
import {nextMilestone, type Streak, type StreakDay} from "@/lib/games/streak";
import MicroLabel from "@/components/primitives/MicroLabel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";

// The one streak, drawn the same on the games hub and on Lab › Today: a flame in a disc (filled
// once today counts, warning-tinted while the run is at risk, muted at zero), the count as the
// heading with its status line and the next milestone, the longest run and the days active, the
// week as seven day pills (a check inside a day that counted, today ringed and breathing while
// it is at risk), and the last twelve weeks as a grid under their month labels. Presentational;
// the streak is lib/learn/activity-store's. The grid is one picture, so a screen reader gets one
// sentence for it rather than 84 squares. No keyframe of its own: the ring uses Tailwind's pulse
// under motion-safe only.

const weekdayOf = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const monthOf = (date: string): number => Number(date.slice(5, 7)) - 1;

// The month label over each week whose Sunday starts a new month (and over the first week), a
// label at least three columns after the last so two never run together.
const MONTH_LABEL_GAP = 3;
const monthLabels = (weeks: readonly StreakDay[][]): (string | null)[] => {
    let lastAt = -MONTH_LABEL_GAP;
    return weeks.map((week, i) => {
        const month = monthOf(week[0].date);
        const starts = i === 0 || month !== monthOf(weeks[i - 1][0].date);
        if (!starts || i - lastAt < MONTH_LABEL_GAP) return null;
        lastAt = i;
        return STREAK_COPY.monthShort[month];
    });
};

const DayPill = ({day, atRisk}: {day: StreakDay; atRisk: boolean}) => (
    <li className="flex flex-col items-center gap-1.5" data-solved={day.solved || undefined} data-today={day.today || undefined} aria-label={STREAK_COPY.dayLabel(day.date, day.solved)}>
        <span
            aria-hidden="true"
            className={cn(
                'flex size-9 items-center justify-center rounded-full border text-sm transition-colors',
                day.solved ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong/50 bg-surface-3 text-fg-muted',
                day.today && !day.solved && 'outline outline-2 outline-offset-2',
                day.today && !day.solved && (atRisk ? 'outline-warning/70 motion-safe:animate-pulse' : 'outline-brand/50'),
                day.today && day.solved && 'outline outline-2 outline-offset-2 outline-brand/40',
            )}
        >
            {day.solved ? <span className="material-symbols-outlined text-base leading-none">check</span> : null}
        </span>
        <span aria-hidden="true" className={cn('font-mono text-[10px]', day.today ? 'text-fg' : 'text-fg-muted')}>
            {STREAK_COPY.weekdays[weekdayOf(day.date)]}
        </span>
    </li>
);

type Props = {
    streak: Streak;
    // The hub adds the puzzles solved on their day; the lab adds nothing.
    extraTiles?: {label: string; value: string; hint?: string}[];
    headingId?: string;
};

const StreakHero = ({streak, extraTiles = [], headingId = 'streak-heading'}: Props) => {
    const doneInGrid = streak.weeks.flat().filter((day) => day.solved).length;
    const status = streak.todayDone ? STREAK_COPY.doneToday : streak.atRisk ? STREAK_COPY.atRisk(streak.current) : STREAK_COPY.start;
    const milestone = nextMilestone(streak.current);
    const labels = monthLabels(streak.weeks);
    const tone = streak.todayDone ? 'done' : streak.atRisk ? 'risk' : streak.current > 0 ? 'alive' : 'none';
    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]" data-streak-hero data-streak-tone={tone} data-streak-current={streak.current}>
            <div className="min-w-0 space-y-5">
                <div className="flex items-center gap-4">
                    <span
                        aria-hidden="true"
                        className={cn(
                            'flex size-16 shrink-0 items-center justify-center rounded-full border-2',
                            tone === 'done' ? 'border-brand bg-brand/15 text-brand'
                                : tone === 'risk' ? 'border-warning/60 bg-warning/10 text-warning'
                                    : tone === 'alive' ? 'border-brand/40 bg-brand/5 text-brand'
                                        : 'border-line-strong/40 bg-surface-3 text-fg-muted',
                        )}
                    >
                        <span className="material-symbols-outlined text-4xl leading-none" style={streak.todayDone ? {fontVariationSettings: "'FILL' 1"} : undefined}>
                            local_fire_department
                        </span>
                    </span>
                    <div className="min-w-0">
                        <SectionHeading id={headingId} spacing="none" className="text-2xl">
                            {streak.current > 0 ? STREAK_COPY.streak(streak.current) : STREAK_COPY.none}
                        </SectionHeading>
                        <p className={cn('mt-1 text-sm', tone === 'risk' ? 'text-warning' : 'text-fg-soft')} data-streak-status>{status}</p>
                        <MicroLabel as="p" className="mt-1" data-streak-milestone={milestone?.target ?? 'none'}>
                            {milestone ? STREAK_COPY.milestone(milestone.toGo, milestone.target) : STREAK_COPY.pastMilestones}
                        </MicroLabel>
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <StatTile label={STREAK_COPY.longestLabel} value={String(streak.longest)} hint={STREAK_COPY.days(streak.longest)} />
                    <StatTile label={STREAK_COPY.activeLabel} value={String(streak.total)} hint={STREAK_COPY.activeDays(streak.total)} />
                    {extraTiles.map((tile) => <StatTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />)}
                </div>
                <div>
                    <MicroLabel as="p" className="mb-2">{STREAK_COPY.weekHeading}</MicroLabel>
                    <ol className="flex items-end gap-2.5" aria-label={STREAK_COPY.weekHeading} data-week-pills>
                        {streak.week.map((day) => <DayPill key={day.date} day={day} atRisk={streak.atRisk} />)}
                    </ol>
                </div>
                <p className="max-w-xl text-xs leading-relaxed text-fg-muted">{STREAK_COPY.rule}</p>
            </div>
            <div className="min-w-0">
                <MicroLabel as="p" className="mb-2">{STREAK_COPY.gridHeading}</MicroLabel>
                <p className="sr-only">{STREAK_COPY.activeDays(doneInGrid)}</p>
                <div className="w-max" aria-hidden="true">
                    <div className="mb-1 grid grid-flow-col gap-1" style={{gridTemplateColumns: `repeat(${streak.weeks.length}, 0.75rem)`}}>
                        {labels.map((label, i) => (
                            <span key={streak.weeks[i][0].date} className="font-mono text-[9px] leading-3 text-fg-muted">{label ?? ''}</span>
                        ))}
                    </div>
                    <div className="grid grid-flow-col grid-rows-7 gap-1" data-streak-grid>
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
            </div>
        </div>
    );
};

export default StreakHero;
