'use client';

import {useState, useTransition, type FormEvent} from "react";
import {toast} from "sonner";
import {saveDayFocus} from "@/lib/actions/lab.actions";
import {FOCUS_MAX} from "@/lib/lab/checkin";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import TextField from "@/components/primitives/TextField";

// Today's focus: one line, written to "What would you like to accomplish today?" and shown as
// text once saved, with Edit to change it; yesterday's note for today sits under the field with
// one press to take it. The action revalidates /learn, so the saved line arrives with its
// response — nothing is mirrored here: the field stays until the page's own `focus` says it is
// written, and comes back when a cleared one says it is not.
const DayFocus = ({focus, plan}: {focus: string | null; plan: string | null}) => {
    const copy = LAB_COPY.checkIn;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(focus ?? '');
    const [pending, startTransition] = useTransition();
    const showField = editing || focus === null;

    const submit = (text: string) => startTransition(async () => {
        const result = await saveDayFocus({focus: text});
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        setEditing(false);
    });
    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        submit(draft);
    };

    if (!showField) {
        return (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1" data-focus-text>
                <MicroLabel as="span">{copy.focusLabel}</MicroLabel>
                <span className="text-base text-fg">{focus}</span>
                <button type="button" onClick={() => { setDraft(focus ?? ''); setEditing(true); }} className="label-type text-xs text-brand hover:underline" data-focus-edit>
                    {copy.edit}
                </button>
            </div>
        );
    }
    return (
        <form onSubmit={onSubmit} className="mt-3 space-y-2" data-focus-form>
            <label htmlFor="lab-focus" className="block text-sm text-fg">{copy.question}</label>
            <div className="flex flex-wrap gap-2">
                <TextField id="lab-focus" font="body" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={FOCUS_MAX}
                           placeholder={copy.placeholder} className="min-w-0 flex-1" disabled={pending} data-focus-input/>
                <ActionButton type="submit" size="sm" disabled={pending} data-focus-save>{pending ? copy.saving : copy.save}</ActionButton>
                {focus !== null && (
                    <ActionButton variant="secondary" size="sm" onClick={() => { setDraft(focus); setEditing(false); }} disabled={pending} data-focus-cancel>{copy.cancel}</ActionButton>
                )}
            </div>
            {plan && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-focus-plan>
                    <MicroLabel as="span">{copy.planLabel}</MicroLabel>
                    <span className="text-sm text-fg-soft">{plan}</span>
                    <ActionButton variant="secondary" size="xs" onClick={() => submit(plan)} disabled={pending} data-focus-use-plan>{copy.usePlan}</ActionButton>
                </div>
            )}
        </form>
    );
};

export default DayFocus;
