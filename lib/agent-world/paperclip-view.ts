// The pure side of the Paperclip company: which agent plays which role, the approval stage a session
// asks for, the org chart as a tree, a budget's share, and every text the session writes into the
// company. Client-safe (type imports only); the words are lib/learn/copy/agent-world-paperclip.

import {PAPERCLIP_DESKS, ROLES, type ApprovalMode, type PaperclipAgentKey, type SessionKind} from "@/lib/agent-world/config";
import type {ExecutionPolicy, PaperclipAgent} from "@/lib/agent-world/paperclip";
import type {SessionFill} from "@/lib/agent-world/types";
import {PAPERCLIP_COPY} from "@/lib/learn/copy/agent-world-paperclip";

const nameKey = (name: string): string => name.trim().toLowerCase();

// The agent name each key goes by in the company (config's ROLES[].paperclip, PAPERCLIP_DESKS).
const NAMES: readonly (readonly [PaperclipAgentKey, string])[] = [
    ...(Object.entries(PAPERCLIP_DESKS) as [PaperclipAgentKey, string][]),
    ...ROLES.map((role) => [role.id, role.paperclip] as const),
];

// The company's agents by key. A pinned id (AGENT_WORLD_PAPERCLIP_AGENT_IDS) always wins; the rest
// are matched by name, ignoring case, and a terminated agent is never matched: a replacement hired
// under the same name is the one that answers.
export const agentIdsByName = (
    agents: readonly PaperclipAgent[],
    pinned: Partial<Record<PaperclipAgentKey, string>> = {},
): Partial<Record<PaperclipAgentKey, string>> => {
    const byName = new Map<string, string>();
    for (const agent of agents) {
        if (agent.status === 'terminated') continue;
        const key = nameKey(agent.name);
        if (!byName.has(key)) byName.set(key, agent.id);
    }
    const out: Partial<Record<PaperclipAgentKey, string>> = {};
    for (const [key, name] of NAMES) {
        const id = pinned[key] ?? byName.get(nameKey(name));
        if (id) out[key] = id;
    }
    return out;
};

// Owner approval holds the session's issue in one approval stage whose only participant is the
// Execution desk, the owner's hand on the page; auto mode, or a company without the desk, opens the
// issue with no stage at all.
export const executionPolicyFor = (mode: ApprovalMode, executionDeskId: string | null): ExecutionPolicy | null =>
    mode === 'auto' || !executionDeskId
        ? null
        : {mode: 'normal', commentRequired: true, stages: [{type: 'approval', approvalsNeeded: 1, participants: [{type: 'agent', agentId: executionDeskId}]}]};

export type OrgNode = {agent: PaperclipAgent; depth: number; children: OrgNode[]};

const byName = (a: PaperclipAgent, b: PaperclipAgent): number => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);

// The reporting tree, every level sorted by name. An agent whose manager is not in the list, or
// whose chain of managers comes back to itself, is drawn as a root, so every agent appears once.
export const orgTree = (agents: readonly PaperclipAgent[]): OrgNode[] => {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const onCycle = (agent: PaperclipAgent): boolean => {
        const seen = new Set<string>();
        let at: string | null = agent.reportsTo;
        while (at !== null && byId.has(at) && !seen.has(at)) {
            if (at === agent.id) return true;
            seen.add(at);
            at = byId.get(at)?.reportsTo ?? null;
        }
        return false;
    };
    const managerOf = (agent: PaperclipAgent): string | null =>
        agent.reportsTo !== null && byId.has(agent.reportsTo) && !onCycle(agent) ? agent.reportsTo : null;
    const reports = new Map<string | null, PaperclipAgent[]>();
    for (const agent of byId.values()) {
        const manager = managerOf(agent);
        reports.set(manager, [...(reports.get(manager) ?? []), agent]);
    }
    const build = (agent: PaperclipAgent, depth: number): OrgNode => ({
        agent,
        depth,
        children: [...(reports.get(agent.id) ?? [])].sort(byName).map((child) => build(child, depth + 1)),
    });
    return [...(reports.get(null) ?? [])].sort(byName).map((root) => build(root, 0));
};

// How much of a monthly budget is spent, as a fraction (over 1 past the cap); null for no cap.
export const budgetShare = (spent: number, cap: number): number | null =>
    Number.isFinite(cap) && cap > 0 && Number.isFinite(spent) ? Math.max(0, spent) / cap : null;

// The board's page for an issue: Paperclip's UI routes an issue under its company's prefix, which is
// the identifier's own (TRA-12 lives at /TRA/issues/TRA-12).
export const issueBoardUrl = (boardUrl: string, identifier: string): string => {
    const prefix = identifier.split('-')[0] ?? identifier;
    return `${boardUrl.replace(/\/+$/, '')}/${encodeURIComponent(prefix)}/issues/${encodeURIComponent(identifier)}`;
};

export const issueTitle = ({kind, weekKey, today, symbols}: {kind: SessionKind; weekKey: string; today: string; symbols: readonly string[]}): string =>
    kind === 'weekly'
        ? PAPERCLIP_COPY.weeklyTitle(weekKey, symbols.length)
        : kind === 'manual'
          ? PAPERCLIP_COPY.manualTitle(today, symbols.length)
          : PAPERCLIP_COPY.previewTitle(today, symbols.length);

export const issueDescription = ({sessionId, symbols, approval}: {sessionId: string; symbols: readonly string[]; approval: ApprovalMode}): string =>
    [
        PAPERCLIP_COPY.descriptionLead(sessionId, PAPERCLIP_COPY.list(symbols)),
        approval === 'owner' ? PAPERCLIP_COPY.descriptionOwner : PAPERCLIP_COPY.descriptionAuto,
        PAPERCLIP_COPY.descriptionCosts,
        PAPERCLIP_COPY.descriptionCaveat,
    ].join('\n\n');

// The comment the Execution desk's decision carries: Paperclip records a stage decision only with a
// comment in the same request, so it names who decided. 'auto' is the job's own approval.
export const decisionComment = (decision: 'approved' | 'declined', by: string): string => {
    const who = by.trim();
    if (decision === 'approved') return who === '' || who === 'auto' ? PAPERCLIP_COPY.approvedAuto : PAPERCLIP_COPY.approvedBy(who);
    return who === '' ? PAPERCLIP_COPY.declinedUnnamed : PAPERCLIP_COPY.declinedBy(who);
};

const MESSAGE_CHARS = 200;
const oneLine = (text: string | null | undefined, max = MESSAGE_CHARS): string | null => {
    const flat = (text ?? '').replace(/\s+/g, ' ').trim();
    if (flat === '') return null;
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

const money = (price: number | null): string | null =>
    price !== null && Number.isFinite(price) && price > 0 ? `$${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : null;

// What reached the paper account: the fills in one sentence, the orders that did not fill in another.
export const fillsComment = (fills: readonly SessionFill[]): string => {
    const done = fills.filter((fill) => fill.executed);
    const missed = fills.filter((fill) => !fill.executed);
    const parts: string[] = [];
    if (done.length > 0) {
        parts.push(PAPERCLIP_COPY.filled(PAPERCLIP_COPY.list(done.map((fill) => PAPERCLIP_COPY.fillLine(fill.side === 'sell', fill.quantity, fill.symbol, money(fill.price))))));
    } else {
        parts.push(PAPERCLIP_COPY.noFills);
    }
    if (missed.length > 0) {
        parts.push(PAPERCLIP_COPY.missed(missed.length, missed.map((fill) => PAPERCLIP_COPY.missedLine(fill.symbol, fill.side === 'sell', fill.quantity, oneLine(fill.message))).join('; ')));
    }
    return parts.join(' ');
};

export const blockedComment = (message: string): string => {
    const why = oneLine(message);
    return why === null ? PAPERCLIP_COPY.blockedUnexplained : PAPERCLIP_COPY.blocked(why);
};

export const lapsedComment = (): string => PAPERCLIP_COPY.lapsed;

export const noOrdersComment = (): string => PAPERCLIP_COPY.noOrders;
