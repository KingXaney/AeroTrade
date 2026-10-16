'use client';

import {useEffect, useMemo, useState, useTransition, type ReactNode} from "react";
import {createPortal} from "react-dom";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    closestCenter,
    pointerWithin,
    useSensor,
    useSensors,
    type Announcements,
    type CollisionDetection,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {SortableContext, type SortingStrategy} from "@dnd-kit/sortable";
import {saveLabLayout} from "@/lib/actions/lab.actions";
import {
    LAB_SPANS, MAX_LAB_WIDGETS, addLabWidget, labLayoutsEqual, missingLabWidgets, moveLabWidget, removeLabWidget, resetLabLayout, setLabSpan, type LabLayout,
} from "@/lib/lab/layout";
import {isLabWidgetId, labWidget, type LabWidgetId} from "@/lib/lab/widgets";
import {LAB_COPY, LAB_WIDGET_BLURBS, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import DashboardToolbar, {type ToolbarLabels} from "@/components/dashboard/DashboardToolbar";
import DragGhost from "@/components/dashboard/DragGhost";
import WidgetLibrary, {type LibraryCopy, type LibraryGroup} from "@/components/dashboard/WidgetLibrary";
import WidgetPlaceholder from "@/components/dashboard/WidgetPlaceholder";
import WidgetShell, {type ShellDef} from "@/components/dashboard/WidgetShell";
import {spanClass} from "@/components/dashboard/spanClass";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The arranging view of Today's games (/learn?arrange=1): the dashboard's own editing pieces —
// the shell with its handle, arrow keys, width picker and arrows, the drag ghost, the library —
// over the lab's layout (lib/lab/layout). Every change is local until Save writes the layout
// through saveLabLayout and the view goes back to Today, which reads it fresh; Cancel goes back
// as it was. A card added here has no server-rendered body until then and shows a stand-in.

type Props = {
    initialLayout: LabLayout;
    bodies: Partial<Record<LabWidgetId, ReactNode>>;   // the cards' bodies, rendered by the page
};

const titleOf = (id: unknown): string => (isLabWidgetId(id) ? LAB_WIDGET_TITLES[id] : String(id));

// 'bare' with the title off: the shell draws its toolbar over the body, which names nothing twice.
const shellDef = (id: LabWidgetId): ShellDef => ({id, title: LAB_WIDGET_TITLES[id], icon: labWidget(id).icon, spans: LAB_SPANS, chrome: 'bare', showTitle: false});

// The source node stays in place while dragging, so the pointer position decides the target.
const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length ? within : closestCenter(args);
};

// Transforms are never applied (the DOM only moves on drop); hoisted so the context value is stable.
const NO_TRANSFORM: SortingStrategy = () => null;

const words = LAB_COPY.layout;

const announcements: Announcements = {
    onDragStart: ({active}) => words.announce.pickedUp(titleOf(active.id)),
    onDragOver: ({active, over}) => over && over.id !== active.id ? words.announce.over(titleOf(active.id), titleOf(over.id)) : undefined,
    onDragEnd: ({active, over}) => over && over.id !== active.id ? words.announce.moved(titleOf(active.id), titleOf(over.id)) : words.announce.notMoved(titleOf(active.id)),
    onDragCancel: ({active}) => words.announce.cancelled(titleOf(active.id)),
};

const TOOLBAR: ToolbarLabels = {customize: words.arrange, add: words.add, reset: words.reset, resetTitle: words.resetTitle, cancel: words.cancel, save: words.save};
const LIBRARY: LibraryCopy = {title: words.library.title, lead: words.library.lead, fullLead: words.library.full, none: words.library.none, add: words.library.addRow};

const PLACEHOLDER_HEIGHT = 160;

const LabArrange = ({initialLayout, bodies}: Props) => {
    const router = useRouter();
    const [layout, setLayout] = useState(initialLayout);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [activeId, setActiveId] = useState<LabWidgetId | null>(null);
    const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
    const [pending, startTransition] = useTransition();
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time flag to enable the overlay portal client-side
    useEffect(() => setMounted(true), []);

    const dirty = !labLayoutsEqual(layout, initialLayout);
    const ids = useMemo(() => layout.widgets.map((w) => w.id), [layout]);
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

    // The games not yet on the page: those in the app, then the sites outside it.
    const groups = useMemo<LibraryGroup[]>(() => {
        const missing = missingLabWidgets(layout);
        const row = (id: LabWidgetId) => ({id, title: LAB_WIDGET_TITLES[id], description: LAB_WIDGET_BLURBS[id], icon: labWidget(id).icon});
        return [
            {label: words.library.inApp, rows: missing.filter((id) => labWidget(id).kind !== 'outside').map(row)},
            {label: words.library.elsewhere, rows: missing.filter((id) => labWidget(id).kind === 'outside').map(row)},
        ];
    }, [layout]);

    const onDragStart = (e: DragStartEvent) => {
        setActiveId(e.active.id as LabWidgetId);
        setActiveWidth(e.active.rect.current.initial?.width);
    };
    const onDragEnd = (e: DragEndEvent) => {
        setActiveId(null);
        const {active, over} = e;
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(active.id as LabWidgetId);
        const to = ids.indexOf(over.id as LabWidgetId);
        if (from === -1 || to === -1) return;
        setLayout((l) => moveLabWidget(l, from, to));
    };

    const save = () => startTransition(async () => {
        const result = await saveLabLayout(layout);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        toast.success(words.saved);
        // Today reads the saved layout fresh; nothing here re-renders under the save.
        router.replace('/learn');
    });
    const cancel = () => router.replace('/learn');

    const active = activeId ? layout.widgets.find((w) => w.id === activeId) : undefined;

    return (
        <section className="space-y-4" aria-labelledby="lab-arrange-heading" data-lab-arrange-view data-lab-arrange-count={layout.widgets.length} data-lab-arrange-dirty={dirty || undefined}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <SectionHeading id="lab-arrange-heading" spacing="none">{words.heading}</SectionHeading>
                    <p className="mt-1 max-w-2xl text-sm text-fg-muted">{words.lead}</p>
                </div>
                <DashboardToolbar
                    editing dirty={dirty} pending={pending} labels={TOOLBAR}
                    onCustomize={() => undefined}
                    onAdd={() => setLibraryOpen(true)}
                    onReset={() => setLayout(resetLabLayout())}
                    onSave={save}
                    onCancel={cancel}
                />
            </div>

            <DndContext id="lab-arrange" sensors={sensors} collisionDetection={collisionDetection}
                        onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}
                        accessibility={{announcements}}>
                <SortableContext items={ids} strategy={NO_TRANSFORM}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                        {layout.widgets.map((w, index) => {
                            const def = shellDef(w.id);
                            return (
                                <WidgetShell key={w.id} def={def} span={w.span} editing index={index} count={layout.widgets.length}
                                             className={spanClass(w.span, false)}
                                             onSpan={(s) => setLayout((l) => setLabSpan(l, w.id, s))}
                                             onRemove={() => setLayout((l) => removeLabWidget(l, w.id))}
                                             onMoveBy={(d) => setLayout((l) => moveLabWidget(l, index, Math.max(0, Math.min(l.widgets.length - 1, index + d))))}
                                             onMoveTo={(to) => setLayout((l) => moveLabWidget(l, index, to))}>
                                    {bodies[w.id] ?? (
                                        <WidgetPlaceholder def={{icon: def.icon, title: def.title, description: LAB_WIDGET_BLURBS[w.id], minHeight: PLACEHOLDER_HEIGHT}} note={words.saveToLoad}/>
                                    )}
                                </WidgetShell>
                            );
                        })}
                    </div>
                </SortableContext>
                {/* Portalled: a backdrop-filter ancestor (glass styles) would otherwise become the overlay's containing block. */}
                {mounted && createPortal(
                    <DragOverlay dropAnimation={null}>
                        {activeId && active ? <DragGhost def={shellDef(activeId)} span={active.span} width={activeWidth}/> : null}
                    </DragOverlay>,
                    document.body,
                )}
            </DndContext>

            {layout.widgets.length === 0 && (
                <Panel as="div" pad={8} className="text-center">
                    <p className="text-sm text-fg-muted" data-lab-arrange-empty>{words.empty}</p>
                </Panel>
            )}

            <WidgetLibrary open={libraryOpen} onOpenChange={setLibraryOpen} groups={groups} full={layout.widgets.length >= MAX_LAB_WIDGETS} copy={LIBRARY}
                           onAdd={(id) => { if (isLabWidgetId(id)) setLayout((l) => addLabWidget(l, id)); }}/>
        </section>
    );
};

export default LabArrange;
