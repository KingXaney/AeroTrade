import Link from "next/link";
import {cn} from "@/lib/utils";
import {groupItems, type LabTodoItem, type LabTodoState} from "@/lib/lab/todo";
import type {LabWidgetId} from "@/lib/lab/widgets";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import GamesOnToday from "@/components/lab/GamesOnToday";
import TodoTick from "@/components/lab/TodoTick";

// Today's list (lib/lab/todo.ts): the items under their group's eyebrow (study, play, elsewhere —
// drawn only when more than one group has items), one row per item with its state — a filled
// check for a done item, a ring for one still to do, a half ring for one started, a clock for a
// review past its day, a dash for one with nothing to do today — its title and line, and the way
// in: a link to the unit, an anchor to the review deck, the problem or the digest below, the
// puzzle's or a game's page, a site in a new tab. A manual item carries its tick. The state's
// word is read by a screen reader on every row and seen on a started or overdue one. "Games" in
// the header switches the games on Today on and off (components/lab/GamesOnToday), so a game
// joins the list in two taps and its item opens the game.

const MARK: Record<LabTodoState, {icon: string; className: string; fill?: boolean}> = {
    done: {icon: 'check_circle', className: 'text-brand', fill: true},
    todo: {icon: 'radio_button_unchecked', className: 'text-fg-muted'},
    started: {icon: 'incomplete_circle', className: 'text-brand'},
    overdue: {icon: 'schedule', className: 'text-warning'},
    none: {icon: 'remove', className: 'text-fg-muted/60'},
};

const WayIn = ({item}: {item: LabTodoItem}) => {
    const className = 'label-type shrink-0 text-xs text-brand hover:underline';
    if (item.external) {
        return <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} data-todo-open={item.id}>{LAB_COPY.list.open} ↗</a>;
    }
    return <Link href={item.href} className={className} data-todo-open={item.id}>{LAB_COPY.list.open} →</Link>;
};

const Row = ({item}: {item: LabTodoItem}) => {
    const mark = MARK[item.state];
    const word = LAB_COPY.list.states[item.state];
    return (
        <RowCard className={cn('flex items-center gap-3 px-3 py-2.5', item.state === 'none' && 'opacity-60')} data-lab-todo={item.id} data-todo-state={item.state}>
            <span aria-hidden="true" className={cn('material-symbols-outlined shrink-0 text-2xl leading-none', mark.className)} style={mark.fill ? {fontVariationSettings: "'FILL' 1"} : undefined}>
                {mark.icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={cn('text-sm', item.state === 'done' ? 'text-fg-soft line-through decoration-brand/50' : 'text-fg')}>{item.title}</span>
                    <span className="sr-only">{word}</span>
                    {item.state === 'started' && <Badge tone="brand" variant="outline" aria-hidden="true">{word}</Badge>}
                    {item.state === 'overdue' && <Badge tone="warning" variant="outline" aria-hidden="true">{word}</Badge>}
                </span>
                <span className="block text-xs text-fg-muted">{item.line}</span>
            </span>
            {item.manual && item.state !== 'none' && <TodoTick id={item.id} done={item.state === 'done'} />}
            {item.state !== 'none' && <WayIn item={item} />}
        </RowCard>
    );
};

type Props = {
    items: readonly LabTodoItem[];
    summary: {done: number; total: number};
    // The games on Today (the saved layout's), for the Games dialog; absent draws no button.
    games?: readonly LabWidgetId[];
};

const TodayList = ({items, summary, games}: Props) => {
    const groups = groupItems(items);
    return (
        <Panel id="lab-list" aria-labelledby="lab-list-heading" className="h-full" data-lab-list data-list-done={summary.done} data-list-total={summary.total}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <SectionHeading id="lab-list-heading" spacing="none">{LAB_COPY.list.heading}</SectionHeading>
                <div className="flex items-center gap-3">
                    <MicroLabel data-list-progress>{LAB_COPY.list.progress(summary.done, summary.total)}</MicroLabel>
                    {games && <GamesOnToday on={games}/>}
                </div>
            </div>
            {items.length === 0 ? (
                <p className="text-sm text-fg-muted">{LAB_COPY.list.empty}</p>
            ) : (
                <div className="space-y-3">
                    {groups.map(({group, items: own}) => (
                        <div key={group} data-todo-group={group}>
                            {groups.length > 1 && <MicroLabel as="p" className="mb-1.5">{LAB_COPY.list.groups[group]}</MicroLabel>}
                            <ol className="space-y-1.5">
                                {own.map((item) => <li key={item.id}><Row item={item}/></li>)}
                            </ol>
                        </div>
                    ))}
                </div>
            )}
        </Panel>
    );
};

export default TodayList;
