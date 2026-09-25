import type {WidgetDefinition, WidgetSpan} from "@/lib/dashboard/widgets";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";

// Lightweight drag preview — never a clone of the body (that would double-mount embeds).
// outline, not ring: .glass-panel sets box-shadow unlayered, so the ring never drew.
const DragGhost = ({def, span, width}: {def: WidgetDefinition; span: WidgetSpan; width?: number}) => (
    <Panel as="div" pad={0}
           className="px-4 py-3 flex items-center gap-3 outline outline-2 -outline-offset-2 outline-brand/60 cursor-grabbing"
           style={{width: width ? Math.min(width, 360) : undefined}}>
        <span className="material-symbols-outlined text-brand">{def.icon}</span>
        <div className="min-w-0">
            <MicroLabel as="div" tone="fg" className="truncate">{def.title}</MicroLabel>
            <div className="font-mono text-[10px] text-fg-muted">{span} of 12 columns</div>
        </div>
    </Panel>
);

export default DragGhost;
