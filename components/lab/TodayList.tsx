import Link from "next/link";
import {cn} from "@/lib/utils";
import type {LabTodoItem} from "@/lib/lab/todo";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import TodoTick from "@/components/lab/TodoTick";

// Today's list (lib/lab/todo.ts): one row per item with its state — a filled check for a done
// item, a ring for one still to do, a dash for one with nothing to do today — its title and line,
// and the way in: a link to the unit, an anchor to the review deck, the problem or the digest
// below, the puzzle's or a game's page, a site in a new tab. A manual item carries its tick.

const MARK: Record<LabTodoItem['state'], {icon: string; className: string}> = {
    done: {icon: 'check_circle', className: 'text-brand'},
    todo: {icon: 'radio_button_unchecked', className: 'text-fg-muted'},
    none: {icon: 'remove', className: 'text-fg-muted/60'},
};

const WayIn = ({item}: {item: LabTodoItem}) => {
    const className = 'label-type shrink-0 text-xs text-brand hover:underline';
    if (item.external) {
        return <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} data-todo-open={item.id}>{LAB_COPY.list.open} ↗</a>;
    }
    return <Link href={item.href} className={className} data-todo-open={item.id}>{LAB_COPY.list.open} →</Link>;
};

const TodayList = ({items, summary}: {items: readonly LabTodoItem[]; summary: {done: number; total: number}}) => (
    <Panel id="lab-list" aria-labelledby="lab-list-heading" data-lab-list data-list-done={summary.done} data-list-total={summary.total}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionHeading id="lab-list-heading" spacing="none">{LAB_COPY.list.heading}</SectionHeading>
            <MicroLabel data-list-progress>{LAB_COPY.list.progress(summary.done, summary.total)}</MicroLabel>
        </div>
        {items.length === 0 ? (
            <p className="text-sm text-fg-muted">{LAB_COPY.list.empty}</p>
        ) : (
            <ol className="space-y-1.5">
                {items.map((item) => {
                    const mark = MARK[item.state];
                    return (
                        <li key={item.id}>
                            <RowCard className={cn('flex items-center gap-3 px-3 py-2.5', item.state === 'none' && 'opacity-60')} data-lab-todo={item.id} data-todo-state={item.state}>
                                <span aria-hidden="true" className={cn('material-symbols-outlined shrink-0 text-2xl leading-none', mark.className)} style={item.state === 'done' ? {fontVariationSettings: "'FILL' 1"} : undefined}>
                                    {mark.icon}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={cn('block text-sm', item.state === 'done' ? 'text-fg-soft line-through decoration-brand/50' : 'text-fg')}>{item.title}</span>
                                    <span className="block text-xs text-fg-muted">{item.line}</span>
                                </span>
                                {item.manual && item.state !== 'none' && <TodoTick id={item.id} done={item.state === 'done'} />}
                                {item.state !== 'none' && <WayIn item={item} />}
                            </RowCard>
                        </li>
                    );
                })}
            </ol>
        )}
    </Panel>
);

export default TodayList;
