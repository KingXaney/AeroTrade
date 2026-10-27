// The session's side of the Paperclip company, best-effort throughout: the role agents' ids, the
// session's issue (assigned to the Head trader, held for the Execution desk's approval when the
// owner decides), and what the job and the owner's actions tell it. Nothing here throws or blocks:
// a company that cannot be reached leaves a note on the session, and Mongo's record stands.

import {PAPERCLIP_DESKS, type ApprovalMode, type PaperclipAgentKey, type SessionKind} from "@/lib/agent-world/config";
import {paperclipAgentIdsFromEnv, paperclipSettings, type AgentWorldEnv} from "@/lib/agent-world/env";
import {createPaperclipClient} from "@/lib/agent-world/paperclip";
import {
    agentIdsByName,
    blockedComment,
    decisionComment,
    executionPolicyFor,
    fillsComment,
    issueBoardUrl,
    issueDescription,
    issueTitle,
    lapsedComment,
    noOrdersComment,
} from "@/lib/agent-world/paperclip-view";
import {setPaperclip} from "@/lib/agent-world/store";
import type {SessionFill} from "@/lib/agent-world/types";

const client = () => createPaperclipClient(paperclipSettings());

// The company's agents by role (the pinned ids of AGENT_WORLD_PAPERCLIP_AGENT_IDS first, the rest by
// name), or none with the reason when the company cannot be read.
export const paperclipAgentIds = async (): Promise<{ids: Partial<Record<PaperclipAgentKey, string>>; note: string | null}> => {
    const pinned = paperclipAgentIdsFromEnv();
    const agents = await client().agents();
    if (!agents.ok) return {ids: pinned, note: `agents: ${agents.reason} ${agents.message}`.trim()};
    return {ids: agentIdsByName(agents.data, pinned), note: null};
};

// The session's issue, assigned to the Head trader; under owner approval its execution policy holds
// it for the Execution desk, which is the owner's hand on the page. Recorded on the session.
export const openSessionIssue = async (env: AgentWorldEnv, session: {
    sessionId: string;
    kind: SessionKind;
    weekKey: string;
    today: string;
    symbols: readonly string[];
    approval: ApprovalMode;
    agentIds: Partial<Record<PaperclipAgentKey, string>>;
}): Promise<{issueId: string | null}> => {
    const headTrader = session.agentIds['head-trader'] ?? null;
    if (!headTrader) {
        await setPaperclip(env, session.sessionId, {note: `no ${PAPERCLIP_DESKS['head-trader']} agent found in the company`});
        return {issueId: null};
    }
    const created = await client().createIssue({
        title: issueTitle({kind: session.kind, weekKey: session.weekKey, today: session.today, symbols: session.symbols}),
        description: issueDescription({sessionId: session.sessionId, symbols: session.symbols, approval: session.approval}),
        assigneeAgentId: headTrader,
        executionPolicy: executionPolicyFor(session.approval, session.agentIds['execution-desk'] ?? null),
        // A retried step answers the issue it already made.
        idempotencyKey: session.sessionId,
    });
    if (!created.ok) {
        await setPaperclip(env, session.sessionId, {note: `issue not opened: ${created.reason} ${created.message}`.trim()});
        return {issueId: null};
    }
    const settings = paperclipSettings();
    await setPaperclip(env, session.sessionId, {
        issueId: created.data.id,
        identifier: created.data.identifier,
        url: settings && created.data.identifier ? issueBoardUrl(settings.boardUrl, created.data.identifier) : null,
        note: null,
    });
    return {issueId: created.data.id};
};

// The owner's decision as the Execution desk's, on the issue's approval stage (approved closes it;
// declined sends it back to the Head trader). Whether it landed is recorded; it never blocks.
export const mirrorDecision = async (env: AgentWorldEnv, sessionId: string, issueId: string | null, decision: 'approved' | 'declined', by: string): Promise<boolean | null> => {
    if (!issueId || paperclipSettings() === null) return null;
    const result = await client().decide(issueId, decision, decisionComment(decision, by));
    await setPaperclip(env, sessionId, {mirrored: result.ok, note: result.ok ? null : `decision not recorded: ${result.reason} ${result.message}`.trim()});
    return result.ok;
};

const comment = async (issueId: string | null, body: string): Promise<boolean> => {
    if (!issueId || paperclipSettings() === null) return false;
    return (await client().comment(issueId, body)).ok;
};

export const issueOnFills = (issueId: string | null, fills: readonly SessionFill[]): Promise<boolean> => comment(issueId, fillsComment(fills));

export const issueOnLapse = (issueId: string | null): Promise<boolean> => comment(issueId, lapsedComment());

export const issueOnFailure = async (issueId: string | null, message: string): Promise<boolean> => {
    if (!issueId || paperclipSettings() === null) return false;
    return (await client().setStatus(issueId, 'blocked', blockedComment(message))).ok;
};

// No order to decide on: under owner approval the Execution desk closes the stage itself, saying why.
export const issueNoOrders = async (issueId: string | null, mode: ApprovalMode): Promise<boolean> => {
    if (!issueId || paperclipSettings() === null) return false;
    return mode === 'owner'
        ? (await client().decide(issueId, 'approved', noOrdersComment())).ok
        : comment(issueId, noOrdersComment());
};
