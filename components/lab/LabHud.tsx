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
import {cn} from "@/lib/utils";
import {saveLabLayout} from "@/lib/actions/lab.actions";
import {
    LAB_HUD, MAX_LAB_WIDGETS, addLabWidget, isLabHudId, isLabPanelId, labLayoutsEqual, missingLabWidgets, moveLabWidget, removeLabWidget, resetLabLayout, setLabSpan,
    type LabHudId, type LabLayout,
} from "@/lib/lab/layout";
import {labWidget} from "@/lib/lab/widgets";
import {LAB_COPY, labHudWords} from "@/lib/learn/copy/lab";
import DashboardToolbar, {type ToolbarLabels} from "@/components/dashboard/DashboardToolbar";
import DragGhost from "@/components/dashboard/DragGhost";
import WidgetLibrary, {type LibraryCopy, type LibraryGroup, type LibraryRow} from "@/components/dashboard/WidgetLibrary";
import WidgetPlaceholder from "@/components/dashboard/WidgetPlaceholder";
import WidgetShell, {type ShellDef} from "@/components/dashboard/WidgetShell";
import {spanClass} from "@/components/dashboard/spanClass";
import Panel from "@/components/primitives/Panel";

// Lab › Today as a HUD: every part of the day and every game card on the dashboard's twelve-column
// grid, in the saved layout's order and widths (lib/lab/layout), arranged in place. Viewing, each
// card is its own server-rendered body (a Panel of its own, so the shell's chrome is 'bare').
// A card the catalog marks tall (the list) is two rows tall from a desktop's width, so two cards a
// third wide stack beside it. Arranging — the title's Arrange and the account menu's "Lab layout",
// both /learn?arrange=1 — the dashboard's own pieces take over: the shell with its handle, arrow keys, width picker and arrows, the drag ghost,
// the library of what is not yet on the page. Every change is local until Save writes the layout
// through saveLabLayout; Cancel puts the saved one back. A card added here has no server-rendered
// body until then and shows a stand-in; a part of the day with nothing to show (no problem, no
// papers) is skipped viewing and a stand-in arranging, so it keeps its place.
//
// The page re-renders this component with a new layout when a game is switched on from the list
// or a save lands: it follows the page unless a draft is open, so the list's own dialog stays open
// across its toggles — nothing here is keyed on the layout.

type Props = {
    initialLayout: LabLayout;
    bodies: Partial<Record<LabHudId, ReactNode>>;   // the cards' bodies, rendered by the page; absent = nothing to show today
    availableIds: readonly LabHudId[];               // what the library may offer
    startInEditMode: boolean;
};

const titleOf = (id: unknown): string => (isLabHudId(id) ? labHudWords(id).title : String(id));

// 'bare' with the title off: the body draws its own panel and heading; the arranging toolbar names it.
const shellDef = (id: LabHudId): ShellDef => ({id, title: labHudWords(id).title, icon: LAB_HUD[id].icon, spans: LAB_HUD[id].spans, chrome: 'bare', showTitle: false});

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

const PLACEHOLDER_HEIGHT = 120;

const LabHud = ({initialLayout, bodies, availableIds, startInEditMode}: Props) => {
    const router = useRouter();
    const [saved, setSaved] = useState(initialLayout);
    const [layout, setLayout] = useState(initialLayout);
    const [editing, setEditing] = useState(startInEditMode);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [activeId, setActiveId] = useState<LabHudId | null>(null);
    const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
    const [pending, startTransition] = useTransition();
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time flag to enable the overlay portal client-side
    useEffect(() => setMounted(true), []);

    // The page's layout moved under this component and the page re-rendered with it: follow it,
    // unless a draft is being arranged (React's own pattern for state that tracks a prop).
    const [seen, setSeen] = useState(initialLayout);
    if (seen !== initialLayout) {
        setSeen(initialLayout);
        if (!labLayoutsEqual(seen, initialLayout)) {
            setSaved(initialLayout);
            if (!editing) setLayout(initialLayout);
        }
    }

    const dirty = !labLayoutsEqual(layout, saved);
    const ids = useMemo(() => layout.widgets.map((w) => w.id), [layout]);
    const available = useMemo(() => new Set<LabHudId>(availableIds), [availableIds]);
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

    // What is not yet on the page: the parts of the day, then the games in the app, then the sites.
    const groups = useMemo<LibraryGroup[]>(() => {
        const missing = missingLabWidgets(layout).filter((id) => available.has(id));
        const row = (id: LabHudId): LibraryRow => ({id, title: labHudWords(id).title, description: labHudWords(id).blurb, icon: LAB_HUD[id].icon});
        return [
            {label: words.library.parts, rows: missing.filter(isLabPanelId).map(row)},
            {label: words.library.inApp, rows: missing.filter((id) => !isLabPanelId(id) && labWidget(id).kind !== 'outside').map(row)},
            {label: words.library.elsewhere, rows: missing.filter((id) => !isLabPanelId(id) && labWidget(id).kind === 'outside').map(row)},
        ];
    }, [layout, available]);

    const onDragStart = (e: DragStartEvent) => {
        setActiveId(e.active.id as LabHudId);
        setActiveWidth(e.active.rect.current.initial?.width);
    };
    const onDragEnd = (e: DragEndEvent) => {
        setActiveId(null);
        const {active, over} = e;
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(active.id as LabHudId);
        const to = ids.indexOf(over.id as LabHudId);
        if (from === -1 || to === -1) return;
        setLayout((l) => moveLabWidget(l, from, to));
    };

    const save = () => startTransition(async () => {
        const result = await saveLabLayout(layout);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        setSaved(result.layout);
        setLayout(result.layout);
        setEditing(false);
        toast.success(words.saved);
        // The action does not revalidate: re-render here, so a card added gets its body. Leaving
        // ?arrange=1 first keeps a reload from opening the arranging again.
        if (startInEditMode) router.replace('/learn');
        else router.refresh();
    });

    const cancel = () => {
        setLayout(saved);
        setEditing(false);
        if (startInEditMode) router.replace('/learn');
    };

    const active = activeId ? layout.widgets.find((w) => w.id === activeId) : undefined;

    return (
        <div className="space-y-4" data-lab-hud={editing ? 'editing' : 'viewing'} data-lab-hud-count={layout.widgets.length} data-lab-hud-dirty={dirty || undefined}>
            {/* Viewing, the page title carries Arrange; the toolbar is the arranging's own. */}
            {editing && (
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-2xl text-sm text-fg-muted" data-lab-hud-lead>{words.lead}</p>
                    <DashboardToolbar
                        editing={editing} dirty={dirty} pending={pending} labels={TOOLBAR}
                        onCustomize={() => setEditing(true)}
                        onAdd={() => setLibraryOpen(true)}
                        onReset={() => setLayout(resetLabLayout())}
                        onSave={save}
                        onCancel={cancel}
                    />
                </div>
            )}

            <DndContext id="lab-hud" sensors={sensors} collisionDetection={collisionDetection}
                        onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}
                        accessibility={{announcements}}>
                <SortableContext items={ids} strategy={NO_TRANSFORM}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-12" data-lab-grid>
                        {layout.widgets.map((w, index) => {
                            const body = bodies[w.id];
                            if (!editing && body === undefined) return null;
                            const def = shellDef(w.id);
                            return (
                                <WidgetShell key={w.id} def={def} span={w.span} editing={editing} index={index} count={layout.widgets.length}
                                             className={cn(spanClass(w.span, false), LAB_HUD[w.id].tall && w.span < 12 && 'xl:row-span-2')}
                                             onSpan={(s) => setLayout((l) => setLabSpan(l, w.id, s))}
                                             onRemove={() => setLayout((l) => removeLabWidget(l, w.id))}
                                             onMoveBy={(d) => setLayout((l) => moveLabWidget(l, index, Math.max(0, Math.min(l.widgets.length - 1, index + d))))}
                                             onMoveTo={(to) => setLayout((l) => moveLabWidget(l, index, to))}>
                                    {body ?? (
                                        <WidgetPlaceholder def={{icon: def.icon, title: def.title, description: labHudWords(w.id).blurb, minHeight: PLACEHOLDER_HEIGHT}}
                                                           note={available.has(w.id) ? words.saveToLoad : words.nothingToday}/>
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
                    <p className="text-sm text-fg-muted" data-lab-hud-empty>{words.empty}</p>
                </Panel>
            )}

            <WidgetLibrary open={libraryOpen} onOpenChange={setLibraryOpen} groups={groups} full={layout.widgets.length >= MAX_LAB_WIDGETS} copy={LIBRARY}
                           onAdd={(id) => { if (isLabHudId(id)) setLayout((l) => addLabWidget(l, id)); }}/>
        </div>
    );
};

export default LabHud;
