// The office's class maps, shared by the stage, the floor plan and the roster: each seat's shirt
// (its team's, or its desk's), the edge colour a nameplate carries for it, and the dot a status
// shows. Token classes only (invariant 5); the shirts are the `--office-*` material tokens.

import type {WorkerId, WorkerStatus} from "@/lib/agent-world/config";

export const SHIRTS = ['analysts', 'research', 'trading', 'risk', 'portfolio', 'head', 'execution'] as const;
export type Shirt = (typeof SHIRTS)[number];

const SEAT_SHIRT: Record<WorkerId, Shirt> = {
    'head-trader': 'head',
    'market': 'analysts', 'sentiment': 'analysts', 'news': 'analysts', 'fundamentals': 'analysts',
    'bull': 'research', 'bear': 'research', 'research-manager': 'research',
    'trader': 'trading',
    'risk-aggressive': 'risk', 'risk-conservative': 'risk', 'risk-neutral': 'risk',
    'portfolio-manager': 'portfolio',
    'execution-desk': 'execution',
};
export const shirtOf = (id: WorkerId): Shirt => SEAT_SHIRT[id];

const EDGE: Record<Shirt, string> = {
    analysts: 'bg-[color:var(--office-team-analysts)]',
    research: 'bg-[color:var(--office-team-research)]',
    trading: 'bg-[color:var(--office-team-trading)]',
    risk: 'bg-[color:var(--office-team-risk)]',
    portfolio: 'bg-[color:var(--office-team-portfolio)]',
    head: 'bg-[color:var(--office-desk-head)]',
    execution: 'bg-[color:var(--office-desk-execution)]',
};
export const seatEdge = (id: WorkerId): string => EDGE[SEAT_SHIRT[id]];

const DOT: Record<WorkerStatus, string> = {
    idle: 'bg-line-strong/50',
    waiting: 'bg-line-strong',
    fetching: 'bg-brand',
    working: 'bg-brand',
    talking: 'bg-brand',
    filed: 'bg-brand',
    done: 'bg-brand/45',
    stopped: 'bg-warning',
};
export const seatDot = (status: WorkerStatus): string => DOT[status];

// The statuses a seat is at it in: its dot breathes (.ao-lamp, in both motion guards).
export const ACTIVE_STATUSES: ReadonlySet<WorkerStatus> = new Set(['working', 'fetching', 'talking']);
