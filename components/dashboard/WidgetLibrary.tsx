'use client';

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {CATEGORY_LABELS, CATEGORY_ORDER, WIDGETS, type WidgetId} from "@/lib/dashboard/widgets";
import {MAX_WIDGETS} from "@/lib/dashboard/layout";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ids: WidgetId[];          // widgets not yet on the dashboard, in category order
    count: number;            // widgets currently on the dashboard
    onAdd: (id: WidgetId) => void;
};

const Badge = ({children}: {children: React.ReactNode}) => (
    <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] bg-surface-3 text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{children}</span>
);

const WidgetLibrary = ({open, onOpenChange, ids, count, onAdd}: Props) => {
    const full = count >= MAX_WIDGETS;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-hide-default">
                <DialogHeader>
                    <DialogTitle style={{fontFamily: 'var(--type-display)'}}>Add widgets</DialogTitle>
                    <DialogDescription>
                        {full ? `Your dashboard holds ${MAX_WIDGETS} widgets — remove one to add another.` : 'Added widgets load once you save the layout.'}
                    </DialogDescription>
                </DialogHeader>
                {ids.length === 0 ? (
                    <p className="text-sm text-fg-muted py-6 text-center">Every widget is already on your dashboard.</p>
                ) : (
                    <div className="space-y-5">
                        {CATEGORY_ORDER.map((category) => {
                            const inCategory = ids.filter((id) => WIDGETS[id].category === category);
                            if (inCategory.length === 0) return null;
                            return (
                                <div key={category}>
                                    <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>
                                        {CATEGORY_LABELS[category]}
                                    </div>
                                    <div className="space-y-1.5">
                                        {inCategory.map((id) => {
                                            const def = WIDGETS[id];
                                            return (
                                                <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-line-strong/20 bg-surface-2/40 px-3 py-2.5">
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <span className="material-symbols-outlined text-brand mt-0.5">{def.icon}</span>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-sm font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>{def.title}</span>
                                                                {def.isNew && <Badge>New</Badge>}
                                                                {def.isClient && <Badge>Live embed</Badge>}
                                                                {def.heavy && <Badge>Extra API calls</Badge>}
                                                                {def.availability === 'advanced' && <Badge>Advanced</Badge>}
                                                            </div>
                                                            <p className="text-xs text-fg-muted leading-snug mt-0.5">{def.description}</p>
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => onAdd(id)} disabled={full}
                                                            className="shrink-0 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] bg-brand text-on-brand disabled:opacity-40"
                                                            style={{fontFamily: 'var(--type-mono)'}}>
                                                        Add
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default WidgetLibrary;
