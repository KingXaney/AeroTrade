import Link from "next/link";
import {cn} from "@/lib/utils";
import {STREAK_COPY} from "@/lib/learn/copy/games";

type Props = {
    current: number;
    todayDone: boolean;
    atRisk: boolean;
    // Where the chip leads: the owner's Lab (Today's list), everyone else's games hub.
    href?: string;
};

// Home's streak, beside the market status: the count of days in a row something on the Learn
// list was done, with a mark once today counts. At zero it says "Start today" instead — a bare 0
// is not information.
const StreakChip = ({current, todayDone, atRisk, href = '/games'}: Props) => (
    <Link
        href={href}
        data-streak-chip
        data-streak={current}
        data-today-done={todayDone || undefined}
        aria-label={STREAK_COPY.chipAria(current, todayDone)}
        className={cn(
            'label-type inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[length:var(--label-size)] transition-colors',
            todayDone ? 'border-brand/40 text-brand hover:bg-brand/10'
                : atRisk ? 'border-warning/40 text-warning hover:bg-warning/10'
                    : 'border-line-strong/40 text-fg-soft hover:text-fg',
        )}
    >
        <span
            aria-hidden="true"
            className="material-symbols-outlined text-base leading-none"
            style={todayDone ? {fontVariationSettings: "'FILL' 1"} : undefined}
        >
            {current > 0 ? 'local_fire_department' : 'checklist'}
        </span>
        {current > 0 ? STREAK_COPY.streak(current) : STREAK_COPY.chipTodo}
        {todayDone && <span aria-hidden="true" className="material-symbols-outlined text-sm leading-none">check</span>}
    </Link>
);

export default StreakChip;
