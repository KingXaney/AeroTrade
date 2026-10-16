'use client';

import {useState} from "react";
import {toast} from "sonner";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {setGameOnToday} from "@/lib/actions/lab.actions";
import {LAB_WIDGET_IDS, labWidget, type LabWidgetId} from "@/lib/lab/widgets";
import {LAB_COPY, LAB_WIDGET_BLURBS, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import Switch from "@/components/primitives/Switch";

// "Games" on Today's list: a dialog with one switch per game the registry offers — on is a card
// on Today and an item on the list. Each switch saves at once (setGameOnToday writes the layout
// and revalidates /learn), so the switch shows the page's own answer: `on` is the saved layout's,
// handed down by the page, and the dialog stays open through it since the HUD above is not keyed
// on the layout.
const GamesOnToday = ({on}: {on: readonly LabWidgetId[]}) => {
    const copy = LAB_COPY.games;
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<LabWidgetId | null>(null);
    const toggle = async (id: LabWidgetId, next: boolean) => {
        if (busy) return;
        setBusy(id);
        const result = await setGameOnToday({id, on: next});
        setBusy(null);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        toast.success(next ? copy.on(LAB_WIDGET_TITLES[id]) : copy.off(LAB_WIDGET_TITLES[id]));
    };
    const groups = [
        {label: copy.inApp, ids: LAB_WIDGET_IDS.filter((id) => labWidget(id).kind !== 'outside')},
        {label: copy.elsewhere, ids: LAB_WIDGET_IDS.filter((id) => labWidget(id).kind === 'outside')},
    ];
    return (
        <>
            <ActionButton variant="secondary" size="xs" onClick={() => setOpen(true)} data-games-on-today>{copy.button}</ActionButton>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto scrollbar-hide-default" data-games-dialog>
                    <DialogHeader>
                        <DialogTitle className="font-heading">{copy.title}</DialogTitle>
                        <DialogDescription>{copy.lead}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        {groups.map((group) => (
                            <div key={group.label}>
                                <MicroLabel as="p" className="mb-2">{group.label}</MicroLabel>
                                <ul className="space-y-1.5">
                                    {group.ids.map((id) => {
                                        const checked = on.includes(id);
                                        return (
                                            <RowCard as="li" key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                                                <div className="flex min-w-0 items-start gap-3">
                                                    <span className="material-symbols-outlined mt-0.5 text-brand" aria-hidden="true">{labWidget(id).icon}</span>
                                                    <div className="min-w-0">
                                                        <label htmlFor={`game-on-${id}`} className="text-sm font-semibold text-fg font-heading">{LAB_WIDGET_TITLES[id]}</label>
                                                        <p className="mt-0.5 text-xs leading-snug text-fg-muted">{LAB_WIDGET_BLURBS[id]}</p>
                                                    </div>
                                                </div>
                                                <Switch id={`game-on-${id}`} checked={checked} disabled={busy !== null} onCheckedChange={(value) => void toggle(id, value)}
                                                        data-game-switch={id} data-game-on={checked || undefined}/>
                                            </RowCard>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default GamesOnToday;
