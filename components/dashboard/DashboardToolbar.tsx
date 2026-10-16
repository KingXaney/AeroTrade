'use client';

import type {ReactNode} from "react";
import {Loader2, Plus, RotateCcw, Settings2} from "lucide-react";
import {cn} from "@/lib/utils";
import {actionButton} from "@/components/primitives/ActionButton";

// The arranging toolbar: one button to start, then add, reset, cancel and save. The words are
// the dashboard's unless the caller hands its own (the lab's arranging view, components/lab/LabArrange).
export type ToolbarLabels = {customize: string; add: string; reset: string; resetTitle: string; cancel: string; save: string};

const DEFAULT_LABELS: ToolbarLabels = {
    customize: 'Customize',
    add: 'Add widget',
    reset: 'Reset',
    resetTitle: 'Restore the default dashboard (applied on Save)',
    cancel: 'Cancel',
    save: 'Save',
};

type Props = {
    editing: boolean;
    dirty: boolean;
    pending: boolean;
    onCustomize: () => void;
    onAdd: () => void;
    onReset: () => void;
    onSave: () => void;
    onCancel: () => void;
    extra?: ReactNode;
    labels?: Partial<ToolbarLabels>;
};

const press = 'inline-flex items-center gap-2 transition-all active:scale-[0.98] disabled:active:scale-100';
const ghost = actionButton({variant: 'secondary', className: press});
const primary = actionButton({className: press});

const DashboardToolbar = ({editing, dirty, pending, onCustomize, onAdd, onReset, onSave, onCancel, extra, labels}: Props) => {
    const words = {...DEFAULT_LABELS, ...labels};
    return (
        <div className="flex flex-wrap items-center gap-2 font-mono" data-arrange-toolbar={editing ? 'editing' : 'viewing'}>
            {extra}
            {!editing ? (
                <button type="button" onClick={onCustomize} className={ghost} data-toolbar-customize>
                    <Settings2 className="size-4" />
                    {words.customize}
                </button>
            ) : (
                <>
                    <button type="button" onClick={onAdd} className={ghost} data-toolbar-add>
                        <Plus className="size-4" />
                        {words.add}
                    </button>
                    <button type="button" onClick={onReset} className={ghost} title={words.resetTitle} data-toolbar-reset>
                        <RotateCcw className="size-4" />
                        {words.reset}
                    </button>
                    <button type="button" onClick={onCancel} disabled={pending} className={ghost} data-toolbar-cancel>{words.cancel}</button>
                    <button type="button" onClick={onSave} disabled={!dirty || pending} className={cn(primary)} data-toolbar-save>
                        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                        {words.save}
                    </button>
                </>
            )}
        </div>
    );
};

export default DashboardToolbar;
