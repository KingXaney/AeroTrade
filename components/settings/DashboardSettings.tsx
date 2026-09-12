'use client';

import {useEffect, useRef, useState, useTransition} from "react";
import Link from "next/link";
import {toast} from "sonner";
import {ArrowDown, ArrowUp, X} from "lucide-react";
import {Switch} from "@/components/ui/switch";
import {CATEGORY_LABELS, CATEGORY_ORDER, SPAN_LABELS, WIDGETS, type WidgetId} from "@/lib/dashboard/widgets";
import {
    addWidget, layoutsEqual, missingWidgetIds, moveWidget, removeWidget, resetLayout, setSpan, type DashboardLayout,
} from "@/lib/dashboard/layout";
import {resetDashboardLayout, saveDashboardLayout} from "@/lib/actions/dashboard.actions";
import {cn} from "@/lib/utils";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const SAVE_DEBOUNCE_MS = 300;

const switchClass = "data-[state=checked]:!bg-brand-strong data-[state=unchecked]:!bg-surface-4 data-[state=unchecked]:!border data-[state=unchecked]:!border-line-strong transition-colors duration-200";
const iconButton = 'inline-flex items-center justify-center size-7 rounded-md text-fg-muted hover:text-fg hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:hover:bg-transparent';

type Props = {initialLayout: DashboardLayout; availableIds: WidgetId[]};

// List-based editor: every change persists (debounced) and reverts on failure.
const DashboardSettings = ({initialLayout, availableIds}: Props) => {
    const [layout, setLayout] = useState(initialLayout);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [, startTransition] = useTransition();
    const lastSaved = useRef(initialLayout);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const attempt = useRef(0);

    const persist = (snapshot: DashboardLayout) => {
        const mine = ++attempt.current;
        startTransition(async () => {
            const result = await saveDashboardLayout(snapshot);
            if (result.success) {
                lastSaved.current = result.layout ?? snapshot;
            } else if (mine === attempt.current) {
                // Only the latest attempt may revert, so a stale failure never undoes a later success.
                toast.error(result.message ?? 'Could not save your dashboard');
                setLayout(lastSaved.current);
            }
        });
    };

    useEffect(() => {
        if (layoutsEqual(layout, lastSaved.current)) return;
        if (timer.current) clearTimeout(timer.current);
        const snapshot = layout;
        timer.current = setTimeout(() => { timer.current = null; persist(snapshot); }, SAVE_DEBOUNCE_MS);
        return () => {
            // Unmounting (or a newer change) with a save still pending: flush it rather than lose it.
            if (timer.current) { clearTimeout(timer.current); timer.current = null; persist(snapshot); }
        };
    }, [layout]);

    // React re-inserts the moved row and drops focus; restore it on the same control.
    const moveRow = (from: number, to: number, focusId: string) => {
        setLayout((l) => moveWidget(l, from, to));
        requestAnimationFrame(() => document.getElementById(focusId)?.focus());
    };

    const reset = () => new Promise<void>((resolve) => startTransition(async () => {
        // Cancel any pending autosave first. Its effect cleanup calls persist(snapshot),
        // so a timer armed before the reset would write the old layout straight back over
        // the $unset we are about to do.
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        const result = await resetDashboardLayout();
        if (result.success) {
            lastSaved.current = resetLayout();
            setLayout(lastSaved.current);
            toast.success('Dashboard reset to default');
        } else {
            toast.error(result.message ?? 'Could not reset your dashboard');
        }
        resolve();
    }));

    const available = new Set(availableIds);
    const missing = missingWidgetIds(layout).filter((id) => available.has(id));

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>Your widgets · {layout.widgets.length}</div>
                    <Link href="/?customize=1" className="text-xs text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>Arrange on dashboard →</Link>
                </div>
                {layout.widgets.length === 0 ? (
                    <p className="text-sm text-fg-muted">No widgets — add some below or reset to the default layout.</p>
                ) : (
                    <div className="space-y-1.5">
                        {layout.widgets.map((w, index) => {
                            const def = WIDGETS[w.id];
                            return (
                                <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-line-strong/20 bg-surface-2/40 px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-base text-brand">{def.icon}</span>
                                        <span className="text-sm text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{def.title}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <select aria-label={`${def.title} width`} value={w.span}
                                                onChange={(e) => setLayout((l) => setSpan(l, w.id, Number(e.target.value)))}
                                                className="h-7 rounded-md border border-line-strong/30 bg-surface-0 px-1.5 text-[10px] uppercase tracking-[0.08em] text-fg"
                                                style={{fontFamily: 'var(--type-mono)'}}>
                                            {def.spans.map((s) => <option key={s} value={s}>{SPAN_LABELS[s]} · {s}/12</option>)}
                                        </select>
                                        <button id={`dash-up-${w.id}`} type="button" className={iconButton} disabled={index === 0} aria-label="Move up"
                                                onClick={() => moveRow(index, index - 1, index - 1 === 0 ? `dash-down-${w.id}` : `dash-up-${w.id}`)}><ArrowUp className="size-4" /></button>
                                        <button id={`dash-down-${w.id}`} type="button" className={iconButton} disabled={index === layout.widgets.length - 1} aria-label="Move down"
                                                onClick={() => moveRow(index, index + 1, index + 1 === layout.widgets.length - 1 ? `dash-up-${w.id}` : `dash-down-${w.id}`)}><ArrowDown className="size-4" /></button>
                                        <button type="button" className={cn(iconButton, 'hover:text-negative')} aria-label={`Remove ${def.title}`}
                                                onClick={() => setLayout((l) => removeWidget(l, w.id))}><X className="size-4" /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>Add widgets</div>
                {missing.length === 0 ? (
                    <p className="text-sm text-fg-muted">Every widget is on your dashboard.</p>
                ) : (
                    <div className="space-y-4">
                        {CATEGORY_ORDER.map((category) => {
                            const inCategory = missing.filter((id) => WIDGETS[id].category === category);
                            if (inCategory.length === 0) return null;
                            return (
                                <div key={category}>
                                    <div className="text-[10px] text-fg-muted mb-1.5" style={{fontFamily: 'var(--type-mono)'}}>{CATEGORY_LABELS[category]}</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                        {inCategory.map((id) => {
                                            const def = WIDGETS[id];
                                            return (
                                                <label key={id} className="flex items-center justify-between gap-3 rounded-lg border border-line-strong/20 bg-surface-2/40 px-3 py-2 cursor-pointer">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="material-symbols-outlined text-base text-brand">{def.icon}</span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{def.title}</div>
                                                            <div className="text-[11px] text-fg-muted truncate">{def.description}</div>
                                                        </div>
                                                    </div>
                                                    <Switch checked={false} onCheckedChange={() => setLayout((l) => addWidget(l, id))} className={switchClass} aria-label={`Add ${def.title}`} />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-line-strong/20">
                <p className="text-[11px] text-fg-muted">Changes save automatically.</p>
                <button type="button" onClick={() => setConfirmingReset(true)}
                        className="text-xs uppercase tracking-[0.1em] text-fg-muted hover:text-negative transition-colors" style={{fontFamily: 'var(--type-mono)'}}>
                    Reset to default
                </button>
            </div>

            {/* This used to fire on the first click and $unset the saved layout
                immediately — sitting directly under "Changes save automatically." The
                grid's own reset is revertible until you press Save; this one never was. */}
            <ConfirmDialog
                open={confirmingReset}
                onOpenChange={setConfirmingReset}
                title="Reset your dashboard?"
                description="Your saved arrangement — which widgets you added, their order and their widths — is discarded and the default layout takes its place. This cannot be undone."
                confirmLabel="Reset dashboard"
                destructive
                onConfirm={reset}
            />
        </div>
    );
};

export default DashboardSettings;
