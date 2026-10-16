'use client';

import {useState, useTransition, type FormEvent} from "react";
import {toast} from "sonner";
import {saveReflection} from "@/lib/actions/lab.actions";
import {FOCUS_MAX, NOTE_MAX} from "@/lib/lab/checkin";
import type {LabReflectionView} from "@/lib/lab/view";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import TextField, {TextArea} from "@/components/primitives/TextField";

// The end of the day, at the foot of Today: the list's done and open items as two lines (read
// from the rows, never typed), then notes on the day and tomorrow's focus, saved to the day's
// note. Tomorrow's line is what the next morning's check-in offers. The fields keep what was
// typed; the action revalidates /learn, so the page's own copy of the note follows.
const Reflection = ({view}: {view: LabReflectionView}) => {
    const copy = LAB_COPY.reflection;
    const [notes, setNotes] = useState(view.notes ?? '');
    const [next, setNext] = useState(view.next ?? '');
    const [pending, startTransition] = useTransition();

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const result = await saveReflection({notes, next});
            if (!result.success) {
                toast.error(result.message);
                return;
            }
            toast.success(copy.saved);
        });
    };

    return (
        <Panel as="form" id="lab-reflection" aria-labelledby="lab-reflection-heading" className="h-full" onSubmit={onSubmit} data-lab-reflection>
            <SectionHeading id="lab-reflection-heading" spacing="sm">{copy.heading}</SectionHeading>
            <p className="mb-4 max-w-2xl text-sm text-fg-muted">{copy.lead}</p>
            <dl className="mb-4 space-y-1 text-sm">
                <div className="flex flex-wrap gap-x-2">
                    <dt className="shrink-0"><MicroLabel>{copy.doneLabel}</MicroLabel></dt>
                    <dd className="text-fg-soft" data-reflection-done={view.done.length}>{view.done.length > 0 ? view.done.join(' · ') : copy.nothingDone}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                    <dt className="shrink-0"><MicroLabel>{copy.leftLabel}</MicroLabel></dt>
                    <dd className="text-fg-muted" data-reflection-left={view.left.length}>{view.left.length > 0 ? view.left.join(' · ') : copy.nothingLeft}</dd>
                </div>
            </dl>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                    <MicroLabel as="span" className="mb-1 block">{copy.notesLabel}</MicroLabel>
                    <TextArea font="body" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={NOTE_MAX}
                              placeholder={copy.notesPlaceholder} className="w-full" disabled={pending} data-reflection-notes/>
                </label>
                <label className="block">
                    <MicroLabel as="span" className="mb-1 block">{copy.nextLabel}</MicroLabel>
                    <TextField font="body" value={next} onChange={(e) => setNext(e.target.value)} maxLength={FOCUS_MAX}
                               placeholder={copy.nextPlaceholder} className="w-full" disabled={pending} data-reflection-next/>
                </label>
            </div>
            <div className="mt-3">
                <ActionButton type="submit" size="sm" disabled={pending} data-reflection-save>{pending ? copy.saving : copy.save}</ActionButton>
            </div>
        </Panel>
    );
};

export default Reflection;
