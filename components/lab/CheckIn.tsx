import type {CheckInView} from "@/lib/lab/checkin";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import DayFocus from "@/components/lab/DayFocus";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The check-in at the top of Today (lib/lab/checkin): the date, a greeting by the Eastern hour,
// today's focus (components/lab/DayFocus) with yesterday's note for it, and yesterday — what
// counted and what was left — once the owner has a day behind them.
const CheckIn = ({view, name}: {view: CheckInView; name: string | null | undefined}) => {
    const copy = LAB_COPY.checkIn;
    const yesterday = view.yesterday;
    return (
        <Panel id="lab-checkin" aria-labelledby="lab-checkin-heading" data-lab-checkin={view.period}>
            <MicroLabel as="p" data-lab-date>{view.dateLabel}</MicroLabel>
            <SectionHeading id="lab-checkin-heading" spacing="none" className="mt-1 text-xl">{copy.greeting[view.period](name)}</SectionHeading>
            <DayFocus focus={view.focus} plan={view.plan}/>
            {yesterday && (
                <div className="mt-4 border-t border-line-strong/20 pt-3" data-lab-yesterday data-yesterday-done={yesterday.done.length} data-yesterday-left={yesterday.left.length}>
                    <MicroLabel as="p" className="mb-1">
                        {copy.yesterdayHeading} · {copy.yesterdayDone(yesterday.done.length)} · {copy.yesterdayLeft(yesterday.left.length)}
                    </MicroLabel>
                    {yesterday.done.length === 0 && yesterday.left.length === 0 ? (
                        <p className="text-sm text-fg-muted">{copy.yesterdayNothing}</p>
                    ) : (
                        <dl className="space-y-0.5 text-sm">
                            {yesterday.done.length > 0 && (
                                <div className="flex flex-wrap gap-x-2">
                                    <dt className="shrink-0"><MicroLabel>{copy.doneLabel}</MicroLabel></dt>
                                    <dd className="text-fg-soft">{yesterday.done.join(' · ')}</dd>
                                </div>
                            )}
                            {yesterday.left.length > 0 && (
                                <div className="flex flex-wrap gap-x-2">
                                    <dt className="shrink-0"><MicroLabel>{copy.leftLabel}</MicroLabel></dt>
                                    <dd className="text-fg-muted">{yesterday.left.join(' · ')}</dd>
                                </div>
                            )}
                        </dl>
                    )}
                </div>
            )}
        </Panel>
    );
};

export default CheckIn;
