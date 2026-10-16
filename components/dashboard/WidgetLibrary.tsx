'use client';

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import RowCard from "@/components/primitives/RowCard";
import ActionButton from "@/components/primitives/ActionButton";

// The dialog that adds a widget: rows in groups, each with its icon, title, badges and a line, and
// one Add button. It knows no catalog: the dashboard grid hands it the catalog's widgets by
// category, the lab's arranging view (components/lab/LabArrange) its games, each with its own words.
export type LibraryRow = {id: string; title: string; description: string; icon: string; badges?: readonly string[]};
export type LibraryGroup = {label: string | null; rows: readonly LibraryRow[]};
export type LibraryCopy = {title: string; lead: string; fullLead: string; none: string; add: string};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: readonly LibraryGroup[];   // what is not yet on the page; an empty group is not drawn
    full: boolean;                     // the page holds as many as it may
    copy: LibraryCopy;
    onAdd: (id: string) => void;
};

const Badge = ({children}: {children: React.ReactNode}) => (
    <span className="label-type rounded px-1.5 py-0.5 text-[9px] bg-surface-3 text-fg-muted">{children}</span>
);

const WidgetLibrary = ({open, onOpenChange, groups, full, copy, onAdd}: Props) => {
    const shown = groups.filter((group) => group.rows.length > 0);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-hide-default" data-widget-library>
                <DialogHeader>
                    <DialogTitle className="font-heading">{copy.title}</DialogTitle>
                    <DialogDescription>{full ? copy.fullLead : copy.lead}</DialogDescription>
                </DialogHeader>
                {shown.length === 0 ? (
                    <p className="text-sm text-fg-muted py-6 text-center">{copy.none}</p>
                ) : (
                    <div className="space-y-5">
                        {shown.map((group, index) => (
                            <div key={group.label ?? index}>
                                {group.label && (
                                    <div className="label-type text-[length:var(--label-size)] text-fg-muted mb-2">{group.label}</div>
                                )}
                                <div className="space-y-1.5">
                                    {group.rows.map((row) => (
                                        <RowCard key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5" data-library-row={row.id}>
                                            <div className="flex items-start gap-3 min-w-0">
                                                <span className="material-symbols-outlined text-brand mt-0.5" aria-hidden="true">{row.icon}</span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-semibold text-fg font-heading">{row.title}</span>
                                                        {row.badges?.map((badge) => <Badge key={badge}>{badge}</Badge>)}
                                                    </div>
                                                    <p className="text-xs text-fg-muted leading-snug mt-0.5">{row.description}</p>
                                                </div>
                                            </div>
                                            <ActionButton size="xs" className="shrink-0 rounded-md text-[10px] disabled:opacity-40" onClick={() => onAdd(row.id)} disabled={full} aria-label={`${copy.add} ${row.title}`} data-library-add={row.id}>
                                                {copy.add}
                                            </ActionButton>
                                        </RowCard>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default WidgetLibrary;
