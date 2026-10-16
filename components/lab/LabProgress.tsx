import {LAB_COPY, LAB_TRACK_LABELS} from "@/lib/learn/copy/lab";
import type {LabView} from "@/lib/lab/view";
import StatTile from "@/components/primitives/StatTile";

// The lab's counts as one strip of tiles: units studied per track, cards learned, cards due
// today. The streak itself is its own card on Today (components/learn/StreakMini).
const LabProgress = ({progress}: {progress: LabView['progress']}) => (
    <div className="flex flex-wrap gap-x-8 gap-y-3" data-lab-progress>
        {progress.perTrack.map((track) => (
            <StatTile key={track.track} label={LAB_TRACK_LABELS[track.track]} value={LAB_COPY.unitsOf(track.done, track.planned)} hint={LAB_COPY.unitsLabel} size="sm"/>
        ))}
        <StatTile label={LAB_COPY.learnedLabel} value={String(progress.learned)} size="sm"/>
        <StatTile label={LAB_COPY.dueLabel} value={String(progress.dueToday)} size="sm"/>
    </div>
);

export default LabProgress;
