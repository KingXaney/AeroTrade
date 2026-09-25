'use client';

import Link from "next/link";
import {type KeyboardEvent, type ReactNode} from "react";
import {useSortable} from "@dnd-kit/sortable";
import {ChevronLeft, ChevronRight, GripVertical, X} from "lucide-react";
import {cn} from "@/lib/utils";
import type {WidgetDefinition, WidgetSpan} from "@/lib/dashboard/widgets";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel, {type PanelPad} from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {iconButton} from "@/components/primitives/iconButton";
import SpanPicker from "@/components/dashboard/SpanPicker";

type Props = {
    def: WidgetDefinition;
    span: WidgetSpan;
    editing: boolean;
    index: number;
    count: number;
    className?: string;
    children: ReactNode;
    onSpan: (span: WidgetSpan) => void;
    onRemove: () => void;
    onMoveBy: (delta: number) => void;
    onMoveTo: (index: number) => void;
};

const PANEL_PADDING: Record<WidgetDefinition['chrome'], PanelPad> = {
    link: 5,
    panel: 5,
    'panel-lg': 6,
    'panel-sm': 3,
    bare: 0,
};

// One title treatment, whatever the chrome. There used to be three — a 10px muted
// eyebrow for link widgets, a 14px brand heading for panels and a 12px label in edit
// mode — so "YOUR TOPICS" and "PORTFOLIO" sat side by side on one grid looking like
// different kinds of thing. The edit-mode toolbar label below is chrome on an arranging
// affordance, not a heading, so it stays a span.

// The body padding in edit mode, where the Panel itself is pad={0} so the toolbar can
// sit flush against the top edge.
const PADDING_CLASS: Record<WidgetDefinition['chrome'], string> = {
    link: 'p-5', panel: 'p-5', 'panel-lg': 'p-6', 'panel-sm': 'p-3', bare: 'p-3',
};

const WidgetShell = ({def, span, editing, index, count, className, children, onSpan, onRemove, onMoveBy, onMoveTo}: Props) => {
    // Transforms are never applied: the DOM only changes on drop (see DashboardGrid).
    const {setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging, over, active} =
        useSortable({id: def.id, disabled: !editing, transition: null});
    const isDropTarget = editing && !!active && over?.id === def.id && active.id !== def.id;

    // React re-inserts the moved node, which drops focus to <body>; put it back on
    // the control that triggered the move so repeated presses keep working.
    const refocus = (elementId: string) => requestAnimationFrame(() => document.getElementById(elementId)?.focus());
    const handleId = `widget-handle-${def.id}`;
    const earlierId = `widget-earlier-${def.id}`;
    const laterId = `widget-later-${def.id}`;
    const moveBy = (delta: number, focusId: string) => { onMoveBy(delta); refocus(focusId); };

    // Keyboard equivalent of dragging, on the handle itself.
    const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        const moves: Record<string, () => void> = {
            ArrowLeft: () => onMoveBy(-1), ArrowUp: () => onMoveBy(-1),
            ArrowRight: () => onMoveBy(1), ArrowDown: () => onMoveBy(1),
            Home: () => onMoveTo(0), End: () => onMoveTo(count - 1),
        };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        move();
        refocus(handleId);
    };

    // Which chromes let the SHELL draw the title. Not a styling rule — every title the
    // shell draws now looks the same; this is only about who owns it. 'panel-lg' and
    // 'panel-sm' (TradingView) and 'bare' render their own heading inside the body.
    const shellOwnsTitle = def.chrome === 'panel' || def.chrome === 'link';
    const title = def.showTitle && shellOwnsTitle ? <SectionHeading>{def.title}</SectionHeading> : null;

    if (!editing) {
        return (
            <div ref={setNodeRef} className={className} data-widget-id={def.id}>
                {def.chrome === 'link' && def.href ? (
                    <Link href={def.href} className="block">
                        <Panel as="div" interactive>{title}{children}</Panel>
                    </Link>
                ) : def.chrome === 'bare' ? (
                    children
                ) : (
                    <Panel pad={PANEL_PADDING[def.chrome]}>{title}{children}</Panel>
                )}
            </div>
        );
    }

    return (
        <div ref={setNodeRef} className={className} data-widget-id={def.id}>
            {/* outline, not ring: .glass-panel sets box-shadow outside any cascade layer,
                so a ring utility loses to it and the selection/drop feedback never drew. */}
            <Panel as="div" pad={0} className={cn(
                'outline outline-1 -outline-offset-1 outline-brand/25 transition-[outline]',
                isDragging && 'opacity-40',
                isDropTarget && 'outline-2 outline-brand/70',
            )}>
                <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2.5 border-b border-line-strong/20">
                    <div className="flex items-center gap-2 min-w-0">
                        <button id={handleId} ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} onKeyDown={onHandleKeyDown}
                                aria-label={`Move ${def.title}. Use the arrow keys to reorder.`}
                                className="hidden md:inline-flex cursor-grab active:cursor-grabbing text-fg-muted hover:text-fg"
                                style={{touchAction: 'none'}}>
                            <GripVertical className="size-4" />
                        </button>
                        <span className="material-symbols-outlined text-base text-brand">{def.icon}</span>
                        <MicroLabel tone="fg" className="truncate">{def.title}</MicroLabel>
                    </div>
                    <div className="flex items-center gap-1">
                        <SpanPicker spans={def.spans} value={span} onChange={onSpan} />
                        <button id={earlierId} type="button" onClick={() => moveBy(-1, index - 1 === 0 ? handleId : earlierId)} disabled={index === 0} aria-label="Move earlier" className={iconButton}>
                            <ChevronLeft className="size-4" />
                        </button>
                        <button id={laterId} type="button" onClick={() => moveBy(1, index + 1 === count - 1 ? handleId : laterId)} disabled={index === count - 1} aria-label="Move later" className={iconButton}>
                            <ChevronRight className="size-4" />
                        </button>
                        <button type="button" onClick={onRemove} aria-label={`Remove ${def.title}`} className={cn(iconButton, 'hover:text-negative')}>
                            <X className="size-4" />
                        </button>
                    </div>
                </div>
                {/* inert: nothing inside (buy buttons, iframes, links) reacts while arranging.
                    The toolbar above already names the widget, so the body's own heading
                    is not repeated here — every widget used to show its title twice. */}
                <div inert className={cn('select-none', PADDING_CLASS[def.chrome])}>
                    {children}
                </div>
            </Panel>
        </div>
    );
};

export default WidgetShell;
