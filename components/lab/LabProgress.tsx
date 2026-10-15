import {LAB_COPY, LAB_TRACK_LABELS} from "@/lib/learn/copy/lab";
import type {LabView} from "@/lib/lab/view";
import StatTile from "@/components/primitives/StatTile";
import MicroLabel from "@/components/primitives/MicroLabel";

// The lab's counts: units studied per track, cards learned, cards due today, and how a day is
// counted. The streak itself is the hero at the top of Today (components/learn/StreakHero).
const LabProgress = ({progress}: {progress: LabView['progress']}) => (
    <div data-lab-progress>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {progress.perTrack.map((track) => (
                <StatTile key={track.track} label={LAB_TRACK_LABELS[track.track]} value={LAB_COPY.unitsOf(track.done, track.planned)} hint={LAB_COPY.unitsLabel} size="sm"/>
            ))}
            <StatTile label={LAB_COPY.learnedLabel} value={String(progress.learned)} size="sm"/>
            <StatTile label={LAB_COPY.dueLabel} value={String(progress.dueToday)} size="sm"/>
        </div>
        <MicroLabel as="p" className="mt-4 normal-case tracking-normal">{LAB_COPY.streakRule}</MicroLabel>
    </div>
);

export default LabProgress;
