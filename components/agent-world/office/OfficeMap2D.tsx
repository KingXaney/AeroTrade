import RatingBadge from "@/components/agent-world/RatingBadge";
import {ACTIVE_STATUSES, seatDot, seatEdge, shirtOf} from "@/components/agent-world/office/office-look";
import type {WorkerId} from "@/lib/agent-world/config";
import type {OfficeState} from "@/lib/agent-world/office";
import {FLOOR, FURNITURE, OFFICE_SEATS, OFFICE_ZONES, seatOf, shelfOf} from "@/lib/agent-world/office-layout";
import {WORKER_STATUS_COPY, ZONE_COPY, workerName} from "@/lib/learn/copy/agent-world-office";
import {cn} from "@/lib/utils";

// The office as a floor plan, for a browser without WebGL or ?engine=2d: the same room from above
// (lib/agent-world/office-layout), the same fourteen seats as buttons with their statuses and
// tasks, the shelves lit as the 3D wall lights them, a fetch in flight as a dashed line to its
// provider, the bubbles and the rating cards as chips. No motion of its own.

const W = 400;
const H = 240;
const x = (v: number) => ((v - FLOOR.minX) / (FLOOR.maxX - FLOOR.minX)) * W;
const z = (v: number) => ((v - FLOOR.minZ) / (FLOOR.maxZ - FLOOR.minZ)) * H;
const pctX = (v: number) => `${((v - FLOOR.minX) / (FLOOR.maxX - FLOOR.minX)) * 100}%`;
const pctZ = (v: number) => `${((v - FLOOR.minZ) / (FLOOR.maxZ - FLOOR.minZ)) * 100}%`;

const CARPET: Record<string, string> = {
    front: 'fill-[color:var(--office-desk-head)]',
    bullpen: 'fill-[color:var(--office-team-analysts)]',
    table: 'fill-[color:var(--office-team-research)]',
    trading: 'fill-[color:var(--office-team-trading)]',
    risk: 'fill-[color:var(--office-team-risk)]',
    corner: 'fill-[color:var(--office-team-portfolio)]',
    execution: 'fill-[color:var(--office-desk-execution)]',
};

type Props = {state: OfficeState; selected: WorkerId | null; onSelect: (id: WorkerId | null) => void; ratingTitle: string; note: string};

const OfficeMap2D = ({state, selected, onSelect, ratingTitle, note}: Props) => {
    const workers = new Map(state.workers.map((w) => [w.id, w]));
    const fetches = state.flows.filter((flow) => flow.kind === 'fetch');
    return (
        <div className="mx-auto w-full max-w-6xl p-3" data-office-map-wrap>
            <p className="mb-2 text-xs text-fg-muted">{note}</p>
            <div className="relative w-full" style={{aspectRatio: `${W} / ${H}`}}>
                <svg data-office-map viewBox={`0 0 ${W} ${H}`} role="group" aria-label={note} className="absolute inset-0 h-full w-full">
                    <rect x={0} y={0} width={W} height={H} rx={6} className="fill-[color:var(--office-floor)] stroke-[color:var(--office-wall-trim)]" strokeWidth={1.5} />
                    {OFFICE_ZONES.map((zone) => (
                        <g key={zone.id}>
                            <rect x={x(zone.bounds.minX) + 2} y={z(zone.bounds.minZ) + 2} width={x(zone.bounds.maxX) - x(zone.bounds.minX) - 4} height={z(zone.bounds.maxZ) - z(zone.bounds.minZ) - 4}
                                rx={4} className={cn(CARPET[zone.id], 'opacity-25')} />
                            <text x={x(zone.bounds.minX) + 6} y={z(zone.bounds.maxZ) - 6} className="fill-fg-muted font-mono text-[6px] uppercase">{ZONE_COPY[zone.id]}</text>
                        </g>
                    ))}
                    {FURNITURE.shelves.map((shelf) => {
                        const live = state.shelves.find((s) => s.vendor === shelf.vendor);
                        return (
                            <g key={shelf.vendor} data-office-map-shelf={shelf.vendor} data-hot={live?.hot ? 'true' : 'false'}>
                                <rect x={x(shelf.center[0] - shelf.width / 2)} y={z(shelf.center[2] - 0.3)} width={x(shelf.center[0] + shelf.width / 2) - x(shelf.center[0] - shelf.width / 2)} height={z(shelf.center[2] + 0.3) - z(shelf.center[2] - 0.3)}
                                    className={cn('fill-[color:var(--office-shelf)]', live?.refused ? 'stroke-warning' : live?.hot ? 'stroke-brand' : 'stroke-transparent')} strokeWidth={1.5} />
                                <text x={x(shelf.center[0])} y={z(shelf.center[2]) + 10} textAnchor="middle" className="fill-fg font-mono text-[5.5px]">{live?.label ?? shelf.vendor}{live?.tag ? ` · ${live.tag.note ?? ZONE_COPY.noAnswer}` : ''}</text>
                            </g>
                        );
                    })}
                    <circle cx={x(FURNITURE.table.center[0])} cy={z(FURNITURE.table.center[2])} r={(FURNITURE.table.radius / (FLOOR.maxX - FLOOR.minX)) * W} className="fill-[color:var(--office-wood-top)]" />
                    <rect x={x(FURNITURE.bench.center[0] - FURNITURE.bench.size[0] / 2)} y={z(FURNITURE.bench.center[2] - 0.4)} width={(FURNITURE.bench.size[0] / 40) * W} height={(0.8 / 24) * H} className="fill-[color:var(--office-wood-top)]" />
                    {OFFICE_SEATS.filter((seat) => seat.surface).map((seat) => {
                        const surface = seat.surface as NonNullable<typeof seat.surface>;
                        const [w, d] = surface.size;
                        const cz = seat.id === 'head-trader' ? surface.center[2] : seat.seat[2] + (seat.yaw === 0 ? 1 : -0.95);
                        return <rect key={seat.id} x={x(seat.seat[0] - w / 2)} y={z(cz - d / 2)} width={(w / 40) * W} height={(d / 24) * H} className="fill-[color:var(--office-wood-top)]" />;
                    })}
                    <circle cx={x(FURNITURE.chute.center[0])} cy={z(FURNITURE.chute.center[2])} r={5} className="fill-[color:var(--office-brass)]" />
                    <text x={x(FURNITURE.chute.center[0])} y={z(FURNITURE.chute.center[2]) + 13} textAnchor="middle" className="fill-fg-muted font-mono text-[5.5px]">{ZONE_COPY.chute}</text>
                    {fetches.map((flow) => {
                        const seat = seatOf(flow.role);
                        const shelf = shelfOf(flow.hops.at(-1)?.vendor ?? '');
                        if (!shelf) return null;
                        return <line key={flow.id} x1={x(seat.seat[0])} y1={z(seat.seat[2])} x2={x(shelf.center[0])} y2={z(shelf.center[2] + 0.3)} className="stroke-brand" strokeWidth={1} strokeDasharray="3 2" />;
                    })}
                </svg>
                {OFFICE_SEATS.map((seat) => {
                    const worker = workers.get(seat.id);
                    if (!worker) return null;
                    return (
                        <button key={seat.id} type="button" data-office-map-worker={seat.id} data-status={worker.status} data-team={shirtOf(seat.id)} aria-pressed={selected === seat.id}
                            onClick={() => onSelect(seat.id)}
                            title={worker.task}
                            className={cn('chrome-surface absolute w-max max-w-40 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg py-0.5 pl-2 pr-1.5 text-left focus-visible:outline-2 focus-visible:outline-brand',
                                selected === seat.id && 'outline outline-2 outline-brand')}
                            style={{left: pctX(seat.seat[0]), top: pctZ(seat.seat[2])}}>
                            <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', seatEdge(seat.id))} />
                            <span className="flex items-center gap-1 text-[10px] leading-tight">
                                <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', seatDot(worker.status), ACTIVE_STATUSES.has(worker.status) && 'ao-lamp')} />
                                <span className="truncate font-medium text-fg">{workerName(seat.id)}</span>
                            </span>
                            <span className="block truncate text-[9px] leading-tight text-fg-muted">{WORKER_STATUS_COPY[worker.status]}</span>
                            {worker.bubble && <span className="block truncate text-[9px] italic leading-tight text-fg-soft">“{worker.bubble}”</span>}
                        </button>
                    );
                })}
                <div className="absolute flex flex-wrap gap-1" style={{left: pctX(FURNITURE.corkboard.center[0] - 1.6), top: pctZ(-11.6)}}>
                    {state.ratings.map((rating) => rating.rating === null ? null : (
                        <span key={rating.symbol} data-office-card={rating.symbol} data-rating={rating.rating} className="chrome-surface flex items-center gap-1 rounded px-1 py-0.5 text-[9px]">
                            <span className="font-mono text-fg">{rating.symbol}</span>
                            <RatingBadge rating={rating.rating} title={ratingTitle} />
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OfficeMap2D;
