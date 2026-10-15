'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {setLabWidgets} from "@/lib/actions/lab.actions";
import {LAB_WIDGET_IDS, type LabWidgetId} from "@/lib/lab/widgets";
import {LAB_COPY, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import Disclosure from "@/components/primitives/Disclosure";
import Switch from "@/components/primitives/Switch";

// "Add games to Today": one switch per widget the registry offers; a change saves the whole list
// as the preference and the server re-renders the cards and the list.
const WidgetPicker = ({chosen}: {chosen: readonly LabWidgetId[]}) => {
    const router = useRouter();
    const [busy, setBusy] = useState<LabWidgetId | null>(null);
    const toggle = async (id: LabWidgetId, on: boolean) => {
        if (busy) return;
        setBusy(id);
        const next = on ? [...chosen, id] : chosen.filter((w) => w !== id);
        const result = await setLabWidgets({widgets: next});
        setBusy(null);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        router.refresh();
    };
    return (
        <Disclosure summary={LAB_COPY.list.pickerSummary} className="mt-3" data-widget-picker>
            <p className="mb-3 mt-2 text-xs text-fg-muted">{LAB_COPY.list.pickerLead}</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {LAB_WIDGET_IDS.map((id) => {
                    const on = chosen.includes(id);
                    return (
                        <li key={id} className="row-card flex items-center justify-between gap-3 px-3 py-2">
                            <label htmlFor={`lab-widget-${id}`} className="text-sm text-fg">{LAB_WIDGET_TITLES[id]}</label>
                            <Switch id={`lab-widget-${id}`} checked={on} disabled={busy !== null} onCheckedChange={(value) => void toggle(id, value)} data-widget-switch={id} data-widget-on={on || undefined}/>
                        </li>
                    );
                })}
            </ul>
        </Disclosure>
    );
};

export default WidgetPicker;
