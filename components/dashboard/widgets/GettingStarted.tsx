import Link from "next/link";
import {cn} from "@/lib/utils";
import type {Mission} from "@/lib/learn/missions";
import {MISSIONS_FOOTER, MISSIONS_LESSON_LABEL} from "@/lib/learn/copy/missions";
import MicroLabel from "@/components/primitives/MicroLabel";
import HideMissionsButton from "@/components/dashboard/widgets/HideMissionsButton";

// The First-week checklist: five things to do, each with a lesson behind a chevron.
// Completion is read from rows, so a row ticks itself the moment the thing was done.
// No streak, no reward, no progress bar — a count and the promise that it leaves.

const GettingStarted = ({missions}: {missions: Mission[]}) => {
    const done = missions.filter((m) => m.done).length;
    return (
        <div>
            <ul className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {missions.map((mission) => (
                    <li key={mission.id} id={`mission-${mission.id}`} data-done={mission.done} className="min-w-0">
                        <div className="flex items-start gap-2">
                            <span
                                className={cn('material-symbols-outlined text-lg shrink-0', mission.done ? 'text-positive' : 'text-fg-muted')}
                                aria-hidden="true"
                            >
                                {mission.done ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            <div className="min-w-0">
                                <Link href={mission.href} className={cn('text-sm font-semibold hover:text-brand transition-colors', mission.done ? 'text-fg-muted' : 'text-fg')}>
                                    {mission.title}
                                </Link>
                                <span className="sr-only">{mission.done ? ' — done' : ' — not yet'}</span>
                                <details className="group mt-1">
                                    <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm text-fg-muted transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                                        <MicroLabel>{MISSIONS_LESSON_LABEL}</MicroLabel>
                                    </summary>
                                    <div className="mt-1.5 space-y-1">
                                        {mission.lesson.map((sentence) => (
                                            <p key={sentence} className="text-xs text-fg-muted leading-relaxed">{sentence}</p>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] text-fg-muted" id="missions-footer">{MISSIONS_FOOTER(done, missions.length)}</p>
                <HideMissionsButton />
            </div>
        </div>
    );
};

export default GettingStarted;
