import type {DailyPuzzleCardView} from "@/lib/games/store";
import type {LabWidgetCard} from "@/lib/lab/view";
import {LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import LabWidgetBody from "@/components/lab/LabWidgetBody";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// One game's card on Today: a Panel with the game's title over its body (the hub's own card body,
// the puzzle card, or an outside site's line and link), filling its cell of the HUD's grid.
const LabGameCard = ({widget, puzzle}: {widget: LabWidgetCard; puzzle: DailyPuzzleCardView | null}) => (
    <Panel id={`lab-widget-${widget.id}`} aria-labelledby={`lab-widget-${widget.id}-heading`} className="flex h-full flex-col" data-lab-widget={widget.id}>
        <SectionHeading id={`lab-widget-${widget.id}-heading`}>{LAB_WIDGET_TITLES[widget.id]}</SectionHeading>
        <LabWidgetBody widget={widget} puzzle={puzzle}/>
    </Panel>
);

export default LabGameCard;
