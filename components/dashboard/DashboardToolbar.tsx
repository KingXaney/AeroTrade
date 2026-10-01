'use client';

import type {ReactNode} from "react";
import {Loader2, Plus, RotateCcw, Settings2} from "lucide-react";
import {cn} from "@/lib/utils";
import {actionButton} from "@/components/primitives/ActionButton";

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
};

const press = 'inline-flex items-center gap-2 transition-all active:scale-[0.98] disabled:active:scale-100';
const ghost = actionButton({variant: 'secondary', className: press});
const primary = actionButton({className: press});

const DashboardToolbar = ({editing, dirty, pending, onCustomize, onAdd, onReset, onSave, onCancel, extra}: Props) => (
    <div className="flex flex-wrap items-center gap-2" style={{fontFamily: 'var(--type-mono)'}}>
        {extra}
        {!editing ? (
            <button type="button" onClick={onCustomize} className={ghost}>
                <Settings2 className="size-4" />
                Customize
            </button>
        ) : (
            <>
                <button type="button" onClick={onAdd} className={ghost}>
                    <Plus className="size-4" />
                    Add widget
                </button>
                <button type="button" onClick={onReset} className={ghost} title="Restore the default dashboard (applied on Save)">
                    <RotateCcw className="size-4" />
                    Reset
                </button>
                <button type="button" onClick={onCancel} disabled={pending} className={ghost}>Cancel</button>
                <button type="button" onClick={onSave} disabled={!dirty || pending} className={cn(primary)}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save
                </button>
            </>
        )}
    </div>
);

export default DashboardToolbar;
