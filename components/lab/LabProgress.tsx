import {LAB_COPY, LAB_TRACK_LABELS} from "@/lib/learn/copy/lab";
import {STREAK_COPY} from "@/lib/learn/copy/games";
import type {LabView} from "@/lib/lab/view";
import StatTile from "@/components/primitives/StatTile";
import MicroLabel from "@/components/primitives/MicroLabel";
import WeekStrip from "@/components/games/WeekStrip";

// The lab's counts and its streak: units studied per track, cards learned, cards due today, and
// the days — counts beside the one streak the lab keeps (the games keep the other).
const LabProgress = ({progress}: {progress: LabView['progress']}) => {
    const {streak} = progress;
    return (
        <div data-lab-progress data-lab-streak={streak.current}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {progress.perTrack.map((track) => (
                    <StatTile key={track.track} label={LAB_TRACK_LABELS[track.track]} value={LAB_COPY.unitsOf(track.done, track.planned)} hint={LAB_COPY.unitsLabel} size="sm"/>
                ))}
                <StatTile label={LAB_COPY.learnedLabel} value={String(progress.learned)} size="sm"/>
                <StatTile label={LAB_COPY.dueLabel} value={String(progress.dueToday)} size="sm"/>
                <StatTile label={LAB_COPY.streakLabel} value={streak.current > 0 ? STREAK_COPY.streak(streak.current) : STREAK_COPY.none} hint={STREAK_COPY.longest(streak.longest)} size="sm"/>
            </div>
            <div className="mt-4">
                <MicroLabel as="p" className="mb-2">{STREAK_COPY.weekHeading}</MicroLabel>
                <WeekStrip week={streak.week}/>
                <p className="mt-2 text-xs text-fg-muted" data-lab-session>
                    {streak.todayDone ? LAB_COPY.sessionDoneToday : streak.atRisk ? LAB_COPY.sessionAtRisk(streak.current) : LAB_COPY.sessionStart}
                </p>
                <MicroLabel as="p" className="mt-1 normal-case tracking-normal">{LAB_COPY.streakRule}</MicroLabel>
            </div>
        </div>
    );
};

export default LabProgress;
