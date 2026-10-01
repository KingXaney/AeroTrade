'use client';

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {CATEGORY_LABELS, CATEGORY_ORDER, WIDGETS, type WidgetId} from "@/lib/dashboard/catalog";
import {MAX_WIDGETS} from "@/lib/dashboard/layout";
import RowCard from "@/components/primitives/RowCard";
import ActionButton from "@/components/primitives/ActionButton";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ids: WidgetId[];          // widgets not yet on the dashboard, in category order
    count: number;            // widgets currently on the dashboard
    onAdd: (id: WidgetId) => void;
};

const Badge = ({children}: {children: React.ReactNode}) => (
    <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] bg-surface-3 text-fg-muted font-mono">{children}</span>
);

const WidgetLibrary = ({open, onOpenChange, ids, count, onAdd}: Props) => {
    const full = count >= MAX_WIDGETS;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-hide-default">
                <DialogHeader>
                    <DialogTitle className="font-heading">Add widgets</DialogTitle>
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
                                    <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2 font-mono">
                                        {CATEGORY_LABELS[category]}
                                    </div>
                                    <div className="space-y-1.5">
                                        {inCategory.map((id) => {
                                            const def = WIDGETS[id];
                                            return (
                                                <RowCard key={id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <span className="material-symbols-outlined text-brand mt-0.5">{def.icon}</span>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-sm font-semibold text-fg font-heading">{def.title}</span>
                                                                {def.isNew && <Badge>New</Badge>}
                                                                {def.isClient && <Badge>Live embed</Badge>}
                                                                {def.heavy && <Badge>Extra API calls</Badge>}
                                                                {def.availability === 'advanced' && <Badge>Advanced</Badge>}
                                                            </div>
                                                            <p className="text-xs text-fg-muted leading-snug mt-0.5">{def.description}</p>
                                                        </div>
                                                    </div>
                                                    <ActionButton size="xs" className="shrink-0 rounded-md text-[10px] disabled:opacity-40" onClick={() => onAdd(id)} disabled={full}>
                                                        Add
                                                    </ActionButton>
                                                </RowCard>
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
