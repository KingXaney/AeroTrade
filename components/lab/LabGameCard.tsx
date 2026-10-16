import type {DailyPuzzleCardView} from "@/lib/games/store";
import type {LabWidgetCard} from "@/lib/lab/view";
import {LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import LabWidgetBody from "@/components/lab/LabWidgetBody";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// One game's card on Today: a Panel with the game's title over its body (the hub's own card body,
// the puzzle card, or an outside site's line and link), filling its cell of the HUD's grid. The
// puzzle card's own streak strip is off while the streak card is on the page.
type Props = {widget: LabWidgetCard; puzzle: DailyPuzzleCardView | null; showStreak?: boolean};

const LabGameCard = ({widget, puzzle, showStreak = true}: Props) => (
    <Panel id={`lab-widget-${widget.id}`} aria-labelledby={`lab-widget-${widget.id}-heading`} pad={4} className="flex h-full flex-col" data-lab-widget={widget.id}>
        <SectionHeading id={`lab-widget-${widget.id}-heading`} spacing="sm">{LAB_WIDGET_TITLES[widget.id]}</SectionHeading>
        <LabWidgetBody widget={widget} puzzle={puzzle} showStreak={showStreak}/>
    </Panel>
);

export default LabGameCard;
