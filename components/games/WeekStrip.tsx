import {cn} from "@/lib/utils";
import {STREAK_COPY} from "@/lib/learn/copy/games";
import type {StreakDay} from "@/lib/games/streak";

// The last seven days as dots, today last: a filled dot for a day the day's puzzle was solved.
// Presentational and client-safe; the label for each dot is its date and whether it counted.
const weekdayOf = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const WeekStrip = ({week, className}: {week: readonly StreakDay[]; className?: string}) => (
    <ol className={cn('flex items-end gap-2', className)} aria-label={STREAK_COPY.weekHeading} data-week-strip>
        {week.map((day) => (
            <li key={day.date} className="flex flex-col items-center gap-1" data-solved={day.solved || undefined} aria-label={STREAK_COPY.dayLabel(day.date, day.solved)}>
                <span
                    aria-hidden="true"
                    className={cn(
                        'block size-3.5 rounded-full border',
                        day.solved ? 'border-brand bg-brand' : 'border-line-strong/50 bg-surface-3',
                        day.today && 'outline outline-2 outline-offset-2 outline-brand/40',
                    )}
                />
                <span aria-hidden="true" className={cn('font-mono text-[10px]', day.today ? 'text-fg' : 'text-fg-muted')}>
                    {STREAK_COPY.weekdays[weekdayOf(day.date)]}
                </span>
            </li>
        ))}
    </ol>
);

export default WeekStrip;
