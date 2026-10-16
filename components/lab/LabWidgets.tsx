import Link from "next/link";
import type {DailyPuzzleCardView} from "@/lib/games/store";
import type {LabWidgetCard} from "@/lib/lab/view";
import {GAMES_COPY} from "@/lib/learn/copy/games";
import {LAB_COPY, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import {spanClass} from "@/components/dashboard/spanClass";
import LabWidgetBody from "@/components/lab/LabWidgetBody";
import {actionButton} from "@/components/primitives/ActionButton";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The game widgets the owner put on Today, in the order and at the widths of the saved layout
// (lib/lab/layout): a twelve-column grid from the tablet width, one column below it, each card a
// Panel with the widget's title over its body. Each card is a Panel, so the section is a heading
// over a grid, never a Panel of its own (invariant 7). "Arrange" leads to the arranging view
// (/learn?arrange=1, components/lab/LabArrange), where the cards are added, moved and sized.

const LabWidgets = ({widgets, puzzle}: {widgets: readonly LabWidgetCard[]; puzzle: DailyPuzzleCardView | null}) => (
    <section className="space-y-4" aria-labelledby="lab-widgets-heading" data-lab-widgets={widgets.length}>
        <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading id="lab-widgets-heading" spacing="none">{LAB_COPY.list.widgetsHeading}</SectionHeading>
            <Link href="/learn?arrange=1" className={actionButton({variant: 'secondary', size: 'sm'})} data-lab-arrange>{LAB_COPY.layout.arrange}</Link>
        </div>
        {widgets.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {widgets.map((widget) => (
                    <div key={widget.id} className={spanClass(widget.span, false)} data-widget-id={widget.id} data-widget-span={widget.span}>
                        <Panel id={`lab-widget-${widget.id}`} aria-labelledby={`lab-widget-${widget.id}-heading`} className="flex h-full flex-col" data-lab-widget={widget.id}>
                            <SectionHeading id={`lab-widget-${widget.id}-heading`}>{LAB_WIDGET_TITLES[widget.id]}</SectionHeading>
                            <LabWidgetBody widget={widget} puzzle={puzzle}/>
                        </Panel>
                    </div>
                ))}
            </div>
        ) : (
            <p className="text-sm text-fg-muted" data-lab-widgets-none>{LAB_COPY.list.noWidgets}</p>
        )}
        <p className="text-xs text-fg-muted"><Link href="/games" className="text-brand hover:underline">{GAMES_COPY.allGames} →</Link></p>
    </section>
);

export default LabWidgets;
