import Link from "next/link";
import type {DailyPuzzleCardView} from "@/lib/games/store";
import type {LabWidgetCard} from "@/lib/lab/view";
import type {LabWidgetId, LabOutsideSite} from "@/lib/lab/widgets";
import {ARITHMETIC_COPY, CORRELATION_COPY, GAMES_COPY, KELLY_COPY, MARKET_COPY} from "@/lib/learn/copy/games";
import {LAB_COPY, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import {POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";
import DailyPuzzleCard from "@/components/games/DailyPuzzleCard";
import GameCard from "@/components/games/GameCard";
import WidgetPicker from "@/components/lab/WidgetPicker";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";

// The game widgets the owner put on Today (lib/lab/widgets): the games hub's own cards — the
// daily puzzle, a scored game with its record, poker night — and a card per site outside the
// app, then the picker that adds or removes them. Each card is a Panel, so the section is a
// heading over a grid, never a Panel of its own (invariant 7). No "What these mean" and no
// "Ask in chat" on a widget (invariant 12).

type GameWords = {body: string; recordLabel: string; print: (n: number) => string};

const GAME_WORDS: Partial<Record<LabWidgetId, GameWords>> = {
    arithmetic: {body: ARITHMETIC_COPY.cardBody, recordLabel: ARITHMETIC_COPY.cardSprint, print: (n) => n.toLocaleString('en-US')},
    kelly: {body: KELLY_COPY.cardBody, recordLabel: KELLY_COPY.recordLabel, print: KELLY_COPY.money},
    'market-making': {body: MARKET_COPY.cardBody, recordLabel: MARKET_COPY.recordLabel, print: MARKET_COPY.signed},
    correlation: {body: CORRELATION_COPY.cardBody, recordLabel: CORRELATION_COPY.recordLabel, print: (n) => (n / 1000).toFixed(3)},
};

const OutsideCard = ({id, site, href}: {id: LabWidgetId; site: LabOutsideSite; href: string}) => {
    const link = GAMES_COPY.outside.links[site];
    return (
        <Panel id={`lab-widget-${id}`} aria-labelledby={`lab-widget-${id}-heading`} className="flex flex-col" data-lab-widget={id}>
            <SectionHeading id={`lab-widget-${id}-heading`}>{link.title}</SectionHeading>
            <p className="text-sm leading-relaxed text-fg-soft">{link.body}</p>
            <div className="mt-auto pt-5">
                <a href={href} target="_blank" rel="noopener noreferrer" className={actionButton({variant: 'secondary', size: 'md'})} data-outside-link={site}>{LAB_COPY.list.open} ↗</a>
            </div>
        </Panel>
    );
};

const Widget = ({widget, puzzle}: {widget: LabWidgetCard; puzzle: DailyPuzzleCardView | null}) => {
    const title = LAB_WIDGET_TITLES[widget.id];
    if (widget.kind === 'puzzle') {
        return (
            <Panel id={`lab-widget-${widget.id}`} aria-labelledby={`lab-widget-${widget.id}-heading`} data-lab-widget={widget.id}>
                <SectionHeading id={`lab-widget-${widget.id}-heading`}>{title}</SectionHeading>
                {puzzle ? <DailyPuzzleCard card={puzzle}/> : <p className="text-sm text-fg-muted">{GAMES_COPY.noPuzzleYet}</p>}
            </Panel>
        );
    }
    if (widget.kind === 'outside' && widget.site) return <OutsideCard id={widget.id} site={widget.site} href={widget.href}/>;
    if (widget.kind === 'table') {
        return (
            <div data-lab-widget={widget.id}>
                <GameCard id={`lab-${widget.id}`} title={title} body={POKER_NIGHT_COPY.cardBody} stats={[]} href={widget.href} cta={POKER_NIGHT_COPY.cardCta}/>
            </div>
        );
    }
    const words = GAME_WORDS[widget.id];
    return (
        <div data-lab-widget={widget.id}>
            <GameCard
                id={`lab-${widget.id}`}
                title={title}
                body={words?.body ?? ''}
                stats={words ? [{label: words.recordLabel, value: widget.record === null ? '—' : words.print(widget.record), hint: widget.record === null ? ARITHMETIC_COPY.cardNone : undefined}] : []}
                href={widget.href}
                cta={ARITHMETIC_COPY.play}
            />
        </div>
    );
};

const LabWidgets = ({widgets, puzzle}: {widgets: readonly LabWidgetCard[]; puzzle: DailyPuzzleCardView | null}) => (
    <section className="space-y-4" aria-labelledby="lab-widgets-heading" data-lab-widgets={widgets.length}>
        <SectionHeading id="lab-widgets-heading" spacing="none">{LAB_COPY.list.widgetsHeading}</SectionHeading>
        {widgets.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {widgets.map((widget) => <Widget key={widget.id} widget={widget} puzzle={puzzle}/>)}
            </div>
        ) : (
            <p className="text-sm text-fg-muted" data-lab-widgets-none>{LAB_COPY.list.noWidgets}</p>
        )}
        <Panel pad={4} id="lab-widget-picker">
            <WidgetPicker chosen={widgets.map((widget) => widget.id)}/>
            <p className="mt-3 text-xs text-fg-muted"><Link href="/games" className="text-brand hover:underline">{GAMES_COPY.allGames} →</Link></p>
        </Panel>
    </section>
);

export default LabWidgets;
