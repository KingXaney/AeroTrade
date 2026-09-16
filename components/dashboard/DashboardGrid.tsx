'use client';

import {useCallback, useEffect, useMemo, useState, useTransition, type ReactNode} from "react";
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
import {WIDGETS, type WidgetId} from "@/lib/dashboard/widgets";
import {
    addWidget, layoutsEqual, missingWidgetIds, moveWidget, removeWidget, resetLayout, setSpan, type DashboardLayout,
} from "@/lib/dashboard/layout";
import {saveDashboardLayout} from "@/lib/actions/dashboard.actions";
import {spanClass} from "@/components/dashboard/spanClass";
import WidgetShell from "@/components/dashboard/WidgetShell";
import WidgetPlaceholder from "@/components/dashboard/WidgetPlaceholder";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import WidgetLibrary from "@/components/dashboard/WidgetLibrary";
import DragGhost from "@/components/dashboard/DragGhost";

type Props = {
    initialLayout: DashboardLayout;
    bodies: Partial<Record<WidgetId, ReactNode>>;   // server-rendered widget bodies
    availableIds: WidgetId[];
    headerActions?: ReactNode;
    startInEditMode: boolean;
};

const titleOf = (id: unknown) => (typeof id === 'string' && id in WIDGETS ? WIDGETS[id as WidgetId].title : String(id));

// The source node stays in place while dragging, so the pointer position decides
// the target; the keyboard path never reaches here (it uses the arrow handlers).
const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length ? within : closestCenter(args);
};

// Transforms are never applied (the DOM only moves on drop); hoisted so the
// SortableContext value stays referentially stable across renders.
const NO_TRANSFORM: SortingStrategy = () => null;

const announcements: Announcements = {
    onDragStart: ({active}) => `Picked up ${titleOf(active.id)}. Drop it on another widget to move it there.`,
    onDragOver: ({active, over}) => over && over.id !== active.id ? `${titleOf(active.id)} will move to ${titleOf(over.id)}'s position.` : undefined,
    onDragEnd: ({active, over}) => over && over.id !== active.id ? `Moved ${titleOf(active.id)} to ${titleOf(over.id)}'s position.` : `${titleOf(active.id)} was not moved.`,
    onDragCancel: ({active}) => `Cancelled moving ${titleOf(active.id)}.`,
};

const DashboardGrid = ({initialLayout, bodies, availableIds, headerActions, startInEditMode}: Props) => {
    const router = useRouter();
    const [saved, setSaved] = useState(initialLayout);
    const [layout, setLayout] = useState(initialLayout);
    const [editing, setEditing] = useState(startInEditMode);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [activeId, setActiveId] = useState<WidgetId | null>(null);
    const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
    const [pending, startTransition] = useTransition();
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time flag to enable the body portal client-side
    useEffect(() => setMounted(true), []);

    const dirty = !layoutsEqual(layout, saved);
    const ids = useMemo(() => layout.widgets.map((w) => w.id), [layout]);
    const availability = useMemo(() => new Set(availableIds), [availableIds]);

    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

    const onDragStart = (e: DragStartEvent) => {
        setActiveId(e.active.id as WidgetId);
        setActiveWidth(e.active.rect.current.initial?.width);
    };
    const onDragEnd = (e: DragEndEvent) => {
        setActiveId(null);
        const {active, over} = e;
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(active.id as WidgetId);
        const to = ids.indexOf(over.id as WidgetId);
        if (from === -1 || to === -1) return;
        setLayout((l) => moveWidget(l, from, to));
    };

    const save = () => startTransition(async () => {
        const result = await saveDashboardLayout(layout);
        if (!result.success) {
            toast.error(result.message ?? 'Could not save your dashboard');
            return;
        }
        setSaved(layout);
        setEditing(false);
        toast.success('Dashboard saved');
        // The action deliberately doesn't revalidate; re-render here so new widgets get
        // their data and the fingerprint key remounts the grid in view mode. Leaving
        // ?customize=1 first guarantees the remounted grid doesn't start in edit mode.
        if (startInEditMode) router.replace('/');
        else router.refresh();
    });

    const cancel = useCallback(() => {
        setLayout(saved);
        setEditing(false);
        if (startInEditMode) router.replace('/');
    }, [saved, startInEditMode, router]);

    const activeDef = activeId ? WIDGETS[activeId] : null;
    const activeSpan = activeId ? layout.widgets.find((w) => w.id === activeId)?.span : undefined;

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                        Dashboard
                    </h1>
                    <p className="text-sm text-fg-muted">
                        {editing ? 'Drag widgets by their handle, resize, remove, or add new ones — then save.' : 'Your topics, portfolio, watchlist and friends at a glance'}
                    </p>
                </div>
                <DashboardToolbar
                    editing={editing} dirty={dirty} pending={pending}
                    onCustomize={() => setEditing(true)}
                    onAdd={() => setLibraryOpen(true)}
                    onReset={() => setLayout(resetLayout())}
                    onSave={save}
                    onCancel={cancel}
                    extra={headerActions}
                />
            </div>

            <DndContext id="dashboard-grid" sensors={sensors} collisionDetection={collisionDetection}
                        onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}
                        accessibility={{announcements}}>
                <SortableContext items={ids} strategy={NO_TRANSFORM}>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {layout.widgets.map((w, index) => {
                            const def = WIDGETS[w.id];
                            return (
                                <WidgetShell key={w.id} def={def} span={w.span} editing={editing} index={index} count={layout.widgets.length}
                                             className={spanClass(w.span, def.wideOnTablet)}
                                             onSpan={(s) => setLayout((l) => setSpan(l, w.id, s))}
                                             onRemove={() => setLayout((l) => removeWidget(l, w.id))}
                                             onMoveBy={(d) => setLayout((l) => moveWidget(l, index, Math.max(0, Math.min(l.widgets.length - 1, index + d))))}
                                             onMoveTo={(to) => setLayout((l) => moveWidget(l, index, to))}>
                                    {editing && def.isClient ? (
                                        // Keep the embed mounted (hidden) so it neither reloads on every
                                        // move nor gets torn down mid-load; show a light stand-in instead.
                                        <>
                                            <WidgetPlaceholder def={def} note={bodies[w.id] ? 'Live embed paused while arranging' : 'Save to load'} />
                                            {bodies[w.id] && <div hidden>{bodies[w.id]}</div>}
                                        </>
                                    ) : (
                                        bodies[w.id] ?? <WidgetPlaceholder def={def} />
                                    )}
                                </WidgetShell>
                            );
                        })}
                    </div>
                </SortableContext>
                {/* Portalled: a backdrop-filter ancestor (glass styles) would otherwise become the overlay's containing block. */}
                {mounted && createPortal(
                    <DragOverlay dropAnimation={null}>
                        {activeDef && activeSpan ? <DragGhost def={activeDef} span={activeSpan} width={activeWidth} /> : null}
                    </DragOverlay>,
                    document.body,
                )}
            </DndContext>

            {layout.widgets.length === 0 && (
                <div className="glass-panel rounded-xl p-8 text-center">
                    <p className="text-sm text-fg-muted">Your dashboard is empty. Add a widget or reset to the default layout.</p>
                </div>
            )}

            <WidgetLibrary open={libraryOpen} onOpenChange={setLibraryOpen}
                           ids={missingWidgetIds(layout).filter((id) => availability.has(id))}
                           count={layout.widgets.length}
                           onAdd={(id) => setLayout((l) => addWidget(l, id))} />
        </div>
    );
};

export default DashboardGrid;
