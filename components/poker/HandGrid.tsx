'use client';

import {useRef} from "react";
import {cn} from "@/lib/utils";
import {classKind, classLabel} from "@/lib/poker/cards";

// The 13 × 13 grid of starting-hand classes, rows and columns from ace to two: pairs on the diagonal,
// suited hands above it, offsuit below. Each cell fills from the bottom by `fill` (0–1), a runtime
// value and so an inline height. The range editor paints it; the equity heat map and the push/fold
// charts only show it.
//
// Painting: a mouse or pen paints as it drags across cells; a touch paints one cell a tap, so the
// page still scrolls under a finger; the keyboard paints the focused cell with Enter or Space.

// A strategy cell draws its actions side by side instead of one fill: each a share of the bar and a
// tone from SEGMENT_TONES (literal classes, so the build sees them).
export type GridSegment = {share: number; tone: number};
export type GridCell = {fill: number; text?: string; title: string; muted?: boolean; segments?: readonly GridSegment[]};

export const SEGMENT_TONES = ['bg-surface-4', 'bg-fg-muted/60', 'bg-positive/80', 'bg-brand/45', 'bg-brand/75', 'bg-brand', 'bg-warning/80', 'bg-negative/80'] as const;

type Props = {
    cells: readonly GridCell[];
    label: string;
    id?: string;
    // The editor's: `first` marks a stroke's first cell, which decides whether it adds or clears.
    onPaint?: (classId: number, first: boolean) => void;
    dataAttr?: string;
};

const LINE = Array.from({length: 13}, (_, i) => i);

const HandGrid = ({cells, label, id, onPaint, dataAttr}: Props) => {
    const stroke = useRef<Set<number> | null>(null);
    const lastPointer = useRef<string>('mouse');
    const interactive = onPaint !== undefined;

    const paintUnder = (x: number, y: number) => {
        const target = document.elementFromPoint(x, y)?.closest('[data-class-id]');
        const classId = target ? Number(target.getAttribute('data-class-id')) : NaN;
        if (!stroke.current || !Number.isInteger(classId) || stroke.current.has(classId)) return;
        stroke.current.add(classId);
        onPaint?.(classId, false);
    };
    const endStroke = () => {
        stroke.current = null;
    };

    return (
        <div
            id={id}
            role="grid"
            aria-label={label}
            data-hand-grid={dataAttr}
            className="flex select-none flex-col gap-px rounded-lg bg-line/40 p-px"
            onPointerMove={interactive ? (event) => paintUnder(event.clientX, event.clientY) : undefined}
            onPointerUp={interactive ? endStroke : undefined}
            onPointerLeave={interactive ? endStroke : undefined}
        >
            {LINE.map((row) => (
                <div role="row" key={row} className="grid grid-cols-13 gap-px">
                    {LINE.map((col) => {
                        const classId = row * 13 + col;
                        const cell = cells[classId];
                        // The label sits mid-cell, so from half full it is over the fill and takes the
                        // brand's own text colour, as the active tab does.
                        const onFill = cell.fill >= 0.5;
                        const face = cell.segments ? (
                            <>
                                <span className={cn('relative font-mono text-[8px] leading-none sm:text-[10px]', cell.muted ? 'text-fg-muted' : 'text-fg')}>{classLabel(classId)}</span>
                                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex h-2/5">
                                    {cell.segments.map((segment, i) => (
                                        <span key={i} className={SEGMENT_TONES[segment.tone % SEGMENT_TONES.length]} style={{width: `${Math.max(0, Math.min(1, segment.share)) * 100}%`}}/>
                                    ))}
                                </span>
                            </>
                        ) : (
                            <>
                                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-brand" style={{height: `${Math.max(0, Math.min(1, cell.fill)) * 100}%`}}/>
                                <span className={cn('relative font-mono text-[8px] leading-none sm:text-[10px]', onFill ? 'text-on-brand' : cell.muted ? 'text-fg-muted' : 'text-fg')}>{classLabel(classId)}</span>
                                {cell.text && <span className={cn('relative hidden font-mono text-[8px] leading-none md:block', onFill ? 'text-on-brand' : 'text-fg-soft')}>{cell.text}</span>}
                            </>
                        );
                        const surface = cn(
                            'relative flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden',
                            classKind(classId) === 'pair' ? 'bg-surface-3' : 'bg-surface-1',
                        );
                        return (
                            <div role="gridcell" key={col} className="relative aspect-square" aria-label={interactive ? undefined : cell.title}>
                                {interactive ? (
                                    <button
                                        type="button"
                                        title={cell.title}
                                        aria-label={cell.title}
                                        aria-pressed={cell.fill > 0}
                                        data-class-id={classId}
                                        className={cn(surface, 'cursor-pointer focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-brand')}
                                        onPointerDown={(event) => {
                                            lastPointer.current = event.pointerType;
                                            if (event.pointerType === 'touch') return;
                                            event.preventDefault();
                                            stroke.current = new Set([classId]);
                                            onPaint?.(classId, true);
                                        }}
                                        onClick={(event) => {
                                            // A mouse or pen painted on press; a key (detail 0) or a tap paints here.
                                            if (event.detail === 0 || lastPointer.current === 'touch') onPaint?.(classId, true);
                                        }}
                                    >
                                        {face}
                                    </button>
                                ) : (
                                    <div title={cell.title} data-class-id={classId} className={surface}>{face}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export default HandGrid;
