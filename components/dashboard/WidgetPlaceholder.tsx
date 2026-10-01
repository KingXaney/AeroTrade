import type {WidgetDefinition} from "@/lib/dashboard/catalog";
import MicroLabel from "@/components/primitives/MicroLabel";

// A widget added during an edit session has no server-rendered body until Save;
// live embeds are also swapped for this while arranging so iframes don't reload on every move.
const WidgetPlaceholder = ({def, note = 'Save to load'}: {def: WidgetDefinition; note?: string}) => (
    <div className="flex flex-col items-center justify-center text-center gap-2 rounded-lg border border-dashed border-brand/30 p-6"
         style={{minHeight: Math.min(def.minHeight, 220)}}>
        <span className="material-symbols-outlined text-2xl text-brand">{def.icon}</span>
        <div className="text-sm font-semibold text-fg font-heading">{def.title}</div>
        <p className="text-xs text-fg-muted max-w-xs">{def.description}</p>
        <MicroLabel>{note}</MicroLabel>
    </div>
);

export default WidgetPlaceholder;
